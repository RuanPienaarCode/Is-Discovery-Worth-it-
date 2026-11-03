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

const { PERIODS, priceValidFor } = require('./market');

/* Medical aid plans nearest Discovery's network plans, 2026 monthly
   contributions per main member / adult / child (savings portion
   included). discovery: Discovery's own plan, so Vitality Health stays.
   banded: income-banded, the top band shown. unconfirmed: read from a
   broker's copy of the scheme's table, not the scheme's own page
   (unconfirmedWhy says why). A row with no y2027 has no 2027 price
   published, so from 1 January 2027 it is shown as out of date.
   y2027: the prices (and any label or cover note that changes) from
   1 January 2027, read by priceAt() — Discovery Health plan comparison
   2027 (30 Sep 2026), still to be approved by the Council for Medical
   Schemes. Sources fetched 21 Oct 2026, checked again 3 Nov 2026. */
const DHMS = 'Discovery Health plan comparison 2026 (1 Apr – 31 Dec 2026); 2027 prices from the 2027 plan comparison (from 1 Jan 2027, awaiting CMS approval)';
/* Discovery Gap Core on an Essential plan, oldest member 0–54, a month:
   R317 for one person, R572 for a family (R171 and R295 on Classic plans).
   Discovery Gap Cover brochure 2026. */
const ESSENTIAL_GAP = { single: 317, family: 572 };
/* From 1 Jan 2027 Gap Core is called Gap 250: R346 and R623 on Essential
   plans (R187 and R322 on Classic). Discovery Gap Cover brochure 2027. */
