'use strict';
/* "Over time": is Discovery getting better or worse for this person? One
   calendar quarter at a time (Jan to Mar, Apr to Jun, …), for each product
   the person has and in total: what they paid, what came back, and the
   result after rewards. A quarter that holds a January or April price
   change, or a drop in a score, shows up as a step between two quarters.

   Nothing is worked out twice: each quarter is the real pipeline run over
   that quarter's window — measure() once, the Miles summary, the statement
   (buildStatementFor, so the caller's settings, products and Vitality
   programmes apply) and buildProducts. Those give rands a year; a quarter is
   a quarter of that (annual ÷ 4), so a full quarter's figure is what was
   paid and came back in those 3 months. A quarter with fewer than 3 months
   of statements is marked rough: its figure is filled out from the months
   it has.

   Pure (no DOM, no vault): node-testable. */

const { measure, trailingWindow, monthsBetween, supersededBySplit } = require('./measure');
const { summariseMiles } = require('./miles');
const { buildStatement } = require('./model');
const { buildProducts } = require('./products');
const { RULES } = require('./constants');
const { money } = require('./format');

const MAX_QUARTERS = 8;
/* below this a change between two quarters is "about the same" */
const SAME = 50;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DATED = /^\d{4}-\d\d-\d\d/;
const fin = v => (Number.isFinite(v) ? v : 0);

/* The quarter a 'YYYY-MM' falls in → { y, q } (q 0..3). */
const quarterOf = ym => ({ y: Number(ym.slice(0, 4)), q: Math.floor((Number(ym.slice(5, 7)) - 1) / 3) });
const pad = n => String(n).padStart(2, '0');

/* { y, q } → the quarter's window and its plain names.
   label 'Jul to Sep 2026', short 'Jul', year '2026'. */
function quarterWindow(y, q) {
  const first = q * 3 + 1;
  return {
    from: `${y}-${pad(first)}`, to: `${y}-${pad(first + 2)}`,
    label: `${MONTHS[first - 1]} to ${MONTHS[first + 1]} ${y}`,
    short: MONTHS[first - 1], year: String(y),
  };
}
const prevQuarter = ({ y, q }) => (q === 0 ? { y: y - 1, q: 3 } : { y, q: q - 1 });

/* A product's premium or claim, wherever it was paid (rule desc/not/sign
   only: a Discovery Health debit on another bank is still Discovery data). */
const PRODUCT_RULES = RULES.filter(r => /^product\./.test(r.key));
function productRow(row) {
  const d = String(row.description || '');
  return PRODUCT_RULES.some(r => (!r.desc || r.desc.test(d)) && !(r.not && r.not.test(d))
    && !(r.sign === 'out' && !(row.amount < 0)) && !(r.sign === 'in' && !(row.amount > 0)));
}

/* Every month that holds Discovery data: a row on a Discovery account, or a
   Discovery product's premium or claim on any account. → Set('YYYY-MM') */
function discoveryMonths(budget) {
  const acc = (budget && budget.accounts) || {};
  const out = new Set();
  for (const row of (budget && budget.rows) || []) {
    if (!row || !DATED.test(row.date || '') || supersededBySplit(row)) continue;
    const ym = row.date.slice(0, 7);
    if (out.has(ym)) continue;
    if (/discovery/i.test((acc[row.account] || {}).institution || '') || productRow(row)) out.add(ym);
  }
  return out;
}

/* One quarter's products → { [id]: { paid, back, after } } and the total,
   in rands for the 3 months. after = what came back less what you paid:
   above 0 you are better off, below 0 worse off. */
function quarterFigures(pr) {
  const products = {};
  const total = { paid: 0, back: 0, after: 0 };
  for (const p of pr.products) {
    const paid = fin(p.paid) / 4, back = fin(p.backSum) / 4;
    products[p.id] = { paid, back, after: back - paid };
    total.paid += paid; total.back += back;
  }
  total.after = total.back - total.paid;
  return { products, total };
}

/* The one sentence about the direction. Compares the newest full quarter
   with the same months a year before, else with the full quarter before it.
   → { note, compare: { with: 'year'|'previous', a, b, diff } | null } */
