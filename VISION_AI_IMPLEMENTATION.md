# Vision AI (Edge) Implementation

## Overview

Vision AI has been integrated into the Emergency triage system for browser-based AI video analysis during emergency consultations. This enables real-time medical assessment without sending video to external servers.

## Components

### 1. Vision AI Service (`/client/src/services/visionAI.ts`)

A comprehensive browser-based AI vision analysis service featuring:

#### Person Detection
- Skin-tone heuristic detection
- Face region estimation
- Body outline detection

#### Pose Estimation (MediaPipe)
- Lazy-loaded from CDN (https://cdn.jsdelivr.net/npm/@mediapipe/pose/)
- Detects 33 body landmarks
- Determines posture: lying, seated, standing
- Analyzes head position and body posture

#### Motion Analysis (Optical Flow)
- Frame-by-frame pixel difference analysis
- Calculates motion level percentage
- Classifies motion type:
  - `still` (0-5%): Patient not moving
  - `slight` (5-15%): Minor movements
  - `moderate` (15-30%): Normal activity
  - `significant` (30-50%): Active movement
  - `distressed` (50%+): Possible distress

#### Respiratory Rate Estimation
- Analyzes chest region motion patterns
- Estimates breaths per minute
- Detects irregular breathing patterns

#### Distress Detection
- Monitors motion patterns for pain indicators
- Detects clutching motions (head, chest, abdomen)
- Identifies unusual postures

### 2. Emergency.tsx Integration

#### New States Added
```typescript
const [visionAIEnabled, setVisionAIEnabled] = useState(false);
const [visionAnalysis, setVisionAnalysis] = useState<any>(null);
const [visionAlerts, setVisionAlerts] = useState<string[]>([]);
const [sceneDescription, setSceneDescription] = useState<string>('');
```

#### Vision AI Functions
- `startVisionAIAnalysis()`: Initializes camera and starts analysis loop
- `stopVisionAI()`: Cleans up resources and stops analysis
- Analysis runs every 1000ms for performance

#### UI Components
- Vision AI toggle button in video call header
- Vision AI alerts panel (red background for alerts)
- Scene description panel (blue background)
- 4-column AI Features Panel:
  1. Vision AI (person detection, motion, pose)
  2. AI Vitals (pulse, breathing, consciousness)
  3. Live Transcript (speech-to-text)
  4. AI Suggestions (medical recommendations)

## Technical Details

### MediaPipe Loading
```typescript
// CDN-based lazy loading
await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js');

const pose = new window.Pose({
  locateFile: (file: string) => {
    return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
  }
});
```

### Motion Detection Algorithm
```typescript
// Farneback-like optical flow approximation
for (let i = 0; i < pixelCount; i++) {
  const idx = i * 4;
  const diff = Math.abs(currentFrame.data[idx] - previousFrame.data[idx]) +
               Math.abs(currentFrame.data[idx+1] - previousFrame.data[idx+1]) +
               Math.abs(currentFrame.data[idx+2] - previousFrame.data[idx+2]);
  if (diff > threshold) motionSum++;
}
return (motionSum / pixelCount) * 100;
```

### Analysis Pipeline
1. Capture video frame to canvas
2. Extract ImageData for analysis
3. Run parallel analysis:
   - Motion level calculation
   - Person detection
   - Pose analysis (if MediaPipe available)
   - Respiratory rate estimation
   - Distress detection
4. Generate scene description
5. Update UI with results

## AI Models Used

| Feature | Model | Source |
|---------|-------|--------|
| Pose Estimation | MediaPipe Pose | CDN (jsdelivr) |
| Motion Analysis | Custom Optical Flow | Browser (canvas) |
| Person Detection | Skin-tone heuristic | Browser (canvas) |
| Respiratory Analysis | Motion patterns | Browser (canvas) |

## Performance Considerations

- Analysis runs at 1 FPS (1000ms interval)
- Canvas resolution: 640x480
- MediaPipe lazy-loads only when needed
- Fallback analysis if MediaPipe unavailable

## Usage

1. Start emergency video call
2. Click "👁️ Vision" button to enable Vision AI
3. View real-time analysis in AI Features Panel
4. Vision AI alerts appear automatically if distress detected
5. Summary generated when call ends

## Future Enhancements

- [ ] TensorFlow.js YOLO model for object detection
- [ ] WebGL acceleration for faster analysis
- [ ] RAFT-lite optical flow for better motion tracking
- [ ] Heart rate estimation via rPPG (remote photoplethysmography)
- [ ] Fall detection algorithm
- [ ] Integration with SIB for AI-enhanced triage scoring

## Files Modified

1. `/client/src/services/visionAI.ts` - NEW (Vision AI service)
2. `/client/src/pages/Emergency.tsx` - MODIFIED (Vision AI integration)

## API Exports

```typescript
// Main analysis function
export const analyzeVideoFrame = async (
  videoElement: HTMLVideoElement
): Promise<VisionAnalysisResult>

// Initialize MediaPipe
export const initializeVisionAI = async ()

// Generate triage summary
export const getTriageSummary = (
  analysisHistory: VisionAnalysisResult[]
): string
```
