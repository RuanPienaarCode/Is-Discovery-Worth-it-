/* Harness entry: mounts the REAL page (src/bottom-line.js) on a fake plugin
   host over an in-memory vault of SYNTHETIC budget notes — a made-up
   household in "Sometown", never real statements.
     ?theme=dark   Obsidian's theme-dark class
     ?empty=1      a vault with no budget
     ?miles=1      with actual Miles typed in
     ?nomiles=1    no Miles statement in the vault (estimates only)
     ?tab=bank     open a tab (overview, compare, benefits, flows, bank,
                   health, gap, insure, life, inputs)
     ?onboard=1    fresh settings: the welcome, then the first-run questions
     ?setup=healthonly  Discovery Health + Vitality Health only; the banks
                   are elsewhere, with Virgin Active and Woolworths on
                   another bank's card
     ?setup=gold   a Gold Suite on Gold statuses, no Insure
     ?setup=thin   only the last 2 months of Discovery payments (the thin-data
                   note, and "Not enough data" verdicts)
     ?setup=older  gap cover, the oldest person on it 62 (rival prices are for
                   under 45s)
     ?bigcsv=1     a 6 MB CSV in the vault (skipped, with a plain note on the
                   Overview and Inputs)
     ?welcome=0    skip the welcome screen (also skipped by ?tab= and ?check=)
     ?pal=sunrise  a colour palette (src/palettes.js: discovery, sunrise,
                   meadow (the default), onyx, plum, graphite)
     ?mobile=1     an iPhone: Obsidian's is-mobile + is-phone classes, and the
                   notch and home-bar insets an iPhone 11 reports (portrait or
                   landscape by the window's shape)
     ?old=1        a clock past the market data's review date (the stale
                   banner on Compare)
     ?partial=1    the statements stop on the 20th of the last month
     ?sample=1     start in the example household ("Try it with example data"
                   already pressed); with ?empty=1 "Leave the example" returns
                   to the empty screen
     ?typed=1      typed numbers ("Type in my numbers" already answered with
                   made-up figures, the first-run questions done); with
                   ?empty=1 the vault has no budget, without it the budget
                   is there too (the "which figures" question shows)
     ?check=1      walk every visible tab at the current width and report
                   sideways scroll, labels over amounts, tap targets under
                   44px, flow text that an SVG clips or overlaps, cards that
                   show more than one line before More, the Overview's
                   not-affiliated strip (and the thin-data note on
                   ?setup=thin) and, on Compare with ?old=1, the stale
                   warning as the visible line (in #dc-check) */
import { makeMemoryVault } from './memory-vault.js';
const { mountBottomLine } = require('../src/bottom-line');
const { loadBudget } = require('../src/load');
const { DEFAULT_SETTINGS } = require('../src/constants');
const { sampleFiles, sampleSettings, sampleSource, SAMPLE_FOLDER } = require('../src/sample');
const { enterExample, leaveExample } = require('../src/example');
const { manualSource, MANUAL_FOLDER, MANUAL_DEFAULTS, applyManual } = require('../src/manual');
const { budgetCandidates } = require('../src/load');
const { saveSummary } = require('../src/summary-note');
const { Notice } = require('obsidian');
const { makeFontLoader } = require('../src/font-loader');
/* Nunito from the same base64 faces main.js carries */
makeFontLoader().load();

const q = new URLSearchParams(location.search);
document.body.classList.add(q.get('theme') === 'dark' ? 'theme-dark' : 'theme-light');
if (q.get('mobile')) {
  document.body.classList.add('is-mobile', 'is-phone');
  /* iPhone 11: notch 48 / home bar 34 in portrait; notch at the side, home bar 21 in landscape */
  const land = innerWidth > innerHeight;
  const inset = { top: land ? 0 : 48, bottom: land ? 21 : 34, left: land ? 48 : 0, right: land ? 48 : 0 };
  for (const [k, v] of Object.entries(inset)) document.body.style.setProperty(`--safe-area-inset-${k}`, v + 'px');
}
/* the clock: a day after the market data was stamped (?old=1: past its review date) */
const NOW = q.get('old') ? new Date(2027, 5, 15) : new Date(2026, 10, 3);
const SETUP = q.get('setup') || '';
const ONBOARD = !!q.get('onboard');

/* The made-up "Sometown" household (src/sample.js — the same files the
   plugin's "Try it with example data" shows), in the set-up the URL asks for. */
