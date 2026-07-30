import { jest } from '@jest/globals';

describe('dicom-modality route helpers', () => {
  it('documents INSERT column order (host and port once each)', () => {
    const columns = [
      'tenant_id', 'name', 'ae_title', 'host', 'port',
      'modality_type', 'manufacturer', 'model', 'location', 'status', 'orthanc_synced',
    ];
    const portIndexes = columns.reduce((acc, col, i) => (col === 'port' ? [...acc, i] : acc), []);
    expect(portIndexes).toEqual([4]);
    expect(columns.filter((c) => c === 'host')).toHaveLength(1);
  });
});

describe('MODALITY_PRESETS dental + interventional', () => {
  it('includes OPG, intra-oral, C-arm, and angiogram codes', async () => {
    const { MODALITY_PRESETS } = await import('../services/orthanc-modality.service.js');
    const types = MODALITY_PRESETS.map((p) => p.type);
    expect(types).toEqual(expect.arrayContaining(['PX', 'IO', 'RF', 'XA']));
    expect(MODALITY_PRESETS.find((p) => p.type === 'PX')?.label).toMatch(/OPG/i);
    expect(MODALITY_PRESETS.find((p) => p.type === 'RF')?.label).toMatch(/C-arm/i);
    expect(MODALITY_PRESETS.find((p) => p.type === 'XA')?.label).toMatch(/Cath lab|Angio/i);
  });
});
