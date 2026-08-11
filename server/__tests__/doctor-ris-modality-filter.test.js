process.env.NODE_ENV = 'test';

import { describe, expect, it } from '@jest/globals';
import { expandModalityFilter } from '../utils/imaging-modality.js';

describe('doctor RIS modality filter aliases', () => {
  it('treats MRI and MR as equivalent (Orthanc stores MR)', () => {
    expect(expandModalityFilter('MRI')).toEqual(expect.arrayContaining(['MR', 'MRI']));
    expect(expandModalityFilter('MR')).toEqual(expect.arrayContaining(['MR', 'MRI']));
    expect(expandModalityFilter('mri')).toEqual(expect.arrayContaining(['MR', 'MRI']));
  });

  it('maps X-Ray family and USG aliases', () => {
    expect(expandModalityFilter('X-Ray')).toEqual(expect.arrayContaining(['CR', 'DX', 'X-RAY']));
    expect(expandModalityFilter('USG')).toEqual(expect.arrayContaining(['US', 'USG']));
  });

  it('passes through unknown modalities', () => {
    expect(expandModalityFilter('OT')).toEqual(['OT']);
    expect(expandModalityFilter('')).toEqual([]);
  });
});
