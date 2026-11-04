'use strict';
/* How to get more out of Discovery: the things this person could do (or tell
   us) that would make their Discovery products worth more, each with a rand
   figure a year.

   Every gain is worked out by the model itself, never typed in here: the
   statement (model.js buildStatement) is built again with ONE thing changed
   (a cloned settings, or for the fuel card the fuel rows' paying card), and
   the gain is that statement's WORTH less today's (worthOf below). Where the
   change also changes a cost, the cost is netted in:
     - a package switch: the published monthly fees of the two packages
       (rates.js BANK_PRODUCTS), a year;
     - the cheaper package: the model's own counterfactual, st.downgrade
       (its gainIfDowngrade already nets the fees).

   "Same things bought" (sameThingsBought): the model reads gym fees and
   Vitality Travel payments as what you PAID, after the discount. Built again
   with a bigger discount, the same payment would mean a dearer membership
   and dearer flights, and the gain would be several times too big. So for
   the re-run those payments are scaled to what the same membership and the
   same flights would cost at the new discount, and the model then values
   the discount on the same full price.

   A lever is only offered when this person's setup can use it (no Vitality
   Health, no health-check lever; already Diamond, no status lever; already
   done the checks, none), and only when it is worth at least MIN_GAIN a
   year. Pure: no DOM, no Obsidian, node-testable. */

const { rate, normStatus, bankProductOf, suiteOf } = require('./rates');
const { STATUSES } = require('./constants');
const { anyKey } = require('./benefits');

/* levers worth less than this a year are left out */
const MIN_GAIN = 100;

const num = v => v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v));
const clone = o => JSON.parse(JSON.stringify(o || {}));
const lineOf = (st, key) => (st && st.lines ? st.lines.find(l => l.key === key) : null);
const annualOf = (st, key) => { const l = lineOf(st, key); return l && Number.isFinite(l.annual) ? l.annual : 0; };
const total = (m, key) => (m.figures && m.figures[key] ? m.figures[key].total : 0);

/* What Discovery is worth to this person a year, in one figure: the bank's
   rewards after its fees (st.net: VALUE less COST, so a fee that changes is
   in it), plus what Vitality Health gives back (the gym saving and its
   rewards, st.vitality.value) and Vitality Drive's fuel back (its own line
   in the "stays" group). Premiums are not in it: none of the levers changes
   one. Every part is already weighted by how much the person uses each
   benefit, so a benefit set to "Not for me" gains nothing. */
function worthOf(st) {
  if (!st) return 0;
  const vit = st.vitality && Number.isFinite(st.vitality.value) ? st.vitality.value : 0;
  return (Number.isFinite(st.net) ? st.net : 0) + vit + annualOf(st, 'fuel.drive');
}

/* a figure scaled by k, every month alike */
function scaledFigure(f, k) {
  if (!f) return f;
  const perMonth = {};
  for (const ym of Object.keys(f.perMonth || {})) perMonth[ym] = f.perMonth[ym] * k;
  return Object.assign({}, f, { total: f.total * k, perMonth });
}

/* m with some figures replaced (m itself is never changed) */
const withFigures = (m, changes) => Object.assign({}, m, { figures: Object.assign({}, m.figures, changes) });

/* The flight discount the model applies to Vitality Travel paid with the
   Discovery card, as a share (0–0.75), for the estimate it makes when no
   receipts are typed: Vitality Health's part plus the bank's, which needs
   the bank and grows with the average card spend. This mirrors model.js
   (the travel estimate in buildStatement: the 75% ceiling and the 10%
   floor without Vitality Health); tests/levers.test.cjs pins it against the
   model's own travel line. */
const FLIGHT_FLOOR = 10;
function flightShare(s, st) {
  const noHealth = !!(st && st.setup && st.setup.vitality && st.setup.vitality.health === false);
  const status = s.status || {};
  const healthPct = rate(s, 'travelHealthPct', status);
  const bank = rate(s, 'travelMoneyPct', status, { spend: (st && st.avgMonthlySpend) || 0 });
  const money = noHealth ? Math.max(FLIGHT_FLOOR, bank) : bank;
  return { d: Math.min(75, (noHealth ? 0 : healthPct) + money) / 100, hp: healthPct / 100 };
}

/* m as it would read if you bought the same gym membership and the same
   flights under settings s1 as you did under s0 (see the note at the top). */
