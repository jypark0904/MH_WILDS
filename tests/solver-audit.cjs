#!/usr/bin/env node
'use strict';

/*
 * Offline, dependency-free audit for the Wilds solver.
 * Does not modify the supplied workspace.
 *
 * Usage:
 *   node solver-audit.cjs "C:\\Users\\sodaj\\Desktop\\게임\\MHW"
 *   node solver-audit.cjs /path/to/workspace --cases 1000 --real-data
 *
 * If omitted, the workspace defaults to WILDS_WORKSPACE or process.cwd().
 * The randomized oracle independently enumerates gear and physical slots;
 * it deliberately does not use solver totals, pruning, or slot aggregation.
 */

const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const args = process.argv.slice(2);
const workspace = path.resolve(
  (args[0] && !args[0].startsWith('--') ? args.shift() : null)
  || process.env.WILDS_WORKSPACE || process.cwd()
);
const countIndex = args.indexOf('--cases');
const caseCount = countIndex < 0 ? 300 : Number(args[countIndex + 1]);
assert(Number.isInteger(caseCount) && caseCount > 0, '--cases must be a positive integer');
const engine = require(path.join(workspace, 'dist', 'solver.js'));
const PARTS = ['head', 'chest', 'arms', 'waist', 'legs'];

function armor(kind, extra = {}) {
  return {
    id: kind, kind, rank: 'high', rarity: 1,
    skills: {}, tags: {}, slots: [], defense: 10, ...extra,
  };
}

function deco(id, skills, kind = 'armor', level = 1) {
  return { id, skills, kind, level };
}

function fixture(changes = {}, decorations = [], bonuses = []) {
  return {
    skills: [
      { id: 'A', maxLevel: 5 },
      { id: 'B', maxLevel: 5 },
      { id: 'S', maxLevel: 2 },
      { id: 'Q', maxLevel: 2 },
    ],
    armor: PARTS.map(part => armor(part, changes[part])),
    decorations,
    bonuses,
  };
}

function collect(db, input) {
  const results = [];
  for (const event of engine.search(db, input)) {
    if (event.type !== 'result') continue;
    const check = engine.validateResult(db, input, event.result);
    assert.equal(check.valid, true, 'Solver emitted invalid result: ' + check.errors.join(', '));
    results.push(event.result);
  }
  return results;
}

let regressions = 0;
function regression(name, db, input, expectedFeasible, inspect) {
  const results = collect(db, input);
  assert.equal(results.length > 0, expectedFeasible, name);
  if (inspect) inspect(results);
  regressions++;
  console.log('PASS ' + name);
}

regression('weapon/armor slot kind mismatch',
  fixture({ head: { slots: [{ kind: 'armor', level: 3 }] } }, [deco('d', { A: 1 }, 'weapon')]),
  { targets: { A: 1 } }, false);

regression('use the small slot and preserve the large slot',
  fixture({ head: { slots: [{ kind: 'armor', level: 1 }, { kind: 'armor', level: 3 }] } },
    [deco('a', { A: 1 }), deco('b', { B: 1 }, 'armor', 3)]),
  { targets: { A: 1, B: 1 } }, true);

regression('compound decoration satisfies two targets in one slot',
  fixture({ head: { slots: [{ kind: 'armor', level: 2 }] } }, [deco('ab', { A: 1, B: 1 }, 'armor', 2)]),
  { targets: { A: 1, B: 1 } }, true,
  results => assert.equal(results[0].placements.length, 1));

// Keep the unnecessary compound first in DB order to reproduce the reported
// gunlance/Guard case: a level-3 weapon slot can also take a simple level-1 jewel.
const plainDecorationDB=fixture({},[
  {...deco('compound',{A:1,B:3},'weapon',3),rarity:7},
  {...deco('plain',{A:1},'weapon',1),rarity:4},
]);
const threeSlotWeapon=armor('weapon',{id:'w',slots:[{kind:'weapon',level:3}],defense:0});
regression('prefer a simple low-level jewel over an unneeded compound in the same physical slot',
  plainDecorationDB,{targets:{A:1},weapon:threeSlotWeapon},true,
  results=>{
    assert.equal(results[0].placements.length,1);
    assert.equal(results[0].placements[0].decorationId,'plain');
    assert.equal(results[0].placements[0].equipmentId,'w');
    assert.equal(results[0].placements[0].slotIndex,0);
    assert.equal(results[0].placements[0].level,3,'Physical slot size remains 3 even for the level-1 jewel');
    assert.equal(results[0].skills.B||0,0,'Do not add an unrelated weapon skill just because its jewel came first');
  });
