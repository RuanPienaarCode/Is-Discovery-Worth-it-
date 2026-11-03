'use strict';
/* CSS guards: the JavaScript guard (ios-hazards) cannot see the stylesheet,
   and the stylesheet is where the phone bugs came from. Checks:
   1. nothing iOS 15 WebKit drops: color-mix(), :has(), container queries;
   2. no !important (Obsidian's review flags every one);
   3. overflow-wrap: anywhere (iOS 15.4+) always has a word-break fallback;
   4. :focus-visible (iOS 15.4+) only in a rule of its own, never in a
      selector list, so an older engine drops just that rule;
   5. every rule is scoped to the plugin (a dc- class, or the view's own
      container) — no global selectors;
   6. the button reset undoes Obsidian's `button { white-space: nowrap }`,
      which made labels run over their amounts on a phone;
   7. the built styles.css is the source stylesheets joined, unchanged
      (src/styles.css, then src/css/*.css in name order). */
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const cssDir = path.join(root, 'src/css');
const parts = ['src/styles.css', ...(fs.existsSync(cssDir) ? fs.readdirSync(cssDir).filter(f => f.endsWith('.css')).sort().map(f => 'src/css/' + f) : [])];
const src = parts.map(p => fs.readFileSync(path.join(root, p), 'utf8')).join('\n');
const css = src.replace(/\/\*[\s\S]*?\*\//g, '');

// 1. engine floor
for (const [re, what] of [[/color-mix\(/, 'color-mix()'], [/:has\(/, ':has()'], [/@container\b/, 'container queries'], [/\b\d+(\.\d+)?cq[iwhb]\b/, 'container query units']]) {
  assert.ok(!re.test(css), `styles.css uses ${what} — iOS 15 WebKit drops it`);
}

// 2. no !important
assert.ok(!/!important/.test(css), 'styles.css uses !important — Obsidian\'s review flags it');

/* innermost rules: "selectors { declarations }" (inside @media too) */
const rules = [];
const re = /([^{}]+)\{([^{}]*)\}/g;
let m;
while ((m = re.exec(css))) {
  const sel = m[1].trim();
  if (/^@/.test(sel) || /^(from|to|\d+%)$/.test(sel)) continue; // at-rules, keyframe steps
  rules.push({ sel, body: m[2] });
}
assert.ok(rules.length > 50, 'the rule parser found the stylesheet');

for (const r of rules) {
  // 3. overflow-wrap: anywhere needs its fallback in the same rule
  if (/overflow-wrap:\s*anywhere/.test(r.body)) {
    assert.ok(/word-break:\s*break-word/.test(r.body), `${r.sel}: overflow-wrap: anywhere without word-break: break-word for iOS 15.0–15.3`);
  }
  // 4. :focus-visible stands alone
  if (/:focus-visible/.test(r.sel)) {
    assert.ok(!r.sel.includes(','), `${r.sel}: :focus-visible inside a selector list — older WebKit would drop the whole list`);
  }
  // 5. scoped: every selector in the list names a dc- class
  for (const one of r.sel.split(',')) {
    assert.ok(/\.dc-/.test(one) || /\.dc[-\w]*/.test(one), `global selector "${one.trim()}" — scope it to a dc- class`);
  }
}

// 6. the button reset wraps text
const reset = rules.find(r => r.sel === '.dc-page button:not(.clickable-icon)');
assert.ok(reset, 'the button reset is present');
assert.ok(/white-space:\s*normal/.test(reset.body), 'the button reset must set white-space: normal (Obsidian\'s button rule sets nowrap)');

// 7. the built stylesheet is the source one
const built = path.join(root, 'styles.css');
if (fs.existsSync(built)) assert.strictEqual(fs.readFileSync(built, 'utf8'), src, 'styles.css differs from src/styles.css + src/css/*.css — run ./build.sh');

console.log(`css hazards OK (${rules.length} rules)`);
