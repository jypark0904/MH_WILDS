'use strict';
const assert=require('node:assert/strict');require('../dist/data.js');const db=globalThis.WILDS_DB,C=require('../dist/skill-chat.js');const id=n=>db.skills.find(s=>s.name===n)?.id;
for(const text of ['도전자 5, 약점 특효 3','도전자5 약점특효3','도전자 Lv.5\n약점 특효 레벨3'])assert.deepEqual(C.parse(db,text).targets,{[id('도전자')]:5,[id('약점 특효')]:3},text);
assert.deepEqual(C.parse(db,'약특 3').targets,{[id('약점 특효')]:3});
assert.equal(C.parse(db,'도전자').targets[id('도전자')],1);
assert.equal(C.parse(db,'도전자5 도전자3').targets[id('도전자')],3);
assert.ok(C.parse(db,'도전자 99').error);assert.ok(C.parse(db,'도전자0').error);
assert.deepEqual(C.parse(db,'도전자 3 없는스킬').targets,{},'invalid multi-skill message is atomic');
assert.equal(C.suggestions(db,'도전5').items[0].skill.id,id('도전자'));assert.equal(C.suggestions(db,'도전5').items[0].level,5);
assert.deepEqual(C.suggestions(db,'공격3, 도전').prefix,[[id('공격'),3]]);
assert.ok(C.suggestions(db,'회피').items.length>1);

// A partial long name must remain one query, even when its beginning is the
// complete name of another skill (공격 / 공격적인 방어, 연격 / 연격 강화).
for(const text of ['공격적인 방','공격적인방','공격적인 방어']){
  const result=C.suggestions(db,text);
  assert.deepEqual(result.prefix,[],text+' must not silently commit 공격');
  assert.equal(result.items[0].skill.id,id('공격적인 방어'),text);
  assert.ok(!result.items.some(item=>item.skill.id===id('공격')),text);
}
const offensiveLevel=C.suggestions(db,'공격적인 방3');
assert.deepEqual(offensiveLevel.prefix,[]);
assert.equal(offensiveLevel.items[0].skill.id,id('공격적인 방어'));
assert.equal(offensiveLevel.items[0].level,3);

for(const text of ['연격 강','연격 강화','연격강화']){
  const result=C.suggestions(db,text);
  assert.deepEqual(result.prefix,[],text+' must not silently commit 연격');
  assert.deepEqual(result.items.map(item=>item.skill.id),[id('흉조룡의 힘')],text+' searches the full set-bonus rank alias');
}
const burstBoostLevel=C.suggestions(db,'연격강화2');
assert.deepEqual(burstBoostLevel.prefix,[]);
assert.equal(burstBoostLevel.items[0].skill.id,id('흉조룡의 힘'));
assert.equal(burstBoostLevel.items[0].level,2);

for(const text of ['물속성 공격 강','물속성공격강']){
  const result=C.suggestions(db,text);
  assert.deepEqual(result.prefix,[]);
  assert.equal(result.items[0].skill.id,id('물속성 공격 강화'));
}
const criticalMatches=C.suggestions(db,'회심격');
assert.deepEqual(criticalMatches.prefix,[]);
assert.deepEqual(new Set(criticalMatches.items.map(item=>item.skill.id)),new Set([id('회심격【속성】'),id('회심격【특수】')]),'both distinct critical skills remain selectable');

// Only explicit completed levels or separators establish a preceding input.
for(const text of ['공격3도전','공격3 도전','공격3, 도전']){
  const result=C.suggestions(db,text);
  assert.deepEqual(result.prefix,[[id('공격'),3]],text);
  assert.equal(result.items[0].skill.id,id('도전자'));
}
for(const text of ['도전자5공격적인방','도전자5 공격적인 방','도전자5, 공격적인방']){
  const result=C.suggestions(db,text);
  assert.deepEqual(result.prefix,[[id('도전자'),5]],text+' must not include an extra 공격1');
  assert.equal(result.items[0].skill.id,id('공격적인 방어'));
}

// Complete multi-skill messages still support deliberate bulk entry.
assert.deepEqual(C.parse(db,'도전자5공격적인방어3').targets,{[id('도전자')]:5,[id('공격적인 방어')]:3});
assert.deepEqual(C.parse(db,'연격 강화Ⅱ').targets,{[id('흉조룡의 힘')]:2});

// Exercise the real selection callbacks. Pure suggestions tests cannot catch a
// regression where choose() silently appends its parsed prefix to the payload.
function selectionPayload(text,{clickName,keys=[],existing={}}={}){
  const payloads=[],input={value:text,setAttribute(){},removeAttribute(){},focus(){}},status={},send={};
  const box={hidden:true,children:[],querySelectorAll(){return this.children;},set innerHTML(html){
    this.children=[...html.matchAll(/data-index="(\d+)"/g)].map(match=>({dataset:{index:match[1]},setAttribute(){},scrollIntoView(){}}));
  }};
  const originalDocument=global.document,previous=JSON.stringify(existing);
  global.document={querySelector:selector=>({'#skill-message':input,'#skill-suggestions':box,'#skill-chat-reply':status,'#send-skills':send}[selector])};
  try{
    C.mount({db,getTargets:()=>existing,onApply:targets=>payloads.push(targets)});
    input.oninput({isComposing:false});
    if(clickName){
      const index=C.suggestions(db,text).items.findIndex(item=>item.skill.id===id(clickName));
      assert.ok(index>=0,'Expected selectable '+clickName);box.children[index].onclick();
    }
    for(const key of keys)input.onkeydown({key,preventDefault(){}});
    assert.equal(JSON.stringify(existing),previous,'selecting must not mutate current targets');
    return payloads;
  }finally{
    if(originalDocument===undefined)delete global.document;else global.document=originalDocument;
  }
}
assert.deepEqual(selectionPayload('도전자5 공격적인방',{clickName:'공격적인 방어'}),[{[id('공격적인 방어')]:1}],'click adds only the selected item, not completed or accidental prefixes');
assert.deepEqual(selectionPayload('공격적인 방',{keys:['Enter']}),[{[id('공격적인 방어')]:1}],'single-suggestion Enter adds only that suggestion');
assert.deepEqual(selectionPayload('공격3, 회심격',{clickName:'회심격【특수】'}),[{[id('회심격【특수】')]:1}],'clicking one of several matches excludes all other matches and prefix');
assert.deepEqual(selectionPayload('공격3, 회심격',{keys:['ArrowDown','Enter']}),[{[id('회심격【속성】')]:1}],'keyboard selection follows the same single-item contract');
assert.deepEqual(selectionPayload('연격 강화',{clickName:'흉조룡의 힘',existing:Object.freeze({[id('연격')]:5})}),[{[id('흉조룡의 힘')]:1}],'rank-alias selection must not re-add or lower the existing 연격 level');
assert.deepEqual(selectionPayload('도전자5 약점특효3',{keys:['Enter']}),[{[id('도전자')]:5,[id('약점 특효')]:3}],'unselected complete message Enter preserves deliberate bulk entry');
console.log('PASS skill messages: multiple skills, full-name partial searches, rank aliases, distinct matches, explicit prefix boundaries, click/keyboard single-item payloads and deliberate bulk entry');
