'use strict';
const assert=require('node:assert/strict');
const Demo=require('../web/demo-character.js');
const Vault=require('../web/vault-store.js');
const Action=require('../web/dnd-action.js');
const hero=Demo.create();
assert(Vault.validCharacter(hero));
assert.equal(hero.demo_id,Demo.ID);
assert.equal(hero.system_edition,'dnd-2014');
assert.equal(hero.rules_profile,'manual');
assert.equal(hero.combat_profile.attacks_per_action,2);
assert.equal(hero.effects.targets[0].name,'Training Dummy');
assert.equal(hero.attacks.length,2);
assert.equal(Action.plan(hero,hero.actions[0]).roll.expression,'1d10+5');
assert.throws(()=>Action.commitUsage(hero,Action.plan(hero,hero.actions[1])),/Start encounter tracking/);
assert.equal(hero.resources['Action Surge'].current,1,'No charge is lost outside tracked combat');
Action.setEncounter(hero,true);
Action.commitAttack(hero);Action.commitAttack(hero);
assert.equal(Action.combat(hero).economy.attacks.remaining,0);
Action.commitUsage(hero,Action.plan(hero,hero.actions[1]));
assert.equal(hero.resources['Action Surge'].current,0);
Action.commitAttack(hero);
assert.equal(Action.combat(hero).economy.attacks.remaining,1,'Action Surge gives a full Attack action');
const vault=Vault.empty();
const created=Vault.addDemo(vault);assert.equal(created.created,true);
const existing=Vault.addDemo(vault);assert.equal(existing.created,false);
assert.equal(vault.characters.length,1);
const real=Vault.newId();
Vault.upsert(vault,real,{...Demo.create(),demo_id:undefined,name:'My Actual Hero'});
assert.equal(Vault.addDemo(vault).created,false);
assert.equal(vault.characters.length,2,'Real saved characters are not overwritten');
 assert.equal(Vault.findMatch(vault,Demo.create()),null,'Demo identity must not match a real PDF import');
 vault.characters[0].character.hp.current=1;
 const reset=Vault.resetDemo(vault,created.id);
 assert.equal(reset.hp.current,40,'Reset restores only the demo');
 assert.equal(vault.characters.find(c=>c.id===real).character.name,'My Actual Hero');
 assert.throws(()=>Vault.resetDemo(vault,real),/Only a demo/);
assert.equal(Vault.normalize(vault).characters.find(c=>c.id===real).character.name,'My Actual Hero');
assert.notStrictEqual(Demo.create(),Demo.create(),'Fresh demo factory does not share mutable state');
// Exercise static-site storage with a small IndexedDB transaction double.
let stored=null,legacy=null;
global.localStorage={getItem:()=>legacy};
global.indexedDB={open(){
 const request={};
 queueMicrotask(()=>{
  const db={objectStoreNames:{contains:()=>true},close(){},transaction(){
   const tx={oncomplete:null};
   tx.objectStore=()=>({
    get(){const q={};queueMicrotask(()=>{q.result=stored;q.onsuccess?.();});return q;},
    put(v){stored=JSON.parse(JSON.stringify(v));queueMicrotask(()=>tx.oncomplete?.());}
   });return tx;
  }};
  request.result=db;request.onsuccess?.();
 });return request;
}};
(async()=>{
 const store=Vault.storage(true);
 let current=await store.read();assert.equal(current.characters.length,1,'First-ever visitor gets the demo');
 assert.equal(stored.characters.length,1,'It must be saved in the normal vault');
 current.characters=[];current.active_id=null;await store.write(current);
 current=await store.read();assert.equal(current.characters.length,0,'Deliberately deleted demo stays deleted');
 assert.equal(current.active_id,null);
 Vault.addDemo(current);await store.write(current);
 current=await store.read();assert.equal(current.characters.length,1,'A manually added demo persists');
 stored=null;legacy=JSON.stringify({...Demo.create(),demo_id:undefined,name:'Legacy Hero'});
 current=await store.read();assert.equal(current.characters.length,1);
 assert.equal(current.characters[0].character.name,'Legacy Hero');
 assert.equal(current.characters.some(e=>e.character.demo_id===Demo.ID),false,'Legacy sheet must never be replaced by demo');
 console.log('Demo starter, resource accounting, unique vault entry, first-load and deletion persistence PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});
