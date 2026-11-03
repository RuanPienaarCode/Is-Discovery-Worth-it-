'use strict';
/* A benefit counts only at what it is worth to THIS person. Someone who never
   goes to the gym gets nothing from a gym discount, however generous it
   looks; someone who never flies gets nothing from flight discounts.

   Each benefit has a level: full (counts in full), half, or none (counts
   nothing). The level is suggested from the budget — gym payments seen →
   full, none seen → none — and the person can change it (settings.benefits).
   model.js multiplies each benefit's lines by its weight. Costs are never
   weighted.

   Pure: no Obsidian, no DOM, so it runs in node for the tests. */

const { total } = require('./measure');
const { money, pct } = require('./format');
const { FACE_VALUE, RATES, DIAMOND, rate, suiteOf } = require('./rates');

/* Headline figures for the offers, read from rates.js so they move with it:
   the best a rate gets (Diamond, or the top spend band). */
const val = key => RATES[key].value;
const best = key => Math.max(...Object.values(RATES[key].byStatus));
const top = band => Math.max(...DIAMOND[band]);
const R = n => money(n);

const WITH_BANK = 'Discovery Bank with Vitality Money';

/* The page groups, in display order. */
const GROUPS = [
  { id: 'everyday', label: 'Everyday spending' },
  { id: 'health', label: 'Health' },
  { id: 'travel', label: 'Travel' },
  { id: 'car', label: 'Car' },
  { id: 'money', label: 'Money and Miles' },
];

/* ids, the products they belong to, and the model.js line keys they weight.
   offer: what Discovery gives, at its best; needs: which product makes it
   available; group: where it sits on the Benefits page; measuredBy: how this
   plugin sees whether you use it. */
