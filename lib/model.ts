// The token radar's model: one sealed snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and adds
// pre-token protocols below the watchlist floor, chosen by CALIBRATED implied value: the early rows the
// radar exists to find. A protocol is pre-token when its index entry records no token at all (no market
// cap, no CoinGecko id, no symbol); the snapshot's live-token protocols are kept apart and shown as the
// market's own values, never mixed into the ranked board.
//
// Implied value follows only from the snapshot's own figures:
//
//   peers       = tokenized protocols with mcap_usd > 0 and tvl_usd > 0 (CEX excluded)
//   catMultiple = median(mcap_usd / tvl_usd) of the category's peers, clamped to [0.02, 1.50]
//                 a category with fewer than MIN_CATEGORY_PEERS peers takes the global median instead;
//                 with no tokenized peers at all it takes NEUTRAL_MULTIPLE (1.00), stated, never invented
//   growth      = clamp(change_7d, -60, 120) per cent
//   growthMult  = 1 + (growth / 100) x GROWTH_WEIGHT
//   maturity    = 0.6 + min(age_days, 1095) / 1095 x 0.4   (age_days unknown: 365, stated, never invented)
//   implied     = max(1, round(tvl_usd x catMultiple x growthMult x maturity))
//
// No protocol name is ever special-cased: the same calibration and the same function score every row.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants: the dashboard publishes all of them and the calibration reads them. */
export interface ModelConstants {
  multiple_floor: number;
  multiple_cap: number;
  min_category_peers: number;
  neutral_multiple: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  target_board_size: number;
  live_rows: number;
}

