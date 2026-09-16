/* Wilds only: representative damage, not a hunt-time or damage-number simulator. */
(function(root){
  'use strict';
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
  const finite=(n,fallback=0)=>Number.isFinite(Number(n))?Number(n):fallback;
  const compact=n=>String(n||'').replace(/\s/g,'');
  const BLOAT={'great-sword':4.8,'long-sword':3.3,'sword-shield':1.4,'dual-blades':1.4,hammer:5.2,'hunting-horn':4.2,lance:2.3,gunlance:2.3,'switch-axe':3.5,'charge-blade':3.6,'insect-glaive':3.1,'light-bowgun':1.3,'heavy-bowgun':1.5,bow:1.2};
  const ELEMENTS={fire:'불',water:'물',thunder:'번개',ice:'얼음',dragon:'용'};
  // Wilds inventory bonus: Powercharm exists; Powertalon is not available.
  const POWERCHARM_RAW=6;
  const CONDITIONS={anger:['분노',.7],burst:['연격 5타 유지',.8],stamina:['혼신 발동',.5],guard:['공격적인 방어 발동',.5],counter:['역습 발동',.5],evade:['교격 발동',.5],latent:['힘의 해방 발동',.4],coalescence:['전화위복 발동',.3],wound:['상처 공격',.25],fullHealth:['체력 최대',.6],redHealth:['붉은 체력 있음',.2],lowHealth:['체력 35% 이하',0]};
  const SHARP={red:[.5,.25],orange:[.75,.5],yellow:[1,.75],green:[1.05,1],blue:[1.2,1.0625],white:[1.32,1.15]};
  const ROTATIONS=['normal-fullburst','normal-wsfb','long-melee-wyrmstake','wide-charged-wyvernfire'];
  function normalizeSettings(input={}){
    if(!input||typeof input!=='object')input={};
    const s={rawHZ:clamp(finite(input.rawHZ,60),1,100),elementHZ:clamp(finite(input.elementHZ,20),0,100),fireHZ:clamp(finite(input.fireHZ,20),0,100),sharpness:Object.hasOwn(SHARP,input.sharpness)?input.sharpness:'auto',uptimes:{}};
    for(const [id,[,value]] of Object.entries(CONDITIONS))s.uptimes[id]=clamp(finite(input.uptimes?.[id],value),0,1);
    for(const id of ['redHealth','lowHealth'])s.uptimes[id]=Math.min(s.uptimes[id],1-s.uptimes.fullHealth);
    s.shellLevel=[1,2,3,4].includes(Number(input.shellLevel))?Number(input.shellLevel):'auto';
    s.rotations={};for(const type of ['normal','long','wide'])if(input.rotations?.[type]){const values=Object.fromEntries(ROTATIONS.map(id=>[id,clamp(finite(input.rotations[type][id]),0,100)]));if(Object.values(values).some(n=>n>0))s.rotations[type]=values;}
    s.attackWeights={};
    for(const [profile,weights] of Object.entries(input.attackWeights||{}).slice(0,40)){
      if(!Object.keys(BLOAT).some(kind=>profile.startsWith(kind+'/'))||!/^[a-z-]+\/[a-z0-9-]+$/.test(profile)||!weights||typeof weights!=='object')continue;
      const values=Object.fromEntries(Object.entries(weights).filter(([id])=>/^attack-\d{1,2}$/.test(id)).slice(0,32).map(([id,n])=>[id,clamp(finite(n,1),0,100)]));
      if(Object.values(values).some(n=>n>0))s.attackWeights[profile]=values;
    }
    if(input.chargeFraction!==undefined)s.chargeFraction=clamp(finite(input.chargeFraction),0,.9);
    return s;
  }
  function critical(affinity,multiplier=1.25){const a=clamp(affinity/100,-1,1);return a<0?1+a*.25:1+a*(multiplier-1);}
  function weaponStats(weapon,db){
    const original=(db?.weapons||[]).find(w=>w.id===(weapon?.originId||weapon?.id)),w={...original,...weapon};
    const bloat=BLOAT[w.kind];if(!bloat)return null;
    const displayed=finite(w.attack),stored=finite(w.rawAttack);
    // A copied weapon can retain stale rawAttack after the displayed value is edited.
    const raw=displayed>0?(stored>0&&Math.abs(Math.floor(stored*bloat+1e-7)-displayed)<1?stored:displayed/bloat):w.attack===undefined?stored:0;
    const explicit=w.gogConfig?.element??w.element;
    const element=explicit!==undefined?(Object.hasOwn(ELEMENTS,explicit)?explicit:''):(w.specials||[]).find(s=>s.kind==='element'&&Object.hasOwn(ELEMENTS,s.element)&&finite(s.value)>0)?.element||'';
    const e=element?finite(w.elementValue,(w.specials||[]).find(s=>s.kind==='element'&&s.element===element)?.value||0)/10:0;
    const sharpness=Object.keys(SHARP).reverse().find(s=>finite(w.sharpness?.[s])>0)||'white';
    return {weapon:w,raw,affinity:clamp(finite(w.affinity),-100,100),element,elementValue:e,sharpness,assumedSharpness:!w.sharpness,bloat};
  }
  function scenarios(conditionIds,settings){
    let states=[{weight:1,on:{}}];
    const health=conditionIds.some(id=>['fullHealth','redHealth','lowHealth'].includes(id));
    if(health){const full=settings.uptimes.fullHealth,rest=1-full;states=full?[{weight:full,on:{fullHealth:true}}]:[];if(rest>0){const red=settings.uptimes.redHealth/rest,low=settings.uptimes.lowHealth/rest;for(const r of [false,true])for(const l of [false,true]){const weight=rest*(r?red:1-red)*(l?low:1-low);if(weight>0)states.push({weight,on:{redHealth:r,lowHealth:l}});}}}
    for(const id of [...new Set(conditionIds)].filter(id=>!['fullHealth','redHealth','lowHealth'].includes(id))){const u=settings.uptimes[id]??0;states=states.flatMap(s=>[...(u<1?[{weight:s.weight*(1-u),on:s.on}]:[]),...(u>0?[{weight:s.weight*u,on:{...s.on,[id]:true}}]:[])]);}
    return states;
  }
  function create({db,weapon,selection={},settings:inputSettings={},catalog,meta}){
    const settings=normalizeSettings(inputSettings),stats=weaponStats(weapon,db),skillById=new Map((db?.skills||[]).map(s=>[s.id,s]));
    const resolved=stats?.weapon||weapon,choice=meta?.recommend(db,root.WILDS_WEAPON_META,resolved,selection),kind=resolved?.kind;
    const type=choice?choice.type:selection.type||catalog?.defaults?.[kind]||'';
    const shellLevel=settings.shellLevel==='auto'?Number(resolved?.gogConfig?3:resolved?.shellLevel||3):settings.shellLevel;
    const profile=catalog?.profiles?.[kind+'/'+type+(kind==='gunlance'?'@'+shellLevel:'')]||catalog?.profiles?.[kind+'/'+type]||catalog?.profiles?.[kind];
    const profileKey=kind+'/'+type,ranged=['bow','light-bowgun','heavy-bowgun'].includes(kind),ammoElement=['light-bowgun','heavy-bowgun'].includes(kind)&&['element','hybrid'].includes(type);
    const guards=['great-sword','sword-shield','lance','gunlance','charge-blade','heavy-bowgun'];
    const conditionOptions=Object.entries(CONDITIONS).filter(([id])=>id!=='guard'||guards.includes(kind)).filter(([id])=>id!=='coalescence'||stats?.elementValue>0||profile?.ammoElement||ammoElement).map(([id,[label]])=>({id,label}));
    const context={settings,stats,profile,type,profileKey,ranged,ammoElement,conditionOptions};
    const unavailable=!stats?.raw?'무기의 공격력을 입력하면 계산합니다.':catalog?.game!=='wilds'?'와일즈 계산 데이터가 필요합니다.':!profile?'운용 유형을 선택하면 계산합니다.':profile.unavailable;
    if(unavailable)return {...context,available:false,reason:unavailable,analyze:()=>({available:false,reason:unavailable})};
    const sharp=SHARP[settings.sharpness==='auto'?stats.sharpness:settings.sharpness];
    const rawSharp=ranged?1:sharp[0],eleSharp=ranged?1:sharp[1];
    const rules=catalog.rules||{},lookup=new Map(Object.entries(rules).map(([name,rule])=>[compact(name),rule]));
    const rotationWeights=profile.rotations?settings.rotations[type]||Object.fromEntries(profile.rotations.map(r=>[r.id,r.defaultWeight])):null;
    const rotationTotal=rotationWeights?Object.values(rotationWeights).reduce((a,b)=>a+b,0):1;
    const attackOptions=profile.rotations?[]:profile.channels.map((c,i)=>({id:'attack-'+i,label:c.label||'대표 공격 '+(i+1)}));
    let attackWeights=Object.fromEntries(attackOptions.map(({id})=>[id,settings.attackWeights[profileKey]?.[id]??1]));
    if(attackOptions.length&&!Object.values(attackWeights).some(n=>n>0))attackWeights=Object.fromEntries(attackOptions.map(({id})=>[id,1]));
    const attackTotal=Object.values(attackWeights).reduce((a,b)=>a+b,0)||1;
    const chargedAttacks=profile.channels.map((c,i)=>c.charged?'attack-'+i:null).filter(Boolean);
    const chargeWeight=rotationWeights?(rotationWeights['wide-charged-wyvernfire']||0)/rotationTotal:chargedAttacks.length?chargedAttacks.reduce((n,id)=>n+attackWeights[id],0)/attackTotal:1;
    const defaultChargeWeight=profile.rotations?profile.rotations.find(r=>r.id==='wide-charged-wyvernfire').defaultWeight/100:chargedAttacks.length?chargedAttacks.length/attackOptions.length:1;
    const chargeFraction=clamp((settings.chargeFraction??profile.chargeFraction??0)*chargeWeight/defaultChargeWeight,0,.9);
    const utility=new Set((catalog.utilitySkills||[]).map(compact));
    const cache=new Map();
    function ruleFor(id){const skill=skillById.get(id);return profile.rules?.[skill?.name]||lookup.get(compact(skill?.name));}
    function status(id){
      const skill=skillById.get(id),rule=ruleFor(id),name=skill?.name||id;
      if(rule?.kinds&&!rule.kinds.includes(kind))return {status:'neutral',reason:'이 무기에는 적용되지 않습니다.'};
      if(rule?.channelFlag&&!profile.channels.some(c=>c[rule.channelFlag]))return {status:'neutral',reason:'이 대표 공격에 해당 스킬의 적용 동작이 없습니다.'};
      if(rule?.element&&rule.element!==stats.element)return {status:'neutral',reason:'무기의 실제 속성과 다릅니다.'};
      if(rule?.requiresElement&&!stats.elementValue&&!profile.ammoElement)return {status:'neutral',reason:'무기 속성 피해가 없는 구성입니다.'};
      if(rule?.special==='critElement'&&!catalog.critElement?.[kind])return {status:'unknown',reason:'현행 와일즈의 무기별 회심격【속성】 계수가 확인되지 않았습니다.'};
      if(rule?.special==='burst'&&!catalog.burst?.[kind])return {status:'unknown',reason:'이 무기의 연격 수치가 확인되지 않았습니다.'};
      if(rule?.special==='focus'&&!profile.chargeFraction)return {status:'unknown',reason:'게이지·모으기 단축이 공격 횟수에 미치는 영향은 이 운용에서 미산정입니다.'};
      if(rule?.special==='load'&&kind!=='gunlance')return {status:'unknown',reason:'병 충전·장전 주기 변화는 이 운용에서 미산정입니다.'};
      if(rule?.special==='artillery'&&!profile.channels.some(c=>c.artillery))return {status:'neutral',reason:'이 대표 공격에는 포술이 적용되는 폭발이 없습니다.'};
      if(rule?.unsupported)return {status:'unknown',reason:rule.unsupported};
      if(rule)return {status:'modeled',reason:rule.note||'현재 무기·발동률·공격 구성을 반영했습니다.'};
      if(utility.has(compact(name)))return {status:'utility',reason:'직접 피해 증가 없음 · 생존·편의로 확보하는 공격 기회는 별도입니다.'};
      return {status:'unknown',reason:'추가 피해·상태이상·운용 변화의 수치 모델이 아직 없습니다.'};
    }
    function effects(skills,on){
      const s={rawFlat:POWERCHARM_RAW,rawMult:1,affinity:stats.affinity,crit:1.25,eleFlat:0,eleMult:1,eleCrit:1,artillery:1,shellFire:0,load:0,focus:0,rawDamage:1,elementDamage:1,channelMods:{}};
      for(const [id,level] of Object.entries(skills)){
        if(!(level>0)||status(id).status!=='modeled')continue;
        const rule=ruleFor(id),n=Math.min(Math.trunc(level),skillById.get(id)?.maxLevel||level);
        if(rule.condition&&!on[rule.condition])continue;
        let effect=rule.levels?.[n-1]||{};
        if(rule.special==='wex')effect={affinity:settings.rawHZ>=45?(rule.levels[n-1].affinity+(on.wound?rule.levels[n-1].wound:0)):0};
        if(rule.special==='burst')effect={rawFlat:catalog.burst[kind].raw[n-1],eleFlat:catalog.burst[kind].element[n-1]};
        if(rule.special==='critElement')effect={eleCrit:catalog.critElement[kind][n-1]};
        if(rule.special==='artillery')effect={artillery:(kind==='gunlance'?[1.05,1.1,1.15]:[1.1,1.2,1.3])[n-1],shellFire:kind==='gunlance'?n*3:0};
        if(rule.special==='coalescence')effect=rule.variants?.[kind]?.[n-1]||{};
        if(rule.special==='focus')effect={focus:n*.05};
        if(rule.special==='load')effect={load:n===2?1:0};
        if(rule.channelFlag){const mods=s.channelMods[rule.channelFlag]||{rawDamage:1,elementDamage:1};for(const key of ['rawDamage','elementDamage'])if(effect[key])mods[key]*=effect[key];s.channelMods[rule.channelFlag]=mods;continue;}
        for(const [key,value] of Object.entries(effect)){if(['rawMult','eleMult','rawDamage','elementDamage'].includes(key))s[key]*=value;else if(['crit','eleCrit','artillery','load','focus'].includes(key))s[key]=value;else if(Object.hasOwn(s,key))s[key]+=value;}
      }
      s.raw=stats.raw*s.rawMult+s.rawFlat;
      s.element=stats.elementValue>0?(stats.elementValue*s.eleMult+s.eleFlat):0;
      return s;
    }
    function channelsFor(s){
      return profile.channels.map((c,i)=>({...c,count:(c.count??1)+(c.loadExtra||0)*s.load,attackWeight:attackOptions.length?attackWeights['attack-'+i]*attackOptions.length/attackTotal:1}));
    }
    function evaluate(skills,states){
      let total=0;const parts={raw:0,element:0,fixed:0,fire:0};
      for(const state of states){const s=effects(skills,state.on),crit=critical(s.affinity,s.crit),critEle=1+clamp(s.affinity/100,0,1)*(s.eleCrit-1);
        for(const c of channelsFor(s)){
          const frequency=c.rotation&&rotationWeights?(rotationWeights[c.rotation]||0)/rotationTotal:1;
          const factor=c.count*(c.multiplier||1)*frequency*c.attackWeight,sharpRaw=c.sharpness===false?1:rawSharp,sharpEle=c.sharpness===false?1:eleSharp;
          const hz=c.hitzone===false?1:settings.rawHZ/100;
          let channelRaw=1,channelElement=1;for(const [flag,mods]of Object.entries(s.channelMods))if(c[flag]){channelRaw*=mods.rawDamage;channelElement*=mods.elementDamage;}
          const attack=c.artillery?(kind==='gunlance'?stats.raw*s.rawMult*s.artillery+s.rawFlat:s.raw*s.artillery):s.raw;
          const raw=attack*(c.rawMV||0)/100*sharpRaw*hz*(c.crit===false?1:crit)*s.rawDamage*channelRaw;
          const element=s.element*(c.eleMV||0)*sharpEle*settings.elementHZ/100*(c.crit===false?1:critEle)*s.elementDamage*channelElement;
          const fire=((c.fire||0)+(c.shell?s.shellFire:0))*settings.fireHZ/100;
          const charge=chargeFraction;
          const extraCharge=profile.loadChargeTime?charge*s.load/(profile.baseCapacity||2):0;
          const timing=1/(1+extraCharge-(charge+extraCharge)*s.focus);
          const w=factor*state.weight*timing;
          const k=c.crit===false?'fixed':'raw';parts[k]+=raw*w;parts.element+=element*w;parts.fire+=fire*w;total+=(raw+element+fire)*w;
        }
      }
      return {total,parts};
    }
    function analyze(inputSkills={}){
      const skills=Object.fromEntries(Object.entries(inputSkills).filter(([,n])=>n>0).map(([id,n])=>[id,Math.min(Math.trunc(n),skillById.get(id)?.maxLevel||n)]));
      const key=JSON.stringify(Object.entries(skills).sort());if(cache.has(key))return cache.get(key);
      const conditionIds=Object.keys(skills).flatMap(id=>{const r=ruleFor(id);return [r?.condition,...(r?.conditions||[])].filter(Boolean);});
      const states=scenarios(conditionIds,settings),baseline=evaluate({},states),full=evaluate(skills,states),perSkill={};
      for(const [id,level] of Object.entries(skills)){
        const info=status(id),without={...skills};delete without[id];const absent=evaluate(without,states);
        perSkill[id]={...info,level,multiplier:info.status==='unknown'?null:full.total/absent.total};
      }
      const unknown=Object.keys(perSkill).filter(id=>perSkill[id].status==='unknown');
      const result={available:true,multiplier:full.total/baseline.total,perSkill,unknown,partial:unknown.length>0,baseline,full,profile,stats,settings,type,rotationWeights,conditions:[...new Set(conditionIds)],sources:catalog.sources,skills};
      cache.set(key,result);return result;
    }
    function levels(id,skills={}){const rest={...skills};delete rest[id];const base=analyze(rest);return Array.from({length:skillById.get(id)?.maxLevel||0},(_,i)=>{const result=analyze({...rest,[id]:i+1}),info=result.perSkill[id];return {...info,multiplier:info?.status==='unknown'?null:result.full.total/base.full.total};});}
    return {...context,available:true,rotationWeights,attackOptions,attackWeights,analyze,levels};
  }
  const api={create,critical,weaponStats,normalizeSettings,scenarios,CONDITIONS,BLOAT,POWERCHARM_RAW};root.WildsDamage=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
