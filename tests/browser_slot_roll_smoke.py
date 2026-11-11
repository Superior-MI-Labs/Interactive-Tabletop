"""Legacy slot casting and physical d20 mode integration in real Chromium."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_support import launch_chromium
R=Path(__file__).resolve().parents[1]
hero={'schema_version':1,'system_id':'dnd5e','name':'Legacy Caster','player':'QA','class_level':'Cleric 2',
 'species':'Human','background':'','hp':{'current':11,'max':20,'temp':0},'ac':15,'initiative':0,'proficiency':2,'speed':'30 ft',
 'abilities':{'WIS':{'score':16,'modifier':3},'STR':{'score':14,'modifier':2}},'saves':{'Constitution':2},'skills':{'Athletics':4},
 'attacks':[{'name':'Mace','bonus':4,'damage':'1d6+2 Bludgeoning'}],'inventory':[],
 'conditions':[],'features':[],'actions':[],'roll_history':[],'effects':{},'notes':'',
 'resources':{'First-level Spell Slots':{'current':2,'max':2,'reset':'long rest'}},
 'spells':[{'id':'spell-1','name':'Bless','level':1,'prepared':True,'casting_time':'1 action','duration':'Concentration, up to 1 minute'}]}
with sync_playwright() as pw:
 browser=launch_chromium(pw)
 page=browser.new_page(viewport={'width':1440,'height':900})
 errors=[];page.on('pageerror',lambda e: errors.append(str(e)))
 page.set_content((R/'web/index.html').read_text(),wait_until='domcontentloaded')
 page.add_style_tag(content=(R/'web/styles.css').read_text())
 cat=json.loads((R/'web/dnd-2014-reference.json').read_text())
 page.evaluate('''(values)=>{
  window.testVault={schema_version:1,active_id:'a',characters:[{id:'a',character:values.hero,updated_at:'2026'}]};
  window.fetch=async(url,init={})=>{
   if(url==='/api/vault'){
    if(init.method==='POST'){window.testVault=JSON.parse(init.body);return new Response('{"saved":true}',{status:200});}
    return new Response(JSON.stringify(window.testVault),{status:200});
   }
   if(url==='./theme-assets.json')return new Response('{"version":1,"assets":{}}',{status:200});
   if(url==='./dnd-2014-reference.json')return new Response(JSON.stringify(values.cat),{status:200});
   return new Response('{}',{status:404});
  };
 }''',{'hero':hero,'cat':cat})
 for fname in ['dnd-slots.js','character-import.js','vault-store.js','dnd-action.js','reference-catalog.js','browser-pdf.js','dice-physics.js','app.js']:
  page.add_script_tag(content=(R/'web'/fname).read_text())
 page.wait_for_function('document.querySelector(".page-title")?.textContent==="Legacy Caster"')
 assert page.evaluate('character.resources["Level 1 Spell Slots"].current')==2
 assert page.locator('.hud-resources').inner_text().count('Level 1 Spell Slots')==1
 page.get_by_role('tab',name='Spells').click()
 spell=page.locator('.spell-entry').filter(has_text='Bless');spell.locator('summary').click()
 assert spell.locator('[data-slot-choice]').locator('option').count()==1
 spell.get_by_role('button',name='Cast spell').click();page.locator('#dlg-yes').click()
 assert page.evaluate('character.resources["Level 1 Spell Slots"].current')==1
 page.wait_for_function('window.testVault.characters[0].character.resources["Level 1 Spell Slots"]?.current===1')
 page.get_by_role('tab',name='Actions').click()
 page.evaluate("()=>{const target=Action.addTarget(character,{name:'Practice Opponent',ac:15,hp:25});selectedTargetId=target.id;render();}")
 page.locator('#dice-widget > summary').click() if page.locator('#dice-widget').get_attribute('open') is None else None
 page.locator('#d20-mode').select_option('advantage')
 page.locator('#dice-widget > summary').click() # Close floating controls before hitting the sheet
 page.evaluate("handleAction('tracked-attack','0')")
 assert page.evaluate('pendingRoll.count')==2
 assert page.evaluate('pendingRoll.d20Mode')=='advantage'
 page.evaluate('''()=>{
   beginThrow();const id=activeRoll.diceIds; const values=new Map([[id[0],3],[id[1],20]]);
   DP.faceValue=die=>values.get(die.id)||10;
   for(const die of dice.filter(d=>id.includes(d.id)))die.sleeping=true;
   finishRollIfSettled();
 }''')
 assert page.evaluate('lastResult.total')==24
 assert page.evaluate('lastResult.outcome')=='CRITICAL HIT'
 assert page.evaluate('lastAttackOutcome') is None
 # Auto mode prepares damage dice immediately after a confirmed critical hit.
 assert page.evaluate('pendingRoll?.expression')=='2d6+2'
 page.evaluate('''()=>{beginThrow();for(const g of activeRolls)for(const d of dice.filter(x=>g.diceIds.includes(x.id)))d.sleeping=true;finishRollIfSettled();}''')
 assert page.evaluate('lastAttackOutcome') is None
 # A *normal* natural 20 must also auto-stage doubled damage dice, not only advantage.
 page.locator('#dice-widget > summary').click()
 page.locator('#d20-mode').select_option('normal')
 page.locator('#dice-widget > summary').click()
 page.evaluate("handleAction('tracked-attack','0')")
 page.evaluate('''()=>{beginThrow();DP.faceValue=()=>20;for(const d of dice.filter(x=>activeRoll.diceIds.includes(x.id)))d.sleeping=true;finishRollIfSettled();}''')
 assert page.evaluate('lastResult.outcome')=='CRITICAL HIT'
 assert page.evaluate('pendingRoll.expression')=='2d6+2'
 assert not errors,errors
 print('Browser legacy slots, single pool, cast, advantage, critical damage, no JS errors PASS')
 browser.close()
