# Module Copilot Registry

Per-module AI copilots for Mediqzy Hospital OS. Each copilot routes through `/api/v3/module-copilot/chat` to the multi-agent brain with module-scoped tools and prompts.

## Architecture

```
Module UI → ModuleCopilot.tsx → POST /api/v3/module-copilot/chat
  → module-copilot.service.js → multi-agent-orchestrator (forceAgent)
  → module-tools.js + domain tools → llm-provider cascade
  → module_copilot_log (audit)
```

## Module Registry

| Module ID | Copilot | Agent | SaMD |
|-----------|---------|-------|------|
| billing | Revenue Copilot | insurance | No |
| accounts | Accounts Copilot | insurance | No |
| clinical / emr | Clinical Copilot | clinical | Yes |
| adt | Admit Copilot | worker | No |
| nursing | Nurse Copilot | clinical | Yes |
| lab | Lab Copilot | research | No |
| pharmacy | Pharma Copilot | research | No |
| insurance | Claims Copilot | insurance | No |
| ot / icu / er | Theatre / ICU / ER Copilot | clinical / emergency | Yes |
| mrd | Records Copilot | analyst | No |
| quality | Compliance Copilot | analyst | No |
| cfo | CFO Copilot | analyst | No |

## Module Tools (ai-brain/tools/module-tools.js)

- `get_billing_account_summary`
- `get_open_invoices`
- `get_admission_status`
- `get_discharge_clearance`
- `get_lab_orders_pending`
- `get_early_warning_alerts`
- `query_patient_cohort`
- `get_insurance_claims_summary`
- `get_quality_kpi_snapshot`

## Frontend Integration

- **Hospital pages:** `HospitalLayout` auto-maps path → copilot
- **Department portals:** `HospDeptLayout` accepts `copilotModule` prop
- **Lab:** `LabLayout` includes Lab Copilot
- **Accounts:** `Wrap` defaults to `accounts` copilot

## SaMD Boundaries

Clinical, nursing, OT, ICU, ER copilots may invoke SaMD-class tools (triage, drug interactions). All outputs require licensed user review before clinical action.

## Migrations

None required — `module_copilot_log` table is auto-created on first use.
