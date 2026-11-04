'use strict';
/* "Save a summary note": today's verdicts and key figures as a dated
   markdown note in the vault, a record to compare next year or to talk
   over with a spouse or an adviser. Written only when the person asks.

   Pure text from the plugin's own figures (never worked out again here):
   the statement (model.js), the products (products.js), the verdicts
   (verdict.js), stay-or-move (switch.js), the market age (market.js) and,
   when given, the levers (levers.js). Totals and verdicts only: no account
   names or numbers, no transaction descriptions, no file paths or folder
   names. Plain words (Addition 5 glossary): every amount positive, with a
   word for its direction.

   saveSummary writes it through the Obsidian Vault API (no Node APIs) and
   never overwrites a note: a second summary the same day is "… 2". */

const { money, monthLabel, dayLabel } = require('./format');
const { BENEFITS } = require('./benefits');
const { marketAge } = require('./market');

const DEFAULT_FOLDER = 'Is Discovery Worth It';
const FULL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const LEVELS = [['full', 'I use it'], ['half', 'Sometimes'], ['none', 'Not for me']];

/* 'YYYY-MM-DD' for a Date (local day) or a date string. */
function ymdOf(now) {
  if (typeof now === 'string' && /^\d{4}-\d{2}-\d{2}/.test(now)) return now.slice(0, 10);
  const d = now instanceof Date && !isNaN(now.getTime()) ? now : new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* '2026-11-04' → '4 November 2026' */
function longDate(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return `${d} ${FULL_MONTHS[m - 1]} ${y}`;
}

const num = v => typeof v === 'number' && Number.isFinite(v);
/* every amount positive: the sentence carries the direction */
const R = v => money(Math.abs(v));
const isUnknown = v => !!v && v.tone === 'unknown';
const listOf = xs => (xs.length > 1 ? xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1] : xs[0] || '');
/* a YAML scalar that is always read back as the same string */
const yamlStr = v => JSON.stringify(String(v));
const ymOk = v => typeof v === 'string' && /^\d{4}-\d{2}$/.test(v);

/* What you pay against what comes back, after rewards, in one sentence. */
function afterRewards(paid, back) {
  const left = paid - back;
  if (Math.abs(left) < 0.5) return 'After rewards, it comes to about nothing.';
  return left > 0 ? `After rewards, you pay ${R(left)} a year.` : `After rewards, ${R(left)} a year more comes back than you pay.`;
}

/* The verdict's figure in words (the Overview card's lead line). */
function verdictLead(v) {
  if (!v || isUnknown(v) || !num(v.amount)) return '';
  const a = `${R(v.amount)} a year`;
  if (v.tone === 'good' && v.vs) return v.amount >= 0 ? `${a} better off than with ${v.vs}.` : `${v.vs} is only ${a} cheaper.`;
  if (v.tone === 'check' && v.vs) return `${v.vs} could save you ${a}.`;
  if (v.tone === 'over' && v.vs) return v.id === 'bank' ? `By these figures, ${a} better off with ${v.vs}.` : `Your ${v.vs} quote is ${a} cheaper.`;
  /* a break-even quote is a monthly premium */
  if (v.tone === 'quote') return `A quote under ${R(v.amount)} a month wins.`;
  if (v.tone === 'none') return `About ${a} would insure them.`;
  return '';
}

function productSection(out, name, v, p) {
  out.push(`### ${name}${v && v.word ? ' — ' + v.word : ''}`, '');
  if (v && v.why) out.push(v.why, '');
  /* never a figure under "Not enough data" (or "Ended") */
  if (isUnknown(v)) return;
  /* the lead only when the reason does not already give the amount */
  const lead = verdictLead(v);
  if (lead && !(v.why && num(v.amount) && v.why.includes(R(v.amount)))) out.push(lead, '');
  if (!p) return;
  const paid = num(p.paid) ? p.paid : null;
  const back = num(p.backSum) ? p.backSum : null;
  if (paid !== null) out.push(`- You pay ${R(paid)} a year.`);
  if (back !== null) out.push(back >= 0.5 ? `- ${R(back)} a year comes back.` : '- Nothing came back.');
  if (paid !== null && back !== null) out.push(`- ${afterRewards(paid, back)}`);
  out.push('');
}

function compareSection(out, sw, pr, verdicts, st) {
  if (!sw || !num(sw.gain)) return;
  out.push('## Stay with Discovery or move everything?', '');
  const products = (pr && pr.products) || [];
  const unknownAll = products.length > 0 && products.every(p => isUnknown(verdicts && verdicts[p.id]));
  const thin = !!(st && st.confidence && st.confidence.thin) || unknownAll;
  if (thin) {
    out.push('Not enough data to say. There are too few months of statements to compare a whole year.', '');
    return;
  }
  const diff = Math.abs(sw.gain);
  const stayBetter = sw.gain <= 0;
  if (diff < 0.5) out.push('Both cost about the same, after rewards.', '');
  else if (stayBetter) out.push(`**Staying looks cheaper.** By these figures, moving everything would leave you ${R(diff)} a year worse off, after rewards.`, '');
  else out.push(`**Moving looks cheaper.** By these figures, moving everything would leave you ${R(diff)} a year better off, after rewards.`, '');
  const side = (label, x) => {
    if (!x || !num(x.cost) || !num(x.benefit)) return;
    out.push(`- ${label}: you pay ${R(x.cost)} a year and ${R(x.benefit)} comes back. ${afterRewards(x.cost, x.benefit)}`);
  };
  side('Stay with Discovery', sw.stay);
  side('Move everything', sw.go);
  out.push('');
  if (Array.isArray(sw.assumed) && sw.assumed.length) {
    out.push(`No quote yet for ${listOf(sw.assumed.map(x => String(x).toLowerCase()))}, so both sides use what you pay now.`, '');
  }
  out.push('Moving everything means the cheapest options the plugin could price, using today\'s prices. Cover is never exactly the same, so check each one before you move.', '');
}

