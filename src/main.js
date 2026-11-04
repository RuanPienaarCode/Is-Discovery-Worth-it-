'use strict';
const { Plugin, Notice, normalizePath } = require('obsidian');
const { VIEW_TYPE, DEFAULT_SETTINGS } = require('./constants');
const { BottomLineView } = require('./view');
const { SettingsTab } = require('./settings-tab');
const { loadBudget } = require('./load');
const { sampleSource, SAMPLE_FOLDER } = require('./sample');
const { enterExample, leaveExample } = require('./example');
const { saveSummary } = require('./summary-note');
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
    this.addCommand({ id: 'example', name: 'Try it with example data', callback: async () => { await this.setExample(true); await this.openView(); } });
    this.addCommand({ id: 'save-summary', name: 'Save a summary note', callback: () => this.saveSummaryFromView() });
    this.addSettingTab(new SettingsTab(this.app, this));
    /* Re-read when a budget note or a CSV changes — not any note in the
       vault; debounced so an import of 300 notes is one refresh, not 300. */
    const touched = f => {
      /* the example household never reads the vault */
      if (!f || !f.path || this.settings.sample) return;
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
    /* the example household: its own made-up files, never the vault's */
    if (this.settings.sample) return loadBudget(sampleSource(new Date()), SAMPLE_FOLDER);
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

  /* Turn the example household on or off (src/example.js). On: the person's
     own settings are stashed whole and the page shows the example. Off: they
     are put back and the page reads the vault again. */
  async setExample(on, now) {
    if (!!on === !!this.settings.sample) return;
    this.settings = mergeSettings(on ? enterExample(this.settings, now || new Date()) : leaveExample(this.settings));
    await this.saveSettings();
    this.refreshViews();
  }

  /* Write the summary text (from the page, src/summary-note.js) into the
     summary folder as a new note, open it in a new tab and say where it is.
     text is null when there is nothing to summarise. */
  async saveSummary(text, now) {
    if (!text) { new Notice('Nothing to summarise yet.'); return; }
    try {
      const path = await saveSummary(this.app.vault, this.settings.summaryFolder, now || new Date(), text);
      new Notice('Saved ' + path);
      const file = this.app.vault.getAbstractFileByPath(path);
      if (file && file.extension) await this.app.workspace.getLeaf('tab').openFile(file);
    } catch (e) {
      new Notice('Could not save the summary note: ' + (e && e.message ? e.message : e));
    }
  }

  /* The command: the page works the summary out, so open it and ask it. */
  async saveSummaryFromView() {
    if (this.settings.sample) { new Notice('That is a made-up household. Leave the example first, then save a summary of your own figures.'); return; }
    await this.openView();
    const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    const view = leaf && leaf.view;
    if (!view || !view.ui) { new Notice('Nothing to summarise yet.'); return; }
    await view.refresh();
    await this.saveSummary(view.ui.summary(), new Date());
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
