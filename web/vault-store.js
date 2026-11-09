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
// The preview and reconciler share exactly one imported-spell identity contract.
const spellNameLevel=sp=>[canonical(sp.name),canonical(sp.level??'')].join('|');
function matchImportedSpells(oldPdf,newPdf){
 const unique=(rows,keyFn,key)=>{
  let match=-1;
  rows.forEach((row,i)=>{if(keyFn(row)===key)match=match===-1?i:-2;});
  return match>=0?match:-1;
 };
 return newPdf.map(sp=>{
  const a=unique(oldPdf,keyFor,keyFor(sp)),b=unique(newPdf,keyFor,keyFor(sp));
  if(a!==-1&&b!==-1)return {oldIndex:a,sourceChanged:false};
  const oldIndex=unique(oldPdf,spellNameLevel,spellNameLevel(sp));
  const newIndex=unique(newPdf,spellNameLevel,spellNameLevel(sp));
  return {oldIndex:oldIndex!==-1&&newIndex!==-1?oldIndex:-1,sourceChanged:oldIndex!==-1&&newIndex!==-1};
 });
}
function spellReimportPreview(old,fresh){
 if(!validCharacter(old)||!validCharacter(fresh))throw Error('Cannot preview invalid characters.');
 const oldPdf=(old.spells||[]).filter(sp=>!isManualSpell(sp)),newPdf=(fresh.spells||[]).filter(sp=>!isManualSpell(sp));
 const matches=matchImportedSpells(oldPdf,newPdf);
 const usedOld=new Set(matches.filter(x=>x.oldIndex!==-1).map(x=>x.oldIndex));
 const missingOld=oldPdf.filter((_,i)=>!usedOld.has(i));
 const unmatchedNew=newPdf.filter((_,i)=>matches[i].oldIndex===-1);
 const oldNames=new Set(missingOld.map(spellNameLevel));
 const newNames=new Set(unmatchedNew.map(spellNameLevel));
 const ambiguousKeys=new Set([...oldNames].filter(key=>newNames.has(key)));
 const clean=x=>String(x||'').replace(/\s+/g,' ').trim();
 const display=sp=>{
  const name=clean(sp.name||'Unnamed spell').slice(0,80);
  const level=sp.level===0?'cantrip':Number.isInteger(sp.level)?'level '+sp.level:'level unknown';
  const source=clean(sp.source).slice(0,50);
  return name+' ('+level+(source?', '+source:'')+')';
 };
 const ambiguous=new Set(unmatchedNew.filter(sp=>ambiguousKeys.has(spellNameLevel(sp)))
  .map(sp=>clean(sp.name||'Unnamed spell').slice(0,80)+' ('+(sp.level===0?'cantrip':sp.level==null?'level unknown':'level '+sp.level)+')'));
 return {
  matched:matches.filter(x=>x.oldIndex!==-1).length,
  added:unmatchedNew.filter(sp=>!ambiguousKeys.has(spellNameLevel(sp))).map(display),
  removed:missingOld.filter(sp=>!ambiguousKeys.has(spellNameLevel(sp))).map(display),
  ambiguous:[...ambiguous],
  sourceChanged:matches.flatMap((m,i)=>m.sourceChanged?[display(newPdf[i])+' (from '+clean(oldPdf[m.oldIndex].source||'unknown').slice(0,50)+')']:[]),
  manualPreserved:(old.spells||[]).filter(isManualSpell).length
 };
}
// PDF equipment IDs encode row position and are not persistent item identities.
const isManualItem=x=>/^(?:custom-|manual-item-)/.test(String(x?.id||''));
function matchImportedInventory(oldRows,newRows){
 const keys=rows=>rows.reduce((m,x,i)=>{const k=canonical(x.name);if(k){if(!m.has(k))m.set(k,[]);m.get(k).push(i);}return m;},new Map());
 const before=keys(oldRows),after=keys(newRows);
 return newRows.map(x=>{const k=canonical(x.name),a=before.get(k)||[],b=after.get(k)||[];
  return {oldIndex:k&&a.length===1&&b.length===1?a[0]:-1};});
}
function inventoryReimportPreview(old,fresh){
 if(!validCharacter(old)||!validCharacter(fresh))throw Error('Cannot preview invalid characters.');
 const a=old.inventory.filter(x=>!isManualItem(x)),b=fresh.inventory.filter(x=>!isManualItem(x));
 const matches=matchImportedInventory(a,b),used=new Set(matches.filter(m=>m.oldIndex!==-1).map(m=>m.oldIndex));
 const counts=rows=>rows.reduce((m,x)=>{const k=canonical(x.name);if(k)m.set(k,(m.get(k)||0)+1);return m;},new Map());
 const ac=counts(a),bc=counts(b),ambiguous=new Set([...ac].filter(([k,v])=>bc.has(k)&&(v!==1||bc.get(k)!==1)).map(([k])=>k));
 const clean=x=>String(x??'').replace(/\s+/g,' ').trim().slice(0,80);
 const display=x=>clean(x.name||'Unnamed item')+' (qty '+String(x.quantity??'?').slice(0,20)+')';
 const oldNames=new Map(a.map(x=>[canonical(x.name),clean(x.name||'Unnamed item')]));
 const newNames=new Map(b.map(x=>[canonical(x.name),clean(x.name||'Unnamed item')]));
 const oldUnmatched=a.filter((_,i)=>!used.has(i));
 const newUnmatched=b.filter((_,i)=>matches[i].oldIndex===-1);
 const note=x=>typeof x.notes==='string'&&x.notes.trim().length>0;
 return {
  matched:matches.filter(m=>m.oldIndex!==-1).length,
  added:newUnmatched.filter(x=>!ambiguous.has(canonical(x.name))).map(display),
  removed:oldUnmatched.filter(x=>!ambiguous.has(canonical(x.name))).map(display),
  ambiguous:[...ambiguous].map(k=>(newNames.get(k)||oldNames.get(k))+' ('+ac.get(k)+' previous, '+bc.get(k)+' incoming)'),
  notesRetained:matches.filter(m=>m.oldIndex!==-1&&note(a[m.oldIndex])).length,
  notesAtRisk:oldUnmatched.filter(note).map(display),
  quantityChanged:matches.flatMap((m,i)=>{
   if(m.oldIndex===-1)return [];
   const oldItem=a[m.oldIndex],newItem=b[i];
   return String(oldItem.quantity??'')===String(newItem.quantity??'')?[]:[clean(newItem.name)+': '+String(oldItem.quantity??'?').slice(0,20)+' → '+String(newItem.quantity??'?').slice(0,20)];
  }),
  manualPreserved:old.inventory.filter(isManualItem).length
 };
}
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
 const spellMatches=matchImportedSpells(oldPdf,newPdf);
 let pdfIndex=0;
 merged.spells=importedSpells.map(s=>{
  if(isManualSpell(s))return s; // A supplied manual record remains authored data.
  const {oldIndex}=spellMatches[pdfIndex++];
  const prev=oldIndex===-1?null:oldPdf[oldIndex];
  return prev?{...s,prepared:prev.prepared,available:prev.available,notes:prev.notes||s.notes,
   ...Object.fromEntries(['roll','effect_kind','effect_condition','damage_type','duration_rounds','concentration','automation','spellcasting_modifier','spellcasting_ability'].filter(k=>Object.prototype.hasOwnProperty.call(prev,k)).map(k=>[k,prev[k]]))}:s;
 });
 // Keep every separately authored entry by stable ID, not by display fields.
 // The PDF may now contain an identically named spell; that is not the same record.
 for(const sp of priorSpells)if(isManualSpell(sp)&&!merged.spells.some(s=>s.id===sp.id))merged.spells.push(sp);
 const oldItems=(before.inventory||[]).filter(item=>!isManualItem(item));
 const incomingItems=(next.inventory||[]).filter(item=>!isManualItem(item));
 const inventoryMatches=matchImportedInventory(oldItems,incomingItems);
 let inventoryIndex=0;
 merged.inventory=(next.inventory||[]).map(item=>{
  if(isManualItem(item))return item;
  const {oldIndex}=inventoryMatches[inventoryIndex++];
  const prior=oldIndex===-1?null:oldItems[oldIndex];
  return prior?{...item,notes:prior.notes||item.notes}:item;
 });
 for(const item of before.inventory||[])if(isManualItem(item)&&!merged.inventory.some(x=>x.id===item.id))merged.inventory.push(item);
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
 const p=spellReimportPreview(old,fresh);
 diffs.push(`Imported spellbook: ${p.matched} matched, ${p.added.length} added, ${p.removed.length} removed, ${p.ambiguous.length} ambiguous matching groups.`);
 const list=(heading,items)=>{
  if(!items.length)return;
  diffs.push(`${heading} (${items.length}): ${items.slice(0,6).join('; ')}${items.length>6?'; and '+(items.length-6)+' more':''}`);
 };
 list('Added imported spells',p.added);
 list('Removed imported spells',p.removed);
 list('Ambiguous imported spell matches',p.ambiguous);
 if(p.ambiguous.length)diffs.push('Ambiguous imported spells use the new PDF values; previous preparation and configured effects are not transferred for those identities.');
 list('Source labels changed; prior settings retained',p.sourceChanged);
 diffs.push(`Player-authored spell entries preserved independently: ${p.manualPreserved}. Existing active effects are not ended by this import.`);
 const items=inventoryReimportPreview(old,fresh);
 diffs.push(`Imported inventory: ${items.matched} matched, ${items.added.length} added, ${items.removed.length} removed, ${items.ambiguous.length} ambiguous matching groups.`);
 list('Added imported items',items.added);
 list('Removed imported items',items.removed);
 list('Ambiguous imported item matches',items.ambiguous);
 list('Imported item quantity changes',items.quantityChanged);
 diffs.push(`Imported item notes retained on unique matches: ${items.notesRetained}. Player-authored items preserved independently: ${items.manualPreserved}.`);
 list('Previous item notes that cannot safely transfer',items.notesAtRisk);
 if(items.notesAtRisk.length)diffs.push('Warning: these previous imported-item notes will NOT transfer automatically. Cancel and export a backup or copy the notes before confirming if needed.');
 if(items.ambiguous.length)diffs.push('Ambiguous imported items keep the latest PDF rows; row order and equipment-N indexes are not trusted as identity.');
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
const api={empty,normalize,migrateLegacy,upsert,addDemo,resetDemo,newId,findMatch,identityMatches,isManualSpell,isManualItem,reconcile,spellReimportPreview,inventoryReimportPreview,importSummary,storage,validCharacter};
root.TabletopVault=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
