'use strict';
const assert=require('node:assert/strict');
const A=require('../web/dnd-action.js');
const hero=()=>({schema_version:1,name:'Turn Boundary QA',hp:{max:20,current:20},
 inventory:[],actions:[],spells:[],attacks:[],resources:{Ki:{max:3,current:3}},effects:{},conditions:[]});
let c=hero(),target=A.addTarget(c,{name:'Dummy',ac:13,hp:20}),other=A.addTarget(c,{name:'Goblin',ac:13,hp:10});
A.setEncounter(c,true);
A.recordCombatEvent(c,'melee-hit',target.id);
assert.equal(A.combatEvent(c).targetId,target.id);
A.advanceTargetTurn(c,other.id);
assert.equal(A.combatEvent(c).targetId,target.id,'Unrelated creature turn does not close event');
A.advanceTargetTurn(c,target.id);
assert.equal(A.combatEvent(c),null,'Target turn ends a stale hit event');
// A save from a prior target turn cannot be used to mitigate damage this turn.
// Directly exercise the normalized ledger: no assumed roll provenance.
A.combat(c).last_save={id:'save-1',targetId:target.id};
A.advanceTargetTurn(c,target.id);
assert.equal(A.combat(c).last_save,undefined);
A.combat(c).pending_workflow={id:'workflow-1',targetId:target.id};
A.advanceTargetTurn(c,target.id);
assert.equal(A.combat(c).pending_workflow,undefined);
assert.equal(c.resources.Ki.current,3,'Turn expiration cannot refund or charge a resource');
console.log('Creature turn retires only matching event, saved result, and staged target workflow PASS');
