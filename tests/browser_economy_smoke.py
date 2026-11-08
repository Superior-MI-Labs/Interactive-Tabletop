"""Live UI acceptance for configurable turn pools, granted custom resources, and automatic Attack action spending."""
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_support import launch_chromium
ROOT=Path(__file__).resolve().parents[1]
character={
 'schema_version':1,'name':'Economy QA','class_level':'Fighter 5','species':'Human','background':'',
 'hp':{'current':20,'max':20,'temp':0},'ac':16,'initiative':1,'proficiency':3,'speed':'30 ft',
 'abilities':{'STR':{'score':16,'modifier':3}},'saves':{},'skills':{},'attacks':[{'id':'a1','name':'Sword','bonus':6,'damage':'1d8+3'}],
 'inventory':[],'conditions':[],'features':[],'roll_history':[],'effects':{},'spells':[],
 'resources':{'Ki':{'max':5,'current':5,'reset':'short rest'}},
 'combat_profile':{'attacks_per_action':2,'action_pools':{'action':1,'bonus':1,'reaction':1}},
 'actions':[{'id':'f1','name':'Two-Point Activity','activation':'1 action','economy_units':2,'effect_kind':'none','source':'manual'},
            {'id':'guard','name':'Defensive Focus','activation':'1 bonus action','requires_attack':True,'grant_resource':'Guard Points','grant_amount':3,'effect_kind':'none','source':'manual'}]
}
with sync_playwright() as pw:
 browser=launch_chromium(pw)
 page=browser.new_page(viewport={'width':1440,'height':900});errors=[]
 page.on('pageerror',lambda error:errors.append(str(error)))
 page.set_content((ROOT/'web/index.html').read_text(),wait_until='domcontentloaded')
 page.add_style_tag(content=(ROOT/'web/styles.css').read_text())
 page.evaluate('''c=>{window.testVault={schema_version:1,active_id:'qa',characters:[{id:'qa',character:c,updated_at:'2026'}]};
 window.fetch=async(url,opt={})=>{
  if(url==='/api/vault'){
   if(opt.method==='POST'){window.testVault=JSON.parse(opt.body);return new Response('{}',{status:200});}
   return new Response(JSON.stringify(window.testVault),{status:200});
  }
  if(url==='./theme-assets.json')return new Response('{"version":1,"assets":{}}',{status:200});
  return new Response('{}',{status:404});
 };}''',character)
 for name in ['dnd-slots.js','character-import.js','vault-store.js','dnd-action.js','browser-pdf.js','dice-physics.js','app.js']:
  page.add_script_tag(content=(ROOT/'web'/name).read_text())
 page.wait_for_function("document.querySelector('.page-title')?.textContent==='Economy QA'")
 page.get_by_role('button',name='Start encounter').click()
 page.evaluate("()=>{const foe=Action.addTarget(character,{name:'Practice Dummy',ac:15,hp:40});selectedTargetId=foe.id;render();}")
 cfg=page.locator('.economy-config');cfg.locator('summary').click()
 cfg.locator('[data-economy-config="action"]').fill('3')
 cfg.locator('[data-economy-config="action"]').press('Tab')
 assert page.evaluate('Action.poolLimits(character).action')==3
 cfg=page.locator('.economy-config');cfg.locator('summary').click()
 cfg.locator('#economy-new-resource').fill('Guard Points')
 cfg.locator('#economy-new-resource-max').fill('3')
 cfg.get_by_role('button',name='Create pool').click()
 assert page.evaluate('character.resources["Guard Points"].max')==3
 # The two-action custom activity consumes two pool units after explicit confirmation.
 entry=page.locator('.action-entry').filter(has_text='Two-Point Activity');entry.locator('summary').click()
 entry.get_by_role('button',name='Use ability').click();page.locator('#dlg-yes').click()
 assert page.evaluate('character.effects.combat.economy.spent.action')==2
 # A third action could be consumed by Attack, and not when the dice are only prepared.
 page.locator('[data-action="attack"]').first.click()
 assert page.evaluate('character.effects.combat.economy.spent.action')==2
 page.evaluate('beginThrow()')
 assert page.evaluate('character.effects.combat.economy.spent.action')==3
 assert page.evaluate('character.effects.combat.economy.attacks.remaining')==1
 # A trained reaction/bonus technique requires the Attack action; it fills its own resource pool.
 entry=page.locator('.action-entry').filter(has_text='Defensive Focus');entry.locator('summary').click()
 entry.get_by_role('button',name='Use ability').click();page.locator('#dlg-yes').click()
 assert page.evaluate('character.resources["Guard Points"].current')==3
 assert page.evaluate('character.effects.combat.economy.spent.bonus')==1
 # Manual mode disables automatic spending without restoring already committed costs.
 page.locator('#combat-mode').select_option('manual')
 assert page.evaluate('character.effects.combat.economy.auto') is False
 page.get_by_role('button',name='Next turn').click()
 assert page.evaluate('character.effects.combat.economy.spent.action')==0
 assert page.evaluate('character.effects.combat.economy.auto') is False
 assert not errors,errors
 print('PASS browser action pools: 3-point custom economy, 2-point ability, attack dice lifecycle, bonus prerequisite, custom grant, manual switch')
 browser.close()
