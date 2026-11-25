'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const H=require('../web/hex-world-core.js');
const scene={schema:H.SCHEMA,id:'test-map',grid:{orientation:'pointy',coordinates:'axial',feet_per_step:5},tiles:[],objects:[]};
for(let q=-4;q<=4;q++)for(let r=-4;r<=4;r++)if(Math.abs(q+r)<=4)scene.tiles.push({q,r,terrain:'grass'});
scene.objects=[{id:'tree-1',kind:'tree',q:0,r:0}];
const index=H.createSceneIndex(scene);
const raised={...scene,tiles:scene.tiles.map(t=>t.q===0&&t.r===0?{...t,terrain:'rock',elevation:2}:t)};
const raisedIndex=H.createSceneIndex(raised);
assert.equal(H.exposedFaces(index,scene.tiles.find(t=>t.q===0&&t.r===0)).length,0,'equal-height interior has no exposed sides');
assert.equal(H.exposedFaces(raisedIndex,raised.tiles.find(t=>t.q===0&&t.r===0)).length,6,'raised rock exposes all six sides');
assert.ok(H.exposedFaces(raisedIndex,raised.tiles.find(t=>t.q===0&&t.r===0)).every(f=>f.bottom===0));
assert.equal(H.exposedFaces(index,scene.tiles[0]).some(f=>f.boundary),true,'outer world edge has visual skirt');
assert.ok(H.exposedFaces(index,scene.tiles[0],(q,r)=>index.tiles.get(H.key(q,r))).length<H.exposedFaces(index,scene.tiles[0]).length,'unknown adjacent chunk must not create a fake cliff');
const demo=JSON.parse(fs.readFileSync(path.join(__dirname,'../web/hex-world-demo.json'),'utf8'));
assert.equal(H.createSceneIndex(demo).tiles.size,127);
assert.equal(demo.grid.feet_per_step,5);
assert.equal(H.distance({q:0,r:0},{q:3,r:-2}),3);
assert.deepEqual(H.chunkOf(-1,-33),{cq:-1,cr:-2,localQ:31,localR:31});
assert.deepEqual(H.chunkOf(32,31),{cq:1,cr:0,localQ:0,localR:31});
assert.deepEqual(H.chunkOf(-33,64,64),{cq:-1,cr:1,localQ:31,localR:0});
assert.equal(H.neighbors(0,0).length,6);
for(const tile of scene.tiles){
 const world=H.axialToWorld(tile.q,tile.r);
 assert.deepEqual(H.worldToAxial(world.x,world.y),{q:tile.q,r:tile.r});
 for(let rotation=0;rotation<6;rotation++){
  const camera=H.makeCamera({zoom:37.5,rotation,panX:104,panY:-32});
  const p=H.project(camera,world.x,world.y,960,680);
  const back=H.unproject(camera,p.x,p.y,960,680);
  assert.ok(Math.abs(back.x-world.x)<1e-10&&Math.abs(back.y-world.y)<1e-10);
  assert.deepEqual(H.pick(camera,p.x,p.y,960,680,index),tile);
 }
}
assert.ok(Math.abs(H.ISO_ELEVATION_DEG-35.26438968)<1e-6,'standard isometric elevation');
for(let rotation=0;rotation<6;rotation++){
 const camera=H.makeCamera({rotation,zoom:42});
 const world=H.axialToWorld(0,0),p=H.project(camera,world.x,world.y,1000,800,2);
 assert.deepEqual(H.pick(camera,p.x,p.y,1000,800,raisedIndex),raisedIndex.tileAt(0,0),'elevated surface remains selectable');
 const back=H.unproject(camera,p.x,p.y,1000,800,2);
 assert.ok(Math.hypot(back.x-world.x,back.y-world.y)<1e-9);
}
const raisedCam=H.makeCamera();H.fitScene(raisedCam,raised,640,440);
assert.ok(raisedCam.zoom>=12&&raisedCam.zoom<=180);
assert.equal('tilt' in H.makeCamera({tilt:65}),false,'legacy tilt override must not change a locked view');
const camera=H.makeCamera({rotation:4});H.fitScene(camera,scene,1200,800);
assert.ok(camera.zoom>=12&&camera.zoom<=180);
const old=H.project(camera,2,1,1200,800);camera.tilt=70;
assert.deepEqual(H.project(camera,2,1,1200,800),old,'external tilt mutation must not alter view');
const anchor={x:370,y:300},before=H.unproject(camera,anchor.x,anchor.y,1200,800);
H.setZoomAt(camera,camera.zoom*1.7,anchor.x,anchor.y,1200,800);
const after=H.unproject(camera,anchor.x,anchor.y,1200,800);
assert.ok(Math.hypot(after.x-before.x,after.y-before.y)<1e-9,'cursor anchored zoom');
const raisedAnchor=H.makeCamera({zoom:45,rotation:2});
const rp=H.project(raisedAnchor,0,0,960,680,2);
H.setZoomAt(raisedAnchor,90,rp.x,rp.y,960,680,2);
const rz=H.project(raisedAnchor,0,0,960,680,2);
assert.ok(Math.hypot(rz.x-rp.x,rz.y-rp.y)<1e-9,'zoom anchor remains fixed on raised terrain');
function invalid(m){assert.throws(()=>H.validateScene(m),/Scene:/);}
invalid({...scene,schema:'bogus'});
invalid({...scene,tiles:[scene.tiles[0],scene.tiles[0]]});
invalid({...scene,objects:[...scene.objects,scene.objects[0]]});
invalid({...scene,objects:[{id:'out',kind:'rock',q:200,r:200}]});
invalid({...scene,grid:{...scene.grid,feet_per_step:0}});
invalid({...scene,tiles:[]});
invalid({...scene,tiles:[{q:0,r:0,terrain:'rock',elevation:1.5}]});
invalid({...scene,tiles:[{q:0,r:0,terrain:'rock',elevation:1000}]});
assert.throws(()=>H.chunkOf(0,0,0),/chunk/);
console.log('Hex geometry, scene validation, camera projection, selection and cursor-anchored zoom PASS');
