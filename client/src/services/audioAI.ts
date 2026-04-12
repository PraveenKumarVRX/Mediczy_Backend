/**
 * Audio AI (Edge + Cloud) Service
 * =================================
 * 
 * Real-time audio intelligence for emergency triage:
 * - Edge: Web Audio API for volume levels, frequency analysis, ambient sound patterns
 * - Cloud: Gemini audio scene analysis (screaming, sirens, breathing, environmental sounds)
 * - Remote audio capture from LiveKit WebRTC stream
 * - Audio recording with MediaRecorder for post-call review
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AudioAnalysisResult {
  timestamp: number;
  volumeLevel: number;           // 0-100 RMS volume
  peakLevel: number;             // 0-100 peak volume
  frequencyBands: FrequencyBands;
  noiseFloor: number;            // baseline ambient noise level
  isSpeechDetected: boolean;
  isLoudSound: boolean;
  dominantFrequency: number;     // Hz
  audioPattern: AudioPattern;
  alerts: string[];
}

export interface FrequencyBands {
  bass: number;      // 0-255 (20-300 Hz — engines, rumble, heavy impacts)
  midLow: number;    // 0-255 (300-1000 Hz — male speech, groaning)
  midHigh: number;   // 0-255 (1000-4000 Hz — female speech, screaming, sirens)
  treble: number;    // 0-255 (4000-12000 Hz — high-pitched sounds, glass breaking)
}

export type AudioPattern =
  | 'silence'
  | 'ambient_noise'
  | 'speech'
  | 'shouting'
  | 'siren_detected'
  | 'impact_sound'
  | 'distress_vocalization'
  | 'crowd_noise'
  | 'medical_equipment';

export interface CloudAudioAnalysis {
  sceneAudioType: string;        // "accident_scene", "ambulance", "hospital", "quiet_room"
  dominantSounds: string[];      // ["screaming", "sirens", "engine running", "crowd murmur"]
  speechDetected: boolean;
  speakerCount: number;          // estimated number of speakers
  patientSounds: string[];       // ["moaning", "labored breathing", "crying", "unresponsive/silent"]
  environmentSounds: string[];   // ["traffic", "sirens", "rain", "wind", "machinery"]
  distressLevel: 'none' | 'mild' | 'moderate' | 'severe' | 'critical';
  breathingPattern: string;      // "normal", "rapid/shallow", "labored/stridor", "agonal", "not audible"
  urgencyIndicators: string[];   // ["patient screaming in pain", "multiple voices calling for help"]
  audioInsights: string[];       // actionable insights from audio
  confidence: number;
}

// ─── Module State ────────────────────────────────────────────────────────────

let audioContext: AudioContext | null = null;
let analyserNode: AnalyserNode | null = null;
let sourceNode: MediaStreamAudioSourceNode | null = null;
let connectedStream: MediaStream | null = null;

// Frequency data buffers
let frequencyData: Uint8Array | null = null;
let timeDomainData: Uint8Array | null = null;

// Pattern detection history
let volumeHistory: number[] = [];
let patternHistory: AudioPattern[] = [];
const HISTORY_SIZE = 30; // 30 samples = ~30s at 1/s analysis

// Noise floor calibration
let noiseFloor = 10;
let noiseCalibrationSamples: number[] = [];
const CALIBRATION_SAMPLES = 10;

// Cloud analysis cache
let lastCloudAudioAnalysis: CloudAudioAnalysis | null = null;
let lastCloudAudioTime = 0;
const CLOUD_AUDIO_INTERVAL = 10000; // 10 seconds between Gemini audio calls
let cloudAudioInFlight = false;

// Audio recording for cloud analysis
let audioRecorder: MediaRecorder | null = null;
let audioChunks: Blob[] = [];
let isCapturingForCloud = false;

// Gemini model (reuse from visionAI or create own)
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
let geminiAudioModel: any = null;

const getGeminiAudio = () => {
  if (!geminiAudioModel && GEMINI_API_KEY) {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    geminiAudioModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  }
  return geminiAudioModel;
};

// ─── Initialization ──────────────────────────────────────────────────────────

/**
 * Initialize the Audio AI system. Call once when triage call starts.
 */
