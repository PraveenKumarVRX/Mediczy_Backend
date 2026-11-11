import { jest } from '@jest/globals';

const query = jest.fn();
const scanOnly = jest.fn();

jest.unstable_mockModule('../db/pgPool.js', () => ({ default: { query, connect: jest.fn() } }));
jest.unstable_mockModule('../services/minio-upload.service.js', () => ({
  scanOnly,
  uploadToMinio: jest.fn(),
  compressFile: jest.fn(),
  encryptBuffer: jest.fn(),
  decryptBuffer: jest.fn(),
  uploadEncryptedReport: jest.fn(),
  downloadDecryptedReport: jest.fn(),
  default: {},
}));

const service = await import('../services/team-email-template-attachments.service.js');
const {
  attachmentsTableReady, __resetAttachmentsSchemaCache, safeFilename,
  listTemplateAttachments, attachmentCountsByTemplate, saveTemplateAttachment,
  readTemplateAttachment, deleteTemplateAttachment, mailAttachmentsForTemplate,
  mailAttachmentsForCategory, ALLOWED_ATTACHMENT_TYPES, MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_TEMPLATE,
} = service;

const TEMPLATE = 'db2f28d6-fd01-41dc-bcf9-c7bd31ba3e06';
const pdf = (size = 64) => Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(Math.max(0, size - 9), 0x20)]);
const png = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(32)]);

/** Answer the schema probe, then each subsequent query in order. */
const withSchema = (present, ...responses) => {
  __resetAttachmentsSchemaCache();
  query.mockReset();
  query.mockImplementationOnce(async () => ({ rowCount: present ? 1 : 0, rows: present ? [{ '?column?': 1 }] : [] }));
  for (const response of responses) query.mockImplementationOnce(async () => response);
  query.mockImplementation(async () => ({ rows: [], rowCount: 0 }));
};

beforeEach(() => {
  __resetAttachmentsSchemaCache();
  query.mockReset();
  scanOnly.mockReset();
  scanOnly.mockResolvedValue({ clean: true, detail: '' });
});

describe('schema probe', () => {
  it('reports the table once and reuses the answer', async () => {
    withSchema(true);
    expect(await attachmentsTableReady()).toBe(true);
    expect(await attachmentsTableReady()).toBe(true);
    const probes = query.mock.calls.filter(([sql]) => /information_schema\.tables/.test(sql));
    expect(probes).toHaveLength(1);
  });

  it('treats a probe failure as "not available" rather than throwing', async () => {
    query.mockReset();
    query.mockRejectedValue(new Error('connection refused'));
    expect(await attachmentsTableReady()).toBe(false);
  });

  it('keeps every read inert before the migration is applied', async () => {
    withSchema(false);
    expect(await listTemplateAttachments(TEMPLATE)).toEqual([]);
    expect(await mailAttachmentsForTemplate(TEMPLATE)).toEqual([]);
    expect(await readTemplateAttachment(TEMPLATE, 'x')).toBeNull();
    expect(await deleteTemplateAttachment(TEMPLATE, 'x')).toBe(false);
    expect(await attachmentCountsByTemplate([TEMPLATE])).toEqual({});
    expect(query.mock.calls.filter(([sql]) => /team_email_template_attachments/.test(sql) && !/information_schema/.test(sql))).toHaveLength(0);
  });

  it('refuses an upload with a clear code before the migration is applied', async () => {
    withSchema(false);
    await expect(saveTemplateAttachment({ templateId: TEMPLATE, filename: 'a.pdf', contentType: 'application/pdf', buffer: pdf() }))
      .rejects.toMatchObject({ code: 'ATTACHMENTS_NOT_MIGRATED', status: 503 });
  });
});

describe('filename safety', () => {
  it('strips directories and path traversal', () => {
    expect(safeFilename('../../etc/passwd', 'application/pdf')).toBe('passwd');
    expect(safeFilename('/tmp/Welcome Letter.pdf', 'application/pdf')).toBe('Welcome Letter.pdf');
    expect(safeFilename('a\\b\\sheet.xlsx', 'application/pdf')).toBe('sheet.xlsx');
  });

  it('falls back to a typed name when nothing usable is left', () => {
    expect(safeFilename('', 'application/pdf')).toBe('attachment.pdf');
    expect(safeFilename('..', 'application/pdf')).toBe('attachment.pdf');
    expect(safeFilename('   ', 'image/png')).toBe('attachment.png');
    expect(safeFilename(null, 'application/octet-stream')).toBe('attachment.bin');
  });

  it('removes characters that would break a Content-Disposition header', () => {
    expect(safeFilename('we"ird;name\r\n.pdf', 'application/pdf')).toBe('we_ird_name__.pdf');
  });
});

