/* Fictional starter sheet. Gameplay mechanics belong to dnd-action.js. */
(function(root){'use strict';
const ID='starter-fighter-v1';
function create(){return {
 schema_version:1,demo_id:ID,system_id:'dnd5e',system_edition:'dnd-2014',rules_profile:'manual',
 name:'Mara Vale (Demo)',player:'Sample adventurer',class_level:'Fighter 5',species:'Human',background:'Soldier',
 ac:16,initiative:2,proficiency:3,speed:'30 ft',hp:{max:40,current:40,temp:0},
 abilities:{STR:{score:16,modifier:3},DEX:{score:14,modifier:2},CON:{score:14,modifier:2},INT:{score:10,modifier:0},WIS:{score:12,modifier:1},CHA:{score:8,modifier:-1}},
 saves:{Strength:6,Dexterity:2,Constitution:5,Intelligence:0,Wisdom:1,Charisma:-1},
 skills:{Athletics:6,Acrobatics:2,Perception:4,Stealth:2,Survival:4,Insight:1},
 combat_profile:{attacks_per_action:2,action_pools:{action:1,bonus:1,reaction:1}},
 attacks:[
  {id:'demo-longsword',name:'Longsword',bonus:6,damage:'1d8+3',attack_type:'weapon',attack_range:'melee'},
  {id:'demo-longbow',name:'Longbow',bonus:5,damage:'1d8+2',attack_type:'weapon',attack_range:'ranged'}],
 actions:[
  {id:'demo-second-wind',name:'Second Wind',activation:'1 bonus action',source:'manual',resource:'Second Wind',cost:1,roll:'1d10+5',effect_kind:'heal',archived:false,
   description:'2014 Fighter: once per short/long rest, use a bonus action to heal 1d10 + Fighter level. Healing is applied after the physical roll.'},
  {id:'demo-action-surge',name:'Action Surge',activation:'special',source:'manual',resource:'Action Surge',cost:1,grant_economy:'any',effect_kind:'none',archived:false,
   description:'2014 Fighter: once per short/long rest, take one additional action on your turn. Start encounter tracking first.'}],
 resources:{'Second Wind':{max:1,current:1,reset:'short rest'},'Action Surge':{max:1,current:1,reset:'short rest'}},
 inventory:[{id:'demo-sword',name:'Longsword',quantity:1,weight:'3 lb',notes:'Practice melee weapon'},
  {id:'demo-bow',name:'Longbow',quantity:1,weight:'2 lb',notes:'Practice ranged weapon'},
  {id:'demo-armor',name:'Chain mail',quantity:1,weight:'55 lb',notes:'Base AC 16'}],
 currency:{CP:0,SP:0,EP:0,GP:15,PP:0},spells:[],features:[],conditions:[],roll_history:[],
 effects:{target_sequence:1,targets:[{id:'target-1',name:'Training Dummy',ac:13,hp:{max:25,current:25,temp:0},
  saves:{STR:0,DEX:0,CON:0,INT:0,WIS:0,CHA:0},traits:{resistances:[],vulnerabilities:[],immunities:[]},conditions:[]}]},
 notes:'Fictional starter sheet, not a D&D Beyond import. Choose Actions, start an encounter, select Training Dummy and roll attacks. Extra Attack grants two attacks per Attack action. Try Second Wind or Action Surge. Delete this demo or export it from Characters at any time.',
 homebrew_notes:'This demonstration is editable local data; DM rulings take precedence.'
};}
const api={ID,create};root.TabletopDemo=api;
if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
