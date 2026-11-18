'use strict';
/* Made-up offers for the example household and the preview harness. Every
   partner is invented ("… Sometown"); dates are set from `now`, so the
   groups always have something in them. This repo is public: never put a
   real offer, person or amount in here.

     sampleOfferNotes(now) → [{ path, fm }]   frontmatter as a note holds it
     sampleOffers(now)     → [offer]          the same, read by parseOffer */

const { parseOffer } = require('./offers');

const FOLDER = 'Money/Discovery offers';
const two = n => (n < 10 ? '0' : '') + n;
const day = (now, add) => {
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() + add));
  return `${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}-${two(d.getUTCDate())}`;
};

function sampleOfferNotes(now) {
  const n = now || new Date();
  const D = add => day(n, add);
  const o = (name, fm) => ({ path: `${FOLDER}/${name}.md`, fm: { discovery: 'offer', added: D(-3), source: 'Example newsletter', ...fm } });
  return [
    o('Double Miles discounts', {
      title: 'Double Miles discounts on sale day', benefit: 'Up to 30% off at Miles partners when you pay with Miles',
      area: 'bank', partner: ['Shoe Shop Sometown', 'Outdoor Sometown'], starts: D(9), ends: D(9),
      requires: ['vitality-money'], condition: 'Only on the day, at the listed partners', how: ['Pay with Discovery Miles at the till or in the app'],
    }),
    o('Coffee bundles', {
      title: 'Coffee bundles', benefit: '25% off 25 sleeves, 15% off 12', area: 'bank', partner: 'Coffee Sometown',
      starts: D(5), ends: D(11), requires: ['bank'], how: ['Pay with a Discovery Bank card'],
    }),
    o('Linen sale', {
      title: 'Linen sale', benefit: '30% off everything', area: 'bank', partner: 'Linen House Sometown',
      starts: D(-2), ends: D(2), requires: ['bank'], how: ['Pay with a Discovery Bank card'],
    }),
    o('Fuel back in Miles', {
      title: 'Fuel back in Miles', benefit: 'Up to 65% back in Miles at the fuel partners', area: 'insure',
      requires: ['credit-card', 'vitality-drive'], condition: 'R75 or more a fill-up; up to the monthly limit',
      how: ['Add a virtual credit card to the phone wallet', 'Pay at the fuel partners with it'],
    }),
    o('Gym in December', {
      title: 'Local gym fees in December', benefit: '75% off a local club, no national membership needed', area: 'vitality',
      starts: D(-5), ends: D(40), requires: ['vitality-health'],
    }),
    o('Parking back', {
      title: 'Parking fees back in Miles', benefit: 'Mall parking refunded in Miles', area: 'bank',
      starts: D(9), ends: D(60), requires: ['transaction-bundled | credit-card'], condition: 'Spend R250 or more in a store within four hours',
    }),
    o('Home loan rate', {
      title: 'Lower home loan rate for a year', benefit: 'Up to 1.65% off a new home loan rate', area: 'bank',
      ends: D(40), requires: ['new-home-loan'], condition: 'Only for a new purchase home loan',
    }),
    o('Contents cover fuel limit', {
      title: 'Higher fuel limit with home cover', benefit: 'Fuel rewards on a higher monthly spend', area: 'insure',
      requires: ['home-cover'],
    }),
    o('Flower day', {
      title: 'Flowers on sale day', benefit: 'Up to 40% off with a code', area: 'bank', partner: 'Flowers Sometown',
      ends: D(-6), requires: ['bank'],
    }),
  ];
}

const sampleOffers = now => sampleOfferNotes(now).map(n => parseOffer(n.fm, n.path)).filter(Boolean);

module.exports = { sampleOffers, sampleOfferNotes, SAMPLE_OFFERS_FOLDER: FOLDER };