describe('upload validation', () => {
  it('accepts a PDF, hashes it and stores the bytes', async () => {
    withSchema(true, { rows: [], rowCount: 0 }, { rows: [{ id: 'a1', filename: 'Letter.pdf' }], rowCount: 1 });
    const buffer = pdf(128);
    const saved = await saveTemplateAttachment({ templateId: TEMPLATE, filename: 'Letter.pdf', contentType: 'application/pdf', buffer, uploadedByUserId: 6 });
    expect(saved).toMatchObject({ id: 'a1', filename: 'Letter.pdf' });
    const insert = query.mock.calls.find(([sql]) => /INSERT INTO team_email_template_attachments/.test(sql));
    expect(insert).toBeDefined();
    const [, params] = insert;
    expect(params[1]).toBe('Letter.pdf');
    expect(params[2]).toBe('application/pdf');
    expect(params[3]).toBe(buffer.length);
    expect(params[4]).toMatch(/^[0-9a-f]{64}$/);
    expect(Buffer.isBuffer(params[5])).toBe(true);
    expect(params[6]).toBe(6);
  });

  it('normalises a content type that carries parameters', async () => {
    withSchema(true, { rows: [], rowCount: 0 }, { rows: [{ id: 'a2' }], rowCount: 1 });
    await saveTemplateAttachment({ templateId: TEMPLATE, filename: 'x.pdf', contentType: 'application/PDF; charset=binary', buffer: pdf() });
    const [, params] = query.mock.calls.find(([sql]) => /INSERT INTO/.test(sql));
    expect(params[2]).toBe('application/pdf');
  });

  it('rejects an empty file', async () => {
    withSchema(true);
    await expect(saveTemplateAttachment({ templateId: TEMPLATE, filename: 'a.pdf', contentType: 'application/pdf', buffer: Buffer.alloc(0) }))
      .rejects.toMatchObject({ code: 'EMPTY_FILE', status: 400 });
  });

  it('rejects a file over 10 MB', async () => {
    withSchema(true);
    await expect(saveTemplateAttachment({ templateId: TEMPLATE, filename: 'a.pdf', contentType: 'application/pdf', buffer: pdf(MAX_ATTACHMENT_BYTES + 1) }))
      .rejects.toMatchObject({ code: 'FILE_TOO_LARGE', status: 413 });
  });

  it('rejects a type outside the allow-list', async () => {
    withSchema(true);
    await expect(saveTemplateAttachment({ templateId: TEMPLATE, filename: 'run.sh', contentType: 'application/x-sh', buffer: Buffer.from('#!/bin/sh\n') }))
      .rejects.toMatchObject({ code: 'UNSUPPORTED_FILE_TYPE', status: 415 });
    expect(ALLOWED_ATTACHMENT_TYPES).toEqual(expect.arrayContaining(['application/pdf', 'image/png', 'image/jpeg']));
    expect(ALLOWED_ATTACHMENT_TYPES).not.toContain('text/html');
  });

  it('rejects a binary renamed as a PDF — the signature must match', async () => {
    withSchema(true);
    await expect(saveTemplateAttachment({ templateId: TEMPLATE, filename: 'payload.pdf', contentType: 'application/pdf', buffer: Buffer.from('MZ\x90\x00executable') }))
      .rejects.toMatchObject({ code: 'FILE_SIGNATURE_MISMATCH', status: 415 });
  });

  it('accepts a PNG by its own signature', async () => {
    withSchema(true, { rows: [], rowCount: 0 }, { rows: [{ id: 'a3' }], rowCount: 1 });
    await expect(saveTemplateAttachment({ templateId: TEMPLATE, filename: 'logo.png', contentType: 'image/png', buffer: png() })).resolves.toBeDefined();
  });

  it('rejects a file the virus scanner calls infected', async () => {
    withSchema(true);
    scanOnly.mockResolvedValue({ clean: false, detail: 'Eicar-Test-Signature FOUND' });
    await expect(saveTemplateAttachment({ templateId: TEMPLATE, filename: 'a.pdf', contentType: 'application/pdf', buffer: pdf() }))
      .rejects.toMatchObject({ code: 'AV_SCAN_FAILED', status: 422 });
    expect(query.mock.calls.filter(([sql]) => /INSERT INTO/.test(sql))).toHaveLength(0);
  });

  it('fails closed when the scanner cannot give a verdict', async () => {
    withSchema(true);
    scanOnly.mockRejectedValue(Object.assign(new Error('Antivirus scanning is temporarily unavailable'), { code: 'AV_SCAN_UNAVAILABLE' }));
    await expect(saveTemplateAttachment({ templateId: TEMPLATE, filename: 'a.pdf', contentType: 'application/pdf', buffer: pdf() }))
      .rejects.toMatchObject({ code: 'AV_SCAN_UNAVAILABLE' });
    expect(query.mock.calls.filter(([sql]) => /INSERT INTO/.test(sql))).toHaveLength(0);
  });

  it('scans before it stores', async () => {
    const order = [];
    __resetAttachmentsSchemaCache();
    query.mockReset();
    query.mockImplementation(async (sql) => {
      if (/information_schema/.test(sql)) return { rowCount: 1, rows: [{}] };
      if (/INSERT INTO/.test(sql)) { order.push('insert'); return { rows: [{ id: 'a4' }], rowCount: 1 }; }
      return { rows: [], rowCount: 0 };
    });
    scanOnly.mockImplementation(async () => { order.push('scan'); return { clean: true }; });
    await saveTemplateAttachment({ templateId: TEMPLATE, filename: 'a.pdf', contentType: 'application/pdf', buffer: pdf() });
    expect(order).toEqual(['scan', 'insert']);
  });

  it('caps the number of files per template but still lets a file be replaced', async () => {
    const others = Array.from({ length: MAX_ATTACHMENTS_PER_TEMPLATE }, () => ({ x: 1 }));
    withSchema(true, { rows: others, rowCount: others.length });
    await expect(saveTemplateAttachment({ templateId: TEMPLATE, filename: 'sixth.pdf', contentType: 'application/pdf', buffer: pdf() }))
      .rejects.toMatchObject({ code: 'TOO_MANY_ATTACHMENTS', status: 409 });

    // The cap counts only files under a *different* name, so re-uploading an
    // existing filename replaces it instead of being refused.
    withSchema(true, { rows: others.slice(1), rowCount: others.length - 1 }, { rows: [{ id: 'a5' }], rowCount: 1 });
    await expect(saveTemplateAttachment({ templateId: TEMPLATE, filename: 'first.pdf', contentType: 'application/pdf', buffer: pdf() })).resolves.toBeDefined();
    const [countSql, countParams] = query.mock.calls.find(([sql]) => /lower\(filename\) <> lower/.test(sql));
    expect(countSql).toMatch(/WHERE template_id = \$1/);
    expect(countParams).toEqual([TEMPLATE, 'first.pdf']);
  });

  it('upserts on the template and filename, so a re-upload replaces the old bytes', async () => {
    withSchema(true, { rows: [], rowCount: 0 }, { rows: [{ id: 'a6' }], rowCount: 1 });
    await saveTemplateAttachment({ templateId: TEMPLATE, filename: 'Letter.pdf', contentType: 'application/pdf', buffer: pdf() });
    const [sql] = query.mock.calls.find(([text]) => /INSERT INTO/.test(text));
    expect(sql).toMatch(/ON CONFLICT \(template_id, lower\(filename\)\) DO UPDATE/);
    expect(sql).toMatch(/content = EXCLUDED\.content/);
  });
});

