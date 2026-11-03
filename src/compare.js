'use strict';
/* Discovery's other products against the market: the medical aid, gap
   cover and car insurance, each next to what the same family would pay
   elsewhere. Pure — the published premiums live in the tables below, and a
   quote the user typed (settings.quotes['<product>.<id>'], R per month)
   always wins over them.

   What switching gives up is counted, not just the premium:
     medical aid  Vitality Health ends with Discovery Health (its value less
                  its premium), unless the plan is Discovery's own
     car          the Vitality Drive rewards; the Drive fee is already in
                  the Insure premium, so it stops with it
   Gap cover is premium against premium. */

/* Medical aid plans nearest Discovery's network plans, 2026 monthly
   contributions per main member / adult / child (savings portion
   included). discovery: Discovery's own plan, so Vitality Health stays.
   banded: income-banded, the top band shown. unconfirmed: read from a
   broker's copy of the scheme's table, not the scheme's own page.
   Sources fetched 21 Oct 2026. */
const DHMS = 'Discovery Health plan comparison 2026 (from 1 Apr 2026)';
/* Discovery Gap Core on an Essential plan, oldest member 0–54, a month:
   R317 for one person, R572 for a family (R171 and R295 on Classic plans).
   Discovery Gap Cover brochure 2026. */
const ESSENTIAL_GAP = { single: 317, family: 572 };
const HEALTH_PLANS = [
  { id: 'dhEssentialSmart', scheme: 'Discovery', plan: 'Essential Smart', discovery: true, main: 2161, adult: 2161, child: 2161, gapCore: ESSENTIAL_GAP, network: 'Smart network', dayToDay: 'Network GP visits, no savings', source: DHMS,
    cover: { doctors: 'limited', psychology: 'limited', babies: 'limited', checkups: 'yes' },
    coverNote: { doctors: 'Smart network GPs at R130 a visit; a smaller Personal Health Fund (R1 000 an adult, R500 a child) for anything else; specialists in hospital at 100% of the Discovery rate', psychology: 'Mental Health Care Programme and trauma counselling only', babies: 'maternity basket and two visits for a child under 2; no Nurture at Home; elective caesarean excluded', checkups: 'Screening and Prevention Benefit', hospital: 'Smart network: R12 650 upfront for a planned admission elsewhere' } },
  { id: 'dhEssentialSmartSaver', scheme: 'Discovery', plan: 'Essential Smart Saver', discovery: true, main: 2750, adult: 2350, child: 895, gapCore: ESSENTIAL_GAP, network: 'Smart network', dayToDay: 'Medical savings account', source: DHMS,
    cover: { doctors: 'yes', psychology: 'limited', babies: 'yes', checkups: 'yes' },
    coverNote: { doctors: 'Smart network GPs at R130 a visit; the savings account pays any GP or specialist; specialists in hospital at 100% of the Discovery rate', psychology: 'Mental Health Care Programme, then savings', babies: 'maternity basket and two visits for a child under 2', checkups: 'Screening and Prevention Benefit; consultations from savings', hospital: 'Smart network: R12 650 upfront for a planned admission elsewhere' } },
  { id: 'dhClassicDeltaCore', scheme: 'Discovery', plan: 'Classic Delta Core', discovery: true, main: 3126, adult: 2465, child: 1250, network: 'Delta network', dayToDay: 'Hospital plan only', source: DHMS,
    cover: { doctors: 'limited', psychology: 'limited', babies: 'yes', checkups: 'limited' },
    coverNote: { doctors: 'hospital plan: GPs and specialists out of hospital only from the Personal Health Fund', psychology: 'Mental Health Care Programme; 15 PMB consultations', babies: 'maternity basket; two visits for a child under 2', checkups: 'Health Check, mammogram, Pap smear; flu only if pregnant, 65+ or chronic', hospital: 'Delta network: R11 100 upfront for a planned admission elsewhere' } },
  { id: 'bonPrime', scheme: 'Bonitas', plan: 'BonPrime', main: 3255, adult: 2546, child: 1035, network: 'Network hospitals', dayToDay: 'Medical savings account', source: 'Bonitas Annexure A 2026 (from 1 Jan 2026)',
    cover: { doctors: 'limited', psychology: 'limited', babies: 'yes', checkups: 'yes' },
    coverNote: { doctors: 'GPs and specialists from savings; specialists need a GP referral', psychology: 'from savings, plus the R14 400 Mental Health Programme', babies: 'maternity, two baby visits under 2, EPI immunisations', checkups: 'flu, Pap smear, mammogram, wellness screening', hospital: 'network hospitals: 30% co-payment elsewhere' } },
  { id: 'bonEssentialSelect', scheme: 'Bonitas', plan: 'BonEssential Select', main: 2345, adult: 1718, child: 774, network: 'Network hospitals', dayToDay: 'Hospital plan, screenings only', source: 'Bonitas Annexure A 2026 (from 1 Jan 2026)',
    cover: { doctors: 'no', psychology: 'limited', babies: 'no', checkups: 'limited' },
    coverNote: { doctors: 'no GP or specialist cover out of hospital', psychology: 'PMBs, plus the R14 400 Mental Health Programme', babies: 'maternity only: no baby visits under 2, no immunisations', checkups: 'no child immunisations', hospital: 'network hospitals: 30% co-payment elsewhere' } },
  { id: 'bonStandardSelect', scheme: 'Bonitas', plan: 'Standard Select', main: 5431, adult: 4700, child: 1590, network: 'Network hospitals', dayToDay: 'Day-to-day limit, nominated network GPs', source: 'Bonitas Annexure A 2026 (from 1 Jan 2026)',
    cover: { doctors: 'limited', psychology: 'yes', babies: 'yes', checkups: 'yes' },
    coverNote: { doctors: 'two nominated network GPs each; specialists on referral from a day-to-day limit', psychology: 'R20 310 a family in and out of hospital', babies: '12 antenatal visits, four baby visits under 2, private immunisations', checkups: 'flu, Pap smear, mammogram, lipogram', hospital: 'network hospitals: 30% co-payment elsewhere' } },
  { id: 'momIngwe', scheme: 'Momentum', plan: 'Ingwe (Ingwe network)', banded: true, maxChildren: 0, main: 3590, adult: 3590, child: 1058, network: 'Ingwe network', dayToDay: 'Unlimited network GP visits; income R23 501+ band; every child charged', source: 'Momentum Medical Scheme 2026 brochure (Aon copy, pending CMS approval)', unconfirmed: true,
    cover: { doctors: 'limited', psychology: 'no', babies: 'limited', checkups: 'limited' },
    coverNote: { doctors: 'Ingwe network GPs only; two specialist visits a family, pre-authorised', psychology: 'PMBs only, at State facilities', babies: 'one paediatrician visit in year one; emergency caesareans only', checkups: 'no mammogram listed', hospital: 'Ingwe network hospitals: 30% co-payment elsewhere' } },
  { id: 'momCustom', scheme: 'Momentum', plan: 'Custom (Associated)', main: 2585, adult: 1956, child: 916, network: 'Associated hospitals', dayToDay: 'Hospital plan; HealthSaver optional', source: 'Momentum Medical Scheme 2026 brochure (Aon copy, pending CMS approval)', unconfirmed: true,
    cover: { doctors: 'no', psychology: 'no', babies: 'yes', checkups: 'yes' },
    coverNote: { doctors: 'no out-of-hospital GP or specialist cover (HealthSaver+ only)', psychology: 'out of hospital only from HealthSaver+', babies: '12 antenatal visits, two paediatrician visits in year one, immunisations to 6', checkups: 'mammogram, Pap/HPV, health assessment', hospital: 'Associated hospitals: 30% co-payment plus R2 000 elsewhere' } },
  { id: 'medValuePrime', scheme: 'Medshield', plan: 'MediValue Prime', main: 3207, adult: 2802, child: 906, network: 'Prime network', dayToDay: 'Day-to-day limit', source: 'Medshield 2026 rates (Aon copy, pending CMS approval)', unconfirmed: true,
    cover: { doctors: 'limited', psychology: 'limited', babies: 'yes', checkups: 'yes' },
    coverNote: { doctors: 'any GP from a shared day-to-day limit; two specialist visits without referral', psychology: 'from the shared day-to-day limit', babies: 'maternity, two paediatrician visits under 2, State vaccines', checkups: 'flu, Pap smear, mammogram', hospital: 'Prime network: 30% upfront co-payment elsewhere' } },
  { id: 'medPlusCompact', scheme: 'Medshield', plan: 'MediPlus Compact', main: 4938, adult: 3522, child: 1113, network: 'Compact network', dayToDay: 'Day-to-day limit', source: 'Medshield 2026 rates (Aon copy, pending CMS approval)', unconfirmed: true,
    cover: { doctors: 'limited', psychology: 'yes', babies: 'yes', checkups: 'yes' },
    coverNote: { doctors: 'network GPs compulsory: two other visits a family, then 40% co-payment', psychology: 'R40 300 a family, counselling included', babies: '12 antenatal visits, two paediatrician visits under 2', checkups: 'flu, Pap smear, mammogram', hospital: 'Compact network: 30% upfront co-payment elsewhere' } },
  { id: 'fedFlexi2Elect', scheme: 'Fedhealth', plan: 'flexiFED 2Elect', main: 3810, adult: 3403, child: 1131, network: 'Elect network', dayToDay: 'Savings, threshold, network GP', source: 'Fedhealth combined contributions 2026 (Aon copy)', unconfirmed: true,
    cover: { doctors: 'limited', psychology: 'limited', babies: 'yes', checkups: 'yes' },
    coverNote: { doctors: 'GPs and specialists from savings, then network GPs at a 20% co-payment', psychology: '15 PMB consultations, then savings; no mental health programme', babies: '8 antenatal visits, two scans, one paediatrician visit, immunisations to 12', checkups: 'flu for everyone, Pap smear, mammogram', hospital: 'any private hospital, but R15 950 excess on every planned admission' } },
  { id: 'fedMyFed', scheme: 'Fedhealth', plan: 'myFED', banded: true, main: 4052, adult: 4052, child: 1281, network: 'Network hospitals', dayToDay: 'Network GP; household income R21 652+ band', source: 'Fedhealth combined contributions 2026 (Aon copy)', unconfirmed: true,
    cover: { doctors: 'limited', psychology: 'no', babies: 'limited', checkups: 'limited' },
    coverNote: { doctors: 'one nominated network GP; two specialist visits a family', psychology: 'two GP mental-health consultations only', babies: 'antenatal with the GP only; no paediatrician visits listed', checkups: 'no Pap smear or mammogram listed', hospital: 'myFED network hospitals: 30% co-payment elsewhere (list not published)' } },
  { id: 'bestBeat2Net', scheme: 'Bestmed', plan: 'Beat2 Network', main: 2775, adult: 2156, child: 1167, network: 'Network hospitals', dayToDay: 'Medical savings account', source: 'Bestmed Annexure A 2026 (from 1 Jan 2026)',
    cover: { doctors: 'limited', psychology: 'limited', babies: 'limited', checkups: 'yes' },
    coverNote: { doctors: 'any GP, from savings', psychology: 'from savings, plus 15 PMB sessions', babies: 'maternity from risk; baby visits from savings', checkups: 'flu, mammogram, Pap smear, child immunisations', hospital: 'network hospitals: up to R15 025 co-payment elsewhere' } },
  { id: 'bestBeat3Net', scheme: 'Bestmed', plan: 'Beat3 Network', main: 4062, adult: 2898, child: 1434, network: 'Network hospitals', dayToDay: 'Medical savings account', source: 'Bestmed Annexure A 2026 (from 1 Jan 2026)',
    cover: { doctors: 'limited', psychology: 'limited', babies: 'limited', checkups: 'yes' },
    coverNote: { doctors: 'any GP, from larger savings', psychology: 'from savings, plus 15 PMB sessions', babies: '9 antenatal visits; baby visits from savings', checkups: 'flu, mammogram, Pap smear, child immunisations', hospital: 'network hospitals: up to R15 025 co-payment elsewhere' } },
];
/* Every other Discovery Health plan you might be on, for the needs table
   (settings.health.plan) and for guessing your plan from your debit order
   (detect.js guessHealthPlan, which reads HEALTH_PLANS and HEALTH_OWN).
   Total monthly contributions from 1 Apr 2026 (savings portion included),
   per main member / adult / child, from Discovery's own 2026 plan
   comparison. KeyCare plans are priced by household income, one row per
   band. Cover grades are only filled in where a plan guide was read;
   the rest show as unknown until you set them. */
