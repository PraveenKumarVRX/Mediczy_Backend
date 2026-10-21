"""Contact-center workers on the existing LiveKit project and speech providers.

Run with CONTACT_CENTER_WORKER_MODE=stt or bot and `python ... start`.
No direct database connection, patient lookup or arbitrary clinical tools.
"""
from __future__ import annotations
import asyncio
import hashlib
import hmac
import json
import logging
import os
import secrets
import time
import uuid
import re

import aiohttp
from livekit import rtc
from livekit.agents import Agent, AgentSession, AutoSubscribe, JobContext, WorkerOptions, cli, room_io, stt
from livekit.plugins import openai as lk_openai, silero, elevenlabs

LOG = logging.getLogger("mediqzy-contact-center")


class Bridge:
    def __init__(self, tenant: str, call_id: str):
        if not re.fullmatch(r"[A-Za-z0-9_-]{4,64}", tenant):
            raise ValueError("Invalid tenant")
        uuid.UUID(call_id)
        self.tenant, self.call_id = tenant, call_id
        self.base = os.environ["VOICE_PUBLIC_BASE_URL"].rstrip("/")
        if not self.base.startswith("https://"):
            raise ValueError("HTTPS control API required")
        self.secret = os.environ["VOICE_INTERNAL_SECRET"]

    async def send(self, kind: str, **values):
        body = {"callId": self.call_id, "type": kind, **values}
        encoded = json.dumps(body, separators=(",", ":"), ensure_ascii=False)
        timestamp, nonce = str(int(time.time() * 1000)), secrets.token_hex(16)
        signature = hmac.new(self.secret.encode(), f"{timestamp}.{nonce}.{encoded}".encode(), hashlib.sha256).hexdigest()
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=35)) as http:
            async with http.post(f"{self.base}/api/contact-center/hooks/agent/{self.tenant}", data=encoded.encode(),
                                 headers={"Content-Type": "application/json", "X-Voice-Timestamp": timestamp,
                                          "X-Voice-Nonce": nonce, "X-Voice-Signature": signature}, allow_redirects=False) as response:
                result = await response.json()
                if response.status >= 400:
                    # Never log transcript, audio, credentials or arbitrary API error text.
                    raise RuntimeError(result.get("code", "CONTROL_API_FAILED"))
                return result


def speech_provider(language: str):
    key = os.environ.get("GROQ_API_KEY")
    if not key:
        raise RuntimeError("GROQ_API_KEY required by the existing Whisper pipeline")
    return lk_openai.STT(base_url="https://api.groq.com/openai/v1", api_key=key,
                         model="whisper-large-v3-turbo", language=language.split("-")[0])


async def observe_track(ctx, bridge, track, participant, started, language):
    """One VAD/STT stream per actual participant audio track: no mixed diarization guesses."""
    speaker = "caller" if participant.identity == "caller" else "agent"
    recognizer = stt.StreamAdapter(stt=speech_provider(language), vad=silero.VAD.load(min_silence_duration=0.5))
    stream = recognizer.stream()
    audio = rtc.AudioStream(track, sample_rate=16000, num_channels=1, capacity=100)
    media_ms, start_ms, sequence = 0, 0, 0

    async def push():
        nonlocal media_ms
        async for event in audio:
            media_ms += event.frame.samples_per_channel * 1000 // event.frame.sample_rate
            stream.push_frame(event.frame)
        stream.end_input()

    task = asyncio.create_task(push())
    origin = int((time.monotonic() - started) * 1000)
    current_id, revision = None, 0
    try:
        async for event in stream:
            if event.type == stt.SpeechEventType.START_OF_SPEECH:
                start_ms = max(0, media_ms - 500)
            if event.type not in (stt.SpeechEventType.INTERIM_TRANSCRIPT, stt.SpeechEventType.FINAL_TRANSCRIPT) or not event.alternatives:
                continue
            text = event.alternatives[0].text.strip()
            if not text:
                continue
            final = event.type == stt.SpeechEventType.FINAL_TRANSCRIPT
            current_id = current_id or f"{track.sid}-{uuid.uuid4().hex[:12]}"
            revision += 1
            result = await bridge.send("transcript", segment={"id": current_id, "speaker": speaker,
                "startMs": origin + start_ms, "endMs": origin + max(start_ms, media_ms), "final": final, "text": text[:10000], "revision": revision})
            # The API returns the redacted version; raw provider text is never broadcast.
            redacted = result.get("segment", {}).get("text")
            if redacted:
                await ctx.room.local_participant.publish_transcription(rtc.Transcription(
                    participant_identity=participant.identity, track_sid=track.sid, segments=[rtc.TranscriptionSegment(
                        id=current_id, text=redacted, start_time=origin + start_ms, end_time=origin + media_ms,
                        final=final, language=language)]))
            if final:
                sequence += 1
                current_id, revision, start_ms = None, 0, media_ms
    finally:
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)
        await stream.aclose()
        await audio.aclose()
        await recognizer.aclose()