const ESSENTIAL_GAP_2027 = { single: 346, family: 623 };
const HEALTH_PLANS = [
  { id: 'dhEssentialSmart', scheme: 'Discovery', plan: 'Essential Smart', discovery: true, main: 2161, adult: 2161, child: 2161, y2027: { main: 2332, adult: 2332, child: 2332, gapCore: ESSENTIAL_GAP_2027, coverNote: { doctors: 'Smart network GPs at R135 a visit; a smaller Personal Health Fund (R1 000 an adult, R500 a child) for anything else; specialists in hospital at 100% of the Discovery rate', hospital: 'Smart network: R13 150 upfront for a planned admission elsewhere' } }, gapCore: ESSENTIAL_GAP, network: 'Smart network', dayToDay: 'Network GP visits, no savings', source: DHMS,
    cover: { doctors: 'limited', psychology: 'limited', babies: 'limited', checkups: 'yes' },
    coverNote: { doctors: 'Smart network GPs at R130 a visit; a smaller Personal Health Fund (R1 000 an adult, R500 a child) for anything else; specialists in hospital at 100% of the Discovery rate', psychology: 'Mental Health Care Programme and trauma counselling only', babies: 'maternity basket and two visits for a child under 2; no Nurture at Home; elective caesarean excluded', checkups: 'Screening and Prevention Benefit', hospital: 'Smart network: R12 650 upfront for a planned admission elsewhere' } },
  { id: 'dhEssentialSmartSaver', scheme: 'Discovery', plan: 'Essential Smart Saver', discovery: true, main: 2750, adult: 2350, child: 895, y2027: { main: 2968, adult: 2537, child: 966, gapCore: ESSENTIAL_GAP_2027, coverNote: { doctors: 'Smart network GPs at R135 a visit; the savings account pays any GP or specialist; specialists in hospital at 100% of the Discovery rate', hospital: 'Smart network: R13 150 upfront for a planned admission elsewhere' } }, gapCore: ESSENTIAL_GAP, network: 'Smart network', dayToDay: 'Medical savings account', source: DHMS,
    cover: { doctors: 'yes', psychology: 'limited', babies: 'yes', checkups: 'yes' },
    coverNote: { doctors: 'Smart network GPs at R130 a visit; the savings account pays any GP or specialist; specialists in hospital at 100% of the Discovery rate', psychology: 'Mental Health Care Programme, then savings', babies: 'maternity basket and two visits for a child under 2', checkups: 'Screening and Prevention Benefit; consultations from savings', hospital: 'Smart network: R12 650 upfront for a planned admission elsewhere' } },
  { id: 'dhClassicDeltaCore', scheme: 'Discovery', plan: 'Classic Delta Core', discovery: true, main: 3126, adult: 2465, child: 1250, y2027: { main: 3374, adult: 2661, child: 1349, coverNote: { hospital: 'Delta network: R11 550 upfront for a planned admission elsewhere' } }, network: 'Delta network', dayToDay: 'Hospital plan only', source: DHMS,
    cover: { doctors: 'limited', psychology: 'limited', babies: 'yes', checkups: 'limited' },
    coverNote: { doctors: 'hospital plan: GPs and specialists out of hospital only from the Personal Health Fund', psychology: 'Mental Health Care Programme; 15 PMB consultations', babies: 'maternity basket; two visits for a child under 2', checkups: 'Health Check, mammogram, Pap smear; flu only if pregnant, 65+ or chronic', hospital: 'Delta network: R11 100 upfront for a planned admission elsewhere' } },
  { id: 'bonPrime', scheme: 'Bonitas', plan: 'BonPrime', main: 3255, adult: 2546, child: 1035, y2027: { main: 3548, adult: 2776, child: 1128 }, network: 'Network hospitals', dayToDay: 'Medical savings account', source: 'Bonitas Annexure A 2026 (from 1 Jan 2026); Bonitas 2027 plan brochures (Oct 2026, from 1 Jan 2027, awaiting CMS approval)',
    cover: { doctors: 'limited', psychology: 'limited', babies: 'yes', checkups: 'yes' },
    coverNote: { doctors: 'GPs and specialists from savings; specialists need a GP referral', psychology: 'from savings, plus Bonitas\'s Mental Health Programme', babies: 'maternity, two baby visits under 2, EPI immunisations', checkups: 'flu, Pap smear, mammogram, wellness screening', hospital: 'network hospitals: 30% co-payment elsewhere' } },
  { id: 'bonEssentialSelect', scheme: 'Bonitas', plan: 'BonEssential Select', main: 2345, adult: 1718, child: 774, y2027: { main: 2526, adult: 1850, child: 834 }, network: 'Network hospitals', dayToDay: 'Hospital plan, screenings only', source: 'Bonitas Annexure A 2026 (from 1 Jan 2026); Bonitas 2027 plan brochures (Oct 2026, from 1 Jan 2027, awaiting CMS approval)',
    cover: { doctors: 'no', psychology: 'limited', babies: 'no', checkups: 'limited' },
    coverNote: { doctors: 'no GP or specialist cover out of hospital', psychology: 'PMBs, plus Bonitas\'s Mental Health Programme', babies: 'maternity only: no baby visits under 2, no immunisations', checkups: 'no child immunisations', hospital: 'network hospitals: 30% co-payment elsewhere' } },
  { id: 'bonStandardSelect', scheme: 'Bonitas', plan: 'Standard Select', main: 5431, adult: 4700, child: 1590, network: 'Network hospitals', dayToDay: 'Day-to-day limit, nominated network GPs', source: 'Bonitas Annexure A 2026 (from 1 Jan 2026); not in Bonitas\'s 2027 brochures, so no 2027 price',
    cover: { doctors: 'limited', psychology: 'yes', babies: 'yes', checkups: 'yes' },
    coverNote: { doctors: 'two nominated network GPs each; specialists on referral from a day-to-day limit', psychology: 'R20 310 a family in and out of hospital', babies: '12 antenatal visits, four baby visits under 2, private immunisations', checkups: 'flu, Pap smear, mammogram, lipogram', hospital: 'network hospitals: 30% co-payment elsewhere' } },
  { id: 'momIngwe', scheme: 'Momentum', plan: 'Ingwe (Ingwe network)', banded: true, maxChildren: 0, main: 3590, adult: 3590, child: 1058, y2027: { main: 3873, adult: 3873, child: 1141, dayToDay: 'Unlimited network GP visits; income R24 501+ band; every child charged' }, network: 'Ingwe network', dayToDay: 'Unlimited network GP visits; income R23 501+ band; every child charged', source: 'Momentum Medical Scheme 2026 brochure; 2027 brochure (29 Sep 2026, from 1 Jan 2027, awaiting approval)',
    cover: { doctors: 'limited', psychology: 'no', babies: 'limited', checkups: 'limited' },
    coverNote: { doctors: 'Ingwe network GPs only; two specialist visits a family, pre-authorised', psychology: 'PMBs only, at State facilities', babies: 'one paediatrician visit in year one; emergency caesareans only', checkups: 'no mammogram listed', hospital: 'Ingwe network hospitals: 30% co-payment elsewhere' } },
  { id: 'momCustom', scheme: 'Momentum', plan: 'Custom (Associated)', main: 2585, adult: 1956, child: 916, y2027: { main: 2789, adult: 2110, child: 988 }, network: 'Associated hospitals, State chronic provider', dayToDay: 'Hospital plan; HealthSaver optional', source: 'Momentum Medical Scheme 2026 brochure; 2027 brochure (29 Sep 2026, from 1 Jan 2027, awaiting approval)',
    cover: { doctors: 'no', psychology: 'no', babies: 'yes', checkups: 'yes' },
    coverNote: { doctors: 'no out-of-hospital GP or specialist cover (HealthSaver+ only)', psychology: 'out of hospital only from HealthSaver+', babies: '12 antenatal visits, two paediatrician visits in year one, immunisations to 6', checkups: 'mammogram, Pap/HPV, health assessment', hospital: 'R2 000 for each admission; plus 30% outside Associated hospitals' } },
  { id: 'medValuePrime', scheme: 'Medshield', plan: 'MediValue Prime', main: 3207, adult: 2802, child: 906, y2027: { main: 3465, adult: 3027, child: 978 }, network: 'Prime network', dayToDay: 'Day-to-day limit', source: 'Medshield 2026 benefit guides (Nov 2025); 2027 contributions (Sep 2026, from 1 Jan 2027, awaiting CMS approval)',
    cover: { doctors: 'limited', psychology: 'limited', babies: 'yes', checkups: 'yes' },
    coverNote: { doctors: 'any GP from a shared day-to-day limit; two specialist visits without referral', psychology: 'from the shared day-to-day limit', babies: 'maternity, two paediatrician visits under 2, State vaccines', checkups: 'flu, Pap smear, mammogram', hospital: 'Prime network: 30% upfront co-payment elsewhere' } },
  { id: 'medPlusCompact', scheme: 'Medshield', plan: 'MediPlus Compact', main: 4938, adult: 3522, child: 1113, y2027: { main: 5382, adult: 3840, child: 1212 }, network: 'Compact network', dayToDay: 'Day-to-day limit', source: 'Medshield 2026 benefit guides (Nov 2025); 2027 contributions (Sep 2026, from 1 Jan 2027, awaiting CMS approval)',
    cover: { doctors: 'limited', psychology: 'yes', babies: 'yes', checkups: 'yes' },
    coverNote: { doctors: 'network GPs compulsory: two other visits a family, then 40% co-payment', psychology: 'R40 300 a family, counselling included', babies: '12 antenatal visits, two paediatrician visits under 2', checkups: 'flu, Pap smear, mammogram', hospital: 'Compact network: 30% upfront co-payment elsewhere' } },
  { id: 'fedFlexi2Elect', scheme: 'Fedhealth', plan: 'flexiFED 2Elect (Savings Plan)', main: 3810, adult: 3403, child: 1131, network: 'Elect network', dayToDay: 'Savings, threshold, network GP', source: 'Fedhealth combined contributions 2026 (Aon copy)', unconfirmed: true, unconfirmedWhy: 'fedhealth.co.za could not be opened, so this is a broker\'s copy of Fedhealth\'s table; its 2027 prices are published there but could not be read.',
    cover: { doctors: 'limited', psychology: 'limited', babies: 'yes', checkups: 'yes' },
    coverNote: { doctors: 'GPs and specialists from savings, then network GPs at a 20% co-payment', psychology: '15 PMB consultations, then savings; no mental health programme', babies: '8 antenatal visits, two scans, one paediatrician visit, immunisations to 12', checkups: 'flu for everyone, Pap smear, mammogram', hospital: 'any private hospital, but R15 950 excess on every planned admission' } },
  { id: 'fedMyFed', scheme: 'Fedhealth', plan: 'myFED', banded: true, main: 4052, adult: 4052, child: 1281, network: 'Network hospitals', dayToDay: 'Network GP; household income R21 652+ band', source: 'Fedhealth combined contributions 2026 (Aon copy)', unconfirmed: true, unconfirmedWhy: 'fedhealth.co.za could not be opened, so this is a broker\'s copy of Fedhealth\'s table; its 2027 prices are published there but could not be read.',
    cover: { doctors: 'limited', psychology: 'no', babies: 'limited', checkups: 'limited' },
    coverNote: { doctors: 'one nominated network GP; two specialist visits a family', psychology: 'two GP mental-health consultations only', babies: 'antenatal with the GP only; no paediatrician visits listed', checkups: 'no Pap smear or mammogram listed', hospital: 'myFED network hospitals: 30% co-payment elsewhere (list not published)' } },
  { id: 'bestBeat2Net', scheme: 'Bestmed', plan: 'Beat2 Network', main: 2775, adult: 2156, child: 1167, y2027: { main: 2983, adult: 2318, child: 1220, coverNote: { hospital: 'network hospitals: up to R15 626 co-payment elsewhere' } }, network: 'Network hospitals', dayToDay: 'Medical savings account', source: 'Bestmed Annexure A 2026 (from 1 Jan 2026); Beat brochures 2027 (30 Sep 2026, from 1 Jan 2027)',
    cover: { doctors: 'limited', psychology: 'limited', babies: 'limited', checkups: 'yes' },
    coverNote: { doctors: 'any GP, from savings', psychology: 'from savings, plus 15 PMB sessions', babies: 'maternity from risk; baby visits from savings', checkups: 'flu, mammogram, Pap smear, child immunisations', hospital: 'network hospitals: up to R15 025 co-payment elsewhere' } },
  { id: 'bestBeat3Net', scheme: 'Bestmed', plan: 'Beat3 Network', main: 4062, adult: 2898, child: 1434, y2027: { main: 4367, adult: 3115, child: 1542, coverNote: { hospital: 'network hospitals: up to R15 626 co-payment elsewhere' } }, network: 'Network hospitals', dayToDay: 'Medical savings account', source: 'Bestmed Annexure A 2026 (from 1 Jan 2026); Beat brochures 2027 (30 Sep 2026, from 1 Jan 2027)',
    cover: { doctors: 'limited', psychology: 'limited', babies: 'limited', checkups: 'yes' },
    coverNote: { doctors: 'any GP, from larger savings', psychology: 'from savings, plus 15 PMB sessions', babies: '9 antenatal visits; baby visits from savings', checkups: 'flu, mammogram, Pap smear, child immunisations', hospital: 'network hospitals: up to R15 025 co-payment elsewhere' } },
];
/* Every other Discovery Health plan you might be on, for the needs table
   (settings.health.plan) and for guessing your plan from your debit order
   (detect.js guessHealthPlan, which reads HEALTH_PLANS and HEALTH_OWN).
   Total monthly contributions from 1 Apr 2026 (savings portion included),
   per main member / adult / child, from Discovery's own 2026 plan
   comparison, and from 1 Jan 2027 (y2027) from the 2027 one. KeyCare plans
   are priced by household income, one row per band; the band limits move
   in 2027, so those rows carry their 2027 label too. Cover grades are only filled in where a plan guide was read;
   the rest show as unknown until you set them. */
