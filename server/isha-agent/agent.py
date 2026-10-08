"""
Dr Isha — LiveKit Voice Agent
══════════════════════════════════════════════════════════════════════════════
Production voice-agent for SmartHealth Doctor App.

Pipeline (per session):
  Doctor's mic  →  LiveKit room  →  [this agent]
                                       ├─ Silero VAD  (end-of-turn detection)
                                       ├─ Groq Whisper STT  (fast, low-latency)
                                       ├─ Bimedix LLM  (medical AI, fallback → Groq Llama)
                                       └─ ElevenLabs TTS  (streaming audio back to room)

Start:
  python agent.py start
  OR via start.sh / systemd (see isha-agent.service)

Env vars loaded from /home/ubuntu/Mediczy/server/.env
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import logging
import os
import time
from datetime import datetime, timezone

import aiohttp
import asyncpg
from dotenv import load_dotenv

from livekit import rtc
from livekit.agents import (
    Agent,
    AgentSession,
    JobContext,
    WorkerOptions,
    cli,
    room_io,
)
from livekit.plugins import elevenlabs, silero
from livekit.plugins import openai as lk_openai

# ── Environment ─────────────────────────────────────────────────────────────

load_dotenv("/home/ubuntu/Mediczy/server/.env")

LIVEKIT_URL        = os.environ.get("LIVEKIT_URL",        "wss://video.mediqzy.com")
LIVEKIT_API_KEY    = os.environ.get("LIVEKIT_API_KEY",    "")
LIVEKIT_API_SECRET = os.environ.get("LIVEKIT_API_SECRET", "")

ISHA_AI_URL         = os.environ.get("ISHA_AI_URL",         "https://ai.isha.buzz")
ISHA_AUTH_USERNAME  = os.environ.get("ISHA_AUTH_USERNAME",  "admin")
ISHA_AUTH_PASSWORD  = os.environ.get("ISHA_AUTH_PASSWORD")  # no default — must be set explicitly
ISHA_LLM_MODEL      = os.environ.get("ISHA_LLM_MODEL",      "bi-medix2")

GROQ_API_KEY        = os.environ.get("GROQ_API_KEY",        "")
GROQ_BASE_URL       = "https://api.groq.com/openai/v1"

ELEVENLABS_API_KEY  = os.environ.get("ELEVENLABS_API_KEY",  "")
ELEVENLABS_VOICE_ID = os.environ.get("ELEVENLABS_VOICE_ID", "H8bdWZHK2OgZwTN7ponr")

# Fail fast at startup if required secrets are missing
_missing = [k for k, v in {
    "ISHA_AUTH_PASSWORD": ISHA_AUTH_PASSWORD,
    "LIVEKIT_API_KEY":    LIVEKIT_API_KEY,
    "LIVEKIT_API_SECRET": LIVEKIT_API_SECRET,
    "GROQ_API_KEY":       GROQ_API_KEY,
    "ELEVENLABS_API_KEY": ELEVENLABS_API_KEY,
}.items() if not v]
if _missing:
    raise EnvironmentError(
        f"Dr Isha agent is missing required environment variables: {', '.join(_missing)}. "
        "Set them in /home/ubuntu/Mediczy/server/.env before starting."
    )

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("dr-isha-agent")

# ── DB audit logging (non-blocking) ─────────────────────────────────────────
_DB_URL = os.environ.get("DATABASE_URL") or (
    f"postgresql://{os.environ.get('POSTGRES_USER','postgres')}:"
    f"{os.environ.get('POSTGRES_PASSWORD','')}@"
    f"{os.environ.get('POSTGRES_HOST','localhost')}/"
    f"{os.environ.get('POSTGRES_DATABASE','mediczy_prod')}"
)

async def log_isha_exchange(doctor_id: str, room: str, role: str, content_hash: str, intent: str | None = None) -> None:
    """Write one turn to isha_audit_log. Never raises — failures are logged only."""
    try:
        conn = await asyncpg.connect(_DB_URL, timeout=5)
        await conn.execute(
            """
            INSERT INTO isha_audit_log (doctor_id, room_name, role, content_hash, intent, created_at)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT DO NOTHING
            """,
            doctor_id, room, role, content_hash, intent,
            datetime.now(timezone.utc),
        )
        await conn.close()
    except Exception as exc:
        logger.warning("Audit log write failed (non-blocking): %s", exc)

def _hash(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()[:16]

# ── Patient context fetcher (non-blocking) ──────────────────────────────────
async def fetch_patient_context(patient_id: str) -> str:
    """Return a structured context block for the system prompt, or empty string on failure."""
    if not patient_id or patient_id == "unknown":
        return ""
    try:
        conn = await asyncpg.connect(_DB_URL, timeout=5)
        row = await conn.fetchrow(
            """
            SELECT u."firstName", u."lastName", u.age, u.gender,
                   uha.risk_level, uha.risk_factors, uha.all_responses
            FROM users u
            LEFT JOIN user_health_assessments uha
              ON uha.user_id = u.id
              AND uha.assessed_at = (
                SELECT MAX(assessed_at) FROM user_health_assessments WHERE user_id = u.id
              )
            WHERE u.id = $1
            """,
            int(patient_id),
        )
        await conn.close()
        if not row:
            return ""
        lines = [
            f"Patient: {row['firstName'] or ''} {row['lastName'] or ''}".strip() or "Unknown",
            f"Age/Gender: {row['age'] or 'unknown'} / {row['gender'] or 'unknown'}",
        ]
        if row["risk_level"]:
            lines.append(f"Health Risk Level: {row['risk_level']}")
        if row["risk_factors"]:
            factors = row["risk_factors"]
            if isinstance(factors, list) and factors:
                lines.append(f"Risk Factors: {', '.join(str(f) for f in factors[:5])}")
        return "\n".join(lines)
    except Exception as exc:
        logger.warning("Patient context fetch failed (non-blocking): %s", exc)
        return ""

# ── Bimedix auth (JWT, auto-refresh) ────────────────────────────────────────

_isha_token: str | None = None
_isha_token_exp: float = 0.0


async def get_isha_token() -> str:
    global _isha_token, _isha_token_exp
    now = time.time()
    if _isha_token and now < _isha_token_exp - 300:
        return _isha_token

    async with aiohttp.ClientSession() as http:
        async with http.post(
            f"{ISHA_AI_URL}/auth/login",
            json={"username": ISHA_AUTH_USERNAME, "password": ISHA_AUTH_PASSWORD},
            timeout=aiohttp.ClientTimeout(total=10),
        ) as resp:
            resp.raise_for_status()
            data = await resp.json()

    token: str = data["access_token"]

    # Decode JWT expiry without a library
    try:
        padded = token.split(".")[1] + "=="
        payload = json.loads(base64.b64decode(padded).decode())
        _isha_token_exp = float(payload.get("exp", now + 3600))
    except Exception:
        _isha_token_exp = now + 3600

    _isha_token = token
    logger.info("Bimedix JWT refreshed (exp in %.0f s)", _isha_token_exp - now)
    return _isha_token


# ── System prompt ────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """\
You are Dr Isha, a senior AI clinical assistant embedded in the SmartHealth Doctor App.
You assist doctors in real-time during consultations, ward rounds, and clinical tasks.

