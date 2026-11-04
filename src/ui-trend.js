'use strict';
/* "Over time" (Flows): a heading, one line saying which way things are
   going (trend.note), and a chart of each quarter — what you paid and what
   came back as two bars, the result after rewards as a marker line. Behind
   "Show the numbers", the same figures as a plain table. With more than one
   product, a row of buttons switches the chart and the table between all
   products and one.

   The chart is SVG built with createElementNS; everything else with dom.js
   el(). No innerHTML, no libraries, no glows. Colours come from the --dc-*
   tokens in src/css/trend.css (under .dc-trend). */

const { el, button, clear } = require('./dom');
const { money } = require('./format');

const NS = 'http://www.w3.org/2000/svg';
const NAMES = { bank: 'Bank', health: 'Health', gap: 'Gap cover', insure: 'Insure', life: 'Life' };
const ORDER = ['bank', 'health', 'gap', 'insure', 'life'];

/* the chart's grid, in viewBox units: 8 quarters fit 320 wide */
const COL = 40, BAR = 13, BAR_GAP = 3, TOP = 12, PLOT_H = 150, LABEL_H = 38, MIN_COLS = 4;
/* the chart grows with the pane up to this many times its viewBox width */
const MAX_SCALE = 1.4;

/* which products the chart shows ('all' or a product id), kept while the
   page re-renders */
let shown = 'all';
let seq = 0;

function svg(parent, tag, attrs, text) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, String(v));
  if (text !== undefined && text !== null) n.textContent = String(text);
  if (parent) parent.appendChild(n);
  return n;
}

const r1 = v => Math.round(v * 10) / 10;

/* ── pure helpers (node-testable) ─────────────────────────────────────── */

/* A result in words, never a minus sign: "R 1 200 better off",
   "R 300 worse off", "about the same". */
function resultText(after, fmt) {
  const f = fmt || money;
  if (!Number.isFinite(after) || Math.abs(after) < 0.5) return 'about the same';
  return `${f(Math.abs(after))} ${after > 0 ? 'better' : 'worse'} off`;
}

/* The figures one quarter shows for `which` ('all' or a product id). */
function figuresOf(q, which) {
  if (which && which !== 'all') return (q.products && q.products[which]) || { paid: 0, back: 0, after: 0 };
  return q.total;
}

/* Products the trend has, in page order. */
function productIds(trend) {
  const seen = new Set();
  for (const q of trend.quarters || []) for (const id of Object.keys(q.products || {})) seen.add(id);
  return ORDER.filter(id => seen.has(id));
}

/* The chart's spoken summary: what it shows and the newest quarter. */
function chartLabel(trend, which, fmt) {
  const qs = trend.quarters || [];
  if (!qs.length) return 'No quarters to show yet.';
  const last = qs[qs.length - 1];
  const f = figuresOf(last, which);
  const what = which && which !== 'all' ? NAMES[which] || which : 'all your Discovery products';
  return `Chart of ${qs.length} quarter${qs.length === 1 ? '' : 's'} for ${what}: bars for what you paid and what came back, a line for the result after rewards. `
    + `In ${last.label} you paid ${(fmt || money)(f.paid)}, ${(fmt || money)(f.back)} came back, ${resultText(f.after, fmt)} after rewards.`;
}

/* The chart's geometry, so the drawing and the tests share it.
   → { width, height, zeroY, cols: [{ x, paid: {y, h}, back: {y, h}, after: {y} }] } */
function chartLayout(trend, which) {
  const qs = trend.quarters || [];
  const figs = qs.map(q => figuresOf(q, which));
  const fin = v => (Number.isFinite(v) ? v : 0);
  let hi = 0, lo = 0;
  for (const f of figs) {
    hi = Math.max(hi, fin(f.paid), fin(f.back), fin(f.after));
    lo = Math.min(lo, fin(f.after));
  }
  if (hi - lo < 1) hi = lo + 1;
  const y = v => TOP + ((hi - fin(v)) / (hi - lo)) * PLOT_H;
  const zeroY = y(0);
  const bar = v => { const top = y(Math.max(0, fin(v))); return { y: r1(top), h: r1(Math.max(0, zeroY - top)) }; };
  const width = Math.max(qs.length, MIN_COLS) * COL;
  const left = (width - qs.length * COL) / 2;
  const cols = figs.map((f, i) => ({ x: left + i * COL, paid: bar(f.paid), back: bar(f.back), after: { y: r1(y(f.after)) } }));
  return { width, height: TOP + PLOT_H + LABEL_H, zeroY: r1(zeroY), cols };
}

