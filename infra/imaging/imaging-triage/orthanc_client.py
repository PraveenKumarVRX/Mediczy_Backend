"""Orthanc REST client — study metadata + DICOM instance retrieval."""
from __future__ import annotations

import base64
import json
import os
import urllib.error
import urllib.request
from typing import Any

ORTHANC_URL = os.getenv("ORTHANC_URL", "http://127.0.0.1:8042").rstrip("/")
ORTHANC_USER = os.getenv("ORTHANC_USER", "pacs")
ORTHANC_PASSWORD = os.getenv("ORTHANC_PASSWORD")
if not ORTHANC_PASSWORD:
    raise RuntimeError(
        "ORTHANC_PASSWORD is required. Refusing to authenticate to Orthanc with an insecure default."
    )
ORTHANC_REQUEST_TIMEOUT_SECONDS = float(os.getenv("ORTHANC_REQUEST_TIMEOUT_SECONDS", "60"))
ORTHANC_METADATA_TIMEOUT_SECONDS = float(os.getenv("ORTHANC_METADATA_TIMEOUT_SECONDS", "5"))


def auth_header() -> str:
    token = base64.b64encode(f"{ORTHANC_USER}:{ORTHANC_PASSWORD}".encode()).decode()
    return f"Basic {token}"


def _request(
    url: str,
    method: str = "GET",
    data: bytes | None = None,
    headers: dict | None = None,
    timeout: float | None = None,
) -> bytes:
    hdrs = {"Authorization": auth_header(), **(headers or {})}
    req = urllib.request.Request(url, data=data, method=method, headers=hdrs)
    with urllib.request.urlopen(req, timeout=timeout or ORTHANC_REQUEST_TIMEOUT_SECONDS) as res:
        return res.read()


def resolve_study_id(study_uid: str, orthanc_study_id: str | None, timeout: float | None = None) -> str | None:
    if orthanc_study_id:
        return orthanc_study_id
    body = json.dumps({"Level": "Study", "Query": {"StudyInstanceUID": study_uid}}).encode()
    raw = _request(
        f"{ORTHANC_URL}/tools/find",
        method="POST",
        data=body,
        headers={"Content-Type": "application/json"},
        timeout=timeout,
    )
    ids = json.loads(raw.decode())
    return ids[0] if ids else None


def fetch_study_meta(
    study_uid: str,
    orthanc_study_id: str | None,
    timeout: float | None = None,
) -> dict[str, Any] | None:
    try:
        request_timeout = timeout or ORTHANC_METADATA_TIMEOUT_SECONDS
        sid = resolve_study_id(study_uid, orthanc_study_id, timeout=request_timeout)
        if not sid:
            return None
        raw = _request(f"{ORTHANC_URL}/studies/{sid}", timeout=request_timeout)
        data = json.loads(raw.decode())
        tags = data.get("MainDicomTags", {})
        return {
            "orthanc_study_id": sid,
            "patient_name": tags.get("PatientName"),
            "modality": tags.get("Modality") or tags.get("ModalitiesInStudy"),
            "study_description": tags.get("StudyDescription"),
            "series_ids": data.get("Series", []),
            "series_count": len(data.get("Series", [])),
            "instances_estimate": data.get("Instances"),
        }
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, KeyError):
        return None


def fetch_first_instance_dicom(study_uid: str, orthanc_study_id: str | None) -> tuple[bytes, dict[str, Any]] | None:
    """Return (dicom_bytes, instance_meta) for first instance in first series."""
    try:
        meta = fetch_study_meta(study_uid, orthanc_study_id)
        if not meta or not meta.get("series_ids"):
            return None
        series_id = meta["series_ids"][0]
        series_raw = _request(f"{ORTHANC_URL}/series/{series_id}")
        series = json.loads(series_raw.decode())
        instance_ids = series.get("Instances") or []
        if not instance_ids:
            return None
        instance_id = instance_ids[0]
        dicom_bytes = _request(f"{ORTHANC_URL}/instances/{instance_id}/file")
        inst_raw = _request(f"{ORTHANC_URL}/instances/{instance_id}")
        inst = json.loads(inst_raw.decode())
        return dicom_bytes, {
            "instance_id": instance_id,
            "series_id": series_id,
            "orthanc_study_id": meta["orthanc_study_id"],
            "sop_instance_uid": inst.get("MainDicomTags", {}).get("SOPInstanceUID"),
            "modality": inst.get("MainDicomTags", {}).get("Modality") or meta.get("modality"),
        }
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, KeyError):
        return None


