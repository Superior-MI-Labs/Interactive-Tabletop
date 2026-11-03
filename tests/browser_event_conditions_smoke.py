"""UI gate: verified event predicates enable only their own configured reactions."""
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_support import launch_chromium
ROOT=Path(__file__).resolve().parents[1]
hero={'schema_version':1,'system_id':'dnd5e','system_edition':'dnd-2014',
 'name':'Event Filter QA','class_level':'Monk 6','species':'Human','background':'',
 'hp':{'max':30,'current':30,'temp':0},'ac':17,'initiative':0,'proficiency':3,'speed':'40 ft',
 'abilities':{},'saves':{},'skills':{},'attacks':[],'inventory':[],'conditions':[],
 'features':[],'roll_history':[],'effects':{},'spells':[],
 'resources':{'Ki':{'current':3,'max':3}},
 'actions':[{'id':'con-save','name':'CON outcome response','source':'manual',
  'activation':'1 reaction','trigger_event':'save-failure','event_save_ability':'CON',
  'resource':'Ki','cost':1},
  {'id':'fire-damage','name':'Fire injury response','source':'manual',
  'activation':'1 reaction','trigger_event':'damage-taken','event_damage_type':'fire',
  'event_min_damage':8,'event_min_hp_loss':4,'resource':'Ki','cost':1}]}
with sync_playwright() as pw:
 browser=launch_chromium(pw)
 page=browser.new_page(viewport={'width':1440,'height':900});page.set_default_timeout(6000)
 errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
 page.set_content((ROOT/'web/index.html').read_text(),wait_until='domcontentloaded')
 page.add_style_tag(content=(ROOT/'web/styles.css').read_text())
 page.evaluate('''c=>{
 window.testVault={schema_version:1,active_id:'qa',characters:[{id:'qa',character:c,updated_at:'2026'}]};
 window.fetch=async(url,opt={})=>{
  if(url==='/api/vault'){
   if(opt.method==='POST'){window.testVault=JSON.parse(opt.body);return new Response('{}',{status:200});}
   return new Response(JSON.stringify(window.testVault),{status:200});}
  if(url==='./theme-assets.json')return new Response('{"version":1,"assets":{}}',{status:200});
  return new Response('{}',{status:404});
 };}''',hero)
 for f in ['dnd-slots.js','character-import.js','vault-store.js','dnd-action.js','browser-pdf.js','dice-physics.js','app.js']:
  page.add_script_tag(content=(ROOT/'web'/f).read_text())
 page.wait_for_function("document.querySelector('.page-title')?.textContent==='Event Filter QA'")
 page.evaluate("()=>{const e=Action.addTarget(character,{name:'Trial Ogre',ac:14,hp:20});selectedTargetId=e.id;Action.setEncounter(character,true);render();}")
 def use_button(name):return page.locator('.action-entry').filter(has_text=name).get_by_role('button',name='Use ability')
 def show(name):
  entry=page.locator('.action-entry').filter(has_text=name)
  if entry.locator('details').count():entry.locator('details').evaluate('el=>el.open=true')
  else:entry.evaluate('el=>el.open=true')
  return entry
 show('CON outcome response');show('Fire injury response')
 assert use_button('CON outcome response').is_disabled()
 assert use_button('Fire injury response').is_disabled()
 # Wrong save ability is genuine evidence but cannot satisfy this feature.
 page.evaluate("()=>{Action.recordResolvedSave(character,{rollId:'attack-roll-ui-dex',targetId:selectedTargetId,ability:'DEX',total:3,dc:15});render();}")
 assert use_button('CON outcome response').is_disabled()
 page.evaluate("()=>{Action.recordResolvedSave(character,{rollId:'attack-roll-ui-con',targetId:selectedTargetId,ability:'CON',total:6,dc:15});render();}")
 assert use_button('CON outcome response').is_enabled()
 # Configure the filter from the existing editor, without editing mechanics in JS.
 page.get_by_role('button',name='Edit sheet').click()
 picker=page.locator('[data-input="actions.0.event_save_ability"]')
 assert picker.count()==1
 picker.select_option('DEX')
 assert page.evaluate('character.actions[0].event_save_ability')=='DEX'
 assert use_button('CON outcome response').is_disabled()
 page.locator('[data-input="actions.0.event_save_ability"]').select_option('CON')
 assert use_button('CON outcome response').is_enabled()
 page.get_by_role('button',name='Done editing').click()
 # Stale modal: a newer, equally qualified event cannot take over the old dialog.
 use_button('CON outcome response').evaluate('el=>el.click()')
 assert page.locator('#dlg-yes').count()==1
 page.evaluate("()=>Action.recordResolvedSave(character,{rollId:'attack-roll-ui-new',targetId:selectedTargetId,ability:'CON',total:5,dc:15})")
 page.locator('#dlg-yes').click()
 assert page.evaluate('character.resources.Ki.current')==3
 assert page.evaluate('Action.combatEvent(character).used') is False
 page.evaluate('render()')
 # The normal ability UI confirms and spends one reaction and the configured Ki.
 use_button('CON outcome response').evaluate('el=>el.click()')
 assert page.locator('#dlg-yes').count()==1
 page.locator('#dlg-yes').click()
 assert page.evaluate('character.resources.Ki.current')==2
 assert page.evaluate('Action.combat(character).economy.spent.reaction')==1
 page.evaluate("()=>{Action.advanceTurn(character);Action.commitDamage(character,Action.planDamage(character,'self',{amount:7,type:'fire'}));render();}")
 assert use_button('Fire injury response').is_disabled()
 page.evaluate("()=>{Action.commitDamage(character,Action.planDamage(character,'self',{amount:9,type:'cold'}));render();}")
 assert use_button('Fire injury response').is_disabled()
 page.evaluate("()=>{Action.commitDamage(character,Action.planDamage(character,'self',{amount:9,type:'fire'}));render();}")
 assert use_button('Fire injury response').is_enabled()
 assert page.evaluate('Action.combatEvent(character)?.hpLoss')==9
 use_button('Fire injury response').evaluate('el=>el.click()')
 page.locator('#dlg-yes').click()
 assert page.evaluate('character.resources.Ki.current')==1
 assert page.evaluate('Action.combatEvent(character).used') is True
 assert not errors,errors
 browser.close()
 print('PASS browser event filters: save ability, edit UI, damage thresholds, disabled actions and commit spending')