describe('reads are scoped to the template', () => {
  it('lists metadata without the bytes', async () => {
    withSchema(true, { rows: [{ id: 'a1', filename: 'Letter.pdf', byteSize: 1024 }], rowCount: 1 });
    const rows = await listTemplateAttachments(TEMPLATE);
    expect(rows).toEqual([{ id: 'a1', filename: 'Letter.pdf', byteSize: 1024 }]);
    const [sql, params] = query.mock.calls.find(([text]) => /FROM team_email_template_attachments/.test(text));
    expect(sql).not.toMatch(/\bcontent\b(?!_type)/);
    expect(params).toEqual([TEMPLATE]);
  });

  it('never queries with a missing template id', async () => {
    withSchema(true);
    expect(await listTemplateAttachments(undefined)).toEqual([]);
    expect(await mailAttachmentsForTemplate('')).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('scopes a download by template and attachment together', async () => {
    withSchema(true, { rows: [{ id: 'a1', filename: 'x.pdf', content: pdf() }], rowCount: 1 });
    await readTemplateAttachment(TEMPLATE, 'a1');
    const [sql, params] = query.mock.calls.find(([text]) => /SELECT .*content FROM team_email_template_attachments/s.test(text));
    expect(sql).toMatch(/WHERE template_id = \$1 AND id = \$2/);
    expect(params).toEqual([TEMPLATE, 'a1']);
  });

  it('scopes a delete the same way and reports whether a row went', async () => {
    withSchema(true, { rows: [], rowCount: 1 });
    expect(await deleteTemplateAttachment(TEMPLATE, 'a1')).toBe(true);
    const [sql, params] = query.mock.calls.find(([text]) => /DELETE FROM/.test(text));
    expect(sql).toMatch(/WHERE template_id = \$1 AND id = \$2/);
    expect(params).toEqual([TEMPLATE, 'a1']);

    withSchema(true, { rows: [], rowCount: 0 });
    expect(await deleteTemplateAttachment(TEMPLATE, 'gone')).toBe(false);
  });

  it('counts attachments for several templates in one query, de-duplicating ids', async () => {
    withSchema(true, { rows: [{ templateId: TEMPLATE, count: 2 }], rowCount: 1 });
    expect(await attachmentCountsByTemplate([TEMPLATE, TEMPLATE, null, undefined])).toEqual({ [TEMPLATE]: 2 });
    const [, params] = query.mock.calls.find(([sql]) => /GROUP BY template_id/.test(sql));
    expect(params[0]).toEqual([TEMPLATE]);
  });

  it('returns no counts for an empty id list without touching the database', async () => {
    withSchema(true);
    expect(await attachmentCountsByTemplate([])).toEqual({});
    expect(query).not.toHaveBeenCalled();
  });
});

describe('mail attachments', () => {
  it('shapes the stored rows the way nodemailer expects', async () => {
    const bytes = pdf();
    withSchema(true, { rows: [{ filename: 'Letter.pdf', contentType: 'application/pdf', content: bytes }], rowCount: 1 });
    expect(await mailAttachmentsForTemplate(TEMPLATE)).toEqual([
      { filename: 'Letter.pdf', content: bytes, contentType: 'application/pdf' },
    ]);
  });

  it('sends the uploaded bytes unchanged — nothing is generated at send time', async () => {
    const bytes = pdf(512);
    withSchema(true, { rows: [{ filename: 'Letter.pdf', contentType: 'application/pdf', content: bytes }], rowCount: 1 });
    const [attachment] = await mailAttachmentsForTemplate(TEMPLATE);
    expect(attachment.content).toBe(bytes);
    expect(attachment.content.equals(bytes)).toBe(true);
  });
});

describe('resolving a category for an automated send', () => {
  it('uses the single template of that category that carries files', async () => {
    withSchema(true,
      { rows: [{ id: TEMPLATE }], rowCount: 1 },
      { rows: [{ filename: 'AHC.pdf', contentType: 'application/pdf', content: pdf() }], rowCount: 1 });
    const resolved = await mailAttachmentsForCategory('corporate_ahc');
    expect(resolved.reason).toBe('ok');
    expect(resolved.templateId).toBe(TEMPLATE);
    expect(resolved.attachments).toHaveLength(1);
  });

  it('attaches nothing when no template of that category has a file', async () => {
    withSchema(true, { rows: [], rowCount: 0 });
    expect(await mailAttachmentsForCategory('corporate_ahc')).toEqual({ attachments: [], templateId: null, reason: 'no_attachments' });
  });

  it('refuses an ambiguous category rather than guessing an employer document', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    withSchema(true, { rows: [{ id: 'one' }, { id: 'two' }], rowCount: 2 });
    const resolved = await mailAttachmentsForCategory('corporate_ahc');
    expect(resolved).toEqual({ attachments: [], templateId: null, reason: 'ambiguous_template' });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('ambiguous'));
    warn.mockRestore();
  });

  it('is inert before the migration, and for a missing category', async () => {
    withSchema(false);
    expect(await mailAttachmentsForCategory('corporate_ahc')).toMatchObject({ reason: 'unavailable', attachments: [] });
    __resetAttachmentsSchemaCache();
    withSchema(true);
    expect(await mailAttachmentsForCategory('')).toMatchObject({ reason: 'unavailable' });
  });
});
