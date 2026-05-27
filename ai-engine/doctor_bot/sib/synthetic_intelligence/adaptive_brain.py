"""
Synthetic Intelligence — Adaptive Brain
========================================

Uses outcome history to make the SIB genuinely self-improving:

1. Adaptive LLM provider selection — if iSHA has been failing or slow for a
   given intent class, prefer Groq/Gemini for that intent automatically.

2. Plan quality scoring — tracks which Qwen-generated plan structures succeed
   (high confidence synthesis) vs fail (errors, low confidence), feeding
   intent-specific heuristics back to QwenPlanner.

3. Urgency calibration — compares Qwen-assigned urgency to actual outcomes
   (e.g., if "high" urgency queries have long latency, something is wrong).

4. Self-diagnostics — detects degradation patterns and surfaces them via
   /synthetic/analytics so operators can act.

The "synthetic" nature: the intelligence synthesizes new knowledge from its
own operation without external supervision.
"""

from __future__ import annotations

import logging
import time
from typing import Any, Dict, List, Optional

logger = logging.getLogger("sib.synthetic_intelligence.adaptive_brain")

# How many successful samples before we trust per-intent recommendations
MIN_SAMPLES_FOR_RECOMMENDATION = 10

# Thresholds for declaring a provider "degraded"
DEGRADED_ERROR_RATE = 0.30     # 30% error rate → degraded
DEGRADED_LATENCY_MS = 8000     # 8s average → degraded


