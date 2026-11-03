'use strict';
/* How fresh the market data is. Every figure the Compare page and the
   estimates use is typed into the repo by hand and refreshed every six
   months; MARKET says when that was last done, and marketAge() tells the
   page when it is time to check again. Pure — no network, no Node APIs.

   ── Tables to refresh (see docs/updating-market-data.html) ──────────────
   src/rates.js
     RATES          single published figures (caps, Drive fuel %, flight %,
                    Apple Watch fee, savings boosts) — each `source` names
                    the document and its date
     SUITES         Gold, Platinum, Black, Purple: monthly fee and its parts,
                    the Credit Card Account fee, base Miles rates, threshold
                    (the Suite and Credit Card Account fees guides)
     SUITE_TABLES   the Vitality Money band tables per Suite and status
                    (the Discovery Bank rewards guide of each collection)
     ALTERNATIVES   rival banks: fee, rewards rate, partner deals
   src/compare.js
     HEALTH_PLANS, HEALTH_OWN   medical aid contributions and cover grades
     GAP_PLANS                  gap cover premiums
     INSURERS                   car insurers' claim-free rewards
     LIFE_OFFERS, LIFE_BENCHMARK  life cover insurers and the price range
     HOME_INSURERS, HOME_RANGE  household contents insurers and the range
   src/products.js
     DATES          dated changes worth a reminder (owned by the products
                    module; a past date simply stops showing)

   Each table also says the period its prices are good for (PERIODS):
   medical aids change their contributions every year, most on 1 January
   and Discovery Health on 1 April, so the data goes stale on the first
   day a table's prices are known to change, or on reviewBy, whichever
   comes first.

   After a refresh, set asOf to the day you finished, each period to what
   the new documents say, and reviewBy to six months later or the day
   before the first price change, whichever is sooner; then run `npm test`. */

/* The period each table's prices are good for. `to: null` = no end
   published; `changes` = the first day the prices are known to change
   (a new year's contributions), which makes the data stale. */
const PERIODS = {
  /* 2026 ran from 1 April (January to March 2026 kept the 2025 prices, a
     once-off delay); 2027 starts on 1 January again. `next` names the
     period whose prices are already in the tables, so the change on
     `changes` does not make the data stale. */
  discoveryHealth: { label: 'Discovery Health contributions', from: '2026-04-01', to: '2026-12-31', changes: '2027-01-01', next: 'discoveryHealth2027' },
  discoveryHealth2027: { label: 'Discovery Health 2027 contributions', from: '2027-01-01', to: '2027-12-31', changes: '2028-01-01', pending: 'Published 1 Oct 2026, still to be approved by the Council for Medical Schemes.' },
  schemes: { label: 'Other medical aids\' contributions', from: '2026-01-01', to: '2026-12-31', changes: '2027-01-01' },
  /* 2027 prices for the plans that publish them (y2027 in compare.js); a
     plan without one goes stale on 1 January 2027 */
  schemes2027: { label: 'Other medical aids\' 2027 contributions', from: '2027-01-01', to: '2027-12-31', changes: '2028-01-01', pending: 'Published Sep–Oct 2026, most still to be approved by the Council for Medical Schemes.' },
  gap: { label: 'Gap cover premiums', from: '2026-01-01', to: '2026-12-31', changes: '2027-01-01' },
  /* 2027 prices for the rows that publish them (y2027 in compare.js); a row
     without one goes stale on 1 January 2027 */
  gap2027: { label: 'Gap cover 2027 premiums', from: '2027-01-01', to: '2027-12-31', changes: '2028-01-01' },
  discoveryGap: { label: 'Discovery Gap Cover premiums', from: '2026-01-01', to: '2026-12-31', changes: '2027-01-01', next: 'discoveryGap2027' },
  discoveryGap2027: { label: 'Discovery Gap Cover 2027 premiums', from: '2027-01-01', to: '2027-12-31', changes: '2028-01-01' },
  bankFees: { label: 'Discovery Bank fees', from: '2026-09-01', to: null, changes: null },
  rewards: { label: 'Discovery Bank rewards', from: '2026-11-01', to: null, changes: null },
};

