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
assert.strictEqual(v.bank.tone, 'check');
assert.strictEqual(v.bank.word, 'Lower price elsewhere');
assert.strictEqual(v.bank.amount, 2000);
assert.ok(/^By these figures, Other Bank would cost about R\s2\s000 less a year\./.test(v.bank.why), v.bank.why);
// the bank gets the same R600 line as the other products
v = buildVerdicts(st('switch', MATERIAL - 1), {});
assert.strictEqual(v.bank.word, 'About the same', 'a small gain is too close to call');
assert.strictEqual(v.bank.tone, 'good');
v = buildVerdicts(st('stay', -(MATERIAL - 1)), {});
assert.strictEqual(v.bank.word, 'About the same');
assert.strictEqual(v.bank.amount, MATERIAL - 1);
assert.strictEqual(buildVerdicts(st('switch', MATERIAL), {}).bank.word, 'Lower price elsewhere', 'R600 exactly is material');
assert.strictEqual(buildVerdicts(st('stay', -MATERIAL), {}).bank.word, 'Comes out ahead');
assert.strictEqual(buildVerdicts({ chosen: null }, {}).bank, undefined, 'no other bank to compare: no verdict');

// ── market products: best priced row decides ──────────────────────────
v = buildVerdicts(null, { health: cmp([row(-300), row(-4000)], { vitalityNet: 9000 }) });
assert.strictEqual(v.health.tone, 'good', 'nothing cheaper');
assert.strictEqual(v.health.amount, 300);
assert.ok(/more than it costs/.test(v.health.why), 'Vitality Health named');
v = buildVerdicts(null, { gap: cmp([row(MATERIAL - 1)]) });
assert.strictEqual(v.gap.tone, 'good', 'a gain under MATERIAL is not worth a switch');
assert.strictEqual(v.gap.word, 'About the same');
assert.strictEqual(buildVerdicts(null, { gap: cmp([row(-MATERIAL)]) }).gap.word, 'Comes out ahead');
v = buildVerdicts(null, { gap: cmp([row(1500), row(200)]) });
assert.strictEqual(v.gap.tone, 'check', 'a cheaper published price');
assert.strictEqual(v.gap.amount, 1500);
assert.strictEqual(v.gap.vs, 'Provider Plan');
assert.ok(/^By these figures, Provider Plan would cost about R\s1\s500 less a year\./.test(v.gap.why), v.gap.why);
v = buildVerdicts(null, { gap: cmp([row(1500, { quoted: true })]) });
assert.strictEqual(v.gap.tone, 'over', 'a typed quote that beats Discovery');
assert.strictEqual(v.gap.word, 'Lower price elsewhere');
assert.ok(/your Provider Plan quote would cost about/.test(v.gap.why), v.gap.why);
v = buildVerdicts(null, { gap: cmp([row(null), row(800)]) });
assert.strictEqual(v.gap.amount, 800, 'unpriced rows are skipped');

// ── health: a cheaper plan that misses a need does not count ──────────
v = buildVerdicts(null, { health: cmp([row(5000, { likeForLike: false }), row(800, { likeForLike: true, unsure: ['hospital'] })], { needs: [{ id: 'hospital', label: 'Your hospital' }] }) });
assert.strictEqual(v.health.amount, 800, 'the best like-for-like plan');
assert.ok(/Not confirmed for that plan: your hospital/.test(v.health.why));
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
assert.strictEqual(buildVerdicts(null, { life: life(250) }).life.word, 'Likely ahead');
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

// ── only say what is true ─────────────────────────────────────────────
{
  const good = buildVerdicts({ verdict: 'stay', net: 1200, chosen: { name: 'Other Bank', gainIfSwitch: -3000 } }, {});
  assert.ok(/worth more than its fees/.test(good.bank.why), good.bank.why);
  const under = buildVerdicts({ verdict: 'stay', net: -1500, chosen: { name: 'Other Bank', gainIfSwitch: -4000 } }, {});
  assert.ok(!/worth more than its fees/.test(under.bank.why), 'fees above rewards: not "worth more than its fees"');
  assert.ok(/fees cost more than its rewards/.test(under.bank.why), under.bank.why);
  // Vitality's premium unknown (counted as nothing): no claim about what it costs
  const vu = buildVerdicts(null, { health: cmp([row(5000)], { vitalityNet: 3000, vitalityKnown: false }) });
  assert.ok(!/Vitality Health (gives|costs)/.test(vu.health.why), vu.health.why);
  const vk = buildVerdicts(null, { health: cmp([row(5000)], { vitalityNet: -3000, vitalityKnown: true }) });
  assert.ok(/Vitality Health costs more than it gives back/.test(vk.health.why), vk.health.why);
}

