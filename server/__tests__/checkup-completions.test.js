import { readFileSync } from 'node:fs';
import { jest } from '@jest/globals';

const queries = [];
const contexts = [];
let respond = () => [];
const query = jest.fn(async (sql, opts = {}) => { queries.push({ sql, opts }); return respond(sql, opts); });
const readStoredReportFile = jest.fn();

jest.unstable_mockModule('../db/postgres-sequelize.js', () => ({
  postgresSequelize: { query, QueryTypes: { SELECT: 'SELECT' } },
}));
jest.unstable_mockModule('../services/corporate-health-checkup-booking.service.js', () => ({
  withCorporateBookingContext: async (ctx, fn) => { contexts.push(ctx); return fn('tx'); },
}));
jest.unstable_mockModule('../services/corporate-report-storage-client.js', () => ({ readStoredReportFile }));

const svc = await import('../services/checkup-completions.service.js');

const manualRow = {
  source: 'manual', report_id: 47, user_id: 4898, checkup_date: '2026-10-06T00:00:00.000Z', checkup_type: 'annual_health_checkup',
  report_name: 'AHC 2026', mime_type: 'application/pdf', file_size_bytes: '12378110', uploaded_at: '2026-10-31T08:05:03Z',
  notified_email: true, notified_whatsapp: false, sla_status: 'on_time', report_delivered_at: null, order_number: null, lab_name: null, has_file: true,
  first_name: 'Lella', last_name: 'Mallesh', email: 'l@example.com', phone: '9000000000', employee_code: '103818', department: 'Sales', designation: 'SO',
};
const bookingRow = { ...manualRow, source: 'booking', report_id: 9, report_name: null, has_file: false };

beforeEach(() => { queries.length = 0; contexts.length = 0; respond = () => []; readStoredReportFile.mockReset(); });

describe('listCheckupCompletions', () => {
  test('runs in the corporate booking context, scoped to the corporate, and maps rows', async () => {
    respond = (sql) => (sql.includes('AS all_rows') ? [{ total: 2, all_rows: 2, employees: 1, reports: 1, awaiting_reports: 1, sent: 1, not_sent: 0 }] : [manualRow, bookingRow]);
    const out = await svc.listCheckupCompletions({ corporateId: 45, actorUserId: 7, limit: 5000, page: 0, from: 'yesterday', to: '2026-12-31' });
    expect(contexts).toEqual([{ corporateId: 45, bookedByUserId: 7 }]);
    expect(queries).toHaveLength(2);
    for (const q of queries) {
      expect(q.opts.transaction).toBe('tx');
      expect(q.opts.replacements).toMatchObject({ corporateId: 45, from: null, to: '2026-12-31' });
    }
    expect(queries[0].opts.replacements).toMatchObject({ limit: 200, offset: 0 });
    expect(out.summary).toMatchObject({ employeesCompleted: 1, reports: 1, awaitingReports: 1 });
    expect(out.rows[0]).toMatchObject({
      key: 'manual-47', source: 'manual', reportId: 47, status: 'report_available', canShare: true,
      employee: { userId: 4898, name: 'Lella Mallesh', employeeId: '103818', department: 'Sales' },
      report: { sizeBytes: 12378110, hasFile: true, notifiedEmail: true, notifiedWhatsapp: false },
    });
    expect(out.rows[1]).toMatchObject({ key: 'booking-9', status: 'awaiting_report', report: null, canShare: false });
  });

  test('a status filter narrows the page and the total, while the summary keeps every chip count', async () => {
    respond = (sql) => (sql.includes('AS all_rows') ? [{ total: 30, all_rows: 101, employees: 74, reports: 101, awaiting_reports: 0, sent: 71, not_sent: 30 }] : []);
    const out = await svc.listCheckupCompletions({ corporateId: 5, actorUserId: 7, status: 'not_sent' });
    expect(queries[0].sql).toContain("AND rows.source <> 'booking' AND NOT (COALESCE(rows.notified_email, false) OR COALESCE(rows.notified_whatsapp, false))");
    expect(queries[1].sql).toContain("count(*) FILTER (WHERE s.source <> 'booking' AND NOT");
    expect(out).toMatchObject({ total: 30, status: 'not_sent', summary: { all: 101, reports: 101, sentToEmployee: 71, notSent: 30 } });
    queries.length = 0;
    const any = await svc.listCheckupCompletions({ corporateId: 5, actorUserId: 7, status: "x'; DROP TABLE users; --" });
    expect(any.status).toBeNull();
    expect(queries[0].sql).toContain('AND true ORDER BY');
    expect(queries.some((q) => q.sql.includes('DROP'))).toBe(false);
  });

  test('every source is filtered by the corporate, pre-employment reports are left out', () => {
    const src = readFileSync(new URL('../services/checkup-completions.service.js', import.meta.url), 'utf8');
    expect(src).toContain('WHERE chr.corporate_id = :corporateId');
    expect(src).toContain(`ua."entityType" = 'corporate' AND ua."entityId" = :corporateId`);
    expect(src).toContain('WHERE b.corporate_id = :corporateId');
    expect(src).toContain("<> 'pre_employment'");
  });

  test('only lab reports matched from email are listed, never a member\'s own uploads', () => {
    const src = readFileSync(new URL('../services/checkup-completions.service.js', import.meta.url), 'utf8');
    expect(src.match(/r\."reportType" = 'lab' AND r\.metadata \? 'emailId'/g)).toHaveLength(2);
  });
});

