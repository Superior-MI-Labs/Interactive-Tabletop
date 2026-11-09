'use strict';
const assert=require('node:assert/strict');
const Import=require('../web/character-import.js');
const Vault=require('../web/vault-store.js');

// The real D&D Beyond form-field importer generates positional equipment-N IDs.
const pdf=rows=>{
 const fields={CharacterName:'Inventory Reimport QA','CLASS LEVEL':'Fighter 3',MaxHP:'30'};
 rows.forEach(({name,quantity=1,weight='',index},i)=>{
  const n=index??i;
  fields['Eq Name'+n]=name;
  fields['Eq Qty'+n]=String(quantity);
  fields['Eq Weight'+n]=weight;
 });
 return Import.fromFields(fields);
};
const item=(id,name,notes='',quantity=1)=>({id,name,notes,quantity,weight:'',archived:false});
const old=pdf([
 {name:'Longsword',quantity:2,weight:'3 lb',index:0},
 {name:'Healing Potion',quantity:1,index:3},
]);
old.inventory[0].notes='Player-silvered blade';
old.inventory[1].notes='Red bottle';
const fresh=pdf([
 {name:'Healing Potion',quantity:3,index:0},
 {name:'Longsword',quantity:0,weight:'4 lb',index:3}
]);
const oldBytes=JSON.stringify(old),freshBytes=JSON.stringify(fresh);
const reviewed=Vault.inventoryReimportPreview(old,fresh);
assert.equal(JSON.stringify(old),oldBytes,'Preview must not mutate old game state');
assert.equal(JSON.stringify(fresh),freshBytes,'Preview must not mutate incoming PDF');
assert.equal(reviewed.matched,2);
assert.equal(reviewed.notesRetained,2);
assert.deepEqual(reviewed.added,[]);
assert.deepEqual(reviewed.removed,[]);
assert.deepEqual(reviewed.ambiguous,[]);
assert.deepEqual(reviewed.notesAtRisk,[]);
assert.equal(reviewed.quantityChanged.length,2);
const merged=Vault.reconcile(old,fresh);
assert.equal(merged.inventory[0].notes,'Red bottle','Reordered item notes follow unique names');
assert.equal(merged.inventory[1].notes,'Player-silvered blade');
assert.equal(merged.inventory[1].id,'equipment-3','Incoming PDF owns the row ID');
assert.equal(merged.inventory[1].weight,'4 lb','Incoming PDF owns weight');
assert.equal(merged.inventory[1].quantity,0,'Incoming PDF owns quantity');
assert.equal(merged.inventory[1].archived,true,'Incoming PDF quantity controls archived status');
assert.equal(JSON.stringify(old),oldBytes,'Reconcile must not mutate old character');
assert.equal(JSON.stringify(fresh),freshBytes,'Reconcile must not mutate fresh character');

// Duplicate names never use row order, quantity, or equipment-N identifiers as
// implied identity. Doing so reattaches personal notes to a potentially wrong item.
const duplicates=pdf([
 {name:'Ring of Protection',quantity:1,weight:'left'},
 {name:'Ring of Protection',quantity:2,weight:'right'}
]);
duplicates.inventory[0].notes='Left finger';
duplicates.inventory[1].notes='Right finger';
const swapped=pdf([
 {name:'Ring of Protection',quantity:2,weight:'right'},
 {name:'Ring of Protection',quantity:1,weight:'left'}
]);
const ambiguous=Vault.inventoryReimportPreview(duplicates,swapped);
assert.equal(ambiguous.matched,0);
assert.deepEqual(ambiguous.ambiguous,['Ring of Protection (2 previous, 2 incoming)']);
assert.equal(ambiguous.notesAtRisk.length,2);
assert.deepEqual(Vault.reconcile(duplicates,swapped).inventory.map(x=>x.notes),['','']);
assert.match(Vault.importSummary(duplicates,swapped),/Previous item notes that cannot safely transfer \(2\)/);
assert.match(Vault.importSummary(duplicates,swapped),/will NOT transfer automatically/);

