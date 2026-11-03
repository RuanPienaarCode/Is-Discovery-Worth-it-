/* Harness entry: mounts the REAL bottom-line page (src/bottom-line.js) on a
   fake plugin host over an in-memory vault of SYNTHETIC budget notes — a
   made-up family, never real statements.
     ?theme=dark   Obsidian's theme-dark class
     ?empty=1      a vault with no budget
     ?miles=1      with actual Miles typed in
     ?nomiles=1    no Miles statement in the vault (estimates only)
     ?tab=bank     open a tab (overview, flows, bank, health, gap, insure, life, inputs)
     ?welcome=0    skip the welcome screen (also skipped by ?tab= and ?check=)
     ?mobile=1     an iPhone: Obsidian's is-mobile + is-phone classes, and the
                   notch and home-bar insets an iPhone 11 reports (portrait or
                   landscape by the window's shape)
     ?check=1      walk every tab at the current width and report sideways scroll,
                   labels over amounts, tap targets under 44px and flow text that
                   an SVG clips or overlaps (in #dc-check) */
import { makeMemoryVault } from './memory-vault.js';
const { mountBottomLine } = require('../src/bottom-line');
const { loadBudget } = require('../src/load');
const { DEFAULT_SETTINGS } = require('../src/constants');

const q = new URLSearchParams(location.search);
document.body.classList.add(q.get('theme') === 'dark' ? 'theme-dark' : 'theme-light');
if (q.get('mobile')) {
  document.body.classList.add('is-mobile', 'is-phone');
  /* iPhone 11: notch 48 / home bar 34 in portrait; notch at the side, home bar 21 in landscape */
  const land = innerWidth > innerHeight;
  const inset = { top: land ? 0 : 48, bottom: land ? 21 : 34, left: land ? 48 : 0, right: land ? 48 : 0 };
  for (const [k, v] of Object.entries(inset)) document.body.style.setProperty(`--safe-area-inset-${k}`, v + 'px');
}
const NOW = new Date(2026, 9, 21);

const B = 'Money/Budget/';
const fm = (k, v) => `${k}: ${v}`;
const note = (account, month, rows) => [
  '---', fm('account', `"${account}"`), fm('month', month), '---', '',
  '| Date | Description | Category | Amount | Excluded | Note |',
  '|------|-------------|----------|-------:|----------|------|',
  ...rows.map(r => `| ${r[0]} | ${r[1]} | ${r[2]} | ${r[3].toFixed(2)} |  |  |`), '',
].join('\n');

const files = {
  [B + 'Accounts/Everyday Card.md']: '---\ntype: credit_card\ninstitution: Discovery Bank\ntx_label: "Card"\n---\n',
  [B + 'Accounts/Everyday Account.md']: '---\ntype: checking\ninstitution: Discovery Bank\ntx_label: "Everyday"\n---\n',
  [B + 'Accounts/Rainy Day.md']: '---\ntype: savings\ninstitution: Discovery Bank\ntx_label: "Rainy Day"\n---\n',
  [B + 'Categories/Card payment.md']: '---\ntype: transfer\n---\n',
  [B + 'Categories/Groceries.md']: '---\ntype: food\n---\n',
};
for (let i = 0; i < 13; i++) {
  const d = new Date(2025, 8 + i, 1);
  const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const day = n => `${ym}-${String(n).padStart(2, '0')}`;
  const wob = (base, f) => base * (1 + 0.15 * Math.sin(i * f));
  files[`${B}Transactions/Card/${ym}.md`] = note('Card', ym, [
    [day(1), 'Monthly Account fee', 'Bank charges & fees', -430],
    [day(1), 'Monthly facility fee', 'Bank charges & fees', -69],
    [day(1), 'Vitality Money Premium', 'Bank charges & fees', -98],
    [day(3), 'CHECKERS SAMPLETOWN', 'Groceries', -wob(3200, 1.3)],
    [day(10), 'WOOLWORTHS SAMPLETOWN', 'Groceries', -wob(1400, 0.7)],
    [day(17), 'PnP Fam Sampletown', 'Groceries', -wob(600, 2.1)],
    [day(5), 'BP SAMPLETOWN', 'Fuel', -wob(1300, 0.9)],
    [day(19), 'SHELL SAMPLETOWN', 'Fuel', -wob(900, 1.7)],
    [day(8), 'CLICKS SAMPLETOWN', 'Toiletries', -wob(450, 1.1)],
    [day(12), 'VIRGIN ACT 0001 NETCASH', 'Gym', -365],
    [day(14), 'Yoco *Sample Cafe', 'Eating out', -wob(900, 0.5)],
    [day(21), 'TAKEALOT', 'Household', -wob(1800, 2.6)],
    [day(25), 'Payment received', 'Card payment', 12000],
    [day(28), 'Dynamic interest cashback at 2%', 'Interest income', 4.2],
    [day(28), 'Intl payment fee SPOTIFY', 'Bank charges & fees', -2.1],
    ...(i === 4 ? [[day(9), 'VITALITY TRAVEL', 'Holiday', -5400]] : []),
  ]);
  files[`${B}Transactions/Everyday/${ym}.md`] = note('Everyday', ym, [
    [day(1), 'DISC PREM 000-111', 'Medical aid', -5900],
    [day(25), 'DISCINSURE000 -111', 'Car insurance', -1150],
    [day(28), 'Dynamic interest boost at 1.5%', 'Interest income', 18.5],
    [day(28), 'Interest Earned at 6.25%', 'Interest income', 160],
    ...(i % 3 === 0 ? [[day(15), 'DISC MEMB 000-111', 'Medical expenses', 820]] : []),
    ...(i === 6 ? [[day(17), 'INSGAPCLA 000-222', 'Transfer between accounts', 9200]] : []),
  ]);
}

