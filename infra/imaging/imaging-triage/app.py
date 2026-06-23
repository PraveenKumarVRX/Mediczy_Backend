"""
Imaging AI triage microservice — Phase 3 (MONAI-ready stub).
SaMD: outputs are advisory; physician review required before clinical action.
"""
from __future__ import annotations

import os
from typing import Any

from fastapi import FastAPI
from pydantic import BaseModel, Field

app = FastAPI(title="MediQzy Imaging Triage", version="1.0.0")

MODEL_VERSION = os.getenv("IMAGING_TRIAGE_MODEL", "imaging-triage-v1")


class TriageRequest(BaseModel):
    study_instance_uid: str
    modality: str = "OT"
    orthanc_study_id: str | None = None


class Finding(BaseModel):
    label: str
    severity: str = Field(description="low | medium | high")
    note: str = ""


class TriageResponse(BaseModel):
    findings: list[Finding]
    confidence_score: float
    model_version: str
    disclaimer: str = "Advisory only — radiologist review required."


MODALITY_HINTS: dict[str, list[Finding]] = {
    "CT": [
        Finding(label="Review lung parenchyma", severity="low", note="Screen for nodules or consolidation."),
        Finding(label="Check mediastinum", severity="low", note="Assess lymph nodes and great vessels."),
    ],
    "MRI": [
        Finding(label="Review signal abnormalities", severity="low", note="Compare with prior if available."),
    ],
    "XR": [
        Finding(label="Review cardiomediastinal silhouette", severity="low", note="Assess heart size and contours."),
        Finding(label="Review lung fields", severity="low", note="Screen for infiltrates or effusions."),
    ],
}


@app.get("/health")
def health() -> dict[str, Any]:
    return {"ok": True, "service": "imaging-triage", "model": MODEL_VERSION}


@app.post("/triage", response_model=TriageResponse)
def triage(req: TriageRequest) -> TriageResponse:
    mod = (req.modality or "OT").upper().replace("X-RAY", "XR")
    findings = MODALITY_HINTS.get(mod, [
        Finding(label="Manual review recommended", severity="low", note=f"Automated screening for {mod}.")
    ])
    confidence = 0.72 if mod in MODALITY_HINTS else 0.55
    return TriageResponse(
        findings=findings,
        confidence_score=confidence,
        model_version=MODEL_VERSION,
    )
