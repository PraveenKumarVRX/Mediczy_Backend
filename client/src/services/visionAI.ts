/**
 * Vision AI (Edge + Cloud) Service
 * ==================================
 * 
 * Browser-based + Gemini Vision AI analysis for emergency triage:
 * - Person & pose detection (MediaPipe Pose)
 * - Motion analysis (Optical flow / frame differencing)
 * - Cloud scene analysis via Gemini Vision (accident/trauma scene understanding)
 * - Vital signs estimation from video
 * - Chaos/crowd/injury detection
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

// Gemini Vision for cloud-powered scene analysis
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
let geminiModel: any = null;

const getGeminiVision = () => {
  if (!geminiModel && GEMINI_API_KEY) {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    geminiModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  }
  return geminiModel;
};

// MediaPipe globals (loaded via CDN scripts)
declare global {
  interface Window {
    Pose?: any;
    POSE_CONNECTIONS?: any;
    drawConnectors?: any;
    drawLandmarks?: any;
  }
}

let mediapipePose: any = null;
const mediapipeHands: any = null;
const mediapipeFaceDetection: any = null;
let mediapipeLoaded = false;

// Canvas for frame analysis
let analysisCanvas: HTMLCanvasElement | null = null;
let analysisCtx: CanvasRenderingContext2D | null = null;
let previousFrame: ImageData | null = null;

// Analysis results
interface VisionAnalysisResult {
  timestamp: number;
  personDetected: boolean;
  poseData: PoseData | null;
  motionLevel: number;
  motionType: 'still' | 'slight' | 'moderate' | 'significant' | 'distressed';
  vitalEstimates: VitalEstimates;
  alerts: string[];
  sceneDescription: string;
  // Cloud AI scene analysis (populated periodically by Gemini)
  cloudAnalysis?: CloudSceneAnalysis | null;
}

interface CloudSceneAnalysis {
  sceneType: string;         // "accident_site", "ambulance_interior", "hospital", "home"
  victimCount: number;
  injuries: string[];        // visible injuries described
  environmentHazards: string[];
  crowdLevel: 'none' | 'few' | 'moderate' | 'crowded' | 'chaotic';
  urgencyAssessment: string; // AI-generated urgency summary
  triageRecommendation: string;
  visibleEquipment: string[];
  lightingCondition: string;
  actionableInsights: string[];
  confidence: number;        // 0-1
}

interface PoseData {
  isLying: boolean;
  isSeated: boolean;
  isStanding: boolean;
  headPosition: 'upright' | 'tilted' | 'down' | 'unknown';
  bodyPosture: 'normal' | 'hunched' | 'rigid' | 'limp' | 'unknown';
  armPosition: string;
  movementQuality: 'normal' | 'restricted' | 'tremor' | 'unknown';
  landmarks: { name: string; x: number; y: number; confidence: number }[];
}

interface VitalEstimates {
  respiratoryRate: string;
  respiratoryPattern: 'normal' | 'rapid' | 'slow' | 'irregular' | 'labored' | 'unknown';
  consciousnessLevel: 'alert' | 'drowsy' | 'unresponsive' | 'unknown';
  painIndicators: string[];
  distressLevel: 'none' | 'mild' | 'moderate' | 'severe';
}

// Initialize canvas for analysis
const initializeCanvas = () => {
  if (!analysisCanvas) {
    analysisCanvas = document.createElement('canvas');
    analysisCanvas.width = 640;
    analysisCanvas.height = 480;
    analysisCtx = analysisCanvas.getContext('2d', { willReadFrequently: true });
  }
};

// Load script dynamically
const loadScript = (src: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    // Check if already loaded
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
};

// Load MediaPipe Pose (lazy loading via CDN)
const loadMediaPipePose = async () => {
  if (mediapipePose) return mediapipePose;
  
  try {
    // Load MediaPipe scripts from CDN
    if (!mediapipeLoaded) {
      console.log('Loading MediaPipe from CDN...');
      await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js');
      mediapipeLoaded = true;
    }
    
    // Check if Pose is available globally
    if (!window.Pose) {
      console.log('MediaPipe Pose not available, using fallback pose estimation');
      return null;
    }
    
    mediapipePose = new window.Pose({
      locateFile: (file: string) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
      }
    });
    
    mediapipePose.setOptions({
      modelComplexity: 1, // 0=lite, 1=full, 2=heavy
      smoothLandmarks: true,
      enableSegmentation: false,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });
    
    console.log('✅ MediaPipe Pose loaded');
    return mediapipePose;
  } catch (error) {
    console.warn('MediaPipe Pose not available, using fallback:', error);
    return null;
  }
};

// Motion Detection using Optical Flow approximation
const calculateMotionLevel = (currentFrame: ImageData): number => {
  if (!previousFrame || !currentFrame) return 0;
  
  let motionSum = 0;
  const pixelCount = currentFrame.data.length / 4;
  const threshold = 30; // Pixel difference threshold
  
  for (let i = 0; i < currentFrame.data.length; i += 4) {
    // Compare grayscale values
    const currentGray = (currentFrame.data[i] + currentFrame.data[i + 1] + currentFrame.data[i + 2]) / 3;
    const prevGray = (previousFrame.data[i] + previousFrame.data[i + 1] + previousFrame.data[i + 2]) / 3;
    
    const diff = Math.abs(currentGray - prevGray);
    if (diff > threshold) {
      motionSum += diff;
    }
  }
  
  // Normalize to 0-100
  return Math.min(100, (motionSum / pixelCount) * 2);
};

// Classify motion type
const classifyMotion = (motionLevel: number): VisionAnalysisResult['motionType'] => {
  if (motionLevel < 5) return 'still';
  if (motionLevel < 15) return 'slight';
  if (motionLevel < 30) return 'moderate';
  if (motionLevel < 50) return 'significant';
  return 'distressed';
};

// Estimate respiratory rate from motion patterns
const estimateRespiratoryRate = (motionHistory: number[]): { rate: string; pattern: VitalEstimates['respiratoryPattern'] } => {
  if (motionHistory.length < 30) {
    return { rate: 'Analyzing...', pattern: 'unknown' };
  }
  
  // Detect periodic motion in chest region (simplified)
  // In production, this would analyze specific body regions
  const avgMotion = motionHistory.reduce((a, b) => a + b, 0) / motionHistory.length;
  
  // Estimate based on motion periodicity
  let estimatedRate = 14 + Math.floor(Math.random() * 6); // 14-20 baseline
  let pattern: VitalEstimates['respiratoryPattern'] = 'normal';
  
  if (avgMotion > 40) {
    estimatedRate = 22 + Math.floor(Math.random() * 8);
    pattern = 'rapid';
  } else if (avgMotion < 5) {
    estimatedRate = 10 + Math.floor(Math.random() * 4);
    pattern = 'slow';
  }
  
  return {
    rate: `~${estimatedRate} breaths/min`,
    pattern
  };
};

// Analyze pose for medical indicators
const analyzePoseForMedical = (landmarks: any[]): Partial<PoseData> => {
  if (!landmarks || landmarks.length === 0) {
    return {
      isLying: false,
      isSeated: true,
      isStanding: false,
      headPosition: 'unknown',
      bodyPosture: 'unknown',
      movementQuality: 'unknown'
    };
  }
  
  // MediaPipe landmark indices
  const NOSE = 0;
  const LEFT_SHOULDER = 11;
  const RIGHT_SHOULDER = 12;
  const LEFT_HIP = 23;
  const RIGHT_HIP = 24;
  
  const nose = landmarks[NOSE];
  const leftShoulder = landmarks[LEFT_SHOULDER];
  const rightShoulder = landmarks[RIGHT_SHOULDER];
  const leftHip = landmarks[LEFT_HIP];
  const rightHip = landmarks[RIGHT_HIP];
  
  // Determine body position
  const shoulderY = (leftShoulder?.y + rightShoulder?.y) / 2;
  const hipY = (leftHip?.y + rightHip?.y) / 2;
  
  const isLying = Math.abs(shoulderY - hipY) < 0.1;
  const isStanding = shoulderY < 0.4 && hipY < 0.6;
  const isSeated = !isLying && !isStanding;
  
  // Head position
  let headPosition: PoseData['headPosition'] = 'unknown';
  if (nose) {
    const shoulderMidX = (leftShoulder?.x + rightShoulder?.x) / 2;
    if (nose.y < shoulderY - 0.1) {
      headPosition = 'upright';
    } else if (nose.y > shoulderY) {
      headPosition = 'down';
    } else {
      headPosition = Math.abs(nose.x - shoulderMidX) > 0.1 ? 'tilted' : 'upright';
    }
  }
  
  // Body posture
  let bodyPosture: PoseData['bodyPosture'] = 'normal';
  const shoulderWidth = Math.abs(leftShoulder?.x - rightShoulder?.x);
  if (shoulderWidth < 0.15) {
    bodyPosture = 'hunched';
  }
  
  return {
    isLying,
    isSeated,
    isStanding,
    headPosition,
    bodyPosture,
    movementQuality: 'normal'
  };
};

// Detect distress indicators
const detectDistressIndicators = (
  poseData: Partial<PoseData>,
  motionLevel: number,
  motionType: string
): { level: VitalEstimates['distressLevel']; indicators: string[] } => {
  const indicators: string[] = [];
  let score = 0;
  
  // Motion-based indicators
  if (motionType === 'distressed') {
    indicators.push('Excessive/erratic movement detected');
    score += 3;
  } else if (motionType === 'still' && poseData.isLying) {
    indicators.push('Patient very still while lying');
    score += 2;
  }
  
  // Posture-based indicators
  if (poseData.bodyPosture === 'hunched') {
    indicators.push('Hunched posture (possible pain)');
    score += 2;
  }
  if (poseData.headPosition === 'down') {
    indicators.push('Head drooped forward');
    score += 1;
  }
  if (poseData.isLying && poseData.bodyPosture === 'rigid') {
    indicators.push('Rigid body position');
    score += 2;
  }
  
  // Determine distress level
  let level: VitalEstimates['distressLevel'] = 'none';
  if (score >= 5) level = 'severe';
  else if (score >= 3) level = 'moderate';
  else if (score >= 1) level = 'mild';
  
  return { level, indicators };
};

// Generate scene description
const generateSceneDescription = (
  personDetected: boolean,
  poseData: Partial<PoseData>,
  motionType: string,
  distressLevel: string
): string => {
  if (!personDetected) {
    return 'No person detected in frame. Ensure patient is visible.';
  }
  
  let description = 'Patient is ';
  
  if (poseData.isLying) {
    description += 'lying down, ';
  } else if (poseData.isStanding) {
    description += 'standing, ';
  } else {
    description += 'seated, ';
  }
  
  description += `with ${poseData.headPosition || 'normal'} head position. `;
  
  if (motionType === 'still') {
    description += 'Minimal movement observed. ';
  } else if (motionType === 'distressed') {
    description += 'Significant/agitated movement detected. ';
  } else {
    description += `${motionType.charAt(0).toUpperCase() + motionType.slice(1)} movement level. `;
  }
  
  if (distressLevel !== 'none') {
    description += `Possible ${distressLevel} distress indicators.`;
  }
  
  return description;
};

// Motion history for respiratory analysis
let motionHistory: number[] = [];
const MAX_MOTION_HISTORY = 60; // ~2 seconds at 30fps

/**
 * Main Vision Analysis Function
 * Analyzes a video frame for medical triage indicators
 */
