import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const data=JSON.parse(await fs.readFile(path.join(root,'data/charm-rules.json'),'utf8'));
const db=JSON.parse(await fs.readFile(path.join(root,'data/database.json'),'utf8'));
for(const pool of Object.values(data.pools))for(const [id,level]of Object.entries(pool)){
  const skill=db.skills.find(s=>s.id===id);
  if(!skill||level<1||level>skill.maxLevel)throw Error('Unknown charm pool skill: '+id);
}
for(const pattern of data.patterns){
  if(![5,6,7,8].includes(pattern.rarity)||pattern.pools.length!==3||pattern.pools.some(id=>!data.pools[id]))throw Error('Invalid charm pattern');
  for(const slot of pattern.slots)if(!['weapon','armor'].includes(slot.kind)||![1,2,3].includes(slot.level))throw Error('Invalid charm slot');
}
await fs.writeFile(path.join(root,'dist/charm-data.js'),'/* Wilds appraised charm extraction; see data/charm-rules.json. */\nglobalThis.WILDS_CHARM_RULES = '+JSON.stringify(data)+';\n');
console.log('Charm patterns: '+data.patterns.length);
