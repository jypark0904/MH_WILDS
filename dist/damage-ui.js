(function(root){
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number=n=>'×'+n.toFixed(3);
  function frequencyInputs(options,weights,attribute){
    const total=Object.values(weights).reduce((a,b)=>a+b,0)||1;
    return '<div class="damage-setting-grid">'+options.map(r=>`<label>${esc(r.label)} <small data-damage-frequency="${r.id}" data-damage-frequency-group="${attribute==='data-damage-rotation'?'rotation':'attack'}">${Math.round(weights[r.id]/total*100)}%</small><input type="number" ${attribute}="${r.id}" min="0" max="100" step="1" value="${weights[r.id]}"></label>`).join('')+'</div>';
  }
  function rotations(model){
    const options=model.profile?.rotations||model.attackOptions||[],weights=model.rotationWeights||model.attackWeights;
    if(options.length<2||!weights)return '';
    return `<section class="damage-setting-section"><h3>운용별 사용 빈도</h3><p class="hint">공격 묶음의 상대 반복 횟수입니다. 0으로 설정한 공격은 제외합니다.</p>${frequencyInputs(options,weights,model.rotationWeights?'data-damage-rotation':'data-damage-attack')}<p class="hint">시간·피해 비율이 아닌 공격 구성의 가정이며, 장전과 게이지 회복에 걸리는 시간은 포함하지 않습니다.</p></section>`;
  }
  function badge(info){if(!info)return '';return `<span class="damage-skill-badge ${info.multiplier>1.0005?'damage-positive':''}" title="${esc(info.reason)}">${info.multiplier===null?'미산정':info.status==='utility'?'직접 증가 없음':number(info.multiplier)}</span>`;}
  function summary(result,{target=false,compact=false}={}){
    if(!result?.available)return compact?'':`<p class="hint">${esc(result?.reason||'무기를 선택하면 피해 기여도를 계산합니다.')}</p>`;
    const partial=result.partial?' · 일부 효과 미산정':'';
    if(compact)return `<span class="badge damage-total" title="선택한 무기 + 힘의 부적만 적용한 상태가 1.000입니다. ${esc(result.profile.label)}${partial}">추정 피해 ${number(result.multiplier)}${result.partial?'*':''}</span>`;
    const total=result.full.total,percent=v=>Math.round(v/total*100);
    return `<section class="damage-summary" aria-label="${target?'목표':'조합'} 스킬 피해 기여"><div class="row between wrap"><div><small>${target?'목표 스킬 기준':'발동 스킬 기준'} · 추정 피해${partial}</small><strong class="damage-index">${number(result.multiplier)}</strong></div><span class="badge">무기 + 힘의 부적 = 1.000</span></div><p class="damage-profile">${esc(result.profile.label)}</p><div class="damage-shares"><span>회심 적용 물리 ${percent(result.full.parts.raw)}%</span><span>회심 미적용 물리 ${percent(result.full.parts.fixed)}%</span><span>무기 속성 ${percent(result.full.parts.element)}%</span>${result.full.parts.fire?`<span>포격 고유 화염 ${percent(result.full.parts.fire)}%</span>`:''}</div></section>`;
  }
  function panel(model,skills){
    const s=model.settings,stats=model.stats,profile=model.profile,kind=stats?.weapon.kind;
    if(!stats)return '<section id="damage-panel" class="damage-panel"><p class="hint">사용할 무기를 먼저 선택하세요.</p></section>';
    const hasElement=stats.elementValue>0&&(!profile||profile.unavailable||profile.channels?.some(c=>c.eleMV>0))||profile?.ammoElement||model.ammoElement;
    const conditions=model.conditionOptions||Object.entries(root.WildsDamage.CONDITIONS).map(([id,[label]])=>({id,label}));
    const context=stats.raw>0?`<p class="damage-settings-baseline">기준 기초 공격력 <strong>${(stats.raw+root.WildsDamage.POWERCHARM_RAW).toFixed(1)}</strong><small>무기 ${stats.raw.toFixed(1)} + 힘의 부적 ${root.WildsDamage.POWERCHARM_RAW} · 회심 ${stats.affinity}%</small></p>`:'';
    const sharpness=!model.ranged?`<label>예리도<select data-damage-setting="sharpness">${[['auto','무기 최대 색상'],['white','흰색'],['blue','파랑'],['green','초록'],['yellow','노랑'],['orange','주황'],['red','빨강']].map(([id,name])=>`<option value="${id}" ${s.sharpness===id?'selected':''}>${name}</option>`).join('')}</select></label>`:'';
    const shellPower=kind==='gunlance'?`<label>포격 위력<select data-damage-setting="shellLevel">${[['auto','무기 기준'],[1,'약함'],[2,'보통'],[3,'약간 강함'],[4,'강함']].map(([id,name])=>`<option value="${id}" ${String(s.shellLevel)===String(id)?'selected':''}>${name}</option>`).join('')}</select></label>`:'';
    return `<section id="damage-panel" class="damage-panel">${context}${!model.available?`<p class="hint damage-settings-notice">${esc(model.reason)}</p>`:''}<section class="damage-setting-section"><h3>명중 부위 · 무기 상태</h3><div class="damage-setting-grid"><label>${model.ranged?'탄':'물리'} 육질<input type="number" data-damage-setting="rawHZ" min="1" max="100" value="${s.rawHZ}"></label>${hasElement?`<label>무기 속성 육질<input type="number" data-damage-setting="elementHZ" min="0" max="100" value="${s.elementHZ}"></label>`:''}${kind==='gunlance'?`<label>포격 불 육질<input type="number" data-damage-setting="fireHZ" min="0" max="100" value="${s.fireHZ}"></label>`:''}${sharpness}${shellPower}</div></section>${rotations(model)}${profile?.chargeFraction?`<section class="damage-setting-section"><h3>모으기 시간</h3><label>한 사이클에서 모으기에 쓰는 시간 %<input type="number" data-damage-setting="chargeFraction" min="0" max="90" value="${Math.round((s.chargeFraction??profile.chargeFraction)*100)}"></label><p class="hint">${profile.rotations?'기본 운영 기준입니다. 모아포격 사용 빈도에 따라 보정하며, 용격포 준비 시간은 제외합니다.':'기본 운영 기준입니다. 모으기 공격의 빈도에 따라 보정하며 집중은 이 시간만 단축합니다.'}</p></section>`:''}<section class="damage-setting-section"><h3>조건별 발동 비율</h3><div class="damage-setting-grid">${conditions.map(({id,label})=>`<label>${esc(label)} %<input type="number" data-damage-uptime="${id}" min="0" max="100" step="5" value="${Math.round(s.uptimes[id]*100)}"></label>`).join('')}</div><p class="hint">붉은 체력·저체력은 체력 최대 구간과 겹치지 않게 보정합니다. 약점 특효는 물리 육질 45 이상에 적용합니다.</p></section></section>`;
  }
  function mount(onChange){
    const panel=document.querySelector('#damage-panel');if(!panel)return;
    for(const input of panel.querySelectorAll('[data-damage-setting], [data-damage-uptime], [data-damage-rotation], [data-damage-attack]'))input.onchange=()=>{
      const key=input.dataset.damageSetting||input.dataset.damageUptime||input.dataset.damageRotation||input.dataset.damageAttack;
      const value=['sharpness','shellLevel'].includes(key)?input.value:Number(input.value)/(input.dataset.damageUptime||key==='chargeFraction'?100:1);
      onChange(key,value,input.dataset.damageAttack?'attack':input.dataset.damageRotation?'rotation':!!input.dataset.damageUptime);
    };
  }
  function sync(model){
    const panel=document.querySelector('#damage-panel');if(!panel||!model?.settings)return;
    const s=model.settings;
    for(const input of panel.querySelectorAll('[data-damage-setting], [data-damage-uptime], [data-damage-rotation], [data-damage-attack]')){
      let value;
      if(input.dataset.damageUptime)value=Math.round(s.uptimes[input.dataset.damageUptime]*100);
      else if(input.dataset.damageRotation)value=model.rotationWeights?.[input.dataset.damageRotation];
      else if(input.dataset.damageAttack)value=model.attackWeights?.[input.dataset.damageAttack];
      else{const key=input.dataset.damageSetting;value=key==='chargeFraction'?Math.round((s.chargeFraction??model.profile?.chargeFraction??0)*100):s[key];}
      if(value!==undefined&&input.value!==String(value))input.value=String(value);
    }
    for(const label of panel.querySelectorAll('[data-damage-frequency]')){
      const weights=label.dataset.damageFrequencyGroup==='rotation'?model.rotationWeights:model.attackWeights;
      if(!weights)continue;
      const total=Object.values(weights).reduce((a,b)=>a+b,0)||1;
      label.textContent=Math.round((weights[label.dataset.damageFrequency]||0)/total*100)+'%';
    }
  }
  function skillDetail(model,id,skills){
    if(!model?.available)return {intro:'',levels:[]};
    return {intro:'',levels:model.levels(id,skills).map(badge)};
  }
  const api={badge,summary,panel,mount,sync,skillDetail};root.WildsDamageUI=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
