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
console.log('model OK');