const OPTS = { setup: SETUP, partial: !!q.get('partial'), nomiles: !!q.get('nomiles'), miles: !!q.get('miles'), openQuestions: true };
const THIN = SETUP === 'thin';
const files = sampleFiles(NOW, OPTS);

/* The settings. The default is a finished set-up with every product; the
   others start from what the budget shows (products left unanswered) or
   from nothing at all (?onboard=1: the questions). openQuestions keeps the
   few answers the fixtures have always left open (conditions, plan, the
   oldest age), so the figures here stay as they were. */
const ui0 = { tab: q.get('tab') || 'overview', welcome: !(q.get('check') || q.get('welcome') === '0' || q.get('tab')) };
let settings;
if (ONBOARD) {
  /* fresh: not onboarded, nothing answered; the welcome shows first */
  settings = { ...JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), welcome: true, tab: 'overview' };
} else {
  settings = { ...sampleSettings(NOW, OPTS), ...ui0 };
}

/* ?typed=1: a made-up household typed in by hand (round numbers, never real) */
if (q.get('typed')) {
  settings = { ...JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), ...ui0, onboarded: true, dataSource: 'manual',
    products: { bank: true, health: true, gap: true, insure: true, life: true }, bankKind: 'suite', suite: 'Platinum', suiteAnswered: true,
    vitality: { money: true, health: true, drive: true }, status: { money: 'Gold', health: 'Silver', drive: 'Blue' },
    members: { adults: 2, children: 2, oldestAge: 40 }, conditions: { checks: 'one', gym36: true, insurePlan: 'classic', homeCover: 'none' },
    manual: { ...MANUAL_DEFAULTS, done: true, cardSpend: 12000, checkers: 2500, woolworths: 1200, pnp: 800, clicks: 350, dischem: 0, fuel: 1800,
      interest: 15, health: 6200, claims: 2400, gym: 400, flights: 4800, gap: 220, gapInHealth: true, insure: 1300, life: 700 } };
  applyManual(settings);
}
if (q.get('pal')) settings.palette = q.get('pal');
/* ?sample=1: the example is already on, over the fresh settings */
if (q.get('sample')) settings = enterExample({ ...JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), ...ui0, welcome: ui0.welcome }, NOW);
if (q.get('sample') && q.get('tab')) settings.tab = q.get('tab');