export const initializeAudioAI = async (): Promise<boolean> => {
  try {
    // Create AudioContext (suspended until connected to a stream)
    if (!audioContext || audioContext.state === 'closed') {
      audioContext = new AudioContext({ sampleRate: 16000 });
    }

    // Create analyser node
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 2048;
    analyserNode.smoothingTimeConstant = 0.8;
    analyserNode.minDecibels = -90;
    analyserNode.maxDecibels = -10;

    const bufferLength = analyserNode.frequencyBinCount;
    frequencyData = new Uint8Array(bufferLength);
    timeDomainData = new Uint8Array(bufferLength);

    // Reset state
    volumeHistory = [];
    patternHistory = [];
    noiseCalibrationSamples = [];
    noiseFloor = 10;

    // Warm up Gemini
    if (GEMINI_API_KEY) {
      getGeminiAudio();
      console.log('✅ Gemini Audio ready');
    }

    console.log('✅ Audio AI initialized');
    return true;
  } catch (error) {
    console.error('Audio AI initialization failed:', error);
    return false;
  }
};

/**
 * Connect a MediaStream (remote audio from LiveKit) to the analyser.
 */
export const connectAudioStream = async (stream: MediaStream): Promise<boolean> => {
  try {
    if (!audioContext || !analyserNode) {
      console.warn('Audio AI not initialized');
      return false;
    }

    // Resume context if suspended (Chrome autoplay policy)
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    // Disconnect previous source
    if (sourceNode) {
      sourceNode.disconnect();
      sourceNode = null;
    }

    // Connect new stream
    sourceNode = audioContext.createMediaStreamSource(stream);
    sourceNode.connect(analyserNode);
    // Note: NOT connecting to audioContext.destination — we don't want to echo it
    connectedStream = stream;

    // Start capturing audio chunks for Gemini cloud analysis
    startAudioChunkCapture(stream);

    console.log('✅ Audio stream connected to analyser');
    return true;
  } catch (error) {
    console.error('Failed to connect audio stream:', error);
    return false;
  }
};

// ─── Edge Audio Analysis (Web Audio API) ─────────────────────────────────────

/**
 * Analyze the current audio frame. Call this on an interval (every 1s).
 * Returns real-time edge analysis of volume, frequency, and patterns.
 */
export const analyzeAudioFrame = (): AudioAnalysisResult | null => {
  if (!analyserNode || !frequencyData || !timeDomainData) return null;

  // Get frequency and time domain data
  analyserNode.getByteFrequencyData(frequencyData);
  analyserNode.getByteTimeDomainData(timeDomainData);

  // Calculate RMS volume
  let sumSquares = 0;
  let peak = 0;
  for (let i = 0; i < timeDomainData.length; i++) {
    const val = (timeDomainData[i] - 128) / 128; // normalize to -1..1
    sumSquares += val * val;
    const absVal = Math.abs(val);
    if (absVal > peak) peak = absVal;
  }
  const rms = Math.sqrt(sumSquares / timeDomainData.length);
  const volumeLevel = Math.min(100, Math.round(rms * 300)); // scale to 0-100
  const peakLevel = Math.min(100, Math.round(peak * 100));

  // Extract frequency bands
  const bands = extractFrequencyBands(frequencyData);

  // Calibrate noise floor from first samples
  if (noiseCalibrationSamples.length < CALIBRATION_SAMPLES) {
    noiseCalibrationSamples.push(volumeLevel);
    if (noiseCalibrationSamples.length === CALIBRATION_SAMPLES) {
      noiseFloor = Math.round(noiseCalibrationSamples.reduce((a, b) => a + b, 0) / CALIBRATION_SAMPLES);
    }
  }

  // Find dominant frequency
  let maxFreqIndex = 0;
  let maxFreqValue = 0;
  for (let i = 1; i < frequencyData.length; i++) {
    if (frequencyData[i] > maxFreqValue) {
      maxFreqValue = frequencyData[i];
      maxFreqIndex = i;
    }
  }
  const sampleRate = audioContext?.sampleRate || 16000;
  const dominantFrequency = Math.round((maxFreqIndex * sampleRate) / (analyserNode.fftSize));

  // Detect speech (energy in 300-4000 Hz range)
  const isSpeechDetected = bands.midLow > 40 || bands.midHigh > 40;
  const isLoudSound = volumeLevel > Math.max(noiseFloor * 3, 40);

  // Classify audio pattern
  const audioPattern = classifyAudioPattern(volumeLevel, bands, dominantFrequency, isSpeechDetected, isLoudSound);

  // Track history
  volumeHistory.push(volumeLevel);
  if (volumeHistory.length > HISTORY_SIZE) volumeHistory.shift();
  patternHistory.push(audioPattern);
  if (patternHistory.length > HISTORY_SIZE) patternHistory.shift();

  // Generate alerts
  const alerts = generateAudioAlerts(volumeLevel, bands, audioPattern, dominantFrequency);

  return {
    timestamp: Date.now(),
    volumeLevel,
    peakLevel,
    frequencyBands: bands,
    noiseFloor,
    isSpeechDetected,
    isLoudSound,
    dominantFrequency,
    audioPattern,
    alerts,
  };
};

