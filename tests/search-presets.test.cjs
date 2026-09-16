'use strict';
const assert=require('node:assert/strict');
const presets=require('../dist/search-presets.js');
const db=require('../data/database.json');
const skill=db.skills.find(s=>s.maxLevel>=3),head=db.armor.find(a=>a.kind==='head'&&a.rank==='high'),chest=db.armor.find(a=>a.kind==='chest'&&a.rank==='high');
const state={game:'wilds',schemaVersion:1,targets:{[skill.id]:3},weapons:[{id:'weapon:1',name:'내 무기'}],charms:[{id:'charm:1',name:'내 호석'}],selectedWeapon:'weapon:1',selectedCharm:'charm:1',charmMode:'fixed',rank:'high',maxRarity:10,minDefense:300,inventoryMode:'owned',fixed:{head:head.id,chest:chest.id},excluded:[],decorationCounts:{'deco:1':2},saved:[{name:'저장 조합'}],customArmor:[],limitBreak:true,presets:[]};
const initial=JSON.stringify(state);
const saved=presets.create(state,'  포격 세팅  ',db),first=saved.presets[0];
assert.equal(first.name,'포격 세팅');
assert.equal(first.conditions.targets[skill.id],3);
assert.equal(presets.validate(first,db),true);
assert.equal(presets.validateList(saved.presets,db),true);
assert.equal(JSON.stringify(state),initial);
assert.deepEqual(Object.keys(first.conditions).sort(),['targets','selectedWeapon','charmMode','selectedCharm','rank','maxRarity','minDefense','inventoryMode','fixed'].sort());
const snapshot=presets.snapshot(state);snapshot.targets[skill.id]=1;snapshot.fixed.head='new';
assert.equal(state.targets[skill.id],3);assert.equal(state.fixed.head,head.id);

// Loading restores conditions while using the current inventory and unlock ledger.
const current={...saved,targets:{},selectedWeapon:'',selectedCharm:'',charmMode:'none',rank:'all',maxRarity:1,minDefense:0,inventoryMode:'all',fixed:{},weapons:[...state.weapons,{id:'weapon:2'}],charms:[...state.charms,{id:'charm:2'}],excluded:['irrelevant'],decorationCounts:{'deco:1':7,'deco:2':3},saved:[{name:'새 조합'}]};
const currentCopy=JSON.stringify(current),applied=presets.apply(current,first,db);
assert.deepEqual(presets.snapshot(applied.state),first.conditions);
for(const key of ['weapons','charms','excluded','decorationCounts','saved','presets'])assert.deepEqual(applied.state[key],current[key]);
assert.deepEqual(applied.warnings,[]);
assert.equal(JSON.stringify(current),currentCopy);
applied.state.decorationCounts['deco:1']=99;assert.equal(current.decorationCounts['deco:1'],7);

// Deleted equipment and locked or mismatched armor release only those references.
const missing=presets.apply({...current,weapons:[],charms:[],excluded:[head.id]},first,db);
assert.equal(missing.state.selectedWeapon,'');assert.equal(missing.state.selectedCharm,'');assert.equal(missing.state.charmMode,'owned');
assert.deepEqual(missing.state.fixed,{chest:chest.id});assert.equal(missing.warnings.length,3);
const invalidFixed=structuredClone(first);invalidFixed.conditions.fixed={head:'missing',chest:head.id,legs:''};
assert.deepEqual(presets.apply(current,invalidFixed,db).state.fixed,{});
const lowRarity=structuredClone(first);lowRarity.conditions.maxRarity=1;
assert.deepEqual(presets.apply(current,lowRarity,db).state.fixed,{});
const lowHead=db.armor.find(a=>a.kind==='head'&&a.rank==='low');
const lowFixed=structuredClone(first);lowFixed.conditions.fixed={head:lowHead.id};
assert.deepEqual(presets.apply(current,lowFixed,db).state.fixed,{});
lowFixed.conditions.rank='all';assert.deepEqual(presets.apply(current,lowFixed,db).state.fixed,{head:lowHead.id});

// A name collision requires the explicit overwrite operation; inventories are untouched.
assert.throws(()=>presets.create(saved,'포격 세팅',db),/덮어쓰기/);
assert.throws(()=>presets.create(saved,'   ',db),/이름/);
const overwritten=presets.overwrite({...saved,minDefense:777},first.id,'수정 세팅',db);
assert.equal(overwritten.presets.length,1);assert.equal(overwritten.presets[0].id,first.id);assert.equal(overwritten.presets[0].createdAt,first.createdAt);assert.equal(overwritten.presets[0].conditions.minDefense,777);assert.equal(first.name,'포격 세팅');
const second=presets.create(overwritten,'다른 세팅',db);
assert.throws(()=>presets.overwrite(second,first.id,'다른 세팅',db),/같은 이름/);
assert.equal(presets.remove(second,first.id).presets.length,1);
assert.equal(second.presets.length,2);
assert.throws(()=>presets.remove(second,'missing'),/선택/);
let full={...state};for(let i=0;i<30;i++)full=presets.create(full,'세팅 '+i,db);
assert.throws(()=>presets.create(full,'31번째',db),/최대 30/);
assert.equal(presets.overwrite(full,full.presets[0].id,'덮어쓰기',db).presets.length,30);

// Backups reject malformed conditions and cannot smuggle an old inventory into apply().
for(const change of [p=>p.conditions.decorationCounts={},p=>p.conditions.targets[skill.id]=999,p=>p.conditions.targets={missing:1},p=>p.conditions.fixed={weapon:'bad'},p=>p.conditions.rank='master',p=>p.conditions.selectedWeapon={},p=>p.conditions.maxRarity=1.5,p=>p.conditions.minDefense=-1,p=>p.createdAt='invalid',p=>p.name='',p=>delete p.conditions.fixed]){const bad=structuredClone(first);change(bad);assert.throws(()=>presets.validate(bad,db));}
assert.throws(()=>presets.validateList([...saved.presets,...saved.presets],db),/중복/);
assert.throws(()=>presets.validateList(Array(31).fill(first),db),/30/);
const legacy={...state};delete legacy.presets;
assert.equal(presets.create(legacy,'이전 백업',db).presets.length,1);
const escaped=presets.html({presets:[{...first,name:'<img src=x onerror=alert(1)>'}]});
assert.ok(escaped.includes('&lt;img'));assert.ok(!escaped.includes('<img'));
console.log('Search presets: save/load/overwrite/delete, 30-entry cap, current inventory preservation, missing references, backup validation passed.');
