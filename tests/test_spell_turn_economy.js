// Same-turn 2014 casting restriction, tested across all plan types and vault persistence.
'use strict';
const assert=require('node:assert/strict');
const A=require('../web/dnd-action.js'),Vault=require('../web/vault-store.js');
const make=()=>({schema_version:1,name:'2014 Turn QA',system_edition:'dnd-2014',hp:{current:12,max:20},inventory:[],conditions:[],effects:{},
 resources:{'Level 1 Spell Slots':{max:4,current:4},'Level 2 Spell Slots':{max:3,current:3}},
 spells:[
  {id:'hw',name:'Healing Word',level:1,prepared:true,casting_time:'1 bonus action'},
  {id:'cw',name:'Cure Wounds',level:1,prepared:true,casting_time:'1 action'},
  {id:'cantrip',name:'Sacred Flame',level:0,casting_time:'1 action'},
  {id:'bonus-cantrip',name:'Shillelagh',level:0,casting_time:'1 bonus action'},
  {id:'react',name:'Shield',level:1,prepared:true,casting_time:'1 reaction'},
  {id:'special',name:'Unknown Effect',level:1,prepared:true,casting_time:'special'}],actions:[]});
const cast=(c,id,slot)=>{const sp=c.spells.find(s=>s.id===id);const plan=A.planSpell(c,sp,slot);A.commitUsage(c,plan);return plan;};
const blocks=(c,id,pattern)=>{
 const before=JSON.stringify(c);
 assert.throws(()=>A.commitUsage(c,A.planSpell(c,c.spells.find(s=>s.id===id))),pattern,id);
 // verify rejection, including before/after preview, is entirely non-mutating.
 assert.equal(JSON.stringify(c),before,id+' must not modify slots or turn state');
};
// Manual and automated spell records obey the SAME shared commit rule.
let c=make();A.setEncounter(c,true);
cast(c,'hw');assert.equal(c.resources['Level 1 Spell Slots'].current,3);
assert.deepEqual(c.effects.combat.spellcasting,{bonus:true,restricted:false});
blocks(c,'cw',/bonus-action spell rule/);blocks(c,'react',/bonus-action spell rule/);
blocks(c,'special',/bonus-action spell rule/);blocks(c,'bonus-cantrip',/already used|bonus-action spell rule/);
cast(c,'cantrip');assert.equal(c.effects.combat.used.action,true);
assert.equal(c.effects.combat.spellcasting.restricted,false);
blocks(c,'cw',/already used/);
// Separate turns clear spell restrictions and undo restores them, not just action budget.
A.advanceTurn(c);assert.deepEqual(c.effects.combat.spellcasting,{bonus:false,restricted:false});
cast(c,'cw');assert.equal(c.resources['Level 1 Spell Slots'].current,2);
assert.equal(c.effects.combat.spellcasting.restricted,true);
blocks(c,'hw',/bonus-action spell rule/);blocks(c,'bonus-cantrip',/bonus-action spell rule/);
assert.equal(A.undoTurn(c),false,'Committing a spell invalidates the prior turn undo');
A.advanceTurn(c);assert.deepEqual(c.effects.combat.spellcasting,{bonus:false,restricted:false});
assert.equal(A.undoTurn(c),true);assert.equal(c.effects.combat.spellcasting.restricted,true);
blocks(c,'hw',/bonus-action spell rule/);
// Action cantrip before bonus spell is allowed; non-action cantrips still restrict.
c=make();A.setEncounter(c,true);cast(c,'cantrip');cast(c,'hw');
assert.deepEqual(c.effects.combat.spellcasting,{bonus:true,restricted:false});
c=make();A.setEncounter(c,true);cast(c,'react');blocks(c,'hw',/bonus-action spell rule/);
c=make();A.setEncounter(c,true);cast(c,'special');blocks(c,'hw',/bonus-action spell rule/);
c=make();A.setEncounter(c,true);cast(c,'bonus-cantrip');blocks(c,'cw',/bonus-action spell rule/);
// Ordinary abilities and manually marked bonus actions do not impersonate spell casts.
c=make();A.setEncounter(c,true);A.markAction(c,'action');cast(c,'hw');
assert.deepEqual(c.effects.combat.spellcasting,{bonus:true,restricted:false});
// Encounter opt-out never enforces or records turn economy.
c=make();cast(c,'cw');cast(c,'hw');assert.deepEqual(c.effects.combat.spellcasting,{bonus:false,restricted:false});
// Edition isolation: selecting an encounter tracker does not import 2014 rules into 2024 or unspecified sheets.
for(const edition of ['dnd-2024','unspecified']){
 c=make();c.system_edition=edition;A.setEncounter(c,true);cast(c,'hw');cast(c,'cw');
 assert.deepEqual(c.effects.combat.spellcasting,{bonus:false,restricted:false},edition);
}
// Legacy vaults gain default flags on access and roundtrip without schema migration.
c=make();c.effects.combat={active:true,turn:4,used:{action:false,bonus:true,reaction:false}};
assert.deepEqual(A.combat(c).spellcasting,{bonus:false,restricted:false});
const v=Vault.normalize({schema_version:1,active_id:'q',characters:[{id:'q',character:c}]});
assert.deepEqual(v.characters[0].character.effects.combat.spellcasting,{bonus:false,restricted:false});
const reimport=make(),merged=Vault.reconcile(c,reimport);
assert.deepEqual(merged.effects.combat.spellcasting,{bonus:false,restricted:false});
A.setEncounter(merged,false);assert.deepEqual(merged.effects.combat.spellcasting,{bonus:false,restricted:false});
console.log('2014 casting economy: order, slots, cantrips, reactions, manual plans, undo, vault and opt-out PASS');
