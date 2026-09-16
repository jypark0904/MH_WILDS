/* Pure summaries of already-discovered combinations; no additional search.
 * Slot capacity is an ordering aid, not a damage score. Weapon and armor slots
 * remain separate in the solver even though their levels are summed here.
 */
(function(root){
  'use strict';
  const Relevance=root.WildsWeaponRelevance||(typeof require==='function'?require('./weapon-relevance.js'):null);
  const positive=value=>Number.isFinite(value)&&value>0?Math.floor(value):0;
  const levelOf=(result,id,maxLevel)=>Math.min(maxLevel,positive(result.skills?.[id]));

  /* Each suggestion retains the current targets. An unconfirmed upgrade only
   * proposes another search; lack of a discovered result does not prove that
   * the requested next level is impossible. count refers to the proposed level,
   * while highestLevel is only the highest level in the discovered results.
   */
  function analyze(db,targets,results){
    const empty={upgrades:[],additional:[],totalResults:0};
    if(!Array.isArray(results)||!results.length)return empty;
    const skills=new Map((db.skills||[]).map(skill=>[skill.id,skill]));
    const goals=Object.entries(targets||{}).filter(([,level])=>positive(level)>0);
    // Exclude stale results from a prior search whose requirements differ.
    const eligible=results.filter(result=>result&&goals.every(([id,level])=>{
      const skill=skills.get(id);
      return skill&&levelOf(result,id,positive(skill.maxLevel))>=level;
    }));
    if(!eligible.length)return empty;
    const profiles=eligible.map(result=>Relevance.createProfile(db,result.weapon));
    const relevant=(id,index)=>profiles[index].known&&profiles[index].skills[id];
    const highest=id=>Math.max(0,...eligible.map(result=>levelOf(result,id,positive(skills.get(id)?.maxLevel))));
    const countAt=(id,level)=>eligible.filter(result=>levelOf(result,id,positive(skills.get(id)?.maxLevel))>=level).length;
    const upgrades=[];
    for(const [id,currentLevel] of goals){
      const skill=skills.get(id),maxLevel=positive(skill.maxLevel);
      if(currentLevel>=maxLevel)continue;
      if(profiles.every(profile=>profile.known)&&!profiles.some((_,index)=>relevant(id,index)))continue;
      const level=currentLevel+1,count=countAt(id,level);
      upgrades.push({id,name:skill.name,currentLevel,level,maxLevel,count,confirmed:count>0,highestLevel:highest(id)});
    }
    const goalIds=new Set(goals.map(([id])=>id)),additional=[];
    for(const skill of skills.values()){
      if(goalIds.has(skill.id))continue;
      const matching=eligible.filter((_,index)=>relevant(skill.id,index));
      if(!matching.length)continue;
      const maxLevel=positive(skill.maxLevel),level=Math.max(0,...matching.map(result=>levelOf(result,skill.id,maxLevel)));
      if(!level)continue;
      const count=matching.filter(result=>levelOf(result,skill.id,maxLevel)>=level).length;
      const rule=profiles.map(profile=>profile.skills[skill.id]).filter(Boolean).sort((a,b)=>b.priority-a.priority)[0];
      additional.push({id:skill.id,name:skill.name,currentLevel:0,level,maxLevel,count,confirmed:true,highestLevel:level,priority:rule.priority,reason:rule.reason});
    }
    additional.sort((a,b)=>b.priority-a.priority||b.count-a.count||b.level-a.level||String(a.name).localeCompare(String(b.name),'ko')||String(a.id).localeCompare(String(b.id)));
    return {upgrades,additional:additional.slice(0,6),totalResults:eligible.length};
  }

  /* Uses capped result.skills, never rawSkills: levels above a game's maximum
   * must not make a result appear more efficient. Solver output is already
   * capped. Only surplus levels of requested skills are used as a tie-breaker;
   * arbitrary additional skills are not summed into a power score.
   */
  function metric(result,targets){
    const slots=(result?.remainingSlots||[]).filter(slot=>slot&&['weapon','armor'].includes(slot.kind)&&[1,2,3].includes(slot.level));
    return {
      slotLevelSum:slots.reduce((sum,slot)=>sum+slot.level,0),
      level3Slots:slots.filter(slot=>slot.level===3).length,
      targetSurplus:Object.entries(targets||{}).reduce((sum,[id,level])=>sum+(positive(level)?Math.max(0,positive(result?.skills?.[id])-positive(level)):0),0),
      defense:Number.isFinite(result?.defense)?result.defense:0,
      slotCount:slots.length,
    };
  }
  function compare(a,b,targets){
    const left=metric(a,targets),right=metric(b,targets);
    return right.slotLevelSum-left.slotLevelSum||right.level3Slots-left.level3Slots||right.targetSurplus-left.targetSurplus||right.defense-left.defense;
  }

  root.WildsResultInsights={analyze,metric,compare};
  if(typeof module!=='undefined')module.exports=root.WildsResultInsights;
})(globalThis);
