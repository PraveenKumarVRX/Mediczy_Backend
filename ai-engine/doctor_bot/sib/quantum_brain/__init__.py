"""
Quantum Brain — Quantum Bayesian Reasoning for Medical Diagnosis
================================================================

Applies quantum probability theory to differential diagnosis:
  - Superposition of candidate diagnoses
  - Lüders rule amplitude updates (√LR, not LR)
  - Constructive/destructive interference between correlated diagnoses
  - Born rule measurement: P(D) = |α|²
  - Diagnostic entropy as uncertainty measure
"""

from .qbr import QuantumBayesianReasoner, DiagnosticState, get_qbr
from .qbr_botlet import QBRBotlet

__all__ = ["QuantumBayesianReasoner", "DiagnosticState", "get_qbr", "QBRBotlet"]
