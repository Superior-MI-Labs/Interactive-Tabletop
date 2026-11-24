"""Player-first browser contract: roll, conditions, personal turns, and Self/Other."""
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_support import launch_chromium

ROOT=Path(__file__).resolve().parents[1]
hero={
 'schema_version':1,'system_id':'dnd5e','system_edition':'dnd-2014',
 'name':'Player Sheet QA','class_level':'Cleric 5','species':'Human','background':'',
 'hp':{'current':12,'max':30,'temp':0},'ac':16,'initiative':2,'proficiency':3,'speed':'30 ft',
 'abilities':{'STR':{'score':16,'modifier':3}},'saves':{'Strength':3},'skills':{'Athletics':6},
 'attacks':[{'id':'sword','name':'Sword','bonus':6,'damage':'1d8+3 slashing','attack_type':'weapon'}],
 'inventory':[],'conditions':[],'features':[],'roll_history':[],'effects':{},
 'resources':{'Ki':{'current':3,'max':3,'reset':'short rest'}},
 'actions':[{'id':'blast','name':'Magic Blast','activation':'1 action','roll':'1d6+1',
             'damage':'1d6+1','effect_kind':'damage','source':'manual'}],
 'spells':[{'id':'touch','name':'Aid Touch','level':0,'prepared':True,'source':'manual',
            'roll':'1d6+2','effect_kind':'heal','casting_time':'1 action'}]
}
def settle(page):
 page.evaluate("""()=>{
  beginThrow();for(const d of dice.filter(d=>activeRoll?.diceIds.includes(d.id))){d.sleeping=true;d.rolling=false;}
  finishRollIfSettled();
 }""")
