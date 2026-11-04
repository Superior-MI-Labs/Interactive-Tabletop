'use strict';
const assert=require('node:assert/strict');
const A=require('../web/dnd-action.js'), V=require('../web/vault-store.js');
const hero=()=>({schema_version:1,system_edition:'dnd-2014',name:'Provenance QA',effects:{},conditions:[],
 hp:{max:22,current:22,temp:0},attacks:[],spells:[],actions:[],inventory:[],resources:{Ki:{current:3,max:3}}});
function setup(){const c=hero(),target=A.addTarget(c,{name:'Guard',ac:15,hp:20});A.setEncounter(c,true);return {c,target};}
let {c,target}=setup();
// Multiple independent sources must never end the same visible condition early.
const first=A.grantCondition(c,target.id,'Stunned',{sourceId:'stun-1',expiration:'source-next-turn-end'});
assert.deepEqual(target.conditions,['Stunned']);
assert.equal(first.expiry.anchorId,'self');assert.equal(first.expiry.endTurn,2);
A.advanceTurn(c);assert.deepEqual(target.conditions,['Stunned'],'turn 2 starts: first grant remains');
const second=A.grantCondition(c,target.id,'Stunned',{sourceId:'stun-2',expiration:'source-next-turn-end'});
assert.equal(A.conditionGrants(c,target.id).length,2);
A.advanceTurn(c);assert.deepEqual(target.conditions,['Stunned'],'turn 2 end: second grant remains');
assert.deepEqual(A.conditionGrants(c,target.id).map(g=>g.sourceId),['stun-2']);
assert.equal(A.conditionGrants(c,target.id)[0].owned,true,'ownership transfers to the surviving source');
assert.equal(A.undoTurn(c),true,'own turn undo restores the independent source');
assert.deepEqual(A.conditionGrants(c,target.id).map(g=>g.sourceId),['stun-1','stun-2']);
assert.deepEqual(target.conditions,['Stunned']);
A.advanceTurn(c);A.advanceTurn(c);
assert.deepEqual(target.conditions,[],'condition ends only after the final owning source expires');
assert.equal(A.conditionGrants(c,target.id).length,0);
// Untracked legacy and manual conditions are never silently cleared by timed sources.
({c,target}=setup());
A.setTargetCondition(c,target.id,'Poisoned',true);
const overlay=A.grantCondition(c,target.id,'Poisoned',{sourceId:'poison-supplement',expiration:'source-next-turn-end'});
assert.equal(overlay.owned,false);
A.advanceTurn(c);A.advanceTurn(c);
assert.deepEqual(target.conditions,['Poisoned'],'manual condition survives the expiring supplemental source');
A.setTargetCondition(c,target.id,'Poisoned',false);assert.deepEqual(target.conditions,[]);
// The affected creature's clock is independent of both the player turn and other creature turns.
({c,target}=setup());
const other=A.addTarget(c,{name:'Archer',ac:13,hp:12});
const targetGrant=A.grantCondition(c,target.id,'Restrained',{sourceId:'net',expiration:'target-next-turn-end'});
assert.deepEqual(targetGrant.expiry,{anchorId:target.id,endTurn:2});
A.advanceTurn(c);A.advanceTurn(c);
assert(target.conditions.includes('Restrained'),'player turn ticks do not expire target-anchored duration');
A.advanceTargetTurn(c,other.id);assert(target.conditions.includes('Restrained'),'other creature turn irrelevant');
A.advanceTargetTurn(c,target.id);assert(target.conditions.includes('Restrained'),'still active on start of target next turn');
const tick=A.advanceTargetTurn(c,target.id);
assert.equal(tick.turn,3);assert.equal(tick.expired.length,1);assert.deepEqual(target.conditions,[]);
assert.throws(()=>A.advanceTargetTurn(c,'self'),/Next turn/);
assert.throws(()=>A.advanceTargetTurn(c,'missing'),/removed/);
// One DM removal cancels all sources of a condition, not merely the visible label.
({c,target}=setup());
A.grantCondition(c,target.id,'Stunned',{sourceId:'a',expiration:'manual'});
A.grantCondition(c,target.id,'Stunned',{sourceId:'b',expiration:'manual'});
A.setTargetCondition(c,target.id,'Stunned',false);
assert.equal(A.conditionGrants(c,target.id).length,0);assert.deepEqual(target.conditions,[]);
// An active effect and a timed source must transfer ownership in both directions.
({c,target}=setup());
let spell=A.startEffect(c,{kind:'spell',sourceId:'cloak',name:'Cloak',condition:'Invisible',durationRounds:10});
let extra=A.grantCondition(c,'self','Invisible',{sourceId:'separate-feature',expiration:'manual'});
assert.equal(extra.owned,false);A.endEffect(c,spell.id);
assert.equal(A.conditionGrants(c,'self')[0].owned,true);
assert(c.conditions.includes('Invisible'));A.endConditionGrant(c,extra.id);assert.deepEqual(c.conditions,[]);
extra=A.grantCondition(c,'self','Invisible',{sourceId:'separate-feature',expiration:'manual'});
spell=A.startEffect(c,{kind:'spell',sourceId:'cloak',name:'Cloak',condition:'Invisible',durationRounds:10});
assert.equal(spell.condition_owned,false);
A.endConditionGrant(c,extra.id);assert.equal(A.activeEffects(c)[0].condition_owned,true);
assert(c.conditions.includes('Invisible'));A.endEffect(c,spell.id);assert.deepEqual(c.conditions,[]);
// Reconciliation, resets and legacy default expiry must not resurrect a clock.
({c,target}=setup());
const persisted=A.grantCondition(c,target.id,'Stunned',{sourceId:'stun',expiration:'source-next-turn-end'});
const restored=V.normalize({schema_version:1,active_id:'qa',characters:[{id:'qa',character:c}]}).characters[0].character;
assert.equal(A.conditionGrants(restored,target.id)[0].id,persisted.id);
A.setEncounter(restored,false);assert.equal(A.conditionGrants(restored,target.id)[0].expiry,null);
assert(A.targetById(restored,target.id).conditions.includes('Stunned'));
assert.throws(()=>A.grantCondition(restored,target.id,'Blinded',{expiration:'source-next-turn-end'}),/Start encounter/);
assert.throws(()=>A.grantCondition(restored,target.id,'Blinded',{expiration:'invented'}),/expiration/);
A.setEncounter(restored,true);A.advanceTurn(restored);A.advanceTurn(restored);
assert(A.targetById(restored,target.id).conditions.includes('Stunned'));
// Invalid saved records cannot award source ownership or delete a condition.
A.combat(restored).condition_grants.push(null,{id:'condition-999',targetId:target.id,condition:'INVALID',owned:true,sourceId:'bad',expiry:{anchorId:'self',endTurn:1}});
assert.equal(A.conditionGrants(restored,target.id).length,1);
// Stale condition source for a removed target cannot later expire other creatures' flags.
A.removeTarget(restored,target.id);assert.equal(A.conditionGrants(restored).length,0);
console.log('Condition source provenance, independent expiry, manual flags, effect ownership, turn undo, vault, corruption PASS');