export const MODEL: ModelConstants = {
  multiple_floor: 0.02,
  multiple_cap: 1.5,
  min_category_peers: 3,
  neutral_multiple: 1.0,
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  target_board_size: 200,
  live_rows: 24,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-2';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = MODEL.live_rows;

/** Where a row's base multiple came from: the category's own peers, the global fallback, or the neutral default. */
export type MultipleBasis = 'category' | 'global' | 'neutral';

/** One line of the calibration table the dashboard's Method view publishes. */
export interface CalibrationRow {
  category: string;
  peers: number;
  median_multiple: number | null;
  applied_multiple: number;
  basis: MultipleBasis;
  clamped: boolean;
}

/** The global fallback calibration, shown above the per-category table. */
export interface GlobalCalibration {
  peers: number;
  median_multiple: number | null;
  applied_multiple: number;
  clamped: boolean;
}

/** The full calibration: one applied multiple per category, plus the global fallback it may use. */
export interface Calibration {
  global: GlobalCalibration;
  categories: CalibrationRow[];
  /** Applied multiple for one protocol category (a null category reads as the uncategorised bucket). */
  forCategory(category: string | null): { multiple: number; basis: MultipleBasis; clamped: boolean };
}

/** A farm step before it is flattened to the one string board.json carries. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    base_multiple: number;
    multiple_basis: MultipleBasis;
    multiple_clamped: boolean;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row. The farm plan ships in the data, identical to board.json. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  age_days: number | null;
  on_watchlist: boolean;
  implied_value_usd: number;
  base_multiple: number;
  multiple_basis: MultipleBasis;
  multiple_clamped: boolean;
  growth_multiplier: number;
  maturity_multiplier: number;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  mcap_tvl_ratio: number | null;
}

/** Everything the dashboard needs: the board, the live set, the calibration and the model constants. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  calibration: { global: GlobalCalibration; categories: CalibrationRow[] };
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const UNCATEGORISED = 'Uncategorised';

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;
const bySlugText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** A whole day count from `asOf` back to `listedAt`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of finite numbers, or null when empty. Even counts average the two middle values. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Calibrate category multiples from the snapshot's own tokenized protocols: every non-CEX protocol with
 * mcap_usd > 0 and tvl_usd > 0 contributes its mcap/TVL ratio to its category. A category with fewer than
 * min_category_peers contributors takes the global median instead. Every applied multiple, category or
 * global, is clamped to [multiple_floor, multiple_cap]; the clamp is reported, never hidden.
 */
export function calibrate(snapshot: Snapshot, model: ModelConstants = MODEL): Calibration {
  const byCategory = new Map<string, number[]>();
  const globalRatios: number[] = [];
  for (const p of snapshot.protocols) {
    if (p.category === 'CEX') continue;
    const mcap = p.mcap_usd;
    const tvl = p.tvl_usd;
    if (typeof mcap !== 'number' || !(mcap > 0) || !(tvl > 0)) continue;
    const ratio = mcap / tvl;
    globalRatios.push(ratio);
    const key = p.category ?? UNCATEGORISED;
    const list = byCategory.get(key);
    if (list === undefined) byCategory.set(key, [ratio]);
    else list.push(ratio);
  }

  const clampMultiple = (raw: number): { value: number; clamped: boolean } => {
    if (raw < model.multiple_floor) return { value: model.multiple_floor, clamped: true };
    if (raw > model.multiple_cap) return { value: model.multiple_cap, clamped: true };
    return { value: raw, clamped: false };
  };

  const globalMedian = median(globalRatios);
  let globalApplied: number;
  let globalClamped = false;
  if (globalMedian === null) {
    // No tokenized peers anywhere: a neutral 1.00x (TVL taken at face value), stated in the dashboard.
    globalApplied = model.neutral_multiple;
  } else {
    const g = clampMultiple(globalMedian);
    globalApplied = round6(g.value);
    globalClamped = g.clamped;
  }

  const rows: CalibrationRow[] = [];
  const applied = new Map<string, { multiple: number; basis: MultipleBasis; clamped: boolean }>();
  for (const key of [...byCategory.keys()].sort(bySlugText)) {
    const ratios = byCategory.get(key)!;
    const med = median(ratios);
    if (ratios.length < model.min_category_peers || med === null) {
      const basis: MultipleBasis = globalMedian === null ? 'neutral' : 'global';
      const clamped = globalMedian === null ? false : globalClamped;
      rows.push({ category: key, peers: ratios.length, median_multiple: med === null ? null : round4(med), applied_multiple: globalApplied, basis, clamped });
      applied.set(key, { multiple: globalApplied, basis, clamped });
    } else {
      const c = clampMultiple(med);
      const value = round6(c.value);
      rows.push({ category: key, peers: ratios.length, median_multiple: round4(med), applied_multiple: value, basis: 'category', clamped: c.clamped });
      applied.set(key, { multiple: value, basis: 'category', clamped: c.clamped });
    }
  }

  return {
    global: { peers: globalRatios.length, median_multiple: globalMedian === null ? null : round4(globalMedian), applied_multiple: globalApplied, clamped: globalClamped },
    categories: rows,
    forCategory(category: string | null): { multiple: number; basis: MultipleBasis; clamped: boolean } {
      const hit = applied.get(category ?? UNCATEGORISED);
      if (hit !== undefined) return hit;
      // A category the tokenized set never names: no category peers at all, so the global fallback applies.
      return { multiple: globalApplied, basis: globalMedian === null ? 'neutral' : 'global', clamped: globalMedian === null ? false : globalClamped };
    },
  };
}

/** The three multipliers, the base multiple and the implied value one protocol gets under `model` and `calibration`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  calibration: Calibration,
): {
  implied: number;
  baseMultiple: number;
  basis: MultipleBasis;
  clamped: boolean;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  age: number | null;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const { multiple, basis, clamped } = calibration.forCategory(protocol.category);
  const implied = Math.max(1, Math.round(protocol.tvl_usd * multiple * growthMult * maturityMult));
  return { implied, baseMultiple: multiple, basis, clamped, growthPct, growthMult, maturityMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The snapshot's protocols by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(
  snapshot: Snapshot,
  model: ModelConstants = MODEL,
  calibration: Calibration = calibrate(snapshot, model),
): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug the snapshot carries is chosen before any early row.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: rankable pre-token protocols below the watchlist floor, scored with the calibrated
  // model and chosen by implied value (never TVL alone), until the board reaches its target size.
  const earlyBudget = Math.max(0, model.target_board_size - chosen.size);
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .map((p) => ({ p, score: impliedValue(p, snapshot.as_of, model, calibration) }))
    .sort((a, b) => b.score.implied - a.score.implied || bySlugText(a.p.slug, b.p.slug))
    .slice(0, earlyBudget);
  for (const e of early) chosen.set(e.p.slug, e.p);

  const scored = [...chosen.values()].map((p) => ({ p, s: impliedValue(p, snapshot.as_of, model, calibration) }));
  scored.sort((a, b) => b.s.implied - a.s.implied || bySlugText(a.p.slug, b.p.slug));
  return scored.map(({ p, s }, i) => ({
    rank: i + 1,
    slug: p.slug,
    name: p.name,
    category: p.category,
    chains: p.chains,
    tvl_usd: p.tvl_usd,
    change_7d: p.change_7d,
    mcap_usd: p.mcap_usd,
    listed_at: p.listed_at,
    gecko_id: p.gecko_id,
    symbol: p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      base_multiple: s.baseMultiple,
      multiple_basis: s.basis,
      multiple_clamped: s.clamped,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(p, s.age).map(stepText),
  }));
}

/** A step as one string: its action, then its cost and time, kept inside the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Keep the position open and re-check it on the protocol's own dashboard.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL: the four tiers the brief fixes. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** A gas estimate for one core action, a little higher for the positions that move more capital. */
function gasFor(capital: number): number {
  return capital >= 150 ? 8 : 4;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
export function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/**
 * The category's one verifiable on-chain action, in the words a farmer can follow. Every action is a
 * real interaction the protocol's own app supports (supply, LP, bridge, stake, margin, vault deposit);
 * no reward program, token name or launch date is claimed, because the snapshot carries none.
 */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral') || c.includes('credit')) {
    return `Supply $${capital} of USDC to ${name} on ${chain} and keep the supply position open.`;
  }
  if (c.includes('dex') || c.includes('amm') || c.includes('swap')) {
    return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the LP position open.`;
  }
  if (c.includes('bridge') || c.includes('cross')) {
    return `Bridge $${capital} of USDC to ${chain} through ${name} and keep the bridged balance in its app.`;
  }
  if (c.includes('restak')) {
    return `Restake $${capital} of a liquid staking asset through ${name} on ${chain} and keep the receipt.`;
  }
  if (c.includes('stak') || c.includes('liquid staking') || c.includes('lst')) {
    return `Stake $${capital} of the chain's staking asset through ${name} on ${chain} and keep the staking receipt.`;
  }
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('option') || c.includes('future')) {
    return `Deposit $${capital} of USDC as margin on ${name} on ${chain} and open one small hedge position.`;
  }
  if (c.includes('prediction') || c.includes('bet') || c.includes('lottery') || c.includes('gamble')) {
    return `Fund $${capital} of USDC on ${name} on ${chain} and place one market position, then leave the rest in the app.`;
  }
  if (c.includes('curator') || c.includes('allocator') || c.includes('vault') || c.includes('yield') || c.includes('aggregator') || c.includes('leveraged farm')) {
    return `Deposit $${capital} of USDC into a ${name} vault on ${chain} and keep the vault shares.`;
  }
  if (c.includes('stable') || c.includes('mint') || c.includes('reserve')) {
    return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and keep it held.`;
  }
  if (c.includes('rwa')) {
    return `Deposit $${capital} into ${name}'s yield-bearing asset on ${chain} and keep the position.`;
  }
  if (c.includes('insurance') || c.includes('cover')) {
    return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy open.`;
  }
  if (c.includes('synthetic')) {
    return `Deposit $${capital} of USDC as collateral on ${name} on ${chain} and mint one small synthetic position.`;
  }
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/**
 * A second, smaller on-chain interaction that proves real use of the app beyond the first deposit. The
 * staking branch is deliberately conditional: it never asserts that claimable rewards exist.
 */
function secondActionFor(p: SnapshotProtocol, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral') || c.includes('credit')) {
    return `Borrow a small amount against the ${name} supply on ${chain} and repay it within the week.`;
  }
  if (c.includes('dex') || c.includes('amm') || c.includes('swap')) {
    return `Make one swap in ${name} on ${chain} and then re-add the proceeds to the same liquidity pool.`;
  }
  if (c.includes('bridge') || c.includes('cross')) {
    return `Move a small amount back across the ${name} bridge on ${chain} so the wallet has activity on both chains.`;
  }
  if (c.includes('stak') || c.includes('restak') || c.includes('lst')) {
    return `Open ${name} on ${chain}: if the app's own interface shows claimable staking rewards, claim and restake them from that same page; if it shows none, skip this action and leave the position untouched.`;
  }
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('option') || c.includes('future')) {
    return `Close the open ${name} position on ${chain} and open a new one of similar size in the same week.`;
  }
  if (c.includes('prediction') || c.includes('bet') || c.includes('lottery') || c.includes('gamble')) {
    return `Place one more small market position on ${name} on ${chain} and let the first one settle.`;
  }
  if (c.includes('governance') || c.includes('dao') || c.includes('vote')) {
    return `Cast one vote in ${name}'s governance on ${chain} using the position already held.`;
  }
  return `Make a second on-chain action inside ${name} on ${chain}, such as a small withdraw and re-deposit, from the app's own page.`;
}

