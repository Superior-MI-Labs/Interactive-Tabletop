"""Real browser: saves are evidence, not implicit damage reductions; self damage emits events."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright
from browser_support import launch_chromium
ROOT=Path(__file__).resolve().parents[1]
hero={'schema_version':1,'name':'Save Provenance QA','system_id':'dnd5e','system_edition':'dnd-2014','class_level':'Ranger 5',
 'species':'Human','background':'','hp':{'current':28,'max':28,'temp':0},'ac':16,'initiative':0,
 'proficiency':3,'speed':'30 ft','abilities':{},'saves':{},'skills':{},'attacks':[],
 'inventory':[],'conditions':[],'features':[],'roll_history':[],'effects':{},'spells':[],'resources':{},'actions':[]}
with sync_playwright() as pw:
 browser=launch_chromium(pw)
 page=browser.new_page(viewport={'width':1440,'height':900});page.set_default_timeout(6000)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content((ROOT/'web/index.html').read_text(),wait_until='domcontentloaded')
 page.add_style_tag(content=(ROOT/'web/styles.css').read_text())
 catalog=json.loads((ROOT/'web/dnd-2014-reference.json').read_text())
 page.evaluate('''([hero,catalog])=>{
 window.testVault={schema_version:1,active_id:'hero',characters:[{id:'hero',character:hero,updated_at:'2026'}]};
 window.fetch=async(url,opt={})=>{
  if(url==='/api/vault'){
   if(opt.method==='POST'){window.testVault=JSON.parse(opt.body);return new Response('{}',{status:200});}
   return new Response(JSON.stringify(window.testVault),{status:200});}
  if(url==='./theme-assets.json')return new Response('{"version":1,"assets":{}}',{status:200});
  if(url==='./dnd-2014-reference.json')return new Response(JSON.stringify(catalog),{status:200});
  return new Response('{}',{status:404});};}''',[hero,catalog])
 for f in ['dnd-slots.js','character-import.js','vault-store.js','dnd-action.js','reference-catalog.js','browser-pdf.js','dice-physics.js','app.js']:
  page.add_script_tag(content=(ROOT/'web'/f).read_text())
 page.wait_for_function("document.querySelector('.page-title')?.textContent==='Save Provenance QA'")
 page.evaluate('''()=>{selectedTargetId=Action.addTarget(character,{name:'Trial Mage',ac:14,hp:24}).id;Action.setEncounter(character,true);render();}''')
 # Roll damage first: the app must never attach a previous target save automatically.
 page.evaluate('''()=>queueRoll('2d6','QA blast',{kind:'target-damage',characterId:activeId,targetId:selectedTargetId,source:'QA blast',damageType:'fire'})''')
 page.evaluate('''()=>{beginThrow();for(const g of activeRolls)for(const d of dice.filter(x=>g.diceIds.includes(x.id)))d.sleeping=true;finishRollIfSettled();}''')
 assert page.evaluate('pendingDamage.length')==1
 assert page.evaluate('pendingDamage[0].saveOutcome') is None
 assert page.locator('[data-pending-save] option').count()==1
 # A target saving throw is a separately identified, completed roll.
 page.evaluate("()=>{queueRoll('1d20+3','Trial Mage DEX save',{kind:'target-save',characterId:activeId,targetId:selectedTargetId,ability:'DEX',dc:14});}")
 page.evaluate('''()=>{beginThrow();for(const g of activeRolls)for(const d of dice.filter(x=>g.diceIds.includes(x.id)))d.sleeping=true;finishRollIfSettled();}''')
 assert page.evaluate('Action.recentSave(character)?.ability')=='DEX'
 assert page.evaluate('Action.recentSave(character)?.targetId===selectedTargetId')
 assert page.evaluate('Action.combatEvent(character)?.kind') in ('save-success','save-failure')
 assert page.locator('[data-pending-save] option').count()==3
 # Explicitly select save association (half on success), then change the saved
 # evidence before confirming: the stale association must not cost HP.
 page.locator('[data-pending-save]').evaluate("el=>{el.value='half';el.dispatchEvent(new Event('change',{bubbles:true}));}")
 old=page.locator('[data-pending-save]').get_attribute('data-save-id')
 page.evaluate('''()=>{Action.recordResolvedSave(character,{rollId:'attack-roll-save-replaced',targetId:selectedTargetId,ability:'WIS',total:3,dc:15});}''')
 page.locator('[data-action="apply-target-damage"]').evaluate('(el)=>el.click()')
 assert page.locator('#dlg-yes').count()==0
 assert page.evaluate('Action.targetById(character,selectedTargetId).hp.current')==24
 assert page.evaluate('Action.recentSave(character)?.id')!=old
 # A fresh, explicitly selected save association is applied on the one inline click.
 page.evaluate('updateTableResults()')
 page.locator('[data-pending-save]').evaluate("el=>{el.value='half';el.dispatchEvent(new Event('change',{bubbles:true}));}")
 amount=page.evaluate('pendingDamage[0].amount')
 page.locator('[data-action="apply-target-damage"]').evaluate('(el)=>el.click()')
 assert page.locator('#dlg-yes').count()==0,'Guided/Auto review is the explicit approval'
 assert page.evaluate('Action.targetById(character,selectedTargetId).hp.current')==24-amount
 # A committed self-damage event is tied to this character and undo retires it.
 page.evaluate("()=>{Action.commitDamage(character,Action.planDamage(character,'self',{amount:4}));render();}")
 assert page.evaluate('Action.combatEvent(character)?.kind')=='damage-taken'
 assert page.evaluate('character.hp.current')==24
 page.evaluate('''()=>{Action.undoLastDamage(character);render();}''')
 assert page.evaluate('Action.combatEvent(character)') is None
 assert page.evaluate('character.hp.current')==28
 assert not errors,errors
 browser.close()
 print('PASS browser: explicit save-to-damage evidence, stale rejection, no implicit reduction, self damage event and undo')