/**
 * Extract frequency bands from FFT data
 */
const extractFrequencyBands = (data: Uint8Array): FrequencyBands => {
  const binCount = data.length;
  const sampleRate = audioContext?.sampleRate || 16000;
  const hzPerBin = sampleRate / (binCount * 2);

  // Calculate average energy in each band
  const bandAvg = (lowHz: number, highHz: number): number => {
    const lowBin = Math.floor(lowHz / hzPerBin);
    const highBin = Math.min(Math.floor(highHz / hzPerBin), binCount - 1);
    if (lowBin >= highBin) return 0;
    let sum = 0;
    for (let i = lowBin; i <= highBin; i++) sum += data[i];
    return Math.round(sum / (highBin - lowBin + 1));
  };

  return {
    bass: bandAvg(20, 300),
    midLow: bandAvg(300, 1000),
    midHigh: bandAvg(1000, 4000),
    treble: bandAvg(4000, 12000),
  };
};

/**
 * Classify the current audio pattern based on heuristics
 */
const classifyAudioPattern = (
  volume: number,
  bands: FrequencyBands,
  dominantFreq: number,
  speechDetected: boolean,
  loud: boolean,
): AudioPattern => {
  // Silence
  if (volume < 5) return 'silence';

  // Siren detection: strong energy cycling through 600-2000 Hz
  if (bands.midLow > 80 && bands.midHigh > 80 && dominantFreq >= 600 && dominantFreq <= 2000) {
    // Check for siren oscillation pattern
    const recentVolumes = volumeHistory.slice(-5);
    const hasOscillation = recentVolumes.length >= 3 && recentVolumes.some((v, i) =>
      i > 0 && Math.abs(v - recentVolumes[i - 1]) > 15
    );
    if (hasOscillation) return 'siren_detected';
  }

  // Impact sound: sudden high-energy spike across all bands
  if (loud && bands.bass > 100 && volume > 70) {
    const prevVolume = volumeHistory[volumeHistory.length - 1] || 0;
    if (volume - prevVolume > 30) return 'impact_sound';
  }

  // Distress vocalization: high pitched, loud
  if (loud && bands.midHigh > 100 && dominantFreq > 1500) {
    return 'distress_vocalization';
  }

  // Shouting: loud speech
  if (speechDetected && volume > 50) return 'shouting';

  // Crowd noise: distributed energy, moderate volume
  if (volume > 20 && bands.midLow > 30 && bands.midHigh > 30 && bands.bass > 20) {
    return 'crowd_noise';
  }

  // Speech
  if (speechDetected) return 'speech';

  // Ambient noise
  if (volume > noiseFloor + 5) return 'ambient_noise';

  return 'silence';
};

/**
 * Generate real-time audio alerts
 */
const generateAudioAlerts = (
  volume: number,
  bands: FrequencyBands,
  pattern: AudioPattern,
  dominantFreq: number,
): string[] => {
  const alerts: string[] = [];

  if (pattern === 'siren_detected') {
    alerts.push('🚨 Siren detected — emergency vehicle nearby');
  }
  if (pattern === 'distress_vocalization') {
    alerts.push('😱 Distress vocalization — possible patient screaming/crying');
  }
  if (pattern === 'impact_sound') {
    alerts.push('💥 Impact sound — possible secondary collision or falling debris');
  }
  if (pattern === 'shouting') {
    alerts.push('🗣️ Shouting detected — high-stress communication');
  }
  if (pattern === 'crowd_noise') {
    alerts.push('👥 Crowd noise — multiple people at scene');
  }

  // Sudden silence after noise could indicate loss of consciousness
  const recentPatterns = patternHistory.slice(-5);
  if (recentPatterns.length >= 4) {
    const wasNoisy = recentPatterns.slice(0, 3).some(p => ['shouting', 'distress_vocalization', 'speech'].includes(p));
    const nowSilent = recentPatterns.slice(-2).every(p => p === 'silence');
    if (wasNoisy && nowSilent) {
      alerts.push('⚠️ Sudden silence after vocalization — check patient consciousness');
    }
  }

  return alerts;
};

// ─── Audio Chunk Capture for Cloud Analysis ──────────────────────────────────

/**
 * Start capturing audio chunks from the stream for periodic Gemini analysis
 */
