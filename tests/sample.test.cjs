'use strict';
/* src/sample.js — the made-up "Sometown" example household: it loads through
   load.js like a real budget, runs the whole page pipeline (measure →
   buildStatement → products → compare → verdicts / switch / rivals) with every
   product present and no NaN, its settings have the mergeSettings shape, it is
   deterministic, and it holds only made-up data. */
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { sampleFiles, sampleSettings, sampleSource, SAMPLE_FOLDER, MILES_PATH } = require('../src/sample');
const { loadBudget } = require('../src/load');
const { measure, trailingWindow } = require('../src/measure');
const { summariseMiles } = require('../src/miles');
const { buildStatement } = require('../src/model');
const { buildProducts } = require('../src/products');
const { buildVerdicts } = require('../src/verdict');
const { buildSwitch, buildRivals } = require('../src/switch');
const { compareHealth, compareGap, compareInsure, compareLife, compareHome } = require('../src/compare');
const { detectProducts, detectBanking, resolveProducts, resolveVitality, resolveSuite } = require('../src/detect');
const { DEFAULT_SETTINGS } = require('../src/constants');

const NOW = new Date(2026, 10, 3);
const IDS = ['bank', 'health', 'gap', 'insure', 'life'];

/* main.js mergeSettings, as it stands (main.js needs obsidian, so it is
   mirrored here): one level deep over DEFAULT_SETTINGS. */
const NESTED = ['status', 'rates', 'actualMiles', 'travel', 'members', 'quotes', 'products', 'benefits', 'vitality', 'conditions', 'health', 'life', 'home', 'bill'];
function mergeSettings(saved) {
  const out = { ...DEFAULT_SETTINGS, ...(saved || {}) };
  if (!(Number(out.months) >= 6)) out.months = 6;
  for (const k of NESTED) out[k] = { ...DEFAULT_SETTINGS[k], ...((saved || {})[k] || {}) };
  return out;
}

/* every number reachable from v is finite (no NaN, no Infinity) */
function nonFinite(v, at, seen, out) {
  if (typeof v === 'number') { if (!Number.isFinite(v)) out.push(at); return out; }
  if (!v || typeof v !== 'object' || seen.has(v)) return out;
  seen.add(v);
  for (const k of Object.keys(v)) nonFinite(v[k], at + '.' + k, seen, out);
  return out;
}
const assertFinite = (v, name) => {
  const bad = nonFinite(v, name, new Set(), []);
  assert.deepStrictEqual(bad, [], `${name}: not a finite number at ${bad.slice(0, 5).join(', ')}`);
};

/* the page's own pipeline (bottom-line.js render), on the example */
async function pipeline(now, opts) {
  const s = sampleSettings(now, opts);
  const budget = await loadBudget(sampleSource(now, opts), s.budgetFolder);
  const win = trailingWindow(now, s.months, budget);
  const m = measure(budget.rows, budget.accounts, budget.categories, { ...win, notCardSpend: s.notCardSpend });
  const ms = budget.miles ? summariseMiles(budget.miles.rows, m.from, m.to) : null;
  const detected = detectProducts(budget);
  const banking = detectBanking(budget);
  const products = resolveProducts(s, detected);
  const vitality = resolveVitality(s, detected, banking);
  let eff = s;
  if (!s.bankKind && banking.kind) eff = { ...eff, bankKind: banking.kind };
  const tier = resolveSuite(s, banking);
  if (tier && tier !== eff.suite) eff = { ...eff, suite: tier };
  const st = buildStatement(m, eff, ms, { products, vitality });
  const pr = buildProducts(st, m, ms, s, now, products);
  const P = id => pr.all.find(p => p.id === id);
  const cmp = { health: compareHealth(P('health'), s, undefined, { now }), gap: compareGap(P('gap'), s, undefined, { now }), insure: compareInsure(P('insure'), s), life: compareLife(P('life'), s), home: compareHome(s) };
  const verdicts = buildVerdicts(st, cmp, products, { now });
  const sw = buildSwitch(st, cmp, products, { now });
  const rivals = buildRivals(st, cmp, products, { now });
  return { s, budget, m, ms, detected, banking, products, vitality, st, pr, cmp, verdicts, sw, rivals };
}

