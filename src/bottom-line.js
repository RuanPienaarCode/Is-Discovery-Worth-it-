'use strict';
/* The page, one tab at a time behind a switcher that is always in view:
   Overview, Flows, the five products (Bank, Health, Gap cover, Insure,
   Life) and Inputs. Each product tab is one bordered section in its own
   colour — figures, then transactions, then the inputs that change it — and
   every input also lives on the Inputs tab. Every input saves to settings
   and re-renders from the cached measurement; the vault is read once per
   refresh. */

const { el, icon, button, clear } = require('./dom');
const { money, pct, monthLabel, dayLabel, miles, parseTyped, showTyped } = require('./format');
const { measure, trailingWindow } = require('./measure');
const { summariseMiles } = require('./miles');
const { buildStatement } = require('./model');
const { buildProducts } = require('./products');
const { buildVerdicts } = require('./verdict');
const { buildSwitch, buildRivals, byKind } = require('./switch');
const { NEEDS, GRADES, compareHealth, compareGap, compareInsure, compareLife, compareHome, healthPremium, HEALTH_PLANS, HEALTH_OWN, GAP_PLANS, INSURERS, LIFE_OFFERS, HOME_INSURERS, HOME_RANGE } = require('./compare');
const { mountFlow } = require('./ui-flow');
const { RATES, rate, sourceText } = require('./rates');
const { renderWelcome } = require('./welcome');
const { brandLogo, productLogo } = require('./logos');
const { STATUSES } = require('./constants');

const SOURCE = { measured: 'From your statements', statement: 'From your Miles statement', estimated: 'Estimate', entered: 'You entered' };
const MILES_INPUTS = [
  ['card', 'Base Miles on card spend', 'Miles'],
  ['healthyFood', 'HealthyFood Miles (Money + Health)', 'Miles'],
  ['healthyCare', 'HealthyCare Miles (Money + Health)', 'Miles'],
  ['fuel', 'Vitality Money fuel Miles', 'Miles'],
];
const TABS = [
  { id: 'overview', name: 'Overview', icon: 'layout-grid' },
  { id: 'compare', name: 'Compare', icon: 'arrow-left-right' },
  { id: 'flows', name: 'Flows', icon: 'waypoints' },
  { id: 'bank', product: true },
  { id: 'health', product: true },
  { id: 'gap', product: true },
  { id: 'insure', product: true },
  { id: 'life', product: true },
  { id: 'inputs', name: 'Inputs', icon: 'sliders-horizontal' },
];
const SUBTITLE = {
  bank: s => `${s.suite} Suite · Vitality Money ${s.status.money}`,
  health: s => `Medical aid · Vitality Health ${s.status.health}`,
  gap: () => 'Billed with the Discovery Health debit or on its own',
  insure: s => `Cars · Vitality Drive ${s.status.drive}${s.home && Number(s.home.monthly) === 0 && s.home.monthly !== '' && s.home.monthly !== null ? ' · home contents not insured' : ''}`,
  life: () => 'Through your payslip or a debit order',
};
const TX_SHOWN = 30;

