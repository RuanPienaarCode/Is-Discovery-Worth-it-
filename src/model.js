'use strict';
/* Is Discovery Bank worth it: what it costs, what you would LOSE by leaving
   it, and how that compares with another bank.

   The question is "stay or switch bank", so the statement only counts value
   that depends on banking with Discovery. What you keep anyway is listed,
   never counted:
     - Vitality Health benefits (gym, the HealthyFood Vitality Health pays)
     - Vitality Drive fuel rewards, which need A Discovery account — the
       free transactional one counts — not the Black Suite

   Every line says where its number came from:
     measured  — summed from your transactions
     statement — read from your Discovery Miles statement (CSV), which
                 names Vitality Money or Vitality Health as the payer
     entered   — typed in from the Discovery app or a receipt
     estimated — your spend × a published rate (rates.js), which you can edit

   Rewards are worked out month by month, because Vitality Money's
   percentages follow each month's card spend and every cap is monthly.
   All amounts returned are annual: total × 12 over the months that hold
   data for the figure's own source — the Discovery accounts' months for the
   bank's lines, the paying account's months for spend at partners on any
   card and for premiums (measure.js sourceMonths). */

const { total, monthsBetween, sourceMonths } = require('./measure');
const compare = require('./compare');
const { healthPremium, HEALTH_PLANS, HEALTH_OWN } = compare;
const { rate, ALTERNATIVES, FACE_VALUE, suiteOf, bankProductOf, chooseAlternative } = require('./rates');
const { monthLabel, dayLabel } = require('./format');
const { BENEFITS, WEIGHT, suggestBenefits, levelOf, availableFor, anyKey } = require('./benefits');
const { premiumBasis, premiumYear } = require('./products');
const { priceValidFor, PERIODS } = require('./market');

/* detect.js's resolveVitality when it is there (it reads the products
   list, which pulls in compare.js), else the same rule written here. */
let detect = null;
try { detect = require('./detect'); } catch (e) { detect = null; }

/* Which products and Vitality programmes this person has, for what the
   statement may count (benefits.js availableFor). opts.products and
   opts.vitality, when given, are the resolved maps and win. Otherwise a
   true or false in settings wins, and an unanswered product counts as had
   (the old behaviour). An unanswered Vitality Money is read from the
   budget: a Vitality Money premium, the extra interest it pays, or the
   bank's Miles on the Miles statement. Vitality Health follows Discovery
   Health and Vitality Drive follows Insure. */
function setupOf(m, settings, ms, opts) {
  const o = opts || {};
  const set = (settings && settings.products) || {};
  const products = Object.assign({}, o.products || {});
  for (const k of ['bank', 'health', 'gap', 'insure', 'life']) {
    if (typeof products[k] !== 'boolean') products[k] = set[k] !== false;
  }
  const stmt = (ms && ms.figures) || {};
  const moneySeen = total(m, 'fee.vitalityMoney') > 0 || total(m, 'interest.boost') > 0 || total(m, 'interest.cashback') > 0
    || ['base', 'gameboard', 'money.healthyFood', 'money.healthyCare', 'money.fuel', 'money.partners'].some(k => stmt[k] > 0);
  let vitality = o.vitality || null;
  if (!vitality && detect && typeof detect.resolveVitality === 'function') {
    try {
      const found = k => ({ found: products[k] });
      vitality = detect.resolveVitality(settings, { bank: found('bank'), health: found('health'), gap: found('gap'), insure: found('insure'), life: found('life') }, { vitalityMoney: moneySeen });
    } catch (e) { vitality = null; }
  }
  const v = vitality || {};
  const sv = (settings && settings.vitality) || {};
  const pick = (k, dflt) => (typeof v[k] === 'boolean' ? v[k] : typeof sv[k] === 'boolean' ? sv[k] : dflt);
  /* A Vitality Money fee, the extra interest only Vitality Money pays, or
     the bank's Miles on the statement PROVE Vitality Money: unless you said
     you do not have it, that beats a detection that missed the fee's
     wording. */
  const money = sv.money === false ? false : moneySeen ? true : pick('money', false);
  return { products, vitality: { money, health: pick('health', products.health), drive: pick('drive', products.insure) }, moneyProven: moneySeen };
}

/* settings.milesUse → the rate holding its discount, and how to say it.
   Both rates are PER ACTIVE VITALITY PROGRAMME (Money, Health, Drive): 5% at
   Discovery Miles partners, doubled on Ð-Day (the 15th). Prepaid airtime,
   data and electricity in the app get the everyday discount, not Ð-Day's
   (Discovery Miles benefit guide, 26 Oct 2026). */
const MILES_USE_PCT = { dday: 'milesDdayPct', partners: 'milesPartnerPct', utilities: 'milesPartnerPct' };
const MILES_USE_WORDS = { dday: 'on Ð-Day (the 15th of each month) at Discovery Miles partners', partners: 'at Discovery Miles partners', utilities: 'on prepaid electricity, data or airtime in the Discovery Bank app', none: '' };
const COUNT_WORDS = ['no', 'one', 'two', 'three'];

/* Active Vitality programmes for the Miles discount. Spending Miles at the
   partners, on prepaid in the app and on Ð-Day is for Discovery Bank
   clients with Vitality Money, so without it there is no discount at all. */
function milesProgrammes(vitality) {
  const v = vitality || {};
  if (v.money !== true) return 0;
  return Math.min(3, ['money', 'health', 'drive'].filter(k => v[k] === true).length);
}
const sumKeys = (m, keys) => keys.reduce((s, k) => s + total(m, k), 0);
const inMonth = (m, key, ym) => (m.figures[key] && m.figures[key].perMonth[ym]) || 0;
const num = v => v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v));

/* Per-month spend over several keys, capped month by month: a cap is
   monthly, so a big December must not borrow a quiet February's headroom. */
function cappedMonthly(m, keys, share, cap) {
  let out = 0;
  for (const ym of m.months) {
    let spend = 0;
    for (const k of keys) spend += inMonth(m, k, ym);
    const qualifying = Math.max(0, spend) * share;
    out += cap > 0 ? Math.min(qualifying, cap) : qualifying;
  }
  return out;
}

/* Base Miles for one month's card spend. */
function monthMiles(spend, r) {
  const v = Math.min(100, Math.max(0, r('virtualSharePct'))) / 100;
  const thr = r('milesThreshold');
  const virt = Math.max(0, spend) * v, phys = Math.max(0, spend) * (1 - v);
  const per = (amount, randPerMile) => (randPerMile > 0 ? amount / randPerMile : 0);
  return per(Math.min(virt, thr), r('milesRandPerMile')) + per(Math.max(0, virt - thr), r('milesAboveThreshold')) + per(Math.min(phys, thr), r('milesPhysical'));
}

/* Apple Watch: each month you pay a share of the full instalment set by the
   weekly goals you met — 0–1 goals 100%, 2 goals 75%, 3 goals 50%, 4 goals
   nothing (Vitality's Apple Watch letter). The full instalment is the one
   amount every charge is a step of; null when no charge pins it down (or
   the retail price changed between charges — then type it). */
function watchInstalment(charges) {
  const steps = [1, 0.75, 0.5];
  const cs = charges.filter(c => c > 0.5);
  if (!cs.length) return null;
  for (const s0 of steps) {
    const base = cs[0] / s0;
    if (cs.every(c => steps.some(s => Math.abs(base * s - c) < 0.06))) {
      /* prefer the smallest base that explains every charge, unless one charge is the full amount */
      const smaller = steps.map(s => cs[0] / s).filter(b => b < base - 0.05 && cs.every(c => steps.some(s => Math.abs(b * s - c) < 0.06)));
      return smaller.length ? Math.min(...smaller) : base;
    }
  }
  return null;
}

/* The partner with more spend over the window is taken as the primary one. */
function primaryOf(m, a, b) {
  return total(m, a) >= total(m, b) ? [a, b] : [b, a];
}

/* The Miles statement over the window: the months it actually has rows in
   (a gap or a two-week download is not a full year), and its figures. */
function statementView(ms, m) {
  if (!ms || !ms.months) return null;
  const months = ms.months.filter(ym => ym >= m.from && ym <= m.to);
  if (!months.length) return null;
  return { covered: months.length, months, from: months[0], to: months[months.length - 1], miles: key => ms.figures[key] || 0, ms };
}