regression('retain the compound jewel when both of its skills are required',
  plainDecorationDB,{targets:{A:1,B:3},weapon:threeSlotWeapon},true,
  results=>{
    assert.equal(results[0].placements.length,1);
    assert.equal(results[0].placements[0].decorationId,'compound');
    assert.equal(results[0].skills.A,1);
    assert.equal(results[0].skills.B,3);
  });
regression('allow the compound jewel when no simple jewel is owned',
  plainDecorationDB,{targets:{A:1},weapon:threeSlotWeapon,inventoryMode:'owned',decorationCounts:{compound:1,plain:0}},true,
  results=>assert.equal(results[0].placements[0].decorationId,'compound'));
regression('fill the shortage with a compound after using the one owned simple jewel',
  plainDecorationDB,{
    targets:{A:2},
    weapon:{...threeSlotWeapon,slots:[{kind:'weapon',level:3},{kind:'weapon',level:3}]},
    inventoryMode:'owned',decorationCounts:{compound:1,plain:1},
  },true,
  results=>{
    assert.equal(results[0].placements.length,2);
    assert.deepEqual(results[0].placements.map(p=>p.decorationId),['plain','compound']);
    assert.deepEqual(results[0].placements.map(p=>p.slotIndex),[0,1]);
    assert.equal(results[0].skills.A,2);
  });

regression('owned inventory is shared across all slots',
  fixture({ head: { slots: [{ kind: 'armor', level: 1 }, { kind: 'armor', level: 1 }] } }, [deco('a', { A: 1 })]),
  { targets: { A: 2 }, inventoryMode: 'owned', decorationCounts: { a: 1 } }, false);

regression('branch beyond the locally strongest decoration',
  fixture({ head: { slots: [{ kind: 'armor', level: 1 }, { kind: 'armor', level: 1 }] } },
    [deco('a', { A: 2 }), deco('ab', { A: 1, B: 1 })]),
  { targets: { A: 2, B: 2 } }, true,
  results => assert(results[0].placements.every(p => p.decorationId === 'ab')));

regression('independent skill upper bounds cannot prove joint feasibility',
  fixture({ head: { slots: [{ kind: 'armor', level: 1 }] } },
    [deco('a', { A: 2 }), deco('b', { B: 2 })]),
  { targets: { A: 1, B: 1 } }, false);

const setBonus = { id: 'S', ranks: [{ pieces: 2, level: 1 }, { pieces: 4, level: 2 }] };

regression('four pieces grant the highest set stage once',
  fixture(Object.fromEntries(PARTS.slice(0, 4).map(part => [part, { tags: { S: 1 } }])), [], [setBonus]),
  { targets: { S: 2 } }, true,
  results => assert.equal(results[0].rawSkills.S, 2));

regression('custom weapon skills and set contributions are counted once',
  fixture({ head: { tags: { S: 1 } }, chest: { tags: { S: 1 } }, arms: { tags: { S: 1 } } }, [], [setBonus]),
  {
    targets: { A: 2, S: 2 },
    weapon: armor('weapon', {
      id: 'custom-w', skills: { A: 2 }, tags: { S: 1 }, slots: [{ kind: 'weapon', level: 3 }],
    }),
  }, true,
  results => {
    assert.equal(results[0].rawSkills.A, 2);
    assert.equal(results[0].tags.S, 4);
  });

regression('excluded armor cannot satisfy a target',
  fixture({ head: { skills: { A: 2 } } }),
  { targets: { A: 2 }, excluded: ['head'] }, false);