const HEALTH_OWN = [
  { id: 'dhClassicSmart', scheme: 'Discovery', plan: 'Classic Smart', discovery: true, main: 3018, adult: 2381, child: 1205, dayToDay: 'Smart network GPs, no savings', source: DHMS,
    cover: { doctors: 'limited', psychology: 'limited', babies: 'yes', checkups: 'yes' },
    coverNote: { doctors: 'unlimited Smart network GP visits at R75; anything else from the Personal Health Fund (R2 000 an adult, R1 000 a child); specialists in hospital up to 200% of the Discovery rate', psychology: 'Mental Health Care Programme, trauma counselling and two maternity consults; otherwise the Personal Health Fund', babies: '8 antenatal visits, two scans, two visits for a child under 2, Nurture at Home', checkups: 'Screening and Prevention Benefit' } },
  { id: 'dhExecutive', scheme: 'Discovery', plan: 'Executive', discovery: true, main: 12338, adult: 12338, child: 2358, dayToDay: 'Medical savings account, then Above Threshold Benefit (unlimited)', source: DHMS },
  { id: 'dhClassicComprehensive', scheme: 'Discovery', plan: 'Classic Comprehensive', discovery: true, main: 10037, adult: 9492, child: 2002, dayToDay: 'Medical savings account, then Above Threshold Benefit', source: DHMS },
  { id: 'dhClassicSmartComprehensive', scheme: 'Discovery', plan: 'Classic Smart Comprehensive', discovery: true, main: 8576, adult: 7920, child: 2002, dayToDay: 'Medical savings account, then Above Threshold Benefit', source: DHMS },
  { id: 'dhClassicPriority', scheme: 'Discovery', plan: 'Classic Priority', discovery: true, main: 6198, adult: 4889, child: 2478, dayToDay: 'Medical savings account, then Above Threshold Benefit', source: DHMS },
  { id: 'dhEssentialPriority', scheme: 'Discovery', plan: 'Essential Priority', discovery: true, main: 5327, adult: 4189, child: 2127, dayToDay: 'Medical savings account', source: DHMS },
  { id: 'dhClassicSaver', scheme: 'Discovery', plan: 'Classic Saver', discovery: true, main: 4850, adult: 3825, child: 1943, dayToDay: 'Medical savings account', source: DHMS },
  { id: 'dhClassicDeltaSaver', scheme: 'Discovery', plan: 'Classic Delta Saver', discovery: true, main: 3875, adult: 3062, child: 1556, dayToDay: 'Medical savings account; Delta network', source: DHMS },
  { id: 'dhEssentialSaver', scheme: 'Discovery', plan: 'Essential Saver', discovery: true, main: 3886, adult: 2914, child: 1556, dayToDay: 'Medical savings account', source: DHMS },
  { id: 'dhEssentialDeltaSaver', scheme: 'Discovery', plan: 'Essential Delta Saver', discovery: true, main: 3099, adult: 2339, child: 1243, dayToDay: 'Medical savings account; Delta network', source: DHMS },
  { id: 'dhCoastalSaver', scheme: 'Discovery', plan: 'Coastal Saver', discovery: true, main: 4098, adult: 3082, child: 1648, dayToDay: 'Medical savings account; coastal hospitals', source: DHMS },
  { id: 'dhClassicSmartSaver', scheme: 'Discovery', plan: 'Classic Smart Saver', discovery: true, main: 3350, adult: 2840, child: 1400, dayToDay: 'Medical savings account; Smart network', source: DHMS },
  { id: 'dhEssentialDynamicSmart', scheme: 'Discovery', plan: 'Essential Dynamic Smart', discovery: true, main: 1797, adult: 1797, child: 1797, dayToDay: 'Smart network GPs, no savings', source: DHMS },
  { id: 'dhActiveSmart', scheme: 'Discovery', plan: 'Active Smart', discovery: true, main: 1350, adult: 1350, child: 1350, dayToDay: 'Smart network GPs, no savings', source: DHMS },
  { id: 'dhClassicCore', scheme: 'Discovery', plan: 'Classic Core', discovery: true, main: 3905, adult: 3083, child: 1562, dayToDay: 'Hospital plan only', source: DHMS },
  { id: 'dhEssentialCore', scheme: 'Discovery', plan: 'Essential Core', discovery: true, main: 3356, adult: 2517, child: 1347, dayToDay: 'Hospital plan only', source: DHMS },
  { id: 'dhEssentialDeltaCore', scheme: 'Discovery', plan: 'Essential Delta Core', discovery: true, main: 2681, adult: 2018, child: 1076, dayToDay: 'Hospital plan only; Delta network', source: DHMS },
  { id: 'dhCoastalCore', scheme: 'Discovery', plan: 'Coastal Core', discovery: true, main: 3250, adult: 2438, child: 1291, dayToDay: 'Hospital plan only; coastal hospitals', source: DHMS },
  { id: 'dhKeyCarePlus1', scheme: 'Discovery', plan: 'KeyCare Plus (income up to R10 250)', discovery: true, banded: true, main: 1961, adult: 1961, child: 713, dayToDay: 'KeyCare network GPs', source: DHMS },
  { id: 'dhKeyCarePlus2', scheme: 'Discovery', plan: 'KeyCare Plus (income R10 251 – R16 600)', discovery: true, banded: true, main: 2695, adult: 2695, child: 760, dayToDay: 'KeyCare network GPs', source: DHMS },
  { id: 'dhKeyCarePlus3', scheme: 'Discovery', plan: 'KeyCare Plus (income R16 601 or more)', discovery: true, banded: true, main: 3980, adult: 3980, child: 1064, dayToDay: 'KeyCare network GPs', source: DHMS },
  { id: 'dhKeyCareCore1', scheme: 'Discovery', plan: 'KeyCare Core (income up to R10 250)', discovery: true, banded: true, main: 1490, adult: 1490, child: 390, dayToDay: 'Hospital plan only; KeyCare network', source: DHMS },
  { id: 'dhKeyCareCore2', scheme: 'Discovery', plan: 'KeyCare Core (income R10 251 – R16 600)', discovery: true, banded: true, main: 1859, adult: 1859, child: 461, dayToDay: 'Hospital plan only; KeyCare network', source: DHMS },
  { id: 'dhKeyCareCore3', scheme: 'Discovery', plan: 'KeyCare Core (income R16 601 or more)', discovery: true, banded: true, main: 2845, adult: 2845, child: 645, dayToDay: 'Hospital plan only; KeyCare network', source: DHMS },
  { id: 'dhKeyCareStart1', scheme: 'Discovery', plan: 'KeyCare Start (income up to R10 950)', discovery: true, banded: true, main: 1436, adult: 1436, child: 875, dayToDay: 'One chosen KeyCare Start GP', source: DHMS },
  { id: 'dhKeyCareStart2', scheme: 'Discovery', plan: 'KeyCare Start (income R10 951 – R16 550)', discovery: true, banded: true, main: 2107, adult: 2107, child: 947, dayToDay: 'One chosen KeyCare Start GP', source: DHMS },
  { id: 'dhKeyCareStart3', scheme: 'Discovery', plan: 'KeyCare Start (income R16 551 – R25 150)', discovery: true, banded: true, main: 3306, adult: 3306, child: 992, dayToDay: 'One chosen KeyCare Start GP', source: DHMS },
  { id: 'dhKeyCareStart4', scheme: 'Discovery', plan: 'KeyCare Start (income R25 151 or more)', discovery: true, banded: true, main: 3765, adult: 3765, child: 1024, dayToDay: 'One chosen KeyCare Start GP', source: DHMS },
  { id: 'dhKeyCareStartRegional1', scheme: 'Discovery', plan: 'KeyCare Start Regional (income up to R10 950)', discovery: true, banded: true, main: 1278, adult: 1278, child: 769, dayToDay: 'One chosen KeyCare Start GP', source: DHMS },
  { id: 'dhKeyCareStartRegional2', scheme: 'Discovery', plan: 'KeyCare Start Regional (income R10 951 – R16 550)', discovery: true, banded: true, main: 1932, adult: 1932, child: 869, dayToDay: 'One chosen KeyCare Start GP', source: DHMS },
  { id: 'dhKeyCareStartRegional3', scheme: 'Discovery', plan: 'KeyCare Start Regional (income R16 551 – R25 150)', discovery: true, banded: true, main: 3011, adult: 3011, child: 922, dayToDay: 'One chosen KeyCare Start GP', source: DHMS },
  { id: 'dhKeyCareStartRegional4', scheme: 'Discovery', plan: 'KeyCare Start Regional (income R25 151 or more)', discovery: true, banded: true, main: 3430, adult: 3430, child: 961, dayToDay: 'One chosen KeyCare Start GP', source: DHMS },
];

