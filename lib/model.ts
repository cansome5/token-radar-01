// token-radar-01 v4 — the pricing model, farm plans, census ledger and page payload.
//
// The value model is fitted on the snapshot's own tokenized protocols, not on a
// hardcoded list: a Theil-Sen scale curve in log-log space, a shrunk category
// effect, a market-relative growth term and a quarter-strength age term. Every
// rung is tested held-out twice, leave-one-out and older-to-newer. The farm
// plans are costed per chain and netted against a 10% airdrop slice assumption;
// every one of the snapshot's protocols is accounted for in the ledger.

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
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

export interface Peer {
  slug: string;
  name: string;
  category: string;
  tvl: number;
  mcap: number;
  change: number | null;
  age_days: number | null;
  symbol: string | null;
  stem: string;
  members: string[];
}

export interface ScaleModel {
  slope: number;
  intercept: number;
  multiple: number;
  n: number;
  sector: Map<string, number>;
  growth_median: number | null;
  age_slope: number;
  peers: Peer[];
}

export interface LadderTest {
  median_error: number;
  hit3: number;
  n: number;
}

export interface LadderRow {
  key: string;
  label: string;
  loo: LadderTest;
  oot: LadderTest;
}

export interface Coverage {
  inside: number;
  n: number;
  share: number;
  spread_young: number;
  spread_older: number;
}

export interface Ladder {
  rows: LadderRow[];
  coverage: { loo: Coverage; oot: Coverage };
  loo_errors: { slug: string; age_days: number | null; error: number; young: boolean }[];
  oot_errors: { slug: string; age_days: number | null; error: number; young: boolean }[];
}

export interface FarmStep {
  text: string;
  cost_usd: number;
  minutes: number;
}

export interface FarmPlan {
  playbook: string;
  chain: string;
  capital_usd: number;
  holding_days: number;
  steps: FarmStep[];
  minutes: number;
  fees_usd: number;
  slice_usd: number;
  foregone_usd: number;
  net_usd: number;
  verdict: 'FARM' | 'THIN' | 'SKIP';
  break_even_usd: number | null;
  per_hour_usd: number;
  note_dollar_days: number;
  eligible_dollar_days: number;
  share: number;
  slice_low_usd: number;
  slice_high_usd: number;
  net_low_usd: number;
  net_high_usd: number;
}

export interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  implied_low_usd: number;
  implied_high_usd: number;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  age_known: boolean;
  sector_mult: number;
  growth_mult: number;
  age_mult: number;
  kin_discount: number;
  farm_steps: string[];
  verdict: 'FARM' | 'THIN' | 'SKIP';
  capital_usd: number;
  holding_days: number;
  minutes: number;
  slice_usd: number;
  fees_usd: number;
  foregone_usd: number;
  net_usd: number;
  break_even_usd: number | null;
  per_hour_usd: number;
  playbook: string;
  gas_chain: string;
}

export interface IntegrityCheck {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
}

export interface LedgerGroup {
  key: string;
  label: string;
  reason: string;
  count: number;
  samples: string[];
}

export interface Radar {
  as_of: string;
  floor_usd: number;
  counts: {
    protocols: number;
    watchlist: number;
    tokenized: number;
    token_on_record: number;
    no_token: number;
    peers: number;
    families: number;
    certificates_excluded: number;
  };
  kpi: {
    rows: number;
    watchlist_covered: number;
    loo_median_error: number;
    farm: number;
    thin: number;
    skip: number;
    total_implied_usd: number;
  };
  integrity: IntegrityCheck[];
  ladder: LadderRow[];
  coverage: { loo: Coverage; oot: Coverage };
  model: {
    slope: number;
    intercept: number;
    multiple: number;
    sector_n: number;
    growth_median: number | null;
    age_slope: number;
    peer_names: string[];
  };
  rows: BoardRow[];
  watchlist_slugs: string[];
  live: {
    slug: string;
    name: string;
    category: string | null;
    chains: string[];
    tvl_usd: number;
    mcap_usd: number;
    multiple: number;
    change_7d: number | null;
    listed_at: string | null;
  }[];
  ledger: { total: number; groups: LedgerGroup[] };
  gas: { chain: string; usd_per_tx: number }[];
  assumptions: string[];
}

const DAYS = 86_400_000;
const AGE_OUT_OF_TIME_DAYS = 900;
const AGE_SPLIT_DAYS = 540;
const SECTOR_PSEUDO_PEERS = 4;
const GROWTH_CAP = 40;
const AGE_CLAMP: [number, number] = [0.9, 1.15];
const KIN_DISCOUNT = 0.25;
const AIRDROP_SHARE = 0.1;
const HOLDING_DAYS = 90;
const YIELD_RATE = 0.04;

const BRIDGE_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Cross Chain Bridge']);
const LST_CATEGORIES = new Set(['Liquid Staking', 'Liquid Restaking', 'Restaked BTC']);
const HOUSE_EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
const EXCHANGE_PREFIX = /^(binance|coinbase|bybit|kraken|bitget|okx|bitfinex|gemini)/i;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
const VERSION_MARKER = /\s(v|version)\s*\d+(\.\d+)?$/i;

/** Generic name words that never make a family stem on their own. */
const GENERIC_STEMS = new Set([
  'the', 'a', 'an', 'protocol', 'finance', 'dao', 'labs', 'network', 'chain', 'chains',
  'markets', 'market', 'capital', 'exchange', 'app', 'defi', 'lend', 'lending', 'vault',
  'vaults', 'staking', 'stake', 'staked', 'wrapped', 'bridge', 'pool', 'pools', 'yield',
  'farm', 'index', 'indexes', 'money', 'earn', 'token', 'usd', 'btc', 'eth', 'stable',
  'stablecoin', 'credit', 'fund', 'funds', 'group', 'digital', 'global', 'prime', 'bank',
]);

/** One dollars figure rounded to whole dollars, never below one. */
const usd = (n: number): number => Math.max(1, Math.round(n));

/** Two-decimal rounding for the economics the detail view shows. */
export const cents = (n: number): number => Math.round(n * 100) / 100;

/** Sorted median; NaN on an empty list. */
export function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Theil-Sen slope: the median of every pair's slope; 0 when no pair has an x spread. */
export function theilSen(xs: number[], ys: number[]): number {
  const slopes: number[] = [];
  for (let i = 0; i < xs.length; i++) {
    for (let j = i + 1; j < xs.length; j++) {
      const dx = xs[j]! - xs[i]!;
      if (Math.abs(dx) > 1e-12) slopes.push((ys[j]! - ys[i]!) / dx);
    }
  }
  return slopes.length === 0 ? 0 : median(slopes);
}