function mountBottomLine(root, ctx) {
  const plugin = ctx.plugin;
  const now = ctx.now || (() => new Date());
  let budget = null;
  let flow = null;
  const open = new Set();
  /* the phone's tab menu: open or not, kept across re-renders */
  let menuOpen = false;
  const wrap = el(root, 'div', 'dc-page');
  /* On a phone the tab bar is a floating dock. It lives here, beside the
     page and not inside it, because the page scrolls (see .is-narrow) and the
     dock must not. Empty, and so invisible, on a wide pane. */
  const chrome = el(root, 'div', 'dc-chrome');
  const scroller = () => (wrap.classList.contains('is-narrow') ? wrap : root);
  let currentProducts = [];
  const parentProduct = id => currentProducts.find(p => p.id === id);

  /* Narrow layout by the pane's own width (a sidebar or a phone), not the
     window's — container queries need iOS 16, the floor here is iOS 15. */
  const applyWidth = () => {
    const w = wrap.clientWidth;
    if (!w) return false;
    /* only touch the classes when they change */
    const was = wrap.classList.contains('is-narrow');
    if (was !== w < 720) {
      wrap.classList.toggle('is-narrow', w < 720);
      chrome.classList.toggle('is-narrow', w < 720);
      root.classList.toggle('dc-narrow', w < 720);
    }
    if (wrap.classList.contains('is-phone') !== w < 560) wrap.classList.toggle('is-phone', w < 560);
    return was !== w < 720;
  };
  const fit = () => {
    const flipped = applyWidth();
    /* the tabs live in a different place on a phone: draw them again */
    if (flipped && wrap.querySelector('.dc-panel')) render();
    if (wrap.clientWidth >= 720 && menuOpen) setMenu(false);
  };
  let ro = null;
  /* a frame later, so the class change is not made inside the observer's
     own callback ("ResizeObserver loop completed with undelivered
     notifications") */
  if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(() => requestAnimationFrame(fit)); ro.observe(wrap); }

  /* A rebuild replaces every input, so one that lands while you are already
     in ANOTHER field would drop the keyboard (each field took two taps on a
     phone) and lose what you were typing. Hold it until you leave the
     fields. The field that just changed may re-render under itself. */
  const isField = e => !!e && /^(INPUT|SELECT|TEXTAREA)$/.test(e.tagName) && wrap.contains(e);
  let lastChanged = null, pending = false;
  wrap.addEventListener('change', e => { lastChanged = e.target; }, true);
  wrap.addEventListener('focusout', e => {
    if (!pending || isField(e.relatedTarget)) return;
    pending = false;
    render();
  });
  const requestRender = src => {
    const a = document.activeElement;
    if (isField(a) && a !== src) { pending = true; return; }
    render();
  };
  const save = async () => {
    const src = lastChanged;
    lastChanged = null;
    await plugin.saveSettings();
    requestRender(src);
  };
  const period = () => (plugin.settings.period === 'monthly' ? 'monthly' : 'annual');
  const per = n => (period() === 'monthly' ? n / 12 : n);
  const perLabel = () => (period() === 'monthly' ? 'a month' : 'a year');
  const tab = () => (TABS.some(t => t.id === plugin.settings.tab) ? plugin.settings.tab : 'overview');
  const amt = (parent, v, opts) => {
    const o = opts || {};
    const shown = o.raw ? v : per(v);
    return el(parent, o.tag || 'span', 'dc-amt ' + (o.cls || '') + (Math.abs(shown) < 0.5 ? ' is-zero' : shown > 0 ? ' is-pos' : ' is-neg'), money(shown, { plus: o.plus, cents: o.cents }));
  };

  async function refresh() {
    budget = await plugin.readBudget();
    requestRender(null);
  }

  /* The narrow switcher: a dock-styled bar at the bottom of the view naming
     the open tab, which opens the whole list as a sheet standing where the
     bar is. */
  function setMenu(on) {
    menuOpen = on;
    const bar = root.querySelector('.dc-tabs');
    if (!bar) return;
    bar.classList.toggle('is-open', on);
    const t = bar.querySelector('.dc-tabs-toggle');
    if (t) t.setAttribute('aria-expanded', String(on));
    /* the sheet covers the bar, so the keyboard goes to the sheet */
    if (on) requestAnimationFrame(() => { const c = bar.querySelector('.dc-tab[aria-selected="true"]'); if (menuOpen && c) c.focus(); });
  }
  root.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !menuOpen) return;
    setMenu(false);
    const t = root.querySelector('.dc-tabs-toggle');
    if (t) t.focus();
  });
  /* A tap outside the open menu closes it and does nothing else: the click
     that follows is swallowed, so it can't also flip Monthly/Yearly. */
  let swallow = false;
  root.addEventListener('pointerdown', e => {
    if (!menuOpen || (e.target.closest('.dc-tabs') && !e.target.closest('.dc-scrim'))) return;
    setMenu(false);
    const t = root.querySelector('.dc-tabs-toggle');
    if (t) t.focus();
    swallow = true;
    setTimeout(() => { swallow = false; }, 500);
  });
  root.addEventListener('click', e => {
    if (!swallow) return;
    swallow = false;
    e.preventDefault();
    e.stopPropagation();
  }, true);

  async function show(id) {
    plugin.settings.tab = id;
    menuOpen = false;
    render();
    const panel = wrap.querySelector('.dc-panel');
    if (panel && panel.getBoundingClientRect().top < 0) panel.scrollIntoView();
    if (wrap.classList.contains('is-narrow')) { const t = root.querySelector('.dc-tabs-toggle'); if (t) t.focus(); }
    /* remembering the tab is not worth a data.json write per click */
    clearTimeout(tabSaveTimer);
    tabSaveTimer = setTimeout(() => plugin.saveSettings(), 1500);
  }
  let tabSaveTimer = null;

  /* The welcome screen comes first each time the page opens. The data keeps
     loading behind it; a refresh must not rebuild it (that would restart its
     animation), so it is built once and left alone until it is dismissed. */
  let welcomed = false;
  function renderWelcomeOnce() {
    if (wrap.querySelector('.dc-welcome')) return;
    clear(wrap);
    renderWelcome(wrap, {
      onEnter: () => { welcomed = true; render(); },
      onSkip: async () => { plugin.settings.welcome = false; welcomed = true; render(); await plugin.saveSettings(); },
      onReady: fit,
    });
    fit();
  }

  function render() {
    const welcoming = !welcomed && plugin.settings.welcome !== false;
    /* the welcome fills the whole pane, so the pane itself takes its colour */
    root.classList.toggle('dc-welcoming', welcoming);
    wrap.classList.toggle('has-welcome', welcoming);
    if (welcoming) return renderWelcomeOnce();
    const scrollTop = scroller().scrollTop;
    applyWidth();
    clear(chrome);
    if (flow) { flow.destroy(); flow = null; }
    clear(wrap);
    if (!budget || budget.folder === null) return renderEmpty();
    const s = plugin.settings;
    const win = trailingWindow(now(), s.months);
    const m = measure(budget.rows, budget.accounts, budget.categories, { ...win, notCardSpend: s.notCardSpend });
    const ms = budget.miles ? summariseMiles(budget.miles.rows, m.from, m.to) : null;
    const st = buildStatement(m, s, ms);
    const pr = buildProducts(st, m, ms, s, now());
    const P = id => pr.products.find(p => p.id === id);
    const cmp = { health: compareHealth(P('health'), s), gap: compareGap(P('gap'), s), insure: compareInsure(P('insure'), s), life: compareLife(P('life'), s), home: compareHome(s) };
    const view = { s, m, ms, st, pr, P, cmp, verdicts: buildVerdicts(st, cmp), sw: buildSwitch(st, cmp), rivals: buildRivals(st, cmp) };
    currentProducts = pr.products;

    renderTop(view);
    const shell = el(wrap, 'div', 'dc-shell');
    renderTabs(shell, view);
    const panel = el(shell, 'div', 'dc-panel');
    panel.id = 'dc-panel';
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', 'dc-tab-' + tab());
    const t = tab();
    if (t === 'overview') renderOverview(panel, view);
    else if (t === 'compare') renderSwitch(panel, view);
    else if (t === 'flows') renderFlows(panel, view);
    else if (t === 'inputs') renderInputs(panel, view);
    else renderProduct(panel, view, view.P(t));
    renderFoot(panel, view);
    fit();
    scroller().scrollTop = scrollTop;
  }

  function renderEmpty() {
    const c = el(wrap, 'div', 'dc-empty');
    el(c, 'h2', null, 'No budget found');
    el(c, 'p', 'dc-muted', 'This reads the Budget plugin\'s Transactions folder (Transactions/<account>/<YYYY-MM>.md). Set the budget folder in this plugin\'s settings if it lives somewhere unusual.');
  }

  // ── header and switcher ──────────────────────────────────────────────
  function renderTop({ m, st }) {
    const h = el(wrap, 'header', 'dc-top');
    const t = el(h, 'div', 'dc-top-text');
    const eb = el(t, 'p', 'dc-eyebrow');
    brandLogo(eb, 'discovery');
    el(eb, 'span', null, 'Discovery Calculator · ' + plugin.settings.suite + ' Suite');
    el(t, 'h1', 'dc-h1', 'The bottom line');
    el(t, 'p', 'dc-meta', `${monthLabel(m.from)} – ${monthLabel(m.to)} · ${st.window.months} months · ${m.rowsSeen.toLocaleString('en-US').replace(/,/g, ' ')} transactions read`);
    if (st.window.dataMonths < st.window.months) {
      el(t, 'p', 'dc-note', `Only ${st.window.dataMonths} of these ${st.window.months} months have Discovery transactions, so the figures are scaled up from those months.`);
    }
    const seg = el(h, 'div', 'dc-seg');
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', 'Show amounts');
    for (const [k, label] of [['monthly', 'Monthly'], ['annual', 'Yearly']]) {
      const b = button(seg, 'dc-seg-btn', label, async () => { plugin.settings.period = k; await save(); });
      b.setAttribute('aria-pressed', String(period() === k));
    }
  }

  function renderTabs(shell, { st, P, verdicts, sw }) {
    const narrow = wrap.classList.contains('is-narrow');
    const bar = el(narrow ? chrome : shell, 'div', 'dc-tabs' + (menuOpen ? ' is-open' : ''));
    /* behind the open sheet: a tap on it closes the sheet and does nothing else */
    if (narrow) el(bar, 'div', 'dc-scrim');
    const cur = TABS.find(t => t.id === tab());
    const curP = cur.product ? P(cur.id) : null;
    const toggle = button(bar, 'dc-tabs-toggle' + (curP ? ' dc-p-' + curP.id : ''), null, () => setMenu(!menuOpen));
    toggle.setAttribute('aria-expanded', String(menuOpen));
    toggle.setAttribute('aria-controls', 'dc-tabs-list');
    /* the open tab sits in the bar the way the active page sits in a dock */
    const here = el(toggle, 'span', 'dc-dock-cur');
    const ct = el(here, 'span', 'dc-tile' + (curP ? '' : ' is-plain'));
    if (curP) productLogo(ct, curP.id); else icon(ct, cur.icon);
    el(here, 'span', 'dc-tab-name', curP ? curP.short : cur.name);
    el(here, 'span', 'dc-tabs-toggle-hint', 'All tabs');
    icon(here, 'chevron-up', 'dc-tabs-chev');
    const list = el(bar, 'div', 'dc-tabs-list');
    list.id = 'dc-tabs-list';
    list.setAttribute('role', 'tablist');
    list.setAttribute('aria-label', 'Discovery products');
    TABS.forEach((t, i) => {
      if (t.id === 'bank' || t.id === 'inputs') el(list, 'div', 'dc-tab-sep');
      const p = t.product ? P(t.id) : null;
      const b = button(list, 'dc-tab' + (p ? ' dc-p-' + p.id : ''), null, () => show(t.id));
      b.id = 'dc-tab-' + t.id;
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-controls', 'dc-panel');
      b.setAttribute('aria-selected', String(tab() === t.id));
      b.tabIndex = tab() === t.id ? 0 : -1;
      const tile = el(b, 'span', 'dc-tile' + (p ? '' : ' is-plain'));
      if (p) productLogo(tile, p.id); else icon(tile, t.icon);
      el(b, 'span', 'dc-tab-name', p ? p.short : t.name);
      const fig = el(b, 'span', 'dc-tab-fig');
      if (p && verdicts[p.id]) verdictFig(fig, verdicts[p.id]);
      else if (p) amt(fig, p.figure, { plus: true });
      else if (t.id === 'overview' && st.chosen) { amt(fig, -st.chosen.gainIfSwitch, { plus: true }); el(fig, 'span', null, ' vs ' + st.chosen.name.split(' ')[0]); }
      else if (t.id === 'compare') { amt(fig, Math.abs(sw.gain), { plus: true }); el(fig, 'span', null, sw.gain > 0 ? ' to switch' : ' to stay'); }
      else if (t.id === 'flows') el(fig, 'span', null, 'Where money goes');
      else if (t.id === 'inputs') el(fig, 'span', null, 'Everything you can set');
      b.addEventListener('keydown', e => {
        const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
        const jump = { Home: 0, End: TABS.length - 1 }[e.key];
        if (!step && jump === undefined) return;
        e.preventDefault();
        const next = TABS[jump !== undefined ? jump : (i + step + TABS.length) % TABS.length].id;
        show(next).then(() => { const n = root.querySelector('#dc-tab-' + next); if (n) n.focus(); });
      });
    });
  }

  // ── Overview ─────────────────────────────────────────────────────────
  function renderOverview(panel, { st, pr, verdicts }) {
    const grid = el(panel, 'div', 'dc-ov-grid');
    const alt = st.chosen;
    const v = el(grid, 'section', 'dc-ov-card dc-ov-verdict dc-p-bank');
    const vh = el(v, 'h2');
    /* Prose reads in words, so its amounts carry no sign: "R 181 a month
       worse off", never "−R 181 against". */
    const say = (p, text) => p.appendChild(document.createTextNode(text));
    const sayAmt = (p, n) => el(p, 'span', 'dc-amt' + (Math.abs(per(n)) < 0.5 ? ' is-zero' : n > 0 ? ' is-pos' : ' is-neg'), money(per(Math.abs(n))));
    if (alt) {
      const stay = st.verdict === 'stay';
      el(vh, 'span', 'dc-name', stay ? 'Discovery Bank is worth keeping' : `${alt.name} would suit you better`);
      amt(vh, stay ? -alt.gainIfSwitch : alt.gainIfSwitch, { plus: true, cls: 'dc-fig' });
      /* one story: the central figure, then the careful count (Miles at face
         value, no flights next year, no gameboard) as a check on it */
      const central = -alt.gainIfSwitch, cautious = st.cautious.net - alt.net;
      const careful = ' (each Mile worth only 10c, no flight discounts next year and no gameboard rewards)';
      const vp = el(v, 'p');
      if (stay) {
        say(vp, 'You are about ');
        sayAmt(vp, central);
        say(vp, ` ${perLabel()} better off with Discovery Bank than you would be with ${alt.name}, after its fees.`);
      } else {
        say(vp, 'You would be about ');
        sayAmt(vp, -central);
        say(vp, ` ${perLabel()} better off with ${alt.name} than with Discovery Bank.`);
      }
      const cp = el(v, 'p');
      if (stay && cautious >= 0) {
        say(cp, `Even if we count carefully${careful}, you are still `);
        sayAmt(cp, cautious);
        say(cp, ` ${perLabel()} ahead.`);
      } else {
        say(cp, `If we count carefully${careful}, ${cautious >= 0 ? 'Discovery Bank' : alt.name} comes out `);
        sayAmt(cp, cautious);
        say(cp, ` ${perLabel()} ahead${stay ? ', so it is close' : ''}.`);
      }
      const d = st.downgrade;
      if (d) {
        const dp = el(v, 'p');
        const off = n => { sayAmt(dp, n); say(dp, ` ${perLabel()} ${n >= 0 ? 'better' : 'worse'} off`); };
        say(dp, 'Staying with Discovery but moving to its cheaper Black Credit Card Account (without the full Suite) would leave you ');
        off(d.gainIfDowngrade);
        say(dp, d.gainAfterWatch !== null ? ' today' : '.');
        if (d.gainAfterWatch !== null) {
          say(dp, `, and `);
          off(d.gainAfterWatch);
          say(dp, ` once your Apple Watch contract ends${d.watchEnds ? ` on ${dayLabel(d.watchEnds)}` : ''}.`);
        }
        say(dp, ' See the Bank tab.');
      }
    } else {
      el(vh, 'span', 'dc-name', 'Discovery Bank: rewards minus fees');
      amt(vh, st.net, { plus: true, cls: 'dc-fig' });
    }
    const bill = el(grid, 'section', 'dc-ov-card');
    const bh = el(bill, 'h2');
    el(bh, 'span', 'dc-name', 'Everything you pay Discovery');
    amt(bh, -pr.totals.paid, { cls: 'dc-fig' });
    const bp = el(bill, 'p');
    say(bp, `${perLabel() === 'a month' ? 'A month' : 'A year'}, for all your Discovery products together. You got `);
    sayAmt(bp, pr.totals.cash);
    say(bp, ` ${perLabel()} back in cash from refunds and claims.`);
    const vit = st.vitality;
    const vc = el(grid, 'section', 'dc-ov-card dc-p-health');
    const vch = el(vc, 'h2');
    el(vch, 'span', 'dc-name', 'Is Vitality Health worth it?');
    if (vit.premium !== null) {
      amt(vch, vit.value - vit.premium, { plus: true, cls: 'dc-fig' });
      const p = el(vc, 'p');
      say(p, 'It costs ');
      sayAmt(p, -vit.premium);
      say(p, ` ${perLabel()} and gives you about `);
      sayAmt(p, vit.value);
      say(p, ` ${perLabel()} back in gym discounts, HealthyFood, flights and other rewards.`);
    } else {
      el(vch, 'span', 'dc-fig dc-amt is-zero', '—');
      el(vc, 'p', null, 'Type your medical aid premium on the Inputs tab, so the Vitality part of the Discovery Health debit order can be worked out.');
    }

    blockHeading(panel, 'Is each one worth it?', 'layout-grid');
    el(panel, 'p', 'dc-muted', `Each Discovery product compared with what other companies charge. The amount on the right is what you pay for it ${perLabel()}; for Discovery Bank, it is its rewards minus its fees.`);
    const list = el(panel, 'div', 'dc-plist');
    const row = (cls, logo, name, v, fallback, figure, open) => {
      const r = button(list, 'dc-prow ' + cls, null, open);
      const tile = el(r, 'span', 'dc-tile');
      productLogo(tile, logo);
      const t = el(r, 'span', 'dc-prow-t');
      el(t, 'span', null, name);
      if (v) {
        verdictFig(el(t, 'span', 'dc-prow-v'), v);
        el(t, 'span', null, verdictLine(v));
      } else el(t, 'span', null, fallback);
      if (figure === null) el(r, 'span', 'dc-amt is-zero', '—');
      else amt(r, figure, { plus: true });
      icon(r, 'chevron-right', 'dc-chev');
    };
    for (const p of pr.products) {
      row('dc-p-' + p.id, p.id, p.name, verdicts[p.id], p.figureLabel, p.figure, () => show(p.id));
      if (p.id === 'insure' && verdicts.home) row('dc-p-insure', 'insure', 'Home contents', verdicts.home, '', null, () => show('insure'));
    }

    blockHeading(panel, 'What you paid and got back in cash', 'receipt');
    const tbl = el(panel, 'div', 'dc-bill');
    const head = el(tbl, 'div', 'dc-bill-r dc-bill-h');
    for (const x of ['Product', 'Paid', 'Back in cash']) el(head, 'span', null, x);
    for (const p of pr.products) {
      const r = el(tbl, 'div', 'dc-bill-r');
      const n = el(r, 'span', 'dc-bill-n');
      tag(n, p);
      amt(r, -p.paid);
      if (p.cashBack >= 0.5) amt(r, p.cashBack, { plus: true }); else el(r, 'span', 'dc-amt is-zero', '–');
    }
    const tr = el(tbl, 'div', 'dc-bill-r dc-bill-t');
    el(tr, 'span', null, 'All products');
    amt(tr, -pr.totals.paid);
    amt(tr, pr.totals.cash, { plus: true });
    el(panel, 'p', 'dc-note', 'Discovery Bank\'s rewards (Miles, the Apple Watch, discounts) are not cash, so they are not in this table. They are counted in the Discovery Bank figure at the top and on the Flows tab.');

    const est = st.lines.filter(l => l.group === 'bank' && l.source === 'estimated' && l.annual > 0.5);
    if (est.length) el(panel, 'p', 'dc-note', `These parts of the Discovery Bank figure are estimates, not taken from your statements: ${est.map(l => l.label).join('; ')}.`);
    renderDates(panel, pr.dates);
  }

  function renderDates(parent, dates, product) {
    const list = product ? dates.filter(d => d.product === product) : dates;
    if (!list.length) return;
    blockHeading(parent, 'Dates to watch', 'calendar');
    const ul = el(parent, 'ul', 'dc-dates');
    for (const d of list) {
      const li = el(ul, 'li', 'dc-date');
      el(li, 'span', 'dc-date-d', dayLabel(d.date));
      const t = el(li, 'span', 'dc-date-t');
      if (!product) { const p = parentProduct(d.product); if (p) tag(t, p); }
      el(t, 'span', null, ' ' + d.text);
    }
  }
  // ── Compare: stay with Discovery or switch everything ───────────────
  /* Written for someone who does not read statements: two boxes (what you
     pay, what you get back, what it really costs), the answer in one line,
     then one sentence per product. Every amount is a positive rand amount;
     the words say which way it goes. The full table waits behind a button. */
  function renderSwitch(panel, { sw, st, rivals }) {
    const R = n => money(per(Math.abs(n)));
    const diff = Math.abs(sw.gain);
    const stayBetter = sw.gain <= 0;

    const sides = el(panel, 'div', 'dc-sw-sides');
    const box = (title, s, win, who, side, items) => {
      const b = el(sides, 'section', 'dc-sw-side' + (win ? ' is-win' : ''));
      el(b, 'h3', 'dc-sw-title', title);
      if (who) el(b, 'p', 'dc-sw-who', who);
      const line = (label, v, cls) => {
        const r = el(b, 'div', 'dc-sw-ln' + (cls ? ' ' + cls : ''));
        el(r, 'span', null, label);
        const val = el(r, 'span', 'dc-sw-v', R(v));
        el(val, 'span', 'dc-sw-per', ' ' + perLabel());
      };
      line('You pay', s.cost);
      /* tap "You get back" to see what that money actually is */
      if (s.benefit >= 0.5) {
        const key = 'back.box.' + side;
        const isOpen = open.has(key);
        const r = button(b, 'dc-sw-ln is-back dc-tap', null, () => { isOpen ? open.delete(key) : open.add(key); render(); });
        r.setAttribute('aria-expanded', String(isOpen));
        const lab = el(r, 'span', 'dc-tap-l');
        el(lab, 'span', null, 'You get back in rewards');
        icon(lab, isOpen ? 'chevron-down' : 'chevron-right', 'dc-chev');
        const val = el(r, 'span', 'dc-sw-v', R(s.benefit));
        el(val, 'span', 'dc-sw-per', ' ' + perLabel());
        if (isOpen) backBreakdown(b, items);
      } else line('You get back in rewards', 0, 'is-back');
      line(s.real >= 0 ? 'Real cost' : 'You come out ahead by', s.real, 'is-real');
    };
    /* "compared to what": each box names who it means */
    const movedTo = sw.rows.filter(r => r.kind === 'cost' && r.goName && !r.assumed).map(r => r.goName);
    const kept = sw.rows.filter(r => r.kind === 'cost' && r.assumed).map(r => r.label.toLowerCase());
    const names = xs => (xs.length > 1 ? xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1] : xs[0] || '');
    const sideItems = k => sw.rows.filter(r => r.kind === 'benefit').flatMap(r => r[k] || []);
    box('If you stay with Discovery', sw.stay, diff >= 0.5 && stayBetter, 'Discovery Bank, Health, Gap Cover, Insure and Life, as you have them now.', 'stay', sideItems('stayItems'));
    box('If you move everything', sw.go, diff >= 0.5 && !stayBetter, movedTo.length ? `To ${names(movedTo)}${kept.length ? `. ${names(kept).replace(/^./, x => x.toUpperCase())} stay${kept.length > 1 ? '' : 's'} at today's price until you get a quote` : ''}.` : '', 'go', sideItems('goItems'));

    el(panel, 'p', 'dc-sw-banner' + (diff < 0.5 ? '' : stayBetter ? ' is-stay' : ' is-move'),
      diff < 0.5 ? 'Both cost about the same.'
        : `✔ ${stayBetter ? 'Staying' : 'Moving everything'} costs you ${R(diff)} ${perLabel()} less.`);
    if (sw.assumed.length) {
      const names = sw.assumed.map(x => x.toLowerCase());
      const list = names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : names[0];
      el(panel, 'p', 'dc-note', `${list.charAt(0).toUpperCase() + list.slice(1)} ${names.length > 1 ? 'have' : 'has'} no quote yet, so both sides use what you pay now. Type quotes on the Inputs tab to compare ${names.length > 1 ? 'them' : 'it'} properly.`);
    }

    blockHeading(panel, 'Where the difference comes from', 'arrow-left-right');
    el(panel, 'p', 'dc-muted', `Amounts are ${perLabel()}.`);
    const why = el(panel, 'div', 'dc-sw-why');
    const LOGO = { bank: 'bank', medical: 'health', car: 'insure', gap: 'gap', life: 'life' };
    for (const g of sw.groups) {
      const item = el(why, 'div', 'dc-sw-item');
      const name = el(item, 'span', 'dc-sw-name');
      productLogo(el(name, 'span', 'dc-tile'), LOGO[g.id]);
      el(name, 'span', null, g.label);
      const text = el(item, 'p', 'dc-sw-text');
      const lead = Math.abs(g.saving) < 0.5 ? null : g.saving > 0 ? `Moving is ${R(g.saving)} better.` : `Staying is ${R(g.saving)} better.`;
      if (lead) el(text, 'strong', 'dc-sw-lead ' + (g.saving > 0 ? 'is-move' : 'is-stay'), lead + ' ');
      text.appendChild(document.createTextNode(switchReason(g, R, !!lead)));
    }

    renderRivals(panel, rivals);

    const all = open.has('sw.table');
    button(panel, 'dc-link', all ? 'Hide the amounts' : 'Show every amount', () => { all ? open.delete('sw.table') : open.add('sw.table'); render(); }, all ? 'chevron-down' : 'chevron-right');
    if (all) switchTable(panel, sw);

    el(panel, 'p', 'dc-note', `"Moving everything" means ${st.chosen ? st.chosen.name + ' instead of Discovery Bank, ' : ''}the cheapest medical aid and gap cover that cover what you need, and your own quotes for car and life cover. Insurance claims are left out, because any insurer pays claims. Cover is never exactly the same, so check each product's tab before you move.`);
  }

  /* The top five competitors for each product, beside what Discovery costs
     you now. Plain lines, not a table: name and what you get on the left,
     what it costs and how it compares with Discovery on the right. */
  function renderRivals(panel, rivals) {
    if (!rivals.length) return;
    const R = n => money(per(Math.abs(n)));
    blockHeading(panel, 'Discovery next to its top competitors', 'layout-grid');
    el(panel, 'p', 'dc-muted', `For each product, what Discovery costs you now and what the five closest competitors cost. "Real cost" is what you pay less what you get back. Amounts are ${perLabel()}.`);
    const LOGO = { bank: 'bank', medical: 'health', car: 'insure', gap: 'gap', life: 'life' };
    const NOTE = {
      medical: 'Discovery\'s real cost counts the Vitality rewards you get back; the other medical aids have no Vitality.',
      car: 'Nobody publishes car insurance prices, so each insurer shows the most a quote could be and still beat Discovery (after its own rewards and the Drive fuel rewards you would lose).',
      gap: 'The % is how much a plan pays, measured against the medical aid\'s own rate for hospital doctors: 350% pays up to three and a half times that rate. Higher pays more.',
      life: 'Life cover is priced per person: get a quote for the same cover.',
    };
    for (const sec of rivals) {
      const h = el(panel, 'h3', 'dc-h3 dc-rv-h');
      productLogo(el(h, 'span', 'dc-tile'), LOGO[sec.id]);
      el(h, 'span', null, sec.label);
      if (NOTE[sec.id]) el(panel, 'p', 'dc-muted', NOTE[sec.id]);
      const list = el(panel, 'div', 'dc-rv');
      const d = sec.discovery;
      const you = el(list, 'div', 'dc-rv-row is-you');
      const yl = el(you, 'div', 'dc-rv-l');
      el(yl, 'span', 'dc-rv-name', d.name);
      el(yl, 'span', 'dc-rv-what', 'What you have now');
      const yn = el(you, 'div', 'dc-rv-nums');
      el(yn, 'span', null, `Costs ${R(d.pay)}`);
      const dOpen = d.back >= 0.5 && backTap(yn, `back.${sec.id}.discovery`, `Gives back ${R(d.back)}`);
      el(yn, 'span', 'dc-rv-real', d.real >= 0 ? `Real cost ${R(d.real)}` : `You come out ${R(d.real)} ahead`);
      if (dOpen) backBreakdown(list, d.items);
      sec.rivals.forEach((r, ri) => {
        const row = el(list, 'div', 'dc-rv-row');
        const l = el(row, 'div', 'dc-rv-l');
        el(l, 'span', 'dc-rv-name', r.name + (r.quoted ? ' (your quote)' : ''));
        if (r.what) el(l, 'span', 'dc-rv-what', r.what);
        if (r.misses.length) el(l, 'span', 'dc-rv-miss', 'Does not cover: ' + r.misses.map(id => (NEEDS.find(n => n.id === id) || { label: id }).label.toLowerCase()).join(', '));
        const n = el(row, 'div', 'dc-rv-nums');
        if (r.pay === null) {
          el(n, 'span', 'dc-rv-none', 'No published price');
          if (r.quoteUnder) el(n, 'span', 'dc-rv-cmp', `Worth it if a quote is under ${money(r.quoteUnder)} a month`);
          return;
        }
        el(n, 'span', null, `Costs ${R(r.pay)}`);
        const rOpen = r.back >= 0.5 && backTap(n, `back.${sec.id}.${ri}`, `Gives back ${R(r.back)}`);
        const gap = r.real - d.real;
        el(n, 'span', 'dc-rv-cmp ' + (Math.abs(per(gap)) < 0.5 ? '' : gap < 0 ? 'is-cheaper' : 'is-dearer'),
          Math.abs(per(gap)) < 0.5 ? 'About the same as Discovery' : `${R(gap)} ${gap < 0 ? 'cheaper' : 'more'} than Discovery`);
        if (rOpen) backBreakdown(list, r.items);
      });
    }
  }

  /* "Gives back R X" as a tap target; returns whether it is open. */
  function backTap(parent, key, text) {
    const isOpen = open.has(key);
    const b = button(parent, 'dc-tap dc-rv-back', null, () => { isOpen ? open.delete(key) : open.add(key); render(); });
    b.setAttribute('aria-expanded', String(isOpen));
    const lab = el(b, 'span', 'dc-tap-l', text);
    icon(lab, isOpen ? 'chevron-down' : 'chevron-right', 'dc-chev');
    return isOpen;
  }

  /* What the money that comes back actually is: how much is cash, then each
     kind (Miles, discounts, the watch…) with what it means and its items. */
  function backBreakdown(parent, items) {
    const R = n => money(per(Math.abs(n)));
    const box = el(parent, 'div', 'dc-bk');
    const kinds = byKind(items);
    const total = items.reduce((t, i) => t + i.annual, 0);
    const cash = (kinds.find(k => k.kind === 'cash') || { annual: 0 }).annual;
    el(box, 'p', 'dc-bk-sum', Math.abs(per(total)) < 0.5 ? 'Nothing comes back.'
      : Math.abs(per(total - cash)) < 0.5 ? 'All of this is cash in your account.'
        : Math.abs(per(cash)) < 0.5 ? 'None of this is cash. It is only worth something when you use it.'
          : `Only ${R(cash)} ${perLabel()} of this is cash in your account. The rest is only worth something when you use it.`);
    for (const k of kinds) {
      const g = el(box, 'div', 'dc-bk-grp is-' + k.kind);
      const head = el(g, 'div', 'dc-bk-head');
      el(head, 'span', null, k.label);
      el(head, 'span', 'dc-bk-v', R(k.annual));
      el(g, 'p', 'dc-bk-note', k.note);
      for (const i of k.items) {
        const it = el(g, 'div', 'dc-bk-item');
        const nm = el(it, 'span', null, i.label);
        if (i.estimated) el(nm, 'span', 'dc-bk-est', ' (estimate)');
        el(it, 'span', 'dc-bk-v', R(i.annual));
      }
    }
  }

  /* Why one product comes out the way it does, in a sentence. */
  function switchReason(g, R, decided) {
    const row = k => g.rows.find(r => r.key === k);
    const vit = row('vitality') || row('vitality.rewards');
    const drive = row('drive');
    if (g.id === 'bank') return g.saving <= 0 ? 'Discovery\'s rewards are worth more than its extra fees.' : `${row('bank').goName} costs less once you count the rewards.`;
    if (g.id === 'medical') {
      const m = row('medical');
      if (!m || m.assumed) return 'No other plan is priced for your family yet.';
      const cheaper = m.stay - m.go;
      if (cheaper >= 0.5) return `${m.goName} is ${R(cheaper)} cheaper${vit ? (g.saving <= 0 ? ', but you would lose Vitality.' : ', even after losing Vitality.') : '.'}`;
      return `${m.goName}, the cheapest plan that covers what you need, costs ${R(cheaper)} more${vit ? ', and you would lose Vitality' : ''}.`;
    }
    if (g.id === 'car') {
      const c = row('car');
      if (!c || c.assumed) return (drive ? 'You would lose the Vitality Drive fuel rewards. ' : '') + 'There is no car quote yet.';
      const cheaper = c.stay - c.go;
      return `Your quote from ${c.goName} is ${R(cheaper)} ${cheaper >= 0 ? 'cheaper' : 'more'}${drive ? ', but you would lose the Drive fuel rewards' : ''}.`;
    }
    if (g.id === 'gap') {
      const x = row('gap');
      return x.go < x.stay ? `${x.goName} is cheaper.` : 'Discovery\'s gap cover is cheaper.';
    }
    const l = row('life');
    if (!l || l.assumed) return decided ? '' : 'No difference yet: there is no quote.';
    return `Your quote from ${l.goName} ${l.go < l.stay ? 'is cheaper' : 'costs more'}.`;
  }

  /* Every amount behind the boxes, for whoever wants to check them. */
  function switchTable(panel, sw) {
    const t = el(panel, 'div', 'dc-cmp is-market is-3 dc-sw');
    const head = el(t, 'div', 'dc-cmp-r dc-cmp-h');
    for (const x of ['', 'Stay', 'Move']) el(head, 'span', null, x);
    const line = r => {
      const row = el(t, 'div', 'dc-cmp-r');
      const nm = el(row, 'span', 'dc-cmp-name');
      el(nm, 'span', null, r.label);
      const sub = [r.goName, r.goNote].filter(Boolean).join(' · ');
      if (sub) el(nm, 'span', 'dc-cmp-sub', 'If you move: ' + sub);
      for (const v of [r.stay, r.go]) el(row, 'span', 'dc-amt' + (r.assumed && v === r.go && r.go === r.stay ? ' is-assumed' : ''), money(per(v)));
    };
    const sum = (label, a, b, cls) => {
      const row = el(t, 'div', 'dc-cmp-r ' + cls);
      el(row, 'span', null, label);
      for (const v of [a, b]) el(row, 'span', 'dc-amt', money(per(v)));
    };
    const part = (title, kind) => {
      el(el(t, 'div', 'dc-cmp-r dc-sw-grp'), 'span', null, title);
      for (const r of sw.rows.filter(x => x.kind === kind)) line(r);
    };
    part('You pay', 'cost');
    sum('Total you pay', sw.stay.cost, sw.go.cost, 'dc-sw-sub');
    part('You get back in rewards', 'benefit');
    sum('Total you get back', sw.stay.benefit, sw.go.benefit, 'dc-sw-sub');
    sum('Real cost (pay minus get back)', sw.stay.real, sw.go.real, 'is-you dc-sw-net');
  }

  // ── Flows ────────────────────────────────────────────────────────────
  function renderFlows(panel, { pr }) {
    const h = el(panel, 'h2', 'dc-flows-h2');
    el(h, 'span', 'dc-name', 'Where the money goes');
    amt(h, pr.totals.flowNet, { plus: true, cls: 'dc-fig' });
    const p = el(panel, 'p', 'dc-muted');
    p.appendChild(document.createTextNode(`You pay Discovery `));
    amt(p, pr.totals.paid, { cls: 'is-neg' });
    p.appendChild(document.createTextNode(` ${perLabel()} and get `));
    amt(p, pr.totals.value, { cls: 'is-pos' });
    p.appendChild(document.createTextNode(` ${perLabel()} back in cash and rewards. Tap a product to follow its money; its own tab shows where each amount comes from.`));
    flow = mountFlow(panel, { products: pr.products, totals: pr.totals, per, perLabel, onOpen: id => show(id) });
  }

  // ── a product tab ────────────────────────────────────────────────────
  function renderProduct(panel, view, p) {
    const sec = el(panel, 'section', 'dc-ch dc-p-' + p.id);
    sec.setAttribute('aria-labelledby', 'dc-h-' + p.id);
    const head = el(sec, 'div', 'dc-ch-head');
    const tile = el(head, 'span', 'dc-tile');
    productLogo(tile, p.id);
    const titles = el(head, 'div', 'dc-ch-titles');
    const h2 = el(titles, 'h2', 'dc-ch-h2');
    h2.id = 'dc-h-' + p.id;
    el(h2, 'span', 'dc-name', p.name);
    amt(h2, p.figure, { plus: true, cls: 'dc-fig' });
    const sub = el(titles, 'p', 'dc-ch-sub');
    el(sub, 'span', null, SUBTITLE[p.id](view.s));
    el(sub, 'span', null, `${p.figureLabel} ${perLabel()}`);
    const body = el(sec, 'div', 'dc-ch-body');
    const jump = el(body, 'div', 'dc-jump');
    const anchors = {};
    for (const [k, label, ic] of [['figures', 'The numbers', 'scale'], ['tx', 'Transactions', 'receipt'], ['inputs', 'Settings', 'sliders-horizontal']]) {
      button(jump, 'dc-jump-btn', label, () => { if (anchors[k]) anchors[k].scrollIntoView({ block: 'start' }); }, ic);
    }
    anchors.figures = blockHeading(body, 'The numbers', 'scale');
    ({ bank: figuresBank, health: figuresHealth, gap: figuresGap, insure: figuresInsure, life: figuresLife })[p.id](body, view, p);
    anchors.tx = blockHeading(body, 'Transactions', 'receipt');
    renderTransactions(body, p);
    anchors.inputs = blockHeading(body, 'Settings', 'sliders-horizontal');
    INPUTS[p.id](body, view);
    renderDates(body, view.pr.dates, p.id);
  }

  function figuresBank(c, { st }) {
    const ms = st.milesStatement;
    if (ms) {
      const p = el(c, 'p', 'dc-muted');
      p.appendChild(document.createTextNode(`We read your Discovery Miles statement (${ms.rows.toLocaleString('en-US').replace(/,/g, ' ')} entries, ${monthLabel(ms.from)} – ${monthLabel(ms.to)}). When you spent your Miles, each was worth R ${ms.spentValue ? ms.spentValue.toFixed(3).replace('.', ',') : '0,10'}. You spent `));
      amt(p, st.cardSpend, { cls: 'is-plain' });
      p.appendChild(document.createTextNode(` ${perLabel()} on the card.`));
    }
    group(c, 'What the bank costs you', st.lines.filter(l => l.group === 'cost'));
    total(c, `Fees ${perLabel()}`, -st.cost, true);
    group(c, 'What you would lose if you left the bank', st.lines.filter(l => l.group === 'bank'));
    total(c, `Rewards minus fees, ${perLabel()}`, st.net);
    renderCompare(c, st);
    renderDowngrade(c, st);
    el(c, 'h3', 'dc-h3', 'You keep these at any bank');
    el(c, 'p', 'dc-muted', 'These come with the medical aid and Discovery Insure (or any Discovery account), so they are not counted when comparing banks.');
    for (const l of st.lines.filter(x => x.group === 'stays' && !/^healthy|^travel\.health|^activeRewards/.test(x.key))) lineRow(c, l);
    el(c, 'h3', 'dc-h3', 'Any bank would charge or pay these');
    for (const l of st.lines.filter(x => x.group === 'elsewhere')) lineRow(c, l);
  }

  function figuresHealth(c, { st }, p) {
    el(c, 'p', 'dc-grp', 'What you pay');
    if (p.vitalityYear) {
      plainLine(c, 'Medical aid', -p.medicalYear, 'entered', 'The Discovery Health debit order, less the gap cover and Vitality parts.');
      plainLine(c, 'Vitality Health and other', -p.vitalityYear, 'entered', `${money(p.vitalityYear / 12, { cents: true })} a month: what is left of the debit order after the medical aid and gap cover amounts you typed.`);
    } else {
      plainLine(c, 'Discovery Health debit order', -p.medicalYear, 'measured', 'Type your medical aid and gap cover amounts on the Inputs tab to see what this pays for.');
    }
    total(c, `Discovery Health costs ${perLabel()}`, -p.paid, true);
    if (p.splitNote) el(c, 'p', 'dc-note', p.splitNote);
    if (p.note) el(c, 'p', 'dc-note', p.note);
    el(c, 'p', 'dc-grp', 'Paid back');
    plainLine(c, 'Claims Discovery Health paid back to you', p.refunds, 'measured', 'Money back for doctor and pharmacy bills you paid yourself first (DISC MEMB on your statements).', true);
    el(c, 'h3', 'dc-h3', 'Is Vitality Health worth it?');
    el(c, 'p', 'dc-muted', 'This has nothing to do with the bank: you keep these whichever bank you use.');
    const v = st.vitality;
    if (v.premium !== null) plainLine(c, 'Vitality Health fee', -v.premium, 'entered', 'The Vitality part of the Discovery Health debit order.');
    plainLine(c, 'Gym discount (what you saved)', v.gymSaving, 'measured', 'What Virgin Active or Planet Fitness would cost without the Vitality discount, less what you pay now.', true);
    for (const k of ['healthyFood.health', 'healthyCare.health', 'travel.health', 'activeRewards', 'activeRewards.basic']) {
      const l = st.lines.find(x => x.key === k);
      if (l && Math.abs(l.annual) >= 0.5) lineRow(c, l);
    }
    if (v.premium !== null) total(c, `Rewards minus the fee, ${perLabel()}`, v.value - v.premium);
    const cmp = compareHealth(p, plugin.settings);
    if (!cmp) return;
    const mem = cmp.members || {};
    const fam = `${Math.max(1, Number(mem.adults) || 1)} adult${(Number(mem.adults) || 1) > 1 ? 's' : ''}${Number(mem.children) > 0 ? ` and ${mem.children} child${mem.children > 1 ? 'ren' : ''}` : ''}`;
    renderNeeds(c, cmp);
    const needLabel = id => (NEEDS.find(n => n.id === id) || { label: id }).label.toLowerCase();
    renderMarket(c, {
      title: 'Compared with other medical aids',
      intro: `2026 prices for ${fam} (change the family on the Inputs tab). If you leave Discovery Health you also lose Vitality Health, so what Vitality is worth to you after its fee (${money(per(cmp.vitalityNet), { plus: true })} ${perLabel()}) is added to the other medical aids' cost. Discovery's own cheaper plans keep Vitality.`,
      you: 'Discovery Health (now)', cmp, lostLabel: 'Vitality you lose',
      name: r => r.scheme + ' ' + r.plan,
      sub: r => [r.misses.length ? 'does not cover ' + r.misses.map(needLabel).join(', ') : '', r.unsure.length ? 'not sure about ' + r.unsure.map(needLabel).join(', ') : '', r.gapExtra >= 0.5 ? `gap cover costs ${money(per(r.gapExtra))} ${perLabel()} more on this plan (included)` : '', r.network, r.dayToDay].filter(Boolean).join(' · '),
      foot: 'A plan that does not cover something you need is left out of the verdict. Plans differ, so before you move compare the hospitals you may use, the cover for day-to-day visits and the list of chronic conditions. A new scheme can make you wait before some cover starts, and charges more if you join after 35 having ever been without a medical aid. You can keep part of Vitality without Discovery Health: Discovery Bank account holders can join Vitality Active (R159 a month, one person, HealthyFood included) in the banking app. Discovery Gap Cover stops when you leave Discovery Health; the Gap tab shows others.',
    });
  }

  /* Cover for what the family needs: your plan, then each option, one
     mark per need. */
  const MARK = { yes: '✓', limited: '◐', no: '✗', unknown: '?' };
  const MARK_TEXT = { yes: 'covered', limited: 'covered, with limits', no: 'not covered', unknown: 'not confirmed' };
  function renderNeeds(c, cmp) {
    el(c, 'h3', 'dc-h3', 'Does it cover what you need?');
    el(c, 'p', 'dc-muted', `${cmp.needs.map(n => n.label).join(', ')}. Choose which matter to you, and whether your hospital is in each plan's list, on the Inputs tab. ✓ covered · ◐ covered with limits · ✗ not covered · ? not sure.`);
    const t = el(c, 'div', 'dc-needs');
    t.style.setProperty('--n', String(cmp.needs.length));
    const h = el(t, 'div', 'dc-needs-r dc-cmp-h');
    el(h, 'span', null, 'Plan');
    for (const n of cmp.needs) {
      const x = el(h, 'span');
      x.title = n.label + ': ' + n.hint;
      el(x, 'span', 'dc-n-long', n.label.replace(/^Your (\w)/, (_, c) => c.toUpperCase()));
      el(x, 'span', 'dc-n-short', n.short || n.label);
    }
    const line = (name, cover, cls) => {
      const r = el(t, 'div', 'dc-needs-r' + (cls ? ' ' + cls : ''));
      el(r, 'span', 'dc-cmp-name', name);
      for (const n of cmp.needs) {
        const g = cover[n.id] || 'unknown';
        const m = el(r, 'span', 'dc-mark is-' + g, MARK[g]);
        m.setAttribute('aria-label', `${n.label}: ${MARK_TEXT[g]}`);
        m.title = `${n.label}: ${MARK_TEXT[g]}`;
      }
    };
    if (cmp.own) line(cmp.own.scheme + ' ' + cmp.own.plan + ' (now)', cmp.own.cover, 'is-you');
    for (const r of cmp.rows) line(r.scheme + ' ' + r.plan, r.cover, r.likeForLike ? '' : 'is-miss');
    const notes = cmp.own && cmp.own.coverNote ? cmp.own.coverNote : null;
    if (notes) el(c, 'p', 'dc-note', 'Your plan: ' + NEEDS.filter(n => notes[n.id]).map(n => `${n.label} — ${notes[n.id]}`).join(' · '));
  }

  function figuresGap(c, view, p) {
    plainLine(c, 'Gap cover', -p.paid, p.inDebit ? 'entered' : 'measured', p.note || 'Your gap cover debit orders.');
    plainLine(c, 'Claims paid to you', p.claims, 'measured', p.claims ? 'INSGAPCLA payments on your statements.' : 'None in this period.', true);
    total(c, `Claims minus cost, ${perLabel()}`, p.net);
    if (p.claims) el(c, 'p', 'dc-note', 'One big claim can make a year look unusual. In most years gap cover costs money and pays nothing back; it is there for the year something big happens.');
    const cmp = compareGap(p, plugin.settings);
    if (cmp) renderMarket(c, {
      title: 'Compared with other gap cover',
      intro: '2026 family prices, for families whose oldest member is under 45; most charge more after that, so type your own quote on the Inputs tab. Gap cover pays what the medical aid does not when you are in hospital. Discovery Gap Cover is only for Discovery Health members, so if you leave the medical aid it has to go too. The others work with any medical aid.',
      you: 'Discovery Gap Cover (now)', cmp,
      name: r => r.provider + ' ' + r.plan, sub: r => r.cover || '',
      foot: 'A cheaper option usually pays out less. Check how much more than the medical aid rate each one pays, the yearly limit per person, and whether it pays the amounts the medical aid makes you pay yourself. If you are without gap cover for 90 days or more, a new one makes you wait before it pays.',
    });
  }

  function figuresInsure(c, { st }, p) {
    if (p.latestMonthly) plainLine(c, 'Latest monthly debit order', -p.latestMonthly, 'measured', 'The cars, Vitality Drive and SASRIA (riot and strike cover) together.', false, true);
    plainLine(c, 'Discovery Insure debit orders', -p.paid, 'measured', 'DISCINSURE debit orders on your statements.');
    const drive = st.lines.find(l => l.key === 'fuel.drive');
    if (drive) lineRow(c, drive);
    plainLine(c, 'Claims paid to you', p.claims, 'measured', p.claims ? 'INSURE CLA payments on your statements.' : 'None in this period.', true);
    total(c, `What came back minus what you paid, ${perLabel()}`, p.net);
    const cmp = compareInsure(p, plugin.settings);
    if (cmp) renderMarket(c, {
      title: 'Compared with other car insurers',
      intro: `Car insurance depends on the car, the drivers and where you live, so nobody publishes a price for you. Full cover for one car costs about R980 a month in the Western Cape, R1 371 in Gauteng and R800–R1 400 across the country (Hippo via Pineapple, March 2026). Type a quote for the same cars and cover on the Inputs tab. Until then, each insurer shows the most it could charge a month and still beat Discovery, after its own rewards and the Vitality Drive rewards you would lose (${money(per(cmp.driveValue))} ${perLabel()}).`,
      you: 'Discovery Insure (now)', cmp, lostLabel: 'Their rewards', lost: r => r.rewards,
      name: r => r.name, sub: r => r.rewardNote || '',
      foot: 'Compare the same things: the same excess (what you pay yourself on a claim), car hire, and the same drivers.',
    });
    renderHome(c);
  }

  function renderHome(c) {
    const h = compareHome(plugin.settings);
    el(c, 'h3', 'dc-h3', 'Home contents');
    if (!h) {
      el(c, 'p', 'dc-muted', 'Type what you pay for household contents insurance on the Inputs tab (0 if you have none) to compare it.');
      return;
    }
    if (h.range) {
      const r = el(c, 'div', 'dc-ln');
      const main = el(r, 'span', 'dc-ln-main');
      el(main, 'span', null, `Cover for ${money(h.contents)} of contents, from most insurers`);
      el(main, 'span', 'dc-badge is-estimated', SOURCE.estimated);
      el(main, 'span', 'dc-ln-note', `About R${HOME_RANGE.low}–R${HOME_RANGE.high} a month for every R100 000 of contents, depending on your suburb, security and excess. Source: ${h.range.source}.`);
      el(r, 'span', 'dc-amt is-plain', `${money(h.range.low)}–${money(h.range.high)} a month`);
    }
    const none = !(h.current.monthly > 0);
    const value = h.contents !== null ? money(h.contents) : null;
    renderMarket(c, {
      title: none ? 'Not insured: what cover would cost' : 'Compared with other insurers',
      intro: none
        ? `Your household contents are not insured, so if a burglary, fire or burst geyser damages your things, you pay to replace them. ${value ? `Prices are for ${value} of contents` : 'Type what your things would cost to replace on the Inputs tab to see prices'}. If you rent, you only need contents cover; the building is the landlord's.`
        : `Prices are for ${value || 'the contents value you typed'}, against what you pay today.`,
      you: none ? 'No cover today' : 'Your cover (now)', cmp: h, lostLabel: 'Their rewards', lost: r => r.rewards,
      name: r => r.name, sub: r => [r.per100k ? `about ${money(r.per100k)} a month per R100 000` : '', r.rewardNote].filter(Boolean).join(' · '),
      vsLabel: none ? 'A year' : null, vs: none ? r => (r.annual === null ? null : -r.annual) : null,
      foot: 'Insure for what it would cost to buy everything again new. If you insure for less, the insurer pays only part of a claim. Discovery Insure can add contents cover to your car policy.',
    });
  }

  function figuresLife(c, view, p) {
    if (p.monthly) {
      plainLine(c, 'Your share of the cost', -p.monthly * 12, 'entered', `${money(p.monthly, { cents: true })} a month off your salary, so it is not on your bank statements.`);
    } else if (p.paid) {
      plainLine(c, 'Life cover cost', -p.paid, 'measured', 'Discovery Life debit orders on your statements.');
    } else {
      el(c, 'p', 'dc-muted', 'There is no Discovery Life payment in your bank transactions. If it comes off your salary, type it on the Inputs tab.');
    }
    if (p.cover) {
      const r = el(c, 'div', 'dc-ln');
      const main = el(r, 'span', 'dc-ln-main');
      el(main, 'span', null, 'Amount you are covered for');
      el(main, 'span', 'dc-badge is-entered', SOURCE.entered);
      el(r, 'span', 'dc-amt is-plain', money(p.cover));
    }
    const cmp = compareLife(p, plugin.settings);
    if (!cmp) return;
    if (cmp.employer.monthly >= 0.5) {
      plainLine(c, 'Your employer pays', cmp.employer.annual, 'entered', `The cover costs ${money(cmp.total.monthly, { cents: true })} a month in all; you pay ${money(cmp.total.monthly - cmp.employer.monthly, { cents: true })} of it.`, true);
    }
    if (cmp.payback) plainLine(c, 'Group Risk PayBack', cmp.payback, 'entered', 'Money paid back to you, so your share costs less.', true);
    else el(c, 'p', 'dc-note', 'From 1 January 2026, if your employer\'s scheme offers Group Risk PayBack, Diamond members get up to 15% of the yearly cost back after a Vitality Health Check. If you get it, type it on the Inputs tab.');
    if (cmp.lifeOnly) {
      const r = el(c, 'div', 'dc-ln');
      const main = el(r, 'span', 'dc-ln-main');
      el(main, 'span', null, 'Life cover alone on a policy of your own');
      el(main, 'span', 'dc-badge is-estimated', SOURCE.estimated);
      el(main, 'span', 'dc-ln-note', `For your cover amount and age, if you are healthy and do not smoke (smokers pay 50–100% more). Cover for severe illness and lost income would cost extra. Source: ${cmp.lifeOnly.source}.`);
      el(r, 'span', 'dc-amt is-plain', `${money(cmp.lifeOnly.low)}–${money(cmp.lifeOnly.high)} a month`);
    }
    renderMarket(c, {
      title: 'Compared with a policy of your own',
      intro: `Cover through your employer needs no medical tests up to a set amount, and stops when you leave the job (you can then usually keep similar cover without new tests). A policy of your own is all yours to pay, so for the same cover (life, severe illness and lost income together) it has to cost less than your share: ${money(cmp.current.monthly)} a month. Type a quote for the same cover on the Inputs tab.`,
      you: 'Through your employer, your share (now)', cmp, lostLabel: 'Their rewards', lost: r => r.rewards,
      name: r => r.name, sub: r => [r.example, r.rewardNote].filter(Boolean).join(' · '),
      foot: 'Compare the same things: the same cover amounts, how long the income cover waits before it pays and how long it pays, and the same list of severe illnesses.',
    });
  }

  // ── lines, totals and blocks ─────────────────────────────────────────
  function blockHeading(parent, title, ic) {
    const h = el(parent, 'h3', 'dc-blk-h');
    icon(h, ic);
    el(h, 'span', null, title);
    return h;
  }

  function group(c, title, lines) {
    el(c, 'p', 'dc-grp', title);
    for (const l of lines) lineRow(c, l);
  }

  function total(c, label, v, sub) {
    const t = el(c, 'div', 'dc-tot' + (sub ? ' is-sub' : ''));
    el(t, 'span', null, label);
    amt(t, v, { plus: v > 0 });
  }

  /* A verdict in a line: its word in its tone, then the figure behind it —
     ahead of the market (good), what a switch saves (check, over), the
     quote that would match (quote, a month) or what cover costs (none). */
  function verdictFig(parent, v) {
    el(parent, 'span', 'dc-vd is-' + v.tone, v.word);
    if (v.amount === null) return;
    parent.appendChild(document.createTextNode(' '));
    if (v.tone === 'good') amt(parent, v.amount, { plus: true });
    else if (v.tone === 'quote') el(parent, 'span', 'dc-amt is-plain', `under ${money(v.amount)}/m`);
    else if (v.tone === 'none') el(parent, 'span', 'dc-amt is-plain', `${money(per(-v.amount))} ${perLabel()}`);
    else amt(parent, v.amount, { cls: 'is-plain' });
  }

  /* What the amount beside the verdict word means, in words, then why. */
  function verdictLine(v) {
    const a = v.amount === null ? null : `${money(per(Math.abs(v.amount)))} ${perLabel()}`;
    let lead = '';
    /* 'good' also covers a gain too small to switch for */
    if (a !== null && v.tone === 'good' && v.vs) lead = v.amount >= 0 ? `You are ${a} better off than with ${v.vs}.` : `${v.vs} is only ${a} cheaper, too little to switch for.`;
    else if (a !== null && v.tone === 'check') lead = `${v.vs} could save you about ${a}.`;
    else if (a !== null && v.tone === 'over') lead = v.id === 'bank' ? `Moving to ${v.vs} would leave you ${a} better off.` : `Your quote from ${v.vs} is ${a} cheaper.`;
    /* a break-even quote is always a monthly premium */
    else if (v.amount !== null && v.tone === 'quote') lead = `A quote under ${money(v.amount)} a month would beat what you pay now.`;
    else if (a !== null && v.tone === 'none') lead = `About ${a} would insure them.`;
    /* "not insured" reads first, then what cover would cost */
    return (v.tone === 'none' ? v.why + ' ' + lead : lead + ' ' + v.why).trim();
  }

  function tag(parent, p) {
    const t = el(parent, 'span', 'dc-ptag dc-p-' + p.id);
    productLogo(t, p.id);
    el(t, 'span', null, p.short);
    return t;
  }

  /* A figure that is not a statement line: label, source, note, amount. */
  function plainLine(parent, label, v, source, note, plus, raw) {
    const r = el(parent, 'div', 'dc-ln');
    const main = el(r, 'span', 'dc-ln-main');
    el(main, 'span', null, label);
    el(main, 'span', 'dc-badge is-' + source, SOURCE[source]);
    if (note) el(main, 'span', 'dc-ln-note', note);
    amt(r, v, { plus, raw });
  }

  function lineRow(parent, l) {
    const sign = l.sign || 1;
    const isOpen = open.has(l.key);
    const row = el(parent, 'div', 'dc-line' + (isOpen ? ' is-open' : ''));
    const head = button(row, 'dc-line-head', null, () => { isOpen ? open.delete(l.key) : open.add(l.key); render(); });
    head.setAttribute('aria-expanded', String(isOpen));
    const lab = el(head, 'span', 'dc-line-label');
    el(lab, 'span', null, l.label);
    el(lab, 'span', 'dc-badge is-' + l.source, SOURCE[l.source]);
    const v = sign * per(l.annual);
    el(head, 'span', 'dc-amt ' + (Math.abs(v) < 0.5 ? 'is-zero' : v > 0 ? 'is-pos' : 'is-neg'), money(v, { plus: sign > 0 }));
    icon(head, isOpen ? 'chevron-down' : 'chevron-right', 'dc-chev');
    if (!isOpen) return;
    const body = el(row, 'div', 'dc-line-body');
    el(body, 'p', 'dc-muted', l.detail);
    for (const k of l.rateKeys) rateInput(body, k);
  }

  // ── transactions ─────────────────────────────────────────────────────
  function renderTransactions(parent, p) {
    const txs = p.transactions;
    if (!txs.length) {
      el(parent, 'p', 'dc-muted', p.id === 'life' && p.monthly ? 'Nothing here: the cost comes off your salary before it reaches the bank.' : 'No transactions for this product in this period.');
      return;
    }
    const all = open.has('tx.' + p.id);
    const shown = all ? txs : txs.slice(0, TX_SHOWN);
    let month = null, ul = null;
    for (const t of shown) {
      const ym = t.date.slice(0, 7);
      if (ym !== month) {
        month = ym;
        el(parent, 'p', 'dc-tx-month', monthLabel(ym));
        ul = el(parent, 'ul', 'dc-txs');
      }
      const li = el(ul, 'li', 'dc-tx');
      const main = el(li, 'span', 'dc-tx-main');
      el(main, 'span', 'dc-tx-desc', t.description);
      const meta = el(main, 'span', 'dc-tx-meta');
      el(meta, 'span', null, t.month ? 'Miles statement' : dayLabel(t.date));
      if (t.account) el(meta, 'span', null, t.account);
      if (t.note) el(meta, 'span', null, t.note);
      if (t.miles !== undefined) el(li, 'span', 'dc-amt ' + (t.miles >= 0 ? 'is-pos' : 'is-neg'), miles(t.miles));
      else amt(li, t.amount, { raw: true, cents: true, plus: t.amount > 0 });
    }
    if (txs.length > TX_SHOWN) {
      button(parent, 'dc-link', all ? 'Show the latest only' : `Show all ${txs.length}`, () => { all ? open.delete('tx.' + p.id) : open.add('tx.' + p.id); render(); }, all ? 'chevron-down' : 'chevron-right');
    }
  }

  // ── comparison and downgrade (Bank tab) ──────────────────────────────
  function renderCompare(c, st) {
    if (!st.alternatives.length) return;
    el(c, 'h3', 'dc-h3', 'Compared with other banks');
    el(c, 'p', 'dc-muted', `What each bank would cost and give back on your card spend of ${money(per(st.cardSpend))} ${perLabel()}${st.cardSpendSource === 'statement' ? ' (as counted on your Miles statement; payments and debit orders from the card account earn nothing)' : ''}. Tap a bank to compare with it on the Overview.`);
    const t = el(c, 'div', 'dc-cmp');
    const h = el(t, 'div', 'dc-cmp-r dc-cmp-h');
    for (const [x, cls] of [['Bank', ''], ['Fees', 'c-fees'], ['Rewards', 'c-rew'], ['Rewards minus fees', ''], ['If you moved', '']]) el(h, 'span', cls || null, x);
    const d = el(t, 'div', 'dc-cmp-r is-you');
    el(d, 'span', null, 'Discovery Bank (now)');
    amt(d, -st.cost, { cls: 'c-fees' });
    amt(d, st.value, { plus: true, cls: 'c-rew' });
    amt(d, st.net, { plus: true });
    el(d, 'span', 'dc-amt is-zero', '—');
    for (const a of st.alternatives) {
      const r = button(t, 'dc-cmp-r', null, async () => { plugin.settings.compareWith = a.id; await save(); });
      r.setAttribute('aria-pressed', String(!!(st.chosen && st.chosen.id === a.id)));
      el(r, 'span', null, a.name);
      amt(r, -a.fees, { cls: 'c-fees' });
      amt(r, a.rewards, { plus: true, cls: 'c-rew' });
      amt(r, a.net, { plus: true });
      amt(r, a.gainIfSwitch, { plus: true });
    }
    const chosen = st.alternatives.find(a => st.chosen && a.id === st.chosen.id);
    if (chosen && chosen.note) el(c, 'p', 'dc-note', chosen.note);
    for (const a of st.alternatives) {
      if (a.breakEven === null || !a.partners.some(p => !p.known)) continue;
      const names = a.partners.filter(p => !p.known).map(p => p.label).join(' and ');
      el(c, 'p', 'dc-note', `${a.name} would only match Discovery if it paid ${pct(a.breakEven, 0)} back on ${names} (${pct(a.breakEvenCautious, 0)} if we count carefully). It does not publish your rate, so look it up in the ${a.app} app and type it on the Inputs tab.`);
    }
  }

  /* Another provider's price for the same thing, beside Discovery's. A row
     with no price shows the quote that would match (car insurance). */
  function renderMarket(c, o) {
    const { cmp } = o;
    el(c, 'h3', 'dc-h3', o.title);
    el(c, 'p', 'dc-muted', o.intro);
    const t = el(c, 'div', 'dc-cmp is-market' + (o.lostLabel ? '' : ' is-3'));
    const h = el(t, 'div', 'dc-cmp-r dc-cmp-h');
    for (const [x, cls] of [['Option', ''], ['A month', ''], ...(o.lostLabel ? [[o.lostLabel, 'c-lost']] : []), [o.vsLabel || 'If you moved', '']]) el(h, 'span', cls || null, x);
    const d = el(t, 'div', 'dc-cmp-r is-you');
    el(d, 'span', null, o.you);
    amt(d, -cmp.current.monthly, { raw: true });
    if (o.lostLabel) el(d, 'span', 'dc-amt is-zero c-lost', '—');
    el(d, 'span', 'dc-amt is-zero', '—');
    for (const r of cmp.rows) {
      const row = el(t, 'div', 'dc-cmp-r');
      const nm = el(row, 'span', 'dc-cmp-name');
      el(nm, 'span', null, o.name(r));
      const sub = o.sub(r);
      if (sub || r.quoted || r.unconfirmed) el(nm, 'span', 'dc-cmp-sub', [r.quoted ? 'your quote' : r.unconfirmed ? 'price not confirmed' : '', sub].filter(Boolean).join(' · '));
      if (r.monthly === null) el(row, 'span', 'dc-amt is-zero is-words', r.breakEven ? 'get a quote' : 'not published');
      else amt(row, -r.monthly, { raw: true });
      if (o.lostLabel) {
        const lost = o.lost ? o.lost(r) : r.vitalityLost ? -r.vitalityLost : 0;
        if (lost !== null && Math.abs(lost) >= 0.5) amt(row, lost, { plus: true, cls: 'c-lost' });
        else el(row, 'span', 'dc-amt is-zero c-lost', '—');
      }
      const vs = o.vs ? o.vs(r) : r.gainIfSwitch;
      if (o.vs) { if (vs === null) el(row, 'span', 'dc-amt is-zero', '—'); else amt(row, vs); }
      else if (vs !== null) amt(row, vs, { plus: true });
      else if (r.breakEven) el(row, 'span', 'dc-amt is-zero is-words', `pays if under ${money(r.breakEven)} a month`);
      else el(row, 'span', 'dc-amt is-zero', '—');
    }
    el(c, 'p', 'dc-note', (o.vs ? '' : `"${o.vsLabel || 'If you moved'}" is how much better (+) or worse (−) off you would be ${perLabel()}.`) + (o.foot ? ' ' + o.foot : ''));
  }

  function renderDowngrade(c, st) {
    const d = st.downgrade;
    if (!d) return;
    el(c, 'h3', 'dc-h3', 'Or stay with Discovery, on a cheaper account');
    el(c, 'p', 'dc-muted', 'Swap the full Black Suite for just the Black Credit Card Account, and keep Vitality Money. HealthyFood, HealthyCare, fuel, the gameboard and partner Miles stay the same; this is what changes.');
    const row = (label, v) => {
      const r = el(c, 'div', 'dc-ln');
      el(r, 'span', 'dc-ln-main', label);
      amt(r, v, { plus: v > 0 });
    };
    row('Suite fees you would stop paying', st.cost);
    row('Black Credit Card Account fee', -d.fees);
    row(`Fees per payment (about ${Math.round(d.payments)} debit orders and payments a year; the Suite includes them)`, -d.payt);
    for (const ch of d.changes) row(ch.label, ch.delta);
    total(c, `Better (+) or worse (−) off than with the Suite, ${perLabel()}`, d.gainIfDowngrade);
    if (d.gainAfterWatch !== null) {
      el(c, 'p', 'dc-note', `Once your Apple Watch contract ends${d.watchEnds ? ` on ${dayLabel(d.watchEnds)}` : ''}, the Suite no longer gives you the watch, so the cheaper account would leave you ${d.gainAfterWatch >= 0 ? `${money(per(d.gainAfterWatch))} ${perLabel()} better off` : `${money(per(-d.gainAfterWatch))} ${perLabel()} worse off`}, unless you take a new watch.`);
    }
  }

  // ── inputs: one builder per product, used on its tab and on Inputs ───
  function field(parent, label, unit, hint) {
    const f = el(parent, 'label', 'dc-fld');
    const l = el(f, 'span', 'dc-fld-l', label);
    if (unit) el(l, 'span', 'dc-fld-u', ` (${unit})`);
    return { f, hint: h => el(f, 'span', 'dc-fld-h', h || hint) };
  }

  /* A field for a number. A text field with the decimal keypad, not
     type=number: on an iPhone set to South Africa that keypad offers ","
     and a number field quietly drops "2,5" before the page ever sees it.
     parseTyped reads "2,5", "2.5", "1 500" and "R 1 500" alike. */
  function numberInput(f) {
    const inp = el(f, 'input', 'dc-inp');
    inp.type = 'text'; inp.inputMode = 'decimal';
    inp.autocomplete = 'off'; inp.spellcheck = false;
    inp.setAttribute('enterkeyhint', 'done');
    return inp;
  }

  /* A number field's change: blank clears the setting; a value it cannot
     read ("abc", "1,2,3") or a negative one is refused and the old value put
     back, never stored and never silently cleared. What is stored is shown
     back with a decimal comma. */
  function bindNumber(inp, store, key, onSet) {
    inp.addEventListener('change', async () => {
      const prev = store[key];
      const n = parseTyped(inp.value);
      if (n === null) delete store[key];
      else if (!Number.isFinite(n) || n < 0) { inp.value = showTyped(prev); return; }
      else { store[key] = n; inp.value = showTyped(n); }
      if (onSet) onSet();
      await save();
    });
  }

  function rateInput(parent, key) {
    const def = RATES[key];
    if (!def) return;
    const s = plugin.settings;
    if (def.unit === 'yes/no') return yesNoInput(parent, key, def);
    const { f, hint } = field(parent, def.label, def.unit);
    const inp = numberInput(f);
    const over = s.rates[key];
    const fallback = rate({ rates: {} }, key, s.status);
    inp.placeholder = showTyped(fallback);
    inp.value = showTyped(over);
    bindNumber(inp, s.rates, key);
    const src = def.source ? sourceText(def.source) : 'Discovery does not publish this, so type your own figure.';
    hint((over !== undefined ? 'You changed this. Clear it to go back to ' + showTyped(fallback) + '. ' : '') + src);
    if (def.guess) f.classList.add('is-guess');
  }

  /* A yes/no rate (stored as 1 / 0) as a select, not a number to type. */
  function yesNoInput(parent, key, def) {
    const s = plugin.settings;
    const { f, hint } = field(parent, def.label.replace(/ \(1 = yes, 0 = cash\)/, ''));
    const sel = el(f, 'select', 'dc-inp dropdown');
    const fallback = rate({ rates: {} }, key, s.status) >= 1 ? 'Yes' : 'No';
    for (const [v, label] of [['', `Default (${fallback})`], ['1', 'Yes'], ['0', 'No']]) { const o = el(sel, 'option', null, label); o.value = v; }
    sel.value = s.rates[key] === undefined ? '' : String(Number(s.rates[key]) >= 1 ? 1 : 0);
    sel.addEventListener('change', async () => {
      if (sel.value === '') delete s.rates[key]; else s.rates[key] = Number(sel.value);
      await save();
    });
    if (def.source) hint(sourceText(def.source));
  }

  function numField(parent, label, unit, store, key, onSet, hintText) {
    const { f, hint } = field(parent, label, unit);
    const inp = numberInput(f);
    inp.value = showTyped(store[key]);
    bindNumber(inp, store, key, onSet);
    if (hintText) hint(hintText);
  }

  function statusSelect(parent, k, label, hintText) {
    const s = plugin.settings;
    const { f, hint } = field(parent, label);
    const sel = el(f, 'select', 'dc-inp dropdown');
    for (const x of STATUSES) { const o = el(sel, 'option', null, x); o.value = x; }
    sel.value = s.status[k];
    sel.addEventListener('change', async () => { s.status[k] = sel.value; await save(); });
    if (hintText) hint(hintText);
  }

  function altInput(parent, a, fieldName, label) {
    const key = `alt.${a.id}.${fieldName}`;
    const s = plugin.settings;
    const { f } = field(parent, label);
    const inp = numberInput(f);
    const def = rate({ rates: {} }, key, s.status);
    const unpublished = /^partner/.test(fieldName) && !(a.partners[Number(fieldName.slice(7))] || {}).pct;
    inp.placeholder = unpublished ? 'not published' : showTyped(def);
    inp.value = showTyped(s.rates[key]);
    bindNumber(inp, s.rates, key);
  }

  /* One monthly-price field per provider; blank keeps the published
     figure (shown as the placeholder). */
  function quoteInputs(c, product, list, name, published) {
    const s = plugin.settings;
    s.quotes = s.quotes || {};
    const members = s.members || {};
    const g = el(c, 'div', 'dc-fgrid');
    for (const p of list) {
      const key = `${product}.${p.id}`;
      const { f, hint } = field(g, name(p), 'R/month');
      const inp = numberInput(f);
      const pub = product === 'health' ? healthPremium(p, members) : published(p);
      inp.placeholder = pub !== null && pub !== undefined ? showTyped(Math.round(pub * 100) / 100) : 'your quote';
      inp.value = showTyped(s.quotes[key]);
      bindNumber(inp, s.quotes, key);
      hint(p.source + (p.unconfirmed ? ' (unconfirmed)' : ''));
    }
  }

  /* Typed totals (Miles, receipts) belong to the window they were typed in.
     Typing one into a new window starts that window afresh: totals left
     from an earlier window are cleared, not carried into months they were
     never about. Clearing the last one drops the stamp. */
  const stampWindow = (store, key, st) => () => {
    const id = `${st.window.from}..${st.window.to}`;
    if (store.period && store.period !== id) for (const k of Object.keys(store)) if (k !== key && k !== 'period') delete store[k];
    if (Object.keys(store).some(k => k !== 'period')) store.period = id;
    else delete store.period;
  };
  const staleNote = (parent, period, what) => {
    el(parent, 'p', 'dc-note', `${what} typed for ${period.split('..').map(monthLabel).join(' – ')}, not this period. Typing a new one here clears them.`);
  };

  const INPUTS = {
    bank(c, { st }) {
      const s = plugin.settings;
      let g = el(c, 'div', 'dc-fgrid');
      const ms = st.milesStatement;
      statusSelect(g, 'money', 'Vitality Money status', ms ? 'Your Miles statement already gives the real bank figures; this status only changes the estimates.' : null);
      el(c, 'p', 'dc-grp', 'Miles');
      if (ms) {
        const files = budget.miles.files.map(p => p.slice(p.lastIndexOf('/') + 1));
        el(c, 'p', 'dc-muted', `We read ${files.join(', ')} (${ms.rows.toLocaleString('en-US').replace(/,/g, ' ')} entries). Anything you type below is used instead.`);
      } else {
        el(c, 'p', 'dc-muted', 'Bank statements do not show Miles. In Discovery Bank online, go to Discovery Miles → Download transactions and save the file anywhere in this vault; it is read automatically. Or type the totals for this period below.');
      }
      g = el(c, 'div', 'dc-fgrid');
      for (const [k, label, unit] of MILES_INPUTS) numField(g, label, unit, s.actualMiles, k, stampWindow(s.actualMiles, k, st));
      if (st.actualStale) staleNote(c, st.actualStale, 'These Miles were');
      el(c, 'p', 'dc-fld-h','If you type a HealthyFood or HealthyCare total, it is split between the bank\'s part and Vitality Health\'s part using the published percentages.');
      rateInput(g, 'mileValue');
      el(c, 'p', 'dc-grp', 'Vitality Travel receipts');
      el(c, 'p', 'dc-muted', 'Each flight receipt (eReceipt) shows "Total base rate" and "Total Discovery discount". Add them up for all the flights booked in this period.');
      s.travel = s.travel || {};
      g = el(c, 'div', 'dc-fgrid');
      numField(g, 'Total Discovery discount', 'R', s.travel, 'discount', stampWindow(s.travel, 'discount', st));
      numField(g, 'Total base rate (full fares)', 'R', s.travel, 'baseFare', stampWindow(s.travel, 'baseFare', st));
      if (s.travel.period && s.travel.period !== `${st.window.from}..${st.window.to}`) {
        staleNote(c, s.travel.period, 'These totals were');
        el(c, 'p', 'dc-fld-h', 'Until you do, their discount percentages are used on this period\'s Vitality Travel payments.');
      }
      el(c, 'p', 'dc-grp', 'Other banks');
      for (const a of st.alternatives) {
        const box = el(c, 'div', 'dc-alt');
        el(box, 'p', 'dc-alt-name', a.name);
        const ag = el(box, 'div', 'dc-fgrid');
        altInput(ag, a, 'fee', 'Monthly fee (R)');
        altInput(ag, a, 'backPct', 'Rewards on card spend (%)');
        altInput(ag, a, 'capMonthly', 'Most rewards a month (R, 0 = no limit)');
        a.partners.forEach((p, i) => altInput(ag, a, 'partner' + i, `${p.label}: cash back (%), up to ${money(p.capMonthly)} a month`));
        if (a.source) el(box, 'p', 'dc-fld-h', a.source);
      }
      el(c, 'p', 'dc-grp', 'The cheaper Discovery account');
      g = el(c, 'div', 'dc-fgrid');
      rateInput(g, 'ccFee');
      rateInput(g, 'paytFee');
    },
    health(c) {
      const s = plugin.settings;
      s.bill = s.bill || {};
      const g = el(c, 'div', 'dc-fgrid');
      statusSelect(g, 'health', 'Vitality Health status', 'For reference: HealthyFood and flight discounts depend on the yearly Vitality Age assessment and Health Check, not on this status.');
      numField(g, 'Medical aid premium', 'R/month', s.bill, 'medical', null, 'From your Discovery Health contribution table. The rest of the debit order is shown as Vitality and other.');
      rateInput(g, 'gymDiscountPct');
      rateInput(g, 'activeRewardsWithoutBank');
      el(c, 'p', 'dc-grp', 'Other medical aids');
      s.members = s.members || {};
      const mg = el(c, 'div', 'dc-fgrid');
      numField(mg, 'Adults on the medical aid', 'people', s.members, 'adults', null, 'You and your spouse or partner. Used to price other medical aids for your family.');
      numField(mg, 'Children on the medical aid', 'children', s.members, 'children', null, 'Most schemes charge for the first three only.');
      quoteInputs(c, 'health', HEALTH_PLANS, p => p.scheme + ' ' + p.plan, () => null);
      s.health = s.health || {};
      el(c, 'p', 'dc-grp', 'What the medical aid must cover');
      const { f: pf, hint: phint } = field(c, 'Your plan now');
      const psel = el(pf, 'select', 'dc-inp dropdown');
      for (const [v, label] of [['', 'Not listed']].concat(HEALTH_OWN.concat(HEALTH_PLANS).map(x => [x.id, x.scheme + ' ' + x.plan]))) { const o = el(psel, 'option', null, label); o.value = v; }
      psel.value = s.health.plan || '';
      psel.addEventListener('change', async () => { s.health.plan = psel.value || undefined; await save(); });
      phint('Its cover is shown next to the others.');
      const ng = el(c, 'div', 'dc-fgrid');
      const ticked = Array.isArray(s.health.needs) ? s.health.needs : NEEDS.map(n => n.id);
      /* toggle buttons, not checkboxes: a whole row to tap on a phone */
      for (const n of NEEDS) {
        const on = ticked.includes(n.id);
        const b = button(ng, 'dc-need-tog', null, async () => {
          const now = Array.isArray(s.health.needs) ? s.health.needs.slice() : NEEDS.map(x => x.id);
          s.health.needs = on ? now.filter(x => x !== n.id) : Array.from(new Set(now.concat(n.id)));
          await save();
        });
        b.setAttribute('aria-pressed', String(on));
        el(b, 'span', 'dc-need-mark', on ? '✓' : '');
        const t = el(b, 'span', 'dc-need-t');
        el(t, 'span', 'dc-fld-l', n.label);
        el(t, 'span', 'dc-fld-h', n.hint);
      }
      el(c, 'p', 'dc-grp', 'Is your hospital on each plan\'s list?');
      el(c, 'p', 'dc-muted', 'Check each plan\'s list of hospitals for planned operations. At a hospital not on the list, most plans pay less or make you pay part yourself.');
      s.health.cover = s.health.cover || {};
      const hg = el(c, 'div', 'dc-fgrid');
      for (const p of HEALTH_PLANS) {
        const { f, hint } = field(hg, p.scheme + ' ' + p.plan);
        const sel = el(f, 'select', 'dc-inp dropdown');
        for (const [v, label] of [['unknown', 'Not sure'], ['yes', 'On the list'], ['limited', 'Covered, but you pay part'], ['no', 'Not on the list']]) { const o = el(sel, 'option', null, label); o.value = v; }
        const cur = (s.health.cover[p.id] || {}).hospital;
        sel.value = GRADES.includes(cur) ? cur : 'unknown';
        sel.addEventListener('change', async () => {
          s.health.cover[p.id] = { ...(s.health.cover[p.id] || {}), hospital: sel.value };
          await save();
        });
        if (p.coverNote && p.coverNote.hospital) hint(p.coverNote.hospital);
      }
    },
    gap(c) {
      const s = plugin.settings;
      s.bill = s.bill || {};
      const g = el(c, 'div', 'dc-fgrid');
      numField(g, 'Gap cover, if it is in the Discovery Health debit order', 'R/month', s.bill, 'gap', null, 'Leave blank if gap cover has its own debit order.');
      el(c, 'p', 'dc-grp', 'Other gap cover');
      quoteInputs(c, 'gap', GAP_PLANS, p => p.provider + ' ' + p.plan, p => p.monthly);
    },
    insure(c, { st }) {
      const g = el(c, 'div', 'dc-fgrid');
      statusSelect(g, 'drive', 'Vitality Drive status');
      rateInput(g, 'driveFunderAccount');
      rateInput(g, 'fuelDrivePct');
      rateInput(g, 'fuelCap');
      numField(g, 'Vitality Drive rewards this period, if you know them', 'R', plugin.settings.actualMiles, 'fuelDriveCash', stampWindow(plugin.settings.actualMiles, 'fuelDriveCash', st), 'From the Insure app: cash paid or Insure Funder Account deposits. Replaces the estimate.');
      if (st.actualStale && plugin.settings.actualMiles.fuelDriveCash !== undefined) staleNote(c, st.actualStale, 'The Drive rewards were');
      el(c, 'p', 'dc-grp', 'Quotes from other insurers');
      el(c, 'p', 'dc-muted', 'For the same cars, drivers and cover. Most give a quote online in a few minutes.');
      quoteInputs(c, 'insure', INSURERS, a => a.name, () => null);
      const s = plugin.settings;
      s.home = s.home || {};
      el(c, 'p', 'dc-grp', 'Home contents');
      const hg = el(c, 'div', 'dc-fgrid');
      numField(hg, 'What you pay for contents insurance', 'R/month', s.home, 'monthly', null, 'Type 0 if you have no contents cover.');
      numField(hg, 'Value of your contents', 'R', s.home, 'contents', null, 'What it would cost to replace everything new: furniture, clothes, appliances, electronics.');
      const contents = Number(s.home.contents) > 0 ? Number(s.home.contents) : null;
      quoteInputs(c, 'home', HOME_INSURERS, a => a.name, a => (a.per100k && contents ? (a.per100k * contents) / 100000 : null));
    },
    life(c) {
      const s = plugin.settings;
      s.life = s.life || {};
      const g = el(c, 'div', 'dc-fgrid');
      numField(g, 'Your share of the life cover cost', 'R/month', s.life, 'monthly', null, 'If it comes off your salary, it is not on your bank statements.');
      numField(g, 'Cover', 'R', s.life, 'cover');
      numField(g, 'Full cost, employer and you together', 'R/month', s.life, 'total', null, 'From the cost summary on your benefit statement. Leave blank if you pay all of it.');
      numField(g, 'Your age', 'years', s.life, 'age', null, 'Used to price life cover alone on a policy of your own.');
      numField(g, 'Group Risk PayBack received', 'R/year', s.life, 'payback', null, 'If your employer\'s scheme pays it: find it in the Discovery app under Group Risk.');
      el(c, 'p', 'dc-grp', 'Quotes for a policy of your own');
      el(c, 'p', 'dc-muted', 'For the same life, severe illness and income cover, all together.');
      quoteInputs(c, 'life', LIFE_OFFERS, o => o.name, o => o.monthly);
    },
  };

  function renderInputs(panel, view) {
    const h = el(panel, 'h2', 'dc-flows-h2');
    el(h, 'span', 'dc-name', 'Inputs');
    el(panel, 'p', 'dc-muted', 'Everything you can set, by product. The same inputs sit at the bottom of each product\'s tab.');
    const gen = el(panel, 'section', 'dc-ch dc-p-none');
    const gh = el(gen, 'div', 'dc-ch-head');
    const gt = el(gh, 'span', 'dc-tile is-plain');
    icon(gt, 'sliders-horizontal');
    const gtt = el(gh, 'div', 'dc-ch-titles');
    el(gtt, 'h2', 'dc-ch-h2', 'For the whole page');
    const gb = el(gen, 'div', 'dc-ch-body');
    const g = el(gb, 'div', 'dc-fgrid');
    const s = plugin.settings;
    const { f: mf, hint } = field(g, 'Months to look back');
    const msel = el(mf, 'select', 'dc-inp dropdown');
    for (const n of [3, 6, 12, 24]) { const o = el(msel, 'option', null, `${n} months`); o.value = String(n); }
    msel.value = String(s.months);
    msel.addEventListener('change', async () => { s.months = Number(msel.value); await save(); });
    hint(`${monthLabel(view.m.from)} – ${monthLabel(view.m.to)}`);
    const { f: cf } = field(g, 'Compare with');
    const csel = el(cf, 'select', 'dc-inp dropdown');
    for (const a of view.st.alternatives) { const o = el(csel, 'option', null, a.name); o.value = a.id; }
    csel.value = view.st.chosen ? view.st.chosen.id : '';
    csel.addEventListener('change', async () => { s.compareWith = csel.value; await save(); });
    for (const p of view.pr.products) {
      const sec = el(panel, 'section', 'dc-ch dc-p-' + p.id);
      const head = el(sec, 'div', 'dc-ch-head');
      const tile = el(head, 'span', 'dc-tile');
      productLogo(tile, p.id);
      const titles = el(head, 'div', 'dc-ch-titles');
      const h2 = el(titles, 'h2', 'dc-ch-h2');
      el(h2, 'span', 'dc-name', p.name);
      amt(h2, p.figure, { plus: true, cls: 'dc-fig' });
      const body = el(sec, 'div', 'dc-ch-body');
      INPUTS[p.id](body, view);
    }
  }

  function renderFoot(panel, { m, st }) {
    const f = el(panel, 'div', 'dc-foot');
    const excl = Object.entries(m.excludedFromSpend).filter(([, v]) => Math.abs(v) >= 1);
    if (excl.length && tab() === 'bank') {
      const scale = 12 / st.window.months;
      el(f, 'p', null, `Paid from the card account but not card purchases (transfers, savings and the categories you listed in settings), ${perLabel()}: ` +
        excl.map(([k, v]) => `${k} ${money(per(v * scale))}`).join(' · ') + '.');
    }
    el(f, 'p', null, 'Some figures are estimates; each product tab shows the rate behind them. Discovery changes its rates every year. This is a calculator, not financial advice.');
  }

  return {
    refresh, render,
    destroy() { if (flow) flow.destroy(); if (ro) ro.disconnect(); if (tabSaveTimer) { clearTimeout(tabSaveTimer); plugin.saveSettings(); } clear(root); },
  };
}

module.exports = { mountBottomLine };
