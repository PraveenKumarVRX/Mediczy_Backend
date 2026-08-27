"""MONAI multimodal brain tumor segmentation (BraTS) — real, but stacked with
more approximations than any other backend in this service. Read the whole
docstring before trusting output from this module.

IMPORTANT — governance gate (see CLAUDE.md "SaMD Governance"):
Weights being present on disk is NOT sufficient to use this backend for real
patient studies. A medical director must approve the pending
`ai_model_change_log` proposal for component `imaging-triage-mri-brats-tumor`
and the deployment must set MRI_BRATS_TUMOR_CLINICAL_APPROVED=true before
`available()` will ever return True.

Bundle: MONAI Model Zoo's `brats_mri_segmentation` (SegResNet, trained on the
BraTS challenge dataset). Real, working, downloadable — mean validation Dice
0.85 (whole tumor), 0.86 (tumor core), 0.79 (enhancing tumor) ON ITS OWN
BraTS VALIDATION SET, under BraTS's own standard preprocessing. None of that
performance is a claim about accuracy on Mediczy's data, which differs from
that preprocessing in every way that matters:

1. MISSING T1c (post-contrast T1). The bundle requires 4 channels in the
   fixed order [T1c, T1, T2, FLAIR]. Neither real patient tested against this
   adapter had a post-contrast series acquired at all (no gadolinium given).
   T1c is substituted with a duplicate of the plain T1 volume. This is a
   documented "missing modality" workaround sometimes used in the literature,
   NOT validated for this specific bundle, and it directly degrades exactly
   the channel most responsible for the bundle's "enhancing tumor" (ET)
   output — enhancement is a contrast-uptake phenomenon that a non-contrast
   image cannot show. Treat any ET output from this pipeline as unreliable
   by construction, not just "unvalidated" — the input signal it depends on
   isn't present.
2. NO REAL SKULL-STRIPPING. BraTS training data is brain-extracted (skull,
   scalp, eyes, neck tissue removed) before the model ever sees it. This
   integration approximates that with classical thresholding (Otsu on T1 +
   largest connected component + hole-filling), not a validated
   deep-learning skull-stripper. Residual non-brain tissue in the mask, or
   brain tissue incorrectly excluded, both push the input further outside
   the model's trained distribution in ways that are hard to predict.
3. APPROXIMATE REGISTRATION. T2 and FLAIR are rigidly registered onto the T1
   grid with SimpleITK (Mattes mutual information, versor rigid transform) —
   a real registration, but rigid-only (no deformable/non-linear step), and
   never independently verified against ground truth for these studies.
   Patient motion between sequences, or genuine anatomical differences
   between sequence acquisitions, are not modeled.
4. DOWNSAMPLED for CPU tractability, same reasoning as mri_unest_adapter.py
   — the bundle's native roi (240x240x160) x4 input channels would not fit
   this deployment's 15GB RAM even before considering headroom for other
   processes.

Four independent, stacked, real-but-imperfect approximations. Whole-tumor
(WT) output is the least affected (T1+T2+FLAIR all genuinely present and
registered); tumor-core (TC) is moderately affected; enhancing-tumor (ET) is
the most compromised, since its defining signal (contrast enhancement) was
never acquired. This module labels every finding with which approximations
touched it — read those labels, not just the headline number.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import numpy as np

from inference.abstention import classify_state

MODEL_WEIGHTS_DIR = Path(os.getenv("MODEL_WEIGHTS_DIR", "/app/models"))

BRATS_BUNDLE_NAME = os.getenv("MRI_BRATS_BUNDLE_NAME", "brats_mri_segmentation")
BRATS_BUNDLE_DIR = MODEL_WEIGHTS_DIR / BRATS_BUNDLE_NAME
BRATS_BUNDLE_VERSION_FILE = BRATS_BUNDLE_DIR / "configs" / "metadata.json"

# Hardcoded, not env-configurable — see mri_unest_adapter.py's
# CAPABILITY_STATUS comment for why: this bundle's four stacked
# approximations (missing T1c, classical skull-strip, rigid-only
# registration, heavy downsampling) mean an env var alone must never be
# able to promote it to clinical use. Promotion requires a code change.
CAPABILITY_STATUS = "RESEARCH_ONLY"  # one of: RESEARCH_ONLY, SILENT_VALIDATION, CLINICAL

# Structural fact about brats_mri_segmentation, independent of governance
# state: it was trained and validated to segment brain tumor subregions
# only. Used to distinguish "a real model exists for this anatomy but is
# governance-locked" from "no model applies to this body region at all" —
# two different abstention reasons a caller needs to tell apart.
APPLICABLE_BODY_REGIONS = ("BRAIN",)

CLINICAL_USE_APPROVED = (
    os.getenv("MRI_BRATS_TUMOR_CLINICAL_APPROVED", "false").strip().lower() == "true"
)

# Native bundle roi_size is [240, 240, 160] x 4 channels — OOM territory on
# this deployment's 15GB RAM at that resolution (see mri_unest_adapter.py's
# _INFERENCE_SIZE comment for the same tradeoff at a smaller scale). This
# model needs 4 input channels simultaneously, so the size is cut further
# than the single-channel whole-brain model.
_INFERENCE_SIZE = (64, 128, 128)
_OUTPUT_CHANNELS = {0: "tumor_core", 1: "whole_tumor", 2: "enhancing_tumor"}

_MODELS: dict[str, Any] = {}


def _bundle_files_present() -> bool:
    return (BRATS_BUNDLE_DIR / "configs" / "inference.json").is_file() and (
        BRATS_BUNDLE_DIR / "models" / "model.pt"
    ).is_file()


def is_downloaded(modality: str) -> bool:
    if modality.upper() not in ("MR", "MRI"):
        return False
    return _bundle_files_present()


def available(modality: str) -> bool:
    """CAPABILITY_STATUS must be "CLINICAL" (hardcoded, no env override)
    AND CLINICAL_USE_APPROVED must be set — both required."""
    if CAPABILITY_STATUS != "CLINICAL":
        return False
    if modality.upper() not in ("MR", "MRI"):
        return False
    try:
        import monai  # noqa: F401
        import SimpleITK  # noqa: F401
    except ImportError:
        return False
    if not CLINICAL_USE_APPROVED:
        return False
    return _bundle_files_present()


def _bundle_model_version() -> str:
    try:
        import json

        meta = json.loads(BRATS_BUNDLE_VERSION_FILE.read_text())
        return f"monai-bundle-{BRATS_BUNDLE_NAME}-v{meta.get('version', 'unknown')}"
    except Exception:
        return f"monai-bundle-{BRATS_BUNDLE_NAME}-vunknown"


def _load_bundle():
    if "BRATS" in _MODELS:
        return _MODELS["BRATS"]

    import torch
    from monai.networks.nets import SegResNet

    net = SegResNet(
        blocks_down=[1, 2, 2, 4], blocks_up=[1, 1, 1],
        init_filters=16, in_channels=4, out_channels=3, dropout_prob=0.2,
    )
    weights_path = BRATS_BUNDLE_DIR / "models" / "model.pt"
    state = torch.load(weights_path, map_location="cpu", weights_only=True)
    net.load_state_dict(state)
    net.eval()
    _MODELS["BRATS"] = net
    return net


def _to_sitk(volume: np.ndarray, pixel_spacing: list[float] | None, slice_spacing_mm: float | None):
    import SimpleITK as sitk

    img = sitk.GetImageFromArray(volume.astype(np.float32))
    row_mm, col_mm = (pixel_spacing[0], pixel_spacing[1]) if pixel_spacing and len(pixel_spacing) == 2 else (1.0, 1.0)
    z_mm = slice_spacing_mm if slice_spacing_mm else 1.0
    img.SetSpacing((col_mm, row_mm, z_mm))
    return img


def _skull_strip_mask(t1_img):
    """Classical-CV brain-extraction approximation: Otsu threshold, keep the
    largest connected foreground component, fill interior holes. Not a
    validated skull-stripper (e.g. HD-BET) — see module docstring point 2."""
    import SimpleITK as sitk

    otsu = sitk.OtsuThreshold(t1_img, 0, 1, 200)
    components = sitk.ConnectedComponent(otsu)
    relabeled = sitk.RelabelComponent(components, sortByObjectSize=True)
    largest = relabeled == 1
    filled = sitk.BinaryFillhole(largest)
    return sitk.BinaryDilate(filled, [2, 2, 2])


def _register_to_t1(moving_img, t1_img):
    """Rigid registration (Mattes mutual information) of a same-patient,
    different-sequence MRI volume onto the T1 reference frame. Real
    registration, not a copy — but rigid-only, unvalidated against ground
    truth for these studies. See module docstring point 3."""
    import SimpleITK as sitk

    moving_f = sitk.Cast(moving_img, sitk.sitkFloat32)
    fixed_f = sitk.Cast(t1_img, sitk.sitkFloat32)

    initial_transform = sitk.CenteredTransformInitializer(
        fixed_f, moving_f, sitk.Euler3DTransform(), sitk.CenteredTransformInitializerFilter.GEOMETRY,
    )
    reg = sitk.ImageRegistrationMethod()
    reg.SetMetricAsMattesMutualInformation(numberOfHistogramBins=32)
    reg.SetMetricSamplingStrategy(reg.RANDOM)
    # Fixed seed — found by running the exact same real patient through this
    # pipeline twice and getting different tumor-segmentation results (55
    # flagged voxels vs. 0) purely from unseeded random sampling here. The
    # underlying signal is marginal enough that registration noise alone
    # flips the outcome; a fixed seed makes results reproducible run-to-run,
    # it does not make them more accurate — that's a separate, real
    # limitation documented in this module's docstring.
    reg.SetMetricSamplingPercentage(0.2, seed=42)
    reg.SetInterpolator(sitk.sitkLinear)
    reg.SetOptimizerAsRegularStepGradientDescent(
        learningRate=1.0, minStep=1e-4, numberOfIterations=100,
    )
    reg.SetInitialTransform(initial_transform, inPlace=False)
    reg.SetShrinkFactorsPerLevel([4, 2, 1])
    reg.SetSmoothingSigmasPerLevel([2, 1, 0])

    final_transform = reg.Execute(fixed_f, moving_f)
    resampled = sitk.Resample(
        moving_f, fixed_f, final_transform, sitk.sitkLinear, 0.0, moving_f.GetPixelID(),
    )
    return resampled


def build_multichannel_input(
    t1_volume: np.ndarray, t1_spacing, t1_zspacing,
    t2_volume: np.ndarray, t2_spacing, t2_zspacing,
    flair_volume: np.ndarray, flair_spacing, flair_zspacing,
) -> dict[str, Any] | None:
    """Skull-strips T1, registers T2/FLAIR onto the T1 grid, applies the same
    brain mask to all three, and stacks [T1(as T1c substitute), T1, T2,
    FLAIR] — the exact channel order the bundle expects. Returns None on any
    registration/processing failure rather than guessing. This is the
    function where docstring points 1-3 actually happen; point 4
    (downsampling) happens later in infer_segmentation."""
    import SimpleITK as sitk

    try:
        t1_img = _to_sitk(t1_volume, t1_spacing, t1_zspacing)
        t2_img = _to_sitk(t2_volume, t2_spacing, t2_zspacing)
        flair_img = _to_sitk(flair_volume, flair_spacing, flair_zspacing)

        brain_mask = _skull_strip_mask(t1_img)
        t2_reg = _register_to_t1(t2_img, t1_img)
        flair_reg = _register_to_t1(flair_img, t1_img)

        mask_arr = sitk.GetArrayFromImage(brain_mask).astype(bool)
        t1_arr = sitk.GetArrayFromImage(t1_img) * mask_arr
        t2_arr = sitk.GetArrayFromImage(t2_reg) * mask_arr
        flair_arr = sitk.GetArrayFromImage(flair_reg) * mask_arr

        brain_voxel_fraction = float(mask_arr.mean())
        return {
            # Channel order per bundle metadata.json channel_def: 0=T1c,1=T1,2=T2,3=FLAIR
            "channels": np.stack([t1_arr, t1_arr, t2_arr, flair_arr], axis=0),
            "brain_voxel_fraction": brain_voxel_fraction,
            # T1's own grid is the reference frame everything else was
            # registered onto — needed downstream to convert segmented
            # voxel counts into real mm³, the same way mri_unest_adapter.py
            # does. Without this, measurements silently had no volume_mm3
            # at all (see infer_segmentation's voxel_count_downsampled_grid
            # comment for the bug this was found alongside).
            "native_shape": t1_volume.shape,
            "t1_spacing": t1_spacing,
            "t1_zspacing": t1_zspacing,
        }
    except Exception:
        return None


def infer_segmentation(multichannel: dict[str, Any]) -> dict[str, Any] | None:
    """Runs real bundle inference on a pre-built 4-channel volume from
    build_multichannel_input(). Only ever reached by engine.py after
    `available()` has already gated on clinical approval."""
    channels = multichannel.get("channels")
    if channels is None or channels.ndim != 4 or channels.shape[0] != 4:
        return None

    import torch
    from monai.inferers import sliding_window_inference
    from monai.transforms import NormalizeIntensity, Resize

    # Effective voxel volume at the downsampled inference grid, same
    # reasoning as mri_unest_adapter.py's _INFERENCE_SIZE comment — a voxel
    # here covers more physical space than one at native T1 resolution.
    native_shape = multichannel.get("native_shape") or channels.shape[1:]
    t1_spacing = multichannel.get("t1_spacing")
    t1_zspacing = multichannel.get("t1_zspacing")
    row_mm, col_mm = (t1_spacing[0], t1_spacing[1]) if t1_spacing and len(t1_spacing) == 2 else (1.0, 1.0)
    z_mm = t1_zspacing if t1_zspacing else 1.0
    eff_voxel_volume_mm3 = (
        z_mm * (native_shape[0] / _INFERENCE_SIZE[0])
        * row_mm * (native_shape[1] / _INFERENCE_SIZE[1])
        * col_mm * (native_shape[2] / _INFERENCE_SIZE[2])
    )

    resize = Resize(spatial_size=_INFERENCE_SIZE, mode="trilinear")
    normalize = NormalizeIntensity(nonzero=True, channel_wise=True)

    tensor = torch.from_numpy(channels.astype(np.float32))
    tensor = resize(tensor)
    tensor = normalize(tensor)
    tensor = tensor.unsqueeze(0).float()  # add batch dim -> (1, 4, D, H, W)

    net = _load_bundle()
    with torch.no_grad():
        logits = sliding_window_inference(
            tensor, roi_size=_INFERENCE_SIZE, sw_batch_size=1, overlap=0.5, predictor=net,
        )
        probs = torch.sigmoid(logits)  # BraTS heads are independent binary masks, not softmax classes

    masks = (probs[0] > 0.5).cpu().numpy()  # (3, D, H, W)
    voxel_counts = {name: int(masks[idx].sum()) for idx, name in _OUTPUT_CHANNELS.items()}
    confidences = {
        name: round(float(probs[0, idx][masks[idx]].mean()), 4) if voxel_counts[name] > 0 else 0.0
        for idx, name in _OUTPUT_CHANNELS.items()
    }

    findings = []
    measurements = []
    any_positive = any(v > 0 for v in voxel_counts.values())
    limitation_note = (
        "Missing post-contrast T1 (no T1c series acquired) — T1 was duplicated in its place, which "
        "directly degrades the enhancing-tumor channel since enhancement is a contrast-uptake signal "
        "this input cannot show. Skull-stripping is a classical-CV approximation, not a validated "
        "brain extractor. T2/FLAIR were rigidly registered onto the T1 grid (not deformably), unverified "
        "against ground truth for this study. Research-grade bundle, unvalidated for clinical use."
    )

    if any_positive:
        wt = voxel_counts["whole_tumor"]
        tc = voxel_counts["tumor_core"]
        et = voxel_counts["enhancing_tumor"]
        findings.append({
            "label": "Possible tumor region flagged by segmentation model",
            "severity": "medium",
            "note": (
                f"BraTS-trained SegResNet flagged whole-tumor voxels={wt} (confidence {confidences['whole_tumor']}), "
                f"tumor-core voxels={tc} (confidence {confidences['tumor_core']}), "
                f"enhancing-tumor voxels={et} (confidence {confidences['enhancing_tumor']}, "
                f"LOW RELIABILITY — no contrast series was available). {limitation_note}"
            ),
            "present": True,
            "location": "brain",
        })
        for idx, name in _OUTPUT_CHANNELS.items():
            count = voxel_counts[name]
            if count > 0:
                # kind="lesion" — this genuinely is a pathology-detector
                # output (tumor subregion), unlike the whole-brain model's
                # anatomical structures. volume_mm3, not a raw voxel count —
                # the API schema has no voxel-count field, so the raw count
                # was previously silently dropped on the way out; found
                # while fixing the "lesion" terminology on this same line.
                #
                # enhancing_tumor is structurally unreliable regardless of
                # its numeric confidence: it's a contrast-uptake signal and
                # this pipeline has no T1c series (T1 was duplicated in its
                # place) — capped at UNCERTAIN even if the number looks high.
                state_info = classify_state(
                    confidence=confidences[name],
                    is_present=True,
                    structurally_unreliable=(name == "enhancing_tumor"),
                    structurally_unreliable_reason=(
                        "Enhancing-tumor signal requires a post-contrast T1c series; none was "
                        "available, T1 was duplicated in its place"
                    ) if name == "enhancing_tumor" else None,
                )
                # Bounding box computed directly from this subregion's own
                # thresholded mask (masks[idx]) — real, not fabricated. This
                # is item 9/QA-3's spatial-evidence capture: min/max voxel
                # indices on the downsampled inference grid, not a full
                # attention/heatmap ground-truth (that's a materially
                # different, unbuilt claim — see module docstring caveats).
                zs, ys, xs = np.where(masks[idx])
                measurements.append({
                    "structure": f"segmented_{name}", "kind": "lesion", "location": "brain",
                    "volume_mm3": round(count * eff_voxel_volume_mm3, 1),
                    "confidence": state_info["confidence"],
                    "state": state_info["state"],
                    "state_reason": state_info["reason"],
                    "bounding_box_voxel": {
                        "z_min": int(zs.min()), "z_max": int(zs.max()),
                        "y_min": int(ys.min()), "y_max": int(ys.max()),
                        "x_min": int(xs.min()), "x_max": int(xs.max()),
                    },
                })
    else:
        findings.append({
            "label": "No tumor region flagged by segmentation model",
            "severity": "info",
            "note": (
                f"BraTS-trained SegResNet did not flag any whole-tumor/tumor-core/enhancing-tumor voxels "
                f"above threshold. This is a real model output, not an omission — but given the stacked "
                f"approximations in this pipeline, absence of a flagged region is weaker evidence of "
                f"absence of pathology than the bundle's own 0.85-0.90 Dice would suggest on properly "
                f"preprocessed BraTS-distribution data. {limitation_note}"
            ),
            "present": False,
            "location": "brain",
        })
        # Every subregion still gets a real NEGATIVE-state measurement — the
        # absence of a measurement would be ambiguous (not checked vs.
        # checked-and-negative). confidences[name] is 0.0 here by construction
        # (voxel_counts[name] == 0 for all three), which classify_state reads
        # as "thresholded, no signal" rather than treating 0.0 as low-confidence-positive.
        for name in _OUTPUT_CHANNELS.values():
            state_info = classify_state(confidence=confidences[name], is_present=False)
            measurements.append({
                "structure": f"segmented_{name}", "kind": "lesion", "location": "brain",
                "volume_mm3": 0.0,
                "confidence": state_info["confidence"],
                "state": state_info["state"],
                "state_reason": state_info["reason"],
            })

    overall_confidence = round(min(0.95, max(0.05, np.mean(list(confidences.values())) if any_positive else 0.3)), 4)

    return {
        "findings": findings,
        "measurements": measurements,
        "critical": False,
        "confidence_score": overall_confidence,
        "model_version": _bundle_model_version(),
        "inference_backend": "monai-brats-segresnet",
        "feature_attributions": [
            {"feature": f"{name}_mask", "attribution": confidences[name], "direction": "positive"}
            for name in _OUTPUT_CHANNELS.values() if voxel_counts.get(name, 0) > 0
        ],
    }