function directionOf(quarters, enough) {
  if (!enough) return { note: 'Not enough months yet to see a trend — import at least two quarters.', compare: null };
  const full = quarters.filter(q => !q.rough);
  const last = full[full.length - 1];
  const yearAgo = full.find(q => q.from === `${Number(last.from.slice(0, 4)) - 1}${last.from.slice(4)}`);
  const before = yearAgo || full[full.length - 2];
  const diff = last.total.after - before.total.after;
  const than = yearAgo ? 'in the same months a year before' : `in ${before.label}`;
  const note = Math.abs(diff) < SAME
    ? `After rewards, ${last.label} came out about the same as ${yearAgo ? 'the same months a year before' : before.label}.`
    : `After rewards, you were ${money(Math.abs(diff))} ${diff > 0 ? 'better' : 'worse'} off in ${last.label} than ${than}.`;
  return { note, compare: { with: yearAgo ? 'year' : 'previous', a: before.label, b: last.label, diff } };
}

/* budget: loadBudget() result ({ rows, accounts, categories, miles });
   s: settings (s.notCardSpend, and the bill/life answers buildProducts reads);
   now: Date; buildStatementFor(m, ms) → statement, the caller's own
   buildStatement with its effective settings, products and Vitality
   programmes (left out: buildStatement(m, s, ms, { products }));
   products: the resolveProducts() map (left out: all five).
   → { quarters: [{ label, short, year, from, to, months, rough,
        products: { [id]: { paid, back, after } }, total: { paid, back, after } }],
       enough, note, compare }
   quarters are complete calendar quarters that end by the last month the
   statements cover, newest last, at most 8, only those holding Discovery
   data. months = how many of its 3 months hold Discovery data; rough when
   fewer than 3. enough = at least 2 quarters that are not rough. */
function buildTrend({ budget, s, now, buildStatementFor, products, max } = {}) {
  const settings = s || {};
  const today = now || new Date();
  const limit = Math.max(1, Math.floor(Number(max) || MAX_QUARTERS));
  const statementFor = typeof buildStatementFor === 'function'
    ? buildStatementFor
    : (m, ms) => buildStatement(m, settings, ms, products ? { products } : undefined);
  const empty = { quarters: [], enough: false, ...directionOf([], false) };
  if (!budget || !Array.isArray(budget.rows) || !budget.rows.length) return empty;

  const disc = discoveryMonths(budget);
  if (!disc.size) return empty;
  /* the last month the statements cover in full (trailingWindow moves back
     past a month they stop part of the way through) */
  const lastCovered = trailingWindow(today, 1, budget).to;
  let cur = quarterOf(lastCovered);
  if (quarterWindow(cur.y, cur.q).to > lastCovered) cur = prevQuarter(cur);
  const earliest = [...disc].sort()[0];

  const picked = [];
  while (picked.length < limit) {
    const w = quarterWindow(cur.y, cur.q);
    if (w.to < earliest) break;
    const months = monthsBetween(w.from, w.to).filter(ym => disc.has(ym)).length;
    if (months) picked.push({ ...w, months });
    cur = prevQuarter(cur);
  }
  picked.reverse();

  const quarters = picked.map(w => {
    const m = measure(budget.rows, budget.accounts || {}, budget.categories || {}, { from: w.from, to: w.to, notCardSpend: settings.notCardSpend });
    const ms = budget.miles && budget.miles.rows ? summariseMiles(budget.miles.rows, m.from, m.to) : null;
    const st = statementFor(m, ms);
    const pr = buildProducts(st, m, ms, settings, today, products);
    return { label: w.label, short: w.short, year: w.year, from: w.from, to: w.to, months: w.months, rough: w.months < 3, ...quarterFigures(pr) };
  });
  const enough = quarters.filter(q => !q.rough).length >= 2;
  return { quarters, enough, ...directionOf(quarters, enough) };
}

module.exports = { buildTrend, quarterWindow, quarterOf, discoveryMonths, quarterFigures, MAX_QUARTERS };
