/* Curated Wilds skill recommendations. Local data; adding targets is always explicit. */
(function(root){
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const compact=value=>String(value??'').normalize('NFKC').toLowerCase().replace(/[\s_-]/g,'');
  const ELEMENT_NAMES={fire:'불',water:'물',thunder:'번개',ice:'얼음',dragon:'용'};
  const ELEMENT_ALIASES={fire:['fire','불','화','불속성','화속성'],water:['water','물','수','물속성','수속성'],thunder:['thunder','번개','뇌','번개속성','뇌속성'],ice:['ice','얼음','빙','얼음속성','빙속성'],dragon:['dragon','용','용속성']};
  const STATUS_ALIASES={poison:['poison','독'],paralysis:['paralysis','paralyze','마비'],sleep:['sleep','수면'],blast:['blast','폭파']};
  const SHELL_ALIASES={normal:['normal','일반','일반형'],long:['long','방사','방사형'],wide:['wide','확산','확산형']};
  const PHIAL_ALIASES={impact:['impact','impactphial','榴弾ビン','유탄','유탄병'],element:['element','elemental','powerelement','powerelementphial','強属性ビン','강속성','강속성병']};
  const SWITCH_PHIAL_ALIASES={power:['power','powerphial','강격','강격병','exhaust','멸기','멸기병','poison','독병','paralyze','paralysis','마비병','dragon','멸룡병'],element:PHIAL_ALIASES.element};
  const bowgun=kind=>['light-bowgun','heavy-bowgun'].includes(kind);
  const elementalAmmoType=type=>['element','hybrid'].includes(type);
  const explicitType=kind=>['gunlance','charge-blade','switch-axe','bow','hunting-horn'].includes(kind)||bowgun(kind);
  const ammoKind=kind=>({flaming:'fire',freeze:'ice'}[kind]||kind);
  const activeValue=s=>s.value===undefined||Number.isFinite(Number(s.value))&&Number(s.value)>0;
  const activeElementSpecial=s=>s.kind==='element'&&activeValue(s);
  function matching(value,aliases){const text=compact(typeof value==='object'?(value?.kind??value?.type??value?.element):value);return Object.keys(aliases).find(key=>aliases[key].some(alias=>compact(alias)===text))||'';}
  function automaticType(weapon){
    if(weapon?.kind==='gunlance')return matching(weapon.shell,SHELL_ALIASES)||matching(weapon.shellType,SHELL_ALIASES)||({attack:'normal',affinity:'long',element:'wide'}[weapon.gogConfig?.intensification]||'');
    if(weapon?.kind==='charge-blade')return matching(weapon.phial,PHIAL_ALIASES);
    if(weapon?.kind==='switch-axe')return elementMode(weapon)==='raw'?'power':matching(weapon.phial,SWITCH_PHIAL_ALIASES);
    if(['bow','hunting-horn'].includes(weapon?.kind))return elementMode(weapon);
    return '';
  }
  function weaponElement(weapon){
    if(weapon?.gogConfig&&Object.hasOwn(weapon.gogConfig,'element'))return matching(weapon.gogConfig.element,ELEMENT_ALIASES);
    if(weapon&&Object.hasOwn(weapon,'element'))return matching(weapon.element,ELEMENT_ALIASES);
    const elements=[...new Set((weapon?.specials||[]).filter(activeElementSpecial).map(s=>matching(s.element,ELEMENT_ALIASES)).filter(Boolean))];
    return elements.length===1?elements[0]:'';
  }
  function elementMode(weapon){
    if(weaponElement(weapon))return 'element';
    const explicit=weapon?.gogConfig&&Object.hasOwn(weapon.gogConfig,'element')?weapon.gogConfig.element:weapon&&Object.hasOwn(weapon,'element')?weapon.element:undefined;
    if(explicit!==undefined)return ['none','무속','무속성'].includes(compact(explicit))||matching(explicit,STATUS_ALIASES)?'raw':'';
    return Array.isArray(weapon?.specials)&&!weapon.specials.some(activeElementSpecial)?'raw':'';
  }
  function hasStatus(weapon){
    const explicit=weapon?.gogConfig&&Object.hasOwn(weapon.gogConfig,'element')?weapon.gogConfig.element:weapon?.element;
    if(matching(explicit,STATUS_ALIASES))return true;
    const coatings=weapon?.kind==='bow'?(weapon.coatings||[]):[];
    if(coatings.some(coating=>matching(coating,STATUS_ALIASES)))return true;
    if(explicit!==undefined)return false;
    return (weapon?.specials||[]).some(s=>s.kind==='status'&&activeValue(s)&&matching(s.element??s.status,STATUS_ALIASES));
  }
  function sourceInfo(catalog,ids){return [...new Set(ids)].map(id=>({id,...catalog.sources?.[id]})).filter(source=>{try{const url=new URL(source.url);return url.protocol==='https:'&&!url.username&&!url.password;}catch{return false;}});}
  function recommend(db,catalog,weapon,selection={}){
    const original=(db?.weapons||[]).find(w=>weapon?.originId&&w.id===weapon.originId)||(db?.weapons||[]).find(w=>weapon?.id&&w.id===weapon.id),resolved={...original,...weapon};
    const kind=resolved.kind||'',entry=catalog?.game==='wilds'?catalog.weapons?.[kind]:null;
    const ammo=!weapon?.gogConfig&&Array.isArray(resolved.ammo)&&resolved.ammo.length?resolved.ammo.filter(a=>a.capacity===undefined||a.capacity>0).map(a=>({...a,kind:ammoKind(a.kind)})):null;
    const ammoKinds=ammo?new Set(ammo.map(a=>a.kind)):null,availableElements=Object.keys(ELEMENT_NAMES).filter(element=>!bowgun(kind)||!ammoKinds||ammoKinds.has(element));
    const supportsType=id=>!bowgun(kind)||!ammoKinds||elementalAmmoType(id)&&availableElements.length>0||!['normal','pierce','spread','sticky','element','hybrid'].includes(id)||ammoKinds.has(id);
    const types=(Array.isArray(entry?.types)?entry.types:[]).filter(t=>supportsType(t.id)),auto=automaticType(weapon)||automaticType(resolved),chosen=types.find(t=>t.id===selection.type),detected=types.find(t=>t.id===auto);
    const needsExplicit=explicitType(kind);
    const typeInfo=chosen||detected||(!needsExplicit?types.find(t=>t.id===entry?.defaultType):null)||null;
    let automaticNote=!chosen&&kind==='switch-axe'&&detected?.id==='power'&&!matching(resolved.phial,{power:['power','powerphial','강격','강격병']})?'강격병 이외의 병은 물리 중심 추천을 참고하세요.':'';
    const selectedElement=matching(selection.element,ELEMENT_ALIASES);
    const element=bowgun(kind)&&elementalAmmoType(typeInfo?.id)?(availableElements.includes(selectedElement)?selectedElement:''):weaponElement(resolved);
    const selectedAmmo=(ammo||[]).filter(a=>a.kind===(elementalAmmoType(typeInfo?.id)?element:typeInfo?.id)),rapidUnsupported=kind==='light-bowgun'&&selectedAmmo.length>0&&selectedAmmo.every(a=>a.rapid===false),omittedSkills=[],rapidOmitted=[],elementOmitted=[],chargeOmitted=[];
    const mapped=new Map();
    for(const rule of typeInfo?.skills||[]){
      if(rapidUnsupported&&['속사 강화','집중'].some(name=>compact(rule.name)===compact(name))){omittedSkills.push(rule.name);rapidOmitted.push(rule.name);continue;}
      const name=rule.name==='@element-attack'?(element?ELEMENT_NAMES[element]+'속성 공격 강화':''):rule.name;
      const namedElement=Object.keys(ELEMENT_NAMES).find(id=>compact(name)===compact(ELEMENT_NAMES[id]+'속성 공격 강화'));
      if(!element&&compact(name)===compact('회심격【속성】')||namedElement&&namedElement!==element){omittedSkills.push(name);elementOmitted.push(name);continue;}
      if(compact(name)===compact('차지 마스터')&&!element&&!hasStatus(resolved)){omittedSkills.push(name);chargeOmitted.push(name);continue;}
      const skill=(db?.skills||[]).find(s=>compact(s.name)===compact(name));
      if(!name||!skill||!Number.isInteger(rule.level)||rule.level<1||!Number.isInteger(skill.maxLevel)||skill.maxLevel<1)continue;
      const prior=mapped.get(skill.id),sourceIds=[...new Set([...(prior?.sourceIds||[]),...(Array.isArray(rule.sources)?rule.sources:[])])];
      mapped.set(skill.id,{id:skill.id,name:skill.name,level:Math.min(skill.maxLevel,Math.max(prior?.level||0,rule.level)),priority:prior?.priority==='core'||rule.priority==='core'?'core':'optional',reason:prior?.reason||rule.reason||'',sourceIds});
    }
    automaticNote=[automaticNote,rapidOmitted.length?'선택한 탄은 속사를 지원하지 않아 '+rapidOmitted.join(' · ')+' 추천을 제외했습니다.':'',elementOmitted.length?'일치하는 실제 속성이 확인되지 않아 '+elementOmitted.join(' · ')+' 추천을 제외했습니다.':'',chargeOmitted.length?'속성·상태이상이 확인되지 않아 차지 마스터 추천을 제외했습니다.':''].filter(Boolean).join(' ');
    const skills=[...mapped.values()],ids=[...(typeInfo?.sourceIds||[]),...skills.flatMap(s=>s.sourceIds)];
    return {available:!!entry,kind,label:entry?.label||'',typeLabel:entry?.typeLabel||'운용 유형',type:typeInfo?.id||'',defaultType:entry?.defaultType||'',typeInfo,types,automaticType:detected?.id||'',automaticNote,manualType:!!chosen,needsType:!!entry&&!typeInfo,element,availableElements,needsElement:bowgun(kind)&&elementalAmmoType(typeInfo?.id)&&!element,skills,core:skills.filter(s=>s.priority==='core'),optional:skills.filter(s=>s.priority!=='core'),omittedSkills,sources:sourceInfo(catalog||{},ids),researchedAt:catalog?.researchedAt||'',dbVersion:catalog?.dbVersion||''};
  }
  function mergeTargets(existing,skills){const targets={...(existing||{})};for(const skill of skills)targets[skill.id]=Math.max(Number(targets[skill.id])||0,skill.level);return targets;}
  function skillButton(skill,targets){const current=Number(targets?.[skill.id])||0,added=current>=skill.level;return `<button type="button" class="weapon-meta-skill${added?' is-added':''}" data-meta-skill="${esc(skill.id)}" aria-label="${esc(skill.name)} Lv ${skill.level}${added?' 반영됨':' 목표에 추가'}" title="${esc(skill.reason)}" ${added?'disabled':''}><span>${esc(skill.name)} <b>Lv ${skill.level}</b></span><small>${added?'✓ 반영됨':'＋ 추가'}</small></button>`;}
  function html(db,catalog,weapon,targets={},selection={}){
    const r=recommend(db,catalog,weapon,selection),title='<div class="weapon-meta-heading"><h2 id="weapon-meta-heading">무기별 스킬 추천</h2></div>';
    if(!weapon||!weapon.kind)return `<section id="weapon-meta" class="panel weapon-meta" aria-labelledby="weapon-meta-heading">${title}<p class="hint">무기를 선택하면 운용 유형에 맞는 추천 스킬을 볼 수 있습니다.</p></section>`;
    if(!r.available)return `<section id="weapon-meta" class="panel weapon-meta" aria-labelledby="weapon-meta-heading">${title}<p class="hint">이 무기의 추천 자료를 준비 중입니다. 아래에서 목표 스킬을 직접 입력하세요.</p></section>`;
    const selected=selection.type&&r.manualType?r.type:'',typeOptions=r.types.map(type=>`<option value="${esc(type.id)}" ${selected===type.id?'selected':''}>${esc(type.label)}</option>`).join('');
    const defaultType=r.types.find(t=>t.id===r.defaultType),autoText=r.automaticType?'자동 · '+r.types.find(t=>t.id===r.automaticType).label:!explicitType(r.kind)&&defaultType?'기본 · '+defaultType.label:r.typeLabel+'을 선택하세요';
    const typeControl=`<label class="weapon-meta-type" for="weapon-meta-type">${esc(r.typeLabel)}<select id="weapon-meta-type"><option value="" ${!selected?'selected':''}>${esc(autoText)}</option>${typeOptions}</select></label>`;
    const elementControl=bowgun(r.kind)&&elementalAmmoType(r.type)?`<label class="weapon-meta-element" for="weapon-meta-element">주력 속성탄<select id="weapon-meta-element"><option value="">속성을 선택하세요</option>${r.availableElements.map(id=>`<option value="${id}" ${r.element===id?'selected':''}>${ELEMENT_NAMES[id]}속성</option>`).join('')}</select></label>`:'';
    const complete=r.core.length>0&&r.core.every(s=>(targets[s.id]||0)>=s.level);
    const details=r.skills.length?`<details class="weapon-meta-evidence"><summary>추천 이유</summary><dl>${r.skills.map(skill=>`<dt>${esc(skill.name)} Lv ${skill.level}</dt><dd>${esc(skill.reason)}</dd>`).join('')}</dl></details>`:'';
    return `<section id="weapon-meta" class="panel weapon-meta" aria-labelledby="weapon-meta-heading">${title}${typeControl}${elementControl}${r.manualType?'<p class="hint weapon-meta-detection">직접 선택한 운용 유형 기준</p>':r.automaticType?'<p class="hint weapon-meta-detection">등록한 무기 정보에서 자동 확인</p>':''}${r.automaticNote?`<p class="hint">${esc(r.automaticNote)}</p>`:''}${r.needsType?`<p class="hint">${esc(r.typeLabel)}에 따라 추천이 달라집니다. 사용할 유형을 선택하세요.</p>`:`<p class="hint weapon-meta-description">${esc(r.typeInfo?.description||'운용에 맞는 목표 스킬을 선택하세요.')}</p>${r.needsElement?'<p class="hint">주력 속성탄을 선택하면 해당 속성 강화도 추천합니다.</p>':''}<div class="weapon-meta-skills">${r.core.map(s=>skillButton(s,targets)).join('')}</div>${r.core.length?`<button type="button" id="weapon-meta-add-core" class="weapon-meta-add-core" ${complete?'disabled':''}>${complete?'✓ 핵심 추천 반영됨':'핵심 추천 한 번에 추가'}</button>`:''}${r.optional.length?`<details class="weapon-meta-optional" open><summary>선택 추천 ${r.optional.length}개</summary><div class="weapon-meta-skills">${r.optional.map(s=>skillButton(s,targets)).join('')}</div></details>`:''}${details}`}</section>`;
  }
  function mount({db,catalog,getWeapon,getTargets,getSelection=()=>({}),onSelection,onAdd}){
    const section=document.querySelector('#weapon-meta');if(!section)return;
    const type=section.querySelector('#weapon-meta-type'),element=section.querySelector('#weapon-meta-element');
    if(type)type.onchange=()=>onSelection({...getSelection(),type:type.value});
    if(element)element.onchange=()=>onSelection({...getSelection(),element:element.value});
    function add(ids){const r=recommend(db,catalog,getWeapon(),getSelection());const wanted=ids?new Set(ids):null,skills=wanted?r.skills.filter(s=>wanted.has(String(s.id))):r.core;if(skills.length)onAdd(mergeTargets(getTargets(),skills));}
    for(const button of section.querySelectorAll('[data-meta-skill]'))button.onclick=()=>add([button.dataset.metaSkill]);
    const all=section.querySelector('#weapon-meta-add-core');if(all)all.onclick=()=>add();
  }
  const api={recommend,html,mount};root.WildsWeaponMeta=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
