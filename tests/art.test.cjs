'use strict';
/* The plugin's own artwork (src/art.js, src/logos.js, src/welcome.js):
   1. every mark builds as an <svg> with a viewBox and aria-hidden, from
      createElementNS only, in its own colour class;
   2. logos.js keeps its contract: brandLogo -> span.dc-logo holding a mark,
      productLogo -> svg.dc-tile-logo straight in the parent;
   3. no borrowed pictures: no <img>, no data: URIs, no files, no text in a
      mark (so no letter monogram), and the old picture module is gone;
   4. the welcome illustration builds, and the copy is the agreed copy. */
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const root = path.join(__dirname, '..');

/* a small DOM: enough for createElement(NS), attributes, classes, text */
class Node {
  constructor(tag, ns) { this.tagName = tag; this.ns = ns || null; this.children = []; this.attrs = {}; this.style = { setProperty() {} }; this.textContent = ''; this._cls = ''; this.listeners = {}; }
  get className() { return this.ns ? { baseVal: this.attrs.class || '' } : this._cls; }
  set className(v) { if (this.ns) throw new Error('className on an SVG node is read-only'); this._cls = v; this.attrs.class = v; }
  get classList() { const n = this; return { add(c) { n.attrs.class = ((n.attrs.class || '') + ' ' + c).trim(); n._cls = n.attrs.class; }, contains(c) { return (n.attrs.class || '').split(' ').includes(c); } }; }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'class') this._cls = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  appendChild(c) { this.children.push(c); c.parentNode = this; return c; }
  addEventListener(t, f) { this.listeners[t] = f; }
  set id(v) { this.attrs.id = v; }
  all() { return [this, ...this.children.flatMap(c => c.all())]; }
}
global.document = { createElement: t => new Node(t), createElementNS: (ns, t) => new Node(t, ns) };
global.requestAnimationFrame = f => f();

const origLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'obsidian') return { setIcon: () => {} };
  return origLoad.call(this, request, ...rest);
};
const art = require(path.join(root, 'src/art.js'));
const { brandLogo, productLogo } = require(path.join(root, 'src/logos.js'));
const { renderWelcome } = require(path.join(root, 'src/welcome.js'));
Module._load = origLoad;

const SVG = 'http://www.w3.org/2000/svg';
const cls = n => (n.attrs.class || '').split(' ');

// 1. every mark
const BENEFIT_MARKS = ['card', 'groceries', 'pharmacy', 'fuel', 'flights', 'exercise', 'gym', 'watch', 'savings', 'spend'];
for (const key of ['app', 'bank', 'health', 'gap', 'insure', 'life', 'rewards', 'miles', ...BENEFIT_MARKS]) {
  assert.ok(art.MARKS[key], `mark ${key} exists`);
  const svg = art.drawMark(null, key);
  assert.strictEqual(svg.tagName, 'svg');
  assert.strictEqual(svg.ns, SVG, `${key}: built with createElementNS`);
  assert.strictEqual(svg.getAttribute('viewBox'), '0 0 24 24');
  assert.strictEqual(svg.getAttribute('aria-hidden'), 'true');
  assert.ok(cls(svg).includes('dc-art-' + key), `${key}: colour class`);
  const nodes = svg.all();
  assert.ok(nodes.length > 2, `${key}: has shapes`);
  for (const n of nodes) {
    assert.strictEqual(n.ns, SVG, `${key}: every node is SVG`);
    assert.ok(!['text', 'image', 'use', 'foreignObject', 'mask', 'clipPath', 'filter'].includes(n.tagName), `${key}: no ${n.tagName} in a mark`);
    /* colour from CSS only: every paint is currentColor or none */
    for (const a of ['fill', 'stroke']) if (n.attrs[a]) assert.ok(['currentColor', 'none'].includes(n.attrs[a]), `${key}: ${a}=${n.attrs[a]} is not currentColor`);
  }
  /* a handful of shapes, so it stays crisp and cheap to build */
  assert.ok(nodes.length - 1 <= 7, `${key}: at most 7 shapes (has ${nodes.length - 1})`);
}
/* the Benefits cards each name a mark of their own kind */
{
  const { MARK_OF } = (() => { const o = Module._load; Module._load = function (r, ...x) { return r === 'obsidian' ? { setIcon() {} } : o.call(this, r, ...x); }; try { return require(path.join(root, 'src/ui-benefits.js')); } finally { Module._load = o; } })();
  for (const k of BENEFIT_MARKS) assert.ok(Object.values(MARK_OF).includes(k), `a Benefits card uses the ${k} mark`);
  const css = fs.readFileSync(path.join(root, 'src/css/art.css'), 'utf8');
  for (const k of BENEFIT_MARKS) assert.ok(new RegExp('\\.dc-art-' + k + '\\b[^{]*\\{[^}]*color:').test(css), `art.css colours the ${k} mark`);
}
assert.ok(cls(art.drawMark(null, 'nope')).includes('dc-art-app'), 'an unknown key falls back to the app mark');