regression('owned custom charm contributes its skills',
  fixture(), { targets: { A: 2 }, charms: [armor('charm', { id: 'custom-c', skills: { A: 2 } })] }, true);

const charmComparisonDB = fixture({ head: { skills: { A: 1 }, slots: [{ kind: 'armor', level: 1 }] }, chest: { skills: { B: 1 } } }, [deco('a', { A: 1 })]);
charmComparisonDB.armor.push(armor('head', { id: 'second-head', skills: { A: 1 }, slots: [{ kind: 'armor', level: 1 }], defense: 9 }));
const charmComparisonInput = {
  targets: { A: 2, B: 1 },
  inventoryMode: 'owned', decorationCounts: { a: 1 },
  charms: [
    armor('charm', { id: 'none-charm', skills: {}, slots: [], defense: 0 }),
    armor('charm', { id: 'owned-charm', skills: { A: 1 }, slots: [{ kind: 'weapon', level: 1 }], defense: 0 }),
  ],
};
regression('early results interleave no-charm and owned-charm combinations',
  charmComparisonDB, charmComparisonInput, true,
  results => {
    assert.equal(results.length, 4);
    assert.deepEqual(results.slice(0, 2).map(result => result.charm.id), ['none-charm', 'owned-charm']);
    assert.deepEqual(results.map(result => result.charm.id), ['none-charm', 'owned-charm', 'none-charm', 'owned-charm']);
    assert.equal(results[0].placements.length, 1, 'No-charm result needs the owned armor decoration');
    assert.equal(results[0].placements[0].equipmentId, 'head');
    assert.equal(results[0].placements[0].slotIndex, 0);
    assert.equal(results[1].placements.length, 0, 'Owned charm satisfies the same targets without decorations');
    assert.equal(results[1].remainingSlots.length, 2);
    assert.equal(results[1].skills.A, 2);
    assert.equal(results[1].skills.B, 1);
  });

const charmAwareArmorDB=fixture({head:{skills:{A:1}}},[deco('a',{A:1},'armor',3)]);
charmAwareArmorDB.armor.push(armor('head',{id:'slot-head',slots:[{kind:'armor',level:3}]}));
regression('armor priority uses the remaining demand after weapon and charm skills',
  charmAwareArmorDB, {
    targets:{A:2},
    weapon:armor('weapon',{id:'w',skills:{A:1},defense:0}),
    charms:[armor('charm',{id:'none-charm',defense:0}),armor('charm',{id:'owned-charm',skills:{A:1},defense:0})],
  }, true,
  results=>{
    assert.equal(results.length,4,'Priority changes must preserve all feasible combinations');
    const firstNone=results.find(result=>result.charm.id==='none-charm');
    const firstOwned=results.find(result=>result.charm.id==='owned-charm');
    assert.equal(firstNone.armor[0].id,'head','No charm initially needs the native armor skill');
    assert.equal(firstOwned.armor[0].id,'slot-head','The charm frees the armor choice for a larger slot');
    assert.equal(firstNone.remainingSlots.length,0);
    assert.equal(firstOwned.remainingSlots.length,1);
    assert.equal(firstOwned.remainingSlots[0].level,3);
    assert.equal(firstOwned.placements.length,0);
    assert.equal(firstOwned.skills.A,2);
  });

const charmAwareSeriesDB=fixture({head:{tags:{S:1}}},[],[setBonus]);
charmAwareSeriesDB.armor.push(armor('head',{id:'slot-head',slots:[{kind:'armor',level:3}]}));
regression('completed weapon and charm series contributions free the armor priority',
  charmAwareSeriesDB, {
    targets:{S:1},
    weapon:armor('weapon',{id:'w',tags:{S:1},defense:0}),
    charms:[armor('charm',{id:'none-charm',defense:0}),armor('charm',{id:'owned-charm',tags:{S:1},defense:0})],
  }, true,
  results=>{
    assert.equal(results.length,3);
    const firstNone=results.find(result=>result.charm.id==='none-charm');
    const firstOwned=results.find(result=>result.charm.id==='owned-charm');
    assert.equal(firstNone.armor[0].id,'head');
    assert.equal(firstOwned.armor[0].id,'slot-head');
    assert.equal(firstOwned.tags.S,2);
    assert.equal(firstOwned.skills.S,1);
    assert.equal(firstOwned.remainingSlots[0].level,3);
  });

