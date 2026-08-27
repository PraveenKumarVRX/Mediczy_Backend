"""Inference orchestrator — Orthanc DICOM → MONAI / TorchXRayVision / nnU-Net."""
from __future__ import annotations

from typing import Any

from orthanc_client import (
    fetch_first_instance_dicom,
    fetch_series_instances_dicom,
    fetch_t1_series_instances_dicom,
    fetch_t2_series_instances_dicom,
    fetch_flair_series_instances_dicom,
    fetch_patient_age_years,
    fetch_study_meta,
)
from inference.applicability_gate import STATUS_ABSTAIN, evaluate_mri_brain_applicability
from inference.dicom_pixels import dicom_bytes_to_hu_array, dicom_series_to_hu_volume
from inference.heuristic import infer_heuristic
from inference import (
    breast_density_classifier,
    lung_nodule_detection,
    monai_unet,
    mri_brats_adapter,
    mri_unest_adapter,
    nnunet_adapter,
    torchxray_cxr,
    totalsegmentator_adapter,
)

# Set by _run_mr_inference on every call (including full-abstain ones) so
# run_study_inference can surface *why* MR inference produced nothing, rather
# than silently falling through to heuristic screening with no explanation.
_last_mr_applicability: dict[str, Any] | None = None

# Modalities where a real 3D volume matters (segmentation models need actual
# slice stacks, not one representative slice) — worth the extra Orthanc
# bandwidth/memory only for these.
VOLUMETRIC_MODALITIES = ("CT", "MR", "MRI")


def norm_modality(modality: str) -> str:
    return (modality or "OT").upper().replace("X-RAY", "XR")


def run_study_inference(
    study_uid: str,
    modality: str,
    orthanc_study_id: str | None,
) -> dict[str, Any]:
    meta = fetch_study_meta(study_uid, orthanc_study_id)
    mod = norm_modality(modality)
    if meta and meta.get("modality"):
        mod = norm_modality(str(meta["modality"]).split("\\")[0])
    _pending_applicability = None

    # Was checking monai_unet.available(mod) here — that's the CT spleen
    # adapter, which always returns False for "MR" by design, so this gate
    # unconditionally short-circuited every MRI study regardless of whether
    # a real MRI backend was approved. app.py's own _metadata_only_mri gate
    # already checks mri_unest_adapter.available() before this function is
    # even called, so this function no longer needs a duplicate MR gate at
    # all — if we got here for MR, either the adapter is approved (proceed
    # to real inference below) or app.py wouldn't have called us for MR in
    # the first place.

    if mod in ("MR", "MRI"):
        mr_result = _run_mr_inference(study_uid, orthanc_study_id, body_region=(meta or {}).get("study_description"))
        if mr_result:
            mr_result["orthanc_meta"] = meta
            mr_result["dicom_loaded"] = True
            mr_result["volumetric"] = True
            return mr_result
        global _last_mr_applicability
        _pending_applicability = _last_mr_applicability

    if mod in VOLUMETRIC_MODALITIES:
        series_pack = (
            fetch_t1_series_instances_dicom(study_uid, orthanc_study_id)
            if mod in ("MR", "MRI")
            else fetch_series_instances_dicom(study_uid, orthanc_study_id)
        )
        if series_pack:
            dicom_list, series_meta = series_pack
            volume = dicom_series_to_hu_volume(dicom_list)
            if volume and volume.get("num_slices", 0) >= 2:
                mod = norm_modality(volume.get("modality") or mod)
                pixels = {
                    "hu_array": volume["hu_volume"],
                    "display_array": None,
                    "pixel_spacing": volume.get("pixel_spacing"),
                    "slice_spacing_mm": volume.get("slice_spacing_mm"),
                    "z_spacing_source": volume.get("z_spacing_source"),
                }
                result = _route_pixels(pixels, mod)
                if result:
                    result["orthanc_meta"] = meta
                    result["series_meta"] = series_meta
                    result["dicom_loaded"] = True
                    result["volumetric"] = True
                    result["preprocessing"] = volume.get("preprocessing")
                    if _pending_applicability:
                        result["applicability"] = _pending_applicability
                    return result

    dicom_pack = fetch_first_instance_dicom(study_uid, orthanc_study_id)
    if dicom_pack:
        dicom_bytes, inst_meta = dicom_pack
        pixels = dicom_bytes_to_hu_array(dicom_bytes)
        if pixels:
            mod = norm_modality(pixels.get("modality") or mod)
            result = _route_pixels(pixels, mod)
            if result:
                result["orthanc_meta"] = meta
                result["instance_meta"] = inst_meta
                result["dicom_loaded"] = True
                result["volumetric"] = False
                result["preprocessing"] = pixels.get("preprocessing")
                if _pending_applicability:
                    result["applicability"] = _pending_applicability
                return result

    result = infer_heuristic(mod, meta)
    result["orthanc_meta"] = meta
    result["dicom_loaded"] = False
    result["preprocessing"] = {
        "source": "metadata_only",
        "quality_flags": ["pixel_data_not_loaded"],
    }
    if _pending_applicability:
        result["applicability"] = _pending_applicability
    return result


