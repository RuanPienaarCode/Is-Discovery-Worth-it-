'use strict';
const assert = require('node:assert');
const { buildVerdicts, MATERIAL } = require('../src/verdict');

/* Made-up statements and comparisons — never real figures. */
const st = (verdict, gain) => ({ verdict, chosen: { name: 'Other Bank', gainIfSwitch: gain } });
const cmp = (rows, extra) => ({ current: { annual: 12000, monthly: 1000 }, rows, ...extra });
const row = (gain, extra) => ({ name: 'Option', scheme: 'Scheme', plan: 'Plan', provider: 'Provider', gainIfSwitch: gain, monthly: gain === null ? null : 900, ...extra });

// ── bank: the statement's own verdict ─────────────────────────────────
let v = buildVerdicts(st('stay', -5000), {});
assert.strictEqual(v.bank.tone, 'good');
assert.strictEqual(v.bank.amount, 5000, 'stay: how much better than the other bank');
assert.strictEqual(v.bank.vs, 'Other Bank');
v = buildVerdicts(st('switch', 2000), {});
assert.strictEqual(v.bank.tone, 'over');
assert.strictEqual(v.bank.amount, 2000);
assert.strictEqual(buildVerdicts({ chosen: null }, {}).bank, undefined, 'no other bank to compare: no verdict');

// ── market products: best priced row decides ──────────────────────────
v = buildVerdicts(null, { health: cmp([row(-300), row(-4000)], { vitalityNet: 9000 }) });
assert.strictEqual(v.health.tone, 'good', 'nothing cheaper');
assert.strictEqual(v.health.amount, 300);
assert.ok(/more than it costs/.test(v.health.why), 'Vitality Health named');
v = buildVerdicts(null, { gap: cmp([row(MATERIAL - 1)]) });
assert.strictEqual(v.gap.tone, 'good', 'a gain under MATERIAL is not worth a switch');
v = buildVerdicts(null, { gap: cmp([row(1500), row(200)]) });
assert.strictEqual(v.gap.tone, 'check', 'a cheaper published price');
assert.strictEqual(v.gap.amount, 1500);
assert.strictEqual(v.gap.vs, 'Provider Plan');
v = buildVerdicts(null, { gap: cmp([row(1500, { quoted: true })]) });
assert.strictEqual(v.gap.tone, 'over', 'a typed quote that beats Discovery');
v = buildVerdicts(null, { gap: cmp([row(null), row(800)]) });
assert.strictEqual(v.gap.amount, 800, 'unpriced rows are skipped');

// ── health: a cheaper plan that misses a need does not count ──────────
v = buildVerdicts(null, { health: cmp([row(5000, { likeForLike: false }), row(800, { likeForLike: true, unsure: ['hospital'] })], { needs: [{ id: 'hospital', label: 'Your hospital' }] }) });
assert.strictEqual(v.health.amount, 800, 'the best like-for-like plan');
assert.ok(/Check first: your hospital/.test(v.health.why));
v = buildVerdicts(null, { health: cmp([row(5000, { likeForLike: false }), row(-200, { likeForLike: true })]) });
assert.strictEqual(v.health.tone, 'good', 'only a plan missing a need is cheaper');

// ── nothing priced: the quote that would match ─────────────────────────
v = buildVerdicts(null, { insure: cmp([row(null, { breakEven: 1300 }), row(null, { breakEven: 1250 })]) });
assert.strictEqual(v.insure.tone, 'quote');
assert.strictEqual(v.insure.amount, 1250, 'the lowest break-even: a quote under it beats every insurer\'s case');
v = buildVerdicts(null, { insure: cmp([row(null, { breakEven: 1300 }), row(-100, { quoted: true })]) });
assert.strictEqual(v.insure.tone, 'good', 'one quote typed, and it loses');
assert.strictEqual(buildVerdicts(null, {}).insure, null, 'no Insure: no verdict');

// ── home contents: not insured, priced from the cheapest ──────────────
v = buildVerdicts(null, { home: { current: { monthly: 0, annual: 0 }, rows: [{ name: 'A', monthly: 300 }, { name: 'B', monthly: 250 }, { name: 'C', monthly: null }] } });
assert.strictEqual(v.home.tone, 'none');
assert.strictEqual(v.home.amount, -250 * 12, 'what the cheapest cover costs a year');
v = buildVerdicts(null, { home: { current: { monthly: 0 }, rows: [{ name: 'A', monthly: null }] } });
assert.strictEqual(v.home.amount, null, 'no value typed: nothing priced');
v = buildVerdicts(null, { home: cmp([row(1000)]) });
assert.strictEqual(v.home.tone, 'check', 'insured: compared like the others');
assert.strictEqual(buildVerdicts(null, {}).home, undefined);

// ── life: no quote, but life cover alone already costs much of the share
const life = (low, rows) => ({ current: { monthly: 800 }, lifeOnly: low === null ? null : { low, high: low * 1.5 }, rows: rows || [row(null, { breakEven: 800 })] });
assert.strictEqual(buildVerdicts(null, { life: life(250) }).life.word, 'Likely worth it');
assert.strictEqual(buildVerdicts(null, { life: life(100) }).life.tone, 'quote', 'life alone is cheap: a quote decides');
assert.strictEqual(buildVerdicts(null, { life: life(null) }).life.tone, 'quote');
assert.strictEqual(buildVerdicts(null, { life: life(250, [row(2000, { quoted: true })]) }).life.tone, 'over', 'a quote beats the estimate');

// ── products left out get no verdict at all ───────────────────────────
{
  const full = { health: cmp([row(1500)]), gap: cmp([row(1500)]), insure: cmp([row(null, { breakEven: 1300 })]), life: { current: { monthly: 800 }, lifeOnly: null, rows: [row(null, { breakEven: 800 })] } };
  const all = buildVerdicts(st('stay', -5000), full);
  assert.deepStrictEqual(Object.keys(buildVerdicts(st('stay', -5000), full, { bank: true, health: true, gap: true, insure: true, life: true })).sort(), Object.keys(all).sort(), 'all on = no map');
  const some = buildVerdicts(st('stay', -5000), full, { bank: false, health: true, gap: false, insure: true, life: false });
  assert.ok(!('bank' in some) && !('gap' in some) && !('life' in some), 'left out: ' + Object.keys(some).join(', '));
  assert.strictEqual(some.health.tone, 'check');
  assert.strictEqual(some.insure.tone, 'quote');
  const home = buildVerdicts(null, { home: cmp([row(1000)]) }, { bank: false, health: false, gap: false, insure: false, life: false });
  assert.strictEqual(home.home.tone, 'check', 'home contents is not a Discovery product, so it stays');
}

console.log('verdict: ok');
