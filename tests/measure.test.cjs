'use strict';
const assert = require('node:assert');
const { measure, monthsBetween, trailingWindow, total } = require('../src/measure');

const accounts = {
  'Credit Card': { institution: 'Discovery Bank', type: 'credit_card' },
  'Transaction Account': { institution: 'Discovery Bank', type: 'checking' },
  'Other Bank': { institution: 'FNB', type: 'checking' },
};
const categories = { 'Settle Credit Card': 'transfer', Food: 'food', Rent: 'housing', 'Notice savings': 'savings' };
const r = (date, account, description, category, amount, excluded = false) => ({ date, account, description, category, amount, excluded, note: '' });

const rows = [
  r('2026-08-04', 'Credit Card', 'Monthly Account fee', 'Bank charges & fees', -430),
  r('2026-09-04', 'Credit Card', 'Monthly Account fee', 'Bank charges & fees', -430),
  r('2026-09-04', 'Other Bank', '#MONTHLY ACCOUNT FEE', 'Bank charges & fees', -15),       // not Discovery
  r('2026-09-04', 'Credit Card', 'Vitality Money Premium', 'Bank charges & fees', -98),
  r('2026-09-04', 'Credit Card', 'Interest Charged at 20%', 'Bank charges & fees', -10),   // interest, not "other fee"
  r('2026-09-04', 'Credit Card', 'Returned debit order fee', 'Bank charges & fees', -15),  // a penalty
  r('2026-09-05', 'Transaction Account', 'Dynamic interest boost at 1.5%', 'Interest income', 30),
  r('2026-09-05', 'Transaction Account', 'Dynamic interest boost adjustment at 1.5%', 'Interest income', -2),
  r('2026-09-06', 'Credit Card', 'WOOLWORTHS SOMETOWN', 'Food', -1000),                 // a swipe
  r('2026-09-07', 'Credit Card', 'Refund WOOLWORTHS SOMETOWN', 'Food', 100),
  r('2026-09-08', 'Credit Card', 'BP PARK DRIVE', 'Fuel and transport', -500),
  r('2026-09-08', 'Credit Card', 'DL*Uber Eats CPT', 'Eating out', -80),               // Uber Eats is not a ride
  r('2026-09-09', 'Credit Card', 'Payment received', 'Settle Credit Card', 5000),        // transfer type
  r('2026-09-09', 'Credit Card', 'Landlord Rent', 'Rent', -13000),                      // listed as not a swipe
  r('2026-09-09', 'Credit Card', 'Transfer', '', 200),                                   // uncategorised credit
  r('2026-09-10', 'Transaction Account', 'DISC PREM 123-456', 'Medical aid', -6600),
  r('2026-09-10', 'Transaction Account', 'INSGAPCLA 1-2', 'Transfer between accounts', 16000),
  r('2026-09-11', 'Transaction Account', 'Shop on debit card', 'Food', -50),           // not the card account
  r('2026-10-01', 'Credit Card', 'Monthly Account fee', 'Bank charges & fees', -430),    // outside the window
  { ...r('2026-09-12', 'Credit Card', 'CHECKERS X', 'Food', -500, true), split: 'parent' },   // the original of the two parts below
  { ...r('2026-09-12', 'Credit Card', 'CHECKERS X', 'Food', -300), split: 'part' },
  { ...r('2026-09-12', 'Credit Card', 'CHECKERS X', 'Household', -200), split: 'part' },
  r('2026-09-13', 'Credit Card', 'Car service money', 'Car maintenance', 5000),          // a savings top-up, not a refund
];