/** The multiplicative distance between a claim and the true market cap, at least 1. */
export function errorFactor(predicted: number, actual: number): number {
  if (!(predicted > 0) || !(actual > 0)) return Infinity;
  return predicted >= actual ? predicted / actual : actual / predicted;
}

/** The share of predictions within 3x either way. */
export function hitShare(errors: number[]): number {
  if (errors.length === 0) return 0;
  return errors.filter((e) => e <= 3).length / errors.length;
}

/** A name's family stem: the first non-generic word, lowercased and stripped to letters and digits. */
export function stemOf(name: string): string {
  const words = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0);
  const first = words.find((w) => w.length >= 3 && !GENERIC_STEMS.has(w));
  return first ?? words.find((w) => w.length > 0) ?? '';
}

/** The UTC day `listed_at` names, in milliseconds; null when absent or malformed. */
export function dayOf(listed: string | null): number | null {
  if (listed === null) return null;
  const at = Date.parse(`${listed}T00:00:00Z`);
  return Number.isFinite(at) ? at : null;
}

/** A protocol's age in days at the snapshot's as_of, or null when it records no listing day. */
export function ageDaysOf(p: Protocol, asOfMs: number): number | null {
  const at = dayOf(p.listed_at);
  if (at === null) return null;
  return Math.max(1, Math.floor((asOfMs - at) / DAYS));
}

/** The snapshot's fields, read and checked; throws on a payload that is not one. */
export function parseSnapshot(text: string): Snapshot {
  const raw = JSON.parse(text) as unknown;
  if (typeof raw !== 'object' || raw === null) throw new Error('snapshot: not an object');
  const s = raw as Record<string, unknown>;
  if (!Array.isArray(s.protocols) || !Array.isArray(s.watchlist)) throw new Error('snapshot: protocols and watchlist must be arrays');
  if (typeof s.as_of !== 'string') throw new Error('snapshot: as_of must be a string');
  return {
    as_of: s.as_of,
    source: typeof s.source === 'string' ? s.source : '',
    floor_usd: typeof s.floor_usd === 'number' ? s.floor_usd : 50_000_000,
    protocols: s.protocols as Protocol[],
    watchlist: s.watchlist as string[],
  };
}

