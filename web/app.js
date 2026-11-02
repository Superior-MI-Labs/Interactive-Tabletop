/* Interactive Tabletop v0.15.0 — offline and local-first.
 * The versioned character JSON is the only source of character truth.
 */
'use strict';
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=(s)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const sgn=n=>n>=0?`+${n}`:`${n}`;
let character=null,view='overview', search='', showArchived=false, saveTimer=0, lastResult=null, editRollModifiers=false;
const STATIC_SITE=Boolean(window.__STATIC_TABLETOP__);
if(STATIC_SITE&&'serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').catch(()=>{}));
const Vault=window.TabletopVault;
const Action=window.DndAction;
const References=window.ReferenceCatalog;
let catalogKind="all", catalogLevel="all", catalogQuery="";
const vaultStorage=Vault.storage(STATIC_SITE);
let vaultData=Vault.empty(),activeId=null,vaultDirty=false;
let editMode=false, actionFilter='all',spellFilter='all';
const DP=globalThis.DicePhysics;
let history=[],pendingRoll=null,dice=[],activeRolls=[],activeRoll=null,pointer=null,frame=0,lastFrame=0,accumulator=0,canvas=null,ctx=null;
let lastDimensions={w:0,h:0},nextDieId=0;
let queuedEffect=null,pendingHealing=null;
let pointerPosition=null,following=false,hoverDieId=null; // stage-local cursor, not a second dice scene

const panelState=new Map();

