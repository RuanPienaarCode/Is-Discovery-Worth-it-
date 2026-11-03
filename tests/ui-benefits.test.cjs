'use strict';
/* The Benefits page's DOM-free helpers (src/ui-benefits.js): the two totals
   are the sums the page shows, a level equal to the suggestion is not
   stored, and the sentence under the figures reads in plain words. Made-up
   household only. */
const assert = require('node:assert');
const path = require('node:path');
const Module = require('node:module');

const root = path.join(__dirname, '..');
const origLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'obsidian') return { setIcon: () => {} };
  return origLoad.call(this, request, ...rest);
};
const { benefitTotals, setLevel, shareLine, oneLiner, shortReason, MARK_OF } = require(path.join(root, 'src/ui-benefits.js'));
const { buildStatement } = require(path.join(root, 'src/model.js'));
const { BENEFITS, GROUPS } = require(path.join(root, 'src/benefits.js'));
const { MARKS } = require(path.join(root, 'src/art.js'));
Module._load = origLoad;

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg || ''} ${a} != ${b}`);
const fig = perMonth => ({ total: Object.values(perMonth).reduce((a, b) => a + b, 0), count: 1, perMonth });
const m = {
  from: '2026-08', to: '2026-09', months: ['2026-08', '2026-09'], rowsSeen: 40,
  figures: {
    'fee.account': fig({ '2026-08': 430, '2026-09': 430 }),
    'fee.vitalityMoney': fig({ '2026-08': 98, '2026-09': 98 }),
    'spend.card': fig({ '2026-08': 10000, '2026-09': 30000 }),
    'shop.checkers': fig({ '2026-08': 1000, '2026-09': 16000 }),
    'shop.clicks': fig({ '2026-08': 500, '2026-09': 2000 }),
    'fuel.bp': fig({ '2026-08': 2000, '2026-09': 1000 }),
    'interest.boost': fig({ '2026-09': 50 }),
    'travel.vitality': fig({ '2026-09': 3000 }),
    'gym': fig({ '2026-08': 400, '2026-09': 400 }),
    'product.medical': fig({ '2026-08': 6600, '2026-09': 6600 }),
  },
};
const base = () => ({ status: { money: 'Diamond', health: 'Bronze', drive: 'Bronze' }, rates: {}, actualMiles: {}, benefits: {}, products: {}, vitality: {} });

// every mark named exists in art.js
for (const k of Object.values(MARK_OF)) assert.ok(MARKS[k], `MARK_OF names a mark art.js draws: ${k}`);

// totals are the sums over the available benefits, in GROUPS order
const s = base();
const st = buildStatement(m, s);
const t = benefitTotals(st);
const avail = BENEFITS.filter(b => st.benefits[b.id].available);
near(t.full, avail.reduce((a, b) => a + st.benefits[b.id].full, 0), 'available total');
near(t.counted, avail.reduce((a, b) => a + st.benefits[b.id].counted, 0), 'counted total');
assert.strictEqual(t.available.length + t.unavailable.length, BENEFITS.length);
const rank = id => GROUPS.findIndex(g => g.id === id);
for (let i = 1; i < t.available.length; i++) assert.ok(rank(t.available[i - 1].b.group) <= rank(t.available[i].b.group), 'grouped in GROUPS order');
assert.ok(t.full > 0 && t.counted > 0 && t.counted <= t.full, 'the made-up household gets something');

// a savings account on its own unlocks no bank benefits
const sav = Object.assign(base(), { bankKind: 'savings' });
const tSav = benefitTotals(buildStatement(m, sav));
assert.ok(tSav.unavailable.some(r => r.b.id === 'miles'), 'Miles need a card');
assert.ok(tSav.unavailable.every(r => r.x.reason), 'every unavailable benefit says why');

// setLevel: a choice equal to the suggestion is not stored
const z = { benefits: { gym: 'half' } };
assert.strictEqual(setLevel(z, 'gym', 'full', 'full'), true);
assert.ok(!('gym' in z.benefits), 'the suggestion is not stored');
assert.strictEqual(setLevel(z, 'gym', 'none', 'full'), true);
assert.strictEqual(z.benefits.gym, 'none');
assert.strictEqual(setLevel(z, 'gym', 'none', 'full'), false, 'no change');
assert.strictEqual(setLevel(z, 'gym', 'bogus', 'full'), false, 'an unknown level is ignored');
const y = {};
setLevel(y, 'miles', 'half', 'full');
assert.deepStrictEqual(y.benefits, { miles: 'half' }, 'creates settings.benefits when missing');

// choosing "Not for me" lowers what counts and leaves what is on offer
const before = benefitTotals(buildStatement(m, s));
setLevel(s, 'gym', 'none', st.benefits.gym.suggested);
const after = benefitTotals(buildStatement(m, s));
near(after.full, before.full, 'on offer unchanged');
near(after.counted, before.counted - st.benefits.gym.counted, 'gym no longer counts');

// the line under the big figure: a short fragment, no minus signs
assert.strictEqual(shareLine(10000, 4000), 'About 40% of what is on offer');
assert.strictEqual(shareLine(10000, 10000), 'The full value of what is on offer');
assert.strictEqual(shareLine(10000, 0), 'None of what is on offer yet');
assert.strictEqual(shareLine(100000, 100), 'Less than 1% of what is on offer');
assert.strictEqual(shareLine(0, 0), '', 'nothing measurable, nothing said');

// one-liners: one short line for every benefit, for every bank kind and status
for (const kind of ['suite', 'card', 'transaction', 'savings']) {
  for (const status of ['Blue', 'Gold', 'Diamond']) {
    const set = Object.assign(base(), { bankKind: kind, status: { money: status, health: status, drive: status } });
    for (const b of BENEFITS) {
      const line = oneLiner(b, set);
      assert.ok(line && line.length <= 38, `${b.id} (${kind}, ${status}): "${line}" is one short line`);
      assert.ok(!/[−]/.test(line), `${b.id}: no minus sign`);
    }
  }
}
assert.match(oneLiner(BENEFITS.find(b => b.id === 'gym'), base()), /^Up to \d+(,\d+)?% off gym fees$/);

// a reason cut to its first idea
assert.strictEqual(shortReason('It needs Vitality Health, which you do not have.'), 'It needs Vitality Health');
assert.strictEqual(shortReason('It needs a Discovery Bank credit card, in a Suite or a Credit Card Account. It needs Discovery Insure.'), 'It needs a Discovery Bank credit card');
assert.strictEqual(shortReason('You do not bank with Discovery.'), 'You do not bank with Discovery');

console.log('ui-benefits OK');
