'use strict';
/* The Latest tab's logic (src/offers.js): an offer note's frontmatter is
   read without guessing (a bad date is a problem, never a made-up date),
   each household member is checked against what the offer requires
   (met / not met / not known), and the offers fall into On now, Coming up,
   Always on, Not for us, Used or hidden and Ended. Made-up household only. */
const assert = require('node:assert');
const { parseOffer, householdOf, checkRequirement, evaluate, timing, buildLatest, whoLine, timeWords, reasonLine, REQUIREMENTS } = require('../src/offers');

/* ── parseOffer ─────────────────────────────────────────────────────── */
{
  const o = parseOffer({
    discovery: 'offer', title: ' Double Miles discounts ', benefit: 'Up to 30% off', area: 'Bank',
    partner: ['Shop A', 'Shop B'], starts: '2026-11-27', ends: '2026-11-27',
    requires: ['vitality-money', 'Transaction-Bundled | credit-card'], condition: 'Only on the day',
    how: ['Pay with Miles'], source: 'Email, 18 Nov 2026', url: 'https://example.org/x', added: '2026-11-18',
  }, 'Offers/Double.md');
  assert.strictEqual(o.path, 'Offers/Double.md');
  assert.strictEqual(o.title, 'Double Miles discounts');
  assert.strictEqual(o.area, 'bank');
  assert.deepStrictEqual(o.partners, ['Shop A', 'Shop B']);
  assert.strictEqual(o.starts, '2026-11-27');
  assert.strictEqual(o.ends, '2026-11-27');
  assert.deepStrictEqual(o.requires, [['vitality-money'], ['transaction-bundled', 'credit-card']]);
  assert.deepStrictEqual(o.how, ['Pay with Miles']);
  assert.strictEqual(o.state, '');
  assert.deepStrictEqual(o.problems, []);
}
/* not an offer note: no marker, or no title */
assert.strictEqual(parseOffer({ title: 'x' }, 'a.md'), null);
assert.strictEqual(parseOffer({ discovery: 'offer' }, 'a.md'), null);
assert.strictEqual(parseOffer(null, 'a.md'), null);
/* a comma string works for lists; a Date and a date-time keep only the day */
{
  const o = parseOffer({ discovery: 'offer', title: 't', partner: ['A', 'B'], requires: 'bank, suite', how: 'One step', starts: new Date(Date.UTC(2026, 10, 16)), ends: '2026-11-25T09:00' }, 'b.md');
  assert.deepStrictEqual(o.partners, ['A', 'B']);
  assert.deepStrictEqual(o.requires, [['bank'], ['suite']]);
  assert.deepStrictEqual(o.how, ['One step']);
  assert.strictEqual(o.starts, '2026-11-16');
  assert.strictEqual(o.ends, '2026-11-25');
}
/* a date that is not a date is a problem and stays unset — never guessed */
{
  const o = parseOffer({ discovery: 'offer', title: 't', ends: 'end of November', area: 'shoes', state: 'used' }, 'c.md');
  assert.strictEqual(o.ends, null);
  assert.ok(o.problems.some(p => /ends/.test(p)), o.problems.join('; '));
  assert.strictEqual(o.area, 'other');
  assert.strictEqual(o.state, 'used');
}
/* ends before starts is a problem in the note, and the dates are not used */
{
  const o = parseOffer({ discovery: 'offer', title: 't', starts: '2026-12-01', ends: '2026-11-25' }, 'e.md');
  assert.ok(o.problems.some(p => /before/.test(p)), o.problems.join('; '));
  assert.strictEqual(o.starts, null);
  assert.strictEqual(o.ends, null);
  assert.strictEqual(timeWords(timing(o, '2026-11-18'), o), 'Dates unclear', 'never shown as Ongoing');
}
/* one partner named in a string keeps its comma; a list is a list */
assert.deepStrictEqual(parseOffer({ discovery: 'offer', title: 't', partner: 'Acme, Inc' }, 'f.md').partners, ['Acme, Inc']);
/* an unknown state is ignored */
assert.strictEqual(parseOffer({ discovery: 'offer', title: 't', state: 'maybe' }, 'd.md').state, '');

