"""
Imaging AI services — triage + structured analyze with CV inference backends.
TorchXRayVision (CXR), MONAI UNet, nnU-Net v2 when weights are mounted.
"""
from __future__ import annotations

import importlib.util
import os
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from pydantic import BaseModel, Field

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


def _norm_modality(modality: str) -> str:
    return (modality or "OT").upper().replace("X-RAY", "XR")


def _env_true(name: str) -> bool:
    return os.getenv(name, "false").strip().lower() == "true"


def _package_present(name: str) -> bool:
    return importlib.util.find_spec(name) is not None


def _model_weights_dir() -> Path:
    return Path(os.getenv("MODEL_WEIGHTS_DIR", "/app/models"))


def _monai_bundle_downloaded(bundle_name: str) -> bool:
    bundle_dir = _model_weights_dir() / bundle_name
    return (bundle_dir / "configs" / "inference.json").is_file() and (
        (bundle_dir / "models" / "model.pt").is_file()
        or (bundle_dir / "models" / "model.ts").is_file()
    )


def _totalseg_downloaded() -> bool:
    task_dir = "Dataset297_TotalSegmentator_total_3mm_1559subj"
    candidates = [
        Path(os.getenv("TOTALSEG_WEIGHTS_DIR", "")),
        Path.home() / ".totalsegmentator" / "nnunet" / "results",
    ]
    return any(base and (base / task_dir).is_dir() for base in candidates)


def _lightweight_model_status() -> dict[str, Any]:
    monai_present = _package_present("monai")
    ct_bundle = os.getenv("MONAI_CT_BUNDLE_NAME", "spleen_ct_segmentation")
    lung_bundle = os.getenv("MONAI_LUNG_NODULE_BUNDLE_NAME", "lung_nodule_ct_detection")
    breast_bundle = os.getenv("MONAI_BREAST_DENSITY_BUNDLE_NAME", "breast_density_classification")
    ct_downloaded = _monai_bundle_downloaded(ct_bundle)
    lung_downloaded = _monai_bundle_downloaded(lung_bundle)
    breast_downloaded = _monai_bundle_downloaded(breast_bundle)
    nnunet_folder = os.getenv("NNUNET_MODEL_FOLDER", "")

    return {
        "lightweight": True,
        "torchxrayvision": _package_present("torchxrayvision"),
        "monai_ct_unet": monai_present and ct_downloaded and _env_true("MONAI_CT_UNET_CLINICAL_APPROVED"),
        "monai_ct_unet_downloaded": ct_downloaded,
        "monai_mri_unet": False,
        "totalsegmentator_ct": (
            _package_present("totalsegmentator")
            and _totalseg_downloaded()
            and _env_true("TOTALSEG_CLINICAL_APPROVED")
        ),
        "totalsegmentator_ct_downloaded": _totalseg_downloaded(),
        "lung_nodule_detection_ct": (
            monai_present
            and lung_downloaded
            and _env_true("LUNG_NODULE_DETECTION_CLINICAL_APPROVED")
        ),
        "lung_nodule_detection_ct_downloaded": lung_downloaded,
        "breast_density_mg": (
            monai_present
            and breast_downloaded
            and _env_true("BREAST_DENSITY_CLINICAL_APPROVED")
        ),
        "breast_density_mg_downloaded": breast_downloaded,
        "nnunetv2": bool(nnunet_folder) and Path(nnunet_folder).is_dir() and _package_present("nnunetv2"),
    }


def _metadata_only_mri(study_uid: str, modality: str, orthanc_study_id: str | None) -> dict[str, Any] | None:
    mod = _norm_modality(modality)
    if mod not in ("MR", "MRI"):
        return None

    from inference.heuristic import infer_heuristic
    from orthanc_client import fetch_study_meta

    meta = fetch_study_meta(study_uid, orthanc_study_id)
    result = infer_heuristic(mod, meta)
    result["orthanc_meta"] = meta
    result["dicom_loaded"] = False
    result["preprocessing"] = {
        "source": "metadata_only",
        "quality_flags": ["mri_model_not_enabled", "pixel_data_not_loaded"],
    }
    return result


def _run_inference(study_uid: str, modality: str, orthanc_study_id: str | None) -> dict[str, Any]:
    mri_result = _metadata_only_mri(study_uid, modality, orthanc_study_id)
    if mri_result:
        return mri_result

    from inference.engine import run_study_inference

    return run_study_inference(study_uid, modality, orthanc_study_id)


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "service": "imaging-triage",
        "version": "1.3.0",
    }


@app.get("/health/deep")
def health_deep() -> dict[str, Any]:
    from inference.engine import get_model_status

    return {
        "ok": True,
        "service": "imaging-triage",
        "version": "1.3.0",
        "orthanc_reachable": orthanc_health(),
        "models": get_model_status(),
    }


@app.get("/models/status")
def models_status() -> dict[str, Any]:
    return _lightweight_model_status()


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