const m = measure(rows, accounts, categories, { from: '2026-08', to: '2026-09', notCardSpend: ['Rent'] });
assert.deepStrictEqual(m.months, ['2026-08', '2026-09']);
assert.strictEqual(m.rowsSeen, rows.length - 2, 'the out-of-window row and the split parent are not seen');
assert.strictEqual(total(m, 'fee.account'), 860);
assert.deepStrictEqual(m.figures['fee.account'].perMonth, { '2026-08': 430, '2026-09': 430 });
assert.strictEqual(total(m, 'fee.vitalityMoney'), 98);
assert.strictEqual(total(m, 'interest.charged'), 10);
assert.strictEqual(total(m, 'fee.other'), 0);
assert.strictEqual(total(m, 'fee.penalty'), 15, 'a returned debit order fee is a penalty any bank charges');
assert.strictEqual(total(m, 'interest.boost'), 28);
assert.strictEqual(total(m, 'product.medical'), 6600);
assert.strictEqual(total(m, 'product.gapClaim'), 16000);
assert.strictEqual(total(m, 'product.gap'), 0, 'a gap CLAIM is not a gap premium');
// card spend: 1000 - 100 refund + 500 + 80 + the two split parts (500, not the parent too) = 1980;
// rent, settlement, transfer, the debit-card row and the savings top-up are out
assert.strictEqual(total(m, 'spend.card'), 1980);
assert.strictEqual(total(m, 'shop.checkers'), 500);
assert.strictEqual(total(m, 'shop.woolworths'), 900);
assert.strictEqual(total(m, 'fuel.bp'), 500);
assert.strictEqual(total(m, 'ride.uber'), 0);
assert.deepStrictEqual(m.excludedFromSpend, { 'Settle Credit Card': -5000, Rent: 13000 });
assert.deepStrictEqual(m.cardAccounts, ['Credit Card']);
assert.strictEqual(total(m, 'nope'), 0);
assert.deepStrictEqual(m.dataMonths, ['2026-08', '2026-09']);
// payments that would cost a pay-as-you-transact fee: the DISC PREM debit order and the debit-card
// shop row on the transaction account, and the rent EFT from the card; not card purchases or fees
assert.strictEqual(total(m, 'payt.payments'), 3, 'DISC PREM debit order, debit-card shop, rent EFT');
assert.strictEqual(m.firstSeen['fee.account'], '2026-08-04');
// an outflow met by the same amount on another Discovery account that day is a move, not a payment
const mO = measure([
  r('2026-09-02', 'Transaction Account', 'Car money', 'Car maintenance', -5000),
  r('2026-09-02', 'Credit Card', 'Car money', 'Car maintenance', 5000),
  r('2026-09-03', 'Transaction Account', 'Plumber', 'Household', -700),
], accounts, categories, { from: '2026-09', to: '2026-09' });
assert.strictEqual(total(mO, 'payt.payments'), 1, 'only the plumber is a payment');
// the rows behind a line are kept, in the window only
assert.deepStrictEqual(m.rows['fee.account'].map(x => x.date), ['2026-08-04', '2026-09-04']);
assert.strictEqual(m.rows['product.gapClaim'][0].amount, 16000);

// a window with a missing month says so
const gap = measure(rows.filter(x => !x.date.startsWith('2026-08')), accounts, categories, { from: '2026-07', to: '2026-09' });
assert.deepStrictEqual(gap.dataMonths, ['2026-09']);

// category and account types match without regard to case; a debt-typed repayment is not a refund
const mC = measure([r('2026-09-01', 'Card2', 'Shop', 'Groceries', -1000), r('2026-09-25', 'Card2', 'Payment', 'Credit Card Payment', 40000)],
  { Card2: { institution: 'Discovery Bank', type: 'Credit_Card' } }, { 'credit card payment': 'debt', groceries: 'food' }, { from: '2026-09', to: '2026-09' });
assert.strictEqual(total(mC, 'spend.card'), 1000);

// 'Bank fees' (the Budget starter pack's name) is a bank charge too
const mF = measure([r('2026-09-01', 'Credit Card', 'Card replacement', 'Bank fees', -50)], accounts, categories, { from: '2026-09', to: '2026-09' });
assert.strictEqual(total(mF, 'fee.other'), 50);
assert.strictEqual(total(mF, 'spend.card'), 0);
// last seen is tracked outside the window too
assert.strictEqual(m.lastSeen['fee.account'], '2026-10-01');
const m2 = measure([r('2024-11-20', 'Transaction Account', 'INSURECASH0000-1', '', 60), r('2025-02-03', 'Transaction Account', 'INSURE CLA0000-2', '', 3000)], accounts, categories, { from: '2026-08', to: '2026-09' });
assert.strictEqual(m2.lastSeen['insure.driveCash'], '2024-11-20');
assert.strictEqual(m2.lastSeen['product.insureClaim'], '2025-02-03');
assert.strictEqual(total(m2, 'insure.driveCash'), 0, 'outside the window');

