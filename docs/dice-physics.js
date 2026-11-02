/* Self-contained convex dice motion. Visual die orientation and reported face share
 * one physical state. Fixed-step integration, impulse contacts, rolling friction,
 * and energy-based sleep; no clock deadline or predetermined roll values.
 * Not an industrial-grade rigid body solver: polyhedral inertia is approximated.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DicePhysics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
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
  function launch(d,vx,vy,spin){
    d.z=height(d)+55;
    d.v=[vx,vy,270+random()*150];
    d.w=[(random()-.5)*8+spin*.03,(random()-.5)*8+spin*.035,(random()-.5)*9];
    d.sleeping=false;d.restTime=0;d.rolling=true;d.held=false;
  }
  const G=1040;
  function step(d,dt,width,heightLimit){
    if(d.sleeping||d.held)return;
    dt=Math.min(dt,1/60);
    d.v[2]-=G*dt;
    d.x+=d.v[0]*dt;d.y+=d.v[1]*dt;d.z+=d.v[2]*dt;
    d.q=advance(d.q,d.w,dt);
    const damp=Math.exp(-.30*dt);d.v=scale(d.v,damp);d.w=scale(d.w,Math.exp(-.65*dt));
    // Sphere-bounded tray walls. Each collision redirects momentum.
    for(let axis=0;axis<2;axis++){
      const key=axis===0?'x':'y',max=axis===0?width:heightLimit;
      const v=d[key];
      if(v<d.r||v>max-d.r){d[key]=Math.max(d.r,Math.min(max-d.r,v));d.v[axis]*=-.46;d.w[1-axis]+=(random()-.5)*1.1;}
    }
    const floor=height(d),gap=d.z-floor;
    if(gap<=.03){
      d.z=floor;
      // Contact point is the lowest polyhedron vertex in world space.
      const verts=mesh(d.sides).v.map(v=>rotate(d.q,scale(v,d.r)));
      const contact=verts.reduce((a,b)=>b[2]<a[2]?b:a);
      const pointV=add(d.v,cross(d.w,contact));
      const vn=pointV[2];
      if(vn<0){
        const n=[0,0,1],lever=cross(contact,n);
        const inverseInertia=2.5/(d.r*d.r);
        const denom=1+inverseInertia*dot(lever,lever);
        const bounce=vn<-65?.30:0;
        const j=-(1+bounce)*vn/denom;
        const impulse=scale(n,j);
        d.v=add(d.v,impulse);d.w=add(d.w,scale(cross(contact,impulse),inverseInertia));
        // Floor tangential friction applies an angular impulse, letting polyhedra roll.
        const tangent=[pointV[0],pointV[1],0];const tmag=norm(tangent);
        if(tmag>0.01){const t=scale(tangent,1/tmag),lt=cross(contact,t);
          const jt=Math.min(.62*j,tmag/(1+inverseInertia*dot(lt,lt)));
          const f=scale(t,-jt);d.v=add(d.v,f);d.w=add(d.w,scale(cross(contact,f),inverseInertia));
        }
      }
      // Contact damping models a felt-lined tray and eventually permits genuine rest.
      d.v[0]*=Math.exp(-3.4*dt);d.v[1]*=Math.exp(-3.4*dt);
      d.w=scale(d.w,Math.exp(-4.5*dt));
      if(Math.abs(d.v[2])<6)d.v[2]=0;
      if(norm(d.v)<25&&norm(d.w)<.85)d.restTime+=dt;else d.restTime=0;
      if(d.restTime>.65){d.sleeping=true;d.rolling=false;d.v=[0,0,0];d.w=[0,0,0];d.z=height(d);}
    }else d.restTime=0;
  }
  function collide(dice){
    // Broad-sphere collision between moving dice. Cheap and stable at table scale.
    for(let i=0;i<dice.length;i++)for(let j=i+1;j<dice.length;j++){
      const a=dice[i],b=dice[j];if(a.held||b.held||(a.sleeping&&b.sleeping))continue;
      const delta=[b.x-a.x,b.y-a.y,b.z-a.z],dist=norm(delta)||1,penetration=a.r+b.r-dist;
      if(penetration<=0)continue;
      const n=scale(delta,1/dist),movA=a.sleeping?0:1,movB=b.sleeping?0:1;
      if(!movA){a.sleeping=false;a.rolling=true;a.restTime=0;}
      if(!movB){b.sleeping=false;b.rolling=true;b.restTime=0;}
      a.x-=n[0]*penetration*.5;b.x+=n[0]*penetration*.5;
      a.y-=n[1]*penetration*.5;b.y+=n[1]*penetration*.5;
      a.z-=n[2]*penetration*.5;b.z+=n[2]*penetration*.5;
      const rel=dot(sub(b.v,a.v),n);
      if(rel<0){const imp=scale(n,-rel*.67);a.v=sub(a.v,imp);b.v=add(b.v,imp);
        a.w=add(a.w,scale(cross(n,a.v),-.0008));b.w=add(b.w,scale(cross(n,b.v),.0008));}
    }
  }
  return {mesh,rotate,advance,orientation,faceValue,makeDie,launch,step,collide,height,hitTest,random};
});
