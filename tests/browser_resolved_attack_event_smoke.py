"""Real browser: settled or confirmed melee hits open exactly one eligible event."""
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_support import launch_chromium
ROOT=Path(__file__).resolve().parents[1]
hero={
 'schema_version':1,'system_id':'dnd5e','system_edition':'dnd-2014','rules_profile':'manual',
 'name':'On Hit QA','class_level':'Monk 5','species':'Human','background':'',
 'hp':{'current':30,'max':30,'temp':0},'ac':17,'initiative':1,'proficiency':3,'speed':'40 ft',
 'abilities':{},'saves':{},'skills':{},'inventory':[],'conditions':[],'features':[],
 'roll_history':[],'effects':{},'spells':[],
 'attacks':[{'id':'staff','name':'Staff','bonus':6,'damage':'1d6+3','attack_type':'weapon','attack_range':'melee'},
            {'id':'bow','name':'Bow','bonus':6,'damage':'1d8+3','attack_type':'weapon','attack_range':'ranged'}],
 'resources':{'Ki':{'current':2,'max':2}},
 'actions':[{'id':'stun','name':'Stunning Strike','activation':'special','source':'manual',
             'trigger_event':'melee-hit','resource':'Ki','cost':1,'effect_kind':'none'}]
}
with sync_playwright() as pw:
 browser=launch_chromium(pw)
 page=browser.new_page(viewport={'width':1400,'height':900});page.set_default_timeout(7000);errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
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
 for n in ['dnd-slots.js','character-import.js','vault-store.js','dnd-action.js','browser-pdf.js','dice-physics.js','app.js']:
  page.add_script_tag(content=(ROOT/'web'/n).read_text())
 page.wait_for_function("document.querySelector('.page-title')?.textContent==='On Hit QA'")
 page.evaluate('''()=>{
 const t=Action.addTarget(character,{name:'Ogre',ac:15,hp:30});selectedTargetId=t.id;
 Action.setEncounter(character,true);render();
 }''')
 entry=page.locator('.action-entry').filter(has_text='Stunning Strike')
 assert entry.count()==1
 entry.locator('summary').click()
 assert entry.get_by_role('button',name='Use ability').is_disabled()
 # An actual hit against known AC opens an event, never auto-spends Ki.
 page.evaluate("handleAction('attack','0')")
 assert page.evaluate('pendingRoll') is not None
 assert page.evaluate('character.resources.Ki.current')==2
 page.evaluate('''()=>{
  beginThrow();DP.faceValue=()=>15;
  for(const g of activeRolls)for(const d of dice.filter(d=>g.diceIds.includes(d.id))){d.sleeping=true;d.rolling=false;}
  finishRollIfSettled();
 }''')
 assert page.evaluate("Action.combatEvent(character)?.kind")=='melee-hit'
 assert page.evaluate("Action.combatEvent(character)?.origin")=='resolved-attack'
 assert page.evaluate('character.resources.Ki.current')==2
 entry=page.locator('.action-entry').filter(has_text='Stunning Strike')
 assert entry.get_by_role('button',name='Use ability').is_enabled()
 # One hit belongs to exactly one target. Changing the target must disable
 # the ability without paying Ki; switching back restores the live window.
 page.evaluate('''()=>{const t=Action.addTarget(character,{name:'Other target',ac:15,hp:20});selectedTargetId=t.id;render();}''')
 entry=page.locator('.action-entry').filter(has_text='Stunning Strike')
 assert entry.get_by_role('button',name='Use ability').is_disabled()
 assert page.evaluate('character.resources.Ki.current')==2
 page.evaluate('''()=>{selectedTargetId=Action.targets(character).find(t=>t.name==='Ogre').id;render();}''')
 entry=page.locator('.action-entry').filter(has_text='Stunning Strike')
 assert entry.get_by_role('button',name='Use ability').is_enabled()
 # Auto damage preparation is not a cost; clear it to choose an on-hit ability.
 page.keyboard.press('Escape')
 assert page.evaluate('pendingRoll') is None
 page.evaluate("handleAction('action-use','0')")
 assert page.evaluate('character.resources.Ki.current')==2
 # Ability confirmation is separate from the attack hit; no implicit charge.
 assert page.locator('#dlg-yes').count()==1
 page.locator('#dlg-yes').click()
 assert page.evaluate('character.resources.Ki.current')==1
 assert page.evaluate('Action.combatEvent(character).used') is True
 # A ranged hit cannot claim the melee trigger, even on natural 20.
 page.evaluate('''()=>{Action.advanceTurn(character);render();handleAction('attack','1');beginThrow();DP.faceValue=()=>20;
 for(const g of activeRolls)for(const d of dice.filter(d=>g.diceIds.includes(d.id))){d.sleeping=true;d.rolling=false;}finishRollIfSettled();}''')
 assert page.evaluate('Action.combatEvent(character)') is None
 page.keyboard.press('Escape')
 # Guided flow waits for a human hit confirmation before opening a window.
 page.evaluate("Action.advanceTurn(character);Action.setCombatMode(character,'guided');render();handleAction('attack','0');beginThrow();DP.faceValue=()=>12;for(const g of activeRolls)for(const d of dice.filter(d=>g.diceIds.includes(d.id))){d.sleeping=true;d.rolling=false;}finishRollIfSettled();")
 assert page.evaluate('Action.combatEvent(character)') is None
 assert page.locator('#dlg-yes').count()==1
 page.locator('#dlg-yes').click()
 assert page.evaluate('Action.combatEvent(character)?.origin')=='resolved-attack'
 assert page.evaluate('character.resources.Ki.current')==1
 # Explicit Guided Miss cannot create the hit window.
 page.keyboard.press('Escape')
 page.evaluate("Action.advanceTurn(character);render();handleAction('attack','0');beginThrow();DP.faceValue=()=>2;for(const g of activeRolls)for(const d of dice.filter(d=>g.diceIds.includes(d.id))){d.sleeping=true;d.rolling=false;}finishRollIfSettled();")
 assert page.evaluate('Action.combatEvent(character)') is None
 assert page.locator('#dlg-no').count()==1
 page.locator('#dlg-no').click()
 assert page.evaluate('Action.combatEvent(character)') is None
 # Manual mode still rolls physical dice but leaves event adjudication manual.
 page.evaluate("Action.advanceTurn(character);Action.setCombatMode(character,'manual');render();handleAction('attack','0');beginThrow();DP.faceValue=()=>20;for(const g of activeRolls)for(const d of dice.filter(d=>g.diceIds.includes(d.id))){d.sleeping=true;d.rolling=false;}finishRollIfSettled();")
 assert page.evaluate('Action.combatEvent(character)') is None
 assert not errors,errors
 browser.close()
 print('PASS browser resolved hits: settled auto and guided, melee-only, action eligibility, no premature Ki')
