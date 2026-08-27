"""Abstention state machine for individual AI observations/measurements.

Every measurement an MRI adapter emits gets one of four states:

    POSITIVE   — signal present, confidence high enough to state as a fact
    NEGATIVE   — signal genuinely absent (thresholded output, not "we didn't check")
    UNCERTAIN  — signal present but not confidently classifiable either way
    ABSTAIN    — the adapter cannot honestly answer for this specific observation

This is a DIFFERENT layer from inference.applicability_gate: the applicability
gate decides whether an adapter should run at all on a given study (input
quality/domain). This module classifies the adapter's own output, per
observation, once it *has* run.

Thresholds below (_POSITIVE_MIN, _UNCERTAIN_MIN) are engineering judgment
calls for turning a continuous probability into a 4-state label — they are
not clinically validated cutoffs, the same way _MAX_PAIR_MATCH_COST in
mri_unest_adapter.py isn't. Do not present them as such downstream.
"""
from __future__ import annotations

from typing import Any

STATE_POSITIVE = "POSITIVE"
STATE_NEGATIVE = "NEGATIVE"
STATE_UNCERTAIN = "UNCERTAIN"
STATE_ABSTAIN = "ABSTAIN"

_POSITIVE_MIN = 0.75
_UNCERTAIN_MIN = 0.15


def classify_state(
    *,
    confidence: float | None,
    is_present: bool,
    structurally_unreliable: bool = False,
    structurally_unreliable_reason: str | None = None,
) -> dict[str, Any]:
    """Classify one observation's state from its own real confidence value.

    `is_present` = whether the underlying thresholded detection fired at all
    (e.g. voxel_count > 0). `structurally_unreliable` marks a case where the
    signal itself is known-degraded for a reason independent of its numeric
    confidence (e.g. BraTS enhancing-tumor with no T1c series) — such a case
    is capped at UNCERTAIN even if the raw number would read as confident,
    because the number itself was computed from an input the pipeline knows
    is missing required information.
    """
    if confidence is None:
        return {
            "state": STATE_ABSTAIN,
            "confidence": None,
            "reason": "No confidence value produced for this observation",
        }

    if not is_present:
        # A real thresholded "nothing detected" — NEGATIVE, not ABSTAIN.
        # Confidence here reflects how sure the model is of the absence
        # (adapters currently report a floor value for this case; see
        # each adapter's own docstring for what that floor means).
        return {
            "state": STATE_NEGATIVE,
            "confidence": confidence,
            "reason": "Thresholded output: no voxels/signal above detection threshold",
        }

    if structurally_unreliable:
        return {
            "state": STATE_UNCERTAIN,
            "confidence": confidence,
            "reason": structurally_unreliable_reason or "Signal computed from an input the pipeline knows is incomplete",
        }

    if confidence >= _POSITIVE_MIN:
        return {"state": STATE_POSITIVE, "confidence": confidence, "reason": None}

    if confidence >= _UNCERTAIN_MIN:
        return {
            "state": STATE_UNCERTAIN,
            "confidence": confidence,
            "reason": f"Confidence {confidence:.2f} below the {_POSITIVE_MIN} floor for a definitive positive claim",
        }

    return {
        "state": STATE_ABSTAIN,
        "confidence": confidence,
        "reason": f"Confidence {confidence:.2f} too low to support any claim, positive or negative",
    }
