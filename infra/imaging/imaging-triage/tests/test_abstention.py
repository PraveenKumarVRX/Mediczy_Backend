"""Tests for inference.abstention.classify_state."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from inference.abstention import (  # noqa: E402
    STATE_ABSTAIN,
    STATE_NEGATIVE,
    STATE_POSITIVE,
    STATE_UNCERTAIN,
    classify_state,
)


def test_high_confidence_present_is_positive():
    r = classify_state(confidence=0.9, is_present=True)
    assert r["state"] == STATE_POSITIVE
    assert r["reason"] is None


def test_thresholded_absence_is_negative_not_abstain():
    r = classify_state(confidence=0.3, is_present=False)
    assert r["state"] == STATE_NEGATIVE


def test_mid_confidence_present_is_uncertain():
    r = classify_state(confidence=0.4, is_present=True)
    assert r["state"] == STATE_UNCERTAIN
    assert "0.40" in r["reason"]


def test_very_low_confidence_present_is_abstain():
    r = classify_state(confidence=0.05, is_present=True)
    assert r["state"] == STATE_ABSTAIN


def test_missing_confidence_is_abstain():
    r = classify_state(confidence=None, is_present=True)
    assert r["state"] == STATE_ABSTAIN
    assert r["confidence"] is None


def test_structurally_unreliable_capped_at_uncertain_even_with_high_confidence():
    """BraTS enhancing-tumor case: numeric confidence could read as
    confident, but the signal is known-degraded (no T1c series) — must
    never reach POSITIVE regardless of the number."""
    r = classify_state(
        confidence=0.95,
        is_present=True,
        structurally_unreliable=True,
        structurally_unreliable_reason="no contrast series",
    )
    assert r["state"] == STATE_UNCERTAIN
    assert r["reason"] == "no contrast series"


def test_boundary_at_positive_threshold_is_inclusive():
    r = classify_state(confidence=0.75, is_present=True)
    assert r["state"] == STATE_POSITIVE


def test_boundary_just_below_positive_threshold_is_uncertain():
    r = classify_state(confidence=0.7499, is_present=True)
    assert r["state"] == STATE_UNCERTAIN


def test_boundary_at_uncertain_threshold_is_inclusive():
    r = classify_state(confidence=0.15, is_present=True)
    assert r["state"] == STATE_UNCERTAIN


def test_boundary_just_below_uncertain_threshold_is_abstain():
    r = classify_state(confidence=0.1499, is_present=True)
    assert r["state"] == STATE_ABSTAIN
