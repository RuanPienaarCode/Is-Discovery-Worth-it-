'use strict';
/* The plugin's own pictures: small marks for the app, each product and the
   two kinds of reward, plus the welcome illustration. All original line art
   on a 24-unit grid, built node by node with createElementNS (no innerHTML,
   no data: URIs, no files), so it is crisp from 16px to 64px.

   Colour comes from CSS (src/css/art.css): every shape is drawn in
   currentColor, and each mark's class (dc-art-bank, dc-art-health, ...) sets
   `color` from the page's product colours (Discovery's own palette, tuned
   for contrast in light and dark). The shapes are the plugin's own: no
   company's logo, wordmark or picture. */

const NS = 'http://www.w3.org/2000/svg';

/* One SVG node with its attributes. */
function svgEl(parent, tag, attrs) {
  const n = document.createElementNS(NS, tag);
  if (attrs) for (const k of Object.keys(attrs)) n.setAttribute(k, String(attrs[k]));
  if (parent) parent.appendChild(n);
  return n;
}

/* How a shape is painted: a line in the mark's colour, a soft tint of it, or
   a solid dot. */
const PAINT = {
  line: { fill: 'none', stroke: 'currentColor' },
  tint: { fill: 'currentColor', 'fill-opacity': '0.18', stroke: 'none' },
  solid: { fill: 'currentColor', stroke: 'none' },
};

/* Each mark is a list of [paint, tag, attributes], drawn in order (tints
   first, so the lines sit on top). Coordinates are on a 24 x 24 grid. */
const MARKS = {
  /* the app: a balance scale, cost on the left and benefit on the right,
     with the benefit side just ahead and a tick at the pivot */
  app: [
    ['tint', 'path', { d: 'M1.6 15.4h6.8a3.4 3.4 0 0 1-6.8 0z' }],
    ['tint', 'path', { d: 'M15.6 13.4h6.8a3.4 3.4 0 0 1-6.8 0z' }],
    ['line', 'path', { d: 'M12 6.2V20.5M8.5 20.5h7' }],
    ['line', 'path', { d: 'M4.6 8.6 19.4 6.6' }],
    ['line', 'path', { d: 'M4.6 8.6 1.6 15.4h6.8zM19.4 6.6l-3.8 6.8h6.8z' }],
    ['solid', 'circle', { cx: 12, cy: 4.2, r: 1.6 }],
  ],
  /* Discovery Bank: a bank card with a chip and a stripe */
  bank: [
    ['tint', 'rect', { x: 2.5, y: 5.5, width: 19, height: 13, rx: 2.4 }],
    ['line', 'rect', { x: 2.5, y: 5.5, width: 19, height: 13, rx: 2.4 }],
    ['line', 'path', { d: 'M2.5 9.6h19' }],
    ['solid', 'rect', { x: 5.2, y: 12.3, width: 4.4, height: 3.2, rx: 0.8 }],
    ['line', 'path', { d: 'M13.5 14.6h4.6' }],
  ],
  /* medical aid: a heart with a pulse running through it */
  health: [
    ['tint', 'path', { d: 'M12 20.2s-7.8-4.6-7.8-10.6A4.3 4.3 0 0 1 12 7.1a4.3 4.3 0 0 1 7.8 2.5c0 6-7.8 10.6-7.8 10.6z' }],
    ['line', 'path', { d: 'M12 20.2s-7.8-4.6-7.8-10.6A4.3 4.3 0 0 1 12 7.1a4.3 4.3 0 0 1 7.8 2.5c0 6-7.8 10.6-7.8 10.6z' }],
    ['line', 'path', { d: 'M2 12.6h5.2l1.6-2.6 2.6 5.2 2.2-4 1.2 1.4H22' }],
  ],
  /* gap cover: a shield over the gap between two ledges */
  gap: [
    ['tint', 'path', { d: 'M12 2.8 18 5.2v4.6c0 3.9-2.5 6.6-6 7.9-3.5-1.3-6-4-6-7.9V5.2z' }],
    ['line', 'path', { d: 'M12 2.8 18 5.2v4.6c0 3.9-2.5 6.6-6 7.9-3.5-1.3-6-4-6-7.9V5.2z' }],
    ['line', 'path', { d: 'M9.4 10.2l1.8 1.8 3.6-3.6' }],
    ['line', 'path', { d: 'M1.8 20.4h5.4v1.8M22.2 20.4h-5.4v1.8' }],
  ],
  /* car insurance: a car on a road */
  insure: [
    ['tint', 'path', { d: 'M3 15.4v-2.6l2.2-4.2h9.4l3.8 4.2H21v2.6z' }],
    ['line', 'path', { d: 'M3 15.4v-2.6l2.2-4.2h9.4l3.8 4.2H21v2.6h-1.6M8.8 15.4h6.4M5.4 15.4H3' }],
    ['line', 'path', { d: 'M9.8 8.6v4.2' }],
    ['line', 'circle', { cx: 7.1, cy: 15.6, r: 1.7 }],
    ['line', 'circle', { cx: 17, cy: 15.6, r: 1.7 }],
    ['line', 'path', { d: 'M2 20.6h3.4M10.3 20.6h3.4M18.6 20.6H22' }],
  ],
  /* life cover: an umbrella over a small heart */
  life: [
    ['tint', 'path', { d: 'M2.8 11.4a9.2 9.2 0 0 1 18.4 0c-1.5-1.2-3.1-1.2-4.6 0-1.5-1.2-3.1-1.2-4.6 0-1.5-1.2-3.1-1.2-4.6 0-1.5-1.2-3.1-1.2-4.6 0z' }],
    ['line', 'path', { d: 'M2.8 11.4a9.2 9.2 0 0 1 18.4 0c-1.5-1.2-3.1-1.2-4.6 0-1.5-1.2-3.1-1.2-4.6 0-1.5-1.2-3.1-1.2-4.6 0-1.5-1.2-3.1-1.2-4.6 0z' }],
    ['line', 'path', { d: 'M12 2.2v1M12 11.4v7.2a2 2 0 0 1-4 0' }],
    ['solid', 'path', { d: 'M17.6 21.4s-3-1.8-3-4a1.5 1.5 0 0 1 3-.6 1.5 1.5 0 0 1 3 .6c0 2.2-3 4-3 4z' }],
  ],
  /* rewards for being active: two activity rings, part filled */
  rewards: [
    ['tint', 'circle', { cx: 12, cy: 12, r: 9.2 }],
    ['line', 'path', { d: 'M12 2.8a9.2 9.2 0 1 1-9.2 9.2' }],
    ['line', 'path', { d: 'M12 7.2a4.8 4.8 0 1 1-4.8 4.8', 'stroke-opacity': '0.7' }],
    ['solid', 'circle', { cx: 12, cy: 12, r: 1.6 }],
  ],
  /* Miles: a plain coin with a star */
  miles: [
    ['tint', 'circle', { cx: 12, cy: 12, r: 9.4 }],
    ['line', 'circle', { cx: 12, cy: 12, r: 9.4 }],
    ['line', 'circle', { cx: 12, cy: 12, r: 6.8, 'stroke-opacity': '0.45' }],
    ['solid', 'path', { d: 'M12 7.6l1.3 2.7 3 .4-2.2 2.1.5 3-2.6-1.4-2.6 1.4.5-3-2.2-2.1 3-.4z' }],
  ],
};

