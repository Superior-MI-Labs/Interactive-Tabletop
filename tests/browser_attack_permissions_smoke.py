"""Real DOM: configured bonus strikes follow a complete Attack action, without consuming a second action."""
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_support import launch_chromium

ROOT = Path(__file__).resolve().parents[1]
hero = {
 'schema_version':1,'system_id':'dnd5e','system_edition':'dnd-2014','name':'Bonus QA','class_level':'Monk 5',
 'species':'Human','background':'','hp':{'current':25,'max':25,'temp':0},'ac':16,'initiative':2,
 'proficiency':3,'speed':'40 ft','abilities':{},'saves':{},'skills':{},'inventory':[],
 'conditions':[],'features':[],'roll_history':[],'effects':{},'spells':[],
 'attacks':[{'id':'staff','name':'Staff','bonus':6,'attack_type':'weapon','damage':'1d6+3'},
            {'id':'fist','name':'Unarmed Strike','bonus':6,'attack_type':'unarmed','damage':'1d6+3'}],
 'combat_profile':{'attacks_per_action':2},'resources':{'Ki':{'current':1,'max':1}},
 'actions':[{'id':'flurry','name':'Flurry of Blows','activation':'1 bonus action','resource':'Ki','cost':1,
  'source':'manual','ruleset_profile':'dnd-2014','effect_kind':'none','requires_attack':True,
  'requires_attack_complete':True,'grant_attacks':2,'grant_attack_scope':'unarmed'}]
}
with sync_playwright() as pw:
 browser=launch_chromium(pw)
 page=browser.new_page(viewport={'width':1440,'height':900});page.set_default_timeout(7500);errors=[]
 page.on('pageerror',lambda error:errors.append(str(error)))
 page.set_content((ROOT/'web/index.html').read_text(),wait_until='domcontentloaded')
 page.add_style_tag(content=(ROOT/'web/styles.css').read_text())
 page.evaluate('''c=>{
 window.testVault={schema_version:1,active_id:'qa',characters:[{id:'qa',character:c,updated_at:'2026'}]};
 window.fetch=async(url,opt={})=>{
  if(url==='/api/vault'){
   if(opt.method==='POST'){window.testVault=JSON.parse(opt.body);return new Response('{}',{status:200});}
   return new Response(JSON.stringify(window.testVault),{status:200});
  }
  if(url==='./theme-assets.json')return new Response('{"version":1,"assets":{}}',{status:200});
  return new Response('{}',{status:404});
 };}''',hero)
 for name in ['dnd-slots.js','character-import.js','vault-store.js','dnd-action.js','browser-pdf.js','dice-physics.js','app.js']:
  page.add_script_tag(content=(ROOT/'web'/name).read_text())
 page.wait_for_function("document.querySelector('.page-title')?.textContent==='Bonus QA'")
 page.evaluate("panelState.set('Advanced encounter tools',true)")
 page.get_by_role('tab',name='My Turn').click()
 page.get_by_role('button',name='Start tracking').click()
 page.evaluate("()=>{Action.setCombatMode(character,'auto');render();}")
 page.evaluate("()=>{const foe=Action.addTarget(character,{name:'Practice Dummy',ac:15,hp:40});selectedTargetId=foe.id;render();}")
 page.get_by_role('tab',name='Actions').click()
 entry=page.locator('.action-entry').filter(has_text='Flurry of Blows');entry.locator('summary').click()
 assert entry.get_by_role('button',name='Use ability').is_disabled()
 assert not page.locator('[data-action="bonus-attack"]').count()
 for expected_remaining in (1,0):
  page.evaluate("handleAction('tracked-attack','0')")
  assert page.evaluate('character.effects.combat.economy.spent.action')==(0 if expected_remaining==1 else 1)
  page.evaluate('beginThrow()')
  assert page.evaluate('character.effects.combat.economy.attacks.remaining')==expected_remaining
  page.evaluate('''()=>{DP.faceValue=()=>1;for(const g of activeRolls)for(const d of dice.filter(d=>g.diceIds.includes(d.id))){d.sleeping=true;d.rolling=false;}finishRollIfSettled();}''')
  entry=page.locator('.action-entry').filter(has_text='Flurry of Blows')
  if expected_remaining:
   assert entry.get_by_role('button',name='Use ability').is_disabled()
  else:
   assert entry.get_by_role('button',name='Use ability').is_enabled()
 entry.get_by_role('button',name='Use ability').click()
 page.locator('#dlg-yes').click()
 assert page.evaluate('character.resources.Ki.current')==0
 assert page.evaluate('character.effects.combat.economy.spent.bonus')==1
 assert page.evaluate('character.effects.combat.economy.spent.action')==1
 assert page.locator('[data-action="bonus-attack"]').count()==1
 bonus=page.locator('[data-action="bonus-attack"]')
 assert '2' in bonus.inner_text()
 bonus.click()
 assert page.evaluate("Action.availableAttackGrants(character,'unarmed')")==2
 page.evaluate('beginThrow()')
 assert page.evaluate("Action.availableAttackGrants(character,'unarmed')")==1
 assert page.evaluate('character.effects.combat.economy.spent.action')==1
 assert page.evaluate('character.effects.combat.economy.spent.bonus')==1
 assert not errors,errors
 browser.close()
 print('PASS browser Flurry: disabled until completed Attack action, one Ki, one bonus action, scoped bonus strikes on throw')
