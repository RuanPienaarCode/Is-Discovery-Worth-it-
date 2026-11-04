'use strict';
/* The Benefits page: what Discovery gives this person with their setup, which
   of those they say they actually use, and what that is worth to them.

   The statement (model.js buildStatement) already weighs each benefit:
   st.benefits[id] = { level, suggested, why, full, counted, available,
   reason, note }, in rands a year. This page only shows it and lets the
   person change a level. An answer the person gives is stored even when it
   equals the suggestion, so a confirmed "I use it" never flips when later
   statements suggest something else; "Use our suggestion" removes it again.

   Every node is built with dom.js el() and art.js drawMark (createElementNS);
   no innerHTML. CSS lives in src/css/benefits.css under .dc-ben. */

const { el } = require('./dom');
const { money } = require('./format');
const { drawMark } = require('./art');
const { FACE_VALUE } = require('./rates');
const { BENEFITS, GROUPS, levelOf, offerText } = require('./benefits');

/* The three answers, in the order they are shown. */
const LEVELS = [
  { value: 'full', label: 'I use it' },
  { value: 'half', label: 'Sometimes' },
  { value: 'none', label: 'Not for me' },
];

/* How you spend your Miles (settings.milesUse), for the "Spending your
   Miles" card: one line each. */
const MILES_USE = [
  { value: 'dday', label: 'On Ð-Day (the 15th of each month)' },
  { value: 'partners', label: 'At Discovery Miles partners' },
  { value: 'utilities', label: 'Electricity, data or airtime' },
  { value: 'none', label: 'I don\'t spend them' },
];

/* The plugin's own mark for each kind of benefit (src/art.js). */
const MARK_OF = {
  miles: 'card',
  milesPlus: 'spend',
  healthyFood: 'groceries',
  healthyCare: 'pharmacy',
  gym: 'gym',
  gameboard: 'exercise',
  appleWatch: 'watch',
  fuel: 'fuel',
  flights: 'flights',
  interest: 'savings',
};

const isLevel = v => v === 'full' || v === 'half' || v === 'none';
const amount = v => (Number.isFinite(v) && v > 0 ? v : 0);
/* what the statement suggests, read the way levelOf reads it */
const suggestedOf = b => (b && isLevel(b.suggested) ? b.suggested : 'full');

/* ── pure helpers (node-testable) ─────────────────────────────────────── */

/* st → { available: [entry], unavailable: [entry], full, counted, share }
   entry = { b (BENEFITS row), x (st.benefits[id]) }, in GROUPS order then
   BENEFITS order. full and counted are annual rands summed over the
   available benefits; share = counted / full (0 when full is 0). */
function benefitTotals(st) {
  const all = (st && st.benefits) || {};
  const rank = g => { const i = GROUPS.findIndex(x => x.id === g); return i < 0 ? GROUPS.length : i; };
  const rows = BENEFITS.map((b, i) => ({ b, i, x: all[b.id] }))
    .filter(r => r.x)
    .sort((p, q) => rank(p.b.group) - rank(q.b.group) || p.i - q.i)
    .map(({ b, x }) => ({ b, x }));
  const available = rows.filter(r => r.x.available !== false);
  const unavailable = rows.filter(r => r.x.available === false);
  const full = available.reduce((t, r) => t + amount(r.x.full), 0);
  const counted = available.reduce((t, r) => t + amount(r.x.counted), 0);
  return { available, unavailable, full, counted, share: full > 0 ? Math.min(1, counted / full) : 0 };
}

/* Write a chosen level into settings. An explicit answer is kept even when
   it equals the suggestion (the `suggested` argument is no longer read; it
   stays so callers do not change). Returns true when settings changed. */
function setLevel(s, id, level) {
  if (!s || !isLevel(level)) return false;
  if (!s.benefits || typeof s.benefits !== 'object') s.benefits = {};
  const before = s.benefits[id];
  s.benefits[id] = level;
  return before !== level;
}

/* Forget the stored answer, so the benefit follows the suggestion again.
   Returns true when settings changed. */
function clearLevel(s, id) {
  if (!s || !s.benefits || typeof s.benefits !== 'object' || !isLevel(s.benefits[id])) return false;
  delete s.benefits[id];
  return true;
}

/* is there a stored answer for this benefit? */
const hasAnswer = (s, id) => !!(s && s.benefits && isLevel(s.benefits[id]));

