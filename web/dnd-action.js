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
let nextEffectInstance=0;
function combat(character){
 if(!character.effects||typeof character.effects!=='object')character.effects={};
 const c=character.effects.combat;
 if(!c||typeof c!=='object')character.effects.combat={active:false,turn:1,used:{action:false,bonus:false,reaction:false}};
 const state=character.effects.combat;
 if(!state.used||typeof state.used!=='object')state.used={action:false,bonus:false,reaction:false};
 for(const key of ['action','bonus','reaction'])state.used[key]=Boolean(state.used[key]);
 if(!Number.isSafeInteger(state.turn)||state.turn<1)state.turn=1;
 state.active=Boolean(state.active);
 // A spell-cast restriction is a turn resource, not an extra character rule store.
 // Older vaults have no ledger; only casts committed after this upgrade are recorded.
 if(!state.spellcasting||typeof state.spellcasting!=='object')state.spellcasting={};
 state.spellcasting.bonus=state.spellcasting.bonus===true;
 state.spellcasting.restricted=state.spellcasting.restricted===true;
 // Turn pools are authoritative. Legacy `used` remains a read-only compatible
 // projection, never a second spending ledger.
 if(!state.economy||typeof state.economy!=='object'){
  state.economy={auto:true,spent:Object.fromEntries(['action','bonus','reaction'].map(k=>[k,state.used[k]?1:0])),
   attacks:{made:0,remaining:0},grants:[]};
 }
 const e=state.economy;
 // Canonical combat assistance is one mode, not separate auto/guided flags.
 // Old saves with economy.auto are migrated in place without changing their ledger.
 if(!['auto','guided','manual'].includes(e.mode))e.mode=e.auto===false?'manual':'auto';
 e.auto=e.mode!=='manual'; // compatibility projection for old tests/exports
 if(!e.spent||typeof e.spent!=='object')e.spent={};
 for(const k of ['action','bonus','reaction']){
  if(!Number.isSafeInteger(e.spent[k])||e.spent[k]<0)e.spent[k]=state.used[k]?1:0;
  state.used[k]=e.spent[k]>0;
 }
 if(!e.attacks||typeof e.attacks!=='object')e.attacks={made:0,remaining:0};
 for(const k of ['made','remaining'])if(!Number.isSafeInteger(e.attacks[k])||e.attacks[k]<0)e.attacks[k]=0;
 if(!Array.isArray(e.grants))e.grants=[];
 if(!Array.isArray(e.attackGrants))e.attackGrants=[];
 // Character backups can include older or manually edited turn ledgers.
 // An invalid grant must never create a free strike or poison calculations.
 e.attackGrants=e.attackGrants.filter(g=>g&&typeof g.source==='string'&&g.source.length>0&&
  ['unarmed','weapon','any'].includes(g.scope)&&Number.isSafeInteger(g.remaining)&&g.remaining>=0&&g.remaining<=4);
 if(!Number.isSafeInteger(e.attackActionMade)||e.attackActionMade<0)e.attackActionMade=e.attacks.made; // legacy saves
 if(!['attack','other',null].includes(e.lastActivity))e.lastActivity=null;
 return state;
}
function activationCost(raw){
 const text=String(raw||'').trim().toLowerCase();
 if(/^(?:1\s*)?(?:bonus action)$/.test(text))return 'bonus';
 if(/^(?:1\s*)?reaction$/.test(text))return 'reaction';
 if(/^(?:1\s*)?action$/.test(text))return 'action';
 return null; // 'special', minute casting, etc. require DM adjudication.
}
// 2014 PHB/SRD: after casting any bonus-action spell on a turn, the only
// other spell permitted that turn is a cantrip with casting time 1 action.
// Evaluate committed plans rather than parsing prose or individual spell names.
function follows2014(character){return character.system_edition==='dnd-2014';}
function actionCantrip(plan){return plan.kind==='spell'&&plan.slotLevel===0&&activationCost(plan.activation)==='action';}
// The configured pool quantities are explicit player/DM settings. Never derive
// actions, attacks or feature costs from untrusted imported feature prose.
const POOL_NAMES=['action','bonus','reaction'];
// Explicit DM/player event windows, not a text parser or an autonomous combat log.
// Each window is short-lived and consumed by exactly one committed ability.
const EVENT_KINDS=['incoming-attack','ranged-hit','melee-hit'];
function combatEvent(character){return combat(character).event_window||null;}
function setCombatEvent(character,kind,origin=null){
 if(!EVENT_KINDS.includes(kind))throw Error('Unknown combat event.');
 const state=combat(character);
 if(!state.active)throw Error('Start encounter tracking before confirming a combat event.');
 if(state.pending_workflow)throw Error('Finish the pending reaction before opening another event.');
 const next=(state.event_sequence||0)+1;
 if(!Number.isSafeInteger(next))throw Error('Combat event sequence exhausted.');
 state.event_sequence=next;
 state.event_window={id:'event-'+next,kind,used:false,...(origin?{origin:origin.origin,rollId:origin.rollId,sourceId:origin.sourceId,targetId:origin.targetId}:{})};
 delete state.undo_turn;
 return deepcopy(state.event_window);
}
function recordCombatEvent(character,kind){return setCombatEvent(character,kind);}
function dismissCombatEvent(character){delete combat(character).event_window;return true;}
// A resolved physical attack is evidence for a typed trigger, not an ability.
// The dice controller supplies the already-settled identity and the planner
// rechecks the current explicit classification, target and result. Imported
// descriptions and names are never used to infer melee/ranged mechanics.
function attackRange(attack){
 const range=attack?.attack_range??'unspecified';
 if(!['melee','ranged','unspecified'].includes(range))throw Error('Unsupported attack range.');
 return range;
}
function recordResolvedAttack(character,record){
 const state=combat(character);
 if(!state.active||!state.economy.auto)return null;
 if(!state.economy.attacks.made)throw Error('A completed, committed attack is required before its hit can trigger an ability.');
 if(!record||typeof record!=='object')throw Error('Invalid completed attack.');
 const {rollId,sourceIndex,targetId,attackId,attackType:rolledType,attackRange:rolledRange,total,natural,adjudication}=record;
 if(typeof rollId!=='string'||!/^attack-roll-[a-z0-9-]{1,90}$/i.test(rollId))throw Error('Invalid attack roll identity.');
 if(!Number.isSafeInteger(sourceIndex)||sourceIndex<0||sourceIndex>= (character.attacks||[]).length)throw Error('Attack source was removed.');
 const source=character.attacks[sourceIndex];
 if(String(source.id||source.name)!==attackId||attackType(source)!==rolledType||attackRange(source)!==rolledRange)throw Error('Attack source changed since the dice were thrown.');
 if(attackRange(source)!=='melee'||!['weapon','unarmed'].includes(attackType(source)))return null;
 if(targetId==='self'||!targetById(character,targetId))return null;
 if(!Number.isSafeInteger(total)||!Number.isSafeInteger(natural)||natural<1||natural>20)throw Error('Completed attack dice are invalid.');
 const seen=Array.isArray(state.resolved_attack_ids)?state.resolved_attack_ids:[];
 if(seen.includes(rollId))throw Error('This attack result was already recorded.');
 // Auto can trust a computed hit against explicitly supplied AC. Guided mode
 // must obtain a separate positive DM/player confirmation from the UI.
 if(adjudication==='auto'){
  if(state.economy.mode!=='auto'||!evaluateAttack(total,effectiveAC(character,targetId),natural).hit)return null;
 }else if(adjudication!=='guided')throw Error('Hit confirmation is required.');
 const event=setCombatEvent(character,'melee-hit',{
  origin:'resolved-attack',rollId,sourceId:attackId,targetId
 });
 state.resolved_attack_ids=[...seen.slice(-39),rollId];
 return event;
}
function verifyCombatEvent(character,required){
 if(!required)return true;
 if(!EVENT_KINDS.includes(required))throw Error('Unsupported ability trigger.');
 const state=combat(character);
 if(!state.active||!state.economy.auto)return true; // Manual mode is DM-controlled.
 const current=state.event_window;
 if(!current||current.kind!==required||current.used)throw Error('Confirm the '+required+' event before using this ability.');
 return true;
}

