import { usesMulter, MULTER_UPLOAD_PATHS, MULTER_UPLOAD_PATTERNS } from '../utils/multer-upload-paths.js';
import { NURSING_IMAGE_UPLOAD_PATHS } from '../utils/nursing-upload-paths.js';
import fs from 'fs';
import path from 'path';

describe('express-fileupload must stand aside for multer routes', () => {
  it('covers the Team email template attachment upload', () => {
    // The route that this list forgot: express-fileupload drained the body and
    // busboy answered "Unexpected end of form", which reached the user as a
    // bare 400 naming nothing.
    expect(usesMulter('/api/team/emails/templates/db2f28d6-fd01-41dc-bcf9-c7bd31ba3e06/attachments', 'POST')).toBe(true);
    expect(usesMulter('/api/team/emails/templates/123/attachments', 'POST')).toBe(true);
  });

  it('does not stand aside for the reads on that same route', () => {
    // GET/DELETE carry no body; letting express-fileupload see them is harmless
    // but the exclusion should stay as narrow as the problem.
    expect(usesMulter('/api/team/emails/templates/abc/attachments', 'GET')).toBe(false);
    expect(usesMulter('/api/team/emails/templates/abc/attachments/def', 'DELETE')).toBe(false);
  });

  it('keeps every path that was already excluded', () => {
    for (const p of ['/api/team/emails/send', '/api/voice-assistant/stt', '/api/hypergrid/dicom/studies',
      '/api/corporate-bookings/reports/upload', '/api/lab/ris/upload', '/api/crm/rfqs']) {
      expect(usesMulter(p, 'POST')).toBe(true);
    }
    for (const p of NURSING_IMAGE_UPLOAD_PATHS) expect(usesMulter(p, 'POST')).toBe(true);
  });

  it('matches a listed path as a prefix only on a / boundary', () => {
    expect(usesMulter('/api/crm/rfqs/upload-excel', 'POST')).toBe(true);
    expect(usesMulter('/api/crm/rfqs-archive', 'POST')).toBe(false);
    expect(usesMulter('/api/team/emails/send-later', 'POST')).toBe(false);
  });

  it('keeps the dynamic routes that were matched by regex before', () => {
    expect(usesMulter('/api/doctors/upload/avatar', 'POST')).toBe(true);
    expect(usesMulter('/api/doctors/upload/avatar/extra', 'POST')).toBe(false);
    expect(usesMulter('/api/reports', 'POST')).toBe(true);
    expect(usesMulter('/api/reports/upload', 'POST')).toBe(false); // express-fileupload owns this one
  });

  it('is method-aware for the pattern rules', () => {
    expect(usesMulter('/api/reports', 'GET')).toBe(false);
    expect(usesMulter('/api/doctors/upload/avatar', 'GET')).toBe(false);
  });

  it('leaves ordinary paths alone and tolerates junk input', () => {
    for (const p of ['/api/health', '/api/employee/benefits', '/', '']) expect(usesMulter(p, 'POST')).toBe(false);
    expect(usesMulter(undefined, undefined)).toBe(false);
    expect(usesMulter(null, 'POST')).toBe(false);
  });

  it('app.js delegates to this module rather than keeping its own copy', () => {
    // The list lived inline in app.js and went stale. If a second copy
    // reappears there, this test is the one that should fail.
    const appSource = fs.readFileSync(path.join(process.cwd(), 'app.js'), 'utf8');
    expect(appSource).toContain("usesMulter(req.path, req.method)");
    expect(appSource).not.toContain("'/api/offline-scribe/transcribe'");
    expect(appSource).not.toContain("const multerPaths");
  });

  it('every entry is an absolute /api path, so none can match by accident', () => {
    for (const p of MULTER_UPLOAD_PATHS) {
      expect(p.startsWith('/')).toBe(true);
      expect(p.endsWith('/')).toBe(false);
    }
    for (const rule of MULTER_UPLOAD_PATTERNS) {
      expect(rule.pattern.source.startsWith('^')).toBe(true);
      expect(rule.pattern.source.endsWith('$')).toBe(true);
      expect(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).toContain(rule.method);
    }
  });
});