class AdaptiveBrain:
    """
    Meta-intelligence layer that observes SIB execution and adapts strategy.

    Injected into brain.py's handle_request() to:
      - Recommend LLM provider order overrides per intent
      - Flag degraded backends
      - Provide actionable insights for operators
    """

    def __init__(self):
        from .outcome_tracker import get_outcome_tracker
        self._tracker = get_outcome_tracker()
        self._last_analysis_time = 0.0
        self._cached_analysis: Optional[Dict] = None
        self._cache_ttl = 60  # recompute analysis every 60s
        logger.info("🧠 AdaptiveBrain initialized")

    # ── Provider recommendation ───────────────────────────────────────────────

    def recommended_provider_order(self, intent: str) -> Optional[List[str]]:
        """
        Return a reordered LLM provider list for this intent based on history.
        Returns None if insufficient data (use default order).

        Default order: [isha_node1, isha_node2, groq, openai, gemini]
        This method may swap groq ahead of iSHA if iSHA is consistently slow
        for this intent type.
        """
        best = self._tracker.best_provider_for_intent(intent)
        if best is None:
            return None

        default_order = [
            "isha_node1_bimedix2",
            "isha_node2",
            "groq",
            "openai",
            "gemini",
        ]
        if best not in default_order:
            return None

        # Move best provider to front without removing it from the list
        reordered = [best] + [p for p in default_order if p != best]
        logger.debug(f"AdaptiveBrain: intent='{intent}' → preferred provider={best}")
        return reordered

    # ── Degradation detection ─────────────────────────────────────────────────

    def degraded_providers(self, window: int = 100) -> List[Dict[str, Any]]:
        """
        Return list of providers showing degradation patterns.
        A provider is degraded if, in the last `window` requests:
          - error_rate > DEGRADED_ERROR_RATE, OR
          - avg_latency > DEGRADED_LATENCY_MS
        """
        analytics = self._get_analytics(window)
        degraded = []
        for provider, stats in analytics.get("by_provider", {}).items():
            issues = []
            if stats["error_rate"] > DEGRADED_ERROR_RATE:
                issues.append(f"error_rate={stats['error_rate']:.1%} (threshold {DEGRADED_ERROR_RATE:.0%})")
            if stats["avg_latency_ms"] > DEGRADED_LATENCY_MS:
                issues.append(f"avg_latency={stats['avg_latency_ms']:.0f}ms (threshold {DEGRADED_LATENCY_MS:.0f}ms)")
            if issues:
                degraded.append({
                    "provider": provider,
                    "issues": issues,
                    "stats": stats,
                })
        return degraded

    # ── Self-diagnostic report ────────────────────────────────────────────────

    def get_intelligence_report(self) -> Dict[str, Any]:
        """
        Full synthetic intelligence self-assessment report.

        Returned by /synthetic/analytics endpoint.
        """
        analytics = self._get_analytics(window=500)
        degraded = self.degraded_providers()
        trend = analytics.get("recent_trend", {})

        health_score = self._compute_health_score(analytics, degraded, trend)
        insights = self._generate_insights(analytics, degraded, trend)

        return {
            "status": "ok",
            "health_score": health_score,
            "health_level": self._score_label(health_score),
            "analytics": analytics,
            "degraded_providers": degraded,
            "insights": insights,
            "recommendations": self._generate_recommendations(analytics, degraded),
            "trend": trend,
            "generated_at": time.time(),
        }

    # ── Urgency feedback ──────────────────────────────────────────────────────

    def urgency_latency_correlation(self) -> Dict[str, float]:
        """
        Emergency/high urgency requests should have lower latency (fast-path).
        Returns avg latency per urgency level — deviation signals a routing issue.
        """
        analytics = self._get_analytics()
        by_urgency = analytics.get("by_urgency", {})
        return {
            urgency: stats["avg_latency_ms"]
            for urgency, stats in by_urgency.items()
        }

    # ── Internal ──────────────────────────────────────────────────────────────

    def _get_analytics(self, window: int = 500) -> Dict:
        now = time.time()
        if self._cached_analysis and (now - self._last_analysis_time) < self._cache_ttl:
            return self._cached_analysis
        self._cached_analysis = self._tracker.get_analytics(window)
        self._last_analysis_time = now
        return self._cached_analysis

    def _compute_health_score(
        self,
        analytics: Dict,
        degraded: List,
        trend: Dict,
    ) -> float:
        """0–100 health score for the SIB AI layer."""
        score = 100.0

        # Penalize overall error rate
        score -= analytics.get("error_rate", 0) * 200

        # Penalize degraded providers
        score -= len(degraded) * 15

        # Penalize if latency is trending up
        if trend.get("latency_delta_ms", 0) > 500:
            score -= 10
        if trend.get("error_rate_delta", 0) > 0.05:
            score -= 10

        # Penalize if no data (can't assess)
        if analytics.get("total_records", 0) < 10:
            score = 60.0  # unknown

        return round(max(0, min(100, score)), 1)

    @staticmethod
    def _score_label(score: float) -> str:
        if score >= 90: return "excellent"
        if score >= 75: return "good"
        if score >= 55: return "degraded"
        return "critical"

    def _generate_insights(
        self, analytics: Dict, degraded: List, trend: Dict
    ) -> List[str]:
        insights = []

        if degraded:
            providers = [d["provider"] for d in degraded]
            insights.append(f"Degraded providers detected: {', '.join(providers)}")

        trend_lat = trend.get("latency_delta_ms", 0)
        if trend_lat > 300:
            insights.append(f"Latency trending up by {trend_lat:.0f}ms — possible iSHA GPU load spike")
        elif trend_lat < -200:
            insights.append(f"Latency improving by {abs(trend_lat):.0f}ms since last window")

        if trend.get("improving"):
            insights.append("Overall AI health improving in recent window")

        by_intent = analytics.get("by_intent", {})
        slow_intents = [
            i for i, s in by_intent.items()
            if s.get("avg_latency_ms", 0) > 5000
        ]
        if slow_intents:
            insights.append(f"Slow intent classes (>5s): {', '.join(slow_intents[:3])}")

        by_provider = analytics.get("by_provider", {})
        if "groq" in by_provider and "isha_node1_bimedix2" in by_provider:
            groq_lat  = by_provider["groq"].get("avg_latency_ms", 0)
            isha_lat  = by_provider["isha_node1_bimedix2"].get("avg_latency_ms", 0)
            if groq_lat < isha_lat * 0.6:
                insights.append(
                    f"Groq ({groq_lat:.0f}ms) significantly faster than iSHA GPU ({isha_lat:.0f}ms) — "
                    "adaptive routing may prefer Groq for latency-sensitive intents"
                )

        if not insights:
            insights.append("All systems operating within normal parameters")

        return insights

    def _generate_recommendations(self, analytics: Dict, degraded: List) -> List[str]:
        recs = []
        if any(d["provider"] in ("isha_node1_bimedix2", "isha_node2") for d in degraded):
            recs.append("iSHA GPU appears degraded — check ai.isha.buzz GPU server load and Cloudflare tunnel health")
        if analytics.get("error_rate", 0) > 0.15:
            recs.append("High overall error rate — review recent PM2 logs for exceptions")
        if analytics.get("total_records", 0) < 50:
            recs.append("Insufficient data for reliable recommendations — more traffic needed")
        if not recs:
            recs.append("No immediate action required")
        return recs


# ─── Singleton ────────────────────────────────────────────────────────────────

_adaptive_brain: Optional[AdaptiveBrain] = None


def get_adaptive_brain() -> AdaptiveBrain:
    global _adaptive_brain
    if _adaptive_brain is None:
        _adaptive_brain = AdaptiveBrain()
    return _adaptive_brain
