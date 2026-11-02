'use strict';
const assert=require('node:assert/strict');
const A=require('../web/dnd-action.js'),Vault=require('../web/vault-store.js');
const create=()=>({schema_version:1,name:'Test Ranger',inventory:[],hp:{current:11,max:20,temp:0},conditions:[],effects:{},
 resources:{Ki:{current:4,max:4},'Level 1 Spell Slots':{current:2,max:2},'Shield Stance Points':{current:3,max:4}},
 actions:[{id:'a',name:'Shield Art',activation:'1 action',cost:2,resource:'Ki',effect_kind:'condition',effect_condition:'Invisible',duration_rounds:2},
 {id:'b',name:'Blink',activation:'bonus action',effect_kind:'condition',effect_condition:'Invisible',duration_rounds:2},
 {id:'c',name:'Watch',activation:'reaction',effect_kind:'none'}],
 spells:[{id:'s',name:'Long Ward',level:1,prepared:true,casting_time:'1 action',effect_kind:'condition',effect_condition:'Poisoned',duration_rounds:3}]});
let c=create();
assert.equal(A.combat(c).active,false);
assert.equal(A.activationCost('1 Bonus Action'),'bonus');
assert.equal(A.activationCost('reaction'),'reaction');
assert.equal(A.activationCost('1 minute'),null);
assert.equal(A.activationCost('special'),null);
// Inactive encounters never consume action economy; activation still checks resources.
const p=A.plan(c,c.actions[0]);assert.equal(p.condition,'Invisible');
A.commitUsage(c,p);assert.equal(c.resources.Ki.current,2);assert.equal(A.combat(c).used.action,false);
// Tracking is optional, and action costs are enforced only when enabled.
c=create();A.setEncounter(c,true);
assert.equal(A.combat(c).turn,1);
let ability=A.plan(c,c.actions[0]);
A.commitUsage(c,ability);A.startEffect(c,ability);
assert.equal(c.resources.Ki.current,2);assert.equal(A.combat(c).used.action,true);
assert.deepEqual(c.conditions,['Invisible']);
assert.throws(()=>A.commitUsage(c,A.plan(c,c.actions[0])),/already used/);
assert.equal(c.resources.Ki.current,2,'no resource charged on economy rejection');
let bonus=A.plan(c,c.actions[1]);A.commitUsage(c,bonus);A.startEffect(c,bonus);
assert.equal(A.combat(c).used.bonus,true);
assert.equal(A.activeEffects(c).length,2);
let reaction=A.plan(c,c.actions[2]);A.commitUsage(c,reaction);assert.equal(A.combat(c).used.reaction,true);
assert.throws(()=>A.markAction(c,'bonus'),/already spent/);
assert.throws(()=>A.markAction(c,'unknown'),/Unknown/);
assert.throws(()=>A.plan(c,{...c.actions[0],effect_condition:'Confused'}),/Choose a supported/);
// Multiple condition sources: ending the first transfers ownership to the second.
assert.equal(A.endEffect(c,'ability:a'),true);
assert.deepEqual(c.conditions,['Invisible']);
assert.equal(A.activeEffects(c)[0].condition_owned,true);
assert.equal(A.endEffect(c,'ability:b'),true);
assert.deepEqual(c.conditions,[]);
// A pre-existing manually set condition should never be stripped by a timed effect.
c=create();c.conditions.push('Invisible');ability=A.plan(c,c.actions[0]);A.startEffect(c,ability);
assert.equal(A.activeEffects(c)[0].condition_owned,false);
A.endEffect(c,'ability:a');assert.deepEqual(c.conditions,['Invisible']);
// Spell and action use the same budget and condition ownership path.
c=create();A.setEncounter(c,true);
const spell=A.planSpell(c,c.spells[0]);A.commitUsage(c,spell);A.startEffect(c,spell);
assert.equal(c.resources['Level 1 Spell Slots'].current,1);
assert.deepEqual(c.conditions,['Poisoned']);
assert.throws(()=>A.commitUsage(c,A.planSpell(c,c.spells[0])),/already used/);
assert.equal(c.resources['Level 1 Spell Slots'].current,1);
// Next turn ticks effects once; undo restores economy, conditions, and timers.
const expired=A.advanceTurn(c);assert.deepEqual(expired,[]);
assert.equal(A.combat(c).turn,2);assert.equal(A.activeEffects(c)[0].rounds_remaining,2);
assert.equal(A.combat(c).used.action,false);assert.equal(c.resources['Shield Stance Points'].current,0);
assert.equal(A.undoTurn(c),true);assert.equal(A.undoTurn(c),false);
assert.equal(A.combat(c).turn,1);assert.equal(A.combat(c).used.action,true);
assert.equal(A.activeEffects(c)[0].rounds_remaining,3);
assert.equal(c.resources['Shield Stance Points'].current,3);
assert.deepEqual(c.conditions,['Poisoned']);
A.advanceTurn(c);A.advanceTurn(c);
assert.deepEqual(A.advanceTurn(c),['Long Ward']);
assert.deepEqual(c.conditions,[]);
// Vault merging must preserve turn state and condition effects (not reset a running encounter).
const fresh=create(),merged=Vault.reconcile(c,fresh);
assert.equal(merged.effects.combat.turn,4);
assert.deepEqual(merged.effects.active,[]);
// An encounter can be ended without wiping a character's notes, HP, and other resources.
A.setEncounter(c,false);assert.equal(A.combat(c).active,false);
assert.equal(c.resources['Level 1 Spell Slots'].current,1);
console.log('D&D encounter economy, atomic costs, self-conditions, source ownership, undo, expiration and vault persistence PASS');