function leversSection(out, levers) {
  const list = (Array.isArray(levers) ? levers : []).filter(l => l && l.title && num(l.gain) && l.gain >= 0.5).slice(0, 3);
  if (!list.length) return;
  out.push('## Ways to get more', '');
  for (const l of list) out.push(`- **${l.title}**: ${R(l.gain)} a year more.${l.how ? ' ' + l.how : ''}`);
  out.push('');
}

function benefitsSection(out, st) {
  const b = (st && st.benefits) || {};
  const groups = LEVELS.map(([level, words]) => ({
    words,
    labels: BENEFITS.filter(x => b[x.id] && b[x.id].available !== false && b[x.id].level === level).map(x => x.label),
  }));
  if (!groups.some(g => g.labels.length)) return;
  out.push('## The benefits you use', '');
  for (const g of groups) out.push(`- ${g.words} (${g.labels.length})${g.labels.length ? ': ' + listOf(g.labels) + '.' : ''}`);
  out.push('', 'A benefit only counts at what it is worth to you. Change these on the Benefits tab.', '');
}

function pricesSection(out, age) {
  if (!age || !age.asOf) return;
  out.push('## Prices', '');
  if (age.stale) {
    out.push(`These prices may be out of date: we last checked them on ${dayLabel(age.asOf)}. Check each one with the company before you decide.${age.staleWhy ? ' ' + age.staleWhy : ''}`, '');
  } else {
    out.push(`Prices of other companies checked on ${dayLabel(age.asOf)}.`, '');
  }
}

/* { st, pr, verdicts, sw, s, now, market?, levers?, version? } → markdown.
   market: marketAge(now) (worked out when left out); levers: levers.js
   computeLevers() (the top three are written); version: the plugin's
   manifest version for the frontmatter. */
function summaryMarkdown(o) {
  const { st, pr, verdicts, sw, levers, version } = o || {};
  const today = ymdOf(o && o.now);
  const age = (o && o.market) || marketAge(today);
  const w = (st && st.window) || {};
  const out = ['---', 'type: discovery-summary', `date: ${today}`];
  if (version) out.push(`version: ${yamlStr(version)}`);
  if (ymOk(w.from)) out.push(`window_from: ${yamlStr(w.from)}`);
  if (ymOk(w.to)) out.push(`window_to: ${yamlStr(w.to)}`);
  out.push('---', '', `# Is Discovery worth it? — ${longDate(today)}`, '');

  if (ymOk(w.from) && ymOk(w.to)) {
    const n = num(w.months) ? w.months : null;
    let line = `From your statements, ${monthLabel(w.from)} to ${monthLabel(w.to)}${n ? ` (${n === 1 ? 'one month' : n + ' months'})` : ''}, made into a year.`;
    if (n && num(w.dataMonths) && w.dataMonths < n) line += ` Only ${w.dataMonths} of those months have Discovery payments, so the rest is scaled up.`;
    out.push(line, '');
  }
  out.push('Every amount is for a year. After rewards means what you pay, less what comes back.', '');

  const products = (pr && pr.products) || [];
  const v = verdicts || {};
  if (products.length) {
    out.push('## Is each one worth it?', '');
    for (const p of products) {
      productSection(out, p.name, v[p.id], p);
      if (p.id === 'insure' && v.home) productSection(out, 'Home contents', v.home, null);
    }
  }
  compareSection(out, sw, pr, verdicts, st);
  leversSection(out, levers);
  benefitsSection(out, st);
  pricesSection(out, age);
  out.push('---', '', 'Made by the Is Discovery Worth It plugin. A calculator, not financial advice.', '');
  return out.join('\n');
}

/* The folder setting as a vault path: trimmed, no leading or trailing
   slashes, no "." or ".." parts; blank → DEFAULT_FOLDER. */
function normaliseFolder(folder) {
  const parts = String(folder === undefined || folder === null ? '' : folder).trim().split(/[\\/]+/).map(x => x.trim()).filter(x => x && x !== '.' && x !== '..');
  return parts.length ? parts.join('/') : DEFAULT_FOLDER;
}

/* vault: Obsidian's Vault (getAbstractFileByPath, createFolder, create).
   Creates the folder (each missing level) and "Summary <date>.md" in it,
   or "Summary <date> 2.md", " 3", … when that name is taken; never
   overwrites. → the created note's path. */
async function saveSummary(vault, folder, now, text) {
  const dir = normaliseFolder(folder);
  const parts = dir.split('/');
  for (let i = 1; i <= parts.length; i++) {
    const p = parts.slice(0, i).join('/');
    const f = vault.getAbstractFileByPath(p);
    if (!f) await vault.createFolder(p);
    else if (!Array.isArray(f.children)) throw new Error(`"${p}" is a note, not a folder. Choose another folder for summary notes in the settings.`);
  }
  const base = `${dir}/Summary ${ymdOf(now)}`;
  let path = base + '.md';
  for (let n = 2; vault.getAbstractFileByPath(path); n++) path = `${base} ${n}.md`;
  const made = await vault.create(path, String(text === undefined || text === null ? '' : text));
  return (made && made.path) || path;
}

module.exports = { summaryMarkdown, saveSummary, normaliseFolder, DEFAULT_FOLDER };
