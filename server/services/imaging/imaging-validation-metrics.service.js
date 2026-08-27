/**
 * Validation metrics (P10 — the deterministic-math half of
 * CLINICAL_AI_PLATFORM_V1_IMPLEMENTATION_ROADMAP.md §21's Validation
 * Matrix). Real, pure, testable functions — Dice, volume error, measurement
 * error — that a real validation program needs the moment real annotated
 * ground truth exists.
 *
 * This is infrastructure, not a validation result. Nothing in this file
 * computes a score against real data — that needs a real gold-standard
 * dataset this codebase doesn't have (see imaging-validation-factory.service.js's
 * docstring on that hard limit). What's real here is the math itself:
 * correctly implemented, tested against known cases, ready to run the
 * instant a real annotated case exists to run it against.
 */

/** Dice similarity coefficient between two voxel masks (boolean/0-1 arrays
 * of equal length) — 2*|A∩B| / (|A|+|B|). Standard segmentation-overlap
 * metric, 1.0 = perfect overlap, 0.0 = no overlap. Both masks empty is
 * defined as 1.0 (perfect agreement on absence), not NaN or 0 — a
 * deliberate, documented choice, not a fabricated default. */
export function diceCoefficient(maskA, maskB) {
  if (maskA.length !== maskB.length) throw new Error('diceCoefficient: masks must be the same length');
  let intersection = 0, sumA = 0, sumB = 0;
  for (let i = 0; i < maskA.length; i++) {
    const a = maskA[i] ? 1 : 0;
    const b = maskB[i] ? 1 : 0;
    intersection += a && b ? 1 : 0;
    sumA += a;
    sumB += b;
  }
  if (sumA === 0 && sumB === 0) return 1.0;
  return (2 * intersection) / (sumA + sumB);
}

/** Intersection-over-Union — |A∩B| / |A∪B|. Same empty-mask convention as diceCoefficient. */
export function iouScore(maskA, maskB) {
  if (maskA.length !== maskB.length) throw new Error('iouScore: masks must be the same length');
  let intersection = 0, union = 0;
  for (let i = 0; i < maskA.length; i++) {
    const a = maskA[i] ? 1 : 0;
    const b = maskB[i] ? 1 : 0;
    intersection += a && b ? 1 : 0;
    union += a || b ? 1 : 0;
  }
  if (union === 0) return 1.0;
  return intersection / union;
}

/** Real percentage volume error against a ground-truth value — not a raw
 * difference, so a 10mm3 error reads very differently on a 50mm3 structure
 * than on a 5000mm3 one. Returns null (not 0 or Infinity) when the
 * reference is 0 — there's no meaningful percentage error against nothing. */
export function volumeErrorPercent(measuredValue, groundTruthValue) {
  if (groundTruthValue === 0) return null;
  return Math.round(((measuredValue - groundTruthValue) / groundTruthValue) * 10000) / 100;
}

/** Mean absolute error over paired (measured, ground_truth) values —
 * real values in, real number out. Throws on empty input rather than
 * silently returning 0, which would look like a perfect score. */
export function meanAbsoluteError(pairs) {
  if (!pairs.length) throw new Error('meanAbsoluteError: no pairs provided');
  const total = pairs.reduce((sum, [measured, truth]) => sum + Math.abs(measured - truth), 0);
  return total / pairs.length;
}

/** Sensitivity/specificity/PPV/NPV from real counts — the roadmap's
 * §21 "Perception" row. All four return null (not 0) when their
 * denominator is 0, since e.g. specificity is undefined with zero real
 * negatives, not zero. */
export function detectionMetrics({ truePositive = 0, falsePositive = 0, trueNegative = 0, falseNegative = 0 }) {
  const sensDenom = truePositive + falseNegative;
  const specDenom = trueNegative + falsePositive;
  const ppvDenom = truePositive + falsePositive;
  const npvDenom = trueNegative + falseNegative;
  return {
    sensitivity: sensDenom > 0 ? Math.round((truePositive / sensDenom) * 10000) / 10000 : null,
    specificity: specDenom > 0 ? Math.round((trueNegative / specDenom) * 10000) / 10000 : null,
    ppv: ppvDenom > 0 ? Math.round((truePositive / ppvDenom) * 10000) / 10000 : null,
    npv: npvDenom > 0 ? Math.round((trueNegative / npvDenom) * 10000) / 10000 : null,
  };
}
