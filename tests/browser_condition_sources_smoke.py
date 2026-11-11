"""Real UI: source-specific expiry, manual creature turns and preset timing."""
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_support import launch_chromium
ROOT=Path(__file__).resolve().parents[1]
hero={'schema_version':1,'system_edition':'dnd-2014','name':'Condition Source QA',
 'class_level':'Monk 5','species':'Human','background':'','hp':{'current':25,'max':25,'temp':0},
 'ac':16,'initiative':2,'proficiency':3,'speed':'40 ft','abilities':{},'saves':{},'skills':{},
 'attacks':[],'inventory':[],'conditions':[],'features':[],'roll_history':[],'effects':{},'spells':[],
 'resources':{'Ki':{'current':3,'max':3}},'actions':[]}
with sync_playwright() as pw:
 browser=launch_chromium(pw)
 page=browser.new_page(viewport={'width':1440,'height':900});page.set_default_timeout(6000)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content((ROOT/'web/index.html').read_text(),wait_until='domcontentloaded')
 page.add_style_tag(content=(ROOT/'web/styles.css').read_text())
 page.evaluate('''hero=>{window.testVault={schema_version:1,active_id:'qa',characters:[{id:'qa',character:hero,updated_at:'2026'}]};
  window.fetch=async(url,opt={})=>{
   if(url==='/api/vault'){
    if(opt.method==='POST'){window.testVault=JSON.parse(opt.body);return new Response('{}',{status:200});}
    return new Response(JSON.stringify(window.testVault),{status:200});}
   if(url==='./theme-assets.json')return new Response('{"version":1,"assets":{}}',{status:200});
   return new Response('{}',{status:404});};}''',hero)
 for filename in ['dnd-slots.js','character-import.js','vault-store.js','dnd-action.js','browser-pdf.js','dice-physics.js','app.js']:
  page.add_script_tag(content=(ROOT/'web'/filename).read_text())
 page.wait_for_function("document.querySelector('.page-title')?.textContent==='Condition Source QA'")
 page.evaluate('''()=>{const t=Action.addTarget(character,{name:'Goblin',ac:13,hp:12});
  selectedTargetId=t.id;Action.setEncounter(character,true);
  Action.grantCondition(character,t.id,'Restrained',{sourceId:'Net',expiration:'target-next-turn-end'});
  Action.grantCondition(character,t.id,'Stunned',{sourceId:'Monk',expiration:'source-next-turn-end'});
  render();}''')
 page.evaluate("panelState.set('Advanced encounter tools',true)")
 page.get_by_role('tab',name='My Turn').click()
 panel=page.locator('details.encounter-targets');panel.evaluate('el=>el.open=true')
 assert page.get_by_role('button',name='End creature turn').is_visible()
 assert page.get_by_label('Tracked condition sources').get_by_role('button',name='End source').count()==2
 assert page.evaluate('Action.targetById(character,selectedTargetId).conditions.includes("Restrained")')
 page.get_by_role('button',name='End creature turn').evaluate('el=>el.click()')
 assert page.locator('#dlg-yes').count()==1
 page.locator('#dlg-yes').click()
 assert page.evaluate('Action.targetById(character,selectedTargetId).condition_turn')==2
 assert page.evaluate('Action.targetById(character,selectedTargetId).conditions.includes("Restrained")')
 page.get_by_role('button',name='End creature turn').evaluate('el=>el.click()')
 page.locator('#dlg-yes').click()
 assert not page.evaluate('Action.targetById(character,selectedTargetId).conditions.includes("Restrained")')
 assert page.evaluate('Action.targetById(character,selectedTargetId).conditions.includes("Stunned")')
 page.get_by_role('button',name='Next turn').evaluate('el=>el.click()')
 assert page.evaluate('Action.targetById(character,selectedTargetId).conditions.includes("Stunned")')
 page.get_by_role('button',name='Next turn').evaluate('el=>el.click()')
 assert not page.evaluate('Action.targetById(character,selectedTargetId).conditions.includes("Stunned")')
 # Explicit 2014 template sets its own expiration; other workflows default manual.
 assert page.evaluate("ABILITY_TEMPLATES.stunning_strike_2014.workflow.on_failure.expiration")=='source-next-turn-end'
 # DM action: manually listed conditions should persist when an additional grant ends.
 page.evaluate('''()=>{Action.setTargetCondition(character,selectedTargetId,'Poisoned',true);
  Action.grantCondition(character,selectedTargetId,'Poisoned',{sourceId:'Other',expiration:'manual'});render();}''')
 assert page.evaluate('Action.targetById(character,selectedTargetId).conditions.includes("Poisoned")')
 panel.evaluate('el=>el.open=true')
 row=page.get_by_label('Tracked condition sources')
 row.get_by_role('button',name='End source').last.evaluate('el=>el.click()')
 assert page.locator('#dlg-yes').count()==1
 page.locator('#dlg-yes').click()
 assert page.evaluate('Action.targetById(character,selectedTargetId).conditions.includes("Poisoned")')
 assert not errors,errors
 browser.close()
 print('PASS browser condition lifecycle: separate source/target turns, manual controls, overlapping sources and 2014 preset')
