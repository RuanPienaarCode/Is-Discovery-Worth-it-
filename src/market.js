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

   After a refresh, set asOf to the day you finished and reviewBy to six
   months later, then run `npm test`. */

const MARKET = {
  asOf: '2026-11-03',
  reviewBy: '2027-05-03',
  note: 'Discovery Bank rewards as at 1 November 2026, bank fees from 1 September 2026, and 2026 prices for medical aid, gap cover and insurance. Medical aids change their prices every year, most in January and Discovery Health in April.',
};

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

/* now: a Date or 'YYYY-MM-DD' (default today).
   → { asOf, reviewBy, months, stale } — stale once now is after reviewBy. */
function marketAge(now, market) {
  const m = market || MARKET;
  const today = ymd(now === undefined || now === null ? new Date() : now);
  return { asOf: m.asOf, reviewBy: m.reviewBy, months: monthsBetween(m.asOf, today), stale: today > m.reviewBy };
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

module.exports = { MARKET, marketAge, addMonths, monthsBetween };
