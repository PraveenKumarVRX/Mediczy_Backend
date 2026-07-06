"""DICOM pixel extraction for inference pipelines."""
from __future__ import annotations

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
        cols = int(getattr(ds, "Cols", arr.shape[1] if arr.ndim > 1 else arr.shape[0]))
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
        }
    except Exception:
        return None


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
