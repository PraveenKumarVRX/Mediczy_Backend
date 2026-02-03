# Login and OTP Hardening Plan

Status: Draft
Scope: Patient login, OTP delivery, and recovery flows.

## Immediate Changes (Low Risk)
- Remove OTP codes from API responses outside development.
- Normalize OTP send/verify responses to avoid account enumeration.
- Keep audit logging for login attempts and OTP verification failures.

## Recommended Changes (Next Sprint)
### OTP and Recovery
- Add per-identifier rate limits (email/phone) in addition to IP rate limits.
- Add replay protection for OTP attempts and lockout after repeated failures.
- Standardize generic responses for password reset and registration OTP endpoints.

### Session Handling
- Introduce refresh tokens with rotation and revocation on logout/password change.
- Use httpOnly, Secure cookies for refresh tokens; short-lived access tokens.
- Add CSRF protections if cookies are used.
- Add user-visible session list with "logout other sessions".

### Risk Controls
- Add device trust and step-up MFA for sensitive actions.
- Add anomaly detection signals (new device, location change, impossible travel).

## Observability and Compliance
- Store auth events with reason codes and identifiers (hashed where needed).
- Add dashboards for OTP delivery success and failure reasons.
- Add security alerts on high failure rates or brute force patterns.

## Notes
- Changes to OTP responses should be coordinated with frontend messaging.
- Generic responses should still return 200 where appropriate to avoid enumeration.
