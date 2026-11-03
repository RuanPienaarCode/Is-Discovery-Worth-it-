'use strict';
/* Every rate the estimates use, with where it came from. A rate the user
   edited on the page (settings.rates[key]) always wins over these.

   A rate is one of:
     value                       a single published figure
     on + byStatus               picked by the status named in `on`
     band                        a Vitality Money percentage picked by that
                                 month's card spend (Diamond tables only —
                                 the other statuses' tables are not loaded,
                                 so they read 0 until you type a figure)

   Sources (fetched 21 Oct 2026):
     BLACK  Discovery Black rewards guide, rewards as at 1 Jan 2026 —
            discovery.co.za/assets/discoverycoza/bank/marketing-material/vitality-money/
            understanding-your-dynamic-discounts-rewards-percentages-discovery-black-card-account-and-discovery-black-full-banking-suite.pdf
     FEES   Black Suite fees guide, effective 1 Sep 2026
     HF     HealthyFood with Vitality Health and Vitality Money, Aug 2026
     HC     HealthyCare benefit guide, Aug 2026
     DRIVE  How the Vitality Drive programme works, 2026 (in the vault)
     MILES  discovery.co.za/bank/info-and-tips-discovery-bank-rewards */

/* The shorthand used in `source` below, spelled out on the page. */
const SOURCE_NAMES = {
  BLACK: 'Discovery Black rewards guide (rewards as at 1 Jan 2026)',
  FEES: 'Black Suite fees guide (from 1 Sep 2026)',
  HF: 'HealthyFood with Vitality Health and Vitality Money (Aug 2026)',
  HC: 'HealthyCare benefit guide (Aug 2026)',
  DRIVE: 'How the Vitality Drive programme works (2026)',
  MILES: 'Discovery Bank rewards: info and tips',
  CCFEES: 'Black Credit Card Account fees guide (from 1 Sep 2026)',
  DYN: 'Dynamic interest rates (as at 25 Sep 2026)',
};
/* "BLACK: grows with…" → "Grows with…. Source: Discovery Black rewards
   guide…" — the plain sentence first, the document it came from after. */
function sourceText(src) {
  const m = /^(BLACK|FEES|CCFEES|HF|HC|DRIVE|MILES|DYN)\b:?\s*(.*)$/.exec(String(src || ''));
  if (!m) return String(src || '');
  const said = m[2] ? m[2].charAt(0).toUpperCase() + m[2].slice(1) + ' ' : '';
  return `${said}Source: ${SOURCE_NAMES[m[1]]}.`;
}

/* Monthly card spend bands (lower bounds) for Vitality Money rewards. */
const BANDS = [3150, 5750, 8900, 12050, 15250, 18450, 23600, 29000];
/* Flights use a 12-month average and run higher. */
const FLIGHT_BANDS = [3150, 5750, 8900, 12050, 15250, 18450, 23600, 29000, 35000, 41000, 47000];

const DIAMOND = {
  healthyFood: [7.5, 8.5, 10, 12.5, 15, 17.5, 20, 25],
  healthyCare: [7.5, 8.5, 10, 12.5, 15, 17.5, 20, 25],
  fuel: [5, 6, 7, 8, 10, 11, 12.5, 15],
  flightsLocal: [11, 14, 17, 20, 25, 27.5, 30, 35, 40, 45, 50],
  /* Black Credit Card Account (or bundled Transaction Account) column */
  ccFlightsLocal: [8, 9, 10, 12.5, 15, 17.5, 20, 25, 27.5, 30, 35],
};
const FLIGHT_TABLES = ['flightsLocal', 'ccFlightsLocal'];

/* Percentage for `spend` in a band table; 0 below the first band. */
function bandPct(bands, table, spend) {
  let i = -1;
  for (let k = 0; k < bands.length; k++) if (spend >= bands[k]) i = k;
  return i < 0 ? 0 : table[i];
}

