'use strict';
/* "Type in my numbers" (src/manual-form.js) on a fake DOM: one question per
   screen; only the questions the ticked products need; nothing ticked and
   no bank product are refused with a plain line; a typed amount it cannot
   read is refused and that field marked, never stored; blank is stored as
   null (not counted); every Next saves; Back keeps what was typed; Done sets
   manual.done and calls onDone; "Not now" calls onLeave. Made-up figures. */
const assert = require('node:assert');
const Module = require('node:module');

const origLoad = Module._load;
Module._load = function (request, ...rest) { return request === 'obsidian' ? { setIcon: () => {} } : origLoad.call(this, request, ...rest); };
const { renderManualForm } = require('../src/manual-form');
Module._load = origLoad;
const { DEFAULT_SETTINGS } = require('../src/constants');

/* ── a small DOM: enough for el/button/checkRow/radioGroup ─────────── */
class Node {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase(); this.nodeType = 1; this.childNodes = []; this.parentNode = null;
    this.attrs = {}; this.listeners = {}; this.className = ''; this.hidden = false; this.value = ''; this.checked = false; this.disabled = false; this._text = '';
    const self = this;
    this.classList = {
      add: (...c) => { for (const x of c) if (!self.classList.contains(x)) self.className = (self.className + ' ' + x).trim(); },
      remove: (...c) => { self.className = self.className.split(/\s+/).filter(x => !c.includes(x)).join(' '); },
      toggle: (c, on) => { const has = self.classList.contains(c); const want = on === undefined ? !has : !!on; if (want && !has) self.classList.add(c); if (!want && has) self.classList.remove(c); return want; },
      contains: c => (' ' + self.className + ' ').includes(' ' + c + ' '),
    };
  }
  get firstChild() { return this.childNodes[0] || null; }
  appendChild(n) { n.parentNode = this; this.childNodes.push(n); return n; }
  removeChild(n) { this.childNodes = this.childNodes.filter(x => x !== n); n.parentNode = null; return n; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; }
  removeAttribute(k) { delete this.attrs[k]; }
  addEventListener(t, f) { (this.listeners[t] || (this.listeners[t] = [])).push(f); }
  fire(t, extra) { for (const f of this.listeners[t] || []) f(Object.assign({ preventDefault() {}, target: this }, extra || {})); }
  focus() { focused = this; }
  /* only the one selector the form uses: input[data-key="…"] */
  querySelector(sel) {
    const m = /^input\[data-key="([^"]+)"\]$/.exec(sel);
    const walk = n => { for (const c of n.childNodes) { if (m && c.tagName === 'INPUT' && c.getAttribute('data-key') === m[1]) return c; const f = walk(c); if (f) return f; } return null; };
    return walk(this);
  }
  set textContent(t) { this.childNodes = []; this._text = String(t); }
  get textContent() { return this._text + this.childNodes.map(c => c.textContent).join(' '); }
}
let focused = null;
global.document = { createElement: t => new Node(t) };
global.matchMedia = () => ({ matches: true });

const all = (n, test, out = []) => { if (test(n)) out.push(n); for (const c of n.childNodes) all(c, test, out); return out; };
const byClass = (n, c) => all(n, x => x.classList.contains(c));
const one = (n, c) => byClass(n, c)[0];
const tick = n => { n.checked = !n.checked; n.fire('change'); };
const radio = (root, v) => { const i = all(root, x => x.tagName === 'INPUT' && x.type === 'radio' && x.value === v)[0]; assert.ok(i, `a radio for ${v}`); i.checked = true; i.fire('change'); };
const field = (root, key) => all(root, x => x.tagName === 'INPUT' && x.getAttribute('data-key') === key)[0];
const type = (root, key, v) => { const i = field(root, key); assert.ok(i, `a field for ${key}`); i.value = v; i.fire('input'); };
const step = root => one(root, 'dc-onb-card').getAttribute('data-step');
const error = root => { const e = one(root, 'dc-onb-error'); return e ? e.textContent.trim() : ''; };
const settle = () => new Promise(r => setImmediate(r));
async function next(root) { one(root, 'is-primary').fire('click'); await settle(); await settle(); }
async function back(root) { byClass(root, 'is-quiet')[0].fire('click'); await settle(); }

