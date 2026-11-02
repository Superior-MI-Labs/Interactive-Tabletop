'use strict';
const assert=require('node:assert/strict');
const Engine=require('../web/dnd-action.js');
const Vault=require('../web/vault-store.js');
const sample=()=>({schema_version:1,name:'Test Wizard',inventory:[],hp:{current:11,max:20},
 resources:{'Level 1 Spell Slots':{current:2,max:4},'Level 2 Spell Slots':{current:1,max:2},Ki:{current:3,max:5}},effects:{},
 spells:[{id:'s-0',name:'Guidance',level:0,prepared:false,roll:'',duration:'Concentration, up to 1 minute'},
  {id:'s-1',name:'Restoration',level:1,prepared:true,roll:'1d8+3',effect_kind:'heal',duration_rounds:0},
  {id:'s-2',name:'Protection',level:1,prepared:true,duration:'Concentration, up to 1 minute',duration_rounds:10},
  {id:'s-3',name:'Not Prepared',level:1,prepared:false},
  {id:'s-4',name:'Unknown',level:null,prepared:true}],actions:[{id:'a-1',name:'Dragon Barrier',duration_rounds:3,concentration:false,resource:'Ki',cost:1}]});
const c=sample();
assert.deepEqual(Engine.spellSlots(c).map(x=>[x.level,x.current]),[[1,2],[2,1]]);
assert.equal(Engine.planSpell(c,c.spells[0]).cost,0,'cantrip never consumes slot');
assert.equal(Engine.planSpell(c,c.spells[0]).concentration,true,'structured duration identifies concentration');
assert.equal(Engine.planSpell(c,c.spells[1]).resource,'Level 1 Spell Slots');
assert.equal(Engine.planSpell(c,c.spells[1],2).resource,'Level 2 Spell Slots');
assert.equal(Engine.planSpell(c,c.spells[1],2).effect,'heal');
assert.throws(()=>Engine.planSpell(c,c.spells[3]),/Prepare/);
assert.throws(()=>Engine.planSpell(c,c.spells[4]),/Set the spell level/);
assert.throws(()=>Engine.planSpell(c,c.spells[1],0),/Invalid casting/);
assert.throws(()=>Engine.planSpell(c,c.spells[1],9),/No level 9/);
assert.throws(()=>Engine.planSpell(c,{...c.spells[1],roll:'5d3'}),/Unsupported dice/);
assert.throws(()=>Engine.planSpell(c,{...c.spells[1],duration_rounds:-3}),/Duration/);
assert.throws(()=>Engine.planSpell(c,{...c.spells[1],duration_rounds:1.5}),/Duration/);
assert.throws(()=>Engine.planSpell(c,{...c.spells[1],effect_kind:'heal',roll:''}),/Healing needs/);
let p=Engine.planSpell(c,c.spells[2]);
assert.equal(c.resources['Level 1 Spell Slots'].current,2,'planner is pure');
Engine.commit(c,p);Engine.startEffect(c,p);
assert.equal(c.resources['Level 1 Spell Slots'].current,1);
assert.deepEqual(Engine.activeEffects(c).map(x=>x.name),['Protection']);
assert.equal(Engine.activeEffects(c)[0].rounds_remaining,10);
assert.equal(Engine.advanceEffects(c).length,0);
assert.equal(Engine.activeEffects(c)[0].rounds_remaining,9);
Engine.commit(c,Engine.planSpell(c,c.spells[0]));Engine.startEffect(c,Engine.planSpell(c,c.spells[0]));
assert.deepEqual(Engine.activeEffects(c).map(x=>x.name),['Guidance'],'new concentration replaces previous');
assert.equal(Engine.activeEffects(c)[0].rounds_remaining,null,'untimed concentration remains until removed');
const barrier=Engine.plan(c,c.actions[0]);Engine.commit(c,barrier);Engine.startEffect(c,barrier);
assert.deepEqual(Engine.activeEffects(c).map(x=>x.name),['Guidance','Dragon Barrier']);
assert.deepEqual(Engine.advanceEffects(c),[]);
assert.deepEqual(Engine.advanceEffects(c),[]);
assert.deepEqual(Engine.advanceEffects(c),['Dragon Barrier']);
assert.deepEqual(Engine.activeEffects(c).map(x=>x.name),['Guidance']);
assert.equal(Engine.endEffect(c,'spell:s-0'),true);
assert.equal(Engine.endEffect(c,'spell:s-0'),false);
assert.equal(Engine.activeEffects(c).length,0);
Engine.commit(c,Engine.planSpell(c,c.spells[1],2));
assert.equal(c.resources['Level 2 Spell Slots'].current,0);
assert.throws(()=>Engine.planSpell(c,c.spells[1],2),/No level 2/);
assert.equal(Engine.applyHealing(c,10),9);
// Existing v0.12 saves and a fresh updated PDF retain player-authored spell execution fields.
const old=sample(),fresh=sample();old.spells[1].concentration=false;old.spells[1].duration_rounds=7;
old.spells[1].notes='DM ruling';old.effects.active=[{id:'spell:s-1',name:'Restoration',concentration:true,rounds_remaining:2}];
fresh.spells[1].roll='';fresh.spells[1].effect_kind='none';fresh.spells[1].duration_rounds=0;
const merged=Vault.reconcile(old,fresh);
assert.equal(merged.spells[1].roll,'1d8+3');assert.equal(merged.spells[1].effect_kind,'heal');
assert.equal(merged.spells[1].concentration,false);assert.equal(merged.spells[1].duration_rounds,7);
assert.equal(merged.spells[1].notes,'DM ruling');assert.equal(merged.effects.active[0].rounds_remaining,2);
console.log('D&D spell planning, slots, preparation, concentrations, timers, legacy migration, overrides PASS');