function buildStatement(m, settings, milesSummary, opts) {
  const st = settings.status || {};
  const R = (key, spend) => rate(settings, key, st, { spend });
  const r = key => R(key, 0);
  /* Annualise over the months that hold Discovery transactions, so a short
     import is scaled up rather than read as months of nothing (another
     bank's fees are always twelve months). */
  const dataMonths = m.dataMonths && m.dataMonths.length ? m.dataMonths : m.months;
  const n = dataMonths.length || 1;
  const yr = v => (v * 12) / n;
  /* A sum built from `keys` a year, over the months those keys' accounts
     hold data (spend at partners on another bank's card, a premium paid
     from another bank). */
  const yrOf = (keys, v, except) => (v * 12) / (sourceMonths(m, keys, n, except) || 1);
  /* Typed Miles totals are for one window: once the window moves on they
     would count against months they were never about. Totals typed before
     the window was stamped on them carry no period and are still used. */
  const windowId = `${m.from}..${m.to}`;
  /* A typed total is for the whole window, so it is made a year over the
     window's months, as receipts are, never over the months that happen to
     hold Discovery transactions. */
  const windowMonths = (m.months && m.months.length) || 1;
  const yrW = v => (v * 12) / windowMonths;
  const typedMiles = settings.actualMiles || {};
  const actualStale = typedMiles.period && typedMiles.period !== windowId ? typedMiles.period : null;
  const actual = actualStale ? {} : typedMiles;
  const sv = statementView(milesSummary, m);
  /* What a Mile was worth when you spent it (Miles+ discounts and Ð-Day
     included), unless you set a value yourself. Those discounts need the
     bank, so without it a Mile is worth its face value. */
  const overridden = settings.rates && num(settings.rates.mileValue);
  const spentValue = sv && sv.ms.spentMiles > 0 ? sv.ms.spentRand / sv.ms.spentMiles : null;
  /* The products and Vitality programmes this person has (what the
     statement may count, and how many programmes the Miles discount
     counts). */
  const setup = setupOf(m, settings, milesSummary, opts);
  /* Without a statement, how you said you spend them: Discovery Miles
     partners and prepaid in the app take the everyday discount off the
     price, Ð-Day (the 15th) double that, so a Mile buys more. Each is a
     rate per active Vitality programme. */
  const programmes = milesProgrammes(setup.vitality);
  const usePct = MILES_USE_PCT[settings.milesUse] ? Math.min(90, Math.max(0, r(MILES_USE_PCT[settings.milesUse])) * programmes) : 0;
  const useValue = usePct > 0 ? r('mileValue') / (1 - usePct / 100) : null;
  const mileSource = overridden ? 'entered' : spentValue ? 'statement' : useValue ? 'use' : 'face';
  const mileValue = mileSource === 'statement' ? spentValue : mileSource === 'use' ? useValue : r('mileValue');
  const atValue = (key, value) => (sv ? (sv.miles(key) * value * 12) / sv.covered : null);
  const fromStmt = key => atValue(key, mileValue);
  const lines = [];
  const line = (group, key, label, annual, source, detail, rateKeys, extra) =>
    lines.push(Object.assign({ group, key, label, annual, source, detail, rateKeys: rateKeys || [] }, extra || {}));

  /* Card spend: what the bank counted on your Miles statement when there is
     one (it leaves out EFTs and debit orders paid from the card account),
     else the card purchases in your transactions. With only a transaction
     account (or no Discovery credit card in the budget) its debit card is
     the card, read from spend.debit, debit orders included. */
  const swipes = sv && sv.ms.swipes && Object.keys(sv.ms.swipes).length ? sv.ms.swipes : null;
  const debitOnly = m.figures['spend.debit'] && (settings.bankKind === 'transaction' || !(m.cardAccounts && m.cardAccounts.length));
  const spendKey = debitOnly ? 'spend.debit' : 'spend.card';
  const cardIn = ym => Math.max(0, swipes ? swipes[ym] || 0 : inMonth(m, spendKey, ym));
  const spendMonths = swipes ? sv.months : dataMonths;
  const cardSpendTotal = spendMonths.reduce((s, ym) => s + cardIn(ym), 0);
  const cardSpendYear = (cardSpendTotal * 12) / (spendMonths.length || 1);
  const avgSpend = cardSpendYear / 12;

  // ── What Discovery Bank costs ────────────────────────────────────────
  /* The published fees of THIS person's product (rates.js BANK_PRODUCTS),
     for the detail texts; the figures counted are always the statements'. */
  const prod = bankProductOf(settings);
  const onProd = (fee, what) => (fee > 0 ? ` The ${prod.label}'s published ${what} is ${fmtR(fee)} a month.` : '');
  const status = st.money || 'Blue';
  /* the most a band rate pays at your status (the top spend band) */
  const topPct = key => R(key, 1e9);
  const upTo = key => (topPct(key) > 0 ? ` (up to ${fmtPct(topPct(key))} with your bank score at ${status})` : '');
  line('cost', 'fee.account', 'Monthly account fee', yr(total(m, 'fee.account')), 'measured', 'The account\'s monthly fee on your Discovery statements.' + onProd(prod.accountFee, 'account fee'));
  line('cost', 'fee.facility', 'Credit card fee', yr(total(m, 'fee.facility')), 'measured', 'The credit card\'s own monthly fee.' + onProd(prod.creditFee, 'credit card fee'));
  line('cost', 'fee.vitalityMoney', 'Vitality Money fee', yr(total(m, 'fee.vitalityMoney')), 'measured', 'Vitality Money is the part of Discovery Bank that gives you the extra Miles and discounts below. You only get it with Discovery Bank.' + onProd(prod.vitalityMoneyFee, 'Vitality Money fee'));
  line('cost', 'fee.other', 'Other bank charges', yr(total(m, 'fee.other')), 'measured', 'Anything else marked as a bank charge on a Discovery account.' + (prod.annualFee > 0 ? ` The ${prod.label} also charges a ${fmtR(prod.annualFee)} annual card fee, refunded only with ${prod.annualFeeWaiver}; it is counted here when your statements show it.` : ''));

  // ── What you would lose by leaving ───────────────────────────────────
  let miles = 0, hfMoney = 0, hfHealth = 0, hcMoney = 0, hcHealth = 0, fuelDrive = 0, fuelMoney = 0, fuelCounted = 0;
  /* the Drive fuel estimate month by month, for months with no INSURECASH */
  const driveEst = {};
  /* Vitality Drive's fuel back needs a Discovery Bank card, credit or the
     transaction account's debit card (disc.*, measure.js); Vitality Money's
     extra is on the credit card only (fuel.*). */
  const discKey = key => (m.figures && m.figures['disc.' + key] ? 'disc.' + key : key);
  const driveFuelKeys = [discKey('fuel.bp'), discKey('fuel.shell')];
  /* The bank's extras need the Discovery card, so they read the card's
     shop figures. Vitality Health pays whichever card paid, so its share
     reads spend on any account (all.<key>, measure.js) when it was measured. */
  const [foodPrimary, foodSecondary] = primaryOf(m, 'shop.checkers', 'shop.woolworths');
  const [carePrimary] = primaryOf(m, 'shop.clicks', 'shop.dischem');
  const [foodPrimaryAny, foodSecondaryAny] = primaryOf(m, anyKey(m, 'shop.checkers'), anyKey(m, 'shop.woolworths'));
  const [carePrimaryAny] = primaryOf(m, anyKey(m, 'shop.clicks'), anyKey(m, 'shop.dischem'));
  const minSpend = r('healthyMinSpend');
  const over = q => (q >= minSpend ? q : 0);
  for (const ym of m.months) {
    const spend = cardIn(ym);
    miles += monthMiles(spend, r);

    const food = key => over(Math.max(0, inMonth(m, key, ym)) * r('healthyFoodShare') / 100);
    const q1 = food(foodPrimary);
    const a1 = food(foodPrimaryAny), a2 = food(foodSecondaryAny);
    const hCap = r('healthyFoodHealthCap');
    const h1 = Math.min(a1, hCap);
    hfHealth += h1 * r('healthyFoodHealthPct') / 100 + Math.min(a2, Math.max(0, hCap - h1)) * r('healthyFoodSecondaryPct') / 100;
    hfMoney += Math.min(q1, r('healthyFoodMoneyCap')) * R('healthyFoodMoneyPct', spend) / 100;

    const care = key => over(Math.max(0, inMonth(m, key, ym)) * r('healthyCareShare') / 100);
    hcHealth += Math.min(care(carePrimaryAny), r('healthyCareCap')) * r('healthyCareHealthPct') / 100;
    hcMoney += Math.min(care(carePrimary), r('healthyCareMoneyCap')) * R('healthyCareMoneyPct', spend) / 100;

    const fuelCap = r('fuelCap') * Math.max(1, r('fuelDrivers'));
    const fuelD = Math.min(Math.max(0, inMonth(m, driveFuelKeys[0], ym) + inMonth(m, driveFuelKeys[1], ym)), fuelCap);
    const fuelM = Math.min(Math.max(0, inMonth(m, 'fuel.bp', ym) + inMonth(m, 'fuel.shell', ym)), fuelCap);
    fuelCounted += fuelD;
    fuelDrive += fuelD * r('fuelDrivePct') / 100;
    driveEst[ym] = fuelD * r('fuelDrivePct') / 100;
    fuelMoney += fuelM * R('fuelMoneyPct', spend) / 100;
  }

  const milesLine = num(actual.card)
    ? { annual: yrW(Number(actual.card) * mileValue), source: 'entered' }
    : sv ? { annual: fromStmt('base'), source: 'statement' }
      : { annual: yr(miles * mileValue), source: 'estimated' };
  line('bank', 'miles.card', 'Miles for using your card', milesLine.annual, milesLine.source,
    `You spend about ${fmtR(cardSpendYear)} a year on the card${swipes ? ' (as counted on your Miles statement)' : ''}. ${milesRateText(r)} Each Mile is worth ${fmtCents(mileValue)}${spentValue && !overridden ? ', which is what yours were worth when you spent them' : ''}.`,
    ['virtualSharePct', 'milesRandPerMile', 'milesThreshold', 'milesAboveThreshold', 'milesPhysical'], { miles: true });

  /* HealthyFood / HealthyCare: the statement names the payer; a typed total
     is split in the estimated proportion. Vitality Health's part is valued
     at face — the Miles+ uplift on it is counted separately, as the bank's. */
  /* Annual values. The bank's estimate is over the Discovery months; the
     Vitality Health estimate over the months the paying accounts hold data
     (healthKeys); a statement or typed total is for the window. */
  const split = (key, moneyEst, healthEst, healthKeys) => {
    if (!num(actual[key]) && sv) {
      return { bank: fromStmt('money.' + key), stays: atValue('health.' + key, FACE_VALUE), source: 'statement', miles: true };
    }
    if (!num(actual[key])) return { bank: yr(moneyEst), stays: yrOf(healthKeys, healthEst), source: 'estimated', miles: false };
    const tot = Number(actual[key]);
    const f = moneyEst + healthEst > 0 ? moneyEst / (moneyEst + healthEst) : 0.5;
    return { bank: yrW(tot * f * mileValue), stays: yrW(tot * (1 - f) * FACE_VALUE), source: 'entered', miles: true };
  };
  const hf = split('healthyFood', hfMoney, hfHealth, [foodPrimaryAny, foodSecondaryAny]);
  const partner = k => (k === 'shop.checkers' ? 'Checkers' : 'Woolworths');
  line('bank', 'miles.healthyFood', 'Extra HealthyFood Miles from the bank', hf.bank, hf.source,
    `We take ${r('healthyFoodShare')}% of what you spend at ${partner(foodPrimary)} as HealthyFood (it is your main HealthyFood shop, and the bank's extra only applies there). On up to ${fmtR(r('healthyFoodMoneyCap'))} of HealthyFood a month the bank adds a percentage that grows with that month's card spend${upTo('healthyFoodMoneyPct')}. A month with less than ${fmtR(minSpend)} of HealthyFood gets nothing.`,
    ['healthyFoodShare', 'healthyFoodMoneyPct', 'healthyFoodMoneyCap', 'healthyMinSpend'], { miles: hf.miles });

  const hc = split('healthyCare', hcMoney, hcHealth, [carePrimaryAny]);
  line('bank', 'miles.healthyCare', 'Extra HealthyCare Miles from the bank', hc.bank, hc.source,
    `We take ${r('healthyCareShare')}% of what you spend at ${carePrimary === 'shop.clicks' ? 'Clicks' : 'Dis-Chem'} as HealthyCare. On up to ${fmtR(r('healthyCareMoneyCap'))} of it a month the bank adds a percentage that grows with that month's card spend${upTo('healthyCareMoneyPct')}. A month with less than ${fmtR(minSpend)} of HealthyCare gets nothing.`,
    ['healthyCareShare', 'healthyCareMoneyPct', 'healthyCareMoneyCap', 'healthyMinSpend'], { miles: hc.miles });

  const fm = num(actual.fuel) ? { annual: yrW(Number(actual.fuel) * mileValue), source: 'entered' }
    : sv ? { annual: fromStmt('money.fuel'), source: 'statement' }
      : { annual: yr(fuelMoney), source: 'estimated' };
  line('bank', 'fuel.money', 'Extra fuel Miles from the bank', fm.annual, fm.source,
    `A percentage of what you spend at bp and Shell, paid in Miles. The percentage grows with that month's card spend${upTo('fuelMoneyPct')}. It needs Vitality Money, so you lose it if you leave the bank.`,
    ['fuelMoneyPct'], { miles: fm.source !== 'estimated' });

  /* Discovery Insure's Miles (Vitality Drive) are Drive's: they are the
     fuel.drive line below, never partner Miles too. */
  let basic = 0, board = 0;
  if (sv) {
    line('bank', 'miles.partners', 'Miles from partner shops', fromStmt('money.partners'), 'statement',
      'Extra Miles at Discovery\'s partner shops (Superbalist, Exclusive Books, parking and others).', [], { miles: true });
    /* The basic exercise rewards Vitality Health would pay without the bank
       are your guess, but never more than the gameboard actually paid: the
       two are the same Miles, split between bank and Vitality Health. */
    const guess = r('activeRewardsWithoutBank') * 12;
    board = Math.max(0, fromStmt('gameboard'));
    basic = Math.min(guess, board);
    line('bank', 'gameboard', 'Gameboard rewards', board - basic, 'statement',
      `${fmtR(board)} a year of Miles from the gameboard in the Discovery Bank app. The gameboard needs the bank. Without it, Vitality Health still gives you basic rewards for your weekly exercise goals, which you guessed at ${fmtR(guess)} a year${basic < guess ? `. The gameboard paid less than that, so all of it counts as those basic rewards` : ', so only the rest is counted here'}.`,
      ['activeRewardsWithoutBank'], { miles: true });
  }
  /* The Apple Watch needs a Discovery Bank Suite with a credit card: its
     value is the instalments you did not pay. */
  /* The once-off activation fee is not an instalment: it is left out of the
     charges and of what you paid, and counted on its own, spread over the
     two-year contract. */
  const { charges, activationPaid } = watchCharges(m, r('appleWatchActivation'));
  const watchSet = settings.rates && num(settings.rates.appleWatchMonthly);
  const inferred = watchInstalment(charges);
  const watchMonthly = watchSet ? Number(settings.rates.appleWatchMonthly) : inferred;
  if (watchMonthly) {
    const paid = yr(total(m, 'benefit.appleWatch') - activationPaid);
    const activation = r('appleWatchActivation') / 2;
    line('bank', 'appleWatch', 'Apple Watch', watchMonthly * 12 - paid - activation, watchSet ? 'entered' : 'measured',
      `The watch costs ${fmtR(watchMonthly)} a month in full, ${fmtR(watchMonthly * 24)} over its 24-month contract${!watchSet ? ` (worked out from what you were charged in months you missed goals: ${charges.map(c => fmtR(c)).join(', ')}; three goals met costs half, two goals three quarters)` : ''}. You pay less, or nothing, in months you meet your weekly exercise goals. This is that saving, less the ${fmtR(paid)} a year you did pay and the ${fmtR(r('appleWatchActivation'))} activation fee spread over two years. It needs the all-in-one Discovery Bank package (account and credit card); a new watch means a new 24-month contract.`,
      ['appleWatchMonthly', 'appleWatchActivation']);
  }
  line('bank', 'interest.boost', 'Extra interest on your savings', yr(total(m, 'interest.boost')), 'measured', `The extra interest Discovery Bank adds to your accounts for your bank score (Vitality Money status, Blue to Diamond).${(() => { const b = r(prod.kind === 'card' ? 'ccSavingsBoostPct' : 'savingsBoostPct'); return b > 0 ? ` With your bank score at ${status}, that is ${fmtPct(b)} more on savings.` : ''; })()}`);
  line('bank', 'interest.cashback', 'Cashback on money left in the card', yr(total(m, 'interest.cashback')), 'measured', 'Interest paid on money you keep in the credit card account.');

  /* Receipts count only for the window they were typed for. */
  const tr = settings.travel || {};
  const receipts = num(tr.discount) && num(tr.baseFare) && Number(tr.baseFare) > 0;
  const receiptsFit = receipts && (!tr.period || tr.period === windowId);
  /* Without Vitality Health its part of the flight discount is not there,
     and the bank gives at least 10% off local flights instead (a flat 10% on
     a pay-as-you-transact or Ðiscovery Account): rewards guide of each
     collection, effective 1 Nov 2026. */
  const noHealth = setup.vitality.health === false;
  /* healthPct stays what Vitality Health would give (travel.health keeps
     its full value for the Benefits page); heldPct is what the fares paid
     actually had off */
  const healthPct = r('travelHealthPct');
  const heldPct = noHealth ? 0 : healthPct;
  const FLIGHT_FLOOR = 10;
  let travelBank, travelStays, travelSource, travelDetail;
  if (receipts && !receiptsFit) {
    /* Receipts from another window still say what YOUR bookings got off
       the base fare, which beats the published bands: apply their rates to
       this window's Vitality Travel payments. */
    const fare = Number(tr.baseFare), disc = Math.min(Number(tr.discount), fare);
    const healthOnly = Math.min(disc, fare * heldPct / 100);
    const paid = Math.max(0, total(m, 'travel.vitality'));
    const fares = disc < fare ? paid / (1 - disc / fare) : 0;
    travelBank = yr(fares * (disc - healthOnly) / fare);
    travelStays = yr(fares * healthOnly / fare);
    travelSource = 'estimated';
    travelDetail = `You paid ${fmtR(yr(paid))} a year on Vitality Travel. Your receipts for ${tr.period.split('..').map(monthLabel).join(' – ')} showed ${fmtPct(Math.round(disc / fare * 1000) / 10)} off the full fare, ${fmtPct(Math.round((disc - healthOnly) / fare * 1000) / 10)} of it from the bank, so the same is used here. Type this period's receipts on the Inputs tab for the real figure.`;
  } else if (receiptsFit) {
    const healthOnly = Math.min(Number(tr.discount), Number(tr.baseFare) * heldPct / 100);
    /* Receipt totals cover the window as a whole: scale to a year by the
       window's length, not by months of data. */
    const scale = 12 / windowMonths;
    travelBank = Math.max(0, Number(tr.discount) - healthOnly) * scale;
    travelStays = healthOnly * scale;
    travelSource = 'entered';
    travelDetail = `From your receipts: ${fmtR(Number(tr.discount))} off ${fmtR(Number(tr.baseFare))} of flights. Without Discovery Bank you would only get Vitality Health's ${healthPct}% off (${fmtR(healthOnly)}); the rest came from the bank. This is one year's flights, and next year may differ.`;
  } else {
    const paid = Math.max(0, total(m, 'travel.vitality'));
    const money = noHealth ? Math.max(FLIGHT_FLOOR, R('travelMoneyPct', avgSpend)) : R('travelMoneyPct', avgSpend);
    const d = Math.min(75, heldPct + money) / 100;
    const base = d < 1 ? paid / (1 - d) : 0;
    travelBank = yr(base * money / 100);
    travelStays = yr(base * healthPct / 100);
    travelSource = 'estimated';
    const bookings = (m.figures['travel.vitality'] || {}).count || 0;
    /* one or two bookings say little about next year, however long the
       window: one family holiday is not a yearly habit (round 2) */
    const few = paid > 0 && bookings > 0 && bookings <= 2
      ? ` That comes from ${bookings === 1 ? 'one booking' : 'two bookings'} in ${n === 1 ? 'one month' : `${n} months`} of statements${n < 12 ? ' made into a year' : ''}, so it is a rough guess.`
      : '';
    travelDetail = `You paid ${fmtR(yr(paid))} a year on Vitality Travel.${few} ${noHealth ? `Without Vitality Health, the bank gives ${money}% off (never less than ${FLIGHT_FLOOR}%) with ${fmtR(avgSpend)} a month of card spend.` : `With ${fmtR(avgSpend)} a month of card spend, the bank adds ${money}% off on top of Vitality Health's ${healthPct}%.`} That only applies to local flights you book for yourself, up to three return flights a year; flights for others get Vitality Health's part only. Type your receipts on the Inputs tab for the real figure.`;
  }
  /* Bookings paid with another bank's card get Vitality Health's part only
     (all.travel.vitality less what the Discovery card paid). */
  if (!receiptsFit) {
    const allTravel = anyKey(m, 'travel.vitality');
    const elsewhere = Math.max(0, total(m, allTravel) - Math.max(0, total(m, 'travel.vitality')));
    const hp = receipts ? Math.min(Number(tr.discount), Number(tr.baseFare) * healthPct / 100) / Number(tr.baseFare) : healthPct / 100;
    if (elsewhere > 0 && hp < 1) travelStays += yrOf([allTravel], elsewhere / (1 - hp) * hp, m.cardAccounts);
  }
  line('bank', 'travel.bank', 'Flight discount from the bank', travelBank, travelSource, travelDetail, ['travelHealthPct', 'travelMoneyPct'], { travel: true });

  // ── Kept whichever bank you use (listed, not counted) ────────────────
  /* Drive cash shows on statements as INSURECASH; paid into the Insure
     Funder Account it is doubled and never reaches a bank account. */
  const funder = r('driveFunderAccount') >= 1;
  const driveCash = total(m, 'insure.driveCash');
  const seen = m.lastSeen && m.lastSeen['insure.driveCash'];
  /* Drive rewards paid as Miles (from 1 Nov 2026) are on the Miles
     statement as Discovery Insure's; any INSURECASH paid before then is
     added, each made a year over the months its own source covers. */
  const driveMiles = sv ? atValue('insure', mileValue) : 0;
  const driveCashYear = driveCash > 0 && !funder ? yrOf(['insure.driveCash'], driveCash) : 0;
  /* Paid into the Insure Funder Account, the fuel rewards never reach the
     Miles statement: estimate them (doubled), and the statement's Insure
     Miles are Drive's other rewards (PerfectDrive and the like), added. */
  /* Paid into the Funder Account, but INSURECASH still arrived in some
     months (the switch took effect part-way): those months are the cash
     that really arrived; only the months without it are estimated. */
  const cashMonths = m.months.filter(ym => inMonth(m, 'insure.driveCash', ym) > 0.5);
  let funderMix = null;
  if (funder && cashMonths.length) {
    let cashSum = 0, est = 0;
    for (const ym of m.months) {
      const c = inMonth(m, 'insure.driveCash', ym);
      if (c > 0.5) cashSum += c; else est += (driveEst[ym] || 0) * 2;
    }
    const over = sourceMonths(m, driveFuelKeys.concat(['insure.driveCash']), n) || 1;
    funderMix = { annual: ((cashSum + est) * 12) / over + driveMiles, source: est > 0.5 ? 'estimated' : 'measured', cash: (cashSum * 12) / over, cashMonths: cashMonths.length };
  }
  const fd = num(actual.fuelDriveCash) ? { annual: yrW(Number(actual.fuelDriveCash)), source: 'entered', cash: funder ? 0 : yrW(Number(actual.fuelDriveCash)) }
    : funderMix ? funderMix
    : funder ? { annual: yrOf(driveFuelKeys, fuelDrive) * 2 + driveMiles, source: 'estimated', cash: 0 }
    : driveMiles > 0 ? { annual: driveMiles + driveCashYear, source: 'statement', cash: driveCashYear }
      : driveCashYear > 0 ? { annual: driveCashYear, source: 'measured', cash: driveCashYear }
        : { annual: yrOf(driveFuelKeys, fuelDrive) * (funder ? 2 : 1), source: 'estimated', cash: 0 };
  const driveWhere = fd.source === 'statement' || (funder && driveMiles > 0 && !num(actual.fuelDriveCash))
    ? (funder
      ? `The fuel part is paid into your Insure Funder Account and doubled, so it is estimated; your Miles statement adds ${fmtR(driveMiles)} a year of other Discovery Insure Miles.`
      : `Your Miles statement shows ${fmtR(driveMiles)} a year of Miles from Discovery Insure${driveCashYear > 0 ? `, and your bank statements ${fmtR(driveCashYear)} a year of INSURECASH` : ''}.`)
    : funderMix
    ? `INSURECASH still reached your account in ${funderMix.cashMonths === 1 ? 'one month' : `${funderMix.cashMonths} months`}, so ${funderMix.cashMonths === 1 ? 'that month counts' : 'those months count'} as the cash that arrived. The other months are paid into your Insure Funder Account, where they are doubled, so they are estimated.`
    : funder
    ? 'It is paid into your Insure Funder Account, where it is doubled. You can use that money for excesses, tyres, services and licences; taking it out as cash costs R2 of the account for every R1. Type what was paid in (from the Insure app) for the real figure.'
    : driveCash > 0 ? 'These are the INSURECASH payments on your statements.'
      : seen ? `No Drive cash on your statements since ${dayLabel(seen)}. If it now goes into the Insure Funder Account, set "Drive rewards paid into the Insure Funder Account" to Yes.` : '';
  line('stays', 'fuel.drive', 'Vitality Drive fuel rewards', fd.annual, fd.source,
    `${r('fuelDrivePct')}% back${funder ? ', doubled,' : ''} on up to ${fmtR(r('fuelCap'))} a month of fuel per driver at bp and Shell, paid with a Discovery Bank card (${fmtR(yrOf(driveFuelKeys, fuelCounted))} a year of your fuel counts). ${driveWhere ? driveWhere + ' ' : ''}Discovery Insure pays this to anyone with any Discovery Bank account, even the free one, so keep that free account if you move your banking.`,
    ['driveFunderAccount', 'fuelDrivePct', 'fuelCap', 'fuelDrivers'], { funder, cash: fd.cash });
  /* Gym: the current monthly price, so a month before the discount started
     does not inflate the saving. */
  const gymKey = anyKey(m, 'gym');
  const gym = m.figures[gymKey];
  const gymLatest = gym ? gym.perMonth[Object.keys(gym.perMonth).sort().pop()] : 0;
  line('stays', 'gym', 'Gym fees (after the Vitality discount)', yrOf([gymKey], total(m, gymKey)), 'measured', `Virgin Active or Planet Fitness. Vitality Health gives you ${fmtPct(r('gymDiscountPct'))} off (36 visits a year), with or without the bank.`);
  line('stays', 'healthyFood.health', 'HealthyFood Miles from Vitality Health', hf.stays, hf.source, 'Vitality Health pays these whether or not you bank with Discovery (each Mile counted at 10c).', ['healthyFoodHealthPct', 'healthyFoodSecondaryPct', 'healthyFoodHealthCap']);
  line('stays', 'healthyCare.health', 'HealthyCare Miles from Vitality Health', hc.stays, hc.source, 'Vitality Health pays these whether or not you bank with Discovery (each Mile counted at 10c).', ['healthyCareHealthPct', 'healthyCareCap']);
  line('stays', 'travel.health', 'Flight discount from Vitality Health', travelStays, travelSource, 'The part of the flight discount Vitality Health gives. Vitality Travel flights are booked and paid through a Discovery Bank account, but the free Ðiscovery Account is enough, so you keep this if you close the rest.', ['travelHealthPct']);
  if (sv) {
    line('stays', 'activeRewards', 'Other Vitality Health rewards', atValue('activeRewards', FACE_VALUE) + atValue('health.other', FACE_VALUE), 'statement', 'Rewards for sleep, health goals and other Vitality Health activities.');
    line('stays', 'activeRewards.basic', 'Basic exercise rewards without the bank', basic, 'estimated', `What Vitality Health would still give you for your weekly exercise goals without the gameboard (your guess${basic < r('activeRewardsWithoutBank') * 12 ? ', capped at what the gameboard paid' : ''}).`, ['activeRewardsWithoutBank']);
  }
  if (!watchMonthly) line('stays', 'benefit.appleWatch', 'Apple Watch charges', yr(total(m, 'benefit.appleWatch')), 'measured', 'You pay nothing in a month you meet your exercise goals. Type the watch\'s full monthly payment to count it as a bank benefit; it needs the all-in-one Discovery Bank package (account and credit card).', ['appleWatchMonthly']);

  // ── Would cost about the same at any bank (listed, not counted) ──────
  line('elsewhere', 'fee.penalty', 'Fees for failed or returned debit orders', yr(total(m, 'fee.penalty')), 'measured', 'Every bank charges these.');
  line('elsewhere', 'fee.fx', 'Foreign payment fees', yr(total(m, 'fee.fx')), 'measured', 'Fees for paying in other currencies. Discovery charges 2% (at most R100 a payment) and lists a 3% conversion fee; FNB charges 2,75%.');
  line('elsewhere', 'interest.charged', 'Interest charged on the card', yr(total(m, 'interest.charged')), 'measured', 'Every bank charges interest when the card is not paid off in full.');
  line('elsewhere', 'interest.earned', 'Normal interest on savings', yr(total(m, 'interest.earned')), 'measured', 'Other banks pay interest too, so only the extra interest above counts for Discovery.');

  /* What each benefit is worth to YOU (benefits.js): a weighted line keeps
     its whole value as `full` and counts `full × weight`. Costs are never
     weighted. */
  /* A line this person's setup cannot earn (no Vitality Health, a savings
     account only…) counts nothing whatever its level, and says so with
     available: false; its whole value is still kept as `full`. */
  const avail = availableFor(settings, setup.products, setup.vitality, { moneyProven: setup.moneyProven });
  /* the benefit sentences quote the figures the lines use: this card spend
     a year and this Mile value (round 2) */
  const suggestions = suggestBenefits(m, milesSummary, settings, { cardSpendYear, cardSpendSource: swipes ? 'statement' : debitOnly ? 'debit' : 'transactions', mileValue });
  const benefits = {};
  const benefitOf = {};
  for (const b of BENEFITS) {
    const sug = suggestions[b.id] || { suggested: 'full', why: '' };
    const a = avail.benefits[b.id];
    benefits[b.id] = { level: levelOf(settings, b.id, sug), suggested: sug.suggested, why: sug.why, full: 0, counted: 0, available: a.available, reason: a.reason, note: a.note };
    for (const k of b.lineKeys) benefitOf[k] = b.id;
  }
  const weigh = l => {
    const id = benefitOf[l.key];
    if (!id || l.group === 'cost') return;
    const open = avail.lines.has(l.key);
    const w = open ? WEIGHT[benefits[id].level] : 0;
    l.full = l.annual;
    l.weight = w;
    l.benefit = id;
    l.available = open;
    l.annual = w === 0 ? 0 : l.full * w;
    /* worth at full use counts only what this setup can earn */
    if (Number.isFinite(l.full) && open) { benefits[id].full += l.full; benefits[id].counted += l.annual; }
  };
  for (const l of lines) weigh(l);

  /* Without a Miles statement, how you said you spend your Miles sets the
     Vitality Health Miles' worth too: the discount needs the bank, so what
     it adds on top of face value is the bank's. It is worked out on the
     Vitality Health Miles as COUNTED above — none from a line this setup
     cannot earn or one set to "Not for me" — and then weighted itself. */
  /* With a Miles statement the same holds for the Miles it shows Vitality
     Health paid (HealthyFood, HealthyCare, exercise and other rewards): they
     are counted as weighted and available above, at face value. */
  const healthCounted = keys => keys.reduce((s, k) => s + ((lines.find(l => l.key === k) || {}).annual || 0), 0);
  if (sv && mileValue > FACE_VALUE) {
    line('bank', 'miles.uplift', 'Vitality Health Miles are worth more with the bank', healthCounted(['healthyFood.health', 'healthyCare.health', 'activeRewards']) * (mileValue / FACE_VALUE - 1), 'statement',
      `Vitality Health pays you Miles for HealthyFood and exercise whether or not you bank with Discovery. But the discounts that made your Miles worth ${fmtCents(mileValue)} each (at Discovery Miles partners and on Ð-Day, the 15th of each month) need Discovery Bank with Vitality Money. Without it, a Mile is worth ${fmtCents(FACE_VALUE)}.`, [], { uplift: true });
    weigh(lines[lines.length - 1]);
  } else if (!sv && mileSource === 'use' && mileValue > FACE_VALUE) {
    const healthMiles = healthCounted(['healthyFood.health', 'healthyCare.health']);
    line('bank', 'miles.uplift', 'Vitality Health Miles are worth more with the bank', healthMiles * (mileValue / FACE_VALUE - 1), 'estimated',
      `You said you spend your Miles ${MILES_USE_WORDS[settings.milesUse]}. With ${COUNT_WORDS[programmes]} Vitality programme${programmes === 1 ? '' : 's'} you get ${fmtPct(usePct)} off there, so each Mile buys about ${fmtCents(mileValue)} instead of ${fmtCents(FACE_VALUE)}. That discount needs Discovery Bank with Vitality Money, so it counts for the bank on Vitality Health's Miles too.`, ['milesDdayPct', 'milesPartnerPct'], { uplift: true });
    weigh(lines[lines.length - 1]);
  }

  /* Which way each figure points on the page: money out is negative. */
  const OUT = new Set(['fee.fx', 'fee.penalty', 'interest.charged', 'gym', 'benefit.appleWatch']);
  for (const l of lines) l.sign = l.group === 'cost' || OUT.has(l.key) ? -1 : 1;

  const cost = sumGroup(lines, 'cost');
  const value = sumGroup(lines, 'bank');
  const net = value - cost;

  /* The cautious view: Miles at face value, no uplift, no gameboard beyond
     the basic rewards, and no flights next year. */
  const cautiousValue = lines.filter(l => l.group === 'bank' && !l.uplift && !l.travel && l.key !== 'gameboard')
    .reduce((s, l) => s + (l.miles && mileValue > 0 ? l.annual * FACE_VALUE / mileValue : l.annual), 0);
  const cautiousNet = cautiousValue - cost;

  const monthly = spendMonths.map(ym => ({ ym, spend: cardIn(ym) }));
  const alternatives = ALTERNATIVES.map(a => altResult(a, settings, st, m, monthly, n, net, cautiousNet, debitOnly));
  const best = alternatives.slice().sort((x, y) => y.net - x.net)[0] || null;
  /* the bank you chose, else the best CONFIRMED like-for-like one */
  const chosen = chooseAlternative(alternatives, settings.compareWith, { bankKind: settings.bankKind || null }) || best;

  const downgrade = downgradeResult({ settings, st, lines, r, R, m, yr, monthly, avgSpend, net, watchMonthly });

  /* a premium a year over its own months (products.js premiumBasis), a
     claim over the months its account holds data */
  const PREMIUM_KEYS = ['product.medical', 'product.gap', 'product.insure', 'product.life'];
  const billOf = discoveryBill(m, keys => (keys.length === 1 && PREMIUM_KEYS.includes(keys[0]) ? premiumYear(m, keys[0], n) : yrOf(keys, keys.reduce((s, k) => s + total(m, k), 0))), settings.bill || {}, settings);
  const gd = Math.min(95, r('gymDiscountPct')) / 100;
  const gymSavingFull = gd > 0 ? (gymLatest * 12 / (1 - gd)) * gd : 0;
  const gymOpen = avail.lines.has('gym');
  const gymWeight = gymOpen ? WEIGHT[benefits.gym.level] : 0;
  benefits.gym.full = gymOpen ? gymSavingFull : 0;
  benefits.gym.counted = gymWeight === 0 ? 0 : gymSavingFull * gymWeight;
  const vitality = {
    premium: billOf.vitalityMonthly !== null ? billOf.vitalityMonthly * 12 : null,
    gymSaving: benefits.gym.counted,
    gymSavingFull,
    rewards: sumKeysOf(lines, ['healthyFood.health', 'healthyCare.health', 'travel.health', 'activeRewards', 'activeRewards.basic']),
  };
  vitality.value = vitality.gymSaving + vitality.rewards;

  /* Why a benefit counts nothing (benefits[id].zeroWhy, round 2), so a R0
     card can say why: not available, "Not for me", or the rule that left
     the spend out (not the main shop, under the monthly minimum, paid with
     another bank's card). '' when it counts something. */
  const shopName = { 'shop.checkers': 'Checkers', 'shop.woolworths': 'Woolworths', 'shop.pnp': 'Pick n Pay', 'shop.clicks': 'Clicks', 'shop.dischem': 'Dis-Chem' };
  const bare = k => k.replace(/^(all|disc)\./, '');
  const nameOf = k => shopName[bare(k)] || bare(k);
  const joinWith = word => xs => (xs.length <= 1 ? xs.join('') : xs.slice(0, -1).join(', ') + ` ${word} ` + xs[xs.length - 1]);
  const andNames = joinWith('and'), orNames = joinWith('or');
  /* keys: the shops the model counts (the pair it picks the main shop
     from); primaryAny: the main one, on any card */
  const shopZero = (label, shareKey, keys, primaryAny, healthKey, bankKey) => {
    const seen = keys.filter(k => total(m, anyKey(m, k)) > 0.5);
    if (!seen.length) return `We found no spend at ${orNames(keys.map(nameOf))} in this period, and only ${andNames(keys.map(nameOf))} count here.`;
    const share = r(shareKey);
    const main = nameOf(primaryAny);
    const others = seen.map(nameOf).filter(x => x !== main);
    const healthOpen = avail.lines.has(healthKey), bankOpen = avail.lines.has(bankKey);
    const qualifying = k => m.months.filter(ym => Math.max(0, inMonth(m, k, ym)) * share / 100 >= minSpend).length;
    const out = [];
    if (healthOpen && !qualifying(primaryAny)) {
      out.push(`We take ${share}% of what you spend at ${main} as ${label}, and that came to less than ${fmtR(minSpend)} in every month. A month under ${fmtR(minSpend)} earns nothing.`);
      if (others.length) out.push(`${andNames(others)} ${others.length === 1 ? 'is' : 'are'} not your main ${label} shop (${main} is), so ${others.length === 1 ? 'it does' : 'they do'} not count here.`);
    }
    if (bankOpen && !healthOpen) {
      const card = bare(primaryAny);
      if (!(total(m, card) > 0.5)) out.push(`You paid at ${main} with another bank's card. The bank's extra needs the Discovery Bank credit card.`);
      else if (!qualifying(card)) out.push(`What you paid at ${main} with the Discovery Bank card came to less than ${fmtR(minSpend)} of ${label} in every month.`);
      else out.push(`The bank's extra grows with that month's card spend (the more you spend on the card, the higher the %), and none of your months reached the first step.`);
    }
    return out.join(' ');
  };
  const zeroOf = id => {
    if (id === 'healthyFood') return shopZero('HealthyFood', 'healthyFoodShare', ['shop.checkers', 'shop.woolworths'], foodPrimaryAny, 'healthyFood.health', 'miles.healthyFood');
    if (id === 'healthyCare') return shopZero('HealthyCare', 'healthyCareShare', ['shop.clicks', 'shop.dischem'], carePrimaryAny, 'healthyCare.health', 'miles.healthyCare');
    if (id === 'fuel') {
      const any = total(m, anyKey(m, 'fuel.bp')) + total(m, anyKey(m, 'fuel.shell'));
      const disc = total(m, driveFuelKeys[0]) + total(m, driveFuelKeys[1]);
      if (any > 0.5 && !(disc > 0.5)) return 'You paid for fuel at bp or Shell with another bank\'s card. The fuel rewards need a Discovery Bank card.';
      if (!(any > 0.5)) return 'We found no fuel bought at bp or Shell in this period.';
    }
    if (id === 'gameboard' && !sv) return 'Only your Miles statement shows the gameboard (the weekly game in the Discovery Bank app), and there is none for this period, so nothing is counted. Add your Miles statement to count it.';
    if (id === 'miles' && !(r('milesRandPerMile') > 0) && !(r('milesPhysical') > 0)) return 'This account earns no Miles on card spend.';
    if (id === 'miles' && !(cardSpendYear >= 0.5)) return 'We found no Discovery Bank card spend in this period.';
    return '';
  };
  for (const b of BENEFITS) {
    const x = benefits[b.id];
    x.zeroWhy = '';
    if (x.counted >= 0.5) continue;
    if (!x.available) { x.zeroWhy = x.reason || ''; continue; }
    const said = settings.benefits && settings.benefits[b.id];
    if (x.level === 'none') { x.zeroWhy = said === 'none' ? 'You said Not for me, so it counts nothing.' : x.why || 'We found no sign that you use it.'; continue; }
    x.zeroWhy = zeroOf(b.id) || 'Nothing it pays showed up on your statements in this period.';
  }

  /* How far to trust the figures (st.confidence, contract Addition 4): how
     many months of Discovery Bank statements there are, and which lines
     rest on one or two events made into a year from a short window. */
  const stmtKeysOf = { 'miles.card': ['base'], 'miles.healthyFood': ['money.healthyFood'], 'miles.healthyCare': ['money.healthyCare'], 'fuel.money': ['money.fuel'],
    'miles.partners': ['money.partners'], gameboard: ['gameboard'], 'miles.uplift': ['health.healthyFood', 'health.healthyCare', 'activeRewards', 'health.other'],
    'healthyFood.health': ['health.healthyFood'], 'healthyCare.health': ['health.healthyCare'], activeRewards: ['activeRewards', 'health.other'], 'fuel.drive': ['insure'] };
  const allTravelKey = anyKey(m, 'travel.vitality');
  const figKeysOf = { 'fee.account': ['fee.account'], 'fee.facility': ['fee.facility'], 'fee.vitalityMoney': ['fee.vitalityMoney'], 'fee.other': ['fee.other'],
    'miles.card': [spendKey], 'miles.healthyFood': [foodPrimary], 'miles.healthyCare': [carePrimary], 'fuel.money': ['fuel.bp', 'fuel.shell'],
    'miles.uplift': [foodPrimaryAny, foodSecondaryAny, carePrimaryAny], appleWatch: ['benefit.appleWatch'], 'benefit.appleWatch': ['benefit.appleWatch'],
    'interest.boost': ['interest.boost'], 'interest.cashback': ['interest.cashback'], 'travel.bank': ['travel.vitality'], 'travel.health': [allTravelKey],
    'fuel.drive': fd.source === 'estimated' ? driveFuelKeys : ['insure.driveCash'], gym: [gymKey],
    'healthyFood.health': [foodPrimaryAny, foodSecondaryAny], 'healthyCare.health': [carePrimaryAny],
    'fee.penalty': ['fee.penalty'], 'fee.fx': ['fee.fx'], 'interest.charged': ['interest.charged'], 'interest.earned': ['interest.earned'] };
  const stmtCounts = (milesSummary && milesSummary.counts) || {};
  /* Monthly charges and payments (fees, interest, premiums, the gym, the
     watch) are a rate, not events: one in one month is that month's. Only
     a short import (confidence.thin) makes them doubtful. */
  const RECURRING = new Set(['fee.account', 'fee.facility', 'fee.vitalityMoney', 'interest.boost', 'interest.cashback', 'interest.earned', 'interest.charged', 'appleWatch', 'benefit.appleWatch', 'gym']);
  /* Flights are bookings, not a habit: one or two of them are a rough
     guess at ANY window length (one family holiday would otherwise carry
     the bank's whole verdict). */
  const BOOKINGS = new Set(['travel.bank', 'travel.health']);
  const figCount = keys => [...new Set(keys)].reduce((t, k) => t + ((m.figures[k] && m.figures[k].count) || 0), 0);
  for (const l of lines) {
    if (l.source === 'entered') continue;
    const fromStatement = l.source === 'statement' && sv;
    const sk = fromStatement ? stmtKeysOf[l.key] || [] : [];
    const fk = !fromStatement || l.key === 'fuel.drive' ? figKeysOf[l.key] || [] : [];
    if (!sk.length && !fk.length) continue;
    const stmtEvents = sk.reduce((t, k) => t + (stmtCounts[k] || 0), 0);
    const events = stmtEvents + figCount(fk);
    const months = Math.min(sk.length ? sv.covered : Infinity, fk.length && figCount(fk) ? sourceMonths(m, fk, n) : Infinity);
    l.events = events;
    l.basisMonths = Number.isFinite(months) ? months : null;
    const booked = BOOKINGS.has(l.key) && l.source === 'estimated';
    l.extrapolated = !RECURRING.has(l.key) && events > 0 && events <= 2 && (booked || (Number.isFinite(months) && months < 6));
    l.eventWord = stmtEvents > 0 ? 'reward' : booked ? 'booking' : 'payment';
  }
  const bill = discoveryBillWithBasis(m, n, billOf);
  const discMonths = (m.dataMonths || []).length;
  const notes = [];
  const MONTH_WORDS = ['no months', 'one month', 'two months', 'three months', 'four months', 'five months'];
  const monthWords = k => MONTH_WORDS[k] || `${k} months`;
  if (setup.products.bank) {
    if (!discMonths) notes.push('We found no Discovery Bank statements, so the bank\'s figures are guesses.');
    else if (discMonths < 6) notes.push(`We only have ${monthWords(discMonths)} of Discovery Bank statements. Import at least six months for a fair answer.`);
  }
  const extrapolated = [];
  for (const l of lines) {
    if (!l.extrapolated || !(Math.abs(l.annual) >= 0.5)) continue;
    extrapolated.push(l.key);
    const short = Number.isFinite(l.basisMonths) && l.basisMonths < 12;
    notes.push(`${l.label} comes from ${l.events === 1 ? `one ${l.eventWord}` : `two ${l.eventWord}s`} in ${monthWords(l.basisMonths)}${short ? ', made into a year' : ''}, so it is a rough guess.`);
  }
  for (const it of bill.items) {
    if (!it.extrapolated || !(Math.abs(it.annual) >= 0.5)) continue;
    extrapolated.push(it.key);
    notes.push(`${it.label} comes from ${it.events === 1 ? 'one payment' : 'two payments'} in ${monthWords(it.basisMonths)}, made into a year, so it is a rough guess.`);
  }
  /* Each product's own months (round 2): the months its premium was
     actually paid, not the months its paying account holds rows — joined
     two months ago is two months. ended: last paid more than two months
     before the statements that paid it end ({ [id]: 'YYYY-MM-DD' }, the
     last payment). Gap cover inside the Health debit goes by Health's. */
  const productMonths = { bank: discMonths };
  const ended = {};
  for (const [id, key] of [['health', 'product.medical'], ['gap', 'product.gap'], ['insure', 'product.insure'], ['life', 'product.life']]) {
    const b = premiumBasis(m, key);
    productMonths[id] = b ? b.paidMonths : 0;
    if (b && b.ended && !(id === 'life' && settings.life && num(settings.life.monthly) && Number(settings.life.monthly) > 0)) ended[id] = b.lastPaid;
  }
  if (!productMonths.gap && ended.health && settings.bill && num(settings.bill.gap) && Number(settings.bill.gap) > 0) ended.gap = ended.health;
  /* Only the bank's figures rest on Discovery Bank statements: without the
     bank, too few of them says nothing (a Health-only household is judged
     on its own debits, productMonths). */
  const confidence = { months: discMonths, thin: !!setup.products.bank && discMonths < 6, extrapolated, notes, productMonths, ended };

  return {
    window: { from: m.from, to: m.to, months: m.months.length, dataMonths: n, rows: m.rowsSeen },
    vitality,
    milesStatement: sv ? { from: sv.from, to: sv.to, covered: sv.covered, rows: sv.ms.rows, mileValue, spentValue } : null,
    mileValue, mileSource,
    /* the window the typed Miles were for, when it is not this one */
    actualStale,
    cardSpend: cardSpendYear,
    cardSpendSource: swipes ? 'statement' : debitOnly ? 'debit' : 'transactions',
    avgMonthlySpend: avgSpend,
    lines, cost, value, net,
    /* { [benefit id]: { level, suggested, why, full, counted, available,
       reason, note } }, annual rands */
    benefits,
    /* the products and Vitality programmes the benefits were judged on */
    setup: { products: setup.products, vitality: setup.vitality, bankKind: settings && settings.bankKind ? settings.bankKind : null },
    cautious: { value: cautiousValue, net: cautiousNet },
    alternatives, best, chosen, downgrade,
    verdict: chosen ? (chosen.gainIfSwitch > 0 ? 'switch' : 'stay') : null,
    bill,
    /* { months, thin, extrapolated: [line or bill item keys], notes: [plain
       sentences], productMonths: { bank, health, gap, insure, life } (months
       of each product's own payments), ended: { [id]: last paid
       'YYYY-MM-DD' } for a product whose payments stopped } */
    confidence,
  };
}

