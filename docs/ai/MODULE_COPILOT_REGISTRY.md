# Module Copilot Registry

Per-module AI copilots for Mediqzy Hospital OS. Each copilot routes through `/api/v3/module-copilot/chat` to the multi-agent brain with module-scoped tools and prompts.

## Architecture

```
Module UI → ModuleCopilot.tsx → POST /api/v3/module-copilot/chat
  → module-copilot.service.js → multi-agent-orchestrator (forceAgent)
  → module-tools.js + domain tools → llm-provider cascade
  → module_copilot_log (audit)
```

## Module Registry (26 modules)

| Module ID | Copilot | Agent | SaMD |
|-----------|---------|-------|------|
| admin | Ops Copilot | admin | No |
| billing | Revenue Copilot | insurance | No |
| accounts | Accounts Copilot | insurance | No |
| clinical / emr | Clinical Copilot | clinical | Yes |
| adt | Admit Copilot | worker | No |
| nursing | Nurse Copilot | clinical | Yes |
| lab | Lab Copilot | research | No |
| pharmacy | Pharma Copilot | research | No |
| insurance | Claims Copilot | insurance | No |
| ot | Theatre Copilot | clinical | Yes |
| icu | Critical Care Copilot | emergency | Yes |
| er | ER Copilot | emergency | Yes |
| mrd | Records Copilot | analyst | No |
| quality | Compliance Copilot | analyst | No |
| hr | People Copilot | analyst | No |
| scm | Supply Copilot | worker | No |
| security | Security Copilot | admin | No |
| ambulance | Dispatch Copilot | emergency | No |
| dietary | Nutrition Copilot | research | No |
| biomedical | Biomed Copilot | research | No |
| consent | Consent Copilot | research | No |
| bloodbank | Blood Bank Copilot | clinical | No |
| cssd | CSSD Copilot | worker | No |
| cfo | CFO Copilot | analyst | No |
| patient | Dr. iSHA | clinical | No |

## Module Tools (ai-brain/tools/module-tools.js)

- `get_billing_account_summary`
- `get_open_invoices`
- `get_admission_status`
- `get_discharge_clearance`
- `get_lab_orders_pending`
- `get_early_warning_alerts`
- `query_patient_cohort`
- `get_insurance_claims_summary`
- `get_denials_summary`
- `get_quality_kpi_snapshot`

## Frontend Integration

- **Hospital pages:** `HospitalLayout` auto-maps path → copilot (billing, ehr, er, ambulance, discharge, scribe, etc.)
- **Department portals:** `HospDeptLayout` accepts `copilotModule` prop (HR, security, insurance desk, OT, ICU, MRD, quality, accounts)
- **Dept staff portals:** `DeptStaffLayout` accepts `copilotModule` (dietary, biomedical, bloodbank, cssd, scm, consent)
- **Standalone layouts:** `LabLayout`, `PharmacyLayout`, `AmbulanceLayout`, `InsurancePortalLayout`
- **Admin:** `AdminCopilot` on admin pages; federated learning at `/admin/ai/federated`

## SaMD Boundaries

Clinical, nursing, OT, ICU, ER copilots may invoke SaMD-class tools (triage, drug interactions). All outputs require licensed user review before clinical action.

## Migrations

None required — `module_copilot_log` table is auto-created on first use.
