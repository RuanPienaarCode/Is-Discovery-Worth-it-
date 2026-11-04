'use strict';
/* "Report a wrong price": the link on a Compare row and on the prices
   banner. It opens a new issue on the plugin's public GitHub page, from the
   wrong-price template. The only words in the link are the product label
   and the rival's name (both are the plugin's own published data): nothing
   from the person's statements, answers or quotes. */

const ISSUES = 'https://github.com/RuanPienaarCode/Is-Discovery-Worth-it-/issues/new';

/* label: the product ("Medical aid"); name: the rival ("Sometown Health").
   Either may be left out; with neither, the template's own title is used. */
function wrongPriceUrl(label, name) {
  const title = [label, name].map(x => String(x === undefined || x === null ? '' : x).trim()).filter(Boolean).join(': ');
  const q = 'template=wrong-price.md' + (title ? '&title=' + encodeURIComponent(title).replace(/%20/g, '+') : '');
  return ISSUES + '?' + q;
}

module.exports = { wrongPriceUrl, ISSUES };