/* Another bank over the same months: its fees, a flat rate on card spend
   (capped per month), and its partner deals at shops you already use. A
   partner deal with no published rate earns nothing here; `breakEven` is
   the partner rate at which that bank would match Discovery.
   onDebit: the spend is a transaction account's debit card (no Discovery
   credit card). A rival's flat cashback is taken as a credit card's unless
   its row says otherwise (cardOnly: false, or its own debitBackPct), so it
   is not paid on debit card spend here. */
function altResult(a, settings, st, m, monthly, n, net, cautiousNet, onDebit) {
  const rt = k => rate(settings, `alt.${a.id}.${k}`, st);
  /* one rival account for each Discovery account that pays its own
     monthly account fee (a couple with a Suite each needs two) */
  /* only an account that was CHARGED a fee (a R0 line or a reversal is
     not one) and is not a savings or forex account, which pays no account
     fee of its own at another bank either (round 2) */
  const types = m.accountTypes || {};
  const savingsLike = acc => /savings|forex|notice|fixed/i.test(String(types[acc] || '')) || (!types[acc] && /\b(savings?|save|forex|fx|notice|fixed)\b/i.test(String(acc || '')));
  const holders = Math.max(1, new Set(((m.rows && m.rows['fee.account']) || []).filter(r => r.amount === undefined || Number(r.amount) < -0.005).filter(r => !savingsLike(r.account)).map(r => r.account)).size);
  const fees = rt('fee') * 12 * holders;
  const publishedPct = rt('backPct');
  const debitPct = a.cardOnly === false ? publishedPct : num(a.debitBackPct) ? Number(a.debitBackPct) : 0;
  const backPct = onDebit ? debitPct : publishedPct;
  const capM = rt('capMonthly');
  const scale = 12 / (monthly.length || 1);
  let flat = 0, partnerBase = 0, partnerRewards = 0;
  /* the spend each month that a partner deal already rewarded */
  const rewardedIn = {};
  const parts = (a.partners || []).map((p, i) => {
    const key = `alt.${a.id}.partner${i}`;
    const set = settings.rates && num(settings.rates[key]);
    const pct = set ? Number(settings.rates[key]) : p.pct;
    let base = 0;
    for (const { ym, spend } of monthly) {
      let s = p.keys.reduce((t, k) => t + Math.max(0, inMonth(m, k, ym)), 0);
      if (p.capMonthly) s = Math.min(s, p.capMonthly);
      if (p.shareOfSpend && (!p.shareBelow || spend < p.shareBelow)) s = Math.min(s, spend * p.shareOfSpend / 100);
      base += s;
      rewardedIn[ym] = (rewardedIn[ym] || 0) + s;
    }
    return { key, label: p.label, pct, known: num(pct), base: base * scale, capMonthly: p.capMonthly };
  });
  /* the card spend that earns the flat reward: less the shops it is not
     paid at, and less what a partner deal already rewarded */
  const flatBase = (ym, spend) => {
    let x = spend;
    if (Array.isArray(a.flatExcludes)) x -= a.flatExcludes.reduce((t, k) => t + Math.max(0, inMonth(m, k, ym)), 0);
    if (a.flatExcludesPartners) x -= rewardedIn[ym] || 0;
    return Math.max(0, x);
  };
  /* a fixed rand amount by monthly spend band, halved on debit card spend */
  const earn = x => {
    const t = a.bankEarn;
    let v = 0;
    for (let k = 0; k < t.bands.length; k++) if (x >= t.bands[k]) v = t.rand[k];
    return onDebit ? v / 2 : v;
  };
  for (const { ym, spend } of monthly) {
    const x = flatBase(ym, spend);
    if (a.bankEarn) { flat += earn(x); continue; }
    const f = x * backPct / 100;
    flat += capM > 0 ? Math.min(f, capM) : f;
  }
  flat *= scale;
  for (const p of parts) {
    if (p.known) partnerRewards += p.base * p.pct / 100;
    else partnerBase += p.base;
  }
  const rewards = flat + partnerRewards;
  const altNet = rewards - fees;
  /* rate on the unknown partners' spend that closes the gap */
  const need = target => (partnerBase > 0 ? Math.max(0, ((target - altNet) / partnerBase) * 100) : null);
  return {
    id: a.id, name: a.name, fees, holders, rewards, backPct, net: altNet, gainIfSwitch: altNet - net,
    /* the published card rate, and whether it was left off debit card spend */
    publishedPct, debitOnly: !!onDebit, cardOnlyLeftOut: !!onDebit && publishedPct > 0 && backPct < publishedPct,
    partners: parts, breakEven: need(net), breakEvenCautious: need(cautiousNet),
    note: a.note, source: a.source, guess: !!a.guess, app: a.app || a.name, rewardKind: a.rewardKind || 'cash',
  };
}

