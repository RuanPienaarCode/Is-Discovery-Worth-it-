'use strict';
/* One verdict per product, worded for the sidebar and the Overview: is what
   you pay Discovery worth it next to the market? Pure — it reads the bank
   statement (model.js) and the market comparisons (compare.js) and decides
   nothing of its own beyond the wording.

     good     Discovery is ahead of everything priced ('Worth it'), or the
              difference is too small to call ('About the same')
     check    a published price elsewhere is cheaper, usually for less cover
              (for the bank: 'Could cost less elsewhere')
     over     a quote you typed beats Discovery ('Could cost less elsewhere')
     quote    nothing priced: the figure is the quote that would match
     none     not insured at all (home contents)
     unknown  'Not enough data': too few months of statements, or the
              answer turns on figures made into a year from one or two
              payments

   amount is per year, except for 'quote', where it is the monthly quote
   that matches Discovery. A difference under MATERIAL a year either way
   reads 'About the same': the estimates are not that precise. Every
   sentence that names a saving is conditional ("By these figures, …"). */

const { has, only } = require('./switch');
const { altConfirmed } = require('./rates');
const { money } = require('./format');

const MATERIAL = 600;

/* The Vitality lines each product's figures lean on (model.js line keys):
   leaving Discovery Health loses the Vitality Health rewards, leaving
   Discovery Insure loses the Vitality Drive fuel. */
const REWARD_KEYS = {
  health: ['healthyFood.health', 'healthyCare.health', 'travel.health', 'activeRewards', 'activeRewards.basic'],
  insure: ['fuel.drive'],
};

/* The best priced row of a comparison (rows come best first), skipping a
   row that misses something you need (likeForLike false). */
const bestPriced = cmp => (cmp && cmp.rows.find(r => r.gainIfSwitch !== null && r.likeForLike !== false)) || null;

/* 'less' (another option is cheaper by MATERIAL or more), 'even', or
   'good' (Discovery ahead by MATERIAL or more). gain: what switching would
   save a year. */
const sideOf = gain => (gain >= MATERIAL ? 'less' : gain <= -MATERIAL ? 'good' : 'even');

/* The model.js line labels for keys, read aloud. */
function labelsOf(st, keys) {
  const names = keys.map(k => (((st && st.lines) || []).find(l => l.key === k) || {}).label || k).map(s => s.charAt(0).toLowerCase() + s.slice(1));
  const uniq = names.filter((n, i) => names.indexOf(n) === i);
  return uniq.length <= 1 ? uniq.join('') : uniq.slice(0, -1).join(', ') + ' and ' + uniq[uniq.length - 1];
}

/* The extrapolated lines (st.confidence.extrapolated) among `keys`, with
   what they add a year: { keys, value }. */
function extrapolatedOf(st, keys) {
  const ex = (st && st.confidence && Array.isArray(st.confidence.extrapolated)) ? st.confidence.extrapolated : [];
  const flagged = (((st && st.lines) || []).filter(l => l && l.extrapolated === true)).map(l => l.key);
  const hit = keys.filter(k => ex.includes(k) || flagged.includes(k));
  const value = hit.reduce((s, k) => s + Math.max(0, ((((st && st.lines) || []).find(l => l.key === k)) || {}).annual || 0), 0);
  return { keys: hit, value };
}

const PRODUCT_WORDS = { health: 'Discovery Health debit orders', gap: 'gap cover payments', insure: 'Discovery Insure debit orders' };

const notEnough = (id, why) => ({ id, tone: 'unknown', word: 'Not enough data', amount: null, vs: null, why });
const restsOn = (st, keys) => `The answer turns on ${labelsOf(st, keys)}, worked out from one or two payments and made into a year, so it is not enough to go on.`;
const unconfirmedNote = name => ` ${name}'s price is not confirmed, so check it first.`;

function fromMarket(id, cmp, name, opts) {
  const o = opts || {};
  if (!cmp) return null;
  const best = bestPriced(cmp);
  if (!best) {
    const be = cmp.rows.map(r => r.breakEven).filter(v => v > 0);
    if (!be.length) return { id, tone: 'quote', word: 'Get quotes', amount: null, vs: null, why: o.noQuote || 'There are no prices to compare yet. Type a quote on the Inputs tab.' };
    return { id, tone: 'quote', word: 'Get quotes', amount: Math.min(...be), vs: null, why: o.noQuote || 'Other companies don\'t publish prices for this, so ask them for a quote.' };
  }
  const gain = best.gainIfSwitch;
  const unsure = best.unconfirmed && !best.quoted ? unconfirmedNote(name(best)) : '';
  const side = sideOf(gain);
  if (side === 'good') return { id, tone: 'good', word: 'Worth it', amount: -gain, vs: name(best), why: o.good || 'Nothing we could price elsewhere is cheaper.' };
  if (side === 'even') return { id, tone: 'good', word: 'About the same', amount: -gain, vs: name(best), why: `By these figures, ${name(best)} is within ${money(MATERIAL)} a year of what you pay now${o.evenAfter || ''}, too close to call.${o.evenTail || ''}${unsure}` };
  const by = `By these figures, ${best.quoted ? 'your ' + name(best) + ' quote' : name(best)} would cost about ${money(gain)} less a year.`;
  if (best.quoted) return { id, tone: 'over', word: 'Could cost less elsewhere', amount: gain, vs: name(best), why: `${by} Check that the cover is the same before you switch.` };
  return { id, tone: 'check', word: 'Could save', amount: gain, vs: name(best), why: `${by} ${o.check || 'The cheaper option usually covers less, so compare before you switch.'}${unsure}` };
}

