'use strict';
const assert=require('node:assert/strict');
const Insights=require('../dist/result-insights.js');
const db={skills:[
  {id:'attack',name:'공격',maxLevel:5},
  {id:'guard',name:'가드 성능',maxLevel:3},
  {id:'burst',name:'연격',maxLevel:5},
  {id:'extra',name:'방어',maxLevel:7},
  ...['회복 속도','체술','회피 성능','귀마개','납도술','정령의 가호','풍압 내성','기절 내성'].map((name,i)=>({id:'extra'+i,name,maxLevel:3})),
]};
const r=(skills={},levels=[],defense=100)=>({weapon:{id:'test-weapon',kind:'gunlance',element:'dragon'},skills,remainingSlots:levels.map((level,i)=>({kind:i%2?'weapon':'armor',level})),defense});
const targets={attack:3,guard:2};
const results=[r({attack:3,guard:2,burst:2,extra:99}),r({attack:4,guard:2,burst:3}),r({attack:5,guard:2,burst:3})];
const original=JSON.stringify({db,targets,results});
const summary=Insights.analyze(db,targets,results);
assert.equal(summary.totalResults,3);
assert.deepEqual(summary.upgrades[0],{id:'attack',name:'공격',currentLevel:3,level:4,maxLevel:5,count:2,confirmed:true,highestLevel:5});
assert.deepEqual(summary.upgrades[1],{id:'guard',name:'가드 성능',currentLevel:2,level:3,maxLevel:3,count:0,confirmed:false,highestLevel:2});
const {priority,reason,...additional}=summary.additional[0];
assert.deepEqual(additional,{id:'burst',name:'연격',currentLevel:0,level:3,maxLevel:5,count:2,confirmed:true,highestLevel:3});
assert.equal(priority,1);assert.ok(reason.length>0,'Applicable extra skills explain their use');
assert.equal(summary.additional.find(item=>item.id==='extra').level,7,'Additional levels are capped to the database maximum');
assert.ok(!summary.additional.some(item=>item.id==='attack'||item.id==='guard'));
assert.equal(JSON.stringify({db,targets,results}),original,'Analysis must not mutate inputs');
assert.deepEqual(Insights.analyze(db,targets,[]),{upgrades:[],additional:[],totalResults:0});
assert.deepEqual(Insights.analyze(db,targets,[r({attack:5,guard:1,burst:5})]),{upgrades:[],additional:[],totalResults:0},'Stale results that fail a retained target cannot confirm suggestions');
assert.equal(Insights.analyze(db,{attack:5},[r({attack:5})]).upgrades.length,0,'Do not propose levels beyond the maximum');
const crowded=Insights.analyze(db,{attack:1},[r({attack:1,...Object.fromEntries(Array.from({length:8},(_,i)=>['extra'+i,1]))})]);
assert.equal(crowded.additional.length,6);
assert.equal(new Set(crowded.additional.map(item=>item.id)).size,6);
assert.ok(crowded.additional.every(item=>item.confirmed&&item.count===1));

const realDB=require('../data/database.json'),sid=name=>realDB.skills.find(s=>s.name===name).id;
const guard=sid('가드 성능'),dragon=sid('용속성 공격 강화'),fire=sid('불속성 공격 강화'),shot=sid('포스샷'),morph=sid('고속 변형');
const mixed=r({[guard]:1,[dragon]:3,[fire]:3,[shot]:3,[morph]:3});
const fitted=Insights.analyze(realDB,{[guard]:1},[mixed]);
assert.equal(fitted.additional[0].id,dragon,'Matching dragon gain is the first additional recommendation');
assert.ok(fitted.additional[0].reason.includes('용'));
assert.ok(!fitted.additional.some(x=>[fire,shot,morph].includes(x.id)),'Wrong element, ranged and morph skills do not become gunlance recommendations');
const unselected={...mixed,weapon:{id:'none-weapon'}};
assert.equal(Insights.analyze(realDB,{[guard]:1},[unselected]).additional.length,0,'Do not guess applicability without a weapon');
assert.equal(Insights.analyze(realDB,{[shot]:1},[mixed]).upgrades.length,0,'Do not encourage a ranged-only skill on gunlance, even when explicitly requested');

assert.deepEqual(Insights.metric(r({attack:4,guard:2,extra:7},[3,1],150),targets),{slotLevelSum:4,level3Slots:1,targetSurplus:1,defense:150,slotCount:2});
assert.ok(Insights.compare(r({},[3]),r({},[1,1]),{})<0,'Slot level sum outranks slot count');
assert.ok(Insights.compare(r({},[3,1]),r({},[2,2]),{})<0,'One level-3 slot breaks equal capacity');
assert.ok(Insights.compare(r({attack:4},[2],50),r({attack:3},[2],500),{attack:3})<0,'Requested skill surplus breaks an equal-slot tie before defense');
assert.ok(Insights.compare(r({},[2],200),r({},[2],100),{})<0,'Defense breaks the remaining tie');
const rawInflated=r({attack:3},[2]);rawInflated.rawSkills={attack:99};
assert.equal(Insights.metric(rawInflated,{attack:3}).targetSurplus,0,'Raw levels above the skill cap do not count');
assert.equal(Insights.compare(r({attack:3,extra:7},[2]),r({attack:3},[2]),{attack:3}),0,'Unrequested skills do not become a generic power score');
assert.equal(Insights.compare(r({},[2]),r({},[2]),{}),0,'Equal results keep the sort stable');
console.log('PASS result insights: retained-target suggestions, confirmed versus unconfirmed levels, capped additional skills, top-six limit, slot-capacity ordering, purity.');