// partner spend on another bank's account counts as all.<tag>, never as Discovery card spend
const mA = measure([
  r('2026-09-02', 'Other Card', 'VIRGIN ACTIVE SOMETOWN', 'Gym', -450),
  r('2026-09-03', 'Other Card', 'WOOLWORTHS SOMETOWN', 'Groceries', -900),
  r('2026-09-04', 'Other Card', 'WOOLWORTHS SOMETOWN', 'Card payment', -100),
  r('2026-09-05', 'Credit Card', 'CLICKS SOMETOWN', 'Pharmacy', -200),
], { ...accounts, 'Other Card': { institution: 'Other Bank', type: 'credit_card' } }, { ...categories, 'Card payment': 'transfer' }, { from: '2026-09', to: '2026-09' });
assert.strictEqual(total(mA, 'all.gym'), 450);
assert.strictEqual(total(mA, 'all.shop.woolworths'), 900, 'a transfer-typed row is not spend');
assert.strictEqual(total(mA, 'all.shop.clicks'), 200, 'a Discovery card counts too');
assert.strictEqual(total(mA, 'shop.woolworths'), 0, 'not on a Discovery card');
assert.strictEqual(total(mA, 'spend.card'), 200);
// a Discovery transaction account's money out is spend.debit (not fees, premiums or own transfers)
const mD = measure([
  r('2026-09-02', 'Transaction Account', 'SPAR SOMETOWN', 'Groceries', -300),
  r('2026-09-03', 'Transaction Account', 'Monthly Account fee', 'Bank charges & fees', -125),
  r('2026-09-04', 'Transaction Account', 'To savings', 'Settle Credit Card', -1000),
], accounts, categories, { from: '2026-09', to: '2026-09' });
assert.strictEqual(total(mD, 'spend.debit'), 300);

assert.deepStrictEqual(monthsBetween('2025-11', '2026-02'), ['2025-11', '2025-12', '2026-01', '2026-02']);
assert.deepStrictEqual(trailingWindow(new Date(2026, 9, 21), 12), { from: '2025-10', to: '2026-09' });
assert.deepStrictEqual(trailingWindow(new Date(2026, 0, 5), 3), { from: '2025-10', to: '2025-12' });
// ── where each figure came from, for making it a year ────────────────
{
  const { sourceMonths, annualOf } = require('../src/measure');
  const rowsS = [];
  for (const ym of monthsBetween('2025-11', '2026-10')) {
    rowsS.push(r(ym + '-01', 'Other Bank', 'DISC PREM 1', 'Medical', -4850));
    rowsS.push(r(ym + '-05', 'Other Bank', 'CHECKERS SOMETOWN', 'Groceries', -3000));
    if (ym >= '2026-08') {
      rowsS.push(r(ym + '-02', 'Transaction Account', 'Monthly account fee', 'Bank charges', -435));
      rowsS.push(r(ym + '-03', 'Transaction Account', 'BP SOMETOWN', 'Fuel', -800));
      rowsS.push(r(ym + '-04', 'Credit Card', 'SHELL SOMETOWN', 'Fuel', -200));
    }
  }
  const mS = measure(rowsS, accounts, categories, { from: '2025-11', to: '2026-10' });
  assert.strictEqual(mS.accountMonths['Other Bank'].length, 12, 'months holding rows, per account');
  assert.strictEqual(mS.accountMonths['Transaction Account'].length, 3);
  assert.deepStrictEqual(Object.keys(mS.figures['product.medical'].accounts), ['Other Bank'], 'a figure names the accounts it came from');
  assert.strictEqual(sourceMonths(mS, ['product.medical'], 3), 12, 'the debit on the other bank: twelve months');
  assert.strictEqual(sourceMonths(mS, ['fee.account'], 99), 3, 'the Discovery fee: three months');
  assert.strictEqual(annualOf(mS, 'product.medical', 3), 4850 * 12, 'one year, not four');
  assert.strictEqual(annualOf(mS, ['all.shop.checkers'], 3), 3000 * 12);
  assert.strictEqual(sourceMonths(mS, ['no.such'], 7), 7, 'never seen: the fallback');
  assert.strictEqual(sourceMonths({ figures: {} }, ['product.medical'], 5), 5, 'no account months: the fallback');
  assert.strictEqual(sourceMonths(mS, ['all.shop.checkers'], 4, ['Other Bank']), 4, 'leaving out the only account: the fallback');
  // fuel paid with ANY Discovery Bank card (disc.*); fuel.* stays the credit card's
  assert.strictEqual(total(mS, 'disc.fuel.bp'), 2400, 'the debit card counts for Drive');
  assert.strictEqual(total(mS, 'disc.fuel.shell'), 600);
  assert.strictEqual(total(mS, 'fuel.bp'), 0, 'Vitality Money fuel stays on the credit card');
  assert.strictEqual(total(mS, 'fuel.shell'), 600);
}

