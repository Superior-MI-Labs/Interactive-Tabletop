'''Real browser: prepared/in-flight dice cannot cross a vault character boundary.'''
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_support import launch_chromium
ROOT=Path(__file__).resolve().parents[1]
base={
 'schema_version':1,'system_id':'dnd5e','system_edition':'dnd-2014','name':'Owner A',
 'class_level':'Fighter 2','species':'Human','background':'',
 'hp':{'current':18,'max':18,'temp':0},'ac':15,'initiative':1,'proficiency':2,'speed':'30 ft',
 'abilities':{},'saves':{},'skills':{},'inventory':[],'conditions':[],'features':[],
 'roll_history':[],'effects':{},'spells':[],'resources':{},'actions':[],
 'attacks':[{'id':'sword','name':'Sword','bonus':5,'damage':'1d8+3','attack_type':'weapon'}]
}
with sync_playwright() as pw:
 browser=launch_chromium(pw)
 page=browser.new_page(viewport={'width':1400,'height':900});page.set_default_timeout(7500);errors=[]
 page.on('pageerror',lambda error:errors.append(str(error)))
 page.set_content((ROOT/'web/index.html').read_text(),wait_until='domcontentloaded')
 page.add_style_tag(content=(ROOT/'web/styles.css').read_text())
 page.evaluate('''base=>{
 const a=structuredClone(base),b=structuredClone(base);b.name='Owner B';
 window.testVault={schema_version:1,active_id:'a',characters:[{id:'a',character:a,updated_at:'2026'},{id:'b',character:b,updated_at:'2026'}]};
 window.fetch=async(url,opt={})=>{
  if(url==='/api/vault'){
   if(opt.method==='POST'){window.testVault=JSON.parse(opt.body);return new Response('{}',{status:200});}
   return new Response(JSON.stringify(window.testVault),{status:200});
  }
  if(url==='./theme-assets.json')return new Response('{"version":1,"assets":{}}',{status:200});
  return new Response('{}',{status:404});
 };}''',base)
 for name in ['dnd-slots.js','character-import.js','vault-store.js','dnd-action.js','browser-pdf.js','dice-physics.js','app.js']:
  page.add_script_tag(content=(ROOT/'web'/name).read_text())
 page.wait_for_function("document.querySelector('.page-title')?.textContent==='Owner A'")
 page.evaluate("()=>{Action.setEncounter(character,true);const target=Action.addTarget(character,{name:'Ownership Dummy',ac:15,hp:30});selectedTargetId=target.id;render();}")
 page.evaluate("handleAction('attack','0')")
 assert page.evaluate('pendingRoll.combatAttack') is True
 assert page.evaluate('pendingRoll.characterId')=='a'
 assert page.evaluate("character.effects.combat.economy.spent.action")==0
 page.evaluate("activateCharacter('b')")
 assert page.evaluate('activeId')=='b'
 assert page.evaluate('pendingRoll') is None
 assert page.evaluate('dice.filter(d=>d.ready).length')==0
 assert page.evaluate("Action.combat(character).economy.spent.action")==0
 page.evaluate("activateCharacter('a')")
 page.evaluate("()=>{selectedTargetId=Action.targets(character)[0].id;render();}")
 page.evaluate("handleAction('attack','0')")
 page.evaluate("beginThrow()")
 assert page.evaluate('activeRolls.length')==1
 assert page.evaluate("Action.combat(character).economy.spent.action")==1
 page.evaluate("activateCharacter('b')")
 assert page.evaluate('activeId')=='b'
 page.evaluate('''()=>{for(const g of activeRolls)for(const d of dice.filter(d=>g.diceIds.includes(d.id))){d.sleeping=true;d.rolling=false;}finishRollIfSettled();}''')
 assert page.evaluate('history.length')==0
 assert page.evaluate('activeRolls.length')==0
 assert page.evaluate("Action.combat(character).economy.spent.action")==0
 assert page.evaluate('character.hp.current')==18
 page.evaluate("activateCharacter('a')")
 assert page.evaluate('character.effects.combat.economy.spent.action')==1
 assert page.evaluate('history.length')==0
 assert not errors,errors
 browser.close()
 print('PASS vault roll ownership: switching clears prepared dice and isolates in-flight results')
