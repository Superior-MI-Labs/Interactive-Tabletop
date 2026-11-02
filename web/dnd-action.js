/* D&D-only action execution contract. No rule inference from imported prose.
   Imported actions remain descriptive until a player configures exact effects.
   Plans validate before mutation; costs and healing are never silently applied. */
(function(root){'use strict';
const SlotPools=root.DndSlots||(typeof require==='function'?require('./dnd-slots.js'):null);
if(!SlotPools)throw Error('D&D slot module was not loaded.');
const ALLOWED=new Set([4,6,8,10,12,20,100]);
// A turn belongs to the active character, not to a server timer or a separate combat database.
const CONDITIONS=new Set(['Blinded','Charmed','Deafened','Exhaustion','Frightened','Grappled',
 'Incapacitated','Invisible','Paralyzed','Petrified','Poisoned','Prone','Restrained','Stunned','Unconscious']);
const deepcopy=value=>JSON.parse(JSON.stringify(value));
function combat(character){
 if(!character.effects||typeof character.effects!=='object')character.effects={};
 const c=character.effects.combat;
 if(!c||typeof c!=='object')character.effects.combat={active:false,turn:1,used:{action:false,bonus:false,reaction:false}};
 const state=character.effects.combat;
 if(!state.used||typeof state.used!=='object')state.used={action:false,bonus:false,reaction:false};
 for(const key of ['action','bonus','reaction'])state.used[key]=Boolean(state.used[key]);
 if(!Number.isSafeInteger(state.turn)||state.turn<1)state.turn=1;
 state.active=Boolean(state.active);
 return state;
}
function activationCost(raw){
 const text=String(raw||'').trim().toLowerCase();
 if(/^(?:1\s*)?(?:bonus action)$/.test(text))return 'bonus';
 if(/^(?:1\s*)?reaction$/.test(text))return 'reaction';
 if(/^(?:1\s*)?action$/.test(text))return 'action';
 return null; // 'special', minute casting, etc. require DM adjudication.
}
function verifyEconomy(character,validated){
 const state=combat(character),type=activationCost(validated.activation);
 if(state.active&&type&&state.used[type])throw Error('Your '+type+' is already used this turn. Advance the turn or ask your DM to reset it.');
 return type;
}
function commitUsage(character,validated){
 if(!character||!validated||!Number.isSafeInteger(validated.cost)||validated.cost<0)throw Error('Invalid ability plan.');
 const type=verifyEconomy(character,validated);
 const pool=validated.cost?character.resources?.[validated.resource]:null;
 if(validated.cost&&(!pool||!Number.isFinite(Number(pool.current))||Number(pool.current)<validated.cost))throw Error('Not enough '+validated.resource+'.');
 // All guards are complete before either the resource or turn state changes.
 if(validated.cost)pool.current=Number(pool.current)-validated.cost;
 const state=combat(character);
 if(state.active&&type){state.used[type]=true;delete state.undo_turn;}
 return type;
}
function markAction(character,type){
 if(!['action','bonus','reaction'].includes(type))throw Error('Unknown action category.');
 const state=combat(character);
 if(!state.active)throw Error('Start encounter tracking before marking actions.');
 if(state.used[type])throw Error('That '+type+' is already spent.');
 state.used[type]=true;delete state.undo_turn;
}
function setEncounter(character,enabled){
 const state=combat(character);
 state.active=Boolean(enabled);state.turn=1;state.used={action:false,bonus:false,reaction:false};delete state.undo_turn;
 return state;
}

function dice(expression){
 if(!expression)return null;
 const m=/^\s*(\d{0,2})d(4|6|8|10|12|20|100)\s*([+-]\s*\d{1,5})?\s*$/i.exec(String(expression));
 if(!m)throw Error('Unsupported dice formula. Use 1d20+5 or 2d6+3.');
 const count=Number(m[1]||1),sides=Number(m[2]),modifier=Number((m[3]||'0').replace(/\s/g,''));
 if(!ALLOWED.has(sides)||count<1||count>20||!Number.isSafeInteger(modifier))throw Error('Dice must be 1–20 supported dice.');
 return {count,sides,modifier,expression:`${count}d${sides}${modifier?modifier>0?`+${modifier}`:String(modifier):''}`};
}
// A single d20 check keeps its raw face so natural attack results remain
// distinguishable from the final total. Advantage never changes the modifier.
function resolveD20(faces,modifier=0,mode='normal'){
 if(!['normal','advantage','disadvantage'].includes(mode))throw Error('Unknown d20 roll mode.');
 const expected=mode==='normal'?1:2;
 if(!Array.isArray(faces)||faces.length!==expected||faces.some(v=>!Number.isSafeInteger(v)||v<1||v>20))
  throw Error('d20 roll must have '+expected+' valid physical '+(expected===1?'face':'faces')+'.');
 if(!Number.isSafeInteger(modifier))throw Error('Invalid d20 modifier.');
 const natural=mode==='advantage'?Math.max(...faces):mode==='disadvantage'?Math.min(...faces):faces[0];
 return {natural,total:natural+modifier,parts:[...faces],modifier,mode};
}
// On a 2014 critical hit double ONLY damage dice, not flat bonuses.
// This doesn't attempt to determine which extra class-feature dice qualify;
// they must be rolled/configured explicitly under the DM's ruling.
function criticalDamageExpression(expression){
 const rolled=dice(expression);
 if(!rolled||rolled.count*2>20)throw Error('Critical damage requires up to 10 of one supported die type.');
 return dice(`${rolled.count*2}d${rolled.sides}${rolled.modifier>=0?'+':''}${rolled.modifier}`).expression;
}
function duration(value){
 const n=Number(value??0);
 if(!Number.isSafeInteger(n)||n<0||n>999)throw Error('Duration must be 0–999 rounds (0 is untimed).');
 return n;
}
function spellSlots(character){
 return SlotPools.list(character?.resources).map(({level,resource,current,max})=>({level,resource,current,max}));
}
// Only an explicitly enabled, edition-pinned SRD profile may drive an imported spell.
// Manual/homebrew overrides do not inherit effects from similar spell names.
function castingModifier(character,spell){
 if(Number.isSafeInteger(spell.spellcasting_modifier))return spell.spellcasting_modifier;
 const source=String(spell.source||'');
 const override=/\b(Wisdom|Intelligence|Charisma)\b/i.exec(source);
 const klass=/\b(Cleric|Druid|Ranger|Paladin|Bard|Sorcerer|Warlock|Wizard)\b/i.exec(source);
 const ability=override?{wisdom:'WIS',intelligence:'INT',charisma:'CHA'}[override[1].toLowerCase()]:
  klass?{Cleric:'WIS',Druid:'WIS',Ranger:'WIS',Paladin:'CHA',Bard:'CHA',Sorcerer:'CHA',Warlock:'CHA',Wizard:'INT'}[klass[1]]:null;
 if(!ability)throw Error('Set the spellcasting modifier in Edit sheet for this spell.');
 const value=character.abilities?.[ability]?.modifier;
 if(!Number.isSafeInteger(value))throw Error('Missing '+ability+' spellcasting modifier.');
 return value;
}
function planSpell(character,spell,slotLevel,profile=null){
 if(!character||!spell||spell.available===false)throw Error('Spell is unavailable.');
 const level=Number(spell.level);
 if(spell.level===null||spell.level===undefined||!Number.isSafeInteger(level)||level<0||level>9)
  throw Error('Set the spell level before casting.');
 if(level>0&&!spell.prepared&&!spell.always_prepared)throw Error('Prepare this spell before casting.');
 const slot=Number(slotLevel??level);
 if(!Number.isSafeInteger(slot)||slot<level||slot>9||(level===0&&slot!==0))
  throw Error('Invalid casting slot level.');
 const slotPool=slot===0?null:SlotPools.poolFor(character.resources,slot);
 const resource=slot===0?'':(slotPool?.resource||SlotPools.canonical(slot)),cost=slot===0?0:1;
 if(cost){
  if(!slotPool)throw Error(`No level ${slot} spell slot pool. Check your imported slots.`);
  if(slotPool.current<1)throw Error('No level '+slot+' spell slots remaining.');
 }
 let effect=spell.effect_kind||'none';
 if(!['none','heal','condition','damage'].includes(effect))throw Error('Unsupported spell effect.');
 let roll=dice(spell.roll||'');
 let acBonus=0,bonusDice='',charges=0,automatic=false;
 let target='self';
 let rounds=duration(spell.duration_rounds);
 let concentration=typeof spell.concentration==='boolean'?spell.concentration:/\bconcentration\b/i.test(String(spell.duration||''));
 if(spell.automation==='srd-2014'){
  if(character.system_edition&&/2024|5\.5|srd.?5\.2/i.test(String(character.system_edition)))throw Error('2014 automation is not enabled for a 2024 edition character.');
  const spellKey=String(spell.name||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  if(!profile||profile.schema!=='srd51-spell-effect/1'||profile.target!=='self'||
     profile.spell_id!=='srd51:spell:'+spellKey||profile.base_level!==level)
    throw Error('Matching 2014 SRD spell profile is unavailable.');
  automatic=true;
  target='self';
  switch(profile.type){
   case 'heal':{
    if(profile.dice!=='d8'||profile.base_dice!==1||profile.dice_per_slot_above_base!==1||profile.modifier!=='spellcasting'||level!==1)throw Error('Unsupported healing profile.');
    const mod=castingModifier(character,spell);
    roll=dice(`${slot}d8${mod>=0?'+':''}${mod}`);
    effect='heal';break;
   }
   case 'ac_bonus':
    if(profile.amount!==2||profile.duration_rounds!==100||!profile.concentration)throw Error('Unsupported armor profile.');
    effect='ac_bonus';acBonus=profile.amount;rounds=profile.duration_rounds;concentration=true;roll=null;break;
   case 'check_bonus':
    if(profile.dice!=='1d4'||profile.charges!==1||profile.duration_rounds!==10||!profile.concentration)throw Error('Unsupported check-bonus profile.');
    effect='check_bonus';bonusDice=profile.dice;charges=profile.charges;rounds=profile.duration_rounds;concentration=true;roll=null;break;
   default:throw Error('Unsupported SRD automation profile.');
  }
 }
 if(!['none','heal','condition','damage','ac_bonus','check_bonus'].includes(effect))throw Error('Unsupported spell effect.');
 if(effect==='heal'&&!roll)throw Error('Healing needs a configured dice expression.');
 if(effect==='damage'&&!roll)throw Error('Damage needs a configured dice expression.');
 const damageType=effect==='damage'?String(spell.damage_type||'untyped').toLowerCase():'untyped';
 if(!DAMAGE_TYPES.includes(damageType))throw Error('Invalid spell damage type.');
 const condition=effect==='condition'?String(spell.effect_condition||'').trim():'';
 if(effect==='condition'&&!CONDITIONS.has(condition))throw Error('Choose a supported self-condition.');
 return Object.freeze({kind:'spell',name:String(spell.name||'Spell'),sourceId:String(spell.id||spell.name||'spell'),resource,cost,roll,effect,
  concentration,durationRounds:rounds,activation:String(automatic?(profile.type==='ac_bonus'?'bonus action':'action'):spell.casting_time||'special'),slotLevel:slot,condition,acBonus,bonusDice,charges,target,automatic,damageType});
}
function plan(character,action){
 if(!character||!action||action.archived)throw Error('Ability is not available.');
 const cost=Number(action.cost||0);
 if(!Number.isSafeInteger(cost)||cost<0||cost>9999)throw Error('Invalid ability resource cost.');
 const resource=String(action.resource||'').trim();
 if(cost&&!resource)throw Error('Set a resource name before applying this ability.');
 if(cost){
  const pool=character.resources?.[resource];
  if(!pool||!Number.isFinite(Number(pool.current)))throw Error('Resource not found: '+resource);
  if(Number(pool.current)<cost)throw Error('Not enough '+resource+' ('+pool.current+'/'+cost+').');
 }
 const effect=action.effect_kind||'none';
 if(!['none','heal','condition','damage'].includes(effect))throw Error('Unsupported ability effect.');
 const roll=dice(action.roll||'');
 if(effect==='heal'&&!roll)throw Error('Healing requires a configured dice expression.');
 if(effect==='damage'&&!roll&&!action.damage)throw Error('Damage requires a configured dice expression.');
 const damageType=effect==='damage'?String(action.damage_type||'untyped').toLowerCase():'untyped';
 if(!DAMAGE_TYPES.includes(damageType))throw Error('Invalid ability damage type.');
 const condition=effect==='condition'?String(action.effect_condition||'').trim():'';
 if(effect==='condition'&&!CONDITIONS.has(condition))throw Error('Choose a supported self-condition.');
 if(action.damage)dice(action.damage); // Validate all configured dice before mutation.
 return Object.freeze({kind:'ability',name:String(action.name||'Ability'),sourceId:String(action.id||action.name||'ability'),resource,cost,roll,effect,
   concentration:action.concentration===true,durationRounds:duration(action.duration_rounds),activation:String(action.activation||'special'),condition,damageType});
}
// Deprecated invocation remains for the existing tests and callers: one commit path.
function commit(character,validated){return commitUsage(character,validated);}
function activeEffects(character){
 if(!character.effects||typeof character.effects!=='object')character.effects={};
 if(!Array.isArray(character.effects.active))character.effects.active=[];
 return character.effects.active;
}
function endEffect(character,id){
 const effects=activeEffects(character),removed=effects.filter(e=>e.id===id);
 if(!removed.length)return false;
 character.effects.active=effects.filter(e=>e.id!==id);
 // A finished concentration effect cannot retain an unresolved DC prompt.
 if(Array.isArray(character.effects.pending_concentration))character.effects.pending_concentration=character.effects.pending_concentration.filter(check=>check.effect_id!==id);
 for(const effect of removed){
  if(!effect.condition_owned||!effect.condition)continue;
  const successor=character.effects.active.find(e=>e.condition===effect.condition);
  if(successor)successor.condition_owned=true;
  else if(Array.isArray(character.conditions))character.conditions=character.conditions.filter(c=>c!==effect.condition);
 }
 return true;
}
function startEffect(character,validated){
 if(!validated||(!validated.concentration&&!validated.durationRounds&&!validated.condition&&!validated.acBonus&&!validated.charges))return null;
 const effects=activeEffects(character);
 // Remove old concentration with the same cleanup as manual ending and expiration.
 if(validated.concentration)for(const effect of [...effects])if(effect.concentration)endEffect(character,effect.id);
 const id=`${validated.kind}:${validated.sourceId}`;
 endEffect(character,id); // Recast replaces a previous instance instead of duplicating it.
 const condition=validated.condition||'';
 if(!Array.isArray(character.conditions))character.conditions=[];
 const owned=Boolean(condition&&!character.conditions.includes(condition));
 if(owned)character.conditions.push(condition);
 const row={id,name:validated.name,concentration:Boolean(validated.concentration),
  rounds_remaining:validated.durationRounds||null,ac_bonus:validated.acBonus||0,
  modifiers:validated.acBonus?[{stat:'ac',amount:validated.acBonus}]:[],
  stack_key:'spell:'+String(validated.name||validated.sourceId).toLowerCase().replace(/[^a-z0-9]/g,''),charges:validated.charges||0,bonus_dice:validated.bonusDice||'',target:validated.target||'self',...(condition?{condition,condition_owned:owned}:{})};
 activeEffects(character).push(row);
 return row;
}
// Derived modifiers are effect data, never patches to imported base statistics.
// 2014 repeated effects of the same spell name do not stack; distinct spells may.
function modifierTotal(character,stat,targetId='self'){
 const bySource=new Map();
 for(const e of activeEffects(character)){
  if((e.target||'self')!==targetId)continue;
  const rows=Array.isArray(e.modifiers)?e.modifiers:
   Number.isFinite(e.ac_bonus)&&e.ac_bonus?[{stat:'ac',amount:e.ac_bonus}]:[];
  const key=e.stack_key||('spell:'+String(e.name||e.id).trim().toLowerCase());
  for(const row of rows){
   if(row.stat!==stat||!Number.isSafeInteger(row.amount)||Math.abs(row.amount)>100)continue;
   const prior=bySource.get(key);
   // More beneficial equivalent effects win; penalties of the same name don't multiply.
   if(prior===undefined||row.amount>prior)bySource.set(key,row.amount);
  }
 }
 return [...bySource.values()].reduce((sum,n)=>sum+n,0);
}
function effectiveAC(character,targetId='self'){
 const target=targetId==='self'?character:targetById(character,targetId);
 const base=Number(target?.ac);
 if(!Number.isFinite(base))throw Error('Target armor class is unavailable.');
 return base+modifierTotal(character,'ac',targetId);
}
function consumeCharge(character,id){
 const e=activeEffects(character).find(x=>x.id===id);
 if(!e||!Number.isSafeInteger(e.charges)||e.charges<1||!e.bonus_dice)throw Error('No charged bonus available.');
 const bonus=dice(e.bonus_dice); // Validate before changing character state.
 e.charges--;
 if(!e.charges)endEffect(character,id);
 return bonus;
}
function concentrationDC(damage){
 if(!Number.isSafeInteger(damage)||damage<0)throw Error('Damage must be nonnegative.');
 return Math.max(10,Math.ceil(damage/2));
}
function queueConcentrationCheck(character,damage){
 const dc=concentrationDC(damage);
 if(!damage)return null;
 const e=activeEffects(character).find(x=>x.concentration);
 if(!e)return null;
 const effects=character.effects;
 if(!Array.isArray(effects.pending_concentration))effects.pending_concentration=[];
 const check={id:`con-${Date.now()}-${effects.pending_concentration.length}`,effect_id:e.id,dc};
 effects.pending_concentration.push(check);
 return check;
}
function resolveConcentrationCheck(character,id,total){
 if(!Number.isFinite(total))throw Error('Invalid concentration roll total.');
 const queue=character.effects?.pending_concentration;
 if(!Array.isArray(queue))return null;
 const check=queue.find(x=>x.id===id);
 if(!check)return null;
 const effect=activeEffects(character).find(x=>x.id===check.effect_id);
 if(!effect){character.effects.pending_concentration=queue.filter(x=>x.id!==id);return null;}
 const success=total>=check.dc;
 if(success)character.effects.pending_concentration=queue.filter(x=>x.id!==id);
 else endEffect(character,effect.id);
 return {success,dc:check.dc,effectName:effect.name,total};
}
function advanceEffects(character){
 const effects=activeEffects(character),expired=[];
 for(const e of [...effects]){
  if(e.rounds_remaining===null)continue;
  if(!Number.isSafeInteger(e.rounds_remaining)||e.rounds_remaining<=1){expired.push(e.name);endEffect(character,e.id);}
  else e.rounds_remaining--;
 }
 return expired;
}
function advanceTurn(character){
 const state=combat(character);
 const snapshot={turn:state.turn,active:state.active,used:deepcopy(state.used),
  effects:deepcopy(activeEffects(character)),conditions:deepcopy(character.conditions||[]),pending_concentration:deepcopy(character.effects.pending_concentration||[]),
  empty_body_rounds:character.effects.empty_body_rounds||0,
  shield_points:character.resources?.['Shield Stance Points']?.current};
 if(state.active){state.turn++;state.used={action:false,bonus:false,reaction:false};}
 const expired=advanceEffects(character);
 if(character.resources?.['Shield Stance Points'])character.resources['Shield Stance Points'].current=0;
 if(character.effects.empty_body_rounds>0){
  character.effects.empty_body_rounds--;
  if(character.effects.empty_body_rounds===0)character.conditions=character.conditions.filter(x=>x!=='Invisible');
 }
 state.undo_turn=snapshot;
 return expired;
}
function undoTurn(character){
 const state=combat(character),before=state.undo_turn;
 if(!before)return false;
 state.turn=before.turn;state.active=before.active;state.used=before.used;
 character.effects.active=before.effects;character.conditions=before.conditions;character.effects.pending_concentration=before.pending_concentration||[];
 character.effects.empty_body_rounds=before.empty_body_rounds;
 if(before.shield_points!==undefined&&character.resources?.['Shield Stance Points'])character.resources['Shield Stance Points'].current=before.shield_points;
 delete state.undo_turn;
 return true;
}
function applyHealing(character,amount){
 if(!Number.isSafeInteger(amount)||amount<0)throw Error('Invalid healing amount.');
 if(!character?.hp||!Number.isFinite(Number(character.hp.max)))throw Error('Character has no hit points.');
 const before=Number(character.hp.current)||0;
 character.hp.current=Math.min(Number(character.hp.max),Math.max(0,before)+amount);
 return character.hp.current-before;
}
// Small, explicit encounter target records. No statblock ingestion or inferred monster rules.
// Targets live inside this character's combat state and never become separate vault entries.
const DAMAGE_TYPES=Object.freeze(['untyped','acid','bludgeoning','cold','fire','force','lightning','necrotic','piercing','poison','psychic','radiant','slashing','thunder']);
const ABILITIES=Object.freeze(['STR','DEX','CON','INT','WIS','CHA']);
function boundedInteger(raw,label,lo=0,hi=999999){
 const n=Number(raw);
 if(!Number.isSafeInteger(n)||n<lo||n>hi)throw Error(label+' must be an integer from '+lo+' to '+hi+'.');
 return n;
}
function targets(character){
 combat(character);
 if(!Array.isArray(character.effects.targets))character.effects.targets=[];
 return character.effects.targets;
}
function targetById(character,id){
 if(id==='self')return character;
 return targets(character).find(t=>t.id===id)||null;
}
function damageTraits(values){
 if(values==null||values==='')return [];
 const items=Array.isArray(values)?values:String(values).split(',');
 if(!Array.isArray(items))throw Error('Invalid damage traits.');
 const chosen=[...new Set(items.map(v=>String(v).trim().toLowerCase()).filter(Boolean))];
 for(const item of chosen)if(!DAMAGE_TYPES.includes(item)||item==='untyped')throw Error('Unknown damage type: '+item);
 return chosen;
}
function targetTraits(character,id){
 const source=id==='self'?character.effects?.self_traits:targetById(character,id)?.traits;
 return {
  resistances:damageTraits(source?.resistances),
  vulnerabilities:damageTraits(source?.vulnerabilities),
  immunities:damageTraits(source?.immunities)
 };
}
function setTargetTraits(character,id,kind,values){
 if(!['resistances','vulnerabilities','immunities'].includes(kind))throw Error('Invalid trait category.');
 const parsed=damageTraits(values); // Validate before mutation.
 const entity=targetById(character,id);
 if(!entity)throw Error('Target is no longer available.');
 if(id==='self'){
  if(!character.effects.self_traits)character.effects.self_traits={};
  character.effects.self_traits[kind]=parsed;
 }else{
  if(!entity.traits)entity.traits={};
  entity.traits[kind]=parsed;
 }
 return parsed;
}
// Target conditions are explicit manual adjudications. No save, damage or
// duration is inferred from a label. All records live with the encounter.
function setTargetCondition(character,id,name,enabled){
 if(!CONDITIONS.has(name))throw Error('Unknown D&D condition.');
 const entity=targetById(character,id);
 if(!entity)throw Error('Target no longer exists.');
 if(!Array.isArray(entity.conditions))entity.conditions=[];
 if(enabled&&!entity.conditions.includes(name))entity.conditions.push(name);
 if(!enabled)entity.conditions=entity.conditions.filter(x=>x!==name);
 return [...entity.conditions];
}
function addTarget(character,details){
 const name=String(details?.name||'').trim();
 if(!name||name.length>70)throw Error('Target name must be 1–70 characters.');
 const ac=boundedInteger(details.ac,'AC',0,99);
 const max=boundedInteger(details.hp,'HP',1,999999);
 const roster=targets(character);
 if(roster.length>=20)throw Error('Encounter target limit is 20.');
 if(roster.some(t=>t.name.toLowerCase()===name.toLowerCase()))throw Error('A target with this name already exists.');
 const seq=boundedInteger(character.effects.target_sequence||0,'Target sequence',0,999999)+1;
 const target={id:'target-'+seq,name,ac,hp:{max,current:max,temp:0},
  saves:Object.fromEntries(ABILITIES.map(k=>[k,0])),traits:{resistances:[],vulnerabilities:[],immunities:[]}};
 character.effects.target_sequence=seq;roster.push(target);
 return target;
}
function removeTarget(character,id){
 if(id==='self')throw Error('Cannot remove the character from the encounter.');
 const roster=targets(character),index=roster.findIndex(t=>t.id===id);
 if(index<0)return false;
 roster.splice(index,1);
 return true;
}
function updateTargetStat(character,id,field,value){
 if(id==='self')throw Error('Edit your character through the Character sheet.');
 const target=targetById(character,id);
 if(!target)throw Error('Target not found.');
 let n;
 if(field==='ac')n=boundedInteger(value,'AC',0,99);
 else if(field==='hp.current'||field==='hp.temp'||field==='hp.max')n=boundedInteger(value,'HP',field==='hp.max'?1:0);
 else if(/^saves\.(STR|DEX|CON|INT|WIS|CHA)$/.test(field))n=boundedInteger(value,'Saving throw modifier',-50,50);
 else throw Error('Unsupported target field.');
 const [parent,key]=field.split('.');
 if(key)target[parent][key]=n;else target[field]=n;
 if(parent==='hp'&&key==='max')target.hp.current=Math.min(target.hp.current,n);
 if(parent==='hp'&&key==='current')target.hp.current=Math.min(target.hp.max,n);
 return target;
}
function undoLastDamage(character){
 const state=combat(character),undo=state.last_damage_undo;
 if(!undo)return false;
 const target=targetById(character,undo.targetId);
 if(!target||target.hp.current!==undo.after.current||(target.hp.temp||0)!==undo.after.temp){delete state.last_damage_undo;throw Error('Target HP changed since damage. Undo is no longer safe.');}
 target.hp.current=undo.before.current;target.hp.temp=undo.before.temp;
 if(undo.check_id&&Array.isArray(character.effects.pending_concentration))
  character.effects.pending_concentration=character.effects.pending_concentration.filter(c=>c.id!==undo.check_id);
 delete state.last_damage_undo;
 return true;
}
function evaluateAttack(total,ac,natural=null){
 boundedInteger(total,'Attack total',-999999,999999);
 boundedInteger(ac,'AC',0,999);
 if(natural!==null)boundedInteger(natural,'Natural d20',1,20);
 const critical=natural===20,hit=critical||natural!==1&&total>=ac;
 return {hit,critical,automaticMiss:natural===1,targetAC:ac,total};
}
function evaluateSave(total,dc){
 boundedInteger(total,'Save total',-999999,999999);
 boundedInteger(dc,'Save DC',0,99);
 return {success:total>=dc,total,dc}; // 2014 saves do not auto-fail on natural 1.
}
function planDamage(character,targetId,details){
 const target=targetById(character,targetId);
 if(!target)throw Error('Choose a valid target.');
 const type=String(details?.type||'untyped').trim().toLowerCase();
 if(!DAMAGE_TYPES.includes(type))throw Error('Choose a supported damage type.');
 const raw=boundedInteger(details.amount,'Damage',0,999999);
 const outcome=String(details.saveOutcome||'none');
 const policy=String(details.savePolicy||'none');
 if(!['none','success','failure'].includes(outcome)||!['none','half','negates'].includes(policy))throw Error('Invalid saving throw outcome.');
 if(outcome!=='none'&&policy==='none'||outcome==='none'&&policy!=='none')throw Error('Specify both a saving throw outcome and its damage rule.');
 let reduced=raw;
 if(outcome==='success'){
  if(policy==='half')reduced=Math.floor(reduced/2);
  if(policy==='negates')reduced=0;
 }
 const traits=targetTraits(character,targetId);
 const immune=type!=='untyped'&&traits.immunities.includes(type);
 const resistant=type!=='untyped'&&traits.resistances.includes(type);
 const vulnerable=type!=='untyped'&&traits.vulnerabilities.includes(type);
 if(immune)reduced=0;
 else {
  if(resistant)reduced=Math.floor(reduced/2);
  if(vulnerable)reduced*=2;
 }
 const hp=target.hp;
 if(!hp||!Number.isSafeInteger(hp.current)||!Number.isSafeInteger(hp.max)||!Number.isSafeInteger(hp.temp||0))throw Error('Invalid target HP.');
 const absorbed=Math.min(hp.temp||0,reduced),loss=Math.min(hp.current,Math.max(0,reduced-absorbed));
 return {targetId,type,raw,amount:reduced,absorbed,hpLoss:loss,saveOutcome:outcome,savePolicy:policy,
   initial:{current:hp.current,max:hp.max,temp:hp.temp||0},immune,resistant,vulnerable};
}
function commitDamage(character,planned){
 if(!planned||!Number.isSafeInteger(planned.amount))throw Error('Invalid damage plan.');
 const target=targetById(character,planned.targetId);
 if(!target)throw Error('Target has been removed.');
 const fresh=planDamage(character,planned.targetId,{amount:planned.raw,type:planned.type,saveOutcome:planned.saveOutcome,savePolicy:planned.savePolicy});
 if(JSON.stringify(fresh)!==JSON.stringify(planned))throw Error('Target or defenses changed; preview the damage again.');
 const state=combat(character);
 state.last_damage_undo={targetId:planned.targetId,before:{...fresh.initial},after:{current:fresh.initial.current-fresh.hpLoss,temp:fresh.initial.temp-fresh.absorbed},check_id:null};
 target.hp.temp=(target.hp.temp||0)-fresh.absorbed;target.hp.current-=fresh.hpLoss;
 const check=planned.targetId==='self'&&fresh.amount>0?queueConcentrationCheck(character,fresh.amount):null;
 state.last_damage_undo.check_id=check?.id||null;
 return {...fresh,concentrationCheck:check};
}
const api={dice,resolveD20,criticalDamageExpression,plan,planSpell,spellSlots,commit,commitUsage,combat,activationCost,verifyEconomy,markAction,setEncounter,advanceTurn,undoTurn,activeEffects,startEffect,endEffect,advanceEffects,applyHealing,effectiveAC,consumeCharge,concentrationDC,queueConcentrationCheck,resolveConcentrationCheck,castingModifier,modifierTotal,targets,targetById,addTarget,removeTarget,updateTargetStat,damageTraits,targetTraits,setTargetTraits,setTargetCondition,evaluateAttack,evaluateSave,planDamage,commitDamage,undoLastDamage,DAMAGE_TYPES,ABILITIES,CONDITIONS};root.DndAction=api;
if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
