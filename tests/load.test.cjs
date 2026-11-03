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
  console.log('load OK');
})().catch(e => { console.error(e); process.exit(1); });