Core capabilities:
- Patient lookup and appointment summaries
- Clinical note dictation (convert speech to structured SOAP notes)
- Drug information and interaction checking
- Medical query answering using evidence-based guidelines (NICE, WHO, ICMR)
- Scheduling follow-ups and reminders
- Lab result interpretation
- Differential diagnosis support
- ICD-10 and drug coding assistance

Behavioural rules:
- Always address the user as "Doctor"
- Be concise and direct — this is a real-time voice interface
- Respond in the selected language in plain spoken speech — no markdown, asterisks, or bullet symbols
- Keep responses under 120 words for general queries; for differential diagnosis or drug
  interaction questions, use up to 200 words — never truncate clinically critical information
- If you cannot help with something, say so clearly and briefly

Drug safety (CRITICAL — never violate):
- NEVER provide specific drug doses, regimens, or titration schedules
  → Say: "I recommend verifying the dose with the BNF, formulary, or your pharmacist"
- NEVER recommend a specific drug brand unless asked to confirm one already prescribed
- ALWAYS flag known drug interactions, contraindications, renal/hepatic dose adjustments,
  and black-box warnings when a drug is mentioned
- For paediatric doses, always defer to a weight-based calculator or paediatric formulary

Emergency escalation (CRITICAL):
- If the patient's clinical picture suggests any of the following, say this FIRST before any
  other response: "Doctor, this may require immediate emergency escalation. Consider calling
  112 now." — triggers: suspected MI, stroke (FAST), anaphylaxis, septic shock, respiratory
  failure, status epilepticus, aortic dissection, pulmonary embolism
- Do not wait to be asked — flag emergencies proactively

Clinical note dictation (SOAP):
- When the doctor says "note", "dictate", "SOAP note", or "write this up", structure your
  response as: Subjective: ... Objective: ... Assessment: ... Plan: ...
- Include suggested ICD-10 code at the end if confident

Confidence calibration:
- After responses that involve clinical decisions, append one of:
    [High confidence — based on established guidelines]
    [Moderate confidence — recommend verifying with a specialist]
    [Low confidence — this is outside my certainty; please consult a reference]
- Do NOT append confidence tags for factual, non-clinical responses