/* Gap cover, 2026 monthly premium for a family whose oldest member is
   under 45 (most are priced by the oldest member's age — type your quote
   if you are older). Discovery Gap Cover is for Discovery Health members
   only; every other one takes any medical scheme. Shortfall multiples are
   not like for like: Discovery's sit on top of the plan's own rate, the
   others are the total. Sources fetched 21 Oct 2026. */
const GAP_PLANS = [
  { id: 'dgComprehensive', provider: 'Discovery', plan: 'Gap Comprehensive', discovery: true, monthly: 457, cover: 'Up to 500% on top of the plan (Classic plans, oldest 0–54)', source: 'Discovery Gap Cover brochure 2026' },
  { id: 'turnberryLaunch', provider: 'Turnberry', plan: 'Launch', monthly: 185, cover: 'Up to 350%; one co-payment a year up to R4 400', source: 'Turnberry brochure 2026' },
  { id: 'stratumMeridian400', provider: 'Stratum', plan: 'Meridian400', monthly: 352, cover: '400%; co-payments covered', source: 'Stratum 2026 individual product range' },
  { id: 'stratumCompact300', provider: 'Stratum', plan: 'Compact300', monthly: 439, cover: '300%; co-payments up to R20 000', source: 'Stratum 2026 individual product range' },
  { id: 'ambledownPhi', provider: 'Ambledown', plan: 'Origin Phi', monthly: 262, cover: 'Entry option, no co-payment cover (oldest 28–44)', source: 'Ambledown Origin series 2026 (Aon copy)', unconfirmed: true },
  { id: 'ambledownSigma', provider: 'Ambledown', plan: 'Origin Sigma', monthly: 493, cover: 'Co-payments covered (oldest 28–44)', source: 'Ambledown Origin series 2026 (Aon copy)', unconfirmed: true },
  { id: 'siragoGapCore', provider: 'Sirago', plan: 'Gap Core', monthly: 457, cover: 'Up to 350%; co-payments covered', source: 'Sirago broker update 2026' },
  { id: 'turnberrySynergy', provider: 'Turnberry', plan: 'Synergy', monthly: 494, cover: '500%; co-payments and sub-limits', source: 'Turnberry brochure 2026' },
  { id: 'zestOptimal', provider: 'Zestlife', plan: 'Optimal', monthly: 495, cover: '400%; co-payments (everyone under 42)', source: 'Zestlife gap cover brochure 2026' },
  { id: 'sanlamComprehensive', provider: 'Sanlam', plan: 'Gap Comprehensive', monthly: 583, cover: '6× tariff; co-payments covered (main member 30–45)', source: 'Sanlam Gap 2026 option form (Aon copy)', unconfirmed: true },
];
/* Car insurers. rewardPct is the cash back a claim-free year earns,
   spread over the years it takes (10% after three claim-free years =
   3,33% a year); a programme that depends on driving less, or is an extra
   paid-for add-on, counts 0 and is named in the note. Sources fetched
   21 Oct 2026. */
