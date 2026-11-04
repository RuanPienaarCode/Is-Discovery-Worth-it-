'use strict';
/* The not-affiliated notice and the not-advice words, in one place: the
   welcome screen, the footer on every tab, the onboarding end screen and
   the summary note all read them from here (tests/no-advice.test.cjs
   checks each one). Pure: no DOM, so node tests and the summary note can
   use it.

   The plugin shows calculations from your own statements and published
   prices. It never tells you to buy, change, replace or end a financial
   product (the FAIS Act's "advice"); where cover differs it says who can
   tell you what each one covers. */

const { dayLabel } = require('./format');
const { MARKET } = require('./market');

const NOTICE_LINE = 'Not affiliated with or endorsed by Discovery. A calculator, not financial advice.';
/* beside a cheaper option: cover is never quite the same */
const ADVISER = 'The provider or a licensed financial adviser can tell you what each one covers.';

function noticeMore(asOf) {
  return [
    'Discovery, Discovery Bank, Discovery Health, Discovery Insure, Discovery Life, Vitality and Discovery Miles are brands of Discovery Limited. This plugin is not made, approved or sponsored by it.',
    `Every figure is an estimate worked out from your statements and from published prices as at ${dayLabel(asOf || MARKET.asOf)}.`,
    'It shows calculations, not recommendations. What changing, replacing or ending a product would mean for your cover is for the provider or a licensed financial adviser to tell you.',
  ];
}

module.exports = { NOTICE_LINE, ADVISER, noticeMore };
