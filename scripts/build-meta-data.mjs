import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const db=JSON.parse(await fs.readFile(path.join(root,'data/database.json'),'utf8'));
const catalog={game:'wilds',version:1,dbVersion:'1.041',researchedAt:'2026-09-15',sources:{},weapons:{}};
for(const name of ['melee','specialist','gunlance']){
  const fragment=JSON.parse(await fs.readFile(path.join(root,`data/meta-research-${name}.json`),'utf8'));
  for(const key of ['sources','weapons'])for(const [id,value] of Object.entries(fragment[key])){
    if(catalog[key][id])throw new Error('Duplicate meta '+key+': '+id);
    catalog[key][id]=value;
  }
}
const kinds=new Set(db.weapons.map(w=>w.kind));
if(kinds.size!==14||Object.keys(catalog.weapons).length!==14)throw new Error('Expected all 14 weapon kinds');
for(const [id,source] of Object.entries(catalog.sources)){
  if(!source.title||new URL(source.url).protocol!=='https:')throw new Error('Invalid source: '+id);
}
const checkSources=ids=>{if(!ids?.length||ids.some(id=>!catalog.sources[id]))throw new Error('Missing meta source: '+ids);};
for(const [kind,weapon] of Object.entries(catalog.weapons)){
  if(!kinds.has(kind)||!weapon.label||!weapon.types?.length)throw new Error('Invalid weapon profile: '+kind);
  const typeIds=new Set();
  for(const type of weapon.types){
    if(typeIds.has(type.id))throw new Error('Duplicate subtype: '+kind+'/'+type.id);
    typeIds.add(type.id);checkSources(type.sourceIds);
    if(!type.skills.some(s=>s.priority==='core'))throw new Error('No core recommendation: '+kind+'/'+type.id);
    const names=new Set();
    for(const entry of type.skills){
      const skill=db.skills.find(s=>s.name===entry.name);
      if(!skill&&entry.name!=='@element-attack')throw new Error('Unknown meta skill: '+entry.name);
      if(!Number.isInteger(entry.level)||entry.level<1||entry.level>(skill?.maxLevel||3))throw new Error('Invalid meta level: '+entry.name);
      if(!['core','optional'].includes(entry.priority)||!entry.reason||names.has(entry.name))throw new Error('Invalid meta entry: '+entry.name);
      names.add(entry.name);checkSources(entry.sources);
    }
  }
  if(weapon.defaultType&&!typeIds.has(weapon.defaultType))throw new Error('Invalid default subtype: '+kind);
}
await fs.writeFile(path.join(root,'data/weapon-meta.json'),JSON.stringify(catalog,null,2)+'\n');
await fs.writeFile(path.join(root,'dist/weapon-meta-data.js'),'/* Wilds 1.041 community meta recommendations. Research sources are embedded. */\nglobalThis.WILDS_WEAPON_META = '+JSON.stringify(catalog)+';\n');
console.log('Weapon meta: '+kinds.size+' kinds, '+Object.values(catalog.weapons).reduce((n,w)=>n+w.types.length,0)+' profiles');