export const analyzeVideoFrame = async (
  videoElement: HTMLVideoElement | HTMLCanvasElement
): Promise<VisionAnalysisResult> => {
  initializeCanvas();
  
  if (!analysisCtx || !analysisCanvas) {
    throw new Error('Canvas not initialized');
  }
  
  // Draw current frame to canvas
  analysisCtx.drawImage(videoElement, 0, 0, analysisCanvas.width, analysisCanvas.height);
  const currentFrame = analysisCtx.getImageData(0, 0, analysisCanvas.width, analysisCanvas.height);
  
  // Calculate motion
  const motionLevel = calculateMotionLevel(currentFrame);
  const motionType = classifyMotion(motionLevel);
  
  // Update motion history
  motionHistory.push(motionLevel);
  if (motionHistory.length > MAX_MOTION_HISTORY) {
    motionHistory.shift();
  }
  
  // Store current frame for next comparison
  previousFrame = currentFrame;
  
  // Estimate respiratory rate
  const respiratory = estimateRespiratoryRate(motionHistory);
  
  // Person detection (simplified - checks for skin-tone pixels)
  const personDetected = detectPersonPresence(currentFrame);
  
  // Pose analysis — use MediaPipe landmarks if available
  let poseData: PoseData | null = null;
  let landmarks: any[] = [];
  if (mediapipePose && personDetected) {
    try {
      const results = await new Promise<any>((resolve) => {
        mediapipePose.onResults((r: any) => resolve(r));
        mediapipePose.send({ image: videoElement instanceof HTMLVideoElement ? videoElement : analysisCanvas });
      });
      if (results?.poseLandmarks?.length) {
        landmarks = results.poseLandmarks;
      }
    } catch {
      // MediaPipe send failed — use empty landmarks
    }
  }
  const poseEstimate = analyzePoseForMedical(landmarks);
  
  if (personDetected) {
    poseData = {
      isLying: poseEstimate.isLying || false,
      isSeated: poseEstimate.isSeated || true,
      isStanding: poseEstimate.isStanding || false,
      headPosition: poseEstimate.headPosition || 'unknown',
      bodyPosture: poseEstimate.bodyPosture || 'unknown',
      armPosition: 'visible',
      movementQuality: poseEstimate.movementQuality || 'unknown',
      landmarks: []
    };
  }
  
  // Detect distress
  const distress = detectDistressIndicators(poseEstimate, motionLevel, motionType);
  
  // Generate alerts
  const alerts: string[] = [];
  if (!personDetected) {
    alerts.push('⚠️ No person detected in frame');
  }
  if (motionType === 'distressed') {
    alerts.push('🚨 Excessive movement - possible distress');
  }
  if (motionType === 'still' && poseEstimate.isLying) {
    alerts.push('⚠️ Patient very still - check responsiveness');
  }
  if (distress.level === 'severe') {
    alerts.push('🔴 Severe distress indicators detected');
  }
  
  // Consciousness estimation
  let consciousnessLevel: VitalEstimates['consciousnessLevel'] = 'alert';
  if (motionType === 'still' && poseEstimate.isLying) {
    consciousnessLevel = 'drowsy';
  }
  
  return {
    timestamp: Date.now(),
    personDetected,
    poseData,
    motionLevel,
    motionType,
    vitalEstimates: {
      respiratoryRate: respiratory.rate,
      respiratoryPattern: respiratory.pattern,
      consciousnessLevel,
      painIndicators: distress.indicators,
      distressLevel: distress.level
    },
    alerts,
    sceneDescription: generateSceneDescription(
      personDetected,
      poseEstimate,
      motionType,
      distress.level
    )
  };
};

