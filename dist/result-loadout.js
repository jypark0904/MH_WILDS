/* Result placements are the solver's exact equipment ID and original slot index. */
(function(root){
  'use strict';
  const Relevance=root.WildsWeaponRelevance||(typeof require==='function'?require('./weapon-relevance.js'):null);
  const PARTS=[['head','머리','머'],['chest','몸통','몸'],['arms','팔','팔'],['waist','허리','허'],['legs','다리','다']];
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function render(result,db,{targets={}}={}){
    if(!result)return '';
    const skills=new Map((db.skills||[]).map(skill=>[skill.id,skill]));
    const decorations=new Map((db.decorations||[]).map(decoration=>[decoration.id,decoration]));
    const profile=Relevance.createProfile(db,result.weapon),reasons=new Map();
    const current={...result.rawSkills||result.skills};
    for(const placement of result.placements||[])for(const [id,n]of Object.entries(decorations.get(placement.decorationId)?.skills||{}))current[id]=Math.max(0,(current[id]||0)-n);
    for(const placement of result.placements||[]){
      const entries=Object.entries(decorations.get(placement.decorationId)?.skills||{}),notes=[];
      for(const [id,n]of entries){
        const rule=profile.skills[id],before=current[id]||0,maximum=skills.get(id)?.maxLevel||0;
        const bonus=Math.max(0,Math.min(n,maximum-before)-Math.max(0,(targets[id]||0)-before));
        if(rule&&bonus>0)notes.push({priority:rule.priority,text:(skills.get(id)?.name||id)+' +'+bonus+' · '+rule.reason});
        current[id]=before+n;
      }
      if(notes.length)reasons.set(placement.equipmentId+':'+placement.slotIndex,notes.sort((a,b)=>b.priority-a.priority).map(note=>note.text).join(' / '));
    }
    const placements=new Map();
    for(const placement of result.placements||[]){
      if(!placements.has(placement.equipmentId))placements.set(placement.equipmentId,new Map());
      placements.get(placement.equipmentId).set(placement.slotIndex,placement);
    }
    const skillText=(values,prefix='Lv ')=>(Object.entries(values||{}).filter(([,level])=>level>0).map(([id,level])=>`${esc(skills.get(id)?.name||id)} ${prefix}${esc(level)}`).join(' · '));
    const items=[['무기','무',result.weapon],...PARTS.map(([kind,label,badge])=>[label,badge,(result.armor||[]).find(item=>item.kind===kind)]),['호석','호',result.charm]];

    return `<section class="loadout" aria-label="부위별 장식주 장착 안내"><div class="loadout-columns" aria-hidden="true"><span>장비</span><span>장식주</span></div><div class="loadout-items" role="list">${items.map(([label,badge,item])=>{
      const native=skillText(item?.skills);
      const tags=Object.entries(item?.tags||{}).filter(([,pieces])=>pieces>0).map(([id,pieces])=>`${esc(skills.get(id)?.name||id)} ${esc(pieces)}부위`).join(' · ');
      const name=item?.name||(label==='호석'?'호석 없음':label+' 미지정');
      return `<article class="loadout-item" role="listitem"${item?` data-equipment-id="${esc(item.id)}"`:''}><div class="loadout-equipment"><header class="loadout-heading"><span class="loadout-part"><span class="loadout-part-badge" aria-hidden="true">${(label==='무기'?root.WildsIcons?.weapon(item?.kind):root.WildsIcons?.armor(item?.kind||'charm'))||badge}</span><span class="loadout-part-name">${label}</span></span><h3>${esc(name)}</h3></header>${label==='무기'?(item?.specials||[]).map(e=>`<span class="element-stat">${root.WildsIcons?.element(e.element)||''} ${esc(e.value)}</span>`).join(''):''}${item?`<p class="loadout-native"><span>고유 스킬</span> ${native||'없음'}</p>`:''}${tags?`<p class="loadout-tags"><span>시리즈·그룹 기여</span> ${tags}</p>`:''}</div><div class="loadout-decorations" aria-label="${label} 장식주">${(item?.slots||[]).length?`<ol class="loadout-slots">${item.slots.map((slot,index)=>{
        const placement=placements.get(item.id)?.get(index);
        const decoration=placement?decorations.get(placement.decorationId):null;
        const weapon=slot.kind==='weapon';
        const reason=reasons.get(item.id+':'+index);
        return `<li class="loadout-slot ${placement?'loadout-filled':'loadout-empty'}" data-slot-index="${index}"><div class="loadout-slot-label"><span>${index+1}번 슬롯</span><span class="loadout-slot-size ${weapon?'loadout-weapon':'loadout-armor'}">${weapon?'무기용':'방어구용'} · Lv ${esc(slot.level)}</span></div><div class="loadout-decoration">${placement?`<strong>${esc(decoration?.name||placement.decorationId)}</strong>${decoration?`<small>${skillText(decoration.skills,'+')}</small>`:''}`:'<span>비어 있음</span>'}${reason?`<p class="loadout-reason">추가 효과: ${esc(reason)}</p>`:''}</div></li>`;
      }).join('')}</ol>`:'<p class="loadout-no-slots">슬롯 없음</p>'}</div></article>`;
    }).join('')}</div></section>`;
  }

  root.WildsResultLoadout={render};
  if(typeof module!=='undefined')module.exports=root.WildsResultLoadout;
})(globalThis);
