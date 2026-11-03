'use strict';
const assert = require('node:assert');
const { MARKET, PERIODS, marketAge, priceValidFor, addMonths, monthsBetween } = require('../src/market');
const { rate, RATES, SUITES, SUITE_TABLES, suiteOf, bandTable, DIAMOND, BANDS, bandPct, ALTERNATIVES, BANK_PRODUCTS, BANK_KINDS, bankProductOf } = require('../src/rates');
const { STATUSES } = require('../src/constants');

// ── MARKET: dated, due for review within six months and before the first price change ──
const ISO = /^\d{4}-\d{2}-\d{2}$/;
assert.ok(ISO.test(MARKET.asOf) && ISO.test(MARKET.reviewBy), 'dates are YYYY-MM-DD');
assert.ok(MARKET.reviewBy <= addMonths(MARKET.asOf, 6), 'reviewBy is no more than six months after asOf');
assert.strictEqual(MARKET.reviewBy, '2026-12-31', 'the day before the other schemes\' 2027 prices');
const firstChange = Object.values(PERIODS).map(p => p.changes).filter(Boolean).sort()[0];
assert.ok(MARKET.reviewBy < firstChange, 'reviewBy falls before the first known price change');
// each table's price period
assert.deepStrictEqual([PERIODS.discoveryHealth.from, PERIODS.discoveryHealth.to, PERIODS.discoveryHealth.changes], ['2026-04-01', '2027-03-31', '2027-04-01']);
assert.deepStrictEqual([PERIODS.schemes.from, PERIODS.schemes.to, PERIODS.schemes.changes], ['2026-01-01', '2026-12-31', '2027-01-01']);
assert.strictEqual(PERIODS.bankFees.from, '2026-09-01');
assert.strictEqual(PERIODS.rewards.from, '2026-11-01');
for (const [k, p] of Object.entries(PERIODS)) assert.ok(p.label && ISO.test(p.from) && (p.to === null || ISO.test(p.to)), k);
assert.strictEqual(priceValidFor('discoveryHealth', '2027-03'), true);
assert.strictEqual(priceValidFor('discoveryHealth', '2027-04-01'), false);
assert.strictEqual(priceValidFor('schemes', '2027-01'), false);
assert.strictEqual(priceValidFor('bankFees', '2030-01'), true, 'no end published');
assert.strictEqual(priceValidFor('rewards', '2026-10'), false, 'before the rewards guide');
assert.strictEqual(priceValidFor('nonsense', '2026-10'), false);
assert.ok(typeof MARKET.note === 'string' && MARKET.note.length > 20, 'a note says what the data covers');
assert.strictEqual(addMonths('2026-08-31', 6), '2027-02-28', 'the day clamps to the month');
assert.strictEqual(monthsBetween('2026-11-03', '2027-02-02'), 2, 'not yet three whole months');
assert.strictEqual(monthsBetween('2026-11-03', '2027-02-03'), 3);
assert.strictEqual(monthsBetween('2026-11-03', '2026-01-01'), 0, 'never negative');

