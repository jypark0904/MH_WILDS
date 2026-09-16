'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const UI=require('../dist/improvement-ui.js');
const source=fs.readFileSync(require.resolve('../dist/app.js'),'utf8');
// Run the actual application's state transitions, with rendering and the
// asynchronous solver replaced by observations. No test-only app API is added.
function functionSource(name){
  const line=source.split(/\r?\n/).find(line=>line.startsWith('  function '+name+'('));
  assert.ok(line,'Application function exists: '+name);
  if(line.trimEnd().endsWith('}'))return line;
  const start=source.indexOf(line),end=source.indexOf('\n  }',start);
  assert.ok(end>start,'Function boundary exists: '+name);
  return source.slice(start,end+4);
}
const transitions=['stopSearch','change','improveSkill','failedImprovementHtml','restoreImprovement'].map(functionSource).join('\n');
const plain=value=>JSON.parse(JSON.stringify(value));
function harness(){
  const db={skills:[{id:'attack',name:'공격',maxLevel:5},{id:'guard',name:'가드 성능',maxLevel:3}]};
  const originalResult={id:'original-result',skills:{attack:2}};
  const context={DB:db,skillMap:new Map(db.skills.map(skill=>[skill.id,skill])),WildsImprovementUI:UI,
    state:{targets:{attack:2},selectedWeapon:'preserved-weapon',excluded:['preserved-armor']},results:[originalResult],searchStats:{nodes:123,leaves:20},elapsed:2000,searchStatus:'complete',improvementPrevious:null,
    worker:null,workerUrl:null,fallbackIterator:null,runId:0,selected:0,expandedResult:0,
    $:()=>null,reconcileReferences:state=>state,saved:[],searched:[],messages:[],renders:0};
  context.save=()=>context.saved.push(plain(context.state));
  context.render=()=>context.renders++;
  context.startSearch=()=>{context.searched.push(plain(context.state.targets));context.searchStatus='running';};
  context.toast=message=>context.messages.push(message);
  vm.createContext(context);vm.runInContext(transitions,context);
  return context;
}
const app=harness(),initial=plain({targets:app.state.targets,results:app.results,stats:app.searchStats,elapsed:app.elapsed});
app.improveSkill('attack',5);
assert.deepEqual(app.searched,[{attack:5}],'direct level 5 is searched without stepping through levels 3 and 4');
assert.deepEqual(plain(app.improvementPrevious.targets),initial.targets);
assert.deepEqual(plain(app.improvementPrevious.results),initial.results);
assert.equal(app.improvementPrevious.skillId,'attack');
assert.equal(app.state.selectedWeapon,'preserved-weapon');assert.deepEqual(app.state.excluded,['preserved-armor']);
app.searchStatus='complete';app.results=[];app.searchStats={nodes:999};app.elapsed=4000;
assert.ok(app.failedImprovementHtml().includes('min="2" max="5" step="1" value="5"'));
const previous=app.improvementPrevious;
app.improveSkill('attack',4,true);
assert.equal(app.improvementPrevious,previous,'first retry keeps the original return snapshot');
assert.deepEqual(app.searched.at(-1),{attack:4});
app.searchStatus='complete';app.results=[];
app.improveSkill('attack',3,true);
assert.equal(app.improvementPrevious,previous,'successive retries never overwrite the original return snapshot');
assert.deepEqual(app.searched.at(-1),{attack:3});
app.results=[{id:'retry-result'}];app.searchStatus='limit';app.searchStats={nodes:9999};app.elapsed=9000;
app.restoreImprovement();
assert.deepEqual(plain({targets:app.state.targets,results:app.results,stats:app.searchStats,elapsed:app.elapsed}),initial,'return restores both original targets and original results/statistics');
assert.equal(app.searchStatus,'complete');assert.equal(app.improvementPrevious,null);
assert.deepEqual(app.saved.at(-1).targets,initial.targets,'restored targets are persisted');

const added=harness();added.improveSkill('guard',3);added.searchStatus='complete';added.results=[];
assert.ok(added.failedImprovementHtml().includes('min="1" max="3" step="1" value="3"'));
added.improveSkill('guard',1,true);
assert.deepEqual(added.searched.at(-1),{attack:2,guard:1},'retry adjusts only the proposed new skill');
added.restoreImprovement();assert.deepEqual(plain(added.state.targets),{attack:2},'return removes an added proposal without changing prior goals');
const invalid=harness();
for(const [id,level]of [['attack',1],['attack',2],['attack',6],['attack',3.5],['unknown',3]])invalid.improveSkill(id,level);
assert.equal(invalid.searched.length,0);assert.equal(invalid.improvementPrevious,null);
invalid.improveSkill('attack',5);const count=invalid.searched.length;
invalid.improveSkill('attack',1,true);assert.equal(invalid.searched.length,count,'retry does not lower a retained original target');
console.log('PASS improvement app flow: direct search, retained conditions, repeated failed retries, snapshot restoration, persisted return and level bounds');
