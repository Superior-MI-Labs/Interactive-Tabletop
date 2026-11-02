'use strict';
const assert=require('node:assert/strict');
const A=require('../web/dnd-action.js');
const Ref=require('../web/reference-catalog.js');
const catalog=require('../web/dnd-2014-reference.json');
Ref.init(catalog);
const character=()=>({rules_profile:'srd-2014',system_edition:'dnd-2014',class_level:'Cleric 4',
 abilities:{WIS:{modifier:3}},hp:{current:20,max:20,temp:0},ac:16,
 spells:[],resources:{'Level 1 Spell Slots':{current:4,max:4}},effects:{active:[]}});
const make=(name,level=0)=>({id:name.toLowerCase(),name,level,prepared:true,source:'Cleric',casting_time:'1 action'});
const profile=name=>Ref.match('spell',name,'dnd-2014').automation;
const hero=character();
const resistance=A.planSpell(hero,make('Resistance'),0,profile('Resistance'));
assert.equal(resistance.effect,'roll_bonus');assert.deepEqual(resistance.bonusScopes,['save']);
assert.equal(resistance.bonusMode,'charge');assert.equal(resistance.charges,1);
A.commitUsage(hero,resistance);let buff=A.startEffect(hero,resistance);
assert.equal(A.compatibleBonuses(hero,'ability-check').length,0);
assert.equal(A.compatibleBonuses(hero,'attack').length,0);
let offered=A.compatibleBonuses(hero,'save');assert.equal(offered.length,1);
assert.equal(offered[0].expression,'1d4');assert.equal(buff.auto_use,true);
assert.equal(A.resolveRollBonus(hero,buff.id,'save',offered[0].instanceId).expression,'1d4');
assert.equal(A.activeEffects(hero).length,0,'Last Resistance charge expires and concentration ends.');
assert.throws(()=>A.resolveRollBonus(hero,buff.id,'save',offered[0].instanceId),/expired/);
const bless=A.planSpell(hero,make('Bless',1),1,profile('Bless'));
assert.equal(bless.effect,'roll_bonus');assert.equal(bless.bonusMode,'sustained');
assert.deepEqual(bless.bonusScopes,['attack','save']);assert.equal(bless.durationRounds,10);
A.commitUsage(hero,bless);buff=A.startEffect(hero,bless);
assert.equal(hero.resources['Level 1 Spell Slots'].current,3);
assert.equal(A.compatibleBonuses(hero,'ability-check').length,0);
for(const kind of ['attack','save']){
 const bonus=A.compatibleBonuses(hero,kind)[0];assert.equal(bonus.effectId,buff.id);
 assert.equal(A.resolveRollBonus(hero,buff.id,kind,bonus.instanceId).expression,'1d4');
 assert.equal(A.activeEffects(hero)[0].id,buff.id,'Bless stays active after each roll.');
}
assert.equal(A.compatibleBonuses(hero,'attack',[buff.id]).length,1,'Sustained bonus can join concurrent rolls.');
A.setAutoUse(hero,buff.id,false);assert.equal(A.compatibleBonuses(hero,'save').length,0);
A.setAutoUse(hero,buff.id,true);
const stale=A.compatibleBonuses(hero,'attack')[0];
A.startEffect(hero,bless);assert.throws(()=>A.resolveRollBonus(hero,buff.id,'attack',stale.instanceId),/expired|changed/,'Recast effect cannot validate an old in-flight roll.');
assert.equal(A.activeEffects(hero).length,1);
A.endEffect(hero,buff.id);assert.equal(A.activeEffects(hero).length,0);
const guidance=A.planSpell(hero,make('Guidance'),0,profile('Guidance'));
A.startEffect(hero,guidance);const guide=A.activeEffects(hero)[0];
assert.deepEqual(A.compatibleBonuses(hero,'ability-check').map(x=>x.expression),['1d4']);
assert.equal(A.compatibleBonuses(hero,'save').length,0);
assert.throws(()=>A.resolveRollBonus(hero,guide.id,'save',guide.instance_id),/qualifies/);
assert.equal(A.activeEffects(hero).length,1);
A.resolveRollBonus(hero,guide.id,'ability-check',guide.instance_id);
assert.equal(A.activeEffects(hero).length,0);
// Explicit 2024 edition always refuses automation, even with 2014 catalog selected.
hero.system_edition='dnd-2024';assert.throws(()=>A.planSpell(hero,make('Bless',1),1,profile('Bless')),/2014 automation/);
// Typed catalog field tampering cannot sneak unsupported dice or effects through validation.
const bad=structuredClone(catalog);
bad.spells.find(x=>x.name==='Bless').automation.roll_scopes=['attack','nonsense'];
assert.throws(()=>Ref.init(bad),/typed roll-bonus/);
Ref.init(catalog);
console.log('Typed roll bonuses PASS: Resistance charged save, Bless sustained attacks/saves, Guidance check, no double-charge, stale recast, edition guard, catalog validation');
