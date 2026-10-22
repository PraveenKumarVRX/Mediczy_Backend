import { createHash } from "node:crypto";
import { jest } from "@jest/globals";
import jwt from "jsonwebtoken";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import {
  corporateSso,
  protectedSettings,
  ssoPublicConfig,
} from "../services/corporate-sso.service.js";
import { publicAddress, publicHttpsUrl } from "../utils/public-https-json.js";
let privateKey, jwks;
beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  const key = await exportJWK(pair.publicKey);
  jwks = { keys: [{ ...key, kid: "test", alg: "RS256", use: "sig" }] };
});
function setup({
  claims = {},
  userPresent = true,
  previousSubject,
  metadataOverrides = {},
} = {}) {
  const issuer = "https://issuer.example.com";
  let config = {
    enabled: true,
    issuer,
    clientId: "corporate-client",
    clientSecret: "encrypted-secret",
    version: "config-1",
  };
  let nonce;
  let session;
  const query = jest.fn(async (sql, options = {}) => {
    const p = options.replacements || {};
    if (sql.includes("SELECT settings FROM corporate_settings"))
      return [{ settings: { ssoConfig: config } }];
    if (sql.includes("SELECT id,unique_id,tenant_id FROM corporates"))
      return p.company === "CORP-3"
        ? [{ id: 3, unique_id: "CORP-3", tenant_id: 7 }]
        : [];
    if (sql.includes("INSERT INTO corporate_sso_sessions")) {
      session = { id: p.id, uid: p.uid, phase: "started" };
      return [];
    }
    if (sql.includes("phase='started' AND"))
      return session?.phase === "started" && session.id === p.id
        ? [{ id: p.id }]
        : [];
    if (sql.includes("SELECT u.id,u.unique_id,u.metadata"))
      return userPresent && p.email === "hr@example.invalid"
        ? [
            {
              id: 42,
              unique_id: "USER-42",
              metadata: {
                corporateSsoSubjects: previousSubject
                  ? {
                      [createHash("sha256").update(issuer).digest("hex")]:
                        previousSubject,
                    }
                  : {},
              },
            },
          ]
        : [];
    if (sql.includes("SET phase='verified'")) {
      session.phase = "verified";
      session.userUid = p.userUid;
      return [];
    }
    if (sql.includes("FROM corporate_sso_sessions s JOIN users"))
      return session?.phase === "verified" && session.userUid === p.uid
        ? [
            {
              id: 42,
              role: "hr_staff",
              corporate_id: 3,
              email: "hr@example.invalid",
              companyName: "Synthetic",
              metadata: {},
            },
          ]
        : [];
    if (sql.includes("SET phase='consumed'")) {
      session.phase = "consumed";
      return [];
    }
    if (sql.includes("INSERT INTO corporate_settings")) {
      config = JSON.parse(p.config);
      return [];
    }
    return [];
  });
  const fetchJson = jest.fn(async (url, options) => {
    if (url.endsWith("/.well-known/openid-configuration"))
      return {
        issuer,
        authorization_endpoint: issuer + "/authorize",
        token_endpoint: issuer + "/token",
        jwks_uri: issuer + "/keys",
        response_types_supported: ["code"],
        code_challenge_methods_supported: ["S256"],
        ...metadataOverrides,
      };
    if (url.endsWith("/keys")) return jwks;
    const body = new URLSearchParams(options.body);
    expect(body.get("code_verifier")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(options.headers.Authorization).toMatch(/^Basic /);
    return {
      id_token: await new SignJWT({
        email: "hr@example.invalid",
        email_verified: true,
        nonce,
        ...claims,
      })
        .setProtectedHeader({ alg: "RS256", kid: "test" })
        .setSubject("provider-user-42")
        .setIssuer(claims.iss || issuer)
        .setAudience(claims.aud || "corporate-client")
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(privateKey),
    };
  });
  const database = {
    query,
    QueryTypes: { SELECT: "SELECT" },
    transaction: (fn) => fn({}),
  };
  const deps = {
    database,
    fetchJson,
    encrypt: (value) => "enc:" + value,
    decrypt: () => "synthetic-secret",
    sign: (payload, options) =>
      jwt.sign(payload, "synthetic-state-key", options),
    verify: (token) => jwt.verify(token, "synthetic-state-key"),
  };
  const service = corporateSso(deps);
  const start = async () => {
    const result = await service.start("CORP-3");
    nonce = new URL(result.url).searchParams.get("nonce");
    return result;
  };
  return { service, start, query, fetchJson, getSession: () => session };
}
test.each([
  "127.0.0.1",
  "10.1.2.3",
  "169.254.169.254",
  "172.16.1.1",
  "192.168.1.1",
  "100.64.0.1",
  "::1",
  "fc00::1",
  "fe80::1",
  "::ffff:127.0.0.1",
])("SSO discovery rejects private address %s", (value) =>
  expect(publicAddress(value)).toBe(false),
);
test("SSO discovery accepts public IPs only after hostname validation", () => {
  expect(publicAddress("8.8.8.8")).toBe(true);
  expect(() => publicHttpsUrl("https://127.0.0.1/")).toThrow();
  expect(() => publicHttpsUrl("http://issuer.example.com")).toThrow();
  expect(() => publicHttpsUrl("https://issuer.example.com:444/")).toThrow();
});
test("generic settings and public provider status never return a client secret", () => {
  expect(
    protectedSettings({
      general: { name: "Corporate" },
      ssoConfig: { clientSecret: "SECRET" },
    }),
  ).toEqual({ general: { name: "Corporate" } });
  expect(ssoPublicConfig({ clientSecret: "SECRET" })).not.toHaveProperty(
    "clientSecret",
  );
});
test("authorization uses state, nonce and S256 PKCE without exposing the verifier", async () => {
  const { start } = setup();
  const data = await start();
  const url = new URL(data.url);
  expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  expect(url.searchParams.get("nonce")).toBeTruthy();
  expect(url.searchParams.get("code_verifier")).toBeNull();
  expect(url.searchParams.get("state")).toBeTruthy();
});
test("a wrong tenant cannot begin a corporate SSO request", async () => {
  const { service } = setup();
  await expect(service.start("CORP-3", 99)).rejects.toMatchObject({
    statusCode: 404,
  });
});
test("authorization callback is bound to the initiating browser state", async () => {
  const { service, start } = setup();
  const data = await start();
  await expect(
    service.callback(data.state, { state: "different", code: "code" }),
  ).rejects.toMatchObject({ statusCode: 401 });
});
test.each([
  { nonce: "wrong" },
  { email_verified: false },
  { aud: "another-client" },
  { iss: "https://another.example.com" },
])("invalid provider claims are rejected: %j", async (claims) => {
  const { service, start } = setup({ claims });
  const data = await start();
  await expect(
    service.callback(data.state, {
      state: new URL(data.url).searchParams.get("state"),
      code: "code",
    }),
  ).rejects.toMatchObject({ statusCode: 401 });
});
test("a verified external identity cannot create or enter an unauthorized HR account", async () => {
  const { service, start } = setup({ userPresent: false });
  const data = await start();
  await expect(
    service.callback(data.state, {
      state: new URL(data.url).searchParams.get("state"),
      code: "code",
    }),
  ).rejects.toMatchObject({ statusCode: 403 });
});
test("OAuth state and successful login handoff are each consumed once", async () => {
  const { service, start, getSession } = setup();
  const data = await start();
  const query = {
    state: new URL(data.url).searchParams.get("state"),
    code: "code",
  };
  const handoff = await service.callback(data.state, query);
  await expect(service.callback(data.state, query)).rejects.toMatchObject({
    statusCode: 401,
  });
  const loginMfa = jest.fn().mockResolvedValue({ mfaVerified: true });
  const completed = await service.complete(handoff, "123456", loginMfa);
  expect(completed.user.id).toBe(42);
  expect(getSession().phase).toBe("consumed");
  await expect(
    service.complete(handoff, "123456", loginMfa),
  ).rejects.toMatchObject({ statusCode: 401 });
});
test("missing local MFA does not consume an SSO handoff", async () => {
  const { service, start, getSession } = setup();
  const data = await start();
  const handoff = await service.callback(data.state, {
    state: new URL(data.url).searchParams.get("state"),
    code: "code",
  });
  await expect(
    service.complete(handoff, undefined, async () => {
      throw Object.assign(new Error("MFA required"), { statusCode: 401 });
    }),
  ).rejects.toMatchObject({ statusCode: 401 });
  expect(getSession().phase).toBe("verified");
});
test("changing the issuer cannot send a previously stored secret to the new provider", async () => {
  const { service } = setup();
  await expect(
    service.save(
      3,
      {
        enabled: true,
        issuer: "https://issuer.example.com",
        clientId: "changed-client",
      },
      { transaction: true },
    ),
  ).rejects.toThrow("Enter a new client secret");
});

test("a provider subject cannot replace the linked HR identity", async () => {
 const {service,start}=setup({previousSubject:"different-subject"});
 const data=await start();
 await expect(service.callback(data.state,{state:new URL(data.url).searchParams.get("state"),code:"code"})).rejects.toMatchObject({statusCode:403});
});