/* Draw a mark's shapes into an SVG node (a whole <svg> or a <g>). */
function paintMark(into, key) {
  for (const [paint, tag, attrs] of MARKS[key] || MARKS.app) svgEl(into, tag, { ...PAINT[paint], ...attrs });
}

const LINE = { 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };

/* A mark as its own <svg>, in its colour (class dc-art-<key>). `size` sets
   the width and height attributes: a fallback only, any CSS size wins. */
function drawMark(parent, key, cls, size) {
  const k = MARKS[key] ? key : 'app';
  const svg = svgEl(null, 'svg', { viewBox: '0 0 24 24', width: size || 24, height: size || 24, 'aria-hidden': 'true', focusable: 'false', ...LINE });
  svg.setAttribute('class', 'dc-art dc-art-' + k + (cls ? ' ' + cls : ''));
  paintMark(svg, k);
  if (parent) parent.appendChild(svg);
  return svg;
}

/* A mark placed inside a bigger drawing: a group `size` units wide centred
   on (cx, cy). */
function placeMark(parent, key, cx, cy, size, cls) {
  const s = size / 24;
  const g = svgEl(parent, 'g', { transform: `translate(${cx - size / 2} ${cy - size / 2}) scale(${s})`, ...LINE });
  g.setAttribute('class', 'dc-art-' + key + (cls ? ' ' + cls : ''));
  paintMark(g, key);
  return g;
}

const PRODUCTS = ['bank', 'health', 'gap', 'insure', 'life'];

/* The welcome illustration (400 x 340): the scale sits level with the five
   product marks around it; a cost coin drops into the left pan and tips it,
   then benefit coins drop into the right pan and tip it back, and the
   question mark at the pivot turns into a tick. The motion is all CSS
   (src/css/art.css); without it, the picture rests on its last frame.
   Every moving part sits in a group of its own inside a positioned group,
   because a CSS transform replaces an SVG transform attribute. */
