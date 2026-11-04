'use strict';
/* summary-note.js: the dated summary note, built from the real pipeline
   (measure → model → products → compare → verdicts → switch) over a
   made-up Sometown household, and saved through a fake Vault.
   Sentinel account names and descriptions must never reach the note. */
const assert = require('node:assert');

const { DEFAULT_SETTINGS } = require('../src/constants');
const { measure, trailingWindow } = require('../src/measure');
const { buildStatement } = require('../src/model');
const { buildProducts } = require('../src/products');
const { buildVerdicts } = require('../src/verdict');
const { buildSwitch } = require('../src/switch');
const { detectProducts, detectBanking, resolveProducts, resolveVitality } = require('../src/detect');
const { compareHealth, compareGap, compareInsure, compareLife, compareHome } = require('../src/compare');
const { marketAge } = require('../src/market');
const { money } = require('../src/format');
const { summaryMarkdown, saveSummary, normaliseFolder, DEFAULT_FOLDER } = require('../src/summary-note');

/* ── a made-up budget: eight months, with sentinels ─────────────────── */
const SENT_CARD = 'QQSENTCARD Sam 4471';
const SENT_CHEQUE = 'QQSENTCHQ Sometown 9902';
const SENT_OTHER = 'QQSENTOTHER Everyday 3318';
const SENT_DESC = 'QQSENTDESC';
const accounts = {
  [SENT_CARD]: { institution: 'Discovery Bank', type: 'credit_card' },
  [SENT_CHEQUE]: { institution: 'Discovery Bank', type: 'checking' },
  [SENT_OTHER]: { institution: 'Sometown Savings Bank', type: 'checking' },
};
const categories = { Food: 'food', Fuel: 'transport', 'Medical aid': 'insurance', 'Bank charges & fees': 'fees' };
const row = (date, description, amount, account, category) => ({ date, description, amount, account, category: category || '', excluded: false, note: '', split: '' });
const rows = [];
for (const ym of ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']) {
  rows.push(
    row(`${ym}-01`, `Monthly Account fee ${SENT_DESC}`, -430, SENT_CARD, 'Bank charges & fees'),
    row(`${ym}-01`, 'Vitality Money Premium', -98, SENT_CARD, 'Bank charges & fees'),
    row(`${ym}-02`, `DISC PREM 55-${SENT_DESC}-0091`, -6400, SENT_OTHER, 'Medical aid'),
    row(`${ym}-05`, `DISCINSURE ${SENT_DESC} 7781`, -1250, SENT_OTHER),
    row(`${ym}-08`, `WOOLWORTHS ${SENT_DESC} SOMETOWN`, -2400, SENT_CARD, 'Food'),
    row(`${ym}-11`, `CHECKERS ${SENT_DESC} MAIN RD`, -3100, SENT_CARD, 'Food'),
    row(`${ym}-14`, `BP ${SENT_DESC} PARK DRIVE`, -1300, SENT_CARD, 'Fuel'),
    row(`${ym}-18`, `CLICKS ${SENT_DESC}`, -450, SENT_CARD),
    row(`${ym}-20`, `VIRGIN ACTIVE ${SENT_DESC}`, -520, SENT_OTHER),
    row(`${ym}-25`, `Dynamic interest boost ${SENT_DESC}`, 35, SENT_CHEQUE),
  );
}
rows.push(row('2026-06-12', `DISC MEMB REFUND ${SENT_DESC}`, 800, SENT_OTHER));
const budget = { rows, accounts, categories };

/* ── the pipeline, as bottom-line.js render() runs it ───────────────── */
const NOW = new Date(2026, 10, 4);
function viewFor(settingsPatch, now) {
  const s = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  Object.assign(s, { onboarded: true, bankKind: 'suite', suite: 'Black', suiteAnswered: true, status: { money: 'Gold', health: 'Gold', drive: 'Blue' } }, settingsPatch || {});
  const win = trailingWindow(now, s.months, budget);
  const m = measure(budget.rows, budget.accounts, budget.categories, { ...win, notCardSpend: s.notCardSpend });
  const detected = detectProducts(budget);
  const banking = detectBanking(budget);
  const products = resolveProducts(s, detected);
  const vitality = resolveVitality(s, detected, banking);
  const st = buildStatement(m, s, null, { products, vitality });
  const pr = buildProducts(st, m, null, s, now, products);
  const P = id => pr.all.find(p => p.id === id);
  const cmp = { health: compareHealth(P('health'), s, undefined, { now }), gap: compareGap(P('gap'), s, undefined, { now }), insure: compareInsure(P('insure'), s), life: compareLife(P('life'), s), home: compareHome(s) };
  return {
    s, st, pr, products,
    verdicts: buildVerdicts(st, cmp, products, { now }),
    sw: buildSwitch(st, cmp, products, { now }),
  };
}

