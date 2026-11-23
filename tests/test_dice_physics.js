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
held.x=origin.x-85;held.ready=false;DP.grab(held,held.x,held.y,0);
let transferred=false;
for(let i=0;i<70;i++){
 DP.moveGrip(held,origin.x-85+(i+1)*2.5,origin.y,0);
 DP.stepWorld([held,resting],1/120,540,470);
 if(Math.hypot(resting.x-origin.x,resting.y-origin.y)>4)transferred=true;
}
assert.ok(transferred,'Dragged die did not push a resting d20');
DP.release(held,160,0,{angleDeg:0,spin:0});
for(let i=0;i<1200;i++)DP.stepWorld([held,resting],1/120,540,470);
assert.ok(held.sleeping&&resting.sleeping,'Both interacting dice should settle');
// A fast mouse shake must converge to the real hand target, without a lasting
// orbital spin around the pointer. Releasing/canceling restores normal damping.
const shake=DP.makeDie(6,260,200);
DP.grab(shake,260,200,.8);
for(let i=0;i<30;i++){
 DP.moveGrip(shake,i%2?455:65,i%3?290:100,.8);
 DP.stepWorld([shake],1/120,550,450);
}
for(let i=0;i<300;i++){
 DP.moveGrip(shake,260,200,.8);
 DP.stepWorld([shake],1/120,550,450);
}
assert.ok(Math.hypot(shake.x-260,shake.y-200)<16,'Held die keeps orbiting instead of approaching hand target');
assert.ok(Math.hypot(...shake.w)<4,'Shake angular momentum fails to damp while holding: '+Math.hypot(...shake.w).toFixed(2)+' rad/s');
shake.held=false;shake.ready=false;shake.sleeping=true;shake.v=[0,0,0];shake.w=[0,0,0];
DP.park(shake); // Must detach the joint and restore default rotational damping.
DP.launch(shake,240,0,0,{angleDeg:0,spin:1});
assert.ok(shake.w[1]>0,'Canceling the grip must not reverse or suppress the next throw');
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
DP.launch(right,500,0,0,{angleDeg:0,spin:1});
DP.launch(left,-500,0,0,{angleDeg:0,spin:1});
assert.ok(right.w[1]>0&&left.w[1]<0,'positive spin must roll forward relative to travel');
assert.ok(right.v[0]-right.w[1]*right.r<right.v[0],
 'forward spin must oppose ground-contact slip (up cross travel)');
const back=DP.makeDie(6,180,170);
DP.launch(back,500,0,0,{angleDeg:0,spin:-1});
assert.ok(back.w[1]<0,'negative spin must create backspin against the direction of travel');
const neutral=DP.makeDie(6,180,170);
DP.launch(neutral,500,0,0,{angleDeg:0,spin:0});
assert.ok(Math.hypot(...neutral.w)<.001,'zero spin must not add arbitrary rotation');
const screenUp=DP.makeDie(6,190,180),screenDown=DP.makeDie(6,230,180);
DP.launch(screenUp,0,-300,0,{angleDeg:25,spin:1});
DP.launch(screenDown,0,300,0,{angleDeg:-25,spin:1});
assert.ok(screenUp.w[0]<0&&screenDown.w[0]>0,
 'positive spin for screen up/down throws must have the corrected pitch sign');
const screenBack=DP.makeDie(6,270,180);
DP.launch(screenBack,0,-300,0,{angleDeg:25,spin:-1});
assert.ok(screenBack.w[0]>0,'screen-up backspin must reverse the new forward pitch');
const up=DP.makeDie(8,200,160),down=DP.makeDie(8,200,160);
DP.launch(up,240,0,0,{angleDeg:45,height:1});
DP.launch(down,240,0,0,{angleDeg:-45,height:0});
assert.ok(up.v[2]>0&&down.v[2]<0,'positive and negative throw angles change vertical velocity');
assert.ok(up.z>down.z+100,'height 1 must start substantially above height 0');
const sling=DP.makeDie(6,110,160);
DP.grab(sling,sling.x,sling.y,.5);
DP.release(sling,0,0,{angleDeg:0,spin:0,sling:{anchorX:220,anchorY:160,fromX:130,fromY:160}});
assert.ok(sling.v[0]>480&&sling.v[0]<560&&Math.abs(sling.v[1])<1,'90px slingshot pull maps proportionally onto 480px cap');
const halfPull=DP.slingVector(100,100,340,100);
const cappedPull=DP.slingVector(100,100,800,100);
assert.equal(halfPull.power,.5,'240px is half the 480px slingshot pull');
assert.equal(cappedPull.power,1,'slingshot power caps at 1.0');
assert.equal(cappedPull.x,580,'the physical hand target stops at the 480px tether length');
const maxSling=DP.makeDie(6,130,230);
DP.grab(maxSling,130,230,.5);
DP.release(maxSling,0,0,{angleDeg:0,spin:0,sling:{anchorX:300,anchorY:230,fromX:-300,fromY:230}});
assert.ok(maxSling.v[0]>2600&&maxSling.v[0]<2900,'full slingshot launches at twice the old 1400px/s cap');
const angledSling=DP.makeDie(6,200,120);
DP.grab(angledSling,200,120,.8);
DP.release(angledSling,0,0,{angleDeg:30,spin:-1,
 sling:{anchorX:250,anchorY:120,fromX:-350,fromY:120}});
assert.ok(angledSling.v[2]>0&&angledSling.w[1]<0,
 'slingshot release must apply the same launch angle and backspin as normal throws');
