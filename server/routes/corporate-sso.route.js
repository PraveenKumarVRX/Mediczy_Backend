import express from "express";
import {
  corporateSso,
  ssoPublicConfig,
} from "../services/corporate-sso.service.js";
export function createCorporateSsoRouter(deps) {
  const {
    database,
    authenticate,
    limiter,
    passwordMatches,
    audit,
    loginMfa,
    accessToken,
  } = deps;
  const router = express.Router(),
    service = corporateSso(deps);
  const cookieOptions = {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/api/corporate/security/sso",
  };
  const handle = (fn) => async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store");
      await fn(req, res);
    } catch (error) {
      res
        .status(error.statusCode || 500)
        .json({
          success: false,
          code: error.code,
          message: error.statusCode
            ? error.message
            : "Corporate SSO could not be completed",
        });
    }
  };
  const owner = (req) => {
    if (!["corporate", "corporate_admin"].includes(req.user.role))
      throw Object.assign(new Error("Only Super HR can configure SSO"), {
        statusCode: 403,
      });
  };
  router.get(
    "/security/sso",
    authenticate,
    handle(async (req, res) => {
      owner(req);
      res.json({
        success: true,
        data: {
          ...ssoPublicConfig(await service.configuration(req.user.corporateId)),
          callbackUrl: service.callbackUrl,
        },
      });
    }),
  );
  router.put(
    "/security/sso",
    authenticate,
    limiter,
    handle(async (req, res) => {
      owner(req);
      if (
        typeof req.body.password !== "string" ||
        !(await passwordMatches(req.user, req.body.password))
      )
        return res
          .status(401)
          .json({ success: false, message: "Confirm your current password" });
      const data = await database.transaction(async (transaction) => {
        const config = await service.save(
          req.user.corporateId,
          req.body,
          transaction,
        );
        await audit.record(
          req,
          {
            resourceId: "corporate-sso",
            title: "Corporate OIDC configuration",
            action: "update",
          },
          transaction,
        );
        return config;
      });
      res.json({ success: true, data });
    }),
  );
  router.get(
    "/security/sso/start",
    limiter,
    handle(async (req, res) => {
      const origin = deps.origin || "https://app.mediqzy.com";
      if (req.hostname !== new URL(origin).hostname)
        return res.redirect(
          origin +
            "/api/corporate/security/sso/start?company=" +
            encodeURIComponent(String(req.query.company || "")),
        );
      const data = await service.start(req.query.company, req.tenant?.id);
      res.cookie("corporate_sso_state", data.state, {
        ...cookieOptions,
        maxAge: 600000,
      });
      res.redirect(data.url);
    }),
  );
  router.get(
    "/security/sso/callback",
    limiter,
    handle(async (req, res) => {
      const proof = await service.callback(
        req.cookies?.corporate_sso_state,
        req.query,
      );
      res.clearCookie("corporate_sso_state", cookieOptions);
      res.cookie("corporate_sso_handoff", proof, {
        ...cookieOptions,
        maxAge: 120000,
      });
      res.redirect(
        (deps.origin || "https://app.mediqzy.com") +
          "/corporate/login?sso=complete",
      );
    }),
  );
  router.post(
    "/security/sso/complete",
    limiter,
    handle(async (req, res) => {
      // SameSite cookies plus an exact Origin check protect this login handoff from cross-site POSTs.
      if (req.headers.origin !== (deps.origin || "https://app.mediqzy.com"))
        return res
          .status(403)
          .json({
            success: false,
            message: "Complete SSO from the corporate sign-in page",
          });
      const { user, mfa } = await service.complete(
        req.cookies?.corporate_sso_handoff,
        req.body.code,
        loginMfa,
      );
      const tokens = await accessToken({
        ...mfa,
        id: user.id,
        userId: user.id,
        corporateId: user.corporate_id,
        email: user.email,
        role: user.role,
        userType: "corporate",
      });
      res.clearCookie("corporate_sso_handoff", cookieOptions);
      res.json({
        success: true,
        token: tokens.token,
        refreshToken: tokens.refreshToken,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          corporateId: user.corporate_id,
          corporateAccess: user.metadata?.corporateAccess || null,
        },
        corporate: {
          id: user.corporate_id,
          email: user.corporate_email,
          companyName: user.companyName,
        },
      });
    }),
  );
  return router;
}
