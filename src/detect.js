'use strict';
/* Which Discovery products does this budget show? Pure: budget rows in,
   plain objects out, no DOM and no obsidian import, so node tests run it.

   A row is claimed by the same constants.RULES the measuring uses (first
   match wins, a Discovery-only rule needs an account whose note says
   institution Discovery), so the two can never disagree about what a
   "DISC PREM" line is. */

const { RULES } = require('./constants');
const { money, dayLabel } = require('./format');
const { healthPremium, HEALTH_PLANS, HEALTH_OWN } = require('./compare');
const rates = require('./rates');

const IDS = ['bank', 'health', 'gap', 'insure', 'life'];

/* Per product: the rule keys that prove it, split into what you PAY (the
   premium, a debit order out of the account) and what comes BACK (a claim
   or a payout — still proof you hold the product). */
const KEYS = {
  health: { pays: ['product.medical'], back: [], what: 'Discovery Health debit order', backWhat: 'Discovery Health payment' },
  gap: { pays: ['product.gap'], back: ['product.gapClaim'], what: 'Discovery Gap Cover debit order', backWhat: 'Gap cover claim payment' },
  insure: { pays: ['product.insure'], back: ['product.insureClaim', 'insure.driveCash'], what: 'Discovery Insure debit order', backWhat: 'Discovery Insure payment' },
  life: { pays: ['product.life'], back: [], what: 'Discovery Life debit order', backWhat: 'Discovery Life payment' },
};

const NAMES = { bank: 'Discovery Bank', health: 'Discovery Health', gap: 'Discovery Gap Cover', insure: 'Discovery Insure', life: 'Discovery Life' };

/* The rule that claims a row, or null. Same tests as measure.js. */
function ruleOf(row, acct) {
  for (const r of RULES) {
    if (r.discoveryOnly && !acct.discovery) continue;
    if (r.desc && !r.desc.test(row.description)) continue;
    if (r.not && r.not.test(row.description)) continue;
    if (r.category && !r.category.test(row.category)) continue;
    if (r.sign === 'out' && row.amount >= 0) continue;
    if (r.sign === 'in' && row.amount <= 0) continue;
    return r;
  }
  return null;
}

const evidenceOf = row => ({ date: row.date, description: row.description, amount: row.amount, account: row.account });
const newest = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const sinceOk = (row, since) => !since || row.date >= since;

/* A list of names read aloud: "A", "A and B", "A, B and C". */
function nameList(names) {
  if (names.length <= 1) return names.join('');
  return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
}

/* budget = loadBudget() result { rows, accounts, categories }.
   opts.since ('YYYY-MM-DD') ignores older rows; by default every row counts.
   → { bank, health, gap, insure, life }, each
   { found, count, last, evidence: [{ date, description, amount, account }] (3 at most, newest first), why } */
function detectProducts(budget, opts) {
  const o = opts || {};
  const rows = ((budget && budget.rows) || []).filter(r => r && r.split !== 'parent' && sinceOk(r, o.since));
  const accounts = (budget && budget.accounts) || {};
  const out = {};

  /* Discovery Bank: an account note whose institution says Discovery. */
  const labels = Object.keys(accounts).filter(k => /discovery/i.test((accounts[k] || {}).institution || ''));
  const bankRows = rows.filter(r => labels.includes(r.account)).sort(newest);
  out.bank = {
    found: labels.length > 0,
    count: labels.length,
    last: bankRows.length ? bankRows[0].date : null,
    evidence: bankRows.slice(0, 3).map(evidenceOf),
    why: labels.length
      ? `Found ${plural(labels.length, 'Discovery Bank account', 'Discovery Bank accounts')} in your budget: ${nameList(labels)}.`
      : 'None of your budget accounts is marked as a Discovery account.',
  };

  /* The other four: rows the shared rules file under that product. */
  const hits = {};
  for (const id of Object.keys(KEYS)) hits[id] = { pays: [], back: [] };
  for (const row of rows) {
    const a = accounts[row.account] || {};
    const rule = ruleOf(row, { discovery: /discovery/i.test(a.institution || '') });
    if (!rule) continue;
    for (const id of Object.keys(KEYS)) {
      const k = KEYS[id];
      /* a premium is money going out; a reversal of one is not proof */
      if (k.pays.includes(rule.key) && row.amount < 0) hits[id].pays.push(row);
      else if (k.back.includes(rule.key)) hits[id].back.push(row);
    }
  }
  for (const id of Object.keys(KEYS)) {
    const k = KEYS[id], h = hits[id];
    const all = h.pays.concat(h.back).sort(newest);
    const lead = h.pays.length ? h.pays : h.back;
    const last = all.length ? all[0].date : null;
    let why;
    if (!all.length) why = `No ${k.what}s found in your budget.`;
    else if (h.pays.length) why = `Found ${plural(h.pays.length, k.what, k.what + 's')}, the last on ${dayLabel(h.pays.slice().sort(newest)[0].date)}.`;
    else why = `Found ${plural(h.back.length, k.backWhat, k.backWhat + 's')}, the last on ${dayLabel(last)}, but no debit orders.`;
    out[id] = {
      found: all.length > 0,
      count: lead.length,
      last,
      evidence: all.slice(0, 3).map(evidenceOf),
      why,
    };
  }
  return out;
}

