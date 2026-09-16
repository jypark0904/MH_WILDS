'use strict';
const assert=require('node:assert/strict');
const D=require('../dist/damage-model.js');
const catalog=require('../data/damage-model.json');
const research=require('../data/damage-research-gunlance.json');
const db=require('../data/database.json');

// These checks use the shipped catalog, not a hand-written copy of its channels.
// Expected damage is derived separately from the researched moves and shell data.
const TYPES=['normal','long','wide'];
const GROUPS=['normal-fullburst','normal-wsfb','long-melee-wyrmstake','wide-charged-wyvernfire'];
const WEIGHTS={normal:[45,30,15,10],long:[15,25,45,15],wide:[5,20,10,65]};
const weapon={id:'catalog-audit-gl',kind:'gunlance',attack:690,rawAttack:300,affinity:0,element:'dragon',elementValue:300,sharpness:{white:100}};
const skillId=name=>{const s=db.skills.find(s=>s.name===name);assert.ok(s,'Missing real DB skill: '+name);return s.id;};
const skills=entries=>Object.fromEntries(Object.entries(entries).map(([name,level])=>[skillId(name),level]));
const close=(actual,expected,label='')=>assert.ok(Number.isFinite(actual)&&Math.abs(actual-expected)<1e-7,`${label}: got ${actual}, expected ${expected}`);
const pure=id=>Object.fromEntries(GROUPS.map(g=>[g,g===id?100:0]));
const defaultWeights=type=>Object.fromEntries(GROUPS.map((g,i)=>[g,WEIGHTS[type][i]]));
function setup(type,{level=4,weights,settings={},weapon:override={}}={}){
  const m=D.create({db,catalog,weapon:{...weapon,...override},selection:{type},settings:{rawHZ:60,elementHZ:20,fireHZ:15,sharpness:'white',shellLevel:level,chargeFraction:0,...(weights?{rotations:{[type]:weights}}:{}),...settings}});
  assert.equal(m.available,true,`${type}@${level} should be available`);return m;
}

// For a chosen group, use the CURRENT weapon's shell type, not the research
// example's original type. This catches accidental reuse of normal/long/wide
// counts or MVs when all four groups are offered to every gunlance.
function expectedGroup(id,type,level,{load=0,artillery=0,rawMult=1,flatRaw=6,element=30,crit=1,sharpRaw=1.32,sharpElement=1.15}={}){
  const c=research.representativeCycles.find(c=>c.id===id),t=research.shellTypes[type],i=level-1;
  const raw=300*rawMult+flatRaw,explosiveRaw=300*rawMult*research.skills.artillery.rawBaseMultiplierByLevel[artillery]+flatRaw;
  const capacity=t.baseCapacity+(load===2?1:0),fireAdd=research.skills.artillery.fixedTrueFireAddByLevel[artillery];
  const parts={raw:0,element:0,fixed:0,fire:0};
  for(const hit of c.meleeHits){
    const move=research.meleeAttacks.find(a=>a.id===hit.attackId);
    parts.raw+=hit.count*raw*move.motionValue/100*sharpRaw*.6*crit;
    parts.element+=hit.count*element*move.weaponElementMultiplier*sharpElement*.2;
  }
  for(const shell of c.shells){
    const multiplier=t[shell.mode==='fullburst'?'fullburstRawMultiplier':shell.mode==='wsfb'?'wsfbRawMultiplier':'chargedRawMultiplier'];
    const count=capacity*shell.magazines;
    parts.fixed+=count*explosiveRaw*t.shellMv[i]*multiplier/100;
    parts.fire+=count*(t.shellFire[i]+fireAdd)*.15;
  }
  for(const stake of c.wyrmstakes){
    parts.raw+=stake.ticks*explosiveRaw*t.wyrmstakeTickMv[i]/100*.6*crit;
    parts.element+=stake.ticks*element*research.attackRules.wyrmstakeTick.weaponElementMultiplier*.2;
    parts.fixed+=explosiveRaw*t.wyrmstakeExplosionMv[i]/100*stake.explosionRawMultiplier;
    parts.fire+=(t.wyrmstakeExplosionFire[i]+fireAdd)*.15;
  }
  parts.fixed+=c.wyvernfireUses*research.attackRules.wyvernfire.hits*explosiveRaw*t.wyvernfireMv[i]/100;
  parts.fire+=c.wyvernfireUses*research.attackRules.wyvernfire.hits*(t.wyvernfireFire[i]+fireAdd)*.15;
  return parts;
}
function expected(type,level,weights=defaultWeights(type),options={}){
  const parts={raw:0,element:0,fixed:0,fire:0},sum=Object.values(weights).reduce((a,b)=>a+b,0);
  for(const id of GROUPS){const one=expectedGroup(id,type,level,options);for(const key of Object.keys(parts))parts[key]+=one[key]*(weights[id]||0)/sum;}
  return {parts,total:Object.values(parts).reduce((a,b)=>a+b,0)};
}
function checkParts(actual,want,label){for(const key of Object.keys(want.parts))close(actual.parts[key],want.parts[key],label+'/'+key);close(actual.total,want.total,label+'/total');close(Object.values(actual.parts).reduce((a,b)=>a+b,0),actual.total,label+'/partition');}

