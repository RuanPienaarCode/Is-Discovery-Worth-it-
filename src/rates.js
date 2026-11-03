'use strict';
const { STATUSES } = require('./constants');
/* Every rate the estimates use, with where it came from. A rate the user
   edited on the page (settings.rates[key]) always wins over these.

   A rate is one of:
     value                       a single published figure
     on + byStatus               picked by the status named in `on`
     band                        a Vitality Money percentage picked by the
                                 Suite (settings.suite), the Vitality Money
                                 status and that month's card spend, from
                                 SUITE_TABLES
   A Suite can replace a figure in RATES (SUITES[].rates), for the rates that
   differ between Gold, Platinum, Black and Purple.

   Sources (fetched 3 Nov 2026 unless the source says otherwise):
     GUIDE   Discovery Bank rewards guide of each collection, effective
             1 Nov 2026 — discovery.co.za/assets/discoverycoza/bank/
             marketing-material/vitality-money/understanding-your-dynamic-
             discounts-rewards-percentages-discovery-<gold|platinum|black>-
             card-account-and-discovery-<…>-full-banking-suite.pdf, and
             …-discovery-purple-full-banking-suite.pdf
     FEES    Suite fees guides, effective 1 Sep 2026 — discovery.co.za/wcm/
             discoverycoza/assets/bank/fees-guides/discovery-bank-<gold|
             platinum|black>-suite-fees.pdf and discovery-bank-purple-fees.pdf
     CCFEES  Credit Card Account fees guides, effective 1 Sep 2026 —
             …/fees-guides/discovery-bank-<gold|platinum|black>-credit-card-fees.pdf
     HF      HealthyFood with Vitality Health and Vitality Money, Aug 2026
     HC      HealthyCare benefit guide, Aug 2026
     DRIVE   How the Vitality Drive programme works, 2026
     MILES   discovery.co.za/bank/info-and-tips-discovery-bank-rewards
     DYN     Dynamic interest rates (as at 25 Sep 2026, Black Suite)
     HFG     HealthyFood benefit guide, Vitality Health and Vitality Money —
             discovery.co.za/wcm/discoverycoza/assets/vitality/bank/
             healthyfood-vitality-and-bank.pdf
     HCG     HealthyCare benefit guide, Vitality Health only — discovery.co.za/
             wcm/discoverycoza/assets/vitality/benefit-rules/vitality-
             healthycare-benefit-guide-vitality-only.pdf (read 3 Nov 2026; its
             footer already says "Last updated December 2026", for changes it
             lists as coming into effect from 1 December 2026)
     GYM     Virgin Active benefit guide — cdn.discovery.co.za/wcm/discoverycoza/
             assets/vitality/benefit-rules/virgin-active-post-benefit-guide.pdf,
             and the Vitality Premium brochure 2026 (30 Sep 2026)
     AR      Vitality Active Rewards benefit guide — discovery.co.za/wcm/
             discoverycoza/assets/vitality/benefit-rules/vitality-active-
             rewards-benefit-guide.pdf
     DRIVETC How the Vitality Drive programme works, 2026 — discovery.co.za/
             assets/discoverycoza/vitality/vitality-drive-ts-cs.pdf (page 16)
     DMILES  Discovery Miles benefit guide (1 Nov 2026) — discovery.co.za/assets/
             discoverycoza/bank/discovery-miles-bank-benefit-guide.pdf, and
             discovery.co.za/bank/discovery-miles

   Some figures depend on something other than a status: whether you have
   done your health checks, how often you go to the gym, whether Discovery
   insures your home, your Insure plan. Those rates carry `cases`: the
   figure counted by default is the lower one, and a case replaces it when
   the caller says it applies (ctx.met[when] === true). No setting feeds
   ctx.met yet; the questions it needs are listed with each case. */

/* The shorthand used in `source` below, spelled out on the page. */
const SOURCE_NAMES = {
  GUIDE: 'Discovery Bank rewards guide for your Suite (effective 1 Nov 2026)',
  BLACK: 'Discovery Bank rewards guide, Black Collection (effective 1 Nov 2026)',
  FEES: 'Discovery Bank Suite fees guides (from 1 Sep 2026)',
  HF: 'HealthyFood with Vitality Health and Vitality Money (Aug 2026)',
  HC: 'HealthyCare benefit guide (Aug 2026)',
  DRIVE: 'How the Vitality Drive programme works (2026)',
  MILES: 'Discovery Bank rewards: info and tips',
  CCFEES: 'Discovery Bank Credit Card Account fees guides (from 1 Sep 2026)',
  DYN: 'Dynamic interest rates, Black Suite (as at 25 Sep 2026)',
  HFG: 'HealthyFood benefit guide, Vitality Health and Vitality Money (read 3 Nov 2026)',
  HCG: 'HealthyCare benefit guide, Vitality Health (read 3 Nov 2026; it covers changes from 1 Dec 2026)',
  GYM: 'Virgin Active benefit guide and Vitality Premium brochure 2026 (read 3 Nov 2026)',
  AR: 'Vitality Active Rewards benefit guide (read 3 Nov 2026)',
  DRIVETC: 'How the Vitality Drive programme works, 2026 (read 3 Nov 2026)',
  DMILES: 'Discovery Miles benefit guide (1 Nov 2026)',
};
/* "GUIDE: grows with…" → "Grows with…. Source: Discovery Bank rewards
   guide…" — the plain sentence first, the document it came from after. */
function sourceText(src) {
  const m = /^(GUIDE|BLACK|FEES|CCFEES|HFG|HCG|HF|HC|DRIVETC|DRIVE|DMILES|MILES|DYN|GYM|AR)\b:?\s*(.*)$/.exec(String(src || ''));
  if (!m) return String(src || '');
  const said = m[2] ? m[2].charAt(0).toUpperCase() + m[2].slice(1) + ' ' : '';
  return `${said}Source: ${SOURCE_NAMES[m[1]]}.`;
}

/* Monthly card spend bands (lower bounds) of the Black Collection's
   HealthyFood, HealthyCare and fuel tables. */
const BANDS = [3150, 5750, 8900, 12050, 15250, 18450, 23600, 29000];
/* Black local flights use a 12-month average and run higher. */
const FLIGHT_BANDS = [3150, 5750, 8900, 12050, 15250, 18450, 23600, 29000, 35000, 41000, 47000];
/* Gold tables, and the Platinum fuel table, stop at R15 250. */
const SHORT_BANDS = [3150, 5750, 8900, 12050, 15250];

/* Percentage for `spend` in a band table; 0 below the first band. */
function bandPct(bands, table, spend) {
  let i = -1;
  for (let k = 0; k < bands.length; k++) if (spend >= bands[k]) i = k;
  return i < 0 ? 0 : table[i];
}

