'use strict';
const assert = require('node:assert');
const { buildStatement, cappedMonthly, monthMiles, watchInstalment } = require('../src/model');
const { rate, bandPct, BANDS, DIAMOND, ALTERNATIVES } = require('../src/rates');
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg || ''} ${a} != ${b}`);

/* A measured window built by hand: two months. */
const fig = perMonth => ({ total: Object.values(perMonth).reduce((a, b) => a + b, 0), count: 1, perMonth });
const m = {
  from: '2026-08', to: '2026-09', months: ['2026-08', '2026-09'], rowsSeen: 40,
  figures: {
    'fee.account': fig({ '2026-08': 430, '2026-09': 430 }),
    'fee.vitalityMoney': fig({ '2026-08': 98, '2026-09': 98 }),
    'spend.card': fig({ '2026-08': 10000, '2026-09': 30000 }),
    'shop.checkers': fig({ '2026-08': 1000, '2026-09': 16000 }),
    'shop.woolworths': fig({ '2026-08': 2000, '2026-09': 2000 }),
    'shop.clicks': fig({ '2026-08': 500, '2026-09': 2000 }),
    'fuel.bp': fig({ '2026-08': 2000, '2026-09': 1000 }),
    'interest.boost': fig({ '2026-09': 50 }),
    'travel.vitality': fig({ '2026-09': 3000 }),
    'gym': fig({ '2026-08': 400, '2026-09': 400 }),
    'fee.fx': fig({ '2026-09': 20 }),
    'product.medical': fig({ '2026-08': 6600, '2026-09': 6600 }),
  },
};
/* Pinned rates so the test checks the arithmetic, not this year's tables. */
const rates = {
  mileValue: 0.1, milesRandPerMile: 15, milesThreshold: 25000, milesAboveThreshold: 100, milesPhysical: 200, virtualSharePct: 100,
  healthyFoodShare: 50, healthyFoodMoneyCap: 2500, healthyFoodHealthPct: 25, healthyFoodSecondaryPct: 10, healthyFoodHealthCap: 5000, healthyMinSpend: 200,
  healthyCareShare: 20, healthyCareHealthPct: 25, healthyCareCap: 4000,
  fuelDrivePct: 5, fuelCap: 1500, fuelDrivers: 1, fuelWithoutBankPct: 0,
  travelHealthPct: 25, gymDiscountPct: 75,
};
const settings = { status: { money: 'Diamond', health: 'Bronze', drive: 'Bronze' }, rates, actualMiles: {}, compareWith: 'gotyme' };

// caps apply month by month
assert.strictEqual(cappedMonthly(m, ['shop.woolworths'], 0.5, 600), 1200);
assert.strictEqual(cappedMonthly(m, ['shop.checkers'], 0.5, 0), 8500, 'cap 0 = uncapped');

// Miles: tiered on the virtual card, physical capped at the threshold
const r = k => rate({ rates }, k, settings.status);
near(monthMiles(30000, r), 25000 / 15 + 5000 / 100);
near(monthMiles(30000, k => (k === 'virtualSharePct' ? 50 : r(k))), 15000 / 15 + 15000 / 200);
assert.strictEqual(monthMiles(-50, r), 0);

// Money bands: nothing under R3 150, top band from R29 000
assert.strictEqual(bandPct(BANDS, DIAMOND.healthyFood, 3149), 0);
assert.strictEqual(bandPct(BANDS, DIAMOND.healthyFood, 3150), 7.5);
assert.strictEqual(bandPct(BANDS, DIAMOND.healthyFood, 40000), 25);
assert.strictEqual(rate({ rates: {} }, 'fuelMoneyPct', { money: 'Diamond' }, { spend: 30000 }), 15);
assert.ok(rate({ rates: {} }, 'fuelMoneyPct', { money: 'Gold' }, { spend: 30000 }) < 15, 'Gold earns less than Diamond (its own table since rates.js loads every status)');
assert.strictEqual(rate({ rates: {} }, 'fuelDrivePct', { drive: 'Bronze' }), 5, 'Classic plan Bronze');

const s = buildStatement(m, settings);
const L = k => s.lines.find(l => l.key === k);
// two months → annual = ×6
assert.strictEqual(L('fee.account').annual, 5160);
assert.strictEqual(s.cost, 5160 + 98 * 12);
near(L('miles.card').annual, (10000 / 15 + (25000 / 15 + 5000 / 100)) * 0.1 * 6, 'miles');

// HealthyFood: Checkers is primary (17 000 > 4 000). Money boost on Checkers only, capped 2 500:
// Aug: q=500 × 10% (band for R10 000) = 50;  Sep: q=8 000 → 2 500 × 25% (R30 000) = 625
near(L('miles.healthyFood').annual, (50 + 625) * 6, 'hf money');
// Health: Aug 500×25% + Woolies 1 000×10% = 225;  Sep min(8 000, 5 000)×25% = 1 250, Woolies gets no headroom
near(L('healthyFood.health').annual, (225 + 1250) * 6, 'hf health');
assert.strictEqual(L('healthyFood.health').group, 'stays');

// HealthyCare: Aug 500×20% = 100 < R200 minimum → 0; Sep 400 × 25% = 100
near(L('miles.healthyCare').annual, 100 * 6, 'hc');

// fuel: capped at 1 500 a month; Drive 5%, Money 7% (R10 000 band) in Aug, 15% in Sep
near(L('fuel.drive').annual, (1500 + 1000) * 0.05 * 6, 'drive');
near(L('fuel.money').annual, (1500 * 0.07 + 1000 * 0.15) * 6, 'fuel money');

assert.strictEqual(L('interest.boost').annual, 300);

// travel estimate: avg spend 20 000 → local Money band 27,5%; total 52,5%; base = 3 000 / 0,475
near(L('travel.bank').annual, (3000 / 0.475) * 0.275 * 6, 'travel est');
assert.strictEqual(L('travel.bank').source, 'estimated');

// travel from receipts: the bank's share is what is left after Health's 25% of base
const sT = buildStatement(m, { ...settings, travel: { discount: 6000, baseFare: 16000 } });
const tl = sT.lines.find(l => l.key === 'travel.bank');
near(tl.annual, (6000 - 16000 * 0.25) * 6, 'travel entered');
assert.strictEqual(tl.source, 'entered');

// gym and fx are listed, never counted
assert.strictEqual(L('gym').group, 'stays');
assert.strictEqual(L('fee.fx').group, 'elsewhere');
near(s.net, s.value - s.cost);

// entered Miles replace estimates; an entered HealthyFood total is split in the estimated proportion
const sE = buildStatement(m, { ...settings, actualMiles: { card: 1000, healthyFood: 10000, fuelDriveCash: 120 } });
const E = k => sE.lines.find(l => l.key === k);
near(E('miles.card').annual, 1000 * 0.1 * 6);
assert.strictEqual(E('miles.card').source, 'entered');
near(E('miles.healthyFood').annual + E('healthyFood.health').annual, 1000 * 6, 'split keeps the total');
near(E('miles.healthyFood').annual / (1000 * 6), 675 / (675 + 1475), 'split proportion');
near(E('fuel.drive').annual, 720);
assert.strictEqual(sE.actualStale, null, 'no period: typed before periods were stamped, still used');

// entered Miles count only for the window they were typed for
const typed = { card: 1000, healthyFood: 10000, fuelDriveCash: 120 };
const sEnow = buildStatement(m, { ...settings, actualMiles: { ...typed, period: '2026-08..2026-09' } });
assert.strictEqual(sEnow.lines.find(l => l.key === 'miles.card').source, 'entered');
assert.strictEqual(sEnow.actualStale, null);
const sEold = buildStatement(m, { ...settings, actualMiles: { ...typed, period: '2025-08..2025-09' } });
const Eo = k => sEold.lines.find(l => l.key === k);
assert.notStrictEqual(Eo('miles.card').source, 'entered', 'another window: base Miles back to the estimate');
assert.notStrictEqual(Eo('miles.healthyFood').source, 'entered');
assert.notStrictEqual(Eo('fuel.drive').source, 'entered');
near(Eo('miles.card').annual, L('miles.card').annual, 'same as typing nothing');
assert.strictEqual(sEold.actualStale, '2025-08..2025-09');

// alternatives: switching gain = their net − Discovery's net
const go = s.alternatives.find(a => a.id === 'gotyme');
near(go.gainIfSwitch, 0 - s.net);
assert.strictEqual(s.chosen.id, 'gotyme');
assert.strictEqual(s.verdict, go.gainIfSwitch > 0 ? 'switch' : 'stay');
const sb = buildStatement(m, { ...settings, rates: { ...rates, 'alt.capitec.fee': 0, 'alt.capitec.backPct': 2 }, compareWith: 'capitec' });
near(sb.chosen.rewards, sb.cardSpend * 0.02);
assert.ok(ALTERNATIVES.every(a => a.source), 'every bank names its source');

// Discovery bill: premiums negative
assert.strictEqual(s.bill.items.find(i => i.key === 'product.medical').annual, -6600 * 12);
assert.strictEqual(s.bill.items.find(i => i.key === 'product.gap').seen, false);

// overrides: blank falls back to the default
assert.strictEqual(rate({ rates: { healthyFoodShare: '' } }, 'healthyFoodShare', {}), 25);
assert.strictEqual(rate({ rates: { healthyFoodShare: '45' } }, 'healthyFoodShare', {}), 45);
assert.strictEqual(rate({}, 'no.such.rate', {}), 0);
// signs: costs and money paid point down, income up
assert.strictEqual(L('fee.account').sign, -1);
assert.strictEqual(L('gym').sign, -1);
assert.strictEqual(L('interest.earned').sign, 1);
assert.strictEqual(L('miles.card').sign, 1);
// Vitality Drive cash: measured INSURECASH wins over the estimate; the Funder Account doubles the estimate
const mD = { ...m, figures: { ...m.figures, 'insure.driveCash': fig({ '2026-09': 75 }) }, lastSeen: { 'insure.driveCash': '2026-09-12' } };
const D = (st, k) => st.lines.find(l => l.key === k);
assert.strictEqual(D(buildStatement(mD, settings), 'fuel.drive').annual, 450);
assert.strictEqual(D(buildStatement(mD, settings), 'fuel.drive').source, 'measured');
const fund = buildStatement(m, { ...settings, rates: { ...rates, driveFunderAccount: 1 } });
near(D(fund, 'fuel.drive').annual, (1500 + 1000) * 0.05 * 6 * 2, 'funder doubles');
assert.ok(/Insure Funder Account/.test(D(fund, 'fuel.drive').detail));
const old = buildStatement({ ...m, lastSeen: { 'insure.driveCash': '2024-12-13' } }, settings);
assert.ok(/since 13 Dec 2024/.test(D(old, 'fuel.drive').detail), 'says when Drive cash was last seen');

// the Discovery Health debit: known parts split out of the latest month, the rest named
const mH = { ...m, figures: { ...m.figures, 'product.medical': fig({ '2026-08': 7000, '2026-09': 7500 }) } };
const sH = buildStatement(mH, { ...settings, bill: { medical: 6600, gap: 300 } });
assert.strictEqual(sH.bill.vitalityMonthly, 600);
assert.ok(/R 7 500 in Sep 2026: R 6 600 medical aid, R 300 gap cover and R 600 Vitality and other/.test(sH.bill.items[0].note), sH.bill.items[0].note);
assert.strictEqual(buildStatement(mH, settings).bill.vitalityMonthly, null, 'no split without the medical figure');

// Vitality Health: premium vs what it pays (gym at 75% off: paid 4 800 a year → saved 14 400)
assert.strictEqual(sH.vitality.premium, 7200);
near(sH.vitality.gymSaving, 4800 / 0.25 * 0.75);
near(sH.vitality.value, sH.vitality.gymSaving + sH.vitality.rewards);
// ── audit fixes ────────────────────────────────────────────────────────
// Drive fuel rewards need any Discovery account (the free one counts): kept, not lost
assert.strictEqual(L('fuel.drive').group, 'stays');
assert.ok(!s.lines.some(l => l.group === 'bank' && l.key === 'fuel.drive'));

// annualise over months that hold data: 2 months of data in a 12-month window still ×6
const m12 = { ...m, from: '2025-10', months: Array.from({ length: 12 }, (_, i) => { const d = new Date(2025, 9 + i, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }), dataMonths: ['2026-08', '2026-09'] };
const s12 = buildStatement(m12, settings);
assert.strictEqual(s12.lines.find(l => l.key === 'fee.account').annual, 5160);
near(s12.alternatives.find(a => a.id === 'gotyme').gainIfSwitch, -s12.net);

// a Miles statement: coverage is the months it has rows in; swipes become card spend;
// the gameboard counts less the basic rewards; Vitality Health Miles at face, uplift on the bank side
const ms = {
  months: ['2026-09'], first: '2026-09-01', last: '2026-09-30', rows: 10, spentMiles: 10000, spentRand: 1500,
  swipes: { '2026-09': 20000 },
  figures: { base: 1000, 'money.healthyFood': 3000, 'health.healthyFood': 4000, gameboard: 2000, activeRewards: 500, 'money.partners': 0, insure: 0 },
};
const { mileValue: _pinned, ...ratesNoMile } = rates;
const settingsS = { ...settings, rates: ratesNoMile };
const sS = buildStatement(m, settingsS, ms);
const S = k => sS.lines.find(l => l.key === k);
assert.strictEqual(sS.milesStatement.covered, 1, 'one month of rows is one month, not the span');
near(sS.mileValue, 0.15);
near(S('miles.card').annual, 1000 * 0.15 * 12);
assert.strictEqual(sS.cardSpendSource, 'statement');
near(sS.cardSpend, 20000 * 12);
near(S('gameboard').annual, 2000 * 0.15 * 12 - 100 * 12, 'gameboard less R100/month basic');
assert.strictEqual(S('gameboard').group, 'bank');
near(S('healthyFood.health').annual, 4000 * 0.1 * 12, 'Health Miles at face value');
near(S('miles.uplift').annual, (4000 + 500) * 0.05 * 12, 'the bank adds 5c a Mile on Health Miles');
near(S('activeRewards').annual, 500 * 0.1 * 12);

// cautious view: Miles at face, no uplift, no gameboard, no flights
const bankMiles = ['miles.card', 'miles.healthyFood', 'miles.partners'].reduce((t, k) => t + S(k).annual, 0);
const plain = sS.lines.filter(l => l.group === 'bank' && !l.miles && !l.uplift && !l.travel && l.key !== 'gameboard').reduce((t, l) => t + l.annual, 0);
near(sS.cautious.value, bankMiles * 0.1 / 0.15 + plain + S('miles.healthyCare').annual * (S('miles.healthyCare').miles ? 0.1 / 0.15 : 1));
assert.ok(sS.cautious.net < sS.net);

// partner deals: an unpublished rate earns nothing and the break-even closes the gap exactly
const absa = sS.alternatives.find(a => a.id === 'absaPremium');
assert.ok(absa.partners.length === 2 && absa.partners.every(p => !p.known));
assert.ok(absa.breakEven > 0);
const sAt = buildStatement(m, { ...settingsS, rates: { ...ratesNoMile, 'alt.absaPremium.partner0': absa.breakEven, 'alt.absaPremium.partner1': absa.breakEven } }, ms);
near(sAt.alternatives.find(a => a.id === 'absaPremium').gainIfSwitch, 0, 'at the break-even rate Absa ties');
// partner spend is capped at R3 000 and 20% of that month's card spend: Sep checkers 16 000 → min(3000, 4000)
near(absa.partners[0].base, (Math.min(16000 + 2000, 3000, 20000 * 0.2)) * 12);

// a flat-rate cap applies per month, not per year
const sCap = buildStatement(m, { ...settings, rates: { ...rates, 'alt.capitec.backPct': 10, 'alt.capitec.capMonthly': 500 } });
near(sCap.alternatives.find(a => a.id === 'capitec').rewards, (500 + 500) * 6, 'Aug 1 000 and Sep 3 000 both capped at 500');

// receipts typed for another period lend their rates, not their totals:
// 6 000 off 16 000 of base fares is 37,5% off, 12,5 points of it the bank's
// (Health's 25% of base is the rest). This window paid 3 000, so its fares
// were 3 000 / 0,625 = 4 800.
const sOld = buildStatement(m, { ...settings, travel: { discount: 6000, baseFare: 16000, period: '2024-10..2025-09' } });
const tOld = sOld.lines.find(l => l.key === 'travel.bank');
assert.strictEqual(tOld.source, 'estimated');
near(tOld.annual, 4800 * 0.125 * 6, 'receipt rates on this window');
near(sOld.lines.find(l => l.key === 'travel.health').annual, 4800 * 0.25 * 6, 'Health share at the receipt rate');
assert.ok(/Oct 2024/.test(tOld.detail), 'says which receipts it used');
const sNow = buildStatement(m, { ...settings, travel: { discount: 6000, baseFare: 16000, period: '2026-08..2026-09' } });
near(sNow.lines.find(l => l.key === 'travel.bank').annual, (6000 - 4000) * 6);

// gym saving uses the current monthly price
const mG = { ...m, figures: { ...m.figures, gym: fig({ '2026-08': 1000, '2026-09': 250 }) } };
near(buildStatement(mG, settings).vitality.gymSaving, 250 * 12 / 0.25 * 0.75);

// returned debit order fees sit with what any bank charges
const mP = { ...m, figures: { ...m.figures, 'fee.penalty': fig({ '2026-09': 15 }) } };
const sP = buildStatement(mP, settings);
assert.strictEqual(sP.lines.find(l => l.key === 'fee.penalty').group, 'elsewhere');
assert.strictEqual(sP.cost, s.cost);
// Apple Watch: the full instalment is the amount every missed-goal charge is a step of
near(watchInstalment([150, 225]), 300);
near(watchInstalment([300]), 300);
near(watchInstalment([225, 300]), 300);
assert.strictEqual(watchInstalment([100, 300]), null, 'there is no 25% step');
assert.strictEqual(watchInstalment([]), null);
const mW = { ...m, figures: { ...m.figures, 'benefit.appleWatch': fig({ "2026-08": 150, "2026-09": 225 }) } };
const sW = buildStatement(mW, settings);
const W = sW.lines.find(l => l.key === 'appleWatch');
assert.strictEqual(W.group, 'bank');
near(W.annual, 300 * 12 - (150 + 225) * 6 - 1199 / 2);
assert.ok(!sW.lines.some(l => l.key === 'benefit.appleWatch'), 'the charges are netted into the bank line');
assert.ok(s.lines.some(l => l.key === 'benefit.appleWatch' && l.group === 'stays'), 'no charges, no instalment: the charges line stays');
// downgrade to the Black Credit Card Account alone
const mD2 = { ...mW, figures: { ...mW.figures, 'payt.payments': fig({ '2026-08': 10, '2026-09': 14 }), 'interest.boost': fig({ '2026-09': 60 }) }, firstSeen: { 'benefit.appleWatch': '2025-01-09' } };
const rD = { ...rates, ccFee: 275, paytFee: 3, ccMilesRandPerMile: 20, savingsBoostPct: 1.5, ccSavingsBoostPct: 1, travelMoneyPct: 40, ccTravelMoneyPct: 27.5 };
const sD = buildStatement(mD2, { ...settings, rates: rD });
const dd = sD.downgrade;
near(dd.fees, 275 * 12);
near(dd.payt, 24 * 6 * 3, 'payments annualised × fee');
const ddL = k => sD.lines.find(l => l.key === k && l.group === 'bank').annual;
// base Miles: Aug 10 000 and Sep 30 000 → at R20 instead of R15 below the R25 000 threshold
const suiteMi = 10000 / 15 + 25000 / 15 + 5000 / 100, ccMi = 10000 / 20 + 25000 / 20 + 5000 / 100;
near(dd.changes.find(c => c.key === 'miles.card').delta, ddL('miles.card') * (ccMi / suiteMi - 1));
near(dd.changes.find(c => c.key === 'travel.bank').delta, ddL('travel.bank') * (27.5 / 40 - 1));
near(dd.changes.find(c => c.key === 'interest.boost').delta, -360 / 3, 'boost 1% instead of 1,5%');
near(dd.changes.find(c => c.key === 'appleWatch').delta, -ddL('appleWatch'));
near(dd.net, dd.value - dd.cost);
near(dd.gainIfDowngrade, dd.net - sD.net);
near(dd.gainAfterWatch, dd.net - (sD.net - ddL('appleWatch')));
assert.strictEqual(dd.watchEnds, '2027-01-09', 'to the day, 24 months after the activation');
// ── worth to you (benefits.js weights) ─────────────────────────────────
// every suggestion from this household's budget, and the statement's benefits map
const lv = st => Object.fromEntries(Object.entries(st.benefits).map(([k, v]) => [k, v.level]));
assert.deepStrictEqual(lv(s), { miles: 'full', healthyFood: 'full', healthyCare: 'full', fuel: 'full', flights: 'full', gameboard: 'half', appleWatch: 'none', interest: 'full', milesPlus: 'none', gym: 'full' });
for (const b of Object.values(s.benefits)) assert.ok(typeof b.why === 'string' && b.why.length > 10 && b.suggested === b.level);
near(s.benefits.fuel.full, L('fuel.money').full + L('fuel.drive').full);
near(s.benefits.fuel.counted, s.benefits.fuel.full, 'full counts in full');
assert.strictEqual(L('fuel.money').weight, 1);
assert.strictEqual(L('fuel.money').benefit, 'fuel');
assert.strictEqual(L('fee.account').weight, undefined, 'a cost carries no weight');
assert.strictEqual(L('interest.earned').weight, undefined, 'a line with no benefit is untouched');
// 'none' drops a benefit out of value, net and the cautious view; costs stay
const sNo = buildStatement(m, { ...settings, benefits: { fuel: 'none' } });
const No = k => sNo.lines.find(l => l.key === k);
assert.strictEqual(No('fuel.money').annual, 0);
near(No('fuel.money').full, L('fuel.money').annual, 'the whole value is kept as full');
assert.strictEqual(No('fuel.drive').annual, 0, 'Drive fuel too');
near(sNo.value, s.value - L('fuel.money').annual);
near(sNo.net, s.net - L('fuel.money').annual);
near(sNo.cautious.value, s.cautious.value - L('fuel.money').annual);
assert.strictEqual(sNo.cost, s.cost, 'costs are never weighted');
assert.strictEqual(sNo.benefits.fuel.level, 'none');
assert.strictEqual(sNo.benefits.fuel.suggested, 'full', 'the suggestion is still shown');
assert.strictEqual(sNo.benefits.fuel.counted, 0);
// 'half' halves it
const sHalf = buildStatement(m, { ...settings, benefits: { flights: 'half', healthyFood: 'half' } });
const Hf = k => sHalf.lines.find(l => l.key === k);
near(Hf('travel.bank').annual, L('travel.bank').annual / 2);
near(Hf('travel.health').annual, L('travel.health').annual / 2);
near(Hf('miles.healthyFood').annual, L('miles.healthyFood').annual / 2);
near(sHalf.value, s.value - L('travel.bank').annual / 2 - L('miles.healthyFood').annual / 2);
near(sHalf.vitality.rewards, s.vitality.rewards - L('travel.health').annual / 2 - L('healthyFood.health').annual / 2, 'Vitality rewards follow');
// nothing to Discovery Bank: every benefit 'none' leaves only the fees
const allNone = Object.fromEntries(Object.keys(s.benefits).map(k => [k, 'none']));
const sZero = buildStatement(m, { ...settings, benefits: allNone });
assert.strictEqual(sZero.value, 0);
near(sZero.net, -s.cost);
near(sZero.cautious.net, -s.cost);
assert.strictEqual(sZero.cost, s.cost);
// the gym saving is weighted; the whole saving is kept beside it
const sGym = buildStatement(m, { ...settings, benefits: { gym: 'half' } });
near(sGym.vitality.gymSavingFull, s.vitality.gymSaving);
near(sGym.vitality.gymSaving, s.vitality.gymSaving / 2);
near(sGym.vitality.value, sGym.vitality.gymSaving + sGym.vitality.rewards);
near(sGym.benefits.gym.counted, sGym.vitality.gymSaving);
assert.strictEqual(buildStatement(m, { ...settings, benefits: { gym: 'none' } }).vitality.gymSaving, 0);
// no gym payments: suggested none, so no gym saving
const { gym: _g, ...noGym } = m.figures;
const sNG = buildStatement({ ...m, figures: noGym }, settings);
assert.strictEqual(sNG.benefits.gym.suggested, 'none');
assert.strictEqual(sNG.vitality.gymSaving, 0);
// your own level beats the suggestion: Miles spent at face value suggest no Miles+
// uplift, but you can say you use it
const msFace = { ...ms, spentMiles: 10000, spentRand: 1000 };
const sUp = buildStatement(m, { ...settingsS, rates: { ...ratesNoMile, mileValue: 0.15 } }, msFace);
assert.strictEqual(sUp.benefits.milesPlus.suggested, 'none');
assert.strictEqual(sUp.lines.find(l => l.key === 'miles.uplift').annual, 0);
const sUp2 = buildStatement(m, { ...settingsS, rates: { ...ratesNoMile, mileValue: 0.15 }, benefits: { milesPlus: 'full' } }, msFace);
assert.strictEqual(sUp2.benefits.milesPlus.level, 'full');
near(sUp2.lines.find(l => l.key === 'miles.uplift').annual, (4000 + 500) * 0.05 * 12);
// the gameboard with a statement that has it is full; the basic rewards weigh with it
assert.strictEqual(sS.benefits.gameboard.level, 'full');
assert.strictEqual(sS.benefits.milesPlus.level, 'full', 'Miles spent at 15c beat face value');
const sGb = buildStatement(m, { ...settingsS, benefits: { gameboard: 'none' } }, ms);
['gameboard', 'activeRewards', 'activeRewards.basic'].forEach(k => assert.strictEqual(sGb.lines.find(l => l.key === k).annual, 0, k));
// the downgrade reads the weighted lines
const sDn = buildStatement(mD2, { ...settings, rates: rD, benefits: { appleWatch: 'none' } });
assert.ok(!sDn.downgrade.changes.some(c => c.key === 'appleWatch'), 'no watch value, nothing to lose');
assert.strictEqual(sD.benefits.appleWatch.suggested, 'full', 'watch payments seen');

// A Vitality Health member who banks elsewhere: Virgin Active and Woolworths on
// another bank's card count for Vitality Health, not for the bank's extras
const mElse = {
  from: '2026-08', to: '2026-09', months: ['2026-08', '2026-09'], rowsSeen: 12,
  figures: {
    'all.gym': fig({ '2026-08': 500, '2026-09': 500 }),
    'all.shop.woolworths': fig({ '2026-08': 3000, '2026-09': 3000 }),
    'all.travel.vitality': fig({ '2026-09': 2000 }),
    'product.medical': fig({ '2026-08': 5000, '2026-09': 5000 }),
  },
};
const sElse = buildStatement(mElse, settings);
const El = k => sElse.lines.find(l => l.key === k);
assert.strictEqual(sElse.benefits.gym.suggested, 'full');
assert.strictEqual(sElse.benefits.healthyFood.suggested, 'full');
assert.strictEqual(sElse.benefits.flights.suggested, 'full');
near(sElse.vitality.gymSaving, 500 * 12 / 0.25 * 0.75, 'gym saving from another bank\'s card');
near(El('gym').annual, 1000 * 6);
// Woolworths alone is the main HealthyFood shop: 3 000 × 50% = 1 500 × 25% a month, two months
near(El('healthyFood.health').annual, 1500 * 0.25 * 2 * 6, 'Vitality Health pays HealthyFood');
// flights paid with another card: Vitality Health's 25% only, on a 2 000 / 0,75 base fare
near(El('travel.health').annual, (2000 / 0.75) * 0.25 * 6);
assert.strictEqual(El('miles.healthyFood').annual, 0, 'no bank extras without the Discovery card');
assert.strictEqual(El('travel.bank').annual, 0);
assert.strictEqual(El('miles.card').annual, 0);
assert.strictEqual(sElse.value, 0, 'nothing to lose by leaving a bank you do not use');
// ── what the setup unlocks ─────────────────────────────────────────────
// no Vitality Health: the gym saving and Health's lines count nothing, their value kept as full
const sNoH = buildStatement(m, { ...settings, vitality: { health: false } });
const NH = k => sNoH.lines.find(l => l.key === k);
assert.strictEqual(sNoH.vitality.gymSaving, 0);
near(sNoH.vitality.gymSavingFull, s.vitality.gymSaving);
['healthyFood.health', 'healthyCare.health', 'travel.health'].forEach(k => {
  assert.strictEqual(NH(k).annual, 0, k);
  assert.strictEqual(NH(k).available, false, k);
  near(NH(k).full, L(k).annual, k + ' keeps its value');
});
assert.strictEqual(sNoH.benefits.gym.available, false);
assert.ok(/Vitality Health/.test(sNoH.benefits.gym.reason));
near(sNoH.value, s.value, 'the bank\'s side is unchanged');
assert.strictEqual(sNoH.vitality.rewards, 0);
// even a level of full cannot count what the setup cannot earn
assert.strictEqual(buildStatement(m, { ...settings, vitality: { health: false }, benefits: { gym: 'full' } }).vitality.gymSaving, 0);
// no Vitality Drive: Drive's fuel goes, the bank's fuel extra stays
const sNoD = buildStatement(m, { ...settings, vitality: { drive: false } });
assert.strictEqual(sNoD.lines.find(l => l.key === 'fuel.drive').annual, 0);
near(sNoD.lines.find(l => l.key === 'fuel.money').annual, L('fuel.money').annual);
assert.ok(sNoD.benefits.fuel.available && /Vitality Drive/.test(sNoD.benefits.fuel.note));
// a transaction account only, without Vitality Money: no Vitality Money extras, costs unchanged
const sTx = buildStatement(m, { ...settings, bankKind: 'transaction', vitality: { money: false } });
['miles.card', 'miles.healthyFood', 'miles.healthyCare', 'fuel.money', 'travel.bank', 'interest.boost'].forEach(k => assert.strictEqual(sTx.lines.find(l => l.key === k).annual, 0, k));
assert.strictEqual(sTx.value, 0);
assert.strictEqual(sTx.cost, s.cost);
near(sTx.lines.find(l => l.key === 'healthyFood.health').annual, L('healthyFood.health').annual, 'Vitality Health still pays');
// a transaction account with Vitality Money: Miles and the boost, none of the credit card's extras
const sTx2 = buildStatement(m, { ...settings, bankKind: 'transaction', vitality: { money: true } });
near(sTx2.lines.find(l => l.key === 'miles.card').annual, L('miles.card').annual);
assert.strictEqual(sTx2.lines.find(l => l.key === 'miles.healthyFood').annual, 0);
// savings only: no Miles
const sSav = buildStatement(m, { ...settings, bankKind: 'savings', vitality: { money: true } });
assert.strictEqual(sSav.lines.find(l => l.key === 'miles.card').annual, 0);
assert.strictEqual(sSav.benefits.miles.available, false);
// the Apple Watch needs a Suite
const sWcard = buildStatement(mW, { ...settings, bankKind: 'card' });
assert.strictEqual(sWcard.lines.find(l => l.key === 'appleWatch').annual, 0);
assert.strictEqual(sWcard.benefits.appleWatch.available, false);
assert.ok(sW.lines.find(l => l.key === 'appleWatch').available, 'a Suite has it');
// Vitality Money unanswered: read from the budget (this household pays the premium)
assert.strictEqual(s.setup.vitality.money, true);
const { 'fee.vitalityMoney': _vm, 'interest.boost': _ib, ...noMoney } = m.figures;
const sNM = buildStatement({ ...m, figures: noMoney }, settings);
assert.strictEqual(sNM.setup.vitality.money, false, 'no premium, no boost, no statement: no Vitality Money');
assert.strictEqual(sNM.lines.find(l => l.key === 'miles.card').annual, 0);
// resolved maps passed in win over settings
const sOpt = buildStatement(m, settings, null, { products: { bank: true, health: true, insure: true }, vitality: { money: true, health: false, drive: true } });
assert.strictEqual(sOpt.vitality.gymSaving, 0);
// ── the person's own product in the detail texts and the downgrade ─────
const det = (st, k) => st.lines.find(l => l.key === k).detail;
assert.ok(/Black Suite's published account fee is R 435 a month/.test(det(s, 'fee.account')), det(s, 'fee.account'));
const sGold = buildStatement(m, { ...settings, suite: 'Gold', status: { ...settings.status, money: 'Gold' } });
assert.ok(/Gold Suite's published account fee is R 115 a month/.test(det(sGold, 'fee.account')), det(sGold, 'fee.account'));
assert.ok(/R 66 a month/.test(det(sGold, 'fee.vitalityMoney')));
assert.ok(/up to 11% at your Gold status/.test(det(sGold, 'miles.healthyFood')), det(sGold, 'miles.healthyFood'));
assert.ok(/up to 25% at your Diamond status/.test(det(s, 'miles.healthyFood')));
assert.ok(/up to 15% at your Diamond status/.test(det(s, 'fuel.money')));
assert.ok(/1,5% more on savings at your Diamond status/.test(det(s, 'interest.boost')));
assert.ok(/1% more on savings at your Gold status/.test(det(sGold, 'interest.boost')));
assert.ok(!s.lines.some(l => /R435|R101|R69\b/.test(l.detail)), 'no Black-only fee figures left');
const sTxFee = buildStatement(m, { ...settings, bankKind: 'transaction' });
assert.ok(!/credit card fee is/.test(det(sTxFee, 'fee.facility')), 'no card, no card fee figure');
// the downgrade: none when there is no Credit Card Account to move to, or no Suite to leave
assert.strictEqual(buildStatement(m, { ...settings, suite: 'Purple' }).downgrade, null, 'Purple has no Credit Card Account');
['card', 'transaction', 'savings'].forEach(k => assert.strictEqual(buildStatement(m, { ...settings, bankKind: k }).downgrade, null, k));
assert.ok(s.downgrade && s.downgrade.label === 'Black Credit Card Account');
// Black: HealthyFood, HealthyCare and fuel are the same on the card
assert.ok(!s.downgrade.changes.some(c => ['miles.healthyFood', 'miles.healthyCare', 'fuel.money'].includes(c.key)));
// Gold: the Gold Credit Card Account gets no HealthyCare from the bank
const gold = { ...settings, suite: 'Gold', rates: { ...rates } };
const sGd = buildStatement(m, gold);
const hcChange = sGd.downgrade.changes.find(c => c.key === 'miles.healthyCare');
assert.ok(sGd.lines.find(l => l.key === 'miles.healthyCare').annual > 0, 'the Gold Suite has it');
assert.ok(hcChange, 'losing it is a change');
near(hcChange.delta, -sGd.lines.find(l => l.key === 'miles.healthyCare').annual);
assert.ok(/No extra HealthyCare from the bank on the Gold Credit Card Account/.test(hcChange.label));
assert.strictEqual(sGd.downgrade.label, 'Gold Credit Card Account');
// a transaction account's debit card is the card when there is no Discovery credit card
{
  const mT = { ...m, cardAccounts: [], figures: { ...m.figures, 'spend.card': undefined, 'spend.debit': fig({ '2026-08': 8000, '2026-09': 8000 }) } };
  delete mT.figures['spend.card'];
  const sT = buildStatement(mT, { rates, status: { money: 'Diamond' }, bankKind: 'transaction', vitality: { money: true } }, null, { products: { bank: true }, vitality: { money: true, health: false, drive: false } });
  assert.strictEqual(sT.cardSpendSource, 'debit');
  near(sT.cardSpend, 96000, 'debit spend becomes card spend');
  const withCard = buildStatement({ ...m, cardAccounts: ['Card'], figures: { ...m.figures, 'spend.debit': fig({ '2026-08': 99999 }) } }, { rates, status: { money: 'Diamond' } }, null);
  assert.strictEqual(withCard.cardSpendSource, 'transactions', 'a credit card holder keeps credit card spend');
}
// how you spend your Miles sets their worth without a statement. The
// discount is PER ACTIVE VITALITY PROGRAMME (5% at Discovery Miles partners,
// 10% on Ð-Day) and needs Vitality Money.
{
  const base = { rates: { ...rates }, status: { money: 'Diamond', health: 'Diamond' } };
  delete base.rates.mileValue;
  const face = buildStatement(m, base, null);
  assert.strictEqual(face.mileSource, 'face');
  near(face.mileValue, 0.1);
  const dday = buildStatement(m, { ...base, milesUse: 'dday' }, null);
  assert.strictEqual(dday.mileSource, 'use');
  near(dday.mileValue, 0.1 / 0.7, 'Ð-Day, three programmes: 30% off');
  near(buildStatement(m, { ...base, milesUse: 'partners' }, null).mileValue, 0.1 / 0.85, 'partners, three programmes: 15% off');
  near(buildStatement(m, { ...base, milesUse: 'utilities' }, null).mileValue, 0.1 / 0.85, 'prepaid electricity and data: the everyday discount, not Ð-Day');
  const lineOf = (st, k) => st.lines.find(l => l.key === k);
  near(lineOf(dday, 'miles.card').full, lineOf(face, 'miles.card').full / 0.7, 'bank Miles worth more');
  const hm = lineOf(dday, 'healthyFood.health').full + lineOf(dday, 'healthyCare.health').full;
  near(lineOf(dday, 'miles.uplift').full, hm * (1 / 0.7 - 1), 'Vitality Health Miles uplift');
  assert.strictEqual(dday.benefits.milesPlus.suggested, 'full');
  assert.ok(!lineOf(face, 'miles.uplift'), 'no uplift at face value');
  assert.strictEqual(buildStatement(m, { ...base, milesUse: 'dday', rates: { ...base.rates, mileValue: 0.2 } }, null).mileSource, 'entered', 'a typed value wins');
  // the number of programmes sets the discount
  const withV = (v, use) => buildStatement(m, { ...base, milesUse: use, vitality: v }, null, { products: { bank: true, health: true, insure: true }, vitality: v });
  near(withV({ money: true, health: false, drive: false }, 'dday').mileValue, 0.1 / 0.9, 'Ð-Day, one programme: 10% off');
  near(withV({ money: true, health: true, drive: false }, 'dday').mileValue, 0.1 / 0.8, 'Ð-Day, two programmes: 20% off');
  near(withV({ money: true, health: false, drive: false }, 'partners').mileValue, 0.1 / 0.95, 'partners, one programme: 5% off');
  near(withV({ money: true, health: true, drive: false }, 'utilities').mileValue, 0.1 / 0.9, 'prepaid, two programmes: 10% off');
  const noMoney = withV({ money: false, health: true, drive: true }, 'dday');
  assert.strictEqual(noMoney.mileSource, 'face', 'without Vitality Money there is no partner discount');
  near(noMoney.mileValue, 0.1);
  // the wording names Discovery Miles partners (Miles+ is where you earn)
  const up = lineOf(withV({ money: true, health: true, drive: false }, 'partners'), 'miles.uplift');
  assert.ok(/Discovery Miles partners/.test(up.detail) && !/Miles\+/.test(up.detail), up.detail);
  assert.ok(/two Vitality programmes/.test(up.detail) && /10%/.test(up.detail), up.detail);
}
// Blocker: the no-statement uplift counts only the Vitality Health Miles as
// COUNTED (weighted, available), never a line set "Not for me" or one the
// setup cannot earn
{
  const base = { rates: { ...rates }, status: { money: 'Diamond', health: 'Diamond' }, milesUse: 'dday' };
  delete base.rates.mileValue;
  const U = st => st.lines.find(l => l.key === 'miles.uplift');
  const notForMe = buildStatement(m, { ...base, benefits: { healthyFood: 'none', healthyCare: 'none' } }, null);
  near(U(notForMe).full, 0, 'HealthyFood and HealthyCare set to Not for me: no uplift');
  assert.strictEqual(U(notForMe).annual, 0);
  const half = buildStatement(m, { ...base, benefits: { healthyFood: 'half', healthyCare: 'none' } }, null);
  near(U(half).full, half.lines.find(l => l.key === 'healthyFood.health').full * 0.5 * (1 / 0.7 - 1), 'half HealthyFood: half the uplift');
  const noHealth = buildStatement(m, { ...base, vitality: { money: true, health: false, drive: false } }, null,
    { products: { bank: true, health: false, insure: false }, vitality: { money: true, health: false, drive: false } });
  near(U(noHealth) ? U(noHealth).full : 0, 0, 'no Vitality Health: no uplift');
  const milesPlusOff = buildStatement(m, { ...base, benefits: { milesPlus: 'none' } }, null);
  assert.strictEqual(U(milesPlusOff).annual, 0, 'the uplift line is weighted itself');
  assert.ok(U(milesPlusOff).full > 0);
}
// conditions (settings.conditions) reach every rate: health checks raise
// Vitality Health's HealthyFood share, 36 gym visits the gym discount
{
  const loose = { ...rates };
  for (const k of ['healthyFoodHealthPct', 'healthyFoodSecondaryPct', 'healthyCareHealthPct', 'gymDiscountPct']) delete loose[k];
  const plain = buildStatement(mH, { ...settings, rates: loose, bill: { medical: 6600, gap: 300 } });
  const met = buildStatement(mH, { ...settings, rates: loose, bill: { medical: 6600, gap: 300 }, conditions: { checks: 'both', gym36: true } });
  const HF = st => st.lines.find(l => l.key === 'healthyFood.health').full;
  assert.ok(HF(met) > HF(plain), `health checks raise HealthyFood ${HF(met)} > ${HF(plain)}`);
  assert.ok(met.vitality.gymSavingFull > plain.vitality.gymSavingFull, '36 gym visits raise the gym saving');
}

// ── release review blockers ───────────────────────────────────────────
const { measure } = require('../src/measure');
const { monthsBetween: mb } = require('../src/measure');
const months12 = mb('2025-11', '2026-10');
const win12 = { from: '2025-11', to: '2026-10', notCardSpend: [] };
const day = (ym, d) => ym + '-' + String(d).padStart(2, '0');
const ACC = {
  'Other Cheque': { institution: 'Other Bank', type: 'checking' },
  'Disc Transact': { institution: 'Discovery Bank', type: 'checking' },
  'Disc Card': { institution: 'Discovery Bank', type: 'credit_card' },
};
// Blocker 1: each figure is made into a year over the months ITS account
// holds data. Another bank imported for 12 months, a Discovery Suite opened
// three months ago: the Health debit and gym on the other bank stay at one
// year's worth, the Suite's fees are three months made into a year.
{
  const rows = [];
  for (const ym of months12) {
    rows.push({ date: day(ym, 1), description: 'DISC PREM 1', amount: -4850, account: 'Other Cheque', category: 'Medical' });
    rows.push({ date: day(ym, 5), description: 'CHECKERS SOMETOWN', amount: -3000, account: 'Other Cheque', category: 'Groceries' });
    rows.push({ date: day(ym, 6), description: 'VIRGIN ACTIVE', amount: -150, account: 'Other Cheque', category: 'Gym' });
    if (ym >= '2026-08') {
      rows.push({ date: day(ym, 2), description: 'Monthly account fee', amount: -435, account: 'Disc Transact', category: 'Bank charges' });
      rows.push({ date: day(ym, 10), description: 'SOME SHOP', amount: -8000, account: 'Disc Card', category: 'Shopping' });
    }
  }
  const mm = measure(rows, ACC, {}, win12);
  const sx = buildStatement(mm, { rates, status: { money: 'Blue', health: 'Blue' } }, null);
  const Lx = k => sx.lines.find(l => l.key === k);
  assert.strictEqual(sx.window.dataMonths, 3);
  near(Lx('fee.account').annual, 435 * 12, 'bank fees: over the Discovery months');
  near(Lx('gym').annual, 150 * 12, 'gym on the other bank: over its 12 months, not ×4');
  near(sx.bill.items.find(i => i.key === 'product.medical').annual, -4850 * 12, 'Health debit on the other bank: one year, not four');
  const hfOne = Lx('healthyFood.health').full;
  // the same household with every row imported: the HealthyFood figure does not change
  const all = measure(rows.concat(months12.filter(ym => ym < '2026-08').map(ym => ({ date: day(ym, 2), description: 'Monthly account fee', amount: -435, account: 'Disc Transact', category: 'Bank charges' }))), ACC, {}, win12);
  near(buildStatement(all, { rates, status: { money: 'Blue', health: 'Blue' } }, null).lines.find(l => l.key === 'healthyFood.health').full, hfOne, 'HealthyFood on the other bank does not depend on how long Discovery is imported');
  // only two months of the other bank imported: still one year of debit
  const short = measure(rows.filter(r => r.date >= '2026-09' && r.account === 'Other Cheque'), ACC, {}, win12);
  const ss = buildStatement(short, { rates, status: {} }, null, { products: { bank: false, health: true } });
  near(ss.bill.items.find(i => i.key === 'product.medical').annual, -4850 * 12, 'two months of debits are R4 850 a month, not R9 700 a year');
}
// Blocker 2: Vitality Drive fuel counts bp and Shell paid with ANY
// Discovery Bank card, the transaction account's debit card included;
// Vitality Money's extra stays on the credit card
{
  const rows = [];
  for (const ym of months12) rows.push({ date: day(ym, 3), description: 'BP SOMETOWN', amount: -1000, account: 'Disc Transact', category: 'Fuel' });
  const mm = measure(rows, { 'Disc Transact': ACC['Disc Transact'] }, {}, win12);
  const sx = buildStatement(mm, { rates: { ...rates, fuelMoneyPct: 10 }, status: { money: 'Blue', drive: 'Gold' }, bankKind: 'transaction' }, null);
  near(sx.lines.find(l => l.key === 'fuel.drive').full, 1000 * 12 * 0.05, 'Drive: 5% of the debit-card fuel');
  near(sx.lines.find(l => l.key === 'fuel.money').full, 0, 'no Vitality Money fuel extra off the credit card');
  const card = measure(rows.map(r => ({ ...r, account: 'Disc Card' })), ACC, {}, win12);
  const sc = buildStatement(card, { rates: { ...rates, fuelMoneyPct: 10 }, status: { money: 'Blue', drive: 'Gold' } }, null);
  near(sc.lines.find(l => l.key === 'fuel.drive').full, 600, 'credit card fuel still counts for Drive');
  near(sc.lines.find(l => l.key === 'fuel.money').full, 1200, 'and for Vitality Money');
  assert.ok(!/ {2}/.test(sc.lines.find(l => l.key === 'fuel.drive').detail), 'no double space');
}
// Blocker 5: the Apple Watch activation fee is counted once
{
  const rows = [];
  for (const ym of months12) rows.push({ date: day(ym, 2), description: 'Monthly account fee', amount: -435, account: 'Disc Transact', category: 'Bank charges' });
  rows.push({ date: '2025-11-05', description: 'Apple Watch activation', amount: -1199, account: 'Disc Card', category: 'Bank charges' });
  rows.push({ date: '2026-01-05', description: 'Apple Watch', amount: -500, account: 'Disc Card', category: 'Bank charges' });
  rows.push({ date: '2026-02-05', description: 'Apple Watch', amount: -250, account: 'Disc Card', category: 'Bank charges' });
  const mm = measure(rows, ACC, {}, win12);
  const w = buildStatement(mm, { rates: { ...rates, appleWatchActivation: 1199 }, status: {} }, null).lines.find(l => l.key === 'appleWatch');
  near(w.full, 500 * 12 - 750 - 1199 / 2, 'saving less instalments paid less half the activation');
  assert.ok(/R 750 a year you did pay/.test(w.detail), w.detail);
  // an activation and an instalment in the same month: still told apart
  const same = measure(rows.map(r => (r.date === '2026-01-05' ? { ...r, date: '2025-11-20' } : r)), ACC, {}, win12);
  near(buildStatement(same, { rates: { ...rates, appleWatchActivation: 1199 }, status: {} }, null).lines.find(l => l.key === 'appleWatch').full, 4650.5);
}
// Blocker 6: with the plan known and no amount typed, the medical aid is the
// plan's published price and the rest of the latest debit is Vitality
{
  const mP = { ...m, figures: { ...m.figures, 'product.medical': fig({ '2026-08': 5250, '2026-09': 5250 }) } };
  const sP = buildStatement(mP, { ...settings, health: { plan: 'dhClassicSaver' }, members: { adults: 1, children: 0 } });
  assert.strictEqual(sP.bill.medicalMonthly, 4850);
  assert.strictEqual(sP.bill.medicalSource, 'plan');
  assert.strictEqual(sP.bill.vitalityMonthly, 400);
  assert.ok(/Classic Saver's published price/.test(sP.bill.items[0].note), sP.bill.items[0].note);
  const sG = buildStatement(mP, { ...settings, health: { plan: 'dhClassicSaver' }, members: { adults: 1, children: 0 }, bill: { gap: 171 } });
  assert.strictEqual(sG.bill.vitalityMonthly, 229, 'typed gap cover comes out too');
  // the plan's price is more than the debit: nothing is split
  const sBig = buildStatement(mP, { ...settings, health: { plan: 'dhClassicSaver' }, members: { adults: 2, children: 0 } });
  assert.strictEqual(sBig.bill.vitalityMonthly, null);
  assert.ok(/cannot be split/.test(sBig.bill.items[0].note) && !/-/.test(sBig.bill.items[0].note.replace(/\d+-month/g, '')), sBig.bill.items[0].note);
  assert.strictEqual(buildStatement(mP, settings).bill.vitalityMonthly, null, 'no plan, nothing typed: unknown');
}
// Blocker 7: plain words — typed parts above the debit, no minus, a month name
{
  const mP = { ...m, figures: { ...m.figures, 'product.medical': fig({ '2026-08': 4000, '2026-10': 4000 }) } };
  const sT = buildStatement(mP, { ...settings, bill: { medical: 4500, gap: 300 } });
  const note = sT.bill.items[0].note;
  assert.ok(/Oct 2026/.test(note) && !/2026-10/.test(note), note);
  assert.ok(!/-/.test(note) && /more than this debit/.test(note), note);
  assert.strictEqual(sT.bill.vitalityMonthly, null);
  // an account that earns no Miles says so
  const none = buildStatement(m, { ...settings, rates: { ...rates, milesRandPerMile: 0, milesPhysical: 0 } }).lines.find(l => l.key === 'miles.card');
  assert.ok(/earns no Miles on card spend/.test(none.detail) && !/R0 /.test(none.detail), none.detail);
  // one Vitality Travel booking in a short window says it is a rough guess
  const one = { ...m, figures: { ...m.figures, 'travel.vitality': { total: 3000, count: 1, perMonth: { '2026-09': 3000 } } } };
  assert.ok(/one booking in 2 months/.test(buildStatement(one, settings).lines.find(l => l.key === 'travel.bank').detail));
}

// ── fix wave after the double-count audit (base 3b26f51), end to end ──
{
  const { measure, monthsBetween: mb } = require('../src/measure');
  const { summariseMiles } = require('../src/miles');
  const { buildProducts } = require('../src/products');
  const { DEFAULT_SETTINGS } = require('../src/constants');
  const MONTHS = mb('2025-11', '2026-10');
  const day = (ym, d) => ym + '-' + String(d).padStart(2, '0');
  const ACC = { 'Disc Card': { institution: 'Discovery Bank', type: 'credit_card' }, 'Disc Transact': { institution: 'Discovery Bank', type: 'checking' }, 'Other Cheque': { institution: 'Other Bank', type: 'checking' } };
  const R = (date, description, amount, account, category) => ({ date, description, category: category || '', amount, account, split: '', excluded: false });
  const base = () => { const rows = []; for (const ym of MONTHS) rows.push(R(day(ym, 3), 'MONTHLY ACCOUNT FEE', -250, 'Disc Transact', 'Fees'), R(day(ym, 5), 'TAKEALOT', -8000, 'Disc Card', 'Shopping')); return rows; };
  const settingsOf = over => {
    const s0 = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    for (const [k, v] of Object.entries(over || {})) s0[k] = v && typeof v === 'object' && !Array.isArray(v) && s0[k] && typeof s0[k] === 'object' ? Object.assign({}, s0[k], v) : v;
    return s0;
  };
  const run = (rows, over, milesRows, opts) => {
    const s0 = settingsOf(over);
    const mm = measure(rows, ACC, {}, { from: '2025-11', to: '2026-10' });
    const ms = milesRows ? summariseMiles(milesRows, mm.from, mm.to) : null;
    const stx = buildStatement(mm, s0, ms, opts);
    return { m: mm, ms, st: stx, pr: buildProducts(stx, mm, ms, s0, new Date(2026, 10, 3)), s: s0 };
  };
  const Lk = (o, k) => { const l = o.st.lines.find(x => x.key === k); return l ? l.annual : null; };
  const all = { products: { bank: true, health: true, gap: false, insure: true, life: false }, vitality: { money: true, health: true, drive: true } };

  // 1. Drive fuel rewards paid as Miles count once, as Drive's (audit s1): before, R5 400 in miles.partners AND R5 400 estimated in fuel.drive
  {
    const rows = base();
    for (const ym of MONTHS) rows.push(R(day(ym, 7), 'BP SOMETOWN', -1500, 'Disc Card', 'Fuel'));
    const miles = [];
    for (const ym of MONTHS) miles.push({ date: day(ym, 20), type: 'Discovery Insure', description: 'Vitality Drive fuel reward', info: '', miles: 4500 },
      { date: day(ym, 6), type: 'Base Miles', description: 'Card spend', info: `${day(ym, 5)} - R 8000.00`, miles: 100 });
    const o = run(rows, { bankKind: 'suite' }, miles, all);
    const drive = o.st.lines.find(l => l.key === 'fuel.drive');
    assert.strictEqual(drive.source, 'statement', 'Insure Miles are the Drive line');
    near(drive.full, 4500 * 12 * o.st.mileValue, 'Drive = the Insure Miles, a year');
    assert.strictEqual(Lk(o, 'miles.partners'), 0, 'and never partner Miles too');
    assert.strictEqual(drive.cash, 0, 'Miles are not cash');
    assert.strictEqual(o.pr.all.find(p => p.id === 'insure').cashBack, 0);
    assert.ok(o.pr.all.find(p => p.id === 'insure').transactions.some(t => t.key === 'miles.insure'), 'the Insure Miles are listed under Insure');
    assert.ok(!o.pr.all.find(p => p.id === 'bank').transactions.some(t => t.key === 'miles.insure'), 'not under the bank');
  }
  // 3. a watch that cost more than it saved: the Bank tab and the flow agree (audit s3; before, the flow was R600 kinder)
  {
    const rows = base();
    rows.push(R('2025-11-02', 'APPLE WATCH ACTIVATION', -1199, 'Disc Card', 'Fees'));
    for (const ym of MONTHS) rows.push(R(day(ym, 2), 'APPLE WATCH INSTALMENT', -600, 'Disc Card', 'Fees'));
    const o = run(rows, { bankKind: 'suite' }, null, all);
    assert.ok(Lk(o, 'appleWatch') < -0.5, 'the watch line is below nothing');
    const bank = o.pr.all.find(p => p.id === 'bank');
    near(bank.net, o.st.net, 'Bank tab net = the bank product\'s net');
    assert.ok(bank.outParts.some(([label, v]) => /Apple Watch/.test(label) && v < 0), 'on the cost side');
    assert.ok(bank.back.every(b => b.v > 0));
  }
  // 4. basic exercise rewards never more than the gameboard paid (audit s4; before, R1 200 counted against R120 earned)
  {
    const rows = base();
    const miles = [];
    for (const ym of MONTHS) miles.push({ date: day(ym, 6), type: 'Base Miles', description: 'Card spend', info: `${day(ym, 5)} - R 8000.00`, miles: 100 },
      { date: day(ym, 9), type: 'Active Rewards', description: 'Gameboard play', info: '', miles: 100 });
    const o = run(rows, { bankKind: 'suite' }, miles, all);
    const earned = 100 * 12 * o.st.mileValue;
    near(Lk(o, 'gameboard') + Lk(o, 'activeRewards.basic'), earned, 'the gameboard counted once');
    near(o.st.benefits.gameboard.counted, earned);
  }
  // 5. with a statement the uplift follows the HealthyFood level, as without one (audit s5; before, R900 at every level)
  {
    const rows = base();
    for (const ym of MONTHS) rows.push(R(day(ym, 9), 'CHECKERS SOMETOWN', -3000, 'Other Cheque', 'Groceries'));
    const miles = [];
    for (const ym of MONTHS) miles.push({ date: day(ym, 6), type: 'Base Miles', description: 'Card spend', info: `${day(ym, 5)} - R 8000.00`, miles: 100 },
      { date: day(ym, 10), type: 'Vitality Health', description: 'HealthyFood Checkers', info: '', miles: 750 },
      { date: day(ym, 15), type: 'Miles Spent', description: 'Partner purchase', info: 'R 150.00', miles: -750 });
    const up = lvl => Lk(run(rows, { bankKind: 'suite', benefits: { healthyFood: lvl } }, miles, all), 'miles.uplift');
    near(up('full'), 900); near(up('half'), 450); near(up('none'), 0);
    // not available without Vitality Health: nothing to lift
    near(Lk(run(rows, { bankKind: 'suite' }, miles, { products: { ...all.products, health: false }, vitality: { money: true, health: false, drive: false } }), 'miles.uplift'), 0);
  }
  // 8. typed totals are for the window: a year over the window's months, not the Discovery months (audit s8; before, R2 400)
  {
    const half = MONTHS.slice(6);
    const rows = [];
    for (const ym of half) rows.push(R(day(ym, 3), 'MONTHLY ACCOUNT FEE', -250, 'Disc Transact', 'Fees'), R(day(ym, 5), 'TAKEALOT', -8000, 'Disc Card', 'Shopping'));
    const period = '2025-11..2026-10';
    const o = run(rows, { bankKind: 'suite', actualMiles: { card: 12000, period }, rates: { mileValue: 0.1 } }, null, all);
    assert.strictEqual(o.st.window.dataMonths, 6);
    near(Lk(o, 'miles.card'), 1200, '12 000 Miles in a 12-month window at 10c');
    const o2 = run(rows, { bankKind: 'suite', actualMiles: { healthyFood: 12000, period }, rates: { mileValue: 0.1 }, benefits: { healthyFood: 'full' } }, null, all);
    near(Lk(o2, 'miles.healthyFood') + Lk(o2, 'healthyFood.health'), 1200);
  }
  // 11. a rival's credit-card cashback is not paid on debit card spend (red team #7)
  {
    const rows = [];
    for (const ym of MONTHS) rows.push(R(day(ym, 3), 'MONTHLY ACCOUNT FEE', -130, 'Disc Transact', 'Fees'), R(day(ym, 4), 'WOOLWORTHS SOMETOWN', -3000, 'Disc Transact', 'Groceries'),
      R(day(ym, 1), 'SBSA HOMELOAN 0001', -15000, 'Disc Transact', 'Bond'), R(day(ym, 2), 'SOMETOWN PRIMARY FEES', -3000, 'Disc Transact', 'School'));
    const o = run(rows, { bankKind: 'transaction' }, null, all);
    near(o.st.cardSpend, 36000, 'the bond and school fees are debit orders, not swipes');
    const cap = o.st.alternatives.find(a => a.id === 'capitec');
    const capRow = ALTERNATIVES.find(a => a.id === 'capitec');
    if (capRow.cardOnly !== false && !(capRow.debitBackPct > 0)) {
      assert.strictEqual(cap.backPct, 0, 'no credit card cashback on debit spend');
      assert.ok(cap.cardOnlyLeftOut && cap.debitOnly);
    }
    const oc = run(base(), { bankKind: 'suite' }, null, all);
    assert.strictEqual(oc.st.alternatives.find(a => a.id === 'capitec').backPct, capRow.backPct, 'credit card spend still earns it');
  }
  // 12. confidence: months, thin, and lines resting on one or two events from a short window
  {
    const rows = [R('2026-10-03', 'MONTHLY ACCOUNT FEE', -250, 'Disc Transact', 'Fees'), R('2026-10-05', 'TAKEALOT', -8000, 'Disc Card', 'Shopping'), R('2026-10-12', 'VITALITY TRAVEL', -9000, 'Disc Card', 'Holiday')];
    const o = run(rows, { bankKind: 'suite' }, null, all);
    const c = o.st.confidence;
    assert.strictEqual(c.months, 1);
    assert.strictEqual(c.thin, true);
    assert.ok(c.extrapolated.includes('travel.bank'), 'one booking in one month made a year');
    assert.ok(!c.extrapolated.includes('fee.account'), 'a monthly fee is a rate, not an event');
    assert.ok(c.notes.length >= 2 && c.notes.every(n => !/-\s?\d|−/.test(n) && /\.$/.test(n)), c.notes.join(' | '));
    const full = run(base().concat([R('2026-10-12', 'VITALITY TRAVEL', -9000, 'Disc Card', 'Holiday')]), { bankKind: 'suite' }, null, all).st.confidence;
    assert.deepStrictEqual([full.months, full.thin, full.extrapolated], [12, false, []], 'one booking in a year is a year');
  }
  // 14. the Health debit is not split once it is past the plan table's prices
  {
    const { HEALTH_PLANS: HP } = require('../src/compare');
    const plan = HP.find(p => p.discovery);
    if (plan) {
      const late = { ...m, from: '2027-04', to: '2027-05', months: ['2027-04', '2027-05'], figures: { ...m.figures, 'product.medical': fig({ '2027-04': 99999, '2027-05': 99999 }) } };
      const valid = require('../src/compare').planPriceValidFor;
      const stale = typeof valid === 'function' ? !valid('2027-05') : true;
      const sL = buildStatement(late, { ...settings, members: { adults: 2, children: 0 }, health: { plan: plan.id } });
      if (stale) {
        assert.strictEqual(sL.bill.vitalityMonthly, null, 'no split');
        assert.ok(/price changed after these figures/.test(sL.bill.items[0].note) && /Inputs/.test(sL.bill.items[0].note), sL.bill.items[0].note);
      }
      const typed = buildStatement(late, { ...settings, members: { adults: 2, children: 0 }, health: { plan: plan.id }, bill: { medical: 5000 } });
      assert.ok(typed.bill.vitalityMonthly > 0, 'a typed medical aid amount still splits it');
    }
  }
}
// a couple with a Suite each is compared with two rival accounts
{
  const one = buildStatement({ ...m, rows: { 'fee.account': [{ account: 'A' }] } }, { rates, status: { money: 'Diamond' } }, null);
  const two = buildStatement({ ...m, rows: { 'fee.account': [{ account: 'A' }, { account: 'B' }] } }, { rates, status: { money: 'Diamond' } }, null);
  const a1 = one.alternatives[0], a2 = two.alternatives.find(x => x.id === a1.id);
  assert.strictEqual(a2.holders, 2);
  near(a2.fees, a1.fees * 2, 'fees doubled for two holders');
}
console.log('model OK');
