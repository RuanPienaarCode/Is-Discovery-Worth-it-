'use strict';
/* Turns transaction rows into the measured figures the statement is built
   from. Every figure here is READ from the statements — nothing is estimated
   at this layer (estimates live in model.js).

   Two kinds of rule (constants.RULES):
     line rules  — a fee, interest line, premium or payout. First match wins
                   and the row is NOT card spend.
     shop tags   — a partner purchase (Woolworths, BP, …). Tagged rows are
                   still card spend; the tag only says where it was spent.

   Values are stored in the rule's natural direction: a cost or spend is
   positive when money left, an income is positive when it arrived, so a
   refund lowers spend and a fee reversal lowers cost. */

const { RULES, SHOP_TAGS, NOT_SPEND_TYPES } = require('./constants');

/* 'YYYY-MM' list from..to inclusive. */
function monthsBetween(from, to) {
  const out = [];
  let [y, m] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}

/* The last `count` complete calendar months before `now`. */
function trailingWindow(now, count) {
  const end = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const start = new Date(end.getFullYear(), end.getMonth() - (count - 1), 1);
  const ym = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  return { from: ym(start), to: ym(end) };
}

function matches(rule, row, acct) {
  if (rule.discoveryOnly && !acct.discovery) return false;
  if (rule.desc && !rule.desc.test(row.description)) return false;
  if (rule.not && rule.not.test(row.description)) return false;
  if (rule.category && !rule.category.test(row.category)) return false;
  if (rule.sign === 'out' && row.amount >= 0) return false;
  if (rule.sign === 'in' && row.amount <= 0) return false;
  return true;
}

/* rows:       parsed transaction rows (transactions.parseTransactionNote)
   accounts:   { [label]: { institution, type } } from the account notes
   categories: { [name]: type } from the category notes
   opts:       { from, to, notCardSpend: [category names] }
   →  { from, to, months, rowsSeen, figures: { [key]: { total, count, perMonth } }, lastSeen,
        cardAccounts, excludedFromSpend: { [category]: amount } } */
