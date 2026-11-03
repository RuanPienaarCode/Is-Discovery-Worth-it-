'use strict';
/* Stay with Discovery, or move everything away from it: one row per cost
   and per benefit, what it is now and what it would be after the move.
   Pure — it only reads the bank statement (model.js) and the market
   comparisons (compare.js), so it runs in node for the tests.

   "Away" means away: a cheaper Discovery plan or a Discovery quote is not
   a switch. Leaving Discovery Health ends Vitality Health and Discovery Gap
   Cover; leaving Insure and the bank ends the Vitality Drive fuel rewards.
   A product nobody has priced (car and life cover until you type a quote)
   is assumed to cost the same after the move, and is named in `assumed`,
   so it can never tip the total by itself.

   All amounts are per year and positive; `kind` says which way they count.
     buildSwitch(st, { health, gap, insure, life }, products?, opts?)
       → { rows: [{ key, label, kind, stay, go, goName, goNote, assumed,
                    assumedWhy }],
           groups: [{ id, label, stay, go, saving, assumed, rows }] — one per
             product, stay/go = what it really costs (paid − got back) and
             saving = stay − go (above 0: moving is cheaper),
           stay: { cost, benefit, net, real }, go: { … },
           gain: go.net − stay.net, assumed: [labels] }
   products: the resolveProducts() map ({ bank, health, gap, insure, life });
   a product set to false is left out entirely. Leave it out for all.
   opts: { now } — a Date or 'YYYY-MM-DD'. With it, a price table that is
   not for that day (market.js priceValidFor: other medical aids' prices
   after 1 January, say) is not compared; without it, every table is taken
   as current.

   assumedWhy (round 2) says why a row is taken as costing the same:
     'noQuote'  nothing priced for you yet (car, life, a family no plan prices)
     'age'      gap cover prices are for families under 45
     'unsplit'  the Discovery Health debit could not be split, so the medical
                aid's own price is not known (the Health verdict says "Get
                quotes" for the same reason)
     'stale'    the prices are out of date: your plan's price changed since
                the table (st.bill.priceStale), or the rivals' table is not
                for today (opts.now) */

const { money, pct } = require('./format');
const { priceValidFor } = require('./market');
const { altConfirmed } = require('./rates');
/* the chosen rival bank's figures are not confirmed (rates.js): say so wherever it is named */
const altUnsure = a => !!a && typeof altConfirmed === 'function' && !altConfirmed(a);
const unsureNote = a => `${a.name}'s figures are not confirmed, so check them first.`;

/* products[id] === false leaves that product out; no map = everything */
const has = (products, id) => !products || products[id] !== false;
const isDiscovery = r => !!r.discovery || /^discovery/i.test(r.id || '') || /^discovery\b/i.test(r.name || r.scheme || r.provider || '');
const priced = r => r.monthly !== null && r.monthly !== undefined && Number.isFinite(r.monthly);
/* the cheapest row by what it costs after its own rewards */
const cheapest = rows => rows.slice().sort((a, b) => (a.monthly * 12 - (a.rewards || 0)) - (b.monthly * 12 - (b.rewards || 0)))[0] || null;

/* Which rows make up each product. Vitality goes with the medical aid (it
   ends with it) and the Drive fuel rewards with the car (they end with
   Discovery Insure). */
/* What each rand that comes back actually is. Only cash is money in the
   account; the rest is worth something only when it is used. */
