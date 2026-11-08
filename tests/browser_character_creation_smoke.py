"""Guided manual creation uses the same vault as imports/demos without guessed rules."""
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_support import launch_chromium
ROOT=Path(__file__).resolve().parents[1]
with sync_playwright() as pw:
 browser=launch_chromium(pw)
 page=browser.new_page(viewport={'width':1180,'height':820})
 page.set_default_timeout(8000)
 errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content((ROOT/'web/index.html').read_text(),wait_until='domcontentloaded')
 page.add_style_tag(content=(ROOT/'web/styles.css').read_text())
 page.evaluate('''()=>{
  window.__STATIC_TABLETOP__=true;
  let snapshot=null;
  window.__creatorStorage=()=>snapshot;
  // Opaque-origin browsers block real IndexedDB; this adapter preserves its
  // asynchronous transaction semantics without bypassing production storage.
  Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:()=>null}});
  Object.defineProperty(window,'indexedDB',{configurable:true,value:{open(){
   const req={};queueMicrotask(()=>{
    req.result={objectStoreNames:{contains:()=>true},close(){},transaction(){
     const tx={};tx.objectStore=()=>({
      get(){const q={};queueMicrotask(()=>{q.result=snapshot;q.onsuccess?.();});return q;},
      put(value){snapshot=JSON.parse(JSON.stringify(value));queueMicrotask(()=>tx.oncomplete?.());}
     });return tx;
    }};req.onsuccess?.();
   });return req;
  }}});
  window.fetch=async(url)=>{
   if(url==='./theme-assets.json')return new Response('{"version":1,"assets":{}}',{status:200});
   return new Response('{}',{status:404});
  };
 }''')
 for f in ['dnd-slots.js','character-import.js','vault-store.js','demo-character.js','dnd-action.js','browser-pdf.js','dice-physics.js','app.js']:
  page.add_script_tag(content=(ROOT/'web'/f).read_text())
 page.wait_for_function("document.querySelector('.page-title')?.textContent==='Mara Vale (Demo)'")
 page.locator('#create-character').click()
 assert page.get_by_role('heading',name='Create your adventurer').is_visible()
 assert page.locator('#vault-count').inner_text()=='(1)'
 page.get_by_role('button',name='Next step').click()
 assert page.locator('#creator-error').is_visible(),'Cannot continue with empty name/class/species'
 assert page.locator('[data-creator-step="0"]').is_visible()
 page.locator('#creator-form [name="name"]').fill('Ilyra Fern')
 page.locator('[name="className"]').fill('Monk')
 page.locator('[name="level"]').fill('3')
 page.locator('[name="species"]').fill('Tabaxi')
 page.locator('[name="background"]').fill('Wanderer')
 page.get_by_role('button',name='Next step').click()
 assert page.locator('[data-creator-step="1"]').is_visible()
 page.locator('[name="score-DEX"]').fill('18')
 page.locator('[name="score-WIS"]').fill('16')
 page.locator('[name="saveProf"][value="STR"]').check()
 page.locator('[name="saveProf"][value="DEX"]').check()
 page.locator('.creator-proficiencies summary').click()
 page.locator('[name="skillProf"][value="Acrobatics"]').check()
 page.get_by_role('button',name='Next step').click()
 assert page.locator('[data-creator-step="2"]').is_visible()
 page.locator('#creator-form [name="hp"]').fill('22')
 page.locator('#creator-form [name="ac"]').fill('15')
 page.locator('[name="attack-name"]').fill('Quarterstaff')
 page.locator('[name="attack-bonus"]').fill('6')
 page.locator('[name="attack-damage"]').fill('1d8+4')
 page.locator('#creator-save').click()
 page.wait_for_function("document.querySelector('.page-title')?.textContent==='Ilyra Fern'")
 assert page.evaluate('character.demo_id') is None
 assert page.evaluate('character.saves.Dexterity')==6
 assert page.evaluate('character.skills.Acrobatics')==6
 assert page.evaluate('character.proficiency')==2
 assert page.evaluate('character.attacks[0].name')=='Quarterstaff'
 assert page.evaluate('character.attacks[0].attack_range')=='melee'
 assert page.evaluate('character.actions.length')==0,'Class name does not grant unverified Ki or features'
 assert page.evaluate('character.resources.Ki') is None
 assert page.evaluate('window.__creatorStorage()?.characters.length')==2
 page.locator('#vault-open').click()
 assert page.locator('.vault-card').count()==2
 assert page.locator('.vault-card').filter(has_text='Mara Vale').count()==1
 assert page.locator('.vault-card').filter(has_text='Ilyra Fern').count()==1
 page.locator('#vault-close').click()
 page.locator('#create-character').click()
 page.locator('#creator-form [name="name"]').fill('Unfinished')
 page.locator('#creator-cancel').click()
 assert page.locator('.vault-dialog').is_visible()
 assert page.evaluate('window.__creatorStorage()?.characters.length')==2,'Cancellation never writes a draft'
 page.locator('#vault-close').click()
 page.set_viewport_size({'width':390,'height':740})
 page.locator('#create-character').click()
 assert page.get_by_role('heading',name='Create your adventurer').is_visible()
 assert page.locator('#creator-next').is_visible()
 assert not errors,errors
 browser.close()
 print('PASS browser manual creator: wizard validation, creation, proper calculations, vault isolation, cancel, narrow-screen')