/* ── drawing ──────────────────────────────────────────────────────────── */

function drawChart(parent, trend, which, fmt) {
  const qs = trend.quarters;
  const L = chartLayout(trend, which);
  const s = svg(parent, 'svg', { class: 'dc-trend-chart', viewBox: `0 0 ${L.width} ${L.height}`, width: L.width, height: L.height, role: 'img', 'aria-label': chartLabel(trend, which, fmt), focusable: 'false' });
  s.style.maxWidth = Math.round(L.width * MAX_SCALE) + 'px';
  svg(s, 'line', { class: 'dc-trend-zero', x1: 0, x2: L.width, y1: L.zeroY, y2: L.zeroY });
  const pad = (COL - 2 * BAR - BAR_GAP) / 2;
  let year = null;
  L.cols.forEach((c, i) => {
    const q = qs[i];
    const f = figuresOf(q, which);
    const g = svg(s, 'g', { class: 'dc-trend-col' + (q.rough ? ' is-rough' : '') });
    svg(g, 'title', null, `${q.label}: you paid ${fmt(f.paid)}, ${fmt(f.back)} came back, ${resultText(f.after, fmt)} after rewards${q.rough ? ` (rough: ${q.months} of its 3 months have statements)` : ''}.`);
    svg(g, 'rect', { class: 'dc-trend-paid', x: r1(c.x + pad), y: c.paid.y, width: BAR, height: c.paid.h, rx: 2 });
    svg(g, 'rect', { class: 'dc-trend-back', x: r1(c.x + pad + BAR + BAR_GAP), y: c.back.y, width: BAR, height: c.back.h, rx: 2 });
    const base = TOP + PLOT_H;
    svg(g, 'text', { class: 'dc-trend-q', x: c.x + COL / 2, y: base + 16, 'text-anchor': 'middle' }, q.short);
    if (q.year !== year) svg(g, 'text', { class: 'dc-trend-y', x: c.x + COL / 2, y: base + 33, 'text-anchor': 'middle' }, q.year);
    year = q.year;
  });
  /* the marker line for after rewards, over the bars */
  if (L.cols.length > 1) {
    svg(s, 'polyline', { class: 'dc-trend-line', points: L.cols.map(c => `${c.x + COL / 2},${c.after.y}`).join(' ') });
  }
  L.cols.forEach((c, i) => {
    const after = figuresOf(qs[i], which).after;
    svg(s, 'circle', { class: 'dc-trend-dot ' + (after >= 0.5 ? 'is-better' : after <= -0.5 ? 'is-worse' : 'is-same') + (qs[i].rough ? ' is-rough' : ''), cx: c.x + COL / 2, cy: c.after.y, r: 4 });
  });
  return s;
}

function drawLegend(parent, rough) {
  const lg = el(parent, 'div', 'dc-trend-legend');
  const key = (cls, text) => { const k = el(lg, 'span', 'dc-trend-key'); el(k, 'span', 'dc-trend-swatch ' + cls).setAttribute('aria-hidden', 'true'); el(k, 'span', null, text); };
  key('is-paid', 'You paid');
  key('is-back', 'Came back');
  key('is-after', 'After rewards');
  if (rough) key('is-rough', 'Faded: fewer than 3 months of statements');
  return lg;
}