{
  // Every no-charm branch passes each skill's independent upper bound, but its
  // one physical slot cannot fit both decorations. It must yield before an
  // exhaustive 5^5 armor walk can delay the feasible owned-charm result.
  const db = fixture({}, [deco('a', { A: 1 }), deco('b', { B: 1 })]);
  db.armor = PARTS.flatMap(part => Array.from({ length: 5 }, (_, i) => armor(part, {
    id: part + i, slots: part === 'head' ? [{ kind: 'armor', level: 1 }] : [],
  })));
  const input = { targets: { A: 1, B: 1 }, charms: [
    armor('charm', { id: 'none-charm', defense: 0 }),
    armor('charm', { id: 'owned-charm', skills: { B: 1 }, defense: 0 }),
  ] };
  const iterator = engine.search(db, input);
  const progress = iterator.next().value;
  assert.equal(progress.type, 'progress');
  assert.equal(progress.stats.nodes, 2048);
  const found = iterator.next().value;
  assert.equal(found.type, 'result', 'A progress yield must give the next charm a search turn');
  assert.equal(found.result.charm.id, 'owned-charm');
  assert.equal(found.result.placements.length, 1);
  assert.equal(found.result.placements[0].decorationId, 'a');
  assert(found.stats.nodes > progress.stats.nodes);
  assert.equal(engine.validateResult(db, input, found.result).valid, true);
  iterator.return();
  regressions++;
  console.log('PASS an infeasible charm yields progress without starving the next charm');
}

regression('one piece may contribute to two independent series',
  fixture({ head: { tags: { S: 1, Q: 1 } }, chest: { tags: { S: 1, Q: 1 } } }, [], [
    setBonus,
    { id: 'Q', ranks: [{ pieces: 2, level: 1 }, { pieces: 4, level: 2 }] },
  ]),
  { targets: { S: 1, Q: 1 } }, true,
  results => {
    assert.equal(results[0].tags.S, 2);
    assert.equal(results[0].tags.Q, 2);
  });

const linkedDB = fixture();
linkedDB.armor = PARTS.flatMap(part => [
  armor(part, { id: part + '0', skills: { A: 1 }, linkedSet: 'linked-outfit' }),
  armor(part, { id: part + '1', skills: { A: 1 } }),
]);
regression('linked outfit parts cannot mix with ordinary armor',
  linkedDB, { targets: { A: 1 } }, true,
  results => assert.equal(results.length, 2, 'Only all linked or all ordinary is legal'));

{
  const messages = [];
  const context = {
    postMessage: message => messages.push(structuredClone(message)),
    Date,
  };
  vm.createContext(context);
  vm.runInContext(engine.workerSource, context);
  context.onmessage({ data: {
    type: 'start', db: linkedDB, input: { targets: { A: 1 } }, limit: 1, maxMs: 1000,
  } });
  assert.equal(messages.at(-1).status, 'limit');
  assert.equal(messages.at(-1).results.length, 1);
  context.onmessage({ data: { type: 'continue', limit: 5, maxMs: 1000 } });
  assert.equal(messages.at(-1).status, 'complete');
  assert.equal(messages.at(-1).results.length, 2);
  regressions++;
  console.log('PASS worker continuation preserves search and distinguishes completion');
}

