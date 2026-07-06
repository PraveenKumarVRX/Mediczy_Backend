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
ORTHANC_PASSWORD = os.getenv("ORTHANC_PASSWORD", "change-this-password")


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


def orthanc_health() -> bool:
    try:
        _request(f"{ORTHANC_URL}/system")
        return True
    except Exception:
        return False
