'use strict';
/* "Type in my numbers": the questions for someone with no Budget-plugin
   budget. One question per screen, Back and Next, in the first-run
   questions' look (the .dc-onb classes, src/css/onboarding.css). It asks
   only what the ticked products need (src/manual.js QUESTIONS), each with a
   "Where to find it" line. A blank answer is not counted, never guessed.

   Screens: products · bankKind · tier (with the bank; not savings) · the
   money questions that apply (fees, card spend, shops, fuel, interest,
   Health, claims, gym, flights, gap cover, Insure, Life) · done.
   Each Next writes the answers into settings.manual (and the products and
   bank package into settings) and awaits save(), so closing half way keeps
   what was answered. Done sets settings.manual.done.

   renderManualForm(parent, { settings, save, onDone, onLeave }) → root.
   onLeave: "Not now" — the caller goes back to the empty screen. */

const { el, icon, button, checkRow } = require('./dom');
const { money, parseTyped, showTyped } = require('./format');
const { radioGroup } = require('./onboarding');
const { PRODUCT_NAMES } = require('./detect');
const { SUITES } = require('./rates');
const { MANUAL_DEFAULTS, manualQuestions, publishedFees, applyManual } = require('./manual');

const IDS = ['bank', 'health', 'gap', 'insure', 'life'];
const ICONS = { bank: 'landmark', health: 'heart-pulse', gap: 'shield-check', insure: 'car', life: 'umbrella' };
const BANK_KINDS = [
  { value: 'suite', label: 'The all-in-one package (account and credit card)' },
  { value: 'card', label: 'A credit card on its own' },
  { value: 'transaction', label: 'Only a transaction account' },
  { value: 'savings', label: 'Only savings' },
];
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
let uid = 0;
/* "A", "A and B", "A, B and C" */
const joinWords = list => (list.length <= 1 ? list.join('') : list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1]);