const BENEFITS = [
  { id: 'miles', products: ['bank'], label: 'Miles on card payments', question: 'Do you pay with your Discovery Bank card?', lineKeys: ['miles.card', 'miles.partners'],
    group: 'everyday', needs: WITH_BANK,
    offer: `One Discovery Mile for every ${R(RATES.milesRandPerMile.byStatus.Diamond)} you pay with the virtual card at Diamond status, on up to ${R(val('milesThreshold'))} a month, then one for every ${R(val('milesAboveThreshold'))}. Partners take ${Math.round(1 / val('mileValue'))} Miles as ${R(1)}.`,
    measuredBy: 'From your Discovery Bank card spend, or your Miles statement when you add one.' },
  { id: 'healthyFood', products: ['bank', 'health'], label: 'HealthyFood rewards', question: 'Do you buy groceries at Checkers, Woolworths or Pick n Pay?', lineKeys: ['miles.healthyFood', 'healthyFood.health'],
    group: 'everyday', needs: `Vitality Health, and ${WITH_BANK} for the extra`,
    offer: `Vitality Health gives up to ${pct(val('healthyFoodHealthPct'))} back on HealthyFood at your main shop, on up to ${R(val('healthyFoodHealthCap'))} a month for the family. Discovery Bank adds up to ${pct(top('healthyFood'))} more on up to ${R(val('healthyFoodMoneyCap'))} a month, growing with your card spend.`,
    measuredBy: 'From what you spend at Checkers, Woolworths and Pick n Pay, or your Miles statement.' },
  { id: 'healthyCare', products: ['bank', 'health'], label: 'HealthyCare rewards', question: 'Do you shop at Clicks or Dis-Chem?', lineKeys: ['miles.healthyCare', 'healthyCare.health'],
    group: 'health', needs: `Vitality Health, and ${WITH_BANK} for the extra`,
    offer: `Vitality Health gives up to ${pct(val('healthyCareHealthPct'))} back on HealthyCare at your main shop, on up to ${R(val('healthyCareCap'))} a month for the family. Discovery Bank adds up to ${pct(top('healthyCare'))} more on up to ${R(val('healthyCareMoneyCap'))} a month, growing with your card spend.`,
    measuredBy: 'From what you spend at Clicks and Dis-Chem, or your Miles statement.' },
  { id: 'fuel', products: ['bank', 'insure'], label: 'Fuel rewards', question: 'Do you fill up at bp or Shell?', lineKeys: ['fuel.money', 'fuel.drive'],
    group: 'car', needs: `Discovery Insure with Vitality Drive, and ${WITH_BANK} for the extra`,
    offer: `Vitality Drive gives up to ${pct(best('fuelDrivePct'))} back at bp and Shell, on up to ${R(val('fuelCap'))} of fuel a month per driver. Discovery Bank adds up to ${pct(top('fuel'))} more, growing with your card spend.`,
    measuredBy: 'From what you spend on fuel at bp and Shell, and the Vitality Drive cash paid to you.' },
  { id: 'flights', products: ['bank', 'health'], label: 'Flight discount', question: 'Do you book flights through Vitality Travel?', lineKeys: ['travel.bank', 'travel.health'],
    group: 'travel', needs: `Vitality Health, and ${WITH_BANK} for the extra`,
    offer: `Vitality Health gives up to ${pct(val('travelHealthPct'))} off flights booked through Vitality Travel. Discovery Bank adds up to ${pct(top('flightsLocal'))} more on local flights, for three return flights a year, growing with your card spend.`,
    measuredBy: 'From your payments to Vitality Travel, or the receipts you type in.' },
  { id: 'gameboard', products: ['bank', 'health'], label: 'Exercise rewards and the gameboard', question: 'Do you meet your weekly exercise goals and play the gameboard?', lineKeys: ['gameboard', 'activeRewards', 'activeRewards.basic'],
    group: 'health', needs: 'Vitality Health, and Discovery Bank for the gameboard',
    offer: 'Miles for meeting your weekly exercise goals, played on the gameboard in the Discovery Bank app. Without the bank, Vitality Health still gives smaller weekly rewards.',
    measuredBy: 'Only from your Miles statement, since bank statements do not show it.' },
  { id: 'appleWatch', products: ['bank'], label: 'Apple Watch deal', question: 'Do you have an Apple Watch through Discovery?', lineKeys: ['appleWatch'],
    group: 'health', needs: 'The Discovery Bank Suite with a credit card',
    offer: `An Apple Watch on a 24-month contract, for a once-off ${R(val('appleWatchActivation'))} activation fee. You pay less, or nothing, in months you meet your weekly exercise goals.`,
    measuredBy: 'From the Apple Watch payments on your Discovery statements.' },
  { id: 'interest', products: ['bank'], label: 'Extra interest and cashback', question: 'Do you keep savings or money in your Discovery accounts?', lineKeys: ['interest.boost', 'interest.cashback'],
    group: 'money', needs: WITH_BANK,
    offer: `Extra interest on your savings and on money left in the card, up to ${pct(best('savingsBoostPct'))} more at Diamond status.`,
    measuredBy: 'From the extra interest and cashback on your Discovery statements.' },
  { id: 'milesPlus', products: ['bank'], label: 'Miles worth more at partners', question: 'Do you spend your Miles at Miles+ partners or on discount days?', lineKeys: ['miles.uplift'],
    group: 'money', needs: WITH_BANK,
    offer: `Your Miles buy more at Miles+ partners and on discount days than their face value of ${R(1)} for every ${Math.round(1 / FACE_VALUE)} Miles. That goes for Vitality Health's Miles too.`,
    measuredBy: 'Only from your Miles statement, since bank statements do not show what your Miles bought.' },
  { id: 'gym', products: ['health'], label: 'Gym discount', question: 'Do you go to Virgin Active or Planet Fitness?', lineKeys: [],
    group: 'health', needs: 'Vitality Health',
    offer: `Up to ${pct(val('gymDiscountPct'))} off Virgin Active or Planet Fitness fees, for up to 36 visits a year, with Vitality Health.`,
    measuredBy: 'From your payments to Virgin Active or Planet Fitness.' },
];

