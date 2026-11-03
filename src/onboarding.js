'use strict';
/* The first-run questions. One question per screen, Back and Next, a row
   of step dots, and "Skip for now". Everything is built node by node (no
   innerHTML) and works down to 320px wide.

   Screens, one question each, in this order. A screen shows only when it
   applies to what has been ticked and answered so far:
     hello · products ·
     bank:   bankKind · tier (not savings) · vmQ · vmStatus (bank score)
     health: plan · household · vhQ · vhStatus (health score)
     insure: vdQ · vdStatus (car score)
     benefits · done
   Each Next writes the answers to settings and awaits save(), so closing the
   page half way keeps what was answered. Only a benefit level you changed
   away from the suggestion is stored, so a later budget change can still
   re-suggest the rest.

   renderOnboarding(parent, { settings, budget, detected, measured,
     statement, save, onDone }) → the root element. */

const { el, icon, button, checkRow } = require('./dom');
const { money, parseTyped, showTyped } = require('./format');
const { STATUSES } = require('./constants');
const { healthPremium, HEALTH_PLANS, HEALTH_OWN } = require('./compare');
const { PRODUCT_NAMES, detectProducts, detectBanking, resolveProducts, resolveVitality, guessHealthPlan } = require('./detect');

const IDS = ['bank', 'health', 'gap', 'insure', 'life'];
const ICONS = { bank: 'landmark', health: 'heart-pulse', gap: 'shield-check', insure: 'car', life: 'umbrella' };
const FALLBACK_SUITES = [{ id: 'Black', label: 'Black Suite' }];
const LEVELS = [
  { value: 'full', label: 'I use it' },
  { value: 'half', label: 'Sometimes' },
  { value: 'none', label: 'Not for me' },
];

/* rates.js and benefits.js are written in step with this file; a missing
   export must not stop the questions. */
function suitesList() {
  try {
    const s = require('./rates').SUITES;
    return Array.isArray(s) && s.length ? s : FALLBACK_SUITES;
  } catch (e) { return FALLBACK_SUITES; }
}
/* The benefits to ask about: benefits.js benefitsFor(products, settings,
   vitality) when it takes the third argument (the older one-argument form
   ignores the extras, which is fine), else BENEFITS filtered by product. */
function benefitsFor(products, settings, vitality) {
  let mod;
  try { mod = require('./benefits'); } catch (e) { return []; }
  if (typeof mod.benefitsFor === 'function') {
    try { const r = mod.benefitsFor(products, settings, vitality); if (Array.isArray(r)) return r; } catch (e) { /* fall through */ }
  }
  return (Array.isArray(mod.BENEFITS) ? mod.BENEFITS : []).filter(b => (b.products || []).some(x => products[x]));
}
const BANK_KINDS = [
  { value: 'suite', label: 'A banking Suite (account + credit card)' },
  { value: 'card', label: 'A credit card on its own' },
  { value: 'transaction', label: 'Only a transaction account' },
  { value: 'savings', label: 'Only savings' },
];

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
let uid = 0;

/* A group of real radio buttons in a fieldset: the legend is its question,
   and the arrow keys, the keyboard and screen readers all work. Returns
   { box, set(value) } so the caller can rebuild or move the choice. */
function radioGroup(parent, o) {
  const name = `dc-onb-${++uid}`;
  const box = el(parent, 'fieldset', 'dc-onb-group' + (o.cls ? ' ' + o.cls : ''));
  el(box, 'legend', 'dc-onb-legend', o.legend);
  if (o.hint) el(box, 'p', 'dc-onb-hint', o.hint);
  const list = el(box, 'div', 'dc-onb-opts' + (o.compact ? ' is-compact' : ''));
  const rows = [];
  const paint = v => rows.forEach(r => r.label.classList.toggle('is-on', r.value === v));
  for (const opt of o.options) {
    const label = el(list, 'label', 'dc-onb-opt');
    const input = el(label, 'input', 'dc-onb-in');
    input.type = 'radio';
    input.name = name;
    input.value = opt.value;
    input.checked = opt.value === o.value;
    const text = el(label, 'span', 'dc-onb-opt-text');
    el(text, 'span', 'dc-onb-opt-label', opt.label);
    if (opt.hint) el(text, 'span', 'dc-onb-opt-hint', opt.hint);
    input.addEventListener('change', () => { if (input.checked) { paint(opt.value); o.onChange(opt.value); } });
    rows.push({ label, input, value: opt.value });
  }
  paint(o.value);
  return { box, list };
}

