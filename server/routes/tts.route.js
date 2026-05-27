/**
 * Text-to-Speech Route using Eleven Labs API
 * ===========================================
 * 
 * Provides high-quality AI voice synthesis for Dr. iSHA
 */

import express from 'express';
import fetch from 'node-fetch';

const router = express.Router();

// Eleven Labs configuration
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const DEFAULT_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'pjcYQlDFKMbcOUp6F5GD';

// OpenAI fallback TTS configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_TTS_MODEL = process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts';
const OPENAI_TTS_VOICE = process.env.OPENAI_TTS_VOICE || 'coral';
const OPENAI_TTS_INSTRUCTIONS = process.env.OPENAI_TTS_INSTRUCTIONS ||
  'Speak as Dr. iSHA, a calm, professional clinical assistant. Keep the tone clear, warm, and concise.';

function cleanTtsText(text) {
  return text
    .replace(/[🚨⚠️🏥🩺📞✅❌💊🔴🟡🟢📹💬🎤📸📍👁️🧠❤️🫁🏃👤📊🧍😣💪🗣️]/g, '')
    .replace(/\*\*/g, '')
    .replace(/#{1,6}\s/g, '')
    .replace(/•/g, '')
    .replace(/---/g, '')
    .trim()
    .substring(0, 5000);
}

function getOpenAiTtsModels() {
  const configured = (process.env.OPENAI_TTS_FALLBACK_MODELS || "")
    .split(",")
    .map(model => model.trim())
    .filter(Boolean);

  return Array.from(new Set([OPENAI_TTS_MODEL, ...configured, "tts-1"]));
}

async function createOpenAiTtsResponse(text, signal) {
  if (!OPENAI_API_KEY || OPENAI_API_KEY === "your-openai-api-key") {
    return {
      ok: false,
      status: 503,
      error: "OPENAI_API_KEY not configured"
    };
  }

  let lastFailure = null;

  for (const model of getOpenAiTtsModels()) {
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + OPENAI_API_KEY,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
      },
      body: JSON.stringify({
        model,
        voice: OPENAI_TTS_VOICE,
        input: text,
        instructions: OPENAI_TTS_INSTRUCTIONS,
        response_format: "mp3",
      }),
      signal,
    });

    if (response.ok) {
      return { ok: true, response, model };
    }

    const err = await response.text().catch(() => "");
    lastFailure = {
      status: response.status,
      model,
      error: err.slice(0, 500)
    };
    console.warn("⚠️ OpenAI TTS model unavailable:", model, response.status, err.slice(0, 200));
  }

  return {
    ok: false,
    status: lastFailure?.status || 503,
    model: lastFailure?.model || OPENAI_TTS_MODEL,
    error: lastFailure?.error || "OpenAI TTS unavailable"
  };
}

/**
 * POST /api/tts/speak
 * Convert text to speech using ElevenLabs, then OpenAI TTS fallback.
 */