/* Keeping Discovery but dropping the Suite for your collection's Credit
   Card Account on its own: lower fees, pay-as-you-transact charges, a lower
   base-Miles rate, smaller flight and savings boosts, and no Apple Watch
   benefit (it needs a Suite). The card's own reward tables decide the rest
   (rates.js BANK_PRODUCTS): on Black and Platinum HealthyFood, HealthyCare
   and fuel are the same, but the Gold Credit Card Account gets no HealthyCare
   from the bank. null when there is nothing to move to: Purple has no Credit
   Card Account, and someone already on a card, transaction or savings
   account has no Suite to drop. */
function downgradeResult({ settings, st, lines, r, R, m, yr, monthly, avgSpend, net, watchMonthly }) {
  const suite = suiteOf(settings);
  const kind = settings && settings.bankKind;
  if (!suite.creditCard || kind === 'card' || kind === 'transaction' || kind === 'savings') return null;
  const L = key => { const l = lines.find(x => x.key === key && x.group === 'bank'); return l ? l.annual : 0; };
  /* the same rate on the Credit Card Account, at this average card spend */
  const onCard = key => rate(settings, key, st, { spend: avgSpend, bankKind: 'card' });
  const ratioOf = key => { const now = R(key, avgSpend); return now > 0 ? onCard(key) / now : 1; };
  const fees = r('ccFee') * 12;
  const payments = yr(total(m, 'payt.payments'));
  const payt = payments * r('paytFee');
  const suiteMiles = monthly.reduce((s, x) => s + monthMiles(x.spend, r), 0);
  const ccR = key => (key === 'milesRandPerMile' ? r('ccMilesRandPerMile') : r(key));
  const ccMiles = monthly.reduce((s, x) => s + monthMiles(x.spend, ccR), 0);
  const milesRatio = suiteMiles > 0 ? ccMiles / suiteMiles : 1;
  const flightSuite = R('travelMoneyPct', avgSpend), flightCc = R('ccTravelMoneyPct', avgSpend);
  const boostRatio = r('savingsBoostPct') > 0 ? r('ccSavingsBoostPct') / r('savingsBoostPct') : 1;
  const changes = [
    { key: 'miles.card', label: 'Fewer Miles for using your card (one per R' + r('ccMilesRandPerMile') + ' instead of R' + r('milesRandPerMile') + ')', delta: L('miles.card') * (milesRatio - 1) },
    { key: 'travel.bank', label: `Smaller flight discount from the bank (${fmtPct(flightCc)} instead of ${fmtPct(flightSuite)})`, delta: flightSuite > 0 ? L('travel.bank') * (flightCc / flightSuite - 1) : 0 },
    { key: 'interest.boost', label: `Less extra interest on savings (${fmtPct(r('ccSavingsBoostPct'))} instead of ${fmtPct(r('savingsBoostPct'))})`, delta: L('interest.boost') * (boostRatio - 1) },
    { key: 'interest.cashback', label: 'Less cashback on money left in the card', delta: L('interest.cashback') * (boostRatio - 1) },
    ...[['miles.healthyFood', 'healthyFoodMoneyPct', 'HealthyFood'], ['miles.healthyCare', 'healthyCareMoneyPct', 'HealthyCare'], ['fuel.money', 'fuelMoneyPct', 'fuel']].map(([key, rk, what]) => {
      const ratio = ratioOf(rk);
      return { key, label: ratio === 0 ? `No extra ${what} from the bank on the ${suite.creditCard.label}` : `${ratio < 1 ? 'Less' : 'More'} extra ${what} from the bank`, delta: L(key) * (ratio - 1) };
    }),
    { key: 'appleWatch', label: 'No Apple Watch deal (it needs the Suite)', delta: -L('appleWatch') },
  ].filter(c => Math.abs(c.delta) >= 0.5);
  const value = lines.filter(l => l.group === 'bank').reduce((s, l) => s + l.annual, 0) + changes.reduce((s, c) => s + c.delta, 0);
  const cost = fees + payt;
  const ddNet = value - cost;
  /* The watch term: 24 months from the first Apple Watch charge (the activation), to the day. */
  const first = m.firstSeen && m.firstSeen['benefit.appleWatch'];
  let watchEnds = null;
  if (first && watchMonthly) {
    const [y, mo, d] = first.split('-').map(Number);
    watchEnds = `${y + 2}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return {
    label: suite.creditCard.label,
    fees, payments, payt, cost, value, net: ddNet, changes,
    gainIfDowngrade: ddNet - net,
    /* once the watch term is over the Suite no longer carries the watch */
    gainAfterWatch: L('appleWatch') ? ddNet - (net - L('appleWatch')) : null,
    watchEnds,
  };
}

function sumGroup(lines, group) {
  return lines.filter(l => l.group === group).reduce((s, l) => s + (Number.isFinite(l.annual) ? l.annual : 0), 0);
}

function sumKeysOf(lines, keys) {
  return lines.filter(l => keys.includes(l.key)).reduce((s, l) => s + l.annual, 0);
}

/* The rest of the Discovery relationship, for context: premiums out, claims
   back. The Discovery Health debit can carry the medical aid, gap cover and
   Vitality together. The medical aid is the amount you typed, else your
   plan's published price for your family (settings.health.plan and
   settings.members, compare.js healthPremium); gap cover is what you typed.
   They are split out of the LATEST month's debit and the rest is Vitality
   and other. When they come to more than that debit nothing is split.
   annual(keys): a figure a year over the months its accounts hold data. */
function discoveryBill(m, annual, known, settings) {
  const items = [];
  const push = (key, label, value, seen, note) => items.push({ key, label, annual: value, seen, note });
  const debit = m.figures['product.medical'];
  let vitalityMonthly = null, medicalMonthly = null, medicalSource = null, priceStale = false, priceStaleSide = null;
  if (debit) {
    const latestYm = Object.keys(debit.perMonth).sort().pop();
    const latest = debit.perMonth[latestYm];
    const typed = num(known.medical) ? Number(known.medical) : null;
    const priced = typed === null ? planPrice(settings, latestYm) : null;
    const med = typed !== null ? typed : priced ? priced.monthly : null;
    const gap = num(known.gap) ? Number(known.gap) : 0;
    const head = `${fmtR(latest)} in ${monthLabel(latestYm)}`;
    let note;
    if (med === null) {
      note = `${head}. Type your medical aid and gap cover amounts on the Inputs tab to see what it pays for.`;
    } else if (typed === null && !planPriceValid(latestYm)) {
      /* The published price is for the plan table's own period: a debit
         from outside it was charged at a price we do not have, so splitting
         it would call the medical aid's price change Vitality. Say which
         side of the period the debit is on. */
      const period = PERIODS && PERIODS.discoveryHealth;
      /* the last period whose prices we have (2027 follows 2026) */
      let last = period;
      while (last && last.next && PERIODS[last.next]) last = PERIODS[last.next];
      const before = period && period.from && latestYm < period.from.slice(0, 7);
      note = before
        ? `${head}. That is from before the plan prices we have (they start in ${monthLabel(period.from.slice(0, 7))}), so we cannot split it with them. Type your medical aid amount on the Inputs tab.`
        : `${head}. Your plan's price has changed since the prices we have${last && last.to ? ` (they run to ${monthLabel(last.to.slice(0, 7))})` : ''}, so we cannot split it with them. Type your medical aid amount on the Inputs tab.`;
      priceStale = true;
      priceStaleSide = before ? 'before' : 'after';
    } else if (med + gap > latest + 0.5) {
      note = typed !== null
        ? `${head}. The amounts you typed (${fmtR(med)} medical aid${gap ? ` and ${fmtR(gap)} gap cover` : ''}) come to more than this debit, so it cannot be split. Check them on the Inputs tab.`
        : `${head}. ${priced.label}'s published price for your family is ${fmtR(med)} a month${gap ? `, and with ${fmtR(gap)} gap cover that` : ', which'} is more than this debit, so it cannot be split. Type your medical aid amount on the Inputs tab.`;
    } else {
      const rest = Math.max(0, latest - med - gap);
      const from = typed !== null ? 'from the amounts you typed' : `the medical aid is ${priced.label}'s published price for your family`;
      note = `${head}: ${fmtR(med)} medical aid${gap ? `, ${fmtR(gap)} gap cover` : ''} and ${fmtR(rest)} Vitality and other (${from}).`;
      vitalityMonthly = rest;
      medicalMonthly = med;
      medicalSource = typed !== null ? 'entered' : 'plan';
    }
    push('product.medical', 'Discovery Health debit order', -annual(['product.medical']), true, note);
  } else push('product.medical', 'Discovery Health debit order', 0, false);
  const add = (key, label, sign) => push(key, label, sign * annual([key]), !!m.figures[key]);
  add('product.gap', 'Gap cover (paid separately)', -1);
  add('product.insure', 'Discovery Insure premiums', -1);
  add('product.life', 'Discovery Life premiums', -1);
  add('product.medicalBack', 'Claims paid to you by Discovery Health', 1);
  add('product.gapClaim', 'Gap cover claims paid to you', 1);
  add('product.insureClaim', 'Discovery Insure claims paid to you', 1);
  return { items, net: items.reduce((s, i) => s + i.annual, 0), vitalityMonthly, medicalMonthly, medicalSource, priceStale, priceStaleSide };
}

