'use strict';
/* How to get more out of Discovery (src/levers.js + src/ui-levers.js).
   Made-up households only: "Sam" in Sometown, figures typed by hand.
   Each lever must appear when the setup can use it and not otherwise, its
   gain must be the model's own statement difference, the list is sorted,
   anything under R100 is dropped, and the renderer draws one card per
   lever with a named "What to do" button. */
const assert = require('node:assert');
const path = require('node:path');
const Module = require('node:module');

const root = path.join(__dirname, '..');
const origLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'obsidian') return { setIcon: () => {} };
  return origLoad.call(this, request, ...rest);
};
const { computeLevers, worthOf, sameThingsBought, flightShare, MIN_GAIN } = require(path.join(root, 'src/levers.js'));
const { renderLevers, figureOf, HEADING, NONE } = require(path.join(root, 'src/ui-levers.js'));
const { buildStatement } = require(path.join(root, 'src/model.js'));
const { rate } = require(path.join(root, 'src/rates.js'));
Module._load = origLoad;

const near = (a, b, msg, tol) => assert.ok(Math.abs(a - b) < (tol || 1e-6), `${msg || ''} ${a} != ${b}`);
const clone = o => JSON.parse(JSON.stringify(o));

/* six months of Discovery statements, so the figures are not "thin" */
const MONTHS = ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08'];
const fig = (v, acc) => {
  const perMonth = {};
  for (const ym of MONTHS) perMonth[ym] = v;
  return { total: v * MONTHS.length, count: MONTHS.length, perMonth, accounts: { [acc || 'Sam Card']: true } };
};
const window_ = figures => ({ from: MONTHS[0], to: MONTHS[5], months: MONTHS, dataMonths: MONTHS, rowsSeen: 300, cardAccounts: ['Sam Card'], figures });
/* Sam's household: a Black Suite, card spend R20 000 a month, groceries,
   pharmacy, fuel paid with another bank's card, a gym, flights */
const samFigures = () => ({
  'fee.account': fig(435), 'fee.vitalityMoney': fig(101), 'fee.facility': fig(69),
  'spend.card': fig(20000),
  'shop.checkers': fig(3000), 'all.shop.checkers': fig(3000),
  'shop.clicks': fig(800), 'all.shop.clicks': fig(800),
  'all.fuel.bp': fig(1500, 'Sometown Bank'),
  'all.gym': fig(500, 'Sometown Bank'),
  'travel.vitality': fig(1000), 'all.travel.vitality': fig(1000),
});
const m = window_(samFigures());
const settings = () => ({
  status: { money: 'Bronze', health: 'Bronze', drive: 'Bronze' }, suite: 'Black', bankKind: 'suite',
  rates: { virtualSharePct: 60 }, actualMiles: {}, benefits: {}, products: {}, vitality: {},
  conditions: { checks: '', gym36: null, insurePlan: '', homeCover: '' }, milesUse: '', members: { adults: 2, children: 0 },
});
const ALL = { bank: true, health: true, gap: false, insure: true, life: false };
const VIT = { money: true, health: true, drive: true };
const run = (s, o) => {
  const x = Object.assign({ m, ms: null, s, products: ALL, vitality: VIT }, o || {});
  x.st = buildStatement(x.m, x.s, x.ms, { products: x.products, vitality: x.vitality });
  return computeLevers(Object.assign({ buildStatement }, x));
};
const ids = levers => levers.map(l => l.id);
const byId = (levers, id) => levers.find(l => l.id === id);
const worth = (mm, s, products, vitality) => worthOf(buildStatement(mm, s, null, { products: products || ALL, vitality: vitality || VIT }));