/* The Vitality Money band tables, per Suite: { bands, Blue … Diamond },
   one percentage per band. Read from each collection's rewards guide,
   effective 1 Nov 2026. A table that is null means the account earns
   nothing there. healthyFood, healthyCare and fuel are the same for the
   Suite and its Credit Card Account (except Gold, whose Credit Card Account
   gets no HealthyCare from the bank); flightsLocal is the Suite column,
   ccFlightsLocal the Credit Card Account column. */
const t = (bands, Blue, Bronze, Silver, Gold, Diamond, source) => ({ bands, Blue, Bronze, Silver, Gold, Diamond, source });
const BLACK_GUIDE = 'Discovery Bank rewards guide, Black Collection, effective 1 Nov 2026';
const GOLD_GUIDE = 'Discovery Bank rewards guide, Gold Collection, effective 1 Nov 2026';
const PLATINUM_GUIDE = 'Discovery Bank rewards guide, Platinum Collection, effective 1 Nov 2026';
const PURPLE_GUIDE = 'Discovery Bank rewards guide, Purple Suite, effective 1 Nov 2026';
const BLACK_HEALTHY = t(BANDS,
  [5, 5, 5, 5, 6, 7, 8, 8],
  [5, 5, 5, 6, 7.5, 8.5, 10, 12.5],
  [5, 5, 6, 7.5, 9, 10.5, 12, 15],
  [5.5, 6, 7.5, 9, 11, 13, 15, 18.5],
  [7.5, 8.5, 10, 12.5, 15, 17.5, 20, 25], BLACK_GUIDE);
const PLATINUM_HEALTHY = t(BANDS,
  [5, 5, 5, 5, 6, 7, 7, 7],
  [5, 5, 5, 6, 7.5, 8.5, 10, 10],
  [5, 5, 6, 7.5, 9, 10.5, 12, 15],
  [5.5, 6, 7.5, 9, 11, 13, 15, 18.5],
  [7.5, 8.5, 10, 12.5, 15, 17.5, 20, 25], PLATINUM_GUIDE);
const GOLD_HEALTHY = t(SHORT_BANDS,
  [5, 5, 5, 5, 5],
  [5, 5, 5, 6, 6],
  [5, 5, 6, 7.5, 9],
  [5.5, 6, 7.5, 9, 11],
  [7.5, 8.5, 10, 12.5, 15], GOLD_GUIDE);
const SUITE_TABLES = {
  Black: {
    healthyFood: BLACK_HEALTHY,
    healthyCare: BLACK_HEALTHY,
    fuel: t(BANDS,
      [3, 3, 3, 3, 4, 4, 5, 5],
      [3, 3, 3.5, 4, 5, 5.5, 6.5, 7.5],
      [3, 3.5, 4, 4.5, 6, 6.5, 7.5, 9],
      [3.5, 4.5, 5, 6, 7.5, 8, 9, 11],
      [5, 6, 7, 8, 10, 11, 12.5, 15], BLACK_GUIDE),
    flightsLocal: t(FLIGHT_BANDS,
      [5, 6, 7, 7, 7, 7, 7, 8, 8, 8, 8],
      [6, 7.5, 8.5, 10, 10, 12.5, 13, 15, 15, 15, 15],
      [7.5, 9, 11, 13, 15, 17.5, 18, 21, 24, 27.5, 27.5],
      [9, 11, 13, 15, 17.5, 20, 22.5, 26, 30, 35, 35],
      [11, 14, 17, 20, 25, 27.5, 30, 35, 40, 45, 50], BLACK_GUIDE),
    ccFlightsLocal: t(FLIGHT_BANDS,
      [5, 5, 5, 5, 6, 7, 7, 7, 8, 8, 8],
      [5, 5, 5, 6, 7.5, 8.5, 10, 10, 11.5, 13, 15],
      [5, 5, 6, 7.5, 9, 10.5, 12, 15, 16.5, 18, 20],
      [6, 6.5, 7.5, 9, 11, 13, 15, 18.5, 20, 22.5, 25],
      [8, 9, 10, 12.5, 15, 17.5, 20, 25, 27.5, 30, 35], BLACK_GUIDE),
  },
  Platinum: {
    healthyFood: PLATINUM_HEALTHY,
    healthyCare: PLATINUM_HEALTHY,
    fuel: t(SHORT_BANDS,
      [3, 3, 3, 3, 4],
      [3, 3, 3.5, 4, 5],
      [3, 3.5, 4, 4.5, 6],
      [3.5, 4.5, 5, 6, 7.5],
      [5, 6, 7, 8, 10], PLATINUM_GUIDE),
    flightsLocal: t(BANDS,
      [5, 6, 7, 7, 7, 7, 7, 8],
      [6, 7.5, 8.5, 10, 10, 12.5, 13, 15],
      [7.5, 9, 11, 13, 15, 17.5, 18, 21],
      [9, 11, 13, 15, 17.5, 20, 22.5, 26],
      [11, 14, 17, 20, 25, 27.5, 30, 35], PLATINUM_GUIDE),
    ccFlightsLocal: t(BANDS,
      [5, 5, 5, 5, 6, 7, 7, 7],
      [5, 5, 5, 6, 7.5, 8.5, 10, 10],
      [5, 5, 6, 7.5, 9, 10.5, 12, 15],
      [6, 6.5, 7.5, 9, 11, 13, 15, 18.5],
      [8, 9, 10, 12.5, 15, 17.5, 20, 25], PLATINUM_GUIDE),
  },
  Gold: {
    healthyFood: GOLD_HEALTHY,
    healthyCare: GOLD_HEALTHY,
    fuel: t(SHORT_BANDS,
      [3, 3, 3, 3, 3],
      [3, 3, 3.5, 4, 4],
      [3, 3.5, 4, 4.5, 6],
      [3.5, 4.5, 5, 6, 7.5],
      [5, 6, 7, 8, 10], GOLD_GUIDE),
    flightsLocal: t(SHORT_BANDS,
      [5, 6, 7, 7, 7],
      [6, 7.5, 8.5, 10, 10],
      [7.5, 9, 11, 13, 15],
      [9, 11, 13, 15, 18.5],
      [11, 14, 17, 20, 25], GOLD_GUIDE),
    ccFlightsLocal: t(SHORT_BANDS,
      [5, 5, 5, 5, 6],
      [5, 5, 5, 6, 7.5],
      [5, 5, 6, 7.5, 9],
      [6, 6.5, 7.5, 9, 11],
      [8, 9, 10, 12.5, 15], GOLD_GUIDE),
  },
  /* Purple has its own, wider steps, and no Credit Card Account of its own. */
  Purple: {
    healthyFood: t([3150, 23600, 29000, 35000, 41000, 47000],
      [7, 8, 11, 14, 14, 14],
      [8.5, 10, 13.5, 17.5, 21, 25],
      [10.5, 12, 16.5, 21, 25.5, 30],
      [13, 15, 20.5, 26, 31.5, 37.5],
      [17.5, 20, 27.5, 35, 42.5, 50], PURPLE_GUIDE),
    healthyCare: t([3150, 23600, 29000],
      [7, 8, 10],
      [8.5, 10, 12.5],
      [10.5, 12, 15],
      [13, 15, 18.5],
      [17.5, 20, 25], PURPLE_GUIDE),
    fuel: t([3150, 23600, 29000],
      [4, 5, 6],
      [5.5, 6.5, 7.5],
      [6.5, 7.5, 9],
      [8, 9, 11],
      [11, 12.5, 15], PURPLE_GUIDE),
    flightsLocal: t([3150, 23600, 29000, 35000, 41000, 47000],
      [7, 7, 8, 8, 8, 8],
      [12.5, 13, 15, 15, 15, 15],
      [17.5, 18, 21, 24, 27.5, 27.5],
      [20, 22.5, 26, 30, 35, 35],
      [27.5, 30, 35, 40, 45, 50], PURPLE_GUIDE),
    ccFlightsLocal: null,
  },
};
/* The Black Diamond rows, kept under their old name for older callers. */
const DIAMOND = {
  healthyFood: SUITE_TABLES.Black.healthyFood.Diamond,
  healthyCare: SUITE_TABLES.Black.healthyCare.Diamond,
  fuel: SUITE_TABLES.Black.fuel.Diamond,
  flightsLocal: SUITE_TABLES.Black.flightsLocal.Diamond,
  ccFlightsLocal: SUITE_TABLES.Black.ccFlightsLocal.Diamond,
};

