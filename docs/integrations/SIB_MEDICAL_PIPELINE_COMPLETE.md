# SIB Medical AI Pipeline - Complete Implementation

## Overview

The Synthetic Intelligence Brain (SIB) now implements a full medical NLP + RAG + LLM pipeline with the following components:

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Dr. iSHA Medical Pipeline                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   User Query                                                         │
│       │                                                              │
│       ▼                                                              │
│   ┌─────────────────┐                                                │
│   │   MedSpaCy      │  ← NER, negation detection, section parsing   │
│   │   (en_core_sci) │                                                │
│   └────────┬────────┘                                                │
│            │                                                         │
│            ▼                                                         │
│   ┌─────────────────┐                                                │
│   │  ClinicalBERT   │  ← Bio_ClinicalBERT embeddings (768-dim)      │
│   │  (emilyalsentzer│                                                │
│   │  /Bio_ClinicalBERT)                                              │
│   └────────┬────────┘                                                │
│            │                                                         │
│            ▼                                                         │
│   ┌─────────────────┐                                                │
│   │  FAISS Index    │  ← 212 EHR chunks indexed                     │
│   │  (IndexFlatL2)  │    Retrieves top-5 relevant context           │
│   └────────┬────────┘                                                │
│            │                                                         │
│            ▼                                                         │
│   ┌─────────────────┐                                                │
│   │ Bayesian Network│  ← pgmpy DiscreteBayesianNetwork              │
│   │ (Cardiovascular │    Age, Cholesterol, BP, Diabetes → Risk      │
│   │  Risk Assessment)│                                              │
│   └────────┬────────┘                                                │
│            │                                                         │
│            ▼                                                         │
│   ┌─────────────────┐                                                │
│   │  LLM (Groq)     │  ← llama-3.3-70b-versatile                    │
│   │                 │    RAG context + system prompt                 │
│   └────────┬────────┘                                                │
│            │                                                         │
│            ▼                                                         │
│   ┌─────────────────┐                                                │
│   │  Safety Filter  │  ← Drug interactions, dosage validation       │
│   │                 │    Emergency detection, severity scoring       │
│   └────────┬────────┘                                                │
│            │                                                         │
│            ▼                                                         │
│   Response (with risk assessment, entities, safety alerts)           │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Architecture Details

### 1. MedSpaCy NER (Natural Entity Recognition)
- **Library**: `medspacy` with `en_core_sci_sm`
- **Features**:
  - Medical entity extraction (conditions, medications, symptoms)
  - Negation detection (e.g., "no chest pain" → negated)
  - Section parsing (history, medications, labs, assessment)
  - Fallback to SpaCy `en_core_web_sm` if MedSpaCy unavailable

### 2. ClinicalBERT Embeddings
- **Model**: `emilyalsentzer/Bio_ClinicalBERT`
- **Dimension**: 768-dimensional vectors
- **Purpose**: Generate medical-domain-specific embeddings
- **Fallback**: `all-MiniLM-L6-v2` for general embeddings

### 3. FAISS Vector Store
- **Index Type**: `IndexFlatL2` (L2 distance)
- **Stored Chunks**: 212 EHR chunks from 10 sample patients
- **Retrieval**: Top-5 most similar chunks per query
- **Files**:
  - `embeddings/faiss_index.bin` - FAISS binary index
  - `embeddings/chunk_metadata.pkl` - Chunk text + patient/section metadata

### 4. Bayesian Network (Risk Assessment)
- **Library**: `pgmpy` with `DiscreteBayesianNetwork`
- **Structure**:
  ```
  Age ──────────────┐
  Cholesterol ──────┼──▶ CardioRisk ──▶ TreatmentPriority
  SystolicBP ───────┤
  Diabetes ─────────┘
  ```
- **Output**: Risk probability + treatment priority + recommendations

### 5. LLM (Language Model)
- **Primary**: Groq API with `llama-3.3-70b-versatile`
- **Fallback**: Google Gemini `gemini-2.0-flash-exp`
- **Features**:
  - RAG context injection from FAISS
  - Bayesian risk context
  - Medical system prompt
  - Structured response format

### 6. Safety Filter
- **Checks**:
  - Drug interaction detection (15+ common interactions)
  - Dosage validation
  - Emergency keyword detection
  - Severity scoring
- **Alerts**: Returns warnings for dangerous combinations

## Files

### Core Pipeline
- `/ai-engine/doctor_bot/sib/medical_pipeline.py` - Main pipeline orchestrator
- `/ai-engine/doctor_bot/sib/botlets/chat_botlet.py` - Chat handler with pipeline integration
- `/ai-engine/doctor_bot/sib/brain.py` - SIB brain coordinator

### Utilities
- `/ai-engine/doctor_bot/utils/preprocess.py` - MedSpaCy NER
- `/ai-engine/doctor_bot/utils/embed_store.py` - ClinicalBERT + FAISS
- `/ai-engine/doctor_bot/utils/bayesian_network.py` - pgmpy risk model
- `/ai-engine/doctor_bot/utils/retrieval_llm.py` - RAG + LLM
- `/ai-engine/doctor_bot/utils/safety_filter.py` - Safety validation

### Data
- `/ai-engine/doctor_bot/data/processed_ehr.json` - Sample EHR data (10 patients)
- `/ai-engine/doctor_bot/embeddings/faiss_index.bin` - FAISS index
- `/ai-engine/doctor_bot/embeddings/chunk_metadata.pkl` - Chunk metadata

## API Endpoints

### SIB Direct (Port 8001)
```bash
curl -X POST http://localhost:8001/chat \
  -H "Content-Type: application/json" \
  -d '{"patient_id": "PT001", "message": "I have chest pain", "include_risk": true}'
```

### Express Gateway (Port 8000)
```bash
curl -X POST http://localhost:8000/api/medical-ai/test \
  -H "Content-Type: application/json" \
  -d '{"query": "I have diabetes and high blood pressure"}'
```

## Performance

- **MedSpaCy NER**: ~10ms
- **ClinicalBERT Embedding**: ~100ms
- **FAISS Retrieval**: ~5ms
- **Bayesian Inference**: ~5ms
- **Groq LLM**: ~1000-2000ms
- **Safety Filter**: ~5ms
- **Total Pipeline**: ~1.5-2.5 seconds

## Services

| Service | Port | PM2 Name |
|---------|------|----------|
| SIB Brain | 8001 | sib-brain |
| SIB Scheduler | 8002 | sib-scheduler |
| Express Server | 8000 | mediczy-server |

## Environment Variables

```bash
GROQ_API_KEY=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
GEMINI_API_KEY=AIzaSyCVa8eKHpCzWvyFrd4jKKxkomxHI8iAp48
```

## Future Improvements

1. **Local Llama**: Enable when GPU available (Llama-3.1-8B-Instruct-Q4_K_M.gguf)
2. **BiMediX2**: Add specialized medical LLM for grounding
3. **More EHR Data**: Expand FAISS index with real anonymized data
4. **Streaming**: Add streaming responses for better UX
5. **Multi-language**: Extend NER and LLM for multiple languages

---

*Last Updated: 2025-11-30*
*Status: ✅ COMPLETE*
