'use strict';
/* The community directory's manifest rules (docs.obsidian.md/Reference/Manifest):
   name — Basic Latin, no punctuation except hyphens, plus signs and
   parentheses, no emoji, never "Obsidian" (or Obsi-/-sidian), never "Plugin";
   id — lowercase letters and hyphens only, no "obsidian", not ending in
   "plugin"; description — at most 250 characters, ends with a period, no
   "Obsidian". The directory rejected "Is Discovery Worth It?" for its "?". */
const assert = require('node:assert');
const m = require('../manifest.json');

assert.match(m.name, /^[A-Za-z0-9 +()-]+$/, `name "${m.name}": only letters, digits, spaces, hyphens, plus signs and parentheses`);
assert.ok(!/obsi|sidian/i.test(m.name), 'name must not contain Obsidian or Obsi-/-sidian');
assert.ok(!/plugin/i.test(m.name), 'name must not contain "Plugin"');
assert.match(m.id, /^[a-z-]+$/, 'id: lowercase letters and hyphens only');
assert.ok(!/obsidian/.test(m.id) && !/plugin$/.test(m.id), 'id must not contain obsidian or end with plugin');
assert.ok(m.description.length <= 250, 'description at most 250 characters');
assert.ok(m.description.endsWith('.'), 'description ends with a period');
assert.ok(!/obsidian/i.test(m.description), 'description must not contain Obsidian');
console.log('manifest OK');
