'use strict';
/* The colour palettes the page can wear. The first is the page as it has
   always looked (Discovery's colours, src/styles.css) and is the default;
   each other one is a class on .dc-page (dc-pal dc-pal-<id>) whose tokens
   live in src/css/palettes.css, light and dark. Colour only: layout, type,
   spacing and words are the same in every palette.
   tests/palettes.test.cjs checks every palette here has both token sets and
   that every text and shape pair passes WCAG AA. */

const PALETTES = [
  { id: 'discovery', name: 'Current colours', blurb: 'Discovery navy, sky blue and pink.' },
  { id: 'sunrise', name: 'Sunrise', blurb: 'Bright and friendly: warm cream and tangerine.' },
  { id: 'meadow', name: 'Meadow', blurb: 'Bright and friendly: fresh greens and sky blue.' },
  { id: 'onyx', name: 'Onyx and gold', blurb: 'Premium and dark: near-black and warm gold.' },
  { id: 'plum', name: 'Plum', blurb: 'Premium and dark: deep aubergine and soft lilac.' },
  { id: 'graphite', name: 'Graphite', blurb: 'Clean and minimal: black, white and grey with one blue.' },
];

const DEFAULT_PALETTE = 'discovery';

/* a saved id that is no longer offered falls back to the default */
const paletteOf = id => (PALETTES.some(p => p.id === id) ? id : DEFAULT_PALETTE);

/* Put the palette's classes on the page (and take any other off). */
function applyPalette(page, id) {
  const want = paletteOf(id);
  for (const p of PALETTES) {
    const on = p.id === want && want !== DEFAULT_PALETTE;
    if (page.classList.contains('dc-pal-' + p.id) !== on) page.classList.toggle('dc-pal-' + p.id, on);
  }
  const any = want !== DEFAULT_PALETTE;
  if (page.classList.contains('dc-pal') !== any) page.classList.toggle('dc-pal', any);
}

module.exports = { PALETTES, DEFAULT_PALETTE, paletteOf, applyPalette };
