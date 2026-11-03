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
assert.ok(/None of the accounts in your statements/.test(none.bank.why));

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
/* Made-up plans, so the cases do not move when the live price table does.
   One adult may carry up to R1 400 of Vitality and gap cover on the debit
   (EXTRA_CEILING: R600 an adult, R200 a child, R800 gap). */
const { EXTRA_CEILING } = require('../src/detect');
assert.deepStrictEqual(EXTRA_CEILING, { adult: 600, child: 200, gap: 800 });
const PLANS = [
  { id: 'pA', plan: 'Plan A', discovery: true, main: 2000, adult: 2000, child: 2000 },
  { id: 'pB', plan: 'Plan B', discovery: true, main: 5000, adult: 4000, child: 950 },
  { id: 'pC', plan: 'Plan C', discovery: true, main: 9000, adult: 8000, child: 1200 },
];
const CLOSE = [
  { id: 'pA', plan: 'Plan A', discovery: true, main: 2000, adult: 2000, child: 2000 },
  { id: 'pB', plan: 'Plan B', discovery: true, main: 2800, adult: 2300, child: 950 },
  { id: 'pC', plan: 'Plan C', discovery: true, main: 3100, adult: 2400, child: 1200 },
];
const one = { adults: 1, children: 0 };
const debit = (amount, date) => ({ accounts: {}, categories: {}, rows: [row(date || '2026-10-01', 'DISC PREM 1234', -amount, 'X')] });
// exactly one plan fits: picked, with the rest named as Vitality or gap cover
const g1 = guessHealthPlan(debit(5400), one, PLANS);
assert.strictEqual(g1.id, 'pB');
assert.strictEqual(g1.name, 'Plan B');
assert.strictEqual(g1.monthly, 5000);
assert.strictEqual(g1.debit, 5400);
assert.deepStrictEqual(g1.candidates.map(c => c.id), ['pB']);
assert.ok(/Plan B/.test(g1.why) && /1 Oct 2026/.test(g1.why) && /R\s400/.test(g1.why), g1.why);
// exactly at the price still fits
assert.strictEqual(guessHealthPlan(debit(9000), one, PLANS).id, 'pC');
// the debit run through a bank's verb still counts
assert.strictEqual(guessHealthPlan({ accounts: {}, rows: [row('2026-10-01', 'DEBIT ORDER DISC PREM 1234', -9000, 'X')] }, one, PLANS).id, 'pC');
// several plans fit (close prices): nothing is picked, the candidates are named closest first
const amb = guessHealthPlan(debit(2900), one, CLOSE);
assert.strictEqual(amb.id, null);
assert.strictEqual(amb.monthly, null);
assert.deepStrictEqual(amb.candidates.map(c => c.id), ['pB', 'pA']);
assert.strictEqual(amb.candidates[0].rest, 100);
assert.ok(/2 Discovery plans could fit/.test(amb.why) && /pick yours/.test(amb.why), amb.why);
// a debit far above every plan (more than any Vitality and gap could add): no plan fits, no pick
const far = guessHealthPlan(debit(20000), one, PLANS);
assert.strictEqual(far.id, null);
assert.deepStrictEqual(far.candidates, []);
assert.ok(/no Discovery plan/.test(far.why), far.why);
// a debit under every plan's price: nothing fits
const under = guessHealthPlan(debit(500), one, PLANS);
assert.strictEqual(under.id, null);
assert.deepStrictEqual(under.candidates, []);
// the LATEST debit is used, not the biggest or the first
const g2 = guessHealthPlan({ accounts: {}, rows: [row('2026-10-01', 'DISC PREM 1', -2200, 'X'), row('2026-08-01', 'DISC PREM 1', -9200, 'X')] }, one, PLANS);
assert.strictEqual(g2.id, 'pA');
assert.strictEqual(g2.date, '2026-10-01');
// members change the price and the ceiling: 2 adults + 1 child on Plan B = 5000 + 4000 + 950
const g3 = guessHealthPlan(debit(10500), { adults: 2, children: 1 }, PLANS);
assert.strictEqual(g3.id, 'pB');
assert.strictEqual(g3.monthly, 5000 + 4000 + 950);
// no debit: null (refunds and other lines do not count)
assert.strictEqual(guessHealthPlan({ accounts: {}, rows: [] }, one, PLANS), null);
assert.strictEqual(guessHealthPlan({ accounts: {}, rows: [row('2026-10-01', 'DISC PREM 1', 3000, 'X'), row('2026-10-02', 'WOOLWORTHS', -3000, 'X')] }, one, PLANS), null);
// a plan with no price for this family is skipped
assert.strictEqual(guessHealthPlan(debit(2100), one, [{ id: 'none', plan: 'Unpriced', discovery: true }, PLANS[0]]).id, 'pA');
// the live Discovery plans: a real plan plus any Vitality and gap cover up to
// the ceiling is never mistaken for another plan — it is picked or left open,
// and always among the candidates
{
  const { HEALTH_PLANS, HEALTH_OWN, healthPremium } = require('../src/compare');
  const live = HEALTH_PLANS.concat(HEALTH_OWN).filter(p => p.discovery);
  for (const fam of [one, { adults: 2, children: 0 }, { adults: 2, children: 2 }]) {
    for (const p of live) {
      const price = healthPremium(p, fam);
      if (price === null) continue;
      for (const extra of [0, 300, 900, 1300]) {
        const g = guessHealthPlan(debit(price + extra), fam, live);
        assert.ok(g.id === null || g.id === p.id, `${p.plan} + R${extra} picked ${g.name}`);
        assert.ok(g.candidates.some(c => c.id === p.id), `${p.plan} + R${extra} not among the candidates`);
      }
    }
  }
}
// the default list is the live Discovery plans and never throws
guessHealthPlan(debit(9000), one);