const KINDS = {
  cash: { label: 'Cash in your account', note: 'Real money paid into your account.' },
  funder: { label: 'Money for car costs only', note: 'Paid into the Insure Funder Account and doubled, but you can only use it for things like tyres, services, licences and excesses.' },
  points: { label: 'Points you spend like money', note: 'Discovery Miles, or another bank\'s points. They are only worth something when you spend them, for example on prepaid electricity or online shopping.' },
  discount: { label: 'Discounts on things you buy', note: 'You only save this when you buy the thing anyway, like the gym or flights.' },
  voucher: { label: 'Small treats', note: 'Things like a free coffee or smoothie for meeting your exercise goals.' },
  thing: { label: 'Not money', note: 'An Apple Watch you get for meeting your exercise goals: this is what you would otherwise pay for it.' },
};
const KIND_ORDER = Object.keys(KINDS);
const BANK_KIND = { 'interest.boost': 'cash', 'interest.cashback': 'cash', appleWatch: 'thing', 'travel.bank': 'discount' };
const VIT_KIND = { 'healthyFood.health': 'points', 'healthyCare.health': 'points', 'travel.health': 'discount', activeRewards: 'points', 'activeRewards.basic': 'voucher' };

/* st → { bank, vitality, drive }: the items behind each "gives back",
   [{ key, label, annual, kind, estimated }]. Miles-paid lines are points. */
function backItems(st) {
  const L = st.lines || [];
  const item = (l, kind) => ({ key: l.key, label: l.label, annual: l.annual, kind, estimated: l.source === 'estimated' });
  const bank = L.filter(l => l.group === 'bank' && Math.abs(l.annual) >= 0.5).map(l => item(l, BANK_KIND[l.key] || 'points'));
  const v = st.vitality || {};
  const vitality = [
    ...(v.gymSaving >= 0.5 ? [{ key: 'gym', label: 'Gym discount', annual: v.gymSaving, kind: 'discount', estimated: false }] : []),
    ...Object.keys(VIT_KIND).map(k => L.find(l => l.key === k)).filter(l => l && Math.abs(l.annual) >= 0.5).map(l => item(l, VIT_KIND[l.key])),
  ];
  const d = L.find(l => l.key === 'fuel.drive');
  /* Drive rewards paid as Miles (from 1 Nov 2026) are points; INSURECASH
     is cash; money paid into the Insure Funder Account is for car costs. */
  const driveKind = d && (d.funder ? 'funder' : d.source === 'statement' && !(d.cash >= 0.5) ? 'points' : 'cash');
  const drive = d && d.annual >= 0.5 ? [item(d, driveKind)] : [];
  return { bank, vitality, drive };
}

/* items → [{ kind, label, note, annual, items }] in KIND_ORDER, kinds present only */
function byKind(items) {
  return KIND_ORDER.map(kind => {
    const its = (items || []).filter(i => i.kind === kind);
    return its.length ? { kind, ...KINDS[kind], annual: its.reduce((t, i) => t + i.annual, 0), items: its } : null;
  }).filter(Boolean);
}

/* another bank's rewards, as one item of its own kind */
const altItems = a => (a.rewards >= 0.5 ? [{ key: 'alt.' + a.id, label: a.backPct ? `${pct(a.backPct)} back on ${a.debitOnly ? 'debit card' : 'card'} spend` : 'Rewards', annual: a.rewards, kind: a.rewardKind || 'cash', estimated: !!a.guess }] : []);
/* what another bank's flat rate pays on, in words: a credit card's rate is
   not paid on debit card spend (model.js altResult) */
const altRateWords = a => (a.cardOnlyLeftOut
  ? `${pct(a.publishedPct)} back on credit card spend only, so nothing on your debit card spend`
  : a.backPct ? `${pct(a.backPct)} back on ${a.debitOnly ? 'debit card' : 'card'} spend${a.guess ? ' (a guess)' : ''}` : 'No rewards');

/* the comparisons for the products kept; home is not a Discovery product,
   so it always stays */
const CMP_PRODUCT = { health: 'health', gap: 'gap', insure: 'insure', life: 'life' };
function only(cmp, products) {
  const c = Object.assign({}, cmp || {});
  for (const k of Object.keys(CMP_PRODUCT)) if (!has(products, CMP_PRODUCT[k])) c[k] = null;
  return c;
}