/* Which products the page works with: what the person answered in
   onboarding (true or false), else what the budget shows. */
function resolveProducts(settings, detected) {
  const set = (settings && settings.products) || {};
  const out = {};
  for (const id of IDS) {
    out[id] = typeof set[id] === 'boolean' ? set[id] : !!(detected && detected[id] && detected[id].found);
  }
  return out;
}

/* Which Discovery Bank product, which tier, and whether Vitality Money is
   paid for, read from the Discovery account notes and the fee lines.
     kind: 'suite' (a transaction account and a credit card), 'card' (a
           credit card only), 'transaction', 'savings', or null
     tier: the SUITES id whose fee is nearest what the budget shows, or null
     vitalityMoney: true when a Vitality Money premium was charged
   The tier only matches when it is close: within 10% of a published fee, or
   R 5 (a part-month or a fee that moved a little is still read; a fee that
   fits no tier is left alone, never forced onto the nearest). */
function detectBanking(budget, opts) {
  const o = opts || {};
  const rows = ((budget && budget.rows) || []).filter(r => r && r.split !== 'parent' && sinceOk(r, o.since));
  const accounts = (budget && budget.accounts) || {};
  const disc = Object.keys(accounts).filter(k => /discovery/i.test((accounts[k] || {}).institution || ''));
  const types = new Set(disc.map(k => String(accounts[k].type || '').toLowerCase()));
  const card = [...types].some(t => /credit/.test(t));
  const kind = !disc.length ? null
    : card && types.has('checking') ? 'suite'
    : card ? 'card'
    : types.has('checking') ? 'transaction'
    : types.has('savings') ? 'savings'
    : null;

  /* the fee lines on Discovery accounts, by month */
  const feeKeys = ['fee.account', 'fee.facility', 'fee.vitalityMoney'];
  const byMonth = {};
  let vitalityMoney = false;
  for (const row of rows) {
    if (!disc.includes(row.account)) continue;
    const rule = ruleOf(row, { discovery: true });
    if (!rule || !feeKeys.includes(rule.key)) continue;
    if (rule.key === 'fee.vitalityMoney' && row.amount < 0) vitalityMoney = true;
    const ym = row.date.slice(0, 7);
    const m = byMonth[ym] || (byMonth[ym] = { account: 0, total: 0, hasAccount: false });
    m.total += -row.amount;
    if (rule.key === 'fee.account') { m.account += -row.amount; m.hasAccount = true; }
  }
  const latest = Object.keys(byMonth).filter(ym => byMonth[ym].hasAccount).sort().pop();
  const seen = latest ? byMonth[latest] : null;

  let tier = null, tierWhy = '';
  const suites = Array.isArray(rates.SUITES) ? rates.SUITES : [];
  if (seen && seen.total > 0 && suites.some(s => Number.isFinite(s.fee))) {
    /* a credit card on its own is priced by the card's own fees */
    const target = s => (kind === 'card' ? s.creditCard : s);
    const close = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= Math.max(5, b * 0.1);
    let best = null;
    for (const s of suites) {
      const t = target(s);
      if (!t) continue;
      const parts = t.feeParts || {};
      const gaps = [];
      if (close(seen.total, t.fee)) gaps.push(Math.abs(seen.total - t.fee) / t.fee);
      if (close(seen.account, parts.account)) gaps.push(Math.abs(seen.account - parts.account) / parts.account);
      if (!gaps.length) continue;
      const gap = Math.min(...gaps);
      if (!best || gap < best.gap) best = { id: s.id, label: t.label || s.label || s.id, gap };
    }
    if (best) { tier = best.id; tierWhy = `The monthly fees of ${money(seen.total)} match a ${best.label}.`; }
  }

  const KIND_WORDS = { suite: 'a transaction account and a credit card, which looks like a banking Suite', card: 'a credit card with no transaction account', transaction: 'a transaction account only', savings: 'a savings account only' };
  const parts = [];
  parts.push(kind ? `Your Discovery Bank accounts are ${KIND_WORDS[kind]}.` : 'No Discovery Bank account was found in your budget.');
  if (tierWhy) parts.push(tierWhy);
  if (vitalityMoney) parts.push('Vitality Money premiums were charged, so you have Vitality Money.');
  else if (kind) parts.push('No Vitality Money premium was charged.');
  return { kind, tier, vitalityMoney, feeSeen: seen ? seen.total : null, why: parts.join(' ') };
}