const startAudioChunkCapture = (stream: MediaStream) => {
  if (isCapturingForCloud || !stream.getAudioTracks().length) return;

  try {
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    audioRecorder = new MediaRecorder(stream, {
      mimeType,
      audioBitsPerSecond: 64000,
    });

    audioChunks = [];

    audioRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        audioChunks.push(e.data);
        // Keep only last 10 seconds worth of chunks
        while (audioChunks.length > 12) audioChunks.shift();
      }
    };

    audioRecorder.start(1000); // collect 1-second chunks
    isCapturingForCloud = true;
    console.log('✅ Audio chunk capture started for Gemini analysis');
  } catch (err) {
    console.warn('Failed to start audio chunk capture:', err);
  }
};

// ─── Cloud Audio Analysis (Gemini) ───────────────────────────────────────────

/**
 * Send recent audio to Gemini for intelligent scene audio comprehension.
 * Rate-limited to every 10 seconds.
 */
export const analyzeAudioWithGemini = async (): Promise<CloudAudioAnalysis | null> => {
  const now = Date.now();
  if (now - lastCloudAudioTime < CLOUD_AUDIO_INTERVAL) return lastCloudAudioAnalysis;
  if (cloudAudioInFlight) return lastCloudAudioAnalysis;
  if (audioChunks.length < 3) return lastCloudAudioAnalysis; // need at least 3 seconds of audio

  const model = getGeminiAudio();
  if (!model) return null;

  cloudAudioInFlight = true;
  try {
    // Combine recent audio chunks into a single blob (last ~8 seconds)
    const recentChunks = audioChunks.slice(-8);
    const audioBlob = new Blob(recentChunks, { type: 'audio/webm' });

    // Convert to base64
    const arrayBuffer = await audioBlob.arrayBuffer();
    const base64 = btoa(
      new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
    );

    const prompt = `You are an emergency medical AI audio analyst. You are listening to LIVE audio from an accident/emergency scene captured through an iPad or ambulance device during a triage video call.

Analyze this audio clip and respond in STRICT JSON (no markdown, no backticks):
{
  "sceneAudioType": "accident_scene|ambulance_interior|hospital|roadside|indoor|outdoor|quiet_room|unknown",
  "dominantSounds": ["<top 3-5 most prominent sounds heard>"],
  "speechDetected": <true|false>,
  "speakerCount": <estimated number of distinct speakers, 0 if none>,
  "patientSounds": ["<any patient-related sounds: moaning, labored breathing, crying, screaming, whimpering, coughing, silence>"],
  "environmentSounds": ["<background sounds: traffic, sirens, wind, rain, machinery, crowd murmur, beeping>"],
  "distressLevel": "none|mild|moderate|severe|critical",
  "breathingPattern": "<normal|rapid_shallow|labored|stridor|agonal|wheezing|not_audible>",
  "urgencyIndicators": ["<specific audio cues indicating urgency>"],
  "audioInsights": ["<3-5 actionable medical insights based on what you hear>"],
  "confidence": <0.0-1.0>
}

Listen carefully for:
- Patient distress sounds (moaning, screaming, labored breathing, agonal gasps)
- Sirens indicating emergency vehicles
- Multiple voices indicating bystander presence
- Environmental hazards (traffic, machinery, alarms)
- Breathing patterns that indicate respiratory distress
- Silence from patient position (possible unconsciousness)

Be medically precise. If audio is mostly speech/conversation, describe what you can infer about the situation.`;

    const result = await model.generateContent([
      prompt,
      { inlineData: { mimeType: 'audio/webm', data: base64 } },
    ]);

    const text = result.response.text().trim();
    const jsonStr = text.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim();
    const parsed: CloudAudioAnalysis = JSON.parse(jsonStr);

    lastCloudAudioAnalysis = parsed;
    lastCloudAudioTime = now;
    return parsed;
  } catch (err) {
    console.warn('[AudioAI] Gemini audio analysis error:', err);
    return lastCloudAudioAnalysis;
  } finally {
    cloudAudioInFlight = false;
  }
};

// ─── Triage Audio Summary ────────────────────────────────────────────────────

/**
 * Generate a human-readable audio triage summary
 */