/* ── What unlocks each line ────────────────────────────────────────────
   Checked against Discovery's own pages (discovery.co.za/bank/info-and-tips-
   discovery-bank-rewards, the Apple Watch FAQ and the Vitality Active
   Rewards help pages, read 3 Nov 2026):
     - Vitality Money comes with a Transaction Account, a Credit Card Account
       or a Suite, never with a savings account on its own, and it must be
       switched on to earn Miles on card payments.
     - The bank's extra HealthyFood (and the other lifestyle rewards) is paid
       on Discovery Bank CREDIT card spend: "pay with your Discovery Bank
       credit card"; the reward tables list Credit Card Accounts and Suites.
       rates.js BANK_PRODUCTS (from each collection's rewards guide) gives a
       Transaction Account no HealthyFood, HealthyCare or fuel table, so
       those need the credit card here. It does give a bundled-fee
       Transaction Account the flight table (pay-as-you-transact none), so
       flights need any Discovery card and rate() reads 0 where there is
       no table.
     - Dynamic interest boosts transaction and credit card balances with
       Vitality Money. Cashback on money left in the card needs the card.
     - The gameboard is in the Discovery Bank app for the main holder of any
       product with Vitality Money; Vitality Health is not needed for it.
       UNCONFIRMED: who qualifies for Miles+ (the page's answer was cut off) —
       taken here as anyone with Vitality Money.
     - The Apple Watch needs Vitality Health and a qualifying Discovery Bank
       credit card in a Suite.
     - Vitality Drive fuel rewards need Discovery Insure with Vitality Drive.
   UNCONFIRMED: whether the bank's extra HealthyFood, HealthyCare and flight
   rewards also need Vitality Health; the page calls them "boosted" when you
   have both, so here they need Vitality Money only. */
const NEEDS = {
  bank: { test: x => x.products.bank, why: 'You do not bank with Discovery.' },
  anyCard: { test: x => x.kind !== 'savings', why: 'A savings account on its own earns no Miles. It needs a Discovery Bank card.' },
  card: { test: x => x.kind === 'suite' || x.kind === 'card', why: 'It needs a Discovery Bank credit card, in a Suite or a Credit Card Account.' },
  suite: { test: x => x.kind === 'suite', why: 'It needs a Discovery Bank Suite with a credit card.' },
  money: { test: x => x.money, why: 'It needs Vitality Money, which you do not have.' },
  health: { test: x => x.vitality.health, why: 'It needs Vitality Health, which you do not have.' },
  insure: { test: x => x.products.insure, why: 'It needs Discovery Insure.' },
  drive: { test: x => x.vitality.drive, why: 'It needs Vitality Drive, which you do not have.' },
};
const LINE_NEEDS = {
  'miles.card': ['bank', 'anyCard', 'money'],
  'miles.partners': ['bank', 'anyCard', 'money'],
  'miles.healthyFood': ['bank', 'card', 'money'],
  'miles.healthyCare': ['bank', 'card', 'money'],
  'fuel.money': ['bank', 'card', 'money'],
  'travel.bank': ['bank', 'anyCard', 'money'],
  'interest.boost': ['bank', 'money'],
  'interest.cashback': ['bank', 'card', 'money'],
  'miles.uplift': ['bank', 'money'],
  gameboard: ['bank', 'anyCard', 'money'],
  'healthyFood.health': ['health'],
  'healthyCare.health': ['health'],
  'travel.health': ['health'],
  activeRewards: ['health'],
  'activeRewards.basic': ['health'],
  gym: ['health'],
  'fuel.drive': ['insure', 'drive'],
  appleWatch: ['bank', 'suite', 'health'],
};
/* The lines a benefit covers, for availability: the gym's is its saving. */
const linesOf = b => (b.id === 'gym' ? ['gym'] : b.lineKeys);

const KINDS = ['suite', 'card', 'transaction', 'savings'];
/* settings.bankKind, null (not answered) read as a Suite, as before. */
const bankKindOf = settings => (KINDS.includes(settings && settings.bankKind) ? settings.bankKind : 'suite');