(async () => {
  /* --- the default example: loads, every product, no NaN --- */
  const r = await pipeline(NOW);
  assert.strictEqual(r.budget.folder, SAMPLE_FOLDER, 'the example budget is found where it is written');
  assert.ok(r.budget.rows.length > 200, `a year of rows (${r.budget.rows.length})`);
  assert.deepStrictEqual(Object.keys(r.budget.accounts).sort(), ['Card', 'Everyday', 'Rainy Day']);
  assert.ok(r.budget.miles && r.budget.miles.rows.length > 0, 'the Miles statement is read');
  assert.ok(r.ms, 'Miles summarised');
  for (const id of IDS) {
    assert.strictEqual(r.products[id], true, `${id} is chosen`);
    /* life is paid through the payslip (settings.life), so no debit shows */
    if (id !== 'life') assert.ok(r.detected[id].found, `${id} is also seen in the statements (${r.detected[id].why})`);
    assert.ok(r.pr.all.find(p => p.id === id), `${id} is built`);
    assert.ok(r.pr.products.find(p => p.id === id), `${id} is shown`);
  }
  assert.deepStrictEqual(r.vitality, { money: true, health: true, drive: true });
  assert.strictEqual(r.banking.kind, 'suite');
  assert.strictEqual(r.banking.tier, 'Black', 'the fees read as the Black Suite the settings answer');
  assert.ok(r.m.months.length >= 12, `a full window (${r.m.months.length} months)`);
  assert.ok(!(r.st.confidence && r.st.confidence.thin), 'the example is not thin data');
  assert.ok(r.verdicts && typeof r.verdicts === 'object', 'verdicts built');
  for (const [name, v] of Object.entries({ st: r.st, pr: r.pr, cmp: r.cmp, verdicts: r.verdicts, sw: r.sw, rivals: r.rivals, m: r.m.figures })) assertFinite(v, name);
  /* the medical aid split is the full answer, not "type your amounts" */
  const debit = r.st.bill && r.st.bill.items ? r.st.bill.items.find(i => i.key === 'product.medical') : null;
  assert.ok(debit, 'the Health debit is in the bill');
  assert.ok(/medical aid, .* gap cover and .* Vitality/.test(debit.note || ''), `the Health debit is split: ${debit.note}`);

  /* --- every preview set-up runs the same pipeline cleanly --- */
  const SETUPS = [
    { setup: 'healthonly' }, { setup: 'gold' }, { setup: 'thin' }, { setup: 'older' },
    { partial: true }, { nomiles: true }, { miles: true }, { setup: 'thin', partial: true },
    { openQuestions: true }, { setup: 'gold', openQuestions: true }, { setup: 'healthonly', openQuestions: true },
  ];
  for (const opts of SETUPS) {
    const x = await pipeline(NOW, opts);
    const name = JSON.stringify(opts);
    assert.strictEqual(x.budget.folder, SAMPLE_FOLDER, name);
    for (const [k, v] of Object.entries({ st: x.st, pr: x.pr, cmp: x.cmp, verdicts: x.verdicts, sw: x.sw, rivals: x.rivals })) assertFinite(v, `${name} ${k}`);
  }
  /* the shapes each set-up promises */
  const ho = await pipeline(NOW, { setup: 'healthonly' });
  assert.strictEqual(ho.products.bank, false, 'healthonly: no Discovery Bank');
  assert.strictEqual(ho.products.health, true);
  assert.ok(!ho.budget.miles || !ho.budget.miles.rows.length, 'healthonly: no Miles statement');
  const gold = await pipeline(NOW, { setup: 'gold' });
  assert.strictEqual(gold.banking.tier, 'Gold');
  assert.strictEqual(gold.products.insure, false);
  const thin = await pipeline(NOW, { setup: 'thin' });
  assert.ok(thin.st.confidence && thin.st.confidence.thin, 'thin: few months');
  assert.ok(!(MILES_PATH in sampleFiles(NOW, { nomiles: true })), 'nomiles leaves the statement out');
  const part = sampleFiles(NOW, { partial: true });
  const lastCard = Object.keys(part).filter(k => /Transactions\/Card\//.test(k)).sort().pop();
  assert.ok(!/-2[1-9] \|/.test(part[lastCard]) && !/-3\d \|/.test(part[lastCard]), 'partial stops on the 20th');

  /* --- the settings: mergeSettings shape, fully answered --- */
  for (const opts of [undefined, { setup: 'gold' }, { setup: 'healthonly' }, { setup: 'older' }, { openQuestions: true }]) {
    const s = sampleSettings(NOW, opts);
    const name = JSON.stringify(opts || {});
    for (const k of Object.keys(DEFAULT_SETTINGS)) assert.ok(k in s, `${name}: ${k} present`);
    for (const k of NESTED) {
      assert.ok(s[k] && typeof s[k] === 'object' && !Array.isArray(s[k]), `${name}: ${k} is an object`);
      for (const sub of Object.keys(DEFAULT_SETTINGS[k])) assert.ok(sub in s[k], `${name}: ${k}.${sub} present`);
      assert.notStrictEqual(s[k], DEFAULT_SETTINGS[k], `${name}: ${k} is a copy, not the default itself`);
    }
    assert.deepStrictEqual(mergeSettings(JSON.parse(JSON.stringify(s))), JSON.parse(JSON.stringify(s)), `${name}: mergeSettings changes nothing`);
    assert.strictEqual(s.onboarded, true, `${name}: onboarded`);
  }
  const s = sampleSettings(NOW);
  for (const id of IDS) assert.strictEqual(s.products[id], true, `products.${id} answered`);
  assert.strictEqual(s.bankKind, 'suite');
  assert.strictEqual(s.suite, 'Black');
  assert.strictEqual(s.suiteAnswered, true);
  for (const k of ['money', 'health', 'drive']) {
    assert.strictEqual(s.vitality[k], true, `vitality.${k}`);
    assert.ok(['Blue', 'Bronze', 'Silver', 'Gold', 'Diamond'].includes(s.status[k]), `status.${k}`);
  }
  assert.deepStrictEqual(s.conditions, { checks: 'both', gym36: true, insurePlan: 'classic', homeCover: 'none' });
  assert.strictEqual(s.members.adults, 2);
  assert.strictEqual(s.members.children, 1);
  assert.strictEqual(typeof s.members.oldestAge, 'number');
  assert.ok(s.health.plan, 'a medical aid plan');
  /* writing to the example never writes into the defaults */
  s.status.money = 'Blue'; s.conditions.checks = 'none'; s.members.adults = 9;
  assert.strictEqual(DEFAULT_SETTINGS.conditions.checks, '');
  assert.strictEqual(DEFAULT_SETTINGS.members.adults, 1);
  assert.strictEqual(sampleSettings(NOW).status.money, 'Diamond');

  /* --- deterministic: the same clock, the same files --- */
  const a = JSON.stringify(sampleFiles(NOW)), b = JSON.stringify(sampleFiles(new Date(NOW.getTime())));
  assert.strictEqual(a, b, 'same now → same files');
  assert.strictEqual(JSON.stringify(sampleSettings(NOW)), JSON.stringify(sampleSettings(new Date(NOW.getTime()))));
  const r2 = await pipeline(new Date(NOW.getTime()));
  assert.strictEqual(JSON.stringify(r2.st.totals || r2.st), JSON.stringify(r.st.totals || r.st), 'same now → same statement');
  /* a later clock moves the window with it: the last month is the one before now */
  const later = sampleFiles(new Date(2027, 2, 10));
  assert.ok(Object.keys(later).some(k => /Card\/2027-02\.md$/.test(k)) && !Object.keys(later).some(k => /2027-03\.md$/.test(k)), 'thirteen months up to the month before now');
  /* the source: paths, a Promise read, stat */
  const src = sampleSource(NOW);
  const ps = src.paths();
  assert.ok(ps.length === Object.keys(sampleFiles(NOW)).length && ps.every(p => /\.(md|csv)$/.test(p)));
  const rd = src.read(ps[0]);
  assert.ok(rd && typeof rd.then === 'function', 'read returns a Promise');
  assert.strictEqual(await rd, sampleFiles(NOW)[ps[0]]);
  assert.strictEqual(await src.read('Nope.md'), '');
  assert.strictEqual(src.stat(ps[0]).size, sampleFiles(NOW)[ps[0]].length);

  /* --- made-up data only, and plugin-safe source --- */
  const all = Object.entries(sampleFiles(NOW)).map(([k, v]) => k + '\n' + v).join('\n');
  const digits = all.match(/\d{8,}/g) || [];
  assert.ok(digits.every(d => d === '1234567890' || /^20\d{6}$/.test(d)), `only the fake account number: ${digits.filter(d => d !== '1234567890')}`);
  assert.ok(/Sometown/i.test(all));
  /* the code, without its comments (which may name what it avoids) */
  const text = fs.readFileSync(path.join(__dirname, '..', 'src', 'sample.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/Math\.random|Date\.now\(\)|new Date\(\)/.test(text), 'deterministic: no Math.random, no clock of its own');
  assert.ok(!/\bdocument\b|\bwindow\b|localStorage|require\(['"](?:node:)?(?:fs|path|os|crypto)/.test(text), 'no DOM, no Node APIs');
  assert.ok(!text.includes('(?<'), 'no lookbehind or named groups (iOS 15)');

  console.log('sample.test.cjs: all passed');
})().catch(e => { console.error(e); process.exit(1); });
