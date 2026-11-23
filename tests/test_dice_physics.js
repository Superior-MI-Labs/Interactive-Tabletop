/* No dependencies: run with `node tests/test_dice_physics.js`. */
'use strict';
const assert=require('node:assert/strict');
const DP=require('../web/dice-physics.js');
async function main(){
 await DP.init();
for(const sides of [4,6,8,10,12,20,100]){
 const mesh=DP.mesh(sides);
 // Convex die faces must be planar and form a closed two-manifold.
 const edges=new Map();
 for(const face of mesh.faces){
  const heights=face.indices.map(i=>mesh.v[i].reduce((sum,v,axis)=>sum+v*face.normal[axis],0));
  assert.ok(Math.max(...heights)-Math.min(...heights)<1e-7,`d${sides} has a warped face`);
  const centroid=face.indices.reduce((sum,i)=>sum.map((v,k)=>v+mesh.v[i][k]),[0,0,0]).map(v=>v/face.indices.length);
  assert.ok(centroid.reduce((sum,v,k)=>sum+v*face.normal[k],0)>0,`d${sides} has inward facing face`);
  for(let i=0;i<face.indices.length;i++){
   const edge=[face.indices[i],face.indices[(i+1)%face.indices.length]].sort((a,b)=>a-b).join('-');
   edges.set(edge,(edges.get(edge)||0)+1);
  }
 }
 for(const count of edges.values())assert.equal(count,2,`d${sides} has non-manifold edges`);
 assert.equal(mesh.faces.length,sides===100?10:sides);
 const d=DP.makeDie(sides,190,220);
 DP.launch(d,150,90,115);
 assert.equal(d.sleeping,false);
 let steps=0;
 while(!d.sleeping&&steps<2400){DP.stepWorld([d],1/120,550,450);steps++;}
 assert.ok(d.sleeping,`d${sides} did not reach a resting state`);
 assert.ok(steps>24,`d${sides} stopped immediately`);
 const supportGap=Math.abs(d.z-DP.height(d));
 assert.ok(supportGap<d.r*.12,`d${sides} ground contact mismatch: ${supportGap.toFixed(3)}px`);
 assert.ok(Math.min(...mesh.faces.map(f=>DP.rotate(d.q,f.normal)[2]))<-.985,`d${sides} stopped on an edge rather than a supporting face`);
 const face=DP.faceValue(d);
 assert.ok(sides===100?(face>=0&&face<=90&&face%10===0):(face>=1&&face<=sides),`d${sides} face invalid: ${face}`);
}
// Two dice need to bounce rather than overlap indefinitely.
const a=DP.makeDie(6,180,170),b=DP.makeDie(8,220,170);
DP.launch(a,200,40,30);DP.launch(b,-180,40,30);
for(let i=0;i<1400;i++)DP.stepWorld([a,b],1/120,500,400);
assert.ok(a.sleeping&&b.sleeping,'Collision group did not settle');
assert.ok(Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)>15,'Dice should not occupy the same location');
// Held dice must interact physically with stationary dynamic dice: drag into
// a resting d20 and assert that the real contact solver moves it.
const resting=DP.makeDie(20,255,240,32);
// Let the body find its own physical rest before measuring external impulses.
DP.launch(resting,0,0,0);
for(let i=0;i<1200&&!resting.sleeping;i++)DP.stepWorld([resting],1/120,540,470);
assert.ok(resting.sleeping,'Target d20 did not reach physical rest');
const origin={x:resting.x,y:resting.y};
const held=DP.makeDie(6,origin.x-85,origin.y,32);
// A cursor-follow preview must be non-colliding even when visually overlapping.
held.ready=true;held.held=false;DP.park(held);
for(let i=0;i<70;i++){held.x+=2.5;DP.stepWorld([held,resting],1/120,540,470);}
const drift=Math.hypot(resting.x-origin.x,resting.y-origin.y);
assert.ok(drift<1,'Cursor-follow preview disturbed a settled d20 by '+drift.toFixed(2)+' px');
// Grabbing that same die enables convex contact and momentum transfer.
held.x=origin.x-85;held.ready=false;held.held=true;DP.park(held);
let transferred=false;
for(let i=0;i<70;i++){
 held.x+=2.5;DP.stepWorld([held,resting],1/120,540,470);
 if(Math.hypot(resting.x-origin.x,resting.y-origin.y)>4)transferred=true;
}
assert.ok(transferred,'Dragged die did not push a resting d20');
held.held=false;DP.launch(held,160,0,80);
for(let i=0;i<1200;i++)DP.stepWorld([held,resting],1/120,540,470);
assert.ok(held.sleeping&&resting.sleeping,'Both interacting dice should settle');
// A tetrahedral d4 reads its upper vertex; tiny resting motion keeps that value.
const tetra=DP.mesh(4);
for(let i=0;i<tetra.v.length;i++){
 const v=tetra.v[i],cross=[v[1],-v[0],0];
 const raw=[1+v[2],...cross],len=Math.hypot(...raw);
 const d=DP.makeDie(4,200,200);
 d.q=raw.map(n=>n/len);d.z=DP.height(d);
 assert.equal(DP.faceValue(d),i+1,'d4 vertex identity');
 const value=DP.faceValue(d);
 d.q=DP.advance(d.q,[0,1,0],.001);
 assert.equal(DP.faceValue(d),value,'small resting wobble changes d4 value');
}
// Angular velocity changes sign with flick direction, before any collision.
const right=DP.makeDie(6,180,170),left=DP.makeDie(6,180,170);
DP.launch(right,500,0,0);DP.launch(left,-500,0,0);
assert.ok(right.w[1]>0&&left.w[1]<0,'flick direction does not control spin');
console.log('dice physics tests passed');
}
main().catch(error=>{console.error(error);process.exitCode=1});
