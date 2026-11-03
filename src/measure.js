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
const { monthLabel, dayLabel } = require('./format');

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

const ymOf = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const DATED = /^\d{4}-\d\d-\d\d/;

/* A month is only counted whole when the statements reach the end of it:
   a last row on or after this day of the month. Statements exported on the
   18th hold half the month's swipes and may miss a debit order that comes
   on the 20th. */
const COVERED_FROM_DAY = 25;

/* The date the statements end: the latest dated row on a Discovery account,
   or on any account when none is a Discovery one. null when there are no
   dated rows. */
function lastDataDate(rows, accounts) {
  const acc = accounts || {};
  const isDisc = r => /discovery/i.test((acc[r.account] || {}).institution || '');
  const dated = (rows || []).filter(r => r && DATED.test(r.date || '') && !supersededBySplit(r));
  const disc = dated.filter(isDisc);
  let last = null;
  for (const r of disc.length ? disc : dated) if (!last || r.date > last) last = r.date;
  return last ? last.slice(0, 10) : null;
}

/* The last `count` complete calendar months before `now`, ending no later
   than the last month the statements fully cover. `data` is the budget
   ({ rows, accounts }) or the date the statements end ('YYYY-MM-DD'); left
   out, only the calendar counts. When the statements stop part of the way
   through a month, or end before last month, the window moves back to end
   at the last whole month and windowNote says so in a plain sentence.
   → { from, to } or { from, to, windowNote } */
function trailingWindow(now, count, data) {
  const n = Math.max(1, Math.floor(Number(count) || 1));
  let end = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const last = typeof data === 'string' ? (DATED.test(data) ? data.slice(0, 10) : null) : data ? lastDataDate(data.rows, data.accounts) : null;
  let windowNote = '';
  if (last) {
    const lastYm = last.slice(0, 7);
    const whole = Number(last.slice(8, 10)) >= COVERED_FROM_DAY;
    const covered = whole ? lastYm : ymOf(new Date(Number(last.slice(0, 4)), Number(last.slice(5, 7)) - 2, 1));
    if (covered < ymOf(end)) {
      end = new Date(Number(covered.slice(0, 4)), Number(covered.slice(5, 7)) - 1, 1);
      windowNote = whole
        ? `Your statements end on ${dayLabel(last)}, so the figures run to the end of ${monthLabel(covered)}.`
        : `Your statements stop on ${dayLabel(last)}, part of the way through ${monthLabel(lastYm)}. That month is left out, so the figures run to the end of ${monthLabel(covered)}.`;
    }
  }
  const start = new Date(end.getFullYear(), end.getMonth() - (n - 1), 1);
  const out = { from: ymOf(start), to: ymOf(end) };
  if (windowNote) out.windowNote = windowNote;
  return out;
}

/* A split parent the Budget plugin marked Excluded: its parts carry the same
   money (budget-vault tx-role.js supersededBySplit — BOTH columns, so a split
   undone by hand by unticking Excluded counts again). */
/* How a row reads, for telling a purchase from money moving.
   PURCHASE_WORDS — a card or wallet purchase (a bank's purchase verb, or
     SnapScan, Zapper and the other pay-by-phone wallets): money spent at a
     shop, never a move.
   TRANSFER_WORDS — money moving: transfers, PayShap and other instant
     payments, card repayments, cash out. A bare "payment", "savings" or
     "deposit" is not enough: "TAKEALOT PAYMENT", "SAVINGS MART" and a layby
     deposit are purchases.
   BANK_NAMES — a payment to an account at another bank ("CAPITEC SAM"). */
const PURCHASE_WORDS = /purchase|\bpos\b|snapscan|zapper|\byoco\b|ikhokha|\bpaypal\b|apple pay|google pay|samsung pay|garmin pay|scan to pay/i;
const TRANSFER_WORDS = /transfer|\btrf\b|\bxfer\b|payshap|instant money|cash ?send|send money|repayment|card payment|account payment|settle|to account|from account|own account|internal|withdrawal|\batm\b|\b(?:to|from) savings\b|savings (?:account|pocket|goal)|\bpocket\b/i;
const BANK_NAMES = /\b(?:capitec|fnb|absa|nedbank|standard bank|tymebank|gotyme|investec|african bank|bank zero)\b/i;

const shopTagOf = description => SHOP_TAGS.find(t => t.desc.test(description || '') && !(t.not && t.not.test(description || ''))) || null;
/* A purchase: a partner shop's tag, or the words of a card or wallet
   purchase. */
