"""
Imaging AI services — triage (Phase 3) + structured analyze (Phase C).
SaMD: all outputs advisory; physician review required.
"""
from __future__ import annotations

import os
import re
from typing import Any

from fastapi import FastAPI
from pydantic import BaseModel, Field

app = FastAPI(title="MediQzy Imaging Triage", version="1.1.0")

MODEL_VERSION = os.getenv("IMAGING_TRIAGE_MODEL", "imaging-triage-v1")
ANALYZE_VERSION = os.getenv("IMAGING_ANALYZE_MODEL", "imaging-analyze-v1")


class TriageRequest(BaseModel):
    study_instance_uid: str
    modality: str = "OT"
    orthanc_study_id: str | None = None


class AnalyzeRequest(BaseModel):
    study_instance_uid: str
    modality: str = "OT"
    orthanc_study_id: str | None = None


class Finding(BaseModel):
    label: str
    severity: str = Field(description="low | medium | high")
    note: str = ""
    present: bool = True
    location: str | None = None
    size_mm: float | None = None


class Measurement(BaseModel):
    lesion: str
    location: str | None = None
    size_mm: float | None = None
    volume_mm3: float | None = None


class TriageResponse(BaseModel):
    findings: list[Finding]
    confidence_score: float
    model_version: str
    disclaimer: str = "Advisory only — radiologist review required."


class AnalyzeResponse(BaseModel):
    findings: list[Finding]
    measurements: list[Measurement] = []
    critical: bool = False
    confidence_score: float
    model_version: str
    disclaimer: str = "Structured screening output — not a diagnosis."


MODALITY_HINTS: dict[str, list[Finding]] = {
    "CT": [
        Finding(label="Lung parenchyma review", severity="low", note="Screen for nodules or consolidation.", location="lungs"),
        Finding(label="Mediastinum review", severity="low", note="Assess lymph nodes and great vessels.", location="mediastinum"),
    ],
    "MRI": [
        Finding(label="Signal abnormality review", severity="low", note="Compare with prior if available."),
    ],
    "XR": [
        Finding(label="Cardiomediastinal silhouette", severity="low", note="Assess heart size.", location="heart"),
        Finding(label="Lung fields", severity="low", note="Screen for infiltrates.", location="lungs"),
    ],
}

CRITICAL_KEYWORDS = re.compile(
    r"pneumothorax|hemorrhage|stroke|embol|dissection|tension",
    re.IGNORECASE,
)


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "service": "imaging-triage",
        "model": MODEL_VERSION,
        "analyze_model": ANALYZE_VERSION,
    }


@app.post("/triage", response_model=TriageResponse)
def triage(req: TriageRequest) -> TriageResponse:
    mod = _norm_modality(req.modality)
    findings = MODALITY_HINTS.get(mod, [
        Finding(label="Manual review recommended", severity="low", note=f"Screening for {mod}.")
    ])
    confidence = 0.72 if mod in MODALITY_HINTS else 0.55
    return TriageResponse(findings=findings, confidence_score=confidence, model_version=MODEL_VERSION)


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(req: AnalyzeRequest) -> AnalyzeResponse:
    """Phase C: structured findings for report drafter (MONAI-ready stub)."""
    mod = _norm_modality(req.modality)
    findings = list(MODALITY_HINTS.get(mod, [
        Finding(label="General review", severity="low", note=f"Automated screening for {mod}.")
    ]))

    measurements: list[Measurement] = []
    if mod == "CT":
        measurements.append(Measurement(lesion="Screening nodule", location="RUL", size_mm=6.0))
    elif mod == "XR":
        findings.append(Finding(label="Cardiomegaly screening", severity="low", note="Assess cardiothoracic ratio.", location="heart"))

    critical = any(CRITICAL_KEYWORDS.search(f.label + f.note) for f in findings)
    return AnalyzeResponse(
        findings=findings,
        measurements=measurements,
        critical=critical,
        confidence_score=0.68 if mod in MODALITY_HINTS else 0.52,
        model_version=ANALYZE_VERSION,
    )


def _norm_modality(modality: str) -> str:
    return (modality or "OT").upper().replace("X-RAY", "XR")