/* ── the household ──────────────────────────────────────────────────── */
const eff = {
  bankKind: 'suite', suite: 'Black', bankFees: '',
  status: { money: 'Diamond', health: 'Gold', drive: 'Blue' },
  conditions: { insurePlan: 'classic', homeCover: 'none' },
  people: [{ name: 'Sam', bank: 'transaction', aid: true }, { name: 'Kid', bank: 'none', aid: true }, { name: '', bank: 'suite' }],
};
const products = { bank: true, health: true, gap: true, insure: true, life: false };
const vitality = { money: true, health: true, drive: true };
const house = householdOf({ eff, products, vitality });
assert.deepStrictEqual(house.map(p => p.name), ['You', 'Sam', 'Kid'], 'a person with no name is left out');
const [you, sam, kid] = house;

/* ── checkRequirement: true met, false not met, null not known ──────── */
const T = (tok, p) => checkRequirement(tok, p);
assert.strictEqual(T('bank', you), true);
assert.strictEqual(T('suite', you), true);
assert.strictEqual(T('credit-card', you), true);
assert.strictEqual(T('transaction', you), true);
assert.strictEqual(T('transaction-bundled', you), true);
assert.strictEqual(T('tier-black', you), true);
assert.strictEqual(T('tier-purple', you), false);
assert.strictEqual(T('tier-gold', you), true);
assert.strictEqual(T('vitality-drive', you), true);
assert.strictEqual(T('money-diamond', you), true);
assert.strictEqual(T('drive-gold', you), false);
assert.strictEqual(T('health-silver', you), true);
assert.strictEqual(T('insure', you), true);
assert.strictEqual(T('home-cover', you), false);
assert.strictEqual(T('life', you), false);
assert.strictEqual(T('gap', you), true);
assert.strictEqual(T('new-home-loan', you), null, 'a word the page does not know is not known, never guessed');
/* Sam: a transaction account (bundled fees unless said), on the medical aid */
assert.strictEqual(T('bank', sam), true);
assert.strictEqual(T('transaction-bundled', sam), null, 'nobody said which fees Sam pays: not known, never guessed');
assert.strictEqual(T('credit-card', sam), false);
assert.strictEqual(T('suite', sam), false);
assert.strictEqual(T('tier-gold', sam), false);
assert.strictEqual(T('health', sam), true);
assert.strictEqual(T('vitality-health', sam), true, 'on the medical aid with the household\'s Vitality Health');
assert.strictEqual(T('vitality-money', sam), null, 'not asked for others');
/* the household's cars and home are everyone's: Insure words follow yours */
assert.strictEqual(T('insure', sam), true);
assert.strictEqual(T('home-cover', sam), false);
assert.strictEqual(T('vitality-drive', kid), true);
assert.strictEqual(T('money-gold', sam), null);
/* Kid: no bank account */
assert.strictEqual(T('bank', kid), false);
assert.strictEqual(T('transaction', kid), false);
/* someone not on the medical aid gets none of its words */
{
  const p = householdOf({ eff: { ...eff, people: [{ name: 'Gran', bank: 'savings', aid: false }] }, products, vitality })[1];
  assert.strictEqual(T('health', p), false);
  assert.strictEqual(T('vitality-health', p), false);
  assert.strictEqual(T('gap', p), false);
  assert.strictEqual(T('health-blue', p), false);
  assert.strictEqual(T('bank', p), true);
  assert.strictEqual(T('transaction', p), false);
}
/* pay-as-you-transact is not bundled */
assert.strictEqual(T('transaction-bundled', householdOf({ eff: { ...eff, bankKind: 'transaction', bankFees: 'payt', people: [] }, products, vitality })[0]), false);
/* an unanswered programme is not known; a programme you do not have fails its score floor */
{
  const p = householdOf({ eff: { ...eff, people: [] }, products, vitality: { money: true, health: true, drive: false } })[0];
  assert.strictEqual(T('drive-blue', p), false);
  assert.strictEqual(T('vitality-drive', p), false);
  const q = householdOf({ eff: { ...eff, conditions: { homeCover: '' }, people: [] }, products, vitality })[0];
  assert.strictEqual(T('home-cover', q), null);
}
/* no Discovery Bank at all: every bank word fails */
{
  const p = householdOf({ eff: { ...eff, bankKind: null, people: [] }, products: { ...products, bank: false }, vitality })[0];
  for (const t of ['bank', 'suite', 'credit-card', 'transaction', 'tier-gold']) assert.strictEqual(T(t, p), false, t);
}
/* every listed requirement has a label for "Needs …" */
for (const k of Object.keys(REQUIREMENTS)) assert.ok(REQUIREMENTS[k] && typeof REQUIREMENTS[k] === 'string', k);

