/* Sky Blue Eyes Tabletop v0.10.0 — offline andlocal-first.
 * The versioned character JSON is the only source of character truth.
 */
'use strict';
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
constesc=(s)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const sgn=n=>n>=0?`+${n}`:`${n}`;
let character=null,view='overview',search='', showArchived=false, saveTimer=0, lastResult=null, editRollModifiers=false;
const STATIC_SITE=Boolean(window.__STATIC_TABLETOP__);
const STORAGE_KEY='smi.tabletop.character.v1';
let editMode=false, actionFilter='all',spellFilter='all';
constDP=globalThis.DicePhysics;
let history=[],pendingRoll=null,dice=[],activeRoll=null,pointer=null,frame=0,lastFrame=0,accumulator=0,canvas=null,ctx=null;
let lastDimensions={w:0,h:0},nextDieId=0;
let pointerPosition=null,following=false; // stage-localcursor, not a second dice scene

const panelState=new Map();

function toast(message){$('#status-msg').textContent=message;}
function save(){
  if(!character)return;
  clearTimeout(saveTimer);
  $('#save-state').textContent='Saving…';
saveTimer=setTimeout(async ()=>{
    try{
      if(STATIC_SITE){localStorage.setItem(STORAGE_KEY,JSON.stringify(character));}
      else {const r=awaitfetch('/api/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(character)});
      if(!r.ok)throw Error((await r.json()).error||`HTTP ${r.status}`);}
      $('#save-state').textContent='Saved locally';
}catch(e){$('#save-state').textContent='Save failed!';toast('Save error: '+e.message);}
  },220);
}
function setView(to){
  if(to==='rolls')to='overview'; // legacy Combat page navigation uses the unified Character view.
  view=to;
search='';showArchived=false;actionFilter='all';spellFilter='all';
  render();
}
function button(label,action,arg='',variant='ghost'){return `<button class="${variant}" type="button" data-action="${esc(action)}"data-arg="${esc(arg)}">${esc(label)}</button>`;}
function input(path,value,type='text',cls='input'){return `<input aria-label="${esc(path)}" class="${cls}" type="${esc(type)}" data-input="${esc(path)}" value="${esc(value)}">`;}
functionpanel(name,content,defaultOpen=true){return `<details class="panel" data-panel="${esc(name)}" ${panelState.get(name)??defaultOpen?'open':''}><summary>${esc(name)}</summary><div class="panel-content">${content}</div></details>`;}
functionstat(label,value,meta=''){return `<div class="kpi" title="${esc(meta)}"><small>${esc(label)}</small><div class="value">${esc(value)}</div></div>`;}
function rollButton(label,modifier,expression,editType='',editKey=''){
 return `<divclass="rollrow"><button class="rollable" type="button" data-roll="${esc(expression)}" data-roll-label="${esc(label)}"><span>${esc(label)}</span><span class="tag">${esc(sgn(modifier))}</span></button>
 ${editType?`<input aria-label="Edit${esc(label)} modifier" class="input sm bonus-editor" type="number" data-mod-type="${esc(editType)}" data-mod-name="${esc(editKey)}" value="${esc(modifier)}">`:''}</div>`;
}
function field(label,path,value,type='text'){return `<labelclass="field"><span class="field-label">${esc(label)}</span>${input(path,value,type)}</label>`;}

// Small, accessible presentation controls; only character JSON owns their values.
const conditionPaths={
 Blinded:'M3 3l18 18 M10.6 10.7a2 2 0 0 02.7 2.7 M5 7C7 5 9 4 12 4c5 0 9 5 10 8a17 17 0 0 1-4 4 M3 12s2 4 6 5c5 2 9-1 12-5',
 Charmed:'M20.8 5.8c-2-2-5-2-7 0L12 7.5l-1.8-1.7c-4-4-10 0-7 5.3L12 21l8.8-9.9c1.7-2 1.7-4 0-5.3Z',
 Deafened:'M3 3l18 18 M9 6c3-3 9-1 9 4 0 4-4 4-4 7 0 5-7 5-7 0 M1110c1-2 4-1 4 1',
 Exhaustion:'M3 7h17v10H3z M21 10v4 M6 10h4 M6 13h4',
 Frightened:'M12 3 2 21h20L12 3z M12 9v5 M12 18h.01',
 Grappled:'M8 8 5 11a3 3 0 0 0 4 4l3-3 M12 12l3-3a3 3 0 0 1 4 4l-3 3 M8 16l8-8',
 Incapacitated:'M12 2a10 10 0 1 0 0 20 10 10 00 0 0-20 M5 5l14 14',
 Invisible:'M3 12s3-7 9-7 9 7 9 7-3 7-9 7-9-7-9-7z M10 10a3 3 0 0 1 4 4 M4 20l16-16',
 Paralyzed:'M7 4h4v16H7z M14 4h4v16h-4z',
 Petrified:'M6 3h12l4 7-10 11L2 10l4-7z M2 10h20 M9 3l-3 7 6 11 6-11-3-7',
 Poisoned:'M9 14a5 5 0 1 16 0 M8 16h8v3H8z M9 19v2 M15 19v2 M9 10h.01 M15 10h.01 M10 14h4',
 Prone:'M4 19h16 M6 5l6 6 6-6 M12 11v7',
 Restrained:'M6 10V7a6 6 0 0 1 12 0v3 M5 10h14v11H5z M12 14v3',
 Stunned:'M13 2 5 13h7l-1 9 8-11h-7z',
 Unconscious:'M19 3a9 9 0 1 0 2 15A9 9 0 01 19 3Z'
};
function conditionRail(){
 const active=character.conditions||[];
 return `<div class="condition-rail"><div class="condition-head"><strong>Conditions</strong><span>${active.length?`${active.length} active`:'None active'}</span></div>
<div class="condition-icons" aria-label="Toggle character conditions">${Object.entries(conditionPaths).map(([name,path])=>{
  const on=active.includes(name);
  return `<button type="button" class="condition-icon ${on?'on':''}"data-action="condition" data-arg="${esc(name)}" data-tip="${esc(name)} · ${on?'Active':'Inactive'}" aria-label="${esc(name)}: ${on?'active':'inactive'}" aria-pressed="${on}"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none"stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg></button>`;
 }).join('')}</div></div>`;
}
function heartMeter(hp){
 const total=Math.max(1,Math.ceil(hp.max/5));
 consthearts=Array.from({length:Math.min(500,total)},(_,i)=>{
  const capacity=Math.max(0,Math.min(5,hp.max-i*5));
  const remaining=Math.max(0,Math.min(capacity,hp.current-i*5));
  const percent=remaining/5*100;
  const target=Math.min(hp.max,(i+1)*5);
return `<button type="button" class="heart" data-action="set-hp" data-arg="${target}" aria-label="Set health to ${target} of ${hp.max}" data-tip="Set health to ${target} HP · 5 HP per heart" style="--heart-fill:${percent}%"><svgviewBox="0 0 24 24" aria-hidden="true"><path class="heart-empty" d="M12 21 3.1 12.2C-1 8 2 2.8 6.7 3.3c2 0 3.9 1 5.3 2.9 1.4-1.9 3.3-2.9 5.3-2.9C22 2.8 25 8 20.9 12.2L12 21Z"/><path class="heart-full" d="M12 21 3.1 12.2C-1 8 2 2.8 6.7 3.3c2 03.9 1 5.3 2.9 1.4-1.9 3.3-2.9 5.3-2.9C22 2.8 25 8 20.9 12.2L12 21Z"/></svg></button>`;
 }).join('');
 return `<div class="hearts" role="group" aria-label="Health: ${hp.current} of ${hp.max}, five points per heart">${hearts}</div>`;
}
functionresourcePips(name,v){
 const max=Math.max(0,Math.floor(num(v.max))),current=Math.max(0,Math.min(max,Math.floor(num(v.current))));
 const rendered=Math.min(max,100);
 const rows=[];
 for(let row=0;row<rendered;row+=10){
  constpips=Array.from({length:Math.min(10,rendered-row)},(_,offset)=>{
   const i=row+offset,value=i<current?i:i+1;
   return `<button type="button" class="resource-pip ${i<current?'filled':''}" data-action="resource-set"data-arg="${esc(name)}:${value}" data-tip="${esc(name)} · set to ${value}/${max}" aria-label="Set ${esc(name)} to ${value} of ${max}" aria-pressed="${i<current}"></button>`;
  }).join('');
  rows.push(`<divclass="pip-row">${pips}</div>`);
 }
 return `<div class="resource-pips"><div class="resource-info"><strong>${esc(name)}</strong><span class="resource-count">${current}<span>/${max}</span></span><small title="Refreshes on ${esc(v.reset)}">↻${esc(v.reset)}</small></div><div class="pip-track" role="group" aria-label="${esc(name)}: ${current} of ${max}">${rows.join('')}${max>100?`<label class="large-resource">Set value <input type="number" class="input sm"data-resource-edit="${esc(name)}" min="0" max="${max}" value="${current}"></label>`:''}</div></div>`;
}
function attackRows(mode='compact'){
 return (character.attacks||[]).map((a,i)=>{
  constcontrols=`${button('Attack','attack',String(i),'button mini')}${button('Damage','damage',String(i),'button mini subtle')}`;
  if(mode==='detailed')return `<div class="resource-row"><div><strong>${esc(a.name)}</strong><small>Damage:${esc(a.damage)}</small></div><div class="res-count">${esc(sgn(a.bonus))}</div><div class="controls-row">${controls}</div></div>`;
  return `<div class="attack-row" title="${esc(a.name)} · ${esc(a.damage)}"><spanclass="attack-name">${esc(a.name)}</span><strong class="attack-bonus">${esc(sgn(a.bonus))}</strong><div class="controls-row">${controls}</div></div>`;
 }).join('');
}
function rollRows(kind,mode='compact'){
 constentries=kind==='ability'?Object.entries(character.abilities||{}).map(([key,v])=>[key+' check',v.modifier,key]):Object.entries(character[kind]||{}).map(([key,v])=>[kind==='saves'?key+' save':key,v,key]);
 return entries.map(([label,modifier,key])=>`<divdata-filter-row="${esc(label.toLowerCase())}">${rollButton(label,modifier,`1d20${sgn(modifier)}`,mode==='detailed'||mode==='editable'?kind:'',key)}</div>`).join('');
}
function combatActions(){
 const sky=String(character.name).toLowerCase()==='skyblue eyes'&&/monk/i.test(character.class_level||'');
 return `<section class="combat-actions" aria-label="Combat actions"><strong>Actions</strong>
 ${sky?button('Shield stance · Action','stance','','button mini subtle'):''}
