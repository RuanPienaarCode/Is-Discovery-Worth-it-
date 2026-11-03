'use strict';
/* Finds and reads the Budget plugin's folders through a tiny source
   interface, so the plugin (Obsidian vault) and the node scripts (fs) share
   one loader:
     source.paths()     → every markdown and csv path, vault-relative
     source.read(path)  → Promise<string>
     source.stat(path)  → { mtime, size } (optional; lets unchanged CSVs be skipped,
                          and CSVs too big to be a Miles statement left unread)
     source.head(path, bytes) → Promise<string> (optional; the start of a file,
                          so a CSV that is not a Miles statement is never read whole) */

const { isTransactionNote, parseTransactionNote, parseAccountNote, parseFrontmatter } = require('./transactions');
const { isMilesStatement, parseMilesStatement, mergeStatements } = require('./miles');

const sub = (base, name) => (base ? base + '/' : '') + name + '/';
const nameOf = p => p.slice(p.lastIndexOf('/') + 1).replace(/\.md$/, '');

/* Every folder that looks like a Budget plugin budget (it holds
   Transactions/<account>/<YYYY-MM>.md notes), best first:
     a folder with account notes (Accounts/<name>.md) before one without
     (a stray or copied Transactions folder has none);
     then the one with the most transaction notes;
     then the one whose notes run latest (an old archive gives way);
     then the shorter path, then by name.
   → [{ folder, notes, accounts, latest: 'YYYY-MM' }] ('' = the vault root) */
function budgetCandidates(paths) {
  const found = new Map();
  for (const p of paths || []) {
    const m = /^(.*?)\/?Transactions\/[^/]+\/(\d{4}-\d\d)\.md$/.exec(p);
    if (!m) continue;
    const c = found.get(m[1]) || { folder: m[1], notes: 0, accounts: 0, latest: '' };
    c.notes++;
    if (m[2] > c.latest) c.latest = m[2];
    found.set(m[1], c);
  }
  for (const c of found.values()) {
    const ac = sub(c.folder, 'Accounts');
    c.accounts = (paths || []).filter(p => p.startsWith(ac) && /\.md$/i.test(p) && !p.slice(ac.length).includes('/')).length;
  }
  return [...found.values()].sort((x, y) =>
    (y.accounts > 0) - (x.accounts > 0) || y.notes - x.notes || (y.latest > x.latest ? 1 : y.latest < x.latest ? -1 : 0)
    || x.folder.length - y.folder.length || (x.folder < y.folder ? -1 : x.folder > y.folder ? 1 : 0));
}

/* The budget folder to read: `hint` (settings.budgetFolder) wins when set;
   otherwise the best of budgetCandidates, or null when there is none. */
function findBudgetFolder(paths, hint) {
  if (hint) return hint.replace(/\/+$/, '');
  const best = budgetCandidates(paths)[0];
  return best ? best.folder : null;
}

async function loadBudget(source, hint) {
  const all = source.paths();
  const csv = await loadMiles(source, all.filter(p => /\.csv$/i.test(p)));
  const miles = csv.miles, csvSkipped = csv.skipped, csvNotes = csv.notes;
  const paths = all.filter(p => /\.md$/i.test(p));
  const folder = findBudgetFolder(paths, hint);
  /* every budget-looking folder, best first, so the page can say which one
     it read when there is more than one */
  const candidates = budgetCandidates(paths);
  if (folder === null) return { folder: null, candidates, rows: [], accounts: {}, categories: {}, skipped: 0, notes: 0, miles, csvSkipped, csvNotes };
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
  return { folder, candidates, rows, accounts, categories, skipped, notes, miles, csvSkipped, csvNotes };
}

/* Every Discovery Miles statement CSV in the vault, wherever it was saved.
   Only the first kilobyte of a CSV is looked at to tell whether it is one
   (when the source can read just the start); a file over 5 MB is not read
   at all, since a phone could run out of memory on it and years of Miles
   are far smaller. Each CSV is read and parsed once and kept until its date
   or size changes — a refresh should not re-read every export in the vault.
   → { miles: { files, rows } | null, skipped: [{ path, size }], notes: [plain sentences] } */
const HEAD_BYTES = 1024;
const MAX_CSV_BYTES = 5 * 1024 * 1024;
const csvCache = new Map();
async function loadMiles(source, csvPaths) {
  const lists = [], files = [], skipped = [];
  for (const p of csvPaths) {
    const st = source.stat ? source.stat(p) : null;
    if (st && Number(st.size) > MAX_CSV_BYTES) { skipped.push({ path: p, size: Number(st.size) }); continue; }
    let hit = st ? csvCache.get(p) : null;
    if (!hit || hit.mtime !== st.mtime || hit.size !== st.size) {
      let rows = null;
      const head = source.head ? await source.head(p, HEAD_BYTES) : null;
      if (head === null || isMilesStatement(head)) {
        const text = await source.read(p);
        if (isMilesStatement(text.slice(0, HEAD_BYTES))) rows = parseMilesStatement(text);
      }
      hit = { mtime: st && st.mtime, size: st && st.size, rows };
      if (st) csvCache.set(p, hit);
    }
    if (!hit.rows) continue;
    lists.push(hit.rows);
    files.push(p);
  }
  const notes = skipped.map(f => `${f.path} was not read: at ${Math.round(f.size / 1048576)} MB it is too big to be a Discovery Miles statement.`);
  return { miles: files.length ? { files, rows: mergeStatements(lists) } : null, skipped, notes };
}

module.exports = { findBudgetFolder, budgetCandidates, loadBudget, MAX_CSV_BYTES };
