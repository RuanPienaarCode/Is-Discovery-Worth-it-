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
  travelHealthPct: 25,
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
assert.strictEqual(rate({ rates: {} }, 'fuelMoneyPct', { money: 'Gold' }, { spend: 30000 }), 0, 'Gold tables are not loaded');
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
assert.ok(/R 7 500 in 2026-09 = R 6 600 medical aid \+ R 300 gap cover \+ R 600 Vitality and other/.test(sH.bill.items[0].note), sH.bill.items[0].note);
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
console.log('model OK');
