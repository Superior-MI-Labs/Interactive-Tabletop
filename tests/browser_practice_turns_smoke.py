"""Real browser: demo practice routes through actual attack and turn contracts."""
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_support import launch_chromium
ROOT=Path(__file__).resolve().parents[1]
with sync_playwright() as pw:
 browser=launch_chromium(pw)
 page=browser.new_page(viewport={'width':1440,'height':900})
 page.set_default_timeout(7500)
 errors=[]
 page.on('pageerror',lambda error:errors.append(str(error)))
 page.set_content((ROOT/'web/index.html').read_text(),wait_until='domcontentloaded')
 page.add_style_tag(content=(ROOT/'web/styles.css').read_text())
 page.evaluate('''()=>{window.fetch=async(url,opt={})=>{
  if(url==='/api/vault'){
   if(opt.method==='POST'){window.testVault=JSON.parse(opt.body);return new Response('{}',{status:200});}
   return new Response(JSON.stringify(window.testVault),{status:200});}
  if(url==='./theme-assets.json')return new Response('{"version":1,"assets":{}}',{status:200});
  return new Response('{}',{status:404});
 };}''')
 for filename in ['dnd-slots.js','character-import.js','vault-store.js','demo-character.js','dnd-action.js','browser-pdf.js','dice-physics.js']:
  page.add_script_tag(content=(ROOT/'web'/filename).read_text())
 page.evaluate('''()=>{window.testVault={schema_version:1,active_id:'demo',characters:[
  {id:'demo',character:TabletopDemo.create(),updated_at:'2026'}]};}''')
 page.add_script_tag(content=(ROOT/'web/app.js').read_text())
 page.wait_for_function("document.querySelector('.page-title')?.textContent==='Mara Vale (Demo)'")
 page.evaluate("panelState.set('Advanced encounter tools',true)")
 page.get_by_role('tab',name='My Turn').click()
 guide=page.locator('.demo-callout')
 assert 'Begin encounter tracking' in guide.inner_text()
 guide.get_by_role('button',name='1 · Start practice encounter').click()
 page.evaluate("()=>{Action.setCombatMode(character,'auto');render();}")
 assert page.evaluate('Action.combat(character).active')
 assert 'Training Dummy' in guide.inner_text()
 guide.get_by_role('button',name='2 · Target Training Dummy').click()
 assert page.evaluate('selectedTargetId')=='target-1'
 assert 'longsword' in guide.inner_text()
 guide.get_by_role('button',name='3 · Prepare longsword attack').click()
 assert page.evaluate('pendingRoll?.combatAttack===true')
 assert page.evaluate('Action.combat(character).economy.spent.action')==0,'Preparation cannot spend actions'
 assert 'Right-click or Escape cancels' in guide.inner_text()
 # Cancellation retains action eligibility; the same shared attack control retries.
 page.evaluate('cancelPreparedRoll()')
 page.evaluate('render()')
 assert page.evaluate('Action.combat(character).economy.spent.action')==0
 guide.get_by_role('button',name='3 · Prepare longsword attack').click()
 guide.get_by_role('button',name='Throw prepared dice').click()
 page.wait_for_function('Action.combat(character).economy.spent.action===1')
 assert page.evaluate('Action.combat(character).economy.attacks.made')==1
 page.wait_for_function('document.querySelector(".demo-callout")?.textContent.includes("Extra Attack")')
 # Target clocks use the engine's condition grants, not the player's turn counter.
 page.evaluate('''()=>{Action.grantCondition(character,'target-1','Restrained',
  {sourceId:'training-net',expiration:'target-next-turn-end'});render();}''')
 page.evaluate("panelState.set('Advanced encounter tools',true)")
 page.get_by_role('tab',name='My Turn').click()
 board=page.get_by_text('Creature turns',exact=False).locator('xpath=ancestor::details[1]')
 assert page.locator('.creature-turn-board').count()==1
 board=page.locator('.creature-turn-board')
 board.evaluate('el=>el.open=true')
 assert 'Restrained' in board.inner_text()
 assert 'end turn 2' in board.inner_text()
 board.get_by_role('button',name='End turn').click()
 assert page.locator('#dlg-yes').count()==1
 page.locator('#dlg-yes').click()
 assert page.evaluate("Action.targetById(character,'target-1').condition_turn") == 2
 assert page.evaluate('Action.combat(character).turn') == 1
 board=page.locator('.creature-turn-board');board.evaluate('el=>el.open=true')
 assert 'due on confirmation' in board.inner_text()
 board.get_by_role('button',name='End turn').click()
 page.locator('#dlg-yes').click()
 assert not page.evaluate("Action.targetById(character,'target-1').conditions.includes('Restrained')")
 assert page.evaluate('Action.combat(character).turn') == 1
 assert not errors, errors
 browser.close()
 print('PASS demo practice and creature turns: real action spending, cancel, independent clocks and expiry')