/* Amounts per year or per month. */
function perOf(period) {
  const monthly = period === 'monthly';
  return { per: n => (monthly ? n / 12 : n), label: monthly ? 'a month' : 'a year' };
}

/* "about 41%" of what is on offer: a fragment for under the big figure, or
   '' when nothing is measurable. */
function shareLine(full, counted) {
  if (!(full >= 0.5)) return '';
  if (counted >= full - 0.5) return 'The full value of what is on offer';
  if (!(counted >= 0.5)) return 'None of what is on offer yet';
  const p = Math.round((counted / full) * 100);
  return (p < 1 ? 'Less than 1%' : p > 99 ? 'Almost all' : `About ${p}%`) + ' of what is on offer';
}

/* ── one-liners: what a benefit is, in a few words ────────────────────── */

/* the first percentage in a sentence ("25%", "18,5%"), or '' */
const firstPct = text => { const m = /\d+(?:,\d+)?%/.exec(text || ''); return m ? m[0] : ''; };
const upTo = (p, rest, fallback) => (p ? `Up to ${p} ${rest}` : fallback);
const SHORT = {
  miles: () => 'Earned on every card payment',
  healthyFood: p => upTo(p, 'back on healthy food', 'Cash back on healthy food'),
  healthyCare: p => upTo(p, 'back at Clicks and Dis-Chem', 'Cash back at Clicks and Dis-Chem'),
  fuel: p => upTo(p, 'back on bp and Shell fuel', 'Cash back on bp and Shell fuel'),
  flights: p => upTo(p, 'off flights', 'Money off flights'),
  gameboard: () => 'Miles for your weekly exercise goals, won on the gameboard (the weekly game in the Discovery Bank app)',
  appleWatch: () => 'A watch you pay off by exercising',
  interest: p => upTo(p, 'extra interest', 'Extra interest on your money'),
  milesPlus: () => 'Miles buy more at partner shops',
  gym: p => upTo(p, 'off gym fees', 'Money off gym fees'),
};
/* benefit, settings → one short line (the gameboard's is longer: it says what
   the gameboard is; the card line wraps) */
function oneLiner(b, s) {
  const text = offerText(b, s) || b.offer || '';
  if (SHORT[b.id]) return SHORT[b.id](firstPct(text));
  const first = text.split('. ')[0].replace(/\.$/, '');
  return first.length > 38 ? first.slice(0, 37).replace(/\s+\S*$/, '') + '…' : first;
}

/* ── plain words for text that comes from benefits.js ─────────────────
   The offer, needs and reason sentences are written there; this puts the
   page's glossary on them (no "face value", no "Suite" as a question, the
   health checks said in words, "Ð-Day" with its date) without changing the
   figures in them. Text that already reads plainly passes through. */
const CENTS = `${Math.round(FACE_VALUE * 100)}c`;
function plainWords(text) {
  return String(text || '')
    .replace(/Partners take (\d+) Miles as (R[\s\u00a0\u2009]?\d+)/g, 'At partners, $1 Miles pay for $2 of shopping')
    .replace(/a Mile buys its face value/g, `a Mile is worth only ${CENTS}`)
    .replace(/no more than their face value/g, `no more than ${CENTS} a Mile would have bought`)
    .replace(/than their face value/g, `than ${CENTS} a Mile would have bought`)
    .replace(/Vitality Age and a Vitality Health Check/g, 'Vitality Age (an online health-age test) and a Vitality Health Check (a screening at a clinic or pharmacy)')
    .replace(/The Discovery Bank Suite with a credit card/g, 'The all-in-one package (account and credit card)')
    .replace(/Ð-Day \(the 15th\)/g, 'Ð-Day (the 15th of each month)');
}

/* a reason cut to its first idea: "It needs Vitality Health, which you do
   not have." → "It needs Vitality Health" */
function shortReason(reason) {
  return String(reason || '').split('. ')[0].split(', ')[0].replace(/\.$/, '');
}

/* One plain sentence for a card that counts R0, or '' when there is nothing
   to add. The model's own reason (st.benefits[id].zeroWhy) comes first; when
   it has none, your own "Not for me" or the suggestion from the statements
   is said. s = settings. */
