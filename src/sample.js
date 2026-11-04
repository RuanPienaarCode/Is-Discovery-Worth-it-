'use strict';
/* The example household: a made-up family in "Sometown" whose budget notes
   (Budget plugin layout) and Discovery Miles statement are generated here, so
   someone without a budget can see the whole page working, and the preview
   harness (_preview/entry.js) can run every set-up.

   Everything is invented: the shops are "… SOMETOWN", the Miles statement's
   account number is the fake 1234567890, and every amount is a round guess.
   This repo is public: never put a real person's names, places, account
   numbers or amounts in here.

   Pure and deterministic: the same `now` always gives the same files (the
   month-to-month wobble is a sine, never Math.random). No Node APIs, no DOM.

     sampleFiles(now, opts)    → { vaultPath: text }
     sampleSettings(now, opts) → a fully answered settings object
     sampleSource(now, opts)   → { paths(), read(p), stat(p) } for load.js loadBudget

   opts (all optional; {} = the default example household with every product):
     setup    '' | 'healthonly' | 'gold' | 'thin' | 'older'
                healthonly  Discovery Health + Vitality Health only; the banks
                            are another bank's (Sometown Savings Bank)
                gold        a Gold Suite on Gold statuses, no gap cover, no Insure
                thin        only the last 2 months of statements
                older       gap cover with the oldest person on it 62
     partial  true: the statements stop on the 20th of the last month
     nomiles  true: no Miles statement in the vault
     miles    true: actual Miles typed in (settings only) */

const { DEFAULT_SETTINGS } = require('./constants');

/* the folder the example budget lives in, and where the Miles statement sits */
const SAMPLE_FOLDER = 'Money/Budget';
const B = SAMPLE_FOLDER + '/';
const MILES_PATH = 'Money/Discovery/DiscoveryBankMiles_1234567890_20220101_20261101.csv';

const fm = (k, v) => `${k}: ${v}`;
const note = (account, month, rows) => [
  '---', fm('account', `"${account}"`), fm('month', month), '---', '',
  '| Date | Description | Category | Amount | Excluded | Note |',
  '|------|-------------|----------|-------:|----------|------|',
  ...rows.map(r => `| ${r[0]} | ${r[1]} | ${r[2]} | ${r[3].toFixed(2)} |  |  |`), '',
].join('\n');

const setupOf = opts => (opts && opts.setup) || '';

