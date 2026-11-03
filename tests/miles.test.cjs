'use strict';
const assert = require('node:assert');
const { parseCsv, isMilesStatement, parseMilesStatement, classifyMiles, summariseMiles, mergeStatements, swipeOf } = require('../src/miles');

const CSV = [
  '﻿"Value Date","Type","Description","Additional information","Miles"',
  '2026-09-30,"Vitality Money","Checkers in-store","",4000.00',
  '2026-09-30,"Vitality Health","Checkers in-store","",5000.00',
  '2026-09-30,"Vitality Health","Woolworths in-store","",300.00',
  '2026-09-30,"Vitality Money","Clicks HealthyCare","",200.00',
  '2026-09-30,"Vitality Money","Fuel BP","",1000.00',
  '2026-09-12,"Vitality Money","Fuel Uber","",50.00',
  '2026-09-20,"Base Miles","Corner Cafe Sometown","2026-09-18 - R 185.00",12.00',
  '2026-09-21,"Base Miles","Corner Cafe Sometown","2026-09-18 - R 185.00",12.00',
  '2026-09-22,"Base Miles Reverse","Refund shop","",-5.00',
  '2026-09-15,"Basket value - R 2,000.00","Discovery Miles Redeemed For TAKE A LOT","",-14000.00',
  '2026-09-10,"Prepaid Electricity - R500.00","Sometown","",-4000.00',
  '2026-09-11,"Miles Received","From Sam","",450.00',
  '2026-09-11,"No reward","Spotifyza 59.99 Zar","",0.00',
  '2026-09-03,"","Gameboard - Coin tile","",200.00',
  '2026-09-05,"Vitality Money","Superbalist reward","",1349.00',
  '2026-09-06,"Discovery Insure","PerfectDrive reward","x",20.00',
  '2026-10-01,"Base Miles","October shop","",99.00',
  '',
].join('\r\n');

// header recognised, commas inside quotes kept
assert.ok(isMilesStatement(CSV));
assert.ok(!isMilesStatement('"Date","Amount"\n2026-01-01,1\n'));
assert.deepStrictEqual(parseCsv('a,"b, c","d ""e"""\n'), [['a', 'b, c', 'd "e"']]);

const rows = parseMilesStatement(CSV);
assert.strictEqual(rows.length, 17);
assert.strictEqual(rows[9].type, 'Basket value - R 2,000.00');

// who pays each reward
const c = d => classifyMiles(rows.find(r => r.description === d && r.miles !== 0));
assert.deepStrictEqual(classifyMiles(rows[0]), { key: 'money.healthyFood', group: 'bank' });
assert.deepStrictEqual(classifyMiles(rows[1]), { key: 'health.healthyFood', group: 'health' });
assert.deepStrictEqual(c('Fuel Uber'), { key: 'money.fuel', group: 'bank' });
assert.deepStrictEqual(c('Gameboard - Coin tile'), { key: 'gameboard', group: 'bank' }, 'the gameboard lives in the bank app');
assert.deepStrictEqual(classifyMiles({ type: '', description: 'Digital Life Plan quote reward', info: '', miles: 1000 }), { key: 'life', group: 'life' }, 'Discovery Life rewards belong with Life');
assert.deepStrictEqual(classifyMiles({ type: 'Vitality Money Reverse', description: 'Checkers in-store', info: '', miles: -500 }), { key: 'money.healthyFood', group: 'bank' }, 'a reversal nets against what it reverses');
assert.deepStrictEqual(c('From Sam'), { key: 'received', group: 'none' });
assert.deepStrictEqual(c('Superbalist reward'), { key: 'money.partners', group: 'bank' });
assert.deepStrictEqual(c('PerfectDrive reward'), { key: 'insure', group: 'bank' });
assert.deepStrictEqual(classifyMiles(rows[8]), { key: 'base', group: 'bank' }, 'a base Miles reversal nets against base');

const s = summariseMiles(rows, '2026-09', '2026-09');
assert.strictEqual(s.figures['money.healthyFood'], 4000);
assert.strictEqual(s.figures['health.healthyFood'], 5300);
assert.strictEqual(s.figures['money.fuel'], 1050);
assert.strictEqual(s.figures.base, 12 + 12 - 5);
assert.strictEqual(s.figures.received, undefined, 'Miles from Sam are not earnings');
assert.strictEqual(s.figures.base !== undefined && s.perMonth.base['2026-09'], 19);
// Mile value from redemptions: (2 000 + 500) rand / (14 000 + 4 000) Miles
assert.strictEqual(s.spentRand, 2500);
assert.strictEqual(s.spentMiles, 18000);
assert.strictEqual(s.first, '2026-09-03');
assert.strictEqual(s.last, '2026-10-01');
assert.deepStrictEqual(s.months, ['2026-09']);
// swipes: card spend as the bank counted it, by swipe date; refunds carry a trailing minus
assert.deepStrictEqual(swipeOf({ info: '2026-09-18 - R 1,185.00' }), { ym: '2026-09', rand: 1185 });
assert.deepStrictEqual(swipeOf({ info: '2026-07-08 - R 1,380.00-' }), { ym: '2026-07', rand: -1380 });
assert.strictEqual(swipeOf({ info: '' }), null);
assert.deepStrictEqual(s.swipes, { '2026-09': 370 });

// merging overlapping downloads: a repeated month is not doubled, a genuine repeat survives
const a = rows.slice(0, 10), b = rows.slice(5);
const merged = mergeStatements([a, b]);
assert.strictEqual(merged.length, rows.length);
assert.strictEqual(merged.filter(r => r.description === 'Corner Cafe Sometown').length, 2);
// merging stays linear: 20 000 rows in well under a second
const big = [];
for (let i = 0; i < 20000; i++) big.push({ date: '2026-01-' + String(1 + (i % 28)).padStart(2, '0'), type: 'Base Miles', description: 'Shop ' + i, info: '', miles: 1 });
const t0 = Date.now();
assert.strictEqual(mergeStatements([big, big.slice(0, 5000)]).length, 20000);
assert.ok(Date.now() - t0 < 1000, 'merge took ' + (Date.now() - t0) + ' ms');
console.log('miles OK');
