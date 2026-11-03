'use strict';
/* detect.js: which Discovery products a budget shows, which the person
   says they have, and which medical aid plan the debit order points at.
   Made-up household only (Sometown, Sam). */
const assert = require('node:assert');

const { detectProducts, resolveProducts, detectBanking, resolveVitality, guessHealthPlan } = require('../src/detect');

const row = (date, description, amount, account, extra) => Object.assign({ date, description, category: '', amount, excluded: false, note: '', split: '', account }, extra);

const DISC = { institution: 'Discovery Bank', type: 'checking' };
const OTHER = { institution: 'Sometown Savings Bank', type: 'checking' };

/* A household with everything. */
const full = {
  accounts: { 'Sometown Cheque': DISC, 'Sometown Card': { institution: 'Discovery Bank', type: 'credit_card' }, 'Sam Everyday': OTHER },
  categories: {},
  rows: [
    row('2026-08-01', 'DISC PREM 1234', -3200, 'Sam Everyday'),
    row('2026-09-01', 'DISC PREM 1234', -3200, 'Sam Everyday'),
    row('2026-10-01', 'DISC PREM 1234', -3300, 'Sam Everyday'),
    row('2026-10-01', 'DISC MEMB REFUND', 150, 'Sam Everyday'),
    row('2026-09-03', 'INSGAP 5678', -457, 'Sam Everyday'),
    row('2026-09-20', 'INSGAPCLA 5678', 900, 'Sam Everyday'),
    row('2026-10-03', 'INSGAP 5678', -457, 'Sam Everyday'),
    row('2026-10-05', 'DISCINSURE 9012', -1100, 'Sam Everyday'),
    row('2026-10-09', 'DISC LIFE 3456', -640, 'Sam Everyday'),
    row('2026-10-12', 'WOOLWORTHS SOMETOWN', -250, 'Sometown Card'),
    row('2026-10-14', 'MONTHLY ACCOUNT FEE', -69, 'Sometown Cheque'),
  ],
};

const d = detectProducts(full);
assert.deepStrictEqual(Object.keys(d).sort(), ['bank', 'gap', 'health', 'insure', 'life']);

// bank: found from the account notes, names the accounts, last = latest row on them
assert.strictEqual(d.bank.found, true);
assert.strictEqual(d.bank.count, 2);
assert.strictEqual(d.bank.last, '2026-10-14');
assert.ok(/Sometown Cheque and Sometown Card/.test(d.bank.why), d.bank.why);
assert.strictEqual(d.bank.evidence[0].description, 'MONTHLY ACCOUNT FEE');
assert.ok(d.bank.evidence.every(e => e.account !== 'Sam Everyday'));

// health: three premium debits, the refund is not a debit order
assert.strictEqual(d.health.found, true);
assert.strictEqual(d.health.count, 3);
assert.strictEqual(d.health.last, '2026-10-01');
assert.ok(d.health.why.includes('Found 3 Discovery Health debit orders, the last on 1 Oct 2026.'), d.health.why);
assert.strictEqual(d.health.evidence.length, 3);
assert.ok(d.health.evidence.every(e => e.amount < 0));

// gap: two premiums plus a claim; count is the debit orders
assert.strictEqual(d.gap.found, true);
assert.strictEqual(d.gap.count, 2);
assert.strictEqual(d.gap.last, '2026-10-03');
assert.ok(d.gap.evidence.length <= 3);

// insure and life: one each, singular wording
assert.strictEqual(d.insure.found, true);
assert.strictEqual(d.insure.count, 1);
assert.ok(d.insure.why.includes('Found 1 Discovery Insure debit order, the last on 5 Oct 2026.'), d.insure.why);
assert.strictEqual(d.life.found, true);
assert.ok(d.life.why.includes('9 Oct 2026'), d.life.why);

