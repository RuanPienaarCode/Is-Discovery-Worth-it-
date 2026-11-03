'use strict';
/* Reads the Discovery Miles statement — the CSV from Discovery Bank online
   → Discovery Miles → Download transactions:
     "Value Date","Type","Description","Additional information","Miles"
   Discovery labels each reward with who paid it: "Vitality Money" (the
   bank's programme) or "Vitality Health" (the medical aid's). That split is
   exactly the stay-or-switch question, so nothing here is estimated. */

const HEADER = ['value date', 'type', 'description', 'additional information', 'miles'];

/* RFC 4180-ish: quoted fields, "" escapes, commas inside quotes. */
function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function isMilesStatement(text) {
  const first = parseCsv(text.slice(0, 400))[0] || [];
  return HEADER.every((h, i) => (first[i] || '').trim().toLowerCase() === h);
}

function parseMilesStatement(text) {
  const out = [];
  for (const r of parseCsv(text).slice(1)) {
    if (r.length < 5 || !/^\d{4}-\d\d-\d\d$/.test(r[0])) continue;
    const miles = Number(String(r[4]).replace(/[\s,]/g, ''));
    if (!Number.isFinite(miles)) continue;
    out.push({ date: r[0], type: r[1].trim(), description: r[2].trim(), info: r[3].trim(), miles });
  }
  return out;
}

const FOOD = /checkers|woolworths|pick n pay|\bpnp\b|sixty60/i;
const CARE = /clicks|dis-?chem|healthycare/i;
const FUEL = /fuel|\bbp\b|shell|gautrain/i;
const ACTIVE = /active rewards|sleep reward|health pathways|fitness/i;
const LIFE = /life plan|discovery life/i;
/* The Active Rewards gameboard lives in the Discovery Bank app and needs a
   qualifying bank account with Vitality Money (Black rewards guide). */
const GAMEBOARD = /gameboard/i;

/* Row → what it is. `group` says who pays it:
     bank   — only with Discovery Bank (Vitality Money, base Miles, Insure)
     health — Vitality Health, kept whichever bank you use
     none   — Miles moving, not earned (spent, received, nothing) */
function classifyMiles(row) {
  /* "Vitality Money Reverse" undoes a Vitality Money reward: it belongs
     with what it reverses, so the earning nets out. */
  const t = row.type.toLowerCase().replace(/\s*revers\w*$/, ''), d = row.description;
  const reversal = t !== row.type.toLowerCase();
  if (row.miles < 0 && !reversal && !/^base miles/.test(t)) return { key: 'spent', group: 'none' };
  if (/^no reward/.test(t)) return { key: 'none', group: 'none' };
  if (/^miles received/.test(t)) return { key: 'received', group: 'none' };
  if (/refunded/i.test(d)) return { key: 'refund', group: 'none' };
  if (/^base miles/.test(t)) return { key: 'base', group: 'bank' };
  if (t === 'vitality money') {
    if (FOOD.test(d)) return { key: 'money.healthyFood', group: 'bank' };
    if (CARE.test(d)) return { key: 'money.healthyCare', group: 'bank' };
    if (FUEL.test(d) || /uber/i.test(d)) return { key: 'money.fuel', group: 'bank' };
    return { key: 'money.partners', group: 'bank' };
  }
  if (t === 'vitality health') {
    if (FOOD.test(d)) return { key: 'health.healthyFood', group: 'health' };
    if (CARE.test(d)) return { key: 'health.healthyCare', group: 'health' };
    return { key: 'health.other', group: 'health' };
  }
  if (/insure/.test(t)) return { key: 'insure', group: 'bank' };
  if (GAMEBOARD.test(d)) return { key: 'gameboard', group: 'bank' };
  /* Discovery Life rewards belong with Life, not Vitality Health */
  if (LIFE.test(d)) return { key: 'life', group: 'life' };
  if (ACTIVE.test(d)) return { key: 'activeRewards', group: 'health' };
  return { key: 'other', group: 'none' };
}

/* The rand a redemption bought, when the statement says it. */
function randOf(row) {
  const m = /R\s?([\d,]+(?:\.\d+)?)/.exec(row.type + ' ' + row.info);
  return m ? Number(m[1].replace(/,/g, '')) : NaN;
}

/* A card swipe on a Base Miles / No reward row: "2026-10-15 - R 89.90",
   a refund "R 1,380.00-". → { ym, rand } by the swipe's own date. */
function swipeOf(row) {
  const m = /^(\d{4}-\d\d)-\d\d\s*-\s*R\s?([\d,]+(?:\.\d+)?)(-?)/.exec(row.info);
  if (!m) return null;
  const rand = Number(m[2].replace(/,/g, ''));
  return { ym: m[1], rand: m[3] ? -rand : rand };
}

/* rows → { months, figures: { key: Miles }, perMonth: { key: { ym: Miles } },
            spentMiles, spentRand, rows } for the window from..to (YYYY-MM). */
function summariseMiles(rows, from, to) {
  const figures = {}, perMonth = {}, swipes = {}, months = new Set();
  let spentMiles = 0, spentRand = 0, n = 0;
  let first = null, last = null;
  for (const row of rows) {
    const ym = row.date.slice(0, 7);
    if (!first || row.date < first) first = row.date;
    if (!last || row.date > last) last = row.date;
    /* Card spend as the bank counted it — what Miles were earned on. */
    if (/^(base miles|no reward)/i.test(row.type)) {
      const sw = swipeOf(row);
      if (sw && sw.ym >= from && sw.ym <= to) swipes[sw.ym] = (swipes[sw.ym] || 0) + sw.rand;
    }
    if (ym < from || ym > to) continue;
    n++;
    months.add(ym);
    const c = classifyMiles(row);
    if (c.key === 'spent') {
      const rand = randOf(row);
      if (Number.isFinite(rand) && rand > 0) { spentMiles += -row.miles; spentRand += rand; }
      continue;
    }
    if (c.group === 'none') continue;
    figures[c.key] = (figures[c.key] || 0) + row.miles;
    const pm = perMonth[c.key] || (perMonth[c.key] = {});
    pm[ym] = (pm[ym] || 0) + row.miles;
  }
  return { figures, perMonth, swipes, months: [...months].sort(), spentMiles, spentRand, rows: n, first, last };
}

/* Several downloads may overlap. A row counted k times in one file and j in
   another is kept max(k, j) times, so two identical coffees on one day
   survive and a re-downloaded month does not double. */
function mergeStatements(lists) {
  const key = r => [r.date, r.type, r.description, r.info, r.miles].join('\u0001');
  const best = new Map();
  for (const list of lists) {
    const counts = new Map();
    for (const r of list) {
      const k = key(r);
      const c = counts.get(k);
      if (c) c.count++; else counts.set(k, { count: 1, row: r });
    }
    for (const [k, c] of counts) {
      const prev = best.get(k);
      if (!prev || c.count > prev.count) best.set(k, c);
    }
  }
  const out = [];
  for (const { count, row } of best.values()) for (let i = 0; i < count; i++) out.push(row);
  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

module.exports = { parseCsv, isMilesStatement, parseMilesStatement, classifyMiles, summariseMiles, mergeStatements, randOf, swipeOf };
