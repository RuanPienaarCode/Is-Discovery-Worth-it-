'use strict';
/* Typed numbers (src/manual.js): the answers become twelve identical whole
   months of Budget-style notes that the real pipeline reads unchanged.
   Deterministic; every product; a blank is not counted (no row, never a
   guess); the bank fee is the published one or what was typed; gap cover
   inside the Health debit is not counted twice; a Miles CSV in the vault
   still comes through but the vault's notes never do; no NaN anywhere; and
   what would be "From your statements" is "You entered". Every figure here
   is made up. */
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { DEFAULT_SETTINGS } = require('../src/constants');
const { loadBudget } = require('../src/load');
const { measure, trailingWindow } = require('../src/measure');
const { summariseMiles } = require('../src/miles');
const { buildStatement } = require('../src/model');
const { buildProducts } = require('../src/products');
const { buildVerdicts } = require('../src/verdict');
const { detectProducts, detectBanking, resolveProducts, resolveVitality } = require('../src/detect');
const { compareHealth, compareGap, compareInsure, compareLife, compareHome } = require('../src/compare');
const { summaryMarkdown } = require('../src/summary-note');
const { marketAge } = require('../src/market');
const { sampleFiles, MILES_PATH } = require('../src/sample');
const M = require('../src/manual');

const NOW = new Date(2026, 10, 3);
const copy = o => JSON.parse(JSON.stringify(o));
const ALL = { bank: true, health: true, gap: true, insure: true, life: true };
const TYPED = {
  cardSpend: 12000, checkers: 2500, woolworths: 1200, pnp: 800, clicks: 350, dischem: 150, fuel: 1800,
  interest: 15, health: 6200, claims: 2400, gym: 400, flights: 4800, gap: 220, gapInHealth: false, insure: 1300, life: 700,
};
const settingsOf = (over, manual) => Object.assign(copy(DEFAULT_SETTINGS), {
  onboarded: true, dataSource: 'manual', products: ALL, bankKind: 'suite', suite: 'Platinum', suiteAnswered: true,
}, over || {}, { manual: Object.assign({}, M.MANUAL_DEFAULTS, { done: true }, manual || {}) });

async function run(s, vault) {
  const budget = await loadBudget(M.manualSource(s, NOW, vault), M.MANUAL_FOLDER);
  const win = trailingWindow(NOW, s.months, budget);
  const m = measure(budget.rows, budget.accounts, budget.categories, { ...win, notCardSpend: [] });
  const ms = budget.miles ? summariseMiles(budget.miles.rows, m.from, m.to) : null;
  const detected = detectProducts(budget), banking = detectBanking(budget);
  const products = resolveProducts(s, detected), vitality = resolveVitality(s, detected, banking);
  const st = buildStatement(m, s, ms, { products, vitality });
  const pr = buildProducts(st, m, ms, s, NOW, products);
  const P = id => pr.all.find(p => p.id === id);
  const cmp = { health: compareHealth(P('health'), s, undefined, { now: NOW }), gap: compareGap(P('gap'), s, undefined, { now: NOW }), insure: compareInsure(P('insure'), s), life: compareLife(P('life'), s), home: compareHome(s) };
  const verdicts = buildVerdicts(st, cmp, products, { now: NOW });
  return { budget, win, m, ms, detected, banking, products, st, pr, P, verdicts };
}
/* every number anywhere inside a value is finite */
function noNaN(where, v, seen) {
  const s = seen || new Set();
  if (typeof v === 'number') return assert.ok(Number.isFinite(v) || v === Infinity, `${where} is ${v}`);
  if (!v || typeof v !== 'object' || s.has(v)) return;
  s.add(v);
  for (const k of Object.keys(v)) noNaN(`${where}.${k}`, v[k], s);
}
const rowsOf = (files, re) => Object.values(files).join('\n').split('\n').filter(l => re.test(l));

