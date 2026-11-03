'use strict';
const assert=require('node:assert/strict');
const A=require('../web/dnd-action.js'),V=require('../web/vault-store.js');
const fixture=()=>({schema_version:1,name:'Predicate QA',system_edition:'dnd-2014',
 hp:{max:30,current:30,temp:4},conditions:[],inventory:[],effects:{},resources:{Ki:{current:5,max:5}},
 attacks:[],actions:[],spells:[]});
const saveAbility={id:'save-react',name:'Resolve verified CON save',activation:'1 reaction',trigger_event:'save-failure',event_save_ability:'CON',resource:'Ki',cost:1};
const damageAbility={id:'damage-react',name:'React to serious fire injury',activation:'1 reaction',trigger_event:'damage-taken',event_damage_type:'fire',event_min_damage:8,event_min_hp_loss:4,resource:'Ki',cost:1};
const saveRoll=(n,ability,total,dc,targetId)=>({rollId:`attack-roll-predicate-${n}`,ability,total,dc,targetId});
let c=fixture(),enemy=A.addTarget(c,{name:'Enemy',ac:13,hp:20});A.setEncounter(c,true);
// An old, prepared plan cannot acquire the identity of an unrelated future event.
const noEvent=A.plan(c,saveAbility,{targetId:enemy.id});
assert.equal(noEvent.eventId,null);
let evidence=A.recordResolvedSave(c,saveRoll(1,'CON',9,15,enemy.id));
assert.equal(evidence.outcome,'failure');
assert.throws(()=>A.commitUsage(c,noEvent),/save-failure event/);
assert.equal(c.resources.Ki.current,5);
// Wrong save ability, even though it is a genuine failed saving throw.
A.recordResolvedSave(c,saveRoll(2,'DEX',4,15,enemy.id));
assert.throws(()=>A.verifyEconomy(c,A.plan(c,saveAbility,{targetId:enemy.id})),/verified saving throw/);
assert.equal(c.resources.Ki.current,5);
// A DM-confirmed generic event is not fabricated numerical saving-throw evidence.
A.recordCombatEvent(c,'save-failure');
assert.throws(()=>A.commitUsage(c,A.plan(c,saveAbility)),/verified saving throw/);
A.recordResolvedSave(c,saveRoll(3,'CON',6,15,enemy.id));
const ready=A.plan(c,saveAbility,{targetId:enemy.id});
assert.equal(ready.eventFilter.saveAbility,'CON');assert.equal(ready.targetId,enemy.id);
assert.throws(()=>A.verifyEconomy(c,A.plan(c,saveAbility,{targetId:'self'})),/associated with its triggering event/);
const saved=V.normalize({schema_version:1,active_id:'qa',characters:[{id:'qa',character:c}]}).characters[0].character;
assert.equal(A.plan(saved,saveAbility,{targetId:enemy.id}).eventId,ready.eventId);
A.recordResolvedSave(c,saveRoll(4,'CON',2,15,enemy.id));
assert.throws(()=>A.commitUsage(c,ready),/event changed/,'A later matching save cannot satisfy an old plan');
assert.equal(c.resources.Ki.current,5);
A.commitUsage(c,A.plan(c,saveAbility,{targetId:enemy.id}));
assert.equal(c.resources.Ki.current,4);assert.equal(A.combatEvent(c).used,true);
assert.throws(()=>A.commitUsage(c,A.plan(c,saveAbility,{targetId:enemy.id})),/Confirm the save-failure event/);
A.advanceTurn(c);
// The same validator supports positive results, but a failure cannot qualify as success.
A.recordResolvedSave(c,saveRoll(5,'CON',19,15,enemy.id));
const success={...saveAbility,id:'successful-save',trigger_event:'save-success'};
assert.equal(A.verifyEconomy(c,A.plan(c,success,{targetId:enemy.id})),'reaction');
assert.throws(()=>A.verifyEconomy(c,A.plan(c,saveAbility,{targetId:enemy.id})),/save-failure/);
// Zero-damage, resistance and temporary HP are accounted for by the existing damage calculator.
A.commitDamage(c,A.planDamage(c,'self',{amount:8,type:'fire'}));
assert.equal(A.combatEvent(c).damageAmount,8);assert.equal(A.combatEvent(c).hpLoss,4);
let readyDamage=A.plan(c,damageAbility);
assert.equal(readyDamage.targetId,'self');assert.equal(readyDamage.eventFilter.minHpLoss,4);
assert.equal(A.verifyEconomy(c,readyDamage),'reaction');
// Same applied damage event, but a different configured threshold must fail.
assert.throws(()=>A.verifyEconomy(c,A.plan(c,{...damageAbility,event_min_hp_loss:5})),/damage requirements/);
assert.throws(()=>A.verifyEconomy(c,A.plan(c,{...damageAbility,event_damage_type:'cold'})),/damage requirements/);
// Manual damage-type claims lack the provenance necessary for numeric filtering.
A.recordCombatEvent(c,'damage-taken');
assert.throws(()=>A.verifyEconomy(c,A.plan(c,damageAbility)),/damage requirements/);
// The filter cannot be used to spend resources for an event from a previous turn.
A.advanceTurn(c);assert.throws(()=>A.commitUsage(c,readyDamage),/event/);
A.commitDamage(c,A.planDamage(c,'self',{amount:12,type:'cold'}));
assert.throws(()=>A.verifyEconomy(c,A.plan(c,damageAbility)),/damage requirements/);
A.commitDamage(c,A.planDamage(c,'self',{amount:6,type:'fire'}));
assert.throws(()=>A.verifyEconomy(c,A.plan(c,damageAbility)),/damage requirements/);
A.commitDamage(c,A.planDamage(c,'self',{amount:9,type:'fire'}));
const hp=c.hp.current,ki=c.resources.Ki.current;
const current=A.plan(c,damageAbility);
assert.equal(A.verifyEconomy(c,current),'reaction');
A.commitUsage(c,current);assert.equal(c.resources.Ki.current,ki-1);
assert.equal(A.combatEvent(c).used,true);
assert.throws(()=>A.undoLastDamage(c),/damage-triggered event was consumed/);
assert.equal(c.hp.current,hp);
// Strict schema: bad filters must fail at planning, before resources or events mutate.
const invalid=[
 {...saveAbility,event_save_ability:'BAD'},
 {...damageAbility,event_min_hp_loss:-1},
 {...damageAbility,event_min_damage:1.2},
 {...damageAbility,event_min_damage:'NaN'},
 {...damageAbility,event_damage_type:'healing'},
 {...saveAbility,event_min_damage:1},
 {...damageAbility,event_save_ability:'CON'},
];
for(const action of invalid){
 const before=JSON.stringify(c);
 assert.throws(()=>A.plan(c,action),/filter|threshold|damage type|damage event/i);
 assert.equal(JSON.stringify(c),before);
}
// Disable automatic accounting: manual DM review is possible without forging proof.
A.setCombatMode(c,'manual');A.dismissCombatEvent(c);
const manually=A.plan(c,damageAbility);
assert.equal(A.verifyEconomy(c,manually),'reaction');
console.log('Verified event predicates: exact save, target, typed damage, HP thresholds, stale identity, rollback and manual-mode PASS');
