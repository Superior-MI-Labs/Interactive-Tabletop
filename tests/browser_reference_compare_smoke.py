"""Compare imported SRD fields, edit existing spell, and create inert reference action."""
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_support import launch_chromium
import json
ROOT=Path(__file__).resolve().parents[1]
hero={'schema_version':1,'system_id':'dnd5e','system_edition':'unspecified','name':'Synthetic Cleric','player':'QA','class_level':'Cleric 3','species':'Human','background':'','hp':{'current':10,'max':20,'temp':0},'ac':12,'initiative':0,'proficiency':2,'speed':'30 ft.','abilities':{'WIS':{'score':16,'modifier':3}},'saves':{'Wisdom':5},'skills':{'Insight':5},'attacks':[],'resources':{'Level 1 Spell Slots':{'current':2,'max':4,'reset':'long rest'}},'inventory':[],'spells':[{'id':'sp1','name':'Bless','level':1,'casting_time':'1 action','range':'35 feet','components':'V,S,M','duration':'Concentration, up to 1 minute','prepared':True,'available':True,'source':'PDF'}], 'conditions':[], 'features':[], 'actions':[], 'roll_history':[], 'effects':{}, 'notes':''}
with sync_playwright() as p:
 b=launch_chromium(p)
 page=b.new_page(viewport={'width':1366,'height':900})
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content((ROOT/'web/index.html').read_text(),wait_until='domcontentloaded')
 page.add_style_tag(content=(ROOT/'web/styles.css').read_text())
 cat=json.loads((ROOT/'web/dnd-2014-reference.json').read_text())
 page.evaluate('''([hero,cat])=>{window.__testVault={schema_version:1,active_id:'hero',characters:[{id:'hero',character:hero,updated_at:'2026'}]};window.fetch=async(url,init={})=>{if(url==='/api/vault'){if(init.method==='POST'){window.__testVault=JSON.parse(init.body);return new Response('{"saved":true}',{status:200});}return new Response(JSON.stringify(window.__testVault),{status:200});}if(url==='./theme-assets.json')return new Response('{"version":1,"assets":{}}',{status:200});if(url==='./dnd-2014-reference.json')return new Response(JSON.stringify(cat),{status:200});return new Response('{}',{status:404});}}''',[hero,cat])
 for f in ['dnd-slots.js','character-import.js','vault-store.js','dnd-action.js','reference-catalog.js','browser-pdf.js','dice-physics.js','app.js']:
  page.add_script_tag(content=(ROOT/'web'/f).read_text())
 page.wait_for_function("document.querySelector('.page-title')?.textContent==='Synthetic Cleric' && ReferenceCatalog.ready()")
 page.get_by_role('tab',name='Spells').click()
 page.locator('.spell-entry summary').click()
 page.locator('.reference-pill').click()
 assert page.get_by_role('heading',name='Compare with your character').is_visible()
 assert 'Review' in page.locator('.compare-review').inner_text()
 assert page.evaluate('character.spells[0].range')=='35 feet'
 page.get_by_role('button',name='Open imported spell').click()
 assert page.locator('#reference-layer').is_hidden()
 assert page.locator('.spell-entry').count()==1
 assert page.evaluate('character.spells[0].range')=='35 feet'
 page.get_by_role('tab',name='Reference').click()
 page.locator('#catalog-search').fill('command')
 page.locator('.reference-item:visible').filter(has_text='Command').first.click()
 assert page.get_by_role('button',name='Create unconfigured action draft').is_visible()
 page.get_by_role('button',name='Create unconfigured action draft').click()
 assert page.locator('#dialog-layer').is_visible()
 page.locator('#dlg-no').click()
 assert page.evaluate('character.actions.length')==0
 page.get_by_role('button',name='Create unconfigured action draft').click()
 page.locator('#dlg-yes').click()
 assert page.evaluate('character.actions.length')==1
 assert page.evaluate('character.actions[0].cost')==0
 assert page.evaluate('character.actions[0].roll')==''
 assert page.evaluate('character.spells.length')==1
 assert page.evaluate('character.hp.current')==10
 assert page.evaluate('character.resources["Level 1 Spell Slots"].current')==2
 assert not errors,errors
 b.close()
 print('Reference comparison, edit navigation, cancel and inert draft browser PASS')