function sampleFiles(now, opts) {
  const o = opts || {};
  const SETUP = setupOf(o);
  /* Whose accounts these are: Discovery Bank's (the default and gold) or
     another bank's (healthonly, where only the medical aid is Discovery). */
  const OTHER = SETUP === 'healthonly';
  const inst = OTHER ? 'Sometown Savings Bank' : 'Discovery Bank';
  const files = {
    [B + 'Accounts/Everyday Card.md']: `---\ntype: credit_card\ninstitution: ${inst}\ntx_label: "Card"\n---\n`,
    [B + 'Accounts/Everyday Account.md']: `---\ntype: checking\ninstitution: ${inst}\ntx_label: "Everyday"\n---\n`,
    [B + 'Accounts/Rainy Day.md']: `---\ntype: savings\ninstitution: ${inst}\ntx_label: "Rainy Day"\n---\n`,
    [B + 'Categories/Card payment.md']: '---\ntype: transfer\n---\n',
    [B + 'Categories/Groceries.md']: '---\ntype: food\n---\n',
  };
  /* the thirteen months before the clock's month */
  const START = new Date(now.getFullYear(), now.getMonth() - 13, 1);
  const GOLD = SETUP === 'gold';
  const THIN = SETUP === 'thin';
  /* thin keeps only the last two months */
  const FIRST = THIN ? 11 : 0;
  for (let i = FIRST; i < 13; i++) {
    const d = new Date(START.getFullYear(), START.getMonth() + i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const day = n => `${ym}-${String(n).padStart(2, '0')}`;
    const wob = (base, f) => base * (1 + 0.15 * Math.sin(i * f));
    /* a Discovery card's own fees, by tier; another bank's card has none that count */
    const fees = OTHER ? [] : GOLD
      ? [[day(1), 'Monthly Account fee', 'Bank charges & fees', -115], [day(1), 'Monthly facility fee', 'Bank charges & fees', -69], [day(1), 'Vitality Money Premium', 'Bank charges & fees', -66]]
      : [[day(1), 'Monthly Account fee', 'Bank charges & fees', -430], [day(1), 'Monthly facility fee', 'Bank charges & fees', -69], [day(1), 'Vitality Money Premium', 'Bank charges & fees', -98]];
    files[`${B}Transactions/Card/${ym}.md`] = note('Card', ym, [
      ...fees,
      [day(3), 'CHECKERS SOMETOWN', 'Groceries', -wob(3200, 1.3)],
      [day(10), 'WOOLWORTHS SOMETOWN', 'Groceries', -wob(1400, 0.7)],
      [day(17), 'PnP Fam Sometown', 'Groceries', -wob(600, 2.1)],
      [day(5), 'BP SOMETOWN', 'Fuel', -wob(1300, 0.9)],
      [day(19), 'SHELL SOMETOWN', 'Fuel', -wob(900, 1.7)],
      [day(8), 'CLICKS SOMETOWN', 'Toiletries', -wob(450, 1.1)],
      [day(12), 'VIRGIN ACT 0001 NETCASH', 'Gym', -365],
      [day(14), 'Yoco *Sample Cafe', 'Eating out', -wob(900, 0.5)],
      [day(21), 'TAKEALOT', 'Household', -wob(1800, 2.6)],
      [day(25), 'Payment received', 'Card payment', 12000],
      ...(OTHER ? [] : [
        [day(28), 'Dynamic interest cashback at 2%', 'Interest income', 4.2],
        [day(28), 'Intl payment fee SPOTIFY', 'Bank charges & fees', -2.1],
      ]),
      ...(i === 4 && !OTHER ? [[day(9), 'VITALITY TRAVEL', 'Holiday', -5400]] : []),
    ]);
    files[`${B}Transactions/Everyday/${ym}.md`] = note('Everyday', ym, [
      [day(1), 'DISC PREM 000-111', 'Medical aid', -5900],
      ...(GOLD || OTHER ? [] : [[day(25), 'DISCINSURE000 -111', 'Car insurance', -1150]]),
      ...(OTHER ? [] : [
        [day(28), 'Dynamic interest boost at 1.5%', 'Interest income', 18.5],
        [day(28), 'Interest Earned at 6.25%', 'Interest income', 160],
      ]),
      ...(i % 3 === 0 ? [[day(15), 'DISC MEMB 000-111', 'Medical expenses', 820]] : []),
      ...(i === 6 && !GOLD && !OTHER ? [[day(17), 'INSGAPCLA 000-222', 'Transfer between accounts', 9200]] : []),
    ]);
  }

  /* A made-up Miles statement (nomiles leaves it out; none for another bank). */
  const csv = ['"Value Date","Type","Description","Additional information","Miles"'];
  for (let i = FIRST; i < 13; i++) {
    const d = new Date(START.getFullYear(), START.getMonth() + i, 28);
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-28`;
    csv.push(`${day},"Vitality Money","Checkers in-store","",${2400 + i * 40}.00`);
    csv.push(`${day},"Vitality Health","Checkers in-store","",${3100 + i * 30}.00`);
    csv.push(`${day},"Vitality Money","Fuel BP","",${900 + (i % 3) * 50}.00`);
    csv.push(`${day},"Base Miles","TAKEALOT","${day} - R 1,800.00",120.00`);
    csv.push(`${day},"","Gameboard - Coin tile","",250.00`);
    if (i % 4 === 0) csv.push(`${day},"Basket value - R 1,200.00","Discovery Miles Redeemed For TAKE A LOT","",-8400.00`);
  }
  if (!o.nomiles && !OTHER) files[MILES_PATH] = csv.join('\n') + '\n';

  /* partial: the statements stop on the 20th of the last month, as a real
     import part-way through a month does — the page then leaves that month
     out and says so. */
  if (o.partial) {
    const last = Object.keys(files).map(k => (/(\d{4}-\d\d)\.md$/.exec(k) || [])[1]).filter(Boolean).sort().pop();
    for (const k of Object.keys(files)) {
      if (!k.endsWith(last + '.md')) continue;
      files[k] = files[k].split('\n').filter(l => { const m = /^\| (\d{4}-\d\d-(\d\d)) /.exec(l); return !m || Number(m[2]) <= 20; }).join('\n');
    }
  }
  return files;
}

/* The settings shape main.js mergeSettings gives: every default key, and
   every nested default object's keys under the answers, all copied, so the
   example never writes into DEFAULT_SETTINGS. */
function shaped(answers) {
  const out = { ...DEFAULT_SETTINGS, ...answers };
  for (const k of Object.keys(DEFAULT_SETTINGS)) {
    const d = DEFAULT_SETTINGS[k];
    if (Array.isArray(d)) out[k] = (Array.isArray(answers[k]) ? answers[k] : d).slice();
    else if (d && typeof d === 'object') out[k] = { ...d, ...(answers[k] || {}) };
  }
  return out;
}

/* The answers that go with the files, in the settings shape main.js
   mergeSettings gives. By default every question is answered — onboarded,
   the products, the bank package and its tier, the Vitality programmes and
   scores, the conditions, the household, the oldest person's age and the
   medical aid plan — so the example shows the page as a set-up person sees
   it. opts.openQuestions leaves open the ones the preview's fixtures have
   always left open (the conditions, the tier as chosen, the plan, the
   oldest age): the preview's figures stay what they were. `now` is taken
   for symmetry with sampleFiles; the answers do not change with the clock. */
function sampleSettings(now, opts) {
  const o = opts || {};
  const SETUP = setupOf(o);
  const full = !o.openQuestions;
  if (SETUP === 'healthonly') {
    return shaped({
      onboarded: true, bankKind: null,
      status: { money: 'Blue', health: 'Silver', drive: 'Blue' },
      vitality: { money: false, health: true, drive: false },
      members: { adults: 2, children: 1, ...(full ? { oldestAge: 41 } : {}) },
      health: { plan: 'dhClassicSmart' }, bill: { medical: 4600 },
      ...(full ? { products: { bank: false, health: true, gap: false, insure: false, life: false }, conditions: { checks: 'one', gym36: false, insurePlan: '', homeCover: 'none' } } : {}),
    });
  }
  if (SETUP === 'gold') {
    return shaped({
      onboarded: true,
      products: { bank: true, health: true, gap: false, insure: false, life: false },
      bankKind: 'suite', suite: 'Gold',
      status: { money: 'Gold', health: 'Gold', drive: 'Blue' },
      vitality: { money: true, health: true, drive: false },
      members: { adults: 2, children: 1, ...(full ? { oldestAge: 41 } : {}) },
      health: { plan: 'dhClassicSmart' }, bill: { medical: 4600 },
      ...(full ? { suiteAnswered: true, conditions: { checks: 'one', gym36: false, insurePlan: '', homeCover: 'none' } } : {}),
    });
  }
  return shaped({
    onboarded: true,
    products: { bank: true, health: true, gap: true, insure: true, life: true },
    bankKind: 'suite', suite: 'Black',
    status: { money: 'Diamond', health: 'Gold', drive: 'Silver' },
    vitality: { money: true, health: true, drive: true },
    benefits: { gameboard: 'half', flights: 'none' },
    actualMiles: o.miles ? { card: 2600, fuel: 900 } : {},
    /* the medical aid: Essential Dynamic Smart's 2026 price for two adults
       and a child, the dearest Discovery plan under the R 5 900 debit */
    bill: { medical: full ? 5391 : 5000, gap: 250 },
    members: { adults: 2, children: 1, ...(SETUP === 'older' ? { oldestAge: 62 } : full ? { oldestAge: 41 } : {}) },
    quotes: { 'insure.outsurance': 1050 },
    life: { monthly: 650, cover: 750000, total: 1300, age: 41 },
    home: { monthly: 0, contents: 300000 },
    ...(full ? {
      suiteAnswered: true,
      health: { plan: 'dhEssentialDynamicSmart' },
      /* both health checks done, a gym visit most weeks, a Classic Insure
         plan, no Discovery home cover */
      conditions: { checks: 'both', gym36: true, insurePlan: 'classic', homeCover: 'none' },
    } : {}),
  });
}

/* A read-only source over the example files, the shape load.js loadBudget
   reads: loadBudget(sampleSource(now), SAMPLE_FOLDER). */
function sampleSource(now, opts) {
  const files = sampleFiles(now, opts);
  const list = Object.keys(files).filter(p => /\.(md|csv)$/.test(p));
  return {
    paths: () => list.slice(),
    read: p => Promise.resolve(Object.prototype.hasOwnProperty.call(files, p) ? files[p] : ''),
    stat: p => ({ mtime: 1, size: (files[p] || '').length }),
  };
}

module.exports = { sampleFiles, sampleSettings, sampleSource, SAMPLE_FOLDER, MILES_PATH };
