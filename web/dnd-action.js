/* D&D-only action execution contract. No rule inference from imported prose.
   Imported actions remain descriptive until a player configures exact effects.
   Plans validate before mutation; costs and healing are never silently applied. */
(function(root){'use strict';
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
function duration(value){
 const n=Number(value??0);
 if(!Number.isSafeInteger(n)||n<0||n>999)throw Error('Duration must be 0–999 rounds (0 is untimed).');
 return n;
}
function spellSlots(character){
 return Object.entries(character?.resources||{}).flatMap(([name,pool])=>{
  const match=/^Level ([1-9]) Spell Slots$/.exec(name);
  return match?[{level:Number(match[1]),resource:name,current:Number(pool.current)||0,max:Number(pool.max)||0}]:[];
 }).sort((a,b)=>a.level-b.level);
}
function planSpell(character,spell,slotLevel){
 if(!character||!spell||spell.available===false)throw Error('Spell is unavailable.');
 const level=Number(spell.level);
 if(spell.level===null||spell.level===undefined||!Number.isSafeInteger(level)||level<0||level>9)
  throw Error('Set the spell level before casting.');
 if(level>0&&!spell.prepared&&!spell.always_prepared)throw Error('Prepare this spell before casting.');
 const slot=Number(slotLevel??level);
 if(!Number.isSafeInteger(slot)||slot<level||slot>9||(level===0&&slot!==0))
  throw Error('Invalid casting slot level.');
 const resource=slot===0?'':`Level ${slot} Spell Slots`,cost=slot===0?0:1;
 if(cost){
  const pool=character.resources?.[resource];
  if(!pool)throw Error(`No level ${slot} spell slot pool. Check your imported slots.`);
  if(!Number.isInteger(Number(pool.current))||Number(pool.current)<1)throw Error('No level '+slot+' spell slots remaining.');
 }
 const effect=spell.effect_kind||'none';
 if(!['none','heal','condition'].includes(effect))throw Error('Unsupported spell effect.');
 const roll=dice(spell.roll||'');
 if(effect==='heal'&&!roll)throw Error('Healing needs a configured dice expression.');
 const condition=effect==='condition'?String(spell.effect_condition||'').trim():'';
 if(effect==='condition'&&!CONDITIONS.has(condition))throw Error('Choose a supported self-condition.');
 const concentration=typeof spell.concentration==='boolean'?spell.concentration:/\bconcentration\b/i.test(String(spell.duration||''));
 const rounds=duration(spell.duration_rounds);
 return Object.freeze({kind:'spell',name:String(spell.name||'Spell'),sourceId:String(spell.id||spell.name||'spell'),resource,cost,roll,effect,
  concentration,durationRounds:rounds,activation:String(spell.casting_time||'special'),slotLevel:slot,condition});
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
 if(!['none','heal','condition'].includes(effect))throw Error('Unsupported ability effect.');
 const roll=dice(action.roll||'');
 if(effect==='heal'&&!roll)throw Error('Healing requires a configured dice expression.');
 const condition=effect==='condition'?String(action.effect_condition||'').trim():'';
 if(effect==='condition'&&!CONDITIONS.has(condition))throw Error('Choose a supported self-condition.');
 if(action.damage)dice(action.damage); // Validate all configured dice before mutation.
 return Object.freeze({kind:'ability',name:String(action.name||'Ability'),sourceId:String(action.id||action.name||'ability'),resource,cost,roll,effect,
   concentration:action.concentration===true,durationRounds:duration(action.duration_rounds),activation:String(action.activation||'special'),condition});
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
 for(const effect of removed){
  if(!effect.condition_owned||!effect.condition)continue;
  const successor=character.effects.active.find(e=>e.condition===effect.condition);
  if(successor)successor.condition_owned=true;
  else if(Array.isArray(character.conditions))character.conditions=character.conditions.filter(c=>c!==effect.condition);
 }
 return true;
}
function startEffect(character,validated){
 if(!validated||(!validated.concentration&&!validated.durationRounds&&!validated.condition))return null;
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
  rounds_remaining:validated.durationRounds||null,...(condition?{condition,condition_owned:owned}:{})};
 activeEffects(character).push(row);
 return row;
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
  effects:deepcopy(activeEffects(character)),conditions:deepcopy(character.conditions||[]),
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
 character.effects.active=before.effects;character.conditions=before.conditions;
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
const api={dice,plan,planSpell,spellSlots,commit,commitUsage,combat,activationCost,verifyEconomy,markAction,setEncounter,advanceTurn,undoTurn,activeEffects,startEffect,endEffect,advanceEffects,applyHealing,CONDITIONS};root.DndAction=api;
if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
