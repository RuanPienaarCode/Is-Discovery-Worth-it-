'use strict';
/* The five Discovery products as the page shows them — Bank, Health, Gap
   cover, Insure, Life — each with what it costs, what comes back, the lines
   behind it, its transactions, and the money flow's links. Pure: built from
   the measured window (measure.js), the statement (model.js) and settings,
   so it runs in node for the tests.

   Two kinds of "back": cash (refunds, claims, Drive cash) and value (Miles at
   what they fetched, the Apple Watch, discounts). The flow draws both; the
   whole-bill total counts cash only, and says so. */

const { annualOf } = require('./measure');

const num = v => v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v));

/* Dated changes worth a reminder (shown only while still ahead). */
const DATES = [
  { date: '2026-11-01', product: 'bank', text: 'The extra fuel rewards from Discovery Bank drop to at most 15% back at bp or Shell.' },
  { date: '2026-11-01', product: 'insure', text: 'Vitality Drive fuel rewards start being paid as Discovery Miles, and you need to pay with the Discovery Bank virtual card to get them.' },
  { date: '2026-12-31', product: 'insure', text: 'Last day for the main driver to open a Discovery Bank account, or the Vitality Drive fuel rewards stop.' },
  { date: '2027-01-01', product: 'insure', text: 'The Vitality Drive cards stop working. Pay for fuel with the Discovery Bank virtual card instead.' },
  { date: '2027-01-01', product: 'bank', text: 'Discovery\'s new rates usually start now. The figures here use the 2026 rates, so check them again.' },
];

/* chosen: the resolveProducts() map ({ bank, health, gap, insure, life }).
   A product set to false is left out of `products`, the totals and the
   dates, so the page never shows or adds up what the person does not have.
   `all` keeps every product, for callers that look one up by id. Leave
   chosen out for all five. */
