#!/usr/bin/env python3
"""Prepare CV model weights for imaging-triage (TorchXRayVision warmup + MONAI placeholders)."""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODELS_DIR = Path(os.getenv("MODEL_WEIGHTS_DIR", ROOT / "models"))
REGISTRY = MODELS_DIR / "registry.json"


def check_weights() -> dict:
    status = {
        "models_dir": str(MODELS_DIR),
        "registry": REGISTRY.is_file(),
        "monai_ct": (MODELS_DIR / "ct_lung_nodule_unet.pt").is_file(),
        "monai_mri": (MODELS_DIR / "mri_brain_unet.pt").is_file(),
        "nnunet_folder": bool(os.getenv("NNUNET_MODEL_FOLDER")),
    }
    try:
        import torchxrayvision  # noqa: F401
        status["torchxrayvision_installed"] = True
    except ImportError:
        status["torchxrayvision_installed"] = False
    try:
        import monai  # noqa: F401
        status["monai_installed"] = True
    except ImportError:
        status["monai_installed"] = False
    return status


def warmup_torchxray() -> None:
    import numpy as np
    from inference.torchxray_cxr import infer_cxr

    dummy = np.zeros((224, 224), dtype=np.uint8)
    infer_cxr(dummy)
    print("TorchXRayVision DenseNet warmed up (weights cached).")


def main() -> int:
    parser = argparse.ArgumentParser(description="Imaging CV weights helper")
    parser.add_argument("--check", action="store_true", help="Print weight availability")
    parser.add_argument("--warmup-torchxray", action="store_true", help="Pre-download TorchXRayVision weights")
    args = parser.parse_args()

    sys.path.insert(0, str(ROOT))

    if args.check or not any([args.warmup_torchxray]):
        status = check_weights()
        print(json.dumps(status, indent=2))

    if args.warmup_torchxray:
        warmup_torchxray()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