const HEALTH_OWN = [
  { id: 'dhClassicSmart', scheme: 'Discovery', plan: 'Classic Smart', discovery: true, main: 3018, adult: 2381, child: 1205, y2027: { main: 3257, adult: 2571, child: 1301, coverNote: { doctors: 'unlimited Smart network GP visits at R80; anything else from the Personal Health Fund (R2 000 an adult, R1 000 a child); specialists in hospital up to 200% of the Discovery rate' } }, dayToDay: 'Smart network GPs, no savings', source: DHMS,
    cover: { doctors: 'limited', psychology: 'limited', babies: 'yes', checkups: 'yes' },
    coverNote: { doctors: 'unlimited Smart network GP visits at R75; anything else from the Personal Health Fund (R2 000 an adult, R1 000 a child); specialists in hospital up to 200% of the Discovery rate', psychology: 'Mental Health Care Programme, trauma counselling and two maternity consults; otherwise the Personal Health Fund', babies: '8 antenatal visits, two scans, two visits for a child under 2, Nurture at Home', checkups: 'Screening and Prevention Benefit' } },
  { id: 'dhExecutive', scheme: 'Discovery', plan: 'Executive', discovery: true, main: 12338, adult: 12338, child: 2358, y2027: { main: 13442, adult: 13442, child: 2569 }, dayToDay: 'Medical savings account, then Above Threshold Benefit (unlimited)', source: DHMS },
  { id: 'dhClassicComprehensive', scheme: 'Discovery', plan: 'Classic Comprehensive', discovery: true, main: 10037, adult: 9492, child: 2002, y2027: { main: 10934, adult: 10342, child: 2181 }, dayToDay: 'Medical savings account, then Above Threshold Benefit', source: DHMS },
  { id: 'dhClassicSmartComprehensive', scheme: 'Discovery', plan: 'Classic Smart Comprehensive', discovery: true, main: 8576, adult: 7920, child: 2002, y2027: { main: 9343, adult: 8628, child: 2181 }, dayToDay: 'Medical savings account, then Above Threshold Benefit', source: DHMS },
  { id: 'dhClassicPriority', scheme: 'Discovery', plan: 'Classic Priority', discovery: true, main: 6198, adult: 4889, child: 2478, y2027: { main: 6752, adult: 5326, child: 2700 }, dayToDay: 'Medical savings account, then Above Threshold Benefit', source: DHMS },
  { id: 'dhEssentialPriority', scheme: 'Discovery', plan: 'Essential Priority', discovery: true, main: 5327, adult: 4189, child: 2127, y2027: { main: 5803, adult: 4564, child: 2317 }, dayToDay: 'Medical savings account', source: DHMS },
  { id: 'dhClassicSaver', scheme: 'Discovery', plan: 'Classic Saver', discovery: true, main: 4850, adult: 3825, child: 1943, y2027: { main: 5235, adult: 4128, child: 2098 }, dayToDay: 'Medical savings account', source: DHMS },
  { id: 'dhClassicDeltaSaver', scheme: 'Discovery', plan: 'Classic Delta Saver', discovery: true, main: 3875, adult: 3062, child: 1556, y2027: { main: 4182, adult: 3306, child: 1680 }, dayToDay: 'Medical savings account; Delta network', source: DHMS },
  { id: 'dhEssentialSaver', scheme: 'Discovery', plan: 'Essential Saver', discovery: true, main: 3886, adult: 2914, child: 1556, y2027: { main: 4194, adult: 3145, child: 1680 }, dayToDay: 'Medical savings account', source: DHMS },
  { id: 'dhEssentialDeltaSaver', scheme: 'Discovery', plan: 'Essential Delta Saver', discovery: true, main: 3099, adult: 2339, child: 1243, y2027: { main: 3345, adult: 2525, child: 1342 }, dayToDay: 'Medical savings account; Delta network', source: DHMS },
  { id: 'dhCoastalSaver', scheme: 'Discovery', plan: 'Coastal Saver', discovery: true, main: 4098, adult: 3082, child: 1648, y2027: { main: 4441, adult: 3330, child: 1778 }, dayToDay: 'Medical savings account; coastal hospitals', source: DHMS },
  { id: 'dhClassicSmartSaver', scheme: 'Discovery', plan: 'Classic Smart Saver', discovery: true, main: 3350, adult: 2840, child: 1400, y2027: { main: 3616, adult: 3066, child: 1511 }, dayToDay: 'Medical savings account; Smart network', source: DHMS },
  { id: 'dhEssentialDynamicSmart', scheme: 'Discovery', plan: 'Essential Dynamic Smart', discovery: true, main: 1797, adult: 1797, child: 1797, y2027: { main: 1939, adult: 1939, child: 1939 }, dayToDay: 'Smart network GPs, no savings', source: DHMS },
  { id: 'dhActiveSmart', scheme: 'Discovery', plan: 'Active Smart', discovery: true, main: 1350, adult: 1350, child: 1350, y2027: { main: 1450, adult: 1450, child: 1450 }, dayToDay: 'Smart network GPs, no savings', source: DHMS },
  { id: 'dhClassicCore', scheme: 'Discovery', plan: 'Classic Core', discovery: true, main: 3905, adult: 3083, child: 1562, y2027: { main: 4215, adult: 3328, child: 1686 }, dayToDay: 'Hospital plan only', source: DHMS },
  { id: 'dhEssentialCore', scheme: 'Discovery', plan: 'Essential Core', discovery: true, main: 3356, adult: 2517, child: 1347, y2027: { main: 3622, adult: 2718, child: 1454 }, dayToDay: 'Hospital plan only', source: DHMS },
  { id: 'dhEssentialDeltaCore', scheme: 'Discovery', plan: 'Essential Delta Core', discovery: true, main: 2681, adult: 2018, child: 1076, y2027: { main: 2894, adult: 2178, child: 1161 }, dayToDay: 'Hospital plan only; Delta network', source: DHMS },
  { id: 'dhCoastalCore', scheme: 'Discovery', plan: 'Coastal Core', discovery: true, main: 3250, adult: 2438, child: 1291, y2027: { main: 3540, adult: 2657, child: 1406 }, dayToDay: 'Hospital plan only; coastal hospitals', source: DHMS },
  /* New in 2027 (subject to CMS approval and registration): no 2026 price,
     so it is only priced from 1 January 2027. */
  { id: 'dhActiveCore', scheme: 'Discovery', plan: 'Active Core', discovery: true, main: null, adult: null, child: null, y2027: { main: 1700, adult: 1550, child: 500 }, dayToDay: 'Hospital plan only; new in 2027', source: 'Discovery Health plan comparison 2027 (from 1 Jan 2027, awaiting CMS approval and registration)' },
  { id: 'dhKeyCarePlus1', scheme: 'Discovery', plan: 'KeyCare Plus (income up to R10 250)', discovery: true, banded: true, main: 1961, adult: 1961, child: 713, y2027: { main: 2136, adult: 2136, child: 776, plan: 'KeyCare Plus (income up to R10 650)' }, dayToDay: 'KeyCare network GPs', source: DHMS },
  { id: 'dhKeyCarePlus2', scheme: 'Discovery', plan: 'KeyCare Plus (income R10 251 – R16 600)', discovery: true, banded: true, main: 2695, adult: 2695, child: 760, y2027: { main: 2936, adult: 2936, child: 828, plan: 'KeyCare Plus (income R10 651 – R17 250)' }, dayToDay: 'KeyCare network GPs', source: DHMS },
  { id: 'dhKeyCarePlus3', scheme: 'Discovery', plan: 'KeyCare Plus (income R16 601 or more)', discovery: true, banded: true, main: 3980, adult: 3980, child: 1064, y2027: { main: 4336, adult: 4336, child: 1159, plan: 'KeyCare Plus (income R17 251 or more)' }, dayToDay: 'KeyCare network GPs', source: DHMS },
  { id: 'dhKeyCareCore1', scheme: 'Discovery', plan: 'KeyCare Core (income up to R10 250)', discovery: true, banded: true, main: 1490, adult: 1490, child: 390, y2027: { main: 1623, adult: 1623, child: 425, plan: 'KeyCare Core (income up to R10 650)' }, dayToDay: 'Hospital plan only; KeyCare network', source: DHMS },
  { id: 'dhKeyCareCore2', scheme: 'Discovery', plan: 'KeyCare Core (income R10 251 – R16 600)', discovery: true, banded: true, main: 1859, adult: 1859, child: 461, y2027: { main: 2025, adult: 2025, child: 502, plan: 'KeyCare Core (income R10 651 – R17 250)' }, dayToDay: 'Hospital plan only; KeyCare network', source: DHMS },
  { id: 'dhKeyCareCore3', scheme: 'Discovery', plan: 'KeyCare Core (income R16 601 or more)', discovery: true, banded: true, main: 2845, adult: 2845, child: 645, y2027: { main: 3099, adult: 3099, child: 702, plan: 'KeyCare Core (income R17 251 or more)' }, dayToDay: 'Hospital plan only; KeyCare network', source: DHMS },
  { id: 'dhKeyCareStart1', scheme: 'Discovery', plan: 'KeyCare Start (income up to R10 950)', discovery: true, banded: true, main: 1436, adult: 1436, child: 875, y2027: { main: 1564, adult: 1564, child: 953, plan: 'KeyCare Start (income up to R11 400)' }, dayToDay: 'One chosen KeyCare Start GP', source: DHMS },
  { id: 'dhKeyCareStart2', scheme: 'Discovery', plan: 'KeyCare Start (income R10 951 – R16 550)', discovery: true, banded: true, main: 2107, adult: 2107, child: 947, y2027: { main: 2295, adult: 2295, child: 1031, plan: 'KeyCare Start (income R11 401 – R17 200)' }, dayToDay: 'One chosen KeyCare Start GP', source: DHMS },
  { id: 'dhKeyCareStart3', scheme: 'Discovery', plan: 'KeyCare Start (income R16 551 – R25 150)', discovery: true, banded: true, main: 3306, adult: 3306, child: 992, y2027: { main: 3601, adult: 3601, child: 1081, plan: 'KeyCare Start (income R17 201 – R26 150)' }, dayToDay: 'One chosen KeyCare Start GP', source: DHMS },
  { id: 'dhKeyCareStart4', scheme: 'Discovery', plan: 'KeyCare Start (income R25 151 or more)', discovery: true, banded: true, main: 3765, adult: 3765, child: 1024, y2027: { main: 4101, adult: 4101, child: 1115, plan: 'KeyCare Start (income R26 151 or more)' }, dayToDay: 'One chosen KeyCare Start GP', source: DHMS },
  { id: 'dhKeyCareStartRegional1', scheme: 'Discovery', plan: 'KeyCare Start Regional (income up to R10 950)', discovery: true, banded: true, main: 1278, adult: 1278, child: 769, y2027: { main: 1392, adult: 1392, child: 837, plan: 'KeyCare Start Regional (income up to R11 400)' }, dayToDay: 'One chosen KeyCare Start GP', source: DHMS },
  { id: 'dhKeyCareStartRegional2', scheme: 'Discovery', plan: 'KeyCare Start Regional (income R10 951 – R16 550)', discovery: true, banded: true, main: 1932, adult: 1932, child: 869, y2027: { main: 2104, adult: 2104, child: 947, plan: 'KeyCare Start Regional (income R11 401 – R17 200)' }, dayToDay: 'One chosen KeyCare Start GP', source: DHMS },
  { id: 'dhKeyCareStartRegional3', scheme: 'Discovery', plan: 'KeyCare Start Regional (income R16 551 – R25 150)', discovery: true, banded: true, main: 3011, adult: 3011, child: 922, y2027: { main: 3280, adult: 3280, child: 1004, plan: 'KeyCare Start Regional (income R17 201 – R26 150)' }, dayToDay: 'One chosen KeyCare Start GP', source: DHMS },
  { id: 'dhKeyCareStartRegional4', scheme: 'Discovery', plan: 'KeyCare Start Regional (income R25 151 or more)', discovery: true, banded: true, main: 3430, adult: 3430, child: 961, y2027: { main: 3736, adult: 3736, child: 1047, plan: 'KeyCare Start Regional (income R26 151 or more)' }, dayToDay: 'One chosen KeyCare Start GP', source: DHMS },
];

