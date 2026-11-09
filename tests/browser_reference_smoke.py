"""Visual and interaction gate for 2014 reference lookup; synthetic character data only."""
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_support import launch_chromium
import json
ROOT=Path(__file__).resolve().parents[1]
hero={
 'schema_version':1,'system_id':'dnd5e','system_edition':'unspecified',
 'name':'Test Adventurer','player':'QA','class_level':'Fighter 1 / Cleric 1','species':'Human','background':'',
 'hp':{'current':19,'max':19,'temp':0},'ac':18,'initiative':2,'proficiency':2,'speed':'30 ft.',
 'abilities':{'STR':{'score':17,'modifier':3}},'saves':{'Strength':5},'skills':{'Athletics':5},
 'attacks':[{'name':'Glaive','bonus':11,'damage':'2d10+55'}],
 'resources':{'Level 1 Spell Slots':{'current':2,'max':2,'reset':'long rest'}},
 'inventory':[{'id':'i1','name':'Glaive','quantity':1,'notes':'DM adds fire','weight':'6 lb.','archived':False},
              {'id':'i2','name':'Potion of Healing','quantity':1,'notes':'','weight':'0.5 lb.','archived':False},
              {'id':'i3','name':'+2 Ring of Protection','quantity':1,'notes':'Homebrew','weight':'','archived':False}],
 'spells':[{'id':'s1','name':'Cure Wounds','level':1,'prepared':True,'available':True,'source':'PDF','duration':'Instantaneous'},
           {'id':'s2','name':'Phoenix Healing','level':1,'prepared':True,'available':True,'source':'DM','duration':'Instantaneous'}],
 'conditions':[],'features':[{'title':'Phoenix Guard','text':'Custom shield flare; DM adjudicates its limitations.','source':'manual'}],
 'actions':[{'id':'manual-flare','name':'Solar Flicker','source':'manual','activation':'1 action',
            'description':'DM-approved burst when a visible creature attacks.','roll':'1d6+2','damage':'','resource':'','cost':0}],
 'roll_history':[],'effects':{},'notes':'Private test note'
}
with sync_playwright() as p:
 browser=launch_chromium(p)
 page=browser.new_page(viewport={'width':1440,'height':900})
 errors=[];page.on('pageerror',lambda error: errors.append(str(error)))
 page.set_content((ROOT/'web/index.html').read_text(),wait_until='domcontentloaded')
 page.add_style_tag(content=(ROOT/'web/styles.css').read_text())
 catalog=json.loads((ROOT/'web/dnd-2014-reference.json').read_text())
 page.evaluate('''([character,catalog])=>{
  window.__testVault={schema_version:1,active_id:'qa',characters:[{id:'qa',character,updated_at:'2026'}]};
  window.fetch=async(url,init={})=>{
   if(url==='/api/vault'){
    if(init.method==='POST'){window.__testVault=JSON.parse(init.body);return new Response('{"saved":true}',{status:200});}
    return new Response(JSON.stringify(window.__testVault),{status:200});
   }
   if(url==='./theme-assets.json')return new Response('{"version":1,"assets":{}}',{status:200});
   if(url==='./dnd-2014-reference.json')return new Response(JSON.stringify(catalog),{status:200});
   return new Response('{}',{status:404});
  };
 }''',[hero,catalog])
 for file in ['dnd-slots.js','character-import.js','vault-store.js','dnd-action.js','reference-catalog.js','browser-pdf.js','dice-physics.js','app.js']:
  page.add_script_tag(content=(ROOT/'web'/file).read_text())
 page.wait_for_function('document.querySelector(".page-title")?.textContent==="Test Adventurer" && window.ReferenceCatalog.ready()')
 page.get_by_role('button',name='About & licenses').click()
 assert page.get_by_role('heading',name='About & licenses').is_visible()
 assert 'This work includes material taken from the System Reference Document 5.1' in page.locator('#reference-layer').inner_text()
 page.locator('[data-close-reference]').click()
 page.get_by_role('tab',name='Reference').click()
 assert page.locator('.reference-item').count()==261
 page.locator('#catalog-search').fill('glaive')
 assert page.locator('.reference-item:visible').count()==1
 page.locator('.reference-item:visible').click()
 assert page.locator('#reference-layer').is_visible()
 assert '1d10 slashing' in page.locator('#reference-layer').inner_text()
 assert '20 gp' in page.locator('#reference-layer').inner_text()
 page.keyboard.press('Escape')
 page.locator('#catalog-search').fill('')
 # Filter by level and by structured description/school; changing filters never edits the character.
 page.locator('#catalog-level').select_option('9')
 assert page.locator('.reference-item:visible').count()>0
 assert page.locator('.reference-item:visible').count()<261
 page.locator('#catalog-search').fill('foresight')
 assert page.locator('.reference-item:visible').count()==1
 page.locator('.reference-item:visible').click()
 assert '9' in page.locator('#reference-layer').inner_text()
 page.keyboard.press('Escape')
 page.locator('#catalog-level').select_option('all')
 page.locator('#catalog-search').fill('')
 page.get_by_role('tab',name='Inventory').click()
 glaive=page.locator('.work-entry').filter(has_text='Glaive')
 glaive.locator('summary').click()
 assert glaive.get_by_role('button',name='SRD 5.1').count()==1
 assert page.evaluate('character.inventory[0].notes')=='DM adds fire'
 assert page.evaluate('character.attacks[0].bonus')==11
 custom=page.locator('.work-entry').filter(has_text='+2 Ring of Protection')
 custom.locator('summary').click()
 assert custom.locator('.reference-pill').count()==0
 page.get_by_role('tab',name='Spells').click()
 cure=page.locator('.spell-entry').filter(has_text='Cure Wounds')
 cure.locator('summary').click()
 assert cure.locator('.reference-pill').count()==1
 homebrew=page.locator('.spell-entry').filter(has_text='Phoenix Healing')
 homebrew.locator('summary').click()
 assert homebrew.locator('.reference-pill').count()==0
 # The one immediate tooltip presenter exposes imported/DM fields and
 # edition-qualified reference descriptions without adding new catalog state.
 tip=page.locator('#hud-tooltip')
 homebrew.locator('summary').focus()
 assert tip.is_visible()
 assert 'Character spell' in tip.inner_text()
 assert '2014 SRD:' not in tip.inner_text()
 page.keyboard.press('Escape')
 cure.locator('summary').focus()
 assert '2014 SRD:' in tip.inner_text()
 assert 'Cure Wounds' in tip.inner_text()
 page.keyboard.press('Escape')
 page.get_by_role('tab',name='Inventory').click()
 glaive=page.locator('.work-entry').filter(has_text='Glaive').first
 glaive.locator('summary').focus()
 assert tip.is_visible()
 assert 'Player notes: DM adds fire' in tip.inner_text()
 assert '2014 SRD:' in tip.inner_text()
 page.keyboard.press('Escape')
 homebrew_item=page.locator('.work-entry').filter(has_text='+2 Ring of Protection')
 homebrew_item.locator('summary').focus()
 assert 'no verified source description' in tip.inner_text()
 assert 'Player notes: Homebrew' in tip.inner_text()
 page.keyboard.press('Escape')
 page.get_by_role('tab',name='Actions').click()
 attack=page.locator('.attack-row').filter(has_text='Glaive')
 attack.focus() if attack.get_attribute('tabindex') is not None else attack.hover()
 assert 'Attack bonus +11' in tip.inner_text()
 assert 'Damage: 2d10+55' in tip.inner_text()
 page.keyboard.press('Escape')
 ability=page.locator('.action-entry').filter(has_text='Solar Flicker')
 ability.locator('summary').focus()
 assert 'DM-approved burst' in tip.inner_text()
 assert 'Roll 1d6+2' in tip.inner_text()
 page.keyboard.press('Escape')
 page.get_by_role('tab',name='Features').click()
 page.locator('.feature').filter(has_text='Phoenix Guard').locator('summary').focus()
 assert 'DM adjudicates its limitations' in tip.inner_text()
 page.keyboard.press('Escape')
 assert page.evaluate('character.attacks[0].bonus')==11
 assert page.evaluate('character.inventory[0].notes')=='DM adds fire'
 # Explicit 2024 edition marker fences the 2014 catalog.
 page.evaluate('''()=>{character.system_edition='dnd-2024';render();}''')
 assert page.locator('.reference-pill').count()==0
 assert page.evaluate('character.hp.current')==19
 page.set_viewport_size({'width':390,'height':844})
 page.get_by_role('button',name='About & licenses').click()
 assert page.get_by_role('heading',name='About & licenses').is_visible()
 assert page.evaluate('document.documentElement.scrollWidth<=window.innerWidth+6')
 page.locator('[data-close-reference]').click()
 assert not errors,errors
 print('PASS: 261 references, spell/item/attack/action/feature hover, DM facts, homebrew fence, search/filter, no mutations')
 browser.close()
