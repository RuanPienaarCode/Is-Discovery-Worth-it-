'use strict';
/* The Latest tab: Discovery's current offers (src/offers.js buildLatest),
   short. Three groups in view — On now, Coming up, Always on — and three
   folded away: Not for us, Used or hidden, Ended. Each card is the when,
   a title, one line and who can use it; the steps, the partners, each
   person's answer and the source wait behind "Details".

   renderLatest(panel, ctx) with ctx = {
     latest     buildLatest(...) result, or null when no offers were read
     folder     the offers folder ('' = not set)
     inbox      number of files waiting in <folder>/Inbox, or null
     example    true for the made-up household
     people     how many others are typed under Inputs
     openNote(path), setState(path, state), onSetup() }
   Words state facts about the offer and the household; they never tell
   anyone to take up, keep or leave a product (tests/no-advice.test.cjs).
   Every node is built with dom.js el(); no innerHTML. CSS: src/css/offers.css. */

const { el, icon } = require('./dom');

const AREA = { bank: 'Bank', vitality: 'Vitality', health: 'Health', insure: 'Insure', travel: 'Travel', gap: 'Gap cover', life: 'Life', other: 'Discovery' };
const VERDICT = { yes: 'Can use it', check: 'Not sure', no: 'Not on this' };
const GROUPS = [
  { id: 'on', title: 'On now', icon: 'clock' },
  { id: 'soon', title: 'Coming up', icon: 'calendar' },
  { id: 'always', title: 'Always on', icon: 'repeat' },
];
const FOLDED = [
  { id: 'notForUs', title: 'Not for us', icon: 'circle-slash' },
  { id: 'put', title: 'Used or hidden', icon: 'archive' },
  { id: 'ended', title: 'Ended', icon: 'history' },
];

/* which cards and folded groups are open: kept across re-renders */
const OPEN = new Set();
let seq = 0;

function toggle(parent, key, label, cls) {
  const id = 'dc-of-body-' + (++seq);
  const btn = el(parent, 'button', 'dc-of-more' + (cls ? ' ' + cls : ''));
  btn.type = 'button';
  btn.setAttribute('aria-controls', id);
  const t = el(btn, 'span', 'dc-of-more-t', label);
  const chev = el(btn, 'span', 'dc-of-chev');
  const body = el(parent, 'div', 'dc-of-body');
  body.id = id;
  const sync = () => {
    const on = OPEN.has(key);
    btn.setAttribute('aria-expanded', String(on));
    while (chev.firstChild) chev.removeChild(chev.firstChild);
    icon(chev, on ? 'chevron-up' : 'chevron-down');
    body.hidden = !on;
  };
  btn.addEventListener('click', e => {
    e.preventDefault();
    if (OPEN.has(key)) OPEN.delete(key); else OPEN.add(key);
    sync();
  });
  sync();
  return { btn, body, label: t };
}

function actionButton(parent, label, ic, onClick) {
  const b = el(parent, 'button', 'dc-of-act');
  b.type = 'button';
  icon(b, ic);
  el(b, 'span', null, label);
  b.addEventListener('click', e => { e.preventDefault(); onClick(); });
  return b;
}

/* only a web address opens; anything else is shown as text */
const webUrl = u => (/^https?:\/\/[^\s]+$/i.test(u || '') ? u : '');

function details(body, item, ctx) {
  const o = item.offer;
  if (o.condition) {
    const p = el(body, 'p', 'dc-of-cond');
    el(p, 'strong', null, 'The catch: ');
    el(p, 'span', null, o.condition);
  }
  if (o.how.length) {
    el(body, 'h4', 'dc-of-h4', 'How it works');
    const ol = el(body, 'ol', 'dc-of-how');
    for (const step of o.how) el(ol, 'li', null, step);
  }
  if (o.partners.length) {
    el(body, 'h4', 'dc-of-h4', o.partners.length > 1 ? 'Partners' : 'Partner');
    el(body, 'p', 'dc-of-partners', o.partners.join(' · '));
  }
  el(body, 'h4', 'dc-of-h4', 'Who');
  const ul = el(body, 'ul', 'dc-of-who-list');
  for (const w of item.who) {
    const li = el(ul, 'li', 'is-' + w.verdict);
    el(li, 'span', 'dc-of-who-name', w.name);
    let why = VERDICT[w.verdict];
    if (w.missing.length) why = 'Needs ' + w.missing.join(', ');
    else if (w.unknown.length) why = 'Not known here: ' + w.unknown.join(', ');
    el(li, 'span', 'dc-of-who-why', why);
  }
  if (o.problems.length) {
    const pr = el(body, 'div', 'dc-of-problem');
    icon(pr, 'triangle-alert');
    el(pr, 'span', null, 'In the note: ' + o.problems.join('; '));
  }
  const src = el(body, 'p', 'dc-of-source');
  el(src, 'span', null, o.source ? 'From: ' + o.source : 'No source in the note');
  if (o.added) el(src, 'span', 'dc-of-added', ' · added ' + o.added);
  const url = webUrl(o.url);
  const acts = el(body, 'div', 'dc-of-acts');
  if (url) {
    const a = el(acts, 'a', 'dc-of-act dc-of-link');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    icon(a, 'external-link');
    el(a, 'span', null, 'Discovery\'s page');
  }
  if (!ctx.example && o.path) actionButton(acts, 'Open note', 'file-text', () => ctx.openNote(o.path));
  if (!ctx.example && o.path) {
    if (o.state) actionButton(acts, 'Show again', 'undo-2', () => ctx.setState(o.path, ''));
    else {
      actionButton(acts, 'Used it', 'check', () => ctx.setState(o.path, 'used'));
      actionButton(acts, 'Hide', 'eye-off', () => ctx.setState(o.path, 'hidden'));
    }
  }
}

