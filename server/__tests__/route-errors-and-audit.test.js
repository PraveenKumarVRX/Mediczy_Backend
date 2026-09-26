import { jest } from '@jest/globals';

const poolQuery = jest.fn();
jest.unstable_mockModule('../db/pgPool.js', () => ({ default: { query: poolQuery } }));

const { sendRouteError } = await import('../utils/route-errors.js');
const { auditAction } = await import('../utils/action-audit.js');

const res = () => { const r = { code: null, body: null }; r.status = (c) => { r.code = c; return r; }; r.json = (b) => { r.body = b; return r; }; return r; };
const pgError = (code, message = 'duplicate key value violates unique constraint "uq_secret_index"') =>
  Object.assign(new Error(message), { code, severity: 'ERROR', routine: 'x' });

describe('sendRouteError — database text never reaches the client (audit FIN-08 / OPS-07)', () => {
  it.each([
    ['23505', 409, 'DUPLICATE'],
    ['23503', 409, 'REFERENCE_NOT_FOUND'],
    ['23514', 422, 'BUSINESS_RULE_VIOLATION'],
    ['23502', 400, 'REQUIRED_VALUE_MISSING'],
    ['22P02', 400, 'INVALID_VALUE'],
  ])('maps SQLSTATE %s to %s / %s with a generic message', (sqlstate, status, code) => {
    const r = res();
    sendRouteError(r, pgError(sqlstate));
    expect(r.code).toBe(status);
    expect(r.body).toMatchObject({ success: false, code });
    expect(JSON.stringify(r.body)).not.toMatch(/uq_secret_index|duplicate key|constraint/i);
  });

  it('an unmapped database error is a generic 500 and is logged, never echoed', () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    const r = res();
    sendRouteError(r, pgError('42P01', 'relation "finance_journal_entries" does not exist'));
    expect(r.code).toBe(500);
    expect(JSON.stringify(r.body)).not.toMatch(/relation|finance_journal_entries/);
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it('Sequelize errors are treated as database errors too', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const r = res();
    sendRouteError(r, Object.assign(new Error('SELECT secret FROM t'), { name: 'SequelizeDatabaseError' }));
    expect(r.code).toBe(500);
    expect(JSON.stringify(r.body)).not.toMatch(/SELECT/);
    console.error.mockRestore?.();
  });

  it('coded application errors keep their own status, code and message (a 409 stays a 409)', () => {
    const r = res();
    sendRouteError(r, Object.assign(new Error('Fiscal period 2026-04 is closed'), { status: 409, code: 'FISCAL_PERIOD_CLOSED' }));
    expect(r.code).toBe(409);
    expect(r.body).toEqual({ success: false, code: 'FISCAL_PERIOD_CLOSED', message: 'Fiscal period 2026-04 is closed' });
  });

  it('a plain Error falls back to the given status (400 by default, 500 when asked)', () => {
    const a = res(); sendRouteError(a, new Error('Admission not found'));
    expect(a.code).toBe(400);
    const b = res(); sendRouteError(b, new Error('boom'), 500);
    expect(b.code).toBe(500);
  });

  it('survives a missing / odd error object', () => {
    const r = res();
    expect(() => sendRouteError(r, undefined)).not.toThrow();
    expect(r.code).toBe(400);
    expect(r.body.message).toBe('Request failed');
  });

  it('a 5-character application code that is not a database error is NOT mistaken for one', () => {
    const r = res();
    sendRouteError(r, Object.assign(new Error('nope'), { code: 'ABCDE', status: 418 }));
    expect(r.code).toBe(418);
  });
});

describe('auditAction — append-only audit row (audit OPS-02 / COR-02)', () => {
  beforeEach(() => poolQuery.mockReset());

  it('writes one row with the module, entity, action, actor, organization and JSON details', async () => {
    poolQuery.mockResolvedValueOnce({ rows: [] });
    await auditAction({ module: 'mrd', entityType: 'mrd_record', entityId: 42, action: 'index', actor: 7, organizationId: 11, details: { role: 'mrd_staff' } });
    const [sql, params] = poolQuery.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO operations_audit_log/);
    expect(params).toEqual(['mrd', 'mrd_record', '42', 'index', '7', JSON.stringify({ role: 'mrd_staff' }), 11]);
  });

  it('records a missing actor as "system" and a missing organization as NULL (corporate actions have no hospital org)', async () => {
    poolQuery.mockResolvedValueOnce({ rows: [] });
    await auditAction({ module: 'corporate', entityType: 'health_package', entityId: 'P-1', action: 'delete' });
    expect(poolQuery.mock.calls[0][1]).toEqual(['corporate', 'health_package', 'P-1', 'delete', 'system', '{}', null]);
  });

  it('best-effort by default: an audit failure is logged loudly but does not fail the user\'s action', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    poolQuery.mockRejectedValueOnce(new Error('audit table unreachable'));
    await expect(auditAction({ module: 'm', entityType: 'e', action: 'a' })).resolves.toBeUndefined();
    expect(log.mock.calls[0][0]).toMatch(/FAILED to record m\.a/);
    log.mockRestore();
  });

  it('strict mode rethrows, for actions that must not happen without their audit row', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    poolQuery.mockRejectedValueOnce(new Error('audit table unreachable'));
    await expect(auditAction({ module: 'm', entityType: 'e', action: 'a' }, { strict: true })).rejects.toThrow('audit table unreachable');
    console.error.mockRestore?.();
  });

  it('can write on a caller-supplied client so the audit row commits or rolls back with the change it describes', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    await auditAction({ module: 'entitlements', entityType: 'tenant_entitlement', action: 'grant', actor: 1 }, { client });
    expect(client.query).toHaveBeenCalledTimes(1);
    expect(poolQuery).not.toHaveBeenCalled();
  });
});
