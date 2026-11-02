'use strict';
const assert=require('node:assert/strict');
const{fromFields}=require('../web/character-import.js');
const sample={CharacterName:'Sample Hero','CLASS  LEVEL':'Bard 3','PLAYER NAME':'TestPlayer',RACE:'Tabaxi',BACKGROUND:'Entertainer',AC:'14',Init:'+2',MaxHP:'21',ProfBonus:'+2',CHA:'16',CHamod:'+3',
'Wpn Name':'Shortsword','Wpn1 AtkBonus':'+4','Wpn1 Damage':'1d6+2 Piercing',
'Eq Name0':'Lantern','Eq Qty0':'1','Eq Weight0':'2lb.',
spellHeader0:'=== CANTRIPS ===',spellName0:'Light',spellPrepared0:'O',
spellHeader1:'=== 1st LEVEL ===',spellName1:'Healing Word',spellPrepared1:'P',spellSlotHeader1:'4 Slots OOOO',
Actions1:'=== BONUS ACTIONS ===\nBardic Inspiration • 3 /Long Rest\n     As a bonus action, you can inspire your ally.'};
const c=fromFields(sample);
assert.equal(c.name,'Sample Hero');assert.equal(c.class_level,'Bard3');assert.equal(c.hp.max,21);
assert.equal(c.spells.length,2);assert.equal(c.spells[1].level,1);assert.equal(c.spells[1].prepared,true);
assert.equal(c.resources['Level 1 Spell Slots'].max,4);assert.equal(c.resources['BardicInspiration'].max,3);
assert.equal(c.actions[0].name,'Bardic Inspiration');assert.equal(c.inventory[0].quantity,1);
assert.equal(c.attacks[0].bonus,4);
assert.throws(()=>fromFields({other:'No Name'}),/D&D Beyond character name/);
console.log('Characternormalization: synthetic Fighter/Bard style fields PASS');