/* Gap cover, 2026 monthly premium for a family whose oldest member is
   under 45 (pricedUnder on a row when its own limit is lower). Every price
   is per family, but who sets the age differs (the oldest person, the
   policyholder, or the age at entry), and some charge young families less,
   so type your quote if yours differs. Discovery Gap Cover is for Discovery
   Health members only; every other one takes any medical scheme. Shortfall
   multiples are not like for like: Discovery's sit on top of the plan's own
   rate, the others are the total. y2027: the price (and name) from
   1 January 2027 where it is published. Sources fetched 21 Oct 2026,
   checked again 3 Nov 2026. */
const GAP_PLANS = [
  { id: 'dgComprehensive', provider: 'Discovery', plan: 'Gap Comprehensive', discovery: true, monthly: 457, y2027: { monthly: 498, plan: 'Gap 500' }, cover: 'Up to 500% on top of the plan (Classic plans, oldest 0–54)', source: 'Discovery Gap Cover brochure 2026; 2027 brochure (19 Oct 2026, renamed Gap 500)' },
  { id: 'turnberryLaunch', provider: 'Turnberry', plan: 'Launch', monthly: 185, y2027: { monthly: 191 }, cover: 'Up to 350%; one co-payment a year up to R4 400 (R5 000 in 2027)', source: 'Turnberry brochure 2026; Turnberry brochure 2027 (Sep 2026)' },
  { id: 'stratumMeridian400', provider: 'Stratum', plan: 'Meridian400', monthly: 352, y2027: { monthly: 385 }, cover: '400%; co-payments covered', source: 'Stratum 2026 individual product range; Stratum 2027 premium overview (Oct 2026, from 1 Jan 2027)' },
  { id: 'stratumCompact300', provider: 'Stratum', plan: 'Compact300', monthly: 439, y2027: { monthly: 481 }, cover: '300%; co-payments up to R20 000 (R22 000 in 2027)', source: 'Stratum 2026 individual product range; Stratum 2027 premium overview (Oct 2026, from 1 Jan 2027)' },
  { id: 'ambledownPhi', provider: 'Ambledown', plan: 'Origin Phi', monthly: 262, y2027: { monthly: 262 }, cover: '200%, no co-payment cover (ages 28–44; less under 28)', source: 'Ambledown Origin Phi brochures 2026 and 2027' },
  { id: 'ambledownSigma', provider: 'Ambledown', plan: 'Origin Sigma', monthly: 493, y2027: { monthly: 493 }, cover: '600%; co-payments covered (ages 28–44; less under 28)', source: 'Ambledown Origin Sigma brochures 2026 and 2027' },
  { id: 'siragoGapCore', provider: 'Sirago', plan: 'Gap Core', monthly: 457, cover: 'Up to 350%; co-payments covered (up to four dependants; R55 for each one more)', source: 'Sirago broker update 2026' },
  { id: 'turnberrySynergy', provider: 'Turnberry', plan: 'Synergy', monthly: 494, y2027: { monthly: 545 }, cover: '500%; co-payments and sub-limits', source: 'Turnberry brochure 2026; Turnberry brochure 2027 (Sep 2026)' },
  { id: 'zestOptimal', provider: 'Zestlife', plan: 'Optimal', monthly: 495, pricedUnder: 42, cover: '400%; co-payments (sold only when everyone is under 42)', source: 'Zestlife gap cover brochure 2026' },
  { id: 'sanlamComprehensive', provider: 'Sanlam', plan: 'Gap Comprehensive', monthly: 583, cover: '600%; co-payments covered (main member 30–45; less under 30)', source: 'Sanlam Gap 2026 option form (Aon copy)', unconfirmed: true, unconfirmedWhy: 'Read from a broker\'s copy of Sanlam\'s form; Sanlam\'s own page gives only "from" prices.' },
];
/* Car insurers. rewardPct is the cash back a claim-free year earns, as a
   share of that year's premium. Every claim-free reward here pays X% of ALL
   the premiums paid over the claim-free years (OUTsurance "10% of your paid
   insurance premiums" after three years; MiWay "R1000 x 24 months x 10%"),
   so it is worth about X% a year, paid at the end, and only if you stay
   claim-free. A programme that depends on driving less, or is an extra
   paid-for add-on, counts 0 and is named in the note. Sources fetched
   21 Oct 2026 and checked again 3 Nov 2026. */