// 2. logos.js contract
const parent = new Node('div');
const box = brandLogo(parent, 'discovery');
assert.strictEqual(box.tagName, 'span');
assert.ok(cls(box).includes('dc-logo'));
assert.strictEqual(box.getAttribute('aria-hidden'), 'true');
assert.ok(cls(box.children[0]).includes('dc-art-app'), "'discovery' draws the app's own mark");
assert.ok(cls(brandLogo(parent, 'miles', 'x')).includes('x'), 'extra class kept');
for (const id of art.PRODUCTS) {
  const t = new Node('span');
  const m = productLogo(t, id);
  assert.strictEqual(t.children[0], m, `${id}: mark sits straight in the parent`);
  assert.ok(cls(m).includes('dc-tile-logo') && cls(m).includes('dc-art-' + id), `${id}: dc-tile-logo + its colour`);
}

// 3. no borrowed pictures
assert.ok(!fs.existsSync(path.join(root, 'src/assets.js')), 'src/assets.js is gone');
for (const f of ['art.js', 'logos.js', 'welcome.js']) {
  const text = fs.readFileSync(path.join(root, 'src', f), 'utf8');
  assert.ok(!/data:image|\.png|\.jpe?g|\.webp|require\(['"]\.\/assets/.test(text), `${f}: no picture files or data: URIs`);
  assert.ok(!/['"]img['"]/.test(text), `${f}: no <img>`);
}

// 4. welcome
const page = new Node('div');
let ready = 0;
const sec = renderWelcome(page, { onEnter() {}, onSkip() {}, onReady() { ready++; } });
assert.strictEqual(ready, 1, 'onReady runs once');
assert.ok(cls(sec).includes('dc-welcome') && cls(sec).includes('is-ready'));
const all = sec.all();
const text = all.map(n => n.textContent).join('|');
assert.ok(text.includes('Is Discovery Worth It?'), 'eyebrow');
assert.ok(all.some(n => n.attrs['aria-label'] === 'Welcome' && n.tagName === 'h1'), 'heading');
assert.ok(text.includes('Is Discovery worth what you pay?'), 'subtitle');
assert.ok(text.includes('Let\'s find out'), 'primary button');
const pic = all.find(n => cls(n).includes('dc-hello-art'));
assert.ok(pic && pic.getAttribute('viewBox') === '0 0 400 300' && pic.getAttribute('aria-hidden') === 'true', 'welcome picture');
for (const id of art.PRODUCTS) assert.ok(pic.all().some(n => cls(n).includes('dc-art-' + id) && cls(n).includes('dc-hello-coin')), `welcome drops a ${id} coin into the pan`);
assert.ok(pic.all().some(n => cls(n).includes('dc-hello-coin') && cls(n).includes('is-cost')), 'welcome drops the cost coin');
assert.ok(pic.all().some(n => cls(n).includes('dc-hello-tick')) && pic.all().some(n => cls(n).includes('dc-hello-ask')), 'the question at the pivot and its tick');
assert.ok(!pic.all().some(n => n.tagName === 'text' && n.textContent !== 'R'), 'the only text in the picture is the rand sign');
setTimeout(() => { assert.strictEqual(ready, 1, 'onReady still once after the timer'); console.log('art OK'); }, 200);