/** The house rule minus the floor: TVL ≥ $5M, no token recorded, not a product or listing that already trades. */
export function passesHouseRule(p: Protocol): boolean {
  if (p.tvl_usd < 5_000_000) return false;
  if (p.gecko_id !== null || p.symbol !== null) return false;
  if (p.category !== null && HOUSE_EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (VERSION_MARKER.test(p.name)) return false;
  if (EXCHANGE_PREFIX.test(p.name)) return false;
  return true;
}

/** Peers: one per token family, deposit certificates dropped, in log-log fitting order. */
export function buildPeers(snapshot: Snapshot, asOfMs: number): { peers: Peer[]; families: number; certificates: number; tokenized: number } {
  const tokenized = snapshot.protocols.filter((p) => p.mcap_usd !== null);
  interface Family {
    key: string;
    members: Protocol[];
    tvl: number;
    mcap: number;
    stem: string;
    symbol: string | null;
  }
  const families = new Map<string, Family>();
  for (const p of tokenized) {
    if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    const stem = stemOf(p.name);
    const key = `${(p.symbol ?? '').toUpperCase()}|${stem}`;
    const found = families.get(key);
    if (found === undefined) {
      families.set(key, { key, members: [p], tvl: p.tvl_usd, mcap: p.mcap_usd, stem, symbol: p.symbol });
    } else {
      found.members.push(p);
      found.tvl += p.tvl_usd;
      found.mcap += p.mcap_usd;
    }
  }
  const peers: Peer[] = [];
  let certificates = 0;
  for (const fam of families.values()) {
    if (Math.abs(fam.mcap / fam.tvl - 1) <= 0.015) {
      certificates++;
      continue;
    }
    const ordered = fam.members.slice().sort((a, b) => b.tvl_usd - a.tvl_usd);
    const head = ordered[0]!;
    const changes = ordered.filter((m) => m.change_7d !== null) as (Protocol & { change_7d: number })[];
    const change = changes.length === 0 ? null : changes.reduce((sum, m) => sum + m.change_7d * m.tvl_usd, 0) / changes.reduce((sum, m) => sum + m.tvl_usd, 0);
    let oldest: number | null = null;
    for (const member of ordered) {
      const age = ageDaysOf(member, asOfMs);
      if (age !== null && (oldest === null || age > oldest)) oldest = age;
    }
    peers.push({
      slug: head.slug,
      name: head.name,
      category: head.category ?? 'Unknown',
      tvl: fam.tvl,
      mcap: fam.mcap,
      change,
      age_days: oldest,
      symbol: fam.symbol,
      stem: fam.stem,
      members: ordered.map((m) => m.slug),
    });
  }
  peers.sort((a, b) => b.tvl - a.tvl || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  return { peers, families: families.size, certificates, tokenized: tokenized.length };
}

/** Fit the whole model on a peer set. Sector effects shrink toward zero with four pseudo-peers. */
export function fitScale(peers: Peer[]): ScaleModel {
  const xs = peers.map((p) => Math.log10(p.tvl));
  const ys = peers.map((p) => Math.log10(p.mcap));
  const slope = peers.length >= 2 ? theilSen(xs, ys) : 0;
  const intercept = peers.length === 0 ? 0 : median(peers.map((p, i) => ys[i]! - slope * xs[i]!));
  const multiple = peers.length === 0 ? 0.25 : median(peers.map((p) => p.mcap / p.tvl));
  const residuals = peers.map((p, i) => ys[i]! - intercept - slope * xs[i]!);
  const byCategory = new Map<string, number[]>();
  peers.forEach((p, i) => {
    const list = byCategory.get(p.category) ?? [];
    list.push(residuals[i]!);
    byCategory.set(p.category, list);
  });
  const sector = new Map<string, number>();
  for (const [category, list] of byCategory) {
    sector.set(category, median(list) * (list.length / (list.length + SECTOR_PSEUDO_PEERS)));
  }
  const ageSlopeRaw = (() => {
    const ages: number[] = [];
    const ageResiduals: number[] = [];
    peers.forEach((p, i) => {
      if (p.age_days === null) return;
      ages.push(Math.log10(Math.max(1, p.age_days)));
      ageResiduals.push(residuals[i]! - (sector.get(p.category) ?? 0));
    });
    return ages.length >= 2 ? theilSen(ages, ageResiduals) : 0;
  })();
  const growthValues = peers.map((p) => p.change).filter((c): c is number => c !== null);
  return {
    slope,
    intercept,
    multiple,
    n: peers.length,
    sector,
    growth_median: growthValues.length === 0 ? null : median(growthValues),
    age_slope: ageSlopeRaw / 4,
    peers,
  };
}

export interface ValueParts {
  value: number;
  sector_mult: number;
  growth_mult: number;
  age_mult: number;
}

/** The model's value for one protocol, and its four rungs' factors. */
export function predict(
  model: ScaleModel,
  input: { tvl_usd: number; category: string | null; change_7d: number | null; age_days: number | null },
  rung: 1 | 2 | 3 | 4,
): ValueParts {
  const scale = model.multiple * input.tvl_usd;
  const log_scale = model.intercept + model.slope * Math.log10(Math.max(1, input.tvl_usd));
  const sector_mult = Math.pow(10, model.sector.get(input.category ?? 'Unknown') ?? 0);
  let growth_mult = 1;
  if (input.change_7d !== null && model.growth_median !== null) {
    const relative = Math.max(-GROWTH_CAP, Math.min(GROWTH_CAP, input.change_7d - model.growth_median));
    growth_mult = Math.pow(1 + relative / 100, model.slope);
  }
  let age_mult = 1;
  if (input.age_days !== null) {
    age_mult = Math.pow(Math.max(1, input.age_days) / 365, model.age_slope);
    age_mult = Math.max(AGE_CLAMP[0], Math.min(AGE_CLAMP[1], age_mult));
  }
  const scaleValue = Math.pow(10, log_scale);
  const value =
    rung === 1 ? scale
    : rung === 2 ? scaleValue
    : rung === 3 ? scaleValue * sector_mult
    : scaleValue * sector_mult * growth_mult * age_mult;
  return { value, sector_mult, growth_mult, age_mult };
}

/** Per-rung predictions for one peer. */
function rungErrors(model: ScaleModel, peer: Peer): number[] {
  return ([1, 2, 3, 4] as const).map((rung) => {
    const predicted = predict(model, { tvl_usd: peer.tvl, category: peer.category, change_7d: peer.change, age_days: peer.age_days }, rung).value;
    return errorFactor(predicted, peer.mcap);
  });
}

function summarise(errors: number[]): LadderTest {
  return { median_error: errors.length === 0 ? 0 : median(errors), hit3: hitShare(errors), n: errors.length };
}

const RUNG_LABELS: Record<string, string> = {
  '1': 'R1 flat multiple',
  '2': 'R2 scale curve',
  '3': 'R3 + sector',
  '4': 'R4 + growth & age',
};

/** The four-rung ladder, tested leave-one-out and older-to-newer. */
export function buildLadder(peers: Peer[]): Ladder {
  const rungKeys = ['1', '2', '3', '4'] as const;
  const looErrors: number[][] = [[], [], [], []];
  const looR4: { slug: string; age_days: number | null; error: number; predicted: number; actual: number }[] = [];
  for (const peer of peers) {
    const rest = peers.filter((p) => p !== peer);
    const fit = fitScale(rest);
    const errors = rungErrors(fit, peer);
    errors.forEach((e, i) => looErrors[i]!.push(e));
    const predicted = predict(fit, { tvl_usd: peer.tvl, category: peer.category, change_7d: peer.change, age_days: peer.age_days }, 4).value;
    looR4.push({ slug: peer.slug, age_days: peer.age_days, error: errors[3]!, predicted, actual: peer.mcap });
  }
  const oldPeers = peers.filter((p) => p.age_days !== null && p.age_days > AGE_OUT_OF_TIME_DAYS);
  const youngPeers = peers.filter((p) => p.age_days !== null && p.age_days <= AGE_OUT_OF_TIME_DAYS);
  const ootErrors: number[][] = [[], [], [], []];
  const ootR4: { slug: string; age_days: number | null; error: number; predicted: number; actual: number }[] = [];
  if (oldPeers.length >= 3) {
    const fit = fitScale(oldPeers);
    for (const peer of youngPeers) {
      const errors = rungErrors(fit, peer);
      errors.forEach((e, i) => ootErrors[i]!.push(e));
      const predicted = predict(fit, { tvl_usd: peer.tvl, category: peer.category, change_7d: peer.change, age_days: peer.age_days }, 4).value;
      ootR4.push({ slug: peer.slug, age_days: peer.age_days, error: errors[3]!, predicted, actual: peer.mcap });
    }
  }
  const rows: LadderRow[] = rungKeys.map((key, i) => ({
    key,
    label: RUNG_LABELS[key]!,
    loo: summarise(looErrors[i]!),
    oot: summarise(ootErrors[i]!),
  }));
  const coverageFor = (list: typeof looR4): Coverage => {
    const young = list.filter((e) => e.age_days !== null && e.age_days < AGE_SPLIT_DAYS);
    const older = list.filter((e) => e.age_days !== null && e.age_days >= AGE_SPLIT_DAYS);
    const spreadYoung = young.length === 0 ? 1 : Math.max(1, median(young.map((e) => e.error)));
    const spreadOlder = older.length === 0 ? spreadYoung : Math.max(1, median(older.map((e) => e.error)));
    let inside = 0;
    let n = 0;
    for (const e of list) {
      if (e.age_days === null) continue;
      n++;
      const spread = e.age_days < AGE_SPLIT_DAYS ? spreadYoung : spreadOlder;
      if (e.actual >= e.predicted / spread && e.actual <= e.predicted * spread) inside++;
    }
    return { inside, n, share: n === 0 ? 0 : inside / n, spread_young: spreadYoung, spread_older: spreadOlder };
  };
  return {
    rows,
    coverage: { loo: coverageFor(looR4), oot: coverageFor(ootR4) },
    loo_errors: looR4.map((e) => ({ slug: e.slug, age_days: e.age_days, error: e.error, young: e.age_days !== null && e.age_days < AGE_SPLIT_DAYS })),
    oot_errors: ootR4.map((e) => ({ slug: e.slug, age_days: e.age_days, error: e.error, young: e.age_days !== null && e.age_days < AGE_SPLIT_DAYS })),
  };
}

/** The cheapest of a protocol's first three chains, by the stated gas table. */
export const GAS_TABLE: { chain: string; usd_per_tx: number }[] = [
  { chain: 'Solana', usd_per_tx: 0.01 },
  { chain: 'Sui', usd_per_tx: 0.02 },
  { chain: 'Aptos', usd_per_tx: 0.02 },
  { chain: 'Monad', usd_per_tx: 0.02 },
  { chain: 'Sei', usd_per_tx: 0.02 },
  { chain: 'Celo', usd_per_tx: 0.02 },
  { chain: 'Hyperliquid L1', usd_per_tx: 0.05 },
  { chain: 'xDai', usd_per_tx: 0.05 },
  { chain: 'Plasma', usd_per_tx: 0.05 },
  { chain: 'Arc', usd_per_tx: 0.05 },
  { chain: 'Osmosis', usd_per_tx: 0.05 },
  { chain: 'Sonic', usd_per_tx: 0.10 },
  { chain: 'Mantle', usd_per_tx: 0.10 },
  { chain: 'Fantom', usd_per_tx: 0.10 },
  { chain: 'TON', usd_per_tx: 0.10 },
  { chain: 'Unichain', usd_per_tx: 0.10 },
  { chain: 'Robinhood Chain', usd_per_tx: 0.10 },
  { chain: 'Ripple', usd_per_tx: 0.10 },
  { chain: 'Polygon', usd_per_tx: 0.15 },
  { chain: 'Base', usd_per_tx: 0.20 },
  { chain: 'Avalanche', usd_per_tx: 0.20 },
  { chain: 'Linea', usd_per_tx: 0.20 },
  { chain: 'Scroll', usd_per_tx: 0.20 },
  { chain: 'zkSync Era', usd_per_tx: 0.20 },
  { chain: 'Berachain', usd_per_tx: 0.20 },
  { chain: 'Cardano', usd_per_tx: 0.20 },
  { chain: 'Binance', usd_per_tx: 0.25 },
  { chain: 'Optimism', usd_per_tx: 0.25 },
  { chain: 'Arbitrum', usd_per_tx: 0.30 },
  { chain: 'Cronos', usd_per_tx: 0.30 },
  { chain: 'Gnosis', usd_per_tx: 0.30 },
  { chain: 'Tron', usd_per_tx: 0.60 },
  { chain: 'Bitcoin', usd_per_tx: 1.50 },
  { chain: 'Ethereum', usd_per_tx: 6.00 },
];
const GAS_BY_CHAIN = new Map(GAS_TABLE.map((g) => [g.chain, g.usd_per_tx]));
const DEFAULT_GAS = 0.50;

/** The gas assumption for a chain name, with a stated default for unlisted chains. */
export function gasFor(chain: string): number {
  return GAS_BY_CHAIN.get(chain) ?? DEFAULT_GAS;
}

/** Cheapest of the protocol's first three chains, or its first chain, or 'Ethereum'. */
export function cheapestChain(p: Protocol): string {
  const top = p.chains.slice(0, 3);
  if (top.length === 0) return 'Ethereum';
  let best = top[0]!;
  let bestGas = gasFor(best);
  for (const chain of top) {
    const gas = gasFor(chain);
    if (gas < bestGas || (gas === bestGas && chain < best)) {
      best = chain;
      bestGas = gas;
    }
  }
  return best;
}

type Playbook = 'vault' | 'lend' | 'dollar' | 'cdp' | 'rwa' | 'pool' | 'perps' | 'market' | 'stake' | 'network';

/** Map a snapshot category onto one of ten mechanism playbooks. */
export function playbookOf(category: string | null): Playbook {
  const c = category ?? '';
  if (['Yield', 'Yield Aggregator', 'Onchain Capital Allocator', 'Risk Curators', 'Liquidity Manager', 'Indexes', 'Farm', 'Leveraged Farming', 'Governance Incentives'].includes(c)) return 'vault';
  if (['Lending', 'Uncollateralized Lending', 'Collateral Markets', 'Collateral Management', 'Interest Rate Derivatives'].includes(c)) return 'lend';
  if (['Basis Trading', 'Dual-Token Stablecoin', 'Stablecoin Wrapper', 'CeDeFi', 'DOR'].includes(c)) return 'dollar';
  if (['CDP', 'CDP Manager'].includes(c)) return 'cdp';
  if (['RWA', 'Anchor BTC', 'Decentralized BTC', 'Token Locker'].includes(c)) return 'rwa';
  if (['Dexs', 'OTC Marketplace', 'Launchpad'].includes(c)) return 'pool';
  if (['Derivatives', 'Options'].includes(c)) return 'perps';
  if (['Prediction Market', 'NFT Marketplace'].includes(c)) return 'market';
  if (['Staking Pool', 'Restaking'].includes(c)) return 'stake';
  return 'network';
}

interface StepSpec {
  /** What the step is called, interpolated with the protocol name. */
  action: string;
  tx: number;
  minutes: number;
}

const PLAYBOOK_STEPS: Record<Playbook, (p: Protocol, chain: string, capital: number) => StepSpec[]> = {
  vault: (p, chain, capital) => [
    { action: `Bridge ${capital} USDC to ${chain} and keep it in the wallet that will own the receipt`, tx: 1, minutes: 14 },
    { action: `Approve USDC to ${p.name} on ${chain}`, tx: 1, minutes: 2 },
    { action: `Deposit ${capital} USDC into the ${p.name} vault on ${chain} and mint the share receipt`, tx: 1, minutes: 5 },
    { action: `Check the vault's curator page for a points or loyalty programme and register the wallet if one is live`, tx: 0, minutes: 8 },
    { action: `Stake the ${p.name} receipt in its farm or gauge contract, if the vault publishes one`, tx: 1, minutes: 4 },
    { action: `Set a weekly harvest and restake so the position keeps compounding on ${chain}`, tx: 1, minutes: 5 },
    { action: `Claim any reward token to the same wallet and record the transaction hash`, tx: 1, minutes: 3 },
    { action: `Withdraw after the holding window, repay any borrowed leg first, and swap the receipt back to USDC`, tx: 1, minutes: 9 },
  ],
  lend: (p, chain, capital) => [
    { action: `Bridge ${capital} USDC to ${chain} and approve it to the ${p.name} market`, tx: 1, minutes: 15 },
    { action: `Supply ${capital} USDC to the ${p.name} pool on ${chain} and receive the interest-bearing receipt`, tx: 1, minutes: 5 },
    { action: `Enable the receipt as collateral, then borrow up to 40% in the market's most liquid stablecoin`, tx: 1, minutes: 6 },
    { action: `Redeposit the borrowed stablecoin into the same ${p.name} market to lift both supply and borrow volume`, tx: 1, minutes: 5 },
    { action: `Watch the health factor daily and keep it above 1.6 while the TVL moves`, tx: 0, minutes: 10 },
    { action: `Claim any market incentives to the same wallet and note the ${chain} transaction`, tx: 1, minutes: 3 },
    { action: `Repay half the borrow with earned balance before the holding window closes`, tx: 1, minutes: 4 },
    { action: `Withdraw all supply and borrow, unwind the loop, and return USDC to the source chain`, tx: 1, minutes: 12 },
  ],
  dollar: (p, chain, capital) => [
    { action: `Bridge ${capital} USDC to ${chain} and quote the ${p.name} mint for the same notional`, tx: 1, minutes: 14 },
    { action: `Approve USDC and mint the ${p.name} dollar or basis position on ${chain}`, tx: 1, minutes: 5 },
    { action: `Open the offsetting hedge or LP leg the protocol documents, if one is published`, tx: 1, minutes: 7 },
    { action: `Deposit the minted receipt into the ${p.name} stability pool or staking contract`, tx: 1, minutes: 4 },
    { action: `Check the peg and the collateral ratio weekly on the protocol's own dashboard`, tx: 0, minutes: 8 },
    { action: `Harvest any funding or incentive token to the same wallet`, tx: 1, minutes: 3 },
    { action: `Rebalance the hedge once at the halfway point to keep the position delta-neutral`, tx: 1, minutes: 6 },
    { action: `Redeem the ${p.name} dollar for USDC, close the hedge, and bridge back`, tx: 1, minutes: 10 },
  ],
  cdp: (p, chain, capital) => [
    { action: `Bridge ${capital} of the protocol's accepted collateral to ${chain}`, tx: 1, minutes: 15 },
    { action: `Open a ${p.name} vault on ${chain}, deposit the collateral, and mint the stablecoin at 45% of the debt ceiling`, tx: 1, minutes: 7 },
    { action: `Approve the minted stablecoin to the ${p.name} savings or stability module`, tx: 1, minutes: 2 },
    { action: `Deposit the minted stablecoin into the savings module to earn the protocol's own rate`, tx: 1, minutes: 4 },
    { action: `Follow the collateral ratio and liquidation price daily, topping up if it falls under 150%`, tx: 0, minutes: 10 },
    { action: `Claim any ${p.name} governance or points allocation tied to the vault`, tx: 1, minutes: 3 },
    { action: `Repay a third of the debt at the halfway point to lower the liquidation risk`, tx: 1, minutes: 4 },
    { action: `Repay all debt, withdraw the collateral, and bridge it back to the source chain`, tx: 1, minutes: 11 },
  ],
  rwa: (p, chain, capital) => [
    { action: `Complete any ${p.name} allowlist or eligibility check the tokenised asset requires`, tx: 0, minutes: 12 },
    { action: `Bridge ${capital} USDC to ${chain} and approve it to the ${p.name} subscription contract`, tx: 1, minutes: 14 },
    { action: `Subscribe for the tokenised asset on ${chain} and hold the on-chain receipt`, tx: 1, minutes: 6 },
    { action: `Register the receipt in the protocol's points or holder programme if one is published`, tx: 0, minutes: 6 },
    { action: `Check the NAV and redemption queue weekly on the issuer's page`, tx: 0, minutes: 8 },
    { action: `Claim any distribution or reward token to the same wallet`, tx: 1, minutes: 3 },
    { action: `Verify the issuer's proof of reserves before the holding window closes`, tx: 0, minutes: 7 },
    { action: `Redeem the receipt for USDC in the redemption window and bridge back`, tx: 1, minutes: 12 },
  ],
  pool: (p, chain, capital) => [
    { action: `Bridge ${capital} USDC to ${chain} and split it into the pool's two legs`, tx: 1, minutes: 14 },
    { action: `Approve both tokens to the ${p.name} pool contract on ${chain}`, tx: 2, minutes: 3 },
    { action: `Add liquidity in the pool's published range or ratio and mint the LP position`, tx: 1, minutes: 6 },
    { action: `Stake the LP token in the ${p.name} farm or gauge if one is live`, tx: 1, minutes: 4 },
    { action: `Rebalance the range once a week while the position is in the money`, tx: 1, minutes: 7 },
    { action: `Claim trading fees and any incentive token to the same wallet`, tx: 1, minutes: 3 },
    { action: `Check impermanent loss against a plain hold at the halfway point`, tx: 0, minutes: 6 },
    { action: `Remove liquidity, unstake, swap back to USDC, and bridge out`, tx: 1, minutes: 10 },
  ],
  perps: (p, chain, capital) => [
    { action: `Bridge ${capital} USDC to ${chain} and deposit it as margin in the ${p.name} perps venue`, tx: 1, minutes: 14 },
    { action: `Approve the margin token and set leverage to 2x, never above the venue's safe band`, tx: 1, minutes: 4 },
    { action: `Open a small delta-neutral pair, long the asset and short the same notional perpetual`, tx: 2, minutes: 8 },
    { action: `Check funding every eight hours and flip the side when funding runs against the pair`, tx: 1, minutes: 6 },
    { action: `Add margin if the maintenance ratio falls under 2x the venue's minimum`, tx: 1, minutes: 4 },
    { action: `Claim any trading points or fee rebate to the same wallet`, tx: 1, minutes: 3 },
    { action: `Close the pair once at the halfway point and reopen at the same notional`, tx: 2, minutes: 8 },
    { action: `Close both legs, withdraw margin, and bridge the USDC back`, tx: 1, minutes: 11 },
  ],
  market: (p, chain, capital) => [
    { action: `Bridge ${capital} USDC to ${chain} and approve it to the ${p.name} market contract`, tx: 1, minutes: 14 },
    { action: `Buy both sides of one liquid ${p.name} market at a small size to establish a position`, tx: 2, minutes: 6 },
    { action: `Provide liquidity to the market if the protocol publishes an LP path`, tx: 1, minutes: 5 },
    { action: `Register for any market-making or points season the protocol documents`, tx: 0, minutes: 8 },
    { action: `Track resolution dates and roll expiring positions weekly`, tx: 1, minutes: 7 },
    { action: `Claim resolved payouts and any market incentive token`, tx: 1, minutes: 3 },
    { action: `Rebalance once at the halfway point to keep both sides funded`, tx: 2, minutes: 7 },
    { action: `Resolve or sell the remaining positions, withdraw LP, and bridge back`, tx: 1, minutes: 10 },
  ],
  stake: (p, chain, capital) => [
    { action: `Bridge ${capital} of the staking asset to ${chain}`, tx: 1, minutes: 15 },
    { action: `Approve the asset to the ${p.name} staking contract on ${chain}`, tx: 1, minutes: 3 },
    { action: `Stake the asset and mint the ${p.name} receipt token`, tx: 1, minutes: 6 },
    { action: `Delegate to at least three validators or operators to spread slashing risk`, tx: 3, minutes: 9 },
    { action: `Deposit the receipt into any published restaking or farm contract`, tx: 1, minutes: 4 },
    { action: `Claim staking rewards weekly and restake them`, tx: 1, minutes: 5 },
    { action: `Check the validator set and commission weekly; redelegate if any operator is jailed`, tx: 1, minutes: 7 },
    { action: `Unstake in the protocol's unbonding window and bridge the asset back`, tx: 1, minutes: 12 },
  ],
  network: (p, chain, capital) => [
    { action: `Bridge ${capital} USDC to ${chain} and fund the wallet the ${p.name} programme reads`, tx: 1, minutes: 15 },
    { action: `Complete the ${p.name} on-chain registration or identity step on ${chain}`, tx: 1, minutes: 8 },
    { action: `Deposit or lock the minimum the protocol documents for its network or payment role`, tx: 1, minutes: 6 },
    { action: `Run the protocol's published checklist: one swap, one payment, one referral transaction`, tx: 3, minutes: 10 },
    { action: `Keep the position live and repeat one qualifying transaction each week`, tx: 1, minutes: 6 },
    { action: `Claim any points or fee credit the protocol surfaces to the same wallet`, tx: 1, minutes: 3 },
    { action: `Export the wallet's transaction history as evidence before the snapshot closes`, tx: 0, minutes: 6 },
    { action: `Unlock or withdraw after the holding window and bridge the balance back`, tx: 1, minutes: 11 },
  ],
};

/** Plan capital by TVL band: bigger protocols need a bigger note to matter. */
export function capitalFor(tvl: number): number {
  if (tvl >= 1_000_000_000) return 1000;
  if (tvl >= 500_000_000) return 750;
  if (tvl >= 200_000_000) return 500;
  if (tvl >= 100_000_000) return 300;
  if (tvl >= 50_000_000) return 200;
  if (tvl >= 20_000_000) return 150;
  return 100;
}

/** Eight costed steps and the net economics for one protocol. */
export function buildFarmPlan(p: Protocol, implied: number, impliedLow: number, impliedHigh: number): FarmPlan {
  const playbook = playbookOf(p.category);
  const chain = cheapestChain(p);
  const gas = gasFor(chain);
  const capital = capitalFor(p.tvl_usd);
  const specs = PLAYBOOK_STEPS[playbook](p, chain, capital);
  const steps: FarmStep[] = specs.map((spec) => {
    const cost = spec.tx * gas;
    return {
      text: `${spec.action}. Cost: $${cost.toFixed(2)}. Time: ${spec.minutes} min.`,
      cost_usd: cents(cost),
      minutes: spec.minutes,
    };
  });
  const minutes = steps.reduce((n, s) => n + s.minutes, 0);
  // Fees are the raw gas bill (tx count × chain gas), not the rounded per-step display figures,
  // so the verdict and the net line stay exact rather than drifting by a few cents.
  const fees = specs.reduce((n, spec) => n + spec.tx * gas, 0);
  const noteDollarDays = capital * HOLDING_DAYS;
  const eligibleDollarDays = p.tvl_usd * HOLDING_DAYS;
  const share = noteDollarDays / eligibleDollarDays;
  const slice = implied * AIRDROP_SHARE * share;
  const sliceLow = impliedLow * AIRDROP_SHARE * share;
  const sliceHigh = impliedHigh * AIRDROP_SHARE * share;
  const foregone = capital * YIELD_RATE * (HOLDING_DAYS / 365);
  const net = slice - fees - foregone;
  const verdict = net > 0 ? 'FARM' : slice >= fees ? 'THIN' : 'SKIP';
  const denom = (implied * AIRDROP_SHARE) / p.tvl_usd - YIELD_RATE * (HOLDING_DAYS / 365);
  const breakEven = denom > 0 ? fees / denom : null;
  return {
    playbook,
    chain,
    capital_usd: capital,
    holding_days: HOLDING_DAYS,
    steps,
    minutes,
    fees_usd: cents(fees),
    slice_usd: cents(slice),
    foregone_usd: cents(foregone),
    net_usd: cents(net),
    verdict,
    break_even_usd: breakEven === null ? null : cents(breakEven),
    per_hour_usd: cents(net / (minutes / 60)),
    note_dollar_days: noteDollarDays,
    eligible_dollar_days: eligibleDollarDays,
    share,
    slice_low_usd: cents(sliceLow),
    slice_high_usd: cents(sliceHigh),
    net_low_usd: cents(sliceLow - fees - foregone),
    net_high_usd: cents(sliceHigh - fees - foregone),
  };
}

/** Every tokenized protocol, for the live view; never mixed into the ranking. */
export function liveTokens(snapshot: Snapshot): Radar['live'] {
  return snapshot.protocols
    .filter((p) => p.mcap_usd !== null)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd as number,
      multiple: p.tvl_usd > 0 ? (p.mcap_usd as number) / p.tvl_usd : 0,
      change_7d: p.change_7d,
      listed_at: p.listed_at,
    }))
    .sort((a, b) => b.mcap_usd - a.mcap_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
}

