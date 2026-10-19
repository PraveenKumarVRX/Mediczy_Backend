"""
Synthetic Intelligence Brain (SIB) - Core Orchestrator
=======================================================

Central brain that orchestrates all botlets for Dr iSHA & Mediqzy.
Routes requests, aggregates outputs, applies reasoning & safety filters.

Orchestration Model (v2):
  Every request → QwenPlanner.plan() → ExecutionPlan
  Brain executes plan steps (parallel asyncio groups) against real botlets.
  QwenPlanner.synthesize() composes the final unified answer.
  Falls back to hardcoded routing if Qwen is unavailable.
"""

import asyncio
import hashlib
import inspect
import os
import time
import logging
from typing import Dict, Any, Optional, List, Callable
from datetime import datetime
from enum import Enum

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("sib.brain")

# ─── Module-level singletons (one-time cost) ─────────────────────────────────

_groq_client = None          # Groq SDK client — created once
_openai_client = None        # OpenAI SDK client — created once
_gemini_model = None         # Gemini GenerativeModel — created once
_isha_session = None         # httpx.Client with keep-alive for iSHA GPU

# ─── LLM response cache ───────────────────────────────────────────────────────
# ─── Thread-safe LLM response cache ─────────────────────────────────────────
# SHA-256 keyed; user_id isolated so Patient A never sees Patient B's answer.
# Sensitive clinical queries are never cached (see _is_sensitive_query).
import threading as _threading

_llm_cache: Dict[str, tuple] = {}
_llm_cache_lock = _threading.Lock()
_LLM_CACHE_TTL = 300  # 5 minutes

# Query patterns that MUST NOT be cached (patient-specific or high-stakes)
_SKIP_CACHE_PATTERNS = (
    "chest pain", "emergency", "heart attack", "stroke", "unconscious",
    "bleeding", "suicide", "overdose", "anaphylaxis", "cardiac",
)

_STUB_RESPONSE_MARKERS = (
    "Integrate vLLM or llama.cpp backend",
    "enable real inference with BiMediX2",
    "This is a stub response",
)


def _is_stub_response(text: Any) -> bool:
    return any(marker in str(text or "") for marker in _STUB_RESPONSE_MARKERS)


def _normalize_provider_url(url: str, default: str) -> str:
    """Normalize provider URL and correct the common insha-inc typo."""
    value = (url or default).strip().rstrip("/")
    if "insha-inc.com" in value:
        logger.warning("Correcting provider URL typo insha-inc.com -> isha-inc.com")
        value = value.replace("insha-inc.com", "isha-inc.com")
    if not value.startswith(("http://", "https://")):
        value = "https://" + value
    return value


def _is_sensitive_query(prompt: str) -> bool:
    p = prompt.lower()
    return any(kw in p for kw in _SKIP_CACHE_PATTERNS)


def _cache_key(prompt: str, system: Optional[str], user_id: Optional[str] = None) -> str:
    """SHA-256 cache key with user isolation — prevents cross-patient PHI leakage."""
    raw = f"{user_id or 'anon'}|||{system or ''}|||{prompt}"
    return hashlib.sha256(raw.encode()).hexdigest()


def _cache_get(prompt: str, system: Optional[str], user_id: Optional[str] = None) -> Optional[Dict]:
    if _is_sensitive_query(prompt):
        return None  # Never serve cached answers for high-stakes queries
    key = _cache_key(prompt, system, user_id)
    with _llm_cache_lock:
        entry = _llm_cache.get(key)
        if entry and (time.time() - entry[1]) < _LLM_CACHE_TTL:
            return {**entry[0], "cached": True}
        if entry:
            del _llm_cache[key]
    return None


def _cache_set(prompt: str, system: Optional[str], result: Dict, user_id: Optional[str] = None) -> None:
    if _is_sensitive_query(prompt):
        return  # Do not cache sensitive clinical responses
    key = _cache_key(prompt, system, user_id)
    with _llm_cache_lock:
        _llm_cache[key] = (result, time.time())
        if len(_llm_cache) > 512:
            now = time.time()
            expired = [k for k, (_, ts) in list(_llm_cache.items()) if now - ts > _LLM_CACHE_TTL]
            for k in expired:
                _llm_cache.pop(k, None)


def _get_groq_client():
    """Return singleton Groq client (instantiated once)."""
    global _groq_client
    if _groq_client is None:
        from groq import Groq
        _groq_client = Groq(api_key=os.environ.get("GROQ_API_KEY", ""))
    return _groq_client


def _get_openai_client():
    """Return singleton OpenAI client (instantiated once)."""
    global _openai_client
    if _openai_client is None:
        from openai import OpenAI
        _openai_client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY", ""))
    return _openai_client


def _get_gemini_model():
    """Return singleton Gemini GenerativeModel (instantiated once)."""
    global _gemini_model
    if _gemini_model is None:
        import google.generativeai as genai
        genai.configure(api_key=os.environ.get("GEMINI_API_KEY", ""))
        _gemini_model = genai.GenerativeModel("gemini-1.5-flash")
    return _gemini_model


def _get_isha_session() -> "httpx.Client":
    """Return persistent httpx.Client for iSHA GPU (connection pool + keep-alive)."""
    global _isha_session
    if _isha_session is None or _isha_session.is_closed:
        import httpx
        _isha_session = httpx.Client(
            timeout=httpx.Timeout(connect=5.0, read=60.0, write=10.0, pool=5.0),
            limits=httpx.Limits(max_connections=10, max_keepalive_connections=5),
            headers={"User-Agent": "Mediczy-SIB/3.0"},
        )
    return _isha_session


class RequestType(Enum):
    """Supported request types for SIB"""
    CHAT = "chat"
    QUERY = "query"
    EHR_UPLOAD = "ehr_upload"
    TASK = "task"
    NOTIFY = "notify"
    INSURANCE = "insurance"
    RISK = "risk"
    SUMMARIZE = "summarize"
    WEB_SEARCH = "web_search"
    HEALTH_CHECK = "health_check"
    # New enhanced types
    AGENT_QUERY = "agent_query"
    KNOWLEDGE_SEARCH = "knowledge_search"
    SYMPTOM_CHECK = "symptom_check"
    TRIAGE = "triage"
    DRUG_CHECK = "drug_check"
    HYBRID_SEARCH = "hybrid_search"


