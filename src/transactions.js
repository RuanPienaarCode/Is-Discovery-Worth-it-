'use strict';
/* Reads the Budget plugin's transaction notes. Each note is one account-month:
     ---
     account: "Credit Card"
     month: 2026-09
     ---
     | Date | Description | Category | Amount | Excluded | Note |
   Account notes (Accounts/*.md) say which institution and account type each
   transaction folder belongs to, via `institution`, `type` and `tx_label`.
   Pure text in, plain objects out, so the tests run in node. */

const HEADER = /^\|\s*Date\s*\|\s*Description\s*\|\s*Category\s*\|\s*Amount\s*\|/im;
const DATE = /^\d{4}-\d\d-\d\d$/;

function parseFrontmatter(text) {
  const out = {};
  if (!text.startsWith('---')) return out;
  const end = text.indexOf('\n---', 3);
  if (end < 0) return out;
  for (const line of text.slice(3, end).split('\n')) {
    const m = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line.trim());
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

function isTransactionNote(text) {
  return HEADER.test(text);
}

/* "1,234.50", "-1 234.50", "R -95.00", "-95,00" → number; anything
   ambiguous → NaN, so the row is counted as unreadable, never guessed.
   A comma is a thousands separator only in groups of three before a dot or
   the end; "95,00" (one or two digits after it) is a decimal comma. */
function parseAmount(raw) {
  const s = String(raw).replace(/[R\s ]/g, '');
  if (/^[+-]?\d+(\.\d+)?$/.test(s)) return Number(s);
  if (/^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) return Number(s.replace(/,/g, ''));
  if (/^[+-]?\d+,\d{1,2}$/.test(s)) return Number(s.replace(',', '.'));
  return NaN;
}

/* The Budget plugin's Split column: a split purchase keeps its original as
   a 'parent' row beside the 'part' rows it was split into. */
function splitRole(raw) {
  const v = String(raw || '').trim().toLowerCase();
  return v === 'parent' || v === 'part' ? v : '';
}

/* One note → { account, month, rows, skipped }. `fallbackAccount` is the
   folder name, used when the note has no `account:` key. A row whose amount
   cannot be read is counted in `skipped`, never guessed. */
function parseTransactionNote(text, fallbackAccount) {
  const fm = parseFrontmatter(text);
  const account = fm.account || fallbackAccount || '';
  const rows = [];
  let skipped = 0;
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('|')) continue;
    const cells = t.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
    if (cells.length < 4 || !DATE.test(cells[0])) continue;
    const amount = parseAmount(cells[3]);
    if (Number.isNaN(amount)) { skipped++; continue; }
    rows.push({
      date: cells[0],
      description: cells[1],
      category: cells[2],
      amount,
      excluded: /^(yes|true|x|y)$/i.test(cells[4] || ''),
      note: cells[5] || '',
      split: splitRole(cells[6]),
      account,
    });
  }
  return { account, month: fm.month || '', rows, skipped };
}

/* Account note → { label, institution, type }. label is what the
   transaction notes call the account: tx_label, else the note's name. */
function parseAccountNote(text, basename) {
  const fm = parseFrontmatter(text);
  return {
    label: fm.tx_label || basename,
    institution: fm.institution || '',
    type: (fm.type || '').trim().toLowerCase(),
  };
}

module.exports = { parseFrontmatter, isTransactionNote, parseAmount, splitRole, parseTransactionNote, parseAccountNote };
