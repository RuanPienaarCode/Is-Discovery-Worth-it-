'use strict';
/* constants.RULES and SHOP_TAGS against descriptions as South African banks
   write them: a bare descriptor, and the same one behind each bank's
   transaction verb ("DEBIT ORDER", "ACB DEBIT:EXTERNAL", "POS PURCHASE",
   "Card Purchase:", Capitec's "(Pending)"). Every rule has cases that must
   match and near misses that must not. Made-up merchants and references
   only. */
const assert = require('node:assert');
const { RULES, SHOP_TAGS, VERB_PREFIX } = require('../src/constants');
const { ruleOf, tagOf } = require('../src/detect');
const { measure } = require('../src/measure');

/* The verbs each bank style puts in front. */
const DEBIT_ORDER = [
  '',                        // bare
  'DEBIT ORDER ',            // Nedbank, Standard Bank
  'Debit Order: ',           // Capitec
  'ACB DEBIT:EXTERNAL ',     // Absa
  'Magtape Debit ',          // FNB
  'DebiCheck ',              // any bank, authenticated collection
  'EXTERNAL DEBIT ORDER ',
];
const CARD = [
  '',
  'POS Purchase ',           // FNB
  'Card Purchase: ',         // Capitec
  '(Pending) Card Purchase: ', // Capitec, not settled yet
  'POS PURCHASE ',           // Absa
  'CARD PURCHASE ',          // Nedbank
  'PURCHASE ',               // Standard Bank
  'Recurring Card Purchase: ',
];
const CREDIT = ['', 'ACB CREDIT:EXTERNAL ', 'Magtape Credit ', 'EFT CREDIT ', 'CREDIT '];

const DISC = true, OTHER = false;
const keyOf = (description, amount, discovery, category) =>
  (ruleOf({ date: '2026-10-01', description, amount, category: category || '', account: 'A' }, { discovery }) || {}).key || null;
const tagKey = d => (tagOf(d) || {}).key || null;

/* [key, description, amount, discovery account?, category] — must match */
const yes = [];
/* [expected key or null, description, amount, discovery account?, category] — must not be the rule's */
const no = [];
const every = (prefixes, key, bodies, amount, disc) => { for (const p of prefixes) for (const b of bodies) yes.push([key, p + b, amount, disc]); };

// ── Discovery Bank's own lines (on a Discovery account only) ─────────────
yes.push(['fee.account', 'MONTHLY ACCOUNT FEE', -115, DISC]);
no.push([null, 'MONTHLY ACCOUNT FEE', -115, OTHER]);
yes.push(['fee.facility', 'Monthly facility fee', -69, DISC]);
no.push([null, 'Monthly facility fee', -69, OTHER]);
yes.push(['fee.vitalityMoney', 'Vitality Money Premium', -66, DISC]);
no.push([null, 'Vitality Money Premium', -66, OTHER]);
// other wordings of the same premium (rt3/s3)
yes.push(['fee.vitalityMoney', 'VITALITY MONEY FEE', -101, DISC], ['fee.vitalityMoney', 'VM FEE', -101, DISC], ['fee.vitalityMoney', 'Vitality Money monthly premium', -101, DISC], ['fee.vitalityMoney', 'VM PREMIUM', -101, DISC]);
no.push([null, 'VITALITY MONEY FEE', -101, OTHER], [null, 'VM FEESTIVAL TICKETS', -300, DISC], [null, 'VITALITY MONEY GOAL MET', 0.5, DISC]);
yes.push(['fee.fx', 'INTL PAYMENT FEE', -12, DISC], ['fee.fx', 'Forex fee', -5, DISC]);
no.push([null, 'INTL PAYMENT FEE', -12, OTHER]);
yes.push(['interest.boost', 'Dynamic interest boost', 40, DISC]);
no.push([null, 'Dynamic interest boost', 40, OTHER]);
yes.push(['interest.cashback', 'Dynamic interest cashback', 30, DISC]);
no.push([null, 'Dynamic interest cashback', 30, OTHER]);
yes.push(['interest.earned', 'Interest earned', 12, DISC]);
no.push([null, 'Interest earned', 12, OTHER]);
yes.push(['interest.charged', 'Interest charged', -90, DISC]);
no.push([null, 'Interest charged', -90, OTHER]);
yes.push(['benefit.appleWatch', 'Apple Watch instalment', -250, DISC]);
no.push([null, 'Apple Watch instalment', -250, OTHER]);
yes.push(['fee.penalty', 'RETURNED DEBIT ORDER FEE', -100, DISC], ['fee.penalty', 'PENALTY FEE', -100, DISC]);
no.push([null, 'PENALTY FEE SARS', -100, OTHER], [null, 'PENALTY FEE REVERSAL', 100, DISC]);
yes.push(['fee.other', 'SOMETOWN CASH DEPOSIT FEE', -20, DISC, 'Bank charges & fees']);
no.push([null, 'SOMETOWN CASH DEPOSIT FEE', -20, OTHER, 'Bank charges & fees'], [null, 'SOMETOWN CASH DEPOSIT FEE', 20, DISC, 'Bank charges & fees']);

