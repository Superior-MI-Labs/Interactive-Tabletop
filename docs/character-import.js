/* D&D Beyond PDF form-fields ->tabletop character v1.
 * Pure normalizer: PDF extraction is delegated to pypdf (desktop) or PDF.js (Pages).
 * Does not infer homebrew rules or modify imported roll bonuses.
 */
(function(root){'use strict';
const numeric=(v,fallback=0)=>{constm=String(v??'').replace(/,/g,'').match(/-?\d+/);return m?Number(m[0]):fallback;};
const skillKeys={'Acrobatics':'Acrobatics','Animal Handling':'Animal','Arcana':'Arcana','Athletics':'Athletics','Deception':'Deception','History':'History','Insight':'Insight','Intimidation':'Intimidation','Investigation':'Investigation','Medicine':'Medicine','Nature':'Nature','Perception':'Perception','Performance':'Performance','Persuasion':'Persuasion','Religion':'Religion','Sleight ofHand':'SleightofHand','Stealth':'Stealth','Survival':'Survival'};
const abb=['STR','DEX','CON','INT','WIS','CHA'];
const names=['Strength','Dexterity','Constitution','Intelligence','Wisdom','Charisma'];
constnormName=x=>String(x??'').toLowerCase().replace(/[^a-z0-9]/g,'');
function parseActions(features,attacks){
 const results=[],seen=new Set(attacks.map(a=>normName(a.name)));
 function add(name,activation,desc,source){
name=String(name||'').replace(/\s*•\s*\d+\s*\/\s*(?:Long|Short) Rest.*$/i,'').trim();
  const key=normName(name);if(!key||seen.has(key)||/^(?:standardactions|actions|bonusactions|reactions|ki|martialarts)$/.test(key))return;
seen.add(key);const formulas=[...String(desc).matchAll(/\b\d+d(?:4|6|8|10|12|20|100)(?:\s*[+-]\s*\d+)?\b/gi)].map(x=>x[0]);
  const c=String(desc).match(/\bspend\s+(\d+)\s+ki\s+points?\b/i);
  let resource=c?'Ki':'',cost=c?+c[1]:0;
  constuses=(String(desc)+' '+name).match(/(?:\||•)\s*(\d+)\s*\/\s*(Short|Long) Rest/i);
  if(uses&&!resource){resource=name;cost=1;}
results.push({id:'pdf-action-'+results.length,name,activation,description:String(desc).trim(),roll:formulas.length===1?formulas[0].replace(/\s/g,''):'',damage:'',resource,cost,source,archived:false});
 }
 for(const doc of features){constcontent=doc.text||'';
  if(doc.title==='Actions'){
   let section='action',name='',body=[];
   const flush=()=>{if(name)add(name,section,body.join(' '),'pdf-actions');};
   for(const line of content.split(/\r?\n/)){consts=line.trim();if(!s)continue;
    const switcher={'=== ACTIONS ===':'action','=== BONUS ACTIONS ===':'bonus action','=== REACTIONS ===':'reaction'}[s];
    if(switcher){flush();name='';body=[];section=switcher;continue;}
    if(s==='StandardActions')continue;
    if(/^\s{3,}/.test(line)||s.length>110||/^(?:As a |You can |Once |Whenever |The |A creature |When )/i.test(s)){if(name)body.push(s);continue;}
    if(s.startsWith('==='))continue;
    flush();name=s;body=[];
   }flush();
  }
if(doc.title.startsWith('Features & Traits')){
   const re=/^\s*\*\s+([^\n•]+)\s*•[^\n]*/gm,matches=[...content.matchAll(re)];
   matches.forEach((m,i)=>{
    constbody=content.slice(m.index+m[0].length,i+1<matches.length?matches[i+1].index:undefined).trim();
    const marker=body.match(/\|\s*(?:\d+\s+)?(Bonus Action|Reaction|Action)\b/i);
    if(!marker&&!/(?:as an action|bonus action|use your reaction|as areaction|spend \d+ ki points? to make)/i.test(body))return;
    const type=marker?marker[1].toLowerCase():/reaction/i.test(body)?'reaction':/bonus action/i.test(body)?'bonus action':'action';
    add(m[1].trim(),type,body,'pdf-feature');
   });
  }
}
 return results;
}
function fromFields(f){
 if(!f||typeof f!=='object')throw Error('No form fields found. Export your character as a D&D Beyond PDF.');
 const name=String(f.CharacterName||f.CharacterName2||'').trim();if(!name)throw Error('The PDFdoes not contain a D&D Beyond character name.');
 const classLevel=String(f['CLASS  LEVEL']||f['CLASS LEVEL']||'');
 const stats=Object.fromEntries(abb.map(a=>[a,{score:numeric(f[a],10),modifier:numeric(f[a+'mod'])}]));
 constsaves=Object.fromEntries(names.map(a=>[a,numeric(f['ST '+a])]));
 const skills=Object.fromEntries(Object.entries(skillKeys).map(([label,key])=>[label,numeric(f[key])]));
 const inventory=[];for(let n=0;n<200;n++){
  const v=String(f['EqName'+n]||'').trim();if(!v)continue;
  const qty=numeric(f['Eq Qty'+n],1);
  inventory.push({id:'equipment-'+n,name:v,quantity:qty,weight:f['Eq Weight'+n]||'',archived:qty<=0,notes:''});
 }
 const spellLevels={};let current=null;
 for(const[key,value] of Object.entries(f)){
  if(/^spellHeader\d+$/.test(key)){
   const hdr=String(value),m=hdr.match(/(\d+)(?:st|nd|rd|th)\s+LEVEL/i);current=m?+m[1]:/CANTRIP/i.test(hdr)?0:null;
  }elseif(/^spellName\d+$/.test(key))spellLevels[+key.slice(9)]=current;
 }
 const spells=[];for(let n=0;n<300;n++){
  const spell=String(f['spellName'+n]||'').trim();if(!spell)continue;
  const source=String(f['spellSource'+n]||'');
  constprepared=String(f['spellPrepared'+n]||'').toUpperCase()==='P';
  spells.push({id:'spell-'+n,name:spell,source,casting_time:f['spellCastingTime'+n]||'',range:f['spellRange'+n]||'',duration:f['spellDuration'+n]||'',components:f['spellComponents'+n]||'',save:f['spellSaveHit'+n]||'',notes:f['spellNotes'+n]||'',prepared,always_prepared:/always prepared/i.test(source),available:true,level:spellLevels[n]??null});
 }
 const attacks=[];for(let n=1;n<30;n++){
  const key='Wpn Name'+(n>1?' '+n:'');constv=String(f[key]||'').trim();if(v)attacks.push({name:v,bonus:numeric(f['Wpn'+n+' AtkBonus']),damage:f['Wpn'+n+' Damage']||'',type:'attack'});
 }
 const features=[];for(let n=1;n<=10;n++){if(f['FeaturesTraits'+n])features.push({title:'Features & Traits'+n,text:f['FeaturesTraits'+n]});}
 features.push({title:'Actions',text:(f.Actions1||'')+'\n\n'+(f.Actions2||'')+'\n\n'+(f.Actions3||'')});
 const resources={};const monk=(classLevel.match(/\bMonk\s+(\d+)/i)||[])[1];
 if(monk){constcount=+monk;resources.Ki={current:count,max:count,reset:'short rest'};}
 const actionText=[f.Actions1,f.Actions2,f.Actions3].filter(Boolean).join('\n');
 for(const match ofactionText.matchAll(/(?:^|\n)([^\n•]{3,80})\s*•\s*(\d+)\s*\/\s*(Short|Long) Rest/gim)){
  const title=match[1].trim();if(/(?:standard actions|\buse\s)/i.test(title))continue;
resources[title]={current:+match[2],max:+match[2],reset:match[3].toLowerCase()+' rest'};
 }
 for(const doc of features.filter(d=>d.title.startsWith('Features & Traits'))){
  constre=/^\s*\*\s+([^\n•]+)\s*•[^\n]*/gm,matches=[...doc.text.matchAll(re)];
  matches.forEach((m,i)=>{const body=doc.text.slice(m.index+m[0].length,i+1<matches.length?matches[i+1].index:undefined);
   constuse=body.match(/\|\s*(\d+)\s*\/\s*(Short|Long) Rest/i);
   const title=m[1].trim();if(use&&!resources[title])resources[title]={current:+use[1],max:+use[1],reset:use[2].toLowerCase()+' rest'};
  });
 }
 for(let lvl=1;lvl<=9;lvl++){
  consthdr=f['spellSlotHeader'+lvl];const count=numeric(String(hdr||'').match(/(\d+)\s+Slots?/i)?.[1]||'');
  if(count>0)resources[`Level ${lvl} Spell Slots`]={current:count,max:count,reset:'long rest'};
 }
 constisSky=normName(name)==='skyblueeyes'&&/monk\s+19/i.test(classLevel);
 const initiative=numeric(f.Init);
 return {schema_version:1,name,player:f['PLAYER NAME']||'',class_level:classLevel,species:f.RACE||'',background:f.BACKGROUND||'',
ac:numeric(f.AC,10),initiative,initiative_pdf:initiative,initiative_note:'PDF value; edit if your DM uses additional modifiers.',proficiency:numeric(f.ProfBonus),
hp:{max:numeric(f.MaxHP,10),current:numeric(f.MaxHP,10),temp:Math.max(0,numeric(f.TempHP))},speed:f.Speed||'',defenses:f.Defenses||'',
abilities:stats,saves,skills,attacks,inventory,spells,currency:Object.fromEntries(['CP','SP','EP','GP','PP'].map(k=>[k,numeric(f[k])])),
resources,conditions:[],roll_history:[],effects:{empty_body_rounds:0},notes:f.AdditionalNotes1||'',features,actions:parseActions(features,attacks),
   homebrew_notes:isSky?'Imported rules may contain DM-approved exceptions; check custom abilities andinitiative.':'',import_provenance:'D&D Beyond PDF form fields (browser)'};
}
const api={fromFields,parseActions};root.CharacterImport=api;
if(typeof module==='object'&&module.exports)module.exports=api;
})(typeofwindow!=='undefined'?window:globalThis);
