import { routeEvidence } from '../services/imaging/imaging-knowledge-router.service.js';

describe('imaging-knowledge-router.service', () => {
  test('routes ventricle measurements to the lateral_ventricle domain', () => {
    const result = routeEvidence({
      modality: 'MR',
      bodyRegion: 'brain',
      measurements: [
        { structure: 'left_lateral_ventricle', volume_mm3: 641.2 },
        { structure: 'right_lateral_ventricle', volume_mm3: 3977.9 },
      ],
    });
    expect(result.anatomy).toContain('lateral_ventricle');
    expect(result.knowledgeDomains).toContain('lateral_ventricle');
    expect(result.measurementCount).toBe(2);
  });

  test('routes BraTS tumor subregions to the tumor domain', () => {
    const result = routeEvidence({
      modality: 'MR',
      measurements: [{ structure: 'segmented_whole_tumor', volume_mm3: 120 }],
    });
    expect(result.anatomy).toContain('brain_parenchyma');
    expect(result.knowledgeDomains).toEqual(expect.arrayContaining(['whole_tumor', 'tumor']));
  });

  test('a real bilateral comparison produces a named derived finding, not just a raw anatomy tag', () => {
    const result = routeEvidence({
      modality: 'MR',
      measurements: [
        { structure: 'left_lateral_ventricle', volume_mm3: 641.2 },
        { structure: 'right_lateral_ventricle', volume_mm3: 3977.9 },
      ],
      comparisons: [{ base_structure: 'lateral_ventricle', asymmetric: true, ratio: 6.2 }],
    });
    expect(result.findings).toContain('lateral_ventricle_asymmetry');
  });

  test('a non-asymmetric comparison produces no derived finding', () => {
    const result = routeEvidence({
      modality: 'MR',
      measurements: [],
      comparisons: [{ base_structure: 'lateral_ventricle', asymmetric: false, ratio: 1.1 }],
    });
    expect(result.findings).toHaveLength(0);
  });

  test('unrecognized anatomy produces no domains — no fabricated coverage', () => {
    const result = routeEvidence({ modality: 'MR', measurements: [{ structure: 'spleen', volume_mm3: 150 }] });
    expect(result.knowledgeDomains).toHaveLength(0);
    expect(result.anatomy).toHaveLength(0);
  });

  test('empty input produces an empty, well-formed routing decision', () => {
    const result = routeEvidence({});
    expect(result.anatomy).toEqual([]);
    expect(result.findings).toEqual([]);
    expect(result.knowledgeDomains).toEqual([]);
    expect(result.measurementCount).toBe(0);
    expect(result.comparisonCount).toBe(0);
  });

  test('carries modality and bodyRegion through unmodified', () => {
    const result = routeEvidence({ modality: 'MR', bodyRegion: 'NECK', measurements: [] });
    expect(result.modality).toBe('MR');
    expect(result.bodyRegion).toBe('NECK');
  });
});