describe('getCorporateReportFile', () => {
  test('refuses bookings, unknown sources and bad ids without touching the database', async () => {
    for (const [source, reportId] of [['booking', 9], ['other', 1], ['manual', 'x'], ['manual', -1]]) {
      expect(await svc.getCorporateReportFile({ corporateId: 4, actorUserId: 1, source, reportId })).toBeNull();
    }
    expect(queries).toHaveLength(0);
  });

  test('a report of another corporate is not found', async () => {
    expect(await svc.getCorporateReportFile({ corporateId: 4, actorUserId: 1, source: 'manual', reportId: 47 })).toBeNull();
    expect(queries[0].sql).toContain('chr.id = :id AND chr.corporate_id = :corporateId');
    expect(queries[0].opts.replacements).toEqual({ id: 47, corporateId: 4 });
  });

  test('a Team upload is read from the store its URL names', async () => {
    respond = () => [{ id: 47, employee_id: 4898, name: 'AHC 2026', mime_type: 'application/pdf', key: 'health-reports/a.pdf', url: 'https://minio-pacs.mediqzy.com/pacs-entity-001/health-reports/a.pdf', bucket: null }];
    readStoredReportFile.mockResolvedValue(Buffer.from('%PDF-1.4'));
    const file = await svc.getCorporateReportFile({ corporateId: 45, actorUserId: 1, source: 'manual', reportId: 47 });
    expect(readStoredReportFile).toHaveBeenCalledWith({ key: 'health-reports/a.pdf', url: 'https://minio-pacs.mediqzy.com/pacs-entity-001/health-reports/a.pdf', bucket: null });
    expect(file).toMatchObject({ name: 'AHC 2026', employeeUserId: 4898 });
    expect(file.buffer.toString()).toBe('%PDF-1.4');
  });

  test('a file missing from storage is a 404, not a server error', async () => {
    respond = () => [{ id: 16, employee_id: 1, key: 'k', url: 'https://minio.mediqzy.com/web-uploads/k', bucket: 'web-uploads' }];
    readStoredReportFile.mockRejectedValue(Object.assign(new Error('The specified bucket does not exist'), { name: 'NoSuchBucket' }));
    await expect(svc.getCorporateReportFile({ corporateId: 5, actorUserId: 1, source: 'manual', reportId: 16 }))
      .rejects.toMatchObject({ status: 404, code: 'REPORT_FILE_MISSING' });
    readStoredReportFile.mockRejectedValue(new Error('connect ECONNREFUSED'));
    await expect(svc.getCorporateReportFile({ corporateId: 5, actorUserId: 1, source: 'manual', reportId: 16 })).rejects.toThrow('ECONNREFUSED');
  });

  test('an emailed lab report is read from the stored email attachment', async () => {
    const pdf = Buffer.from('%PDF-emailed').toString('base64');
    const other = Buffer.from('%PDF-other').toString('base64');
    let email = { attachments: [{ contentId: '<x1>', contentBase64: other }, { contentId: 'a5ba', contentBase64: pdf }] };
    let report = { id: 127, employee_id: 7711, name: 'Nisha.pdf', mime_type: 'application/pdf', email_id: 'e-uuid', attachment_id: '<a5ba>' };
    respond = (sql) => (sql.includes('FROM email_inboxes') ? [email] : [report]);
    const file = await svc.getCorporateReportFile({ corporateId: 5, actorUserId: 1, source: 'email', reportId: 127 });
    expect(file.buffer.toString()).toBe('%PDF-emailed');

    report = { ...report, attachment_id: null }; // no id: only safe when the email holds one stored file
    expect(await svc.getCorporateReportFile({ corporateId: 5, actorUserId: 1, source: 'email', reportId: 127 })).toBeNull();
    email = { attachments: [{ filename: 'x.pdf', contentBase64: pdf }, { filename: 'logo.png' }] };
    expect((await svc.getCorporateReportFile({ corporateId: 5, actorUserId: 1, source: 'email', reportId: 127 })).buffer.toString()).toBe('%PDF-emailed');
    email = { attachments: [{ contentId: 'zz' }] };
    report = { ...report, attachment_id: 'zz' };
    expect(await svc.getCorporateReportFile({ corporateId: 5, actorUserId: 1, source: 'email', reportId: 127 })).toBeNull();
  });
});

