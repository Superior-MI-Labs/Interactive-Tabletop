'use strict';
const assert=require('node:assert/strict');
const Import=require('../web/character-import.js');
const Vault=require('../web/vault-store.js');
const Action=require('../web/dnd-action.js');

// Synthetic D&D Beyond-shaped fields: no private character data or fixture PDFs.
const pdf=rows=>{
 const fields={CharacterName:'Reimport Test', 'CLASS LEVEL':'Wizard 3',MaxHP:'18',spellSlotHeader1:'3 Slots OOO'};
 let priorLevel=-1;
 rows.forEach(({name,source='Wizard',level=1,prepared=false},i)=>{
  if(level!==priorLevel){fields['spellHeader'+i]='=== '+({0:'CANTRIPS',1:'1st LEVEL',2:'2nd LEVEL'}[level])+' ===';priorLevel=level;}
  fields['spellName'+i]=name;fields['spellSource'+i]=source;
  fields['spellPrepared'+i]=prepared?'P':'';
  fields['spellCastingTime'+i]='1 action';
 });
 return Import.fromFields(fields);
};
const row=(name,level=1,source='Wizard',prepared=false)=>({name,level,source,prepared});
const authored=(id,name,overrides={})=>({
 id,name,source:'manual',level:1,prepared:false,available:true,automation:'manual',
 notes:'Player-authored, DM reviewed',roll:'',...overrides
});
const lookup=(character,name)=>character.spells.find(s=>s.name===name&&!Vault.isManualSpell(s));
const stable=pdf([row('Magic Missile'),row('Shield'),row('Light',0)]);
stable.spells[0].prepared=true;
stable.spells[0].spellcasting_ability='INT';
stable.spells[0].roll='1d4+1';
stable.spells[0].notes='Original DM ruling';
stable.spells[0].available=false;
stable.resources['Level 1 Spell Slots'].current=1; // two slots already spent
const reordered=pdf([row('Light',0),row('Shield'),row('Magic Missile',1,'Wizard',false)]);
const oldJson=JSON.stringify(stable),newJson=JSON.stringify(reordered);
const updated=Vault.reconcile(stable,reordered);
assert.equal(JSON.stringify(stable),oldJson,'Reimport never mutates live old state');
assert.equal(JSON.stringify(reordered),newJson,'Reimport never mutates new PDF data');
assert.equal(lookup(updated,'Magic Missile').id,'spell-2','PDF position is not spell identity');
assert.equal(lookup(updated,'Magic Missile').prepared,true);
assert.equal(lookup(updated,'Magic Missile').available,false);
assert.equal(lookup(updated,'Magic Missile').spellcasting_ability,'INT');
assert.equal(lookup(updated,'Magic Missile').roll,'1d4+1');
assert.equal(lookup(updated,'Magic Missile').notes,'Original DM ruling');
assert.equal(updated.resources['Level 1 Spell Slots'].current,1,'Reimport preserves spent standard slots');
assert.equal(updated.spells.length,3);

// Manual spells, including older ID formats, are not PDF-owned even when all
// visible name/source/level fields collide with an imported record.
const live=pdf([row('Shield'),row('Mage Armor')]);
live.spells.push(authored('manual-spell-legacy','Shield',{source:'Wizard',prepared:true,spellcasting_ability:'CHA'}));
live.spells.push(authored('custom-old','Mage Armor',{source:'Wizard',notes:'Legacy homebrew'}));
const newer=pdf([row('Mage Armor',1,'Wizard',true),row('Shield',1,'Wizard',true)]);
const combined=Vault.reconcile(live,newer);
assert.equal(combined.spells.length,4,'Separate authored spells must never disappear');
assert.equal(combined.spells.filter(s=>s.name==='Shield').length,2);
assert.equal(lookup(combined,'Shield').spellcasting_ability,undefined,'Manual metadata never contaminates an imported spell');
assert.equal(combined.spells.find(s=>s.id==='manual-spell-legacy').spellcasting_ability,'CHA');
assert.equal(combined.spells.find(s=>s.id==='custom-old').notes,'Legacy homebrew');
assert.equal(Vault.reconcile(combined,newer).spells.length,4,'Repeated imports must not duplicate manual spells');
const backup=Vault.empty();Vault.upsert(backup,'one',combined);
const restored=Vault.normalize(JSON.parse(JSON.stringify(backup)));
assert.equal(restored.characters[0].character.spells.length,4,'Vault backup retains both record types');

