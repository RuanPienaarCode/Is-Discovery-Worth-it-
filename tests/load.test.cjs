'use strict';
const assert = require('node:assert');
const { loadBudget } = require('../src/load');

/* A Miles CSV is read once and kept until its date or size changes. */
const CSV = '"Value Date","Type","Description","Additional information","Miles"\n2026-09-01,"Base Miles","Shop","2026-09-01 - R 100.00",7.00\n';
const files = {
  'Budget/Transactions/Card/2026-09.md': '| Date | Description | Category | Amount |\n|---|---|---|---|\n| 2026-09-01 | Shop | Food | -100.00 |\n',
  'Downloads/DiscoveryBankMiles_x.csv': CSV,
  'Exports/other.csv': 'a,b\n1,2\n',
};
const reads = {};
let stamp = 1;
const source = {
  paths: () => Object.keys(files),
  read: async p => { reads[p] = (reads[p] || 0) + 1; return files[p]; },
  stat: p => ({ mtime: p.endsWith('x.csv') ? stamp : 1, size: files[p].length }),
};
(async () => {
  const a = await loadBudget(source);
  assert.deepStrictEqual(a.miles.files, ['Downloads/DiscoveryBankMiles_x.csv']);
  assert.strictEqual(a.miles.rows.length, 1);
  await loadBudget(source);
  assert.strictEqual(reads['Downloads/DiscoveryBankMiles_x.csv'], 1, 'unchanged: not read again');
  assert.strictEqual(reads['Exports/other.csv'], 1, 'a CSV that is not a Miles statement is not re-read either');
  stamp = 2;
  await loadBudget(source);
  assert.strictEqual(reads['Downloads/DiscoveryBankMiles_x.csv'], 2, 'changed: read again');
  // without stat (node scripts that do not pass it) every CSV is read each time
  const plain = { paths: source.paths, read: source.read };
  await loadBudget(plain);
  assert.strictEqual(reads['Exports/other.csv'], 2);
  // with head(): a CSV that is not a Miles statement is never read whole; a file over 5 MB is not read at all (red team: iPhone memory)
  const big = { ...files, 'Exports/huge.csv': '"Value Date","Type","Description","Additional information","Miles"\n' };
  const heads = {}, fullReads = {};
  const lean = {
    paths: () => Object.keys(big),
    read: async p => { fullReads[p] = (fullReads[p] || 0) + 1; return big[p]; },
    head: async (p, n) => { heads[p] = n; return big[p].slice(0, n); },
    stat: p => ({ mtime: 7, size: p === 'Exports/huge.csv' ? 6 * 1024 * 1024 : big[p].length }),
  };
  const c = await loadBudget(lean);
  assert.strictEqual(heads['Exports/other.csv'], 1024, 'only the first kilobyte is looked at');
  assert.strictEqual(fullReads['Exports/other.csv'], undefined, 'and the rest never read');
  assert.strictEqual(fullReads['Downloads/DiscoveryBankMiles_x.csv'], 1, 'a Miles statement is read whole');
  assert.strictEqual(heads['Exports/huge.csv'], undefined, 'a 6 MB file is not opened');
  assert.deepStrictEqual(c.csvSkipped, [{ path: 'Exports/huge.csv', size: 6 * 1024 * 1024 }]);
  assert.ok(/too big/.test(c.csvNotes[0]) && !/-/.test(c.csvNotes[0].replace(/[\w./]+\.csv/, '')), c.csvNotes[0]);
  assert.strictEqual(c.miles.rows.length, 1);
  // ── which folder is the budget (rt3 item 9) ──
  const { findBudgetFolder, budgetCandidates } = require('../src/load');
  const real = ['Finance/Budget/Accounts/Card.md', 'Finance/Budget/Transactions/Card/2026-01.md', 'Finance/Budget/Transactions/Card/2026-02.md'];
  assert.strictEqual(findBudgetFolder(real.concat(['Transactions/Old/2019-01.md'])), 'Finance/Budget', 'a stray root Transactions folder does not win');
  assert.strictEqual(findBudgetFolder(['Finance/Budget/Transactions/Card/2026-01.md', 'Transactions/Old/2019-01.md']), 'Finance/Budget', 'with no account notes either way, the later notes win');
  assert.strictEqual(findBudgetFolder(['Archive/Budget 2023/Transactions/Card/2023-01.md', 'Finance/Budget/Transactions/Card/2026-01.md']), 'Finance/Budget');
  assert.strictEqual(findBudgetFolder(real.concat(['Mom/Transactions/Card/2026-01.md'])), 'Finance/Budget', 'a sibling folder with no account notes does not win');
  const pair = ['Mom/Accounts/A.md', 'Mom/Transactions/A/2026-01.md'].concat(real);
  assert.strictEqual(findBudgetFolder(pair), 'Finance/Budget', 'both have account notes: the more transaction notes');
  assert.strictEqual(findBudgetFolder(pair, 'Mom/'), 'Mom', 'the folder you set wins');
  assert.strictEqual(findBudgetFolder(['Notes/x.md']), null);
  const cands = budgetCandidates(pair);
  assert.deepStrictEqual(cands.map(c => c.folder), ['Finance/Budget', 'Mom']);
  assert.deepStrictEqual(cands[0], { folder: 'Finance/Budget', notes: 2, accounts: 1, latest: '2026-02' });
  const two = await loadBudget({ paths: () => Object.keys(files).concat(['Budget/Accounts/Card.md', 'Old/Transactions/Card/2019-01.md']), read: async p => files[p] || '---\ninstitution: X\n---\n' });
  assert.strictEqual(two.folder, 'Budget');
  assert.deepStrictEqual(two.candidates.map(c => c.folder), ['Budget', 'Old'], 'loadBudget lists every budget-looking folder');
  console.log('load OK');
})().catch(e => { console.error(e); process.exit(1); });
