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
import json
import logging
import os
import time

import aiohttp
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
ISHA_AUTH_PASSWORD  = os.environ.get("ISHA_AUTH_PASSWORD",  "admin123")
ISHA_LLM_MODEL      = os.environ.get("ISHA_LLM_MODEL",      "bi-medix2")

GROQ_API_KEY        = os.environ.get("GROQ_API_KEY",        "")
GROQ_BASE_URL       = "https://api.groq.com/openai/v1"

ELEVENLABS_API_KEY  = os.environ.get("ELEVENLABS_API_KEY",  "")
ELEVENLABS_VOICE_ID = os.environ.get("ELEVENLABS_VOICE_ID", "H8bdWZHK2OgZwTN7ponr")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("dr-isha-agent")

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
- Never guess drug doses; recommend verifying with a formulary
- Never diagnose patients directly — support the doctor's reasoning
- Cite clinical guidelines briefly and only when directly relevant
- Respond in plain spoken English — no markdown, asterisks, or bullet symbols
- Keep responses under 60 words unless the doctor asks for a detailed answer
- If you cannot help with something, say so clearly and briefly

Safety:
- Always flag drug interactions, contraindications, and red-flag symptoms
- If uncertain, say "I'm not certain — please verify with a reference"
- Decline any request that could compromise patient safety
"""


# ── Agent ────────────────────────────────────────────────────────────────────

class IshaVoiceAgent(Agent):
    """Dr Isha — medical voice assistant."""

    def __init__(self, doctor_id: str = "unknown") -> None:
        super().__init__(instructions=SYSTEM_PROMPT)
        self.doctor_id = doctor_id

    async def on_enter(self) -> None:
        """Greet the doctor as soon as the session is ready."""
        await self.session.say(
            "Yes Doctor, I'm listening. How can I help you?",
            allow_interruptions=True,
        )


# ── Entrypoint ───────────────────────────────────────────────────────────────

async def entrypoint(ctx: JobContext) -> None:
    logger.info("Dr Isha agent started for room: %s", ctx.room.name)

    # Connect to room (agent participant — no video/audio track published yet)
    await ctx.connect()

    # Extract doctor ID from room name: "isha-assistant-<id>"
    room_name = ctx.room.name
    doctor_id = (
        room_name.replace("isha-assistant-", "", 1)
        if room_name.startswith("isha-assistant-")
        else "unknown"
    )
    logger.info("Serving doctor_id=%s", doctor_id)

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
        # VAD: Silero (on-device, zero latency)
        vad=silero.VAD.load(
            min_speech_duration=0.1,
            min_silence_duration=0.6,
            activation_threshold=0.5,
        ),
        # STT: Groq Whisper (fast, reliable, handles Indian English well)
        stt=lk_openai.STT(
            base_url=GROQ_BASE_URL,
            api_key=GROQ_API_KEY,
            model="whisper-large-v3-turbo",
            language="en",
        ),
        # LLM: Bimedix (medical AI) or Groq fallback
        llm=llm,
        # TTS: ElevenLabs streaming (high-quality, low-latency)
        tts=elevenlabs.TTS(
            api_key=ELEVENLABS_API_KEY,
            voice_id=ELEVENLABS_VOICE_ID,
            model="eleven_turbo_v2_5",
            auto_mode=True,
        ),
    )

    agent = IshaVoiceAgent(doctor_id=doctor_id)

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
