/* Level controls for an improvement search. Search state belongs to app.js. */
(function(root){
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const integer=value=>Number.isFinite(+value)&&Number.isInteger(+value);
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,Math.round(Number(value)||min)));
  function levelState(value,min,max,failedLevel){
    const level=Number(value),valid=String(value).trim()!==''&&integer(value)&&level>=min&&level<=max;
    return {level,valid,lowered:valid&&failedLevel!=null&&level<failedLevel,negative:valid&&failedLevel!=null&&level>=failedLevel};
  }
  function controls(skill,{level,minLevel=1,failedLevel=null,retry=false}){
    const max=Math.max(1,+skill.maxLevel||1),min=clamp(minLevel,1,max),value=clamp(level,min,max),state=levelState(value,min,max,failedLevel);
    const status=failedLevel==null?'':`<p class="improvement-level-status" role="status">${state.lowered?'Lv '+value+' · 낮춘 조건':'Lv '+value+' · 조합 미발견'}</p>`;
    return `<div class="improvement-control${state.negative?' is-failed':''}${state.lowered?' is-lowered':''}" data-improvement-id="${esc(skill.id)}"${failedLevel==null?'':` data-failed-level="${failedLevel}"`} data-retry="${retry}"><div class="improvement-control-row"><div class="improvement-stepper" role="group" aria-label="${esc(skill.name)} 탐색 레벨"><button type="button" class="improvement-step" data-step="-1" aria-label="${esc(skill.name)} 탐색 레벨 낮추기"${value<=min?' disabled':''}>−</button><label class="improvement-level-label"><span>Lv</span><input class="improvement-level" type="number" inputmode="numeric" min="${min}" max="${max}" step="1" value="${value}" aria-label="${esc(skill.name)} 탐색 레벨"></label><button type="button" class="improvement-step" data-step="1" aria-label="${esc(skill.name)} 탐색 레벨 높이기"${value>=max?' disabled':''}>＋</button></div><button type="button" class="improvement-submit">${retry?'다시 탐색하기':'탐색'}</button></div>${status}</div>`;
  }
  function html(db,insights){
    const skills=new Map((db?.skills||[]).map(skill=>[skill.id,skill]));
    const cards=items=>(items||[]).map(item=>{
      const skill=skills.get(item.id);if(!skill)return '';
      const minimum=Math.max(1,(Number(item.currentLevel)||0)+1);if(minimum>skill.maxLevel)return '';
      return `<article class="improvement-skill-card"><h4>${esc(skill.name)}</h4>${skill.description?'<p class="improvement-skill-description">'+esc(skill.description)+'</p>':''}${controls(skill,{level:item.level,minLevel:minimum})}</article>`;
    }).join('');
    const upgrades=cards(insights?.upgrades),additional=cards(insights?.additional);
    if(!upgrades&&!additional)return '';
    return `<section class="panel improvement-panel" aria-label="추가 제안"><div class="panel-heading"><h2>추가 제안</h2><span>현재 조건 유지</span></div>${upgrades?'<h3>목표 스킬 더 올리기</h3><div class="improvement-options">'+upgrades+'</div>':''}${additional?'<h3>추가 스킬</h3><div class="improvement-options">'+additional+'</div>':''}</section>`;
  }
  function failedHtml(db,{id,level,minLevel=1}={}){
    const skill=(db?.skills||[]).find(item=>item.id===id);if(!skill)return '';
    const value=clamp(level,1,skill.maxLevel);
    return `<section class="panel improvement-retry" aria-label="목표 레벨 조정"><div class="improvement-retry-heading"><h3>${esc(skill.name)}</h3><p>스킬 레벨을 조금 낮춰보세요.</p></div>${controls(skill,{level:value,minLevel,failedLevel:value,retry:true})}</section>`;
  }
  function mount({container=root.document,onSearch}){
    if(!container)return;
    for(const card of container.querySelectorAll('[data-improvement-id]')){
      const input=card.querySelector('.improvement-level'),submit=card.querySelector('.improvement-submit'),steps=[...card.querySelectorAll('.improvement-step')],status=card.querySelector('.improvement-level-status');
      const min=+input.min,max=+input.max,failed=card.dataset.failedLevel==null?null:+card.dataset.failedLevel;
      function refresh(){
        const state=levelState(input.value,min,max,failed);
        input.setAttribute('aria-invalid',String(!state.valid));submit.disabled=!state.valid;
        card.classList.toggle('is-failed',state.negative);card.classList.toggle('is-lowered',state.lowered);
        for(const step of steps)step.disabled=state.valid&&(+step.dataset.step<0?state.level<=min:state.level>=max);
        if(status)status.textContent=!state.valid?'Lv '+min+'–'+max+' 사이의 정수를 입력하세요.':state.lowered?'Lv '+state.level+' · 낮춘 조건':state.level===failed?'Lv '+state.level+' · 조합 미발견':'Lv '+state.level+' · 더 높은 조건';
        return state;
      }
      function search(){const state=refresh();if(state.valid)onSearch(card.dataset.improvementId,state.level,{retry:card.dataset.retry==='true'});}
      input.oninput=refresh;input.onchange=refresh;
      input.onkeydown=event=>{if(event.key==='Enter'&&!event.isComposing){event.preventDefault();search();}};
      for(const step of steps)step.onclick=()=>{input.value=String(clamp((integer(input.value)?+input.value:min)+Number(step.dataset.step),min,max));refresh();};
      submit.onclick=search;refresh();
    }
  }
  const api={html,failedHtml,mount,levelState};root.WildsImprovementUI=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
