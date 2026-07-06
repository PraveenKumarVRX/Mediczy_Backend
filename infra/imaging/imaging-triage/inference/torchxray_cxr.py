"""Chest X-ray pathology screening — TorchXRayVision DenseNet (NIH + RSNA weights)."""
from __future__ import annotations

from typing import Any

import numpy as np

_MODEL = None
_PATHOLOGY_THRESHOLDS = {
    "Pneumonia": 0.55,
    "Pneumothorax": 0.45,
    "Effusion": 0.50,
    "Cardiomegaly": 0.50,
    "Mass": 0.55,
    "Nodule": 0.55,
    "Consolidation": 0.50,
    "Atelectasis": 0.50,
    "Edema": 0.50,
}
_DEFAULT_THRESHOLD = 0.55
_CRITICAL_LABELS = {"pneumothorax", "effusion", "pneumonia", "consolidation", "edema"}


def _load_model():
    global _MODEL
    if _MODEL is not None:
        return _MODEL
    import torch
    import torchxrayvision as xrv

    model = xrv.models.DenseNet(weights="nih-rsna")
    model.eval()
    _MODEL = (model, xrv)
    return _MODEL


def available() -> bool:
    try:
        import torchxrayvision  # noqa: F401
        return True
    except ImportError:
        return False


def infer_cxr(display_uint8: np.ndarray) -> dict[str, Any]:
    import torch

    model, xrv = _load_model()
    img = display_uint8.astype(np.float32)
    if img.ndim > 2:
        img = img[..., 0]
    img = xrv.datasets.normalize(img, maxval=255)
    tensor = torch.from_numpy(img).unsqueeze(0).unsqueeze(0)
    with torch.no_grad():
        preds = model(tensor)[0].cpu().numpy()

    pathologies = list(model.pathologies)
    findings = []
    scores: list[float] = []
    critical = False

    for i, name in enumerate(pathologies):
        prob = float(preds[i])
        threshold = _PATHOLOGY_THRESHOLDS.get(name, _DEFAULT_THRESHOLD)
        if prob >= threshold:
            severity = "high" if prob >= 0.75 else "medium" if prob >= 0.6 else "low"
            if name.lower() in _CRITICAL_LABELS and prob >= 0.5:
                critical = True
                severity = "high"
            findings.append({
                "label": name,
                "severity": severity,
                "note": f"Model screening probability {prob:.0%} — radiologist review required.",
                "present": True,
                "location": "chest",
                "confidence": prob,
            })
            scores.append(prob)

    confidence = float(np.mean(scores)) if scores else 0.35
    attributions = [
        {"feature": f["label"], "attribution": f.get("confidence", 0.5), "direction": "positive"}
        for f in findings
    ]

    return {
        "findings": findings,
        "measurements": [],
        "critical": critical,
        "confidence_score": round(min(0.95, confidence), 4),
        "model_version": "torchxrayvision-densenet121-nih-rsna-v1",
        "inference_backend": "torchxrayvision",
        "feature_attributions": attributions,
    }
