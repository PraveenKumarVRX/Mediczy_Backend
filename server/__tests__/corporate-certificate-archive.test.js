import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { jest } from '@jest/globals';
import { buildCertificateArchive } from '../services/corporate-certificate-archive.service.js';

let directory;
beforeEach(async () => { directory = await fs.mkdtemp(path.join(os.tmpdir(), 'certificate-archive-')); });
afterEach(async () => { await fs.rm(directory, { recursive: true, force: true }); });
const options = extra => ({ ids: [1], corporateId: 3, findCertificates: async () => [{ id: 1, organization_id: 3 }], resolvePath: cert => path.join(directory, `${cert.id}.pdf`), fileName: () => '../../employee.pdf', ...extra });
test('archive contains exact issued PDF bytes under safe distinct filenames', async () => {
  const bytes = Buffer.from('%PDF-1.7\nExisting issued certificate\n%%EOF');
  await fs.writeFile(path.join(directory, '1.pdf'), bytes);
  const zip = await JSZip.loadAsync(await buildCertificateArchive(options()));
  const names = Object.keys(zip.files);
  expect(names).toHaveLength(1);
  expect(names[0]).not.toContain('/');
  expect(await zip.files[names[0]].async('nodebuffer')).toEqual(bytes);
});
test.each([[], [0], ['1.5'], [1.2], Array.from({ length: 101 }, (_, i) => i + 1)].map(ids => [ids]))('invalid selection %j is rejected before data access', async ids => {
  const findCertificates = jest.fn();
  await expect(buildCertificateArchive(options({ ids, findCertificates }))).rejects.toMatchObject({ statusCode: 400 });
  expect(findCertificates).not.toHaveBeenCalled();
});
test('duplicate IDs are queried and archived only once', async () => {
  await fs.writeFile(path.join(directory, '1.pdf'), '%PDF-1.7\n%%EOF');
  const findCertificates = jest.fn().mockResolvedValue([{ id: 1, organization_id: 3 }]);
  await buildCertificateArchive(options({ ids: [1, 1], findCertificates }));
  expect(findCertificates).toHaveBeenCalledWith(3, ['1']);
});
test('foreign or missing certificates fail the entire selection', async () => {
  await expect(buildCertificateArchive(options({ findCertificates: async () => [] }))).rejects.toMatchObject({ statusCode: 404 });
  await expect(buildCertificateArchive(options({ findCertificates: async () => [{ id: 1, organization_id: 4 }] }))).rejects.toMatchObject({ statusCode: 404 });
});
test('missing and non-PDF files are explicit failures, never silently skipped', async () => {
  await expect(buildCertificateArchive(options())).rejects.toMatchObject({ statusCode: 409 });
  await fs.writeFile(path.join(directory, '1.pdf'), '<html>error</html>');
  await expect(buildCertificateArchive(options())).rejects.toMatchObject({ statusCode: 409 });
});
test('large selections are rejected before file bytes are read', async () => {
  const file = await fs.open(path.join(directory, '1.pdf'), 'w');
  await file.truncate(26 * 1024 * 1024); await file.close();
  await expect(buildCertificateArchive(options())).rejects.toMatchObject({ statusCode: 413 });
});

test('PostgreSQL bigint string IDs are accepted without precision loss', async () => {
  const id = '9007199254740993';
  await fs.writeFile(path.join(directory, `${id}.pdf`), '%PDF-1.7\n%%EOF');
  const findCertificates = jest.fn().mockResolvedValue([{ id, organization_id: 3 }]);
  const zip = await JSZip.loadAsync(await buildCertificateArchive(options({ ids: [id], findCertificates })));
  expect(findCertificates).toHaveBeenCalledWith(3, [id]);
  expect(Object.keys(zip.files)[0]).toContain(id);
});
