'use strict';
/* Only what has no better home on the page itself. Statuses, rates and
   actual Miles are edited on the plugin's page, beside the figure they
   change. */

const { PluginSettingTab, Setting, Notice } = require('obsidian');
const { PALETTES, paletteOf } = require('./palettes');

class SettingsTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    const s = this.plugin.settings;
    const save = async () => { await this.plugin.saveSettings(); this.plugin.scheduleRefresh(); };

    new Setting(containerEl)
      .setName('Budget folder')
      .setDesc('The folder holding the Budget plugin\'s Transactions, Accounts and Categories folders. Leave blank to find it.')
      .addText(t => t.setPlaceholder('Finances/Budget').setValue(s.budgetFolder).onChange(async v => { s.budgetFolder = v.trim(); await save(); }));

    new Setting(containerEl)
      .setName('Months to look back')
      .setDesc('Complete calendar months before this one. Six months or more gives figures you can lean on.')
      .addDropdown(d => {
        /* 3 months is left out: a window that short is always "Not enough data" */
        for (const n of [6, 12, 24]) d.addOption(String(n), `${n} months`);
        d.setValue(String(Math.max(6, Number(s.months) || 12))).onChange(async v => { s.months = Number(v); await save(); });
      });

    new Setting(containerEl)
      .setName('Not card purchases')
      .setDesc('Budget categories you pay from the card account by transfer (rent by EFT, say). They earn no Miles, so they are left out of card spend. One per line.')
      .addTextArea(t => t.setValue((s.notCardSpend || []).join('\n')).onChange(async v => {
        s.notCardSpend = v.split('\n').map(x => x.trim()).filter(Boolean);
        await save();
      }));

    new Setting(containerEl)
      .setName('Colours')
      .setDesc('The colours the page uses, in light and dark. Also on the Inputs page.')
      .addDropdown(d => {
        for (const p of PALETTES) d.addOption(p.id, p.name);
        d.setValue(paletteOf(s.palette)).onChange(async v => { s.palette = paletteOf(v); await this.plugin.saveSettings(); this.plugin.refreshViews(); });
      });

    new Setting(containerEl)
      .setName('Welcome screen')
      .setDesc('Show the welcome screen each time the page opens.')
      .addToggle(t => t.setValue(s.welcome !== false).onChange(async v => { s.welcome = v; await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName('First-time questions')
      .setDesc('Which Discovery products you have, your Discovery Bank package, your Vitality scores and the benefits you use. Run them again to change your answers; the page asks them the next time you open it.')
      .addButton(b => b.setButtonText('Run the first-time questions again').onClick(async () => {
        s.onboarded = false;
        await this.plugin.saveSettings();
        this.plugin.refreshViews();
        new Notice('Open Is Discovery Worth It to answer the questions.');
      }));

    new Setting(containerEl)
      .setName('Reset rates')
      .setDesc('Forget every rate you changed and go back to the published figures.')
      .addButton(b => {
        /* two taps: the first asks, the second resets, so a stray tap does not
           throw away every rate you typed */
        let armed = null;
        b.setButtonText('Reset').onClick(async () => {
          if (!armed) {
            b.setButtonText('Tap again to reset');
            armed = setTimeout(() => { armed = null; b.setButtonText('Reset'); }, 4000);
            return;
          }
          clearTimeout(armed);
          armed = null;
          s.rates = {};
          await save();
          b.setButtonText('Reset');
        });
      });
  }
}

module.exports = { SettingsTab };
