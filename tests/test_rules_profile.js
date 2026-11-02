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
console.log('PASS ruleset: verified global profiles, manual per-spell override, older opt-ins, reimport and 2024 fence');