{
  const messages = [];
  const context = { postMessage: message => messages.push(structuredClone(message)), Date };
  vm.createContext(context);
  vm.runInContext(engine.workerSource, context);
  context.onmessage({ data: { type: 'start', db: charmComparisonDB, input: charmComparisonInput, limit: 1, maxMs: 1000 } });
  assert.equal(messages.at(-1).status, 'limit');
  assert.deepEqual(messages.at(-1).results.map(result => result.charm.id), ['none-charm']);
  const before = messages.at(-1).stats.nodes;
  context.onmessage({ data: { type: 'continue', limit: 1, maxMs: 1000 } });
  assert.equal(messages.at(-1).status, 'limit');
  assert.deepEqual(messages.at(-1).results.map(result => result.charm.id), ['none-charm', 'owned-charm']);
  assert(messages.at(-1).stats.nodes > before, 'Shared counters continue increasing across charm turns');
  context.onmessage({ data: { type: 'continue', limit: 20, maxMs: 1000 } });
  const done = messages.at(-1);
  assert.equal(done.status, 'complete');
  assert.deepEqual(done.results.map(result => result.charm.id), ['none-charm', 'owned-charm', 'none-charm', 'owned-charm']);
  done.results.forEach(result => assert.equal(engine.validateResult(charmComparisonDB, charmComparisonInput, result).valid, true));
  regressions++;
  console.log('PASS worker continuation resumes the next charm and preserves every combination');
}

// Real Wilds skill and jewel IDs exercise contextual preferences independently
// of the synthetic A/B feasibility fixtures above.
const preferenceSource=require(path.join(workspace,'data','database.json'));
const realSkill=name=>{
  const skill=preferenceSource.skills.find(s=>s.name===name);
  assert.ok(skill,'Missing real skill: '+name);return skill.id;
};
const realJewel=name=>{
  const jewel=preferenceSource.decorations.find(d=>d.name===name);
  assert.ok(jewel,'Missing real jewel: '+name);return jewel;
};
const guardId=realSkill('가드 성능'),dragonId=realSkill('용속성 공격 강화'),fireId=realSkill('불속성 공격 강화'),rangedId=realSkill('포스샷');
const dragonGuard=realJewel('파룡-철벽주【3】'),fireGuard=realJewel('화염-철벽주【3】'),rangedGuard=realJewel('적탄-철벽주【3】'),plainGuard=realJewel('철벽주【1】');
const contextualDB={skills:preferenceSource.skills,armor:fixture().armor,decorations:preferenceSource.decorations,bonuses:preferenceSource.bonuses};
const narrowContextDB={...contextualDB,decorations:[rangedGuard,fireGuard,dragonGuard,plainGuard]};
const elementalWeapon=element=>armor('gunlance',{id:'context-weapon',name:'개인 거극 아티어 건랜스',gogConfig:{element},slots:[{kind:'weapon',level:3}],defense:0});

regression('a dragon gunlance prefers the real Dragon/Guard jewel in a level-3 slot',
  contextualDB,{targets:{[guardId]:1},weapon:elementalWeapon('dragon')},true,
  results=>{
    assert.equal(results[0].placements[0].decorationId,dragonGuard.id);
    assert.equal(results[0].skills[dragonId],3);
    assert.equal(results[0].skills[guardId],1);
    assert.equal(results[0].skills[rangedId]||0,0);
  });
regression('a fire gunlance prefers the matching real Fire/Guard jewel',
  contextualDB,{targets:{[guardId]:1},weapon:elementalWeapon('fire')},true,
  results=>{
    assert.equal(results[0].placements[0].decorationId,fireGuard.id);
    assert.equal(results[0].skills[fireId],3);
    assert.equal(results[0].skills[dragonId]||0,0);
  });
regression('consuming the smaller physical slot remains ahead of incidental elemental skills',
  narrowContextDB,{targets:{[guardId]:1},weapon:{...elementalWeapon('dragon'),slots:[{kind:'weapon',level:1},{kind:'weapon',level:3}]}},true,
  results=>{
    assert.equal(results[0].placements[0].decorationId,plainGuard.id);
    assert.equal(results[0].placements[0].slotIndex,0);
    assert.equal(results[0].remainingSlots[0].level,3);
  });
regression('a known elementless weapon does not favor unmatched elements or a ranged skill',
  narrowContextDB,{targets:{[guardId]:1},weapon:elementalWeapon('none')},true,
  results=>assert.equal(results[0].placements[0].decorationId,plainGuard.id));