def _merge_cv_results(results: list[dict[str, Any]]) -> dict[str, Any]:
    """Combines findings/measurements from multiple complementary CV
    backends (e.g. whole-body segmentation + discrete lesion detection)
    into one result, instead of first-match-wins. These backends answer
    genuinely different questions about the same volume (organ boundaries
    vs. discrete candidate lesions) — merging matches how a real multi-
    model orchestration pipeline is meant to work, per the reference
    architecture this was built against, rather than picking just one."""
    if len(results) == 1:
        return results[0]
    merged_findings: list[dict[str, Any]] = []
    merged_measurements: list[dict[str, Any]] = []
    merged_attributions: list[dict[str, Any]] = []
    backends = []
    versions = []
    for r in results:
        merged_findings.extend(r.get("findings", []))
        merged_measurements.extend(r.get("measurements", []))
        merged_attributions.extend(r.get("feature_attributions", []))
        backends.append(r.get("inference_backend", "unknown"))
        versions.append(r.get("model_version", "unknown"))
    return {
        "findings": merged_findings,
        "measurements": merged_measurements,
        "critical": any(r.get("critical") for r in results),
        # Conservative: a multi-model merge is not more certain than its
        # least-confident contributor.
        "confidence_score": round(min(float(r.get("confidence_score", 0.0)) for r in results), 4),
        "model_version": " + ".join(versions),
        "inference_backend": " + ".join(backends),
        "feature_attributions": merged_attributions,
    }


def mr_backend_status(adapter, name: str, body_region: str | None = None) -> dict[str, Any]:
    """Real reason one MR backend did or didn't run this call — so a final
    heuristic-fallback result never has to say just "dicom_loaded: false"
    with no explanation of whether that was a governance lock, an
    applicability abstain, or a genuine fetch failure. Read directly from
    the adapter's own module state, not guessed.

    `anatomy_applicable` is checked BEFORE the governance lock: a neck MRI
    is inapplicable to a brain-only adapter regardless of CAPABILITY_STATUS,
    so it must never be reported as "locked" (which implies the model would
    apply if only it were unlocked). Both are real, independent facts —
    this function now reports which one actually explains why the backend
    didn't run, instead of collapsing both into one governance-shaped
    reason string."""
    capability = getattr(adapter, "CAPABILITY_STATUS", "UNKNOWN")
    clinical_env = getattr(adapter, "CLINICAL_USE_APPROVED", None)
    applicable_regions = getattr(adapter, "APPLICABLE_BODY_REGIONS", None)
    is_available = adapter.available("MR")

    anatomy_applicable = True
    if applicable_regions and body_region:
        anatomy_applicable = body_region.strip().upper() in applicable_regions

    if not anatomy_applicable:
        reason = (
            f"Not applicable to body region '{body_region}' — this backend was only trained/validated "
            f"for {', '.join(applicable_regions)}"
        )
    elif capability != "CLINICAL":
        reason = (
            f"CAPABILITY_STATUS is '{capability}', not 'CLINICAL' — promotion requires an actual "
            f"code change to this constant, it cannot be bypassed by any environment variable"
        )
    elif not is_available:
        reason = f"CAPABILITY_STATUS is 'CLINICAL' but available() still returned False (CLINICAL_USE_APPROVED={clinical_env})"
    else:
        reason = "approved and available"

    return {
        "backend": name,
        "available": is_available,
        "capability_status": capability,
        "anatomy_applicable": anatomy_applicable,
        "reason": reason,
    }


