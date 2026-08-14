"""DICOM pixel extraction for inference pipelines."""
from __future__ import annotations

from collections import Counter
from typing import Any

import numpy as np

try:
    import pydicom
    from pydicom.pixel_data_handlers.util import apply_modality_lut
except ImportError:  # pragma: no cover
    pydicom = None


def dicom_bytes_to_hu_array(dicom_bytes: bytes) -> dict[str, Any] | None:
    if pydicom is None:
        return None
    try:
        ds = pydicom.dcmread(dicom_bytes)
        if not hasattr(ds, "pixel_array"):
            return None
        arr = ds.pixel_array.astype(np.float32)
        try:
            arr = apply_modality_lut(arr, ds).astype(np.float32)
        except Exception:
            slope = float(getattr(ds, "RescaleSlope", 1) or 1)
            intercept = float(getattr(ds, "RescaleIntercept", 0) or 0)
            arr = arr * slope + intercept
        modality = str(getattr(ds, "Modality", "") or "").upper()
        rows = int(getattr(ds, "Rows", arr.shape[0]))
        cols = int(getattr(ds, "Columns", arr.shape[1] if arr.ndim > 1 else arr.shape[0]))
        pixel_spacing = getattr(ds, "PixelSpacing", None)
        return {
            "hu_array": arr,
            "display_array": _to_display_uint8(arr, modality),
            "modality": modality,
            "rows": rows,
            "cols": cols,
            "pixel_spacing": [float(x) for x in pixel_spacing] if pixel_spacing else None,
            "study_instance_uid": str(getattr(ds, "StudyInstanceUID", "")),
            "series_instance_uid": str(getattr(ds, "SeriesInstanceUID", "")),
            "sop_instance_uid": str(getattr(ds, "SOPInstanceUID", "")),
            "preprocessing": {
                "source": "single_instance",
                "dtype": "float32",
                "photometric_interpretation": str(getattr(ds, "PhotometricInterpretation", "")),
                "transfer_syntax_uid": str(getattr(getattr(ds, "file_meta", None), "TransferSyntaxUID", "")),
            },
        }
    except Exception:
        return None


def _normal_vector(image_orientation: Any) -> np.ndarray | None:
    try:
        vals = [float(v) for v in image_orientation]
        if len(vals) != 6:
            return None
        row = np.asarray(vals[:3], dtype=np.float64)
        col = np.asarray(vals[3:], dtype=np.float64)
        normal = np.cross(row, col)
        norm = np.linalg.norm(normal)
        return normal / norm if norm > 1e-6 else None
    except Exception:
        return None


def _slice_position(ds: Any) -> float | None:
    ipp = getattr(ds, "ImagePositionPatient", None)
    normal = _normal_vector(getattr(ds, "ImageOrientationPatient", None))
    try:
        if ipp and len(ipp) == 3 and normal is not None:
            return float(np.dot(np.asarray([float(v) for v in ipp], dtype=np.float64), normal))
        if ipp and len(ipp) == 3:
            return float(ipp[2])
    except Exception:
        return None
    return None


def _image_type_terms(ds: Any) -> set[str]:
    image_type = getattr(ds, "ImageType", None)
    if image_type is None:
        return set()
    if isinstance(image_type, str):
        values = image_type.split("\\")
    else:
        values = list(image_type)
    return {str(v).strip().upper() for v in values if str(v).strip()}


def _looks_like_localizer(ds: Any) -> bool:
    terms = _image_type_terms(ds)
    description = " ".join(
        str(getattr(ds, name, "") or "")
        for name in ("SeriesDescription", "ProtocolName", "StudyDescription")
    ).upper()
    localizer_terms = ("LOCALIZER", "SCOUT", "SURVEY", "TOPG")
    if any(term in terms for term in ("LOCALIZER", "SCOUT")):
        return True
    return any(term in description for term in localizer_terms)


def _quality_flags(source_count: int, kept: list[dict[str, Any]], z_spacing_source: str) -> list[str]:
    flags: list[str] = []
    if not kept:
        return ["no_pixel_slices"]
    if len(kept) < source_count:
        flags.append("non_diagnostic_or_shape_outlier_slices_removed")
    if len(kept) < 8:
        flags.append("low_slice_count")
    if z_spacing_source != "image_position_patient":
        flags.append("approximate_z_spacing")
    if not any(p.get("pixel_spacing") for p in kept):
        flags.append("missing_pixel_spacing")
    if len({p["arr"].shape for p in kept}) > 1:
        flags.append("mixed_in_plane_shape")
    return flags