const INSURERS = [
  { id: 'outsurance', name: 'OUTsurance', rewardPct: 10 / 3, rewardNote: 'OUTbonus: 10% of premiums back after 3 claim-free years', source: 'outsurance.co.za/car-insurance (OUTbonus), fetched 21 Oct 2026' },
  { id: 'miway', name: 'MiWay', rewardPct: 5, rewardNote: 'Micashback: 10% of premiums every 2 claim-free years', source: 'miway.co.za/micashback, fetched 21 Oct 2026' },
  { id: 'santam', name: 'Santam', rewardPct: 10 / 3, rewardNote: 'CashBack: 10% of premiums after 3 claim-free years (from 1 Jul 2026)', source: 'santam.co.za blog: Santam CashBack (Jul 2026)' },
  { id: 'kingprice', name: 'King Price', rewardPct: 0, rewardNote: 'Premium drops as the car ages; up to 20% multi-car discount (in the quote)', source: 'kingprice.co.za blog, 27 May 2026' },
  { id: 'momentum', name: 'Momentum Insure', rewardPct: 0, rewardNote: 'Safety Returns: up to 30% of premiums back a year by driving points — not counted', source: 'momentum.co.za Safety Returns, fetched 21 Oct 2026' },
  { id: 'naked', name: 'Naked', rewardPct: 0, rewardNote: 'No claim-free refund; CoverPause cuts days the car is parked', source: 'naked.insure (CoverPause; 2026 cost guide)' },
  { id: 'pineapple', name: 'Pineapple', rewardPct: 0, rewardNote: 'Up to 30% back in months you drive 300 km or less — not counted', source: 'pineapple.co.za/car-insurance, fetched 21 Oct 2026' },
  { id: 'dialdirect', name: 'Dialdirect', rewardPct: 0, rewardNote: 'Payback Bonus is an add-on you pay extra for — not counted', source: 'dialdirect.co.za/car-insurance, fetched 21 Oct 2026' },
  { id: 'budget', name: 'Budget Insurance', rewardPct: 0, rewardNote: 'Cash back after 2 years, rate not published — not counted', source: 'budgetinsurance.co.za/car-insurance, fetched 21 Oct 2026' },
];

