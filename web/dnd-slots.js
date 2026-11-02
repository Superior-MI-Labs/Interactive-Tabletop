/* D&D spell-slot pool identity and legacy migration.
 * A slot level is the identity, NOT a user-facing resource label. This module
 * is the only place that interprets imported/legacy slot resource keys.
 * Pact Magic and other class resources are deliberately not conflated with
 * standard Spellcasting slots; they need a separate, reviewed contract.
 */
(function(root){'use strict';
const ORDINALS={first:1,second:2,third:3,fourth:4,fifth:5,sixth:6,seventh:7,eighth:8,ninth:9};
const canonical=level=>`Level ${level} Spell Slots`;
function levelFromName(name){
 const text=String(name||'').trim().replace(/\s+/g,' ').toLowerCase();
 // Legacy character sheets: "First-level Spell Slots"; standard: "Level 1 Spell Slots".
 let m=/^level ([1-9]) spell slots$/.exec(text);
 if(m)return Number(m[1]);
 m=/^(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth)[ -]level spell slots$/.exec(text);
 if(m)return ORDINALS[m[1]];
 m=/^([1-9])(?:st|nd|rd|th)[ -]level spell slots$/.exec(text);
 if(m)return Number(m[1]);
 m=/^spell slots[ -]level ([1-9])$/.exec(text);
 return m?Number(m[1]):null;
}
function checkedPool(pool,name){
 const max=Number(pool?.max),current=Number(pool?.current);
 if(!Number.isSafeInteger(max)||!Number.isSafeInteger(current)||max<0||current<0||current>max)
  throw Error(`Invalid spell slot counts for ${name}; restore or edit the resource values.`);
 return {max,current};
}
function normalize(resources){
 const next={}, slots=new Map();
 for(const [name,pool] of Object.entries(resources||{})){
  const level=levelFromName(name);
  if(level===null){next[name]=pool;continue;}
  const amounts=checkedPool(pool,name);
  const prev=slots.get(level);
  // Duplicate labels refer to the SAME standard pool, never to extra slots.
  // Keep the canonical max where present, and the most conservative remaining
  // count rather than restoring already spent slots by accident.
  if(!prev){slots.set(level,{level,source:name,pool:{...pool,current:amounts.current,max:amounts.max}});}
  else {
   const newer=name===canonical(level),older=prev.source===canonical(level);
   const preferred=newer||!older?pool:prev.pool;
   const max=(newer||!older)?amounts.max:prev.pool.max;
   const current=Math.min(prev.pool.current,amounts.current,max);
   slots.set(level,{level,source:(newer||!older)?name:prev.source,pool:{...preferred,max,current}});
  }
 }
 for(const {level,pool} of slots.values())next[canonical(level)]=pool;
 return next;
}
function poolFor(resources,level){
 if(!Number.isSafeInteger(level)||level<1||level>9)throw Error('Spell slot level must be 1–9.');
 const candidates=Object.entries(resources||{}).filter(([name])=>levelFromName(name)===level);
 if(!candidates.length)return null;
 const key=canonical(level);
 const choice=candidates.find(([name])=>name===key)||candidates[0];
 const amounts=checkedPool(choice[1],choice[0]);
 // An unnormalized legacy save may contain two labels for the same pool.
 // Treat these as aliases, never two spendable resources. Never show more
 // available slots than the most conservative valid alias reports.
 const remaining=Math.min(...candidates.map(([name,pool])=>checkedPool(pool,name).current));
 return {level,resource:choice[0],pool:choice[1],current:Math.min(remaining,amounts.max),max:amounts.max};
}
function list(resources){
 const levels=[...new Set(Object.keys(resources||{}).map(levelFromName).filter(level=>level!==null))].sort((a,b)=>a-b);
 return levels.map(level=>poolFor(resources,level));
}
const api={canonical,levelFromName,normalize,poolFor,list};
root.DndSlots=api;
if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
