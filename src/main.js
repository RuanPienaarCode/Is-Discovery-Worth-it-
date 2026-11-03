'use strict';
const { Plugin, Notice, normalizePath } = require('obsidian');
const { VIEW_TYPE, DEFAULT_SETTINGS } = require('./constants');
const { BottomLineView } = require('./view');
const { SettingsTab } = require('./settings-tab');
const { loadBudget } = require('./load');
const { makeFontLoader } = require('./font-loader');

/* Settings merge one level deep, so a new nested default (status.drive, say)
   reaches someone whose data.json predates it. */
function mergeSettings(saved) {
  const out = { ...DEFAULT_SETTINGS, ...(saved || {}) };
  /* a window of 3 months is no longer offered (it is always "Not enough data") */
  if (!(Number(out.months) >= 6)) out.months = 6;
  for (const k of ['status', 'rates', 'actualMiles', 'travel', 'members', 'quotes', 'products', 'benefits', 'vitality', 'conditions', 'health', 'life', 'home', 'bill']) out[k] = { ...DEFAULT_SETTINGS[k], ...((saved || {})[k] || {}) };
  return out;
}

class DiscoveryWorthItPlugin extends Plugin {
  async onload() {
    this.settings = mergeSettings(await this.loadData());
    /* Nunito, carried inside main.js (src/fonts.js); the page falls back to
       the system font until it has loaded */
    this.fonts = makeFontLoader();
    this.fonts.load();
    this.registerView(VIEW_TYPE, leaf => new BottomLineView(leaf, this));
    this.addRibbonIcon('calculator', 'Is Discovery worth it?', () => this.openView());
    this.addCommand({ id: 'open', name: 'Open', callback: () => this.openView() });
    this.addSettingTab(new SettingsTab(this.app, this));
    /* Re-read when a budget note or a CSV changes — not any note in the
       vault; debounced so an import of 300 notes is one refresh, not 300. */
    const touched = f => {
      if (!f || !f.path) return;
      const inBudget = this.budgetFolder !== undefined && this.budgetFolder !== null && f.path.startsWith(this.budgetFolder ? this.budgetFolder + '/' : '');
      if (/\.csv$/i.test(f.path) || (/\.md$/i.test(f.path) && inBudget)) this.scheduleRefresh(1500);
    };
    this.registerEvent(this.app.vault.on('modify', touched));
    this.registerEvent(this.app.vault.on('create', touched));
    this.registerEvent(this.app.vault.on('delete', touched));
  }

  onunload() {
    clearTimeout(this.refreshTimer);
    if (this.fonts) this.fonts.unload();
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  /* The budget as the Budget plugin wrote it. */
  async readBudget() {
    const vault = this.app.vault;
    const files = new Map(vault.getFiles().filter(f => f.extension === 'md' || f.extension === 'csv').map(f => [f.path, f]));
    /* the folder as typed in settings, tidied the way Obsidian tidies paths
       (stray slashes, a leading slash); blank stays blank so it is searched for */
    const typed = String(this.settings.budgetFolder || '').trim();
    const folder = typed ? normalizePath(typed) : '';
    const b = await loadBudget({ paths: () => [...files.keys()], read: p => vault.cachedRead(files.get(p)), stat: p => files.get(p).stat }, folder);
    this.budgetFolder = b.folder;
    return b;
  }

  /* One refresh after a burst of changes (typing in settings, an import). */
  scheduleRefresh(ms) {
    clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => this.refreshViews(), ms || 600);
  }

  async openView() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      leaf = workspace.getLeaf('tab');
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    workspace.revealLeaf(leaf);
  }

  refreshViews() {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      if (leaf.view && leaf.view.refresh) leaf.view.refresh().catch(e => new Notice('Is Discovery Worth It: ' + e.message));
    }
  }
}

module.exports = DiscoveryWorthItPlugin;