def dicom_series_to_hu_volume(dicom_bytes_list: list[bytes]) -> dict[str, Any] | None:
    """Assemble a list of single-slice DICOM instances into a real 3D HU
    volume with (approximate) spacing, for use by genuinely volumetric
    models (MONAI bundles, nnU-Net). Sorts by ImagePositionPatient z when
    every slice has it (anatomically correct); falls back to InstanceNumber
    otherwise. z-spacing is derived from the median consecutive slice delta
    when position data is available, else SliceThickness, else a documented
    fallback of 1.0mm — callers must treat spacing as approximate unless
    z_spacing_source == 'image_position_patient'."""
    if pydicom is None or not dicom_bytes_list:
        return None

    parsed = []
    pixel_candidate_count = 0
    localizer_count = 0
    for raw in dicom_bytes_list:
        try:
            ds = pydicom.dcmread(raw)
            if not hasattr(ds, "pixel_array"):
                continue
            pixel_candidate_count += 1
            if _looks_like_localizer(ds):
                localizer_count += 1
                continue
            arr = ds.pixel_array.astype(np.float32)
            try:
                arr = apply_modality_lut(arr, ds).astype(np.float32)
            except Exception:
                slope = float(getattr(ds, "RescaleSlope", 1) or 1)
                intercept = float(getattr(ds, "RescaleIntercept", 0) or 0)
                arr = arr * slope + intercept
            z = _slice_position(ds)
            instance_number = getattr(ds, "InstanceNumber", None)
            parsed.append({
                "arr": arr,
                "z": z,
                "instance_number": int(instance_number) if instance_number is not None else None,
                "pixel_spacing": getattr(ds, "PixelSpacing", None),
                "slice_thickness": getattr(ds, "SliceThickness", None),
                "modality": str(getattr(ds, "Modality", "") or "").upper(),
                "series_instance_uid": str(getattr(ds, "SeriesInstanceUID", "")),
                "sop_instance_uid": str(getattr(ds, "SOPInstanceUID", "")),
                "image_orientation_patient": [float(v) for v in getattr(ds, "ImageOrientationPatient", [])]
                    if getattr(ds, "ImageOrientationPatient", None) else None,
            })
        except Exception:
            continue

    if not parsed:
        return None

    if all(p["z"] is not None for p in parsed):
        parsed.sort(key=lambda p: p["z"])
        z_positions = [p["z"] for p in parsed]
        deltas = [abs(b - a) for a, b in zip(z_positions[:-1], z_positions[1:]) if abs(b - a) > 1e-6]
        z_spacing = float(np.median(deltas)) if deltas else None
        z_spacing_source = "image_position_patient" if z_spacing else "unknown"
    else:
        parsed.sort(key=lambda p: (p["instance_number"] if p["instance_number"] is not None else 0))
        z_spacing = None
        z_spacing_source = "instance_number_order_no_spacing"

    if z_spacing is None:
        thickness = next((p["slice_thickness"] for p in parsed if p["slice_thickness"]), None)
        z_spacing = float(thickness) if thickness else 1.0
        if z_spacing_source == "unknown":
            z_spacing_source = "slice_thickness" if thickness else "fallback_1mm_unverified"

    source_count = pixel_candidate_count
    shapes = {p["arr"].shape for p in parsed}
    if len(shapes) > 1:
        # Mixed in-plane shapes (e.g. localizer mixed into the series) —
        # keep only the modal (most common) shape to build a consistent volume.
        target_shape = Counter(p["arr"].shape for p in parsed).most_common(1)[0][0]
        parsed = [p for p in parsed if p["arr"].shape == target_shape]
    if not parsed:
        return None

    volume = np.stack([p["arr"] for p in parsed], axis=0)  # (z, y, x)
    pixel_spacing = next((p["pixel_spacing"] for p in parsed if p["pixel_spacing"]), None)
    modality = parsed[0]["modality"]
    quality_flags = _quality_flags(source_count, parsed, z_spacing_source)
    if localizer_count:
        quality_flags.append("localizer_slices_removed")

    return {
        "hu_volume": volume,
        "modality": modality,
        "num_slices": volume.shape[0],
        "pixel_spacing": [float(x) for x in pixel_spacing] if pixel_spacing else None,
        "slice_spacing_mm": z_spacing,
        "z_spacing_source": z_spacing_source,
        "series_instance_uid": parsed[0].get("series_instance_uid"),
        "first_sop_instance_uid": parsed[0].get("sop_instance_uid"),
        "last_sop_instance_uid": parsed[-1].get("sop_instance_uid"),
        "preprocessing": {
            "source": "series_volume",
            "dtype": "float32",
            "shape_zyx": [int(x) for x in volume.shape],
            "slice_order": "image_position_patient" if z_spacing_source == "image_position_patient" else "instance_number",
            "quality_flags": quality_flags,
            "localizer_filter": "image_type_or_description",
            "spacing_mm_zyx": [
                float(z_spacing),
                float(pixel_spacing[0]) if pixel_spacing else None,
                float(pixel_spacing[1]) if pixel_spacing and len(pixel_spacing) > 1 else None,
            ],
        },
    }


def _to_display_uint8(arr: np.ndarray, modality: str) -> np.ndarray:
    """Window for XR; soft-tissue window for CT slice."""
    a = arr.astype(np.float32)
    if modality in ("CT", "PT"):
        window_center, window_width = 40.0, 400.0
        low = window_center - window_width / 2
        high = window_center + window_width / 2
        a = np.clip(a, low, high)
        a = (a - low) / max(high - low, 1e-6)
    else:
        lo, hi = np.percentile(a, 1), np.percentile(a, 99)
        a = np.clip(a, lo, hi)
        a = (a - lo) / max(hi - lo, 1e-6)
    return (a * 255.0).astype(np.uint8)