export const getAudioTriageSummary = (
  edgeAnalysis: AudioAnalysisResult | null,
  cloudAnalysis: CloudAudioAnalysis | null,
): string => {
  const parts: string[] = [];

  if (edgeAnalysis) {
    parts.push(`🔊 Volume: ${edgeAnalysis.volumeLevel}% | Pattern: ${edgeAnalysis.audioPattern.replace('_', ' ')}`);
    if (edgeAnalysis.isSpeechDetected) parts.push(`🗣️ Speech detected`);
    if (edgeAnalysis.alerts.length > 0) {
      parts.push(`Alerts: ${edgeAnalysis.alerts.join(', ')}`);
    }
  }

  if (cloudAnalysis) {
    parts.push(`\n🤖 AI Audio Analysis (${Math.round(cloudAnalysis.confidence * 100)}% confidence):`);
    parts.push(`  Scene: ${cloudAnalysis.sceneAudioType}`);
    parts.push(`  Sounds: ${cloudAnalysis.dominantSounds.join(', ')}`);
    if (cloudAnalysis.patientSounds.length > 0) {
      parts.push(`  Patient: ${cloudAnalysis.patientSounds.join(', ')}`);
    }
    parts.push(`  Distress: ${cloudAnalysis.distressLevel}`);
    parts.push(`  Breathing: ${cloudAnalysis.breathingPattern}`);
    if (cloudAnalysis.urgencyIndicators.length > 0) {
      parts.push(`  Urgency: ${cloudAnalysis.urgencyIndicators.join('; ')}`);
    }
    if (cloudAnalysis.audioInsights.length > 0) {
      parts.push(`  Insights:`);
      cloudAnalysis.audioInsights.forEach((a, i) => parts.push(`    ${i + 1}. ${a}`));
    }
  }

  return parts.join('\n');
};

// ─── Full-Call Audio Recording ───────────────────────────────────────────────

let fullCallRecorder: MediaRecorder | null = null;
let fullCallChunks: Blob[] = [];
let fullCallStartTime = 0;

/**
 * Start recording the full audio stream for post-call review.
 * Returns true if recording started successfully.
 */
export const startFullCallRecording = (stream: MediaStream): boolean => {
  try {
    if (fullCallRecorder && fullCallRecorder.state === 'recording') {
      return true; // already recording
    }

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    fullCallRecorder = new MediaRecorder(stream, {
      mimeType,
      audioBitsPerSecond: 128000,
    });

    fullCallChunks = [];
    fullCallStartTime = Date.now();

    fullCallRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) fullCallChunks.push(e.data);
    };

    fullCallRecorder.start(2000); // 2-second chunks
    console.log('✅ Full call audio recording started');
    return true;
  } catch (err) {
    console.error('Failed to start full call recording:', err);
    return false;
  }
};

/**
 * Stop recording and return the full audio blob.
 */
export const stopFullCallRecording = (): Promise<Blob | null> => {
  return new Promise((resolve) => {
    if (!fullCallRecorder || fullCallRecorder.state === 'inactive') {
      resolve(null);
      return;
    }

    fullCallRecorder.onstop = () => {
      if (fullCallChunks.length === 0) {
        resolve(null);
        return;
      }
      const blob = new Blob(fullCallChunks, { type: fullCallRecorder?.mimeType || 'audio/webm' });
      fullCallChunks = [];
      resolve(blob);
    };

    fullCallRecorder.stop();
  });
};

/**
 * Get current recording duration in seconds.
 */
export const getRecordingDuration = (): number => {
  if (!fullCallRecorder || fullCallRecorder.state !== 'recording') return 0;
  return Math.floor((Date.now() - fullCallStartTime) / 1000);
};

// ─── Cleanup ─────────────────────────────────────────────────────────────────

/**
 * Cleanup all Audio AI resources. Call when triage call ends.
 */
export const cleanupAudioAI = () => {
  // Stop cloud chunk capture
  if (audioRecorder && audioRecorder.state !== 'inactive') {
    try { audioRecorder.stop(); } catch (_) { /* ignore */ }
  }
  audioRecorder = null;
  audioChunks = [];
  isCapturingForCloud = false;

  // Stop full call recording
  if (fullCallRecorder && fullCallRecorder.state !== 'inactive') {
    try { fullCallRecorder.stop(); } catch (_) { /* ignore */ }
  }
  fullCallRecorder = null;
  fullCallChunks = [];

  // Disconnect audio nodes
  if (sourceNode) {
    try { sourceNode.disconnect(); } catch (_) { /* ignore */ }
    sourceNode = null;
  }
  analyserNode = null;
  connectedStream = null;

  // Close AudioContext
  if (audioContext && audioContext.state !== 'closed') {
    audioContext.close().catch(() => { /* ignore */ });
  }
  audioContext = null;

  // Reset buffers
  frequencyData = null;
  timeDomainData = null;
  volumeHistory = [];
  patternHistory = [];
  noiseCalibrationSamples = [];

  // Reset cloud state
  lastCloudAudioAnalysis = null;
  lastCloudAudioTime = 0;
  cloudAudioInFlight = false;

  console.log('🔇 Audio AI cleaned up');
};