const RATES = {
  mileValue: { label: 'What one Discovery Mile is worth', unit: 'R', value: 0.1, source: 'MILES: partners take 10 Miles as R1.', year: 2026 },
  milesRandPerMile: { label: 'Card spend for one Mile, virtual card', unit: 'R per Mile', on: 'money', byStatus: { Blue: 65, Bronze: 50, Silver: 40, Gold: 30, Diamond: 15 }, source: 'BLACK', year: 2026 },
  milesThreshold: { label: 'Monthly card spend that earns Miles at the full rate', unit: 'R/month', value: 25000, source: 'BLACK: above it you get one Mile per R100.', year: 2026 },
  milesAboveThreshold: { label: 'Card spend for one Mile above that amount', unit: 'R per Mile', value: 100, source: 'BLACK', year: 2026 },
  milesPhysical: { label: 'Card spend for one Mile, plastic card', unit: 'R per Mile', value: 200, source: 'BLACK: one Mile per R200, up to your monthly limit.', year: 2026 },
  virtualSharePct: { label: 'How much of your card spend is paid with the virtual card', unit: '%', value: 100, source: 'Your own figure. Paying with your phone only counts if the phone holds the virtual card; the plastic card earns about a thirteenth as much.', year: null, guess: true },
  activeRewardsWithoutBank: { label: 'Basic exercise rewards you would still get without the bank', unit: 'R/month', value: 100, source: 'Your own guess. Without Discovery Bank, Vitality Health still gives small weekly rewards (a coffee or smoothie) but not the gameboard.', year: null, guess: true },

  healthyFoodShare: { label: 'How much of your Checkers / Woolworths spend is HealthyFood', unit: '%', value: 25, source: 'Your own guess. Only HealthyFood items count; the Vitality app shows your real total.', year: null, guess: true },
  healthyFoodMoneyPct: { label: 'Bank\'s extra HealthyFood percentage', unit: '%', band: 'healthyFood', source: 'BLACK: grows with your monthly card spend, up to 25% at Diamond.', year: 2026 },
  healthyFoodMoneyCap: { label: 'HealthyFood spend the bank\'s extra applies to', unit: 'R/month', value: 2500, source: 'HF: R2 500 a month with one Discovery credit card holder, R5 000 when both spouses have one.', year: 2026 },
  healthyFoodHealthPct: { label: 'HealthyFood back from Vitality Health (main shop)', unit: '%', value: 25, source: 'HF: 25% if you have done the Vitality Age assessment and a Health Check, 10% if not.', year: 2026 },
  healthyFoodSecondaryPct: { label: 'HealthyFood back at the other shop', unit: '%', value: 10, source: 'HF: up to 10% back at your other HealthyFood shop.', year: 2026 },
  healthyFoodHealthCap: { label: 'HealthyFood spend Vitality Health pays on (whole family)', unit: 'R/month', value: 5000, source: 'HF: up to R5 000 a month for the family.', year: 2026 },
  healthyMinSpend: { label: 'Least HealthyFood or HealthyCare spend a month before any reward', unit: 'R/month', value: 200, source: 'From September 2026 a month with less than this earns nothing. Discovery counts it per person, per shop, and in store and online separately; here it is checked per shop. Source: Vitality benefit updates, 2026.', year: 2026 },

  healthyCareShare: { label: 'How much of your Clicks / Dis-Chem spend is HealthyCare', unit: '%', value: 30, source: 'Your own guess. Schedule 1 and 2 medicines no longer count.', year: null, guess: true },
  healthyCareMoneyPct: { label: 'Bank\'s extra HealthyCare percentage', unit: '%', band: 'healthyCare', source: 'BLACK: same steps as HealthyFood, up to 25%.', year: 2026 },
  healthyCareHealthPct: { label: 'HealthyCare back from Vitality Health', unit: '%', value: 25, source: 'Up to 25% at your main shop. Source: Vitality help pages.', year: 2026 },
  healthyCareCap: { label: 'HealthyCare spend Vitality Health pays on (whole family)', unit: 'R/month', value: 4000, source: 'HC: up to R4 000 a month for the family.', year: 2026 },
  healthyCareMoneyCap: { label: 'HealthyCare spend the bank\'s extra applies to', unit: 'R/month', value: 2000, source: 'HC: up to R2 000 a month with one account holder.', year: 2026 },

  fuelDrivePct: { label: 'Vitality Drive fuel back', unit: '%', on: 'drive', byStatus: { Blue: 0, Bronze: 5, Silver: 15, Gold: 30, Diamond: 50 }, source: 'DRIVE: for the Purple and Classic Insure plans; Essential plans get half.', year: 2026 },
  fuelMoneyPct: { label: 'Bank\'s extra fuel percentage', unit: '%', band: 'fuel', source: 'BLACK: grows with your monthly card spend, up to 15% at Diamond. (Until 31 October 2026 the bank\'s website says up to 20%.)', year: 2026 },
  fuelCap: { label: 'Fuel spend that earns rewards, per driver', unit: 'R/month', value: 1500, source: 'DRIVE: the limit when you have no home insurance with Discovery. It is not published whether the bank\'s extra has the same limit; we assume it does.', year: 2026 },
  fuelDrivers: { label: 'Main drivers who bank with Discovery', unit: 'drivers', value: 1, source: 'Fuel rewards go to main drivers who hold their own Discovery Bank account.', year: null, guess: true },
  driveFunderAccount: { label: 'Drive rewards paid into the Insure Funder Account (1 = yes, 0 = cash)', unit: 'yes/no', value: 0, source: 'DRIVE: money paid into the Insure Funder Account is doubled. You can use it for excesses, tyres, services and licences, and take out up to half every three years at R2 of the account for every R1.', year: 2026 },
  appleWatchMonthly: { label: 'Apple Watch full monthly payment', unit: 'R/month', value: 0, source: 'Worked out from what you were charged in months you missed goals, if there are any: 0–1 weekly goals met costs the full payment, 2 goals three quarters, 3 goals half, 4 goals nothing. Otherwise the watch\'s price divided by 24. The amount follows the shop price, so it can change.', year: 2026 },
  appleWatchActivation: { label: 'Apple Watch activation fee', unit: 'R', value: 1199, source: 'A once-off fee of R1 199 for the 24-month contract. Source: Apple Watch FAQ, 15 Sep 2026.', year: 2026 },
  gymDiscountPct: { label: 'Vitality gym discount', unit: '%', value: 75, source: '75% off at a Virgin Active or Planet Fitness near you, if you go 36 times a year. Source: Vitality.', year: 2026 },
  fuelWithoutBankPct: { label: 'Fuel back without Discovery Bank', unit: '%', value: 0, source: 'DRIVE: without any Discovery Bank account there are no fuel rewards, but even the free account is enough.', year: 2026 },

  travelHealthPct: { label: 'Flight discount from Vitality Health on its own', unit: '%', value: 25, source: 'BLACK: 10% straight away, up to 25% once you have done your health assessments.', year: 2026 },
  /* The Black Credit Card Account on its own (the downgrade option). */
  ccFee: { label: 'Black Credit Card Account monthly fee', unit: 'R/month', value: 275, source: 'CCFEES: R140 account + R80 Vitality Money + R55 credit card.', year: 2026 },
  paytFee: { label: 'Average fee per payment on the cheaper account', unit: 'R', value: 3.25, source: 'CCFEES: debit orders cost R3,75 and online payments R2,75; card purchases and moving money between your own accounts are free. The average is a guess.', year: 2026, guess: true },
  ccMilesRandPerMile: { label: 'Card spend for one Mile on the Credit Card Account, virtual card', unit: 'R per Mile', on: 'money', byStatus: { Blue: 100, Bronze: 65, Silver: 50, Gold: 40, Diamond: 20 }, source: 'BLACK: the Black Credit Card Account column.', year: 2026 },
  ccTravelMoneyPct: { label: 'Bank\'s extra flight discount on the Credit Card Account (local flights)', unit: '%', band: 'ccFlightsLocal', avg: true, source: 'BLACK: grows with your average card spend, up to 35% at Diamond.', year: 2026 },
  savingsBoostPct: { label: 'Extra interest on savings, Suite', unit: '%', on: 'money', byStatus: { Blue: 0, Bronze: 0.25, Silver: 0.5, Gold: 1, Diamond: 1.5 }, source: 'DYN: savings earn 4,75%, up to 6,25% on the Suite.', year: 2026 },
  ccSavingsBoostPct: { label: 'Extra interest on savings, Credit Card Account', unit: '%', on: 'money', byStatus: { Blue: 0, Bronze: 0.15, Silver: 0.3, Gold: 0.75, Diamond: 1 }, source: 'DYN: up to 5,75% on the Credit Card Account (the same steps apply to money left in the card).', year: 2026 },
  travelMoneyPct: { label: 'Bank\'s extra flight discount (local flights)', unit: '%', band: 'flightsLocal', avg: true, source: 'BLACK: grows with your average card spend over 12 months, up to 50%, on three return or six one-way flights a year.', year: 2026 },
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
  { id: 'gotyme', name: 'GoTyme (TymeBank)', fee: 0, backPct: 0, capMonthly: 0,
    note: 'No monthly fee and no rewards, but also no credit card, so it is not a like-for-like swap.', source: 'gotyme.co.za: "Open a bank account for free" (no fee schedule published)' },
  { id: 'capitec', name: 'Capitec Global One', fee: 57.5, backPct: 1, capMonthly: 0,
    note: 'R7,50 for the account and R50 for the credit card. The 1% back on credit card spend (Live Better) comes from a 2022 article and may now be 1,5%. We could not read Capitec\'s own website, so check before you decide.', source: 'The Citizen 6 Feb 2026 (fees); BusinessTech Feb 2022 (rewards, unconfirmed for 2026)' },
  { id: 'fnbAspire', name: 'FNB Fusion Aspire', rewardKind: 'points', fee: 125, backPct: 0.5, capMonthly: 0, guess: true,
    note: 'eBucks rewards are mostly at Pick n Pay, Clicks and Engen, where you spend little. FNB does not publish a general rewards rate, so the 0,5% here is a guess.', source: 'FNB Aspire pricing guide 2026/27 (fee); rewards rate is a guess' },
  { id: 'fnbPremier', name: 'FNB Fusion Premier', rewardKind: 'points', fee: 260, backPct: 1, capMonthly: 0, guess: true,
    note: 'Up to 30% back in eBucks at Pick n Pay online (20% in store) and up to R8 a litre at Engen, but only on up to 20% of your card spend. FNB does not publish a general rewards rate, so the 1% here is a guess.', source: 'FNB Premier pricing guide 2026/27 (fee); rewards rate is a guess' },
  { id: 'sbPrestige', name: 'Standard Bank Prestige', rewardKind: 'points', app: 'UCount', fee: 285, backPct: 1, capMonthly: 0,
    partners: [{ label: 'UCount at Checkers and Shoprite', keys: ['shop.checkers'], pct: null, capMonthly: 3000 }],
    note: 'R260 (with a credit card) and R25 for UCount. Up to 1% back on card spend, plus up to 40% in UCount points at Checkers. That rate and the R3 000 limit come from 2025 articles and are not confirmed.', source: 'Standard Bank Prestige pricing guide 2026; UCount Checkers terms unconfirmed' },
  { id: 'absaPremium', name: 'Absa Premium', app: 'Absa banking', fee: 265, backPct: 0.5, capMonthly: 0, guess: true,
    partners: [
      { label: 'Grocery partners (Checkers, Woolworths, Pick n Pay)', keys: GROCERY, pct: null, capMonthly: 3000, shareOfSpend: 20 },
      { label: 'Fuel at Shell or Sasol (if you moved from bp)', keys: FUEL, pct: null, capMonthly: 3000, shareOfSpend: 20 },
    ],
    note: 'The Premium package with a credit card. Absa Rewards pays "up to 30%" back at grocery partners and at Shell or Sasol, on up to R3 000 a month each and no more than 20% of your card spend. Your own rate is only shown in the Absa app. The 0,5% on other spending is a guess.', source: 'absa.co.za premium banking; Absa Rewards terms 2026 (caps); tier rates unpublished' },
];

/* ctx: { status, spend } — spend is the month's (or the 12-month average)
   card spend, for band rates. */
function rate(settings, key, status, ctx) {
  const o = settings && settings.rates ? settings.rates[key] : undefined;
  if (o !== undefined && o !== null && o !== '' && Number.isFinite(Number(o))) return Number(o);
  const def = RATES[key] || altRate(key);
  if (!def) return 0;
  const s = status || {};
  let v = def.value;
  if (def.byStatus) v = def.byStatus[s[def.on]];
  if (def.band) {
    const table = s.money === 'Diamond' ? DIAMOND[def.band] : null;
    v = table ? bandPct(FLIGHT_TABLES.includes(def.band) ? FLIGHT_BANDS : BANDS, table, (ctx && ctx.spend) || 0) : 0;
  }
  return Number.isFinite(v) ? v : 0;
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

module.exports = { sourceText, FACE_VALUE: 0.1, RATES, ALTERNATIVES, BANDS, FLIGHT_BANDS, DIAMOND, bandPct, rate };
