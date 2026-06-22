# Hospital OS documents — Word & PowerPoint exports

Generated from Markdown sources. Regenerate after doc edits:

```bash
bash scripts/docs/export-hospital-docs.sh
```

## Files

| Document | Word (.docx) | PowerPoint (.pptx) | Source |
|----------|--------------|-------------------|--------|
| Patient & operations workflow charts | [MediQzy_Hospital_OS_Workflow_Charts.docx](./MediQzy_Hospital_OS_Workflow_Charts.docx) | [MediQzy_Hospital_OS_Workflow_Charts.pptx](./MediQzy_Hospital_OS_Workflow_Charts.pptx) | `../MEDIQZY_HOSPITAL_OS_WORKFLOW_CHARTS.md` |
| Greenfield gaps implementation | [MediQzy_Greenfield_Hospital_Gaps_Implementation.docx](./MediQzy_Greenfield_Hospital_Gaps_Implementation.docx) | [MediQzy_Greenfield_Hospital_Gaps_Implementation.pptx](./MediQzy_Greenfield_Hospital_Gaps_Implementation.pptx) | `../GREENFIELD_HOSPITAL_GAPS_IMPLEMENTATION.md` |

## Download (when server is running)

**No login required** after deploy (public `/api/downloads` whitelist).

- Landing page: `https://<your-host>/api/downloads/hospital/index.html`
- File catalog (JSON): `https://<your-host>/api/downloads/hospital/`

| File | URL |
|------|-----|
| Workflow Charts (Word) | `/api/downloads/hospital/MediQzy_Hospital_OS_Workflow_Charts.docx` |
| Workflow Charts (PPT) | `/api/downloads/hospital/MediQzy_Hospital_OS_Workflow_Charts.pptx` |
| Gaps doc (Word) | `/api/downloads/hospital/MediQzy_Greenfield_Hospital_Gaps_Implementation.docx` |
| Gaps doc (PPT) | `/api/downloads/hospital/MediQzy_Greenfield_Hospital_Gaps_Implementation.pptx` |

Example production: `https://mediqzy.com/api/downloads/hospital/MediQzy_Hospital_OS_Workflow_Charts.docx`

**Note:** Mermaid diagrams in the Markdown are exported as text/code blocks in Word/PPT. For **visual flowcharts**, see below.

## Visual flowcharts (PNG / SVG)

Render all 15 diagrams from the workflow Markdown:

```bash
node scripts/docs/render-workflow-diagrams.mjs
```

Output: `docs/hospital/exports/diagrams/*.png` and `*.svg` + `index.html` preview.

Then **Insert → Picture** in Word/PowerPoint, or import SVG into draw.io / Figma for editable GUI layouts.

