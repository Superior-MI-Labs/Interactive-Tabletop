# End-to-end UI gate for 2014 bonus-action spell rule and optional tracker.
from pathlib import Path
import json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
hero={
 'schema_version':1,'system_id':'dnd5e','system_edition':'dnd-2014','rules_profile':'srd-2014',
 'name':'Turn QA','class_level':'Cleric 4','species':'Human','background':'',
 'hp':{'max':28,'current':16,'temp':0},'ac':16,'initiative':0,'proficiency':2,'speed':'30 ft',
 'abilities':{'WIS':{'score':18,'modifier':4}},'saves':{},'skills':{},'attacks':[],
 'inventory':[],'conditions':[],'features':[],'actions':[],'roll_history':[],'effects':{},
 'resources':{'Level 1 Spell Slots':{'max':4,'current':4}},
 'spells':[
  {'id':'shield','name':'Shield of Faith','level':1,'source':'Cleric','prepared':True,'casting_time':'1 bonus action'},
  {'id':'cw','name':'Cure Wounds','level':1,'source':'Cleric','prepared':True,'casting_time':'1 action'},
  {'id':'sf','name':'Sacred Flame','level':0,'source':'Cleric','prepared':True,'casting_time':'1 action'},
  {'id':'bless','name':'Bless','level':1,'source':'Cleric','prepared':True,'casting_time':'1 action'}]
}
with sync_playwright() as pw:
 browser=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1400,'height':900});page.set_default_timeout(4500);errors=[]
 page.on('pageerror',lambda error:errors.append(str(error)))
 page.set_content((ROOT/'web/index.html').read_text(),wait_until='domcontentloaded')
 page.add_style_tag(content=(ROOT/'web/styles.css').read_text())
 catalog=json.loads((ROOT/'web/dnd-2014-reference.json').read_text())
 page.evaluate('''([hero,catalog])=>{
 window.fetch=async(url,opt={})=>{
  if(url==='/api/vault'){
   if(opt.method==='POST'){window.savedVault=JSON.parse(opt.body);return new Response('{}',{status:200});}
   return new Response(JSON.stringify(window.savedVault||{schema_version:1,active_id:'hero',characters:[{id:'hero',character:hero,updated_at:'2026'}]}),{status:200});
  }
  if(url==='./theme-assets.json')return new Response('{"version":1,"assets":{}}',{status:200});
  if(url==='./dnd-2014-reference.json')return new Response(JSON.stringify(catalog),{status:200});
  return new Response('{}',{status:404});
 };
 }''',[hero,catalog])
 for filename in ['dnd-slots.js','character-import.js','vault-store.js','dnd-action.js','reference-catalog.js','browser-pdf.js','dice-physics.js','app.js']:
  page.add_script_tag(content=(ROOT/'web'/filename).read_text())
 page.wait_for_function("document.querySelector('.page-title')?.textContent==='Turn QA' && ReferenceCatalog.ready()")
 page.get_by_role('tab',name='Actions').click()
 page.get_by_role('button',name='Start encounter').click()
 page.get_by_role('tab',name='Spells').click()
 def cast(name):
  sp=page.locator('.spell-entry').filter(has_text=name)
  if sp.locator('details').get_attribute('open') is None: sp.locator('summary').click()
  sp.get_by_role('button',name='Cast spell').click()
 cast('Shield of Faith')
 page.locator('#dlg-yes').click()
 assert page.evaluate('character.effects.combat.spellcasting.bonus') is True
 assert page.evaluate('character.resources["Level 1 Spell Slots"].current') == 3
 # Spend no further slots when attempting a leveled 1-action spell.
 cast('Cure Wounds')
 assert page.locator('#dlg-yes').count()==0
 assert page.evaluate('character.resources["Level 1 Spell Slots"].current') == 3
 # A 1-action cantrip remains legal even after a bonus spell.
 cast('Sacred Flame')
 assert page.locator('#dlg-yes').count()==1
 page.locator('#dlg-no').click()
 assert page.evaluate('character.effects.combat.used.action') is False
 page.get_by_role('tab',name='Actions').click()
 assert page.get_by_text('Bonus spell: cantrips only').is_visible()
 page.get_by_role('button',name='Next turn').click()
 assert page.evaluate('character.effects.combat.spellcasting.bonus') is False
 page.get_by_role('tab',name='Spells').click()
 cast('Bless')
 page.locator('#dlg-yes').click()
 assert page.evaluate('character.effects.combat.spellcasting.restricted') is True
 cast('Shield of Faith')
 assert page.locator('#dlg-yes').count()==0
 assert page.evaluate('character.resources["Level 1 Spell Slots"].current') == 2
 assert not errors,errors
 browser.close()
 print('PASS browser casting: bonus spell, same-turn restriction, allowed cantrip, slot safety and next turn')