with sync_playwright() as pw:
 browser=launch_chromium(pw)
 page=browser.new_page(viewport={'width':1400,'height':900});page.set_default_timeout(7500)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content((ROOT/'web/index.html').read_text(),wait_until='domcontentloaded')
 page.add_style_tag(content=(ROOT/'web/styles.css').read_text())
 page.evaluate("""c=>{
  window.testVault={schema_version:1,active_id:'hero',characters:[{id:'hero',character:c,updated_at:'2026'}]};
  window.fetch=async(url,init={})=>{
   if(url==='/api/vault'){
    if(init.method==='POST'){window.testVault=JSON.parse(init.body);return new Response('{}',{status:200});}
    return new Response(JSON.stringify(window.testVault),{status:200});
   }
   if(url==='./theme-assets.json')return new Response('{"version":1,"assets":{}}',{status:200});
   return new Response('{}',{status:404});
  };
 }""",hero)
 for file in ['dnd-slots.js','character-import.js','vault-store.js','dnd-action.js','browser-pdf.js','dice-physics.js','app.js']:
  page.add_script_tag(content=(ROOT/'web'/file).read_text())
 page.wait_for_function("document.querySelector('.page-title')?.textContent==='Player Sheet QA'")
 # Sheet toggle belongs to the top bar and remains accessible when hidden.
 assert page.locator('.top-actions #quick-d20 + #sheet-handle').count()==1
 page.locator('#sheet-handle').click()
 assert page.locator('#sheet-handle').inner_text()=='Show sheet'
 assert page.locator('#sheet-handle').get_attribute('aria-expanded')=='false'
 assert not page.locator('#sheet-wrap').is_visible()
 page.locator('#sheet-handle').click()
 assert page.locator('#sheet-wrap').is_visible()
 # Seed loose dice at known positions without relying on random roll outcomes.
 page.evaluate("""()=>{
  dice=[];throwSettings.height=0;
  for(const [side,x] of [[6,200],[8,350]]){
   const d=DP.makeDie(side,x,220,30);d.id=++nextDieId;d.q=[1,0,0,0];
   d.z=DP.height(d);d.sleeping=true;dice.push(d);DP.park(d);
  }
 }""")
 stage=page.locator('#dice-stage').bounding_box()
 x,y=stage['x']+200,stage['y']+220-page.evaluate('dice[0].z*.45')
 page.mouse.move(x,y);page.mouse.down()
 assert page.evaluate('pointer.selected.length')==1
 page.keyboard.down('Alt')
 page.mouse.move(x+125,y,steps=10)
 page.wait_for_function('pointer?.selected.length===2')
 page.keyboard.up('Alt')
 assert page.evaluate('pointer.selected.length')==2
 page.keyboard.press('Escape')
 page.mouse.up()
 assert page.evaluate('pointer===null && dice.every(d=>!d.held)')
 assert page.evaluate('Math.abs(dice.find(d=>d.sides===8).x-350)<3')
 # Recollect and release together as one mixed manual roll.
 page.mouse.move(x,y);page.mouse.down();page.keyboard.down('Alt')
 page.mouse.move(x+125,y,steps=10)
 page.wait_for_function('pointer?.selected.length===2')
 page.keyboard.up('Alt');page.mouse.up()
 assert page.evaluate('activeRoll.diceIds.length')==2
 assert page.evaluate("activeRoll.expression==='1d6+1d8'")
 page.evaluate('abandonCharacterDice(activeId);dice=[];throwSettings.height=.35')
 assert page.locator('details[data-panel="Conditions"]').count()==0
 assert page.locator('.buff-bar .condition-rail .condition-toggle').count()==15
 assert page.locator('.recipient-context').is_visible()
 assert page.get_by_role('tab',name='My Turn').count()==1
 assert page.locator('.personal-turn-summary').count()==0
 assert page.locator('.vitals-line').count()==1
 assert page.locator('.hearts .heart').count()==6,'legacy default five HP per heart'
 page.locator('.hp-total').hover()
 page.mouse.wheel(0,-100)
 assert page.evaluate('character.hp.current')==13,'wheel up adds one'
 page.mouse.wheel(0,100)
 assert page.evaluate('character.hp.current')==12,'wheel down subtracts one'
 page.mouse.wheel(0,3000)
 assert page.evaluate('character.hp.current')==0,'bounded at zero'
 page.mouse.wheel(0,-6000)
 assert page.evaluate('character.hp.current')==30,'bounded at maximum'
 page.locator('.vital-edit summary').click(modifiers=['Alt'])
 page.locator('[data-input="hp.heart_value"]').fill('1')
 page.locator('[data-input="hp.heart_value"]').press('Tab')
 assert page.evaluate('character.hp.heart_value')==1
 assert page.locator('.hearts .heart').count()==30,'one heart per HP'
 assert page.evaluate('vaultData.characters[0].character.hp.heart_value')==1,'vault-owned setting'
 page.locator('.hearts .heart').nth(11).click(modifiers=['Alt'])
 assert page.evaluate('character.hp.current')==12,'heart click sets exact HP'
 assert page.locator('.vitals-panel [data-action=rest]').count()==0
 assert page.locator('.identity-ribbon .header-rest [data-action=rest]').count()==2
 assert page.locator('.identity-ribbon .header-rest').bounding_box()['x']<page.locator('.identity-ribbon .status-chips').bounding_box()['x']
 assert page.locator('.encounter-targets').count()==0
 assert page.evaluate('Action.targets(character).length')==0

 page.locator('.attack-list [data-action=attack]').first.click()
 assert page.evaluate('pendingRoll.expression')=='1d20+6'
 settle(page)
 assert page.evaluate('lastResult.total')>=7
 assert page.evaluate('pendingDamage.length')==0
 assert page.evaluate('Action.combat(character).economy.spent.action')==0
 page.locator('.attack-list [data-action=damage]').first.click(modifiers=['Alt'])
 assert page.evaluate('pendingRoll.expression')=='1d8+3'
 page.evaluate('cancelPreparedRoll()')
 page.locator('.attack-list [data-action=critical-damage]').first.click(modifiers=['Alt'])
 assert page.evaluate('pendingRoll.expression')=='2d8+3'
 page.evaluate('cancelPreparedRoll()')

 page.locator('.buff-bar .condition-rail [data-action=condition][data-arg=Poisoned]').click(modifiers=['Alt'])
 assert page.evaluate("character.conditions.includes('Poisoned')")
 assert page.evaluate("Action.activeEffects(character).length")==0
 page.locator('.buff-bar .condition-rail [data-action=condition][data-arg=Poisoned]').click(modifiers=['Alt'])
 assert not page.evaluate("character.conditions.includes('Poisoned')")

 page.get_by_role('tab',name='My Turn').click(modifiers=['Alt'])
 page.get_by_label('Action economy tracker').get_by_role('button',name='Start tracking').click(modifiers=['Alt'])
 assert page.evaluate('Action.combat(character).active') is True
 assert page.evaluate('Action.combat(character).economy.mode')=='manual'
 page.get_by_label('Action economy tracker').locator('[data-action=mark-turn-action][data-arg=action]').click(modifiers=['Alt'])
 assert page.evaluate('Action.combat(character).economy.spent.action')==1
 # A settled die can cover this attack control. Alt-click reaches the UI.
 page.get_by_role('tab',name='Actions').click(modifiers=['Alt'])
 page.locator('.attack-list [data-action=attack]').first.click(modifiers=['Alt'])
 assert page.evaluate('pendingRoll.expression')=='1d20+6'
 page.evaluate('cancelPreparedRoll()')
 assert page.evaluate('Action.combat(character).economy.spent.action')==1
 page.get_by_role('tab',name='My Turn').click(modifiers=['Alt'])
 page.get_by_label('Action economy tracker').get_by_role('button',name='Next turn').click(modifiers=['Alt'])
 assert page.evaluate('Action.combat(character).economy.spent.action')==0

 page.get_by_role('tab',name='Actions').click(modifiers=['Alt'])
 page.get_by_label('Effect recipient').get_by_role('button',name='Other').click(modifiers=['Alt'])
 page.get_by_role('tab',name='Spells').click(modifiers=['Alt'])
 spell=page.locator('.spell-entry').filter(has_text='Aid Touch')
 spell.locator('summary').click(modifiers=['Alt'])
 spell.get_by_role('button',name='Cast spell').click(modifiers=['Alt'])
 assert 'Other: share the result' in page.locator('#dialog-layer').inner_text()
 page.locator('#dlg-yes').click(modifiers=['Alt'])
 assert page.evaluate('pendingRoll.expression')=='1d6+2'
 settle(page)
 assert page.evaluate('pendingHealing') is None
 assert page.evaluate('character.hp.current')==12

 page.get_by_label('Effect recipient').get_by_role('button',name='Self').click(modifiers=['Alt'])
 spell=page.locator('.spell-entry').filter(has_text='Aid Touch')
 if spell.locator('details').get_attribute('open') is None:spell.locator('summary').click(modifiers=['Alt'])
 spell.get_by_role('button',name='Cast spell').click(modifiers=['Alt'])
 page.locator('#dlg-yes').click(modifiers=['Alt'])
 settle(page)
 assert page.evaluate('pendingHealing?.amount') is not None
 assert page.evaluate('character.hp.current')==12
 page.evaluate("handleAction('apply-roll-heal','')")
 assert page.evaluate('character.hp.current')>12
 assert page.evaluate('Action.targets(character).length')==0
 assert not errors,errors
 browser.close()
 print('PASS player-first: independent attacks/damage/critical, conditions, manual turn, Self/Other and explicit heal')