/* The bill with how many payments each item rests on and over how many
   months it was made a year (events, basisMonths, extrapolated), like the
   statement's lines. */
function discoveryBillWithBasis(m, n, bill) {
  for (const it of bill.items) {
    const f = m.figures[it.key];
    if (!f) continue;
    it.events = f.count;
    const pb = premiumBasis(m, it.key);
    it.basisMonths = pb && /^product\.(medical|gap|insure|life)$/.test(it.key) ? pb.months : sourceMonths(m, [it.key], n);
    /* premiums are monthly; claims are events */
    it.extrapolated = /Back$|Claim$/.test(it.key) && f.count > 0 && f.count <= 2 && it.basisMonths < 6;
  }
  return bill;
}

/* Whether the Discovery Health plan table's prices hold for month `ym`
   (compare.js planPriceValidFor, contract Addition 4). Until that exists the
   2026 tables are taken as good to the end of 2026. */
function planPriceValid(ym) {
  if (typeof compare.planPriceValidFor === 'function') {
    try { return compare.planPriceValidFor(ym) !== false; } catch (e) { return true; }
  }
  return ym <= '2026-12';
}

/* Your Discovery Health plan's published monthly price for your family in
   month ym (2026 or 2027 prices, compare.js priceAt), { monthly, label }, or
   null when the plan is not set or not priced. */