/** Classify every protocol into exactly one ledger group. Precedence is top to bottom. */
export function ledgerOf(snapshot: Snapshot, kinStems: Map<string, string>): { total: number; groups: LedgerGroup[] } {
  const groups: LedgerGroup[] = [
    { key: 'ranked', label: 'Ranked', reason: 'passes the house rule; priced on the board', count: 0, samples: [] },
    { key: 'token-trades', label: 'Token trades', reason: 'records a token whose market cap is in the snapshot; shown in the live view', count: 0, samples: [] },
    { key: 'token-on-record', label: 'Token on record', reason: 'records a token but the snapshot carries no market cap for it', count: 0, samples: [] },
    { key: 'bridge', label: 'Bridge', reason: 'bridge, canonical-bridge or cross-chain-bridge category', count: 0, samples: [] },
    { key: 'liquid-staking', label: 'Liquid staking', reason: 'liquid staking, liquid restaking or restaked-BTC category', count: 0, samples: [] },
    { key: 'exchange', label: 'Exchange custody', reason: 'CEX category or an exchange name at the front', count: 0, samples: [] },
    { key: 'versioned', label: 'Versioned listing', reason: 'name ends in a version marker such as V2 or 2.0', count: 0, samples: [] },
    { key: 'wrapped', label: 'Wrapped or staked', reason: 'name carries the whole word wrapped, staked or staking', count: 0, samples: [] },
    { key: 'kin', label: 'Kin of a token', reason: 'name stem matches a tokenized family; on the board at a 0.25 kin discount', count: 0, samples: [] },
  ];
  const byKey = new Map(groups.map((g) => [g.key, g]));
  const add = (key: string, p: Protocol): void => {
    const group = byKey.get(key)!;
    group.count++;
    if (group.samples.length < 12) group.samples.push(p.slug);
  };
  for (const p of snapshot.protocols) {
    if (p.mcap_usd !== null) { add('token-trades', p); continue; }
    if (p.gecko_id !== null || p.symbol !== null) { add('token-on-record', p); continue; }
    // Anything the house rule keeps is board material: kin if its stem matches a tokenized family
    // (it then carries the 0.25 discount), ranked otherwise. This ordering makes Ranked + Kin exactly
    // the board, and it matters for a category the house rule does not name, such as Cross Chain
    // Bridge: kept on the board, and counted as ranked rather than quietly called a bridge.
    if (passesHouseRule(p)) {
      add(kinStems.has(stemOf(p.name)) ? 'kin' : 'ranked', p);
      continue;
    }
    const category = p.category ?? '';
    if (BRIDGE_CATEGORIES.has(category)) { add('bridge', p); continue; }
    if (LST_CATEGORIES.has(category)) { add('liquid-staking', p); continue; }
    if (category === 'CEX' || EXCHANGE_PREFIX.test(p.name)) { add('exchange', p); continue; }
    if (VERSION_MARKER.test(p.name)) { add('versioned', p); continue; }
    if (WRAPPED_WORD.test(p.name)) { add('wrapped', p); continue; }
    add('ranked', p);
  }
  return { total: snapshot.protocols.length, groups };
}