function purchaseLike(row) {
  const d = String((row && row.description) || '');
  return !!shopTagOf(d) || PURCHASE_WORDS.test(d);
}
/* Money moving (to your own account or someone else's), never a purchase. */
function transferLike(row) {
  const d = String((row && row.description) || '');
  return !purchaseLike(row) && (TRANSFER_WORDS.test(d) || BANK_NAMES.test(d));
}

function supersededBySplit(row) {
  return !!row && !!row.excluded && String(row.split || '').trim().toLowerCase() === 'parent';
}

const REFUND = /refund|revers/i;

/* Payments out of a transaction account that look like debit orders rather
   than card swipes: the statement's own words for one (including the
   collection houses that run South African debit orders: Netcash, Sage Pay,
   Hyphen, a PayFast debit order), or a category — or the description — that
   is a bond, rent, school fees, insurance or a loan (by its type, when the
   category note carries one, or by its name). */
const DEBIT_ORDER = /debit order|\bacb\b|debicheck|naedo|stop order|magtape|\bd\/o\b|netcash|sage ?pay|\bhyphen\b|payfast\W*(?:debit|d\/?o\b)|debit collection|collection debit/i;
const DEBIT_ORDER_TYPES = ['housing', 'insurance', 'education', 'debt', 'loan'];
const DEBIT_ORDER_CATEGORY = /\b(bond|home ?loan|mortgage|rent|levy|levies|school|school fees|education|tuition|insurance|assurance|medical aid|loan|loans)\b/i;
function debitOrderLike(row, type) {
  return DEBIT_ORDER.test(row.description || '') || DEBIT_ORDER_TYPES.includes(type) || DEBIT_ORDER_CATEGORY.test(row.category || '') || (!purchaseLike(row) && DEBIT_ORDER_CATEGORY.test(row.description || ''));
}

const DAY_MS = 86400000;
const dayNumber = date => Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))) / DAY_MS;
/* Money that left one Discovery account and arrived on another within
   `days` days (3 when left out), the same amount to the cent → the Set of
   outflow rows that are moves.
   What can be a move:
     never  — a purchase (a partner shop's tag, card or wallet purchase
              words), any money out of a credit card that does not read as
              a transfer (a card is for buying), and lines the RULES claim
              (fees, premiums, interest);
     first  — money out that reads as a transfer (its words, or a category
              of a transfer, savings, investment or debt type), or leaves a
              savings account;
     then   — anything else out of a transaction account.
   An arrival that is a refund or reversal, at a partner shop, income (a
   salary) or a RULES line explains nothing. Each arrival explains one
   outflow only: the closest pairs are made first (the same day, then a day
   apart), transfer-like outflows before the rest. `categories` ({ name:
   type }) lets the category types count. */