/* ── evaluate ───────────────────────────────────────────────────────── */
const offer = (fm) => parseOffer({ discovery: 'offer', title: 'T', ...fm }, (fm.title || 'T') + '.md');
{
  const e = evaluate(offer({ requires: ['vitality-money', 'transaction-bundled | credit-card'] }), you);
  assert.strictEqual(e.verdict, 'yes');
  const s = evaluate(offer({ requires: ['vitality-money', 'transaction-bundled | credit-card'] }), sam);
  assert.strictEqual(s.verdict, 'check');
  assert.deepStrictEqual(s.unknown, [REQUIREMENTS['vitality-money'], `${REQUIREMENTS['transaction-bundled']} or ${REQUIREMENTS['credit-card']}`]);
  assert.strictEqual(evaluate(offer({ requires: ['transaction-bundled | credit-card'] }), sam).verdict, 'check');
  assert.strictEqual(evaluate(offer({ requires: ['transaction | credit-card'] }), sam).verdict, 'yes');
  const k = evaluate(offer({ requires: ['credit-card', 'new-home-loan'] }), kid);
  assert.strictEqual(k.verdict, 'no', 'one requirement not met beats one not known');
  assert.deepStrictEqual(k.missing, [REQUIREMENTS['credit-card']]);
  assert.deepStrictEqual(k.unknown, ['new-home-loan']);
  assert.strictEqual(evaluate(offer({}), kid).verdict, 'yes', 'nothing required: anyone');
}

/* ── timing ─────────────────────────────────────────────────────────── */
const today = '2026-11-18';
assert.deepStrictEqual(timing(offer({ starts: '2026-11-01', ends: '2026-11-30' }), today), { phase: 'on', daysLeft: 12, daysToStart: 0 });
assert.strictEqual(timing(offer({ ends: '2026-11-18' }), today).daysLeft, 0);
assert.strictEqual(timing(offer({ starts: '2026-11-27', ends: '2026-11-27' }), today).phase, 'soon');
assert.strictEqual(timing(offer({ starts: '2026-11-27', ends: '2026-11-27' }), today).daysToStart, 9);
assert.strictEqual(timing(offer({ ends: '2026-11-17' }), today).phase, 'ended');
assert.strictEqual(timing(offer({}), today).phase, 'always');
assert.strictEqual(timing(offer({ starts: '2026-12-01' }), today).phase, 'soon', 'always-on but not started yet');
/* across a month end and a clock change: whole days, never 11.96 */
assert.strictEqual(timing(offer({ ends: '2027-01-15' }), '2026-12-30').daysLeft, 16);

assert.strictEqual(timeWords({ phase: 'on', daysLeft: 0 }, offer({ ends: '2026-11-18' })), 'Ends today');
assert.strictEqual(timeWords({ phase: 'on', daysLeft: 1 }, offer({ ends: '2026-11-19' })), 'Ends tomorrow');
assert.strictEqual(timeWords({ phase: 'on', daysLeft: 5 }, offer({ ends: '2026-11-23' })), 'Ends in 5 days');
assert.strictEqual(timeWords({ phase: 'on', daysLeft: 20 }, offer({ ends: '2026-12-08' })), 'Until 8 Dec');
assert.strictEqual(timeWords({ phase: 'soon', daysToStart: 9 }, offer({ starts: '2026-11-27', ends: '2026-11-27' })), 'On 27 Nov');
assert.strictEqual(timeWords({ phase: 'soon', daysToStart: 5 }, offer({ starts: '2026-11-23', ends: '2026-11-29' })), '23 Nov to 29 Nov');
assert.strictEqual(timeWords({ phase: 'soon', daysToStart: 5 }, offer({ starts: '2026-11-23' })), 'From 23 Nov');
assert.strictEqual(timeWords({ phase: 'always' }, offer({})), 'Ongoing');
assert.strictEqual(timeWords({ phase: 'ended' }, offer({ ends: '2026-11-02' })), 'Ended 2 Nov');