Safety:
- If uncertain, say exactly: "I'm not certain, Doctor — please verify with a reference"
- Decline requests that could compromise patient safety
- Never roleplay as a non-medical assistant
"""


# ── Agent ────────────────────────────────────────────────────────────────────

class IshaVoiceAgent(Agent):
    """Dr Isha — medical voice assistant."""

    def __init__(self, doctor_id: str = "unknown", room_name: str = "unknown", patient_context: str = "", language: str = "en") -> None:
        self.language = language
        prompt = f"{SYSTEM_PROMPT}\n\nSelected response language: {language}. Reply in this language unless the doctor asks to switch."
        if patient_context:
            prompt = f"{SYSTEM_PROMPT}\n\n===== CURRENT PATIENT CONTEXT =====\n{patient_context}\n====================================="
        super().__init__(instructions=prompt)
        self.doctor_id = doctor_id
        self.room_name = room_name

    async def on_enter(self) -> None:
        """Greet the doctor as soon as the session is ready."""
        greeting = "Yes Doctor, I'm listening. How can I help you?"
        await self.session.say(greeting, allow_interruptions=True)
        asyncio.create_task(
            log_isha_exchange(self.doctor_id, self.room_name, "assistant", _hash(greeting), "greeting")
        )

    async def on_user_speech_committed(self, message: str) -> None:
        """Log every doctor utterance (hash only — no PHI stored in plain text)."""
        asyncio.create_task(
            log_isha_exchange(self.doctor_id, self.room_name, "doctor", _hash(message), None)
        )

    async def on_agent_speech_committed(self, message: str) -> None:
        """Log every Dr Isha response (hash only)."""
        asyncio.create_task(
            log_isha_exchange(self.doctor_id, self.room_name, "assistant", _hash(message), None)
        )


# ── Entrypoint ───────────────────────────────────────────────────────────────

async def entrypoint(ctx: JobContext) -> None:
    logger.info("Dr Isha agent started for room: %s", ctx.room.name)

    # Connect to room (agent participant — no video/audio track published yet)
    await ctx.connect()

    # Room name format: "isha-assistant-<doctorId>" or "isha-assistant-<doctorId>-<patientId>"
    room_name = ctx.room.name
    metadata = {}
    try:
        metadata = json.loads(ctx.job.metadata or "{}")
    except (TypeError, json.JSONDecodeError):
        logger.warning("Invalid LiveKit dispatch metadata; using English defaults")
    language = str(metadata.get("language") or "en").strip().lower()[:12] or "en"
    # Whisper expects short language codes while the UI may send locale-like values.
    whisper_language = language.split("-")[0].split("_")[0]
    parts = room_name.replace("isha-assistant-", "", 1).split("-") if room_name.startswith("isha-assistant-") else []
    doctor_id  = parts[0] if parts else "unknown"
    patient_id = parts[1] if len(parts) > 1 else "unknown"
    logger.info("Serving doctor_id=%s patient_id=%s", doctor_id, patient_id)

    # Fetch patient context (non-blocking; empty string if unavailable)
    patient_context = await fetch_patient_context(patient_id)

    # ── LLM: try Bimedix first, fall back to Groq ───────────────────────────
    try:
        isha_token = await asyncio.wait_for(get_isha_token(), timeout=8.0)
        llm = lk_openai.LLM(
            base_url=f"{ISHA_AI_URL}/v1",
            api_key=isha_token,
            model=ISHA_LLM_MODEL,
            temperature=0.3,
        )
        logger.info("LLM: Bimedix %s @ %s", ISHA_LLM_MODEL, ISHA_AI_URL)
    except Exception as exc:
        logger.warning("Bimedix auth failed (%s) — falling back to Groq llama-3.3-70b", exc)
        llm = lk_openai.LLM(
            base_url=GROQ_BASE_URL,
            api_key=GROQ_API_KEY,
            model="llama-3.3-70b-versatile",
            temperature=0.3,
        )

    # ── Voice pipeline ───────────────────────────────────────────────────────
    session = AgentSession(
        # VAD: Silero — 1.2 s silence threshold suits clinical speech (doctors pause to think)
        vad=silero.VAD.load(
            min_speech_duration=0.1,
            min_silence_duration=1.2,
            activation_threshold=0.5,
        ),
        # STT: Groq Whisper (fast, reliable, handles Indian English well)
        stt=lk_openai.STT(
            base_url=GROQ_BASE_URL,
            api_key=GROQ_API_KEY,
            model="whisper-large-v3-turbo",
            language=whisper_language,
        ),
        # LLM: Bimedix (medical AI) or Groq fallback
        llm=llm,
        # TTS: ElevenLabs streaming (high-quality, low-latency)
        tts=elevenlabs.TTS(
            api_key=ELEVENLABS_API_KEY,
            voice_id=ELEVENLABS_VOICE_ID,
            model="eleven_multilingual_v2",
            auto_mode=True,
        ),
    )

    agent = IshaVoiceAgent(doctor_id=doctor_id, room_name=room_name, patient_context=patient_context, language=language)

    await session.start(
        agent=agent,
        room=ctx.room,
        room_options=room_io.RoomOptions(
            audio_input=True,
            audio_output=True,
            close_on_disconnect=True,
        ),
    )


# ── Worker entry ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            agent_name="dr-isha",
            ws_url=LIVEKIT_URL,
            api_key=LIVEKIT_API_KEY,
            api_secret=LIVEKIT_API_SECRET,
        )
    )
