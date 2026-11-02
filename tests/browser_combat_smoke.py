"""Live DOM acceptance: combat action budget, spell slot, conditions and undo."""
from pathlib import Path
from playwright.sync_api import sync_playwright
R=Path(__file__).resolve().parents[1]
char={
 'schema_version':1,'name':'QA Monk','player':'Test','class_level':'Monk 3','species':'Human','background':'',
 'hp':{'current':18,'max':20,'temp':0},'ac':15,'initiative':2,'proficiency':2,'speed':'40 ft.',
 'abilities':{'DEX':{'score':16,'modifier':3}},'saves':{'Constitution':2},'skills':{'Acrobatics':5},
 'inventory':[],'attacks':[],'conditions':[],'features':[],'roll_history':[],'effects':{},
 'resources':{'Ki':{'current':3,'max':3,'reset':'short rest'},'Level 1 Spell Slots':{'current':2,'max':2,'reset':'long rest'}},
 'actions':[{'id':'qa','name':'Protective Veil','activation':'1 action','description':'A homebrew protective condition.',
             'cost':1,'resource':'Ki','roll':'','effect_kind':'condition','effect_condition':'Invisible','duration_rounds':2}],
 'spells':[{'id':'s0','name':'Blessing','level':1,'prepared':True,'casting_time':'1 action','duration':'Instantaneous'}]
}
with sync_playwright() as pw:
 browser=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1440,'height':900});errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content((R/'web/index.html').read_text(),wait_until='domcontentloaded')
 page.add_style_tag(content=(R/'web/styles.css').read_text())
 page.evaluate('''c=>{window.testVault={schema_version:1,active_id:'qa',characters:[{id:'qa',character:c,updated_at:'2026'}]};
 window.fetch=async (url,opt={})=>{if(url==='/api/vault'){
 if(opt.method==='POST'){window.testVault=JSON.parse(opt.body);return new Response('{}',{status:200});}
 return new Response(JSON.stringify(window.testVault),{status:200});}
 if(url==='./theme-assets.json')return new Response('{"version":1,"assets":{}}',{status:200});
 return new Response('{}',{status:404});};}''',char)
 for name in ['dnd-slots.js','character-import.js','vault-store.js','dnd-action.js','browser-pdf.js','dice-physics.js','app.js']:
  page.add_script_tag(content=(R/'web'/name).read_text())
 page.wait_for_function('document.querySelector(".page-title")?.textContent==="QA Monk"')
 # Encounter starts in Actions; a homebrew 1-action condition consumes Ki and the action.
 page.get_by_role('button',name='Start encounter').click()
 assert page.get_by_text('Turn 1',exact=True).is_visible()
 entry=page.locator('.action-entry').filter(has_text='Protective Veil');entry.locator('summary').click()
 entry.get_by_role('button',name='Use ability').click()
 assert page.evaluate('character.resources.Ki.current')==3
 page.locator('#dlg-no').click()
 assert page.evaluate('character.resources.Ki.current')==3
 entry.get_by_role('button',name='Use ability').click();page.locator('#dlg-yes').click()
 assert page.evaluate('character.resources.Ki.current')==2
 assert page.evaluate('character.effects.active[0].condition')=='Invisible'
 assert 'Invisible' in page.evaluate('character.conditions')
 assert page.evaluate('character.effects.combat.used.action') is True
 # A second action in same turn (spell) is refused and does not spend the slot.
 page.get_by_role('tab',name='Spells').click()
 spell=page.locator('.spell-entry').filter(has_text='Blessing');spell.locator('summary').click()
 spell.get_by_role('button',name='Cast spell').click()
 assert page.locator('#dlg-yes').count()==0
 assert page.evaluate('character.resources["Level 1 Spell Slots"].current')==2
 page.get_by_role('tab',name='Actions').click()
 page.get_by_role('button',name='Next turn').click()
 assert page.evaluate('character.effects.combat.turn')==2
 assert page.evaluate('character.effects.active[0].rounds_remaining')==1
 page.get_by_role('button',name='Undo turn').click()
 assert page.evaluate('character.effects.combat.turn')==1
 assert page.evaluate('character.effects.active[0].rounds_remaining')==2
 page.get_by_role('button',name='Next turn').click()
 page.get_by_role('tab',name='Spells').click()
 spell=page.locator('.spell-entry').filter(has_text='Blessing');spell.locator('summary').click()
 spell.get_by_role('button',name='Cast spell').click()
 assert page.locator('#dlg-yes').is_visible()
 page.locator('#dlg-yes').click()
 assert page.evaluate('character.resources["Level 1 Spell Slots"].current')==1
 page.get_by_role('tab',name='Actions').click()
 page.get_by_role('button',name='Next turn').click()
 assert not page.evaluate('character.effects.active')
 assert 'Invisible' not in page.evaluate('character.conditions')
 page.screenshot(path='/mnt/data/Interactive-Tabletop-v0.14.0-Preview.png',full_page=False)
 assert not errors,errors
 print('PASS browser: encounter start, action cost/cancel, slot budget, condition timer, undo, no JS errors')
 browser.close()