/* ── who and why ────────────────────────────────────────────────────── */
assert.strictEqual(whoLine([{ name: 'You', verdict: 'yes' }]), 'You');
assert.strictEqual(whoLine([{ name: 'You', verdict: 'yes' }, { name: 'Sam', verdict: 'yes' }, { name: 'Kid', verdict: 'no' }]), 'You and Sam');
assert.strictEqual(whoLine([{ name: 'You', verdict: 'yes' }, { name: 'Sam', verdict: 'yes' }, { name: 'Kid', verdict: 'yes' }]), 'Everyone at home');
assert.strictEqual(whoLine([{ name: 'You', verdict: 'no' }, { name: 'Sam', verdict: 'yes' }, { name: 'Kid', verdict: 'yes' }]), 'Sam and Kid');
assert.strictEqual(whoLine([{ name: 'You', verdict: 'check' }]), '');
assert.strictEqual(reasonLine([{ name: 'You', verdict: 'no', missing: ['Vitality Drive'] }]), 'Needs Vitality Drive');
assert.strictEqual(reasonLine([{ name: 'You', verdict: 'no', missing: ['a', 'b'] }, { name: 'Sam', verdict: 'no', missing: ['b'] }]), 'Needs a and b');

/* ── buildLatest: the groups and their order ────────────────────────── */
{
  const list = [
    offer({ title: 'Ends later', starts: '2026-11-01', ends: '2026-11-30' }),
    offer({ title: 'Ends soon', ends: '2026-11-20' }),
    offer({ title: 'Black Friday', starts: '2026-11-27', ends: '2026-11-27' }),
    offer({ title: 'Earlier coming', starts: '2026-11-23', ends: '2026-11-29' }),
    offer({ title: 'Miles back', requires: ['vitality-money'] }),
    offer({ title: 'Home loan', requires: ['new-home-loan'] }),
    offer({ title: 'Needs home cover', requires: ['home-cover'], ends: '2026-12-31' }),
    offer({ title: 'Used one', ends: '2026-11-30', state: 'used' }),
    offer({ title: 'Hidden one', state: 'hidden' }),
    offer({ title: 'Old one', ends: '2026-11-02' }),
    offer({ title: 'Older one', ends: '2026-10-02' }),
  ];
  const L = buildLatest(list, house, today);
  const titles = g => L[g].map(i => i.offer.title);
  assert.deepStrictEqual(titles('on'), ['Ends soon', 'Ends later']);
  assert.deepStrictEqual(titles('soon'), ['Earlier coming', 'Black Friday']);
  assert.deepStrictEqual(titles('always'), ['Miles back', 'Home loan'], 'who can use it first, then not sure');
  assert.deepStrictEqual(titles('notForUs'), ['Needs home cover']);
  assert.deepStrictEqual(titles('put'), ['Used one', 'Hidden one']);
  assert.deepStrictEqual(titles('ended'), ['Old one', 'Older one']);
  assert.strictEqual(L.always[1].fit, 'check', 'a word the page does not know: check');
  assert.strictEqual(L.always[0].fit, 'yes');
  assert.strictEqual(L.always[0].who.find(w => w.name === 'You').verdict, 'yes');
  assert.strictEqual(L.counts.on, 2);
  assert.strictEqual(L.counts.soon, 2);
  assert.strictEqual(L.counts.endingThisWeek, 1);
  /* an empty list is fine */
  const E = buildLatest([], house, today);
  assert.strictEqual(E.on.length + E.soon.length + E.always.length, 0);
}
/* the same title twice (one note copied) is still two cards: nothing is merged behind your back */
assert.strictEqual(buildLatest([offer({ title: 'A' }), parseOffer({ discovery: 'offer', title: 'A' }, 'copy.md')], house, today).always.length, 2);

console.log('offers ok');
