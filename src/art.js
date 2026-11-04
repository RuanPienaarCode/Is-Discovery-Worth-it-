'use strict';
/* The plugin's own pictures: small marks for the app, each product, the
   two kinds of reward and each kind of benefit, plus the welcome
   illustration. All original line art
   on a 24-unit grid, built node by node with createElementNS (no innerHTML,
   no data: URIs, no files), so it is crisp from 16px to 64px.

   Colour comes from CSS (src/css/art.css): every shape is drawn in
   currentColor, and each mark's class (dc-art-bank, dc-art-health, ...) sets
   `color` from the page's palette tokens (src/css/palettes.css, tuned for
   contrast in light and dark). The shapes are the plugin's own: no
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
   first, so the lines sit on top). Coordinates are on a 24 x 24 grid, one
   line weight (1.75), nothing finer than it, so each reads at 16px. No mark
   cuts a hole in what is behind it: where two shapes meet (the card's coin,
   the car's wheels) the lines stop short instead. */
const MARKS = {
  /* the app: a balance scale, cost on the left and benefit on the right,
     the benefit side lower */
  app: [
    ['tint', 'path', { d: 'M1.5 14.5h6a3 3 0 0 1-6 0z' }],
    ['tint', 'path', { d: 'M16.5 16.5h6a3 3 0 0 1-6 0z' }],
    ['line', 'path', { d: 'M1.5 14.5h6a3 3 0 0 1-6 0zM16.5 16.5h6a3 3 0 0 1-6 0z' }],
    ['line', 'path', { d: 'M4.5 7.2 1.5 14.5M4.5 7.2l3 7.3M19.5 9.2l-3 7.3M19.5 9.2l3 7.3' }],
    ['line', 'path', { d: 'M4.5 7.2 19.5 9.2' }],
    ['line', 'path', { d: 'M12 8.2V20.5M8 20.5h8' }],
    ['solid', 'circle', { cx: 12, cy: 8.2, r: 1.8 }],
  ],
  /* Discovery Bank: a wallet */
  bank: [
    ['tint', 'rect', { x: 2.5, y: 6.5, width: 19, height: 13, rx: 3 }],
    ['line', 'rect', { x: 2.5, y: 6.5, width: 19, height: 13, rx: 3 }],
    ['line', 'path', { d: 'M5.5 6.5 15.5 3.3a1.5 1.5 0 0 1 2 1.4v1.8' }],
    ['line', 'rect', { x: 14.5, y: 11.5, width: 7, height: 4, rx: 2 }],
    ['solid', 'circle', { cx: 17.5, cy: 13.5, r: 1.1 }],
  ],
  /* medical aid: a heart with a plus */
  health: [
    ['tint', 'path', { d: 'M12 20s-8-4.7-8-10.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.5C20 15.3 12 20 12 20z' }],
    ['line', 'path', { d: 'M12 20s-8-4.7-8-10.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.5C20 15.3 12 20 12 20z' }],
    ['line', 'path', { d: 'M12 10.6v4.6M9.7 12.9h4.6' }],
  ],
  /* gap cover: a shield with a tick */
  gap: [
    ['tint', 'path', { d: 'M12 2.8 19.2 5.6v5.4c0 4.6-3 7.8-7.2 9.6-4.2-1.8-7.2-5-7.2-9.6V5.6z' }],
    ['line', 'path', { d: 'M12 2.8 19.2 5.6v5.4c0 4.6-3 7.8-7.2 9.6-4.2-1.8-7.2-5-7.2-9.6V5.6z' }],
    ['line', 'path', { d: 'M8.8 11.6l2.4 2.4 4-4.4' }],
  ],
  /* car insurance: a car; the body line stops at the wheels */
  insure: [
    ['tint', 'path', { d: 'M3 16.5v-3.2a2 2 0 0 1 1.3-1.9L7 10.5l1.6-3.4a1.5 1.5 0 0 1 1.4-.9h4.4a1.5 1.5 0 0 1 1.4.9l1.7 3.4 2.2.9a2 2 0 0 1 1.3 1.9v3.2z' }],
    ['line', 'path', { d: 'M4.6 16.5H3v-3.2a2 2 0 0 1 1.3-1.9L7 10.5l1.6-3.4a1.5 1.5 0 0 1 1.4-.9h4.4a1.5 1.5 0 0 1 1.4.9l1.7 3.4 2.2.9a2 2 0 0 1 1.3 1.9v3.2h-1.6M9.8 16.5h4.4' }],
    ['line', 'path', { d: 'M9.5 10.5l1-2.6h3.6l1.4 2.6z' }],
    ['line', 'circle', { cx: 7.2, cy: 16.8, r: 2.6 }],
    ['line', 'circle', { cx: 16.8, cy: 16.8, r: 2.6 }],
  ],
  /* life cover: an umbrella */
  life: [
    ['tint', 'path', { d: 'M3 12a9 9 0 0 1 18 0a3 3 0 0 1-6 0a3 3 0 0 1-6 0a3 3 0 0 1-6 0z' }],
    ['line', 'path', { d: 'M3 12a9 9 0 0 1 18 0a3 3 0 0 1-6 0a3 3 0 0 1-6 0a3 3 0 0 1-6 0z' }],
    ['line', 'path', { d: 'M12 12v6.5a2 2 0 0 1-4 0' }],
  ],
  /* rewards for being active: a runner */
  rewards: [
    ['tint', 'circle', { cx: 12, cy: 12, r: 10 }],
    ['solid', 'circle', { cx: 14.6, cy: 5.2, r: 1.9 }],
    ['line', 'path', { d: 'M13.2 8.6 11 14l4 2.5-.6 4.5' }],
    ['line', 'path', { d: 'M11 14l-3.6 2.4L5.4 20' }],
    ['line', 'path', { d: 'M7.2 10.6l5.8-2 3.6 2.8' }],
  ],
  /* Miles: a plain coin with a star */
  miles: [
    ['tint', 'circle', { cx: 12, cy: 12, r: 9.5 }],
    ['line', 'circle', { cx: 12, cy: 12, r: 9.5 }],
    ['solid', 'path', { d: 'M12 7l1.46 3.39 3.68.34-2.78 2.44.81 3.6L12 14.88l-3.17 1.89.81-3.6-2.78-2.44 3.68-.34z' }],
  ],

  /* the kinds of benefit, for the Benefits cards (ui-benefits.js MARK_OF) */
  /* Miles on card payments: a card with a coin on its corner */
  card: [
    ['tint', 'path', { d: 'M12.1 17.5H5a2.5 2.5 0 0 1-2.5-2.5V8A2.5 2.5 0 0 1 5 5.5h12A2.5 2.5 0 0 1 19.5 8v3.1A5.4 5.4 0 0 0 12.1 17.5z' }],
    ['line', 'path', { d: 'M12.1 17.5H5a2.5 2.5 0 0 1-2.5-2.5V8A2.5 2.5 0 0 1 5 5.5h12A2.5 2.5 0 0 1 19.5 8v3.1M2.5 9.5h17' }],
    ['tint', 'circle', { cx: 17.5, cy: 16.5, r: 4.3 }],
    ['line', 'circle', { cx: 17.5, cy: 16.5, r: 4.3 }],
    ['solid', 'path', { d: 'M17.5 14.1l.7 1.63 1.77.17-1.33 1.17.39 1.73-1.53-.9-1.53.9.39-1.73-1.33-1.17 1.77-.17z' }],
  ],
  /* healthy food: a bowl with a leaf */
  groceries: [
    ['tint', 'path', { d: 'M3.5 12.5h17a8.5 7.5 0 0 1-17 0z' }],
    ['line', 'path', { d: 'M3.5 12.5h17a8.5 7.5 0 0 1-17 0z' }],
    ['tint', 'path', { d: 'M12 12C11.6 8.2 13.6 5.4 18 5c.3 4.2-2.1 6.8-6 7z' }],
    ['line', 'path', { d: 'M12 12C11.6 8.2 13.6 5.4 18 5c.3 4.2-2.1 6.8-6 7z' }],
    ['line', 'path', { d: 'M10 12C6.8 12 4.8 10.2 4.3 7c3.2 0 5.2 1.6 5.7 5z' }],
  ],
  /* pharmacy: a capsule */
  pharmacy: [
    ['tint', 'path', { d: 'M4.53 14.53 9.53 9.53l4.95 4.95-5 5A3.5 3.5 0 0 1 4.53 14.53z' }],
    ['line', 'path', { d: 'M4.53 14.53 14.53 4.53A3.5 3.5 0 0 1 19.47 9.47L9.47 19.47A3.5 3.5 0 0 1 4.53 14.53z' }],
    ['line', 'path', { d: 'M9.53 9.53 14.47 14.47' }],
  ],
  /* fuel: a pump */
  fuel: [
    ['tint', 'rect', { x: 5, y: 3.5, width: 9, height: 17, rx: 1.8 }],
    ['line', 'rect', { x: 5, y: 3.5, width: 9, height: 17, rx: 1.8 }],
    ['line', 'rect', { x: 7.4, y: 6.2, width: 4.2, height: 3.6, rx: 0.8 }],
    ['line', 'path', { d: 'M3.5 20.5h12' }],
    ['line', 'path', { d: 'M14 9.2h2a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 0 3 0V8L18.6 5.6' }],
  ],
  /* flights: a plane from above */
  flights: [
    ['tint', 'path', { d: 'M12 2.8c.9 0 1.5.9 1.5 2V9l7.5 4.5v2l-7.5-2.2v4l2 1.5v1.6L12 20.2 9 22.4v-1.6l2-1.5v-4L3.5 15.5v-2L10.5 9V4.8c0-1.1.6-2 1.5-2z' }],
    ['line', 'path', { d: 'M12 2.8c.9 0 1.5.9 1.5 2V9l7.5 4.5v2l-7.5-2.2v4l2 1.5v1.6L12 20.2 9 22.4v-1.6l2-1.5v-4L3.5 15.5v-2L10.5 9V4.8c0-1.1.6-2 1.5-2z' }],
  ],
  /* weekly exercise goals: a target */
  exercise: [
    ['tint', 'circle', { cx: 12, cy: 12, r: 9.2 }],
    ['line', 'circle', { cx: 12, cy: 12, r: 9.2 }],
    ['line', 'circle', { cx: 12, cy: 12, r: 4.6 }],
    ['solid', 'circle', { cx: 12, cy: 12, r: 1.7 }],
  ],
  /* the gym: a dumbbell */
  gym: [
    ['tint', 'rect', { x: 4, y: 7.5, width: 3, height: 9, rx: 1 }],
    ['tint', 'rect', { x: 17, y: 7.5, width: 3, height: 9, rx: 1 }],
    ['line', 'rect', { x: 4, y: 7.5, width: 3, height: 9, rx: 1 }],
    ['line', 'rect', { x: 17, y: 7.5, width: 3, height: 9, rx: 1 }],
    ['line', 'path', { d: 'M7 12h10M1.8 10.5v3M22.2 10.5v3' }],
  ],
  /* the watch deal: a plain smartwatch */
  watch: [
    ['tint', 'rect', { x: 6, y: 6.5, width: 12, height: 11, rx: 3.2 }],
    ['line', 'rect', { x: 6, y: 6.5, width: 12, height: 11, rx: 3.2 }],
    ['line', 'path', { d: 'M8.8 6.5l.6-3.9h5.2l.6 3.9M8.8 17.5l.6 3.9h5.2l.6-3.9' }],
    ['line', 'path', { d: 'M12 9.6V12l1.9 1.2' }],
  ],
  /* extra interest: a coin growing a sprout */
  savings: [
    ['tint', 'circle', { cx: 12, cy: 16.5, r: 4.9 }],
    ['line', 'circle', { cx: 12, cy: 16.5, r: 4.9 }],
    ['line', 'path', { d: 'M12 11.6V7.5' }],
    ['tint', 'path', { d: 'M12 8.8C12 5.7 9.8 4 7 4c0 3 1.8 4.8 5 4.8z' }],
    ['line', 'path', { d: 'M12 8.8C12 5.7 9.8 4 7 4c0 3 1.8 4.8 5 4.8z' }],
    ['line', 'path', { d: 'M12 7.2c0-2.6 1.8-4.2 4.6-4.2 0 2.8-1.7 4.2-4.6 4.2z' }],
    ['solid', 'circle', { cx: 12, cy: 16.5, r: 1.3 }],
  ],
  /* spending your Miles: a shopping bag with a star */
  spend: [
    ['tint', 'path', { d: 'M4.5 8.5h15l.9 11.5a1.5 1.5 0 0 1-1.5 1.5H5.1A1.5 1.5 0 0 1 3.6 20z' }],
    ['line', 'path', { d: 'M4.5 8.5h15l.9 11.5a1.5 1.5 0 0 1-1.5 1.5H5.1A1.5 1.5 0 0 1 3.6 20z' }],
    ['line', 'path', { d: 'M8.5 8.5V7a3.5 3.5 0 0 1 7 0v1.5' }],
    ['solid', 'path', { d: 'M12 11.5l1.03 2.39 2.58.24-1.95 1.71.57 2.53L12 17.05l-2.23 1.32.57-2.53-1.95-1.71 2.58-.24z' }],
  ],
};

