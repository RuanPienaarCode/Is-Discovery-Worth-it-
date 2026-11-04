'use strict';
/* "Over time" (src/trend.js, src/ui-trend.js): complete calendar quarters,
   oldest first, at most 8, only those holding Discovery data; each quarter
   is the real pipeline over its own window (quarter totals, not a year);
   totals are the sum of the products; rough and enough flags; the note in
   plain words; no NaN with gaps; the same answer every time. Made-up
   household only ("Sam" in "Sometown"). */
const assert = require('node:assert');
const path = require('node:path');
const Module = require('node:module');

const root = path.join(__dirname, '..');
const origLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'obsidian') return { setIcon: () => {} };
  return origLoad.call(this, request, ...rest);
};
const { buildTrend, quarterWindow, discoveryMonths } = require(path.join(root, 'src/trend.js'));
const { renderTrend, resultText, chartLayout, chartLabel, productIds } = require(path.join(root, 'src/ui-trend.js'));
const { measure } = require(path.join(root, 'src/measure.js'));
const { buildStatement } = require(path.join(root, 'src/model.js'));
const { buildProducts } = require(path.join(root, 'src/products.js'));
const { DEFAULT_SETTINGS } = require(path.join(root, 'src/constants.js'));
Module._load = origLoad;

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg || ''} ${a} != ${b}`);
const clone = o => JSON.parse(JSON.stringify(o));

/* ── a made-up household ─────────────────────────────────────────────── */
const accounts = {
  'Sam Everyday': { institution: 'Discovery Bank', type: 'checking' },
  'Sam Card': { institution: 'Discovery Bank', type: 'credit_card' },
  'Sometown Cheque': { institution: 'Sometown Bank', type: 'checking' },
};
const pad = n => String(n).padStart(2, '0');
/* one month of rows: the account fee, card swipes, the Health debit (paid
   from the other bank), the Insure premium. `fee` changes the account fee
   so a quarter can cost more. `last` = the last day the month has rows. */
function monthRows(ym, o) {
  const x = o || {};
  const fee = x.fee || 300;
  const last = x.last || 28;
  const rows = [
    { date: `${ym}-02`, description: 'Monthly Account Fee', amount: -fee, account: 'Sam Everyday', category: 'Bank fees' },
    { date: `${ym}-05`, description: 'Card purchase Sometown Hardware', amount: -1500, account: 'Sam Card', category: 'Home' },
    { date: `${ym}-01`, description: 'DISC PREM 1234', amount: -4000, account: 'Sometown Cheque', category: 'Medical aid' },
    { date: `${ym}-03`, description: 'DISCINSURE premium', amount: -900, account: 'Sam Everyday', category: 'Insurance' },
  ];
  if (x.claim) rows.push({ date: `${ym}-12`, description: 'DISC MEMB claim refund', amount: x.claim, account: 'Sometown Cheque', category: 'Medical aid' });
  rows.push({ date: `${ym}-${pad(last)}`, description: 'Card purchase Sometown Deli', amount: -200, account: 'Sam Card', category: 'Food' });
  return rows;
}
function ymRange(from, to) {
  const out = [];
  let [y, m] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) { out.push(`${y}-${pad(m)}`); m++; if (m > 12) { m = 1; y++; } }
  return out;
}
/* Nov 2024 to Sep 2026; nothing at all in Apr to Jun 2025; Feb 2026 missing;
   the account fee goes up from Jan 2026; a claim in Aug 2025 */
const skip = new Set(['2025-04', '2025-05', '2025-06', '2026-02']);
const rows = [];
for (const ym of ymRange('2024-11', '2026-09')) {
  if (skip.has(ym)) continue;
  rows.push(...monthRows(ym, { fee: ym >= '2026-01' ? 450 : 300, claim: ym === '2025-08' ? 1200 : 0 }));
}
const budget = { rows, accounts, categories: { 'Bank fees': 'expense', Home: 'expense', 'Medical aid': 'expense', Insurance: 'insurance', Food: 'expense' }, miles: null };
const s = { ...clone(DEFAULT_SETTINGS), onboarded: true, status: { money: 'Gold', health: 'Blue', drive: 'Blue' } };
const now = new Date(2026, 9, 15); // 15 Oct 2026

let calls = 0;
const statementFor = (m, ms) => { calls++; return buildStatement(m, s, ms); };
const tr = buildTrend({ budget, s, now, buildStatementFor: statementFor });

// ── quarters: complete, ordered oldest first, only those with Discovery data
assert.deepStrictEqual(tr.quarters.map(q => q.from), ['2024-10', '2025-01', '2025-07', '2025-10', '2026-01', '2026-04', '2026-07'], 'Apr to Jun 2025 (no data) is left out; Oct 2026 is not complete');
assert.deepStrictEqual(tr.quarters.map(q => q.to), ['2024-12', '2025-03', '2025-09', '2025-12', '2026-03', '2026-06', '2026-09']);
assert.strictEqual(tr.quarters[6].label, 'Jul to Sep 2026');
assert.strictEqual(tr.quarters[0].label, 'Oct to Dec 2024');
assert.strictEqual(tr.quarters[6].short, 'Jul');
assert.strictEqual(tr.quarters[6].year, '2026');
for (let i = 1; i < tr.quarters.length; i++) assert.ok(tr.quarters[i - 1].from < tr.quarters[i].from, 'newest last');
assert.strictEqual(calls, tr.quarters.length, 'one statement per quarter, no more');

// ── rough: fewer than 3 months of Discovery data
assert.deepStrictEqual(tr.quarters.map(q => q.months), [2, 3, 3, 3, 2, 3, 3]);
assert.deepStrictEqual(tr.quarters.map(q => q.rough), [true, false, false, false, true, false, false]);
assert.strictEqual(tr.enough, true, 'five full quarters are enough');

// ── totals are the sum of the products, after = back less paid
for (const q of tr.quarters) {
  const ids = Object.keys(q.products);
  assert.ok(ids.length > 0, 'each quarter has products');
  near(q.total.paid, ids.reduce((a, id) => a + q.products[id].paid, 0), `${q.label} paid`);
  near(q.total.back, ids.reduce((a, id) => a + q.products[id].back, 0), `${q.label} back`);
  near(q.total.after, ids.reduce((a, id) => a + q.products[id].after, 0), `${q.label} after`);
  near(q.total.after, q.total.back - q.total.paid, `${q.label} after = back less paid`);
  for (const id of ids) near(q.products[id].after, q.products[id].back - q.products[id].paid, `${q.label} ${id} after`);
}

// ── the real pipeline over the quarter, as 3-month totals (not a year)
{
  const q = tr.quarters[6];
  const m = measure(rows, accounts, budget.categories, { from: q.from, to: q.to, notCardSpend: s.notCardSpend });
  const st = buildStatement(m, s, null);
  const pr = buildProducts(st, m, null, s, now);
  near(q.total.paid, pr.totals.paid / 4, 'a quarter of the pipeline\'s year');
  near(q.total.back, pr.totals.value / 4, 'what came back is the pipeline\'s value');
  // read straight off the statements: three Health debits and three Insure premiums
  near(q.products.health.paid, 3 * 4000, 'three Health debits in Jul to Sep');
  near(q.products.insure.paid, 3 * 900, 'three Insure premiums in Jul to Sep');
  assert.ok(q.products.bank.paid >= 3 * 450, 'the account fee for three months is in the bank\'s paid');
}
// the claim in Aug 2025 comes back in Jul to Sep 2025 only
near(tr.quarters[2].products.health.back, 1200, 'the Aug 2025 claim');
assert.ok(tr.quarters[3].products.health.back < 0.5, 'nothing came back from Health in Oct to Dec 2025');

// ── the note: the newest full quarter against the same months a year before
{
  const a = tr.quarters[2], b = tr.quarters[6];
  const diff = b.total.after - a.total.after;
  assert.ok(diff < 0, 'a higher fee and no claim: worse off');
  assert.strictEqual(tr.compare.with, 'year');
  near(tr.compare.diff, diff);
  assert.ok(tr.note.startsWith('After rewards, you were R'), tr.note);
  assert.ok(/worse off in Jul to Sep 2026 than in the same months a year before\.$/.test(tr.note), tr.note);
  assert.ok(!/[−-]R|\bminus\b|\bnet\b/.test(tr.note), 'no minus signs or "net" in the note');
}

// ── no year before: against the full quarter before it
{
  const short = { ...budget, rows: rows.filter(r => r.date >= '2026-03') };
  const t = buildTrend({ budget: short, s, now });
  assert.deepStrictEqual(t.quarters.map(q => q.from), ['2026-01', '2026-04', '2026-07']);
  assert.deepStrictEqual(t.quarters.map(q => q.rough), [true, false, false]);
  assert.strictEqual(t.enough, true);
  assert.strictEqual(t.compare.with, 'previous');
  assert.ok(/(about the same as Apr to Jun 2026\.|off in Jul to Sep 2026 than in Apr to Jun 2026\.)$/.test(t.note), t.note);
}

// ── not enough: one full quarter
{
  const one = { ...budget, rows: rows.filter(r => r.date >= '2026-05') };
  const t = buildTrend({ budget: one, s, now });
  assert.deepStrictEqual(t.quarters.map(q => q.rough), [true, false]);
  assert.strictEqual(t.enough, false);
  assert.strictEqual(t.compare, null);
  assert.strictEqual(t.note, 'Not enough months yet to see a trend — import at least two quarters.');
}

// ── statements that stop part of the way through a month: that month and its quarter are not complete
{
  const cut = { ...budget, rows: rows.filter(r => r.date < '2026-09-10') };
  const t = buildTrend({ budget: cut, s, now });
  assert.strictEqual(t.quarters[t.quarters.length - 1].from, '2026-04', 'Jul to Sep 2026 is not complete');
}

// ── at most 8 quarters, the newest ones
{
  const long = [];
  for (const ym of ymRange('2022-01', '2026-09')) long.push(...monthRows(ym));
  const t = buildTrend({ budget: { ...budget, rows: long }, s, now });
  assert.strictEqual(t.quarters.length, 8);
  assert.strictEqual(t.quarters[0].from, '2024-10');
  assert.strictEqual(t.quarters[7].from, '2026-07');
  assert.ok(t.quarters.every(q => !q.rough));
  assert.strictEqual(buildTrend({ budget: { ...budget, rows: long }, s, now, max: 3 }).quarters.length, 3, 'max is honoured');
}

// ── no Discovery data: nothing to show, said plainly
{
  const other = { rows: [{ date: '2026-05-04', description: 'Card purchase Sometown Deli', amount: -100, account: 'Sometown Cheque' }], accounts, categories: {} };
  assert.strictEqual(discoveryMonths(other).size, 0);
  const t = buildTrend({ budget: other, s, now });
  assert.deepStrictEqual(t.quarters, []);
  assert.strictEqual(t.enough, false);
  const e = buildTrend({ budget: null, s, now });
  assert.deepStrictEqual(e.quarters, []);
  assert.strictEqual(typeof e.note, 'string');
}
// a Discovery premium on another bank is Discovery data on its own
assert.ok(discoveryMonths({ rows: [{ date: '2026-05-01', description: 'DISC PREM 1234', amount: -4000, account: 'Sometown Cheque' }], accounts }).has('2026-05'));

// ── chosen products only
{
  const t = buildTrend({ budget, s, now, products: { bank: true, health: true, gap: false, insure: false, life: false } });
  for (const q of t.quarters) assert.deepStrictEqual(Object.keys(q.products).sort(), ['bank', 'health']);
  assert.deepStrictEqual(productIds(t), ['bank', 'health']);
}

// ── no NaN anywhere, gaps and all
const walk = (v, where) => {
  if (typeof v === 'number') assert.ok(Number.isFinite(v), `NaN or Infinity at ${where}`);
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, where + '.' + k);
};
walk(tr, 'trend');

// ── deterministic
assert.strictEqual(JSON.stringify(buildTrend({ budget, s, now })), JSON.stringify(buildTrend({ budget, s, now })), 'the same answer every time');
assert.strictEqual(JSON.stringify(buildTrend({ budget, s, now, buildStatementFor: statementFor })), JSON.stringify(tr));

// ── quarterWindow
assert.deepStrictEqual(quarterWindow(2026, 0), { from: '2026-01', to: '2026-03', label: 'Jan to Mar 2026', short: 'Jan', year: '2026' });
assert.deepStrictEqual(quarterWindow(2025, 3), { from: '2025-10', to: '2025-12', label: 'Oct to Dec 2025', short: 'Oct', year: '2025' });

// ── ui-trend pure helpers
const { money } = require(path.join(root, 'src/format.js'));
assert.strictEqual(resultText(1200), money(1200) + ' better off');
assert.strictEqual(resultText(-300), money(300) + ' worse off');
assert.strictEqual(resultText(0.2), 'about the same');
assert.strictEqual(resultText(NaN), 'about the same');
{
  const L = chartLayout(tr, 'all');
  assert.strictEqual(L.cols.length, tr.quarters.length);
  assert.ok(L.width <= 320, '8 quarters fit 320 wide');
  walk(L, 'layout');
  for (const c of L.cols) {
    assert.ok(c.paid.h >= 0 && c.back.h >= 0, 'bars never upside down');
    near(c.paid.y + c.paid.h, L.zeroY, 'bars stand on the zero line');
  }
  // the bigger figure gets the taller bar
  const q = tr.quarters[6];
  assert.strictEqual(q.total.paid > q.total.back, L.cols[6].paid.h > L.cols[6].back.h);
  // after rewards below zero sits under the zero line
  assert.ok(q.total.after < 0 && L.cols[6].after.y > L.zeroY);
  const z = chartLayout({ quarters: [{ label: 'x', products: {}, total: { paid: 0, back: 0, after: 0 } }] }, 'all');
  walk(z, 'all-zero layout');
  const label = chartLabel(tr, 'all');
  assert.ok(/Chart of 7 quarters/.test(label) && /In Jul to Sep 2026 you paid R/.test(label), label);
  assert.ok(!/[−-]R/.test(label), 'no minus signs in the spoken summary');
  assert.ok(/for Health/.test(chartLabel(tr, 'health')));
}

// ── renderTrend runs against a tiny DOM: heading, the note, the chart, the named button and its table
{
  const make = tag => {
    const n = {
      tagName: tag.toUpperCase(), children: [], attrs: {}, style: {}, dataset: {}, listeners: {}, className: '', hidden: false, _text: '',
      get firstChild() { return this.children[0] || null; },
      get textContent() { return this._text + this.children.map(c => c.textContent).join(''); },
      set textContent(v) { this._text = String(v); this.children = []; },
      appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
      removeChild(c) { this.children = this.children.filter(x => x !== c); return c; },
      setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'class') this.className = String(v); },
      getAttribute(k) { return this.attrs[k] === undefined ? null : this.attrs[k]; },
      addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); },
      click() { for (const f of this.listeners.click || []) f({ preventDefault() {} }); },
    };
    return n;
  };
  global.document = { createElement: make, createElementNS: (ns, tag) => make(tag) };
  const all = (n, pred, out = []) => { if (pred(n)) out.push(n); for (const c of n.children) all(c, pred, out); return out; };
  const has = cls => n => (' ' + n.className + ' ').includes(' ' + cls + ' ');

  const panel = make('div');
  const sec = renderTrend(panel, { s, period: 'annual', money, per: v => v, now, trend: tr });
  assert.ok(has('dc-trend')(sec));
  assert.strictEqual(all(sec, n => n.tagName === 'H2')[0].textContent, 'Over time');
  assert.strictEqual(all(sec, has('dc-trend-line'))[0].textContent, tr.note);
  const chart = all(sec, n => n.tagName === 'SVG')[0];
  assert.ok(chart && chart.attrs.role === 'img' && /Chart of 7 quarters/.test(chart.attrs['aria-label']));
  assert.strictEqual(all(chart, n => n.tagName === 'RECT').length, tr.quarters.length * 2, 'two bars a quarter');
  assert.strictEqual(all(chart, n => n.tagName === 'CIRCLE').length, tr.quarters.length, 'a marker a quarter');
  assert.strictEqual(all(chart, n => n.tagName === 'POLYLINE').length, 1, 'one after-rewards line');
  const toggle = all(sec, has('dc-trend-more'))[0];
  assert.strictEqual(toggle.textContent, 'Show the numbers');
  assert.strictEqual(toggle.attrs['aria-expanded'], 'false');
  const numbers = all(sec, has('dc-trend-numbers'))[0];
  assert.strictEqual(numbers.hidden, true);
  assert.strictEqual(toggle.attrs['aria-controls'], numbers.id);
  toggle.click();
  assert.strictEqual(numbers.hidden, false);
  assert.strictEqual(toggle.textContent, 'Hide the numbers');
  const bodyRows = all(numbers, n => n.tagName === 'TR' && n.parentNode && n.parentNode.tagName === 'TBODY');
  assert.strictEqual(bodyRows.length, tr.quarters.length);
  assert.ok(bodyRows[0].textContent.startsWith('Jul to Sep 2026'), 'newest first in the table');
  const text = numbers.textContent;
  assert.ok(/worse off|better off|about the same/.test(text));
  assert.ok(!/−R|-R|\bminus\b|\bnet\b/.test(text), 'no minus signs or "net" in the table');
  assert.ok(/rough: 2 months of statements/.test(text));
  // the product buttons switch the chart to one product
  const chips = all(sec, has('dc-trend-chip'));
  assert.deepStrictEqual(chips.map(c => c.textContent), ['All products', 'Bank', 'Health', 'Gap cover', 'Insure', 'Life'], 'no products map: all five');
  assert.strictEqual(chips[0].attrs['aria-pressed'], 'true');
  chips[2].click();
  assert.strictEqual(chips[2].attrs['aria-pressed'], 'true');
  assert.ok(/for Health/.test(all(sec, n => n.tagName === 'SVG')[0].attrs['aria-label']));
  chips[0].click();
  // an empty trend: heading and the note only
  const p2 = make('div');
  const sec2 = renderTrend(p2, { trend: buildTrend({ budget: null, s, now }) });
  assert.strictEqual(all(sec2, n => n.tagName === 'SVG').length, 0);
  assert.strictEqual(all(sec2, has('dc-trend-more')).length, 0);
  delete global.document;
}

console.log('trend ok');
