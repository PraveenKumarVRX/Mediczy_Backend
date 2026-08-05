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


def auth_header() -> str:
    token = base64.b64encode(f"{ORTHANC_USER}:{ORTHANC_PASSWORD}".encode()).decode()
    return f"Basic {token}"


def _request(url: str, method: str = "GET", data: bytes | None = None, headers: dict | None = None) -> bytes:
    hdrs = {"Authorization": auth_header(), **(headers or {})}
    req = urllib.request.Request(url, data=data, method=method, headers=hdrs)
    with urllib.request.urlopen(req, timeout=60) as res:
        return res.read()


def resolve_study_id(study_uid: str, orthanc_study_id: str | None) -> str | None:
    if orthanc_study_id:
        return orthanc_study_id
    body = json.dumps({"Level": "Study", "Query": {"StudyInstanceUID": study_uid}}).encode()
    raw = _request(
        f"{ORTHANC_URL}/tools/find",
        method="POST",
        data=body,
        headers={"Content-Type": "application/json"},
    )
    ids = json.loads(raw.decode())
    return ids[0] if ids else None


def fetch_study_meta(study_uid: str, orthanc_study_id: str | None) -> dict[str, Any] | None:
    try:
        sid = resolve_study_id(study_uid, orthanc_study_id)
        if not sid:
            return None
        raw = _request(f"{ORTHANC_URL}/studies/{sid}")
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


MAX_SERIES_INSTANCES_FOR_VOLUME = int(os.getenv("MAX_SERIES_INSTANCES_FOR_VOLUME", "400"))


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
        _request(f"{ORTHANC_URL}/system")
        return True
    except Exception:
        return False