// ── no "Overpaying" anywhere; every saving is conditional ──────────────
{
  const all = [
    buildVerdicts(st('switch', 5000), { health: cmp([row(5000)]), gap: cmp([row(5000, { quoted: true })]), insure: cmp([row(5000, { quoted: true })]) }),
    buildVerdicts(st('stay', -5000), { health: cmp([row(-5000)]), gap: cmp([row(100)]) }),
  ];
  for (const vs of all) for (const x of Object.values(vs)) {
    if (!x) continue;
    assert.ok(!/overpay/i.test(x.word + ' ' + x.why), x.word + ': ' + x.why);
    if (/less a year/.test(x.why)) assert.ok(/By these figures, /.test(x.why), x.why);
  }
}

// ── an unconfirmed rival says so ──────────────────────────────────────
{
  const absa = buildVerdicts({ net: 0, chosen: { id: 'absaPremium', name: 'Absa Premium', gainIfSwitch: 2000 } }, {});
  assert.ok(/Absa Premium's figures are not confirmed/.test(absa.bank.why), absa.bank.why);
  const guess = buildVerdicts({ net: 0, chosen: { id: 'fnbPremier', name: 'FNB Fusion Premier', gainIfSwitch: -5000, guess: true } }, {});
  assert.ok(/not confirmed/.test(guess.bank.why), 'a guessed rewards rate is not confirmed either');
  /* any rival whose figures rates.js marks confirmed (the list changes) */
  const { ALTERNATIVES, altConfirmed } = require('../src/rates');
  const ok = ALTERNATIVES.find(a => altConfirmed(a));
  if (ok) {
    const sure = buildVerdicts({ net: 0, chosen: { id: ok.id, name: ok.name, gainIfSwitch: 2000 } }, {});
    assert.ok(!/not confirmed/.test(sure.bank.why), sure.bank.why);
  }
  const u = buildVerdicts(null, { health: cmp([row(3000, { unconfirmed: true })]) });
  assert.ok(/Scheme Plan's price is not confirmed/.test(u.health.why), u.health.why);
  const uq = buildVerdicts(null, { gap: cmp([row(3000, { unconfirmed: true, quoted: true })]) });
  assert.ok(!/not confirmed/.test(uq.gap.why), 'your own quote needs no caveat');
}

// ── not enough data: too few months, or an answer resting on one or two payments ──
{
  const lines = [
    { key: 'miles.card', group: 'bank', label: 'Miles on card spend', annual: 800 },
    { key: 'travel.bank', group: 'bank', label: 'Flight discount from the bank', annual: 6000 },
    { key: 'fee.account', group: 'cost', label: 'Monthly account fee', annual: 1380 },
    { key: 'travel.health', group: 'stays', label: 'Flight discount from Vitality Health', annual: 4000 },
    { key: 'fuel.drive', group: 'stays', label: 'Vitality Drive fuel', annual: 3000 },
  ];
  const stOf = (gain, confidence) => ({ net: 0, lines, confidence, chosen: { id: 'sbPrestige', name: 'Other Bank', gainIfSwitch: gain } });
  // thin: fewer than six months of Discovery data
  let t = buildVerdicts(stOf(-25000, { months: 1, thin: true, extrapolated: [], notes: [] }), {});
  assert.strictEqual(t.bank.word, 'Not enough data');
  assert.strictEqual(t.bank.tone, 'unknown');
  assert.strictEqual(t.bank.amount, null);
  assert.ok(/Only one month of Discovery Bank statements/.test(t.bank.why), t.bank.why);
  assert.ok(/Only 4 months/.test(buildVerdicts(stOf(3000, { months: 4, thin: true, extrapolated: [] }), {}).bank.why));
  // the answer flips without the line made from one booking: not enough data
  t = buildVerdicts(stOf(-2000, { months: 12, thin: false, extrapolated: ['travel.bank'], notes: [] }), {});
  assert.strictEqual(t.bank.word, 'Not enough data');
  assert.ok(/flight discount from the bank, worked out from one or two payments/.test(t.bank.why), t.bank.why);
  // it holds without it: the verdict stands
  t = buildVerdicts(stOf(-9000, { months: 12, thin: false, extrapolated: ['travel.bank'], notes: [] }), {});
  assert.strictEqual(t.bank.word, 'Comes out ahead');
  // a line not in the bank's figures does not touch the bank
  t = buildVerdicts(stOf(-2000, { months: 12, thin: false, extrapolated: ['travel.health'], notes: [] }), {});
  assert.strictEqual(t.bank.word, 'Comes out ahead');
  // no confidence at all (older statements): as before
  assert.strictEqual(buildVerdicts(stOf(-2000, undefined), {}).bank.word, 'Comes out ahead');
  // health: Vitality's flight discount from one booking is what keeps Discovery ahead
  const h = cmp([row(-1500, { scheme: 'Other', plan: 'Plan' }), row(-6000, { discovery: true })]);
  t = buildVerdicts(stOf(-9000, { months: 12, thin: false, extrapolated: ['travel.health'] }), { health: h });
  assert.strictEqual(t.health.word, 'Not enough data');
  assert.ok(/flight discount from Vitality Health/.test(t.health.why), t.health.why);
  t = buildVerdicts(stOf(-9000, { months: 12, thin: false, extrapolated: [] }), { health: h });
  assert.strictEqual(t.health.word, 'Comes out ahead');
  // insure: a typed quote that wins only once Drive fuel from one payment is left out
  const ins = cmp([row(-1000, { name: 'Insurer', quoted: true })]);
  assert.strictEqual(buildVerdicts(stOf(-9000, { months: 12, extrapolated: ['fuel.drive'] }), { insure: ins }).insure.word, 'Not enough data');
  assert.strictEqual(buildVerdicts(stOf(-9000, { months: 12, extrapolated: [] }), { insure: ins }).insure.word, 'Comes out ahead');
}

// ── each product's own months: Health, Gap and Insure read productMonths, not the bank's ──
{
  const conf = productMonths => ({ months: 0, thin: true, extrapolated: [], productMonths });
  const all = { health: cmp([row(3000)]), gap: cmp([row(3000)]), insure: cmp([row(3000, { quoted: true })]), life: { current: { monthly: 800 }, lifeOnly: null, rows: [row(3000, { quoted: true })] } };
  // a Health-only person: no bank months, but a year of debits — the verdicts stand
  let v2 = buildVerdicts({ confidence: conf({ bank: 0, health: 12, gap: 12, insure: 12, life: 0 }) }, all);
  assert.strictEqual(v2.health.word, 'Lower price elsewhere');
  assert.strictEqual(v2.gap.word, 'Lower price elsewhere');
  assert.strictEqual(v2.insure.word, 'Lower price elsewhere');
  // three months of Health debits: not enough
  v2 = buildVerdicts({ confidence: conf({ bank: 0, health: 3, gap: 12, insure: 5, life: 0 }) }, all);
  assert.strictEqual(v2.health.word, 'Not enough data');
  assert.ok(/Only 3 months of Discovery Health debit orders/.test(v2.health.why), v2.health.why);
  assert.strictEqual(v2.insure.word, 'Not enough data');
  assert.strictEqual(v2.gap.word, 'Lower price elsewhere');
  // gap cover inside the Health debit goes by Health's months
  v2 = buildVerdicts({ confidence: conf({ bank: 0, health: 2, gap: 0, insure: 0, life: 0 }) }, { gap: cmp([row(3000)]) });
  assert.strictEqual(v2.gap.word, 'Not enough data');
  // life is compared on the typed share: untouched
  assert.strictEqual(buildVerdicts({ confidence: conf({ bank: 0, health: 0, gap: 0, insure: 0, life: 0 }) }, all).life.word, 'Lower price elsewhere');
  // a line flagged extrapolated on itself counts like the list
  const lines = [{ key: 'travel.bank', group: 'bank', label: 'Flight discount from the bank', annual: 6000, extrapolated: true }];
  assert.strictEqual(buildVerdicts({ net: 0, lines, confidence: { months: 12, thin: false, extrapolated: [] }, chosen: { id: 'sbPrestige', name: 'Other Bank', gainIfSwitch: -2000 } }, {}).bank.word, 'Not enough data');
}

// ── gap cover priced for under 45s: older, or age not given → get quotes ──
{
  const aged = { current: { annual: 13800, monthly: 1150 }, pricedForAge: false, ageNote: 'Rival prices shown are for under 45s.', rows: [row(null, { monthly: 185, ageLimited: true })] };
  const g = buildVerdicts(null, { gap: aged }).gap;
  assert.strictEqual(g.word, 'No price to compare');
  assert.strictEqual(g.tone, 'quote');
  assert.strictEqual(g.amount, null);
  assert.ok(/^Rival prices shown are for under 45s\./.test(g.why), g.why);
  // a quote for your own ages still decides
  const q = buildVerdicts(null, { gap: { ...aged, rows: [row(3000, { quoted: true })] } }).gap;
  assert.strictEqual(q.word, 'Lower price elsewhere');
}
// an unsplit Discovery Health debit gives no firm saving
{
  const { buildVerdicts: bv } = require('../src/verdict');
  const health = { current: { annual: 120000, monthly: 10000 }, vitalityKnown: false, needs: [], rows: [{ scheme: 'Other', plan: 'Plan', monthly: 5000, annual: 60000, gainIfSwitch: 60000, likeForLike: true }] };
  const vh = bv({ lines: [], alternatives: [], chosen: null, bill: { priceStale: false } }, { health }, { health: true });
  assert.strictEqual(vh.health.word, 'No price to compare');
  assert.strictEqual(vh.health.amount, null);
}

// ── round 2 (lane H2) ─────────────────────────────────────────────────
{
  // B5: "rewards worth more than its fees" only when they are; nothing against nothing says so
  const zero = buildVerdicts({ net: 0, chosen: { id: 'x', name: 'Other Bank', gainIfSwitch: -MATERIAL - 100 } }, {});
  assert.strictEqual(zero.bank.word, 'Comes out ahead');
  assert.ok(!/worth more than its fees/.test(zero.bank.why) && /about the same/.test(zero.bank.why), zero.bank.why);
  assert.ok(/worth more than its fees/.test(buildVerdicts({ net: 300, chosen: { id: 'x', name: 'Other Bank', gainIfSwitch: -2000 } }, {}).bank.why));
  assert.ok(/fees cost more/.test(buildVerdicts({ net: -300, chosen: { id: 'x', name: 'Other Bank', gainIfSwitch: -2000 } }, {}).bank.why));
  // B8: "Check first" only on a saving verdict, never on "Get quotes"
  const needs = { needs: [{ id: 'hospital', label: 'Your hospital' }], vitalityKnown: false };
  const gq = buildVerdicts({ bill: { priceStale: false } }, { health: cmp([row(5000, { likeForLike: true, unsure: ['hospital'] })], needs) });
  assert.strictEqual(gq.health.word, 'No price to compare');
  assert.ok(!/Not confirmed for that plan/.test(gq.health.why), gq.health.why);
  // B3: a product whose payments stopped: "Ended", no figure, says when
  const e = buildVerdicts({ confidence: { ended: { health: '2026-02-02' }, productMonths: { health: 4 } } }, { health: cmp([row(5000)]) }, { health: true });
  assert.deepStrictEqual([e.health.word, e.health.tone, e.health.amount, e.health.ended], ['Ended', 'unknown', null, true]);
  assert.ok(/2 Feb 2026/.test(e.health.why) && /Inputs tab/.test(e.health.why), e.health.why);
  assert.strictEqual(buildVerdicts({ confidence: { ended: { health: '2026-02-02' } } }, {}, { health: false }).health, undefined, 'switched off: no verdict');
  // B1 with opts.now: other medical aids' prices out of date → "Get quotes", as Compare
  const { PERIODS } = require('../src/market');
  const rows = [row(5000, { id: 'rival' }), row(-3000, { id: 'dh', discovery: true })];
  const fresh = buildVerdicts({}, { health: cmp(rows) }, { health: true }, { now: PERIODS.schemes.from });
  assert.strictEqual(fresh.health.word, 'Lower price elsewhere');
  const old = buildVerdicts({}, { health: cmp([row(5000, { id: 'rival' })]) }, { health: true }, { now: PERIODS.schemes.changes });
  assert.strictEqual(old.health.word, 'No price to compare');
  assert.ok(/out of date/.test(old.health.why), old.health.why);
  const typed = buildVerdicts({}, { health: cmp([row(5000, { id: 'rival', quoted: true })]) }, { health: true }, { now: PERIODS.schemes.changes });
  assert.strictEqual(typed.health.word, 'Lower price elsewhere', 'a typed quote is current');
}
console.log('verdict: ok');
