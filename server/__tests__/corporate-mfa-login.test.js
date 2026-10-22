import { jest } from "@jest/globals";
let factor = null;
const events = [];
const client = {
  release: jest.fn(),
  query: jest.fn(async (sql, values = []) => {
    if (sql.includes("INSERT INTO mfa_factors")) {
      factor = {
        id: "11111111-1111-4111-8111-111111111111",
        user_id: values[0],
        organization_id: values[1],
        secret_ciphertext: values[2],
        status: "pending",
        last_used_at: null,
        enrolled_at: null,
      };
      return { rows: [{ id: factor.id }] };
    }
    if (sql.includes("SELECT id, status FROM mfa_factors"))
      return { rows: factor ? [factor] : [] };
    if (sql.includes("SELECT * FROM mfa_factors"))
      return {
        rows:
          factor &&
          factor.user_id === values[0] &&
          factor.organization_id === values[1] &&
          (!values[2] || factor.status === values[2])
            ? [factor]
            : [],
      };
    if (sql.includes("SET status='active'")) {
      factor.status = "active";
      factor.enrolled_at = new Date(Date.now());
    }
    if (sql.includes("SET last_used_at=$2")) factor.last_used_at = values[1];
    if (sql.includes("INSERT INTO mfa_audit_events")) events.push(values);
    return { rows: [] };
  }),
};
const pool = {
  connect: async () => client,
  query: jest.fn(async (sql, values) => {
    if (sql.includes("information_schema"))
      return {
        rows: [
          { table_name: "mfa_factors" },
          { table_name: "mfa_audit_events" },
        ],
      };
    return {
      rows:
        factor &&
        factor.user_id === values[0] &&
        factor.organization_id === values[1]
          ? [factor]
          : [],
    };
  }),
};
jest.unstable_mockModule("../db/pgPool.js", () => ({ default: pool }));
jest.unstable_mockModule("../config/auth.config.js", () => ({
  JWT_CONFIG: { SECRET: "synthetic-test-only-key" },
}));
const mfa = await import("../services/mfa-step-up.service.js");
const corporate = await import("../services/corporate-mfa.service.js");
const account = { id: 3, corporateId: 3, role: "corporate" };
beforeEach(() => {
  factor = null;
  events.length = 0;
  jest.spyOn(Date, "now").mockReturnValue(Date.UTC(2026, 9, 22, 12, 0, 0));
});
afterEach(() => jest.restoreAllMocks());
async function enroll() {
  const context = corporate.corporateMfaIdentity(account);
  const setup = await mfa.beginEnrollment(context);
  const code = mfa.totpCode(setup.secret);
  await mfa.verifyEnrollment({ ...context, code });
  return { context, setup, code };
}
test("company credentials and invited users have distinct MFA namespaces", () => {
  expect(corporate.corporateMfaIdentity(account)).toEqual({
    userId: "corporate:3",
    organizationId: "corporate:3",
  });
  expect(
    corporate.corporateMfaIdentity({ ...account, role: "hr_staff", userId: 3 }),
  ).toEqual({ userId: "corporate-user:3", organizationId: "corporate:3" });
});
test("enrollment stores encrypted secret and confirmed login consumes a TOTP counter", async () => {
  const { context, setup, code } = await enroll();
  expect(factor.secret_ciphertext).not.toContain(setup.secret);
  const result = await mfa.verifyLoginFactor({ ...context, code });
  expect(result.mfaVerified).toBe(true);
  await expect(
    mfa.verifyLoginFactor({ ...context, code }),
  ).rejects.toMatchObject({ code: "MFA_CODE_INVALID" });
  expect(events.some((event) => event[2] === "login_failed")).toBe(true);
});
test("fresh codes after the consumed counter succeed", async () => {
  const { context, setup, code } = await enroll();
  await mfa.verifyLoginFactor({ ...context, code });
  Date.now.mockReturnValue(Date.now() + 30000);
  expect(
    (
      await mfa.verifyLoginFactor({
        ...context,
        code: mfa.totpCode(setup.secret),
      })
    ).mfaVerified,
  ).toBe(true);
});
test("enabled accounts cannot log in without the second factor", async () => {
  await enroll();
  await expect(corporate.corporateMfaLogin(account)).rejects.toMatchObject({
    statusCode: 401,
    code: "MFA_REQUIRED",
  });
});
test("an old password-only token cannot access an enrolled account", async () => {
  await enroll();
  await expect(
    corporate.requireCorporateMfa(account, { id: 3 }),
  ).rejects.toMatchObject({ statusCode: 401 });
});
test("a factor from another identity cannot authorize this account", async () => {
  await enroll();
  await expect(
    corporate.requireCorporateMfa(account, {
      mfaVerified: true,
      mfaFactorId: "wrong",
      mfaAt: new Date(Date.now()).toISOString(),
    }),
  ).rejects.toMatchObject({ statusCode: 401 });
});
test("verified proof for the enrolled factor is accepted", async () => {
  const { code } = await enroll();
  const proof = await corporate.corporateMfaLogin(account, code);
  await expect(
    corporate.requireCorporateMfa(account, proof),
  ).resolves.toBeUndefined();
});
