'use strict';
/* example.js: going into the example stashes the real answers, coming out
   puts them back exactly; the example is never mixed with them. And
   wrong-price.js: the report link carries only the two names. */
const assert = require('node:assert');
const { DEFAULT_SETTINGS } = require('../src/constants');
const { enterExample, leaveExample } = require('../src/example');
const { wrongPriceUrl, ISSUES } = require('../src/wrong-price');
const { sampleSettings } = require('../src/sample');

const NOW = new Date(2026, 10, 3);
const real = JSON.parse(JSON.stringify({ ...DEFAULT_SETTINGS, onboarded: true, palette: 'onyx', period: 'monthly', welcome: false, tab: 'compare', budgetFolder: 'Zed/Money', members: { adults: 3, children: 0, oldestAge: 50 }, status: { money: 'Gold', health: 'Silver', drive: 'Blue' } }));

/* in: the example's answers, flagged, the real ones stashed, the look kept */
const inEx = enterExample(real, NOW);
assert.strictEqual(inEx.sample, true);
const { sample: _a, realSettings: _b, ...core } = real;
assert.deepStrictEqual(inEx.realSettings, core, 'the whole real settings are stashed');
assert.strictEqual(inEx.palette, 'onyx');
assert.strictEqual(inEx.period, 'monthly');
assert.strictEqual(inEx.welcome, false);
assert.strictEqual(inEx.tab, 'overview');
assert.strictEqual(inEx.onboarded, true, 'onboarding is skipped');
assert.strictEqual(inEx.budgetFolder, '', 'the real budget folder is not carried into the example');
assert.deepStrictEqual(inEx.members, sampleSettings(NOW).members, 'the example household, not the real one');
assert.notDeepStrictEqual(inEx.status, real.status);
/* the stash is a copy: changing the example never changes it */
inEx.status.money = 'Blue'; inEx.benefits.miles = 'none';
assert.strictEqual(inEx.realSettings.status.money, 'Gold');
assert.ok(!('miles' in inEx.realSettings.benefits));
/* the real settings object is untouched */
assert.strictEqual(real.sample, false);
assert.strictEqual(real.status.money, 'Gold');

/* already in the example: no second stash over the first */
assert.strictEqual(enterExample(inEx, NOW), inEx);

/* out: exactly what was there, example off, nothing of the example left */
const back = leaveExample(inEx);
assert.deepStrictEqual(back, { ...real, sample: false, realSettings: null });
assert.strictEqual(back.sample, false);
assert.strictEqual(back.realSettings, null);
/* a round trip through data.json (a restart in example mode) leaves the same way */
const restarted = JSON.parse(JSON.stringify(enterExample(real, NOW)));
assert.deepStrictEqual(leaveExample(restarted), { ...real, sample: false, realSettings: null });
/* no stash: an empty object to merge onto the defaults, never the example's answers */
const lost = leaveExample({ sample: true, onboarded: true, members: { adults: 2 } });
assert.strictEqual(lost.sample, false);
assert.ok(!('members' in lost) && !('onboarded' in lost));

/* the report link: the two names only */
const u = wrongPriceUrl('Medical aid', 'Sometown Health & Co');
assert.strictEqual(u, ISSUES + '?template=wrong-price.md&title=Medical+aid%3A+Sometown+Health+%26+Co');
assert.ok(u.startsWith('https://github.com/RuanPienaarCode/Is-Discovery-Worth-it-/issues/new?template=wrong-price.md&title='));
assert.strictEqual(wrongPriceUrl('', ''), ISSUES + '?template=wrong-price.md', 'no names: the template title');
assert.strictEqual(wrongPriceUrl('Gap cover', undefined), ISSUES + '?template=wrong-price.md&title=Gap+cover');
assert.ok(!/%20/.test(wrongPriceUrl('A b', 'C d')));

console.log('example + wrong-price: ok');