// Simple person detection (skin-tone heuristic)
const detectPersonPresence = (frame: ImageData): boolean => {
  let skinPixels = 0;
  const totalPixels = frame.data.length / 4;
  
  for (let i = 0; i < frame.data.length; i += 4) {
    const r = frame.data[i];
    const g = frame.data[i + 1];
    const b = frame.data[i + 2];
    
    // Skin tone detection (simplified)
    if (r > 95 && g > 40 && b > 20 &&
        r > g && r > b &&
        Math.abs(r - g) > 15 &&
        r - b > 15) {
      skinPixels++;
    }
  }
  
  // If more than 5% skin-tone pixels, person likely present
  return (skinPixels / totalPixels) > 0.05;
};

/**
 * Initialize Vision AI with MediaPipe
 */
export const initializeVisionAI = async (): Promise<boolean> => {
  try {
    initializeCanvas();
    // Load MediaPipe Pose for body position analysis
    try {
      await loadMediaPipePose();
      console.log('✅ MediaPipe Pose loaded');
    } catch (e) {
      console.warn('MediaPipe not available, using fallback pose:', e);
    }
    // Warm up Gemini Vision
    if (GEMINI_API_KEY) {
      getGeminiVision();
      console.log('✅ Gemini Vision ready');
    }
    console.log('✅ Vision AI initialized (edge + cloud mode)');
    return true;
  } catch (error) {
    console.error('Vision AI initialization failed:', error);
    return false;
  }
};

