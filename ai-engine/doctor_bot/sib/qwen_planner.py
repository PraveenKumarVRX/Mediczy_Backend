"""
Qwen 2.5-3B Planning & Orchestration Engine
============================================

Qwen is the SIB central brain. Every request is:
1. Planned   — Qwen reads the request, outputs a JSON execution plan
2. Executed  — Brain runs plan steps against real botlets (in parallel groups)
3. Synthesized — Qwen composes the final answer from all botlet outputs

Botlets, task_router, and cloud LLMs (iSHA/Groq/Gemini) are commanded
workers; Qwen decides who does what, in what order.

Falls back to brain's hardcoded routing if Qwen is unavailable.
"""

import asyncio
import json
import logging
import re
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

logger = logging.getLogger("sib.qwen_planner")

# ─── Execution plan types ─────────────────────────────────────────────────────

@dataclass
class PlanStep:
    step: int
    botlet: str       # which botlet/backend to invoke
    action: str       # what action to perform
    params: Dict      # step-specific parameters
    depends_on: List[int] = field(default_factory=list)  # must complete before this step runs


@dataclass
class ExecutionPlan:
    intent: str
    urgency: str                       # low | medium | high | emergency
    steps: List[PlanStep]
    parallel_groups: List[List[int]]   # step numbers that can run concurrently per group
    synthesis_step: int                # step whose result is the primary answer
    reasoning: str
    raw: Dict                          # original JSON from Qwen


# ─── Qwen Planner ────────────────────────────────────────────────────────────

