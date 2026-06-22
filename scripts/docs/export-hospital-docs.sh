#!/usr/bin/env bash
# Export hospital Markdown docs to Word and PowerPoint for offline sharing.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
EXPORT="$ROOT/docs/hospital/exports"
DOWNLOAD="$ROOT/server/public/downloads/hospital"
mkdir -p "$EXPORT" "$DOWNLOAD"

if ! command -v pandoc >/dev/null 2>&1; then
  echo "pandoc is required. Install: sudo apt-get install pandoc"
  exit 1
fi

convert() {
  local src="$1" base="$2"
  pandoc "$src" -o "$EXPORT/${base}.docx" --from markdown --to docx
  pandoc "$src" -o "$EXPORT/${base}.pptx" --from markdown --to pptx --slide-level=2
  cp "$EXPORT/${base}.docx" "$EXPORT/${base}.pptx" "$DOWNLOAD/"
  echo "  ✓ $base (.docx + .pptx)"
}

echo "Exporting hospital docs..."
convert "$ROOT/docs/hospital/MEDIQZY_HOSPITAL_OS_WORKFLOW_CHARTS.md" "MediQzy_Hospital_OS_Workflow_Charts"
convert "$ROOT/docs/hospital/MEDIQZY_COMPLETE_HOSPITAL_WORKFLOWS.md" "MediQzy_Complete_Hospital_Workflows"
convert "$ROOT/docs/hospital/MEDIQZY_GREENFIELD_PAPERLESS_AI_FLOWS.md" "MediQzy_Greenfield_Paperless_AI_Flows"
convert "$ROOT/docs/hospital/GREENFIELD_HOSPITAL_GAPS_IMPLEMENTATION.md" "MediQzy_Greenfield_Hospital_Gaps_Implementation"
echo "Done → $EXPORT"
