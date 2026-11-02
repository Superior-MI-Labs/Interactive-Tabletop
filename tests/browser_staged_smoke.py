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
 page.get_by_role('button',name='Start encounter').click()
 entry=page.locator('.action-entry').filter(has_text='Reactive Deflection');entry.locator('summary').click()
 entry.get_by_role('button',name='Use ability').click()
 page.locator('#dialog-layer input[type=number]').fill('4')
 page.get_by_role('button',name='Spend reaction & roll').click()
 assert page.evaluate('character.resources.Ki.current')==1
 assert page.evaluate('character.effects.combat.economy.spent.reaction')==1
 assert page.evaluate("Action.pendingWorkflow(character)?.status")=='await-roll'
 assert page.evaluate("pendingRoll.expression")=='1d10+10'
 page.evaluate('''()=>{beginThrow();for(const d of dice.filter(d=>activeRoll?.diceIds.includes(d.id))){d.sleeping=true;d.rolling=false;}finishRollIfSettled();}''')
 assert page.evaluate("Action.pendingWorkflow(character)?.status")=='optional-followup'
 assert page.evaluate('character.resources.Ki.current')==1
 button=page.get_by_role('button',name='Throw captured missile · 1 Ki')
 assert button.is_enabled()
 button.click()
 page.get_by_role('button',name='Spend & throw').click()
 assert page.evaluate('character.resources.Ki.current')==0
 assert page.evaluate('character.effects.combat.economy.spent.reaction')==1
 assert page.evaluate('Action.pendingWorkflow(character)') is None
 assert page.evaluate('pendingRoll.expression')=='1d20+6'
 # Explicitly convert the incorrect imported upfront-Ki entry; do not infer from its name.
 page.evaluate('''()=>{beginThrow();for(const d of dice.filter(d=>activeRoll?.diceIds.includes(d.id))){d.sleeping=true;d.rolling=false;}finishRollIfSettled();}''')
 page.get_by_role('button',name='Edit sheet').click()
 assert page.evaluate('editMode')
 entry=page.locator('.action-entry').filter(has_text='Imported Deflect Missiles');entry.locator('summary').click()
 entry.locator('select[id^="apply-template-"]').select_option('deflect_missiles_2014')
 entry.get_by_role('button',name='Review template').click()
 page.get_by_role('button',name='Apply template').click()
 assert page.evaluate('character.actions.find(a=>a.id==="raw").cost')==0
 assert page.evaluate('character.actions.find(a=>a.id==="raw").workflow.followup.cost')==1
 assert page.evaluate('character.actions.find(a=>a.id==="raw").description.includes("Original imported text")')
 assert not errors,errors
 browser.close()
 print('PASS staged reaction browser: incoming damage, one reaction, reduction dice, optional Ki and return attack')
