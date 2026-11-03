'use strict';
const assert = require('node:assert');
const { MARKET, marketAge, addMonths, monthsBetween } = require('../src/market');
const { rate, RATES, SUITES, SUITE_TABLES, suiteOf, bandTable, DIAMOND, BANDS, bandPct, ALTERNATIVES, BANK_PRODUCTS, BANK_KINDS, bankProductOf } = require('../src/rates');
const { STATUSES } = require('../src/constants');

// ── MARKET: dated, and due for review six months later ────────────────
const ISO = /^\d{4}-\d{2}-\d{2}$/;
assert.ok(ISO.test(MARKET.asOf) && ISO.test(MARKET.reviewBy), 'dates are YYYY-MM-DD');
assert.strictEqual(MARKET.reviewBy, addMonths(MARKET.asOf, 6), 'reviewBy is asOf plus six months');
assert.ok(typeof MARKET.note === 'string' && MARKET.note.length > 20, 'a note says what the data covers');
assert.strictEqual(addMonths('2026-08-31', 6), '2027-02-28', 'the day clamps to the month');
assert.strictEqual(monthsBetween('2026-11-03', '2027-02-02'), 2, 'not yet three whole months');
assert.strictEqual(monthsBetween('2026-11-03', '2027-02-03'), 3);
assert.strictEqual(monthsBetween('2026-11-03', '2026-01-01'), 0, 'never negative');

// ── marketAge: stale only after reviewBy ──────────────────────────────
const m = { asOf: '2026-11-03', reviewBy: '2027-05-03' };
let a = marketAge('2026-12-15', m);
assert.deepStrictEqual(a, { asOf: '2026-11-03', reviewBy: '2027-05-03', months: 1, stale: false });
assert.strictEqual(marketAge('2027-05-03', m).stale, false, 'on reviewBy itself it is still fresh');
a = marketAge('2027-05-04', m);
assert.strictEqual(a.stale, true, 'the day after reviewBy it is stale');
assert.strictEqual(a.months, 6);
assert.strictEqual(marketAge(new Date(2027, 7, 1), m).stale, true, 'takes a Date too');
assert.strictEqual(marketAge(new Date(2026, 10, 10), m).stale, false);
assert.strictEqual(marketAge(MARKET.asOf).stale, false, 'the shipped data is fresh on its own date');
assert.strictEqual(typeof marketAge().stale, 'boolean', 'defaults to today');

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
// status unknown: 0, not a crash
assert.strictEqual(R('Gold', 'fuelMoneyPct', undefined, 30000), 0);

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
{
  const C = require('../src/compare');
  for (const name of ['HEALTH_PLANS', 'HEALTH_OWN', 'GAP_PLANS', 'INSURERS', 'LIFE_OFFERS', 'HOME_INSURERS']) {
    for (const r of C[name]) assert.ok(/20\d\d/.test(r.source || ''), `${name} ${r.id}: source names a date`);
  }
  assert.ok(/20\d\d/.test(C.LIFE_BENCHMARK.source) && /20\d\d/.test(C.HOME_RANGE.source), 'ranges are dated');
}

console.log('market: ok');