function zeroReason(s, b, x, level) {
  const why = x && typeof x.zeroWhy === 'string' ? x.zeroWhy : '';
  if (why) return why;
  if (b.id === 'milesPlus') {
    return s && s.milesUse === 'none' ? 'You said you do not spend your Miles, so this counts as ' + money(0) + '.' : '';
  }
  if (level === 'none') {
    return hasAnswer(s, b.id)
      ? 'You said Not for me, so this counts as ' + money(0) + '.'
      : 'We suggest Not for me from your statements, so this counts as ' + money(0) + '.';
  }
  return '';
}

/* ── the page ─────────────────────────────────────────────────────────── */

let uid = 0;
/* what was left open, across redraws */
let offOpen = false;
const moreOpen = new Set();

/* A button that shows and hides `region` without a redraw, and says what it
   opens ("How this works"); its open state is kept by key in moreOpen. */
function moreToggle(parent, key, regionId, name) {
  const btn = el(parent, 'button', 'dc-ben-more');
  btn.type = 'button';
  btn.setAttribute('aria-controls', regionId);
  const region = el(null, 'div', 'dc-ben-more-body');
  region.id = regionId;
  const sync = () => {
    const open = moreOpen.has(key);
    btn.setAttribute('aria-expanded', String(open));
    btn.textContent = open ? 'Hide: ' + name : name;
    region.hidden = !open;
  };
  btn.addEventListener('click', e => {
    e.preventDefault();
    if (moreOpen.has(key)) moreOpen.delete(key); else moreOpen.add(key);
    sync();
  });
  sync();
  return region;
}

/* panel: the tab panel to draw into. s = plugin settings (mutable), st =
   buildStatement result, save = async () persisting settings, rerender =
   () redraw the page, period = 'annual' | 'monthly'. */
