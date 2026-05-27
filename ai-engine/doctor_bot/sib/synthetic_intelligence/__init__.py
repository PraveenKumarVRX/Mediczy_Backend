"""
Synthetic Intelligence Layer
=============================

Meta-intelligence that makes SIB self-improving through operational feedback:

  OutcomeTracker  — records every request's outcome (provider, latency, confidence, errors)
  AdaptiveBrain   — uses outcome history to recommend optimal LLM provider per intent,
                    detect degraded backends, and generate self-diagnostic reports
"""

from .outcome_tracker import OutcomeTracker, OutcomeRecord, get_outcome_tracker
from .adaptive_brain import AdaptiveBrain, get_adaptive_brain

__all__ = [
    "OutcomeTracker", "OutcomeRecord", "get_outcome_tracker",
    "AdaptiveBrain", "get_adaptive_brain",
]
