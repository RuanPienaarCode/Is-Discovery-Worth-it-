'use strict';
/* Typed-in numbers: for someone who does not use the Budget plugin. They
   type a rough average month (settings.manual, asked by src/manual-form.js)
   and this turns it into twelve identical months of Budget-style notes, the
   same shape src/sample.js builds for the example household, so the whole
   pipeline (load → measure → model → products → verdicts) runs unchanged.

   The rows are worded the way a real statement words them ("DISC PREM",
   "Monthly Account fee", "CHECKERS"), so constants.RULES and SHOP_TAGS
   claim them exactly as they would a real one. Every row is dated on the
   25th or later, so each month counts as a whole month (measure.js
   COVERED_FROM_DAY).

   An answer left blank is NOT COUNTED: no row is made for it, never a
   guess. The one figure taken from Discovery's own published prices is the
   bank's monthly fee, and only when the person chose "the published fee for
   my package".

   Pure and deterministic: the same settings and `now` always give the same
   files. No Node APIs, no DOM (rewordTree only walks the nodes it is given).

     manualFiles(settings, now)          → { vaultPath: text }
     manualSource(settings, now, vault)  → { paths(), read(p), stat(p) } for
                                           load.js loadBudget; `vault` (optional,
                                           the same shape) adds the vault's
                                           CSVs, so a Discovery Miles statement
                                           still counts
     manualQuestions(settings)           → the money questions that apply
     applyManual(settings)               → keeps settings.bill.gap in step
     manualWords(text)                   → statement words said as typed ones
     rewordTree(node)                    → manualWords over every text node */

const { bankProductOf } = require('./rates');

/* the made-up folder the typed months live in (never a real vault folder:
   manualSource only ever serves its own files and the vault's CSVs) */
const MANUAL_FOLDER = 'Typed numbers';
const B = MANUAL_FOLDER + '/';

/* settings.manual: every answer null until typed (null = not counted) */
const MANUAL_DEFAULTS = {
  /* true once the questions were finished */
  done: false,
  /* the bank's monthly fee: 'published' (the package's published fee) or
     'typed' (fees, below) */
  feesHow: 'published',
  fees: null,
  /* a month: everything bought with the Discovery card, shops included */
  cardSpend: null,
  checkers: null, woolworths: null, pnp: null,
  clicks: null, dischem: null,
  /* a month at bp and Shell together */
  fuel: null,
  /* extra interest and cashback a month (the dynamic interest boost) */
  interest: null,
  /* the Discovery Health debit order a month; claims paid back a YEAR */
  health: null,
  claims: null,
  gym: null,
  /* flights booked through Vitality Travel, a YEAR */
  flights: null,
  /* gap cover a month; gapInHealth: it is part of the Health debit order */
  gap: null, gapInHealth: false,
  insure: null,
  life: null,
  /* the Budget-plugin folder the person said to leave alone ("Keep my
     typed numbers"), so they are not asked again until another appears */
  keepTyped: '',
};

/* The money questions, in the order the form asks them. `when(p, kind)`
   says whether it applies to the products ticked (p) and the bank product
   (kind). Each field is a number in rands; `per` is 'month' or 'year'. */