${sky?button(character.effects?.empty_body_rounds>0?`Empty Body · ${character.effects.empty_body_rounds} rounds`:'Empty Body · 4 Ki','empty-body','','button mini subtle'):''}
 ${button('Next turn ↗','advance-turn','','button minisubtle')}</section>`;
}
// The sheet is the complete combat screen. Details are never duplicated in another tab.
function identityRibbon(){
 const move=(character.speed.match(/\d+\s*ft/gi)||[]).map(s=>parseInt(s,10)).join(' / ')||character.speed;
return `<header class="identity-ribbon">
 <div class="sheet-portrait avatar-glyph" aria-hidden="true">✦</div>
 <div class="identity-copy"><small class="sheet-eyebrow">CHARACTER SHEET</small><h1class="page-title">${esc(character.name)}</h1><div class="identity-sub">${esc(character.class_level)} · ${esc(character.species)} · ${esc(character.background)}</div></div>
 <div class="status-chips" aria-label="Character statistics">
${stat('AC',character.ac,'Armor class')}${stat('INIT',sgn(character.initiative),character.initiative_note||'Initiative')}${stat('PROF',sgn(character.proficiency),'Proficiency bonus')}${stat('MOVE',move,'Walk / fly / climb in feet')}
 </div>
 <buttontype="button" class="button mini subtle edit-mode-button" data-action="edit-mode" aria-pressed="${editMode}">${editMode?'Done editing':'Edit sheet'}</button>
 ${editMode?`<details class="identity-editor"><summary class="edit-details"title="Edit character identity and primary statistics" aria-label="Edit primary character information">✎ <span>Edit</span></summary>
 <div class="identity-fields">${field('Name','name',character.name)}${field('Armorclass','ac',character.ac,'number')}${field('Initiative','initiative',character.initiative,'number')}${field('Proficiency','proficiency',character.proficiency,'number')}${field('Movement','speed',character.speed)}${field('Class /level','class_level',character.class_level)}${field('Species','species',character.species)}${field('Background','background',character.background)}</div>
 </details>`:''}</header>`;
}
function savingRolls(){return `<divclass="rolls-tight">${rollRows('saves','editable')}</div>`;}
function skillRolls(){return `<div class="skill-tools">${editBonusButton()}<label class="sr-only" for="skill-filter">Find skill</label><input id="skill-filter" class="input"type="search" placeholder="Find a skill…" aria-label="Find skill"></div>
 <div class="rolls-tight skills-list">${rollRows('skills','editable')}</div>`;}
function editBonusButton(){return editMode?`<button type="button" class="edit-bonus"data-action="toggle-edit-rolls" aria-pressed="${editRollModifiers}" data-tip="${editRollModifiers?'Finish editing':'Edit'} saved skill and saving throw bonuses">${editRollModifiers?'Done':'✎'}</button>`:'';}
function workspaceTabs(){
 constitems=[['overview','Actions'],['spells','Spells'],['inventory','Inventory'],['features','Features'],['background','Background'],['notes','Notes']];
 return `<nav class="workspace-tabs" aria-label="Character gameplay pages"role="tablist">${items.map(([key,label])=>`<button type="button" role="tab" aria-selected="${view===key}" class="nav ${view===key?'active':''}" data-view="${key}">${label}</button>`).join('')}</nav>`;
}
function actionWorkspace(){
 constattackFilter=actionFilter==='all'||actionFilter==='attack';
 const specialFilter=actionFilter==='all'||actionFilter==='action';
 const entries=(character.actions||[]).map((a,i)=>({...a,index:i})).filter(a=>!a.archived);
 return `<divclass="workspace-toolbar"><div class="workspace-filters" aria-label="Filter combat actions">
 ${[['all','All'],['attack','Attacks'],['action','Abilities']].map(([key,label])=>`<button type="button" data-action="action-filter" data-arg="${key}"class="filter-chip ${actionFilter===key?'selected':''}" aria-pressed="${actionFilter===key}">${label}</button>`).join('')}</div>
 ${editMode?button('+ Custom ability','add-action','','button mini'):''}</div>
 ${attackFilter?`<divclass="attack-list">${attackRows()}</div>`:''}
 ${specialFilter?`${combatActions()}<div class="ability-action-list" aria-label="Imported and custom actions">${entries.map(a=>{
   const roll=a.roll||'', damage=a.damage||'';
   return `<detailsclass="work-entry action-entry" data-action-id="${esc(a.id||a.index)}"><summary><span class="entry-title">${esc(a.name)}</span><span class="entry-meta">${esc(a.activation||'special')}${a.source==='manual'?' ·Custom':a.source==='user-reference'?' · Screenshot reference':''}</span></summary>
   <div class="entry-details"><p class="action-description">${esc(a.description||'No rules description imported. Configure manually if needed.')}</p>
   <divclass="controls-row action-buttons">${roll?button('Roll '+roll,'action-roll',String(a.index),'button mini'):''}
   ${damage?button('Damage '+damage,'action-damage',String(a.index),'button mini subtle'):''}
   ${a.resource&&num(a.cost)>0?button('Spend'+a.cost+' '+a.resource,'action-spend',String(a.index),'button mini subtle'):''}
   ${!roll&&!damage?button('Use / view','action-use',String(a.index),'button mini subtle'):''}</div>
   ${editMode?`<div class="action-editor"><divclass="entry-pair">${field('Name',`actions.${a.index}.name`,a.name)}${field('Activation',`actions.${a.index}.activation`,a.activation||'')}</div>
   <div class="entry-pair">${field('Roll expression',`actions.${a.index}.roll`,roll)}${field('Damageexpression',`actions.${a.index}.damage`,damage)}</div>
   <div class="entry-pair">${field('Resource name',`actions.${a.index}.resource`,a.resource||'')}${field('Cost',`actions.${a.index}.cost`,a.cost||0,'number')}</div>
   ${field('Description / DMruling',`actions.${a.index}.description`,a.description||'')}
   ${button('Archive ability','archive-action',String(a.index),'button mini subtle')}</div>`:''}</div></details>`;
 }).join('')}</div></div>`:''}`;
}
function workspacePane(){
 letcontent=({overview:actionWorkspace,inventory,spells,features,background:backgroundPage,notes:notesPage}[view]||actionWorkspace)();
 return `<section class="game-workspace" aria-label="Tabbed gameplay workspace"><divclass="workspace-caption">GAMEPLAY <span>• ${esc(character.name)}</span></div>${workspaceTabs()}<div class="workspace-content" data-scroll-key="workspace" role="tabpanel">${content}</div></section>`;
}
function overview(){
 consthp=character.hp;
 const res=Object.entries(character.resources||{}).map(([key,v])=>resourcePips(key,v)).join('');
 const ability=Object.entries(character.abilities||{}).map(([abbr,a])=>
  `<div class="ability-card"><divclass="ability-head"><span>${esc(abbr)}</span><button type="button" class="ability-roll" data-action="roll-ability" data-arg="${esc(abbr)}" data-tip="Roll ${esc(abbr)} check" aria-label="Roll ${esc(abbr)} check">d20 ↗</button></div>