regression('an unknown weapon preserves the smaller plain jewel preference',
  narrowContextDB,{targets:{[guardId]:1},weapon:threeSlotWeapon},true,
  results=>assert.equal(results[0].placements[0].decorationId,plainGuard.id));
regression('matching elemental bonuses already at their cap do not outrank a plain jewel',
  narrowContextDB,{targets:{[guardId]:1},weapon:{...elementalWeapon('dragon'),skills:{[dragonId]:3}}},true,
  results=>assert.equal(results[0].placements[0].decorationId,plainGuard.id));
regression('decoration recursion stops rewarding elemental levels after the first jewel reaches the cap',
  narrowContextDB,{targets:{[guardId]:2},weapon:{...elementalWeapon('dragon'),slots:[{kind:'weapon',level:3},{kind:'weapon',level:3}]}},true,
  results=>{
    assert.deepEqual(results[0].placements.map(p=>p.decorationId),[dragonGuard.id,plainGuard.id]);
    assert.equal(results[0].rawSkills[dragonId],3);
  });
regression('owned-only restrictions remain valid when the preferred elemental jewel is unavailable',
  narrowContextDB,{targets:{[guardId]:1},weapon:elementalWeapon('dragon'),inventoryMode:'owned',decorationCounts:{[rangedGuard.id]:1}},true,
  results=>assert.equal(results[0].placements[0].decorationId,rangedGuard.id));
regression('owned quantities are consumed exactly while mixing preferred and plain jewels',
  narrowContextDB,{targets:{[guardId]:2},weapon:{...elementalWeapon('dragon'),slots:[{kind:'weapon',level:3},{kind:'weapon',level:3}]},inventoryMode:'owned',decorationCounts:{[dragonGuard.id]:1,[plainGuard.id]:1}},true,
  results=>assert.deepEqual(results[0].placements.map(p=>p.decorationId),[dragonGuard.id,plainGuard.id]));
regression('an explicitly requested ranged skill is still satisfiable on a gunlance',
  narrowContextDB,{targets:{[guardId]:1,[rangedId]:3},weapon:elementalWeapon('dragon')},true,
  results=>{
    assert.equal(results[0].placements[0].decorationId,rangedGuard.id);
    assert.equal(results[0].skills[rangedId],3);
  });
regression('compound coverage of two explicit targets remains the first preference',
  contextualDB,{targets:{[guardId]:1,[dragonId]:3},weapon:elementalWeapon('dragon')},true,
  results=>{
    assert.equal(results[0].placements.length,1);
    assert.equal(results[0].placements[0].decorationId,dragonGuard.id);
  });

const capCacheDB={...narrowContextDB,armor:[...narrowContextDB.armor,armor('head',{id:'head-capped',skills:{[dragonId]:3}})]};
const capCacheInput={targets:{[guardId]:1},weapon:elementalWeapon('dragon')};
regression('decoration cache distinguishes equal deficits with different native elemental headroom',
  capCacheDB,capCacheInput,true,
  results=>{
    assert.equal(results.length,2);
    const uncapped=results.find(r=>r.armor[0].id==='head'),capped=results.find(r=>r.armor[0].id==='head-capped');
    assert.equal(uncapped.placements[0].decorationId,dragonGuard.id);
    assert.equal(capped.placements[0].decorationId,plainGuard.id);
    assert.equal(capped.rawSkills[dragonId],3);
  });
{
  const messages=[],context={postMessage:message=>messages.push(structuredClone(message)),Date};
  vm.createContext(context);vm.runInContext(engine.workerSource,context);
  context.onmessage({data:{type:'start',db:capCacheDB,input:capCacheInput,limit:1,maxMs:1000}});
  assert.equal(messages.at(-1).status,'limit');
  context.onmessage({data:{type:'continue',limit:5,maxMs:1000}});
  const done=messages.at(-1);
  assert.equal(done.status,'complete');
  assert.deepEqual(done.results.map(r=>r.placements),collect(capCacheDB,capCacheInput).map(r=>r.placements));
  assert.deepEqual(done.results.map(r=>r.placements[0].decorationId),[dragonGuard.id,plainGuard.id]);
  done.results.forEach(r=>assert.equal(engine.validateResult(capCacheDB,capCacheInput,r).valid,true));
  regressions++;
  console.log('PASS worker and main search share elemental preference, headroom caching and continuation');
}