const cases=[];const test=(name,fn)=>cases.push({name,fn});

test('all twelve GL profiles contain all four attack groups and bounded shell power',()=>{
  assert.equal(catalog.game,'wilds');assert.equal(catalog.dbVersion,'1.041');
  for(const type of TYPES)for(let level=1;level<=4;level++){
    const p=catalog.profiles[`gunlance/${type}@${level}`];assert.ok(p);assert.equal(p.shellLevel,level);
    assert.deepEqual(p.rotations.map(r=>r.id),GROUPS);
    assert.deepEqual([...new Set(p.channels.map(c=>c.rotation))].sort(),[...GROUPS].sort());
    for(const id of GROUPS)assert.ok(p.channels.some(c=>c.rotation===id&&c.rawMV>0),type+'/'+id);
  }
  assert.ok(!catalog.profiles['gunlance/normal@5'],'Unreleased shell power must not enter the catalog');
});

test('defaults express the requested main playstyle while retaining every attack group',()=>{
  for(const type of TYPES){const p=catalog.profiles[`gunlance/${type}@4`],values=p.rotations.map(r=>r.defaultWeight);assert.deepEqual(values,WEIGHTS[type]);assert.equal(values.reduce((a,b)=>a+b,0),100);assert.ok(values.every(n=>n>0));}
  assert.ok(WEIGHTS.normal[0]>WEIGHTS.normal[1]&&WEIGHTS.normal[1]>WEIGHTS.normal[2]);
  assert.ok(WEIGHTS.long[2]>WEIGHTS.long[1]&&WEIGHTS.long[1]>WEIGHTS.long[0]);
  assert.ok(WEIGHTS.wide[3]>WEIGHTS.wide[1]&&WEIGHTS.wide[1]>WEIGHTS.wide[2]);
});

test('default mixed wide and the other types gain from affinity and matching weapon element',()=>{
  for(const type of TYPES){
    // Keep real default timing here; the regression is about mixed moves, not
    // a favorable zero-time assumption that could hide the pure-wide bug.
    const m=setup(type,{settings:{chargeFraction:undefined}});
    const r=m.analyze(skills({'간파':5,'용속성 공격 강화':3}));
    assert.ok(r.perSkill[skillId('간파')].multiplier>1,type+' affinity');
    assert.ok(r.perSkill[skillId('용속성 공격 강화')].multiplier>1,type+' dragon');
    assert.ok(r.full.parts.raw>0&&r.full.parts.element>0,type+' real weapon channels');
  }
});

test('100% charged-shell/wyvernfire group has no affinity or weapon-element contribution',()=>{
  for(const type of TYPES){
    const m=setup(type,{weights:pure('wide-charged-wyvernfire'),weapon:{affinity:50}});
    const r=m.analyze(skills({'간파':5,'슈퍼회심':5,'용속성 공격 강화':3}));
    close(r.multiplier,1,type+' combined');
    for(const id of Object.keys(r.perSkill))close(r.perSkill[id].multiplier,1,type+'/'+id);
    close(r.full.parts.raw,0);close(r.full.parts.element,0);
    assert.ok(r.full.parts.fixed>0&&r.full.parts.fire>0);
  }
});

test('fixed shell fire is separate from weapon element and does not gain Fire Attack',()=>{
  const m=setup('wide',{weights:pure('wide-charged-wyvernfire'),weapon:{element:'fire'}});
  const before=m.analyze({}).full,after=m.analyze(skills({'불속성 공격 강화':3})).full;
  close(after.total,before.total);close(after.parts.element,0);close(after.parts.fire,before.parts.fire);
  const mixed=setup('wide',{weapon:{element:'fire'}}).analyze(skills({'불속성 공격 강화':3}));
  assert.ok(mixed.full.parts.element>mixed.baseline.parts.element);
  close(mixed.full.parts.fire,mixed.baseline.parts.fire,'Fire Attack cannot buff innate shell fire');
});

test('all groups use current shell type and match independent damage sums across power/loading/artillery',()=>{
  let checked=0;
  for(const type of TYPES)for(let level=1;level<=4;level++)for(const load of [0,1,2])for(const artillery of [0,1,2,3])for(const group of [null,...GROUPS]){
    const weights=group?pure(group):defaultWeights(type);
    const actual=setup(type,{level,weights}).analyze(skills({'포술':artillery,'포탄 장전':load})).full;
    const want=expected(type,level,weights,{load,artillery});
    checkParts(actual,want,`${type}@${level}/${group||'mixed'}/load${load}/artillery${artillery}`);checked++;
  }
  assert.equal(checked,720);
});

