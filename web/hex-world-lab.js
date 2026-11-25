/* Standalone 2.5D scene-camera lab. Atlas sprites will replace debug drawings. */
(function(){
 'use strict';
 const H=window.HexWorld;
 const stage=document.getElementById('scene-stage');
 const canvas=document.getElementById('scene-canvas');
 const ctx=canvas.getContext('2d');
 const camera=H.makeCamera();
 const terrainColors={grass:'#5a8460',dirt:'#a78958',stone:'#82908c',rock:'#707b82',water:'#437d96'};
 const sideColors={grass:['#815d3c','#69462f'],dirt:['#81664b','#65472f'],stone:['#737a7b','#535d64'],rock:['#62676e','#495258'],water:['#376474','#244c60']};
 let index=null,selected=null,drag=null,width=1,height=1;
 const $=id=>document.getElementById(id);
 function message(text){$('message').textContent=text;}
 function center(tile){const p=H.axialToWorld(tile.q,tile.r);return H.project(camera,p.x,p.y,width,height,H.elevation(index?.tileAt(tile.q,tile.r)));}
 function hexPath(q,r,z=0){
  const c=H.axialToWorld(q,r);
  ctx.beginPath();
  for(let i=0;i<6;i++){
   const a=(i*60-30)*Math.PI/180;
   const p=H.project(camera,c.x+Math.cos(a),c.y+Math.sin(a),width,height,z);
   if(!i)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);
  }
  ctx.closePath();
 }
 function drawSides(tile){
  const center=H.axialToWorld(tile.q,tile.r),yaw=camera.rotation*Math.PI/3;
  for(const face of H.exposedFaces(index,tile)){
   const normal=face.edge*Math.PI/3;
   if(Math.sin(yaw+normal)<=.01)continue; // Draw only camera-facing faces.
   const a=(face.edge*60-30)*Math.PI/180,b=(face.edge*60+30)*Math.PI/180;
   const xa=center.x+Math.cos(a),ya=center.y+Math.sin(a);
   const xb=center.x+Math.cos(b),yb=center.y+Math.sin(b);
   const topA=H.project(camera,xa,ya,width,height,face.top);
   const topB=H.project(camera,xb,yb,width,height,face.top);
   const baseB=H.project(camera,xb,yb,width,height,face.bottom);
   const baseA=H.project(camera,xa,ya,width,height,face.bottom);
   const palette=sideColors[tile.terrain]||sideColors.grass;
   ctx.beginPath();ctx.moveTo(topA.x,topA.y);ctx.lineTo(topB.x,topB.y);ctx.lineTo(baseB.x,baseB.y);ctx.lineTo(baseA.x,baseA.y);ctx.closePath();
   ctx.fillStyle=face.edge%2?palette[0]:palette[1];ctx.fill();
   ctx.lineWidth=Math.max(.7,camera.zoom*.015);ctx.strokeStyle='#293f3b';ctx.stroke();
  }
 }
 function drawTerrain(){
  const sorted=index.scene.tiles.map(t=>({tile:t,p:center(t)})).sort((a,b)=>a.p.y-b.p.y||a.p.x-b.p.x);
  for(const {tile} of sorted){
   drawSides(tile);
   hexPath(tile.q,tile.r,H.elevation(tile));
   ctx.fillStyle=terrainColors[tile.terrain]||'#69736c';ctx.fill();
   ctx.lineWidth=Math.max(.7,camera.zoom*.016);ctx.strokeStyle='#22392e';ctx.stroke();
  }
  if(selected){
   hexPath(selected.q,selected.r,H.elevation(selected));
   ctx.fillStyle='#ead6a51e';ctx.fill();ctx.lineWidth=2.5;
   ctx.strokeStyle='#f1d69c';ctx.stroke();
  }
 }
 function drawProp(object){
  const p=center(object),size=Math.min(200,Math.max(12,camera.zoom));
  ctx.save();ctx.translate(p.x,p.y);
  ctx.fillStyle='#0b18215b';ctx.beginPath();ctx.ellipse(0,3,size*.48,size*.19,0,0,Math.PI*2);ctx.fill();
  switch(object.kind){
   case 'tree':{
    ctx.fillStyle='#77513b';ctx.fillRect(-size*.105,-size*.9,size*.21,size*.9);
    for(let i=0;i<3;i++){
     const y=-size*(.7+i*.35),w=size*(.53-i*.08);
     ctx.fillStyle=['#366a52','#3e8061','#579477'][i];ctx.beginPath();
     ctx.moveTo(0,y-size*.53);ctx.lineTo(-w,y+size*.34);ctx.lineTo(w,y+size*.34);ctx.closePath();ctx.fill();
     ctx.strokeStyle='#264b40';ctx.lineWidth=Math.max(1,size*.035);ctx.stroke();
    }
    break;
   }
   case 'rock':{
    ctx.fillStyle='#8b9294';ctx.strokeStyle='#4e6067';ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(-size*.41,0);ctx.lineTo(-size*.26,-size*.42);
    ctx.lineTo(size*.16,-size*.55);ctx.lineTo(size*.44,-size*.14);
    ctx.lineTo(size*.28,size*.04);ctx.closePath();ctx.fill();ctx.stroke();break;
   }
   case 'campfire':{
    ctx.fillStyle='#696e70';for(let i=0;i<7;i++){
     const a=i*Math.PI*2/7;ctx.beginPath();ctx.arc(Math.cos(a)*size*.26,Math.sin(a)*size*.13,size*.095,0,Math.PI*2);ctx.fill();
    }
    ctx.fillStyle='#ffbc50';ctx.beginPath();ctx.moveTo(0,-size*.72);ctx.quadraticCurveTo(size*.52,-size*.05,0,-size*.08);ctx.quadraticCurveTo(-size*.4,-size*.05,0,-size*.72);ctx.fill();
    ctx.fillStyle='#f16d38';ctx.beginPath();ctx.moveTo(0,-size*.45);ctx.lineTo(size*.15,-size*.1);ctx.lineTo(-size*.13,-size*.1);ctx.fill();break;
   }
   case 'house':{
    ctx.fillStyle='#b8a28a';ctx.fillRect(-size*.64,-size*1.24,size*1.28,size*1.2);
    ctx.fillStyle='#9a593e';ctx.beginPath();ctx.moveTo(-size*.84,-size*1.24);ctx.lineTo(0,-size*1.86);ctx.lineTo(size*.84,-size*1.24);ctx.closePath();ctx.fill();
    ctx.fillStyle='#523d36';ctx.fillRect(-size*.16,-size*.56,size*.32,size*.52);break;
   }
   case 'wall':{
    ctx.fillStyle='#99a1a1';ctx.fillRect(-size*.7,-size*.52,size*1.4,size*.48);
    ctx.strokeStyle='#465b61';ctx.lineWidth=2;ctx.strokeRect(-size*.7,-size*.52,size*1.4,size*.48);break;
   }
   case 'hero':case 'monster':{
    const enemy=object.kind==='monster';
    ctx.fillStyle=enemy?'#d97960':'#81c7e4';ctx.strokeStyle=ctx.fillStyle;ctx.lineWidth=2;
    ctx.beginPath();ctx.ellipse(0,0,size*.47,size*.20,0,0,Math.PI*2);ctx.stroke();
    ctx.fillStyle=enemy?'#719369':'#3c6b9d';ctx.fillRect(-size*.19,-size*.68,size*.38,size*.57);
    ctx.fillStyle=enemy?'#a2af7a':'#e5c4a0';ctx.beginPath();ctx.arc(0,-size*.82,size*.20,0,Math.PI*2);ctx.fill();break;
   }
   default:{ctx.fillStyle='#eacb89';ctx.beginPath();ctx.arc(0,-size*.15,size*.23,0,2*Math.PI);ctx.fill();}
  }
  ctx.restore();
 }
 function redraw(){
  ctx.clearRect(0,0,width,height);
  if(!index)return;
  drawTerrain();
  const sorted=index.scene.objects.map(o=>({o,p:center(o)})).sort((a,b)=>a.p.y-b.p.y||a.p.x-b.p.x);
  for(const {o} of sorted)drawProp(o);
  $('camera-readout').textContent=`Zoom ${Math.round(camera.zoom*100/42)}% · Rotation ${camera.rotation*60}° · Tilt ${H.ISO_ELEVATION_DEG.toFixed(2)}° (fixed)`;
 }
 function resize(){
  const firstSize=width<=1||height<=1;
  const box=canvas.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1);
  width=Math.max(1,box.width);height=Math.max(1,box.height);
  canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  if(firstSize&&index)H.fitScene(camera,index.scene,width,height);
  redraw();
 }
 function showTile(tile){$('tile-info').textContent=tile?`Hex (${tile.q}, ${tile.r}) · ${tile.terrain} · elevation ${H.elevation(tile)*index.scene.grid.feet_per_step} ft · ${index.scene.grid.feet_per_step} ft per step`:'Click a hex to inspect terrain and coordinates.';}
 function load(scene){
  const checked=H.createSceneIndex(scene);
  index=checked;selected=null;
  H.fitScene(camera,scene,width,height);
  $('scene-name').textContent=scene.name||scene.id;
  showTile(null);redraw();
  message(`${scene.tiles.length} hexes · ${scene.objects.length} objects · Placeholder artwork`);
 } function rotate(steps){camera.rotation=(camera.rotation+steps+6)%6;redraw();}
 $('rotate-left').addEventListener('click',()=>rotate(-1));
 $('rotate-right').addEventListener('click',()=>rotate(1));
 $('fit-scene').addEventListener('click',()=>{if(index){H.fitScene(camera,index.scene,width,height);redraw();}});
 $('scene-file').addEventListener('change',async e=>{
  const file=e.target.files?.[0];if(!file)return;
  try{
   if(file.size>2_000_000)throw new Error('Map file exceeds 2 MB');
   load(JSON.parse(await file.text()));
  }catch(err){message(`Could not load map: ${err.message}`);}finally{e.target.value='';}
 });
 canvas.addEventListener('wheel',event=>{
  event.preventDefault();if(!index)return;
  const rect=canvas.getBoundingClientRect();
  const sx=event.clientX-rect.left,sy=event.clientY-rect.top;
  const tile=H.pick(camera,sx,sy,width,height,index);
  H.setZoomAt(camera,camera.zoom*Math.exp(-Math.max(-250,Math.min(250,event.deltaY))*.001),sx,sy,width,height,H.elevation(tile));
  redraw();
 },{passive:false});
 canvas.addEventListener('contextmenu',event=>event.preventDefault());
 canvas.addEventListener('pointerdown',event=>{
  if(!index)return;
  if(event.button===1||event.button===2){
   drag={id:event.pointerId,x:event.clientX,y:event.clientY};
   canvas.setPointerCapture(event.pointerId);stage.classList.add('is-dragging');event.preventDefault();return;
  }
  if(event.button!==0)return;
  const r=canvas.getBoundingClientRect();
  selected=H.pick(camera,event.clientX-r.left,event.clientY-r.top,width,height,index);
  showTile(selected);redraw();
 });
 canvas.addEventListener('pointermove',event=>{
  if(!drag||drag.id!==event.pointerId)return;
  camera.panX+=event.clientX-drag.x;camera.panY+=event.clientY-drag.y;
  drag.x=event.clientX;drag.y=event.clientY;redraw();
 });
 function endDrag(event){if(drag?.id!==event.pointerId)return;drag=null;stage.classList.remove('is-dragging');if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);}
 canvas.addEventListener('pointerup',endDrag);
 canvas.addEventListener('pointercancel',endDrag);
 window.addEventListener('keydown',event=>{
  if(event.target.matches('input,textarea,select'))return;
  if(event.key.toLowerCase()==='q')rotate(-1);
  if(event.key.toLowerCase()==='e')rotate(1);
 });
 new ResizeObserver(resize).observe(stage);
 window.HexWorldLab={camera,load,getScene:()=>index?.scene,getSelected:()=>selected,redraw};
 fetch('./hex-world-demo.json').then(response=>{if(!response.ok)throw Error(`HTTP ${response.status}`);return response.json();}).then(load).catch(err=>message(`Open a scene file to begin (${err.message})`));
})();
