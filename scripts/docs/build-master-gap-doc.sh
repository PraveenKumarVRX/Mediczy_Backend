#!/usr/bin/env bash
# Build one consolidated Master Gap Implementation Markdown + Word export.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DOCS="$ROOT/docs/hospital"
BUILD="$DOCS/.build"
EXPORT="$ROOT/docs/hospital/exports"
DOWNLOAD="$ROOT/server/public/downloads/hospital"
MASTER_MD="$DOCS/MEDIQZY_HOSPITAL_OS_MASTER_GAP_IMPLEMENTATION.md"
OUT_BASE="MediQzy_Hospital_OS_Master_Gap_Implementation"

mkdir -p "$BUILD" "$EXPORT" "$DOWNLOAD"

if ! command -v pandoc >/dev/null 2>&1; then
  echo "pandoc is required. Install: sudo apt-get install pandoc"
  exit 1
fi

append_part() {
  local title="$1" file="$2"
  {
    echo ""
    echo "\\newpage"
    echo ""
    echo "# $title"
    echo ""
    echo "*Source: \`$(basename "$file")\`*"
    echo ""
    echo "---"
    echo ""
    # Strip duplicate top-level H1 from appended files (keep rest)
    awk 'NR==1 && /^# / { next } { print }' "$file"
  } >> "$MASTER_MD"
}

echo "Building master gap implementation document..."

cat > "$MASTER_MD" <<'COVER'
---
title: "MediQzy Hospital OS — Master Gap Implementation Package"
subtitle: "Greenfield deployment · All modules · Paperless · AI copilots · Displays · Workflows"
author: "MediQzy Engineering"
date: "2026-06-17"
version: "1.0"
document-id: "MED-HOSP-MASTER-001"
---

# MediQzy Hospital OS — Master Gap Implementation Package

| Field | Value |
|-------|-------|
| **Document ID** | MED-HOSP-MASTER-001 |
| **Version** | 1.0 |
| **Date** | 2026-06-17 |
| **Audience** | CEO, CTO, PM, BA, Engineering, QA, Security, Delivery, Hospital IT |
| **Purpose** | Single consolidated package: gap backlog, phases, sign-off, workflows, paperless + AI flows |

This document merges four source specifications into **one printable / shareable Word package**:

1. **Greenfield Gaps Implementation** — full gap register, phases, acceptance criteria, sign-off
2. **Complete Hospital Module Workflows** — doctor, lab, pharmacy, ADT, insurance, billing, ER, MRD, OT, ICU, ward
3. **Greenfield Paperless & AI-Augmented Flows** — paperless journeys + department copilots
4. **Hospital OS Workflow Charts** — patient journeys, queue, displays, ADT timelines

**How to use:** Part I for engineering backlog and go-live gates; Parts II–IV for operations training and clinical flow design.

---

COVER

append_part "Part I — Greenfield Gaps Implementation (Master Backlog)" \
  "$DOCS/GREENFIELD_HOSPITAL_GAPS_IMPLEMENTATION.md"

append_part "Part II — Complete Hospital Module Workflows" \
  "$DOCS/MEDIQZY_COMPLETE_HOSPITAL_WORKFLOWS.md"

append_part "Part III — Paperless & AI-Augmented Flows" \
  "$DOCS/MEDIQZY_GREENFIELD_PAPERLESS_AI_FLOWS.md"

append_part "Part IV — Patient & Operations Workflow Charts" \
  "$DOCS/MEDIQZY_HOSPITAL_OS_WORKFLOW_CHARTS.md"

cat >> "$MASTER_MD" <<'FOOTER'

---

## Document assembly

| Part | Source file |
|------|-------------|
| I | `GREENFIELD_HOSPITAL_GAPS_IMPLEMENTATION.md` |
| II | `MEDIQZY_COMPLETE_HOSPITAL_WORKFLOWS.md` |
| III | `MEDIQZY_GREENFIELD_PAPERLESS_AI_FLOWS.md` |
| IV | `MEDIQZY_HOSPITAL_OS_WORKFLOW_CHARTS.md` |

Regenerate: `bash scripts/docs/build-master-gap-doc.sh`

FOOTER

pandoc "$MASTER_MD" \
  -o "$EXPORT/${OUT_BASE}.docx" \
  --from markdown \
  --to docx \
  --toc \
  --toc-depth=3 \
  --metadata title="MediQzy Hospital OS — Master Gap Implementation Package"

cp "$EXPORT/${OUT_BASE}.docx" "$DOWNLOAD/"

echo "  ✓ ${OUT_BASE}.docx ($(wc -c < "$EXPORT/${OUT_BASE}.docx" | awk '{printf "%.1f KB", $1/1024}'))"
echo "  ✓ Source: $MASTER_MD"
echo "Done → $EXPORT/${OUT_BASE}.docx"
