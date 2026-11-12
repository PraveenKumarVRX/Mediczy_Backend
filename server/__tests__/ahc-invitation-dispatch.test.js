import { jest } from '@jest/globals';

const dbQuery = jest.fn();
const notifyAhcEntitlement = jest.fn();

jest.unstable_mockModule('../db/postgres-sequelize.js', () => ({
  postgresSequelize: { query: dbQuery, QueryTypes: { SELECT: 'SELECT' } },
}));
jest.unstable_mockModule('../services/corporate-ahc-entitlement-notification.service.js', () => ({ notifyAhcEntitlement }));

const { invitationStatus, dispatchInvitations, MAX_PER_DISPATCH } =
  await import('../services/ahc-invitation-dispatch.service.js');

const PKG = 'Equitas_AHC_2026';
const pkg = (over = {}) => ({
  id: PKG, name: 'Equitas AHC 2026', corporate_id: 5, is_active: true,
  metadata: { kind: 'health_checkup', corporateValidFrom: '2026-11-12', corporateValidTo: '2027-03-31', individualValidityPeriod: '45 Days' },
  ...over,
});
const emp = (id, over = {}) => ({
  userId: id, name: `Employee ${id}`, email: `e${id}@equitas.bank.in`, phone: '9999999999',
  validFrom: '2026-11-12', validTo: '2026-12-27', usedAt: null,
  invitedEvent: null, emailStatus: null, whatsappStatus: null, sentAt: null, ...over,
});
/** First query is the package, second the entitlement roster. */
const arm = (packageRow, roster) => {
  dbQuery.mockReset();
  dbQuery
    .mockImplementationOnce(async () => (packageRow ? [packageRow] : []))
    .mockImplementationOnce(async () => roster)
    .mockImplementation(async () => []);
};

beforeEach(() => {
  notifyAhcEntitlement.mockReset().mockImplementation(async ({ userId }) => ({ sent: true, emailStatus: 'sent', whatsappStatus: 'failed', userId }));
});

describe('invitationStatus', () => {
  it('separates entitled, invited, pending and no-email', async () => {
    arm(pkg(), [emp(1), emp(2, { invitedEvent: 'invitation', emailStatus: 'sent', sentAt: '2026-11-11' }), emp(3, { email: '' })]);
    const s = await invitationStatus(PKG);
    expect(s.armed).toBe(true);
    expect(s.counts).toEqual({ entitled: 3, invited: 1, pending: 1, noEmail: 1 });
    expect(s.entitled.find(e => e.userId === 2).invited).toBe(true);
  });

  it('reports a package with no validity window as not armed, with the reason', async () => {
    arm(pkg({ metadata: { kind: 'health_checkup' } }), []);
    const s = await invitationStatus(PKG);
    expect(s.armed).toBe(false);
    expect(s.reason).toMatch(/corporateValidFrom/);
  });

  it('404s an unknown package', async () => {
    arm(null, []);
    await expect(invitationStatus(PKG)).rejects.toMatchObject({ status: 404 });
  });

  it('matches the ledger on the employee\'s own window, not a recomputed one', async () => {
    arm(pkg(), []);
    await invitationStatus(PKG);
    const [, rosterSql] = dbQuery.mock.calls[1];
    expect(dbQuery.mock.calls[1][0]).toContain('n.valid_to = uhp."validTo"');
    expect(dbQuery.mock.calls[1][0]).toContain("n.event_type = 'invitation'");
    expect(rosterSql.replacements).toEqual({ packageId: PKG, corporateId: 5 });
  });
});

describe('dispatchInvitations — reports before it sends', () => {
  it('defaults to a dry run and sends nothing', async () => {
    arm(pkg(), [emp(1), emp(2)]);
    const r = await dispatchInvitations({ packageId: PKG });
    expect(r).toMatchObject({ sent: false, dryRun: true });
    expect(r.wouldSend.map(w => w.userId)).toEqual([1, 2]);
    expect(notifyAhcEntitlement).not.toHaveBeenCalled();
  });

  it('sends only when explicitly told to', async () => {
    arm(pkg(), [emp(1), emp(2)]);
    const r = await dispatchInvitations({ packageId: PKG, send: true });
    expect(r.sent).toBe(true);
    expect(r.delivered).toBe(2);
    expect(notifyAhcEntitlement).toHaveBeenCalledTimes(2);
  });

  it('targets a chosen subset', async () => {
    arm(pkg(), [emp(1), emp(2), emp(3)]);
    const r = await dispatchInvitations({ packageId: PKG, userIds: [2], send: true });
    expect(notifyAhcEntitlement).toHaveBeenCalledTimes(1);
    expect(notifyAhcEntitlement.mock.calls[0][0]).toMatchObject({ userId: 2, eventType: 'invitation', validTo: '2026-12-27' });
    expect(r.delivered).toBe(1);
  });

  it('uses each employee\'s own validTo, so the date sent is the date they see', async () => {
    arm(pkg(), [emp(1, { validTo: '2026-12-27' }), emp(2, { validTo: '2027-01-15' })]);
    await dispatchInvitations({ packageId: PKG, send: true });
    expect(notifyAhcEntitlement.mock.calls.map(c => c[0].validTo)).toEqual(['2026-12-27', '2027-01-15']);
  });
});

