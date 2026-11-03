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
   All amounts returned are annual: total × 12 / months that hold data. */

const { total, monthsBetween } = require('./measure');
const { rate, ALTERNATIVES, FACE_VALUE, suiteOf, bankProductOf } = require('./rates');
const { monthLabel, dayLabel } = require('./format');
const { BENEFITS, WEIGHT, suggestBenefits, levelOf, availableFor, anyKey } = require('./benefits');

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
  return { products, vitality: { money: pick('money', moneySeen), health: pick('health', products.health), drive: pick('drive', products.insure) } };
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
  /* Typed Miles totals are for one window: once the window moves on they
     would count against months they were never about. Totals typed before
     the window was stamped on them carry no period and are still used. */
  const windowId = `${m.from}..${m.to}`;
  const typedMiles = settings.actualMiles || {};
  const actualStale = typedMiles.period && typedMiles.period !== windowId ? typedMiles.period : null;
  const actual = actualStale ? {} : typedMiles;
  const sv = statementView(milesSummary, m);
  /* What a Mile was worth when you spent it (Miles+ discounts and Ð-Day
     included), unless you set a value yourself. Those discounts need the
     bank, so without it a Mile is worth its face value. */
  const overridden = settings.rates && num(settings.rates.mileValue);
  const spentValue = sv && sv.ms.spentMiles > 0 ? sv.ms.spentRand / sv.ms.spentMiles : null;
  const mileValue = !overridden && spentValue ? spentValue : r('mileValue');
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
  const upTo = key => (topPct(key) > 0 ? ` (up to ${fmtPct(topPct(key))} at your ${status} status)` : '');
  line('cost', 'fee.account', 'Monthly account fee', yr(total(m, 'fee.account')), 'measured', 'The account\'s monthly fee on your Discovery statements.' + onProd(prod.accountFee, 'account fee'));
  line('cost', 'fee.facility', 'Credit card fee', yr(total(m, 'fee.facility')), 'measured', 'The credit card\'s own monthly fee.' + onProd(prod.creditFee, 'credit card fee'));
  line('cost', 'fee.vitalityMoney', 'Vitality Money fee', yr(total(m, 'fee.vitalityMoney')), 'measured', 'Vitality Money is the part of Discovery Bank that gives you the extra Miles and discounts below. You only get it with Discovery Bank.' + onProd(prod.vitalityMoneyFee, 'Vitality Money fee'));
  line('cost', 'fee.other', 'Other bank charges', yr(total(m, 'fee.other')), 'measured', 'Anything else marked as a bank charge on a Discovery account.');

  // ── What you would lose by leaving ───────────────────────────────────
  let miles = 0, hfMoney = 0, hfHealth = 0, hcMoney = 0, hcHealth = 0, fuelDrive = 0, fuelMoney = 0, fuelCounted = 0;
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

    const fuel = Math.min(Math.max(0, inMonth(m, 'fuel.bp', ym) + inMonth(m, 'fuel.shell', ym)), r('fuelCap') * Math.max(1, r('fuelDrivers')));
    fuelCounted += fuel;
    fuelDrive += fuel * r('fuelDrivePct') / 100;
    fuelMoney += fuel * R('fuelMoneyPct', spend) / 100;
  }

  const milesLine = num(actual.card)
    ? { annual: yr(Number(actual.card) * mileValue), source: 'entered' }
    : sv ? { annual: fromStmt('base'), source: 'statement' }
      : { annual: yr(miles * mileValue), source: 'estimated' };
  line('bank', 'miles.card', 'Miles for using your card', milesLine.annual, milesLine.source,
    `You spend about ${fmtR(cardSpendYear)} a year on the card${swipes ? ' (as counted on your Miles statement)' : ''}. At your status, paying with the virtual card earns one Mile for every R${r('milesRandPerMile')} up to ${fmtR(r('milesThreshold'))} a month, then one for every R${r('milesAboveThreshold')}. The plastic card earns one Mile for every R${r('milesPhysical')}. Each Mile is worth ${fmtCents(mileValue)}${spentValue && !overridden ? ', which is what yours were worth when you spent them' : ''}.`,
    ['virtualSharePct', 'milesRandPerMile', 'milesThreshold', 'milesAboveThreshold', 'milesPhysical'], { miles: true });

  /* HealthyFood / HealthyCare: the statement names the payer; a typed total
     is split in the estimated proportion. Vitality Health's part is valued
     at face — the Miles+ uplift on it is counted separately, as the bank's. */
  const split = (key, moneyEst, healthEst) => {
    const back = v => (v * n) / 12; /* callers apply yr() */
    if (!num(actual[key]) && sv) {
      return { bank: back(fromStmt('money.' + key)), stays: back(atValue('health.' + key, FACE_VALUE)), source: 'statement', miles: true };
    }
    if (!num(actual[key])) return { bank: moneyEst, stays: healthEst, source: 'estimated', miles: false };
    const tot = Number(actual[key]);
    const f = moneyEst + healthEst > 0 ? moneyEst / (moneyEst + healthEst) : 0.5;
    return { bank: tot * f * mileValue, stays: tot * (1 - f) * FACE_VALUE, source: 'entered', miles: true };
  };
  const hf = split('healthyFood', hfMoney, hfHealth);
  const partner = k => (k === 'shop.checkers' ? 'Checkers' : 'Woolworths');
  line('bank', 'miles.healthyFood', 'Extra HealthyFood Miles from the bank', yr(hf.bank), hf.source,
    `We take ${r('healthyFoodShare')}% of what you spend at ${partner(foodPrimary)} as HealthyFood (it is your main HealthyFood shop, and the bank's extra only applies there). On up to ${fmtR(r('healthyFoodMoneyCap'))} of HealthyFood a month the bank adds a percentage that grows with that month's card spend${upTo('healthyFoodMoneyPct')}. A month with less than ${fmtR(minSpend)} of HealthyFood gets nothing.`,
    ['healthyFoodShare', 'healthyFoodMoneyPct', 'healthyFoodMoneyCap', 'healthyMinSpend'], { miles: hf.miles });

  const hc = split('healthyCare', hcMoney, hcHealth);
  line('bank', 'miles.healthyCare', 'Extra HealthyCare Miles from the bank', yr(hc.bank), hc.source,
    `We take ${r('healthyCareShare')}% of what you spend at ${carePrimary === 'shop.clicks' ? 'Clicks' : 'Dis-Chem'} as HealthyCare. On up to ${fmtR(r('healthyCareMoneyCap'))} of it a month the bank adds a percentage that grows with that month's card spend${upTo('healthyCareMoneyPct')}. A month with less than ${fmtR(minSpend)} of HealthyCare gets nothing.`,
    ['healthyCareShare', 'healthyCareMoneyPct', 'healthyCareMoneyCap', 'healthyMinSpend'], { miles: hc.miles });

  const fm = num(actual.fuel) ? { annual: yr(Number(actual.fuel) * mileValue), source: 'entered' }
    : sv ? { annual: fromStmt('money.fuel'), source: 'statement' }
      : { annual: yr(fuelMoney), source: 'estimated' };
  line('bank', 'fuel.money', 'Extra fuel Miles from the bank', fm.annual, fm.source,
    `A percentage of what you spend at bp and Shell, paid in Miles. The percentage grows with that month's card spend${upTo('fuelMoneyPct')}. It needs Vitality Money, so you lose it if you leave the bank.`,
    ['fuelMoneyPct'], { miles: fm.source !== 'estimated' });

  if (sv) {
    line('bank', 'miles.partners', 'Miles from partner shops and Insure', fromStmt('money.partners') + fromStmt('insure'), 'statement',
      'Extra Miles at Discovery\'s partner shops (Superbalist, Exclusive Books, parking and others) and Miles from Discovery Insure.', [], { miles: true });
    const basic = r('activeRewardsWithoutBank') * 12;
    const board = fromStmt('gameboard');
    line('bank', 'gameboard', 'Gameboard rewards', Math.max(0, board - basic), 'statement',
      `${fmtR(board)} a year of Miles from the gameboard in the Discovery Bank app. The gameboard needs the bank. Without it, Vitality Health still gives you basic rewards for your weekly exercise goals, which you guessed at ${fmtR(basic)} a year, so only the rest is counted here.`,
      ['activeRewardsWithoutBank'], { miles: true });
    if (mileValue > FACE_VALUE) {
      const healthMiles = ['health.healthyFood', 'health.healthyCare', 'activeRewards', 'health.other'].reduce((s, k) => s + sv.miles(k), 0);
      line('bank', 'miles.uplift', 'Vitality Health Miles are worth more with the bank', (healthMiles * (mileValue - FACE_VALUE) * 12) / sv.covered, 'statement',
        `Vitality Health pays you Miles for HealthyFood and exercise whether or not you bank with Discovery. But the discounts that made your Miles worth ${fmtCents(mileValue)} each (Miles+ partners and Ð-Day) need Discovery Bank. Without it, a Mile is worth ${fmtCents(FACE_VALUE)}.`, [], { uplift: true });
    }
  }
  /* The Apple Watch needs a Discovery Bank Suite with a credit card: its
     value is the instalments you did not pay. */
  const watchRows = m.figures['benefit.appleWatch'];
  const charges = watchRows ? Object.values(watchRows.perMonth).filter(v => v > 0 && Math.abs(v - r('appleWatchActivation')) > 0.5) : [];
  const watchSet = settings.rates && num(settings.rates.appleWatchMonthly);
  const inferred = watchInstalment(charges);
  const watchMonthly = watchSet ? Number(settings.rates.appleWatchMonthly) : inferred;
  if (watchMonthly) {
    const paid = yr(total(m, 'benefit.appleWatch'));
    const activation = r('appleWatchActivation') / 2;
    line('bank', 'appleWatch', 'Apple Watch', watchMonthly * 12 - paid - activation, watchSet ? 'entered' : 'measured',
      `The watch costs ${fmtR(watchMonthly)} a month in full, ${fmtR(watchMonthly * 24)} over its 24-month contract${!watchSet ? ` (worked out from what you were charged in months you missed goals: ${charges.map(c => fmtR(c)).join(', ')}; three goals met costs half, two goals three quarters)` : ''}. You pay less, or nothing, in months you meet your weekly exercise goals. This is that saving, less the ${fmtR(paid)} a year you did pay and the ${fmtR(r('appleWatchActivation'))} activation fee spread over two years. It needs the Discovery Bank Suite with a credit card; a new watch means a new 24-month contract.`,
      ['appleWatchMonthly', 'appleWatchActivation']);
  }
  line('bank', 'interest.boost', 'Extra interest on your savings', yr(total(m, 'interest.boost')), 'measured', `The extra interest Discovery Bank adds to your accounts for your Vitality Money status${(() => { const b = r(prod.kind === 'card' ? 'ccSavingsBoostPct' : 'savingsBoostPct'); return b > 0 ? ` (${fmtPct(b)} more on savings at your ${status} status)` : ''; })()}.`);
  line('bank', 'interest.cashback', 'Cashback on money left in the card', yr(total(m, 'interest.cashback')), 'measured', 'Interest paid on money you keep in the credit card account.');

  /* Receipts count only for the window they were typed for. */
  const tr = settings.travel || {};
  const receipts = num(tr.discount) && num(tr.baseFare) && Number(tr.baseFare) > 0;
  const receiptsFit = receipts && (!tr.period || tr.period === windowId);
  const healthPct = r('travelHealthPct');
  let travelBank, travelStays, travelSource, travelDetail;
  if (receipts && !receiptsFit) {
    /* Receipts from another window still say what YOUR bookings got off
       the base fare, which beats the published bands: apply their rates to
       this window's Vitality Travel payments. */
    const fare = Number(tr.baseFare), disc = Math.min(Number(tr.discount), fare);
    const healthOnly = Math.min(disc, fare * healthPct / 100);
    const paid = Math.max(0, total(m, 'travel.vitality'));
    const fares = disc < fare ? paid / (1 - disc / fare) : 0;
    travelBank = yr(fares * (disc - healthOnly) / fare);
    travelStays = yr(fares * healthOnly / fare);
    travelSource = 'estimated';
    travelDetail = `You paid ${fmtR(yr(paid))} a year on Vitality Travel. Your receipts for ${tr.period.split('..').map(monthLabel).join(' – ')} showed ${fmtPct(Math.round(disc / fare * 1000) / 10)} off the full fare, ${fmtPct(Math.round((disc - healthOnly) / fare * 1000) / 10)} of it from the bank, so the same is used here. Type this period's receipts on the Inputs tab for the real figure.`;
  } else if (receiptsFit) {
    const healthOnly = Math.min(Number(tr.discount), Number(tr.baseFare) * healthPct / 100);
    /* Receipt totals cover the window as a whole: scale to a year by the
       window's length, not by months of data. */
    const scale = 12 / m.months.length;
    travelBank = Math.max(0, Number(tr.discount) - healthOnly) * scale;
    travelStays = healthOnly * scale;
    travelSource = 'entered';
    travelDetail = `From your receipts: ${fmtR(Number(tr.discount))} off ${fmtR(Number(tr.baseFare))} of flights. Without Discovery Bank you would only get Vitality Health's ${healthPct}% off (${fmtR(healthOnly)}); the rest came from the bank. This is one year's flights, and next year may differ.`;
  } else {
    const paid = Math.max(0, total(m, 'travel.vitality'));
    const money = R('travelMoneyPct', avgSpend);
    const d = Math.min(75, healthPct + money) / 100;
    const base = d < 1 ? paid / (1 - d) : 0;
    travelBank = yr(base * money / 100);
    travelStays = yr(base * healthPct / 100);
    travelSource = 'estimated';
    travelDetail = `You paid ${fmtR(yr(paid))} a year on Vitality Travel. With ${fmtR(avgSpend)} a month of card spend, the bank adds ${money}% off on top of Vitality Health's ${healthPct}%. That only applies to local flights you book for yourself, up to three return flights a year; flights for others get Vitality Health's part only. Type your receipts on the Inputs tab for the real figure.`;
  }
  /* Bookings paid with another bank's card get Vitality Health's part only
     (all.travel.vitality less what the Discovery card paid). */
  if (!receiptsFit) {
    const elsewhere = Math.max(0, total(m, anyKey(m, 'travel.vitality')) - Math.max(0, total(m, 'travel.vitality')));
    const hp = receipts ? Math.min(Number(tr.discount), Number(tr.baseFare) * healthPct / 100) / Number(tr.baseFare) : healthPct / 100;
    if (elsewhere > 0 && hp < 1) travelStays += yr(elsewhere / (1 - hp) * hp);
  }
  line('bank', 'travel.bank', 'Flight discount from the bank', travelBank, travelSource, travelDetail, ['travelHealthPct', 'travelMoneyPct'], { travel: true });

  // ── Kept whichever bank you use (listed, not counted) ────────────────
  /* Drive cash shows on statements as INSURECASH; paid into the Insure
     Funder Account it is doubled and never reaches a bank account. */
  const funder = r('driveFunderAccount') >= 1;
  const driveCash = total(m, 'insure.driveCash');
  const seen = m.lastSeen && m.lastSeen['insure.driveCash'];
  const fd = num(actual.fuelDriveCash) ? { annual: yr(Number(actual.fuelDriveCash)), source: 'entered' }
    : driveCash > 0 && !funder ? { annual: yr(driveCash), source: 'measured' }
      : { annual: yr(fuelDrive) * (funder ? 2 : 1), source: 'estimated' };
  const driveWhere = funder
    ? 'It is paid into your Insure Funder Account, where it is doubled. You can use that money for excesses, tyres, services and licences; taking it out as cash costs R2 of the account for every R1. Type what was paid in (from the Insure app) for the real figure.'
    : driveCash > 0 ? 'These are the INSURECASH payments on your statements.'
      : seen ? `No Drive cash on your statements since ${dayLabel(seen)}. If it now goes into the Insure Funder Account, set "Drive rewards paid into the Insure Funder Account" to Yes.` : '';
  line('stays', 'fuel.drive', 'Vitality Drive fuel rewards', fd.annual, fd.source,
    `${r('fuelDrivePct')}% back${funder ? ', doubled,' : ''} on up to ${fmtR(r('fuelCap'))} a month of fuel per driver at bp and Shell (${fmtR(yr(fuelCounted))} a year of your fuel counts). ${driveWhere} Discovery Insure pays this to anyone with any Discovery Bank account, even the free one, so keep that free account if you move your banking.`,
    ['driveFunderAccount', 'fuelDrivePct', 'fuelCap', 'fuelDrivers'], { funder });
  /* Gym: the current monthly price, so a month before the discount started
     does not inflate the saving. */
  const gymKey = anyKey(m, 'gym');
  const gym = m.figures[gymKey];
  const gymLatest = gym ? gym.perMonth[Object.keys(gym.perMonth).sort().pop()] : 0;
  line('stays', 'gym', 'Gym fees (after the Vitality discount)', yr(total(m, gymKey)), 'measured', `Virgin Active or Planet Fitness. Vitality Health gives you ${fmtPct(r('gymDiscountPct'))} off (36 visits a year), with or without the bank.`);
  line('stays', 'healthyFood.health', 'HealthyFood Miles from Vitality Health', yr(hf.stays), hf.source, 'Vitality Health pays these whether or not you bank with Discovery (each Mile counted at 10c).', ['healthyFoodHealthPct', 'healthyFoodSecondaryPct', 'healthyFoodHealthCap']);
  line('stays', 'healthyCare.health', 'HealthyCare Miles from Vitality Health', yr(hc.stays), hc.source, 'Vitality Health pays these whether or not you bank with Discovery (each Mile counted at 10c).', ['healthyCareHealthPct', 'healthyCareCap']);
  line('stays', 'travel.health', 'Flight discount from Vitality Health', travelStays, travelSource, 'The part of the flight discount you keep without the bank.', ['travelHealthPct']);
  if (sv) {
    line('stays', 'activeRewards', 'Other Vitality Health rewards', atValue('activeRewards', FACE_VALUE) + atValue('health.other', FACE_VALUE), 'statement', 'Rewards for sleep, health goals and other Vitality Health activities.');
    line('stays', 'activeRewards.basic', 'Basic exercise rewards without the bank', r('activeRewardsWithoutBank') * 12, 'estimated', 'What Vitality Health would still give you for your weekly exercise goals without the gameboard (your guess).', ['activeRewardsWithoutBank']);
  }
  if (!watchMonthly) line('stays', 'benefit.appleWatch', 'Apple Watch charges', yr(total(m, 'benefit.appleWatch')), 'measured', 'You pay nothing in a month you meet your exercise goals. Type the watch\'s full monthly payment to count it as a bank benefit; it needs the Discovery Bank Suite with a credit card.', ['appleWatchMonthly']);

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
  const setup = setupOf(m, settings, milesSummary, opts);
  const avail = availableFor(settings, setup.products, setup.vitality);
  const suggestions = suggestBenefits(m, milesSummary, settings);
  const benefits = {};
  const benefitOf = {};
  for (const b of BENEFITS) {
    const sug = suggestions[b.id] || { suggested: 'full', why: '' };
    const a = avail.benefits[b.id];
    benefits[b.id] = { level: levelOf(settings, b.id, sug), suggested: sug.suggested, why: sug.why, full: 0, counted: 0, available: a.available, reason: a.reason, note: a.note };
    for (const k of b.lineKeys) benefitOf[k] = b.id;
  }
  for (const l of lines) {
    const id = benefitOf[l.key];
    if (!id || l.group === 'cost') continue;
    const open = avail.lines.has(l.key);
    const w = open ? WEIGHT[benefits[id].level] : 0;
    l.full = l.annual;
    l.weight = w;
    l.benefit = id;
    l.available = open;
    l.annual = w === 0 ? 0 : l.full * w;
    /* worth at full use counts only what this setup can earn */
    if (Number.isFinite(l.full) && open) { benefits[id].full += l.full; benefits[id].counted += l.annual; }
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
  const alternatives = ALTERNATIVES.map(a => altResult(a, settings, st, m, monthly, n, net, cautiousNet));
  const best = alternatives.slice().sort((x, y) => y.net - x.net)[0] || null;
  const chosen = alternatives.find(a => a.id === settings.compareWith) || best;

  const downgrade = downgradeResult({ settings, st, lines, r, R, m, yr, monthly, avgSpend, net, watchMonthly });

  const bill = discoveryBill(m, yr, settings.bill || {});
  const gd = Math.min(95, r('gymDiscountPct')) / 100;
  const gymSavingFull = gd > 0 ? (gymLatest * 12 / (1 - gd)) * gd : 0;
  const gymOpen = avail.lines.has('gym');
  const gymWeight = gymOpen ? WEIGHT[benefits.gym.level] : 0;
  benefits.gym.full = gymOpen ? gymSavingFull : 0;
  benefits.gym.counted = gymWeight === 0 ? 0 : gymSavingFull * gymWeight;
  const vitality = {
    premium: bill.vitalityMonthly !== null ? bill.vitalityMonthly * 12 : null,
    gymSaving: benefits.gym.counted,
    gymSavingFull,
    rewards: sumKeysOf(lines, ['healthyFood.health', 'healthyCare.health', 'travel.health', 'activeRewards', 'activeRewards.basic']),
  };
  vitality.value = vitality.gymSaving + vitality.rewards;

  return {
    window: { from: m.from, to: m.to, months: m.months.length, dataMonths: n, rows: m.rowsSeen },
    vitality,
    milesStatement: sv ? { from: sv.from, to: sv.to, covered: sv.covered, rows: sv.ms.rows, mileValue, spentValue } : null,
    mileValue,
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
  };
}

