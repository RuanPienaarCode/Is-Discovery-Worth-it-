'use strict';

const VIEW_TYPE = 'discovery-worth-it';

/* Line rules: the first that matches a row claims it (see measure.js).
   discoveryOnly — only on an account whose note says institution Discovery,
   so another bank's "MONTHLY ACCOUNT FEE" is never charged to Discovery. */
const RULES = [
  { key: 'fee.account', desc: /monthly account fee/i, discoveryOnly: true, direction: 'cost' },
  { key: 'fee.facility', desc: /facility fee/i, discoveryOnly: true, direction: 'cost' },
  { key: 'fee.vitalityMoney', desc: /vitality money premium/i, discoveryOnly: true, direction: 'cost' },
  { key: 'fee.fx', desc: /intl payment fee|international payment fee|forex fee/i, discoveryOnly: true, direction: 'cost' },
  { key: 'interest.boost', desc: /dynamic interest boost/i, discoveryOnly: true, direction: 'income' },
  { key: 'interest.cashback', desc: /dynamic interest cashback/i, discoveryOnly: true, direction: 'income' },
  { key: 'interest.earned', desc: /interest earned/i, discoveryOnly: true, direction: 'income' },
  { key: 'interest.charged', desc: /interest charged/i, discoveryOnly: true, direction: 'cost' },
  { key: 'benefit.appleWatch', desc: /apple watch/i, discoveryOnly: true, direction: 'cost' },
  { key: 'product.medical', desc: /^DISC PREM/i, direction: 'cost' },
  { key: 'product.medicalBack', desc: /^DISC MEMB/i, direction: 'income' },
  { key: 'product.insure', desc: /DISCINSURE|DISCOVERY INSURE/i, direction: 'cost' },
  /* Vitality Drive fuel rewards paid as cash ("Cash to Planholder"). */
  { key: 'insure.driveCash', desc: /INSURE ?CASH/i, sign: 'in', direction: 'income' },
  { key: 'product.insureClaim', desc: /INSURE ?CLA/i, sign: 'in', direction: 'income' },
  { key: 'product.life', desc: /DISC ?LIFE|DISCOVERY LIFE/i, direction: 'cost' },
  { key: 'product.gapClaim', desc: /INSGAPCLA/i, direction: 'income' },
  { key: 'product.gap', desc: /INSGAP|GAP ?COVER/i, not: /INSGAPCLA/i, sign: 'out', direction: 'cost' },
  /* Penalties for a failed or returned debit order: any bank charges these. */
  { key: 'fee.penalty', desc: /returned debit order|penalty|failed do/i, sign: 'out', discoveryOnly: true, direction: 'cost' },
  /* Last: anything else filed as a bank charge on a Discovery account. */
  { key: 'fee.other', category: /^bank (charges|fees)/i, sign: 'out', discoveryOnly: true, direction: 'cost' },
];

/* Where card spend happened. A tagged row is still card spend. */
const SHOP_TAGS = [
  { key: 'shop.woolworths', desc: /woolworths|wworths/i },
  { key: 'shop.checkers', desc: /checkers|shoprite/i },
  { key: 'shop.pnp', desc: /pick n pay|\bpnp\b/i },
  { key: 'shop.clicks', desc: /\bclicks\b/i },
  { key: 'shop.dischem', desc: /dis-?chem/i },
  { key: 'fuel.bp', desc: /^BP\b/i },
  { key: 'fuel.shell', desc: /^SHELL\b/i },
  { key: 'fuel.other', desc: /engen|sasol|caltex|totalenergies|astron|fuel/i },
  { key: 'ride.uber', desc: /uber/i, not: /eats/i },
  { key: 'travel.vitality', desc: /vitality travel/i },
  { key: 'gym', desc: /virgin act|planet fitness/i },
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
  /* The card tier: Gold, Platinum, Black or Purple (rates.js SUITES). */
  suite: 'Black',
  /* Which Vitality programmes you pay for: money (with the bank), health
     (with the medical aid) and drive (with Insure). Each unlocks its own
     benefits (src/benefits.js). null = not answered: taken from the budget
     (src/detect.js resolveVitality). */
  vitality: { money: null, health: null, drive: null },
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
  members: { adults: 1, children: 0 },
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
  compareWith: 'capitec',
  period: 'annual',
  /* The welcome screen when the page opens; "Skip this next time" turns it off. */
  welcome: true,
};

module.exports = { VIEW_TYPE, RULES, SHOP_TAGS, NOT_SPEND_TYPES, STATUSES, DEFAULT_SETTINGS };