// nothing Discovery at all
const none = detectProducts({
  accounts: { 'Sam Everyday': OTHER },
  categories: {},
  rows: [row('2026-10-01', 'SOMETOWN MUNICIPALITY', -900, 'Sam Everyday'), row('2026-10-02', 'MONTHLY ACCOUNT FEE', -69, 'Sam Everyday')],
});
for (const id of ['bank', 'health', 'gap', 'insure', 'life']) {
  assert.strictEqual(none[id].found, false, id);
  assert.strictEqual(none[id].count, 0, id);
  assert.strictEqual(none[id].last, null, id);
  assert.deepStrictEqual(none[id].evidence, [], id);
  assert.ok(none[id].why.length > 10 && !/Found/.test(none[id].why), id + ': ' + none[id].why);
}

// another bank's MONTHLY ACCOUNT FEE is not evidence of Discovery Bank
assert.strictEqual(none.bank.found, false);
assert.ok(/None of your budget accounts/.test(none.bank.why));

// a returned premium (money in) alone is not proof of a debit order
const refundOnly = detectProducts({ accounts: {}, categories: {}, rows: [row('2026-10-01', 'DISC PREM 1234', 3200, 'X')] });
assert.strictEqual(refundOnly.health.found, false);

// a gap claim alone still shows gap cover, and says there are no debit orders
const claimOnly = detectProducts({ accounts: {}, categories: {}, rows: [row('2026-09-20', 'INSGAPCLA 5678', 900, 'X')] });
assert.strictEqual(claimOnly.gap.found, true);
assert.strictEqual(claimOnly.gap.count, 1);
assert.ok(/no debit orders/.test(claimOnly.gap.why), claimOnly.gap.why);

// a split parent is the original of rows listed beside it: never counted
const split = detectProducts({ accounts: {}, categories: {}, rows: [row('2026-10-01', 'DISC PREM 1', -3000, 'X', { split: 'parent' })] });
assert.strictEqual(split.health.found, false);

// opts.since drops old rows
const recent = detectProducts(full, { since: '2026-10-01' });
assert.strictEqual(recent.health.count, 1);
assert.strictEqual(recent.gap.count, 1);

// empty / missing budget does not throw
assert.strictEqual(detectProducts({ rows: [], accounts: {}, categories: {} }).bank.found, false);
assert.strictEqual(detectProducts(null).health.found, false);

// ---- resolveProducts ----
const det = { bank: { found: true }, health: { found: true }, gap: { found: false }, insure: { found: false }, life: { found: true } };
assert.deepStrictEqual(resolveProducts({ products: { bank: null, health: null, gap: null, insure: null, life: null } }, det),
  { bank: true, health: true, gap: false, insure: false, life: true });
// true and false win over what the budget shows
assert.deepStrictEqual(resolveProducts({ products: { bank: false, health: null, gap: true, insure: null, life: false } }, det),
  { bank: false, health: true, gap: true, insure: false, life: false });
assert.deepStrictEqual(resolveProducts({}, det), { bank: true, health: true, gap: false, insure: false, life: true });
assert.deepStrictEqual(resolveProducts({ products: {} }, undefined), { bank: false, health: false, gap: false, insure: false, life: false });

