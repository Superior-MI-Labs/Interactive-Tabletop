/* Installable alpha shell. No character data is ever cached here: IndexedDB owns it.
   PDF.js is fetched from the pinned CDN on the first import and is not an
   offline guarantee. The current site remains functional when workers are blocked. */
const CACHE='interactive-tabletop-shell-v0.54.0';
const ASSETS=['./','./index.html','./styles.css','./app.js','./dnd-slots.js','./character-import.js','./reference-catalog.js','./dnd-2014-reference.json','./vault-store.js','./demo-character.js','./dnd-action.js','./browser-pdf.js','./dice-physics.js','./theme-assets.json','./solar-crest.png','./icon-192.png','./icon-512.png','./walnut-texture.jpg','./vellum-texture.jpg','./manifest.webmanifest'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('interactive-tabletop-shell-')&&key!==CACHE).map(key=>caches.delete(key)))),self.clients.claim()])));
self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET'||new URL(request.url).origin!==self.location.origin)return;
 event.respondWith(fetch(request).then(response=>{
  if(response.ok&&ASSETS.some(path=>new URL(path,self.registration.scope).pathname===new URL(request.url).pathname)){
   const clone=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(request,clone)));
  }
  return response;
 }).catch(()=>caches.match(request).then(cached=>cached||Response.error())));
});
