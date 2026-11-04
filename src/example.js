'use strict';
/* Example mode: the made-up Sometown household (src/sample.js) shown in
   place of the person's own budget, so someone with no budget yet (or
   someone who wants to see the page work) can look around.

   The person's own answers are never mixed with the example's. Going in,
   the real settings are stashed whole inside the example settings
   (settings.realSettings, so they are saved in data.json and a restart in
   example mode can still leave cleanly); coming out, they are put back
   exactly as they were. While it is on, the example's own files are read
   and the vault's files are not (main.js readBudget).

   Pure: no DOM, no Obsidian; node-testable. */

const { sampleSettings } = require('./sample');

/* what the look of the page keeps when the example goes on */
const KEEP = ['palette', 'period', 'welcome'];
const copy = o => JSON.parse(JSON.stringify(o));

/* real settings → the example's settings, with the real ones stashed in
   realSettings. Already in example mode: returned unchanged. */
function enterExample(real, now) {
  if (real && real.sample) return real;
  const stash = copy(real || {});
  delete stash.sample;
  delete stash.realSettings;
  const out = { ...sampleSettings(now || new Date()), sample: true, realSettings: stash, tab: 'overview' };
  for (const k of KEEP) if (real && real[k] !== undefined) out[k] = real[k];
  return out;
}

/* example settings → the stashed real settings, example mode off. With no
   stash (data.json edited by hand) the answer is an empty object, which
   the caller merges onto the defaults. */
function leaveExample(current) {
  const stash = current && current.realSettings && typeof current.realSettings === 'object' ? copy(current.realSettings) : {};
  return { ...stash, sample: false, realSettings: null };
}

module.exports = { enterExample, leaveExample, KEEP };
