'use strict';
const assert=require('node:assert/strict');
const A=require('../web/dnd-action.js'),V=require('../web/vault-store.js');
const sample=()=>({schema_version:1,name:'Save QA',system_edition:'dnd-2014',hp:{max:30,current:30,temp:2},ac:15,
 inventory:[],conditions:[],effects:{},resources:{},attacks:[],actions:[],spells:[]});
const rollId=(n)=>`attack-roll-save-${n}`;
let c=sample(),enemy=A.addTarget(c,{name:'Mage',ac:13,hp:30});
A.setEncounter(c,true);
assert.throws(()=>A.recordResolvedSave(c,{rollId:'bad',targetId:enemy.id,ability:'DEX',total:17,dc:15}),/identity/);
assert.throws(()=>A.recordResolvedSave(c,{rollId:rollId(1),targetId:enemy.id,ability:'BAD',total:17,dc:15}),/ability/);
assert.throws(()=>A.recordResolvedSave(c,{rollId:rollId(1),targetId:'missing',ability:'DEX',total:17,dc:15}),/target/);
assert.equal(A.recentSave(c),null);
let saved=A.recordResolvedSave(c,{rollId:rollId(1),targetId:enemy.id,ability:'DEX',total:17,dc:15});
assert.equal(saved.outcome,'success');assert.equal(A.combatEvent(c).kind,'save-success');
assert.equal(A.combatEvent(c).targetId,enemy.id);
assert.throws(()=>A.recordResolvedSave(c,{rollId:rollId(1),targetId:enemy.id,ability:'DEX',total:17,dc:15}),/already recorded/);
// A save does not spontaneously reduce unrelated damage just because its target matches.
let plain=A.planDamage(c,enemy.id,{amount:11,type:'fire'});
assert.equal(plain.amount,11);assert.equal(plain.saveId,null);
assert.equal(A.commitDamage(c,plain).amount,11);assert.equal(enemy.hp.current,19);
assert.equal(A.combatEvent(c).kind,'save-success','Damage to another creature does not create a self-damage event');
assert.equal(A.undoLastDamage(c),true);
let linked=A.planDamage(c,enemy.id,{amount:11,type:'fire',saveId:saved.id,savePolicy:'half'});
assert.equal(linked.amount,5);assert.equal(linked.saveId,saved.id);
assert.throws(()=>A.planDamage(c,'self',{amount:11,saveId:saved.id,savePolicy:'half'}),/another target/);
assert.throws(()=>A.planDamage(c,enemy.id,{amount:11,saveId:saved.id}),/damage rule/);
assert.throws(()=>A.planDamage(c,enemy.id,{amount:11,saveId:'attack-roll-save-fake',savePolicy:'half'}),/stale/);
// Re-check the save association at the final HP commit (never trust stale preview).
A.recordResolvedSave(c,{rollId:rollId(2),targetId:enemy.id,ability:'CON',total:6,dc:15});
const hp=enemy.hp.current;
assert.throws(()=>A.commitDamage(c,linked),/stale/);
assert.equal(enemy.hp.current,hp);
const failed=A.planDamage(c,enemy.id,{amount:11,type:'fire',saveId:rollId(2),savePolicy:'half'});
assert.equal(failed.amount,11,'Failed save receives no reduction');
A.commitDamage(c,failed);assert.equal(enemy.hp.current,hp-11);
const copy=V.normalize({schema_version:1,active_id:'x',characters:[{id:'x',character:c}]}).characters[0].character;
assert.equal(A.recentSave(copy).id,rollId(2));
A.advanceTurn(c);assert.equal(A.recentSave(c),null,'Prior-turn result cannot be used for a new turn');
assert.throws(()=>A.planDamage(c,enemy.id,{amount:4,saveId:rollId(2),savePolicy:'negates'}),/stale/);
assert.equal(A.undoTurn(c),true);
assert.equal(A.recentSave(c).id,rollId(2),'Undo restores the exact previous turn evidence');
assert.equal(A.removeTarget(c,enemy.id),true);assert.equal(A.recentSave(c),null);
// Damage taken by the active character produces a short-lived self-scoped event.
c=sample();A.setEncounter(c,true);
A.startEffect(c,{kind:'spell',sourceId:'s',name:'Concentration QA',durationRounds:10,concentration:true});
const damage=A.commitDamage(c,A.planDamage(c,'self',{amount:12,type:'fire'}));
assert.equal(damage.amount,12);assert.equal(damage.concentrationCheck.dc,10);
assert.equal(A.combatEvent(c).kind,'damage-taken');assert.equal(A.combatEvent(c).targetId,'self');
assert.equal(c.hp.current,20); // 2 temp and 10 current HP absorbed/lost
assert.equal(A.undoLastDamage(c),true);assert.equal(c.hp.current,30);assert.equal(c.hp.temp,2);
assert.equal(A.combatEvent(c),null);assert.equal(c.effects.pending_concentration.length,0);
A.commitDamage(c,A.planDamage(c,'self',{amount:5}));
const event=A.combatEvent(c);
assert.throws(()=>A.verifyCombatEvent(c,'damage-taken','other'),/must use/);
const taken={id:'trigger',kind:'ability',name:'DM reaction',activation:'special',triggerEvent:'damage-taken',targetId:'self',cost:0};
A.commitUsage(c,taken);assert.equal(A.combatEvent(c).used,true);
assert.throws(()=>A.undoLastDamage(c),/damage-triggered event was consumed/);
assert.equal(c.hp.current,27);
A.commitDamage(c,A.planDamage(c,'self',{amount:3}));assert.notEqual(A.combatEvent(c).id,event.id);
A.setEncounter(c,false);assert.equal(A.combatEvent(c),null);
// Manual/free-form saves still exist for explicit DM decisions; no event is forged.
const manual=sample(),check=A.recordResolvedSave(manual,{rollId:rollId(3),targetId:'self',ability:'WIS',total:20,dc:14});
assert.equal(check.outcome,'success');assert.equal(check.event,null);assert.equal(A.combatEvent(manual),null);
assert.equal(A.planDamage(manual,'self',{amount:9,saveId:check.id,savePolicy:'negates'}).amount,0);
console.log('Verified saves, explicit damage association, stale previews, event windows, undo and vault persistence PASS');
