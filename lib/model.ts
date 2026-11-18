// Calibrated peer radar - the value model for the token-radar-01 v3 entry.
//
// Everything here is pure: the caller hands in the parsed snapshot and gets back a ranked board
// plus the metadata the dashboard renders. No protocol is special-cased by name. The model reads
// two things from the snapshot itself:
//   * what already-tokenised protocols in each category are worth, as market cap over TVL, and
//   * how much TVL a pre-token protocol holds, how fast it is growing, and how long it has run.
//
// A category with fewer than three tokenised peers is too thin to trust, so its protocols borrow
// the global median instead. Every applied multiple is clamped to a sane band; nothing is smoothed
// by hand, and an absurd raw median is still shown as it is in the calibration table.

export interface Protocol {
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

export interface Snapshot {
  as_of: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

export type Basis = 'category' | 'global' | 'neutral';

export interface CategoryStat {
  peers: number;
  observed: number | null;
  applied: number;
  basis: Basis;
  clamped: boolean;
}

export interface CalibrationBook {
  peerCount: number;
  globalMedian: number | null;
  globalApplied: number;
  byCategory: Map<string, CategoryStat>;
  /** The stat that applies to a protocol's category, including the fallback path. */
  slot(category: string | null): CategoryStat;
}

export interface ModelNote {
  base_multiple: number;
  basis: Basis;
  peers: number;
  observed_median: number | null;
  clamped: boolean;
  growth_multiple: number;
  maturity_multiple: number;
  age_days: number;
  age_known: boolean;
}

export interface Row {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  farm_steps: string[];
  category: string | null;
  chains: string[];
  chain: string;
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  scope: 'watchlist' | 'early';
  model: ModelNote;
}

export interface CalibrationRow {
  category: string;
  peers: number;
  observed_median: number | null;
  applied_multiple: number;
  basis: Basis;
  clamped: boolean;
  rows_on_board: number;
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chain: string;
  tvl_usd: number;
  mcap_usd: number;
  mcap_to_tvl: number;
}

export interface FallbackHighlight {
  name: string;
  rank: number;
  peers: number;
}

export interface RadarMeta {
  schema: string;
  entry: string;
  model: string;
  as_of: string;
  floor_usd: number;
  protocol_count: number;
  watchlist_count: number;
  board_size: number;
  early_size: number;
  global: { peer_count: number; median: number | null; applied: number };
  constants: Record<string, number>;
  calibration: CalibrationRow[];
  live: LiveRow[];
  fallback_note: string;
  fallback: { risk_curators: FallbackHighlight | null; onchain_allocator: FallbackHighlight | null };
}

export interface Radar {
  board: Row[];
  meta: RadarMeta;
}

export const TARGET_BOARD_SIZE = 200;
export const LIVE_ROWS = 24;

export const MODEL_CONSTANTS: Record<string, number> = {
  multiple_floor: 0.02,
  multiple_cap: 1.5,
  min_category_peers: 3,
  neutral_multiple: 1,
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  target_board_size: TARGET_BOARD_SIZE,
  live_rows: LIVE_ROWS,
};

/** Clamp a finite number into [lo, hi]. */
function clamp(value: number, lo: number, hi: number): number {
  return value < lo ? lo : value > hi ? hi : value;
}

/** Ordinary median: the middle value, or the mean of the two middle values for an even count. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A YYYY-MM-DD day as a UTC millisecond stamp, or null when the text is not a day. */
function utcDay(text: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (match === null) return null;
  const stamp = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isFinite(stamp) ? stamp : null;
}

/** How many whole days the protocol had been tracked by the snapshot day. Null date is explicit. */
function ageOf(listedAt: string | null, asOf: string): { days: number; known: boolean } {
  const end = utcDay(asOf);
  if (end === null) throw new Error(`snapshot has an unreadable as_of date: ${asOf}`);
  const start = listedAt === null ? null : utcDay(listedAt);
  if (start === null) return { days: MODEL_CONSTANTS.unknown_age_days!, known: false };
  return { days: Math.max(0, Math.floor((end - start) / 86_400_000)), known: true };
}

/** Growth multiplier: half the clamped seven-day percentage change, so the band is [0.70, 1.60]. */
function growthOf(change: number | null): number {
  if (change === null || !Number.isFinite(change)) return 1;
  return 1 + clamp(change, MODEL_CONSTANTS.growth_floor!, MODEL_CONSTANTS.growth_cap!) / 100 * MODEL_CONSTANTS.growth_weight!;
}

/** Maturity multiplier: age credits up to three years, then stops; the floor is 0.60. */
function maturityOf(ageDays: number): number {
  const span = Math.min(ageDays, MODEL_CONSTANTS.maturity_days!) / MODEL_CONSTANTS.maturity_days!;
  return MODEL_CONSTANTS.maturity_floor! + span * MODEL_CONSTANTS.maturity_range!;
}

/** Validate just enough of the synthetic snapshot shape to give a useful error, not a crash. */
export function parseSnapshot(text: string): Snapshot {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(`snapshot is not valid JSON: ${(error as Error).message}`);
  }
  if (typeof value !== 'object' || value === null) throw new Error('snapshot must be a JSON object');
  const raw = value as Record<string, unknown>;
  if (typeof raw.as_of !== 'string') throw new Error('snapshot.as_of must be a date string');
  if (typeof raw.floor_usd !== 'number' || !Number.isFinite(raw.floor_usd)) {
    throw new Error('snapshot.floor_usd must be a finite number');
  }
  if (!Array.isArray(raw.protocols)) throw new Error('snapshot.protocols must be an array');
  if (!Array.isArray(raw.watchlist)) throw new Error('snapshot.watchlist must be an array of slugs');
  const protocols = raw.protocols.map((entry, index) => {
    if (typeof entry !== 'object' || entry === null) throw new Error(`protocols[${index}] is not an object`);
    const p = entry as Record<string, unknown>;
    if (typeof p.slug !== 'string' || p.slug.length === 0) throw new Error(`protocols[${index}].slug is missing`);
    if (typeof p.name !== 'string' || p.name.length === 0) throw new Error(`protocols[${index}].name is missing`);
    if (!Array.isArray(p.chains)) throw new Error(`protocol ${p.slug}: chains must be an array`);
    if (typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) throw new Error(`protocol ${p.slug}: tvl_usd must be a number`);
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: p.chains.map((chain) => String(chain)),
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  const watchlist = raw.watchlist.map((slug, index) => {
    if (typeof slug !== 'string' || slug.length === 0) throw new Error(`watchlist[${index}] is not a slug`);
    return slug;
  });
  return { as_of: raw.as_of, floor_usd: raw.floor_usd, protocols, watchlist };
}
/**
 * Read every non-CEX protocol whose market cap and TVL are both positive, take its mcap/TVL
 * ratio, and build per-category and global medians. The global median is the fallback for any
 * category with fewer than three peers; a category with no peers at all still uses it.
 */
export function calibrate(snapshot: Snapshot): CalibrationBook {
  const ratios = new Map<string, number[]>();
  const all: number[] = [];
  for (const protocol of snapshot.protocols) {
    if (protocol.category === 'CEX') continue;
    if (!(protocol.tvl_usd > 0)) continue;
    if (protocol.mcap_usd === null || !(protocol.mcap_usd > 0)) continue;
    const ratio = protocol.mcap_usd / protocol.tvl_usd;
    if (!Number.isFinite(ratio)) continue;
    all.push(ratio);
    if (protocol.category !== null) {
      const bucket = ratios.get(protocol.category);
      if (bucket === undefined) ratios.set(protocol.category, [ratio]);
      else bucket.push(ratio);
    }
  }

  const globalMedian = median(all);
  const globalApplied = globalMedian === null
    ? MODEL_CONSTANTS.neutral_multiple!
    : clamp(globalMedian, MODEL_CONSTANTS.multiple_floor!, MODEL_CONSTANTS.multiple_cap!);

  const byCategory = new Map<string, CategoryStat>();
  for (const [category, values] of ratios) {
    const observed = median(values)!;
    if (values.length >= MODEL_CONSTANTS.min_category_peers!) {
      const applied = clamp(observed, MODEL_CONSTANTS.multiple_floor!, MODEL_CONSTANTS.multiple_cap!);
      byCategory.set(category, {
        peers: values.length,
        observed,
        applied,
        basis: 'category',
        clamped: applied !== observed,
      });
    } else {
      byCategory.set(category, {
        peers: values.length,
        observed,
        applied: globalApplied,
        basis: globalMedian === null ? 'neutral' : 'global',
        clamped: false,
      });
    }
  }

  const slot = (category: string | null): CategoryStat => {
    if (category !== null) {
      const found = byCategory.get(category);
      if (found !== undefined) return found;
    }
    return {
      peers: 0,
      observed: null,
      applied: globalApplied,
      basis: globalMedian === null ? 'neutral' : 'global',
      clamped: false,
    };
  };

  return { peerCount: all.length, globalMedian, globalApplied, byCategory, slot };
}

/** A name that is a version instance ("Curve V2", "Pool 3.0") rather than a distinct protocol. */
function versionedName(name: string): boolean {
  return /(?:^|\s)[vV]\d+(?:\.\d+)?\s*$/.test(name) || /(?:^|\s)\d+\.0\s*$/.test(name);
}

/** The group a category belongs to for the farm plan's concrete action. */
function categoryFamily(category: string | null): string {
  switch (category) {
    case 'Bridge':
    case 'Canonical Bridge':
    case 'Cross Chain Bridge':
      return 'bridge';
    case 'Lending':
    case 'CDP Manager':
    case 'Uncollateralized Lending':
      return 'lending';
    case 'Liquid Staking':
    case 'Liquid Restaking':
    case 'Restaking':
    case 'Staking Pool':
      return 'staking';
    case 'RWA':
    case 'Collateral Markets':
    case 'Collateral Management':
      return 'rwa';
    case 'Yield':
    case 'Yield Aggregator':
    case 'Farm':
    case 'Leveraged Farming':
      return 'yield';
    case 'Risk Curators':
    case 'Onchain Capital Allocator':
    case 'Governance Incentives':
      return 'curator';
    case 'CDP':
    case 'Dual-Token Stablecoin':
    case 'Algo-Stables':
    case 'Stablecoin Issuer':
    case 'Reserve Currency':
    case 'Stablecoin Wrapper':
      return 'stable';
    case 'Dexs':
      return 'dex';
    case 'Derivatives':
    case 'Options':
    case 'Options Vault':
    case 'Interest Rate Derivatives':
    case 'Synthetics':
      return 'derivatives';
    case 'Basis Trading':
      return 'basis';
    case 'Privacy':
      return 'privacy';
    case 'Indexes':
      return 'index';
    default:
      return 'generic';
  }
}

const CHAIN_GAS: Record<string, string> = {
  Ethereum: '$3-$12',
  Arbitrum: '$0.10-$0.80',
  Base: '$0.05-$0.60',
  Optimism: '$0.10-$0.80',
  Polygon: '$0.05-$0.40',
  'Polygon zkEVM': '$0.10-$1',
  Solana: '$0.01-$0.10',
  TON: 'about $0.10',
  'BNB Chain': '$0.10-$0.30',
  Avalanche: '$0.20-$1',
  Sui: '$0.02-$0.10',
  Aptos: '$0.02-$0.10',
  Tron: '$0.20-$0.80',
  Sonic: '$0.10-$0.50',
  Berachain: '$0.10-$0.60',
  Hyperliquid: '$0.05-$0.50',
  Mantle: '$0.05-$0.40',
  Linea: '$0.10-$0.80',
  Scroll: '$0.10-$0.80',
};

function gasFor(chain: string): string {
  return CHAIN_GAS[chain] ?? '$0.50-$5';
}

const NATIVE_ASSET: Record<string, string> = {
  Ethereum: 'ETH',
  Arbitrum: 'ETH',
  Base: 'ETH',
  Optimism: 'ETH',
  'Polygon zkEVM': 'ETH',
  Linea: 'ETH',
  Scroll: 'ETH',
  Mantle: 'MNT',
  Polygon: 'POL',
  Solana: 'SOL',
  TON: 'TON',
  'BNB Chain': 'BNB',
  Avalanche: 'AVAX',
  Sui: 'SUI',
  Aptos: 'APT',
  Tron: 'TRX',
  Sonic: 'S',
  Berachain: 'BERA',
};

function nativeFor(chain: string): string {
  return NATIVE_ASSET[chain] ?? 'the chain\'s gas asset';
}

/** The capital band the plan commits, from the protocol's own TVL. */
function capitalFor(tvl: number): number {
  if (tvl >= 5_000_000_000) return 250;
  if (tvl >= 1_000_000_000) return 150;
  if (tvl >= 100_000_000) return 100;
  return 50;
}

/** How long the plan holds before a full review, from how long the protocol has run. */
function holdFor(ageDays: number, ageKnown: boolean): number {
  if (!ageKnown) return 30;
  if (ageDays >= 730) return 60;
  if (ageDays >= 365) return 45;
  return 30;
}

/** What the first step buys: the chain asset for staking and pools, otherwise a stable. */
function fundingAsset(category: string | null, chain: string): string {
  const family = categoryFamily(category);
  if (family === 'staking' || family === 'dex' || family === 'stable') return nativeFor(chain);
  return 'USDC';
}
/**
 * Six steps for one protocol: fund, enter the category's real on-chain action, maintain, risk-check,
 * exit, then a conditional staking/rewards check. The last step never asserts that a reward exists:
 * it says to act only when the protocol's own app displays a claimable balance, and to skip it
 * otherwise. Every step names its capital, its time, and its gas cost (zero where it moves no funds).
 */
function farmPlan(protocol: Protocol, ageDays: number, ageKnown: boolean): string[] {
  const chain = protocol.chains[0] ?? 'its primary chain';
  const family = categoryFamily(protocol.category);
  const capital = capitalFor(protocol.tvl_usd);
  const gas = gasFor(chain);
  const hold = holdFor(ageDays, ageKnown);
  const asset = fundingAsset(protocol.category, chain);
  const native = nativeFor(chain);

  const funded = `Fund the position: move about $${capital} of ${asset} plus $10 for gas to a self-custody wallet on ${chain}. Capital $${capital}; time 10-20 min; network fee ${gas}. Check the contract address on the protocol's own site before the first signature.`;

  let entered: string;
  switch (family) {
    case 'dex':
      entered = `Provide liquidity on ${chain}: swap half of the $${capital} into USDC and add a two-sided $${capital} position in the deepest pool the protocol lists. Capital $${capital}; time 10-15 min; gas ${gas}; keep slippage at 0.5% or lower.`;
      break;
    case 'lending':
      entered = `Lend and borrow: supply $${capital} of USDC as collateral in the deepest market and borrow at most 40% of it, in the same asset, back into your wallet. Capital $${capital}; time 20 min; gas ${gas}; keep the health factor above 1.8.`;
      break;
    case 'staking':
      entered = `Stake: stake $${capital} of ${native} through the protocol on ${chain} and hold the receipt asset in your own wallet. Capital $${capital}; time 5-15 min; gas ${gas}; do not redeposit the receipt into a second farm.`;
      break;
    case 'rwa':
      entered = `Subscribe to a vault: put $${capital} into the shortest-maturity vault whose issuer, collateral and redemption terms are published on the protocol's site. Capital $${capital}; time 20-30 min; gas ${gas}; keep the position with one issuer.`;
      break;
    case 'yield':
      entered = `Deposit: put $${capital} into the highest-TVL vault on ${chain}, not the one advertising the highest yield, and keep a 10% cash buffer outside it. Capital $${capital}; time 10-20 min; gas ${gas}; read the withdrawal queue first.`;
      break;
    case 'curator':
      entered = `Deposit into a curated vault: put $${capital} into the curator's largest vault that publishes its allocator, fee and withdrawal queue. Capital $${capital}; time 10-20 min; gas ${gas}; confirm the vault cap before signing.`;
      break;
    case 'stable':
      entered = `Mint: deposit $${capital} of ${native} as collateral and mint no more than half its value in the protocol's stable asset, then repay within 30 days to cap the stability fee. Capital $${capital}; time 20 min; gas ${gas}; keep the collateral ratio above 200%.`;
      break;
    case 'bridge':
      entered = `Bridge: move $${capital} of USDC over the protocol's route on ${chain}; send a $20 test transfer first and confirm arrival before the main transfer. Capital $${capital}; time 15-30 min; gas ${gas}; verify the destination address in the protocol's own app.`;
      break;
    case 'basis':
      entered = `Deposit: put $${capital} into the basis vault with the longest public track record and keep the funding exposure inside the vault, not on a separate derivatives account. Capital $${capital}; time 15-20 min; gas ${gas}.`;
      break;
    case 'derivatives':
      entered = `Post margin: deposit $${capital} as margin and open at most 2x in the protocol's isolated market; set a stop at 20% of the margin. Capital $${capital}; time 20 min; gas ${gas}; never enable cross-margin.`;
      break;
    case 'privacy':
      entered = `Shield: shield $${capital}, make one transfer, then unshield into a fresh address that you control. Capital $${capital}; time 20-30 min; gas ${gas}; keep the transaction records for your own accounting.`;
      break;
    case 'index':
      entered = `Mint the basket: buy $${capital} of the index through the protocol on ${chain} and rebalance only inside its published window. Capital $${capital}; time 10-15 min; gas ${gas}; check each constituent's weight first.`;
      break;
    default:
      entered = `Deposit: put $${capital} into the protocol's largest pool or market on ${chain} and keep the position visible in your own wallet. Capital $${capital}; time 10-20 min; gas ${gas}; read the exit terms before signing.`;
      break;
  }

  let maintained: string;
  switch (family) {
    case 'dex':
      maintained = `Maintain the position (capital $0; time 10 min; gas ${gas} per rebalance): rebalance the range only when price has sat outside it for 24 hours, and never more than once a week.`;
      break;
    case 'lending':
      maintained = `Maintain the position (capital $0; time 10 min; gas ${gas} per action): check the health factor weekly and repay enough to keep it above 1.5 after any price move.`;
      break;
    case 'staking':
      maintained = `Maintain the position (capital $0; time 10 min; gas ${gas} per action): track the receipt asset's exchange rate and validator set weekly; move providers only if the rate stalls or a validator exits.`;
      break;
    case 'rwa':
      maintained = `Maintain the position (capital $0; time 15 min; gas ${gas} per action): review the vault's published NAV, issuer notices and maturity ladder weekly; roll only at maturity.`;
      break;
    case 'stable':
      maintained = `Maintain the position (capital $0; time 10 min; gas ${gas} per action): check the collateral ratio weekly and add collateral or repay if it falls below 180%.`;
      break;
    default:
      maintained = `Maintain the position (capital $0; time 10 min; gas ${gas} per action): compound or rebalance at most once a week and leave the principal untouched between reviews.`;
      break;
  }

  const watched = `Risk check (capital $0; time 15 min; no gas): compare TVL and the seven-day change on the protocol's page, confirm withdrawals are open, and re-read the audit or oracle reference. Exit if TVL falls 30% in a week or a withdrawal is paused.`;

  const exited = `Exit plan (capital $0 new; time 10-30 min; gas ${gas} per withdrawal): withdraw in two parts over two days to stay under queue or cap limits. For a staking position, unbonding can run for the protocol's published period, so start it before you need the funds.`;

  const rewards = `Staking and rewards check (capital $0; time 5 min; gas ${gas} only if you transact): open the protocol's own app. If it shows a claimable staking or rewards balance, claim or compound it and save the transaction hash; if it shows none, skip this action and leave the position unchanged. Hold at least ${hold} days before the next full review.`;

  return [funded, entered, maintained, watched, exited, rewards];
}
/** Score one protocol into a board row; rank is filled in after the final ordering. */
function scoreRow(protocol: Protocol, book: CalibrationBook, scope: 'watchlist' | 'early', asOf: string): Row {
  const stat = book.slot(protocol.category);
  const age = ageOf(protocol.listed_at, asOf);
  const growth = growthOf(protocol.change_7d);
  const maturity = maturityOf(age.days);
  const implied = Math.max(1, Math.round(protocol.tvl_usd * stat.applied * growth * maturity));
  const chain = protocol.chains[0] ?? 'its primary chain';
  return {
    slug: protocol.slug,
    name: protocol.name,
    rank: 0,
    implied_value_usd: implied,
    farm_steps: farmPlan(protocol, age.days, age.known),
    category: protocol.category,
    chains: protocol.chains.slice(),
    chain,
    tvl_usd: protocol.tvl_usd,
    change_7d: protocol.change_7d,
    mcap_usd: protocol.mcap_usd,
    listed_at: protocol.listed_at,
    gecko_id: protocol.gecko_id,
    symbol: protocol.symbol,
    scope,
    model: {
      base_multiple: stat.applied,
      basis: stat.basis,
      peers: stat.peers,
      observed_median: stat.observed,
      clamped: stat.clamped,
      growth_multiple: growth,
      maturity_multiple: maturity,
      age_days: age.days,
      age_known: age.known,
    },
  };
}

function slugOrder(a: { slug: string }, b: { slug: string }): number {
  return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
}

/** Build the 40-row watchlist floor plus the best early pre-token rows, then rank all of them. */
export function scoreSnapshot(snapshot: Snapshot): Radar {
  const book = calibrate(snapshot);
  const index = new Map<string, Protocol>();
  for (const protocol of snapshot.protocols) {
    if (index.has(protocol.slug)) throw new Error(`snapshot repeats the slug ${protocol.slug}`);
    index.set(protocol.slug, protocol);
  }

  const watchSet = new Set(snapshot.watchlist);
  const floorRows: Row[] = [];
  for (const slug of snapshot.watchlist) {
    const protocol = index.get(slug);
    if (protocol === undefined) throw new Error(`watchlist names ${slug}, which the snapshot does not list`);
    floorRows.push(scoreRow(protocol, book, 'watchlist', snapshot.as_of));
  }

  const earlyPool: Row[] = [];
  for (const protocol of snapshot.protocols) {
    if (watchSet.has(protocol.slug)) continue;
    if (protocol.tvl_usd >= snapshot.floor_usd) continue;
    if (!(protocol.mcap_usd === null && protocol.gecko_id === null && protocol.symbol === null)) continue;
    if (protocol.category === 'CEX') continue;
    if (versionedName(protocol.name)) continue;
    earlyPool.push(scoreRow(protocol, book, 'early', snapshot.as_of));
  }
  earlyPool.sort((a, b) => b.implied_value_usd - a.implied_value_usd || slugOrder(a, b));

  const slots = Math.max(0, TARGET_BOARD_SIZE - floorRows.length);
  const chosen = earlyPool.slice(0, slots);
  const combined = floorRows.concat(chosen).sort((a, b) => b.implied_value_usd - a.implied_value_usd || slugOrder(a, b));
  const board = combined.map((row, position) => ({ ...row, rank: position + 1 }));

  const calibration = calibrationRows(book, board);
  const live = liveRows(snapshot);
  const fallback = fallbackHighlights(board);
  const note = fallbackNote(book, fallback);

  return {
    board,
    meta: {
      schema: 'token-radar-v3/1',
      entry: 'Calibrated Launch Radar',
      model: 'category-peer-median-v3',
      as_of: snapshot.as_of,
      floor_usd: snapshot.floor_usd,
      protocol_count: snapshot.protocols.length,
      watchlist_count: snapshot.watchlist.length,
      board_size: board.length,
      early_size: chosen.length,
      global: {
        peer_count: book.peerCount,
        median: book.globalMedian,
        applied: book.globalApplied,
      },
      constants: MODEL_CONSTANTS,
      calibration,
      live,
      fallback_note: note,
      fallback,
    },
  };
}

/** Every category with a tokenized peer plus every category on the board, as a table. */
function calibrationRows(book: CalibrationBook, board: Row[]): CalibrationRow[] {
  const categories = new Set<string>();
  for (const category of book.byCategory.keys()) categories.add(category);
  const counts = new Map<string, number>();
  for (const row of board) {
    const label = row.category ?? 'Uncategorised';
    categories.add(label === 'Uncategorised' ? 'Uncategorised' : label);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...categories].sort().map((category) => {
    const stat = book.slot(category === 'Uncategorised' ? null : category);
    return {
      category,
      peers: stat.peers,
      observed_median: stat.observed,
      applied_multiple: stat.applied,
      basis: stat.basis,
      clamped: stat.clamped,
      rows_on_board: counts.get(category) ?? 0,
    };
  });
}

/** Protocols whose token already trades, by market cap, for the reference-only live view. */
function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => p.category !== 'CEX' && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || slugOrder(a, b))
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chain: p.chains[0] ?? 'its primary chain',
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd!,
      mcap_to_tvl: p.mcap_usd! / p.tvl_usd,
    }));
}

