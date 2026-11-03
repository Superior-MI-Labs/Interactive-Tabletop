'use strict';
const assert=require('node:assert/strict');
const A=require('../web/dnd-action.js'),V=require('../web/vault-store.js');
function setup(){
 const c={schema_version:1,name:'Incoming QA',system_edition:'dnd-2014',hp:{current:24,max:24},effects:{},
  inventory:[],conditions:[],attacks:[],actions:[],spells:[],resources:{'Warding Flare Uses':{current:2,max:2},Ki:{current:2,max:2}}};
 const archer=A.addTarget(c,{name:'Archer',ac:14,hp:11});
 const caster=A.addTarget(c,{name:'Caster',ac:12,hp:9});
 A.setEncounter(c,true);return {c,archer,caster};
}
const flare={id:'flare',name:'Warding Flare',activation:'1 reaction',trigger_event:'incoming-attack',resource:'Warding Flare Uses',cost:1};
const deflect={id:'deflect',name:'Deflect Missiles',activation:'1 reaction',trigger_event:'ranged-hit',roll:'1d10+5',cost:0,
 workflow:{kind:'damage-reduction',followup:{label:'Throw',resource:'Ki',cost:1,roll:'1d20+3',requires_catchable:true,requires_free_hand:true}}};
let {c,archer,caster}=setup();
assert.throws(()=>A.recordIncomingAttack(c,'self','ranged-weapon'),/attacking creature/);
assert.throws(()=>A.recordIncomingAttack(c,'missing','ranged-weapon'),/attacking creature/);
assert.throws(()=>A.recordIncomingAttack(c,archer.id,'ranged-spell'),/attack type/);
assert.equal(A.combatEvent(c),null);
let pre=A.recordIncomingAttack(c,archer.id,'ranged-weapon');
assert.equal(pre.kind,'incoming-attack');assert.equal(pre.targetId,'self');assert.equal(pre.attackerId,archer.id);
assert.throws(()=>A.beginWorkflow(c,A.plan(c,deflect),5),/ranged-hit/);
const before=JSON.stringify(c);
assert.throws(()=>A.resolveIncomingAttack(c,'event-old',true),/expired or was replaced/);
assert.throws(()=>A.resolveIncomingAttack(c,pre.id,'yes'),/Confirm whether/);
assert.equal(JSON.stringify(c),before,'Invalid results cannot mutate the live window');
const pending=A.plan(c,flare);
A.commitUsage(c,pending);
assert.equal(c.resources['Warding Flare Uses'].current,1);
assert.equal(A.combat(c).economy.spent.reaction,1);
assert.equal(A.combatEvent(c).used,true);
// A spent pre-roll reaction still permits adjudicating that same attack. It
// cannot restore the reaction or grant a free follow-up.
let follow=A.resolveIncomingAttack(c,pre.id,true);
assert.equal(follow.kind,'ranged-hit');assert.equal(follow.attackerId,archer.id);
assert.equal(follow.parentEventId,pre.id);
assert.equal(A.combat(c).economy.spent.reaction,1);
assert.throws(()=>A.beginWorkflow(c,A.plan(c,deflect),5),/reaction|exhausted/i);
assert.throws(()=>A.resolveIncomingAttack(c,pre.id,true),/expired or was replaced/);
A.advanceTurn(c);
pre=A.recordIncomingAttack(c,archer.id,'ranged-weapon');
follow=A.resolveIncomingAttack(c,pre.id,true);
assert.equal(A.plan(c,deflect).eventId,follow.id);
const workflow=A.beginWorkflow(c,A.plan(c,deflect),4);
assert.equal(workflow.status,'await-roll');
assert.equal(A.combat(c).economy.spent.reaction,1);
assert.equal(c.resources.Ki.current,2);
A.resolveWorkflow(c,workflow.id,5);
assert.equal(c.resources.Ki.current,2);
A.declineWorkflow(c,workflow.id);
// Only verified ranged-weapon hit produces the post-hit trigger.
for(const attackKind of ['melee-weapon','spell','other']){
 A.advanceTurn(c);
 pre=A.recordIncomingAttack(c,archer.id,attackKind);
 assert.equal(A.resolveIncomingAttack(c,pre.id,true),null,attackKind);
 assert.equal(A.combatEvent(c),null);
 assert.throws(()=>A.beginWorkflow(c,A.plan(c,deflect),4),/ranged-hit/);
}
A.advanceTurn(c);
pre=A.recordIncomingAttack(c,archer.id,'ranged-weapon');
assert.equal(A.resolveIncomingAttack(c,pre.id,false),null);
A.advanceTurn(c);
pre=A.recordIncomingAttack(c,archer.id,'ranged-weapon');
assert.equal(A.combatEvent(c).id,pre.id);
const saved=V.normalize({schema_version:1,active_id:'a',characters:[{id:'a',character:c}]}).characters[0].character;
assert.equal(A.resolveIncomingAttack(saved,pre.id,true).attackerId,archer.id,'A persisted window preserves the source');
assert.equal(A.removeTarget(c,archer.id),true);
assert.equal(A.combatEvent(c),null,'Removing the attacking creature expires the window');
A.advanceTurn(c);pre=A.recordIncomingAttack(c,caster.id,'ranged-weapon');
A.recordIncomingAttack(c,caster.id,'other');
assert.throws(()=>A.resolveIncomingAttack(c,pre.id,true),/expired or was replaced/);
A.advanceTurn(c);pre=A.recordIncomingAttack(c,caster.id,'ranged-weapon');
A.advanceTurn(c);assert.throws(()=>A.resolveIncomingAttack(c,pre.id,true),/expired or was replaced/);
console.log('Incoming attack sequence: typed provenance, pre-roll reaction, ranged hit, stale/removed source, save/undo, and resource isolation PASS');
