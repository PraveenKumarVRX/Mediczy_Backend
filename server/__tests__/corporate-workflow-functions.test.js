import express from "express";
import request from "supertest";
import { jest } from "@jest/globals";
import {
  normalizeCorporateAccess,
  corporateScopeSql,
  enforceCorporateAccess,
} from "../services/corporate-access-policy.js";
import { createCorporateAccessRouter } from "../routes/corporate-access.route.js";
import { createCorporateSecurityRouter } from "../routes/corporate-security.route.js";
import { createCorporateProgramsRouter } from "../routes/corporate-programs.route.js";
import { createCorporateCertificateUploadRouter } from "../routes/corporate-certificate-upload.route.js";
import {
  reportYear,
  validatedHours,
  csvDocument,
} from "../services/corporate-programs.service.js";
import {
  futureSchedule,
  prepareCorporateSchedule,
} from "../services/corporate-scheduling.service.js";
const user = {
  id: 3,
  corporateId: 3,
  userId: 42,
  role: "corporate_admin",
  email: "synthetic@example.invalid",
};
const auth = (req, res, next) => {
  req.user = { ...user };
  next();
};
const database = () => ({
  query: jest.fn(),
  QueryTypes: { SELECT: "SELECT" },
  transaction: async (fn) => fn({ transaction: true }),
});
const audit = () => ({ record: jest.fn().mockResolvedValue() });
function app(router) {
  const result = express();
  result.use(express.json());
  result.use(router);
  return result;
}

