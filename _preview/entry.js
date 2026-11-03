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
     ?welcome=0    skip the welcome screen (also skipped by ?tab= and ?check=)
     ?mobile=1     an iPhone: Obsidian's is-mobile + is-phone classes, and the
                   notch and home-bar insets an iPhone 11 reports (portrait or
                   landscape by the window's shape)
     ?old=1        a clock past the market data's review date (the stale
                   banner on Compare)
     ?check=1      walk every visible tab at the current width and report
                   sideways scroll, labels over amounts, tap targets under
                   44px, flow text that an SVG clips or overlaps, and cards
                   that show more than one line before More (in #dc-check) */
import { makeMemoryVault } from './memory-vault.js';
const { mountBottomLine } = require('../src/bottom-line');
const { loadBudget } = require('../src/load');
const { DEFAULT_SETTINGS } = require('../src/constants');
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

const B = 'Money/Budget/';
const fm = (k, v) => `${k}: ${v}`;
const note = (account, month, rows) => [
  '---', fm('account', `"${account}"`), fm('month', month), '---', '',
  '| Date | Description | Category | Amount | Excluded | Note |',
  '|------|-------------|----------|-------:|----------|------|',
  ...rows.map(r => `| ${r[0]} | ${r[1]} | ${r[2]} | ${r[3].toFixed(2)} |  |  |`), '',
].join('\n');

/* Whose accounts these are: Discovery Bank's (the sample and ?setup=gold) or
   another bank's (?setup=healthonly, where only the medical aid is Discovery). */
const OTHER = SETUP === 'healthonly';
const inst = OTHER ? 'Sometown Savings Bank' : 'Discovery Bank';
const files = {
  [B + 'Accounts/Everyday Card.md']: `---\ntype: credit_card\ninstitution: ${inst}\ntx_label: "Card"\n---\n`,
  [B + 'Accounts/Everyday Account.md']: `---\ntype: checking\ninstitution: ${inst}\ntx_label: "Everyday"\n---\n`,
  [B + 'Accounts/Rainy Day.md']: `---\ntype: savings\ninstitution: ${inst}\ntx_label: "Rainy Day"\n---\n`,
  [B + 'Categories/Card payment.md']: '---\ntype: transfer\n---\n',
  [B + 'Categories/Groceries.md']: '---\ntype: food\n---\n',
};
/* the thirteen months up to the clock's month */
const START = new Date(NOW.getFullYear(), NOW.getMonth() - 13, 1);
const GOLD = SETUP === 'gold';
for (let i = 0; i < 13; i++) {
  const d = new Date(START.getFullYear(), START.getMonth() + i, 1);
  const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const day = n => `${ym}-${String(n).padStart(2, '0')}`;
  const wob = (base, f) => base * (1 + 0.15 * Math.sin(i * f));
  /* a Discovery card's own fees, by tier; another bank's card has none that count */
  const fees = OTHER ? [] : GOLD
    ? [[day(1), 'Monthly Account fee', 'Bank charges & fees', -115], [day(1), 'Monthly facility fee', 'Bank charges & fees', -69], [day(1), 'Vitality Money Premium', 'Bank charges & fees', -66]]
    : [[day(1), 'Monthly Account fee', 'Bank charges & fees', -430], [day(1), 'Monthly facility fee', 'Bank charges & fees', -69], [day(1), 'Vitality Money Premium', 'Bank charges & fees', -98]];
  files[`${B}Transactions/Card/${ym}.md`] = note('Card', ym, [
    ...fees,
    [day(3), 'CHECKERS SOMETOWN', 'Groceries', -wob(3200, 1.3)],
    [day(10), 'WOOLWORTHS SOMETOWN', 'Groceries', -wob(1400, 0.7)],
    [day(17), 'PnP Fam Sometown', 'Groceries', -wob(600, 2.1)],
    [day(5), 'BP SOMETOWN', 'Fuel', -wob(1300, 0.9)],
    [day(19), 'SHELL SOMETOWN', 'Fuel', -wob(900, 1.7)],
    [day(8), 'CLICKS SOMETOWN', 'Toiletries', -wob(450, 1.1)],
    [day(12), 'VIRGIN ACT 0001 NETCASH', 'Gym', -365],
    [day(14), 'Yoco *Sample Cafe', 'Eating out', -wob(900, 0.5)],
    [day(21), 'TAKEALOT', 'Household', -wob(1800, 2.6)],
    [day(25), 'Payment received', 'Card payment', 12000],
    ...(OTHER ? [] : [
      [day(28), 'Dynamic interest cashback at 2%', 'Interest income', 4.2],
      [day(28), 'Intl payment fee SPOTIFY', 'Bank charges & fees', -2.1],
    ]),
    ...(i === 4 && !OTHER ? [[day(9), 'VITALITY TRAVEL', 'Holiday', -5400]] : []),
  ]);
  files[`${B}Transactions/Everyday/${ym}.md`] = note('Everyday', ym, [
    [day(1), 'DISC PREM 000-111', 'Medical aid', -5900],
    ...(GOLD || OTHER ? [] : [[day(25), 'DISCINSURE000 -111', 'Car insurance', -1150]]),
    ...(OTHER ? [] : [
      [day(28), 'Dynamic interest boost at 1.5%', 'Interest income', 18.5],
      [day(28), 'Interest Earned at 6.25%', 'Interest income', 160],
    ]),
    ...(i % 3 === 0 ? [[day(15), 'DISC MEMB 000-111', 'Medical expenses', 820]] : []),
    ...(i === 6 && !GOLD && !OTHER ? [[day(17), 'INSGAPCLA 000-222', 'Transfer between accounts', 9200]] : []),
  ]);
}

/* A synthetic Miles statement (?nomiles=1 leaves it out; none for another bank). */
const csv = ['"Value Date","Type","Description","Additional information","Miles"'];
for (let i = 0; i < 13; i++) {
  const d = new Date(START.getFullYear(), START.getMonth() + i, 28);
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-28`;
  csv.push(`${day},"Vitality Money","Checkers in-store","",${2400 + i * 40}.00`);
  csv.push(`${day},"Vitality Health","Checkers in-store","",${3100 + i * 30}.00`);
  csv.push(`${day},"Vitality Money","Fuel BP","",${900 + (i % 3) * 50}.00`);
  csv.push(`${day},"Base Miles","TAKEALOT","${day} - R 1,800.00",120.00`);
  csv.push(`${day},"","Gameboard - Coin tile","",250.00`);
  if (i % 4 === 0) csv.push(`${day},"Basket value - R 1,200.00","Discovery Miles Redeemed For TAKE A LOT","",-8400.00`);
}
if (!q.get('nomiles') && !OTHER) files['Money/Discovery/DiscoveryBankMiles_1234567890_20220101_20261101.csv'] = csv.join('\n') + '\n';

/* The settings. The default is a finished set-up with every product; the
   others start from what the budget shows (products left unanswered) or
   from nothing at all (?onboard=1: the questions). */
const base = {
  ...DEFAULT_SETTINGS,
  status: { ...DEFAULT_SETTINGS.status }, rates: {}, products: { ...DEFAULT_SETTINGS.products }, vitality: { ...DEFAULT_SETTINGS.vitality },
  benefits: {}, health: {}, members: { ...DEFAULT_SETTINGS.members }, quotes: {}, life: {}, home: {}, bill: {}, travel: {}, actualMiles: {},
};
const ui0 = { tab: q.get('tab') || 'overview', welcome: !(q.get('check') || q.get('welcome') === '0' || q.get('tab')) };
let settings;
if (ONBOARD) {
  /* fresh: not onboarded, nothing answered; the welcome shows first */
  settings = { ...base, welcome: true, tab: 'overview' };
} else if (OTHER) {
  settings = { ...base, ...ui0, onboarded: true, bankKind: null, status: { money: 'Blue', health: 'Silver', drive: 'Blue' }, vitality: { money: false, health: true, drive: false }, members: { adults: 2, children: 1 }, health: { plan: 'dhClassicSmart' }, bill: { medical: 4600 } };
} else if (GOLD) {
  settings = { ...base, ...ui0, onboarded: true, products: { bank: true, health: true, gap: false, insure: false, life: false }, bankKind: 'suite', suite: 'Gold', status: { money: 'Gold', health: 'Gold', drive: 'Blue' }, vitality: { money: true, health: true, drive: false }, members: { adults: 2, children: 1 }, health: { plan: 'dhClassicSmart' }, bill: { medical: 4600 } };
} else {
  settings = { ...base, ...ui0, onboarded: true, products: { bank: true, health: true, gap: true, insure: true, life: true }, bankKind: 'suite', suite: 'Black', status: { money: 'Diamond', health: 'Gold', drive: 'Silver' }, vitality: { money: true, health: true, drive: true }, benefits: { gameboard: 'half', flights: 'none' }, actualMiles: q.get('miles') ? { card: 2600, fuel: 900 } : {}, bill: { medical: 5000, gap: 250 }, members: { adults: 2, children: 1 }, quotes: { 'insure.outsurance': 1050 }, life: { monthly: 650, cover: 750000, total: 1300, age: 41 }, home: { monthly: 0, contents: 300000 } };
}

const vault = makeMemoryVault(q.get('empty') ? { 'Notes/Hello.md': '# hi\n' } : files);
const plugin = {
  settings,
  async saveSettings() { console.log('[saveSettings]', JSON.stringify(plugin.settings)); },
  async readBudget() {
    const paths = vault.getFiles().map(f => f.path).filter(p => /\.(md|csv)$/.test(p));
    return loadBudget({ paths: () => paths, read: async p => vault.files.get(p) }, plugin.settings.budgetFolder);
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
    const found2 = found + (wordy ? (found ? ', ' : '') + wordy + ' cards with more than one line' : '');
    lines.push(`${t}: ${found2 || 'ok'} (${heads.length} lines, ${document.querySelectorAll('.dc-page button, .dc-page input, .dc-page select').length} controls)`);
  }
  const pre = document.createElement('pre');
  pre.id = 'dc-check';
  pre.textContent = `width ${host.clientWidth}\n` + lines.join('\n');
  document.body.prepend(pre);
});