// ── fix wave (audit 3b26f51) ─────────────────────────────────────────
const W = { from: '2026-09', to: '2026-09' };
// refunds lower all.* and disc.* as they lower shop.* (audit s2)
{
  const mR = measure([
    r('2026-09-10', 'Other Bank', 'VITALITY TRAVEL JHB-CPT', 'Travel', -6000),
    r('2026-09-20', 'Other Bank', 'VITALITY TRAVEL REFUND', 'Travel', 6000),
    r('2026-09-09', 'Credit Card', 'CHECKERS SOMETOWN', 'Food', -4000),
    r('2026-09-12', 'Credit Card', 'CHECKERS REFUND', 'Food', 4000),
    r('2026-09-13', 'Transaction Account', 'BP SOMETOWN', 'Fuel', -800),
    r('2026-09-14', 'Transaction Account', 'BP SOMETOWN REVERSAL', 'Fuel', 300),
    r('2026-09-15', 'Other Bank', 'CHECKERS SOMETOWN', 'Food', 500),               // money in without "refund": not a refund
  ], accounts, categories, W);
  assert.strictEqual(total(mR, 'all.travel.vitality'), 0, 'a refunded booking on another bank nets to nothing');
  assert.strictEqual(total(mR, 'all.shop.checkers'), 0, 'a card refund lowers all.* too');
  assert.strictEqual(total(mR, 'shop.checkers'), 0);
  assert.strictEqual(total(mR, 'disc.shop.checkers'), 0);
  assert.strictEqual(total(mR, 'disc.fuel.bp'), 500, 'a debit-card reversal lowers disc.*');
  assert.strictEqual(total(mR, 'all.fuel.bp'), 500);
  assert.strictEqual(total(mR, 'spend.debit'), 500, 'and the debit card spend');
}
// moves between your own Discovery accounts are not card spend, settling up to three days later (audit s6, item 10)
{
  const mM = measure([
    r('2026-09-05', 'Credit Card', 'TAKEALOT', 'Shopping', -8000),
    r('2026-09-25', 'Credit Card', 'TRANSFER', '', -5000),
    r('2026-09-25', 'Savings', 'TRANSFER', '', 5000),
    r('2026-09-26', 'Transaction Account', 'TRANSFER', '', -700),
    r('2026-09-28', 'Credit Card', 'TRANSFER', '', 700),                           // settled two days later
    r('2026-09-02', 'Transaction Account', 'PLUMBER', 'Household', -900),
    r('2026-09-09', 'Credit Card', 'TRANSFER', '', 900),                            // a week later: not the same money
  ], { ...accounts, Savings: { institution: 'Discovery Bank', type: 'savings' } }, categories, W);
  assert.strictEqual(total(mM, 'spend.card'), 8000, 'the move to savings is not a purchase');
  assert.strictEqual(total(mM, 'spend.debit'), 900, 'the next-day move is not a swipe; the plumber is');
  assert.strictEqual(total(mM, 'payt.payments'), 1, 'only the plumber is a payment');
  assert.strictEqual(mM.excludedFromSpend['Moves between your accounts'], 5000);
  const { matchMoves } = require('../src/measure');
  const twin = [r('2026-09-02', 'Transaction Account', 'A', '', -500), r('2026-09-02', 'Transaction Account', 'B', '', -500), r('2026-09-03', 'Credit Card', 'C', '', 500)];
  assert.strictEqual(matchMoves(twin, accounts).size, 1, 'one arrival explains one outflow only');
  assert.strictEqual(matchMoves([r('2026-09-01', 'Transaction Account', 'A', '', -500), r('2026-09-05', 'Credit Card', 'C', '', 500)], accounts).size, 0, 'four days apart: not a move');
}
// Excluded rows are not spend; a split parent is skipped only when it is Excluded (audit s7, budget-vault tx-role.js)
{
  const mX = measure([
    { ...r('2026-09-09', 'Credit Card', 'CHECKERS SOMETOWN', 'Food', -3000, true), split: 'parent' },
    { ...r('2026-09-09', 'Credit Card', 'CHECKERS SOMETOWN', 'Food', -2000), split: 'part' },
    { ...r('2026-09-09', 'Credit Card', 'CHECKERS SOMETOWN', 'Household', -1000), split: 'part' },
    { ...r('2026-09-10', 'Credit Card', 'WOOLWORTHS SOMETOWN', 'Food', -600, false), split: 'parent' },   // split undone by hand
    r('2026-09-25', 'Credit Card', 'TRANSFER TO SAVINGS', '', -5000, true),
    r('2026-09-26', 'Transaction Account', 'SPAR SOMETOWN', 'Food', -400, true),
    r('2026-09-27', 'Other Bank', 'CLICKS SOMETOWN', 'Pharmacy', -250, true),
  ], accounts, categories, W);
  assert.strictEqual(total(mX, 'spend.card'), 3600, 'the two parts and the hand-undone parent; not the Excluded parent or move');
  assert.strictEqual(total(mX, 'shop.checkers'), 3000);
  assert.strictEqual(total(mX, 'shop.woolworths'), 600, 'a parent with Excluded unticked is a real row again');
  assert.strictEqual(total(mX, 'all.shop.woolworths'), 600);
  /* Excluded = "left out of budget totals, but the money still moved"
     (budget-vault tx-role.js): an Excluded shop swipe still earns */
  assert.strictEqual(total(mX, 'spend.debit'), 400, 'an Excluded shop swipe is still a swipe');
  assert.strictEqual(total(mX, 'all.shop.clicks'), 250, 'and still partner spend');
  assert.strictEqual(mX.excludedFromSpend['Rows marked Excluded'], 5000);
}
// debit orders out of a transaction account are not card swipes (red team #7)
{
  const mO = measure([
    r('2026-09-01', 'Transaction Account', 'SBSA HOMELOAN 0001', 'Bond', -15000),
    r('2026-09-02', 'Transaction Account', 'SOMETOWN PRIMARY FEES', 'School', -3000),
    r('2026-09-03', 'Transaction Account', 'ACB DEBIT ORDER CARLOAN', 'Car', -4000),
    r('2026-09-04', 'Transaction Account', 'LANDLORD', 'Flat', -7000),
    r('2026-09-05', 'Transaction Account', 'WOOLWORTHS SOMETOWN', 'Groceries', -3000),
    r('2026-09-06', 'Transaction Account', 'VIRGIN ACTIVE DEBIT ORDER', 'Gym', -500),
  ], accounts, { ...categories, Flat: 'housing' }, W);
  assert.strictEqual(total(mO, 'spend.debit'), 3000, 'only the Woolworths swipe');
  assert.strictEqual(total(mO, 'disc.gym'), 500, 'a debit order at a partner is still partner spend');
  assert.strictEqual(total(mO, 'payt.payments'), 6, 'every one of them is still a payment');
}
console.log('measure OK');
