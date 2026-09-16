'use strict';
const assert=require('node:assert/strict');
const D=require('../dist/damage-model.js');
const U=require('../dist/damage-ui.js');

// Small independent fixture: 100 MV / 100 hitzone / no sharpness, so expected
// values can be calculated directly without depending on generated game data.
const skill=(id,name,maxLevel)=>({id,name,maxLevel});
const db={weapons:[],skills:[
  skill('attack','공격',5),skill('critEye','간파',5),skill('critBoost','슈퍼회심',5),
  skill('agitator','도전자',5),skill('wex','약점 특효',5),skill('fire','불속성 공격 강화',3),
  skill('critElement','회심격【속성】',3),skill('peak','완전 충전',5),skill('resentment','앙심',5),
  skill('heroics','재난대처능력',5),skill('defense','방어',7),skill('proc','미검증 추가 피해',1),
  skill('offensiveGuard','공격적인 방어',3),skill('focus','집중',3),skill('load','포탄 장전',2)
]};
const catalog={game:'wilds',defaults:{'long-sword':'melee','heavy-bowgun':'element'},sources:{},
  profiles:{
    'long-sword/melee':{label:'검증용 단타',channels:[{rawMV:100,eleMV:1,sharpness:false}]},
    'heavy-bowgun/element':{label:'미확인 속성탄 회심 검증',ammoElement:true,channels:[{rawMV:100,sharpness:false}]}
  },
  rules:{
    '공격':{levels:[{rawFlat:3},{rawFlat:5},{rawFlat:7},{rawMult:1.02,rawFlat:8},{rawMult:1.04,rawFlat:9}]},
    '간파':{levels:[4,8,12,16,20].map(affinity=>({affinity}))},
    '슈퍼회심':{levels:[1.28,1.31,1.34,1.37,1.4].map(crit=>({crit}))},
    '도전자':{condition:'anger',levels:[4,8,12,16,20].map((rawFlat,i)=>({rawFlat,affinity:[3,5,7,10,15][i]}))},
    '약점 특효':{special:'wex',conditions:['wound'],levels:[5,10,15,20,30].map((affinity,i)=>({affinity,wound:[3,5,10,15,20][i]}))},
    '불속성 공격 강화':{element:'fire',requiresElement:true,levels:[{eleFlat:4},{eleMult:1.1,eleFlat:5},{eleMult:1.2,eleFlat:6}]},
    '회심격【속성】':{special:'critElement',requiresElement:true},
    '완전 충전':{condition:'fullHealth',levels:[3,6,10,15,20].map(rawFlat=>({rawFlat}))},
    '앙심':{condition:'redHealth',levels:[5,10,15,20,25].map(rawFlat=>({rawFlat}))},
    '재난대처능력':{condition:'lowHealth',levels:[1,1.05,1.05,1.1,1.3].map(rawMult=>({rawMult}))},
    '공격적인 방어':{condition:'guard',levels:[1.05,1.1,1.15].map(rawMult=>({rawMult}))},
    '집중':{special:'focus'},'포탄 장전':{special:'load'}
  },critElement:{'long-sword':[1.05,1.1,1.15]},utilitySkills:['방어']};
const baseWeapon={id:'personal',kind:'long-sword',rawAttack:200,attack:660,affinity:0,specials:[]};
const setup=(weapon={},settings={},overrideCatalog=catalog)=>D.create({db,weapon:{...baseWeapon,...weapon},settings:{rawHZ:100,elementHZ:100,fireHZ:100,...settings},catalog:overrideCatalog});
const close=(actual,expected,message)=>assert.ok(Number.isFinite(actual)&&Math.abs(actual-expected)<1e-9,`${message||''}: got ${actual}, expected ${expected}`);
const cases=[];const test=(name,fn)=>cases.push({name,fn});
const deepFreeze=value=>{if(value&&typeof value==='object'){Object.freeze(value);Object.values(value).forEach(deepFreeze);}return value;};

test('positive and negative criticals, including affinity boundaries',()=>{
  close(D.critical(0),1);close(D.critical(100),1.25);close(D.critical(50,1.4),1.2);
  close(D.critical(-40,1.4),.9);close(D.critical(-100,1.4),.75);
  close(D.critical(150,1.4),1.4);close(D.critical(-150,1.4),.75);
});

