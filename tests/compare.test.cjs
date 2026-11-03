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
const g = compareGap({ paid: 3600 }, {}, gaps);
near(g.current.annual, 3600);
near(g.current.monthly, 300);
near(g.rows.find(r => r.id === 'g1').gainIfSwitch, 1200);
near(g.rows.find(r => r.id === 'g2').gainIfSwitch, -1200);
assert.deepStrictEqual(g.rows.map(r => r.id), ['g1', 'g2', 'g3']);
near(compareGap({ paid: 3600 }, { quotes: { 'gap.g3': 150 } }, gaps).rows[0].gainIfSwitch, 1800, 'a typed quote prices g3');
assert.strictEqual(compareGap({ paid: 0 }, {}, gaps), null);

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

console.log('compare: ok');
