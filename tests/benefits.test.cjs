'use strict';
const assert = require('node:assert');
const { BENEFITS, GROUPS, WEIGHT, benefitsFor, availableFor, offerText, bankKindOf, suggestBenefits, levelOf } = require('../src/benefits');
const { RATES, DIAMOND, SUITE_TABLES } = require('../src/rates');

/* A made-up household over twelve months. */
const fig = perMonth => ({ total: Object.values(perMonth).reduce((a, b) => a + b, 0), count: 1, perMonth });
const months = Array.from({ length: 12 }, (_, i) => { const d = new Date(2025, 9 + i, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; });
const win = figures => ({ from: months[0], to: months[11], months, figures });
const R = s => s.replace(/[\s  ]/g, ' ');

// the table is fixed by the contract
assert.deepStrictEqual(BENEFITS.map(b => b.id), ['miles', 'healthyFood', 'healthyCare', 'fuel', 'flights', 'gameboard', 'appleWatch', 'interest', 'milesPlus', 'gym']);
const B = id => BENEFITS.find(b => b.id === id);
assert.deepStrictEqual(B('miles').lineKeys, ['miles.card', 'miles.partners']);
assert.deepStrictEqual(B('healthyFood').lineKeys, ['miles.healthyFood', 'healthyFood.health']);
assert.deepStrictEqual(B('healthyCare').lineKeys, ['miles.healthyCare', 'healthyCare.health']);
assert.deepStrictEqual(B('fuel').lineKeys, ['fuel.money', 'fuel.drive']);
assert.deepStrictEqual(B('flights').lineKeys, ['travel.bank', 'travel.health']);
assert.deepStrictEqual(B('gameboard').lineKeys, ['gameboard', 'activeRewards', 'activeRewards.basic']);
assert.deepStrictEqual(B('appleWatch').lineKeys, ['appleWatch']);
assert.deepStrictEqual(B('interest').lineKeys, ['interest.boost', 'interest.cashback']);
assert.deepStrictEqual(B('milesPlus').lineKeys, ['miles.uplift']);
assert.deepStrictEqual(B('gym').lineKeys, []);
assert.deepStrictEqual(B('gym').products, ['health']);
assert.deepStrictEqual(B('fuel').products, ['bank', 'insure']);
assert.ok(BENEFITS.every(b => b.label && /\?$/.test(b.question)), 'every benefit has a label and a question');
assert.deepStrictEqual(WEIGHT, { full: 1, half: 0.5, none: 0 });

// an empty budget: nothing seen, so only the always-on Miles count
const empty = suggestBenefits(win({}), null, {});
assert.deepStrictEqual(Object.keys(empty).sort(), BENEFITS.map(b => b.id).sort());
const lv = sg => Object.fromEntries(Object.entries(sg).map(([k, v]) => [k, v.suggested]));
assert.deepStrictEqual(lv(empty), { miles: 'full', healthyFood: 'none', healthyCare: 'none', fuel: 'none', flights: 'none', gym: 'none', appleWatch: 'none', interest: 'none', milesPlus: 'none', gameboard: 'half' });
for (const v of Object.values(empty)) assert.ok(v.why && !/−|-\d/.test(v.why), 'plain words, no minus signs: ' + v.why);

// gym: any payment to Virgin Active or Planet Fitness
const gym = suggestBenefits(win({ gym: fig({ [months[3]]: 2000, [months[4]]: 2120 }) }), null, {});
assert.strictEqual(gym.gym.suggested, 'full');
assert.strictEqual(R(gym.gym.why), 'You paid R 4 120 to Virgin Active or Planet Fitness in the last 12 months.');
assert.ok(/no payments to Virgin Active/.test(empty.gym.why));
// paid from another bank (all.gym) counts too: Vitality Health pays whichever card
assert.strictEqual(suggestBenefits(win({ 'all.gym': fig({ [months[0]]: 450 }) }), null, {}).gym.suggested, 'full');

// flights: Vitality Travel bookings, or receipts typed in
const fl = suggestBenefits(win({ 'travel.vitality': fig({ [months[5]]: 3000 }) }), null, {});
assert.strictEqual(fl.flights.suggested, 'full');
assert.ok(/R 3 000 to Vitality Travel/.test(R(fl.flights.why)));
assert.strictEqual(suggestBenefits(win({}), null, { travel: { discount: 900, baseFare: 4000 } }).flights.suggested, 'full', 'receipts say you fly');
assert.ok(/no Vitality Travel/.test(empty.flights.why));

// HealthyFood: Checkers, Woolworths or Pick n Pay
const food = suggestBenefits(win({ 'shop.woolworths': fig({ [months[0]]: 1000 }), 'all.shop.pnp': fig({ [months[1]]: 500 }) }), null, {});
assert.strictEqual(food.healthyFood.suggested, 'full');
assert.strictEqual(R(food.healthyFood.why), 'You spent R 1 500 at Woolworths and Pick n Pay in the last 12 months.');
assert.ok(/Checkers, Woolworths or Pick n Pay/.test(empty.healthyFood.why));

// HealthyCare: Clicks or Dis-Chem
const care = suggestBenefits(win({ 'shop.dischem': fig({ [months[2]]: 640 }) }), null, {});
assert.strictEqual(care.healthyCare.suggested, 'full');
assert.ok(/R 640 at Dis-Chem/.test(R(care.healthyCare.why)));
assert.strictEqual(empty.healthyCare.suggested, 'none');

// fuel: bp and Shell earn; other brands earn nothing, and the why says so
const fuel = suggestBenefits(win({ 'fuel.bp': fig({ [months[0]]: 800 }), 'fuel.shell': fig({ [months[1]]: 700 }), 'fuel.other': fig({ [months[2]]: 300 }) }), null, {});
assert.strictEqual(fuel.fuel.suggested, 'full');
assert.ok(/R 1 500 on fuel at bp and Shell/.test(R(fuel.fuel.why)) && /R 300 at other fuel brands, which earn nothing/.test(R(fuel.fuel.why)));
const other = suggestBenefits(win({ 'fuel.other': fig({ [months[0]]: 2500 }) }), null, {});
assert.strictEqual(other.fuel.suggested, 'none');
assert.ok(/R 2 500 on fuel/.test(R(other.fuel.why)) && /other brands, which earn nothing/.test(other.fuel.why));
assert.strictEqual(suggestBenefits(win({ 'insure.driveCash': fig({ [months[0]]: 75 }) }), null, {}).fuel.suggested, 'full', 'Drive cash paid means you fill up at bp or Shell');

// Apple Watch: watch payments seen, or the full payment typed in
const watch = suggestBenefits(win({ 'benefit.appleWatch': fig({ [months[0]]: 150, [months[1]]: 225 }) }), null, {});
assert.strictEqual(watch.appleWatch.suggested, 'full');
assert.ok(/R 375 in Apple Watch payments/.test(R(watch.appleWatch.why)));
assert.strictEqual(suggestBenefits(win({}), null, { rates: { appleWatchMonthly: 300 } }).appleWatch.suggested, 'full');
assert.strictEqual(empty.appleWatch.suggested, 'none');

// interest: extra interest or cashback paid
const int = suggestBenefits(win({ 'interest.boost': fig({ [months[0]]: 40 }), 'interest.cashback': fig({ [months[1]]: 20 }) }), null, {});
assert.strictEqual(int.interest.suggested, 'full');
assert.ok(/R 60 of extra interest and cashback/.test(R(int.interest.why)));
assert.strictEqual(empty.interest.suggested, 'none');

// Miles: always full, earned on every card payment
const card = suggestBenefits(win({ 'spend.card': fig({ [months[0]]: 12000 }) }), null, {});
assert.strictEqual(card.miles.suggested, 'full');
assert.ok(/R 12 000 by Discovery Bank card/.test(R(card.miles.why)) && /every card payment/.test(card.miles.why));

// Miles+: full only when the statement shows Miles spent above face value (10c)
const ms = extra => ({ months: [months[10], months[11]], figures: {}, spentMiles: 10000, spentRand: 1500, ...extra });
const up = suggestBenefits(win({}), ms(), {});
assert.strictEqual(up.milesPlus.suggested, 'full');
assert.ok(/R 1 500 of goods/.test(R(up.milesPlus.why)) && /R 500 more than their face value/.test(R(up.milesPlus.why)));
assert.strictEqual(suggestBenefits(win({}), ms({ spentRand: 1000 }), {}).milesPlus.suggested, 'none', 'at face value');
assert.strictEqual(suggestBenefits(win({}), ms({ spentMiles: 0, spentRand: 0 }), {}).milesPlus.suggested, 'none', 'nothing spent');
assert.strictEqual(empty.milesPlus.suggested, 'none', 'no statement');
// a statement for months outside the window is no statement
assert.strictEqual(suggestBenefits(win({}), ms({ months: ['2024-01'] }), {}).milesPlus.suggested, 'none');

// gameboard: full with gameboard Miles, none without, half with no statement
const gb = suggestBenefits(win({}), ms({ figures: { gameboard: 2000 } }), {});
assert.strictEqual(gb.gameboard.suggested, 'full');
assert.ok(/2 000 Miles from the gameboard/.test(R(gb.gameboard.why)) && /worth R 200/.test(R(gb.gameboard.why)));
assert.strictEqual(suggestBenefits(win({}), ms(), {}).gameboard.suggested, 'none');
assert.strictEqual(empty.gameboard.suggested, 'half');
assert.ok(/counts at half/.test(empty.gameboard.why));
assert.strictEqual(suggestBenefits(win({}), ms({ months: ['2024-01'], figures: { gameboard: 2000 } }), {}).gameboard.suggested, 'half', 'out-of-window statement');

// the statement's HealthyFood Miles show you shop there even when the budget does not
assert.strictEqual(suggestBenefits(win({}), ms({ figures: { 'health.healthyFood': 3000 } }), {}).healthyFood.suggested, 'full');

// levelOf: your own choice wins, then the suggestion, then full
assert.strictEqual(levelOf({ benefits: { gym: 'none' } }, 'gym', { suggested: 'full' }), 'none');
assert.strictEqual(levelOf({ benefits: { gym: 'half' } }, 'gym', { suggested: 'none' }), 'half');
assert.strictEqual(levelOf({ benefits: {} }, 'gym', { suggested: 'none' }), 'none');
assert.strictEqual(levelOf({}, 'gym', 'half'), 'half', 'a bare level works too');
assert.strictEqual(levelOf({ benefits: { gym: 'lots' } }, 'gym', { suggested: 'none' }), 'none', 'an unknown level is ignored');
assert.strictEqual(levelOf(undefined, 'gym', undefined), 'full');
assert.strictEqual(levelOf({ benefits: { toString: 'none' } }, 'gym', null), 'full');

// the Benefits page: every entry says what Discovery offers, what it needs,
// where it sits and how the plugin measures it, in plain words
const GROUP_IDS = ['everyday', 'health', 'travel', 'car', 'money'];
assert.deepStrictEqual(GROUPS.map(g => g.id), GROUP_IDS);
for (const b of BENEFITS) {
  for (const f of ['offer', 'needs', 'measuredBy']) {
    assert.ok(typeof b[f] === 'string' && b[f].length > 8, `${b.id}.${f}`);
    assert.ok(!/undefined|NaN|Infinity|−/.test(b[f]), `${b.id}.${f} reads cleanly: ${b[f]}`);
  }
  assert.ok(/\.$/.test(b.offer) && /\.$/.test(b.measuredBy), `${b.id} sentences end in a full stop`);
  assert.ok(GROUP_IDS.includes(b.group), `${b.id}.group`);
}
// headline figures come from rates.js; the static offer quotes the best on ANY tier
const topAll = band => Math.max(...Object.values(SUITE_TABLES).map(t => (t[band] ? Math.max(...t[band].Diamond) : 0)));
assert.strictEqual(topAll('healthyFood'), 50, 'Purple goes to 50%');
assert.ok(R(B('gym').offer).includes(`${RATES.gymDiscountPct.value}% off`) && R(B('gym').offer).includes('75% off a one-gym membership') && /36 times/.test(B('gym').offer), B('gym').offer);
assert.ok(R(B('fuel').offer).includes(`${topAll('fuel')}% more`), B('fuel').offer);
assert.ok(R(B('fuel').offer).includes(`${Math.max(...Object.values(RATES.fuelDrivePct.byStatus))}% back`) && /half that on Essential/.test(B('fuel').offer));
assert.ok(R(B('fuel').offer).includes('R 1 500 of fuel') && R(B('fuel').offer).includes('R 3 000 when Discovery also insures your home'), B('fuel').offer);
assert.ok(R(B('healthyFood').offer).includes('R 5 000 a month') && R(B('healthyFood').offer).includes('50% more'), B('healthyFood').offer);
assert.ok(R(B('healthyFood').offer).includes('10% back') && R(B('healthyFood').offer).includes('25% once you have done your Vitality Age'), 'the health checks, not a status');
assert.ok(R(B('healthyCare').offer).includes('10% back') && R(B('healthyCare').offer).includes('25% once'), B('healthyCare').offer);
assert.ok(R(B('flights').offer).includes(`${RATES.travelHealthPct.value}% off`) && R(B('flights').offer).includes(`${topAll('flightsLocal')}% more on local flights`), B('flights').offer);
assert.ok(R(B('miles').offer).includes('every R 15') && R(B('miles').offer).includes('R 10 000 to R 30 000'), B('miles').offer);
assert.ok(R(B('appleWatch').offer).includes('R 1 199'));
assert.ok(R(B('interest').offer).includes('1,5%'), 'a decimal comma');
// spending Miles: Discovery Miles partners, 5% per Vitality programme, double on Ð-Day
assert.ok(!/Miles\+/.test(B('milesPlus').offer + B('milesPlus').question), 'Miles+ is where you earn, not spend');
assert.ok(R(B('milesPlus').offer).includes('5% off for each Vitality programme') && R(B('milesPlus').offer).includes('up to 15%') && R(B('milesPlus').offer).includes('up to 30%'), B('milesPlus').offer);
assert.strictEqual(B('gym').needs, 'Vitality Health');
assert.ok(/Vitality Drive/.test(B('fuel').needs) && /Vitality Money/.test(B('fuel').needs));
assert.ok(/Miles statement/.test(B('gameboard').measuredBy) && /do not show/.test(B('gameboard').measuredBy), 'says the bank statements cannot show it');

// benefitsFor: only benefits a true product makes available, grouped in page order
const ids = p => benefitsFor(p).map(b => b.id);
assert.deepStrictEqual(ids({ bank: false, health: true, gap: true, insure: false, life: false }), ['healthyFood', 'healthyCare', 'gameboard', 'gym', 'flights']);
assert.deepStrictEqual(ids({ insure: true }), ['fuel']);
assert.deepStrictEqual(ids({ bank: true }), ['miles', 'healthyFood', 'healthyCare', 'gameboard', 'appleWatch', 'flights', 'fuel', 'interest', 'milesPlus']);
assert.strictEqual(ids({ bank: true, health: true, insure: true }).length, BENEFITS.length, 'everything, each once');
assert.deepStrictEqual(ids({ bank: null, health: null }), [], 'only true counts (resolveProducts gives booleans)');
assert.deepStrictEqual(ids({ gap: true, life: true }), []);
assert.deepStrictEqual(ids(undefined), []);
const all = benefitsFor({ bank: true, health: true, insure: true });
assert.deepStrictEqual(all.map(b => GROUP_IDS.indexOf(b.group)), all.map(b => GROUP_IDS.indexOf(b.group)).slice().sort((a, b) => a - b), 'grouped in page order');

// ── what this person's setup unlocks (availableFor) ─────────────────────
const ALL = { bank: true, health: true, gap: true, insure: true, life: true };
const V = (money, health, drive) => ({ money, health, drive });
const av = (settings, products, vitality) => availableFor(settings, products, vitality);
const full = av({ bankKind: 'suite' }, ALL, V(true, true, true));
assert.ok(BENEFITS.every(b => full.benefits[b.id].available && !full.benefits[b.id].reason), 'a Suite with every Vitality unlocks everything');
assert.strictEqual(bankKindOf({}), 'suite', 'not answered reads as a Suite, as before');
assert.deepStrictEqual(av({ bankKind: null }, ALL, V(true, true, true)).lines, full.lines);
// a transaction account only: Miles on the debit card, the interest boost and (bundled
// fees) the flight extra, but no HealthyFood, HealthyCare or fuel extra and no card cashback
const tx = av({ bankKind: 'transaction' }, ALL, V(true, true, true));
['miles.card', 'interest.boost', 'gameboard', 'healthyFood.health', 'travel.bank'].forEach(k => assert.ok(tx.lines.has(k), k));
['miles.healthyFood', 'miles.healthyCare', 'fuel.money', 'interest.cashback', 'appleWatch'].forEach(k => assert.ok(!tx.lines.has(k), k));
assert.ok(tx.benefits.healthyFood.available && /credit card/.test(tx.benefits.healthyFood.note), 'the Vitality Health part stays, the note says what is missing');
assert.strictEqual(tx.benefits.appleWatch.available, false);
assert.ok(/Suite/.test(tx.benefits.appleWatch.reason));
// a transaction account without Vitality Money: no Vitality Money extras at all
const txNo = av({ bankKind: 'transaction' }, ALL, V(false, true, true));
['miles.card', 'miles.partners', 'interest.boost', 'miles.uplift', 'gameboard', 'miles.healthyFood', 'fuel.money', 'travel.bank'].forEach(k => assert.ok(!txNo.lines.has(k), k));
assert.ok(/Vitality Money/.test(txNo.benefits.interest.reason));
assert.ok(txNo.lines.has('fuel.drive') && txNo.lines.has('gym'), 'Drive and Health go on');
// savings only: no Miles, and Vitality Money cannot come with it
const sav = av({ bankKind: 'savings' }, ALL, V(true, true, true));
['miles.card', 'miles.partners', 'gameboard', 'interest.boost', 'miles.uplift'].forEach(k => assert.ok(!sav.lines.has(k), k));
assert.strictEqual(sav.benefits.miles.available, false);
assert.ok(/savings account/.test(sav.benefits.miles.reason), sav.benefits.miles.reason);
assert.ok(/savings account/.test(sav.benefits.interest.reason), sav.benefits.interest.reason);
// a Credit Card Account on its own: everything from the bank except the Suite's watch
const cc = av({ bankKind: 'card' }, ALL, V(true, true, true));
assert.ok(cc.lines.has('miles.healthyFood') && cc.lines.has('interest.cashback'));
assert.ok(!cc.lines.has('appleWatch'), 'the watch needs a Suite');
// the watch also needs Vitality Health
assert.ok(!av({ bankKind: 'suite' }, ALL, V(true, false, true)).lines.has('appleWatch'));
// no Vitality Health: the gym, Health's HealthyFood, HealthyCare and flight shares and its rewards go
const noH = av({ bankKind: 'suite' }, ALL, V(true, false, true));
['gym', 'healthyFood.health', 'healthyCare.health', 'travel.health', 'activeRewards', 'activeRewards.basic'].forEach(k => assert.ok(!noH.lines.has(k), k));
assert.strictEqual(noH.benefits.gym.available, false);
assert.ok(/Vitality Health/.test(noH.benefits.gym.reason));
assert.ok(noH.benefits.healthyFood.available, 'the bank\'s HealthyFood extra stays');
// no Vitality Drive: Drive's fuel goes, the bank's fuel extra stays
const noD = av({ bankKind: 'suite' }, ALL, V(true, true, false));
assert.ok(!noD.lines.has('fuel.drive') && noD.lines.has('fuel.money'));
assert.ok(noD.benefits.fuel.available && /Vitality Drive/.test(noD.benefits.fuel.note));
// no Discovery Bank: nothing from the bank
const noBank = av({ bankKind: 'suite' }, { ...ALL, bank: false }, V(true, true, true));
['miles', 'interest', 'milesPlus', 'appleWatch'].forEach(id => assert.strictEqual(noBank.benefits[id].available, false, id));
assert.ok(/do not bank with Discovery/.test(noBank.benefits.miles.reason));
assert.ok(noBank.benefits.gym.available && noBank.benefits.flights.available, 'Vitality Health still counts');

// benefitsFor with the setup hides what is not available; the one-argument call is unchanged
const healthOnly = { bank: false, health: true, gap: false, insure: false, life: false };
assert.deepStrictEqual(benefitsFor(healthOnly, { bankKind: null }, V(false, false, false)).map(b => b.id), [], 'Discovery Health without Vitality Health: nothing');
assert.deepStrictEqual(benefitsFor(healthOnly, { bankKind: null }, V(false, true, false)).map(b => b.id), ['healthyFood', 'healthyCare', 'gameboard', 'gym', 'flights']);
assert.deepStrictEqual(benefitsFor({ bank: true }, { bankKind: 'savings' }, V(false, false, false)).map(b => b.id), []);
assert.ok(!benefitsFor(ALL, { bankKind: 'card' }, V(true, true, true)).some(b => b.id === 'appleWatch'));
assert.strictEqual(benefitsFor(ALL).length, BENEFITS.length, 'products only, as before');
// settings without a vitality map: settings.vitality, else taken from the products
assert.ok(!benefitsFor(ALL, { bankKind: 'suite', vitality: { health: false } }).some(b => b.id === 'gym'));
assert.ok(benefitsFor(ALL, { bankKind: 'suite', vitality: {} }).some(b => b.id === 'gym'));

// offerText quotes this person's tier and statuses
const ot = (id, settings) => R(offerText(id, settings));
const blackDiamond = { suite: 'Black', status: { money: 'Diamond', health: 'Gold', drive: 'Silver' } };
assert.ok(BENEFITS.every(b => !/Miles\+/.test(offerText(b, blackDiamond))), 'no Miles+ in what you spend');
const goldBlue = { suite: 'Gold', status: { money: 'Blue', health: 'Blue', drive: 'Blue' } };
assert.ok(ot('miles', blackDiamond).includes('every R 15 you pay') && ot('miles', blackDiamond).includes('Diamond Vitality Money status on the Black Suite'), ot('miles', blackDiamond));
assert.ok(ot('miles', goldBlue).includes('every R 100 you pay') && ot('miles', goldBlue).includes('R 10 000 a month'), ot('miles', goldBlue));
assert.notStrictEqual(ot('healthyFood', blackDiamond), ot('healthyFood', { ...blackDiamond, status: { ...blackDiamond.status, money: 'Gold' } }), 'changes with the bank status');
assert.ok(ot('healthyFood', blackDiamond).includes(`${Math.max(...DIAMOND.healthyFood)}% more`));
assert.ok(ot('fuel', blackDiamond).includes(`${RATES.fuelDrivePct.byStatus.Silver}% back at bp and Shell at your Silver Drive status`), ot('fuel', blackDiamond));
assert.ok(/nothing back at your Blue Drive status/.test(ot('fuel', goldBlue)));
assert.ok(/No extra interest at your Blue Vitality Money status on the Gold Suite/.test(ot('interest', goldBlue)));
assert.ok(ot('interest', blackDiamond).includes('1,5% more'));
assert.ok(/Credit Card Account/.test(ot('miles', { ...blackDiamond, bankKind: 'card' })), 'a card on its own is named as such');
// the person's actual product, not the Suite of its tier
const goldTx = { suite: 'Gold', bankKind: 'transaction', status: { money: 'Blue', health: 'Blue', drive: 'Blue' } };
assert.ok(ot('miles', goldTx).includes('Blue Vitality Money status on the Gold Transaction Account (bundled fees)') && !/Gold Suite/.test(ot('miles', goldTx)), ot('miles', goldTx));
assert.ok(/Gold Transaction Account/.test(ot('interest', goldTx)) && !/Gold Suite/.test(ot('healthyFood', goldTx)), ot('healthyFood', goldTx));
// no base Miles (pay-as-you-transact, savings only): says so, never the Black Diamond sentence
const payt = { ...goldTx, bankFees: 'payt' };
assert.strictEqual(ot('miles', payt), 'The Gold Transaction Account (pay-as-you-transact) earns no Miles on card spend.');
assert.strictEqual(ot('miles', { ...goldTx, bankKind: 'savings' }), 'The Ðiscovery Account (savings only) earns no Miles on card spend.');
// HealthyFood, HealthyCare and flights: the health checks set Vitality Health's part, not the status
for (const id of ['healthyFood', 'healthyCare', 'flights']) {
  const lo = ot(id, { ...blackDiamond, status: { ...blackDiamond.status, health: 'Blue' } });
  const hi = ot(id, { ...blackDiamond, status: { ...blackDiamond.status, health: 'Diamond' } });
  assert.ok(/gives 10% /.test(lo) && /up to 25% once you have done your Vitality Age/.test(lo), lo);
  assert.strictEqual(lo.replace('Blue Vitality Health', 'X'), hi.replace('Diamond Vitality Health', 'X'), `${id}: only the status name changes`);
  assert.ok(/not your Blue Vitality Health status/.test(lo), 'quotes the person\'s status and says it does not decide it');
}
// a typed figure (they have done both checks) is quoted, with no "goes up to"
const typed25 = ot('healthyFood', { ...blackDiamond, rates: { healthyFoodHealthPct: 25 } });
assert.ok(/gives 25% back on HealthyFood/.test(typed25) && !/goes up to/.test(typed25), typed25);
// the gym: 50% unless 36 workouts; the status does not change it
assert.ok(/^50% off Virgin Active/.test(ot('gym', blackDiamond)) && /75% off a one-gym membership/.test(ot('gym', blackDiamond)) && /not your Gold Vitality Health status/.test(ot('gym', blackDiamond)), ot('gym', blackDiamond));
// fuel: the Drive limit grows with the Drive status only when Discovery insures the home
assert.ok(ot('fuel', blackDiamond).includes('R 1 500 of fuel') && ot('fuel', blackDiamond).includes('goes up to R 2 250'), ot('fuel', blackDiamond));
assert.ok(ot('fuel', { ...blackDiamond, status: { ...blackDiamond.status, drive: 'Diamond' } }).includes('goes up to R 3 000'));
// spending Miles: 5% for each programme you have, double on Ð-Day
const v2 = ot('milesPlus', { ...blackDiamond, vitality: { money: true, health: true, drive: false } });
assert.ok(/two Vitality programmes/.test(v2) && /get 10% off at Discovery Miles partners/.test(v2) && /Ð-Day \(the 15th\) it is 20%/.test(v2), v2);
assert.ok(/three Vitality programmes/.test(ot('milesPlus', { vitality: { money: true, health: true, drive: true } })));
assert.strictEqual(ot('milesPlus', {}), R(B('milesPlus').offer), 'no programmes known: the general offer');
assert.strictEqual(offerText(B('gameboard'), blackDiamond), B('gameboard').offer, 'no figures: the static offer');
assert.ok(BENEFITS.every(b => offerText(b, {}) && !/undefined|NaN/.test(offerText(b, {}))), 'empty settings still read');
assert.strictEqual(offerText('nope', {}), '');

// no Vitality Money: no Miles-spending discount quoted, as the model counts none
{
  const bm = BENEFITS.find(x => x.id === 'milesPlus');
  assert.ok(/need Vitality Money/.test(offerText(bm, { vitality: { money: false, health: true, drive: true }, status: {} })));
  assert.ok(/10% off .* it is 20%/.test(offerText(bm, { vitality: { money: true, health: true }, status: {} })), 'two programmes: 10% everyday, 20% on Ð-Day');
}
console.log('benefits OK');
