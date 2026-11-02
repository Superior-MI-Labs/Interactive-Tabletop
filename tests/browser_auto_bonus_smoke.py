"""Physical mixed-dice roll, advantage, per-effect toggling and reservation."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright
from browser_support import launch_chromium
ROOT=Path(__file__).resolve().parents[1]
hero={'schema_version':1,'system_id':'dnd5e','system_edition':'dnd-2014','name':'QA Cleric','class_level':'Cleric 2','species':'Human',
      'hp':{'current':15,'max':20,'temp':0},'ac':14,'initiative':1,'proficiency':2,'speed':'30 ft',
      'abilities':{'WIS':{'score':18,'modifier':4}},'saves':{'Constitution':5,'Wisdom':6},'skills':{'Medicine':6},
      'attacks':[], 'inventory':[],'spells':[],'conditions':[],'features':[],'actions':[],'roll_history':[],
      'resources':{},'effects':{'active':[{'id':'spell:guidance','name':'Guidance','charges':1,'bonus_dice':'1d4',
                                 'target':'self','concentration':True,'rounds_remaining':10}]}}
with sync_playwright() as pw:
 browser=launch_chromium(pw)
 page=browser.new_page(viewport={'width':1366,'height':900});errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content((ROOT/'web/index.html').read_text(),wait_until='domcontentloaded')
 page.add_style_tag(content=(ROOT/'web/styles.css').read_text())
 catalog=json.loads((ROOT/'web/dnd-2014-reference.json').read_text())
 page.evaluate('''([hero,catalog])=>{
   window.fetch=async(url,options={})=>{
    if(url==='/api/vault')return new Response(JSON.stringify({schema_version:1,active_id:'hero',characters:[{id:'hero',character:hero,updated_at:'2026'}]}),{status:200});
    if(url==='./theme-assets.json')return new Response('{"version":1,"assets":{}}',{status:200});
    if(url==='./dnd-2014-reference.json')return new Response(JSON.stringify(catalog),{status:200});
    return new Response('{}',{status:404});
   };
 }''',[hero,catalog])
 for filename in ['dnd-slots.js','character-import.js','vault-store.js','dnd-action.js','reference-catalog.js','browser-pdf.js','dice-physics.js','app.js']:
  page.add_script_tag(content=(ROOT/'web'/filename).read_text())
 page.wait_for_function("document.querySelector('.page-title')?.textContent==='QA Cleric'")
 assert page.get_by_role('checkbox',name='Automatically use Guidance').is_checked()
 # Saving throws and attack-like actions are not eligible.
 page.get_by_role('button',name='Wisdom save',exact=False).focus();page.keyboard.press('Enter')
 assert page.evaluate('pendingRoll.bonuses.length')==0
 # Advantage + skill: exactly two primary d20 and one bonus d4.
 page.evaluate("document.getElementById('d20-mode').value='advantage'")
 skill=page.get_by_role('button',name='Medicine',exact=False)
 skill.focus();page.keyboard.press('Enter')
 assert page.evaluate('pendingRoll.primaryCount')==2
 assert page.evaluate('pendingRoll.count')==3
 assert page.evaluate('pendingRoll.bonuses[0].expression')=='1d4'
 # Mouse grabbing can alter display order; group die IDs preserve roll roles.
 page.evaluate('''()=>{
   beginThrow();const group=activeRolls[0];
   const faces=group.diceIds.map(id=>dice.find(d=>d.id===id));
   for(let i=0;i<faces.length;i++){faces[i].sleeping=true;faces[i].y=1000-i*100;}
   dice.sort((a,b)=>a.y-b.y);
 }''')
 # Same effect is reserved while first physical group is still rolling.
 # This assertion tests bonus reservation, not keyboard focus. Trigger the control
 # directly so an in-flight dice animation cannot steal browser focus.
 skill.evaluate('(element)=>element.click()')
 page.wait_for_function('pendingRoll !== null')
 assert page.evaluate('pendingRoll.bonuses.length')==0
 page.evaluate('''()=>{beginThrow();for(const d of dice)if(!d.held)d.sleeping=true;finishRollIfSettled();}''')
 outcome=page.evaluate('''()=>history.find(r=>r.bonuses?.some(b=>b.name==='Guidance'))''')
 assert outcome and len(outcome['bonuses'])==1,outcome
 assert outcome['total']==outcome['baseTotal']+outcome['bonuses'][0]['total'],outcome
 assert outcome['mode']=='advantage' and len(outcome['parts'])==2,outcome
 assert page.evaluate('character.effects.active.length')==0
 assert not errors,errors
 browser.close()
 print('PASS Guidance d20+d4, advantage, stable role order, in-flight reservation, noneligible saves and once-only spending')