<div class="ability-values">${editMode?input(`abilities.${abbr}.score`,a.score,'number','input sm ability-number'):`<strong class="ability-readout">${esc(a.score)}</strong>`}
  <label>MOD${editMode?input(`abilities.${abbr}.modifier`,a.modifier,'number','input sm ability-mod'):`<strong class="mod-readout">${esc(sgn(a.modifier))}</strong>`}</label></div></div>`).join('');
 return identityRibbon()+
 `<section class="vitals-panel"aria-label="Hit points and conditions">
 <div class="vital-heading"><strong>♥ Vitality</strong><span class="hp-total">${hp.current}<span> / ${hp.max} HP</span></span><span class="temp-hp">${hp.temp?`+${hp.temp} temporary HP`:'No temporaryHP'}</span></div>
 ${heartMeter(hp)}
 <div class="vital-controls"><label class="amount-label" for="hp-amount">HP</label><input id="hp-amount" class="input md" type="number" min="0" max="99999" value="5" aria-label="Damage or healingamount">
 ${button('− Damage','hp','damage','button warn')}${button('+ Heal','hp','heal','button')}
 <span class="vital-separator"></span>${button('Short rest','rest','short','button subtle')}${button('Long rest','rest','long','button subtle')}
<details class="vital-edit"><summary title="Adjust HP totals and temporary HP">Edit HP</summary><div class="form-grid">
 ${field('Current HP','hp.current',hp.current,'number')}${field('Maximum HP','hp.max',hp.max,'number')}${field('TemporaryHP','hp.temp',hp.temp,'number')}
 </div></details></div></section>
 <div class="hud-four ${editRollModifiers?'editing-rolls':''}" ${editRollModifiers?'data-edit-bonuses="true"':''}>
 <div class="hud-zone hud-attributes"data-scroll-key="attributes">${panel('Abilities',`<div class="grid three">${ability}</div>`)}${panel('Saving throws',savingRolls())}</div>
 <div class="hud-zone hud-skills" data-scroll-key="skills">${panel('Skills',skillRolls())}</div>
 <divclass="hud-zone hud-resources" data-scroll-key="resources">${panel('Resources',res)}${panel('Conditions',conditionRail())}</div>
 <div class="hud-zone hud-main">${workspacePane()}</div>
 </div>`;
}

function inventory(){
 constitems=(character.inventory||[]).map((it,i)=>({...it,index:i})).filter(it=>(showArchived||!it.archived)&&(it.name||'').toLowerCase().includes(search.toLowerCase()));
 return `<div class="workspace-toolbar"><input class="input search" id="filter"placeholder="Find equipment…" value="${esc(search)}" aria-label="Search inventory">
 ${button('+ Item','add-item','','button mini')}${button(showArchived?'Hide archived':'Show archived','toggle-archived','','button mini subtle')}</div>
 <divclass="workspace-entries" aria-label="Equipment list">${items.map(it=>`<details class="work-entry ${it.archived?'archived':''}"><summary>
 <span class="entry-title">${esc(it.name)}</span><spanclass="entry-meta">${it.archived?'Archived':`${esc(it.quantity)} owned`}</span></summary>
 <div class="entry-details">${field('Name',`inventory.${it.index}.name`,it.name)}<div class="entry-pair">
${field('Quantity',`inventory.${it.index}.quantity`,it.quantity,'number')}${field('Weight',`inventory.${it.index}.weight`,it.weight||'')}</div>
 ${field('Notes',`inventory.${it.index}.notes`,it.notes||'')}
${button(it.archived?'Restore':'Archive','archive',String(it.index),'button mini subtle')}</div></details>`).join('')}</div>`;
}
function spells(){
 const all=character.spells||[];
 constprepared=all.filter(sp=>sp.prepared&&!sp.always_prepared&&num(sp.level,-1)!==0).length;
 const filtered=all.map((sp,index)=>({...sp,index})).filter(sp=>{
   if(spellFilter==='prepared')return sp.prepared||sp.always_prepared||sp.level===0;
if(spellFilter==='available')return sp.available!==false&&!sp.prepared&&!sp.always_prepared&&sp.level!==0;
   return true;
 });
 return `<div class="workspace-toolbar spell-toolbar"><div class="workspace-filters" aria-label="Filter spells">