(async () => {
  /* ── deterministic, twelve whole months ─────────────────────────── */
  const s = settingsOf({}, TYPED);
  const f1 = M.manualFiles(s, NOW), f2 = M.manualFiles(copy(s), new Date(NOW.getTime()));
  assert.deepStrictEqual(f1, f2, 'same settings and clock → same files');
  const months = new Set(Object.keys(f1).map(p => (/(\d{4}-\d\d)\.md$/.exec(p) || [])[1]).filter(Boolean));
  assert.strictEqual(months.size, 12, 'twelve months');
  assert.ok(months.has('2026-10') && months.has('2025-11') && !months.has('2026-11'), 'the twelve months before this one');
  for (const p of Object.keys(f1)) assert.ok(p.startsWith(M.MANUAL_FOLDER + '/'), `${p} lives in the typed folder`);
  const text = JSON.stringify(f1);
  assert.ok(!/\bNaN\b|undefined/.test(text), 'no NaN or undefined in the notes');
  /* identical months: the same rows every month but the one booking */
  const monthRows = ym => rowsOf(Object.fromEntries(Object.entries(f1).filter(([k]) => k.endsWith(ym + '.md'))), /^\| \d/).map(l => l.slice(13)).sort();
  assert.deepStrictEqual(monthRows('2026-01'), monthRows('2026-09'), 'every month is the same month');

  /* ── every product, through the whole pipeline ─────────────────── */
  const r = await run(s);
  assert.ok(!r.win.windowNote, 'each month counts as a whole month (no window note)');
  assert.strictEqual(r.m.dataMonths.length, 12, 'twelve months of Discovery data');
  for (const id of Object.keys(ALL)) assert.ok(r.detected[id].found && !r.detected[id].ended, `${id} is found and not ended`);
  assert.strictEqual(r.banking.kind, 'suite');
  assert.strictEqual(r.banking.tier, 'Platinum', 'the published Platinum fee reads as Platinum');
  assert.ok(Math.abs(r.st.cardSpend - 12000 * 12) < 1, `card spend is the typed month a year (${r.st.cardSpend})`);
  assert.ok(!r.st.confidence.thin, 'twelve months is not thin');
  const paid = id => r.P(id).paid;
  assert.ok(Math.abs(paid('health') - 6200 * 12) < 1, 'Health: the typed debit order a year');
  assert.ok(Math.abs(r.P('health').refunds - 2400) < 1, 'Health: the typed claims a year');
  assert.ok(Math.abs(paid('gap') - 220 * 12) < 1, 'Gap cover: the typed premium a year');
  assert.ok(Math.abs(paid('insure') - 1300 * 12) < 1, 'Insure: the typed premium a year');
  assert.ok(Math.abs(paid('life') - 700 * 12) < 1, 'Life: the typed premium a year');
  const fee = k => (r.st.lines.find(l => l.key === k) || {}).annual || 0;
  assert.ok(Math.abs(fee('fee.account') - 190 * 12) < 1 && Math.abs(fee('fee.facility') - 69 * 12) < 1 && Math.abs(fee('fee.vitalityMoney') - 81 * 12) < 1, 'published Platinum Suite fees');
  assert.ok(Math.abs(fee('interest.boost') - 15 * 12) < 1, 'the typed extra interest');
  const gymLine = r.st.lines.find(l => l.key === 'gym');
  assert.ok(gymLine && Math.abs(gymLine.annual - 400 * 12) < 1, 'the typed gym fee');
  assert.ok(r.st.lines.some(l => l.key === 'travel.bank' && l.annual > 0), 'the typed flights earn the flight discount');
  noNaN('statement', { cost: r.st.cost, value: r.st.value, net: r.st.net, lines: r.st.lines.map(l => l.annual), cardSpend: r.st.cardSpend });
  noNaN('products', r.pr.products.map(p => ({ paid: p.paid, figure: p.figure, back: p.back.map(b => b.v) })));
  noNaN('totals', r.pr.totals);
  for (const [id, v] of Object.entries(r.verdicts)) if (v) assert.ok(typeof v.word === 'string' && v.word, `${id} has a verdict word`);

  /* ── the page's words: "You entered", not "From your statements" ── */
  for (const l of r.st.lines) if (l.source === 'measured') assert.strictEqual(M.typedSource(l.source), 'entered', `${l.key}: measured is shown as entered`);
  assert.strictEqual(M.typedSource('estimated'), 'estimated', 'an estimate stays an estimate');
  assert.strictEqual(M.typedSource('statement'), 'statement', 'the Miles statement stays the Miles statement');
  const page = fs.readFileSync(path.join(__dirname, '../src/bottom-line.js'), 'utf8');
  assert.ok(/entered: 'You entered'/.test(page), 'the entered badge reads "You entered"');
  assert.ok(/typed\(\) \? typedSource\(o\.source\)/.test(page), 'the page relabels sources when the numbers were typed');
  const summary = M.manualWords(summaryMarkdown({ st: r.st, pr: r.pr, verdicts: r.verdicts, sw: null, s, now: NOW, market: marketAge(NOW), levers: [], version: 'test' }) || '');
  assert.ok(!/your statements/i.test(summary), 'the summary note says nothing about statements');

  /* ── a blank is not counted ─────────────────────────────────────── */
  const blank = M.manualFiles(settingsOf({ products: { bank: false, health: true, gap: false, insure: false, life: false } }, {}), NOW);
  assert.deepStrictEqual(Object.keys(blank), [], 'nothing typed, no bank: no notes at all');
  const some = M.manualFiles(settingsOf({ products: { bank: false, health: true, gap: false, insure: false, life: false } }, { health: 5000, claims: null, gym: '' }), NOW);
  assert.strictEqual(rowsOf(some, /DISC PREM/).length, 12, 'the typed Health debit, every month');
  assert.strictEqual(rowsOf(some, /DISC MEMB|VIRGIN/).length, 0, 'blank claims and gym: no rows');
  assert.ok(!Object.keys(some).some(p => /\/Card\/|\/Everyday\//.test(p)), 'no Discovery Bank accounts without the bank');
  /* a product not ticked is not counted, whatever was typed for it */
  const unticked = M.manualFiles(settingsOf({ products: { bank: true, health: false, gap: false, insure: false, life: false } }, TYPED), NOW);
  assert.strictEqual(rowsOf(unticked, /DISC PREM|DISCINSURE|INSGAP|DISCOVERY LIFE/).length, 0, 'unticked products make no rows');

  /* ── the bank's fees ────────────────────────────────────────────── */
  const noVm = M.manualFiles(settingsOf({ vitality: { money: false } }, TYPED), NOW);
  assert.strictEqual(rowsOf(noVm, /Vitality Money Premium/).length, 0, 'no Vitality Money: its premium is left out of the published fee');
  const typedFee = M.manualFiles(settingsOf({}, { ...TYPED, feesHow: 'typed', fees: 275 }), NOW);
  assert.strictEqual(rowsOf(typedFee, /Monthly Account fee \| Bank charges & fees \| -275\.00/).length, 12, 'typed fees: that amount, every month');
  assert.strictEqual(rowsOf(typedFee, /facility fee|Vitality Money Premium/).length, 0, 'typed fees: nothing published added');
  const typedBlank = M.manualFiles(settingsOf({}, { ...TYPED, feesHow: 'typed', fees: null }), NOW);
  assert.strictEqual(rowsOf(typedBlank, /fee \|/).length, 0, 'typed fees left blank: not counted');
  const purple = M.manualFiles(settingsOf({ suite: 'Purple' }, TYPED), NOW);
  assert.strictEqual(rowsOf(purple, /Annual card fee/).length, 1, 'Purple: the annual card fee once in the year');
  assert.strictEqual(M.publishedFees({ suite: 'Black', bankKind: 'suite' }).total, 605, 'the published Black Suite fee');
  /* a transaction account: fees and spend on it, spend read as debit card */
  const tx = await run(settingsOf({ bankKind: 'transaction', suite: 'Gold' }, TYPED));
  assert.strictEqual(tx.banking.kind, 'transaction');
  assert.strictEqual(tx.st.cardSpendSource, 'debit', 'a transaction account spends on its debit card');
  /* savings only: no fees question, no fees */
  const sav = M.manualFiles(settingsOf({ bankKind: 'savings' }, TYPED), NOW);
  assert.strictEqual(rowsOf(sav, /fee \|/).length, 0, 'savings only: no fees');
  assert.ok(!M.manualQuestions(settingsOf({ bankKind: 'savings' })).some(q => q.id === 'fees' || q.id === 'cardSpend'), 'savings only: no fee or card questions');

  /* ── gap cover inside the Health debit order ────────────────────── */
  const inS = settingsOf({}, { ...TYPED, gapInHealth: true });
  M.applyManual(inS);
  assert.strictEqual(inS.bill.gap, 220, 'gap inside Health: bill.gap is the typed gap cover');
  assert.strictEqual(rowsOf(M.manualFiles(inS, NOW), /INSGAP/).length, 0, 'and no gap debit order of its own');
  const inR = await run(inS);
  assert.ok(Math.abs(inR.P('health').debitYear - 6200 * 12) < 1, 'the Health debit is what was typed');
  inS.manual.gapInHealth = false;
  M.applyManual(inS);
  assert.ok(!('gap' in inS.bill), 'its own debit order again: bill.gap cleared');

  /* ── the vault: its Miles CSV counts, its notes never do ────────── */
  const vf = sampleFiles(NOW, {});
  const vault = { paths: () => Object.keys(vf), read: p => Promise.resolve(vf[p] || ''), stat: p => ({ mtime: 1, size: (vf[p] || '').length }) };
  const src = M.manualSource(s, NOW, vault);
  assert.ok(src.paths().includes(MILES_PATH), 'the vault\'s Miles CSV comes through');
  assert.ok(!src.paths().some(p => /\.md$/.test(p) && !p.startsWith(M.MANUAL_FOLDER + '/')), 'the vault\'s notes do not');
  const withMiles = await run(s, vault);
  assert.ok(withMiles.budget.miles && withMiles.budget.miles.rows.length > 0, 'the Miles statement is read');
  assert.strictEqual(withMiles.st.mileSource, 'statement', 'and counts');
  assert.strictEqual(withMiles.budget.folder, M.MANUAL_FOLDER);

  /* ── questions follow the products ──────────────────────────────── */
  const ids = p => M.manualQuestions(settingsOf({ products: p })).map(q => q.id);
  assert.deepStrictEqual(ids({ health: true }), ['groceries', 'pharmacy', 'health', 'claims', 'gym', 'flights']);
  assert.deepStrictEqual(ids({ insure: true }), ['fuel', 'insure']);
  assert.deepStrictEqual(ids({ life: true }), ['life']);
  assert.deepStrictEqual(ids(ALL), ['fees', 'cardSpend', 'groceries', 'pharmacy', 'fuel', 'interest', 'health', 'claims', 'gym', 'flights', 'gap', 'insure', 'life']);
  for (const q of M.QUESTIONS) assert.ok(/^Where to find it: /.test(q.where), `${q.id}: says where to find it`);

  /* ── the words ──────────────────────────────────────────────────── */
  const W = M.manualWords;
  assert.strictEqual(W('Money back for doctor bills (shown as DISC MEMB on your statements).'), 'Money back for doctor bills.');
  assert.strictEqual(W('The account\'s monthly fee on your Discovery statements.'), 'The account\'s monthly fee in the figures you typed.');
  assert.strictEqual(W('From your statements: you paid R 10.'), 'From the figures you typed: you paid R 10.');
  assert.strictEqual(W('Your last Discovery Health debit order was R 6 200 on 25 Oct 2026. For 2 adults, only X fits it.'), 'You typed a Discovery Health debit order of R 6 200 a month. For 2 adults, only X fits it.');
  assert.strictEqual(W('You paid R 4 800 to Virgin Active or Planet Fitness in the last 12 months.'), 'You paid R 4 800 to Virgin Active or Planet Fitness in a year, by the figures you typed.');
  assert.strictEqual(W('Have you done your Vitality Age in the last 12 months?'), 'Have you done your Vitality Age in the last 12 months?', 'a question about the last year is left alone');
  assert.strictEqual(W('Read from your Miles statement.'), 'Read from your Miles statement.', 'the Miles statement is a real statement');
  assert.strictEqual(W(''), '');
  /* rewordTree changes text nodes only */
  const tree = { childNodes: [{ nodeType: 3, nodeValue: 'Debit orders on your statements.' }, { nodeType: 1, childNodes: [{ nodeType: 3, nodeValue: 'From your statements' }] }] };
  M.rewordTree(tree);
  assert.strictEqual(tree.childNodes[0].nodeValue, 'Debit orders in the figures you typed.');
  assert.strictEqual(tree.childNodes[1].childNodes[0].nodeValue, 'From the figures you typed');

  /* ── public repo, iOS 15 floor ──────────────────────────────────── */
  for (const f of ['manual.js', 'manual-form.js']) {
    const code = fs.readFileSync(path.join(__dirname, '../src', f), 'utf8');
    assert.ok(!code.includes('(?<'), `${f}: no lookbehind`);
    assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML/.test(code), `${f}: no HTML strings`);
    assert.ok(!/require\(['"](?:node:)?(?:fs|path|os|crypto)/.test(code), `${f}: no Node APIs`);
  }
  assert.ok(!/\bdocument\b|\bwindow\b|localStorage/.test(fs.readFileSync(path.join(__dirname, '../src/manual.js'), 'utf8')), 'manual.js: no DOM globals');

  console.log('manual: typed months OK');
})().catch(e => { console.error(e); process.exit(1); });
