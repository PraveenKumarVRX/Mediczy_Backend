"""
QBRBotlet — Quantum Bayesian Reasoning botlet for SIB.

Invoked by QwenPlanner as botlet="qbr" for differential diagnosis steps.
Returns a ranked differential with quantum confidence and entropy metrics.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger("sib.qbr_botlet")


class QBRBotlet:
    """SIB botlet wrapping QuantumBayesianReasoner."""

    def __init__(self, memory):
        self.memory = memory
        self.session_count = 0
        logger.info("⚛️  QBRBotlet initialized")

    async def diagnose(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Run quantum Bayesian differential diagnosis.

        Expected data keys:
          chief_complaint  str    — presenting complaint (maps to candidate set)
          findings         list   — present clinical findings / symptoms / labs
          absent_findings  list   — findings explicitly absent (shifts amplitudes)
          risk_factors     list   — background risk factors (diabetes, smoking, etc.)
          age              int    — patient age
          sex              str    — "male" | "female"
          confirmed        str    — confirmed diagnosis to collapse state (optional)
        """
        from .qbr import get_qbr

        complaint = data.get("chief_complaint") or data.get("complaint") or "general"
        findings = data.get("findings") or data.get("symptoms") or []
        absent = data.get("absent_findings") or []
        risk = data.get("risk_factors") or []
        age = data.get("age")
        sex = data.get("sex")
        confirmed = data.get("confirmed_diagnosis")

        if isinstance(findings, str):
            findings = [f.strip() for f in findings.split(",") if f.strip()]
        if isinstance(absent, str):
            absent = [f.strip() for f in absent.split(",") if f.strip()]

        qbr = get_qbr()
        state = await asyncio.to_thread(
            qbr.reason,
            complaint,
            findings,
            absent,
            age,
            sex,
            risk,
            confirmed,
        )

        self.session_count += 1
        result = state.to_dict()
        result["explanation"] = qbr.explain(state)
        result["status"] = "success"
        result["botlet"] = "qbr"
        return result

    async def update_state(self, session_state: Dict, new_finding: str, absent: bool = False) -> Dict[str, Any]:
        """
        Incrementally update a running diagnostic session with a new finding.
        session_state must be a previously returned state dict re-hydrated.
        """
        from .qbr import get_qbr, DiagnosticState
        import numpy as np

        qbr = get_qbr()
        # Re-hydrate state from session dict
        diagnoses = [d["diagnosis"] for d in session_state.get("top_diagnoses", [])]
        if not diagnoses:
            return {"status": "error", "error": "no session state to update"}

        # Build amplitude array from probabilities (Born rule inverse: α = √p)
        probs = [d["probability"] for d in session_state["top_diagnoses"]]
        amps = np.sqrt(np.array(probs, dtype=float))
        amps /= np.linalg.norm(amps)

        state = DiagnosticState(
            diagnoses=diagnoses,
            amplitudes=amps,
            observed_evidence=session_state.get("evidence_applied", []),
            update_count=session_state.get("update_count", 0),
        )

        state = await asyncio.to_thread(qbr.apply_evidence, state, new_finding, absent)
        state = await asyncio.to_thread(qbr.apply_interference, state)

        result = state.to_dict()
        result["status"] = "updated"
        result["new_finding"] = new_finding
        result["absent"] = absent
        return result

    def get_stats(self) -> Dict[str, Any]:
        return {"session_count": self.session_count, "botlet": "qbr"}