/* The four Suites. fee = the total monthly account fee (account fee +
   Vitality Money premium + single credit facility fee). creditCard = the
   same collection's Credit Card Account on its own (the cheaper option the
   Bank tab weighs); null when the collection has none. baseMiles = virtual
   card spend for one Mile below the threshold, by status. rates = the RATES
   figures this Suite changes. unconfirmed = rate keys still carrying the
   Black Suite figure because this Suite's own was not found. */
const MILES_HIGH = { Blue: 65, Bronze: 50, Silver: 40, Gold: 30, Diamond: 15 };
const MILES_LOW = { Blue: 100, Bronze: 65, Silver: 50, Gold: 40, Diamond: 20 };
const SAVINGS_UNCONFIRMED = 'The extra interest on savings is only published for the Black Suite (DYN), so that figure is used here. Type your own on the Inputs tab if yours differs.';
const SUITES = [
  { id: 'Gold', label: 'Gold Suite', fee: 250, feeParts: { account: 115, vitalityMoney: 66, credit: 69 },
    baseMiles: MILES_LOW, milesThreshold: 10000,
    creditCard: { label: 'Gold Credit Card Account', fee: 125, feeParts: { account: 32.5, vitalityMoney: 37.5, credit: 55 }, baseMiles: MILES_LOW, note: 'The Gold Credit Card Account gets no HealthyCare from the bank; the Gold Suite does.' },
    rates: { milesRandPerMile: { byStatus: MILES_LOW }, ccMilesRandPerMile: { byStatus: MILES_LOW }, milesThreshold: { value: 10000 }, ccFee: { value: 125 } },
    unconfirmed: ['savingsBoostPct', 'ccSavingsBoostPct'], unconfirmedWhy: SAVINGS_UNCONFIRMED,
    source: 'Gold Suite fees guide and Gold Credit Card Account fees guide (from 1 Sep 2026); Discovery Bank rewards guide, Gold Collection (effective 1 Nov 2026)' },
  { id: 'Platinum', label: 'Platinum Suite', fee: 340, feeParts: { account: 190, vitalityMoney: 81, credit: 69 },
    baseMiles: MILES_HIGH, milesThreshold: 15000,
    creditCard: { label: 'Platinum Credit Card Account', fee: 180, feeParts: { account: 70, vitalityMoney: 55, credit: 55 }, baseMiles: MILES_LOW },
    rates: { milesRandPerMile: { byStatus: MILES_HIGH }, ccMilesRandPerMile: { byStatus: MILES_LOW }, milesThreshold: { value: 15000 }, ccFee: { value: 180 } },
    unconfirmed: ['savingsBoostPct', 'ccSavingsBoostPct'], unconfirmedWhy: SAVINGS_UNCONFIRMED,
    source: 'Platinum Suite fees guide and Platinum Credit Card Account fees guide (from 1 Sep 2026); Discovery Bank rewards guide, Platinum Collection (effective 1 Nov 2026)' },
  { id: 'Black', label: 'Black Suite', fee: 605, feeParts: { account: 435, vitalityMoney: 101, credit: 69 },
    baseMiles: MILES_HIGH, milesThreshold: 25000,
    creditCard: { label: 'Black Credit Card Account', fee: 275, feeParts: { account: 140, vitalityMoney: 80, credit: 55 }, baseMiles: MILES_LOW },
    rates: {},
    unconfirmed: [],
    source: 'Black Suite fees guide and Black Credit Card Account fees guide (from 1 Sep 2026); Discovery Bank rewards guide, Black Collection (effective 1 Nov 2026)' },
  { id: 'Purple', label: 'Purple Suite', fee: 730, feeParts: { account: 540, vitalityMoney: 121, credit: 69 },
    baseMiles: MILES_HIGH, milesThreshold: 30000,
    creditCard: null,
    rates: { milesRandPerMile: { byStatus: MILES_HIGH }, milesThreshold: { value: 30000 }, ccFee: { value: null }, ccMilesRandPerMile: { value: null } },
    unconfirmed: ['savingsBoostPct'], unconfirmedWhy: SAVINGS_UNCONFIRMED,
    source: 'Discovery Bank Purple fees guide (from 1 Sep 2026); Discovery Bank rewards guide, Purple Suite (effective 1 Nov 2026)' },
];
const DEFAULT_SUITE = 'Black';

/* settings.suite → its SUITES entry (Black when unset or unknown). Accepts
   'Gold' or 'Gold Suite'. */
function suiteOf(settingsOrId) {
  const raw = typeof settingsOrId === 'string' ? settingsOrId : settingsOrId && settingsOrId.suite;
  const id = String(raw || '').replace(/\s*suite$/i, '').trim().toLowerCase();
  return SUITES.find(s => s.id.toLowerCase() === id) || SUITES.find(s => s.id === DEFAULT_SUITE);
}

