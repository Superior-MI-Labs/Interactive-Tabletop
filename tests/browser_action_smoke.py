"""Real DOM and interaction smoke on the source scripts, even where navigation is blocked."""
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
character={
 'schema_version':1,'name':'Example Hero','player':'Example','class_level':'Monk 5','species':'Tabaxi','background':'',
 'hp':{'max':50,'current':12,'temp':0},'ac':17,'initiative':2,'proficiency':3,'speed':'30 ft.',
 'abilities':{'STR':{'score':12,'modifier':1},'DEX':{'score':16,'modifier':3}},'saves':{'Strength':1},'skills':{'Acrobatics':6},
 'inventory':[],'attacks':[],'resources':{'Ki':{'current':4,'max':5,'reset':'short rest'}},'spells':[],
 'conditions':[],'roll_history':[],'effects':{},'features':[],
 'actions':[{'id':'manual-healing','name':'Approved Healing','activation':'action','resource':'Ki','cost':2,
   'roll':'1d10+2','effect_kind':'heal','damage':'','source':'manual','description':'DM approved'}]
}
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1440,'height':900})
 errors=[];page.on('pageerror',lambda err:errors.append(str(err)))
 page.set_content((ROOT/'web/index.html').read_text(),wait_until='domcontentloaded')
 page.add_style_tag(content=(ROOT/'web/styles.css').read_text())
 page.evaluate('''(c)=>{
   window.testVault={schema_version:1,active_id:'person-1',characters:[{id:'person-1',character:c,updated_at:'2026-11-02'}]};
   window.fetch=async (url,init={})=>{
    if(url==='/api/vault'){
     if(init.method==='POST'){window.testVault=JSON.parse(init.body);return new Response('{"saved":true}',{status:200});}
     return new Response(JSON.stringify(window.testVault),{status:200});
    }
    if(url==='./theme-assets.json')return new Response('{"version":1,"assets":{}}',{status:200});
    return new Response('{}',{status:404});
   };
 }''',character)
 for f in ['dnd-slots.js','character-import.js','vault-store.js','dnd-action.js','browser-pdf.js','dice-physics.js','app.js']:
  page.add_script_tag(content=(ROOT/'web'/f).read_text())
 page.wait_for_function('document.querySelector(".page-title")?.textContent==="Example Hero"')
 page.locator('.work-entry').filter(has_text='Approved Healing').locator('summary').click()
 page.get_by_role('button',name='Use ability').click()
 assert page.locator('#dlg-yes').is_visible()
 assert 'spend 2 Ki' in page.locator('#dialog-layer').inner_text()
 assert page.evaluate('character.resources.Ki.current')==4, 'no debit before confirmation'
 page.locator('#dlg-no').click()
 assert page.evaluate('character.resources.Ki.current')==4, 'cancel does not mutate'
 page.get_by_role('button',name='Use ability').click()
 page.locator('#dlg-yes').click()
 assert page.evaluate('character.resources.Ki.current')==2, 'exactly one debit'
 assert page.evaluate('pendingRoll.expression')=='1d10+2'
 page.evaluate('''()=>{
   beginThrow();for(const d of dice.filter(x=>activeRoll.diceIds.includes(x.id)))d.sleeping=true;
   finishRollIfSettled();
 }''')
 page.locator('#dice-widget > summary').click()
 assert page.locator('#roll-effect').get_by_role('button',name='Apply to HP').is_visible()
 page.screenshot(path='/mnt/data/Interactive-Tabletop-v0.12.0-Preview.png',full_page=False)
 result=page.evaluate('lastResult.total')
 before=page.evaluate('character.hp.current')
 page.locator('#roll-effect').get_by_role('button',name='Apply to HP').click()
 assert page.evaluate('character.hp.current')==min(50,before+result)
 assert page.locator('#roll-effect').inner_text()==''
 # Editing an imported feature must preserve it on PDF reconciliation.
 page.evaluate('''()=>{character.actions[0].source='pdf-feature';setPath('actions.0.effect_kind','heal');}''')
 assert page.evaluate('character.actions[0].source')=='manual'
 assert not errors,errors
 print('PASS: action preview cancel/confirm, one resource debit, settled roll, explicit HP apply once, edited-import preservation')
 browser.close()
