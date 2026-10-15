/**
 * Laboratory internal quality control.
 *
 * The service is intentionally deterministic and database-free at its core so
 * the Westgard rules can be tested independently of PostgreSQL and reused by
 * result-release workflows.
 */

const REJECT_FLAGS = new Set(['1_3S', '2_2S', 'R_4S', '4_1S', '10_X']);

const side = (z) => (z > 0 ? 'positive' : z < 0 ? 'negative' : 'zero');

/**
 * Evaluate the latest QC value plus historical values, oldest first.
 * `values` contains numeric values; the final entry is the run being decided.
 */
export function evaluateWestgard(values, targetMean, targetSd) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error('At least one QC value is required');
  }
  const mean = Number(targetMean);
  const sd = Number(targetSd);
  if (!Number.isFinite(mean) || !Number.isFinite(sd) || sd <= 0) {
    throw new Error('targetMean and targetSd must be finite and targetSd must be greater than zero');
  }

  const numeric = values.map(Number);
  if (numeric.some((value) => !Number.isFinite(value))) {
    throw new Error('QC values must be finite numbers');
  }
  const zScores = numeric.map((value) => (value - mean) / sd);
  const latest = zScores[zScores.length - 1];
  const flags = [];

  if (Math.abs(latest) >= 2) flags.push('1_2S');
  if (Math.abs(latest) >= 3) flags.push('1_3S');

  const lastTwo = zScores.slice(-2);
  if (lastTwo.length === 2 && lastTwo.every((z) => Math.abs(z) >= 2) && side(lastTwo[0]) === side(lastTwo[1])) {
    flags.push('2_2S');
  }

  if (lastTwo.length === 2 && Math.max(...lastTwo) >= 2 && Math.min(...lastTwo) <= -2) {
    flags.push('R_4S');
  }

  const lastFour = zScores.slice(-4);
  if (lastFour.length === 4 && lastFour.every((z) => Math.abs(z) >= 1) && new Set(lastFour.map(side)).size === 1) {
    flags.push('4_1S');
  }

  const lastTen = zScores.slice(-10);
  if (lastTen.length === 10 && (lastTen.every((z) => z > 0) || lastTen.every((z) => z < 0))) {
    flags.push('10_X');
  }

  const rejectFlags = flags.filter((flag) => REJECT_FLAGS.has(flag));
  const status = rejectFlags.length > 0 ? 'fail' : flags.length > 0 ? 'warning' : 'pass';

  return {
    status,
    zScore: Number(latest.toFixed(4)),
    flags,
    rejectFlags,
    warning: status === 'warning',
    releaseBlocked: status === 'fail',
  };
}

export function chartBands(targetMean, targetSd) {
  const mean = Number(targetMean);
  const sd = Number(targetSd);
  if (!Number.isFinite(mean) || !Number.isFinite(sd) || sd <= 0) {
    throw new Error('targetMean and targetSd must be finite and targetSd must be greater than zero');
  }
  return {
    mean,
    plus1sd: mean + sd,
    minus1sd: mean - sd,
    plus2sd: mean + (2 * sd),
    minus2sd: mean - (2 * sd),
    plus3sd: mean + (3 * sd),
    minus3sd: mean - (3 * sd),
  };
}

export const WESTGARD_RULES = Object.freeze({
  '1_2S': 'One result beyond ±2 SD (warning)',
  '1_3S': 'One result beyond ±3 SD (reject)',
  '2_2S': 'Two consecutive results beyond ±2 SD on the same side (reject)',
  'R_4S': 'Two consecutive results differ by at least 4 SD (reject)',
  '4_1S': 'Four consecutive results beyond ±1 SD on the same side (reject)',
  '10_X': 'Ten consecutive results on the same side of the mean (reject)',
});