/* settings: plugin settings (bankKind); products: resolveProducts() map;
   vitality: resolved { money, health, drive } booleans.
   → { lines: Set of the line keys this setup can earn,
       benefits: { [id]: { available, reason, note } } }
   reason says why a benefit is not available; note says which part of an
   available one is not (the bank's extra, say). */
function availableFor(settings, products, vitality) {
  const p = products || {}, v = vitality || {};
  const kind = bankKindOf(settings);
  const x = {
    kind,
    products: { bank: p.bank === true, insure: p.insure === true },
    vitality: { health: v.health === true, drive: v.drive === true },
    /* Vitality Money never comes with a savings account on its own */
    money: v.money === true && kind !== 'savings',
  };
  const blocked = key => {
    for (const n of LINE_NEEDS[key] || []) {
      if (!NEEDS[n].test(x)) {
        if (n === 'money' && v.money === true && kind === 'savings') return 'Vitality Money comes with a Discovery Bank card or transaction account, not a savings account on its own.';
        return NEEDS[n].why;
      }
    }
    return '';
  };
  const lines = new Set();
  const why = {};
  for (const key of Object.keys(LINE_NEEDS)) {
    why[key] = blocked(key);
    if (!why[key]) lines.add(key);
  }
  const benefits = {};
  for (const b of BENEFITS) {
    const keys = linesOf(b);
    const open = keys.filter(k => lines.has(k));
    const shut = keys.filter(k => !lines.has(k));
    const reasons = [...new Set(shut.map(k => why[k]))];
    benefits[b.id] = open.length
      ? { available: true, reason: '', note: shut.length ? reasons.join(' ') : '' }
      : { available: false, reason: reasons.join(' '), note: '' };
  }
  return { lines, benefits };
}

/* settings.vitality with the unanswered ones taken from the products: the
   loose reading for callers with no budget at hand (the model reads the
   budget itself). */
function looseVitality(settings, products) {
  const set = (settings && settings.vitality) || {};
  const p = products || {};
  const pick = (k, dflt) => (typeof set[k] === 'boolean' ? set[k] : dflt);
  return { money: pick('money', p.bank === true), health: pick('health', p.health === true), drive: pick('drive', p.insure === true) };
}

/* The benefits the person can have: those whose products include one that
   is true in a resolveProducts() map and, given settings, that their setup
   unlocks (availableFor). Grouped in GROUPS order, then in BENEFITS order. */
function benefitsFor(products, settings, vitality) {
  const p = products || {};
  const av = settings ? availableFor(settings, p, vitality || looseVitality(settings, p)).benefits : null;
  const rank = id => GROUPS.findIndex(g => g.id === id);
  return BENEFITS.map((b, i) => ({ b, i }))
    .filter(({ b }) => b.products.some(x => p[x] === true) && (!av || av[b.id].available))
    .sort((x, y) => rank(x.b.group) - rank(y.b.group) || x.i - y.i)
    .map(({ b }) => b);
}

/* ── The offer at THIS person's tier and statuses ───────────────────── */
const STATUS = s => (s && typeof s === 'string' ? s : 'Blue');
/* the most a band rate pays at this tier and status (the top spend band) */
const TOP_SPEND = 1e9;

/* benefit (an entry or an id), settings → one or two plain sentences with
   the figures for this person's tier and Vitality statuses. Falls back to
   the static `offer` for an unknown benefit. */