/* Individual risk-cover insurers to quote against an employer scheme.
   None publishes a price for life, severe illness and income protection
   together, so every row waits for a quote; the discounts named are taken
   off inside the quote, so they are not counted again. Sources fetched
   22 Oct 2026. */
const LIFE_OFFERS = [
  { id: 'discoveryLife', name: 'Discovery Life (individual)', rewardNote: 'Integrator discounts up to 48% with Vitality, Health or Bank; PayBack up to 50% of premiums', source: 'discovery.co.za/life-insurance/discounts-and-paybacks, fetched 22 Oct 2026' },
  { id: 'momentumMyriad', name: 'Momentum Myriad', rewardNote: 'LifeReturns: up to 35% off after a health assessment', source: 'momentum.co.za life cover (2026)' },
  { id: 'brightrock', name: 'BrightRock', rewardNote: 'Needs-matched cover, no reward programme', source: 'brightrock.co.za, fetched 22 Oct 2026' },
  { id: 'oldmutual', name: 'Old Mutual', source: 'oldmutual.co.za (quote only), fetched 22 Oct 2026' },
  { id: 'sanlam', name: 'Sanlam', rewardNote: 'Indie Wealth Bonus invests up to 100% of the premium (not counted)', source: 'sanlam.co.za (quote only), fetched 22 Oct 2026' },
  { id: 'liberty', name: 'Liberty', source: 'liberty.co.za (quote only), fetched 22 Oct 2026' },
  { id: 'outsuranceLife', name: 'OUTsurance Life', rewardNote: 'Life cover from R132 a month (published "from" price)', source: 'outsurance.co.za/life-insurance, fetched 22 Oct 2026' },
  { id: 'bidvestLife', name: 'Bidvest Life (FMI)', rewardNote: 'Income protection specialist', source: 'bidvestlife.co.za (quote only), fetched 22 Oct 2026' },
];
/* Individual life cover alone, R per month per R1 000 000, healthy male
   non-smoker in an office job, by age band: a broker's published range,
   the only 2026 one. Smokers pay 50–100% more. Severe illness and income
   protection come on top and have no published 2026 figure. */
