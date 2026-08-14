"""
Imaging AI services — triage + structured analyze with CV inference backends.
TorchXRayVision (CXR), MONAI UNet, nnU-Net v2 when weights are mounted.
"""
from __future__ import annotations

from typing import Any

from fastapi import FastAPI
from pydantic import BaseModel, Field

from inference.engine import get_model_status, norm_modality, run_study_inference
from orthanc_client import orthanc_health

app = FastAPI(title="MediQzy Imaging Triage", version="1.3.0")


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
    confidence: float | None = None


class Measurement(BaseModel):
    lesion: str
    location: str | None = None
    size_mm: float | None = None
    volume_mm3: float | None = None


class TriageResponse(BaseModel):
    findings: list[Finding]
    confidence_score: float
    model_version: str
    inference_backend: str = "heuristic"
    feature_attributions: list[dict[str, Any]] = Field(default_factory=list)
    orthanc_meta: dict[str, Any] | None = None
    preprocessing: dict[str, Any] | None = None
    dicom_loaded: bool = False
    disclaimer: str = "Advisory only — radiologist review required."


class AnalyzeResponse(BaseModel):
    findings: list[Finding]
    measurements: list[Measurement] = Field(default_factory=list)
    critical: bool = False
    confidence_score: float
    model_version: str
    inference_backend: str = "heuristic"
    feature_attributions: list[dict[str, Any]] = Field(default_factory=list)
    orthanc_meta: dict[str, Any] | None = None
    preprocessing: dict[str, Any] | None = None
    dicom_loaded: bool = False
    disclaimer: str = "Structured screening output — not a diagnosis."


def _dicts_to_findings(raw: list[dict[str, Any]]) -> list[Finding]:
    return [
        Finding(
            label=str(f.get("label", "Finding")),
            severity=str(f.get("severity", "low")),
            note=str(f.get("note", "")),
            present=bool(f.get("present", True)),
            location=f.get("location"),
            size_mm=f.get("size_mm"),
            confidence=f.get("confidence"),
        )
        for f in raw
    ]


def _dicts_to_measurements(raw: list[dict[str, Any]]) -> list[Measurement]:
    return [
        Measurement(
            lesion=str(m.get("lesion", "lesion")),
            location=m.get("location"),
            size_mm=m.get("size_mm"),
            volume_mm3=m.get("volume_mm3"),
        )
        for m in raw
    ]


def _run_inference(study_uid: str, modality: str, orthanc_study_id: str | None) -> dict[str, Any]:
    return run_study_inference(study_uid, modality, orthanc_study_id)


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "service": "imaging-triage",
        "version": "1.3.0",
        "orthanc_reachable": orthanc_health(),
        "models": get_model_status(),
    }


@app.get("/models/status")
def models_status() -> dict[str, Any]:
    return get_model_status()


@app.post("/triage", response_model=TriageResponse)
def triage(req: TriageRequest) -> TriageResponse:
    result = _run_inference(req.study_instance_uid, req.modality, req.orthanc_study_id)
    return TriageResponse(
        findings=_dicts_to_findings(result.get("findings", [])),
        confidence_score=float(result.get("confidence_score", 0.5)),
        model_version=str(result.get("model_version", "heuristic-screening-v1")),
        inference_backend=str(result.get("inference_backend", "heuristic")),
        feature_attributions=list(result.get("feature_attributions") or []),
        orthanc_meta=result.get("orthanc_meta"),
        preprocessing=result.get("preprocessing"),
        dicom_loaded=bool(result.get("dicom_loaded")),
    )


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(req: AnalyzeRequest) -> AnalyzeResponse:
    result = _run_inference(req.study_instance_uid, req.modality, req.orthanc_study_id)
    return AnalyzeResponse(
        findings=_dicts_to_findings(result.get("findings", [])),
        measurements=_dicts_to_measurements(result.get("measurements", [])),
        critical=bool(result.get("critical")),
        confidence_score=float(result.get("confidence_score", 0.5)),
        model_version=str(result.get("model_version", "heuristic-screening-v1")),
        inference_backend=str(result.get("inference_backend", "heuristic")),
        feature_attributions=list(result.get("feature_attributions") or []),
        orthanc_meta=result.get("orthanc_meta"),
        preprocessing=result.get("preprocessing"),
        dicom_loaded=bool(result.get("dicom_loaded")),
    )
