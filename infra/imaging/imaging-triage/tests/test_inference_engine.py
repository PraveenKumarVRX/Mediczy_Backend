"""Unit tests for imaging inference engine (no GPU / Orthanc required)."""
from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from inference.heuristic import infer_heuristic  # noqa: E402
from inference.engine import norm_modality, run_study_inference  # noqa: E402


def test_norm_modality():
    assert norm_modality("x-ray") == "XR"
    assert norm_modality("ct") == "CT"


def test_heuristic_ct_findings():
    out = infer_heuristic("CT", {"study_description": "Chest pain"})
    assert out["inference_backend"] == "heuristic"
    assert len(out["findings"]) >= 2
    assert any("Chest pain" in f.get("note", "") for f in out["findings"])


@patch("inference.engine.fetch_first_instance_dicom")
@patch("inference.engine.fetch_study_meta")
def test_run_study_inference_fallback_without_dicom(mock_meta, mock_dicom):
    mock_meta.return_value = {"modality": "CT", "study_description": "Follow-up"}
    mock_dicom.return_value = None
    result = run_study_inference("1.2.3", "CT", None)
    assert result["dicom_loaded"] is False
    assert result["inference_backend"] == "heuristic"
    assert result["orthanc_meta"]["modality"] == "CT"


@patch("inference.engine._route_pixels")
@patch("inference.engine.dicom_bytes_to_hu_array")
@patch("inference.engine.fetch_first_instance_dicom")
@patch("inference.engine.fetch_study_meta")
def test_run_study_inference_routes_pixels(mock_meta, mock_dicom, mock_pixels, mock_route):
    mock_meta.return_value = {"modality": "XR"}
    mock_dicom.return_value = (b"dicom", {"modality": "XR"})
    mock_pixels.return_value = {
        "hu_array": np.zeros((512, 512), dtype=np.float32),
        "display_array": np.zeros((512, 512), dtype=np.uint8),
        "modality": "XR",
    }
    mock_route.return_value = {
        "findings": [{"label": "Pneumonia", "severity": "medium", "note": "test", "present": True}],
        "measurements": [],
        "critical": False,
        "confidence_score": 0.8,
        "model_version": "torchxrayvision-densenet121-nih-rsna-v1",
        "inference_backend": "torchxrayvision",
        "feature_attributions": [{"feature": "Pneumonia", "attribution": 0.8, "direction": "positive"}],
    }
    result = run_study_inference("1.2.3", "XR", "orthanc-id")
    assert result["dicom_loaded"] is True
    assert result["inference_backend"] == "torchxrayvision"
    assert result["findings"][0]["label"] == "Pneumonia"
    assert result["preprocessing"] is None


@patch("inference.engine._route_pixels")
@patch("inference.engine.dicom_series_to_hu_volume")
@patch("inference.engine.fetch_series_instances_dicom")
@patch("inference.engine.fetch_study_meta")
def test_run_study_inference_exposes_volume_preprocessing(mock_meta, mock_series, mock_volume, mock_route):
    mock_meta.return_value = {"modality": "CT"}
    mock_series.return_value = ([b"dicom1", b"dicom2"], {"series_id": "series-a"})
    mock_volume.return_value = {
        "hu_volume": np.zeros((12, 64, 64), dtype=np.float32),
        "modality": "CT",
        "num_slices": 12,
        "pixel_spacing": [0.7, 0.7],
        "slice_spacing_mm": 1.0,
        "z_spacing_source": "image_position_patient",
        "preprocessing": {
            "source": "series_volume",
            "dtype": "float32",
            "shape_zyx": [12, 64, 64],
            "quality_flags": [],
        },
    }
    mock_route.return_value = {
        "findings": [],
        "measurements": [],
        "critical": False,
        "confidence_score": 0.7,
        "model_version": "ct-model",
        "inference_backend": "gpu",
        "feature_attributions": [],
    }
    result = run_study_inference("1.2.3", "CT", "orthanc-id")
    assert result["dicom_loaded"] is True
    assert result["volumetric"] is True
    assert result["preprocessing"]["source"] == "series_volume"
    assert result["preprocessing"]["shape_zyx"] == [12, 64, 64]


def test_torchxray_available_import():
    from inference import torchxray_cxr
    # May be False in CI without torch — just ensure function exists
    assert callable(torchxray_cxr.available)