class LLMProvider(Enum):
    """LLM providers in fallback order (node1/node2 are both iSHA private GPU infrastructure)"""
    LLAMA_LOCAL = "isha_node1_bimedix2"    # ai.isha.buzz — BiMediX2-8B / InsuranceLLM
    ISHA_INC    = "isha_node2"             # isha-inc.com — single-model gateway (qwen3-8b-q5-k-m); SIB does the orchestration
    GROQ        = "groq"                   # cloud fallback 1
    OPENAI      = "openai"                 # cloud fallback 2
    GEMINI      = "gemini"                 # cloud fallback 3


class SyntheticIntelligenceBrain:
    """
    Synthetic Intelligence Brain (SIB)
    
    Central orchestrator for all medical AI botlets.
    Handles request routing, LLM fallback, and response aggregation.
    
    Self-Learning Features:
    - Collects user feedback (ratings, corrections)
    - Analyzes patterns in negative feedback
    - Applies learning insights to improve responses
    """
    
    def __init__(self, config: Optional[Dict] = None):
        """
        Initialize the Synthetic Intelligence Brain.
        
        Args:
            config: Optional configuration dict
        """
        self.config = config or {}
        self.start_time = datetime.now()
        self.request_count = 0
        self.botlet_stats = {}
        
        # Initialize botlets (lazy loading)
        self._chat_bot = None
        self._ehr_bot = None
        self._risk_bot = None
        self._summarizer_bot = None
        self._task_bot = None
        self._notification_bot = None
        self._insurance_bot = None
        self._web_search_bot = None
        self._langgraph_agent = None
        self._qbr_bot = None        # Quantum Bayesian Reasoner botlet
        
        # Shared memory
        self._memory = None
        
        # Learning pipeline (lazy loading)
        self._learning_pipeline = None
        
        # LLM settings
        self.llm_timeout = self.config.get("llm_timeout", 30)
        self.llm_max_retries = self.config.get("llm_max_retries", 2)
        
        # API keys (loaded from environment — no hardcoded fallbacks)
        self.groq_api_key = os.environ.get("GROQ_API_KEY", "")
        self.gemini_api_key = os.environ.get("GEMINI_API_KEY", "")
        
        if not self.groq_api_key:
            logger.warning("⚠️ GROQ_API_KEY not set — LLM fallback unavailable")
        
        logger.info("🧠 Synthetic Intelligence Brain initialized")
    
    # ==================== Lazy Botlet Loading ====================
    
    @property
    def memory(self):
        """Shared memory instance"""
        if self._memory is None:
            from .memory import SharedMemory
            self._memory = SharedMemory()
        return self._memory
    
    @property
    def chat_bot(self):
        """ChatBotlet instance"""
        if self._chat_bot is None:
            from .botlets.chat_botlet import ChatBotlet
            self._chat_bot = ChatBotlet(self.memory, self.llm_reasoning)
        return self._chat_bot
    
    @property
    def ehr_bot(self):
        """EHRBotlet instance"""
        if self._ehr_bot is None:
            from .botlets.ehr_botlet import EHRBotlet
            self._ehr_bot = EHRBotlet(self.memory)
        return self._ehr_bot
    
    @property
    def risk_bot(self):
        """RiskBotlet instance"""
        if self._risk_bot is None:
            from .botlets.risk_botlet import RiskBotlet
            self._risk_bot = RiskBotlet(self.memory)
        return self._risk_bot
    
    @property
    def summarizer_bot(self):
        """SummarizerBotlet instance"""
        if self._summarizer_bot is None:
            from .botlets.summarizer_botlet import SummarizerBotlet
            self._summarizer_bot = SummarizerBotlet(self.memory, self.llm_reasoning)
        return self._summarizer_bot
    
    @property
    def task_bot(self):
        """TaskBotlet instance"""
        if self._task_bot is None:
            from .botlets.task_botlet import TaskBotlet
            self._task_bot = TaskBotlet(self.memory)
        return self._task_bot
    
    @property
    def notification_bot(self):
        """NotificationBotlet instance"""
        if self._notification_bot is None:
            from .botlets.notification_botlet import NotificationBotlet
            self._notification_bot = NotificationBotlet(self.memory)
        return self._notification_bot
    
    @property
    def insurance_bot(self):
        """InsuranceBotlet instance"""
        if self._insurance_bot is None:
            from .botlets.insurance_botlet import InsuranceBotlet
            self._insurance_bot = InsuranceBotlet(self.memory, self.llm_reasoning)
        return self._insurance_bot
    
    @property
    def web_search_bot(self):
        """WebSearchBotlet instance"""
        if self._web_search_bot is None:
            from .botlets.web_search_botlet import WebSearchBotlet
            self._web_search_bot = WebSearchBotlet(self.memory)
        return self._web_search_bot

    @property
    def qbr_bot(self):
        """QuantumBayesianReasoner botlet — quantum differential diagnosis."""
        if self._qbr_bot is None:
            from .quantum_brain.qbr_botlet import QBRBotlet
            self._qbr_bot = QBRBotlet(self.memory)
        return self._qbr_bot

    @property
    def langgraph_agent(self):
        """LangGraph orchestration agent over SIB botlets"""
        if self._langgraph_agent is None:
            from .agent.langgraph_agent import get_langgraph_agent
            self._langgraph_agent = get_langgraph_agent(self, getattr(self, "db", None))
        return self._langgraph_agent
    
    @property
    def learning_pipeline(self):
        """Learning pipeline instance for self-improvement"""
        if self._learning_pipeline is None:
            from .learning_pipeline import get_learning_pipeline
            self._learning_pipeline = get_learning_pipeline(llm_fn=self.llm_reasoning)
        return self._learning_pipeline
    
    # ==================== LLM Reasoning with Fallback ====================
    
    def _is_insurance_query(self, prompt: str) -> bool:
        """Return True if the prompt is insurance/underwriting domain."""
        keywords = ['insurance', 'claim', 'billing', 'coverage', 'policy', 'premium',
                    'deductible', 'copay', 'reimbursement', 'pre-authorization', 'network',
                    'underwriting', 'loss ratio', 'loading', 'irdai', 'tpa', 'gmc', 'gpa',
                    'cashless', 'preauth', 'sum insured', 'co-pay', 'mediclaim']
        lower = prompt.lower()
        return any(kw in lower for kw in keywords)

    def llm_reasoning(self, prompt: str, system_prompt: Optional[str] = None,
                      user_id: Optional[str] = None,
                      cognitive_tier: Optional[str] = None) -> Dict[str, Any]:
        """
        Primary LLM reasoning with tier-aware GPU routing + 5-tier fallback.

        cognitive_tier routing:
          'deep'               → node1 (RTX 3090 / BiMediX2-8B) first — clinical reasoning
          'standard'/'reflex'  → node2 (RTX 3060 / GPT-OSS) first — fast/general
          None (default)       → node1 first (legacy behaviour)

        Full fallback order when node1 is preferred:
          node1 → node2 → Groq → OpenAI → Gemini

        Full fallback order when node2 is preferred (REFLEX/STANDARD):
          node2 → node1 → Groq → OpenAI → Gemini

        user_id is required for cache isolation — each patient's cache is keyed separately
        so Patient A never receives Patient B's cached clinical response.
        """
        start_time = time.time()

        # Fast path: return cached result for identical (user, prompt) pairs
        cached = _cache_get(prompt, system_prompt, user_id)
        if cached:
            logger.debug("LLM cache hit")
            return cached

        # Determine whether this is a REFLEX/STANDARD (node2-first) or DEEP (node1-first) task
        tier = (cognitive_tier or 'deep').lower()
        node2_first = tier in ('reflex', 'standard')

        if node2_first:
            # ── REFLEX / STANDARD: try node2 (3060/GPT-OSS) first ──────────
            try:
                node2_model = "insurance-llm" if self._is_insurance_query(prompt) else "medgemma-4b"
                result = self._isha_inc_inference(prompt, system_prompt, model=node2_model)
                result["provider"] = LLMProvider.ISHA_INC.value
                result["latency_ms"] = round((time.time() - start_time) * 1000, 2)
                logger.info(f"✅ iSHA node2 ({node2_model}) [tier={tier}]: {result['latency_ms']}ms")
                _cache_set(prompt, system_prompt, result, user_id)
                return result
            except Exception as e:
                logger.warning(f"⚠️ iSHA node2 failed (tier={tier}): {e}")

            # node2 down → try node1 as fallback for STANDARD/REFLEX
            try:
                result = self._local_gpu_inference(prompt, system_prompt)
                result["provider"] = LLMProvider.LLAMA_LOCAL.value
                result["latency_ms"] = round((time.time() - start_time) * 1000, 2)
                logger.info(f"✅ iSHA node1 fallback [tier={tier}]: {result['latency_ms']}ms")
                _cache_set(prompt, system_prompt, result, user_id)
                return result
            except Exception as e:
                logger.warning(f"⚠️ iSHA node1 fallback failed (tier={tier}): {e}")
        else:
            # ── DEEP (default): try node1 (3090/Bimedix) first ─────────────
            try:
                result = self._local_gpu_inference(prompt, system_prompt)
                result["provider"] = LLMProvider.LLAMA_LOCAL.value
                result["latency_ms"] = round((time.time() - start_time) * 1000, 2)
                logger.info(f"✅ iSHA node1 inference [tier={tier}]: {result['latency_ms']}ms model={result.get('model','?')}")
                _cache_set(prompt, system_prompt, result, user_id)
                return result
            except Exception as e:
                logger.warning(f"⚠️ iSHA node1 failed (tier={tier}): {e}")

            # node1 down → try node2 as fallback for DEEP
            try:
                node2_model = "insurance-llm" if self._is_insurance_query(prompt) else "medgemma-4b"
                result = self._isha_inc_inference(prompt, system_prompt, model=node2_model)
                result["provider"] = LLMProvider.ISHA_INC.value
                result["latency_ms"] = round((time.time() - start_time) * 1000, 2)
                logger.info(f"✅ iSHA node2 ({node2_model}) fallback [tier={tier}]: {result['latency_ms']}ms")
                _cache_set(prompt, system_prompt, result, user_id)
                return result
            except Exception as e:
                logger.warning(f"⚠️ iSHA node2 fallback failed (tier={tier}): {e}")

        # Groq (cloud fallback 1)
        try:
            result = self._groq_inference(prompt, system_prompt)
            result["provider"] = LLMProvider.GROQ.value
            result["latency_ms"] = round((time.time() - start_time) * 1000, 2)
            logger.info(f"✅ Groq fallback: {result['latency_ms']}ms")
            _cache_set(prompt, system_prompt, result, user_id)
            return result
        except Exception as e:
            logger.warning(f"⚠️ Groq failed: {e}")

        # OpenAI (cloud fallback 2)
        try:
            result = self._openai_inference(prompt, system_prompt)
            result["provider"] = LLMProvider.OPENAI.value
            result["latency_ms"] = round((time.time() - start_time) * 1000, 2)
            logger.info(f"✅ OpenAI fallback: {result['latency_ms']}ms")
            _cache_set(prompt, system_prompt, result, user_id)
            return result
        except Exception as e:
            logger.warning(f"⚠️ OpenAI failed: {e}")

        # Gemini (cloud fallback 3)
        try:
            result = self._gemini_inference(prompt, system_prompt)
            result["provider"] = LLMProvider.GEMINI.value
            result["latency_ms"] = round((time.time() - start_time) * 1000, 2)
            logger.info(f"✅ Gemini fallback: {result['latency_ms']}ms")
            _cache_set(prompt, system_prompt, result, user_id)
            return result
        except Exception as e:
            logger.error(f"❌ All LLM providers failed: {e}")
            return {
                "answer": "I'm unable to process your request right now. Please try again shortly.",
                "error": str(e),
                "provider": "none",
                "latency_ms": round((time.time() - start_time) * 1000, 2),
            }
    
    def _select_gpu_model(self, prompt: str) -> tuple:
        """
        Select the best GPU model based on query content.
        
        Available models on 3090 GPU server (updated):
        - Port 8080: BiMediX2-8B (best clinical AI Doctor)
        - Port 8082: Qwen-0.6B (fast/scribe)
        - Port 8083: OpenInsurance-8B (billing, claims)
        
        Returns: (port, model_name, agent_type)
        """
        prompt_lower = prompt.lower()
        
        # Insurance/billing keywords → OpenInsurance (8083)
        insurance_keywords = ['insurance', 'claim', 'billing', 'coverage', 'policy', 
                             'premium', 'deductible', 'copay', 'reimbursement', 
                             'pre-authorization', 'network', 'hmo', 'ppo']
        if any(kw in prompt_lower for kw in insurance_keywords):
            return 8083, "openinsurancellm-llama3-8b", "Billing"
        
        # Default: Use BiMediX2 (8080) for all medical queries - best clinical AI
        return 8080, "BiMediX2-8B", "Clinical"
    
    def _local_gpu_inference(self, prompt: str, system_prompt: Optional[str] = None,
                             max_tokens: int = 1024, temperature: float = 0.7) -> Dict[str, Any]:
        """iSHA GPU node1 via ai.isha.buzz — persistent httpx session (connection reuse)."""
        port, model_name, agent_type = self._select_gpu_model(prompt)
        gpu_url = _normalize_provider_url(os.environ.get("ISHA_AI_URL", ""), "https://ai.isha.buzz")
        logger.info(f"🧠 iSHA node1: {model_name} port={port} agent={agent_type}")

        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        headers = {"Content-Type": "application/json"}
        try:
            from utils.retrieval_llm import _get_isha_token
            token = _get_isha_token()
            if token:
                headers["Authorization"] = f"Bearer {token}"
        except Exception:
            pass

        session = _get_isha_session()
        response = session.post(
            f"{gpu_url}/v1/chat/completions",
            headers=headers,
            json={
                "messages": messages,
                "max_tokens": max_tokens,
                "temperature": temperature,
                "agent_type": agent_type,
                "model_port": port,
            },
        )
        response.raise_for_status()
        data = response.json()
        content = data["choices"][0]["message"]["content"]
        if _is_stub_response(content):
            raise RuntimeError("iSHA node1 returned stub placeholder")
        return {"answer": content, "model": data.get("model", model_name)}

    def _groq_inference(self, prompt: str, system_prompt: Optional[str] = None) -> Dict[str, Any]:
        """Groq API — singleton client, no per-request instantiation."""
        client = _get_groq_client()
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=messages,
            max_tokens=1024,
            temperature=0.7,
        )
        return {"answer": response.choices[0].message.content, "model": "llama-3.3-70b-versatile"}

    def _isha_inc_inference(self, prompt: str, system_prompt: Optional[str] = None,
                            model: str = "insurance-llm", max_tokens: int = 512) -> Dict[str, Any]:
        """iSHA GPU node2 via isha-inc.com — persistent httpx session (connection reuse)."""
        api_key = os.environ.get("ISHA_INC_API_KEY", "")
        base_url = _normalize_provider_url(os.environ.get("ISHA_INC_URL", ""), "https://isha-inc.com")

        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        session = _get_isha_session()
        response = session.post(
            f"{base_url}/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            json={"model": model, "messages": messages, "max_tokens": max_tokens, "temperature": 0.3},
            timeout=10.0,
        )
        response.raise_for_status()
        data = response.json()
        content = data["choices"][0]["message"]["content"]
        if _is_stub_response(content):
            raise RuntimeError("iSHA node2 returned stub placeholder")
        return {"answer": content, "model": data.get("model", model)}

    def _openai_inference(self, prompt: str, system_prompt: Optional[str] = None) -> Dict[str, Any]:
        """OpenAI gpt-3.5-turbo — cloud fallback 2 (singleton client)."""
        client = _get_openai_client()
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})
        response = client.chat.completions.create(
            model="gpt-3.5-turbo", messages=messages, max_tokens=1024, temperature=0.7,
        )
        return {"answer": response.choices[0].message.content, "model": "gpt-3.5-turbo"}

    def _gemini_inference(self, prompt: str, system_prompt: Optional[str] = None) -> Dict[str, Any]:
        """Gemini 1.5-flash — cloud fallback 3 (singleton model)."""
        model = _get_gemini_model()
        full_prompt = f"{system_prompt}\n\n{prompt}" if system_prompt else prompt
        response = model.generate_content(full_prompt)
        return {"answer": response.text, "model": "gemini-1.5-flash"}
    
    # ==================== Request Handling ====================
    
    async def handle_request(self, request_type: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Main request handler — Qwen-planned orchestration with hardcoded fallback.

        Flow:
          1. Health-check and purely local types bypass the planner (no overhead).
          2. QwenPlanner.plan() generates a multi-step execution plan.
          3. execute_plan() runs steps in parallel asyncio groups against real botlets.
          4. QwenPlanner.synthesize() composes a unified final answer.
          5. If Qwen is unavailable → hardcoded routing fallback.
        """
        self.request_count += 1
        start_time = time.time()
        self.botlet_stats[request_type] = self.botlet_stats.get(request_type, 0) + 1

        try:
            # ── Fast-path: types that never need planning ──────────────────
            if request_type == RequestType.HEALTH_CHECK.value:
                return self._health_check()

            # ── ITEM-24: regex intent classifier replaces Qwen planner ─────
            # For CHAT requests, run classify_intent to annotate the data dict
            # with the detected intent so _handle_chat / botlets can specialise.
            if request_type == RequestType.CHAT.value:
                try:
                    from sib.tinyllama_router import classify_intent
                    message = data.get("message", "")
                    if message:
                        detected = classify_intent(message)
                        # Inject intent into data so _handle_chat can act on it
                        data = {**data, "_intent": detected}
                        logger.info(f"regex classifier: intent={detected} for chat request")
                except Exception as _cls_err:
                    logger.debug(f"classify_intent skipped: {_cls_err}")

            # ── Qwen planner path (kept for /planner/plan endpoint — Qwen
            #    returns None when GGUF unavailable, falls through naturally) ─
            try:
                from sib.qwen_planner import get_planner, execute_plan

                planner = get_planner()
                # plan() returns None immediately when _llm is None (ITEM-24)
                plan = await asyncio.to_thread(planner.plan, request_type, data)

                if plan is not None:
                    logger.info(
                        f"QwenPlanner: intent={plan.intent} urgency={plan.urgency} "
                        f"steps={len(plan.steps)} groups={plan.parallel_groups} "
                        f"reasoning='{plan.reasoning}'"
                    )

                    step_results = await execute_plan(plan, self, data)

                    request_text = (
                        data.get("message") or data.get("query") or
                        data.get("prompt") or request_type
                    )
                    synthesis = await asyncio.to_thread(
                        planner.synthesize, str(request_text), step_results
                    )

                    elapsed = round((time.time() - start_time) * 1000, 2)
                    result = {
                        "answer":        synthesis.get("answer"),
                        "chat_answer":   synthesis.get("answer"),
                        "confidence":    synthesis.get("confidence"),
                        "sources":       synthesis.get("sources"),
                        "intent":        plan.intent,
                        "urgency":       plan.urgency,
                        "plan_steps":    len(plan.steps),
                        "plan_reasoning": plan.reasoning,
                        "provider":      "qwen_orchestrated",
                        "latency_ms":    elapsed,
                    }
                    try:
                        from sib.synthetic_intelligence import get_outcome_tracker
                        get_outcome_tracker().record(result, request_type)
                    except Exception:
                        pass
                    return result
            except Exception as plan_err:
                logger.debug(f"QwenPlanner path skipped ({plan_err}), using direct routing")

            # ── Primary path (ITEM-24): direct botlet routing ──────────────
            return await self._hardcoded_route(request_type, data, start_time)

        except Exception as e:
            logger.error(f"❌ Request handling error: {e}")
            import traceback
            traceback.print_exc()
            return {
                "error": str(e),
                "request_type": request_type,
                "latency_ms": round((time.time() - start_time) * 1000, 2),
            }

    async def _hardcoded_route(
        self, request_type: str, data: Dict[str, Any], start_time: float
    ) -> Dict[str, Any]:
        """
        Static routing fallback — used when QwenPlanner is unavailable.

        All synchronous _handle_* methods are wrapped with asyncio.to_thread()
        so they never block the uvicorn event loop.  Without this, a single
        60-second LLM call would freeze ALL concurrent requests.
        """
        logger.warning("⚠️ QwenPlanner fallback active — hardcoded routing for: %s", request_type)

        if request_type == RequestType.CHAT.value:
            return await asyncio.to_thread(self._handle_chat, data)
        elif request_type == RequestType.QUERY.value:
            return await asyncio.to_thread(self._handle_query, data)
        elif request_type == RequestType.EHR_UPLOAD.value:
            return await asyncio.to_thread(self._handle_ehr_upload, data)
        elif request_type == RequestType.TASK.value:
            return await asyncio.to_thread(self._handle_task, data)
        elif request_type == RequestType.NOTIFY.value:
            return await asyncio.to_thread(self._handle_notification, data)
        elif request_type == RequestType.INSURANCE.value:
            return await asyncio.to_thread(self._handle_insurance, data)
        elif request_type == RequestType.RISK.value:
            return await asyncio.to_thread(self._handle_risk, data)
        elif request_type == RequestType.SUMMARIZE.value:
            return await asyncio.to_thread(self._handle_summarize, data)
        elif request_type == RequestType.WEB_SEARCH.value:
            return await self._handle_web_search(data)  # already async
        elif request_type == RequestType.AGENT_QUERY.value:
            return await asyncio.to_thread(
                self.query_with_agent,
                data.get("query", ""),
                data.get("context", data.get("patient_data", {}))
            )
        elif request_type == RequestType.KNOWLEDGE_SEARCH.value:
            return await asyncio.to_thread(
                self.search_knowledge, data.get("query", ""), data.get("category", "all")
            )
        elif request_type == RequestType.SYMPTOM_CHECK.value:
            symptoms = data.get("symptoms", [])
            if isinstance(symptoms, str):
                symptoms = [symptoms]
            return await asyncio.to_thread(self.classify_symptoms, symptoms, data.get("context", {}))
        elif request_type == RequestType.TRIAGE.value:
            complaint = data.get("chief_complaint") or data.get("complaint") or ""
            symptoms = data.get("symptoms", [])
            if isinstance(symptoms, list) and symptoms:
                complaint = f"{complaint}. Also: {', '.join(symptoms)}" if complaint else ", ".join(symptoms)
            elif isinstance(symptoms, str) and not complaint:
                complaint = symptoms
            vitals = data.get("vital_signs") or data.get("vitals") or {}
            ctx = {"age": data.get("patient_age"), **(data.get("context") or {})}
            return await asyncio.to_thread(self.triage_patient, complaint, vitals, ctx)
        elif request_type == RequestType.DRUG_CHECK.value:
            meds = data.get("drugs") or data.get("medications") or []
            if isinstance(meds, str):
                meds = [meds]
            return await asyncio.to_thread(
                self.check_drug_interactions, meds, data.get("patient_conditions", [])
            )
        elif request_type == RequestType.HYBRID_SEARCH.value:
            return await asyncio.to_thread(
                self.hybrid_search, data.get("query", ""), data.get("k", 5), data.get("method", "hybrid")
            )
        else:
            return {
                "error": f"Unknown request type: {request_type}",
                "supported_types": [rt.value for rt in RequestType],
            }
    
    def _handle_chat(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle multi-turn chat request with self-learning integration"""
        patient_id = data.get("patient_id", "default")
        message = data.get("message", "")
        include_risk = data.get("include_risk", False)
        include_rag = data.get("include_rag", True)
        patient_data = data.get("patient_data")
        cognitive_tier = data.get("cognitive_tier")  # 'deep'|'standard'|'reflex' from Node.js HAIS

        # Carry KB RAG context (injected by /chat endpoint) through to chat_bot
        kb_context = data.get("kb_context", "")
        if kb_context:
            patient_data = {**(patient_data or {}), "_kb_context": kb_context}

        use_langgraph = (
            os.environ.get("SIB_LANGGRAPH_ENABLED", "true").lower() == "true"
            and not data.get("disable_langgraph")
        )

        if use_langgraph:
            agent_result = self.langgraph_agent.run(
                patient_id=patient_id,
                message=message,
                patient_data=patient_data,
            )
            response_text = agent_result.get("chat_answer", "")
            learning_applied = False
            if response_text and self.learning_pipeline:
                try:
                    improved = self.learning_pipeline.apply_insights_to_response(
                        query=message,
                        response=response_text
                    )
                    if isinstance(improved, str) and improved != response_text:
                        response_text = improved
                        learning_applied = True
                except Exception as e:
                    logger.warning(f"Learning insight application failed: {e}")

            risk_result = None
            if include_risk and patient_data:
                risk_result = self.risk_bot.evaluate(patient_data)

            return {
                "chat_answer": response_text,
                "conversation_id": agent_result.get("conversation_id"),
                "turn_count": agent_result.get("tool_result", {}).get("raw", {}).get("turn_count"),
                "risk": risk_result,
                "provider": agent_result.get("provider"),
                "learning_applied": learning_applied,
                "agent": {
                    "engine": "langgraph",
                    "intent": agent_result.get("intent"),
                    "tool_result": agent_result.get("tool_result"),
                    "requires_confirmation": agent_result.get("requires_confirmation"),
                    "human_review_required": agent_result.get("human_review_required"),
                    "trace": agent_result.get("trace"),
                    "latency_ms": agent_result.get("latency_ms"),
                }
            }
        
        # Get chat response
        chat_result = self.chat_bot.respond(
            patient_id,
            message,
            include_rag=include_rag,
            include_risk=include_risk,
            patient_data=patient_data
        )
        
        # Apply learning insights to improve response
        response_text = chat_result.get("response", "")
        learning_applied = False
        if response_text and self.learning_pipeline:
            try:
                improved = self.learning_pipeline.apply_insights_to_response(
                    query=message,
                    response=response_text
                )
                if isinstance(improved, str) and improved != response_text:
                    response_text = improved
                    learning_applied = True
            except Exception as e:
                logger.warning(f"Learning insight application failed: {e}")
        
        # Optionally include risk assessment
        risk_result = None
        if include_risk and data.get("patient_data"):
            risk_result = self.risk_bot.evaluate(data["patient_data"])
        
        return {
            "chat_answer": response_text,
            "conversation_id": chat_result.get("conversation_id"),
            "turn_count": chat_result.get("turn_count"),
            "risk": risk_result,
            "provider": chat_result.get("provider"),
            "learning_applied": learning_applied
        }
    
    def _handle_query(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle RAG-powered query request"""
        query = data.get("query", "")
        patient_id = data.get("patient_id")
        patient_data = data.get("patient_data", {})
        include_summary = data.get("include_summary", False)

        # Retrieve relevant context from EHR
        retrieved = self.ehr_bot.retrieve(query, patient_id=patient_id)
        if inspect.isawaitable(retrieved):
            retrieved = asyncio.run(retrieved)
        if not isinstance(retrieved, dict):
            retrieved = {"chunks": []}
        chunks = retrieved.get("chunks", []) if isinstance(retrieved.get("chunks", []), list) else []

        # Build context-enriched prompt
        context = "\n".join([
            chunk.get("text", "") if isinstance(chunk, dict) else str(chunk)
            for chunk in chunks
        ]).strip()
        enriched_prompt = f"""Based on the following medical context:

{context}

User Query: {query}

Please provide a helpful, medically accurate response."""

        # LLM reasoning — pass patient_id for per-patient cache isolation + cognitive_tier for GPU routing
        llm_result = self.llm_reasoning(
            enriched_prompt,
            system_prompt="You are Dr. iSHA, a helpful medical AI assistant. Provide accurate, empathetic medical guidance.",
            user_id=patient_id,
            cognitive_tier=cognitive_tier,
        )
        
        # Risk assessment if patient data provided
        risk_result = None
        if patient_data:
            risk_result = self.risk_bot.evaluate(patient_data)
        
        # Optional summarization
        summary = None
        if include_summary and context:
            summary = self.summarizer_bot.summarize(context)
        
        # Apply safety filter
        from utils.safety_filter import validate_response
        safe_answer, safety_alerts = validate_response(llm_result.get("answer", ""))
        
        return {
            "answer": safe_answer,
            "risk": risk_result,
            "summary": summary,
            "context_chunks": len(chunks),
            "provider": llm_result.get("provider"),
            "latency_ms": llm_result.get("latency_ms"),
            "safety_alerts": [{"level": a.level.value, "message": a.message} for a in safety_alerts] if safety_alerts else None
        }
    
    def _handle_ehr_upload(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle EHR file upload and ingestion"""
        file_path = data.get("file_path")
        file_content = data.get("file_content")
        patient_id = data.get("patient_id")
        
        if file_path:
            return self.ehr_bot.ingest_file(file_path, patient_id=patient_id)
        elif file_content:
            return self.ehr_bot.ingest_text(file_content, patient_id=patient_id)
        else:
            return {"error": "No file_path or file_content provided"}
    
    def _handle_task(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle task management request"""
        action = data.get("action", "list")
        
        if action == "create":
            return self.task_bot.create_task(data)
        elif action == "update":
            return self.task_bot.update_task(data.get("task_id"), data)
        elif action == "complete":
            return self.task_bot.complete_task(data.get("task_id"))
        elif action == "list":
            return self.task_bot.list_tasks(
                patient_id=data.get("patient_id"),
                status=data.get("status")
            )
        elif action == "delete":
            return self.task_bot.delete_task(data.get("task_id"))
        else:
            return {"error": f"Unknown task action: {action}"}
    
    def _handle_notification(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle notification/alert request"""
        action = data.get("action", "send")
        
        if action == "send":
            return self.notification_bot.send(data)
        elif action == "schedule":
            return self.notification_bot.schedule(data)
        elif action == "list":
            return self.notification_bot.list_notifications(
                patient_id=data.get("patient_id")
            )
        elif action == "dismiss":
            return self.notification_bot.dismiss(data.get("notification_id"))
        else:
            return {"error": f"Unknown notification action: {action}"}
    
    def _handle_insurance(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle insurance-related request"""
        action = data.get("action", "check_eligibility")
        
        if action == "check_eligibility":
            return self.insurance_bot.check_eligibility(data)
        elif action == "process_claim":
            return self.insurance_bot.process_claim(data)
        elif action == "get_policy":
            return self.insurance_bot.get_policy_info(data.get("policy_id"))
        elif action == "estimate_cost":
            return self.insurance_bot.estimate_cost(data)
        else:
            return {"error": f"Unknown insurance action: {action}"}
    
    def _handle_risk(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle risk assessment request"""
        patient_data = data.get("patient_data", data)
        include_recommendations = data.get("include_recommendations", True)
        
        result = self.risk_bot.evaluate(patient_data)
        
        if include_recommendations:
            # Generate recommendations using LLM — pass patient_id for cache isolation
            patient_id = data.get("patient_id") or data.get("patient_data", {}).get("patient_id")
            risk_summary = f"""Patient Risk Assessment:
- Cardiovascular Risk: {result.get('cardio_risk', 'N/A')}
- Treatment Priority: {result.get('treatment_priority', 'N/A')}
- Framingham Score: {result.get('framingham_score', 'N/A')}%
- ASCVD Score: {result.get('ascvd_score', 'N/A')}%"""

            rec_result = self.llm_reasoning(
                f"Based on this risk assessment, provide brief lifestyle and treatment recommendations:\n\n{risk_summary}",
                system_prompt="You are a medical AI. Provide concise, actionable health recommendations.",
                user_id=patient_id,
            )
            result["recommendations"] = rec_result.get("answer")
        
        return result
    
    def _handle_summarize(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle summarization request"""
        text = data.get("text", "")
        patient_id = data.get("patient_id")
        summary_type = data.get("type", "general")  # general, treatment, diagnosis
        
        # If patient_id provided, get their records
        if patient_id and not text:
            records = self.ehr_bot.get_patient_records(patient_id)
            text = "\n\n".join([r.get("text", "") for r in records])
        
        return self.summarizer_bot.summarize(text, summary_type=summary_type)
    
    async def _handle_web_search(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle web search request"""
        action = data.get("action", "search")
        
        if action == "search":
            # Basic web search
            query = data.get("query", "")
            engines = data.get("engines")  # Optional: specific engines
            max_results = data.get("max_results", 10)
            
            result = await self.web_search_bot.search(
                query=query,
                engines=engines,
                max_results=max_results
            )
            return result
        
        elif action == "medical_search":
            # Specialized medical/healthcare search
            query = data.get("query", "")
            category = data.get("category", 'general')  # hospital, doctor, laboratory, etc.
            
            result = await self.web_search_bot.search_medical_info(
                query=query,
                category=category
            )
            return result
        
        elif action == "scrape":
            # Scrape a specific URL
            url = data.get("url", "")
            if not url:
                return {"status": "error", "error": "URL required for scraping"}
            
            result = await self.web_search_bot.scrape_page(url)
            return result
        
        elif action == "stats":
            # Get search statistics
            return self.web_search_bot.get_stats()
        
        else:
            return {"error": f"Unknown web search action: {action}"}
    
    def _health_check(self) -> Dict[str, Any]:
        """SIB health check"""
        uptime = (datetime.now() - self.start_time).total_seconds()
        
        # Test botlet loading (lazy loading only initializes when accessed)
        botlets_status = {}
        try:
            botlets_status["chat"] = self.chat_bot is not None
        except Exception as e:
            botlets_status["chat"] = f"error: {str(e)}"
        
        try:
            botlets_status["ehr"] = self.ehr_bot is not None
        except Exception as e:
            botlets_status["ehr"] = f"error: {str(e)}"
        
        try:
            botlets_status["risk"] = self.risk_bot is not None
        except Exception as e:
            botlets_status["risk"] = f"error: {str(e)}"
        
        try:
            botlets_status["summarizer"] = self.summarizer_bot is not None
        except Exception as e:
            botlets_status["summarizer"] = f"error: {str(e)}"
        
        try:
            botlets_status["task"] = self.task_bot is not None
        except Exception as e:
            botlets_status["task"] = f"error: {str(e)}"
        
        try:
            botlets_status["notification"] = self.notification_bot is not None
        except Exception as e:
            botlets_status["notification"] = f"error: {str(e)}"
        
        try:
            botlets_status["insurance"] = self.insurance_bot is not None
        except Exception as e:
            botlets_status["insurance"] = f"error: {str(e)}"
        
        try:
            botlets_status["web_search"] = self.web_search_bot is not None
        except Exception as e:
            botlets_status["web_search"] = f"error: {str(e)}"
        
        return {
            "status": "healthy",
            "uptime_seconds": round(uptime, 2),
            "request_count": self.request_count,
            "botlet_stats": self.botlet_stats,
            "botlets_loaded": botlets_status
        }
    
    # ==================== Enhanced RAG/Agentic Methods ====================
    
    def query_with_agent(self, query: str, context: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Handle complex queries using ReAct agent reasoning.
        
        Args:
            query: User's question
            context: Patient context (age, conditions, medications, etc.)
            
        Returns:
            Agent result with reasoning trace
        """
        try:
            from .agent.react_agent import create_react_agent
            
            agent = create_react_agent(self.llm_reasoning, self.memory)
            result = agent.run(query, context)
            
            return {
                "answer": result.answer,
                "confidence": result.confidence,
                "reasoning_steps": len(result.steps),
                "sources": result.sources,
                "latency_ms": result.total_time_ms,
                "method": "react_agent"
            }
        except Exception as e:
            logger.warning(f"Agent reasoning failed: {e}, falling back to standard")
            return self._handle_query({"query": query, "patient_data": context})
    
    def search_knowledge(self, query: str, category: str = "all") -> Dict[str, Any]:
        """
        Search the medical knowledge base.
        
        Args:
            query: Search query
            category: Category to search (guidelines, diseases, symptoms, drugs, all)
            
        Returns:
            Search results with relevant knowledge
        """
        try:
            from .knowledge.medical_knowledge import get_knowledge_base
            from .knowledge.drug_database import get_drug_database
            
            results = []
            
            # Search medical knowledge base
            kb = get_knowledge_base()
            kb_results = kb.search_knowledge(query, category if category != "drugs" else "all")
            results.extend(kb_results)
            
            # Search drug database if relevant
            if category in ["drugs", "all"]:
                db = get_drug_database()
                drug_results = db.search_drugs(query)
                for r in drug_results:
                    results.append({
                        "type": "drug",
                        "key": r["drug"],
                        "data": r["info"],
                        "relevance": r["relevance"]
                    })
            
            # Sort by relevance
            results.sort(key=lambda x: x.get("relevance", 0), reverse=True)
            
            return {
                "results": results[:10],
                "total": len(results),
                "query": query,
                "category": category
            }
        except Exception as e:
            logger.error(f"Knowledge search failed: {e}")
            return {"error": str(e), "results": []}
    
    def classify_symptoms(self, symptoms: List[str], context: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Classify symptoms using the symptom classifier.
        
        Args:
            symptoms: List of symptoms
            context: Patient context
            
        Returns:
            Classification results with severity and urgency
        """
        try:
            from .knowledge.symptom_classifier import get_symptom_classifier
            
            classifier = get_symptom_classifier()
            result = classifier.classify_multiple(symptoms, context or {})
            
            return result
        except Exception as e:
            logger.error(f"Symptom classification failed: {e}")
            return {"error": str(e)}
    
    def triage_patient(self, complaint: str, vitals: Dict = None, 
                      context: Dict = None) -> Dict[str, Any]:
        """
        Perform ESI triage assessment.
        
        Args:
            complaint: Chief complaint
            vitals: Vital signs
            context: Patient context
            
        Returns:
            Triage result with ESI level and recommendations
        """
        try:
            from .knowledge.triage_model import get_triage_model
            
            triage = get_triage_model()
            result = triage.triage(complaint, vitals or {}, context or {})
            
            return {
                "esi_level": result.esi_level,
                "esi_description": result.esi_description,
                "disposition": result.disposition,
                "estimated_wait": result.estimated_wait,
                "confidence": result.confidence,
                "rationale": result.rationale,
                "immediate_actions": result.immediate_actions
            }
        except Exception as e:
            logger.error(f"Triage failed: {e}")
            return {"error": str(e)}
    
    def check_drug_interactions(self, medications: List[str], 
                                 patient_conditions: List[str] = None) -> Dict[str, Any]:
        """
        Check for drug interactions and contraindications.
        
        Args:
            medications: List of medication names
            patient_conditions: Optional list of patient conditions
            
        Returns:
            Interaction report with contraindications
        """
        try:
            from .knowledge.drug_database import get_drug_database
            
            db = get_drug_database()
            interactions = db.check_interactions_list(medications)
            
            # Check contraindications if conditions provided
            contraindications = []
            if patient_conditions:
                for med in medications:
                    contras = db.check_contraindications(med, patient_conditions)
                    if contras:
                        contraindications.extend(contras)
            
            return {
                "medications": medications,
                "interactions": interactions,
                "contraindications": contraindications,
                "has_major_interactions": any(i.get("severity") == "major" for i in interactions),
                "has_contraindications": len(contraindications) > 0,
                "total_interactions": len(interactions)
            }
        except Exception as e:
            logger.error(f"Drug interaction check failed: {e}")
            return {"error": str(e)}
    
    def hybrid_search(self, query: str, k: int = 5, method: str = "hybrid") -> Dict[str, Any]:
        """
        Search using hybrid retrieval (dense + sparse).
        
        Args:
            query: Search query
            k: Number of results
            method: Search method (dense, sparse, hybrid)
            
        Returns:
            Search results
        """
        try:
            from .retrieval.hybrid_retriever import get_hybrid_retriever
            
            retriever = get_hybrid_retriever()
            results = retriever.search(query, k=k, method=method)
            
            return {
                "results": [
                    {
                        "text": r.text[:500] + "..." if len(r.text) > 500 else r.text,
                        "score": r.score,
                        "source": r.source,
                        "metadata": r.metadata,
                        "method": r.method
                    }
                    for r in results
                ],
                "query": query,
                "method": method
            }
        except Exception as e:
            logger.error(f"Hybrid search failed: {e}")
            return {"error": str(e), "results": []}
    
    # ==================== Utility Methods ====================
    
    def get_status(self) -> Dict[str, Any]:
        """Get SIB status"""
        return self._health_check()
    
    def reset(self):
        """Reset SIB state"""
        self.request_count = 0
        self.botlet_stats = {}
        if self._memory:
            self._memory.clear()
        logger.info("🔄 SIB state reset")


# Thread-safe singleton (double-check lock pattern)
_sib_instance: Optional[SyntheticIntelligenceBrain] = None
_sib_lock = _threading.Lock()


def get_sib() -> SyntheticIntelligenceBrain:
    """Return the SIB singleton — thread-safe, initialised exactly once."""
    global _sib_instance
    if _sib_instance is None:
        with _sib_lock:
            if _sib_instance is None:
                _sib_instance = SyntheticIntelligenceBrain()
    return _sib_instance
