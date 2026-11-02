'use strict';
const assert=require('node:assert/strict');
const A=require('../web/dnd-action.js'),V=require('../web/vault-store.js');
const make=()=>({schema_version:1,name:'Pool QA',hp:{current:20,max:20},inventory:[],effects:{},conditions:[],
 combat_profile:{attacks_per_action:2,action_pools:{action:1,bonus:1,reaction:1}},
 attacks:[{id:'sword',name:'Sword',bonus:5,damage:'1d8+3'}],actions:[],resources:{Ki:{max:5,current:5}}});
const use=(c,a)=>A.commitUsage(c,A.plan(c,{id:'manual',effect_kind:'none',...a}));
let c=make();A.setEncounter(c,true);
assert.equal(A.verifyAttack(c),true);
assert.equal(A.commitAttack(c),true);
assert.equal(A.combat(c).economy.attacks.remaining,1);
assert.equal(A.combat(c).economy.spent.action,1);
assert.equal(A.commitAttack(c),true);
assert.equal(A.combat(c).economy.attacks.remaining,0);
assert.throws(()=>A.commitAttack(c),/No Attack action/);
assert.throws(()=>use(c,{activation:'1 action'}),/already used|exhausted/);
assert.equal(A.combat(c).economy.attacks.made,2);
// A bonus-action technique can require an attack, spend ki, and grant a custom pool.
A.addResourcePool(c,'Defensive Points',4,'turn');c.resources['Defensive Points'].current=0;
use(c,{activation:'bonus action',resource:'Ki',cost:2,requires_attack:true,grant_resource:'Defensive Points',grant_amount:4});
assert.equal(c.resources.Ki.current,3);
assert.equal(c.resources['Defensive Points'].current,4);
assert.equal(A.combat(c).economy.spent.bonus,1);
let snapshot=JSON.stringify(c);assert.throws(()=>use(c,{activation:'bonus action',resource:'Ki',cost:1}),/already used|exhausted/);
assert.equal(JSON.stringify(c),snapshot,'No state mutation on blocked bonus technique');
A.advanceTurn(c);assert.equal(c.resources['Defensive Points'].current,0);
assert.deepEqual(A.combat(c).economy.attacks,{made:0,remaining:0});
assert.equal(A.undoTurn(c),true);assert.equal(c.resources['Defensive Points'].current,4);
assert.equal(A.combat(c).economy.attacks.made,2);
// Haste grants one attack only, never a new Extra Attack sequence.
c=make();A.setEncounter(c,true);A.commitAttack(c);A.commitAttack(c);
A.grantEconomyAction(c,'attack','Haste');A.commitAttack(c);
assert.equal(A.combat(c).economy.attacks.made,3);
assert.equal(A.combat(c).economy.attacks.remaining,0);
assert.throws(()=>A.commitAttack(c),/No Attack action/);
assert.throws(()=>A.grantEconomyAction(c,'attack','Haste'),/already granted|already granted its action|Feature already/);
// A generic extra action is separately scoped; spending it starts a full attack sequence.
A.grantEconomyAction(c,'any','Action Surge');A.commitAttack(c);
assert.equal(A.combat(c).economy.attacks.remaining,1);
A.commitAttack(c);assert.equal(A.combat(c).economy.attacks.made,5);
// D&D default and PF2-style three-point pools share the spending machinery.
c=make();A.configureEconomy(c,'action',3);A.setEncounter(c,true);
for(let i=0;i<3;i++)use(c,{activation:'1 action'});
assert.equal(A.combat(c).economy.spent.action,3);
assert.throws(()=>use(c,{activation:'1 action'}),/exhausted/);
A.advanceTurn(c);assert.equal(A.combat(c).economy.spent.action,0);
// Custom activity can consume 2 action units atomically.
use(c,{activation:'1 action',economy_units:2});assert.equal(A.combat(c).economy.spent.action,2);
const before=JSON.stringify(c);assert.throws(()=>use(c,{activation:'1 action',economy_units:2}),/exhausted/);
assert.equal(JSON.stringify(c),before);
// Resource spending + grants are atomic even with invalid pools.
c=make();A.setEncounter(c,true);
const poor={activation:'1 action',resource:'Ki',cost:2,grant_resource:'Missing',grant_amount:4};
assert.throws(()=>use(c,poor),/Invalid resource grant pool/);
assert.equal(c.resources.Ki.current,5);assert.equal(A.combat(c).economy.spent.action,0);
A.addResourcePool(c,'Guard',4);c.resources.Guard.current=3;
use(c,{activation:'1 action',resource:'Ki',cost:2,grant_resource:'Guard',grant_amount:4});
assert.equal(c.resources.Ki.current,3);assert.equal(c.resources.Guard.current,4,'Cap at pool maximum');
// Manual accounting opts out only from automatic action spend; resource charges remain real.
c=make();A.setEncounter(c,true);A.setAutoEconomy(c,false);
use(c,{activation:'1 action',resource:'Ki',cost:1});use(c,{activation:'1 action',resource:'Ki',cost:1});
assert.equal(c.resources.Ki.current,3);assert.equal(A.combat(c).economy.spent.action,0);
A.markAction(c,'action');assert.equal(A.combat(c).economy.spent.action,1);
A.setAutoEconomy(c,true);assert.throws(()=>use(c,{activation:'1 action'}),/exhausted/);
// Profile and ledger survive JSON backup and PDF reimport.
const vault=V.normalize({schema_version:1,active_id:'qa',characters:[{id:'qa',character:c}]});
const imported=V.reconcile(vault.characters[0].character,make());
assert.deepEqual(imported.combat_profile,c.combat_profile);
assert.equal(A.combat(imported).economy.spent.action,1);
assert.equal(A.combat(imported).economy.auto,true);
console.log('Generic action pools: auto/manual, extra attack, Haste, Action Surge, prerequisites, resource grant, rollback, turn undo and vault PASS');
