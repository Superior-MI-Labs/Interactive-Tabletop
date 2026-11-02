'use strict';
const assert=require('node:assert/strict');
const A=require('../web/dnd-action.js'),V=require('../web/vault-store.js');
function setup(){
 const c={schema_version:1,name:'Event Window',system_edition:'dnd-2014',effects:{},
  hp:{current:24,max:24},conditions:[],inventory:[],resources:{Ki:{current:3,max:3}},
  actions:[],attacks:[{id:'sword',name:'Sword',attack_type:'weapon',attack_range:'melee'}]};
 const a=A.addTarget(c,{name:'A',ac:14,hp:20}),b=A.addTarget(c,{name:'B',ac:14,hp:20});
 A.setEncounter(c,true);return {c,a,b};
}
const stun={id:'stun',name:'Stunning Strike',activation:'special',trigger_event:'melee-hit',resource:'Ki',cost:1};
const other={id:'other',name:'Other Ability',activation:'special',cost:0};
let {c,a,b}=setup();
assert.throws(()=>A.recordCombatEvent(c,'melee-hit','self'),/Choose the creature/);
assert.throws(()=>A.recordCombatEvent(c,'melee-hit','unknown'),/Choose the creature/);
A.recordCombatEvent(c,'melee-hit',a.id);
let plan=A.plan(c,stun,{targetId:a.id});
assert.equal(A.combatEvent(c).targetId,a.id);
assert.equal(A.combatEvent(c).turn,1);
assert.throws(()=>A.verifyEconomy(c,A.plan(c,stun,{targetId:b.id})),/creature hit/);
assert.equal(c.resources.Ki.current,3);
const copy=V.normalize({schema_version:1,active_id:'one',characters:[{id:'one',character:c}]}).characters[0].character;
assert.equal(A.combatEvent(copy).targetId,a.id,'Target-scoped opportunity survives save/reload');
A.recordCombatEvent(c,'melee-hit',a.id);
assert.throws(()=>A.commitUsage(c,plan),/event changed/,'Old dialog cannot spend a new event');
assert.equal(c.resources.Ki.current,3);
A.commitUsage(c,A.plan(c,stun,{targetId:a.id}));
assert.equal(c.resources.Ki.current,2);assert.equal(A.combatEvent(c).used,true);
A.recordCombatEvent(c,'melee-hit',a.id);
A.commitUsage(c,A.plan(c,other));
assert.equal(A.combatEvent(c),null,'Unrelated committed ability closes event');
A.recordCombatEvent(c,'melee-hit',a.id);
A.markAction(c,'reaction');assert.equal(A.combatEvent(c),null,'Manually spent combat action closes event');
A.recordCombatEvent(c,'melee-hit',a.id);
A.commitAttack(c);assert.equal(A.combatEvent(c),null,'Subsequent Attack action closes previous hit');
A.recordCombatEvent(c,'melee-hit',a.id);
assert.equal(A.removeTarget(c,a.id),true);assert.equal(A.combatEvent(c),null,'Removed target invalidates bound event');
A.recordCombatEvent(c,'melee-hit',b.id);
A.setCombatMode(c,'guided');assert.equal(A.combatEvent(c),null,'Mode switch cannot revive a stale confirmation');
A.recordCombatEvent(c,'melee-hit',b.id);
A.advanceTurn(c);assert.equal(A.combatEvent(c),null);
A.undoTurn(c);assert.equal(A.combatEvent(c)?.targetId,b.id,'Undo turn restores original same-turn window');
A.combat(c).event_window.turn=4;
assert.equal(A.combatEvent(c),null,'Legacy or inconsistent turn windows fail closed');
// A manual event without a specified target is a DM-only generic confirmation.
let d=setup();A.recordCombatEvent(d.c,'incoming-attack');
const flare={id:'flare',activation:'1 reaction',trigger_event:'incoming-attack',cost:0};
A.commitUsage(d.c,A.plan(d.c,flare));assert.equal(A.combatEvent(d.c).used,true);
console.log('Event lifecycle: target binding, stale plan, action expiration, turn/target/mode cleanup and vault PASS');
