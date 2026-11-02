"""The three explicit 2014 SRD profiles operate through real sheet controls."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
hero={'schema_version':1,'system_id':'dnd5e','system_edition':'dnd-2014','name':'Synthetic Cleric','player':'QA','class_level':'Cleric 5','species':'Human','background':'',
'hp':{'current':10,'max':35,'temp':0},'ac':17,'initiative':1,'proficiency':3,'speed':'30 ft.',
'abilities':{'WIS':{'score':18,'modifier':4}},'saves':{'Constitution':5},'skills':{'Medicine':7},'attacks':[],'inventory':[],'conditions':[],'features':[],'actions':[],'roll_history':[],'effects':{},
'resources':{'Level 1 Spell Slots':{'current':4,'max':4,'reset':'long rest'},'Level 2 Spell Slots':{'current':2,'max':2,'reset':'long rest'}},
'spells':[{'id':'cure','name':'Cure Wounds','level':1,'source':'Cleric','prepared':True,'casting_time':'1 action','duration':'Instantaneous'},
{'id':'faith','name':'Shield of Faith','level':1,'source':'Cleric','prepared':True,'casting_time':'1 bonus action','duration':'Concentration, up to 10 minutes'},
{'id':'guidance','name':'Guidance','level':0,'source':'Cleric','casting_time':'1 action','duration':'Concentration, up to 1 minute'}]}
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1440,'height':900});errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content((ROOT/'web/index.html').read_text(),wait_until='domcontentloaded')
 page.add_style_tag(content=(ROOT/'web/styles.css').read_text())
 cat=json.loads((ROOT/'web/dnd-2014-reference.json').read_text())
 page.evaluate('''([hero,cat])=>{
  window.__testVault={schema_version:1,active_id:'hero',characters:[{id:'hero',character:hero,updated_at:'2026'}]};
  window.fetch=async(url,init={})=>{
   if(url==='/api/vault'){
    if(init.method==='POST'){window.__testVault=JSON.parse(init.body);return new Response('{"saved":true}',{status:200});}
    return new Response(JSON.stringify(window.__testVault),{status:200});
   }
   if(url==='./theme-assets.json')return new Response('{"version":1,"assets":{}}',{status:200});
   if(url==='./dnd-2014-reference.json')return new Response(JSON.stringify(cat),{status:200});
   return new Response('{}',{status:404});
  };
 }''',[hero,cat])
 for filename in ['dnd-slots.js','character-import.js','vault-store.js','dnd-action.js','reference-catalog.js','browser-pdf.js','dice-physics.js','app.js']:
  page.add_script_tag(content=(ROOT/'web'/filename).read_text())
 page.wait_for_function("document.querySelector('.page-title')?.textContent==='Synthetic Cleric' && ReferenceCatalog.ready()")
 page.get_by_role('tab',name='Spells').click()
 def spell(name):return page.locator('.spell-entry').filter(has_text=name)
 cure=spell('Cure Wounds');cure.locator('summary').click()
 cure.get_by_role('button',name='Enable 2014 effect').click();page.locator('#dlg-yes').click()
 assert page.evaluate('character.spells[0].automation')=='srd-2014'
 cure.locator('[data-slot-choice]').select_option('2')
 cure.get_by_role('button',name='Cast spell').click()
 assert '2d8+4' in page.locator('#dialog-layer').inner_text()
 page.locator('#dlg-yes').click()
 assert page.evaluate('character.resources["Level 2 Spell Slots"].current')==1
 assert page.evaluate('pendingRoll.expression')=='2d8+4'
 page.evaluate('''()=>{beginThrow();for(const die of dice.filter(d=>activeRoll.diceIds.includes(d.id)))die.sleeping=true;finishRollIfSettled();}''')
 page.locator('#dice-widget > summary').click()
 assert page.locator('#roll-effect').get_by_role('button',name='Apply to HP').is_visible()
 total=page.evaluate('lastResult.total')
 page.locator('#roll-effect').get_by_role('button',name='Apply to HP').click()
 assert page.evaluate('character.hp.current')==min(35,10+total)
 page.locator('#dice-widget > summary').click()
 faith=spell('Shield of Faith');faith.locator('summary').click()
 faith.get_by_role('button',name='Enable 2014 effect').click();page.locator('#dlg-yes').click()
 faith.get_by_role('button',name='Cast spell').click();assert 'AC +2' in page.locator('#dialog-layer').inner_text()
 page.locator('#dlg-yes').click()
 assert page.evaluate('character.ac')==17
 assert page.evaluate('Action.effectiveAC(character)')==19
 assert 'Shield of Faith' in page.locator('.buff-bar').inner_text()
 page.screenshot(path='/mnt/data/Interactive-Tabletop-v0.19.0-Preview.png')
 page.get_by_role('tab',name='Spells').click()
 guide=spell('Guidance');guide.locator('summary').click()
 guide.get_by_role('button',name='Enable 2014 effect').click();page.locator('#dlg-yes').click()
 guide.get_by_role('button',name='Cast spell').click();page.locator('#dlg-yes').click()
 assert page.evaluate('Action.effectiveAC(character)')==17
 assert page.evaluate('character.effects.active[0].charges')==1
 auto=page.locator('.buff-token').filter(has_text='Guidance').get_by_role('checkbox',name='Automatically use Guidance')
 assert auto.is_checked()
 # Untyped rolls and saves never consume Guidance.
 assert page.evaluate("queueRoll('1d20+5','test saving throw')")
 assert page.evaluate('pendingRoll.bonuses.length')==0
 assert page.evaluate('character.effects.active[0].charges')==1
 # Pausing preserves the charge and makes skill checks normal.
 auto.focus();page.keyboard.press("Space")
 assert page.evaluate("character.effects.active[0].auto_use") is False
 page.get_by_role('tab',name='Actions').click()
 page.get_by_role('button',name='Medicine',exact=False).focus();page.keyboard.press('Enter')
 assert page.evaluate('pendingRoll.bonuses.length')==0
 auto=page.get_by_role('checkbox',name='Automatically use Guidance')
 auto.focus();page.keyboard.press("Space")
 assert page.evaluate("character.effects.active[0].auto_use") is True
 page.get_by_role('button',name='Medicine',exact=False).focus();page.keyboard.press('Enter')
 assert page.evaluate('pendingRoll.bonuses[0].expression')=='1d4'
 assert page.evaluate('pendingRoll.count')==2
 assert page.evaluate('pendingRoll.primaryCount')==1
 assert page.evaluate('character.effects.active[0].charges')==1,'Charge must spend only after roll settles'
 page.evaluate('''()=>{beginThrow();for(const die of dice.filter(d=>activeRoll.diceIds.includes(d.id)))die.sleeping=true;finishRollIfSettled();}''')
 assert page.evaluate('lastResult.bonuses[0].name')=='Guidance'
 assert page.evaluate('lastResult.total === lastResult.baseTotal + lastResult.bonuses[0].total')
 assert page.evaluate('character.effects.active.length')==0
 # Verify concentration damage prompts and manual roll availability.
 page.get_by_role('tab',name='Spells').click()
 faith=spell('Shield of Faith')
 faith.get_by_role('button',name='Cast spell').click();page.locator('#dlg-yes').click()
 page.locator('#hp-amount').fill('24')
 page.get_by_role('button',name='− Damage').click()
 assert 'DC 12' in page.locator('.buff-bar').inner_text()
 assert page.evaluate('character.effects.pending_concentration.length')==1
 page.locator('.buff-check').get_by_role('button',name='Roll CON save').click()
 assert page.evaluate('pendingRoll.expression')=='1d20+5'
 assert not errors,errors
 page.set_viewport_size({'width':390,'height':844})
 page.wait_for_timeout(100)
 assert page.evaluate('document.documentElement.scrollWidth')<=400,'Mobile horizontal document overflow'
 b.close()
 print('PASS browser Cure Wounds self-heal, upcast, Shield of Faith +2 AC, Guidance one-use charge, concentration DC, no JS errors')
