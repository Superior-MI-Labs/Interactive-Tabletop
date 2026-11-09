"""Dice input regression: clickable above controls, overlapping rolls, reversible right cancellation."""
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_support import launch_chromium
R=Path(__file__).resolve().parents[1]
char={'schema_version':1,'name':'Dice QA','player':'','class_level':'Fighter 1','species':'Human','background':'',
'hp':{'current':12,'max':15,'temp':0},'ac':16,'initiative':2,'proficiency':2,'speed':'30 ft.',
'abilities':{'STR':{'score':16,'modifier':3}},'saves':{'Strength':5},'skills':{'Athletics':5},
'inventory':[],'attacks':[],'conditions':[],'features':[],'actions':[],'roll_history':[],'effects':{},'resources':{},'spells':[]}
with sync_playwright() as pw:
 browser=launch_chromium(pw)
 page=browser.new_page(viewport={'width':1440,'height':900});errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content((R/'web/index.html').read_text(),wait_until='domcontentloaded')
 page.add_style_tag(content=(R/'web/styles.css').read_text())
 page.evaluate('''c=>{window.testVault={schema_version:1,active_id:'qa',characters:[{id:'qa',character:c,updated_at:'2026'}]};
 window.fetch=async(url,opt={})=>{if(url==='/api/vault'){
 if(opt.method==='POST'){window.testVault=JSON.parse(opt.body);return new Response('{}',{status:200});}
 return new Response(JSON.stringify(window.testVault),{status:200});}
 if(url==='./theme-assets.json')return new Response('{"version":1,"assets":{}}',{status:200});
 return new Response('{}',{status:404});};}''',char)
 for name in ['dnd-slots.js','character-import.js','vault-store.js','dnd-action.js','browser-pdf.js','dice-physics.js','app.js']:
  page.add_script_tag(content=(R/'web'/name).read_text())
 page.wait_for_function('document.querySelector(".page-title")?.textContent==="Dice QA"')
 # A resting d12 overlaps a rollable ability button. A normal click must
 # activate the visible control, not steal the pointer to pick up the die.
 point=page.evaluate('''()=>{
  const button=document.querySelector('.ability-roll').getBoundingClientRect();
  const stage=document.querySelector('#dice-stage').getBoundingClientRect();
  const x=button.left+button.width/2-stage.left,y=button.top+button.height/2-stage.top;
  const d=DP.makeDie(12,x,y+28,44);d.id=++nextDieId;dice.push(d);
  d.x=x;d.y=y+d.z*.45;d.sleeping=true;d.rolling=false;
  return {x:stage.left+d.x,y:stage.top+d.y-d.z*.45};
 }''')
 assert page.evaluate('''()=>{const d=dice[0],r=document.querySelector('#dice-stage').getBoundingClientRect();return DP.hitTest(d,d.x,d.y-d.z*.45,r.width,r.height)}''')
 page.mouse.click(point['x'],point['y'])
 assert page.evaluate('pointer===null'),'Normal click should stay with the control'
 assert page.evaluate('pendingRoll?.expression')=='1d20+3','Ability button should prepare its own roll'
 assert page.evaluate('dice.find(d=>d.sides===12).held===false')
 page.evaluate('cancelPreparedRoll()')
 # A deliberate Alt+drag retrieves the overlapping d12 without firing the
 # ability action. Regular tabletop dice remain draggable without Alt.
 page.mouse.move(point['x'],point['y'])
 page.keyboard.down('Alt')
 page.mouse.down()
 assert page.evaluate('pointer?.selected[0].sides')==12,'Alt+drag must pick up the die through the control'
 page.mouse.move(point['x']+70,point['y']+40,steps=4)
 page.mouse.up()
 page.keyboard.up('Alt')
 assert page.evaluate('activeRolls.length')==1
 assert page.evaluate('activeRolls[0].expression')=='1d12'
 assert page.evaluate('pendingRoll===null'),'Alt+drag must not re-trigger the underlying button'
 # Simultaneously prepare another die and throw it while the first group is in flight.
 page.evaluate('''()=>{const d=DP.makeDie(20,110,110,44);d.id=++nextDieId;dice.push(d);}''')
 p=page.evaluate('''()=>{const d=dice.at(-1),r=document.querySelector('#dice-stage').getBoundingClientRect();return {x:r.left+d.x,y:r.top+d.y-d.z*.45}}''')
 page.mouse.move(p['x'],p['y']);page.mouse.down()
 assert page.evaluate('pointer?.selected[0].sides')==20
 page.mouse.move(p['x']+40,p['y']+60,steps=3)
 # Right click cancels the grab; never starts another roll.
 page.mouse.down(button='right');page.mouse.up(button='right')
 assert page.evaluate('pointer===null')
 assert page.evaluate('activeRolls.length')==1
 page.mouse.up(button='left')
 # The canceled die can be grabbed and thrown deliberately with a fresh left gesture.
 p=page.evaluate('''()=>{const d=dice.find(x=>x.sides===20),r=document.querySelector('#dice-stage').getBoundingClientRect();return {x:r.left+d.x,y:r.top+d.y-d.z*.45}}''')
 page.mouse.move(p['x'],p['y']);page.mouse.down()
 assert page.evaluate('pointer?.selected[0].sides')==20
 page.mouse.move(p['x']+50,p['y']+30,steps=3);page.mouse.up()
 assert page.evaluate('activeRolls.length')==2
 # Catch a rolling d20; original group should remain active while it is held.
 p2=page.evaluate('''()=>{const d=dice.find(x=>x.sides===20);const r=document.querySelector('#dice-stage').getBoundingClientRect();
 d.v=[0,0,0];d.w=[0,0,0];return {x:r.left+d.x,y:r.top+d.y-d.z*.45}}''')
 page.mouse.move(p2['x'],p2['y']);page.mouse.down()
 assert page.evaluate('pointer?.mode')=='existing'
 page.mouse.move(p2['x']+35,p2['y']+15,steps=3);page.mouse.up()
 assert page.evaluate('activeRolls.length')==2
 # Complete both independently: no forced timeout, both results recorded.
 page.evaluate('''()=>{for(const d of dice){d.sleeping=true;d.held=false;d.rolling=false;}finishRollIfSettled()}''')
 assert page.evaluate('activeRolls.length')==0
 assert page.evaluate('history.length')==2
 assert page.evaluate('document.body.classList.contains("dice-dragging")') is False
 # Presentation uses the existing settled-result contract; no total is
 # recomputed from displayed dice or by the hover card.
 page.evaluate('''()=>{lastResult={label:'Longsword attack vs Goblin',expression:'1d20+6',parts:[11],modifier:6,total:17,bonuses:[],outcome:'HIT'};updateTableResults();}''')
 assert page.locator('#collapsed-result .compact-total').inner_text()=='17'
 assert 'Longsword attack' in page.locator('#collapsed-result .compact-label').inner_text()
 assert page.evaluate("parseFloat(getComputedStyle(document.querySelector('.compact-total')).fontSize)")>=28
 summary=page.locator('#dice-widget > summary')
 summary.focus()
 tooltip=page.locator('#hud-tooltip')
 assert tooltip.is_visible()
 for phrase in ('Longsword attack vs Goblin','Dice faces: 11','Modifier: +6','Final total: 17','HIT'):
  assert phrase in tooltip.inner_text(),phrase
 assert summary.get_attribute('aria-label').startswith('Dice · last total 17')
 page.keyboard.press('Escape')
 assert tooltip.is_hidden()
 summary.evaluate('(el)=>el.click()')
 assert page.locator('#last-result strong').inner_text()=='17'
 assert 'Modifier: +6' in page.locator('#last-result').inner_text()
 page.set_viewport_size({'width':390,'height':844})
 assert page.evaluate('document.documentElement.scrollWidth<=window.innerWidth+6')

 assert not errors,errors
 print('PASS browser: visible controls over resting dice, Alt+drag fallback, concurrent rolls, cancel/rethrow, compact 17 total with 11+6 hover, mobile')
 browser.close()
