'use strict';
const assert=require('node:assert/strict');
const A=require('../web/dnd-action.js');
const hero=()=>({schema_version:1,name:'Turn Overview QA',hp:{max:20,current:20,temp:0},
 inventory:[],actions:[],spells:[],attacks:[],resources:{},effects:{},conditions:[]});
const c=hero(),goblin=A.addTarget(c,{name:'Goblin',ac:13,hp:12}),ogre=A.addTarget(c,{name:'Ogre',ac:11,hp:55});
assert.deepEqual(A.creatureTurns(c).map(x=>x.name),['Goblin','Ogre'],'No roster duplication');
assert.deepEqual(A.creatureTurns(c)[0].scheduled,[]);
A.setEncounter(c,true);
const first=A.grantCondition(c,goblin.id,'Stunned',{sourceId:'strike',expiration:'target-next-turn-end'});
const second=A.grantCondition(c,goblin.id,'Restrained',{sourceId:'net',expiration:'source-next-turn-end'});
const cross=A.grantCondition(c,ogre.id,'Poisoned',{sourceId:'cloud',expiration:'target-next-turn-end'});
let rows=A.creatureTurns(c);
assert.deepEqual(rows[0].scheduled.map(x=>x.condition),['Stunned']);
assert.equal(rows[0].scheduled[0].targetId,goblin.id);
assert.equal(rows[0].scheduled[0].endTurn,2);
assert.equal(rows[0].scheduled[0].due,false);
assert.equal(rows[1].scheduled[0].condition,'Poisoned');
assert.deepEqual(A.conditionGrants(c).map(x=>x.id),[first.id,second.id,cross.id],
 'Read-only overview must not consume condition sources');
A.advanceTargetTurn(c,goblin.id);rows=A.creatureTurns(c);
assert.equal(rows[0].turn,2);assert.equal(rows[0].scheduled[0].due,true);
assert.equal(rows[1].turn,1,'Creature clocks are independent');
A.advanceTargetTurn(c,goblin.id);
assert.equal(A.creatureTurns(c)[0].scheduled.length,0);
assert(A.targetById(c,ogre.id).conditions.includes('Poisoned'));
assert(A.targetById(c,goblin.id).conditions.includes('Restrained'),'Source-anchored grant not prematurely cleared');
A.advanceTurn(c);A.advanceTurn(c);
assert(!A.targetById(c,goblin.id).conditions.includes('Restrained'));
// Invalid turn clocks cannot overflow or silently expire and remove conditions.
A.targetById(c,ogre.id).condition_turn=Number.MAX_SAFE_INTEGER;
assert.throws(()=>A.advanceTargetTurn(c,ogre.id),/exhausted/);
assert(A.targetById(c,ogre.id).conditions.includes('Poisoned'));
assert.equal(A.creatureTurns(c)[1].turn,Number.MAX_SAFE_INTEGER);
console.log('Independent creature turn overview, conditional expiry, no mutation, clock limit PASS');
