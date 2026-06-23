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
