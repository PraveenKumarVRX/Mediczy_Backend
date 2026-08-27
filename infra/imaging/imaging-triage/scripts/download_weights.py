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
    sys.path.insert(0, str(ROOT))
    monai_ct_downloaded = False
    monai_ct_clinically_approved = False
    try:
        from inference import monai_unet

        monai_ct_downloaded = monai_unet.is_downloaded("CT")
        monai_ct_clinically_approved = monai_unet.available("CT")
    except ImportError:
        pass

    totalseg_downloaded = False
    totalseg_clinically_approved = False
    try:
        from inference import totalsegmentator_adapter

        totalseg_downloaded = totalsegmentator_adapter.is_downloaded("CT")
        totalseg_clinically_approved = totalsegmentator_adapter.available("CT")
    except ImportError:
        pass

    nodule_downloaded = False
    nodule_clinically_approved = False
    try:
        from inference import lung_nodule_detection

        nodule_downloaded = lung_nodule_detection.is_downloaded("CT")
        nodule_clinically_approved = lung_nodule_detection.available("CT")
    except ImportError:
        pass

    breast_downloaded = False
    breast_clinically_approved = False
    try:
        from inference import breast_density_classifier

        breast_downloaded = breast_density_classifier.is_downloaded("MG")
        breast_clinically_approved = breast_density_classifier.available("MG")
    except ImportError:
        pass

    mri_unest_downloaded = False
    mri_unest_clinically_approved = False
    try:
        from inference import mri_unest_adapter

        mri_unest_downloaded = mri_unest_adapter.is_downloaded("MR")
        mri_unest_clinically_approved = mri_unest_adapter.available("MR")
    except ImportError:
        pass

    mri_brats_downloaded = False
    mri_brats_clinically_approved = False
    try:
        from inference import mri_brats_adapter

        mri_brats_downloaded = mri_brats_adapter.is_downloaded("MR")
        mri_brats_clinically_approved = mri_brats_adapter.available("MR")
    except ImportError:
        pass

    status = {
        "models_dir": str(MODELS_DIR),
        "registry": REGISTRY.is_file(),
        "monai_ct_bundle_downloaded": monai_ct_downloaded,
        "monai_ct_clinically_approved_for_use": monai_ct_clinically_approved,
        "mri_unest_brain_downloaded": mri_unest_downloaded,
        "mri_unest_brain_clinically_approved_for_use": mri_unest_clinically_approved,
        "mri_brats_tumor_downloaded": mri_brats_downloaded,
        "mri_brats_tumor_clinically_approved_for_use": mri_brats_clinically_approved,
        "totalsegmentator_ct_downloaded": totalseg_downloaded,
        "totalsegmentator_ct_clinically_approved_for_use": totalseg_clinically_approved,
        "lung_nodule_detection_ct_downloaded": nodule_downloaded,
        "lung_nodule_detection_ct_clinically_approved_for_use": nodule_clinically_approved,
        "breast_density_mg_downloaded": breast_downloaded,
        "breast_density_mg_clinically_approved_for_use": breast_clinically_approved,
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
    try:
        import totalsegmentator  # noqa: F401
        status["totalsegmentator_installed"] = True
    except ImportError:
        status["totalsegmentator_installed"] = False
    return status


def warmup_torchxray() -> None:
    import numpy as np
    from inference.torchxray_cxr import infer_cxr

    dummy = np.zeros((224, 224), dtype=np.uint8)
    infer_cxr(dummy)
    print("TorchXRayVision DenseNet warmed up (weights cached).")


def download_monai_ct_bundle() -> None:
    """Downloads the real MONAI Model Zoo 'spleen_ct_segmentation' bundle.
    This ONLY fetches weights to disk — it does not enable clinical use.
    See models/README.md and inference/monai_unet.py for the governance
    gate (MONAI_CT_UNET_CLINICAL_APPROVED) that must be set separately,
    only after medical director approval."""
    from monai.bundle import download

    bundle_name = os.getenv("MONAI_CT_BUNDLE_NAME", "spleen_ct_segmentation")
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Downloading MONAI Model Zoo bundle '{bundle_name}' to {MODELS_DIR} ...")
    download(name=bundle_name, bundle_dir=str(MODELS_DIR))
    print(
        f"Downloaded. NOT yet enabled for clinical use — set "
        f"MONAI_CT_UNET_CLINICAL_APPROVED=true only after medical director "
        f"approval of the pending governance change."
    )


def warmup_totalsegmentator() -> None:
    """Pre-downloads TotalSegmentator's fast/3mm 'total' task weights.
    This ONLY fetches weights to disk — it does not enable clinical use.
    See models/README.md and inference/totalsegmentator_adapter.py for the
    governance gate (TOTALSEG_CLINICAL_APPROVED) that must be set
    separately, only after medical director approval."""
    import nibabel as nib
    import numpy as np
    from totalsegmentator.python_api import totalsegmentator

    dummy = np.zeros((10, 10, 10), dtype=np.float32)
    img = nib.Nifti1Image(dummy, np.eye(4))
    totalsegmentator(img, output=None, fast=True, device="cpu", quiet=True, ml=True)
    print(
        "TotalSegmentator fast/3mm weights downloaded and cached. NOT yet "
        "enabled for clinical use — set TOTALSEG_CLINICAL_APPROVED=true only "
        "after medical director approval of the pending governance change."
    )


def download_monai_lung_nodule_bundle() -> None:
    """Downloads the real MONAI Model Zoo 'lung_nodule_ct_detection' bundle.
    Weights only — does not enable clinical use. See
    LUNG_NODULE_DETECTION_CLINICAL_APPROVED in
    inference/lung_nodule_detection.py."""
    from monai.bundle import download

    bundle_name = os.getenv("MONAI_LUNG_NODULE_BUNDLE_NAME", "lung_nodule_ct_detection")
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Downloading MONAI Model Zoo bundle '{bundle_name}' to {MODELS_DIR} ...")
    download(name=bundle_name, bundle_dir=str(MODELS_DIR))
    print(
        "Downloaded. NOT yet enabled for clinical use — set "
        "LUNG_NODULE_DETECTION_CLINICAL_APPROVED=true only after medical "
        "director approval of the pending governance change."
    )


def download_monai_mri_unest_bundle() -> None:
    """Downloads the real MONAI Model Zoo 'wholeBrainSeg_Large_UNEST_segmentation'
    bundle (whole-brain T1 MRI segmentation). Weights only — does not enable
    clinical use. See MRI_UNEST_BRAIN_CLINICAL_APPROVED in
    inference/mri_unest_adapter.py."""
    from monai.bundle import download

    bundle_name = os.getenv("MRI_UNEST_BUNDLE_NAME", "wholeBrainSeg_Large_UNEST_segmentation")
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Downloading MONAI Model Zoo bundle '{bundle_name}' to {MODELS_DIR} ...")
    download(name=bundle_name, bundle_dir=str(MODELS_DIR))
    print(
        "Downloaded. NOT yet enabled for clinical use — set "
        "MRI_UNEST_BRAIN_CLINICAL_APPROVED=true only after medical director "
        "approval of the pending governance change."
    )


def download_monai_brats_tumor_bundle() -> None:
    """Downloads the real MONAI Model Zoo 'brats_mri_segmentation' bundle
    (multimodal brain tumor subregion segmentation). Weights only — does not
    enable clinical use. See MRI_BRATS_TUMOR_CLINICAL_APPROVED in
    inference/mri_brats_adapter.py — read that module's docstring before
    approving; this backend runs on a stack of real but imperfect
    approximations (missing T1c, classical skull-stripping, rigid-only
    registration), not just a governance-pending real model."""
    from monai.bundle import download

    bundle_name = os.getenv("MRI_BRATS_BUNDLE_NAME", "brats_mri_segmentation")
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Downloading MONAI Model Zoo bundle '{bundle_name}' to {MODELS_DIR} ...")
    download(name=bundle_name, bundle_dir=str(MODELS_DIR))
    print(
        "Downloaded. NOT yet enabled for clinical use — set "
        "MRI_BRATS_TUMOR_CLINICAL_APPROVED=true only after medical director "
        "approval of the pending governance change."
    )


def download_monai_breast_density_bundle() -> None:
    """Downloads the real MONAI Model Zoo 'breast_density_classification'
    bundle. Weights only — does not enable clinical use. See
    BREAST_DENSITY_CLINICAL_APPROVED in
    inference/breast_density_classifier.py."""
    from monai.bundle import download

    bundle_name = os.getenv("MONAI_BREAST_DENSITY_BUNDLE_NAME", "breast_density_classification")
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Downloading MONAI Model Zoo bundle '{bundle_name}' to {MODELS_DIR} ...")
    download(name=bundle_name, bundle_dir=str(MODELS_DIR))
    print(
        "Downloaded. NOT yet enabled for clinical use — set "
        "BREAST_DENSITY_CLINICAL_APPROVED=true only after medical director "
        "approval of the pending governance change."
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Imaging CV weights helper")
    parser.add_argument("--check", action="store_true", help="Print weight availability")
    parser.add_argument("--warmup-torchxray", action="store_true", help="Pre-download TorchXRayVision weights")
    parser.add_argument(
        "--download-monai-ct-bundle",
        action="store_true",
        help="Download the real MONAI Model Zoo CT segmentation bundle (weights only — does not enable clinical use)",
    )
    parser.add_argument(
        "--warmup-totalsegmentator",
        action="store_true",
        help="Pre-download TotalSegmentator's fast/3mm weights (weights only — does not enable clinical use)",
    )
    parser.add_argument(
        "--download-monai-lung-nodule-bundle",
        action="store_true",
        help="Download the real MONAI Model Zoo lung nodule detection bundle (weights only — does not enable clinical use)",
    )
    parser.add_argument(
        "--download-monai-breast-density-bundle",
        action="store_true",
        help="Download the real MONAI Model Zoo breast density classification bundle (weights only — does not enable clinical use)",
    )
    parser.add_argument(
        "--download-monai-mri-unest-bundle",
        action="store_true",
        help="Download the real MONAI Model Zoo whole-brain MRI segmentation bundle (weights only — does not enable clinical use)",
    )
    parser.add_argument(
        "--download-monai-brats-tumor-bundle",
        action="store_true",
        help="Download the real MONAI Model Zoo BraTS brain tumor segmentation bundle (weights only — does not enable clinical use)",
    )
    args = parser.parse_args()

    sys.path.insert(0, str(ROOT))

    any_action = any([
        args.warmup_torchxray,
        args.download_monai_ct_bundle,
        args.warmup_totalsegmentator,
        args.download_monai_lung_nodule_bundle,
        args.download_monai_breast_density_bundle,
        args.download_monai_mri_unest_bundle,
        args.download_monai_brats_tumor_bundle,
    ])
    if args.check or not any_action:
        status = check_weights()
        print(json.dumps(status, indent=2))

    if args.warmup_torchxray:
        warmup_torchxray()

    if args.download_monai_ct_bundle:
        download_monai_ct_bundle()

    if args.warmup_totalsegmentator:
        warmup_totalsegmentator()

    if args.download_monai_lung_nodule_bundle:
        download_monai_lung_nodule_bundle()

    if args.download_monai_breast_density_bundle:
        download_monai_breast_density_bundle()

    if args.download_monai_mri_unest_bundle:
        download_monai_mri_unest_bundle()

    if args.download_monai_brats_tumor_bundle:
        download_monai_brats_tumor_bundle()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
