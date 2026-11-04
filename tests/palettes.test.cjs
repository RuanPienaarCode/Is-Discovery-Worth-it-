'use strict';
/* The colour palettes (src/palettes.js, src/css/palettes.css):
   1. every palette but the default has a dark and a light token block, and
      each block sets every colour token the page reads;
   2. every text colour reaches 4.5:1 and every shape 3:1 (WCAG AA) on the
      surfaces it sits on, in both themes — including the result pills, the
      product tags, white on the buttons and the dark rail's labels;
   3. no coloured glows in the palettes' own rules;
   4. applyPalette puts exactly one palette's classes on the page, none for
      the default, and an unknown id falls back to the default;
   5. the default palette is the page's own colours until Ruan picks. */
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const { PALETTES, DEFAULT_PALETTE, paletteOf, applyPalette } = require('../src/palettes');
const { DEFAULT_SETTINGS } = require('../src/constants');
const css = fs.readFileSync(path.join(root, 'src/css/palettes.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/* ── colour maths (WCAG 2.x) ── */
const hex = h => { h = h.replace('#', ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const lum = c => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const over = (fg, a, bg) => fg.map((v, i) => v * a + bg[i] * (1 - a));
const WHITE = [255, 255, 255];

/* ── token blocks ── */
function block(sel) {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp('(^|\\})\\s*' + esc + '\\s*\\{([^}]*)\\}').exec(css);
  if (!m) return null;
  const t = {};
  for (const d of m[2].split(';')) { const i = d.indexOf(':'); if (i > 0) t[d.slice(0, i).trim()] = d.slice(i + 1).trim(); }
  return t;
}
const NEED = ['--dc-bg', '--dc-rail', '--dc-surface', '--dc-surface-2', '--dc-surface-3', '--dc-line', '--dc-line-2', '--dc-text', '--dc-text-2', '--dc-muted',
  '--dc-accent', '--dc-accent-rgb', '--dc-accent-ink', '--dc-navy', '--dc-navy-2', '--dc-pink', '--dc-pink-rgb', '--dc-pos', '--dc-pos-rgb', '--dc-neg', '--dc-neg-rgb',
  '--dc-amber', '--dc-amber-rgb', '--dc-shadow', '--checkbox-border-color',
  ...['bank', 'health', 'gap', 'insure', 'life'].flatMap(k => [`--c-${k}`, `--c-${k}-ink`, `--c-${k}-rgb`])];
const PRODUCTS = ['bank', 'health', 'gap', 'insure', 'life'];

assert.strictEqual(DEFAULT_PALETTE, 'discovery');
assert.strictEqual(DEFAULT_SETTINGS.palette, DEFAULT_PALETTE, 'the default palette stays the page\'s own colours');
assert.strictEqual(PALETTES[0].id, DEFAULT_PALETTE);
assert.strictEqual(new Set(PALETTES.map(p => p.id)).size, PALETTES.length, 'palette ids are unique');
assert.ok(PALETTES.length >= 6, 'the current colours and five new palettes');

let checked = 0;
const fails = [];
for (const p of PALETTES.slice(1)) {
  for (const theme of ['dark', 'light']) {
    const sel = (theme === 'light' ? '.theme-light ' : '') + '.dc-page.dc-pal-' + p.id;
    const t = block(sel);
    assert.ok(t, `${p.id}: no ${theme} block (${sel})`);
    for (const k of NEED) assert.ok(k in t, `${p.id} ${theme}: ${k} missing`);
    for (const k of NEED.filter(k => k.endsWith('-rgb'))) {
      const base = k.replace(/-rgb$/, '');
      assert.deepStrictEqual(t[k].split(',').map(Number), hex(t[base]), `${p.id} ${theme}: ${k} is not ${base}`);
    }
    const c = k => hex(t[k]);
    const dark = theme === 'dark';
    const bgs = [['background', c('--dc-bg')], ['card', c('--dc-surface')], ['inset', c('--dc-surface-2')], ...(dark ? [] : [['side rail', c('--dc-rail')]])];
    const check = (what, fg, bg, where, min) => { checked++; const r = ratio(fg, bg); if (r < min) fails.push(`${p.id} ${theme}: ${what} on ${where} ${r.toFixed(2)} < ${min}`); };
    for (const k of ['--dc-text', '--dc-text-2', '--dc-muted', '--dc-accent-ink', '--dc-pos', '--dc-neg', '--dc-amber', ...PRODUCTS.map(x => `--c-${x}-ink`)]) {
      for (const [n, b] of bgs) check(k, c(k), b, n, 4.5);
    }
    check('better off', c('--dc-pos'), over(c('--dc-pos'), dark ? 0.14 : 0.1, c('--dc-surface')), 'its pill', 4.5);
    check('worse off', c('--dc-neg'), over(c('--dc-neg'), dark ? 0.16 : 0.08, c('--dc-surface')), 'its pill', 4.5);
    for (const x of PRODUCTS) {
      check(`${x} ink`, c(`--c-${x}-ink`), over(c(`--c-${x}`), 0.14, c('--dc-surface')), 'its tag', 4.5);
      check(`${x} shape`, c(`--c-${x}`), c('--dc-surface'), 'card', 3);
      check(`${x} shape`, c(`--c-${x}`), c('--dc-bg'), 'background', 3);
    }
    check('white', WHITE, c('--dc-navy'), 'button', 4.5);
    check('white', WHITE, c('--dc-navy-2'), 'button top', 4.5);
    check('accent', c('--dc-accent'), c('--dc-surface'), 'card', 3);
    check('accent', c('--dc-accent'), c('--dc-bg'), 'background', 3);
    check('marker', c('--dc-pink'), c('--dc-rail'), 'rail', 3);
    if (dark) {
      check('rail label', over(WHITE, 0.5, c('--dc-rail')), c('--dc-rail'), 'rail', 4.5);
      check('rail tab', over(WHITE, 0.66, c('--dc-rail')), c('--dc-rail'), 'rail', 4.5);
      check('open tab', WHITE, over(c('--dc-accent'), 0.22, c('--dc-rail')), 'open tab', 4.5);
    } else {
      check('open tab', c('--dc-navy'), over(c('--dc-accent'), 0.1, c('--dc-rail')), 'open tab', 4.5);
    }
  }
}
assert.deepStrictEqual(fails, [], 'contrast below WCAG AA:\n' + fails.join('\n'));

// 3. no coloured glows: no drop-shadow, no blur-only shadow in a colour token
assert.ok(!/drop-shadow\(/.test(css.replace(/filter:\s*none/g, '')), 'a palette rule adds a drop-shadow glow');
assert.ok(!/box-shadow:[^;]*rgba\(var\(/.test(css), 'a palette rule paints a shadow in a palette colour');

// 4. the classes
const page = () => { const s = new Set(); return { classList: { contains: c => s.has(c), toggle: (c, on) => (on ? s.add(c) : s.delete(c)) }, s }; };
const pg = page();
applyPalette(pg, 'plum');
assert.deepStrictEqual([...pg.s].sort(), ['dc-pal', 'dc-pal-plum']);
applyPalette(pg, 'graphite');
assert.deepStrictEqual([...pg.s].sort(), ['dc-pal', 'dc-pal-graphite']);
applyPalette(pg, 'discovery');
assert.deepStrictEqual([...pg.s], []);
applyPalette(pg, 'no-such-palette');
assert.deepStrictEqual([...pg.s], []);
assert.strictEqual(paletteOf(undefined), DEFAULT_PALETTE);

console.log(`palettes OK (${PALETTES.length - 1} palettes, ${checked} contrast pairs)`);