const INSURERS = [
  { id: 'outsurance', name: 'OUTsurance', rewardPct: 10, rewardNote: 'OUTbonus: 10% of the premiums you paid, back after 3 claim-free years, then after every further claim-free stretch', source: 'outsurance.co.za/outbonus, fetched 3 Nov 2026' },
  { id: 'miway', name: 'MiWay', rewardPct: 10, rewardNote: 'Micashback: 10% of the premiums you paid, back every 2 claim-free years', source: 'MiWay Micashback brochure and terms, fetched 3 Nov 2026' },
  { id: 'santam', name: 'Santam', rewardPct: 10, rewardNote: 'CashBack: 10% of the premiums you paid, back after 3 claim-free years (from 1 Jul 2026, so the first payout is in 2029)', source: 'santam.co.za blog: Santam CashBack (Jul 2026), fetched 3 Nov 2026' },
  { id: 'kingprice', name: 'King Price', rewardPct: 0, rewardNote: 'Premium drops as the car ages; up to 20% multi-car discount (in the quote)', source: 'kingprice.co.za blog, 27 May 2026' },
  { id: 'momentum', name: 'Momentum Insure', rewardPct: 0, rewardNote: 'Safety Returns: up to 30% of premiums back a year by driving points — not counted', source: 'momentum.co.za Safety Returns, fetched 21 Oct 2026' },
  { id: 'naked', name: 'Naked', rewardPct: 0, rewardNote: 'No claim-free refund; CoverPause cuts days the car is parked', source: 'naked.insure (CoverPause; 2026 cost guide)' },
  { id: 'pineapple', name: 'Pineapple', rewardPct: 0, rewardNote: 'Up to 30% back in months you drive 300 km or less — not counted', source: 'pineapple.co.za/car-insurance, fetched 21 Oct 2026' },
  { id: 'dialdirect', name: 'Dialdirect', rewardPct: 0, rewardNote: 'Payback Bonus is an add-on you pay extra for — not counted', source: 'dialdirect.co.za/car-insurance, fetched 21 Oct 2026' },
  { id: 'budget', name: 'Budget Insurance', rewardPct: 0, rewardNote: 'Cash Back Bonus is an add-on you pay extra for (15% of premiums after 2 claim-free years, then 10%) — not counted', source: 'budgetinsurance.co.za/benefits/cash-back-bonus, fetched 3 Nov 2026' },
];