function matchMoves(rows, accounts, days, categories) {
  const span = days === undefined || days === null ? 3 : days;
  const acc = accounts || {};
  const accOf = row => acc[row.account] || {};
  const isDisc = row => /discovery/i.test(accOf(row).institution || '');
  const kindOf = row => String(accOf(row).type || '').toLowerCase();
  const catType = {};
  for (const [k, v] of Object.entries(categories || {})) catType[k.trim().toLowerCase()] = String(v || '').toLowerCase();
  const typeOf = row => catType[String(row.category || '').trim().toLowerCase()] || '';
  const claimed = row => RULES.some(r => matches(r, row, { discovery: isDisc(row) }));
  const arrivals = new Map();
  const outflows = [];
  for (const row of rows) {
    if (supersededBySplit(row) || !isDisc(row) || !Number.isFinite(row.amount) || !DATED.test(row.date || '')) continue;
    if (claimed(row)) continue;
    if (row.amount > 0) {
      if (REFUND.test(row.description || '') || shopTagOf(row.description) || typeOf(row) === 'income') continue;
      const k = row.amount.toFixed(2);
      (arrivals.get(k) || arrivals.set(k, []).get(k)).push({ day: dayNumber(row.date), account: row.account, used: false });
    } else if (row.amount < 0) {
      if (purchaseLike(row)) continue;
      const first = transferLike(row) || NOT_SPEND_TYPES.includes(typeOf(row)) || kindOf(row) === 'savings';
      if (!first && kindOf(row) === 'credit_card') continue;
      outflows.push({ row, tier: first ? 0 : 1, day: dayNumber(row.date) });
    }
  }
  const pairs = [];
  for (const o of outflows) {
    for (const c of arrivals.get((-o.row.amount).toFixed(2)) || []) {
      const gap = Math.abs(c.day - o.day);
      if (c.account !== o.row.account && gap <= span) pairs.push({ o, c, gap });
    }
  }
  pairs.sort((x, y) => x.o.tier - y.o.tier || x.gap - y.gap || x.o.day - y.o.day);
  const moved = new Set();
  for (const p of pairs) {
    if (p.c.used || moved.has(p.o.row)) continue;
    p.c.used = true;
    moved.add(p.o.row);
  }
  return moved;
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
   opts:       { from, to, notCardSpend: [category names], windowNote }
               (trailingWindow's result spreads in; its windowNote is passed
               through so the page can say why the window ends where it does)
   →  { from, to, windowNote (sentence or null), months, rowsSeen, figures: { [key]: { total, count, perMonth, accounts } }, lastSeen,
        cardAccounts, excludedFromSpend: { [category]: amount },
        accountMonths: { [account]: ['YYYY-MM'] } }

   accounts on a figure names the accounts it came from ({ [label]: true });
   accountMonths lists, per account, the window's months that hold any row
   on it. Together they say over how many months a figure was really
   measured (sourceMonths), so a short import of one bank is not read as
   months of nothing beside a longer import of another.

   Besides card spend tagged on the credit card (shop.*, fuel.* — Vitality
   Money's extras), partner spend is kept as all.<tag> on any account and as
   disc.<tag> on any Discovery Bank card, credit or debit (Vitality Drive's
   fuel needs a Discovery Bank card, not the credit card). */
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

  const accountMonths = {};
  const add = (key, ym, value, account) => {
    const f = figures[key] || (figures[key] = { total: 0, count: 0, perMonth: {}, accounts: {} });
    f.total += value;
    f.count++;
    f.perMonth[ym] = (f.perMonth[ym] || 0) + value;
    f.accounts[account] = true;
  };

  const dataMonths = new Set();
  /* Category names are matched without regard to case, as the Budget
     plugin does. */
  const catType = {};
  for (const [k, v] of Object.entries(categories)) catType[k.trim().toLowerCase()] = v;
  /* Moves between your own Discovery accounts: an outflow met by the same
     amount arriving on another Discovery account within three days (a
     transfer can settle the next working day) is a move, not a payment or a
     purchase. Each arrival pairs with one outflow only, the nearest in date,
     so two R500 payments are not both explained by one R500 arriving. */
  const moved = matchMoves(rows, accounts, undefined, categories);
  const matched = row => moved.has(row);

  for (const row of rows) {
    /* A split parent the Budget plugin marked Excluded is the original of
       the part rows listed beside it: counting it too would count the
       purchase twice. A parent whose Excluded box was unticked by hand (the
       split undone) is a real row again (budget-vault tx-role.js
       supersededBySplit). */
    if (supersededBySplit(row)) continue;
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
    (accountMonths[row.account] || (accountMonths[row.account] = new Set())).add(ym);

    const type = catType[String(row.category || '').trim().toLowerCase()] || '';
    /* A payment that would cost a pay-as-you-transact fee on a product
       without bundled fees: a debit order or payment out of the transaction
       account (premiums included), or an EFT from the card account. Card
       purchases, the bank's own fees and interest, and moves between your
       own accounts (transfer types, Discovery savings) are free. */
    const own = type === 'transfer' || /discovery/i.test(row.category || '') || /discovery bank account/i.test(row.description) || (row.amount < 0 && matched(row));
    const bankLine = rule && !/^product\./.test(rule.key);
    /* a debit-card swipe on the transaction account is a card purchase too,
       so free; a debit order at a partner shop (the gym) still costs one */
    const swipe = acct.checking && (purchaseLike(row) || !!shopTagOf(row.description)) && !debitOrderLike(row, type);
    if (acct.discovery && row.amount < 0 && !own && !bankLine && !swipe && (acct.checking || (acct.card && (NOT_SPEND_TYPES.includes(type) || notSpend.has(row.category))))) add('payt.payments', ym, 1, row.account);
    if (rule) {
      add(rule.key, ym, rule.direction === 'income' ? row.amount : -row.amount, row.account);
      keep(rule.key, row);
      continue;
    }
    /* Not spend at all: a transfer-like category type, a category you
       listed, or an Excluded row that reads like money moving (transfer
       words, PayShap, a payment to another bank's account). The Budget
       plugin's Excluded means "left out of budget totals, but the money
       still moved", so an Excluded swipe at a shop (one funded from savings,
       say) is still a card purchase that earns: a partner shop's tag or
       purchase words ("SNAPSCAN PAYMENT CHECKERS") always mean a purchase.
       Moves between your own accounts are caught by `own`. A refund is money
       back on a purchase only when it says so; it lowers every spend figure
       the purchase raised. */
    const notSpendRow = NOT_SPEND_TYPES.includes(type) || notSpend.has(row.category) || (!!row.excluded && transferLike(row));
    const refund = row.amount > 0 && REFUND.test(row.description);
    const counts = row.amount < 0 || refund;
    /* Partner spend on ANY account, as all.<tag>: Vitality Health pays
       HealthyFood, HealthyCare, the gym and flight discounts whichever
       bank's card paid. Only Vitality Money's extras need a Discovery card
       (the shop.* figures below). */
    const tag = shopTagOf(row.description);
    if (tag && counts && !notSpendRow && !own) add('all.' + tag.key, ym, -row.amount, row.account);
    /* Money out of a Discovery transaction account that is not a fee, a
       premium or a move between your own accounts: its debit card swipes.
       Rows that look like debit orders (the bond, school fees, insurance)
       or payments to someone (a transfer, PayShap) are left out of the
       swipes, since no card earns on them; a debit order still counts as
       partner spend when it is at a partner (a gym). */
    if (acct.discovery && acct.checking && counts && !own && !notSpendRow) {
      if (!debitOrderLike(row, type) && !transferLike(row)) add('spend.debit', ym, -row.amount, row.account);
      if (tag) add('disc.' + tag.key, ym, -row.amount, row.account);
    }
    if (!(acct.discovery && acct.card)) continue;
    cardAccounts.add(row.account);

    /* Not a card purchase: transfers, the categories you listed, rows marked
       Excluded, and money moved to another of your Discovery accounts. */
    if (notSpendRow || (own && row.amount < 0)) {
      if (row.amount < 0 || NOT_SPEND_TYPES.includes(type) || notSpend.has(row.category)) {
        const label = row.category || (row.excluded ? 'Rows marked Excluded' : 'Moves between your accounts');
        excludedFromSpend[label] = (excludedFromSpend[label] || 0) - row.amount;
      }
      continue;
    }
    /* Money in is a refund only when it says so; anything else arriving on
       the card (a top-up from savings filed under what it paid for) is a
       transfer, and reading it as a refund would shrink card spend. */
    if (!counts) continue;
    add('spend.card', ym, -row.amount, row.account);
    if (tag) { add(tag.key, ym, -row.amount, row.account); add('disc.' + tag.key, ym, -row.amount, row.account); }
    if (tag && tag.key === 'travel.vitality') keep(tag.key, row);
  }

  const acctMonths = {};
  for (const [acc, set] of Object.entries(accountMonths)) acctMonths[acc] = months.filter(ym => set.has(ym));
  return { from: opts.from, to: opts.to, windowNote: opts.windowNote || null, months, dataMonths: months.filter(ym => dataMonths.has(ym)), rowsSeen, figures, lastSeen, firstSeen, rows: rowsOf, cardAccounts: [...cardAccounts], excludedFromSpend, accountMonths: acctMonths };
}

/* Total of a figure, 0 when it never appeared. */
function total(m, key) {
  return m.figures[key] ? m.figures[key].total : 0;
}

/* How many of the window's months a figure was measured over: the months
   holding any row on an account the figures came from. A figure fed by a
   bank imported for twelve months is a twelve-month figure even when the
   Discovery accounts are three months old. `except` leaves accounts out
   (a Discovery card whose part is counted on its own). `fallback` (the
   Discovery months, say) when nothing says: a figure never seen, or a
   measured window built without account months. */
function sourceMonths(m, keys, fallback, except) {
  if (!m || !m.accountMonths || !m.figures) return fallback;
  const skip = new Set(except || []);
  const seen = new Set();
  for (const k of keys) {
    const f = m.figures[k];
    if (!f || !f.accounts) continue;
    for (const acc of Object.keys(f.accounts)) {
      if (skip.has(acc)) continue;
      for (const ym of m.accountMonths[acc] || []) seen.add(ym);
    }
  }
  return seen.size || fallback;
}

/* A figure (or the sum of several) a year: total × 12 over the months it
   was measured in (sourceMonths). */
function annualOf(m, keys, fallback) {
  const list = Array.isArray(keys) ? keys : [keys];
  const sum = list.reduce((s, k) => s + total(m, k), 0);
  return (sum * 12) / (sourceMonths(m, list, fallback) || 1);
}

module.exports = { monthsBetween, trailingWindow, lastDataDate, measure, total, sourceMonths, annualOf, matchMoves, debitOrderLike, purchaseLike, transferLike, supersededBySplit, COVERED_FROM_DAY };