function planPrice(settings, ym) {
  const id = settings && settings.health && settings.health.plan;
  if (!id) return null;
  const plan = HEALTH_PLANS.concat(HEALTH_OWN).find(p => p.id === id && p.discovery);
  const monthly = plan ? healthPremium(plan, (settings && settings.members) || {}, ym) : null;
  return monthly > 0 ? { monthly, label: plan.plan } : null;
}

/* The Apple Watch charges in the window, month by month, with the once-off
   activation fee taken out: { charges: [monthly instalment payments],
   activationPaid }. A row is the activation when it says so or is the
   activation amount. */
function watchCharges(m, activation) {
  const fig = m.figures['benefit.appleWatch'];
  if (!fig) return { charges: [], activationPaid: 0 };
  const isAct = (desc, v) => /activation/i.test(desc || '') || (activation > 0 && Math.abs(v - activation) <= 0.5);
  const rows = m.rows && m.rows['benefit.appleWatch'];
  let activationPaid = 0;
  const perMonth = {};
  if (rows && rows.length) {
    for (const row of rows) {
      const v = -row.amount;
      if (v > 0 && isAct(row.description, v)) { activationPaid += v; continue; }
      const ym = row.date.slice(0, 7);
      perMonth[ym] = (perMonth[ym] || 0) + v;
    }
  } else {
    for (const [ym, v] of Object.entries(fig.perMonth)) {
      if (v > 0 && isAct('', v)) activationPaid += v;
      else perMonth[ym] = v;
    }
  }
  return { charges: Object.keys(perMonth).sort().map(ym => perMonth[ym]).filter(v => v > 0), activationPaid };
}

