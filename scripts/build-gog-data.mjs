import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const raw=JSON.parse(await fs.readFile(path.join(root,'data/raw/weapons.json'),'utf8'));
const research=JSON.parse(await fs.readFile(path.join(root,'data/gog-rules.json'),'utf8'));
const db=JSON.parse(await fs.readFile(path.join(root,'data/database.json'),'utf8'));
const profiles={};
for(const kind of Object.keys(research.perKind)){
  const candidates=raw.filter(w=>w.kind===kind&&w.rarity===8&&!w.series);
  const variants={};
  for(const focus of ['attack','affinity','element']){
    const expected=research.common.focus[focus];
    const list=candidates.filter(w=>w.damage.raw===190+expected.raw&&w.affinity===5+expected.affinity);
    if(list.length!==1)throw new Error('Ambiguous Gog base: '+kind+'/'+focus);
    const w=list[0];
    if(w.slots.join(',')!=='3,3,3'||w.skills.length!==0)throw new Error('Unexpected Gog slots or skills');
    variants[focus]={originId:'w:'+kind+':'+w.gameId,name:w.name,rawAttack:w.damage.raw,affinity:w.affinity,sharpness:w.sharpness||null,shell:w.shell||null,shellLevel:w.shellLevel??null,phial:w.phial||null,ammo:w.ammo||null};
  }
  const r=research.perKind[kind],elements={};
  for(const [family,key]of [['element','elementBase'],['statusHigh','poisonBlastBase'],['statusLow','paralysisSleepBase']]){
    const base=typeof r[key]==='object'&&r[key]!==null?r[key].blast:r[key];
    elements[family]=Object.fromEntries(Object.entries(r.focusElementDelta).map(([focus,delta])=>[focus,Number.isFinite(base)?base+(family!=='element'&&focus==='element'&&r.statusElementFocusDelta!==undefined?r.statusElementFocusDelta:delta):null]));
  }
  const w=candidates.find(w=>w.name===variants.attack.name);
  profiles[kind]={kind,name:variants.attack.name,artianNames:raw.filter(x=>x.kind===kind&&!x.series&&x.name!==variants.attack.name).map(x=>x.name),multiplier10:Math.round(w.damage.display/w.damage.raw*10),intensifications:variants,elements,infusion3:r.infusion3||0,elementBonus:r.elementRestoration||{},noNumericElementFor:r.noNumericElementFor||[],elementMeansAmmoType:!!r.elementMeansAmmoType};
}
const excludedTags=['화무의 기도','용화의 기도','몽화의 기도','축요의 기도','영광의 명예','축제 순례','권의 극에 달한 자'];
const allowedTags=Object.fromEntries(['set','group'].map(kind=>[kind,db.skills.filter(s=>s.kind===kind&&!excludedTags.includes(s.name)).map(s=>s.id)]));
if(allowedTags.set.length!==21||allowedTags.group.length!==14)throw new Error('Gog skill pool requires verification');
const out={schemaVersion:1,checked:research.checked,profiles,bonuses:research.common.restoration,tiers:Object.fromEntries(Object.entries(research.common.afterGogRerollAllowed).map(([type,levels])=>[type,[...new Set(['I',...levels])]])),maxIdenticalTier:research.common.maxEachExactTier,sources:[...research.sources,{id:'GLCurrent',url:'https://gamewith.jp/mhwilds/536459',description:'Current Gog gunlance focus elemental/status values, verified against post1.011 base and actual build'},{id:'GLRegression',url:'https://gamewith.jp/mhwilds/484932',description:'Fire normal: attackEX2 elementEX2 sharpnessEX1, productionattack3, attack549 element620 affinity-10'}]};
out.allowedTags=allowedTags;
await fs.writeFile(path.join(root,'dist/gog-data.js'),'/* Verified Gog Artian rules; see data/gog-rules.json and README.md. */\nglobalThis.WILDS_GOG_DATA = '+JSON.stringify(out)+';\n');
console.log('Gog profiles: '+Object.keys(profiles).length+' weapons / 42 intensifications');