// ---- resolveSuite ----
const { resolveSuite } = require('../src/detect');
// never answered (onboarding skipped): the tier the fees show
assert.strictEqual(resolveSuite({ suite: 'Black', suiteAnswered: false }, { tier: 'Gold' }), 'Gold');
assert.strictEqual(resolveSuite({ suite: 'Black' }, { tier: 'Platinum' }), 'Platinum');
// answered: the answer wins, even when it is the default tier
assert.strictEqual(resolveSuite({ suite: 'Black', suiteAnswered: true }, { tier: 'Gold' }), 'Black');
// a tier other than the default was chosen by someone
assert.strictEqual(resolveSuite({ suite: 'Purple' }, { tier: 'Gold' }), 'Purple');
// nothing detected: the setting (the default)
assert.strictEqual(resolveSuite({ suite: 'Black' }, { tier: null }), 'Black');
assert.strictEqual(resolveSuite(undefined, undefined), 'Black');

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

// ── round 2 (red team rt3, base db6562d) ──────────────────────────────
// a product left years ago is reported ended and not ticked for you (item 5)
{
  const months = ['2024-01', '2024-02', '2024-03'];
  const old = {
    accounts: { 'Sam Everyday': OTHER },
    categories: {},
    rows: months.map(ym => row(ym + '-02', 'DISCINSURE 9012', -1100, 'Sam Everyday'))
      .concat(['2026-08', '2026-09', '2026-10'].map(ym => row(ym + '-01', 'DISC PREM 1234', -3200, 'Sam Everyday')))
      .concat([row('2026-10-28', 'SPAR SOMETOWN', -90, 'Sam Everyday')]),
  };
  const dx = detectProducts(old);
  assert.strictEqual(dx.insure.found, true, 'the budget still shows it');
  assert.strictEqual(dx.insure.lastPaid, '2024-03-02');
  assert.strictEqual(dx.insure.ended, true, 'nothing since March 2024');
  assert.ok(/no longer have Discovery Insure/.test(dx.insure.why), dx.insure.why);
  assert.strictEqual(dx.health.ended, false, 'paid this month');
  assert.strictEqual(dx.health.lastPaid, '2026-10-01');
  assert.strictEqual(dx.gap.ended, false, 'never there is not ended');
  assert.strictEqual(dx.gap.lastPaid, null);
  const picked = resolveProducts({ products: { bank: null, health: null, gap: null, insure: null, life: null } }, dx);
  assert.strictEqual(picked.insure, false, 'an ended product is not ticked for you');
  assert.strictEqual(picked.health, true);
  assert.strictEqual(resolveProducts({ products: { insure: true } }, dx).insure, true, 'your answer still wins');
  // the end can be given: a window that ends in March 2024 sees Insure as current
  assert.strictEqual(detectProducts(old, { end: '2024-03' }).insure.ended, false);
  // two missed premiums: ended; one missed: not yet
  const miss = n => detectProducts({ accounts: {}, categories: {}, rows: [row('2026-08-01', 'DISC LIFE 1', -500, 'X'), row(n, 'SPAR', -10, 'X')] }).life.ended;
  assert.strictEqual(miss('2026-09-30'), false, 'September missing only');
  assert.strictEqual(miss('2026-10-02'), true, 'September and October missing');
  // a claim only: a year with none says it ended
  const claim = end => detectProducts({ accounts: {}, categories: {}, rows: [row('2025-06-01', 'INSGAPCLA 1', 900, 'X'), row(end, 'SPAR', -10, 'X')] }).gap.ended;
  assert.strictEqual(claim('2026-03-01'), false);
  assert.strictEqual(claim('2026-07-01'), true);
  // a Discovery Bank account that went quiet
  const quiet = detectProducts({ accounts: { 'Disc Cheque': DISC, 'Sam Everyday': OTHER }, categories: {}, rows: [row('2025-01-10', 'SPAR', -10, 'Disc Cheque'), row('2026-10-10', 'SPAR', -10, 'Sam Everyday')] });
  assert.strictEqual(quiet.bank.found, true);
  assert.strictEqual(quiet.bank.ended, true);
  assert.ok(/closed it/.test(quiet.bank.why) && !/[−-]\s?R/.test(quiet.bank.why), quiet.bank.why);
  assert.strictEqual(resolveProducts({}, quiet).bank, false);
  assert.strictEqual(d.bank.ended, false, 'the full household is current');
  for (const id of ['bank', 'health', 'gap', 'insure', 'life']) assert.strictEqual(d[id].ended, false, id);
}
// Vitality Money from any wording, a Suite fee that holds it, or an interest boost (item 6)
{
  const vmRows = desc => [row('2026-10-25', 'MONTHLY ACCOUNT FEE', -435, 'Cheque'), row('2026-10-25', 'FACILITY FEE', -69, 'Card'), row('2026-10-25', desc, -101, 'Cheque')];
  for (const w of ['VITALITY MONEY FEE', 'VM FEE', 'Vitality Money Premium']) {
    const b = bank(both, vmRows(w));
    assert.strictEqual(b.vitalityMoney, true, w);
    assert.strictEqual(b.tier, 'Black', w);
  }
  // one combined fee of R605: the whole Black Suite fee, Vitality Money inside
  const one = bank(both, [row('2026-10-25', 'MONTHLY ACCOUNT FEE', -605, 'Cheque')]);
  assert.strictEqual(one.tier, 'Black');
  assert.strictEqual(one.vitalityMoney, true);
  assert.ok(/Vitality Money included/.test(one.vitalityMoneyWhy.join(' ')), one.vitalityMoneyWhy.join(' '));
  // the account and facility fees alone: no Vitality Money
  const without = bank(both, [row('2026-10-25', 'MONTHLY ACCOUNT FEE', -435, 'Cheque'), row('2026-10-25', 'FACILITY FEE', -69, 'Card')]);
  assert.strictEqual(without.tier, 'Black');
  assert.strictEqual(without.vitalityMoney, false);
  // an interest boost is only paid with Vitality Money
  const boosted = bank({ Pot: acct('savings') }, [row('2026-10-25', 'DYNAMIC INTEREST BOOST', 120, 'Pot')]);
  assert.strictEqual(boosted.vitalityMoney, true);
  assert.ok(/interest boost/.test(boosted.why), boosted.why);
  // a premium stopped a year ago is not Vitality Money now
  const stopped = bank(both, [row('2025-09-25', 'VITALITY MONEY PREMIUM', -101, 'Cheque'), row('2026-10-25', 'MONTHLY ACCOUNT FEE', -435, 'Cheque'), row('2026-10-25', 'FACILITY FEE', -69, 'Card')]);
  assert.strictEqual(stopped.vitalityMoney, false);
  assert.ok(/stopped it/.test(stopped.why), stopped.why);
}

console.log('detect OK');
