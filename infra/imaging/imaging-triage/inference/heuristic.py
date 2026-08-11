"""Rule-based fallback when CV models unavailable or DICOM not fetched."""
from __future__ import annotations

import re
from typing import Any

CRITICAL_KEYWORDS = re.compile(
    r"pneumothorax|hemorrhage|stroke|embol|dissection|tension",
    re.IGNORECASE,
)

MODALITY_HINTS: dict[str, list[dict[str, Any]]] = {
    "CT": [
        {"label": "Lung parenchyma review", "severity": "low", "note": "Screen for nodules or consolidation.", "location": "lungs"},
        {"label": "Mediastinum review", "severity": "low", "note": "Assess lymph nodes and great vessels.", "location": "mediastinum"},
    ],
    "MR": [
        {"label": "Signal abnormality review", "severity": "low", "note": "Compare with prior if available."},
    ],
    "XR": [
        {"label": "Cardiomediastinal silhouette", "severity": "low", "note": "Assess heart size.", "location": "heart"},
        {"label": "Lung fields", "severity": "low", "note": "Screen for infiltrates.", "location": "lungs"},
    ],
}


def infer_heuristic(modality: str, meta: dict[str, Any] | None) -> dict[str, Any]:
    mod = (modality or "OT").upper().replace("X-RAY", "XR")
    findings = list(MODALITY_HINTS.get(mod, [
        {"label": "Manual review recommended", "severity": "low", "note": f"Screening for {mod}.", "present": True},
    ]))
    if meta and meta.get("study_description"):
        findings.append({
            "label": "Study indication review",
            "severity": "low",
            "note": str(meta["study_description"])[:200],
            "present": True,
        })
    critical = any(CRITICAL_KEYWORDS.search(f.get("label", "") + f.get("note", "")) for f in findings)
    confidence = 0.55 if meta else 0.45
    return {
        "findings": findings,
        "measurements": [],
        "critical": critical,
        "confidence_score": confidence,
        "model_version": "heuristic-screening-v1",
        "inference_backend": "heuristic",
        "feature_attributions": [],
    }
