"""Live pre-roll reaction -> explicit incoming outcome -> optional post-hit reaction."""
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_support import launch_chromium
ROOT=Path(__file__).resolve().parents[1]
hero={
 'schema_version':1,'system_edition':'dnd-2014','name':'Incoming Event QA','class_level':'Monk 4 / Cleric 1',
 'species':'Human','background':'','hp':{'current':25,'max':25,'temp':0},'ac':15,'initiative':2,
 'proficiency':2,'speed':'30 ft','abilities':{'DEX':{'score':16,'modifier':3}},
 'saves':{},'skills':{},'attacks':[],'inventory':[],'conditions':[],'features':[],'roll_history':[],
 'effects':{},'spells':[],
 'resources':{'Ki':{'current':2,'max':2},'Warding Flare Uses':{'current':2,'max':2}},
 'actions':[
 {'id':'flare','name':'Warding Flare','activation':'1 reaction','trigger_event':'incoming-attack',
  'resource':'Warding Flare Uses','cost':1,'source':'manual'},
 {'id':'deflect','name':'Deflect Missiles','activation':'1 reaction','trigger_event':'ranged-hit','roll':'1d10+8',
  'source':'manual','cost':0,'workflow':{'kind':'damage-reduction','followup':{
   'label':'Return missile','resource':'Ki','cost':1,'roll':'1d20+5',
   'requires_catchable':True,'requires_free_hand':True}}}
 ]}
with sync_playwright() as pw:
 browser=launch_chromium(pw)
 page=browser.new_page(viewport={'width':1450,'height':900});page.set_default_timeout(5000)
 errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
 page.set_content((ROOT/'web/index.html').read_text(),wait_until='domcontentloaded')
 page.add_style_tag(content=(ROOT/'web/styles.css').read_text())
 page.evaluate('''hero=>{window.testVault={schema_version:1,active_id:'qa',characters:[{id:'qa',character:hero,updated_at:'2026'}]};
 window.fetch=async(url,opt={})=>{
  if(url==='/api/vault'){
   if(opt.method==='POST'){window.testVault=JSON.parse(opt.body);return new Response('{}',{status:200});}
   return new Response(JSON.stringify(window.testVault),{status:200});
  }
  if(url==='./theme-assets.json')return new Response('{"version":1,"assets":{}}',{status:200});
  return new Response('{}',{status:404});
 };}''',hero)
 for filename in ['dnd-slots.js','character-import.js','vault-store.js','dnd-action.js','browser-pdf.js','dice-physics.js','app.js']:
  page.add_script_tag(content=(ROOT/'web'/filename).read_text())
 page.wait_for_function("document.querySelector('.page-title')?.textContent==='Incoming Event QA'")
 # Event controls live in Encounter; reactions stay in Actions and share state.
 def event_click(label, kind=None):
  page.get_by_role('tab',name='Encounter').click()
  if kind is not None: page.locator('#incoming-attack-kind').select_option(kind)
  page.get_by_role('button',name=label).click()
  page.get_by_role('tab',name='Actions').click()
 page.evaluate("()=>{const t=Action.addTarget(character,{name:'Archer',ac:12,hp:20});selectedTargetId=t.id;Action.setEncounter(character,true);render();}")
 flare=page.locator('.action-entry').filter(has_text='Warding Flare')
 flare.locator('summary').click()
 assert flare.get_by_role('button',name='Use ability').is_disabled()
 event_click('Incoming attack (before roll)')
 assert page.evaluate('Action.combatEvent(character)?.kind')=='incoming-attack'
 assert page.evaluate('Action.combatEvent(character)?.attackerId===selectedTargetId')
 page.get_by_role('tab',name='Encounter').click()
 assert page.get_by_role('button',name='Attack hit / resolved').is_visible()
 page.get_by_role('tab',name='Actions').click()
 assert flare.get_by_role('button',name='Use ability').is_enabled()
 flare.get_by_role('button',name='Use ability').click()
 assert page.locator('#dlg-yes').count()==1
 page.locator('#dlg-yes').click()
 assert page.evaluate('character.resources["Warding Flare Uses"].current')==1
 assert page.evaluate('Action.combat(character).economy.spent.reaction')==1
 event_click('Attack hit / resolved')
 assert page.evaluate('Action.combatEvent(character)?.kind')=='ranged-hit'
 assert page.evaluate('Action.combatEvent(character)?.parentEventId') is not None
 assert page.evaluate('Action.combat(character).economy.spent.reaction')==1
 # The pre-roll reaction was spent: a later Deflect cannot spend it again.
 deflect=page.locator('.action-entry').filter(has_text='Deflect Missiles')
 deflect.locator('summary').click()
 assert deflect.get_by_role('button',name='Use ability').is_disabled()
 event_click('Next turn')
 event_click('Incoming attack (before roll)')
 assert page.evaluate('Action.combatEvent(character)?.kind')=='incoming-attack'
 event_click('Attack missed / resolved')
 assert page.evaluate('Action.combatEvent(character)') is None
 assert deflect.get_by_role('button',name='Use ability').is_disabled()
 event_click('Incoming attack (before roll)', 'spell')
 event_click('Attack hit / resolved')
 assert page.evaluate('Action.combatEvent(character)') is None
 assert deflect.get_by_role('button',name='Use ability').is_disabled()
 event_click('Incoming attack (before roll)', 'ranged-weapon')
 event_click('Attack hit / resolved')
 assert page.evaluate('Action.combatEvent(character)?.kind')=='ranged-hit'
 assert deflect.get_by_role('button',name='Use ability').is_enabled()
 assert page.evaluate('character.resources.Ki.current')==2
 assert not errors,errors
 browser.close()
 print('PASS incoming attack UI: Warding Flare pre-roll, attacker identity, miss/spell exclusion, ranged hit follow-up and no duplicate reaction')
