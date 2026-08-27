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
    # "structure" is the generic identifier — a segmented anatomical region
    # is NOT a lesion, and calling it one is misleading in a report compiler
    # downstream. `kind` says which this actually is: "structure" (pure
    # anatomy, e.g. a segmented ventricle) or "lesion" (an actual pathology
    # detector's output, e.g. a candidate lung nodule). `lesion` is kept as
    # a deprecated alias populated from `structure` for any caller still
    # reading the old field name — new code should read `structure`/`kind`.
    structure: str
    kind: str = "structure"
    lesion: str | None = None
    location: str | None = None
    size_mm: float | None = None
    volume_mm3: float | None = None
    # Abstention state machine (inference.abstention) — POSITIVE / NEGATIVE /
    # UNCERTAIN / ABSTAIN, derived from this specific observation's own real
    # confidence, not a fabricated number. None only for measurements from
    # adapters not yet wired into the abstention module (legacy/CT paths).
    confidence: float | None = None
    state: str | None = None
    state_reason: str | None = None
    # Item 9/QA-3 spatial evidence — real (z,y,x) voxel-space location on the
    # inference grid, not a validated attention/heatmap ground-truth. Only
    # one of these two is ever populated: centroid for a single-point
    # structure (mri_unest_adapter.py), bounding box for a segmented region
    # (mri_brats_adapter.py). None for measurements from adapters not yet
    # wired to emit spatial data.
    centroid_voxel: list[float] | None = None
    bounding_box_voxel: dict[str, int] | None = None


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
    # Real reason MR inference did or didn't run a real backend — governance
    # lock, applicability abstain, or genuine fetch gap — see
    # inference/engine.py's mr_backend_status(). Was previously computed
    # and immediately discarded: engine.py set result["applicability"] but
    # nothing here ever read it, so "why heuristic" never left the Python
    # process. None for non-MR modalities.
    applicability: dict[str, Any] | None = None
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
            structure=str(m.get("structure") or m.get("lesion") or "structure"),
            kind=str(m.get("kind", "lesion" if "lesion" in m and "structure" not in m else "structure")),
            lesion=str(m.get("structure") or m.get("lesion") or "structure"),  # deprecated alias, see Measurement
            location=m.get("location"),
            size_mm=m.get("size_mm"),
            volume_mm3=m.get("volume_mm3"),
            confidence=m.get("confidence"),
            state=m.get("state"),
            state_reason=m.get("state_reason"),
            centroid_voxel=m.get("centroid_voxel"),
            bounding_box_voxel=m.get("bounding_box_voxel"),
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

    from inference import mri_brats_adapter, mri_unest_adapter
    from inference.engine import mr_backend_status
    from inference.heuristic import infer_heuristic
    from orthanc_client import fetch_study_meta

    # Fetched here (not after the applicability check below) because body
    # region is now itself part of that check — a brain-only backend must
    # never be reported (or treated) as merely "governance-locked" for a
    # neck study; it plainly doesn't apply, locked or not.
    meta = fetch_study_meta(study_uid, orthanc_study_id)
    body_region = (meta or {}).get("study_description")

    # This IS the actual code path taken for essentially every real MR study
    # today (both backends RESEARCH_ONLY-locked) — it short-circuits before
    # engine.py's run_study_inference/_run_mr_inference (and its own
    # applicability reasoning) ever runs. Found this by tracing a real
    # "why heuristic" case end-to-end rather than assuming the reasoning
    # added to _run_mr_inference would be reached — it wasn't.
    backend_status = [
        mr_backend_status(mri_brats_adapter, "brats_tumor", body_region=body_region),
        mr_backend_status(mri_unest_adapter, "unest_whole_brain", body_region=body_region),
    ]

    # Two real, clinical-director-gated MRI backends now exist — whole-brain
    # structural segmentation (mri_unest_adapter) and BraTS tumor
    # segmentation (mri_brats_adapter). Only take the honest metadata-only
    # shortcut when NEITHER is both approved AND anatomically applicable;
    # otherwise let the study fall through to run_study_inference's real
    # volumetric MR path below. (available() alone is anatomy-blind — a
    # brain-only backend that happened to be unlocked must still never run
    # on a neck study.)
    if any(b["available"] and b["anatomy_applicable"] for b in backend_status):
        return None

    result = infer_heuristic(mod, meta)
    result["orthanc_meta"] = meta
    result["dicom_loaded"] = False
    result["preprocessing"] = {
        "source": "metadata_only",
        "quality_flags": ["mri_model_not_enabled", "pixel_data_not_loaded"],
    }
    result["applicability"] = {"age_years": None, "adapters": [], "backend_status": backend_status}
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
        applicability=result.get("applicability"),
    )