const LIFE_BENCHMARK = { source: 'Peter Pyburn (FSP 2995), "What life insurance will cost", updated 10 Aug 2026', bands: [{ from: 38, to: 42, low: 240, high: 350 }, { from: 43, to: 47, low: 300, high: 450 }] };
/* Household contents insurers. per100k: R a month per R100 000 of
   contents, worked out from a published example (premium ÷ contents);
   the rest publish no price, so they wait for a quote. Premiums depend on
   the suburb, security and excess. rewardPct as for INSURERS. Sources
   fetched 22 Oct 2026. */
const HOME_INSURERS = [
  { id: 'kingprice', name: 'King Price', per100k: 620 / 6.5, rewardNote: 'Example: R620 a month for R650 000, R3 000 excess (Centurion); a bundle with the car "may" earn a discount', source: 'King Price blog, best home contents insurance (27 May 2026)', unconfirmed: true },
  { id: 'discovery', name: 'Discovery Insure', rewardNote: 'Alongside your car policy; no-average guarantee after an inventory assessment', source: 'discovery.co.za/car-and-home-insurance/home-insurance, fetched 22 Oct 2026' },
  { id: 'iwyze', name: 'iWYZE (Old Mutual)', rewardNote: 'Car and contents together save 5% on average', source: 'iwyze.co.za/home/bundle-and-save (23 Sep 2026)' },
  { id: 'budget', name: 'Budget Insurance', rewardNote: '10–15% off car and home together', source: 'budgetinsurance.co.za/home-insurance, fetched 22 Oct 2026' },
  { id: 'outsurance', name: 'OUTsurance', rewardPct: 10 / 3, rewardNote: 'OUTbonus: 10% back after 3 claim-free years', source: 'outsurance.co.za/home-insurance, fetched 22 Oct 2026' },
  { id: 'dialdirect', name: 'Dialdirect', rewardPct: 25 / 4, rewardNote: 'Payback Bonus: 25% back after 4 claim-free years', source: 'dialdirect.co.za home insurance, fetched 22 Oct 2026' },
  { id: 'miway', name: 'MiWay', source: 'miway.co.za (quote only), fetched 22 Oct 2026' },
  { id: 'santam', name: 'Santam', source: 'santam.co.za (quote only), fetched 22 Oct 2026' },
  { id: 'naked', name: 'Naked', source: 'naked.insure (quote only), fetched 22 Oct 2026' },
  { id: 'pineapple', name: 'Pineapple', rewardNote: '"My Things" for contents under R100 000', source: 'pineapple.co.za (quote only), fetched 22 Oct 2026' },
];
/* What contents cover costs across the market, R a month per R100 000:
   King Price's "R400–R900 for R500 000–R800 000" and a broker's "R150–R400
   for R300 000" put it at about R50–R135. */
const HOME_RANGE = { low: 50, high: 135, source: 'King Price blog (27 May 2026); InsureEasy Brokers via Daily Investor (15 Mar 2025)' };

const num = v => v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v));

/* What a family needs a medical aid to cover, graded per plan (yes,
   limited, no, unknown) in HEALTH_PLANS[].cover. "hospital" is the
   hospital you use, so it is yours to set (settings.health.cover[plan]
   .hospital); any grade you set wins over the table's. A plan graded
   "no" on a need you ticked is not like for like. */
const NEEDS = [
  { id: 'doctors', label: 'Your doctors', short: 'GP', hint: 'GP visits out of hospital, and specialists such as a gynaecologist or paediatrician' },
  { id: 'psychology', label: 'Psychology', short: 'Psy', hint: 'Psychologist or counsellor sessions out of hospital' },
  { id: 'babies', label: 'Babies and children', short: 'Baby', hint: 'Maternity, and GP or paediatrician visits and immunisations for young children' },
  { id: 'checkups', label: 'Check-ups', short: 'Check', hint: 'Screening and prevention paid by the scheme, not from savings' },
  { id: 'hospital', label: 'Your hospital', short: 'Hosp', hint: 'The hospital you use is in the plan\'s network for planned admissions' },
];
const GRADES = ['yes', 'limited', 'no', 'unknown'];

