import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const read=async name=>JSON.parse(await fs.readFile(path.join(root,'data/raw',name+'.json'),'utf8'));
const [rawSkills,rawArmor,rawSets,rawDecorations,rawCharms,rawWeapons,manifest]=await Promise.all(['skills','armor','armor-sets','decorations','charms','weapons','manifest'].map(read));
const transcendence=JSON.parse(await fs.readFile(path.join(root,'data/transcendence.json'),'utf8'));
const transcendedByName=new Map(transcendence.armor.map(a=>[a.nameKo,a]));
const upgradeRules=new Map(transcendence.defenseUpgradeRules.map(r=>[r.rarity,r]));
const fullSets=new Map(transcendence.fullArmorSets.flatMap(s=>s.namesKo.map(n=>[n,'full:'+s.armorSetGameId])));
const skillIds=new Map(rawSkills.map(s=>[s.id,'s'+s.gameId]));
const rawSkillMap=new Map(rawSkills.map(s=>[s.id,s]));
const normalizeSkills=ranks=>Object.fromEntries(ranks.filter(r=>!['set','group'].includes(rawSkillMap.get(r.skill.id)?.kind)).map(r=>[skillIds.get(r.skill.id),r.level]));
const tags=ranks=>Object.fromEntries(ranks.filter(r=>['set','group'].includes(rawSkillMap.get(r.skill.id)?.kind)).map(r=>[skillIds.get(r.skill.id),1]));
const skills=rawSkills.map(s=>({id:skillIds.get(s.id),name:s.name,kind:s.kind,maxLevel:Math.max(...s.ranks.map(r=>r.level)),description:s.description||'',ranks:s.ranks.map(r=>({level:r.level,name:r.name||'',description:r.description||'',pieces:r.setPiecesRequired||null}))}));
const setMap=new Map(rawSets.map(s=>[s.id,s]));
const armor=rawArmor.map(a=>({id:'a:'+a.kind+':'+a.name,sourceId:a.id,name:a.name,kind:a.kind,rank:a.rank,rarity:a.rarity,defense:a.defense.base,maxDefense:a.defense.max,resistances:a.resistances,slots:a.slots.map(level=>({kind:'armor',level})),skills:normalizeSkills(a.skills),tags:tags(a.skills),setName:setMap.get(a.armorSet?.id)?.name||'',description:a.description,materials:(a.crafting?.materials||[]).map(m=>({name:m.item.name,quantity:m.quantity})),linkedSet:/^고우키|^고우케|^고우/.test(a.name)&&a.skills.some(s=>rawSkillMap.get(s.skill.id)?.name==='권의 극에 달한 자')?'akuma':null}));
const decorations=rawDecorations.map(d=>({id:'d'+d.gameId,name:d.name,kind:d.kind,level:d.slot,rarity:d.rarity,skills:normalizeSkills(d.skills),description:d.description}));
for(const a of armor){
  const rule=upgradeRules.get(a.rarity);if(!rule)throw new Error('Missing defense upgrade rule: '+a.rarity);
  a.sourceMaxDefense=a.maxDefense;a.maxDefense=a.defense+rule.normalMaxDefenseBonus;
  a.linkedSet=fullSets.get(a.name)||null;
  if(a.rank==='high'){
    const t=transcendedByName.get(a.name);
    if(a.rarity<=6&&!t)throw new Error('Missing exact transcendence slots: '+a.name);
    if(t&&JSON.stringify(t.baseSlots.filter(n=>n>0))!==JSON.stringify(a.slots.map(s=>s.level)))throw new Error('Base slots mismatch: '+a.name);
    a.limitBreak={maxDefense:a.defense+rule.transcendedMaxDefenseBonus,slots:t?t.transcendedSlots.filter(n=>n>0).map(level=>({kind:'armor',level})):a.slots};
  }
}
const charms=rawCharms.flatMap(c=>c.ranks.map(r=>({id:'c'+c.gameId+':'+r.level,name:r.name,rarity:r.rarity,random:!!(c.random||c.randomized),skills:normalizeSkills(r.skills),tags:tags(r.skills),slots:[],description:r.description,materials:(r.crafting?.materials||[]).map(m=>({name:m.item.name,quantity:m.quantity}))})));
const weapons=rawWeapons.map(w=>({id:'w:'+w.kind+':'+w.gameId,name:w.name,kind:w.kind,rarity:w.rarity,skills:normalizeSkills(w.skills),tags:tags(w.skills),slots:w.slots.map(level=>({kind:'weapon',level})),attack:w.damage.display,rawAttack:w.damage.raw,affinity:w.affinity,defense:w.defenseBonus||0,series:w.series?.name||'',description:w.description,specials:(w.specials||[]).map(s=>({kind:s.kind,element:s.element||s.status,value:s.damage?.display||0})),sharpness:w.sharpness||null}));
const bonuses=skills.filter(s=>['set','group'].includes(s.kind)).map(s=>({id:s.id,name:s.name,kind:s.kind,ranks:s.ranks}));
// Preserve weapon mechanics for subtype recommendations, including old catalog copies via originId.
for(let i=0;i<weapons.length;i++){
  const raw=rawWeapons[i],weapon=weapons[i];
  for(const key of ['shell','shellLevel','phial','ammo','specialAmmo','coatings']){
    if(raw[key]!==undefined&&raw[key]!==null)weapon[key]=raw[key];
  }
}
const db={meta:{game:'wilds',title:'몬스터헌터 와일즈',locale:'ko',schemaVersion:1,retrievedAt:manifest.retrievedAt,sourceVersion:manifest.version.version,status:'snapshot',coverage:'1.041 장비 콘텐츠 · MHDB 전체 한국어 스냅샷 + 한계돌파 보정',sources:manifest.sources,supplements:[{name:'한계돌파 슬롯 · GameWith',url:'https://gamewith.jp/mhwilds/536246'},{name:'한계돌파 슬롯 교차 확인 · Game8',url:'https://game8.jp/mhwilds/749580'},{name:'최대 방어력 보정 · 게임 업그레이드 데이터',url:'https://github.com/LartTyler/mhdb-wilds-data/blob/main/output/merged/ArmorUpgrade.json'}],limitations:['1.041 장비 콘텐츠 기준입니다. 이후 패치의 신규 장비는 DB 갱신이 필요합니다.','수렵 완료로 체크한 방어구 세트만 검색합니다. 상위는 항상 한계돌파 후 슬롯·최대 방어력으로 계산합니다.']},skills,armor,decorations,charms,weapons,bonuses};
for(const collection of [skills,armor,decorations,charms,weapons]){const ids=new Set();for(const item of collection){if(ids.has(item.id))throw new Error('Duplicate ID '+item.id);ids.add(item.id);if(!item.name)throw new Error('Missing Korean name');}}
for(const collection of [armor,decorations,charms,weapons])for(const item of collection){for(const id of Object.keys(item.skills)){if(!skills.some(s=>s.id===id))throw new Error('Unknown skill '+id);}for(const slot of item.slots||[]){if(!['armor','weapon'].includes(slot.kind)||![1,2,3].includes(slot.level))throw new Error('Invalid slot '+item.id);}}
await fs.writeFile(path.join(root,'dist/data.js'),'/* Korean Monster Hunter Wilds snapshot. Sources: data/raw/manifest.json */\nglobalThis.WILDS_DB = '+JSON.stringify(db)+';\n');
await fs.writeFile(path.join(root,'data/database.json'),JSON.stringify(db));
console.log(JSON.stringify({skills:skills.length,armor:armor.length,decorations:decorations.length,charms:charms.length,fixedCharms:charms.filter(c=>!c.random).length,weapons:weapons.length,bonuses:bonuses.length}));
