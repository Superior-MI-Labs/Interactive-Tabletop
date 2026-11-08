/* Interactive Tabletop vault v1. One D&D character document per entry.
 * Storage adapters own persistence; this module owns migration and reconciliation.
 * Future systems can use the same vault contract without introducing rules here.
 */
(function(root){'use strict';
const SlotPools=root.DndSlots||(typeof require==='function'?require('./dnd-slots.js'):null);
if(!SlotPools)throw Error('D&D slot module was not loaded.');
const VERSION=1, DB='smi-interactive-tabletop', STORE='data', KEY='vault';
const copy=x=>JSON.parse(JSON.stringify(x));
const canonical=x=>String(x??'').toLowerCase().replace(/[^a-z0-9]/g,'');
const validCharacter=x=>Boolean(x&&typeof x==='object'&&x.schema_version===1&&typeof x.name==='string'&&x.name.trim()&&x.hp&&Array.isArray(x.inventory));
function newId(){return (root.crypto?.randomUUID?.()||('char-'+Date.now()+'-'+Math.random().toString(36).slice(2)));}
const empty=()=>({schema_version:VERSION,active_id:null,characters:[]});
function normalize(raw){
 if(!raw || raw.schema_version!==VERSION || !Array.isArray(raw.characters))throw Error('Unsupported character vault backup.');
 const ids=new Set();
 const characters=raw.characters.map(entry=>{
  if(typeof entry?.id!=='string'||!entry.id||ids.has(entry.id)||!validCharacter(entry.character))throw Error('Invalid or duplicate character in vault.');
  ids.add(entry.id);
  return {id:entry.id,character:{...copy(entry.character),resources:SlotPools.normalize(entry.character.resources)},updated_at:entry.updated_at||new Date().toISOString()};
 });
 return {schema_version:VERSION,active_id:ids.has(raw.active_id)?raw.active_id:(characters[0]?.id||null),characters};
}
function migrateLegacy(old){
 if(!validCharacter(old))return empty();
 return normalize({schema_version:VERSION,active_id:'legacy-character',characters:[{id:'legacy-character',character:old,updated_at:new Date().toISOString()}]});
}
// First-time and explicit demo creation use the same vault upsert path as
// imported sheets. Never duplicate or overwrite a user's existing demo.
function addDemo(vault){
 const demo=root.TabletopDemo;
 if(!demo||typeof demo.create!=='function')throw Error('Demo character is unavailable.');
 const found=vault.characters.find(entry=>entry.character?.demo_id===demo.ID);
 if(found){vault.active_id=found.id;return {id:found.id,created:false};}
 const sample=demo.create();
 if(!validCharacter(sample)||sample.demo_id!==demo.ID)throw Error('Invalid demo character.');
 const id=newId();upsert(vault,id,sample);return {id,created:true};
}
// Reset is an explicit, confirmed overwrite of the demo entry only.
function resetDemo(vault,id){
 const entry=vault.characters.find(x=>x.id===id);
 const demo=root.TabletopDemo;
 if(!entry||!demo||entry.character?.demo_id!==demo.ID)throw Error('Only a demo character can be reset.');
 const fresh=demo.create();
 if(!validCharacter(fresh)||fresh.demo_id!==demo.ID)throw Error('Invalid demo character.');
 upsert(vault,id,fresh);return fresh;
}
function upsert(vault,id,character){
 if(!validCharacter(character))throw Error('Invalid character sheet.');
 const entry=vault.characters.find(c=>c.id===id);
 if(entry){entry.character=character;entry.updated_at=new Date().toISOString();}
 else vault.characters.push({id,character,updated_at:new Date().toISOString()});
 vault.active_id=id;
 return character;
}
function identityMatches(old,fresh){
 if(canonical(old?.name)!==canonical(fresh?.name)||!canonical(fresh?.name))return false;
 if(old.player&&fresh.player)return canonical(old.player)===canonical(fresh.player);
 return !old.species||!fresh.species||canonical(old.species)===canonical(fresh.species);
}
function findMatch(vault,fresh){return vault.characters.find(c=>!c.character.demo_id&&identityMatches(c.character,fresh))||null;}
function keyFor(record){return [canonical(record.name),canonical(record.level??''),canonical(record.source??'')].join('|');}
// Manual spell IDs are authored by the sheet editor (and older "custom-" tools).
// Their identity is stable across PDF indexes, source edits, and spell levels.
const isManualSpell=record=>/^(?:manual-spell-|custom-)/.test(String(record?.id||''));
function reconcile(old,fresh){
 if(!validCharacter(old)||!validCharacter(fresh))throw Error('Cannot reconcile invalid characters.');
 const next=copy(fresh);next.resources=SlotPools.normalize(next.resources);
 const before=copy(old);before.resources=SlotPools.normalize(before.resources);
 const merged={...next,system_id:'dnd5e',system_edition:old.system_edition||'unspecified',rules_profile:old.rules_profile||'manual',combat_profile:before.combat_profile||next.combat_profile};
 // Imported attack math remains authoritative. An explicitly classified attack
 // retains its permission label only when its name uniquely identifies one old
 // and one new record. Ambiguous duplicates never inherit guessed mechanics.
 const previousAttacks=before.attacks||[],freshAttacks=next.attacks||[];
 const names=items=>items.reduce((m,a)=>{const k=canonical(a.name);m.set(k,(m.get(k)||0)+1);return m;},new Map());
 const oldCount=names(previousAttacks),newCount=names(freshAttacks);
 const classified=new Map(previousAttacks
  .filter(a=>oldCount.get(canonical(a.name))===1&&newCount.get(canonical(a.name))===1)
  .map(a=>[canonical(a.name),Object.fromEntries(Object.entries({attack_type:a.attack_type,attack_range:a.attack_range})
   .filter(([key,value])=>key==='attack_type'?['unarmed','weapon'].includes(value):['melee','ranged'].includes(value)))]));
 merged.attacks=freshAttacks.map(a=>classified.has(canonical(a.name))?{...a,...classified.get(canonical(a.name))}:a);
 // Latest PDF owns published maximums, stats and attack bonuses; gameplay state stays live.
 merged.hp.current=Math.max(0,Math.min(next.hp.max,Number(before.hp.current)||0));
 merged.hp.temp=Math.max(0,Number(before.hp.temp)||0);
 merged.conditions=before.conditions||[];
 merged.effects=before.effects||{};
 merged.roll_history=before.roll_history||[];
 merged.notes=before.notes||'';
 merged.homebrew_notes=before.homebrew_notes||'';
 merged.currency=before.currency||next.currency;
 const resources=copy(next.resources||{});
 for(const [name,r] of Object.entries(before.resources||{})){
  if(resources[name]){
   const spent=Math.max(0,Number(r.max||0)-Number(r.current||0));
   resources[name].current=Math.max(0,Math.min(Number(resources[name].max||0),Number(resources[name].max||0)-spent));
  }else resources[name]=r; // Unknown resource could be manually configured; never silently remove.
 }
 merged.resources=resources;
 const priorSpells=before.spells||[],importedSpells=next.spells||[];
 // The PDF only owns its own spells. Player-authored spell IDs are never
 // candidates for matching or replacing imported records, even if names collide.
 const oldPdf=priorSpells.filter(sp=>!isManualSpell(sp));
 const newPdf=importedSpells.filter(sp=>!isManualSpell(sp));
 // Source labels can change between PDF exports or edits. Only fall back
 // to name+level when BOTH sides identify one unambiguous imported spell.
 const withoutSource=sp=>[canonical(sp.name),canonical(sp.level??'')].join('|');
 const uniqueMatch=(items,keyFn,key)=>{const found=items.filter(sp=>keyFn(sp)===key);return found.length===1?found[0]:null;};
 merged.spells=importedSpells.map(s=>{
  if(isManualSpell(s))return s; // A supplied manual record remains authored data.
  const exactOld=uniqueMatch(oldPdf,keyFor,keyFor(s));
  const exactNew=uniqueMatch(newPdf,keyFor,keyFor(s));
  const previous=exactOld&&exactNew?exactOld:null;
  const fallback=!previous&&uniqueMatch(newPdf,withoutSource,withoutSource(s))?
   uniqueMatch(oldPdf,withoutSource,withoutSource(s)):null;
  const prev=previous||fallback;
  return prev?{...s,prepared:prev.prepared,available:prev.available,notes:prev.notes||s.notes,
   ...Object.fromEntries(['roll','effect_kind','effect_condition','damage_type','duration_rounds','concentration','automation','spellcasting_modifier','spellcasting_ability'].filter(k=>Object.prototype.hasOwnProperty.call(prev,k)).map(k=>[k,prev[k]]))}:s;
 });
 // Keep every separately authored entry by stable ID, not by display fields.
 // The PDF may now contain an identically named spell; that is not the same record.
 for(const sp of priorSpells)if(isManualSpell(sp)&&!merged.spells.some(s=>s.id===sp.id))merged.spells.push(sp);
 const inventoryByName=new Map();
 for(const item of before.inventory||[]){const name=canonical(item.name);if(!inventoryByName.has(name))inventoryByName.set(name,[]);inventoryByName.get(name).push(item);}
 merged.inventory=(next.inventory||[]).map(item=>{
  const oldItem=inventoryByName.get(canonical(item.name))?.shift();
  return oldItem?{...item,notes:oldItem.notes||item.notes}:item;
 });
 for(const item of before.inventory||[])if((item.id||'').startsWith('custom-')&&!merged.inventory.some(x=>x.id===item.id))merged.inventory.push(item);
 const customs=(before.actions||[]).filter(a=>['manual','user-reference'].includes(a.source));
 const customNames=new Set(customs.map(a=>canonical(a.name)));
 merged.actions=[...(next.actions||[]).filter(a=>!customNames.has(canonical(a.name))),...customs];
 return merged;
}
function importSummary(old,fresh){
 const diffs=[];
 if(old.class_level!==fresh.class_level)diffs.push(`Class / level: ${old.class_level||'—'} → ${fresh.class_level||'—'}`);
 if(old.hp?.max!==fresh.hp?.max)diffs.push(`Maximum HP: ${old.hp?.max} → ${fresh.hp?.max}`);
 const stats=Object.keys(fresh.abilities||{}).filter(k=>old.abilities?.[k]?.score!==fresh.abilities[k]?.score);
 if(stats.length)diffs.push(`Updated ability scores: ${stats.join(', ')}`);
 diffs.push(`PDF records: ${(fresh.attacks||[]).length} attacks, ${(fresh.spells||[]).length} spells, ${(fresh.inventory||[]).length} inventory entries`);
 return diffs.join('\n');
}
function indexedDb(){
 return new Promise((resolve,reject)=>{
  if(!root.indexedDB){reject(Error('IndexedDB storage is unavailable. Use a supported browser and export JSON backups.'));return;}
  const request=root.indexedDB.open(DB,1);
  request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE);};
  request.onerror=()=>reject(request.error||Error('Cannot open local vault.'));
  request.onsuccess=()=>resolve(request.result);
 });
}
async function browserRead(){
 const db=await indexedDb();
 try{return await new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,'readonly'),request=tx.objectStore(STORE).get(KEY);
  request.onsuccess=()=>resolve(request.result||null);request.onerror=()=>reject(request.error);
 });}finally{db.close();}
}
async function browserWrite(data){
 const db=await indexedDb();
 try{await new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(data,KEY);
  tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
 });}finally{db.close();}
}
function storage(staticSite){
 let pending=Promise.resolve();
 return {
  async read(){
   if(staticSite){
    const saved=await browserRead();if(saved)return normalize(saved);
    const legacy=root.localStorage?.getItem('smi.tabletop.character.v1');
    const migration=legacy?migrateLegacy(JSON.parse(legacy)):empty();
    // No IndexedDB record means a genuinely first visit. A saved empty vault,
    // deleted demo or migrated character must never be repopulated implicitly.
    if(!legacy)addDemo(migration);
    // Never delete legacy data; it is a recovery copy, not live state.
    await browserWrite(migration);return migration;
   }
   const response=await fetch('/api/vault');if(!response.ok)throw Error('Vault read failed (HTTP '+response.status+')');
   return normalize(await response.json());
  },
  write(data){
   const snapshot=normalize(data);
   const save=async()=>{
    if(staticSite)return browserWrite(snapshot);
    const response=await fetch('/api/vault',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(snapshot)});
    if(!response.ok){const error=await response.json().catch(()=>({}));throw Error(error.error||'Vault write failed (HTTP '+response.status+')');}
   };
   const result=pending.then(save);
   pending=result.catch(()=>{}); // Allow a later retry, but report this failure to the caller.
   return result;
  }
 };
}
const api={empty,normalize,migrateLegacy,upsert,addDemo,resetDemo,newId,findMatch,identityMatches,isManualSpell,reconcile,importSummary,storage,validCharacter};
root.TabletopVault=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