function offerText(benefit, settings) {
  const b = typeof benefit === 'string' ? BENEFITS.find(x => x.id === benefit) : benefit;
  if (!b) return '';
  const s = settings || {};
  const st = s.status || {};
  const status = { money: STATUS(st.money), health: STATUS(st.health), drive: STATUS(st.drive) };
  const suite = suiteOf(s);
  const kind = bankKindOf(s);
  const ccOnly = kind === 'card';
  const rt = (key, spend) => rate(s, key, status, { spend: spend || 0 });
  const at = `at your ${status.money} status on the ${ccOnly && suite.creditCard ? suite.creditCard.label : suite.label}`;
  const bankAdds = (key, cap) => {
    const p = rt(key, TOP_SPEND);
    return p > 0
      ? `Discovery Bank adds up to ${pct(p)} more ${at}${cap ? `, on up to ${R(rt(cap))} a month` : ''}, growing with your card spend.`
      : `Discovery Bank adds nothing more ${at}.`;
  };
  switch (b.id) {
    case 'miles': {
      const per = rt(ccOnly ? 'ccMilesRandPerMile' : 'milesRandPerMile');
      if (!(per > 0)) return b.offer;
      return `One Discovery Mile for every ${R(per)} you pay with the virtual card ${at}, on up to ${R(rt('milesThreshold'))} a month, then one for every ${R(rt('milesAboveThreshold'))}. Partners take ${Math.round(1 / rt('mileValue'))} Miles as ${R(1)}.`;
    }
    case 'healthyFood':
      return `Vitality Health gives up to ${pct(rt('healthyFoodHealthPct'))} back on HealthyFood at your main shop, on up to ${R(rt('healthyFoodHealthCap'))} a month for the family. ${bankAdds('healthyFoodMoneyPct', 'healthyFoodMoneyCap')}`;
    case 'healthyCare':
      return `Vitality Health gives up to ${pct(rt('healthyCareHealthPct'))} back on HealthyCare at your main shop, on up to ${R(rt('healthyCareCap'))} a month for the family. ${bankAdds('healthyCareMoneyPct', 'healthyCareMoneyCap')}`;
    case 'fuel': {
      const drive = rt('fuelDrivePct');
      const first = drive > 0
        ? `Vitality Drive gives ${pct(drive)} back at bp and Shell at your ${status.drive} Drive status, on up to ${R(rt('fuelCap'))} of fuel a month per driver.`
        : `Vitality Drive gives nothing back at your ${status.drive} Drive status yet.`;
      return `${first} ${bankAdds('fuelMoneyPct')}`;
    }
    case 'flights':
      return `Vitality Health gives up to ${pct(rt('travelHealthPct'))} off flights booked through Vitality Travel. ${bankAdds(ccOnly ? 'ccTravelMoneyPct' : 'travelMoneyPct').replace(' more ', ' more on local flights ')}`;
    case 'interest': {
      const boost = rt(ccOnly ? 'ccSavingsBoostPct' : 'savingsBoostPct');
      return boost > 0
        ? `Extra interest on your savings and on money left in the card, ${pct(boost)} more ${at}.`
        : `No extra interest ${at} yet. It grows as your status goes up.`;
    }
    case 'gym':
      return `Up to ${pct(rt('gymDiscountPct'))} off Virgin Active or Planet Fitness fees, for up to 36 visits a year, with Vitality Health.`;
    case 'appleWatch':
      return `An Apple Watch on a 24-month contract, for a once-off ${R(rt('appleWatchActivation'))} activation fee. You pay less, or nothing, in months you meet your weekly exercise goals.`;
    default:
      return b.offer;
  }
}

const WEIGHT = { full: 1, half: 0.5, none: 0 };
const isLevel = v => typeof v === 'string' && Object.prototype.hasOwnProperty.call(WEIGHT, v);

/* Spend on any account (all.<key>, from measure.js) when it was measured,
   else the Discovery-card figure. */
const anyKey = (m, key) => (m.figures && m.figures['all.' + key] ? 'all.' + key : key);
const spent = (m, key) => Math.max(0, total(m, anyKey(m, key)));
/* "2 000 Miles" — no sign in a sentence */
const fmtMiles = n => String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+$)/g, '\u2009') + ' Miles';
const num = v => v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v));

/* "in the last 12 months" */
function inWindow(m) {
  const n = (m.months && m.months.length) || 0;
  return n === 1 ? 'in the last month' : `in the last ${n} months`;
}

/* "Checkers and Woolworths", "Checkers, Woolworths and Pick n Pay" */
function joinNames(names, word) {
  if (names.length <= 1) return names.join('');
  return names.slice(0, -1).join(', ') + ' ' + (word || 'and') + ' ' + names[names.length - 1];
}