function drawWelcomeArt(parent) {
  const svg = svgEl(null, 'svg', { viewBox: '0 0 400 340', width: 400, height: 340, 'aria-hidden': 'true', focusable: 'false', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  svg.setAttribute('class', 'dc-art dc-hello-art');

  /* a soft floor shadow and the stand */
  const stand = svgEl(svg, 'g', { class: 'dc-hello-ink' });
  svgEl(stand, 'ellipse', { cx: 200, cy: 312, rx: 96, ry: 9, fill: 'currentColor', 'fill-opacity': '0.08', stroke: 'none' });
  svgEl(stand, 'path', { d: 'M200 132V300M156 304h88', fill: 'none', stroke: 'currentColor', 'stroke-width': '7' });
  svgEl(stand, 'path', { d: 'M178 304c4-10 12-14 22-14s18 4 22 14', fill: 'currentColor', 'fill-opacity': '0.12', stroke: 'currentColor', 'stroke-width': '4' });

  /* the five products, in a ring above the scale */
  const ring = [[40, 140], [104, 62], [200, 32], [296, 62], [360, 140]];
  PRODUCTS.forEach((id, i) => {
    const [x, y] = ring[i];
    const pos = svgEl(svg, 'g', { transform: `translate(${x} ${y})` });
    const chip = svgEl(pos, 'g', { class: 'dc-hello-chip dc-art-' + id, style: `--i:${i}` });
    svgEl(chip, 'circle', { r: 24, fill: 'currentColor', 'fill-opacity': '0.1', stroke: 'currentColor', 'stroke-opacity': '0.45', 'stroke-width': '1.5' });
    placeMark(chip, id, 0, 0, 28);
  });

  /* the beam turns about the pivot; each pan hangs from a beam end and
     turns back the other way, so it always hangs straight down */
  const pivot = svgEl(svg, 'g', { transform: 'translate(200 130)' });
  const beam = svgEl(pivot, 'g', { class: 'dc-hello-beam' });
  svgEl(beam, 'path', { d: 'M-104 0H104', class: 'dc-hello-ink', fill: 'none', stroke: 'currentColor', 'stroke-width': '7' });

  const pan = (x, side) => {
    const at = svgEl(beam, 'g', { transform: `translate(${x} 0)` });
    const g = svgEl(at, 'g', { class: 'dc-hello-pan' });
    svgEl(g, 'path', { d: 'M0 0-30 58M0 0 30 58', class: 'dc-hello-ink', fill: 'none', stroke: 'currentColor', 'stroke-width': '2.5', 'stroke-opacity': '0.7' });
    /* the coins drop in before the bowl is drawn, so they sit inside it */
    const coins = svgEl(g, 'g', { class: 'dc-hello-' + side });
    svgEl(g, 'path', { d: 'M-40 58h80a40 22 0 0 1-80 0z', class: 'dc-hello-ink', fill: 'currentColor', 'fill-opacity': '0.12', stroke: 'currentColor', 'stroke-width': '4' });
    svgEl(at, 'circle', { r: 5, class: 'dc-hello-ink', fill: 'currentColor', stroke: 'none' });
    return coins;
  };

  /* left: what you pay, one big coin marked R */
  const cost = pan(-104, 'cost');
  const fall = (into, cls, i) => svgEl(into, 'g', { class: 'dc-hello-coin ' + cls, style: `--i:${i}` });
  const big = fall(cost, 'is-cost', 0);
  svgEl(big, 'circle', { cx: 0, cy: 38, r: 19, fill: 'currentColor', 'fill-opacity': '0.16', stroke: 'currentColor', 'stroke-width': '3.5' });
  const r = svgEl(big, 'text', { x: 0, y: 45.5, 'text-anchor': 'middle', fill: 'currentColor', stroke: 'none', 'font-size': '21', 'font-weight': '700' });
  r.textContent = 'R';

  /* right: what comes back, coins carrying the reward marks */
  const back = pan(104, 'back');
  [['miles', -14, 45, 12], ['rewards', 14, 45, 12], ['health', 0, 23, 12]].forEach(([key, x, y, rad], i) => {
    const c = fall(back, 'is-back', i);
    svgEl(c, 'circle', { cx: x, cy: y, r: rad, class: 'dc-hello-face', stroke: 'currentColor', 'stroke-width': '2.5' });
    placeMark(c, key, x, y, rad * 1.3);
  });

  /* the pivot: a question that becomes a tick */
  const knob = svgEl(svg, 'g', { transform: 'translate(200 130)' });
  svgEl(knob, 'circle', { r: 17, class: 'dc-hello-knob', stroke: 'currentColor', 'stroke-width': '4' });
  const ask = svgEl(knob, 'g', { class: 'dc-hello-ask', fill: 'none', stroke: 'currentColor', 'stroke-width': '3.2' });
  svgEl(ask, 'path', { d: 'M-5 -4.5a5 5 0 1 1 6.8 4.7c-1.2.5-1.8 1.4-1.8 2.8v.6' });
  svgEl(ask, 'circle', { cx: 0, cy: 8.6, r: 1.1, fill: 'currentColor' });
  svgEl(knob, 'path', { d: 'M-7 0.5l4.6 4.6L7.4-5', class: 'dc-hello-tick', fill: 'none', stroke: 'currentColor', 'stroke-width': '3.6' });

  if (parent) parent.appendChild(svg);
  return svg;
}

module.exports = { MARKS, PRODUCTS, svgEl, drawMark, placeMark, drawWelcomeArt };
