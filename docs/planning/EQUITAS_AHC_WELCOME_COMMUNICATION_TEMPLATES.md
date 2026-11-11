# Equitas AHC 2026–27 welcome communications

Use the employee's actual `validTo` date for every send. It is calculated as 45 days from onboarding, capped at 31 March 2027. Do not state a generic 45-day deadline in the message because the employee needs their exact personal expiry date.

**Branding:** My SmartHealth is the only employee- and corporate-facing brand for this programme. Mediczy is the underlying software platform name and must not appear in corporate communications.

## Email

**Subject:** `Your Equitas Bank Annual Health Checkup is ready — use it by {{valid_to}}`

**Preheader:** `Your personal AHC eligibility is active. Please book before {{valid_to}}.`

**Body:**

> Dear {{employee_name}},
>
> Your {{program_name}} is now available through My SmartHealth.
>
> **Your personal AHC validity ends on {{valid_to}}.** Please book and complete your health checkup on or before this date. This is a one-time benefit; unused eligibility cannot be used after expiry.
>
> [Book your AHC](https://app.mediqzy.com/health-checkups)
>
> For eligibility questions, please contact your HR team. Do not reply with personal health information.
>
> My SmartHealth

## Gupshup WhatsApp template submission

Create this template in the Gupshup WhatsApp app, submit it for approval, then store the returned **Gupshup template ID** (not a Twilio `HX…` ID) in `GUPSHUP_TEMPLATE_AHC_WELCOME`.

| Field | Value |
| --- | --- |
| Name | `annual_health_checkup_welcome_v1` |
| Suggested category | `UTILITY` (allow Meta to recategorise if requested) |
| Language | English (`en`) |
| Label | AHC eligibility update |
| Body | `Hello {{1}}, your {{2}} annual health checkup is now available through My SmartHealth. Your personal validity ends on {{3}}. Please complete it before this date; unused eligibility cannot be used after expiry.` |
| Footer | `My SmartHealth` |
| URL button | `Book AHC` → `https://app.mediqzy.com/health-checkups` |
| Variable samples | `Aarav Sharma`, `Equitas Bank`, `15 December 2026` |

Variable order is fixed: `{{1}}` employee name, `{{2}}` corporate name, `{{3}}` individual expiry date. The template contains no diagnosis, test result, or other health information.

## Activation checklist

1. Ensure the employee has WhatsApp consent and a valid mobile number.
2. Submit the above template in Gupshup and wait for approval.
3. Save the approved ID as `GUPSHUP_TEMPLATE_AHC_WELCOME` in production secrets; do not save the text/name in that variable.
4. Set `WHATSAPP_PROVIDER=gupshup` only when Gupshup credentials, source number, webhook protection, and the approved template ID are all present.
5. Reload the API, assign one controlled test employee, and confirm the outbound status webhook reaches the audit record before importing the 850-person HR roster.
