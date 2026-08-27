"""Regression tests for mri_unest_adapter's bilateral structure pairing.

TEST-BILATERAL-MISMATCH-001: the first version of _pair_bilateral_structures
(no per-axis normalization, no size-ratio cutoff) produced anatomically
absurd "asymmetric" pairs on real patient data — up to 70x volume
differences between matched structures, one involving a 147,424.9 mm3
"structure" (roughly 12-15% of an entire pediatric brain). That was a
matching artifact, not a finding: a real bilateral brain structure does not
legitimately differ from its counterpart by that much. This file locks in
the fix so it can't silently regress.
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from inference.mri_unest_adapter import _pair_bilateral_structures  # noqa: E402


# Grid dimensions matching this adapter's real _INFERENCE_SIZE (z, y, x).
Z_EXTENT, Y_EXTENT, X_EXTENT = 64, 160, 160


def test_wildly_mismatched_sizes_are_never_paired():
    """A tiny structure on one side and a huge one on the other must be
    rejected, even if no better candidate exists — reporting them as
    unpaired is correct; reporting them as a "70x asymmetric pair" is not.
    This is the exact failure class TEST-BILATERAL-MISMATCH-001 names."""
    structures = {
        # Small structure, left side (x < midline).
        10: {"voxel_count": 60, "centroid": (30.0, 80.0, 40.0)},
        # Enormous structure, right side, roughly mirrored position — close
        # enough in position that pre-fix code would have matched it purely
        # on geometry, ignoring the ~90x size gap.
        20: {"voxel_count": 5400, "centroid": (30.0, 80.0, 120.0)},
    }
    pairs, unpaired = _pair_bilateral_structures(structures, Z_EXTENT, Y_EXTENT, X_EXTENT)

    assert pairs == [], "wildly size-mismatched structures must never be paired"
    assert set(unpaired) == {10, 20}, "both structures must be reported unpaired, not silently dropped"


def test_genuinely_similar_pair_is_matched():
    """A real contralateral pair — similar size, mirrored position — must
    still be matched. The fix must reject bad matches without becoming so
    strict it can't find real ones."""
    structures = {
        1: {"voxel_count": 500, "centroid": (32.0, 80.0, 50.0)},
        2: {"voxel_count": 520, "centroid": (32.0, 80.0, 110.0)},  # mirrors 1 around x=80
    }
    pairs, unpaired = _pair_bilateral_structures(structures, Z_EXTENT, Y_EXTENT, X_EXTENT)

    assert len(pairs) == 1
    assert unpaired == []
    assert {pairs[0]["left"], pairs[0]["right"]} == {1, 2}


def test_midline_structures_are_never_forced_into_a_pair():
    """A single structure straddling the midline (e.g. corpus callosum,
    brainstem) has no contralateral counterpart and must be left unpaired,
    not matched against something on one side."""
    structures = {
        5: {"voxel_count": 300, "centroid": (32.0, 80.0, 80.0)},  # dead-center on x
    }
    pairs, unpaired = _pair_bilateral_structures(structures, Z_EXTENT, Y_EXTENT, X_EXTENT)

    assert pairs == []
    assert unpaired == [5]


def test_far_apart_similar_sized_structures_are_not_paired():
    """Two structures can be similar in size but anatomically unrelated —
    position must independently gate a match, not just size similarity.
    Structures at opposite ends of the z-axis (e.g. cerebellum vs frontal
    lobe) with matching size should not be paired just because their
    volumes happen to be close."""
    structures = {
        7: {"voxel_count": 400, "centroid": (5.0, 20.0, 50.0)},   # far anterior/superior
        8: {"voxel_count": 410, "centroid": (58.0, 140.0, 110.0)},  # far posterior/inferior, mirrored x
    }
    pairs, unpaired = _pair_bilateral_structures(structures, Z_EXTENT, Y_EXTENT, X_EXTENT)

    assert pairs == [], "position mismatch alone must be enough to reject a candidate pair"
    assert set(unpaired) == {7, 8}
