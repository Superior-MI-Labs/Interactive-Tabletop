"""End-to-end regression for typed rolls, self-only scopes and effect lifetime."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
hero={
 'schema_version':1,'system_id':'dnd5e','system_edition':'dnd-2014','rules_profile':'srd-2014',
 'name':'Automation Test Hero','class_level':'Cleric 4','species':'Human','background':'',
 'hp':{'max':32,'current':28,'temp':0},'ac':16,'initiative':0,'proficiency':2,'speed':'30 ft',
 'abilities':{'WIS':{'score':18,'modifier':4}},'saves':{'Wisdom':6,'Constitution':4},'skills':{'Medicine':6},
 'attacks':[{'name':'Mace','bonus':5,'damage':'1d6+3 bludgeoning'}], 'inventory':[],'conditions':[],
 'features':[],'actions':[],'roll_history':[], 'effects':{},
 'resources':{'Level 1 Spell Slots':{'max':3,'current':3,'reset':'long rest'}},
 'spells':[{'id':'bless','name':'Bless','level':1,'source':'Cleric','prepared':True,'casting_time':'1 action'},
           {'id':'resistance','name':'Resistance','level':0,'source':'Cleric','prepared':True,'casting_time':'1 action'}]
}
with sync_playwright() as pw:
 browser=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1450,'height':940});errors=[]
 page.on('pageerror',lambda error:errors.append(str(error)))
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
 for file in ['dnd-slots.js','character-import.js','vault-store.js','dnd-action.js','reference-catalog.js','browser-pdf.js','dice-physics.js','app.js']:
  page.add_script_tag(content=(ROOT/'web'/file).read_text())
 page.wait_for_function("document.querySelector('.page-title')?.textContent==='Automation Test Hero' && ReferenceCatalog.ready()")
 page.get_by_role('tab',name='Spells').click()
 bless=page.locator('.spell-entry').filter(has_text='Bless');bless.locator('summary').click()
 bless.get_by_role('button',name='Cast spell').click()
 assert 'attack / save' in page.locator('#dialog-layer').inner_text()
 page.locator('#dlg-yes').click()
 assert page.evaluate("character.resources['Level 1 Spell Slots'].current") == 2
 assert page.evaluate("Action.activeEffects(character)[0].bonus_mode")=='sustained'
 assert page.get_by_role('checkbox',name='Automatically use Bless').is_checked()
 page.get_by_role('tab',name='Actions').click()
 attack=page.get_by_role('button',name='Attack',exact=True).first
 attack.focus();page.keyboard.press('Enter')
 assert page.evaluate("pendingRoll?.rollKind === 'attack' && pendingRoll.bonuses?.length === 1 && pendingRoll.count === 2")
 page.evaluate('''()=>{beginThrow();for(const d of dice.filter(d=>activeRoll?.diceIds.includes(d.id))){d.sleeping=true;d.rolling=false;}finishRollIfSettled();}''')
 assert page.evaluate("history[0].bonuses[0].name")=='Bless'
 assert page.evaluate('Action.activeEffects(character).length')==1,'Sustained Bless remains after attack'
 medicine=page.get_by_role('button',name='Medicine',exact=False)
 medicine.focus();page.keyboard.press('Enter')
 assert page.evaluate('pendingRoll?.bonuses?.length')==0,'Bless does not affect ability check'
 page.evaluate('''()=>{beginThrow();for(const d of dice.filter(d=>activeRoll?.diceIds.includes(d.id))){d.sleeping=true;d.rolling=false;}finishRollIfSettled();}''')
 saving=page.get_by_role('button',name='Wisdom save',exact=False)
 saving.focus();page.keyboard.press('Enter')
 assert page.evaluate("pendingRoll?.rollKind === 'save' && pendingRoll.bonuses.length === 1")
 page.evaluate('''()=>{beginThrow();for(const d of dice.filter(d=>activeRoll?.diceIds.includes(d.id))){d.sleeping=true;d.rolling=false;}finishRollIfSettled();}''')
 assert page.evaluate('history[0].bonuses[0].name')=='Bless'
 auto=page.get_by_role('checkbox',name='Automatically use Bless')
 auto.focus();page.keyboard.press('Space')
 assert page.evaluate('Action.activeEffects(character)[0].auto_use') is False
 saving.focus();page.keyboard.press('Enter')
 assert page.evaluate('pendingRoll.bonuses.length')==0
 page.evaluate('''()=>{beginThrow();for(const d of dice.filter(d=>activeRoll?.diceIds.includes(d.id))){d.sleeping=true;d.rolling=false;}finishRollIfSettled();}''')
 page.evaluate("Action.endEffect(character,'spell:bless');render()")
 page.get_by_role('tab',name='Spells').focus();page.keyboard.press('Enter')
 resist=page.locator('.spell-entry').filter(has_text='Resistance');resist.locator('summary').click()
 resist.get_by_role('button',name='Cast spell').click();page.locator('#dlg-yes').click()
 assert page.evaluate('Action.activeEffects(character)[0].bonus_mode')=='charge'
 saving.focus();page.keyboard.press('Enter')
 assert page.evaluate("pendingRoll.bonuses[0].name === 'Resistance'")
 page.evaluate('''()=>{beginThrow();for(const d of dice.filter(d=>activeRoll?.diceIds.includes(d.id))){d.sleeping=true;d.rolling=false;}finishRollIfSettled();}''')
 assert page.evaluate('history[0].bonuses[0].name')=='Resistance'
 assert page.evaluate('Action.activeEffects(character).length')==0
 assert page.get_by_role('checkbox',name='Automatically use Resistance').count()==0
 assert not errors,errors
 browser.close()
 print('PASS browser Bless attack + saving throw sustained, self scoped, toggle, Medicine excluded; Resistance save charge consumed and removed')