const view = viewFor({ products: { bank: true, health: true, gap: false, insure: true, life: false }, benefits: { gym: 'none', flights: 'half' } }, NOW);
assert.deepStrictEqual(view.pr.products.map(p => p.id), ['bank', 'health', 'insure'], 'fixture owns bank, health and insure');

const levers = [
  { id: 'status', title: 'Reach Gold on your bank score', line: '', gain: 1840.4, how: 'Earn Vitality points in the Discovery Bank app.', needs: null, kind: 'status' },
  { id: 'tiny', title: 'A lever too small to write', line: '', gain: 0.2, how: '', needs: null, kind: 'habit' },
];
const md = summaryMarkdown({ ...view, now: NOW, market: marketAge(NOW), levers, version: '0.1.3' });

/* frontmatter */
const fm = md.match(/^---\n([\s\S]*?)\n---\n/);
assert.ok(fm, 'starts with a frontmatter block');
const props = {};
for (const line of fm[1].split('\n')) {
  const kv = line.match(/^([a-z_]+): (.+)$/);
  assert.ok(kv, `frontmatter line is key: value — ${line}`);
  props[kv[1]] = kv[2].replace(/^"(.*)"$/, '$1');
}
assert.strictEqual(props.type, 'discovery-summary');
assert.strictEqual(props.date, '2026-11-04');
assert.strictEqual(props.version, '0.1.3');
assert.strictEqual(props.window_from, view.st.window.from);
assert.strictEqual(props.window_to, view.st.window.to);
assert.ok(/^\d{4}-\d{2}$/.test(props.window_from) && /^\d{4}-\d{2}$/.test(props.window_to));

/* heading, window line, closing line */
assert.ok(md.includes('\n# Is Discovery worth it? — 4 November 2026\n'), 'H1 with the long date');
assert.ok(/From your statements, \w{3} \d{4} to \w{3} \d{4} \(\d+ months\), made into a year\./.test(md), 'one line on the months covered');
assert.ok(md.trimEnd().endsWith('Made by the Is Discovery Worth It plugin. A calculator, not financial advice.'), 'closing line');

/* each owned product, with its verdict word and its own figures */
for (const p of view.pr.products) {
  const v = view.verdicts[p.id];
  assert.ok(v, `${p.id} has a verdict`);
  assert.ok(md.includes(`### ${p.name} — ${v.word}`), `${p.name} section with "${v.word}"`);
  assert.ok(md.includes(v.why), `${p.name} carries its reason`);
  if (v.tone !== 'unknown') assert.ok(md.includes(`You pay ${money(Math.abs(p.paid))} a year.`), `${p.name}: what you pay, from products.js`);
}
assert.ok(!md.includes('### Gap cover') && !md.includes('### Discovery Life'), 'products not owned are left out');

/* compare answer, levers, benefits, prices */
assert.ok(md.includes('## Stay with Discovery or move everything?'));
assert.ok(/(Staying looks cheaper|Moving looks cheaper|Both cost about the same|Not enough data to say)/.test(md), 'the Compare answer');
assert.ok(md.includes(`- **Reach Gold on your bank score**: ${money(1840)} a year more. Earn Vitality points in the Discovery Bank app.`), 'a lever: title + R X a year more');
assert.ok(!md.includes('A lever too small to write'), 'a lever under half a rand is left out');
assert.ok(/- I use it \(\d+\)/.test(md) && /- Sometimes \(\d+\): [^\n]*Flight discount/.test(md) && /- Not for me \(\d+\): [^\n]*Gym discount/.test(md), 'benefits by level, with the levels the person chose');
assert.ok(md.includes('Prices of other companies checked on 3 Nov 2026.'), 'the as-at date');