test('Artillery multiplies base percent-boosted raw but not flat Attack Boost or Powercharm',()=>{
  const weights=pure('wide-charged-wyvernfire'),m=setup('wide',{weights});
  const actual=m.analyze(skills({'공격':5,'포술':3,'포탄 장전':2})).full;
  const want=expected('wide',4,weights,{rawMult:1.04,flatRaw:9+6,artillery:3,load:2});
  checkParts(actual,want,'base-versus-flat artillery');
  // Six charged shells and five Wyvernfire hits: explosive MV sum 548.4.
  close(actual.parts.fixed,(300*1.04*1.15+9+6)*5.484);
  assert.ok(Math.abs(actual.parts.fixed-(300*1.04+9+6)*1.15*5.484)>1,'The all-raw multiplier would overcount flat buffs');
});

test('Wyrmstake ticks receive criticals and weapon element but not sharpness scaling',()=>{
  const weights=pure('long-melee-wyrmstake');
  for(const sharpness of ['white','blue']){
    const actual=setup('long',{weights,weapon:{affinity:100},settings:{sharpness}}).analyze(skills({'포술':3,'슈퍼회심':5})).full;
    checkParts(actual,expected('long',4,weights,{artillery:3,crit:1.4,sharpRaw:sharpness==='white'?1.32:1.2,sharpElement:sharpness==='white'?1.15:1.0625}),'wyrmstake '+sharpness);
  }
});

test('rotation inputs are relative counts, normalize proportionally and exclude zero groups',()=>{
  const a=Object.fromEntries(GROUPS.map((g,i)=>[g,[4,3,2,1][i]]));
  const b=Object.fromEntries(GROUPS.map((g,i)=>[g,[40,30,20,10][i]]));
  for(const type of TYPES){
    checkParts(setup(type,{weights:a}).analyze({}).full,expected(type,4,a),'arbitrary weights '+type);
    close(setup(type,{weights:a}).analyze({}).full.total,setup(type,{weights:b}).analyze({}).full.total,'proportional normalization');
    const zero=Object.fromEntries(GROUPS.map(g=>[g,0]));
    close(setup(type,{weights:zero}).analyze({}).full.total,setup(type).analyze({}).full.total,'all-zero safely falls back to defaults');
  }
});

test('Load Shells only adds full-magazine shells; Lv1 has no fabricated damage increase',()=>{
  for(const type of TYPES){
    const m=setup(type),none=m.analyze({}).full,one=m.analyze(skills({'포탄 장전':1})).full,two=m.analyze(skills({'포탄 장전':2})).full;
    close(one.total,none.total);assert.ok(two.total>none.total);
    close(two.parts.raw,none.parts.raw);close(two.parts.element,none.parts.element);
    const stakeOnly=setup(type,{weights:pure('long-melee-wyrmstake')});
    close(stakeOnly.analyze(skills({'포탄 장전':2})).full.total,stakeOnly.analyze({}).full.total,'capacity does not add wyrmstake ticks or explosions');
  }
});

test('Focus and the extra charged shell use only the declared charging-time approximation',()=>{
  for(const type of TYPES){
    const p=catalog.profiles[`gunlance/${type}@4`],charge=p.chargeFraction;
    const m=setup(type,{settings:{chargeFraction:undefined}});
    const focused=m.analyze(skills({'집중':3})).full;
    close(focused.total,expected(type,4).total/(1-charge*.15),type+' Focus charge-only');
    assert.ok(Math.abs(focused.total-expected(type,4).total/.85)>1,'Full animation cannot be shortened by 15%');
    const extra=charge/research.shellTypes[type].baseCapacity;
    const loaded=m.analyze(skills({'포탄 장전':2})).full;
    close(loaded.total,expected(type,4,defaultWeights(type),{load:2}).total/(1+extra),type+' additional charging');
    const both=m.analyze(skills({'집중':3,'포탄 장전':2})).full;
    close(both.total,expected(type,4,defaultWeights(type),{load:2}).total/(1+extra-(charge+extra)*.15),type+' combined timing');
    const noCharge=setup(type,{weights:pure('normal-fullburst'),settings:{chargeFraction:undefined}}).analyze(skills({'집중':3}));
    close(noCharge.multiplier,1,'No charged-shell group means no modeled Focus time gain');
  }
});

test('higher shell power increases explosive damage without changing weapon element',()=>{
  for(const type of TYPES){let previous;
    for(let level=1;level<=4;level++){
      const current=setup(type,{level}).analyze(skills({'포술':3,'포탄 장전':2})).full;
      if(previous){assert.ok(current.total>previous.total,type+' level '+level);assert.ok(current.parts.fixed>previous.parts.fixed);close(current.parts.element,previous.parts.element);}
      previous=current;
    }
  }
});

let passed=0,failed=0;
for(const {name,fn}of cases){try{fn();passed++;}catch(error){failed++;console.error('FAIL '+name+'\n'+error.stack);}}
console.log(`Damage catalog: ${passed}/${cases.length} passed (includes 720 independent GL damage comparisons)`);
if(failed)process.exitCode=1;
