"""Staged workflow is owned by its character, not an outstanding modal or die."""
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_support import launch_chromium
ROOT = Path(__file__).resolve().parents[1]
base = {
 'schema_version':1,'system_edition':'dnd-2014','name':'Staged Owner A','class_level':'Monk 6',
 'species':'Human','background':'','hp':{'current':25,'max':25,'temp':0},'ac':15,
 'initiative':2,'proficiency':3,'speed':'45 ft','abilities':{},'saves':{},'skills':{},
 'attacks':[],'inventory':[],'conditions':[],'features':[],'roll_history':[],
 'effects':{},'spells':[],'resources':{'Ki':{'current':3,'max':3}},
 'actions':[{'id':'stun','name':'Stunning Strike','source':'manual','ruleset_profile':'dnd-2014',
   'activation':'special','trigger_event':'melee-hit','resource':'Ki','cost':1,
   'effect_kind':'none','workflow':{'kind':'save-condition','save':{'ability':'CON','dc':99},
   'on_failure':{'condition':'Stunned'}}}]
}
with sync_playwright() as pw:
 browser=launch_chromium(pw)
 page=browser.new_page(viewport={'width':1440,'height':900})
 page.set_default_timeout(6500)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content((ROOT/'web/index.html').read_text(),wait_until='domcontentloaded')
 page.add_style_tag(content=(ROOT/'web/styles.css').read_text())
 page.evaluate('''base=>{
 const a=structuredClone(base),b=structuredClone(base);b.name='Staged Owner B';
 window.testVault={schema_version:1,active_id:'a',characters:[{id:'a',character:a,updated_at:'2026'},
 {id:'b',character:b,updated_at:'2026'}]};
 window.fetch=async(url,opt={})=>{
  if(url==='/api/vault'){
   if(opt.method==='POST'){window.testVault=JSON.parse(opt.body);return new Response('{}',{status:200});}
   return new Response(JSON.stringify(window.testVault),{status:200});}
  if(url==='./theme-assets.json')return new Response('{"version":1,"assets":{}}',{status:200});
  return new Response('{}',{status:404});
 };}''',base)
 for f in ['dnd-slots.js','character-import.js','vault-store.js','dnd-action.js','browser-pdf.js','dice-physics.js','app.js']:
  page.add_script_tag(content=(ROOT/'web'/f).read_text())
 page.wait_for_function("document.querySelector('.page-title')?.textContent==='Staged Owner A'")
 page.evaluate("()=>{selectedTargetId=Action.addTarget(character,{name:'QA enemy',ac:14,hp:20}).id;Action.setEncounter(character,true);Action.recordCombatEvent(character,'melee-hit',selectedTargetId);render();}")
 # A modal opened on A cannot be confirmed against B.
 page.evaluate("handleAction('action-use','0')")
 assert page.locator('#dlg-yes').count()==1
 page.evaluate("activateCharacter('b')")
 assert page.locator('#dlg-yes').count()==0
 assert page.evaluate('character.resources.Ki.current')==3
 page.evaluate("activateCharacter('a')")
 assert page.evaluate('character.resources.Ki.current')==3
 page.evaluate("()=>{selectedTargetId=character.effects.targets[0].id;render();}")
 page.evaluate("handleAction('action-use','0')")
 page.get_by_role('button',name='Spend & roll save').click()
 assert page.evaluate('character.resources.Ki.current')==2
 flow=page.evaluate('Action.pendingWorkflow(character).id')
 assert page.evaluate('pendingRoll!==null && queuedEffect.workflowId===Action.pendingWorkflow(character).id')
 # Switching cancels prepared dice, not the committed workflow.
 page.evaluate("activateCharacter('b')")
 assert page.evaluate('pendingRoll===null && activeRolls.length===0')
 page.evaluate("activateCharacter('a')")
 assert page.evaluate('Action.pendingWorkflow(character).id')==flow
 assert page.get_by_role('button',name='Roll target save').is_visible()
 page.get_by_role('button',name='Roll target save').evaluate('el=>el.click()')
 page.evaluate('beginThrow()')
 assert page.evaluate('activeRolls.length')==1
 # Switching with the save in flight must invalidate that physical result.
 page.evaluate("activateCharacter('b')")
 assert page.evaluate('activeRolls.length')==0
 page.evaluate("activateCharacter('a')")
 assert page.evaluate('Action.pendingWorkflow(character).status')=='await-save'
 assert page.evaluate('character.resources.Ki.current')==2
 page.get_by_role('button',name='Roll target save').evaluate('el=>el.click()')
 page.evaluate('''()=>{beginThrow();for(const g of activeRolls)for(const d of dice.filter(x=>g.diceIds.includes(x.id))){d.sleeping=true;d.rolling=false;}finishRollIfSettled();}''')
 assert page.evaluate('Action.pendingWorkflow(character).status')=='await-effect'
 assert page.evaluate('character.resources.Ki.current')==2
 # A changed assistance mode retires the offered effect; the old confirmation cannot apply it.
 page.evaluate("()=>{Action.setCombatMode(character,'guided');render();}")
 assert page.evaluate('Action.pendingWorkflow(character)') is None
 assert page.evaluate("!Action.targetById(character,character.effects.targets[0].id).conditions?.includes('Stunned')")
 assert page.evaluate('character.resources.Ki.current')==2
 assert not errors,errors
 browser.close()
 print('PASS browser staged lifecycle: modal identity, prepared/in-flight switch, resume, mode interruption, no duplicate Ki')