# Substring match against SeriesDescription (case-insensitive), in priority
# order. Not a validated sequence classifier — a real MRI protocol naming
# convention this doesn't recognize falls through to "largest series",
# which may not be T1 at all. See mri_unest_adapter.py's module docstring.
#
# "cor"/"sag_loc" were previously in _T1_EXCLUDE_HINTS to skip localizers —
# but "cor" also matches a real coronal T1 acquisition ("T1W_3D_TFE_COR",
# seen on real patient data), wrongly excluding a legitimate T1 series.
# Localizers are already caught by "loc"/"scout"; dropped "cor"/"sag_loc" as
# redundant and wrong.
_T1_DESCRIPTION_HINTS = ["t1", "mprage", "spgr", "bravo"]
_T1_EXCLUDE_HINTS = ["flair", "t2", "dwi", "adc", "swi", "loc", "scout"]
_T2_DESCRIPTION_HINTS = ["t2"]
_T2_EXCLUDE_HINTS = ["flair", "t1", "dwi", "adc", "swi", "loc", "scout", "star", "*"]
_FLAIR_DESCRIPTION_HINTS = ["flair"]
_FLAIR_EXCLUDE_HINTS = ["loc", "scout"]


MAX_SERIES_INSTANCES_FOR_VOLUME = int(os.getenv("MAX_SERIES_INSTANCES_FOR_VOLUME", "400"))

# Below this, a 3D segmentation model is being fed something that isn't a real
# volume — a handful of localizer/scout slices, not a brain. The prior check
# (`num_slices >= 2`) let essentially anything through. This is a judgment
# call, not a validated threshold from any bundle's own documentation — it's
# a sanity floor, not a clinical claim.
MIN_SERIES_INSTANCES_FOR_VOLUME = int(os.getenv("MIN_SERIES_INSTANCES_FOR_VOLUME", "20"))


def fetch_patient_age_years(
    study_uid: str,
    orthanc_study_id: str | None,
    timeout: float | None = None,
) -> float | None:
    """Real age computed from PatientBirthDate + StudyDate (both present on
    live Orthanc study responses — confirmed against real patient data).
    Returns None if either tag is missing/unparseable — never guesses."""
    try:
        request_timeout = timeout or ORTHANC_METADATA_TIMEOUT_SECONDS
        sid = resolve_study_id(study_uid, orthanc_study_id, timeout=request_timeout)
        if not sid:
            return None
        raw = _request(f"{ORTHANC_URL}/studies/{sid}", timeout=request_timeout)
        data = json.loads(raw.decode())
        dob = (data.get("PatientMainDicomTags", {}) or {}).get("PatientBirthDate")
        study_date = (data.get("MainDicomTags", {}) or {}).get("StudyDate")
        if not dob or not study_date or len(dob) != 8 or len(study_date) != 8:
            return None
        from datetime import date
        dob_d = date(int(dob[0:4]), int(dob[4:6]), int(dob[6:8]))
        study_d = date(int(study_date[0:4]), int(study_date[4:6]), int(study_date[6:8]))
        age_days = (study_d - dob_d).days
        if age_days < 0:
            return None
        return round(age_days / 365.25, 1)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, KeyError, ValueError):
        return None


def _fetch_series_by_hints(
    study_uid: str,
    orthanc_study_id: str | None,
    include_hints: list[str],
    exclude_hints: list[str],
    sequence_name: str,
    require_match: bool = False,
) -> tuple[list[bytes], dict[str, Any]] | None:
    """Return (list_of_dicom_bytes, series_meta) for the series most likely to
    be the named sequence, by SeriesDescription substring match. Falls back
    to the largest series in the study when nothing matches and
    require_match is False — that fallback is a real limitation: running a
    sequence-specific model on the wrong series produces a meaningless
    result even though inference completes without error. With
    require_match=True, returns None instead of guessing (used for T2/FLAIR
    in the multi-sequence pipeline, where a wrong guess feeds a wrong
    channel into a 4-channel model rather than just mislabeling one report)."""
    try:
        meta = fetch_study_meta(study_uid, orthanc_study_id)
        if not meta or not meta.get("series_ids"):
            return None

        candidates = []  # (instance_count, series_id, instance_ids, description, is_match)
        for series_id in meta["series_ids"]:
            series_raw = _request(f"{ORTHANC_URL}/series/{series_id}")
            series = json.loads(series_raw.decode())
            instance_ids = series.get("Instances") or []
            if not instance_ids:
                continue
            desc = str(series.get("MainDicomTags", {}).get("SeriesDescription") or "").lower()
            excluded = any(h in desc for h in exclude_hints)
            is_match = (not excluded) and any(h in desc for h in include_hints)
            candidates.append((len(instance_ids), series_id, instance_ids, desc, is_match))

        if not candidates:
            return None

        matched = [c for c in candidates if c[4]]
        if not matched and require_match:
            return None
        pool = matched if matched else candidates
        best = max(pool, key=lambda c: c[0])
        _, best_series_id, best_instance_ids, best_desc, is_match = best

        capped_ids = best_instance_ids[:MAX_SERIES_INSTANCES_FOR_VOLUME]
        dicom_list = [
            _request(f"{ORTHANC_URL}/instances/{iid}/file") for iid in capped_ids
        ]
        return dicom_list, {
            "series_id": best_series_id,
            "series_description": best_desc,
            "orthanc_study_id": meta["orthanc_study_id"],
            "instance_count": len(best_instance_ids),
            "instances_fetched": len(capped_ids),
            "truncated": len(best_instance_ids) > MAX_SERIES_INSTANCES_FOR_VOLUME,
            "modality": meta.get("modality"),
            f"{sequence_name}_match": "description" if is_match else "fallback_largest_series_unverified",
        }
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, KeyError):
        return None


