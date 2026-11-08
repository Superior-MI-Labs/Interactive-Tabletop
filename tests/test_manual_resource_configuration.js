'use strict';
const assert=require('node:assert/strict');
const Slots=require('../web/dnd-slots.js');
global.DndSlotPools=Slots;
const Action=require('../web/dnd-action.js');
const Import=require('../web/character-import.js');
const Vault=require('../web/vault-store.js');
const create=()=>Import.createManual({
 name:'Test Wizard',className:'Wizard',species:'Human',level:2,
 scores:{STR:10,DEX:12,CON:14,INT:16,WIS:10,CHA:8},
 saveProficiencies:[],skillProficiencies:[],hp:12,ac:12,speed:30,
 attack:{name:'',bonus:0,damage:'',range:'melee'}
});
const c=create();
assert.equal(Action.spellSlots(c).length,0);
assert.deepEqual(Action.configureSpellSlots(c,1,3,2),{level:1,resource:'Level 1 Spell Slots',pool:c.resources['Level 1 Spell Slots'],current:2,max:3});
assert.equal(c.resources['Level 1 Spell Slots'].reset,'long rest');
assert.equal(Action.spellSlots(c)[0].level,1);
const spell={name:'Shield',level:1,prepared:true,available:true,automation:'manual',casting_time:'reaction'};
const plan=Action.planSpell(c,spell,1);
Action.commitUsage(c,plan);
assert.equal(c.resources['Level 1 Spell Slots'].current,1);
const prior=JSON.stringify(c.resources);
for(const args of [[0,1,1],[1,-1,0],[1,2,3],[1,1,1.5],[1,100,0]])
 assert.throws(()=>Action.configureSpellSlots(c,...args),/slot/i);
assert.equal(JSON.stringify(c.resources),prior,'Rejected slot edits are atomic');
Action.configureSpellSlots(c,1,0,0);
assert.equal(Action.spellSlots(c).length,0);
assert.equal(Object.keys(c.resources).length,0);
assert.throws(()=>Action.planSpell(c,spell,1),/No level 1 spell slot/);
c.resources['First-level Spell Slots']={max:3,current:1,reset:'long rest'};
c.resources['Level 1 Spell Slots']={max:3,current:2,reset:'long rest'};
Action.configureSpellSlots(c,2,1,1);
assert.equal(Action.spellSlots(c).find(x=>x.level===1).current,1,'Aliases normalize conservatively');
assert.equal(c.resources['First-level Spell Slots'],undefined,'No duplicate slot pools');
Action.addResourcePool(c,'Focus Points',4,'short rest');
assert.throws(()=>Action.addResourcePool(c,'Level 3 Spell Slots',2),/standard spell-slot/);
Action.configureResourcePool(c,'Focus Points',6,2,'long rest');
assert.deepEqual(c.resources['Focus Points'],{max:6,current:2,reset:'long rest'});
const saved=JSON.stringify(c.resources);
for(const args of [['Focus Points',6,7,'long rest'],['Focus Points',0,0,'manual'],['Focus Points',4,2,'hourly'],['Level 1 Spell Slots',4,2,'long rest']])
 assert.throws(()=>Action.configureResourcePool(c,...args),/resource|slot/i);
assert.equal(JSON.stringify(c.resources),saved,'Invalid pool edits preserve prior values');
assert.throws(()=>Action.setResourceCurrent(c,'Focus Points',-1),/Remaining resource uses/);
Action.setResourceCurrent(c,'Focus Points',0);
assert.equal(c.resources['Focus Points'].current,0);
assert.equal(Import.validateManualEntryField('attacks','damage',' 1d8 + 3 '),'1d8+3');
assert.equal(Import.validateManualEntryField('spells','roll','2d6+3'),'2d6+3');
for(const value of ['21d6','1d3','0d8','not-dice'])
 assert.throws(()=>Import.validateManualEntryField('attacks','damage',value),/Attack damage/);
assert.throws(()=>Import.validateManualEntryField('attacks','bonus','51'),/Attack bonus/);
assert.throws(()=>Import.validateManualEntryField('spells','roll','1d7'),/Spell dice/);
assert.throws(()=>Import.validateManualEntryField('spells','name','  '),/Spell name/);
const vault=Vault.empty();Vault.upsert(vault,'wizard',c);
const restored=Vault.normalize(JSON.parse(JSON.stringify(vault)));
assert.equal(restored.characters[0].character.resources['Focus Points'].current,0);
console.log('PASS manual slot/resource identity, validation, spell spending, edit rejection and vault persistence');
