"""Real Chromium qualification: target entry -> attack/save -> physical dice -> approved damage -> undo."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright
from browser_support import launch_chromium
ROOT=Path(__file__).resolve().parents[1]
hero={'schema_version':1,'system_id':'dnd5e','system_edition':'dnd-2014','name':'Synthetic Duelist','class_level':'Fighter 5',
 'species':'Human','background':'','hp':{'current':25,'max':35,'temp':0},'ac':17,'initiative':1,'proficiency':3,'speed':'30 ft.',
 'abilities':{'STR':{'score':18,'modifier':4}},'saves':{'Constitution':3,'Strength':7},'skills':{'Athletics':7},
 'attacks':[{'name':'Flame Sword','bonus':7,'damage':'1d8+4 Fire'}],
 'inventory':[],'conditions':[],'features':[],'actions':[],'roll_history':[],'effects':{},'spells':[],'resources':{}}
with sync_playwright() as playwright:
 b=launch_chromium(playwright)
 page=b.new_page(viewport={'width':1440,'height':900});errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content((ROOT/'web/index.html').read_text(),wait_until='domcontentloaded')
 page.add_style_tag(content=(ROOT/'web/styles.css').read_text())
 catalog=json.loads((ROOT/'web/dnd-2014-reference.json').read_text())
 page.evaluate('''([hero,cat])=>{
  window.__testVault={schema_version:1,active_id:'hero',characters:[{id:'hero',character:hero,updated_at:'2026'}]};
  window.fetch=async(url,init={})=>{
   if(url==='/api/vault'){
    if(init.method==='POST'){window.__testVault=JSON.parse(init.body);return new Response('{"saved":true}',{status:200});}
    return new Response(JSON.stringify(window.__testVault),{status:200});
   }
   if(url==='./theme-assets.json')return new Response('{"version":1,"assets":{}}',{status:200});
   if(url==='./dnd-2014-reference.json')return new Response(JSON.stringify(cat),{status:200});
   return new Response('{}',{status:404});
  };
 }''',[hero,catalog])
 for filename in ['dnd-slots.js','character-import.js','vault-store.js','dnd-action.js','reference-catalog.js','browser-pdf.js','dice-physics.js','app.js']:
  page.add_script_tag(content=(ROOT/'web'/filename).read_text())
 page.wait_for_function("document.querySelector('.page-title')?.textContent==='Synthetic Duelist'")
 page.locator('.encounter-targets > summary').click() if page.locator('.encounter-targets').get_attribute('open') is None else None
 new=page.locator('#target-add-form')
 new.locator('[name=name]').fill('Training Golem')
 new.locator('[name=ac]').fill('16')
 new.locator('[name=hp]').fill('48')
 new.get_by_role('button',name='Add target').click()
 assert page.evaluate('Action.targets(character).length')==1
 assert page.evaluate('selectedTargetId')=='target-1'
 assert page.evaluate('Action.targetById(character,"target-1").hp.current')==48
 page.locator('.encounter-targets > summary').click() if page.locator('.encounter-targets').get_attribute('open') is None else None
 page.locator('[data-target-trait="resistances"]').fill('fire')
 page.locator('[data-target-trait="resistances"]').dispatch_event('change')
 assert page.evaluate('Action.targetTraits(character,"target-1").resistances[0]')=='fire'
 # This scenario explicitly exercises manual attack→damage handling.
 page.evaluate("Action.setCombatMode(character, 'manual')")
 # Hit evaluation uses an actual completed simulated roll; it never modifies HP.
 page.locator('.attack-list [data-action=attack]').first.click()
 page.evaluate('''()=>{beginThrow();for(const g of activeRolls)for(const d of dice.filter(x=>g.diceIds.includes(x.id)))d.sleeping=true;finishRollIfSettled();}''')
 outcome=page.evaluate('lastResult.outcome')
 assert outcome in ('HIT','MISS','CRITICAL HIT')
 critical=outcome=='CRITICAL HIT'
 assert page.evaluate('character.effects.targets[0].hp.current')==48
 page.locator('.attack-list [data-action=damage]').first.click()
 assert page.evaluate('pendingRoll.expression')==('2d8+4' if critical else '1d8+4'), (outcome,page.evaluate('pendingRoll.expression'))
 page.evaluate('''()=>{beginThrow();for(const g of activeRolls)for(const d of dice.filter(x=>g.diceIds.includes(x.id)))d.sleeping=true;finishRollIfSettled();}''')
 assert page.evaluate('pendingDamage.length')==1
 assert page.evaluate('pendingDamage[0].type')=='fire'
 assert page.evaluate('character.effects.targets[0].hp.current')==48
 roll_amount=page.evaluate('pendingDamage[0].amount')
 assert (6<=roll_amount<=20) if critical else (5<=roll_amount<=12)
 if not page.locator('#dice-widget').get_attribute('open'):
  page.locator('#dice-widget > summary').click()
 # The test qualifies damage planning, not pointer hit-testing of a floating panel.
 # Dispatch a deterministic DOM click while the physical tabletop remains active.
 page.locator('#roll-effect [data-action="apply-target-damage"]').evaluate('(el)=>el.click()')
 page.wait_for_function('document.querySelector("#dlg-yes") !== null')
 assert 'Apply rolled damage?' in page.locator('#dialog-layer').inner_text()
 page.locator('#dlg-yes').click()
 assert page.evaluate('character.effects.targets[0].hp.current')==48-roll_amount//2
 page.locator('.encounter-targets > summary').click() if page.locator('.encounter-targets').get_attribute('open') is None else None
 page.get_by_role('button',name='Undo last damage').click()
 assert page.evaluate('character.effects.targets[0].hp.current')==48
 # Saving throws are independent rolls; they report but do not silently damage a creature.
 page.locator('.encounter-targets > summary').click() if page.locator('.encounter-targets').get_attribute('open') is None else None
 page.locator('#target-save-ability').select_option('CON')
 page.locator('#target-save-dc').fill('17')
 page.get_by_role('button',name='Roll target save').click()
 page.evaluate('''()=>{beginThrow();for(const g of activeRolls)for(const d of dice.filter(x=>g.diceIds.includes(x.id)))d.sleeping=true;finishRollIfSettled();}''')
 assert page.evaluate('lastSaveOutcome.dc')==17
 assert page.evaluate('character.effects.targets[0].hp.current')==48
 page.locator('.encounter-targets > summary').click() if page.locator('.encounter-targets').get_attribute('open') is None else None
 page.locator('#target-manual-damage').fill('12')
 page.get_by_role('button',name='Preview damage').click()
 assert 'Training Golem' in page.locator('#dialog-layer').inner_text()
 page.locator('#dlg-no').click()
 assert page.evaluate('character.effects.targets[0].hp.current')==48
 page.set_viewport_size({'width':390,'height':844})
 page.wait_for_timeout(100)
 assert page.evaluate('document.documentElement.scrollWidth')<=400,'Horizontal overflow in narrow layout'
 assert not errors,errors
 b.close()
 print('PASS browser encounter targets, typed attack/damage, mitigation, explicit apply, undo, save checks, responsive UI')
