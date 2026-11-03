'use strict';
/* One verdict per product, worded for the sidebar and the Overview: is what
   you pay Discovery worth it next to the market? Pure — it reads the bank
   statement (model.js) and the market comparisons (compare.js) and decides
   nothing of its own beyond the wording.

     good    Discovery is ahead of everything priced
     check   a published price elsewhere is cheaper, usually for less cover
     over    a quote you typed beats Discovery
     quote   nothing priced: the figure is the quote that would match
     none    not insured at all (home contents)

   amount is per year, except for 'quote', where it is the monthly quote
   that matches Discovery. A gain under MATERIAL a year is not worth the
   switch, so it reads as good. */

const { has, only } = require('./switch');

const MATERIAL = 600;

/* The best priced row of a comparison (rows come best first), skipping a
   row that misses something you need (likeForLike false). */
const bestPriced = cmp => (cmp && cmp.rows.find(r => r.gainIfSwitch !== null && r.likeForLike !== false)) || null;

function fromMarket(id, cmp, name, opts) {
  const o = opts || {};
  if (!cmp) return null;
  const best = bestPriced(cmp);
  if (!best) {
    const be = cmp.rows.map(r => r.breakEven).filter(v => v > 0);
    if (!be.length) return { id, tone: 'quote', word: 'Get quotes', amount: null, vs: null, why: o.noQuote || 'There are no prices to compare yet. Type a quote on the Inputs tab.' };
    return { id, tone: 'quote', word: 'Get quotes', amount: Math.min(...be), vs: null, why: o.noQuote || 'Other companies don\'t publish prices for this, so ask them for a quote.' };
  }
  if (best.gainIfSwitch < MATERIAL) return { id, tone: 'good', word: 'Worth it', amount: -best.gainIfSwitch, vs: name(best), why: o.good || 'Nothing we could price elsewhere is cheaper.' };
  if (best.quoted) return { id, tone: 'over', word: 'Overpaying', amount: best.gainIfSwitch, vs: name(best), why: 'Check that the cover is the same before you switch.' };
  return { id, tone: 'check', word: 'Could save', amount: best.gainIfSwitch, vs: name(best), why: o.check || 'The cheaper option usually covers less, so compare before you switch.' };
}

/* st: the bank statement; cmp: { health, gap, insure, life, home } from
   compare.js (null where there is nothing to compare); products: the
   resolveProducts() map — a product set to false gets no verdict (leave it
   out for all). */
function buildVerdicts(st, cmp, products) {
  const c = only(cmp, products);
  const out = {};

  const alt = has(products, 'bank') && st && st.chosen;
  if (alt) {
    /* "worth more than its fees" only when they are */
    const stayWhy = st.net >= 0
      ? 'Its rewards are worth more than its fees, and more than the other bank would give you.'
      : 'Its fees cost more than its rewards give back, but the other bank would leave you worse off.';
    out.bank = st.verdict === 'stay'
      ? { id: 'bank', tone: 'good', word: 'Worth it', amount: -alt.gainIfSwitch, vs: alt.name, why: stayWhy }
      : { id: 'bank', tone: 'over', word: 'Overpaying', amount: alt.gainIfSwitch, vs: alt.name, why: 'Its rewards are not worth enough to make up the difference.' };
  }

  const vit = c.health && c.health.vitalityNet;
  /* Nothing about what Vitality costs when its premium is unknown (not
     split out of the debit): it was counted as nothing, not as free. */
  const vitText = c.health && c.health.vitalityKnown !== false && Number.isFinite(vit) && Math.abs(vit) >= 0.5 ? (vit > 0 ? ' Vitality Health gives back more than it costs.' : ' Vitality Health costs more than it gives back.') : '';
  out.health = fromMarket('health', c.health, r => r.scheme + ' ' + r.plan, {
    good: 'No other medical aid that covers what your family needs costs less, once you count the Vitality rewards you would lose.' + vitText,
    check: 'A cheaper plan covers what your family needs, but some of its limits are lower. Compare them before you switch.' + vitText,
  });
  /* say what the best one could not confirm */
  const hb = bestPriced(c.health);
  if (out.health && hb && hb.unsure && hb.unsure.length && out.health.tone !== 'good') {
    const label = id => ((c.health.needs || []).find(n => n.id === id) || { label: id }).label.toLowerCase();
    out.health.why += ` Check first: ${hb.unsure.map(label).join(', ')}.`;
  }

  out.gap = fromMarket('gap', c.gap, r => r.provider + ' ' + r.plan, {
    check: 'Cheaper gap cover exists, but it usually pays out less on a big medical bill. Compare the cover before you switch.',
  });

  out.insure = fromMarket('insure', c.insure, r => r.name, {
    noQuote: 'Car insurance is priced per person, so ask for a quote for the same cars and cover. It also has to make up for the Vitality Drive fuel rewards you would lose.',
  });

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