class QwenPlanner:
    """
    Qwen 2.5-3B as the SIB central planning and orchestration brain.

    Two inference calls per request:
    - plan():      classify intent, generate botlet execution plan (~200ms)
    - synthesize(): compose final answer from all botlet outputs  (~150ms)

    Both calls share the model already loaded by TinyLlamaRouter (zero extra RAM).
    """

    _PLAN_SYSTEM = (
        "You are the central planning brain of SIB (Synthetic Intelligence Brain) "
        "for Mediczy, a hospital management AI. "
        "Receive any medical or administrative request and output a precise JSON execution plan.\n\n"
        "═══ BOTLETS (executors you command) ═══════════════════════════════\n"
        "chat         — multi-turn conversation, general medical Q&A\n"
        "ehr          — EHR ingestion, patient record retrieval (RAG)\n"
        "risk         — Bayesian cardiovascular risk scoring\n"
        "summarizer   — medical document summarisation\n"
        "task         — task creation, updates, completion tracking\n"
        "notification — patient/doctor alerts and reminders\n"
        "insurance    — eligibility checks, claims, cost estimates\n"
        "web_search   — clinical guideline and literature search\n"
        "triage       — ESI urgency / emergency assessment\n"
        "drug_check   — drug interactions and contraindications\n"
        "knowledge    — medical knowledge base (diseases, drugs, guidelines)\n"
        "local        — Qwen CPU: conversational / low-complexity responses only\n\n"
        "═══ LLM BACKENDS (for deep clinical reasoning) ═════════════════════\n"
        "isha_gpu  — BiMediX2-8B / MedGemma-4B (best clinical AI, use first)\n"
        "groq      — Llama-3.3-70B cloud (fast fallback)\n"
        "gemini    — Gemini 1.5-flash (final fallback)\n\n"
        "═══ AUTOMATION ROUTES ══════════════════════════════════════════════\n"
        "appointment_schedule | appointment_reschedule | appointment_cancel\n"
        "generate_prescription | review_prescription\n"
        "send_reminder | send_notification\n"
        "health_diary_add | health_diary_update\n"
        "assess_risk | detect_emergency | process_ehr\n\n"
        "═══ OUTPUT FORMAT (JSON ONLY — no prose, no markdown fences) ════════\n"
        '{"intent":"string","urgency":"low|medium|high|emergency",'
        '"plan":[{"step":1,"botlet":"name","action":"action","params":{},"depends_on":[]}],'
        '"parallel_groups":[[1,2],[3],[4]],'
        '"synthesis_step":3,'
        '"reasoning":"brief"}\n\n'
        "═══ RULES ═══════════════════════════════════════════════════════════\n"
        "1. emergency → step 1 MUST be triage\n"
        "2. clinical queries → always include ehr retrieve step for RAG context\n"
        "3. Steps in the SAME parallel_group run concurrently (no inter-dependencies)\n"
        "4. MAX 5 steps — keep plans lean\n"
        "5. Greeting / small-talk → single step: {botlet:local, action:respond}\n"
        "6. synthesis_step = step number whose output is the primary answer\n"
        "7. RESPOND WITH VALID JSON ONLY"
    )

    _SYNTH_SYSTEM = (
        "You are the SIB response synthesizer for Mediczy hospital AI. "
        "Given a user request and outputs from multiple AI botlets, compose a single "
        "coherent, clinically accurate response. "
        "Be concise, warm, and professional. "
        "Return JSON only: "
        '{"answer":"string","confidence":0.0,"sources":["botlet1",...]}'
    )

    def __init__(self):
        self._llm = None

    def _get_llm(self):
        if self._llm is None:
            try:
                from sib.tinyllama_router import get_shared_llm
                self._llm = get_shared_llm()
            except Exception as e:
                logger.warning(f"QwenPlanner: cannot get shared LLM — {e}")
        return self._llm

    def _call_json(self, system: str, user_msg: str, max_tokens: int = 512) -> Optional[Dict]:
        """Single Qwen inference call; parse and return JSON dict."""
        llm = self._get_llm()
        if llm is None:
            return None
        try:
            t0 = time.time()
            resp = llm.create_chat_completion(
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user",   "content": user_msg},
                ],
                max_tokens=max_tokens,
                temperature=0.1,
                stop=["```", "\n\n\n"],
            )
            raw = resp["choices"][0]["message"]["content"].strip()
            raw = re.sub(r"^```json\s*|^```\s*|\s*```$", "", raw, flags=re.MULTILINE).strip()
            result = json.loads(raw)
            logger.info(f"QwenPlanner: {(time.time()-t0)*1000:.0f}ms")
            return result
        except Exception as e:
            logger.warning(f"QwenPlanner._call_json failed: {e}")
            return None

    # ── Public API ────────────────────────────────────────────────────────────

    def plan(self, request_type: str, data: Dict, context: Optional[Dict] = None) -> Optional[ExecutionPlan]:
        """
        Generate an execution plan for the incoming request.
        Returns None if Qwen is unavailable (brain falls back to hardcoded routing).
        """
        user_prompt = (
            f"Request type: {request_type}\n"
            f"Data: {json.dumps(data, default=str)[:800]}\n"
            f"Context: {json.dumps(context or {}, default=str)[:400]}\n"
            "Generate the execution plan:"
        )
        raw = self._call_json(self._PLAN_SYSTEM, user_prompt, max_tokens=512)
        if raw is None:
            return None
        try:
            steps = [
                PlanStep(
                    step=int(s["step"]),
                    botlet=str(s.get("botlet", "chat")),
                    action=str(s.get("action", "process")),
                    params=s.get("params") or {},
                    depends_on=[int(d) for d in s.get("depends_on", [])],
                )
                for s in raw.get("plan", [])
            ]
            if not steps:
                return None
            return ExecutionPlan(
                intent=raw.get("intent", request_type),
                urgency=raw.get("urgency", "low"),
                steps=steps,
                parallel_groups=raw.get("parallel_groups", [[s.step] for s in steps]),
                synthesis_step=int(raw.get("synthesis_step", steps[-1].step)),
                reasoning=raw.get("reasoning", ""),
                raw=raw,
            )
        except Exception as e:
            logger.warning(f"QwenPlanner: plan parsing failed — {e}")
            return None

    def synthesize(self, original_request: str, step_results: Dict[int, Any]) -> Dict:
        """
        Ask Qwen to compose a final answer from all botlet step outputs.
        Falls back to the last non-empty step result if synthesis fails.
        """
        results_summary = {
            f"step_{k}": (str(v)[:400] if not isinstance(v, str) else v[:400])
            for k, v in step_results.items()
        }
        user_prompt = (
            f"User request: {original_request[:600]}\n"
            f"Botlet outputs: {json.dumps(results_summary, default=str)}\n"
            "Synthesize a final response:"
        )
        result = self._call_json(self._SYNTH_SYSTEM, user_prompt, max_tokens=400)
        if result and result.get("answer"):
            return result
        # Fallback: last non-empty step result
        for v in reversed(list(step_results.values())):
            if isinstance(v, dict):
                answer = (
                    v.get("answer") or v.get("chat_answer") or
                    v.get("response") or v.get("summary") or str(v)
                )
                if answer:
                    return {"answer": answer, "confidence": 0.7, "sources": ["fallback"]}
        return {"answer": "I'm unable to process this request right now.", "confidence": 0.0, "sources": []}