describe('sending and auditing', () => {
  test('files stream privately, inline to view and as an attachment to download', () => {
    const headers = {};
    const res = { setHeader: (k, v) => { headers[k] = v; }, end: jest.fn() };
    svc.sendReportFile(res, { name: 'Annual report 2026.pdf', mimeType: 'application/pdf', buffer: Buffer.from('x') }, 'attachment');
    expect(headers).toEqual({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="Annual-report-2026.pdf"', 'Cache-Control': 'private, no-store' });
    svc.sendReportFile(res, { name: 'r', mimeType: 'application/pdf', buffer: Buffer.from('x') });
    expect(headers['Content-Disposition']).toBe('inline; filename="r"');
  });

  test('HR access is written to the corporate report access log with the HR user, and a failed write does not break the request', async () => {
    const req = { user: { id: 45, corporateId: 45, userId: 31, role: 'hr_staff', email: 'hr@example.com' }, ip: '1.2.3.4', headers: {}, method: 'GET' };
    await svc.auditReportAccess(req, { action: 'hr_view_checkup_report', corporateId: 45, source: 'manual', reportId: 47, employeeUserId: 4898 });
    expect(queries[0].sql).toContain('INSERT INTO corporate_report_access_log');
    expect(queries[0].opts.replacements).toMatchObject({ corporateId: 45, userId: 31, actorType: 'hr', action: 'hr_view_checkup_report', resourceId: 'manual-47' });
    await svc.auditReportAccess(req, { action: 'hr_list_checkup_reports', source: 'list', reportId: 0 });
    expect(queries[1].opts.replacements).toMatchObject({ resourceId: 'checkup-completions', title: 'Completed check-ups list' });
    for (const a of ['hr_list_checkup_reports', 'hr_view_checkup_report', 'hr_download_checkup_report', 'hr_share_checkup_report']) expect(a.length).toBeLessThanOrEqual(30); // action is VARCHAR(30)
    respond = () => { throw new Error('db down'); };
    await expect(svc.auditReportAccess(req, { action: 'x', corporateId: 1, source: 'manual', reportId: 1 })).resolves.toBeUndefined();
  });
});

describe('route wiring', () => {
  const team = readFileSync(new URL('../routes/corporate-bookings.route.js', import.meta.url), 'utf8');
  const hr = readFileSync(new URL('../routes/corporate.route.js', import.meta.url), 'utf8');

  test('Team routes are Team/admin only and corporate-scoped; the report id is never named :id', () => {
    expect(team).toMatch(/router\.get\('\/checkup-completions', authUser, requireTeamOrAdmin, requireCorporateAccess/);
    expect(team).toMatch(/router\.get\('\/checkup-reports\/:source\/:reportId\/file', authUser, requireTeamOrAdmin, requireCorporateAccess/);
    expect(team).not.toMatch(/checkup-reports\/:source\/:id/);
  });

  test('HR routes use the corporate login and audit list, view, download and share', () => {
    for (const path of ["'/checkup-completions'", "'/checkup-reports/:source/:reportId/file'", "'/checkup-reports/:reportId/share'"]) {
      expect(hr).toMatch(new RegExp(`router\\.(get|post)\\(${path.replace(/[/:]/g, (c) => `\\${c}`)}, authCorporate`));
    }
    for (const action of ['hr_list_checkup_reports', 'hr_view_checkup_report', 'hr_download_checkup_report', 'hr_share_checkup_report']) {
      expect(hr).toContain(action);
    }
  });

  test('sharing is limited to the caller\'s corporate', () => {
    expect(team).toContain('WHERE chr.id = :id AND chr.corporate_id = :corporateId');
  });
});
