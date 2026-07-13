"""
Mediczy AI Platform — Health probe helpers
Each Python service calls build_health_response() to generate a standard
/health payload that Express + PM2 + the load balancer can parse uniformly.
"""

import os
import time
import platform
from typing import Any, Dict, Optional

_START_TIME = time.time()


def uptime_seconds() -> float:
    return round(time.time() - _START_TIME, 1)


def build_health_response(
    service_name: str,
    version: str,
    port: int,
    components: Optional[Dict[str, Any]] = None,
    extra: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Return a standard health dict.

    Shape:
    {
        "status": "healthy" | "degraded" | "initializing",
        "service": "sib-fastapi" | "scribe-service" | "offline-scribe",
        "version": "...",
        "port": 8001,
        "uptime_seconds": 123.4,
        "timestamp": "2026-07-13T...",
        "components": { ... }   # optional per-service sub-checks
    }
    """
    overall = "healthy"
    if components:
        statuses = [v.get("status", "healthy") if isinstance(v, dict) else "healthy"
                    for v in components.values()]
        if any(s == "unhealthy" for s in statuses):
            overall = "degraded"
        elif any(s == "initializing" for s in statuses):
            overall = "initializing"

    payload: Dict[str, Any] = {
        "status": overall,
        "service": service_name,
        "version": version,
        "port": port,
        "uptime_seconds": uptime_seconds(),
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "python": platform.python_version(),
    }
    if components:
        payload["components"] = components
    if extra:
        payload.update(extra)
    return payload