(async () => {
  /* ── every product, a Suite ─────────────────────────────────────── */
  const settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  settings.dataSource = 'manual';
  let saves = 0, done = 0, left = 0;
  const root = renderManualForm(new Node('div'), { settings, save: async () => { saves++; }, onDone: () => { done++; }, onLeave: () => { left++; } });
  assert.strictEqual(step(root), 'products', 'starts with the products');
  assert.strictEqual(byClass(root, 'dc-onb-h').length, 1, 'one question on the screen');
  await next(root);
  assert.strictEqual(step(root), 'products', 'nothing ticked: stays');
  assert.match(error(root), /Tick at least one/);
  assert.strictEqual(saves, 0, 'nothing saved for a refused screen');
  for (const box of all(root, x => x.tagName === 'INPUT' && x.type === 'checkbox')) tick(box);
  await next(root);
  assert.deepStrictEqual(settings.products, { bank: true, health: true, gap: true, insure: true, life: true }, 'the products are kept');
  assert.strictEqual(saves, 1, 'Next saves');
  assert.strictEqual(step(root), 'bankKind');
  await next(root);
  assert.match(error(root), /Choose what you have/, 'the bank product must be chosen');
  radio(root, 'suite');
  await next(root);
  assert.strictEqual(settings.bankKind, 'suite');
  assert.strictEqual(step(root), 'tier');
  radio(root, 'Gold');
  await next(root);
  assert.strictEqual(settings.suite, 'Gold');
  assert.strictEqual(settings.suiteAnswered, true);

  /* fees: the published fee is the default and says how much */
  assert.strictEqual(step(root), 'fees');
  assert.ok(/R\s250 a month for the Gold Suite/.test(root.textContent), 'the published Gold Suite fee is shown');
  assert.ok(!field(root, 'fees'), 'no amount field until "I will type what I pay"');
  radio(root, 'typed');
  type(root, 'fees', 'lots');
  await next(root);
  assert.strictEqual(step(root), 'fees', 'an amount it cannot read: stays');
  assert.match(error(root), /Fees a month: type an amount in rands/);
  assert.strictEqual(field(root, 'fees').getAttribute('aria-invalid'), 'true', 'the field is marked');
  assert.ok(focused === field(root, 'fees'), 'and focused');
  type(root, 'fees', '1 234,50');
  await next(root);
  assert.strictEqual(settings.manual.feesHow, 'typed');
  assert.strictEqual(settings.manual.fees, 1234.5, 'South African typing: "1 234,50"');

  /* the money screens, in order; blank is null */
  const answers = {
    cardSpend: { cardSpend: 'R 9 000' }, groceries: { checkers: '2000', woolworths: '', pnp: '500' }, pharmacy: { clicks: '300', dischem: '' },
    fuel: { fuel: '1500' }, interest: { interest: '' }, health: { health: '5800' }, claims: { claims: '1200' }, gym: { gym: '-5' },
  };
  for (const id of ['cardSpend', 'groceries', 'pharmacy', 'fuel', 'interest', 'health', 'claims', 'gym']) {
    assert.strictEqual(step(root), id, `then ${id}`);
    assert.ok(/Where to find it: /.test(root.textContent), `${id}: where to find it`);
    assert.ok(/A blank answer is not counted/.test(root.textContent), `${id}: a blank is not counted`);
    for (const [k, v] of Object.entries(answers[id])) type(root, k, v);
    await next(root);
  }
  assert.strictEqual(step(root), 'gym', 'a negative amount is refused');
  assert.match(error(root), /Gym a month: type an amount/);
  type(root, 'gym', '');
  await next(root);
  assert.strictEqual(settings.manual.gym, null, 'blank gym: not counted');
  assert.strictEqual(settings.manual.cardSpend, 9000);
  assert.strictEqual(settings.manual.woolworths, null);
  assert.strictEqual(settings.manual.interest, null);
  assert.strictEqual(settings.manual.health, 5800);

  /* Back keeps what was typed */
  assert.strictEqual(step(root), 'flights');
  await back(root);
  assert.strictEqual(step(root), 'gym');
  await back(root);
  assert.strictEqual(field(root, 'claims').value, '1200', 'Back shows the answer again');
  await next(root); await next(root);
  type(root, 'flights', '3000');
  await next(root);

  /* gap cover, with its tick */
  assert.strictEqual(step(root), 'gap');
  type(root, 'gap', '200');
  tick(all(one(root, 'dc-man-tick'), x => x.tagName === 'INPUT')[0]);
  await next(root);
  assert.strictEqual(settings.manual.gapInHealth, true);
  assert.strictEqual(settings.bill.gap, 200, 'gap inside the Health debit: bill.gap follows');
  type(root, 'insure', '1100'); await next(root);
  type(root, 'life', '500'); await next(root);
  assert.strictEqual(step(root), 'done');
  assert.ok(/You typed 12 of 16 amounts/.test(root.textContent), `the done screen counts the answers (${root.textContent.match(/You typed[^.]*/)})`);
  assert.strictEqual(settings.manual.done, false, 'not done until Done');
  const before = saves;
  await next(root);
  assert.strictEqual(settings.manual.done, true, 'Done sets manual.done');
  assert.strictEqual(done, 1, 'and calls onDone');
  assert.ok(saves > before, 'and saves');

  /* ── Health only: none of the bank's questions ──────────────────── */
  const s2 = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  const r2 = renderManualForm(new Node('div'), { settings: s2, save: async () => {}, onDone: () => {}, onLeave: () => { left++; } });
  const boxes = all(r2, x => x.tagName === 'INPUT' && x.type === 'checkbox');
  tick(boxes[1]);
  await next(r2);
  const seen = [];
  while (step(r2) !== 'done' && seen.length < 20) { seen.push(step(r2)); await next(r2); }
  assert.deepStrictEqual(seen, ['groceries', 'pharmacy', 'health', 'claims', 'gym', 'flights'], 'Health asks only its own');
  for (const k of ['checkers', 'health', 'gym', 'flights']) assert.strictEqual(s2.manual[k], null, `${k} left blank: null`);

  /* ── "Not now" ──────────────────────────────────────────────────── */
  one(r2, 'dc-onb-skip').fire('click');
  assert.strictEqual(left, 1, '"Not now" calls onLeave');

  delete global.document; delete global.matchMedia;
  console.log('manual-form: flow OK');
})().catch(e => { console.error(e); process.exit(1); });
