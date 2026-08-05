"""TotalSegmentator adapter — whole-body CT organ segmentation (104 classes,
'total' task, fast/3mm model). Built on nnU-Net, actively used in production
radiology research (Wasserthal et al., Radiology AI 2023).

Same governance gate pattern as monai_unet.py: weights being present on disk
does NOT enable clinical use. TOTALSEG_CLINICAL_APPROVED must be explicitly
set to "true", only after a medical director approves the pending
`ai_model_change_log` proposal for component "imaging-triage-totalsegmentator".
Until then, `available()` always returns False and the engine falls through
to the next backend, exactly as if TotalSegmentator were not installed.

Uses the 'fast' (3mm) model deliberately — the full-resolution (1.5mm) model
is far larger and slower; 'fast' is the appropriate choice for a screening/
triage context, not final diagnostic-resolution segmentation.

Confidence caveat (read before trusting this number): TotalSegmentator's
simple Python API returns hard segmentation labels only, no per-voxel
softmax probabilities. `confidence_score` here is therefore a coverage-based
heuristic (how many of the major organs this model typically finds were
actually found), NOT a true model probability like the MONAI/TorchXRayVision
backends report. It is deliberately capped lower to reflect that.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import numpy as np

CLINICAL_USE_APPROVED = (
    os.getenv("TOTALSEG_CLINICAL_APPROVED", "false").strip().lower() == "true"
)

# Task 297 in TotalSegmentator's registry — the 'total', fast/3mm model.
_FAST_TASK_DIR_NAME = "Dataset297_TotalSegmentator_total_3mm_1559subj"

# Rough expected count of major organs the fast/3mm 'total' model reliably
# segments in a typical torso CT — used only for the confidence heuristic
# above, not a hard contract with the model's actual class list (117 classes).
_MAJOR_ORGAN_COUNT_FOR_CONFIDENCE = 20

_CLASS_NAMES: dict[int, str] | None = None


def _weights_dir() -> Path:
    from totalsegmentator.config import get_weights_dir

    return Path(get_weights_dir())


def is_downloaded(modality: str) -> bool:
    """Weights-on-disk check, independent of clinical approval — mirrors
    monai_unet.is_downloaded() so /models/status can distinguish
    'downloaded, awaiting governance approval' from 'not downloaded'."""
    if modality.upper() != "CT":
        return False
    try:
        return (_weights_dir() / _FAST_TASK_DIR_NAME).is_dir()
    except Exception:
        return False


def available(modality: str) -> bool:
    """True only when: totalsegmentator is importable, the fast/3mm task
    weights are downloaded, AND a medical director has approved clinical
    use. Only CT is supported here."""
    if modality.upper() != "CT":
        return False
    try:
        import totalsegmentator  # noqa: F401
    except ImportError:
        return False
    if not CLINICAL_USE_APPROVED:
        return False
    return is_downloaded(modality)


def _class_names() -> dict[int, str]:
    global _CLASS_NAMES
    if _CLASS_NAMES is None:
        from totalsegmentator.map_to_binary import class_map

        _CLASS_NAMES = class_map["total"]
    return _CLASS_NAMES


def infer_segmentation(
    hu_array: np.ndarray,
    modality: str,
    pixel_spacing: list[float] | None = None,
    slice_spacing_mm: float | None = None,
) -> dict[str, Any] | None:
    """Runs real TotalSegmentator inference (fast/3mm model, CPU). Only ever
    reached by engine.py after available() has already gated on clinical
    approval — this function does not re-check the flag itself, matching the
    convention in monai_unet.py / torchxray_cxr.py."""
    if modality.upper() != "CT":
        return None
    if hu_array.ndim < 3 or hu_array.shape[0] < 2:
        # Not a real volume — this is a 3D whole-body model and cannot
        # produce a meaningful result from a single slice.
        return None

    import nibabel as nib
    from totalsegmentator.python_api import totalsegmentator

    row_mm, col_mm = (
        (pixel_spacing[0], pixel_spacing[1]) if pixel_spacing and len(pixel_spacing) == 2 else (1.0, 1.0)
    )
    z_mm = slice_spacing_mm if slice_spacing_mm else 1.0
    affine = np.diag([row_mm, col_mm, z_mm, 1.0])

    # hu_array is (z, y, x) per dicom_pixels.dicom_series_to_hu_volume;
    # nibabel/TotalSegmentator convention is (x, y, z) — transpose to match.
    vol = np.transpose(hu_array.astype(np.float32), (2, 1, 0))
    img = nib.Nifti1Image(vol, affine)

    seg = totalsegmentator(img, output=None, fast=True, device="cpu", quiet=True, ml=True)
    seg_data = seg.get_fdata()

    labels = _class_names()
    voxel_volume_mm3 = row_mm * col_mm * z_mm

    findings = []
    measurements = []
    present_label_ids = [int(v) for v in np.unique(seg_data) if v != 0]
    for label_id in present_label_ids:
        organ_voxels = int((seg_data == label_id).sum())
        if organ_voxels < 20:
            continue  # noise-level detections, not worth reporting
        organ_name = labels.get(label_id, f"label_{label_id}")
        findings.append({
            "label": f"Segmented: {organ_name.replace('_', ' ')}",
            "severity": "info",
            "note": (
                f"TotalSegmentator identified {organ_name.replace('_', ' ')} "
                f"({organ_voxels} voxels, ~{round(organ_voxels * voxel_volume_mm3):,} mm³, "
                "spacing approximated). Whole-body organ segmentation, unvalidated "
                "technical proof-of-concept — not a diagnostic finding, correlate on OHIF."
            ),
            "present": True,
            "location": organ_name,
        })
        measurements.append({
            "lesion": organ_name,
            "location": organ_name,
            "volume_mm3": round(organ_voxels * voxel_volume_mm3, 1),
        })

    # See module docstring: coverage-based heuristic, NOT a per-voxel
    # probability (this API returns hard labels only). Deliberately capped
    # lower than the MONAI/TorchXRayVision backends' genuine softmax-derived
    # confidence.
    organs_found = len(findings)
    confidence = (
        round(min(0.6, 0.15 + 0.45 * (organs_found / _MAJOR_ORGAN_COUNT_FOR_CONFIDENCE)), 4)
        if findings
        else 0.1
    )

    return {
        "findings": findings,
        "measurements": measurements,
        "critical": False,
        "confidence_score": confidence,
        "model_version": "totalsegmentator-total-fast-3mm-v2.17.0",
        "inference_backend": "totalsegmentator",
        "feature_attributions": [
            {"feature": f["location"], "attribution": confidence, "direction": "positive"} for f in findings
        ],
    }
