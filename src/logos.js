'use strict';
/* The marks beside the page title and in each product's tab, tile and
   heading. They are the plugin's own drawings (src/art.js), never any
   company's logo. */

const { el } = require('./dom');
const { drawMark } = require('./art');

/* A mark by key, in a dc-logo box. 'discovery' (or 'app') is the app's own
   balance scale; any art.js mark name works too (bank, health, gap, insure,
   life, rewards, miles). */
const BRAND = { discovery: 'app', vitality: 'rewards' };
function brandLogo(parent, key, cls) {
  const box = el(parent, 'span', 'dc-logo' + (cls ? ' ' + cls : ''));
  box.setAttribute('aria-hidden', 'true');
  drawMark(box, BRAND[key] || key, null, 20);
  return box;
}

/* A product's own mark (id: bank | health | gap | insure | life), as an
   <svg class="dc-tile-logo"> placed straight in the parent. */
function productLogo(parent, id) {
  return drawMark(parent, id, 'dc-tile-logo', 18);
}

module.exports = { brandLogo, productLogo };
