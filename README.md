# Is Discovery Worth It?

**Is each Discovery product worth what you pay for it, for you?**

This is a plugin for South African Discovery clients. It reads the bank transactions you already keep in Obsidian with the Budget plugin and works out, product by product, what you pay Discovery and what comes back to you. Then it compares each product with what other providers charge.

It counts a benefit only at the value it has for you. A gym discount is worth nothing if you never go to the gym. A flight discount is worth nothing if you never fly. You tell it which benefits you use, and the answer changes to match.

No account, no network, no telemetry and no AI. Everything is worked out on your device from your own notes.

## What you need

- **The Budget plugin** (id `budget-app`) with your bank statements imported. This plugin reads its notes: `Transactions/<account>/<YYYY-MM>.md`, with `Accounts/` and `Categories/` beside them. Without them it finds no budget and says so.
- **Optional, recommended: your Discovery Miles statement.** In Discovery Bank online, open *Discovery Miles*, then *Download transactions*, and save the CSV anywhere in your vault. It is found by its header, wherever it is. Bank statements do not show Miles, and the Miles statement names who paid each reward, so with it more figures are read from your own records and fewer are estimated.
- Obsidian 1.8 or later, on desktop or phone.

## First run

On first open it asks a few questions, one at a time. You can go back at any step, and you can skip the lot and answer later under Inputs.

1. **Which Discovery products do you have?** Bank, medical aid, gap cover, car and home insurance, life cover. The list is pre-ticked from what your statements show, with a line saying why. Untick or tick to correct it. Products you do not have get no tab and are left out of the totals and the comparison.
2. **Your status** in each Vitality programme you have, and your bank Suite.
3. **Your household,** adults and children, and your medical aid plan (guessed from your monthly debit, and yours to change).
4. **Which benefits do you actually use?** One row per benefit, with a suggestion taken from your statements and the reason for it. For each, choose:
   - **I use it:** counts in full.
   - **Sometimes:** counts for half.
   - **Not for me:** counts for nothing.

Costs are never reduced. You pay them whether or not you use the benefit. Only the value you get back is weighed by how much of it is really yours.

## The tabs

- **Overview.** A verdict for each product you have and the whole Discovery bill against what comes back, with dates to watch.
- **Compare.** Stay with Discovery, or move everything away. Each cost and each benefit side by side, with a total for both. Anything nobody has priced is taken as the same on both sides, and the page says so.
- **Flows.** An animated diagram of where your money goes and what comes back. Tap a product to follow it.
- **Bank.** What your Suite costs, what you would lose by leaving, and the same card spend at other South African banks.
- **Health.** Premium, claims paid back, and how your plan compares with other medical aids.
- **Gap.** Gap cover against other providers.
- **Insure.** Car and home insurance against other insurers.
- **Life.** An individual policy against other cover, including an employer's group scheme.
- **Inputs.** Everything you can set: statuses, your plan, the benefits you use, your own quotes, and any rate you want to change.

Only the products you said you have show up.

## Where every number comes from

Each figure is labelled with where it came from, so you can judge it:

- **From your statements:** read from your Budget notes.
- **From your Miles statement:** read from the CSV.
- **You entered:** typed by you.
- **Estimate:** worked out from a published rate, which names its source and date and can be changed beside the line it affects.

## Privacy

- It reads your Budget notes and the CSV files in your vault. Each CSV is opened once to see whether it is a Discovery Miles statement, and again only when the file changes.
- It writes **only its own settings file**, `.obsidian/plugins/discovery-worth-it/data.json`. That holds your answers, not your transactions.
- **Nothing leaves your vault.** There are no network requests, no account, no telemetry and no AI.

## Market data and how fresh it is

Prices, plans and fees for Discovery and for the other providers are written into the plugin, each set with an "as at" date shown on the Compare page. The plugin does not fetch anything. They are checked and refreshed about every six months, in a new release. When the date gets old the page says the prices may be out of date.