/* Draw a mark's shapes into an SVG node (a whole <svg> or a <g>). */
function paintMark(into, key) {
  for (const [paint, tag, attrs] of MARKS[key] || MARKS.app) svgEl(into, tag, { ...PAINT[paint], ...attrs });
}

const LINE = { 'stroke-width': '1.75', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };

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

/* The welcome illustration (400 x 300): one balance scale on a soft round
   stage. What you pay drops into the left pan (one coin marked R) and tips
   it; then the five products drop into the right pan, each a coin in its
   own colour carrying its mark, and tip it back; the question at the pivot
   turns into a tick. The motion is all CSS (src/css/art.css); without it,
   the picture rests on its last frame. Every moving part sits in a group of
   its own inside a positioned group, because a CSS transform replaces an
   SVG transform attribute. Colours come from CSS classes only. */
function drawWelcomeArt(parent) {
  const svg = svgEl(null, 'svg', { viewBox: '0 0 400 300', width: 400, height: 300, 'aria-hidden': 'true', focusable: 'false', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  svg.setAttribute('class', 'dc-art dc-hello-art');

  /* the stage, the foot and the post */
  svgEl(svg, 'circle', { class: 'dc-hello-stage', cx: 200, cy: 146, r: 140 });
  svgEl(svg, 'path', { class: 'dc-hello-solid', d: 'M146 270h108l-10-16h-88z', 'stroke-width': '6' });
  svgEl(svg, 'rect', { class: 'dc-hello-solid', x: 196, y: 84, width: 8, height: 176, rx: 4 });

  /* the beam turns about the pivot; each pan hangs from a beam end and
     turns back the other way, so it always hangs straight down */
  const pivot = svgEl(svg, 'g', { transform: 'translate(200 84)' });
  const beam = svgEl(pivot, 'g', { class: 'dc-hello-beam' });
  svgEl(beam, 'rect', { class: 'dc-hello-solid', x: -112, y: -4, width: 224, height: 8, rx: 4 });

  const pan = (x, side) => {
    const at = svgEl(beam, 'g', { transform: `translate(${x} 0)` });
    const g = svgEl(at, 'g', { class: 'dc-hello-pan' });
    svgEl(g, 'path', { class: 'dc-hello-string', d: 'M0 0-50 72M0 0 50 72' });
    /* the coins drop in before the bowl is drawn, so they sit inside it */
    const coins = svgEl(g, 'g', { class: 'dc-hello-' + side });
    svgEl(g, 'path', { class: 'dc-hello-bowl', d: 'M-58 72h116a58 26 0 0 1-116 0z' });
    svgEl(at, 'circle', { class: 'dc-hello-solid', r: 7 });
    return coins;
  };
  const coin = (into, cls, i) => svgEl(into, 'g', { class: 'dc-hello-coin ' + cls, style: `--i:${i}` });

  /* left: what you pay, one big coin marked R */
  const big = coin(pan(-112, 'cost'), 'is-cost', 0);
  svgEl(big, 'circle', { class: 'dc-hello-neg', cx: 0, cy: 40, r: 32 });
  const r = svgEl(big, 'text', { class: 'dc-hello-r', x: 0, y: 51, 'text-anchor': 'middle', 'font-size': '34', 'font-weight': '800' });
  r.textContent = 'R';

  /* right: the five products, three on the bottom row and two above */
  const back = pan(112, 'back');
  const at = { bank: [-31, 56], health: [0, 56], gap: [31, 56], insure: [-15.5, 29.2], life: [15.5, 29.2] };
  PRODUCTS.forEach((id, i) => {
    const [x, y] = at[id];
    const c = coin(back, 'is-back dc-art-' + id, i);
    svgEl(c, 'circle', { class: 'dc-hello-disc', cx: x, cy: y, r: 16 });
    placeMark(c, id, x, y, 21, 'dc-hello-glyph');
  });

  /* the pivot: a question that becomes a tick */
  const knob = svgEl(svg, 'g', { transform: 'translate(200 84)' });
  svgEl(knob, 'circle', { class: 'dc-hello-knob', r: 19 });
  const ask = svgEl(knob, 'g', { class: 'dc-hello-ask' });
  svgEl(ask, 'path', { d: 'M-5 -4.5a5 5 0 1 1 6.8 4.7c-1.2.5-1.8 1.4-1.8 2.8v.6' });
  svgEl(ask, 'circle', { class: 'dc-hello-dot', cx: 0, cy: 8.6, r: 1.2 });
  svgEl(knob, 'path', { class: 'dc-hello-tick', d: 'M-7.5 .5l4.8 4.8L7.8-5.2' });

  if (parent) parent.appendChild(svg);
  return svg;
}

module.exports = { MARKS, PRODUCTS, svgEl, drawMark, placeMark, drawWelcomeArt };
