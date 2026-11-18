'use strict';
/* src/main.js and the Latest tab, against a fake Obsidian: readOffers reads
   only notes under the offers folder that say discovery: offer, counts the
   Inbox (not Inbox/Done), and in example mode returns the made-up offers
   without reading the vault; "Used it" / "Show again" write the note's own
   state field; a change in the offers folder refreshes the page; the
   people list is never the default's own array. And the made-up offers
   fill every group for the example household. */
const assert = require('node:assert');
const Module = require('node:module');
const path = require('node:path');

const obsidian = {
  Plugin: class Plugin {}, ItemView: class ItemView {}, Modal: class Modal {}, PluginSettingTab: class PluginSettingTab {}, Setting: class Setting {},
  Notice: class Notice {}, normalizePath: p => String(p).replace(/^\/+|\/+$/g, ''), setIcon: () => {},
};
const origLoad = Module._load;
Module._load = function (request, ...rest) { return request === 'obsidian' ? obsidian : origLoad.call(this, request, ...rest); };
const Plugin = require(path.join(__dirname, '../src/main.js'));
Module._load = origLoad;
const { DEFAULT_SETTINGS } = require('../src/constants');
const { sampleSettings } = require('../src/sample');
const { sampleOffers, sampleOfferNotes } = require('../src/sample-offers');
const { householdOf, buildLatest } = require('../src/offers');

function makePlugin(saved, files) {
  const p = new Plugin();
  let stored = saved;
  const list = Object.keys(files).map(k => ({ path: k, extension: k.split('.').pop(), stat: { mtime: 1, size: 1 } }));
  const fms = new Map(Object.entries(files).map(([k, v]) => [k, v && typeof v === 'object' ? { ...v } : null]));
  p.vaultReads = 0;
  p.app = {
    vault: {
      getFiles: () => { p.vaultReads++; return list; },
      getAbstractFileByPath: k => list.find(f => f.path === k) || null,
      cachedRead: () => Promise.resolve(''),
      on: (ev, cb) => { (p.handlers = p.handlers || {})[ev] = cb; return {}; },
    },
    metadataCache: {
      getFileCache: f => (fms.get(f.path) ? { frontmatter: fms.get(f.path) } : {}),
      on: (ev, cb) => { (p.cacheHandlers = p.cacheHandlers || {})[ev] = cb; return {}; },
    },
    fileManager: { processFrontMatter: async (f, fn) => { const fm = fms.get(f.path); fn(fm); p.written = { path: f.path, fm: { ...fm } }; } },
    workspace: { getLeavesOfType: () => [] },
  };
  p.loadData = async () => stored;
  p.saveData = async d => { stored = JSON.parse(JSON.stringify(d)); };
  p.registerView = () => {}; p.addRibbonIcon = () => {}; p.addCommand = () => {}; p.addSettingTab = () => {};
  p.registerEvent = () => {};
  p.fonts = { load() {}, unload() {} };
  p.scheduleRefresh = () => { p.scheduled = (p.scheduled || 0) + 1; };
  return p;
}

(async () => {
  const files = {
    'Money/Offers/A.md': { discovery: 'offer', title: 'A', ends: '2099-01-01' },
    'Money/Offers/Sub/B.md': { discovery: 'offer', title: 'B', state: 'used' },
    'Money/Offers/Offers index.md': { title: 'Not an offer' },
    'Money/Offers/Inbox/email.pdf': null,
    'Money/Offers/Inbox/shot.png': null,
    'Money/Offers/Inbox/Done/old.pdf': null,
    'Money/Offers/Inbox/C.md': { discovery: 'offer', title: 'Waiting in the Inbox, not an offer yet' },
    'Elsewhere/D.md': { discovery: 'offer', title: 'Outside the folder' },
  };
  const p = makePlugin({ offersFolder: '/Money/Offers/' }, files);
  await p.onload();
  assert.deepStrictEqual(p.settings.people, []);
  assert.notStrictEqual(p.settings.people, DEFAULT_SETTINGS.people, 'not the default\'s own array');

  const r = await p.readOffers();
  assert.strictEqual(r.folder, 'Money/Offers');
  assert.deepStrictEqual(r.offers.map(o => o.title).sort(), ['A', 'B']);
  assert.strictEqual(r.inbox, 3, 'two files and a note wait in the Inbox; Done is not counted');
  assert.strictEqual(r.example, false);

  /* Used it, then Show again: the note's own state */
  await p.setOfferState('Money/Offers/A.md', 'used');
  assert.deepStrictEqual(p.written, { path: 'Money/Offers/A.md', fm: { discovery: 'offer', title: 'A', ends: '2099-01-01', state: 'used' } });
  await p.setOfferState('Money/Offers/A.md', '');
  assert.strictEqual('state' in p.written.fm, false);

  /* a change in the offers folder refreshes; elsewhere it does not */
  p.handlers.create({ path: 'Notes/Other.md' });
  assert.ok(!p.scheduled);
  p.handlers.create({ path: 'Money/Offers/Inbox/new.pdf' });
  p.cacheHandlers.changed({ path: 'Money/Offers/A.md' });
  p.handlers.rename({ path: 'Elsewhere/A.md' }, 'Money/Offers/A.md');
  assert.strictEqual(p.scheduled, 3);

  /* a blank folder: nothing read, nothing counted */
  const p2 = makePlugin({ offersFolder: '  ' }, files);
  await p2.onload();
  assert.deepStrictEqual(await p2.readOffers(), { folder: '', offers: [], inbox: null, example: false });

  /* the example household: made-up offers, the vault not read */
  const p3 = makePlugin({ sample: true, offersFolder: 'Money/Offers' }, files);
  await p3.onload();
  const before = p3.vaultReads;
  const ex = await p3.readOffers();
  assert.strictEqual(p3.vaultReads, before, 'example mode never reads the vault');
  assert.strictEqual(ex.example, true);
  assert.ok(ex.offers.length >= 6);

  /* the made-up offers: every note parses cleanly, nothing real in them,
     and the example household sees every group */
  const now = new Date(2026, 10, 18);
  const notes = sampleOfferNotes(now);
  const offers = sampleOffers(now);
  assert.strictEqual(offers.length, notes.length);
  for (const o of offers) assert.deepStrictEqual(o.problems, [], o.title);
  for (const n of notes) for (const v of [].concat(n.fm.partner || [])) assert.ok(/Sometown/.test(v), 'made-up partner: ' + v);
  const s = sampleSettings(now);
  const house = householdOf({ eff: s, products: s.products, vitality: s.vitality });
  assert.deepStrictEqual(house.map(x => x.name), ['You', 'Sam', 'Robin']);
  const L = buildLatest(offers, house, '2026-11-18');
  for (const g of ['on', 'soon', 'always', 'notForUs', 'ended']) assert.ok(L[g].length > 0, 'example fills ' + g);

  console.log('offers wiring ok');
})().catch(e => { console.error(e); process.exit(1); });
