"""
Synthetic Intelligence Brain (SIB)
==================================

Central orchestration layer for Dr iSHA & Mediqzy applications.
Manages multiple specialized botlets for medical AI workflows.

Orchestration Model (v2 — Qwen as Brain):
  Every inbound request is planned, executed, and synthesized by Qwen 2.5-3B:

    Request
       │
       ▼
  ┌─────────────────────────────────┐
  │  QwenPlanner.plan()  (~200ms)   │  ← Qwen generates JSON execution plan
  │  Intent + urgency + step list   │    (botlets, actions, parallel groups)
  └──────────────┬──────────────────┘
                 │ ExecutionPlan
                 ▼
  ┌──────────────────────────────────────────────────────────┐
  │  execute_plan() — parallel asyncio groups                │
  │                                                          │
  │  [ehr.retrieve]  [triage.assess]  ←── parallel group 1  │
  │        └──────────────┘                                  │
  │               ▼                                          │
  │     [isha_gpu.reason]          ←── group 2 (depends)    │
  │               ▼                                          │
  │     [risk.evaluate]            ←── group 3              │
  └──────────────────────────────────────────────────────────┘
                 │ step_results
                 ▼
  ┌─────────────────────────────────┐
  │ QwenPlanner.synthesize() ~150ms │  ← Qwen composes unified final answer
  └─────────────────────────────────┘

Components:
- QwenPlanner:              Central brain — plan + synthesize (Qwen 2.5-3B CPU)
- SyntheticIntelligenceBrain: Execution engine + botlet registry
- ChatBotlet:               Multi-turn conversational AI
- EHRBotlet:                EHR ingestion, preprocessing, retrieval
- RiskBotlet:               Bayesian Network reasoning, risk scoring
- SummarizerBotlet:         Medical summarization
- TaskBotlet:               Workflow automation, task scheduling
- NotificationBotlet:       Alerts, reminders, notifications
- InsuranceBotlet:          Insurance eligibility, claims processing
- QwenTaskSynthesizer:      Task-level intelligence (appointments, reminders)
- SharedMemory:             Cross-botlet memory and context

LLM Stack:
1. Qwen 2.5-3B (CPU, local)     — planning, synthesis, task ops, intent routing
2. ai.isha.buzz GPU nodes        — BiMediX2-8B / MedGemma-4B (clinical reasoning)
3. Groq API                      — cloud accelerator fallback
4. Gemini API                    — cloud LLM fallback
"""

__version__ = "2.0.0"
__author__ = "Mediczy AI Team"

from .brain import SyntheticIntelligenceBrain
from .memory import SharedMemory
from .qwen_planner import QwenPlanner, get_planner, ExecutionPlan, PlanStep

__all__ = [
    "SyntheticIntelligenceBrain",
    "SharedMemory",
    "QwenPlanner",
    "get_planner",
    "ExecutionPlan",
    "PlanStep",
]