/* Individual risk-cover insurers to quote against an employer scheme.
   None publishes a price for life, severe illness and income protection
   together, so every row waits for a quote; the discounts named are taken
   off inside the quote, so they are not counted again. Sources fetched
   22 Oct 2026. */
const LIFE_OFFERS = [
  { id: 'discoveryLife', name: 'Discovery Life (individual)', rewardNote: 'Discounts up to 48% with Vitality, Discovery Health or Discovery Bank; PayBack up to 50% of premiums', source: 'discovery.co.za/life-insurance/discounts-and-paybacks, fetched 3 Nov 2026' },
  { id: 'momentumMyriad', name: 'Momentum Myriad', rewardNote: 'LifeReturns: up to 35% off after a health assessment', source: 'momentum.co.za life cover (2026)' },
  { id: 'brightrock', name: 'BrightRock', rewardNote: 'Needs-matched cover, no reward programme', source: 'brightrock.co.za, fetched 22 Oct 2026' },
  { id: 'oldmutual', name: 'Old Mutual', source: 'oldmutual.co.za (quote only), fetched 22 Oct 2026' },
  { id: 'sanlam', name: 'Sanlam', rewardNote: 'Indie Wealth Bonus invests up to 100% of the premium, less the older you start (not counted)', source: 'sanlam.co.za (quote only), fetched 22 Oct 2026' },
  { id: 'liberty', name: 'Liberty', source: 'liberty.co.za (quote only), fetched 22 Oct 2026' },
  { id: 'outsuranceLife', name: 'OUTsurance Life', rewardNote: 'Life cover from R132 a month (a "from" price with no cover amount or age given)', source: 'outsurance.co.za/life-insurance, fetched 3 Nov 2026' },
  { id: 'bidvestLife', name: 'Bidvest Life', rewardNote: 'Income protection specialist', source: 'bidvestlife.co.za (quote only), fetched 22 Oct 2026' },
];
/* Individual life cover alone, R per month per R1 000 000, healthy male
   non-smoker in an office job: a broker's published estimate for ages 40
   and 45, which the bands here stretch two years either side. Smokers pay
   50–100% more. It is a broker's estimate, not an insurer's price, and
   insurers' own examples can be far lower (OUTsurance publishes client
   premiums of R99–R144 per R1 000 000 at 35–45), so a quote beats it.
   Severe illness and income protection come on top and have no published
   2026 figure. */
