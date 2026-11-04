'use strict';
/* src/main.js, the example household and the summary note, against a fake
   Obsidian: turning the example on reads the example's files and NEVER the
   vault's; the vault-change refresh does nothing while it is on; turning it
   off (even after a restart, from data.json) puts the person's own settings
   back; the summary note is written, opened in a new tab and announced; and
   with nothing to summarise only a Notice is shown. */
const assert = require('node:assert');
const Module = require('node:module');
const path = require('node:path');

const notices = [];
const obsidian = {
  Plugin: class Plugin {}, ItemView: class ItemView {}, Modal: class Modal {}, PluginSettingTab: class PluginSettingTab {}, Setting: class Setting {},
  Notice: class Notice { constructor(m) { notices.push(m); } },
  normalizePath: p => p, setIcon: () => {},
};
const origLoad = Module._load;
Module._load = function (request, ...rest) { return request === 'obsidian' ? obsidian : origLoad.call(this, request, ...rest); };
const Plugin = require(path.join(__dirname, '../src/main.js'));
Module._load = origLoad;
const { DEFAULT_SETTINGS } = require('../src/constants');

/* a vault that records every read, with one folder and one made note */
function fakeVault() {
  const made = new Map();
  const v = {
    reads: 0, made,
    getFiles() { v.reads++; return []; },
    cachedRead() { v.reads++; return Promise.resolve(''); },
    getAbstractFileByPath(p) { return made.has(p) ? { path: p, extension: 'md' } : (p === 'Notes' || p.split('/').length === 1 && v.folders.has(p) ? { path: p, children: [] } : null); },
    folders: new Set(),
    async createFolder(p) { v.folders.add(p); },
    async create(p, text) { made.set(p, text); return { path: p, extension: 'md' }; },
    handlers: {},
    on(ev, cb) { v.handlers[ev] = cb; return {}; },
  };
  return v;
}
function makePlugin(saved) {
  const p = new Plugin();
  const opened = [];
  let stored = saved;
  p.app = { vault: fakeVault(), workspace: { getLeavesOfType: () => [], getLeaf: () => ({ openFile: async f => { opened.push(f.path); } }) } };
  p.loadData = async () => stored;
  p.saveData = async d => { stored = JSON.parse(JSON.stringify(d)); };
  p.registerView = () => {}; p.addRibbonIcon = () => {}; p.addCommand = c => { (p.commands = p.commands || {})[c.id] = c; }; p.addSettingTab = () => {};
  p.registerEvent = () => {};
  p.refreshViews = () => { p.refreshed = (p.refreshed || 0) + 1; };
  p.getStored = () => stored;
  p.opened = opened;
  return p;
}

(async () => {
  /* commands exist */
  const p = makePlugin({ onboarded: true, palette: 'onyx', budgetFolder: 'Zed/Money', status: { money: 'Gold' } });
  p.fonts = { load() {}, unload() {} };
  await p.onload();
  assert.ok(p.commands.example && p.commands.example.name === 'Try it with example data', 'command: Try it with example data');
  assert.ok(p.commands['save-summary'] && p.commands['save-summary'].name === 'Save a summary note', 'command: Save a summary note');
  assert.strictEqual(p.settings.summaryFolder, 'Is Discovery Worth It', 'summaryFolder default');
  assert.strictEqual(p.settings.sample, false);

  /* on: the example's files, never the vault's */
  const real = JSON.parse(JSON.stringify(p.settings));
  await p.setExample(true, new Date(2026, 10, 3));
  assert.strictEqual(p.settings.sample, true);
  assert.strictEqual(p.settings.palette, 'onyx', 'the look is kept');
  assert.strictEqual(p.refreshed, 1, 'the views refresh');
  const b = await p.readBudget();
  assert.ok(b.rows.length > 100 && b.folder === 'Money/Budget', 'the example budget is read');
  assert.strictEqual(p.app.vault.reads, 0, 'the vault was never read while the example is on');
  assert.strictEqual(p.getStored().sample, true, 'saved in data.json');
  assert.ok(p.getStored().realSettings && p.getStored().realSettings.budgetFolder === 'Zed/Money', 'the real settings are stashed in data.json');

  /* a note changing in the vault does not refresh the example */
  let scheduled = 0;
  p.scheduleRefresh = () => { scheduled++; };
  p.budgetFolder = 'Zed/Money';
  p.app.vault.handlers.modify({ path: 'Zed/Money/Transactions/Card/2026-10.md' });
  assert.strictEqual(scheduled, 0, 'the vault-change refresh does nothing while the example is on');

  /* a restart in the example: saved settings load as the example, and leave cleanly */
  const q = makePlugin(p.getStored());
  q.fonts = { load() {}, unload() {} };
  await q.onload();
  assert.strictEqual(q.settings.sample, true);
  await q.setExample(false);
  assert.strictEqual(q.settings.sample, false);
  assert.strictEqual(q.settings.realSettings, null);
  assert.strictEqual(q.settings.budgetFolder, 'Zed/Money');
  assert.strictEqual(q.settings.status.money, 'Gold');
  assert.strictEqual(q.settings.onboarded, true);
  assert.strictEqual(q.getStored().sample, false);

  /* off: the real settings, and the vault is read again */
  await p.setExample(false);
  assert.deepStrictEqual({ ...p.settings, tab: undefined }, { ...real, tab: undefined }, 'off restores the settings exactly');
  await p.readBudget();
  assert.ok(p.app.vault.reads > 0, 'the vault is read again once the example is off');
  p.budgetFolder = 'Zed/Money';
  p.app.vault.handlers.modify({ path: 'Zed/Money/Transactions/Card/2026-10.md' });
  assert.strictEqual(scheduled, 1, 'and a changed budget note refreshes again');

  /* the summary note */
  notices.length = 0;
  await p.saveSummary(null, new Date(2026, 10, 3));
  assert.deepStrictEqual(notices, ['Nothing to summarise yet.'], 'nothing to summarise: a Notice, no note');
  assert.strictEqual(p.app.vault.made.size, 0);
  notices.length = 0;
  p.settings.summaryFolder = ' Records/Discovery ';
  await p.saveSummary('# hi', new Date(2026, 10, 3));
  assert.deepStrictEqual([...p.app.vault.made.keys()], ['Records/Discovery/Summary 2026-11-03.md']);
  assert.deepStrictEqual(notices, ['Saved Records/Discovery/Summary 2026-11-03.md']);
  assert.deepStrictEqual(p.opened, ['Records/Discovery/Summary 2026-11-03.md'], 'opened in a new tab');
  await p.saveSummary('# again', new Date(2026, 10, 3));
  assert.ok(p.app.vault.made.has('Records/Discovery/Summary 2026-11-03 2.md'), 'never overwrites');

  /* the example's figures are never written to the vault */
  await p.setExample(true);
  notices.length = 0;
  await p.saveSummaryFromView();
  assert.ok(/made-up/.test(notices[0]), 'in the example the command refuses: ' + notices[0]);
  assert.strictEqual(p.app.vault.made.size, 2);

  console.log('plugin-wiring OK');
})().catch(e => { console.error(e); process.exit(1); });
