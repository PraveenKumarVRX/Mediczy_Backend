import express from "express";
export function createCorporateSecurityRouter({
  authenticate,
  limiter,
  mfa,
  identity,
  passwordMatches,
  tokenFor,
}) {
  const router = express.Router();
  const handle = (action) => async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store");
      await action(req, res);
    } catch (error) {
      res
        .status(error.statusCode || error.status || 500)
        .json({
          success: false,
          code: error.code,
          message:
            error.statusCode || error.status
              ? error.message
              : "Account security could not be updated",
        });
    }
  };
  const password = async (req) => {
    if (
      typeof req.body.password !== "string" ||
      !(await passwordMatches(req.user, req.body.password))
    )
      throw Object.assign(new Error("Confirm your current password"), {
        statusCode: 401,
      });
  };
  const code = (req) => {
    if (!/^\d{6}$/.test(req.body.code || ""))
      throw Object.assign(new Error("Enter a 6-digit authenticator code"), {
        statusCode: 400,
      });
    return req.body.code;
  };
  router.get(
    "/security/mfa",
    authenticate,
    handle(async (req, res) => {
      res.json({
        success: true,
        data: await mfa.getMfaStatus(identity(req.user)),
      });
    }),
  );
  router.post(
    "/security/mfa/enroll",
    authenticate,
    limiter,
    handle(async (req, res) => {
      await password(req);
      res
        .status(201)
        .json({
          success: true,
          data: await mfa.beginEnrollment({
            ...identity(req.user),
            issuer: "Mediqzy Corporate",
            account: req.user.email,
          }),
        });
    }),
  );
  router.post(
    "/security/mfa/confirm",
    authenticate,
    limiter,
    handle(async (req, res) => {
      const supplied = code(req);
      await mfa.verifyEnrollment({
        ...identity(req.user),
        code: supplied,
        requestId: req.id,
      });
      const proof = await mfa.verifyLoginFactor({
        ...identity(req.user),
        code: supplied,
        requestId: req.id,
      });
      res.json({
        success: true,
        data: { enabled: true, ...(await tokenFor(req, proof)) },
      });
    }),
  );
  router.post(
    "/security/mfa/disable",
    authenticate,
    limiter,
    handle(async (req, res) => {
      await password(req);
      res.json({
        success: true,
        data: await mfa.disableMfa({
          ...identity(req.user),
          code: code(req),
          requestId: req.id,
        }),
      });
    }),
  );
  return router;
}