function renderManualForm(parent, ctx) {
  const { settings, save, onDone, onLeave } = ctx;
  const headId = `dc-man-h-${++uid}`;
  const prev = Object.assign({}, MANUAL_DEFAULTS, settings.manual || {});
  const st = {
    step: 0,
    error: '',
    badKey: '',
    busy: false,
    picked: Object.assign({}, ...IDS.map(id => ({ [id]: (settings.products || {})[id] === true }))),
    bankKind: settings.bankKind || '',
    tier: settings.suite || 'Black',
    feesHow: prev.feesHow === 'typed' ? 'typed' : 'published',
    gapInHealth: !!prev.gapInHealth,
    /* what is in each field, as typed */
    text: {},
  };
  for (const k of Object.keys(MANUAL_DEFAULTS)) if (typeof MANUAL_DEFAULTS[k] !== 'boolean' && k !== 'feesHow' && k !== 'keepTyped') st.text[k] = showTyped(prev[k]);

  /* the answers so far, as settings (what the money questions depend on) */
  const draft = () => Object.assign({}, settings, { products: st.picked, bankKind: st.bankKind || 'suite', suite: st.tier });
  const questions = () => manualQuestions(draft());
  const stepIds = () => {
    const ids = ['products'];
    if (st.picked.bank) {
      ids.push('bankKind');
      if (st.bankKind && st.bankKind !== 'savings') ids.push('tier');
    }
    return ids.concat(questions().map(q => q.id), ['done']);
  };

  const root = el(parent, 'section', 'dc-onb dc-man');
  root.setAttribute('aria-labelledby', headId);
  const top = el(root, 'div', 'dc-onb-top');
  const stepText = el(el(top, 'div', 'dc-onb-progress'), 'p', 'dc-onb-stepno');
  const leave = button(top, 'dc-onb-skip', 'Not now', () => { if (!st.busy && onLeave) onLeave(); });
  const card = el(root, 'div', 'dc-onb-card');
  const nav = el(root, 'div', 'dc-onb-nav');
  const navButtons = [];
  const setBusy = on => { st.busy = on; leave.disabled = on; for (const b of navButtons) b.disabled = on; };

  /* a typed amount: blank → null (not counted); anything else must read as
     a number of rands, nought or more */
  function amount(key, label) {
    const n = parseTyped(st.text[key]);
    if (n === null) return { value: null };
    if (!Number.isFinite(n) || n < 0) return { error: `${label}: type an amount in rands, like 1 500. Leave it blank if you are not sure.` };
    return { value: n };
  }

  /* → true when the screen's answers were good and have been kept */
  function commit(id) {
    st.error = ''; st.badKey = '';
    const manual = Object.assign({}, MANUAL_DEFAULTS, settings.manual || {});
    if (id === 'products') {
      if (!IDS.some(p => st.picked[p])) { st.error = 'Tick at least one Discovery product.'; return false; }
      settings.products = Object.assign({}, settings.products, st.picked);
    } else if (id === 'bankKind') {
      if (!st.bankKind) { st.error = 'Choose what you have at Discovery Bank.'; return false; }
      settings.bankKind = st.bankKind;
    } else if (id === 'tier') {
      settings.suite = st.tier;
      settings.suiteAnswered = true;
    } else if (id !== 'done') {
      const q = questions().find(x => x.id === id);
      if (id === 'fees') manual.feesHow = st.feesHow;
      for (const f of (q && q.fields) || []) {
        if (id === 'fees' && st.feesHow !== 'typed') continue;
        const a = amount(f.key, f.label);
        if (a.error) { st.error = a.error; st.badKey = f.key; return false; }
        manual[f.key] = a.value;
      }
      if (id === 'gap') manual.gapInHealth = st.gapInHealth;
    }
    settings.manual = manual;
    applyManual(settings);
    return true;
  }

  async function next() {
    if (st.busy) return;
    const ids = stepIds();
    const id = ids[st.step];
    if (!commit(id)) { draw(true); return; }
    if (id === 'done') settings.manual = Object.assign({}, settings.manual, { done: true });
    setBusy(true);
    try { await save(); } finally { setBusy(false); }
    if (id === 'done') { if (onDone) onDone(); return; }
    st.step = Math.min(st.step + 1, stepIds().length - 1);
    draw(true);
  }
  function back() {
    if (st.busy || st.step === 0) return;
    st.error = ''; st.badKey = '';
    st.step--;
    draw(true);
  }

  /* one amount field: its label, R, and what is typed */
  function amountField(fields, key, label, per) {
    const f = el(fields, 'label', 'dc-onb-field');
    el(f, 'span', 'dc-onb-field-label', `${label} (R ${per === 'year' ? 'a year' : 'a month'})`);
    const input = el(f, 'input', 'dc-onb-num');
    input.type = 'text';
    input.setAttribute('inputmode', 'decimal');
    input.setAttribute('enterkeyhint', 'next');
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.value = st.text[key] || '';
    input.setAttribute('data-key', key);
    if (st.badKey === key) input.setAttribute('aria-invalid', 'true');
    input.addEventListener('input', () => { st.text[key] = input.value; input.removeAttribute('aria-invalid'); });
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); next(); } });
    return input;
  }

  function moneyScreen(q, h, lead, body) {
    h.textContent = q.title;
    lead.textContent = q.lead;
    const box = el(body, 'fieldset', 'dc-onb-group');
    el(box, 'legend', 'dc-onb-legend', q.fields.length > 1 ? 'Each shop on its own' : q.fields[0].label);
    const fields = el(box, 'div', 'dc-onb-fields');
    for (const f of q.fields) amountField(fields, f.key, f.label, q.per);
    if (q.id === 'gap') {
      const { row, box: tick } = checkRow(body, 'dc-onb-opt dc-man-tick', st.gapInHealth, on => { st.gapInHealth = on; row.classList.toggle('is-on', on); });
      tick.classList.add('dc-onb-in');
      row.classList.toggle('is-on', st.gapInHealth);
      el(el(row, 'span', 'dc-onb-opt-text'), 'span', 'dc-onb-opt-label', 'It is part of my Discovery Health debit order');
    }
    where(body, q.where);
  }

  /* "Where to find it", and that a blank is not counted */
  function where(body, text, noBlank) {
    const w = el(body, 'p', 'dc-onb-hint dc-man-where');
    icon(w, 'search', 'dc-man-where-icon');
    el(w, 'span', null, text);
    if (!noBlank) el(body, 'p', 'dc-onb-hint', 'A blank answer is not counted.');
  }

  const SCREENS = {
    products(h, lead, body) {
      h.textContent = 'Which Discovery products do you have?';
      lead.textContent = 'Tick each one. Only these get questions and a page.';
      const list = el(body, 'div', 'dc-onb-products');
      for (const id of IDS) {
        const { row, box } = checkRow(list, 'dc-onb-opt dc-onb-prod dc-p-' + id, st.picked[id], on => { st.picked[id] = on; row.classList.toggle('is-on', on); });
        box.classList.add('dc-onb-in');
        row.classList.toggle('is-on', !!st.picked[id]);
        const name = el(el(row, 'span', 'dc-onb-opt-text'), 'span', 'dc-onb-opt-label');
        icon(name, ICONS[id], 'dc-onb-prod-icon');
        el(name, 'span', null, PRODUCT_NAMES[id]);
      }
      el(body, 'p', 'dc-onb-hint', 'Your answers are a rough average month. They stay in this plugin\'s settings, on this device.');
    },
    bankKind(h, lead, body) {
      h.textContent = 'What do you have at Discovery Bank?';
      lead.textContent = 'It decides your fees and rewards.';
      radioGroup(body, { legend: 'Your Discovery Bank product', options: BANK_KINDS, value: st.bankKind, onChange: v => { st.bankKind = v; } });
    },
    tier(h, lead, body) {
      const isCard = st.bankKind === 'card';
      const list = isCard ? SUITES.filter(t => t.creditCard) : SUITES;
      if (!list.some(t => t.id === st.tier)) st.tier = 'Black';
      h.textContent = isCard ? 'Which package is your credit card?' : 'Which Discovery Bank package?';
      lead.textContent = 'The package sets your fees and your Miles.';
      radioGroup(body, {
        legend: isCard ? 'Your credit card package' : 'Your package',
        hint: 'Where to find it: the Discovery app, or the top of your Discovery Bank statement.',
        options: list.map(t => ({ value: t.id, label: (isCard ? t.creditCard.label : t.label) || t.id })),
        value: st.tier,
        onChange: v => { st.tier = v; },
      });
    },
    fees(h, lead, body, q) {
      const pub = publishedFees(draft());
      h.textContent = q.title;
      lead.textContent = q.lead;
      const box = el(body, 'div', 'dc-man-fees');
      radioGroup(box, {
        legend: 'Your monthly fees',
        options: [
          { value: 'published', label: 'The published fee for my package', hint: `${money(pub.total)} a month for the ${pub.label}${pub.vitalityMoney ? ', Vitality Money included' : ''}` },
          { value: 'typed', label: 'I will type what I pay' },
        ],
        value: st.feesHow,
        onChange: v => { st.feesHow = v; drawFeeField(); },
      });
      const holder = el(box, 'div', 'dc-onb-fields dc-man-fee-field');
      const drawFeeField = () => {
        while (holder.firstChild) holder.removeChild(holder.firstChild);
        holder.hidden = st.feesHow !== 'typed';
        if (st.feesHow === 'typed') amountField(holder, 'fees', 'Fees', 'month');
      };
      drawFeeField();
      where(body, q.where, true);
    },
    done(h, lead, body) {
      const typed = questions().reduce((t, q) => t + q.fields.filter(f => (q.id !== 'fees' || st.feesHow === 'typed') && parseTyped(st.text[f.key]) > 0).length, 0);
      const asked = questions().reduce((t, q) => t + (q.id === 'fees' && st.feesHow !== 'typed' ? 0 : q.fields.length), 0);
      h.textContent = 'Your numbers are in';
      lead.textContent = settings.onboarded ? 'Next, the figures.' : 'Next, a few questions about Vitality and your plan. Then the figures.';
      const list = el(body, 'ul', 'dc-onb-points');
      el(list, 'li', null, `You have ${joinWords(IDS.filter(p => st.picked[p]).map(p => PRODUCT_NAMES[p]))}.`);
      if (st.picked.bank && st.bankKind !== 'savings') {
        const pub = publishedFees(draft());
        el(list, 'li', null, st.feesHow === 'typed' ? 'Bank fees are what you typed.' : `Bank fees are the published ${money(pub.total)} a month for the ${pub.label}.`);
      }
      el(list, 'li', null, `You typed ${typed} of ${asked} amounts. The figures use only those, as a normal month.`);
      el(body, 'p', 'dc-onb-hint', 'You can change any of them later on the Inputs tab, under Your typed numbers.');
    },
  };

  function draw(focusHead) {
    const ids = stepIds();
    if (st.step > ids.length - 1) st.step = ids.length - 1;
    const id = ids[st.step];
    stepText.textContent = id === 'done' ? 'All done' : `Question ${st.step + 1}`;
    while (card.firstChild) card.removeChild(card.firstChild);
    card.className = 'dc-onb-card' + (reduced() ? '' : ' is-animated');
    card.setAttribute('data-step', id);
    const h = el(card, 'h2', 'dc-onb-h');
    h.id = headId;
    h.tabIndex = -1;
    const lead = el(card, 'p', 'dc-onb-lead');
    const body = el(card, 'div', 'dc-onb-body');
    const q = questions().find(x => x.id === id);
    if (SCREENS[id]) SCREENS[id](h, lead, body, q);
    else moneyScreen(q, h, lead, body);
    if (st.error) el(card, 'p', 'dc-onb-error', st.error).setAttribute('role', 'alert');

    while (nav.firstChild) nav.removeChild(nav.firstChild);
    navButtons.length = 0;
    if (st.step > 0) navButtons.push(button(nav, 'dc-onb-btn is-quiet', 'Back', back, 'arrow-left'));
    else el(nav, 'span', 'dc-onb-nav-gap');
    navButtons.push(button(nav, 'dc-onb-btn is-primary', id === 'done' ? (settings.onboarded ? 'Show me the numbers' : 'Next') : 'Next', next, id === 'done' ? 'check' : 'arrow-right'));
    for (const b of navButtons) b.disabled = st.busy;
    if (focusHead) {
      const bad = st.badKey && card.querySelector ? card.querySelector(`input[data-key="${st.badKey}"]`) : null;
      (bad || h).focus({ preventScroll: false });
    }
  }

  draw(false);
  return root;
}

module.exports = { renderManualForm };
