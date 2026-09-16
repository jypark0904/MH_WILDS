'use strict';
const assert=require('node:assert/strict');
const db=require('../data/database.json'),M=require('../dist/weapon-meta.js');
const id=name=>db.skills.find(s=>s.name===name).id;
const rule=(name,level,priority='core')=>({name,level,priority,reason:name+'의 운용 근거',sources:['guide']});
const profile=(id,label,skills)=>({id,label,description:label+' 운용 기준',skills,sourceIds:['guide']});
const common=[rule('포술',3),rule('포탄 장전',2),rule('가드 성능',3)];
const catalog={game:'wilds',version:1,dbVersion:'1.041',researchedAt:'2026-09-15',sources:{guide:{title:'직접 작성한 가이드',url:'https://example.com/wilds'},bad:{title:'위험 링크',url:'javascript:alert(1)'}},weapons:{
  gunlance:{label:'건랜스',typeLabel:'포격 유형',defaultType:'normal',types:[profile('normal','일반형',[...common,rule('연격',1)]),profile('long','방사형',[...common,rule('연격',1)]),profile('wide','확산형',[...common,rule('집중',3),rule('@element-attack',3,'optional')])]},
  'charge-blade':{label:'차지액스',defaultType:'impact',types:[profile('impact','유탄병',[rule('포술',3)]),profile('element','강속성병',[rule('@element-attack',3)])]},
  'light-bowgun':{label:'라이트보우건',defaultType:'normal',types:[profile('normal','통상탄',[rule('포스샷',3),rule('속사 강화',1)]),profile('element','속성탄',[rule('@element-attack',3),rule('연격',1),rule('집중',3)])]},
  'heavy-bowgun':{label:'헤비보우건',defaultType:'normal',types:[profile('normal','통상탄',[rule('포스샷',3)]),profile('element','속성탄',[rule('@element-attack',3),rule('회심격【속성】',3)]),profile('hybrid','속성탄·특수탄',[rule('@element-attack',3),rule('집중',3)])]},
  'switch-axe':{label:'슬래시액스',defaultType:'power',types:[profile('power','강격병',[rule('강화 지속',3)]),profile('element','강속성병',[rule('@element-attack',3),rule('회심격【속성】',3)])]},
  bow:{label:'활',defaultType:'element',types:[profile('element','속성',[rule('@element-attack',3),rule('회심격【속성】',3),rule('차지 마스터',3)]),profile('raw','물리',[rule('연격',1)])]},
  'hunting-horn':{label:'수렵피리',defaultType:'element',types:[profile('element','속성',[rule('@element-attack',3)]),profile('raw','물리',[rule('연격',1)])]},
  'dual-blades':{label:'쌍검',defaultType:'element',types:[profile('element','속성',[rule('@element-attack',3),rule('연격',1)])]}
}};
assert.equal(M.recommend(db,catalog,null).available,false);
assert.equal(M.recommend(db,{...catalog,game:'world'},{kind:'gunlance'}).available,false,'reject another game catalog');
let r=M.recommend(db,catalog,{kind:'gunlance'});
assert.equal(r.needsType,true,'unknown shell must not silently become normal');assert.equal(r.skills.length,0);
for(const [shell,wanted,unwanted]of [['normal','연격','집중'],['long','연격','집중'],['wide','집중','연격']]){
  r=M.recommend(db,catalog,{kind:'gunlance',shell});assert.equal(r.type,shell);assert.ok(r.core.some(s=>s.name===wanted));assert.ok(!r.skills.some(s=>s.name===unwanted));
}
for(const [focus,shell]of [['attack','normal'],['affinity','long'],['element','wide']])assert.equal(M.recommend(db,catalog,{kind:'gunlance',gogConfig:{intensification:focus}}).type,shell);
assert.equal(M.recommend(db,catalog,{kind:'gunlance',shellType:'확산형'}).type,'wide');
assert.equal(M.recommend(db,catalog,{kind:'gunlance',shell:{kind:'long'}}).type,'long');
assert.equal(M.recommend(db,catalog,{kind:'gunlance',shell:'wide',gogConfig:{intensification:'attack'}}).type,'wide');
assert.equal(M.recommend(db,catalog,{kind:'gunlance',shell:'wide'},{type:'normal'}).type,'normal','manual override is allowed');
assert.equal(M.recommend(db,catalog,{kind:'gunlance',shell:'wide'},{type:'stale-type'}).type,'wide','ignore stale per-weapon selections');
const enrichedDB={...db,weapons:[{id:'catalog:gl',kind:'gunlance',shell:'long'},{id:'catalog:cb',kind:'charge-blade',phial:'impact'},{id:'catalog:lbg',kind:'light-bowgun',ammo:[{kind:'normal',capacity:4},{kind:'fire',capacity:6}]}]};
assert.equal(M.recommend(enrichedDB,catalog,{id:'personal:1',kind:'gunlance',originId:'catalog:gl'}).type,'long','old personal copies inherit omitted metadata');
assert.equal(M.recommend(enrichedDB,catalog,{id:'catalog:cb',kind:'charge-blade'}).type,'impact');
assert.equal(M.recommend(enrichedDB,catalog,{kind:'gunlance',originId:'catalog:gl',gogConfig:{intensification:'element'}}).type,'wide','personal Gog focus beats catalog fallback');
let ammoCatalog=structuredClone(catalog);ammoCatalog.weapons['light-bowgun'].types.push(profile('spread','산탄',[]),profile('pierce','관통탄',[]),profile('sticky','철갑유탄',[]));
let supported=M.recommend(enrichedDB,ammoCatalog,{kind:'light-bowgun',originId:'catalog:lbg'},{type:'element',element:'ice'});
assert.deepEqual(supported.types.map(t=>t.id),['normal','element']);assert.deepEqual(supported.availableElements,['fire']);assert.equal(supported.needsElement,true,'unsupported ammo element does not earn recommendations');
supported=M.recommend(enrichedDB,ammoCatalog,{kind:'light-bowgun',originId:'catalog:lbg',gogConfig:{element:'fire'}},{type:'element',element:'ice'});
assert.equal(supported.types.length,5,'Gog configuration keeps manual ammo choices');assert.equal(supported.element,'ice');
assert.equal(M.recommend(db,catalog,{kind:'charge-blade'}).needsType,true);
for(const phial of ['element','power-element',{kind:'element'},'강속성병'])assert.equal(M.recommend(db,catalog,{kind:'charge-blade',phial}).type,'element');
assert.equal(M.recommend(db,catalog,{kind:'charge-blade',phial:'impact'}).type,'impact');
assert.equal(M.recommend(db,catalog,{kind:'switch-axe',phial:{kind:'power'}}).type,'power');
assert.equal(M.recommend(db,catalog,{kind:'switch-axe',phial:{kind:'element'}}).type,'element');
for(const kind of ['exhaust','poison','paralyze','dragon']){const other=M.recommend(db,catalog,{kind:'switch-axe',phial:{kind}});assert.equal(other.type,'power','other phials use general physical allocation');assert.ok(other.automaticNote.includes('강격병 이외'),'other phials are not called power phials');}
assert.equal(M.recommend(db,catalog,{kind:'switch-axe'}).needsType,true);
for(const element of ['none','poison','paralysis'])assert.equal(M.recommend(db,catalog,{kind:'switch-axe',phial:{kind:'element'},gogConfig:{element}}).type,'power','known non-elemental SA does not assume elemental phial damage');
assert.equal(M.recommend(db,catalog,{kind:'switch-axe',gogConfig:{element:'poison'}}).type,'power','known status alone is sufficient for physical allocation');
assert.ok(!M.recommend(db,catalog,{kind:'switch-axe',phial:{kind:'element'}}).skills.some(s=>s.name==='회심격【속성】'),'unconfirmed element is insufficient for Critical Element');
assert.ok(!M.recommend(db,catalog,{kind:'switch-axe',gogConfig:{element:'poison'}},{type:'element'}).skills.some(s=>s.name==='회심격【속성】'),'manual elemental profile does not authorize an ineffective elemental skill');
assert.ok(M.recommend(db,catalog,{kind:'switch-axe',phial:{kind:'element'},gogConfig:{element:'fire'}}).skills.some(s=>s.name==='회심격【속성】'));
assert.equal(M.recommend(db,catalog,{kind:'bow',specials:[{kind:'element',element:'dragon'}]}).type,'element');
assert.equal(M.recommend(db,catalog,{kind:'bow',specials:[]}).type,'raw');
assert.equal(M.recommend(db,catalog,{kind:'bow',gogConfig:{element:'none'}}).type,'raw');
assert.equal(M.recommend(db,catalog,{kind:'bow',gogConfig:{element:'fire'}}).type,'element');
assert.equal(M.recommend(db,catalog,{kind:'bow',gogConfig:{element:''},specials:[]}).needsType,true,'incomplete Gog element is not assumed raw');
assert.equal(M.recommend(db,catalog,{kind:'bow',specials:[{kind:'status',status:'poison'}]}).type,'raw');
assert.equal(M.recommend(db,catalog,{kind:'bow'}).needsType,true,'missing element data does not assume elemental or raw');
assert.equal(M.recommend(db,catalog,{kind:'bow',specials:[{kind:'element',element:'fire'}]},{type:'raw'}).type,'raw');
for(const kind of ['bow','hunting-horn']){
  assert.equal(M.recommend(db,catalog,{kind,specials:[]}).type,'raw');
  assert.equal(M.recommend(db,catalog,{kind,specials:[{kind:'element',element:'fire',value:350}]}).type,'element');
  for(const value of [0,-1]){const noElement=M.recommend(db,catalog,{kind,specials:[{kind:'element',element:'fire',value}]});assert.equal(noElement.type,'raw');assert.equal(noElement.element,'');assert.ok(!noElement.skills.some(s=>s.name==='불속성 공격 강화'));}
  assert.equal(M.recommend(db,catalog,{kind,gogConfig:{element:'ice'},specials:[{kind:'element',element:'fire',value:0}]}).type,'element');
  assert.equal(M.recommend(db,catalog,{kind,gogConfig:{element:'ice'},specials:[{kind:'element',element:'fire',value:0}]}).element,'ice');
}
for(const weapon of [{kind:'bow',gogConfig:{element:'poison'}},{kind:'bow',specials:[{kind:'status',element:'paralysis',value:100}]},{kind:'bow',specials:[],coatings:['paralysis']}]){
  const status=M.recommend(db,catalog,weapon,{type:'element'});assert.ok(status.skills.some(s=>s.name==='차지 마스터'),'Charge Master also affects status buildup');assert.ok(!status.skills.some(s=>s.name==='회심격【속성】'),'Critical Element does not affect status buildup');
}
for(const weapon of [{kind:'bow'},{kind:'bow',specials:[]},{kind:'bow',specials:[{kind:'status',element:'poison',value:0}]}])assert.ok(!M.recommend(db,catalog,weapon,{type:'element'}).skills.some(s=>s.name==='차지 마스터'),'Charge Master requires actual element or status buildup');
const criticalAmmo={kind:'heavy-bowgun',ammo:[{kind:'flaming',capacity:6}]};assert.ok(!M.recommend(db,catalog,criticalAmmo,{type:'element'}).skills.some(s=>s.name==='회심격【속성】'));assert.ok(M.recommend(db,catalog,criticalAmmo,{type:'element',element:'fire'}).skills.some(s=>s.name==='회심격【속성】'));
const literalCatalog=structuredClone(catalog);literalCatalog.weapons.bow.types[0].skills.push(rule('물속성 공격 강화',3));assert.ok(!M.recommend(db,literalCatalog,{kind:'bow',gogConfig:{element:'fire'}}).skills.some(s=>s.name==='물속성 공격 강화'),'literal elemental skills must match as well');
// Reproduce persisted Gog output, including a status weapon that still has an element phial.
require('../dist/gog-data.js');const G=require('../dist/gog-artian.js');
for(const element of ['poison','paralysis','none']){
  const config={...G.emptyConfig('switch-axe'),element,intensification:'element',restoration:Array.from({length:5},()=>({type:'attack',tier:'I'}))};
  const calculated=G.calculate('switch-axe',config);if(element!=='none')assert.equal(calculated.phial.kind,'element');
  const actual=M.recommend(db,catalog,{...calculated,gogConfig:config});assert.equal(actual.type,'power');assert.ok(!actual.skills.some(s=>s.name==='회심격【속성】'||s.name.includes('속성 공격 강화')));
}
assert.equal(M.recommend(db,catalog,{kind:'light-bowgun'}).needsType,true,'ammo type cannot be inferred from generic weapon kind');
for(const rapid of [true,undefined])assert.ok(M.recommend(db,catalog,{kind:'light-bowgun',ammo:[{kind:'normal',capacity:4,rapid}]},{type:'normal'}).skills.some(s=>s.name==='속사 강화'));
r=M.recommend(db,catalog,{kind:'light-bowgun',ammo:[{kind:'normal',capacity:4,rapid:false}]},{type:'normal'});assert.ok(!r.skills.some(s=>s.name==='속사 강화'));assert.deepEqual(r.omittedSkills,['속사 강화']);assert.ok(r.automaticNote.includes('속사를 지원하지 않아'));
assert.ok(M.recommend(db,catalog,{kind:'light-bowgun',ammo:[{kind:'normal',capacity:4,rapid:false},{kind:'normal',capacity:3,rapid:true}]},{type:'normal'}).skills.some(s=>s.name==='속사 강화'),'one supported rapid level is sufficient');
assert.ok(M.recommend(db,catalog,{kind:'light-bowgun',gogConfig:{element:'fire'},ammo:[{kind:'normal',capacity:4,rapid:false}]},{type:'normal'}).skills.some(s=>s.name==='속사 강화'),'Gog ammo requires manual user selection');
for(const [ammo,element,name]of [['flaming','fire','불속성 공격 강화'],['freeze','ice','얼음속성 공격 강화']]){
  const elemental=M.recommend(db,catalog,{kind:'light-bowgun',ammo:[{kind:ammo,capacity:5,rapid:false}]},{type:'element',element});assert.deepEqual(elemental.availableElements,[element]);assert.equal(elemental.element,element);assert.ok(elemental.skills.some(s=>s.name===name));assert.ok(!elemental.skills.some(s=>s.name==='집중'));assert.deepEqual(elemental.omittedSkills,['집중']);
  assert.ok(M.recommend(db,catalog,{kind:'light-bowgun',ammo:[{kind:ammo,capacity:5,rapid:true}]},{type:'element',element}).skills.some(s=>s.name==='집중'));
}
r=M.recommend(db,catalog,{kind:'light-bowgun',gogConfig:{element:'fire'}},{type:'element'});
assert.equal(r.needsElement,true);assert.ok(!r.skills.some(s=>s.name.includes('속성 공격')),'parts element is not selected ammo');
r=M.recommend(db,catalog,{kind:'light-bowgun'},{type:'element',element:'용'});assert.equal(r.element,'dragon');assert.ok(r.core.some(s=>s.name==='용속성 공격 강화'));
r=M.recommend(db,catalog,{kind:'heavy-bowgun',ammo:[{kind:'normal',capacity:4}]},{type:'hybrid'});assert.ok(!r.types.some(t=>t.id==='element'||t.id==='hybrid'));assert.equal(r.needsType,true);
r=M.recommend(db,catalog,{kind:'heavy-bowgun',ammo:[{kind:'normal',capacity:4},{kind:'water',capacity:5}]},{type:'hybrid'});assert.equal(r.type,'hybrid');assert.equal(r.needsElement,true);
r=M.recommend(db,catalog,{kind:'heavy-bowgun',ammo:[{kind:'water',capacity:5}]},{type:'hybrid',element:'water'});assert.equal(r.needsElement,false);assert.ok(r.skills.some(s=>s.name==='물속성 공격 강화'));assert.ok(M.html(db,catalog,{kind:'heavy-bowgun',ammo:[{kind:'water',capacity:5}]},{},{type:'hybrid'}).includes('id="weapon-meta-element"'));
for(const [element,name]of [['fire','불'],['water','물'],['thunder','번개'],['ice','얼음'],['dragon','용']]){
  r=M.recommend(db,catalog,{kind:'dual-blades',specials:[{kind:'element',element,value:100}]});assert.ok(r.core.some(s=>s.name===name+'속성 공격 강화'));
}
for(const element of ['none','poison','sleep','paralysis','blast',''])assert.ok(!M.recommend(db,catalog,{kind:'dual-blades',gogConfig:{element}}).skills.some(s=>s.name.includes('속성 공격')));
assert.equal(M.recommend(db,catalog,{kind:'dual-blades',gogConfig:{element:'none'},specials:[{kind:'element',element:'fire'}]}).element,'','explicit current no-element beats stale special data');
r=M.recommend(db,catalog,{kind:'dual-blades',specials:[{kind:'element',element:'fire'},{kind:'element',element:'ice'}]});assert.equal(r.element,'','ambiguous element does not pick one');
const hostile=structuredClone(catalog);hostile.weapons.gunlance.types[2].skills.push(rule('없는 스킬',2),rule('연격',99),rule('포술',1,'optional'),{...rule('집중',2),reason:'<script>bad</script>',sources:['bad']});
r=M.recommend(db,hostile,{kind:'gunlance',shell:'wide'});assert.ok(!r.skills.some(s=>s.name==='없는 스킬'));assert.equal(r.skills.find(s=>s.name==='연격').level,5);assert.equal(r.skills.filter(s=>s.name==='포술').length,1);assert.equal(r.skills.find(s=>s.name==='포술').level,3);
hostile.weapons.gunlance.types[2].description='<img src=x onerror=alert(1)>';
let rendered=M.html(db,hostile,{kind:'gunlance',shell:'wide'},{[id('포술')]:3});assert.ok(rendered.includes('&lt;img'));assert.ok(!rendered.includes('href="javascript:'));assert.ok(rendered.includes('포술 Lv 3 반영됨'));assert.ok(rendered.includes('aria-labelledby="weapon-meta-heading"'));
// Exercise actual mount callbacks without a browser. Changing a profile must not add any targets.
const weapon={kind:'gunlance',shell:'wide',gogConfig:{element:'dragon'}},targets={[id('연격')]:5,[id('집중')]:3};let selection={},added=null,selectionChanged=null;
const typeInput={value:'normal'},elementInput={value:'ice'},single={dataset:{metaSkill:id('포술')}},all={};
global.document={querySelector:()=>({querySelector:selector=>({'#weapon-meta-type':typeInput,'#weapon-meta-element':elementInput,'#weapon-meta-add-core':all}[selector]),querySelectorAll:()=>[single]})};
M.mount({db,catalog,getWeapon:()=>weapon,getTargets:()=>targets,getSelection:()=>selection,onSelection:value=>{selectionChanged=value;},onAdd:value=>{added=value;}});
assert.equal(added,null);typeInput.onchange();assert.deepEqual(selectionChanged,{type:'normal'});assert.equal(added,null);assert.deepEqual(targets,{[id('연격')]:5,[id('집중')]:3});
single.onclick();assert.deepEqual(added,{...targets,[id('포술')]:3});added=null;all.onclick();assert.equal(added[id('집중')],3);assert.equal(added[id('연격')],5);assert.equal(added[id('포술')],3);assert.equal(added[id('포탄 장전')],2);assert.equal(added[id('가드 성능')],3);assert.ok(!added[id('용속성 공격 강화')],'core bulk does not add optional skills');
selection={type:'element'};elementInput.onchange();assert.deepEqual(selectionChanged,{type:'element',element:'ice'});
delete global.document;
console.log('PASS weapon meta: shell/phial detection, explicit ammo and element, dynamic elements, profile isolation, DB validation, escaped sources, explicit max-merged target additions');
