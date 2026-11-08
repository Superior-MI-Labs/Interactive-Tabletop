"""Browser DOM regression with in-memory HTTP adapter; Chromium policy blocks URLs in this environment.
    Full URL-based smoke and actual IndexedDB persistence remain a separate release gate.
"""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_support import launch_chromium

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
    browser=launch_chromium(p)
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
    for f in ['dnd-slots.js','character-import.js','vault-store.js','dnd-action.js','browser-pdf.js','dice-physics.js','app.js']:
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
    # Reimport preview is read-only and reports the actual vault matching rules.
    page.evaluate('''()=>{
      character.spells=[
       {id:'spell-0',name:'Shield',level:1,source:'Wizard',prepared:true,notes:'DM confirmed'},
       {id:'spell-1',name:'Cure Wounds',level:1,source:'Cleric / Wizard',prepared:true,spellcasting_ability:'WIS'},
       {id:'spell-2',name:'Disguise Self',level:1,source:'Bard',prepared:false},
       {id:'spell-3',name:'Duplicated',level:1,source:'Wizard',prepared:true,notes:'Old duplicate ruling'},
       {id:'manual-spell-existing',name:'Shield',level:1,source:'Wizard',prepared:true,automation:'manual'}
      ];
      save();render();
    }''')
    existing_state=page.evaluate('JSON.stringify(character)')
    fresh_spellbook={**changed,'spells':[
     {'id':'spell-7','name':'Shield','level':1,'source':'Wizard','prepared':False},
     {'id':'spell-8','name':'Cure Wounds','level':1,'source':'Cleric','prepared':False},
     {'id':'spell-9','name':'Healing Word','level':1,'source':'Cleric','prepared':False},
     {'id':'spell-10','name':'Duplicated','level':1,'source':'Wizard','prepared':False},
     {'id':'spell-11','name':'Duplicated','level':1,'source':'Wizard','prepared':False}
    ]}
    page.set_viewport_size({'width':390,'height':730})
    page.evaluate('(ch)=>acceptImport(ch,"pdf")',fresh_spellbook)
    dlg=page.locator('#dialog-layer .dialog')
    assert dlg.is_visible()
    preview_text=dlg.inner_text()
    for phrase in ('Added imported spells (1): Healing Word',
                   'Removed imported spells (1): Disguise Self',
                   'Ambiguous imported spell matches (1): Duplicated',
                   'Source labels changed; prior settings retained (1): Cure Wounds',
                   'Player-authored spell entries preserved independently: 1'):
        assert phrase in preview_text,phrase
    assert page.evaluate('JSON.stringify(character)')==existing_state,'Opening preview must not change gameplay state'
    assert dlg.evaluate('(el)=>getComputedStyle(el).overflowY === "auto"'),'Long reviews scroll on mobile'
    page.locator('#dlg-no').click()
    assert page.evaluate('JSON.stringify(character)')==existing_state,'Cancel must leave all gameplay records untouched'
    page.evaluate('(ch)=>acceptImport(ch,"pdf")',fresh_spellbook)
    page.locator('#dlg-yes').click()
    page.wait_for_function("character.spells.length === 6")
    final_spells=page.evaluate('character.spells')
    shield=next(x for x in final_spells if x['name']=='Shield' and not x['id'].startswith('manual-spell-'))
    cure=next(x for x in final_spells if x['name']=='Cure Wounds')
    assert shield['prepared'] and shield['notes']=='DM confirmed'
    assert cure['prepared'] and cure['spellcasting_ability']=='WIS'
    assert len([x for x in final_spells if x['name']=='Duplicated'])==2
    assert all('notes' not in x for x in final_spells if x['name']=='Duplicated')
    assert not any(x['name']=='Disguise Self' for x in final_spells)
    assert any(x['id']=='manual-spell-existing' for x in final_spells)
    # Untrusted PDF spell names remain escaped, never parsed into modal HTML.
    injected={**fresh_spellbook,'spells':fresh_spellbook['spells']+[
       {'id':'spell-99','name':'<img src=x onerror=alert(1)>','level':1,'source':'Wizard','prepared':False}
    ]}
    page.evaluate('(ch)=>acceptImport(ch,"pdf")',injected)
    assert page.locator('#dialog-layer .dialog img').count()==0
    assert '<img src=x onerror=alert(1)>' in page.locator('#dialog-layer .dialog').inner_text()
    page.locator('#dlg-no').click()
    assert page.evaluate('character.spells.length')==6
    page.set_viewport_size({'width':1440,'height':900})
    page.locator('#vault-open').click()
    with page.expect_download() as down:page.locator('#vault-backup').click()
    backup=json.loads(Path(down.value.path()).read_text())
    assert len(backup['characters'])==2
    assert backup['characters'][0]['character']['notes']=='Private session notes'
    assert not errors,errors
    print('PASS: actual DOM, switching, reimport confirmation, HP preservation, downloadable full backup; no JS errors')
    browser.close()