// ── shape, order, the R100 floor ───────────────────────────────────────
const sam = run(settings());
assert.ok(sam.length >= 5, `Sam has several levers: ${ids(sam)}`);
for (const l of sam) {
  assert.ok(typeof l.id === 'string' && l.id, 'id');
  assert.ok(typeof l.title === 'string' && l.title, `${l.id}: title`);
  assert.ok(typeof l.line === 'string' && l.line, `${l.id}: line`);
  assert.ok(typeof l.how === 'string' && l.how, `${l.id}: how`);
  assert.ok(l.needs === null || (typeof l.needs === 'string' && l.needs), `${l.id}: needs is a sentence or null`);
  assert.ok(['answer', 'habit', 'status'].includes(l.kind), `${l.id}: kind`);
  assert.ok(Number.isFinite(l.gain) && l.gain >= MIN_GAIN, `${l.id}: gain at least R${MIN_GAIN}`);
  /* plain words: no minus signs, no "+R", no banned words in any string */
  for (const t of [l.title, l.line, l.how, l.needs || '']) {
    assert.ok(!/[−]|\+R|\bnet\b|\bminus\b|\btier\b|\bahead\b|real cost|cautious|face value/i.test(t), `${l.id}: plain words: ${t}`);
  }
}
for (let i = 1; i < sam.length; i++) assert.ok(sam[i - 1].gain >= sam[i].gain, 'sorted by gain, biggest first');
assert.strictEqual(MIN_GAIN, 100);
for (const id of ['checks', 'gym36', 'dday', 'virtualCard', 'driveFuelCard', 'status.money']) assert.ok(ids(sam).includes(id), `Sam gets ${id}: ${ids(sam)}`);
/* nothing in rates.js follows the health score today, so it gains nothing */
assert.ok(!ids(sam).includes('status.health'), 'no health score lever while no rate follows it');
/* fuel is paid with another bank's card, so Drive pays nothing at any score */
assert.ok(!ids(sam).includes('status.drive'), 'no car score lever while Drive pays no fuel back');
/* unanswered questions are "answer" levers; status levers say so */
assert.strictEqual(byId(sam, 'checks').kind, 'answer');
assert.strictEqual(byId(sam, 'gym36').kind, 'answer');
assert.strictEqual(byId(sam, 'dday').kind, 'answer');
assert.strictEqual(byId(sam, 'status.money').kind, 'status');
assert.ok(/bank score \(Vitality Money status, Blue to Diamond\)/.test(byId(sam, 'status.money').line), 'the score with its status beside it');
assert.strictEqual(byId(sam, 'status.money').title, 'A Silver bank score', 'the next status only');
assert.ok(/Ð-Day \(the 15th of each month\)/.test(byId(sam, 'dday').line), 'Ð-Day explained at first mention');
/* the inputs are not changed */
const before = clone(settings());
const sIn = settings();
run(sIn);
assert.deepStrictEqual(sIn, before, 'computeLevers does not change the settings');
assert.deepStrictEqual(Object.keys(m.figures).sort(), Object.keys(samFigures()).sort(), 'nor the measured figures');

// ── each gain is the statement difference ──────────────────────────────
const s0 = settings();
const w0 = worth(m, s0);
/* Ð-Day: one changed setting, nothing bought differently */
near(byId(sam, 'dday').gain, worth(m, Object.assign(settings(), { milesUse: 'dday' })) - w0, 'dday gain = statement difference');
/* the virtual card */
near(byId(sam, 'virtualCard').gain, worth(m, Object.assign(settings(), { rates: { virtualSharePct: 100 } })) - w0, 'virtual card gain = statement difference');
/* the fuel card: the same fuel, paid with a Discovery Bank card */
const mFuel = window_(Object.assign(samFigures(), { 'disc.fuel.bp': fig(1500, 'Sometown Bank') }));
near(byId(sam, 'driveFuelCard').gain, worth(mFuel, s0) - w0, 'fuel card gain = statement difference');
/* the health checks: the statement difference with the same flights bought */
const sChecks = settings(); sChecks.conditions.checks = 'both';
near(byId(sam, 'checks').gain, worth(sameThingsBought(m, s0, sChecks, buildStatement(m, s0, null, { products: ALL, vitality: VIT })), sChecks) - w0, 'checks gain = statement difference');
/* the bank score: likewise */
const sSilver = settings(); sSilver.status.money = 'Silver';
near(byId(sam, 'status.money').gain, worth(sameThingsBought(m, s0, sSilver, buildStatement(m, s0, null, { products: ALL, vitality: VIT })), sSilver) - w0, 'bank score gain = statement difference');
/* the downgrade is the model's own counterfactual, fees netted */
const dg = buildStatement(m, s0, null, { products: ALL, vitality: VIT }).downgrade;
assert.ok(dg && dg.gainIfDowngrade >= MIN_GAIN, 'Sam could save on the Credit Card Account');
near(byId(sam, 'downgrade').gain, dg.gainIfDowngrade, 'downgrade gain = st.downgrade');
assert.strictEqual(byId(sam, 'downgrade').title, 'The Black Credit Card Account instead');