const BIG = 'Money/Other/old-export.csv';
if (q.get('bigcsv')) files[BIG] = 'a,b\n1,2\n';
const vault = makeMemoryVault(q.get('empty') ? { 'Notes/Hello.md': '# hi\n' } : files);
const plugin = {
  settings,
  manifest: { version: '0.0.0-preview' },
  async saveSettings() { console.log('[saveSettings]', JSON.stringify(plugin.settings)); },
  /* the same two moves main.js makes: stash and show the example, or put the
     person's own answers back */
  async setExample(on, now) {
    if (!!on === !!plugin.settings.sample) return;
    plugin.settings = on ? enterExample(plugin.settings, now || NOW) : { ...JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), ...leaveExample(plugin.settings) };
    await plugin.saveSettings();
    await ui.refresh();
  },
  async saveSummary(text, now) {
    if (!text) { new Notice('Nothing to summarise yet.'); return; }
    const path = await saveSummary(vault, plugin.settings.summaryFolder, now || NOW, text);
    new Notice('Saved ' + path);
  },
  /* the same move main.js makes: typed numbers on or off */
  async setManual(on) {
    if (plugin.settings.sample) plugin.settings = { ...JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), ...leaveExample(plugin.settings) };
    plugin.settings.dataSource = on ? 'manual' : '';
    plugin.settings.manual = { ...MANUAL_DEFAULTS, ...(plugin.settings.manual || {}) };
    if (on) applyManual(plugin.settings);
    await plugin.saveSettings();
    await ui.refresh();
  },
  async readBudget() {
    if (plugin.settings.sample) return loadBudget(sampleSource(NOW), SAMPLE_FOLDER);
    const paths = vault.getFiles().map(f => f.path).filter(p => /\.(md|csv)$/.test(p));
    const source = { paths: () => paths, read: async p => vault.files.get(p), stat: p => ({ mtime: 1, size: p === BIG ? 6 * 1048576 : (vault.files.get(p) || '').length }) };
    if (plugin.settings.dataSource === 'manual') {
      const b = await loadBudget(manualSource(plugin.settings, NOW, source), MANUAL_FOLDER);
      const found = budgetCandidates(paths.filter(p => /\.md$/.test(p)))[0];
      b.manual = true;
      b.budgetFound = found ? found.folder : null;
      return b;
    }
    return loadBudget(source, plugin.settings.budgetFolder);
  },
};
const root = document.getElementById('page');
const ui = mountBottomLine(root, { plugin, now: () => NOW });
ui.refresh().then(async () => {
  window.__dc = { plugin, ui, vault };
  if (!q.get('check')) return;
  /* the phone-layout check: run it at 375px (and 320px) before a release.
     It walks the tabs the page itself shows for this set-up. */
  const host = document.querySelector('.view-content');
  const lines = [];
  const tabs = [...document.querySelectorAll('.dc-tabs-list .dc-tab')].map(b => b.id.replace(/^dc-tab-/, ''));
  for (const t of tabs) {
    plugin.settings.tab = t;
    ui.render();
    await new Promise(r => setTimeout(r, 300));
    /* the page scrolls inside itself (.dc-main), not the view */
    const sc = document.querySelector('.dc-main') || host;
    const over = sc.scrollWidth > sc.clientWidth ? `scrolls sideways ${sc.scrollWidth}/${sc.clientWidth}` : '';
    const heads = [...document.querySelectorAll('.dc-line-head')];
    const overlaps = heads.filter(h => {
      const l = h.querySelector('.dc-line-label'), a = h.querySelector('.dc-amt');
      return l && a && l.getBoundingClientRect().right > a.getBoundingClientRect().left + 1;
    }).length;
    /* a checkbox or radio inside a label is tapped through the label */
    const small = [...document.querySelectorAll('.dc-page button, .dc-page input, .dc-page select')].filter(e => {
      /* the closed side menu is off screen, out of reach */
      if (e.closest('.dc-nav-drawer') && !document.querySelector('.dc-page.dc-menu-open') && document.querySelector('.dc-page.is-narrow')) return false;
      const r = (/^(checkbox|radio)$/.test(e.type) && e.closest('label') ? e.closest('label') : e).getBoundingClientRect();
      return r.width > 0 && r.height > 0 && (r.height < 43.5 || r.width < 43.5);
    }).length;
    /* an SVG clips its own text instead of scrolling, so measure it */
    let flowText = 0;
    for (const svg of document.querySelectorAll('.dc-page svg')) {
      const sr = svg.getBoundingClientRect(), ts = [...svg.querySelectorAll('text')].map(t => t.getBoundingClientRect()).filter(b => b.width);
      flowText += ts.filter((a, i) => a.right > sr.right + 0.5 || ts.some((b, j) => j > i && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1)).length;
    }
    const found = [over, overlaps ? overlaps + ' labels over amounts' : '', small ? small + ' tap targets under 44px' : '', flowText ? flowText + ' flow labels clipped or overlapping' : ''].filter(Boolean).join(', ');
    /* a card shows a heading, one line and its figure until More: count
       visible paragraphs in a card outside a More region */
    const wordy = [...document.querySelectorAll('.dc-card')].filter(c => [...c.querySelectorAll('p')].filter(p => !p.closest('.dc-more-body, .dc-ben-more-body, [hidden]') && p.offsetHeight > 0 && !p.classList.contains('dc-grp') && !p.classList.contains('dc-subhead')).length > 1 && !c.querySelector('.dc-fgrid') && !c.classList.contains('dc-figs')).length;
    /* the not-affiliated strip is on the Overview; on a thin set-up so is the
       note about few months; with ?old=1 the Compare warning is a visible line */
    const extra = [];
    if (t === 'overview' && !document.querySelector('.dc-notice')) extra.push('no not-affiliated strip');
    if (t === 'overview' && THIN && !document.querySelector('.dc-confidence')) extra.push('thin data but no note about it');
    if (t === 'compare' && q.get('old')) {
      const ml = document.querySelector('.dc-market-line');
      if (!ml || !ml.offsetHeight || !/out of date/.test(ml.textContent)) extra.push('stale warning is not the visible line');
    }
    const found2 = [found, wordy ? wordy + ' cards with more than one line' : '', ...extra].filter(Boolean).join(', ');
    lines.push(`${t}: ${found2 || 'ok'} (${heads.length} lines, ${document.querySelectorAll('.dc-page button, .dc-page input, .dc-page select').length} controls)`);
  }
  const pre = document.createElement('pre');
  pre.id = 'dc-check';
  pre.textContent = `width ${host.clientWidth}\n` + lines.join('\n');
  document.body.prepend(pre);
});
