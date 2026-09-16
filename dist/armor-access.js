/* Set-level hunting unlocks. All eligible armor uses its limit-break values. */
(function(root){
  'use strict';
  function groups(db){const map=new Map();for(const armor of db.armor){const name=armor.setName||armor.name,id=armor.rank+':'+name;if(!map.has(id))map.set(id,{id,name,rank:armor.rank,rarity:armor.rarity,armorIds:[]});const set=map.get(id);set.armorIds.push(armor.id);set.rarity=Math.max(set.rarity,armor.rarity);}return [...map.values()].sort((a,b)=>a.name.localeCompare(b.name,'ko')||a.rank.localeCompare(b.rank));}
  function setEnabled(db,excluded,setIds,enabled){const ids=new Set(setIds),next=new Set(excluded);for(const set of groups(db))if(ids.has(set.id))for(const id of set.armorIds){if(enabled)next.delete(id);else next.add(id);}return [...next];}
  function normalizeExcluded(db,excluded){const previous=new Set(excluded),next=[];for(const set of groups(db))if(set.armorIds.some(id=>previous.has(id)))next.push(...set.armorIds);return next;}
  function upgradedDB(db){return {...db,armor:db.armor.map(a=>a.limitBreak?{...a,slots:a.limitBreak.slots,maxDefense:a.limitBreak.maxDefense,upgraded:true}:a)};}
  function reconcileFixed(db,excluded,fixed){const blocked=new Set(excluded),armor=new Map(db.armor.map(a=>[a.id,a]));return Object.fromEntries(Object.entries(fixed||{}).filter(([part,id])=>armor.get(id)?.kind===part&&!blocked.has(id)));}
  const api={groups,setEnabled,normalizeExcluded,upgradedDB,reconcileFixed};root.WildsArmorAccess=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