function coverOf(plan, settings) {
  const typed = (((settings && settings.health) || {}).cover || {})[plan.id] || {};
  const out = {};
  for (const n of NEEDS) {
    const t = typed[n.id], g = (plan.cover || {})[n.id];
    out[n.id] = GRADES.includes(t) ? t : GRADES.includes(g) ? g : 'unknown';
  }
  return out;
}

/* the needs ticked (all of them unless settings.health.needs says) */
function needsOf(settings) {
  const n = ((settings && settings.health) || {}).needs;
  return Array.isArray(n) ? NEEDS.filter(x => n.includes(x.id)) : NEEDS.slice();
}

/* Monthly premium for a family: the main member, every other adult, and
   the children up to the scheme's maximum charged (3 unless it says).
   null when a rate the family needs is not published. */
function healthPremium(plan, members) {
  const adults = Math.max(1, Math.floor(Number((members || {}).adults) || 1));
  const children = Math.max(0, Math.floor(Number((members || {}).children) || 0));
  const max = plan.maxChildren === undefined ? 3 : plan.maxChildren;
  const charged = max > 0 ? Math.min(children, max) : children;
  if (!num(plan.main) || (adults > 1 && !num(plan.adult)) || (charged > 0 && !num(plan.child))) return null;
  return plan.main + (adults - 1) * (plan.adult || 0) + charged * (plan.child || 0);
}

function quoteOf(settings, key) {
  const q = settings && settings.quotes ? settings.quotes[key] : undefined;
  return num(q) ? Number(q) : null;
}

/* Priced rows first, best gain first; unpriced rows keep their order. */
function byGain(rows) {
  return rows.map((r, i) => ({ r, i })).sort((a, b) => {
    const ga = a.r.gainIfSwitch, gb = b.r.gainIfSwitch;
    if (ga === null && gb === null) return a.i - b.i;
    if (ga === null) return 1;
    if (gb === null) return -1;
    return gb - ga;
  }).map(x => x.r);
}

/* health: the Health product (products.js) — paid, medicalYear,
   vitalityYear, vitValue, all per year. */
function compareHealth(health, settings, plans = HEALTH_PLANS) {
  if (!health || !(health.paid > 0)) return null;
  const members = (settings && settings.members) || {};
  /* Leaving Discovery Health ends Vitality Health: its premium stops (when
     it was split out of the debit) and its rewards go. */
  const vitalityNet = (health.vitValue || 0) - (health.vitalityYear || 0);
  /* Whether Vitality's premium was split out of the debit: when it was not,
     vitalityNet holds the rewards only (the premium stays inside the
     medical aid figure), so nothing may say what Vitality costs. */
  const vitalityKnown = health.vitalityKnown !== false;
  /* The others are priced at today's rates, so Discovery is too: the
     contribution typed for the debit split, else your plan's published
     price the split used, else the window's average. */
  const typedMedical = num(((settings && settings.bill) || {}).medical) ? Number(settings.bill.medical) * 12
    : num(health.medicalMonthly) && health.medicalMonthly > 0 ? Number(health.medicalMonthly) * 12 : null;
  const medicalYear = typedMedical !== null ? typedMedical : health.medicalYear;
  const current = { annual: medicalYear, monthly: medicalYear / 12 };
  const needs = needsOf(settings);
  const gapNow = num(((settings && settings.bill) || {}).gap) ? Number(settings.bill.gap) : 0;
  const single = healthPremium({ main: 1, adult: 1, child: 1 }, members) === 1;
  const rows = plans.map(p => {
    const typed = quoteOf(settings, 'health.' + p.id);
    const monthly = typed !== null ? typed : healthPremium(p, members);
    const priced = monthly !== null;
    const vitalityLost = p.discovery ? 0 : vitalityNet;
    /* Discovery Gap Cover costs more on some Discovery plans: moving there
       moves your gap cover premium too */
    const gapExtra = p.gapCore && gapNow > 0 ? Math.max(0, (single ? p.gapCore.single : p.gapCore.family) - gapNow) * 12 : 0;
    const cover = coverOf(p, settings);
    const misses = needs.filter(n => cover[n.id] === 'no').map(n => n.id);
    const unsure = needs.filter(n => cover[n.id] === 'unknown').map(n => n.id);
    return {
      ...p, monthly, annual: priced ? monthly * 12 : null, quoted: typed !== null, vitalityLost,
      gainIfSwitch: priced ? medicalYear - monthly * 12 - vitalityLost - gapExtra : null, gapExtra,
      cover, misses, unsure, likeForLike: misses.length === 0,
    };
  });
  /* your own plan's grades, for the needs table */
  const ownId = settings && settings.health && settings.health.plan;
  const own = ownId ? plans.concat(HEALTH_OWN).find(p => p.id === ownId) || null : null;
  return { current, vitalityNet, vitalityKnown, members, needs, own: own ? { ...own, cover: coverOf(own, settings) } : null, rows: byGain(rows) };
}

/* gap: the Gap product — paid per year. */
function compareGap(gap, settings, plans = GAP_PLANS) {
  if (!gap || !(gap.paid > 0)) return null;
  const rows = plans.map(p => {
    const typed = quoteOf(settings, 'gap.' + p.id);
    const monthly = typed !== null ? typed : num(p.monthly) ? p.monthly : null;
    return { ...p, monthly, annual: monthly !== null ? monthly * 12 : null, quoted: typed !== null, gainIfSwitch: monthly !== null ? gap.paid - monthly * 12 : null };
  });
  return { current: { annual: gap.paid, monthly: gap.paid / 12 }, rows: byGain(rows) };
}