// ── same things bought: the gym and flight figures are honest ──────────
/* a gym only: R500 a month at 50% off is a R1 000 membership; 75% off
   saves R250 a month more, R3 000 a year (not the R12 000 a naive re-run
   would give by reading R500 as a price already 75% off) */
const mGym = window_({ 'fee.account': fig(435), 'spend.card': fig(5000), 'all.gym': fig(500, 'Sometown Bank') });
const gymOnly = run(settings(), { m: mGym });
const g0 = rate(settings(), 'gymDiscountPct', {}) / 100;
const g1 = rate(Object.assign(settings(), { conditions: { gym36: true } }), 'gymDiscountPct', {}) / 100;
near(byId(gymOnly, 'gym36').gain, (500 / (1 - g0)) * (g1 - g0) * 12, 'gym: the same membership at the bigger discount', 1e-6);
/* flights only, the Vitality Health part: the same base fare at 25% instead of 10% */
const mFly = window_({ 'fee.account': fig(435), 'spend.card': fig(20000), 'travel.vitality': fig(1000) });
const stFly = buildStatement(mFly, settings(), null, { products: ALL, vitality: VIT });
const fs0 = flightShare(settings(), stFly);
/* flightShare mirrors the model: the travel lines are base × each part */
const fare = 1000 / (1 - fs0.d) * 12;
near(stFly.lines.find(l => l.key === 'travel.health').annual, fare * fs0.hp, 'flightShare matches the model (Vitality Health part)', 1e-6);
near(stFly.lines.find(l => l.key === 'travel.bank').annual, fare * (fs0.d - fs0.hp), 'flightShare matches the model (the bank part)', 1e-6);
const flyChecks = byId(run(settings(), { m: mFly }), 'checks');
const fs1 = flightShare(Object.assign(settings(), { conditions: { checks: 'both' } }), stFly);
near(flyChecks.gain, fare * (fs1.hp - fs0.hp), 'checks on flights: the same fares, Vitality Health\'s bigger part only', 1e-6);

// ── setup gating ───────────────────────────────────────────────────────
/* no Vitality Health: no health-check or gym lever */
const noHealth = run(settings(), { products: Object.assign({}, ALL, { health: false }), vitality: Object.assign({}, VIT, { health: false }) });
for (const id of ['checks', 'gym36', 'status.health']) assert.ok(!ids(noHealth).includes(id), `no Vitality Health: no ${id}`);
/* checks and gym already done: none */
const done = settings(); done.conditions = { checks: 'both', gym36: true, insurePlan: '', homeCover: '' };
const doneL = run(done);
assert.ok(!ids(doneL).includes('checks') && !ids(doneL).includes('gym36'), 'already done: no checks or gym lever');
/* answered "no": the levers are habits */
const said = settings(); said.conditions = { checks: 'none', gym36: false, insurePlan: '', homeCover: '' }; said.milesUse = 'utilities';
const saidL = run(said);
assert.strictEqual(byId(saidL, 'checks').kind, 'habit');
assert.strictEqual(byId(saidL, 'gym36').kind, 'habit');
assert.strictEqual(byId(saidL, 'dday').kind, 'habit');
/* already on Ð-Day, the virtual card and Diamond everywhere: none of those */
const top = settings();
top.status = { money: 'Diamond', health: 'Diamond', drive: 'Diamond' };
top.milesUse = 'dday';
top.rates = {};
const topL = run(top);
for (const id of ['dday', 'virtualCard', 'status.money', 'status.health', 'status.drive']) assert.ok(!ids(topL).includes(id), `already there: no ${id}`);
/* the virtual card share not typed: it counts as all virtual, so no lever */
assert.ok(!ids(run(Object.assign(settings(), { rates: {} }))).includes('virtualCard'), 'no typed plastic share: no virtual card lever');
/* fuel already on the Discovery card: no fuel-card lever, and the car score now pays */
const mDiscFuel = window_(Object.assign(samFigures(), { 'disc.fuel.bp': fig(1500, 'Sam Card') }));
const discFuelL = run(settings(), { m: mDiscFuel });
assert.ok(!ids(discFuelL).includes('driveFuelCard'), 'fuel already on the Discovery card: no fuel lever');
assert.ok(ids(discFuelL).includes('status.drive'), 'and the next car score pays more fuel back');
assert.strictEqual(byId(discFuelL, 'status.drive').title, 'A Silver car score');
/* no Vitality Drive: no fuel or car score lever */
const noDrive = run(settings(), { m: mDiscFuel, products: Object.assign({}, ALL, { insure: false }), vitality: Object.assign({}, VIT, { drive: false }) });
assert.ok(!ids(noDrive).includes('driveFuelCard') && !ids(noDrive).includes('status.drive'), 'no Vitality Drive: no fuel levers');
/* no Discovery Bank: no bank levers at all */
const noBank = run(settings(), { products: Object.assign({}, ALL, { bank: false }), vitality: Object.assign({}, VIT, { money: false }) });
for (const id of ['dday', 'virtualCard', 'driveFuelCard', 'status.money', 'downgrade', 'upgrade']) assert.ok(!ids(noBank).includes(id), `no bank: no ${id}`);
/* a "Not for me" benefit gains nothing, so its lever goes */
const noGym = settings(); noGym.benefits = { gym: 'none' };
assert.ok(!ids(run(noGym)).includes('gym36'), 'gym set to Not for me: no gym lever');
/* a short import: no package switch offered */
const short = window_(samFigures());
short.dataMonths = MONTHS.slice(0, 3);
const shortL = run(settings(), { m: short });
assert.ok(!ids(shortL).includes('downgrade') && !ids(shortL).includes('upgrade'), 'thin data: no package switch');
/* already on the Credit Card Account: no downgrade; the Suite only when its rewards beat its fees */
const card = settings(); card.bankKind = 'card';
const cardL = run(card);
assert.ok(!ids(cardL).includes('downgrade'), 'on the Credit Card Account: no downgrade');
const up = byId(cardL, 'upgrade');
const sSuite = Object.assign(settings(), { bankKind: 'suite' });
const { bankProductOf } = require(path.join(root, 'src/rates.js'));
const feeYear = (bankProductOf(sSuite).total - bankProductOf(card).total) * 12;
const stCard = buildStatement(m, card, null, { products: ALL, vitality: VIT });
const upGain = worth(sameThingsBought(m, card, sSuite, stCard), sSuite) - worthOf(stCard) - feeYear;
if (upGain >= MIN_GAIN) near(up.gain, upGain, 'upgrade gain = rewards difference less the Suite\'s higher fees');
else assert.ok(!up, `upgrade left out when it does not pay (${Math.round(upGain)})`);
/* a big spender at Diamond who flies a lot: the Suite's bigger flight
   discount beats its higher fees */
