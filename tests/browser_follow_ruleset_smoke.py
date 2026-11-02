"""Regression for user-reported cursor stuck on Guidance dice and rules profile selection."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright
from browser_support import launch_chromium
ROOT=Path(__file__).resolve().parents[1]
c={
 'schema_version':1,'system_id':'dnd5e','system_edition':'unspecified','name':'Test Cleric','class_level':'Cleric 3',
 'species':'Human','hp':{'max':20,'current':15,'temp':0},'ac':15,'initiative':1,'proficiency':2,'speed':'30 ft',
 'abilities':{'WIS':{'score':18,'modifier':4}},'saves':{'Wisdom':6},'skills':{'Medicine':6},'attacks':[],
 'inventory':[],'spells':[{'id':'guide','name':'Guidance','level':0,'source':'Cleric','prepared':True,'casting_time':'1 action'},
  {'id':'cure','name':'Cure Wounds','level':1,'source':'Cleric','prepared':True,'casting_time':'1 action'}],
 'resources':{'Level 1 Spell Slots':{'max':2,'current':2}},'effects':{'active':[
  {'id':'spell:guide','name':'Guidance','charges':1,'bonus_dice':'1d4','bonus_scope':'ability-check','target':'self','auto_use':True,'concentration':True,'rounds_remaining':10}]},
 'conditions':[],'features':[],'actions':[],'roll_history':[], 'notes':''}
with sync_playwright() as pw:
 browser=launch_chromium(pw)
 page=browser.new_page(viewport={'width':1400,'height':900});errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content((ROOT/'web/index.html').read_text(),wait_until='domcontentloaded')
 page.add_style_tag(content=(ROOT/'web/styles.css').read_text())
 catalog=json.loads((ROOT/'web/dnd-2014-reference.json').read_text())
 page.evaluate('''([c,catalog])=>{
 window.fetch=async(url,opt={})=>{
 if(url==='/api/vault')return new Response(JSON.stringify({schema_version:1,active_id:'hero',characters:[{id:'hero',character:c,updated_at:'2026'}]}),{status:200});
 if(url==='./dnd-2014-reference.json')return new Response(JSON.stringify(catalog),{status:200});
 if(url==='./theme-assets.json')return new Response('{"version":1,"assets":{}}',{status:200});
 return new Response('{}',{status:404});};
 }''',[c,catalog])
 for file in ['dnd-slots.js','character-import.js','vault-store.js','dnd-action.js','reference-catalog.js','browser-pdf.js','dice-physics.js','app.js']:
  page.add_script_tag(content=(ROOT/'web'/file).read_text())
 page.wait_for_function("document.querySelector('.page-title')?.textContent==='Test Cleric'")
 assert page.get_by_role('checkbox',name='Automatically use Guidance').is_checked()
 skill=page.get_by_role('button',name='Medicine',exact=False)
 skill.focus();page.keyboard.press('Enter')
 assert page.evaluate('following===true && pendingRoll?.diceIds.length===2'), 'd20 + d4 must follow'
 # The cursor falls between two dice and over an interactive ability control.
 button=page.locator('.ability-roll').first
 rect=button.bounding_box();point={'x':rect['x']+rect['width']/2,'y':rect['y']+rect['height']/2}
 page.mouse.move(point['x'],point['y'])
 page.mouse.down()
 assert page.evaluate("pointer?.mode==='prepared' && pointer?.selected.length===2"), 'must capture full group, even in the gap or over a button'
 page.mouse.move(point['x']+65,point['y']+42,steps=5)
 page.mouse.up()
 assert page.evaluate('pointer===null && pendingRoll===null && activeRolls.length===1'), 'drag/release must throw'
 assert page.evaluate('activeRolls[0].bonuses.length')==1
 # We deliberately settle dice, proving effect lifecycle triggers a UI refresh.
 page.evaluate('''()=>{for (const d of dice){d.held=false;d.sleeping=true;d.rolling=false;}finishRollIfSettled();}''')
 assert page.evaluate('character.effects.active.length')==0,'Guidance charge must expire'
 assert page.locator('.buff-token').filter(has_text='Guidance').count()==0,'Guidance must disappear immediately'
 assert page.evaluate('history[0].bonuses[0].name')=='Guidance'
 assert page.evaluate('history[0].total===history[0].baseTotal+history[0].bonuses[0].total')
 # Select once per character; no global rewrite of imported record.
 page.locator('#rules-profile').select_option('srd-2014')
 assert page.get_by_role('dialog').count()>0
 page.get_by_role('button',name='Continue').click()
 assert page.evaluate("character.rules_profile==='srd-2014' && character.system_edition==='dnd-2014'")
 assert page.evaluate("character.spells[0].automation===undefined")
 assert page.evaluate('''()=>{const s=character.spells[1],r=ReferenceCatalog.match('spell',s.name,character.system_edition);return DndAction.planSpell(character,s,1,r.automation).automatic;}''')
 page.evaluate("()=>{character.spells[1].automation='manual';render();}")
 assert page.evaluate('''()=>{const s=character.spells[1],r=ReferenceCatalog.match('spell',s.name,character.system_edition);return !DndAction.planSpell(character,s,1,r.automation).automatic;}''')
 # A short click without dragging must release the prepared group.
 page.evaluate("()=>{queueRoll('1d20+2','Short click test');}")
 assert page.evaluate('following===true')
 stage=page.locator('#dice-stage').bounding_box()
 page.mouse.click(stage['x']+stage['width']*.44,stage['y']+stage['height']*.56)
 assert page.evaluate('following===false && pendingRoll===null && activeRolls.length===1')
 page.evaluate('''()=>{for(const d of dice)if(!d.held){d.sleeping=true;d.rolling=false;}finishRollIfSettled();}''')
 assert page.evaluate('history[0].label')=='Short click test'
 assert not errors,errors
 browser.close()
 print('PASS browser: mixed dice cursor pickup/throw, no click-through, Guidance expiration repaint, verified global rules profile and individual override')
