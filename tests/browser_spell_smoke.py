"""Live DOM spell casting and timers, with mocked local vault transport."""
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_support import launch_chromium
ROOT=Path(__file__).resolve().parents[1]
hero={
 'schema_version':1,'name':'Test Caster','player':'QA','class_level':'Cleric 5','species':'Human','background':'',
 'hp':{'current':13,'max':27,'temp':0},'ac':17,'initiative':1,'proficiency':3,'speed':'30 ft.',
 'abilities':{'WIS':{'score':18,'modifier':4}},'saves':{'Constitution':3},'skills':{'Medicine':7},
 'inventory':[],'attacks':[],'conditions':[],'features':[],'actions':[],'roll_history':[],'effects':{},
 'resources':{'Level 1 Spell Slots':{'current':2,'max':4,'reset':'long rest'},'Level 2 Spell Slots':{'current':1,'max':3,'reset':'long rest'}},
 'spells':[
 {'id':'spell-0','name':'Healing Light','level':1,'prepared':True,'duration':'Instantaneous','roll':'1d8+4','effect_kind':'heal'},
 {'id':'spell-1','name':'Ward of Light','level':1,'prepared':True,'duration':'Concentration, up to 1 minute','duration_rounds':2},
 {'id':'spell-2','name':'Unavailable Spell','level':1,'prepared':False,'duration':'Instantaneous'},
 {'id':'spell-3','name':'Guidance','level':0,'prepared':False,'duration':'Concentration, up to 1 minute'}]
}
with sync_playwright() as playwright:
 browser=launch_chromium(playwright)
 page=browser.new_page(viewport={'width':1440,'height':900})
 errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
 page.set_content((ROOT/'web/index.html').read_text(),wait_until='domcontentloaded')
 page.add_style_tag(content=(ROOT/'web/styles.css').read_text())
 page.evaluate('''(character)=>{
  window.testVault={schema_version:1,active_id:'test',characters:[{id:'test',character,updated_at:'2026'}]};
  window.fetch=async (url,init={})=>{
   if(url==='/api/vault'){
    if(init.method==='POST'){window.testVault=JSON.parse(init.body);return new Response('{"saved":true}',{status:200});}
    return new Response(JSON.stringify(window.testVault),{status:200});
   }
   if(url==='./theme-assets.json')return new Response('{"version":1,"assets":{}}',{status:200});
   return new Response('{}',{status:404});
  };
 }''',hero)
 for file in ['dnd-slots.js','character-import.js','vault-store.js','dnd-action.js','browser-pdf.js','dice-physics.js','app.js']:
  page.add_script_tag(content=(ROOT/'web'/file).read_text())
 page.wait_for_function('document.querySelector(".page-title")?.textContent==="Test Caster"')
 page.get_by_role('tab',name='Spells').click()
 ward=page.locator('.spell-entry').filter(has_text='Ward of Light')
 ward.locator('summary').click()
 assert ward.get_by_role('button',name='Cast spell').is_visible()
 ward.get_by_role('button',name='Cast spell').click()
 assert page.locator('#dlg-yes').is_visible()
 assert page.evaluate('character.resources["Level 1 Spell Slots"].current')==2
 page.locator('#dlg-no').click()
 assert page.evaluate('character.resources["Level 1 Spell Slots"].current')==2
 ward.get_by_role('button',name='Cast spell').click()
 page.locator('#dlg-yes').click()
 assert page.evaluate('character.resources["Level 1 Spell Slots"].current')==1
 assert page.evaluate('character.effects.active[0].name')=='Ward of Light'
 assert page.evaluate('character.effects.active[0].rounds_remaining')==2
 # Current panel and spell remain open after rerender.
 assert ward.get_by_role('button',name='Cast spell').is_visible()
 # Cannot cast unprepared spell; no slot spent.
 unavailable=page.locator('.spell-entry').filter(has_text='Unavailable Spell')
 unavailable.locator('summary').click()
 unavailable.get_by_role('button',name='Cast spell').click()
 assert page.evaluate('character.resources["Level 1 Spell Slots"].current')==1
 assert not page.locator('#dlg-yes').is_visible()
 # Cantrip must not consume a spell slot. It replaces concentration.
 guidance=page.locator('.spell-entry').filter(has_text='Guidance')
 guidance.locator('summary').click()
 guidance.get_by_role('button',name='Cast spell').click()
 assert 'replaces Ward of Light' in page.locator('#dialog-layer').inner_text()
 page.locator('#dlg-yes').click()
 assert page.evaluate('character.resources["Level 1 Spell Slots"].current')==1
 assert page.evaluate('character.effects.active[0].name')=='Guidance'
 page.get_by_role('tab',name='Actions').click()
 page.get_by_role('button',name='Next turn').click()
 assert page.evaluate('character.effects.active[0].rounds_remaining') is None
 # End concentration manually.
 page.locator('.buff-token [data-action=effect-end]').first.click()
 assert page.evaluate('character.effects.active.length')==0
 # Healing at a higher slot; must wait for roll and explicit HP application.
 page.get_by_role('tab',name='Spells').click()
 healing=page.locator('.spell-entry').filter(has_text='Healing Light')
 healing.locator('summary').click()
 healing.locator('[data-slot-choice]').select_option('2')
 healing.get_by_role('button',name='Cast spell').click()
 assert 'level 2 slot' in page.locator('#dialog-layer').inner_text()
 page.locator('#dlg-yes').click()
 assert page.evaluate('character.resources["Level 2 Spell Slots"].current')==0
 assert page.evaluate('character.hp.current')==13
 assert page.evaluate('pendingRoll.expression')=='1d8+4'
 page.evaluate('''()=>{beginThrow();for(const die of dice.filter(d=>activeRoll.diceIds.includes(d.id)))die.sleeping=true;finishRollIfSettled();}''')
 page.locator('#dice-widget > summary').click()
 assert page.locator('#roll-effect').get_by_role('button',name='Apply to HP').is_visible()
 total=page.evaluate('lastResult.total')
 page.locator('#roll-effect').get_by_role('button',name='Apply to HP').click()
 assert page.evaluate('character.hp.current')==min(27,13+total)
 assert not errors,errors
 print('PASS: browser spell cancel/cast, prepared guard, cantrip, concentration replacement/end, slot selection, settled healing, no JS errors')
 browser.close()
