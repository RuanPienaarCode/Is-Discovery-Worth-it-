'use strict';
const assert = require('node:assert');
const { money, pct, monthLabel, dayLabel, miles, parseTyped, showTyped } = require('../src/format');
const T = ' ', N = ' ', M = '−';
assert.strictEqual(money(5160), `R${N}5${T}160`);
assert.strictEqual(money(-98.4), `${M}R${N}98`);
assert.strictEqual(money(-0.3), `R${N}0`, 'no minus on a figure that rounds to zero');
assert.strictEqual(money(1234567.891, { cents: true }), `R${N}1${T}234${T}567,89`);
assert.strictEqual(money(12, { plus: true }), `+R${N}12`);
assert.strictEqual(money(NaN), '—');
assert.strictEqual(pct(12.5), '12,5%');
assert.strictEqual(pct(10), '10%');
assert.strictEqual(monthLabel('2025-10'), 'Oct 2025');
assert.strictEqual(dayLabel('2026-09-04'), '4 Sep 2026');
assert.strictEqual(miles(4644), `+4${T}644${N}Miles`);
assert.strictEqual(miles(-12000), `${M}12${T}000${N}Miles`);
console.log('format OK');

// what someone types into a field: a comma is the decimal mark (an iPhone in
// South Africa offers "," on the decimal keypad), spaces group thousands
const P = (raw, want, msg) => { const got = parseTyped(raw); assert.ok(Object.is(got, want) || Math.abs(got - want) < 1e-9, `${msg || raw}: ${got} != ${want}`); };
P('2,5', 2.5); P('2.5', 2.5); P('0,125', 0.125, 'three digits after a comma are decimals, not thousands');
P('1 500', 1500); P(`1${N}500,75`, 1500.75, 'no-break space'); P(`1${T}500`, 1500, 'thin space');
P('R 1 500', 1500); P('R1500', 1500); P('15%', 15); P(' 12 ', 12);
P('1,500.25', 1500.25); P('1.500,25', 1500.25, 'both marks: the last one is the decimal');
P('1,000,000', 1000000); P('1.000.000', 1000000);
P('12,', 12, 'a trailing mark is a whole number'); P(',5', 0.5);
P('-5', -5, 'parsed; the field refuses negatives itself');
assert.strictEqual(parseTyped(''), null); assert.strictEqual(parseTyped('   '), null);
for (const bad of ['abc', '1,2,3', '1..5', '2,5,0', '1 2', 'R', '--5']) assert.ok(Number.isNaN(parseTyped(bad)), bad + ' is refused');
// and shown back with a comma
assert.strictEqual(showTyped(2.5), '2,5'); assert.strictEqual(showTyped(0.125), '0,125'); assert.strictEqual(showTyped(1500), '1500');
assert.strictEqual(showTyped(undefined), ''); assert.strictEqual(showTyped(''), '');
console.log('format typed OK');