// ---- guessHealthPlan ----
/* Made-up plans, so the cases do not move when the live price table does. */
const PLANS = [
  { id: 'pA', plan: 'Plan A', discovery: true, main: 2000, adult: 2000, child: 2000 },
  { id: 'pB', plan: 'Plan B', discovery: true, main: 2800, adult: 2300, child: 950 },
  { id: 'pC', plan: 'Plan C', discovery: true, main: 3100, adult: 2400, child: 1200 },
];
const one = { adults: 1, children: 0 };
const debit = (amount, date) => ({ accounts: {}, categories: {}, rows: [row(date || '2026-10-01', 'DISC PREM 1234', -amount, 'X')] });
const g1 = guessHealthPlan(debit(2900), one, PLANS);
assert.strictEqual(g1.id, 'pB');
assert.strictEqual(g1.name, 'Plan B');
assert.strictEqual(g1.monthly, 2800);
assert.strictEqual(g1.debit, 2900);
assert.ok(/Plan B/.test(g1.why) && /1 Oct 2026/.test(g1.why), g1.why);
// exactly at the price still fits
assert.strictEqual(guessHealthPlan(debit(3100), one, PLANS).id, 'pC');
// a bigger debit picks the dearest plan that still fits
assert.strictEqual(guessHealthPlan(debit(9000), one, PLANS).id, 'pC');
// the LATEST debit is used, not the biggest or the first
const g2 = guessHealthPlan({ accounts: {}, rows: [row('2026-10-01', 'DISC PREM 1', -2200, 'X'), row('2026-08-01', 'DISC PREM 1', -3200, 'X')] }, one, PLANS);
assert.strictEqual(g2.id, 'pA');
assert.strictEqual(g2.date, '2026-10-01');
// members change the price: 2 adults + 1 child on Plan B = 2800 + 2300 + 950
const g3 = guessHealthPlan(debit(6100), { adults: 2, children: 1 }, PLANS);
assert.strictEqual(g3.id, 'pB');
assert.strictEqual(g3.monthly, 2800 + 2300 + 950);
// a debit under every plan's price: nothing fits
assert.strictEqual(guessHealthPlan(debit(500), one, PLANS), null);
// no debit: null (refunds and other lines do not count)
assert.strictEqual(guessHealthPlan({ accounts: {}, rows: [] }, one, PLANS), null);
assert.strictEqual(guessHealthPlan({ accounts: {}, rows: [row('2026-10-01', 'DISC PREM 1', 3000, 'X'), row('2026-10-02', 'WOOLWORTHS', -3000, 'X')] }, one, PLANS), null);
// a plan with no price for this family is skipped
assert.strictEqual(guessHealthPlan(debit(9000), one, [{ id: 'none', plan: 'Unpriced', discovery: true }, PLANS[0]]).id, 'pA');
// the default list is the live Discovery plans and never throws
guessHealthPlan(debit(9000), one);

// ---- detectBanking ----
const { SUITES } = require('../src/rates');
const suite = id => SUITES.find(x => x.id === id);
const acct = (type, inst) => ({ institution: inst || 'Discovery Bank', type });
const bank = (accounts, rows) => detectBanking({ accounts, categories: {}, rows: rows || [] });

assert.strictEqual(bank({ Cheque: acct('checking'), Card: acct('credit_card') }).kind, 'suite');
assert.strictEqual(bank({ Card: acct('credit_card') }).kind, 'card');
assert.strictEqual(bank({ Cheque: acct('checking') }).kind, 'transaction');
assert.strictEqual(bank({ Pot: acct('savings') }).kind, 'savings');
assert.strictEqual(bank({ Cheque: acct('checking'), Pot: acct('savings') }).kind, 'transaction');
// another bank's accounts say nothing about Discovery
const elsewhere = bank({ Cheque: acct('checking', 'Sometown Savings Bank'), Card: acct('credit_card', 'Sometown Savings Bank') });
assert.strictEqual(elsewhere.kind, null);
assert.strictEqual(elsewhere.tier, null);
assert.strictEqual(elsewhere.vitalityMoney, false);
assert.ok(/No Discovery Bank account/.test(elsewhere.why), elsewhere.why);