/* Every Discovery Bank product a person can hold, per tier and kind
   (settings.bankKind: 'suite' | 'card' | 'transaction' | 'savings'; null
   = suite). A transaction account comes with bundled fees or
   pay-as-you-transact fees (settings.bankFees: 'bundled' | 'payt'; null =
   bundled). accountFee is the line a statement calls "Monthly account fee";
   vitalityMoneyFee and creditFee come as their own lines; total is the
   three together. payt: debit orders (R3,75) and digital payments (R2,75)
   are charged one by one. baseMiles: virtual card spend for one Mile below
   the threshold, by status; null = no base Miles. bands: the reward tables
   this product uses instead of the Suite's (null = it earns nothing there).
   Fees guides effective 1 Sep 2026; Miles and tables from the rewards guide
   of each collection, effective 1 Nov 2026. Purple comes only as a Suite. */
const PAYT_NONE = { milesRandPerMile: { value: null }, milesAboveThreshold: { value: null }, milesPhysical: { value: 0 }, milesThreshold: { value: null } };
const NO_LIFESTYLE = { healthyFood: null, healthyCare: null, fuel: null };
const product = (suite, kind, fees, label, accountFee, vitalityMoneyFee, creditFee, baseMiles, milesThreshold, bands, source, extra) => Object.assign({
  id: suite ? `${suite}.${kind}${fees === 'payt' && kind === 'transaction' ? 'Payt' : ''}` : kind,
  suite, kind, fees, label, accountFee, vitalityMoneyFee, creditFee, total: accountFee + vitalityMoneyFee + creditFee,
  payt: fees === 'payt', baseMiles, milesThreshold, bands: bands || {}, source,
  rates: baseMiles ? { milesRandPerMile: { byStatus: baseMiles }, milesThreshold: { value: milesThreshold } } : PAYT_NONE,
}, extra || {});
const FG = (name, tier) => `Discovery Bank ${name} fees guide (from 1 Sep 2026); rewards guide, ${tier} Collection (effective 1 Nov 2026)`;
const BANK_PRODUCTS = [
  product('Gold', 'suite', 'bundled', 'Gold Suite', 115, 66, 69, MILES_LOW, 10000, null, FG('Gold Suite', 'Gold')),
  product('Gold', 'card', 'payt', 'Gold Credit Card Account', 32.5, 37.5, 55, MILES_LOW, 10000, { flightsLocal: 'ccFlightsLocal', healthyCare: null }, FG('Gold Credit Card Account', 'Gold')),
  product('Gold', 'transaction', 'bundled', 'Gold Transaction Account (bundled fees)', 125, 45, 0, MILES_LOW, 10000, NO_LIFESTYLE, FG('Gold Transaction Account bundled', 'Gold')),
  product('Gold', 'transaction', 'payt', 'Gold Transaction Account (pay-as-you-transact)', 15, 20, 0, null, null, Object.assign({ flightsLocal: null }, NO_LIFESTYLE), FG('Gold Transaction Account pay-as-you-transact', 'Gold')),
  product('Platinum', 'suite', 'bundled', 'Platinum Suite', 190, 81, 69, MILES_HIGH, 15000, null, FG('Platinum Suite', 'Platinum')),
  product('Platinum', 'card', 'payt', 'Platinum Credit Card Account', 70, 55, 55, MILES_LOW, 15000, { flightsLocal: 'ccFlightsLocal' }, FG('Platinum Credit Card Account', 'Platinum')),
  product('Platinum', 'transaction', 'bundled', 'Platinum Transaction Account (bundled fees)', 210, 60, 0, MILES_LOW, 15000, NO_LIFESTYLE, FG('Platinum Transaction Account bundled', 'Platinum')),
  product('Platinum', 'transaction', 'payt', 'Platinum Transaction Account (pay-as-you-transact)', 40, 40, 0, null, null, Object.assign({ flightsLocal: null }, NO_LIFESTYLE), FG('Platinum Transaction Account pay-as-you-transact', 'Platinum')),
  product('Black', 'suite', 'bundled', 'Black Suite', 435, 101, 69, MILES_HIGH, 25000, null, FG('Black Suite', 'Black')),
  product('Black', 'card', 'payt', 'Black Credit Card Account', 140, 80, 55, MILES_LOW, 25000, { flightsLocal: 'ccFlightsLocal' }, FG('Black Credit Card Account', 'Black')),
  product('Black', 'transaction', 'bundled', 'Black Transaction Account (bundled fees)', 300, 75, 0, MILES_LOW, 25000, NO_LIFESTYLE, FG('Black Transaction Account bundled', 'Black')),
  product('Black', 'transaction', 'payt', 'Black Transaction Account (pay-as-you-transact)', 80, 55, 0, null, null, Object.assign({ flightsLocal: null }, NO_LIFESTYLE), FG('Black Transaction Account pay-as-you-transact', 'Black')),
  product('Purple', 'suite', 'bundled', 'Purple Suite', 540, 121, 69, MILES_HIGH, 30000, null, 'Discovery Bank Purple fees guide (from 1 Sep 2026); rewards guide, Purple Suite (effective 1 Nov 2026)'),
  /* Savings only: the free Ðiscovery Account. It is in no tier's rewards
     guide, so its base Miles and reward tables are not confirmed: they read
     nothing until you type a figure. */
  product(null, 'savings', 'payt', 'Ðiscovery Account (savings only)', 0, 0, 0, null, null, Object.assign({ flightsLocal: null }, NO_LIFESTYLE), 'Ðiscovery Account fees guide (from 1 Sep 2026)',
    { unconfirmed: true, unconfirmedWhy: 'The rewards guides do not list the Ðiscovery Account, so no Miles or rewards are counted for it.' }),
];
const BANK_KINDS = ['suite', 'card', 'transaction', 'savings'];

/* settings (+ ctx) → the BANK_PRODUCTS row: the tier from settings.suite,
   the kind from settings.bankKind (null = suite), the fees from
   settings.bankFees for a transaction account (null = bundled). A kind the
   tier does not offer (Purple has only the Suite) falls back to the Suite. */
function bankProductOf(settings, ctx) {
  const x = ctx || {}, st = settings || {};
  const kind = BANK_KINDS.includes(x.bankKind || st.bankKind) ? x.bankKind || st.bankKind : 'suite';
  if (kind === 'savings') return BANK_PRODUCTS.find(p => p.kind === 'savings');
  const suite = suiteOf(x.suite || st).id;
  const fees = (x.bankFees || st.bankFees) === 'payt' ? 'payt' : 'bundled';
  const rows = BANK_PRODUCTS.filter(p => p.suite === suite && p.kind === kind);
  return rows.find(p => kind !== 'transaction' || p.fees === fees) || rows[0] || BANK_PRODUCTS.find(p => p.suite === suite && p.kind === 'suite');
}