const LIFE_BENCHMARK = { source: 'Peter Pyburn (FSP 2995), "What life insurance will cost", updated 10 Aug 2026 (ages 40 and 45)', unconfirmed: true, bands: [{ from: 38, to: 42, low: 240, high: 350 }, { from: 43, to: 47, low: 300, high: 450 }] };
/* Household contents insurers. per100k: R a month per R100 000 of
   contents, worked out from a published example (premium ÷ contents);
   the rest publish no price, so they wait for a quote. Premiums depend on
   the suburb, security and excess. rewardPct as for INSURERS. Sources
   fetched 22 Oct 2026. */
const HOME_INSURERS = [
  { id: 'kingprice', name: 'King Price', per100k: 620 / 6.5, rewardNote: 'Example: R620 a month for R650 000, R3 000 excess (Centurion); one example, so your suburb and security change it', source: 'King Price blog, best home contents insurance (27 May 2026)', unconfirmed: true, unconfirmedWhy: 'A single published example, not a rate table.' },
  { id: 'discovery', name: 'Discovery Insure', rewardNote: 'An asset inventory assessment so your contents are insured at the right value', source: 'discovery.co.za/car-and-home-insurance/home-insurance, fetched 3 Nov 2026' },
  { id: 'iwyze', name: 'iWYZE (Old Mutual)', rewardNote: 'Car and contents together save 5% on average', source: 'iwyze.co.za/home/bundle-and-save (23 Sep 2026)' },
  { id: 'budget', name: 'Budget Insurance', rewardNote: '10–15% off car and home together', source: 'budgetinsurance.co.za/home-insurance, fetched 22 Oct 2026' },
  { id: 'outsurance', name: 'OUTsurance', rewardPct: 10, rewardNote: 'OUTbonus: 10% of the premiums you paid, back after 3 claim-free years', source: 'outsurance.co.za/outbonus, fetched 3 Nov 2026' },
  { id: 'dialdirect', name: 'Dialdirect', rewardPct: 0, rewardNote: 'Payback Bonus is an add-on you pay extra for (25% of 4 years of premiums, at most one year\'s premium) — not counted', source: 'dialdirect.co.za/home-insurance, fetched 3 Nov 2026' },
  { id: 'miway', name: 'MiWay', source: 'miway.co.za (quote only), fetched 22 Oct 2026' },
  { id: 'santam', name: 'Santam', source: 'santam.co.za (quote only), fetched 22 Oct 2026' },
  { id: 'naked', name: 'Naked', source: 'naked.insure (quote only), fetched 22 Oct 2026' },
  { id: 'pineapple', name: 'Pineapple', rewardNote: '"My Things" for contents under R100 000, Household Contents from R100 000', source: 'pineapple.co.za home terms (quote only), fetched 3 Nov 2026' },
];
/* What contents cover costs across the market, R a month per R100 000:
   King Price's "R400–R900 for R500 000–R800 000" (R50–R180 at the extremes,
   R80–R113 read pair by pair) and a broker's "R150–R400 for R300 000"
   (R50–R133) put it at about R50–R135. Both are examples, not rate tables,
   and the broker's is from 2024. */
const HOME_RANGE = { low: 50, high: 135, source: 'King Price blog (27 May 2026); InsureEasy Brokers blog (17 Sep 2024)', unconfirmed: true };

/* The period each table's prices are good for (market.js PERIODS):
   Discovery Health's from 1 Apr 2026 to 31 Mar 2027, the other schemes' and
   gap cover's for 2026. */
for (const p of HEALTH_PLANS.concat(HEALTH_OWN)) p.effective = p.discovery ? PERIODS.discoveryHealth : PERIODS.schemes;
for (const p of GAP_PLANS) p.effective = p.discovery ? PERIODS.discoveryGap || PERIODS.gap : PERIODS.gap;

