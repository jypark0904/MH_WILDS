'use strict';
const assert=require('node:assert/strict');
const UI=require('../dist/improvement-ui.js');
const db={skills:[{id:'attack',name:'공격',description:'플레이어의 공격력을 올린다.',maxLevel:5},{id:'guard',name:'가드 성능',description:'가드 시 받는 충격을 줄인다.',maxLevel:3}]};
const html=UI.html(db,{upgrades:[{id:'attack',currentLevel:2,level:3}],additional:[{id:'guard',currentLevel:0,level:2,reason:'삭제할 무기 종류 안내'}]});
assert.ok(html.includes('min="3" max="5"'),'upgrade cannot drop an existing target');
assert.ok(html.includes('min="1" max="3"'),'additional skill allows every valid level');
assert.ok(!html.includes('<details'),'suggestions are visible by default');
assert.ok(html.includes(db.skills[0].description));
assert.ok(!html.includes('삭제할 무기 종류 안내')&&!html.includes('이 조건으로 검색'));
assert.equal(UI.html(db,{upgrades:[{id:'missing'}],additional:[]}), '');
assert.equal(UI.failedHtml(db,{id:'missing',level:5}), '');
assert.ok(UI.failedHtml(db,{id:'attack',level:5,minLevel:2}).includes('min="2" max="5"'));
assert.deepEqual(UI.levelState(4,2,5,5),{level:4,valid:true,lowered:true,negative:false});
assert.equal(UI.levelState(5,2,5,5).negative,true);
for(const value of ['',null,'bad',1,6,3.5])assert.equal(UI.levelState(value,2,5,5).valid,false,String(value));

function harness({retry=false,min=1,max=5,value=5,failedLevel}={}){
  const submitted=[],classes=new Set(),input={value:String(value),min:String(min),max:String(max),setAttribute(name,value){this[name]=value;}},submit={},status={};
  const steps=[-1,1].map(step=>({dataset:{step:String(step)}}));
  const card={dataset:{improvementId:'attack',retry:String(retry),...(failedLevel==null?{}:{failedLevel:String(failedLevel)})},classList:{toggle(name,enabled){enabled?classes.add(name):classes.delete(name);}},querySelector(selector){return {'.improvement-level':input,'.improvement-submit':submit,'.improvement-level-status':status}[selector];},querySelectorAll(){return steps;}};
  UI.mount({container:{querySelectorAll(){return [card];}},onSearch(...args){submitted.push(args);}});
  return {submitted,classes,input,submit,status,steps};
}
const direct=harness({min:2,value:3});
direct.input.value='5';direct.input.oninput();direct.submit.onclick();
assert.deepEqual(direct.submitted,[['attack',5,{retry:false}]],'search uses the selected level rather than the original +1 proposal');
assert.equal(direct.steps[1].disabled,true,'max level disables increment');
direct.input.value='2';direct.input.onchange();assert.equal(direct.steps[0].disabled,true);
direct.steps[1].onclick();assert.equal(direct.input.value,'3','plus button raises exactly one level');
direct.steps[0].onclick();assert.equal(direct.input.value,'2','minus button lowers exactly one level');
for(const value of ['99','2.5','']){
  direct.input.value=value;direct.input.oninput();assert.equal(direct.submit.disabled,true);direct.submit.onclick();
}
assert.equal(direct.submitted.length,1,'invalid values never begin a search');
direct.input.value='4';direct.input.onkeydown({key:'Enter',preventDefault(){}});
assert.deepEqual(direct.submitted.at(-1),['attack',4,{retry:false}],'Enter uses the edited numeric value');

const retry=harness({retry:true,min:2,value:5,failedLevel:5});
assert.ok(retry.classes.has('is-failed'));assert.equal(retry.status.textContent,'Lv 5 · 조합 미발견');
retry.steps[0].onclick();
assert.ok(retry.classes.has('is-lowered')&&!retry.classes.has('is-failed'),'lowering the failed level turns the control positive');
assert.equal(retry.status.textContent,'Lv 4 · 낮춘 조건','positive styling does not promise a valid result');
retry.submit.onclick();assert.deepEqual(retry.submitted,[['attack',4,{retry:true}]]);
retry.steps[1].onclick();assert.ok(retry.classes.has('is-failed')&&!retry.classes.has('is-lowered'));
console.log('PASS improvement controls: direct levels, +/- bounds, invalid input, Enter, retry payload and honest negative/positive feedback');