function sameThingsBought(m, s0, s1, st0) {
  const changes = {};
  /* gym: the payment is the price after the discount */
  const gd = s => Math.min(95, rate(s, 'gymDiscountPct', s.status || {})) / 100;
  const g0 = gd(s0), g1 = gd(s1);
  if (g0 !== g1 && g0 < 1) {
    const k = (1 - g1) / (1 - g0);
    for (const key of ['gym', 'all.gym']) if (m.figures[key]) changes[key] = scaledFigure(m.figures[key], k);
  }
  /* flights: only the estimate reads the payments; typed receipts carry
     their own discount, so they are left alone */
  const tr = s0.travel || {};
  const receipts = num(tr.discount) && num(tr.baseFare) && Number(tr.baseFare) > 0;
  if (!receipts && m.figures['travel.vitality']) {
    const a = flightShare(s0, st0), b = flightShare(s1, st0);
    const kDisc = a.d < 1 ? (1 - b.d) / (1 - a.d) : 1;
    const kElse = a.hp < 1 ? (1 - b.hp) / (1 - a.hp) : 1;
    if (kDisc !== 1 || kElse !== 1) {
      const disc = m.figures['travel.vitality'];
      changes['travel.vitality'] = scaledFigure(disc, kDisc);
      /* bookings paid with another bank's card get Vitality Health's part
         only: all = Discovery card's + the rest */
      const all = m.figures['all.travel.vitality'];
      if (all) {
        const perMonth = {};
        let sum = 0;
        for (const ym of new Set(Object.keys(all.perMonth || {}).concat(Object.keys(disc.perMonth || {})))) {
          const d = (disc.perMonth || {})[ym] || 0, x = (all.perMonth || {})[ym] || 0;
          perMonth[ym] = d * kDisc + (x - d) * kElse;
          sum += perMonth[ym];
        }
        changes['all.travel.vitality'] = Object.assign({}, all, { total: sum, perMonth });
      }
    }
  }
  return Object.keys(changes).length ? withFigures(m, changes) : m;
}

/* the words for each score (glossary: the status beside it, first time) */
const SCORE = {
  money: { short: 'bank score', long: 'bank score (Vitality Money status, Blue to Diamond)', app: 'The Discovery Bank app shows how many Vitality Money points you still need' },
  health: { short: 'health score', long: 'health score (Vitality Health status, Blue to Diamond)', app: 'The Vitality app shows how many Vitality points you still need' },
  drive: { short: 'car score', long: 'car score (Vitality Drive status, Blue to Diamond)', app: 'The Discovery Insure app shows how many Vitality Drive points you still need' },
};
/* a change of package is a change to a financial product: the figure, and
   who can say what else changes, never an instruction to make it */
const CHANGE_HOW = 'A change of account is made with Discovery Bank. Discovery Bank or a licensed financial adviser can tell you what else changes.';
const pctText = v => String(Math.round(v * 10) / 10).replace('.', ',') + '%';

/* ── the levers ─────────────────────────────────────────────────────────
   computeLevers({ m, ms, s, st, products, vitality, buildStatement })
   → [{ id, title, line, gain, how, needs, kind }]
   m, ms: measure() and summariseMiles() over the window; s: the settings
   the statement is built from (bottom-line.js's `eff`, the effective
   settings, so the package and its tier match the page); st: today's
   statement; products, vitality: the resolved maps (passed on to every
   re-run, as the page builds today's); buildStatement: model.js's, passed
   in so this module stays light. gain is annual rands, > 0; sorted by gain,
   biggest first; only gain >= MIN_GAIN. kind: 'answer' (you may already be
   doing it: say so and it counts), 'habit' (something to do) or 'status'
   (the next Vitality status). */
