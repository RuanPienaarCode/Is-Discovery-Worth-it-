'use strict';
/* src/main.js in typed-numbers mode, against a fake Obsidian: readBudget
   makes the twelve typed months, reads the vault's Miles CSV but none of its
   notes, and says when a Budget-plugin budget is there too; setManual turns
   the mode on and off (keeping the typed answers, and leaving the example
   first); a Miles CSV or a budget note appearing refreshes the page, any
   other note does not. Made-up figures only. */
const assert = require('node:assert');
const Module = require('node:module');
const path = require('node:path');

const obsidian = {
  Plugin: class Plugin {}, ItemView: class ItemView {}, Modal: class Modal {}, PluginSettingTab: class PluginSettingTab {}, Setting: class Setting {},
  Notice: class Notice {}, normalizePath: p => p, setIcon: () => {},
};
const origLoad = Module._load;
Module._load = function (request, ...rest) { return request === 'obsidian' ? obsidian : origLoad.call(this, request, ...rest); };
const Plugin = require(path.join(__dirname, '../src/main.js'));
Module._load = origLoad;
const { sampleFiles, MILES_PATH, SAMPLE_FOLDER } = require('../src/sample');
const { MANUAL_FOLDER } = require('../src/manual');

function makePlugin(saved, files) {
  const p = new Plugin();
  let stored = saved;
  const list = Object.keys(files).map(k => ({ path: k, extension: k.split('.').pop(), stat: { mtime: 1, size: files[k].length } }));
  p.app = { vault: { getFiles: () => list, cachedRead: f => Promise.resolve(files[f.path]), on: (ev, cb) => { (p.handlers = p.handlers || {})[ev] = cb; return {}; } }, workspace: { getLeavesOfType: () => [] } };
  p.loadData = async () => stored;
  p.saveData = async d => { stored = JSON.parse(JSON.stringify(d)); };
  p.registerView = () => {}; p.addRibbonIcon = () => {}; p.addCommand = c => { (p.commands = p.commands || {})[c.id] = c; }; p.addSettingTab = () => {};
  p.registerEvent = () => {};
  p.fonts = { load() {}, unload() {} };
  p.refreshViews = () => { p.refreshed = (p.refreshed || 0) + 1; };
  p.scheduleRefresh = () => { p.scheduled = (p.scheduled || 0) + 1; };
  p.getStored = () => stored;
  return p;
}

(async () => {
  const now = new Date();
  const files = { ...sampleFiles(now, {}), 'Notes/Hello.md': '# hi\n' };
  const typed = { onboarded: true, dataSource: 'manual', products: { bank: false, health: true, gap: false, insure: false, life: false }, manual: { done: true, health: 4000, gym: 300 } };
  const p = makePlugin(typed, files);
  await p.onload();
  assert.ok(p.commands['type-numbers'] && p.commands['type-numbers'].name === 'Type in my numbers', 'command: Type in my numbers');
  assert.strictEqual(p.settings.manual.claims, null, 'unanswered typed numbers merge in as null');

  const b = await p.readBudget();
  assert.strictEqual(b.manual, true);
  assert.strictEqual(b.folder, MANUAL_FOLDER, 'the typed months, not the vault\'s budget');
  assert.ok(b.rows.length > 0 && b.rows.every(r => !/SOMETOWN/.test(r.description)), 'none of the vault\'s rows');
  assert.ok(b.rows.some(r => r.description === 'DISC PREM' && r.amount === -4000), 'the typed Health debit');
  assert.ok(b.miles && b.miles.files.includes(MILES_PATH), 'the vault\'s Miles statement is read');
  assert.strictEqual(b.budgetFound, SAMPLE_FOLDER, 'the Budget-plugin budget in the vault is noticed');
  assert.strictEqual(p.budgetFolder, null, 'no budget folder is watched');

  /* a vault with no budget: nothing found */
  const p0 = makePlugin(typed, { 'Notes/Hello.md': '# hi\n' });
  await p0.onload();
  assert.strictEqual((await p0.readBudget()).budgetFound, null, 'no budget: none found');

  /* the vault changing: a Miles CSV or a budget note refreshes, other notes do not */
  p.handlers.create({ path: 'Notes/Other.md' });
  assert.ok(!p.scheduled, 'an ordinary note does not refresh');
  p.handlers.create({ path: 'Money/Discovery/new.csv' });
  p.handlers.create({ path: 'Budget/Transactions/Card/2026-10.md' });
  assert.strictEqual(p.scheduled, 2, 'a CSV and a budget note do');

  /* off: the vault's budget again, the typed answers kept; on again */
  await p.setManual(false);
  assert.strictEqual(p.settings.dataSource, '');
  assert.strictEqual(p.getStored().manual.health, 4000, 'the typed answers are kept');
  const b2 = await p.readBudget();
  assert.ok(!b2.manual && b2.folder === SAMPLE_FOLDER, 'reads the Budget-plugin budget');
  await p.setManual(true);
  assert.strictEqual(p.settings.dataSource, 'manual');
  assert.ok(p.refreshed >= 2, 'each switch refreshes the page');

  /* from the example: the example is left first */
  const p2 = makePlugin({ onboarded: true }, { 'Notes/Hello.md': '# hi\n' });
  await p2.onload();
  await p2.setExample(true, now);
  assert.strictEqual(p2.settings.sample, true);
  await p2.setManual(true);
  assert.strictEqual(p2.settings.sample, false, 'the example is left');
  assert.strictEqual(p2.settings.dataSource, 'manual');
  assert.strictEqual(p2.settings.manual.done, false, 'and the questions come next');

  console.log('manual wiring OK');
})().catch(e => { console.error(e); process.exit(1); });
