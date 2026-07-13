"""
Mediczy AI Platform — Gateway / Proxy

Lightweight FastAPI app that:
  1. Exposes a unified /health endpoint aggregating all three services.
  2. Exposes /status with the full internal port map.
  3. Proxies /api/sib/*        → sib-fastapi       (8001)
             /api/scribe/*     → scribe-service     (8005) or offline-scribe (8006)

Run with:
    uvicorn ai_platform.gateway:app --host 0.0.0.0 --port 8000

This gateway is OPTIONAL — each service continues to accept direct calls
on its own port. The gateway is useful for a single ingress point in
staging/ECS environments.
"""

import os
import asyncio
from typing import Any, Dict

import httpx
from fastapi import FastAPI, Request, Response, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# Add repo root to sys.path when running from ai-platform/
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ai_platform.config import PORTS, LOG_LEVEL
from ai_platform.health.probe import build_health_response

import logging
logging.basicConfig(level=LOG_LEVEL)
logger = logging.getLogger("ai-platform-gateway")

SERVICES = {
    "sib-fastapi":    f"http://localhost:{PORTS['sib_fastapi']}",
    "scribe-service": f"http://localhost:{PORTS['scribe_service']}",
    "offline-scribe": f"http://localhost:{PORTS['offline_scribe']}",
}

HEALTH_PATHS = {
    "sib-fastapi":    "/health",
    "scribe-service": "/api/scribe/health",
    "offline-scribe": "/api/scribe/health",
}

GATEWAY_VERSION = "1.0.0"
GATEWAY_PORT    = int(os.getenv("GATEWAY_PORT", "8000"))

app = FastAPI(
    title="Mediczy AI Platform Gateway",
    description="Single ingress for all AI microservices",
    version=GATEWAY_VERSION,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


async def _probe_service(client: httpx.AsyncClient, name: str) -> Dict[str, Any]:
    url = SERVICES[name] + HEALTH_PATHS[name]
    try:
        r = await client.get(url, timeout=4.0)
        data = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
        return {"status": data.get("status", "healthy"), "url": url, "http": r.status_code}
    except Exception as exc:
        return {"status": "unhealthy", "url": url, "error": str(exc)}


@app.get("/health", tags=["platform"])
async def platform_health():
    """Aggregate health from all three AI services."""
    async with httpx.AsyncClient() as client:
        results = await asyncio.gather(*[
            _probe_service(client, name) for name in SERVICES
        ])
    components = dict(zip(SERVICES.keys(), results))
    return JSONResponse(
        build_health_response("ai-platform-gateway", GATEWAY_VERSION, GATEWAY_PORT, components)
    )


@app.get("/status", tags=["platform"])
async def platform_status():
    """Internal port map and service registry."""
    return {
        "services": {
            "sib-fastapi":    {"port": PORTS["sib_fastapi"],    "role": "Dr. iSHA doctor bot, RAG, risk scoring"},
            "scribe-service": {"port": PORTS["scribe_service"], "role": "GPU-backed medical transcription (Bimedix)"},
            "offline-scribe": {"port": PORTS["offline_scribe"], "role": "CPU-only offline STT + clinical note generation"},
            "remote-gpu":     {"port": PORTS["remote_gpu"],     "role": "Remote Bimedix GPU host (isha.buzz)"},
        },
        "gateway_port": GATEWAY_PORT,
    }


# ─── Reverse-proxy helpers ────────────────────────────────────────────────────

async def _proxy(request: Request, target_base: str, strip_prefix: str) -> Response:
    path = request.url.path.removeprefix(strip_prefix) or "/"
    url  = target_base + path
    if request.url.query:
        url += f"?{request.url.query}"

    headers = dict(request.headers)
    headers.pop("host", None)

    async with httpx.AsyncClient() as client:
        try:
            r = await client.request(
                method=request.method,
                url=url,
                headers=headers,
                content=await request.body(),
                timeout=120.0,
            )
            return Response(content=r.content, status_code=r.status_code,
                            headers=dict(r.headers), media_type=r.headers.get("content-type"))
        except httpx.ConnectError:
            raise HTTPException(502, f"Cannot reach upstream: {target_base}")
        except httpx.TimeoutException:
            raise HTTPException(504, f"Upstream timeout: {target_base}")


@app.api_route("/api/sib/{path:path}", methods=["GET","POST","PUT","PATCH","DELETE"], tags=["proxy"])
async def proxy_sib(request: Request):
    return await _proxy(request, SERVICES["sib-fastapi"], "/api/sib")


@app.api_route("/api/scribe/{path:path}", methods=["GET","POST","PUT","PATCH","DELETE"], tags=["proxy"])
async def proxy_scribe(request: Request):
    """Routes to offline-scribe by default; set ?gpu=1 to hit scribe-service."""
    target = SERVICES["scribe-service"] if request.query_params.get("gpu") == "1" \
             else SERVICES["offline-scribe"]
    return await _proxy(request, target, "/api/scribe")