/* insure: the Insure product — paid per year, the latest monthly debit
   and the Drive line. Car
   premiums are personal, so nothing is priced until a quote is typed;
   breakEven is the monthly quote at which that insurer, after its own
   rewards, matches Discovery less the Drive rewards. */
function compareInsure(insure, settings, insurers = INSURERS) {
  if (!insure || !(insure.paid > 0)) return null;
  const driveValue = insure.drive && insure.drive.annual > 0 ? insure.drive.annual : 0;
  /* today's debit (cars, Drive, SASRIA), else the window's average */
  const paid = insure.latestMonthly > 0 ? insure.latestMonthly * 12 : insure.paid;
  const target = paid - driveValue;
  const rows = insurers.map(a => {
    const keep = 1 - (a.rewardPct || 0) / 100;
    const monthly = quoteOf(settings, 'insure.' + a.id);
    const rewards = monthly !== null ? monthly * 12 * (1 - keep) : null;
    return {
      ...a, monthly, annual: monthly !== null ? monthly * 12 : null, quoted: monthly !== null, rewards,
      gainIfSwitch: monthly !== null ? target - monthly * 12 * keep : null,
      breakEven: target / 12 / keep,
    };
  });
  return { current: { annual: paid, monthly: paid / 12 }, driveValue, rows: byGain(rows) };
}

/* life: the Life product — monthly, your share of the premium. An
   employer scheme usually splits the premium (settings.life.total is the
   whole of it); an individual policy is all yours, so it must cost less
   than your share alone to win. Nothing is priced until a quote is typed
   unless the insurer publishes an example close to your cover. */
function compareLife(life, settings, offers = LIFE_OFFERS, benchmark = LIFE_BENCHMARK) {
  if (!life || !(life.monthly > 0)) return null;
  const typed = (settings && settings.life) || {};
  const share = life.monthly;
  const total = num(typed.total) && Number(typed.total) > share ? Number(typed.total) : share;
  /* Group Risk PayBack paid to you lowers what your share really costs */
  const payback = num(typed.payback) && Number(typed.payback) > 0 ? Number(typed.payback) : 0;
  life = { ...life, monthly: Math.max(0, share - payback / 12) };
  const rows = offers.map(o => {
    const keep = 1 - (o.rewardPct || 0) / 100;
    const q = quoteOf(settings, 'life.' + o.id);
    const monthly = q !== null ? q : num(o.monthly) ? o.monthly : null;
    return {
      ...o, monthly, annual: monthly !== null ? monthly * 12 : null, quoted: q !== null,
      rewards: monthly !== null ? monthly * 12 * (1 - keep) : null,
      gainIfSwitch: monthly !== null ? life.monthly * 12 - monthly * 12 * keep : null,
      breakEven: life.monthly / keep,
    };
  });
  /* life cover alone, scaled to the cover, for the age typed */
  const age = num(typed.age) ? Number(typed.age) : null;
  const band = age !== null ? benchmark.bands.find(x => age >= x.from && age <= x.to) : null;
  const cover = num(life.cover) && life.cover > 0 ? life.cover : null;
  const lifeOnly = band && cover ? { low: (band.low * cover) / 1e6, high: (band.high * cover) / 1e6, source: benchmark.source } : null;
  return { current: { annual: life.monthly * 12, monthly: life.monthly }, payback, total: { monthly: total, annual: total * 12 }, employer: { monthly: total - share, annual: (total - share) * 12 }, lifeOnly, rows: byGain(rows) };
}

/* Household contents (settings.home: contents, the value insured; monthly,
   today's premium, 0 when there is none). Blank monthly = not set up, so
   nothing is shown. Each insurer is priced from its published rate per
   R100 000 of contents when there is one, else from a typed quote. */
function compareHome(settings, insurers = HOME_INSURERS) {
  const h = (settings && settings.home) || {};
  if (!num(h.monthly)) return null;
  const current = Math.max(0, Number(h.monthly));
  const contents = num(h.contents) && Number(h.contents) > 0 ? Number(h.contents) : null;
  const rows = insurers.map(a => {
    const keep = 1 - (a.rewardPct || 0) / 100;
    const q = quoteOf(settings, 'home.' + a.id);
    const monthly = q !== null ? q : num(a.per100k) && contents !== null ? (a.per100k * contents) / 100000 : null;
    return {
      ...a, monthly, annual: monthly !== null ? monthly * 12 : null, quoted: q !== null,
      rewards: monthly !== null ? monthly * 12 * (1 - keep) : null,
      gainIfSwitch: current > 0 && monthly !== null ? current * 12 - monthly * 12 * keep : null,
      breakEven: current > 0 ? current / keep : null,
    };
  });
  /* not insured: cheapest first */
  const sorted = current > 0 ? byGain(rows) : rows.map((r, i) => ({ r, i })).sort((x, y) => (x.r.monthly === null ? 1 : 0) - (y.r.monthly === null ? 1 : 0) || (x.r.monthly - y.r.monthly) || x.i - y.i).map(x => x.r);
  return { current: { monthly: current, annual: current * 12 }, contents, range: contents !== null ? { low: (HOME_RANGE.low * contents) / 100000, high: (HOME_RANGE.high * contents) / 100000, source: HOME_RANGE.source } : null, rows: sorted };
}

module.exports = { NEEDS, GRADES, coverOf, HEALTH_PLANS, HEALTH_OWN, GAP_PLANS, INSURERS, LIFE_OFFERS, LIFE_BENCHMARK, HOME_INSURERS, HOME_RANGE, healthPremium, compareHealth, compareGap, compareInsure, compareLife, compareHome };
