# Hospital OS documents — Word & PowerPoint exports

Generated from Markdown sources. Regenerate after doc edits:

```bash
bash scripts/docs/export-hospital-docs.sh
bash scripts/docs/build-master-gap-doc.sh   # single large Word package
```

## ⭐ Master package (recommended)

| Document | Word (.docx) | Contents |
|----------|--------------|----------|
| **Master Gap Implementation (all-in-one)** | [MediQzy_Hospital_OS_Master_Gap_Implementation.docx](./MediQzy_Hospital_OS_Master_Gap_Implementation.docx) | Part I: Gaps backlog · Part II: All module workflows · Part III: Paperless + AI · Part IV: Workflow charts |

## Individual files

| Document | Word (.docx) | PowerPoint (.pptx) | Source |
|----------|--------------|-------------------|--------|
| Patient & operations workflow charts | [MediQzy_Hospital_OS_Workflow_Charts.docx](./MediQzy_Hospital_OS_Workflow_Charts.docx) | [MediQzy_Hospital_OS_Workflow_Charts.pptx](./MediQzy_Hospital_OS_Workflow_Charts.pptx) | `../MEDIQZY_HOSPITAL_OS_WORKFLOW_CHARTS.md` |
| **Complete hospital workflows (all modules)** | [MediQzy_Complete_Hospital_Workflows.docx](./MediQzy_Complete_Hospital_Workflows.docx) | [MediQzy_Complete_Hospital_Workflows.pptx](./MediQzy_Complete_Hospital_Workflows.pptx) | `../MEDIQZY_COMPLETE_HOSPITAL_WORKFLOWS.md` |
| **Greenfield paperless + AI copilot flows** | [MediQzy_Greenfield_Paperless_AI_Flows.docx](./MediQzy_Greenfield_Paperless_AI_Flows.docx) | [MediQzy_Greenfield_Paperless_AI_Flows.pptx](./MediQzy_Greenfield_Paperless_AI_Flows.pptx) | `../MEDIQZY_GREENFIELD_PAPERLESS_AI_FLOWS.md` |
| Greenfield gaps implementation | [MediQzy_Greenfield_Hospital_Gaps_Implementation.docx](./MediQzy_Greenfield_Hospital_Gaps_Implementation.docx) | [MediQzy_Greenfield_Hospital_Gaps_Implementation.pptx](./MediQzy_Greenfield_Hospital_Gaps_Implementation.pptx) | `../GREENFIELD_HOSPITAL_GAPS_IMPLEMENTATION.md` |

## Download (when server is running)

**No login required** after deploy (public `/api/downloads` whitelist).

- Landing page: `https://<your-host>/api/downloads/hospital/index.html`
- File catalog (JSON): `https://<your-host>/api/downloads/hospital/`

| File | URL |
|------|-----|
| Master Gap Implementation (all-in-one) | `/api/downloads/hospital/MediQzy_Hospital_OS_Master_Gap_Implementation.docx` |
| Workflow Charts (Word) | `/api/downloads/hospital/MediQzy_Hospital_OS_Workflow_Charts.docx` |
| Workflow Charts (PPT) | `/api/downloads/hospital/MediQzy_Hospital_OS_Workflow_Charts.pptx` |
| Complete Workflows (Word) | `/api/downloads/hospital/MediQzy_Complete_Hospital_Workflows.docx` |
| Complete Workflows (PPT) | `/api/downloads/hospital/MediQzy_Complete_Hospital_Workflows.pptx` |
| Paperless + AI Flows (Word) | `/api/downloads/hospital/MediQzy_Greenfield_Paperless_AI_Flows.docx` |
| Paperless + AI Flows (PPT) | `/api/downloads/hospital/MediQzy_Greenfield_Paperless_AI_Flows.pptx` |
| Gaps doc (Word) | `/api/downloads/hospital/MediQzy_Greenfield_Hospital_Gaps_Implementation.docx` |
| Gaps doc (PPT) | `/api/downloads/hospital/MediQzy_Greenfield_Hospital_Gaps_Implementation.pptx` |

Example production: `https://app.mediqzy.com/api/downloads/hospital/MediQzy_Hospital_OS_Workflow_Charts.docx`

**Note:** Mermaid diagrams in the Markdown are exported as text/code blocks in Word/PPT. For **visual flowcharts**, see below.

## Visual flowcharts (PNG / SVG)

Render all diagrams from both workflow Markdown files:

```bash
node scripts/docs/render-workflow-diagrams.mjs
```

Output:
- `docs/hospital/exports/diagrams/` — 15 kiosk/display flowcharts (PNG/SVG + `index.html`)
- `docs/hospital/exports/diagrams/complete/` — 20 all-module flowcharts (PNG/SVG + `index.html`)
- `docs/hospital/exports/diagrams/paperless-ai/` — 16 paperless + AI copilot flowcharts (PNG/SVG + `index.html`)

Then **Insert → Picture** in Word/PowerPoint, or import SVG into draw.io / Figma for editable GUI layouts.

