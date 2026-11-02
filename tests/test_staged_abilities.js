'use strict';
const assert=require('node:assert/strict');
const A=require('../web/dnd-action.js'),V=require('../web/vault-store.js');
const make=()=>({schema_version:1,name:'Flow QA',effects:{},conditions:[],hp:{current:20,max:20},
 inventory:[],resources:{Ki:{current:2,max:2}},actions:[]});
const source={id:'deflect',name:'Deflect Missiles',activation:'1 reaction',roll:'1d10+7',cost:0,effect_kind:'none',
 workflow:{kind:'damage-reduction',followup:{label:'Return missile',resource:'Ki',cost:1,roll:'1d20+6',requires_catchable:true,requires_free_hand:true}}};
const plan=c=>A.plan(c,source);
let c=make();A.setEncounter(c,true);
let initial=plan(c);assert.equal(initial.cost,0);assert.equal(initial.workflow.followup.cost,1);
let flow=A.beginWorkflow(c,initial,9);assert.equal(c.resources.Ki.current,2);
assert.equal(A.combat(c).economy.spent.reaction,1);
assert.equal(flow.status,'await-roll');
assert.throws(()=>A.beginWorkflow(c,initial,9),/existing staged/);
assert.throws(()=>A.resolveWorkflow(c,flow.id,1.5),/Invalid reduction/);
assert.deepEqual(A.resolveWorkflow(c,flow.id,7),{remaining:2,eligible:false});
assert.equal(A.pendingWorkflow(c),null);assert.equal(c.resources.Ki.current,2);
assert.throws(()=>A.finishWorkflow(c,flow.id,{catchable:true,freeHand:true}),/unavailable/);
A.advanceTurn(c);
flow=A.beginWorkflow(c,plan(c),5);
assert.deepEqual(A.resolveWorkflow(c,flow.id,10),{remaining:0,eligible:true});
assert.equal(A.pendingWorkflow(c).status,'optional-followup');
assert.throws(()=>A.finishWorkflow(c,flow.id,{catchable:true,freeHand:false}),/Confirm/);
assert.equal(c.resources.Ki.current,2);
const originalSpend=A.combat(c).economy.spent.reaction;
assert.deepEqual(A.finishWorkflow(c,flow.id,{catchable:true,freeHand:true}),{label:'Return missile',roll:'1d20+6',sourceId:'deflect'});
assert.equal(c.resources.Ki.current,1);assert.equal(A.combat(c).economy.spent.reaction,originalSpend);
assert.equal(A.pendingWorkflow(c),null);assert.throws(()=>A.finishWorkflow(c,flow.id,{catchable:true,freeHand:true}),/unavailable/);
A.advanceTurn(c);
flow=A.beginWorkflow(c,plan(c),3);A.resolveWorkflow(c,flow.id,8);
A.declineWorkflow(c,flow.id);assert.equal(c.resources.Ki.current,1);
assert.throws(()=>A.declineWorkflow(c,flow.id),/No matching/);
A.advanceTurn(c);flow=A.beginWorkflow(c,plan(c),4);A.resolveWorkflow(c,flow.id,5);
c.resources.Ki.current=0;assert.throws(()=>A.finishWorkflow(c,flow.id,{catchable:true,freeHand:true}),/Not enough Ki/);
assert.equal(A.pendingWorkflow(c).id,flow.id);A.declineWorkflow(c,flow.id);
// Manual accounting still pays Ki, but never charges an automated reaction.
c=make();A.setEncounter(c,true);A.setCombatMode(c,'manual');flow=A.beginWorkflow(c,plan(c),1);
assert.equal(A.combat(c).economy.spent.reaction,0);A.resolveWorkflow(c,flow.id,2);
A.finishWorkflow(c,flow.id,{catchable:true,freeHand:true});assert.equal(c.resources.Ki.current,1);
// No external content controls follow-ups: an invalid or executable schema fails closed.
c=make();assert.throws(()=>A.plan(c,{...source,workflow:{kind:'execute-js'}}),/Unsupported staged/);
assert.throws(()=>A.plan(c,{...source,cost:1}),/resource name|cost-free reaction/);
assert.throws(()=>A.plan(c,{...source,workflow:{kind:'damage-reduction',followup:{...source.workflow.followup,requires_free_hand:false}}}),/explicit/);
assert.throws(()=>A.beginWorkflow(c,plan(c),0),/incoming weapon damage/);
// Persistence: pending flow is existing character state, not a second store.
A.setEncounter(c,true);flow=A.beginWorkflow(c,plan(c),10);
const saved=V.normalize({schema_version:1,active_id:'a',characters:[{id:'a',character:c}]});
assert.equal(A.pendingWorkflow(saved.characters[0].character).id,flow.id);
A.advanceTurn(c);assert.equal(A.pendingWorkflow(c),null,'Turn advances invalidate a stale optional reaction');
console.log('Staged reaction: damage reduction, zero-only follow-up, optional Ki, one reaction, stale IDs, manual mode and vault PASS');
