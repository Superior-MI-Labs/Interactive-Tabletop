'use strict';
const assert=require('node:assert/strict');
const A=require('../web/dnd-action.js');
const R=require('../web/reference-catalog.js');
const Vault=require('../web/vault-store.js');
R.init(require('../web/dnd-2014-reference.json'));
function character(){return {
 schema_version:1,name:'Rules Test',system_edition:'dnd-2014',rules_profile:'manual',hp:{max:20,current:20},ac:12,
 abilities:{WIS:{score:18,modifier:4}},inventory:[],spells:[{id:'c',name:'Cure Wounds',level:1,prepared:true,source:'Cleric'}],
 resources:{'Level 1 Spell Slots':{max:2,current:2}},conditions:[],effects:{},actions:[]
};}
const ref=R.match('spell','Cure Wounds','dnd-2014').automation;
const c=character();
assert.equal(A.planSpell(c,c.spells[0],1,ref).effect,'none','No unapproved automation');
c.rules_profile='srd-2014';
assert.equal(A.planSpell(c,c.spells[0],1,ref).roll.expression,'1d8+4');
assert.equal(A.planSpell(c,{id:'sacred',name:'Sacred Flame',level:0,casting_time:'1 action'},0,null).automatic,false,'Unqualified spells remain castable manually under the global SRD preference');
assert.throws(()=>A.planSpell(c,{id:'sacred',name:'Sacred Flame',level:0,casting_time:'1 action',automation:'srd-2014'},0,null),/profile is unavailable/,'An explicit automation request must not silently fall back');

c.spells[0].automation='manual';
assert.equal(A.planSpell(c,c.spells[0],1,ref).effect,'none','Individual manual override wins');
c.spells[0].automation='srd-2014';c.rules_profile='manual';
assert.equal(A.planSpell(c,c.spells[0],1,ref).effect,'heal','Legacy explicitly enabled spell stays functional');
const changed=Vault.reconcile(c,character());
assert.equal(changed.rules_profile,'manual');
assert.equal(changed.spells[0].automation,'srd-2014');
const d=character();d.rules_profile='srd-2014';
assert.equal(Vault.reconcile(d,character()).rules_profile,'srd-2014','Preserve character-level rules selection after reimport');
d.system_edition='dnd-2024';
assert.throws(()=>A.planSpell(d,d.spells[0],1,ref),/2014 automation/);
assert.equal(R.match('spell','Cure Wounds','dnd-2024'),null);

for(const edition of ['unspecified','dnd5e',null,'dnd-2024']){
 const unknown=character();unknown.system_edition=edition;
 unknown.rules_profile='srd-2014';
 const before=JSON.stringify(unknown);
 assert.throws(()=>A.planSpell(unknown,unknown.spells[0],1,ref),/2014 automation requires/);
 assert.equal(JSON.stringify(unknown),before,'A rejected catalog profile never mutates character state');
 unknown.rules_profile='manual';unknown.spells[0].automation='srd-2014';
 assert.throws(()=>A.planSpell(unknown,unknown.spells[0],1,ref),/2014 automation requires/,'Explicit overrides do not bypass edition gate');
 unknown.spells[0].automation='manual';
 assert.equal(A.planSpell(unknown,unknown.spells[0],1,ref).automatic,false,'Manual spell plans remain available without edition');
}

console.log('PASS ruleset: verified global profiles, manual per-spell override, older opt-ins, reimport and 2024 fence');