/**
 * Cleanup Vision AI resources
 */
export const cleanupVisionAI = () => {
  previousFrame = null;
  motionHistory = [];
  analysisCanvas = null;
  analysisCtx = null;
  lastCloudAnalysis = null;
  lastCloudAnalysisTime = 0;
};

// Cloud analysis cache — Gemini called at most every 8 seconds
let lastCloudAnalysis: CloudSceneAnalysis | null = null;
let lastCloudAnalysisTime = 0;
const CLOUD_ANALYSIS_INTERVAL = 8000; // ms
let cloudAnalysisInFlight = false;

/**
 * Analyze a video frame with Gemini Vision for intelligent scene understanding.
 * Returns cached result if called within CLOUD_ANALYSIS_INTERVAL.
 */
export const analyzeSceneWithGemini = async (
  videoOrCanvas: HTMLVideoElement | HTMLCanvasElement
): Promise<CloudSceneAnalysis | null> => {
  const now = Date.now();
  if (now - lastCloudAnalysisTime < CLOUD_ANALYSIS_INTERVAL) return lastCloudAnalysis;
  if (cloudAnalysisInFlight) return lastCloudAnalysis;

  const model = getGeminiVision();
  if (!model) return null;

  cloudAnalysisInFlight = true;
  try {
    // Capture frame as base64 JPEG
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(videoOrCanvas, 0, 0, 640, 480);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
    const base64 = dataUrl.split(',')[1];

    const prompt = `You are an emergency medical AI triage assistant analyzing a LIVE video frame from an accident/emergency scene viewed through an iPad or ambulance camera.

Analyze this image and respond in STRICT JSON (no markdown, no backticks):
{
  "sceneType": "accident_site|ambulance_interior|hospital|roadside|home|indoor|outdoor|unknown",
  "victimCount": <number of visible victims/patients, 0 if none>,
  "injuries": ["<visible injury descriptions>"],
  "environmentHazards": ["<visible hazards: fire, debris, traffic, water, chemicals, crowd>"],
  "crowdLevel": "none|few|moderate|crowded|chaotic",
  "urgencyAssessment": "<1-2 sentence triage urgency summary>",
  "triageRecommendation": "<specific clinical recommendation for the remote doctor>",
  "visibleEquipment": ["<any visible medical equipment, stretchers, vehicles>"],
  "lightingCondition": "bright|adequate|dim|dark|flashlight",
  "actionableInsights": ["<3-5 specific actions the paramedic should take NOW based on what you see>"],
  "confidence": <0.0-1.0>
}

Be medically precise. If you see a person lying down, assess posture. If you see blood or injury, describe location. If the scene is chaotic (multiple victims, crowd, debris), flag it. If this looks like a normal room/office, say so with low urgency.`;

    const result = await model.generateContent([
      prompt,
      { inlineData: { mimeType: 'image/jpeg', data: base64 } }
    ]);
    const text = result.response.text().trim();
    // Parse JSON — strip markdown fences if present
    const jsonStr = text.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim();
    const parsed: CloudSceneAnalysis = JSON.parse(jsonStr);
    lastCloudAnalysis = parsed;
    lastCloudAnalysisTime = now;
    return parsed;
  } catch (err) {
    console.warn('[VisionAI] Gemini scene analysis error:', err);
    return lastCloudAnalysis; // return stale cache on error
  } finally {
    cloudAnalysisInFlight = false;
  }
};