const RATES = {
  mileValue: { label: 'What one Discovery Mile is worth', unit: 'R', value: 0.1, source: 'MILES: partners take 10 Miles as R1.', year: 2026 },
  /* Spending Miles: Miles+ partners take a discount off the price when you
     pay with Miles, bigger on Ð-Day (the 15th of each month). Electricity,
     data and airtime take Miles at face value. */
  /* Per active Vitality programme (Money, Health, Drive): model.js
     multiplies by how many the person has, so 15% and 30% are the most. */
  milesDdayPct: { label: 'Discount when you spend Miles on Ð-Day (the 15th), per active Vitality programme', unit: '%', value: 10, perProgramme: true, source: 'DMILES: double the everyday discount on the 15th of each month, so 10% for each Vitality programme you have (Vitality Money, Health and Drive), up to 30%. It is for online and in-store purchases at Discovery Miles partners; prepaid airtime, data and electricity bought in the app get only the everyday discount.', year: 2026 },
  milesPartnerPct: { label: 'Discount when you spend Miles at Discovery Miles partners, per active Vitality programme', unit: '%', value: 5, perProgramme: true, source: 'DMILES: 5% off for every Vitality programme you have switched on (Vitality Money, Health and Drive), up to 15%. It applies at Discovery Miles partners online and in store, in the Vitality Mall, and on prepaid airtime, data and electricity in the Discovery Bank app. Not on travel, cash or Miles sent to someone.', year: 2026 },
  milesRandPerMile: { label: 'Card spend for one Mile, virtual card', unit: 'R per Mile', on: 'money', byStatus: { Blue: 65, Bronze: 50, Silver: 40, Gold: 30, Diamond: 15 }, source: 'GUIDE: at Diamond, one Mile for every R15 on the Platinum, Black and Purple Suites, and for every R20 on the Gold Suite. This is the only Miles figure your Vitality Money status changes.', year: 2026 },
  milesThreshold: { label: 'Monthly card spend that earns Miles at the full rate', unit: 'R/month', value: 25000, source: 'GUIDE: R10 000 on the Gold Suite, R15 000 on Platinum, R25 000 on Black and R30 000 on Purple, the same at every Vitality Money status. Above it you get one Mile per R100.', year: 2026 },
  milesAboveThreshold: { label: 'Card spend for one Mile above that amount', unit: 'R per Mile', value: 100, source: 'GUIDE: one Mile per R100 at every Vitality Money status.', year: 2026 },
  milesPhysical: { label: 'Card spend for one Mile, plastic card', unit: 'R per Mile', value: 200, source: 'GUIDE: one Mile per R200 up to your monthly limit, and none above it, whatever your Vitality Money status.', year: 2026 },
  virtualSharePct: { label: 'How much of your card spend is paid with the virtual card', unit: '%', value: 100, source: 'Your own figure. Paying with your phone only counts if the phone holds the virtual card; the plastic card earns about a thirteenth as much.', year: null, guess: true },
  activeRewardsWithoutBank: { label: 'Basic exercise rewards you would still get without the bank', unit: 'R/month', value: 100, source: 'AR: your own guess. Without Discovery Bank you still get a gameboard play for each weekly goal, but its Miles are hidden and vary, and you can spend them only on Vitality Active Rewards (a coffee or smoothie). Discovery publishes no rand figure, and it does not depend on your Vitality Health status.', year: null, guess: true,
    unconfirmed: true, unconfirmedWhy: 'Discovery does not publish what a gameboard play is worth without the bank, so this is a guess.' },

  healthyFoodShare: { label: 'How much of your Checkers / Woolworths spend is HealthyFood', unit: '%', value: 25, source: 'Your own guess. Only HealthyFood items count; the Vitality app shows your real total.', year: null, guess: true },
  healthyFoodMoneyPct: { label: 'Bank\'s extra HealthyFood percentage', unit: '%', band: 'healthyFood', source: 'GUIDE: grows with your monthly card spend and your Vitality Money status. At Diamond it goes up to 15% on the Gold Suite, 25% on Platinum and Black, and 50% on Purple.', year: 2026 },
  healthyFoodMoneyCap: { label: 'HealthyFood spend the bank\'s extra applies to', unit: 'R/month', value: 2500, source: 'HF: R2 500 a month with one Discovery credit card holder, R5 000 when both spouses have one.', year: 2026 },
  healthyFoodHealthPct: { label: 'HealthyFood back from Vitality Health (main shop)', unit: '%', value: 10,
    cases: [{ when: 'assessed', value: 25, label: 'Done your Vitality Age and a Vitality Health Check in the last 12 months' }],
    source: 'HFG: 10% once you switch HealthyFood on, 25% once each adult has done both the Vitality Age assessment and a Vitality Health Check in the last 12 months. Your Vitality Health status does not change it. We count 10% until you say you have done both; type 25 if you have.', year: 2026 },
  healthyFoodSecondaryPct: { label: 'HealthyFood back at the other shop', unit: '%', value: 0,
    cases: [{ when: 'assessed', value: 10, label: 'Done your Vitality Age and a Vitality Health Check in the last 12 months' }],
    source: 'HFG: 10% at your other HealthyFood shop, but only once you have done both health checks; nothing before that. Vitality Active plans have no second shop. We count nothing until you say you have done both; type 10 if you have.', year: 2026 },
  healthyFoodHealthCap: { label: 'HealthyFood spend Vitality Health pays on (whole family)', unit: 'R/month', value: 5000, source: 'HF: up to R5 000 a month for the family.', year: 2026 },
  healthyMinSpend: { label: 'Least HealthyFood or HealthyCare spend a month before any reward', unit: 'R/month', value: 200, source: 'From September 2026 a month with less than this earns nothing. Discovery counts it per person, per shop, and in store and online separately; here it is checked per shop. Source: Vitality benefit updates, 2026.', year: 2026 },

  healthyCareShare: { label: 'How much of your Clicks / Dis-Chem spend is HealthyCare', unit: '%', value: 30, source: 'Your own guess. Schedule 1 and 2 medicines no longer count.', year: null, guess: true },
  healthyCareMoneyPct: { label: 'Bank\'s extra HealthyCare percentage', unit: '%', band: 'healthyCare', source: 'GUIDE: grows with your monthly card spend and your Vitality Money status, up to 15% on the Gold Suite and 25% on the others.', year: 2026 },
  healthyCareHealthPct: { label: 'HealthyCare back from Vitality Health', unit: '%', value: 10,
    cases: [
      { when: 'assessed', value: 25, label: 'Done your Vitality Age and a Vitality Health Check in the last 12 months' },
      { when: 'oneAssessment', value: 15, label: 'Done one of the two health checks in the last 12 months' },
    ],
    source: 'HCG: 10% at Clicks and Dis-Chem once you switch HealthyCare on, 15% at your main shop after one of the two health checks, 25% after both (Vitality Age and a Vitality Health Check in the last 12 months). Your Vitality Health status does not change it. We count 10% until you say otherwise; type 15 or 25 if that is yours.', year: 2026 },
  healthyCareCap: { label: 'HealthyCare spend Vitality Health pays on (whole family)', unit: 'R/month', value: 4000, source: 'HC: up to R4 000 a month for the family.', year: 2026 },
  healthyCareMoneyCap: { label: 'HealthyCare spend the bank\'s extra applies to', unit: 'R/month', value: 2000, source: 'HC: up to R2 000 a month with one account holder.', year: 2026 },

  fuelDrivePct: { label: 'Vitality Drive fuel back', unit: '%', on: 'drive', byStatus: { Blue: 0, Bronze: 5, Silver: 15, Gold: 30, Diamond: 50 },
    cases: [
      { when: 'essentialPlan', on: 'drive', byStatus: { Blue: 0, Bronze: 2.5, Silver: 7.5, Gold: 15, Diamond: 25 }, label: 'On the Essential Insure plan' },
      { when: 'corePlan', value: 0, label: 'On the Core Insure plan' },
    ],
    source: 'DRIVETC: by your Vitality Drive status, for the Purple and Classic Insure plans. The Essential plan gets half, the Core plan none. Paid with the plastic card instead of the virtual card, it stops at the Bronze figure.', year: 2026 },
  fuelMoneyPct: { label: 'Bank\'s extra fuel percentage', unit: '%', band: 'fuel', source: 'GUIDE: grows with your monthly card spend and your Vitality Money status, when you pay with the virtual card. At Diamond it goes up to 10% on the Gold and Platinum Suites and 15% on Black and Purple.', year: 2026 },
  fuelCap: { label: 'Fuel spend that earns rewards, per driver', unit: 'R/month', value: 1500,
    /* Blue earns 0% from Drive, so its R0 limit is left out: the bank's
       extra keeps the R1 500 assumption there. */
    cases: [
      { when: 'homeBoth', on: 'drive', byStatus: { Bronze: 2000, Silver: 2250, Gold: 2500, Diamond: 3000 }, label: 'Discovery Insure covers your building and your household contents (R300 000 or more each)' },
      { when: 'homeOne', on: 'drive', byStatus: { Bronze: 1500, Silver: 1750, Gold: 2000, Diamond: 2500 }, label: 'Discovery Insure covers your building or your household contents (R300 000 or more)' },
    ],
    source: 'DRIVETC: R1 500 a month at every status from Bronze up when Discovery does not insure your home. With home cover of R300 000 or more it grows with your Vitality Drive status, up to R3 000 at Diamond with both building and contents. It is not published whether the bank\'s extra has the same limit; we assume it does.', year: 2026 },
  fuelDrivers: { label: 'Main drivers who bank with Discovery', unit: 'drivers', value: 1, source: 'Fuel rewards go to main drivers who hold their own Discovery Bank account.', year: null, guess: true },
  driveFunderAccount: { label: 'Drive rewards paid into the Insure Funder Account (1 = yes, 0 = cash)', unit: 'yes/no', value: 0, source: 'DRIVE: money paid into the Insure Funder Account is doubled. You can use it for excesses, tyres, services and licences, and take out up to half every three years at R2 of the account for every R1.', year: 2026 },
  appleWatchMonthly: { label: 'Apple Watch full monthly payment', unit: 'R/month', value: 0, source: 'Worked out from what you were charged in months you missed goals, if there are any: 0–1 weekly goals met costs the full payment, 2 goals three quarters, 3 goals half, 4 goals nothing. Otherwise the watch\'s price divided by 24. The amount follows the shop price, so it can change.', year: 2026 },
  appleWatchActivation: { label: 'Apple Watch activation fee', unit: 'R', value: 1199, source: 'A once-off fee of R1 199 for the 24-month contract. Source: Apple Watch FAQ, 15 Sep 2026.', year: 2026 },
  gymDiscountPct: { label: 'Vitality gym discount', unit: '%', value: 50,
    cases: [{ when: 'gym36', value: 75, label: 'A one-gym (Club) membership and at least 36 workouts in the last 12 months' }],
    source: 'GYM: up to 75% off a one-gym Club membership when you work out at least 36 times in 12 months; 50% with fewer workouts, and on Premier, Collection and Club-V memberships. Your Vitality Health status does not change it. We count 50% until you say you go 36 times a year; type 75 if you do.', year: 2026 },
  fuelWithoutBankPct: { label: 'Fuel back without Discovery Bank', unit: '%', value: 0, source: 'DRIVE: without any Discovery Bank account there are no fuel rewards, but even the free account is enough.', year: 2026 },

  travelHealthPct: { label: 'Flight discount from Vitality Health on its own', unit: '%', value: 10,
    cases: [{ when: 'assessed', value: 25, label: 'Done your Vitality Age and a Vitality Health Check in the last 12 months' }],
    source: 'BLACK: 10% straight away, 25% once you have done the Vitality Age assessment and a Vitality Health Check, on three return or six one-way local flights a year. Your Vitality Health status does not change it. We count 10% until you say you have done both; type 25 if you have.', year: 2026 },
  /* Your collection's Credit Card Account on its own (the downgrade option). */
  ccFee: { label: 'Credit Card Account monthly fee', unit: 'R/month', value: 275, source: 'CCFEES: the account, Vitality Money and credit card fees together. R125 for Gold, R180 for Platinum and R275 for Black. Purple has no Credit Card Account on its own.', year: 2026 },
  paytFee: { label: 'Average fee per payment on the cheaper account', unit: 'R', value: 3.25, source: 'CCFEES: debit orders cost R3,75 and online payments R2,75; card purchases and moving money between your own accounts are free. The average is a guess.', year: 2026, guess: true },
  ccMilesRandPerMile: { label: 'Card spend for one Mile on the Credit Card Account, virtual card', unit: 'R per Mile', on: 'money', byStatus: { Blue: 100, Bronze: 65, Silver: 50, Gold: 40, Diamond: 20 }, source: 'GUIDE: the Credit Card Account column of your collection.', year: 2026 },
  ccTravelMoneyPct: { label: 'Bank\'s extra flight discount on the Credit Card Account (local flights)', unit: '%', band: 'ccFlightsLocal', avg: true, source: 'GUIDE: grows with your average card spend and your Vitality Money status, up to 15% on Gold, 25% on Platinum and 35% on Black.', year: 2026 },
  savingsBoostPct: { label: 'Extra interest on savings, Suite', unit: '%', on: 'money', byStatus: { Blue: 0, Bronze: 0.25, Silver: 0.5, Gold: 1, Diamond: 1.5 }, source: 'DYN: savings earn 4,75%, up to 6,25% on the Black Suite. The other Suites do not publish theirs, so the Black figure is used; type yours if it differs.', year: 2026 },
  ccSavingsBoostPct: { label: 'Extra interest on savings, Credit Card Account', unit: '%', on: 'money', byStatus: { Blue: 0, Bronze: 0.15, Silver: 0.3, Gold: 0.75, Diamond: 1 }, source: 'DYN: up to 5,75% on the Black Credit Card Account (the same steps apply to money left in the card). The other collections do not publish theirs, so the Black figure is used.', year: 2026 },
  travelMoneyPct: { label: 'Bank\'s extra flight discount (local flights)', unit: '%', band: 'flightsLocal', avg: true, source: 'GUIDE: grows with your average card spend over 12 months and your Vitality Money status, up to 25% on the Gold Suite, 35% on Platinum and 50% on Black and Purple, on three return or six one-way flights a year.', year: 2026 },
};

