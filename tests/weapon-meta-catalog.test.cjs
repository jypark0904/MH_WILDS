const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const db=require('../data/database.json');
const catalog=require('../data/weapon-meta.json');
const M=require('../dist/weapon-meta.js');
assert.equal(catalog.game,'wilds');
assert.equal(Object.keys(catalog.weapons).length,14);
let profiles=0;
for(const [kind,entry] of Object.entries(catalog.weapons))for(const type of entry.types){
  const r=M.recommend(db,catalog,{kind,element:'dragon'},{type:type.id,element:'dragon'});
  assert.equal(r.type,type.id,kind+' profile must be selectable');
  assert.ok(r.core.length>=2,kind+' must have core recommendations');
  assert.equal(r.skills.length,type.skills.length,kind+'/'+type.id+' all catalog skills must resolve');
  assert.ok(r.sources.length>0,kind+' sources');
  for(const skill of r.skills){assert.ok(db.skills.some(s=>s.id===skill.id&&s.maxLevel>=skill.level));assert.ok(skill.reason);}
  profiles++;
}
for(const [focus,type] of [['attack','normal'],['affinity','long'],['element','wide']]){
  const r=M.recommend(db,catalog,{kind:'gunlance',gogConfig:{intensification:focus,element:'dragon'}});
  assert.equal(r.type,type);
  const core=r.core.map(s=>s.name);
  for(const name of ['포술','포탄 장전','가드 성능'])assert.ok(core.includes(name));
  if(type==='wide')assert.ok(core.includes('집중'));
  else{assert.ok(core.includes('연격'));assert.ok(!r.skills.some(s=>s.name==='집중'));}
  assert.ok(!r.skills.some(s=>s.name==='포스샷'));
}
for(const w of db.weapons.filter(w=>w.kind==='gunlance')){
  assert.ok(w.shell,w.name+' shell metadata');
  const r=M.recommend(db,catalog,{id:'personal:'+w.id,originId:w.id,kind:w.kind});
  assert.equal(r.type,w.shell,w.name+' old personal catalog fallback');
}
for(const w of db.weapons.filter(w=>w.kind==='charge-blade')){
  assert.ok(['impact','element'].includes(w.phial),w.name+' phial metadata');
  const r=M.recommend(db,catalog,w);
  assert.equal(r.type,w.phial);
  if(w.phial==='element')assert.ok(!r.skills.some(s=>s.name==='포술'));
}
for(const w of db.weapons.filter(w=>['light-bowgun','heavy-bowgun'].includes(w.kind))){
  assert.ok(Array.isArray(w.ammo)&&w.ammo.length,w.name+' ammo metadata');
  const r=M.recommend(db,catalog,w);
  assert.equal(r.needsType,true,w.name+' main ammo choice required');
  for(const type of r.types){
    if(['normal','pierce','spread'].includes(type.id))assert.ok(w.ammo.some(a=>a.kind===type.id&&a.capacity>0));
  }
  const normalKind=k=>({flaming:'fire',freeze:'ice'}[k]||k);
  const supported=[...new Set(w.ammo.filter(a=>a.capacity>0).map(a=>normalKind(a.kind)).filter(k=>['fire','water','thunder','ice','dragon'].includes(k)))];
  assert.deepEqual([...r.availableElements].sort(),supported.sort(),w.name+' exact elemental ammo support');
  if(w.kind==='light-bowgun')for(const type of r.types){
    for(const element of type.id==='element'?supported:['']){
      const recommendation=M.recommend(db,catalog,w,{type:type.id,element});
      const selected=w.ammo.filter(a=>normalKind(a.kind)===(type.id==='element'?element:type.id)&&a.capacity>0);
      if(selected.length&&selected.every(a=>a.rapid===false))assert.ok(!recommendation.skills.some(s=>['속사 강화','집중'].includes(s.name)),w.name+' nonrapid ammo');
    }
  }
}
// Offline data script must exactly expose the reviewed catalog.
const scope={};vm.runInNewContext(fs.readFileSync(require.resolve('../dist/weapon-meta-data.js'),'utf8'),scope);
assert.equal(JSON.stringify(scope.WILDS_WEAPON_META),JSON.stringify(catalog));
console.log('PASS weapon meta catalog: 14 weapon kinds, '+profiles+' profiles, DB skill levels/sources, gunlance split, preserved shell/phial/ammo, offline data');
