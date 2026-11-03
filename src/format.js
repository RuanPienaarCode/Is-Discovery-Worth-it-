'use strict';
/* South African money, built by hand so every WebView prints the same thing:
   "R 5 160", "−R 98", "R 12,50". Thin no-break space between thousands. */

const NBSP = ' ', THIN = ' ', MINUS = '−';

function groups(intStr) {
  return intStr.replace(/\B(?=(\d{3})+$)/g, THIN);
}

/* whole rands unless `cents` is set */
function money(n, opts) {
  const o = opts || {};
  if (!Number.isFinite(n)) return '—';
  const neg = n < 0 && Math.abs(n) >= (o.cents ? 0.005 : 0.5);
  const abs = Math.abs(n);
  let body;
  if (o.cents) {
    const [i, d] = abs.toFixed(2).split('.');
    body = groups(i) + ',' + d;
  } else {
    body = groups(String(Math.round(abs)));
  }
  const sign = neg ? MINUS : (o.plus && abs >= 0.5 ? '+' : '');
  return sign + 'R' + NBSP + body;
}

function pct(n, digits) {
  if (!Number.isFinite(n)) return '—';
  const d = digits === undefined ? (Number.isInteger(n) ? 0 : 1) : digits;
  return n.toFixed(d).replace('.', ',') + '%';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/* '2025-10' → 'Oct 2025' */
function monthLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

/* '2026-09-04' → '4 Sep 2026' */
function dayLabel(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/* Miles: '+4 644 Miles' */
function miles(n) {
  const sign = n < 0 ? MINUS : '+';
  return sign + groups(String(Math.round(Math.abs(n)))) + NBSP + 'Miles';
}

/* What someone typed into a field → a number; blank → null; anything it
   cannot read → NaN, never a guess. South African typing: a comma is the
   decimal mark (an iPhone set to South Africa offers "," on the decimal
   keypad), spaces group thousands. "2,5" and "2.5" are both 2,5 and
   "0,125" is a fraction, not 133. With both marks the last one is the
   decimal ("1 500,75", "1,500.25"); several of one mark only group
   thousands in threes ("1,000,000"). A leading "R" and a trailing "%" are
   ignored. */
function parseTyped(raw) {
  let s = String(raw === undefined || raw === null ? '' : raw).replace(/[\s   ]+/g, ' ').trim();
  if (!s) return null;
  s = s.replace(/^R\s*/i, '').replace(/\s*%$/, '').trim();
  if (!s) return NaN;
  if (s.includes(' ')) {
    if (!/^[+-]?\d{1,3}( \d{3})+([.,]\d*)?$/.test(s)) return NaN;
    s = s.replace(/ /g, '');
  }
  const commas = (s.match(/,/g) || []).length, dots = (s.match(/\./g) || []).length;
  if (commas && dots) {
    const comma = s.lastIndexOf(',') > s.lastIndexOf('.');
    if (!(comma ? /^[+-]?\d{1,3}(\.\d{3})*,\d*$/ : /^[+-]?\d{1,3}(,\d{3})*\.\d*$/).test(s)) return NaN;
    s = comma ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (commas > 1 || dots > 1) {
    if (!(commas > 1 ? /^[+-]?\d{1,3}(,\d{3})+$/ : /^[+-]?\d{1,3}(\.\d{3})+$/).test(s)) return NaN;
    s = s.replace(/[.,]/g, '');
  } else {
    s = s.replace(',', '.');
  }
  return /^[+-]?(\d+\.?\d*|\.\d+)$/.test(s) ? Number(s) : NaN;
}

/* A stored number back into a field, with a decimal comma: 2.5 → "2,5". */
function showTyped(v) {
  if (v === undefined || v === null || v === '' || !Number.isFinite(Number(v))) return '';
  return String(Number(v)).replace('.', ',');
}

module.exports = { money, pct, monthLabel, dayLabel, miles, parseTyped, showTyped };
