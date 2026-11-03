'use strict';
const assert = require('node:assert');
const { buildSwitch, buildRivals } = require('../src/switch');
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg || ''} ${a} != ${b}`);

/* Made-up figures, all yearly, shaped like model.js and compare.js output. */
const st = {
  cost: 7200, value: 12000,
  chosen: { id: 'capitec', name: 'Capitec Global One', fees: 690, rewards: 300 },
  vitality: { premium: 7200, value: 15000 },
  lines: [{ key: 'fuel.drive', group: 'stays', annual: 2400 }],
};
const health = {
  current: { annual: 66000, monthly: 5500 },
  rows: [
    { id: 'dhEssential', scheme: 'Discovery', plan: 'Essential Smart', discovery: true, monthly: 3000, likeForLike: true },
    { id: 'cheapMiss', scheme: 'Cheap', plan: 'Hospital', monthly: 2000, likeForLike: false },
    { id: 'bonitas', scheme: 'Bonitas', plan: 'BonComprehensive', monthly: 4500, likeForLike: true },
    { id: 'bestmed', scheme: 'Bestmed', plan: 'Pace', monthly: 4000, likeForLike: true },
    { id: 'noPrice', scheme: 'Other', plan: 'Plan', monthly: null, likeForLike: true },
  ],
};
const gap = { current: { annual: 3000 }, rows: [
  { provider: 'Discovery', plan: 'Gap Core', discovery: true, monthly: 150 },
  { provider: 'Turnberry', plan: 'Launch', monthly: 185 },
] };
const insureNoQuote = { current: { annual: 14400 }, rows: [
  { id: 'outsurance', name: 'OUTsurance', monthly: null, quoted: false, breakEven: 1100 },
  { id: 'kingprice', name: 'King Price', monthly: null, quoted: false, breakEven: 1000 },
] };
const life = { current: { annual: 9600, monthly: 800 }, rows: [
  { id: 'discoveryLife', name: 'Discovery Life (individual)', monthly: 500, quoted: true, rewards: 0 },
  { id: 'momentum', name: 'Momentum Myriad', monthly: null, quoted: false, breakEven: 800 },
] };
const cmp = { health, gap, insure: insureNoQuote, life };
const S = buildSwitch(st, cmp);
const row = key => S.rows.find(r => r.key === key);

// 1. the bank row is the chosen other bank: its fees and its rewards
near(row('bank').stay, 7200); near(row('bank').go, 690);
assert.strictEqual(row('bank').goName, 'Capitec Global One');
near(row('bank.rewards').stay, 12000); near(row('bank.rewards').go, 300);

// 2. medical aid: the cheapest plan that covers what you need, outside Discovery
near(row('medical').go, 4000 * 12, 'Bestmed, not the Discovery plan or the plan that misses a need');
assert.strictEqual(row('medical').goName, 'Bestmed Pace');

// 3. Vitality ends with Discovery Health: its fee and its rewards both go
near(row('vitality').stay, 7200); near(row('vitality').go, 0);
near(row('vitality.rewards').stay, 15000); near(row('vitality.rewards').go, 0);
// and Drive fuel rewards end with Discovery Insure and the bank
near(row('drive').stay, 2400); near(row('drive').go, 0);

// gap cover: the cheapest one outside Discovery (Discovery's ends with the medical aid)
near(row('gap').go, 185 * 12);

// 4. nothing priced: assumed the same as now, flagged, and says what would beat it
assert.strictEqual(row('car').assumed, true);
near(row('car').go, row('car').stay, 'same as now');
assert.ok(/R\s?1\s?000/.test(row('car').goNote), 'names the cheapest break-even quote: ' + row('car').goNote);
// a Discovery quote is not "switching away": life is still assumed
assert.strictEqual(row('life').assumed, true);
assert.ok(S.assumed.includes('Car insurance') && S.assumed.includes('Life cover'));

// 5. a typed quote is used, and that insurer's rewards count on the switch side
const quoted = { ...insureNoQuote, rows: [{ id: 'outsurance', name: 'OUTsurance', monthly: 1000, quoted: true, rewards: 1200, breakEven: 1100 }] };
const S2 = buildSwitch(st, { ...cmp, insure: quoted });
near(S2.rows.find(r => r.key === 'car').go, 12000);
assert.strictEqual(S2.rows.find(r => r.key === 'car').assumed, false);
near(S2.rows.find(r => r.key === 'car.rewards').go, 1200, 'the insurer\'s rewards sit with its own product');

// per product: what it really costs on each side (paid − got back), and the saving
const G = id => S.groups.find(g => g.id === id);
assert.deepStrictEqual(S.groups.map(g => g.id), ['bank', 'medical', 'car', 'gap', 'life']);
near(G('bank').stay, 7200 - 12000); near(G('bank').go, 690 - 300);
near(G('medical').stay, 66000 + 7200 - 15000, 'medical aid + Vitality fee − Vitality rewards');
near(G('medical').go, 48000);
near(G('car').stay, 14400 - 2400, 'Drive fuel rewards belong with the car');
assert.strictEqual(G('car').assumed, true); assert.strictEqual(G('gap').assumed, false);
for (const g of S.groups) near(g.saving, g.stay - g.go);
near(S.groups.reduce((t, g) => t + g.saving, 0), S.gain, 'the products add up to the whole');
// the real cost of each side: what you pay less what you get back
near(S.stay.real, S.stay.cost - S.stay.benefit); near(S.go.real, S.go.cost - S.go.benefit);

// 6. totals: costs and benefits per side, net = benefits − costs, gain = switch − stay
const sum = (side, kind) => S.rows.filter(r => r.kind === kind).reduce((t, r) => t + r[side], 0);
near(S.stay.cost, sum('stay', 'cost')); near(S.go.benefit, sum('go', 'benefit'));
near(S.stay.net, S.stay.benefit - S.stay.cost);
near(S.gain, S.go.net - S.stay.net);

// a product with nothing to compare is left out, not shown as R 0
const S3 = buildSwitch({ ...st, vitality: { premium: null, value: 0 } }, { health: null, gap: null, insure: null, life: null });
assert.deepStrictEqual(S3.rows.map(r => r.key).sort(), ['bank', 'bank.rewards', 'drive']);

// ── the top competitors per section ──
const alts = [
  { id: 'gotyme', name: 'GoTyme', fees: 0, rewards: 0, backPct: 0, partners: [] },
  { id: 'capitec', name: 'Capitec Global One', fees: 690, rewards: 300, backPct: 1, partners: [] },
  { id: 'fnb', name: 'FNB Aspire', fees: 1500, rewards: 150, backPct: 0.5, partners: [], guess: true },
  { id: 'sb', name: 'Standard Bank', fees: 3420, rewards: 300, backPct: 1, partners: [{ label: 'UCount at Checkers', known: false }] },
  { id: 'absa', name: 'Absa', fees: 3180, rewards: 150, backPct: 0.5, partners: [] },
  { id: 'nedbank', name: 'Nedbank', fees: 4000, rewards: 100, backPct: 0.25, partners: [] },
];
const health5 = { ...health, rows: health.rows.map(r => ({ ...r, misses: r.likeForLike === false ? ['doctors'] : [], dayToDay: 'Savings' })) };
const RV = buildRivals({ ...st, alternatives: alts }, { ...cmp, health: health5 });
const sec = id => RV.find(x => x.id === id);
assert.deepStrictEqual(RV.map(x => x.id), ['bank', 'medical', 'gap', 'car', 'life']);

// Discovery's own line: what you pay, what comes back, the real cost
near(sec('bank').discovery.pay, 7200); near(sec('bank').discovery.back, 12000); near(sec('bank').discovery.real, 7200 - 12000);
near(sec('medical').discovery.pay, 66000 + 7200, 'medical aid and the Vitality fee'); near(sec('medical').discovery.back, 15000);
near(sec('car').discovery.back, 2400, 'Drive fuel rewards come back with the car');

// at most five, never Discovery's own, the cheapest real cost first
assert.strictEqual(sec('bank').rivals.length, 5);
assert.deepStrictEqual(sec('bank').rivals.map(r => r.name), ['GoTyme', 'Capitec Global One', 'FNB Aspire', 'Absa', 'Standard Bank']);
near(sec('bank').rivals[1].real, 690 - 300);
assert.ok(/1% back/.test(sec('bank').rivals[1].what), sec('bank').rivals[1].what);
const med = sec('medical').rivals;
assert.ok(!med.some(r => /Discovery/.test(r.name)), 'no Discovery plan among the competitors');
assert.deepStrictEqual(med.map(r => r.name), ['Bestmed Pace', 'Bonitas BonComprehensive', 'Cheap Hospital', 'Other Plan'], 'covers-what-you-need first, cheapest first, unpriced last');
assert.deepStrictEqual(med[2].misses, ['doctors']);
assert.strictEqual(med[3].pay, null);
near(med[0].pay, 48000); near(med[0].back, 0); near(med[0].real, 48000);
assert.deepStrictEqual(sec('gap').rivals.map(r => r.name), ['Turnberry Launch']);

// no price: no pay, and the most a quote could be to beat Discovery
const car = sec('car').rivals;
assert.deepStrictEqual(car.map(r => r.name), ['OUTsurance', 'King Price'], 'list order when nothing is priced');
assert.strictEqual(car[0].pay, null); near(car[0].quoteUnder, 1100);
assert.deepStrictEqual(sec('life').rivals.map(r => r.name), ['Momentum Myriad'], 'Discovery Life is not a competitor');

// a section with nothing to compare is left out
assert.deepStrictEqual(buildRivals({ ...st, alternatives: [] }, { health: null, gap: null, insure: null, life: null }).map(x => x.id), []);

console.log('switch OK');

// ── what each rand that comes back actually is ──
const { backItems, byKind } = require('../src/switch');
const stB = {
  cost: 7200, value: 4700,
  chosen: { id: 'fnb', name: 'FNB', fees: 1500, rewards: 400, backPct: 1, rewardKind: 'points' },
  alternatives: [{ id: 'fnb', name: 'FNB', fees: 1500, rewards: 400, backPct: 1, rewardKind: 'points', partners: [] }, { id: 'capitec', name: 'Capitec', fees: 690, rewards: 300, backPct: 1, partners: [] }],
  vitality: { premium: 7200, value: 3000, gymSaving: 1800 },
  lines: [
    { key: 'miles.card', group: 'bank', label: 'Miles for using your card', annual: 2000, source: 'statement' },
    { key: 'interest.boost', group: 'bank', label: 'Extra interest on your savings', annual: 300, source: 'measured' },
    { key: 'appleWatch', group: 'bank', label: 'Apple Watch', annual: 1500, source: 'measured' },
    { key: 'travel.bank', group: 'bank', label: 'Flight discount from the bank', annual: 900, source: 'estimated' },
    { key: 'healthyFood.health', group: 'stays', label: 'HealthyFood Miles from Vitality Health', annual: 1000, source: 'statement' },
    { key: 'activeRewards.basic', group: 'stays', label: 'Basic exercise rewards without the bank', annual: 200, source: 'estimated' },
    { key: 'fuel.drive', group: 'stays', label: 'Vitality Drive fuel rewards', annual: 2400, source: 'estimated', funder: true },
  ],
};
const BI = backItems(stB);
const kindOf = (list, key) => list.find(i => i.key === key).kind;
assert.strictEqual(kindOf(BI.bank, 'miles.card'), 'points');
assert.strictEqual(kindOf(BI.bank, 'interest.boost'), 'cash');
assert.strictEqual(kindOf(BI.bank, 'appleWatch'), 'thing');
assert.strictEqual(kindOf(BI.bank, 'travel.bank'), 'discount');
assert.strictEqual(BI.bank.find(i => i.key === 'travel.bank').estimated, true);
near(BI.bank.reduce((t, i) => t + i.annual, 0), stB.value, 'the bank items add up to what the bank gives back');
assert.strictEqual(kindOf(BI.vitality, 'gym'), 'discount');
assert.strictEqual(kindOf(BI.vitality, 'healthyFood.health'), 'points');
assert.strictEqual(kindOf(BI.vitality, 'activeRewards.basic'), 'voucher');
near(BI.vitality.reduce((t, i) => t + i.annual, 0), stB.vitality.value, 'the Vitality items add up to Vitality\'s rewards');
assert.strictEqual(kindOf(BI.drive, 'fuel.drive'), 'funder', 'Funder Account money is for car costs only');
assert.strictEqual(backItems({ ...stB, lines: stB.lines.map(l => (l.key === 'fuel.drive' ? { ...l, funder: false } : l)) }).drive[0].kind, 'cash');

// totals per kind, cash first, nothing for a kind that is not there
assert.deepStrictEqual(byKind(BI.bank).map(k => [k.kind, k.annual]), [['cash', 300], ['points', 2000], ['discount', 900], ['thing', 1500]]);

// the Compare rows carry their items, on both sides
const SB = buildSwitch(stB, {});
const br = SB.rows.find(r => r.key === 'bank.rewards');
assert.deepStrictEqual(br.stayItems.map(i => i.key), BI.bank.map(i => i.key));
assert.strictEqual(br.goItems[0].kind, 'points', 'FNB pays eBucks, not cash');
near(br.goItems[0].annual, 400);
assert.deepStrictEqual(SB.rows.find(r => r.key === 'drive').stayItems.map(i => i.kind), ['funder']);
const RB = buildRivals(stB, {});
assert.deepStrictEqual(RB[0].discovery.items.map(i => i.key), BI.bank.map(i => i.key));
assert.strictEqual(RB[0].rivals.find(r => r.name === 'Capitec').items[0].kind, 'cash', 'a bank with no reward kind pays cash');
// ── products left out: not on Compare at all ─────────────────────────
{
  const all = buildSwitch(st, cmp, { bank: true, health: true, gap: true, insure: true, life: true });
  assert.deepStrictEqual(all.rows.map(r => r.key), S.rows.map(r => r.key), 'all products on = no map');
  const noBank = buildSwitch(st, cmp, { bank: false, health: true, gap: true, insure: true, life: true });
  assert.ok(!noBank.rows.some(r => r.key === 'bank' || r.key === 'bank.rewards'), 'no bank rows without the bank');
  assert.ok(!noBank.groups.some(g => g.id === 'bank'), 'no bank group');
  const onlyBank = buildSwitch(st, cmp, { bank: true, health: false, gap: false, insure: false, life: false });
  assert.deepStrictEqual(onlyBank.rows.map(r => r.key), ['bank', 'bank.rewards'], 'only the bank: ' + onlyBank.rows.map(r => r.key).join(', '));
  assert.deepStrictEqual(onlyBank.groups.map(g => g.id), ['bank']);
  near(onlyBank.gain, (300 - 690) - (12000 - 7200), 'the total is the bank alone');
  const noHealth = buildSwitch(st, cmp, { bank: true, health: false, gap: true, insure: true, life: true });
  assert.ok(!noHealth.rows.some(r => ['medical', 'vitality', 'vitality.rewards'].includes(r.key)), 'no medical aid or Vitality Health rows');
  assert.ok(noHealth.rows.some(r => r.key === 'gap'), 'gap cover stays');
  const noInsure = buildSwitch(st, cmp, { insure: false });
  assert.ok(!noInsure.rows.some(r => r.key === 'car' || r.key === 'drive'), 'no car or Drive rows without Insure');
  assert.ok(noInsure.rows.some(r => r.key === 'life'), 'a product not named stays in');

  const stAlt = { ...st, alternatives: [{ name: 'Capitec Global One', fees: 690, rewards: 300 }] };
  const rivalsOnlyBank = buildRivals(stAlt, cmp, { bank: true, health: false, gap: false, insure: false, life: false });
  assert.deepStrictEqual(rivalsOnlyBank.map(x => x.id), ['bank']);
  const rivalsNoBank = buildRivals(stAlt, cmp, { bank: false });
  assert.ok(!rivalsNoBank.some(x => x.id === 'bank'), 'no rival banks without the bank');
  assert.ok(rivalsNoBank.some(x => x.id === 'medical'), 'medical aids still compared');
}

console.log('switch back items OK');