function toast(message){$('#status-msg').textContent=message;}
async function persistVault(){
 clearTimeout(saveTimer);
 if(!vaultDirty)return;
 vaultDirty=false;
 try{
  await vaultStorage.write(vaultData);
  $('#save-state').textContent='Saved locally';
 }catch(e){vaultDirty=true;$('#save-state').textContent='Save failed!';toast('Vault save error: '+e.message);throw e;}
}
function save(options={}){
 if(!character||!activeId)return;
 // Undo is only valid immediately after advancing; later mutations must not be reversed by it.
 if(!options.preserveUndo&&character.effects?.combat?.undo_turn)delete character.effects.combat.undo_turn;
 Vault.upsert(vaultData,activeId,character);
 vaultDirty=true;
 $('#save-state').textContent='Saving…';
 clearTimeout(saveTimer);
 saveTimer=setTimeout(()=>{persistVault().catch(()=>{});},240);
}
function showVaultCount(){const n=$('#vault-count');if(n)n.textContent=`(${vaultData.characters.length})`;}
function selectLoadedCharacter(){
 const entry=vaultData.characters.find(x=>x.id===vaultData.active_id);
 activeId=entry?.id||null;
 character=entry?.character||null;
 if(character){
  character.actions=character.actions||[];
  character.roll_history=character.roll_history||[];
  character.effects=character.effects||{empty_body_rounds:0};
  character.system_id=character.system_id||'dnd5e';
  character.system_edition=character.system_edition||'unspecified';
  history=character.roll_history;
  queuedEffect=null;pendingHealing=null;
  setView('overview');
 }else{history=[];showWelcome();}
 showVaultCount();
}
function downloadJsonData(content,filename){
 const payload=new Blob([JSON.stringify(content,null,2)],{type:'application/json'});
 const url=URL.createObjectURL(payload),anchor=document.createElement('a');
 anchor.href=url;anchor.download=filename;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function closeVault(){const layer=$('#vault-layer');layer.hidden=true;layer.innerHTML='';}
function showVault(){
 const layer=$('#vault-layer');layer.hidden=false;
 layer.innerHTML=`<div class="vault-shade"><section class="vault-dialog" role="dialog" aria-modal="true" aria-labelledby="vault-title">
  <header class="vault-header"><div><small>LOCAL CHARACTER LIBRARY</small><h2 id="vault-title">Character vault</h2><p>Your characters stay on this device. Export a backup before clearing browser data.</p></div><button class="button subtle" id="vault-close" aria-label="Close character vault">✕</button></header>
  <div class="vault-toolbar"><label for="pdf-file" class="button primary">Import character PDF</label><button class="button" id="vault-json">Import JSON</button><button class="button" id="vault-backup">Backup all characters</button></div>
  <div class="vault-characters">${vaultData.characters.length?vaultData.characters.map(entry=>{
   const c=entry.character,selected=entry.id===activeId;
   return `<article class="vault-card ${selected?'selected':''}"><div class="vault-info"><strong>${esc(c.name)}</strong><span>${esc(c.class_level||'D&D character')} · ${esc(c.species||'')}</span><small>${selected?'Currently playing':'Saved locally'}</small></div>
   <div class="vault-card-actions"><button class="button ${selected?'subtle':'primary'}" data-vault="open" data-id="${esc(entry.id)}" ${selected?'disabled':''}>${selected?'Open':'Play'}</button><button class="button subtle" data-vault="export" data-id="${esc(entry.id)}">Export</button><button class="button warn" data-vault="delete" data-id="${esc(entry.id)}">Delete</button></div></article>`;
  }).join(''):'<p>No characters yet. Import a D&D Beyond PDF to begin.</p>'}</div>
  <p class="vault-footnote">Early alpha: D&D character sheets only. PDF exports may omit custom rules. Importing a new PDF for an existing character preserves current combat state and manual entries.</p>
  </section></div>`;
 $('#vault-close').onclick=closeVault;
 $('#vault-json').onclick=()=>$('#json-file').click();
 $('#vault-backup').onclick=()=>downloadJsonData(Vault.normalize(vaultData),'interactive-tabletop-vault-backup.json');
 layer.querySelector('.vault-shade').addEventListener('click',e=>{if(e.target.classList.contains('vault-shade'))closeVault();});
}
async function activateCharacter(id){
 await persistVault();
 if(!vaultData.characters.some(x=>x.id===id))return;
 vaultData.active_id=id;vaultDirty=true;
 selectLoadedCharacter();closeVault();await persistVault();toast('Character selected');
}
$('#vault-open').onclick=async()=>{try{await persistVault();showVault();}catch(e){toast('Could not save before switching characters: '+e.message);}};
$('#vault-layer').addEventListener('click',async e=>{
 const button=e.target.closest('[data-vault]');if(!button)return;
 const action=button.dataset.vault,id=button.dataset.id;
 const entry=vaultData.characters.find(x=>x.id===id);if(!entry)return;
 if(action==='open')try{await activateCharacter(id);}catch(ex){toast('Could not switch characters: '+ex.message);}
 if(action==='export')downloadJsonData(entry.character,(entry.character.name||'character').replace(/[^a-z0-9-]+/gi,'-')+'-character.json');
 if(action==='delete'){
  closeVault();dialog('Delete '+entry.character.name+'?', 'This removes the local character. Export a backup first if you may need it again.',async()=>{
   try{await persistVault();vaultData.characters=vaultData.characters.filter(x=>x.id!==id);
    if(vaultData.active_id===id)vaultData.active_id=vaultData.characters[0]?.id||null;
    vaultDirty=true;await persistVault();selectLoadedCharacter();showVault();}
   catch(ex){toast('Delete failed: '+ex.message);}
  });
 }
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#vault-layer').hidden)closeVault();});

function setView(to){
  if(to==='rolls')to='overview'; // legacy Combat page navigation uses the unified Character view.
  view=to;
  search='';showArchived=false;actionFilter='all';spellFilter='all';
  render();
}
function button(label,action,arg='',variant='ghost'){return `<button class="${variant}" type="button" data-action="${esc(action)}" data-arg="${esc(arg)}">${esc(label)}</button>`;}
function input(path,value,type='text',cls='input'){return `<input aria-label="${esc(path)}" class="${cls}" type="${esc(type)}" data-input="${esc(path)}" value="${esc(value)}">`;}
function panel(name,content,defaultOpen=true){return `<details class="panel" data-panel="${esc(name)}" ${panelState.get(name)??defaultOpen?'open':''}><summary>${esc(name)}</summary><div class="panel-content">${content}</div></details>`;}
function stat(label,value,meta=''){return `<div class="kpi" title="${esc(meta)}"><small>${esc(label)}</small><div class="value">${esc(value)}</div></div>`;}
function rollButton(label,modifier,expression,editType='',editKey=''){
 return `<div class="rollrow"><button class="rollable" type="button" data-roll="${esc(expression)}" data-roll-label="${esc(label)}"><span>${esc(label)}</span><span class="tag">${esc(sgn(modifier))}</span></button>
 ${editType?`<input aria-label="Edit ${esc(label)} modifier" class="input sm bonus-editor" type="number" data-mod-type="${esc(editType)}" data-mod-name="${esc(editKey)}" value="${esc(modifier)}">`:''}</div>`;
}
function field(label,path,value,type='text'){return `<label class="field"><span class="field-label">${esc(label)}</span>${input(path,value,type)}</label>`;}

// Small, accessible presentation controls; only character JSON owns their values.
const conditionPaths={
 Blinded:'M3 3l18 18 M10.6 10.7a2 2 0 0 0 2.7 2.7 M5 7C7 5 9 4 12 4c5 0 9 5 10 8a17 17 0 0 1-4 4 M3 12s2 4 6 5c5 2 9-1 12-5',
 Charmed:'M20.8 5.8c-2-2-5-2-7 0L12 7.5l-1.8-1.7c-4-4-10 0-7 5.3L12 21l8.8-9.9c1.7-2 1.7-4 0-5.3Z',
 Deafened:'M3 3l18 18 M9 6c3-3 9-1 9 4 0 4-4 4-4 7 0 5-7 5-7 0 M11 10c1-2 4-1 4 1',
 Exhaustion:'M3 7h17v10H3z M21 10v4 M6 10h4 M6 13h4',
 Frightened:'M12 3 2 21h20L12 3z M12 9v5 M12 18h.01',
 Grappled:'M8 8 5 11a3 3 0 0 0 4 4l3-3 M12 12l3-3a3 3 0 0 1 4 4l-3 3 M8 16l8-8',
 Incapacitated:'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20 M5 5l14 14',
 Invisible:'M3 12s3-7 9-7 9 7 9 7-3 7-9 7-9-7-9-7z M10 10a3 3 0 0 1 4 4 M4 20l16-16',
 Paralyzed:'M7 4h4v16H7z M14 4h4v16h-4z',
 Petrified:'M6 3h12l4 7-10 11L2 10l4-7z M2 10h20 M9 3l-3 7 6 11 6-11-3-7',
 Poisoned:'M9 14a5 5 0 1 1 6 0 M8 16h8v3H8z M9 19v2 M15 19v2 M9 10h.01 M15 10h.01 M10 14h4',
 Prone:'M4 19h16 M6 5l6 6 6-6 M12 11v7',
 Restrained:'M6 10V7a6 6 0 0 1 12 0v3 M5 10h14v11H5z M12 14v3',
 Stunned:'M13 2 5 13h7l-1 9 8-11h-7z',
 Unconscious:'M19 3a9 9 0 1 0 2 15A9 9 0 0 1 19 3Z'
};
function conditionRail(){
 const active=character.conditions||[];
 return `<div class="condition-rail"><div class="condition-head"><strong>Conditions</strong><span>${active.length?`${active.length} active`:'None active'}</span></div>
 <div class="condition-icons" aria-label="Toggle character conditions">${Object.entries(conditionPaths).map(([name,path])=>{
  const on=active.includes(name);
  return `<button type="button" class="condition-icon ${on?'on':''}" data-action="condition" data-arg="${esc(name)}" data-tip="${esc(name)} · ${on?'Active':'Inactive'}" aria-label="${esc(name)}: ${on?'active':'inactive'}" aria-pressed="${on}"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg></button>`;
 }).join('')}</div></div>`;
}
function heartMeter(hp){
 const total=Math.max(1,Math.ceil(hp.max/5));
 const hearts=Array.from({length:Math.min(500,total)},(_,i)=>{
  const capacity=Math.max(0,Math.min(5,hp.max-i*5));
  const remaining=Math.max(0,Math.min(capacity,hp.current-i*5));
  const percent=remaining/5*100;
  const target=Math.min(hp.max,(i+1)*5);
  return `<button type="button" class="heart" data-action="set-hp" data-arg="${target}" aria-label="Set health to ${target} of ${hp.max}" data-tip="Set health to ${target} HP · 5 HP per heart" style="--heart-fill:${percent}%"><svg viewBox="0 0 24 24" aria-hidden="true"><path class="heart-empty" d="M12 21 3.1 12.2C-1 8 2 2.8 6.7 3.3c2 0 3.9 1 5.3 2.9 1.4-1.9 3.3-2.9 5.3-2.9C22 2.8 25 8 20.9 12.2L12 21Z"/><path class="heart-full" d="M12 21 3.1 12.2C-1 8 2 2.8 6.7 3.3c2 0 3.9 1 5.3 2.9 1.4-1.9 3.3-2.9 5.3-2.9C22 2.8 25 8 20.9 12.2L12 21Z"/></svg></button>`;
 }).join('');
 return `<div class="hearts" role="group" aria-label="Health: ${hp.current} of ${hp.max}, five points per heart">${hearts}</div>`;
}
function resourcePips(name,v){
 const max=Math.max(0,Math.floor(num(v.max))),current=Math.max(0,Math.min(max,Math.floor(num(v.current))));
 const rendered=Math.min(max,100);
 const rows=[];
 for(let row=0;row<rendered;row+=10){
  const pips=Array.from({length:Math.min(10,rendered-row)},(_,offset)=>{
   const i=row+offset,value=i<current?i:i+1;
   return `<button type="button" class="resource-pip ${i<current?'filled':''}" data-action="resource-set" data-arg="${esc(name)}:${value}" data-tip="${esc(name)} · set to ${value}/${max}" aria-label="Set ${esc(name)} to ${value} of ${max}" aria-pressed="${i<current}"></button>`;
  }).join('');
  rows.push(`<div class="pip-row">${pips}</div>`);
 }
 return `<div class="resource-pips"><div class="resource-info"><strong>${esc(name)}</strong><span class="resource-count">${current}<span>/${max}</span></span><small title="Refreshes on ${esc(v.reset)}">↻ ${esc(v.reset)}</small></div><div class="pip-track" role="group" aria-label="${esc(name)}: ${current} of ${max}">${rows.join('')}${max>100?`<label class="large-resource">Set value <input type="number" class="input sm" data-resource-edit="${esc(name)}" min="0" max="${max}" value="${current}"></label>`:''}</div></div>`;
}
function attackRows(mode='compact'){
 return (character.attacks||[]).map((a,i)=>{
  const controls=`${button('Attack','attack',String(i),'button mini')}${button('Damage','damage',String(i),'button mini subtle')}`;
  if(mode==='detailed')return `<div class="resource-row"><div><strong>${esc(a.name)}</strong><small>Damage: ${esc(a.damage)}</small></div><div class="res-count">${esc(sgn(a.bonus))}</div><div class="controls-row">${controls}</div></div>`;
  return `<div class="attack-row" title="${esc(a.name)} · ${esc(a.damage)}"><span class="attack-name">${esc(a.name)}</span><strong class="attack-bonus">${esc(sgn(a.bonus))}</strong><div class="controls-row">${controls}</div></div>`;
 }).join('');
}
function rollRows(kind,mode='compact'){
 const entries=kind==='ability'?Object.entries(character.abilities||{}).map(([key,v])=>[key+' check',v.modifier,key]):Object.entries(character[kind]||{}).map(([key,v])=>[kind==='saves'?key+' save':key,v,key]);
 return entries.map(([label,modifier,key])=>`<div data-filter-row="${esc(label.toLowerCase())}">${rollButton(label,modifier,`1d20${sgn(modifier)}`,mode==='detailed'||mode==='editable'?kind:'',key)}</div>`).join('');
}
function effectTracker(){
 const list=Action.activeEffects(character);
 return `<div class="effect-tracker" aria-label="Active timed effects">${list.some(e=>e.concentration)?button('CON save','concentration-save','','button mini subtle'):''}${list.length?list.map(e=>
  `<div class="effect-row"><span class="effect-label">${e.concentration?'◉ ':''}${esc(e.name)}${e.condition?' · '+esc(e.condition):''}</span><small>${e.rounds_remaining==null?'until ended':`${esc(e.rounds_remaining)} rounds`}</small>${button('End','effect-end',e.id,'button mini subtle')}</div>`).join(''):
  '<p class="subtle-note">No active effects. Timers advance with Next turn.</p>'}</div>`;
}
function combatActions(){
 const state=Action.combat(character);
 const tracker=state.active?`<div class="turn-tracker" aria-label="D&D turn resources"><strong>Turn ${state.turn}</strong>
 ${[['action','Action'],['bonus','Bonus'],['reaction','Reaction']].map(([key,label])=>`<button class="turn-chip ${state.used[key]?'spent':''}" type="button" data-action="mark-turn-action" data-arg="${key}" aria-pressed="${state.used[key]}" data-tip="${state.used[key]?'Used':'Available'}: ${label}; mark manually for basic attacks or DM rulings">${label} ${state.used[key]?'×':'✓'}</button>`).join('')}</div>`:'<span class="combat-notice">Turn tracking off</span>';
 const sky=String(character.name).toLowerCase()==='sky blue eyes'&&/monk/i.test(character.class_level||'');
 return `<section class="combat-actions" aria-label="Combat actions"><strong>Actions</strong> ${tracker}
 ${button(state.active?'End encounter':'Start encounter','toggle-encounter','','button mini subtle')}
 ${sky?button('Shield stance · Action','stance','','button mini subtle'):''}
 ${sky?button(character.effects?.empty_body_rounds>0?`Empty Body · ${character.effects.empty_body_rounds} rounds`:'Empty Body · 4 Ki','empty-body','','button mini subtle'):''}
 ${button('Next turn ↗','advance-turn','','button mini subtle')} ${state.undo_turn?button('Undo turn','undo-turn','','button mini subtle'):''}</section>`;
}
// The sheet is the complete combat screen. Details are never duplicated in another tab.
function identityRibbon(){
 const move=(character.speed.match(/\d+\s*ft/gi)||[]).map(s=>parseInt(s,10)).join(' / ')||character.speed;
 return `<header class="identity-ribbon">
 <div class="sheet-portrait avatar-glyph" aria-hidden="true">✦</div>
 <div class="identity-copy"><small class="sheet-eyebrow">CHARACTER SHEET</small><h1 class="page-title">${esc(character.name)}</h1><div class="identity-sub">${esc(character.class_level)} · ${esc(character.species)} · ${esc(character.background)}</div></div>
 <div class="status-chips" aria-label="Character statistics">
 ${stat('AC',character.ac,'Armor class')}${stat('INIT',sgn(character.initiative),character.initiative_note||'Initiative')}${stat('PROF',sgn(character.proficiency),'Proficiency bonus')}${stat('MOVE',move,'Walk / fly / climb in feet')}
 </div>
 <button type="button" class="button mini subtle edit-mode-button" data-action="edit-mode" aria-pressed="${editMode}">${editMode?'Done editing':'Edit sheet'}</button>
 ${editMode?`<details class="identity-editor"><summary class="edit-details" title="Edit character identity and primary statistics" aria-label="Edit primary character information">✎ <span>Edit</span></summary>
 <div class="identity-fields">${field('Name','name',character.name)}${field('Armor class','ac',character.ac,'number')}${field('Initiative','initiative',character.initiative,'number')}${field('Proficiency','proficiency',character.proficiency,'number')}${field('Movement','speed',character.speed)}${field('Class / level','class_level',character.class_level)}${field('Species','species',character.species)}${field('Background','background',character.background)}</div>
 </details>`:''}</header>`;
}
function savingRolls(){return `<div class="rolls-tight">${rollRows('saves','editable')}</div>`;}
function skillRolls(){return `<div class="skill-tools">${editBonusButton()}<label class="sr-only" for="skill-filter">Find skill</label><input id="skill-filter" class="input" type="search" placeholder="Find a skill…" aria-label="Find skill"></div>
 <div class="rolls-tight skills-list">${rollRows('skills','editable')}</div>`;}
function editBonusButton(){return editMode?`<button type="button" class="edit-bonus" data-action="toggle-edit-rolls" aria-pressed="${editRollModifiers}" data-tip="${editRollModifiers?'Finish editing':'Edit'} saved skill and saving throw bonuses">${editRollModifiers?'Done':'✎'}</button>`:'';}
function workspaceTabs(){
 const items=[['overview','Actions'],['spells','Spells'],['inventory','Inventory'],['features','Features'],['background','Background'],['notes','Notes'],['reference','Reference']];
 return `<nav class="workspace-tabs" aria-label="Character gameplay pages" role="tablist">${items.map(([key,label])=>`<button type="button" role="tab" aria-selected="${view===key}" class="nav ${view===key?'active':''}" data-view="${key}">${label}</button>`).join('')}</nav>`;
}
function actionWorkspace(){
 const attackFilter=actionFilter==='all'||actionFilter==='attack';
 const specialFilter=actionFilter==='all'||actionFilter==='action';
 const entries=(character.actions||[]).map((a,i)=>({...a,index:i})).filter(a=>!a.archived);
 return `<div class="workspace-toolbar"><div class="workspace-filters" aria-label="Filter combat actions">
 ${[['all','All'],['attack','Attacks'],['action','Abilities']].map(([key,label])=>`<button type="button" data-action="action-filter" data-arg="${key}" class="filter-chip ${actionFilter===key?'selected':''}" aria-pressed="${actionFilter===key}">${label}</button>`).join('')}</div>
 ${editMode?button('+ Custom ability','add-action','','button mini'):''}</div>
 ${attackFilter?`<div class="attack-list">${attackRows()}</div>`:''}
 ${specialFilter?`${combatActions()}<div class="ability-action-list" aria-label="Imported and custom actions">${entries.map(a=>{
   const roll=a.roll||'', damage=a.damage||'';
   return `<details class="work-entry action-entry" data-action-id="${esc(a.id||a.index)}"><summary><span class="entry-title">${esc(a.name)}</span><span class="entry-meta">${esc(a.activation||'special')}${a.source==='manual'?' · Custom':a.source==='user-reference'?' · Screenshot reference':''}</span></summary>
   <div class="entry-details"><p class="action-description">${esc(a.description||'No rules description imported. Configure manually if needed.')}</p>
   <div class="controls-row action-buttons">${button('Use ability','action-use',String(a.index),'button mini primary')}${roll?button('Roll '+roll,'action-roll',String(a.index),'button mini'):''}
   ${damage?button('Damage '+damage,'action-damage',String(a.index),'button mini subtle'):''}
   ${a.resource&&num(a.cost)>0?`<small class="action-cost">${esc(a.cost)} ${esc(a.resource)} on use</small>`:''}</div>
   ${editMode?`<div class="action-editor"><div class="entry-pair">${field('Name',`actions.${a.index}.name`,a.name)}${field('Activation',`actions.${a.index}.activation`,a.activation||'')}</div>
   <div class="entry-pair">${field('Roll expression',`actions.${a.index}.roll`,roll)}${field('Damage expression',`actions.${a.index}.damage`,damage)}</div>
   <div class="entry-pair">${field('Resource name',`actions.${a.index}.resource`,a.resource||'')}${field('Cost',`actions.${a.index}.cost`,a.cost||0,'number')}</div>
   <label class="field"><span class="field-label">Effect after roll (DM-approved only)</span><select class="input" data-input="actions.${a.index}.effect_kind"><option value="none" ${a.effect_kind!=='heal'?'selected':''}>No automatic effect</option><option value="heal" ${a.effect_kind==='heal'?'selected':''}>Offer HP healing after roll</option><option value="condition" ${a.effect_kind==='condition'?'selected':''}>Apply configured condition to self</option></select></label>
   <label class="field"><span class="field-label">Self-condition (only when effect is condition)</span><select class="input" data-action-condition="${a.index}"><option value="">Choose condition</option>${[...Action.CONDITIONS].map(n=>`<option value="${n}" ${a.effect_condition===n?'selected':''}>${n}</option>`).join('')}</select></label>
   <div class="entry-pair">${field('Duration (rounds, 0 = untimed)',`actions.${a.index}.duration_rounds`,a.duration_rounds??0,'number')}
   <label class="field"><span class="field-label">Concentration (DM approved)</span><input type="checkbox" data-action-concentration="${a.index}" ${a.concentration?'checked':''}></label></div>
   ${field('Description / DM ruling',`actions.${a.index}.description`,a.description||'')}
   ${button('Archive ability','archive-action',String(a.index),'button mini subtle')}</div>`:''}</div></details>`;
 }).join('')}</div></div>`:''}`;
}
function workspacePane(){
 let content=({overview:actionWorkspace,inventory,spells,features,background:backgroundPage,notes:notesPage,reference:referenceWorkspace}[view]||actionWorkspace)();
 return `<section class="game-workspace" aria-label="Tabbed gameplay workspace"><div class="workspace-caption">GAMEPLAY <span>• ${esc(character.name)}</span></div>${workspaceTabs()}<div class="workspace-content" data-scroll-key="workspace" role="tabpanel">${content}</div></section>`;
}
function overview(){
 const hp=character.hp;
 const res=Object.entries(character.resources||{}).map(([key,v])=>resourcePips(key,v)).join('');
 const ability=Object.entries(character.abilities||{}).map(([abbr,a])=>
  `<div class="ability-card"><div class="ability-head"><span>${esc(abbr)}</span><button type="button" class="ability-roll" data-action="roll-ability" data-arg="${esc(abbr)}" data-tip="Roll ${esc(abbr)} check" aria-label="Roll ${esc(abbr)} check">d20 ↗</button></div>
  <div class="ability-values">${editMode?input(`abilities.${abbr}.score`,a.score,'number','input sm ability-number'):`<strong class="ability-readout">${esc(a.score)}</strong>`}
  <label>MOD ${editMode?input(`abilities.${abbr}.modifier`,a.modifier,'number','input sm ability-mod'):`<strong class="mod-readout">${esc(sgn(a.modifier))}</strong>`}</label></div></div>`).join('');
 return identityRibbon()+
 `<section class="vitals-panel" aria-label="Hit points and conditions">
 <div class="vital-heading"><strong>♥ Vitality</strong><span class="hp-total">${hp.current}<span> / ${hp.max} HP</span></span><span class="temp-hp">${hp.temp?`+${hp.temp} temporary HP`:'No temporary HP'}</span></div>
 ${heartMeter(hp)}
 <div class="vital-controls"><label class="amount-label" for="hp-amount">HP</label><input id="hp-amount" class="input md" type="number" min="0" max="99999" value="5" aria-label="Damage or healing amount">
 ${button('− Damage','hp','damage','button warn')}${button('+ Heal','hp','heal','button')}
 <span class="vital-separator"></span>${button('Short rest','rest','short','button subtle')}${button('Long rest','rest','long','button subtle')}
 <details class="vital-edit"><summary title="Adjust HP totals and temporary HP">Edit HP</summary><div class="form-grid">
 ${field('Current HP','hp.current',hp.current,'number')}${field('Maximum HP','hp.max',hp.max,'number')}${field('Temporary HP','hp.temp',hp.temp,'number')}
 </div></details></div></section>
 <div class="hud-four ${editRollModifiers?'editing-rolls':''}" ${editRollModifiers?'data-edit-bonuses="true"':''}>
 <div class="hud-zone hud-attributes" data-scroll-key="attributes">${panel('Abilities',`<div class="grid three">${ability}</div>`)}${panel('Saving throws',savingRolls())}</div>
 <div class="hud-zone hud-skills" data-scroll-key="skills">${panel('Skills',skillRolls())}</div>
 <div class="hud-zone hud-resources" data-scroll-key="resources">${panel('Resources',res)}${panel('Conditions',conditionRail())}${panel('Active effects',effectTracker(),true)}</div>
 <div class="hud-zone hud-main">${workspacePane()}</div>
 </div>`;
}

function sourceBadge(record){
 if(!record)return '';
 return `<button type="button" class="reference-pill" data-action="reference-open" data-arg="${esc(record.kind+':'+record.id)}" title="Open SRD 5.1 reference; your imported character data stays unchanged">SRD 5.1 ↗</button>`;
}
function filterCatalogEntries(){
 const entries=$$('#page .reference-item');let shown=0;
 for(const row of entries){
  const searchOk=!catalogQuery||row.dataset.catalogSearch.includes(catalogQuery);
  const levelOk=catalogLevel==='all'||row.dataset.catalogLevel===catalogLevel;
  row.hidden=!(searchOk&&levelOk);
  if(!row.hidden)shown++;
 }
 const count=$('#catalog-shown');if(count)count.textContent=String(shown);
}
function referenceWorkspace(){
 const all=References?.list(catalogKind)||[];
 const levels=catalogKind==='equipment'?'':`<select class="input reference-level" id="catalog-level" aria-label="Filter spell level"><option value="all" ${catalogLevel==='all'?'selected':''}>Any spell level</option>${Array.from({length:10},(_,n)=>`<option value="${n}" ${catalogLevel===String(n)?'selected':''}>${n===0?'Cantrips':`Level ${n}`}</option>`).join('')}</select>`;
 return `<section class="reference-browser" aria-label="D&D 2014 SRD reference catalog">
 <p class="reference-disclaimer">SRD 5.1 (2014) · read-only spell and equipment summaries. This is not the full rules text, and imported or DM-approved values always win.</p>
 <div class="workspace-toolbar"><div class="workspace-filters">${[['all','All'],['spell','Spells'],['equipment','Equipment']].map(([k,label])=>`<button class="filter-chip ${k===catalogKind?'selected':''}" data-action="catalog-kind" data-arg="${k}" aria-pressed="${k===catalogKind}">${label}</button>`).join('')}</div><div class="reference-search-tools"><input class="input search" id="catalog-search" type="search" aria-label="Search reference catalog" placeholder="Spell, school, gear, properties…" value="${esc(catalogQuery)}">${levels}</div></div>
 <div class="reference-count"><span id="catalog-shown">${all.length}</span> of ${all.length} entries · 2014 SRD 5.1 · <button type="button" class="text-link" data-action="about">About & licenses</button></div>
 <div class="reference-list">${all.map(record=>{const searchable=[record.name,...(record.aliases||[]),record.kind,record.school,record.description,record.category,record.properties,record.casting_time].filter(Boolean).join(' ').toLowerCase();return `<button type="button" class="reference-item" data-action="reference-open" data-arg="${esc(record.kind+':'+record.id)}" data-catalog-search="${esc(searchable)}" data-catalog-level="${record.kind==='spell'?record.level:'equipment'}"><span>${esc(record.name)}</span><small>${record.kind==='spell'?`Level ${record.level} · ${esc(record.school||'spell')}${record.ritual?' · Ritual':''}${record.concentration?' · Concentration':''}`:`${esc(record.category)} · ${esc(record.cost||'')}`}</small></button>`;}).join('')}</div>
 </section>`;
}
function showReference(record){
 const layer=$('#reference-layer');if(!layer||!record)return;
 const details=record.kind==='spell'?
 [['Level',record.level===0?'Cantrip':String(record.level)],['School',record.school],['Casting time',record.casting_time],['Range',record.range],['Components',record.components],['Duration',record.duration],['Concentration',record.concentration?'Yes':'No'],['Ritual',record.ritual?'Yes':'No']]:
 [['Category',record.category],['Standard cost',record.cost],['Standard weight',record.weight_lb==null?'Not specified':record.weight_lb+' lb.'],['Standard damage',record.damage],['Standard armor class',record.armor_class],['Properties',record.properties]];
 const matches=record.kind==='spell'?(character?.spells||[]).map((sp,index)=>({sp,index})).filter(({sp})=>References?.match('spell',sp.name,character.system_edition)?.id===record.id):[];
 const comparison=matches.length?`<section class="reference-compare" aria-label="Imported spell comparison"><h3>Compare with your character</h3>
 <p class="reference-disclaimer">${matches.length>1?'Multiple imported entries match. Showing the first. ':''}Imported values remain authoritative. Differences are for review, not automatic corrections.${character.system_edition==='unspecified'?' Confirm this character uses 2014 rules before adopting anything.':''}</p>
 <table><thead><tr><th>Requirement</th><th>Imported</th><th>SRD 5.1</th></tr></thead><tbody>
 ${References.compareSpell(matches[0].sp,record).map(row=>`<tr class="compare-${row.status}"><th scope="row">${esc(row.label)}</th><td>${esc(row.imported??'Not recorded')}${row.status==='review'?' · Review':row.status==='match'?' · Match':''}</td><td>${esc(row.reference)}</td></tr>`).join('')}
 </tbody></table><button type="button" class="button primary" data-action="reference-edit-spell" data-arg="${matches[0].index}">Open imported spell${editMode?' for editing':''}</button></section>`:'';
 const canDraft=record.kind==='spell'&&matches.length===0&&!/2024|5\.5|srd.?5\.2/i.test(String(character?.system_edition||''));
 const draft=canDraft?`<section class="reference-draft"><h3>Custom action draft</h3><p class="reference-disclaimer">This spell is not on your imported spellbook. A draft adds only a manual note/action for DM customization—it does not grant the spell, prepare it, cast it, or assign a dice expression.</p>
 <button class="button subtle" type="button" data-action="reference-draft" data-arg="${esc(record.id)}">Create unconfigured action draft</button></section>`:'';
 layer.hidden=false;
 layer.innerHTML=`<section class="reference-dialog" role="dialog" aria-modal="true" aria-labelledby="ref-title">
 <div class="reference-dialog-heading"><div><small>SRD 5.1 · 2014 · READ-ONLY</small><h2 id="ref-title">${esc(record.name)}</h2></div><button type="button" class="button subtle" data-close-reference aria-label="Close reference">Close ✕</button></div>
 <dl class="reference-details">${details.filter(([_,value])=>value!==undefined&&value!==null&&value!=='').map(([name,value])=>`<div><dt>${esc(name)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>
 <p class="reference-description">${esc(record.description||'Standard entry. Refer to the source document for additional rules and exceptions.')}</p>
 ${comparison}${draft}
 <p class="reference-disclaimer">${esc(record.kind==='spell'?(References.source()?.modifications||'Spell summaries are abbreviated; consult the full SRD and your DM.'):'Standard catalog details are read-only references, not the character’s actual gear values. Consult the full SRD and your DM for exceptions.')}</p>
 <p><a href="https://dnd.wizards.com/resources/systems-reference-document" target="_blank" rel="noopener noreferrer">SRD 5.1 source</a> · <button class="text-link" data-action="about">About & licenses</button></p>
 </section>`;
 layer.querySelector('[data-close-reference]').onclick=closeReference;
}

function closeReference(){const layer=$('#reference-layer');if(layer){layer.hidden=true;layer.innerHTML='';}}
function showAbout(){
 const layer=$('#reference-layer');if(!layer)return;
 const attribution=References?.source()?.attribution||'This work includes material taken from the System Reference Document 5.1 (“SRD 5.1”) by Wizards of the Coast LLC and available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode.';
 layer.hidden=false;
 layer.innerHTML=`<section class="reference-dialog" role="dialog" aria-modal="true" aria-labelledby="ref-title"><div class="reference-dialog-heading"><div><small>INTERACTIVE TABLETOP · EARLY ALPHA</small><h2 id="ref-title">About & licenses</h2></div><button type="button" class="button subtle" data-close-reference>Close ✕</button></div>
 <p>Free, local-first character sheets and dice. D&D 2014 is the only edition with a bundled SRD reference catalog so far. Imported PDF data and DM rulings always take precedence.</p>
 <h3>SRD 5.1 attribution</h3><p class="attribution-text">${esc(attribution)}</p>
 <p>Catalog entries have been curated into structured fields and short summaries, with 2014 SRD spell metadata cross-checked against the archived 5e-bits dataset. See the full <a href="https://dnd.wizards.com/resources/systems-reference-document" target="_blank" rel="noopener noreferrer">SRD document</a> and <a href="https://creativecommons.org/licenses/by/4.0/legalcode" target="_blank" rel="noopener noreferrer">CC BY 4.0 license</a>. App source code uses MIT licensing; third-party bundled dependencies retain their own licenses.</p>
 <p>We do not redistribute D&D Beyond character PDFs, paywalled sourcebook descriptions, or users’ personal character data.</p></section>`;
 layer.querySelector('[data-close-reference]').onclick=closeReference;
}
function inventory(){
 const items=(character.inventory||[]).map((it,i)=>({...it,index:i})).filter(it=>(showArchived||!it.archived)&&(it.name||'').toLowerCase().includes(search.toLowerCase()));
 return `<div class="workspace-toolbar"><input class="input search" id="filter" placeholder="Find equipment…" value="${esc(search)}" aria-label="Search inventory">
 ${button('+ Item','add-item','','button mini')}${button(showArchived?'Hide archived':'Show archived','toggle-archived','','button mini subtle')}</div>
 <div class="workspace-entries" aria-label="Equipment list">${items.map(it=>`<details class="work-entry ${it.archived?'archived':''}"><summary>
 <span class="entry-title">${esc(it.name)}</span><span class="entry-meta">${it.archived?'Archived':`${esc(it.quantity)} owned`}</span></summary>
 <div class="entry-details">${field('Name',`inventory.${it.index}.name`,it.name)}<div class="entry-pair">
 ${field('Quantity',`inventory.${it.index}.quantity`,it.quantity,'number')}${field('Weight',`inventory.${it.index}.weight`,it.weight||'')}</div>
 ${sourceBadge(References?.match('equipment',it.name,character.system_edition))}${field('Notes',`inventory.${it.index}.notes`,it.notes||'')}
 ${button(it.archived?'Restore':'Archive','archive',String(it.index),'button mini subtle')}</div></details>`).join('')}</div>`;
}
function spells(){
 const all=character.spells||[];
 const prepared=all.filter(sp=>sp.prepared&&!sp.always_prepared&&num(sp.level,-1)!==0).length;
 const slots=Action.spellSlots(character);
 const filtered=all.map((sp,index)=>({...sp,index})).filter(sp=>{
   if(spellFilter==='prepared')return sp.prepared||sp.always_prepared||sp.level===0;
   if(spellFilter==='available')return sp.available!==false&&!sp.prepared&&!sp.always_prepared&&sp.level!==0;
   return true;
 });
 return `<div class="workspace-toolbar spell-toolbar"><div class="workspace-filters" aria-label="Filter spells">
 ${[['all','All'],['prepared','Prepared / Ready'],['available','Available to prepare']].map(([key,label])=>`<button type="button" data-action="spell-filter" data-arg="${key}" class="filter-chip ${spellFilter===key?'selected':''}" aria-pressed="${spellFilter===key}">${label}</button>`).join('')}</div>
 <input class="input search" id="filter" placeholder="Find spells…" value="${esc(search)}" aria-label="Search spells"></div>
 <div class="spell-summary">${all.length} spell records · ${prepared} manually prepared · ${slots.map(s=>`Lv${s.level} ${s.current}/${s.max}`).join(' · ')||'No slots recorded'}</div>
 <div class="workspace-entries" aria-label="Spellbook entries">${filtered.map(sp=>{
 const locked=sp.always_prepared||sp.level===0;
 const ready=sp.level===0||sp.always_prepared||sp.prepared;
 const badge=sp.level===0?'Cantrip':sp.level==null?'Level unknown':`Level ${sp.level}`;
 const state=sp.always_prepared?'Always prepared':sp.level===0?'At will':sp.prepared?'Prepared':'Available';
 const slotOptions=sp.level===0?[{level:0,current:1}]:slots.filter(s=>Number.isInteger(sp.level)&&s.level>=sp.level);
 const selectedSlot=slotOptions.find(s=>s.current>0)?.level??slotOptions[0]?.level??null;
 const concentration=typeof sp.concentration==='boolean'?sp.concentration:/\bconcentration\b/i.test(sp.duration||'');
 return `<div class="spell-entry" data-spell-name="${esc((sp.name||'').toLowerCase())}"><details class="work-entry" data-spell-id="${esc(sp.id||sp.index)}"><summary><span class="entry-title">${esc(sp.name)}</span><span class="entry-meta">${badge} · ${state}</span></summary>
 <div class="entry-details"><div><b>Source:</b> ${esc(sp.source||'Unknown')}</div><div><b>Casting:</b> ${esc(sp.casting_time||'Unknown')} · ${esc(sp.range||'')}</div><div><b>Duration:</b> ${esc(sp.duration||'Unknown')}</div>
 <div><b>Components:</b> ${esc(sp.components||'')}</div><div><b>Save / attack:</b> ${esc(sp.save||'—')}</div>${sp.notes?`<p>${esc(sp.notes)}</p>`:''}${sourceBadge(References?.match('spell',sp.name,character.system_edition))}
 <div class="controls-row spell-cast-controls">${slotOptions.length?`<label>Slot <select class="input" data-slot-choice="${sp.index}" aria-label="Cast ${esc(sp.name)} at spell slot level">${slotOptions.map(s=>`<option value="${s.level}" ${s.level===selectedSlot?'selected':''} ${s.current<1?'disabled':''}>${s.level===0?'Cantrip':`Level ${s.level} · ${s.current} left`}</option>`).join('')}</select></label>`:''}
 ${button('Cast spell','cast-spell',String(sp.index),'button mini primary')}${!ready?'<small>Prepare this spell first</small>':''}${sp.level==null?'<small>Set level in Edit sheet</small>':''}</div>
 ${editMode?`<div class="spell-execution-editor"><div class="entry-pair"><label class="field"><span class="field-label">Spell level</span><select class="input" data-spell-level="${sp.index}">${['Unknown',...Array.from({length:10},(_,n)=>n)].map((level,i)=>`<option value="${i-1}" ${level===sp.level||(level==='Unknown'&&sp.level==null)?'selected':''}>${level}</option>`).join('')}</select></label>
 ${field('Optional dice expression',`spells.${sp.index}.roll`,sp.roll||'')}</div>
 <div class="entry-pair"><label class="field"><span class="field-label">Effect after dice (DM approved)</span><select class="input" data-spell-effect="${sp.index}"><option value="none" ${sp.effect_kind!=='heal'?'selected':''}>No automated effect</option><option value="heal" ${sp.effect_kind==='heal'?'selected':''}>Offer HP healing</option><option value="condition" ${sp.effect_kind==='condition'?'selected':''}>Apply configured condition to self</option></select></label>
 <label class="field"><span class="field-label">Self-condition</span><select class="input" data-spell-condition="${sp.index}"><option value="">Choose condition</option>${[...Action.CONDITIONS].map(n=>`<option value="${n}" ${sp.effect_condition===n?'selected':''}>${n}</option>`).join('')}</select></label>
 ${field('Duration in rounds (0 = untimed)',`spells.${sp.index}.duration_rounds`,sp.duration_rounds??0,'number')}</div>
 <label class="field"><input type="checkbox" data-spell-concentration="${sp.index}" ${concentration?'checked':''}> Track concentration (based on PDF duration; editable)</label></div>`:''}
 <p class="subtle-note">Casting spends a slot only after confirmation. Effects and healing require explicit configuration. Timers advance when you press Next turn.</p></div></details>
 <label class="prepared-control" data-tip="${esc(sp.name)} · ${state}"><input type="checkbox" data-prep="${sp.index}" ${sp.prepared||locked?'checked':''} ${locked?'disabled':''} aria-label="Prepare ${esc(sp.name)}"><span>${locked?'Ready':'Prep'}</span></label></div>`;
 }).join('')}</div>`;
}

function features(){
 return `<div class="workspace-feature-list">
 ${panel('Features & traits',(character.features||[]).map((x,i)=>
 `<details class="feature" ${i===0?'open':''}><summary>${esc(x.title)}</summary><pre>${esc(x.text)}</pre></details>`).join(''))}
 <div>${panel('Homebrew adjudication',`<textarea class="input longtext" data-input="homebrew_notes">${esc(character.homebrew_notes||'')}</textarea>
 <p class="subtle-note">Imported custom rules may be incomplete. Confirm unusual effects and resource costs with your DM before playing.</p>`)}
 </div></div>`;
}
function backgroundPage(){
 return `<section class="journal-page"><h2>Character background</h2><p>Imported background: <strong>${esc(character.background||'Unknown')}</strong></p>
 <p class="workspace-hint">Narrative and appearance details imported from the PDF remain in Features. Add session observations under Notes; homebrew rulings stay with Features.</p></section>`;
}
function notesPage(){
 return `<section class="journal-page"><h2>Session notes</h2><textarea class="input longtext" data-input="notes" aria-label="Session notes">${esc(character.notes||'')}</textarea></section>`;
}

function render(){
 if(!character)return;
 if(typeof hideHudTip==='function')hideHudTip();
 $$('#page details[data-panel]').forEach(el=>panelState.set(el.dataset.panel,el.open));
 const scrollers=$$('#page [data-scroll-key]');
 const scrolls=new Map(scrollers.map(el=>[el.dataset.scrollKey,{x:el.scrollLeft,y:el.scrollTop}]));
 const openEntries=new Set($$('#page details[data-action-id][open]').map(el=>el.dataset.actionId));
 const openSpells=new Set($$('#page details[data-spell-id][open]').map(el=>el.dataset.spellId));
 $('#page').innerHTML=overview();
 $$('#page [data-scroll-key]').forEach(el=>{const p=scrolls.get(el.dataset.scrollKey);if(p){el.scrollLeft=p.x;el.scrollTop=p.y;}});
 $$('#page details[data-action-id]').forEach(el=>{if(openEntries.has(el.dataset.actionId))el.open=true;});
 if(view==='reference')filterCatalogEntries();
 $$('#page details[data-spell-id]').forEach(el=>{if(openSpells.has(el.dataset.spellId))el.open=true;});
}
function setPath(path,value){
 const parts=path.split('.');
 if(!/^[a-zA-Z][a-zA-Z0-9_]*(?:\.\d+|\.[a-zA-Z][a-zA-Z0-9_]*)*$/.test(path))return;
 let obj=character;
 for(const p of parts.slice(0,-1)){if(!obj||!Object.prototype.hasOwnProperty.call(obj,p))return;obj=obj[p];}
 const key=parts.at(-1);
 if(!obj||(!Object.prototype.hasOwnProperty.call(obj,key)&&! /^(?:actions|spells)\.\d+\.(?:effect_kind|effect_condition|duration_rounds|roll)$/.test(path)))return;
 if(typeof obj[key]==='number')value=Math.max(key==='current' && path.startsWith('hp.')?0:-999999,Math.min(999999,num(value)));
 obj[key]=value;
 if(/^(?:actions|spells)\.\d+\.duration_rounds$/.test(path))obj[key]=Math.max(0,Math.min(999,Math.floor(num(value))));
 // User-edited imported abilities become manual overrides, retained on reimport.
 if(/^actions\.\d+\./.test(path)){const a=character.actions[Number(parts[1])];if(a)a.source='manual';}
 save();
}
function dialog(heading,message,onConfirm){
 const layer=$('#dialog-layer');
 layer.hidden=false;
 layer.innerHTML=`<section class="dialog" role="dialog" aria-modal="true" aria-label="${esc(heading)}"><h2>${esc(heading)}</h2><p>${esc(message)}</p>
 <div class="controls-row"><button class="button subtle" id="dlg-no">Cancel</button><button class="button primary" id="dlg-yes">Continue</button></div></section>`;
 $('#dlg-no').onclick=()=>{layer.hidden=true;layer.innerHTML='';};
 $('#dlg-yes').onclick=()=>{layer.hidden=true;layer.innerHTML='';onConfirm();};
}
function applyDamage(kind){
 const amount=Math.max(0,Math.min(999999,Math.floor(num($('#hp-amount')?.value,0))));
 if(kind==='heal')character.hp.current=Math.min(character.hp.max,character.hp.current+amount);
 else {
   const soak=Math.min(character.hp.temp,amount);
   character.hp.temp-=soak;
   character.hp.current=Math.max(0,character.hp.current-(amount-soak));
 }
 save();render();
 if(kind==='damage'&&amount>0&&Action.activeEffects(character).some(e=>e.concentration))toast('Concentration active: ask DM for a CON save (DC normally 10 or half damage, whichever is higher).');
}
function doRest(kind){
 if(kind==='long')character.hp.current=character.hp.max;
 for(const res of Object.values(character.resources||{})){
   if(res.reset==='turn')res.current=0;
   else if(kind==='long'||(kind==='short'&&res.reset==='short rest'))res.current=res.max;
 }
 if(kind==='long'){character.conditions=character.conditions.filter(x=>x==='Exhaustion');character.effects.empty_body_rounds=0;Action.activeEffects(character);character.effects.active=[];}
 save();render();toast(`${kind==='long'?'Long':'Short'} rest applied`);
}
function handleAction(action,arg){
 switch(action){
  case 'edit-mode':editMode=!editMode;if(!editMode)editRollModifiers=false;render();break;
  case 'action-filter':actionFilter=arg;render();break;
  case 'spell-filter':spellFilter=arg;render();break;
  case 'catalog-kind':catalogKind=['all','spell','equipment'].includes(arg)?arg:'all';if(catalogKind==='equipment')catalogLevel='all';render();break;
  case 'reference-open':{const [kind,...parts]=arg.split(':');const id=parts.join(':');const ref=References?.list(kind).find(r=>r.id===id);if(ref)showReference(ref);break;}
  case 'reference-edit-spell':{
   const sp=character?.spells?.[Number(arg)];if(!sp)break;
   closeReference();setView('spells');spellFilter='all';search='';editMode=true;render();
   const entry=$$('#page [data-spell-id]').find(el=>el.dataset.spellId===(sp.id||String(arg)));
   if(entry){entry.open=true;entry.scrollIntoView({block:'nearest'});}
   break;
  }
  case 'reference-draft':{
   const ref=References?.list('spell').find(r=>r.id===arg);if(!ref||!character)break;
   if((character.spells||[]).some(sp=>References.match('spell',sp.name,character.system_edition)?.id===ref.id)){
    toast('Already on this character. Edit the imported spell instead.');break;
   }
   const draft=References.actionDraft(ref);
   if((character.actions||[]).some(a=>a.reference_id===ref.id||a.id===draft.id)){
    toast('A custom action draft for this reference already exists.');break;
   }
   dialog('Create custom action draft?',`Add an unconfigured reference note for ${ref.name}? This does not grant the spell, spend resources, or apply any effect.`,()=>{
    character.actions=character.actions||[];
    character.actions.unshift(draft);save();closeReference();setView('overview');editMode=true;
    const entry=$$('#page [data-action-id]').find(el=>el.dataset.actionId===draft.id);
    if(entry){entry.open=true;entry.scrollIntoView({block:'nearest'});}
    toast('Custom draft created. Configure it with your DM before use.');
   });break;
  }
  case 'about':showAbout();break;
  case 'toggle-edit-rolls':editRollModifiers=!editRollModifiers;render();break;
  case 'hp':applyDamage(arg);break;
  case 'rest':dialog('Complete '+arg+' rest?',`Restore eligible resources${arg==='long'?' and hit points':''}?`,()=>doRest(arg));break;
  case 'condition':if(Action.activeEffects(character).some(e=>e.condition===arg)){toast('End the linked effect before removing '+arg+'.');break;}character.conditions=character.conditions.includes(arg)?character.conditions.filter(x=>x!==arg):[...character.conditions,arg];delete Action.combat(character).undo_turn;save();render();break;
  case 'set-hp':{character.hp.current=Math.max(0,Math.min(character.hp.max,num(arg)));save();render();break;}
  case 'resource-set':{const at=arg.lastIndexOf(':'),name=arg.slice(0,at),value=num(arg.slice(at+1));const r=character.resources?.[name];if(r){r.current=Math.min(r.max,Math.max(0,value));save();render();}break;}
  case 'resource':{const at=arg.lastIndexOf(':'),name=arg.slice(0,at),delta=num(arg.slice(at+1));const r=character.resources?.[name];if(r){r.current=Math.min(r.max,Math.max(0,r.current+delta));save();render();}break;}
  case 'add-action':character.actions=character.actions||[];character.actions.unshift({id:'manual-'+Date.now(),name:'New ability',activation:'action',description:'',roll:'',damage:'',resource:'',cost:0,effect_kind:'none',duration_rounds:0,concentration:false,source:'manual',archived:false,effect_condition:''});save();render();break;
  case 'archive-action':{const a=character.actions?.[num(arg)];if(a){a.archived=true;save();render();}break;}
  case 'action-use':{
   const a=character.actions?.[num(arg)];if(!a)break;
   let p;try{p=Action.plan(character,a);}catch(e){toast('Cannot use '+a.name+': '+e.message);break;}
   if(p.effect==='heal'&&(pendingHealing?.characterId===activeId||activeRolls.some(g=>g.effect))){toast('Apply or dismiss the previous healing roll first.');break;}
   try{Action.verifyEconomy(character,p);}catch(e){toast(e.message);break;}
   const details=[p.activation,p.cost?`spend ${p.cost} ${p.resource}`:'no tracked cost',p.roll?`roll ${p.roll.expression}`:'no configured roll',p.effect==='heal'?'offer HP healing after dice settle':'no automated effect',p.concentration?'concentration':null,p.durationRounds?`${p.durationRounds} rounds`:null].filter(Boolean);
   dialog('Use '+p.name+'?',details.join(' · ')+'. Continue only if appropriate under your table rules.',()=>{
    try{
     // Never spend resources while the active dice animation is unresolved.
     // Other dice groups can be in flight; a new roll only needs free resting dice.
     // Never charge a resource if the required dice cannot be prepared.
     if(p.roll&&!canPrepareDice(p.roll.count,p.roll.sides))throw Error('Not enough space for this throw. Clear unused dice first.');
     const confirmed=Action.plan(character,a);
     Action.commitUsage(character,confirmed);Action.startEffect(character,confirmed);save();render();
     if(confirmed.roll)queueRoll(confirmed.roll.expression,confirmed.name,confirmed.effect==='heal'?{characterId:activeId,name:confirmed.name}:null);
     else toast(p.name+' used. Apply narrative effects with your DM.');
    }catch(e){toast('Could not use ability: '+e.message);}
   });break;
  }
  case 'cast-spell':{
   const sp=character.spells?.[num(arg)];if(!sp)break;
   const choice=$(`[data-slot-choice="${num(arg)}"]`);
   let planned;try{planned=Action.planSpell(character,sp,choice?Number(choice.value):undefined);}catch(e){toast('Cannot cast '+sp.name+': '+e.message);break;}
   if(planned.effect==='heal'&&(pendingHealing?.characterId===activeId||activeRolls.some(g=>g.effect))){toast('Apply or dismiss the previous healing roll first.');break;}
   try{Action.verifyEconomy(character,planned);}catch(e){toast(e.message);break;}
   const activeConcentration=Action.activeEffects(character).find(e=>e.concentration);
   const info=[planned.slotLevel?`spend level ${planned.slotLevel} slot`:'cantrip · no slot',planned.roll?`roll ${planned.roll.expression}`:'manual resolution',planned.concentration?`concentration${activeConcentration?` (replaces ${activeConcentration.name})`:''}`:null,planned.durationRounds?`${planned.durationRounds} rounds`:null].filter(Boolean);
   dialog('Cast '+planned.name+'?',info.join(' · ')+'. Spell effects still require your table’s rulings.',()=>{
    try{
     // Other dice groups can be in flight; a new roll only needs free resting dice.
     const fresh=Action.planSpell(character,sp,planned.slotLevel);
     if(fresh.roll&&!canPrepareDice(fresh.roll.count,fresh.roll.sides))throw Error('Not enough room for dice.');
     Action.commitUsage(character,fresh);Action.startEffect(character,fresh);save();render();
     if(fresh.roll)queueRoll(fresh.roll.expression,fresh.name,fresh.effect==='heal'?{characterId:activeId,name:fresh.name}:null);
     else toast('Cast '+fresh.name+'; resolve spell effects with your DM.');
    }catch(e){toast('Could not cast spell: '+e.message);}
   });break;
  }
  case 'toggle-encounter':Action.setEncounter(character,!Action.combat(character).active);save();render();break;
  case 'mark-turn-action':try{Action.markAction(character,arg);save();render();}catch(e){toast(e.message);}break;
  case 'undo-turn':if(Action.undoTurn(character)){save();render();toast('Last turn advance undone.');}break;
  case 'effect-end':{
   if(Action.endEffect(character,arg)){save();render();toast('Effect ended.');}break;
  }
  case 'concentration-save':{
   const bonus=num(character.saves?.Constitution,0);
   queueRoll(`1d20${sgn(bonus)}`,'Concentration (CON) save · compare against DM DC');break;
  }
  case 'action-roll':case 'action-damage':{queuedEffect=null;const a=character.actions?.[num(arg)];if(a){const expression=action==='action-roll'?a.roll:a.damage;if(expression)queueRoll(expression,a.name+(action==='action-roll'?' roll':' damage'));}break;}
  case 'dismiss-roll-heal':pendingHealing=null;updateTableResults();break;
  case 'apply-roll-heal':{
   if(!pendingHealing||pendingHealing.characterId!==activeId){toast('No healing roll for this character.');break;}
   try{const amount=Action.applyHealing(character,pendingHealing.amount);pendingHealing=null;save();render();updateTableResults();toast('Applied '+amount+' HP healing.');}
   catch(e){toast('Could not heal: '+e.message);}break;
  }
  case 'add-item':character.inventory.unshift({id:'custom-'+Date.now(),name:'New item',quantity:1,weight:'',archived:false,notes:''});save();render();break;
  case 'toggle-archived':showArchived=!showArchived;render();break;
  case 'archive':{const r=character.inventory[num(arg)];if(r){r.archived=!r.archived;save();render();}break;}
  case 'roll-ability':{const a=character.abilities[arg];if(a)queueRoll(`1d20${sgn(a.modifier)}`,arg+' check');break;}
  case 'attack':{const a=character.attacks[num(arg)];if(a)queueRoll(`1d20${sgn(a.bonus)}`,a.name+' attack');break;}
  case 'damage':{const a=character.attacks[num(arg)];if(a){const ex=/\d+d\d+(?:[+-]\d+)?/i.exec(a.damage);if(ex)queueRoll(ex[0],a.name+' damage');else toast('Could not parse damage dice: '+a.damage);}break;}
  case 'clear-history':history.length=0;lastResult=null;updateTableResults();save();break;
  case 'clear-table':if(activeRolls.length||pointer?.down){toast('Finish the active dice first.');break;}dice=[];pendingRoll=null;queuedEffect=null;pointer=null;following=false;updateTableResults();toast('Table cleared');break;
  case 'stance':{
    try{Action.markAction(character,'action');}catch(e){if(Action.combat(character).active){toast(e.message);break;}}
    if(character.resources?.['Shield Stance Points'])character.resources['Shield Stance Points'].current=4;
    save();render();toast('Defensive stance entered (action).');break;
  }
  case 'empty-body':{
    if((character.effects?.empty_body_rounds||0)>0){toast('Empty Body already active.');break;}
    const ki=character.resources?.Ki;
    if(!ki||ki.current<4){toast('Not enough Ki for Empty Body (requires 4).');break;}
    try{Action.verifyEconomy(character,{activation:'action'});}catch(e){toast(e.message);break;}
    if(Action.combat(character).active)Action.markAction(character,'action');
    ki.current-=4;character.effects=character.effects||{};
    character.effects.empty_body_rounds=10;
    if(!character.conditions.includes('Invisible'))character.conditions.push('Invisible');
    save();render();toast('Empty Body activated • 10 rounds remaining');break;
  }
  case 'advance-turn':{
    const expired=Action.advanceTurn(character);
    save({preserveUndo:true});render();toast(expired.length?'Expired effects: '+expired.join(', '):'Advanced one turn');break;
  }
  case 'custom-roll':{const ex=$('#custom-roll')?.value;if(ex)queueRoll(ex,ex);break;}
  case 'auto-throw': if(!pendingRoll)queueRoll('1d20','d20');beginThrow(130,65,80);break;
 }
}
function parseExpression(raw){
 const parsed=Action.dice(raw);
 if(!parsed)throw Error('Set a dice expression first.');
 return parsed;
}
// Use the dice already on the table as the source of truth for requested rolls.
// A requested d20 borrows a resting d20 before constructing another one.
// Visual size is independent of physics rules. One radius applies to new dice,
// reused dice and rendering so hit-testing and collisions stay consistent.
function dieRadius(){
 const {w,h}=lastDimensions;
 return Math.max(27,Math.min(44,Math.min(w||800,h||700)*.058));
}
function diceSpacing(){return dieRadius()*2.45;}
function prepareDice(specs,modifier,label,expression,follow=false){
 const existingReady=dice.filter(d=>d.ready);
 existingReady.forEach(d=>{d.ready=false;d.held=false;});
 const chosen=[],created=[],used=new Set();
 for(const sides of specs){
   let die=dice.find(d=>d.sides===sides&&!used.has(d.id)&&d.sleeping&&!d.held&&!activeRolls.some(g=>g.diceIds.includes(d.id)));
   if(!die){
     if(dice.length>=35){dice=dice.filter(d=>!created.includes(d));existingReady.forEach(d=>d.ready=true);toast('Table full (35 dice). Clear unused dice first.');return;}
     die=DP.makeDie(sides,0,0,dieRadius());
     die.id=++nextDieId;dice.push(die);created.push(die);
   }
   used.add(die.id);chosen.push(die);
 }
 const W=lastDimensions.w||950,H=lastDimensions.h||650;
 const anchor=follow&&pointerPosition?pointerPosition:{x:W*.79,y:H*.38};
 chosen.forEach((d,i)=>{
   d.ready=true;d.rolling=false;d.sleeping=true;
   // The existing die is physically moved to the requested cursor, not cloned.
   const cols=Math.min(4,chosen.length),col=i%cols,row=Math.floor(i/cols);
   const spacing=diceSpacing();
   d.x=Math.max(d.r,Math.min(W-d.r,anchor.x+(col-(cols-1)/2)*spacing));
   d.y=Math.max(d.r,Math.min(H-d.r,anchor.y+row*spacing));
   d.z=DP.height(d);d.v=[0,0,0];d.w=[0,0,0];
 });
 pendingRoll={count:chosen.length,sides:null,modifier,label,expression};
 following=follow;
 $('#tray-help').textContent=`${expression} ready · ${follow?'the dice follow your cursor; click, flick and release':'drag a die or press Throw'}`;
 toast(`${chosen.length} ${chosen.length===1?'die':'dice'} ready · ${expression}`);
}
function canPrepareDice(count,sides){
 const reusable=dice.filter(d=>d.sides===sides&&d.sleeping&&!d.held&&!activeRolls.some(g=>g.diceIds.includes(d.id))).length;
 return Math.max(0,count-reusable)+dice.length<=35;
}
function queueRoll(expr,label,effect=null){
 try{
   const p=parseExpression(expr);
   prepareDice(Array(p.count).fill(p.sides),p.modifier,label,p.expression,true);
   queuedEffect=pendingRoll?effect:null; // The effect belongs to exactly this prepared roll.
   return Boolean(pendingRoll);
 }catch(e){toast(e.message);return false;}
}
function addReadyDie(sides){
 if(pendingRoll)queuedEffect=null; // Manual dice edits invalidate a linked healing roll.
 following=false;
 if(dice.length>=35||dice.filter(d=>d.ready).length>=20){toast('Dice limit reached: 20 per throw, 35 on table.');return;}
 const W=lastDimensions.w||500,H=lastDimensions.h||500;
 const ready=dice.filter(d=>d.ready),i=ready.length;
 // Additive placement: clicking d6 then d20 keeps both dice ready.
 const spacing=diceSpacing();
 const x=Math.max(dieRadius(),Math.min(W-dieRadius(),W*.82+((i%3)-1)*spacing));
 const y=Math.max(dieRadius(),Math.min(H-dieRadius(),H*.29+Math.floor(i/3)*spacing));
 const die=DP.makeDie(sides,x,y,dieRadius());
 die.id=++nextDieId;die.ready=true;dice.push(die);
 const all=dice.filter(d=>d.ready);
 const expression=all.map(d=>`1d${d.sides}`).join('+');
 pendingRoll={count:all.length,sides:null,modifier:0,expression,label:'Manual dice'};
 $('#tray-help').textContent=`${all.length} dice ready · grab one and throw the group`;
 toast(`${all.length} dice ready on the tabletop`);
}
function downloadJson(){
 if(!character){toast('Import a character first.');return;}
 downloadJsonData(character,(character.name||'character').replace(/[^a-z0-9-]+/gi,'-')+'-character.json');
}
function acceptImport(newCharacter,kind='json'){
 if(!Vault.validCharacter(newCharacter))throw Error('This is not a compatible D&D character JSON.');
 const match=kind==='pdf'?Vault.findMatch(vaultData,newCharacter):null;
 const install=async()=>{
  try{
   await persistVault();
   const id=match?.id||Vault.newId();
   const next=match?Vault.reconcile(match.character,newCharacter):{...newCharacter,system_id:'dnd5e',system_edition:'unspecified'};
   Vault.upsert(vaultData,id,next);
   vaultDirty=true;await persistVault();
   selectLoadedCharacter();closeVault();toast(match?'PDF merged with saved character':'Character added to vault');
  }catch(ex){toast('Import could not be saved: '+ex.message);}
 };
 if(match){
  dialog('Update existing character?',`This PDF matches ${match.character.name}. Imported stats and equipment will update, while current HP, resources, preparation, notes and manual abilities are preserved. ${Vault.importSummary(match.character,newCharacter).replace(/\n/g,' · ')}`,install);
 }else install();
}
function acceptVaultBackup(raw){
 const incoming=Vault.normalize(raw);
 dialog('Restore full character vault?',`Restore ${incoming.characters.length} saved characters? This will replace the current local vault. Export a backup of your existing characters first.`,async()=>{
  try{await persistVault();vaultData=incoming;vaultDirty=true;await persistVault();selectLoadedCharacter();closeVault();toast('Vault restored');}
  catch(ex){toast('Vault restore failed: '+ex.message);}
 });
}
document.addEventListener('click',e=>{
 const nav=e.target.closest('[data-view]');if(nav){setView(nav.dataset.view);return;}
 const roll=e.target.closest('[data-roll]');if(roll){queueRoll(roll.dataset.roll,roll.dataset.rollLabel);return;}
 const die=e.target.closest('[data-die]');if(die){addReadyDie(num(die.dataset.die));return;}
 const act=e.target.closest('[data-action]');if(act){handleAction(act.dataset.action,act.dataset.arg||'');return;}
});
document.addEventListener('change',e=>{
 const el=e.target;
 if(el.id==='catalog-level'){catalogLevel=el.value;filterCatalogEntries();return;}
 if(el.dataset.resourceEdit){const r=character.resources?.[el.dataset.resourceEdit];if(r){r.current=Math.min(r.max,Math.max(0,Math.floor(num(el.value))));save();render();}return;}
 if(el.dataset.modType){
  const type=el.dataset.modType,key=el.dataset.modName;
  if(type==='ability' && character.abilities?.[key])character.abilities[key].modifier=num(el.value);
  else if((type==='saves'||type==='skills') && Object.prototype.hasOwnProperty.call(character[type],key))character[type][key]=num(el.value);
  save();render();return;
 }
 if(el.dataset.input){
  const value=el.value;
  setPath(el.dataset.input,value);
  // Qty 0 moves to archived, but does not delete imported records.
  if(/^inventory\.\d+\.quantity$/.test(el.dataset.input)){
    const i=num(el.dataset.input.split('.')[1]);character.inventory[i].archived=num(value)<=0;save();render();return;
  }
  // Keep the active disclosure and textarea caret while editing item text or notes.
  if(/^inventory\.\d+\.(?:name|weight|notes)$/.test(el.dataset.input) || /^actions\.\d+\./.test(el.dataset.input) || el.dataset.input==='notes' || el.dataset.input==='homebrew_notes')return;
  render();
 }
 if(el.dataset.actionConcentration!==undefined){const a=character.actions?.[num(el.dataset.actionConcentration)];if(a){a.concentration=el.checked;a.source='manual';save();}return;}
 if(el.dataset.spellConcentration!==undefined){const sp=character.spells?.[num(el.dataset.spellConcentration)];if(sp){sp.concentration=el.checked;save();}return;}
 if(el.dataset.actionCondition!==undefined){const a=character.actions?.[num(el.dataset.actionCondition)];if(a){a.effect_condition=el.value;save();}return;}
 if(el.dataset.spellCondition!==undefined){const sp=character.spells?.[num(el.dataset.spellCondition)];if(sp){sp.effect_condition=el.value;save();}return;}
 if(el.dataset.spellEffect!==undefined){const sp=character.spells?.[num(el.dataset.spellEffect)];if(sp){sp.effect_kind=el.value;save();}return;}
 if(el.dataset.spellLevel!==undefined){const sp=character.spells?.[num(el.dataset.spellLevel)];if(sp){sp.level=Number(el.value)<0?null:Number(el.value);save();render();}return;}
 if(el.dataset.prep){const v=character.spells[num(el.dataset.prep)];if(v&&!v.always_prepared&&v.level!==0){v.prepared=el.checked;save();}}
});
document.addEventListener('input',e=>{
 if(e.target.id==='catalog-search'){catalogQuery=e.target.value.trim().toLowerCase();filterCatalogEntries();return;}

 if(e.target.id==='skill-filter') {
   const needle=e.target.value.trim().toLowerCase();
   $$('#page .skills-list [data-filter-row]').forEach(row=>{row.hidden=Boolean(needle)&&!row.dataset.filterRow.includes(needle);});
   return;
 }
 if(e.target.id==='quick-filter'){
  const needle=e.target.value.trim().toLowerCase();
  $$('#page [data-filter-row]').forEach(row=>{row.hidden=Boolean(needle)&&!row.dataset.filterRow.includes(needle);});
  if(needle)$$('#page .quick-group').forEach(group=>group.open=true);
  return;
 }
 if(e.target.id==='filter'){
  search=e.target.value;const needle=search.trim().toLowerCase();
  $$('#page .workspace-entries [data-spell-name]').forEach(el=>el.hidden=!!needle&&!el.dataset.spellName.includes(needle));
  if(!$$('#page .workspace-entries [data-spell-name]').length){
   const caret=e.target.selectionStart;render();const fil=$('#filter');if(fil){fil.focus();fil.setSelectionRange(caret,caret);}
  }
 }});
$('#quick-d20').onclick=()=>{if(!character){toast('Import a character first.');return;}queueRoll('1d20','Quick d20');};
$('#export-json').onclick=downloadJson;
$('#about-open').onclick=showAbout;
$('#reference-layer').addEventListener('click',e=>{if(e.target.id==='reference-layer')closeReference();else if(e.target.closest('[data-action=about]'))showAbout();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#reference-layer').hidden)closeReference();});
$('#import-json').onclick=()=>$('#json-file').click();
$('#json-file').addEventListener('change',async e=>{
 const file=e.target.files?.[0];if(!file)return;
 try{const data=JSON.parse(await file.text());if(Array.isArray(data?.characters)&&data?.schema_version===1)acceptVaultBackup(data);else acceptImport(data);}catch(ex){toast('Import failed: '+ex.message);}
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
   const resp=await fetch('/api/pdf-fields',{method:'POST',headers:{'Content-Type':'application/pdf'},body:await file.arrayBuffer()});
   const result=await resp.json();if(!resp.ok)throw Error(result.error||'PDF parse failed');
   data=window.CharacterImport.fromFields(result.fields);
  }
  acceptImport(data,'pdf');
 }catch(err){toast('PDF import failed: '+err.message);}
 e.target.value='';
});
async function loadThemeAssets(){
 try {
  const response=await fetch('./theme-assets.json'); if(!response.ok)return;
  const assets=await response.json();
  const allowed={'surface.table':'--desk-texture','surface.sheet':'--sheet-texture'};
  for(const [id,variable] of Object.entries(allowed)){
   const filename=assets?.assets?.[id];
   if(typeof filename==='string' && /^[A-Za-z0-9][A-Za-z0-9._-]*\.(png|jpg|webp)$/.test(filename))
    document.documentElement.style.setProperty(variable,`url("./${filename}")`);
  }
 } catch(e) {console.warn('Optional asset manifest unavailable',e);}
}
function showWelcome(){
 $('#save-state').textContent='No character loaded';
 $('#page').innerHTML=`<section class="welcome-vault" aria-label="Welcome to the tabletop">
   <div class="welcome-crest">✺</div>
   <div class="alpha-pill">EARLY ALPHA · WORK IN PROGRESS</div>
   <h1>Your adventure starts here.</h1>
   <p>Upload your <strong>D&amp;D Beyond .pdf character sheet here</strong> and bring your character to the table.</p>
   <div class="welcome-steps"><label for="pdf-file" class="welcome-button">Choose character PDF</label>
   <button class="button subtle" type="button" id="welcome-json">Restore JSON backup</button><button class="button subtle" type="button" id="welcome-vault">Character vault</button></div>
   <p class="welcome-note">Your character remains in your browser on this device. PDF support is experimental: custom rules, spells and actions may need review. Export JSON backups regularly.</p>
   <details><summary>What is available in this alpha?</summary><p>Interactive character stats, skills, saves, inventory, spells, resources and a persistent dice table. Some mechanics and PDF variations are not fully automated.</p></details>
 </section>`;
 $('#welcome-json').addEventListener('click',()=>$('#json-file').click());
 $('#welcome-vault').addEventListener('click',showVault);
}
async function boot(){
 try{
  vaultData=await vaultStorage.read();
  // Persist the initial migration before allowing edits to the active document.
  await loadThemeAssets();
  try{await References?.load();}catch(error){console.warn('Optional SRD reference unavailable:',error.message);}
  selectLoadedCharacter();
  $('#save-state').textContent=character?'Saved locally':'No character loaded';
  updateTableResults();
 }catch(err){$('#page').innerHTML=`<div class="overlay-notice" role="alert">Could not load the character vault: ${esc(err.message)}. Exported character JSON can be restored after storage is available.</div>`;}
}

// ── Persistent tabletop ──────────────────────────────────────────────────
// The physical scene is deliberately outside the character panel render() path.
// Re-rendering, navigating, or collapsing panels must not reset dice or rolls.
function initDiceCanvas(){
 canvas=$('#dice-canvas');ctx=canvas.getContext('2d');
 const stage=$('#dice-stage');
 const relative=e=>{const r=stage.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};};
 // Canvas stays visually above the sheet without blocking all controls.
 // Capture events on the tabletop ancestor, and intercept ONLY a visible die hit.
 // This also works when a die lies above a button, input or scrollable panel.
 const findDie=(x,y)=>[...dice].reverse().find(d=>DP.hitTest(d,x,y,lastDimensions.w,lastDimensions.h,Math.max(10,d.r*.23)));
 const releaseGrab=(vx,vy,shake)=>{
   if(!pointer?.down)return;
   const held=pointer;pointer=null;document.body.classList.remove('dice-dragging');
   try{stage.releasePointerCapture(held.id);}catch(_){}
   if(held.mode==='existing'){
     // Catch and rethrow an in-flight die; its original roll still owns its result.
     held.selected.forEach(d=>{d.held=false;DP.launch(d,vx,vy,shake);});
   } else if(held.mode==='manual'){
     startDiceGroup(held.selected,{modifier:0,label:`d${held.selected[0].sides}`,expression:`1d${held.selected[0].sides}`},vx,vy,shake,null);
   } else beginThrow(vx,vy,shake);
 };
 stage.addEventListener('contextmenu',e=>{
   e.preventDefault();e.stopPropagation();
   if(pointer?.down)releaseGrab(Math.max(-850,Math.min(850,pointer.dx)),Math.max(-850,Math.min(850,pointer.dy)),pointer.shake);
 });
 // Pointer Events do not emit a second pointerdown if a second mouse button
 // is pressed while the primary button remains held. mousedown does.
 document.addEventListener('mousedown',e=>{
   if(e.button!==2||!pointer?.down)return;
   e.preventDefault();e.stopPropagation();
   if(pointer?.down)releaseGrab(Math.max(-850,Math.min(850,pointer.dx)),Math.max(-850,Math.min(850,pointer.dy)),pointer.shake);
 },true);
 stage.addEventListener('pointerdown',e=>{
   if(pointer?.down||e.button!==0)return;
   const {x,y}=relative(e);pointerPosition={x,y};
   const hit=findDie(x,y);
   if(!hit)return;
   e.preventDefault();e.stopPropagation();
   hoverDieId=hit.id;stage.classList.remove('die-hover');
   stage.setPointerCapture(e.pointerId);
   following=false;
   const active=activeRolls.find(g=>g.diceIds.includes(hit.id));
   // A pending automatic roll keeps its own ready dice when an unrelated die
   // is grabbed. No one-roll global lockout and no lost attached heal effect.
   const mode=active?'existing':hit.ready&&pendingRoll?'prepared':'manual';
   const selected=mode==='prepared'?dice.filter(d=>d.ready):[hit];
   const prior=selected.map(d=>({sleeping:d.sleeping,rolling:d.rolling,v:[...d.v],w:[...d.w],z:d.z,restTime:d.restTime}));
   selected.forEach(d=>{d.held=true;d.sleeping=true;});
   pointer={id:e.pointerId,x,y,dx:0,dy:0,shake:0,down:true,lastTime:performance.now(),selected,mode,
    offsets:selected.map(d=>({x:d.x-x,y:d.y-y})),prior};
   document.body.classList.add('dice-dragging');
   $('#tray-help').textContent='Drag to shake · release to throw · right-click to release';
 },true);
 stage.addEventListener('pointermove',e=>{
   const {x,y}=relative(e);pointerPosition={x,y};
   if(!pointer?.down){
     hoverDieId=findDie(x,y)?.id??null;stage.classList.toggle('die-hover',hoverDieId!==null);
     if(following&&pendingRoll){
       const selected=dice.filter(d=>d.ready);
       selected.forEach((d,i)=>{
         const cols=Math.min(4,selected.length),col=i%cols,row=Math.floor(i/cols);
         const spacing=diceSpacing();
         d.x=Math.max(d.r,Math.min(lastDimensions.w-d.r,x+(col-(cols-1)/2)*spacing));
         d.y=Math.max(d.r,Math.min(lastDimensions.h-d.r,y+row*spacing));d.z=DP.height(d)+15;
       });
     }
     return;
   }
   if(pointer.id!==e.pointerId)return;
   e.preventDefault();
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
   releaseGrab(Math.max(-850,Math.min(850,pointer.dx)),Math.max(-850,Math.min(850,pointer.dy)),pointer.shake);
 });
 stage.addEventListener('pointercancel',e=>{
   if(!pointer?.down||pointer.id!==e.pointerId)return;
   const held=pointer;pointer=null;document.body.classList.remove('dice-dragging');
   held.selected.forEach((d,i)=>{
     d.held=false;const before=held.prior[i];
     if(held.mode==='existing'&&before){
       d.sleeping=before.sleeping;d.rolling=before.rolling;d.v=before.v;d.w=before.w;d.restTime=before.restTime;d.z=Math.max(DP.height(d),before.z);
     }else{d.sleeping=true;d.z=DP.height(d);}
   });
 });
 stage.addEventListener('pointerleave',()=>{if(!pointer?.down){pointerPosition=null;hoverDieId=null;stage.classList.remove('die-hover');}});
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
function startDiceGroup(selected,p,vx,vy,shake,effect){
 if(!selected.length)return false;
 selected.forEach(d=>{
  d.held=false;d.ready=false;d.rolling=true;
  DP.launch(d,vx+(DP.random()-.5)*170,vy+(DP.random()-.5)*150,shake);
 });
 const group={diceIds:selected.map(d=>d.id),modifier:p.modifier,label:p.label,expression:p.expression,effect};
 activeRolls.push(group);activeRoll=activeRolls.at(-1)||null;
 $('#tray-help').textContent='Rolling · grab another die at any time';
 return true;
}
function beginThrow(vx=120,vy=45,shake=80){
 if(!pendingRoll)return;
 const p=pendingRoll,selected=dice.filter(d=>d.ready);
 if(!selected.length)return;
 const effect=queuedEffect;queuedEffect=null;
 if(startDiceGroup(selected,p,vx,vy,shake,effect)){
   pendingRoll=null;following=false;
 }
}
function finishRollIfSettled(){
 if(!activeRolls.length)return;
 const completed=[];
 for(const group of activeRolls){
   const selected=dice.filter(d=>group.diceIds.includes(d.id));
   if(!selected.length||!selected.every(d=>d.sleeping&&!d.held))continue;
   const values=selected.map(d=>{
     const face=DP.faceValue(d);
     return d.sides===100&&face===0?100:face;
   });
   const result={label:group.label,total:values.reduce((s,n)=>s+n,0)+group.modifier,parts:values,modifier:group.modifier,expression:group.expression};
   lastResult=result;history.unshift(result);history.splice(60);
   if(group.effect?.characterId===activeId&&result.total>=0)
     pendingHealing={characterId:activeId,name:group.effect.name,amount:result.total};
   completed.push(group);
   $('#tray-help').textContent=`${group.label}: ${values.join(' + ')} ${group.modifier?sgn(group.modifier):''} = ${result.total}`;
 }
 if(!completed.length)return;
 activeRolls=activeRolls.filter(g=>!completed.includes(g));activeRoll=activeRolls.at(-1)||null;
 updateTableResults();save();
}
function updateTableResults(){
 const result=$('#last-result'),list=$('#table-history'),count=$('#history-count'),collapsed=$('#collapsed-result');
 if(!result)return;
 result.innerHTML=lastResult?`<strong>${esc(lastResult.total)}</strong> <span>${esc(lastResult.label)} · ${esc(lastResult.parts.join(' + '))} ${lastResult.modifier?sgn(lastResult.modifier):''}</span>`:
 'Pick a die, drag to shake, then release. Dice remain on the table.';
 if(collapsed)collapsed.textContent=lastResult?`${lastResult.total} · ${lastResult.label}`:'Ready';
 count.textContent=String(history.length);
 list.innerHTML=history.slice(0,30).map(h=>`<li>${esc(h.label)} <b>${esc(h.total)}</b> <small>${esc(h.expression)}</small></li>`).join('');
 const effect=$('#roll-effect');if(effect)effect.innerHTML=pendingHealing&&pendingHealing.characterId===activeId?`<span>${esc(pendingHealing.name)}: ${esc(pendingHealing.amount)} HP healing ready</span> ${button('Apply to HP','apply-roll-heal','','button primary mini')} ${button('Dismiss','dismiss-roll-heal','','button mini subtle')}`:'';
}
function renderTray(W,H){
 if(!ctx)return;
 ctx.clearRect(0,0,W,H); // wood and paper are real DOM surfaces beneath the dice
 dice.sort((a,b)=>a.y-b.y).forEach(drawDie);
}
function drawDie(d){
 const {x,y,z,r,sides,q}=d;
 const shape=DP.mesh(sides),perspective=Math.max(.80,Math.min(1.25,1+(y-lastDimensions.h*.5)*.0005+z*.0004)),size=r*perspective;
 const sy=y-z*.45;
 ctx.save();ctx.fillStyle='rgba(0,0,0,.38)';ctx.beginPath();ctx.ellipse(x+8,y+12,size*1.05,size*.3,0,0,2*Math.PI);ctx.fill();
 const vertices=shape.v.map(v=>DP.rotate(q,v));
 const faces=[];
 for(let i=0;i<shape.faces.length;i++){
  const face=shape.faces[i];const normal=DP.rotate(q,face.normal);
  if(normal[2]<.02)continue;
  const pts=face.indices.map(index=>{
    const v=vertices[index];return [x+size*v[0],sy-size*v[1]+size*.20*v[2]];
  });
  const center=face.indices.reduce((sum,index)=>sum+vertices[index][2],0)/face.indices.length;
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
   const cx=f.pts.reduce((s,p)=>s+p[0],0)/f.pts.length,cy=f.pts.reduce((s,p)=>s+p[1],0)/f.pts.length;
   ctx.fillStyle='#fff2d5';ctx.shadowColor='#070a0e';ctx.shadowBlur=3;
   ctx.font=`bold ${Math.max(11,Math.min(21,Math.sqrt(area)*.38))}px Georgia`;
   ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(sides===100?String(f.index*10).padStart(2,'0'):f.index+1,cx,cy);
   ctx.shadowBlur=0;
  }
 }
 if(d.ready||d.id===hoverDieId||d.held){ctx.save();ctx.strokeStyle=d.held?'#a9d9f2':d.ready?'#f5c788bf':'#e5c08bb3';ctx.lineWidth=d.held?3:2;ctx.setLineDash([5,4]);ctx.beginPath();ctx.ellipse(x,sy,size*1.19,size*1.13,0,0,Math.PI*2);ctx.stroke();ctx.restore();}
 else if(d.sleeping){ctx.fillStyle='#fff0c7';ctx.font='bold 16px Georgia';ctx.textAlign='center';ctx.fillText(String(DP.faceValue(d)),x,y+size+19);}
 ctx.restore();
}

// One hover/focus tooltip for every game HUD control, above scrollable sheets.
const hudTip=document.createElement('div');hudTip.className='hud-tooltip';hudTip.hidden=true;
hudTip.id='hud-tooltip';hudTip.setAttribute('role','tooltip');document.body.append(hudTip);
let tipAnchor=null;
function hideHudTip(){hudTip.hidden=true;tipAnchor=null;}
function showHudTip(el){
 if(!el?.dataset.tip)return;
 tipAnchor=el;hudTip.textContent=el.dataset.tip;hudTip.hidden=false;
 const r=el.getBoundingClientRect(),width=hudTip.offsetWidth,height=hudTip.offsetHeight;
 hudTip.style.left=Math.max(9,Math.min(innerWidth-width-9,r.left+r.width/2-width/2))+'px';
 hudTip.style.top=(r.top>height+14?r.top-height-7:Math.min(innerHeight-height-9,r.bottom+7))+'px';
}
document.addEventListener('pointerover',e=>{
 const el=e.target.closest?.('[data-tip]');if(el&&el!==tipAnchor)showHudTip(el);
});
document.addEventListener('pointerout',e=>{
 if(tipAnchor&&!tipAnchor.contains(e.relatedTarget)&&tipAnchor.contains(e.target))hideHudTip();
});
document.addEventListener('focusin',e=>{const el=e.target.closest?.('[data-tip]');if(el)showHudTip(el);});
document.addEventListener('focusout',e=>{if(tipAnchor===e.target)hideHudTip();});
document.getElementById('page').addEventListener('scroll',hideHudTip,{passive:true});

const sheetHandle=$('#sheet-handle');
function updateLayoutButtons(){
 const hidden=document.body.classList.contains('sheet-hidden');
 sheetHandle.innerHTML=hidden?'›› <span>Show sheet</span>':'‹‹ <span>Hide sheet</span>';
 sheetHandle.setAttribute('aria-expanded',String(!hidden));
 sheetHandle.title=hidden?'Show character sheet':'Hide character sheet';
}
sheetHandle.onclick=()=>{document.body.classList.toggle('sheet-hidden');updateLayoutButtons();};
updateLayoutButtons();
if (!DP) {
  $('#save-state').textContent='Startup failed';
  $('#page').innerHTML='<div class="overlay-notice" role="alert">The dice engine did not load. Close older app instances, restart with the supplied launcher, and reload this page. If the problem continues, check the terminal for a missing <code>dice-physics.js</code> request.</div>';
  toast('Startup failed: dice engine missing');
} else {
  initDiceCanvas();
  boot();
}
