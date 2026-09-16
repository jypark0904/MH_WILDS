'use strict';
const assert=require('node:assert/strict');
const Loadout=require('../dist/result-loadout.js');
const db=require('../data/database.json');
const skill=name=>db.skills.find(s=>s.name===name).id;
const guard=skill('가드 성능'),dragon=skill('용속성 공격 강화');
const jewel=db.decorations.find(d=>d.name==='파룡-철벽주【3】');
const weapon={id:'test-gunlance',kind:'gunlance',name:'용속 건랜스',element:'dragon',skills:{},slots:[{kind:'weapon',level:3}]};
const result={weapon,armor:[],charm:{id:'none-charm',name:'호석 없음',skills:{},slots:[]},skills:{[guard]:1,[dragon]:3},rawSkills:{[guard]:1,[dragon]:3},placements:[{equipmentId:weapon.id,slotIndex:0,decorationId:jewel.id}]};
const html=Loadout.render(result,db,{targets:{[guard]:1}});
assert.ok(html.includes('파룡-철벽주【3】'));
assert.ok(html.includes('class="loadout-reason"'));
assert.ok(html.includes('추가 효과: 용속성 공격 강화 +3'));
assert.equal((html.match(/class="loadout-item"/g)||[]).length,7);
assert.ok(!Loadout.render(result,db,{targets:{[guard]:1,[dragon]:3}}).includes('class="loadout-reason"'),'Required levels are not mislabeled as additional gains');
const capped={...result,weapon:{...weapon,skills:{[dragon]:3}},rawSkills:{[guard]:1,[dragon]:6}};
assert.ok(!Loadout.render(capped,db,{targets:{[guard]:1}}).includes('class="loadout-reason"'),'Already-capped native skills do not claim additional gains');
const wrong={...result,weapon:{...weapon,element:'fire'}};
assert.ok(!Loadout.render(wrong,db,{targets:{[guard]:1}}).includes('class="loadout-reason"'),'A wrong-element effect remains visible but is not endorsed');

// Equipment order and decoration ownership must survive shuffled input and
// sparse placements: the solver index is never the index among filled slots.
const fixtureDb={
  skills:[
    {id:'native',name:'고유 <기술> & "설명"',maxLevel:3},
    {id:'set',name:'시리즈 <효과>',maxLevel:2},
    {id:'gem-skill',name:'장식 <기술>',maxLevel:5}
  ],
  decorations:[
    {id:'weapon-gem',name:'무기 구슬',skills:{'gem-skill':1}},
    {id:'head-gem',name:'머리 구슬',skills:{'gem-skill':2}},
    {id:'unsafe-gem',name:'호석 <img src=x onerror="alert(1)"> & 구슬',skills:{'gem-skill':1}}
  ]
};
const armorItem=kind=>({id:kind,kind,name:kind+' 장비',skills:{},slots:[]});
const head={...armorItem('head'),name:'머리 <script>위험</script>',skills:{native:2},tags:{set:1},slots:[{kind:'armor',level:1},{kind:'armor',level:3}]};
const charmId='charm-"<&>';
const rowResult={
  weapon:{id:'weapon',kind:'gunlance',name:'무기 장비',skills:{},slots:[{kind:'weapon',level:3},{kind:'weapon',level:1}]},
  armor:[armorItem('legs'),head,armorItem('waist'),armorItem('chest'),armorItem('arms')],
  charm:{id:charmId,name:'내 호석',skills:{native:1},slots:[{kind:'weapon',level:1},{kind:'armor',level:2}]},
  skills:{native:3,'gem-skill':4},
  placements:[
    {equipmentId:charmId,slotIndex:1,decorationId:'unsafe-gem'},
    {equipmentId:'head',slotIndex:1,decorationId:'head-gem'},
    {equipmentId:'weapon',slotIndex:0,decorationId:'weapon-gem'}
  ]
};
const rowHtml=Loadout.render(rowResult,fixtureDb);
const rows=rowHtml.match(/<article\b[^>]*>[\s\S]*?<\/article>/g)||[];
assert.deepEqual(rows.map(row=>row.match(/data-equipment-id="([^"]+)"/)[1]),['weapon','head','chest','arms','waist','legs','charm-&quot;&lt;&amp;&gt;']);
assert.equal((rowHtml.match(/class="loadout-items"/g)||[]).length,1,'All seven equipment rows belong to one list');
assert.match(rowHtml,/class="loadout-columns"[^>]*><span>장비<\/span><span>장식주<\/span>/);
for(const row of rows){
  assert.ok(row.indexOf('class="loadout-equipment"')<row.indexOf('class="loadout-decorations"'),'Equipment information precedes its decoration column');
}
const slot=(row,index)=>row.match(new RegExp('<li\\b[^>]*data-slot-index="'+index+'"[^>]*>[\\s\\S]*?<\\/li>'))?.[0];
assert.match(slot(rows[0],0),/1번 슬롯[\s\S]*무기용 · Lv 3[\s\S]*무기 구슬/,'Zero-based solver slot 0 is shown as the first weapon slot');
assert.match(slot(rows[0],1),/2번 슬롯[\s\S]*무기용 · Lv 1[\s\S]*비어 있음/);
assert.match(slot(rows[1],0),/1번 슬롯[\s\S]*방어구용 · Lv 1[\s\S]*비어 있음/);
assert.match(slot(rows[1],1),/2번 슬롯[\s\S]*방어구용 · Lv 3[\s\S]*머리 구슬/);
assert.ok(!rows[0].includes('머리 구슬')&&!rows[1].includes('무기 구슬'),'Decorations stay with their equipment IDs');
assert.match(rows[2],/class="loadout-decorations"[^>]*><p class="loadout-no-slots">슬롯 없음/);
assert.match(slot(rows[6],0),/무기용 · Lv 1[\s\S]*비어 있음/);
assert.match(slot(rows[6],1),/방어구용 · Lv 2[\s\S]*호석 &lt;img src=x onerror=&quot;alert\(1\)&quot;&gt; &amp; 구슬/);
assert.match(rows[6],/고유 &lt;기술&gt; &amp; &quot;설명&quot; Lv 1/,'The selected charm retains its native skill');
assert.match(rows[1],/시리즈 &lt;효과&gt; 1부위/);
assert.ok(rows[1].indexOf('시리즈 &lt;효과&gt;')<rows[1].indexOf('class="loadout-decorations"'),'Set contribution stays in the equipment column');
assert.match(rows[1],/머리 &lt;script&gt;위험&lt;\/script&gt;/);
assert.match(slot(rows[1],1),/장식 &lt;기술&gt; \+2/);
assert.ok(!rowHtml.includes('<script>')&&!rowHtml.includes('<img'),'Equipment, skill and decoration names cannot inject HTML');
const noCharm=Loadout.render({...rowResult,charm:null,placements:rowResult.placements.filter(p=>p.equipmentId!==charmId)},fixtureDb);
const noCharmRows=noCharm.match(/<article\b[^>]*>[\s\S]*?<\/article>/g)||[];
assert.equal(noCharmRows.length,7,'No charm still occupies the seventh equipment row');
assert.match(noCharmRows[6],/<h3>호석 없음<\/h3>/);
assert.match(noCharmRows[6],/class="loadout-decorations"[^>]*><p class="loadout-no-slots">슬롯 없음/);
assert.ok(!noCharmRows[6].includes('호석 &lt;img'),'No charm cannot inherit another item’s placements');
console.log('PASS result loadout: seven ordered equipment rows, exact slot ownership/index, empty slots/charm, escaped names, native/set skills and conditional extra-effect reasons.');