const QUESTIONS = [
  { id: 'fees', when: (p, kind) => p.bank && kind !== 'savings', per: 'month',
    title: 'What do you pay Discovery Bank in fees a month?',
    lead: 'Your package\'s monthly fees.',
    where: 'Where to find it: the fees on your Discovery Bank statement, or your account in the Discovery app.',
    fields: [{ key: 'fees', label: 'Fees a month' }] },
  { id: 'cardSpend', when: (p, kind) => p.bank && kind !== 'savings', per: 'month',
    title: 'How much do you spend on your Discovery card in a normal month?',
    lead: 'Everything you buy with it, the shops on the next screens included.',
    where: 'Where to find it: the Discovery app shows your spending by month. A bank statement works too: add up the card purchases.',
    fields: [{ key: 'cardSpend', label: 'Card spend a month' }] },
  { id: 'groceries', when: p => p.bank || p.health, per: 'month',
    title: 'How much do you spend on groceries in a normal month?',
    lead: 'At each of these shops. HealthyFood rewards come from Checkers and Woolworths.',
    where: 'Where to find it: your bank statement, or your spending in the Discovery app. Leave a shop blank if you do not shop there.',
    fields: [{ key: 'checkers', label: 'Checkers' }, { key: 'woolworths', label: 'Woolworths' }, { key: 'pnp', label: 'Pick n Pay' }] },
  { id: 'pharmacy', when: p => p.bank || p.health, per: 'month',
    title: 'How much do you spend at Clicks and Dis-Chem in a normal month?',
    lead: 'HealthyCare rewards come from these two.',
    where: 'Where to find it: your bank statement, or your spending in the Discovery app. Leave one blank if you do not shop there.',
    fields: [{ key: 'clicks', label: 'Clicks' }, { key: 'dischem', label: 'Dis-Chem' }] },
  { id: 'fuel', when: p => p.bank || p.insure, per: 'month',
    title: 'How much do you spend on fuel at bp and Shell in a normal month?',
    lead: 'Fuel rewards are only paid at bp and Shell.',
    where: 'Where to find it: your bank statement, or your spending in the Discovery app. Leave it blank if you fill up elsewhere.',
    fields: [{ key: 'fuel', label: 'Fuel a month' }] },
  { id: 'interest', when: p => p.bank, per: 'month',
    title: 'How much extra interest or cashback does Discovery Bank pay you a month?',
    lead: 'The dynamic interest boost and cashback, on top of normal interest.',
    where: 'Where to find it: lines that say dynamic interest on your statement, or your savings in the Discovery app. Leave it blank if you do not know.',
    fields: [{ key: 'interest', label: 'Extra interest a month' }] },
  { id: 'health', when: p => p.health, per: 'month',
    title: 'What is your Discovery Health debit order a month?',
    lead: 'The medical aid, with Vitality Health if you have it.',
    where: 'Where to find it: your bank statement (it says DISC PREM), or the Discovery app under Health, then Contributions.',
    fields: [{ key: 'health', label: 'Health debit order a month' }] },
  { id: 'claims', when: p => p.health, per: 'year',
    title: 'How much did Discovery Health pay back to you in the last year?',
    lead: 'Money back for doctor and pharmacy bills you paid yourself first.',
    where: 'Where to find it: the Discovery app under Claims, or your bank statement (it says DISC MEMB). Leave it blank if there was none.',
    fields: [{ key: 'claims', label: 'Claims paid back in a year' }] },
  { id: 'gym', when: p => p.health, per: 'month',
    title: 'What does your gym membership cost a month?',
    lead: 'At Virgin Active or Planet Fitness, after the Vitality discount.',
    where: 'Where to find it: your bank statement or your gym contract. Leave it blank if you do not go.',
    fields: [{ key: 'gym', label: 'Gym a month' }] },
  { id: 'flights', when: p => p.bank || p.health, per: 'year',
    title: 'How much did you pay for flights booked through Vitality Travel in the last year?',
    lead: 'Only flights booked in the Discovery app.',
    where: 'Where to find it: the Discovery app under Vitality Travel, or your booking emails. Leave it blank if there were none.',
    fields: [{ key: 'flights', label: 'Flights in a year' }] },
  { id: 'gap', when: p => p.gap, per: 'month',
    title: 'What does your gap cover cost a month?',
    lead: 'Discovery Gap Cover.',
    where: 'Where to find it: your bank statement (it says INSGAP), or your gap cover schedule.',
    fields: [{ key: 'gap', label: 'Gap cover a month' }] },
  { id: 'insure', when: p => p.insure, per: 'month',
    title: 'What is your Discovery Insure debit order a month?',
    lead: 'Cars, home and Vitality Drive together.',
    where: 'Where to find it: your bank statement (it says DISCINSURE), or your policy schedule.',
    fields: [{ key: 'insure', label: 'Insure debit order a month' }] },
  { id: 'life', when: p => p.life, per: 'month',
    title: 'What do you pay for Discovery Life a month?',
    lead: 'Your own share of it.',
    where: 'Where to find it: your bank statement, your payslip if it comes off your salary, or your policy schedule.',
    fields: [{ key: 'life', label: 'Life cover a month' }] },
];

