'use strict';
/* The workspace view hosting the page (src/bottom-line.js). */

const { ItemView } = require('obsidian');
const { VIEW_TYPE } = require('./constants');
const { mountBottomLine } = require('./bottom-line');

class BottomLineView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
  }
  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return 'Is Discovery Worth It?'; }
  getIcon() { return 'calculator'; }

  async onOpen() {
    this.contentEl.classList.add('dc-view');
    this.ui = mountBottomLine(this.contentEl, { plugin: this.plugin });
    /* the Flows diagram measures its labels: let Nunito arrive first, but
       never wait more than a second for it */
    const fonts = this.plugin.fonts && this.plugin.fonts.load ? this.plugin.fonts.load() : null;
    if (fonts) await Promise.race([fonts.catch(() => null), new Promise(r => setTimeout(r, 1000))]);
    await this.ui.refresh();
  }

  refresh() { return this.ui ? this.ui.refresh() : Promise.resolve(); }

  async onClose() {
    if (this.ui) this.ui.destroy();
  }
}

module.exports = { BottomLineView };
