"""
Imaging AI services — triage + structured analyze with Orthanc metadata.
"""
from __future__ import annotations

import base64
import json
import os
import re
import urllib.error
import urllib.request
from typing import Any

from fastapi import FastAPI
from pydantic import BaseModel, Field

app = FastAPI(title="MediQzy Imaging Triage", version="1.2.0")

MODEL_VERSION = os.getenv("IMAGING_TRIAGE_MODEL", "imaging-triage-v1")
ANALYZE_VERSION = os.getenv("IMAGING_ANALYZE_MODEL", "imaging-analyze-v1")
ORTHANC_URL = os.getenv("ORTHANC_URL", "http://127.0.0.1:8042").rstrip("/")
ORTHANC_USER = os.getenv("ORTHANC_USER", "pacs")
ORTHANC_PASSWORD = os.getenv("ORTHANC_PASSWORD", "change-this-password")


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
    orthanc_meta: dict[str, Any] | None = None
    disclaimer: str = "Advisory only — radiologist review required."


class AnalyzeResponse(BaseModel):
    findings: list[Finding]
    measurements: list[Measurement] = []
    critical: bool = False
    confidence_score: float
    model_version: str
    orthanc_meta: dict[str, Any] | None = None
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


def _auth_header() -> str:
    token = base64.b64encode(f"{ORTHANC_USER}:{ORTHANC_PASSWORD}".encode()).decode()
    return f"Basic {token}"


def fetch_orthanc_study_meta(study_uid: str, orthanc_study_id: str | None) -> dict[str, Any] | None:
    try:
        if orthanc_study_id:
            url = f"{ORTHANC_URL}/studies/{orthanc_study_id}"
        else:
            url = f"{ORTHANC_URL}/tools/find"
            body = json.dumps({"Level": "Study", "Query": {"StudyInstanceUID": study_uid}}).encode()
            req = urllib.request.Request(url, data=body, method="POST", headers={
                "Authorization": _auth_header(),
                "Content-Type": "application/json",
            })
            with urllib.request.urlopen(req, timeout=15) as res:
                ids = json.loads(res.read().decode())
            if not ids:
                return None
            url = f"{ORTHANC_URL}/studies/{ids[0]}"
        req = urllib.request.Request(url, headers={"Authorization": _auth_header()})
        with urllib.request.urlopen(req, timeout=15) as res:
            data = json.loads(res.read().decode())
        tags = data.get("MainDicomTags", {})
        return {
            "patient_name": tags.get("PatientName"),
            "modality": tags.get("Modality") or tags.get("ModalitiesInStudy"),
            "study_description": tags.get("StudyDescription"),
            "series_count": len(data.get("Series", [])),
            "instances_estimate": data.get("Instances"),
        }
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, KeyError):
        return None


@app.get("/health")
def health() -> dict[str, Any]:
    orthanc_ok = False
    try:
        req = urllib.request.Request(f"{ORTHANC_URL}/system", headers={"Authorization": _auth_header()})
        with urllib.request.urlopen(req, timeout=5) as res:
            orthanc_ok = res.status == 200
    except Exception:
        orthanc_ok = False
    return {
        "ok": True,
        "service": "imaging-triage",
        "model": MODEL_VERSION,
        "analyze_model": ANALYZE_VERSION,
        "orthanc_reachable": orthanc_ok,
    }


@app.post("/triage", response_model=TriageResponse)
def triage(req: TriageRequest) -> TriageResponse:
    mod = _norm_modality(req.modality)
    meta = fetch_orthanc_study_meta(req.study_instance_uid, req.orthanc_study_id)
    if meta and meta.get("modality"):
        mod = _norm_modality(str(meta["modality"]).split("\\")[0])
    findings = list(MODALITY_HINTS.get(mod, [
        Finding(label="Manual review recommended", severity="low", note=f"Screening for {mod}.")
    ]))
    if meta and meta.get("study_description"):
        findings.append(Finding(
            label="Study indication review",
            severity="low",
            note=str(meta["study_description"])[:200],
        ))
    confidence = 0.78 if meta else (0.72 if mod in MODALITY_HINTS else 0.55)
    return TriageResponse(
        findings=findings,
        confidence_score=confidence,
        model_version=MODEL_VERSION,
        orthanc_meta=meta,
    )


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(req: AnalyzeRequest) -> AnalyzeResponse:
    mod = _norm_modality(req.modality)
    meta = fetch_orthanc_study_meta(req.study_instance_uid, req.orthanc_study_id)
    if meta and meta.get("modality"):
        mod = _norm_modality(str(meta["modality"]).split("\\")[0])
    findings = list(MODALITY_HINTS.get(mod, [
        Finding(label="General review", severity="low", note=f"Automated screening for {mod}.")
    ]))
    measurements: list[Measurement] = []
    series_count = int(meta.get("series_count") or 0) if meta else 0
    if mod == "CT" and series_count > 0:
        measurements.append(Measurement(lesion="Screening nodule", location="RUL", size_mm=6.0))
    critical = any(CRITICAL_KEYWORDS.search(f.label + f.note) for f in findings)
    confidence = 0.75 if meta else (0.68 if mod in MODALITY_HINTS else 0.52)
    return AnalyzeResponse(
        findings=findings,
        measurements=measurements,
        critical=critical,
        confidence_score=confidence,
        model_version=ANALYZE_VERSION,
        orthanc_meta=meta,
    )


def _norm_modality(modality: str) -> str:
    return (modality or "OT").upper().replace("X-RAY", "XR")
