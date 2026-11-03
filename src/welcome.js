'use strict';
/* The welcome screen: shown when the page opens, before the numbers. The
   page behind it keeps loading; "Let's find out" (or "Skip this next time")
   reveals it. The picture is the plugin's own drawing (src/art.js): a scale
   weighing what you pay against what comes back. Motion is CSS only
   (src/css/art.css) and switches itself off for anyone who asked their
   device for less (prefers-reduced-motion). */

const { el, button } = require('./dom');
const { drawMark, drawWelcomeArt } = require('./art');

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/* onEnter() reveals the page; onSkip() reveals it and stops showing this;
   onReady() runs once, after the picture is drawn, to settle the layout
   before the animation starts. */
function renderWelcome(parent, { onEnter, onSkip, onReady }) {
  const sec = el(parent, 'section', 'dc-welcome dc-hello');
  sec.setAttribute('aria-labelledby', 'dc-hello-h1');

  const copy = el(sec, 'div', 'dc-hello-copy');
  const eyebrow = el(copy, 'p', 'dc-hello-eyebrow');
  drawMark(eyebrow, 'app', 'dc-hello-mark', 18);
  el(eyebrow, 'span', null, 'Is Discovery Worth It?');
  const h1 = el(copy, 'h1', 'dc-hello-h1');
  h1.id = 'dc-hello-h1';
  h1.setAttribute('aria-label', 'Welcome');
  [...'Welcome'].forEach((ch, i) => {
    const s = el(h1, 'span', 'dc-hello-ch', ch);
    s.setAttribute('aria-hidden', 'true');
    s.style.setProperty('--i', String(i));
  });
  el(copy, 'p', 'dc-hello-sub', 'Is Discovery worth what you pay? Worked out from your own bank statements, counting only the benefits you actually use.');

  button(copy, 'dc-hello-go', 'Let\'s find out', () => {
    sec.classList.add('is-leaving');
    /* let the fade finish; straight away when motion is off */
    setTimeout(onEnter, reduced() ? 0 : 280);
  }, 'arrow-right');
  button(copy, 'dc-hello-skip', 'Skip this next time', () => onSkip());

  /* the picture holds its space from the first frame (a fixed viewBox and
     aspect ratio), so nothing moves when it starts */
  const art = el(sec, 'figure', 'dc-hello-figure');
  art.setAttribute('aria-hidden', 'true');
  drawWelcomeArt(art);

  /* the CSS holds every animation on its first frame until .is-ready, so
     it starts once the layout has settled; the timer covers a pane where
     animation frames are paused */
  let done = false;
  const ready = () => {
    if (done) return;
    done = true;
    if (onReady) onReady();
    sec.classList.add('is-ready');
  };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(ready);
  setTimeout(ready, 120);
  return sec;
}

module.exports = { renderWelcome };
