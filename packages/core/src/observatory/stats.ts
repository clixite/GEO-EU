/**
 * Statistics for the AI visibility observatory. Generative answers are
 * non-deterministic, so every rate is reported with n and a Wilson score
 * interval, never as a bare point estimate.
 */

export interface Proportion {
  k: number;
  n: number;
  p: number;
  low: number;
  high: number;
  /** Half-width of the interval; large values mean "not enough samples". */
  halfWidth: number;
}

/** Wilson score interval for a binomial proportion (z = 1.96 → 95%). */
export function wilson(k: number, n: number, z = 1.96): Proportion {
  if (n <= 0) return { k: 0, n: 0, p: 0, low: 0, high: 1, halfWidth: 0.5 };
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { k, n, p, low: Math.max(0, centre - half), high: Math.min(1, centre + half), halfWidth: half };
}

/** Samples needed so that the Wilson half-width at proportion p is at most `halfWidth`. */
export function samplesForHalfWidth(p: number, halfWidth: number, z = 1.96): number {
  let n = 1;
  while (wilson(Math.round(p * n), n, z).halfWidth > halfWidth && n < 100_000) n = Math.ceil(n * 1.2) + 1;
  return n;
}

/** Two-proportion z-test p-value (two-sided) for comparing two periods or two brands. */
export function twoProportionPValue(k1: number, n1: number, k2: number, n2: number): number {
  if (n1 === 0 || n2 === 0) return 1;
  const p1 = k1 / n1;
  const p2 = k2 / n2;
  const pooled = (k1 + k2) / (n1 + n2);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2));
  if (se === 0) return 1;
  const zscore = Math.abs(p1 - p2) / se;
  return 2 * (1 - normalCdf(zscore));
}

function normalCdf(x: number): number {
  // Abramowitz & Stegun 7.1.26 approximation of the error function.
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return 0.5 * (1 + (x >= 0 ? y : -y));
}

/** Whether an observed change is distinguishable from sampling noise at alpha. */
export function isSignificantChange(before: Proportion, after: Proportion, alpha = 0.05): boolean {
  return twoProportionPValue(before.k, before.n, after.k, after.n) < alpha;
}