/* Another bank over the same months: its fees, a flat rate on card spend
   (capped per month), and its partner deals at shops you already use. A
   partner deal with no published rate earns nothing here; `breakEven` is
   the partner rate at which that bank would match Discovery. */
function altResult(a, settings, st, m, monthly, n, net, cautiousNet) {
  const rt = k => rate(settings, `alt.${a.id}.${k}`, st);
  const fees = rt('fee') * 12;
  const backPct = rt('backPct');
  const capM = rt('capMonthly');
  const scale = 12 / (monthly.length || 1);
  let flat = 0, partnerBase = 0, partnerRewards = 0;
  const parts = (a.partners || []).map((p, i) => {
    const key = `alt.${a.id}.partner${i}`;
    const set = settings.rates && num(settings.rates[key]);
    const pct = set ? Number(settings.rates[key]) : p.pct;
    let base = 0;
    for (const { ym, spend } of monthly) {
      let s = p.keys.reduce((t, k) => t + Math.max(0, inMonth(m, k, ym)), 0);
      if (p.capMonthly) s = Math.min(s, p.capMonthly);
      if (p.shareOfSpend) s = Math.min(s, spend * p.shareOfSpend / 100);
      base += s;
    }
    return { key, label: p.label, pct, known: num(pct), base: base * scale, capMonthly: p.capMonthly };
  });
  for (const { spend } of monthly) {
    const f = spend * backPct / 100;
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
    id: a.id, name: a.name, fees, rewards, backPct, net: altNet, gainIfSwitch: altNet - net,
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
   Vitality together; known parts (per month, from settings.bill) are split
   out of the LATEST month's debit and the remainder is named as such. */
function discoveryBill(m, yr, known) {
  const items = [];
  const push = (key, label, annual, seen, note) => items.push({ key, label, annual, seen, note });
  const debit = m.figures['product.medical'];
  let vitalityMonthly = null;
  if (debit) {
    const latestYm = Object.keys(debit.perMonth).sort().pop();
    const latest = debit.perMonth[latestYm];
    const med = num(known.medical) ? Number(known.medical) : null;
    const gap = num(known.gap) ? Number(known.gap) : 0;
    push('product.medical', 'Discovery Health debit order', -yr(debit.total), true,
      `${fmtR(latest)} in ${latestYm}` + (med !== null ? ` = ${fmtR(med)} medical aid${gap ? ` + ${fmtR(gap)} gap cover` : ''} + ${fmtR(latest - med - gap)} Vitality and other (from the amounts you typed)` : '. Type your medical aid and gap cover amounts on the Inputs tab to see what it pays for.'));
    if (med !== null) vitalityMonthly = Math.max(0, latest - med - gap);
  } else push('product.medical', 'Discovery Health debit order', 0, false);
  const add = (key, label, sign) => push(key, label, sign * yr(total(m, key)), !!m.figures[key]);
  add('product.gap', 'Gap cover (paid separately)', -1);
  add('product.insure', 'Discovery Insure premiums', -1);
  add('product.life', 'Discovery Life premiums', -1);
  add('product.medicalBack', 'Claims paid back by Discovery Health', 1);
  add('product.gapClaim', 'Gap cover claims paid', 1);
  add('product.insureClaim', 'Discovery Insure claims paid', 1);
  return { items, net: items.reduce((s, i) => s + i.annual, 0), vitalityMonthly };
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
