'use strict';
const assert=require('node:assert/strict');
const A=require('../web/dnd-action.js'),V=require('../web/vault-store.js');
function fixture(){
 const c={schema_version:1,name:'Interruption QA',system_edition:'dnd-2014',
  hp:{max:30,current:30},conditions:[],inventory:[],actions:[],attacks:[],spells:[],effects:{},
  resources:{Ki:{current:3,max:3}}};
 const t=A.addTarget(c,{name:'Test target',ac:14,hp:20});
 A.setEncounter(c,true);
 const action={id:'save-workflow',name:'Verified save',trigger_event:'melee-hit',activation:'special',
  resource:'Ki',cost:1,effect_kind:'none',workflow:{kind:'save-condition',save:{ability:'CON',dc:14},
   on_failure:{condition:'Stunned'}}};
 const start=()=>{A.recordCombatEvent(c,'melee-hit',t.id);return A.beginWorkflow(c,A.plan(c,action,{targetId:t.id}));};
 const save=(flow,id)=>({workflowId:flow.id,rollId:'attack-roll-'+id,targetId:t.id,ability:'CON',dc:14,total:5});
 return {c,t,start,save};
}
let {c,t,start,save}=fixture();
let flow=start();assert.equal(flow.turn,1);assert.equal(flow.mode,'auto');assert.equal(c.resources.Ki.current,2);
A.setCombatMode(c,'auto');assert.equal(A.pendingWorkflow(c)?.id,flow.id,'Selecting the same mode does not interrupt');
A.setCombatMode(c,'guided');assert.equal(A.pendingWorkflow(c),null,'Changing assistance interrupts the original workflow');
assert.throws(()=>A.recordResolvedSave(c,save(flow,'mode-change')),/no longer belongs/);
assert.equal(c.resources.Ki.current,2,'No speculative refund on interruption');
A.setCombatMode(c,'auto');flow=start();assert.equal(c.resources.Ki.current,1);
let snapshot=V.normalize({schema_version:1,active_id:'a',characters:[{id:'a',character:c}]}).characters[0].character;
assert.equal(A.pendingWorkflow(snapshot)?.id,flow.id,'Switching to a different vault character can pause this character workflow');
A.advanceTurn(c);assert.equal(A.pendingWorkflow(c),null);
assert.throws(()=>A.recordResolvedSave(c,save(flow,'turn-change')),/no longer belongs/);
assert.equal(A.undoTurn(c),true);assert.equal(A.pendingWorkflow(c),null,'Undo does not resurrect an interrupted physical workflow');
assert.throws(()=>A.recordResolvedSave(c,save(flow,'undo-turn')),/no longer belongs/);
assert.equal(c.resources.Ki.current,1,'Turn undo does not refund committed Ki');
A.setEncounter(c,false);assert.equal(A.pendingWorkflow(c),null);
({c,t,start,save}=fixture());flow=start();A.setEncounter(c,false);
assert.equal(A.pendingWorkflow(c),null);assert.throws(()=>A.recordResolvedSave(c,save(flow,'encounter-end')),/no longer belongs/);
({c,t,start,save}=fixture());flow=start();A.removeTarget(c,t.id);
assert.equal(A.pendingWorkflow(c),null);assert.throws(()=>A.recordResolvedSave(c,save(flow,'target-removed')),/target/i);
// Legacy v0.38 saves remain usable: stage on first access without restarting or charging Ki.
({c,t,start,save}=fixture());flow=start();delete c.effects.combat.pending_workflow.turn;
delete c.effects.combat.pending_workflow.mode;
assert.equal(A.pendingWorkflow(c).turn,1);assert.equal(A.pendingWorkflow(c).mode,'auto');
assert.equal(c.resources.Ki.current,2);
const result=A.recordResolvedSave(c,save(flow,'legacy'));assert.equal(result.outcome,'failure');
assert.equal(A.finishWorkflowCondition(c,flow.id).condition,'Stunned');
assert.equal(c.resources.Ki.current,2);
// The original reaction's child never spends optional points after a mode change.
({c}=fixture());const reaction={id:'deflect',name:'Deflect',activation:'reaction',roll:'1d10+5',cost:0,
 effect_kind:'none',workflow:{kind:'damage-reduction',followup:{label:'Return',resource:'Ki',cost:1,
 roll:'1d20+5',requires_catchable:true,requires_free_hand:true}}};
A.recordCombatEvent(c,'ranged-hit');flow=A.beginWorkflow(c,A.plan(c,reaction),2);
A.resolveWorkflow(c,flow.id,10);
A.setCombatMode(c,'manual');assert.equal(A.pendingWorkflow(c),null);
assert.throws(()=>A.finishWorkflow(c,flow.id,{catchable:true,freeHand:true}),/unavailable/);
assert.equal(c.resources.Ki.current,3);assert.equal(A.combat(c).economy.spent.reaction,1);
console.log('Workflow lifecycle: mode, turn undo, encounter, removal, pause/reload, legacy migration, no Ki refunds PASS');
