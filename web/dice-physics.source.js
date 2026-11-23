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

 const PIXEL=.01;
 let world=null,initialized=null,walls=[],extent=[0,0];
 const bodies=new Map();
 const vec=d=>({x:d.x*PIXEL,y:d.y*PIXEL,z:d.z*PIXEL});
 const rot=q=>({w:q[0],x:q[1],y:q[2],z:q[3]});
 function init(){
  if(initialized)return initialized;
  initialized=Promise.resolve().then(()=>RAPIER.init()).then(()=>{
   world=new RAPIER.World({x:0,y:0,z:-9.81});world.timestep=1/120;
   world.createCollider(RAPIER.ColliderDesc.cuboid(100,100,.25).setTranslation(0,0,-.25).setFriction(.8).setRestitution(.2));
   const wall=(x,y)=>world.createCollider(RAPIER.ColliderDesc.cuboid(x,y,1.6).setFriction(.7).setRestitution(.3));
   walls=[wall(.1,100),wall(.1,100),wall(100,.1),wall(100,.1)];
  });
  return initialized;
 }
 function setBounds(width,height){
  if(!width||!height||extent[0]===width&&extent[1]===height)return;
  extent=[width,height];const w=width*PIXEL,h=height*PIXEL;
  walls[0].setTranslation({x:-.1,y:h/2,z:1.5});
  walls[1].setTranslation({x:w+.1,y:h/2,z:1.5});
  walls[2].setTranslation({x:w/2,y:-.1,z:1.5});
  walls[3].setTranslation({x:w/2,y:h+.1,z:1.5});
 }
 function body(d){
  if(!world)throw Error('Rapier has not initialized.');
  if(bodies.has(d))return bodies.get(d);
  const desc=RAPIER.RigidBodyDesc.dynamic().setTranslation(d.x*PIXEL,d.y*PIXEL,d.z*PIXEL)
   .setRotation(rot(d.q)).setLinearDamping(.35).setAngularDamping(1.2).setCcdEnabled(true);
  const b=world.createRigidBody(desc);
  const points=new Float32Array(mesh(d.sides).v.flatMap(v=>v.map(n=>n*d.r*PIXEL)));
  const collider=RAPIER.ColliderDesc.convexHull(points);
  if(!collider)throw Error('Convex geometry invalid: d'+d.sides);
  world.createCollider(collider.setFriction(.78).setRestitution(.27).setMass(.18),b);
  bodies.set(d,b);
  if(d.held||d.ready)b.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased,true);
  else if(d.sleeping)b.sleep();
  return b;
 }
 function park(d){
  const b=body(d),held=d.held||d.ready;
  b.setBodyType(held?RAPIER.RigidBodyType.KinematicPositionBased:RAPIER.RigidBodyType.Dynamic,true);
  b.setTranslation(vec(d),true);b.setRotation(rot(d.q),true);
  if(held){b.setNextKinematicTranslation(vec(d));return;}
  b.setLinvel({x:d.v[0]*PIXEL,y:d.v[1]*PIXEL,z:d.v[2]*PIXEL},true);
  b.setAngvel({x:d.w[0],y:d.w[1],z:d.w[2]},true);
  if(d.sleeping)b.sleep();
 }
 function launch(d,vx,vy,shake=0){
  d.z=height(d)+55;d.v=[vx,vy,270+random()*150];
  const roll=.6/d.r,variation=Math.min(7,2+Math.max(0,shake)*.014);
  d.w=[-vy*roll+(random()-.5)*variation,vx*roll+(random()-.5)*variation,(random()-.5)*variation];
  d.held=false;d.ready=false;d.sleeping=false;d.rolling=true;d.restTime=0;
  park(d);
 }
 function stepWorld(dice,dt,width,heightLimit){
  if(!world)throw Error('Rapier has not initialized.');
  setBounds(width,heightLimit);
  const present=new Set(dice);
  for(const [d,b] of bodies)if(!present.has(d)){world.removeRigidBody(b);bodies.delete(d);}
  for(const d of dice){
   const b=body(d);
   if(d.held||d.ready){
    if(b.bodyType()!==RAPIER.RigidBodyType.KinematicPositionBased)b.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased,true);
    b.setNextKinematicTranslation(vec(d));
   }else if(b.bodyType()!==RAPIER.RigidBodyType.Dynamic)park(d);
  }
  world.step();
  for(const d of dice){
   if(d.held||d.ready)continue;
   const b=bodies.get(d),p=b.translation(),q=b.rotation(),v=b.linvel(),w=b.angvel();
   d.x=p.x/PIXEL;d.y=p.y/PIXEL;d.z=p.z/PIXEL;
   d.q=[q.w,q.x,q.y,q.z];d.v=[v.x/PIXEL,v.y/PIXEL,v.z/PIXEL];d.w=[w.x,w.y,w.z];
   d.sleeping=b.isSleeping();d.rolling=!d.sleeping;
  }
 }
 return {init,mesh,rotate,advance,orientation,faceValue,makeDie,launch,stepWorld,park,height,hitTest,random};
}