function renderOnboarding(parent, ctx) {
  const { settings, budget, measured, statement, save, onDone } = ctx;
  const detected = ctx.detected || detectProducts(budget);
  const uidHead = `dc-onb-h-${++uid}`;

  /* ── what has been answered so far (written to settings on each Next) ── */
  const picked = resolveProducts(settings, detected);
  const banking = detectBanking(budget);
  const vit = resolveVitality(settings, detected, banking);
  const st = {
    step: 0,
    error: '',
    /* once the bank question has been answered, what is stored is the answer */
    bankKind: settings.bankKind || banking.kind || '',
    tier: (settings.bankKind ? settings.suite : banking.tier || settings.suite) || 'Black',
    vm: vit.money,
    vh: vit.health,
    vd: vit.drive,
    status: Object.assign({ money: 'Blue', health: 'Blue', drive: 'Blue' }, settings.status || {}),
    adults: showTyped((settings.members || {}).adults || 1),
    children: showTyped((settings.members || {}).children || 0),
    plan: (settings.health || {}).plan || '',
    planTouched: !!(settings.health || {}).plan,
    levels: {},
    busy: false,
  };

  const root = el(parent, 'section', 'dc-onb');
  root.setAttribute('aria-labelledby', uidHead);

  const top = el(root, 'div', 'dc-onb-top');
  const progress = el(top, 'div', 'dc-onb-progress');
  const stepText = el(progress, 'p', 'dc-onb-stepno');
  const dots = el(progress, 'ol', 'dc-onb-dots');
  dots.setAttribute('aria-hidden', 'true');
  const skip = button(top, 'dc-onb-skip', 'Skip for now', () => finish(true));

  const card = el(root, 'div', 'dc-onb-card');
  const nav = el(root, 'div', 'dc-onb-nav');

  /* ── the screens, in order, for what has been ticked so far ── */
  /* Vitality as answered so far; a programme only counts with its product */
  const vitNow = () => ({ money: !!(picked.bank && st.vm), health: !!(picked.health && st.vh), drive: !!(picked.insure && st.vd) });
  const benefitRows = () => benefitsFor(picked, settings, vitNow());
  const stepIds = () => {
    const ids = ['hello', 'products'];
    if (picked.bank) {
      ids.push('bankKind');
      if (st.bankKind !== 'savings') ids.push('tier');
      ids.push('vmQ');
      if (st.vm) ids.push('vmStatus');
    }
    if (picked.health) {
      ids.push('plan', 'household', 'vhQ');
      if (st.vh) ids.push('vhStatus');
    }
    if (picked.insure) {
      ids.push('vdQ');
      if (st.vd) ids.push('vdStatus');
    }
    if (benefitRows().length) ids.push('benefits');
    ids.push('done');
    return ids;
  };

  /* the tiers you can pick: a credit card on its own has no Purple */
  const tiers = () => {
    const all = suitesList();
    const own = st.bankKind === 'card' && all.some(t => t.creditCard) ? all.filter(t => t.creditCard) : all;
    return own.map(t => {
      const part = st.bankKind === 'card' && t.creditCard ? t.creditCard : t;
      return { value: t.id, label: part.label || t.label || t.id, hint: Number.isFinite(part.fee) ? `${money(part.fee)} a month in fees` : '' };
    });
  };
  /* what Vitality Money costs you a month on the chosen tier, when known */
  const vmFee = () => {
    const t = suitesList().find(x => x.id === st.tier);
    const part = t && (st.bankKind === 'card' ? t.creditCard : t);
    const v = part && part.feeParts && part.feeParts.vitalityMoney;
    return Number.isFinite(v) ? v : null;
  };

  const members = () => {
    const a = parseTyped(st.adults), c = parseTyped(st.children);
    const whole = n => n !== null && Number.isFinite(n) && Math.floor(n) === n;
    if (!whole(a) || a < 1) return { error: 'Type how many adults are on the medical aid, as a whole number like 2.' };
    if (!whole(c) || c < 0) return { error: 'Type how many children are on the medical aid, as a whole number like 0 or 2.' };
    return { adults: a, children: c };
  };

  const discoveryPlans = () => HEALTH_PLANS.concat(HEALTH_OWN).filter(p => p.discovery);

  /* ── writing answers ── */
  /* → true when the screen's answers were good and have been kept */
  function commit(id) {
    st.error = '';
    if (id === 'products') {
      settings.products = Object.assign({}, settings.products);
      for (const p of IDS) settings.products[p] = !!picked[p];
    } else if (id === 'bankKind') {
      settings.bankKind = st.bankKind || null;
    } else if (id === 'tier') {
      settings.suite = st.tier;
    } else if (id === 'vmQ') {
      settings.vitality = Object.assign({}, settings.vitality, { money: st.vm });
    } else if (id === 'vmStatus') {
      settings.status = Object.assign({}, settings.status, { money: st.status.money });
    } else if (id === 'plan') {
      settings.health = Object.assign({}, settings.health);
      if (st.plan) settings.health.plan = st.plan; else delete settings.health.plan;
    } else if (id === 'household') {
      const m = members();
      if (m.error) { st.error = m.error; return false; }
      settings.members = { adults: m.adults, children: m.children };
      /* the plan follows who is on the aid until you picked one yourself */
      settings.health = Object.assign({}, settings.health);
      if (st.plan) settings.health.plan = st.plan; else delete settings.health.plan;
    } else if (id === 'vhQ') {
      settings.vitality = Object.assign({}, settings.vitality, { health: st.vh });
    } else if (id === 'vhStatus') {
      settings.status = Object.assign({}, settings.status, { health: st.status.health });
    } else if (id === 'vdQ') {
      settings.vitality = Object.assign({}, settings.vitality, { drive: st.vd });
    } else if (id === 'vdStatus') {
      settings.status = Object.assign({}, settings.status, { drive: st.status.drive });
    } else if (id === 'benefits') {
      /* only a level changed away from the suggestion is kept; one put back
         on the suggestion is dropped, so the budget can suggest again */
      settings.benefits = Object.assign({}, settings.benefits);
      for (const b of benefitRows()) {
        if (st.levels[b.id] === undefined) continue;
        if (st.levels[b.id] === suggestedOf(b)) delete settings.benefits[b.id];
        else settings.benefits[b.id] = st.levels[b.id];
      }
    }
    return true;
  }

  /* what is shown for a benefit: your answer, else what the budget suggested, else "I use it" */
  function suggestedOf(b) {
    const s = statement && statement.benefits && statement.benefits[b.id];
    return (s && s.suggested) || 'full';
  }
  function levelOf(b) {
    if (st.levels[b.id]) return st.levels[b.id];
    const own = (settings.benefits || {})[b.id];
    return own || suggestedOf(b);
  }

  /* while a save is running: no second click, no Back */
  const navButtons = [];
  function setBusy(on) {
    st.busy = on;
    skip.disabled = on;
    for (const b of navButtons) b.disabled = on;
  }

  async function finish(skipped) {
    if (st.busy) return;
    setBusy(true);
    settings.onboarded = true;
    try { await save(); } finally { setBusy(false); }
    if (onDone) onDone(skipped === true);
  }

  async function next() {
    if (st.busy) return;
    const ids = stepIds();
    const id = ids[st.step];
    if (id === 'done') { await finish(false); return; }
    if (!commit(id)) { draw(true); return; }
    if (id !== 'hello') {
      setBusy(true);
      try { await save(); } finally { setBusy(false); }
    }
    st.step = Math.min(st.step + 1, stepIds().length - 1);
    draw(true);
  }

  function back() {
    if (st.busy || st.step === 0) return;
    st.error = '';
    st.step--;
    draw(true);
  }

  /* ── screens ── */
  const SCREENS = {
    hello(h, lead, body) {
      h.textContent = 'Is Discovery worth it for you?';
      lead.textContent = 'This adds up what each Discovery product costs you and what it gives back. It reads the bank statements you imported with the Budget plugin.';
      const list = el(body, 'ul', 'dc-onb-points');
      el(list, 'li', null, 'Nothing leaves your vault. No account, no sign in, no internet.');
      el(list, 'li', null, 'A benefit only counts when you use it. A gym discount is worth nothing if you never go.');
      el(list, 'li', null, 'A few short questions come first, so the numbers fit you. It takes about a minute.');
    },

    products(h, lead, body) {
      h.textContent = 'Which Discovery products do you have?';
      lead.textContent = 'We looked through your budget and ticked what we found. Change anything that is wrong.';
      const list = el(body, 'div', 'dc-onb-products');
      for (const id of IDS) {
        const d = detected[id] || {};
        const { row, box } = checkRow(list, 'dc-onb-opt dc-onb-prod dc-p-' + id, picked[id], on => {
          picked[id] = on;
          row.classList.toggle('is-on', on);
          drawProgress();
        });
        box.classList.add('dc-onb-in');
        row.classList.toggle('is-on', !!picked[id]);
        const text = el(row, 'span', 'dc-onb-opt-text');
        const name = el(text, 'span', 'dc-onb-opt-label');
        icon(name, ICONS[id], 'dc-onb-prod-icon');
        el(name, 'span', null, PRODUCT_NAMES[id]);
        if (d.why) el(text, 'span', 'dc-onb-opt-hint', d.why);
      }
      el(body, 'p', 'dc-onb-hint', 'Only the products you tick get a page, a place on the overview and a row in the comparison.');
    },

    bankKind(h, lead, body) {
      h.textContent = 'Which Discovery Bank product do you have?';
      lead.textContent = 'This decides which rewards and fees apply to you.';
      radioGroup(body, {
        legend: 'Your Discovery Bank product',
        hint: banking.kind ? banking.why : 'Your budget does not say which one it is, so choose.',
        options: BANK_KINDS,
        value: st.bankKind,
        onChange: v => { st.bankKind = v; drawProgress(); },
      });
    },

    tier(h, lead, body) {
      const isCard = st.bankKind === 'card';
      const opts = tiers();
      if (!opts.some(o => o.value === st.tier)) st.tier = opts.some(o => o.value === 'Black') ? 'Black' : opts[0].value;
      h.textContent = isCard ? 'Which tier is your credit card?' : 'Which tier is your Discovery Bank account?';
      lead.textContent = 'The tier sets your monthly fees and how many Miles you earn.';
      radioGroup(body, {
        legend: isCard ? 'Your credit card tier' : 'Your tier',
        hint: banking.tier ? 'Your monthly fees match the tier that is ticked. Change it if that is wrong.' : 'Your fees do not clearly match one tier, so check yours.',
        options: opts,
        value: st.tier,
        onChange: v => { st.tier = v; },
      });
    },

    vmQ(h, lead, body) {
      const fee = vmFee();
      h.textContent = 'Do you have Vitality Money?';
      lead.textContent = `Vitality Money is the add-on you pay for each month${fee === null ? '' : ` (${money(fee)} a month on your tier)`}. It unlocks the extra rewards on your bank account.`;
      yesNo(body, 'Vitality Money', st.vm, banking.vitalityMoney ? 'We saw Vitality Money premiums in your budget.' : 'We saw no Vitality Money premium in your budget.', v => { st.vm = v; drawProgress(); });
    },

    vmStatus(h, lead, body) {
      h.textContent = 'Your bank score';
      lead.textContent = 'Your Vitality Money status, from Blue up to Diamond. The higher it is, the more you earn.';
      statusGroup(body, 'money', 'Your Vitality Money status');
    },

    plan(h, lead, body) {
      h.textContent = 'Which Discovery Health plan are you on?';
      lead.textContent = 'The plan lets us tell the medical aid apart from Vitality and gap cover in the same debit order.';
      const m = members();
      const guess = m.error ? null : guessHealthPlan(budget, m, discoveryPlans());
      if (!st.planTouched && guess) st.plan = guess.id;
      const who = m.error ? '' : `for ${m.adults === 1 ? '1 adult' : m.adults + ' adults'}${m.children ? ' and ' + (m.children === 1 ? '1 child' : m.children + ' children') : ''}`;
      const options = discoveryPlans().map(p => {
        const price = m.error ? null : healthPremium(p, m);
        return { value: p.id, label: p.plan, hint: price === null ? 'Price not listed' : `${money(price)} a month ${who}` };
      });
      options.push({ value: '', label: 'I am not sure', hint: 'You can set it later on the Inputs page.' });
      radioGroup(body, {
        legend: 'Your Discovery Health plan',
        hint: guess ? guess.why : 'No Discovery Health debit order was found to match a plan to, so pick yours.',
        options,
        value: st.plan,
        onChange: v => { st.plan = v; st.planTouched = true; },
      });
    },

    household(h, lead, body) {
      h.textContent = 'Who is on the medical aid?';
      lead.textContent = 'The price of a plan depends on how many adults and children it covers.';
      const who = el(body, 'fieldset', 'dc-onb-group');
      el(who, 'legend', 'dc-onb-legend', 'People on the medical aid');
      const fields = el(who, 'div', 'dc-onb-fields');
      const note = el(body, 'p', 'dc-onb-hint dc-onb-guess');
      note.setAttribute('aria-live', 'polite');
      const refresh = () => {
        const m = members();
        const guess = m.error ? null : guessHealthPlan(budget, m, discoveryPlans());
        if (!st.planTouched && guess) st.plan = guess.id;
        note.textContent = guess && !st.planTouched ? guess.why : '';
      };
      const num = (label, key) => {
        const f = el(fields, 'label', 'dc-onb-field');
        el(f, 'span', 'dc-onb-field-label', label);
        const input = el(f, 'input', 'dc-onb-num');
        input.type = 'text';
        input.setAttribute('inputmode', 'decimal');
        input.autocomplete = 'off';
        input.value = st[key];
        input.addEventListener('input', () => { st[key] = input.value; input.removeAttribute('aria-invalid'); refresh(); });
        if (st.error && ((key === 'adults' && /adults/.test(st.error)) || (key === 'children' && /children/.test(st.error)))) input.setAttribute('aria-invalid', 'true');
        return input;
      };
      num('Adults', 'adults');
      num('Children', 'children');
      refresh();
    },

    vhQ(h, lead, body) {
      h.textContent = 'Do you have Vitality Health?';
      lead.textContent = 'Vitality Health is the wellness add-on to your Discovery Health plan. It unlocks rewards such as gym discounts and cash back on healthy food.';
      yesNo(body, 'Vitality Health', st.vh, '', v => { st.vh = v; drawProgress(); });
    },

    vhStatus(h, lead, body) {
      h.textContent = 'Your health score';
      lead.textContent = 'Your Vitality Health status, from Blue up to Diamond. The higher it is, the more you earn.';
      statusGroup(body, 'health', 'Your Vitality Health status');
    },

    vdQ(h, lead, body) {
      h.textContent = 'Do you have Vitality Drive?';
      lead.textContent = 'Vitality Drive is the add-on that comes with Discovery Insure. It earns fuel rewards and cash back for safe driving.';
      yesNo(body, 'Vitality Drive', st.vd, '', v => { st.vd = v; drawProgress(); });
    },

    vdStatus(h, lead, body) {
      h.textContent = 'Your car score';
      lead.textContent = 'Your Vitality Drive status, from Blue up to Diamond. The higher it is, the more you earn.';
      statusGroup(body, 'drive', 'Your Vitality Drive status');
    },

    benefits(h, lead, body) {
      h.textContent = 'Which of these do you actually use?';
      lead.textContent = 'A benefit only counts at what it is worth to you. We set each one from your budget. Change any that are wrong.';
      for (const b of benefitRows()) {
        const s = statement && statement.benefits && statement.benefits[b.id];
        const g = radioGroup(body, {
          legend: b.label,
          hint: [b.question, s && s.why].filter(Boolean).join(' '),
          options: LEVELS,
          value: levelOf(b),
          compact: true,
          cls: 'dc-onb-benefit',
          onChange: v => { st.levels[b.id] = v; },
        });
        g.box.setAttribute('data-benefit', b.id);
      }
    },

    done(h, lead, body) {
      h.textContent = 'You are all set';
      lead.textContent = 'The page now counts only what you told us you have and use. You can change any answer later on the Inputs page.';
      const names = IDS.filter(p => picked[p]).map(p => PRODUCT_NAMES[p]);
      const list = el(body, 'ul', 'dc-onb-points');
      el(list, 'li', null, names.length ? 'Your products: ' + names.join(', ') + '.' : 'You ticked no Discovery products, so there is nothing to work out yet. Go back and tick the ones you have.');
      if (picked.bank && st.bankKind) el(list, 'li', null, 'Your bank: ' + (BANK_KINDS.find(k => k.value === st.bankKind) || {}).label + (st.bankKind === 'savings' ? '.' : `, ${st.tier} tier.`));
      const v = vitNow();
      const vn = [v.money && 'Money', v.health && 'Health', v.drive && 'Drive'].filter(Boolean);
      if (picked.bank || picked.health || picked.insure) el(list, 'li', null, vn.length ? 'Your Vitality: ' + vn.join(', ') + '.' : 'You have no Vitality programme, so no Vitality rewards are counted.');
      const rows = benefitRows();
      if (rows.length) {
        const n = lv => rows.filter(b => levelOf(b) === lv).length;
        el(list, 'li', null, `Benefits you use: ${n('full')}. Sometimes: ${n('half')}. Not for you: ${n('none')}.`);
      }
    },
  };

  function yesNo(body, legend, value, hint, onChange) {
    radioGroup(body, {
      legend,
      hint,
      options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }],
      value: value ? 'yes' : 'no',
      compact: true,
      onChange: v => onChange(v === 'yes'),
    });
  }

  function statusGroup(body, key, legend) {
    radioGroup(body, {
      legend,
      hint: 'Not sure? Leave it on Blue and change it later.',
      options: STATUSES.map(s => ({ value: s, label: s })),
      value: st.status[key],
      compact: true,
      onChange: v => { st.status[key] = v; },
    });
  }

  /* ── drawing ── */
  /* "Step 2 of 5" and the dots; a tick on the products screen changes
     how many steps there are without redrawing the screen under the finger */
  function drawProgress() {
    const ids = stepIds();
    stepText.textContent = `Step ${st.step + 1} of ${ids.length}`;
    while (dots.firstChild) dots.removeChild(dots.firstChild);
    ids.forEach((_, i) => el(dots, 'li', 'dc-onb-dot' + (i < st.step ? ' is-done' : i === st.step ? ' is-now' : '')));
    skip.hidden = ids[st.step] === 'done';
  }

  /* focusHead: move the reader to the new screen's heading. */
  function draw(focusHead) {
    const ids = stepIds();
    if (st.step > ids.length - 1) st.step = ids.length - 1;
    const id = ids[st.step];
    drawProgress();

    while (card.firstChild) card.removeChild(card.firstChild);
    card.className = 'dc-onb-card' + (reduced() ? '' : ' is-animated');
    card.setAttribute('data-step', id);
    const h = el(card, 'h2', 'dc-onb-h');
    h.id = uidHead;
    h.tabIndex = -1;
    const lead = el(card, 'p', 'dc-onb-lead');
    const body = el(card, 'div', 'dc-onb-body');
    SCREENS[id](h, lead, body);
    if (st.error) {
      const e = el(card, 'p', 'dc-onb-error', st.error);
      e.setAttribute('role', 'alert');
    }

    while (nav.firstChild) nav.removeChild(nav.firstChild);
    navButtons.length = 0;
    if (st.step > 0) navButtons.push(button(nav, 'dc-onb-btn is-quiet', 'Back', back, 'arrow-left'));
    else el(nav, 'span', 'dc-onb-nav-gap');
    navButtons.push(button(nav, 'dc-onb-btn is-primary', id === 'hello' ? 'Start' : id === 'done' ? 'Show me the numbers' : 'Next', next, id === 'done' ? 'check' : 'arrow-right'));
    for (const b of navButtons) b.disabled = st.busy;

    if (focusHead) h.focus({ preventScroll: false });
  }

  draw(false);
  return root;
}

module.exports = { renderOnboarding };
