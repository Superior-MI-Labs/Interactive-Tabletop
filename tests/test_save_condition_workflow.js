'use strict';
const assert=require('node:assert/strict');
const A=require('../web/dnd-action.js'),V=require('../web/vault-store.js');
function setup(){
 const c={schema_version:1,name:'Save workflow QA',system_edition:'dnd-2014',effects:{},conditions:[],
  hp:{current:30,max:30},inventory:[],actions:[],attacks:[],spells:[],resources:{Ki:{current:3,max:3}}};
 const target=A.addTarget(c,{name:'Bandit',ac:15,hp:20});A.setEncounter(c,true);
 const ability={id:'stun',name:'Stunning Strike',ruleset_profile:'dnd-2014',activation:'special',trigger_event:'melee-hit',
  resource:'Ki',cost:1,effect_kind:'none',workflow:{kind:'save-condition',save:{ability:'CON',dc:14},on_failure:{condition:'Stunned'}}};
 return {c,target,ability};
}
const save=(target,flow,total,rollId)=>({rollId,targetId:target.id,ability:'CON',dc:14,total,workflowId:flow.id});
let {c,target,ability}=setup();
assert.throws(()=>A.plan(c,{...ability,workflow:{...ability.workflow,save:{ability:'CON',dc:null}}}),/DC/);
assert.throws(()=>A.plan(c,{...ability,workflow:{...ability.workflow,save:{ability:'CON',dc:0}}}),/DC/);
assert.throws(()=>A.plan(c,{...ability,workflow:{...ability.workflow,save:{ability:'FOO',dc:14}}}),/ability and DC/);
assert.throws(()=>A.plan(c,{...ability,workflow:{...ability.workflow,on_failure:{condition:'Petrify Everything'}}}),/condition/);
assert.throws(()=>A.plan(c,{...ability,workflow:{...ability.workflow,kind:'execute-js'}}),/Unsupported staged/);
assert.throws(()=>A.plan(c,{...ability,trigger_event:'ranged-hit'}),/reaction|target-bound event/);
assert.throws(()=>A.beginWorkflow(c,A.plan(c,ability)),/saving throw target|Confirm/);
let old=A.plan(c,ability,{targetId:target.id}),event=A.recordCombatEvent(c,'melee-hit',target.id);
assert.throws(()=>A.beginWorkflow(c,old),/event/,'Plans prepared before a trigger must be rejected');
let plan=A.plan(c,ability,{targetId:target.id});
assert.equal(plan.targetId,target.id);assert.equal(plan.eventId,event.id);
let flow=A.beginWorkflow(c,plan);
assert.equal(flow.kind,'save-condition');assert.equal(flow.status,'await-save');
assert.equal(c.resources.Ki.current,2);assert.equal(A.combat(c).economy.spent.action,0);
assert.equal(A.combatEvent(c).used,true);
assert.throws(()=>A.beginWorkflow(c,plan),/existing staged/);
const untouched=JSON.stringify(c);
assert.throws(()=>A.recordResolvedSave(c,{...save(target,flow,8,'attack-roll-bad-target'),targetId:'self'}),/no longer belongs/);
assert.throws(()=>A.recordResolvedSave(c,{...save(target,flow,8,'attack-roll-bad-dc'),dc:12}),/no longer belongs/);
assert.throws(()=>A.recordResolvedSave(c,{...save(target,flow,8,'attack-roll-bad-id'),workflowId:'sequence-unknown'}),/no longer belongs/);
assert.equal(JSON.stringify(c),untouched,'Stale saves cannot mutate event, costs or HP');
const failure=A.recordResolvedSave(c,save(target,flow,8,'attack-roll-stun-fail'));
assert.equal(failure.outcome,'failure');assert.equal(failure.event,null,'One workflow, no competing event window');
assert.equal(A.pendingWorkflow(c).status,'await-effect');assert.equal(c.resources.Ki.current,2);
assert.equal(Boolean(target.conditions?.includes('Stunned')),false,'Failed save never silently applies conditions');
assert.throws(()=>A.recordResolvedSave(c,save(target,flow,8,'attack-roll-stun-fail')),/already recorded/);
const loaded=V.normalize({schema_version:1,active_id:'a',characters:[{id:'a',character:c}]}).characters[0].character;
assert.equal(A.pendingWorkflow(loaded).saveRollId,'attack-roll-stun-fail','Workflow survives vault round-trip');
assert.equal(A.finishWorkflowCondition(c,flow.id).condition,'Stunned');
assert.deepEqual(target.conditions,['Stunned']);assert.equal(c.resources.Ki.current,2);
assert.equal(A.pendingWorkflow(c),null);
assert.throws(()=>A.finishWorkflowCondition(c,flow.id),/No eligible/);
A.advanceTurn(c);event=A.recordCombatEvent(c,'melee-hit',target.id);
flow=A.beginWorkflow(c,A.plan(c,ability,{targetId:target.id}));
assert.equal(c.resources.Ki.current,1);
const success=A.recordResolvedSave(c,save(target,flow,19,'attack-roll-stun-success'));
assert.equal(success.outcome,'success');assert.equal(A.pendingWorkflow(c),null,'A save success closes the same sequence');
assert.throws(()=>A.finishWorkflowCondition(c,flow.id),/No eligible/);
// A target removed in the middle of a save invalidates the opportunity.
A.advanceTurn(c);event=A.recordCombatEvent(c,'melee-hit',target.id);
flow=A.beginWorkflow(c,A.plan(c,ability,{targetId:target.id}));
assert.equal(A.removeTarget(c,target.id),true);
assert.equal(A.pendingWorkflow(c),null);
assert.throws(()=>A.recordResolvedSave(c,save(target,flow,1,'attack-roll-stun-removed')),/Target|target/i);
// A staged save cannot outlive its turn. Undo restores ordinary turn state,
// but does not revive an interrupted workflow or refund a committed Ki cost.
({c,target,ability}=setup());A.recordCombatEvent(c,'melee-hit',target.id);
flow=A.beginWorkflow(c,A.plan(c,ability,{targetId:target.id}));
A.advanceTurn(c);assert.equal(A.pendingWorkflow(c),null);
assert.equal(A.undoTurn(c),true);assert.equal(A.pendingWorkflow(c),null);
assert.equal(c.resources.Ki.current,2);
assert.throws(()=>A.recordResolvedSave(c,save(target,flow,5,'attack-roll-stun-retired')),/no longer belongs/);
assert.equal(c.resources.Ki.current,2);
// Explicit manual economy still charges resource, never a phantom action.
({c,target,ability}=setup());A.setCombatMode(c,'manual');
flow=A.beginWorkflow(c,A.plan(c,ability,{targetId:target.id}));
assert.equal(A.combat(c).economy.spent.action,0);assert.equal(c.resources.Ki.current,2);
console.log('Save-condition workflow: validated events, atomic Ki, linked physical save, target, persistence, undo, manual mode PASS');
