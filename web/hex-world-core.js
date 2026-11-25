/* Hex World v1: pure scene and camera geometry. No DOM, dice, rules, or asset ownership. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.HexWorld=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const SQRT3=Math.sqrt(3),DEG=Math.PI/180;
  // True isometric projection: arctan(1 / sqrt(2)) above the ground plane.
  const ISO_ELEVATION_DEG=Math.atan(1/Math.sqrt(2))/DEG;
  const GROUND_VERTICAL_SCALE=Math.sin(ISO_ELEVATION_DEG*DEG);
  const HEIGHT_VERTICAL_SCALE=Math.cos(ISO_ELEVATION_DEG*DEG);
  const BORDER_SKIRT=0.70; // Cosmetic map-edge thickness, not a traversable floor.
  const DEFAULT_CHUNK_SIZE=32;
  // Edge indices follow the rendered corner order, not neighbors() order.
  const EDGE_DIRECTIONS=[[1,0],[0,1],[-1,1],[-1,0],[0,-1],[1,-1]];
  const SCHEMA='smi-hex-scene/1';
  const key=(q,r)=>`${q},${r}`;
  const integer=n=>Number.isSafeInteger(n);
  const elevation=tile=>tile?.elevation??0;
  function chunkOf(q,r,size=DEFAULT_CHUNK_SIZE){
    if(!integer(q)||!integer(r)||!integer(size)||size<1||size>256)throw new Error('Invalid chunk coordinate or size');
    const cq=Math.floor(q/size),cr=Math.floor(r/size);
    return {cq,cr,localQ:q-cq*size,localR:r-cr*size};
  }
  function roundAxial(q,r){
    let x=Math.round(q),z=Math.round(r),y=Math.round(-q-r);
    const dx=Math.abs(x-q),dy=Math.abs(y+q+r),dz=Math.abs(z-r);
    if(dx>dy&&dx>dz)x=-y-z;
    else if(dy>dz)y=-x-z;
    else z=-x-y;
    return {q:x,r:z};
  }
  function axialToWorld(q,r){return {x:SQRT3*(q+r/2),y:1.5*r};}
  function worldToAxial(x,y){return roundAxial((SQRT3/3)*x-y/3,(2/3)*y);}
  function distance(a,b){
    const dq=a.q-b.q,dr=a.r-b.r;
    return (Math.abs(dq)+Math.abs(dr)+Math.abs(dq+dr))/2;
  }
  function neighbors(q,r){return [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]].map(([dq,dr])=>({q:q+dq,r:r+dr}));}
  function assert(ok,message){if(!ok)throw new Error('Scene: '+message);}
  function validId(s){return typeof s==='string'&&s.length>0&&s.length<=96&&/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(s);}
  function validateScene(scene){
    assert(scene&&typeof scene==='object'&&!Array.isArray(scene),'object required');
    assert(scene.schema===SCHEMA,'unsupported schema');
    assert(validId(scene.id),'invalid scene id');
    assert(scene.grid?.orientation==='pointy'&&scene.grid?.coordinates==='axial','pointy axial grid required');
    assert(Number.isFinite(scene.grid.feet_per_step)&&scene.grid.feet_per_step>0&&scene.grid.feet_per_step<=100,'invalid scale');
    assert(Array.isArray(scene.tiles)&&scene.tiles.length>0&&scene.tiles.length<=12000,'tile count out of range');
    assert(Array.isArray(scene.objects)&&scene.objects.length<=2000,'object count out of range');
    const occupied=new Set(),ids=new Set();
    for(const tile of scene.tiles){
      assert(tile&&integer(tile.q)&&integer(tile.r)&&Math.abs(tile.q)<=10000&&Math.abs(tile.r)<=10000,'invalid tile coordinates');
      assert(validId(tile.terrain),'invalid terrain id');
      assert(tile.elevation===undefined||(integer(tile.elevation)&&tile.elevation>=-32&&tile.elevation<=32),'invalid terrain elevation');
      const k=key(tile.q,tile.r);assert(!occupied.has(k),'duplicate tile '+k);occupied.add(k);
    }
    for(const object of scene.objects){
      assert(object&&validId(object.id)&&validId(object.kind),'invalid object identity');
      assert(integer(object.q)&&integer(object.r)&&occupied.has(key(object.q,object.r)),'object outside scene: '+object.id);
      assert(!ids.has(object.id),'duplicate object '+object.id);ids.add(object.id);
    }
    return scene;
  }
  function createSceneIndex(scene){
    validateScene(scene);
    const tiles=new Map(scene.tiles.map(tile=>[key(tile.q,tile.r),tile]));
    return {scene,tiles,elevations:[...new Set(scene.tiles.map(elevation))].sort((a,b)=>a-b),
      tileAt:(q,r)=>tiles.get(key(q,r))||null};
  }
  function exposedFaces(index,tile){
    // An absent tile is an actual scene boundary in this standalone lab.
    // Future chunk streaming must distinguish unloaded neighbors from void.
    const top=elevation(tile),faces=[];
    for(let edge=0;edge<6;edge++){
      const [dq,dr]=EDGE_DIRECTIONS[edge],neighbor=index.tileAt(tile.q+dq,tile.r+dr);
      const bottom=neighbor?elevation(neighbor):top-BORDER_SKIRT;
      if(top>bottom)faces.push({edge,top,bottom,boundary:!neighbor});
    }
    return faces;
  }
  function makeCamera(overrides={}){
    // Only view position, zoom and the six hex-aligned yaw steps can vary.
    return {zoom:overrides.zoom??42,panX:overrides.panX??0,
            panY:overrides.panY??0,rotation:overrides.rotation??0};
  }
  function project(camera,worldX,worldY,viewWidth,viewHeight,z=0){
    const a=camera.rotation*60*DEG,c=Math.cos(a),s=Math.sin(a);
    const u=worldX*c-worldY*s,v=worldX*s+worldY*c;
    return {x:viewWidth/2+camera.panX+camera.zoom*u,
            y:viewHeight/2+camera.panY+camera.zoom*(v*GROUND_VERTICAL_SCALE-z*HEIGHT_VERTICAL_SCALE)};
  }
  function unproject(camera,screenX,screenY,viewWidth,viewHeight,z=0){
    const u=(screenX-viewWidth/2-camera.panX)/camera.zoom;
    const v=((screenY-viewHeight/2-camera.panY)/camera.zoom+z*HEIGHT_VERTICAL_SCALE)/GROUND_VERTICAL_SCALE;
    const a=camera.rotation*60*DEG,c=Math.cos(a),s=Math.sin(a);
    return {x:u*c+v*s,y:-u*s+v*c};
  }
  function pick(camera,screenX,screenY,viewWidth,viewHeight,index){
    // Intersect each authored elevation plane. This avoids selecting the
    // hex underneath a visually raised top. Number of planes is bounded.
    let best=null,depth=-Infinity;
    for(const z of index.elevations){
      const pos=unproject(camera,screenX,screenY,viewWidth,viewHeight,z);
      const hex=worldToAxial(pos.x,pos.y),tile=index.tileAt(hex.q,hex.r);
      if(!tile||elevation(tile)!==z)continue;
      const c=axialToWorld(tile.q,tile.r),p=project(camera,c.x,c.y,viewWidth,viewHeight,z);
      if(p.y>=depth){best=tile;depth=p.y;}
    }
    return best;
  }
  function setZoomAt(camera,value,screenX,screenY,w,h,z=0){
    const anchor=unproject(camera,screenX,screenY,w,h,z);
    camera.zoom=Math.max(12,Math.min(180,value));
    const p=project(camera,anchor.x,anchor.y,w,h,z);
    camera.panX+=screenX-p.x;camera.panY+=screenY-p.y;
    return camera;
  }
  function fitScene(camera,scene,w,h,padding=45){
    const points=[];
    for(const tile of scene.tiles){
      const pos=axialToWorld(tile.q,tile.r);
      for(let i=0;i<6;i++){
        const a=(i*60-30)*DEG;
        const x=pos.x+Math.cos(a),y=pos.y+Math.sin(a);
        points.push({x,y,z:elevation(tile)});
        points.push({x,y,z:Math.min(0,elevation(tile))-BORDER_SKIRT});
      }
    }
    camera.zoom=1;camera.panX=0;camera.panY=0;
    const projected=points.map(p=>project(camera,p.x,p.y,0,0,p.z));
    const minX=Math.min(...projected.map(p=>p.x)),maxX=Math.max(...projected.map(p=>p.x));
    const minY=Math.min(...projected.map(p=>p.y)),maxY=Math.max(...projected.map(p=>p.y));
    camera.zoom=Math.max(12,Math.min(180,Math.min((w-2*padding)/(maxX-minX),(h-2*padding)/(maxY-minY))));
    camera.panX=-(minX+maxX)*camera.zoom/2;
    camera.panY=-(minY+maxY)*camera.zoom/2;
    return camera;
  }
  return Object.freeze({SCHEMA,ISO_ELEVATION_DEG,DEFAULT_CHUNK_SIZE,key,chunkOf,elevation,exposedFaces,roundAxial,axialToWorld,worldToAxial,distance,neighbors,validateScene,createSceneIndex,makeCamera,project,unproject,pick,setZoomAt,fitScene});
});