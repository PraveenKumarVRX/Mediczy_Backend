"""MONAI CT segmentation — loads a real MONAI Model Zoo bundle from disk.

IMPORTANT — governance gate (see CLAUDE.md "SaMD Governance"):
Weights being present on disk is NOT sufficient to use this backend for real
patient studies. Model changes must never be applied autonomously; a medical
director must approve the pending `ai_model_change_log` proposal for
component `imaging-triage-monai-ct-unet` and the deployment must set
MONAI_CT_UNET_CLINICAL_APPROVED=true before `available()` will ever return
True. Until then, the engine falls through to the next backend / heuristic,
exactly as if no weights existed at all.

Bundle substitution note: the original placeholder filename this module
replaced was "ct_lung_nodule_unet.pt" implying lung nodule detection. This
integration instead wires in MONAI Model Zoo's `spleen_ct_segmentation`
bundle — a real, working, well-documented 3D segmentation bundle used here
as a genuine technical proof that bundle-based loading, spacing-aware
preprocessing, and volumetric inference work correctly end to end. It is
NOT a lung nodule detector. Lung nodule *detection* is a different task
(bounding-box detection, e.g. a RetinaNet-style bundle) requiring different
post-processing and a separate medical-director-led model selection —
tracked as a follow-up, not implemented here.

MRI is intentionally not wired: single-sequence MRI segmentation bundles in
the public Model Zoo are far less standardized than for CT (many require
multi-sequence input — T1/T1ce/T2/FLAIR — that a single incoming MRI series
cannot provide), so `available("MRI")` always returns False until a medical
director selects an appropriate bundle.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import numpy as np

MODEL_WEIGHTS_DIR = Path(os.getenv("MODEL_WEIGHTS_DIR", "/app/models"))

CT_BUNDLE_NAME = os.getenv("MONAI_CT_BUNDLE_NAME", "spleen_ct_segmentation")
CT_BUNDLE_DIR = MODEL_WEIGHTS_DIR / CT_BUNDLE_NAME
CT_BUNDLE_VERSION_FILE = CT_BUNDLE_DIR / "configs" / "metadata.json"

# Hard safety gate — see module docstring. Defaults to false in every
# environment; must be explicitly and deliberately set after governance
# approval, never bundled into a default config.
CLINICAL_USE_APPROVED = (
    os.getenv("MONAI_CT_UNET_CLINICAL_APPROVED", "false").strip().lower() == "true"
)

_MODELS: dict[str, Any] = {}


def _ct_bundle_files_present() -> bool:
    return (CT_BUNDLE_DIR / "configs" / "inference.json").is_file() and (
        (CT_BUNDLE_DIR / "models" / "model.pt").is_file()
        or (CT_BUNDLE_DIR / "models" / "model.ts").is_file()
    )


def is_downloaded(modality: str) -> bool:
    """Weights-on-disk check, independent of clinical approval. Used by
    /models/status and the download helper so operators can distinguish
    'downloaded, awaiting governance approval' from 'not downloaded'."""
    if modality.upper() != "CT":
        return False
    return _ct_bundle_files_present()


def available(modality: str) -> bool:
    """True only when: monai is importable, the real bundle is downloaded,
    AND a medical director has approved clinical use. MRI always returns
    False (not wired — see module docstring)."""
    if modality.upper() != "CT":
        return False
    try:
        import monai  # noqa: F401
    except ImportError:
        return False
    if not CLINICAL_USE_APPROVED:
        return False
    return _ct_bundle_files_present()


def _bundle_model_version() -> str:
    try:
        import json

        meta = json.loads(CT_BUNDLE_VERSION_FILE.read_text())
        return f"monai-bundle-{CT_BUNDLE_NAME}-v{meta.get('version', 'unknown')}"
    except Exception:
        return f"monai-bundle-{CT_BUNDLE_NAME}-vunknown"


def _load_ct_bundle():
    if "CT" in _MODELS:
        return _MODELS["CT"]

    import torch
    from monai.bundle import ConfigParser

    config_path = CT_BUNDLE_DIR / "configs" / "inference.json"
    parser = ConfigParser()
    parser.read_config(str(config_path))
    parser["bundle_root"] = str(CT_BUNDLE_DIR)

    # Build the network from the bundle's own config — never hand-guess the
    # architecture. A mismatched hand-built UNet silently loads garbage
    # weights via a shape-compatible-but-wrong state_dict, which is worse
    # than failing loudly.
    net = parser.get_parsed_content("network_def")
    weights_path = CT_BUNDLE_DIR / "models" / "model.pt"
    state = torch.load(weights_path, map_location="cpu", weights_only=True)
    net.load_state_dict(state)
    net.eval()

    roi_size = (96, 96, 96)  # matches configs/metadata.json network_data_format.inputs.image.spatial_shape
    _MODELS["CT"] = (net, roi_size)
    return _MODELS["CT"]


def _preprocess(hu_volume: np.ndarray, pixel_spacing: list[float] | None, slice_spacing_mm: float | None):
    """Applies the clinically-relevant subset of the bundle's own
    preprocessing (intensity windowing, orientation-independent spacing
    resample) to an in-memory HU volume. Deliberately does not replay the
    bundle's full LoadImaged-based pipeline, which assumes loading from a
    file path with full DICOM affine metadata — Orthanc-sourced volumes here
    only carry approximate in-plane PixelSpacing + a derived slice spacing
    (see dicom_pixels.dicom_series_to_hu_volume), not a full orientation
    matrix. This is a known, documented approximation: results should be
    treated as directionally indicative, not spatially exact, until a
    medical director's validation confirms it is acceptable for the target
    use case."""
    import torch
    from monai.transforms import Compose, EnsureChannelFirst, ScaleIntensityRange, Spacing

    vol = hu_volume.astype(np.float32)
    if vol.ndim == 2:
        vol = vol[np.newaxis, ...]

    row_mm, col_mm = (pixel_spacing[0], pixel_spacing[1]) if pixel_spacing and len(pixel_spacing) == 2 else (1.0, 1.0)
    z_mm = slice_spacing_mm if slice_spacing_mm else 1.0

    transforms = [
        EnsureChannelFirst(channel_dim="no_channel"),
        Spacing(pixdim=(row_mm, col_mm, z_mm), mode="bilinear"),
        # a_min/a_max match the bundle's own configs/inference.json ScaleIntensityRanged
        ScaleIntensityRange(a_min=-57, a_max=164, b_min=0, b_max=1, clip=True),
    ]
    tensor = torch.from_numpy(vol)
    for t in transforms:
        tensor = t(tensor)
    return tensor.unsqueeze(0).float()  # add batch dim


def infer_segmentation(
    hu_array: np.ndarray,
    modality: str,
    pixel_spacing: list[float] | None = None,
    slice_spacing_mm: float | None = None,
) -> dict[str, Any] | None:
    """Runs real bundle inference. Only ever reached by engine.py after
    `available()` has already gated on clinical approval (this function does
    not re-check the flag itself, matching the existing convention in
    torchxray_cxr.py / nnunet_adapter.py, where the gate lives in
    `available()` and callers are trusted to check it first)."""
    if modality.upper() != "CT":
        return None
    if hu_array.ndim < 3 or hu_array.shape[0] < 2:
        # Not a real volume (e.g. a single 2D slice slipped through) — this
        # bundle is a 3D patch-based model and cannot produce a meaningful
        # result from one slice. Decline rather than run on invalid input.
        return None

    import torch
    from monai.inferers import sliding_window_inference

    net, roi_size = _load_ct_bundle()
    tensor = _preprocess(hu_array, pixel_spacing, slice_spacing_mm)

    with torch.no_grad():
        logits = sliding_window_inference(tensor, roi_size=roi_size, sw_batch_size=1, predictor=net)
        probs = torch.softmax(logits, dim=1)

    pred = probs.argmax(dim=1)[0]  # (D, H, W)
    mask = (pred > 0).cpu().numpy()
    voxel_count = int(mask.sum())

    # Confidence is genuinely derived from the model's own softmax output —
    # never a hardcoded literal (mirrors the torchxray_cxr.py convention).
    fg_probs = probs[0, 1][pred > 0]
    if voxel_count > 0:
        confidence = float(fg_probs.mean().item())
    else:
        confidence = float(1.0 - probs[0, 1].mean().item())
    confidence = round(min(0.95, max(0.05, confidence)), 4)

    row_mm, col_mm = (pixel_spacing[0], pixel_spacing[1]) if pixel_spacing and len(pixel_spacing) == 2 else (1.0, 1.0)
    z_mm = slice_spacing_mm if slice_spacing_mm else 1.0
    voxel_volume_mm3 = row_mm * col_mm * z_mm

    findings = []
    measurements = []
    if voxel_count > 50:
        findings.append({
            "label": "Segmented organ region (spleen)",
            "severity": "info",
            "note": (
                f"Spleen segmentation bundle flagged a {voxel_count}-voxel region "
                f"(~{round(voxel_count * voxel_volume_mm3):,} mm³, spacing approximated). "
                "This is a technical proof-of-concept output from an unvalidated pretrained "
                "model, not a validated diagnostic finding — correlate on OHIF and confirm clinically."
            ),
            "present": True,
            "location": "abdomen",
        })
        measurements.append({
            # kind="structure" — organ segmentation, not a pathology finding.
            "structure": "segmented_spleen_region",
            "kind": "structure",
            "location": "abdomen",
            "volume_mm3": round(voxel_count * voxel_volume_mm3, 1),
        })

    return {
        "findings": findings,
        "measurements": measurements,
        "critical": False,
        "confidence_score": confidence,
        "model_version": _bundle_model_version(),
        "inference_backend": "monai-unet",
        "feature_attributions": [
            {"feature": "segmentation_mask", "attribution": confidence, "direction": "positive"}
        ] if findings else [],
    }