/* The Miles statement, when it has rows inside the window. */
function statementIn(ms, m) {
  if (!ms || !ms.months) return null;
  return ms.months.some(ym => ym >= m.from && ym <= m.to) ? ms : null;
}

/* Shops seen: [{ name, rand }] with spend, in the order given. */
function shopsSeen(m, shops) {
  return shops.map(([key, name]) => ({ name, rand: spent(m, key) })).filter(s => s.rand >= 0.5);
}

/* m: measured window (measure.js); milesSummary: summariseMiles() or null;
   settings: plugin settings.
   → { [id]: { suggested: 'full'|'half'|'none', why: 'plain sentence' } } */
function suggestBenefits(m, milesSummary, settings) {
  const s = settings || {};
  const when = inWindow(m);
  const ms = statementIn(milesSummary, m);
  const stmtMiles = key => (ms && ms.figures && ms.figures[key]) || 0;
  const out = {};
  const put = (id, suggested, why) => { out[id] = { suggested, why }; };

  // Miles on every card payment
  const card = Math.max(0, total(m, 'spend.card'));
  put('miles', 'full', card >= 0.5
    ? `You paid ${money(card)} by Discovery Bank card ${when}. Miles are earned on every card payment.`
    : 'Miles are earned on every Discovery Bank card payment, without you doing anything.');

  // HealthyFood and HealthyCare: shopping at the partner shops
  const shops = (id, list, kind, stmtKeys, noneText) => {
    const seen = shopsSeen(m, list);
    const rand = seen.reduce((t, x) => t + x.rand, 0);
    const fromStmt = stmtKeys.reduce((t, k) => t + Math.max(0, stmtMiles(k)), 0);
    if (rand >= 0.5) put(id, 'full', `You spent ${money(rand)} at ${joinNames(seen.map(x => x.name))} ${when}.`);
    else if (fromStmt >= 0.5) put(id, 'full', `Your Miles statement shows ${fmtMiles(fromStmt)} of ${kind} rewards ${when}, worth ${money(fromStmt * FACE_VALUE)}.`);
    else put(id, 'none', noneText);
  };
  shops('healthyFood', [['shop.checkers', 'Checkers'], ['shop.woolworths', 'Woolworths'], ['shop.pnp', 'Pick n Pay']], 'HealthyFood',
    ['money.healthyFood', 'health.healthyFood'], `We found no shopping at Checkers, Woolworths or Pick n Pay ${when}.`);
  shops('healthyCare', [['shop.clicks', 'Clicks'], ['shop.dischem', 'Dis-Chem']], 'HealthyCare',
    ['money.healthyCare', 'health.healthyCare'], `We found no shopping at Clicks or Dis-Chem ${when}.`);

  // Fuel: only bp and Shell earn; other brands earn nothing
  const fuelSeen = shopsSeen(m, [['fuel.bp', 'bp'], ['fuel.shell', 'Shell']]);
  const fuelRand = fuelSeen.reduce((t, x) => t + x.rand, 0);
  const otherFuel = spent(m, 'fuel.other');
  const driveCash = Math.max(0, total(m, 'insure.driveCash'));
  const otherText = otherFuel >= 0.5 ? ` You also spent ${money(otherFuel)} at other fuel brands, which earn nothing.` : '';
  if (fuelRand >= 0.5) put('fuel', 'full', `You spent ${money(fuelRand)} on fuel at ${joinNames(fuelSeen.map(x => x.name))} ${when}.${otherText}`);
  else if (driveCash >= 0.5) put('fuel', 'full', `Vitality Drive paid you ${money(driveCash)} in fuel rewards ${when}.`);
  else if (stmtMiles('money.fuel') >= 0.5) put('fuel', 'full', `Your Miles statement shows ${fmtMiles(stmtMiles('money.fuel'))} of fuel rewards ${when}, worth ${money(stmtMiles('money.fuel') * FACE_VALUE)}.`);
  else if (otherFuel >= 0.5) put('fuel', 'none', `You spent ${money(otherFuel)} on fuel ${when}, all at other brands, which earn nothing. Only bp and Shell count.`);
  else put('fuel', 'none', `We found no fuel bought at bp or Shell ${when}.`);

  // Flights through Vitality Travel
  const travel = spent(m, 'travel.vitality');
  const tr = s.travel || {};
  if (travel >= 0.5) put('flights', 'full', `You paid ${money(travel)} to Vitality Travel ${when}.`);
  else if (num(tr.discount) && Number(tr.discount) > 0) put('flights', 'full', `Your Vitality Travel receipts show ${money(Number(tr.discount))} off your flights.`);
  else put('flights', 'none', `We found no Vitality Travel bookings ${when}, so the flight discount is worth nothing to you yet.`);

  // Gym
  const gym = spent(m, 'gym');
  if (gym >= 0.5) put('gym', 'full', `You paid ${money(gym)} to Virgin Active or Planet Fitness ${when}.`);
  else put('gym', 'none', `We found no payments to Virgin Active or Planet Fitness ${when}, so the gym discount is worth nothing to you yet.`);

  // Apple Watch
  const watch = m.figures && m.figures['benefit.appleWatch'];
  const watchTyped = s.rates && num(s.rates.appleWatchMonthly) && Number(s.rates.appleWatchMonthly) > 0;
  if (watch) put('appleWatch', 'full', `You paid ${money(Math.max(0, watch.total))} in Apple Watch payments ${when}.`);
  else if (watchTyped) put('appleWatch', 'full', `You typed the watch's full monthly payment of ${money(Number(s.rates.appleWatchMonthly))}.`);
  else put('appleWatch', 'none', `We found no Apple Watch payments ${when}.`);

  // Extra interest and cashback
  const interest = Math.max(0, total(m, 'interest.boost')) + Math.max(0, total(m, 'interest.cashback'));
  if (interest >= 0.5) put('interest', 'full', `Discovery Bank paid you ${money(interest)} of extra interest and cashback ${when}.`);
  else put('interest', 'none', `We found no extra interest or cashback from Discovery Bank ${when}.`);

  // Miles spent at better than face value (Miles+ partners, discount days)
  if (!ms) put('milesPlus', 'none', 'There is no Miles statement to show what your Miles bought, so each Mile counts at its face value.');
  else if (!(ms.spentMiles > 0)) put('milesPlus', 'none', `Your Miles statement shows no Miles spent ${when}.`);
  else {
    const face = ms.spentMiles * FACE_VALUE;
    const extra = Math.max(0, (ms.spentRand || 0) - face);
    if (extra >= 0.5) put('milesPlus', 'full', `Your Miles bought ${money(ms.spentRand)} of goods ${when}, ${money(extra)} more than their face value.`);
    else put('milesPlus', 'none', `Your Miles bought ${money(Math.max(0, ms.spentRand || 0))} of goods ${when}, no more than their face value.`);
  }

  // The gameboard: only the Miles statement shows it
  const board = Math.max(0, stmtMiles('gameboard'));
  if (!ms) put('gameboard', 'half', 'There is no Miles statement to show whether you play the gameboard, so it counts at half.');
  else if (board >= 0.5) put('gameboard', 'full', `Your Miles statement shows ${fmtMiles(board)} from the gameboard ${when}, worth ${money(board * FACE_VALUE)}.`);
  else put('gameboard', 'none', `Your Miles statement shows no gameboard rewards ${when}.`);

  return out;
}

/* The level that counts: the person's own choice beats the suggestion. */
function levelOf(settings, id, suggestion) {
  const set = settings && settings.benefits && settings.benefits[id];
  if (isLevel(set)) return set;
  const sug = typeof suggestion === 'string' ? suggestion : suggestion && suggestion.suggested;
  return isLevel(sug) ? sug : 'full';
}

module.exports = { BENEFITS, GROUPS, WEIGHT, LINE_NEEDS, benefitsFor, availableFor, offerText, bankKindOf, suggestBenefits, levelOf, anyKey };