const MARKET = {
  asOf: '2026-11-03',
  /* the day before 2027 prices start: some plans and gap covers had not
     published theirs by asOf, so those rows go out of date then */
  reviewBy: '2026-12-31',
  note: 'Discovery Bank rewards as at 1 November 2026, bank fees from 1 September 2026, and 2026 prices for medical aid, gap cover and insurance, with the 2027 prices already published (Discovery Health and most other medical aids, some gap cover) taking over on 1 January 2027. Medical aids change their prices every January. Every figure and its source is listed in docs/market-data-sources.html.',
  periods: PERIODS,
};

const { dayLabel } = require('./format');

/* 'YYYY-MM-DD' for a Date or a date string. */
function ymd(d) {
  if (typeof d === 'string') return d.slice(0, 10);
  const x = d instanceof Date ? d : new Date();
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

/* Whole months from a to b ('YYYY-MM-DD'); 0 when b is before a. */
function monthsBetween(a, b) {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  let n = (by - ay) * 12 + (bm - am);
  if (bd < ad) n -= 1;
  return Math.max(0, n);
}

/* The day after 'YYYY-MM-DD'. */
function dayAfter(date) {
  const [y, m, d] = date.split('-').map(Number);
  return ymd(new Date(y, m - 1, d + 1));
}

/* now: a Date or 'YYYY-MM-DD' (default today).
   → { asOf, reviewBy, staleFrom, staleWhy, months, stale }
   staleFrom is the first day the data is out of date: the day after
   reviewBy, or the first day a table's prices are known to change, whichever
   is sooner; staleWhy names the reason in plain words. */
function marketAge(now, market) {
  const m = market || MARKET;
  const today = ymd(now === undefined || now === null ? new Date() : now);
  let staleFrom = m.reviewBy ? dayAfter(m.reviewBy) : null, staleWhy = 'It is time to check the published prices again.';
  /* a price change on the same day says more than "time to check" */
  let byReview = !!staleFrom;
  const periods = m.periods || {};
  for (const p of Object.values(periods)) {
    /* the next period's prices are in the tables already */
    if (p && p.next && periods[p.next]) continue;
    if (p && p.changes && (!staleFrom || p.changes < staleFrom || (byReview && p.changes === staleFrom))) {
      staleFrom = p.changes;
      byReview = false;
      staleWhy = `${p.label} change on ${dayLabel(p.changes)}.`;
    }
  }
  return { asOf: m.asOf, reviewBy: m.reviewBy, staleFrom, staleWhy, months: monthsBetween(m.asOf, today), stale: !!staleFrom && today >= staleFrom };
}

/* Whether a table's prices are good for a month or a day ('YYYY-MM' or
   'YYYY-MM-DD'): inside the period PERIODS[table] gives. */
function priceValidFor(table, when, market) {
  const periods = (market || MARKET).periods || {};
  if (typeof when !== 'string' || !/^\d{4}-\d{2}/.test(when)) return false;
  const ym = when.slice(0, 7);
  /* a period and the ones that follow it (`next`) */
  for (let p = periods[table], hops = 0; p && hops < 5; p = periods[p.next], hops++) {
    if (ym >= p.from.slice(0, 7) && (!p.to || ym <= p.to.slice(0, 7))) return true;
  }
  return false;
}

/* asOf plus `months` months, as 'YYYY-MM-DD' (the day clamps to the
   month's last day). Used by the tests to hold reviewBy to six months. */
function addMonths(date, months) {
  const [y, mo, d] = date.split('-').map(Number);
  const total = y * 12 + (mo - 1) + months;
  const ny = Math.floor(total / 12), nm = (total % 12) + 1;
  const last = new Date(ny, nm, 0).getDate();
  return `${ny}-${String(nm).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

module.exports = { MARKET, PERIODS, marketAge, priceValidFor, addMonths, monthsBetween };