/* Whether Discovery Health's published plan prices (the 2026 table above,
   or its 2027 prices in y2027) are the ones charged in a month ('YYYY-MM' or
   'YYYY-MM-DD'). A debit outside both was priced on another year's table, so
   it must not be split with these prices. */
function planPriceValidFor(ym) {
  return priceValidFor('discoveryHealth', ym);
}

/* The published gap cover prices are for a family whose oldest member is
   under this age. */
const GAP_PRICED_UNDER = 45;

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

/* when (a Date, 'YYYY-MM' or 'YYYY-MM-DD') → 'YYYY-MM', or null */
function ymOf(when) {
  if (when instanceof Date) return isNaN(when.getTime()) ? null : `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}`;
  return typeof when === 'string' && /^\d{4}-\d{2}/.test(when) ? when.slice(0, 7) : null;
}
/* The plan (a medical aid or a gap cover row) as priced on `when`: from
   1 January 2027 a row with 2027 prices (y2027) takes them, with its 2027
   name, cover notes and Discovery Gap Cover price where those changed, and
   priceYear 2027. No `when`, or a day before then: the row as it is (2026). */
function priceAt(plan, when) {
  const ym = ymOf(when);
  const next = plan && plan.y2027;
  const from = PERIODS.discoveryHealth2027 ? PERIODS.discoveryHealth2027.from.slice(0, 7) : null;
  if (!next || !ym || !from || ym < from) return plan;
  const out = Object.assign({}, plan, { priceYear: 2027 });
  for (const k of ['main', 'adult', 'child', 'monthly', 'plan', 'gapCore', 'dayToDay']) if (next[k] !== undefined) out[k] = next[k];
  if (next.coverNote) out.coverNote = Object.assign({}, plan.coverNote, next.coverNote);
  const period = plan.monthly !== undefined ? (plan.discovery ? 'discoveryGap2027' : 'gap2027') : plan.discovery ? 'discoveryHealth2027' : 'schemes2027';
  if (PERIODS[period]) out.effective = PERIODS[period];
  return out;
}

/* Monthly premium for a family: the main member, every other adult, and
   the children up to the scheme's maximum charged (3 unless it says).
   when: the day or month to price it on (priceAt); none = 2026 prices.
   null when a rate the family needs is not published. */
function healthPremium(plan, members, when) {
  plan = priceAt(plan, when);
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
   vitalityYear, vitValue, all per year. opts.now (a Date or 'YYYY-MM-DD'):
   the day to price the plans on (priceAt); without it, the 2026 prices. */
function compareHealth(health, settings, plans = HEALTH_PLANS, opts) {
  const when = opts && opts.now;
  /* a product you no longer pay for (products.js ended) has nothing to compare */
  if (!health || !(health.paid > 0) || health.ended) return null;
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
  const rows = plans.map(p0 => {
    const p = priceAt(p0, when);
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
  const ownRow = ownId ? plans.concat(HEALTH_OWN).find(p => p.id === ownId) || null : null;
  const own = ownRow ? priceAt(ownRow, when) : null;
  return { current, vitalityNet, vitalityKnown, members, needs, own: own ? { ...own, cover: coverOf(own, settings) } : null, rows: byGain(rows) };
}

/* gap: the Gap product — paid per year. The published prices are for an
   oldest member under 45 (GAP_PRICED_UNDER, or a row's own pricedUnder);
   most gap cover costs more after that. Unless settings.members.oldestAge
   says the family is younger, a published price is shown but claims no
   saving (gainIfSwitch null, ageLimited true): only a quote you typed is
   compared. opts.now: the day to price on (priceAt). */
function compareGap(gap, settings, plans = GAP_PLANS, opts) {
  if (!gap || !(gap.paid > 0) || gap.ended) return null;
  const age = Number(((settings && settings.members) || {}).oldestAge);
  const oldestAge = Number.isFinite(age) && age > 0 ? age : null;
  const pricedForAge = oldestAge !== null && oldestAge < GAP_PRICED_UNDER;
  const when = opts && opts.now;
  const rows = plans.map(p0 => {
    const p = priceAt(p0, when);
    const typed = quoteOf(settings, 'gap.' + p.id);
    const monthly = typed !== null ? typed : num(p.monthly) ? p.monthly : null;
    /* a row sold only to younger families (Zestlife Optimal: under 42) */
    const forAge = pricedForAge && (!p.pricedUnder || oldestAge < p.pricedUnder);
    const ageLimited = typed === null && monthly !== null && !forAge;
    return { ...p, monthly, annual: monthly !== null ? monthly * 12 : null, quoted: typed !== null, ageLimited, gainIfSwitch: monthly !== null && !ageLimited ? gap.paid - monthly * 12 : null };
  });
  return {
    current: { annual: gap.paid, monthly: gap.paid / 12 }, oldestAge, pricedForAge,
    ageNote: pricedForAge ? null : 'Rival prices shown are for under 45s.',
    rows: byGain(rows),
  };
}

/* insure: the Insure product — paid per year, the latest monthly debit
   and the Drive line. Car
   premiums are personal, so nothing is priced until a quote is typed;
   breakEven is the monthly quote at which that insurer, after its own
   rewards, matches Discovery less the Drive rewards. */
function compareInsure(insure, settings, insurers = INSURERS) {
  if (!insure || !(insure.paid > 0) || insure.ended) return null;
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
  if (!life || !(life.monthly > 0) || life.ended) return null;
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

module.exports = { NEEDS, GRADES, coverOf, planPriceValidFor, priceAt, GAP_PRICED_UNDER, HEALTH_PLANS, HEALTH_OWN, GAP_PLANS, INSURERS, LIFE_OFFERS, LIFE_BENCHMARK, HOME_INSURERS, HOME_RANGE, healthPremium, compareHealth, compareGap, compareInsure, compareLife, compareHome };
