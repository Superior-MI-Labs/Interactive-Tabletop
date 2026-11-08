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
// Deliberately small, edition-neutral DM timing vocabulary. The 2014 Stunning
// Strike template opts into source-next-turn-end; no imported prose is parsed.
const CONDITION_EXPIRATIONS=Object.freeze(['manual','source-next-turn-end','target-next-turn-end']);
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
const EVENT_KINDS=['incoming-attack','ranged-hit','melee-hit','save-success','save-failure','damage-taken'];
// A window belongs to one turn and at most one selected creature. The same
// ledger that charges actions retires windows on the NEXT unrelated activity.
function combatEvent(character){
 const state=combat(character),event=state.event_window;
 if(event&&(!state.active||event.turn!==state.turn)){delete state.event_window;return null;}
 return event||null;
}
function expireCombatEvent(character){
 const state=combat(character);
 if(!state.event_window)return false;
 delete state.event_window;
 return true;
}
function setCombatEvent(character,kind,origin=null){
 if(!EVENT_KINDS.includes(kind))throw Error('Unknown combat event.');
 const state=combat(character);
 if(!state.active)throw Error('Start encounter tracking before confirming a combat event.');
 if(state.pending_workflow)throw Error('Finish the pending reaction before opening another event.');
 const next=(state.event_sequence||0)+1;
 if(!Number.isSafeInteger(next))throw Error('Combat event sequence exhausted.');
 state.event_sequence=next;
 state.event_window={id:'event-'+next,kind,turn:state.turn,used:false,...(origin?{
  origin:origin.origin,rollId:origin.rollId,sourceId:origin.sourceId,targetId:origin.targetId,
  attackerId:origin.attackerId,attackKind:origin.attackKind,parentEventId:origin.parentEventId,
  dc:origin.dc,total:origin.total,damageType:origin.damageType,damageAmount:origin.damageAmount,hpLoss:origin.hpLoss
 }:{} )};
 delete state.undo_turn;
 return deepcopy(state.event_window);
}
function recordCombatEvent(character,kind,targetId=null){
 if(kind==='melee-hit'&&targetId!==null){
  if(targetId==='self'||!targetById(character,targetId))throw Error('Choose the creature hit by your melee attack.');
  return setCombatEvent(character,kind,{origin:'dm-confirmed',targetId});
 }
 return setCombatEvent(character,kind);
}
// One DM-confirmed attack transaction uses the existing event window throughout
// its pre-roll and post-hit phases. It is never an enemy attack simulator.
const INCOMING_ATTACK_KINDS=['ranged-weapon','melee-weapon','spell','other'];
function recordIncomingAttack(character,attackerId,attackKind){
 if(attackerId==='self'||!targetById(character,attackerId))throw Error('Choose the attacking creature in Encounter Targets.');
 if(!INCOMING_ATTACK_KINDS.includes(attackKind))throw Error('Choose a verified incoming attack type.');
 return setCombatEvent(character,'incoming-attack',{
  origin:'confirmed-incoming',attackerId,attackKind,targetId:'self'
 });
}
function resolveIncomingAttack(character,eventId,hit){
 const state=combat(character),event=combatEvent(character);
 if(!event||event.id!==eventId||event.kind!=='incoming-attack'||event.origin!=='confirmed-incoming')
  throw Error('The incoming attack window expired or was replaced.');
 if(typeof hit!=='boolean')throw Error('Confirm whether the incoming attack hit or missed.');
 if(!targetById(character,event.attackerId))throw Error('The attacker was removed from the encounter.');
 // A spent Warding Flare reaction changes the attack adjudication, not the
 // existence of the original attack. Its eventual hit can still be recorded.
 if(hit&&event.attackKind==='ranged-weapon'){
  return setCombatEvent(character,'ranged-hit',{
   origin:'confirmed-incoming',attackerId:event.attackerId,attackKind:event.attackKind,
   targetId:'self',parentEventId:event.id
  });
 }
 expireCombatEvent(character);
 return null;
}
function dismissCombatEvent(character){delete combat(character).event_window;return true;}
// A settled physical save is evidence, not permission to reduce arbitrary damage.
// A player must explicitly associate this exact save with a damage preview.
const SAVE_ID=/^attack-roll-[a-z0-9-]{1,90}$/i;
function recentSave(character){
 const state=combat(character),saved=state.last_save;
 if(!saved)return null;
 if(typeof saved.id!=='string'||!SAVE_ID.test(saved.id)||saved.rollId!==saved.id||
  !targetById(character,saved.targetId)||!ABILITIES.includes(saved.ability)||
  !Number.isSafeInteger(saved.total)||!Number.isSafeInteger(saved.dc)||saved.dc<0||saved.dc>99||
  saved.outcome!==(saved.total>=saved.dc?'success':'failure')||
  (saved.turn!==null&&(!Number.isSafeInteger(saved.turn)||!state.active||saved.turn!==state.turn)))return null;
 return deepcopy(saved);
}
function recordResolvedSave(character,record){
 if(!record||typeof record!=='object'||typeof record.rollId!=='string'||!SAVE_ID.test(record.rollId))throw Error('Invalid saving throw roll identity.');
 const {rollId,targetId,ability,total,dc}=record;
 if(!targetById(character,targetId))throw Error('Saving throw target no longer exists.');
 if(!ABILITIES.includes(ability))throw Error('Choose a valid saving throw ability.');
 const verdict=evaluateSave(total,dc),state=combat(character);
 if((state.resolved_save_ids||[]).includes(rollId))throw Error('Saving throw result was already recorded.');
 const workflowId=record.workflowId??null,flow=pendingWorkflow(character);
 if(workflowId&&(!flow||flow.id!==workflowId||flow.kind!=='save-condition'||flow.status!=='await-save'||
  flow.targetId!==targetId||flow.save.ability!==ability||flow.save.dc!==dc))
  throw Error('This saving throw no longer belongs to the staged ability.');
 // A linked saving throw advances its original workflow, not a new trigger
 // window. All other saves continue to use the existing event pipeline.
 const event=workflowId?null:state.active&&state.economy.auto?setCombatEvent(character,verdict.success?'save-success':'save-failure',{
  origin:'resolved-save',rollId,targetId,sourceId:ability,dc,total
 }):null;
 const saved={id:rollId,rollId,targetId,ability,total,dc,outcome:verdict.success?'success':'failure',turn:state.active?state.turn:null};
 state.last_save=saved;
 state.resolved_save_ids=[...(state.resolved_save_ids||[]).slice(-39),rollId];
 if(workflowId){
  if(verdict.success)delete state.pending_workflow;
  else{flow.status='await-effect';flow.saveRollId=rollId;flow.saveTotal=total;}
 }
 return {...deepcopy(saved),event,workflowId};
}

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
// Event filters are explicitly approved character metadata, never parsed rules.
// This is a predicate over verified evidence, not a second execution path.
function eventFilter(action,kind){
 const saveAbility=String(action.event_save_ability||'').trim().toUpperCase();
 const damageType=String(action.event_damage_type||'').trim().toLowerCase();
 const minDamage=Number(action.event_min_damage??0),minHpLoss=Number(action.event_min_hp_loss??0);
 if(!Number.isSafeInteger(minDamage)||minDamage<0||minDamage>999999||
    !Number.isSafeInteger(minHpLoss)||minHpLoss<0||minHpLoss>999999)throw Error('Event damage thresholds must be whole numbers from 0 to 999999.');
 if(saveAbility&&(!['save-success','save-failure'].includes(kind)||!ABILITIES.includes(saveAbility)))
  throw Error('Saving-throw ability filter requires a valid save event and ability.');
 if((damageType||minDamage||minHpLoss)&&kind!=='damage-taken')
  throw Error('Damage filters require a damage-taken event.');
 if(damageType&&!DAMAGE_TYPES.includes(damageType))throw Error('Unsupported event damage type.');
 return Object.freeze({saveAbility,damageType,minDamage,minHpLoss});
}
function verifyCombatEvent(character,required,targetId=null,expectedId=null,filter=null){
 if(!required)return true;
 if(!EVENT_KINDS.includes(required))throw Error('Unsupported ability trigger.');
 const state=combat(character);
 if(!state.active||!state.economy.auto)return true; // Manual mode is DM-controlled.
 const current=combatEvent(character);
 if(!current||current.kind!==required||current.used)throw Error('Confirm the '+required+' event before using this ability.');
 if(expectedId&&expectedId!==current.id)throw Error('The original combat event changed. Confirm the ability again.');
 if(current.attackerId&&!targetById(character,current.attackerId))throw Error('The attacking creature is no longer in this encounter.');
 if(current.targetId){
  if(!targetById(character,current.targetId))throw Error('The original event target is no longer in this encounter.');
  if(targetId!==null&&current.targetId!==targetId)throw Error(current.kind==='melee-hit'?'This ability must use the creature hit by the qualifying attack.':'This ability must use the creature associated with its triggering event.');
 }
 if(filter){
  if(filter.saveAbility){
   if(current.origin!=='resolved-save'||current.sourceId!==filter.saveAbility||
      !Number.isSafeInteger(current.total)||!Number.isSafeInteger(current.dc)||
      current.dc<0||current.dc>99||
      (current.total>=current.dc)!==(current.kind==='save-success'))
    throw Error('This event does not meet the required verified saving throw.');
  }
  if(filter.damageType||filter.minDamage||filter.minHpLoss){
   if(current.origin!=='applied-damage'||!Number.isSafeInteger(current.damageAmount)||
      !Number.isSafeInteger(current.hpLoss)||current.damageAmount<0||current.hpLoss<0||
      (filter.damageType&&current.damageType!==filter.damageType)||
      current.damageAmount<filter.minDamage||current.hpLoss<filter.minHpLoss)
    throw Error('This event does not meet the configured damage requirements.');
  }
 }
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
 // A new committed strike closes any earlier on-hit opportunity; merely
 // preparing or canceling dice never reaches this boundary.
 expireCombatEvent(character);
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
function validResourceSettings(max,current,reset){
 if(!Number.isSafeInteger(max)||max<1||max>9999||!Number.isSafeInteger(current)||current<0||current>max)
  throw Error('Resource amounts must be whole numbers; maximum 1–9999 and remaining 0–maximum.');
 if(!['manual','turn','short rest','long rest'].includes(reset))throw Error('Unknown resource reset schedule.');
 return {max,current,reset};
}
function setResourceCurrent(character,name,current){
 const key=String(name||''),pool=character.resources?.[key];
 if(!pool)throw Error('Resource pool no longer exists.');
 if(!Number.isSafeInteger(current)||current<0||!Number.isSafeInteger(Number(pool.max))||current>Number(pool.max))
  throw Error('Remaining resource uses must be a whole number between 0 and the maximum.');
 pool.current=current;
 return pool;
}
function configureResourcePool(character,name,max,current,reset){
 const key=String(name||'');
 if(SlotPools.levelFromName(key)!==null)throw Error('Edit standard spell slots in the Spellbook editor.');
 const pool=character.resources?.[key];
 if(!pool)throw Error('Resource pool no longer exists.');
 const settings=validResourceSettings(max,current,reset);
 character.resources[key]={...pool,...settings};
 return character.resources[key];
}
function configureSpellSlots(character,level,max,current){
 const next=SlotPools.configure(character.resources,level,max,current);
 character.resources=next;
 return SlotPools.poolFor(next,level);
}
function addResourcePool(character,name,max,reset='manual'){
 if(typeof name!=='string'||!name.trim()||name.length>70||/[\x00-\x1f]/.test(name))throw Error('Name the new resource pool (1–70 characters).');
 const key=name.trim();
 const settings=validResourceSettings(max,max,reset);
 if(SlotPools.levelFromName(key)!==null)throw Error('Use standard spell-slot settings for spell slots.');
 if(!character.resources||typeof character.resources!=='object')character.resources={};
 if(Object.keys(character.resources).some(existing=>existing.toLowerCase()===key.toLowerCase()))throw Error('Resource pool already exists.');
 character.resources[key]=settings;
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
 if(state.economy.mode!==mode){expireCombatEvent(character);delete state.pending_workflow;}
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
 // Feature charges must not be spent if the encounter ledger cannot receive
 // the extra action. This is a generic grant rule, not a Fighter exception.
 if(validated.grantEconomy&&!state.active)
  throw Error('Start encounter tracking before granting an extra action.');
 if(!state.active||!state.economy.auto)return type;
 if(validated.triggerEvent&&!validated.eventId)
  throw Error('Confirm the '+validated.triggerEvent+' event and prepare this ability again.');
 verifyCombatEvent(character,validated.triggerEvent,validated.targetId??null,validated.eventId??null,validated.eventFilter??null);
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
 // The ability consuming the event retains its consumed token; any other
 // committed ability ends the prior opportunity.
 if(state.active&&e.auto&&!validated.triggerEvent)expireCombatEvent(character);
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
 expireCombatEvent(character);
}
function setEncounter(character,enabled){
 const state=combat(character),mode=state.economy.mode;
 state.active=Boolean(enabled);state.turn=1;state.used={action:false,bonus:false,reaction:false};state.spellcasting={bonus:false,restricted:false};
 state.economy={mode,auto:mode!=='manual',spent:{action:0,bonus:0,reaction:0},attacks:{made:0,remaining:0},attackActionMade:0,grants:[],attackGrants:[],lastActivity:null};delete state.event_window;delete state.pending_workflow;delete state.resolved_attack_ids;delete state.last_save;delete state.resolved_save_ids;delete state.undo_turn;
 // Resetting the encounter never destroys conditions; their previous turn
 // anchors are no longer trustworthy, so outstanding grants become DM-managed.
 for(const grant of conditionGrants(character))grant.expiry=null;
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
 const selected=spell.spellcasting_ability;
 if(selected!==undefined&&selected!==null&&selected!==''&&!ABILITIES.includes(selected))
  throw Error('Select a supported spellcasting ability in Edit sheet.');
 const fixed=spell.spellcasting_modifier;
 if(fixed!==undefined&&fixed!==null){
  if(!Number.isSafeInteger(fixed)||fixed< -30||fixed>30)throw Error('Invalid spellcasting modifier override (expected -30 to 30).');
  return fixed;
 }
 let ability=selected||null;
 if(!ability){
  // Preserve legacy single-class saves; never guess between mixed sources.
  const source=String(spell.source||'');
  const direct={wisdom:'WIS',intelligence:'INT',charisma:'CHA'};
  const classes={cleric:'WIS',druid:'WIS',ranger:'WIS',paladin:'CHA',bard:'CHA',sorcerer:'CHA',warlock:'CHA',wizard:'INT'};
  const mentioned=[...source.matchAll(/\b(wisdom|intelligence|charisma)\b/gi)].map(x=>direct[x[1].toLowerCase()]);
  const inferred=mentioned.length?mentioned:[...source.matchAll(/\b(cleric|druid|ranger|paladin|bard|sorcerer|warlock|wizard)\b/gi)].map(x=>classes[x[1].toLowerCase()]);
  const unique=[...new Set(inferred)];
  if(unique.length!==1)throw Error('Choose a spellcasting ability in Edit sheet; the spell source is missing or ambiguous.');
  ability=unique[0];
 }
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
function plan(character,action,context=null){
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
 const filters=eventFilter(action,triggerEvent);
 if(triggerEvent&&activationCost(action.activation)!=='reaction'&&triggerEvent!=='melee-hit')throw Error('This trigger requires a reaction.');
 const workflow=action.workflow;
 let staged=null;
 if(workflow!==undefined&&workflow!==null){
  if(typeof workflow!=='object'||Array.isArray(workflow)||!['damage-reduction','save-condition'].includes(workflow.kind))throw Error('Unsupported staged ability workflow.');
  if(action.effect_kind&&action.effect_kind!=='none')throw Error('Staged ability cannot apply unrelated automatic effects.');
  if(workflow.kind==='damage-reduction'){
   if(activationCost(action.activation)!=='reaction'||cost!==0||grantResource||grantEconomy)throw Error('Damage-reduction workflow must begin with a cost-free reaction.');
   const reduction=dice(action.roll||'');
   if(!reduction||reduction.sides!==10)throw Error('Configure the physical d10 reduction roll first.');
   const next=workflow.followup;
   if(!next||typeof next!=='object'||Array.isArray(next))throw Error('Staged ability requires a qualified optional follow-up.');
   const nextResource=String(next.resource||'').trim(),nextCost=Number(next.cost),nextRoll=dice(next.roll||'');
   if(!nextResource||!Number.isSafeInteger(nextCost)||nextCost<1||nextCost>9999||!nextRoll||nextRoll.sides!==20)throw Error('Configure a resource cost and a d20 follow-up roll.');
   if(next.requires_catchable!==true||next.requires_free_hand!==true)throw Error('Counterattack requires explicit catchable-missile and free-hand confirmation.');
   staged={kind:'damage-reduction',followup:{label:String(next.label||'Counterattack'),resource:nextResource,cost:nextCost,roll:nextRoll.expression,
    requires_catchable:true,requires_free_hand:true}};
  }else{
   // Save-gated conditions are typed, explicit configuration. A 2014 on-hit
   // ability does not buy another action or guess a save DC from imported text.
   const save=workflow.save,failed=workflow.on_failure;
   if(!triggerEvent||!['melee-hit','save-success','save-failure','damage-taken'].includes(triggerEvent))throw Error('Saving-throw workflow needs a confirmed target-bound event.');
   if(grantResource||grantEconomy||grantAttacks||action.roll||action.damage)throw Error('Saving-throw workflow cannot include unrelated grants or dice.');
   if(!save||typeof save!=='object'||!ABILITIES.includes(save.ability)||!Number.isSafeInteger(save.dc)||save.dc<1||save.dc>99)
    throw Error('Configure a verified saving throw ability and DC (1–99).');
   if(!failed||typeof failed!=='object'||!CONDITIONS.has(failed.condition))throw Error('Choose a supported condition on a failed save.');
   const expiration=failed.expiration??'manual';
   if(!CONDITION_EXPIRATIONS.includes(expiration))throw Error('Choose an approved condition expiration.');
   staged={kind:'save-condition',save:{ability:save.ability,dc:save.dc},onFailure:{condition:failed.condition,expiration}};
  }
 }
 if(staged?.kind==='damage-reduction'&&triggerEvent&&triggerEvent!=='ranged-hit')throw Error('Damage reduction requires a ranged-hit trigger.');
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
   economyUnits,requiresAttack:action.requires_attack===true,requiresAttackComplete,grantAttacks,grantAttackScope,grantResource,grantAmount,grantEconomy,triggerEvent:triggerEvent||(staged?'ranged-hit':''),
   targetId:['melee-hit','save-success','save-failure'].includes(triggerEvent)?
    (context?.targetId??combatEvent(character)?.targetId??null):triggerEvent==='damage-taken'?'self':null,
   eventId:(triggerEvent||(staged?'ranged-hit':''))?(combatEvent(character)?.id??null):null,
   eventFilter:filters,workflow:staged});
}
// One pending sequence per character. The continuation is not a second
// reaction: it is an optional child of the already committed parent action.
// The existing combat ledger owns one staged workflow. Character switching
// only pauses the UI; changes to the originating turn, encounter, combat mode
// or target invalidate continuation without refunding the committed cost.
// Legacy v0.38 records receive a best-effort stamp on first access so that an
// already-paid pending save remains resumable after upgrading the application.
function pendingWorkflow(character){
 const state=combat(character),flow=state.pending_workflow;
 if(!flow)return null;
 const turn=state.active?state.turn:null;
 if(flow.turn===undefined)flow.turn=turn;
 if(flow.mode===undefined)flow.mode=state.economy.mode;
 if(flow.turn!==turn||flow.mode!==state.economy.mode||
  (flow.kind==='save-condition'&&!targetById(character,flow.targetId))){
  delete state.pending_workflow;
  return null;
 }
 return flow;
}
function requireWorkflow(character,id,status,kind,message='The staged ability was interrupted, expired, or already resolved.'){
 const flow=pendingWorkflow(character);
 if(!flow||flow.id!==id||flow.status!==status||(kind&&flow.kind!==kind))
  throw Error(message);
 return flow;
}
function beginWorkflow(character,validated,incoming){
 const kind=validated?.workflow?.kind;
 if(!['damage-reduction','save-condition'].includes(kind))throw Error('Not a supported staged action.');
 if(kind==='damage-reduction'&&(!Number.isSafeInteger(incoming)||incoming<1||incoming>999999))throw Error('Enter confirmed incoming weapon damage (1–999999).');
 if(pendingWorkflow(character))throw Error('Resolve or decline the existing staged ability first.');
 const state=combat(character),nextId=(state.sequence_counter||0)+1;
 if(!Number.isSafeInteger(nextId))throw Error('Ability sequence identity exhausted.');
 if(kind==='save-condition'&&(!validated.targetId||!targetById(character,validated.targetId)))throw Error('Choose a valid saving throw target.');
 // The event, identity, cost and action budget must all validate before spending.
 verifyEconomy(character,validated);
 commitUsage(character,validated);
 state.sequence_counter=nextId;
 const stamp={turn:state.active?state.turn:null,mode:state.economy.mode};
 state.pending_workflow=kind==='damage-reduction'?
  {...stamp,id:'sequence-'+nextId,kind,sourceId:validated.sourceId,name:validated.name,status:'await-roll',
   incoming,roll:validated.roll.expression,followup:deepcopy(validated.workflow.followup)}:
  {...stamp,id:'sequence-'+nextId,kind,sourceId:validated.sourceId,name:validated.name,status:'await-save',
   targetId:validated.targetId,save:deepcopy(validated.workflow.save),onFailure:deepcopy(validated.workflow.onFailure),
   eventId:validated.eventId};
 return deepcopy(state.pending_workflow);
}
function resolveWorkflow(character,id,reduction){
 const state=combat(character),entry=requireWorkflow(character,id,'await-roll','damage-reduction','No matching unresolved reduction roll.');
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
 const entry=requireWorkflow(character,id,'optional-followup','damage-reduction','The follow-up is unavailable or already resolved.');
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
// Applying a save-gated condition is a separate, DM-approved mutation. The
// original resource was charged at activation; a failed save grants no refund.
// This does not guess condition duration from a text description.
function finishWorkflowCondition(character,id){
 const state=combat(character),flow=requireWorkflow(character,id,'await-effect','save-condition','No eligible failed-save follow-up.');
 const saved=recentSave(character);
 if(!saved||saved.id!==flow.saveRollId||saved.targetId!==flow.targetId||saved.ability!==flow.save.ability||
  saved.dc!==flow.save.dc||saved.total!==flow.saveTotal||saved.outcome!=='failure')
  throw Error('The original failed saving throw is no longer valid.');
 if(!targetById(character,flow.targetId))throw Error('The original creature is no longer in this encounter.');
 const name=flow.onFailure.condition;
 if(!CONDITIONS.has(name))throw Error('Invalid configured condition.');
 // Older saved workflows without timing remain DM-managed. Do not guess.
 const grant=grantCondition(character,flow.targetId,name,{sourceId:flow.sourceId,expiration:flow.onFailure.expiration??'manual'});
 delete state.pending_workflow;delete state.undo_turn;
 return {targetId:flow.targetId,condition:name,sourceId:flow.sourceId,grant};
}
function declineWorkflow(character,id){
 const state=combat(character),entry=pendingWorkflow(character);
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
  else {
   const grant=conditionGrants(character).find(g=>g.targetId==='self'&&g.condition===effect.condition);
   if(grant)grant.owned=true;
   else if(Array.isArray(character.conditions))character.conditions=character.conditions.filter(c=>c!==effect.condition);
  }
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
 const snapshot={turn:state.turn,active:state.active,used:deepcopy(state.used),spellcasting:deepcopy(state.spellcasting),economy:deepcopy(state.economy),event_window:deepcopy(state.event_window||null),resolved_attack_ids:deepcopy(state.resolved_attack_ids||[]),last_save:deepcopy(state.last_save||null),resolved_save_ids:deepcopy(state.resolved_save_ids||[]),
  effects:deepcopy(activeEffects(character)),conditions:deepcopy(character.conditions||[]),pending_concentration:deepcopy(character.effects.pending_concentration||[]),
  condition_grants:deepcopy(conditionGrants(character)),target_conditions:targets(character).map(t=>({id:t.id,conditions:deepcopy(t.conditions||[])})),
  empty_body_rounds:character.effects.empty_body_rounds||0,empty_body_owned:character.effects.empty_body_owned,
  turn_resources:Object.fromEntries(Object.entries(character.resources||{}).filter(([k,r])=>r?.reset==='turn'||k==='Shield Stance Points').map(([k,r])=>[k,r.current]))};
 if(state.active){state.turn++;state.used={action:false,bonus:false,reaction:false};state.spellcasting={bonus:false,restricted:false};
  state.economy={mode:state.economy.mode,auto:state.economy.auto,spent:{action:0,bonus:0,reaction:0},attacks:{made:0,remaining:0},attackActionMade:0,grants:[],attackGrants:[],lastActivity:null};delete state.event_window;delete state.pending_workflow;delete state.resolved_attack_ids;delete state.last_save;delete state.resolved_save_ids;}
 // Next turn ends the outgoing character turn before starting the next.
 // A source-next-turn-end grant applied on turn N expires leaving turn N+1.
 const endedConditions=state.active?expireConditionGrants(character,'self',state.turn-1):[];
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
 state.turn=before.turn;state.active=before.active;state.used=before.used;state.spellcasting=before.spellcasting||{bonus:false,restricted:false};state.economy=before.economy||state.economy; if(before.event_window)state.event_window=before.event_window;else delete state.event_window;state.resolved_attack_ids=before.resolved_attack_ids||[];state.last_save=before.last_save||null;state.resolved_save_ids=before.resolved_save_ids||[];// A turn boundary permanently retires the old staged opportunity. Undoing
 // initiative must not authorize dice thrown during the interrupted turn.
 delete state.pending_workflow;
 character.effects.active=before.effects;character.conditions=before.conditions;character.effects.pending_concentration=before.pending_concentration||[];
 state.condition_grants=before.condition_grants||[];
 for(const row of before.target_conditions||[]){const target=targetById(character,row.id);if(target)target.conditions=row.conditions;}
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
// Offensive actions cannot inherit the default self-target used by saves,
// conditions and healing. All UI surfaces, including scene tokens, use this gate.
function requireOffensiveTarget(character,id){
 if(!id||id==='self')throw Error('Choose an encounter creature before attacking. Your character cannot be the default attack target.');
 const target=targetById(character,id);
 if(!target)throw Error('The selected encounter creature is no longer available. Choose another target.');
 return target;
}
// The DM/player explicitly verifies a creature's defenses before allowing
// unattended HP application in Auto. The checkbox lives on its actual target
// record, not in a UI-only settings store.
function setTargetAutoDamage(character,id,enabled){
 const target=requireOffensiveTarget(character,id);
 if(typeof enabled!=='boolean')throw Error('Auto-damage permission must be enabled or disabled explicitly.');
 target.auto_damage=enabled;
 return enabled;
}
function canAutoEvaluateAttack(character,id){
 const state=combat(character);
 // A physical attack roll may be evaluated outside encounter turn tracking.
 // Automatic HP damage is a separate, stricter permission requiring encounter.
 if(state.economy.mode!=='auto')return false;
 try{
  const target=requireOffensiveTarget(character,id);
  // Character or target statuses may change attack advantage or hit validity.
  // Until those rules are qualified, require a DM verdict in Auto.
  return !(character.conditions||[]).length&&!(target.conditions||[]).length;
 }catch{return false;}
}
function canAutoApplyAttackDamage(character,id,type,attackType){
 const state=combat(character);
 if(!state.active||state.economy.mode!=='auto'||!['weapon','unarmed'].includes(attackType)||!DAMAGE_TYPES.includes(type)||type==='untyped')return false;
 try{return requireOffensiveTarget(character,id).auto_damage===true;}catch{return false;}
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
  // Defensive profile changed: explicit Auto-damage approval must be renewed.
  if(JSON.stringify(entity.traits[kind]||[])!==JSON.stringify(parsed))entity.auto_damage=false;
  entity.traits[kind]=parsed;
 }
 return parsed;
}
// Condition grants describe the provenance and expiry of *independent* sources.
// The legacy entity.conditions array remains the canonical visible status; grants
// are supplementary ownership/timing records, never another condition flag store.
function conditionGrants(character,targetId=null){
 const state=combat(character);
 if(!Array.isArray(state.condition_grants))state.condition_grants=[];
 // Imported and manually edited vaults can carry malformed metadata. Invalid
 // sources must never schedule expiration or remove an unrelated condition.
 const seen=new Set();
 state.condition_grants=state.condition_grants.filter(g=>{
  if(!g||typeof g!=='object'||!/^condition-[1-9]\d*$/.test(g.id)||seen.has(g.id)||
   typeof g.targetId!=='string'||!CONDITIONS.has(g.condition)||typeof g.sourceId!=='string'||
   typeof g.owned!=='boolean')return false;
  seen.add(g.id);
  if(g.expiry!==null&&(typeof g.expiry!=='object'||typeof g.expiry.anchorId!=='string'||
   !Number.isSafeInteger(g.expiry.endTurn)||g.expiry.endTurn<1))g.expiry=null;
  return true;
 });
 return targetId===null?state.condition_grants:state.condition_grants.filter(g=>g.targetId===targetId);
}
function conditionTurn(character,id){
 if(id==='self')return combat(character).turn;
 const target=targetById(character,id);
 if(!target)throw Error('Tracked condition turn belongs to a removed creature.');
 if(!Number.isSafeInteger(target.condition_turn)||target.condition_turn<1)target.condition_turn=1;
 return target.condition_turn;
}
function grantCondition(character,targetId,name,{sourceId='dm',expiration='manual'}={}){
 if(!CONDITIONS.has(name))throw Error('Unknown D&D condition.');
 if(!CONDITION_EXPIRATIONS.includes(expiration))throw Error('Unknown approved condition expiration.');
 const entity=targetById(character,targetId),state=combat(character);
 if(!entity)throw Error('Original condition target was removed.');
 if(expiration!=='manual'&&!state.active)throw Error('Start encounter tracking before scheduling a turn-based expiration.');
 if(!Array.isArray(entity.conditions))entity.conditions=[];
 const grants=conditionGrants(character),had=entity.conditions.includes(name);
 const owned=!had||grants.some(g=>g.targetId===targetId&&g.condition===name&&g.owned);
 const next=(state.condition_sequence||0)+1;
 if(!Number.isSafeInteger(next))throw Error('Condition grant identity exhausted.');
 const anchor=expiration==='source-next-turn-end'?'self':targetId;
 const turn=expiration==='manual'?null:conditionTurn(character,anchor);
 if(turn===Number.MAX_SAFE_INTEGER)throw Error('Condition turn clock exhausted.');
 const expiry=expiration==='manual'?null:{anchorId:anchor,endTurn:turn+1};
 const grant={id:'condition-'+next,targetId,condition:name,sourceId:String(sourceId).slice(0,120),owned,expiry};
 state.condition_sequence=next;
 if(!had)entity.conditions.push(name);
 grants.push(grant);delete state.undo_turn;
 return deepcopy(grant);
}
function endConditionGrant(character,id){
 const state=combat(character),grants=conditionGrants(character),index=grants.findIndex(g=>g.id===id);
 if(index<0)return false;
 const [ended]=grants.splice(index,1),entity=targetById(character,ended.targetId);
 if(ended.owned&&entity){
  const successor=grants.find(g=>g.targetId===ended.targetId&&g.condition===ended.condition);
  if(successor)successor.owned=true;
  else if(ended.targetId==='self'){
   const effect=activeEffects(character).find(e=>e.condition===ended.condition);
   if(effect)effect.condition_owned=true;
   else entity.conditions=(entity.conditions||[]).filter(n=>n!==ended.condition);
  }else entity.conditions=(entity.conditions||[]).filter(n=>n!==ended.condition);
 }
 delete state.undo_turn;
 return true;
}
function expireConditionGrants(character,anchorId,turn){
 // Snapshot IDs: source removal can transfer ownership to another source.
 const due=conditionGrants(character).filter(g=>g.expiry?.anchorId===anchorId&&g.expiry.endTurn<=turn);
 for(const row of due)endConditionGrant(character,row.id);
 return due.map(g=>({targetId:g.targetId,condition:g.condition,sourceId:g.sourceId}));
}
// Read-only projection of the existing independent creature turn clocks and
// scheduled condition sources. No inferred initiative, automatic advancement,
// or persisted UI progress is created here.
function creatureTurns(character){
 const grants=conditionGrants(character);
 return targets(character).map(target=>{
  const turn=conditionTurn(character,target.id);
  const scheduled=grants.filter(g=>g.expiry?.anchorId===target.id).map(g=>({
   condition:g.condition,sourceId:g.sourceId,targetId:g.targetId,endTurn:g.expiry.endTurn,
   due:g.expiry.endTurn<=turn
  }));
  return {id:target.id,name:target.name,turn,scheduled};
 });
}
// Advance an explicitly selected creature's turn independently of the player's
// turn. This is a DM confirmation, NOT a guessed initiative scheduler.
function advanceTargetTurn(character,id){
 const state=combat(character);
 if(!state.active)throw Error('Start encounter tracking before advancing a creature turn.');
 if(id==='self')throw Error('Use Next turn to advance your character.');
 const target=targetById(character,id);
 if(!target)throw Error('Creature was removed from the encounter.');
 const turn=conditionTurn(character,id);
 if(turn>=Number.MAX_SAFE_INTEGER)throw Error('Creature turn clock exhausted.');
 const expired=expireConditionGrants(character,id,turn);
 // A DM-confirmed creature-turn boundary retires event and workflow evidence
 // tied to that creature, without guessing a global initiative order.
 const event=combatEvent(character);
 if(event&&(event.targetId===id||event.attackerId===id))expireCombatEvent(character);
 if(state.pending_workflow?.targetId===id)delete state.pending_workflow;
 if(state.last_save?.targetId===id)delete state.last_save;
 target.condition_turn=turn+1;delete state.undo_turn;
 return {targetId:id,turn:target.condition_turn,expired};
}
// Target conditions are explicit manual adjudications. No save, damage or
// duration is inferred from a label. All records live with the encounter.
function setTargetCondition(character,id,name,enabled){
 if(!CONDITIONS.has(name))throw Error('Unknown D&D condition.');
 const entity=targetById(character,id);
 if(!entity)throw Error('Target no longer exists.');
 if(!Array.isArray(entity.conditions))entity.conditions=[];
 if(enabled&&!entity.conditions.includes(name))entity.conditions.push(name);
 if(!enabled){
  if(id==='self'&&activeEffects(character).some(e=>e.condition===name))throw Error('End the linked effect before removing '+name+'.');
  // Explicit DM removal dismisses every scheduled grant of this condition.
  const state=combat(character);
  state.condition_grants=conditionGrants(character).filter(g=>g.targetId!==id||g.condition!==name);
  entity.conditions=entity.conditions.filter(x=>x!==name);
 }
 delete combat(character).undo_turn;
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
 const state=combat(character);
 state.condition_grants=conditionGrants(character).filter(g=>g.targetId!==id);
 // A removed creature cannot continue driving another effect's turn clock.
 for(const grant of state.condition_grants)if(grant.expiry?.anchorId===id)grant.expiry=null;
 if(combat(character).pending_workflow?.targetId===id)delete combat(character).pending_workflow;
 if([combatEvent(character)?.targetId,combatEvent(character)?.attackerId].includes(id))expireCombatEvent(character);
 if(combat(character).last_save?.targetId===id)delete combat(character).last_save;
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
 if(undo.event_id){
  const event=combatEvent(character);
  if(!event||event.id!==undo.event_id||event.used){delete state.last_damage_undo;throw Error('A damage-triggered event was consumed or replaced. Damage undo is no longer safe.');}
 }
 // Only an outstanding check created by this exact damage event is reversible.
 if(undo.check_id&&!character.effects?.pending_concentration?.some(c=>c.id===undo.check_id)){
  delete state.last_damage_undo;throw Error('Concentration was already resolved or ended. Damage undo is no longer safe.');
 }
 target.hp.current=undo.before.current;target.hp.temp=undo.before.temp;
 if(undo.check_id&&Array.isArray(character.effects.pending_concentration))
  character.effects.pending_concentration=character.effects.pending_concentration.filter(c=>c.id!==undo.check_id);
 if(undo.event_id)expireCombatEvent(character);
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
 const policy=String(details.savePolicy||'none');
 const saveId=details.saveId||null;
 if(saveId!==null&&(typeof saveId!=='string'||!SAVE_ID.test(saveId)))throw Error('Invalid save evidence identity.');
 if(saveId&&policy==='none')throw Error('Choose the damage rule for the linked saving throw.');
 const evidence=saveId?recentSave(character):null;
 if(saveId&&(!evidence||evidence.id!==saveId||evidence.targetId!==targetId))throw Error('The linked saving throw is stale or belongs to another target.');
 const outcome=saveId?evidence.outcome:String(details.saveOutcome||'none');
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
 return {targetId,type,raw,amount:reduced,absorbed,hpLoss:loss,saveOutcome:outcome,savePolicy:policy,saveId,
   initial:{current:hp.current,max:hp.max,temp:hp.temp||0},immune,resistant,vulnerable};
}
function commitDamage(character,planned){
 if(!planned||!Number.isSafeInteger(planned.amount))throw Error('Invalid damage plan.');
 const target=targetById(character,planned.targetId);
 if(!target)throw Error('Target has been removed.');
 const fresh=planDamage(character,planned.targetId,{amount:planned.raw,type:planned.type,saveOutcome:planned.saveOutcome,savePolicy:planned.savePolicy,saveId:planned.saveId});
 if(JSON.stringify(fresh)!==JSON.stringify(planned))throw Error('Target or defenses changed; preview the damage again.');
 const state=combat(character);
 const willEmit=planned.targetId==='self'&&fresh.amount>0&&state.active&&state.economy.auto&&!state.pending_workflow;
 if(willEmit&&(!Number.isSafeInteger(state.event_sequence||0)||state.event_sequence>=Number.MAX_SAFE_INTEGER))
  throw Error('Combat event sequence exhausted. Damage was not applied.');
 state.last_damage_undo={targetId:planned.targetId,before:{...fresh.initial},after:{current:fresh.initial.current-fresh.hpLoss,temp:fresh.initial.temp-fresh.absorbed},check_id:null,event_id:null};
 target.hp.temp=(target.hp.temp||0)-fresh.absorbed;target.hp.current-=fresh.hpLoss;
 const check=planned.targetId==='self'&&fresh.amount>0?queueConcentrationCheck(character,fresh.amount):null;
 state.last_damage_undo.check_id=check?.id||null;
 // Applied damage is the commit boundary; no event exists during previews.
 // Do not displace an unfinished staged reaction or manufacture a damage
 // trigger for zero effective damage, other creatures, or manual mode.
 if(willEmit){
  const event=setCombatEvent(character,'damage-taken',{origin:'applied-damage',targetId:'self',damageType:fresh.type,damageAmount:fresh.amount,hpLoss:fresh.hpLoss});
  state.last_damage_undo.event_id=event.id;
 }
 return {...fresh,concentrationCheck:check};
}
const api={CONDITION_EXPIRATIONS,conditionGrants,grantCondition,endConditionGrant,creatureTurns,advanceTargetTurn,recentSave,recordResolvedSave,EVENT_KINDS,INCOMING_ATTACK_KINDS,recordIncomingAttack,resolveIncomingAttack,combatEvent,expireCombatEvent,recordCombatEvent,recordResolvedAttack,attackRange,dismissCombatEvent,verifyCombatEvent,previewWorkflowFollowup,attackType,availableAttackGrants,pendingWorkflow,beginWorkflow,resolveWorkflow,finishWorkflow,finishWorkflowCondition,declineWorkflow,poolLimits,attacksPerAction,economyAvailable,verifyAttack,commitAttack,setCombatMode,setAutoEconomy,configureEconomy,addResourcePool,configureResourcePool,configureSpellSlots,setResourceCurrent,grantEconomyAction,dice,resolveD20,compatibleBonuses,setAutoUse,resolveRollBonus,criticalDamageExpression,plan,planSpell,spellSlots,commit,commitUsage,combat,activationCost,verifyEconomy,markAction,setEncounter,advanceTurn,undoTurn,activeEffects,startEffect,endEffect,endAllEffects,endEmptyBody,advanceEffects,applyHealing,effectiveAC,consumeCharge,concentrationDC,queueConcentrationCheck,resolveConcentrationCheck,castingModifier,modifierTotal,targets,targetById,requireOffensiveTarget,setTargetAutoDamage,canAutoEvaluateAttack,canAutoApplyAttackDamage,addTarget,removeTarget,updateTargetStat,damageTraits,targetTraits,setTargetTraits,setTargetCondition,evaluateAttack,evaluateSave,planDamage,commitDamage,undoLastDamage,DAMAGE_TYPES,ABILITIES,CONDITIONS};root.DndAction=api;
if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
