'use strict';
/* The money flow: your money → the products you have (one to five) → what comes back.
   Band widths follow the rand amounts; dashes move along each band in the
   direction the money goes (out red, back green) and stop under
   prefers-reduced-motion. Tap or hover a product to follow its money.
   Plain SVG built node by node — no innerHTML, no libraries — and laid out
   again when the pane is resized (one row per product under 600px). */

const { el, icon, button, clear } = require('./dom');
const { money } = require('./format');
const { productLogo } = require('./logos');

const NS = 'http://www.w3.org/2000/svg';

function sv(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
function txt(parent, x, y, s, cls, anchor) {
  const t = sv('text', { x, y, class: 'dc-fl-t ' + (cls || ''), 'text-anchor': anchor || 'start' }, parent);
  t.textContent = s;
  return t;
}
/* A label wider than maxW wraps onto a second line at a word break;
   returns the extra height it took (0 when it fits): a line is 15px, so the
   two lines of text do not touch. */
function fitText(parent, x, y, s, maxW) {
  const t = txt(parent, x, y, s, '');
  if (!t.getComputedTextLength || t.getComputedTextLength() <= maxW) return 0;
  const words = s.split(' ');
  let i = words.length - 1;
  for (; i > 1; i--) {
    t.textContent = words.slice(0, i).join(' ');
    if (t.getComputedTextLength() <= maxW) break;
  }
  if (i < 1) return 0;
  t.textContent = words.slice(0, i).join(' ');
  const rest = words.slice(i).join(' ');
  const t2 = txt(parent, x, y + 15, rest, '');
  for (let n = rest.length - 1; n > 1 && t2.getComputedTextLength() > maxW; n--) t2.textContent = rest.slice(0, n) + '…';
  return 15;
}
const ribbon = (x0, a0, b0, x1, a1, b1) => {
  const m = (x0 + x1) / 2;
  return `M${x0},${a0}C${m},${a0} ${m},${a1} ${x1},${a1}L${x1},${b1}C${m},${b1} ${m},${b0} ${x0},${b0}Z`;
};
const mid = (x0, y0, x1, y1) => {
  const m = (x0 + x1) / 2;
  return `M${x0},${y0}C${m},${y0} ${m},${y1} ${x1},${y1}`;
};

/* opts: { products, totals, per(v) → period value, perLabel(), onOpen(id) } */
function mountFlow(parent, opts) {
  const root = el(parent, 'div', 'dc-flow');
  /* a product with no money in or out has nothing to draw; with none at
     all (no product chosen, or no payments in this period) say so */
  if (!opts.products.some(p => p.paid >= 0.5 || p.backSum >= 0.5)) {
    el(root, 'p', 'dc-muted dc-fl-empty', opts.products.length
      ? 'No money went to or came back from your Discovery products in this period, so there is nothing to draw.'
      : 'You have not chosen any Discovery products yet. Choose them under Your Discovery setup on the Inputs tab.');
    return { refresh() {}, destroy() {} };
  }
  const legend = el(root, 'div', 'dc-fl-legend');
  const lg = (cls, label) => { const s = el(legend, 'span'); el(s, 'span', 'dc-fl-sw ' + cls); el(s, 'span', null, label); };
  lg('out', 'Money out');
  lg('back', 'Money back');
  el(legend, 'span', null, 'The wider the band, the more money');
  const host = el(root, 'div', 'dc-fl-host');
  const detail = el(root, 'div', 'dc-fl-detail');
  const flows = opts.products.filter(p => p.paid >= 0.5 || p.backSum >= 0.5);
  const OUT = flows.reduce((s, p) => s + p.paid, 0), BACK = flows.reduce((s, p) => s + p.backSum, 0);
  let sel = null, lastW = 0;
  const fmt = (v, plus) => money(opts.per(v), { plus });
  const moneyText = (g, x, y, v, cls, anchor, plus) => txt(g, x, y, fmt(v, plus), (cls || '') + (v < 0 ? ' neg' : ' pos'), anchor);

  function link(g, p, kind, x0, a0, b0, x1, a1, b1) {
    if (b0 - a0 < 1.5) { b0 = a0 + 1.5; b1 = a1 + 1.5; }
    const w = b0 - a0;
    const gl = sv('g', { class: 'dc-fl-link dc-p-' + p.id, 'data-k': p.id }, g);
    if (p.via && kind === 'out') {
      sv('path', { d: ribbon(x0, a0, b0, x1, a1, b1), class: 'dc-fl-rib via-fill' }, gl);
      sv('path', { d: ribbon(x0, a0, b0, x1, a1, b1), class: 'dc-fl-rib via' }, gl);
    } else sv('path', { d: ribbon(x0, a0, b0, x1, a1, b1), class: 'dc-fl-rib ' + kind }, gl);
    sv('path', { d: mid(x0, (a0 + b0) / 2, x1, (a1 + b1) / 2), class: 'dc-fl-dash ' + kind, 'stroke-width': Math.max(1.5, Math.min(3, w * 0.35)) }, gl);
  }
  function node(g, p, x, y, w, h) {
    const n = sv('g', { class: 'dc-fl-node dc-p-' + p.id, 'data-k': p.id, tabindex: '0', role: 'button',
      'aria-label': `${p.name}: paid ${fmt(-p.paid)}, back ${fmt(p.backSum, true)}, net ${fmt(p.net, true)}` }, g);
    sv('rect', { x, y, width: w, height: h, rx: 6, class: 'dc-fl-bx' }, n);
    sv('rect', { x, y, width: 4, height: h, rx: 2, class: 'dc-fl-stripe' }, n);
    return n;
  }
  function you(g, attrs) {
    return sv('g', Object.assign({ class: 'dc-fl-node dc-fl-you', 'data-k': 'you', tabindex: '0', role: 'button',
      'aria-label': `From you: ${fmt(-OUT)} to Discovery, ${fmt(BACK, true)} back` }, attrs || {}), g);
  }

  function wide(svg, W) {
    const youW = 104, boxW = Math.round(Math.min(176, Math.max(138, W * 0.2)));
    const prodX = Math.round(Math.max(youW + 120, W * 0.34)), backX = W - 188, top = 30, gap = 14;
    const sumMid = flows.reduce((s, p) => s + Math.max(p.paid, p.backSum), 0) || 1;
    const s = (Math.max(380, Math.min(500, W * 0.55)) - gap * 4) / sumMid;
    let y = top;
    for (const p of flows) { const h = Math.max(48, Math.max(p.paid, p.backSum) * s); p.box = { y, h }; y += h + gap; }
    const midH = y - gap, youH = Math.max(40, OUT * s), youY = top + (midH - top - youH) / 2;
    const gl = sv('g', {}, svg), gn = sv('g', {}, svg), gt = sv('g', {}, svg);
    txt(gt, 0, 14, 'From you', 'h'); txt(gt, prodX, 14, 'Discovery', 'h'); txt(gt, backX, 14, 'Back to you', 'h');
    let cum = 0, cursor = top;
    for (const p of flows) {
      const a0 = youY + cum * s, b0 = a0 + p.paid * s;
      cum += p.paid;
      if (p.paid >= 0.5) {
        link(gl, p, 'out', youW, a0, b0, prodX, p.box.y, p.box.y + p.paid * s);
        const ol = sv('g', { 'data-k': p.id }, gt);
        moneyText(ol, prodX - 8, p.box.y + Math.max(p.paid * s, 2) / 2 + 4, -p.paid, 'dc-fl-halo', 'end');
        if (p.via) txt(ol, prodX - 8, p.box.y + Math.max(p.paid * s, 2) / 2 + 18, 'via payslip', 'm dc-fl-halo', 'end');
      }
      const n = node(gn, p, prodX, p.box.y, boxW, p.box.h);
      txt(n, prodX + 12, p.box.y + 18, p.name, 'b');
      txt(n, prodX + 12, p.box.y + 34, 'net', 'm');
      moneyText(n, prodX + 36, p.box.y + 34, p.net, '', 'start', true);
      let bc = 0;
      for (const b of p.back) {
        const h = Math.max(b.v * s, 2), ny = Math.max(cursor, p.box.y + bc * s);
        link(gl, p, 'back', prodX + boxW, p.box.y + bc * s, p.box.y + (bc + b.v) * s, backX, ny, ny + h);
        bc += b.v;
        const bg = sv('g', { class: 'dc-p-' + p.id, 'data-k': p.id }, gn);
        sv('rect', { x: backX, y: ny, width: 8, height: h, rx: 1, class: 'dc-fl-bar' }, bg);
        /* a long label wraps, as in the narrow layout: a landscape phone is "wide" too */
        const extra = fitText(bg, backX + 14, ny + 12, b.label, W - backX - 16);
        moneyText(bg, backX + 14, ny + 26 + extra, b.v, '', 'start', true);
        cursor = ny + Math.max(h, 32 + extra) + 6;
      }
      if (!p.back.length) {
        const bg = sv('g', { 'data-k': p.id }, gt);
        txt(bg, prodX + boxW + 12, p.box.y + 18, 'No money back', 'm');
        if (p.cover) txt(bg, prodX + boxW + 12, p.box.y + 32, 'cover ' + money(p.cover), 'm');
      }
    }
    const u = you(gn);
    sv('rect', { x: 0, y: youY, width: youW, height: youH, rx: 6, class: 'dc-fl-bx' }, u);
    txt(u, 10, youY + 18, 'Your money', 'b');
    moneyText(u, 10, youY + 34, -OUT, '', 'start');
    txt(u, 10, youY + 50, 'salary and card', 'm');
    return Math.max(midH, cursor) + 8;
  }

  function narrow(svg, W) {
    /* 110px keeps "paid" clear of a five-figure amount on a 320px phone */
    const spineW = 6, boxX = Math.round(W * 0.17), boxW = Math.max(110, Math.round(W * 0.34)), backX = boxX + boxW + Math.round(W * 0.1);
    const biggest = Math.max(1, ...flows.map(p => Math.max(p.paid, p.backSum)));
    const s = 84 / biggest, rowGap = 16;
    let y = 38;
    const gl = sv('g', {}, svg), gn = sv('g', {}, svg), gt = sv('g', {}, svg);
    txt(gt, 0, 13, 'From you', 'h'); moneyText(gt, 0, 29, -OUT, '', 'start');
    txt(gt, backX, 13, 'Back to you', 'h'); moneyText(gt, backX, 29, BACK, '', 'start', true);
    const first = y;
    for (const p of flows) {
      const bh = Math.max(60, p.paid * s, p.backSum * s);
      const n = node(gn, p, boxX, y, boxW, bh);
      txt(n, boxX + 10, y + 17, p.short, 'b');
      txt(n, boxX + 10, y + 33, 'paid', 'm'); moneyText(n, boxX + boxW - 6, y + 33, -p.paid, '', 'end');
      txt(n, boxX + 10, y + 49, 'net', 'm'); moneyText(n, boxX + boxW - 6, y + 49, p.net, '', 'end', true);
      if (p.paid >= 0.5) link(gl, p, 'out', spineW, y, y + p.paid * s, boxX, y, y + p.paid * s);
      if (p.via) txt(sv('g', { 'data-k': p.id }, gt), spineW + 4, y + p.paid * s + 12, 'payslip', 'm dc-fl-halo');
      let bc = 0, ny = y;
      for (const b of p.back) {
        const h = Math.max(b.v * s, 2);
        link(gl, p, 'back', boxX + boxW, y + bc * s, y + (bc + b.v) * s, backX, ny, ny + h);
        bc += b.v;
        const bg = sv('g', { class: 'dc-p-' + p.id, 'data-k': p.id }, gn);
        sv('rect', { x: backX, y: ny, width: 6, height: h, rx: 1, class: 'dc-fl-bar' }, bg);
        const extra = fitText(bg, backX + 11, ny + 11, b.label, W - backX - 13);
        moneyText(bg, backX + 11, ny + 25 + extra, b.v, '', 'start', true);
        ny += 34 + extra;
      }
      if (!p.back.length) {
        const bg = sv('g', { 'data-k': p.id }, gt);
        txt(bg, backX, y + 17, 'No money back', 'm');
        if (p.cover) txt(bg, backX, y + 31, 'cover ' + money(p.cover), 'm');
      }
      y += Math.max(bh, ny - y) + rowGap;
    }
    const u = you(gn);
    sv('rect', { x: 0, y: first, width: spineW, height: y - rowGap - first, rx: 3, class: 'dc-fl-spine' }, u);
    /* a 44px-wide tap area over the thin spine */
    sv('rect', { x: 0, y: first, width: 44, height: y - rowGap - first, fill: 'transparent' }, u);
    return y - rowGap + 4;
  }

  function showDetail(k) {
    clear(detail);
    const p = flows.find(x => x.id === k);
    detail.className = 'dc-fl-detail' + (p ? ' dc-p-' + p.id : '');
    const rows = el(null, 'dl', 'dc-fl-rows');
    const row = (label, v, plus, cls) => {
      el(rows, 'dt', cls || null, label);
      const dd = el(rows, 'dd', cls || null);
      el(dd, 'span', 'dc-amt ' + (v < 0 ? 'is-neg' : 'is-pos'), fmt(v, plus));
    };
    const title = el(detail, 'p', 'dc-fl-d-t');
    if (!p && k !== 'you') {
      el(title, 'span', null, 'Tap a product, or your money on the left');
      row('Paid to Discovery', -OUT);
      row('Back to you, in cash and rewards', BACK, true);
      row(`Back minus paid, ${opts.perLabel()}`, BACK - OUT, true, 'net');
      detail.appendChild(rows);
      el(detail, 'p', 'dc-fl-d-note', 'Rewards include Miles (at what yours were worth) and a few estimates, so this mixes cash with other value. The cash table on the Overview counts cash only.');
      return;
    }
    if (k === 'you') {
      el(title, 'span', null, `Your money, ${opts.perLabel()}`);
      for (const q of flows) row(q.name, -q.paid);
      row('Paid to Discovery', -OUT, false, 'net');
      detail.appendChild(rows);
      return;
    }
    productLogo(title, p.id);
    el(title, 'span', null, `${p.name}, ${opts.perLabel()}`);
    row(`Paid: ${p.outLabel}`, -p.paid);
    for (const [label, v] of p.outParts || []) row(label, v, false, 'sub');
    for (const b of p.back) {
      row(b.label, b.v, true);
      for (const [label, v] of b.parts || []) row(label, v, true, 'sub');
    }
    row('Back minus paid', p.net, true, 'net');
    detail.appendChild(rows);
    if (p.note) el(detail, 'p', 'dc-fl-d-note', p.note);
    if (opts.onOpen) button(detail, 'dc-link', `Open the ${p.name} tab`, () => opts.onOpen(p.id), 'chevron-right');
  }

  function mark(k) {
    host.classList.toggle('has-focus', !!k);
    host.querySelectorAll('[data-k]').forEach(e => {
      const on = !k ? false : k === 'you' ? (e.getAttribute('data-k') === 'you' || e.classList.contains('dc-fl-link')) : (e.getAttribute('data-k') === k || e.getAttribute('data-k') === 'you');
      e.classList.toggle('is-on', on);
    });
    showDetail(k);
  }
  function render(force) {
    const W = Math.floor(host.clientWidth);
    if (W < 200 || (W === lastW && !force)) return;
    lastW = W;
    clear(host);
    const svg = sv('svg', { width: W, role: 'group', 'aria-label': 'Money flow between you and each Discovery product' }, host);
    const H = Math.ceil(W < 600 ? narrow(svg, W) : wide(svg, W));
    svg.setAttribute('height', H);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    mark(sel);
  }
  const keyOf = t => { const e = t && t.closest ? t.closest('[data-k]') : null; return e ? e.getAttribute('data-k') : null; };
  host.addEventListener('mouseover', e => { const k = keyOf(e.target); if (k) mark(k); });
  host.addEventListener('mouseleave', () => mark(sel));
  /* On a narrow pane the totals sit below a tall diagram: bring them into
     view when a tap selects something, or the tap seems to do nothing. */
  const reveal = () => { if (sel && lastW < 600 && detail.scrollIntoView) detail.scrollIntoView({ block: 'nearest' }); };
  host.addEventListener('click', e => { const k = keyOf(e.target); sel = k && k !== sel ? k : null; mark(sel); reveal(); });
  host.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('dc-fl-node')) {
      e.preventDefault();
      const k = e.target.getAttribute('data-k');
      sel = k !== sel ? k : null;
      mark(sel);
      reveal();
    }
  });
  let ro = null, destroyed = false;
  if (typeof ResizeObserver !== 'undefined') {
    /* a frame can still be pending when the flow closes: skip it */
    ro = new ResizeObserver(() => requestAnimationFrame(() => { if (!destroyed) render(); }));
    ro.observe(host);
  }
  render();
  /* a hidden tab has no width yet: draw when it is shown */
  return {
    refresh() { render(true); },
    destroy() { destroyed = true; if (ro) ro.disconnect(); },
  };
}

module.exports = { mountFlow };
