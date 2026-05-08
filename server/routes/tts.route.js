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

/**
 * POST /api/tts/speak
 * Convert text to speech using Eleven Labs
 */
router.post('/speak', async (req, res) => {
  try {
    const { text, voiceId, model = 'eleven_turbo_v2_5' } = req.body;

    if (!text) {
      return res.status(400).json({ success: false, message: 'Text is required' });
    }

    if (!ELEVENLABS_API_KEY) {
      console.warn('⚠️ ELEVENLABS_API_KEY not configured');
      return res.status(503).json({ 
        success: false, 
        message: 'TTS service not configured',
        fallback: true
      });
    }

    // Clean and limit text
    const cleanText = text
      .replace(/[🚨⚠️🏥🩺📞✅❌💊🔴🟡🟢📹💬🎤📸📍👁️🧠❤️🫁🏃👤📊🧍😣💪🗣️]/g, '')
      .replace(/\*\*/g, '')
      .replace(/#{1,6}\s/g, '')
      .replace(/•/g, '')
      .replace(/---/g, '')
      .trim()
      .substring(0, 5000);

    if (!cleanText) {
      return res.status(400).json({ success: false, message: 'No speakable text after cleaning' });
    }

    console.log(`🔊 Eleven Labs TTS: "${cleanText.substring(0, 50)}..." (${cleanText.length} chars)`);

    // Add timeout with AbortController (30s for Eleven Labs API)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    let response;
    try {
      response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId || DEFAULT_VOICE_ID}`,
        {
          method: 'POST',
          headers: {
            'Accept': 'audio/mpeg',
            'Content-Type': 'application/json',
            'xi-api-key': ELEVENLABS_API_KEY,
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
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Eleven Labs API error:', response.status, errorText);
      return res.status(response.status).json({
        success: false,
        message: 'TTS generation failed',
        error: errorText,
        fallback: true
      });
    }

    // Send the audio response (don't use Transfer-Encoding with Content-Length)
    const audioBuffer = await response.buffer();
    
    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioBuffer.length,
      'Cache-Control': 'no-cache'
    });

    res.send(audioBuffer);

    console.log(`✅ TTS audio generated: ${audioBuffer.length} bytes`);

  } catch (error) {
    console.error('❌ TTS error:', error.message);
    
    // Handle timeout errors specifically
    if (error.name === 'AbortError') {
      return res.status(504).json({
        success: false,
        message: 'TTS request timed out - using fallback',
        error: 'timeout',
        fallback: true
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'TTS service error',
      error: error.message,
      fallback: true
    });
  }
});

/**
 * POST /api/tts/stream
 * Streaming TTS — pipes ElevenLabs audio chunks directly to client.
 * Client receives audio/mpeg stream starting in ~300ms (before full generation).
 */
router.post('/stream', async (req, res) => {
  const { text, voiceId, model = 'eleven_turbo_v2_5' } = req.body;

  if (!text) return res.status(400).json({ error: 'Text is required' });
  if (!ELEVENLABS_API_KEY) return res.status(503).json({ error: 'TTS not configured', fallback: true });

  const cleanText = text
    .replace(/[🚨⚠️🏥🩺📞✅❌💊🔴🟡🟢📹💬🎤📸📍👁️🧠❤️🫁🏃👤📊🧍😣💪🗣️]/g, '')
    .replace(/\*\*/g, '').replace(/#{1,6}\s/g, '').replace(/•/g, '').replace(/---/g, '')
    .trim().substring(0, 5000);

  if (!cleanText) return res.status(400).json({ error: 'No speakable text' });

  try {
    const elResp = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId || DEFAULT_VOICE_ID}/stream`,
      {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': ELEVENLABS_API_KEY,
        },
        body: JSON.stringify({
          text: cleanText,
          model_id: model,
          voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true },
        }),
      }
    );

    if (!elResp.ok) {
      const err = await elResp.text();
      return res.status(elResp.status).json({ error: err.slice(0, 200), fallback: true });
    }

    res.set({ 'Content-Type': 'audio/mpeg', 'Transfer-Encoding': 'chunked', 'Cache-Control': 'no-cache' });
    elResp.body.pipe(res);
    elResp.body.on('error', () => res.end());

  } catch (err) {
    console.error('❌ TTS stream error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message, fallback: true });
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
router.get('/status', (req, res) => {
  res.json({
    success: true,
    configured: !!ELEVENLABS_API_KEY,
    defaultVoiceId: DEFAULT_VOICE_ID,
    provider: 'elevenlabs'
  });
});

export default router;