// A formerly unique item becomes ambiguous when another identical name enters
// the PDF, even if an equipment index or one quantity appears to match.
const one=pdf([{name:'Healing Potion',quantity:1}]);one.inventory[0].notes='Keep distinct';
const two=pdf([{name:'Healing Potion',quantity:1},{name:'Healing Potion',quantity:7}]);
assert.equal(Vault.inventoryReimportPreview(one,two).matched,0);
assert.equal(Vault.inventoryReimportPreview(one,two).ambiguous.length,1);
assert.equal(Vault.inventoryReimportPreview(one,two).notesAtRisk.length,1);
assert.ok(Vault.reconcile(one,two).inventory.every(x=>!x.notes));
const fewer=Vault.inventoryReimportPreview(duplicates,pdf([{name:'Ring of Protection'}]));
assert.equal(fewer.matched,0);
assert.equal(fewer.ambiguous.length,1);
assert.equal(fewer.notesAtRisk.length,2);

// Separate authored items never collide with a PDF item of the same display
// name. Preserve stable IDs even after consecutive imports.
const authored=pdf([{name:'Healing Potion'}]);
authored.inventory[0].notes='Imported annotation';
authored.inventory.push(item('custom-a','Healing Potion','DM recipe'));
authored.inventory.push(item('manual-item-b','Unique Artifact','Player designed'));
const incoming=pdf([{name:'Healing Potion',quantity:4},{name:'Shield'}]);
const combined=Vault.reconcile(authored,incoming);
assert.equal(combined.inventory.length,4);
assert.equal(combined.inventory[0].notes,'Imported annotation');
assert.equal(combined.inventory.find(x=>x.id==='custom-a').notes,'DM recipe');
assert.equal(combined.inventory.find(x=>x.id==='manual-item-b').notes,'Player designed');
assert.equal(Vault.inventoryReimportPreview(authored,incoming).manualPreserved,2);
assert.equal(Vault.reconcile(combined,incoming).inventory.length,4,'Repeated imports do not duplicate manual items');
assert.equal(Vault.isManualItem(item('custom-a','X')),true);
assert.equal(Vault.isManualItem(item('manual-item-b','Y')),true);
assert.equal(Vault.isManualItem(item('equipment-3','Z')),false);
const incomingManual=pdf([{name:'Healing Potion'}]);
incomingManual.inventory.push(item('custom-a','Healing Potion','New authored revision'));
const preferred=Vault.reconcile(authored,incomingManual);
assert.equal(preferred.inventory.filter(x=>x.id==='custom-a').length,1);
assert.equal(preferred.inventory.find(x=>x.id==='custom-a').notes,'New authored revision');

// Unmatched/removed imported items must be called out before confirmation.
// Never manufacture archived pseudo-inventory to conceal matching failures.
const missing=pdf([{name:'Old Journal'},{name:'Torch'}]);
missing.inventory[0].notes='Important quest history';
const replaced=pdf([{name:'Lantern'},{name:'Torch'}]);
const preview=Vault.inventoryReimportPreview(missing,replaced);
assert.equal(preview.matched,1);
assert.deepEqual(preview.added,['Lantern (qty 1)']);
assert.deepEqual(preview.removed,['Old Journal (qty 1)']);
assert.deepEqual(preview.notesAtRisk,['Old Journal (qty 1)']);
const text=Vault.importSummary(missing,replaced);
assert.match(text,/Imported inventory: 1 matched, 1 added, 1 removed/);
assert.match(text,/Previous item notes that cannot safely transfer \(1\)/);
assert.equal(Vault.reconcile(missing,replaced).inventory.length,2);
assert.equal(Vault.reconcile(missing,replaced).inventory[0].notes,'');

// Preview has no authority to merge invalid or partial character documents.
assert.throws(()=>Vault.inventoryReimportPreview({},incoming),/invalid characters/);
assert.throws(()=>Vault.reconcile({},incoming),/invalid characters/);
const envelope=Vault.empty();Vault.upsert(envelope,'hero',combined);
const restored=Vault.normalize(JSON.parse(JSON.stringify(envelope)));
assert.equal(restored.characters[0].character.inventory.length,4);
console.log('PASS inventory identity: unique reordered names, ambiguous duplicates, author IDs, notes-at-risk, PDF quantities, repeated import, preview purity, vault persistence');