const mBig = window_(Object.assign(samFigures(), { 'spend.card': fig(60000), 'travel.vitality': fig(6000), 'all.travel.vitality': fig(6000) }));
const bigCardS = Object.assign(clone(card), { status: { money: 'Diamond', health: 'Bronze', drive: 'Bronze' } });
const bigSuiteS = Object.assign(clone(bigCardS), { bankKind: 'suite' });
const bigCard = run(bigCardS, { m: mBig });
const bigSt = buildStatement(mBig, bigCardS, null, { products: ALL, vitality: VIT });
const bigGain = worth(sameThingsBought(mBig, bigCardS, bigSuiteS, bigSt), bigSuiteS) - worthOf(bigSt) - feeYear;
assert.ok(bigGain >= MIN_GAIN, `the Suite pays for this household (${Math.round(bigGain)})`);
near(byId(bigCard, 'upgrade').gain, bigGain, 'big spender: upgrade gain = statement difference less the fees');
assert.strictEqual(byId(bigCard, 'upgrade').title, 'The Black Suite instead');
assert.ok(feeYear > 0, 'the Suite costs more a month, and that is netted');
/* a small household: every gain under R100 is dropped */
const mTiny = window_({ 'fee.account': fig(40), 'spend.card': fig(300) });
const tiny = run(Object.assign(settings(), { bankKind: 'transaction' }), { m: mTiny, products: Object.assign({}, ALL, { insure: false }), vitality: { money: true, health: false, drive: false } });
assert.deepStrictEqual(ids(tiny), [], `tiny household: nothing worth R100 (${ids(tiny)})`);
/* nothing to work with */
assert.deepStrictEqual(computeLevers({}), []);
assert.deepStrictEqual(computeLevers({ m, s: settings() }), [], 'no buildStatement: nothing');