/* A synthetic Miles statement (?nomiles=1 leaves it out). */
const csv = ['"Value Date","Type","Description","Additional information","Miles"'];
for (let i = 0; i < 13; i++) {
  const d = new Date(2025, 8 + i, 28);
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-28`;
  csv.push(`${day},"Vitality Money","Checkers in-store","",${2400 + i * 40}.00`);
  csv.push(`${day},"Vitality Health","Checkers in-store","",${3100 + i * 30}.00`);
  csv.push(`${day},"Vitality Money","Fuel BP","",${900 + (i % 3) * 50}.00`);
  csv.push(`${day},"Base Miles","TAKEALOT","${day} - R 1,800.00",120.00`);
  csv.push(`${day},"","Gameboard - Coin tile","",250.00`);
  if (i % 4 === 0) csv.push(`${day},"Basket value - R 1,200.00","Discovery Miles Redeemed For TAKE A LOT","",-8400.00`);
}
if (!q.get('nomiles')) files['Money/Discovery/DiscoveryBankMiles_1234567890_20220101_20261021.csv'] = csv.join('\n') + '\n';

const vault = makeMemoryVault(q.get('empty') ? { 'Notes/Hello.md': '# hi\n' } : files);
const plugin = {
  settings: { ...DEFAULT_SETTINGS, status: { money: 'Diamond', health: 'Gold', drive: 'Silver' }, rates: {}, actualMiles: q.get('miles') ? { card: 2600, fuel: 900 } : {}, travel: {}, bill: { medical: 5000, gap: 250 }, members: { adults: 2, children: 1 }, quotes: { 'insure.outsurance': 1050 }, life: { monthly: 650, cover: 750000, total: 1300, age: 41 }, home: { monthly: 0, contents: 300000 }, tab: q.get('tab') || 'overview', welcome: !(q.get('check') || q.get('welcome') === '0' || q.get('tab')) },
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
  /* the phone-layout check: run it at 375px (and 320px) before a release */
  const host = document.querySelector('.view-content');
  const lines = [];
  for (const t of ['overview', 'compare', 'flows', 'bank', 'health', 'gap', 'insure', 'life', 'inputs']) {
    plugin.settings.tab = t;
    ui.render();
    await new Promise(r => setTimeout(r, 300));
    /* on a phone the page scrolls inside itself (.dc-page), not the view */
    const sc = document.querySelector('.dc-page.is-narrow') || host;
    const over = sc.scrollWidth > sc.clientWidth ? `scrolls sideways ${sc.scrollWidth}/${sc.clientWidth}` : '';
    const heads = [...document.querySelectorAll('.dc-line-head')];
    const overlaps = heads.filter(h => {
      const l = h.querySelector('.dc-line-label'), a = h.querySelector('.dc-amt');
      return l && a && l.getBoundingClientRect().right > a.getBoundingClientRect().left + 1;
    }).length;
    const small = [...document.querySelectorAll('.dc-page button, .dc-page input, .dc-page select, .dc-chrome button')].filter(e => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && (r.height < 43.5 || r.width < 43.5);
    }).length;
    /* an SVG clips its own text instead of scrolling, so measure it */
    let flowText = 0;
    for (const svg of document.querySelectorAll('.dc-page svg')) {
      const sr = svg.getBoundingClientRect(), ts = [...svg.querySelectorAll('text')].map(t => t.getBoundingClientRect()).filter(b => b.width);
      flowText += ts.filter((a, i) => a.right > sr.right + 0.5 || ts.some((b, j) => j > i && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1)).length;
    }
    const found = [over, overlaps ? overlaps + ' labels over amounts' : '', small ? small + ' tap targets under 44px' : '', flowText ? flowText + ' flow labels clipped or overlapping' : ''].filter(Boolean).join(', ');
    lines.push(`${t}: ${found || 'ok'} (${heads.length} lines, ${document.querySelectorAll('.dc-page button, .dc-page input, .dc-page select, .dc-chrome button').length} controls)`);
  }
  const pre = document.createElement('pre');
  pre.id = 'dc-check';
  pre.textContent = `width ${host.clientWidth}\n` + lines.join('\n');
  document.body.prepend(pre);
});
