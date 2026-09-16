import fs from 'node:fs';
const read=name=>JSON.parse(fs.readFileSync('data/'+name+'.json','utf8'));
const common=read('damage-research-skills'),gl=read('damage-research-gunlance'),db=read('database');
const catalog={game:'wilds',version:1,dbVersion:'1.041',researchedAt:'2026-09-16',sources:{},rules:{},burst:{},critElement:{},profiles:{},defaults:{},utilitySkills:[]};
catalog.sources['sharpness-wilds']={title:'まかろん — Wilds 피해 공식·예리도 수치',url:'https://macarongamemo.com/entry/mhwilds-damage_calculation',note:'예리도·기본 회심 표만 사용. 현행 용항·피리 등 특수 공격은 TU4 자료 우선.'};
for(const [prefix,data]of [['skills',common],['gl',gl]])for(const [id,source]of Object.entries(data.sources))if(source.url)catalog.sources[prefix+':'+id]=source;
const condition={enraged:'anger',maximumMightActive:'stamina',offensiveGuardActive:'guard',counterstrikeActive:'counter',adrenalineRushActive:'evade',redHealth:'redHealth',fullHealth:'fullHealth',healthAtMost35Percent:'lowHealth',burstFull:'burst',coalescenceActive:'coalescence'};
function convert(e={}){const out={};for(const [key,value]of Object.entries(e)){const map={rawFlat:['rawFlat',value],rawPercent:['rawMult',1+value],affinity:['affinity',value],critMultiplier:['crit',value],elementFlat:['eleFlat',value/10],elementPercent:['eleMult',1+value]};if(map[key])out[map[key][0]]=map[key][1];}return out;}
for(const source of common.rules){
  const r={levels:(source.levels||[]).map(l=>convert(l.effects)),note:(source.notes||[]).join(' '),sourceIds:source.sourceIds.map(id=>'skills:'+id)};
  if(source.applicable.kinds[0]!=='all')r.kinds=source.applicable.kinds;
  if(condition[source.conditionId])r.condition=condition[source.conditionId];
  if(source.element)r.element=source.element;
  if(source.skillname==='약점 특효'){r.special='wex';r.conditions=['wound'];r.levels.forEach((l,i)=>l.wound=source.additionalConditions[0].levels[i].effects.affinity);}
  if(source.skillname==='연격'){r.special='burst';r.note='5타 강화 상태의 발동률을 반영합니다. 1~4타 중간 단계와 연격 강화 시리즈 효과는 별도 미산정입니다.';for(const variant of source.variants)for(const kind of variant.kinds)catalog.burst[kind]={raw:variant.levels.map(l=>l.effects.rawFlat),element:variant.levels.map(l=>(l.effects.elementFlat||0)/10),unknown:variant.unknownComponents};}
  if(source.skillname==='회심격【속성】'){r.special='critElement';r.requiresElement=true;delete r.kinds;for(const kind of source.applicable.kinds)catalog.critElement[kind]=source.levels.map(l=>l.effects.criticalElement);for(const variant of source.variants)if(variant.automaticUse!==false)for(const kind of variant.kinds)catalog.critElement[kind]=variant.levels.map(l=>l.effects.criticalElement);delete catalog.critElement['light-bowgun'];}
  if(source.skillname==='전화위복'){r.special='coalescence';r.requiresElement=true;r.variants={};for(const variant of source.variants)for(const kind of variant.kinds)r.variants[kind]=variant.levels.map(l=>convert(l.effects));}
  catalog.rules[source.skillname]=r;
}
catalog.rules['힘의 해방']={condition:'latent',levels:[10,20,30,40,50].map(affinity=>({affinity})),note:'회심 증가만 반영합니다. 스태미나 절약으로 늘어나는 공격 횟수는 별도입니다.'};
catalog.rules['포술']={special:'artillery',kinds:['gunlance','charge-blade','light-bowgun','heavy-bowgun'],note:'건랜스는 기초 공격력 계열에 5/10/15%, 유탄병은 10/20/30% 적용. 건랜스 고정 화염 +3/+6/+9. 용격포 발사 시간 단축은 미산정.'};
catalog.rules['집중']={special:'focus',note:'설정한 모으기 시간에만 5/10/15% 단축을 적용한 추정입니다. 게이지 회복 변화는 별도입니다.'};
catalog.rules['포탄 장전']={special:'load',kinds:['gunlance','charge-blade'],note:'건랜스 Lv2의 탄창 +1을 반영합니다. 장전 속도 변화는 미산정이며, 확산형은 추가 탄 충전 시간을 별도로 추정합니다.'};
// Explicit utility classification: an unimplemented damage skill is never silently treated as zero.
catalog.utilitySkills=['가드 성능','가드 강화','회피 거리 UP','회피 성능','정령의 가호','방어','회복 속도','회복량 UP','체력 회복량 UP','기절 내성','독 내성','마비 내성','수면 내성','폭파 피해 내성','불 내성','물 내성','얼음 내성','번개 내성','용 내성','속성 피해 내성','귀마개','풍압 내성','내진','움찔 감소','물가/기름 진흙 적응','환경 적응','만족감','빨리 먹기','광역화','아이템 사용 강화','연구의 달인','지질학','식생학','갈무리 철인','뛰어들기','클라이머','곤충 표본의 달인','헌터 생활','납도술','숫돌 사용 고속화','런너','체술','스태미나 급속 회복','강화 지속','명검','탄환 절약','장인','달인의 재주','피리 명인','KO술','스태미나 탈취','파괴왕','백열룡의 맥동','쇄인룡의 굶주림','개룡의 수호','수호룡의 방어','수호룡의 맥동','파의룡의 수호'];
// These change uptime and cannot be represented by an unconditional zero in this model.
catalog.utilitySkills=catalog.utilitySkills.filter(n=>!['납도술','런너','체술','스태미나 급속 회복','강화 지속','명검','탄환 절약','장인','달인의 재주','피리 명인'].includes(n));
const attackById=new Map(gl.meleeAttacks.map(a=>[a.id,a]));
for(const [type,data]of Object.entries(gl.shellTypes))for(let level=1;level<=4;level++){
  const cycles=gl.representativeCycles,channels=[];
  for(const cycle of cycles){
    const start=channels.length;
    for(const hit of cycle.meleeHits){const a=attackById.get(hit.attackId);channels.push({label:a.label,rawMV:a.motionValue,eleMV:a.weaponElementMultiplier,count:hit.count});}
    for(const shell of cycle.shells){const multiplier=data[shell.mode==='fullburst'?'fullburstRawMultiplier':shell.mode==='wsfb'?'wsfbRawMultiplier':'chargedRawMultiplier'];channels.push({label:shell.mode,rawMV:data.shellMv[level-1]*multiplier,fire:data.shellFire[level-1],crit:false,sharpness:false,hitzone:false,artillery:true,shell:true,count:data.baseCapacity*shell.magazines,loadExtra:shell.magazines});}
    for(const stake of cycle.wyrmstakes){channels.push({label:'용항 틱',rawMV:data.wyrmstakeTickMv[level-1],eleMV:.5,count:stake.ticks,sharpness:false,artillery:true});channels.push({label:'용항 마지막 폭발',rawMV:data.wyrmstakeExplosionMv[level-1]*stake.explosionRawMultiplier,fire:data.wyrmstakeExplosionFire[level-1],crit:false,sharpness:false,hitzone:false,artillery:true,shell:true});}
    if(cycle.wyvernfireUses)channels.push({label:'용격포',rawMV:data.wyvernfireMv[level-1],fire:data.wyvernfireFire[level-1],count:cycle.wyvernfireUses*5,crit:false,sharpness:false,hitzone:false,artillery:true,shell:true});
    for(let i=start;i<channels.length;i++)channels[i].rotation=cycle.id;
  }
  const label=type==='normal'?'일반형 · 풀버스트 + 용항 풀버스트':type==='long'?'방사형 · 참격 + 용항포':'확산형 · 모아포격 + 용격포';
  catalog.profiles['gunlance/'+type+'@'+level]={label:label+' · 포격 위력 '+level,channels,shellLevel:level,
    note:'모든 타입에 참격·용항포·용항 풀버스트·용격포를 포함합니다. 타입별 차이는 주력 공격 묶음의 상대 빈도이며, 실측 통계가 아닌 조절 가능한 추정입니다.',
    derivation:cycles.map(c=>c.description+' '+c.assumptions.join(' ')).join(' / ')+' 용격포 후속타 불 육질 상한·연속 용항 화염 배율은 미검증. 고정 화염은 모든 타격에 지정 육질을 사용한 근사입니다.',
    rotations:cycles.map((c,i)=>({id:c.id,label:['풀버스트 반복','용항 풀버스트 연계','참격·용항포','모아포격·용격포'][i],defaultWeight:({normal:[45,30,15,10],long:[15,25,45,15],wide:[5,20,10,65]})[type][i]})),
    chargeFraction:({normal:.04,long:.06,wide:.25})[type],loadChargeTime:true,baseCapacity:data.baseCapacity};
}
if(fs.existsSync('data/damage-profiles-other.json')){
  const other=read('damage-profiles-other');Object.assign(catalog.profiles,other.profiles);Object.assign(catalog.defaults,other.defaults);Object.assign(catalog.rules,other.extraRules);for(const [id,source]of Object.entries(other.sources||{}))if(source.url)catalog.sources['weapons:'+id]=source;
}else throw new Error('Other weapon damage profiles are required.');
for(const [name,r]of Object.entries(catalog.rules))if(!db.skills.some(s=>s.name===name))throw new Error('Unknown damage skill '+name);
for(const [key,profile]of Object.entries(catalog.profiles))if(!profile.unavailable){if(!profile.channels?.length)throw new Error('Empty damage channels '+key);for(const c of profile.channels)for(const field of ['rawMV','eleMV','fire','count','loadExtra'])if(c[field]!==undefined&&(!Number.isFinite(c[field])||c[field]<0))throw new Error('Invalid channel '+key+'/'+field);}
fs.writeFileSync('data/damage-model.json',JSON.stringify(catalog,null,2)+'\n');
fs.writeFileSync('dist/damage-data.js','/* Wilds damage facts and explicitly assumed representative attacks. */\nglobalThis.WILDS_DAMAGE_DATA = '+JSON.stringify(catalog)+';\n');
console.log('Damage data: '+Object.keys(catalog.profiles).length+' profiles, '+Object.keys(catalog.rules).length+' skill rules.');
