"""End-to-end 2014 Healing Word: vetted bonus-action self healing and upcast."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
hero={
 'schema_version':1,'system_id':'dnd5e','system_edition':'dnd-2014','rules_profile':'srd-2014',
 'name':'Healing Word QA','class_level':'Cleric 4','species':'Human','background':'',
 'hp':{'max':28,'current':6,'temp':0},'ac':16,'initiative':0,'proficiency':2,'speed':'30 ft',
 'abilities':{'WIS':{'score':18,'modifier':4}},'saves':{'Constitution':4},'skills':{},'attacks':[],
 'inventory':[],'conditions':[],'features':[],'actions':[],'roll_history':[],'effects':{},
 'resources':{'Level 1 Spell Slots':{'max':3,'current':3},'Level 2 Spell Slots':{'max':2,'current':2}},
 'spells':[{'id':'healingword','name':'Healing Word','level':1,'source':'Cleric','prepared':True,'casting_time':'1 bonus action'}]
}
with sync_playwright() as pw:
 browser=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1400,'height':900});errors=[]
 page.on('pageerror',lambda error:errors.append(str(error)))
 page.set_content((ROOT/'web/index.html').read_text(),wait_until='domcontentloaded')
 page.add_style_tag(content=(ROOT/'web/styles.css').read_text())
 catalog=json.loads((ROOT/'web/dnd-2014-reference.json').read_text())
 page.evaluate('''([hero,catalog])=>{
  window.testHero=hero;
  window.fetch=async(url,opts={})=>{
   if(url==='/api/vault'){
    if(opts.method==='POST'){window.savedVault=JSON.parse(opts.body);return new Response('{"saved":true}',{status:200});}
    return new Response(JSON.stringify(window.savedVault||{schema_version:1,active_id:'hero',characters:[{id:'hero',character:hero,updated_at:'2026'}]}),{status:200});
   }
   if(url==='./theme-assets.json')return new Response('{"version":1,"assets":{}}',{status:200});
   if(url==='./dnd-2014-reference.json')return new Response(JSON.stringify(catalog),{status:200});
   return new Response('{}',{status:404});
  };
 }''',[hero,catalog])
 for filename in ['dnd-slots.js','character-import.js','vault-store.js','dnd-action.js','reference-catalog.js','browser-pdf.js','dice-physics.js','app.js']:
  page.add_script_tag(content=(ROOT/'web'/filename).read_text())
 page.wait_for_function("document.querySelector('.page-title')?.textContent==='Healing Word QA' && ReferenceCatalog.ready()")
 page.get_by_role('tab',name='Spells').click()
 word=page.locator('.spell-entry').filter(has_text='Healing Word');word.locator('summary').click()
 word.get_by_role('button',name='Cast spell').click()
 assert '2d4' not in page.locator('#dialog-layer').inner_text()
 assert '1d4+4' in page.locator('#dialog-layer').inner_text()
 page.locator('#dlg-no').click()
 assert page.evaluate("character.resources['Level 1 Spell Slots'].current") == 3
 word=page.locator('.spell-entry').filter(has_text='Healing Word')
 word.locator('[data-slot-choice]').select_option('2')
 word.get_by_role('button',name='Cast spell').click()
 assert '2d4+4' in page.locator('#dialog-layer').inner_text()
 page.locator('#dlg-yes').click()
 assert page.evaluate("character.resources['Level 2 Spell Slots'].current") == 1
 assert page.evaluate('character.hp.current')==6,'Healing is not applied before physical dice settle.'
 assert page.evaluate("pendingRoll.expression==='2d4+4' && pendingRoll.count===2")
 page.evaluate('''()=>{beginThrow();for(const d of dice.filter(d=>activeRoll?.diceIds.includes(d.id))){d.sleeping=true;d.rolling=false;}finishRollIfSettled();}''')
 page.locator('#dice-widget > summary').click()
 assert page.locator('#roll-effect').get_by_role('button',name='Apply to HP').is_visible()
 rolled=page.evaluate('lastResult.total')
 page.locator('#roll-effect').get_by_role('button',name='Apply to HP').click()
 assert page.evaluate('character.hp.current')==min(28,6+rolled)
 assert not errors,errors
 browser.close()
 print('PASS browser Healing Word: canceled cast, upcast d4, 1 slot debited, settled roll, explicit self healing and zero page errors')
