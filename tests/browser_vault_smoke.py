"""Browser DOM regression with in-memory HTTP adapter; Chromium policy blocks URLs in this environment.
    Full URL-based smoke and actual IndexedDB persistence remain a separate release gate.
"""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

root=Path(__file__).resolve().parents[1]
old={'schema_version':1,'name':'Sky Blue Eyes','player':'Sample Player','class_level':'Monk 19',
     'species':'Tabaxi','background':'Haunted One','hp':{'max':203,'current':93,'temp':2},
     'ac':35,'initiative':12,'proficiency':6,'speed':'70 ft. (Walking)',
     'abilities':{'STR':{'score':10,'modifier':0},'DEX':{'score':28,'modifier':9}},
     'saves':{'Dexterity':19},'skills':{'Acrobatics':15},'inventory':[],
     'attacks':[{'name':'Claws','bonus':15,'damage':'1d10+9'}],
     'resources':{'Ki':{'current':8,'max':19,'reset':'short rest'}},
     'actions':[{'id':'manual-1','name':'Phoenix Healing','source':'manual','description':'Custom rule'}],
     'spells':[],'roll_history':[],'effects':{},'conditions':[],
     'notes':'Private session notes','homebrew_notes':'DM approved'}
new={**old,'name':'Witty Rose','player':'Different Player','class_level':'Bard 19','hp':{'max':117,'current':117,'temp':0},'resources':{}}
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1440,'height':900},accept_downloads=True)
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    # The Chromium container blocks every navigation via policy. Set the full DOM and
    # actual app scripts directly, with a minimal in-memory /api/vault transport.
    page.set_content((root/'web/index.html').read_text(),wait_until='domcontentloaded')
    page.add_style_tag(content=(root/'web/styles.css').read_text())
    page.evaluate('''(old)=>{
      window.__testVault={schema_version:1,active_id:'legacy-character',characters:[{id:'legacy-character',character:old,updated_at:'2026'}]};
      window.fetch=async(url,init={})=>{
        if(url==='/api/vault'){
          if(init.method==='POST'){window.__testVault=JSON.parse(init.body);return new Response('{"saved":true}',{status:200});}
          return new Response(JSON.stringify(window.__testVault),{status:200});
        }
        if(url==='./theme-assets.json')return new Response('{"version":1,"assets":{}}',{status:200});
        return new Response('{}',{status:404});
      };
    }''',old)
    for f in ['character-import.js','vault-store.js','dnd-action.js','browser-pdf.js','dice-physics.js','app.js']:
        page.add_script_tag(content=(root/'web'/f).read_text())
    page.wait_for_function('document.querySelector(".page-title")?.textContent==="Sky Blue Eyes"')
    assert page.locator('#vault-count').inner_text()=='(1)'
    page.locator('#vault-open').click();assert page.locator('.vault-card').count()==1
    page.locator('#vault-close').click()
    page.evaluate('(ch)=>acceptImport(ch,"pdf")',new)
    page.wait_for_function('document.querySelector("#vault-count")?.textContent==="(2)"')
    assert page.locator('.page-title').inner_text()=='Witty Rose'
    page.locator('#vault-open').click()
    page.locator('.vault-card').filter(has_text='Sky Blue Eyes').get_by_role('button',name='Play').click()
    assert page.locator('.page-title').inner_text()=='Sky Blue Eyes'
    changed={**old,'class_level':'Monk 20','hp':{'max':222,'current':222,'temp':0},'resources':{'Ki':{'current':20,'max':20,'reset':'short rest'}},'notes':''}
    page.evaluate('(ch)=>acceptImport(ch,"pdf")',changed)
    assert page.locator('#dialog-layer').is_visible()
    page.locator('#dlg-yes').click()
    page.wait_for_function('document.querySelector(".hp-total")?.textContent.includes("222")')
    assert '93' in page.locator('.hp-total').inner_text()
    page.locator('#vault-open').click()
    with page.expect_download() as down:page.locator('#vault-backup').click()
    backup=json.loads(Path(down.value.path()).read_text())
    assert len(backup['characters'])==2
    assert backup['characters'][0]['character']['notes']=='Private session notes'
    page.screenshot(path=str(root/'vault-preview.png'),full_page=True)
    assert not errors,errors
    print('PASS: actual DOM, switching, reimport confirmation, HP preservation, downloadable full backup; no JS errors')
    browser.close()