describe("corporate access capabilities", () => {
  test("rejects unknown roles and malformed scopes", () => {
    expect(() => normalizeCorporateAccess({ level: "admin" })).toThrow();
    expect(() =>
      normalizeCorporateAccess({ level: "viewer", departments: "IT" }),
    ).toThrow();
  });
  test("uses intersections of department, unit and branch with bound parameters", () => {
    const result = corporateScopeSql({
      level: "coordinator",
      departments: ["IT"],
      businessUnits: ["Tech"],
      branches: ["Chennai"],
    });
    expect(result.sql).toContain(" AND ");
    expect(result.replacements).toEqual({
      accessDepartments: ["IT"],
      accessBusinessUnits: ["Tech"],
      accessBranches: ["Chennai"],
    });
  });
  test.each([
    "/api/corporate/programs/analytics",
    "/api/corporate/employees",
    "/api/v1/occupational-health/fitness-certificates",
    "/api/corporate/access/team",
  ])("restricted users cannot bypass scope at %s", async (originalUrl) => {
    await expect(
      enforceCorporateAccess(
        {
          originalUrl,
          method: "GET",
          corporateAccess: { level: "coordinator" },
        },
        database(),
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
  test("read-only coordinator cannot schedule", async () => {
    const db = database();
    await expect(
      enforceCorporateAccess(
        {
          originalUrl: "/api/corporate/appointments",
          method: "POST",
          corporateAccess: { level: "viewer" },
        },
        db,
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(db.query).not.toHaveBeenCalled();
  });
  test("coordinator scheduling is bound to employee and corporate scope", async () => {
    const db = database();
    db.query.mockResolvedValue([]);
    await expect(
      enforceCorporateAccess(
        {
          originalUrl: "/api/corporate/appointments",
          method: "POST",
          body: { employeeId: "FOREIGN" },
          user,
          corporateAccess: { level: "coordinator", departments: ["IT"] },
        },
        db,
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(db.query.mock.calls[0][1].replacements).toEqual({
      corporateId: 3,
      employeeId: "FOREIGN",
      accessDepartments: ["IT"],
    });
  });
  test("staff cannot change another employee scope", async () => {
    const db = database();
    const router = createCorporateAccessRouter({
      database: db,
      authenticate: (req, res, next) => {
        req.user = { ...user, role: "hr_staff" };
        next();
      },
      audit: audit(),
    });
    expect(
      (
        await request(app(router))
          .put("/access/team/42")
          .send({ level: "staff" })
      ).status,
    ).toBe(403);
    expect(db.query).not.toHaveBeenCalled();
  });
  test("foreign HR staff updates return 404 and never produce audit evidence", async () => {
    const db = database(),
      log = audit();
    db.query.mockResolvedValue([]);
    const router = createCorporateAccessRouter({
      database: db,
      authenticate: auth,
      audit: log,
    });
    expect(
      (
        await request(app(router))
          .put("/access/team/99")
          .send({ level: "viewer" })
      ).status,
    ).toBe(404);
    expect(log.record).not.toHaveBeenCalled();
    expect(db.query.mock.calls[0][0]).toContain(
      "c.unique_id=u.organization_uid",
    );
  });
});

describe("actual MFA settings", () => {
  const setup = (overrides = {}) => {
    const mfa = {
      getMfaStatus: jest.fn().mockResolvedValue({ enabled: false }),
      beginEnrollment: jest.fn().mockResolvedValue({ secret: "SYNTHETIC" }),
      verifyEnrollment: jest.fn().mockResolvedValue({ enabled: true }),
      verifyLoginFactor: jest
        .fn()
        .mockResolvedValue({ mfaVerified: true, mfaFactorId: "factor" }),
      disableMfa: jest.fn().mockResolvedValue({ enabled: false }),
    };
    const deps = {
      authenticate: auth,
      limiter: (req, res, next) => next(),
      mfa,
      identity: (account) => ({
        userId: `corporate-user:${account.userId}`,
        organizationId: `corporate:${account.corporateId}`,
      }),
      passwordMatches: jest.fn().mockResolvedValue(true),
      tokenFor: jest
        .fn()
        .mockResolvedValue({
          token: "verified-token",
          refreshToken: "verified-refresh",
        }),
      ...overrides,
    };
    return { deps, mfa, api: app(createCorporateSecurityRouter(deps)) };
  };
  test("wrong current password cannot start enrollment", async () => {
    const { api, mfa } = setup({ passwordMatches: async () => false });
    expect(
      (
        await request(api)
          .post("/security/mfa/enroll")
          .send({ password: "wrong" })
      ).status,
    ).toBe(401);
    expect(mfa.beginEnrollment).not.toHaveBeenCalled();
  });
  test("enrollment is scoped to the actual account namespace", async () => {
    const { api, mfa } = setup();
    const result = await request(api)
      .post("/security/mfa/enroll")
      .send({ password: "synthetic" });
    expect(result.status).toBe(201);
    expect(mfa.beginEnrollment).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "corporate-user:42",
        organizationId: "corporate:3",
      }),
    );
  });
  test("confirming MFA issues a verified token and refresh pair", async () => {
    const { api, deps } = setup();
    const result = await request(api)
      .post("/security/mfa/confirm")
      .send({ code: "123456" });
    expect(result.status).toBe(200);
    expect(result.body.data).toMatchObject({
      token: "verified-token",
      refreshToken: "verified-refresh",
    });
    expect(deps.tokenFor).toHaveBeenCalledWith(expect.anything(), {
      mfaVerified: true,
      mfaFactorId: "factor",
    });
  });
  test("bad code never reaches the verifier", async () => {
    const { api, mfa } = setup();
    expect(
      (await request(api).post("/security/mfa/confirm").send({ code: "abc" }))
        .status,
    ).toBe(400);
    expect(mfa.verifyEnrollment).not.toHaveBeenCalled();
  });
});

describe("program settings and employee feedback", () => {
  test.each(["invalid", 2019, 3000, 2026.5])(
    "invalid reporting year %s",
    (value) => expect(() => reportYear(value)).toThrow(),
  );
  test("CSV exports neutralize spreadsheet formulas", () =>
    expect(
      csvDocument([{ provider: '=HYPERLINK("bad")' }], ["provider"]),
    ).toContain("'=HYPERLINK"));
  test("availability rejects invalid dates and overlapping windows", () => {
    expect(() =>
      validatedHours([{ date: "2026-02-30", start: "09:00", end: "10:00" }]),
    ).toThrow();
    expect(() =>
      validatedHours([
        { date: "2026-12-01", start: "09:00", end: "11:00" },
        { date: "2026-12-01", start: "10:00", end: "12:00" },
      ]),
    ).toThrow();
  });
  test("HR staff cannot set budgets", async () => {
    const db = database();
    const router = createCorporateProgramsRouter({
      database: db,
      authenticate: (req, res, next) => {
        req.user = { ...user, role: "hr_staff" };
        next();
      },
      authenticateEmployee: auth,
      audit: audit(),
    });
    expect(
      (
        await request(app(router))
          .put("/programs/budget")
          .send({ year: 2026, amount: 100 })
      ).status,
    ).toBe(403);
    expect(db.query).not.toHaveBeenCalled();
  });
  test("feedback rejects visits belonging to another user", async () => {
    const db = database();
    db.query.mockResolvedValue([]);
    const router = createCorporateProgramsRouter({
      database: db,
      authenticate: auth,
      authenticateEmployee: auth,
      audit: audit(),
    });
    const result = await request(app(router))
      .post("/programs/employee/feedback")
      .send({ key: "consultation:8", rating: 5 });
    expect(result.status).toBe(404);
    expect(db.query.mock.calls[0][1].replacements).toEqual({
      id: "8",
      userId: 3,
    });
  });
  test("feedback only permits ratings 1 through 5", async () => {
    const db = database();
    const router = createCorporateProgramsRouter({
      database: db,
      authenticate: auth,
      authenticateEmployee: auth,
      audit: audit(),
    });
    expect(
      (
        await request(app(router))
          .post("/programs/employee/feedback")
          .send({ key: "consultation:8", rating: 6 })
      ).status,
    ).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe("HR scheduling uses authoritative identities", () => {
  test("rejects past slots and invalid clock times", () => {
    expect(() => futureSchedule("2020-01-01", "10:00")).toThrow();
    expect(() => futureSchedule("2099-01-01", "25:00")).toThrow();
  });
  test("future time is evaluated in India time", () =>
    expect(futureSchedule("2099-01-01", "10:30:00")).toEqual({
      date: "2099-01-01",
      time: "10:30",
    }));
  test("does not accept a foreign or inactive employee", async () => {
    const db = database();
    db.query.mockResolvedValue([]);
    await expect(
      prepareCorporateSchedule(db, 3, {
        employeeId: "FOREIGN",
        date: "2099-01-01",
        time: "10:00",
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
  test("does not trust employee names and departments supplied in the request", async () => {
    const db = database();
    db.query.mockResolvedValue([
      { employeeId: "EMP-1", name: "Database Name", department: "IT" },
    ]);
    const value = await prepareCorporateSchedule(db, 3, {
      employeeId: "EMP-1",
      employeeName: "Forged Name",
      department: "Other",
      date: "2099-01-01",
      time: "10:00",
    });
    expect(value).toMatchObject({
      employeeName: "Database Name",
      department: "IT",
    });
  });
  test("rejects a doctor time outside the configured corporate windows", async () => {
    const db = database();
    db.query
      .mockResolvedValueOnce([
        { employeeId: "EMP-1", name: "Synthetic", department: "IT" },
      ])
      .mockResolvedValueOnce([{ unique_id: "DOC-1", name: "Synthetic Doctor" }])
      .mockResolvedValueOnce([
        {
          settings: {
            programs: {
              availability: {
                "DOC-1": [{ date: "2099-01-01", start: "11:00", end: "12:00" }],
              },
            },
          },
        },
      ]);
    await expect(
      prepareCorporateSchedule(db, 3, {
        employeeId: "EMP-1",
        doctorId: 9,
        date: "2099-01-01",
        time: "10:00",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe("encrypted certificate uploads", () => {
  const setup = (db = database(), log = audit()) => {
    const uploadEncrypted = jest
        .fn()
        .mockResolvedValue({
          key: "encrypted-object",
          bucket: "private",
          encryption: { iv: "iv", authTag: "tag" },
          compressionMethod: "none",
        }),
      removeEncrypted = jest.fn().mockResolvedValue();
    return {
      db,
      log,
      uploadEncrypted,
      removeEncrypted,
      api: app(
        createCorporateCertificateUploadRouter({
          database: db,
          authenticate: auth,
          audit: log,
          uploadEncrypted,
          removeEncrypted,
        }),
      ),
    };
  };
  const fields = (call) =>
    call
      .field("employeeId", "EMP-1")
      .field("issuedBy", "External Clinician")
      .field("examinationDate", "2026-01-01")
      .field("fitnessStatus", "fit");
  test("non-PDF content is rejected before storage", async () => {
    const { api, uploadEncrypted } = setup();
    expect(
      (
        await fields(request(api).post("/fitness-certificates/upload")).attach(
          "file",
          Buffer.from("not-pdf"),
          { filename: "x.pdf", contentType: "application/pdf" },
        )
      ).status,
    ).toBe(400);
    expect(uploadEncrypted).not.toHaveBeenCalled();
  });
  test("a different corporate employee cannot receive an uploaded document", async () => {
    const { api, db, uploadEncrypted } = setup();
    db.query.mockResolvedValue([]);
    expect(
      (
        await fields(request(api).post("/fitness-certificates/upload")).attach(
          "file",
          Buffer.from("%PDF-1.7\n%%EOF"),
          { filename: "x.pdf", contentType: "application/pdf" },
        )
      ).status,
    ).toBe(404);
    expect(uploadEncrypted).not.toHaveBeenCalled();
  });
  test("audit failure rolls back the certificate and cleans up its encrypted object", async () => {
    const { api, db, log, removeEncrypted } = setup();
    db.query
      .mockResolvedValueOnce([
        {
          userId: 8,
          employeeId: "EMP-1",
          corporate_uid: "CORP-3",
          companyName: "Synthetic",
          name: "Synthetic",
        },
      ])
      .mockResolvedValueOnce([{ id: "9007199254740993" }]);
    log.record.mockRejectedValue(new Error("audit failed"));
    const result = await fields(
      request(api).post("/fitness-certificates/upload"),
    ).attach("file", Buffer.from("%PDF-1.7\n%%EOF"), {
      filename: "x.pdf",
      contentType: "application/pdf",
    });
    expect(result.status).toBe(500);
    expect(removeEncrypted).toHaveBeenCalledTimes(1);
  });
  test("successful upload does not return storage keys or encryption metadata", async () => {
    const { api, db } = setup();
    db.query
      .mockResolvedValueOnce([
        {
          userId: 8,
          employeeId: "EMP-1",
          corporate_uid: "CORP-3",
          companyName: "Synthetic",
          name: "Synthetic",
        },
      ])
      .mockResolvedValueOnce([{ id: "9" }]);
    const result = await fields(
      request(api).post("/fitness-certificates/upload"),
    ).attach("file", Buffer.from("%PDF-1.7\n%%EOF"), {
      filename: "x.pdf",
      contentType: "application/pdf",
    });
    expect(result.status).toBe(201);
    expect(result.body.data).toEqual({ id: "9" });
    expect(db.query.mock.calls[1][1].replacements.metadata).toContain(
      "hr_upload",
    );
  });
});