/* What an assumed row says, in plain words (the glossary's). */
const ASSUMED_NOTE = {
  noQuote: 'No quote yet, so we used today\'s price.',
  age: 'No fair comparison yet: rival prices are for people under 45.',
  unsplit: 'We could not tell how much of your Discovery Health debit order is the medical aid itself, so we used today\'s price. Pick your plan, or type its amount, on the Inputs tab.',
  stalePlan: 'Your plan\'s price has changed since the prices we have, so we used today\'s price. Type your medical aid amount on the Inputs tab.',
  stale: 'These prices are out of date, so we used today\'s price. Ask for a quote instead.',
};

/* The day as 'YYYY-MM-DD', or null when none was given. */
function dayOf(now) {
  if (!now) return null;
  if (typeof now === 'string') return now.slice(0, 10);
  if (!(now instanceof Date) || isNaN(now.getTime())) return null;
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/* cmp with the rows whose price table is not for opts.now marked stale
   (gainIfSwitch null, so nothing is claimed from them). A quote you typed
   is always current. Discovery's own plans follow the Discovery Health
   table; other medical aids and gap cover their own. */
function freshen(cmp, opts) {
  const day = dayOf(opts && opts.now);
  if (!day || !cmp) return cmp;
  const c = Object.assign({}, cmp);
  const mark = (x, tableOf) => {
    if (!x || !Array.isArray(x.rows)) return x;
    let any = false;
    const rows = x.rows.map(r => {
      if (r.quoted || priceValidFor(tableOf(r), day)) return r;
      any = true;
      return Object.assign({}, r, { stale: true, gainIfSwitch: null });
    });
    return any ? Object.assign({}, x, { rows, stale: rows.some(r => r.stale && !isDiscovery(r)) }) : x;
  };
  /* a row priced on its 2027 prices (compare.js priceAt) follows the 2027 table */
  c.health = mark(cmp.health, r => (isDiscovery(r) ? 'discoveryHealth' : r.priceYear === 2027 ? 'schemes2027' : 'schemes'));
  c.gap = mark(cmp.gap, r => (isDiscovery(r) ? 'discoveryGap' : r.priceYear === 2027 ? 'gap2027' : 'gap'));
  return c;
}

/* Whether the medical aid can be compared at all, and if not why:
   { ok, why: 'unsplit'|'stale'|null, note }. */
function medicalState(st, health) {
  if (!health) return { ok: false, why: null, note: '' };
  /* a stale plan price is the reason the debit was not split, so it comes first */
  if (st && st.bill && st.bill.priceStale) return { ok: false, why: 'stale', note: ASSUMED_NOTE.stalePlan };
  if (health.vitalityKnown === false) return { ok: false, why: 'unsplit', note: ASSUMED_NOTE.unsplit };
  return { ok: true, why: null, note: '' };
}

const GROUPS = [
  { id: 'bank', label: 'Bank', keys: ['bank', 'bank.rewards'] },
  { id: 'medical', label: 'Medical aid', keys: ['medical', 'vitality', 'vitality.rewards'] },
  { id: 'car', label: 'Car insurance', keys: ['car', 'car.rewards', 'drive'] },
  { id: 'gap', label: 'Gap cover', keys: ['gap'] },
  { id: 'life', label: 'Life cover', keys: ['life', 'life.rewards'] },
];

function buildSwitch(st, cmp, products, opts) {
  const c = freshen(only(cmp, products), opts);
  const bankOn = has(products, 'bank');
  const rows = [];
  const add = (key, label, kind, stay, go, extra) => rows.push(Object.assign({ key, label, kind, stay, go, goName: '', goNote: '', assumed: false, assumedWhy: null }, extra || {}));
  const rewardsAfter = [];
  const BI = backItems(st);

  /* a quote-only product: your cheapest quote outside Discovery, else the same as now */
  const quoted = (key, label, cm) => {
    if (!cm) return;
    const best = cheapest(cm.rows.filter(r => r.quoted && priced(r) && !isDiscovery(r)));
    if (best) {
      if ((best.rewards || 0) >= 0.5) rewardsAfter.push([key + '.rewards', `${best.name}'s rewards`, best.rewards, best.name, [{ key: key + '.rewards', label: `${best.name}'s cash back for claim-free years`, annual: best.rewards, kind: 'cash', estimated: false }]]);
      return add(key, label, 'cost', cm.current.annual, best.monthly * 12, { goName: best.name, goNote: 'Your quote' });
    }
    const be = cm.rows.filter(r => !isDiscovery(r)).map(r => r.breakEven).filter(v => v > 0);
    add(key, label, 'cost', cm.current.annual, cm.current.annual, {
      assumed: true, assumedWhy: 'noQuote',
      goNote: ASSUMED_NOTE.noQuote + (be.length ? ` Switching pays if their quote is under ${money(Math.min(...be))} a month.` : ''),
    });
  };

  // ── what you pay ──
  const alt = bankOn ? st.chosen : null;
  if (alt) add('bank', 'Bank fees', 'cost', st.cost, alt.fees, { goName: alt.name, unconfirmed: altUnsure(alt), goNote: altUnsure(alt) ? unsureNote(alt) : '' });
  if (c.health) {
    /* The medical aid is only compared when its own price is known (the
       debit split out, at a price that still holds) and the rivals' prices
       are current; otherwise moving is taken as costing the same, as the
       Health verdict's "Get quotes" says. */
    const ms = medicalState(st, c.health);
    const best = ms.ok ? cheapest(c.health.rows.filter(r => priced(r) && !r.stale && r.likeForLike !== false && !isDiscovery(r))) : null;
    const staleRivals = ms.ok && !best && c.health.rows.some(r => r.stale && !isDiscovery(r));
    if (best) add('medical', 'Medical aid', 'cost', c.health.current.annual, best.monthly * 12, { goName: `${best.scheme} ${best.plan}`, goNote: 'The cheapest plan that covers what you ticked' });
    else {
      const why = ms.why || (staleRivals ? 'stale' : 'noQuote');
      add('medical', 'Medical aid', 'cost', c.health.current.annual, c.health.current.annual, { assumed: true, assumedWhy: why, goNote: ms.note || (staleRivals ? ASSUMED_NOTE.stale : 'No other plan is priced for your family yet, so we used today\'s price.') });
    }
  }
  /* a product whose payments stopped (st.confidence.ended) has no rewards
     left to lose either */
  const ended = id => !!(st && st.confidence && st.confidence.ended && st.confidence.ended[id]);
  const vit = has(products, 'health') && !ended('health') ? st.vitality || {} : {};
  if (vit.premium !== null && vit.premium > 0) add('vitality', 'Vitality Health fee', 'cost', vit.premium, 0, { goNote: 'Ends when you leave Discovery Health' });
  if (c.gap) {
    /* an under-45 price for an older (or unknown-age) family is no saving */
    const best = cheapest(c.gap.rows.filter(r => priced(r) && !r.stale && !isDiscovery(r) && (!r.ageLimited || r.quoted)));
    const aged = c.gap.rows.some(r => r.ageLimited && !isDiscovery(r));
    const why = aged ? 'age' : c.gap.rows.some(r => r.stale && !isDiscovery(r)) ? 'stale' : 'noQuote';
    if (best) add('gap', 'Gap cover', 'cost', c.gap.current.annual, best.monthly * 12, { goName: `${best.provider} ${best.plan}`, goNote: 'Discovery Gap Cover ends with Discovery Health' });
    else add('gap', 'Gap cover', 'cost', c.gap.current.annual, c.gap.current.annual, { assumed: true, assumedWhy: why, goNote: ASSUMED_NOTE[why] });
  }
  quoted('car', 'Car insurance', c.insure);
  quoted('life', 'Life cover', c.life);

  // ── what you get back ──
  if (alt) add('bank.rewards', 'Bank rewards (Miles, discounts, interest)', 'benefit', st.value, alt.rewards, { goName: alt.name, unconfirmed: altUnsure(alt), goNote: altUnsure(alt) ? unsureNote(alt) : '', stayItems: BI.bank, goItems: altItems(alt) });
  if (vit.value >= 0.5) add('vitality.rewards', 'Vitality Health rewards (gym, HealthyFood, flights)', 'benefit', vit.value, 0, { goNote: 'Ends when you leave Discovery Health', stayItems: BI.vitality, goItems: [] });
  const drive = has(products, 'insure') && !ended('insure') ? (st.lines || []).find(l => l.key === 'fuel.drive') : null;
  if (drive && drive.annual >= 0.5) add('drive', 'Vitality Drive fuel rewards', 'benefit', drive.annual, 0, { goNote: 'Ends when you leave Discovery Insure and the bank', stayItems: BI.drive, goItems: [] });
  for (const [key, label, v, name, items] of rewardsAfter) add(key, label, 'benefit', 0, v, { goName: name, stayItems: [], goItems: items });

  const side = k => {
    const cost = rows.filter(r => r.kind === 'cost').reduce((t, r) => t + r[k], 0);
    const benefit = rows.filter(r => r.kind === 'benefit').reduce((t, r) => t + r[k], 0);
    return { cost, benefit, net: benefit - cost, real: cost - benefit };
  };
  const stay = side('stay'), go = side('go');
  /* one line per product: its costs less what it gives back, on each side */
  const groups = GROUPS.map(g => {
    const rs = rows.filter(r => g.keys.includes(r.key));
    if (!rs.length) return null;
    const real = k => rs.reduce((t, r) => t + (r.kind === 'cost' ? r[k] : -r[k]), 0);
    const st = real('stay'), gt = real('go');
    return { id: g.id, label: g.label, stay: st, go: gt, saving: st - gt, assumed: rs.some(r => r.assumed), rows: rs };
  }).filter(Boolean);
  return { rows, groups, stay, go, gain: go.net - stay.net, assumed: rows.filter(r => r.assumed).map(r => r.label) };
}

/* The top competitors for each product, next to what Discovery costs you,
   so "compared to what" always has an answer.
     buildRivals(st, { health, gap, insure, life }, products?)
       → [{ id, label, discovery: { name, pay, back, real, backNote },
            rivals: [{ name, pay, back, real, what, misses, quoteUnder, quoted }] }]
   Per year. A rival nobody has priced has pay/real null and quoteUnder,
   the monthly quote at which it would beat Discovery. Up to five per
   product, never Discovery's own: plans that cover what you need first,
   then the rest, then the unpriced; cheapest first within each. */
const TOP = 5;
function topFive(rows) {
  const rank = r => (r.pay === null ? 2 : r.misses.length ? 1 : 0);
  return rows.map((r, i) => ({ r, i }))
    .sort((a, b) => rank(a.r) - rank(b.r) || (a.r.real === null ? 0 : a.r.real - b.r.real) || a.i - b.i)
    .map(x => x.r).slice(0, TOP);
}
const rival = (name, pay, back, what, extra) => Object.assign({ name, pay, back, real: pay === null ? null : pay - back, what: what || '', misses: [], quoteUnder: null, quoted: false, items: [] }, extra || {});

function buildRivals(st, cmp, products, opts) {
  const c = freshen(only(cmp, products), opts);
  const out = [];
  /* gap: how much more (above 0) or less a rival costs than Discovery after
     rewards, null when it is not priced or cannot fairly be set against
     Discovery (comparable false, with assumedWhy). A section whose
     Discovery side is not known (the medical aid when the debit could not
     be split, or its price is stale) is comparable: false as a whole. */
  const section = (id, label, discovery, rivals, extra) => {
    if (!rivals.length) return;
    const x = extra || {};
    const d = { ...discovery, real: discovery.pay - discovery.back };
    const ok = x.comparable !== false;
    const list = topFive(rivals).map(r => {
      const fair = ok && r.comparable !== false && r.pay !== null;
      const why = !ok ? x.assumedWhy || null : r.assumedWhy || (r.pay === null ? 'noQuote' : null);
      return { ...r, comparable: ok && r.comparable !== false, assumedWhy: why, gap: fair ? r.real - d.real : null };
    });
    out.push({ id, label, discovery: d, rivals: list, comparable: ok, assumedWhy: ok ? null : x.assumedWhy || null, note: ok ? '' : x.note || '' });
  };
  const vit = st.vitality || {};
  const BI = backItems(st);

  if (has(products, 'bank')) section('bank', 'Banks', { name: 'Discovery Bank', pay: st.cost, back: st.value, backNote: 'Miles, discounts, the Apple Watch and interest', items: BI.bank },
    (st.alternatives || []).map(a => rival(a.name, a.fees, a.rewards,
      [altRateWords(a), ...(a.partners || []).map(p => (p.known ? `${pct(p.pct)} back: ${p.label}` : 'shop deals (rate not published)')).filter((x, i, xs) => xs.indexOf(x) === i)].join(' + '), { items: altItems(a), unconfirmed: altUnsure(a), unconfirmedNote: altUnsure(a) ? unsureNote(a) : '' })));

  if (c.health) {
    const ms = medicalState(st, c.health);
    section('medical', 'Medical aids',
      { name: c.health.own ? `Discovery ${c.health.own.plan}` : 'Discovery Health', pay: c.health.current.annual + (vit.premium || 0), back: vit.value || 0, backNote: 'Vitality rewards: gym, HealthyFood, flights', items: BI.vitality },
      c.health.rows.filter(r => !isDiscovery(r)).map(r => rival(`${r.scheme} ${r.plan}`, priced(r) ? r.monthly * 12 : null, 0,
        [r.dayToDay, r.network].filter(Boolean).join(' · '), { misses: r.misses || [], quoted: !!r.quoted, ...(r.stale ? { comparable: false, assumedWhy: 'stale' } : {}) })),
      ms.ok ? {} : { comparable: false, assumedWhy: ms.why, note: ms.note });
  }

  if (c.gap) section('gap', 'Gap cover', { name: 'Discovery Gap Cover', pay: c.gap.current.annual, back: 0, backNote: '' },
    c.gap.rows.filter(r => !isDiscovery(r)).map(r => rival(`${r.provider} ${r.plan}`, priced(r) ? r.monthly * 12 : null, 0, r.cover, {
      quoted: !!r.quoted,
      ...(r.ageLimited ? { comparable: false, assumedWhy: 'age' } : r.stale ? { comparable: false, assumedWhy: 'stale' } : {}),
    })));

  const drive = has(products, 'insure') ? (st.lines || []).find(l => l.key === 'fuel.drive') : null;
  const quoteOnly = r => (r.quoted && priced(r)
    ? rival(r.name, r.monthly * 12, r.rewards || 0, r.rewardNote, { quoted: true, items: (r.rewards || 0) >= 0.5 ? [{ key: r.id + '.rewards', label: 'Cash back for claim-free years', annual: r.rewards, kind: 'cash', estimated: false }] : [] })
    : rival(r.name, null, 0, r.rewardNote || 'Quote only', { quoteUnder: r.breakEven > 0 ? r.breakEven : null }));
  if (c.insure) section('car', 'Car insurance', { name: 'Discovery Insure', pay: c.insure.current.annual, back: drive && drive.annual > 0 ? drive.annual : 0, backNote: 'Vitality Drive fuel rewards', items: BI.drive },
    c.insure.rows.filter(r => !isDiscovery(r)).map(quoteOnly));
  if (c.life) section('life', 'Life cover', { name: 'Discovery Life, through your employer', pay: c.life.current.annual, back: 0, backNote: '' },
    c.life.rows.filter(r => !isDiscovery(r)).map(quoteOnly));
  return out;
}

module.exports = { buildSwitch, buildRivals, backItems, byKind, KINDS, has, only, freshen, medicalState, ASSUMED_NOTE };
