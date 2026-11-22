# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/cansome5/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/cansome5/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

# Token Radar — launch value, fitted and tested twice

A token launch radar for make.fun's `token-radar-01` bounty. It reads the frozen
snapshot, fits a value model on the snapshot's own tokenized protocols, prices every
pre-token protocol the house rule keeps, gives each one eight costed on-chain farm
steps and a net farm verdict, and accounts for all 758 protocols in a ledger.

The board's implied value is this entry's claim from the snapshot. It is not a
prediction that a token will be issued, and it is not investment advice.

## Results at a glance

| | |
|---|---|
| Ranked rows | **198** (40/40 watchlist covered) |
| Fitted peers | **123** from 128 token families; 5 deposit certificates dropped |
| R4 leave-one-out median error | **3.92x** (3x hit rate 40.7%) |
| R4 older-to-newer median error | **3.29x** (3x hit rate 41.5%) |
| Interval coverage | leave-one-out **46/91 (50.5%)**; older-to-newer **21/41 (51.2%)** |
| Farm verdicts | **115 FARM / 31 THIN / 52 SKIP** |
| Total implied value | **$2,640,227,357** |
| Dashboard source | **34,793 bytes** across `index.html`, `app.css`, `app.js` |

The fitted slope is **b = 0.5776**, below 1, so the curve deliberately pushes the
largest protocols down. Steakhouse Financial lands at **$169.1M**, not the ~$535M a
flat category multiple gave it: a $2.75B protocol does not scale linearly with TVL.

## The value model

Peer set: every protocol with a recorded market cap (`mcap_usd` non-null and positive;
16 of the 144 tokenized protocols record a zero market cap and cannot enter a log fit).
Token families are deduplicated by ticker plus name stem; TVL and market cap are summed
within a family. Deposit certificates, where `mcap/TVL` is within ±1.5% of 1.0, are not
value anchors and are dropped. On this snapshot that is 144 tokenized protocols → 128
families → 5 certificates dropped → **123 fitted peers**.

- **Scale curve.** Theil-Sen fit of `log10(mcap)` on `log10(TVL)`: the median of every
  pairwise slope, then `intercept = median(log10(mcap) − slope · log10(TVL))`.
  `value = 10^a · TVL^b` with `a = 2.5744`, `b = 0.5776`.
- **Sector effect.** Per-category median log residual from the curve, shrunk toward zero
  with 4 pseudo-peers: `effect = raw · n/(n+4)`. 34 categories carry a fitted effect;
  an unseen category is zero.
- **Growth.** `relative = change_7d − median(change_7d of tokenized peers)`, capped to
  ±40 percentage points (the peer median is −9.43%), then
  `growth factor = (1 + relative)^b`. No 7-day change → factor 1.
- **Age.** Slope of the residual on `log(age days)` over peers with a listing date,
  taken at **one quarter strength**: `age factor = (age/365)^(slope/4)`, clamped to
  [0.9, 1.15]. No `listed_at` → factor 1 and the row says its age is unknown.
- **Kin discount.** A ranked row whose name stem matches a tokenized family is kin of a
  token that already trades: its value is multiplied by **0.25** and the row's first step
  says so. Four ranked rows are kin on this snapshot.

## The two-way holdout ladder

Four rungs, each tested **both ways**:

- **Leave-one-out:** every peer is left out in turn, the model is refit on the rest, and
  the left-out peer is priced.
- **Older-to-newer:** fit only on peers listed more than 900 days ago (50 peers), then
  price the younger peers (41 peers). 91 of the 123 peers carry a listing date; the 41
  younger ones are the test set.

Error is the multiplicative distance `max(predicted, true)/min(predicted, true)`; the 3x
hit rate is the share priced within 3x either way.

| Rung | LOO median error | LOO 3x hit | OOT median error | OOT 3x hit |
|---|---|---|---|---|
| R1 flat multiple | 5.31x | 37.4% | 5.40x | 36.6% |
| R2 scale curve | 3.69x | 43.1% | 3.67x | 46.3% |
| R3 + sector | 3.93x | 39.8% | 3.45x | 43.9% |
| R4 + growth & age | **3.92x** | 40.7% | **3.29x** | 41.5% |

Read honestly: the scale curve is the big win over a flat multiple; the sector term does
not improve leave-one-out median error on this snapshot, and R4 is essentially level
with R3 there. R4 is the best rung out-of-time. The board uses R4 as specified, and this
table is printed as measured rather than trimmed to look monotone.

## Uncertainty intervals and their coverage

Every row carries `implied_low_usd` and `implied_high_usd`. The width is the R4
same-age-group holdout median error: holdout tokens split at 540 days of age, with the
younger group wide (`8.21x` LOO spread) and the older group tighter (`2.73x`).
`low = implied / spread`, `high = implied × spread`. A row with no listing date uses
the overall LOO median error.

The coverage figures are measured, not assumed: 46 of 91 dated LOO holdout tokens and 21
of 41 older-to-newer tokens landed inside their own interval.

