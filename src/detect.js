'use strict';
/* Which Discovery products does this budget show? Pure: budget rows in,
   plain objects out, no DOM and no obsidian import, so node tests run it.

   A row is claimed by the same constants.RULES the measuring uses (first
   match wins, a Discovery-only rule needs an account whose note says
   institution Discovery), so the two can never disagree about what a
   "DISC PREM" line is. */

const { RULES, SHOP_TAGS, DEFAULT_SETTINGS } = require('./constants');
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

/* The shop tag a description carries (constants.SHOP_TAGS), or null. Same
   test as measure.js. */
function tagOf(description) {
  const d = String(description || '');
  return SHOP_TAGS.find(t => t.desc.test(d) && !(t.not && t.not.test(d))) || null;
}

const evidenceOf = row => ({ date: row.date, description: row.description, amount: row.amount, account: row.account });
const newest = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const sinceOk = (row, since) => !since || row.date >= since;

/* 'YYYY-MM-DD' `months` calendar months later (the day kept, or the
   month's last day when it has fewer). */
function addMonths(ymd, months) {
  const y = Number(ymd.slice(0, 4)), m = Number(ymd.slice(5, 7)) - 1 + months, d = Number(ymd.slice(8, 10));
  const first = new Date(y, m, 1);
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}-${String(Math.min(d, days)).padStart(2, '0')}`;
}
/* A product you pay for every month has ended when its last payment is
   more than ENDED_MONTHS months before the statements end: two monthly
   debit orders in a row are missing. A product seen only through money
   coming back (a claim) is paid for somewhere else, and claims come when
   you claim, so only a full year with none says it ended. */
const ENDED_MONTHS = 2;
const ENDED_CLAIM_MONTHS = 12;
const endedBy = (date, end, months) => !!(date && end && addMonths(date.slice(0, 10), months) < end);
/* The date the statements end: the latest dated row in the budget. */
function budgetEnd(rows) {
  let end = null;
  for (const r of rows) if (r && /^\d{4}-\d\d-\d\d/.test(r.date || '') && (!end || r.date > end)) end = r.date.slice(0, 10);
  return end;
}
/* opts.end as a day: 'YYYY-MM' is the last day of that month. */
function endOf(o, rows) {
  if (!o.end) return budgetEnd(rows);
  const e = String(o.end);
  if (/^\d{4}-\d\d$/.test(e)) {
    const last = new Date(Number(e.slice(0, 4)), Number(e.slice(5, 7)), 0).getDate();
    return `${e}-${String(last).padStart(2, '0')}`;
  }
  return e.slice(0, 10);
}

/* A list of names read aloud: "A", "A and B", "A, B and C". */
function nameList(names) {
  if (names.length <= 1) return names.join('');
  return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
}

/* budget = loadBudget() result { rows, accounts, categories }.
   opts.since ('YYYY-MM-DD') ignores older rows; by default every row counts.
   opts.end ('YYYY-MM-DD', or 'YYYY-MM' for the end of that month) is when
   the statements end; by default the latest row in the budget.
   → { bank, health, gap, insure, life }, each
   { found, count, last, lastPaid, ended, evidence: [{ date, description, amount, account }] (3 at most, newest first), why }
   found: the budget shows the product at all (in any year). lastPaid: the
   latest premium paid (for the bank, the latest row on a Discovery
   account), or null. ended: it was there but stopped (see ENDED_MONTHS), so
   it is not ticked for you (resolveProducts). */
function detectProducts(budget, opts) {
  const o = opts || {};
  const rows = ((budget && budget.rows) || []).filter(r => r && r.split !== 'parent' && sinceOk(r, o.since));
  const accounts = (budget && budget.accounts) || {};
  const end = endOf(o, rows);
  const out = {};

  /* Discovery Bank: an account note whose institution says Discovery. */
  const labels = Object.keys(accounts).filter(k => /discovery/i.test((accounts[k] || {}).institution || ''));
  const bankRows = rows.filter(r => labels.includes(r.account)).sort(newest);
  const bankLast = bankRows.length ? bankRows[0].date : null;
  const bankEnded = labels.length > 0 && endedBy(bankLast, end, ENDED_MONTHS);
  out.bank = {
    found: labels.length > 0,
    count: labels.length,
    last: bankLast,
    lastPaid: bankLast,
    ended: bankEnded,
    evidence: bankRows.slice(0, 3).map(evidenceOf),
    why: !labels.length
      ? 'None of the accounts in your statements is marked as a Discovery account.'
      : bankEnded
        ? `Found ${plural(labels.length, 'Discovery Bank account', 'Discovery Bank accounts')} in your statements (${nameList(labels)}), but nothing on ${labels.length === 1 ? 'it' : 'them'} since ${dayLabel(bankLast)}, so it looks like you closed ${labels.length === 1 ? 'it' : 'them'}.`
        : `Found ${plural(labels.length, 'Discovery Bank account', 'Discovery Bank accounts')} in your statements: ${nameList(labels)}.`,
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
    const lastPaid = h.pays.length ? h.pays.slice().sort(newest)[0].date : null;
    const ended = h.pays.length ? endedBy(lastPaid, end, ENDED_MONTHS) : endedBy(last, end, ENDED_CLAIM_MONTHS);
    let why;
    if (!all.length) why = `No ${k.what}s found in your statements.`;
    else if (h.pays.length) why = `Found ${plural(h.pays.length, k.what, k.what + 's')}, the last on ${dayLabel(lastPaid)}.`;
    else why = `Found ${plural(h.back.length, k.backWhat, k.backWhat + 's')}, the last on ${dayLabel(last)}, but no debit orders.`;
    if (ended) why += ` Nothing since then, so it looks like you no longer have ${NAMES[id]}.`;
    out[id] = {
      found: all.length > 0,
      count: lead.length,
      last,
      lastPaid,
      ended,
      evidence: all.slice(0, 3).map(evidenceOf),
      why,
    };
  }
  return out;
}

/* Which products the page works with: what the person answered in
   onboarding (true or false), else what the budget shows — a product the
   budget shows has ended (detectProducts) is not taken as yours. */
function resolveProducts(settings, detected) {
  const set = (settings && settings.products) || {};
  const out = {};
  for (const id of IDS) {
    const d = detected && detected[id];
    out[id] = typeof set[id] === 'boolean' ? set[id] : !!(d && d.found && !d.ended);
  }
  return out;
}

/* Which Discovery Bank product, which tier, and whether Vitality Money is
   paid for, read from the Discovery account notes and the fee lines.
     kind: 'suite' (a transaction account and a credit card), 'card' (a
           credit card only), 'transaction', 'savings', or null
     tier: the SUITES id whose fee is nearest what the budget shows, or null
     vitalityMoney: true when the statements show you pay for Vitality Money,
           by any of: a Vitality Money premium line (however it is worded,
           constants RULES), a monthly fee that matches a Suite's whole fee
           with its Vitality Money premium inside it, or a dynamic interest
           boost (only paid with Vitality Money). Evidence older than two
           months before the statements end (ENDED_MONTHS) is a premium you
           stopped paying, and does not count.
     vitalityMoneyWhy: [plain sentence per piece of evidence]
   The tier only matches when it is close: within 10% of a published fee, or
   R 5 (a part-month or a fee that moved a little is still read; a fee that
   fits no tier is left alone, never forced onto the nearest). */
function detectBanking(budget, opts) {
  const o = opts || {};
  const rows = ((budget && budget.rows) || []).filter(r => r && r.split !== 'parent' && sinceOk(r, o.since));
  const accounts = (budget && budget.accounts) || {};
  const end = endOf(o, rows);
  const disc = Object.keys(accounts).filter(k => /discovery/i.test((accounts[k] || {}).institution || ''));
  const types = new Set(disc.map(k => String(accounts[k].type || '').toLowerCase()));
  const card = [...types].some(t => /credit/.test(t));
  const kind = !disc.length ? null
    : card && types.has('checking') ? 'suite'
    : card ? 'card'
    : types.has('checking') ? 'transaction'
    : types.has('savings') ? 'savings'
    : null;

  /* the fee lines on Discovery accounts, by month; the latest Vitality
     Money premium and interest boost */
  const feeKeys = ['fee.account', 'fee.facility', 'fee.vitalityMoney'];
  const byMonth = {};
  let vmLine = null, boost = null;
  for (const row of rows) {
    if (!disc.includes(row.account)) continue;
    const rule = ruleOf(row, { discovery: true });
    if (!rule) continue;
    if (rule.key === 'interest.boost' && row.amount > 0 && (!boost || row.date > boost)) boost = row.date;
    if (!feeKeys.includes(rule.key)) continue;
    if (rule.key === 'fee.vitalityMoney' && row.amount < 0 && (!vmLine || row.date > vmLine)) vmLine = row.date;
    const ym = row.date.slice(0, 7);
    const m = byMonth[ym] || (byMonth[ym] = { account: 0, total: 0, vm: 0, hasAccount: false });
    m.total += -row.amount;
    if (rule.key === 'fee.account') { m.account += -row.amount; m.hasAccount = true; }
    if (rule.key === 'fee.vitalityMoney') m.vm += -row.amount;
  }
  const latest = Object.keys(byMonth).filter(ym => byMonth[ym].hasAccount).sort().pop();
  const seen = latest ? byMonth[latest] : null;

  let tier = null, tierWhy = '', vmInFee = false;
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
      if (!best || gap < best.gap) best = { id: s.id, label: t.label || s.label || s.id, gap, t };
    }
    if (best) {
      tier = best.id; tierWhy = `The monthly fees of ${money(seen.total)} match a ${best.label}.`;
      /* the fees with no Vitality Money line of their own come nearer the
         whole fee (Vitality Money inside) than the fee without it */
      const vm = Number((best.t.feeParts || {}).vitalityMoney) || 0;
      const rest = seen.total - seen.vm;
      if (vm > 0 && seen.vm === 0 && close(rest, best.t.fee) && Math.abs(rest - best.t.fee) < Math.abs(rest - (best.t.fee - vm))) vmInFee = true;
    }
  }
  const recent = date => !!date && !endedBy(date, end, ENDED_MONTHS);
  const latestFeeDay = latest ? rows.filter(r => disc.includes(r.account) && r.date.slice(0, 7) === latest).map(r => r.date).sort().pop() : null;
  const vitalityMoneyWhy = [];
  if (recent(vmLine)) vitalityMoneyWhy.push(`A Vitality Money premium was charged, the last on ${dayLabel(vmLine)}.`);
  if (vmInFee && recent(latestFeeDay)) vitalityMoneyWhy.push(`The monthly fees of ${money(seen.total)} are the whole ${tier} fee, Vitality Money included.`);
  if (recent(boost)) vitalityMoneyWhy.push(`Your savings earned a dynamic interest boost, the last on ${dayLabel(boost)}, which only comes with Vitality Money.`);
  const vitalityMoney = vitalityMoneyWhy.length > 0;

  const KIND_WORDS = { suite: 'a transaction account and a credit card, which looks like a banking Suite', card: 'a credit card with no transaction account', transaction: 'a transaction account only', savings: 'a savings account only' };
  const parts = [];
  parts.push(kind ? `Your Discovery Bank accounts are ${KIND_WORDS[kind]}.` : 'No Discovery Bank account was found in your statements.');
  if (tierWhy) parts.push(tierWhy);
  if (vitalityMoney) parts.push(vitalityMoneyWhy[0].replace(/\.$/, '') + ', so you have Vitality Money.');
  else if (vmLine) parts.push(`The last Vitality Money premium was on ${dayLabel(vmLine)}, so it looks like you stopped it.`);
  else if (kind) parts.push('No Vitality Money premium was charged.');
  return { kind, tier, vitalityMoney, vitalityMoneyWhy, feeSeen: seen ? seen.total : null, why: parts.join(' ') };
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

/* What else can ride on the Discovery Health debit besides the medical aid:
   Vitality Health and gap cover. A generous ceiling a month — no family's
   Vitality and Discovery Gap Cover together comes near it — so the plan the
   debit really pays is never ruled out. Rough, on purpose: it only decides
   which plans COULD fit, never what Vitality costs. */
const EXTRA_CEILING = { adult: 600, child: 200, gap: 800 };

/* The latest Discovery Health debit against the price of each Discovery
   plan for these members. A plan COULD be the one when its price sits at or
   under the debit and the rest (Vitality and gap cover) is no more than
   EXTRA_CEILING allows. Discovery's plans sit close together, so one debit
   usually fits several: a plan is only picked when exactly one fits.
   → null when there is no debit;
     { id, name, monthly, debit, date, why, candidates } when one plan fits;
     { id: null, name: null, monthly: null, debit, date, why, candidates }
     when none or several do (candidates: [{ id, name, monthly, rest }],
     closest first — pick from these, do not guess). */
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
  const m = members || {};
  const adults = Math.max(1, Math.floor(Number(m.adults) || 1));
  const kids = Math.max(0, Math.floor(Number(m.children) || 0));
  const ceiling = adults * EXTRA_CEILING.adult + kids * EXTRA_CEILING.child + EXTRA_CEILING.gap;
  const candidates = [];
  for (const p of plans || discoveryPlans()) {
    const monthly = healthPremium(p, members);
    if (monthly === null) continue;
    const rest = amount - monthly;
    if (rest < -0.5 || rest > ceiling) continue;
    candidates.push({ id: p.id, name: p.plan, monthly, rest: Math.max(0, rest) });
  }
  candidates.sort((x, y) => x.rest - y.rest);
  const who = plural(adults, 'adult', 'adults') + (kids ? ` and ${plural(kids, 'child', 'children')}` : '');
  const head = `Your last Discovery Health debit order was ${money(amount)} on ${dayLabel(debit.date)}.`;
  const base = { debit: amount, date: debit.date, candidates };
  if (candidates.length === 1) {
    const c = candidates[0];
    return {
      id: c.id, name: c.name, monthly: c.monthly, ...base,
      why: `${head} For ${who}, only ${c.name} fits it, at ${money(c.monthly)} a month${c.rest >= 0.5 ? `, so about ${money(c.rest)} of it is Vitality or gap cover` : ''}.`,
    };
  }
  const shown = candidates.slice(0, 3).map(c => c.name);
  const why = candidates.length
    ? `${head} For ${who}, ${candidates.length} Discovery plans could fit it once Vitality and gap cover are added (such as ${nameList(shown)}), so pick yours.`
    : `${head} For ${who}, no Discovery plan's price fits it, so pick yours.`;
  return { id: null, name: null, monthly: null, ...base, why };
}

/* The card tier to work with. The person's own answer (settings.suite, once
   settings.suiteAnswered is true, or a tier other than the default) wins;
   until they answer — onboarding skipped, say — the tier the fees show
   (detectBanking().tier) is used, and only then the default. → a SUITES id */
function resolveSuite(settings, banking) {
  const s = settings || {};
  const def = DEFAULT_SETTINGS.suite;
  const answered = s.suiteAnswered === true || (typeof s.suite === 'string' && s.suite !== '' && s.suite !== def);
  if (answered && s.suite) return s.suite;
  if (banking && banking.tier) return banking.tier;
  return s.suite || def;
}

module.exports = { PRODUCT_NAMES: NAMES, detectProducts, resolveProducts, detectBanking, resolveVitality, guessHealthPlan, resolveSuite, ruleOf, tagOf, EXTRA_CEILING, ENDED_MONTHS };