function poolLimits(character){
 const specified=character.combat_profile?.action_pools||{},limits={};
 for(const key of POOL_NAMES){
  const v=specified[key]??1;
  if(!Number.isSafeInteger(v)||v<1||v>3)throw Error('Configure '+key+' pool as 1–3 actions.');
  limits[key]=v;
 }
 return limits;
}
function attacksPerAction(character){
 const count=character.combat_profile?.attacks_per_action??1;
 if(!Number.isSafeInteger(count)||count<1||count>4)throw Error('Configure attacks per Attack action as 1–4.');
 return count;
}
function economyAvailable(character,type,units=1,scope='any'){
 const state=combat(character),e=state.economy,limits=poolLimits(character);
 if(!POOL_NAMES.includes(type)||!Number.isSafeInteger(units)||units<1||units>3)throw Error('Invalid action pool expense.');
 const base=Math.max(0,limits[type]-e.spent[type]);
 const extra=type==='action'?e.grants.filter(g=>!g.used&&(g.scope==='any'||scope==='attack')).length:0;
 return base+extra>=units;
}
function spendEconomy(character,type,units=1,scope='any'){
 if(!economyAvailable(character,type,units,scope))throw Error('Your '+type+' is already used or its pool is exhausted this turn.');
 const state=combat(character),e=state.economy,limits=poolLimits(character);
 let rest=units,grants=[];
 const base=Math.min(rest,Math.max(0,limits[type]-e.spent[type]));rest-=base;
 if(rest){grants=e.grants.filter(g=>!g.used&&(g.scope==='any'||scope==='attack')).slice(0,rest);}
 e.spent[type]+=base;
 for(const g of grants)g.used=true;
 state.used[type]=e.spent[type]>0;
 e.lastActivity='other';
 delete state.undo_turn;
 return {base,grants:grants.map(g=>g.scope)};
}
// Restricted attacks are additional attack *permissions*, not Attack actions.
// A grant is explicitly scoped to an attack type; unknown imported attacks
// cannot silently qualify as unarmed strikes.
function attackType(attack){
 const type=attack?.attack_type??'unspecified';
 if(!['unarmed','weapon','unspecified'].includes(type))throw Error('Unsupported attack type.');
 return type;
}
function attackGrant(character,type){
 attackType({attack_type:type});
 return combat(character).economy.attackGrants.find(g=>g.remaining>0&&(g.scope==='any'||g.scope===type));
}
function availableAttackGrants(character,type){
 const state=combat(character);
 return state.economy.attackGrants.filter(g=>g.remaining>0&&(g.scope==='any'||g.scope===type)).reduce((n,g)=>n+g.remaining,0);
}
function verifyAttack(character,permission='action',type='unspecified'){
 if(permission==='bonus'){
  const state=combat(character);
  if(!state.active||!state.economy.auto)return true;
  if(!attackGrant(character,type))throw Error('No qualified bonus attack permission for this attack type.');
  return true;
 }
 if(permission!=='action')throw Error('Unknown attack permission.');
 const state=combat(character);
 if(!state.active||!state.economy.auto)return true;
 attacksPerAction(character);
 if(state.economy.attacks.remaining>0)return true;
 if(!economyAvailable(character,'action',1,'attack'))throw Error('No Attack action or extra attack grant remains this turn.');
 return true;
}
function commitAttack(character,permission='action',type='unspecified'){
 verifyAttack(character,permission,type);
 const state=combat(character);
 if(!state.active||!state.economy.auto)return false;
 const sequence=state.economy.attacks;
 if(permission==='bonus'){
  const grant=attackGrant(character,type);
  grant.remaining--;
  sequence.made++;
  // A granted strike is not the Attack action and must never unlock the
  // Attack-action prerequisite on its own.
  state.economy.lastActivity='other';
  delete state.undo_turn;
  return true;
 }
 if(sequence.remaining>0)sequence.remaining--;
 else{
  const charge=spendEconomy(character,'action',1,'attack');
  // A restricted Haste-style action grants exactly one attack, never Extra Attack.
  sequence.remaining=charge.grants.includes('attack')?0:attacksPerAction(character)-1;
 }
 sequence.made++;state.economy.attackActionMade++;
 // The 2014 Flurry window opens after the Attack action has finished.
 state.economy.lastActivity=sequence.remaining===0?'attack':null;
 delete state.undo_turn;
 return true;
}
function addResourcePool(character,name,max,reset='manual'){
 if(typeof name!=='string'||!name.trim()||name.length>70||/[\x00-\x1f]/.test(name))throw Error('Name the new resource pool (1–70 characters).');
 const key=name.trim();
 if(!Number.isSafeInteger(max)||max<1||max>9999)throw Error('Resource maximum must be 1–9999.');
 if(!['manual','turn','short rest','long rest'].includes(reset))throw Error('Unknown resource reset schedule.');
 if(!character.resources||typeof character.resources!=='object')character.resources={};
 if(Object.keys(character.resources).some(existing=>existing.toLowerCase()===key.toLowerCase()))throw Error('Resource pool already exists.');
 character.resources[key]={current:max,max,reset};
 return character.resources[key];
}
function configureEconomy(character,key,value){
 if(!['action','bonus','reaction','attacks_per_action'].includes(key))throw Error('Unknown economy setting.');
 if(!Number.isSafeInteger(value)||value<1||value>(key==='attacks_per_action'?4:3))throw Error('Economy setting is outside allowed range.');
 const state=combat(character),previous=character.combat_profile;
 const profile={...(previous||{}),action_pools:{...(previous?.action_pools||{})}};
 if(key==='attacks_per_action')profile.attacks_per_action=value;
 else{
  if(state.active&&state.economy.spent[key]>value)throw Error('Cannot reduce the pool below actions already used this turn.');
  profile.action_pools[key]=value;
 }
 character.combat_profile=profile;delete state.undo_turn;
 return profile;
}
function setCombatMode(character,mode){
 if(!['auto','guided','manual'].includes(mode))throw Error('Unknown combat assistance mode.');
 const state=combat(character);
 state.economy.mode=mode;state.economy.auto=mode!=='manual';delete state.undo_turn;
 return mode;
}
function setAutoEconomy(character,enabled){
 return setCombatMode(character,enabled?'auto':'manual')!=='manual';
}
function grantEconomyAction(character,scope='any',source='manual'){
 if(!['any','attack'].includes(scope))throw Error('Only unrestricted or attack-only action grants are supported.');
 const state=combat(character),e=state.economy;
 if(!state.active)throw Error('Start encounter tracking before granting an action.');
 if(e.grants.filter(g=>!g.used).length>=3)throw Error('Maximum three unspent grants per turn.');
 if(source!=='manual'&&e.grants.some(g=>g.source===source))throw Error('Feature already granted its action this turn.');
 e.grants.push({scope,source,used:false});delete state.undo_turn;
 return e.grants.length;
}
function verifyEconomy(character,validated){
 const state=combat(character),type=activationCost(validated.activation),units=validated.economyUnits??1;
 if(!state.active||!state.economy.auto)return type;
 verifyCombatEvent(character,validated.triggerEvent);
 if(type&&!economyAvailable(character,type,units))throw Error('Your '+type+' is already used or its pool is exhausted this turn.');
 if(validated.requiresAttack&&state.economy.attackActionMade<1)throw Error('This feature requires an Attack action first this turn.');
 if(validated.requiresAttackComplete&&(state.economy.attacks.remaining>0||state.economy.lastActivity!=='attack'))
  throw Error('Complete the Attack action immediately before this ability.');
 if(validated.grantAttacks&&state.economy.attackGrants.some(g=>g.source===validated.sourceId))throw Error('This ability already granted attacks this turn.');
 if(validated.grantEconomy&&state.economy.grants.some(g=>g.source===validated.sourceId))throw Error('Feature already granted its action this turn.');
 if(follows2014(character)&&validated.kind==='spell'){
  if(state.spellcasting.bonus&&!actionCantrip(validated))throw Error('2014 bonus-action spell rule: only a 1-action cantrip may follow a bonus-action spell this turn.');
  if(type==='bonus'&&state.spellcasting.restricted)throw Error('2014 bonus-action spell rule: another spell this turn prevents casting a bonus-action spell.');
 }
 return type;
}
function commitUsage(character,validated){
 if(!character||!validated||!Number.isSafeInteger(validated.cost)||validated.cost<0)throw Error('Invalid ability plan.');
 const type=verifyEconomy(character,validated);
 const pool=validated.cost?character.resources?.[validated.resource]:null;
 if(validated.cost&&(!pool||!Number.isSafeInteger(Number(pool.current))||Number(pool.current)<validated.cost))throw Error('Not enough '+validated.resource+'.');
 const grant=validated.grantResource?character.resources?.[validated.grantResource]:null;
 if(validated.grantResource&&(!grant||!Number.isSafeInteger(Number(grant.current))||!Number.isSafeInteger(Number(grant.max))||Number(grant.current)<0||Number(grant.current)>Number(grant.max)||Number(grant.max)<0))throw Error('Invalid resource grant pool: '+validated.grantResource);
 const state=combat(character),e=state.economy;
 if(state.active&&e.auto&&validated.grantEconomy&&e.grants.filter(g=>!g.used).length>=3)throw Error('No room for another action grant.');
 if(state.active&&e.auto&&validated.grantAttacks&&e.attackGrants.reduce((n,g)=>n+g.remaining,0)+validated.grantAttacks>8)
  throw Error('Maximum eight unspent bonus attacks.');
 // All costs and requirements were validated before modifying any resource.
 if(validated.cost)pool.current=Number(pool.current)-validated.cost;
 if(grant)grant.current=Math.min(Number(grant.max),Number(grant.current)+validated.grantAmount);
 if(state.active&&e.auto){
  if(type)spendEconomy(character,type,validated.economyUnits??1);
  if(validated.grantEconomy)grantEconomyAction(character,validated.grantEconomy,validated.sourceId);
  if(validated.grantAttacks)e.attackGrants.push({source:validated.sourceId,scope:validated.grantAttackScope,remaining:validated.grantAttacks});
  if(validated.triggerEvent)state.event_window.used=true;
  e.lastActivity='other';
  if(follows2014(character)&&validated.kind==='spell'){
   if(type==='bonus')state.spellcasting.bonus=true;
   else if(!actionCantrip(validated))state.spellcasting.restricted=true;
  }
  delete state.undo_turn;
 }
 return type;
}
function markAction(character,type){
 if(!POOL_NAMES.includes(type))throw Error('Unknown action category.');
 const state=combat(character);
 if(!state.active)throw Error('Start encounter tracking before marking actions.');
 if(!economyAvailable(character,type,1))throw Error('That '+type+' is already spent.');
 spendEconomy(character,type,1);
}
function setEncounter(character,enabled){
 const state=combat(character),mode=state.economy.mode;
 state.active=Boolean(enabled);state.turn=1;state.used={action:false,bonus:false,reaction:false};state.spellcasting={bonus:false,restricted:false};
 state.economy={mode,auto:mode!=='manual',spent:{action:0,bonus:0,reaction:0},attacks:{made:0,remaining:0},attackActionMade:0,grants:[],attackGrants:[],lastActivity:null};delete state.event_window;delete state.pending_workflow;delete state.resolved_attack_ids;delete state.undo_turn;
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
 let acBonus=0,bonusDice='',bonusScopes=[],bonusMode='',charges=0,automatic=false;
 let target='self';
 let rounds=duration(spell.duration_rounds);
 let concentration=typeof spell.concentration==='boolean'?spell.concentration:/\bconcentration\b/i.test(String(spell.duration||''));
 if(spell.automation==='srd-2014'||(spell.automation!=='manual'&&!spell.automation&&character.rules_profile==='srd-2014'&&profile!=null)){
  if(character.system_edition!=='dnd-2014')throw Error('2014 automation requires a character explicitly marked D&D 2014.');
  const spellKey=String(spell.name||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  if(!profile||profile.schema!=='srd51-spell-effect/1'||profile.target!=='self'||
     profile.spell_id!=='srd51:spell:'+spellKey||profile.base_level!==level)
    throw Error('Matching 2014 SRD spell profile is unavailable.');
  if(!['action','bonus action','reaction'].includes(profile.activation))throw Error('Unqualified automation activation.');
  automatic=true;
  target='self';
  switch(profile.type){
   case 'heal':{
    if(!['d4','d8'].includes(profile.dice)||profile.base_dice!==1||profile.dice_per_slot_above_base!==1||profile.modifier!=='spellcasting'||level!==1)throw Error('Unsupported healing profile.');
    const mod=castingModifier(character,spell);
    roll=dice(`${slot}${profile.dice}${mod>=0?'+':''}${mod}`);
    effect='heal';break;
   }
   case 'ac_bonus':
    if(profile.amount!==2||profile.duration_rounds!==100||!profile.concentration)throw Error('Unsupported armor profile.');
    effect='ac_bonus';acBonus=profile.amount;rounds=profile.duration_rounds;concentration=true;roll=null;break;
   case 'roll_bonus':{
    const scopes=profile.roll_scopes;
    if(profile.dice!=='1d4'||!Array.isArray(scopes)||!scopes.length||scopes.some(x=>!['ability-check','attack','save'].includes(x))||new Set(scopes).size!==scopes.length||
       !['charge','sustained'].includes(profile.consumption)||(profile.consumption==='charge'&&profile.charges!==1)||
       (profile.consumption==='sustained'&&profile.charges!==undefined)||profile.duration_rounds!==10||profile.concentration!==true)
     throw Error('Unsupported roll-bonus profile.');
    effect='roll_bonus';bonusDice=profile.dice;bonusScopes=[...scopes];bonusMode=profile.consumption;
    charges=profile.consumption==='charge'?1:0;rounds=profile.duration_rounds;concentration=true;roll=null;break;
   }
   default:throw Error('Unsupported SRD automation profile.');
  }
 }
 if(!['none','heal','condition','damage','ac_bonus','roll_bonus'].includes(effect))throw Error('Unsupported spell effect.');
 if(effect==='heal'&&!roll)throw Error('Healing needs a configured dice expression.');
 if(effect==='damage'&&!roll)throw Error('Damage needs a configured dice expression.');
 const damageType=effect==='damage'?String(spell.damage_type||'untyped').toLowerCase():'untyped';
 if(!DAMAGE_TYPES.includes(damageType))throw Error('Invalid spell damage type.');
 const condition=effect==='condition'?String(spell.effect_condition||'').trim():'';
 if(effect==='condition'&&!CONDITIONS.has(condition))throw Error('Choose a supported self-condition.');
 return Object.freeze({kind:'spell',name:String(spell.name||'Spell'),sourceId:String(spell.id||spell.name||'spell'),resource,cost,roll,effect,
  concentration,durationRounds:rounds,activation:String(automatic?profile.activation:spell.casting_time||'special'),slotLevel:slot,condition,acBonus,bonusDice,bonusScopes,bonusMode,charges,target,automatic,damageType});
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
 const grantResource=String(action.grant_resource||'').trim(),grantAmount=Number(action.grant_amount||0);
 if(grantResource&&(!Number.isSafeInteger(grantAmount)||grantAmount<1||grantAmount>999))throw Error('Resource grant must be 1–999.');
 if(!grantResource&&grantAmount)throw Error('Choose a resource to grant.');
 const grantEconomy=String(action.grant_economy||'');
 if(grantEconomy&&!['any','attack'].includes(grantEconomy))throw Error('Unsupported extra action permission.');
 const grantAttacks=Number(action.grant_attacks??0),grantAttackScope=String(action.grant_attack_scope||'unarmed');
 if(!Number.isSafeInteger(grantAttacks)||grantAttacks<0||grantAttacks>4)throw Error('Bonus attack grant must be 0–4 attacks.');
 if(grantAttacks&&!['unarmed','weapon','any'].includes(grantAttackScope))throw Error('Bonus attack grant needs a valid attack type.');
 if(grantAttacks&&activationCost(action.activation)!=='bonus')throw Error('Bonus attack grants require a bonus action.');
 const requiresAttackComplete=action.requires_attack_complete===true;
 if(requiresAttackComplete&&action.requires_attack!==true)throw Error('Attack completion requires the Attack-action prerequisite.');
 const economyUnits=Number(action.economy_units??1);
 if(!Number.isSafeInteger(economyUnits)||economyUnits<1||economyUnits>3)throw Error('Action pool expense must be 1–3.');
 if(!activationCost(action.activation)&&economyUnits!==1)throw Error('Special activities need a DM-defined activation.');
 // A staged ability is declarative: the same planner owns the initial action,
 // the physical reduction roll, and a separately approved follow-up charge.
 if(action.ruleset_profile&&action.ruleset_profile!==character.system_edition)throw Error('Ability profile requires '+action.ruleset_profile+' character edition.');
 const triggerEvent=String(action.trigger_event||'');
 if(triggerEvent&&!EVENT_KINDS.includes(triggerEvent))throw Error('Unsupported ability trigger.');
 if(triggerEvent&&activationCost(action.activation)!=='reaction'&&triggerEvent!=='melee-hit')throw Error('This trigger requires a reaction.');
 const workflow=action.workflow;
 let staged=null;
 if(workflow!==undefined&&workflow!==null){
  if(typeof workflow!=='object'||Array.isArray(workflow)||workflow.kind!=='damage-reduction')throw Error('Unsupported staged ability workflow.');
  if(activationCost(action.activation)!=='reaction'||cost!==0||grantResource||grantEconomy)throw Error('Damage-reduction workflow must begin with a cost-free reaction.');
  if(action.effect_kind&&action.effect_kind!=='none')throw Error('Staged ability cannot apply unrelated automatic effects.');
  const reduction=dice(action.roll||'');
  if(!reduction||reduction.sides!==10)throw Error('Configure the physical d10 reduction roll first.');
  const next=workflow.followup;
  if(!next||typeof next!=='object'||Array.isArray(next))throw Error('Staged ability requires a qualified optional follow-up.');
  const nextResource=String(next.resource||'').trim(),nextCost=Number(next.cost),nextRoll=dice(next.roll||'');
  if(!nextResource||!Number.isSafeInteger(nextCost)||nextCost<1||nextCost>9999||!nextRoll||nextRoll.sides!==20)throw Error('Configure a resource cost and a d20 follow-up roll.');
  if(next.requires_catchable!==true||next.requires_free_hand!==true)throw Error('Counterattack requires explicit catchable-missile and free-hand confirmation.');
  staged={kind:'damage-reduction',followup:{label:String(next.label||'Counterattack'),resource:nextResource,cost:nextCost,roll:nextRoll.expression,
   requires_catchable:true,requires_free_hand:true}};
 }
 if(staged&&triggerEvent&&triggerEvent!=='ranged-hit')throw Error('Damage reduction requires a ranged-hit trigger.');
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
   concentration:action.concentration===true,durationRounds:duration(action.duration_rounds),activation:String(action.activation||'special'),condition,damageType,
   economyUnits,requiresAttack:action.requires_attack===true,requiresAttackComplete,grantAttacks,grantAttackScope,grantResource,grantAmount,grantEconomy,triggerEvent:triggerEvent||(staged?'ranged-hit':''),workflow:staged});
}
// One pending sequence per character. The continuation is not a second
// reaction: it is an optional child of the already committed parent action.
function pendingWorkflow(character){return combat(character).pending_workflow||null;}
function beginWorkflow(character,validated,incoming){
 if(validated?.workflow?.kind!=='damage-reduction')throw Error('Not a supported staged action.');
 if(!Number.isSafeInteger(incoming)||incoming<1||incoming>999999)throw Error('Enter confirmed incoming weapon damage (1–999999).');
 if(pendingWorkflow(character))throw Error('Resolve or decline the existing staged ability first.');
 const state=combat(character),nextId=(state.sequence_counter||0)+1;
 if(!Number.isSafeInteger(nextId))throw Error('Ability sequence identity exhausted.');
 // Do not debit anything until identity, all stages and prerequisites validate.
 verifyEconomy(character,validated);
 commitUsage(character,validated);
 state.sequence_counter=nextId;
 state.pending_workflow={id:'sequence-'+nextId,sourceId:validated.sourceId,name:validated.name,status:'await-roll',
  incoming,roll:validated.roll.expression,followup:deepcopy(validated.workflow.followup)};
 return deepcopy(state.pending_workflow);
}
function resolveWorkflow(character,id,reduction){
 const state=combat(character),entry=state.pending_workflow;
 if(!entry||entry.id!==id||entry.status!=='await-roll')throw Error('No matching unresolved reduction roll.');
 if(!Number.isSafeInteger(reduction)||reduction<0)throw Error('Invalid reduction result.');
 const remaining=Math.max(0,entry.incoming-reduction);
 if(remaining){delete state.pending_workflow;return {remaining,eligible:false};}
 entry.status='optional-followup';entry.remaining=0;
 return {remaining:0,eligible:true};
}
// A follow-up can be prepared and canceled without spending optional resources.
// The exact same qualification is checked at launch; a stale or declined
// sequence must never debit Ki, and the parent reaction is never charged twice.
function previewWorkflowFollowup(character,id,{catchable=false,freeHand=false}={}){
 const entry=combat(character).pending_workflow;
 if(!entry||entry.id!==id||entry.status!=='optional-followup')throw Error('The follow-up is unavailable or already resolved.');
 if(!catchable||!freeHand)throw Error('Confirm the missile can be caught and a hand is free.');
 const {resource,cost,roll}=entry.followup,pool=character.resources?.[resource];
 if(!pool||!Number.isSafeInteger(Number(pool.current))||Number(pool.current)<cost)
  throw Error('Not enough '+resource+' for optional counterattack.');
 return {label:entry.followup.label,roll,sourceId:entry.sourceId};
}
function finishWorkflow(character,id,confirmation={}){
 const attack=previewWorkflowFollowup(character,id,confirmation);
 const state=combat(character),entry=state.pending_workflow;
 character.resources[entry.followup.resource].current-=entry.followup.cost;
 delete state.pending_workflow;
 delete state.undo_turn;
 return attack;
}
function declineWorkflow(character,id){
 const state=combat(character),entry=state.pending_workflow;
 if(!entry||entry.id!==id)throw Error('No matching staged ability.');
 delete state.pending_workflow;return true;
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
// Use the same end path for recasting, expiry and resting. Never clear the raw
// effect array: that skips condition ownership and concentration cleanup.
function endAllEffects(character){
 const ids=[...new Set(activeEffects(character).map(e=>e.id))];
 for(const id of ids)endEffect(character,id);
 // Old vaults may contain checks for effects that no longer exist.
 character.effects.pending_concentration=[];
 delete combat(character).pending_workflow; // A rest also closes an unresolved reaction sequence.
 return ids.length;
}
function startEffect(character,validated){
 if(!validated||(!validated.concentration&&!validated.durationRounds&&!validated.condition&&!validated.acBonus&&!validated.charges&&!validated.bonusDice))return null;
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
  stack_key:'spell:'+String(validated.name||validated.sourceId).toLowerCase().replace(/[^a-z0-9]/g,''),charges:validated.charges||0,bonus_dice:validated.bonusDice||'',
  bonus_scope:validated.charges&&validated.bonusDice&&!validated.bonusScopes?.length?'ability-check':null,
  bonus_scopes:Array.isArray(validated.bonusScopes)?[...validated.bonusScopes]:undefined,
  bonus_mode:validated.bonusMode||(validated.charges?'charge':null),auto_use:true,
  instance_id:++nextEffectInstance,
  target:validated.target||'self',...(condition?{condition,condition_owned:owned}:{})};
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
// One typed roll-bonus contract for limited charges and sustained buffs.
// Legacy Guidance saves using bonus_scope remain compatible. No arbitrary
// spell prose executes and no target other than the character is inferred.
function bonusScopes(effect){
 return Array.isArray(effect.bonus_scopes)&&effect.bonus_scopes.length?effect.bonus_scopes:
  [effect.bonus_scope||'ability-check'];
}
function bonusEligible(effect,rollKind){
 return effect.target==='self'&&effect.bonus_dice&&effect.auto_use!==false&&
   (effect.bonus_mode==='sustained'||(Number.isSafeInteger(effect.charges)&&effect.charges>0))&&
   bonusScopes(effect).includes(rollKind);
}
function compatibleBonuses(character,rollKind,reservedIds=[]){
 if(!['ability-check','attack','save'].includes(rollKind))return [];
 const reserved=new Set(reservedIds),sources=new Set();
 return activeEffects(character).filter(e=>{
   if(!bonusEligible(e,rollKind))return false;
   if(e.bonus_mode!=='sustained'&&reserved.has(e.id))return false;
   const source=e.stack_key||e.id;
   if(sources.has(source))return false; // Repeated same-name spells never stack.
   sources.add(source);return true;
 }).map(e=>{
   const roll=dice(e.bonus_dice);
   return {effectId:e.id,name:e.name,expression:roll.expression,count:roll.count,sides:roll.sides,
     ...(e.instance_id!==undefined?{instanceId:e.instance_id}:{})};
 });
}
function setAutoUse(character,id,enabled){
 const e=activeEffects(character).find(e=>e.id===id);
 if(!e||!e.bonus_dice||(e.bonus_mode!=='sustained'&&!(e.charges>0)))throw Error('The effect cannot automatically apply to rolls.');
 e.auto_use=Boolean(enabled);return e.auto_use;
}
// Settlement must validate the SAME effect instance and roll scope again,
// after concentration, expiry, and checkbox changes. This is the only place
// a charged buff is spent; sustained buffs can serve concurrent rolls.
function resolveRollBonus(character,id,rollKind,instanceId){
 const e=activeEffects(character).find(x=>x.id===id);
 if(!e||!bonusEligible(e,rollKind)||(instanceId!==undefined&&e.instance_id!==instanceId))
  throw Error('Roll bonus expired, changed or no longer qualifies.');
 const roll=dice(e.bonus_dice);
 if(e.bonus_mode!=='sustained'){
  e.charges--;
  if(!e.charges)endEffect(character,id);
 }
 return roll;
}
function consumeCharge(character,id){
 const e=activeEffects(character).find(x=>x.id===id);
 if(!e||!Number.isSafeInteger(e.charges)||e.charges<1||!e.bonus_dice)throw Error('No charged bonus available.');
 const roll=dice(e.bonus_dice);
 e.charges--;if(!e.charges)endEffect(character,id);
 return roll;
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
 // Per-character monotonic IDs survive vault persistence and never depend on
 // clock resolution or queue length (checks can resolve out of order).
 let seq=Number.isSafeInteger(effects.concentration_sequence)&&effects.concentration_sequence>=0?effects.concentration_sequence:0;
 let id;do{if(++seq>Number.MAX_SAFE_INTEGER)throw Error('Concentration check sequence exhausted.');id=`con-${seq}`;}
 while(effects.pending_concentration.some(check=>check.id===id));
 effects.concentration_sequence=seq;
 const check={id,effect_id:e.id,dc};
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
 const snapshot={turn:state.turn,active:state.active,used:deepcopy(state.used),spellcasting:deepcopy(state.spellcasting),economy:deepcopy(state.economy),event_window:deepcopy(state.event_window||null),resolved_attack_ids:deepcopy(state.resolved_attack_ids||[]),
  effects:deepcopy(activeEffects(character)),conditions:deepcopy(character.conditions||[]),pending_concentration:deepcopy(character.effects.pending_concentration||[]),
  empty_body_rounds:character.effects.empty_body_rounds||0,empty_body_owned:character.effects.empty_body_owned,
  turn_resources:Object.fromEntries(Object.entries(character.resources||{}).filter(([k,r])=>r?.reset==='turn'||k==='Shield Stance Points').map(([k,r])=>[k,r.current]))};
 if(state.active){state.turn++;state.used={action:false,bonus:false,reaction:false};state.spellcasting={bonus:false,restricted:false};
  state.economy={mode:state.economy.mode,auto:state.economy.auto,spent:{action:0,bonus:0,reaction:0},attacks:{made:0,remaining:0},attackActionMade:0,grants:[],attackGrants:[],lastActivity:null};delete state.event_window;delete state.pending_workflow;delete state.resolved_attack_ids;}
 const expired=advanceEffects(character);
 for(const [name,resource] of Object.entries(character.resources||{}))
  if(resource?.reset==='turn'||(name==='Shield Stance Points'&&resource?.reset===undefined))resource.current=0; // legacy character import compatibility
 if(character.effects.empty_body_rounds>0){
  character.effects.empty_body_rounds--;
  if(character.effects.empty_body_rounds===0)endEmptyBody(character);
 }
 state.undo_turn=snapshot;
 return expired;
}
function undoTurn(character){
 const state=combat(character),before=state.undo_turn;
 if(!before)return false;
 state.turn=before.turn;state.active=before.active;state.used=before.used;state.spellcasting=before.spellcasting||{bonus:false,restricted:false};state.economy=before.economy||state.economy; if(before.event_window)state.event_window=before.event_window;else delete state.event_window;state.resolved_attack_ids=before.resolved_attack_ids||[];
 character.effects.active=before.effects;character.conditions=before.conditions;character.effects.pending_concentration=before.pending_concentration||[];
 character.effects.empty_body_rounds=before.empty_body_rounds;
 if(before.empty_body_owned===undefined)delete character.effects.empty_body_owned;else character.effects.empty_body_owned=before.empty_body_owned;
 for(const [key,current] of Object.entries(before.turn_resources||{}))if(character.resources?.[key])character.resources[key].current=current;
 delete state.undo_turn;
 return true;
}
// The existing Empty Body ability is a legacy timed feature. Track whether it
// actually introduced Invisibility; never remove a manually present condition.
function endEmptyBody(character){
 const effects=character.effects||{};
 if(effects.empty_body_owned&&!activeEffects(character).some(e=>e.condition==='Invisible')){
  character.conditions=(character.conditions||[]).filter(x=>x!=='Invisible');
 }
 effects.empty_body_rounds=0;delete effects.empty_body_owned;
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
 // Undo cannot resurrect an effect or bypass a completed concentration save.
 // Only an outstanding check created by this exact damage event is reversible.
 if(undo.check_id&&!character.effects?.pending_concentration?.some(c=>c.id===undo.check_id)){
  delete state.last_damage_undo;throw Error('Concentration was already resolved or ended. Damage undo is no longer safe.');
 }
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
const api={EVENT_KINDS,combatEvent,recordCombatEvent,recordResolvedAttack,attackRange,dismissCombatEvent,verifyCombatEvent,previewWorkflowFollowup,attackType,availableAttackGrants,pendingWorkflow,beginWorkflow,resolveWorkflow,finishWorkflow,declineWorkflow,poolLimits,attacksPerAction,economyAvailable,verifyAttack,commitAttack,setCombatMode,setAutoEconomy,configureEconomy,addResourcePool,grantEconomyAction,dice,resolveD20,compatibleBonuses,setAutoUse,resolveRollBonus,criticalDamageExpression,plan,planSpell,spellSlots,commit,commitUsage,combat,activationCost,verifyEconomy,markAction,setEncounter,advanceTurn,undoTurn,activeEffects,startEffect,endEffect,endAllEffects,endEmptyBody,advanceEffects,applyHealing,effectiveAC,consumeCharge,concentrationDC,queueConcentrationCheck,resolveConcentrationCheck,castingModifier,modifierTotal,targets,targetById,addTarget,removeTarget,updateTargetStat,damageTraits,targetTraits,setTargetTraits,setTargetCondition,evaluateAttack,evaluateSave,planDamage,commitDamage,undoLastDamage,DAMAGE_TYPES,ABILITIES,CONDITIONS};root.DndAction=api;
if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