test('powercharm is +6 once; percent raw does not multiply fixed buffs',()=>{
  const m=setup({}, {uptimes:{guard:1}}),r=m.analyze({attack:5,offensiveGuard:3});
  close(r.baseline.total,206);close(r.full.total,200*1.04*1.15+9+6);
  close(m.analyze({}).multiplier,1);assert.ok(Math.abs(r.full.total-(206*1.04+9)*1.15)>1);
});

test('weapon bloat fallback and authoritative raw-only weapon',()=>{
  close(setup({rawAttack:undefined}).analyze({}).baseline.total,206);
  close(setup({attack:693,rawAttack:200}).analyze({}).baseline.total,216,'edited display beats stale raw');
  const m=setup({attack:undefined,rawAttack:200});assert.equal(m.available,true);close(m.analyze({}).baseline.total,206);
});

test('conditional raw plus affinity averages damage states, not averaged stats',()=>{
  const r=setup({}, {uptimes:{anger:.5}}).analyze({agitator:5});
  const expected=.5*206+.5*(226*1.0375),wrong=(206+20*.5)*(1+.15*.5*.25);
  close(r.full.total,expected);assert.ok(Math.abs(r.full.total-wrong)>.1);
});

test('affinity cap is applied within each conditional state',()=>{
  const r=setup({affinity:90},{uptimes:{anger:.5}}).analyze({agitator:5,critBoost:5});
  close(r.full.total,.5*(206*1.36)+.5*(226*1.4));
  close(setup({affinity:100}).analyze({critEye:5}).multiplier,1);
});

test('critical boost cannot improve negative critical hits',()=>{
  const r=setup({affinity:-50}).analyze({critBoost:5});close(r.multiplier,1);close(r.full.total,206*.875);
});

test('weakness exploit checks hitzone and wound state before affinity cap',()=>{
  const r=setup({}, {rawHZ:45,uptimes:{wound:.25}}).analyze({wex:5});
  close(r.multiplier,.75*1.075+.25*1.125);
  close(setup({}, {rawHZ:44,uptimes:{wound:1}}).analyze({wex:5}).multiplier,1);
});

test('element attack and critical element affect only the element channel',()=>{
  const m=setup({affinity:100,element:'fire',elementValue:300,specials:[{kind:'element',element:'fire',value:300}]});
  const r=m.analyze({fire:3,critElement:3});close(r.baseline.total,206*1.25+30);
  close(r.full.parts.raw,206*1.25);close(r.full.parts.element,(30*1.2+6)*1.15);
  assert.equal(r.perSkill.critElement.status,'modeled');assert.ok(r.perSkill.critElement.multiplier>1);
});

test('no element and status weapons do not gain elemental damage',()=>{
  for(const weapon of [{element:'none',elementValue:0},{element:'poison',elementValue:300,specials:[{kind:'status',element:'poison',value:300}]}]){
    const r=setup(weapon).analyze({fire:3,critElement:3});close(r.full.parts.element,0);close(r.multiplier,1);
    assert.equal(r.perSkill.fire.status,'neutral');assert.equal(r.perSkill.critElement.status,'neutral');
  }
});

test('explicit current none or status suppresses stale elemental metadata',()=>{
  for(const element of ['none','poison']){
    const r=setup({element,elementValue:0,specials:[{kind:'element',element:'fire',value:300}]}).analyze({fire:3,critElement:3});
    assert.equal(r.stats.element,'');close(r.full.parts.element,0);assert.equal(r.perSkill.critElement.status,'neutral');
  }
});

test('unverified HBG critical element remains unknown for elemental ammo',()=>{
  const r=setup({kind:'heavy-bowgun',rawAttack:200,attack:300,specials:[]}).analyze({critElement:3});
  assert.equal(r.perSkill.critElement.status,'unknown');assert.equal(r.perSkill.critElement.multiplier,null);
  assert.deepEqual(r.unknown,['critElement']);assert.equal(r.partial,true);assert.ok(U.badge(r.perSkill.critElement).includes('미산정'));
});

test('full health is exclusive; red recoverable health may coexist with low HP',()=>{
  const s=D.normalizeSettings({uptimes:{fullHealth:.3,redHealth:.7,lowHealth:.7}});
  close(s.uptimes.fullHealth,.3);close(s.uptimes.redHealth,.7);close(s.uptimes.lowHealth,.7);
  const states=D.scenarios(['fullHealth','redHealth','lowHealth'],s);
  close(states.reduce((n,x)=>n+x.weight,0),1);
  assert.ok(states.some(x=>x.on.redHealth&&x.on.lowHealth));
  assert.ok(states.every(x=>!x.on.fullHealth||(!x.on.redHealth&&!x.on.lowHealth)));
  const r=setup({},{uptimes:s.uptimes}).analyze({peak:5,resentment:5,heroics:5});close(r.full.total,.3*226+.7*(200*1.3+25+6));
});

