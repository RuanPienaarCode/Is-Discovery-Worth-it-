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
  r('2026-09-06', 'Credit Card', 'WOOLWORTHS SOMETOWN', 'Food', -1000, true),           // excluded from budget, still a swipe
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

assert.deepStrictEqual(monthsBetween('2025-11', '2026-02'), ['2025-11', '2025-12', '2026-01', '2026-02']);
assert.deepStrictEqual(trailingWindow(new Date(2026, 9, 21), 12), { from: '2025-10', to: '2026-09' });
assert.deepStrictEqual(trailingWindow(new Date(2026, 0, 5), 3), { from: '2025-10', to: '2025-12' });
console.log('measure OK');