/* plain words: no minus signs, no +R, no "net", nothing undefined */
const body = md.slice(fm[0].length);
for (const line of body.split('\n')) {
  const prose = line.replace(/^(- |#+ )/, '');
  assert.ok(!/[−]|-\s?R\s?\d|\+\s?R\s?\d|\bminus\b|\bnet\b|real cost|\(\+\)|\(−\)/.test(prose), `plain words: ${line}`);
}
assert.ok(!/undefined|NaN|null|\[object/.test(md), 'no undefined/NaN/null/[object]');

/* privacy: no account names, no descriptions, no paths */
for (const secret of [SENT_CARD, SENT_CHEQUE, SENT_OTHER, SENT_DESC, 'QQSENT', '4471', '9902', '3318', '7781', '0091', 'WOOLWORTHS', 'CHECKERS', 'DISC PREM', 'DISCINSURE', '.md', 'Transactions/']) {
  assert.ok(!md.includes(secret), `never in the note: ${secret}`);
}

/* home contents sit under Insure: "Not insured", amount in positive words */
const homeView = viewFor({ products: { bank: true, health: true, gap: false, insure: true, life: false }, home: { monthly: 0, contents: 250000 } }, NOW);
assert.strictEqual(homeView.verdicts.home.word, 'Not insured');
const homeMd = summaryMarkdown({ ...homeView, now: NOW, market: marketAge(NOW) });
assert.ok(homeMd.indexOf('### Home contents — Not insured') > homeMd.indexOf('### Discovery Insure'), 'home contents after Insure');
assert.ok(/About R\s\d[\d\s]* a year would insure them\./.test(homeMd), 'home: positive amount in words');
assert.ok(!/[−]/.test(homeMd), 'no minus sign');

/* stale prices: the warning */
const later = new Date(2027, 1, 10);
const staleMd = summaryMarkdown({ ...view, now: later, market: marketAge(later), version: '0.1.3' });
assert.ok(staleMd.includes('These prices may be out of date: we last checked them on 3 Nov 2026.'), 'stale warning');
assert.ok(!staleMd.includes('## Ways to get more'), 'no levers section without levers');

/* a thin import: "Not enough data" carries no figures */
const thinBudget = rows.filter(r => r.date >= '2026-09');
const thinView = (() => {
  const keep = budget.rows;
  budget.rows = thinBudget;
  try { return viewFor({ products: { bank: true, health: true, gap: false, insure: true, life: false } }, NOW); } finally { budget.rows = keep; }
})();
assert.strictEqual(thinView.verdicts.bank.word, 'Not enough data', 'two months: the bank verdict is Not enough data');
const thinMd = summaryMarkdown({ ...thinView, now: NOW, market: marketAge(NOW) });
const bankPart = thinMd.split('### Discovery Bank — Not enough data')[1].split('###')[0];
assert.ok(!/R\s?\d/.test(bankPart), 'no figure under Not enough data');
assert.ok(thinMd.includes('Not enough data to say.'), 'Compare says not enough data');
assert.ok(!/^version:/m.test(thinMd), 'no version line when none is passed');

/* missing pieces never print undefined */
const bare = summaryMarkdown({ now: '2026-11-04' });
assert.ok(bare.startsWith('---\ntype: discovery-summary\ndate: 2026-11-04\n---'), 'bare frontmatter');
assert.ok(!/undefined|NaN/.test(bare));

/* ── saveSummary through a fake Vault ─────────────────────────────── */
function fakeVault(paths) {
  const files = new Map();
  for (const p of paths || []) files.set(p, p.endsWith('.md') ? { path: p } : { path: p, children: [] });
  const calls = [];
  return {
    files, calls,
    getAbstractFileByPath: p => files.get(p) || null,
    createFolder: async p => { calls.push(['folder', p]); files.set(p, { path: p, children: [] }); },
    create: async (p, text) => {
      if (files.has(p)) throw new Error('exists: ' + p);
      calls.push(['create', p]); files.set(p, { path: p, text }); return files.get(p);
    },
  };
}

assert.strictEqual(normaliseFolder(''), DEFAULT_FOLDER);
assert.strictEqual(normaliseFolder('  /Money/Discovery/ '), 'Money/Discovery');
assert.strictEqual(normaliseFolder('a//b\\c'), 'a/b/c');
assert.strictEqual(normaliseFolder('../x/./y'), 'x/y');
assert.strictEqual(normaliseFolder(undefined), 'Is Discovery Worth It');

(async () => {
  const v = fakeVault();
  const p1 = await saveSummary(v, undefined, NOW, md);
  assert.strictEqual(p1, 'Is Discovery Worth It/Summary 2026-11-04.md');
  assert.deepStrictEqual(v.calls[0], ['folder', 'Is Discovery Worth It'], 'creates the folder');
  assert.strictEqual(v.files.get(p1).text, md);

  const p2 = await saveSummary(v, '/Is Discovery Worth It/', NOW, 'second');
  assert.strictEqual(p2, 'Is Discovery Worth It/Summary 2026-11-04 2.md', 'never overwrites: " 2"');
  const p3 = await saveSummary(v, 'Is Discovery Worth It', NOW, 'third');
  assert.strictEqual(p3, 'Is Discovery Worth It/Summary 2026-11-04 3.md', '" 3"');
  assert.strictEqual(v.files.get(p1).text, md, 'the first note is untouched');
  assert.strictEqual(v.calls.filter(c => c[0] === 'folder').length, 1, 'an existing folder is not made again');

  const nested = fakeVault(['Money']);
  const p4 = await saveSummary(nested, 'Money/Discovery/Summaries', '2026-12-01', 'x');
  assert.strictEqual(p4, 'Money/Discovery/Summaries/Summary 2026-12-01.md');
  assert.deepStrictEqual(nested.calls.filter(c => c[0] === 'folder').map(c => c[1]), ['Money/Discovery', 'Money/Discovery/Summaries'], 'each missing level, once');

  const clash = fakeVault(['Notes.md']);
  await assert.rejects(() => saveSummary(clash, 'Notes.md', NOW, 'x'), /is a note, not a folder/);

  console.log('summary-note OK');
})().catch(e => { console.error(e); process.exit(1); });
