'use strict';

const VIEW_TYPE = 'discovery-worth-it';

/* Banks glue a transaction-type verb onto the front of a description:
   "DEBIT ORDER DISC PREM …", "ACB DEBIT:EXTERNAL DISC PREM …", "POS PURCHASE
   BP …", "Card Purchase: Shell …", and Capitec marks an unsettled card
   payment "(Pending) …". A rule that names a merchant or a debit order at the
   START of the description allows one or two of these verbs first (longest
   first, so "ACB DEBIT:EXTERNAL" strips whole). Built as a string with no
   lookbehind — the iOS 15 floor. */
const VERBS = [
  'ACB DEBIT:EXTERNAL', 'ACB CREDIT:EXTERNAL', 'EXTERNAL DEBIT ORDER', 'RECURRING CARD PURCHASE',
  'INTERNET PURCHASE', 'ONLINE PURCHASE', 'PREPAID PURCHASE', 'CARD PURCHASE', 'POS PURCHASE',
  'DEBIT ORDER', 'MAGTAPE DEBIT', 'MAGTAPE CREDIT', 'ACB DEBIT', 'ACB CREDIT', 'EFT DEBIT', 'EFT CREDIT',
  'DEBICHECK', 'NAEDO', 'PURCHASE', 'DEBIT', 'CREDIT',
];
const escapeRe = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const VERB_PREFIX = '^(?:\\(PENDING\\)\\s*)?(?:#\\s*)?(?:(?:' + VERBS.map(escapeRe).join('|') + ')[\\s:*#.-]+){0,2}';
/* A regex that matches `body` at the start of the description, after any
   bank verb. */
const lead = (body, flags) => new RegExp(VERB_PREFIX + '(?:' + body + ')', flags || 'i');

/* Line rules: the first that matches a row claims it (see measure.js).
   discoveryOnly — only on an account whose note says institution Discovery,
   so another bank's "MONTHLY ACCOUNT FEE" is never charged to Discovery.
   sign 'out' — only money leaving the account (a premium); sign 'in' — only
   money arriving (a claim or a refund). A premium rule never claims a
   credit, so a claim paid by Discovery Insure is never booked as a premium
   paid backwards. */
const RULES = [
  { key: 'fee.account', desc: /monthly account fee/i, discoveryOnly: true, direction: 'cost' },
  { key: 'fee.facility', desc: /facility fee/i, discoveryOnly: true, direction: 'cost' },
  /* The Vitality Money premium, however the statement words it: "Vitality
     Money premium", "Vitality Money fee", "VM fee". */
  { key: 'fee.vitalityMoney', desc: /vitality money (?:monthly )?(?:premium|fee|subscription)|\bVM (?:monthly )?(?:premium|fee)\b/i, discoveryOnly: true, direction: 'cost' },
  { key: 'fee.fx', desc: /intl payment fee|international payment fee|forex fee/i, discoveryOnly: true, direction: 'cost' },
  { key: 'interest.boost', desc: /dynamic interest boost/i, discoveryOnly: true, direction: 'income' },
  { key: 'interest.cashback', desc: /dynamic interest cashback/i, discoveryOnly: true, direction: 'income' },
  { key: 'interest.earned', desc: /interest earned/i, discoveryOnly: true, direction: 'income' },
  { key: 'interest.charged', desc: /interest charged/i, discoveryOnly: true, direction: 'cost' },
  { key: 'benefit.appleWatch', desc: /apple watch/i, discoveryOnly: true, direction: 'cost' },
  /* The Discovery Health debit order: "DISC PREM", or the scheme's name. */
  { key: 'product.medical', desc: lead('DISC PREM|DISC(?:OVERY)? HEALTH\\b'), sign: 'out', direction: 'cost' },
  /* Money back from Discovery Health: "DISC MEMB", or a credit on the
     premium's own description (a refund). */
  { key: 'product.medicalBack', desc: lead('DISC MEMB'), direction: 'income' },
  { key: 'product.medicalBack', desc: lead('DISC PREM|DISC(?:OVERY)? HEALTH\\b'), sign: 'in', direction: 'income' },
  { key: 'product.insure', desc: /\bDISC(?:OVERY)? ?INSURE/i, not: /INSURE ?CASH/i, sign: 'out', direction: 'cost' },
  /* Vitality Drive fuel rewards paid as cash ("Cash to Planholder"). */
  { key: 'insure.driveCash', desc: /INSURE ?CASH/i, sign: 'in', direction: 'income' },
  /* Any other money from Discovery Insure is a claim (or a refund). */
  { key: 'product.insureClaim', desc: /INSURE ?CLA|\bDISC(?:OVERY)? ?INSURE/i, sign: 'in', direction: 'income' },
  { key: 'product.life', desc: /\bDISC(?:OVERY)? ?LIFE\b/i, sign: 'out', direction: 'cost' },
  /* Discovery Gap Cover is collected as "INSGAP". A bare "GAP COVER" is not
     Discovery's: Sirago, Turnberry, Zestlife and others say it too. */
  { key: 'product.gapClaim', desc: /INSGAP/i, sign: 'in', direction: 'income' },
  { key: 'product.gap', desc: /INSGAP/i, not: /INSGAP ?CLA/i, sign: 'out', direction: 'cost' },
  /* Penalties for a failed or returned debit order: any bank charges these. */
  { key: 'fee.penalty', desc: /returned debit order|penalty|failed do/i, sign: 'out', discoveryOnly: true, direction: 'cost' },
  /* Last: anything else filed as a bank charge on a Discovery account. */
  { key: 'fee.other', category: /^bank (charges|fees)/i, sign: 'out', discoveryOnly: true, direction: 'cost' },
];

