# Discovery Calculator

**The bottom line on Discovery:** is Discovery Bank paying for itself, would you be better off at another bank — and what does the rest of your Discovery bill (medical aid, gap cover, car insurance, life cover) cost against what comes back?

An Obsidian plugin for South African Discovery clients. It reads the transactions you already keep in Obsidian with the **Budget Vault** plugin, and your **Discovery Miles statement**, and builds a statement for the last 12 complete months.

## What you need

- **The Budget Vault plugin** (`budget-app`, by the same author) with your bank transactions imported. Discovery Calculator reads its notes: `Transactions/<account>/<YYYY-MM>.md`, with `Accounts/` and `Categories/` beside them. Without them the page says it found no budget.
- **Optional, recommended: your Discovery Miles statement.** In Discovery Bank online, open *Discovery Miles → Download transactions* and save the CSV anywhere in your vault. It is found automatically. Bank statements do not show Miles, and the Miles statement names who paid each reward (Vitality Money or Vitality Health), so with it most figures are read rather than estimated.
- Obsidian 1.8 or later, on desktop or mobile.

## Install

Until the plugin is in Obsidian's community directory, install it by hand: download `main.js`, `manifest.json` and `styles.css` from the latest release into `<your vault>/.obsidian/plugins/discovery-calculator/`, then turn it on under *Settings → Community plugins*. Open it from the calculator icon in the ribbon or the command *Discovery Calculator: Open the bottom line*.

## What the page shows

One tab at a time:

- **Overview** — the bank verdict (as a range, from a cautious view to the central figure), the whole Discovery bill and what came back in cash, whether Vitality Health is worth its premium, a worth-it verdict for every product (also in the sidebar), and dates to watch.
- **Compare** — stay with Discovery or move everything away: each cost and each benefit side by side (the other bank you chose, the cheapest medical aid and gap cover that cover what you need, and your own car and life quotes), with the total for both. Anything nobody has priced is taken as the same price on both sides, and the page says so.
- **Flows** — an animated diagram of where your money goes and what comes back; tap a product to follow it.
- **Bank** — what the Suite costs, what you would lose by leaving (Miles, the Vitality Money boosts, the Active Rewards gameboard, the Apple Watch, interest boosts, the bank's share of flight discounts), the same card spend at other South African banks, and a cheaper Discovery product (the Black Credit Card Account on its own).
- **Health, Gap cover, Insure, Life** — premiums, claims paid back, and how each compares with other providers: medical aids, gap cover, car and household contents insurers, and an individual policy against an employer's group life scheme.
- **Inputs** — everything you can set: statuses, receipt totals, the split of your Discovery Health debit, your own quotes, and any rate you want to change.

Every figure says where it came from — *From your statements*, *From your Miles statement*, *You entered* or *Estimate* — and every rate behind an estimate names its source and date and can be edited beside the line it changes.

## What it reads and writes

- It reads the Budget Vault notes and **every `.csv` file in the vault** — opening each once to see whether it is a Discovery Miles statement, then only again when the file changes.
- It writes **only its own settings** (`.obsidian/plugins/discovery-calculator/data.json`), where your statuses, typed figures and quotes are kept.
- **Nothing leaves your vault.** No network requests, no account, no payment, no telemetry.

## Limits

- Rates are Discovery's published 2026 figures (the Black rewards guide as at 1 January 2026, the fees guides from 1 September 2026, the 2026 Vitality Drive guide). Discovery changes them every year — check the dates beside each rate.
- The Vitality Money spend-band tables are loaded for **Diamond**; at other statuses those estimates read 0 until you type a rate. With a Miles statement this matters little, because the statement replaces the estimates.
- Other banks', medical aids', gap cover and insurers' figures are their published prices; some reward rates are unpublished (named on the page). Type your own quotes for a true comparison.
- **This is a calculator, not financial advice.**

**Not affiliated with, endorsed by or sponsored by** Discovery Limited, Discovery Bank, Discovery Health, Discovery Insure, Discovery Life, Vitality, or any other bank, medical scheme or insurer named. All names are trademarks of their owners, used only to identify the products compared.

## Developing

```bash
./build.sh                                  # bundle src/ → main.js, run the tests
DISCOVERY_CALC_VAULT_PATH="/path/to/vault" ./scripts/deploy.sh
```

`main.js` and `styles.css` are build output — edit `src/`. CI rebuilds them and fails if the committed files differ. A tag equal to `manifest.json`'s version (no `v`) runs the release workflow, which builds, tests, attests and publishes the three files.

```bash
node scripts/real-vault.cjs "/path/to/vault"          # the statement for a real vault, printed to the terminal
npm run preview && python3 -m http.server 8832          # then open /_preview/preview.html
```

The preview runs the real page over a made-up household's budget.

**Personal figures stay in the vault, never in this repo.** Never commit what `real-vault.cjs` prints, and never copy a real figure, name or account number into a test or the preview.

**Images.** The welcome picture and the provider logos live in `assets/` and are embedded into `src/assets.js` by `npm run assets` (run it after changing an image, then `./build.sh`). Logos sit in the page header and in each product's tab and heading, never in the data. `assets/provider-logos/` keeps the other providers' logos, not embedded. The welcome screen can be switched off in the plugin's settings.

## Licence

AGPL-3.0-only covers the code. The logos and the welcome picture belong to Discovery and the other providers, are used only to label them, and are not under that licence.
