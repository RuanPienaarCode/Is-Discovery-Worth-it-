'use strict';
/* Seam 5 — bundle-safety gates for the real mobile floor (iOS 15 WebKit):
   1. no lookbehind regex literals in src/;  2. no Node APIs in src/;
   3. no innerHTML / outerHTML / insertAdjacentHTML;  4. the built main.js
   (when present) evaluates against obsidian + CodeMirror stubs and exports
   a Plugin subclass. */
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const root = path.join(__dirname, '..');
const srcDir = path.join(root, 'src');
const NODE_REQUIRES = /require\(\s*['"](?:node:)?(fs|path|os|child_process|crypto|http|https|net|electron)['"]\s*\)/;

const jsFiles = (dir, rel = '') => fs.readdirSync(dir, { withFileTypes: true }).flatMap(d =>
  d.isDirectory() ? jsFiles(path.join(dir, d.name), rel + d.name + '/') : d.name.endsWith('.js') ? [rel + d.name] : []);
for (const f of jsFiles(srcDir)) {
  const text = fs.readFileSync(path.join(srcDir, f), 'utf8');
  assert.ok(!text.includes('(?<'), `${f}: lookbehind/named-group regex literal — iOS 15 fatal`);
  assert.ok(!NODE_REQUIRES.test(text), `${f}: Node API require — mobile fatal`);
  assert.ok(!/\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML/.test(text), `${f}: HTML string injection — build DOM instead`);
}

const bundlePath = path.join(root, 'main.js');
if (fs.existsSync(bundlePath)) {
  class Base {}
  const obsidian = {
    Plugin: class Plugin {}, ItemView: class ItemView {}, MarkdownView: class MarkdownView {}, Modal: class Modal {},
    Setting: class Setting {}, PluginSettingTab: class PluginSettingTab {}, Notice: class Notice {}, Menu: class Menu {},
    TFile: class TFile {}, TFolder: class TFolder {}, Platform: { isMobile: false },
    normalizePath: p => p, setIcon: () => {}, debounce: f => f,
  };
  const cmView = {
    ViewPlugin: { fromClass: () => ({}) }, Decoration: { mark: () => ({ range: () => ({}) }), set: () => ({}), none: {} },
    EditorView: Object.assign(Base, { domEventHandlers: () => ({}) }), WidgetType: Base,
  };
  const cmState = { RangeSetBuilder: class { add() {} finish() { return {}; } } };
  const origLoad = Module._load;
  Module._load = function (request, ...rest) {
    if (request === 'obsidian') return obsidian;
    if (request === '@codemirror/view') return cmView;
    if (request === '@codemirror/state') return cmState;
    return origLoad.call(this, request, ...rest);
  };
  try {
    const text = fs.readFileSync(bundlePath, 'utf8');
    assert.ok(!text.includes('(?<'), 'main.js: lookbehind survived into the bundle');
    delete require.cache[bundlePath];
    const exported = require(bundlePath);
    assert.strictEqual(typeof exported, 'function', 'bundle must export the plugin class');
    assert.ok(exported.prototype instanceof obsidian.Plugin, 'export must extend obsidian.Plugin');
  } finally {
    Module._load = origLoad;
  }
  console.log('ios hazards OK (bundle evaluated)');
} else {
  console.log('ios hazards OK (src only — main.js not built yet)');
}
