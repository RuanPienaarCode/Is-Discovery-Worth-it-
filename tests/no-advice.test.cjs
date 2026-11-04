'use strict';
/* No financial advice, ever. The plugin shows what the CALCULATION says
   from your own statements and published prices; it never tells you to
   buy, switch, move, keep, upgrade, downgrade or cancel a financial
   product (the FAIS Act's "advice": a recommendation, guidance or
   proposal about buying, varying, replacing or ending one). Advice audit,
   4 Nov 2026: Pienaar Family/Finances/Discovery in Ruan's vault.

   Two nets:
   1. Every string the pipeline produces for made-up households (verdicts
      for every tone, Compare, the competitors, the levers, the dates, the
      summary note) is scanned for directive phrases, and verdict words,
      verdict sentences, lever titles and lever "how" lines may not start
      with an imperative about a product.
   2. Every string literal in src/ is scanned for the same phrases, so a
      sentence no fixture reaches cannot bring them back either.
   And the not-affiliated notice must be wherever a verdict can be read. */
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { DEFAULT_SETTINGS } = require('../src/constants');
const { measure, trailingWindow } = require('../src/measure');
const { buildStatement } = require('../src/model');
const { buildProducts } = require('../src/products');
const { buildVerdicts, verdictLead } = require('../src/verdict');
const { buildSwitch, buildRivals, ASSUMED_NOTE } = require('../src/switch');
const { detectProducts, detectBanking, resolveProducts, resolveVitality } = require('../src/detect');
const { compareHealth, compareGap, compareInsure, compareLife, compareHome } = require('../src/compare');
const { marketAge } = require('../src/market');
const { summaryMarkdown } = require('../src/summary-note');
const { computeLevers } = require('../src/levers');
const { NOTICE_LINE, noticeMore } = require('../src/notice');

/* ── what counts as advice ──────────────────────────────────────────── */
const DIRECTIVE = [
  /\byou should\b/i, /\bswitch to\b/i, /\bcancel\b/i, /\bdowngrade to\b/i, /\bupgrade to\b/i,
  /\bmove to\b/i, /\bget rid of\b/i, /\boverpaying\b/i, /\bworth keeping\b/i, /\bcould save\b/i,
  /\bget quotes?\b/i, /\bask\b[^.]*\bquote\b/i, /\bbefore you (switch|move|decide|change|leave)\b/i,
  /\bswitching pays\b/i, /\bwins\b/i, /\bbeat(s)? discovery\b/i, /\bmay suit you\b/i,
  /\bwhat your family needs\b/i, /\byou only need\b/i, /\bask discovery\b/i,
];
/* a sentence that opens with one of these tells you to act */
const IMPERATIVE = /^(switch|move|cancel|get|ask|buy|keep|leave|drop|downgrade|upgrade|compare|check|consider|do|go|pay|use|spend|reach|work|add|swap|insure|stay|join|sign|take|choose a cheaper)\b/i;
/* the verdict words a pill may show: results, not instructions */
const WORDS = new Set(['Comes out ahead', 'Likely ahead', 'About the same', 'Lower price elsewhere', 'No price to compare', 'Not insured', 'Not enough data', 'Ended']);

const sentences = s => String(s).split(/[.?!]\s+/).map(x => x.trim()).filter(Boolean);
const failures = [];
function scan(where, s) {
  if (typeof s !== 'string' || !s.trim()) return;
  for (const re of DIRECTIVE) if (re.test(s)) failures.push(`${where}: ${re} in "${s}"`);
}
function noImperative(where, s) {
  if (typeof s !== 'string') return;
  for (const x of sentences(s)) if (IMPERATIVE.test(x)) failures.push(`${where}: starts with an imperative: "${x}"`);
}
/* every string anywhere inside a value */
function walk(where, v, seen) {
  const s = seen || new Set();
  if (typeof v === 'string') return scan(where, v);
  if (!v || typeof v !== 'object' || s.has(v)) return;
  s.add(v);
  for (const k of Object.keys(v)) walk(`${where}.${k}`, v[k], s);
}
function checkVerdicts(where, verdicts) {
  for (const [id, v] of Object.entries(verdicts || {})) {
    if (!v) continue;
    assert.ok(WORDS.has(v.word), `${where}.${id}: verdict word "${v.word}" is not one of the result words`);
    noImperative(`${where}.${id}.word`, v.word);
    noImperative(`${where}.${id}.why`, v.why);
    const lead = verdictLead(v, 'a year');
    scan(`${where}.${id}.lead`, lead);
    noImperative(`${where}.${id}.lead`, lead);
  }
  walk(where, verdicts);
}