/* Banks to compare with: the everyday account plus a credit card there.
   backPct is rewards on ALL card spend; partner deals (Checkers points,
   fuel per litre) are named in the note, not counted. */
const GROCERY = ['shop.checkers', 'shop.woolworths', 'shop.pnp'];
const FUEL = ['fuel.bp', 'fuel.shell', 'fuel.other'];
/* partners: cash back at named shops, capped per month, and (Absa) at most
   `shareOfSpend` of the month's card spend per category. A partner rate of
   null is unpublished: it earns nothing here, and the page shows the rate
   that would match Discovery instead. */
const ALTERNATIVES = [
  { id: 'gotyme', name: 'GoTyme (TymeBank)', fee: 0, backPct: 0, capMonthly: 0, likeForLike: false, kinds: ['transaction', 'savings'],
    note: 'No monthly fee and no rewards, but also no credit card, so it is not a like-for-like swap.', source: 'gotyme.co.za: "Open a bank account for free" (no fee schedule published), fetched 21 Oct 2026' },
  { id: 'capitec', name: 'Capitec Global One', fee: 57.5, backPct: 1, capMonthly: 0, kinds: ['suite', 'card'],
    note: 'R7,50 for the account and R50 for the credit card. Live Better pays 1% back on credit card spend, with no levels. We could not read Capitec\'s own website, so check before you decide.', source: 'The Citizen 6 Feb 2026 (fees); Currency News, Mar 2026 (1% Live Better cash back on credit card spend; Capitec\'s own page not readable)', unconfirmed: true },
  { id: 'fnbAspire', name: 'FNB Fusion Aspire', rewardKind: 'points', fee: 125, backPct: 0.5, capMonthly: 0, guess: true, kinds: ['suite', 'card'],
    note: 'eBucks rewards are mostly at Pick n Pay, Clicks and Engen, where you spend little. FNB does not publish a general rewards rate, so the 0,5% here is a guess.', source: 'FNB Aspire pricing guide 2026/27 (fee); rewards rate is a guess' },
  { id: 'fnbPremier', name: 'FNB Fusion Premier', rewardKind: 'points', fee: 260, backPct: 1, capMonthly: 0, guess: true, kinds: ['suite', 'card'],
    note: 'Up to 30% back in eBucks at Pick n Pay online (20% in store) and up to R8 a litre at Engen, but only on up to 20% of your card spend. FNB does not publish a general rewards rate, so the 1% here is a guess.', source: 'FNB Premier pricing guide 2026/27 (fee); rewards rate is a guess' },
  { id: 'sbPrestige', name: 'Standard Bank Prestige', rewardKind: 'points', app: 'UCount', fee: 285, backPct: 1, capMonthly: 0, kinds: ['suite', 'card'], unconfirmed: true,
    partners: [{ label: 'UCount at Checkers and Shoprite', keys: ['shop.checkers'], pct: null, capMonthly: 3000 }],
    note: 'R260 (with a credit card) and R25 for UCount. Up to 1% back on card spend, plus up to 40% in UCount points at Checkers. That rate and the R3 000 limit come from 2025 articles and are not confirmed.', source: 'Standard Bank Prestige pricing guide 2026; UCount Checkers terms unconfirmed' },
  { id: 'absaPremium', name: 'Absa Premium', app: 'Absa banking', fee: 265, backPct: 0.5, capMonthly: 0, guess: true, kinds: ['suite', 'card'],
    partners: [
      { label: 'Grocery partners (Checkers, Woolworths, Pick n Pay)', keys: GROCERY, pct: null, capMonthly: 3000, shareOfSpend: 20 },
      { label: 'Fuel at Shell or Sasol (if you moved from bp)', keys: FUEL, pct: null, capMonthly: 3000, shareOfSpend: 20 },
    ],
    note: 'The Premium package with a credit card. Absa Rewards pays "up to 30%" back at grocery partners and at Shell or Sasol, on up to R3 000 a month each and no more than 20% of your card spend. Your own rate is only shown in the Absa app. The 0,5% on other spending is a guess.', source: 'absa.co.za premium banking; Absa Rewards terms 2026 (caps); tier rates unpublished' },
];