// ── marketAge: stale only after reviewBy ──────────────────────────────
const m = { asOf: '2026-11-03', reviewBy: '2027-05-03' };
let a = marketAge('2026-12-15', m);
assert.deepStrictEqual(a, { asOf: '2026-11-03', reviewBy: '2027-05-03', staleFrom: '2027-05-04', staleWhy: 'It is time to check the published prices again.', months: 1, stale: false });
assert.strictEqual(marketAge('2027-05-03', m).stale, false, 'on reviewBy itself it is still fresh');
a = marketAge('2027-05-04', m);
assert.strictEqual(a.stale, true, 'the day after reviewBy it is stale');
assert.strictEqual(a.months, 6);
assert.strictEqual(marketAge(new Date(2027, 7, 1), m).stale, true, 'takes a Date too');
assert.strictEqual(marketAge(new Date(2026, 10, 10), m).stale, false);
assert.strictEqual(marketAge(MARKET.asOf).stale, false, 'the shipped data is fresh on its own date');
assert.strictEqual(typeof marketAge().stale, 'boolean', 'defaults to today');
// a known price change makes the data stale before reviewBy
{
  const withChange = { asOf: '2026-11-03', reviewBy: '2027-05-03', periods: { dh: { label: 'Discovery Health contributions', from: '2026-04-01', to: '2027-03-31', changes: '2027-04-01' } } };
  assert.strictEqual(marketAge('2027-03-31', withChange).stale, false);
  const s1 = marketAge('2027-04-01', withChange);
  assert.strictEqual(s1.stale, true, 'stale on the day the new prices start');
  assert.strictEqual(s1.staleFrom, '2027-04-01');
  assert.strictEqual(s1.staleWhy, 'Discovery Health contributions change on 1 Apr 2027.');
}
// the shipped data: fresh through 2026, stale from 1 Jan 2027 (the other schemes' new prices)
assert.strictEqual(marketAge('2026-12-31').stale, false);
const shipped = marketAge('2027-01-01');
assert.strictEqual(shipped.stale, true);
assert.strictEqual(shipped.staleFrom, '2027-01-01');
assert.ok(/medical aids' contributions change on 1 Jan 2027/.test(shipped.staleWhy), shipped.staleWhy);

// ── SUITES ───────────────────────────────────────────────────────────
assert.deepStrictEqual(SUITES.map(s => s.id), ['Gold', 'Platinum', 'Black', 'Purple']);
for (const s of SUITES) {
  assert.ok(s.label.endsWith('Suite') && s.source, `${s.id} labelled and sourced`);
  assert.strictEqual(s.fee, s.feeParts.account + s.feeParts.vitalityMoney + s.feeParts.credit, `${s.id} fee adds up`);
  for (const st of STATUSES) assert.ok(s.baseMiles[st] > 0, `${s.id} base Miles at ${st}`);
  if (s.creditCard) assert.strictEqual(s.creditCard.fee, s.creditCard.feeParts.account + s.creditCard.feeParts.vitalityMoney + s.creditCard.feeParts.credit, `${s.id} credit card fee adds up`);
  for (const k of s.unconfirmed || []) assert.ok(RATES[k] && s.unconfirmedWhy, `${s.id}: unconfirmed ${k} says why`);
}
assert.strictEqual(suiteOf({ suite: 'Gold' }).id, 'Gold');
assert.strictEqual(suiteOf({ suite: 'Platinum Suite' }).id, 'Platinum', 'accepts the label');
assert.strictEqual(suiteOf({}).id, 'Black', 'unset → Black');
assert.strictEqual(suiteOf({ suite: 'Titanium' }).id, 'Black', 'unknown → Black');
assert.strictEqual(suiteOf('purple').id, 'Purple');

// ── every status of every Suite has a full band table ─────────────────
for (const [suite, tables] of Object.entries(SUITE_TABLES)) {
  for (const [band, tbl] of Object.entries(tables)) {
    if (tbl === null) continue;
    assert.ok(tbl.source && /effective 1 Nov 2026/.test(tbl.source), `${suite}.${band} sourced`);
    for (const st of STATUSES) {
      assert.strictEqual(tbl[st].length, tbl.bands.length, `${suite}.${band}.${st} has one figure per band`);
      for (let i = 1; i < tbl[st].length; i++) assert.ok(tbl[st][i] >= tbl[st][i - 1], `${suite}.${band}.${st} never drops as spend grows`);
    }
    for (let i = 0; i < tbl.bands.length; i++) assert.ok(tbl.Diamond[i] >= tbl.Blue[i], `${suite}.${band}: Diamond at least Blue`);
  }
}

// ── rate(): picks by Suite and status ────────────────────────────────
const R = (suite, key, money, spend) => rate({ rates: {}, suite }, key, { money }, { spend });
// Black, as before (old callers pass no suite)
assert.strictEqual(rate({ rates: {} }, 'fuelMoneyPct', { money: 'Diamond' }, { spend: 30000 }), 15);
assert.strictEqual(bandPct(BANDS, DIAMOND.healthyFood, 3150), 7.5, 'old DIAMOND export unchanged');
// every status now has a figure (was 0 below Diamond)
assert.strictEqual(R('Black', 'fuelMoneyPct', 'Gold', 30000), 11);
assert.strictEqual(R('Black', 'fuelMoneyPct', 'Blue', 4000), 3);
assert.strictEqual(R('Black', 'healthyFoodMoneyPct', 'Silver', 20000), 10.5);
assert.strictEqual(R('Black', 'healthyCareMoneyPct', 'Bronze', 12050), 6);
assert.strictEqual(R('Black', 'travelMoneyPct', 'Gold', 47000), 35);
assert.strictEqual(R('Black', 'ccTravelMoneyPct', 'Silver', 35000), 16.5);
assert.strictEqual(R('Black', 'fuelMoneyPct', 'Diamond', 3149), 0, 'below the first band');
// Gold: its own, shorter steps
assert.strictEqual(R('Gold', 'healthyFoodMoneyPct', 'Diamond', 30000), 15, 'Gold tops out at 15%');
assert.strictEqual(R('Gold', 'fuelMoneyPct', 'Diamond', 30000), 10);
assert.strictEqual(R('Gold', 'travelMoneyPct', 'Silver', 9000), 11);
assert.strictEqual(R('Gold', 'milesRandPerMile', 'Diamond'), 20);
assert.strictEqual(R('Gold', 'milesThreshold'), 10000);
assert.strictEqual(R('Gold', 'ccFee'), 125);
// Platinum
assert.strictEqual(R('Platinum', 'travelMoneyPct', 'Diamond', 50000), 35);
assert.strictEqual(R('Platinum', 'ccTravelMoneyPct', 'Diamond', 50000), 25);
assert.strictEqual(R('Platinum', 'fuelMoneyPct', 'Gold', 16000), 7.5);
assert.strictEqual(R('Platinum', 'milesRandPerMile', 'Diamond'), 15);
assert.strictEqual(R('Platinum', 'ccMilesRandPerMile', 'Diamond'), 20);
assert.strictEqual(R('Platinum', 'milesThreshold'), 15000);
assert.strictEqual(R('Platinum', 'ccFee'), 180);
// Purple: wide steps, up to 50% HealthyFood, no Credit Card Account
assert.strictEqual(R('Purple', 'healthyFoodMoneyPct', 'Diamond', 47000), 50);
assert.strictEqual(R('Purple', 'healthyFoodMoneyPct', 'Blue', 10000), 7);
assert.strictEqual(R('Purple', 'healthyCareMoneyPct', 'Gold', 29000), 18.5);
assert.strictEqual(R('Purple', 'fuelMoneyPct', 'Silver', 25000), 7.5);
assert.strictEqual(R('Purple', 'milesThreshold'), 30000);
assert.strictEqual(bandTable('Purple', 'ccFlightsLocal'), null);
assert.strictEqual(R('Purple', 'ccTravelMoneyPct', 'Diamond', 50000), 0, 'no Credit Card Account');
assert.strictEqual(suiteOf('Purple').creditCard, null);
// the same figure on every Suite stays the same
for (const s of SUITES) assert.strictEqual(R(s.id, 'milesAboveThreshold'), 100);
// ctx.suite beats settings.suite; a typed figure beats both
assert.strictEqual(rate({ rates: {}, suite: 'Black' }, 'ccFee', {}, { suite: 'Gold' }), 125);
assert.strictEqual(rate({ rates: { ccFee: '99' }, suite: 'Gold' }, 'ccFee', {}), 99);
// status missing or unknown (an older build's "Platinum"): read as Blue, never a silent 0 (rt3 item 8)
assert.strictEqual(R('Gold', 'fuelMoneyPct', undefined, 30000), R('Gold', 'fuelMoneyPct', 'Blue', 30000));
assert.ok(R('Gold', 'fuelMoneyPct', 'Blue', 30000) > 0, 'Blue earns something here, so the test can tell');
assert.strictEqual(R('Gold', 'fuelMoneyPct', 'Platinum', 30000), R('Gold', 'fuelMoneyPct', 'Blue', 30000));
assert.strictEqual(rate({ rates: {} }, 'milesRandPerMile', { money: 'Platinum' }), 65, 'Platinum is no status: Blue, one Mile per R65');
assert.strictEqual(rate({ rates: {} }, 'milesRandPerMile', { money: ' gold ' }), 30, 'case and spaces do not matter');
{
  const { statusIssues, normStatus } = require('../src/rates');
  assert.strictEqual(normStatus('Platinum'), 'Blue');
  assert.strictEqual(normStatus('diamond'), 'Diamond');
  const si = statusIssues({ status: { money: 'Platinum', health: 'Gold', drive: '' } });
  assert.deepStrictEqual(si.statusUnknown, ['money'], 'only the status we do not know; a blank one is just unanswered');
  assert.deepStrictEqual(si.saved, { money: 'Platinum' });
  assert.strictEqual(si.length, 1, 'a list of notes the page can show');
  assert.deepStrictEqual({ key: si[0].key, saved: si[0].saved, used: si[0].used }, { key: 'money', saved: 'Platinum', used: 'Blue' });
  assert.ok(/bank score \(Vitality Money status\)/.test(si[0].text) && /counted as Blue/.test(si[0].text), si[0].text);
  assert.deepStrictEqual(statusIssues({ status: { money: 'Gold', health: 'blue', drive: 'Silver' } }).statusUnknown, []);
  assert.deepStrictEqual(statusIssues(null).statusUnknown, []);
  assert.strictEqual(statusIssues(null).length, 0);
}

// ── Vitality Health, Drive and Miles figures: what decides each one ───
const H = (key, health, met) => rate({ rates: {} }, key, { money: 'Diamond', health, drive: 'Blue' }, { met });
// HealthyFood, HealthyCare, flights and the gym do not change with the Vitality Health status
for (const key of ['healthyFoodHealthPct', 'healthyFoodSecondaryPct', 'healthyCareHealthPct', 'travelHealthPct', 'gymDiscountPct', 'activeRewardsWithoutBank']) {
  const at = STATUSES.map(st => H(key, st));
  assert.ok(at.every(v => v === at[0]), `${key}: the same at every Vitality Health status`);
  assert.ok(!RATES[key].byStatus && !RATES[key].on, `${key}: not keyed on a status`);
}
// the lower figure until the person says otherwise (the health checks, 36 workouts)
assert.strictEqual(H('healthyFoodHealthPct', 'Diamond'), 10, 'HealthyFood: 10% before both health checks');
assert.strictEqual(H('healthyFoodHealthPct', 'Blue', { assessed: true }), 25, 'HealthyFood: 25% after both');
assert.strictEqual(H('healthyFoodSecondaryPct', 'Diamond'), 0, 'the other shop: nothing before the checks');
assert.strictEqual(H('healthyFoodSecondaryPct', 'Blue', { assessed: true }), 10);
assert.strictEqual(H('healthyCareHealthPct', 'Gold'), 10);
assert.strictEqual(H('healthyCareHealthPct', 'Gold', { oneAssessment: true }), 15, 'HealthyCare: 15% after one check');
assert.strictEqual(H('healthyCareHealthPct', 'Gold', { assessed: true, oneAssessment: true }), 25, 'both checks beat one');
assert.strictEqual(H('travelHealthPct', 'Silver'), 10, 'flights: 10% straight away');
assert.strictEqual(H('travelHealthPct', 'Silver', { assessed: true }), 25);
assert.strictEqual(H('gymDiscountPct', 'Diamond'), 50, 'gym: 50% unless 36 workouts');
assert.strictEqual(H('gymDiscountPct', 'Blue', { gym36: true }), 75);
assert.strictEqual(H('activeRewardsWithoutBank', 'Diamond'), 100, 'still a guess');
assert.ok(RATES.activeRewardsWithoutBank.unconfirmed && RATES.activeRewardsWithoutBank.unconfirmedWhy, 'says why it is a guess');
// a typed figure beats a case
assert.strictEqual(rate({ rates: { healthyFoodHealthPct: 18 } }, 'healthyFoodHealthPct', {}, { met: { assessed: true } }), 18);
// every case says what it needs (the question the person would answer)
for (const [k, d] of Object.entries(RATES)) {
  for (const c of d.cases || []) assert.ok(c.when && c.label && (c.value !== undefined || c.byStatus), `${k}.${c.when} is complete`);
}
// Vitality Drive: fuel back by Drive status and plan; the fuel limit by status only with home cover
const Dv = (key, drive, met) => rate({ rates: {} }, key, { money: 'Diamond', health: 'Blue', drive }, { met });
assert.deepStrictEqual(STATUSES.map(st => Dv('fuelDrivePct', st)), [0, 5, 15, 30, 50], 'Classic and Purple plans');
assert.deepStrictEqual(STATUSES.map(st => Dv('fuelDrivePct', st, { essentialPlan: true })), [0, 2.5, 7.5, 15, 25], 'Essential: half');
assert.strictEqual(Dv('fuelDrivePct', 'Diamond', { corePlan: true }), 0, 'Core: no Drive fuel rewards');
assert.deepStrictEqual(STATUSES.map(st => Dv('fuelCap', st)), [1500, 1500, 1500, 1500, 1500], 'no home cover: R1 500 at every status');
assert.deepStrictEqual(STATUSES.map(st => Dv('fuelCap', st, { homeOne: true })), [1500, 1500, 1750, 2000, 2500], 'building or contents');
assert.deepStrictEqual(STATUSES.map(st => Dv('fuelCap', st, { homeBoth: true })), [1500, 2000, 2250, 2500, 3000], 'building and contents');
// Vitality Money status changes only the base Miles rate, not the limit, the rate above it or the plastic card
for (const key of ['milesThreshold', 'milesAboveThreshold', 'milesPhysical']) {
  const at = STATUSES.map(st => R('Black', key, st));
  assert.ok(at.every(v => v === at[0]), `${key}: the same at every Vitality Money status`);
}
assert.deepStrictEqual(STATUSES.map(st => R('Black', 'milesRandPerMile', st)), [65, 50, 40, 30, 15], 'the base rate does change');
// spending Miles: 5% per active Vitality programme, double on Ð-Day
assert.strictEqual(rate({ rates: {} }, 'milesPartnerPct', {}), 5);
assert.strictEqual(rate({ rates: {} }, 'milesDdayPct', {}), 10);
assert.ok(RATES.milesPartnerPct.perProgramme && RATES.milesDdayPct.perProgramme && /per active Vitality programme/.test(RATES.milesPartnerPct.label));
assert.ok(!/Miles\+/.test(RATES.milesPartnerPct.label + RATES.milesDdayPct.label + RATES.milesPartnerPct.source), 'Miles+ is where you earn, not spend');
// new source codes read as plain sentences with the document after
const { sourceText } = require('../src/rates');
for (const k of ['healthyFoodHealthPct', 'healthyCareHealthPct', 'gymDiscountPct', 'fuelCap', 'milesPartnerPct', 'travelHealthPct']) {
  assert.ok(/ Source: .*20\d\d/.test(sourceText(RATES[k].source)), `${k}: ${sourceText(RATES[k].source)}`);
}
assert.ok(/^Your own guess\. Without .* Source: Vitality Active Rewards/.test(sourceText(RATES.activeRewardsWithoutBank.source)), 'a guess says so first');

// ── bank products: tier × kind ───────────────────────────────────────
assert.deepStrictEqual(BANK_KINDS, ['suite', 'card', 'transaction', 'savings']);
for (const p of BANK_PRODUCTS) {
  assert.strictEqual(p.total, p.accountFee + p.vitalityMoneyFee + p.creditFee, `${p.id} total adds up`);
  assert.ok(p.label && /1 Sep 2026/.test(p.source), `${p.id} labelled and sourced`);
  assert.strictEqual(p.payt, p.fees === 'payt');
}
assert.strictEqual(new Set(BANK_PRODUCTS.map(p => p.id)).size, BANK_PRODUCTS.length, 'unique product ids');
assert.strictEqual(new Set(BANK_PRODUCTS.map(p => p.accountFee)).size, BANK_PRODUCTS.length, 'every "Monthly account fee" points at one product');
for (const s of SUITES) {
  const p = bankProductOf({ suite: s.id });
  assert.strictEqual(p.kind, 'suite', `${s.id}: no bankKind = the Suite`);
  assert.strictEqual(p.total, s.fee, `${s.id}: Suite product and SUITES agree on the fee`);
  if (s.creditCard) assert.strictEqual(bankProductOf({ suite: s.id, bankKind: 'card' }).total, s.creditCard.fee, `${s.id}: card fee agrees`);
}
assert.strictEqual(bankProductOf({ suite: 'Black', bankKind: 'card' }).accountFee, 140);
assert.strictEqual(bankProductOf({ suite: 'Black', bankKind: 'transaction' }).id, 'Black.transaction', 'bundled fees unless told');
assert.strictEqual(bankProductOf({ suite: 'Black', bankKind: 'transaction', bankFees: 'payt' }).accountFee, 80);
assert.strictEqual(bankProductOf({ suite: 'Gold', bankKind: 'transaction', bankFees: 'payt' }).payt, true);
assert.strictEqual(bankProductOf({ suite: 'Purple', bankKind: 'card' }).id, 'Purple.suite', 'Purple has only the Suite');
assert.strictEqual(bankProductOf({ suite: 'Gold', bankKind: 'savings' }).kind, 'savings');
assert.strictEqual(bankProductOf({ bankKind: 'nonsense' }).id, 'Black.suite');

const K = (suite, bankKind, key, money, spend, bankFees) => rate({ rates: {}, suite, bankKind, bankFees }, key, { money }, { spend });
// the Credit Card Account earns fewer Miles and the smaller flight discount
assert.strictEqual(K('Black', 'card', 'milesRandPerMile', 'Diamond'), 20);
assert.strictEqual(K('Black', 'card', 'travelMoneyPct', 'Diamond', 50000), 35);
assert.strictEqual(K('Black', 'card', 'healthyFoodMoneyPct', 'Diamond', 30000), 25, 'HealthyFood is the same as the Suite');
assert.strictEqual(K('Gold', 'card', 'healthyCareMoneyPct', 'Diamond', 20000), 0, 'Gold card: no HealthyCare from the bank');
assert.strictEqual(K('Gold', 'card', 'healthyFoodMoneyPct', 'Diamond', 20000), 15);
// a transaction account: the Suite's flights, no HealthyFood or fuel from the bank
assert.strictEqual(K('Black', 'transaction', 'travelMoneyPct', 'Diamond', 50000), 50);
assert.strictEqual(K('Black', 'transaction', 'fuelMoneyPct', 'Diamond', 30000), 0);
assert.strictEqual(K('Black', 'transaction', 'healthyFoodMoneyPct', 'Diamond', 30000), 0);
assert.strictEqual(K('Platinum', 'transaction', 'milesRandPerMile', 'Gold'), 40);
// pay-as-you-transact and savings only: no base Miles at all
for (const [suite, kind, fees] of [['Black', 'transaction', 'payt'], ['Gold', 'savings', null]]) {
  for (const k of ['milesRandPerMile', 'milesAboveThreshold', 'milesPhysical', 'milesThreshold']) assert.strictEqual(K(suite, kind, k, 'Diamond', 0, fees), 0, `${suite} ${kind} ${k}`);
  assert.strictEqual(K(suite, kind, 'travelMoneyPct', 'Diamond', 50000, fees), 0);
}
// bankKind null: the Suite, exactly as before
assert.strictEqual(K('Black', null, 'milesRandPerMile', 'Diamond'), 15);
assert.strictEqual(K('Black', null, 'travelMoneyPct', 'Diamond', 50000), 50);

// ── every rate and rival bank names where it came from ────────────────
for (const [k, d] of Object.entries(RATES)) assert.ok(typeof d.source === 'string' && d.source.length > 3, `${k} has a source`);
for (const b of ALTERNATIVES) assert.ok(b.source && /20\d\d/.test(b.source), `${b.id} source is dated`);
// ── the rival bank: like-for-like by the kind of Discovery Bank product (rt3 item 7) ──
{
  const { chooseAlternative, altConfirmed, altKinds } = require('../src/rates');
  const sb = ALTERNATIVES.find(a => a.id === 'sbPrestige');
  assert.strictEqual(sb.unconfirmed, true, 'its note says not confirmed, so it is marked');
  assert.strictEqual(altConfirmed(sb), false);
  for (const a of ALTERNATIVES) for (const k of altKinds(a)) assert.ok(BANK_KINDS.includes(k), `${a.id} kind ${k}`);
  for (const k of BANK_KINDS) assert.ok(ALTERNATIVES.some(a => altKinds(a).includes(k)), `some bank stands in for ${k}`);
  // model.js results: highest net first, so GoTyme (no fees, no card) would always win on net
  const res = ALTERNATIVES.map(a => ({ id: a.id, name: a.name, net: a.id === 'gotyme' ? 0 : a.id === 'capitec' ? -700 : a.id === 'sbPrestige' ? -3400 : -3000 }));
  assert.strictEqual(chooseAlternative(res, '', { bankKind: 'transaction' }).id, 'gotyme', 'a Transaction Account is weighed against an account with no card');
  assert.strictEqual(chooseAlternative(res, '', { bankKind: 'savings' }).id, 'gotyme');
  for (const k of ['suite', 'card']) {
    const c = chooseAlternative(res, '', { bankKind: k });
    assert.ok(altKinds(c).includes(k) && c.id !== 'gotyme', `${k}: a bank with a credit card, got ${c.id}`);
    assert.strictEqual(c.id, 'capitec', 'published (not a guess) beats a guess; then the highest net');
  }
  assert.strictEqual(chooseAlternative(res, '').id, 'capitec', 'the two-argument call still means a Suite');
  assert.strictEqual(chooseAlternative(res, 'absaPremium', { bankKind: 'transaction' }).id, 'absaPremium', 'your own pick wins');
  assert.strictEqual(chooseAlternative(res, 'gone', { bankKind: 'transaction' }).id, 'gotyme', 'a pick that is gone falls back');
  assert.strictEqual(chooseAlternative([], ''), null);
  // a confirmed like-for-like bank beats a cheaper unconfirmed one
  const withSure = res.concat([{ id: 'sureBank', name: 'Sure Bank', net: -5000, kinds: ['suite', 'card'] }]);
  assert.strictEqual(chooseAlternative(withSure, '', { bankKind: 'suite' }).id, 'sureBank');
}
{
  const C = require('../src/compare');
  for (const name of ['HEALTH_PLANS', 'HEALTH_OWN', 'GAP_PLANS', 'INSURERS', 'LIFE_OFFERS', 'HOME_INSURERS']) {
    for (const r of C[name]) assert.ok(/20\d\d/.test(r.source || ''), `${name} ${r.id}: source names a date`);
  }
  assert.ok(/20\d\d/.test(C.LIFE_BENCHMARK.source) && /20\d\d/.test(C.HOME_RANGE.source), 'ranges are dated');
}

// settings.conditions reach every rate() caller without ctx.met
{
  const { rate: rr, metOf } = require('../src/rates');
  const st = { money: 'Gold', health: 'Silver', drive: 'Gold' };
  assert.deepStrictEqual(Object.values(metOf({})).filter(Boolean), [], 'unanswered meets nothing');
  assert.strictEqual(rr({ conditions: { checks: 'both' } }, 'healthyFoodHealthPct', st), 25);
  assert.strictEqual(rr({}, 'healthyFoodHealthPct', st), 10);
  assert.strictEqual(rr({ conditions: { checks: 'one' } }, 'healthyCareHealthPct', st), 15);
  assert.strictEqual(rr({ conditions: { gym36: true } }, 'gymDiscountPct', st), 75);
  assert.strictEqual(rr({ conditions: { insurePlan: 'essential' } }, 'fuelDrivePct', st), 15);
  assert.strictEqual(rr({ conditions: { homeCover: 'both' } }, 'fuelCap', st), 2500);
  assert.strictEqual(rr({ conditions: { checks: 'both' }, rates: { healthyFoodHealthPct: 12 } }, 'healthyFoodHealthPct', st), 12, 'a typed figure still wins');
}
console.log('market: ok');
