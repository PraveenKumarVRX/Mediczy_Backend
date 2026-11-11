import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const listTemplateAttachments = jest.fn();
const attachmentCountsByTemplate = jest.fn();
const saveTemplateAttachment = jest.fn();
const readTemplateAttachment = jest.fn();
const deleteTemplateAttachment = jest.fn();
const mailAttachmentsForTemplate = jest.fn();
const templateFindOne = jest.fn();

jest.unstable_mockModule('../middleware/team.middleware.js', () => ({
  authTeam: (req, res, next) => { req.teamUser = { id: 6, role: 'team' }; next(); },
  default: {},
}));
jest.unstable_mockModule('../models/teamEmailTemplate.model.js', () => ({
  default: { findOne: templateFindOne, findAll: jest.fn(async () => []), create: jest.fn() },
}));
jest.unstable_mockModule('../models/postgres/team-member.model.postgres.js', () => ({
  default: { findByPk: jest.fn(async () => ({ id: 6 })), findOne: jest.fn() },
}));
jest.unstable_mockModule('../models/emailInbox.model.js', () => ({ default: { create: jest.fn(), findOne: jest.fn() } }));
jest.unstable_mockModule('../models/emailSettings.model.js', () => ({ default: { findOne: jest.fn() } }));
jest.unstable_mockModule('../services/inboundEmailService.js', () => ({ default: {} }));
jest.unstable_mockModule('../services/emailService.js', () => ({ default: { sendOutboundEmail: jest.fn() } }));
jest.unstable_mockModule('../services/emailAutoProcessService.js', () => ({ processEmailFull: jest.fn(), batchProcessInbox: jest.fn() }));
jest.unstable_mockModule('../services/ai-brain/llm-provider.js', () => ({ default: { chat: jest.fn() } }));
jest.unstable_mockModule('../services/team-email-template-personalization.service.js', () => ({ personalizeEmailTemplate: jest.fn() }));
jest.unstable_mockModule('../services/team-email-template-attachments.service.js', () => ({
  listTemplateAttachments, attachmentCountsByTemplate, saveTemplateAttachment,
  readTemplateAttachment, deleteTemplateAttachment, mailAttachmentsForTemplate,
  ALLOWED_ATTACHMENT_TYPES: ['application/pdf'], MAX_ATTACHMENTS_PER_TEMPLATE: 5,
}));

const { default: router } = await import('../routes/teamEmail.route.js');
const app = express();
app.use(express.json());
app.use(router);

const T = 'db2f28d6-fd01-41dc-bcf9-c7bd31ba3e06';
const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.from('letter'), Buffer.from('\n%%EOF\n')]);