/* Whether a rival bank's figures can be leaned on: not `unconfirmed`, not
   a `guess`. Works on an ALTERNATIVES row or a model.js result (which
   carries the id), looking the flags up by id. */
const altDef = a => (a && ALTERNATIVES.find(x => x.id === a.id)) || a || {};
function altConfirmed(a) {
  const def = altDef(a);
  return !(a && (a.unconfirmed || a.guess)) && !def.unconfirmed && !def.guess;
}
/* How far a rival's figures can be leaned on: 0 confirmed, 1 published
   somewhere but not confirmed (`unconfirmed`), 2 our own guess. */
function altTrust(a) {
  const def = altDef(a);
  if (altConfirmed(a)) return 0;
  return (a && a.guess) || def.guess ? 2 : 1;
}
/* The kinds of Discovery Bank product (BANK_KINDS) a rival is a
   like-for-like swap for: an account with a credit card stands in for a
   Suite or a Credit Card Account; an account with no credit card for a
   Transaction Account or savings. A row without `kinds` falls back on
   likeForLike (false = no credit card). */
function altKinds(a) {
  const def = altDef(a);
  if (Array.isArray(def.kinds)) return def.kinds;
  return def.likeForLike === false ? ['transaction', 'savings'] : ['suite', 'card'];
}
/* Like-for-like for this kind of Discovery Bank product (a Suite when left
   out). */
const altLikeForLike = (a, bankKind) => altKinds(a).includes(BANK_KINDS.includes(bankKind) ? bankKind : 'suite');

/* The rival bank Discovery Bank is weighed against. compareWith (settings)
   names one, and that wins. Otherwise ('' or an id that is gone) the best
   — highest net — of the banks that are a like-for-like swap for the
   product you hold (opts.bankKind: a Suite or Credit Card Account is
   weighed against an account with a credit card, a Transaction Account or
   savings against one without), the confirmed ones first, then those whose
   figures were published but not confirmed, then our guesses; failing any
   like-for-like bank, the best confirmed one; failing that the best of all.
   A no-card account is never put against a credit card while a bank with a
   card is there, even one whose figures need checking: the page says when
   they do. alternatives: model.js results ({ id, net, … }).
   → one of them, or null */