/* Independent exhaustive oracle. No calls to engine helpers. */
function bruteForce(db, input) {
  const feasible = new Set();
  const pool = [...db.armor, ...(input.customArmor || [])].filter(item =>
    !(input.excluded || []).includes(item.id)
    && (input.rank !== 'high' || item.rank === 'high')
    && item.rarity <= (input.maxRarity || 10));
  const lists = PARTS.map(part => pool.filter(item =>
    item.kind === part && (!input.fixed?.[part] || input.fixed[part] === item.id)));

  function evaluate(itemsOfArmor, charm) {
    const linked = itemsOfArmor.find(item => item.linkedSet);
    if (linked && itemsOfArmor.some(item => item.linkedSet !== linked.linkedSet)) return;
    const items = [input.weapon, charm, ...itemsOfArmor].filter(Boolean);
    const skills = {}, tags = {}, slots = [];
    let defense = 0;
    for (const item of items) {
      for (const [id, value] of Object.entries(item.skills || {})) skills[id] = (skills[id] || 0) + value;
      for (const [id, value] of Object.entries(item.tags || {})) tags[id] = (tags[id] || 0) + value;
      slots.push(...(item.slots || []));
      defense += item.maxDefense ?? item.defense ?? 0;
    }
    if (defense < (input.minDefense || 0)) return;
    for (const bonus of db.bonuses) {
      let strongest = 0;
      for (const rank of bonus.ranks) {
        if ((tags[bonus.id] || 0) >= rank.pieces && rank.level > strongest) strongest = rank.level;
      }
      if (strongest) skills[bonus.id] = Math.max(skills[bonus.id] || 0, strongest);
    }
    const used = {};

    function enumerateSlots(index) {
      if (Object.entries(input.targets).every(([id, level]) => (skills[id] || 0) >= level)) return true;
      if (index === slots.length) return false;
      // Empty is a legal choice, independent of whether this slot seems useful.
      if (enumerateSlots(index + 1)) return true;
      for (const decoration of db.decorations) {
        if (decoration.kind !== slots[index].kind || decoration.level > slots[index].level) continue;
        if (input.inventoryMode === 'owned'
          && (used[decoration.id] || 0) >= (input.decorationCounts?.[decoration.id] || 0)) continue;
        used[decoration.id] = (used[decoration.id] || 0) + 1;
        for (const [id, value] of Object.entries(decoration.skills)) skills[id] = (skills[id] || 0) + value;
        const succeeds = enumerateSlots(index + 1);
        for (const [id, value] of Object.entries(decoration.skills)) skills[id] -= value;
        used[decoration.id]--;
        if (succeeds) return true;
      }
      return false;
    }

    if (enumerateSlots(0)) {
      feasible.add(itemsOfArmor.map(item => item.id).join(',') + '|' + (charm?.id || 'none-charm'));
    }
  }

  for (const charm of input.charms?.length ? input.charms : [null]) {
    function enumerateGear(chosen) {
      if (chosen.length === PARTS.length) {
        evaluate(chosen, charm);
        return;
      }
      for (const item of lists[chosen.length]) enumerateGear([...chosen, item]);
    }
    enumerateGear([]);
  }
  return feasible;
}

const INITIAL_SEED = 530912;
let seed = INITIAL_SEED;
const random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
const integer = length => Math.floor(random() * length);
const pick = values => values[integer(values.length)];
const randomStart = Date.now();
let totalResults = 0;

