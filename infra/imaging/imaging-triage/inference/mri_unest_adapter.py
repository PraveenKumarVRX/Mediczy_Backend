"""MONAI whole-brain MRI segmentation — loads a real MONAI Model Zoo bundle from disk.

IMPORTANT — governance gate (see CLAUDE.md "SaMD Governance"):
Weights being present on disk is NOT sufficient to use this backend for real
patient studies. A medical director must approve the pending
`ai_model_change_log` proposal for component `imaging-triage-mri-unest-brain`
and the deployment must set MRI_UNEST_BRAIN_CLINICAL_APPROVED=true before
`available()` will ever return True. Until then, the engine falls through to
the metadata-only heuristic, exactly as if no weights existed at all.

Bundle: MONAI Model Zoo's `wholeBrainSeg_Large_UNEST_segmentation` (Vanderbilt
University + MONAI team) — a transformer-based (UNesT) 3D segmentation model
identifying 133 distinct brain structures from a single T1-weighted MRI
series. Real, working, downloadable bundle; NOT a disease/abnormality
detector. Its own metadata.json says outright: "This is an example, not to be
used for diagnostic purposes." This integration preserves that boundary —
it reports which structures the model segmented and their volumes as a
technical/anatomical review, the same honesty pattern already used for the
CT spleen-segmentation proof-of-concept (monai_unet.py). It does NOT claim to
detect tumors, hemorrhage, hydrocephalus, or any other pathology; interpreting
segmented volumes as evidence of a specific condition is a separate,
unvalidated step this module deliberately does not take.

Single-sequence input only (T1W) — this is what makes the bundle tractable to
wire up at all: a real incoming MRI study typically has many series (T1, T2,
FLAIR, DWI, post-contrast, localizers...) and this integration does not
attempt to identify or align all of them. See `_pick_t1_series` in engine.py's
caller for how the single T1-like series is chosen — a heuristic on
SeriesDescription, not a validated sequence classifier, and it can pick the
wrong series on an unfamiliar naming convention. That is a known limitation,
not a resolved one.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import numpy as np

from inference.abstention import classify_state

MODEL_WEIGHTS_DIR = Path(os.getenv("MODEL_WEIGHTS_DIR", "/app/models"))

MRI_BUNDLE_NAME = os.getenv("MRI_UNEST_BUNDLE_NAME", "wholeBrainSeg_Large_UNEST_segmentation")
MRI_BUNDLE_DIR = MODEL_WEIGHTS_DIR / MRI_BUNDLE_NAME
MRI_BUNDLE_VERSION_FILE = MRI_BUNDLE_DIR / "configs" / "metadata.json"

# CAPABILITY_STATUS is a hardcoded constant, not read from any environment
# variable — by design. This bundle's own metadata.json says outright "not
# to be used for diagnostic purposes"; an env var toggled at deploy time
# must never be able to override that, since a config change (accidental or
# not) would then be sufficient to promote a research model to clinical use
# with no code review. Promotion to "CLINICAL" requires an actual commit
# changing this line — i.e. a PR, not a runtime flag — after real
# validation, not just governance sign-off on the current bilateral-only
# screening capability.
CAPABILITY_STATUS = "RESEARCH_ONLY"  # one of: RESEARCH_ONLY, SILENT_VALIDATION, CLINICAL

# Structural fact about wholeBrainSeg_Large_UNEST_segmentation, independent
# of governance state: it segments 133 whole-brain structures and was never
# trained or validated for any other body region. Used to distinguish "a
# real model exists for this anatomy but is governance-locked" from "no
# model applies to this body region at all" — two different abstention
# reasons a caller needs to tell apart.
APPLICABLE_BODY_REGIONS = ("BRAIN",)

# Governance approval (medical director sign-off) is still required on top
# of CAPABILITY_STATUS == "CLINICAL" — this flag alone can never enable
# clinical use by itself, only gate it further once the code-level status
# allows it at all.
CLINICAL_USE_APPROVED = (
    os.getenv("MRI_UNEST_BRAIN_CLINICAL_APPROVED", "false").strip().lower() == "true"
)

_MODELS: dict[str, Any] = {}

# Only these two indices have a confidently-known anatomical name: the
# FreeSurfer aseg lookup table convention (a real, widely-used standard
# across neuroimaging tools, NOT something this bundle's own docs confirm
# using) reserves 4/43 for left/right lateral ventricle, and this pipeline's
# own output is consistent with that (physically sane volumes on real
# patients). The bundle ships no label-name lookup table for its other 131
# classes — see _pair_bilateral_structures below for how the rest are
# screened WITHOUT needing to know their names: geometric bilateral
# comparison instead of a guessed name-to-index mapping, which would risk
# real mislabeling.
_NAMED_LABELS = {
    4: "left lateral ventricle",
    43: "right lateral ventricle",
}

# Minimum voxel count (on the downsampled _INFERENCE_SIZE grid) for a
# structure to be treated as real rather than downsampling/partial-volume
# noise. Below this a handful of stray voxels isn't a meaningful measurement.
_MIN_STRUCTURE_VOXELS = 15
# A left/right match this dissimilar in size+position is treated as no
# match at all — better to report two unpaired structures than force a
# comparison between things that likely aren't the same anatomy. Tightened
# from an initial 1.2 after testing showed it let structures with 10-70x
# volume differences "match" — see the size_ratio hard cutoff in
# _pair_bilateral_structures for the other half of this fix.
_MAX_PAIR_MATCH_COST = 0.5
# Bilateral-asymmetry threshold shared with ai-quality-gates.service.js's
# _gatePairedAsymmetry (kept in sync manually — both flag ratio >= 2.0).
_ASYMMETRY_RATIO_THRESHOLD = 2.0


def _compute_structures(pred_np: np.ndarray, min_voxels: int = _MIN_STRUCTURE_VOXELS) -> dict[int, dict]:
    """For every label present with at least min_voxels voxels, compute
    voxel count and centroid in (z, y, x) array-index space."""
    unique_labels, counts = np.unique(pred_np, return_counts=True)
    out = {}
    for lbl, cnt in zip(unique_labels, counts):
        lbl = int(lbl)
        if lbl == 0 or cnt < min_voxels:
            continue
        zs, ys, xs = np.nonzero(pred_np == lbl)
        out[lbl] = {"voxel_count": int(cnt), "centroid": (float(zs.mean()), float(ys.mean()), float(xs.mean()))}
    return out


def _pair_bilateral_structures(
    structures: dict[int, dict], z_extent: int, y_extent: int, x_extent: int,
) -> tuple[list[dict], list[int]]:
    """Splits segmented structures into two sides by each one's own centroid
    x-position (midline approximated as the inference grid's x-midpoint —
    NOT a verified anatomical midline plane), then greedily matches each
    side-A structure to the side-B structure with the most similar volume
    and mirrored centroid position. Purely geometric — this never claims to
    know either structure's anatomical name, only that they are plausibly
    contralateral counterparts of each other. That's enough to do real
    left/right symmetry screening across the whole segmented volume without
    needing a label-name lookup table this bundle doesn't provide.

    CAVEAT, read before trusting "left"/"right" in output: side assignment
    follows the raw array's x-axis ordering as produced by
    dicom_series_to_hu_volume, which has NOT been cross-checked against the
    source DICOM's ImageOrientationPatient/ImagePositionPatient to confirm
    it matches true anatomical left/right. An unusual acquisition
    orientation could have this backwards. The ratio-based asymmetry
    finding is trustworthy regardless (a 6x difference between two sides is
    a 6x difference whichever side is labeled which); which side carries
    the label "left" vs "right" is the part that isn't independently
    verified."""
    midline_x = x_extent / 2.0
    midline_tolerance = x_extent * 0.06

    side_a, side_b, midline_ids = [], [], []
    for lbl, info in structures.items():
        cx = info["centroid"][2]
        if abs(cx - midline_x) <= midline_tolerance:
            midline_ids.append(lbl)
        elif cx < midline_x:
            side_a.append(lbl)
        else:
            side_b.append(lbl)

    # Sort candidate pairs by cost globally (not greedy-per-a in arbitrary
    # dict order) so the single best match in the whole pool is claimed
    # first — greedy-by-a-order let an early, mediocre match block a much
    # better later one from ever being considered for either structure.
    candidates = []
    for a in side_a:
        a_info = structures[a]
        for b in side_b:
            b_info = structures[b]
            vol_diff = abs(a_info["voxel_count"] - b_info["voxel_count"]) / max(a_info["voxel_count"], b_info["voxel_count"])
            mirrored_bx = 2 * midline_x - b_info["centroid"][2]
            # Each axis normalized by its OWN extent, not all three lumped
            # over x_extent alone — a real bug found by testing: z/y
            # differences on a much larger extent than x were being
            # under-weighted, letting spatially-distant structures match.
            pos_diff = (
                abs(a_info["centroid"][0] - b_info["centroid"][0]) / max(z_extent, 1)
                + abs(a_info["centroid"][1] - b_info["centroid"][1]) / max(y_extent, 1)
                + abs(a_info["centroid"][2] - mirrored_bx) / max(x_extent, 1)
            ) / 3.0
            cost = vol_diff + pos_diff
            # Reject on sight, not just by threshold on the summed cost: a
            # candidate pair whose volumes differ by more than 3x is
            # essentially never the same anatomical structure appearing
            # twice — real bilateral brain structures don't legitimately
            # differ that much, so a "match" this size-mismatched is almost
            # certainly two unrelated structures, not evidence of pathology.
            # Found by testing: without this, the algorithm reported
            # "asymmetric pairs" up to 70x, which is anatomically absurd —
            # a matching artifact, not a finding.
            size_ratio = max(a_info["voxel_count"], b_info["voxel_count"]) / max(min(a_info["voxel_count"], b_info["voxel_count"]), 1)
            if size_ratio > 3.0:
                continue
            if cost < _MAX_PAIR_MATCH_COST:
                candidates.append((cost, a, b))

    candidates.sort(key=lambda c: c[0])
    matched_a, matched_b = set(), set()
    pairs = []
    for cost, a, b in candidates:
        if a in matched_a or b in matched_b:
            continue
        pairs.append({"left": a, "right": b, "match_cost": round(cost, 3)})
        matched_a.add(a)
        matched_b.add(b)

    paired_ids = matched_a | matched_b
    unpaired_ids = [lbl for lbl in structures if lbl not in paired_ids]
    return pairs, unpaired_ids


def _bundle_files_present() -> bool:
    return (MRI_BUNDLE_DIR / "configs" / "inference.json").is_file() and (
        MRI_BUNDLE_DIR / "models" / "model.pt"
    ).is_file()


def is_downloaded(modality: str) -> bool:
    """Weights-on-disk check, independent of clinical approval."""
    if modality.upper() not in ("MR", "MRI"):
        return False
    return _bundle_files_present()


def available(modality: str) -> bool:
    """True only when: CAPABILITY_STATUS is "CLINICAL" (a hardcoded
    constant — see its definition; no env var can change it), monai is
    importable, the real bundle is downloaded, AND a medical director has
    separately approved clinical use via CLINICAL_USE_APPROVED. All four
    conditions are required; any one of them missing means False."""
    if CAPABILITY_STATUS != "CLINICAL":
        return False
    if modality.upper() not in ("MR", "MRI"):
        return False
    try:
        import monai  # noqa: F401
    except ImportError:
        return False
    if not CLINICAL_USE_APPROVED:
        return False
    return _bundle_files_present()


def _bundle_model_version() -> str:
    try:
        import json

        meta = json.loads(MRI_BUNDLE_VERSION_FILE.read_text())
        return f"monai-bundle-{MRI_BUNDLE_NAME}-v{meta.get('version', 'unknown')}"
    except Exception:
        return f"monai-bundle-{MRI_BUNDLE_NAME}-vunknown"


def _load_bundle():
    if "MRI" in _MODELS:
        return _MODELS["MRI"]

    import sys

    import torch
    from monai.bundle import ConfigParser

    # The bundle's network_def references scripts.networks.unest_base_patch_4,
    # a module shipped inside the bundle itself — must be importable.
    if str(MRI_BUNDLE_DIR) not in sys.path:
        sys.path.insert(0, str(MRI_BUNDLE_DIR))

    config_path = MRI_BUNDLE_DIR / "configs" / "inference.json"
    parser = ConfigParser()
    parser.read_config(str(config_path))
    parser["bundle_root"] = str(MRI_BUNDLE_DIR)

    net = parser.get_parsed_content("network_def")
    weights_path = MRI_BUNDLE_DIR / "models" / "model.pt"
    state = torch.load(weights_path, map_location="cpu", weights_only=True)
    # This bundle's checkpoint is saved as {"model": state_dict}, not a bare
    # state_dict — unlike the CT spleen bundle. Confirmed by inspecting the
    # actual file, not assumed from the CT adapter's pattern.
    if isinstance(state, dict) and "model" in state and "state_dict" not in state:
        state = state["model"]
    elif isinstance(state, dict) and "state_dict" in state:
        state = state["state_dict"]
    net.load_state_dict(state)
    net.eval()

    roi_size = (96, 96, 96)  # matches configs/metadata.json network_data_format
    _MODELS["MRI"] = (net, roi_size)
    return _MODELS["MRI"]


# Target spatial size fed to the model, distinct from the bundle's native
# resolution. A first attempt at full native resolution (25x512x512 for a
# real patient study here) sliding-window-inferred across this bundle's 133
# output channels was OOM-killed twice on this box's 15GB RAM — the
# per-voxel 133-channel accumulation buffer alone is ~3.5GB at that
# resolution, before the transformer's own attention memory. Downsampling
# first is a real, CPU-tractability-driven approximation (like the CT
# adapter's reduced sliding-window ROI) — it loses fine anatomical detail,
# not assumed equivalent to running at native resolution, and needs its own
# validation before being treated as clinically representative.
_INFERENCE_SIZE = (64, 160, 160)


def _preprocess(volume: np.ndarray) -> "torch.Tensor":  # noqa: F821
    """Matches the bundle's own configs/inference.json preprocessing:
    channel-first, per-volume nonzero-masked channel-wise normalization
    (zero mean, unit variance) — no HU windowing, since MRI has no fixed
    intensity scale the way CT does. Adds a downsample to _INFERENCE_SIZE
    not present in the bundle's own config — see that constant's comment."""
    import torch
    from monai.transforms import Compose, EnsureChannelFirst, NormalizeIntensity, Resize

    vol = volume.astype(np.float32)
    transforms = [
        EnsureChannelFirst(channel_dim="no_channel"),
        Resize(spatial_size=_INFERENCE_SIZE, mode="trilinear"),
        NormalizeIntensity(nonzero=True, channel_wise=True),
    ]
    tensor = torch.from_numpy(vol)
    for t in transforms:
        tensor = t(tensor)
    return tensor.unsqueeze(0).float()  # add batch dim


def infer_segmentation(
    mri_array: np.ndarray,
    modality: str,
    pixel_spacing: list[float] | None = None,
    slice_spacing_mm: float | None = None,
) -> dict[str, Any] | None:
    """Runs real bundle inference on a single T1-weighted MRI volume. Only
    ever reached by engine.py after `available()` has already gated on
    clinical approval — this function does not re-check the flag itself,
    matching the existing convention in monai_unet.py / torchxray_cxr.py."""
    if modality.upper() not in ("MR", "MRI"):
        return None
    if mri_array.ndim < 3 or mri_array.shape[0] < 2:
        # Not a real volume — this bundle is a 3D patch-based model.
        return None

    import torch
    from monai.inferers import sliding_window_inference

    net, roi_size = _load_bundle()
    native_shape = mri_array.shape  # (z, y, x) before _preprocess resizes it
    tensor = _preprocess(mri_array)

    # Effective voxel size AFTER the downsample in _preprocess — a voxel at
    # _INFERENCE_SIZE covers more physical space than one at native
    # resolution, in proportion to how much each axis was shrunk. Using the
    # native pixel_spacing/slice_spacing directly against segmented-voxel
    # counts here would understate volumes by roughly (native/resized)^3.
    row_mm, col_mm = (pixel_spacing[0], pixel_spacing[1]) if pixel_spacing and len(pixel_spacing) == 2 else (1.0, 1.0)
    z_mm = slice_spacing_mm if slice_spacing_mm else 1.0
    eff_z_mm = z_mm * (native_shape[0] / _INFERENCE_SIZE[0])
    eff_row_mm = row_mm * (native_shape[1] / _INFERENCE_SIZE[1])
    eff_col_mm = col_mm * (native_shape[2] / _INFERENCE_SIZE[2])
    eff_voxel_volume_mm3 = eff_z_mm * eff_row_mm * eff_col_mm

    with torch.no_grad():
        logits = sliding_window_inference(
            tensor, roi_size=roi_size, sw_batch_size=1, overlap=0.5, predictor=net,
        )
        probs = torch.softmax(logits, dim=1)

    pred = probs.argmax(dim=1)[0]  # (D, H, W), values 0..132
    pred_np = pred.cpu().numpy()

    unique_labels, counts = np.unique(pred_np, return_counts=True)
    segmented_labels = {int(lbl): int(cnt) for lbl, cnt in zip(unique_labels, counts) if lbl != 0}
    structures_found = len(segmented_labels)
    total_brain_voxels = int(sum(segmented_labels.values()))

    # Confidence genuinely derived from the model's own softmax output over
    # non-background voxels — never a hardcoded literal.
    non_bg = pred_np != 0
    if non_bg.any():
        fg_probs = probs[0].amax(dim=0).cpu().numpy()[non_bg]
        confidence = float(fg_probs.mean())
    else:
        confidence = 0.05
    confidence = round(min(0.95, max(0.05, confidence)), 4)
    # This bundle produces one confidence value for the whole segmentation
    # run (mean softmax over all non-background voxels) — there is no real
    # per-structure signal to attach instead. Every measurement below gets
    # this shared value with state_reason saying so explicitly, rather than
    # implying a precision the model doesn't actually provide.
    _shared_state = classify_state(confidence=confidence, is_present=True)
    _shared_state["reason"] = (_shared_state["reason"] or "") + (
        " (model-wide confidence, not structure-specific — this bundle has no per-structure signal)"
    )

    findings = []
    measurements = []
    if structures_found > 0:
        # Full-coverage screening: every one of the 133 possible structures
        # with a real (above-noise) voxel count is geometrically paired with
        # its contralateral counterpart (or left unpaired if none matches)
        # and compared for asymmetry — the patient's own opposite-side
        # anatomy as the comparison baseline, since no population-normative
        # reference is available in this pipeline and fabricating one would
        # be exactly the kind of unsupported claim ai-quality-gates.service.js
        # exists to catch.
        structures = _compute_structures(pred_np)
        pairs, unpaired_ids = _pair_bilateral_structures(
            structures, z_extent=pred_np.shape[0], y_extent=pred_np.shape[1], x_extent=pred_np.shape[2],
        )

        asymmetric = []
        for i, p in enumerate(pairs, start=1):
            l_vox, r_vox = structures[p["left"]]["voxel_count"], structures[p["right"]]["voxel_count"]
            l_mm3 = round(l_vox * eff_voxel_volume_mm3, 1)
            r_mm3 = round(r_vox * eff_voxel_volume_mm3, 1)
            ratio = max(l_mm3, r_mm3) / max(min(l_mm3, r_mm3), 0.01)
            if ratio >= _ASYMMETRY_RATIO_THRESHOLD:
                asymmetric.append({
                    "pair_index": i, "left_class": p["left"], "right_class": p["right"],
                    "left_mm3": l_mm3, "right_mm3": r_mm3, "ratio": round(ratio, 1),
                })
                # kind="structure" — this is anatomy, not a pathology
                # finding. A segmented ventricle is not a lesion; calling it
                # one would mislead a report compiler built to treat
                # "lesion" entries as pathology candidates.
                # centroid_voxel is real data already computed by
                # _compute_structures() for bilateral pairing — surfacing it
                # here (not recomputing) is item 9/QA-3's spatial-evidence
                # capture: a claim can now be traced back to a real (z,y,x)
                # voxel location, not just a number with no location at all.
                measurements.append({
                    "structure": f"left_regionpair{i}", "kind": "structure", "location": "brain", "volume_mm3": l_mm3,
                    "confidence": _shared_state["confidence"], "state": _shared_state["state"], "state_reason": _shared_state["reason"],
                    "centroid_voxel": [round(c, 1) for c in structures[p["left"]]["centroid"]],
                })
                measurements.append({
                    "structure": f"right_regionpair{i}", "kind": "structure", "location": "brain", "volume_mm3": r_mm3,
                    "confidence": _shared_state["confidence"], "state": _shared_state["state"], "state_reason": _shared_state["reason"],
                    "centroid_voxel": [round(c, 1) for c in structures[p["right"]]["centroid"]],
                })

        # Known-name structures (currently just the ventricles) always get
        # their own measurement even when not asymmetric — a real, named,
        # trusted pair worth surfacing regardless of the auto-pairing above.
        for label_id, name in _NAMED_LABELS.items():
            voxel_count = segmented_labels.get(label_id, 0)
            if voxel_count > 0:
                structure_key = name.replace(" ", "_")
                if not any(m["structure"].endswith(structure_key) for m in measurements):
                    zs, ys, xs = np.where(pred_np == label_id)
                    measurements.append({
                        "structure": structure_key, "kind": "structure", "location": "brain",
                        "volume_mm3": round(voxel_count * eff_voxel_volume_mm3, 1),
                        "confidence": _shared_state["confidence"], "state": _shared_state["state"], "state_reason": _shared_state["reason"],
                        "centroid_voxel": [round(float(zs.mean()), 1), round(float(ys.mean()), 1), round(float(xs.mean()), 1)],
                    })

        asymmetry_detail = "; ".join(
            f"class {a['left_class']}/{a['right_class']}: {a['left_mm3']} vs {a['right_mm3']} mm³ ({a['ratio']}x)"
            for a in asymmetric
        ) if asymmetric else "none"

        findings.append({
            "label": "Whole-brain structural segmentation — full bilateral screening",
            "severity": "medium" if asymmetric else "info",
            "note": (
                f"UNesT whole-brain segmentation identified {structures_found} of 133 possible structures "
                f"({total_brain_voxels:,} total segmented voxels). Of these, {len(structures)} were above the "
                f"noise threshold for individual measurement; {len(pairs)} were geometrically matched into "
                f"left/right pairs and screened for asymmetry (patient's own contralateral anatomy as the "
                f"comparison baseline — no population-normative reference is used or available), "
                f"{len(unpaired_ids)} had no matching contralateral counterpart (midline structures or "
                f"unmatched). Asymmetric pairs (≥{_ASYMMETRY_RATIO_THRESHOLD}x): {asymmetry_detail}. "
                "Side (left vs right) assignment is geometric from the image array and has not been "
                "cross-checked against DICOM orientation tags — treat the ratio as reliable, the left/right "
                "label on it as unverified. This is a technical proof-of-concept output from an unvalidated "
                "pretrained model (its own model card: 'not to be used for diagnostic purposes'), not a "
                "diagnostic finding — correlate on OHIF and confirm clinically."
            ),
            "present": True,
            "location": "brain",
        })

    return {
        "findings": findings,
        "measurements": measurements,
        "critical": False,
        "confidence_score": confidence,
        "model_version": _bundle_model_version(),
        "inference_backend": "monai-unest-mri",
        "feature_attributions": [
            {"feature": "segmentation_mask", "attribution": confidence, "direction": "positive"}
        ] if findings else [],
    }
