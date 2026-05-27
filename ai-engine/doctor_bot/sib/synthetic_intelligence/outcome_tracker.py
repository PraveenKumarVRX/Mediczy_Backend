"""
Synthetic Intelligence — Outcome Tracker
=========================================

Records every SIB request execution outcome so the brain can learn from
its own history. This is what makes the intelligence genuinely "synthetic":
it synthesizes knowledge from its own operational experience.

Tracked per request:
  - intent, urgency (from QwenPlanner)
  - provider used (iSHA / Groq / Gemini / qwen_orchestrated)
  - latency_ms
  - confidence score from synthesis
  - had_error (bool)
  - plan_steps count
  - timestamp

Stored in a circular ring buffer (in-memory, max 2000 records) +
periodically flushed to a JSON file for persistence across restarts.
"""

from __future__ import annotations

import json
import logging
import os
import time
from collections import defaultdict, deque
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Deque, Dict, List, Optional

logger = logging.getLogger("sib.synthetic_intelligence.outcome_tracker")

RING_SIZE = 2000
FLUSH_INTERVAL = 300  # seconds between JSON flushes
_STORE_PATH = Path(__file__).parent.parent.parent / "data" / "si_outcomes.json"


@dataclass
class OutcomeRecord:
    timestamp: float
    intent: str
    urgency: str
    provider: str
    latency_ms: float
    confidence: float
    plan_steps: int
    had_error: bool
    request_type: str


