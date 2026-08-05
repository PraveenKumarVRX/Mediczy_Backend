"""MONAI Model Zoo 'breast_density_classification' — BI-RADS breast density
classification (categories A-D) from mammography, InceptionV3-based
(TorchVisionFCModel wrapper, fine-tuned 4-class head).

This is the mammography item from the reference "best mix of models"
architecture — a real, verifiable, single-image classification bundle, not
a segmentation/detection task like the CT backends in this same package.

Same governance gate pattern as the other backends: weights being present
on disk does NOT enable clinical use. BREAST_DENSITY_CLINICAL_APPROVED must
be explicitly set to "true", only after a medical director approves the
pending `ai_model_change_log` proposal for component
"imaging-triage-breast-density".

BI-RADS density category is itself informational (it affects screening
recommendations, e.g. supplemental ultrasound for dense breasts) — it is
NOT a lesion/malignancy finding. Framed here strictly as a density
classification, not a cancer-detection claim.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import numpy as np

MODEL_WEIGHTS_DIR = Path(os.getenv("MODEL_WEIGHTS_DIR", "/app/models"))
BUNDLE_NAME = os.getenv("MONAI_BREAST_DENSITY_BUNDLE_NAME", "breast_density_classification")
BUNDLE_DIR = MODEL_WEIGHTS_DIR / BUNDLE_NAME

CLINICAL_USE_APPROVED = (
    os.getenv("BREAST_DENSITY_CLINICAL_APPROVED", "false").strip().lower() == "true"
)

CLASS_NAMES = {0: "A", 1: "B", 2: "C", 3: "D"}
CLASS_DESCRIPTIONS = {
    "A": "almost entirely fatty",
    "B": "scattered areas of fibroglandular density",
    "C": "heterogeneously dense",
    "D": "extremely dense",
}

_MODELS: dict[str, Any] = {}


def _bundle_files_present() -> bool:
    return (BUNDLE_DIR / "configs" / "inference.json").is_file() and (BUNDLE_DIR / "models" / "model.pt").is_file()


def is_downloaded(modality: str) -> bool:
    if modality.upper() not in ("MG", "MAMMOGRAM", "MAMMOGRAPHY"):
        return False
    return _bundle_files_present()


def available(modality: str) -> bool:
    if modality.upper() not in ("MG", "MAMMOGRAM", "MAMMOGRAPHY"):
        return False
    try:
        import monai  # noqa: F401
    except ImportError:
        return False
    if not CLINICAL_USE_APPROVED:
        return False
    return _bundle_files_present()


def _load_model():
    if "net" in _MODELS:
        return _MODELS["net"]

    import torch
    from monai.bundle import ConfigParser

    parser = ConfigParser()
    parser.read_config(str(BUNDLE_DIR / "configs" / "inference.json"))
    parser["bundle_root"] = str(BUNDLE_DIR)
    # The bundle's config sets pretrained=true, which would also trigger an
    # unrelated ImageNet-weights download from torchvision before the real
    # fine-tuned state_dict gets loaded on top — pointless extra network
    # dependency in production. The fine-tuned checkpoint below fully
    # determines the weights either way.
    parser["network_def"]["pretrained"] = False

    net = parser.get_parsed_content("network_def")
    state = torch.load(BUNDLE_DIR / "models" / "model.pt", map_location="cpu", weights_only=True)
    net.load_state_dict(state)
    net.eval()
    _MODELS["net"] = net
    return net


def infer_classification(hu_array: np.ndarray, modality: str) -> dict[str, Any] | None:
    """Runs real bundle inference on a single 2D mammogram image. Only ever
    reached by engine.py after available() has already gated on clinical
    approval, matching the convention across every backend in this package."""
    if modality.upper() not in ("MG", "MAMMOGRAM", "MAMMOGRAPHY"):
        return None
    if hu_array.ndim != 2:
        return None  # this bundle is single-image, not volumetric

    import torch

    net = _load_model()

    arr = hu_array.astype(np.float32)
    lo, hi = np.percentile(arr, 1), np.percentile(arr, 99)
    arr = np.clip(arr, lo, hi)
    arr = (arr - lo) / max(hi - lo, 1e-6)  # [0, 1], matches bundle's ScaleIntensityd

    from monai.transforms import Resize

    resized = Resize(spatial_size=(299, 299))(arr[np.newaxis, ...])  # (1, 299, 299)
    rgb = np.repeat(resized, 3, axis=0)  # single-channel mammogram replicated to 3ch, matches num_channels=3
    tensor = torch.from_numpy(rgb).unsqueeze(0).float()

    with torch.no_grad():
        logits = net(tensor)
        probs = torch.softmax(logits, dim=1)[0]

    class_idx = int(probs.argmax().item())
    category = CLASS_NAMES[class_idx]
    confidence = round(float(probs[class_idx].item()), 4)

    findings = [{
        "label": f"BI-RADS breast density category {category}",
        "severity": "info",
        "note": (
            f"InceptionV3 density classifier: category {category} "
            f"({CLASS_DESCRIPTIONS[category]}), p={confidence:.3f}. "
            "Density classification only — NOT a lesion or malignancy finding. "
            "Unvalidated technical proof-of-concept — confirm clinically."
        ),
        "present": True,
        "location": "breast",
    }]

    return {
        "findings": findings,
        "measurements": [],
        "critical": False,
        "confidence_score": confidence,
        "model_version": "monai-bundle-breast_density_classification-v1",
        "inference_backend": "monai-inceptionv3-breast-density",
        "feature_attributions": [
            {"feature": f"birads_category_{category}", "attribution": confidence, "direction": "positive"}
        ],
    }
