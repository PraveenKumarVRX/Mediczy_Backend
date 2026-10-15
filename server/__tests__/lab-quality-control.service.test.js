import { evaluateWestgard, chartBands } from '../services/lab-quality-control.service.js';

describe('laboratory QC Westgard evaluation', () => {
  const mean = 100;
  const sd = 5;

  test('passes a value inside one standard deviation', () => {
    expect(evaluateWestgard([100], mean, sd)).toMatchObject({ status: 'pass', flags: [], releaseBlocked: false });
  });

  test('marks one result beyond two standard deviations as warning', () => {
    expect(evaluateWestgard([100, 111], mean, sd)).toMatchObject({ status: 'warning', flags: ['1_2S'], releaseBlocked: false });
  });

  test('rejects one result beyond three standard deviations', () => {
    expect(evaluateWestgard([100, 116], mean, sd)).toMatchObject({ status: 'fail', flags: ['1_2S', '1_3S'], releaseBlocked: true });
  });

  test('rejects two consecutive values beyond two SD on the same side', () => {
    const result = evaluateWestgard([111, 112], mean, sd);
    expect(result.status).toBe('fail');
    expect(result.flags).toContain('2_2S');
  });

  test('rejects a two-value four-SD range rule', () => {
    const result = evaluateWestgard([111, 89], mean, sd);
    expect(result.flags).toContain('R_4S');
    expect(result.releaseBlocked).toBe(true);
  });

  test('returns Levey–Jennings bands', () => {
    expect(chartBands(mean, sd)).toEqual({ mean: 100, plus1sd: 105, minus1sd: 95, plus2sd: 110, minus2sd: 90, plus3sd: 115, minus3sd: 85 });
  });

  test('rejects invalid control configuration', () => {
    expect(() => evaluateWestgard([1], 1, 0)).toThrow(/targetSd/);
  });
});

