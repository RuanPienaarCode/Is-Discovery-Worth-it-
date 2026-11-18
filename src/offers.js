'use strict';
/* The Latest tab's logic: Discovery offers kept as notes, one note per
   offer, checked against what the household has. Pure: no Obsidian, no DOM,
   no clock (today is passed in as 'YYYY-MM-DD').

   An offer note's frontmatter (docs/offer-notes.html has the whole format):
     discovery: offer            marks the note as an offer (required)
     title                       required
     benefit                     one line: what you get
     area                        bank | vitality | health | insure | travel | gap | life | other
     partner                     a name or a list
     starts, ends                YYYY-MM-DD; both left out = always on
     requires                    a list of REQUIREMENTS words; "a | b" = either
     condition                   one line: the catch
     how                         a list of steps, in Discovery's words
     source, url, added          where it came from, and when it was added
     state                       '' | used | hidden (the page writes this)

   Nothing is guessed. A date that is not a date stays unset and is listed
   in `problems`; a requirement word this file does not know is "not known"
   for everyone, so the offer shows as one to check, never as one you have.

     parseOffer(frontmatter, path)          → offer | null
     householdOf({ eff, products, vitality }) → [person]
     checkRequirement(word, person)         → true | false | null
     evaluate(offer, person)                → { verdict, missing, unknown }
     timing(offer, today)                   → { phase, daysLeft, daysToStart }
     buildLatest(offers, household, today)  → { on, soon, always, notForUs, put, ended, counts } */

const AREAS = ['bank', 'vitality', 'health', 'insure', 'travel', 'gap', 'life', 'other'];
const STATES = ['used', 'hidden'];
const TIERS = ['gold', 'platinum', 'black', 'purple'];
const LEVELS = ['blue', 'bronze', 'silver', 'gold', 'diamond'];
const PROGRAMMES = { money: 'Vitality Money', health: 'Vitality Health', drive: 'Vitality Drive' };
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

/* Every word `requires` may use, and how "Needs …" says it. */
const REQUIREMENTS = {
  bank: 'a Discovery Bank account',
  transaction: 'a Discovery transaction account',
  'transaction-bundled': 'a transaction account on bundled fees',
  'credit-card': 'a Discovery credit card',
  suite: 'a Discovery Bank Suite',
  'vitality-money': PROGRAMMES.money,
  'vitality-health': PROGRAMMES.health,
  'vitality-drive': PROGRAMMES.drive,
  health: 'Discovery Health medical aid',
  gap: 'Discovery Gap Cover',
  insure: 'Discovery Insure',
  'home-cover': 'Discovery Insure home cover',
  life: 'Discovery Life cover',
};
for (const t of TIERS) REQUIREMENTS['tier-' + t] = `a ${cap(t)} card or higher`;
for (const [p, name] of Object.entries(PROGRAMMES)) {
  for (const l of LEVELS) REQUIREMENTS[`${p}-${l}`] = `${name} at ${cap(l)} or higher`;
}

