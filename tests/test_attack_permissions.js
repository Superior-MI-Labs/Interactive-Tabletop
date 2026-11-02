'use strict';
const assert=require('node:assert/strict');
const A=require('../web/dnd-action.js'),V=require('../web/vault-store.js');
const make=()=>({schema_version:1,system_edition:'dnd-2014',name:'Permission QA',hp:{current:20,max:20},inventory:[],conditions:[],effects:{},
 combat_profile:{attacks_per_action:2},resources:{Ki:{current:2,max:2,reset:'short rest'}},
 attacks:[{id:'staff',name:'Quarterstaff',attack_type:'weapon',bonus:5,damage:'1d6+3'},
          {id:'fist',name:'Unarmed Strike',attack_type:'unarmed',bonus:5,damage:'1d6+3'}],actions:[]});
const ability={id:'flurry',name:'Flurry',ruleset_profile:'dnd-2014',activation:'1 bonus action',resource:'Ki',cost:1,
 requires_attack:true,requires_attack_complete:true,grant_attacks:2,grant_attack_scope:'unarmed',effect_kind:'none'};
const cast=c=>A.commitUsage(c,A.plan(c,ability));
let c=make();A.setEncounter(c,true);
assert.throws(()=>cast(c),/Attack action first/);
assert.equal(c.resources.Ki.current,2);
assert.equal(A.availableAttackGrants(c,'unarmed'),0);
A.commitAttack(c); // Attack action begun, but Extra Attack sequence incomplete
assert.throws(()=>cast(c),/Complete the Attack action/);
A.commitAttack(c);
assert.equal(A.combat(c).economy.attacks.remaining,0);
cast(c);
assert.equal(c.resources.Ki.current,1);
assert.equal(A.combat(c).economy.spent.bonus,1);
assert.equal(A.combat(c).economy.spent.action,1);
assert.equal(A.availableAttackGrants(c,'unarmed'),2);
assert.equal(A.availableAttackGrants(c,'weapon'),0);
assert.throws(()=>A.verifyAttack(c,'bonus','weapon'),/qualified bonus attack/);
A.commitAttack(c,'bonus','unarmed');
assert.equal(A.availableAttackGrants(c,'unarmed'),1);
assert.equal(A.combat(c).economy.attacks.made,3);
assert.equal(A.combat(c).economy.attackActionMade,2,'Bonus strikes cannot satisfy an Attack-action prerequisite');
A.commitAttack(c,'bonus','unarmed');
assert.equal(A.availableAttackGrants(c,'unarmed'),0);
assert.throws(()=>A.commitAttack(c,'bonus','unarmed'),/qualified bonus attack/);
assert.throws(()=>cast(c),/exhausted|already granted|immediately before/);
assert.equal(c.resources.Ki.current,1);
const saved=V.normalize({schema_version:1,active_id:'qa',characters:[{id:'qa',character:c}]});
assert.equal(A.availableAttackGrants(saved.characters[0].character,'unarmed'),0);
A.advanceTurn(c);assert.equal(A.availableAttackGrants(c,'unarmed'),0);assert.equal(A.combat(c).economy.attackActionMade,0);
assert.equal(A.undoTurn(c),true);assert.equal(A.combat(c).economy.attackActionMade,2);
// 
// After another activity, the 2014 immediate follow-up window closes.
c=make();A.setEncounter(c,true);A.commitAttack(c);A.commitAttack(c);
A.commitUsage(c,A.plan(c,{id:'something',activation:'special',effect_kind:'none'}));
assert.throws(()=>cast(c),/immediately before/);
// Custom bonus permission uses the same engine, without impersonating an Attack action.
c=make();A.setEncounter(c,true);
const custom={id:'homebrew',name:'Free blade sequence',activation:'1 bonus action',grant_attacks:1,grant_attack_scope:'weapon',effect_kind:'none'};
A.commitUsage(c,A.plan(c,custom));
assert.equal(A.availableAttackGrants(c,'weapon'),1);
assert.equal(A.combat(c).economy.attackActionMade,0);
A.commitAttack(c,'bonus','weapon');
assert.equal(A.combat(c).economy.attackActionMade,0);
assert.throws(()=>cast(c),/exhausted|Attack action first/);
assert.equal(A.attackType({name:'Unarmed Strike'}),'unspecified');
assert.equal(A.attackType({attack_type:'unarmed'}),'unarmed');
for(const amount of [-1,5,1.5,'NaN'])assert.throws(()=>A.plan(make(),{...ability,grant_attacks:amount}),/Bonus attack grant/);
assert.throws(()=>A.plan(make(),{...ability,grant_attack_scope:'magic'}),/valid attack type/);
assert.throws(()=>A.plan(make(),{...ability,requires_attack_complete:true,requires_attack:false}),/prerequisite/);
const other=make();other.system_edition='dnd-2024';
assert.throws(()=>A.plan(other,ability),/requires dnd-2014/);
// Duplicate grant must reject without spending resources.
c=make();A.setEncounter(c,true);A.commitAttack(c);A.commitAttack(c);
const p=A.plan(c,ability);A.commitUsage(c,p);
const before=JSON.stringify(c);
assert.throws(()=>A.commitUsage(c,p),/exhausted|already granted|immediately before/);
assert.equal(JSON.stringify(c),before);
// Malformed legacy / manually-edited vault state cannot create bonus permissions.
c=make();A.setEncounter(c,true);c.effects.combat.economy.attackGrants=[
 {source:'bad',scope:'unarmed',remaining:-1},{source:'bad2',scope:'unarmed',remaining:'2'},
 {source:'good',scope:'weapon',remaining:1}];
assert.equal(A.availableAttackGrants(c,'unarmed'),0);
assert.equal(A.availableAttackGrants(c,'weapon'),1);
// Manual accounting is not a backdoor to fabricated permissions.
c=make();A.setEncounter(c,true);A.setCombatMode(c,'manual');cast(c);
assert.equal(c.resources.Ki.current,1);
assert.equal(A.combat(c).economy.spent.bonus,0);
assert.equal(A.availableAttackGrants(c,'unarmed'),0);
console.log('PASS scoped bonus attack permissions: Extra Attack, Flurry, homebrew, constraints, manual mode and vault');