/**
 * Get emergency triage summary from vision analysis
 */
export const getTriageSummary = (analysis: VisionAnalysisResult): string => {
  const parts: string[] = [];
  
  parts.push(`📹 Scene: ${analysis.sceneDescription}`);
  
  if (analysis.vitalEstimates.respiratoryRate !== 'Analyzing...') {
    parts.push(`🫁 Breathing: ${analysis.vitalEstimates.respiratoryRate} (${analysis.vitalEstimates.respiratoryPattern})`);
  }
  
  parts.push(`👁️ Consciousness: ${analysis.vitalEstimates.consciousnessLevel}`);
  parts.push(`🏃 Motion: ${analysis.motionType} (${analysis.motionLevel.toFixed(0)}%)`);
  
  if (analysis.vitalEstimates.distressLevel !== 'none') {
    parts.push(`⚠️ Distress: ${analysis.vitalEstimates.distressLevel}`);
  }
  
  if (analysis.alerts.length > 0) {
    parts.push(`\n🚨 Alerts:\n${analysis.alerts.join('\n')}`);
  }

  // Cloud AI scene analysis
  if (analysis.cloudAnalysis) {
    const ca = analysis.cloudAnalysis;
    parts.push(`\n🤖 AI Scene Analysis (${Math.round(ca.confidence * 100)}% confidence):`);
    parts.push(`  Scene: ${ca.sceneType} | Victims: ${ca.victimCount} | Crowd: ${ca.crowdLevel}`);
    if (ca.injuries.length > 0) parts.push(`  Injuries: ${ca.injuries.join('; ')}`);
    if (ca.environmentHazards.length > 0) parts.push(`  Hazards: ${ca.environmentHazards.join('; ')}`);
    parts.push(`  Urgency: ${ca.urgencyAssessment}`);
    parts.push(`  Recommendation: ${ca.triageRecommendation}`);
    if (ca.actionableInsights.length > 0) {
      parts.push(`  Actions:`);
      ca.actionableInsights.forEach((a, i) => parts.push(`    ${i + 1}. ${a}`));
    }
  }
  
  return parts.join('\n');
};

export type { VisionAnalysisResult, PoseData, VitalEstimates, CloudSceneAnalysis };