router.post("/speak", async (req, res) => {
  try {
    const { text, voiceId, model = "eleven_turbo_v2_5" } = req.body;

    if (!text) {
      return res.status(400).json({ success: false, message: "Text is required" });
    }

    const cleanText = cleanTtsText(text);

    if (!cleanText) {
      return res.status(400).json({ success: false, message: "No speakable text after cleaning" });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      if (ELEVENLABS_API_KEY) {
        console.log("🔊 ElevenLabs TTS: " + cleanText.substring(0, 50) + "... (" + cleanText.length + " chars)");
        const response = await fetch(
          "https://api.elevenlabs.io/v1/text-to-speech/" + (voiceId || DEFAULT_VOICE_ID),
          {
            method: "POST",
            headers: {
              "Accept": "audio/mpeg",
              "Content-Type": "application/json",
              "xi-api-key": ELEVENLABS_API_KEY,
            },
            body: JSON.stringify({
              text: cleanText,
              model_id: model,
              voice_settings: {
                stability: 0.5,
                similarity_boost: 0.8,
                style: 0.3,
                use_speaker_boost: true
              }
            }),
            signal: controller.signal
          }
        );

        if (response.ok) {
          const audioBuffer = await response.buffer();
          res.set({
            "Content-Type": "audio/mpeg",
            "Content-Length": audioBuffer.length,
            "Cache-Control": "no-cache",
            "X-TTS-Provider": "elevenlabs"
          });
          console.log("✅ ElevenLabs TTS audio generated: " + audioBuffer.length + " bytes");
          return res.send(audioBuffer);
        }

        const errorText = await response.text();
        console.warn("⚠️ ElevenLabs TTS unavailable:", response.status, errorText.slice(0, 200));
      } else {
        console.warn("⚠️ ELEVENLABS_API_KEY not configured, trying OpenAI TTS fallback");
      }

      const openAiResult = await createOpenAiTtsResponse(cleanText, controller.signal);
      if (openAiResult.ok) {
        const audioBuffer = await openAiResult.response.buffer();
        res.set({
          "Content-Type": "audio/mpeg",
          "Content-Length": audioBuffer.length,
          "Cache-Control": "no-cache",
          "X-TTS-Provider": "openai",
          "X-TTS-Model": openAiResult.model
        });
        console.log("✅ OpenAI TTS fallback audio generated: " + audioBuffer.length + " bytes");
        return res.send(audioBuffer);
      }

      console.warn("⚠️ OpenAI TTS fallback unavailable:", openAiResult.status, openAiResult.error);
      return res.status(200).json({
        success: false,
        fallback: true,
        provider: "browser",
        message: "Cloud TTS unavailable, use browser speech synthesis",
        openaiStatus: openAiResult.status,
        openaiError: openAiResult.error
      });
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    console.error("❌ TTS error:", error.message);

    if (error.name === "AbortError") {
      return res.status(504).json({
        success: false,
        message: "TTS request timed out, using fallback",
        error: "timeout",
        fallback: true
      });
    }

    res.status(500).json({
      success: false,
      message: "TTS service error",
      error: error.message,
      fallback: true
    });
  }
});

/**
 * POST /api/tts/stream
 * Streaming TTS. Uses ElevenLabs first, then streams OpenAI TTS fallback.
 */
router.post("/stream", async (req, res) => {
  const { text, voiceId, model = "eleven_turbo_v2_5" } = req.body;

  if (!text) return res.status(400).json({ error: "Text is required" });

  const cleanText = cleanTtsText(text);
  if (!cleanText) return res.status(400).json({ error: "No speakable text" });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    if (ELEVENLABS_API_KEY) {
      const elResp = await fetch(
        "https://api.elevenlabs.io/v1/text-to-speech/" + (voiceId || DEFAULT_VOICE_ID) + "/stream",
        {
          method: "POST",
          headers: {
            "Accept": "audio/mpeg",
            "Content-Type": "application/json",
            "xi-api-key": ELEVENLABS_API_KEY,
          },
          body: JSON.stringify({
            text: cleanText,
            model_id: model,
            voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true },
          }),
          signal: controller.signal,
        }
      );

      if (elResp.ok) {
        clearTimeout(timeoutId);
        res.set({ "Content-Type": "audio/mpeg", "Transfer-Encoding": "chunked", "Cache-Control": "no-cache", "X-TTS-Provider": "elevenlabs" });
        elResp.body.pipe(res);
        return elResp.body.on("error", () => res.end());
      }

      const err = await elResp.text();
      console.warn("⚠️ ElevenLabs stream unavailable:", elResp.status, err.slice(0, 200));
    } else {
      console.warn("⚠️ ELEVENLABS_API_KEY not configured, trying OpenAI TTS fallback");
    }

    const openAiResult = await createOpenAiTtsResponse(cleanText, controller.signal);
    clearTimeout(timeoutId);

    if (openAiResult.ok) {
      res.set({ "Content-Type": "audio/mpeg", "Transfer-Encoding": "chunked", "Cache-Control": "no-cache", "X-TTS-Provider": "openai",
          "X-TTS-Model": openAiResult.model });
      openAiResult.response.body.pipe(res);
      return openAiResult.response.body.on("error", () => res.end());
    }

    console.warn("⚠️ OpenAI TTS fallback unavailable:", openAiResult.status, openAiResult.error);
    return res.status(200).json({
      success: false,
      fallback: true,
      provider: "browser",
      message: "Cloud TTS unavailable, use browser speech synthesis",
      openaiStatus: openAiResult.status,
      openaiError: openAiResult.error
    });
  } catch (err) {
    clearTimeout(timeoutId);
    console.error("❌ TTS stream error:", err.message);
    if (!res.headersSent) res.status(err.name === "AbortError" ? 504 : 500).json({ error: err.message, fallback: true });
  }
});

/**
 * GET /api/tts/voices
 * Get available Eleven Labs voices
 */
router.get('/voices', async (req, res) => {
  try {
    if (!ELEVENLABS_API_KEY) {
      // Return a static set of common voices so the app degrades gracefully
      return res.json({
        success: true,
        configured: false,
        voices: [
          { voice_id: 'pjcYQlDFKMbcOUp6F5GD', name: 'Dr. iSHA', category: 'premade', description: 'Default Dr. iSHA voice', preview_url: null },
          { voice_id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel',   category: 'premade', description: 'Calm and professional', preview_url: null },
          { voice_id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi',     category: 'premade', description: 'Confident and clear',   preview_url: null },
          { voice_id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella',    category: 'premade', description: 'Warm and friendly',     preview_url: null },
          { voice_id: 'ErXwobaYiN019PkySvjV', name: 'Antoni',   category: 'premade', description: 'Smooth and natural',    preview_url: null }
        ],
        note: 'TTS service not configured — showing default voice list. Configure ELEVENLABS_API_KEY to enable live synthesis.'
      });
    }

    // Add timeout for voices request (10s is sufficient for list)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    let response;
    try {
      response = await fetch('https://api.elevenlabs.io/v1/voices', {
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
        },
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      throw new Error('Failed to fetch voices');
    }

    const data = await response.json();
    res.json({
      success: true,
      voices: data.voices.map(v => ({
        voice_id: v.voice_id,
        name: v.name,
        category: v.category,
        description: v.description,
        preview_url: v.preview_url
      }))
    });

  } catch (error) {
    console.error('❌ Error fetching voices:', error.message);
    
    // Handle timeout
    if (error.name === 'AbortError') {
      return res.status(504).json({ success: false, message: 'Voice list request timed out' });
    }
    
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/tts/status
 * Check TTS service status
 */
router.get("/status", (req, res) => {
  res.json({
    success: true,
    configured: !!(ELEVENLABS_API_KEY || OPENAI_API_KEY),
    primaryConfigured: !!ELEVENLABS_API_KEY,
    fallbackConfigured: !!OPENAI_API_KEY && OPENAI_API_KEY !== "your-openai-api-key",
    defaultVoiceId: DEFAULT_VOICE_ID,
    provider: "elevenlabs",
    fallbackProvider: "openai",
    openaiModel: OPENAI_TTS_MODEL,
    openaiVoice: OPENAI_TTS_VOICE
  });
});

export default router;
