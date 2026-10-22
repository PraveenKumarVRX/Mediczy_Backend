import { randomBytes, randomUUID, createHash } from "node:crypto";
import { jwtVerify, createLocalJWKSet } from "jose";
import { publicHttpsJson, publicHttpsUrl } from "../utils/public-https-json.js";
const failure = (message, statusCode = 400) =>
  Object.assign(new Error(message), { statusCode });
export const ssoPublicConfig = (config) => ({
  enabled: Boolean(config?.enabled),
  issuer: config?.issuer || "",
  clientId: config?.clientId || "",
  hasClientSecret: Boolean(config?.clientSecret),
  updatedAt: config?.updatedAt || null,
});
export const protectedSettings = (settings) => {
  const { ssoConfig, ...publicSettings } = settings || {};
  return publicSettings;
};
export function corporateSso({
  database,
  encrypt,
  decrypt,
  sign,
  verify,
  fetchJson = publicHttpsJson,
  origin = "https://app.mediqzy.com",
}) {
  const select = (sql, replacements, transaction) =>
    database.query(sql, {
      replacements,
      transaction,
      type: database.QueryTypes.SELECT,
    });
  const callbackUrl = origin + "/api/corporate/security/sso/callback";
  async function discover(issuer) {
    publicHttpsUrl(issuer);
    const base = issuer.replace(/\/$/, "");
    const metadata = await fetchJson(
      base + "/.well-known/openid-configuration",
    );
    if (metadata.issuer !== issuer && metadata.issuer !== base)
      throw failure("Identity-provider issuer does not match discovery");
    for (const field of [
      "authorization_endpoint",
      "token_endpoint",
      "jwks_uri",
    ])
      publicHttpsUrl(metadata[field]);
    if (
      !metadata.response_types_supported?.includes("code") ||
      (metadata.code_challenge_methods_supported &&
        !metadata.code_challenge_methods_supported.includes("S256"))
    )
      throw failure(
        "Identity provider must support authorization code login with S256 PKCE",
      );
    return metadata;
  }
  async function configuration(corporateId) {
    const [row] = await select(
      "SELECT settings FROM corporate_settings WHERE corporate_id= :corporateId",
      { corporateId },
    );
    return row?.settings?.ssoConfig || null;
  }
  async function save(corporateId, input, transaction) {
    if (
      typeof input.enabled !== "boolean" ||
      typeof input.issuer !== "string" ||
      typeof input.clientId !== "string" ||
      !input.clientId.trim() ||
      input.clientId.length > 255 ||
      input.issuer.length > 500 ||
      (input.clientSecret != null &&
        (typeof input.clientSecret !== "string" ||
          input.clientSecret.length > 4096))
    )
      throw failure("Provide an issuer URL and client ID");
    const metadata = await discover(input.issuer.trim().replace(/\/$/, ""));
    const prior = await configuration(corporateId, transaction);
    if (
      prior &&
      (prior.issuer !== metadata.issuer ||
        prior.clientId !== input.clientId.trim()) &&
      !input.clientSecret
    )
      throw failure(
        "Enter a new client secret when changing the issuer or client ID",
      );
    const secret = input.clientSecret
      ? encrypt(input.clientSecret)
      : prior?.clientSecret;
    if (!secret) throw failure("Enter the identity-provider client secret");
    const config = {
      enabled: input.enabled,
      issuer: metadata.issuer,
      clientId: input.clientId.trim(),
      clientSecret: secret,
      updatedAt: new Date().toISOString(),
      version: randomUUID(),
    };
    await database.query(
      `INSERT INTO corporate_settings(corporate_id,settings) VALUES(:corporateId,jsonb_build_object('ssoConfig',:config::jsonb)) ON CONFLICT(corporate_id) DO UPDATE SET settings=jsonb_set(corporate_settings.settings,'{ssoConfig}',:config::jsonb),"updatedAt"=NOW()`,
      {
        replacements: { corporateId, config: JSON.stringify(config) },
        transaction,
      },
    );
    return ssoPublicConfig(config);
  }
  async function start(company, tenantId) {
    const [corp] = await select(
      `SELECT id,unique_id,tenant_id FROM corporates WHERE (unique_id= :company OR LOWER(email)=LOWER(:company)) AND LOWER(status)='active'`,
      { company: String(company || "").trim() },
    );
    if (!corp || (tenantId && Number(corp.tenant_id) !== Number(tenantId)))
      throw failure(
        "Corporate SSO is not available for this organization",
        404,
      );
    const config = await configuration(corp.id);
    if (!config?.enabled) throw failure("Corporate SSO is not configured", 503);
    const metadata = await discover(config.issuer);
    const id = randomUUID(),
      nonce = randomBytes(24).toString("base64url"),
      verifier = randomBytes(32).toString("base64url");
    // Purge only expired authentication handshakes, not identity or audit data.
    await database.query(
      "DELETE FROM corporate_sso_sessions WHERE expires_at<NOW()-INTERVAL '1 day'",
    );
    await database.query(
      `INSERT INTO corporate_sso_sessions(id,corporate_uid,expires_at) VALUES(:id,:uid,NOW()+INTERVAL '10 minutes')`,
      { replacements: { id, uid: corp.unique_id } },
    );
    const state = sign(
      {
        kind: "corporate_sso_state",
        id,
        corporateId: corp.id,
        corporateUid: corp.unique_id,
        version: config.version,
        nonce,
        verifier,
      },
      { expiresIn: "10m" },
    );
    const url = new URL(metadata.authorization_endpoint);
    for (const [key, value] of Object.entries({
      response_type: "code",
      client_id: config.clientId,
      redirect_uri: callbackUrl,
      scope: "openid email profile",
      state: id,
      nonce,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
    }))
      url.searchParams.set(key, value);
    return { url: url.toString(), state };
  }
  async function callback(cookie, query) {
    let state;
    try {
      state = verify(cookie);
    } catch {
      throw failure("SSO request expired. Start again.", 401);
    }
    if (
      state.kind !== "corporate_sso_state" ||
      state.id !== query.state ||
      typeof query.code !== "string" ||
      query.code.length > 4096
    )
      throw failure("SSO request does not match this browser", 401);
    const config = await configuration(state.corporateId);
    if (!config?.enabled || config.version !== state.version)
      throw failure("SSO configuration changed. Start again.", 401);
    return database.transaction(async (transaction) => {
      const [session] = await select(
        `SELECT id FROM corporate_sso_sessions WHERE id= :id AND corporate_uid= :uid AND phase='started' AND expires_at>NOW() FOR UPDATE`,
        { id: state.id, uid: state.corporateUid },
        transaction,
      );
      if (!session)
        throw failure("SSO request has expired or was already used", 401);
      const metadata = await discover(config.issuer);
      const tokenBody = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: config.clientId,
        code: query.code,
        redirect_uri: callbackUrl,
        code_verifier: state.verifier,
      });
      const headers = { "Content-Type": "application/x-www-form-urlencoded" };
      const secret = decrypt(config.clientSecret);
      if (
        (
          metadata.token_endpoint_auth_methods_supported || [
            "client_secret_basic",
          ]
        ).includes("client_secret_basic")
      )
        headers.Authorization =
          "Basic " +
          Buffer.from(
            encodeURIComponent(config.clientId) +
              ":" +
              encodeURIComponent(secret),
          ).toString("base64");
      else if (
        metadata.token_endpoint_auth_methods_supported?.includes(
          "client_secret_post",
        )
      )
        tokenBody.set("client_secret", secret);
      else throw failure("Unsupported identity-provider client authentication");
      const tokens = await fetchJson(metadata.token_endpoint, {
        method: "POST",
        headers,
        body: tokenBody.toString(),
      });
      const jwks = await fetchJson(metadata.jwks_uri);
      let payload;
      try {
        ({ payload } = await jwtVerify(
          tokens.id_token,
          createLocalJWKSet(jwks),
          {
            issuer: config.issuer,
            audience: config.clientId,
            algorithms: ["RS256", "ES256"],
            maxTokenAge: "10m",
            clockTolerance: 30,
          },
        ));
      } catch {
        throw failure("Identity-provider token could not be verified", 401);
      }
      if (
        payload.nonce !== state.nonce ||
        typeof payload.sub !== "string" ||
        !payload.sub ||
        payload.sub.length > 255 ||
        payload.email_verified !== true ||
        typeof payload.email !== "string" ||
        (Array.isArray(payload.aud) &&
          payload.aud.length > 1 &&
          payload.azp !== config.clientId)
      )
        throw failure("Verified corporate identity is required", 401);
      const [user] = await select(
        `SELECT u.id,u.unique_id,u.metadata FROM users u JOIN corporates c ON c.unique_id=u.organization_uid
    WHERE c.id= :corporateId AND c.unique_id= :uid AND LOWER(c.status)='active' AND u.organization_type='corporate' AND u.role IN ('corporate_admin','hr_staff','corporate_cmo','corporate_ohc') AND u.status='active' AND LOWER(u.email)=LOWER(:email) FOR UPDATE OF u`,
        {
          corporateId: state.corporateId,
          uid: state.corporateUid,
          email: payload.email,
        },
        transaction,
      );
      if (!user)
        throw failure(
          "Your existing HR account is not authorized for this corporate",
          403,
        );
      const issuerKey = createHash("sha256")
        .update(config.issuer)
        .digest("hex");
      const previous = user.metadata?.corporateSsoSubjects?.[issuerKey];
      if (previous && previous !== payload.sub)
        throw failure(
          "This identity does not match the linked HR account",
          403,
        );
      await database.query(
        `UPDATE users SET metadata=jsonb_set(COALESCE(metadata,'{}'),'{corporateSsoSubjects}',COALESCE(metadata->'corporateSsoSubjects','{}')||jsonb_build_object(:issuerKey,:subject::text)) WHERE id= :id`,
        {
          replacements: { id: user.id, issuerKey, subject: payload.sub },
          transaction,
        },
      );
      await database.query(
        `UPDATE corporate_sso_sessions SET phase='verified',user_uid= :userUid,expires_at=NOW()+INTERVAL '2 minutes' WHERE id= :id`,
        {
          replacements: { id: state.id, userUid: user.unique_id },
          transaction,
        },
      );
      return sign(
        {
          kind: "corporate_sso_handoff",
          id: state.id,
          corporateId: state.corporateId,
          version: config.version,
          userUid: user.unique_id,
        },
        { expiresIn: "2m" },
      );
    });
  }
  async function complete(cookie, code, loginMfa) {
    let proof;
    try {
      proof = verify(cookie);
    } catch {
      throw failure("SSO sign-in has expired. Start again.", 401);
    }
    if (proof.kind !== "corporate_sso_handoff")
      throw failure("Invalid SSO sign-in", 401);
    const config = await configuration(proof.corporateId);
    if (!config?.enabled || config.version !== proof.version)
      throw failure("SSO configuration changed. Start again.", 401);
    return database.transaction(async (transaction) => {
      const [user] = await select(
        `SELECT u.id,u.email,u."firstName",u."lastName",u.role,u.metadata,c.id AS corporate_id,c."companyName",c.email AS corporate_email
    FROM corporate_sso_sessions s JOIN users u ON u.unique_id=s.user_uid JOIN corporates c ON c.unique_id=s.corporate_uid AND c.unique_id=u.organization_uid
    WHERE s.id= :id AND s.user_uid= :uid AND s.phase='verified' AND s.expires_at>NOW() AND c.id= :corporateId AND LOWER(c.status)='active' AND u.status='active' AND u.role IN ('corporate_admin','hr_staff','corporate_cmo','corporate_ohc') FOR UPDATE OF s`,
        { id: proof.id, uid: proof.userUid, corporateId: proof.corporateId },
        transaction,
      );
      if (!user)
        throw failure(
          "SSO sign-in was already used or account access changed",
          401,
        );
      const mfa = await loginMfa(
        {
          role: user.role,
          id: user.id,
          userId: user.id,
          corporateId: user.corporate_id,
        },
        code,
      );
      await database.query(
        `UPDATE corporate_sso_sessions SET phase='consumed' WHERE id= :id`,
        { replacements: { id: proof.id }, transaction },
      );
      await database.query(
        'UPDATE users SET "lastLoginAt"=NOW() WHERE id= :id',
        { replacements: { id: user.id }, transaction },
      );
      return { user, mfa };
    });
  }
  return { configuration, save, start, callback, complete, callbackUrl };
}