async def observer(ctx: JobContext, bridge: Bridge, config):
    tasks, started = {}, time.monotonic()
    allowed_agent = config["agentIdentity"]

    def subscribe(track, publication, participant):
        if track.kind != rtc.TrackKind.KIND_AUDIO or track.sid in tasks:
            return
        # Worker participants can publish bot speech; unknown browser identities cannot supply labels.
        async def run():
            try:
                current = await bridge.send("bootstrap")
                if participant.identity not in ("caller", current["agentIdentity"]) and participant.kind != rtc.ParticipantKind.PARTICIPANT_KIND_AGENT:
                    return
                await observe_track(ctx, bridge, track, participant, started, config["language"])
            except asyncio.CancelledError:
                raise
            except Exception:
                LOG.error("contact_stt_track_failed call=%s", bridge.call_id)
                try:
                    await bridge.send("diagnostic", code="STT_FAILED")
                except Exception:
                    LOG.error("contact_stt_diagnostic_unavailable call=%s", bridge.call_id)
                # A failed producer is visible; it never fabricates an empty successful transcript.
        tasks[track.sid] = asyncio.create_task(run())

    ctx.room.on("track_subscribed", subscribe)
    for participant in ctx.room.remote_participants.values():
        for publication in participant.track_publications.values():
            if publication.track:
                subscribe(publication.track, publication, participant)
    closed = asyncio.Event()
    ctx.room.on("disconnected", lambda *args: closed.set())
    await closed.wait()
    for task in tasks.values():
        task.cancel()
    await asyncio.gather(*tasks.values(), return_exceptions=True)


class ReceptionAgent(Agent):
    def __init__(self, bridge):
        super().__init__(instructions="Hospital reception only. Facts and human handoff are governed by the hospital control API.")
        self.bridge, self.pending_handoff, self.handoff_running = bridge, False, False

    async def on_enter(self):
        await self.session.say("Hello, I am the hospital's automated reception assistant. You can ask for a human at any time.", allow_interruptions=True)

    async def llm_node(self, chat_ctx, tools, model_settings):
        messages = [item for item in chat_ctx.items if getattr(item, "role", None) == "user"]
        text = messages[-1].text_content if messages else ""
        try:
            response = await self.bridge.send("bot_reply", text=text[:4000], history=[])
            self.pending_handoff = response["handoff"]
            yield response["reply"]
        except Exception:
            self.pending_handoff = True
            yield "I am having trouble answering. I will try to connect you with the hospital team."

    async def handoff(self):
        if self.handoff_running:
            return
        self.handoff_running, self.pending_handoff = True, False
        try:
            await self.bridge.send("handoff")
        except Exception:
            await self.session.say("The hospital team is currently busy. Your callback request will remain with the team.", allow_interruptions=True)
        finally:
            self.handoff_running = False


async def bot(ctx: JobContext, bridge: Bridge, config):
    agent = ReceptionAgent(bridge)
    session = AgentSession(stt=speech_provider(config["language"]), vad=silero.VAD.load(min_silence_duration=0.5),
        tts=elevenlabs.TTS(api_key=os.environ["ELEVENLABS_API_KEY"],
            voice_id=os.environ.get("ELEVENLABS_VOICE_ID", "H8bdWZHK2OgZwTN7ponr"), model="eleven_multilingual_v2"),
        allow_interruptions=True, min_interruption_duration=0.35)

    @session.on("agent_state_changed")
    def changed(event):
        if event.new_state == "listening" and agent.pending_handoff:
            asyncio.create_task(agent.handoff())

    @session.on("error")
    def failed(event):
        async def fallback():
            try:
                await bridge.send("diagnostic", code="BOT_FAILED")
            finally:
                await agent.handoff()
        asyncio.create_task(fallback())

    seen = set()
    @ctx.room.on("data_received")
    def control(packet):
        if packet.topic != "mediqzy.voice.control":
            return
        try:
            message = json.loads(packet.data)
            body, timestamp, nonce = message["body"], message["timestamp"], message["nonce"]
            expected = hmac.new(bridge.secret.encode(), f"{timestamp}.{nonce}.{json.dumps(body,separators=(',',':'),ensure_ascii=False)}".encode(), hashlib.sha256).hexdigest()
            if body.get("callId") != bridge.call_id or abs(int(time.time()*1000)-int(timestamp)) > 120000 or nonce in seen or not hmac.compare_digest(expected, message["signature"]):
                return
            seen.add(nonce)
            if body.get("action") == "interrupt":
                session.interrupt(force=True)
        except (KeyError, ValueError, TypeError):
            return

    await session.start(agent, room=ctx.room, room_options=room_io.RoomOptions(
        participant_identity="caller", audio_input=True, audio_output=True,
        text_input=False, text_output=False, close_on_disconnect=True))


async def entrypoint(ctx: JobContext):
    values = json.loads(ctx.job.metadata or "{}")
    bridge = Bridge(values["tenantUid"], values["callId"])
    config = await bridge.send("bootstrap")
    if config["roomName"] != ctx.room.name:
        raise RuntimeError("Room binding mismatch")
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)
    if os.environ.get("CONTACT_CENTER_WORKER_MODE") == "stt":
        await observer(ctx, bridge, config)
    else:
        await bot(ctx, bridge, config)


if __name__ == "__main__":
    mode = os.environ.get("CONTACT_CENTER_WORKER_MODE", "stt")
    if mode not in ("stt", "bot"):
        raise RuntimeError("CONTACT_CENTER_WORKER_MODE must be stt or bot")
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint, agent_name=f"mediqzy-contact-{mode}",
        host="127.0.0.1", port=8871 if mode == "stt" else 8872, num_idle_processes=1,
        ws_url=os.environ["LIVEKIT_URL"], api_key=os.environ["LIVEKIT_API_KEY"], api_secret=os.environ["LIVEKIT_API_SECRET"]))