function drawTable(parent, trend, which, fmt) {
  const w = el(parent, 'div', 'dc-table-wrap dc-trend-table-wrap');
  const t = el(w, 'table', 'dc-table dc-trend-table');
  const cap = el(t, 'caption', 'dc-trend-caption', `${which && which !== 'all' ? NAMES[which] || which : 'All your Discovery products'}, 3 months at a time`);
  cap.setAttribute('aria-live', 'polite');
  const hr = el(el(t, 'thead'), 'tr');
  for (const h of ['3 months', 'You paid', 'Came back', 'After rewards']) el(hr, 'th', null, h).setAttribute('scope', 'col');
  const body = el(t, 'tbody');
  for (const q of trend.quarters.slice().reverse()) {
    const f = figuresOf(q, which);
    const tr = el(body, 'tr', q.rough ? 'is-rough' : null);
    const th = el(tr, 'th', 'dc-trend-qcell', q.label);
    th.setAttribute('scope', 'row');
    if (q.rough) el(th, 'span', 'dc-trend-rough', `rough: ${q.months} month${q.months === 1 ? '' : 's'} of statements`);
    el(tr, 'td', 'dc-trend-num', fmt(f.paid));
    el(tr, 'td', 'dc-trend-num', fmt(f.back));
    el(tr, 'td', 'dc-trend-num ' + (f.after >= 0.5 ? 'is-better' : f.after <= -0.5 ? 'is-worse' : 'is-same'), resultText(f.after, fmt));
  }
  return w;
}

/* panel: where the section goes. ctx: { s, period, money, per, save,
   rerender, now, trend } — trend from trend.js buildTrend. The figures are
   3-month totals, so ctx.per and ctx.period do not apply. → the section */
function renderTrend(panel, ctx) {
  const c = ctx || {};
  const trend = c.trend || { quarters: [], enough: false, note: '' };
  const fmt = typeof c.money === 'function' ? c.money : money;
  const sec = el(panel, 'section', 'dc-card dc-trend');
  el(sec, 'h2', 'dc-trend-title', 'Over time');
  el(sec, 'p', 'dc-trend-line', trend.note || '');
  const qs = trend.quarters || [];
  if (!qs.length) return sec;

  const ids = productIds(trend);
  if (shown !== 'all' && !ids.includes(shown)) shown = 'all';
  let pick = null;
  if (ids.length > 1) {
    pick = el(sec, 'div', 'dc-trend-pick');
    pick.setAttribute('role', 'group');
    pick.setAttribute('aria-label', 'Show the chart for');
  }
  drawLegend(sec, qs.some(q => q.rough));
  const figure = el(sec, 'div', 'dc-trend-figure');

  const id = 'dc-trend-numbers-' + (++seq);
  const toggle = button(sec, 'dc-more dc-trend-more', null);
  toggle.setAttribute('aria-controls', id);
  const numbers = el(sec, 'div', 'dc-more-body dc-trend-numbers');
  numbers.id = id;

  const draw = () => {
    clear(figure);
    drawChart(figure, trend, shown, fmt);
    clear(numbers);
    drawTable(numbers, trend, shown, fmt);
    /* the card shows its one line; how to read the chart waits here */
    el(numbers, 'p', null, 'Each pair of bars is what you paid and what came back in those 3 months.');
    el(numbers, 'p', null, 'After rewards is what you paid less what came back. Better off means more came back than you paid.');
    if (qs.some(q => q.rough)) el(numbers, 'p', null, 'A rough quarter has fewer than 3 months of statements, so its figures are filled out from the months it has.');
    el(numbers, 'p', null, 'Every quarter uses your answers as they are today, such as your scores and your plan. What you paid and what came back are read from that quarter\'s statements.');
    el(numbers, 'p', null, 'Prices change during the year, most in January, so a step between two quarters can be new prices. A lower score shows as less coming back.');
    if (pick) for (const b of pick.children) b.setAttribute('aria-pressed', String(b.dataset.id === shown));
  };
  if (pick) {
    for (const pid of ['all', ...ids]) {
      const b = button(pick, 'dc-chip dc-trend-chip', pid === 'all' ? 'All products' : NAMES[pid] || pid, () => { shown = pid; draw(); });
      b.dataset.id = pid;
    }
  }
  let open = false;
  const sync = () => {
    toggle.setAttribute('aria-expanded', String(open));
    clear(toggle);
    el(toggle, 'span', null, open ? 'Hide the numbers' : 'Show the numbers');
    numbers.hidden = !open;
  };
  toggle.addEventListener('click', e => { e.preventDefault(); open = !open; sync(); });
  draw();
  sync();
  return sec;
}

module.exports = { renderTrend, resultText, figuresOf, productIds, chartLabel, chartLayout };
