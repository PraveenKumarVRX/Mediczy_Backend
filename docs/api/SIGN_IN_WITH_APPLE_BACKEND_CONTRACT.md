# Sign in with Apple — backend contract

**Status: BUILT.** `POST /api/users/login/apple` exists and is tested. It needs a `pm2 reload`
to go live, and one thing only the account owner can do (§6).

**Audience:** the iOS app team, and whoever maintains auth on the server.

Apple requires this endpoint because the app offers Google sign-in (App Store Review guideline
4.8, "Login Services"). Without it the build is rejected.

---

## 1. Endpoint

```
POST /api/users/login/apple        public — no Authorization header
Content-Type: application/json
```

It is registered in the ring-fencing public list beside `/api/users/login`. That matters: the
ring-fencing middleware gates **before** routing, so an unlisted path answers `403`, never `404`.

### Request

| Field | Type | Required | Notes |
|---|---|---|---|
| `identityToken` | string | **yes** | The JWT from `appleAuth.performRequest`. The only field that is trusted. |
| `nonce` | string | strongly recommended | The **raw** nonce, not the SHA-256 you sent Apple. Omit it and replay protection is off. |
| `authorizationCode` | string | no | Stored for the token exchange that account deletion needs (§5). |
| `fullName` | object | no | `{ givenName, familyName }`. Apple returns it on the **first** authorisation only — send it when present. |
| `email` | string | no | Convenience only; the email inside the token is what counts. |
| `user` | string | no | Apple's user id as the app sees it. Ignored for matching; the token's `sub` is used. |

Anything outside `identityToken` is treated as a hint. Nothing outside the token decides which
account is signed into.

### Response — 200

**Byte-identical in shape to `POST /api/users/login`**, so the app can reuse `persistSession` /
`extractAuthPayload` with no branching:

```json
{
  "success": true,
  "message": "Login successful",
  "token": "<jwt>",
  "refreshToken": "<token or null>",
  "requirePasswordChange": false,
  "apple": { "linkedExistingAccount": false, "isPrivateRelay": true },
  "user": { "id": 123, "firstName": "...", "lastName": "...", "email": "...", "role": "user", "...": "same fields as /users/login" }
}
```

`httpOnly` cookies are set as well, exactly as the password login does. The extra `apple` block
is additive — ignore it if you do not need it. `isPrivateRelay` is worth honouring: do not
present a relay address to the user as "your email".

### Errors

| Status | `code` | When |
|---|---|---|
| 400 | `invalid_request` | `identityToken` missing or malformed body |
| 400 | `identity_token_missing` | empty/non-string token |
| 400 | `apple_token_invalid` | signature, issuer, audience or expiry failed |
| 400 | `apple_nonce_mismatch` | token nonce ≠ SHA-256(raw nonce) — replay or wrong session |
| 409 | `email_already_registered` | the email belongs to an account we may not auto-link |
| 500 | — | unexpected failure |

Error bodies never contain the token or Apple's internal reason. Those go to the server log only.

---

## 2. Verification performed

1. **Signature** — RS256 against Apple's JWKS (`https://appleid.apple.com/auth/keys`), cached
   in-process and refetched on key rotation. Apple rate-limits that endpoint; do not fetch per
   request.
2. **`iss`** = `https://appleid.apple.com`
3. **`aud`** = `com.mysmarthealthapplications` (override/extend with `APPLE_BUNDLE_IDS`,
   comma-separated).
4. **`exp`** — enforced by `jose`.
5. **`nonce`** — must equal the SHA-256 **hex** digest of the raw nonce. This is what stops a
   validly-signed token from another session being replayed here.

A token minted for a different bundle id is rejected even though its signature is perfectly
valid — that is the point of the audience check.

---

## 3. Account matching

In order:

1. **Apple `sub`** (stored at `users.metadata.appleId`) — the only durable identifier. It
   survives the user changing their Apple email.
2. **A verified, non-relay email** that already has an account → linked to this Apple id, and
   `apple.linkedExistingAccount: true` comes back so the app can say "we've connected this to
   your existing account".
3. Otherwise a **new account** (`role: 'user'`, `status: 'active'`, `metadata.signupSource:
   'apple'`).

Never matched on: an unverified email, an email sent outside the token, or a **private-relay**
address. A relay address is unique per app, so it cannot identify an account created anywhere
else — matching on it would hand one user's account to another.

`unique_id` is never supplied on insert: the database trigger mints and registers it
(CLAUDE.md entity-UID rule 1).

---

## 4. iOS app notes

- Send the **raw** nonce in `nonce`, and the SHA-256 of it to Apple. Sending the hash in both
  places makes every request fail with `apple_nonce_mismatch`.
- `fullName` arrives **only on the first authorisation**. If it is dropped, the account keeps
  the placeholder name "Apple User" until the user edits their profile; Apple will not resend it.
- Until this is deployed the endpoint returns `404`. The app's "Sign in with Apple isn't
  available yet" message should key off `404` specifically, not any error.

---

## 5. Account deletion — revoking the Apple token

Guideline 5.1.1(v): deleting an account must revoke the Apple sign-in.
`revokeAppleToken()` in `services/apple-signin.service.js` implements it
(`POST https://appleid.apple.com/auth/revoke`) and is ready to be wired into the deletion flow
once §6 is done. It returns `{revoked:false, reason}` instead of throwing, so account deletion is
never blocked by Apple being unreachable.

It needs the `authorizationCode` exchanged for a refresh token, which needs the key below.

---

## 6. What the account owner must do

Create a **Sign in with Apple key** in the Apple developer portal — a key with the "Sign in with
Apple" capability enabled. **This is not the APNs key**; the APNs key will not work here.

Then set three values in SSM (`/mediczy/prod`), which the service reads:

| Variable | Value |
|---|---|
| `APPLE_TEAM_ID` | `746K268KU3` |
| `APPLE_KEY_ID` | the new key's Key ID |
| `APPLE_PRIVATE_KEY` | the `.p8` contents (literal `\n` for newlines is handled) |

Sign-in itself works **without** these — only revocation on account deletion needs them. So the
app can ship and be reviewed first; the key is required before the deletion flow is complete.

Also: the App ID needs the **Sign in with Apple** capability enabled. EAS syncs this during the
signed build.

---

## 7. CallKit (later)

Not built, and deliberately so: Apple requires every VoIP push to report a call, so a half-wired
CallKit is worse than none. When it is wanted, the backend needs:

1. A VoIP APNs topic — `com.mysmarthealthapplications.voip`. The existing APNs key (`D5A55CQ35L`)
   is valid for it.
2. An endpoint for the app to register its **VoIP token**, which is distinct from the regular
   APNs device token and must be stored separately.
3. Sending the incoming-call push to that token, after which the app reports the call to CallKit.

Until then, iOS uses time-sensitive notifications, which break through Focus.

---

## 8. Files

| Path | Role |
|---|---|
| `server/services/apple-signin.service.js` | token verification, nonce hashing, relay detection, revocation |
| `server/controller/apple-auth.controller.js` | matching, account creation, session issuance |
| `server/routes/user.route.js` | `POST /login/apple` |
| `server/middleware/ringFencing.js` | the path's public registration |
| `server/__tests__/apple-signin.test.js` | 15 tests, including wrong-audience, wrong-issuer, expired and replayed-nonce |
