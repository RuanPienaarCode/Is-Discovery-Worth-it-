'use strict';
/* The welcome screen: shown when the page opens, before the numbers. The
   page behind it keeps loading; "Let's find out" (or "Do not show this
   again") reveals it. It also says what the first questions are for, so the
   questions do not open with a second introduction (onboarding.js asks
   welcomeWasShown()). The picture is the plugin's own drawing (src/art.js): a scale
   weighing what you pay against what comes back. Motion is CSS only
   (src/css/art.css) and switches itself off for anyone who asked their
   device for less (prefers-reduced-motion). */

const { el, icon, button } = require('./dom');
const { drawMark, drawWelcomeArt } = require('./art');
const { NOTICE_LINE, noticeMore } = require('./notice');

/* The not-affiliated notice (src/notice.js), shown here, on the Overview
   and in the footer of every tab. The one line is always visible; the
   longer words wait behind "Disclaimer and sources". */

/* the timers of the screen on show; stopWelcome() (view.js, on close) clears
   them, and each does nothing once the screen has left the page */
const timers = new Set();
function later(fn, ms) {
  const id = setTimeout(() => { timers.delete(id); fn(); }, ms);
  timers.add(id);
  return id;
}
function stopWelcome() {
  for (const id of timers) clearTimeout(id);
  timers.clear();
}
/* was the welcome screen drawn since the plugin loaded? */
let shown = false;
const welcomeWasShown = () => shown;

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/* onEnter() reveals the page; onSkip() reveals it and stops showing this;
   onReady() runs once, after the picture is drawn, to settle the layout
   before the animation starts. */
function renderWelcome(parent, { onEnter, onSkip, onReady }) {
  shown = true;
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
  el(copy, 'p', 'dc-hello-sub', 'Is Discovery worth what you pay? Worked out from your own bank statements, counting only the benefits you actually use. It starts with a minute of questions, and nothing leaves your vault.');

  button(copy, 'dc-hello-go', 'Let\'s find out', () => {
    sec.classList.add('is-leaving');
    /* let the fade finish; straight away when motion is off */
    later(() => { if (sec.isConnected !== false) onEnter(); }, reduced() ? 0 : 280);
  }, 'arrow-right');
  button(copy, 'dc-hello-skip', 'Do not show this again', () => onSkip());

  /* the notice: one line, and a button for the rest */
  const note = el(copy, 'div', 'dc-hello-notice');
  const line = el(note, 'p', 'dc-hello-notice-line');
  icon(line, 'info');
  el(line, 'span', null, NOTICE_LINE);
  const more = el(note, 'button', 'dc-more dc-hello-notice-btn');
  more.type = 'button';
  more.setAttribute('aria-controls', 'dc-hello-notice-more');
  const body = el(note, 'div', 'dc-hello-notice-more');
  body.id = 'dc-hello-notice-more';
  for (const t of noticeMore()) el(body, 'p', null, t);
  const sync = on => {
    more.setAttribute('aria-expanded', String(on));
    while (more.firstChild) more.removeChild(more.firstChild);
    el(more, 'span', null, on ? 'Hide the disclaimer' : 'Disclaimer and sources');
    icon(more, on ? 'chevron-up' : 'chevron-down', 'dc-more-chev');
    body.hidden = !on;
  };
  more.addEventListener('click', e => { e.preventDefault(); sync(body.hidden); });
  sync(false);

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
  later(ready, 120);
  return sec;
}

module.exports = { renderWelcome, stopWelcome, welcomeWasShown, NOTICE_LINE, noticeMore };