test('health normalization prevents impossible full-plus-red or full-plus-low probabilities',()=>{
  const s=D.normalizeSettings({uptimes:{fullHealth:.8,redHealth:.7,lowHealth:1}});
  close(s.uptimes.fullHealth,.8);close(s.uptimes.redHealth,.2);close(s.uptimes.lowHealth,.2);
  const states=D.scenarios(['fullHealth','redHealth','lowHealth'],s);close(states.reduce((n,x)=>n+x.weight,0),1);
  assert.ok(states.every(x=>x.weight>=0));
});

test('utility, unknown proc, focus and loading are not misreported as modeled damage',()=>{
  const r=setup().analyze({defense:7,proc:1,focus:3,load:2});
  assert.equal(r.perSkill.defense.status,'utility');close(r.perSkill.defense.multiplier,1);
  for(const id of ['proc','focus','load']){assert.equal(r.perSkill[id].status,'unknown');assert.equal(r.perSkill[id].multiplier,null);}
  assert.equal(r.partial,true);assert.ok(U.badge(r.perSkill.defense).includes('직접 증가 없음'));
  close(r.multiplier,1);
});

test('leave-one-out measures contextual contribution and does not multiply to total',()=>{
  const m=setup({affinity:10}),r=m.analyze({critEye:5,critBoost:5});
  close(r.multiplier,1.12/1.025);
  close(r.perSkill.critEye.multiplier,1.12/1.04);
  close(r.perSkill.critBoost.multiplier,1.12/1.075);
  assert.ok(Math.abs(r.perSkill.critEye.multiplier*r.perSkill.critBoost.multiplier-r.multiplier)>.001);
  close(m.levels('critEye',{critEye:5,critBoost:5})[4].multiplier,r.perSkill.critEye.multiplier);
});

test('skill maximum levels, zero and negative values are bounded',()=>{
  const m=setup();close(m.analyze({attack:500}).full.total,m.analyze({attack:5}).full.total);
  close(m.analyze({attack:0,critEye:-2}).multiplier,1);
});

test('analysis and detail levels preserve caller input objects',()=>{
  const weapon=deepFreeze({...baseWeapon,specials:[{kind:'element',element:'fire',value:300}]}),settings=deepFreeze({uptimes:{anger:.7}}),skills=deepFreeze({attack:5,agitator:5});
  const before=JSON.stringify({weapon,settings,skills,catalog,db});
  const m=D.create({db,weapon,settings,catalog});m.analyze(skills);m.levels('attack',skills);m.analyze(skills);
  assert.equal(JSON.stringify({weapon,settings,skills,catalog,db}),before);
});

test('UI escapes profile labels and does not display unknown contribution as 1.000',()=>{
  const c=structuredClone(catalog);c.profiles['long-sword/melee'].label='<img src=x onerror=alert(1)>';
  const r=setup({}, {},c).analyze({proc:1});const html=U.summary(r);
  assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img'));assert.ok(html.includes('일부 효과 미산정'));
  assert.ok(!U.badge(r.perSkill.proc).includes('×1.000'));
});

test('attack composition changes affinity contribution without changing researched coefficients',()=>{
  const c=structuredClone(catalog);
  c.profiles['long-sword/melee'].channels=[{label:'회심 적용',rawMV:100,sharpness:false},{label:'고정',rawMV:100,crit:false,sharpness:false}];
  const weighted=weights=>setup({affinity:100},{attackWeights:{'long-sword/melee':weights}},c);
  const a=weighted({'attack-0':3,'attack-1':1}).analyze({critBoost:5});
  close(a.full.total,206*(1.4*1.5+.5));close(a.baseline.total,206*(1.25*1.5+.5));
  close(weighted({'attack-0':30,'attack-1':10}).analyze({critBoost:5}).full.total,a.full.total);
  close(weighted({'attack-0':0,'attack-1':1}).analyze({critBoost:5}).multiplier,1);
  close(weighted({'attack-0':0,'attack-1':0}).analyze({critBoost:5}).full.total,weighted({}).analyze({critBoost:5}).full.total);
  close(setup({affinity:100},{attackWeights:{'bow/raw':{'attack-0':0,'attack-1':1}}},c).analyze({critBoost:5}).full.total,weighted({}).analyze({critBoost:5}).full.total,'another weapon profile cannot alter this composition');
});

