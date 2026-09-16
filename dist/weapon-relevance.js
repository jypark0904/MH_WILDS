/* Rules describe applicable effects, never a damage-optimal build. The factory
 * is self-contained so its source can be embedded in the search worker. */
(function(root){
  'use strict';
  function createWeaponRelevance(db,weapon){
    const kinds=['great-sword','long-sword','sword-shield','dual-blades','hammer','hunting-horn','lance','gunlance','switch-axe','charge-blade','insect-glaive','light-bowgun','heavy-bowgun','bow'];
    const kind=kinds.includes(weapon?.kind)?weapon.kind:'';
    const known=!!kind&&weapon?.id!=='none-weapon';
    const skills={},excluded={},unknown={},elements=[];
    const entries=Array.isArray(db?.skills)?db.skills:[];
    const byId=new Map(entries.map(skill=>[skill.id,skill]));
    const byName=new Map(entries.filter(skill=>typeof skill.name==='string').map(skill=>[skill.name.replace(/\s/g,''),skill]));
    const positive=value=>Number.isFinite(value)&&value>0?Math.floor(value):0;
    const profile={known,kind,elements,skills,excluded,unknown,gain,reason};
    function gain(added,currentSkills={},deficits={}){
      let element=0,useful=0;
      for(const [id,value] of Object.entries(added||{})){
        const relevance=skills[id];if(!relevance)continue;
        const max=positive(byId.get(id)?.maxLevel),current=Math.min(max,positive(currentSkills[id]));
        const increment=Math.max(0,Math.min(positive(value),max-current)-positive(deficits[id]));
        if(relevance.priority===2)element+=increment;else useful+=increment;
      }
      return {element,useful};
    }
    function reason(id){return skills[id]?.reason||excluded[id]||unknown[id]||(known?'적용 조건을 아직 확인하지 않아 자동 추천에서 제외합니다.':'무기 종류를 확인할 수 없어 자동 추천하지 않습니다.');}
    if(!known)return profile;
    const ranged=['light-bowgun','heavy-bowgun','bow'].includes(kind),bowgun=['light-bowgun','heavy-bowgun'].includes(kind),melee=!ranged;
    const labels={fire:'불',water:'물',thunder:'번개',ice:'얼음',dragon:'용',poison:'독',paralysis:'마비',sleep:'수면',blast:'폭파'};
    const attributes=Object.keys(labels),trueElements=['fire','water','thunder','ice','dragon'],statuses=['poison','paralysis','sleep','blast'];
    const own=(obj,key)=>obj&&Object.prototype.hasOwnProperty.call(obj,key);
    const attribute=value=>typeof value==='string'?(value==='none'||attributes.includes(value)?value:null):value&&typeof value==='object'?attribute(value.element??value.type??value.kind):null;
    // Explicit entered values take precedence over older stored specials. In
    // particular, `none` must not resurrect a stale elemental weapon record.
    let attributeKnown=false,explicitNone=false;
    const selected=own(weapon.gogConfig,'element')?attribute(weapon.gogConfig.element):own(weapon,'element')?attribute(weapon.element):null;
    if(selected){attributeKnown=true;explicitNone=selected==='none';if(!explicitNone)elements.push(selected);}
    else if(Array.isArray(weapon.specials)){
      attributeKnown=true;
      for(const special of weapon.specials){const value=attribute(special?.element);if(value&&value!=='none'&&(!Number.isFinite(special.value)||special.value>0)&&!elements.includes(value))elements.push(value);}
      explicitNone=weapon.specials.length===0;
    }
    const hasElement=elements.some(value=>trueElements.includes(value)),hasStatus=elements.some(value=>statuses.includes(value));
    // A bow's native positive elemental value is evidence about its arrows.
    // Artian's status/coating selection alone is not such evidence; bowguns
    // likewise need a separate choice of ammo, which this profile does not infer.
    const bowElements=kind==='bow'?elements.filter(value=>(Number.isFinite(weapon.elementValue)&&weapon.elementValue>0)||(weapon.specials||[]).some(s=>s.element===value&&Number.isFinite(s.value)&&s.value>0)):[];
    const confirmedElement=melee?hasElement:bowElements.some(value=>trueElements.includes(value));
    const confirmedStatus=melee?hasStatus:bowElements.some(value=>statuses.includes(value));
    function find(name){return byName.get(name.replace(/\s/g,''));}
    function add(name,priority,why){const skill=find(name);if(skill){skills[skill.id]={priority,reason:why};delete excluded[skill.id];delete unknown[skill.id];}}
    function skip(name,why){const skill=find(name);if(skill){excluded[skill.id]=why;delete skills[skill.id];delete unknown[skill.id];}}
    function pending(name,why){const skill=find(name);if(skill&&!skills[skill.id]&&!excluded[skill.id])unknown[skill.id]=why;}
    function group(names,allowed,why,notWhy){for(const name of names)if(allowed)add(name,1,why);else skip(name,notWhy);}

    // General attack, survival, movement, item and gathering effects explicitly
    // described in the bundled Wilds game text. Conditional effects retain
    // their trigger in the displayed explanation; relevance is not uptime.
    const general=[
      '공격','간파','슈퍼회심','물에 젖은 명검','백열의 격류','파워스톤','냥냥봉',
      '용 내성','물 내성','불 내성','번개 내성','얼음 내성','마비 내성','독 내성','수면 내성','기절 내성','폭파 피해 내성','열상 내성','속박 내성','방어력 DOWN 내성','속성 피해 내성','악취 내성',
      '방어','정령의 가호','체력 회복량 UP','회복 속도','체술','런너','스태미나 급속 회복','납도술','귀마개','풍압 내성','내진','회피 성능','회피 거리 UP','뛰어들기','점프 철인','움찔 감소','완충',
      '약점 특효','도전자','연격','혼신','완전 충전','앙심','역습','교격','힘의 해방','무아지경','재난대처능력','공세','급습','파괴왕','쇄인자격','연찬',
      '정비','아이템 사용 강화','빨리 먹기','만족감','광역화','버섯 애호가','보머','환경 이용 지식','환경 적응','물가/기름 진흙 적응','클라이머','지질학','식생학','곤충박사','위협','섬광 강화','헌터 생활','동반자 지휘','배고픔 내성',
    ];
    for(const name of general){const skill=find(name);if(skill)add(name,1,'무기 종류 제한이 없는 효과입니다. '+(skill.description||'각 스킬의 발동 조건을 충족해야 합니다.'));}

    const elementSkills={fire:'불속성 공격 강화',water:'물속성 공격 강화',thunder:'번개속성 공격 강화',ice:'얼음속성 공격 강화',dragon:'용속성 공격 강화',poison:'독속성 강화',paralysis:'마비속성 강화',sleep:'수면속성 강화',blast:'폭파속성 강화'};
    for(const [value,name] of Object.entries(elementSkills)){
      if(kind==='bow'&&bowElements.includes(value))add(name,2,'양수 수치로 확인된 활의 '+labels[value]+' 속성·상태 이상과 일치합니다.');
      else if(ranged)pending(name,'사용할 탄·병과 사격 속성을 확정하지 않아 속성 강화 추천을 보류합니다.');
      else if(elements.includes(value))add(name,2,'등록된 무기의 '+labels[value]+' 속성·상태 이상과 일치합니다.');
      else if(attributeKnown)skip(name,explicitNone?'무속성으로 등록된 무기입니다.':'등록된 무기의 속성·상태 이상과 일치하지 않습니다.');
      else pending(name,'무기의 속성·상태 이상이 아직 등록되지 않았습니다.');
    }
    for(const [name,applies] of [['회심격【속성】',confirmedElement],['회심격【특수】',confirmedStatus],['독 대미지 강화',melee?elements.includes('poison'):bowElements.includes('poison')]]){
      if(applies)add(name,1,'등록된 무기의 속성·상태 이상에 적용되는 효과입니다.');
      else if(ranged)pending(name,'사용할 탄·병의 속성 또는 상태 이상을 확정해야 합니다.');
      else if(attributeKnown)skip(name,'등록된 무기에 이 스킬이 강화하는 속성·상태 이상이 없습니다.');
      else pending(name,'무기의 속성·상태 이상을 확인해야 합니다.');
    }
    for(const name of ['전화위복','속성 흡수','내성 변환【번개】','내성 변환【물】']){
      if(confirmedElement||(name==='전화위복'&&confirmedStatus))add(name,1,'등록된 무기에 속성이 있으며, 스킬의 조건을 충족하면 속성 효과를 받을 수 있습니다.');
      else pending(name,'속성·탄·병과 스킬 발동 조건을 함께 확인해야 하므로 자동 추천을 보류합니다.');
    }
    group(['명검','장인','달인의 재주','숫돌 사용 고속화','칼날 연마','심안','둔기 사용','칼날비늘 연마','불꽃 요리사'],melee,'예리도를 사용하는 근접 무기에 적용됩니다. 예리도 상태 및 발동 조건에 따라 효과가 달라집니다.','예리도를 사용하지 않는 원거리 무기입니다.');
    const guards=['great-sword','sword-shield','lance','gunlance','charge-blade','heavy-bowgun'];
    group(['가드 성능','가드 강화','공격적인 방어'],guards.includes(kind),'가드가 가능한 무기이며, 가드 동작에 적용됩니다.','가드 동작이 없는 무기입니다.');
    group(['고속 변형'],['switch-axe','charge-blade'].includes(kind),'슬래시액스·차지액스의 변형 공격에 적용됩니다.','슬래시액스·차지액스 전용 효과입니다.');
    group(['강화 지속'],['long-sword','dual-blades','switch-axe','charge-blade','insect-glaive'].includes(kind),'이 무기의 강화 상태 지속 시간에 적용됩니다.','설명에 명시된 강화 상태를 사용하는 무기가 아닙니다.');
    group(['포탄 장전'],['gunlance','charge-blade'].includes(kind),'건랜스의 장전 수 또는 차지액스의 차지 수에 적용됩니다.','건랜스·차지액스 전용 효과입니다.');
    if(kind==='gunlance')add('포술',1,'건랜스 포격·용격포에 적용됩니다.');
    else if(kind==='charge-blade'){
      const phial=typeof weapon.phial==='string'?weapon.phial:weapon.phial?.kind;
      if(phial==='impact')add('포술',1,'유탄병 차지액스의 병 공격에 적용됩니다.');
      else if(phial==='element')skip('포술','강속성병의 속성 피해를 강화하는 스킬이 아닙니다.');
      else pending('포술','차지액스의 병 종류를 확인해야 합니다.');
    }else if(bowgun)pending('포술','철갑유탄 등 적용되는 탄을 사용할지 확인해야 합니다.');
    else skip('포술','건랜스 포격·유탄병·철갑유탄 계열 공격을 강화하는 효과입니다.');
    group(['구운 포수수'],kind==='gunlance','건랜스 용격 게이지의 발동 조건을 충족하면 적용됩니다.','건랜스 전용 효과입니다.');
    group(['피리 명인'],kind==='hunting-horn','수렵피리의 선율 효과 지속 시간에 적용됩니다.','수렵피리 전용 효과입니다.');
    group(['모으기 타격 강화'],kind==='hammer','해머의 모으기 공격에 적용됩니다.','해머 전용 효과입니다.');
    group(['산탄/강사 강화','통상탄/통상화살 강화','관통탄/용화살 강화','탄도 강화','특수 사격 강화','포스샷','칼날비늘 장전'],ranged,'활·보우건의 해당 사격·탄·병 동작에 적용됩니다. 사용하는 공격과 발동 조건을 확인하세요.','활·보우건의 사격·탄·병을 강화하는 효과입니다.');
    group(['퍼스트샷','회피 장전'],bowgun,'보우건 장전·탄 발사에 적용됩니다.','보우건 전용 효과입니다.');
    group(['속사 강화'],kind==='light-bowgun','라이트보우건의 속사에 적용됩니다.','라이트보우건 전용 효과입니다.');
    group(['독병 추가','마비병 추가','수면병 추가','폭파병 추가','멸기병 추가'],kind==='bow','활에서 사용할 수 있는 병을 추가합니다.','활 전용 효과입니다.');
    const focusKinds=['great-sword','long-sword','dual-blades','hammer','gunlance','switch-axe','charge-blade','bow','light-bowgun','heavy-bowgun'];
    if(focusKinds.includes(kind))add('집중',1,'설명에 명시된 모으기 공격 또는 이 무기의 게이지 충전에 적용됩니다.');
    else pending('집중','이 무기의 어떤 동작에 적용되는지 추가 확인이 필요합니다.');
    if(['great-sword','hammer','bow'].includes(kind)&&(confirmedElement||confirmedStatus))add('차지 마스터',1,'속성·상태 이상이 있는 무기의 모으기 공격에 적용됩니다.');
    else pending('차지 마스터','속성·상태 이상과 적용되는 모으기 동작을 함께 확인해야 합니다.');
    if(['hammer','hunting-horn','sword-shield'].includes(kind))add('KO술',1,'기절을 유발하는 타격 동작에 적용됩니다.');
    else pending('KO술','기절을 유발하는 공격 또는 탄을 사용할지 확인해야 합니다.');
    for(const skill of entries)if(!skills[skill.id]&&!excluded[skill.id]&&!unknown[skill.id])unknown[skill.id]='적용 동작·발동 조건을 확인하지 않아 자동 추천에서 제외합니다.';
    return profile;
  }
  root.WildsWeaponRelevance={createProfile:createWeaponRelevance,factory:createWeaponRelevance};
  if(typeof module!=='undefined')module.exports=root.WildsWeaponRelevance;
})(globalThis);
