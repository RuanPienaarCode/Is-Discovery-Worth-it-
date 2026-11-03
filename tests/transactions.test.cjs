'use strict';
const assert = require('node:assert');
const { parseTransactionNote, parseAccountNote, parseAmount, isTransactionNote } = require('../src/transactions');

const NOTE = [
  '---', 'account: "Credit Card"', 'month: 2026-09', 'tags: [finance]', '---', '',
  '| Date | Description | Category | Amount | Excluded | Note |',
  '|------|-------------|----------|-------:|----------|------|',
  '| 2026-09-04 | Monthly Account fee | Bank charges & fees | -430.00 |  |  |',
  '| 2026-09-05 | WOOLWORTHS SOMETOWN | Food | -1,234.50 | yes | split |',
  '| 2026-09-06 | Refund | Food | 200.00 |  |  |',
  '| 2026-09-07 | Broken | Food | n/a |  |  |',
  '| not a date | x | y | 1 |', '',
].join('\n');

// header recognised; a plain note is not a transaction note
assert.ok(isTransactionNote(NOTE));
assert.ok(!isTransactionNote('# Shopping list\n| a | b |\n'));

// rows: dates only, commas read as thousands, excluded flag, unreadable amount skipped not guessed
const n = parseTransactionNote(NOTE, 'Folder Name');
assert.strictEqual(n.account, 'Credit Card');
assert.strictEqual(n.month, '2026-09');
assert.strictEqual(n.rows.length, 3);
assert.strictEqual(n.skipped, 1);
assert.deepStrictEqual(n.rows[1], { date: '2026-09-05', description: 'WOOLWORTHS SOMETOWN', category: 'Food', amount: -1234.5, excluded: true, note: 'split', split: '', account: 'Credit Card' });

// folder name is the fallback account
assert.strictEqual(parseTransactionNote('| Date | Description | Category | Amount |\n| 2026-01-01 | a | b | -1 |', 'Cash').account, 'Cash');

// amounts
assert.strictEqual(parseAmount('R -95.00'), -95);
assert.strictEqual(parseAmount('1 234.5'), 1234.5);
assert.ok(Number.isNaN(parseAmount('')));
assert.ok(Number.isNaN(parseAmount('12-3')));
// a decimal comma is read as one, not as a thousands separator 100× too big
assert.strictEqual(parseAmount('-435,00'), -435);
assert.strictEqual(parseAmount('1,234.50'), 1234.5);
assert.strictEqual(parseAmount('1,234'), 1234);
assert.ok(Number.isNaN(parseAmount('1,2345')), 'ambiguous → unreadable');

// the Budget plugin's Split column
const SPLIT = ['| Date | Description | Category | Amount | Excluded | Note | Split |', '|---|---|---|---|---|---|---|',
  '| 2026-09-05 | CHECKERS X | Food | -1000.00 | yes | Split into 2 | parent |',
  '| 2026-09-05 | CHECKERS X | Food | -800.00 |  |  | part |',
  '| 2026-09-05 | CHECKERS X | Household | -200.00 |  |  | Part |'].join('\n');
assert.deepStrictEqual(parseTransactionNote(SPLIT, 'Card').rows.map(r => r.split), ['parent', 'part', 'part']);

// account notes: tx_label wins over the note name
assert.strictEqual(parseAccountNote('---\ntype: Credit_Card \n---\n', 'X').type, 'credit_card', 'types are trimmed and lower-cased');
assert.deepStrictEqual(parseAccountNote('---\ntype: credit_card\ninstitution: Discovery Bank\ntx_label: "Credit Card"\n---\n', 'Discovery Bank Credit Card'),
  { label: 'Credit Card', institution: 'Discovery Bank', type: 'credit_card' });
assert.deepStrictEqual(parseAccountNote('---\ntype: savings\ninstitution: "Discovery Bank"\n---\n', 'Car Fund'),
  { label: 'Car Fund', institution: 'Discovery Bank', type: 'savings' });
console.log('transactions OK');