function measure(rows, accounts, categories, opts) {
  const months = monthsBetween(opts.from, opts.to);
  const notSpend = new Set(opts.notCardSpend || []);
  const figures = {};
  const excludedFromSpend = {};
  const cardAccounts = new Set();
  const lastSeen = {}, firstSeen = {};
  /* The rows behind each line, for the transaction lists on the page. */
  const rowsOf = {};
  const keep = (key, row) => (rowsOf[key] = rowsOf[key] || []).push({ date: row.date, description: row.description, amount: row.amount, account: row.account });
  let rowsSeen = 0;

  const add = (key, ym, value) => {
    const f = figures[key] || (figures[key] = { total: 0, count: 0, perMonth: {} });
    f.total += value;
    f.count++;
    f.perMonth[ym] = (f.perMonth[ym] || 0) + value;
  };

  const dataMonths = new Set();
  /* Category names are matched without regard to case, as the Budget
     plugin does. */
  const catType = {};
  for (const [k, v] of Object.entries(categories)) catType[k.trim().toLowerCase()] = v;
  /* Money arriving on a Discovery account, by date and amount: an outflow
     met by the same amount on another Discovery account that day is a move
     between your own accounts, not a payment. */
  const credits = new Map();
  for (const row of rows) {
    const a = accounts[row.account] || {};
    if (row.amount > 0 && /discovery/i.test(a.institution || '')) {
      const k = row.date + '|' + row.amount.toFixed(2);
      (credits.get(k) || credits.set(k, new Set()).get(k)).add(row.account);
    }
  }
  const matched = row => { const set = credits.get(row.date + '|' + (-row.amount).toFixed(2)); return !!set && [...set].some(acc => acc !== row.account); };

  for (const row of rows) {
    /* A split parent is the original of rows listed beside it — counting it
       too would count the purchase twice. */
    if (row.split === 'parent') continue;
    const ym = row.date.slice(0, 7);
    const a = accounts[row.account] || {};
    const acct = { discovery: /discovery/i.test(a.institution || ''), card: String(a.type || '').toLowerCase() === 'credit_card', checking: String(a.type || '').toLowerCase() === 'checking' };
    const rule = RULES.find(r => matches(r, row, acct));
    /* The last time each line appeared at all, in or out of the window. */
    if (rule && (!lastSeen[rule.key] || row.date > lastSeen[rule.key])) lastSeen[rule.key] = row.date;
    if (rule && (!firstSeen[rule.key] || row.date < firstSeen[rule.key])) firstSeen[rule.key] = row.date;
    if (ym < opts.from || ym > opts.to) continue;
    rowsSeen++;
    if (acct.discovery) dataMonths.add(ym);

    const type = catType[String(row.category || '').trim().toLowerCase()] || '';
    /* A payment that would cost a pay-as-you-transact fee on a product
       without bundled fees: a debit order or payment out of the transaction
       account (premiums included), or an EFT from the card account. Card
       purchases, the bank's own fees and interest, and moves between your
       own accounts (transfer types, Discovery savings) are free. */
    const own = type === 'transfer' || /discovery/i.test(row.category || '') || /discovery bank account/i.test(row.description) || (row.amount < 0 && matched(row));
    const bankLine = rule && !/^product\./.test(rule.key);
    if (acct.discovery && row.amount < 0 && !own && !bankLine && (acct.checking || (acct.card && (NOT_SPEND_TYPES.includes(type) || notSpend.has(row.category))))) add('payt.payments', ym, 1);
    if (rule) {
      add(rule.key, ym, rule.direction === 'income' ? row.amount : -row.amount);
      keep(rule.key, row);
      continue;
    }
    /* Partner spend on ANY account, as all.<tag>: Vitality Health pays
       HealthyFood, HealthyCare, the gym and flight discounts whichever
       bank's card paid. Only Vitality Money's extras need a Discovery card
       (the shop.* figures below). */
    if (row.amount < 0 && !NOT_SPEND_TYPES.includes(type) && !notSpend.has(row.category)) {
      const anyTag = SHOP_TAGS.find(t => t.desc.test(row.description) && !(t.not && t.not.test(row.description)));
      if (anyTag) add('all.' + anyTag.key, ym, -row.amount);
    }
    /* Money out of a Discovery transaction account that is not a fee, a
       premium or a move between your own accounts: its debit card swipes,
       mixed with debit orders a statement cannot tell apart. Card spend for
       someone whose only Discovery card is the transaction account's. */
    if (acct.discovery && acct.checking && row.amount < 0 && !own && !NOT_SPEND_TYPES.includes(type) && !notSpend.has(row.category)) add('spend.debit', ym, -row.amount);
    if (!(acct.discovery && acct.card)) continue;
    cardAccounts.add(row.account);

    if (NOT_SPEND_TYPES.includes(type) || notSpend.has(row.category)) {
      excludedFromSpend[row.category] = (excludedFromSpend[row.category] || 0) - row.amount;
      continue;
    }
    /* Money in is a refund only when it says so; anything else arriving on
       the card (a top-up from savings filed under what it paid for) is a
       transfer, and reading it as a refund would shrink card spend. */
    if (row.amount > 0 && !/refund|revers/i.test(row.description)) continue;
    add('spend.card', ym, -row.amount);
    const tag = SHOP_TAGS.find(t => t.desc.test(row.description) && !(t.not && t.not.test(row.description)));
    if (tag) add(tag.key, ym, -row.amount);
    if (tag && tag.key === 'travel.vitality') keep(tag.key, row);
  }

  return { from: opts.from, to: opts.to, months, dataMonths: months.filter(ym => dataMonths.has(ym)), rowsSeen, figures, lastSeen, firstSeen, rows: rowsOf, cardAccounts: [...cardAccounts], excludedFromSpend };
}

/* Total of a figure, 0 when it never appeared. */
function total(m, key) {
  return m.figures[key] ? m.figures[key].total : 0;
}

module.exports = { monthsBetween, trailingWindow, measure, total };
