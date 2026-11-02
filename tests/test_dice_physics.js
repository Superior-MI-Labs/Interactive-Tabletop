/* No dependencies: run with `node tests/test_dice_physics.js`. */
'use strict';
const assert=require('node:assert/strict');
const DP=require('../web/dice-physics.js');
for(const sidesof [4,6,8,10,12,20,100]){
 const mesh=DP.mesh(sides);
 // Convex die faces must be planar and form a closed two-manifold.
 const edges=new Map();
 for(const face of mesh.faces){
  constheights=face.indices.map(i=>mesh.v[i].reduce((sum,v,axis)=>sum+v*face.normal[axis],0));
  assert.ok(Math.max(...heights)-Math.min(...heights)<1e-7,`d${sides} has a warped face`);
  constcentroid=face.indices.reduce((sum,i)=>sum.map((v,k)=>v+mesh.v[i][k]),[0,0,0]).map(v=>v/face.indices.length);
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
 while(!d.sleeping&&steps<1500){DP.step(d,1/120,550,450);steps++;}
assert.ok(d.sleeping,`d${sides} did not reach a resting state`);
 assert.ok(steps>100,`d${sides} stopped immediately`);
 assert.ok(Math.abs(d.z-DP.height(d))<.001,`d${sides} does not rest on its physical support`);
 const face=DP.faceValue(d);
assert.ok(sides===100?(face>=0&&face<=90&&face%10===0):(face>=1&&face<=sides),`d${sides} face invalid: ${face}`);
}
// Two dice need to bounce rather than overlap indefinitely.
consta=DP.makeDie(6,180,170),b=DP.makeDie(8,220,170);
DP.launch(a,200,40,30);DP.launch(b,-180,40,30);
for(let i=0;i<1000;i++){DP.step(a,1/120,500,400);DP.step(b,1/120,500,400);DP.collide([a,b]);}
assert.ok(a.sleeping&&b.sleeping,'Collision group did notsettle');
assert.ok(Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)>a.r+b.r-2,'Dice still penetrate');
console.log('dice physics tests passed');
