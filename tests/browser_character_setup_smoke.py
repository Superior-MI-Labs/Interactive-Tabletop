"""Manual character follow-up is an editable data projection, not a second rules workflow."""
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_support import launch_chromium

ROOT=Path(__file__).resolve().parents[1]
with sync_playwright() as pw:
 browser=launch_chromium(pw)
 page=browser.new_page(viewport={'width':1100,'height':800})
 page.set_default_timeout(9000)
 errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content((ROOT/'web/index.html').read_text(),wait_until='domcontentloaded')
 page.add_style_tag(content=(ROOT/'web/styles.css').read_text())
 page.evaluate('''()=>{
   window.__STATIC_TABLETOP__=true;
   let stored=null;
   window.__setupStorage=()=>JSON.parse(JSON.stringify(stored));
   Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:()=>null}});
   Object.defineProperty(window,'indexedDB',{configurable:true,value:{open(){
    const request={};queueMicrotask(()=>{
     request.result={objectStoreNames:{contains:()=>true},close(){},transaction(){
      const tx={};tx.objectStore=()=>({
       get(){const r={};queueMicrotask(()=>{r.result=stored;r.onsuccess?.();});return r;},
       put(value){stored=JSON.parse(JSON.stringify(value));queueMicrotask(()=>tx.oncomplete?.());}
      });return tx;
     }};request.onsuccess?.();
    });return request;
   }}});
   window.fetch=async url=>url==='./theme-assets.json'
    ?new Response('{"version":1,"assets":{}}',{status:200}):new Response('{}',{status:404});
 }''')
 for f in ['dnd-slots.js','character-import.js','vault-store.js','demo-character.js','dnd-action.js','browser-pdf.js','dice-physics.js','app.js']:
  page.add_script_tag(content=(ROOT/'web'/f).read_text())
 page.wait_for_function("document.querySelector('.page-title')?.textContent==='Mara Vale (Demo)'")
 assert page.locator('.character-setup').count()==0,'Demo never receives an inferred setup checklist'
 page.locator('#create-character').click()
 page.locator('#creator-form [name="name"]').fill('Cassia Dawn')
 page.locator('[name="className"]').fill('Wizard')
 page.locator('[name="species"]').fill('Human')
 page.locator('#creator-next').click()
 page.locator('#creator-next').click()
 page.locator('#creator-save').click()
 page.wait_for_function("document.querySelector('.page-title')?.textContent==='Cassia Dawn'")
 setup=page.locator('.character-setup')
 assert setup.is_visible()
 assert '0/3 core areas recorded' in setup.inner_text()
 assert 'Spellbook (optional)' in setup.inner_text()
 assert page.evaluate('Object.keys(character.resources).length')==0
 assert page.evaluate('character.spells.length')==0
 # The attack path edits the ordinary character.attacks array and classifies it explicitly.
 setup.locator('.character-setup-row').filter(has_text='Attacks').get_by_role('button',name='Set up').click()
 assert page.locator('[role="tab"][aria-selected="true"]').inner_text()=='Actions'
 assert page.locator('.edit-mode-button').get_attribute('aria-pressed')=='true'
 page.get_by_role('button',name='+ Attack').click()
 page.locator('[data-input="attacks.0.name"]').fill('Training Spear')
 page.locator('[data-input="attacks.0.name"]').press('Tab')
 page.locator('[data-input="attacks.0.bonus"]').fill('5')
 page.locator('[data-input="attacks.0.bonus"]').press('Tab')
 page.locator('[data-attack-type="0"]').select_option('weapon')
 page.locator('[data-attack-range="0"]').select_option('melee')
 # Reject invalid attack dice before saving; valid replacements remain editable.
 page.locator('[data-input="attacks.0.damage"]').fill('21d6')
 page.locator('[data-input="attacks.0.damage"]').press('Tab')
 assert page.evaluate('character.attacks[0].damage')=='1d6'
 page.locator('[data-input="attacks.0.damage"]').fill('1d8+2')
 page.locator('[data-input="attacks.0.damage"]').press('Tab')
 assert page.evaluate('character.attacks[0].damage')=='1d8+2'
 page.locator('[data-view="inventory"]').click()
 assert page.evaluate('character.attacks[0].name')=='Training Spear'
 assert page.evaluate('character.attacks[0].attack_type')=='weapon'
 assert page.evaluate('character.attacks[0].attack_range')=='melee'
 # Optional spell draft does not grant a spell slot or enable automation.
 page.locator('[data-view="overview"]').click()
 setup.locator('.character-setup-row').filter(has_text='Spellbook (optional)').get_by_role('button',name='Open optional spells').click()
 page.get_by_role('button',name='+ Spell').click()
 assert page.locator('details[data-spell-id]').first.get_attribute('open') is not None,'New spell editor must open automatically'
 assert page.evaluate('character.spells[0].level') is None
 assert page.evaluate('character.spells[0].automation')=='manual'
 assert page.evaluate('Object.keys(character.resources).length')==0
 page.locator('[data-input="spells.0.name"]').fill('Light')
 page.locator('[data-input="spells.0.name"]').press('Tab')
 page.locator('details[data-spell-id]').first.evaluate('(el)=>{el.open=true;}')
 page.locator('[data-spell-level="0"]').select_option('1')
 settings=page.locator('.spell-slot-settings')
 settings.locator('summary').click()
 row=settings.locator('[data-slot-level="1"]')
 row.locator('[data-slot-total]').fill('3')
 row.locator('[data-slot-remaining]').fill('4')
 row.get_by_role('button',name='Save slots').click()
 assert page.evaluate('Object.keys(character.resources).length')==0,'Invalid slots cannot mutate the vault'
 assert 'whole totals' in page.locator('#status-msg').inner_text()
 row.locator('[data-slot-remaining]').fill('2')
 row.get_by_role('button',name='Save slots').click()
 assert page.evaluate('character.resources["Level 1 Spell Slots"].current')==2
 assert 'updated' in page.locator('#status-msg').inner_text()
 assert page.evaluate('character.resources["Level 1 Spell Slots"].max')==3
 page.locator('details[data-spell-id]').first.evaluate('(el)=>{el.open=true;}')
 page.locator('[data-input="spells.0.roll"]').fill('2d3')
 page.locator('[data-input="spells.0.roll"]').press('Tab')
 assert page.evaluate('character.spells[0].roll')=='','Invalid spell dice must be rejected'
 page.locator('details[data-spell-id]').first.evaluate('(el)=>{el.open=true;}')
 page.locator('[data-input="spells.0.roll"]').fill('2d6+3')
 page.locator('[data-input="spells.0.roll"]').press('Tab')
 assert page.evaluate('character.spells[0].roll')=='2d6+3'
 page.locator('[data-view="overview"]').click()
 setup.locator('.character-setup-row').filter(has_text='Equipment').get_by_role('button',name='Set up').click()
 page.get_by_role('button',name='+ Item').click()
 page.locator('[data-input="inventory.0.name"]').fill('Rope')
 page.locator('[data-input="inventory.0.name"]').press('Tab')
 page.locator('[data-view="overview"]').click()
 setup.locator('.character-setup-row').filter(has_text='Features').get_by_role('button',name='Set up').click()
 page.get_by_role('button',name='+ Feature note').click()
 page.locator('[data-input="features.0.title"]').fill('Observant')
 page.locator('[data-input="features.0.title"]').press('Tab')
 page.locator('[data-view="overview"]').click()
 assert '3/3 core areas recorded' in setup.inner_text()
 assert page.evaluate('character.actions.length')==0,'Feature note does not authorize a combat action'
 assert page.evaluate('character.spells[0].name')=='Light'
 assert page.evaluate('character.spells[0].level')==1
 # Spellcasting configuration reuses the ordinary editor and persistent spell record.
 page.locator('[data-view="spells"]').click()
 page.locator('details[data-spell-id]').first.evaluate('(el)=>{el.open=true;}')
 page.locator('[data-input="spells.0.spellcasting_ability"]').select_option('INT')
 assert page.evaluate('character.spells[0].spellcasting_ability')=='INT'
 page.locator('details[data-spell-id]').first.evaluate('(el)=>{el.open=true;}')
 page.locator('[data-spell-modifier="0"]').fill('3')
 page.locator('[data-spell-modifier="0"]').press('Tab')
 assert page.evaluate('character.spells[0].spellcasting_modifier')==3
 page.locator('[data-spell-modifier="0"]').fill('31')
 page.locator('[data-spell-modifier="0"]').press('Tab')
 assert page.evaluate('character.spells[0].spellcasting_modifier')==3,'Invalid override must not overwrite the good value'
 assert 'whole number' in page.locator('#status-msg').inner_text()
 page.locator('[data-view="overview"]').click()
 # Named custom pools use Encounter's existing economy configuration, not spell-slot aliases.
 page.get_by_role('tab',name='Encounter').click()
 page.locator('.economy-config summary').click()
 page.locator('#economy-new-resource').fill('Focus Points')
 page.locator('#economy-new-resource-max').fill('4')
 page.get_by_role('button',name='Create pool').click()
 page.locator('.economy-config summary').click()
 page.locator('#economy-edit-resource').select_option('Focus Points')
 page.locator('#economy-edit-max').fill('6')
 page.locator('#economy-edit-current').fill('2')
 page.get_by_role('button',name='Save resource').click()
 assert page.evaluate('character.resources["Focus Points"].max')==6
 assert page.evaluate('character.resources["Focus Points"].current')==2
 page.wait_for_function('window.__setupStorage()?.characters.length===2')
 page.locator('#vault-open').click()
 page.locator('.vault-card').filter(has_text='Mara Vale').get_by_role('button',name='Play').click()
 page.wait_for_function("document.querySelector('.page-title')?.textContent==='Mara Vale (Demo)'")
 assert page.locator('.character-setup').count()==0
 page.locator('#vault-open').click()
 page.locator('.vault-card').filter(has_text='Cassia Dawn').get_by_role('button',name='Play').click()
 page.wait_for_function("document.querySelector('.page-title')?.textContent==='Cassia Dawn'")
 assert '3/3 core areas recorded' in page.locator('.character-setup').inner_text()
 assert page.evaluate('character.spells[0].spellcasting_ability')=='INT'
 assert page.evaluate('character.spells[0].spellcasting_modifier')==3
 # Manual spells can be removed only after an explicit confirmation, while the
 # original spell's prepared/settings remain unchanged. Cancel never mutates.
 page.locator('[data-view="spells"]').click()
 assert page.locator('[data-action="remove-manual-spell"]').count()==1
 page.get_by_role('button',name='+ Spell').click()
 assert page.evaluate('character.spells.length')==2
 page.locator('details[data-spell-id]').last.evaluate('(el)=>{el.open=true;}')
 page.locator('[data-action="remove-manual-spell"]').last.click()
 assert page.evaluate('character.spells.length')==2,'Opening removal confirmation must not edit the vault'
 page.locator('#dlg-no').click()
 assert page.evaluate('character.spells.length')==2,'Canceled removal must not mutate the vault'
 page.locator('[data-action="remove-manual-spell"]').last.click()
 page.locator('#dlg-yes').click()
 assert page.evaluate('character.spells.length')==1,'Only the selected authored spell is removed'
 assert page.evaluate('character.spells[0].spellcasting_ability')=='INT'
 assert page.evaluate('character.spells[0].spellcasting_modifier')==3
 page.wait_for_function("window.__setupStorage()?.characters.some(x=>x.character.name==='Cassia Dawn' && x.character.spells.length===1)")
 page.locator('[data-view="overview"]').click()
 page.set_viewport_size({'width':390,'height':730})
 assert page.locator('.character-setup').is_visible()
 assert not errors,errors
 browser.close()
 print('PASS browser setup checklist: data-driven, manual entries, no inferred mechanics, vault isolation and narrow view')
