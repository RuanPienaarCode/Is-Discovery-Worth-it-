'use strict';
const assert = require('node:assert');
const { healthPremium, compareHealth, compareGap, compareInsure, compareLife, compareHome, HEALTH_PLANS, GAP_PLANS, INSURERS, LIFE_OFFERS, HOME_INSURERS } = require('../src/compare');
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg || ''} ${a} != ${b}`);

/* Made-up plans and products — never real premiums or a real family. */
const plan = (id, main, adult, child, extra) => ({ id, scheme: 'Scheme ' + id, plan: 'Plan ' + id, main, adult, child, source: 'test', ...extra });

// ── a plan's premium for a family ──────────────────────────────────────
const p1 = plan('a', 3000, 2000, 1000);
near(healthPremium(p1, { adults: 1, children: 0 }), 3000, 'the main member alone');
near(healthPremium(p1, { adults: 2, children: 1 }), 6000, 'main + adult + child');
near(healthPremium(p1, { adults: 2, children: 5 }), 3000 + 2000 + 3 * 1000, 'children are charged for the first three only');
near(healthPremium(plan('b', 3000, 2000, 1000, { maxChildren: 0 }), { adults: 1, children: 2 }), 5000, 'maxChildren 0 = every child charged');
near(healthPremium(p1, {}), 3000, 'no members typed = the main member');
assert.strictEqual(healthPremium(plan('c', 3000, null, 1000), { adults: 2, children: 0 }), null, 'an unpublished member rate gives no premium');

// ── medical aid: the plan, and Vitality Health given up by leaving ───
/* The Health product as products.js builds it, per year. */
const health = { paid: 80000, medicalYear: 72000, vitalityYear: 8000, vitValue: 20000 };
const plans = [plan('a', 3000, 2000, 1000), plan('d', 2000, 1500, 600, { discovery: true }), plan('e', 2500, null, 800)];
const h = compareHealth(health, { members: { adults: 2, children: 1 } }, plans);
near(h.current.annual, 72000, 'Discovery is the medical aid part, Vitality shown apart');
near(h.vitalityNet, 20000 - 8000, 'Vitality Health: value less its premium');
const ha = h.rows.find(r => r.id === 'a');
near(ha.annual, 6000 * 12);
near(ha.gainIfSwitch, 72000 - 72000 - 12000, 'same premium, but Vitality Health is lost');
const hd = h.rows.find(r => r.id === 'd');
near(hd.gainIfSwitch, 72000 - 4100 * 12, 'a cheaper Discovery plan keeps Vitality');
assert.ok(!h.rows.find(r => r.id === 'e').annual && h.rows.find(r => r.id === 'e').gainIfSwitch === null, 'an unpriced plan has no figures');
assert.deepStrictEqual(h.rows.map(r => r.id), ['d', 'a', 'e'], 'best first, unpriced last');
// today's contribution, when typed, beats the window's average (the others are priced at today's rates)
const ht = compareHealth(health, { members: { adults: 2, children: 1 }, bill: { medical: 6500 } }, plans);
near(ht.current.annual, 6500 * 12);
near(ht.rows.find(r => r.id === 'a').gainIfSwitch, 6500 * 12 - 72000 - 12000);
// a typed quote wins over the published figure
const hq = compareHealth(health, { members: { adults: 2, children: 1 }, quotes: { 'health.a': 4000 } }, plans);
near(hq.rows.find(r => r.id === 'a').monthly, 4000);
assert.ok(hq.rows.find(r => r.id === 'a').quoted);
// Vitality's premium not split out of the debit: its value is still lost
const h2 = compareHealth({ paid: 80000, medicalYear: 80000, vitalityYear: 0, vitValue: 20000 }, { members: { adults: 2, children: 1 } }, plans);
near(h2.rows.find(r => r.id === 'a').gainIfSwitch, 80000 - 72000 - 20000);
// Vitality Health worth less than it costs: leaving it is a gain
near(compareHealth({ paid: 80000, medicalYear: 72000, vitalityYear: 8000, vitValue: 3000 }, { members: { adults: 2, children: 1 } }, plans).rows.find(r => r.id === 'a').gainIfSwitch, 5000);
// no Discovery Health at all: nothing to compare
assert.strictEqual(compareHealth({ paid: 0, medicalYear: 0, vitalityYear: 0, vitValue: 0 }, {}, plans), null);

// ── Discovery Gap Cover costs more on some Discovery plans ────────────
const gp = [plan('e', 2000, 1500, 600, { discovery: true, gapCore: { single: 300, family: 500 } })];
near(compareHealth(health, { members: { adults: 2, children: 1 }, bill: { gap: 300 } }, gp).rows[0].gapExtra, 200 * 12, 'family rate less today\'s premium');
near(compareHealth(health, { members: { adults: 1, children: 0 }, bill: { gap: 200 } }, gp).rows[0].gapExtra, 100 * 12, 'single rate for one person');
near(compareHealth(health, { members: { adults: 2, children: 1 }, bill: { gap: 300 } }, gp).rows[0].gainIfSwitch, 72000 - 4100 * 12 - 2400, 'counted against the saving');
near(compareHealth(health, { members: { adults: 2, children: 1 } }, gp).rows[0].gapExtra, 0, 'no Discovery gap cover typed');

// ── what the family needs: a plan graded "no" is not like for like ────
const graded = [
  plan('y', 3000, 2000, 1000, { cover: { doctors: 'yes', psychology: 'limited', babies: 'yes', checkups: 'yes' } }),
  plan('n', 1000, 800, 400, { cover: { doctors: 'yes', psychology: 'no', babies: 'yes', checkups: 'yes' } }),
];
const hc = compareHealth(health, { members: { adults: 2, children: 1 } }, graded);
const hy = hc.rows.find(r => r.id === 'y'), hn2 = hc.rows.find(r => r.id === 'n');
assert.strictEqual(hy.likeForLike, true, 'limited still covers');
assert.deepStrictEqual(hy.unsure, ['hospital'], 'your hospital is unknown until you set it');
assert.strictEqual(hn2.likeForLike, false);
assert.deepStrictEqual(hn2.misses, ['psychology']);
const hs = compareHealth(health, { members: { adults: 2, children: 1 }, health: { cover: { y: { hospital: 'no' }, n: { psychology: 'yes' } } } }, graded);
assert.deepStrictEqual(hs.rows.find(r => r.id === 'y').misses, ['hospital'], 'your hospital not in its network');
assert.strictEqual(hs.rows.find(r => r.id === 'n').likeForLike, true, 'a grade you set wins over the table');
const hu = compareHealth(health, { members: { adults: 2, children: 1 }, health: { needs: ['doctors'] } }, graded);
assert.strictEqual(hu.rows.find(r => r.id === 'n').likeForLike, true, 'only the needs ticked count');
assert.strictEqual(hu.rows.find(r => r.id === 'n').cover.psychology, 'no', 'the grade is still shown');
assert.strictEqual(compareHealth(health, { members: {}, health: { cover: { y: { doctors: 'maybe' } } } }, graded).rows.find(r => r.id === 'y').cover.doctors, 'yes', 'an unknown word is ignored');

// ── gap cover ─────────────────────────────────────────────────────────
const gaps = [{ id: 'g1', provider: 'Gap One', plan: 'Basic', monthly: 200, source: 'test' }, { id: 'g2', provider: 'Gap Two', plan: 'Plus', monthly: 400, source: 'test' }, { id: 'g3', provider: 'Gap Three', plan: 'Family', monthly: null, source: 'test' }];
// the published prices are for an oldest member under 45
const young = { members: { adults: 2, children: 0, oldestAge: 38 } };
const g = compareGap({ paid: 3600 }, young, gaps);
near(g.current.annual, 3600);
near(g.current.monthly, 300);
assert.strictEqual(g.pricedForAge, true);
assert.strictEqual(g.ageNote, null);
near(g.rows.find(r => r.id === 'g1').gainIfSwitch, 1200);
near(g.rows.find(r => r.id === 'g2').gainIfSwitch, -1200);
assert.deepStrictEqual(g.rows.map(r => r.id), ['g1', 'g2', 'g3']);
near(compareGap({ paid: 3600 }, { ...young, quotes: { 'gap.g3': 150 } }, gaps).rows[0].gainIfSwitch, 1800, 'a typed quote prices g3');
assert.strictEqual(compareGap({ paid: 0 }, {}, gaps), null);
// age not given, or 45 and over: the prices still show, but claim no saving
for (const members of [{ adults: 2 }, { adults: 2, oldestAge: null }, { adults: 2, oldestAge: 45 }, { adults: 2, oldestAge: 62 }]) {
  const old = compareGap({ paid: 3600 }, { members }, gaps);
  assert.strictEqual(old.pricedForAge, false, JSON.stringify(members));
  assert.strictEqual(old.ageNote, 'Rival prices shown are for under 45s.');
  const g1 = old.rows.find(r => r.id === 'g1');
  assert.strictEqual(g1.monthly, 200, 'the published price is still shown');
  assert.strictEqual(g1.ageLimited, true);
  assert.strictEqual(g1.gainIfSwitch, null, 'no saving claimed on an under-45 price');
}
// a typed quote is for your own ages, so it still counts
const quotedOld = compareGap({ paid: 3600 }, { members: { oldestAge: 62 }, quotes: { 'gap.g2': 250 } }, gaps);
near(quotedOld.rows[0].gainIfSwitch, 600);
assert.strictEqual(quotedOld.rows[0].ageLimited, false);
assert.strictEqual(compareGap({ paid: 3600 }, { members: { oldestAge: 44 } }, gaps).pricedForAge, true, '44 is under 45');

// ── price periods: Discovery Health 1 Apr – 31 Dec 2026, then its 2027
//    prices from 1 Jan 2027 (y2027); the rest 2026 ─────────────────────
{
  const { planPriceValidFor, HEALTH_OWN: OWN } = require('../src/compare');
  assert.strictEqual(planPriceValidFor('2026-04'), true);
  assert.strictEqual(planPriceValidFor('2026-11-01'), true);
  assert.strictEqual(planPriceValidFor('2027-03'), true, 'the 2027 prices are in the table too');
  assert.strictEqual(planPriceValidFor('2027-12'), true);
  assert.strictEqual(planPriceValidFor('2028-01'), false, 'nothing published for 2028');
  assert.strictEqual(planPriceValidFor('2026-03'), false, 'before April 2026 the old prices applied');
  assert.strictEqual(planPriceValidFor(''), false);
  assert.strictEqual(planPriceValidFor(undefined), false);
  for (const p of HEALTH_PLANS.concat(OWN)) {
    const e = p.effective;
    assert.ok(e && e.from && e.to, `${p.id} carries its price period`);
    if (p.discovery) assert.deepStrictEqual([e.from, e.to], ['2026-04-01', '2026-12-31'], p.id);
    else assert.deepStrictEqual([e.from, e.to], ['2026-01-01', '2026-12-31'], p.id);
  }
  for (const p of GAP_PLANS) assert.deepStrictEqual([p.effective.from, p.effective.to], ['2026-01-01', '2026-12-31'], p.id);
}

// ── 2027 prices: every Discovery plan has them, and they start on 1 Jan 2027 ─
{
  const { priceAt, HEALTH_OWN: OWN } = require('../src/compare');
  const all = HEALTH_PLANS.concat(OWN).filter(p => p.discovery);
  for (const p of all) {
    assert.ok(p.y2027 && p.y2027.main > 0 && p.y2027.child > 0, `${p.id} has 2027 prices`);
    if (p.main) assert.ok(p.y2027.main > p.main, `${p.id}: 2027 costs more than 2026`);
  }
  const saver = OWN.find(p => p.id === 'dhClassicSaver');
  const fam = { adults: 2, children: 1 };
  assert.strictEqual(healthPremium(saver, fam), 4850 + 3825 + 1943, 'no date: the 2026 prices');
  assert.strictEqual(healthPremium(saver, fam, '2026-12-31'), 4850 + 3825 + 1943, 'still 2026 on 31 December');
  assert.strictEqual(healthPremium(saver, fam, '2027-01'), 5235 + 4128 + 2098, '2027 from January');
  assert.strictEqual(healthPremium(saver, fam, new Date(2027, 5, 1)), 5235 + 4128 + 2098, 'takes a Date');
  // KeyCare's income bands move in 2027: the row carries its 2027 label
  const kc = OWN.find(p => p.id === 'dhKeyCarePlus1');
  assert.ok(/R10 250/.test(priceAt(kc, '2026-11').plan) && /R10 650/.test(priceAt(kc, '2027-01').plan));
  // Active Core is new in 2027: no price before then
  const ac = OWN.find(p => p.id === 'dhActiveCore');
  assert.strictEqual(healthPremium(ac, fam, '2026-11'), null);
  assert.strictEqual(healthPremium(ac, fam, '2027-02'), 1700 + 1550 + 500);
  // 2027 cover notes replace only what changed
  const es = HEALTH_PLANS.find(p => p.id === 'dhEssentialSmart');
  assert.ok(/R135/.test(priceAt(es, '2027-01').coverNote.doctors) && /R13 150/.test(priceAt(es, '2027-01').coverNote.hospital));
  assert.strictEqual(priceAt(es, '2027-01').coverNote.babies, es.coverNote.babies);
  // compareHealth prices Discovery's plans on opts.now
  const h = { paid: 120000, medicalYear: 120000, vitalityYear: 0, vitValue: 0 };
  const row = d => compareHealth(h, { members: fam }, [es], { now: d }).rows[0].monthly;
  assert.strictEqual(row('2026-11-03'), 2161 * 3);
  assert.strictEqual(row('2027-01-02'), 2332 * 3);
}

// ── car insurance: quotes, rewards, and Vitality Drive given up ──────
const insurers = [{ id: 'i1', name: 'Insurer One', rewardPct: 0, source: 'test' }, { id: 'i2', name: 'Insurer Two', rewardPct: 10, rewardNote: '10% back', source: 'test' }];
const insure = { paid: 16000, drive: { annual: 2000 } };
const ci = compareInsure(insure, {}, insurers);
near(ci.current.annual, 16000);
near(ci.driveValue, 2000);
const i1 = ci.rows.find(r => r.id === 'i1');
assert.strictEqual(i1.monthly, null, 'no quote typed');
assert.strictEqual(i1.gainIfSwitch, null);
near(i1.breakEven, (16000 - 2000) / 12, 'a quote under this beats Discovery');
near(ci.rows.find(r => r.id === 'i2').breakEven, (16000 - 2000) / 12 / 0.9, 'rewards lift the quote that matches');
const cq = compareInsure(insure, { quotes: { 'insure.i1': 1000, 'insure.i2': 1000 } }, insurers);
near(cq.rows.find(r => r.id === 'i1').gainIfSwitch, 16000 - 2000 - 12000);
near(cq.rows.find(r => r.id === 'i2').gainIfSwitch, 16000 - 2000 - 12000 * 0.9);
near(cq.rows.find(r => r.id === 'i2').rewards, 1200);
assert.deepStrictEqual(cq.rows.map(r => r.id), ['i2', 'i1'], 'best first');
near(compareInsure({ paid: 16000, drive: null }, {}, insurers).driveValue, 0, 'no Drive line');
const cl = compareInsure({ paid: 16000, latestMonthly: 1500, drive: { annual: 2000 } }, {}, insurers);
near(cl.current.annual, 18000, 'the latest debit, not the window average');
near(cl.rows[0].breakEven, (18000 - 2000) / 12 / (1 - cl.rows[0].rewardPct / 100));
assert.strictEqual(compareInsure({ paid: 0, drive: null }, {}, insurers), null);

// ── life: your share of an employer scheme against an individual policy
const offers = [{ id: 'l1', name: 'Life One', monthly: null, source: 'test' }, { id: 'l2', name: 'Life Two', monthly: 900, rewardPct: 10, source: 'test' }];
const cf = compareLife({ monthly: 500 }, { life: { total: 1000 } }, offers);
near(cf.current.monthly, 500, 'what you pay');
near(cf.total.monthly, 1000);
near(cf.employer.monthly, 500, 'the employer pays the rest');
near(cf.rows.find(r => r.id === 'l1').breakEven, 500, 'an individual policy is all yours: it must cost under your share');
assert.strictEqual(cf.rows.find(r => r.id === 'l1').gainIfSwitch, null);
near(cf.rows.find(r => r.id === 'l2').gainIfSwitch, 500 * 12 - 900 * 12 * 0.9, 'a published example, less its rewards');
near(compareLife({ monthly: 500 }, { quotes: { 'life.l1': 400 } }, offers).rows[0].gainIfSwitch, 1200, 'a typed quote, best first');
near(compareLife({ monthly: 500 }, { life: { total: 300 } }, offers).employer.monthly, 0, 'a total under your share is ignored');
assert.strictEqual(compareLife({ monthly: 0 }, {}, offers), null);
// PayBack lowers what your share costs; life cover alone priced by age band
const bench = { source: 'test', bands: [{ from: 38, to: 42, low: 200, high: 300 }] };
const cp = compareLife({ monthly: 500, cover: 2000000 }, { life: { total: 1000, payback: 1200, age: 40 } }, offers, bench);
near(cp.current.monthly, 400, '500 less 1 200 a year');
near(cp.employer.monthly, 500, 'the employer share is of the premium, before PayBack');
near(cp.lifeOnly.low, 400, 'scaled to R2m of cover');
near(cp.lifeOnly.high, 600);
assert.strictEqual(compareLife({ monthly: 500, cover: 2000000 }, { life: { age: 50 } }, offers, bench).lifeOnly, null, 'no band for the age');
assert.strictEqual(compareLife({ monthly: 500 }, { life: { age: 40 } }, offers, bench).lifeOnly, null, 'no cover typed');

// ── home contents: priced per R100 000 of contents ────────────────────
const homes = [{ id: 'h1', name: 'Home One', per100k: 120, source: 'test' }, { id: 'h2', name: 'Home Two', per100k: 90, source: 'test' }, { id: 'h3', name: 'Home Three', source: 'test' }];
assert.strictEqual(compareHome({}, homes), null, 'not set up: nothing shown');
const hn = compareHome({ home: { monthly: 0, contents: 200000 } }, homes);
near(hn.current.monthly, 0, 'not insured');
near(hn.rows.find(r => r.id === 'h1').monthly, 240);
assert.ok(hn.range.low > 0 && hn.range.high > hn.range.low, 'the market range for the contents value');
assert.strictEqual(compareHome({ home: { monthly: 0 } }, homes).range, null);
assert.deepStrictEqual(hn.rows.map(r => r.id), ['h2', 'h1', 'h3'], 'not insured: cheapest first, unpriced last');
assert.strictEqual(hn.rows[0].gainIfSwitch, null, 'nothing to switch from');
assert.ok(compareHome({ home: { monthly: 0 } }, homes).rows.every(r => r.monthly === null), 'no contents value: nothing priced');
const hi = compareHome({ home: { monthly: 300, contents: 200000 }, quotes: { 'home.h3': 150 } }, homes);
near(hi.rows[0].gainIfSwitch, 1800, 'insured: a quote under today\'s premium wins');
near(hi.rows.find(r => r.id === 'h1').breakEven, 300);

// ── the published tables are complete and sourced ────────────────────
for (const p of HEALTH_PLANS) {
  assert.ok(p.id && p.scheme && p.plan && p.source, `health plan ${p.id} named and sourced`);
  assert.ok(Number.isFinite(p.main) && p.main > 0, `health plan ${p.id} has a main member rate`);
}
for (const p of HEALTH_PLANS) for (const n of ['doctors', 'psychology', 'babies', 'checkups']) assert.ok(['yes', 'limited', 'no', 'unknown'].includes((p.cover || {})[n]), `health plan ${p.id} graded on ${n}`);
assert.ok(HEALTH_PLANS.filter(p => !p.discovery).length >= 6, 'at least six other schemes\' plans');
assert.strictEqual(new Set(HEALTH_PLANS.map(p => p.id)).size, HEALTH_PLANS.length, 'unique health ids');
for (const p of GAP_PLANS) assert.ok(p.id && p.provider && p.plan && p.source, `gap plan ${p.id} named and sourced`);
assert.ok(GAP_PLANS.filter(p => Number.isFinite(p.monthly)).length >= 4, 'at least four priced gap covers');
assert.strictEqual(new Set(GAP_PLANS.map(p => p.id)).size, GAP_PLANS.length, 'unique gap ids');
for (const o of LIFE_OFFERS) assert.ok(o.id && o.name && o.source, `life offer ${o.id}`);
for (const a of HOME_INSURERS) assert.ok(a.id && a.name && a.source && (a.per100k === undefined || a.per100k > 0), `home insurer ${a.id}`);
assert.strictEqual(new Set(HOME_INSURERS.map(a => a.id)).size, HOME_INSURERS.length, 'unique home ids');
for (const p of INSURERS) assert.ok(p.id && p.name && p.source && Number.isFinite(p.rewardPct) && p.rewardPct >= 0 && p.rewardPct < 100, `insurer ${p.id}`);
assert.ok(INSURERS.length >= 6, 'at least six insurers');

// ── every Discovery Health plan is priced, so your plan can be guessed ─
{
  const { HEALTH_OWN: OWN } = require('../src/compare');
  const discovery = HEALTH_PLANS.concat(OWN).filter(p => p.discovery);
  assert.ok(discovery.length >= 30, 'the whole Discovery Health range: ' + discovery.length);
  assert.strictEqual(new Set(discovery.map(p => p.id)).size, discovery.length, 'unique Discovery plan ids');
  for (const p of discovery) {
    assert.ok(p.id && p.plan && p.source, `Discovery plan ${p.id} named and sourced`);
    for (const members of [{ adults: 1, children: 0 }, { adults: 2, children: 2 }, { adults: 2, children: 5 }]) {
      /* a plan that is new in 2027 has only 2027 prices */
      const v = healthPremium(p, members, p.main === null ? '2027-01' : undefined);
      assert.ok(Number.isFinite(v) && v > 0, `healthPremium prices ${p.id} for ${JSON.stringify(members)}`);
    }
  }
  const own = id => OWN.find(p => p.id === id);
  assert.strictEqual(healthPremium(own('dhClassicSmart'), { adults: 2, children: 1 }), 3018 + 2381 + 1205, 'Classic Smart from the 2026 plan comparison');
  assert.strictEqual(healthPremium(own('dhExecutive'), { adults: 1, children: 4 }), 12338 + 3 * 2358, 'at most three children are charged');
}

// ── the medical aid split out by the plan's price ────────────────────
{
  const hp = compareHealth({ ...health, medicalMonthly: 5500, vitalityKnown: true }, { members: { adults: 2, children: 1 } }, plans);
  near(hp.current.annual, 5500 * 12, 'today\'s priced contribution, not the window average');
  assert.strictEqual(hp.vitalityKnown, true);
  const typedWins = compareHealth({ ...health, medicalMonthly: 5500 }, { members: { adults: 2, children: 1 }, bill: { medical: 6500 } }, plans);
  near(typedWins.current.annual, 6500 * 12, 'a typed amount still wins');
  const unknown = compareHealth({ paid: 63000, medicalYear: 63000, vitalityYear: 0, vitValue: 3000, vitalityKnown: false }, { members: { adults: 1 } }, plans);
  assert.strictEqual(unknown.vitalityKnown, false, 'unknown premium passed on');
  assert.strictEqual(compareHealth(health, {}, plans).vitalityKnown, true, 'old callers: known');
}

// round 2: a product whose payments stopped has nothing to compare
assert.strictEqual(compareHealth({ ...health, ended: true }, { members: { adults: 2, children: 1 } }, plans), null);
assert.strictEqual(compareGap({ paid: 3000, ended: true }, {}), null);
assert.strictEqual(compareInsure({ paid: 12000, ended: true }, {}), null);
assert.strictEqual(compareLife({ monthly: 500, ended: true }, {}), null);
assert.ok(compareGap({ paid: 3000 }, {}), 'not ended: still compared');
console.log('compare: ok');

// ── market data audit, 3 Nov 2026 (docs/market-data-sources.html) ──────
{
  const C = require('../src/compare');
  // claim-free rewards pay X% of ALL premiums over the claim-free years, so about X% a year
  const ins = id => C.INSURERS.find(a => a.id === id);
  for (const id of ['outsurance', 'miway', 'santam']) assert.strictEqual(ins(id).rewardPct, 10, id);
  assert.strictEqual(C.HOME_INSURERS.find(a => a.id === 'outsurance').rewardPct, 10);
  assert.strictEqual(C.HOME_INSURERS.find(a => a.id === 'dialdirect').rewardPct || 0, 0, 'a paid add-on is not counted, as on the car side');
  // gap cover: 2027 prices where published, and Zestlife Optimal only under 42
  const g = { paid: 6000 };
  const row = (id, age, now) => C.compareGap(g, { members: { oldestAge: age } }, undefined, { now }).rows.find(r => r.id === id);
  assert.strictEqual(row('turnberryLaunch', 40, '2026-11-03').monthly, 185);
  assert.strictEqual(row('turnberryLaunch', 40, '2027-01-05').monthly, 191);
  assert.strictEqual(row('turnberryLaunch', 40, '2027-01-05').priceYear, 2027);
  assert.strictEqual(row('dgComprehensive', 40, '2027-01-05').plan, 'Gap 500');
  assert.strictEqual(row('siragoGapCore', 40, '2027-01-05').priceYear, undefined, 'no 2027 price published: stays on 2026');
  assert.strictEqual(row('zestOptimal', 41, '2026-11-03').ageLimited, false);
  assert.strictEqual(row('zestOptimal', 43, '2026-11-03').ageLimited, true, 'sold only when everyone is under 42');
  assert.strictEqual(row('stratumMeridian400', 43, '2026-11-03').ageLimited, false);
  for (const id of ['ambledownPhi', 'ambledownSigma']) assert.ok(!C.GAP_PLANS.find(p => p.id === id).unconfirmed, id + ' confirmed on Ambledown\'s own brochure');
  // Discovery Gap Core moves with the Essential plans in 2027 (Gap 250)
  const es = C.HEALTH_PLANS.find(p => p.id === 'dhEssentialSmart');
  assert.deepStrictEqual(C.priceAt(es, '2027-01').gapCore, { single: 346, family: 623 });
  assert.deepStrictEqual(C.priceAt(es, '2026-12').gapCore, { single: 317, family: 572 });
  // the life benchmark and the home range are a broker's figures, and say so
  assert.ok(C.LIFE_BENCHMARK.unconfirmed && C.HOME_RANGE.unconfirmed);
}