def fetch_t1_series_instances_dicom(
    study_uid: str, orthanc_study_id: str | None
) -> tuple[list[bytes], dict[str, Any]] | None:
    return _fetch_series_by_hints(
        study_uid, orthanc_study_id, _T1_DESCRIPTION_HINTS, _T1_EXCLUDE_HINTS, "t1",
    )


def fetch_t2_series_instances_dicom(
    study_uid: str, orthanc_study_id: str | None
) -> tuple[list[bytes], dict[str, Any]] | None:
    """Requires an actual SeriesDescription match — see require_match in
    _fetch_series_by_hints. No silent 'largest series' fallback: this feeds
    a specific channel of a 4-channel tumor-segmentation model, and a
    guessed-wrong sequence there is worse than declining to run at all."""
    return _fetch_series_by_hints(
        study_uid, orthanc_study_id, _T2_DESCRIPTION_HINTS, _T2_EXCLUDE_HINTS, "t2",
        require_match=True,
    )


def fetch_flair_series_instances_dicom(
    study_uid: str, orthanc_study_id: str | None
) -> tuple[list[bytes], dict[str, Any]] | None:
    """Same require_match=True reasoning as fetch_t2_series_instances_dicom."""
    return _fetch_series_by_hints(
        study_uid, orthanc_study_id, _FLAIR_DESCRIPTION_HINTS, _FLAIR_EXCLUDE_HINTS, "flair",
        require_match=True,
    )


def fetch_series_instances_dicom(
    study_uid: str, orthanc_study_id: str | None
) -> tuple[list[bytes], dict[str, Any]] | None:
    """Return (list_of_dicom_bytes, series_meta) for the largest series in the
    study (by instance count) — a proxy for "the real acquisition" vs a
    1-3 image scout/localizer series. Capped at MAX_SERIES_INSTANCES_FOR_VOLUME
    to bound memory/bandwidth on pathological studies."""
    try:
        meta = fetch_study_meta(study_uid, orthanc_study_id)
        if not meta or not meta.get("series_ids"):
            return None

        best_series_id = None
        best_instance_ids: list[str] = []
        for series_id in meta["series_ids"]:
            series_raw = _request(f"{ORTHANC_URL}/series/{series_id}")
            series = json.loads(series_raw.decode())
            instance_ids = series.get("Instances") or []
            if len(instance_ids) > len(best_instance_ids):
                best_series_id = series_id
                best_instance_ids = instance_ids

        if not best_series_id or not best_instance_ids:
            return None

        capped_ids = best_instance_ids[:MAX_SERIES_INSTANCES_FOR_VOLUME]
        dicom_list = [
            _request(f"{ORTHANC_URL}/instances/{iid}/file") for iid in capped_ids
        ]
        return dicom_list, {
            "series_id": best_series_id,
            "orthanc_study_id": meta["orthanc_study_id"],
            "instance_count": len(best_instance_ids),
            "instances_fetched": len(capped_ids),
            "truncated": len(best_instance_ids) > MAX_SERIES_INSTANCES_FOR_VOLUME,
            "modality": meta.get("modality"),
        }
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, KeyError):
        return None


def orthanc_health() -> bool:
    try:
        _request(f"{ORTHANC_URL}/system", timeout=3)
        return True
    except Exception:
        return False
