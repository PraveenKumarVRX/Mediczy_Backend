# Equitas AHC 2026–27 welcome communications

Use the employee's actual `validFrom` and `validTo` dates for every send. The period is calculated as 45 days from onboarding, capped at 31 March 2027. Do not state a generic deadline in the message because the employee needs their exact personal start and expiry dates.

**Branding:** My SmartHealth is the only employee- and corporate-facing brand for this programme. Mediczy is the underlying software platform name and must not appear in corporate communications.

## Email

**Subject:** `Your Equitas Bank Annual Health Checkup is ready — use it by {{valid_to}}`

**Preheader:** `Your personal AHC validity is {{valid_from}} to {{valid_to}}. Please book before the end date.`

**Body:**

> Dear {{employee_name}},
>
> Your {{program_name}} is now available through My SmartHealth, sponsored by {{corporate_name}}.
>
> **Your personal AHC validity period is {{valid_from}} to {{valid_to}}.** Please complete your checkup on or before the end date. This is a one-time benefit; unused eligibility cannot be used after expiry.
>
> **How to use your checkup**
>
> 1. **Open My SmartHealth** — Sign in to the app, or go to app.mediqzy.com, and open Health Checkups.
> 2. **Choose your centre, date and time** — Pick a lab or health centre from your employer's network, then a date and a slot that suit you.
> 3. **Submit your booking** — Your booking is raised for confirmation. You will see it as Booked until our care team confirms it.
> 4. **Get confirmed and read the instructions** — Once confirmed you will be notified, and your preparation instructions (including any fasting requirement) appear against the booking.
> 5. **Visit the centre** — Please arrive 10 minutes early and carry a valid photo ID. No payment is due — your employer has sponsored this checkup.
> 6. **Download your reports** — When your reports are ready they appear against the same booking in My SmartHealth, to view, download or share.
>
> 📎 Please also refer to the AHC appointment booking manual attached with this email for step-by-step screens.
>
> [Book your AHC](https://app.mediqzy.com/health-checkups)
>
> Download the My SmartHealth app: [Google Play](https://play.google.com/store/apps/details?id=com.mysmarthealth) · [App Store](https://apps.apple.com/in/app/smart-health/id6757312276)
>
> **Need help?**
> Email care@mysmarthealth.in · Phone / WhatsApp +91 80989 98998 ([message us on WhatsApp](https://wa.me/918098998998))
>
> For eligibility questions, please contact your HR team. Do not reply with personal health information.
>
> Healthy Regards,
> **Team SmartHealth**

The six steps are not prose — they are `AHC_PROCESS_STEPS` in
`server/services/corporate-ahc-message-templates.service.js`, and they describe
the lifecycle `routes/health-checkup.route.js` actually implements
(`booked` → care team confirms → `confirmed`, instructions visible → `completed`
→ `reports_available`). Change the steps only when that lifecycle changes: an
employee acting on a step the product does not implement is worse than no
instructions.

**The attachment line is conditional.** `ahcInvitationMessage()` renders it only
when the caller passes `attachmentName`, which `notifyAhcEntitlement` resolves
from the template *before* composing the body. With no file attached, the line
is absent — an email telling an employee to read an attachment that is not
there is worse than one that never mentions it.

**Care desk contacts** come from `AHC_SUPPORT` in the same service:
`care@mysmarthealth.in` (the monitored shared mailbox) and `+91 80989 98998`,
which is the support line and the WhatsApp Business number — there is no
separate voice line. Never substitute `support@mediqzy.com` here.

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