/* ── reading a note ─────────────────────────────────────────────────── */
const text = v => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
/* a list from a YAML list or a comma string */
const list = v => (Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : []).map(text).filter(Boolean);
const two = n => (n < 10 ? '0' : '') + n;
/* a calendar day 'YYYY-MM-DD', or null when it is not one */
function dayOf(v) {
  if (v instanceof Date && !isNaN(v)) return `${v.getUTCFullYear()}-${two(v.getUTCMonth() + 1)}-${two(v.getUTCDate())}`;
  const m = /^(\d{4})-(\d\d)-(\d\d)(?:[T ].*)?$/.exec(text(v));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function parseOffer(fm, path) {
  if (!fm || typeof fm !== 'object' || text(fm.discovery).toLowerCase() !== 'offer') return null;
  const title = text(fm.title);
  if (!title) return null;
  const problems = [];
  const date = key => {
    if (fm[key] === undefined || fm[key] === null || fm[key] === '') return null;
    const d = dayOf(fm[key]);
    if (!d) problems.push(`"${key}" is not a date (YYYY-MM-DD): ${text(fm[key]) || String(fm[key])}`);
    return d;
  };
  const area = text(fm.area).toLowerCase();
  const state = text(fm.state).toLowerCase();
  return {
    path: String(path || ''),
    title,
    benefit: text(fm.benefit),
    area: AREAS.includes(area) ? area : 'other',
    partners: list(fm.partner || fm.partners),
    starts: date('starts'),
    ends: date('ends'),
    requires: list(fm.requires).map(r => r.split('|').map(x => x.trim().toLowerCase()).filter(Boolean)).filter(g => g.length),
    condition: text(fm.condition),
    how: list(Array.isArray(fm.how) ? fm.how : text(fm.how) ? [fm.how] : []),
    source: text(fm.source),
    url: text(fm.url),
    added: dayOf(fm.added),
    state: STATES.includes(state) ? state : '',
    problems,
  };
}

/* ── the household ──────────────────────────────────────────────────── */
/* You, from the plugin's own answers (eff = the settings the page counts
   with, products and vitality as resolved), then each person typed under
   Inputs (settings.people: { name, bank, aid }). Others answer only their
   own bank account and whether they are on the medical aid; the cars, the
   home and the life cover are the household's, so those follow yours. */
function householdOf({ eff, products, vitality }) {
  const s = eff || {};
  const pr = products || {};
  const vi = vitality || {};
  const cond = s.conditions || {};
  const st = s.status || {};
  const bank = pr.bank ? (s.bankKind || 'suite') : 'none';
  const home = { insure: !!pr.insure, drive: pr.insure ? (typeof vi.drive === 'boolean' ? vi.drive : null) : false, driveStatus: st.drive || null, homeCover: pr.insure ? (cond.homeCover || '') : 'none', life: !!pr.life };
  const you = {
    id: 'you', name: 'You', you: true,
    bank, bankFees: s.bankFees || '', tier: bank === 'suite' || bank === 'card' ? (s.suite || null) : null,
    money: bank === 'none' ? false : (typeof vi.money === 'boolean' ? vi.money : null), moneyStatus: st.money || null,
    health: !!pr.health, vhealth: pr.health ? (typeof vi.health === 'boolean' ? vi.health : null) : false, healthStatus: st.health || null, gap: !!pr.gap,
    ...home,
  };
  const others = (Array.isArray(s.people) ? s.people : []).filter(p => p && text(p.name)).map((p, i) => {
    const kind = ['suite', 'card', 'transaction', 'savings', 'none'].includes(p.bank) ? p.bank : null;
    const aid = p.aid === true ? you.health : p.aid === false ? false : null;
    return {
      id: 'p' + i, name: text(p.name), you: false,
      bank: kind, bankFees: '', tier: null,
      money: kind === 'none' ? false : null, moneyStatus: null,
      health: aid, vhealth: aid ? you.vhealth : aid, healthStatus: aid ? you.healthStatus : null, gap: aid ? you.gap : aid,
      ...home,
    };
  });
  return [you, ...others];
}

/* true met · false not met · null not known */
function checkRequirement(word, p) {
  const w = String(word || '').toLowerCase();
  const kind = p.bank;
  const has = (...kinds) => (kind === null || kind === undefined ? null : kinds.includes(kind));
  if (w === 'bank') return kind === null || kind === undefined ? null : kind !== 'none';
  if (w === 'transaction') return has('suite', 'transaction');
  if (w === 'transaction-bundled') return kind === 'transaction' ? p.bankFees !== 'payt' : has('suite');
  if (w === 'credit-card') return has('suite', 'card');
  if (w === 'suite') return has('suite');
  if (w.startsWith('tier-') && TIERS.includes(w.slice(5))) {
    const card = has('suite', 'card');
    if (card !== true) return card;
    const at = TIERS.indexOf(String(p.tier || '').toLowerCase());
    return at < 0 ? null : at >= TIERS.indexOf(w.slice(5));
  }
  if (w === 'vitality-money') return p.money;
  if (w === 'vitality-health') return p.vhealth;
  if (w === 'vitality-drive') return p.drive;
  if (w === 'health' || w === 'gap' || w === 'insure' || w === 'life') return p[w];
  if (w === 'home-cover') return p.homeCover === 'one' || p.homeCover === 'both' ? true : p.homeCover === 'none' ? false : null;
  const sm = /^(money|health|drive)-([a-z]+)$/.exec(w);
  if (sm && LEVELS.includes(sm[2])) {
    const on = { money: p.money, health: p.vhealth, drive: p.drive }[sm[1]];
    if (on !== true) return on;
    const at = LEVELS.indexOf(String(p[sm[1] + 'Status'] || '').toLowerCase());
    return at < 0 ? null : at >= LEVELS.indexOf(sm[2]);
  }
  return null;
}

/* One person against one offer: every group of `requires` needs one of its
   words met. One not met → 'no'; else one not known → 'check'; else 'yes'.
   missing/unknown are the words as "Needs …" says them. */
function evaluate(offer, person) {
  const missing = [], unknown = [];
  for (const group of offer.requires || []) {
    const r = group.map(w => checkRequirement(w, person));
    if (r.includes(true)) continue;
    const label = group.map(w => REQUIREMENTS[w] || w).join(' or ');
    (r.includes(null) ? unknown : missing).push(label);
  }
  return { verdict: missing.length ? 'no' : unknown.length ? 'check' : 'yes', missing, unknown };
}

/* ── when ───────────────────────────────────────────────────────────── */
const dayNo = ymd => { const [y, m, d] = ymd.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 864e5); };
function timing(offer, today) {
  const t = dayNo(today);
  if (offer.ends && dayNo(offer.ends) < t) return { phase: 'ended', daysLeft: null, daysToStart: 0 };
  if (offer.starts && dayNo(offer.starts) > t) return { phase: 'soon', daysLeft: offer.ends ? dayNo(offer.ends) - t : null, daysToStart: dayNo(offer.starts) - t };
  if (!offer.ends) return { phase: 'always', daysLeft: null, daysToStart: 0 };
  return { phase: 'on', daysLeft: dayNo(offer.ends) - t, daysToStart: 0 };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const short = ymd => { const [, m, d] = ymd.split('-').map(Number); return `${d} ${MONTHS[m - 1]}`; };
/* "Ends in 5 days", "On 27 Nov", "Ongoing" */
function timeWords(t, offer) {
  if (t.phase === 'ended') return offer.ends ? `Ended ${short(offer.ends)}` : 'Ended';
  if (t.phase === 'always') return 'Ongoing';
  if (t.phase === 'soon') {
    if (offer.ends === offer.starts) return `On ${short(offer.starts)}`;
    return offer.ends ? `${short(offer.starts)} to ${short(offer.ends)}` : `From ${short(offer.starts)}`;
  }
  if (t.daysLeft === 0) return 'Ends today';
  if (t.daysLeft === 1) return 'Ends tomorrow';
  if (t.daysLeft <= 14) return `Ends in ${t.daysLeft} days`;
  return `Until ${short(offer.ends)}`;
}

/* ── who ────────────────────────────────────────────────────────────── */
const andList = a => (a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);
/* who can use it: "You and Sam", "Everyone at home", '' when nobody surely */
function whoLine(who) {
  const yes = who.filter(w => w.verdict === 'yes').map(w => w.name);
  if (yes.length > 1 && yes.length === who.length) return 'Everyone at home';
  return andList(yes);
}
/* why nobody can: "Needs Vitality Drive" (each word once) */
function reasonLine(who) {
  const seen = [];
  for (const w of who) for (const m of w.missing || []) if (!seen.includes(m)) seen.push(m);
  return seen.length ? 'Needs ' + andList(seen) : '';
}

/* ── the groups ─────────────────────────────────────────────────────── */
const FIT = { yes: 0, check: 1, no: 2 };
const byTitle = (a, b) => a.offer.title.localeCompare(b.offer.title);
function buildLatest(offers, household, today) {
  const out = { on: [], soon: [], always: [], notForUs: [], put: [], ended: [] };
  for (const offer of offers || []) {
    if (!offer) continue;
    const who = household.map(p => ({ id: p.id, name: p.name, ...evaluate(offer, p) }));
    const fit = who.reduce((best, w) => (FIT[w.verdict] < FIT[best] ? w.verdict : best), 'no');
    const t = timing(offer, today);
    const item = { offer, who, fit, timing: t, when: timeWords(t, offer), whoLine: whoLine(who), reason: fit === 'no' ? reasonLine(who) : '' };
    if (offer.state) out.put.push(item);
    else if (t.phase === 'ended') out.ended.push(item);
    else if (fit === 'no') out.notForUs.push(item);
    else out[t.phase].push(item);
  }
  out.on.sort((a, b) => a.offer.ends.localeCompare(b.offer.ends) || FIT[a.fit] - FIT[b.fit] || byTitle(a, b));
  out.soon.sort((a, b) => a.offer.starts.localeCompare(b.offer.starts) || FIT[a.fit] - FIT[b.fit] || byTitle(a, b));
  out.always.sort((a, b) => FIT[a.fit] - FIT[b.fit] || byTitle(a, b));
  out.notForUs.sort(byTitle);
  out.ended.sort((a, b) => b.offer.ends.localeCompare(a.offer.ends) || byTitle(a, b));
  out.counts = {
    on: out.on.length, soon: out.soon.length, always: out.always.length,
    endingThisWeek: out.on.filter(i => i.timing.daysLeft <= 7).length,
  };
  return out;
}

module.exports = { parseOffer, householdOf, checkRequirement, evaluate, timing, timeWords, buildLatest, whoLine, reasonLine, REQUIREMENTS, AREAS, dayOf };