/* Where card spend happened. A tagged row is still card spend. Shoprite is
   not a HealthyFood partner (only Checkers and Woolworths are, HealthyFood
   benefit guide), so it is not filed with Checkers. A payment to the
   Woolworths store card or Woolworths Financial Services is paying off a
   debt, not shopping. */
const SHOP_TAGS = [
  { key: 'shop.woolworths', desc: /woolworths|wworths|woolies/i, not: /financial|\bWFS\b|store ?card|card (?:payment|account)|credit card|account payment|insurance/i },
  { key: 'shop.checkers', desc: /checkers/i },
  { key: 'shop.pnp', desc: /pick n pay|\bpnp\b/i },
  { key: 'shop.clicks', desc: /\bclicks\b/i },
  { key: 'shop.dischem', desc: /dis-?chem/i },
  { key: 'fuel.bp', desc: lead('BP\\b') },
  { key: 'fuel.shell', desc: lead('SHELL\\b') },
  { key: 'fuel.other', desc: /engen|sasol|caltex|totalenergies|astron|fuel/i },
  { key: 'ride.uber', desc: /uber/i, not: /eats/i },
  { key: 'travel.vitality', desc: /vitality travel/i },
  { key: 'gym', desc: /virgin act|planet ?fitness/i },
];

/* Category types (from the Budget plugin's category notes) that are money
   moving between your own pockets, never a card purchase. */
const NOT_SPEND_TYPES = ['transfer', 'savings', 'investment', 'income', 'debt'];

const STATUSES = ['Blue', 'Bronze', 'Silver', 'Gold', 'Diamond'];