test('removing charged attacks also removes the corresponding Focus time gain',()=>{
  const c=structuredClone(catalog);
  c.profiles['long-sword/melee']={label:'검증용 모으기 혼합',chargeFraction:.25,channels:[{rawMV:100,sharpness:false,charged:true},{rawMV:100,sharpness:false}]};
  const noCharge=setup({}, {attackWeights:{'long-sword/melee':{'attack-0':0,'attack-1':1}}},c);
  close(noCharge.analyze({focus:3}).multiplier,1);
  close(setup({}, {},c).analyze({focus:3}).multiplier,1/(1-.25*.15));
});

test('damage settings retain weapon-specific context when attack is missing',()=>{
  const m=setup({kind:'heavy-bowgun',attack:0});
  assert.equal(m.available,false);assert.equal(m.stats.weapon.kind,'heavy-bowgun');assert.equal(m.ranged,true);
  assert.ok(m.conditionOptions.some(c=>c.id==='guard'));
  assert.ok(!setup().conditionOptions.some(c=>c.id==='guard'));
  assert.ok(!setup().conditionOptions.some(c=>c.id==='coalescence'));
  assert.ok(setup({element:'fire',elementValue:300}).conditionOptions.some(c=>c.id==='coalescence'));
});

test('settings panel omits target summary, sources and controls for unrelated weapon mechanics',()=>{
  globalThis.WildsDamage=D;
  const melee=U.panel(setup(),{}),ranged=U.panel(setup({kind:'heavy-bowgun',attack:300,rawAttack:200}),{});
  assert.ok(melee.includes('data-damage-setting="sharpness"'));
  assert.ok(!ranged.includes('data-damage-setting="sharpness"'));
  assert.ok(!melee.includes('data-damage-setting="fireHZ"'));
  assert.ok(!melee.includes('data-damage-setting="elementHZ"'));
  assert.ok(U.panel(setup({element:'fire',elementValue:300}),{}).includes('data-damage-setting="elementHZ"'));
  for(const html of [melee,ranged])for(const unwanted of ['<details','목표 스킬 기준','와일즈 조사 자료','damage-sources'])assert.ok(!html.includes(unwanted),unwanted);
  assert.equal(U.skillDetail(setup(),'proc',{proc:1}).intro,'');
  assert.equal(U.skillDetail(setup(),'attack',{attack:5}).levels.length,5);
});

test('settings sync updates normalized values and frequency labels without replacing inputs',()=>{
  const c=structuredClone(catalog);
  c.profiles['long-sword/melee'].channels=[{label:'참격',rawMV:100},{label:'후속타',rawMV:50}];
  const model=setup({}, {rawHZ:300,chargeFraction:.3,uptimes:{fullHealth:.8,redHealth:.7},attackWeights:{'long-sword/melee':{'attack-0':3,'attack-1':1}}},c);
  const inputs=[
    {dataset:{damageSetting:'rawHZ'},value:'300'},
    {dataset:{damageSetting:'chargeFraction'},value:'25'},
    {dataset:{damageUptime:'redHealth'},value:'70'},
    {dataset:{damageAttack:'attack-0'},value:'1'},
    {dataset:{damageAttack:'attack-1'},value:'1'},
    {dataset:{damageSetting:'sharpness'},value:'white'}
  ];
  const labels=[{dataset:{damageFrequency:'attack-0',damageFrequencyGroup:'attack'},textContent:'50%'},{dataset:{damageFrequency:'attack-1',damageFrequencyGroup:'attack'},textContent:'50%'}];
  const active=inputs[3],oldDocument=globalThis.document;
  globalThis.document={activeElement:active,querySelector:()=>({querySelectorAll:selector=>selector==='[data-damage-frequency]'?labels:inputs,set outerHTML(_){throw Error('settings input nodes must not be replaced');}})};
  try{
    U.sync(model);
    assert.deepEqual(inputs.map(i=>i.value),['100','30','20','3','1','auto']);
    assert.deepEqual(labels.map(l=>l.textContent),['75%','25%']);
    assert.equal(globalThis.document.activeElement,active);
    assert.ok(U.panel(model,{}).includes('data-damage-frequency-group="attack"'));
  }finally{if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;}
});

let passed=0,failed=0;
for(const {name,fn}of cases){try{fn();passed++;}catch(error){failed++;console.error('FAIL '+name+'\n'+error.stack);}}
console.log(`Damage model: ${passed}/${cases.length} passed`);
if(failed)process.exitCode=1;
