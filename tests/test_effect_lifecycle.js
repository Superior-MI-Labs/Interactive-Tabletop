'use strict';
const assert=require('node:assert/strict');
const A=require('../web/dnd-action.js');
const make=()=>({name:'Lifecycle QA',system_edition:'dnd-2014',hp:{current:30,max:30,temp:6},ac:14,
 conditions:['Poisoned'],effects:{},resources:{}});
const ward={kind:'spell',sourceId:'ward',name:'Ward',concentration:true,durationRounds:10,condition:'Invisible'};
let c=make();
A.startEffect(c,ward);
assert.deepEqual(c.conditions,['Poisoned','Invisible']);
let one=A.queueConcentrationCheck(c,9);
let two=A.queueConcentrationCheck(c,21);
assert.notEqual(one.id,two.id,'Concentration check IDs cannot depend on clock resolution or pending length');
assert.equal(one.dc,10);assert.equal(two.dc,11);
assert.equal(A.resolveConcentrationCheck(c,one.id,14).success,true);
const three=A.queueConcentrationCheck(c,26);
assert.notEqual(three.id,one.id,'Resolving a check must not recycle its ID');
assert.notEqual(three.id,two.id);
const persisted=JSON.parse(JSON.stringify(c));
assert.equal(A.queueConcentrationCheck(persisted,2).id,'con-4','ID sequence persists in character state');
assert.equal(A.resolveConcentrationCheck(c,two.id,4).success,false);
assert.equal(A.activeEffects(c).length,0);
assert.deepEqual(c.conditions,['Poisoned'],'Concentration failure uses ownership cleanup');
assert.equal(c.effects.pending_concentration.length,0);
// Completed concentration saves must invalidate damage undo even if HP did not change.
c=make();A.startEffect(c,ward);
const hit=A.planDamage(c,'self',{amount:10});
const result=A.commitDamage(c,hit);
assert.equal(result.concentrationCheck.dc,10);
assert.equal(A.resolveConcentrationCheck(c,result.concentrationCheck.id,15).success,true);
assert.throws(()=>A.undoLastDamage(c),/no longer safe/);
assert.equal(c.hp.current,26);
assert.equal(A.undoLastDamage(c),false);
// The unresolved check can still be undone together with exactly its damage.
c=make();A.startEffect(c,ward);
const damaged=A.commitDamage(c,A.planDamage(c,'self',{amount:15}));
assert.equal(A.undoLastDamage(c),true);
assert.equal(c.hp.current,30);
assert.equal(c.hp.temp,6);
assert.equal(c.effects.pending_concentration.length,0);
assert.equal(A.activeEffects(c).length,1);
// All effects end through the same cleanup contract; preserve manual conditions.
c=make();A.startEffect(c,ward);
A.startEffect(c,{kind:'ability',sourceId:'second',name:'Second',condition:'Prone',durationRounds:2});
assert.equal(A.endAllEffects(c),2);
assert.deepEqual(c.conditions,['Poisoned']);
assert.deepEqual(c.effects.active,[]);
assert.deepEqual(c.effects.pending_concentration,[]);
assert.equal(A.endAllEffects(c),0);
// Stale queues in older vaults must not survive the global cleanup.
c.effects.pending_concentration.push({id:'old',effect_id:'missing',dc:10});
A.endAllEffects(c);assert.equal(c.effects.pending_concentration.length,0);
// If invisibility existed independently, ending Empty Body must never remove it.
c=make();c.conditions.push('Invisible');c.effects.empty_body_rounds=2;c.effects.empty_body_owned=false;
A.endEmptyBody(c);assert(c.conditions.includes('Invisible'));
assert.equal(c.effects.empty_body_rounds,0);
// Owned Empty Body invisibility expires normally, and can be restored by undo.
c=make();c.effects.empty_body_rounds=1;c.effects.empty_body_owned=true;c.conditions.push('Invisible');
A.advanceTurn(c);assert.deepEqual(c.conditions,['Poisoned']);
assert.equal(A.undoTurn(c),true);assert(c.conditions.includes('Invisible'));
assert.equal(c.effects.empty_body_owned,true);
// A different active effect retaining the condition stops Empty Body cleanup.
c=make();c.effects.empty_body_rounds=1;c.effects.empty_body_owned=true;
A.startEffect(c,{kind:'ability',sourceId:'invis',name:'Invis',condition:'Invisible',durationRounds:5});
A.endEmptyBody(c);assert(c.conditions.includes('Invisible'));
A.endAllEffects(c);assert(!c.conditions.includes('Invisible'));
console.log('Effect lifecycle: unique concentration IDs, settled undo guard, rest cleanup, manual conditions and Empty Body ownership PASS');