// ── the renderer ───────────────────────────────────────────────────────
/* a tiny DOM: enough for dom.js el() and the button wiring */
function fakeDocument() {
  const make = tag => {
    const n = {
      tagName: tag.toUpperCase(), children: [], attrs: {}, listeners: {}, hidden: false, className: '', id: '', type: '',
      _text: '',
      get textContent() { return this._text + this.children.map(c => c.textContent).join(''); },
      set textContent(v) { this._text = String(v); this.children = []; },
      get firstChild() { return this.children[0] || null; },
      appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
      removeChild(c) { this.children = this.children.filter(x => x !== c); return c; },
      setAttribute(k, v) { this.attrs[k] = String(v); },
      getAttribute(k) { return this.attrs[k]; },
      addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); },
      click() { for (const f of this.listeners.click || []) f({ preventDefault() {} }); },
      classList: { add() {}, toggle() {} },
    };
    return n;
  };
  return { createElement: make };
}
global.document = fakeDocument();
const all = (node, cls) => {
  const out = [];
  const walk = n => { if ((' ' + n.className + ' ').includes(' ' + cls + ' ')) out.push(n); n.children.forEach(walk); };
  walk(node);
  return out;
};
const ctx = { s: settings(), period: 'annual', levers: sam };
const panel = document.createElement('div');
renderLevers(panel, ctx);
assert.strictEqual(all(panel, 'dc-lev-h')[0].textContent, HEADING, 'the heading');
assert.strictEqual(HEADING, 'What would add more, by these figures');
assert.strictEqual(all(panel, 'dc-lev-card').length, sam.length, 'one card per lever');
const first = all(panel, 'dc-lev-card')[0];
assert.strictEqual(all(first, 'dc-lev-title')[0].textContent, sam[0].title);
assert.strictEqual(all(first, 'dc-lev-line')[0].textContent, sam[0].line);
assert.ok(/a year more$/.test(all(first, 'dc-lev-fig')[0].textContent), 'figure says "a year more"');
const btn = all(first, 'dc-lev-btn')[0];
assert.strictEqual(btn.tagName, 'BUTTON');
assert.strictEqual(btn.type, 'button');
assert.ok(btn.textContent.includes('How it works'), 'the button is named');
const body = all(first, 'dc-lev-body')[0];
assert.strictEqual(btn.getAttribute('aria-controls'), body.id);
assert.strictEqual(btn.getAttribute('aria-expanded'), 'false');
assert.strictEqual(body.hidden, true, 'what to do waits behind the button');
assert.strictEqual(all(body, 'dc-lev-how')[0].textContent, sam[0].how);
btn.click();
assert.strictEqual(btn.getAttribute('aria-expanded'), 'true');
assert.strictEqual(body.hidden, false, 'the button opens it');
btn.click();
assert.strictEqual(body.hidden, true, 'and closes it');
/* a month at a time */
const f = figureOf({ gain: 1200 }, { period: 'monthly' });
assert.strictEqual(f.label, 'a month more');
assert.strictEqual(f.amount.replace(/\s/g, ' '), 'R 100');
assert.strictEqual(figureOf({ gain: 1200 }, { period: 'annual' }).label, 'a year more');
assert.strictEqual(figureOf({ gain: 1200 }, { period: 'annual', money: v => 'X' + v, per: v => v / 2 }).amount, 'X600', 'ctx.money and ctx.per are used');
/* the Overview's top three, and a way to all of them */
let asked = 0;
const p3 = document.createElement('div');
renderLevers(p3, Object.assign({}, ctx, { limit: 3, onAll: () => { asked++; } }));
assert.strictEqual(all(p3, 'dc-lev-card').length, 3, 'limit 3');
const allBtn = all(p3, 'dc-lev-all')[0];
assert.ok(allBtn && allBtn.textContent === 'All ways to get more');
allBtn.click();
assert.strictEqual(asked, 1);
/* nothing to suggest */
const p0 = document.createElement('div');
renderLevers(p0, Object.assign({}, ctx, { levers: [] }));
assert.strictEqual(all(p0, 'dc-lev-none')[0].textContent, NONE);
assert.strictEqual(NONE, 'By these figures, nothing here would add R 100 or more a year.');
assert.strictEqual(all(p0, 'dc-lev-card').length, 0);
/* no heading when the page draws its own */
const pn = document.createElement('div');
renderLevers(pn, Object.assign({}, ctx, { heading: false }));
assert.strictEqual(all(pn, 'dc-lev-h').length, 0);
delete global.document;

console.log(`levers: ${sam.length} levers for the made-up household (${ids(sam).join(', ')}) — all checks pass`);
