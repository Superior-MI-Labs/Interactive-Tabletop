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
 # d20 mode is a single always-visible selector outside the collapsed widget.
 assert page.locator('#dice-widget').get_attribute('open') is None
 assert page.locator('.dice-dock .d20-modes [data-d20-mode]').count()==3
 page.locator('[data-d20-mode=advantage]').click()
 assert page.locator('[data-d20-mode=advantage]').get_attribute('aria-pressed')=='true'
 assert page.evaluate("d20Mode==='advantage'")
 page.evaluate("queueRoll('1d20','Mode QA')")
 assert page.evaluate("pendingRoll.d20Mode==='advantage' && pendingRoll.primaryCount===2")
 page.evaluate('cancelPreparedRoll()')
 page.locator('[data-d20-mode=disadvantage]').click()
 assert page.evaluate("d20Mode==='disadvantage'")
 page.locator('[data-d20-mode=normal]').click()
 assert page.evaluate("d20Mode==='normal'")
 assert page.locator('#dice-widget').get_attribute('open') is None

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
 # A very fast Alt sweep must collect more than the former 20-die cap.
 # The swept segment crosses 23 stationary dice in one frame.
 page.evaluate("""()=>{
  dice=[];throwSettings.height=0;
  for(let i=0;i<23;i++){
   const d=DP.makeDie(6,140+i*42,215,22);d.id=++nextDieId;
   d.q=[1,0,0,0];d.z=DP.height(d);d.sleeping=true;dice.push(d);DP.park(d);
  }
 }""")
 stage=page.locator('#dice-stage').bounding_box()
 hx,hy=stage['x']+140,stage['y']+215-page.evaluate('dice[0].z*.45')
 page.mouse.move(hx,hy);page.mouse.down()
 assert page.evaluate('pointer?.selected.length')==1
 page.keyboard.down('Alt')
 page.evaluate('pointer.x+=950') # Simulate movement between animation frames.
 page.wait_for_function('pointer?.selected.length>=21')
 assert page.evaluate('pointer.selected.length')==23,'All 23 loose dice are collectible'
 page.keyboard.press('Escape');page.keyboard.up('Alt');page.mouse.up()
 assert page.evaluate('pointer===null && dice.every(d=>!d.held)')
 page.evaluate('abandonCharacterDice(activeId);dice=[];throwSettings.height=.35')
 # The displayed label is not a trustworthy roll type: an authored roll can
 # coincidentally share the manual tray's display name.
 page.evaluate("""()=>{
  queueRoll('1d6','Manual dice');
  const extra=DP.makeDie(8,120,210,30);extra.id=++nextDieId;dice.push(extra);
  window.protectedExtraId=extra.id;
  beginThrow(120,30,0,null,[extra]);
 }""")
 assert page.evaluate('activeRoll.diceIds.length')==1,'character roll must not absorb the extra die'
 assert page.evaluate('!activeRoll.diceIds.includes(window.protectedExtraId)')
 page.evaluate('abandonCharacterDice(activeId);dice=[]')
 # A deliberately prepared manual tray, by contrast, combines extras.
 page.evaluate("""()=>{
  addReadyDie(6);
  const extra=DP.makeDie(8,120,210,30);extra.id=++nextDieId;dice.push(extra);
  beginThrow(120,30,0,null,[extra]);
 }""")
 assert page.evaluate('activeRoll.diceIds.length')==2,'manual tray must combine collected dice'
 assert page.evaluate("activeRoll.expression==='1d6+1d8'")
 page.evaluate('abandonCharacterDice(activeId);dice=[]')
 assert page.locator('details[data-panel="Conditions"]').count()==0
 assert page.locator('.buff-bar .condition-rail .condition-toggle').count()==15
 assert page.locator('.recipient-context').is_visible()
 assert page.get_by_role('tab',name='My Turn').count()==1
 assert page.locator('.personal-turn-summary').count()==0
 assert page.locator('.vitals-line').count()==1
 # Saves live alongside abilities with their original imported modifier.
 assert page.locator('.abilities-strip .ability-card').count()==1
 assert page.locator('details[data-panel="Saving throws"]').count()==0
 assert page.locator('.ability-card .ability-save').inner_text()=='Save +3'
 page.locator('.ability-card .ability-save').click(modifiers=['Alt'])
 assert page.evaluate("pendingRoll?.expression==='1d20+3' && pendingRoll?.rollKind==='save'")
 page.evaluate('cancelPreparedRoll()')
 assert page.locator('.skill-chips .skill-chip').count()==1
 page.locator('.skill-chip').click(modifiers=['Alt'])
 assert page.evaluate("pendingRoll?.expression==='1d20+6' && pendingRoll?.rollKind==='ability-check'")
 page.evaluate('cancelPreparedRoll()')
 assert page.locator('.sheet-layout>.game-workspace').count()==1

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
 # With ten hearts fitting horizontally, thirty hearts occupy three rows.
 page.evaluate('''()=>{const meter=document.querySelector(".hearts");meter.style.flex="0 0 210px";meter.style.width="210px";}''')
 rows=page.evaluate('''()=>[...new Set([...document.querySelectorAll(".heart")].map(h=>Math.round(h.getBoundingClientRect().top)))]''')
 assert len(rows)==3,f'Hearts should wrap into three rows, got {len(rows)}'
 assert page.evaluate('''()=>{const m=document.querySelector(".hearts");return m.scrollWidth<=m.clientWidth+2}'''),'No horizontal HP scrolling'
 # For very high maximum HP, wheel navigates the wrapped hearts; the HP
 # number remains the intentional +/-1 adjustment target.
 page.evaluate('''()=>{character.hp.max=203;character.hp.current=203;render();
   const m=document.querySelector(".hearts");m.style.flex="0 0 210px";m.style.width="210px"}''')
 assert page.locator('.hearts .heart').count()==203
 assert page.evaluate('''()=>{const m=document.querySelector(".hearts");return m.scrollHeight>m.clientHeight}''')
 page.locator('.hearts').hover()
 page.mouse.wheel(0,250)
 page.wait_for_function('document.querySelector(".hearts").scrollTop>0')
 assert page.evaluate('character.hp.current')==203,'Scrolling heart rows must not damage or heal the character'
 page.evaluate('character.hp.max=30;character.hp.current=30;render()')

 assert page.evaluate('vaultData.characters[0].character.hp.heart_value')==1,'vault-owned setting'
 page.locator('.hearts .heart').nth(11).click(modifiers=['Alt'])
 assert page.evaluate('character.hp.current')==12,'heart click sets exact HP'
 assert page.locator('.vitals-panel [data-action=rest]').count()==0
 # Compact resource chips share the character's existing resource-pip controller.
 page.evaluate('''()=>{character.resources.Ki.current=15;character.resources.Ki.max=19;
   character.resources['Level 1 Spell Slots']={current:2,max:2,reset:'long rest'};render()}''')
 assert page.locator('.resource-chip').count()==2
 ki=page.locator('.resource-chip-wrap').filter(has=page.locator('.resource-chip[data-arg="Ki"]'))
 ki.locator('.resource-chip').hover()
 assert ki.locator('.resource-preview .pip-row').count()==2,'nineteen pips render in two rows'
 assert ki.locator('.resource-preview .resource-pip').count()==19
 assert ki.locator('.resource-preview').evaluate('(el)=>getComputedStyle(el).visibility')=='visible'
 page.locator('.resource-chip[data-arg="Ki"]').click(modifiers=['Alt'])
 assert page.locator('.resource-pinned-card').count()==1
 page.locator('.resource-chip[data-arg="Level 1 Spell Slots"]').click(modifiers=['Alt'])
 assert page.locator('.resource-pinned-card').count()==2,'Two resource controls pin independently'
 assert page.locator('.resource-pinned-grid').evaluate('(el)=>getComputedStyle(el).display')=='grid'
 page.locator('.resource-pinned-card').first.locator('.resource-pip').nth(10).click(modifiers=['Alt'])
 assert page.evaluate('character.resources.Ki.current')==11,'Pinned pips use the original resource setter'
 assert page.locator('.resource-pinned-card').count()==2,'Pinned panels remain open after editing'

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
