'use strict';
/* Discovery's marks, from assets/logos (embedded as data: URIs by
   scripts/build-assets.mjs). They sit in the page header and in each
   product's tab and heading — never in the data. */

const ASSETS = require('./assets');
const { el } = require('./dom');

/* A logo by its key in assets/logos. */
function brandLogo(parent, key, cls) {
  const box = el(parent, 'span', 'dc-logo' + (cls ? ' ' + cls : ''));
  box.setAttribute('aria-hidden', 'true');
  const img = el(box, 'img');
  img.src = ASSETS.logos[key] || ASSETS.logos.discovery;
  img.alt = '';
  img.decoding = 'async';
  return box;
}

/* Each product's own mark: the bank, the medical aid and Insure have their
   own Discovery icons; gap cover and Life use the main Discovery app icon. */
const PRODUCT_BRAND = { bank: 'discoverybank', health: 'discoveryhealth', insure: 'discoveryinsure', gap: 'discoveryapp', life: 'discoveryapp' };
function productLogo(parent, id) {
  const img = el(parent, 'img', 'dc-tile-logo');
  img.src = ASSETS.logos[PRODUCT_BRAND[id]] || ASSETS.logos.discovery;
  img.alt = '';
  img.decoding = 'async';
  return img;
}

module.exports = { brandLogo, productLogo };
