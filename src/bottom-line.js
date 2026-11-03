'use strict';
/* The page, one tab at a time behind a switcher that is always in view:
   Overview, Compare, Benefits, Flows, a tab for each Discovery product the
   person has (Bank, Health, Gap cover, Insure, Life) and Inputs. Until the
   first-run questions are answered (settings.onboarded) the page shows them
   instead. Each product tab is one bordered section in its own colour —
   figures, then transactions, then the inputs that change it — and every
   input also lives on the Inputs tab. Every input saves to settings and
   re-renders from the cached measurement; the vault is read once per
   refresh. */

const { el, icon, button, clear, checkRow } = require('./dom');
const { money, pct, monthLabel, dayLabel, miles, parseTyped, showTyped } = require('./format');
const { measure, trailingWindow } = require('./measure');
const { summariseMiles } = require('./miles');
const { buildStatement } = require('./model');
const { buildProducts } = require('./products');
const { buildVerdicts, MATERIAL } = require('./verdict');
const { detectProducts, detectBanking, resolveProducts, resolveVitality, resolveSuite, PRODUCT_NAMES } = require('./detect');
const { marketAge, MARKET } = require('./market');
const { BENEFITS } = require('./benefits');
const { renderOnboarding } = require('./onboarding');
const { buildSwitch, buildRivals, byKind } = require('./switch');
const { NEEDS, GRADES, compareHealth, compareGap, compareInsure, compareLife, compareHome, healthPremium, HEALTH_PLANS, HEALTH_OWN, GAP_PLANS, INSURERS, LIFE_OFFERS, HOME_INSURERS, HOME_RANGE } = require('./compare');
const { mountFlow } = require('./ui-flow');
const { RATES, SUITES, rate, sourceText, suiteOf, bankProductOf } = require('./rates');
const { renderWelcome, NOTICE_LINE, noticeMore } = require('./welcome');
const { productLogo } = require('./logos');
const { drawMark } = require('./art');
const { STATUSES } = require('./constants');

const { renderBenefits } = require('./ui-benefits');

const SOURCE = { measured: 'From your statements', statement: 'From your Miles statement', estimated: 'Estimate', entered: 'You entered' };
const MILES_INPUTS = [
  ['card', 'Base Miles on card spend', 'Miles'],
  ['healthyFood', 'HealthyFood Miles (Money + Health)', 'Miles'],
  ['healthyCare', 'HealthyCare Miles (Money + Health)', 'Miles'],
  ['fuel', 'Vitality Money fuel Miles', 'Miles'],
];
const PRODUCT_IDS = ['bank', 'health', 'gap', 'insure', 'life'];
/* The tabs for what the person has: the same four pages for everyone, then
   one tab per chosen Discovery product, then Inputs. */
const tabsFor = chosen => [
  { id: 'overview', name: 'Overview', icon: 'layout-grid' },
  { id: 'compare', name: 'Compare', icon: 'arrow-left-right' },
  { id: 'benefits', name: 'Benefits', icon: 'gift' },
  { id: 'flows', name: 'Flows', icon: 'waypoints' },
  ...PRODUCT_IDS.filter(id => chosen && chosen[id]).map(id => ({ id, product: true })),
  { id: 'inputs', name: 'Inputs', icon: 'sliders-horizontal' },
];
/* What the page counts with. A bank question that was skipped is answered by
   what the account notes show (the product and the tier), never by the plain
   default, so "Skip for now" does not change a verdict. This copy is for
   reading only: anything that writes goes to plugin.settings. */
function effectiveSettings(s, banking) {
  let out = s;
  if (!s.bankKind && banking.kind) out = { ...out, bankKind: banking.kind };
  let tier;
  if (typeof resolveSuite === 'function') tier = resolveSuite(s, banking);
  else tier = s.suiteAnswered === true || s.bankKind ? s.suite : (banking.tier || s.suite);
  if (tier && tier !== out.suite) out = { ...out, suite: tier };
  return out;
}
/* a verdict that says there is not enough to judge */
const isUnknown = v => !!v && v.tone === 'unknown';
const KIND_LABELS = { suite: 'Suite (account and card)', card: 'Credit card only', transaction: 'Transaction account only', savings: 'Savings only' };
/* "Gold Suite", "Black Credit Card Account", "Transaction Account": the
   person's own Discovery Bank product, as the rates know it (a null kind is
   counted as a Suite, the same as the sums). */
function bankName(s) {
  const kind = s.bankKind || 'suite';
  if (kind === 'savings') return 'Savings account';
  const p = bankProductOf({ suite: s.suite, bankKind: kind, bankFees: s.bankFees });
  return String(p.label).replace(/\s*\(.*\)\s*$/, '');
}
const SUBTITLE = {
  bank: (s, v) => `${bankName(s)}${v.vitality.money ? ` · Vitality Money ${s.status.money}` : ''}`,
  health: (s, v) => `Medical aid${v.vitality.health ? ` · Vitality Health ${s.status.health}` : ''}`,
  gap: () => 'Pays what the medical aid does not',
  insure: (s, v) => `Cars${v.vitality.drive ? ` · Vitality Drive ${s.status.drive}` : ''}${s.home && Number(s.home.monthly) === 0 && s.home.monthly !== '' && s.home.monthly !== null ? ' · home contents not insured' : ''}`,
  life: () => 'Through your payslip or a debit order',
};
/* each page's title and its one line, under the kicker */
const TITLES = { overview: 'Is it worth it?', compare: 'Stay or switch?', benefits: 'Your benefits', flows: 'Where the money goes', inputs: 'Inputs' };
const SUBS = {
  overview: 'What you pay Discovery, and what comes back.',
  compare: 'Stay with Discovery, or move everything.',
  benefits: 'Pick the ones you use. Only those count.',
  flows: 'Tap a product to follow its money.',
  inputs: 'Everything you can set, in one place.',
};
/* settings.conditions, one line per answer */
const CHECKS = [{ value: 'both', label: 'Both' }, { value: 'one', label: 'One of them' }, { value: 'none', label: 'Neither' }];
const YES_NO = [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }];
const INSURE_PLANS = [{ value: 'core', label: 'Core' }, { value: 'essential', label: 'Essential' }, { value: 'classic', label: 'Classic' }, { value: 'purple', label: 'Purple' }, { value: '', label: 'Not sure' }];
const HOME_COVER = [{ value: 'both', label: 'Building and contents' }, { value: 'one', label: 'One of them' }, { value: 'none', label: 'No' }];
/* a product's name in the rail */
const NAV_NAME = { bank: 'Bank', health: 'Health', gap: 'Gap cover', insure: 'Insure', life: 'Life' };
const TX_SHOWN = 30;
/* how you spend your Miles (settings.milesUse): one line each */
const MILES_USE = [
  { value: 'dday', label: 'On Ð-Day (the 15th)' },
  { value: 'partners', label: 'At Discovery Miles partners' },
  { value: 'utilities', label: 'Electricity, data or airtime' },
  { value: 'none', label: 'I don\'t spend them' },
];

