import {
  diceCoefficient,
  iouScore,
  volumeErrorPercent,
  meanAbsoluteError,
  detectionMetrics,
} from '../services/imaging/imaging-validation-metrics.service.js';

describe('imaging-validation-metrics.service', () => {
  describe('diceCoefficient', () => {
    test('perfect overlap is exactly 1.0', () => {
      expect(diceCoefficient([1, 1, 0, 0], [1, 1, 0, 0])).toBe(1.0);
    });

    test('no overlap at all is exactly 0.0', () => {
      expect(diceCoefficient([1, 1, 0, 0], [0, 0, 1, 1])).toBe(0.0);
    });

    test('a known partial-overlap case computes the textbook value', () => {
      // A = {1,2,3,4}, B = {3,4,5,6} over 8 voxels -> intersection=2, sumA=4, sumB=4 -> Dice = 4/8 = 0.5
      const a = [1, 1, 1, 1, 0, 0, 0, 0];
      const b = [0, 0, 1, 1, 1, 1, 0, 0];
      expect(diceCoefficient(a, b)).toBe(0.5);
    });

    test('both masks empty is defined as perfect agreement (1.0), not NaN', () => {
      expect(diceCoefficient([0, 0, 0], [0, 0, 0])).toBe(1.0);
    });

    test('mismatched lengths throw rather than silently misalign', () => {
      expect(() => diceCoefficient([1, 0], [1, 0, 0])).toThrow();
    });
  });

  describe('iouScore', () => {
    test('known case: A={1,2,3,4}, B={3,4,5,6} -> intersection=2, union=6 -> IoU=1/3', () => {
      const a = [1, 1, 1, 1, 0, 0, 0, 0];
      const b = [0, 0, 1, 1, 1, 1, 0, 0];
      expect(iouScore(a, b)).toBeCloseTo(1 / 3, 10);
    });

    test('perfect overlap is 1.0', () => {
      expect(iouScore([1, 1, 0], [1, 1, 0])).toBe(1.0);
    });
  });

  describe('volumeErrorPercent', () => {
    test('real percentage error, not a raw difference', () => {
      expect(volumeErrorPercent(110, 100)).toBe(10);
      expect(volumeErrorPercent(90, 100)).toBe(-10);
    });

    test('null (not 0 or Infinity) when ground truth is 0', () => {
      expect(volumeErrorPercent(50, 0)).toBeNull();
    });

    test('the exact real case from this session: UNesT ventricle vs a hypothetical 700mm3 ground truth', () => {
      expect(volumeErrorPercent(641.2, 700)).toBeCloseTo(-8.4, 1);
    });
  });

  describe('meanAbsoluteError', () => {
    test('known case: |5-3| + |10-12| + |1-1| = 2+2+0 = 4, /3 = 1.333...', () => {
      expect(meanAbsoluteError([[5, 3], [10, 12], [1, 1]])).toBeCloseTo(4 / 3, 10);
    });

    test('throws on empty input rather than returning a fake 0', () => {
      expect(() => meanAbsoluteError([])).toThrow();
    });
  });

  describe('detectionMetrics', () => {
    test('a known confusion matrix produces the textbook sensitivity/specificity/PPV/NPV', () => {
      // TP=8, FN=2 (10 real positives), TN=85, FP=5 (90 real negatives)
      const result = detectionMetrics({ truePositive: 8, falseNegative: 2, trueNegative: 85, falsePositive: 5 });
      // detectionMetrics deliberately rounds to 4 decimal places for clean
      // display — asserting to that same precision, not raw float equality.
      expect(result.sensitivity).toBeCloseTo(0.8, 4);
      expect(result.specificity).toBeCloseTo(85 / 90, 4);
      expect(result.ppv).toBeCloseTo(8 / 13, 4);
      expect(result.npv).toBeCloseTo(85 / 87, 4);
    });

    test('returns null (not 0) for a metric whose denominator is zero — undefined, not zero', () => {
      const result = detectionMetrics({ truePositive: 5, falsePositive: 0, trueNegative: 0, falseNegative: 0 });
      expect(result.specificity).toBeNull();
      expect(result.sensitivity).toBe(1);
    });
  });
});
