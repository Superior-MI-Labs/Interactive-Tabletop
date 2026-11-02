/* Read-only, offline D&D reference catalog. The Character Vault never receives reference records.
 * 2014 is the ONLY supported catalog edition. Never infer an edition from a character name.
 */
(function(root){'use strict';
let catalog=null,index=new Map();
const norm=x=>String(x??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const validKinds=new Set(['spell','equipment']);
function validate(data){
 if(!data||data.schema!=='interactive-tabletop-reference/1'||data.edition!=='dnd-2014'||data.source?.id!=='srd-5.1'||!Array.isArray(data.spells)||!Array.isArray(data.equipment))throw Error('Invalid D&D reference catalog');
 const seen=new Set();
 for(const [kind,records] of [['spell',data.spells],['equipment',data.equipment]])for(const r of records){
  if(!r||r.kind!==kind||r.edition!==data.edition||r.source_id!==data.source.id||!r.name||!r.id||seen.has(r.id)||!r.id.startsWith('srd51:'))throw Error('Invalid or duplicate reference record');
  if(r.aliases!==undefined&&(!Array.isArray(r.aliases)||r.aliases.some(a=>typeof a!=='string'||!a.trim())))throw Error('Invalid reference aliases');
  if(r.automation!==undefined){
   const a=r.automation;
   if(kind!=='spell'||a?.schema!=='srd51-spell-effect/1'||a.target!=='self'||a.spell_id!==r.id||a.base_level!==r.level||!['heal','ac_bonus','check_bonus'].includes(a.type))throw Error('Invalid spell automation profile');
  }
  seen.add(r.id);
 }
 return data;
}
function init(data){catalog=validate(data);index=new Map();
 for(const [kind,records] of [['spell',catalog.spells],['equipment',catalog.equipment]])for(const item of records){
  for(const name of [item.name,...(item.aliases||[])]){
   const key=kind+':'+norm(name);
   // Never silently choose between ambiguous aliases.
   if(index.has(key)&&index.get(key)?.id!==item.id)index.set(key,null);
   else if(!index.has(key))index.set(key,item);
  }
 }
 return catalog;
}
async function load(path='./dnd-2014-reference.json'){
 const res=await fetch(path,{cache:'no-cache'});
 if(!res.ok)throw Error('Reference catalog unavailable (HTTP '+res.status+')');
 return init(await res.json());
}
function match(kind,name,edition){
 if(!validKinds.has(kind)||!catalog)return null;
 // Explicitly revised-edition characters cannot use 2014 source automatically.
 if(edition&&/2024|5\.5|srd.?5\.2/i.test(String(edition)))return null;
 // D&D Beyond marks some ritual spell names with [R]. Strip only this
 // explicit annotation; never use fuzzy matching that could conflate homebrew.
 const clean=kind==='spell'?String(name).replace(/\s*\[(?:R|Ritual)\]\s*$/i,''):name;
 return index.get(kind+':'+norm(clean))||null;
}
// Comparison is explanatory. It never normalizes, updates or rules on a character.
const fieldText=x=>String(x??'').trim();
const normalizedField=x=>fieldText(x).toLowerCase().replace(/\bfeet\b/g,'ft').replace(/\bminutes?\b/g,'min').replace(/\bhours?\b/g,'hr').replace(/[^a-z0-9]/g,'');
function compareSpell(imported,record){
 if(!imported||!record||record.kind!=='spell'||record.edition!=='dnd-2014')throw Error('2014 spell reference required');
 const pairs=[
  ['Level',imported.level,record.level],
  ['Casting time',imported.casting_time,record.casting_time],
  ['Range',imported.range,record.range],
  ['Components',imported.components,record.components],
  ['Duration',imported.duration,record.duration],
 ];
 return pairs.map(([label,left,right])=>{
  const available=left!==undefined&&left!==null&&fieldText(left)!=='';
  let same=available&&normalizedField(left)===normalizedField(right);
  // D&D Beyond exports concentration as part of duration, while the SRD
  // separates the flag. Ignore that prefix ONLY for comparing duration text.
  if(available&&label==='Duration')same=normalizedField(fieldText(left).replace(/^concentration[,:]?\s*/i,''))===normalizedField(fieldText(right).replace(/^concentration[,:]?\s*/i,''));
  // Material component notes may follow V, S, M in a PDF. A prefix means the
  // imported sheet has the same components but may contain extra material detail.
  if(available&&label==='Components'){
   const tokens=x=>fieldText(x).toUpperCase().match(/\b[VSM]\b/g)||[];
   const a=tokens(left),b=tokens(right);
   same=a.length>0&&a.length===b.length&&a.join('')===b.join('');
  }
  return {label,imported:available?String(left):null,reference:String(right??''),status:!available?'not-recorded':same?'match':'review'};
 });
}
// Catalog-only action drafts are explicitly inert; they are not spellbook entries.
// They never gain permission to cast a spell, spend a slot, or apply effects.
function actionDraft(record){
 if(!record||record.kind!=='spell'||record.edition!=='dnd-2014')throw Error('Spell reference required');
 const time=fieldText(record.casting_time).toLowerCase();
 const activation=/^1\s+bonus action\b/.test(time)?'bonus action':/^1\s+reaction\b/.test(time)?'reaction':/^1\s+action\b/.test(time)?'action':'special';
 return {id:'manual-srd-'+record.id.replace(/[^a-z0-9]/gi,'-'),name:record.name+' (reference draft)',
 activation,description:'SRD 5.1 reference: '+record.name+'. Review the full rules and confirm with your DM before configuring this custom action. Not a known or prepared spell.',
 roll:'',damage:'',resource:'',cost:0,effect_kind:'none',effect_condition:'',duration_rounds:0,concentration:false,
 reference_id:record.id,source:'manual',archived:false};
}

function list(kind){if(!catalog)return [];return kind==='spell'?[...catalog.spells]:kind==='equipment'?[...catalog.equipment]:[...catalog.spells,...catalog.equipment];}
const api={init,load,match,list,compareSpell,actionDraft,source:()=>catalog?.source||null,counts:()=>({spells:catalog?.spells.length||0,equipment:catalog?.equipment.length||0}),ready:()=>Boolean(catalog)};
root.ReferenceCatalog=api;
if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