beforeEach(() => {
  for (const fn of [listTemplateAttachments, attachmentCountsByTemplate, saveTemplateAttachment,
    readTemplateAttachment, deleteTemplateAttachment, mailAttachmentsForTemplate, templateFindOne]) fn.mockReset();
  templateFindOne.mockResolvedValue({ id: T, category: 'corporate_ahc' });
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { console.warn.mockRestore?.(); console.error.mockRestore?.(); });

describe('POST /templates/:id/attachments', () => {
  it('accepts a normal multipart upload and stores the bytes', async () => {
    saveTemplateAttachment.mockResolvedValue({ id: 'a1', filename: 'Letter.pdf', byteSize: pdf.length });
    const res = await request(app)
      .post(`/templates/${T}/attachments`)
      .attach('file', pdf, { filename: 'Letter.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ success: true, data: { id: 'a1' } });
    const [args] = saveTemplateAttachment.mock.calls[0];
    expect(args.templateId).toBe(T);
    expect(args.filename).toBe('Letter.pdf');
    expect(args.contentType).toBe('application/pdf');
    expect(args.buffer.equals(pdf)).toBe(true);
    expect(args.uploadedByUserId).toBe(6);
  });

  it('accepts the upload when the boundary is missing from Content-Type', async () => {
    // The app's service worker re-issues the request and drops the boundary.
    // Bare multer answers that by handing Express an error, which becomes an
    // HTML 500 — this is the regression this wrapper exists to prevent.
    saveTemplateAttachment.mockResolvedValue({ id: 'a2', filename: 'Letter.pdf' });
    const boundary = '----probeBoundary1234';
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="Letter.pdf"\r\nContent-Type: application/pdf\r\n\r\n`),
      pdf,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const res = await request(app)
      .post(`/templates/${T}/attachments`)
      .set('Content-Type', 'multipart/form-data')   // no boundary= parameter
      .send(body);

    expect(res.status).toBe(201);
    expect(saveTemplateAttachment).toHaveBeenCalledTimes(1);
    expect(saveTemplateAttachment.mock.calls[0][0].buffer.equals(pdf)).toBe(true);
  });

  it('accepts a cached client that used a different field name', async () => {
    saveTemplateAttachment.mockResolvedValue({ id: 'a3', filename: 'Letter.pdf' });
    const res = await request(app)
      .post(`/templates/${T}/attachments`)
      .attach('attachments', pdf, { filename: 'Letter.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(201);
  });

  it('answers a JSON body with 400, not a 500', async () => {
    const res = await request(app).post(`/templates/${T}/attachments`).send({ nope: true });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ success: false, message: 'Attach a file to upload' });
    expect(saveTemplateAttachment).not.toHaveBeenCalled();
  });

  it('passes a rejection from the service through with its own status', async () => {
    saveTemplateAttachment.mockRejectedValue(Object.assign(new Error('The file contents do not match its type'), { code: 'FILE_SIGNATURE_MISMATCH', status: 415 }));
    const res = await request(app)
      .post(`/templates/${T}/attachments`)
      .attach('file', Buffer.from('MZ\x90\x00'), { filename: 'x.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(415);
    expect(res.body).toMatchObject({ code: 'FILE_SIGNATURE_MISMATCH', message: 'The file contents do not match its type' });
  });

  it('hides the detail of an unexpected failure but still answers JSON', async () => {
    saveTemplateAttachment.mockRejectedValue(new Error('connection terminated'));
    const res = await request(app)
      .post(`/templates/${T}/attachments`)
      .attach('file', pdf, { filename: 'Letter.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, message: 'Unable to save the attachment', code: undefined });
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });

  it('404s a template the caller does not own, without reading the file', async () => {
    templateFindOne.mockResolvedValue(null);
    const res = await request(app)
      .post(`/templates/${T}/attachments`)
      .attach('file', pdf, { filename: 'Letter.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(404);
    expect(saveTemplateAttachment).not.toHaveBeenCalled();
  });
});

describe('GET /templates/:id/attachments', () => {
  it('lists metadata with the limits the client needs', async () => {
    listTemplateAttachments.mockResolvedValue([{ id: 'a1', filename: 'Letter.pdf', byteSize: 2048 }]);
    const res = await request(app).get(`/templates/${T}/attachments`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta).toEqual({ maxFiles: 5, allowedTypes: ['application/pdf'] });
  });

  it('answers an empty list, not an error, before any file is attached', async () => {
    listTemplateAttachments.mockResolvedValue([]);
    const res = await request(app).get(`/templates/${T}/attachments`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: [] });
  });

  it('404s for a template the caller does not own', async () => {
    templateFindOne.mockResolvedValue(null);
    expect((await request(app).get(`/templates/${T}/attachments`)).status).toBe(404);
    expect(listTemplateAttachments).not.toHaveBeenCalled();
  });
});

describe('GET /templates/:id/attachments/:attachmentId', () => {
  it('returns the file with a safe disposition header', async () => {
    readTemplateAttachment.mockResolvedValue({ filename: 'Equitas "AHC".pdf', contentType: 'application/pdf', byteSize: pdf.length, content: pdf });
    const res = await request(app).get(`/templates/${T}/attachments/a1`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toBe('attachment; filename="Equitas AHC.pdf"');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.from(res.body).equals(pdf)).toBe(true);
  });

  it('404s an attachment that belongs to another template', async () => {
    readTemplateAttachment.mockResolvedValue(null);
    expect((await request(app).get(`/templates/${T}/attachments/a1`)).status).toBe(404);
  });
});

describe('DELETE /templates/:id/attachments/:attachmentId', () => {
  it('removes it', async () => {
    deleteTemplateAttachment.mockResolvedValue(true);
    const res = await request(app).delete(`/templates/${T}/attachments/a1`);
    expect(res.status).toBe(200);
    expect(deleteTemplateAttachment).toHaveBeenCalledWith(T, 'a1');
  });

  it('404s when nothing was removed', async () => {
    deleteTemplateAttachment.mockResolvedValue(false);
    expect((await request(app).delete(`/templates/${T}/attachments/a1`)).status).toBe(404);
  });
});
