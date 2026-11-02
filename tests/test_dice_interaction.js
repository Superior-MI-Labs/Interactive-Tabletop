const assert = require('assert');
const D=require('../web/dice-physics.js');
for(const sides of [4,6,8,10,12,20,100]){
 const d=D.makeDie(sides,350,240,44);
 // Every normal die can be picked from its projected face, not only a bounding circle.
 assert(D.hitTest(d,d.x,d.y-d.z*.45,1000,700),`center of d${sides}`);
 assert(!D.hitTest(d,d.x+300,d.y+300,1000,700),`outside d${sides}`);
 D.launch(d,220,80,100);
 assert(D.hitTest(d,d.x,d.y-d.z*.45,1000,700),`moving d${sides}`);
}
console.log('PASS: rendered-face hit tests for d4,d6,d8,d10,d12,d20,d100, moving dice');
