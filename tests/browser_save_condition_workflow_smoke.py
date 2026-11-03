"""Live event -> optional Ki -> physical target save -> conditional approval."""
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_support import launch_chromium
ROOT=Path(__file__).resolve().parents[1]
hero={'schema_version':1,'system_edition':'dnd-2014','name':'Conditional Workflow QA',
 'class_level':'Monk 6','species':'Human','background':'','hp':{'current':25,'max':25,'temp':0},
 'ac':15,'initiative':2,'proficiency':3,'speed':'45 ft','abilities':{},'saves':{},'skills':{},
 'attacks':[],'inventory':[],'conditions':[],'features':[],'roll_history':[],'effects':{},'spells':[],
 'resources':{'Ki':{'current':3,'max':3}},
 'actions':[{'id':'stun','name':'Stunning Strike','source':'manual','ruleset_profile':'dnd-2014',
   'activation':'special','trigger_event':'melee-hit','resource':'Ki','cost':1,'effect_kind':'none',
   'workflow':{'kind':'save-condition','save':{'ability':'CON','dc':99},'on_failure':{'condition':'Stunned'}}}]}
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
  return new Response('{}',{status:404});
 };}''',hero)
 for f in ['dnd-slots.js','character-import.js','vault-store.js','dnd-action.js','browser-pdf.js','dice-physics.js','app.js']:
  page.add_script_tag(content=(ROOT/'web'/f).read_text())
 page.wait_for_function("document.querySelector('.page-title')?.textContent==='Conditional Workflow QA'")
 page.evaluate("()=>{selectedTargetId=Action.addTarget(character,{name:'Trial Guard',ac:14,hp:20}).id;Action.setEncounter(character,true);render();}")
 entry=page.locator('.action-entry').filter(has_text='Stunning Strike')
 entry.evaluate('el=>el.open=true')
 button=entry.get_by_role('button',name='Use ability')
 assert button.is_disabled()
 page.evaluate("()=>{Action.recordCombatEvent(character,'melee-hit',selectedTargetId);render();}")
 assert button.is_enabled()
 # Existing editor owns numeric conversion; source profiles are not guessed.
 page.get_by_role('button',name='Edit sheet').click()
 dc=page.locator('[data-input="actions.0.workflow.save.dc"]')
 assert dc.count()==1
 dc.fill('99');dc.press('Tab')
 assert page.evaluate('character.actions[0].workflow.save.dc===99 && typeof character.actions[0].workflow.save.dc==="number"')
 page.get_by_role('button',name='Done editing').click()
 entry.evaluate('el=>el.open=true')
 button=entry.get_by_role('button',name='Use ability')
 button.evaluate('el=>el.click()')
 assert page.locator('#dlg-yes').count()==1
 page.get_by_role('button',name='Spend & roll save').click()
 assert page.evaluate('character.resources.Ki.current')==2
 assert page.evaluate("Action.pendingWorkflow(character)?.status")=='await-save'
 assert page.evaluate('queuedEffect?.workflowId===Action.pendingWorkflow(character).id')
 assert page.evaluate('pendingRoll.rollKind')=='untyped','Enemy saves must not consume the hero\'s save bonuses'
 # Canceling a prepared save never refunds the already-committed Ki, but a retry is possible.
 page.evaluate('cancelPreparedRoll()')
 assert page.evaluate('pendingRoll') is None
 assert page.evaluate('character.resources.Ki.current')==2
 assert page.get_by_role('button',name='Roll target save').is_visible()
 page.get_by_role('button',name='Roll target save').evaluate('el=>el.click()')
 assert page.evaluate('queuedEffect?.workflowId===Action.pendingWorkflow(character).id')
 page.evaluate('''()=>{beginThrow();for(const g of activeRolls)for(const d of dice.filter(x=>g.diceIds.includes(x.id))){d.sleeping=true;d.rolling=false;}finishRollIfSettled();}''')
 assert page.evaluate("Action.pendingWorkflow(character)?.status")=='await-effect'
 assert page.evaluate('Action.recentSave(character)?.outcome')=='failure'
 assert page.evaluate('character.resources.Ki.current')==2
 assert page.evaluate('Action.targetById(character,selectedTargetId).conditions?.includes("Stunned")') is not True
 # A different target selection cannot redirect the effect from the original hit.
 page.evaluate("selectedTargetId='self';render()")
 page.get_by_role('button',name='Apply condition (DM confirmed)').evaluate('el=>el.click()')
 assert page.locator('#dlg-yes').count()==1
 page.get_by_role('button',name='Apply condition',exact=True).click()
 assert page.evaluate('Action.combat(character).pending_workflow') is None
 assert page.evaluate('Action.targetById(character,character.effects.targets[0].id).conditions.includes("Stunned")')
 assert page.evaluate('!character.conditions.includes("Stunned")')
 assert page.evaluate('character.resources.Ki.current')==2
 assert not errors,errors
 browser.close()
 print('PASS staged save-condition browser: verified hit, Ki, numeric DC, cancel/retry, physical save, original target and optional condition')
