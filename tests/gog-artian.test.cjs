'use strict';
const assert=require('node:assert/strict');
require('../dist/data.js');require('../dist/gog-data.js');
const G=require('../dist/gog-artian.js'),db=globalThis.WILDS_DB;
const bonus=(type,tier)=>({type,tier});
const golden={version:1,intensification:'attack',element:'fire',productionAttack:3,matchingParts:3,restoration:[bonus('attack','EX'),bonus('attack','EX'),bonus('element','EX'),bonus('element','EX'),bonus('sharpness','EX')]};
const gl=G.calculate('gunlance',golden);
assert.deepEqual([gl.rawAttack,gl.attack,gl.affinity,gl.elementValue,gl.shell,gl.sharpness.white],[239,549,-10,620,'normal',70]);
assert.deepEqual(gl.slots,[1,2,3].map(()=>({kind:'weapon',level:3})));
assert.deepEqual(gl.skills,{});
assert.equal(gl.sharpness.red,90);
assert.equal(Object.values(gl.sharpness).reduce((sum,n)=>sum+n,0),350);
const inherited=G.calculate('gunlance',{...golden,restoration:Array.from({length:5},()=>bonus('attack','I'))});
assert.deepEqual([inherited.rawAttack,inherited.attack,inherited.elementValue],[240,552,440]);
for(const [focus,shell,raw,affinity,element]of [['attack','normal',200,-10,440],['affinity','long',180,15,430],['element','wide',190,0,480]]){
  const c=G.calculate('gunlance',{...golden,intensification:focus,restoration:Array.from({length:5},()=>bonus('attack','I'))});
  assert.deepEqual([c.shell,c.rawAttack,c.affinity,c.elementValue],[shell,raw+40,affinity,element]);
}
const none=G.calculate('gunlance',{...golden,element:'none',productionAttack:2,restoration:Array.from({length:5},()=>bonus('attack','I'))});
assert.equal(none.rawAttack,235);assert.equal(none.affinity,-5);assert.equal(none.elementValue,0);
assert.equal(G.calculate('gunlance',{...golden,matchingParts:2}).elementValue,590);
for(const [type,value]of [['poison',470],['blast',470],['paralysis',420],['sleep',420]])assert.equal(G.calculate('gunlance',{...golden,element:type}).elementValue,value);
assert.throws(()=>G.calculate('gunlance',{...golden,restoration:[bonus('element','III'),...golden.restoration.slice(1)]}),/사용할 수 없는/);
assert.throws(()=>G.calculate('gunlance',{...golden,restoration:[bonus('attack','EX'),bonus('attack','EX'),bonus('attack','EX'),bonus('affinity','EX'),bonus('sharpness','EX')]}),/최대 2개/);
assert.throws(()=>G.calculate('gunlance',{...golden,restoration:[bonus('attack','I'),...golden.restoration.slice(1)]}),/계승한 I/);
assert.throws(()=>G.calculate('gunlance',G.emptyConfig('gunlance')),/속성을 선택/);
assert.equal(G.calculate('gunlance',G.emptyConfig('gunlance'),{allowIncomplete:true}).complete,false);
assert.equal(G.detectName('거극 아티어 건랜스',db).kind,'gunlance');
assert.equal(G.detectName('거극 아티어 건랜스',db).category,'거극 아티어');
assert.equal(G.detectName('ㅇㅇㅇ [전조의 프로페네시스]',db).kind,'gunlance');
assert.equal(G.detectName('마비용 참죄의 엘간시오',db).kind,'long-sword');
assert.equal(G.detectName('ㅇㅇㅇ [포수수]',db).kind,'gunlance');
assert.equal(G.detectName('내 헤비 보우건',db).kind,'heavy-bowgun');
assert.equal(G.detectName('활력 세팅',db).kind,undefined);
for(const [name,kind]of [['독왕','great-sword'],['귀철','hammer'],['바벨','lance'],['멜트','sword-shield']]){
  assert.equal(G.detectName('내 ['+name+']',db).kind,kind);
  assert.equal(G.detectName(name,db).category,'일반 무기');
}
assert.equal(G.detectName('내 알제네시스',db).category,'아티어');
assert.equal(G.detectName('독왕자',db).kind,undefined);
const elementAliases={dragon:['용'],fire:['화','불'],water:['수','물'],thunder:['번개','뇌'],paralysis:['마비'],poison:['독'],sleep:['수면'],blast:['폭파'],ice:['얼음','빙']};
let elementNameCases=0;
for(const [element,aliases]of Object.entries(elementAliases))for(const alias of aliases)for(const suffix of ['','속','속성']){
  const token=alias+suffix;
  for(const parts of [[token,'거극아티어','건랜스'],[token,'건랜스','거극아티어'],['거극아티어',token,'건랜스'],['건랜스',token,'거극아티어'],['거극아티어','건랜스',token],['건랜스','거극아티어',token]]){
    const match=G.detectName(parts.join(' '),db);assert.equal(match.element,element,parts.join(' '));assert.equal(match.kind,'gunlance');assert.equal(match.category,'거극 아티어');elementNameCases++;
  }
}
for(const [name,element]of [['용속거극아티어건랜스','dragon'],['전조의 프로페네시스 [뇌]','thunder'],['[빙] 전조의 프로페네시스','ice'],['거극아티어 수렵피리 수면','sleep'],['건랜스 [화/불] 거극아티어','fire'],['마비용 참죄의 엘간시오','paralysis'],['무속성 거극아티어 대검','none']])assert.equal(G.detectName(name,db).element,element,name);
for(const name of ['화력용 거극아티어 건랜스','수렵피리','용도별 건랜스','독립 건랜스','불굴 건랜스','수비 거극아티어','폭파왕자 건랜스','물리 건랜스','빙결왕 건랜스','독왕'])assert.equal(G.detectName(name,db).element,undefined,name);
for(const name of ['마비 독 거극아티어 건랜스','건랜스 독 거극아티어 마비']){const match=G.detectName(name,db);assert.equal(match.element,undefined);assert.deepEqual(match.elementAmbiguous,['poison','paralysis']);}
console.log('PASS element name detection: '+elementNameCases+' alias/suffix/order cases; boundaries, actual weapon names and conflicting elements');
const allowed=globalThis.WILDS_GOG_DATA.allowedTags;
assert.deepEqual([allowed.set.length,allowed.group.length],[21,14]);
assert.doesNotThrow(()=>G.validateTags({[allowed.set[0]]:1,[allowed.group[0]]:1}));
assert.throws(()=>G.validateTags({[allowed.set[0]]:1,[allowed.set[1]]:1}),/각각 하나씩/);
assert.throws(()=>G.validateTags({[allowed.set[0]]:2}),/부여되지 않는/);
for(const name of ['화무의 기도','용화의 기도','몽화의 기도','축요의 기도','영광의 명예','축제 순례','권의 극에 달한 자']){
  const skill=db.skills.find(s=>s.name===name);assert.ok(skill);
  assert.throws(()=>G.validateTags({[skill.id]:1}),/부여되지 않는/);
}
assert.equal(G.calculate('charge-blade',{...golden,element:'poison',intensification:'element'}).phial,'impact');
assert.equal(G.calculate('switch-axe',{...golden,element:'none',restoration:Array.from({length:5},()=>bonus('attack','I'))}).phial.kind,'dragon');
for(const [kind,name]of Object.entries(G.WEAPONS))assert.equal(G.detectName('테스트 ['+name+']',db).kind,kind);
for(const kind of Object.keys(G.WEAPONS)){
  const profile=globalThis.WILDS_GOG_DATA.profiles[kind];
  assert.equal(G.detectName('별명 '+profile.name,db).kind,kind);
  for(const focus of Object.keys(G.FOCUS)){
    const c={...golden,intensification:focus,restoration:[bonus('attack','EX'),bonus('attack','EX'),bonus('affinity','EX'),bonus('affinity','EX'),bonus(kind==='bow'?'attack':G.isBowgun(kind)?'ammo':'sharpness',kind==='bow'?'III':'EX')]};
    const result=G.calculate(kind,c);assert.equal(result.complete,true);assert.ok(Number.isFinite(result.attack));assert.ok(result.elementValue===null||Number.isFinite(result.elementValue));
  }
}
const bow=G.calculate('bow',{...golden,element:'poison',restoration:[bonus('attack','EX'),bonus('attack','EX'),bonus('affinity','EX'),bonus('affinity','EX'),bonus('attack','III')]});
assert.equal(bow.elementValue,0);assert.deepEqual(bow.specials,[]);
assert.ok(!G.bonusTypes('bow','poison').includes('element'));
assert.ok(!G.bonusTypes('heavy-bowgun','fire').includes('element'));
assert.ok(!G.bonusTypes('bow','fire').includes('sharpness'));
console.log('PASS Gog Artian: actual gunlance build 549 / -10% / fire620; inherited I; all 42 focus profiles; slots; name detection; invalid tiers; bow/bowgun rules');