/** Stems of tokenized families that may mark a ranked row as kin. */
export function kinStemsOf(peers: Peer[], snapshot: Snapshot): Map<string, string> {
  const map = new Map<string, string>();
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null) continue;
    const stem = stemOf(p.name);
    if (stem.length >= 3 && !GENERIC_STEMS.has(stem) && !map.has(stem)) map.set(stem, p.name);
  }
  for (const peer of peers) if (!map.has(peer.stem)) map.set(peer.stem, peer.name);
  return map;
}

/** The KPI and integrity checks main.ts runs before it writes anything. */
export function boardProblem(rows: BoardRow[], snapshot: Snapshot): IntegrityCheck[] {
  const checks: IntegrityCheck[] = [];
  const add = (id: string, label: string, ok: boolean, detail: string): void => { checks.push({ id, label, ok, detail }); };
  add('row-count', '100–4,000 rows', rows.length >= 100 && rows.length <= 4000, `${rows.length} rows`);
  const ranks = rows.map((r) => r.rank).sort((a, b) => a - b);
  const ranksOk = ranks.length === rows.length && ranks.every((r, i) => r === i + 1);
  add('ranks', 'ranks exactly 1..N', ranksOk, ranksOk ? `1..${rows.length}` : 'ranks do not run 1..N');
  const impliedOk = rows.every((r) => Number.isSafeInteger(r.implied_value_usd) && r.implied_value_usd > 0 && r.implied_value_usd <= 100_000_000_000_000);
  add('implied-integer', 'implied values positive whole dollars', impliedOk, impliedOk ? 'all whole and in range' : 'a row is not a positive whole dollar figure');
  const monotone = rows.every((r, i) => i === 0 || rows[i - 1]!.implied_value_usd >= r.implied_value_usd);
  add('monotone', 'implied values non-increasing with rank', monotone, monotone ? 'rank 1 is the highest' : 'a later rank is worth more');
  const distinct = new Set(rows.map((r) => r.implied_value_usd)).size > 1;
  add('distinct', 'not every row the same value', distinct, distinct ? 'the board ranks by value' : 'all values are equal');
  const slugs = new Set(rows.map((r) => r.slug));
  add('slugs', 'rows are snapshot protocols, once each', slugs.size === rows.length, `${slugs.size} unique slugs`);
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  add('known-slugs', 'every slug is in the snapshot', rows.every((r) => known.has(r.slug)), 'checked against protocols');
  const coverage = snapshot.watchlist.filter((w) => slugs.has(w));
  add('watchlist', 'watchlist 40/40 covered', coverage.length === snapshot.watchlist.length, `${coverage.length}/${snapshot.watchlist.length}`);
  const stepsOk = rows.every((r) => Array.isArray(r.farm_steps) && r.farm_steps.length >= 3 && r.farm_steps.length <= 12 && r.farm_steps.every((s) => typeof s === 'string' && s.trim().length >= 20 && s.trim().length <= 600));
  add('farm-steps', '3–12 steps of 20–600 characters', stepsOk, stepsOk ? 'all rows pass' : 'a row has a step out of range');
  const intervalsOk = rows.every((r) => Number.isSafeInteger(r.implied_low_usd) && Number.isSafeInteger(r.implied_high_usd) && r.implied_low_usd >= 1 && r.implied_low_usd <= r.implied_value_usd && r.implied_value_usd <= r.implied_high_usd);
  add('intervals', 'low ≤ implied ≤ high on every row', intervalsOk, intervalsOk ? 'all intervals hold' : 'an interval does not hold');
  return checks;
}