How the numbers are refreshed is written up in [docs/updating-market-data.html](docs/updating-market-data.html). Spotted a wrong or old price? Open an issue with the "Wrong or outdated price" form.

## Install

Until the plugin is in Obsidian's community directory, install it by hand:

1. Download `main.js`, `manifest.json` and `styles.css` from the [latest release](https://github.com/RuanPienaarCode/Is-Discovery-Worth-it-/releases/latest).
2. Put them in `<your vault>/.obsidian/plugins/discovery-worth-it/`.
3. In Obsidian, open *Settings*, then *Community plugins*, and turn on **Is Discovery Worth It?**. Open it from the calculator icon in the ribbon, or with the command palette.

Each release's files carry a build attestation, so you can check they were built from this repository:

```bash
gh attestation verify main.js -R RuanPienaarCode/Is-Discovery-Worth-it-
```

## Limits

- It can only judge what it can see. If your statements do not show a Discovery product, it will not know you have it until you say so. If you tell it you have a product it cannot see any payments for, the figures for it will be thin.
- The prices of other providers are their published prices, for a typical case. Your own quote can be higher or lower, because insurers price you, not the average person. Type your own quotes under Inputs for a fair comparison.
- Some reward rates are not published. Where that is so, the page says it is an estimate.
- Medical aids and insurers differ in ways a table cannot show: hospital networks, waiting periods, what happens to your cover history if you move. Check these before you move anything.
- Discovery changes its rewards and prices every year. Read the "as at" dates.
- **This is a calculator, not financial advice.** It does not know your whole situation, and nothing in it is a recommendation to buy, keep or cancel any product. Speak to a licensed financial adviser before you decide.

## Not affiliated

This is an independent, unofficial plugin. **It is not made, endorsed, sponsored or approved by Discovery Limited**, or by Discovery Bank, Discovery Health, Discovery Insure, Discovery Life, Vitality, or any of their companies, nor by any other bank, medical scheme or insurer named in it. Those names and brands belong to their owners. They are used only to say which product is being compared, and no endorsement is meant or implied.

All the artwork in the plugin is original, drawn for it. It contains no Discovery, Vitality or other company's logos or pictures.

## Developing

```bash
./build.sh                                   # bundle src/ into main.js, then run the tests
DISCOVERY_WORTH_IT_VAULT_PATH="/path/to/vault" ./scripts/deploy.sh
```

A green build installs nothing. `deploy.sh` copies the three built files into the vault and checks they match by hash.

- `main.js` and `styles.css` are build output. Edit `src/`, never the root files. CI rebuilds them and fails if the committed files differ.
- Styles: `src/styles.css` first, then every `src/css/*.css` file in name order, joined into `styles.css`. Every rule sits under a `dc-` class.
- Obsidian on a phone runs the system web view, so the code must work on iOS 15 Safari: no lookbehind regex, no Node APIs, no `innerHTML`, no `color-mix`, `:has()` or container queries. The tests in `tests/` check this.
- Amounts are formatted with `src/format.js`, in plain words: positive rands, with words for direction.

Preview over a made-up household, in a browser:

```bash
npm run preview
python3 -m http.server 8862      # then open http://localhost:8862/_preview/preview.html
```

To print what the plugin works out for a real vault, to the terminal only:

```bash
node scripts/real-vault.cjs "/path/to/vault"
```

**Real figures stay in your vault, never in this repository.** Never commit what that script prints. Never copy a real name, place, account number or amount into a test, the preview or an issue. The tests and the preview use an invented household.

To release, make the tag equal `manifest.json`'s version (no `v`). The release workflow builds, tests, checks the tag, attests and publishes `main.js`, `manifest.json` and `styles.css`.

## Licence

AGPL-3.0-only. See [LICENSE](LICENSE).

**Font:** the page uses Nunito, under the SIL Open Font License 1.1 ([assets/fonts/OFL.txt](assets/fonts/OFL.txt)), carried inside `main.js` (regenerate with `npm run fonts`).