class OutcomeTracker:
    """
    Rolling window outcome recorder for the Synthetic Intelligence layer.

    Thread-safe reads; append-only writes (GIL sufficient for CPython).
    """

    def __init__(self):
        self._ring: Deque[OutcomeRecord] = deque(maxlen=RING_SIZE)
        self._last_flush = time.time()
        self._flush_path = _STORE_PATH
        self._load_persisted()
        logger.info(f"✅ OutcomeTracker ready ({len(self._ring)} historical records loaded)")

    # ── Recording ─────────────────────────────────────────────────────────────

    def record(self, result: Dict[str, Any], request_type: str) -> None:
        """Extract outcome metrics from a brain.handle_request() result dict."""
        rec = OutcomeRecord(
            timestamp=time.time(),
            intent=result.get("intent", request_type),
            urgency=result.get("urgency", "unknown"),
            provider=result.get("provider", "unknown"),
            latency_ms=float(result.get("latency_ms", 0)),
            confidence=float(result.get("confidence") or 0),
            plan_steps=int(result.get("plan_steps") or 0),
            had_error="error" in result and bool(result["error"]),
            request_type=request_type,
        )
        self._ring.append(rec)
        if time.time() - self._last_flush > FLUSH_INTERVAL:
            self._flush()

    # ── Analytics ─────────────────────────────────────────────────────────────

    def get_analytics(self, window: int = 500) -> Dict[str, Any]:
        """Return aggregate performance analytics for the last `window` requests."""
        recent = list(self._ring)[-window:]
        if not recent:
            return {"status": "no_data", "records": 0}

        by_provider: Dict[str, List] = defaultdict(list)
        by_intent:   Dict[str, List] = defaultdict(list)
        by_urgency:  Dict[str, List] = defaultdict(list)
        errors = 0

        for r in recent:
            by_provider[r.provider].append(r)
            by_intent[r.intent].append(r)
            by_urgency[r.urgency].append(r)
            if r.had_error:
                errors += 1

        def stats(records: List[OutcomeRecord]) -> Dict:
            lats = [r.latency_ms for r in records]
            confs = [r.confidence for r in records if r.confidence > 0]
            err_rate = sum(1 for r in records if r.had_error) / max(len(records), 1)
            return {
                "count": len(records),
                "avg_latency_ms": round(sum(lats) / max(len(lats), 1), 1),
                "p95_latency_ms": round(_percentile(lats, 95), 1),
                "avg_confidence": round(sum(confs) / max(len(confs), 1), 3),
                "error_rate": round(err_rate, 3),
            }

        return {
            "status": "ok",
            "window": window,
            "total_records": len(recent),
            "error_rate": round(errors / max(len(recent), 1), 3),
            "by_provider": {p: stats(rs) for p, rs in by_provider.items()},
            "by_intent":   {i: stats(rs) for i, rs in by_intent.items()},
            "by_urgency":  {u: stats(rs) for u, rs in by_urgency.items()},
            "best_provider_by_latency":    self._best_provider(by_provider, "latency"),
            "best_provider_by_confidence": self._best_provider(by_provider, "confidence"),
            "most_common_intents": self._top_k_keys(by_intent, 5),
            "recent_trend": self._trend(recent),
        }

    def best_provider_for_intent(self, intent: str, window: int = 200) -> Optional[str]:
        """
        Return the historically best LLM provider for a given intent,
        ranked by (lowest error rate, highest confidence, lowest latency).
        """
        recent = [r for r in list(self._ring)[-window:] if r.intent == intent]
        if len(recent) < 5:
            return None

        by_provider: Dict[str, List] = defaultdict(list)
        for r in recent:
            by_provider[r.provider].append(r)

        scores = {}
        for provider, records in by_provider.items():
            if len(records) < 3:
                continue
            err_rate  = sum(1 for r in records if r.had_error) / len(records)
            avg_conf  = sum(r.confidence for r in records) / len(records)
            avg_lat   = sum(r.latency_ms for r in records) / len(records)
            # Score: low error + high confidence + low latency (normalized)
            scores[provider] = (1 - err_rate) * 0.5 + avg_conf * 0.3 + (1 / max(avg_lat, 1)) * 0.001 * 0.2

        if not scores:
            return None
        return max(scores, key=scores.__getitem__)

    # ── Persistence ───────────────────────────────────────────────────────────

    def _flush(self) -> None:
        try:
            self._flush_path.parent.mkdir(parents=True, exist_ok=True)
            records = [asdict(r) for r in list(self._ring)[-500:]]
            self._flush_path.write_text(json.dumps(records, indent=None))
            self._last_flush = time.time()
            logger.debug(f"SI outcomes flushed: {len(records)} records → {self._flush_path}")
        except Exception as e:
            logger.warning(f"Outcome flush failed: {e}")

    def _load_persisted(self) -> None:
        try:
            if self._flush_path.exists():
                records = json.loads(self._flush_path.read_text())
                for r in records:
                    self._ring.append(OutcomeRecord(**r))
        except Exception as e:
            logger.debug(f"Could not load persisted outcomes: {e}")

    # ── Internal helpers ──────────────────────────────────────────────────────

    @staticmethod
    def _best_provider(by_provider: Dict, metric: str) -> Optional[str]:
        if not by_provider:
            return None
        if metric == "latency":
            return min(
                by_provider,
                key=lambda p: sum(r.latency_ms for r in by_provider[p]) / max(len(by_provider[p]), 1),
            )
        if metric == "confidence":
            return max(
                by_provider,
                key=lambda p: sum(r.confidence for r in by_provider[p]) / max(len(by_provider[p]), 1),
            )
        return None

    @staticmethod
    def _top_k_keys(d: Dict, k: int) -> List[str]:
        return sorted(d, key=lambda k: len(d[k]), reverse=True)[:k]

    @staticmethod
    def _trend(recent: List[OutcomeRecord]) -> Dict:
        if len(recent) < 20:
            return {}
        half = len(recent) // 2
        first = recent[:half]
        second = recent[half:]
        avg_lat_first  = sum(r.latency_ms for r in first) / len(first)
        avg_lat_second = sum(r.latency_ms for r in second) / len(second)
        avg_err_first  = sum(1 for r in first if r.had_error) / len(first)
        avg_err_second = sum(1 for r in second if r.had_error) / len(second)
        return {
            "latency_delta_ms": round(avg_lat_second - avg_lat_first, 1),
            "error_rate_delta":  round(avg_err_second - avg_err_first, 3),
            "improving": avg_lat_second < avg_lat_first and avg_err_second <= avg_err_first,
        }


def _percentile(values: List[float], p: int) -> float:
    if not values:
        return 0.0
    sorted_vals = sorted(values)
    idx = int(len(sorted_vals) * p / 100)
    return sorted_vals[min(idx, len(sorted_vals) - 1)]


# ─── Singleton ────────────────────────────────────────────────────────────────

_tracker: Optional[OutcomeTracker] = None


def get_outcome_tracker() -> OutcomeTracker:
    global _tracker
    if _tracker is None:
        _tracker = OutcomeTracker()
    return _tracker