function buildProducts(st, m, ms, settings, now, chosen) {
  const n = st.window.dataMonths || 1;
  /* A premium or claim a year over the months its paying account holds
     data: a Discovery Health debit on another bank imported for twelve
     months is twelve months, whatever the Discovery Bank accounts hold. */
  const yrOf = key => annualOf(m, [key], n);
  const L = key => { const l = st.lines.find(x => x.key === key); return l ? l.annual : 0; };
  const lineOf = key => st.lines.find(x => x.key === key) || null;
  const rows = key => ((m.rows && m.rows[key]) || []).map(r => ({ ...r, key }));
  const known = settings.bill || {};
  const life = settings.life || {};
  const gapMonthly = num(known.gap) ? Number(known.gap) : 0;

  /* ── Discovery Bank ─────────────────────────────────────────────── */
  const milesKeys = [['miles.healthyFood', 'Extra HealthyFood'], ['miles.card', 'Miles for using your card'], ['fuel.money', 'Extra fuel'], ['miles.healthyCare', 'Extra HealthyCare'], ['miles.partners', 'Partner shops']];
  const milesParts = milesKeys.map(([k, label]) => [label, L(k)]).filter(p => p[1] >= 0.5);
  const bankBack = [
    { label: 'Miles', v: milesParts.reduce((s, p) => s + p[1], 0), parts: milesParts },
    { label: 'Apple Watch', v: L('appleWatch') },
    { label: 'Flight discount', v: L('travel.bank') },
    { label: 'Gameboard rewards', v: L('gameboard') },
    { label: 'Vitality Health Miles worth more', v: L('miles.uplift') },
    { label: 'Extra interest and cashback', v: L('interest.boost') + L('interest.cashback') },
    { label: 'Base interest on savings', v: L('interest.earned') },
  ].filter(b => b.v >= 0.5);
  /* Charges any bank makes are left out of the stay-or-switch net, but they
     were still paid to Discovery Bank, so the flow and the whole bill count
     them (and the base interest it paid you) */
  const bankElsewhere = st.lines.filter(l => l.group === 'elsewhere' && l.key !== 'interest.earned' && Math.abs(l.annual) >= 0.5);
  const bankTx = [
    ...rows('fee.account'), ...rows('fee.facility'), ...rows('fee.vitalityMoney'), ...rows('fee.other'),
    ...rows('fee.penalty'), ...rows('fee.fx'), ...rows('benefit.appleWatch'), ...rows('travel.vitality'),
    ...rows('interest.boost'), ...rows('interest.cashback'), ...rows('interest.charged'), ...rows('interest.earned'),
  ];
  const bank = {
    id: 'bank', name: 'Discovery Bank', short: 'Bank', icon: 'landmark',
    figure: st.net, figureLabel: 'Rewards minus fees',
    paid: st.cost + bankElsewhere.reduce((s, l) => s + l.annual, 0), outLabel: 'Fees and charges',
    outParts: st.lines.filter(l => l.group === 'cost' && Math.abs(l.annual) >= 0.5).concat(bankElsewhere).map(l => [l.label, -l.annual]),
    /* interest (boost, cashback and base) is paid in cash; the rest is value */
    back: bankBack, cashBack: L('interest.boost') + L('interest.cashback') + L('interest.earned'),
    note: bankElsewhere.length || L('interest.earned') >= 0.5
      ? 'Foreign payment fees, penalty fees, card interest and normal savings interest are shown here because they went through Discovery Bank. Any bank would charge or pay these, so the Bank tab leaves them out of its figure.'
      : '',
    transactions: bankTx.concat(milesRows(ms, 'bank')),
  };

  /* ── Discovery Health (medical aid and Vitality Health) ──────────── */
  const debitYear = yrOf('product.medical');
  const gapInDebit = gapMonthly * 12 * (debitYear > 0 ? 1 : 0);
  const vitalityYear = st.bill.vitalityMonthly !== null ? st.bill.vitalityMonthly * 12 : 0;
  const medicalYear = Math.max(0, debitYear - gapInDebit - vitalityYear);
  const refunds = yrOf('product.medicalBack');
  /* What Vitality Health gives back is value, not cash, like the Drive
     estimate on Insure: without it the flow charged the premium and
     credited nothing. */
  const vitParts = [['Gym discount', st.vitality.gymSaving],
    ...['healthyFood.health', 'healthyCare.health', 'travel.health', 'activeRewards', 'activeRewards.basic'].map(k => [(lineOf(k) || {}).label || k, L(k)])]
    .filter(p => p[1] >= 0.5);
  const vitValue = vitParts.reduce((s, p) => s + p[1], 0);
  const health = {
    id: 'health', name: 'Discovery Health', short: 'Health', icon: 'heart-pulse',
    figure: -(medicalYear + vitalityYear), figureLabel: 'Medical aid and Vitality Health',
    paid: medicalYear + vitalityYear, outLabel: 'Medical aid and Vitality',
    outParts: vitalityYear ? [['Medical aid', -medicalYear], ['Vitality Health', -vitalityYear]] : [['Discovery Health debit', -medicalYear]],
    back: [
      ...(refunds >= 0.5 ? [{ label: 'Claims paid back', v: refunds }] : []),
      ...(vitValue >= 0.5 ? [{ label: 'Vitality Health rewards', v: vitValue, parts: vitParts }] : []),
    ],
    cashBack: refunds,
    debitYear, medicalYear, vitalityYear, refunds, vitValue,
    /* false when nothing splits Vitality's premium out of the debit (no
       medical aid amount typed and no priced plan): vitalityYear is then 0
       because it is unknown, not because Vitality is free */
    vitalityKnown: st.bill.vitalityMonthly !== null && st.bill.vitalityMonthly !== undefined,
    /* today's medical aid a month (typed, or the plan's price), else null */
    medicalMonthly: st.bill.medicalMonthly !== undefined ? st.bill.medicalMonthly : null,
    note: 'Claims paid back are cash. Vitality Health rewards are savings and Miles, not cash (the gym discount, HealthyFood, flights and exercise rewards).' + (debitYear && gapInDebit ? ' Gap cover is paid in the same debit order.' : ''),
    splitNote: splitNote(m, st),
    transactions: [...rows('product.medical').map(r => ({ ...r, note: gapMonthly ? `Includes gap cover R ${rand(gapMonthly)}` : '' })), ...rows('product.medicalBack')].concat(milesRows(ms, 'health')),
  };

  /* ── Gap cover ──────────────────────────────────────────────────── */
  const gapOwn = yrOf('product.gap');
  const claims = yrOf('product.gapClaim');
  const gap = {
    id: 'gap', name: 'Gap cover', short: 'Gap', icon: 'shield-check',
    figure: -(gapInDebit + gapOwn), figureLabel: 'What you pay',
    paid: gapInDebit + gapOwn, outLabel: 'Premium',
    back: claims >= 0.5 ? [{ label: 'Claims paid', v: claims }] : [], cashBack: claims,
    inDebit: gapInDebit, own: gapOwn, claims,
    note: gapInDebit ? `R ${rand(gapMonthly)} a month, paid as part of the Discovery Health debit order.` : '',
    transactions: [...rows('product.gapClaim'), ...rows('product.gap')],
  };

  /* ── Discovery Insure (cars and Vitality Drive) ─────────────────── */
  const insurePaid = yrOf('product.insure');
  const insureClaims = yrOf('product.insureClaim');
  const drive = lineOf('fuel.drive');
  const insureRows = rows('product.insure');
  const latestInsure = insureRows.length ? insureRows.slice().sort((a, b) => (a.date < b.date ? 1 : -1))[0] : null;
  const insure = {
    id: 'insure', name: 'Discovery Insure', short: 'Insure', icon: 'car',
    figure: -insurePaid, figureLabel: 'Cars and Vitality Drive',
    paid: insurePaid, outLabel: 'Premiums',
    back: [
      ...(drive && drive.annual >= 0.5 ? [{ label: drive.source === 'estimated' ? 'Drive fuel (estimate)' : 'Drive fuel', v: drive.annual }] : []),
      ...(insureClaims >= 0.5 ? [{ label: 'Claims paid', v: insureClaims }] : []),
    ],
    cashBack: insureClaims + (drive && drive.source === 'measured' ? drive.annual : 0),
    claims: insureClaims, drive, latestMonthly: latestInsure ? -latestInsure.amount : null,
    transactions: [...insureRows, ...rows('product.insureClaim'), ...rows('insure.driveCash')],
  };

  /* ── Discovery Life (through the payslip) ───────────────────────── */
  const lifeMonthly = num(life.monthly) ? Number(life.monthly) : 0;
  /* Miles Discovery Life paid (a quote reward, say), at the Mile value used */
  const lifeMiles = ms && ms.figures && ms.figures.life && st.milesStatement ? (ms.figures.life * st.mileValue * 12) / st.milesStatement.covered : 0;
  const lifePaid = lifeMonthly * 12 + yrOf('product.life');
  const lifeP = {
    id: 'life', name: 'Discovery Life', short: 'Life', icon: 'umbrella',
    figure: -lifePaid, figureLabel: lifeMonthly ? 'Your share, off your salary,' : 'What you pay',
    paid: lifePaid, outLabel: lifeMonthly ? 'Through your payslip' : 'Premiums', via: lifeMonthly > 0,
    back: lifeMiles >= 0.5 ? [{ label: 'Discovery Life rewards (Miles)', v: lifeMiles }] : [], cashBack: 0, cover: num(life.cover) ? Number(life.cover) : null, monthly: lifeMonthly,
    transactions: rows('product.life'),
  };

  const all = [bank, health, gap, insure, lifeP];
  for (const p of all) {
    p.backSum = p.back.reduce((s, b) => s + b.v, 0);
    p.net = p.backSum - p.paid;
    p.transactions.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }
  const has = id => !chosen || chosen[id] !== false;
  const products = all.filter(p => has(p.id));
  const paid = products.reduce((s, p) => s + p.paid, 0);
  const cash = products.reduce((s, p) => s + p.cashBack, 0);
  const value = products.reduce((s, p) => s + p.backSum, 0);

  const today = ymd(now || new Date());
  const dates = DATES.filter(d => has(d.product));
  if (has('bank') && st.downgrade && st.downgrade.watchEnds) dates.push({ date: st.downgrade.watchEnds, product: 'bank', text: `Your Apple Watch contract ends. After this, Discovery's cheaper ${st.downgrade.label} may suit you better than the full Suite. See the Bank tab.` });
  const ahead = dates.filter(d => d.date >= today).sort((a, b) => (a.date < b.date ? -1 : 1));

  return { products, all, totals: { paid, cash, value, cashNet: cash - paid, flowNet: value - paid }, dates: ahead };
}

