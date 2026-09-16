/* Monster Hunter Wilds Gog Artian configuration and name detection. */
(function(root){
  'use strict';
  const WEAPONS={'great-sword':'대검','long-sword':'태도','sword-shield':'한손검','dual-blades':'쌍검',hammer:'해머','hunting-horn':'수렵피리',lance:'랜스',gunlance:'건랜스','switch-axe':'슬래시액스','charge-blade':'차지액스','insect-glaive':'조충곤','light-bowgun':'라이트보우건','heavy-bowgun':'헤비보우건',bow:'활'};
  const ELEMENTS={none:'무속성',fire:'불',water:'물',thunder:'번개',ice:'얼음',dragon:'용',poison:'독',paralysis:'마비',sleep:'수면',blast:'폭파'};
  const ELEMENT_ALIASES={none:['무속성','무속'],fire:['화','불'],water:['수','물'],thunder:['번개','뇌'],ice:['얼음','빙'],dragon:['용'],poison:['독'],paralysis:['마비'],sleep:['수면'],blast:['폭파']};
  const FOCUS={attack:'공격 격화',affinity:'회심 격화',element:'속성 격화'},SHELLS={normal:'일반형',long:'방사형',wide:'확산형'};
  const BONUS_NAMES={attack:'기초 공격력 강화',affinity:'회심률 강화',element:'속성 강화',sharpness:'예리도 강화',ammo:'장전 수 강화'};
  const normalize=s=>String(s||'').normalize('NFKC').replace(/[\s·・【】\[\]「」()<>_-]/g,'').toLowerCase();
  const isBowgun=kind=>kind==='light-bowgun'||kind==='heavy-bowgun';
  const rules=()=>root.WILDS_GOG_DATA;
  function detectWeaponName(name,db){
    const text=normalize(name);if(!text)return {};
    let category=text.includes('거극아티어')?'거극 아티어':text.includes('아티어')?'아티어':null;
    const profiles=Object.values(rules()?.profiles||{});
    const known=profiles.filter(p=>text.includes(normalize(p.name))).sort((a,b)=>b.name.length-a.name.length)[0];
    if(known)return {kind:known.kind,category:'거극 아티어',matched:known.name};
    const original=profiles.flatMap(p=>(p.artianNames||[]).map(name=>({kind:p.kind,name}))).filter(p=>text.includes(normalize(p.name))).sort((a,b)=>normalize(b.name).length-normalize(a.name).length)[0];
    if(original)return {kind:original.kind,category:category||'아티어',matched:original.name};
    const tokens=(String(name).normalize('NFKC').match(/[\p{L}\p{N}]+/gu)||[]).map(normalize);
    const matches=(db?.weapons||[]).filter(w=>{const n=normalize(w.name);return n.length>=3?text.includes(n):text===n||tokens.includes(n);}).sort((a,b)=>normalize(b.name).length-normalize(a.name).length);
    if(matches.length){const length=normalize(matches[0].name).length,top=matches.filter(w=>normalize(w.name).length===length);if(new Set(top.map(w=>w.kind)).size===1)return {kind:top[0].kind,category:category||'일반 무기',matched:top[0].name};}
    const aliases=[...Object.entries(WEAPONS).map(([kind,n])=>({kind,n})),{kind:'switch-axe',n:'슬액'},{kind:'charge-blade',n:'차액'},{kind:'light-bowgun',n:'라보'},{kind:'heavy-bowgun',n:'헤보'}].sort((a,b)=>normalize(b.n).length-normalize(a.n).length);
    const alias=aliases.find(a=>a.n==='활'?/(?:^|[\s\[\]【】_-])활(?:$|[\s\[\]【】0-9_-])/.test(name):text.includes(normalize(a.n)));
    return {...(alias?{kind:alias.kind,matched:alias.n}:{}),...(category?{category}:{})};
  }
  function detectElement(name,weaponName){
    let text=String(name||'').normalize('NFKC').toLowerCase();
    // Separate known template fields, while leaving words such as 화력용 intact.
    const fields=[weaponName,...Object.values(WEAPONS),'거극아티어','아티어','슬액','차액','라보','헤보'].filter(Boolean).sort((a,b)=>normalize(b).length-normalize(a).length);
    for(const field of fields){const pattern=[...normalize(field)].map(c=>c.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('\\s*');text=text.replace(new RegExp(pattern,'gu'),' ');}
    const tokens=text.match(/[\p{L}\p{N}]+/gu)||[],found=[];
    for(const [element,aliases]of Object.entries(ELEMENT_ALIASES)){
      if(tokens.some(token=>aliases.some(alias=>token===alias||element!=='none'&&['속','속성','용','속용','속성용'].some(suffix=>token===alias+suffix))))found.push(element);
    }
    return found.length===1?{element:found[0]}:found.length>1?{elementAmbiguous:found}:{};
  }
  function detectName(name,db){const weapon=detectWeaponName(name,db);return {...weapon,...detectElement(name,weapon.matched)};}
  function bonusTypes(kind,element){return ['attack','affinity',...(!isBowgun(kind)&&element!=='none'&&!(kind==='bow'&&['poison','paralysis','sleep'].includes(element))?['element']:[]),...(isBowgun(kind)?['ammo']:kind==='bow'?[]:['sharpness'])];}
  function bonusTiers(type){return rules()?.tiers?.[type]||[];}
  function emptyConfig(kind){return {version:1,intensification:'attack',element:isBowgun(kind)?'none':'',productionAttack:3,matchingParts:3,restoration:Array.from({length:5},()=>({type:'',tier:''}))};}
  function validateTags(tags){for(const [id,n]of Object.entries(tags||{}))if(n!==1||![...rules().allowedTags.set,...rules().allowedTags.group].includes(id))throw new Error('거극 아티어에 부여되지 않는 시리즈·그룹 스킬입니다.');for(const kind of ['set','group'])if(Object.keys(tags||{}).filter(id=>rules().allowedTags[kind].includes(id)).length>1)throw new Error('시리즈·그룹 스킬은 각각 하나씩 선택하세요.');}
  function calculate(kind,config,options={}){
    const data=rules(),profile=data?.profiles?.[kind];if(!profile)throw new Error('거극 아티어 무기 종류가 잘못되었습니다.');
    if(!config||config.version!==1||!profile.intensifications[config.intensification])throw new Error('격화 종류를 선택하세요.');
    const missingElement=!Object.hasOwn(ELEMENTS,config.element);if(missingElement&&!options.allowIncomplete)throw new Error('무기의 속성을 선택하세요.');
    if(!Number.isInteger(config.productionAttack)||config.productionAttack<0||config.productionAttack>3)throw new Error('생산 보너스 조합을 확인하세요.');
    if(![2,3].includes(config.matchingParts))throw new Error('동일 속성 파츠 수를 확인하세요.');
    if(!Array.isArray(config.restoration)||config.restoration.length!==5)throw new Error('복원 보너스는 5개를 입력하세요.');
    const base=profile.intensifications[config.intensification],counts={},sums={attack:0,affinity:0,element:0,sharpness:0,ammo:0};let selected=0;
    const family=['poison','blast'].includes(config.element)?'statusHigh':['paralysis','sleep'].includes(config.element)?'statusLow':'element';
    const elementProfile=profile.elements;
    const activeElement=!missingElement&&config.element!=='none'&&!isBowgun(kind)&&!profile.noNumericElementFor.includes(config.element);
    let baseElement=activeElement?elementProfile?.[family]?.[config.intensification]:0;
    if(activeElement&&!Number.isFinite(baseElement))throw new Error('이 무기의 속성 기준 데이터를 확인할 수 없습니다.');
    const details=[];
    const inherited=config.restoration.some(b=>b&&['attack','affinity','element'].includes(b.type)&&b.tier==='I');
    if(inherited&&config.restoration.some(b=>b?.type&&b.tier!=='I'))throw new Error('계승한 I 보너스와 재추첨한 II·III·EX를 섞을 수 없습니다.');
    for(const b of config.restoration){
      if(!b||typeof b.type!=='string'||typeof b.tier!=='string')throw new Error('복원 보너스 형식이 잘못되었습니다.');
      if(!b.type){if(options.allowIncomplete)continue;throw new Error('복원 보너스 5개를 모두 선택하세요.');}
      if(!bonusTypes(kind,config.element).includes(b.type)||!bonusTiers(b.type).includes(b.tier))throw new Error('사용할 수 없는 보너스 또는 레벨입니다.');
      const key=b.type+':'+b.tier;counts[key]=(counts[key]||0)+1;
      if(!inherited&&counts[key]>(data.maxIdenticalTier??2))throw new Error(BONUS_NAMES[b.type]+' '+b.tier+'는 최대 '+(data.maxIdenticalTier??2)+'개입니다.');
      if((b.type==='sharpness'||b.type==='ammo')&&config.restoration.filter(x=>x.type===b.type).length>2)throw new Error(BONUS_NAMES[b.type]+'는 최대 2개입니다.');
      let value=b.type==='element'?profile.elementBonus[b.tier]:b.type==='sharpness'?(b.tier==='EX'?50:kind==='insect-glaive'?20:30):data.bonuses[b.type]?.[b.tier];
      if(!Number.isFinite(value))throw new Error('보너스 수치 데이터가 없습니다.');sums[b.type]+=value;details.push({...b,value});selected++;
    }
    const rawAttack=base.rawAttack+config.productionAttack*5+sums.attack;
    const affinity=base.affinity+(3-config.productionAttack)*5+sums.affinity;
    const infusion=activeElement&&config.matchingParts===3?profile.infusion3:0;
    const elementValue=activeElement?baseElement+infusion+sums.element:missingElement?null:0;
    const sharpness=base.sharpness?{...base.sharpness,red:base.sharpness.red-sums.sharpness,white:base.sharpness.white+sums.sharpness}:null;
    let phial=base.phial||null;
    if(kind==='charge-blade'&&!['fire','water','thunder','ice','dragon'].includes(config.element))phial='impact';
    if(kind==='switch-axe'&&config.element==='none')phial={kind:'dragon'};
    return {kind,name:profile.name,rawAttack,attack:Math.floor(rawAttack*profile.multiplier10/10+1e-9),affinity,defense:0,slots:[{kind:'weapon',level:3},{kind:'weapon',level:3},{kind:'weapon',level:3}],skills:{},rarity:8,element:config.element,elementValue:isBowgun(kind)?null:elementValue,specials:activeElement?[{kind:['poison','paralysis','sleep','blast'].includes(config.element)?'status':'element',element:config.element,value:elementValue}]:[],sharpness,ammoBonus:sums.ammo,shell:base.shell||null,shellPower:base.shell?'약간 강함':null,phial,complete:selected===5&&!missingElement,selected,breakdown:{baseRaw:base.rawAttack,productionRaw:config.productionAttack*5,restorationRaw:sums.attack,baseAffinity:base.affinity,productionAffinity:(3-config.productionAttack)*5,restorationAffinity:sums.affinity,baseElement,infusion,restorationElement:sums.element,details}};
  }
  const api={WEAPONS,ELEMENTS,FOCUS,SHELLS,BONUS_NAMES,normalize,detectName,isBowgun,bonusTypes,bonusTiers,emptyConfig,calculate,validateTags};
  root.GogArtian=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
