import { stowMultipleDicomFiles } from '../services/orthanc-pacs.service.js';

describe('stowMultipleDicomFiles', () => {
  it('rejects empty file list', async () => {
    await expect(stowMultipleDicomFiles([])).rejects.toThrow('No DICOM files');
  });
});
