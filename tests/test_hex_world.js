'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const H=require('../web/hex-world-core.js');
const scene={schema:H.SCHEMA,id:'test-map',grid:{orientation:'pointy',coordinates:'axial',feet_per_step:5},tiles:[],objects:[]};
for(let q=-4;q<=4;q++)for(let r=-4;r<=4;r++)if(Math.abs(q+r)<=4)scene.tiles.push({q,r,terrain:'grass'});
scene.objects=[{id:'tree-1',kind:'tree',q:0,r:0}];
const index=H.createSceneIndex(scene);
const demo=JSON.parse(fs.readFileSync(path.join(__dirname,'../web/hex-world-demo.json'),'utf8'));
assert.equal(H.createSceneIndex(demo).tiles.size,127);
assert.equal(demo.grid.feet_per_step,5);
assert.equal(H.distance({q:0,r:0},{q:3,r:-2}),3);
assert.equal(H.neighbors(0,0).length,6);
for(const tile of scene.tiles){
 const world=H.axialToWorld(tile.q,tile.r);
 assert.deepEqual(H.worldToAxial(world.x,world.y),{q:tile.q,r:tile.r});
 for(let rotation=0;rotation<6;rotation++)for(const tilt of [25,40,65]){
  const camera=H.makeCamera({zoom:37.5,rotation,tilt,panX:104,panY:-32});
  const p=H.project(camera,world.x,world.y,960,680);
  const back=H.unproject(camera,p.x,p.y,960,680);
  assert.ok(Math.abs(back.x-world.x)<1e-10&&Math.abs(back.y-world.y)<1e-10);
  assert.deepEqual(H.pick(camera,p.x,p.y,960,680,index),tile);
 }
}
const camera=H.makeCamera({rotation:4});H.fitScene(camera,scene,1200,800);
assert.ok(camera.zoom>=12&&camera.zoom<=180);
const anchor={x:370,y:300},before=H.unproject(camera,anchor.x,anchor.y,1200,800);
H.setZoomAt(camera,camera.zoom*1.7,anchor.x,anchor.y,1200,800);
const after=H.unproject(camera,anchor.x,anchor.y,1200,800);
assert.ok(Math.hypot(after.x-before.x,after.y-before.y)<1e-9,'cursor anchored zoom');
function invalid(m){assert.throws(()=>H.validateScene(m),/Scene:/);}
invalid({...scene,schema:'bogus'});
invalid({...scene,tiles:[scene.tiles[0],scene.tiles[0]]});
invalid({...scene,objects:[...scene.objects,scene.objects[0]]});
invalid({...scene,objects:[{id:'out',kind:'rock',q:200,r:200}]});
invalid({...scene,grid:{...scene.grid,feet_per_step:0}});
invalid({...scene,tiles:[]});
console.log('Hex geometry, scene validation, camera projection, selection and cursor-anchored zoom PASS');
