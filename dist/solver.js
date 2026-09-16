/* Pure, resumable constraint search. No network or DOM dependencies. */
(function(root){
  function createEngine(preferenceFactory){
    const PARTS=['head','chest','arms','waist','legs'];
    const add=(to,from,m=1)=>{for(const [id,n] of Object.entries(from||{}))to[id]=(to[id]||0)+n*m;};
    const slotCounts=slots=>{const c=[0,0,0,0,0,0];for(const s of slots)c[(s.kind==='weapon'?3:0)+s.level-1]++;return c;};
    const slotIndex=(d,c)=>{for(let i=(d.kind==='weapon'?3:0)+d.level-1;i<(d.kind==='weapon'?6:3);i++)if(c[i]>0)return i;return -1;};
    function totals(db,items,placements=[]){
      const skills={},tags={},resistances={fire:0,water:0,thunder:0,ice:0,dragon:0};let defense=0;
      for(const item of items){if(!item)continue;add(skills,item.skills);add(tags,item.tags);add(resistances,item.resistances);defense+=item.maxDefense??item.defense??0;}
      for(const b of db.bonuses){let level=0;for(const r of b.ranks)if((tags[b.id]||0)>=r.pieces)level=Math.max(level,r.level);if(level)skills[b.id]=Math.max(skills[b.id]||0,level);}
      const decorationMap=new Map(db.decorations.map(d=>[d.id,d]));
      for(const p of placements){const d=decorationMap.get(p.decorationId);if(d)add(skills,d.skills);}
      const rawSkills={...skills};for(const s of db.skills)if(skills[s.id])skills[s.id]=Math.min(skills[s.id],s.maxLevel);
      return {skills,rawSkills,tags,defense,resistances};
    }
    function validateResult(db,input,result){
      const errors=[],parts=result.armor||[];
      if(parts.length!==5||PARTS.some(k=>parts.filter(a=>a.kind===k).length!==1))errors.push('방어구 부위 오류');
      for(const a of parts){if((input.excluded||[]).includes(a.id))errors.push('미해금 방어구');if(input.fixed?.[a.kind]&&input.fixed[a.kind]!==a.id)errors.push('고정 방어구 불일치');}
      const linked=parts.find(a=>a.linkedSet);if(linked&&parts.some(a=>a.linkedSet!==linked.linkedSet))errors.push('세트 방어구 혼합 불가');
      const items=[result.weapon,result.charm,...parts].filter(Boolean),slots=items.flatMap(i=>(i.slots||[]).map((s,index)=>({...s,equipmentId:i.id,index}))),used=new Set(),inventory={};
      for(const p of result.placements||[]){const d=db.decorations.find(d=>d.id===p.decorationId),s=slots.find(s=>s.equipmentId===p.equipmentId&&s.index===p.slotIndex),key=p.equipmentId+':'+p.slotIndex;if(!d||!s||s.kind!==d.kind||s.level<d.level||used.has(key)){errors.push('장식주 슬롯 오류');continue;}used.add(key);inventory[d.id]=(inventory[d.id]||0)+1;}
      if(input.inventoryMode==='owned')for(const [id,n]of Object.entries(inventory))if(n>(input.decorationCounts?.[id]||0))errors.push('장식주 보유량 초과');
      const t=totals(db,items,result.placements);for(const [id,n] of Object.entries(input.targets||{}))if((t.skills[id]||0)<n)errors.push('목표 스킬 미달');
      if(t.defense<(input.minDefense||0))errors.push('최소 방어력 미달');
      return {valid:errors.length===0,errors,totals:t};
    }
    function* search(db,input){
      const targets=Object.entries(input.targets||{}).filter(([,n])=>n>0),targetIds=targets.map(([id])=>id),targetLevels=targets.map(([,n])=>n);
      if(!targets.length)throw new Error('목표 스킬을 하나 이상 선택하세요.');
      const skillMap=new Map(db.skills.map(s=>[s.id,s]));for(const [id,n] of targets)if(!skillMap.has(id)||!Number.isInteger(n)||n<1||n>skillMap.get(id).maxLevel)throw new Error('유효하지 않은 목표 스킬입니다.');
      const weapon=input.weapon||{id:'none-weapon',name:'무기 없음',skills:{},tags:{},slots:[]},charms=input.charms?.length?input.charms:[{id:'none-charm',name:'호석 없음',skills:{},tags:{},slots:[]}];
      const preference=preferenceFactory?preferenceFactory(db,weapon):{known:false,skills:{},gain:()=>({element:0,useful:0})};
      const preferredIds=Object.keys(preference.skills||{}).filter(id=>skillMap.has(id)&&preference.skills[id].priority>0).sort();
      const headroom=skills=>preferredIds.map(id=>Math.max(0,skillMap.get(id).maxLevel-(skills[id]||0))).join(',');
      const excluded=new Set(input.excluded||[]),pool=[...db.armor,...(input.customArmor||[])].filter(a=>!excluded.has(a.id)&&(input.rank!=='high'||a.rank==='high')&&a.rarity<=(input.maxRarity||10));
      let candidates=PARTS.map(part=>pool.filter(a=>a.kind===part&&(!input.fixed?.[part]||input.fixed[part]===a.id)));
      const stats={nodes:0,leaves:0,decorationNodes:0,pruned:0,candidateCounts:Object.fromEntries(PARTS.map((p,i)=>[p,candidates[i].length]))};
      if(candidates.some(c=>c.length===0)){yield {type:'progress',stats:{...stats}};return;}
      const relevantBonuses=db.bonuses.filter(b=>targetIds.includes(b.id));
      const decos=db.decorations.filter(d=>targetIds.some(id=>d.skills[id]>0)&&(input.inventoryMode!=='owned'||(input.decorationCounts?.[d.id]||0)>0));
      const dv=decos.map(d=>targetIds.map(id=>d.skills[id]||0));
      const extraLevels=decos.map(d=>Object.entries(d.skills).reduce((sum,[id,n])=>sum+(targetIds.includes(id)?0:n),0));
      const maxD=targetIds.map((id)=>Array.from({length:6},(_,slot)=>Math.max(0,...decos.filter(d=>(d.kind==='weapon')===(slot>=3)&&d.level<=slot%3+1).map(d=>d.skills[id]||0))));
      const score=a=>targets.reduce((v,[id,n])=>v+Math.min(a.skills?.[id]||0,n)*8+(a.tags?.[id]||0)*14,0)+(a.slots||[]).reduce((v,s)=>v+s.level*1.5,0)+(a.maxDefense||a.defense||0)*.004;
      candidates=candidates.map(c=>c.sort((a,b)=>score(b)-score(a)||(b.maxDefense||0)-(a.maxDefense||0)||a.id.localeCompare(b.id)));
      const order=PARTS.map((part,i)=>({part,list:candidates[i]})).sort((a,b)=>a.list.length-b.list.length);
      const maxRemaining=Array.from({length:6},()=>Array(targetIds.length).fill(0)),maxTagRemaining=Array.from({length:6},()=>({})),maxDefense=Array(6).fill(0);
      for(let depth=4;depth>=0;depth--){const list=order[depth].list;maxDefense[depth]=maxDefense[depth+1]+Math.max(...list.map(a=>a.maxDefense??a.defense??0));for(let k=0;k<targetIds.length;k++)maxRemaining[depth][k]=maxRemaining[depth+1][k]+Math.max(...list.map(a=>(a.skills?.[targetIds[k]]||0)+(a.slots||[]).reduce((v,s)=>v+maxD[k][(s.kind==='weapon'?3:0)+s.level-1],0)));for(const b of relevantBonuses)maxTagRemaining[depth][b.id]=(maxTagRemaining[depth+1][b.id]||0)+Math.max(...list.map(a=>a.tags?.[b.id]||0));}
      const memoSolutions=new Map();
      function* fitDecorations(deficits,slots,baseSkills){
        const currentSkills={...baseSkills};
        // Equal target deficits can come from armor with different native bonus
        // skills. Keep their preferred decoration answers separate at the cap.
        const initialCounts=slotCounts(slots),cacheKey=deficits.join(',')+'|'+initialCounts.join(',')+'|'+headroom(currentSkills);
        if(memoSolutions.has(cacheKey))return memoSolutions.get(cacheKey);
        const available=decos.map(d=>input.inventoryMode==='owned'?(input.decorationCounts?.[d.id]||0):99),failed=new Set();
        function* fit(deficit,counts){
          stats.decorationNodes++;if((stats.decorationNodes&2047)===0)yield {type:'progress',stats:{...stats}};
          if(deficit.every(n=>n<=0))return [];
          for(let k=0;k<deficit.length;k++)if(deficit[k]>counts.reduce((v,n,i)=>v+n*maxD[k][i],0))return null;
          const key=deficit.join(',')+'|'+counts.join(',')+'|'+headroom(currentSkills)+(input.inventoryMode==='owned'?'|'+available.join(','):'');if(failed.has(key))return null;
          const deficitById=Object.fromEntries(targetIds.map((id,k)=>[id,deficit[k]]));
          let options=null;
          for(let k=0;k<deficit.length;k++){if(deficit[k]<=0)continue;const opts=[];for(let d=0;d<decos.length;d++)if(dv[d][k]>0&&available[d]>0){const slot=slotIndex(decos[d],counts);if(slot>=0){const bonus=preference.gain(decos[d].skills,currentSkills,deficitById),extra=Object.entries(decos[d].skills).reduce((sum,[id,n])=>sum+Math.max(0,n-(deficitById[id]||0)),0);opts.push({d,slot,bonus,irrelevant:preference.known?Math.max(0,extra-bonus.element-bonus.useful):extraLevels[d],value:dv[d].reduce((v,n,i)=>v+Math.min(n,deficit[i]),0)});}}if(!opts.length)return null;if(!options||opts.length<options.length)options=opts;}
          // Keep target coverage and the actual consumed slot first. If tied,
          // reward uncapped matching-element and other applicable bonus skills.
          // Unsupported or irrelevant extras never become mandatory, and every
          // candidate remains available for explicit targets and owned inventory.
          options.sort((a,b)=>b.value-a.value||a.slot-b.slot||b.bonus.element-a.bonus.element||b.bonus.useful-a.bonus.useful||decos[a.d].level-decos[b.d].level||a.irrelevant-b.irrelevant||(decos[a.d].rarity||0)-(decos[b.d].rarity||0)||decos[a.d].id.localeCompare(decos[b.d].id));
          for(const {d,slot}of options){counts[slot]--;available[d]--;add(currentSkills,decos[d].skills);const sub=yield* fit(deficit.map((n,k)=>Math.max(0,n-dv[d][k])),counts);add(currentSkills,decos[d].skills,-1);counts[slot]++;available[d]++;if(sub)return [{decorationId:decos[d].id,slotType:slot},...sub];}
          failed.add(key);return null;
        }
        const answer=yield* fit(deficits,initialCounts);if(memoSolutions.size>15000)memoSolutions.clear();memoSolutions.set(cacheKey,answer);return answer;
      }
      function* searchCharm(charm){
        const baseItems=[weapon,charm],skills={},tags={},chosen=[];let baseDefense=0;for(const i of baseItems){add(skills,i.skills);add(tags,i.tags);baseDefense+=i.maxDefense??i.defense??0;}
        const baseSlots=baseItems.flatMap(i=>(i.slots||[]).map((s,index)=>({...s,equipmentId:i.id,index})));
        // Rank armor for what this weapon/charm still needs. Once a base item
        // supplies a target, extra copies of that skill should not outrank
        // useful slots. Only traversal order changes; every candidate and the
        // shared upper bounds remain intact.
        const baseSkills=totals(db,baseItems).skills,needs=targets.map(([id,n])=>[id,Math.max(0,n-(baseSkills[id]||0))]);
        const tagNeeds=Object.fromEntries(relevantBonuses.map(b=>{
          const wanted=input.targets[b.id],thresholds=b.ranks.filter(r=>r.level>=wanted).map(r=>r.pieces);
          return [b.id,(baseSkills[b.id]||0)>=wanted?0:Math.max(0,Math.min(...thresholds)-(tags[b.id]||0))];
        }));
        const charmScore=a=>needs.reduce((v,[id,n])=>v+Math.min(a.skills?.[id]||0,n)*8+Math.min(a.tags?.[id]||0,tagNeeds[id]||0)*14,0)+(a.slots||[]).reduce((v,s)=>v+s.level*1.5,0)+(a.maxDefense||a.defense||0)*.004;
        const charmOrder=order.map(part=>({...part,list:[...part.list].sort((a,b)=>charmScore(b)-charmScore(a)||(b.maxDefense||0)-(a.maxDefense||0)||a.id.localeCompare(b.id))}));
        function* dfs(depth,currentSlots,defense){
          stats.nodes++;if((stats.nodes&2047)===0)yield {type:'progress',stats:{...stats}};
          if(defense+maxDefense[depth]<(input.minDefense||0)){stats.pruned++;return;}
          for(let k=0;k<targetIds.length;k++){const id=targetIds[k],b=relevantBonuses.find(b=>b.id===id);let upper=(skills[id]||0)+maxRemaining[depth][k]+currentSlots.reduce((v,s)=>v+maxD[k][(s.kind==='weapon'?3:0)+s.level-1],0);if(b){let level=0;for(const r of b.ranks)if((tags[id]||0)+(maxTagRemaining[depth][id]||0)>=r.pieces)level=Math.max(level,r.level);upper+=level;}if(upper<targetLevels[k]){stats.pruned++;return;}}
          if(depth===5){
            stats.leaves++;const armor=PARTS.map(p=>chosen.find(a=>a.kind===p)),items=[weapon,charm,...armor],t=totals(db,items),deficits=targetIds.map((id,k)=>Math.max(0,targetLevels[k]-(t.skills[id]||0))),solution=yield* fitDecorations(deficits,currentSlots,t.skills);if(!solution)return;
            const remaining=currentSlots.map(s=>({...s})),placements=[];for(const p of solution){const ix=remaining.findIndex(s=>(s.kind==='weapon'?3:0)+s.level-1===p.slotType),s=remaining.splice(ix,1)[0];placements.push({decorationId:p.decorationId,equipmentId:s.equipmentId,slotIndex:s.index,kind:s.kind,level:s.level});}
            const result={armor,weapon,charm,placements,remainingSlots:remaining,...totals(db,items,placements)};
            const check=validateResult(db,input,result);if(!check.valid)throw new Error('계산 결과 검증 실패: '+check.errors.join(', '));
            yield {type:'result',result,stats:{...stats}};return;
          }
          for(const a of charmOrder[depth].list){const linked=chosen.find(a=>a.linkedSet);if((linked&&a.linkedSet!==linked.linkedSet)||(a.linkedSet&&chosen.some(x=>x.linkedSet!==a.linkedSet)))continue;chosen.push(a);add(skills,a.skills);add(tags,a.tags);const slots=(a.slots||[]).map((s,index)=>({...s,equipmentId:a.id,index}));yield* dfs(depth+1,[...currentSlots,...slots],defense+(a.maxDefense??a.defense??0));add(skills,a.skills,-1);add(tags,a.tags,-1);chosen.pop();}
        }
        yield* dfs(0,baseSlots,baseDefense);
      }
      // Share completed decoration answers, while each charm keeps its own DFS
      // and in-progress decoration state. Give every charm a turn at each yield
      // so a result limit cannot be consumed by the first charm alone.
      const searches=charms.map(charm=>searchCharm(charm));
      while(searches.length){
        for(let i=0;i<searches.length;){
          const next=searches[i].next();
          if(next.done){searches.splice(i,1);continue;}
          i++;
          yield next.value;
        }
      }
      yield {type:'progress',stats:{...stats}};
    }
    return {search,totals,validateResult,PARTS};
  }
  const preferenceFactory=root.WildsWeaponRelevance?.factory||(typeof module!=='undefined'?require('./weapon-relevance.js').factory:null);
  const engine=createEngine(preferenceFactory);
  engine.workerSource='const createPreference='+(preferenceFactory?'('+preferenceFactory.toString()+')':'null')+';const engine=('+createEngine.toString()+')(createPreference);let iterator,results=[],stats={},elapsed=0;onmessage=e=>{const m=e.data;if(m.type==="start"){iterator=engine.search(m.db,m.input);results=[];stats={};elapsed=0;}const start=Date.now(),target=results.length+(m.limit||20);let status="limit";try{while(Date.now()-start<(m.maxMs||8000)&&results.length<target){const n=iterator.next();if(n.done){status="complete";break;}stats=n.value.stats||stats;if(n.value.type==="result")results.push(n.value.result);if(Date.now()-start>200&&n.value.type==="progress")postMessage({type:"progress",stats,count:results.length,elapsed:elapsed+Date.now()-start});}elapsed+=Date.now()-start;postMessage({type:"done",status,results,stats,elapsed});}catch(e){postMessage({type:"error",message:e.message});}};';
  root.WildsSolver=engine;if(typeof module!=='undefined')module.exports=engine;
})(globalThis);
