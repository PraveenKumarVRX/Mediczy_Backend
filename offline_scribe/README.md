# 🏥 Mediczy Offline AI Scribe - Hospital Grade

## Overview

Complete offline AI medical scribe for Indian hospitals supporting:

- **Languages**: Tamil, Telugu, Hindi, English (code-mixed)
- **Use Cases**: OPD Prescriptions, OPD Notes, IPD Notes, Discharge Summaries
- **Model**: Indic-Gemma-2B-Navarasa (Q4_K_M) - CPU-only
- **STT**: Whisper.cpp with Indic language support

## Architecture

```
┌────────────────────────────┐
│   Practice / Hospital App  │
│ (HIS / PMS / EMR Frontend) │
└──────────────┬─────────────┘
               │
        Start / Stop Scribe
               │
┌──────────────▼─────────────┐
│     Audio Capture Module   │
│  (mic, noise suppression)  │
└──────────────┬─────────────┘
               │ PCM audio (16kHz mono)
┌──────────────▼─────────────┐
│   Offline STT Service      │
│  Whisper.cpp (Indic lang)  │
└──────────────┬─────────────┘
               │ transcript (mixed lang)
┌──────────────▼─────────────┐
│ Text Normalization Layer   │
│ • numbers / vitals         │
│ • drug names (India)       │
│ • durations / frequencies  │
└──────────────┬─────────────┘
               │ clean text
┌──────────────▼─────────────┐
│  Indic LLM Engine          │
│  Indic-Gemma-2B (GGUF)     │
│  (Formatting + Structuring)│
└──────────────┬─────────────┘
               │ structured doc
┌──────────────▼─────────────┐
│ Clinical Templates Engine  │
│ • Prescription             │
│ • OPD/IPD Notes            │
│ • Discharge Summary        │
└──────────────┬─────────────┘
               │
┌──────────────▼─────────────┐
│ Doctor Review & Edit UI    │
│ (mandatory human approval) │
└──────────────┬─────────────┘
               │
┌──────────────▼─────────────┐
│ Save to HIS / EMR Database │
└────────────────────────────┘
```

## Hardware Requirements (NO GPU)

| Component | Minimum         | Recommended     |
| --------- | --------------- | --------------- |
| CPU       | i5 / Ryzen 5    | i7 / Ryzen 7    |
| RAM       | 16 GB           | 32 GB           |
| Disk      | SSD             | NVMe            |
| GPU       | ❌ Not required | ❌ Not required |

## Performance Targets

| Operation         | Target Latency      |
| ----------------- | ------------------- |
| Prescription      | 1-2 seconds         |
| OPD Notes         | 2-3 seconds         |
| Discharge Summary | 3-6 seconds         |
| Doctor Editing    | < 30% of total time |

## Quick Start

```bash
# 1. Download models
./scripts/download_models.sh

# 2. Install dependencies
pip install -r requirements.txt

# 3. Start service
python main.py

# Service runs on http://localhost:8006
```

## API Endpoints

```
POST /api/scribe/transcribe     - Audio to text (Whisper)
POST /api/scribe/normalize      - Normalize medical text
POST /api/scribe/generate       - Generate clinical document
POST /api/scribe/prescription   - Generate OPD prescription
POST /api/scribe/opd-notes      - Generate OPD notes
POST /api/scribe/discharge      - Generate discharge summary
GET  /api/scribe/health         - Health check
```

## Security & Compliance

- ✅ Fully offline - no internet calls, for this service's own endpoints (file-upload
  transcription via whisper.cpp + the local Indic-Gemma LLM)
- ✅ No patient data leaves device, for that same file-upload path
- ✅ Encrypted audio + text at rest
- ✅ Audit logging (local)
- ✅ Doctor review mandatory
- ✅ "AI-assisted" badge on all outputs

⚠️ **This offline guarantee does NOT extend to the live "ambient scribe" dictation UI**
(`client/src/hooks/useAmbientScribe.ts`, served by `server/services/scribe-stream.service.js`).
That flow transcribes speech client-side via the browser's own `SpeechRecognition` API before
ever reaching this service — and that API is frequently cloud-backed (e.g. Chrome's
implementation calls Google's servers), independent of whatever this service does locally.
Treat "fully offline" as true for recorded/uploaded audio processed through this service, and
not yet true for live ambient dictation — closing that gap means either streaming audio to
whisper.cpp here instead, or not describing that specific UI flow as offline.

## Disclaimer

> "AI assists documentation. Final responsibility lies with the clinician."