/** The first problem boardProblem finds, or null when the board is clean. */
export function boardIssue(rows: BoardRow[], snapshot: Snapshot): string | null {
  const bad = boardProblem(rows, snapshot).find((c) => !c.ok);
  return bad === undefined ? null : `${bad.label}: ${bad.detail}`;
}

/** The four tested rungs plus coverage, from the peer set. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: Radar } {
  const asOfMs = Date.parse(`${snapshot.as_of}T00:00:00Z`);
  if (!Number.isFinite(asOfMs)) throw new Error(`snapshot: as_of ${snapshot.as_of} is not a day`);
  const { peers, families, certificates, tokenized } = buildPeers(snapshot, asOfMs);
  const model = fitScale(peers);
  const ladder = buildLadder(peers);
  const kinStems = kinStemsOf(peers, snapshot);
  const spread = new Map<string, number>([
    ['young', ladder.coverage.loo.spread_young],
    ['older', ladder.coverage.loo.spread_older],
  ]);
  const overallSpread = Math.max(1, median(ladder.loo_errors.map((e) => e.error)));

  const rows: BoardRow[] = [];
  for (const p of snapshot.protocols) {
    if (!passesHouseRule(p)) continue;
    const ageDays = ageDaysOf(p, asOfMs);
    const parts = predict(model, { tvl_usd: p.tvl_usd, category: p.category, change_7d: p.change_7d, age_days: ageDays }, 4);
    const stem = stemOf(p.name);
    const kinName = kinStems.get(stem);
    const kin = kinName !== undefined && kinName !== p.name;
    const raw = parts.value * (kin ? KIN_DISCOUNT : 1);
    const implied = usd(raw);
    const group = ageDays === null ? 'all' : ageDays < AGE_SPLIT_DAYS ? 'young' : 'older';
    const width = group === 'all' ? overallSpread : spread.get(group) ?? overallSpread;
    const low = Math.max(1, Math.floor(implied / width));
    const high = Math.max(implied, Math.ceil(implied * width));
    const plan = buildFarmPlan(p, implied, low, high);
    rows.push({
      slug: p.slug,
      name: p.name,
      rank: 0,
      implied_value_usd: implied,
      implied_low_usd: low,
      implied_high_usd: high,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      listed_at: p.listed_at,
      age_days: ageDays,
      age_known: ageDays !== null,
      sector_mult: cents(parts.sector_mult),
      growth_mult: cents(parts.growth_mult),
      age_mult: cents(parts.age_mult),
      kin_discount: kin ? KIN_DISCOUNT : 1,
      farm_steps: plan.steps.map((s) => s.text),
      verdict: plan.verdict,
      capital_usd: plan.capital_usd,
      holding_days: plan.holding_days,
      minutes: plan.minutes,
      slice_usd: plan.slice_usd,
      fees_usd: plan.fees_usd,
      foregone_usd: plan.foregone_usd,
      net_usd: plan.net_usd,
      break_even_usd: plan.break_even_usd,
      per_hour_usd: plan.per_hour_usd,
      playbook: plan.playbook,
      gas_chain: plan.chain,
    });
  }
  rows.sort((a, b) => b.implied_value_usd - a.implied_value_usd || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  rows.forEach((r, i) => { r.rank = i + 1; });

  // A kin row's note is part of its plan text, so a reader sees why its value is cut.
  for (const row of rows) {
    if (row.kin_discount < 1) {
      const family = kinStems.get(stemOf(row.name)) ?? 'a tokenized family';
      row.farm_steps[0] = `${row.farm_steps[0]} Kin of ${family}, whose token already trades: value multiplied by 0.25.`;
    }
    // Keep every step inside the gate's 20–600 character window after the note is appended.
    row.farm_steps = row.farm_steps.map((s) => s.trim().slice(0, 600));
  }

  const ranked = new Set(rows.map((r) => r.slug));
  const ledger = ledgerOf(snapshot, kinStems);
  const live = liveTokens(snapshot);
  const farm = rows.filter((r) => r.verdict === 'FARM').length;
  const thin = rows.filter((r) => r.verdict === 'THIN').length;
  const skip = rows.filter((r) => r.verdict === 'SKIP').length;
  const totalImplied = rows.reduce((n, r) => n + r.implied_value_usd, 0);
  const watchlistCovered = snapshot.watchlist.filter((w) => ranked.has(w)).length;
  const integrity = boardProblem(rows, snapshot);
  const tokenOnRecord = snapshot.protocols.filter((p) => p.mcap_usd === null && (p.gecko_id !== null || p.symbol !== null)).length;

  const radar: Radar = {
    as_of: snapshot.as_of,
    floor_usd: snapshot.floor_usd,
    counts: {
      protocols: snapshot.protocols.length,
      watchlist: snapshot.watchlist.length,
      tokenized,
      token_on_record: tokenOnRecord,
      no_token: snapshot.protocols.filter((p) => p.mcap_usd === null && p.gecko_id === null && p.symbol === null).length,
      peers: model.n,
      families,
      certificates_excluded: certificates,
    },
    kpi: {
      rows: rows.length,
      watchlist_covered: watchlistCovered,
      loo_median_error: ladder.rows.find((r) => r.key === '4')!.loo.median_error,
      farm,
      thin,
      skip,
      total_implied_usd: totalImplied,
    },
    integrity,
    ladder: ladder.rows,
    coverage: ladder.coverage,
    model: {
      slope: model.slope,
      intercept: model.intercept,
      multiple: model.multiple,
      sector_n: model.sector.size,
      growth_median: model.growth_median,
      age_slope: model.age_slope,
      peer_names: peers.slice(0, 12).map((p) => p.name),
    },
    rows,
    watchlist_slugs: snapshot.watchlist.slice(),
    live,
    ledger,
    gas: GAS_TABLE,
    assumptions: [
      `Peers are the ${tokenized} protocols recording a token; ${families} token families after dedupe (same ticker and name stem) and ${certificates} deposit certificates dropped where mcap/TVL is within ±1.5% of 1.0, leaving ${model.n} fitted peers.`,
      `Theil-Sen slope of log10(mcap) on log10(TVL): slope ${model.slope.toFixed(4)}, intercept ${model.intercept.toFixed(4)}; a peer worth $1 of TVL is worth $${Math.pow(10, model.intercept).toFixed(4)}.`,
      `Sector effect is the category's median log residual, shrunk toward zero with ${SECTOR_PSEUDO_PEERS} pseudo-peers (n/(n+${SECTOR_PSEUDO_PEERS})); ${model.sector.size} categories carry a fitted effect.`,
      `Growth is the protocol's 7d change minus the tokenized peers' median (${model.growth_median === null ? 'unknown' : model.growth_median.toFixed(2)}%), capped to ±${GROWTH_CAP} percentage points, applied as (1 + relative)^b.`,
      `Age is the fitted residual slope on log(age days), taken at one quarter strength and applied as (age/365)^slope, clamped to [${AGE_CLAMP[0]}, ${AGE_CLAMP[1]}]; a protocol with no listing day gets 1.0 and says its age is unknown.`,
      `Kin: a ranked row whose name stem matches a tokenized family is discounted to ${KIN_DISCOUNT} of its modelled value and its row says so.`,
      `Every value is the R4 fit on all peers. The ladder tests R1–R4 leave-one-out (each peer left out and refit) and older-to-newer (fit on peers older than ${AGE_OUT_OF_TIME_DAYS} days, price the younger ones); error is the larger/smaller ratio and the 3x hit rate counts values within 3x either way.`,
      `Intervals are the R4 implied value divided and multiplied by the same-age-group holdout median error (split at ${AGE_SPLIT_DAYS} days; the younger group is wider). Coverage is the share of holdout tokens whose true mcap fell inside the interval.`,
      `Farm slice = implied × ${AIRDROP_SHARE * 100}% airdrop share × reader note dollar-days / (TVL × ${HOLDING_DAYS} days). The note is the plan capital held ${HOLDING_DAYS} days; fees are the eight steps' gas at the cheapest of the protocol's top three chains; foregone yield is ${YIELD_RATE * 100}% annualized on the capital for ${HOLDING_DAYS} days.`,
      `Gas is a stated per-transaction assumption, not a quote: ${GAS_TABLE.slice(0, 6).map((g) => `${g.chain} $${g.usd_per_tx}`).join(', ')}, ... Ethereum $6.00, and $${DEFAULT_GAS.toFixed(2)} for any chain not listed.`,
      `The ledger gives every one of the ${snapshot.protocols.length} protocols exactly one group, by the precedence the README documents: token trades, token on record, bridge, liquid staking, exchange custody, versioned listing, wrapped or staked, kin, ranked.`,
      'The board values are the entry\'s own claim from the snapshot, never a prediction that a token will be issued.',
    ],
  };
  return { board: rows, radar };
}

/** data.js: the page payload, written beside the dashboard, deterministic bytes. */
export function dataScript(radar: Radar): string {
  const json = JSON.stringify(radar).replace(/<\//g, '<\\/');
  return `window.RADAR = ${json};\n`;
}
