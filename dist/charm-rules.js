/* Wilds charm legality hints. Mismatches are advisory, not save restrictions. */
(function(root){
  'use strict';
  const NAMES={5:'미지의 호석',6:'전승의 호석',7:'비화의 호석',8:'번영의 호석'};
  const slotsKey=slots=>(slots||[]).filter(s=>s.level>0).map(s=>s.kind+':'+s.level).sort().join(',');
  const skillsKey=skills=>Object.entries(skills||{}).filter(([,n])=>n>0).sort(([a],[b])=>a.localeCompare(b)).map(([id,n])=>id+':'+n).join(',');
  function typeOf(charm,db){return charm.charmType||(db.charms.find(c=>c.id===(charm.originId||charm.id))?.random===false?'crafted':'appraised');}
  function skillsFit(skills,pattern,pools){
    const entries=Object.entries(skills||{}).filter(([,n])=>n>0),groups=pattern.pools.filter(id=>Object.keys(pools[id]||{}).length);
    if(entries.length!==groups.length)return false;
    const visit=(i,used)=>i===groups.length||entries.some(([id,level],j)=>!(used&(1<<j))&&pools[groups[i]][id]===level&&visit(i+1,used|(1<<j)));
    return visit(0,0);
  }
  function check(charm,db=root.WILDS_DB,rules=root.WILDS_CHARM_RULES){
    const rarity=Number(charm.rarity),type=typeOf(charm,db),issues=[];
    if(!charm.rarity)return {status:'unchecked',issues,type,alternatives:[]};
    const slots=slotsKey(charm.slots),skills=skillsKey(charm.skills),hasSkills=!!skills;
    if(type==='crafted'){
      const candidates=db.charms.filter(c=>!c.random),matches=candidates.filter(c=>skillsKey(c.skills)===skills&&slotsKey(c.slots)===slots);
      if(!Number.isInteger(rarity)||rarity<2||rarity>8)issues.push({field:'rarity',message:'제작 호석의 레어도는 2~8입니다.'});
      if(slots)issues.push({field:'slots',message:'제작 호석에는 장식주 슬롯이 없습니다.'});
      if(hasSkills&&!matches.some(c=>c.rarity===rarity))issues.push({field:'skills',message:'이 스킬·레벨 조합은 선택한 레어도의 제작 호석 도감과 일치하지 않습니다.'});
      const alternatives=[...new Set(matches.map(c=>c.rarity))].filter(r=>r!==rarity).sort();
      return {status:issues.length?'mismatch':hasSkills?'valid':'incomplete',issues,type,alternatives};
    }
    if(!rules?.patterns||!rules?.pools)return {status:'unchecked',issues:[{field:'data',message:'감정 호석의 검사 데이터를 불러오지 못했습니다.'}],type,alternatives:[]};
    const patterns=rules.patterns.filter(p=>p.rarity===rarity);
    if(!patterns.length)return {status:'mismatch',issues:[{field:'rarity',message:'감정 호석의 레어도는 5~8입니다.'}],type,alternatives:[]};
    const withSlots=patterns.filter(p=>slotsKey(p.slots)===slots);
    if(!withSlots.length){
      const message=rarity===8?'레어도 8은 무기용 Lv 1 슬롯 1개와 방어구용 Lv 1 슬롯 0~2개가 필요합니다.':`레어도 ${rarity}의 감정 호석에 없는 슬롯 구성입니다. 무기용 슬롯은 레어도 8에서만 나옵니다.`;
      issues.push({field:'slots',message});
    }
    if(hasSkills){
      if(Object.keys(charm.skills).length>3)issues.push({field:'skills',message:'감정 호석에는 서로 다른 스킬이 최대 3개 붙습니다.'});
      else if(!patterns.some(p=>skillsFit(charm.skills,p,rules.pools)))issues.push({field:'skills',message:`레어도 ${rarity}에서 나올 수 없는 스킬·레벨 조합입니다.`});
      else if(withSlots.length&&!withSlots.some(p=>skillsFit(charm.skills,p,rules.pools)))issues.push({field:'combined',message:`이 스킬 조합과 슬롯 구성은 레어도 ${rarity}의 같은 추첨 패턴에 포함되지 않습니다.`});
    }
    const alternatives=hasSkills?[...new Set(rules.patterns.filter(p=>p.rarity!==rarity&&slotsKey(p.slots)===slots&&skillsFit(charm.skills,p,rules.pools)).map(p=>p.rarity))].sort():[];
    return {status:issues.length?'mismatch':hasSkills?'valid':'incomplete',issues,type,alternatives};
  }
  const api={NAMES,typeOf,check,slotsKey,skillsFit};root.WildsCharmRules=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
