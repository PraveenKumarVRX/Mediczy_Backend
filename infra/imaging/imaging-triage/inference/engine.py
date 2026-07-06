"""Inference orchestrator — Orthanc DICOM → MONAI / TorchXRayVision / nnU-Net."""
from __future__ import annotations

from typing import Any

from orthanc_client import fetch_first_instance_dicom, fetch_study_meta
from inference.dicom_pixels import dicom_bytes_to_hu_array
from inference.heuristic import infer_heuristic
from inference import monai_unet, nnunet_adapter, torchxray_cxr


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
                return result

    result = infer_heuristic(mod, meta)
    result["orthanc_meta"] = meta
    result["dicom_loaded"] = False
    return result


def _route_pixels(pixels: dict[str, Any], modality: str) -> dict[str, Any] | None:
    hu = pixels["hu_array"]
    display = pixels["display_array"]

    # 1) nnU-Net for CT volumes when configured
    if modality == "CT" and nnunet_adapter.available() and hu.ndim >= 2:
        out = nnunet_adapter.infer_volume(hu, modality)
        if out:
            return out

    # 2) MONAI UNet when weights file present
    if monai_unet.available(modality):
        out = monai_unet.infer_segmentation(hu, modality)
        if out:
            return out

    # 3) TorchXRayVision for chest X-ray
    if modality in ("XR", "CR") and torchxray_cxr.available():
        return torchxray_cxr.infer_cxr(display)

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
        "monai_mri_unet": monai_unet.available("MRI"),
        "nnunetv2": nnunet_adapter.available(),
    }
