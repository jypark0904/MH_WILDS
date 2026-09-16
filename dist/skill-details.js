/* Read-only skill descriptions from the same offline database as the solver. */
(function(root){
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const kinds={weapon:'무기 스킬',armor:'방어구 스킬',set:'시리즈 스킬',group:'그룹 스킬'};
  function button(skill,level,context){
    return `<button type="button" class="skill-detail-trigger" data-skill-detail="${esc(skill.id)}" data-skill-level="${esc(level)}" data-skill-context="${context==='target'?'target':'active'}" aria-haspopup="dialog" aria-label="${esc(skill.name)} 스킬 상세 정보">${esc(skill.name)}</button>`;
  }
  function html(skill,{level=0,context='active',damage={intro:'',levels:[]}}={}){
    if(!skill)return '';
    const ranks=[...(skill.ranks||[])].sort((a,b)=>a.level-b.level);
    const current=ranks.some(rank=>rank.level===Number(level))?Number(level):0;
    const label=context==='target'?'목표':'발동';
    return `<header class="skill-info-header"><div><p class="eyebrow">스킬 상세</p><h2 id="skill-info-title">${esc(skill.name)}</h2></div><form method="dialog"><button class="icon-button" aria-label="스킬 상세 닫기" autofocus>×</button></form></header><div class="skill-info-body"><div class="row wrap"><span class="badge">${esc(kinds[skill.kind]||'스킬')}</span><span class="badge">최대 Lv ${esc(skill.maxLevel)}</span>${current?`<span class="badge gold">${label} Lv ${current}</span>`:''}</div>${skill.description?`<p class="skill-info-description">${esc(skill.description)}</p>`:''}${damage.intro||''}<h3>레벨별 효과</h3>${ranks.length?`<ol class="skill-effect-list">${ranks.map(rank=>`<li class="skill-effect${rank.level===current?' is-current':''}"><div class="skill-effect-heading"><strong>Lv ${esc(rank.level)}</strong>${damage.levels?.[rank.level-1]||''}${rank.pieces?`<span class="badge">${esc(rank.pieces)}부위 필요</span>`:''}${rank.level===current?`<span class="skill-effect-current">${label} 레벨</span>`:''}</div>${rank.name?`<h4>${esc(rank.name)}</h4>`:''}<p>${esc(rank.description||'이 레벨의 효과 설명이 등록되어 있지 않습니다.')}</p></li>`).join('')}</ol>`:'<p class="hint">레벨별 효과 설명이 등록되어 있지 않습니다.</p>'}</div>`;
  }
  function mount(db,getDamage=()=>({intro:'',levels:[]})){
    const dialog=document.querySelector('#skill-info-dialog');if(!dialog)return;
    const skills=new Map(db.skills.map(skill=>[skill.id,skill]));let opener=null;
    document.addEventListener('click',event=>{
      const trigger=event.target.closest?.('button[data-skill-detail]');if(!trigger)return;
      const skill=skills.get(trigger.dataset.skillDetail);if(!skill)return;
      event.preventDefault();
      opener=trigger;dialog.innerHTML=html(skill,{level:Number(trigger.dataset.skillLevel),context:trigger.dataset.skillContext,damage:getDamage(skill.id,trigger.dataset.skillContext)});
      if(!dialog.open)dialog.showModal();dialog.scrollTop=0;
    });
    dialog.addEventListener('click',event=>{
      if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();
      if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();
    });
    dialog.addEventListener('close',()=>{if(opener?.isConnected)opener.focus({preventScroll:true});opener=null;});
  }
  const api={button,html,mount};root.WildsSkillDetails=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