/* The three Vitality programmes you pay for, as booleans: a true or false
   in settings.vitality wins; else Vitality Money comes from the fee lines,
   Vitality Health from having Discovery Health and Vitality Drive from having
   Discovery Insure. */
function resolveVitality(settings, detected, banking) {
  const set = (settings && settings.vitality) || {};
  const prod = resolveProducts(settings, detected);
  return {
    money: typeof set.money === 'boolean' ? set.money : !!(banking && banking.vitalityMoney),
    health: typeof set.health === 'boolean' ? set.health : prod.health,
    drive: typeof set.drive === 'boolean' ? set.drive : prod.insure,
  };
}

/* The Discovery plans that have a published price for a family. */
function discoveryPlans() {
  return HEALTH_PLANS.concat(HEALTH_OWN).filter(p => p.discovery);
}

/* The latest Discovery Health debit against the price of each Discovery
   plan for these members: the dearest plan at or under the debit (the rest
   of the debit is Vitality and gap cover). null when there is no debit, or
   when the debit is under every plan's price (nothing fits).
   → { id, name, monthly, debit, date, why } | null */
function guessHealthPlan(budget, members, plans) {
  const accounts = (budget && budget.accounts) || {};
  let debit = null;
  for (const row of (budget && budget.rows) || []) {
    if (!row || row.split === 'parent' || !(row.amount < 0)) continue;
    const a = accounts[row.account] || {};
    const rule = ruleOf(row, { discovery: /discovery/i.test(a.institution || '') });
    if (!rule || rule.key !== 'product.medical') continue;
    if (!debit || row.date > debit.date) debit = row;
  }
  if (!debit) return null;
  const amount = -debit.amount;
  let best = null;
  for (const p of plans || discoveryPlans()) {
    const monthly = healthPremium(p, members);
    if (monthly === null || monthly > amount) continue;
    if (!best || monthly > best.monthly) best = { plan: p, monthly };
  }
  if (!best) return null;
  const m = members || {};
  const adults = Math.max(1, Math.floor(Number(m.adults) || 1));
  const kids = Math.max(0, Math.floor(Number(m.children) || 0));
  const who = plural(adults, 'adult', 'adults') + (kids ? ` and ${plural(kids, 'child', 'children')}` : '');
  const rest = amount - best.monthly;
  return {
    id: best.plan.id,
    name: best.plan.plan,
    monthly: best.monthly,
    debit: amount,
    date: debit.date,
    why: `Your last Discovery Health debit order was ${money(amount)} on ${dayLabel(debit.date)}. The dearest Discovery plan at or under that for ${who} is ${best.plan.plan} at ${money(best.monthly)} a month${rest >= 0.5 ? `, so about ${money(rest)} of it is Vitality or gap cover` : ''}.`,
  };
}

module.exports = { PRODUCT_NAMES: NAMES, detectProducts, resolveProducts, detectBanking, resolveVitality, guessHealthPlan };