/* ── 1a. every verdict tone, from small made-up comparisons ─────────── */
const cmp = (rows, extra) => ({ current: { annual: 12000, monthly: 1000 }, rows, ...extra });
const row = (gain, extra) => ({ name: 'Option', scheme: 'Scheme', plan: 'Plan', provider: 'Provider', gainIfSwitch: gain, monthly: gain === null ? null : 900, ...extra });
const life = low => ({ current: { monthly: 800, annual: 9600 }, lifeOnly: { low, high: low * 1.5 }, rows: [row(null, { breakEven: 800 })] });
const tones = new Set();
const cases = [
  [{ verdict: 'stay', chosen: { name: 'Other Bank', gainIfSwitch: -5000 }, net: 200 }, {}],
  [{ verdict: 'switch', chosen: { name: 'Other Bank', gainIfSwitch: 2000 } }, {}],
  [{ verdict: 'switch', chosen: { name: 'Other Bank', gainIfSwitch: 100 } }, {}],
  [null, { health: cmp([row(-300)], { vitalityNet: 900 }) }],
  [null, { health: cmp([row(5000, { likeForLike: true, unsure: ['hospital'] })], { needs: [{ id: 'hospital', label: 'Your hospital' }], vitalityNet: -400 }) }],
  [null, { health: cmp([row(5000, { quoted: true })]) }],
  [null, { health: cmp([row(null, { breakEven: 2000 })], { stale: true }) }],
  [null, { health: cmp([row(3000)], { vitalityKnown: false }) }],
  [null, { gap: cmp([row(1500)]) }],
  [null, { gap: cmp([row(1500, { quoted: true })]) }],
  [null, { gap: cmp([row(null, { breakEven: 200 })], { pricedForAge: false }) }],
  [null, { gap: cmp([row(null, { breakEven: 200 })], { stale: true }) }],
  [null, { insure: cmp([row(null, { breakEven: 1300 })]) }],
  [null, { insure: cmp([row(900, { quoted: true })]) }],
  [null, { insure: cmp([row(null)]) }],
  [null, { life: life(250) }],
  [null, { life: life(100) }],
  [null, { life: { ...life(100), rows: [row(-500, { quoted: true })] } }],
  [null, { home: { current: { monthly: 0, annual: 0 }, rows: [{ name: 'A', monthly: 300 }] } }],
  [null, { home: { current: { monthly: 0 }, rows: [{ name: 'A', monthly: null }] } }],
  [null, { home: cmp([row(1000)]) }],
  [null, { home: cmp([row(1000, { unconfirmed: true })]) }],
];
cases.forEach(([st, c], i) => {
  const v = buildVerdicts(st, c);
  for (const x of Object.values(v)) if (x) tones.add(x.tone);
  checkVerdicts(`case ${i}`, v);
});
for (const t of ['good', 'check', 'over', 'quote', 'none']) assert.ok(tones.has(t), `the fixtures reach the "${t}" tone`);
walk('ASSUMED_NOTE', ASSUMED_NOTE);

/* ── 1b. the whole pipeline over a made-up Sometown household ───────── */
const accounts = {
  'Sam Card 0001': { institution: 'Discovery Bank', type: 'credit_card' },
  'Sam Everyday 0002': { institution: 'Discovery Bank', type: 'checking' },
  'Other Everyday 0003': { institution: 'Sometown Savings Bank', type: 'checking' },
};
const categories = { Food: 'food', Fuel: 'transport', 'Medical aid': 'insurance', 'Bank charges & fees': 'fees' };
const r = (date, description, amount, account, category) => ({ date, description, amount, account, category: category || '', excluded: false, note: '', split: '' });
const rows = [];
for (const ym of ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']) {
  rows.push(
    r(`${ym}-01`, 'Monthly Account fee', -430, 'Sam Card 0001', 'Bank charges & fees'),
    r(`${ym}-01`, 'Vitality Money Premium', -98, 'Sam Card 0001', 'Bank charges & fees'),
    r(`${ym}-02`, 'DISC PREM 00-000-0000', -6400, 'Other Everyday 0003', 'Medical aid'),
    r(`${ym}-03`, 'DISC GAP 00-000-0000', -310, 'Other Everyday 0003'),
    r(`${ym}-05`, 'DISCINSURE 0000', -1250, 'Other Everyday 0003'),
    r(`${ym}-06`, 'DISCLIFE 0000', -650, 'Other Everyday 0003'),
    r(`${ym}-08`, 'WOOLWORTHS SOMETOWN', -2400, 'Sam Card 0001', 'Food'),
    r(`${ym}-11`, 'CHECKERS SOMETOWN', -3100, 'Sam Card 0001', 'Food'),
    r(`${ym}-14`, 'BP SOMETOWN', -1300, 'Other Everyday 0003', 'Fuel'),
    r(`${ym}-18`, 'CLICKS SOMETOWN', -450, 'Sam Card 0001'),
    r(`${ym}-20`, 'VIRGIN ACTIVE SOMETOWN', -520, 'Other Everyday 0003'),
    r(`${ym}-25`, 'Dynamic interest boost', 35, 'Sam Everyday 0002'),
  );
}
const budget = { rows, accounts, categories };
const NOW = new Date(2026, 10, 4);

