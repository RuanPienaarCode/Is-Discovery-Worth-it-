'use strict';
/* Finds and reads the Budget plugin's folders through a tiny source
   interface, so the plugin (Obsidian vault) and the node scripts (fs) share
   one loader:
     source.paths()     → every markdown and csv path, vault-relative
     source.read(path)  → Promise<string>
     source.stat(path)  → { mtime, size } (optional; lets unchanged CSVs be skipped) */

const { isTransactionNote, parseTransactionNote, parseAccountNote, parseFrontmatter } = require('./transactions');
const { isMilesStatement, parseMilesStatement, mergeStatements } = require('./miles');

const sub = (base, name) => (base ? base + '/' : '') + name + '/';
const nameOf = p => p.slice(p.lastIndexOf('/') + 1).replace(/\.md$/, '');

/* The folder whose Transactions/<account>/<YYYY-MM>.md files exist.
   `hint` wins when set. Shortest match first, so a nested backup never
   shadows the real budget. */
function findBudgetFolder(paths, hint) {
  if (hint) return hint.replace(/\/+$/, '');
  const hits = new Set();
  for (const p of paths) {
    const m = /^(.*?)\/?Transactions\/[^/]+\/\d{4}-\d\d\.md$/.exec(p);
    if (m) hits.add(m[1]);
  }
  return [...hits].sort((a, b) => a.length - b.length)[0] ?? null;
}

async function loadBudget(source, hint) {
  const all = source.paths();
  const miles = await loadMiles(source, all.filter(p => /\.csv$/i.test(p)));
  const paths = all.filter(p => /\.md$/i.test(p));
  const folder = findBudgetFolder(paths, hint);
  if (folder === null) return { folder: null, rows: [], accounts: {}, categories: {}, skipped: 0, notes: 0, miles };
  const tx = sub(folder, 'Transactions'), ac = sub(folder, 'Accounts'), ca = sub(folder, 'Categories');
  const rows = [];
  const accounts = {};
  const categories = {};
  let skipped = 0, notes = 0;
  for (const p of paths) {
    if (p.startsWith(tx)) {
      const text = await source.read(p);
      if (!isTransactionNote(text)) continue;
      const parts = p.slice(tx.length).split('/');
      const n = parseTransactionNote(text, parts.length > 1 ? parts[0] : '');
      rows.push(...n.rows);
      skipped += n.skipped;
      notes++;
    } else if (p.startsWith(ac) && !p.slice(ac.length).includes('/')) {
      const a = parseAccountNote(await source.read(p), nameOf(p));
      accounts[a.label] = { institution: a.institution, type: a.type };
    } else if (p.startsWith(ca) && !p.slice(ca.length).includes('/')) {
      categories[nameOf(p)] = (parseFrontmatter(await source.read(p)).type || '').trim().toLowerCase();
    }
  }
  return { folder, rows, accounts, categories, skipped, notes, miles };
}

/* Every Discovery Miles statement CSV in the vault, wherever it was saved.
   Each CSV is read and parsed once and kept until its date or size
   changes — a refresh should not re-read every export in the vault. */
const csvCache = new Map();
async function loadMiles(source, csvPaths) {
  const lists = [], files = [];
  for (const p of csvPaths) {
    const st = source.stat ? source.stat(p) : null;
    let hit = st ? csvCache.get(p) : null;
    if (!hit || hit.mtime !== st.mtime || hit.size !== st.size) {
      const text = await source.read(p);
      const miles = isMilesStatement(text);
      hit = { mtime: st && st.mtime, size: st && st.size, rows: miles ? parseMilesStatement(text) : null };
      if (st) csvCache.set(p, hit);
    }
    if (!hit.rows) continue;
    lists.push(hit.rows);
    files.push(p);
  }
  return files.length ? { files, rows: mergeStatements(lists) } : null;
}

module.exports = { findBudgetFolder, loadBudget };