/* The Health debit is split with today's figures; say so when earlier
   months were billed at other amounts (other rates, a member added), since
   medical versus Vitality is then approximate for those months. */
function splitNote(m, st) {
  const d = m.figures['product.medical'];
  if (!d || st.bill.vitalityMonthly === null) return '';
  const months = Object.keys(d.perMonth).sort();
  const latest = d.perMonth[months[months.length - 1]];
  const other = months.filter(ym => Math.abs(d.perMonth[ym] - latest) > 1);
  if (!other.length) return '';
  return `This split uses today's debit order. ${other.length} earlier month${other.length === 1 ? ' had' : 's had'} a different amount, so for ${other.length === 1 ? 'that month' : 'those months'} the split between medical aid and Vitality is a rough guide.`;
}

/* Miles statement rows for a product, one per month and kind, newest first:
   the bank's (Vitality Money, base Miles, gameboard) or Vitality Health's. */
const MILES_LABELS = {
  'money.healthyFood': 'Vitality Money · HealthyFood', 'money.healthyCare': 'Vitality Money · HealthyCare', 'money.fuel': 'Vitality Money · fuel',
  'money.partners': 'Vitality Money · partner shops', base: 'Base Miles · card spend', gameboard: 'Active Rewards gameboard', insure: 'Discovery Insure',
  'health.healthyFood': 'Vitality Health · HealthyFood', 'health.healthyCare': 'Vitality Health · HealthyCare', activeRewards: 'Vitality Active Rewards', 'health.other': 'Vitality Health · other',
};
function milesRows(ms, product) {
  if (!ms || !ms.perMonth) return [];
  const keys = Object.keys(MILES_LABELS).filter(k => (product === 'health' ? /^(health\.|activeRewards)/.test(k) : !/^(health\.|activeRewards)/.test(k)));
  const out = [];
  for (const k of keys) {
    for (const [ym, miles] of Object.entries(ms.perMonth[k] || {})) {
      if (Math.abs(miles) < 0.5) continue;
      out.push({ date: ym + '-28', month: ym, description: MILES_LABELS[k], miles, key: 'miles.' + k });
    }
  }
  return out;
}

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function rand(v) {
  const [i, d] = Math.abs(v).toFixed(2).split('.');
  const g = i.replace(/\B(?=(\d{3})+$)/g, ' ');
  return d === '00' ? g : g + ',' + d;
}

module.exports = { buildProducts, milesRows, DATES };