describe('dispatchInvitations — who it refuses to email', () => {
  it('skips an employee already invited for that window', async () => {
    arm(pkg(), [emp(1, { invitedEvent: 'invitation', sentAt: '2026-11-11' }), emp(2)]);
    const r = await dispatchInvitations({ packageId: PKG, send: true });
    expect(notifyAhcEntitlement).toHaveBeenCalledTimes(1);
    expect(r.skipped).toEqual(expect.arrayContaining([expect.objectContaining({ userId: 1, reason: 'already_invited' })]));
  });

  it('skips an employee with no email on record', async () => {
    arm(pkg(), [emp(1, { email: '' })]);
    const r = await dispatchInvitations({ packageId: PKG, send: true });
    expect(notifyAhcEntitlement).not.toHaveBeenCalled();
    expect(r.skipped[0]).toMatchObject({ userId: 1, reason: 'no_email_on_record' });
  });

  it('skips an id that is not entitled rather than emailing it', async () => {
    arm(pkg(), [emp(1)]);
    const r = await dispatchInvitations({ packageId: PKG, userIds: [1, 999], send: true });
    expect(notifyAhcEntitlement).toHaveBeenCalledTimes(1);
    expect(r.skipped).toEqual(expect.arrayContaining([expect.objectContaining({ userId: 999, reason: 'not_entitled' })]));
  });

  it('refuses a package with no validity window instead of sending nothing silently', async () => {
    arm(pkg({ metadata: { kind: 'health_checkup' } }), [emp(1)]);
    await expect(dispatchInvitations({ packageId: PKG, send: true })).rejects.toMatchObject({ status: 409 });
    expect(notifyAhcEntitlement).not.toHaveBeenCalled();
  });

  it('refuses an inactive package', async () => {
    arm(pkg({ is_active: false }), [emp(1)]);
    await expect(dispatchInvitations({ packageId: PKG, send: true })).rejects.toMatchObject({ status: 409 });
  });

  it('caps one call, and names what it deferred rather than dropping it', async () => {
    const roster = Array.from({ length: MAX_PER_DISPATCH + 3 }, (_, i) => emp(i + 1));
    arm(pkg(), roster);
    const r = await dispatchInvitations({ packageId: PKG, send: true });
    expect(notifyAhcEntitlement).toHaveBeenCalledTimes(MAX_PER_DISPATCH);
    expect(r.skipped.filter(s => s.reason === 'over_dispatch_cap')).toHaveLength(3);
  });

  it('honours a smaller explicit limit but never a larger one', async () => {
    const roster = Array.from({ length: 10 }, (_, i) => emp(i + 1));
    arm(pkg(), roster);
    await dispatchInvitations({ packageId: PKG, send: true, limit: 3 });
    expect(notifyAhcEntitlement).toHaveBeenCalledTimes(3);

    arm(pkg(), roster);
    notifyAhcEntitlement.mockClear();
    await dispatchInvitations({ packageId: PKG, send: true, limit: 99999 });
    expect(notifyAhcEntitlement).toHaveBeenCalledTimes(10);
  });

  it('records a per-employee failure without aborting the rest', async () => {
    arm(pkg(), [emp(1), emp(2), emp(3)]);
    notifyAhcEntitlement.mockImplementation(async ({ userId }) => {
      if (userId === 2) throw new Error('SMTP 554');
      return { sent: true, emailStatus: 'sent' };
    });
    const r = await dispatchInvitations({ packageId: PKG, send: true });
    expect(r.delivered).toBe(2);
    expect(r.failed).toBe(1);
    expect(r.results.find(x => x.userId === 2).error).toMatch(/SMTP 554/);
  });
});