// Fresh backups with the same authored ID are authoritative, not duplicated.
const freshWithManual=pdf([row('Shield')]);
freshWithManual.spells.push(authored('manual-spell-legacy','Shield',{notes:'Fresh backup'}));
const deduplicated=Vault.reconcile(live,freshWithManual);
assert.equal(deduplicated.spells.filter(s=>s.id==='manual-spell-legacy').length,1);
assert.equal(deduplicated.spells.find(s=>s.id==='manual-spell-legacy').notes,'Fresh backup');

// Source labels can change only when the PDF spell identity is unique.
const sourceOld=pdf([row('Cure Wounds',1,'Cleric / Wizard',true)]);
sourceOld.spells[0].spellcasting_ability='WIS';
sourceOld.spells.push(authored('manual-spell-6','Cure Wounds',{source:'Wizard'}));
const sourceFresh=pdf([row('Cure Wounds',1,'Cleric',false)]);
assert.equal(lookup(Vault.reconcile(sourceOld,sourceFresh),'Cure Wounds').spellcasting_ability,'WIS');
const ambiguous=pdf([row('Cure Wounds',1,'Cleric'),row('Cure Wounds',1,'Wizard')]);
assert.equal(Vault.reconcile(sourceOld,ambiguous).spells.filter(s=>!Vault.isManualSpell(s)&&s.spellcasting_ability).length,0,
 'Mixed-class sources never guess which imported spell inherits a modifier');
const identical=pdf([row('Shield'),row('Shield')]);
const dupOld=pdf([row('Shield')]);dupOld.spells[0].notes='Must not guess';
assert.equal(Vault.reconcile(dupOld,identical).spells.filter(s=>s.notes==='Must not guess').length,0,
 'Duplicate PDF identities never inherit unverified notes');

// A changed level is new PDF truth, not automatic character/class progression.
const levelOld=pdf([row('Magic Missile',1,'Wizard',true)]);
levelOld.spells[0].roll='4d6';
const levelNew=pdf([row('Magic Missile',2,'Wizard',false)]);
const moved=Vault.reconcile(levelOld,levelNew);
assert.equal(moved.spells[0].level,2);
assert.equal(moved.spells[0].prepared,false);
assert.equal(moved.spells[0].roll,undefined);
assert.equal(Vault.reconcile(live,pdf([])).spells.length,2,'PDF removal drops PDF records, never authored records');

// Planner, preparation and slot debit remain common to every assistance mode.
for(const mode of ['auto','guided','manual']){
 const actor=pdf([row('Shield',1,'Wizard',true)]);
 actor.system_edition='dnd-2014';
 Action.setCombatMode(actor,mode);Action.setEncounter(actor,true);
 const spell=actor.spells[0],resource='Level 1 Spell Slots',start=actor.resources[resource].current;
 assert.throws(()=>Action.planSpell(actor,{...spell,prepared:false}),/Prepare/);
 assert.equal(actor.resources[resource].current,start,'Rejected cast is pure');
 const plan=Action.planSpell(actor,spell);
 Action.commitUsage(actor,plan);
 assert.equal(actor.resources[resource].current,start-1,mode+' consumes one canonical spell slot');
 const after=Vault.reconcile(actor,pdf([row('Shield',1,'Wizard',false)]));
 assert.equal(after.spells[0].prepared,true,mode+' retains player preparation on PDF reimport');
 assert.equal(after.resources[resource].current,start-1,mode+' does not refill spent slots');
}
assert.equal(Vault.isManualSpell(authored('manual-spell-a','Foo')),true);
assert.equal(Vault.isManualSpell(authored('custom-a','Foo')),true);
assert.equal(Vault.isManualSpell({id:'spell-1',name:'Foo'}),false);
console.log('PASS spellbook lifecycle: source/level identity, authored collisions, duplicate guards, preparation, slots, vault and mode isolation');