const num = v => (v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const ticked = s => {
  const p = (s && s.products) || {};
  return { bank: p.bank === true, health: p.health === true, gap: p.gap === true, insure: p.insure === true, life: p.life === true };
};
const kindOf = s => (s && s.bankKind) || 'suite';
const manualOf = s => Object.assign({}, MANUAL_DEFAULTS, (s && s.manual) || {});

/* The money questions for these settings (the products ticked and the bank
   product), in order. */
function manualQuestions(settings) {
  const p = ticked(settings), kind = kindOf(settings);
  return QUESTIONS.filter(q => q.when(p, kind));
}

/* The bank's published monthly fee for this person's package, in parts:
   { account, credit, vitalityMoney, annual, total, label } — Vitality
   Money's part only when they have not said they go without it. */
function publishedFees(settings) {
  const s = settings || {};
  const prod = bankProductOf({ suite: s.suite, bankKind: kindOf(s), bankFees: s.bankFees });
  const vm = (s.vitality || {}).money === false ? 0 : num(prod.vitalityMoneyFee);
  const account = num(prod.accountFee), credit = num(prod.creditFee);
  return { account, credit, vitalityMoney: vm, annual: num(prod.annualFee), total: account + credit + vm, label: prod.label };
}

/* settings.bill.gap follows "It is part of my Discovery Health debit order":
   the typed gap cover is then the part of the Health debit that is gap
   cover (products.js), and no gap debit order of its own is made. */
function applyManual(settings) {
  const m = manualOf(settings);
  const bill = Object.assign({}, settings.bill || {});
  if (m.gapInHealth && num(m.gap)) bill.gap = num(m.gap);
  else delete bill.gap;
  settings.bill = bill;
  return settings;
}

const fm = (k, v) => `${k}: ${v}`;
const note = (account, month, rows) => [
  '---', fm('account', `"${account}"`), fm('month', month), '---', '',
  '| Date | Description | Category | Amount | Excluded | Note |',
  '|------|-------------|----------|-------:|----------|------|',
  ...rows.map(r => `| ${r[0]} | ${r[1]} | ${r[2]} | ${r[3].toFixed(2)} |  |  |`), '',
].join('\n');
const DISC = 'Discovery Bank';
const OTHER = 'Another bank';
const accountNote = (type, inst, label) => `---\ntype: ${type}\ninstitution: ${inst}\ntx_label: "${label}"\n---\n`;
const round2 = n => Math.round(n * 100) / 100;

/* settings → the typed months as Budget-plugin notes. */
function manualFiles(settings, now) {
  const s = settings || {};
  const m = manualOf(s);
  const p = ticked(s);
  const kind = kindOf(s);
  const at = n => num(m[n]);

  /* the accounts: Discovery Bank's for the package ticked; another bank's
     card and account for spend and debit orders that need somewhere to go */
  const discCard = p.bank && (kind === 'suite' || kind === 'card');
  const discEveryday = p.bank && (kind === 'suite' || kind === 'transaction');
  const discSavings = p.bank && kind === 'savings';
  const spendOn = discCard ? 'Card' : discEveryday ? 'Everyday' : 'Other card';
  const debitsOn = discEveryday ? 'Everyday' : 'Other account';
  const interestOn = discSavings ? 'Savings' : discEveryday ? 'Everyday' : 'Card';
  const feesOn = discCard ? 'Card' : 'Everyday';

  const files = {};
  const used = new Set();
  const START = new Date(now.getFullYear(), now.getMonth() - 12, 1);
  const fees = m.feesHow === 'typed' ? null : publishedFees(s);
  for (let i = 0; i < 12; i++) {
    const d = new Date(START.getFullYear(), START.getMonth() + i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const day = n => `${ym}-${String(n).padStart(2, '0')}`;
    const month = {};
    const add = (acct, row) => { (month[acct] || (month[acct] = [])).push(row); };

    if (p.bank && kind !== 'savings') {
      if (fees) {
        if (fees.account) add(feesOn, [day(28), 'Monthly Account fee', 'Bank charges & fees', -fees.account]);
        if (fees.credit) add(feesOn, [day(28), 'Monthly facility fee', 'Bank charges & fees', -fees.credit]);
        if (fees.vitalityMoney) add(feesOn, [day(28), 'Vitality Money Premium', 'Bank charges & fees', -fees.vitalityMoney]);
        /* Purple's annual card fee, once in the year */
        if (fees.annual && i === 0) add(feesOn, [day(28), 'Annual card fee', 'Bank charges & fees', -fees.annual]);
      } else if (at('fees')) {
        add(feesOn, [day(28), 'Monthly Account fee', 'Bank charges & fees', -at('fees')]);
      }
    }

    /* the shops, then the rest of the card spend (only a Discovery card's
       spend was asked: never below what the shops and flights make up) */
    const shops = [
      ['checkers', 'CHECKERS', 'Groceries'], ['woolworths', 'WOOLWORTHS', 'Groceries'], ['pnp', 'PICK N PAY', 'Groceries'],
      ['clicks', 'CLICKS', 'Toiletries'], ['dischem', 'DIS-CHEM', 'Toiletries'],
      ['fuel', 'BP SERVICE STATION', 'Fuel'],
    ];
    let shopTotal = 0;
    for (const [k, desc, cat] of shops) {
      if (!at(k)) continue;
      shopTotal += at(k);
      add(spendOn, [day(26), desc, cat, -at(k)]);
    }
    /* the year's flights are card spend too, a twelfth of them a month */
    const counted = shopTotal + at('flights') / 12;
    if (spendOn !== 'Other card' && at('cardSpend') > counted + 0.005) add(spendOn, [day(27), 'Other card purchases', 'Shopping', -round2(at('cardSpend') - counted)]);
    if (at('gym')) add(debitsOn, [day(25), 'VIRGIN ACTIVE MEMBERSHIP', 'Gym', -at('gym')]);
    /* a year of flights as one booking, in the middle of the year */
    if (at('flights') && i === 6) add(spendOn, [day(26), 'VITALITY TRAVEL', 'Holiday', -at('flights')]);
    if (p.bank && at('interest')) add(interestOn, [day(28), 'Dynamic interest boost', 'Interest income', at('interest')]);

    if (p.health && at('health')) add(debitsOn, [day(25), 'DISC PREM', 'Medical aid', -at('health')]);
    if (p.health && at('claims')) add(debitsOn, [day(27), 'DISC MEMB', 'Medical expenses', round2(at('claims') / 12)]);
    if (p.gap && at('gap') && !m.gapInHealth) add(debitsOn, [day(25), 'INSGAP', 'Gap cover', -at('gap')]);
    if (p.insure && at('insure')) add(debitsOn, [day(25), 'DISCINSURE', 'Car insurance', -at('insure')]);
    if (p.life && at('life')) add(debitsOn, [day(25), 'DISCOVERY LIFE', 'Life cover', -at('life')]);

    for (const acct of Object.keys(month)) {
      files[`${B}Transactions/${acct}/${ym}.md`] = note(acct, ym, month[acct]);
      used.add(acct);
    }
  }

  /* an account note for each Discovery account the package has, and for
     another bank's card or account only when something went through it */
  const accounts = {
    Card: discCard && accountNote('credit_card', DISC, 'Card'),
    Everyday: discEveryday && accountNote('checking', DISC, 'Everyday'),
    Savings: discSavings && accountNote('savings', DISC, 'Savings'),
    'Other card': used.has('Other card') && accountNote('credit_card', OTHER, 'Other card'),
    'Other account': used.has('Other account') && accountNote('checking', OTHER, 'Other account'),
  };
  for (const a of Object.keys(accounts)) if (accounts[a]) files[`${B}Accounts/${a}.md`] = accounts[a];
  return files;
}

/* A read-only source over the typed months, the shape load.js loadBudget
   reads: loadBudget(manualSource(settings, now, vault), MANUAL_FOLDER). The
   vault's own CSVs come through as they are; its notes never do. */
function manualSource(settings, now, vault) {
  const files = manualFiles(settings, now);
  const list = Object.keys(files);
  const csvs = vault ? vault.paths().filter(p => /\.csv$/i.test(p) && !own(files, p)) : [];
  return {
    paths: () => list.concat(csvs),
    read: p => (own(files, p) ? Promise.resolve(files[p]) : vault ? vault.read(p) : Promise.resolve('')),
    stat: p => (own(files, p) ? { mtime: 1, size: files[p].length } : vault && vault.stat ? vault.stat(p) : { mtime: 1, size: 0 }),
  };
}

/* True when at least one money answer was typed. */
function hasTyped(settings) {
  const m = manualOf(settings);
  return QUESTIONS.some(q => q.fields.some(f => num(m[f.key]) > 0)) || (m.feesHow !== 'typed' && ticked(settings).bank);
}

/* The page's words about statements, said for numbers that were typed in.
   Longest phrases first; anything not listed is left as it was. */
const WORDS = [
  [/Your last Discovery Health debit order was (.+?) on \d{1,2} [A-Z][a-z]{2} \d{4}\./g, 'You typed a Discovery Health debit order of $1 a month.'],
  [/\s*\(shown as [A-Z][A-Z ]*?(?: on your (?:bank )?statements)?\)/g, ''],
  [/(You (?:spent|paid) [^.]*?) in the last 12 months\./g, '$1 in a year, by the figures you typed.'],
  [/\bon your Discovery statements\b/g, 'in the figures you typed'],
  [/\b(?:on|in) your (?:bank )?statements\b/g, 'in the figures you typed'],
  [/\bFrom your statements\b/g, 'From the figures you typed'],
  [/\bfrom your statements\b/g, 'from the figures you typed'],
  [/\bnot from your statements\b/g, 'not from the figures you typed'],
  [/\bof Discovery Bank statements\b/g, 'of typed Discovery Bank figures'],
  [/\bmonths? of statements\b/g, m => (/^months/.test(m) ? 'months of typed figures' : 'month of typed figures')],
  [/\bYour statements\b/g, 'The figures you typed'],
  [/\byour statements\b/g, 'the figures you typed'],
  [/\bthat quarter's statements\b/g, 'the figures you typed'],
];
function manualWords(text) {
  let t = String(text === undefined || text === null ? '' : text);
  if (!/statement|shown as|debit order was|in the last 12 months/.test(t)) return t;
  for (const [re, to] of WORDS) t = t.replace(re, to);
  return t;
}

/* manualWords over every text node under `node` (the page, after it is
   drawn in typed-numbers mode). Walks childNodes, so it needs no
   TreeWalker; nodeType 3 is a text node. */
function rewordTree(node) {
  if (!node) return;
  const kids = node.childNodes || [];
  for (let i = 0; i < kids.length; i++) {
    const k = kids[i];
    if (k.nodeType === 3) {
      const was = k.nodeValue;
      const now = manualWords(was);
      if (now !== was) k.nodeValue = now;
    } else rewordTree(k);
  }
}

/* A line's source as the page labels it: with typed numbers, what would
   have been read from statements ('measured') was typed in ('entered',
   "You entered"). */
const typedSource = source => (source === 'measured' ? 'entered' : source);

module.exports = { typedSource, MANUAL_FOLDER, MANUAL_DEFAULTS, QUESTIONS, manualQuestions, publishedFees, applyManual, manualFiles, manualSource, hasTyped, manualWords, rewordTree };