// ── Discovery Health ───────────────────────────────────────────────────
every(DEBIT_ORDER, 'product.medical', ['DISC PREM 000111', 'DISCOVERY HEALTH 000111', 'DISC HEALTH 000111'], -3000, OTHER);
yes.push(['product.medical', 'DISC PREM 000111', -3000, DISC]);
no.push(
  [null, 'DIS-CHEM SOMETOWN', -300, OTHER],
  [null, 'DISCOVERY HEALTHY KITCHEN', -300, OTHER],     // not the scheme
  [null, 'SOMETOWN DISC PREM REFUND SHOP', -300, OTHER], // not at the start
  [null, 'PAYMENT TO SAM DISC PREM', -300, OTHER],
  ['product.medicalBack', 'DISC PREM 000111', 3000, OTHER], // a credit is never a premium
);
every(CREDIT, 'product.medicalBack', ['DISC MEMB 000111', 'DISC PREM 000111', 'DISCOVERY HEALTH REFUND'], 450, OTHER);
no.push([null, 'SOMETOWN DISC MEMB', 450, OTHER]);

// ── Discovery Insure ───────────────────────────────────────────────────
every(DEBIT_ORDER, 'product.insure', ['DISCINSURE 000222', 'DISC INSURE 000222', 'DISCOVERY INSURE 000222', 'DISCINSURE000 -111'], -1500, OTHER);
no.push(
  [null, 'SOMETOWN INSURE 000222', -1500, OTHER],
  [null, 'DISCO INSURE BROKERS', -1500, OTHER],
  ['product.insureClaim', 'DISCINSURE CLAIM 77', 8000, OTHER],     // a claim is never a premium paid backwards
  ['product.insureClaim', 'DISCINSURE 000222', 1500, OTHER],       // nor is a refund
);
every(CREDIT, 'insure.driveCash', ['INSURECASH 123', 'DISCINSURE CASH TO PLANHOLDER'], 350, OTHER);
no.push([null, 'INSURECASH 123', -350, OTHER], [null, 'DISCINSURE CASH TO PLANHOLDER', -350, OTHER]);
every(CREDIT, 'product.insureClaim', ['DISCINSURE CLAIM 77', 'INSURECLAIM 77', 'DISCOVERY INSURE CLAIM PAYMENT'], 8000, OTHER);
no.push([null, 'SOMETOWN MUTUAL CLAIM 77', 8000, OTHER], [null, 'INSURECLAIM 77', -8000, OTHER]);

// ── Discovery Life ─────────────────────────────────────────────────────
every(DEBIT_ORDER, 'product.life', ['DISC LIFE 3456', 'DISCOVERY LIFE 3456', 'DISCLIFE 3456'], -640, OTHER);
no.push([null, 'DISC LIFESTYLE CENTRE', -640, OTHER], [null, 'DISC LIFE PAYBACK', 640, OTHER]);

// ── Discovery Gap Cover ────────────────────────────────────────────────
every(DEBIT_ORDER, 'product.gap', ['INSGAP 5678'], -457, OTHER);
no.push(
  // other companies' gap cover is not Discovery's
  [null, 'SIRAGO GAP COVER 123', -457, OTHER],
  [null, 'TURNBERRY GAPCOVER 123', -300, OTHER],
  [null, 'ZESTLIFE GAP COVER', -450, OTHER],
  [null, 'DEBIT ORDER SOMETOWN GAP COVER', -450, OTHER],
  [null, 'INSGAPCLA 5678', -900, OTHER],
);
every(CREDIT, 'product.gapClaim', ['INSGAPCLA 5678', 'INSGAP 5678'], 900, OTHER);
no.push([null, 'SIRAGO GAP CLAIM', 900, OTHER]);

for (const [key, d, amount, disc, cat] of yes) assert.strictEqual(keyOf(d, amount, disc, cat), key, `"${d}" (${amount}) should be ${key}`);
for (const [key, d, amount, disc, cat] of no) assert.strictEqual(keyOf(d, amount, disc, cat), key, `"${d}" (${amount}) should be ${key}`);

// every rule key is exercised both ways
const keys = [...new Set(RULES.map(r => r.key))];
for (const k of keys) {
  assert.ok(yes.some(c => c[0] === k), `no positive case for ${k}`);
  assert.ok(no.some(c => c[0] !== k), `no negative case for ${k}`);
}
// a premium rule never claims money arriving
for (const r of RULES.filter(x => /^product\.(medical|insure|life|gap)$/.test(x.key))) assert.strictEqual(r.sign, 'out', r.key);

