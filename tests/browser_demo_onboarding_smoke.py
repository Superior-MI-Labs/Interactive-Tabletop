"""First-time Pages onboarding with local demo, safe deletion and manual recreation."""
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_support import launch_chromium
ROOT=Path(__file__).resolve().parents[1]
with sync_playwright() as pw:
 browser=launch_chromium(pw)
 page=browser.new_page(viewport={'width':1440,'height':900})
 page.set_default_timeout(7000)
 errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content((ROOT/'web/index.html').read_text(),wait_until='domcontentloaded')
 page.add_style_tag(content=(ROOT/'web/styles.css').read_text())
 page.evaluate('''()=>{
  window.__STATIC_TABLETOP__=true;
  let snapshot=null;
  window.__demoStorage=()=>snapshot;
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
 assert page.locator('.demo-callout').is_visible()
 assert 'DEMO' in page.locator('.sheet-eyebrow').inner_text()
 assert page.locator('#vault-count').inner_text()=='(1)'
 assert page.evaluate('window.__demoStorage()?.characters.length')==1
 page.locator('#vault-open').click()
 assert page.locator('.vault-card').count()==1
 assert page.get_by_role('button',name='Reset demo').count()==1
 assert page.get_by_role('button',name='Open demo fighter').count()==1
 page.get_by_role('button',name='Open demo fighter').click()
 assert page.locator('#vault-count').inner_text()=='(1)','Repeated open must not clone demo'
 page.locator('#vault-open').click()
 page.locator('.vault-card').get_by_role('button',name='Delete').click()
 page.locator('#dlg-yes').click()
 page.wait_for_function("document.querySelector('.welcome-vault')!==null")
 assert page.evaluate('window.__demoStorage()?.characters.length')==0
 assert page.evaluate('window.__demoStorage()?.active_id') is None
 assert page.evaluate('async()=> (await TabletopVault.storage(true).read()).characters.length')==0
 page.locator('#vault-close').click()
 page.get_by_role('button',name='Play with demo fighter').click()
 page.wait_for_function("document.querySelector('.page-title')?.textContent==='Mara Vale (Demo)'")
 assert page.evaluate('window.__demoStorage()?.characters.length')==1
 assert page.evaluate('character.combat_profile.attacks_per_action')==2
 assert page.evaluate('character.effects.targets[0].name')=='Training Dummy'
 demo_id=page.evaluate('activeId')
 page.evaluate('''()=>{character.hp.current=2;save();}''')
 page.locator('#vault-open').click()
 page.get_by_role('button',name='Reset demo').click()
 assert page.locator('#dlg-yes').count()==1
 page.locator('#dlg-yes').click()
 page.wait_for_function('character?.hp.current===40')
 assert page.evaluate('activeId')==demo_id,'Reset keeps the demo identity'
 assert page.evaluate('window.__demoStorage()?.characters.length')==1
 assert not errors,errors
 browser.close()
 print('PASS browser demo: first-run seed, vault label, no duplicates, delete persists, welcome recreates demo')