const DEFAULT_SETTINGS = {
  /* false until the first-run questions (src/onboarding.js) have been
     answered or skipped. */
  onboarded: false,
  /* The Discovery products this person has, chosen in onboarding (ticked
     there from what the budget shows, src/detect.js). Only a product set to
     true gets a tab, a place on Overview and Flows, and a row on Compare.
     null = not answered yet: the page falls back to what the budget shows. */
  products: { bank: null, health: null, gap: null, insure: null, life: null },
  /* How much each benefit is worth to YOU, by benefit id (src/benefits.js
     BENEFITS): 'full' | 'half' | 'none'. A missing id is decided from the
     budget (src/benefits.js suggestBenefits) — a benefit nobody uses is
     worth nothing to them however generous it looks. */
  benefits: {},
  /* Folder holding the Budget plugin's Transactions/, Accounts/ and
     Categories/ folders. Blank = find it. */
  budgetFolder: '',
  months: 12,
  /* Categories paid FROM the card account that are not swipes (an EFT for
     rent, say). Their total is shown so the choice stays visible. */
  notCardSpend: [],
  /* The three Vitality statuses: money = Vitality Money (the bank score),
     health = Vitality Health, drive = Vitality Drive (the car score). */
  status: { money: 'Blue', health: 'Blue', drive: 'Blue' },
  /* Which Discovery Bank product: 'suite' (a banking suite with a credit
     card), 'card' (a credit card account on its own), 'transaction' (only a
     transaction account), 'savings' (savings only). null = not answered. */
  bankKind: null,
  /* A Transaction Account's fee option: 'bundled' or 'payt'
     (pay-as-you-transact). Unset = bundled. */
  bankFees: '',
  /* The card tier: Gold, Platinum, Black or Purple (rates.js SUITES).
     suiteAnswered: true once the person chose it (onboarding or the
     settings); until then the tier the fees show is used
     (detect.js resolveSuite). */
  suite: 'Black',
  suiteAnswered: false,
  /* Which Vitality programmes you pay for: money (with the bank), health
     (with the medical aid) and drive (with Insure). Each unlocks its own
     benefits (src/benefits.js). null = not answered: taken from the budget
     (src/detect.js resolveVitality). */
  vitality: { money: null, health: null, drive: null },
  /* How you mostly spend your Discovery Miles, which sets what one is worth
     when there is no Miles statement: 'dday' (Discovery Miles partners on
     Ð-Day, the 15th), 'partners' (partners on other days), 'utilities'
     (prepaid electricity, data or airtime in the app), 'none' (not spent).
     '' = not answered: face value. */
  milesUse: '',
  /* What Discovery sets some benefits by, instead of your status. Each
     unanswered one counts the LOWER published figure (rates.js cases,
     model.js maps these to ctx.met):
       checks      'both' | 'one' | 'none' — Vitality Age and a Vitality
                   Health Check in the last 12 months (HealthyFood,
                   HealthyCare and flight discounts: 10% → 25%)
       gym36       true when you work out 36 times a year on a one-gym
                   membership (gym discount 50% → 75%)
       insurePlan  'core' | 'essential' | 'classic' | 'purple' — the Insure
                   plan (Drive fuel: Essential half, Core none)
       homeCover   'none' | 'one' | 'both' — Discovery Insure covers your
                   building, contents or both (higher Drive fuel limit) */
  conditions: { checks: '', gym36: null, insurePlan: '', homeCover: '' },
  /* Rate overrides keyed like rates.js entries; blank = the published default. */
  rates: {},
  /* What the Discovery app says you actually earned, in Miles, over the same
     window. A number here REPLACES the estimate for that line. */
  actualMiles: {},
  /* Totals from Vitality Travel eReceipts for the same window. */
  travel: {},
  /* The Discovery Health debit can carry more than the medical aid. What
     you know is in it, per month; the rest is shown as Vitality and other. */
  bill: {},
  /* Who is on the medical aid, to price the other schemes. */
  /* oldestAge: the oldest person's age, which prices gap cover (the
     published gap prices are for an oldest member under 45). null = not
     answered. */
  members: { adults: 1, children: 0, oldestAge: null },
  /* Medical aid: { plan, needs, cover }. plan = the Discovery Health plan
     you are on (an id from compare.js HEALTH_PLANS / HEALTH_OWN with
     discovery: true); with members it prices the medical aid, so the rest of
     the Discovery Health debit order can be named as Vitality and gap cover.
     needs = what the household needs (compare.js NEEDS). */
  health: {},
  /* Group or individual life cover: { total, own, age, cover } per month. */
  life: {},
  /* Household contents cover: { monthly, value }. */
  home: {},
  /* Typed monthly prices from other providers, keyed '<product>.<id>'
     (health, gap, insure — see compare.js); a quote beats the published one. */
  quotes: {},
  /* The other bank to weigh Discovery Bank against, by rates.js
     ALTERNATIVES id. '' = the best one whose figures are confirmed
     (rates.js chooseAlternative). */
  compareWith: '',
  period: 'annual',
  /* The welcome screen when the page opens; "Skip this next time" turns it off. */
  welcome: true,
};

module.exports = { VIEW_TYPE, VERB_PREFIX, RULES, SHOP_TAGS, NOT_SPEND_TYPES, STATUSES, DEFAULT_SETTINGS };