def _run_mr_inference(study_uid: str, orthanc_study_id: str | None, body_region: str | None = None) -> dict[str, Any] | None:
    """MR is structurally different from CT/XR: the two approved backends
    need different inputs (whole-brain segmentation needs one T1 series;
    BraTS tumor segmentation needs three — T1, T2, FLAIR — fetched and
    registered together), so this owns MR routing directly rather than
    going through _route_pixels' single-hu_array signature. Runs whichever
    backends are approved and merges results the same way the CT multi-model
    path does (organ segmentation + discrete lesion detection are
    complementary, not redundant — same reasoning here: structural
    volumetrics + tumor screening answer different questions).

    Runs the applicability gate (inference.applicability_gate) before each
    adapter, not after — an ABSTAIN skips that adapter entirely rather than
    running inference on input it was never checked against."""
    global _last_mr_applicability
    results = []
    debug_meta = {}
    applicability_notes: list[dict[str, Any]] = []
    backend_status = [
        mr_backend_status(mri_brats_adapter, "brats_tumor", body_region=body_region),
        mr_backend_status(mri_unest_adapter, "unest_whole_brain", body_region=body_region),
    ]
    # A backend is only truly runnable when it is BOTH governance-available
    # AND anatomically applicable to this study's body region — available()
    # alone is a pure governance/monai/bundle check, blind to anatomy. A
    # brain-only backend must never attempt inference on a neck study just
    # because CAPABILITY_STATUS happens to be CLINICAL.
    brats_status, unest_status = backend_status
    if not any(b["available"] and b["anatomy_applicable"] for b in backend_status):
        # Stop here — record exactly why (governance lock, anatomy mismatch,
        # or both) rather than spending an Orthanc round-trip fetching
        # patient age data nothing downstream can use. This is the real fix
        # for a heuristic-fallback result that used to say only
        # "dicom_loaded: false" with no explanation of which of those it was.
        _last_mr_applicability = {"age_years": None, "adapters": [], "backend_status": backend_status}
        return None

    age_years = fetch_patient_age_years(study_uid, orthanc_study_id)

    if mri_brats_adapter.available("MR") and brats_status["anatomy_applicable"]:
        t1_pack = fetch_t1_series_instances_dicom(study_uid, orthanc_study_id)
        t2_pack = fetch_t2_series_instances_dicom(study_uid, orthanc_study_id)
        flair_pack = fetch_flair_series_instances_dicom(study_uid, orthanc_study_id)
        if t1_pack and t2_pack and flair_pack:
            t1_vol = dicom_series_to_hu_volume(t1_pack[0])
            t2_vol = dicom_series_to_hu_volume(t2_pack[0])
            flair_vol = dicom_series_to_hu_volume(flair_pack[0])
            if t1_vol and t2_vol and flair_vol:
                gate = evaluate_mri_brain_applicability(
                    sequences={
                        "t1": t1_vol.get("num_slices"),
                        "t2": t2_vol.get("num_slices"),
                        "flair": flair_vol.get("num_slices"),
                    },
                    required_sequences=["t1", "t2", "flair"],
                    age_years=age_years,
                )
                applicability_notes.append({"adapter": "brats_tumor", **gate})
                if gate["status"] != STATUS_ABSTAIN:
                    multichannel = mri_brats_adapter.build_multichannel_input(
                        t1_vol["hu_volume"], t1_vol.get("pixel_spacing"), t1_vol.get("slice_spacing_mm"),
                        t2_vol["hu_volume"], t2_vol.get("pixel_spacing"), t2_vol.get("slice_spacing_mm"),
                        flair_vol["hu_volume"], flair_vol.get("pixel_spacing"), flair_vol.get("slice_spacing_mm"),
                    )
                    if multichannel:
                        out = mri_brats_adapter.infer_segmentation(multichannel)
                        if out:
                            out["applicability"] = gate
                            results.append(out)
                            debug_meta["brats_series"] = {
                                "t1": t1_pack[1].get("series_description"),
                                "t2": t2_pack[1].get("series_description"),
                                "flair": flair_pack[1].get("series_description"),
                            }

    whole_brain_volume_meta = None
    whole_brain_series_meta = None
    if mri_unest_adapter.available("MR") and unest_status["anatomy_applicable"]:
        t1_pack = fetch_t1_series_instances_dicom(study_uid, orthanc_study_id)
        if t1_pack:
            volume = dicom_series_to_hu_volume(t1_pack[0])
            if volume:
                gate = evaluate_mri_brain_applicability(
                    sequences={"t1": volume.get("num_slices")},
                    required_sequences=["t1"],
                    age_years=age_years,
                )
                applicability_notes.append({"adapter": "unest_whole_brain", **gate})
                if gate["status"] != STATUS_ABSTAIN:
                    out = mri_unest_adapter.infer_segmentation(
                        volume["hu_volume"], "MR",
                        pixel_spacing=volume.get("pixel_spacing"),
                        slice_spacing_mm=volume.get("slice_spacing_mm"),
                    )
                    if out:
                        out["applicability"] = gate
                        results.append(out)
                        whole_brain_volume_meta = volume.get("preprocessing")
                        whole_brain_series_meta = t1_pack[1]

    _last_mr_applicability = {"age_years": age_years, "adapters": applicability_notes, "backend_status": backend_status}

    if not results:
        return None

    merged = _merge_cv_results(results) if len(results) > 1 else results[0]
    merged["series_meta"] = whole_brain_series_meta or debug_meta.get("brats_series")
    merged["preprocessing"] = whole_brain_volume_meta or {"source": "brats_multichannel", **debug_meta}
    merged["applicability"] = _last_mr_applicability
    return merged