function renderBenefits(panel, ctx) {
  const { s, st, save, rerender, period } = ctx || {};
  const { per, label } = perOf(period);
  const run = ++uid;
  const root = el(panel, 'section', 'dc-ben');
  const t = benefitTotals(st);

  /* the page's own head (bottom-line.js) gives the title and its one line, so
     none is drawn here */
  if (!t.available.length) {
    el(root, 'p', 'dc-ben-empty', 'Your setup has none of these benefits. Change your products or Vitality on the Inputs tab.');
  } else {
    const figs = el(root, 'div', 'dc-ben-figs');
    const fig = (title, n, cls, sub) => {
      const f = el(figs, 'div', 'dc-ben-fig ' + cls + (amount(n) < 0.5 ? ' is-zero' : ''));
      el(f, 'p', 'dc-ben-fig-t', title);
      const v = el(f, 'p', 'dc-ben-fig-v');
      el(v, 'span', 'dc-ben-fig-n', money(per(n)));
      el(v, 'span', 'dc-ben-fig-per', ' ' + label);
      if (sub) el(f, 'p', 'dc-ben-fig-sub', sub);
    };
    fig('Available to you', t.full, 'is-offer', '');
    fig('You actually get', t.counted, 'is-got', shareLine(t.full, t.counted));

    for (const g of GROUPS) {
      const rows = t.available.filter(r => r.b.group === g.id);
      if (!rows.length) continue;
      const sec = el(root, 'section', 'dc-ben-group');
      el(sec, 'h3', 'dc-ben-group-h', g.label);
      const cards = el(sec, 'div', 'dc-ben-cards');
      for (const r of rows) card(cards, r);
    }
  }

  if (t.unavailable.length) offList(root, t.unavailable);
  return root;

  function card(parent, { b, x }) {
    const suggested = suggestedOf(x);
    const level = levelOf(s, b.id, x.suggested);
    const c = el(parent, 'article', 'dc-ben-card');
    c.setAttribute('data-ben-card', b.id);
    const head = el(c, 'div', 'dc-ben-card-head');
    if (MARK_OF[b.id]) drawMark(el(head, 'span', 'dc-ben-mark'), MARK_OF[b.id]);
    const titleId = `dc-ben-${run}-${b.id}`;
    const title = el(head, 'h4', 'dc-ben-card-h', b.label);
    title.id = titleId;
    /* Spending your Miles: the question is how, not how much; a Miles
       statement already says, so then there is nothing to ask */
    const milesHow = b.id === 'milesPlus';
    const fromStatement = milesHow && st && st.mileSource === 'statement';
    el(c, 'p', 'dc-ben-one', fromStatement ? 'Read from your Miles statement' : oneLiner(b, s));
    if (milesHow && !fromStatement) milesChoice(c, titleId);
    else if (!milesHow) levelChoice(c, b, x, titleId, suggested, level);

    const worth = el(c, 'div', 'dc-ben-worth');
    const big = (text, n, cls) => {
      const w = el(worth, 'div', 'dc-ben-amt ' + cls + (amount(n) < 0.5 ? ' is-zero' : ''));
      el(w, 'span', 'dc-ben-amt-l', text);
      const nn = el(w, 'span', 'dc-ben-amt-n');
      el(nn, 'span', 'dc-ben-amt-r', money(per(amount(n))));
      el(nn, 'span', 'dc-ben-amt-per', label);
    };
    big('If you use it fully', x.full, 'is-full');
    big('What we count', x.counted, 'is-got');

    /* why a card counts R0: your answer, or what H2's model found */
    if (amount(x.counted) < 0.5) {
      const why = zeroReason(s, b, x, level);
      if (why) el(c, 'p', 'dc-ben-zero', why);
    }

    const more = moreToggle(c, 'card:' + b.id, `dc-ben-${run}-${b.id}-more`, 'How this works');
    c.appendChild(more);
    el(more, 'p', 'dc-ben-offer', plainWords(offerText(b, s) || b.offer || ''));
    if (b.needs) el(more, 'p', 'dc-ben-small', 'What you need: ' + plainWords(b.needs));
    if (x.why) el(more, 'p', 'dc-ben-why', 'From your statements: ' + plainWords(x.why));
    if (x.note) el(more, 'p', 'dc-ben-small', 'Part of this does not count for you. ' + plainWords(x.note));
    if (b.measuredBy) el(more, 'p', 'dc-ben-small', 'How we find out: ' + plainWords(b.measuredBy));
  }

  /* I use it / Sometimes / Not for me, as real radios */
  function levelChoice(c, b, x, titleId, suggested, level) {
    const seg = el(c, 'div', 'dc-ben-seg');
    seg.setAttribute('role', 'radiogroup');
    seg.setAttribute('aria-labelledby', titleId);
    const name = `dc-ben-${run}-${b.id}-level`;
    const opts = [];
    for (const o of LEVELS) {
      const lab = el(seg, 'label', 'dc-ben-opt' + (o.value === level ? ' is-on' : ''));
      const input = el(lab, 'input', 'dc-ben-in');
      input.type = 'radio';
      input.name = name;
      input.value = o.value;
      input.checked = o.value === level;
      input.setAttribute('data-ben', b.id);
      const txt = el(lab, 'span', 'dc-ben-opt-t');
      el(txt, 'span', 'dc-ben-opt-l', o.label);
      if (o.value === suggested) el(txt, 'span', 'dc-ben-sug', 'we suggest this');
      opts.push({ lab, input });
      input.addEventListener('change', () => { if (input.checked) choose(b.id, o.value, opts, panel); });
      /* a tap on the answer already showing, with nothing stored yet, confirms
         it: it goes the way a change does, so it is kept and not left to the
         suggestion */
      input.addEventListener('click', () => {
        if (input.checked && o.value === level && !hasAnswer(s, b.id)) input.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }
    /* an answer of yours is kept; a way back to what the statements suggest */
    if (hasAnswer(s, b.id)) {
      const names = { full: 'I use it', half: 'Sometimes', none: 'Not for me' };
      const back = el(c, 'button', 'dc-ben-reset', `Use our suggestion: ${names[suggested]}`);
      back.type = 'button';
      back.setAttribute('data-ben-reset', b.id);
      back.setAttribute('aria-label', `Use our suggestion for ${b.label}: ${names[suggested]}`);
      back.addEventListener('click', e => { e.preventDefault(); reset(b.id, back, panel); });
    }
  }

  /* How do you spend your Miles? Four real radios; the answer is saved to
     settings.milesUse and the page drawn again. */
  function milesChoice(c, titleId) {
    const box = el(c, 'fieldset', 'dc-ben-how');
    el(box, 'legend', 'dc-ben-how-l', 'How do you spend your Miles?');
    const list = el(box, 'div', 'dc-ben-how-opts');
    const name = `dc-ben-${run}-miles-use`;
    const opts = [];
    for (const o of (ctx.milesUse || MILES_USE)) {
      const lab = el(list, 'label', 'dc-ben-how-opt' + (s.milesUse === o.value ? ' is-on' : ''));
      const input = el(lab, 'input', 'dc-ben-how-in');
      input.type = 'radio';
      input.name = name;
      input.value = o.value;
      input.checked = s.milesUse === o.value;
      input.setAttribute('data-ben', 'milesPlus');
      el(lab, 'span', 'dc-ben-how-t', o.label);
      opts.push({ lab, input });
      input.addEventListener('change', async () => {
        if (!input.checked) return;
        for (const q of opts) { q.lab.classList.toggle('is-on', q.input.checked); q.input.disabled = true; }
        const scope = panel && typeof panel.closest === 'function' ? panel.closest('.dc-page') : null;
        try {
          s.milesUse = o.value;
          if (typeof save === 'function') await save();
        } finally {
          for (const q of opts) q.input.disabled = false;
        }
        if (typeof rerender === 'function') await rerender();
        refocus(scope, 'milesPlus');
      });
    }
    return box;
  }

  function offList(parent, rows) {
    const d = el(parent, 'details', 'dc-ben-off');
    d.open = offOpen;
    d.addEventListener('toggle', () => { offOpen = d.open; });
    el(d, 'summary', 'dc-ben-off-sum', `Not available with your setup (${rows.length})`);
    const list = el(d, 'ul', 'dc-ben-off-list');
    for (const { b, x } of rows) {
      const li = el(list, 'li', 'dc-ben-off-item');
      el(li, 'p', 'dc-ben-off-h', b.label);
      if (x.reason) el(li, 'p', 'dc-ben-one', plainWords(shortReason(x.reason)));
      const more = moreToggle(li, 'off:' + b.id, `dc-ben-${run}-${b.id}-offmore`, 'Why it is not available');
      li.appendChild(more);
      if (b.offer) el(more, 'p', 'dc-ben-offer', plainWords(b.offer));
      if (x.reason) el(more, 'p', 'dc-ben-small', 'Why not: ' + plainWords(x.reason));
    }
  }

  /* back to the suggestion: forget the stored answer and redraw */
  async function reset(id, btn, from) {
    btn.disabled = true;
    const scope = (from && typeof from.closest === 'function' && from.closest('.dc-page')) || null;
    try {
      clearLevel(s, id);
      if (typeof save === 'function') await save();
    } finally {
      btn.disabled = false;
    }
    if (typeof rerender === 'function') await rerender();
    refocus(scope, id);
  }

  async function choose(id, value, opts, from) {
    /* the click and the change of one tap both land here: the second has nothing to do */
    if (s && s.benefits && s.benefits[id] === value) return;
    for (const o of opts) {
      o.lab.classList.toggle('is-on', o.input.checked);
      o.input.disabled = true;
    }
    /* where to look for the redrawn page: the page wrapper outlives a redraw */
    const scope = (from && typeof from.closest === 'function' && from.closest('.dc-page')) || null;
    try {
      setLevel(s, id, value);
      if (typeof save === 'function') await save();
    } finally {
      for (const o of opts) o.input.disabled = false;
    }
    if (typeof rerender === 'function') await rerender();
    refocus(scope, id);
  }
}

/* After a redraw, put focus back on the same benefit's chosen answer. The
   one retry is kept in refocusTimer so cancelRefocus() (view.js, on close)
   can stop it; it also does nothing once the page has gone. */
let refocusTimer = null;
function cancelRefocus() {
  if (refocusTimer !== null) { clearTimeout(refocusTimer); refocusTimer = null; }
}
function refocus(scope, id) {
  if (typeof document === 'undefined') return;
  const sel = `input[data-ben="${id}"]:checked`;
  const find = () => {
    const inScope = scope && scope.isConnected !== false ? scope.querySelector(sel) : null;
    return inScope || document.querySelector(sel);
  };
  const go = () => { const n = find(); if (n && document.activeElement !== n) n.focus(); return !!n; };
  cancelRefocus();
  if (!go()) refocusTimer = setTimeout(() => { refocusTimer = null; go(); }, 0);
}

module.exports = { renderBenefits, benefitTotals, setLevel, clearLevel, hasAnswer, shareLine, oneLiner, shortReason, plainWords, zeroReason, cancelRefocus, LEVELS, MARK_OF, MILES_USE };
