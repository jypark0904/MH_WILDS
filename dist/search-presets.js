/* Search conditions only. Applying a preset never rewinds the hunter's inventory. */
(function(root){
  'use strict';
  const LIMIT=30,PARTS={head:'머리',chest:'몸통',arms:'팔',waist:'허리',legs:'다리'};
  const FIELDS=['targets','selectedWeapon','charmMode','selectedCharm','rank','maxRarity','minDefense','inventoryMode','fixed'];
  const clone=value=>structuredClone(value);
  const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
  const string=value=>typeof value==='string'&&value.length<=160;
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let selectedId='';

  function snapshot(state){
    return {targets:clone(state.targets||{}),selectedWeapon:state.selectedWeapon||'',charmMode:state.charmMode||'owned',selectedCharm:state.selectedCharm||'',rank:state.rank||'high',maxRarity:state.maxRarity??10,minDefense:state.minDefense??0,inventoryMode:state.inventoryMode||'all',fixed:clone(state.fixed||{})};
  }
  function validate(preset,db){
    if(!object(preset)||typeof preset.id!=='string'||!preset.id.trim()||preset.id.length>160||typeof preset.name!=='string'||!preset.name.trim()||preset.name.length>60||typeof preset.createdAt!=='string'||!Number.isFinite(Date.parse(preset.createdAt)))throw Error('검색 프리셋 이름 또는 저장 정보가 잘못되었습니다.');
    const c=preset.conditions,skills=new Map(db.skills.map(s=>[s.id,s]));
    if(!object(c)||Object.keys(c).some(k=>!FIELDS.includes(k))||FIELDS.some(k=>!Object.hasOwn(c,k)))throw Error('검색 프리셋 조건 형식이 잘못되었습니다.');
    if(!object(c.targets)||Object.entries(c.targets).some(([id,n])=>!skills.has(id)||!Number.isInteger(n)||n<1||n>skills.get(id).maxLevel))throw Error('검색 프리셋의 목표 스킬이 잘못되었습니다.');
    if(!string(c.selectedWeapon)||!string(c.selectedCharm)||!['owned','fixed','none'].includes(c.charmMode)||!['high','all'].includes(c.rank)||!['all','owned'].includes(c.inventoryMode))throw Error('검색 프리셋의 장비 조건이 잘못되었습니다.');
    if(!Number.isInteger(c.maxRarity)||c.maxRarity<1||c.maxRarity>10||!Number.isFinite(c.minDefense)||c.minDefense<0||c.minDefense>2000)throw Error('검색 프리셋의 검색 수치가 잘못되었습니다.');
    if(!object(c.fixed)||Object.entries(c.fixed).some(([part,id])=>!Object.hasOwn(PARTS,part)||!string(id)))throw Error('검색 프리셋의 부위 고정이 잘못되었습니다.');
    return true;
  }
  function validateList(presets,db){
    if(!Array.isArray(presets)||presets.length>LIMIT)throw Error('검색 프리셋은 최대 30개까지 저장할 수 있습니다.');
    const ids=new Set(),names=new Set();
    for(const preset of presets){validate(preset,db);if(ids.has(preset.id)||names.has(preset.name.trim()))throw Error('검색 프리셋의 ID 또는 이름이 중복되었습니다.');ids.add(preset.id);names.add(preset.name.trim());}
    return true;
  }
  function apply(state,preset,db){
    validate(preset,db);
    const next={...clone(state),...clone(preset.conditions)},warnings=[];
    if(next.selectedWeapon&&!(state.weapons||[]).some(w=>w.id===next.selectedWeapon)){next.selectedWeapon='';warnings.push('저장 당시의 무기가 없어 무기를 미지정으로 바꿨습니다.');}
    if(next.selectedCharm&&!(state.charms||[]).some(c=>c.id===next.selectedCharm))next.selectedCharm='';
    if(next.charmMode==='fixed'&&!next.selectedCharm){next.charmMode='owned';warnings.push('고정한 호석이 없어 현재 보유 호석 전체를 비교합니다.');}
    const armor=new Map(db.armor.map(a=>[a.id,a])),blocked=new Set(state.excluded||[]);
    for(const [part,id]of Object.entries(next.fixed)){
      if(!id){delete next.fixed[part];continue;}
      const a=armor.get(id);
      if(!a||a.kind!==part||blocked.has(id)||a.rarity>next.maxRarity||(next.rank==='high'&&a.rank!=='high')){delete next.fixed[part];warnings.push(`${PARTS[part]} 고정을 해제했습니다. 현재 해금 또는 검색 조건에서 사용할 수 없습니다.`);}
    }
    return {state:next,warnings};
  }
  function create(state,name,db){
    const trimmed=String(name??'').trim();
    if(!trimmed||trimmed.length>60)throw Error('프리셋 이름을 1~60자로 입력하세요.');
    if((state.presets||[]).some(p=>p.name.trim()===trimmed))throw Error('같은 이름이 있습니다. 저장된 프리셋을 선택한 뒤 덮어쓰기를 누르세요.');
    if((state.presets||[]).length>=LIMIT)throw Error('검색 프리셋은 최대 30개입니다. 사용하지 않는 프리셋을 삭제하세요.');
    const preset={id:'preset:'+(root.crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2)),name:trimmed,createdAt:new Date().toISOString(),conditions:snapshot(state)};
    validate(preset,db);
    return {...state,presets:[...(state.presets||[]),preset]};
  }
  function overwrite(state,id,name,db){
    const previous=(state.presets||[]).find(p=>p.id===id);
    if(!previous)throw Error('덮어쓸 프리셋을 선택하세요.');
    const trimmed=String(name??'').trim();
    if((state.presets||[]).some(p=>p.id!==id&&p.name.trim()===trimmed))throw Error('같은 이름의 다른 프리셋이 있습니다. 이름을 바꿔 주세요.');
    const updated={...previous,name:trimmed,conditions:snapshot(state)};
    validate(updated,db);
    return {...state,presets:state.presets.map(p=>p.id===id?updated:p)};
  }
  function remove(state,id){
    if(!(state.presets||[]).some(p=>p.id===id))throw Error('삭제할 프리셋을 선택하세요.');
    return {...state,presets:state.presets.filter(p=>p.id!==id)};
  }
  function html(state){
    const presets=state.presets||[],selected=presets.find(p=>p.id===selectedId);
    if(!selected)selectedId='';
    return `<section id="search-presets" class="panel" aria-label="검색 프리셋"><div class="row between"><h2>검색 프리셋</h2><small>${presets.length} / ${LIMIT}</small></div><label>프리셋 이름<input id="preset-name" maxlength="60" autocomplete="off" placeholder="예: 건랜스 포격 세팅" value="${esc(selected?.name||'')}"></label><button type="button" id="preset-save">현재 검색 조건 저장</button><label>저장된 프리셋<select id="preset-select"><option value="">${presets.length?'불러올 프리셋 선택':'저장한 프리셋이 없습니다'}</option>${presets.map(p=>`<option value="${esc(p.id)}" ${p.id===selectedId?'selected':''}>${esc(p.name)}</option>`).join('')}</select></label><div class="row wrap"><button type="button" id="preset-load" ${selected?'':'disabled'}>불러오기</button><button type="button" id="preset-overwrite" ${selected?'':'disabled'}>덮어쓰기</button><button type="button" id="preset-delete" ${selected?'':'disabled'}>삭제</button></div><p class="hint" style="margin-top:.6rem">스킬·무기·호석·검색 조건을 저장합니다.</p><p id="preset-message" class="hint" role="status" aria-live="polite"></p></section>`;
  }
  function mount({db,getState,onSaveState,onApply}){
    const container=root.document?.querySelector('#search-presets');if(!container)return;
    const $=id=>container.querySelector(id),say=(message,error=false)=>{$('#preset-message').textContent=message;$('#preset-message').className=error?'warning-text hint':'hint';};
    const run=action=>{try{action();}catch(e){say(e.message,true);}};
    $('#preset-select').onchange=e=>{
      selectedId=e.target.value;
      const preset=(getState().presets||[]).find(p=>p.id===selectedId);
      $('#preset-name').value=preset?.name||'';
      for(const id of ['#preset-load','#preset-overwrite','#preset-delete'])$(id).disabled=!preset;
      say(preset?`목표 스킬 ${Object.keys(preset.conditions.targets).length}개 · ${new Date(preset.createdAt).toLocaleDateString('ko-KR')} 저장`:'');
    };
    $('#preset-save').onclick=()=>run(()=>{const next=create(getState(),$('#preset-name').value,db);selectedId=next.presets.at(-1).id;onSaveState(next,'검색 프리셋을 저장했습니다.');});
    $('#preset-overwrite').onclick=()=>run(()=>{const next=overwrite(getState(),selectedId,$('#preset-name').value,db);onSaveState(next,'현재 검색 조건으로 프리셋을 덮어썼습니다.');});
    $('#preset-delete').onclick=()=>run(()=>{const next=remove(getState(),selectedId);selectedId='';onSaveState(next,'검색 프리셋을 삭제했습니다.');});
    $('#preset-load').onclick=()=>run(()=>{const state=getState(),preset=(state.presets||[]).find(p=>p.id===selectedId);if(!preset)throw Error('불러올 프리셋을 선택하세요.');const result=apply(state,preset,db);onApply(result.state,result.warnings,`‘${preset.name}’ 검색 조건을 불러왔습니다.`);});
  }
  const api={LIMIT,snapshot,validate,validateList,apply,create,overwrite,remove,html,mount};
  root.WildsSearchPresets=api;
  if(typeof module!=='undefined')module.exports=api;
})(globalThis);