function chooseAlternative(alternatives, compareWith, opts) {
  const list = Array.isArray(alternatives) ? alternatives.filter(Boolean) : [];
  if (compareWith) {
    const named = list.find(a => a.id === compareWith);
    if (named) return named;
  }
  const kind = opts && opts.bankKind;
  const best = xs => xs.slice().sort((x, y) => (y.net || 0) - (x.net || 0))[0] || null;
  const like = list.filter(a => altLikeForLike(a, kind));
  for (const trust of [0, 1, 2]) {
    const hit = best(like.filter(a => altTrust(a) === trust));
    if (hit) return hit;
  }
  return best(list.filter(altConfirmed)) || best(list);
}

/* Vitality statuses (constants.STATUSES). A status saved by an older build
   or typed by hand that is not one of them ("Platinum") would read no
   figure at all and so earn R0 without a word: it is read as Blue, the
   lowest, and statusIssues() names it so the page can ask. Case and spaces
   do not matter ("gold " is Gold); a missing one is Blue, the default. */
function normStatus(value) {
  const t = String(value === undefined || value === null ? '' : value).trim().toLowerCase();
  return STATUSES.find(x => x.toLowerCase() === t) || STATUSES[0];
}
const PROGRAMMES = ['money', 'health', 'drive'];
function normStatuses(status) {
  const s = status || {};
  const out = Object.assign({}, s);
  for (const k of PROGRAMMES) out[k] = normStatus(s[k]);
  return out;
}
const STATUS_WORDS = { money: 'bank score (Vitality Money status)', health: 'health score (Vitality Health status)', drive: 'car score (Vitality Drive status)' };
/* settings → the saved statuses that are not Vitality statuses, as a list
   of { key: 'money', saved: 'Platinum', used: 'Blue', text: plain sentence }
   (empty when every saved status is one we know, or left blank). The list
   also carries statusUnknown: the keys alone (['money']), and saved:
   { money: 'Platinum' }. */
function statusIssues(settings) {
  const s = (settings && settings.status) || {};
  const out = [];
  out.statusUnknown = [];
  out.saved = {};
  for (const k of PROGRAMMES) {
    const v = s[k];
    if (v === undefined || v === null || String(v).trim() === '') continue;
    const t = String(v).trim().toLowerCase();
    if (STATUSES.some(x => x.toLowerCase() === t)) continue;
    out.statusUnknown.push(k);
    out.saved[k] = String(v);
    out.push({ key: k, saved: String(v), used: STATUSES[0],
      text: `Your ${STATUS_WORDS[k]} is saved as "${String(v)}", which is not a Vitality status, so it is counted as ${STATUSES[0]}. Pick yours from Blue, Bronze, Silver, Gold or Diamond.` });
  }
  return out;
}

/* settings.conditions (constants.js) → the `cases` they meet. Unanswered
   meets none, so the lower published figure counts. */
function metOf(settings) {
  const c = (settings && settings.conditions) || {};
  return {
    assessed: c.checks === 'both',
    oneAssessment: c.checks === 'one',
    gym36: c.gym36 === true,
    essentialPlan: c.insurePlan === 'essential',
    corePlan: c.insurePlan === 'core',
    homeOne: c.homeCover === 'one',
    homeBoth: c.homeCover === 'both',
  };
}

/* ctx: { spend, suite, bankKind, bankFees, met } — spend is the month's (or
   the 12-month average) card spend, for band rates; suite, bankKind and
   bankFees override the same settings; met: { [case]: true } for the
   conditions known to apply (see `cases` on a rate). */
function rate(settings, key, status, ctx) {
  const o = settings && settings.rates ? settings.rates[key] : undefined;
  if (o !== undefined && o !== null && o !== '' && Number.isFinite(Number(o))) return Number(o);
  const def = RATES[key] || altRate(key);
  if (!def) return 0;
  const s = normStatuses(status);
  const suite = suiteOf((ctx && ctx.suite) || settings);
  const prod = bankProductOf(settings, ctx);
  /* the product's own figure first, then the Suite's, then RATES */
  const has = (o, k) => o && Object.prototype.hasOwnProperty.call(o, k);
  const own = has(prod.rates, key) ? prod.rates[key] : (suite.rates || {})[key];
  let v;
  if (own && has(own, 'value')) v = own.value;
  else if (own && own.byStatus) v = own.byStatus[s[def.on]];
  else v = def.byStatus ? def.byStatus[s[def.on]] : def.value;
  /* a case that applies (from settings.conditions, or ctx.met) replaces the
     default figure */
  const met = Object.assign(metOf(settings), (ctx && ctx.met) || {});
  for (const c of def.cases || []) {
    if (met[c.when] !== true) continue;
    const cv = c.byStatus ? c.byStatus[s[c.on || def.on]] : c.value;
    if (cv !== undefined) { v = cv; break; }
  }
  if (def.band) {
    const name = has(prod.bands, def.band) ? prod.bands[def.band] : def.band;
    const table = name ? bandTable(prod.suite || suite.id, name) : null;
    const row = table && table[s.money];
    v = row ? bandPct(table.bands, row, (ctx && ctx.spend) || 0) : 0;
  }
  return v !== null && Number.isFinite(v) ? v : 0;
}

/* SUITE_TABLES[suite][band], or null when that Suite earns nothing there. */
function bandTable(suiteId, band) {
  const tables = SUITE_TABLES[suiteOf(suiteId).id] || {};
  return tables[band] || null;
}

/* alt.<id>.<field> → that bank's figure as a rate definition. */
function altRate(key) {
  const m = /^alt\.([^.]+)\.(fee|backPct|capMonthly)$/.exec(key);
  const p = /^alt\.([^.]+)\.partner(\d+)$/.exec(key);
  if (p) {
    const a = ALTERNATIVES.find(x => x.id === p[1]);
    const part = a && a.partners && a.partners[Number(p[2])];
    return part ? { value: part.pct } : null;
  }
  if (!m) return null;
  const a = ALTERNATIVES.find(x => x.id === m[1]);
  return a ? { value: a[m[2]] || 0 } : null;
}

module.exports = { metOf, sourceText, chooseAlternative, altConfirmed, altTrust, altKinds, altLikeForLike, normStatus, normStatuses, statusIssues, FACE_VALUE: 0.1, RATES, ALTERNATIVES, BANDS, FLIGHT_BANDS, SHORT_BANDS, DIAMOND, SUITES, SUITE_TABLES, DEFAULT_SUITE, suiteOf, BANK_PRODUCTS, BANK_KINDS, bankProductOf, bandTable, bandPct, rate };