/* The same comparison with `extra` a year less lost by switching (the
   extrapolated rewards left out): rivals that end those rewards gain it. */
function withoutRewards(cmp, extra, endsRewards) {
  if (!cmp || !(extra > 0)) return cmp;
  const rows = cmp.rows.map(r => (r.gainIfSwitch === null || !endsRewards(r) ? r : { ...r, gainIfSwitch: r.gainIfSwitch + extra }));
  rows.sort((a, b) => (a.gainIfSwitch === null) - (b.gainIfSwitch === null) || (b.gainIfSwitch || 0) - (a.gainIfSwitch || 0));
  return { ...cmp, rows };
}

/* st: the bank statement; cmp: { health, gap, insure, life, home } from
   compare.js (null where there is nothing to compare); products: the
   resolveProducts() map — a product set to false gets no verdict (leave it
   out for all). st.confidence (model.js: { months, thin, extrapolated,
   notes }) is optional. */
function buildVerdicts(st, cmp, products) {
  const c = only(cmp, products);
  const out = {};
  const conf = (st && st.confidence) || null;

  const alt = has(products, 'bank') && st && st.chosen;
  if (alt) {
    const gain = alt.gainIfSwitch;
    const unsure = altConfirmed(alt) ? '' : ` ${alt.name}'s figures are not confirmed, so check them before you decide.`;
    /* the bank's own lines that rest on one or two payments: without them
       Discovery is worth less (a value line) or costs less (a fee line) */
    const lines = (st.lines || []).filter(l => l.group === 'bank' || l.group === 'cost');
    const ex = extrapolatedOf(st, lines.map(l => l.key));
    const exCost = lines.filter(l => l.group === 'cost' && ex.keys.includes(l.key)).reduce((s, l) => s + Math.max(0, l.annual || 0), 0);
    const exValue = lines.filter(l => l.group === 'bank' && ex.keys.includes(l.key)).reduce((s, l) => s + Math.max(0, l.annual || 0), 0);
    const months = conf && Number.isFinite(conf.months) ? conf.months : null;
    if (conf && conf.thin) {
      out.bank = notEnough('bank', `${months !== null ? `Only ${months === 1 ? 'one month' : months + ' months'} of` : 'Too few months of'} Discovery Bank statements, so a year's figures would be guesses. Six months or more gives an answer.`);
    } else if (ex.keys.length && sideOf(gain) !== sideOf(gain + exValue - exCost)) {
      out.bank = notEnough('bank', restsOn(st, ex.keys));
    } else if (sideOf(gain) === 'less') {
      out.bank = { id: 'bank', tone: 'check', word: 'Could cost less elsewhere', amount: gain, vs: alt.name, why: `By these figures, ${alt.name} would cost about ${money(gain)} less a year.${unsure}` };
    } else if (sideOf(gain) === 'even') {
      out.bank = { id: 'bank', tone: 'good', word: 'About the same', amount: -gain, vs: alt.name, why: `By these figures, ${alt.name} is within ${money(MATERIAL)} a year of Discovery Bank, too close to call.${unsure}` };
    } else {
      /* "worth more than its fees" only when they are */
      const why = st.net >= 0
        ? 'Its rewards are worth more than its fees, and more than the other bank would give you.'
        : 'Its fees cost more than its rewards give back, but the other bank would leave you worse off.';
      out.bank = { id: 'bank', tone: 'good', word: 'Worth it', amount: -gain, vs: alt.name, why: why + unsure };
    }
  }

  const vit = c.health && c.health.vitalityNet;
  /* Nothing about what Vitality costs when its premium is unknown (not
     split out of the debit): it was counted as nothing, not as free. */
  const vitText = c.health && c.health.vitalityKnown !== false && Number.isFinite(vit) && Math.abs(vit) >= 0.5 ? (vit > 0 ? ' Vitality Health gives back more than it costs.' : ' Vitality Health costs more than it gives back.') : '';
  const healthOpts = {
    good: 'No other medical aid that covers what your family needs costs less, once you count the Vitality rewards you would lose.' + vitText,
    check: 'A cheaper plan covers what your family needs, but some of its limits are lower. Compare them before you switch.' + vitText,
    evenAfter: ', once you count the Vitality rewards you would lose',
    evenTail: vitText,
  };
  const healthName = r => r.scheme + ' ' + r.plan;
  out.health = fromMarket('health', c.health, healthName, healthOpts);
  /* the Vitality Health rewards a rival would end, where they rest on one
     or two payments: the verdict stands only if it holds without them */
  const exH = extrapolatedOf(st, REWARD_KEYS.health);
  if (out.health && exH.keys.length && out.health.word !== (fromMarket('health', withoutRewards(c.health, exH.value, r => !r.discovery), healthName, healthOpts) || {}).word) {
    out.health = notEnough('health', restsOn(st, exH.keys));
  }
  /* say what the best one could not confirm */
  const hb = bestPriced(c.health);
  if (out.health && hb && hb.unsure && hb.unsure.length && out.health.tone !== 'good' && out.health.tone !== 'unknown') {
    const label = id => ((c.health.needs || []).find(n => n.id === id) || { label: id }).label.toLowerCase();
    out.health.why += ` Check first: ${hb.unsure.map(label).join(', ')}.`;
  }

  /* The published gap prices are for an oldest member under 45: older, or
     not said, and only a typed quote is compared. */
  const gapAged = c.gap && c.gap.pricedForAge === false;
  out.gap = fromMarket('gap', c.gap, r => r.provider + ' ' + r.plan, {
    check: 'Cheaper gap cover exists, but it usually pays out less on a big medical bill. Compare the cover before you switch.',
    noQuote: gapAged ? 'Rival prices shown are for under 45s. Ask them for a quote for your family\'s ages.' : undefined,
  });

  const insureOpts = {
    noQuote: 'Car insurance is priced per person, so ask for a quote for the same cars and cover. It also has to make up for the Vitality Drive fuel rewards you would lose.',
  };
  out.insure = fromMarket('insure', c.insure, r => r.name, insureOpts);
  const exI = extrapolatedOf(st, REWARD_KEYS.insure);
  if (out.insure && out.insure.tone !== 'quote' && exI.keys.length && out.insure.word !== (fromMarket('insure', withoutRewards(c.insure, exI.value, () => true), r => r.name, insureOpts) || {}).word) {
    out.insure = notEnough('insure', restsOn(st, exI.keys));
  }

  /* A premium seen over fewer than six months says too little about a
     year (confidence.productMonths, model.js). Gap cover paid inside the
     Discovery Health debit has no debits of its own: it goes by Health's.
     Life cover is compared on the share you typed, not on debits, so it is
     left alone. */
  const pm = conf && conf.productMonths;
  if (pm) {
    const monthsOf = id => (id === 'gap' && !(pm.gap > 0) ? pm.health : pm[id]);
    for (const id of ['health', 'gap', 'insure']) {
      const n = monthsOf(id);
      if (!out[id] || !Number.isFinite(n) || n >= 6) continue;
      out[id] = notEnough(id, `Only ${n === 1 ? 'one month' : n + ' months'} of ${PRODUCT_WORDS[id]} on your statements, so a year's figures would be guesses. Six months or more gives an answer.`);
    }
  }

  if (c.life) {
    const l = c.life;
    out.life = fromMarket('life', l, r => r.name, {
      good: 'None of your quotes for the same cover is cheaper than your share.',
      noQuote: 'Your employer pays part of this cover. A policy of your own would have to cost less than your share.',
    });
    /* No quote yet, but life cover alone already costs a good part of your
       share: with severe illness and income cover on top, an individual
       policy is unlikely to come in under it. */
    if (out.life.tone === 'quote' && l.lifeOnly && l.lifeOnly.low >= l.current.monthly * 0.25) {
      out.life = { id: 'life', tone: 'good', word: 'Likely worth it', amount: null, vs: null, why: 'On a policy of your own, life cover alone would already cost a big part of what you pay now, and yours also covers severe illness and income. A quote would settle it.' };
    }
  }

  if (c.home) {
    const h = c.home;
    if (!(h.current && h.current.monthly > 0)) {
      const priced = h.rows.filter(r => r.monthly !== null);
      const cheapest = priced.length ? Math.min(...priced.map(r => r.monthly)) : null;
      out.home = { id: 'home', tone: 'none', word: 'Not insured', amount: cheapest !== null ? -cheapest * 12 : null, vs: null, why: cheapest !== null ? 'Your household contents are not insured.' : 'Your household contents are not insured. Type what they are worth on the Inputs tab to see what cover would cost.' };
    } else {
      out.home = fromMarket('home', h, r => r.name);
    }
  }

  /* a product left out has no verdict at all, not an empty one */
  for (const id of ['bank', 'health', 'gap', 'insure', 'life']) if (!has(products, id)) delete out[id];
  return out;
}

module.exports = { buildVerdicts, MATERIAL };
