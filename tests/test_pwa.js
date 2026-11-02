const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..','web');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.webmanifest'),'utf8'));
assert.equal(manifest.display,'standalone');
assert.equal(manifest.scope,'./');
const sizes=new Set(manifest.icons.map(x=>x.sizes));
assert(sizes.has('192x192')&&sizes.has('512x512'));
for(const icon of manifest.icons)assert(fs.existsSync(path.join(root,icon.src)),'missing PWA icon '+icon.src);
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
for(const dependency of ['dnd-slots.js','vault-store.js','dnd-action.js','character-import.js','dice-physics.js','manifest.webmanifest'])
 assert(index.includes(dependency),'missing app dependency '+dependency);
const sw=fs.readFileSync(path.join(root,'service-worker.js'),'utf8');
for(const dependency of ['index.html','app.js','dnd-action.js','dnd-slots.js','vault-store.js','manifest.webmanifest','icon-192.png','icon-512.png'])
 assert(sw.includes("'./"+dependency+"'"),'missing offline-shell asset '+dependency);
assert(!sw.includes('character.json')&&!sw.includes('vault.json'),'service worker must not cache private character data');
console.log('PWA manifest, installability icons, shell assets and private-data exclusions PASS');