// ── Shop tags ──────────────────────────────────────────────────────────
const tagYes = [];
const tagNo = [];
const tagEvery = (key, bodies) => { for (const p of CARD) for (const b of bodies) tagYes.push([key, p + b]); };
tagEvery('shop.woolworths', ['WOOLWORTHS SOMETOWN', 'WWORTHS SOMETOWN', 'Woolies Dash']);
tagNo.push([null, 'WOOLWORTHS FINANCIAL SERVICES DEBIT'], [null, 'DEBIT ORDER WOOLWORTHS STORE CARD'], [null, 'WOOLWORTHS CARD PAYMENT'], [null, 'WOOLWORTHS CREDIT CARD 1234'], [null, 'WFS 1234']);
tagEvery('shop.checkers', ['CHECKERS SOMETOWN', 'CHECKERS SIXTY60']);
tagNo.push([null, 'SHOPRITE SOMETOWN'], [null, 'USAVE SOMETOWN']);
tagEvery('shop.pnp', ['PICK N PAY SOMETOWN', 'PNP FAMILY SOMETOWN']);
tagNo.push([null, 'PNPX TRADING']);
tagEvery('shop.clicks', ['CLICKS SOMETOWN']);
tagNo.push([null, 'CLICKSTREAM MEDIA']);
tagEvery('shop.dischem', ['DIS-CHEM SOMETOWN', 'DISCHEM SOMETOWN']);
tagNo.push([null, 'DISC PREM 000111']);
tagEvery('fuel.bp', ['BP SOMETOWN', 'BP EXPRESS SOMETOWN']);
tagNo.push([null, 'BPX TRADING'], [null, 'SOMETOWN BP'], [null, 'PAYMENT TO BP SMITH']);
tagEvery('fuel.shell', ['SHELL ULTRA CITY', 'SHELL SOMETOWN']);
tagNo.push([null, 'SHELLY BEACH SPAR'], [null, 'SEASHELL CAFE']);
tagEvery('fuel.other', ['ENGEN SOMETOWN', 'SASOL SOMETOWN', 'ASTRON ENERGY']);
tagNo.push([null, 'SOMETOWN BAKERY']);
tagEvery('ride.uber', ['UBER TRIP']);
tagNo.push([null, 'UBER EATS SOMETOWN']);
tagEvery('travel.vitality', ['VITALITY TRAVEL']);
tagNo.push([null, 'VITALITY MONEY PREMIUM']);
tagEvery('gym', ['VIRGIN ACTIVE SA', 'PLANETFITNESS 0001', 'PLANET FITNESS SOMETOWN']);
tagNo.push([null, 'VIRGIN MOBILE']);
for (const [key, d] of tagYes) assert.strictEqual(tagKey(d), key, `"${d}" should be tagged ${key}`);
for (const [key, d] of tagNo) assert.strictEqual(tagKey(d), key, `"${d}" should be tagged ${key}`);
for (const t of SHOP_TAGS) {
  assert.ok(tagYes.some(c => c[0] === t.key), `no positive case for ${t.key}`);
}

// the shared prefix is plain: no lookbehind, no named groups (iOS 15)
assert.ok(!VERB_PREFIX.includes('(?<'), VERB_PREFIX);

// ── measure.js reads the same rules ────────────────────────────────────
{
  const accounts = { Cheque: { institution: 'Sometown Savings Bank', type: 'checking' } };
  const rows = [
    ['ACB DEBIT:EXTERNAL DISC PREM 000111', -3000],
    ['Debit Order: DISCOVERY HEALTH 000111', -3000],
    ['DEBIT ORDER INSGAP 5678', -457],
    ['SIRAGO GAP COVER 123', -400],
    ['DISCINSURE CLAIM 77', 8000],
    ['DISCINSURE 000222', -1500],
    ['(Pending) Card Purchase: BP SOMETOWN', -900],
    ['SHOPRITE SOMETOWN', -1200],
    ['WOOLWORTHS FINANCIAL SERVICES DEBIT', -800],
    ['PLANETFITNESS 0001', -400],
  ].map(([description, amount], i) => ({ date: `2026-09-${String(10 + i).padStart(2, '0')}`, description, category: 'x', amount, account: 'Cheque', split: '' }));
  const m = measure(rows, accounts, {}, { from: '2026-09', to: '2026-09' });
  const t = k => (m.figures[k] ? m.figures[k].total : 0);
  assert.strictEqual(t('product.medical'), 6000);
  assert.strictEqual(t('product.gap'), 457);
  assert.strictEqual(t('product.insure'), 1500);
  assert.strictEqual(t('product.insureClaim'), 8000);
  assert.strictEqual(t('all.fuel.bp'), 900);
  assert.strictEqual(t('all.gym'), 400);
  assert.strictEqual(t('all.shop.checkers'), 0);
  assert.strictEqual(t('all.shop.woolworths'), 0);
}

console.log(`rules OK (${yes.length + no.length} rule cases, ${tagYes.length + tagNo.length} tag cases)`);
