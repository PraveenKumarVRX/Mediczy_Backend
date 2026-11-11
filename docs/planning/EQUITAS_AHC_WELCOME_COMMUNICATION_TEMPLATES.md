# Equitas AHC 2026–27 welcome communications

Use the employee's actual `validFrom` and `validTo` dates for every send. The period is calculated as 45 days from onboarding, capped at 31 March 2027. Do not state a generic deadline in the message because the employee needs their exact personal start and expiry dates.

**Branding:** My SmartHealth is the only employee- and corporate-facing brand for this programme. Mediczy is the underlying software platform name and must not appear in corporate communications.

## Email

**Subject:** `Your Equitas Bank Annual Health Checkup is ready — use it by {{valid_to}}`

**Preheader:** `Your personal AHC validity is {{valid_from}} to {{valid_to}}. Please book before the end date.`

**Body:**

> Dear {{employee_name}},
>
> Your {{program_name}} is now available through My SmartHealth.
>
> **Your personal AHC validity period is {{valid_from}} to {{valid_to}}.** Please book and complete your health checkup on or before the end date. This is a one-time benefit; unused eligibility cannot be used after expiry.
>
> [Book your AHC](https://app.mediqzy.com/health-checkups)
>
> Download the My SmartHealth app: [Google Play](https://play.google.com/store/apps/details?id=com.mysmarthealth) · [App Store](https://apps.apple.com/in/app/smart-health/id6757312276)
>
> For eligibility questions, please contact your HR team. Do not reply with personal health information.
>
> My SmartHealth

## Attaching the employer's PDF

The invitation email carries whatever file the Team user has attached to the
`corporate_ahc` email template — nothing is generated at send time, and the
employee receives the uploaded file byte for byte.

To set it up: **Team → Email → Templates →** open the `Corporate AHC` template
→ **Attachments → Attach a file**. The file is stored against the template and
goes out with every send of it, including the automated welcome email and the
studio's `[TEST]` send.

- PDF, PNG, JPEG, DOCX or XLSX, up to 10 MB, at most 5 files per template.
- Every upload is virus-scanned and its signature checked against its declared
  type, so a renamed binary cannot reach employees.
- Re-uploading the same filename replaces it; the next send carries the new file.
- The attachment is an employer document. It must not contain clinical
  information or results.

If no file is attached — or if two `corporate_ahc` templates both carry files,
which is ambiguous — the email is still sent, because its body already carries
the validity period and the booking and app-store links. That send is recorded
as `sent_no_file` in `corporate_ahc_entitlement_notifications.email_status`
rather than passing silently as a full send.

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
