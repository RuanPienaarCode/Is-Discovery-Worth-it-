/* Type floor on phones and touch screens (src/css/type-floor.css): no rule
   aimed at .is-phone or .is-touch may set text under 11px (Apple's Caption 2
   is 11pt). A 9px phone rule once made the cover grid's heads unreadable. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const files = ['src/styles.css', ...fs.readdirSync(path.join(root, 'src/css')).filter(f => f.endsWith('.css')).map(f => 'src/css/' + f)];
const bad = [];
for (const f of files) {
  const css = fs.readFileSync(path.join(root, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1].trim();
    if (!/\.is-(phone|touch)\b/.test(sel)) continue;
    const fs_ = /font-size:\s*([\d.]+)px/.exec(m[2]);
    if (fs_ && parseFloat(fs_[1]) < 11) bad.push(`${f}: ${sel.replace(/\s+/g, ' ')} → ${fs_[1]}px`);
  }
}
assert.deepStrictEqual(bad, [], 'phone/touch text under 11px:\n' + bad.join('\n'));
/* and the floor file itself is in the build */
const built = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
assert.ok(built.includes('Type floor on touch screens'), 'styles.css is missing src/css/type-floor.css — run the build');
console.log('type floor OK');