/**
 * A protocol's farm plan: six steps, each an action with a gas plus capital cost and a time. The plan is
 * derived from the protocol's own record (category, chains, TVL, age), never from a hand-written list of
 * names, and every action is verifiable on chain. No reward program, airdrop, token or launch date is
 * claimed anywhere.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const gas = gasFor(capital);
  const hold = holdDaysFor(age);
  return [
    {
      text: `Set up a fresh wallet that holds only the funds for this farm, write the seed phrase offline, and send it $${capital} of USDC plus a little of ${chain}'s gas asset.`,
      cost: `$${capital} of capital plus under $3 of gas to fund the wallet`,
      time: '10 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital and about $${gas} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: secondActionFor(p, chain),
      cost: 'no new capital beyond the position and about $3 of gas',
      time: '20 minutes within the first week',
    },
    {
      text: `Make one qualifying on-chain action each week inside ${p.name}, such as a deposit, a borrow, a swap, a claim or a vote, so the wallet shows repeated activity.`,
      cost: 'no new capital and about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot, and keep the receipt assets in the farming wallet.`,
      cost: `the $${capital} of capital stays in the position and no gas is needed while holding`,
      time: `${hold} days`,
    },
    {
      text: `Verify every transaction on ${chain}'s block explorer and in ${p.name}'s own dashboard, record the wallet, dates and transaction hashes in a farm log, and plan an exit that sells into the pool's deepest pair.`,
      cost: 'no new capital and under $5 of gas for the final withdrawal',
      time: '15 minutes, then a monthly check',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. Never ranked. */
export function liveRows(snapshot: Snapshot, model: ModelConstants = MODEL): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd || bySlugText(a.slug, b.slug))
    .slice(0, model.live_rows)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      mcap_tvl_ratio: p.mcap_usd !== null && p.tvl_usd > 0 ? round4(p.mcap_usd / p.tvl_usd) : null,
    }));
}

/** A board row's compact form for data.js, carrying the same farm strings board.json carries. */
export function radarRow(row: BoardRow, onWatchlist: boolean): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    gecko_id: row.gecko_id,
    symbol: row.symbol,
    age_days: row.age_days,
    on_watchlist: onWatchlist,
    implied_value_usd: row.implied_value_usd,
    base_multiple: row.model.base_multiple,
    multiple_basis: row.model.multiple_basis,
    multiple_clamped: row.model.multiple_clamped,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const calibration = calibrate(snapshot, model);
  const board = buildBoard(snapshot, model, calibration);
  const live = liveRows(snapshot, model);
  const watch = new Set(snapshot.watchlist);
  const early = board.filter((r) => !watch.has(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    calibration: { global: calibration.global, categories: calibration.categories },
    rows: board.map((r) => radarRow(r, watch.has(r.slug))),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
