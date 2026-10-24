# CRM workbook retest fixes — 25 October 2026

Source: `Updated_24Oct_Mediqzy_CRM_Test_Report.xlsx`, sheet `CRM Test Report`.

| Report item | Change |
| --- | --- |
| A1 / A2 | Growth dashboard, source/score/campaign aggregates, recovery reads and scans use linked leads visible in the current organization. Recovery cards use canonical lead names and link to their details. GET recovery no longer creates cases. Lead/case actions reject hidden or foreign records. |
| B7 | Leads list now has a visible Convert to deal link. Choosing Converted in the lead form opens the linked deal form; conversion is saved when the deal is created. The API rejects a new conversion label without a linked deal. |
| B14 | Lead/contact selections carry phone numbers into the deal. Backend creation also inherits missing details from the scoped lead and fills a blank matching contact phone. An idempotent migration repairs historical blank phones only when explicit links and matching names/emails identify one authoritative phone. |
| B18 | Open-pipeline forecasts exclude won/lost deals and use saved probabilities. Numeric strings are added numerically, abbreviated amounts preserve decimal thousands, monthly values use the same deals, and all open deals contribute. Rules provide a readable next action. |
| B22 | WhatsApp template languages use readable language names; provider codes remain in submitted requests. |
| B23 | Past calendar dates have no add button; datetime fields have a current-time minimum. Existing server future-date validation remains enforced. |
| B25 | Existing contact-centre regression verifies configured calling remains disabled with no available agent. No real calls placed. |
| B35 | Audit endpoint resolves actor names within the tenant. Successful audit loads use an explicit success notice rather than error styling. |
| B37 / B40 remarks | Lead detail status/source labels are readable. Completed system-note activities retain readable titles and show actual timestamps. |

## Verification

- Read-only production comparison reproduced A1 exactly: visible Leads **3**, old Growth count **4**, corrected service count **3**. Every corrected recovery entry references a visible lead.
- 20 real HTTP/PostgreSQL workflow tests passed in a disposable local database, including hidden/foreign growth records, read-only recovery, scan idempotency, conversion guards, phone propagation and idempotent historical repair.
- 19 UI tests passed across report fixes, retest presentation and contact-centre controls.
- Backend intelligence, content scheduling, permissions and Smart Force regressions are included in the focused check run.
- Tests use synthetic records and mock channel delivery; no real calls or messages are sent.

Deployment results are appended after rollout. Existing contact phones are never overwritten, and ambiguous or differently identified contacts are skipped by the repair.
