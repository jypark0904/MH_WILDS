'use strict';
const assert=require('node:assert/strict');
const db=require('../data/database.json');
const access=require('../dist/armor-access.js');
const clone=value=>structuredClone(value);
const sorted=value=>[...value].sort();
const original=JSON.stringify(db);
const groups=access.groups(db);
const byId=new Map(db.armor.map(a=>[a.id,a]));

// Default all-enabled state covers every database piece exactly once.
assert.equal(groups.length,183);
assert.equal(new Set(groups.map(g=>g.id)).size,groups.length);
const members=groups.flatMap(g=>g.armorIds);
assert.equal(members.length,db.armor.length);
assert.equal(new Set(members).size,db.armor.length);
assert.deepEqual(sorted(members),sorted(byId.keys()));
for(const group of groups){
  assert.ok(group.armorIds.length>0);
  assert.equal(group.id,group.rank+':'+group.name);
  for(const id of group.armorIds){
    const armor=byId.get(id);
    assert.equal(armor.setName,group.name);
    assert.equal(armor.rank,group.rank);
    assert.equal(armor.rarity,group.rarity);
  }
}
const allIds=groups.map(g=>g.id);
assert.deepEqual(access.setEnabled(db,[],allIds,true),[]);

// Toggling a whole set must include all five parts and preserve another set's state.
const first=groups.find(g=>g.armorIds.length===5);
const second=groups.find(g=>g.id!==first.id&&g.armorIds.length===5);
const initial=[second.armorIds[0]];
const initialCopy=clone(initial);
const excluded=access.setEnabled(db,initial,[first.id],false);
assert.deepEqual(sorted(excluded),sorted([...first.armorIds,...initial]));
assert.deepEqual(initial,initialCopy);
assert.notEqual(excluded,initial);
const twice=access.setEnabled(db,excluded,[first.id,first.id],false);
assert.equal(twice.length,new Set(twice).size);
assert.deepEqual(sorted(twice),sorted(excluded));
assert.deepEqual(access.setEnabled(db,excluded,[first.id],true),initial);
// A legacy partially excluded set becomes fully enabled or fully disabled.
assert.deepEqual(access.setEnabled(db,[first.armorIds[0]],[first.id],true),[]);
assert.deepEqual(sorted(access.setEnabled(db,[first.armorIds[0]],[first.id],false)),sorted(first.armorIds));
const noneEnabled=access.setEnabled(db,[],allIds,false);
assert.deepEqual(sorted(noneEnabled),sorted(byId.keys()));
assert.deepEqual(access.setEnabled(db,noneEnabled,allIds,true),[]);
assert.deepEqual(access.setEnabled(db,initial,['missing:set'],false),initial);

// Rank is part of the key even if future data reuse a low/high-rank set name.
const sameName={armor:[
  {id:'low-head',name:'입문 머리',setName:'입문',kind:'head',rank:'low',rarity:1},
  {id:'high-head',name:'입문 머리α',setName:'입문',kind:'head',rank:'high',rarity:5}
]};
assert.deepEqual(sorted(access.groups(sameName).map(g=>g.id)),['high:입문','low:입문']);
assert.deepEqual(access.setEnabled(sameName,[],['high:입문'],false),['high-head']);

// Excluding a set releases its fixed piece; unrelated fixed parts are kept.
const fixedHead=db.armor.find(a=>a.kind==='head');
const fixedChest=db.armor.find(a=>a.kind==='chest'&&a.setName!==fixedHead.setName);
const fixed={head:fixedHead.id,chest:fixedChest.id};
const fixedCopy=clone(fixed);
const headSet=groups.find(g=>g.armorIds.includes(fixedHead.id));
const excludedHead=access.setEnabled(db,[],[headSet.id],false);
assert.deepEqual(access.reconcileFixed(db,excludedHead,fixed),{chest:fixedChest.id});
assert.deepEqual(fixed,fixedCopy);
assert.deepEqual(access.reconcileFixed(db,[],{...fixed,arms:'missing:armor',waist:fixedHead.id}),fixed);
assert.deepEqual(access.reconcileFixed(db,[],fixed),fixed);

// Search always receives maximum available armor upgrades, with original source intact.
const upgraded=access.upgradedDB(db);
assert.notEqual(upgraded,db);
assert.equal(upgraded.armor.length,db.armor.length);
for(const rarity of [5,6,8]){
  const armor=db.armor.find(a=>a.rarity===rarity&&a.limitBreak);
  assert.ok(armor,'RARE '+rarity+' fixture');
  const actual=upgraded.armor.find(a=>a.id===armor.id);
  assert.equal(actual.rarity,rarity);
  assert.equal(actual.maxDefense,armor.limitBreak.maxDefense);
  assert.deepEqual(actual.slots,armor.limitBreak.slots);
  assert.deepEqual(actual.skills,armor.skills);
  assert.deepEqual(actual.tags,armor.tags);
}
for(const armor of db.armor){
  const actual=upgraded.armor.find(a=>a.id===armor.id);
  if(armor.limitBreak){
    assert.equal(actual.maxDefense,armor.limitBreak.maxDefense,armor.name);
    assert.deepEqual(actual.slots,armor.limitBreak.slots,armor.name);
  }else{
    assert.deepEqual(actual,armor,armor.name+' low-rank data must stay unchanged');
  }
  assert.equal(actual.linkedSet,armor.linkedSet,armor.name+' linked full set preserved');
}
assert.equal(JSON.stringify(db),original,'access helpers must not mutate the source database');
console.log(`Armor access checks passed: ${groups.length} sets / ${db.armor.length} pieces, set toggles, fixed-part release, and all upgrade variants.`);
