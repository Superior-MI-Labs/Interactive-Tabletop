/* D&D Beyond PDF form-fields -> tabletop character v1.
 * Pure normalizer: PDF extraction is delegated to pypdf (desktop) or PDF.js (Pages).
 * Does not infer homebrew rules or modify imported roll bonuses.
 */
(function(root){'use strict';
const numeric=(v,fallback=0)=>{const m=String(v??'').replace(/,/g,'').match(/-?\d+/);return m?Number(m[0]):fallback;};
const SlotPools=root.DndSlots||(typeof require==='function'?require('./dnd-slots.js'):null);
if(!SlotPools)throw Error('D&D slot module was not loaded.');
const skillKeys={'Acrobatics':'Acrobatics','Animal Handling':'Animal','Arcana':'Arcana','Athletics':'Athletics','Deception':'Deception','History':'History','Insight':'Insight','Intimidation':'Intimidation','Investigation':'Investigation','Medicine':'Medicine','Nature':'Nature','Perception':'Perception','Performance':'Performance','Persuasion':'Persuasion','Religion':'Religion','Sleight of Hand':'SleightofHand','Stealth':'Stealth','Survival':'Survival'};
const abb=['STR','DEX','CON','INT','WIS','CHA'];
const names=['Strength','Dexterity','Constitution','Intelligence','Wisdom','Charisma'];
const normName=x=>String(x??'').toLowerCase().replace(/[^a-z0-9]/g,'');
function parseActions(features,attacks){
 const results=[],seen=new Set(attacks.map(a=>normName(a.name)));
 function add(name,activation,desc,source){
  name=String(name||'').replace(/\s*•\s*\d+\s*\/\s*(?:Long|Short) Rest.*$/i,'').trim();
  const key=normName(name);if(!key||seen.has(key)||/^(?:standardactions|actions|bonusactions|reactions|ki|martialarts)$/.test(key))return;
  seen.add(key);const formulas=[...String(desc).matchAll(/\b\d+d(?:4|6|8|10|12|20|100)(?:\s*[+-]\s*\d+)?\b/gi)].map(x=>x[0]);
  const c=String(desc).match(/\bspend\s+(\d+)\s+ki\s+points?\b/i);
  let resource=c?'Ki':'',cost=c?+c[1]:0;
  const uses=(String(desc)+' '+name).match(/(?:\||•)\s*(\d+)\s*\/\s*(Short|Long) Rest/i);
  if(uses&&!resource){resource=name;cost=1;}
  results.push({id:'pdf-action-'+results.length,name,activation,description:String(desc).trim(),roll:formulas.length===1?formulas[0].replace(/\s/g,''):'',damage:'',resource,cost,source,archived:false});
 }
 for(const doc of features){const content=doc.text||'';
  if(doc.title==='Actions'){
   let section='action',name='',body=[];
   const flush=()=>{if(name)add(name,section,body.join(' '),'pdf-actions');};
   for(const line of content.split(/\r?\n/)){const s=line.trim();if(!s)continue;
    const switcher={'=== ACTIONS ===':'action','=== BONUS ACTIONS ===':'bonus action','=== REACTIONS ===':'reaction'}[s];
    if(switcher){flush();name='';body=[];section=switcher;continue;}
    if(s==='Standard Actions')continue;
    if(/^\s{3,}/.test(line)||s.length>110||/^(?:As a |You can |Once |Whenever |The |A creature |When )/i.test(s)){if(name)body.push(s);continue;}
    if(s.startsWith('==='))continue;
    flush();name=s;body=[];
   }flush();
  }
  if(doc.title.startsWith('Features & Traits')){
   const re=/^\s*\*\s+([^\n•]+)\s*•[^\n]*/gm,matches=[...content.matchAll(re)];
   matches.forEach((m,i)=>{
    const body=content.slice(m.index+m[0].length,i+1<matches.length?matches[i+1].index:undefined).trim();
    const marker=body.match(/\|\s*(?:\d+\s+)?(Bonus Action|Reaction|Action)\b/i);
    if(!marker&&!/(?:as an action|bonus action|use your reaction|as a reaction|spend \d+ ki points? to make)/i.test(body))return;
    const type=marker?marker[1].toLowerCase():/reaction/i.test(body)?'reaction':/bonus action/i.test(body)?'bonus action':'action';
    add(m[1].trim(),type,body,'pdf-feature');
   });
  }
 }
 return results;
}
function fromFields(f){
 if(!f||typeof f!=='object')throw Error('No form fields found. Export your character as a D&D Beyond PDF.');
 const name=String(f.CharacterName||f.CharacterName2||'').trim();if(!name)throw Error('The PDF does not contain a D&D Beyond character name.');
 const classLevel=String(f['CLASS  LEVEL']||f['CLASS LEVEL']||'');
 const stats=Object.fromEntries(abb.map(a=>[a,{score:numeric(f[a],10),modifier:numeric(f[a+'mod'])}]));
 const saves=Object.fromEntries(names.map(a=>[a,numeric(f['ST '+a])]));
 const skills=Object.fromEntries(Object.entries(skillKeys).map(([label,key])=>[label,numeric(f[key])]));
 const inventory=[];for(let n=0;n<200;n++){
  const v=String(f['Eq Name'+n]||'').trim();if(!v)continue;
  const qty=numeric(f['Eq Qty'+n],1);
  inventory.push({id:'equipment-'+n,name:v,quantity:qty,weight:f['Eq Weight'+n]||'',archived:qty<=0,notes:''});
 }
 const spellLevels={};let current=null;
 for(const [key,value] of Object.entries(f)){
  if(/^spellHeader\d+$/.test(key)){
   const hdr=String(value),m=hdr.match(/(\d+)(?:st|nd|rd|th)\s+LEVEL/i);current=m?+m[1]:/CANTRIP/i.test(hdr)?0:null;
  }else if(/^spellName\d+$/.test(key))spellLevels[+key.slice(9)]=current;
 }
 const spells=[];for(let n=0;n<300;n++){
  const spell=String(f['spellName'+n]||'').trim();if(!spell)continue;
  const source=String(f['spellSource'+n]||'');
  const prepared=String(f['spellPrepared'+n]||'').toUpperCase()==='P';
  spells.push({id:'spell-'+n,name:spell,source,casting_time:f['spellCastingTime'+n]||'',range:f['spellRange'+n]||'',duration:f['spellDuration'+n]||'',components:f['spellComponents'+n]||'',save:f['spellSaveHit'+n]||'',notes:f['spellNotes'+n]||'',prepared,always_prepared:/always prepared/i.test(source),available:true,level:spellLevels[n]??null});
 }
 const attacks=[];for(let n=1;n<30;n++){
  const key='Wpn Name'+(n>1?' '+n:'');const v=String(f[key]||'').trim();if(v)attacks.push({name:v,bonus:numeric(f['Wpn'+n+' AtkBonus']),damage:f['Wpn'+n+' Damage']||'',type:'attack'});
 }
 const features=[];for(let n=1;n<=10;n++){if(f['FeaturesTraits'+n])features.push({title:'Features & Traits '+n,text:f['FeaturesTraits'+n]});}
 features.push({title:'Actions',text:(f.Actions1||'')+'\n\n'+(f.Actions2||'')+'\n\n'+(f.Actions3||'')});
 const resources={};const monk=(classLevel.match(/\bMonk\s+(\d+)/i)||[])[1];
 if(monk){const count=+monk;resources.Ki={current:count,max:count,reset:'short rest'};}
 const actionText=[f.Actions1,f.Actions2,f.Actions3].filter(Boolean).join('\n');
 for(const match of actionText.matchAll(/(?:^|\n)([^\n•]{3,80})\s*•\s*(\d+)\s*\/\s*(Short|Long) Rest/gim)){
  const title=match[1].trim();if(/(?:standard actions|\buse\s)/i.test(title))continue;
  resources[title]={current:+match[2],max:+match[2],reset:match[3].toLowerCase()+' rest'};
 }
 for(const doc of features.filter(d=>d.title.startsWith('Features & Traits'))){
  const re=/^\s*\*\s+([^\n•]+)\s*•[^\n]*/gm,matches=[...doc.text.matchAll(re)];
  matches.forEach((m,i)=>{const body=doc.text.slice(m.index+m[0].length,i+1<matches.length?matches[i+1].index:undefined);
   const use=body.match(/\|\s*(\d+)\s*\/\s*(Short|Long) Rest/i);
   const title=m[1].trim();if(use&&!resources[title])resources[title]={current:+use[1],max:+use[1],reset:use[2].toLowerCase()+' rest'};
  });
 }
 for(let lvl=1;lvl<=9;lvl++){
  const hdr=f['spellSlotHeader'+lvl];const count=numeric(String(hdr||'').match(/(\d+)\s+Slots?/i)?.[1]||'');
  if(count>0)resources[SlotPools.canonical(lvl)]={current:count,max:count,reset:'long rest'};
 }
 const isSky=normName(name)==='skyblueeyes'&&/monk\s+19/i.test(classLevel);
 const initiative=numeric(f.Init);
 return {schema_version:1,name,player:f['PLAYER NAME']||'',class_level:classLevel,species:f.RACE||'',background:f.BACKGROUND||'',
   ac:numeric(f.AC,10),initiative,initiative_pdf:initiative,initiative_note:'PDF value; edit if your DM uses additional modifiers.',proficiency:numeric(f.ProfBonus),
   hp:{max:numeric(f.MaxHP,10),current:numeric(f.MaxHP,10),temp:Math.max(0,numeric(f.TempHP))},speed:f.Speed||'',defenses:f.Defenses||'',
   abilities:stats,saves,skills,attacks,inventory,spells,currency:Object.fromEntries(['CP','SP','EP','GP','PP'].map(k=>[k,numeric(f[k])])),
   resources,conditions:[],roll_history:[],effects:{empty_body_rounds:0},notes:f.AdditionalNotes1||'',features,actions:parseActions(features,attacks),
   homebrew_notes:isSky?'Imported rules may contain DM-approved exceptions; check custom abilities and initiative.':'',import_provenance:'D&D Beyond PDF form fields (browser)'};
}
// Manual creation belongs to the same normalized character contract as PDF import.
// This creates only explicit data and basic 2014 math, not inferred class features.
const skillAbilities={
 'Acrobatics':'DEX','Animal Handling':'WIS','Arcana':'INT','Athletics':'STR',
 'Deception':'CHA','History':'INT','Insight':'WIS','Intimidation':'CHA',
 'Investigation':'INT','Medicine':'WIS','Nature':'INT','Perception':'WIS',
 'Performance':'CHA','Persuasion':'CHA','Religion':'INT','Sleight of Hand':'DEX',
 'Stealth':'DEX','Survival':'WIS'
};
function manualInteger(value,label,min,max){
 if(String(value??'').trim()===''||!Number.isInteger(Number(value))||Number(value)<min||Number(value)>max)
  throw Error(label+' must be a whole number from '+min+' to '+max+'.');
 return Number(value);
}
function manualLabel(value,label,max=80){
 const text=String(value??'').trim();
 if(!text||text.length>max)throw Error(label+' is required (up to '+max+' characters).');
 return text;
}
function createManual(details){
 if(!details||typeof details!=='object')throw Error('Enter character details first.');
 const name=manualLabel(details.name,'Character name');
 const className=manualLabel(details.className,'Class');
 const level=manualInteger(details.level,'Level',1,20);
 const species=manualLabel(details.species,'Species');
 const background=String(details.background||'').trim().slice(0,80);
 const proficiency=2+Math.floor((level-1)/4);
 const scores=Object.fromEntries(abb.map(k=>[k,manualInteger(details.scores?.[k],k+' score',1,30)]));
 const modifiers=Object.fromEntries(abb.map(k=>[k,Math.floor((scores[k]-10)/2)]));
 const selectedSaves=details.saveProficiencies||[],selectedSkills=details.skillProficiencies||[];
 if(!Array.isArray(selectedSaves)||!Array.isArray(selectedSkills)||
    selectedSaves.some(k=>!abb.includes(k))||selectedSkills.some(k=>!Object.hasOwn(skillAbilities,k)))
  throw Error('Unsupported saving throw or skill proficiency.');
 const saveSet=new Set(selectedSaves),skillSet=new Set(selectedSkills);
 const ac=manualInteger(details.ac,'Armor class',1,40);
 const hp=manualInteger(details.hp,'Maximum HP',1,9999);
 const speed=manualInteger(details.speed,'Walking speed',0,999);
 const attack=details.attack||{},attackName=String(attack.name||'').trim();
 const attacks=[];
 if(attackName){
  if(attackName.length>80)throw Error('Attack name is too long.');
  const bonus=manualInteger(attack.bonus,'Attack bonus',-30,50);
  const damage=String(attack.damage||'').trim().replace(/\s+/g,'');
  if(!/^\d{1,2}d(?:4|6|8|10|12|20|100)(?:[+-]\d{1,3})?$/i.test(damage))
   throw Error('Attack damage must be a dice roll such as 1d8+3.');
  if(!['melee','ranged'].includes(attack.range))throw Error('Select melee or ranged for your attack.');
  attacks.push({name:attackName,bonus,damage,type:'attack',attack_type:'weapon',attack_range:attack.range});
 }
 return {
  schema_version:1,system_id:'dnd5e',system_edition:'dnd-2014',rules_profile:'manual',
  import_provenance:'Manual character creation (local)',
  name,player:String(details.player||'').trim().slice(0,80),class_level:className+' '+level,
  species,background,ac,initiative:modifiers.DEX,
  proficiency,speed:speed+' ft',hp:{max:hp,current:hp,temp:0},
  abilities:Object.fromEntries(abb.map(k=>[k,{score:scores[k],modifier:modifiers[k]}])),
  saves:Object.fromEntries(names.map((k,i)=>[k,modifiers[abb[i]]+(saveSet.has(abb[i])?proficiency:0)])),
  skills:Object.fromEntries(Object.entries(skillAbilities).map(([k,a])=>[k,modifiers[a]+(skillSet.has(k)?proficiency:0)])),
  attacks,actions:[],features:[],inventory:[],spells:[],resources:{},
  currency:{CP:0,SP:0,EP:0,GP:0,PP:0},conditions:[],roll_history:[],
  effects:{empty_body_rounds:0},notes:'Created manually. Review with your DM: class features, species traits, equipment, spells, rest resources, and house rules are not filled automatically.',
  homebrew_notes:''
 };
}
const api={fromFields,parseActions,createManual,skillAbilities};root.CharacterImport=api;
if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
