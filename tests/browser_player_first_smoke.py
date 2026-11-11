"""Player-first browser contract: roll, conditions, personal turns, and Self/Other."""
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_support import launch_chromium

ROOT=Path(__file__).resolve().parents[1]
hero={
 'schema_version':1,'system_id':'dnd5e','system_edition':'dnd-2014',
 'name':'Player Sheet QA','class_level':'Cleric 5','species':'Human','background':'',
 'hp':{'current':12,'max':30,'temp':0},'ac':16,'initiative':2,'proficiency':3,'speed':'30 ft',
 'abilities':{'STR':{'score':16,'modifier':3}},'saves':{'Strength':3},'skills':{'Athletics':6},
 'attacks':[{'id':'sword','name':'Sword','bonus':6,'damage':'1d8+3 slashing','attack_type':'weapon'}],
 'inventory':[],'conditions':[],'features':[],'roll_history':[],'effects':{},
 'resources':{'Ki':{'current':3,'max':3,'reset':'short rest'}},
 'actions':[{'id':'blast','name':'Magic Blast','activation':'1 action','roll':'1d6+1',
             'damage':'1d6+1','effect_kind':'damage','source':'manual'}],
 'spells':[{'id':'touch','name':'Aid Touch','level':0,'prepared':True,'source':'manual',
            'roll':'1d6+2','effect_kind':'heal','casting_time':'1 action'}]
}
def settle(page):
 page.evaluate("""()=>{
  beginThrow();for(const d of dice.filter(d=>activeRoll?.diceIds.includes(d.id))){d.sleeping=true;d.rolling=false;}
  finishRollIfSettled();
 }""")
with sync_playwright() as pw:
 browser=launch_chromium(pw)
 page=browser.new_page(viewport={'width':1400,'height':900});page.set_default_timeout(7500)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content((ROOT/'web/index.html').read_text(),wait_until='domcontentloaded')
 page.add_style_tag(content=(ROOT/'web/styles.css').read_text())
 page.evaluate("""c=>{
  window.testVault={schema_version:1,active_id:'hero',characters:[{id:'hero',character:c,updated_at:'2026'}]};
  window.fetch=async(url,init={})=>{
   if(url==='/api/vault'){
    if(init.method==='POST'){window.testVault=JSON.parse(init.body);return new Response('{}',{status:200});}
    return new Response(JSON.stringify(window.testVault),{status:200});
   }
   if(url==='./theme-assets.json')return new Response('{"version":1,"assets":{}}',{status:200});
   return new Response('{}',{status:404});
  };
 }""",hero)
 for file in ['dnd-slots.js','character-import.js','vault-store.js','dnd-action.js','browser-pdf.js','dice-physics.js','app.js']:
  page.add_script_tag(content=(ROOT/'web'/file).read_text())
 page.wait_for_function("document.querySelector('.page-title')?.textContent==='Player Sheet QA'")
 assert page.locator('details[data-panel="Conditions"]').count()==1
 assert page.locator('#page > details[data-panel="Conditions"]').count()==1
 assert page.locator('.recipient-context').is_visible()
 assert page.get_by_role('tab',name='My Turn').count()==1
 assert page.locator('.encounter-targets').count()==0
 assert page.evaluate('Action.targets(character).length')==0

 page.locator('.attack-list [data-action=attack]').first.click()
 assert page.evaluate('pendingRoll.expression')=='1d20+6'
 settle(page)
 assert page.evaluate('lastResult.total')>=7
 assert page.evaluate('pendingDamage.length')==0
 assert page.evaluate('Action.combat(character).economy.spent.action')==0
 page.locator('.attack-list [data-action=damage]').first.click()
 assert page.evaluate('pendingRoll.expression')=='1d8+3'
 page.evaluate('cancelPreparedRoll()')
 page.locator('.attack-list [data-action=critical-damage]').first.click()
 assert page.evaluate('pendingRoll.expression')=='2d8+3'
 page.evaluate('cancelPreparedRoll()')

 page.locator('#page > details[data-panel="Conditions"] [data-action=condition][data-arg=Poisoned]').click()
 assert page.evaluate("character.conditions.includes('Poisoned')")
 assert page.evaluate("Action.activeEffects(character).length")==0
 page.locator('#page > details[data-panel="Conditions"] [data-action=condition][data-arg=Poisoned]').click()
 assert not page.evaluate("character.conditions.includes('Poisoned')")

 page.get_by_label('My Turn quick tracker').get_by_role('button',name='Start tracking').click()
 assert page.evaluate('Action.combat(character).active') is True
 assert page.evaluate('Action.combat(character).economy.mode')=='manual'
 page.get_by_label('My Turn quick tracker').locator('[data-action=mark-turn-action][data-arg=action]').click()
 assert page.evaluate('Action.combat(character).economy.spent.action')==1
 page.locator('.attack-list [data-action=attack]').first.click()
 assert page.evaluate('pendingRoll.expression')=='1d20+6'
 page.evaluate('cancelPreparedRoll()')
 assert page.evaluate('Action.combat(character).economy.spent.action')==1
 page.get_by_label('My Turn quick tracker').get_by_role('button',name='Next turn').click()
 assert page.evaluate('Action.combat(character).economy.spent.action')==0

 page.get_by_label('Effect recipient').get_by_role('button',name='Other').click()
 page.get_by_role('tab',name='Spells').click()
 spell=page.locator('.spell-entry').filter(has_text='Aid Touch')
 spell.locator('summary').click()
 spell.get_by_role('button',name='Cast spell').click()
 assert 'Other: share the result' in page.locator('#dialog-layer').inner_text()
 page.locator('#dlg-yes').click()
 assert page.evaluate('pendingRoll.expression')=='1d6+2'
 settle(page)
 assert page.evaluate('pendingHealing') is None
 assert page.evaluate('character.hp.current')==12

 page.get_by_label('Effect recipient').get_by_role('button',name='Self').click()
 spell=page.locator('.spell-entry').filter(has_text='Aid Touch')
 if spell.locator('details').get_attribute('open') is None:spell.locator('summary').click()
 spell.get_by_role('button',name='Cast spell').click()
 page.locator('#dlg-yes').click()
 settle(page)
 assert page.evaluate('pendingHealing?.amount') is not None
 assert page.evaluate('character.hp.current')==12
 page.evaluate("handleAction('apply-roll-heal','')")
 assert page.evaluate('character.hp.current')>12
 assert page.evaluate('Action.targets(character).length')==0
 assert not errors,errors
 browser.close()
 print('PASS player-first: independent attacks/damage/critical, conditions, manual turn, Self/Other and explicit heal')