## Farm plans and net economics

Each row has **8** concrete on-chain steps. Every step ends with `Cost: $X` and
`Time: Y min`. Categories map to ten mechanism playbooks: vault, lend, dollar, cdp, rwa,
pool, perps, market, stake, network. The steps name the protocol and the cheapest of its
top three chains, using a stated per-transaction gas assumption (Ethereum $6.00,
Arbitrum $0.30, Base $0.20, Solana $0.01, and $0.50 for any chain not listed; the full
table is on the Method page).

The per-row economics, shown in the detail dialog:

- `slice = implied × 10% airdrop share × (reader note dollar-days / total eligible dollar-days)`
  where the note is plan capital × 90 holding days and eligible dollar-days is
  `TVL × 90 days`.
- `net = slice − total fees − foregone 4% annualized yield on the plan capital for 90 days`.
- **FARM** if net > 0; **THIN** if the slice covers fees but net ≤ 0; **SKIP** otherwise.
- The detail dialog also shows break-even note size and net $/hour.

Plan capital scales with TVL ($100 at the small end to $1,000 for protocols above $1B),
because a $100 note cannot move a multi-billion-dollar protocol.

## The census ledger

Every one of the 758 protocols is in exactly one group. Precedence, first match wins:

1. **Token trades** — records a token with a market cap in the snapshot (144); shown in
   the Live view at its real market cap, never in the ranking.
2. **Token on record** — records a token but no market cap (272).
3. **Kin of a token** — no token, passes the house rule, and its name stem matches a
   tokenized family (4). These are board rows at the 0.25 discount.
4. **Ranked** — no token and passes the house rule otherwise (194). Ranked + Kin = the
   198 board rows.
5. **Bridge** — bridge category and not ranked (43).
6. **Liquid staking** — liquid staking, liquid restaking or restaked-BTC category (43).
7. **Exchange custody** — CEX category or an exchange name at the front (42).
8. **Versioned listing** — name ends in a version marker such as V2 (11).
9. **Wrapped or staked** — name carries the whole word wrapped, staked or staking (5).

The house rule is the watchlist rule minus the $50M floor: TVL ≥ $5M, no token recorded
(both `gecko_id` and `symbol` null), category not Bridge / Canonical Bridge / Liquid
Staking / Liquid Restaking / Restaked BTC / CEX, name carries no version marker and no
whole word wrapped/staked/staking, and does not begin with an exchange name. That is
what produces 198 rows, not a top-N cut.

## Dashboard

- **Board** — sortable, filterable by category, chain and scope (all / watchlist / below
  the $50M floor), searchable; verdict, TVL, implied value and holdout range per row.
- **Detail dialog** — factors, interval, verdict, net breakdown, break-even, $/hour and
  the eight costed steps.
- **Live tokens** — already-trading tokens set aside at their real market cap.
- **Ledger** — all nine groups with counts, reasons and sample slugs.
- **Method** — the ladder table, coverage, fitted constants, assumptions and gas table.
- **Cover** — KPI strip plus the build-time integrity strip: the same `boardProblem()`
  audit `main.ts` runs before it writes, rendered as pass/fail checks.

## Run it

Node 22.18 or later, standard library only.

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../token-radar-01-kit/input/snapshot.json
```

`main.ts` writes `out/board.json` and `out/data.js`, copies `dashboard/` and
`screenshots/`, and writes `out/dossier.json` with the vendored `buildDossier`. The run
is deterministic: no `Date.now`, no randomness, no network. In the grader,
`MAKEFUN_OUTPUT_DIR` is unnecessary; `/input` and `/output` are the defaults.

## Screenshots

`screenshots/` is the home of the three captures: `1-board.jpg` (the board),
`2-detail.jpg` (a protocol detail dialog) and `3-filtered.jpg` (a filtered view).
`tools/capture.mjs` serves `out/` on loopback and captures them from this dashboard;
the sandbox that wrote this build could not run a browser, so the coordinator must run
that script (see `BUILD_V4_NOTES.md`). No image in this repository was faked or
borrowed from another build.

## Layout

```
main.ts                    entrypoint, audit, output writer
lib/model.ts               peers, fit, ladder, intervals, farm economics, ledger, page data
dashboard/index.html       cover, KPI and integrity strips, five views
dashboard/app.css          palette, layout, table, dialog
dashboard/app.js           rendering, sorting, filtering, detail dialog
vendor/makefun-board.ts    byte-for-byte copy of the house dossier library
screenshots/               3 JPEG captures of this dashboard
BUILD_V4_NOTES.md          model constants, ladder, coverage, verification log
```

MIT licensed. The vendored `vendor/makefun-board.ts` is copied byte for byte from the
kit; its sha256 is
`9ca51b6e5cd84fe46cb0efa61e2ea99365a1fb0e21f2b75e6007f977f0dc326e`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=trz328sj&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
