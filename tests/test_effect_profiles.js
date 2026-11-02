'use strict';
const assert=require('node:assert/strict');
const A=require('../web/dnd-action.js');
const R=require('../web/reference-catalog.js');
const Vault=require('../web/vault-store.js');
R.init(require('../web/dnd-2014-reference.json'));
const mock=()=>({schema_version:1,name:'Test Cleric',system_edition:'dnd-2014',class_level:'Cleric 5',
 hp:{current:8,max:30,temp:4},ac:17,inventory:[],conditions:[],
 abilities:{WIS:{score:18,modifier:4}},saves:{Constitution:5},effects:{},
 resources:{'Level 1 Spell Slots':{max:4,current:3},'Level 2 Spell Slots':{max:3,current:2}},
 spells:[
 {id:'cure',name:'Cure Wounds',level:1,source:'Cleric',prepared:true,automation:'srd-2014',casting_time:'1 action'},
 {id:'shield',name:'Shield of Faith',level:1,source:'Cleric',prepared:true,automation:'srd-2014'},
 {id:'guide',name:'Guidance',level:0,source:'Cleric',automation:'srd-2014'},
 ],actions:[],roll_history:[]});
const ref=(c,n)=>R.match('spell',n,c.system_edition)?.automation;
const c=mock();
let p=A.planSpell(c,c.spells[0],2,ref(c,'Cure Wounds'));
assert.deepEqual(p.roll.expression,'2d8+4');assert.equal(p.effect,'heal');assert.equal(p.cost,1);
assert.equal(c.hp.current,8);assert.equal(c.resources['Level 2 Spell Slots'].current,2);
A.commitUsage(c,p);assert.equal(c.resources['Level 2 Spell Slots'].current,1);
assert.equal(A.applyHealing(c,14),14);assert.equal(c.hp.current,22);assert.equal(c.hp.temp,4);
assert.equal(A.planSpell(c,c.spells[0],1,ref(c,'Cure Wounds')).roll.expression,'1d8+4');
const shield=A.planSpell(c,c.spells[1],1,ref(c,'Shield of Faith'));
assert.equal(shield.activation,'bonus action');assert.equal(shield.acBonus,2);assert.equal(shield.durationRounds,100);
A.commitUsage(c,shield);A.startEffect(c,shield);
assert.equal(c.ac,17);assert.equal(A.effectiveAC(c),19);
assert.equal(A.activeEffects(c)[0].concentration,true);
assert.equal(A.concentrationDC(21),11,'Half damage rounds up for threshold comparisons');
const firstCheck=A.queueConcentrationCheck(c,28);assert.equal(firstCheck.dc,14);
assert.equal(A.resolveConcentrationCheck(c,firstCheck.id,14).success,true);
assert.equal(A.effectiveAC(c),19);
const second=A.queueConcentrationCheck(c,4);assert.equal(second.dc,10);
assert.equal(A.resolveConcentrationCheck(c,second.id,8).success,false);
assert.equal(A.effectiveAC(c),17);assert.equal(A.activeEffects(c).length,0);
const shield2=A.planSpell(c,c.spells[1],1,ref(c,'Shield of Faith'));A.startEffect(c,shield2);
const guid=A.planSpell(c,c.spells[2],0,ref(c,'Guidance'));
assert.equal(guid.cost,0);assert.equal(guid.effect,'roll_bonus');assert.equal(guid.charges,1);
A.commitUsage(c,guid);A.startEffect(c,guid);
assert.equal(A.effectiveAC(c),17,'replacing concentration must remove AC bonus');
assert.equal(A.activeEffects(c).length,1);
const effect=A.activeEffects(c)[0];assert.equal(effect.bonus_dice,'1d4');
assert.equal(effect.rounds_remaining,10);
const die=A.consumeCharge(c,effect.id);assert.equal(die.expression,'1d4');
assert.equal(A.activeEffects(c).length,0);
assert.throws(()=>A.consumeCharge(c,effect.id),/No charged bonus/);
const custom=mock();custom.spells[0].source='Unknown Magic';
assert.throws(()=>A.planSpell(custom,custom.spells[0],1,ref(custom,'Cure Wounds')),/Set the spellcasting modifier/);
custom.spells[0].spellcasting_modifier=6;
assert.equal(A.planSpell(custom,custom.spells[0],1,ref(custom,'Cure Wounds')).roll.expression,'1d8+6');
custom.spells[0].automation=undefined;
assert.equal(A.planSpell(custom,custom.spells[0],1,ref(custom,'Cure Wounds')).effect,'none');
const future=mock();future.system_edition='dnd-2024';assert.throws(()=>A.planSpell(future,future.spells[0],1,{...ref(c,'Cure Wounds')}),/2014 automation/);
const old=mock(),updated=mock();updated.spells[0].automation=undefined;updated.spells[0].spellcasting_modifier=undefined;old.spells[0].spellcasting_modifier=5;
const merged=Vault.reconcile(old,updated);
assert.equal(merged.spells[0].automation,'srd-2014');assert.equal(merged.spells[0].spellcasting_modifier,5);
console.log('SRD 2014 healing, AC buffs, concentration checks, Guidance charge, edition guards and vault reconciliation PASS');
