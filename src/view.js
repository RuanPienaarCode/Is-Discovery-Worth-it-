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
    await this.ui.refresh();
  }

  refresh() { return this.ui ? this.ui.refresh() : Promise.resolve(); }

  async onClose() {
    if (this.ui) this.ui.destroy();
  }
}

module.exports = { BottomLineView };