function offerCard(parent, item, ctx, compact) {
  const o = item.offer;
  const urgent = item.timing.phase === 'on' && item.timing.daysLeft <= 3;
  const c = el(parent, 'article', 'dc-of-card is-' + o.area + ' fit-' + item.fit + (compact ? ' is-compact' : ''));
  const top = el(c, 'div', 'dc-of-top');
  el(top, 'span', 'dc-of-area', AREA[o.area] || AREA.other);
  el(top, 'span', 'dc-of-when' + (urgent ? ' is-urgent' : ''), o.state === 'used' ? 'Used' : o.state === 'hidden' ? 'Hidden' : item.when);
  el(c, 'h3', 'dc-of-title', o.title);
  if (compact && item.reason) el(c, 'p', 'dc-of-line', item.reason);
  else if (o.benefit) el(c, 'p', 'dc-of-line', o.benefit);
  if (!compact) {
    const who = el(c, 'p', 'dc-of-who' + (item.fit === 'check' ? ' is-check' : ''));
    icon(who, item.fit === 'check' ? 'circle-help' : 'users');
    el(who, 'span', null, item.whoLine ? item.whoLine : 'Not sure who: Details says why');
  }
  const t = toggle(c, 'card:' + (o.path || o.title), 'Details');
  details(t.body, item, ctx);
  return c;
}

function renderEmpty(panel, ctx) {
  const c = el(panel, 'div', 'dc-of-empty');
  icon(el(c, 'span', 'dc-of-empty-mark'), 'inbox');
  el(c, 'h2', 'dc-of-empty-title', 'No offers yet');
  el(c, 'p', 'dc-of-empty-text', ctx.folder
    ? `Offer notes go in "${ctx.folder}", one note per offer. Emails and PDFs waiting to be read go in "${ctx.folder}/Inbox".`
    : 'Set a folder for offer notes under Inputs, then add one note per offer.');
  const t = toggle(c, 'empty:how', 'How the notes are made');
  el(t.body, 'p', null, 'An AI agent (Claude Code, say) reads Discovery\'s emails, the Latest news pages and posts you paste in, and writes one note per offer with the frontmatter this tab reads: discovery: offer, title, benefit, area, starts, ends, requires, condition, how, source. The plugin itself only reads notes, so it works on a phone too.');
  el(t.body, 'p', null, 'The whole format is in docs/offer-notes.html in the plugin\'s repository.');
  const b = el(c, 'button', 'dc-of-act');
  b.type = 'button';
  icon(b, 'sliders-horizontal');
  el(b, 'span', null, 'Offers folder and household');
  b.addEventListener('click', e => { e.preventDefault(); ctx.onSetup(); });
}

function renderLatest(panel, ctx) {
  const c = ctx || {};
  const L = c.latest;
  const root = el(panel, 'div', 'dc-of');
  if (c.example) {
    const h = el(root, 'div', 'dc-of-note');
    icon(h, 'info');
    el(h, 'span', null, 'Made-up offers for the example household.');
  }
  if (Number(c.inbox) > 0) {
    const h = el(root, 'div', 'dc-of-note is-inbox');
    icon(h, 'inbox');
    el(h, 'span', null, `${c.inbox} ${c.inbox === 1 ? 'file is' : 'files are'} in the Inbox, not read into notes yet.`);
  }
  const total = L ? L.on.length + L.soon.length + L.always.length + L.notForUs.length + L.put.length + L.ended.length : 0;
  if (!total) { renderEmpty(root, c); return root; }

  const strip = el(root, 'div', 'dc-of-strip');
  const stat = (n, label, cls) => { const s = el(strip, 'span', 'dc-of-stat' + (cls ? ' ' + cls : '')); el(s, 'strong', null, String(n)); el(s, 'span', null, label); };
  stat(L.counts.on, 'on now');
  if (L.counts.endingThisWeek) stat(L.counts.endingThisWeek, 'end this week', 'is-urgent');
  stat(L.counts.soon, 'coming up');
  stat(L.counts.always, 'always on');
  if (!c.people && !c.example) {
    const p = el(root, 'p', 'dc-of-hint');
    el(p, 'span', null, 'Only your own accounts are checked. ');
    const b = el(p, 'button', 'dc-of-inline');
    b.type = 'button';
    b.textContent = 'Add the others at home';
    b.addEventListener('click', e => { e.preventDefault(); c.onSetup(); });
  }

  for (const g of GROUPS) {
    const items = L[g.id];
    if (!items.length) continue;
    const sec = el(root, 'section', 'dc-of-group is-' + g.id);
    const h = el(sec, 'h2', 'dc-of-h');
    icon(h, g.icon);
    el(h, 'span', null, g.title);
    el(h, 'span', 'dc-of-count', String(items.length));
    const grid = el(sec, 'div', 'dc-of-grid');
    for (const it of items) offerCard(grid, it, c, false);
  }
  const folded = FOLDED.filter(g => L[g.id].length);
  if (folded.length) {
    const box = el(root, 'div', 'dc-of-folded');
    for (const g of folded) {
      const sec = el(box, 'section', 'dc-of-fold is-' + g.id);
      const t = toggle(sec, 'fold:' + g.id, `${g.title} (${L[g.id].length})`, 'dc-of-fold-btn');
      const grid = el(t.body, 'div', 'dc-of-grid');
      for (const it of (g.id === 'ended' ? L[g.id].slice(0, 12) : L[g.id])) offerCard(grid, it, c, true);
    }
  }
  return root;
}

module.exports = { renderLatest, AREA };
