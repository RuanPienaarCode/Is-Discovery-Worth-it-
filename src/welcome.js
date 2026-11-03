'use strict';
/* The welcome screen: shown when the page opens, before the numbers. The
   page behind it keeps loading; "See the bottom line" (or "Skip this next
   time") reveals it. Motion is CSS only and switches itself off for anyone
   who asked their device for less (prefers-reduced-motion). */

const { el, icon, button } = require('./dom');
const ASSETS = require('./assets');

const ALT = 'The Discovery Vitality gameboard on two phones, with a Vitality coffee cup, reward coins and a gold Discovery Miles D';
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Natural sizes, so each picture holds its space before it has decoded — a
   picture that arrives late must not move anything. */
const SIZE = { art: [760, 650], round: [128, 128], vitality: [420, 280], miles: [420, 152] };

/* onEnter() reveals the page; onSkip() reveals it and stops showing this;
   onReady() runs once the pictures are decoded, to settle the layout before
   the animation starts. */
function renderWelcome(parent, { onEnter, onSkip, onReady }) {
  const sec = el(parent, 'section', 'dc-welcome');
  sec.setAttribute('aria-labelledby', 'dc-wl-h1');

  const copy = el(sec, 'div', 'dc-wl-copy');
  el(copy, 'p', 'dc-wl-eyebrow', 'Discovery Calculator');
  const h1 = el(copy, 'h1', 'dc-wl-h1');
  h1.id = 'dc-wl-h1';
  h1.setAttribute('aria-label', 'Welcome');
  [...'Welcome'].forEach((ch, i) => {
    const s = el(h1, 'span', 'dc-wl-ch', ch);
    s.setAttribute('aria-hidden', 'true');
    s.style.setProperty('--i', String(i));
  });
  el(copy, 'p', 'dc-wl-sub', 'Stay with Discovery, or switch? Your own statements, worked out to the rand.');

  const logos = el(copy, 'div', 'dc-wl-logos');
  logos.setAttribute('aria-hidden', 'true');
  [[ASSETS.logos.discovery, 'is-round', SIZE.round], [ASSETS.vitality, 'is-wide', SIZE.vitality], [ASSETS.miles, 'is-wide', SIZE.miles]].forEach(([src, cls, size], i) => {
    const chip = el(logos, 'span', 'dc-wl-chip ' + cls);
    chip.style.setProperty('--i', String(i));
    const img = el(chip, 'img');
    [img.width, img.height] = size;
    img.src = src;
    img.alt = '';
  });

  button(copy, 'dc-wl-go', 'See the bottom line', () => {
    sec.classList.add('is-leaving');
    /* let the fade finish; straight away when motion is off */
    setTimeout(onEnter, reduced() ? 0 : 280);
  }, 'arrow-right');
  button(copy, 'dc-wl-skip', 'Skip this next time', () => onSkip());

  const art = el(sec, 'figure', 'dc-wl-art');
  const img = el(art, 'img');
  [img.width, img.height] = SIZE.art;
  img.src = ASSETS.welcome;
  img.alt = ALT;

  /* nothing moves until every picture is decoded and the layout has settled
     (the CSS holds the animation until .is-ready); a slow decode cannot hold
     the screen back for long */
  let done = false;
  const ready = () => {
    if (done) return;
    done = true;
    if (onReady) onReady();
    requestAnimationFrame(() => sec.classList.add('is-ready'));
  };
  Promise.all([...sec.querySelectorAll('img')].map(i => (i.decode ? i.decode().catch(() => {}) : null))).then(ready);
  setTimeout(ready, 1500);
  return sec;
}

module.exports = { renderWelcome };