function computeLevers(args) {
  const a = args || {};
  const { m, ms } = a;
  const build = a.buildStatement;
  if (!m || !m.figures || typeof build !== 'function') return [];
  const s = a.s || {};
  const opts = {};
  if (a.products) opts.products = a.products;
  if (a.vitality) opts.vitality = a.vitality;
  /* Today, built again the same way as every re-run (same m, ms, settings
     and maps), so each gain compares like with like even if the caller's
     st was built from other settings. It costs one run. */
  const base = build(m, s, ms, opts);
  const baseWorth = worthOf(base);
  const products = (base.setup && base.setup.products) || a.products || {};
  const vit = (base.setup && base.setup.vitality) || a.vitality || {};
  const cond = s.conditions || {};
  const out = [];

  /* One changed setting: build the statement again and take the
     difference in worth. `edit` changes a clone of the settings. */
  const gainWith = (edit, mFor) => {
    const s1 = clone(s);
    edit(s1);
    const m1 = mFor ? mFor(s1) : sameThingsBought(m, s, s1, base);
    return worthOf(build(m1, s1, ms, opts)) - baseWorth;
  };
  const add = (lever, gain) => {
    if (Number.isFinite(gain) && gain >= MIN_GAIN) out.push(Object.assign({}, lever, { gain }));
  };

  /* Vitality Age and a Vitality Health Check: HealthyFood, HealthyCare and
     flights from Vitality Health go up (rates.js `assessed` cases). */
  if (vit.health === true && cond.checks !== 'both') {
    const now = rate(s, 'healthyFoodHealthPct', s.status || {});
    const then = rate(Object.assign({}, s, { conditions: Object.assign({}, cond, { checks: 'both' }) }), 'healthyFoodHealthPct', s.status || {});
    const unanswered = !cond.checks;
    add({
      id: 'checks',
      kind: unanswered ? 'answer' : 'habit',
      title: 'Vitality Age and a Vitality Health Check',
      line: then > now
        ? `Your HealthyFood, HealthyCare and flight discounts from Vitality Health go from ${pctText(now)} to ${pctText(then)} once you have done both.`
        : 'Your HealthyFood, HealthyCare and flight discounts from Vitality Health go up once you have done both.',
      how: 'Vitality Age is done in the Vitality app, and a Vitality Health Check at a participating pharmacy. Both last 12 months.',
      needs: unanswered
        ? 'Already done both in the last 12 months? Say so on Inputs and it counts.'
        : 'Each adult on the plan needs both, and they count for 12 months.',
    }, gainWith(s1 => { s1.conditions = Object.assign({}, s1.conditions, { checks: 'both' }); }));
  }

  /* 36 workouts a year: the gym discount goes up (rates.js `gym36`). */
  if (vit.health === true && cond.gym36 !== true) {
    const now = rate(s, 'gymDiscountPct', s.status || {});
    const then = rate(Object.assign({}, s, { conditions: Object.assign({}, cond, { gym36: true }) }), 'gymDiscountPct', s.status || {});
    const unanswered = cond.gym36 !== false;
    add({
      id: 'gym36',
      kind: unanswered ? 'answer' : 'habit',
      title: '36 workouts a year',
      line: then > now
        ? `Your gym discount goes from ${pctText(now)} to ${pctText(then)} with at least 36 workouts in 12 months.`
        : 'Your gym discount goes up with at least 36 workouts in 12 months.',
      how: 'That is about three gym visits a month. The Vitality app shows your count.',
      needs: unanswered
        ? 'It needs a one-gym (Club) membership. Already going 36 times a year? Say so on Inputs and it counts.'
        : 'It needs a one-gym (Club) membership; other memberships keep the smaller discount.',
    }, gainWith(s1 => { s1.conditions = Object.assign({}, s1.conditions, { gym36: true }); }));
  }

  /* Spend Miles on Ð-Day: double the everyday discount at the partners. */
  if (products.bank === true && vit.money === true && s.milesUse !== 'dday') {
    const unanswered = !s.milesUse;
    add({
      id: 'dday',
      kind: unanswered ? 'answer' : 'habit',
      title: 'Miles spent on Ð-Day',
      line: 'On Ð-Day (the 15th of each month) the discount at Discovery Miles partners doubles, so each Mile buys more.',
      how: 'That means Miles kept for the 15th and spent at Discovery Miles partners, online or in store.',
      needs: unanswered
        ? 'Already spend them on Ð-Day? Say so on Benefits and it counts.'
        : 'Prepaid electricity, data and airtime in the app get only the everyday discount, not Ð-Day\'s.',
    }, gainWith(s1 => { s1.milesUse = 'dday'; }));
  }

  /* The virtual card: the plastic card earns far fewer Miles. Only when
     the person said part of their spend is on the plastic card. */
  const share = s.rates && num(s.rates.virtualSharePct) ? Number(s.rates.virtualSharePct) : null;
  if (products.bank === true && share !== null && share < 100) {
    add({
      id: 'virtualCard',
      kind: 'habit',
      title: 'Paying with the virtual card',
      line: 'The virtual card in your phone earns many more Miles than the plastic card.',
      how: 'The virtual card lives in your phone, and you pay with the phone instead of the plastic card.',
      needs: null,
    }, gainWith(s1 => { s1.rates = Object.assign({}, s1.rates, { virtualSharePct: 100 }); }));
  }

  /* Vitality Drive's fuel back needs a Discovery Bank card: fuel at bp and
     Shell paid with another bank's card earns none. The one change: those
     same fuel payments, made with the Discovery card (the bank's own extra
     on them is not added, so the figure is on the low side). */
  if (products.bank === true && vit.drive === true) {
    const discOf = key => (m.figures['disc.' + key] ? 'disc.' + key : key);
    const keys = ['fuel.bp', 'fuel.shell'];
    const anyFuel = keys.reduce((t, k) => t + Math.max(0, total(m, anyKey(m, k))), 0);
    const discFuel = keys.reduce((t, k) => t + Math.max(0, total(m, discOf(k))), 0);
    if (anyFuel - discFuel >= 0.5) {
      add({
        id: 'driveFuelCard',
        kind: 'habit',
        title: 'Fuel paid with your Discovery Bank card',
        line: 'Vitality Drive only gives fuel back when you pay at bp or Shell with a Discovery Bank card.',
        how: 'That is fuel at bp and Shell paid with a Discovery Bank card; the virtual card in your phone earns the most.',
        needs: 'Any Discovery Bank account counts, even the free one.',
      }, gainWith(() => {}, () => {
        const changes = {};
        for (const k of keys) if (m.figures[anyKey(m, k)]) changes['disc.' + k] = m.figures[anyKey(m, k)];
        return withFigures(m, changes);
      }));
    }
  }

  /* The next Vitality status, one step only. */
  const on = { money: products.bank === true && vit.money === true, health: vit.health === true, drive: vit.drive === true };
  for (const k of ['money', 'health', 'drive']) {
    if (!on[k]) continue;
    const cur = normStatus((s.status || {})[k]);
    const i = STATUSES.indexOf(cur);
    if (i < 0 || i >= STATUSES.length - 1) continue;
    const next = STATUSES[i + 1];
    const w = SCORE[k];
    add({
      id: 'status.' + k,
      kind: 'status',
      title: `A ${next} ${w.short}`,
      line: `Your ${w.long} is ${cur} now, and ${next} pays more back.`,
      how: `${w.app} for ${next}.`,
      needs: null,
    }, gainWith(s1 => { s1.status = Object.assign({}, s1.status, { [k]: next }); }));
  }

  /* The package. A switch is a big decision, so it is not offered on a
     short import (st.confidence.thin). */
  const thin = !!(base.confidence && base.confidence.thin);
  if (products.bank === true && !thin) {
    /* the cheaper Credit Card Account: the model's own counterfactual */
    const d = base.downgrade;
    if (d && Number.isFinite(d.gainIfDowngrade)) {
      const watch = annualOf(base, 'appleWatch') > 0.5;
      add({
        id: 'downgrade',
        kind: 'habit',
        title: `The ${d.label} instead`,
        line: `By these figures, its smaller monthly fee is worth more than the rewards you would give up.`,
        how: CHANGE_HOW,
        needs: watch ? 'Your Apple Watch deal needs the Suite, so it ends if you move.' : null,
      }, d.gainIfDowngrade);
    }
    /* a Credit Card Account to its Suite: the rewards from the re-run,
       less the Suite's higher published fees */
    if (s.bankKind === 'card') {
      const s1 = clone(s);
      s1.bankKind = 'suite';
      const from = bankProductOf(s), to = bankProductOf(s1);
      if (to && from && to.kind === 'suite') {
        const fees = (to.total - from.total) * 12;
        const rewards = worthOf(build(sameThingsBought(m, s, s1, base), s1, ms, opts)) - baseWorth;
        add({
          id: 'upgrade',
          kind: 'habit',
          title: `The ${to.label} instead`,
          line: `By these figures, the ${to.label}'s extra rewards are worth more than its higher monthly fee.`,
          how: CHANGE_HOW,
          needs: 'The Suite adds a transaction account to your credit card, in one package.',
        }, rewards - fees);
      }
    }
  }

  return out.sort((x, y) => y.gain - x.gain || (x.id < y.id ? -1 : 1));
}

module.exports = { computeLevers, worthOf, sameThingsBought, flightShare, MIN_GAIN };