def _route_pixels(pixels: dict[str, Any], modality: str) -> dict[str, Any] | None:
    hu = pixels["hu_array"]
    display = pixels.get("display_array")
    pixel_spacing = pixels.get("pixel_spacing")
    slice_spacing_mm = pixels.get("slice_spacing_mm")

    # 1) nnU-Net for CT volumes when configured — task-specific and, when
    #    present, takes priority over the general-purpose backends below.
    if modality == "CT" and nnunet_adapter.available() and hu.ndim >= 2:
        out = nnunet_adapter.infer_volume(hu, modality)
        if out:
            return out

    # 2) CT multi-model orchestration: run every gated/approved backend
    #    that answers a genuinely different question about the same
    #    volume, and merge — whole-body organ segmentation (TotalSegmentator)
    #    is not a substitute for discrete lesion detection (RetinaNet nodule
    #    detector) or vice versa. Falls back to whichever single backend is
    #    available if only one is approved.
    if modality == "CT":
        ct_results = []
        if totalsegmentator_adapter.available(modality):
            out = totalsegmentator_adapter.infer_segmentation(
                hu, modality, pixel_spacing=pixel_spacing, slice_spacing_mm=slice_spacing_mm
            )
            if out:
                ct_results.append(out)
        if lung_nodule_detection.available(modality):
            out = lung_nodule_detection.infer_detection(
                hu, modality, pixel_spacing=pixel_spacing, slice_spacing_mm=slice_spacing_mm
            )
            if out:
                ct_results.append(out)
        if not ct_results and monai_unet.available(modality):
            # Single-organ spleen bundle only runs as a fallback when
            # neither of the two richer backends above is approved —
            # it's the least informative of the three.
            out = monai_unet.infer_segmentation(
                hu, modality, pixel_spacing=pixel_spacing, slice_spacing_mm=slice_spacing_mm
            )
            if out:
                ct_results.append(out)
        if ct_results:
            return _merge_cv_results(ct_results)

    # MR no longer routes through here — see _run_mr_inference, which owns
    # both the whole-brain (mri_unest_adapter) and BraTS tumor
    # (mri_brats_adapter) backends and merges them when both are approved.

    # 3) TorchXRayVision for chest X-ray
    if modality in ("XR", "CR") and torchxray_cxr.available():
        return torchxray_cxr.infer_cxr(display)

    # 3b) Breast density classification for mammography — single 2D image, not volumetric
    if modality in ("MG", "MAMMOGRAM", "MAMMOGRAPHY") and breast_density_classifier.available(modality):
        out = breast_density_classifier.infer_classification(hu, modality)
        if out:
            return out

    # 4) CT/MR without weights — use middle slice through XR model as weak screen (labeled)
    if modality == "CT" and torchxray_cxr.available() and hu.ndim >= 2:
        slice2d = hu[hu.shape[0] // 2] if hu.ndim == 3 else hu
        from inference.dicom_pixels import _to_display_uint8
        disp = _to_display_uint8(slice2d, "CT")
        out = torchxray_cxr.infer_cxr(disp)
        out["model_version"] = "torchxrayvision-ct-slice-proxy-v1"
        out["inference_backend"] = "torchxrayvision-ct-proxy"
        out["confidence_score"] = round(float(out["confidence_score"]) * 0.7, 4)
        for f in out.get("findings", []):
            f["note"] = (f.get("note") or "") + " (CT axial proxy — confirm on dedicated CT model.)"
        return out

    return None


def get_model_status() -> dict[str, Any]:
    return {
        "torchxrayvision": torchxray_cxr.available(),
        "monai_ct_unet": monai_unet.available("CT"),
        "monai_ct_unet_downloaded": monai_unet.is_downloaded("CT"),
        "monai_mri_unet": monai_unet.available("MRI"),
        "mri_unest_brain": mri_unest_adapter.available("MR"),
        "mri_unest_brain_downloaded": mri_unest_adapter.is_downloaded("MR"),
        "mri_brats_tumor": mri_brats_adapter.available("MR"),
        "mri_brats_tumor_downloaded": mri_brats_adapter.is_downloaded("MR"),
        "totalsegmentator_ct": totalsegmentator_adapter.available("CT"),
        "totalsegmentator_ct_downloaded": totalsegmentator_adapter.is_downloaded("CT"),
        "lung_nodule_detection_ct": lung_nodule_detection.available("CT"),
        "lung_nodule_detection_ct_downloaded": lung_nodule_detection.is_downloaded("CT"),
        "breast_density_mg": breast_density_classifier.available("MG"),
        "breast_density_mg_downloaded": breast_density_classifier.is_downloaded("MG"),
        "nnunetv2": nnunet_adapter.available(),
    }