for (let index = 0; index < caseCount; index++) {
  const randomItem = (id, kind) => ({
    id, kind, rank: random() < .15 ? 'low' : 'high', rarity: integer(3) + 1,
    skills: { A: random() < .4 ? integer(3) : 0, B: random() < .4 ? integer(3) : 0 },
    tags: { S: random() < .3 ? 1 : 0, Q: random() < .3 ? 1 : 0 },
    slots: random() < .4 ? [{ kind: random() < .2 ? 'weapon' : 'armor', level: integer(3) + 1 }] : [],
    defense: integer(15) + 1,
  });
  const db = {
    skills: [{ id: 'A', maxLevel: 5 }, { id: 'B', maxLevel: 5 }, { id: 'S', maxLevel: 2 }, { id: 'Q', maxLevel: 1 }],
    bonuses: [setBonus, { id: 'Q', ranks: [{ pieces: 3, level: 1 }] }],
    armor: PARTS.flatMap(part => [randomItem(part + '0', part), randomItem(part + '1', part)]),
    decorations: Array.from({ length: 4 }, (_, i) => ({
      id: 'd' + i, kind: random() < .25 ? 'weapon' : 'armor', level: integer(3) + 1,
      skills: { A: integer(3), B: integer(3) },
    })),
  };
  const input = {
    targets: { A: integer(4) + 1, B: integer(4) + 1 },
    weapon: randomItem('w', 'weapon'),
    charms: [randomItem('c0', 'charm'), randomItem('c1', 'charm')],
    inventoryMode: random() < .5 ? 'owned' : 'unlimited',
    decorationCounts: Object.fromEntries(db.decorations.map(item => [item.id, integer(3)])),
    excluded: random() < .2 ? [pick(db.armor).id] : [],
    rank: random() < .3 ? 'high' : 'all',
    maxRarity: random() < .2 ? 2 : 10,
    minDefense: random() < .2 ? integer(50) + 20 : 0,
  };
  if (random() < .3) input.targets.S = integer(2) + 1;
  if (random() < .2) input.targets.Q = 1;
  if (random() < .2) {
    const item = pick(db.armor);
    input.fixed = { [item.kind]: item.id };
  }
  if (random() < .2) input.customArmor = [randomItem('custom-head', 'head')];

  const expected = bruteForce(db, input);
  const results = collect(db, input);
  const actual = new Set(results.map(result =>
    result.armor.map(item => item.id).join(',') + '|' + result.charm.id));
  const missing = [...expected].filter(key => !actual.has(key));
  const extra = [...actual].filter(key => !expected.has(key));
  if (missing.length || extra.length || actual.size !== results.length) {
    console.error(JSON.stringify({ case: index, seed, missing, extra, db, input }, null, 2));
    assert.fail('Randomized solver/oracle mismatch; reproducer printed above');
  }
  totalResults += actual.size;
}

console.log(JSON.stringify({
  status: 'PASS', workspace, regressions, randomCases: caseCount,
  matchingCombinations: totalResults, initialSeed: INITIAL_SEED, finalSeed: seed,
  randomElapsedMs: Date.now() - randomStart,
}, null, 2));

if (args.includes('--real-data')) {
  require(path.join(workspace, 'dist', 'data.js'));
  const db = globalThis.WILDS_DB;
  const skillIds = new Set(db.skills.map(item => item.id));
  const bonusIds = new Set(db.bonuses.map(item => item.id));
  for (const item of [...db.armor, ...db.weapons, ...db.decorations]) {
    for (const id of Object.keys(item.skills || {})) assert(skillIds.has(id), 'Unknown skill ' + id);
    for (const id of Object.keys(item.tags || {})) assert(bonusIds.has(id), 'Unknown bonus ' + id);
    for (const slot of item.slots || []) {
      assert(['armor', 'weapon'].includes(slot.kind), 'Invalid slot kind on ' + item.id);
      assert([1, 2, 3].includes(slot.level), 'Invalid slot level on ' + item.id);
    }
  }
  for (const item of db.decorations) {
    assert(['armor', 'weapon'].includes(item.kind), 'Invalid decoration kind');
    assert([1, 2, 3].includes(item.level), 'Invalid decoration level');
  }
  console.log(JSON.stringify({
    realData: 'PASS', skills: db.skills.length, armor: db.armor.length,
    decorations: db.decorations.length, weapons: db.weapons.length, bonuses: db.bonuses.length,
  }));
}
