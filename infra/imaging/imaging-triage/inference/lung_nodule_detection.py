"""MONAI Model Zoo 'lung_nodule_ct_detection' — 3D RetinaNet-based lung
nodule detection on CT, trained on LUNA16.

This is genuinely different from the segmentation backends (monai_unet.py,
totalsegmentator_adapter.py): it outputs discrete bounding boxes with
per-box confidence scores, not organ masks. It is the actual answer to the
"lung nodule detection" gap this codebase's original placeholder
(ct_lung_nodule_unet.pt) implied but never correctly implemented — that
placeholder was a segmentation architecture, not a detector, and would
never have produced a "nodule" finding even with correct weights.

Same governance gate pattern as the other backends: weights being present
on disk does NOT enable clinical use. LUNG_NODULE_DETECTION_CLINICAL_APPROVED
must be explicitly set to "true", only after a medical director approves
the pending `ai_model_change_log` proposal for component
"imaging-triage-lung-nodule-detection".

Known simplification (documented, not hidden): box coordinates here are
reported in the input volume's voxel space, not transformed to
patient/world coordinates via the bundle's full AffineBoxToWorldCoordinated
postprocessing step (that step needs the original DICOM affine, which — as
elsewhere in this pipeline — is only approximated from PixelSpacing/
ImagePositionPatient, not a full orientation matrix). Findings report
approximate voxel-space bounding box extents; precise world-coordinate
localization needs the full DICOM affine, tracked as a follow-up.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import numpy as np

MODEL_WEIGHTS_DIR = Path(os.getenv("MODEL_WEIGHTS_DIR", "/app/models"))
BUNDLE_NAME = os.getenv("MONAI_LUNG_NODULE_BUNDLE_NAME", "lung_nodule_ct_detection")
BUNDLE_DIR = MODEL_WEIGHTS_DIR / BUNDLE_NAME

CLINICAL_USE_APPROVED = (
    os.getenv("LUNG_NODULE_DETECTION_CLINICAL_APPROVED", "false").strip().lower() == "true"
)

# Official bundle defaults from configs/inference.json's detector_ops —
# reproduced exactly rather than re-guessed, since these thresholds directly
# affect sensitivity/specificity.
_SCORE_THRESH = 0.02
_NMS_THRESH = 0.22
_TOPK_PER_LEVEL = 1000
_DETECTIONS_PER_IMG = 300

# Smaller than the bundle's own default (512, 512, 192) — that patch size
# is tuned for full-resolution LUNA16 volumes and is very slow on CPU. Using
# a smaller sliding-window ROI trades some accuracy for CPU tractability;
# this is exactly the kind of tuning decision that needs medical-director/
# performance validation before clinical use, not something to silently
# treat as equivalent to the bundle's documented configuration.
_INFER_ROI_SIZE = (96, 96, 48)

_MODELS: dict[str, Any] = {}


def _bundle_files_present() -> bool:
    return (BUNDLE_DIR / "configs" / "inference.json").is_file() and (BUNDLE_DIR / "models" / "model.pt").is_file()


def is_downloaded(modality: str) -> bool:
    if modality.upper() != "CT":
        return False
    return _bundle_files_present()


def available(modality: str) -> bool:
    if modality.upper() != "CT":
        return False
    try:
        import monai  # noqa: F401
    except ImportError:
        return False
    if not CLINICAL_USE_APPROVED:
        return False
    return _bundle_files_present()


def _load_detector():
    if "detector" in _MODELS:
        return _MODELS["detector"]

    import torch
    from monai.bundle import ConfigParser

    parser = ConfigParser()
    parser.read_config(str(BUNDLE_DIR / "configs" / "inference.json"))
    parser["bundle_root"] = str(BUNDLE_DIR)
    parser["device"] = "cpu"

    network = parser.get_parsed_content("network_def").to("cpu")
    state = torch.load(BUNDLE_DIR / "models" / "model.pt", map_location="cpu", weights_only=True)
    network.load_state_dict(state)
    network.eval()

    detector = parser.get_parsed_content("detector")
    detector.network = network
    # Reproduces configs/inference.json's detector_ops exactly.
    detector.set_target_keys(box_key="box", label_key="label")
    detector.set_box_selector_parameters(
        score_thresh=_SCORE_THRESH,
        topk_candidates_per_level=_TOPK_PER_LEVEL,
        nms_thresh=_NMS_THRESH,
        detections_per_img=_DETECTIONS_PER_IMG,
    )
    detector.set_sliding_window_inferer(
        roi_size=_INFER_ROI_SIZE, overlap=0.25, sw_batch_size=1, mode="constant", device="cpu"
    )
    detector.eval()

    _MODELS["detector"] = detector
    return detector


def infer_detection(
    hu_array: np.ndarray,
    modality: str,
    pixel_spacing: list[float] | None = None,
    slice_spacing_mm: float | None = None,
) -> dict[str, Any] | None:
    """Runs real bundle detection. Only ever reached by engine.py after
    available() has already gated on clinical approval."""
    if modality.upper() != "CT":
        return None
    if hu_array.ndim < 3 or hu_array.shape[0] < 2:
        return None  # needs a real volume, same rule as the segmentation backends

    import torch

    detector = _load_detector()

    # hu_array is (z, y, x); this bundle's network convention is (x, y, z).
    vol = np.transpose(hu_array.astype(np.float32), (2, 1, 0))
    tensor = torch.from_numpy(vol).unsqueeze(0).unsqueeze(0).float()

    with torch.no_grad():
        results = detector(tensor, use_inferer=True)

    result = results[0] if results else {"box": torch.empty((0, 6)), "label_scores": torch.empty((0,)), "label": torch.empty((0,))}
    boxes = result["box"].cpu().numpy() if hasattr(result["box"], "cpu") else np.asarray(result["box"])
    scores = result["label_scores"].cpu().numpy() if hasattr(result["label_scores"], "cpu") else np.asarray(result["label_scores"])

    row_mm, col_mm = (
        (pixel_spacing[0], pixel_spacing[1]) if pixel_spacing and len(pixel_spacing) == 2 else (1.0, 1.0)
    )
    z_mm = slice_spacing_mm if slice_spacing_mm else 1.0

    findings = []
    measurements = []
    for box, score in zip(boxes, scores):
        x1, y1, z1, x2, y2, z2 = [float(v) for v in box]
        size_mm = (round(abs(x2 - x1) * col_mm, 1), round(abs(y2 - y1) * row_mm, 1), round(abs(z2 - z1) * z_mm, 1))
        findings.append({
            "label": "Candidate pulmonary nodule",
            "severity": "medium" if score >= 0.1 else "low",
            "note": (
                f"RetinaNet detector (LUNA16-trained) flagged a candidate nodule, "
                f"score={score:.3f}, approx size {size_mm[0]}×{size_mm[1]}×{size_mm[2]} mm "
                "(voxel-space bounding box, spacing approximated — not yet transformed to "
                "patient world coordinates). Unvalidated technical proof-of-concept — "
                "correlate on OHIF and confirm clinically."
            ),
            "present": True,
            "location": "lung",
        })
        measurements.append({
            # kind="lesion" — a real pathology detector's output (discrete
            # candidate nodule), unlike organ/structure segmentation.
            "structure": "candidate_nodule", "kind": "lesion",
            "location": "lung",
            "volume_mm3": round(size_mm[0] * size_mm[1] * size_mm[2], 1),
        })

    # Real, per-detection score from the model itself — not a hardcoded
    # constant. Overall confidence is the max candidate score (most
    # confident single detection), consistent with a screening/triage
    # framing rather than averaging across unrelated candidate boxes.
    confidence = round(float(scores.max()), 4) if len(scores) > 0 else 0.05
    confidence = min(0.95, max(0.05, confidence))

    return {
        "findings": findings,
        "measurements": measurements,
        "critical": False,
        "confidence_score": confidence,
        "model_version": "monai-bundle-lung_nodule_ct_detection-luna16-v1",
        "inference_backend": "monai-retinanet-lung-nodule-detection",
        "feature_attributions": [
            {"feature": "candidate_box_score", "attribution": confidence, "direction": "positive"}
        ] if findings else [],
    }