const clipped=DP.makeDie(8,215,175);
DP.launch(clipped,400,0,0,{angleDeg:85,spin:0});
assert.ok(Math.abs(clipped.v[2]-clipped.v[0])<.001,
 'launch angles above +45° must clamp to +45°');
const clippedDown=DP.makeDie(8,215,175);
DP.launch(clippedDown,400,0,0,{angleDeg:-85,spin:0});
assert.ok(Math.abs(clippedDown.v[2]+clippedDown.v[0])<.001,
 'launch angles below -45° must clamp to -45°');
const punched=DP.makeDie(6,250,250,28);
DP.launch(punched,0,0,0,{angleDeg:0,height:0});
for(let i=0;i<260;i++)DP.stepWorld([punched],1/120,540,470);
const n=DP.punch([punched],200,250,1);
assert.equal(n,1,'force punch must affect nearby dynamic dice');
DP.stepWorld([punched],1/120,540,470);
assert.ok(punched.v[0]>0,'radial impulse must move die away from click');
assert.equal(DP.MIN_PUNCH_CHARGE,.15,'quick punch starts at 15% charge');
assert.ok(Math.abs(DP.punchRadius(.15)-DP.punchRadius(1)*.15)<1e-8,
 'the physical radius must scale linearly with charge from 15% to 100%');
assert.ok(Math.abs(DP.punchStrength(.15)-1.18125)<1e-8,
 'minimum charged impulse is 75% of previous quick click');
assert.ok(Math.abs(DP.punchStrength(1)-2.25)<1e-8,
 'maximum charged impulse is half of previous full charge');
assert.equal(DP.punchFalloff(0,100),1,'center retains full charged power');
assert.equal(DP.punchFalloff(75,100),1,'inner 75% has no attenuation');
assert.ok(DP.punchFalloff(90,100)>.65&&DP.punchFalloff(95,100)<.5,
 'the outer quarter contains the curved power reduction');
assert.ok(DP.punchFalloff(99,100)>.15&&DP.punchFalloff(99,100)<.25,
 'power drops fastest near the outer edge');
assert.ok(Math.abs(DP.punchFalloff(100,100)-.15)<1e-9,
 'edge hit must retain at least 15% of charged strength');
const weak=DP.makeDie(6,240,240),strong=DP.makeDie(6,400,360);
DP.launch(weak,0,0,0,{height:1,angleDeg:0,spin:0});
DP.launch(strong,0,0,0,{height:1,angleDeg:0,spin:0});
assert.equal(DP.punch([weak],230,240,.15),1,'minimum radius must still affect close dice');
assert.equal(DP.punch([strong],390,360,1),1,'full radius must affect close dice');
DP.stepWorld([weak,strong],1/120,550,450);
assert.ok(strong.v[0]>weak.v[0]*1.7,
 'full charge should exceed quick pulse using the softened force mapping');
// Only dice genuinely airborne above the physical wall top may wrap.
// Bottom-left vault maps to top-right; bottom-right vault to top-left.
for(const spec of [{x:-8,y:458,vx:-360,vy:260,side:'left'},
 {x:558,y:458,vx:360,vy:260,side:'right'}]){
 const traveler=DP.makeDie(8,spec.x,spec.y,24);
 traveler.z=140;traveler.v=[spec.vx,spec.vy,45];traveler.w=[1,2,3];
 traveler.sleeping=false;traveler.ready=false;
 DP.park(traveler);DP.stepWorld([traveler],1/120,550,450);
 assert.ok(traveler.y>0&&traveler.y<25,'bottom exit must return near the top');
 assert.ok(spec.side==='left'?traveler.x>525:traveler.x<25,
  'mirrored corner reentry must land on the opposing side');
 assert.ok(Math.sign(traveler.v[0])===Math.sign(spec.vx)
   &&Math.sign(traveler.v[1])===Math.sign(spec.vy),
  'edge wrap must preserve the horizontal velocity direction');
 assert.ok(Math.abs(traveler.w[1]-2)<.3,
  'edge wrap must preserve angular velocity aside from normal damping');
}
// A short, low throw collides with the real wall, not the wrap boundary.
const wallDie=DP.makeDie(6,74,190,24);
DP.launch(wallDie,-180,0,0,{angleDeg:0,spin:0,height:0});
for(let i=0;i<160;i++)DP.stepWorld([wallDie],1/120,550,450);
assert.ok(wallDie.x>0&&wallDie.x<220,
 'low throw must remain inside the tray after colliding with its wall');
const groundedOutside=DP.makeDie(6,-8,245,24);
groundedOutside.z=DP.height(groundedOutside);groundedOutside.v=[0,0,0];
DP.park(groundedOutside);
DP.stepWorld([groundedOutside],1/120,550,450);
assert.ok(groundedOutside.x<100,
 'an object that has not cleared wall top must never teleport');
const fastHand=DP.makeDie(6,140,140);
DP.grab(fastHand,140,140,.7);
DP.moveGrip(fastHand,430,140,.7);
for(let i=0;i<20;i++)DP.stepWorld([fastHand],1/120,550,450);
assert.ok(Math.abs(fastHand.x-430)<70,
 'default hand should track a 290px movement within 20 physics frames');
for(let i=0;i<160;i++)DP.stepWorld([fastHand],1/120,550,450);
assert.ok(Math.abs(fastHand.x-430)<12&&Math.abs(fastHand.v[0])<25,
 'hand spring must settle at cursor without lingering oscillation: offset='+
 Math.abs(fastHand.x-430).toFixed(2)+' px, vx='+fastHand.v[0].toFixed(2)+' px/s');
console.log('dice physics tests passed');
}
main().catch(error=>{console.error(error);process.exitCode=1});
