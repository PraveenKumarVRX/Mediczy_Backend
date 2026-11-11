import { describe, expect, it, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(join(ROOT, file), 'utf8');

/**
 * A member could not see their own insurance e-card: every e-card endpoint was
 * gated to the TPA desk, so the Benefits Hub insurance section had nothing to
 * call and answered 404.
 *
 * The risk in closing that gap is identity. tpa_members holds a name, the
 * employer's own staff code and four digits of a phone number, and resolving a
 * card by any of those collides — a collision hands one person another
 * person's policy number, coverage and balance.
 */
describe('a member resolves only through an explicit account link', () => {
  const service = read('services/tpa-claims-lifecycle.service.js');
  const resolver = service.slice(
    service.indexOf('async getECardForUser('),
    service.indexOf('export const tpaClaimsLifecycleService')
  );

  it('matches on the linked user id', () => {
    expect(resolver).toContain('WHERE user_id = :userId');
    expect(resolver).toContain("status = 'active'");
  });

  it('never matches on a name, a staff code or part of a phone number', () => {
    for (const column of ['employee_name', 'phone_last4', 'employee_id']) {
      expect(resolver).not.toContain(column);
    }
    expect(resolver).not.toMatch(/ILIKE/i);
  });

  it('builds the card with the same generator the TPA desk uses, so the two cannot drift', () => {
    expect(resolver).toContain('this.generateECard(tpaId, memberId)');
  });

  it('answers nothing rather than leaking that some other member matched', () => {
    expect(resolver).toContain('return null');
  });

  it('survives the link column not being migrated yet', () => {
    // The column arrives with 20261111000100. Until then nobody has a verified
    // link, which is the same answer as an unlinked member, not an error page.
    expect(resolver).toContain("['42703', '42P01']");
  });
});

describe('the endpoint', () => {
  const route = read('routes/membership.route.js');
  const handler = route.slice(route.indexOf("router.get('/e-card'"), route.indexOf("router.get('/my/current'"));

  it('is authenticated and scoped to the caller, never to an id in the URL', () => {
    expect(handler).toContain("router.get('/e-card', authUser");
    // Resolution moved behind member-ecard.service.js, which tries the TPA
    // membership first and then the policy roster. The scoping rule is
    // unchanged and is what matters here: the row holds a policy number and a
    // balance, so resolving it by anything a caller supplies is how one member
    // ends up holding another member's card.
    expect(handler).toContain('resolveMemberCard(req.user.id)');
    expect(handler).not.toMatch(/req\.(params|query|body)/);
  });

  it('names the state rather than failing blankly', () => {
    expect(handler).toContain("code: result?.reason || 'ECARD_NOT_LINKED'");
    expect(handler).toContain('status(404)');
    expect(handler).toContain('result?.message');
  });

  it('does not put the database error in the response', () => {
    expect(handler).toContain('Could not load your e-card');
    expect(handler).not.toMatch(/error:\s*error\.message/);
  });
});

describe('the link column', () => {
  const migration = read('migrations/20261111000100-tpa-member-user-link.migration.js');

  it('is additive and nullable, so existing rows stay unlinked rather than guessed', () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS user_id BIGINT');
    // The column itself must stay nullable. The partial indexes legitimately
    // say "WHERE user_id IS NOT NULL", so assert the column, not the file.
    expect(migration).not.toMatch(/user_id BIGINT[^;\n]*NOT NULL/);
    expect(migration).not.toMatch(/ALTER COLUMN user_id SET NOT NULL/);
  });

  it('stops one account being two members of the same TPA', () => {
    expect(migration).toContain('uq_tpa_members_tpa_user');
    expect(migration).toMatch(/CREATE UNIQUE INDEX[\s\S]{0,160}WHERE user_id IS NOT NULL/);
  });

  it('is registered so a new environment gets it', () => {
    expect(read('scripts/migrate-all.mjs')).toContain('20261111000100-tpa-member-user-link');
  });
});

describe('resolution behaviour', () => {
  const load = async (queryImpl) => {
    jest.resetModules();
    jest.unstable_mockModule('../db/postgres-sequelize.js', () => ({
      postgresSequelize: { query: queryImpl, transaction: jest.fn() },
    }));
    return (await import('../services/tpa-claims-lifecycle.service.js')).tpaClaimsLifecycleService;
  };

  it('refuses an id that is not a positive integer without touching the database', async () => {
    const query = jest.fn();
    const svc = await load(query);
    for (const bad of [null, undefined, 0, -3, 'abc', 1.5]) {
      await expect(svc.getECardForUser(bad)).resolves.toBeNull();
    }
    expect(query).not.toHaveBeenCalled();
  });

  it('returns null when the account has no linked membership', async () => {
    const svc = await load(jest.fn(async () => []));
    await expect(svc.getECardForUser(19)).resolves.toBeNull();
  });

  it('treats a missing link column as an unlinked member, not an error', async () => {
    const svc = await load(jest.fn(async () => {
      const e = new Error('column "user_id" does not exist');
      e.original = { code: '42703' };
      throw e;
    }));
    await expect(svc.getECardForUser(19)).resolves.toBeNull();
  });

  it('lets an unrelated database error surface', async () => {
    const svc = await load(jest.fn(async () => {
      const e = new Error('connection terminated');
      e.original = { code: '08006' };
      throw e;
    }));
    await expect(svc.getECardForUser(19)).rejects.toThrow('connection terminated');
  });
});
