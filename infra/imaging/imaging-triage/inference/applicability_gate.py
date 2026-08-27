"""OOD / applicability gate for MRI brain inference — runs before the
UNesT/BraTS adapters, not after. Answers: "is this input within what we can
honestly say the pipeline was built to handle?" before spending GPU/CPU time
producing a confident-looking answer for an input it was never checked
against.

Deliberately narrow and honest:
- Hard checks (ABSTAIN) are only for things that are unambiguously true/false
  facts about the input: not enough slices for a real 3D volume, a required
  sequence missing.
- Soft checks (SUPPORTED_WITH_CAVEATS) are for things we genuinely don't
  know — e.g. neither MONAI bundle's metadata.json states a validated
  training population (data_source is an empty string in both), so a
  pediatric patient is not "documented as unsupported," it's undocumented.
  Do not claim more than the source material says.
- No fabricated confidence score. A single continuous "OOD score" here would
  itself be an unvalidated number — exactly the kind of manufactured
  certainty this pipeline's QA gates exist to catch downstream. Report
  discrete, named reasons instead.
"""
from __future__ import annotations

from typing import Any

from orthanc_client import MIN_SERIES_INSTANCES_FOR_VOLUME

STATUS_SUPPORTED = "SUPPORTED"
STATUS_CAVEATS = "SUPPORTED_WITH_CAVEATS"
STATUS_ABSTAIN = "ABSTAIN"

# Neither wholeBrainSeg_Large_UNEST_segmentation nor brats_mri_segmentation's
# metadata.json specifies a data_source or validated age range (both fields
# are present but empty/absent in the bundles as downloaded) — verified by
# reading configs/metadata.json directly, not assumed. Both bundles document
# zero validated population regardless of age, so that fact alone isn't
# useful per-study signal — see _check_population for what actually varies.


def _check_slice_count(num_slices: int | None, sequence_label: str) -> dict[str, Any]:
    if num_slices is None:
        return {
            "check": f"{sequence_label}_slice_count",
            "passed": False,
            "severity": "abstain",
            "detail": f"{sequence_label}: slice count unknown (volume not loaded)",
        }
    if num_slices < MIN_SERIES_INSTANCES_FOR_VOLUME:
        return {
            "check": f"{sequence_label}_slice_count",
            "passed": False,
            "severity": "abstain",
            "detail": (
                f"{sequence_label}: {num_slices} slices, below the "
                f"{MIN_SERIES_INSTANCES_FOR_VOLUME}-slice floor for a real 3D volume "
                "(likely a localizer/scout series, not full brain coverage)"
            ),
        }
    return {
        "check": f"{sequence_label}_slice_count",
        "passed": True,
        "severity": "info",
        "detail": f"{sequence_label}: {num_slices} slices (>= {MIN_SERIES_INSTANCES_FOR_VOLUME} floor)",
    }


_PEDIATRIC_CUTOFF_YEARS = 18


def _check_population(age_years: float | None) -> dict[str, Any]:
    # "Bundle documents no validated population" is true for every study
    # (data_source is empty regardless of age) — reporting it as a caveat on
    # every single case would make the caveat meaningless noise. Only
    # pediatric age is the actually differentiating, action-relevant signal:
    # neuro-MRI segmentation models commonly perform worse on pediatric
    # anatomy than their (typically adult-skewed) training data, a real,
    # general point independent of what this specific bundle documents.
    if age_years is None:
        return {
            "check": "patient_population",
            "passed": True,
            "severity": "info",
            "detail": "Patient age unavailable (PatientBirthDate/StudyDate missing) — population applicability unverified",
        }
    if age_years < _PEDIATRIC_CUTOFF_YEARS:
        note = (
            f"Patient age ~{age_years}y (pediatric). Neither MONAI bundle's own metadata.json states "
            "a validated training population (data_source is empty in both) — this is not confirmed "
            "unsafe, but pediatric neuro-MRI segmentation commonly differs from adult-skewed training "
            "distributions, so treat output with extra scrutiny."
        )
        return {"check": "patient_population", "passed": True, "severity": "caveat", "detail": note}
    return {
        "check": "patient_population",
        "passed": True,
        "severity": "info",
        "detail": f"age {age_years}y (adult) — bundle documents no validated population, but no pediatric-specific concern applies",
    }


def evaluate_mri_brain_applicability(
    *,
    sequences: dict[str, int | None],
    required_sequences: list[str],
    age_years: float | None,
) -> dict[str, Any]:
    """`sequences` maps sequence label ("t1", "t2", "flair") to num_slices
    (None if that sequence wasn't found at all). `required_sequences` lists
    which of those are mandatory for the adapter being gated (UNesT needs
    just ["t1"]; BraTS needs ["t1", "t2", "flair"])."""
    checks: list[dict[str, Any]] = []
    reasons: list[str] = []

    for label in required_sequences:
        num_slices = sequences.get(label)
        result = _check_slice_count(num_slices, label)
        checks.append(result)
        if not result["passed"]:
            reasons.append(result["detail"])

    pop_check = _check_population(age_years)
    checks.append(pop_check)

    if reasons:
        status = STATUS_ABSTAIN
    elif pop_check["severity"] == "caveat":
        status = STATUS_CAVEATS
        reasons = [pop_check["detail"]]
    else:
        status = STATUS_SUPPORTED

    return {"status": status, "checks": checks, "reasons": reasons}