# ─── Plan execution engine ────────────────────────────────────────────────────

async def execute_plan(plan: ExecutionPlan, brain: Any, original_data: Dict) -> Dict:
    """
    Execute an ExecutionPlan against the SIB brain.

    Steps within the same parallel_group run concurrently via asyncio.gather.
    Steps in later groups wait for all earlier groups to complete.
    Dependent step results are injected into params via _step_N_result keys.
    """
    step_map = {s.step: s for s in plan.steps}
    step_results: Dict[int, Any] = {}

    for group in plan.parallel_groups:
        valid_steps = [step_map[n] for n in group if n in step_map]
        if not valid_steps:
            continue

        if len(valid_steps) == 1:
            s = valid_steps[0]
            step_results[s.step] = await _execute_step(s, step_results, brain, original_data)
        else:
            tasks = [_execute_step(s, step_results, brain, original_data) for s in valid_steps]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            for s, r in zip(valid_steps, results):
                step_results[s.step] = r if not isinstance(r, Exception) else {"error": str(r)}

    return step_results


async def _execute_step(
    step: PlanStep,
    prior_results: Dict[int, Any],
    brain: Any,
    original_data: Dict,
) -> Any:
    """Map a single plan step to the corresponding brain/botlet method."""
    # Merge original data with step params; inject dependent step outputs
    params = {**original_data, **step.params}
    for dep in step.depends_on:
        if dep in prior_results:
            params[f"_step_{dep}_result"] = prior_results[dep]

    botlet = step.botlet.lower()
    action = step.action.lower()

    try:
        # ── Conversational / local ────────────────────────────────────────
        if botlet == "local":
            from sib.tinyllama_router import get_router
            router = get_router()
            decision = router.classify(params.get("message", ""), use_rag=False)
            return {"response": decision.quick_response or "How can I help you?", "provider": "local_qwen"}

        # ── Chat botlet ───────────────────────────────────────────────────
        elif botlet == "chat":
            return brain._handle_chat(params)

        # ── EHR botlet ────────────────────────────────────────────────────
        elif botlet == "ehr":
            if action in ("retrieve", "search", "query"):
                query = params.get("query") or params.get("message") or params.get("prompt") or ""
                return brain.ehr_bot.retrieve(query, patient_id=params.get("patient_id"))
            return brain._handle_ehr_upload(params)

        # ── Risk botlet ───────────────────────────────────────────────────
        elif botlet == "risk":
            return brain._handle_risk(params)

        # ── Summarizer botlet ─────────────────────────────────────────────
        elif botlet == "summarizer":
            return brain._handle_summarize(params)

        # ── Task botlet ───────────────────────────────────────────────────
        elif botlet == "task":
            return brain._handle_task(params)

        # ── Notification botlet ───────────────────────────────────────────
        elif botlet == "notification":
            return brain._handle_notification(params)

        # ── Insurance botlet ──────────────────────────────────────────────
        elif botlet == "insurance":
            return brain._handle_insurance(params)

        # ── Web search botlet ─────────────────────────────────────────────
        elif botlet == "web_search":
            return await brain._handle_web_search(params)

        # ── Triage botlet ─────────────────────────────────────────────────
        elif botlet == "triage":
            complaint = (
                params.get("chief_complaint") or
                params.get("complaint") or
                params.get("message") or ""
            )
            return brain.triage_patient(
                complaint,
                params.get("vitals") or params.get("vital_signs") or {},
                params,
            )

        # ── Drug check botlet ─────────────────────────────────────────────
        elif botlet == "drug_check":
            meds = params.get("medications") or params.get("drugs") or []
            if isinstance(meds, str):
                meds = [meds]
            return brain.check_drug_interactions(meds, params.get("conditions") or [])

        # ── Knowledge botlet ──────────────────────────────────────────────
        elif botlet == "knowledge":
            return brain.search_knowledge(
                params.get("query") or params.get("message") or "",
                params.get("category") or "all",
            )

        # ── LLM backends — direct inference ──────────────────────────────
        elif botlet in ("isha_gpu", "isha", "groq", "gemini", "llm", "llm_reasoning"):
            prompt = params.get("prompt") or params.get("message") or str(params)
            # Build prompt augmented with any dependent step context
            dep_context = " ".join(
                str(prior_results[d])[:400] for d in step.depends_on if d in prior_results
            )
            if dep_context:
                prompt = f"Context:\n{dep_context}\n\nQuery: {prompt}"
            return brain.llm_reasoning(prompt, params.get("system_prompt"))

        # ── Automation routes (delegated to task_router) ──────────────────
        elif botlet in (
            "appointment_schedule", "appointment_reschedule", "appointment_cancel",
            "generate_prescription", "review_prescription",
            "send_reminder", "send_notification",
            "health_diary_add", "health_diary_update",
            "assess_risk", "detect_emergency", "process_ehr",
        ):
            from sib.task_router import get_task_router, TaskType
            router = get_task_router()
            try:
                task_type = TaskType(botlet)
            except ValueError:
                task_type_map = {
                    "appointment_schedule":   "schedule_appointment",
                    "appointment_reschedule": "reschedule_appointment",
                    "appointment_cancel":     "cancel_appointment",
                    "generate_prescription":  "generate_prescription",
                    "review_prescription":    "review_prescription",
                    "send_reminder":          "send_reminder",
                    "send_notification":      "send_notification",
                    "health_diary_add":       "add_health_diary_entry",
                    "health_diary_update":    "update_health_diary",
                    "assess_risk":            "assess_risk",
                    "detect_emergency":       "detect_emergency",
                    "process_ehr":            "process_ehr",
                }
                task_type = TaskType(task_type_map.get(botlet, "create_task"))
            result = await router.route_task(
                task_type=task_type,
                payload=params,
                user_id=params.get("user_id"),
                patient_id=params.get("patient_id"),
                context=params.get("context"),
            )
            return result.to_dict()

        else:
            logger.warning(f"QwenPlanner: unknown botlet '{botlet}' — routing to LLM")
            prompt = params.get("message") or params.get("query") or str(params)
            return brain.llm_reasoning(prompt)

    except Exception as e:
        logger.error(f"Plan step {step.step} ({botlet}.{action}) failed: {e}")
        return {"error": str(e), "step": step.step, "botlet": botlet}


# ─── Singleton ────────────────────────────────────────────────────────────────

_planner: Optional[QwenPlanner] = None


def get_planner() -> QwenPlanner:
    global _planner
    if _planner is None:
        _planner = QwenPlanner()
    return _planner
