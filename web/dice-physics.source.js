/* Single authored physics engine. tools/build_physics.py embeds pinned Rapier. */
function createDicePhysics(RAPIER) {
 'use strict';
  const add=(a,b)=>a.map((v,i)=>v+b[i]);
  const sub=(a,b)=>a.map((v,i)=>v-b[i]);
  const scale=(v,s)=>v.map(x=>x*s);
  const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const norm=v=>Math.sqrt(dot(v,v));
  const unit=v=>scale(v,1/(norm(v)||1));
  const quatUnit=q=>scale(q,1/(Math.hypot(...q)||1)); // [w,x,y,z]
  const random=()=>{const a=new Uint32Array(1);crypto.getRandomValues(a);return a[0]/4294967296;};
  function orientation(){ // uniformly oriented quaternion (Shoemake)
    const a=random(),b=2*Math.PI*random(),c=2*Math.PI*random();
    return [Math.sqrt(a)*Math.cos(c),Math.sqrt(1-a)*Math.sin(b),Math.sqrt(1-a)*Math.cos(b),Math.sqrt(a)*Math.sin(c)];
  }
  function rotate(q,v){const u=q.slice(1),t=scale(cross(u,v),2);return add(v,add(scale(t,q[0]),cross(u,t)));}
  function advance(q,w,dt){
    const ang=norm(w)*dt;
    if(ang<1e-10)return q;
    const axis=scale(w,Math.sin(ang/2)/(norm(w)||1));
    const d=[Math.cos(ang/2),...axis];
    return quatUnit([
      d[0]*q[0]-dot(d.slice(1),q.slice(1)),
      ...add(add(scale(q.slice(1),d[0]),scale(d.slice(1),q[0])),cross(d.slice(1),q.slice(1)))
    ]);
  }
  const meshes={};
  function ico(){
    const t=(1+Math.sqrt(5))/2;
    return {v:[[-1,t,0],[1,t,0],[-1,-t,0],[1,-t,0],[0,-1,t],[0,1,t],[0,-1,-t],[0,1,-t],[t,0,-1],[t,0,1],[-t,0,-1],[-t,0,1]].map(unit),
      f:[[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],[3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]]};
  }
  function mesh(s){
    if(meshes[s])return meshes[s];
    let v=[],f=[];
    if(s===4){v=[[1,1,1],[-1,-1,1],[-1,1,-1],[1,-1,-1]].map(unit);f=[[0,1,2],[0,3,1],[0,2,3],[1,3,2]];}
    else if(s===6){v=[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]].map(unit);f=[[4,5,6,7],[0,3,2,1],[0,4,7,3],[1,2,6,5],[3,7,6,2],[0,1,5,4]];}
    else if(s===8){v=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];f=[[4,0,2],[4,2,1],[4,1,3],[4,3,0],[5,2,0],[5,1,2],[5,3,1],[5,0,3]];}
    else if(s===10||s===100){
      // Pentagonal trapezohedron: ten *planar* kite faces.
      // The alternating ring elevation is fixed by the apical height and
      // cos(36deg); arbitrary elevations produce warped quadrilaterals.
      const apex=1.22, c=Math.cos(Math.PI/5), h=apex*(1-c)/(1+c);
      v=[[0,0,apex],[0,0,-apex]];
      for(let i=0;i<10;i++){const a=i*Math.PI/5;v.push([Math.cos(a),Math.sin(a),i%2===0?h:-h]);}
      for(let i=0;i<5;i++){f.push([0,2+2*i,2+(2*i+1)%10,2+(2*i+2)%10]);f.push([1,2+(2*i+3)%10,2+(2*i+2)%10,2+(2*i+1)%10]);}
    }
    else if(s===12){const t=ico();v=t.f.map(face=>unit(face.reduce((sum,i)=>add(sum,t.v[i]),[0,0,0])));
      f=t.v.map((axis,idx)=>{
        const ids=t.f.map((face,i)=>face.includes(idx)?i:-1).filter(i=>i>=0);
        const e=unit(cross(axis,Math.abs(axis[2])>.8?[0,1,0]:[0,0,1])),b=cross(axis,e);
        return ids.sort((a,c)=>Math.atan2(dot(v[a],b),dot(v[a],e))-Math.atan2(dot(v[c],b),dot(v[c],e)));
      });
    } else if(s===20){({v,f}=ico());}
    else throw Error('Unsupported die');
    const faces=f.map((indices)=>{
      const vv=indices.map(i=>v[i]);let n=unit(cross(sub(vv[1],vv[0]),sub(vv[2],vv[0])));
      const centroid=scale(vv.reduce(add,[0,0,0]),1/vv.length);
      if(dot(n,centroid)<0)n=scale(n,-1);
      return {indices,normal:n};
    });
    return meshes[s]={v,f,faces};
  }
  function faceValue(d){
    const shape=mesh(d.sides);
    if(d.sides===4){
      // A tetrahedron rests on a face and is read at its opposite, upper vertex.
      let vertex=0,up=-Infinity;
      shape.v.forEach((v,i)=>{const z=rotate(d.q,v)[2];if(z>up){up=z;vertex=i;}});
      return vertex+1;
    }
    let face=0,up=-Infinity;
    shape.faces.forEach((f,i)=>{const z=rotate(d.q,f.normal)[2];if(z>up){up=z;face=i;}});
    return d.sides===100?(face*10):face+1; // d100: 00,10,...,90, 00 maps to 100 for a full percentile die
  }
  // Mouse/touch targeting must agree with the very same projected faces
  // used by drawDie(), including the d12's irregular visible silhouette.
  function hitTest(d,x,y,width,height,padding=12){
    const shape=mesh(d.sides);
    const perspective=Math.max(.80,Math.min(1.25,1+(d.y-height*.5)*.0005+d.z*.0004));
    const size=d.r*perspective,sy=d.y-d.z*.45;
    const inside=(points)=>{
      let found=false;
      for(let i=0,j=points.length-1;i<points.length;j=i++){
        const a=points[i],b=points[j];
        if((a[1]>y)!==(b[1]>y) && x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])found=!found;
      }
      return found;
    };
    const edgeDistance=(a,b)=>{
      const vx=b[0]-a[0],vy=b[1]-a[1];
      const t=Math.max(0,Math.min(1,((x-a[0])*vx+(y-a[1])*vy)/(vx*vx+vy*vy||1)));
      return Math.hypot(x-a[0]-t*vx,y-a[1]-t*vy);
    };
    for(const f of shape.faces){
      if(rotate(d.q,f.normal)[2]<.02)continue;
      const pts=f.indices.map(i=>{const v=rotate(d.q,shape.v[i]);return [d.x+size*v[0],sy-size*v[1]+size*.20*v[2]];});
      if(inside(pts)||pts.some((p,i)=>edgeDistance(p,pts[(i+1)%pts.length])<=padding))return true;
    }
    return false;
  }
  function makeDie(sides,x,y,r=26){
    const d={sides,x,y,z:r*1.2,r,q:orientation(),v:[0,0,0],w:[0,0,0],sleeping:true,restTime:0,rolling:false,held:false,id:0,group:0};
    d.z=height(d)+.05;
    return d;
  }
  function height(d){return -Math.min(...mesh(d.sides).v.map(v=>rotate(d.q,scale(v,d.r))[2]));}

 const PIXEL=.01,STEP=1/120;
 const MAX_SLING_PULL=480,MAX_SLING_SPEED=2800,MAX_HAND_STEP=.28;
  const HAND_THROW_SOFT_LIMIT=1600;
 const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
 const planeDir=(x,y)=>{const l=Math.hypot(x,y);return l>1e-6?[x/l,y/l]:[0,0];};
 // Single hand target. Ctrl pins a sling origin and caps how far the
 // physical hand anchor may be pulled from it; no second grip/joint.
 function slingVector(originX,originY,x,y){
  const dx=x-originX,dy=y-originY,distance=Math.hypot(dx,dy);
  const power=clamp(distance/MAX_SLING_PULL,0,1);
  const factor=distance>MAX_SLING_PULL?MAX_SLING_PULL/distance:1;
  return {x:originX+dx*factor,y:originY+dy*factor,power};
 }
 const MIN_PUNCH_CHARGE=.15,MAX_PUNCH_RADIUS=187.5;
 // 75% of the previous minimum impulse; 50% of the maximum.
 const MIN_PUNCH_IMPULSE=1.18125,MAX_PUNCH_IMPULSE=2.25;
 const WALL_TOP_PX=40,WALL_HALF_THICKNESS=.08;
 const punchRadius=charge=>MAX_PUNCH_RADIUS*clamp(charge,MIN_PUNCH_CHARGE,1);
 const punchStrength=charge=>{
  const t=(clamp(charge,MIN_PUNCH_CHARGE,1)-MIN_PUNCH_CHARGE)/(1-MIN_PUNCH_CHARGE);
  return MIN_PUNCH_IMPULSE+(MAX_PUNCH_IMPULSE-MIN_PUNCH_IMPULSE)*t;
 };
 // Preserve full force in the inner 75%; the last quarter has a curved,
 // progressively steeper falloff down to 15%, never zero inside radius.
 const punchFalloff=(distance,radius)=>{
  if(!(radius>0))return .15;
  const edge=clamp((distance/radius-.75)/.25,0,1);
  return 1-.85*edge*edge;
 };
 // Opposite mirrored-edge mapping with an overshoot that points inward.
 const mirrorCoordinate=(v,limit)=>v<0?clamp(limit+v,1,limit-1)
  :v>limit?clamp(v-limit,1,limit-1):clamp(limit-v,1,limit-1);
 let world=null,initialized=null,walls=[],extent=[0,0];
 const bodies=new Map(),grips=new Map();
 const pos=d=>({x:d.x*PIXEL,y:d.y*PIXEL,z:d.z*PIXEL});
 const quat=q=>({w:q[0],x:q[1],y:q[2],z:q[3]});
 function init(){
  if(initialized)return initialized;
  initialized=Promise.resolve().then(()=>RAPIER.init()).then(()=>{
   world=new RAPIER.World({x:0,y:0,z:-9.81});world.timestep=STEP;
   world.createCollider(RAPIER.ColliderDesc.cuboid(100,100,.25)
    .setTranslation(0,0,-.25).setFriction(.9).setRestitution(.04)
    .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min));
   // Real wall contacts remain. Dice airborne above the wall may wrap.
   const wall=(hx,hy)=>world.createCollider(
    RAPIER.ColliderDesc.cuboid(hx,hy,WALL_TOP_PX*PIXEL/2)
     .setFriction(.82).setRestitution(.04)
     .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min));
   walls=[wall(WALL_HALF_THICKNESS,100),wall(WALL_HALF_THICKNESS,100),
    wall(100,WALL_HALF_THICKNESS),wall(100,WALL_HALF_THICKNESS)];
  });
  return initialized;
 }
 function setBounds(width,depth){
  if(!(width>0&&depth>0)||extent[0]===width&&extent[1]===depth)return;
  extent=[width,depth];
  const w=width*PIXEL,h=depth*PIXEL,z=WALL_TOP_PX*PIXEL/2;
  walls[0].setTranslation({x:-WALL_HALF_THICKNESS,y:h/2,z});
  walls[1].setTranslation({x:w+WALL_HALF_THICKNESS,y:h/2,z});
  walls[2].setTranslation({x:w/2,y:-WALL_HALF_THICKNESS,z});
  walls[3].setTranslation({x:w/2,y:h+WALL_HALF_THICKNESS,z});
 }
 function mirrorWrap(d,b,width,depth){
  if(d.ready||d.held||width<=2||depth<=2)return;
  const p=b.translation(),x=p.x/PIXEL,y=p.y/PIXEL;
  if(x>=0&&x<=width&&y>=0&&y<=depth)return;
  // Only airborne dice whose lowest vertex clears the wall may wrap.
  const q=b.rotation(),bottom=height({...d,q:[q.w,q.x,q.y,q.z]});
  if(p.z/PIXEL-bottom<WALL_TOP_PX)return;
  // Same Rapier rigid body, preserving velocity, rotation, and spin.
  b.setTranslation({x:mirrorCoordinate(x,width)*PIXEL,
   y:mirrorCoordinate(y,depth)*PIXEL,z:p.z},true);
 }
 function setColliding(d,b){
  const c=b.collider(0),enabled=!d.ready||d.held;
  if(c.isEnabled()!==enabled)c.setEnabled(enabled);
 }
 function body(d){
  if(!world)throw Error('Rapier has not initialized');
  if(bodies.has(d))return bodies.get(d);
  const desc=RAPIER.RigidBodyDesc.dynamic()
   .setTranslation(d.x*PIXEL,d.y*PIXEL,d.z*PIXEL).setRotation(quat(d.q))
   .setLinearDamping(.42).setAngularDamping(1.35)
   .setCcdEnabled(true).setAdditionalSolverIterations(4);
  const b=world.createRigidBody(desc);
  const points=new Float32Array(mesh(d.sides).v.flatMap(v=>v.map(n=>n*d.r*PIXEL)));
  const collider=RAPIER.ColliderDesc.convexHull(points);
  if(!collider)throw Error('Invalid die polyhedron: d'+d.sides);
  world.createCollider(collider.setFriction(.83).setRestitution(.12)
   .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min).setMass(.18),b);
  bodies.set(d,b);setColliding(d,b);
  if(d.ready&&!d.held)b.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased,true);
  else if(d.sleeping)b.sleep();
  return b;
 }
 function sync(d,b){
  const p=b.translation(),q=b.rotation(),v=b.linvel(),w=b.angvel();
  d.x=p.x/PIXEL;d.y=p.y/PIXEL;d.z=p.z/PIXEL;
  d.q=[q.w,q.x,q.y,q.z];
  d.v=[v.x/PIXEL,v.y/PIXEL,v.z/PIXEL];d.w=[w.x,w.y,w.z];
  d.sleeping=d.held?false:b.isSleeping();d.rolling=!d.held&&!d.sleeping;
 }
 function endGrip(d){
  const g=grips.get(d);if(!g)return;
  // Restore baseline rotational response on every exit: drop, cancel,
  // character switch, or ordinary release.
  const b=bodies.get(d);if(b){b.setAngularDamping(1.35);b.setLinearDamping(.42);}
  world.removeImpulseJoint(g.joint,true);
  world.removeRigidBody(g.anchor);
  grips.delete(d);
 }
 // Explicit reposition for previews/recovery. A live held die is never teleported.
 function park(d){
  endGrip(d);
  const b=body(d),preview=d.ready&&!d.held;
  setColliding(d,b);
  b.setBodyType(preview?RAPIER.RigidBodyType.KinematicPositionBased:RAPIER.RigidBodyType.Dynamic,true);
  b.setTranslation(pos(d),true);b.setRotation(quat(d.q),true);
  if(preview){b.setNextKinematicTranslation(pos(d));return;}
  b.setLinvel({x:d.v[0]*PIXEL,y:d.v[1]*PIXEL,z:d.v[2]*PIXEL},true);
  b.setAngvel({x:d.w[0],y:d.w[1],z:d.w[2]},true);
  if(d.sleeping)b.sleep();
 }
 function grab(d,x=d.x,y=d.y,lift=.35){
  if(grips.has(d))return;
  // Previews follow the cursor before being physically grabbed.
  park(d);d.held=true;d.sleeping=false;
  const b=body(d);
  setColliding(d,b);
  b.setBodyType(RAPIER.RigidBodyType.Dynamic,true);
  b.wakeUp();
  // Central grip avoids eccentric spring torque that made dice orbit or
  // wobble around the pointer long after the pointer stopped.
  const local={x:0,y:0,z:0};
  const off=rotate(d.q,[local.x/PIXEL,local.y/PIXEL,local.z/PIXEL]);
  const anchor=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased()
   .setTranslation((d.x+off[0])*PIXEL,(d.y+off[1])*PIXEL,(d.z+off[2])*PIXEL));
  b.setAngularDamping(12);b.setLinearDamping(8);
  // Compliant damped spring permits a little hand-to-die lag.
  const joint=world.createImpulseJoint(
   RAPIER.JointData.spring(0,1100,38,{x:0,y:0,z:0},local),anchor,b,true);
  // Fixed support reference avoids an orientation→hand-position feedback loop.
  grips.set(d,{anchor,joint,offset:off,support:height(d),target:anchor.translation()});
  moveGrip(d,x,y,lift);
 }
 function moveGrip(d,x,y,lift=.35){
  const g=grips.get(d);if(!g)return;
  // Height 0 keeps the die on the table; height 1 lifts five die radii.
  const z=g.support+clamp(lift,0,1)*d.r*5;
  g.target={x:(x+g.offset[0])*PIXEL,y:(y+g.offset[1])*PIXEL,
   z:Math.max(d.r*.2,z+g.offset[2])*PIXEL};
 }
 function releaseVelocity(b,vx,vy,settings={}){
  const angle=clamp(Number(settings.angleDeg)||0,-45,45)*Math.PI/180;
  // A real hand toss retains low-speed precision but compresses very fast flicks
   // smoothly, without a hard cut-off or scripted forces after release.
   // Ctrl slingshot and programmatic launches retain their normal launch speed.
   const rawSpeed=Math.hypot(vx,vy);
   const speed=settings.sling?Math.min(MAX_SLING_SPEED,rawSpeed):
    settings.handThrow?HAND_THROW_SOFT_LIMIT*Math.tanh(rawSpeed/HAND_THROW_SOFT_LIMIT):rawSpeed;
  const dir=planeDir(vx,vy);
  b.setLinvel({x:dir[0]*speed*Math.cos(angle)*PIXEL,
   y:dir[1]*speed*Math.cos(angle)*PIXEL,z:speed*Math.sin(angle)*PIXEL},true);
  const spin=clamp(Number(settings.spin)||0,-1,1);
  if(spin&&speed>1){
   const w=b.angvel(),turn=spin*18;
   // One-time forward/backspin boost as the die leaves the hand.
   // Rapier alone owns subsequent spin, impacts, friction and settling.
   // Restore the earlier vertical sign (v0.59 inverted this incorrectly).
   b.setAngvel({x:w.x-dir[1]*turn,y:w.y+dir[0]*turn,z:w.z},true);
  }
 }
 function release(d,vx=0,vy=0,settings={}){
  const b=body(d);
  endGrip(d);
  d.held=false;d.ready=false;d.sleeping=false;d.rolling=true;
  setColliding(d,b);
  if(settings.sling){
   const s=settings.sling;
   const pulled=slingVector(s.anchorX,s.anchorY,s.fromX,s.fromY);
   const dx=s.anchorX-pulled.x,dy=s.anchorY-pulled.y;
   const dir=planeDir(dx,dy);
   vx=dir[0]*pulled.power*MAX_SLING_SPEED;
   vy=dir[1]*pulled.power*MAX_SLING_SPEED;
  }
  releaseVelocity(b,vx,vy,settings);
  sync(d,b);
 }
 function launch(d,vx=0,vy=0,shake=0,settings={}){
  endGrip(d);
  d.ready=false;d.held=false;d.sleeping=false;d.rolling=true;
  const lift=Number.isFinite(settings.height)?settings.height:.35;
  d.z=height(d)+d.r*5*clamp(lift,0,1);
  d.v=[0,0,0];d.w=[0,0,0];
  park(d);releaseVelocity(body(d),vx,vy,{angleDeg:settings.angleDeg??15,spin:settings.spin??0});
  sync(d,body(d));
 }
 function punch(dice,x,y,charge=1){
  const level=clamp(charge,MIN_PUNCH_CHARGE,1),radius=punchRadius(level);
  let hits=0;
  for(const d of dice){
   if(d.ready||d.held)continue;
   const dx=d.x-x,dy=d.y-y,l=Math.hypot(dx,dy);
   if(l>radius)continue;
   const dir=l>1?planeDir(dx,dy):[1,0],power=punchStrength(level)*punchFalloff(l,radius);
   const b=body(d),p=b.translation();
   b.applyImpulseAtPoint({x:dir[0]*power,y:dir[1]*power,z:power*.12},
    {x:p.x,y:p.y,z:p.z+d.r*PIXEL*.22},true);
   hits++;
  }
  return hits;
 }
 function stepWorld(dice,dt,width,heightLimit){
  if(!world)throw Error('Rapier has not initialized');
  setBounds(width,heightLimit);
  const present=new Set(dice);
  for(const [d,b] of bodies)if(!present.has(d)){
   endGrip(d);world.removeRigidBody(b);bodies.delete(d);
  }
  for(const d of dice){
   const b=body(d),preview=d.ready&&!d.held;
   setColliding(d,b);
   if(preview){
    if(b.bodyType()!==RAPIER.RigidBodyType.KinematicPositionBased)
     b.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased,true);
    b.setNextKinematicTranslation(pos(d));
   }else if(b.bodyType()!==RAPIER.RigidBodyType.Dynamic)
    b.setBodyType(RAPIER.RigidBodyType.Dynamic,true);
  }
  // Limit per-step hand motion. A large mouse flick must not inject an
  // unbounded kinematic velocity into a small spring-attached die.
  for(const g of grips.values()){
   const now=g.anchor.translation(),delta={
    x:g.target.x-now.x,y:g.target.y-now.y,z:g.target.z-now.z};
   const length=Math.hypot(delta.x,delta.y,delta.z);
   const amount=length>MAX_HAND_STEP?MAX_HAND_STEP/length:1;
   g.anchor.setNextKinematicTranslation({
    x:now.x+delta.x*amount,y:now.y+delta.y*amount,
    z:now.z+delta.z*amount});
  }
  world.step();
  for(const d of dice){
   const b=bodies.get(d);
   mirrorWrap(d,b,width,heightLimit);
   if(!d.ready||d.held)sync(d,b);
  }
 }
 return {init,mesh,rotate,advance,orientation,faceValue,makeDie,launch,release,
  grab,moveGrip,park,punch,punchRadius,punchStrength,punchFalloff,
  MIN_PUNCH_CHARGE,WALL_TOP_PX,slingVector,stepWorld,height,hitTest,random};
}
