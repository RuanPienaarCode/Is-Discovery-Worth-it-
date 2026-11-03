'use strict';
const assert = require('node:assert');
const { buildStatement } = require('../src/model');
const { buildProducts, milesRows } = require('../src/products');
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg || ''} ${a} != ${b}`);

/* Two months of a made-up household. */
const fig = perMonth => ({ total: Object.values(perMonth).reduce((a, b) => a + b, 0), count: 1, perMonth });
const row = (date, description, amount) => ({ date, description, amount, account: 'Everyday' });
const m = {
  from: '2026-08', to: '2026-09', months: ['2026-08', '2026-09'], dataMonths: ['2026-08', '2026-09'], rowsSeen: 20, lastSeen: {}, firstSeen: {},
  figures: {
    'fee.account': fig({ '2026-08': 400, '2026-09': 400 }),
    'spend.card': fig({ '2026-08': 10000, '2026-09': 10000 }),
    'product.medical': fig({ '2026-08': 6000, '2026-09': 6000 }),
    'product.medicalBack': fig({ '2026-09': 500 }),
    'product.gapClaim': fig({ '2026-09': 9000 }),
    'product.insure': fig({ '2026-08': 1000, '2026-09': 1000 }),
  },
  rows: {
    'fee.account': [row('2026-08-04', 'Monthly Account fee', -400), row('2026-09-04', 'Monthly Account fee', -400)],
    'product.medical': [row('2026-08-01', 'DISC PREM', -6000), row('2026-09-01', 'DISC PREM', -6000)],
    'product.gapClaim': [row('2026-09-10', 'INSGAPCLA', 9000)],
    'product.insure': [row('2026-08-30', 'DISCINSURE', -1000), row('2026-09-30', 'DISCINSURE', -1000)],
  },
};
const settings = { status: { money: 'Diamond', health: 'Diamond', drive: 'Bronze' }, rates: { mileValue: 0.1 }, actualMiles: {}, bill: { medical: 5000, gap: 300 }, life: { monthly: 700, cover: 1000000 } };
const st = buildStatement(m, settings);
const { products, totals, dates } = buildProducts(st, m, null, settings, new Date(2026, 9, 21));
const P = id => products.find(p => p.id === id);

assert.deepStrictEqual(products.map(p => p.id), ['bank', 'health', 'gap', 'insure', 'life']);
// Health: the debit less gap cover and Vitality (6 000 − 5 000 − 300 = 700 a month)
near(P('health').vitalityYear, 700 * 12);
near(P('health').medicalYear, 6000 * 12 - 300 * 12 - 700 * 12);
near(P('health').paid, 6000 * 12 - 300 * 12, 'Health pays the debit less the gap cover');
near(P('health').cashBack, 500 * 6);
assert.strictEqual(P('health').transactions.filter(t => t.key === 'product.medical')[0].note, 'Includes gap cover R 300');
// Gap: the premium inside the debit, the claim back
near(P('gap').paid, 300 * 12);
near(P('gap').net, 9000 * 6 - 300 * 12);
// Insure and Life
near(P('insure').paid, 12000);
assert.strictEqual(P('insure').latestMonthly, 1000);
near(P('life').paid, 700 * 12);
assert.ok(P('life').via && P('life').cover === 1000000);
// Bank: its figure is the statement's net, its paid the fees
near(P('bank').paid, st.cost);
near(P('bank').figure, st.net);
// every debit order counts once across the products
near(P('health').paid + P('gap').paid, 6000 * 12, 'the Health debit is split, not double counted');
// totals: cash back is refunds and claims; the flow net counts value too
near(totals.cash, 500 * 6 + 9000 * 6);
near(totals.paid, products.reduce((s, p) => s + p.paid, 0));
near(totals.flowNet, totals.value - totals.paid);
// transactions newest first
assert.strictEqual(P('insure').transactions[0].date, '2026-09-30');
// dates still ahead only
assert.ok(dates.every(d => d.date >= '2026-10-21'));
assert.ok(dates.some(d => d.date === '2026-11-01'));
assert.ok(!buildProducts(st, m, null, settings, new Date(2027, 5, 1)).dates.some(d => d.date === '2026-11-01'));

// Miles rows: the bank's kinds for Bank, Vitality Health's for Health
const ms = { perMonth: { 'money.healthyFood': { '2026-09': 4000 }, 'health.healthyFood': { '2026-09': 5000 }, base: { '2026-09': 600 } } };
assert.deepStrictEqual(milesRows(ms, 'bank').map(r => r.description).sort(), ['Base Miles · card spend', 'Vitality Money · HealthyFood']);
assert.deepStrictEqual(milesRows(ms, 'health').map(r => r.miles), [5000]);
// Bank's interest boost and cashback are cash; Vitality Health's rewards are value on Health
const m2 = { ...m, figures: { ...m.figures, 'interest.boost': fig({ '2026-09': 50 }), 'interest.cashback': fig({ '2026-09': 10 }), gym: fig({ '2026-08': 300, '2026-09': 300 }) } };
const st2 = buildStatement(m2, settings);
const pr2 = buildProducts(st2, m2, null, settings, new Date(2026, 9, 21));
const B2 = pr2.products.find(p => p.id === 'bank'), H2 = pr2.products.find(p => p.id === 'health');
near(B2.cashBack, 60 * 6, 'interest is cash back');
near(pr2.totals.cash, 60 * 6 + 500 * 6 + 9000 * 6);
const vit = H2.back.find(b => b.label === 'Vitality Health rewards');
assert.ok(vit, 'the flow credits Vitality Health');
near(vit.v, st2.vitality.value, 'all of what Vitality gives back');
near(H2.cashBack, 500 * 6, 'but only the claims are cash');
// Bank in the flow: charges and base interest any bank has are still paid to,
// and paid by, Discovery Bank, so they count here but not in the verdict
const m3 = { ...m, figures: { ...m.figures, 'fee.fx': fig({ '2026-08': 20, '2026-09': 20 }), 'fee.penalty': fig({ '2026-09': 15 }), 'interest.charged': fig({ '2026-09': 30 }), 'interest.earned': fig({ '2026-08': 100, '2026-09': 100 }), 'interest.boost': fig({ '2026-09': 50 }) } };
const st3 = buildStatement(m3, settings);
const pr3 = buildProducts(st3, m3, null, settings, new Date(2026, 9, 21));
const B3 = pr3.products.find(p => p.id === 'bank');
near(B3.paid, st3.cost + 40 * 6 + 15 * 6 + 30 * 6, 'fees plus FX, penalty and interest charged');
assert.deepStrictEqual(B3.outParts.slice(-3).map(x => x[0]), ['Fees for failed or returned debit orders', 'Foreign payment fees', 'Interest charged on the card']);
near(B3.outParts.reduce((s, x) => s - x[1], 0), B3.paid, 'the parts add up to paid');
const base = B3.back.find(b => b.label === 'Base interest on savings');
assert.ok(base, 'base interest comes back');
near(base.v, 200 * 6);
near(B3.cashBack, 50 * 6 + 200 * 6, 'boost and base interest are both cash');
near(B3.figure, st3.net, 'the bank figure is still the stay-or-switch net');
near(st3.net, buildStatement({ ...m3, figures: { ...m3.figures, 'fee.fx': fig({}), 'fee.penalty': fig({}), 'interest.charged': fig({}), 'interest.earned': fig({}) } }, settings).net, 'and those lines do not move it');
assert.ok(/any bank/i.test(B3.note), 'the flow says why they are there');
near(pr3.totals.paid, pr3.products.reduce((s, p) => s + p.paid, 0));
// dates: the 1 Nov fuel change is a Bank line; the watch term ends to the day
assert.strictEqual(pr2.dates.find(d => d.date === '2026-11-01').product, 'bank');
const stW = { ...st, downgrade: { ...st.downgrade, watchEnds: '2027-01-09' } };
assert.ok(buildProducts(stW, m, null, settings, new Date(2026, 9, 21)).dates.some(d => d.date === '2027-01-09' && /Apple Watch/.test(d.text)));
// the Health split carries a note when earlier months were billed at another amount
const mS = { ...m, figures: { ...m.figures, 'product.medical': fig({ '2026-08': 5500, '2026-09': 6000 }) } };
const stS = buildStatement(mS, settings);
assert.ok(/1 earlier month had a different amount/.test(buildProducts(stS, mS, null, settings, new Date(2026, 9, 21)).products.find(p => p.id === 'health').splitNote));
assert.strictEqual(P('health').splitNote, '', 'no note when every month matches');
// Discovery Life Miles land on Life
const msL = { figures: { life: 1000 }, perMonth: {} };
const stL = { ...st, mileValue: 0.1, milesStatement: { covered: 12 } };
const lifeP = buildProducts(stL, m, msL, settings, new Date(2026, 9, 21)).products.find(p => p.id === 'life');
near(lifeP.back[0].v, 1000 * 0.1, 'Life rewards at the Mile value');
// ── a premium is a year over its own account's months ────────────────
{
  const { measure, monthsBetween } = require('../src/measure');
  const acc = { 'Other Cheque': { institution: 'Other Bank', type: 'checking' }, 'Disc Transact': { institution: 'Discovery Bank', type: 'checking' } };
  const rowsP = [];
  for (const ym of monthsBetween('2025-11', '2026-10')) {
    rowsP.push({ date: ym + '-01', description: 'DISC PREM 1', amount: -4850, account: 'Other Cheque', category: 'Medical' });
    rowsP.push({ date: ym + '-04', description: 'DISCINSURE 1', amount: -1800, account: 'Other Cheque', category: 'Insurance' });
    if (ym >= '2026-08') rowsP.push({ date: ym + '-02', description: 'Monthly account fee', amount: -435, account: 'Disc Transact', category: 'Bank charges' });
  }
  const mP = measure(rowsP, acc, {}, { from: '2025-11', to: '2026-10' });
  const sP = buildStatement(mP, { status: {}, rates: { mileValue: 0.1 } });
  assert.strictEqual(sP.window.dataMonths, 3, 'three Discovery months');
  const pr = buildProducts(sP, mP, null, { status: {} }, new Date(2026, 10, 3));
  near(pr.all.find(p => p.id === 'health').debitYear, 4850 * 12, 'Health debit on another bank: one year, not four');
  near(pr.all.find(p => p.id === 'insure').paid, 1800 * 12, 'Insure premium likewise');
  // two months imported, no Discovery account at all
  const mS = measure(rowsP.filter(x => x.date >= '2026-09' && x.account === 'Other Cheque'), acc, {}, { from: '2025-11', to: '2026-10' });
  const prS = buildProducts(buildStatement(mS, { status: {} }, null, { products: { bank: false, health: true } }), mS, null, { status: {} }, new Date(2026, 10, 3));
  near(prS.all.find(p => p.id === 'health').paid, 4850 * 12, 'two months of debits are a year of R4 850');
}
// ── what is known about the split ────────────────────────────────────
{
  near(P('health').medicalMonthly, 5000, 'today\'s medical aid, typed');
  assert.strictEqual(P('health').vitalityKnown, true);
  const unsplit = buildProducts(buildStatement(m, { ...settings, bill: {} }), m, null, { ...settings, bill: {} }, new Date(2026, 9, 21)).all.find(p => p.id === 'health');
  assert.strictEqual(unsplit.vitalityKnown, false, 'nothing typed, no plan: Vitality\'s premium is unknown');
  assert.strictEqual(unsplit.medicalMonthly, null);
  const s2 = { ...settings, bill: {}, health: { plan: 'dhClassicSaver' }, members: { adults: 1, children: 0 } };
  const priced = buildProducts(buildStatement(m, s2), m, null, s2, new Date(2026, 9, 21)).all.find(p => p.id === 'health');
  near(priced.medicalMonthly, 4850, 'the plan\'s published price');
  near(priced.vitalityYear, (6000 - 4850) * 12, 'the rest of the debit is Vitality');
  assert.strictEqual(priced.vitalityKnown, true);
}
console.log('products OK');

/* ── only the products you chose ─────────────────────────────────────── */
{
  const some = { bank: false, health: true, gap: false, insure: true, life: false };
  const r = buildProducts(st, m, null, settings, new Date(2026, 9, 21), some);
  assert.deepStrictEqual(r.products.map(p => p.id), ['health', 'insure'], 'only the chosen products are listed');
  assert.deepStrictEqual(r.all.map(p => p.id), ['bank', 'health', 'gap', 'insure', 'life'], 'all keeps every product for lookups');
  // the totals add up the chosen products and nothing else
  near(r.totals.paid, r.products.reduce((s, p) => s + p.paid, 0));
  near(r.totals.paid, P('health').paid + P('insure').paid, 'no bank fees, gap or life premiums in the bill');
  near(r.totals.cash, P('health').cashBack + P('insure').cashBack);
  assert.ok(r.totals.paid < totals.paid, 'fewer products, a smaller bill');
  // dated reminders for a product you do not have stay out
  assert.ok(r.dates.every(d => d.product === 'insure'), 'only Insure dates remain');
  assert.ok(!r.dates.some(d => d.product === 'bank'));
  // a product you did not choose is still built (the comparisons look it up)
  near(r.all.find(p => p.id === 'gap').paid, 300 * 12);

  // one product on its own, and none at all
  const one = buildProducts(st, m, null, settings, new Date(2026, 9, 21), { bank: false, health: false, gap: true, insure: false, life: false });
  assert.deepStrictEqual(one.products.map(p => p.id), ['gap']);
  near(one.totals.paid, 300 * 12);
  const none = buildProducts(st, m, null, settings, new Date(2026, 9, 21), { bank: false, health: false, gap: false, insure: false, life: false });
  assert.strictEqual(none.products.length, 0);
  assert.strictEqual(none.totals.paid, 0);
  assert.strictEqual(none.totals.value, 0);
  assert.deepStrictEqual(none.dates, []);

  // a missing map, or a product left out of it, means all of them
  assert.strictEqual(buildProducts(st, m, null, settings, new Date(2026, 9, 21)).products.length, 5);
  assert.strictEqual(buildProducts(st, m, null, settings, new Date(2026, 9, 21), { health: false }).products.length, 4);
}