${[['all','All'],['prepared','Prepared / Ready'],['available','Available to prepare']].map(([key,label])=>`<button type="button" data-action="spell-filter" data-arg="${key}" class="filter-chip ${spellFilter===key?'selected':''}"aria-pressed="${spellFilter===key}">${label}</button>`).join('')}</div>
 <input class="input search" id="filter" placeholder="Find spells…" value="${esc(search)}" aria-label="Search spells"></div>
 <divclass="spell-summary">${all.length} PDF records · ${prepared} manually prepared · cantrips / always-prepared stay ready</div>
 <div class="workspace-entries" aria-label="Spellbook entries">${filtered.map(sp=>{
 constlocked=sp.always_prepared||sp.level===0;
 const badge=sp.level===0?'Cantrip':sp.level==null?'Level unknown':`Level ${sp.level}`;
 const state=sp.always_prepared?'Always prepared':sp.level===0?'At will':sp.prepared?'Prepared':'Available';
 return `<divclass="spell-entry" data-spell-name="${esc((sp.name||'').toLowerCase())}"><details class="work-entry"><summary><span class="entry-title">${esc(sp.name)}</span><span class="entry-meta">${badge} · ${state}</span></summary>
 <divclass="entry-details"><div><b>Source:</b> ${esc(sp.source||'Unknown')}</div><div><b>Casting:</b> ${esc(sp.casting_time||'Unknown')} · ${esc(sp.range||'')}</div><div><b>Duration:</b> ${esc(sp.duration||'Unknown')}</div>
 <div><b>Components:</b>${esc(sp.components||'')}</div><div><b>Save / attack:</b> ${esc(sp.save||'—')}</div>${sp.notes?`<p>${esc(sp.notes)}</p>`:''}
 <p class="subtle-note">PDF preparation marker retained; changing preparation never spends a spellslot.</p></div></details>
 <label class="prepared-control" data-tip="${esc(sp.name)} · ${state}"><input type="checkbox" data-prep="${sp.index}" ${sp.prepared||locked?'checked':''} ${locked?'disabled':''} aria-label="Prepare${esc(sp.name)}"><span>${locked?'Ready':'Prep'}</span></label></div>`;
 }).join('')}</div>`;
}
function features(){
 return `<div class="workspace-feature-list">
 ${panel('Features & traits',(character.features||[]).map((x,i)=>
 `<detailsclass="feature" ${i===0?'open':''}><summary>${esc(x.title)}</summary><pre>${esc(x.text)}</pre></details>`).join(''))}
 <div>${panel('Homebrew adjudication',`<textarea class="input longtext"data-input="homebrew_notes">${esc(character.homebrew_notes||'')}</textarea>
 <p class="subtle-note">Imported custom rules may be incomplete. Confirm unusual effects and resource costs with your DM before playing.</p>`)}
 </div></div>`;
}
functionbackgroundPage(){
 return `<section class="journal-page"><h2>Character background</h2><p>Imported background: <strong>${esc(character.background||'Unknown')}</strong></p>
 <p class="workspace-hint">Narrative and appearance details imported from thePDF remain in Features. Add session observations under Notes; homebrew rulings stay with Features.</p></section>`;
}
function notesPage(){
 return `<section class="journal-page"><h2>Session notes</h2><textarea class="input longtext"data-input="notes" aria-label="Session notes">${esc(character.notes||'')}</textarea></section>`;
}

function render(){
 if(!character)return;
 if(typeof hideHudTip==='function')hideHudTip();
 $$('#pagedetails[data-panel]').forEach(el=>panelState.set(el.dataset.panel,el.open));
 const scrollers=$$('#page [data-scroll-key]');
 const scrolls=new Map(scrollers.map(el=>[el.dataset.scrollKey,{x:el.scrollLeft,y:el.scrollTop}]));
 const openEntries=newSet($$('#page details[data-action-id][open]').map(el=>el.dataset.actionId));
 $('#page').innerHTML=overview();
 $$('#page [data-scroll-key]').forEach(el=>{const p=scrolls.get(el.dataset.scrollKey);if(p){el.scrollLeft=p.x;el.scrollTop=p.y;}});
 $$('#pagedetails[data-action-id]').forEach(el=>{if(openEntries.has(el.dataset.actionId))el.open=true;});
}
function setPath(path,value){
 const parts=path.split('.');
 if(!/^[a-zA-Z][a-zA-Z0-9_]*(?:\.\d+|\.[a-zA-Z][a-zA-Z0-9_]*)*$/.test(path))return;
 letobj=character;
 for(const p of parts.slice(0,-1)){if(!obj||!Object.prototype.hasOwnProperty.call(obj,p))return;obj=obj[p];}
 const key=parts.at(-1);
 if(!obj||!Object.prototype.hasOwnProperty.call(obj,key))return;
 if(typeofobj[key]==='number')value=Math.max(key==='current' && path.startsWith('hp.')?0:-999999,Math.min(999999,num(value)));
 obj[key]=value;save();
}
function dialog(heading,message,onConfirm){
 const layer=$('#dialog-layer');
 layer.hidden=false;
layer.innerHTML=`<section class="dialog" role="dialog" aria-modal="true" aria-label="${esc(heading)}"><h2>${esc(heading)}</h2><p>${esc(message)}</p>
 <div class="controls-row"><button class="button subtle" id="dlg-no">Cancel</button><buttonclass="button primary" id="dlg-yes">Continue</button></div></section>`;
 $('#dlg-no').onclick=()=>{layer.hidden=true;layer.innerHTML='';};
 $('#dlg-yes').onclick=()=>{layer.hidden=true;layer.innerHTML='';onConfirm();};
}
functionapplyDamage(kind){
 const amount=Math.max(0,Math.min(999999,Math.floor(num($('#hp-amount')?.value,0))));
 if(kind==='heal')character.hp.current=Math.min(character.hp.max,character.hp.current+amount);
 else {
   constsoak=Math.min(character.hp.temp,amount);
   character.hp.temp-=soak;
   character.hp.current=Math.max(0,character.hp.current-(amount-soak));
 }
 save();render();
}
function doRest(kind){
 if(kind==='long')character.hp.current=character.hp.max;
for(const res of Object.values(character.resources||{})){
   if(res.reset==='turn')res.current=0;
   else if(kind==='long'||(kind==='short'&&res.reset==='short rest'))res.current=res.max;
 }
if(kind==='long'){character.conditions=character.conditions.filter(x=>x==='Exhaustion');character.effects.empty_body_rounds=0;}
 save();render();toast(`${kind==='long'?'Long':'Short'} rest applied`);
}
function handleAction(action,arg){
switch(action){
  case 'edit-mode':editMode=!editMode;if(!editMode)editRollModifiers=false;render();break;
  case 'action-filter':actionFilter=arg;render();break;
  case 'spell-filter':spellFilter=arg;render();break;
  case'toggle-edit-rolls':editRollModifiers=!editRollModifiers;render();break;
  case 'hp':applyDamage(arg);break;
  case 'rest':dialog('Complete '+arg+' rest?',`Restore eligible resources${arg==='long'?' and hit points':''}?`,()=>doRest(arg));break;
  case'condition':character.conditions=character.conditions.includes(arg)?character.conditions.filter(x=>x!==arg):[...character.conditions,arg];save();render();break;
  case'set-hp':{character.hp.current=Math.max(0,Math.min(character.hp.max,num(arg)));save();render();break;}
  case 'resource-set':{const at=arg.lastIndexOf(':'),name=arg.slice(0,at),value=num(arg.slice(at+1));constr=character.resources?.[name];if(r){r.current=Math.min(r.max,Math.max(0,value));save();render();}break;}
  case 'resource':{const at=arg.lastIndexOf(':'),name=arg.slice(0,at),delta=num(arg.slice(at+1));constr=character.resources?.[name];if(r){r.current=Math.min(r.max,Math.max(0,r.current+delta));save();render();}break;}
  case 'add-action':character.actions=character.actions||[];character.actions.unshift({id:'manual-'+Date.now(),name:'Newability',activation:'action',description:'',roll:'',damage:'',resource:'',cost:0,source:'manual',archived:false});save();render();break;
  case 'archive-action':{const a=character.actions?.[num(arg)];if(a){a.archived=true;save();render();}break;}
  case'action-use':{const a=character.actions?.[num(arg)];if(a)toast(a.name+' is a narrative action. No resource or dice roll applied automatically.');break;}
  case 'action-roll':case 'action-damage':{const a=character.actions?.[num(arg)];if(a){constexpression=action==='action-roll'?a.roll:a.damage;if(expression)queueRoll(expression,a.name+(action==='action-roll'?' roll':' damage'));}break;}
  case 'action-spend':{const a=character.actions?.[num(arg)],r=character.resources?.[a?.resource];constcost=Math.max(0,num(a?.cost));if(a&&r&&cost){if(r.current<cost){toast('Not enough '+a.resource);break;}r.current-=cost;save();render();toast('Spent '+cost+' '+a.resource+' on '+a.name);}else toast('Configure a valid resource and cost first.');break;}
case 'add-item':character.inventory.unshift({id:'custom-'+Date.now(),name:'New item',quantity:1,weight:'',archived:false,notes:''});save();render();break;
  case 'toggle-archived':showArchived=!showArchived;render();break;
  case 'archive':{constr=character.inventory[num(arg)];if(r){r.archived=!r.archived;save();render();}break;}
  case 'roll-ability':{const a=character.abilities[arg];if(a)queueRoll(`1d20${sgn(a.modifier)}`,arg+' check');break;}
  case 'attack':{consta=character.attacks[num(arg)];if(a)queueRoll(`1d20${sgn(a.bonus)}`,a.name+' attack');break;}
  case 'damage':{const a=character.attacks[num(arg)];if(a){const ex=/\d+d\d+(?:[+-]\d+)?/i.exec(a.damage);if(ex)queueRoll(ex[0],a.name+' damage');elsetoast('Could not parse damage dice: '+a.damage);}break;}
  case 'clear-history':history.length=0;lastResult=null;updateTableResults();save();break;
  case 'clear-table':if(activeRoll){toast('Finish the current rollfirst.');break;}dice=[];pendingRoll=null;pointer=null;following=false;updateTableResults();toast('Table cleared');break;
  case 'stance':{
    if(character.resources?.['Shield Stance Points'])character.resources['Shield Stance Points'].current=4;
save();render();toast('Defensive stance entered (action).');break;
  }
  case 'empty-body':{
    if((character.effects?.empty_body_rounds||0)>0){toast('Empty Body already active.');break;}
    const ki=character.resources?.Ki;
if(!ki||ki.current<4){toast('Not enough Ki for Empty Body (requires 4).');break;}
    ki.current-=4;character.effects=character.effects||{};
    character.effects.empty_body_rounds=10;
if(!character.conditions.includes('Invisible'))character.conditions.push('Invisible');
    save();render();toast('Empty Body activated • 10 rounds remaining');break;
  }
  case 'advance-turn':{
    if(character.resources?.['Shield StancePoints'])character.resources['Shield Stance Points'].current=0;
    if(character.effects?.empty_body_rounds>0){
      character.effects.empty_body_rounds--;
if(character.effects.empty_body_rounds===0)character.conditions=character.conditions.filter(x=>x!=='Invisible');
    }
    save();render();toast('Advanced one turn');break;
  }
  case 'custom-roll':{constex=$('#custom-roll')?.value;if(ex)queueRoll(ex,ex);break;}
  case 'auto-throw': if(!pendingRoll)queueRoll('1d20','d20');beginThrow(130,65,80);break;
 }
}
function parseExpression(raw){
 constmatch=/^\s*(\d{0,2})d(4|6|8|10|12|20|100)\s*([+-]\s*\d{1,5})?\s*$/i.exec(raw);
 if(!match)throw Error('Use e.g. 1d20+15, 2d6+3, or d100');
 const count=num(match[1]||1),sides=num(match[2]),modifier=num((match[3]||'0').replace(/\s/g,''));
if(count<1||count>20)throw Error('Only 1–20 dice per throw');
 return {count,sides,modifier,expression:`${count}d${sides}${modifier?sgn(modifier):''}`};
}
// Use the dice already on the table as the source of truth for requested rolls.
// Arequested d20 borrows a resting d20 before constructing another one.
// Visual size is independent of physics rules. One radius applies to new dice,
// reused dice and rendering so hit-testing and collisions stay consistent.
function dieRadius(){
const {w,h}=lastDimensions;
 return Math.max(27,Math.min(44,Math.min(w||800,h||700)*.058));
}
function diceSpacing(){return dieRadius()*2.45;}
function prepareDice(specs,modifier,label,expression,follow=false){
 if(activeRoll){toast('Let the dicesettle first.');return;}
 const existingReady=dice.filter(d=>d.ready);
 existingReady.forEach(d=>{d.ready=false;d.held=false;});
 const chosen=[],created=[],used=new Set();
 for(const sides of specs){
   letdie=dice.find(d=>d.sides===sides&&!used.has(d.id)&&d.sleeping);
   if(!die){
     if(dice.length>=35){dice=dice.filter(d=>!created.includes(d));existingReady.forEach(d=>d.ready=true);toast('Table full (35 dice). Clear unused dice first.');return;}
die=DP.makeDie(sides,0,0,dieRadius());
     die.id=++nextDieId;dice.push(die);created.push(die);
   }
   used.add(die.id);chosen.push(die);
 }
 const W=lastDimensions.w||950,H=lastDimensions.h||650;
 constanchor=follow&&pointerPosition?pointerPosition:{x:W*.79,y:H*.38};
 chosen.forEach((d,i)=>{
   d.ready=true;d.rolling=false;d.sleeping=true;
   // The existing die is physically moved to the requested cursor, not cloned.
   constcols=Math.min(4,chosen.length),col=i%cols,row=Math.floor(i/cols);
   const spacing=diceSpacing();
   d.x=Math.max(d.r,Math.min(W-d.r,anchor.x+(col-(cols-1)/2)*spacing));
   d.y=Math.max(d.r,Math.min(H-d.r,anchor.y+row*spacing));
d.z=DP.height(d);d.v=[0,0,0];d.w=[0,0,0];
 });
 pendingRoll={count:chosen.length,sides:null,modifier,label,expression};
 following=follow;
 $('#tray-help').textContent=`${expression} ready · ${follow?'the dice follow your cursor; click, flick andrelease':'drag a die or press Throw'}`;
 toast(`${chosen.length} ${chosen.length===1?'die':'dice'} ready · ${expression}`);
}
function queueRoll(expr,label){
 try{
   const p=parseExpression(expr);
prepareDice(Array(p.count).fill(p.sides),p.modifier,label,p.expression,true);
 }catch(e){toast(e.message);}
}
function addReadyDie(sides){
 if(activeRoll){toast('Finish the current throw first.');return;}
 following=false;
if(dice.length>=35||dice.filter(d=>d.ready).length>=20){toast('Dice limit reached: 20 per throw, 35 on table.');return;}
 const W=lastDimensions.w||500,H=lastDimensions.h||500;
 const ready=dice.filter(d=>d.ready),i=ready.length;
 // Additive placement:clicking d6 then d20 keeps both dice ready.
 const spacing=diceSpacing();
 const x=Math.max(dieRadius(),Math.min(W-dieRadius(),W*.82+((i%3)-1)*spacing));
 const y=Math.max(dieRadius(),Math.min(H-dieRadius(),H*.29+Math.floor(i/3)*spacing));
 constdie=DP.makeDie(sides,x,y,dieRadius());
 die.id=++nextDieId;die.ready=true;dice.push(die);
 const all=dice.filter(d=>d.ready);
 const expression=all.map(d=>`1d${d.sides}`).join('+');
pendingRoll={count:all.length,sides:null,modifier:0,expression,label:'Manual dice'};
 $('#tray-help').textContent=`${all.length} dice ready · grab one and throw the group`;
 toast(`${all.length} dice ready on the tabletop`);
}
functiondownloadJson(){
 if(!character){toast('Import a character first.');return;}
 const payload=new Blob([JSON.stringify(character,null,2)],{type:'application/json'});
 const url=URL.createObjectURL(payload),a=document.createElement('a');
a.href=url;a.download=(character.name||'character').replace(/[^a-z0-9-]+/gi,'-')+'-character.json';a.click();
 setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function acceptImport(newCharacter,kind='json'){
if(!newCharacter||newCharacter.schema_version!==1||!newCharacter.name||!newCharacter.hp||!Array.isArray(newCharacter.inventory))throw Error('This is not a compatible character JSON.');
 const install=()=>{
if(kind==='pdf'&&character&&newCharacter.name===character.name){
   const manual=(character.actions||[]).filter(a=>a.source==='manual'||a.source==='user-reference');
   const importedNames=newSet((newCharacter.actions||[]).map(a=>(a.name||'').toLowerCase().replace(/[^a-z0-9]/g,'')));
   newCharacter.actions=[...(newCharacter.actions||[]),...manual.filter(a=>!importedNames.has((a.name||'').toLowerCase().replace(/[^a-z0-9]/g,'')))];
  }
character=newCharacter;character.actions=character.actions||[];character.roll_history=character.roll_history||[];history=character.roll_history;character.effects=character.effects||{empty_body_rounds:0};save();setView('overview');toast('Characterloaded');
 };
 if(!character){install();return;}
 dialog('Replace the active character?',`Replace ${character.name} with ${newCharacter.name}? Export your current character as JSON first if you want abackup.`,install);
}
document.addEventListener('click',e=>{
 const nav=e.target.closest('[data-view]');if(nav){setView(nav.dataset.view);return;}
 constroll=e.target.closest('[data-roll]');if(roll){queueRoll(roll.dataset.roll,roll.dataset.rollLabel);return;}
 const die=e.target.closest('[data-die]');if(die){addReadyDie(num(die.dataset.die));return;}
 constact=e.target.closest('[data-action]');if(act){handleAction(act.dataset.action,act.dataset.arg||'');return;}
});
document.addEventListener('change',e=>{
 const el=e.target;
 if(el.dataset.resourceEdit){constr=character.resources?.[el.dataset.resourceEdit];if(r){r.current=Math.min(r.max,Math.max(0,Math.floor(num(el.value))));save();render();}return;}
 if(el.dataset.modType){
  const type=el.dataset.modType,key=el.dataset.modName;
  if(type==='ability' &&character.abilities?.[key])character.abilities[key].modifier=num(el.value);
  else if((type==='saves'||type==='skills') && Object.prototype.hasOwnProperty.call(character[type],key))character[type][key]=num(el.value);
  save();render();return;
 }
if(el.dataset.input){
  const value=el.value;
  setPath(el.dataset.input,value);
  // Qty 0 moves to archived, but does not delete imported records.
  if(/^inventory\.\d+\.quantity$/.test(el.dataset.input)){
    consti=num(el.dataset.input.split('.')[1]);character.inventory[i].archived=num(value)<=0;save();render();return;
  }
  // Keep the active disclosure and textarea caret while editing item text or notes.
if(/^inventory\.\d+\.(?:name|weight|notes)$/.test(el.dataset.input) || /^actions\.\d+\./.test(el.dataset.input) || el.dataset.input==='notes' || el.dataset.input==='homebrew_notes')return;
  render();
 }
 if(el.dataset.prep){constv=character.spells[num(el.dataset.prep)];if(v&&!v.always_prepared&&v.level!==0){v.prepared=el.checked;save();}}
});
document.addEventListener('input',e=>{
 if(e.target.id==='skill-filter') {
   const needle=e.target.value.trim().toLowerCase();
$$('#page .skills-list [data-filter-row]').forEach(row=>{row.hidden=Boolean(needle)&&!row.dataset.filterRow.includes(needle);});
   return;
 }
 if(e.target.id==='quick-filter'){
  const needle=e.target.value.trim().toLowerCase();
  $$('#page[data-filter-row]').forEach(row=>{row.hidden=Boolean(needle)&&!row.dataset.filterRow.includes(needle);});
  if(needle)$$('#page .quick-group').forEach(group=>group.open=true);
  return;
 }
 if(e.target.id==='filter'){
  search=e.target.value;constneedle=search.trim().toLowerCase();
  $$('#page .workspace-entries [data-spell-name]').forEach(el=>el.hidden=!!needle&&!el.dataset.spellName.includes(needle));
  if(!$$('#page .workspace-entries [data-spell-name]').length){
   constcaret=e.target.selectionStart;render();const fil=$('#filter');if(fil){fil.focus();fil.setSelectionRange(caret,caret);}
  }
 }});
$('#quick-d20').onclick=()=>{if(!character){toast('Import a character first.');return;}queueRoll('1d20','Quickd20');};
$('#export-json').onclick=downloadJson;
$('#import-json').onclick=()=>$('#json-file').click();
$('#json-file').addEventListener('change',async e=>{
 const file=e.target.files?.[0];if(!file)return;
 try{acceptImport(JSON.parse(awaitfile.text()));}catch(ex){toast('Import failed: '+ex.message);}
 e.target.value='';
});
$('#pdf-file').addEventListener('change',async e=>{
 const file=e.target.files?.[0];if(!file)return;
 toast('Reading PDF…');
 try{
  let data;
if(STATIC_SITE){
   const fields=await window.BrowserPdfFields.extract(await file.arrayBuffer());
   data=window.CharacterImport.fromFields(fields);
  } else {
   const resp=awaitfetch('/api/pdf-fields',{method:'POST',headers:{'Content-Type':'application/pdf'},body:await file.arrayBuffer()});
   const result=await resp.json();if(!resp.ok)throw Error(result.error||'PDF parse failed');
data=window.CharacterImport.fromFields(result.fields);
  }
  acceptImport(data,'pdf');
 }catch(err){toast('PDF import failed: '+err.message);}
 e.target.value='';
});
async function loadThemeAssets(){
 try {
  const response=awaitfetch('./theme-assets.json'); if(!response.ok)return;
  const assets=await response.json();
  const allowed={'surface.table':'--desk-texture','surface.sheet':'--sheet-texture'};
  for(const [id,variable] of Object.entries(allowed)){
   constfilename=assets?.assets?.[id];
   if(typeof filename==='string' && /^[A-Za-z0-9][A-Za-z0-9._-]*\.(png|jpg|webp)$/.test(filename))
    document.documentElement.style.setProperty(variable,`url("./${filename}")`);
  }
 } catch(e){console.warn('Optional asset manifest unavailable',e);}
}
function showWelcome(){
 $('#save-state').textContent='No character loaded';
 $('#page').innerHTML=`<section class="welcome-vault" aria-label="Welcome to the tabletop">
   <divclass="welcome-crest">✺</div>
   <div class="alpha-pill">EARLY ALPHA · WORK IN PROGRESS</div>
   <h1>Your adventure starts here.</h1>
   <p>Upload your <strong>D&amp;D Beyond .pdf character sheet here</strong> and bring your character tothe table.</p>
   <div class="welcome-steps"><label for="pdf-file" class="welcome-button">Choose character PDF</label>
   <button class="button subtle" type="button" id="welcome-json">Restore JSON backup</button></div>
   <pclass="welcome-note">Your character remains in your browser on this device. PDF support is experimental: custom rules, spells and actions may need review. Export JSON backups regularly.</p>
   <details><summary>What is available in thisalpha?</summary><p>Interactive character stats, skills, saves, inventory, spells, resources and a persistent dice table. Some mechanics and PDF variations are not fully automated.</p></details>
 </section>`;
$('#welcome-json').addEventListener('click',()=>$('#json-file').click());
}
async function boot(){
 try{
  let x;
  if(STATIC_SITE){const saved=localStorage.getItem(STORAGE_KEY);x=saved?JSON.parse(saved):null;}
  else {const r=awaitfetch('/api/state');x=await r.json();if(!r.ok)throw Error(x.error||'Character could not load');}
  await loadThemeAssets();
  if(!x?.schema_version||!x?.name){showWelcome();return;}
character=x;character.actions=character.actions||[];character.roll_history=character.roll_history||[];history=character.roll_history;character.effects=character.effects||{empty_body_rounds:0};$('#save-state').textContent='Savedlocally';render();updateTableResults();
 }catch(err){$('#page').innerHTML=`<div class="overlay-notice">Could not load the character: ${esc(err.message)}</div>`;}
}

// ── Persistent tabletop ──────────────────────────────────────────────────
//The physical scene is deliberately outside the character panel render() path.
// Re-rendering, navigating, or collapsing panels must not reset dice or rolls.
function initDiceCanvas(){
 canvas=$('#dice-canvas');ctx=canvas.getContext('2d');
 conststage=$('#dice-stage');
 const relative=e=>{const r=stage.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};};
 // Canvas intentionally ignores pointer events: sheet fields and page tabs remain
 // interactive. The shared tabletopcaptures only actual die hits.
 stage.addEventListener('pointerdown',e=>{
   if(activeRoll||e.button!==0)return;
   const {x,y}=relative(e);pointerPosition={x,y};
   const hit=[...dice].reverse().find(d=>Math.hypot(d.x-x,d.y-d.z*.45-y)<d.r*1.75);
if(!hit)return;
   // Inputs still work when a die happens to be resting on top of a form field.
   if(e.target.closest('button,summary,input,textarea,select,[contenteditable]'))return;
e.preventDefault();e.stopPropagation();stage.setPointerCapture(e.pointerId);
   following=false;
   if(!hit.ready){
     dice.filter(d=>d.ready).forEach(d=>{d.ready=false;d.held=false;});
pendingRoll={count:1,sides:hit.sides,modifier:0,expression:`1d${hit.sides}`,label:`d${hit.sides}`};hit.ready=true;
   }
   const selected=dice.filter(d=>d.ready);
   selected.forEach(d=>{d.held=true;d.sleeping=true;});
pointer={id:e.pointerId,x,y,dx:0,dy:0,shake:0,down:true,lastTime:performance.now(),selected,
    offsets:selected.map(d=>({x:d.x-x,y:d.y-y}))};
   $('#tray-help').textContent='SHAKE · FLICK · RELEASE';
 },true);
stage.addEventListener('pointermove',e=>{
   const {x,y}=relative(e);pointerPosition={x,y};
   if(!pointer?.down){
     if(following&&pendingRoll){
       const selected=dice.filter(d=>d.ready);
       selected.forEach((d,i)=>{
         constcols=Math.min(4,selected.length),col=i%cols,row=Math.floor(i/cols);
         const spacing=diceSpacing();
         d.x=Math.max(d.r,Math.min(lastDimensions.w-d.r,x+(col-(cols-1)/2)*spacing));
d.y=Math.max(d.r,Math.min(lastDimensions.h-d.r,y+row*spacing));d.z=DP.height(d)+15;
       });
     }
     return;
   }
   if(pointer.id!==e.pointerId)return;
   const dt=Math.max(8,performance.now()-pointer.lastTime),dx=x-pointer.x,dy=y-pointer.y;
pointer.dx=pointer.dx*.50+dx/dt*1000*.50;
   pointer.dy=pointer.dy*.50+dy/dt*1000*.50;
   pointer.shake=Math.min(350,pointer.shake+Math.hypot(dx,dy));pointer.x=x;pointer.y=y;pointer.lastTime=performance.now();
   pointer.selected.forEach((d,i)=>{
const off=pointer.offsets[i];d.x=Math.max(d.r,Math.min(lastDimensions.w-d.r,x+off.x));
     d.y=Math.max(d.r,Math.min(lastDimensions.h-d.r,y+off.y));d.z=DP.height(d)+23;
     d.q=DP.advance(d.q,[dy*.052,dx*.052,dx*.018],1);
   });
 });
stage.addEventListener('pointerup',e=>{
   if(!pointer?.down||pointer.id!==e.pointerId)return;
   pointer.down=false;
   beginThrow(Math.max(-850,Math.min(850,pointer.dx)),Math.max(-850,Math.min(850,pointer.dy)),pointer.shake);
 });
stage.addEventListener('pointercancel',e=>{
   if(!pointer?.down||pointer.id!==e.pointerId)return;
   pointer.down=false;pointer.selected.forEach(d=>{d.held=false;d.z=DP.height(d);});pointer=null;
 });
stage.addEventListener('pointerleave',()=>{pointerPosition=null;});
 const draw=(now)=>{
  const r=canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2);
if(canvas.width!==Math.round(r.width*dpr)||canvas.height!==Math.round(r.height*dpr)){
   canvas.width=Math.round(r.width*dpr);canvas.height=Math.round(r.height*dpr);
  }
  ctx.setTransform(dpr,0,0,dpr,0,0);
  lastDimensions={w:r.width,h:r.height};
const dt=Math.max(0,Math.min((now-(lastFrame||now))/1000,.06));lastFrame=now;
  accumulator=Math.min(.08,accumulator+dt);
  while(accumulator>=1/120){
    for(const d of dice)DP.step(d,1/120,r.width,r.height);
    DP.collide(dice);
accumulator-=1/120;
  }
  finishRollIfSettled();
  renderTray(r.width,r.height);
  frame=requestAnimationFrame(draw);
 };
 frame=requestAnimationFrame(draw);
}
function beginThrow(vx=120,vy=45,shake=80){
 if(activeRoll||!pendingRoll)return;
const p=pendingRoll,selected=dice.filter(d=>d.ready);
 if(!selected.length)return;
 selected.forEach((d,i)=>{
  d.held=false;d.ready=false;d.rolling=true;
  DP.launch(d,vx+(DP.random()-.5)*170,vy+(DP.random()-.5)*150,shake);
 });
activeRoll={diceIds:selected.map(d=>d.id),modifier:p.modifier,label:p.label,expression:p.expression};
 pendingRoll=null;pointer=null;following=false;
 $('#tray-help').textContent='Rolling — the dice will finish when they settle';
}
functionfinishRollIfSettled(){
 if(!activeRoll)return;
 const selected=dice.filter(d=>activeRoll.diceIds.includes(d.id));
 if(!selected.length||!selected.every(d=>d.sleeping))return;
 const values=selected.map(d=>{
  const face=DP.faceValue(d);
  returnd.sides===100&&face===0?100:face;
 });
 const p=activeRoll;
 lastResult={label:p.label,total:values.reduce((s,n)=>s+n,0)+p.modifier,parts:values,modifier:p.modifier,expression:p.expression};
history.unshift(lastResult);history.splice(60);activeRoll=null;
 updateTableResults();save();
 $('#tray-help').textContent=`${p.label}: ${values.join(' + ')} ${p.modifier?sgn(p.modifier):''} = ${lastResult.total}`;
}
function updateTableResults(){
const result=$('#last-result'),list=$('#table-history'),count=$('#history-count'),collapsed=$('#collapsed-result');
 if(!result)return;
 result.innerHTML=lastResult?`<strong>${esc(lastResult.total)}</strong> <span>${esc(lastResult.label)} ·${esc(lastResult.parts.join(' + '))} ${lastResult.modifier?sgn(lastResult.modifier):''}</span>`:
 'Pick a die, drag to shake, then release. Dice remain on the table.';
 if(collapsed)collapsed.textContent=lastResult?`${lastResult.total} ·${lastResult.label}`:'Ready';
 count.textContent=String(history.length);
 list.innerHTML=history.slice(0,30).map(h=>`<li>${esc(h.label)} <b>${esc(h.total)}</b> <small>${esc(h.expression)}</small></li>`).join('');
}
function renderTray(W,H){
if(!ctx)return;
 ctx.clearRect(0,0,W,H); // wood and paper are real DOM surfaces beneath the dice
 dice.sort((a,b)=>a.y-b.y).forEach(drawDie);
}
function drawDie(d){
 const {x,y,z,r,sides,q}=d;
 constshape=DP.mesh(sides),perspective=Math.max(.80,Math.min(1.25,1+(y-lastDimensions.h*.5)*.0005+z*.0004)),size=r*perspective;
 const sy=y-z*.45;
ctx.save();ctx.fillStyle='rgba(0,0,0,.38)';ctx.beginPath();ctx.ellipse(x+8,y+12,size*1.05,size*.3,0,0,2*Math.PI);ctx.fill();
 const vertices=shape.v.map(v=>DP.rotate(q,v));
 const faces=[];
 for(let i=0;i<shape.faces.length;i++){
  constface=shape.faces[i];const normal=DP.rotate(q,face.normal);
  if(normal[2]<.02)continue;
  const pts=face.indices.map(index=>{
    const v=vertices[index];return [x+size*v[0],sy-size*v[1]+size*.20*v[2]];
  });
  constcenter=face.indices.reduce((sum,index)=>sum+vertices[index][2],0)/face.indices.length;
  faces.push({pts,shade:normal[2],center,index:i});
 }
 faces.sort((a,b)=>a.center-b.center);
 for(const f of faces){
ctx.beginPath();f.pts.forEach((pt,i)=>i?ctx.lineTo(pt[0],pt[1]):ctx.moveTo(pt[0],pt[1]));ctx.closePath();
  const light=43+f.shade*40;
  ctx.fillStyle=`rgb(${Math.floor(light)},${Math.floor(light+11)},${Math.floor(light+23)})`;ctx.fill();
ctx.strokeStyle=d.ready?'#ffe0a4':'#d9ad72';ctx.lineWidth=d.ready?2.4:1.8;ctx.stroke();
  const area=Math.abs(f.pts.reduce((sum,p,i)=>sum+p[0]*f.pts[(i+1)%f.pts.length][1]-p[1]*f.pts[(i+1)%f.pts.length][0],0)/2);
  if(area>110&&f.shade>.16){
   constcx=f.pts.reduce((s,p)=>s+p[0],0)/f.pts.length,cy=f.pts.reduce((s,p)=>s+p[1],0)/f.pts.length;
   ctx.fillStyle='#fff2d5';ctx.shadowColor='#070a0e';ctx.shadowBlur=3;
   ctx.font=`bold ${Math.max(11,Math.min(21,Math.sqrt(area)*.38))}px Georgia`;
ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(sides===100?String(f.index*10).padStart(2,'0'):f.index+1,cx,cy);
   ctx.shadowBlur=0;
  }
 }
if(d.ready){ctx.save();ctx.strokeStyle='#f5c788bf';ctx.lineWidth=2;ctx.setLineDash([5,4]);ctx.beginPath();ctx.ellipse(x,sy,size*1.19,size*1.13,0,0,Math.PI*2);ctx.stroke();ctx.restore();}
 else if(d.sleeping){ctx.fillStyle='#fff0c7';ctx.font='bold 16pxGeorgia';ctx.textAlign='center';ctx.fillText(String(DP.faceValue(d)),x,y+size+19);}
 ctx.restore();
}

// One hover/focus tooltip for every game HUD control, above scrollable sheets.
consthudTip=document.createElement('div');hudTip.className='hud-tooltip';hudTip.hidden=true;
hudTip.id='hud-tooltip';hudTip.setAttribute('role','tooltip');document.body.append(hudTip);
let tipAnchor=null;
functionhideHudTip(){hudTip.hidden=true;tipAnchor=null;}
function showHudTip(el){
 if(!el?.dataset.tip)return;
 tipAnchor=el;hudTip.textContent=el.dataset.tip;hudTip.hidden=false;
 constr=el.getBoundingClientRect(),width=hudTip.offsetWidth,height=hudTip.offsetHeight;
 hudTip.style.left=Math.max(9,Math.min(innerWidth-width-9,r.left+r.width/2-width/2))+'px';
hudTip.style.top=(r.top>height+14?r.top-height-7:Math.min(innerHeight-height-9,r.bottom+7))+'px';
}
document.addEventListener('pointerover',e=>{
 constel=e.target.closest?.('[data-tip]');if(el&&el!==tipAnchor)showHudTip(el);
});
document.addEventListener('pointerout',e=>{
if(tipAnchor&&!tipAnchor.contains(e.relatedTarget)&&tipAnchor.contains(e.target))hideHudTip();
});
document.addEventListener('focusin',e=>{constel=e.target.closest?.('[data-tip]');if(el)showHudTip(el);});
document.addEventListener('focusout',e=>{if(tipAnchor===e.target)hideHudTip();});
document.getElementById('page').addEventListener('scroll',hideHudTip,{passive:true});

constsheetHandle=$('#sheet-handle');
function updateLayoutButtons(){
 const hidden=document.body.classList.contains('sheet-hidden');
 sheetHandle.innerHTML=hidden?'›› <span>Show sheet</span>':'‹‹ <span>Hide sheet</span>';
sheetHandle.setAttribute('aria-expanded',String(!hidden));
 sheetHandle.title=hidden?'Show character sheet':'Hide charactersheet';
}
sheetHandle.onclick=()=>{document.body.classList.toggle('sheet-hidden');updateLayoutButtons();};
updateLayoutButtons();
if (!DP) {
  $('#save-state').textContent='Startup failed';
  $('#page').innerHTML='<div class="overlay-notice"role="alert">The dice engine did not load. Close older app instances, restart with the supplied launcher, and reload this page. If the problem continues, check the terminal for a missing <code>dice-physics.js</code> request.</div>';
  toast('Startupfailed: dice engine missing');
} else {
  initDiceCanvas();
  boot();
}