function viewFor(patch) {
  const s = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  Object.assign(s, { onboarded: true, bankKind: 'suite', suite: 'Black', suiteAnswered: true, status: { money: 'Blue', health: 'Bronze', drive: 'Blue' } }, patch || {});
  const win = trailingWindow(NOW, s.months, budget);
  const m = measure(budget.rows, budget.accounts, budget.categories, { ...win, notCardSpend: s.notCardSpend });
  const detected = detectProducts(budget);
  const banking = detectBanking(budget);
  const products = resolveProducts(s, detected);
  const vitality = resolveVitality(s, detected, banking);
  const st = buildStatement(m, s, null, { products, vitality });
  const pr = buildProducts(st, m, null, s, NOW, products);
  const P = id => pr.all.find(p => p.id === id);
  const c = { health: compareHealth(P('health'), s, undefined, { now: NOW }), gap: compareGap(P('gap'), s, undefined, { now: NOW }), insure: compareInsure(P('insure'), s), life: compareLife(P('life'), s), home: compareHome(s) };
  const verdicts = buildVerdicts(st, c, products, { now: NOW });
  const sw = buildSwitch(st, c, products, { now: NOW });
  const rivals = buildRivals(st, c, products, { now: NOW });
  const levers = computeLevers({ m, ms: null, s, st, products, vitality, buildStatement });
  const md = summaryMarkdown({ st, pr, verdicts, sw, s, now: NOW, market: marketAge(NOW), levers, version: '0.0.0' });
  return { st, pr, verdicts, sw, rivals, levers, md };
}

const ALL = { bank: true, health: true, gap: true, insure: true, life: true };
const households = {
  everything: { products: ALL },
  older: { products: ALL, members: { adults: 2, children: 1, oldestAge: 62 } },
  quotes: { products: ALL, quotes: { 'insure.outsurance': 300, 'life.brightrock': 200, 'gap.turnberryLaunch': 50 }, home: { monthly: 0, contents: 250000 } },
  card: { products: ALL, bankKind: 'card', rates: { virtualSharePct: 40 } },
  healthOnly: { products: { bank: false, health: true, gap: false, insure: false, life: false } },
};
let leverCount = 0;
for (const [name, patch] of Object.entries(households)) {
  const v = viewFor(patch);
  checkVerdicts(`${name}.verdicts`, v.verdicts);
  walk(`${name}.switch`, v.sw);
  walk(`${name}.rivals`, v.rivals);
  walk(`${name}.dates`, v.pr.dates);
  walk(`${name}.lines`, v.st.lines);
  walk(`${name}.confidence`, v.st.confidence);
  for (const l of v.levers) {
    leverCount++;
    walk(`${name}.lever.${l.id}`, l);
    noImperative(`${name}.lever.${l.id}.title`, l.title);
    noImperative(`${name}.lever.${l.id}.how`, l.how);
  }
  for (const line of v.md.split('\n')) scan(`${name}.summary`, line);
  assert.ok(v.md.includes(NOTICE_LINE), `${name}: the summary note carries the not-affiliated notice`);
  assert.ok(/licensed financial adviser/.test(v.md), `${name}: the summary note names a licensed financial adviser`);
}
assert.ok(leverCount > 0, 'the households reach at least one lever');

/* ── 2. every string literal in src/ ────────────────────────────────── */
const SRC = path.join(__dirname, '..', 'src');
const literal = /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g;
for (const f of fs.readdirSync(SRC).filter(x => x.endsWith('.js'))) {
  const code = fs.readFileSync(path.join(SRC, f), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  for (const lit of code.match(literal) || []) {
    const text = lit.slice(1, -1);
    if (!/\s/.test(text)) continue; // identifiers, keys, class names
    scan(`src/${f}`, text);
  }
  /* the Compare cards name situations, not orders */
  assert.ok(!/(['`])(Stay with Discovery|Move everything)\1/.test(code), `src/${f}: "Stay with Discovery" / "Move everything" as a label reads as an order`);
}

/* ── the notice wherever a verdict can be read ─────────────────────── */
assert.ok(/not financial advice/i.test(NOTICE_LINE) && /not affiliated/i.test(NOTICE_LINE));
assert.ok(noticeMore('2026-11-03').some(t => /licensed financial adviser/.test(t)), 'the disclaimer names a licensed financial adviser');
assert.ok(noticeMore('2026-11-03').some(t => /your statements/.test(t) && /published prices/.test(t)), 'the disclaimer states the basis');
const bl = fs.readFileSync(path.join(SRC, 'bottom-line.js'), 'utf8');
const foot = bl.slice(bl.indexOf('function renderFoot'), bl.indexOf('function renderFoot') + 900);
assert.ok(/NOTICE_LINE/.test(foot) && /noticeMore/.test(foot), 'the footer on every tab carries the full notice and its disclaimer');
const onb = fs.readFileSync(path.join(SRC, 'onboarding.js'), 'utf8');
assert.ok(/NOTICE_LINE/.test(onb), 'the onboarding end screen carries the notice');

if (failures.length) {
  console.error(failures.join('\n'));
  assert.fail(`${failures.length} advice-shaped string(s)`);
}
console.log(`no-advice: ${tones.size} verdict tones, ${Object.keys(households).length} households, ${leverCount} levers, src/ literals — clean`);
