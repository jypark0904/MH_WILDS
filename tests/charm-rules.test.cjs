'use strict';
const assert=require('node:assert/strict');
require('../dist/data.js');require('../dist/charm-data.js');
const C=require('../dist/charm-rules.js'),db=globalThis.WILDS_DB,data=globalThis.WILDS_CHARM_RULES;
const id=name=>{const s=db.skills.find(s=>s.name===name);assert.ok(s,name);return s.id;};
const check=(rarity,skills,slots=[])=>C.check({rarity,skills,slots,charmType:'appraised'},db);
const a=n=>({kind:'armor',level:n}),w=n=>({kind:'weapon',level:n});
function example(pattern){const result={};for(const pool of pattern.pools){const choice=Object.entries(data.pools[pool]).find(([id])=>!result[id]);if(choice)result[choice[0]]=choice[1];}return result;}
for(const pattern of data.patterns){const skills=example(pattern);assert.equal(check(pattern.rarity,skills,pattern.slots).status,'valid',JSON.stringify(pattern));assert.equal(check(pattern.rarity,Object.fromEntries(Object.entries(skills).reverse()),[...pattern.slots].reverse()).status,'valid');}
assert.equal(data.patterns.length,100);
assert.equal(check(8,{[id('공격')]:3},[a(3)]).status,'mismatch');
assert.equal(check(7,{[id('공격')]:3},[w(1)]).issues.some(i=>i.field==='slots'),true);
assert.equal(check(8,{},[w(2)]).issues.some(i=>i.field==='slots'),true);
assert.equal(check(8,{},[w(1),a(1),a(1)]).status,'incomplete');
assert.equal(check(8,{},[w(1),a(2)]).status,'mismatch');
const special=data.patterns.find(p=>p.rarity===7&&p.slots.some(s=>s.level===3));assert.deepEqual(special.pools,[2,1,8]);
assert.equal(check(7,example(special),[a(3)]).status,'valid');
const weapon3=data.patterns.find(p=>p.rarity===7&&p.pools[0]===3),strong=example(weapon3);
assert.equal(check(7,strong,weapon3.slots).status,'valid');
assert.equal(check(7,strong,[a(3)]).issues.some(i=>i.field==='combined'),true);
const attack=id('공격');assert.equal(C.skillsFit({[attack]:3},{pools:[2,1,0]},data.pools),false,'same skill cannot be drawn twice and combined');
assert.equal(check(8,{[attack]:5},[w(1)]).status,'mismatch');
assert.equal(check(undefined,{},[]).status,'unchecked');
assert.equal(check(4,{},[]).status,'mismatch');
for(const charm of db.charms.filter(c=>!c.random))assert.equal(C.check({...charm,originId:charm.id},db).status,'valid',charm.name);
const crafted=db.charms.find(c=>!c.random);
assert.equal(C.check({...crafted,originId:crafted.id,slots:[a(1)]},db).issues.some(i=>i.field==='slots'),true);
assert.equal(C.check({...crafted,charmType:'crafted',rarity:1},db).status,'mismatch');
console.log('PASS charm legality: 100 patterns / unordered skills and slots; R7 3-slot exception; R8 weapon slot; coupled skill/slot rules; no duplicate merging; 183 crafted charms');