/* How the card earns base Miles, in words; "earns no Miles" when the
   account's rates are nothing (pay-as-you-transact, savings). */
function milesRateText(r) {
  const virt = r('milesRandPerMile'), thr = r('milesThreshold'), above = r('milesAboveThreshold'), phys = r('milesPhysical');
  if (!(virt > 0) && !(phys > 0)) return 'This account earns no Miles on card spend.';
  const parts = [];
  if (virt > 0) {
    const cap = thr > 0 ? ` up to ${fmtR(thr)} a month${above > 0 ? `, then one for every R${above}` : ', and none above that'}` : '';
    parts.push(`At your bank score, paying with the virtual card earns one Mile for every R${virt}${cap}.`);
  } else parts.push('Paying with the virtual card earns no Miles at your bank score.');
  parts.push(phys > 0 ? `The plastic card earns one Mile for every R${phys}${thr > 0 ? ` on up to ${fmtR(thr)} a month` : ''}.` : 'The plastic card earns no Miles.');
  return parts.join(' ');
}

function fmtPct(v) {
  return String(v).replace('.', ',') + '%';
}

function fmtCents(v) {
  return 'R' + v.toFixed(3).replace(/0$/, '').replace('.', ',');
}

/* Plain "R 1 234" for detail strings (the view formats the headline figures). */
function fmtR(n) {
  return 'R ' + String(Math.round(n)).replace(/\B(?=(\d{3})+$)/g, ' ');
}

module.exports = { buildStatement, cappedMonthly, monthMiles, watchInstalment, sumKeys, monthsBetween };
