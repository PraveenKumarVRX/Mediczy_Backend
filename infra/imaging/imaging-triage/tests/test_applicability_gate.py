"""Tests for inference.applicability_gate — the OOD/applicability check that
runs before MRI adapters, not after. Covers the three real, discrete states
the gate can return: SUPPORTED, SUPPORTED_WITH_CAVEATS, ABSTAIN.
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from inference.applicability_gate import (  # noqa: E402
    STATUS_ABSTAIN,
    STATUS_CAVEATS,
    STATUS_SUPPORTED,
    evaluate_mri_brain_applicability,
)


def test_adequate_slices_adult_is_supported():
    result = evaluate_mri_brain_applicability(
        sequences={"t1": 180},
        required_sequences=["t1"],
        age_years=45.0,
    )
    assert result["status"] == STATUS_SUPPORTED
    assert result["reasons"] == []


def test_insufficient_slices_aborts_before_inference():
    """This is the direct fix for the pre-existing `num_slices >= 2` floor —
    a handful of localizer slices must not reach the segmentation model."""
    result = evaluate_mri_brain_applicability(
        sequences={"t1": 3},
        required_sequences=["t1"],
        age_years=45.0,
    )
    assert result["status"] == STATUS_ABSTAIN
    assert any("3 slices" in r for r in result["reasons"])


def test_missing_sequence_aborts():
    result = evaluate_mri_brain_applicability(
        sequences={"t1": 180, "t2": None, "flair": 160},
        required_sequences=["t1", "t2", "flair"],
        age_years=45.0,
    )
    assert result["status"] == STATUS_ABSTAIN
    assert any("t2" in r for r in result["reasons"])


def test_pediatric_patient_is_caveat_not_abstain():
    """The bundle's own metadata doesn't state a validated population, so a
    pediatric patient is undocumented, not confirmed unsupported — this must
    not hard-block, only flag."""
    result = evaluate_mri_brain_applicability(
        sequences={"t1": 180},
        required_sequences=["t1"],
        age_years=5.0,
    )
    assert result["status"] == STATUS_CAVEATS
    assert any("5.0y" in r or "pediatric" in r.lower() for r in result["reasons"])


def test_adequate_slices_but_unknown_age_is_supported_not_caveat():
    """Missing age data is a data-availability gap, not an applicability
    concern about the patient — shouldn't downgrade status."""
    result = evaluate_mri_brain_applicability(
        sequences={"t1": 180},
        required_sequences=["t1"],
        age_years=None,
    )
    assert result["status"] == STATUS_SUPPORTED


def test_slice_floor_and_pediatric_both_reported():
    result = evaluate_mri_brain_applicability(
        sequences={"t1": 5},
        required_sequences=["t1"],
        age_years=5.0,
    )
    assert result["status"] == STATUS_ABSTAIN
    assert len(result["checks"]) == 2