function topOfCategory(board: Row[], category: string): FallbackHighlight | null {
  const row = board.find((candidate) => candidate.category === category);
  return row === undefined ? null : { name: row.name, rank: row.rank, peers: row.model.peers };
}

function fallbackHighlights(board: Row[]): RadarMeta['fallback'] {
  return {
    risk_curators: topOfCategory(board, 'Risk Curators'),
    onchain_allocator: topOfCategory(board, 'Onchain Capital Allocator'),
  };
}

function peerText(count: number): string {
  return count === 1 ? '1 tokenized peer' : `${count} tokenized peers`;
}

/** The sentence the Method view and every global-fallback detail share. */
function fallbackNote(book: CalibrationBook, fallback: RadarMeta['fallback']): string {
  const multiple = book.globalApplied.toFixed(6);
  const opening = `Categories with fewer than ${MODEL_CONSTANTS.min_category_peers} tokenized peers inherit the global median (${multiple}x), because one or two peers cannot support a category multiple.`;
  const parts: string[] = [];
  if (fallback.risk_curators !== null) {
    const hit = fallback.risk_curators;
    parts.push(`the top-ranked Risk Curators protocol, ${hit.name} (rank ${hit.rank}, ${peerText(hit.peers)})`);
  }
  if (fallback.onchain_allocator !== null) {
    const hit = fallback.onchain_allocator;
    parts.push(`the top-ranked Onchain Capital Allocator protocol, ${hit.name} (rank ${hit.rank}, ${peerText(hit.peers)})`);
  }
  return parts.length === 0
    ? opening
    : `${opening} That covers ${parts.join(', and ')}.`;
}

