"""The three explicit 2014 SRD profiles operate through real sheet controls."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright
from browser_support import launch_chromium
ROOT=Path(__file__).resolve().parents[1]
hero={'schema_version':1,'system_id':'dnd5e','system_edition':'dnd-2014','name':'Synthetic Cleric','player':'QA','class_level':'Cleric 5','species':'Human','background':'',
'hp':{'current':10,'max':35,'temp':0},'ac':17,'initiative':1,'proficiency':3,'speed':'30 ft.',
'abilities':{'WIS':{'score':18,'modifier':4}},'saves':{'Constitution':5},'skills':{'Medicine':7},'attacks':[],'inventory':[],'conditions':[],'features':[],'actions':[],'roll_history':[],'effects':{},
'resources':{'Level 1 Spell Slots':{'current':4,'max':4,'reset':'long rest'},'Level 2 Spell Slots':{'current':2,'max':2,'reset':'long rest'}},
'spells':[{'id':'cure','name':'Cure Wounds','level':1,'source':'Cleric','prepared':True,'casting_time':'1 action','duration':'Instantaneous'},
{'id':'faith','name':'Shield of Faith','level':1,'source':'Cleric','prepared':True,'casting_time':'1 bonus action','duration':'Concentration, up to 10 minutes'},
{'id':'guidance','name':'Guidance','level':0,'source':'Cleric','casting_time':'1 action','duration':'Concentration, up to 1 minute'}]}
with sync_playwright() as p:
 b=launch_chromium(p)
 page=b.new_page(viewport={'width':1440,'height':900});errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content((ROOT/'web/index.html').read_text(),wait_until='domcontentloaded')
 page.add_style_tag(content=(ROOT/'web/styles.css').read_text())
 cat=json.loads((ROOT/'web/dnd-2014-reference.json').read_text())
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
 }''',[hero,cat])
 for filename in ['dnd-slots.js','character-import.js','vault-store.js','dnd-action.js','reference-catalog.js','browser-pdf.js','dice-physics.js','app.js']:
  page.add_script_tag(content=(ROOT/'web'/filename).read_text())
 page.wait_for_function("document.querySelector('.page-title')?.textContent==='Synthetic Cleric' && ReferenceCatalog.ready()")
 page.get_by_role('tab',name='Spells').click()
 def spell(name):return page.locator('.spell-entry').filter(has_text=name)
 cure=spell('Cure Wounds');cure.locator('summary').click()
 cure.get_by_role('button',name='Enable 2014 effect').click();page.locator('#dlg-yes').click()
 assert page.evaluate('character.spells[0].automation')=='srd-2014'
 cure.locator('[data-slot-choice]').select_option('2')
 cure.get_by_role('button',name='Cast spell').click()
 assert '2d8+4' in page.locator('#dialog-layer').inner_text()
 page.locator('#dlg-yes').click()
 assert page.evaluate('character.resources["Level 2 Spell Slots"].current')==1
 assert page.evaluate('pendingRoll.expression')=='2d8+4'
 page.evaluate('''()=>{beginThrow();for(const die of dice.filter(d=>activeRoll.diceIds.includes(d.id)))die.sleeping=true;finishRollIfSettled();}''')
 page.locator('#dice-widget > summary').click()
 assert page.locator('#roll-effect').get_by_role('button',name='Apply to HP').is_visible()
 total=page.evaluate('lastResult.total')
 page.locator('#roll-effect').get_by_role('button',name='Apply to HP').click()
 assert page.evaluate('character.hp.current')==min(35,10+total)
 page.locator('#dice-widget > summary').click()
 faith=spell('Shield of Faith');faith.locator('summary').click()
 faith.get_by_role('button',name='Enable 2014 effect').click();page.locator('#dlg-yes').click()
 faith.get_by_role('button',name='Cast spell').click();assert 'AC +2' in page.locator('#dialog-layer').inner_text()
 page.locator('#dlg-yes').click()
 assert page.evaluate('character.ac')==17
 assert page.evaluate('Action.effectiveAC(character)')==19
 assert 'Shield of Faith' in page.locator('.buff-bar').inner_text()
 page.get_by_role('tab',name='Spells').click()
 guide=spell('Guidance');guide.locator('summary').click()
 guide.get_by_role('button',name='Enable 2014 effect').click();page.locator('#dlg-yes').click()
 guide.get_by_role('button',name='Cast spell').click();page.locator('#dlg-yes').click()
 assert page.evaluate('Action.effectiveAC(character)')==17
 assert page.evaluate('character.effects.active[0].charges')==1
 # The same hover/card owner explains the configured effect; no extra effect store.
 assert page.locator('.buff-token .status-info').count()==1
 info=page.locator('.buff-token .status-info').first
 snapshot=page.evaluate('JSON.stringify(character)')
 info.evaluate('(el)=>el.click()')
 assert page.locator('#hud-tooltip.is-pinned').is_visible()
 assert 'Roll bonus: 1d4' in page.locator('#hud-tooltip').inner_text()
 assert 'Remaining charges: 1' in page.locator('#hud-tooltip').inner_text()
 assert page.evaluate('JSON.stringify(character)')==snapshot
 page.keyboard.press('Escape')
 assert page.locator('#hud-tooltip').is_hidden()
 auto=page.locator('.buff-token').filter(has_text='Guidance').get_by_role('checkbox',name='Automatically use Guidance')
 assert auto.is_checked()
 # Untyped rolls and saves never consume Guidance.
 assert page.evaluate("queueRoll('1d20+5','test saving throw')")
 assert page.evaluate('pendingRoll.bonuses.length')==0
 assert page.evaluate('character.effects.active[0].charges')==1
 # Pausing preserves the charge and makes skill checks normal.
 auto.focus();page.keyboard.press("Space")
 assert page.evaluate("character.effects.active[0].auto_use") is False
 page.get_by_role('tab',name='Actions').click()
 page.get_by_role('button',name='Medicine',exact=False).focus();page.keyboard.press('Enter')
 assert page.evaluate('pendingRoll.bonuses.length')==0
 auto=page.get_by_role('checkbox',name='Automatically use Guidance')
 auto.focus();page.keyboard.press("Space")
 assert page.evaluate("character.effects.active[0].auto_use") is True
 page.get_by_role('button',name='Medicine',exact=False).focus();page.keyboard.press('Enter')
 assert page.evaluate('pendingRoll.bonuses[0].expression')=='1d4'
 assert page.evaluate('pendingRoll.count')==2
 assert page.evaluate('pendingRoll.primaryCount')==1
 assert page.evaluate('character.effects.active[0].charges')==1,'Charge must spend only after roll settles'
 page.evaluate('''()=>{beginThrow();for(const die of dice.filter(d=>activeRoll.diceIds.includes(d.id)))die.sleeping=true;finishRollIfSettled();}''')
 assert page.evaluate('lastResult.bonuses[0].name')=='Guidance'
 assert page.evaluate('lastResult.total === lastResult.baseTotal + lastResult.bonuses[0].total')
 assert page.evaluate('character.effects.active.length')==0
 # Verify concentration damage prompts and manual roll availability.
 page.get_by_role('tab',name='Spells').click()
 faith=spell('Shield of Faith')
 faith.get_by_role('button',name='Cast spell').click();page.locator('#dlg-yes').click()
 page.locator('#hp-amount').fill('24')
 page.get_by_role('button',name='− Damage').click()
 assert 'DC 12' in page.locator('.buff-bar').inner_text()
 assert page.evaluate('character.effects.pending_concentration.length')==1
 page.locator('.buff-check').get_by_role('button',name='Roll CON save').click()
 assert page.evaluate('pendingRoll.expression')=='1d20+5'
 # Long rest uses the same end-effect path, preserving manually tracked conditions.
 page.evaluate("()=>{character.conditions.push('Poisoned');Action.startEffect(character,{kind:'ability',sourceId:'rest-qa',name:'QA Condition',condition:'Invisible',durationRounds:2});}")
 assert page.evaluate("character.conditions.includes('Invisible')")
 page.keyboard.press('Escape')  # release cursor-follow capture before clicking sheet controls
 page.get_by_role('button',name='Long rest').click()
 page.locator('#dlg-yes').click()
 assert page.evaluate('character.effects.active.length')==0
 assert page.evaluate('character.effects.pending_concentration.length')==0
 assert page.evaluate("!character.conditions.includes('Invisible') && character.conditions.includes('Poisoned')")
 assert page.evaluate('character.hp.current')==35
 # The previously duplicated conditions panel is now only a compact Effects
 # icon plus a collapsible manual picker. It still writes via setTargetCondition.
 assert page.locator('.buff-bar .condition-status').count()==1
 assert page.locator('.buff-bar .debuff-token').count()==0
 assert page.locator('.hud-resources .condition-rail').count()==0
 assert page.locator('.condition-picker').count()==1
 assert page.evaluate("ReferenceCatalog.list('condition').length")==15
 assert page.evaluate("ReferenceCatalog.list().length")==261
 condition=page.locator('.buff-bar .condition-status[aria-label^="Poisoned"]')
 snap=page.evaluate('JSON.stringify(character)')
 condition.focus()
 tooltip=page.locator('#hud-tooltip')
 assert tooltip.is_visible()
 assert 'disadvantage' in tooltip.inner_text()
 assert 'SRD 5.1 (2014)' in tooltip.inner_text()
 assert page.evaluate('JSON.stringify(character)')==snap
 condition.evaluate('(el)=>el.click()')
 assert page.locator('#hud-tooltip.is-pinned').is_visible()
 page.keyboard.press('Escape')
 assert tooltip.is_hidden()
 # Browser-native title hints are migrated to the same immediate tip.
 hp_edit=page.locator('.vital-edit > summary')
 hp_edit.focus()
 assert tooltip.is_visible()
 assert 'Adjust HP totals' in tooltip.inner_text()
 assert hp_edit.get_attribute('title') is None
 page.keyboard.press('Escape')
 page.locator('.condition-picker > summary').evaluate('(el)=>el.click()')
 assert page.locator('.condition-picker .condition-toggle').count()==15
 page.locator(".condition-toggle[data-arg='Blinded']").evaluate('(el)=>el.click()')
 assert page.evaluate("character.conditions.includes('Blinded')")
 assert page.locator('.condition-picker').get_attribute('open') is not None
 assert page.locator('.buff-bar .condition-status').count()==2
 page.locator(".condition-toggle[data-arg='Blinded']").evaluate('(el)=>el.click()')
 assert not page.evaluate("character.conditions.includes('Blinded')")
 # Provenance remains in independent source grants, not the status chip.
 page.evaluate("""()=>{Action.grantCondition(character,'self','Frightened',{sourceId:'qa:fright',expiration:'manual'});render();}""")
 frightened=page.locator('.condition-status[aria-label^="Frightened"]')
 frightened.focus()
 assert '1 tracked source' in tooltip.inner_text()
 assert page.evaluate("Action.conditionGrants(character,'self').length")==1
 page.keyboard.press('Escape')
 # Untrusted effect labels stay literal text inside the shared card.
 page.evaluate("""()=>{Action.startEffect(character,{kind:'ability',sourceId:'markup',name:'<img src=x onerror=alert(1)>',durationRounds:1});render();}""")
 assert page.locator('.buff-token img').count()==0
 page.locator('.buff-token .status-info').last.evaluate('(el)=>el.click()')
 assert page.locator('#hud-tooltip img').count()==0
 assert '<img src=x onerror=alert(1)>' in tooltip.inner_text()
 page.keyboard.press('Escape')
 page.evaluate("()=>{Action.endEffect(character,'ability:markup');character.system_edition='dnd-2024';render();}")
 page.locator('.buff-bar .condition-status[aria-label^="Poisoned"]').focus()
 assert 'No matching 2014 reference description' in tooltip.inner_text()
 assert 'SRD 5.1 (2014)' not in tooltip.inner_text()
 page.keyboard.press('Escape')
 assert not errors,errors
 page.set_viewport_size({'width':390,'height':844})
 page.wait_for_timeout(100)
 assert page.evaluate('document.documentElement.scrollWidth')<=400,'Mobile horizontal document overflow'
 b.close()
 print('PASS browser 2014 effects, concentration, one hover card, active condition icons, 15-entry picker, source grants, edition guard, XSS and mobile')
