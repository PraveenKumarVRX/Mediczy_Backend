"""
Quantum Bayesian Reasoner (QBR)
================================

Applies quantum probability theory to differential diagnosis.

Classical Bayesian:
    P(D|E) ∝ P(E|D) · P(D)          — multiplicative, order-independent

Quantum approach:
    |ψ⟩ = Σᵢ αᵢ |Dᵢ⟩               — superposition of all diagnoses
    Evidence update (Lüders rule):
        αᵢ ← αᵢ · √LR(E, Dᵢ)       — amplitude ∝ √probability
        normalize:  Z = √(Σ αᵢ²),   αᵢ ← αᵢ / Z
    Interference:
        Comorbid pairs boost each other's amplitude constructively.
        Mutually exclusive pairs cancel via destructive interference.
        Unlike classical Bayes, order of evidence application matters.
    Measurement (Born rule):
        P(Dᵢ) = |αᵢ|²

Why quantum probability for medicine?
- Superposition: all diagnoses simultaneously "in play" until collapsed by tests
- Interference: co-occurring symptoms create non-linear interactions classical
  Bayes misses (e.g., chest pain + diaphoresis amplify MI more than their
  individual LRs suggest)
- Entanglement: correlated diagnoses update together, not independently
- Diagnostic uncertainty is native: entropy = von Neumann-like measure
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

import numpy as np

from .medical_priors import (
    DIAGNOSES,
    SYMPTOM_LRS,
    INTERFERENCE_PAIRS,
    COMPLAINT_PRIORS,
)

logger = logging.getLogger("sib.quantum_brain.qbr")

MIN_AMPLITUDE = 1e-6   # prevent exact zero — keeps diagnoses in superposition
INTERFERENCE_STRENGTH = 0.12  # global scale for interference terms


# ─── State vector ─────────────────────────────────────────────────────────────

@dataclass
class DiagnosticState:
    """
    Quantum state vector over diagnostic space.

    amplitudes[i] is the probability amplitude for DIAGNOSES[i].
    All amplitudes are real and non-negative (no imaginary component
    needed for clinical applications).
    Born rule: P(Dᵢ) = amplitudes[i]²
    """
    diagnoses: List[str]
    amplitudes: np.ndarray          # shape (N,), non-negative reals, ∑αᵢ² = 1
    observed_evidence: List[str] = field(default_factory=list)
    interference_log: List[str] = field(default_factory=list)
    update_count: int = 0

    # ── Measurement ──────────────────────────────────────────────────────────

    def probabilities(self) -> Dict[str, float]:
        """Born rule: P(Dᵢ) = αᵢ²"""
        return {d: float(a ** 2) for d, a in zip(self.diagnoses, self.amplitudes)}

    def top_k(self, k: int = 5) -> List[Tuple[str, float]]:
        """Return top-k (diagnosis, probability) sorted by descending probability."""
        probs = self.probabilities()
        return sorted(probs.items(), key=lambda x: x[1], reverse=True)[:k]

    def entropy(self) -> float:
        """
        Diagnostic uncertainty as von Neumann-like entropy (bits).
        Max entropy = log₂(N), zero when a single diagnosis is certain.
        """
        probs = self.amplitudes ** 2
        probs = probs[probs > 1e-12]
        return float(-np.sum(probs * np.log2(probs + 1e-12)))

    def max_entropy(self) -> float:
        return math.log2(len(self.diagnoses))

    def confidence(self) -> float:
        """Confidence = probability of top diagnosis (0–1)."""
        return float(np.max(self.amplitudes ** 2))

    def certainty_level(self) -> str:
        c = self.confidence()
        if c >= 0.70:   return "high"
        if c >= 0.40:   return "moderate"
        if c >= 0.20:   return "low"
        return "very_low"

    def to_dict(self) -> Dict:
        top = self.top_k(k=5)
        return {
            "top_diagnoses": [
                {"diagnosis": d, "probability": round(p, 4), "percentage": f"{p*100:.1f}%"}
                for d, p in top
            ],
            "top_diagnosis":  top[0][0] if top else None,
            "confidence":     round(self.confidence(), 4),
            "certainty":      self.certainty_level(),
            "entropy_bits":   round(self.entropy(), 3),
            "max_entropy":    round(self.max_entropy(), 3),
            "uncertainty_pct": round(self.entropy() / max(self.max_entropy(), 1e-9) * 100, 1),
            "evidence_applied": self.observed_evidence,
            "update_count":   self.update_count,
            "interference_effects": self.interference_log[-5:],
        }


# ─── Reasoner ────────────────────────────────────────────────────────────────

class QuantumBayesianReasoner:
    """
    Quantum Bayesian Reasoner — differential diagnosis engine.

    Usage:
        qbr = QuantumBayesianReasoner()
        state = qbr.initialize("chest_pain")
        state = qbr.apply_evidence(state, "diaphoresis")
        state = qbr.apply_evidence(state, "elevated_troponin")
        state = qbr.apply_evidence(state, "st_elevation")
        state = qbr.apply_interference(state)
        result = state.to_dict()
    """

    def __init__(self):
        # Pre-compute interference lookup for O(1) access
        self._interference: Dict[Tuple[str, str], float] = {}
        for (d1, d2), coeff in INTERFERENCE_PAIRS.items():
            self._interference[(d1, d2)] = coeff
            self._interference[(d2, d1)] = coeff  # symmetric

    # ── Initialization ────────────────────────────────────────────────────────

    def initialize(
        self,
        chief_complaint: str = "general",
        age: Optional[int] = None,
        sex: Optional[str] = None,
        risk_factors: Optional[List[str]] = None,
    ) -> DiagnosticState:
        """
        Create initial quantum state: uniform superposition over candidate diagnoses.

        Candidates are seeded by chief_complaint from COMPLAINT_PRIORS.
        Age/sex/risk_factors shift base priors before normalization.
        """
        complaint_key = self._map_complaint(chief_complaint)
        candidates = list(COMPLAINT_PRIORS.get(complaint_key, DIAGNOSES))

        n = len(candidates)
        # Uniform amplitude: each diagnosis equally likely initially
        amplitudes = np.ones(n, dtype=float) / math.sqrt(n)

        state = DiagnosticState(
            diagnoses=candidates,
            amplitudes=amplitudes,
        )

        # Apply demographic priors as first weak evidence
        if age and age >= 65:
            state = self.apply_evidence(state, "elderly_age_over_65", _log=False)
        if risk_factors:
            for rf in risk_factors:
                if rf in SYMPTOM_LRS:
                    state = self.apply_evidence(state, rf, _log=False)

        state.observed_evidence = []  # reset — demographics are not symptoms
        logger.info(
            f"QBR init: complaint='{chief_complaint}' → {n} diagnoses in superposition "
            f"entropy={state.entropy():.2f}bits"
        )
        return state

    # ── Evidence application (Lüders rule) ───────────────────────────────────

    def apply_evidence(
        self,
        state: DiagnosticState,
        finding: str,
        absent: bool = False,
        _log: bool = True,
    ) -> DiagnosticState:
        """
        Update amplitude vector with a clinical finding.

        Present finding:  αᵢ ← αᵢ · √LR(finding, Dᵢ)
        Absent finding:   αᵢ ← αᵢ · √(1/LR) — absence of high-LR finding lowers probability

        All amplitudes are floor-bounded at MIN_AMPLITUDE to preserve superposition.
        After update, renormalize so Σαᵢ² = 1.
        """
        lr_table = SYMPTOM_LRS.get(finding)
        if lr_table is None:
            if _log:
                logger.debug(f"QBR: unknown finding '{finding}', skipping")
            return state

        new_amp = state.amplitudes.copy()
        for i, diag in enumerate(state.diagnoses):
            lr = lr_table.get(diag, 1.0)
            if absent:
                lr = 1.0 / max(lr, 1e-6)   # absence of finding: inverse LR
            # Lüders amplitude update: α ← α · √LR
            update = math.sqrt(max(lr, 0.0))
            new_amp[i] = max(new_amp[i] * update, MIN_AMPLITUDE)

        # Renormalize: Σαᵢ² = 1
        norm = math.sqrt(np.sum(new_amp ** 2))
        if norm > 1e-12:
            new_amp /= norm
        else:
            new_amp = np.ones(len(state.diagnoses)) / math.sqrt(len(state.diagnoses))

        new_state = DiagnosticState(
            diagnoses=state.diagnoses,
            amplitudes=new_amp,
            observed_evidence=state.observed_evidence + ([finding] if _log else []),
            interference_log=state.interference_log.copy(),
            update_count=state.update_count + 1,
        )
        if _log:
            top = new_state.top_k(1)
            top_name = top[0][0] if top else "?"
            top_prob = f"{top[0][1]:.3f}" if top else "0"
            logger.debug(f"QBR evidence '{finding}' (absent={absent}): top={top_name} p={top_prob}")
        return new_state

    def apply_evidence_batch(
        self,
        state: DiagnosticState,
        findings: List[str],
        absent_findings: Optional[List[str]] = None,
    ) -> DiagnosticState:
        """Apply multiple present and absent findings sequentially."""
        for f in findings:
            state = self.apply_evidence(state, f)
        for f in (absent_findings or []):
            state = self.apply_evidence(state, f, absent=True)
        return state

    # ── Quantum interference ──────────────────────────────────────────────────

    def apply_interference(self, state: DiagnosticState) -> DiagnosticState:
        """
        Apply constructive/destructive interference between diagnosis pairs.

        For each pair (Dᵢ, Dⱼ) with interference coefficient κ:
          Constructive (κ > 0, comorbid):
            αᵢ ← αᵢ + κ · αⱼ · αᵢ   (high-amplitude diagnoses amplify each other)
          Destructive (κ < 0, mutually exclusive):
            αᵢ ← αᵢ + κ · αⱼ · αᵢ   (one suppresses the other)

        The interference term is proportional to BOTH amplitudes — interference
        only matters when both diagnoses are in meaningful superposition.
        Renormalize after all interference is applied.
        """
        diag_idx = {d: i for i, d in enumerate(state.diagnoses)}
        new_amp = state.amplitudes.copy()
        log_entries = []

        for (d1, d2), coeff in self._interference.items():
            i1 = diag_idx.get(d1)
            i2 = diag_idx.get(d2)
            if i1 is None or i2 is None:
                continue

            a1, a2 = state.amplitudes[i1], state.amplitudes[i2]
            # Interference magnitude scales with the product of amplitudes
            delta1 = INTERFERENCE_STRENGTH * coeff * a2 * a1
            delta2 = INTERFERENCE_STRENGTH * coeff * a1 * a2
            new_amp[i1] = max(new_amp[i1] + delta1, MIN_AMPLITUDE)
            new_amp[i2] = max(new_amp[i2] + delta2, MIN_AMPLITUDE)

            if abs(coeff) >= 0.4 and a1 > 0.1 and a2 > 0.1:
                kind = "constructive" if coeff > 0 else "destructive"
                log_entries.append(f"{kind}: {d1}↔{d2} κ={coeff:+.1f}")

        # Renormalize
        norm = math.sqrt(np.sum(new_amp ** 2))
        if norm > 1e-12:
            new_amp /= norm

        return DiagnosticState(
            diagnoses=state.diagnoses,
            amplitudes=new_amp,
            observed_evidence=state.observed_evidence,
            interference_log=state.interference_log + log_entries,
            update_count=state.update_count,
        )

    # ── Collapse (definitive finding) ─────────────────────────────────────────

    def collapse(
        self,
        state: DiagnosticState,
        confirmed_diagnosis: str,
    ) -> DiagnosticState:
        """
        Collapse the wave function when a diagnosis is confirmed by a definitive test.
        All other amplitudes → MIN_AMPLITUDE; confirmed → 1.0, then renormalize.
        """
        new_amp = np.full(len(state.diagnoses), MIN_AMPLITUDE, dtype=float)
        if confirmed_diagnosis in state.diagnoses:
            idx = state.diagnoses.index(confirmed_diagnosis)
            new_amp[idx] = 1.0
        norm = math.sqrt(np.sum(new_amp ** 2))
        new_amp /= norm

        return DiagnosticState(
            diagnoses=state.diagnoses,
            amplitudes=new_amp,
            observed_evidence=state.observed_evidence + [f"CONFIRMED:{confirmed_diagnosis}"],
            interference_log=state.interference_log + [f"collapse→{confirmed_diagnosis}"],
            update_count=state.update_count,
        )

    # ── Full pipeline ─────────────────────────────────────────────────────────

    def reason(
        self,
        chief_complaint: str,
        findings: List[str],
        absent_findings: Optional[List[str]] = None,
        age: Optional[int] = None,
        sex: Optional[str] = None,
        risk_factors: Optional[List[str]] = None,
        confirmed_diagnosis: Optional[str] = None,
    ) -> DiagnosticState:
        """
        Full quantum reasoning pipeline.

        1. Initialize superposition from chief_complaint.
        2. Apply each finding (Lüders amplitude updates).
        3. Apply absent findings (inverse LR updates).
        4. Apply quantum interference between diagnoses.
        5. Optionally collapse on confirmed diagnosis.
        """
        state = self.initialize(chief_complaint, age=age, sex=sex, risk_factors=risk_factors)
        state = self.apply_evidence_batch(state, findings or [], absent_findings)
        state = self.apply_interference(state)
        if confirmed_diagnosis:
            state = self.collapse(state, confirmed_diagnosis)

        top = state.top_k(3)
        logger.info(
            f"QBR: '{chief_complaint}' + {len(findings or [])} findings → "
            f"top={top[0][0] if top else '?'} ({top[0][1]*100:.1f}%) "
            f"entropy={state.entropy():.2f}bits certainty={state.certainty_level()}"
        )
        return state

    # ── Helpers ───────────────────────────────────────────────────────────────

    @staticmethod
    def _map_complaint(complaint: str) -> str:
        """Map free-text chief complaint to a COMPLAINT_PRIORS key."""
        complaint_lower = complaint.lower()
        mapping = {
            "chest":       "chest_pain",
            "breath":      "shortness_of_breath",
            "dyspnea":     "shortness_of_breath",
            "shortness":   "shortness_of_breath",
            "sob":         "shortness_of_breath",
            "abdominal":   "abdominal_pain",
            "stomach":     "abdominal_pain",
            "belly":       "abdominal_pain",
            "head":        "headache",
            "fever":       "fever",
            "temperature": "fever",
            "neuro":       "neurological",
            "stroke":      "neurological",
            "weakness":    "neurological",
            "flank":       "flank_pain",
            "urine":       "flank_pain",
            "urinary":     "flank_pain",
            "conscious":   "altered_consciousness",
            "confusion":   "altered_consciousness",
            "unresponsive": "altered_consciousness",
        }
        for keyword, key in mapping.items():
            if keyword in complaint_lower:
                return key
        return "general"

    def list_known_findings(self) -> List[str]:
        return list(SYMPTOM_LRS.keys())

    def explain(self, state: DiagnosticState, top_n: int = 3) -> str:
        """Human-readable explanation of the current diagnostic state."""
        top = state.top_k(top_n)
        lines = [
            f"Quantum Diagnostic Reasoning — {state.update_count} evidence items applied",
            f"Diagnostic uncertainty: {state.entropy():.2f} / {state.max_entropy():.2f} bits "
            f"({state.certainty_level()} certainty)",
            "",
            "Differential Diagnosis:",
        ]
        for i, (diag, prob) in enumerate(top, 1):
            bar = "█" * int(prob * 20)
            lines.append(f"  {i}. {diag.replace('_', ' ').title():<35} {prob*100:5.1f}%  {bar}")
        if state.interference_log:
            lines.append("")
            lines.append("Quantum interference effects:")
            for entry in state.interference_log[-3:]:
                lines.append(f"  • {entry}")
        return "\n".join(lines)


# ─── Singleton ────────────────────────────────────────────────────────────────

_qbr: Optional[QuantumBayesianReasoner] = None


def get_qbr() -> QuantumBayesianReasoner:
    global _qbr
    if _qbr is None:
        _qbr = QuantumBayesianReasoner()
        logger.info("✅ QuantumBayesianReasoner initialized")
    return _qbr
