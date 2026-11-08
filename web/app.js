/* Interactive Tabletop — offline and local-first.
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
let pendingDamage=[],selectedTargetId='self',selectedDamageType='untyped',nextResolutionId=0,lastAttackOutcome=null;
let pointerPosition=null,following=false,hoverDieId=null,lastDiceGesture=null; // stage-local cursor, not a second dice scene

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
 if(!options.preserveDamageUndo&&character.effects?.combat?.last_damage_undo)delete character.effects.combat.last_damage_undo;
 Vault.upsert(vaultData,activeId,character);
 vaultDirty=true;
 $('#save-state').textContent='Saving…';
 clearTimeout(saveTimer);
 saveTimer=setTimeout(()=>{persistVault().catch(()=>{});},240);
}
function showVaultCount(){const n=$('#vault-count');if(n)n.textContent=`(${vaultData.characters.length})`;}
function selectLoadedCharacter(){
 const entry=vaultData.characters.find(x=>x.id===vaultData.active_id);
 const nextId=entry?.id||null;
 if(activeId!==nextId&&activeId!==null){
  abandonCharacterDice(activeId);
  // A modal confirmation belongs to the sheet on which it was opened.
  const modal=$('#dialog-layer');if(modal){modal.hidden=true;modal.innerHTML='';}
 }
 activeId=nextId;
 character=entry?.character||null;
 if(character){
  character.actions=character.actions||[];
  character.roll_history=character.roll_history||[];
  character.effects=character.effects||{empty_body_rounds:0};
  character.system_id=character.system_id||'dnd5e';
  character.system_edition=character.system_edition||'unspecified';
  history=character.roll_history;
  queuedEffect=null;pendingHealing=null;pendingDamage=[];lastAttackOutcome=null;lastResult=null;selectedTargetId='self';
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
  <div class="vault-toolbar"><button class="button primary" type="button" id="vault-create">Create character</button><label for="pdf-file" class="button">Import character PDF</label><button class="button" id="vault-demo">${vaultData.characters.some(x=>x.character?.demo_id===window.TabletopDemo?.ID)?'Open demo fighter':'Add demo fighter'}</button><button class="button" id="vault-json">Import JSON</button><button class="button" id="vault-backup">Backup all characters</button></div>
  <div class="vault-characters">${vaultData.characters.length?vaultData.characters.map(entry=>{
   const c=entry.character,selected=entry.id===activeId;
   return `<article class="vault-card ${selected?'selected':''}"><div class="vault-info"><strong>${esc(c.name)}</strong><span>${esc(c.class_level||'D&D character')} · ${esc(c.species||'')}</span><small>${c.demo_id?'Demo character · local practice':selected?'Currently playing':'Saved locally'}</small></div>
   <div class="vault-card-actions"><button class="button ${selected?'subtle':'primary'}" data-vault="open" data-id="${esc(entry.id)}" ${selected?'disabled':''}>${selected?'Open':'Play'}</button><button class="button subtle" data-vault="export" data-id="${esc(entry.id)}">Export</button>${c.demo_id?`<button class="button subtle" data-vault="reset" data-id="${esc(entry.id)}">Reset demo</button>`:''}<button class="button warn" data-vault="delete" data-id="${esc(entry.id)}">Delete</button></div></article>`;
  }).join(''):'<p>No characters yet. Create a character, try the demo, or import an existing D&D Beyond PDF.</p>'}</div>
  <p class="vault-footnote">Early alpha: D&D character sheets only. PDF exports may omit custom rules. Importing a new PDF for an existing character preserves current combat state and manual entries.</p>
  </section></div>`;
 $('#vault-close').onclick=closeVault;
 $('#vault-create').onclick=showCharacterCreator;
 $('#vault-demo').onclick=()=>playDemo();
 $('#vault-json').onclick=()=>$('#json-file').click();
 $('#vault-backup').onclick=()=>downloadJsonData(Vault.normalize(vaultData),'interactive-tabletop-vault-backup.json');
 layer.querySelector('.vault-shade').addEventListener('click',e=>{if(e.target.classList.contains('vault-shade'))closeVault();});
}
// A transient form draft, not a second character or rules store. Manual
// creation uses CharacterImport.createManual and the ordinary vault upsert.
function showCharacterCreator(){
 const layer=$('#vault-layer');layer.hidden=false;
 const stats=[['STR','Strength',15],['DEX','Dexterity',14],['CON','Constitution',13],
  ['INT','Intelligence',12],['WIS','Wisdom',10],['CHA','Charisma',8]];
 const skills=Object.keys(window.CharacterImport.skillAbilities);
 layer.innerHTML=`<div class="vault-shade"><section class="vault-dialog creator-dialog" role="dialog" aria-modal="true" aria-labelledby="creator-title">
  <header class="vault-header"><div><small>NEW CHARACTER · MANUAL D&amp;D 2014</small><h2 id="creator-title">Create your adventurer</h2><p>Three steps to an editable character sheet. Your class features, spells and equipment are yours to configure, not guessed by the app.</p></div><button class="button subtle" id="creator-close" type="button" aria-label="Close character creator">✕</button></header>
  <nav class="creator-progress" aria-label="Character creation progress"><span data-progress="0">1 · Identity</span><span data-progress="1">2 · Abilities</span><span data-progress="2">3 · Combat</span></nav>
  <form id="creator-form" novalidate>
   <div class="creator-step" data-creator-step="0"><h3>Who are you playing?</h3><p>This is a manually configured D&amp;D 2014 character, not an automatic class builder.</p>
    <div class="creator-fields"><label>Name <input class="input" name="name" required maxlength="80" placeholder="Your adventurer's name" autocomplete="off"></label>
    <label>Class <input class="input" name="className" required maxlength="80" placeholder="e.g. Ranger" autocomplete="off"></label>
    <label>Level <input class="input" name="level" type="number" min="1" max="20" step="1" required value="1"></label>
    <label>Species <input class="input" name="species" required maxlength="80" placeholder="e.g. Human" autocomplete="off"></label>
    <label>Background <input class="input" name="background" maxlength="80" placeholder="Optional"></label>
    <label>Player <input class="input" name="player" maxlength="80" placeholder="Optional"></label></div></div>
   <div class="creator-step" data-creator-step="1" hidden><h3>Ability scores and proficiencies</h3><p>These are editable example scores. The app calculates 2014 ability modifiers and proficiency bonus from the numbers you enter; choose your own proficiencies with your DM.</p>
    <div class="creator-scores">${stats.map(([k,name,value])=>`<label>${name} (${k})<input class="input" type="number" name="score-${k}" min="1" max="30" step="1" required value="${value}"></label>`).join('')}</div>
    <fieldset class="creator-proficiencies"><legend>Saving throw proficiencies</legend><div class="creator-checks">${stats.map(([k,name])=>`<label><input type="checkbox" name="saveProf" value="${k}"> ${name}</label>`).join('')}</div></fieldset>
    <details class="creator-proficiencies"><summary>Skill proficiencies (optional)</summary><div class="creator-checks">${skills.map(name=>`<label><input type="checkbox" name="skillProf" value="${esc(name)}"> ${esc(name)}</label>`).join('')}</div></details>
   </div>
   <div class="creator-step" data-creator-step="2" hidden><h3>Combat basics</h3><p>Confirm these numbers with your DM. Enter one optional attack to start rolling immediately; unsupported features and spellcasting can be configured on your sheet afterward.</p>
    <div class="creator-fields"><label>Maximum HP <input class="input" type="number" name="hp" min="1" max="9999" step="1" required value="10"></label>
    <label>Armor class <input class="input" type="number" name="ac" min="1" max="40" step="1" required value="10"></label>
    <label>Walking speed (ft) <input class="input" type="number" name="speed" min="0" max="999" step="1" required value="30"></label></div>
    <fieldset class="creator-proficiencies"><legend>Optional first weapon attack</legend>
     <div class="creator-fields"><label>Attack name <input class="input" name="attack-name" maxlength="80" placeholder="e.g. Longsword"></label>
      <label>Attack bonus <input class="input" type="number" name="attack-bonus" min="-30" max="50" step="1" value="0"></label>
      <label>Damage dice <input class="input" name="attack-damage" value="1d8" placeholder="1d8+3"></label>
      <label>Range <select class="input" name="attack-range"><option value="melee">Melee</option><option value="ranged">Ranged</option></select></label></div></fieldset>
    <p class="creator-caution">After creation: review class/species features, equipment, skill choices, spell slots and any homebrew with your DM. Nothing is inferred from the class name.</p>
   </div>
   <p id="creator-error" class="creator-error" role="alert" aria-live="polite" hidden></p>
   <footer class="creator-footer"><button class="button subtle" type="button" id="creator-cancel">Back to characters</button><span class="creator-footer-actions"><button class="button" type="button" id="creator-back" hidden>Previous</button><button class="button primary" type="button" id="creator-next">Next step</button><button class="button primary" type="submit" id="creator-save" hidden>Create character</button></span></footer>
  </form></section></div>`;
 const form=$('#creator-form'),steps=$$('[data-creator-step]',form),error=$('#creator-error');
 let current=0;
 const fail=message=>{error.hidden=false;error.textContent=message;};
 const clearError=()=>{error.hidden=true;error.textContent='';};
 const showStep=index=>{
  current=index;steps.forEach((el,i)=>{el.hidden=i!==index;});
  $$('[data-progress]',layer).forEach((el,i)=>el.classList.toggle('current',i===index));
  $('#creator-back').hidden=index===0;$('#creator-next').hidden=index===2;$('#creator-save').hidden=index!==2;
  clearError();steps[index].querySelector('input')?.focus();
 };
 const validStep=()=>{
  for(const control of $$('input[required]',steps[current])){
   if(!control.value.trim()){fail('Fill in '+(control.closest('label')?.textContent.trim()||'the required field')+'.');control.focus();return false;}
   if(!control.checkValidity()){fail('Check the value for '+(control.closest('label')?.textContent.trim()||'this field')+'.');control.focus();return false;}
  }
  return true;
 };
 const cancel=()=>showVault();
 $('#creator-close').onclick=cancel;$('#creator-cancel').onclick=cancel;
 $('#creator-back').onclick=()=>showStep(Math.max(0,current-1));
 $('#creator-next').onclick=()=>{clearError();if(validStep())showStep(Math.min(2,current+1));};
 layer.querySelector('.vault-shade').addEventListener('click',e=>{if(e.target.classList.contains('vault-shade'))cancel();});
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(current!==2){if(validStep())showStep(Math.min(2,current+1));return;}
  clearError();if(!validStep())return;
  const fields=new FormData(form);
  try{
   const fresh=window.CharacterImport.createManual({
    name:fields.get('name'),className:fields.get('className'),level:fields.get('level'),
    species:fields.get('species'),background:fields.get('background'),player:fields.get('player'),
    scores:Object.fromEntries(stats.map(([k])=>[k,fields.get('score-'+k)])),
    saveProficiencies:fields.getAll('saveProf'),skillProficiencies:fields.getAll('skillProf'),
    hp:fields.get('hp'),ac:fields.get('ac'),speed:fields.get('speed'),
    attack:{name:fields.get('attack-name'),bonus:fields.get('attack-bonus'),
     damage:fields.get('attack-damage'),range:fields.get('attack-range')}
   });
   const submit=$('#creator-save');submit.disabled=true;
   let before=null;
   try{
    await persistVault();
    before=Vault.normalize(vaultData);
    Vault.upsert(vaultData,Vault.newId(),fresh);vaultDirty=true;
    await persistVault();
    selectLoadedCharacter();closeVault();
    toast('Created '+fresh.name+' · Review features, spells, and equipment with your DM.');
   }catch(storageError){
    if(before){vaultData=before;vaultDirty=false;$('#save-state').textContent='Save failed!';}
    submit.disabled=false;fail('Could not save character: '+storageError.message);
   }
  }catch(ex){fail(ex.message);}
 });
 showStep(0);
}

async function playDemo(){
 try{
  await persistVault();
  const {created}=Vault.addDemo(vaultData);
  vaultDirty=true;await persistVault();
  selectLoadedCharacter();closeVault();
  toast(created?'Demo fighter added to your local vault':'Resumed your saved demo fighter');
 }catch(error){toast('Unable to open demo: '+error.message);}
}
async function activateCharacter(id){
 await persistVault();
 if(!vaultData.characters.some(x=>x.id===id))return;
 vaultData.active_id=id;vaultDirty=true;
 selectLoadedCharacter();closeVault();await persistVault();toast('Character selected');
}
$('#create-character').onclick=showCharacterCreator;
$('#vault-open').onclick=async()=>{try{await persistVault();showVault();}catch(e){toast('Could not save before switching characters: '+e.message);}};
$('#vault-layer').addEventListener('click',async e=>{
 const button=e.target.closest('[data-vault]');if(!button)return;
 const action=button.dataset.vault,id=button.dataset.id;
 const entry=vaultData.characters.find(x=>x.id===id);if(!entry)return;
 if(action==='open')try{await activateCharacter(id);}catch(ex){toast('Could not switch characters: '+ex.message);}
 if(action==='export')downloadJsonData(entry.character,(entry.character.name||'character').replace(/[^a-z0-9-]+/gi,'-')+'-character.json');
 if(action==='reset'){
  closeVault();dialog('Reset demo fighter?', 'Restore the original sample stats, encounters, actions and resources? Current demo changes will be lost. Other saved characters will not change.',async()=>{
   try{await persistVault();Vault.resetDemo(vaultData,id);vaultDirty=true;await persistVault();selectLoadedCharacter();showVault();toast('Demo reset to starter values');}
   catch(error){toast('Demo reset failed: '+error.message);}
  });
 }
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
function rollButton(label,modifier,expression,editType='',editKey='',rollKind='untyped'){
 return `<div class="rollrow"><button class="rollable" type="button" data-roll="${esc(expression)}" data-roll-label="${esc(label)}" data-roll-kind="${esc(rollKind)}"><span>${esc(label)}</span><span class="tag">${esc(sgn(modifier))}</span></button>
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
function unavailableReason(plan,resourceCharacter=character){
 // Same engine as commit, no UI-maintained list of combat rules.
 try{Action.verifyEconomy(resourceCharacter,plan);return '';}
 catch(error){return error.message;}
}
function attackUnavailable(permission='action',type='unspecified'){
 if(!Action.combat(character).active||!Action.combat(character).economy.auto)return '';
 try{Action.verifyAttack(character,permission,type);return '';}
 catch(error){return error.message;}
}
function attackRows(mode='compact'){
 return (character.attacks||[]).map((a,i)=>{
  const reason=attackUnavailable(),disabled=reason?' disabled aria-disabled="true"':'';
  const type=Action.attackType(a),range=Action.attackRange(a),bonusRemaining=Action.availableAttackGrants(character,type);
  const bonusReason=attackUnavailable('bonus',type);
  const bonusControl=bonusRemaining?`<button class="button mini" type="button" data-action="bonus-attack" data-arg="${i}" ${bonusReason?'disabled aria-disabled="true"':''} title="${esc(bonusReason||'Spend one granted '+type+' strike when dice launch')}">Bonus strike (${bonusRemaining})</button>`:'';
  const controls=`<button class="button mini" type="button" data-action="attack" data-arg="${i}"${disabled} title="${esc(reason||'Roll attack; action is spent when dice are thrown')}">Attack</button>${bonusControl}${button('Damage','damage',String(i),'button mini subtle')}`;
  if(mode==='detailed')return `<div class="resource-row"><div><strong>${esc(a.name)}</strong><small>Damage: ${esc(a.damage)} · ${esc(type)} · ${esc(range)} range</small>${editMode?`<label class="field">Attack type <select class="input" data-attack-type="${i}"><option value="unspecified" ${type==='unspecified'?'selected':''}>Not classified</option><option value="unarmed" ${type==='unarmed'?'selected':''}>Unarmed strike</option><option value="weapon" ${type==='weapon'?'selected':''}>Weapon attack</option></select></label><label class="field">Attack range <select class="input" data-attack-range="${i}"><option value="unspecified" ${range==='unspecified'?'selected':''}>Not classified</option><option value="melee" ${range==='melee'?'selected':''}>Melee</option><option value="ranged" ${range==='ranged'?'selected':''}>Ranged</option></select></label>`:''}</div><div class="res-count">${esc(sgn(a.bonus))}</div><div class="controls-row">${controls}</div></div>`;
  return `<div class="attack-row" title="${esc(a.name)} · ${esc(a.damage)} · ${esc(type)} · ${esc(range)} range"><span class="attack-name">${esc(a.name)}${editMode?`<div class="setup-attack-fields">${field('Attack name',`attacks.${i}.name`,a.name)}${field('Attack bonus',`attacks.${i}.bonus`,a.bonus,'number')}${field('Damage dice',`attacks.${i}.damage`,a.damage||'')}</div><label class="field">Type <select class="input" data-attack-type="${i}"><option value="unspecified" ${type==='unspecified'?'selected':''}>Not classified</option><option value="unarmed" ${type==='unarmed'?'selected':''}>Unarmed</option><option value="weapon" ${type==='weapon'?'selected':''}>Weapon</option></select></label><label class="field">Range <select class="input" data-attack-range="${i}"><option value="unspecified" ${range==='unspecified'?'selected':''}>Unknown</option><option value="melee" ${range==='melee'?'selected':''}>Melee</option><option value="ranged" ${range==='ranged'?'selected':''}>Ranged</option></select></label>`:''}</span><strong class="attack-bonus">${esc(sgn(a.bonus))}</strong><div class="controls-row">${controls}</div></div>`;
 }).join('');
}
function rollRows(kind,mode='compact'){
 const entries=kind==='ability'?Object.entries(character.abilities||{}).map(([key,v])=>[key+' check',v.modifier,key]):Object.entries(character[kind]||{}).map(([key,v])=>[kind==='saves'?key+' save':key,v,key]);
 return entries.map(([label,modifier,key])=>`<div data-filter-row="${esc(label.toLowerCase())}">${rollButton(label,modifier,`1d20${sgn(modifier)}`,mode==='detailed'||mode==='editable'?kind:'',key,kind==='skills'||kind==='ability'?'ability-check':kind==='saves'?'save':'untyped')}</div>`).join('');
}
function buffBar(){
 if(!character)return '';
 const active=Action.activeEffects(character),checks=character.effects?.pending_concentration||[],conditions=character.conditions||[];
 if(!active.length&&!checks.length&&!conditions.length)return '';
 return `<section class="buff-bar" aria-label="Active buffs, debuffs and concentration checks">
 <span class="buff-caption">EFFECTS</span>
 ${active.map(effect=>`<div class="buff-token" data-tip="${esc(effect.name)}${effect.concentration?' · Concentration':''}${effect.ac_bonus?' · AC +'+effect.ac_bonus:''}${effect.charges?' · '+effect.charges+' charge(s)':''}">
  <strong>${effect.concentration?'◉ ':'✦ '}${esc(effect.name)}</strong>
  ${effect.ac_bonus?`<span>AC +${esc(effect.ac_bonus)}</span>`:''}
  ${effect.bonus_dice?`<span>${effect.bonus_mode==='sustained'?'Active':esc(effect.charges)+' ×'} ${esc(effect.bonus_dice)} · ${esc((effect.bonus_scopes||[effect.bonus_scope||'ability-check']).join(' / '))}</span><label class="effect-auto-toggle" data-tip="Add ${esc(effect.bonus_dice)} to compatible rolls. ${effect.bonus_mode==='sustained'?'No charges: applies while the buff lasts.':'Consumes one charge when the dice settle.'}"><input type="checkbox" data-effect-auto="${esc(effect.id)}" ${effect.auto_use!==false?'checked':''} aria-label="Automatically use ${esc(effect.name)} on compatible rolls"><span>Auto</span></label>`:''}
  <small>${effect.rounds_remaining==null?'Until ended':`${esc(effect.rounds_remaining)} rounds`}</small>
  ${button('×','effect-end',effect.id,'button mini subtle')}</div>`).join('')}
 ${conditions.map(name=>`<div class="buff-token debuff-token" data-tip="${esc(name)} · active condition"><strong>! ${esc(name)}</strong></div>`).join('')}
 ${checks.map(check=>`<div class="buff-token buff-check"><strong>Concentration DC ${esc(check.dc)}</strong>${button('Roll CON save','concentration-check',check.id,'button mini primary')}</div>`).join('')}
 </section>`;
}
function creatureTurnBoard(){
 const state=Action.combat(character);
 if(!state.active)return '';
 const creatures=Action.creatureTurns(character);
 if(!creatures.length)return '';
 return `<details class="creature-turn-board" data-panel="Creature turns" ${panelState.get('Creature turns')??Boolean(character.demo_id)?'open':''}>
 <summary>Creature turns <small>${creatures.length} tracked · DM confirmed, no automatic initiative</small></summary>
 <div class="creature-turn-list">${creatures.map(c=>`<div class="creature-turn-row">
 <div class="creature-turn-identity"><strong>${esc(c.name)}</strong><small>Turn ${esc(c.turn)}${c.scheduled.length?` · ${c.scheduled.length} timed source${c.scheduled.length===1?'':'s'}`:''}</small></div>
 <div class="creature-turn-due">${c.scheduled.length?c.scheduled.map(s=>`<small>${esc(s.condition)} on ${esc(Action.targetById(character,s.targetId)?.name||'removed creature')}: end turn ${esc(s.endTurn)}${s.due?' · due on confirmation':''}</small>`).join(''):'<small>No timed conditions anchored here</small>'}</div>
 <div class="creature-turn-controls" data-pointer-priority="control">${button('Select','choose-creature',c.id,'button mini subtle')}${button('End turn','advance-target-turn',c.id,'button mini subtle')}</div>
 </div>`).join('')}</div>
 <p class="target-note">Ending a creature turn requires DM confirmation. It advances only that creature's condition clock; it does not change your turn, initiative, or spent actions.</p></details>`;
}
function resourcePoolEditor(){
 const items=Object.entries(character.resources||{}).filter(([name])=>window.DndSlots.levelFromName(name)===null);
 if(!items.length)return '';
 const options=items.map(([name])=>`<option value="${esc(name)}">${esc(name)}</option>`).join('');
 const first=items[0][1];
 return `<div class="resource-config"><strong>Edit a resource pool</strong><p class="subtle-note">Update charges without renaming a resource used by an ability.</p>
 <div class="entry-pair"><label class="field">Pool<select class="input" id="economy-edit-resource">${options}</select></label>
 <label class="field">Maximum<input class="input sm" type="number" min="1" max="9999" step="1" id="economy-edit-max" value="${esc(first.max)}"></label>
 <label class="field">Remaining<input class="input sm" type="number" min="0" max="9999" step="1" id="economy-edit-current" value="${esc(first.current)}"></label>
 <label class="field">Refresh<select class="input" id="economy-edit-reset">${['manual','turn','short rest','long rest'].map(x=>`<option value="${x}" ${first.reset===x?'selected':''}>${x}</option>`).join('')}</select></label>
 ${button('Save resource','economy-edit-resource','','button mini subtle')}</div></div>`;
}
function combatActions(){
 const state=Action.combat(character);
 const limits=Action.poolLimits(character),economy=state.economy;
 const tracker=state.active?`<div class="turn-tracker" aria-label="Combat action pools"><strong>Turn ${state.turn}</strong>
 ${character.system_edition==='dnd-2014'&&state.spellcasting.bonus?'<small class="spell-turn-hint" title="2014 rule: only a 1-action cantrip can also be cast this turn">Bonus spell: cantrips only</small>':''}
 ${[['action','Action'],['bonus','Bonus'],['reaction','Reaction']].map(([key,label])=>`<button class="turn-chip ${economy.spent[key]>=limits[key]?'spent':''}" type="button" data-action="mark-turn-action" data-arg="${key}" title="Spend 1 ${label.toLowerCase()} manually; all pools are character-configured">${label} ${Math.max(0,limits[key]-economy.spent[key])}/${limits[key]}</button>`).join('')}
 <small>Attacks: ${economy.attacks.made} made, ${economy.attacks.remaining} remaining in sequence · Extra action grants: ${economy.grants.filter(g=>!g.used).length}</small></div>`:'<span class="combat-notice">Turn tracking off</span>';
 return `<section class="combat-actions" aria-label="Action economy tracker"><strong>Action economy</strong> ${tracker}
 ${button(state.active?'End encounter':'Start encounter','toggle-encounter','','button mini subtle')}
 <label class="field economy-auto"><span>Combat assistance</span><select class="input" id="combat-mode" aria-label="Combat assistance mode">${[['auto','Auto'],['guided','Guided'],['manual','Manual']].map(([mode,label])=>`<option value="${mode}" ${economy.mode===mode?'selected':''}>${label}</option>`).join('')}</select></label>
 <details class="economy-config"><summary>Turn economy settings (DM approved)</summary>
 <div class="entry-pair">${[['action','Actions'],['bonus','Bonus actions'],['reaction','Reactions']].map(([key,label])=>`<label class="field">${label} per turn<input class="input sm" type="number" min="1" max="3" data-economy-config="${key}" value="${limits[key]}"></label>`).join('')}
 <label class="field">Attacks per Attack action<input class="input sm" type="number" min="1" max="4" data-economy-config="attacks_per_action" value="${Action.attacksPerAction(character)}"></label></div>
 <div class="controls-row">${button('Grant action (DM)','grant-economy','any','button mini subtle')}${button('Grant attack-only action','grant-economy','attack','button mini subtle')}</div>
 <div class="entry-pair"><label class="field">New resource pool<input class="input" id="economy-new-resource" maxlength="70" placeholder="e.g. Defensive Points"></label>
 <label class="field">Maximum<input class="input sm" id="economy-new-resource-max" type="number" min="1" max="9999" value="4"></label>
 <label class="field">Reset<select class="input" id="economy-new-resource-reset"><option value="manual">Manual</option><option value="turn">End of turn (zero)</option><option value="short rest">Short rest</option><option value="long rest">Long rest</option></select></label>
 ${button('Create pool','economy-add-resource','','button mini subtle')}</div>${resourcePoolEditor()}
 <small>Extra Attack adds attacks within one Attack action. Haste-style grants allow one additional attack, not another full Attack action. Pathfinder-style pools can be configured here; Pathfinder rules are not automated.</small></details>
 ${button('Next turn ↗','advance-turn','','button mini subtle')} ${state.undo_turn?button('Undo turn','undo-turn','','button mini subtle'):''}${creatureTurnBoard()}</section>`;
}
// The sheet is the complete combat screen. Details are never duplicated in another tab.
function identityRibbon(){
 const move=(String(character.speed||'').match(/\d+\s*ft/gi)||[]).map(s=>parseInt(s,10)).join(' / ')||character.speed;
 return `<header class="identity-ribbon">
 <div class="sheet-portrait avatar-glyph" aria-hidden="true">✦</div>
 <div class="identity-copy"><small class="sheet-eyebrow">${character.demo_id?'DEMO CHARACTER · SAMPLE VALUES':'CHARACTER SHEET'}</small><h1 class="page-title">${esc(character.name)}</h1><div class="identity-sub">${esc(character.class_level)} · ${esc(character.species)} · ${esc(character.background)}</div></div>
 <div class="status-chips" aria-label="Character statistics">
 ${stat('AC',Action.effectiveAC(character),Action.effectiveAC(character)===num(character.ac)?'Armor class':'Base '+character.ac+' + active buffs')}${stat('INIT',sgn(character.initiative),character.initiative_note||'Initiative')}${stat('PROF',sgn(character.proficiency),'Proficiency bonus')}${stat('MOVE',move,'Walk / fly / climb in feet')}
 </div>
 <label class="ruleset-control" title="Verified reference profiles only; unsupported rules stay manual">Rules <select class="input" id="rules-profile" aria-label="Character ruleset"><option value="manual" ${character.rules_profile!=='srd-2014'?'selected':''}>Manual / PDF</option><option value="srd-2014" ${character.rules_profile==='srd-2014'?'selected':''}>D&D 2014 SRD</option></select></label>
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
// One encounter target list under the saved character; the UI has no combat stats of its own.
function currentTargetId(){
 return Action.targetById(character,selectedTargetId)?selectedTargetId:'self';
}
function targetPicker(){
 const selected=currentTargetId();
 return `<label class="target-label">Target <select class="input" id="combat-target" aria-label="Selected encounter target">
 <option value="self" ${selected==='self'?'selected':''}>${esc(character.name)} (self)</option>
 ${Action.targets(character).map(t=>`<option value="${esc(t.id)}" ${t.id===selected?'selected':''}>${esc(t.name)} · AC ${esc(Action.effectiveAC(character,t.id))} · HP ${esc(t.hp.current)}/${esc(t.hp.max)}</option>`).join('')}
 </select></label>`;
}
function encounterTargets(){
 const selected=currentTargetId(),entity=Action.targetById(character,selected);
 const traits=Action.targetTraits(character,selected),grants=Action.conditionGrants(character,selected);
 const saves=selected==='self'?Object.fromEntries(Action.ABILITIES.map((k,i)=>[k,character.saves?.[{'STR':'Strength','DEX':'Dexterity','CON':'Constitution','INT':'Intelligence','WIS':'Wisdom','CHA':'Charisma'}[k]]??0])):entity.saves;
 return `<details class="encounter-targets" data-panel="Encounter targets" ${panelState.get('Encounter targets')?'open':''}><summary>Encounter targets <small>${Action.targets(character).length} tracked · self or manual targets</small></summary>
 <div class="target-toolbar"><label>Damage type <select class="input" id="damage-type" aria-label="Damage type">${Action.DAMAGE_TYPES.map(type=>`<option value="${type}" ${selectedDamageType===type?'selected':''}>${type}</option>`).join('')}</select></label></div>
 <div class="target-summary">${esc(entity.name)} · AC ${esc(Action.effectiveAC(character,selected))} · ${esc(entity.hp.current)}/${esc(entity.hp.max)} HP ${entity.hp.temp?`(+${esc(entity.hp.temp)} temp)`:''}</div>
 <div class="target-conditions" aria-label="Manual target conditions">${[...Action.CONDITIONS].map(n=>`<button type="button" data-action="target-condition" data-arg="${esc(n)}" aria-pressed="${(entity.conditions||[]).includes(n)}" title="Manually toggle ${esc(n)} on ${esc(entity.name)}">${esc(n)}</button>`).join('')}</div>
 ${grants.length?`<div class="target-toolbar" aria-label="Tracked condition sources">${grants.map(g=>`<span class="tag">${esc(g.condition)} · ${esc(g.sourceId)} · ${g.expiry?`end of ${g.expiry.anchorId==='self'?'your':g.expiry.anchorId===selected?'this creature’s':'another creature’s'} turn ${g.expiry.endTurn}`:'DM-managed'} ${button('End source','end-condition-grant',g.id,'button mini subtle')}</span>`).join('')}</div>`:''}
 ${Action.combat(character).active&&selected!=='self'?`<div class="target-toolbar"><small>Creature turn ${esc(entity.condition_turn||1)} · DM-tracked separately from your turn</small>${button('End creature turn','advance-target-turn',selected,'button mini subtle')}</div>`:''}
 <div class="target-traits">${['resistances','vulnerabilities','immunities'].map(k=>`<label>${k}<input class="input" data-target-trait="${k}" value="${esc(traits[k].join(', '))}" placeholder="e.g. fire, poison"></label>`).join('')}</div>
 <div class="target-saves">${Action.ABILITIES.map(k=>`<label>${k} save ${selected==='self'?`<span>${esc(sgn(saves[k]||0))}</span>`:`<input class="input" type="number" data-target-stat="saves.${k}" value="${esc(saves[k]||0)}" aria-label="${k} save bonus">`}</label>`).join('')}</div>
 <div class="target-toolbar"><label>Save <select class="input" id="target-save-ability">${Action.ABILITIES.map(k=>`<option value="${k}">${k}</option>`).join('')}</select></label>
 <label>DC <input id="target-save-dc" class="input" type="number" min="0" max="99" value="15" aria-label="Saving throw difficulty"></label>
 ${button('Roll target save','target-roll-save','','button mini')}
 <label>Damage <input class="input" id="target-manual-damage" type="number" min="0" value="5" aria-label="Manual damage amount"></label>
 ${button('Preview damage','target-manual-damage','','button mini subtle')}
 ${Action.combat(character).last_damage_undo?button('Undo last damage','undo-last-damage','','button mini subtle'):''}
 ${selected!=='self'?button('Remove target','target-remove',selected,'button mini warn'):''}</div>
 ${selected!=='self'?`<div class="target-toolbar">${[['AC','ac',entity.ac],['Current HP','hp.current',entity.hp.current],['Max HP','hp.max',entity.hp.max],['Temp HP','hp.temp',entity.hp.temp]].map(([name,key,value])=>`<label>${name}<input type="number" class="input" data-target-stat="${key}" value="${esc(value)}" aria-label="${name}"></label>`).join('')}</div>`:''}
 <form class="target-add-form" id="target-add-form"><strong>Add another target</strong><input class="input" name="name" maxlength="70" required placeholder="Creature name" aria-label="New target name">
 <input class="input" name="ac" type="number" min="0" max="99" value="12" required aria-label="New target AC">
 <input class="input" name="hp" type="number" min="1" value="20" required aria-label="New target HP"><button class="button mini" type="submit">Add target</button></form>
 <p class="target-note">Only manually supplied creature statistics are used. Saving throws report success/failure; no damage or condition is applied until you approve it. For 2014 rules, configure resistances and vulnerabilities explicitly.</p>
 </details>`;
}
// Presets are explicit player-installed action records. No class/name heuristics
// grant hidden abilities, and the runtime uses the shared planner unchanged.
const ABILITY_TEMPLATES={
 shield_stance:{name:'Shield Stance',activation:'1 action',grant_resource:'Shield Stance Points',grant_amount:4,effect_kind:'none',description:'Player/DM-approved stance; spend one action to recharge your defensive-point pool.'},
 empty_body:{name:'Empty Body',activation:'1 action',resource:'Ki',cost:4,effect_kind:'condition',effect_condition:'Invisible',duration_rounds:10,description:'Configure this feature according to your edition/DM ruling. Grants a tracked Invisibility condition for ten rounds.'},
 flurry_2014:{name:'Flurry of Blows (2014)',ruleset_profile:'dnd-2014',activation:'1 bonus action',resource:'Ki',cost:1,
  requires_attack:true,requires_attack_complete:true,grant_attacks:2,grant_attack_scope:'unarmed',effect_kind:'none',
  description:'2014 SRD: immediately after completing your Attack action, spend one Ki point and your bonus action to gain two unarmed strikes. Mark an imported attack as Unarmed in edit mode. These strikes are separate from Extra Attack and consume no additional action.'},
 deflect_missiles_2014:{name:'Deflect Missiles (2014)',ruleset_profile:'dnd-2014',activation:'1 reaction',trigger_event:'ranged-hit',roll:'1d10+0',cost:0,effect_kind:'none',
  workflow:{kind:'damage-reduction',followup:{label:'Return caught missile',resource:'Ki',cost:1,roll:'1d20+0',requires_catchable:true,requires_free_hand:true}},
  description:'2014 SRD: on a confirmed ranged weapon hit, spend one reaction and reduce incoming damage by 1d10 + DEX modifier + Monk level. Configure the flat bonus in this dice expression. If damage reaches zero, and the missile is small/catchable and one hand is free, optionally spend 1 Ki for a return ranged attack within 20/60 ft as part of the SAME reaction. Confirm level and attack bonus with the DM.'}
 ,
 stunning_strike_2014:{name:'Stunning Strike (2014)',ruleset_profile:'dnd-2014',activation:'special',trigger_event:'melee-hit',resource:'Ki',cost:1,effect_kind:'none',
  workflow:{kind:'save-condition',save:{ability:'CON',dc:null},on_failure:{condition:'Stunned',expiration:'source-next-turn-end'}},
  description:'2014 SRD: after a confirmed qualifying melee weapon hit, spend 1 Ki. Configure YOUR Ki save DC explicitly (8 + proficiency bonus + Wisdom modifier, per DM). The original target makes a Constitution save. Only a failed save can offer Stunned; the tracked condition expires at the end of your next character turn, or the DM can end it earlier.'},
 warding_flare_2014:{name:'Warding Flare (2014; DM-configured)',ruleset_profile:'dnd-2014',activation:'1 reaction',trigger_event:'incoming-attack',resource:'Warding Flare Uses',cost:1,effect_kind:'none',
  description:'Before the incoming attack roll is resolved, confirm a visible attacker within 30 feet that can be blinded. Spend one reaction and one configured use to impose disadvantage; do not automatically alter enemy dice. Confirm variant and uses with your DM.'}
};
function stateEventControls(){
 const state=Action.combat(character),event=Action.combatEvent(character);
 if(!state.active)return '';
 return `<section class="pending-resolution" aria-label="Combat event windows"><strong>Event window (DM confirmed)</strong>
 <small>Select the attacking creature in the Target menu, choose the attack type, and confirm the incoming attack before its roll. Resolve Hit/Miss after any pre-roll reaction. Melee hits bind to the selected target. The next unrelated action or turn closes the window.</small>
 <div class="controls-row"><label class="field">Incoming attack type<select id="incoming-attack-kind" class="input" aria-label="Incoming attack type">${[['ranged-weapon','Ranged weapon'],['melee-weapon','Melee weapon'],['spell','Spell attack'],['other','Other / unclassified']].map(([id,name])=>`<option value="${id}">${name}</option>`).join('')}</select></label>
 ${button('Incoming attack (before roll)','incoming-attack-open','','button mini subtle')}
 ${button('Ranged weapon hit on you (DM override)','combat-event','ranged-hit','button mini subtle')}
 ${button('Your melee attack hit (DM override)','combat-event','melee-hit','button mini subtle')}</div>
 ${event?`<small>Current: ${esc(event.kind)} ${event.attackerId?'· from '+esc(Action.targetById(character,event.attackerId)?.name||'removed attacker'):''} ${event.origin==='resolved-attack'?'· '+esc(Action.targetById(character,event.targetId)?.name||'removed target')+' · settled attack':''} ${event.used?'(reaction used)':'(available)'} · ${button('Close window','combat-event-close','','button mini subtle')}</small>`:''}
 ${event?.kind==='incoming-attack'&&event.origin==='confirmed-incoming'?`<div class="controls-row">${button('Attack missed / resolved','incoming-attack-result',event.id+':miss','button mini subtle')}${button('Attack hit / resolved','incoming-attack-result',event.id+':hit','button mini primary')}</div><small>Apply pre-roll reactions before resolving. The hit decision is confirmed by your DM; ranged-weapon hits can unlock Deflect Missiles.</small>`:''}</section>`;
}
function actionWorkspace(){
 const attackFilter=actionFilter==='all'||actionFilter==='attack';
 const specialFilter=actionFilter==='all'||actionFilter==='action';
 const entries=(character.actions||[]).map((a,i)=>({...a,index:i})).filter(a=>!a.archived);
 const templates=Object.keys(ABILITY_TEMPLATES).filter(key=>!character.actions.some(a=>a.preset_id===key));
 const sequence=Action.pendingWorkflow(character);
 const staged=sequence?`<div class="pending-resolution" aria-label="Pending staged ability"><strong>${esc(sequence.name)}</strong>
 <span>${sequence.kind==='save-condition'?
  sequence.status==='await-save'?`Awaiting ${esc(sequence.save.ability)} save DC ${esc(sequence.save.dc)} from ${esc(Action.targetById(character,sequence.targetId)?.name||'removed target')}. The activation cost was spent.`:
   `Confirmed failed save. You may apply ${esc(sequence.onFailure.condition)} to the original target with DM approval.`:
  sequence.status==='await-roll'?`Awaiting reduction roll vs ${esc(sequence.incoming)} incoming damage; initial reaction already spent.`:'Damage fully deflected. Confirm a catchable missile and free hand before optional return attack.'}</span>
 ${sequence.kind==='save-condition'&&sequence.status==='await-save'?button('Roll target save','staged-save-roll',sequence.id,'button mini primary'):''}
 ${sequence.kind==='save-condition'&&sequence.status==='await-effect'?button('Apply condition (DM confirmed)','staged-save-effect',sequence.id,'button mini primary'):''}
 ${sequence.status==='optional-followup'?`<button type="button" class="button mini primary" data-action="staged-followup" data-arg="${esc(sequence.id)}" ${Number(character.resources?.[sequence.followup.resource]?.current||0)<sequence.followup.cost?'disabled':''}>${esc(sequence.followup.label)} · ${esc(sequence.followup.cost)} ${esc(sequence.followup.resource)}</button>`:''}
 ${button('Decline / finish','staged-decline',sequence.id,'button mini subtle')}</div>`:'';
 return `<div class="target-toolbar target-quick">${targetPicker()}</div>${encounterTargets()}${combatActions()}<div class="workspace-toolbar"><div class="workspace-filters" aria-label="Filter combat actions">
 ${[['all','All'],['attack','Attacks'],['action','Abilities']].map(([key,label])=>`<button type="button" data-action="action-filter" data-arg="${key}" class="filter-chip ${actionFilter===key?'selected':''}" aria-pressed="${actionFilter===key}">${label}</button>`).join('')}</div>
 ${editMode?`${button('+ Attack','add-attack','','button mini')}${button('+ Custom ability','add-action','','button mini')}<label class="field">Ability template <select class="input" id="ability-template"><option value="">Choose…</option>${templates.map(k=>`<option value="${esc(k)}">${esc(ABILITY_TEMPLATES[k].name)}</option>`).join('')}</select></label>${button('Add template','add-ability-template','','button mini subtle')}`:''}</div>
 ${stateEventControls()}${staged}${attackFilter?`<div class="attack-list">${attackRows()}</div>`:''}
 ${specialFilter?`<div class="ability-action-list" aria-label="Imported and custom actions">${entries.map(a=>{
   const roll=a.roll||'', damage=a.damage||'';
   return `<details class="work-entry action-entry" data-action-id="${esc(a.id||a.index)}"><summary><span class="entry-title">${esc(a.name)}</span><span class="entry-meta">${esc(a.activation||'special')}${a.source==='manual'?' · Custom':a.source==='user-reference'?' · Screenshot reference':''}</span></summary>
   <div class="entry-details"><p class="action-description">${esc(a.description||'No rules description imported. Configure manually if needed.')}</p>
   <div class="controls-row action-buttons">${(()=>{let reason='';try{const p=Action.plan(character,a,{targetId:currentTargetId()});reason=unavailableReason(p);}catch(e){reason=e.message;}const lock=reason&&Action.combat(character).active&&Action.combat(character).economy.auto;return `<button type="button" class="button mini primary" data-action="action-use" data-arg="${a.index}" ${lock?'disabled aria-disabled="true"':''} title="${esc(lock?reason:'Confirm ability use')}">Use ability</button>`;})()}${roll&&!a.workflow?button('Roll '+roll,'action-roll',String(a.index),'button mini'):''}
   ${damage?button('Damage '+damage,'action-damage',String(a.index),'button mini subtle'):''}
   ${a.resource&&num(a.cost)>0?`<small class="action-cost">${esc(a.cost)} ${esc(a.resource)} on use</small>`:''}</div>
   ${editMode?`<div class="action-editor"><div class="entry-pair">${field('Name',`actions.${a.index}.name`,a.name)}${field('Activation',`actions.${a.index}.activation`,a.activation||'')}</div>
   <div class="entry-pair">${field(a.workflow?.kind==='damage-reduction'?'Damage reduction dice (1d10 + DEX mod + class level)':'Roll expression',`actions.${a.index}.roll`,roll)}${field('Damage expression',`actions.${a.index}.damage`,damage)}</div>
   ${a.workflow?.kind==='damage-reduction'?`<div class="entry-pair">${field('Optional counterattack roll',`actions.${a.index}.workflow.followup.roll`,a.workflow.followup?.roll||'1d20+0')}${field('Counterattack resource',`actions.${a.index}.workflow.followup.resource`,a.workflow.followup?.resource||'Ki')}${field('Counterattack cost',`actions.${a.index}.workflow.followup.cost`,a.workflow.followup?.cost||1,'number')}</div>`:''}
   ${a.workflow?.kind==='save-condition'?`<div class="entry-pair"><label class="field">Target save ability<select class="input" data-input="actions.${a.index}.workflow.save.ability">${Action.ABILITIES.map(v=>`<option value="${v}" ${a.workflow.save?.ability===v?'selected':''}>${v}</option>`).join('')}</select></label>${field('Ki/feature save DC (DM approved)',`actions.${a.index}.workflow.save.dc`,a.workflow.save?.dc??'','number')}<label class="field">Condition on failed save<select class="input" data-input="actions.${a.index}.workflow.on_failure.condition">${[...Action.CONDITIONS].map(v=>`<option value="${v}" ${a.workflow.on_failure?.condition===v?'selected':''}>${v}</option>`).join('')}</select></label><label class="field">Condition expiration<select class="input" data-input="actions.${a.index}.workflow.on_failure.expiration">${[['manual','DM removes manually'],['source-next-turn-end','End of your next turn'],['target-next-turn-end',"End of target's next turn (manual target turn tracking)"]].map(([id,label])=>`<option value="${id}" ${(a.workflow.on_failure?.expiration||'manual')===id?'selected':''}>${label}</option>`).join('')}</select></label></div><small>Each approved condition source expires independently. The player's Next turn ends their preceding turn; target turns advance only when a DM confirms them.</small>`:''}
   <div class="entry-pair">${field('Resource name',`actions.${a.index}.resource`,a.resource||'')}${field('Cost',`actions.${a.index}.cost`,a.cost||0,'number')}</div>
   <label class="field">Confirmed event prerequisite<select class="input" data-input="actions.${a.index}.trigger_event">${[['','None'],['incoming-attack','Incoming attack before roll'],['ranged-hit','Ranged weapon hit on you'],['melee-hit','Your melee attack hit'],['save-success','Selected creature succeeded on save'],['save-failure','Selected creature failed save'],['damage-taken','You took damage']].map(([id,label])=>`<option value="${id}" ${a.trigger_event===id?'selected':''}>${label}</option>`).join('')}</select></label>
   ${['save-success','save-failure'].includes(a.trigger_event)?`<label class="field">Verified save ability (optional filter)<select class="input" data-input="actions.${a.index}.event_save_ability"><option value="">Any verified ability</option>${Action.ABILITIES.map(v=>`<option value="${v}" ${a.event_save_ability===v?'selected':''}>${v}</option>`).join('')}</select></label>`:''}
   ${a.trigger_event==='damage-taken'?`<div class="entry-pair"><label class="field">Incoming damage type (optional)<select class="input" data-input="actions.${a.index}.event_damage_type"><option value="">Any damage type</option>${Action.DAMAGE_TYPES.map(v=>`<option value="${v}" ${a.event_damage_type===v?'selected':''}>${v}</option>`).join('')}</select></label>${field('Minimum applied damage',`actions.${a.index}.event_min_damage`,a.event_min_damage??0,'number')}${field('Minimum HP lost (after temporary HP)',`actions.${a.index}.event_min_hp_loss`,a.event_min_hp_loss??0,'number')}</div>`:''}
   <div class="entry-pair">${field('Action pool cost (1–3)', `actions.${a.index}.economy_units`,a.economy_units??1,'number')}
   <label class="field">Requires a prior Attack action<input type="checkbox" data-action-requires-attack="${a.index}" ${a.requires_attack?'checked':''}></label></div>
   <div class="entry-pair"><label class="field">Immediately after completed Attack<input type="checkbox" data-action-requires-attack-complete="${a.index}" ${a.requires_attack_complete?'checked':''}></label>
   ${field('Bonus strikes granted (0–4)',`actions.${a.index}.grant_attacks`,a.grant_attacks??0,'number')}</div>
   <label class="field">Granted attack type<select class="input" data-input="actions.${a.index}.grant_attack_scope"><option value="unarmed" ${(!a.grant_attack_scope||a.grant_attack_scope==='unarmed')?'selected':''}>Unarmed only</option><option value="weapon" ${a.grant_attack_scope==='weapon'?'selected':''}>Weapon only</option><option value="any" ${a.grant_attack_scope==='any'?'selected':''}>Any classified attack</option></select></label>
   <div class="entry-pair">${field('Grant resource pool',`actions.${a.index}.grant_resource`,a.grant_resource||'')}${field('Grant amount',`actions.${a.index}.grant_amount`,a.grant_amount||0,'number')}</div>
   <label class="field">Grant extra action permission<select class="input" data-input="actions.${a.index}.grant_economy"><option value="" ${!a.grant_economy?'selected':''}>None</option><option value="any" ${a.grant_economy==='any'?'selected':''}>Unrestricted action (Action Surge-like)</option><option value="attack" ${a.grant_economy==='attack'?'selected':''}>One attack only (Haste-like)</option></select></label>
   <label class="field"><span class="field-label">Effect after roll (DM-approved only)</span><select class="input" data-input="actions.${a.index}.effect_kind"><option value="none" ${(a.effect_kind||'none')==='none'?'selected':''}>No automatic effect</option><option value="heal" ${a.effect_kind==='heal'?'selected':''}>Offer HP healing after roll</option><option value="damage" ${a.effect_kind==='damage'?'selected':''}>Offer damage to selected target</option><option value="condition" ${a.effect_kind==='condition'?'selected':''}>Apply configured condition to self</option></select></label>
   <label class="field"><span class="field-label">Self-condition (only when effect is condition)</span><select class="input" data-action-condition="${a.index}"><option value="">Choose condition</option>${[...Action.CONDITIONS].map(n=>`<option value="${n}" ${a.effect_condition===n?'selected':''}>${n}</option>`).join('')}</select></label>
   <div class="entry-pair">${field('Duration (rounds, 0 = untimed)',`actions.${a.index}.duration_rounds`,a.duration_rounds??0,'number')}
   <label class="field"><span class="field-label">Concentration (DM approved)</span><input type="checkbox" data-action-concentration="${a.index}" ${a.concentration?'checked':''}></label></div>
   <label class="field">Damage type (when configured)<select class="input" data-input="actions.${a.index}.damage_type">${Action.DAMAGE_TYPES.map(t=>`<option value="${t}" ${(a.damage_type||'untyped')===t?'selected':''}>${t}</option>`).join('')}</select></label>
   ${field('Description / DM ruling',`actions.${a.index}.description`,a.description||'')}
   <div class="entry-pair"><label class="field">Apply vetted / player-approved template<select class="input" id="apply-template-${a.index}">
   <option value="">Choose a replacement...</option>${Object.entries(ABILITY_TEMPLATES).map(([key,preset])=>`<option value="${esc(key)}">${esc(preset.name)}</option>`).join('')}</select></label>
   ${button('Review template','apply-ability-template',String(a.index),'button mini subtle')}</div>
   ${button('Archive ability','archive-action',String(a.index),'button mini subtle')}</div>`:''}</div></details>`;
 }).join('')}</div></div>`:''}`;
}
function workspacePane(){
 let content=({overview:actionWorkspace,inventory,spells,features,background:backgroundPage,notes:notesPage,reference:referenceWorkspace}[view]||actionWorkspace)();
 return `<section class="game-workspace" aria-label="Tabbed gameplay workspace"><div class="workspace-caption">GAMEPLAY <span>• ${esc(character.name)}</span></div>${workspaceTabs()}<div class="workspace-content" data-scroll-key="workspace" role="tabpanel">${content}</div></section>`;
}
// A read-only projection of manually created character data. No onboarding
// flags, progress store, or inferred class/spell mechanics.
function characterSetup(){
 if(character.import_provenance!=='Manual character creation (local)')return '';
 const attack=(character.attacks||[]).some(a=>a.name?.trim()&&a.name!=='New attack'&&a.damage?.trim());
 const feature=(character.features||[]).some(f=>f.title?.trim()&&f.title!=='New feature')||
  (character.actions||[]).some(a=>a.name?.trim()&&a.name!=='New ability'&&!a.archived);
 const equipment=(character.inventory||[]).some(i=>i.name?.trim()&&i.name!=='New item'&&!i.archived&&Number(i.quantity)>0);
 const done=[attack,feature,equipment].filter(Boolean).length;
 const rows=[
  ['Attacks',attack,'Record a weapon or unarmed attack, bonus and dice.','attack'],
  ['Features',feature,'Write your class/species features or add an explicitly configured ability.','features'],
  ['Equipment',equipment,'Enter starting equipment and quantities.','inventory'],
  ['Spellbook (optional)',(character.spells||[]).some(sp=>sp.name?.trim()&&sp.name!=='New spell'),
   'Optional: add spells, set levels and configure standard slots in Edit sheet.','spells']
 ];
 return `<aside class="character-setup" role="region" aria-label="Character setup checklist">
 <div class="character-setup-heading"><strong>Finish your character setup</strong><span>${done}/3 core areas recorded</span></div>
 <p>Review these entries with your DM. This is a guide to what you have entered, not a rules validation or a requirement to play.</p>
 <div class="character-setup-list">${rows.map(([label,complete,detail,destination],index)=>
  `<div class="character-setup-row"><span class="character-setup-status" aria-label="${complete?'Recorded':'Not yet recorded'}">${complete?'✓':'○'}</span>
  <div><strong>${esc(label)}</strong><small>${esc(detail)}</small></div>
  ${button(index===3?'Open optional spells':complete?'Review':'Set up','setup-open',destination,'button mini subtle')}
  </div>`).join('')}</div>
 <small class="character-setup-caveat">Your character is usable now. No class features, resource pools, spell slots or equipment effects are generated from a class name.</small>
 </aside>`;
}
function demoPractice(){
 if(character.demo_id!==window.TabletopDemo?.ID)return '';
 const combat=Action.combat(character),dummy=Action.targets(character).find(t=>t.name==='Training Dummy');
 const sword=character.attacks?.findIndex(a=>a.id==='demo-longsword')??-1;
 const ready=Boolean(pendingRoll?.characterId===activeId);
 const rolling=activeRolls.some(group=>group.characterId===activeId);
 const made=combat.economy.attacks.made,remaining=combat.economy.attacks.remaining;
 let instruction,control='';
 if(!combat.active){instruction='Begin encounter tracking to practice spending an action and using Extra Attack.';
  control=button('1 · Start practice encounter','toggle-encounter','','button mini primary');}
 else if(!dummy){instruction='The sample training target was removed or renamed. Add a target in Encounter targets, or reset the demo from Characters.';}
 else if(currentTargetId()!==dummy.id){instruction='Choose the Training Dummy (AC 13) as your practice target.';
  control=button('2 · Target Training Dummy','choose-creature',dummy.id,'button mini primary');}
 else if(ready){instruction=String(pendingRoll.label||'Dice')+' ready. Drag and release across the table, or use Throw. Right-click or Escape cancels only uncommitted throws.';
  control=button('Throw prepared dice','auto-throw','','button mini primary');}
 else if(rolling){instruction='The dice are settling. A hit will offer damage dice in Auto mode; confirm the result if the game asks.';}
 else if(sword<0){instruction='The original longsword was edited or removed. Select an attack below to practice with your current sheet.';}
 else if(made===0||remaining>0){instruction=made?'Extra Attack: your second attack uses the same Attack action, not another action.':'Choose the longsword attack, then throw its physical d20 to commit the action.';
  let reason='';try{Action.verifyAttack(character,'action',Action.attackType(character.attacks[sword]));}catch(e){reason=e.message;}
  control=reason?`<small>${esc(reason)} · use Next turn if the action is spent.</small>`:button(made?'4 · Try Extra Attack':'3 · Prepare longsword attack','attack',String(sword),'button mini primary');}
 else{instruction='Both attacks for this turn are complete. Start your next turn to practice again.';
  control=button('Next character turn','advance-turn','','button mini primary');}
 return `<aside class="demo-callout" role="note" aria-label="Demo character instructions">
 <div class="demo-practice-copy"><strong>Practice with Mara · D&amp;D 2014 Fighter</strong><span>${esc(instruction)}</span><small>Uses real character actions and dice. No tutorial progress is saved; you can edit, export or delete this demo in Characters.</small></div>
 ${control?`<div class="demo-practice-action" data-pointer-priority="control">${control}</div>`:''}</aside>`;
}
function overview(){
 const hp=character.hp;
 const res=Object.entries(character.resources||{}).map(([key,v])=>resourcePips(key,v)).join('');
 const ability=Object.entries(character.abilities||{}).map(([abbr,a])=>
  `<div class="ability-card"><div class="ability-head"><span>${esc(abbr)}</span><button type="button" class="ability-roll" data-action="roll-ability" data-arg="${esc(abbr)}" data-tip="Roll ${esc(abbr)} check" aria-label="Roll ${esc(abbr)} check">d20 ↗</button></div>
  <div class="ability-values">${editMode?input(`abilities.${abbr}.score`,a.score,'number','input sm ability-number'):`<strong class="ability-readout">${esc(a.score)}</strong>`}
  <label>MOD ${editMode?input(`abilities.${abbr}.modifier`,a.modifier,'number','input sm ability-mod'):`<strong class="mod-readout">${esc(sgn(a.modifier))}</strong>`}</label></div></div>`).join('');
 return identityRibbon()+characterSetup()+demoPractice()+buffBar()+
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
 <div class="hud-zone hud-resources" data-scroll-key="resources">${panel('Resources',res)}${panel('Conditions',conditionRail())}</div>
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
function spellcastingSettings(sp){
 const choices=Action.ABILITIES.map(ability=>`<option value="${ability}" ${sp.spellcasting_ability===ability?'selected':''}>${ability}</option>`).join('');
 return `<div class="entry-pair"><label class="field"><span class="field-label">Spellcasting ability (DM approved)</span>
 <select class="input" data-input="spells.${sp.index}.spellcasting_ability" aria-label="Spellcasting ability for ${esc(sp.name)}">
 <option value="" ${!sp.spellcasting_ability?'selected':''}>Legacy source (only if unambiguous)</option>${choices}</select></label>
 <label class="field"><span class="field-label">Modifier override (optional)</span><input type="number" min="-30" max="30" step="1" class="input" data-spell-modifier="${sp.index}" value="${esc(sp.spellcasting_modifier??'')}" placeholder="Use selected ability" aria-label="Spellcasting modifier override for ${esc(sp.name)}"></label></div>
 <small class="subtle-note">Only qualified 2014 self-healing automation currently uses this modifier. A fixed override takes precedence over the selected ability; mixed sources need explicit selection.</small>`;
}
function spellSlotSettings(){
 const existing=Action.spellSlots(character);
 return `<details class="spell-slot-settings" aria-label="Standard spell slot settings"><summary>Configure standard spell slots (DM approved)</summary>
 <p class="subtle-note">Set each level's total and remaining uses. Zero total removes that standard slot pool. Pact Magic, class progression and spells are not inferred.</p>
 <div class="spell-slot-settings-list">${Array.from({length:9},(_,i)=>{
  const level=i+1,pool=existing.find(s=>s.level===level);
  return `<div class="entry-pair spell-slot-row" data-slot-level="${level}"><strong>Level ${level}</strong><label class="field">Total<input class="input sm" type="number" min="0" max="99" step="1" data-slot-total value="${esc(pool?.max??0)}"></label>
   <label class="field">Remaining<input class="input sm" type="number" min="0" max="99" step="1" data-slot-remaining value="${esc(pool?.current??0)}"></label>${button('Save slots','configure-spell-slots',String(level),'button mini subtle')}</div>`;
 }).join('')}</div></details>`;
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
 return `<div class="target-toolbar target-quick">${targetPicker()}</div><div class="workspace-toolbar spell-toolbar"><div class="workspace-filters" aria-label="Filter spells">
 ${[['all','All'],['prepared','Prepared / Ready'],['available','Available to prepare']].map(([key,label])=>`<button type="button" data-action="spell-filter" data-arg="${key}" class="filter-chip ${spellFilter===key?'selected':''}" aria-pressed="${spellFilter===key}">${label}</button>`).join('')}</div>
 <input class="input search" id="filter" placeholder="Find spells…" value="${esc(search)}" aria-label="Search spells">${button('+ Spell','add-spell','','button mini')}</div>
 <div class="spell-summary">${all.length} spell records · ${prepared} manually prepared · ${slots.map(s=>`Lv${s.level} ${s.current}/${s.max}`).join(' · ')||'No slots recorded'}</div>
 ${editMode?spellSlotSettings():''}
 <div class="workspace-entries" aria-label="Spellbook entries">${filtered.map(sp=>{
 const locked=sp.always_prepared||sp.level===0;
 const ready=sp.level===0||sp.always_prepared||sp.prepared;
 const badge=sp.level===0?'Cantrip':sp.level==null?'Level unknown':`Level ${sp.level}`;
 const state=sp.always_prepared?'Always prepared':sp.level===0?'At will':sp.prepared?'Prepared':'Available';
 const slotOptions=sp.level===0?[{level:0,current:1}]:slots.filter(s=>Number.isInteger(sp.level)&&s.level>=sp.level);
 const selectedSlot=slotOptions.find(s=>s.current>0)?.level??slotOptions[0]?.level??null;
 const concentration=typeof sp.concentration==='boolean'?sp.concentration:/\bconcentration\b/i.test(sp.duration||'');
 const ref=References?.match('spell',sp.name,character.system_edition);
 const preset=ref?.automation;
 const presetActive=Boolean(preset&&(sp.automation==='srd-2014'||(!sp.automation&&character.rules_profile==='srd-2014')));
 return `<div class="spell-entry" data-spell-name="${esc((sp.name||'').toLowerCase())}"><details class="work-entry" data-spell-id="${esc(sp.id||sp.index)}"><summary><span class="entry-title">${esc(sp.name)}</span><span class="entry-meta">${badge} · ${state}${Vault.isManualSpell(sp)?' · Manual entry':''}</span></summary>
 <div class="entry-details"><div><b>Source:</b> ${esc(sp.source||'Unknown')}</div><div><b>Casting:</b> ${esc(sp.casting_time||'Unknown')} · ${esc(sp.range||'')}</div><div><b>Duration:</b> ${esc(sp.duration||'Unknown')}</div>
 <div><b>Components:</b> ${esc(sp.components||'')}</div><div><b>Save / attack:</b> ${esc(sp.save||'—')}</div>${sp.notes?`<p>${esc(sp.notes)}</p>`:''}${sourceBadge(ref)}
 ${preset?`<div class="srd-preset">${presetActive?`<strong>Qualified 2014 SRD effect enabled</strong> ${button('Use manual rules','spell-preset-off',String(sp.index),'button mini subtle')}`:`<span>Qualified 2014 SRD profile available (self only).</span> ${button('Enable 2014 effect','spell-preset-on',String(sp.index),'button mini')}`}</div>`:''}
 <div class="controls-row spell-cast-controls">${slotOptions.length?`<label>Slot <select class="input" data-slot-choice="${sp.index}" aria-label="Cast ${esc(sp.name)} at spell slot level">${slotOptions.map(s=>`<option value="${s.level}" ${s.level===selectedSlot?'selected':''} ${s.current<1?'disabled':''}>${s.level===0?'Cantrip':`Level ${s.level} · ${s.current} left`}</option>`).join('')}</select></label>`:''}
 ${button('Cast spell','cast-spell',String(sp.index),'button mini primary')}${!ready?'<small>Prepare this spell first</small>':''}${sp.level==null?'<small>Set level in Edit sheet</small>':''}</div>
 ${editMode?`<div class="spell-execution-editor"><div class="entry-pair">${field('Name',`spells.${sp.index}.name`,sp.name)}${field('Source / class',`spells.${sp.index}.source`,sp.source||'')}${field('Casting time',`spells.${sp.index}.casting_time`,sp.casting_time||'')}${field('Notes / DM ruling',`spells.${sp.index}.notes`,sp.notes||'')}</div><div class="entry-pair"><label class="field"><span class="field-label">Spell level</span><select class="input" data-spell-level="${sp.index}">${['Unknown',...Array.from({length:10},(_,n)=>n)].map((level,i)=>`<option value="${i-1}" ${level===sp.level||(level==='Unknown'&&sp.level==null)?'selected':''}>${level}</option>`).join('')}</select></label>
 ${field('Optional dice expression',`spells.${sp.index}.roll`,sp.roll||'')}<label class="field">Damage type (when configured)<select class="input" data-input="spells.${sp.index}.damage_type">${Action.DAMAGE_TYPES.map(t=>`<option value="${t}" ${(sp.damage_type||'untyped')===t?'selected':''}>${t}</option>`).join('')}</select></label></div>
 ${spellcastingSettings(sp)}
 <div class="entry-pair"><label class="field"><span class="field-label">Effect after dice (DM approved)</span><select class="input" data-spell-effect="${sp.index}"><option value="none" ${(sp.effect_kind||'none')==='none'?'selected':''}>No automated effect</option><option value="heal" ${sp.effect_kind==='heal'?'selected':''}>Offer HP healing</option><option value="damage" ${sp.effect_kind==='damage'?'selected':''}>Offer damage to selected target</option><option value="condition" ${sp.effect_kind==='condition'?'selected':''}>Apply configured condition to self</option></select></label>
 <label class="field"><span class="field-label">Self-condition</span><select class="input" data-spell-condition="${sp.index}"><option value="">Choose condition</option>${[...Action.CONDITIONS].map(n=>`<option value="${n}" ${sp.effect_condition===n?'selected':''}>${n}</option>`).join('')}</select></label>
 ${field('Duration in rounds (0 = untimed)',`spells.${sp.index}.duration_rounds`,sp.duration_rounds??0,'number')}</div>
 <label class="field"><input type="checkbox" data-spell-concentration="${sp.index}" ${concentration?'checked':''}> Track concentration (based on PDF duration; editable)</label></div>`:''}
 ${editMode&&Vault.isManualSpell(sp)?`<div class="controls-row">${button('Remove manual spell','remove-manual-spell',String(sp.index),'button mini subtle')}</div>`:''}
 <p class="subtle-note">The character ruleset enables only qualified SRD profiles; individual overrides remain available. 2014 SRD presets require opt-in; imported/DM-edited rules stay unchanged. Self-target effects only. Casting spends slots after confirmation; healing is applied after dice settle.</p></div></details>
 <label class="prepared-control" data-tip="${esc(sp.name)} · ${state}"><input type="checkbox" data-prep="${sp.index}" ${sp.prepared||locked?'checked':''} ${locked?'disabled':''} aria-label="Prepare ${esc(sp.name)}"><span>${locked?'Ready':'Prep'}</span></label></div>`;
 }).join('')}</div>`;
}

function features(){
 return `<div class="workspace-feature-list">
 <div class="workspace-toolbar">${button('+ Feature note','add-feature-note','','button mini')}<small>Notes describe features; they do not execute actions or spend resources.</small></div>
 ${panel('Features & traits',(character.features||[]).map((x,i)=>
 `<details class="feature" ${i===0?'open':''}><summary>${esc(x.title)}</summary><pre>${esc(x.text)}</pre>${editMode&&x.source==='manual'?`<div class="setup-feature-editor">${field('Feature name',`features.${i}.title`,x.title)}<label class="field">Description / DM ruling<textarea class="input longtext" data-input="features.${i}.text">${esc(x.text)}</textarea></label></div>`:''}</details>`).join(''))}
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
 if(!obj||(!Object.prototype.hasOwnProperty.call(obj,key)&&! /^(?:actions|spells)\.\d+\.(?:effect_kind|effect_condition|duration_rounds|roll|damage_type|spellcasting_ability|economy_units|grant_resource|grant_amount|grant_economy|trigger_event|event_save_ability|event_damage_type|event_min_damage|event_min_hp_loss)$/.test(path)))return;
 if(/^actions\.\d+\.workflow\.save\.dc$/.test(path))value=value.trim()===''?null:Number(value);
 if(/^(?:attacks|spells)\.\d+\.(?:name|bonus|damage|roll)$/.test(path)||/^spells\.\d+\.spellcasting_ability$/.test(path))
  value=window.CharacterImport.validateManualEntryField(parts[0],key,value);
 if(typeof obj[key]==='number')value=Math.max(key==='current' && path.startsWith('hp.')?0:-999999,Math.min(999999,num(value)));
 obj[key]=value;
 if(/^actions\.\d+\.(?:economy_units|grant_amount|event_min_damage|event_min_hp_loss)$/.test(path))obj[key]=Math.max(0,Math.min(999999,Math.floor(num(value))));
 if(/^(?:actions|spells)\.\d+\.duration_rounds$/.test(path))obj[key]=Math.max(0,Math.min(999,Math.floor(num(value))));
 // User-edited imported abilities become manual overrides, retained on reimport.
 if(/^actions\.\d+\./.test(path)){const a=character.actions[Number(parts[1])];if(a)a.source='manual';}
 save();
}
function dialog(heading,message,onConfirm,confirmLabel='Continue',cancelLabel='Cancel'){
 const ownerId=activeId,ownerCharacter=character;
 const layer=$('#dialog-layer');
 layer.hidden=false;
 layer.innerHTML=`<section class="dialog" role="dialog" aria-modal="true" aria-label="${esc(heading)}"><h2>${esc(heading)}</h2><p>${esc(message)}</p>
 <div class="controls-row"><button class="button subtle" id="dlg-no">${esc(cancelLabel)}</button><button class="button primary" id="dlg-yes">${esc(confirmLabel)}</button></div></section>`;
 $('#dlg-no').onclick=()=>{layer.hidden=true;layer.innerHTML='';};
 $('#dlg-yes').onclick=()=>{
  layer.hidden=true;layer.innerHTML='';
  if(ownerId!==activeId||ownerCharacter!==character){toast('Character changed. Please review the action again.');return;}
  onConfirm();
 };
}
function applyDamage(kind){
 const amount=Math.max(0,Math.min(999999,Math.floor(num($('#hp-amount')?.value,0))));
 if(kind==='heal'){Action.applyHealing(character,amount);save();render();return;}
 try{
  const result=Action.commitDamage(character,Action.planDamage(character,'self',{amount,type:'untyped'}));
  save({preserveDamageUndo:true});render();
  if(result.concentrationCheck)toast('Concentration check required: DC '+result.concentrationCheck.dc+'. Use the Effects bar to roll.');
 }catch(e){toast(e.message);}
}
function damagePreview(details){
 const p=Action.planDamage(character,details.targetId,details);
 const target=Action.targetById(character,p.targetId);
 const reasons=[p.immune?'immune':null,p.resistant?'resistant':null,p.vulnerable?'vulnerable':null,p.saveOutcome!=='none'?`save ${p.saveOutcome} (${p.savePolicy})`:null].filter(Boolean).join(', ')||'normal';
 dialog('Apply damage to '+target.name+'?',`${p.raw} ${p.type} damage → ${p.amount} after modifiers (${reasons}); ${p.absorbed} temporary HP absorbed, ${p.hpLoss} current HP lost. This cannot be automatically undone.`,()=>{
  try{const result=Action.commitDamage(character,p);save({preserveDamageUndo:true});render();updateTableResults();
   toast(`${target.name}: ${result.amount} damage applied${result.concentrationCheck?' · concentration DC '+result.concentrationCheck.dc:''}.`);
  }catch(e){toast('Damage not applied: '+e.message);}
 });
}
function doRest(kind){
 if(kind==='long')character.hp.current=character.hp.max;
 for(const res of Object.values(character.resources||{})){
   if(res.reset==='turn')res.current=0;
   else if(kind==='long'||(kind==='short'&&res.reset==='short rest'))res.current=res.max;
 }
 if(kind==='long'){
  Action.endAllEffects(character);
  Action.endEmptyBody(character);
  // Long rests restore resources, not arbitrary manual conditions; the DM
  // decides whether an independently applied condition has ended.
 }
 save();render();toast(`${kind==='long'?'Long':'Short'} rest applied`);
}
function handleAction(action,arg){
 switch(action){
  case 'setup-open':{
   if(character.import_provenance!=='Manual character creation (local)')break;
   const screens={attack:'overview',features:'features',inventory:'inventory',spells:'spells'};
   if(!Object.prototype.hasOwnProperty.call(screens,arg))break;
   editMode=true;setView(screens[arg]);
   if(arg==='attack')actionFilter='attack';
   render();break;
  }
  case 'edit-mode':editMode=!editMode;if(!editMode)editRollModifiers=false;render();break;
  case 'undo-last-damage':try{if(Action.undoLastDamage(character)){save();render();toast('Last damage application undone.');}else toast('Nothing to undo.');}catch(e){toast(e.message);}break;
  case 'target-remove':dialog('Remove encounter target?',`Remove ${Action.targetById(character,arg)?.name||'this target'} from this character's encounter notes?`,()=>{
   Action.removeTarget(character,arg);selectedTargetId='self';pendingDamage=pendingDamage.filter(x=>x.targetId!==arg);save();render();updateTableResults();
  });break;
  case 'target-condition':{try{const id=currentTargetId(),entity=Action.targetById(character,id);Action.setTargetCondition(character,id,arg,!entity.conditions?.includes(arg));save();render();}catch(e){toast(e.message);}break;}
  case 'end-condition-grant':{
   const grant=Action.conditionGrants(character).find(g=>g.id===arg);
   if(!grant){toast('Condition source is no longer active.');break;}
   dialog('End condition source?',`Confirm ending ${grant.condition} from ${grant.sourceId}. Other active sources remain in effect.`,()=>{
    if(Action.endConditionGrant(character,arg)){save();render();}else toast('Source already ended.');
   },'End source');break;
  }
  case 'choose-creature':{
   if(!Action.targetById(character,arg)||arg==='self'){toast('This creature is no longer tracked.');break;}
   selectedTargetId=arg;view='overview';render();toast('Selected '+Action.targetById(character,arg).name+'.');break;
  }
  case 'advance-target-turn':{
   const target=Action.targetById(character,arg);
   if(!target||arg==='self'){toast('Select a tracked creature.');break;}
   dialog('End creature turn?',`DM confirmation: finish ${target.name}'s tracked turn ${target.condition_turn||1}. This advances only that creature's condition timers, not your action economy or initiative.`,()=>{
    try{const result=Action.advanceTargetTurn(character,arg);save();render();toast(result.expired.length?'Expired: '+result.expired.map(x=>x.condition).join(', '):'Creature turn advanced.');}
    catch(e){toast(e.message);}
   },'End creature turn');break;
  }
  case 'target-roll-save':{
   const target=currentTargetId(),abb=$('#target-save-ability')?.value||'CON',dc=Number($('#target-save-dc')?.value);
   const bonus=target==='self'?num(character.saves?.[{STR:'Strength',DEX:'Dexterity',CON:'Constitution',INT:'Intelligence',WIS:'Wisdom',CHA:'Charisma'}[abb]]):num(Action.targetById(character,target)?.saves?.[abb]);
   try{Action.evaluateSave(0,dc);if(!queueRoll(`1d20${sgn(bonus)}`,`${Action.targetById(character,target).name} ${abb} save (DC ${dc})`,{kind:'target-save',characterId:activeId,targetId:target,ability:abb,dc},target==='self'?'save':'untyped'))throw Error('Cannot prepare dice.');}
   catch(e){toast('Cannot roll target save: '+e.message);}break;
  }
  case 'target-manual-damage':{
   try{damagePreview({targetId:currentTargetId(),amount:Number($('#target-manual-damage')?.value),type:selectedDamageType});}
   catch(e){toast('Cannot preview damage: '+e.message);}break;
  }
  case 'apply-target-damage':{
   const entry=pendingDamage.find(x=>x.id===arg&&x.characterId===activeId);
   if(!entry){toast('Damage roll no longer available.');break;}
   const policy=$(`[data-pending-save="${arg}"]`)?.value||'none';
   const saveId=policy==='none'?null:$(`[data-pending-save="${arg}"]`)?.dataset.saveId;
   if(policy!=='none'&&!saveId){toast('Choose a verified saving throw result first.');break;}
   try{const p=Action.planDamage(character,entry.targetId,{amount:entry.amount,type:entry.type,
     saveId,savePolicy:policy});
    const target=Action.targetById(character,entry.targetId);
    dialog('Apply rolled damage?',`${entry.source}: apply ${p.amount} ${p.type} damage to ${target.name} (${p.absorbed} temp HP, ${p.hpLoss} HP)?${p.saveId?' This explicitly associates the selected saving throw with this damage.':''}`,()=>{
     try{const result=Action.commitDamage(character,p);pendingDamage=pendingDamage.filter(x=>x.id!==arg);save({preserveDamageUndo:true});render();updateTableResults();
      toast(`Applied ${result.amount} ${result.type} damage to ${target.name}${result.concentrationCheck?' · concentration DC '+result.concentrationCheck.dc:''}.`);
     }catch(e){toast('Damage not applied: '+e.message);}
    });
   }catch(e){toast('Damage not applied: '+e.message);}break;
  }
  case 'dismiss-target-damage':pendingDamage=pendingDamage.filter(x=>x.id!==arg);updateTableResults();break;
  case 'action-filter':actionFilter=arg;render();break;
  case 'spell-filter':spellFilter=arg;render();break;
  case 'spell-preset-on':{
   const sp=character.spells?.[num(arg)],ref=sp&&References?.match('spell',sp.name,character.system_edition);
   if(!ref?.automation){toast('No verified 2014 spell profile.');break;}
   dialog('Enable 2014 SRD effect?',`Use the 2014 SRD self-targeted rules for ${sp.name}? This does not change the imported spell, and can be disabled anytime. Confirm your table uses 2014 rules and that your base AC excludes any existing buff.`,()=>{
    sp.automation='srd-2014';save();render();toast('2014 SRD effect enabled for '+sp.name);
   });break;
  }
  case 'spell-preset-off':{const sp=character.spells?.[num(arg)];if(sp){sp.automation='manual';save();render();}break;}
  case 'concentration-check':{
   const check=(character.effects?.pending_concentration||[]).find(x=>x.id===arg);
   if(!check){toast('No pending concentration save.');break;}
   const bonus=num(character.saves?.Constitution,0),expression=`1d20${sgn(bonus)}`;
   if(queueRoll(expression,`Concentration DC ${check.dc}`,{kind:'concentration',characterId:activeId,checkId:check.id},'save'))toast('Roll CON save against DC '+check.dc);break;
  }
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
  case 'rest':dialog('Complete '+arg+' rest?',`Restore eligible resources${arg==='long'?', hit points, and end tracked effects (manual conditions remain)':''}?`,()=>doRest(arg));break;
  case 'condition':try{Action.setTargetCondition(character,'self',arg,!character.conditions.includes(arg));save();render();}catch(e){toast(e.message);}break;
  case 'set-hp':{character.hp.current=Math.max(0,Math.min(character.hp.max,num(arg)));save();render();break;}
  case 'resource-set':{const at=arg.lastIndexOf(':'),name=arg.slice(0,at),value=Number(arg.slice(at+1));try{Action.setResourceCurrent(character,name,value);save();render();}catch(e){toast(e.message);}break;}
  case 'resource':{const at=arg.lastIndexOf(':'),name=arg.slice(0,at),delta=num(arg.slice(at+1));const r=character.resources?.[name];if(r)try{Action.setResourceCurrent(character,name,Math.min(Number(r.max),Math.max(0,Number(r.current)+delta)));save();render();}catch(e){toast(e.message);}break;}
  case 'add-attack':character.attacks=character.attacks||[];character.attacks.push({name:'New attack',bonus:0,damage:'1d6',type:'attack',attack_type:'unspecified',attack_range:'unspecified'});save();render();break;
  case 'add-action':character.actions=character.actions||[];character.actions.unshift({id:'manual-'+Date.now(),name:'New ability',activation:'action',description:'',roll:'',damage:'',resource:'',cost:0,effect_kind:'none',duration_rounds:0,concentration:false,source:'manual',archived:false,effect_condition:''});save();render();break;
  case 'add-ability-template':{
   const key=$('#ability-template')?.value,base=ABILITY_TEMPLATES[key];if(!base){toast('Select an ability template first.');break;}
   if((character.actions||[]).some(a=>a.preset_id===key)){toast('Template already installed.');break;}
   character.actions=character.actions||[];
   const id='preset-'+key+'-'+Date.now();character.actions.unshift({id,preset_id:key,source:'manual',archived:false,roll:'',damage:'',...base});
   save();render();toast(base.name+' added as an editable custom ability.');break;
  }
  case 'apply-ability-template':{
   const index=num(arg),a=character.actions?.[index],selected=$(`#apply-template-${index}`)?.value,preset=ABILITY_TEMPLATES[selected];
   if(!a||!preset){toast('Select an ability template first.');break;}
   if(preset.ruleset_profile&&character.system_edition!==preset.ruleset_profile){toast('Template requires '+preset.ruleset_profile+' edition.');break;}
   dialog('Replace mechanics for '+a.name+'?',`This explicitly replaces the selected ability’s activation and resource costs with the ${preset.name} template. The original ability ID and imported description are retained. Verify dice modifiers and homebrew rules with your DM. No resource is spent by configuring an ability.`,()=>{
    const name=a.name,id=a.id,description=a.description||'';
    for(const field of ['activation','roll','damage','resource','cost','effect_kind','effect_condition','duration_rounds','concentration','economy_units','requires_attack','grant_resource','grant_amount','grant_economy','grant_attacks','grant_attack_scope','requires_attack_complete','workflow','damage_type','ruleset_profile'])delete a[field];
    Object.assign(a,JSON.parse(JSON.stringify(preset)),{id,name,source:'manual',preset_id:selected});
    a.description=description?description+'\n\nWorkflow configuration: '+preset.description:preset.description;
    save();render();toast('Ability workflow configured. Review dice modifiers before use.');
   },'Apply template');break;
  }
  case 'archive-action':{const a=character.actions?.[num(arg)];if(a){a.archived=true;save();render();}break;}
  case 'action-use':{
   const a=character.actions?.[num(arg)];if(!a)break;
   let p;try{p=Action.plan(character,a,{targetId:currentTargetId()});}catch(e){toast('Cannot use '+a.name+': '+e.message);break;}
   if(p.workflow?.kind==='damage-reduction'){
    try{Action.verifyEconomy(character,p);if(!canPrepareDice(p.roll.count,p.roll.sides))throw Error('Not enough room for the reduction dice.');}
    catch(e){toast(e.message);break;}
    let incoming=0;
    dialog('Activate '+p.name+'?',`Confirm you were hit by a ranged weapon attack. Spend the reaction now, then roll ${p.roll.expression} to reduce the incoming damage. Counterattack Ki is OPTIONAL and never charged upfront.`,()=>{
     try{const flow=Action.beginWorkflow(character,p,incoming);save();render();
      queueRoll(flow.roll,flow.name+' damage reduction',{kind:'staged-reduction',characterId:activeId,sequenceId:flow.id});}
     catch(error){toast('Cannot activate: '+error.message);}
    },'Spend reaction & roll');
    const panel=$('#dialog-layer .dialog'),field=document.createElement('label');field.className='field';field.textContent='Incoming ranged-weapon damage (confirmed by DM)';
    const input=document.createElement('input');input.className='input';input.type='number';input.min='1';input.max='999999';input.value='1';incoming=1;
    input.addEventListener('input',()=>incoming=Number(input.value));field.append(input);panel.querySelector('.controls-row').before(field);
    break;
   }
   if(p.workflow?.kind==='save-condition'){
    try{Action.verifyEconomy(character,p);if(Action.pendingWorkflow(character))throw Error('Finish the previous staged ability first.');
     const target=Action.targetById(character,p.targetId);if(!target)throw Error('Original event target was removed.');
     const ability=p.workflow.save.ability,dc=p.workflow.save.dc,bonus=num(target.saves?.[ability],0);
     const expr=`1d20${sgn(bonus)}`,cfg=Action.dice(expr);
     if(!canPrepareDice(cfg.count,cfg.sides))throw Error('Not enough room for the target save dice.');
     dialog('Attempt '+p.name+'?',`Spend ${p.cost} ${p.resource} after the confirmed event, then ${target.name} rolls a ${ability} saving throw against DC ${dc}. On failure, you may separately confirm the condition with your DM.`,()=>{
      try{const flow=Action.beginWorkflow(character,p);save();render();
       if(!queueRoll(expr,`${target.name} ${ability} save (DC ${dc})`,
        {kind:'target-save',characterId:activeId,targetId:p.targetId,ability,dc,workflowId:flow.id},p.targetId==='self'?'save':'untyped'))
        toast('Save dice not prepared. Use Roll target save to retry; the original cost remains spent.');
      }catch(e){toast('Could not activate: '+e.message);}
     },'Spend & roll save');
    }catch(e){toast('Cannot use '+p.name+': '+e.message);}break;
   }
   if(p.effect==='heal'&&(pendingHealing?.characterId===activeId||activeRolls.some(g=>g.effect))){toast('Apply or dismiss the previous healing roll first.');break;}
   try{Action.verifyEconomy(character,p);}catch(e){toast(e.message);break;}
   const details=[p.activation,p.economyUnits>1?`spend ${p.economyUnits} ${Action.activationCost(p.activation)} pool units`:null,p.requiresAttack?'requires Attack first':null,p.requiresAttackComplete?'immediately after completing Attack':null,p.grantAttacks?`grant ${p.grantAttacks} ${p.grantAttackScope} bonus strikes`:null,p.grantResource?`restore ${p.grantAmount} ${p.grantResource}`:null,p.grantEconomy?`grant ${p.grantEconomy==='attack'?'attack-only':'unrestricted'} extra action`:null,p.cost?`spend ${p.cost} ${p.resource}`:'no tracked cost',p.roll?`roll ${p.roll.expression}`:'no configured roll',p.effect==='heal'?'offer HP healing after dice settle':'no automated effect',p.concentration?'concentration':null,p.durationRounds?`${p.durationRounds} rounds`:null].filter(Boolean);
   dialog('Use '+p.name+'?',details.join(' · ')+'. Continue only if appropriate under your table rules.',()=>{
    try{
     // Never spend resources while the active dice animation is unresolved.
     // Other dice groups can be in flight; a new roll only needs free resting dice.
     // Never charge a resource if the required dice cannot be prepared.
     if(p.roll&&!canPrepareDice(p.roll.count,p.roll.sides))throw Error('Not enough space for this throw. Clear unused dice first.');
     Action.commitUsage(character,p);Action.startEffect(character,p);save();render();
     const confirmed=p;
     if(confirmed.roll)queueRoll(confirmed.roll.expression,confirmed.name,confirmed.effect==='heal'?{kind:'heal',characterId:activeId,name:confirmed.name}:confirmed.effect==='damage'?{kind:'target-damage',characterId:activeId,targetId:currentTargetId(),damageType:confirmed.damageType,source:confirmed.name}:null);
     else toast(p.name+' used. Apply narrative effects with your DM.');
    }catch(e){toast('Could not use ability: '+e.message);}
   });break;
  }
  case 'incoming-attack-open':{
   try{const attackerId=currentTargetId(),kind=$('#incoming-attack-kind')?.value;
    const entry=Action.recordIncomingAttack(character,attackerId,kind);save();render();
    toast('Incoming '+kind+' attack from '+Action.targetById(character,attackerId).name+'. Confirm pre-roll reactions now.');}
   catch(e){toast(e.message);}break;
  }
  case 'incoming-attack-result':{
   try{const separator=arg.lastIndexOf(':'),id=arg.slice(0,separator),outcome=arg.slice(separator+1);
    if(!['hit','miss'].includes(outcome))throw Error('Unknown attack outcome.');
    const followup=Action.resolveIncomingAttack(character,id,outcome==='hit');save();render();
    toast(followup?'Confirmed ranged-weapon hit: eligible reactions may now be used.':'Incoming attack resolved; pre-roll event closed.');}
   catch(e){toast(e.message);}break;
  }
  case 'combat-event':try{Action.recordCombatEvent(character,arg,arg==='melee-hit'?currentTargetId():null);save();render();toast('Confirmed event: '+arg+'.');}catch(e){toast(e.message);}break;
  case 'combat-event-close':Action.dismissCombatEvent(character);save();render();break;
  case 'staged-save-roll':{
   try{const flow=Action.pendingWorkflow(character);
    if(!flow||flow.id!==arg||flow.kind!=='save-condition'||flow.status!=='await-save')throw Error('No pending ability saving throw.');
    const target=Action.targetById(character,flow.targetId);
    if(!target)throw Error('Original saving throw target was removed.');
    const ability=flow.save.ability,dc=flow.save.dc,expression=`1d20${sgn(num(target.saves?.[ability],0))}`;
    if(!queueRoll(expression,`${target.name} ${ability} save (DC ${dc})`,
     {kind:'target-save',characterId:activeId,targetId:flow.targetId,ability,dc,workflowId:flow.id},flow.targetId==='self'?'save':'untyped'))
     throw Error('Finish or cancel the prepared dice first.');
   }catch(e){toast(e.message);}break;
  }
  case 'staged-save-effect':{
   const flow=Action.pendingWorkflow(character);
   if(!flow||flow.id!==arg||flow.status!=='await-effect'){toast('No eligible failed-save effect.');break;}
   const target=Action.targetById(character,flow.targetId);
   dialog('Apply condition?',`Confirm with the DM: apply ${flow.onFailure.condition} to ${target?.name||'removed target'} after the verified failed ${flow.save.ability} save. Timing: ${flow.onFailure.expiration==='source-next-turn-end'?'end of your next turn':flow.onFailure.expiration==='target-next-turn-end'?"end of target's next turn (manual tracker)":'DM-managed'}.`,()=>{
    try{const applied=Action.finishWorkflowCondition(character,arg);save();render();toast('Applied '+applied.condition+'; '+(applied.grant.expiry?'expiry tracked for its source.':'DM controls expiry.'));}
    catch(e){toast('Could not apply condition: '+e.message);}
   },'Apply condition');break;
  }
  case 'staged-decline':{
   try{Action.declineWorkflow(character,arg);save();render();toast('Staged ability dismissed. Its committed activation cost remains spent.');}
   catch(error){toast(error.message);}break;
  }
  case 'staged-followup':{
   const flow=Action.pendingWorkflow(character);
   if(!flow||flow.id!==arg||flow.status!=='optional-followup'){toast('No eligible follow-up.');break;}
   if(pendingRoll){toast('Finish the prepared dice first.');break;}
   dialog('Catch and return missile?',`Confirm with the DM: damage was reduced to zero; the projectile is small enough to catch, one hand is free, and the return target is within range. Spend ${flow.followup.cost} ${flow.followup.resource} ONLY if you choose to throw back. No second reaction is spent.`,()=>{
    try{
     const attack=Action.previewWorkflowFollowup(character,arg,{catchable:true,freeHand:true});
     const cfg=Action.dice(attack.roll);
     if(!canPrepareDice(cfg.count,cfg.sides))throw Error('Not enough room for return dice.');
     const targetId=currentTargetId(),target=Action.targetById(character,targetId);
     if(!target)throw Error('Choose a valid return-attack target.');
     if(queueRoll(attack.roll,attack.label+' vs '+target.name,
      {kind:'target-attack',characterId:activeId,targetId,sourceId:attack.sourceId},'attack')){
      pendingRoll.workflowId=arg;
      pendingRoll.workflowConfirmation={catchable:true,freeHand:true};
      render();
      toast('Return dice ready. Ki will be spent only when thrown.');
     }
    }
    catch(error){toast(error.message);}
   },'Spend & throw','Decline');break;
  }
  case 'cast-spell':{
   const sp=character.spells?.[num(arg)];if(!sp)break;
   const choice=$(`[data-slot-choice="${num(arg)}"]`);
   const ref=References?.match('spell',sp.name,character.system_edition);
   let planned;try{planned=Action.planSpell(character,sp,choice?Number(choice.value):undefined,ref?.automation);}catch(e){toast('Cannot cast '+sp.name+': '+e.message);break;}
   if(planned.effect==='heal'&&(pendingHealing?.characterId===activeId||activeRolls.some(g=>g.effect))){toast('Apply or dismiss the previous healing roll first.');break;}
   try{Action.verifyEconomy(character,planned);}catch(e){toast(e.message);break;}
   const activeConcentration=Action.activeEffects(character).find(e=>e.concentration);
   const info=[planned.slotLevel?`spend level ${planned.slotLevel} slot`:'cantrip · no slot',planned.automatic?'verified 2014 SRD self effect':null,planned.roll?`roll ${planned.roll.expression}`:'no configured dice',planned.acBonus?`AC +${planned.acBonus}`:null,planned.bonusDice?`${planned.bonusMode==='sustained'?'While active':planned.charges+' use(s)'} × ${planned.bonusDice} for ${planned.bonusScopes.join(' / ')} (self only)`:null,planned.concentration?`concentration${activeConcentration?` (replaces ${activeConcentration.name})`:''}`:null,planned.durationRounds?`${planned.durationRounds} rounds`:null].filter(Boolean);
   dialog('Cast '+planned.name+'?',info.join(' · ')+'. Spell effects still require your table’s rulings.',()=>{
    try{
     // Other dice groups can be in flight; a new roll only needs free resting dice.
     const fresh=Action.planSpell(character,sp,planned.slotLevel,ref?.automation);
     if(fresh.roll&&!canPrepareDice(fresh.roll.count,fresh.roll.sides))throw Error('Not enough room for dice.');
     Action.commitUsage(character,fresh);Action.startEffect(character,fresh);save();render();
     if(fresh.roll)queueRoll(fresh.roll.expression,fresh.name,fresh.effect==='heal'?{kind:'heal',characterId:activeId,name:fresh.name}:fresh.effect==='damage'?{kind:'target-damage',characterId:activeId,targetId:currentTargetId(),damageType:fresh.damageType,source:fresh.name}:null);
     else toast('Cast '+fresh.name+'; resolve spell effects with your DM.');
    }catch(e){toast('Could not cast spell: '+e.message);}
   });break;
  }
  case 'toggle-encounter':Action.setEncounter(character,!Action.combat(character).active);abandonCharacterDice(activeId);save();render();break;
  case 'mark-turn-action':try{Action.markAction(character,arg);save();render();}catch(e){toast(e.message);}break;
  case 'economy-add-resource':try{
   Action.addResourcePool(character,$('#economy-new-resource')?.value,Number($('#economy-new-resource-max')?.value),$('#economy-new-resource-reset')?.value);
   save();render();toast('Custom resource pool created.');
  }catch(e){toast(e.message);}break;
  case 'configure-spell-slots':try{
   const level=Number(arg),row=$$('#page [data-slot-level]').find(el=>Number(el.dataset.slotLevel)===level);
   if(!row)throw Error('Spell slot editor is unavailable.');
   Action.configureSpellSlots(character,level,$('[data-slot-total]',row).valueAsNumber,$('[data-slot-remaining]',row).valueAsNumber);
   save();render();const settings=$('#page .spell-slot-settings');if(settings)settings.open=true;toast('Level '+level+' standard slots updated.');
  }catch(e){toast(e.message);}break;
  case 'economy-edit-resource':try{
   Action.configureResourcePool(character,$('#economy-edit-resource')?.value,$('#economy-edit-max')?.valueAsNumber,$('#economy-edit-current')?.valueAsNumber,$('#economy-edit-reset')?.value);
   save();render();toast('Resource pool updated.');
  }catch(e){toast(e.message);}break;
  case 'grant-economy':try{Action.grantEconomyAction(character,arg);save();render();}catch(e){toast(e.message);}break;
  case 'undo-turn':if(Action.undoTurn(character)){save();render();toast('Last turn advance undone.');}break;
  case 'effect-end':{
   if(Action.endEffect(character,arg)){save();render();toast('Effect ended.');}break;
  }
  case 'concentration-save':{
   const bonus=num(character.saves?.Constitution,0);
   queueRoll(`1d20${sgn(bonus)}`,'Concentration (CON) save · compare against DM DC',null,'save');break;
  }
  case 'action-roll':case 'action-damage':{
   const a=character.actions?.[num(arg)];if(!a)break;
   const expression=action==='action-roll'?a.roll:a.damage;if(!expression)break;
   const targetId=currentTargetId(),target=Action.targetById(character,targetId);
   const effect=action==='action-roll'?{kind:'target-attack',characterId:activeId,targetId}:
     {kind:'target-damage',characterId:activeId,targetId,damageType:selectedDamageType,source:a.name};
   queueRoll(expression,`${a.name} ${action==='action-roll'?'attack':'damage'} vs ${target.name}`,effect,action==='action-roll'?'attack':'untyped');break;
  }
  case 'dismiss-roll-heal':pendingHealing=null;updateTableResults();break;
  case 'apply-roll-heal':{
   if(!pendingHealing||pendingHealing.characterId!==activeId){toast('No healing roll for this character.');break;}
   try{const amount=Action.applyHealing(character,pendingHealing.amount);pendingHealing=null;save();render();updateTableResults();toast('Applied '+amount+' HP healing.');}
   catch(e){toast('Could not heal: '+e.message);}break;
  }
  case 'add-feature-note':character.features=character.features||[];character.features.push({title:'New feature',text:'Describe the feature and confirm its effects with your DM.',source:'manual'});editMode=true;save();render();const createdFeature=$$('#page .feature').at(-1);if(createdFeature)createdFeature.open=true;break;
  case 'add-spell':character.spells=character.spells||[];character.spells.push({id:'manual-spell-'+Vault.newId(),name:'New spell',source:'manual',casting_time:'',range:'',duration:'',components:'',save:'',notes:'Configure manually with your DM.',prepared:false,always_prepared:false,available:true,level:null,automation:'manual',roll:'',effect_kind:'none'});editMode=true;spellFilter='all';save();render();const createdSpell=Array.from(document.querySelectorAll('#page details[data-spell-id]')).at(-1);if(createdSpell)createdSpell.open=true;break;
  case 'remove-manual-spell':{
   const spell=character.spells?.[num(arg)];
   if(!Vault.isManualSpell(spell)){toast('Only manually added spells can be removed here.');break;}
   const spellId=spell.id;
   dialog('Remove manual spell?',`Delete ${spell.name} from this character? This cannot be undone. Active effects already in play must be ended separately.`,()=>{
    const matches=character.spells.map((sp,i)=>Vault.isManualSpell(sp)&&sp.id===spellId?i:-1).filter(i=>i>=0);
    if(matches.length!==1){toast('Spell identity changed or is ambiguous. Nothing removed.');return;}
    character.spells.splice(matches[0],1);save();render();toast('Manual spell removed.');
   },'Remove spell');
   break;
  }
  case 'add-item':character.inventory.unshift({id:'custom-'+Date.now(),name:'New item',quantity:1,weight:'',archived:false,notes:''});save();render();const createdItem=$('#page .workspace-entries details.work-entry');if(createdItem)createdItem.open=true;break;
  case 'toggle-archived':showArchived=!showArchived;render();break;
  case 'archive':{const r=character.inventory[num(arg)];if(r){r.archived=!r.archived;save();render();}break;}
  case 'roll-ability':{const a=character.abilities[arg];if(a)queueRoll(`1d20${sgn(a.modifier)}`,arg+' check',null,'ability-check');break;}
  case 'attack':case 'bonus-attack':{const a=character.attacks[num(arg)];if(a){const targetId=currentTargetId(),permission=action==='bonus-attack'?'bonus':'action',type=Action.attackType(a);
   try{Action.verifyAttack(character,permission,type);
    if(queueRoll(`1d20${sgn(a.bonus)}`,a.name+(permission==='bonus'?' bonus strike':' attack')+' vs '+Action.targetById(character,targetId).name,{kind:'target-attack',characterId:activeId,targetId,sourceId:'attack-'+num(arg),attackId:String(a.id||a.name),attackType:type,attackRange:Action.attackRange(a)},'attack')){pendingRoll.combatAttack=true;pendingRoll.attackPermission=permission;pendingRoll.attackType=type;}
   if(character.demo_id===window.TabletopDemo?.ID&&pendingRoll)render();
   }catch(e){toast(e.message);}}break;}
  case 'damage':{
   const index=num(arg),targetId=currentTargetId();
   const confirmed=lastAttackOutcome?.hit&&lastAttackOutcome.targetId===targetId&&lastAttackOutcome.sourceId==='attack-'+index;
   if(prepareAttackDamage(index,targetId,Boolean(confirmed&&lastAttackOutcome.critical)))lastAttackOutcome=null;
   break;
  }
  case 'clear-history':history.length=0;lastResult=null;updateTableResults();save();break;
  case 'clear-table':if(activeRolls.length||pointer?.down){toast('Finish the active dice first.');break;}dice=[];pendingRoll=null;queuedEffect=null;pointer=null;following=false;updateTableResults();toast('Table cleared');break;
  case 'advance-turn':{
    const expired=Action.advanceTurn(character);
    abandonCharacterDice(activeId);
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
     if(dice.length>=35){dice=dice.filter(d=>!created.includes(d));existingReady.forEach(d=>d.ready=true);toast('Table full (35 dice). Clear unused dice first.');return false;}
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
 pendingRoll={count:chosen.length,sides:null,modifier,label,expression,diceIds:chosen.map(d=>d.id)};
 following=follow;
 $('#dice-stage').classList.toggle('dice-following',Boolean(follow));
 $('#tray-help').textContent=`${expression} ready · ${follow?'click anywhere to grab the dice; drag and release to throw (Esc/right-click cancels)':'drag a die or press Throw'}`;
 toast(`${chosen.length} ${chosen.length===1?'die':'dice'} ready · ${expression}`);
 return true;
}
function canPrepareDice(count,sides){
 const reusable=dice.filter(d=>d.sides===sides&&d.sleeping&&!d.held&&!activeRolls.some(g=>g.diceIds.includes(d.id))).length;
 return Math.max(0,count-reusable)+dice.length<=35;
}
// One attack→damage preparation path for Auto, Guided and the manual Damage button.
// Never mutate HP, overwrite another prepared throw, or infer unlisted damage dice.
function prepareAttackDamage(index,targetId,critical=false){
 const attack=character.attacks?.[index],target=Action.targetById(character,targetId);
 if(!attack||!target)return false;
 if(pendingRoll){toast('Another roll is already prepared. Finish or clear it before damage.');return false;}
 const match=/\d+d\d+(?:[+-]\d+)?/i.exec(attack.damage||'');
 if(!match){toast('Configure damage dice for '+attack.name+' before rolling damage.');return false;}
 try{
  const matchingTypes=Action.DAMAGE_TYPES.filter(t=>t!=='untyped'&&new RegExp('\\b'+t+'\\b','i').test(attack.damage));
  const damageType=matchingTypes.length===1?matchingTypes[0]:selectedDamageType;
  const expression=critical?Action.criticalDamageExpression(match[0]):Action.dice(match[0]).expression;
  return queueRoll(expression,attack.name+(critical?' critical':'')+' damage vs '+target.name,
   {kind:'target-damage',characterId:activeId,targetId,damageType,source:attack.name});
 }catch(error){toast(error.message);return false;}
}
function attackFollowup(result,group,knownHit){
 const source=group.effect?.sourceId||'';
 const match=/^attack-(\d+)$/.exec(source);
 if(!match)return;
 const index=Number(match[1]),targetId=group.effect.targetId;
 const sourceAttack=character.attacks?.[index];
 if(!sourceAttack||String(sourceAttack.id||sourceAttack.name)!==group.effect.attackId||
    Action.attackType(sourceAttack)!==group.effect.attackType||Action.attackRange(sourceAttack)!==group.effect.attackRange){
  toast('The original attack configuration changed. Confirm outcomes manually.');return;
 }
 // Normal d20 uses the primary physical face; advantage/disadvantage expose
 // the selected natural explicitly. Both must preserve natural-20 damage.
 const natural=Number.isInteger(result.natural)?result.natural:result.parts?.[0];
 const mode=Action.combat(character).economy.mode;
 if(mode==='manual')return;
 const applyHit=()=>{
  // A confirmed hit is eligible for event-bound abilities only with a
  // deliberately classified melee attack against another creature.
  try{
   const event=Action.recordResolvedAttack(character,{
    rollId:group.rollId,sourceIndex:index,attackId:group.effect.attackId,
    targetId,attackType:group.effect.attackType,attackRange:group.effect.attackRange,
    total:result.total,natural,adjudication:mode==='guided'||knownHit===null?'guided':'auto'
   });
   if(event){save();render();toast('Confirmed melee hit · eligible on-hit abilities are available.');}
  }catch(error){toast('Attack trigger: '+error.message);}
  lastAttackOutcome={targetId,sourceId:source,critical:natural===20,hit:true};
  if(prepareAttackDamage(index,targetId,natural===20))lastAttackOutcome=null;
  else toast('Hit confirmed. Use the Damage button when the tabletop is free.');
 };
 if(mode==='guided'||knownHit===null){
  const target=Action.targetById(character,targetId);
  dialog('Did the attack hit?',`${result.label}: ${result.total} to hit${target?' against '+target.name:''}. Confirm with your DM.`,applyHit,'Hit','Miss');
 }else if(knownHit)applyHit();
}
function queueRoll(expr,label,effect=null,rollKind='untyped'){
 try{
   const p=parseExpression(expr);
   const choice=$('#d20-mode')?.value||'normal';
   const mode=p.sides===20&&p.count===1?choice:'normal';
   const primaryCount=mode==='normal'?p.count:2;
   const reserved=activeRolls.flatMap(group=>(group.bonuses||[]).map(b=>b.effectId));
   const bonuses=Action.compatibleBonuses(character,rollKind,reserved);
   const specs=[...Array(primaryCount).fill(p.sides),...bonuses.flatMap(b=>Array(b.count).fill(b.sides))];
   // Do not replace a prepared roll or reserve an effect if there isn't room.
   if(specs.length>20)throw Error('Too many dice for one throw.');
   if(!prepareDice(specs,p.modifier,label,p.expression,true))return false;
   pendingRoll.characterId=activeId;
   pendingRoll.d20Mode=mode;
   pendingRoll.primaryCount=primaryCount;
   pendingRoll.bonuses=bonuses;
   pendingRoll.rollKind=rollKind;
   queuedEffect=effect;
   if(bonuses.length)toast(`${label} includes ${bonuses.map(b=>b.name+' '+b.expression).join(', ')} · throw together`);
   return true;
 }catch(e){toast(e.message);return false;}
}
function addReadyDie(sides){
 if(pendingRoll)queuedEffect=null; // Manual dice edits invalidate a linked healing roll.
 following=false;$('#dice-stage').classList.remove('dice-following');
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
 pendingRoll={count:all.length,sides:null,modifier:0,expression,label:'Manual dice',diceIds:all.map(d=>d.id)};
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
  dialog('Update existing character?',`This PDF matches ${match.character.name}. Imported stats and equipment will update, while current HP, resources, preparation, notes, manual abilities and manually added spells are preserved. ${Vault.importSummary(match.character,newCharacter).replace(/\n/g,' · ')}`,install);
 }else install();
}
function acceptVaultBackup(raw){
 const incoming=Vault.normalize(raw);
 dialog('Restore full character vault?',`Restore ${incoming.characters.length} saved characters? This will replace the current local vault. Export a backup of your existing characters first.`,async()=>{
  try{await persistVault();vaultData=incoming;vaultDirty=true;await persistVault();selectLoadedCharacter();closeVault();toast('Vault restored');}
  catch(ex){toast('Vault restore failed: '+ex.message);}
 });
}
document.addEventListener('submit',e=>{
 if(e.target.id!=='target-add-form')return;
 e.preventDefault();const form=e.target;
 try{const t=Action.addTarget(character,{name:form.elements.namedItem('name').value,ac:form.elements.namedItem('ac').value,hp:form.elements.namedItem('hp').value});
  selectedTargetId=t.id;save();render();toast('Target added: '+t.name);
 }catch(error){toast('Cannot add target: '+error.message);}
});
document.addEventListener('click',e=>{
 const nav=e.target.closest('[data-view]');if(nav){setView(nav.dataset.view);return;}
 const roll=e.target.closest('[data-roll]');if(roll){queueRoll(roll.dataset.roll,roll.dataset.rollLabel,null,roll.dataset.rollKind||'untyped');return;}
 const die=e.target.closest('[data-die]');if(die){addReadyDie(num(die.dataset.die));return;}
 const act=e.target.closest('[data-action]');if(act){handleAction(act.dataset.action,act.dataset.arg||'');return;}
});
document.addEventListener('change',e=>{
 const el=e.target;
 if(el.id==='rules-profile'){
  const next=el.value;const previous=character.rules_profile||'manual';
  if(next===previous)return;
  if(next!=='srd-2014'){character.rules_profile='manual';save();render();toast('Manual rules selected; existing effects remain until ended.');return;}
  if(/2024|5\.5|srd.?5\.2/i.test(character.system_edition||'')){toast('This character is marked as 2024. 2014 SRD automation is not compatible.');el.value=previous;return;}
  el.value=previous;
  dialog('Use D&D 2014 SRD automation?', 'Enable all verified 2014 SRD effect profiles for this character. Unsupported spells, imported values, homebrew and existing active effects remain unchanged.',()=>{character.rules_profile='srd-2014';if(!character.system_edition||character.system_edition==='unspecified')character.system_edition='dnd-2014';save();render();toast('Qualified 2014 SRD spell effects enabled.');});
  return;
 }
 if(el.id==='economy-edit-resource'){
   const r=character.resources?.[el.value];
   if(r){$('#economy-edit-max').value=r.max;$('#economy-edit-current').value=r.current;$('#economy-edit-reset').value=['manual','turn','short rest','long rest'].includes(r.reset)?r.reset:'manual';}
   return;
  }
  if(el.id==='combat-mode'){try{const previous=Action.combat(character).economy.mode;Action.setCombatMode(character,el.value);if(previous!==el.value)abandonCharacterDice(activeId);save();render();}catch(error){toast(error.message);render();}return;}
 if(el.dataset.economyAuto!==undefined){try{Action.setAutoEconomy(character,el.checked);save();render();}catch(error){toast(error.message);render();}return;}
 if(el.dataset.economyConfig){try{Action.configureEconomy(character,el.dataset.economyConfig,Number(el.value));save();render();}catch(error){toast(error.message);render();}return;}
 if(el.dataset.actionRequiresAttack!==undefined){const a=character.actions?.[num(el.dataset.actionRequiresAttack)];if(a){a.requires_attack=el.checked;a.source='manual';save();render();}return;}
 if(el.dataset.actionRequiresAttackComplete!==undefined){const a=character.actions?.[num(el.dataset.actionRequiresAttackComplete)];if(a){a.requires_attack_complete=el.checked;a.source='manual';save();render();}return;}
 if(el.dataset.attackType!==undefined){const a=character.attacks?.[num(el.dataset.attackType)];if(a){a.attack_type=el.value;save();render();}return;}
 if(el.dataset.attackRange!==undefined){const a=character.attacks?.[num(el.dataset.attackRange)];if(a){a.attack_range=el.value;save();render();}return;}
 if(el.dataset.effectAuto!==undefined){
  try{Action.setAutoUse(character,el.dataset.effectAuto,el.checked);save();toast((el.checked?'Armed ':'Paused ')+Action.activeEffects(character).find(e=>e.id===el.dataset.effectAuto)?.name);}
  catch(error){toast(error.message);render();}return;
 }
 if(el.id==='combat-target'){selectedTargetId=Action.targetById(character,el.value)?el.value:'self';render();return;}
 if(el.id==='damage-type'){selectedDamageType=el.value;return;}
 if(el.dataset.targetStat){try{Action.updateTargetStat(character,currentTargetId(),el.dataset.targetStat,el.value);save();render();}catch(e){toast(e.message);render();}return;}
 if(el.dataset.targetTrait){try{Action.setTargetTraits(character,currentTargetId(),el.dataset.targetTrait,el.value);save();render();}catch(e){toast(e.message);render();}return;}

 if(el.id==='catalog-level'){catalogLevel=el.value;filterCatalogEntries();return;}
 if(el.dataset.resourceEdit){try{Action.setResourceCurrent(character,el.dataset.resourceEdit,el.valueAsNumber);save();render();}catch(error){toast(error.message);render();}return;}
 if(el.dataset.modType){
  const type=el.dataset.modType,key=el.dataset.modName;
  if(type==='ability' && character.abilities?.[key])character.abilities[key].modifier=num(el.value);
  else if((type==='saves'||type==='skills') && Object.prototype.hasOwnProperty.call(character[type],key))character[type][key]=num(el.value);
  save();render();return;
 }
 if(el.dataset.input){
  const value=el.value;
  try{setPath(el.dataset.input,value);}catch(error){toast(error.message);render();return;}
  if(/^actions\.\d+\.trigger_event$/.test(el.dataset.input)){
   const a=character.actions?.[num(el.dataset.input.split('.')[1])];
   if(a){delete a.event_save_ability;delete a.event_damage_type;delete a.event_min_damage;delete a.event_min_hp_loss;save();render();}
   return;
  }
  if(/^actions\.\d+\.event_(?:save_ability|damage_type|min_damage|min_hp_loss)$/.test(el.dataset.input)){render();return;}
  // Qty 0 moves to archived, but does not delete imported records.
  if(/^inventory\.\d+\.quantity$/.test(el.dataset.input)){
    const i=num(el.dataset.input.split('.')[1]);character.inventory[i].archived=num(value)<=0;save();render();return;
  }
  // Keep the active disclosure and textarea caret while editing item text or notes.
  if(/^inventory\.\d+\.(?:name|weight|notes)$/.test(el.dataset.input) || /^actions\.\d+\./.test(el.dataset.input) || el.dataset.input==='notes' || el.dataset.input==='homebrew_notes')return;
  render();
 }
 if(el.dataset.actionConcentration!==undefined){const a=character.actions?.[num(el.dataset.actionConcentration)];if(a){a.concentration=el.checked;a.source='manual';save();}return;}
 if(el.dataset.spellModifier!==undefined){const sp=character.spells?.[num(el.dataset.spellModifier)];if(sp){
  const raw=el.value.trim();
  if(raw===''){delete sp.spellcasting_modifier;save();return;}
  const fixed=Number(raw);
  if(!/^[+-]?\d+$/.test(raw)||!Number.isSafeInteger(fixed)||fixed< -30||fixed>30){
   toast('Spellcasting modifier override must be a whole number from -30 to 30.');render();return;
  }
  sp.spellcasting_modifier=fixed;save();}return;}
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
   <div class="welcome-steps"><button class="welcome-button" type="button" id="welcome-create">Create a character</button><button class="welcome-button" type="button" id="welcome-demo">Play with demo fighter</button><label for="pdf-file" class="welcome-button">Choose character PDF</label>
   <button class="button subtle" type="button" id="welcome-json">Restore JSON backup</button><button class="button subtle" type="button" id="welcome-vault">Character vault</button></div>
   <p class="welcome-note">Your character remains in your browser on this device. PDF support is experimental: custom rules, spells and actions may need review. Export JSON backups regularly.</p>
   <details><summary>What is available in this alpha?</summary><p>Interactive character stats, skills, saves, inventory, spells, resources and a persistent dice table. Some mechanics and PDF variations are not fully automated.</p></details>
 </section>`;
 $('#welcome-create').addEventListener('click',showCharacterCreator);
 $('#welcome-demo').addEventListener('click',playDemo);
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
function cancelPreparedRoll(){
 if(!pendingRoll)return false;
 const ids=new Set(pendingRoll.diceIds||[]);
 for(const die of dice)if(ids.has(die.id)){die.ready=false;die.held=false;die.sleeping=true;die.z=DP.height(die);}
 pendingRoll=null;queuedEffect=null;following=false;
 $('#dice-stage')?.classList.remove('dice-following');
 if(character?.demo_id===window.TabletopDemo?.ID)render();
 $('#tray-help').textContent='Prepared roll canceled · no action or resource spent';
 return true;
}
// Physics dice are transient UI work, not a second gameplay ledger. When a
// character, encounter, turn, or mode changes, no in-flight result may be
// credited later by switching back or undoing an interrupted turn. Costs
// already committed at launch remain spent, exactly as for canceled dice.
function abandonCharacterDice(characterId){
 if(pendingRoll?.characterId===characterId)cancelPreparedRoll();
 const abandoned=activeRolls.filter(group=>group.characterId===characterId);
 if(abandoned.length){
  const ids=new Set(abandoned.flatMap(group=>group.diceIds));
  for(const die of dice)if(ids.has(die.id)){
   die.rolling=false;die.held=false;die.sleeping=true;die.ready=false;
  }
  activeRolls=activeRolls.filter(group=>group.characterId!==characterId);
  activeRoll=activeRolls.at(-1)||null;
 }
 pointer=null;following=false;
 document.body.classList.remove('dice-dragging');
 $('#dice-stage')?.classList.remove('dice-following');
}
function initDiceCanvas(){
 canvas=$('#dice-canvas');ctx=canvas.getContext('2d');
 const stage=$('#dice-stage');
 const relative=e=>{const r=stage.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};};
 // Canvas stays visually above the sheet without blocking all controls.
 // Capture events on the tabletop ancestor, and intercept ONLY a visible die hit.
 // This also works when a die lies above a button, input or scrollable panel.
 const findDie=(x,y)=>[...dice].reverse().find(d=>DP.hitTest(d,x,y,lastDimensions.w,lastDimensions.h,Math.max(10,d.r*.23)));
 const cancelGrab=()=>{
  if(!pointer?.down)return false;
  const held=pointer;pointer=null;document.body.classList.remove('dice-dragging');
  try{stage.releasePointerCapture(held.id);}catch(_){}
  held.selected.forEach((d,i)=>{d.held=false;const before=held.prior[i];
   if(before){Object.assign(d,{x:before.x,y:before.y,q:before.q,v:before.v,w:before.w,z:before.z,
    rolling:before.rolling,sleeping:before.sleeping,restTime:before.restTime});}
  });
  return true;
 };
 const cancelGesture=()=>{
  const hadPrepared=Boolean(pendingRoll);
  if(pointer?.down)cancelGrab();
  if(hadPrepared)cancelPreparedRoll();
  return hadPrepared;
 };
 const releaseGrab=(vx,vy,shake)=>{
   if(!pointer?.down)return;
   const held=pointer;pointer=null;document.body.classList.remove('dice-dragging');
   try{stage.releasePointerCapture(held.id);}catch(_){}
   if(held.mode==='existing'){
     // Catch and rethrow an in-flight die; its original roll still owns its result.
     held.selected.forEach(d=>{d.held=false;DP.launch(d,vx,vy,shake);});
   } else if(held.mode==='manual'){
     startDiceGroup(held.selected,{modifier:0,label:`d${held.selected[0].sides}`,expression:`1d${held.selected[0].sides}`},vx,vy,shake,null);
   } else beginThrow(vx||120,vy||45,shake||80);
   lastDiceGesture={time:performance.now(),x:held.x,y:held.y};
 };
 stage.addEventListener('click',e=>{
   if(!lastDiceGesture)return;
   const recent=performance.now()-lastDiceGesture.time<600;
   const near=Math.hypot(e.clientX-(stage.getBoundingClientRect().left+lastDiceGesture.x),e.clientY-(stage.getBoundingClientRect().top+lastDiceGesture.y))<250;
   if(recent&&near){e.preventDefault();e.stopPropagation();}
   lastDiceGesture=null;
 },true);
 stage.addEventListener('contextmenu',e=>{
   e.preventDefault();e.stopPropagation();
   cancelGesture();
 });
 // Pointer Events do not emit a second pointerdown if a second mouse button
 // is pressed while the primary button remains held. mousedown does.
 document.addEventListener('mousedown',e=>{
   if(e.button!==2||!pointer?.down)return;
   e.preventDefault();e.stopPropagation();
   cancelGesture();
 },true);
 stage.addEventListener('pointerdown',e=>{
   if(pointer?.down||e.button!==0)return;
   // Deliberately prioritized controls (e.g. the practice guide) must remain
   // clickable even when a resting physical die overlaps their hit area.
   if(e.target.closest?.('[data-pointer-priority="control"]'))return;
   const {x,y}=relative(e);pointerPosition={x,y};
   const followingGroup=following&&pendingRoll?dice.filter(d=>d.ready):[];
   // Mixed dice orbit the cursor; its exact position can fall between the dice.
   // Catch that click before underlying buttons rather than requiring a die hit.
   const hit=followingGroup.length?followingGroup[0]:findDie(x,y);
   if(!hit)return;
   e.preventDefault();e.stopPropagation();
   hoverDieId=hit.id;stage.classList.remove('die-hover');
   stage.setPointerCapture(e.pointerId);
   following=false;stage.classList.remove('dice-following');
   const active=activeRolls.find(g=>g.diceIds.includes(hit.id));
   // A pending automatic roll keeps its own ready dice when an unrelated die
   // is grabbed. No one-roll global lockout and no lost attached heal effect.
   const mode=followingGroup.length?'prepared':active?'existing':hit.ready&&pendingRoll?'prepared':'manual';
   const selected=mode==='prepared'?followingGroup.length?followingGroup:dice.filter(d=>d.ready):[hit];
   const prior=selected.map(d=>({sleeping:d.sleeping,rolling:d.rolling,v:[...d.v],w:[...d.w],z:d.z,restTime:d.restTime,x:d.x,y:d.y,q:[...d.q]}));
   selected.forEach(d=>{d.held=true;d.sleeping=true;});
   pointer={id:e.pointerId,x,y,dx:0,dy:0,shake:0,down:true,lastTime:performance.now(),selected,mode,
    offsets:selected.map(d=>({x:d.x-x,y:d.y-y})),prior};
   document.body.classList.add('dice-dragging');
   $('#tray-help').textContent='Drag to shake · release to throw · right-click cancels';
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
   pointer.x=relative(e).x;pointer.y=relative(e).y;
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
 document.addEventListener('keydown',e=>{
   if(e.key!=='Escape'||(!pendingRoll&&!pointer?.down))return;
   if(!cancelGesture())return;
   e.preventDefault();toast('Prepared roll canceled; no combat costs spent.');
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
 // Prepared combat rolls belong to the character that created them.
 if((p.combatAttack||p.workflowId)&&p.characterId!==activeId){
  toast('This roll belongs to a different character. Prepare it again.');return false;
 }
 // Committing an optional staged follow-up occurs at throw, not preparation.
 if(p.workflowId){
  try{Action.finishWorkflow(character,p.workflowId,p.workflowConfirmation);save();render();}
  catch(error){toast(error.message);return false;}
 }
 // An Attack action is spent only when its physical dice actually launch.
 // Canceling/replacing prepared dice never consumes an action or attack.
 if(p.combatAttack){
  try{Action.commitAttack(character,p.attackPermission||'action',p.attackType||'unspecified');save();render();}
  catch(error){toast(error.message);return false;}
 }
 selected.forEach(d=>{
  d.held=false;d.ready=false;d.rolling=true;
  DP.launch(d,vx+(DP.random()-.5)*170,vy+(DP.random()-.5)*150,shake);
 });
 const group={diceIds:selected.map(d=>d.id),primaryCount:p.primaryCount??selected.length,bonuses:(p.bonuses||[]).map(b=>({...b})),rollKind:p.rollKind||'untyped',
  characterId:activeId,modifier:p.modifier,label:p.label,expression:p.expression,effect,d20Mode:p.d20Mode||'normal',
  rollId:'attack-roll-'+Date.now().toString(36)+'-'+(++nextResolutionId).toString(36)};
 activeRolls.push(group);activeRoll=activeRolls.at(-1)||null;
 $('#tray-help').textContent='Rolling · grab another die at any time';
 return true;
}
function beginThrow(vx=120,vy=45,shake=80){
 if(!pendingRoll)return;
 const p=pendingRoll,selected=(p.diceIds||[]).map(id=>dice.find(d=>d.id===id)).filter(d=>d&&d.ready);
 if(!selected.length)return;
 const effect=queuedEffect;
 if(effect?.workflowId||effect?.sequenceId){
  try{
   const flow=Action.pendingWorkflow(character);
   if(!flow||flow.id!==(effect.workflowId||effect.sequenceId)||
     flow.status!==(effect.workflowId?'await-save':'await-roll'))
    throw Error('The staged ability was interrupted; prepare a new roll if it is still available.');
  }catch(error){cancelPreparedRoll();toast(error.message);return;}
 }
 if(startDiceGroup(selected,p,vx,vy,shake,effect)){
   queuedEffect=null;pendingRoll=null;following=false;$('#dice-stage').classList.remove('dice-following');
   if(character?.demo_id===window.TabletopDemo?.ID)render();
 }
}
function finishRollIfSettled(){
 if(!activeRolls.length)return;
 const completed=[];
 let effectsChanged=false;
 const attackFollowups=[];
 for(const group of activeRolls){
   const selected=group.diceIds.map(id=>dice.find(d=>d.id===id)).filter(Boolean);
   if(!selected.length||selected.length!==group.diceIds.length||!selected.every(d=>d.sleeping&&!d.held))continue;
   if(group.characterId!==activeId){
    // Never credit old character rolls to another character's history or effects.
    completed.push(group);
    continue;
   }
   const values=selected.map(d=>{
     const face=DP.faceValue(d);
     return d.sides===100&&face===0?100:face;
   });
   const primary=values.slice(0,group.primaryCount),extras=values.slice(group.primaryCount);
   const selectedD20=group.d20Mode&&group.d20Mode!=='normal'?Action.resolveD20(primary,group.modifier,group.d20Mode):null;
   const baseTotal=selectedD20?selectedD20.total:primary.reduce((sum,n)=>sum+n,0)+group.modifier;
   // The bonus effect is checked again when the result is committed. A spell
   // ended during the throw cannot secretly add a bonus or consume a charge.
   const resolvedBonuses=[];
   let offset=0;
   for(const bonus of group.bonuses||[]){
     const faces=extras.slice(offset,offset+bonus.count);offset+=bonus.count;
     if(faces.length!==bonus.count)continue;
     if(group.characterId!==activeId)continue;
     try{
       // Consume only on completed physical rolls; an abandoned prepared roll
       // never spends the charge. This also ends Guidance concentration once.
       Action.resolveRollBonus(character,bonus.effectId,group.rollKind,bonus.instanceId);
       effectsChanged=true;
       resolvedBonuses.push({name:bonus.name,expression:bonus.expression,parts:faces,total:faces.reduce((sum,n)=>sum+n,0)});
     }catch(e){toast(`${bonus.name} expired before this roll finished; bonus ignored.`);}
   }
   const bonusTotal=resolvedBonuses.reduce((sum,b)=>sum+b.total,0);
   const result={label:group.label,total:baseTotal+bonusTotal,baseTotal,bonuses:resolvedBonuses,
     parts:primary,modifier:group.modifier,expression:group.expression,
     ...(selectedD20?{mode:selectedD20.mode,natural:selectedD20.natural}:{})};
   lastResult=result;history.unshift(result);history.splice(60);
   if(group.effect?.characterId===activeId){
     if(group.effect.kind==='heal'&&result.total>=0)pendingHealing={characterId:activeId,name:group.effect.name,amount:result.total};
     if(group.effect.kind==='target-attack'){
       try{
        const target=Action.targetById(character,group.effect.targetId);
        if(target){
         const natural=selectedD20?selectedD20.natural:result.parts[0];
         let knownHit=null;
         try{
          const verdict=Action.evaluateAttack(result.total,Action.effectiveAC(character,group.effect.targetId),natural);
          knownHit=verdict.hit;
          result.outcome=verdict.critical?'CRITICAL HIT':verdict.hit?'HIT':'MISS';
          toast(`${target.name}: ${result.outcome} vs AC ${verdict.targetAC}. Confirm before applying damage.`);
         }catch(error){toast('AC unknown: confirm hit/miss with the DM.');}
         lastAttackOutcome={targetId:group.effect.targetId,sourceId:group.effect.sourceId||null,critical:natural===20,hit:knownHit};
         if(group.effect.sourceId)attackFollowups.push({result,group,knownHit});
        }
       }catch(e){toast('Attack outcome: '+e.message);}
     }
     if(group.effect.kind==='target-save'){
       try{
        const verdict=Action.recordResolvedSave(character,{
         rollId:group.rollId,targetId:group.effect.targetId,ability:group.effect.ability,
         total:result.total,dc:group.effect.dc,workflowId:group.effect.workflowId});
        result.outcome=verdict.outcome==='success'?'SAVE SUCCEEDED':'SAVE FAILED';
        toast(`${Action.targetById(character,group.effect.targetId)?.name||'Target'}: ${result.outcome} vs DC ${verdict.dc}.`);
        effectsChanged=true;
       }catch(e){toast('Save result not recorded: '+e.message);}
     }
     if(group.effect.kind==='target-damage'&&result.total>=0){
       const targetId=group.effect.targetId;
       if(Action.targetById(character,targetId))pendingDamage.push({id:String(++nextResolutionId),characterId:activeId,targetId,
         source:group.effect.source||group.label,type:group.effect.damageType||'untyped',amount:result.total});
     }
     if(group.effect.kind==='staged-reduction'){
       try{const outcome=Action.resolveWorkflow(character,group.effect.sequenceId,result.total);
        toast(outcome.eligible?'Damage reduced to zero. Optional counterattack available if the missile is catchable.':`Damage reduced by ${result.total}; ${outcome.remaining} damage remains. Apply remaining HP damage with your DM.`);
        effectsChanged=true;}
       catch(error){toast('Staged ability: '+error.message);}
     }
     if(group.effect.kind==='concentration'){
       const resolution=Action.resolveConcentrationCheck(character,group.effect.checkId,result.total);
       if(resolution){toast(resolution.success?'Concentration maintained.':'Concentration broken: '+resolution.effectName);render();}
     }
   }
   completed.push(group);
   $('#tray-help').textContent=`${group.label}: ${result.baseTotal}${result.bonuses.length?' + '+result.bonuses.map(b=>`${b.name} ${b.parts.join('+')}`).join(' + '):''} = ${result.total}`;
 }
 if(!completed.length)return;
 activeRolls=activeRolls.filter(g=>!completed.includes(g));activeRoll=activeRolls.at(-1)||null;
 updateTableResults();save();
 if(effectsChanged||character?.demo_id===window.TabletopDemo?.ID)render(); // Repaint verified buffs and demo guidance after settlement.
 // Finishing a throw must not trample a player-prepared roll or an open dialog.
 if(!pendingRoll&&attackFollowups.length===1){const next=attackFollowups[0];attackFollowup(next.result,next.group,next.knownHit);}
 else if(attackFollowups.length>1)toast('Multiple attacks settled; use Damage manually for the appropriate hit.');
}
function updateTableResults(){
 const result=$('#last-result'),list=$('#table-history'),count=$('#history-count'),collapsed=$('#collapsed-result');
 if(!result)return;
 result.innerHTML=lastResult?`<strong>${esc(lastResult.total)}</strong> <span>${esc(lastResult.label)} · ${esc(lastResult.parts.join(' + '))} ${lastResult.modifier?sgn(lastResult.modifier):''} ${lastResult.mode&&lastResult.mode!=='normal'?`· ${esc(lastResult.mode)} (${esc(lastResult.natural)})`:''} ${(lastResult.bonuses||[]).map(b=>`· ${esc(b.name)} ${esc(b.parts.join('+'))}`).join(' ')} ${lastResult.outcome?`· ${esc(lastResult.outcome)}`:''}</span>`:
 'Pick a die, drag to shake, then release. Dice remain on the table.';
 if(collapsed)collapsed.textContent=lastResult?`${lastResult.total} · ${lastResult.label}`:'Ready';
 count.textContent=String(history.length);
 list.innerHTML=history.slice(0,30).map(h=>`<li>${esc(h.label)} <b>${esc(h.total)}</b> <small>${esc(h.expression)}${(h.bonuses||[]).map(b=>' + '+esc(b.name)+' '+esc(b.expression)).join('')}</small></li>`).join('');
 const effect=$('#roll-effect');if(effect){
  const heal=pendingHealing&&pendingHealing.characterId===activeId?`<div class="pending-resolution"><span>${esc(pendingHealing.name)}: ${esc(pendingHealing.amount)} HP healing ready</span> ${button('Apply to HP','apply-roll-heal','','button primary mini')} ${button('Dismiss','dismiss-roll-heal','','button mini subtle')}</div>`:'';
  const recent=Action.recentSave(character);
  const damages=pendingDamage.filter(x=>x.characterId===activeId).map(d=>{
   const target=Action.targetById(character,d.targetId),matching=recent?.targetId===d.targetId;
   return target?`<div class="pending-resolution"><strong>${esc(d.amount)} ${esc(d.type)} → ${esc(target.name)}</strong>
     <label>Save rule (explicitly associate; never automatic) <select class="input" data-pending-save="${esc(d.id)}" data-save-id="${esc(matching?recent.id:'')}"><option value="none">No save reduction</option>
     ${matching?`<option value="half">${esc(recent.ability)} save DC ${recent.dc} (${esc(recent.outcome)}) · half on success</option><option value="negates">${esc(recent.ability)} save DC ${recent.dc} (${esc(recent.outcome)}) · negates on success</option>`:''}</select></label>
     ${button('Review & apply','apply-target-damage',d.id,'button mini primary')} ${button('Dismiss','dismiss-target-damage',d.id,'button mini subtle')}</div>`:'';
  }).join('');
  effect.innerHTML=heal+damages+(recent?`<p class="save-result-note">Last save: ${esc(recent.ability)} ${esc(recent.outcome)} vs DC ${recent.dc} (${esc(Action.targetById(character,recent.targetId)?.name||'removed target')}); damage association requires confirmation.</p>`:'');
 }
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
