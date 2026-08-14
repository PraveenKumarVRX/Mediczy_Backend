"""Inference orchestrator — Orthanc DICOM → MONAI / TorchXRayVision / nnU-Net."""
from __future__ import annotations

from typing import Any

from orthanc_client import (
    fetch_first_instance_dicom,
    fetch_series_instances_dicom,
    fetch_study_meta,
)
from inference.dicom_pixels import dicom_bytes_to_hu_array, dicom_series_to_hu_volume
from inference.heuristic import infer_heuristic
from inference import (
    breast_density_classifier,
    lung_nodule_detection,
    monai_unet,
    nnunet_adapter,
    torchxray_cxr,
    totalsegmentator_adapter,
)

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

    if mod in ("MR", "MRI") and not monai_unet.available(mod):
        result = infer_heuristic(mod, meta)
        result["orthanc_meta"] = meta
        result["dicom_loaded"] = False
        result["preprocessing"] = {
            "source": "metadata_only",
            "quality_flags": ["mri_model_not_enabled", "pixel_data_not_loaded"],
        }
        return result

    if mod in VOLUMETRIC_MODALITIES:
        series_pack = fetch_series_instances_dicom(study_uid, orthanc_study_id)
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
                return result

    result = infer_heuristic(mod, meta)
    result["orthanc_meta"] = meta
    result["dicom_loaded"] = False
    result["preprocessing"] = {
        "source": "metadata_only",
        "quality_flags": ["pixel_data_not_loaded"],
    }
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
        "totalsegmentator_ct": totalsegmentator_adapter.available("CT"),
        "totalsegmentator_ct_downloaded": totalsegmentator_adapter.is_downloaded("CT"),
        "lung_nodule_detection_ct": lung_nodule_detection.available("CT"),
        "lung_nodule_detection_ct_downloaded": lung_nodule_detection.is_downloaded("CT"),
        "breast_density_mg": breast_density_classifier.available("MG"),
        "breast_density_mg_downloaded": breast_density_classifier.is_downloaded("MG"),
        "nnunetv2": nnunet_adapter.available(),
    }
