# World-Class User Login Spec (Patient)

Status: Draft
Scope: Patient (user) login and onboarding entry for the wellness app. This spec maps to the current Mediczy implementation and highlights gaps to reach a world-class experience.

## Goals
- Minimize time-to-first-successful-login without sacrificing security.
- Make recovery easy and safe across email/phone/WhatsApp.
- Provide a trusted, privacy-first experience with transparent data use.
- Support seamless continuity across devices and sessions.

## Experience Principles
- Low friction by default, step-up only when risk or sensitivity increases.
- Clear feedback and guidance at each step (no dead ends).
- Privacy by design (least privilege, explicit consent, minimal data collection).
- Resilient delivery (fallback channels for OTP and recovery).

## Target Login Experience
### 1) Smart Entry
- Detect active sessions and deep-link to the intended destination.
- Remember a trusted device (optional) and skip MFA for low-risk actions.
- Always show a safe logout and device management path.

### 2) Authentication Methods
- Password login for legacy users.
- OTP login via email or phone (WhatsApp/SMS fallbacks).
- Social login (Google/Facebook) with account linking.
- Passkeys (WebAuthn) for the best mix of speed and security.

### 3) Risk-Based Step-Up
- Require step-up for sensitive actions (payment, medical records export, profile changes).
- Step-up factors: OTP, passkey, or device trust confirmation.

### 4) Recovery
- Multi-channel recovery with verified device + recovery codes.
- No account enumeration (generic responses for OTP/recovery endpoints).

### 5) Post-Login Continuity
- Land on a personalized "next best action" with health context.
- Optional onboarding flow for first-time users.

## Current Implementation Mapping
### Frontend Entry Points
- /login (patient login with password, OTP, OAuth)
- /oauth-callback (OAuth completion)

### Backend Endpoints
- POST /api/users/login (password login)
- POST /api/users/login/send-otp (OTP login send)
- POST /api/users/login/verify-otp (OTP login verify)
- POST /api/users/register/send-otp (registration OTP)
- POST /api/users/register/verify-otp (registration verify + create)
- POST /api/password-reset/request
- POST /api/password-reset/verify-otp
- POST /api/password-reset/reset
- GET /api/auth/google, /api/auth/facebook (OAuth entry)

## Gaps vs Target
- Passkey/WebAuthn support
- Refresh tokens with rotation and session management
- Device trust list and user-visible session controls
- Risk-based step-up for sensitive actions
- Consistent, non-enumerating responses for OTP/recovery

## Success Metrics
- Login conversion rate and OTP delivery success rate
- Median time-to-login by method (password, OTP, OAuth)
- Recovery success rate (no support intervention)
- Session security: ratio of step-up challenges to sensitive actions

## Rollout Plan (High Level)
1) Harden OTP/recovery responses and observability
2) Add device trust and session visibility
3) Introduce passkeys (opt-in)
4) Add risk-based step-up triggers
5) Refine onboarding and next-best-action logic