function mountBottomLine(root, ctx) {
  const plugin = ctx.plugin;
  const now = ctx.now || (() => new Date());
  let budget = null;
  let flow = null;
  /* what is open (a More, a line, a list), kept across re-renders */
  const open = new Set();
  /* the phone's side menu: open or not, kept across re-renders */
  let menuOpen = false;
  const wrap = el(root, 'div', 'dc-page');
  /* the page scrolls inside .dc-main; the rail (or the phone's bar) stays */
  const scroller = () => wrap.querySelector('.dc-main') || wrap;
  let currentProducts = [];
  const parentProduct = id => currentProducts.find(p => p.id === id);
  /* the tabs for what this person has, and the page being drawn (the
     lines, notes and inputs read it) */
  let currentTabs = tabsFor(null);
  let cur = null;
  /* what the budget shows, worked out once per refresh */
  let detectedCache = null;
  const detection = () => {
    if (!detectedCache) detectedCache = { detected: detectProducts(budget), banking: detectBanking(budget) };
    return detectedCache;
  };

  /* The layout follows the pane's own width (a sidebar or a phone), not the
     window's — container queries need iOS 16, the floor here is iOS 15.
     Under 760px the rail becomes a top bar and a side menu; .dc-menu-ready
     turns the menu's slide on a frame after that, so it never animates in
     from a resize. */
  const applyWidth = () => {
    const w = wrap.clientWidth;
    if (!w) return;
    const set = (c, on) => { if (wrap.classList.contains(c) !== on) wrap.classList.toggle(c, on); };
    set('is-medium', w < 1040);
    set('is-narrow', w < 760);
    set('is-phone', w < 520);
    if (w >= 760) {
      set('dc-menu-ready', false);
      if (menuOpen) setMenu(false, false);
    } else if (!wrap.classList.contains('dc-menu-ready')) {
      requestAnimationFrame(() => { if (wrap.clientWidth < 760) wrap.classList.add('dc-menu-ready'); });
    }
  };
  let ro = null;
  /* a frame later, so the class change is not made inside the observer's
     own callback ("ResizeObserver loop completed with undelivered
     notifications") */
  if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(() => requestAnimationFrame(applyWidth)); ro.observe(wrap); }

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
  /* a positive amount for prose: the words say which way it goes */
  const R = n => money(per(Math.abs(n)));
  /* a saved tab that is now hidden (a product you no longer have) falls back */
  const tab = () => (currentTabs.some(t => t.id === plugin.settings.tab) ? plugin.settings.tab : 'overview');
  const amt = (parent, v, opts) => {
    const o = opts || {};
    const shown = o.raw ? v : per(v);
    return el(parent, o.tag || 'span', 'dc-amt ' + (o.cls || '') + (Math.abs(shown) < 0.5 ? ' is-zero' : shown > 0 ? ' is-pos' : ' is-neg'), money(shown, { plus: o.plus, cents: o.cents }));
  };

  async function refresh() {
    budget = await plugin.readBudget();
    detectedCache = null;
    requestRender(null);
  }

  /* ── the phone's side menu ──────────────────────────────────────────
     The rail's pages slide in from the left over a dimmed backdrop. Open:
     focus goes to the open page's button and Tab stays inside; Escape, the
     backdrop or the close button shut it and focus goes back to the menu
     button. */
  function setMenu(on, restore) {
    menuOpen = on;
    wrap.classList.toggle('dc-menu-open', on);
    const t = wrap.querySelector('.dc-nav-menu');
    if (t) {
      t.setAttribute('aria-expanded', String(on));
      t.setAttribute('aria-label', on ? 'Close menu' : 'Open menu');
    }
    if (on) {
      const c = wrap.querySelector('.dc-nav .dc-tab[aria-selected="true"]') || wrap.querySelector('.dc-nav .dc-tab');
      if (c) c.focus();
    } else if (restore !== false && t) t.focus();
  }
  root.addEventListener('keydown', e => {
    if (!menuOpen) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setMenu(false);
      return;
    }
    if (e.key !== 'Tab') return;
    const drawer = wrap.querySelector('.dc-nav-drawer');
    if (!drawer) return;
    const items = Array.prototype.filter.call(drawer.querySelectorAll('button'), b => b.offsetWidth > 0);
    if (!items.length) return;
    const at = items.indexOf(document.activeElement);
    const last = items.length - 1;
    if (e.shiftKey ? at <= 0 : at === last || at < 0) {
      e.preventDefault();
      items[e.shiftKey ? last : 0].focus();
    }
  });

  let tabSaveTimer = null;
  function show(id) {
    const nav = wrap.querySelector('.dc-nav');
    const fromNav = !!nav && nav.contains(document.activeElement);
    plugin.settings.tab = id;
    if (menuOpen) { menuOpen = false; wrap.classList.remove('dc-menu-open'); }
    render();
    scroller().scrollTop = 0;
    if (fromNav) {
      const n = wrap.classList.contains('is-narrow') ? wrap.querySelector('.dc-nav-menu') : wrap.querySelector('#dc-tab-' + id);
      if (n) n.focus();
    }
    /* remembering the tab is not worth a data.json write per click */
    clearTimeout(tabSaveTimer);
    tabSaveTimer = setTimeout(() => plugin.saveSettings(), 1500);
  }

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
      onReady: applyWidth,
    });
    applyWidth();
  }

  function render() {
    const welcoming = !welcomed && plugin.settings.welcome !== false;
    /* the welcome fills the whole pane, so the pane itself takes its colour */
    root.classList.toggle('dc-welcoming', welcoming);
    wrap.classList.toggle('has-welcome', welcoming);
    if (welcoming) return renderWelcomeOnce();
    const s = plugin.settings;
    /* the first-run questions: built once and left alone (a refresh must not
       restart them), until they are finished or skipped */
    const onboarding = !!budget && budget.folder !== null && !s.onboarded;
    root.classList.toggle('dc-onboarding', onboarding);
    if (onboarding && wrap.querySelector('.dc-onb')) return;
    const scrollTop = scroller().scrollTop;
    applyWidth();
    if (flow) { flow.destroy(); flow = null; }
    clear(wrap);
    wrap.classList.toggle('dc-menu-open', menuOpen);
    if (!budget || budget.folder === null) return renderEmpty();
    const win = trailingWindow(now(), s.months);
    const m = measure(budget.rows, budget.accounts, budget.categories, { ...win, notCardSpend: s.notCardSpend });
    const ms = budget.miles ? summariseMiles(budget.miles.rows, m.from, m.to) : null;
    /* what the person has: their answers, else what the budget shows */
    const { detected, banking } = detection();
    const products = resolveProducts(s, detected);
    const vitality = resolveVitality(s, detected, banking);
    /* an unanswered bank product is read from the account notes, not taken
       as a Suite */
    const eff = effectiveSettings(s, banking);
    const st = buildStatement(m, eff, ms, { products, vitality });
    if (onboarding) {
      const main = el(wrap, 'main', 'dc-main dc-main-solo');
      renderOnboarding(main, {
        settings: s, budget, detected, measured: m, statement: st,
        save: () => plugin.saveSettings(),
        onDone: () => { render(); scroller().scrollTop = 0; },
      });
      applyWidth();
      return;
    }
    const pr = buildProducts(st, m, ms, s, now(), products);
    /* P looks up any product, chosen or not: the comparisons read all five */
    const P = id => pr.all.find(p => p.id === id);
    const cmp = { health: compareHealth(P('health'), s), gap: compareGap(P('gap'), s), insure: compareInsure(P('insure'), s), life: compareLife(P('life'), s), home: compareHome(s) };
    const view = { s, eff, m, ms, st, pr, P, cmp, products, vitality, banking, detected, bankName: products.bank ? bankName(eff) : '', verdicts: buildVerdicts(st, cmp, products), sw: buildSwitch(st, cmp, products), rivals: buildRivals(st, cmp, products) };
    cur = view;
    currentProducts = pr.products;
    currentTabs = tabsFor(products);

    const panel = renderShell(view);
    const t = tab();
    if (t === 'overview') renderOverview(panel, view);
    else if (t === 'compare') renderSwitch(panel, view);
    else if (t === 'benefits') renderBenefitsTab(panel, view);
    else if (t === 'flows') renderFlows(panel, view);
    else if (t === 'inputs') renderInputs(panel, view);
    else renderProduct(panel, view, view.P(t));
    renderFoot(panel, view);
    applyWidth();
    scroller().scrollTop = scrollTop;
  }

  function renderEmpty() {
    const main = el(wrap, 'main', 'dc-main dc-main-solo');
    const c = el(main, 'div', 'dc-empty');
    el(c, 'h2', 'dc-empty-title', 'No budget found');
    el(c, 'p', 'dc-empty-text', 'This reads the Budget plugin\'s Transactions folder.');
    const mb = moreIn(c, 'empty.more');
    el(mb, 'p', null, 'The notes it reads look like Transactions/<account>/<YYYY-MM>.md. Set the budget folder in this plugin\'s settings if it lives somewhere unusual.');
  }

  // ── the shell: rail (or the phone's bar and menu) and the page ───────
  let lastTab = null;
  function renderShell(view) {
    const { m, st, P } = view;
    const t = tab();
    const curTab = currentTabs.find(x => x.id === t);
    const curP = curTab.product ? P(curTab.id) : null;
    const shell = el(wrap, 'div', 'dc-shell');
    const nav = el(shell, 'nav', 'dc-nav');
    nav.setAttribute('aria-label', 'Is Discovery Worth It?');
    const brand = el(nav, 'div', 'dc-brand');
    drawMark(brand, 'app', 'dc-brand-mark', 30);
    const bt = el(brand, 'div', 'dc-brand-text');
    el(bt, 'span', 'dc-brand-name', 'IS DISCOVERY');
    el(bt, 'span', 'dc-brand-sub', 'worth it?');
    /* the phone's bar: the open page, then the menu button */
    const here = el(nav, 'div', 'dc-nav-current' + (curP ? ' dc-p-' + curP.id : ''));
    here.setAttribute('aria-hidden', 'true');
    const hi = el(here, 'span', 'dc-nav-current-icon');
    if (curP) productLogo(hi, curP.id); else icon(hi, curTab.icon);
    el(here, 'span', 'dc-nav-current-name', curP ? NAV_NAME[curP.id] : curTab.name);
    const menuBtn = button(nav, 'dc-nav-menu', null, () => setMenu(!menuOpen), 'menu');
    menuBtn.setAttribute('aria-expanded', String(menuOpen));
    menuBtn.setAttribute('aria-label', menuOpen ? 'Close menu' : 'Open menu');
    menuBtn.setAttribute('aria-controls', 'dc-nav-drawer');
    const drawer = el(nav, 'div', 'dc-nav-drawer');
    drawer.id = 'dc-nav-drawer';
    const dh = el(drawer, 'div', 'dc-nav-drawer-head');
    el(dh, 'span', 'dc-nav-drawer-title', 'Pages');
    const close = button(dh, 'dc-nav-close', null, () => setMenu(false), 'x');
    close.setAttribute('aria-label', 'Close menu');
    renderTabs(drawer, view);
    const foot = el(drawer, 'div', 'dc-nav-foot');
    el(foot, 'p', 'dc-nav-window', `${monthLabel(m.from)} – ${monthLabel(m.to)}`);
    el(foot, 'p', 'dc-nav-meta', `${st.window.months} months · ${m.rowsSeen.toLocaleString('en-US').replace(/,/g, ' ')} transactions`);
    const scrim = el(shell, 'div', 'dc-nav-scrim');
    scrim.addEventListener('click', () => setMenu(false));

    const stage = el(shell, 'div', 'dc-stage');
    const main = el(stage, 'main', 'dc-main');
    /* arriving on a page plays its entrance; a repaint of the same page does not */
    const entering = lastTab !== t;
    lastTab = t;
    const content = el(main, 'div', 'dc-content dc-content-' + (curTab.product ? 'product' : t) + (entering ? ' is-entering' : ''));
    content.id = 'dc-panel';
    content.setAttribute('role', 'tabpanel');
    content.setAttribute('aria-labelledby', 'dc-tab-' + t);
    pageHead(content, view, curTab, curP);
    /* the Overview says it with the confidence notes when there are any */
    const notes = st.confidence && st.confidence.thin && (st.confidence.notes || []).length;
    const pm = curP && st.confidence && st.confidence.productMonths ? st.confidence.productMonths[curP.id] : undefined;
    if (curP && Number.isFinite(pm) && pm > 0 && pm < st.window.months) {
      hint(content, `Only ${pm} of ${st.window.months} months have ${NAV_NAME[curP.id]} payments, so the rest is scaled up.`, 'info');
    } else if (st.window.dataMonths < st.window.months && ((t === 'overview' && !notes) || curP)) {
      hint(content, `Only ${st.window.dataMonths} of ${st.window.months} months have Discovery payments, so the rest is scaled up.`, 'info');
    }
    return content;
  }

  function renderTabs(parent, { P }) {
    const TABS = currentTabs;
    const list = el(parent, 'div', 'dc-tabs-list');
    list.setAttribute('role', 'tablist');
    list.setAttribute('aria-label', 'Pages');
    list.setAttribute('aria-orientation', 'vertical');
    TABS.forEach((t, i) => {
      if (t.product && !TABS[i - 1].product) el(list, 'p', 'dc-nav-label', 'Your products').setAttribute('aria-hidden', 'true');
      if (t.id === 'inputs') el(list, 'div', 'dc-nav-gap').setAttribute('aria-hidden', 'true');
      const p = t.product ? P(t.id) : null;
      const on = tab() === t.id;
      const b = button(list, 'dc-tab' + (p ? ' dc-p-' + p.id : '') + (on ? ' is-active' : ''), null, () => show(t.id));
      b.id = 'dc-tab-' + t.id;
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-controls', 'dc-panel');
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
      const ic = el(b, 'span', 'dc-tab-icon');
      if (p) productLogo(ic, p.id); else icon(ic, t.icon);
      el(b, 'span', 'dc-tab-name', p ? NAV_NAME[p.id] : t.name);
      b.addEventListener('keydown', e => {
        const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
        const jump = { Home: 0, End: TABS.length - 1 }[e.key];
        if (!step && jump === undefined) return;
        e.preventDefault();
        const next = TABS[jump !== undefined ? jump : (i + step + TABS.length) % TABS.length].id;
        const wasOpen = menuOpen;
        show(next);
        if (wasOpen) setMenu(true);
        const n = wrap.querySelector('#dc-tab-' + next);
        if (n) n.focus();
      });
    });
  }

  /* The page's head: a small tracked kicker, the title, one line under it,
     and Monthly / Yearly on the right. */
  function pageHead(content, { m, eff, st }, curTab, p) {
    const head = el(content, 'header', 'dc-head');
    const titles = el(head, 'div', 'dc-head-titles');
    el(titles, 'p', 'dc-kicker', `${monthLabel(m.from)} – ${monthLabel(m.to)}`);
    const row = el(titles, 'div', 'dc-title-row');
    if (p) productLogo(el(row, 'span', 'dc-tile dc-tile-lg dc-p-' + p.id), p.id);
    el(row, 'h1', 'dc-title', p ? p.name : TITLES[curTab.id]);
    const sub = p ? SUBTITLE[p.id](eff, cur) : SUBS[curTab.id];
    if (sub) el(titles, 'p', 'dc-sub', sub);
    const seg = el(head, 'div', 'dc-seg');
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', 'Show amounts');
    for (const [k, label] of [['monthly', 'Monthly'], ['annual', 'Yearly']]) {
      const b = button(seg, 'dc-seg-btn', label, async () => { plugin.settings.period = k; await save(); });
      b.setAttribute('aria-pressed', String(period() === k));
    }
  }

  // ── building blocks: cards, More, hints, section heads ──────────────
  /* A "More" button and the region it shows and hides, with no redraw. Its
     open state is kept by key in `open`, so it survives a re-render. The
     button goes in btnParent; the region at the end of bodyParent (default:
     the same parent). */
  let moreSeq = 0;
  function moreIn(btnParent, key, label, bodyParent) {
    const id = 'dc-more-' + (++moreSeq);
    const btn = el(btnParent, 'button', 'dc-more');
    btn.type = 'button';
    btn.setAttribute('aria-controls', id);
    const body = el(bodyParent || btnParent, 'div', 'dc-more-body');
    body.id = id;
    const sync = () => {
      const on = open.has(key);
      btn.setAttribute('aria-expanded', String(on));
      clear(btn);
      el(btn, 'span', null, on ? 'Less' : (label || 'More'));
      icon(btn, on ? 'chevron-up' : 'chevron-down', 'dc-more-chev');
      body.hidden = !on;
    };
    btn.addEventListener('click', e => {
      e.preventDefault();
      if (open.has(key)) open.delete(key); else open.add(key);
      sync();
    });
    sync();
    return body;
  }

  /* A card: a big heading, one short line and its key figure. Anything
     longer goes in card.more(), behind a More button. o: { title, line, p
     (product id: its mark and colour), icon, cls, key, tag } */
  function card(parent, o) {
    const c = el(parent, o.tag || 'section', 'dc-card' + (o.p ? ' dc-p-' + o.p : '') + (o.cls ? ' ' + o.cls : ''));
    const head = el(c, 'div', 'dc-card-head');
    if (o.p) productLogo(el(head, 'span', 'dc-tile'), o.p);
    else if (o.icon) icon(el(head, 'span', 'dc-tile is-plain'), o.icon);
    el(head, o.h || 'h2', 'dc-card-title', o.title);
    const fig = el(c, 'div', 'dc-card-fig');
    if (o.line) el(c, 'p', 'dc-card-line', o.line);
    let body = null;
    return { c, head, fig, more: label => (body || (body = moreIn(c, o.key || 'card.' + o.title, label))) };
  }
  /* the big figure and what it is: "R 1 671" then "a year" */
  function figure(fig, v, opts) {
    const o = opts || {};
    if (v === null || v === undefined) el(fig, 'span', 'dc-amt is-zero dc-kpi-value', '—');
    else if (o.neutral) el(fig, 'span', 'dc-amt is-plain dc-kpi-value', money(per(v)));
    else if (o.words) amt(fig, Math.abs(v), { cls: 'dc-kpi-value is-plain' });
    else amt(fig, v, { plus: o.plus, cls: 'dc-kpi-value' });
    el(fig, 'span', 'dc-per', o.label || perLabel());
  }
  function pill(parent, text, tone) {
    return el(parent, 'span', 'dc-pill' + (tone ? ' is-' + tone : ''), text);
  }
  /* one line in a dashed box: a note that matters, kept short */
  function hint(parent, text, tone) {
    const h = el(parent, 'div', 'dc-hint' + (tone ? ' is-' + tone : ''));
    icon(h, tone === 'warn' ? 'triangle-alert' : 'info');
    el(h, 'span', 'dc-hint-text', text);
    return h;
  }
  /* A section of the page: its title, and a More on the right for the
     longer words. Returns { sec, head, more() }. */
  function section(parent, title, key, ic) {
    const sec = el(parent, 'section', 'dc-section');
    const head = el(sec, 'div', 'dc-section-head');
    const h = el(head, 'h2', 'dc-section-title');
    if (ic) icon(h, ic);
    el(h, 'span', null, title);
    let body = null;
    return { sec, head, more: label => (body || (body = moreIn(head, key, label, sec))) };
  }
  /* A smaller heading inside a section, with its own More. */
  function subHead(parent, title, key) {
    const head = el(parent, 'div', 'dc-sub-head');
    el(head, 'h3', 'dc-h3', title);
    let body = null;
    return { head, more: label => (body || (body = moreIn(head, key, label, parent))) };
  }

  // ── Overview ─────────────────────────────────────────────────────────
  /* The not-affiliated notice: one line, and a More for the rest. */
  function noticeStrip(parent) {
    const h = hint(parent, NOTICE_LINE, 'info');
    h.classList.add('dc-notice');
    const mb = moreIn(h, 'notice.more', 'More', h);
    for (const t of noticeMore(marketAge(now()).asOf)) el(mb, 'p', null, t);
  }
  /* When there are only a few months of Discovery payments the figures are
     thin: say so, in the verdicts' own words. */
  function confidenceStrip(parent, st) {
    const c = st.confidence;
    const notes = c && c.thin ? (c.notes || []).filter(Boolean) : [];
    if (!notes.length) return;
    const h = hint(parent, notes[0], 'warn');
    h.classList.add('dc-confidence');
    if (notes.length > 1) {
      const mb = moreIn(h, 'confidence.more', 'More', h);
      for (const t of notes.slice(1)) el(mb, 'p', null, t);
    }
  }

  /* Miles CSVs that were not read (too big to be a Miles statement): say so
     in plain words, with the file named. */
  function csvNotesStrip(parent) {
    const notes = ((budget && budget.csvNotes) || []).filter(Boolean);
    if (!notes.length) return;
    const h = hint(parent, notes[0], 'warn');
    h.classList.add('dc-csv-notes');
    if (notes.length > 1) {
      const mb = moreIn(h, 'csvnotes.more', 'More', h);
      for (const t of notes.slice(1)) el(mb, 'p', null, t);
    }
  }
  /* A bill item (a claim paid back, say) with how many payments it rests on:
     from model.js, st.bill.items */
  const billItem = k => (cur && cur.st.bill && cur.st.bill.items ? cur.st.bill.items.find(i => i.key === k) : null) || null;
  /* the words for a figure that rests on one or two payments made into a year */
  function roughNote(x) {
    const word = x.eventWord || 'payment';
    const n = x.events === 1 ? `one ${word}` : `${x.events} ${word}s`;
    const bm = Number(x.basisMonths);
    return `Made into a year from ${n}${Number.isFinite(bm) && bm > 0 ? ` in ${bm === 1 ? 'one month' : bm + ' months'}` : ''}, so it is a rough guess.`;
  }

  function renderOverview(panel, { s, eff, st, pr, verdicts, products, vitality }) {
    if (!pr.products.length) {
      hint(panel, 'Choose the Discovery products you have on the Inputs tab.', 'info');
      return;
    }
    noticeStrip(panel);
    confidenceStrip(panel, st);
    csvNotesStrip(panel);
    const kpis = el(panel, 'div', 'dc-kpis');
    if (products.bank) {
      const alt = st.chosen;
      if (alt) {
        const vb = verdicts.bank;
        const unknown = isUnknown(vb);
        const stay = st.verdict === 'stay';
        /* moving would save less than is worth the trouble */
        const close = !unknown && !stay && !!vb && vb.tone === 'good';
        const k = card(kpis, {
          p: 'bank', cls: 'dc-kpi dc-kpi-hero' + (unknown ? ' is-unknown' : ''), key: 'ov.bank',
          title: unknown ? 'Not enough data on Discovery Bank' : stay ? 'Discovery Bank looks worth keeping' : close ? `About the same as ${alt.name}` : `${alt.name} could cost you less`,
          line: unknown ? vb.why : stay ? `By these figures, you are better off than with ${alt.name}, after fees.` : close ? `Moving would save under ${money(MATERIAL)} a year.` : `By these figures, you would be better off with ${alt.name}.`,
        });
        if (unknown) figure(k.fig, Math.abs(alt.gainIfSwitch), { neutral: true, label: perLabel() + ' apart' });
        else figure(k.fig, stay ? -alt.gainIfSwitch : alt.gainIfSwitch, { plus: true });
        const mb = k.more();
        const cautious = st.cautious.net - alt.net;
        el(mb, 'p', null, stay && cautious >= 0
          ? `Counted carefully, you are still ${R(cautious)} ${perLabel()} ahead.`
          : `Counted carefully, ${cautious >= 0 ? 'Discovery Bank' : alt.name} comes out ${R(cautious)} ${perLabel()} ahead${stay ? ', so it is close' : ''}.`);
        el(mb, 'p', 'dc-small', 'Carefully means each Mile worth only 10c, no flight discounts next year and no gameboard rewards.');
        const d = st.downgrade;
        if (d) {
          const off = n => `${R(n)} ${perLabel()} ${n >= 0 ? 'better' : 'worse'} off`;
          el(mb, 'p', null, `On Discovery's cheaper ${d.label}, without the full ${suiteOf(eff).label}, you would be ${off(d.gainIfDowngrade)}${d.gainAfterWatch !== null ? `, and ${off(d.gainAfterWatch)} once your Apple Watch contract ends${d.watchEnds ? ` on ${dayLabel(d.watchEnds)}` : ''}` : ''}. See the Bank tab.`);
        }
        const est = st.lines.filter(l => l.group === 'bank' && l.source === 'estimated' && l.annual > 0.5);
        if (est.length) el(mb, 'p', 'dc-small', `Estimates, not from your statements: ${est.map(l => l.label).join('; ')}.`);
      } else {
        const k = card(kpis, { p: 'bank', cls: 'dc-kpi dc-kpi-hero', title: 'Discovery Bank', line: 'Rewards minus fees.' });
        figure(k.fig, st.net, { plus: true });
      }
    }
    const pay = card(kpis, { icon: 'receipt', cls: 'dc-kpi', key: 'ov.paid', title: 'You pay Discovery', line: `${R(pr.totals.cash)} came back in cash.` });
    figure(pay.fig, -pr.totals.paid);
    const pm = pay.more('Each product');
    billTable(pm, pr);
    if (products.bank) el(pm, 'p', 'dc-small', 'Bank rewards (Miles, the watch, discounts) are not cash, so they are not here. They are in the Bank figure and on Flows.');
    const vit = st.vitality;
    if (products.health && vitality.health) {
      const vc = card(kpis, { p: 'health', cls: 'dc-kpi', key: 'ov.vitality', title: 'Vitality Health', line: vit.premium !== null ? `Costs ${R(vit.premium)}, gives back ${R(vit.value)}.` : 'Type your medical aid premium on Inputs.' });
      figure(vc.fig, vit.premium !== null ? vit.value - vit.premium : null, { plus: true });
      if (vit.premium !== null) el(vc.more(), 'p', null, 'What comes back: gym discounts, HealthyFood, flights and other rewards.');
      else el(vc.more(), 'p', null, 'With the premium typed, the Vitality part of the Discovery Health debit order can be worked out.');
    }

    /* benefits turned down on the Benefits tab count for less everywhere */
    const trimmed = BENEFITS.filter(b => st.benefits[b.id] && st.benefits[b.id].available && st.benefits[b.id].level !== 'full' && st.benefits[b.id].full >= 0.5);
    if (trimmed.length) {
      const h = hint(panel, `${trimmed.length} benefit${trimmed.length === 1 ? ' counts' : 's count'} for less, as you asked.`, 'info');
      button(h, 'dc-link', 'Change', () => show('benefits'));
    }

    const sec = section(panel, 'Is each one worth it?', 'ov.each.more', 'layout-grid');
    el(sec.more(), 'p', null, `Each product against what other companies charge. The figure is what you pay for it ${perLabel()}${products.bank ? '; for the bank it is rewards minus fees' : ''}.`);
    const grid = el(sec.sec, 'div', 'dc-grid');
    for (const p of pr.products) {
      productCard(grid, p.id, p.name, verdicts[p.id], p.figure, p.figureLabel, p.id);
      if (p.id === 'insure' && verdicts.home) productCard(grid, 'insure', 'Home contents', verdicts.home, null, '', 'insure', 'home');
    }
    renderDates(panel, pr.dates);
  }

  /* One product on the Overview: a button to its tab (heading, verdict,
     figure, one line) and a More with the reason. */
  function productCard(grid, id, name, v, fig, figLabel, target, key) {
    const c = el(grid, 'article', 'dc-card dc-pcard dc-p-' + id);
    const main = button(c, 'dc-pcard-main', null, () => show(target));
    const head = el(main, 'span', 'dc-card-head');
    productLogo(el(head, 'span', 'dc-tile'), id);
    el(head, 'span', 'dc-card-title', name);
    if (v) pill(head, v.word, v.tone);
    const f = el(main, 'span', 'dc-card-fig');
    if (fig === null) {
      if (v && v.tone === 'none' && v.amount !== null) { el(f, 'span', 'dc-amt is-plain dc-kpi-value', R(v.amount)); el(f, 'span', 'dc-per', 'cover ' + perLabel()); }
      else el(f, 'span', 'dc-amt is-zero dc-kpi-value', '—');
    } else figure(f, fig, { plus: !isUnknown(v), neutral: isUnknown(v), label: `${String(figLabel || '').toLowerCase().replace(/,$/, '')} ${perLabel()}`.trim() });
    const words = v ? verdictWords(v) : { lead: figLabel, why: '' };
    el(main, 'span', 'dc-card-line', words.lead);
    icon(main, 'chevron-right', 'dc-pcard-chev');
    if (words.why) el(moreIn(c, 'ov.p.' + (key || id)), 'p', null, words.why);
  }

  /* Paid and back in cash, per product: the table in the Overview's More. */
  function billTable(parent, pr) {
    const wrapT = el(parent, 'div', 'dc-table-wrap');
    const t = el(wrapT, 'table', 'dc-table');
    const hr = el(el(t, 'thead'), 'tr');
    for (const [x, c] of [['Product', ''], ['Paid', 'dc-right'], ['Back in cash', 'dc-right']]) el(hr, 'th', c || null, x);
    const tb = el(t, 'tbody');
    for (const p of pr.products) {
      const r = el(tb, 'tr');
      tag(el(r, 'td'), p);
      amt(el(r, 'td', 'dc-right'), -p.paid);
      const c = el(r, 'td', 'dc-right');
      if (p.cashBack >= 0.5) amt(c, p.cashBack, { plus: true }); else el(c, 'span', 'dc-amt is-zero', '–');
    }
    const tr = el(tb, 'tr', 'dc-row-total');
    el(tr, 'td', null, 'All products');
    amt(el(tr, 'td', 'dc-right'), -pr.totals.paid);
    amt(el(tr, 'td', 'dc-right'), pr.totals.cash, { plus: true });
  }

  function renderDates(parent, dates, product) {
    const list = product ? dates.filter(d => d.product === product) : dates;
    if (!list.length) return;
    const sec = section(parent, 'Dates to watch', 'dates.' + (product || 'all'), 'calendar');
    const ul = el(sec.sec, 'ul', 'dc-rows dc-dates');
    for (const d of list) {
      const li = el(ul, 'li', 'dc-row dc-date');
      el(li, 'span', 'dc-date-d', dayLabel(d.date));
      const t = el(li, 'span', 'dc-date-t');
      if (!product) { const p = parentProduct(d.product); if (p) tag(t, p); }
      el(t, 'span', null, ' ' + d.text);
    }
  }

  // ── Compare: stay with Discovery or switch everything ───────────────
  /* Written for someone who does not read statements: the answer as one
     card, the two sides (what it really costs), then one card per product.
     Every amount is a positive rand amount; the words say which way it goes.
     The reasons and the full table wait behind More. */
  function renderSwitch(panel, { sw, st, rivals, pr, products, verdicts }) {
    /* the prices are typed in by hand and checked twice a year: say when. Once
       they may be out of date the warning IS the visible line, with the
       reason and the way out in it; More only holds the dates. */
    const age = marketAge(now());
    const mb = el(panel, 'div', 'dc-market-banner dc-hint' + (age.stale ? ' is-warn is-stale' : ''));
    mb.setAttribute('role', 'status');
    icon(mb, age.stale ? 'triangle-alert' : 'calendar');
    el(mb, 'span', 'dc-hint-text dc-market-line' + (age.stale ? ' dc-market-warn' : ''), age.stale ? `These prices may be out of date: they are as at ${dayLabel(age.asOf)}. Check each one with the company before you decide.` : `Prices as at ${dayLabel(age.asOf)}.`);
    const mm = moreIn(mb, 'market.more', 'More', mb);
    el(mm, 'p', null, `Prices as at ${dayLabel(age.asOf)}. Next update by ${monthLabel(age.reviewBy.slice(0, 7))}.`);
    el(mm, 'p', null, MARKET.note || 'Banks, medical aids and insurers change prices every year.');
    if (!pr.products.length) {
      hint(panel, 'Choose your Discovery products on the Inputs tab to compare them.', 'info');
      return;
    }
    const diff = Math.abs(sw.gain);
    const stayBetter = sw.gain <= 0;
    /* too few months, or every product's own figures too thin: no answer */
    const unknownAll = pr.products.length > 0 && pr.products.every(p => isUnknown(verdicts && verdicts[p.id]));
    const thin = !!(st.confidence && st.confidence.thin) || unknownAll;
    const thinNote = ((st.confidence && st.confidence.notes) || []).filter(Boolean)[0];

    const ans = card(panel, {
      icon: 'scale', cls: 'dc-kpi dc-kpi-hero dc-sw-answer' + (thin ? ' is-unknown' : diff < 0.5 ? '' : stayBetter ? ' is-stay' : ' is-move'), key: 'sw.answer',
      title: thin ? 'Not enough data to say' : diff < 0.5 ? 'Both cost about the same' : stayBetter ? 'Staying looks cheaper' : 'Moving looks cheaper',
      line: thin ? (thinNote || `Only ${st.window.dataMonths} months of Discovery payments.`) : diff < 0.5 ? 'Staying or moving costs the same.' : stayBetter ? 'By these figures, moving everything would cost more.' : 'By these figures, moving everything would cost less.',
    });
    figure(ans.fig, diff, { words: true, label: thin ? perLabel() + ' apart' : (stayBetter ? 'more ' : 'less ') + perLabel() });
    const am = ans.more();
    if (sw.assumed.length) {
      const names = sw.assumed.map(x => x.toLowerCase());
      const list = names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : names[0];
      el(am, 'p', null, `No quote yet for ${list}, so both sides use what you pay now. Type quotes on the Inputs tab.`);
    }
    el(am, 'p', null, `Moving everything means ${products.bank && st.chosen ? st.chosen.name + ' instead of Discovery Bank, ' : ''}the cheapest medical aid and gap cover that cover what you need, and your own quotes for car and life cover.`);
    el(am, 'p', 'dc-small', 'Insurance claims are left out, because any insurer pays claims. Cover is never exactly the same, so check each product\'s tab before you move.');

    const sides = el(panel, 'div', 'dc-sw-sides');
    const movedTo = sw.rows.filter(r => r.kind === 'cost' && r.goName && !r.assumed).map(r => r.goName);
    const kept = sw.rows.filter(r => r.kind === 'cost' && r.assumed).map(r => r.label.toLowerCase());
    const names = xs => (xs.length > 1 ? xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1] : xs[0] || '');
    const sideItems = k => sw.rows.filter(r => r.kind === 'benefit').flatMap(r => r[k] || []);
    const side = (title, x, win, who, key, items) => {
      const k = card(sides, { icon: key === 'stay' ? 'anchor' : 'shuffle', cls: 'dc-sw-side' + (win ? ' is-win' : ''), key: 'sw.side.' + key, title, line: `Pay ${R(x.cost)}, get ${R(x.benefit)} back.` });
      if (win) pill(k.head, 'Cheaper', 'good');
      figure(k.fig, x.real, { words: true, label: (x.real >= 0 ? 'real cost ' : 'ahead ') + perLabel() });
      const m = k.more('What comes back');
      if (who) el(m, 'p', 'dc-small', who);
      if (x.benefit >= 0.5) backBreakdown(m, items);
    };
    side('Stay with Discovery', sw.stay, diff >= 0.5 && stayBetter && !thin, `${names(pr.products.map(p => p.name))}, as you have them now.`, 'stay', sideItems('stayItems'));
    side('Move everything', sw.go, diff >= 0.5 && !stayBetter && !thin, movedTo.length ? `To ${names(movedTo)}${kept.length ? `. ${names(kept).replace(/^./, x => x.toUpperCase())} stay${kept.length > 1 ? '' : 's'} at today's price until you get a quote` : ''}.` : '', 'go', sideItems('goItems'));

    const why = section(panel, 'Where the difference comes from', 'sw.why', 'arrow-left-right');
    el(why.more(), 'p', null, `Amounts are ${perLabel()}. Each card says which way that product leans.`);
    const grid = el(why.sec, 'div', 'dc-grid');
    const LOGO = { bank: 'bank', medical: 'health', car: 'insure', gap: 'gap', life: 'life' };
    for (const g of sw.groups) {
      const even = Math.abs(g.saving) < 0.5;
      const k = card(grid, { p: LOGO[g.id], cls: 'dc-sw-item', h: 'h3', key: 'sw.g.' + g.id, title: g.label, line: switchReason(g, R, !even) || 'No difference yet.' });
      const uv = verdicts && verdicts[LOGO[g.id]];
      if (!even && isUnknown(uv)) pill(k.head, uv.word, 'unknown');
      else if (!even) pill(k.head, g.saving > 0 ? 'Cheaper to move' : 'Cheaper to stay', g.saving > 0 ? 'check' : 'good');
      if (even) el(k.fig, 'span', 'dc-amt is-zero dc-kpi-value', 'Same');
      else if (isUnknown(uv)) figure(k.fig, Math.abs(g.saving), { words: true, label: perLabel() + ' apart' });
      else figure(k.fig, g.saving, { words: true, label: `better to ${g.saving > 0 ? 'move' : 'stay'}` });
    }

    renderRivals(panel, rivals);

    const all = section(panel, 'Every amount', 'sw.table.sec', 'table');
    switchTable(all.more('Show the table'), sw);
  }

  /* The top five competitors for each product, beside what Discovery costs
     you now: one row each (name, one line, how it compares); the costs and
     what comes back wait behind its More. */
  function renderRivals(panel, rivals) {
    if (!rivals.length) return;
    const top = section(panel, 'Discovery next to its competitors', 'rv.more', 'layout-grid');
    el(top.more(), 'p', null, `For each product, what Discovery costs you now and what the five closest competitors cost. Real cost is what you pay less what you get back. Amounts are ${perLabel()}.`);
    const LOGO = { bank: 'bank', medical: 'health', car: 'insure', gap: 'gap', life: 'life' };
    const NOTE = {
      medical: 'Discovery\'s real cost counts the Vitality rewards you get back; the other medical aids have no Vitality.',
      car: 'Nobody publishes car insurance prices, so each insurer shows the most a quote could be and still beat Discovery (after its own rewards and the Drive fuel rewards you would lose).',
      gap: 'The % is how much a plan pays, measured against the medical aid\'s own rate for hospital doctors: 350% pays up to three and a half times that rate. Higher pays more.',
      life: 'Life cover is priced per person: get a quote for the same cover.',
    };
    for (const sec of rivals) {
      const c = el(top.sec, 'div', 'dc-card dc-rv-card dc-p-' + LOGO[sec.id]);
      const head = el(c, 'div', 'dc-card-head');
      productLogo(el(head, 'span', 'dc-tile'), LOGO[sec.id]);
      el(head, 'h3', 'dc-card-title', sec.label);
      if (NOTE[sec.id]) el(moreIn(head, 'rv.note.' + sec.id, 'More', c), 'p', null, NOTE[sec.id]);
      const list = el(c, 'ul', 'dc-rows dc-rv');
      const d = sec.discovery;
      const row = (cls, name, line, figText, figCls, key, fill) => {
        const li = el(list, 'li', 'dc-row dc-rv-row' + cls);
        const l = el(li, 'div', 'dc-rv-l');
        el(l, 'span', 'dc-rv-name', name);
        if (line) el(l, 'span', 'dc-rv-what' + (line.miss ? ' is-miss' : ''), line.text);
        el(li, 'span', 'dc-rv-cmp ' + (figCls || ''), figText);
        fill(moreIn(li, key, 'More', li));
      };
      row(' is-you', d.name, { text: 'What you have now' }, d.real >= 0 ? `${R(d.real)} real cost` : `${R(d.real)} ahead`, 'is-plain', `rv.${sec.id}.d`, m => {
        el(m, 'p', null, `Costs ${R(d.pay)}. Gives back ${R(d.back)}.`);
        if (d.back >= 0.5) backBreakdown(m, d.items);
      });
      sec.rivals.forEach((r, ri) => {
        const missing = r.misses.length ? 'Does not cover ' + r.misses.map(id => (NEEDS.find(n => n.id === id) || { label: id }).label.toLowerCase()).join(', ') : '';
        const line = missing ? { text: missing, miss: true } : r.what ? { text: r.what } : null;
        const gap = r.pay === null ? null : r.real - d.real;
        const fig = r.pay === null ? 'No published price'
          : Math.abs(per(gap)) < 0.5 ? 'About the same' : `${R(gap)} ${gap < 0 ? 'cheaper' : 'more'}`;
        const cls = r.pay === null || Math.abs(per(gap)) < 0.5 ? 'is-zero' : gap < 0 ? 'is-cheaper' : 'is-dearer';
        row('', r.name + (r.quoted ? ' (your quote)' : ''), line, fig, cls, `rv.${sec.id}.${ri}`, m => {
          if (missing && r.what) el(m, 'p', 'dc-small', r.what);
          if (r.pay === null) {
            if (r.quoteUnder) el(m, 'p', null, `Worth it if a quote is under ${money(r.quoteUnder)} a month.`);
            return;
          }
          el(m, 'p', null, `Costs ${R(r.pay)}. Gives back ${R(r.back)}. Real cost ${R(r.real)}.`);
          if (r.back >= 0.5) backBreakdown(m, r.items);
        });
      });
    }
  }

  /* What the money that comes back actually is: how much is cash, then each
     kind (Miles, discounts, the watch…) with what it means and its items. */
  function backBreakdown(parent, items) {
    const box = el(parent, 'div', 'dc-bk');
    const kinds = byKind(items);
    const total = items.reduce((t, i) => t + i.annual, 0);
    const cash = (kinds.find(k => k.kind === 'cash') || { annual: 0 }).annual;
    el(box, 'p', 'dc-bk-sum', Math.abs(per(total)) < 0.5 ? 'Nothing comes back.'
      : Math.abs(per(total - cash)) < 0.5 ? 'All of this is cash in your account.'
        : Math.abs(per(cash)) < 0.5 ? 'None of this is cash. It is only worth something when you use it.'
          : `Only ${R(cash)} ${perLabel()} of this is cash. The rest is only worth something when you use it.`);
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
    if (g.id === 'bank') return g.saving <= 0 ? 'Its rewards are worth more than its extra fees.' : `${row('bank').goName} costs less once you count the rewards.`;
    if (g.id === 'medical') {
      const m = row('medical');
      if (!m || m.assumed) return 'No other plan is priced for your family yet.';
      const cheaper = m.stay - m.go;
      if (cheaper >= 0.5) return `${m.goName} is ${R(cheaper)} cheaper${vit ? (g.saving <= 0 ? ', but you lose Vitality.' : ', even without Vitality.') : '.'}`;
      return `${m.goName} costs ${R(cheaper)} more${vit ? ', and you lose Vitality' : ''}.`;
    }
    if (g.id === 'car') {
      const c = row('car');
      if (!c || c.assumed) return 'There is no car quote yet.';
      const cheaper = c.stay - c.go;
      return `Your ${c.goName} quote is ${R(cheaper)} ${cheaper >= 0 ? 'cheaper' : 'more'}${drive ? ', less the Drive rewards' : ''}.`;
    }
    if (g.id === 'gap') {
      const x = row('gap');
      return x.go < x.stay ? `${x.goName} is cheaper.` : 'Discovery\'s gap cover is cheaper.';
    }
    const l = row('life');
    if (!l || l.assumed) return decided ? '' : 'There is no quote yet.';
    return `Your ${l.goName} quote ${l.go < l.stay ? 'is cheaper' : 'costs more'}.`;
  }

  /* Every amount behind the cards, for whoever wants to check them. */
  function switchTable(parent, sw) {
    const w = el(parent, 'div', 'dc-table-wrap');
    const t = el(w, 'table', 'dc-table dc-sw-table');
    const hr = el(el(t, 'thead'), 'tr');
    for (const [x, c] of [['', ''], ['Stay', 'dc-right'], ['Move', 'dc-right']]) el(hr, 'th', c || null, x);
    const tb = el(t, 'tbody');
    const line = r => {
      const row = el(tb, 'tr');
      const nm = el(row, 'td', 'dc-cell-name');
      el(nm, 'span', null, r.label);
      const sub = [r.goName, r.goNote].filter(Boolean).join(' · ');
      if (sub) el(nm, 'span', 'dc-cell-sub', 'If you move: ' + sub);
      for (const v of [r.stay, r.go]) el(el(row, 'td', 'dc-right'), 'span', 'dc-amt is-plain' + (r.assumed && v === r.go && r.go === r.stay ? ' is-assumed' : ''), money(per(v)));
    };
    const sum = (label, a, b, cls) => {
      const row = el(tb, 'tr', cls);
      el(row, 'td', null, label);
      for (const v of [a, b]) el(el(row, 'td', 'dc-right'), 'span', 'dc-amt is-plain', money(per(v)));
    };
    const part = (title, kind) => {
      el(el(tb, 'tr', 'dc-row-group'), 'td', null, title).setAttribute('colspan', '3');
      for (const r of sw.rows.filter(x => x.kind === kind)) line(r);
    };
    part('You pay', 'cost');
    sum('Total you pay', sw.stay.cost, sw.go.cost, 'dc-row-sub');
    part('You get back in rewards', 'benefit');
    sum('Total you get back', sw.stay.benefit, sw.go.benefit, 'dc-row-sub');
    sum('Real cost (pay minus get back)', sw.stay.real, sw.go.real, 'dc-row-total');
  }

  // ── Flows ────────────────────────────────────────────────────────────
  function renderFlows(panel, { pr }) {
    const kpis = el(panel, 'div', 'dc-kpis');
    const a = card(kpis, { icon: 'arrow-up-right', cls: 'dc-kpi', title: 'Paid to Discovery', line: 'Every product you have.' });
    figure(a.fig, -pr.totals.paid);
    const b = card(kpis, { icon: 'arrow-down-left', cls: 'dc-kpi', title: 'Back to you', line: 'Cash and rewards.' });
    figure(b.fig, pr.totals.value, { plus: true });
    const c = card(kpis, { icon: 'scale', cls: 'dc-kpi', title: 'Back minus paid', line: 'Tap a product below.' });
    figure(c.fig, pr.totals.flowNet, { plus: true });
    const sec = el(panel, 'section', 'dc-card dc-flow-card');
    flow = mountFlow(sec, { products: pr.products, totals: pr.totals, per, perLabel, onOpen: id => show(id), open });
  }

  // ── a product tab ────────────────────────────────────────────────────
  function renderProduct(panel, view, p) {
    const kpis = el(panel, 'div', 'dc-kpis');
    const k = card(kpis, { p: p.id, cls: 'dc-kpi', title: String(p.figureLabel).replace(/,$/, ''), line: p.paid >= 0.5 ? `You pay ${R(p.paid)}.` : 'Nothing paid in this period.' });
    figure(k.fig, p.figure, { plus: true });
    const v = view.verdicts[p.id];
    if (v) {
      const words = verdictWords(v);
      const vk = card(kpis, { icon: 'scale', cls: 'dc-kpi dc-kpi-verdict is-' + v.tone, key: 'pv.' + p.id, title: v.word, line: words.lead });
      if (v.amount === null) el(vk.fig, 'span', 'dc-amt is-zero dc-kpi-value', '—');
      else if (isUnknown(v)) figure(vk.fig, Math.abs(v.amount), { words: true, label: perLabel() + ' apart' });
      else if (v.tone === 'quote') { el(vk.fig, 'span', 'dc-amt is-plain dc-kpi-value', money(v.amount)); el(vk.fig, 'span', 'dc-per', 'quote a month'); }
      else figure(vk.fig, v.tone === 'good' ? v.amount : Math.abs(v.amount), { plus: v.tone === 'good', words: v.tone !== 'good' });
      if (words.why) el(vk.more(), 'p', null, words.why);
    }
    if (p.backSum >= 0.5) {
      const bk = card(kpis, { icon: 'arrow-down-left', cls: 'dc-kpi', title: 'Back to you', line: 'Cash and rewards.' });
      figure(bk.fig, p.backSum, { plus: true });
    }
    const jump = el(panel, 'div', 'dc-chips dc-jump');
    const anchors = {};
    for (const [key, label, ic] of [['figures', 'The numbers', 'scale'], ['tx', 'Transactions', 'receipt'], ['inputs', 'Settings', 'sliders-horizontal']]) {
      button(jump, 'dc-chip dc-jump-btn', label, () => { if (anchors[key]) anchors[key].scrollIntoView({ block: 'start' }); }, ic);
    }
    const fig = section(panel, 'The numbers', 'pf.' + p.id, 'scale');
    anchors.figures = fig.sec;
    const fbody = el(fig.sec, 'div', 'dc-card dc-p-' + p.id + ' dc-figs');
    ({ bank: figuresBank, health: figuresHealth, gap: figuresGap, insure: figuresInsure, life: figuresLife })[p.id](fbody, view, p, fig);
    const tx = section(panel, 'Transactions', 'pt.' + p.id, 'receipt');
    anchors.tx = tx.sec;
    renderTransactions(tx.sec, p);
    const set = section(panel, 'Settings', 'ps.' + p.id, 'sliders-horizontal');
    anchors.inputs = set.sec;
    const host = el(set.sec, 'div', 'dc-card dc-notes-host dc-p-' + p.id);
    notesToggle(set.head, host, 'notes.' + p.id);
    INPUTS[p.id](host, view, {});
    renderDates(panel, view.pr.dates, p.id);
  }

  function figuresBank(c, { st }, p, sec) {
    const ms = st.milesStatement;
    if (ms) {
      el(sec.more(), 'p', null, `Read from your Miles statement: ${ms.rows.toLocaleString('en-US').replace(/,/g, ' ')} entries, ${monthLabel(ms.from)} – ${monthLabel(ms.to)}. Each Mile you spent was worth R ${ms.spentValue ? ms.spentValue.toFixed(3).replace('.', ',') : '0,10'}. You spent ${R(st.cardSpend)} ${perLabel()} on the card.`);
    }
    group(c, 'What the bank costs you', st.lines.filter(l => l.group === 'cost'));
    total(c, `Fees ${perLabel()}`, -st.cost, true);
    group(c, 'What you would lose if you left', st.lines.filter(l => l.group === 'bank'));
    total(c, `Rewards minus fees, ${perLabel()}`, st.net);
    renderCompare(c, st);
    renderDowngrade(c, st);
    const k = subHead(c, 'You keep these at any bank', 'bank.keep');
    el(k.more(), 'p', null, 'These come with the medical aid and Discovery Insure (or any Discovery account), so they are not counted when comparing banks.');
    for (const l of st.lines.filter(x => x.group === 'stays' && !/^healthy|^travel\.health|^activeRewards/.test(x.key))) lineRow(c, l);
    subHead(c, 'Any bank would charge or pay these', 'bank.any');
    for (const l of st.lines.filter(x => x.group === 'elsewhere')) lineRow(c, l);
  }

  function figuresHealth(c, { st }, p) {
    /* the plan's price table is out of date for the latest debit: nothing is split */
    if (st.bill && st.bill.priceStale) {
      const it = billItem('product.medical');
      if (it && it.note) hint(c, it.note, 'warn');
    }
    el(c, 'p', 'dc-grp', 'What you pay');
    if (p.vitalityYear) {
      plainLine(c, 'Medical aid', -p.medicalYear, 'entered', 'The Discovery Health debit order, less the gap cover and Vitality parts.');
      plainLine(c, 'Vitality Health and other', -p.vitalityYear, 'entered', `${money(p.vitalityYear / 12, { cents: true })} a month: what is left of the debit order after the medical aid and gap cover amounts you typed.`);
    } else {
      plainLine(c, 'Discovery Health debit order', -p.medicalYear, 'measured', 'Type your medical aid and gap cover amounts on the Inputs tab to see what this pays for.');
    }
    total(c, `Discovery Health costs ${perLabel()}`, -p.paid, true);
    const notes = [p.splitNote, p.note].filter(Boolean);
    if (notes.length) { const m = moreIn(c, 'health.pay.notes', 'Notes'); for (const n of notes) el(m, 'p', null, n); }
    el(c, 'p', 'dc-grp', 'Paid back');
    plainLine(c, 'Claims paid back to you', p.refunds, 'measured', 'Money back for doctor and pharmacy bills you paid yourself first (DISC MEMB on your statements).', true, false, false, undefined, billItem('product.medicalBack'));
    const vh = subHead(c, 'Is Vitality Health worth it?', 'health.vit');
    el(vh.more(), 'p', null, 'This has nothing to do with the bank: you keep these whichever bank you use.');
    const v = st.vitality;
    if (v.premium !== null) plainLine(c, 'Vitality Health fee', -v.premium, 'entered', 'The Vitality part of the Discovery Health debit order.');
    plainLine(c, 'Gym discount', v.gymSaving, 'measured', 'What Virgin Active or Planet Fitness would cost without the Vitality discount, less what you pay now.', true);
    weightNote(c, 'gym', v.gymSavingFull, v.gymSaving);
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
      key: 'mk.health', title: 'Compared with other medical aids', line: `2026 prices for ${fam}.`,
      intro: `Change the family on the Inputs tab. If you leave Discovery Health you also lose Vitality Health, so what Vitality is worth to you after its fee (${money(per(cmp.vitalityNet), { plus: true })} ${perLabel()}) is added to the other medical aids' cost. Discovery's own cheaper plans keep Vitality.`,
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
    const h = subHead(c, 'Does it cover what you need?', 'needs.more');
    el(c, 'p', 'dc-card-line', '✓ covered · ◐ with limits · ✗ not covered · ? not sure');
    const mb = h.more();
    el(mb, 'p', null, `${cmp.needs.map(n => n.label).join(', ')}. Choose which matter to you, and whether your hospital is in each plan's list, on the Inputs tab.`);
    const notes = cmp.own && cmp.own.coverNote ? cmp.own.coverNote : null;
    if (notes) el(mb, 'p', 'dc-small', 'Your plan: ' + NEEDS.filter(n => notes[n.id]).map(n => `${n.label}: ${notes[n.id]}`).join(' · '));
    const t = el(c, 'div', 'dc-needs');
    t.style.setProperty('--n', String(cmp.needs.length));
    const head = el(t, 'div', 'dc-needs-r dc-cmp-h');
    el(head, 'span', null, 'Plan');
    for (const n of cmp.needs) {
      const x = el(head, 'span');
      x.title = n.label + ': ' + n.hint;
      el(x, 'span', 'dc-n-long', n.label.replace(/^Your (\w)/, (_, ch) => ch.toUpperCase()));
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
  }

  function figuresGap(c, view, p) {
    plainLine(c, 'Gap cover', -p.paid, p.inDebit ? 'entered' : 'measured', p.note || 'Your gap cover debit orders.');
    plainLine(c, 'Claims paid to you', p.claims, 'measured', p.claims ? 'INSGAPCLA payments on your statements.' : 'None in this period.', true, false, false, undefined, billItem('product.gapClaim'));
    total(c, `Claims minus cost, ${perLabel()}`, p.net);
    if (p.claims) el(moreIn(c, 'gap.claims', 'Why this year may look unusual'), 'p', null, 'One big claim can make a year look unusual. In most years gap cover costs money and pays nothing back; it is there for the year something big happens.');
    const cmp = compareGap(p, plugin.settings);
    /* the rival prices are for someone under 45 */
    const oldest = Number((plugin.settings.members || {}).oldestAge);
    const known = Number.isFinite(oldest) && oldest > 0;
    if (cmp) renderMarket(c, {
      key: 'mk.gap', title: 'Compared with other gap cover', line: known && oldest < 45 ? '2026 family prices, oldest member under 45.' : `Rival prices shown are for under 45s.${known ? ' Yours may be higher.' : ''}`,
      intro: 'Most charge more after 45, so type your own quote on the Inputs tab. Gap cover pays what the medical aid does not when you are in hospital. Discovery Gap Cover is only for Discovery Health members, so if you leave the medical aid it has to go too. The others work with any medical aid.',
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
    plainLine(c, 'Claims paid to you', p.claims, 'measured', p.claims ? 'INSURE CLA payments on your statements.' : 'None in this period.', true, false, false, undefined, billItem('product.insureClaim'));
    total(c, `Back minus paid, ${perLabel()}`, p.net);
    const cmp = compareInsure(p, plugin.settings);
    if (cmp) renderMarket(c, {
      key: 'mk.insure', title: 'Compared with other car insurers', line: 'Nobody publishes a price for you: get quotes.',
      intro: `Car insurance depends on the car, the drivers and where you live. Full cover for one car costs about R980 a month in the Western Cape, R1 371 in Gauteng and R800–R1 400 across the country (Hippo via Pineapple, March 2026). Type a quote for the same cars and cover on the Inputs tab. Until then, each insurer shows the most it could charge a month and still beat Discovery, after its own rewards and the Vitality Drive rewards you would lose (${money(per(cmp.driveValue))} ${perLabel()}).`,
      you: 'Discovery Insure (now)', cmp, lostLabel: 'Their rewards', lost: r => r.rewards,
      name: r => r.name, sub: r => r.rewardNote || '',
      foot: 'Compare the same things: the same excess (what you pay yourself on a claim), car hire, and the same drivers.',
    });
    renderHome(c);
  }

  function renderHome(c) {
    const h = compareHome(plugin.settings);
    if (!h) {
      subHead(c, 'Home contents', 'home.none');
      el(c, 'p', 'dc-card-line', 'Type what you pay for contents cover on Inputs (0 if none).');
      return;
    }
    const none = !(h.current.monthly > 0);
    const value = h.contents !== null ? money(h.contents) : null;
    renderMarket(c, {
      key: 'mk.home', title: none ? 'Home contents: not insured' : 'Home contents',
      line: none ? 'What cover would cost.' : 'Against what you pay today.',
      intro: none
        ? `If a burglary, fire or burst geyser damages your things, you pay to replace them. ${value ? `Prices are for ${value} of contents` : 'Type what your things would cost to replace on the Inputs tab to see prices'}. If you rent, you only need contents cover; the building is the landlord's.`
        : `Prices are for ${value || 'the contents value you typed'}, against what you pay today.`,
      extra: h.range ? `Most insurers charge about R${HOME_RANGE.low}–R${HOME_RANGE.high} a month for every R100 000 of contents (${money(h.range.low)}–${money(h.range.high)} a month for ${money(h.contents)}), depending on your suburb, security and excess. Source: ${h.range.source}.` : '',
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
      el(c, 'p', 'dc-card-line', 'No Discovery Life payment in your bank. If it is off your salary, type it on Inputs.');
    }
    if (p.cover) plainLine(c, 'Amount you are covered for', p.cover, 'entered', '', false, true, true);
    const cmp = compareLife(p, plugin.settings);
    if (!cmp) return;
    if (cmp.employer.monthly >= 0.5) {
      plainLine(c, 'Your employer pays', cmp.employer.annual, 'entered', `The cover costs ${money(cmp.total.monthly, { cents: true })} a month in all; you pay ${money(cmp.total.monthly - cmp.employer.monthly, { cents: true })} of it.`, true);
    }
    if (cmp.payback) plainLine(c, 'Group Risk PayBack', cmp.payback, 'entered', 'Money paid back to you, so your share costs less.', true);
    else el(moreIn(c, 'life.payback', 'About Group Risk PayBack'), 'p', null, 'From 1 January 2026, if your employer\'s scheme offers Group Risk PayBack, Diamond members get up to 15% of the yearly cost back after a Vitality Health Check. If you get it, type it on the Inputs tab.');
    if (cmp.lifeOnly) {
      plainLine(c, 'Life cover alone, own policy', null, 'estimated', `For your cover amount and age, if you are healthy and do not smoke (smokers pay 50–100% more). Cover for severe illness and lost income would cost extra. Source: ${cmp.lifeOnly.source}.`, false, false, false, `${money(cmp.lifeOnly.low)}–${money(cmp.lifeOnly.high)} a month`);
    }
    renderMarket(c, {
      key: 'mk.life', title: 'Compared with a policy of your own', line: `It must cost less than your share: ${money(cmp.current.monthly)} a month.`,
      intro: 'Cover through your employer needs no medical tests up to a set amount, and stops when you leave the job (you can then usually keep similar cover without new tests). A policy of your own is all yours to pay, so for the same cover (life, severe illness and lost income together) it has to cost less than your share. Type a quote for the same cover on the Inputs tab.',
      you: 'Through your employer, your share (now)', cmp, lostLabel: 'Their rewards', lost: r => r.rewards,
      name: r => r.name, sub: r => [r.example, r.rewardNote].filter(Boolean).join(' · '),
      foot: 'Compare the same things: the same cover amounts, how long the income cover waits before it pays and how long it pays, and the same list of severe illnesses.',
    });
  }

  // ── lines, totals and blocks ─────────────────────────────────────────
  function group(c, title, lines) {
    el(c, 'p', 'dc-grp', title);
    for (const l of lines) lineRow(c, l);
  }

  function total(c, label, v, sub) {
    const t = el(c, 'div', 'dc-tot' + (sub ? ' is-sub' : ''));
    el(t, 'span', null, label);
    amt(t, v, { plus: v > 0 });
  }

  /* A verdict in words: the lead (what the amount means) for the card's one
     line, and the reason for its More. */
  function verdictWords(v) {
    const a = v.amount === null ? null : `${money(per(Math.abs(v.amount)))} ${perLabel()}`;
    /* not enough to judge: just the reason */
    if (isUnknown(v)) return { lead: v.why, why: '' };
    let lead = '';
    /* 'good' also covers a gain too small to switch for */
    if (a !== null && v.tone === 'good' && v.vs) lead = v.amount >= 0 ? `${a} better off than with ${v.vs}.` : `${v.vs} is only ${a} cheaper.`;
    else if (a !== null && v.tone === 'check') lead = `${v.vs} could save you ${a}.`;
    else if (a !== null && v.tone === 'over') lead = v.id === 'bank' ? `By these figures, ${a} better off with ${v.vs}.` : `Your ${v.vs} quote is ${a} cheaper.`;
    /* a break-even quote is always a monthly premium */
    else if (v.amount !== null && v.tone === 'quote') lead = `A quote under ${money(v.amount)} a month wins.`;
    else if (a !== null && v.tone === 'none') lead = `About ${a} would insure them.`;
    if (!lead) return { lead: v.why, why: '' };
    return v.tone === 'none' ? { lead: v.why, why: lead } : { lead, why: v.why };
  }

  function tag(parent, p) {
    const t = el(parent, 'span', 'dc-ptag dc-p-' + p.id);
    productLogo(t, p.id);
    el(t, 'span', null, p.short);
    return t;
  }

  /* A line with an amount; tap it for where the figure comes from (its
     note and its source). Built whole; the note shows and hides without a
     redraw. raw: v is already for the period shown (a monthly debit, a
     cover amount). text: words in place of the amount. */
  let lineSeq = 0;
  function expandLine(parent, o) {
    const isOpen = open.has(o.key);
    const row = el(parent, 'div', 'dc-line' + (isOpen ? ' is-open' : ''));
    const hasBody = !!(o.note || o.source || o.fill || o.rough);
    /* nothing to show under it: a plain row, not a button */
    const head = hasBody ? button(row, 'dc-line-head', null, null) : el(row, 'div', 'dc-line-head is-static');
    const lab = el(head, 'span', 'dc-line-label');
    el(lab, 'span', null, o.label);
    if (o.rough) el(lab, 'span', 'dc-rough', 'rough guess');
    if (o.text) el(head, 'span', 'dc-amt is-plain', o.text);
    else if (o.v !== null && o.v !== undefined) {
      const v = o.raw ? o.v : per(o.v);
      el(head, 'span', 'dc-amt ' + (o.plainAmt ? 'is-plain' : Math.abs(v) < 0.5 ? 'is-zero' : v > 0 ? 'is-pos' : 'is-neg'), money(v, { plus: o.plus && !o.plainAmt }));
    }
    if (!hasBody) return row;
    const ch = icon(head, 'chevron-down', 'dc-chev');
    const body = el(row, 'div', 'dc-line-body');
    body.id = 'dc-line-' + (++lineSeq);
    head.setAttribute('aria-controls', body.id);
    if (o.source) el(body, 'span', 'dc-badge is-' + o.source, SOURCE[o.source]);
    if (o.rough) el(body, 'p', 'dc-line-note', roughNote(o.rough));
    if (o.note) el(body, 'p', 'dc-line-note', o.note);
    if (o.fill) o.fill(body);
    const sync = () => {
      const on = open.has(o.key);
      head.setAttribute('aria-expanded', String(on));
      row.classList.toggle('is-open', on);
      body.hidden = !on;
      ch.classList.toggle('is-up', on);
    };
    head.addEventListener('click', e => { e.preventDefault(); if (open.has(o.key)) open.delete(o.key); else open.add(o.key); sync(); });
    sync();
    return row;
  }

  /* A figure that is not a statement line: label, amount; its source and
     note in the tap-open body. */
  function plainLine(parent, label, v, source, note, plus, raw, plainAmt, text, rough) {
    return expandLine(parent, { key: 'pl.' + label, label, v, source, note, plus, raw, plainAmt, text, rough: rough && rough.extrapolated ? rough : null });
  }

  function lineRow(parent, l) {
    const sign = l.sign || 1;
    const row = expandLine(parent, {
      key: l.key, label: l.label, v: sign * l.annual, plus: sign > 0, source: l.source, note: l.detail, rough: l.extrapolated && Math.abs(l.annual) >= 0.5 ? l : null,
      fill: l.rateKeys.length ? b => { const g = el(b, 'div', 'dc-fgrid'); for (const k of l.rateKeys) rateInput(g, k); } : null,
    });
    if (l.benefit && (l.weight < 1 || l.available === false)) weightNote(row, l.benefit, l.full, l.annual, l.available);
  }

  /* A figure that counts for less than it is worth because of what you said
     on the Benefits tab, or that your setup cannot earn at all: what counts,
     out of what it would be, and a way to change it. full and counted are
     annual rands. */
  function weightNote(parent, id, full, counted, available) {
    const b = cur && cur.st.benefits[id];
    if (!b) return;
    const isOn = available === undefined ? b.available : available;
    if (isOn && (b.level === 'full' || !(Math.abs(full) >= 0.5))) return;
    const n = el(parent, 'div', 'dc-line-weight' + (isOn ? '' : ' is-blocked'));
    el(n, 'span', 'dc-weight-text', isOn ? `Counts ${R(counted)} of ${R(full)}: you use it ${b.level === 'half' ? 'sometimes' : 'not at all'}.` : 'Not available with your setup.');
    button(n, 'dc-link dc-weight-link', 'Change', () => show('benefits'));
  }

  // ── transactions ─────────────────────────────────────────────────────
  function renderTransactions(parent, p) {
    const txs = p.transactions;
    if (!txs.length) {
      hint(parent, p.id === 'life' && p.monthly ? 'None: it comes off your salary.' : 'None in this period.', 'info');
      return;
    }
    const box = el(parent, 'div', 'dc-card dc-txs-card');
    const all = open.has('tx.' + p.id);
    const shown = all ? txs : txs.slice(0, TX_SHOWN);
    let month = null, ul = null;
    for (const t of shown) {
      const ym = t.date.slice(0, 7);
      if (ym !== month) {
        month = ym;
        el(box, 'p', 'dc-subhead dc-tx-month', monthLabel(ym));
        ul = el(box, 'ul', 'dc-txs');
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
      button(box, 'dc-link', all ? 'Show the latest only' : `Show all ${txs.length}`, () => { all ? open.delete('tx.' + p.id) : open.add('tx.' + p.id); render(); }, all ? 'chevron-up' : 'chevron-down');
    }
  }

  // ── comparison and downgrade (Bank tab) ──────────────────────────────
  function renderCompare(c, st) {
    if (!st.alternatives.length) return;
    const h = subHead(c, 'Compared with other banks', 'bank.cmp');
    el(c, 'p', 'dc-card-line', `On your card spend of ${R(st.cardSpend)} ${perLabel()}. Tap one to compare with it.`);
    const mb = h.more();
    if (st.cardSpendSource === 'statement') el(mb, 'p', null, 'Card spend as counted on your Miles statement; payments and debit orders from the card account earn nothing.');
    const chosen = st.alternatives.find(a => st.chosen && a.id === st.chosen.id);
    if (chosen && chosen.note) el(mb, 'p', null, chosen.note);
    for (const a of st.alternatives) {
      if (a.breakEven === null || !a.partners.some(p => !p.known)) continue;
      const names = a.partners.filter(p => !p.known).map(p => p.label).join(' and ');
      el(mb, 'p', null, `${a.name} would only match Discovery if it paid ${pct(a.breakEven, 0)} back on ${names} (${pct(a.breakEvenCautious, 0)} counted carefully). Look it up in the ${a.app} app and type it on Inputs.`);
    }
    if (!mb.firstChild) el(mb, 'p', null, 'Fees and rewards for the same card spend at each bank.');
    const t = el(c, 'div', 'dc-cmp');
    const head = el(t, 'div', 'dc-cmp-r dc-cmp-h');
    for (const [x, cls] of [['Bank', ''], ['Fees', 'c-fees'], ['Rewards', 'c-rew'], ['Rewards minus fees', ''], ['If you moved', '']]) el(head, 'span', cls || null, x);
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
  }

  /* Another provider's price for the same thing, beside Discovery's. A row
     with no price shows the quote that would match (car insurance). */
  function renderMarket(c, o) {
    const { cmp } = o;
    const h = subHead(c, o.title, o.key);
    if (o.line) el(c, 'p', 'dc-card-line', o.line);
    const mb = h.more();
    if (o.intro) el(mb, 'p', null, o.intro);
    if (o.extra) el(mb, 'p', null, o.extra);
    if (!o.vs) el(mb, 'p', 'dc-small', `"${o.vsLabel || 'If you moved'}" is how much better (+) or worse (−) off you would be ${perLabel()}.`);
    if (o.foot) el(mb, 'p', 'dc-small', o.foot);
    const t = el(c, 'div', 'dc-cmp is-market' + (o.lostLabel ? '' : ' is-3'));
    const head = el(t, 'div', 'dc-cmp-r dc-cmp-h');
    for (const [x, cls] of [['Option', ''], ['A month', ''], ...(o.lostLabel ? [[o.lostLabel, 'c-lost']] : []), [o.vsLabel || 'If you moved', '']]) el(head, 'span', cls || null, x);
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
  }

  function renderDowngrade(c, st) {
    const d = st.downgrade;
    if (!d) return;
    const suite = suiteOf(cur ? cur.eff : plugin.settings).label;
    const h = subHead(c, 'Or stay, on a cheaper account', 'bank.down');
    el(c, 'p', 'dc-card-line', `The ${d.label} instead of the full ${suite}.`);
    const mb = h.more();
    el(mb, 'p', null, `Swap the full ${suite} for just the ${d.label}, and keep Vitality Money. The changes to your rewards are listed below.`);
    if (d.gainAfterWatch !== null) {
      el(mb, 'p', null, `Once your Apple Watch contract ends${d.watchEnds ? ` on ${dayLabel(d.watchEnds)}` : ''}, the Suite no longer gives you the watch, so the cheaper account would leave you ${d.gainAfterWatch >= 0 ? `${R(d.gainAfterWatch)} ${perLabel()} better off` : `${R(d.gainAfterWatch)} ${perLabel()} worse off`}, unless you take a new watch.`);
    }
    const row = (label, v, note) => plainLine(c, label, v, null, note, v > 0);
    row(`${suite} fees you would stop paying`, st.cost);
    row(`${d.label} fee`, -d.fees);
    row('Fees per payment', -d.payt, `About ${Math.round(d.payments)} debit orders and payments a year; the Suite includes them.`);
    for (const ch of d.changes) row(ch.label, ch.delta);
    total(c, `Against the ${suite}, ${perLabel()}`, d.gainIfDowngrade);
  }

  /* The notes under a set of fields (where a figure comes from, what to
     type) wait behind one Notes button per card. */
  function notesToggle(btnParent, host, key) {
    if (!host.id) host.id = 'dc-notes-' + (++moreSeq);
    const btn = el(btnParent, 'button', 'dc-more dc-notes-btn');
    btn.type = 'button';
    btn.setAttribute('aria-controls', host.id);
    const sync = () => {
      const on = open.has(key);
      btn.setAttribute('aria-expanded', String(on));
      host.classList.toggle('is-notes', on);
      clear(btn);
      el(btn, 'span', null, on ? 'Hide notes' : 'Notes');
      icon(btn, on ? 'chevron-up' : 'chevron-down', 'dc-more-chev');
    };
    btn.addEventListener('click', e => { e.preventDefault(); if (open.has(key)) open.delete(key); else open.add(key); sync(); });
    sync();
    return btn;
  }
  /* a longer explanation among the fields: shown with the notes */
  const fnote = (parent, text) => el(parent, 'p', 'dc-fnote', text);

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

  /* The published figure for this person's own tier, bank product and fee
     option, ignoring anything they typed. */
  function defaultRate(key) {
    const s = cur ? cur.eff : plugin.settings;
    return rate({ rates: {}, suite: s.suite, bankKind: s.bankKind, bankFees: s.bankFees }, key, s.status);
  }

  function rateInput(parent, key) {
    const def = RATES[key];
    if (!def) return;
    const s = plugin.settings;
    if (def.unit === 'yes/no') return yesNoInput(parent, key, def);
    const { f, hint } = field(parent, def.label, def.unit);
    const inp = numberInput(f);
    const over = s.rates[key];
    const fallback = defaultRate(key);
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
    const fallback = defaultRate(key) >= 1 ? 'Yes' : 'No';
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

  /* An age in whole years: a text field with the digits keypad. Blank clears
     it; anything else is refused and the old value put back. */
  function ageField(parent, store, key, label, hintText) {
    const { f, hint } = field(parent, label, 'years');
    const inp = el(f, 'input', 'dc-inp');
    inp.type = 'text'; inp.inputMode = 'numeric';
    inp.autocomplete = 'off'; inp.spellcheck = false;
    inp.setAttribute('pattern', '[0-9]*');
    inp.setAttribute('enterkeyhint', 'done');
    inp.value = showTyped(store[key]);
    inp.addEventListener('change', async () => {
      const n = parseTyped(inp.value);
      if (n === null) store[key] = null;
      else if (!Number.isFinite(n) || Math.floor(n) !== n || n < 16 || n > 110) { inp.value = showTyped(store[key]); return; }
      else store[key] = n;
      await save();
    });
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
    const def = defaultRate(key);
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
    el(parent, 'p', 'dc-warn', `${what} typed for ${period.split('..').map(monthLabel).join(' – ')}, not this period. Typing a new one here clears them.`);
  };

  /* who is on the medical aid, and which Discovery Health plan: the plan
     with the family prices the medical aid, so the rest of the debit order
     can be named as Vitality and gap cover */
  const discoveryPlans = () => HEALTH_PLANS.concat(HEALTH_OWN).filter(p => p.discovery);
  function membersFields(g) {
    const s = plugin.settings;
    s.members = s.members || {};
    numField(g, 'Adults on the medical aid', 'people', s.members, 'adults', null, 'You and your spouse or partner. Used to price the plans and other medical aids for your family.');
    numField(g, 'Children on the medical aid', 'children', s.members, 'children', null, 'Most schemes charge for the first three only.');
  }
  function planSelect(parent) {
    const s = plugin.settings;
    s.health = s.health || {};
    const { f, hint } = field(parent, 'Your Discovery Health plan');
    const sel = el(f, 'select', 'dc-inp dropdown');
    for (const [v, label] of [['', 'Not listed']].concat(discoveryPlans().map(x => [x.id, x.plan]))) { const o = el(sel, 'option', null, label); o.value = v; }
    sel.value = s.health.plan || '';
    sel.addEventListener('change', async () => { s.health.plan = sel.value || undefined; await save(); });
    hint('Its cover is shown next to the others, and its price tells the medical aid apart from Vitality and gap cover in the debit order.');
  }

  const INPUTS = {
    bank(c, { st }, o) {
      const s = plugin.settings;
      let g = el(c, 'div', 'dc-fgrid');
      const ms = st.milesStatement;
      if (!o.onInputsPage) statusSelect(g, 'money', 'Bank score (Vitality Money status)', ms ? 'Your Miles statement already gives the real bank figures; this status only changes the estimates.' : null);
      el(c, 'p', 'dc-grp', 'Miles');
      if (ms) {
        const files = budget.miles.files.map(p => p.slice(p.lastIndexOf('/') + 1));
        fnote(c, `We read ${files.join(', ')} (${ms.rows.toLocaleString('en-US').replace(/,/g, ' ')} entries). Anything you type below is used instead.`);
      } else {
        fnote(c, 'Bank statements do not show Miles. In Discovery Bank online, go to Discovery Miles → Download transactions and save the file anywhere in this vault; it is read automatically. Or type the totals for this period below.');
      }
      g = el(c, 'div', 'dc-fgrid');
      for (const [k, label, unit] of MILES_INPUTS) numField(g, label, unit, s.actualMiles, k, stampWindow(s.actualMiles, k, st));
      if (st.actualStale) staleNote(c, st.actualStale, 'These Miles were');
      fnote(c, 'If you type a HealthyFood or HealthyCare total, it is split between the bank\'s part and Vitality Health\'s part using the published percentages.');
      rateInput(g, 'mileValue');
      el(c, 'p', 'dc-grp', 'Vitality Travel receipts');
      fnote(c, 'Each flight receipt (eReceipt) shows "Total base rate" and "Total Discovery discount". Add them up for all the flights booked in this period.');
      s.travel = s.travel || {};
      g = el(c, 'div', 'dc-fgrid');
      numField(g, 'Total Discovery discount', 'R', s.travel, 'discount', stampWindow(s.travel, 'discount', st));
      numField(g, 'Total base rate (full fares)', 'R', s.travel, 'baseFare', stampWindow(s.travel, 'baseFare', st));
      if (s.travel.period && s.travel.period !== `${st.window.from}..${st.window.to}`) {
        staleNote(c, s.travel.period, 'These totals were');
        fnote(c, 'Until you do, their discount percentages are used on this period\'s Vitality Travel payments.');
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
        if (a.source) fnote(box, a.source);
      }
      el(c, 'p', 'dc-grp', 'The cheaper Discovery account');
      g = el(c, 'div', 'dc-fgrid');
      rateInput(g, 'ccFee');
      rateInput(g, 'paytFee');
    },
    health(c, view, o) {
      const s = plugin.settings;
      s.bill = s.bill || {};
      const g = el(c, 'div', 'dc-fgrid');
      if (!o.onInputsPage) statusSelect(g, 'health', 'Health score (Vitality Health status)', 'For reference: HealthyFood and flight discounts depend on the yearly Vitality Age assessment and Health Check, not on this status.');
      numField(g, 'Medical aid premium', 'R/month', s.bill, 'medical', null, 'From your Discovery Health contribution table. The rest of the debit order is shown as Vitality and other.');
      rateInput(g, 'gymDiscountPct');
      rateInput(g, 'activeRewardsWithoutBank');
      el(c, 'p', 'dc-grp', 'Other medical aids');
      s.members = s.members || {};
      if (!o.onInputsPage) {
        const mg = el(c, 'div', 'dc-fgrid');
        membersFields(mg);
      }
      quoteInputs(c, 'health', HEALTH_PLANS, p => p.scheme + ' ' + p.plan, () => null);
      s.health = s.health || {};
      el(c, 'p', 'dc-grp', 'What the medical aid must cover');
      if (!o.onInputsPage) planSelect(c);
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
      fnote(c, 'Check each plan\'s list of hospitals for planned operations. At a hospital not on the list, most plans pay less or make you pay part yourself.');
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
    gap(c, view, o) {
      const s = plugin.settings;
      s.bill = s.bill || {};
      const g = el(c, 'div', 'dc-fgrid');
      numField(g, 'Gap cover, if it is in the Discovery Health debit order', 'R/month', s.bill, 'gap', null, 'Leave blank if gap cover has its own debit order.');
      if (!o || !o.onInputsPage) {
        s.members = s.members || {};
        ageField(g, s.members, 'oldestAge', 'Oldest person on your gap cover', 'Other providers charge more from 45. Their prices shown are for under 45s.');
      }
      el(c, 'p', 'dc-grp', 'Other gap cover');
      quoteInputs(c, 'gap', GAP_PLANS, p => p.provider + ' ' + p.plan, p => p.monthly);
    },
    insure(c, { st }, o) {
      const g = el(c, 'div', 'dc-fgrid');
      if (!o.onInputsPage) statusSelect(g, 'drive', 'Car score (Vitality Drive status)');
      rateInput(g, 'driveFunderAccount');
      rateInput(g, 'fuelDrivePct');
      rateInput(g, 'fuelCap');
      numField(g, 'Vitality Drive rewards this period, if you know them', 'R', plugin.settings.actualMiles, 'fuelDriveCash', stampWindow(plugin.settings.actualMiles, 'fuelDriveCash', st), 'From the Insure app: cash paid or Insure Funder Account deposits. Replaces the estimate.');
      if (st.actualStale && plugin.settings.actualMiles.fuelDriveCash !== undefined) staleNote(c, st.actualStale, 'The Drive rewards were');
      el(c, 'p', 'dc-grp', 'Quotes from other insurers');
      fnote(c, 'For the same cars, drivers and cover. Most give a quote online in a few minutes.');
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
      fnote(c, 'For the same life, severe illness and income cover, all together.');
      quoteInputs(c, 'life', LIFE_OFFERS, o => o.name, o => o.monthly);
    },
  };

  /* An Inputs card: a product's (or the page's) mark, heading and figure,
     with a Notes toggle for the hints under the fields. */
  function inputCard(panel, title, p, figureV, key) {
    const sec = el(panel, 'section', 'dc-card dc-ch dc-notes-host' + (p ? ' dc-p-' + p : ''));
    const head = el(sec, 'div', 'dc-card-head');
    if (p) productLogo(el(head, 'span', 'dc-tile'), p);
    else icon(el(head, 'span', 'dc-tile is-plain'), 'sliders-horizontal');
    el(head, 'h2', 'dc-card-title', title);
    if (figureV !== null && figureV !== undefined) amt(head, figureV, { plus: true, cls: 'dc-head-fig' });
    notesToggle(head, sec, key);
    return el(sec, 'div', 'dc-ch-body');
  }

  function renderInputs(panel, view) {
    csvNotesStrip(panel);
    renderSetup(panel, view);
    const gb = inputCard(panel, 'For the whole page', null, null, 'notes.page');
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
      const body = inputCard(panel, p.name, p.id, p.figure, 'notes.in.' + p.id);
      INPUTS[p.id](body, view, { onInputsPage: true });
    }
  }

  /* A question with a few answers, as real radios in a fieldset (the
     legend is the question). onPick(value) runs when one is chosen. */
  let radioSeq = 0;
  function radios(parent, legend, options, value, onPick, cls) {
    const box = el(parent, 'fieldset', 'dc-radios' + (cls ? ' ' + cls : ''));
    el(box, 'legend', 'dc-fld-l', legend);
    const list = el(box, 'div', 'dc-radios-opts');
    const name = 'dc-radio-' + (++radioSeq);
    for (const o of options) {
      const lab = el(list, 'label', 'dc-radio' + (o.value === value ? ' is-on' : ''));
      const inp = el(lab, 'input', 'dc-radio-in');
      inp.type = 'radio';
      inp.name = name;
      inp.value = o.value;
      inp.checked = o.value === value;
      el(lab, 'span', 'dc-radio-l', o.label);
      inp.addEventListener('change', () => { if (inp.checked) onPick(o.value); });
    }
    return box;
  }

  /* Your Discovery setup: the answers to the first-run questions, one place
     to change any of them. */
  function renderSetup(panel, view) {
    const s = plugin.settings;
    const { detected, banking, products, vitality, st, eff } = view;
    const body = inputCard(panel, 'Your Discovery setup', null, null, 'notes.setup');
    /* what Discovery sets some rewards by; unanswered counts the lower figure */
    const cond = s.conditions || {};
    const setCond = async (k, v) => { s.conditions = { ...s.conditions, [k]: v }; await save(); };
    body.parentNode.classList.add('dc-setup');
    fnote(body, 'What you have decides which tabs show and which benefits count. The note under each product says what your budget shows.');

    const list = el(body, 'div', 'dc-setup-prods');
    for (const id of PRODUCT_IDS) {
      const { row } = checkRow(list, 'dc-setup-prod dc-p-' + id, products[id], async on => { s.products = { ...s.products, [id]: on }; await save(); });
      const t = el(row, 'span', 'dc-setup-prod-t');
      el(t, 'span', 'dc-fld-l', PRODUCT_NAMES[id]);
      if ((detected[id] || {}).why) el(t, 'span', 'dc-fld-h', detected[id].why);
    }

    const yesNo = (g, key, label, hint) => {
      const { f, hint: h } = field(g, label);
      const sel = el(f, 'select', 'dc-inp dropdown');
      for (const [v, text] of [['yes', 'Yes'], ['no', 'No']]) { const o = el(sel, 'option', null, text); o.value = v; }
      sel.value = vitality[key] ? 'yes' : 'no';
      sel.addEventListener('change', async () => { s.vitality = { ...s.vitality, [key]: sel.value === 'yes' }; await save(); });
      if (hint) h(hint);
    };

    if (products.bank) {
      el(body, 'p', 'dc-grp', 'Discovery Bank');
      const g = el(body, 'div', 'dc-fgrid');
      const kind = eff.bankKind || 'suite';
      const { f: kf, hint: kh } = field(g, 'Bank product');
      const ksel = el(kf, 'select', 'dc-inp dropdown');
      for (const k of Object.keys(KIND_LABELS)) { const o = el(ksel, 'option', null, KIND_LABELS[k]); o.value = k; }
      ksel.value = kind;
      ksel.addEventListener('change', async () => { s.bankKind = ksel.value; await save(); });
      kh((banking.why || '') + (s.bankKind ? '' : banking.kind ? ' Read from your account notes. Choose one to confirm it.' : ' You have not said which one yet, so it is counted as a Suite.'));
      if (kind !== 'savings') {
        const tiers = kind === 'card' ? SUITES.filter(t => t.creditCard) : SUITES;
        const { f: tf } = field(g, kind === 'card' ? 'Credit card tier' : 'Tier');
        const tsel = el(tf, 'select', 'dc-inp dropdown');
        for (const t of tiers) { const o = el(tsel, 'option', null, kind === 'card' ? t.creditCard.label : t.label); o.value = t.id; }
        tsel.value = tiers.some(t => t.id === eff.suite) ? eff.suite : tiers[0].id;
        tsel.addEventListener('change', async () => { s.suite = tsel.value; s.suiteAnswered = true; await save(); });
      }
      if (kind === 'transaction') {
        const { f: ff, hint: fh } = field(g, 'Fee option');
        const fsel = el(ff, 'select', 'dc-inp dropdown');
        for (const [v, text] of [['bundled', 'Bundled fees'], ['payt', 'Pay as you transact']]) { const o = el(fsel, 'option', null, text); o.value = v; }
        fsel.value = s.bankFees === 'payt' ? 'payt' : 'bundled';
        fsel.addEventListener('change', async () => { s.bankFees = fsel.value; await save(); });
        fh('Bundled fees give you a set number of payments for a monthly fee. Pay as you transact charges for each payment.');
      }
      yesNo(g, 'money', 'Vitality Money', banking.vitalityMoney ? 'Vitality Money premiums show in your budget.' : 'No Vitality Money premium shows in your budget.');
      if (vitality.money) statusSelect(g, 'money', 'Bank score (Vitality Money status)');
      if (st.mileSource === 'statement') {
        const { f, hint: mh } = field(body, 'How you spend your Miles');
        el(f, 'span', 'dc-card-line', 'Read from your Miles statement.');
        mh('Your Miles statement shows what your Miles bought, so there is nothing to choose.');
      } else {
        radios(body, 'How do you spend your Miles?', MILES_USE, s.milesUse || '', async v => { s.milesUse = v; await save(); }, 'dc-miles-use');
      }
    }
    if (products.health) {
      el(body, 'p', 'dc-grp', 'Discovery Health');
      const g = el(body, 'div', 'dc-fgrid');
      yesNo(g, 'health', 'Vitality Health');
      if (vitality.health) statusSelect(g, 'health', 'Health score (Vitality Health status)');
      planSelect(g);
      membersFields(g);
      if (vitality.health) {
        radios(body, 'Vitality Age and a Vitality Health Check in the last 12 months?', CHECKS, cond.checks || '', v => setCond('checks', v));
        radios(body, 'At Virgin Active or Planet Fitness 36 times a year or more?', YES_NO, cond.gym36 === true ? 'yes' : cond.gym36 === false ? 'no' : '', v => setCond('gym36', v === 'yes'));
      }
    }
    if (products.gap) {
      el(body, 'p', 'dc-grp', 'Gap cover');
      s.members = s.members || {};
      const g = el(body, 'div', 'dc-fgrid');
      ageField(g, s.members, 'oldestAge', 'Oldest person on your gap cover', 'Other providers charge more from 45. Their prices shown are for under 45s. Leave blank if you are not sure.');
    }
    if (products.insure) {
      el(body, 'p', 'dc-grp', 'Discovery Insure');
      const g = el(body, 'div', 'dc-fgrid');
      yesNo(g, 'drive', 'Vitality Drive');
      if (vitality.drive) statusSelect(g, 'drive', 'Car score (Vitality Drive status)');
      radios(body, 'Which Discovery Insure plan are you on?', INSURE_PLANS, cond.insurePlan || '', v => setCond('insurePlan', v));
      radios(body, 'Does Discovery Insure also cover your home?', HOME_COVER, cond.homeCover || '', v => setCond('homeCover', v));
    }
    const again = el(body, 'div', 'dc-setup-again');
    button(again, 'dc-btn', 'Ask me the questions again', async () => { s.onboarded = false; await plugin.saveSettings(); render(); });
    el(again, 'span', 'dc-fld-h', 'Goes through the first-run questions again, with your answers filled in.');
  }

  function renderBenefitsTab(panel, view) {
    renderBenefits(panel, { s: view.s, st: view.st, save, rerender: render, period: period(), milesUse: MILES_USE });
  }

  function renderFoot(panel, { m, st }) {
    const f = el(panel, 'footer', 'dc-foot');
    const line = el(f, 'div', 'dc-foot-line');
    el(line, 'span', null, 'A calculator, not financial advice.');
    const mb = moreIn(line, 'foot.more', 'More', f);
    el(mb, 'p', null, 'Some figures are estimates; each product tab shows the rate behind them. Discovery changes its rates every year.');
    const excl = Object.entries(m.excludedFromSpend).filter(([, v]) => Math.abs(v) >= 1);
    if (excl.length && tab() === 'bank') {
      const scale = 12 / st.window.months;
      el(mb, 'p', null, `Left out of card spend, ${perLabel()}: ` +
        excl.map(([k, v]) => `${k} ${money(per(v * scale))}`).join(' · ') + '.');
    }
  }

  return {
    refresh, render,
    destroy() { if (flow) flow.destroy(); if (ro) ro.disconnect(); if (tabSaveTimer) { clearTimeout(tabSaveTimer); plugin.saveSettings(); } clear(root); },
  };
}

module.exports = { mountBottomLine };
