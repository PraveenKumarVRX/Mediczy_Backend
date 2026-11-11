/**
 * Reproduces the production failure: express-fileupload is mounted globally and
 * drains the request stream, so a multer route further down gets an empty body
 * and busboy reports "Unexpected end of form".
 *
 * This mounts the real express-fileupload with app.js's configuration and the
 * real usesMulter() gate, so it fails if the attachment path ever falls off the
 * list again. Nothing here is mocked.
 */
import express from 'express';
import request from 'supertest';
import multer from 'multer';
import fileUpload from 'express-fileupload';
import { usesMulter } from '../utils/multer-upload-paths.js';

const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.from('letter body'), Buffer.from('\n%%EOF\n')]);

/** app.js's own configuration, verbatim. */
const globalFileUpload = fileUpload({
  limits: { fileSize: 10 * 1024 * 1024 },
  abortOnLimit: true,
  responseOnLimit: 'File size limit exceeded',
  createParentPath: true,
  tempFileDir: '/tmp/',
});

const buildApp = (gate) => {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => (gate(req.path, req.method) ? next() : globalFileUpload(req, res, next)));
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
  app.post('/api/team/emails/templates/:id/attachments', (req, res) => {
    upload.any()(req, res, (err) => {
      if (err) return res.status(400).json({ ok: false, reason: err.message });
      const file = (req.files || [])[0];
      if (!file) return res.status(400).json({ ok: false, reason: 'no file' });
      res.json({ ok: true, bytes: file.buffer.length, name: file.originalname, intact: file.buffer.equals(pdf) });
    });
  });
  return app;
};

const post = (app) => request(app)
  .post('/api/team/emails/templates/db2f28d6-fd01-41dc-bcf9-c7bd31ba3e06/attachments')
  .attach('file', pdf, { filename: 'Letter.pdf', contentType: 'application/pdf' });

describe('global express-fileupload vs a multer route', () => {
  it('the upload survives with the real gate — the file reaches multer intact', async () => {
    const res = await post(buildApp(usesMulter));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, name: 'Letter.pdf', bytes: pdf.length, intact: true });
  });

  it('reproduces the production failure when the path is not on the list', async () => {
    // This is the state main shipped in: the attachment path missing from the
    // opt-out list. Without it, busboy gets a drained stream.
    const res = await post(buildApp(() => false));
    expect(res.status).toBe(400);
    expect(res.body.reason).toMatch(/Unexpected end of form|no file/);
  });

  it('a path that is on the list for POST only still breaks on a different verb', async () => {
    // Guards the method-awareness of the pattern rules: a PUT to the same path
    // would not be excluded, so a future PUT upload must be added explicitly.
    expect(usesMulter('/api/team/emails/templates/abc/attachments', 'PUT')).toBe(false);
    expect(usesMulter('/api/team/emails/templates/abc/attachments', 'POST')).toBe(true);
  });
});
