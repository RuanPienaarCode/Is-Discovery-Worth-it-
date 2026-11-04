'use strict';
/* "How to get more out of Discovery": one card per lever (src/levers.js
   computeLevers). Each card is a big title, one line and the figure ("R 900
   a year more"); what to do and what it needs wait behind a "What to do"
   button. With no levers, one line says so.

   renderLevers(panel, ctx) with ctx = { s, period ('annual'|'monthly'),
   money, per, save, rerender, now, levers } and, optionally:
     limit    show only the first `limit` levers (the Overview's top 3)
     onAll    with limit: a button "All ways to get more" when there are
              more levers than shown; onAll() is called when it is pressed
     heading  false to leave the heading out (the page draws its own), or
              other heading text
   Every node is built with dom.js el(); no innerHTML. CSS lives in
   src/css/levers.css under .dc-lev. */

const { el, icon } = require('./dom');
const { money: formatMoney } = require('./format');

const HEADING = 'How to get more out of Discovery';
const NONE = 'You are already getting the most from your setup.';

/* which levers' "What to do" is open, by lever id: kept across re-renders */
const OPEN = new Set();

/* lever, ctx → { amount: 'R 900', label: 'a year more' } for the figure */
function figureOf(lever, ctx) {
  const c = ctx || {};
  const monthly = c.period === 'monthly';
  const fmt = typeof c.money === 'function' ? c.money : formatMoney;
  const per = typeof c.per === 'function' ? c.per : v => (monthly ? v / 12 : v);
  const v = Math.max(0, Number(lever && lever.gain) || 0);
  return { amount: fmt(per(v)), label: monthly ? 'a month more' : 'a year more' };
}

let seq = 0;
function leverCard(parent, lever, ctx) {
  const c = el(parent, 'article', 'dc-lev-card is-' + (lever.kind || 'habit'));
  el(c, 'h3', 'dc-lev-title', lever.title);
  if (lever.line) el(c, 'p', 'dc-lev-line', lever.line);
  const f = figureOf(lever, ctx);
  const fig = el(c, 'p', 'dc-lev-fig');
  el(fig, 'span', 'dc-lev-amt', f.amount);
  el(fig, 'span', 'dc-lev-per', f.label);

  const id = 'dc-lev-body-' + (++seq);
  const btn = el(c, 'button', 'dc-lev-btn');
  btn.type = 'button';
  btn.setAttribute('aria-controls', id);
  el(btn, 'span', 'dc-lev-btn-t', 'What to do');
  const chev = el(btn, 'span', 'dc-lev-chev');
  const body = el(c, 'div', 'dc-lev-body');
  body.id = id;
  if (lever.how) el(body, 'p', 'dc-lev-how', lever.how);
  if (lever.needs) el(body, 'p', 'dc-lev-needs', lever.needs);
  const sync = () => {
    const on = OPEN.has(lever.id);
    btn.setAttribute('aria-expanded', String(on));
    while (chev.firstChild) chev.removeChild(chev.firstChild);
    icon(chev, on ? 'chevron-up' : 'chevron-down');
    body.hidden = !on;
  };
  btn.addEventListener('click', e => {
    e.preventDefault();
    if (OPEN.has(lever.id)) OPEN.delete(lever.id); else OPEN.add(lever.id);
    sync();
  });
  sync();
  return c;
}

function renderLevers(panel, ctx) {
  const c = ctx || {};
  const levers = Array.isArray(c.levers) ? c.levers.filter(l => l && l.gain > 0) : [];
  const sec = el(panel, 'section', 'dc-lev');
  if (c.heading !== false) el(sec, 'h2', 'dc-lev-h', typeof c.heading === 'string' && c.heading ? c.heading : HEADING);
  if (!levers.length) {
    el(sec, 'p', 'dc-lev-none', NONE);
    return sec;
  }
  const limit = Number.isFinite(c.limit) && c.limit > 0 ? Math.floor(c.limit) : levers.length;
  const cards = el(sec, 'div', 'dc-lev-cards');
  for (const l of levers.slice(0, limit)) leverCard(cards, l, c);
  if (levers.length > limit && typeof c.onAll === 'function') {
    const all = el(sec, 'button', 'dc-lev-all');
    all.type = 'button';
    el(all, 'span', null, 'All ways to get more');
    all.addEventListener('click', e => { e.preventDefault(); c.onAll(); });
  }
  return sec;
}

module.exports = { renderLevers, figureOf, HEADING, NONE };