// the tier is the Suite whose published fee the budget shows
const feeRows = (s, ym, withVm) => [
  row(ym + '-25', 'MONTHLY ACCOUNT FEE', -s.feeParts.account, 'Cheque'),
  row(ym + '-25', 'FACILITY FEE', -s.feeParts.credit, 'Card'),
  ...(withVm ? [row(ym + '-25', 'VITALITY MONEY PREMIUM', -s.feeParts.vitalityMoney, 'Cheque')] : []),
];
const both = { Cheque: acct('checking'), Card: acct('credit_card') };
for (const id of ['Gold', 'Platinum', 'Black', 'Purple']) {
  const b = bank(both, feeRows(suite(id), '2026-10', true));
  assert.strictEqual(b.tier, id, id + ': ' + b.why);
  assert.strictEqual(b.kind, 'suite');
  assert.strictEqual(b.vitalityMoney, true);
  assert.strictEqual(b.feeSeen, suite(id).fee);
  assert.ok(/Vitality Money/.test(b.why));
}
// without the Vitality Money premium the account fee alone still names the tier
const noVm = bank(both, feeRows(suite('Platinum'), '2026-10', false));
assert.strictEqual(noVm.tier, 'Platinum');
assert.strictEqual(noVm.vitalityMoney, false);
assert.ok(/No Vitality Money premium/.test(noVm.why), noVm.why);
// the LATEST month's fee decides (an upgrade shows)
const upgraded = bank(both, feeRows(suite('Gold'), '2026-06', true).concat(feeRows(suite('Black'), '2026-10', true)));
assert.strictEqual(upgraded.tier, 'Black');
// a fee that fits no tier is left alone, not forced onto the nearest
assert.strictEqual(bank(both, [row('2026-10-25', 'MONTHLY ACCOUNT FEE', -3000, 'Cheque')]).tier, null);
// no fee rows: no tier, kind still read
const bare = bank(both, [row('2026-10-01', 'WOOLWORTHS', -100, 'Card')]);
assert.strictEqual(bare.tier, null);
assert.strictEqual(bare.kind, 'suite');
// a card on its own is read against the card's own fees
const cc = suite('Black').creditCard;
const cardOnly = bank({ Card: acct('credit_card') }, [row('2026-10-25', 'MONTHLY ACCOUNT FEE', -cc.feeParts.account, 'Card'), row('2026-10-25', 'VITALITY MONEY PREMIUM', -cc.feeParts.vitalityMoney, 'Card'), row('2026-10-25', 'FACILITY FEE', -cc.feeParts.credit, 'Card')]);
assert.strictEqual(cardOnly.kind, 'card');
assert.strictEqual(cardOnly.tier, 'Black');
// another bank's monthly account fee is not read as a Discovery fee
const otherFee = detectBanking({ accounts: Object.assign({ Else: acct('checking', 'Sometown Savings Bank') }, both), categories: {}, rows: [row('2026-10-25', 'MONTHLY ACCOUNT FEE', -suite('Gold').feeParts.account, 'Else')] });
assert.strictEqual(otherFee.tier, null);
assert.strictEqual(detectBanking(null).kind, null);

// ---- resolveVitality ----
const noneYet = { vitality: { money: null, health: null, drive: null }, products: { bank: null, health: null, gap: null, insure: null, life: null } };
const detAll = { bank: { found: true }, health: { found: true }, gap: { found: false }, insure: { found: true }, life: { found: false } };
assert.deepStrictEqual(resolveVitality(noneYet, detAll, { vitalityMoney: true }), { money: true, health: true, drive: true });
assert.deepStrictEqual(resolveVitality(noneYet, detAll, { vitalityMoney: false }), { money: false, health: true, drive: true });
assert.deepStrictEqual(resolveVitality(noneYet, { health: { found: false }, insure: { found: false } }, null), { money: false, health: false, drive: false });
// an answer wins over the budget
assert.deepStrictEqual(resolveVitality({ vitality: { money: false, health: false, drive: false } }, detAll, { vitalityMoney: true }), { money: false, health: false, drive: false });
assert.deepStrictEqual(resolveVitality({ vitality: { money: true, health: null, drive: true } }, { health: { found: false }, insure: { found: false } }, { vitalityMoney: false }), { money: true, health: false, drive: true });
// health and drive follow the products you SAID you have
assert.deepStrictEqual(resolveVitality({ products: { health: false, insure: null } }, detAll, { vitalityMoney: false }), { money: false, health: false, drive: true });
assert.deepStrictEqual(resolveVitality(undefined, undefined, undefined), { money: false, health: false, drive: false });

console.log('detect OK');
