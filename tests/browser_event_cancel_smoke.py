"""Live reaction→reduction→optional counterattack: the follow-up Ki is never an upfront cost."""
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_support import launch_chromium
ROOT=Path(__file__).resolve().parents[1]
character={
 'schema_version':1,'system_edition':'dnd-2014','name':'Staged QA','class_level':'Monk 7','species':'Human','background':'',
 'hp':{'current':20,'max':20,'temp':0},'ac':16,'initiative':2,'proficiency':3,'speed':'30 ft',
 'abilities':{'DEX':{'score':16,'modifier':3}},'saves':{},'skills':{},'attacks':[],
 'inventory':[],'conditions':[],'features':[],'roll_history':[],'effects':{},'spells':[],
 'resources':{'Ki':{'current':1,'max':1}},
 'actions':[{'id':'deflect','name':'Reactive Deflection','activation':'1 reaction','roll':'1d10+10','cost':0,
  'effect_kind':'none','source':'manual','workflow':{'kind':'damage-reduction','followup':{
   'label':'Throw captured missile','resource':'Ki','cost':1,'roll':'1d20+6',
   'requires_catchable':True,'requires_free_hand':True}}},
  {'id':'raw','name':'Imported Deflect Missiles','activation':'1 reaction','resource':'Ki','cost':1,'source':'pdf-feature','description':'Original imported text'}]
}
with sync_playwright() as pw:
 browser=launch_chromium(pw)
 page=browser.new_page(viewport={'width':1440,'height':900});page.set_default_timeout(6000);errors=[]
 page.on('pageerror',lambda error:errors.append(str(error)))
 page.set_content((ROOT/'web/index.html').read_text(),wait_until='domcontentloaded')
 page.add_style_tag(content=(ROOT/'web/styles.css').read_text())
 page.evaluate('''c=>{window.testVault={schema_version:1,active_id:'qa',characters:[{id:'qa',character:c,updated_at:'2026'}]};
 window.fetch=async(url,opt={})=>{
 if(url==='/api/vault'){
  if(opt.method==='POST'){window.testVault=JSON.parse(opt.body);return new Response('{}',{status:200});}
  return new Response(JSON.stringify(window.testVault),{status:200});
 }
 if(url==='./theme-assets.json')return new Response('{"version":1,"assets":{}}',{status:200});
 return new Response('{}',{status:404});
 };}''', character)
 for filename in ['dnd-slots.js','character-import.js','vault-store.js','dnd-action.js','browser-pdf.js','dice-physics.js','app.js']:
  page.add_script_tag(content=(ROOT/'web'/filename).read_text())
 page.wait_for_function("document.querySelector('.page-title')?.textContent==='Staged QA'")
 page.get_by_role('tab',name='Encounter').click()
 page.get_by_role('button',name='Start encounter').click()
 page.get_by_role('tab',name='Actions').click()
 button=page.locator('.action-entry').filter(has_text='Reactive Deflection')
 button.locator('summary').click()
 assert not button.get_by_role('button',name='Use ability').is_enabled(), 'Reaction blocked until confirmed ranged hit'
 page.get_by_role('tab',name='Encounter').click()
 page.get_by_role('button',name='Incoming attack (before roll)').click()
 page.get_by_role('tab',name='Actions').click()
 button=page.locator('.action-entry').filter(has_text='Reactive Deflection')
 assert not button.get_by_role('button',name='Use ability').is_enabled()
 page.get_by_role('tab',name='Encounter').click()
 page.get_by_role('button',name='Ranged weapon hit on you').click()
 page.get_by_role('tab',name='Actions').click()
 button=page.locator('.action-entry').filter(has_text='Reactive Deflection')
 assert button.get_by_role('button',name='Use ability').is_enabled()
 # Prepared physical dice are reversible even when grabbed: right click and Escape both cancel.
 page.evaluate("queueRoll('1d20','cancel first')")
 assert page.evaluate('pendingRoll') is not None
 stage=page.locator('#dice-stage');stage.click(button='right',position={'x':420,'y':180})
 assert page.evaluate('pendingRoll') is None
 assert page.evaluate('dice.some(d=>d.ready)') is False
 assert page.evaluate('Action.combat(character).economy.spent.reaction')==0
 page.evaluate("queueRoll('1d20','cancel by Escape')")
 page.keyboard.press('Escape')
 assert page.evaluate('pendingRoll') is None
 assert page.evaluate('Action.combat(character).economy.spent.reaction')==0
 button=page.locator('.action-entry').filter(has_text='Reactive Deflection')
 button.get_by_role('button',name='Use ability').click()
 page.locator('#dialog-layer input[type=number]').fill('4')
 page.get_by_role('button',name='Spend reaction & roll').click()
 assert page.evaluate('Action.combat(character).economy.spent.reaction')==1
 assert page.evaluate('Action.combatEvent(character).used') is True
 assert page.evaluate('pendingRoll') is not None
 # Canceling already-spent reduction dice does not retroactively refund the reaction.
 page.locator('#dice-stage').click(button='right',position={'x':420,'y':180})
 assert page.evaluate('pendingRoll') is None
 assert page.evaluate('Action.combat(character).economy.spent.reaction')==1
 assert not errors,errors
 browser.close()
 print('PASS event gate and dice cancellation: trigger eligibility, right-click/Escape, no premature spend or retroactive refund')
