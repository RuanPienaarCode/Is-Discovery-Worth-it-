'use strict';
/* Run Is Discovery Worth It? over a REAL vault from the terminal and print
   what it measured and concluded. Prints to the terminal only: it writes no
   file, and nothing it prints may be pasted into this repo (real figures).
     node scripts/real-vault.cjs "<vault path>" [YYYY-MM-DD today] */
const fs = require('node:fs');
const path = require('node:path');
const { loadBudget } = require('../src/load');
const { measure, trailingWindow } = require('../src/measure');
const { DEFAULT_SETTINGS } = require('../src/constants');
const { summariseMiles } = require('../src/miles');

const vault = process.argv[2];
if (!vault) { console.error('usage: node scripts/real-vault.cjs <vault> [today]'); process.exit(2); }
const today = process.argv[3] ? new Date(process.argv[3]) : new Date();

function walk(dir, rel = '', out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) walk(path.join(dir, e.name), r, out);
    else if (/\.(md|csv)$/i.test(e.name)) out.push(r);
  }
  return out;
}

(async () => {
  let settings = { ...DEFAULT_SETTINGS };
  const data = path.join(vault, '.obsidian/plugins/discovery-worth-it/data.json');
  if (fs.existsSync(data)) settings = { ...settings, ...JSON.parse(fs.readFileSync(data, 'utf8')) };
  const all = walk(vault);
  const b = await loadBudget({ paths: () => all, read: async p => fs.readFileSync(path.join(vault, p), 'utf8'), stat: p => { const t = fs.statSync(path.join(vault, p)); return { mtime: t.mtimeMs, size: t.size }; } }, settings.budgetFolder);
  console.log(`budget folder: ${b.folder} · ${b.notes} notes · ${b.rows.length} rows · ${b.skipped} unreadable`);
  /* Which Discovery products the statements show (added by the detect module;
     skipped quietly while that module is not in the tree). */
  try {
    const { detectProducts } = require('../src/detect');
    for (const [k, d] of Object.entries(detectProducts(b))) console.log(`  detected ${k.padEnd(7)} ${d.found ? 'yes' : 'no '}  ${d.why || ''}`);
  } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }
  const win = trailingWindow(today, settings.months);
  const m = measure(b.rows, b.accounts, b.categories, { ...win, notCardSpend: settings.notCardSpend });
  console.log(`window ${m.from}..${m.to} · ${m.rowsSeen} rows · card accounts ${m.cardAccounts.join(', ')}`);
  for (const [k, f] of Object.entries(m.figures).sort()) console.log(`  ${k.padEnd(22)} ${f.total.toFixed(2).padStart(12)}  n=${f.count}`);
  console.log('  excluded from card spend:', Object.entries(m.excludedFromSpend).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(' · '));
  if (process.env.MODEL !== '0') {
    try {
      const { buildStatement } = require('../src/model');
      const ms = b.miles ? summariseMiles(b.miles.rows, m.from, m.to) : null;
      if (b.miles) console.log('miles statements:', b.miles.files.join(', '));
      const s = buildStatement(m, settings, ms);
      if (process.env.COMPARE) {
        /* COMPARE=1: only the Health, Gap and Insure market tables. */
        const { buildProducts } = require('../src/products');
        const { compareHealth, compareGap, compareInsure } = require('../src/compare');
        const { products } = buildProducts(s, m, ms, settings, today);
        const P = id => products.find(x => x.id === id);
        const show = (title, c) => {
          if (!c) return console.log(title + ': nothing to compare');
          console.log(`\n${title}: now ${c.current.monthly.toFixed(0)}/month${c.vitalityNet !== undefined ? ` · Vitality net ${c.vitalityNet.toFixed(0)}/yr` : ''}${c.driveValue !== undefined ? ` · Drive ${c.driveValue.toFixed(0)}/yr` : ''}`);
          for (const r of c.rows) console.log(`${r.likeForLike === false ? '✗' : r.unsure && r.unsure.length ? '?' : ' '} ${(r.scheme ? r.scheme + ' ' + r.plan : r.provider ? r.provider + ' ' + r.plan : r.name).padEnd(36)} ${r.monthly === null ? '     —' : r.monthly.toFixed(0).padStart(6)}  ${r.gainIfSwitch === null ? (r.breakEven ? `quote under ${r.breakEven.toFixed(0)}` : '') : (r.gainIfSwitch >= 0 ? '+' : '') + r.gainIfSwitch.toFixed(0) + '/yr'}${r.misses && r.misses.length ? '  misses ' + r.misses.join(',') : ''}${r.unsure && r.unsure.length ? '  check ' + r.unsure.join(',') : ''}`);
        };
        show('Health', compareHealth(P('health'), settings));
        show('Gap', compareGap(P('gap'), settings));
        show('Insure', compareInsure(P('insure'), settings));
        const { compareLife, compareHome } = require('../src/compare');
        const { buildVerdicts } = require('../src/verdict');
        const cmp = { health: compareHealth(P('health'), settings), gap: compareGap(P('gap'), settings), insure: compareInsure(P('insure'), settings), life: compareLife(P('life'), settings), home: compareHome(settings) };
        show('Life', cmp.life);
        show('Home', cmp.home);
        console.log('\nVerdicts:');
        for (const v of Object.values(buildVerdicts(s, cmp)).filter(Boolean)) console.log(`  ${v.id.padEnd(7)} ${v.word.padEnd(15)} ${v.amount === null ? '' : v.amount.toFixed(0).padStart(7)}  ${v.vs || ''}`);
        return;
      }
      console.log(JSON.stringify(s, null, 1));
    } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }
  }
})();