/** The dashboard's data file. Kept outside dashboard/ so it is page data, not page source. */
export function dataScript(radar: Radar): string {
  return `window.RADAR_V3 = ${JSON.stringify({ ...radar.meta, rows: radar.board })};\n`;
}

/**
 * The pre-write gate the entry runs before publishing: the same shape the competition scorer
 * checks, returning the first problem or null. A board that passes here is a valid board.
 */
export function boardProblem(board: Row[], snapshot: Snapshot): string | null {
  if (board.length < 100) return `the board has ${board.length} rows; at least 100 are required`;
  const known = new Set(snapshot.protocols.map((protocol) => protocol.slug));
  const watch = new Set(snapshot.watchlist);
  const seen = new Set<string>();
  for (const row of board) {
    if (!known.has(row.slug)) return `row slug ${row.slug} is not a snapshot protocol`;
    if (seen.has(row.slug)) return `slug ${row.slug} appears more than once`;
    seen.add(row.slug);
    if (typeof row.name !== 'string' || row.name.length === 0) return `row ${row.slug} has no name`;
    if (!Number.isSafeInteger(row.rank) || row.rank < 1) return `row ${row.slug} has a bad rank`;
    if (!Number.isSafeInteger(row.implied_value_usd) || row.implied_value_usd <= 0 || row.implied_value_usd > 100_000_000_000_000) {
      return `row ${row.slug} has a bad implied value`;
    }
    if (!Array.isArray(row.farm_steps) || row.farm_steps.length < 3 || row.farm_steps.length > 12) {
      return `row ${row.slug} has ${row.farm_steps.length} farm steps; 3 to 12 are required`;
    }
    for (const step of row.farm_steps) {
      if (typeof step !== 'string') return `row ${row.slug} has a non-text farm step`;
      if (step !== step.trim()) return `row ${row.slug} has a farm step with surrounding whitespace`;
      const span = step.length;
      if (span < 20 || span > 600) return `row ${row.slug} has a ${span}-character farm step`;
    }
  }
  for (const slug of watch) {
    if (!seen.has(slug)) return `watchlist slug ${slug} is missing from the board`;
  }
  const ordered = board.slice().sort((a, b) => a.rank - b.rank);
  for (let index = 0; index < ordered.length; index++) {
    if (ordered[index]!.rank !== index + 1) return `ranks are not exactly 1..${ordered.length}`;
  }
  const first = ordered[0]?.implied_value_usd;
  const allSame = ordered.length >= 2 && ordered.every((row) => row.implied_value_usd === first);
  if (allSame) return 'every row has the same implied value, so the board ranks nothing';
  for (let index = 1; index < ordered.length; index++) {
    if (ordered[index]!.implied_value_usd > ordered[index - 1]!.implied_value_usd) {
      return `implied value rises between ranks ${ordered[index - 1]!.rank} and ${ordered[index]!.rank}`;
    }
  }
  return null;
}
