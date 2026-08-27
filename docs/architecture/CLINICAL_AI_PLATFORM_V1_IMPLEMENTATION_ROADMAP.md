# Clinical AI Platform V1 — Implementation Roadmap (Evidence + Knowledge Fabric)

> **Document Type:** Implementation Roadmap & Engineering Build Order
> **Status:** Approved (Three-Person Board)
> **Scope:** Evolving the Phase-0/Phase-1 foundation into a durable Evidence + Knowledge Fabric
> **Reference Implementation:** MRI Brain (UNEST volumetric segmentation)
> **Related Documents:**
> - [RADIOLOGY_SONOLOGY_AI_PLATFORM_MASTER_ARCHITECTURE.md](./RADIOLOGY_SONOLOGY_AI_PLATFORM_MASTER_ARCHITECTURE.md)
> - [CLINICAL_KNOWLEDGE_FABRIC_SPECIFICATION.md](./CLINICAL_KNOWLEDGE_FABRIC_SPECIFICATION.md)

---

## Table of Contents

- [Clinical AI Platform V1 — Implementation Roadmap (Evidence + Knowledge Fabric)](#clinical-ai-platform-v1--implementation-roadmap-evidence--knowledge-fabric)
  - [Table of Contents](#table-of-contents)
  - [1. Executive Decision](#1-executive-decision)
  - [2. Current State vs V1 Target](#2-current-state-vs-v1-target)
  - [3. The Architectural Seam to Preserve](#3-the-architectural-seam-to-preserve)
  - [4. Layer 1 — Mandatory Provenance](#4-layer-1--mandatory-provenance)
  - [5. Layer 2 — Evidence Bundle](#5-layer-2--evidence-bundle)
  - [6. Layer 3 — Clinical Claim System](#6-layer-3--clinical-claim-system)
  - [7. Layer 4 — Knowledge Router](#7-layer-4--knowledge-router)
  - [8. Layer 5 — Hybrid RAG](#8-layer-5--hybrid-rag)
  - [9. Layer 6 — Evidence Pack as the Contract](#9-layer-6--evidence-pack-as-the-contract)
  - [10. The Reference Case: Ventricular Asymmetry](#10-the-reference-case-ventricular-asymmetry)
  - [11. Hard Rule: RAG Must Not Determine Patient-Specific Normality](#11-hard-rule-rag-must-not-determine-patient-specific-normality)
  - [12. Terminology Layer — Without Letting Terminology Drive Diagnosis](#12-terminology-layer--without-letting-terminology-drive-diagnosis)
  - [13. Anatomy KB — MRI Brain First](#13-anatomy-kb--mri-brain-first)
  - [14. Pathology KB — MRI Brain First](#14-pathology-kb--mri-brain-first)
  - [15. Modality-Independent Knowledge Fabric](#15-modality-independent-knowledge-fabric)
  - [16. Claim Fact Checker](#16-claim-fact-checker)
  - [17. Radiologist Workstation](#17-radiologist-workstation)
  - [18. Database Schema — V1 Objects](#18-database-schema--v1-objects)
  - [19. Versioning & Provenance Persistence](#19-versioning--provenance-persistence)
  - [20. Validation Program](#20-validation-program)
  - [21. Validation Matrix](#21-validation-matrix)
  - [22. The Killer Metric](#22-the-killer-metric)
  - [23. Silent Clinical Deployment](#23-silent-clinical-deployment)
  - [24. Model Governance](#24-model-governance)
  - [25. Regulatory & Interoperability](#25-regulatory--interoperability)
  - [26. The Production Architecture for V1](#26-the-production-architecture-for-v1)
  - [27. 90-Day Build Order (P0–P10)](#27-90-day-build-order-p0p10)
  - [28. Immediate Monday-Morning Tasks](#28-immediate-monday-morning-tasks)
  - [29. The Bigger Strategic Move](#29-the-bigger-strategic-move)
  - [30. The Guiding Distinction](#30-the-guiding-distinction)

---

## 1. Executive Decision

The three-person board confirms: **do not jump straight into a giant ontology/graph project.** The live Phase-0/Phase-1 system has already demonstrated the correct architectural seam:

```
validated imaging evidence
→ scoped knowledge retrieval
→ constrained report generation
→ QA gate
```

The next step is to turn that seam into a **durable Evidence + Knowledge Fabric**, built in six layers, with the current MRI/UNEST ventricle case as the reference implementation.

**Engineering target (not "100% accurate"):** measurable safety, traceability, high sensitivity/precision for defined indications, and mandatory human oversight.

**Regulatory note:** FDA's January 2026 CDS guidance explicitly distinguishes non-device CDS from software functions that remain medical devices; software intended to acquire/process/analyze medical images may be a device. Product claims and intended use must be designed alongside the architecture, not after it.

---

## 2. Current State vs V1 Target

### Current (Phase-0/Phase-1)
```
Study
  ↓
measurements
  ↓
KB retrieval (tag overlap)
  ↓
LLM
  ↓
draft
```

### V1 Target
```
Study
  ↓
Evidence Bundle
  ↓
KB retrieval
  ↓
Knowledge Evidence Bundle
  ↓
LLM
  ↓
Draft
  ↓
QA
```

---

## 3. The Architectural Seam to Preserve

Keep and formalize:
1. **Validated imaging evidence** — measurements/segmentations from specialist AI (e.g., UNEST)
2. **Scoped knowledge retrieval** — KB rows relevant to the study
3. **Constrained report generation** — LLM with evidence + knowledge, not free-form
4. **QA gate** — the fact-check / review barrier before human sign-off

Persist everything so reports are **reproducible**.

---

## 4. Layer 1 — Mandatory Provenance

Persist exactly which AI model, model version, measurements, KB rows, source versions, retrieval timestamp, prompt/template version, LLM version, and QA version produced each draft.

```json
{
  "draft_id": "...",
  "study_id": "...",

  "evidence": [
    {
      "source": "UNEST",
      "model_version": "...",
      "finding_id": "...",
      "measurement": "3977.9 mm3"
    }
  ],

  "knowledge": [
    {
      "kb_id": "...",
      "source_title": "...",
      "source_url": "...",
      "source_type": "...",
      "retrieval_timestamp": "...",
      "content_hash": "...",
      "retrieval_score": 0.91
    }
  ]
}
```

**Do this before expanding the KB** — otherwise you will eventually have reports you cannot reproduce.

---

## 5. Layer 2 — Evidence Bundle

Create the formal JSON/Pydantic schema as a first-class service between imaging AI and the reporting engine.

**API contract:**
```
POST /clinical-evidence/build
Input:
{
  "study_id": "...",
  "validated_findings": [...],
  "clinical_context": {...}
}

Output (the Evidence Pack):
{
  "study_context": {},
  "anatomy": [],
  "findings": [],
  "measurements": [],
  "comparisons": [],
  "knowledge_evidence": [],
  "guidelines": [],
  "uncertainties": [],
  "prohibited_inferences": []
}
```

Then:
```
POST /report/draft   ← receives ONLY the Evidence Pack
```

**Clean separation:**
- **Vision AI:** "What do I see?"
- **Evidence engine:** "What has actually been established?"
- **Knowledge engine:** "What does authoritative medical knowledge say about this type of finding?"
- **Reasoning engine:** "What interpretation is supported?"
- **Report engine:** "How should that be expressed?"

---

## 6. Layer 3 — Clinical Claim System

Convert every measurement/finding into an atomic claim:

```json
{
  "claim_id": "CLM-001",
  "subject": "left_lateral_ventricle",
  "predicate": "volume",
  "object": {
    "value": 641.2,
    "unit": "mm3"
  },
  "source": "UNEST",
  "confidence": 0.94,
  "status": "validated"
}
```

This becomes the foundation of the future **Fact Checker**:

```
Report sentence
      ↓
claims extracted
      ↓
match against Clinical Claims
      ↓
match against Knowledge Evidence
      ↓
QA
```

---

## 7. Layer 4 — Knowledge Router

Replace raw tag-overlap with structured routing.

**Input:**
```json
{
  "modality": "MRI",
  "body_part": "brain",
  "findings": ["ventricular_asymmetry"],
  "measurements": [
    {
      "structure": "lateral_ventricle",
      "left_mm3": 641.2,
      "right_mm3": 3977.9
    }
  ]
}
```

**Router produces:**
- ANATOMY → lateral ventricles
- FINDING → asymmetry
- MEASUREMENT → ventricular volume
- COMPARISON → contralateral
- KNOWLEDGE DOMAINS → anatomy, ventricular asymmetry, hydrocephalus, mass effect, developmental variation, reporting guidance

Then retrieve **only relevant evidence** — not the entire corpus.

---

## 8. Layer 5 — Hybrid RAG

```
                 QUERY
                   │
       ┌───────────┼───────────┐
       ▼           ▼           ▼
    Vector       BM25       Structured
    search       search      filters
       │           │           │
       └───────────┼───────────┘
                   ▼
              Merge
                   ↓
               Reranker
                   ↓
          Clinical applicability
                   ↓
              Evidence Pack
```

**Not:** LLM → search internet → write report.

---

## 9. Layer 6 — Evidence Pack as the Contract

The report generator's **only** knowledge input is the Evidence Pack:

```json
{
  "study_context": {},
  "anatomy": [],
  "findings": [],
  "measurements": [],
  "comparisons": [],
  "knowledge_evidence": [],
  "guidelines": [],
  "uncertainties": [],
  "prohibited_inferences": []
}
```

The LLM sees **5–15 highly relevant evidence objects** — not an arbitrary collection of KB paragraphs.

---

## 10. The Reference Case: Ventricular Asymmetry

The current successful case is the reference architecture:

```
641.2 mm³  /  3977.9 mm³
       ↓
bilateral comparison
       ↓
asymmetry detected
       ↓
knowledge retrieved
       ↓
knowledge says interpretation requires context
       ↓
LLM does NOT invent normal range
       ↓
LLM recommends correlation
       ↓
QA = REVIEW
```

**Target pattern:**
> NOT: "AI thinks this is abnormal."
>
> BUT: "AI measured X. AI detected Y. Knowledge says Y can have several explanations. Evidence is insufficient to distinguish them. Therefore report says Z. Radiologist must confirm."

That is much closer to a defensible clinical architecture.

---

## 11. Hard Rule: RAG Must Not Determine Patient-Specific Normality

**NEVER:**
```
RAG → "normal brain volume = X" → patient comparison
```
…unless the reference range itself is from a properly validated, applicable reference population.

**Instead:**
```
patient measurement
      ↓
validated reference model
      ↓
age/sex/scanner/protocol adjusted reference
      ↓
percentile / z-score
      ↓
interpretation
```

The current **contralateral comparison** is a useful within-patient comparison, but it is **not** a population normative model. Keep that distinction explicit.

---

## 12. Terminology Layer — Without Letting Terminology Drive Diagnosis

Canonical layer should eventually map:

```
YOUR_ID
   │
   ├── RadLex
   ├── SNOMED CT
   ├── LOINC
   └── local terminology
```

**The important distinction:**
- "ventricle" = **terminology**
- "ventricular asymmetry" = **finding**
- "ventricular asymmetry is clinically significant because of mass effect" = **clinical interpretation requiring evidence**

Keep those layers separate.

---

## 13. Anatomy KB — MRI Brain First

Don't attempt all medicine. Start with MRI Brain:

```
Brain
├── Cerebrum
├── Cerebellum
├── Brainstem
├── Ventricular system
├── Deep gray nuclei
├── White matter
├── Corpus callosum
├── Hippocampi
├── Pituitary
├── Orbits
├── Major vessels
└── Meninges
```

For each: synonyms, laterality, parent, neighbors, expected appearance, measurement methods, relevant pathologies, relevant imaging findings, reporting terminology, RadLex mapping, SNOMED mapping where applicable.

---

## 14. Pathology KB — MRI Brain First

Connect anatomy ↔ pathology:

```
ANATOMY
    ↕
PATHOLOGY
    ↕
IMAGING FEATURES
    ↕
MEASUREMENTS
    ↕
DIFFERENTIALS
```

**Example:**
```
HIPPOCAMPUS
    │
    ├── volume loss
    ├── signal abnormality
    │
    └── associated with
             ↓
      MESIAL TEMPORAL SCLEROSIS
```

Pathology categories to start: STROKE (infarction/hemorrhage/edema/mass effect), TUMOR (glioma/metastasis/meningioma/lymphoma), DEMYELINATION (MS/ADEM), INFECTION (abscess/encephalitis/meningitis), DEGENERATIVE (Alzheimer pattern, vascular cognitive impairment).

---

## 15. Modality-Independent Knowledge Fabric

```
                 CLINICAL KNOWLEDGE FABRIC
                           │
      ┌────────────┬───────┼────────┬──────────┐
      ▼            ▼       ▼        ▼          ▼
     MRI           CT      XR       US        Echo
      │            │       │        │          │
      └────────────┴───────┼────────┴──────────┘
                           ▼
                    COMMON EVIDENCE MODEL
```

That becomes the foundation for the entire Mediczy imaging platform (MRI, CT, X-ray, US, Echo, Cathlab, C-arm).

---

## 16. Claim Fact Checker

An independent service:

```
GENERATED REPORT
       ↓
extract claims
       ↓
compare with Evidence Bundle
       ↓
compare measurements
       ↓
check laterality
       ↓
check anatomy
       ↓
check negation
       ↓
check unsupported pathology
       ↓
check guideline consistency
       ↓
PASS / REVISE / BLOCK
```

**Example:** Evidence says `left hippocampus volume ↓`; LLM writes "right hippocampal atrophy" → ❌ LATERALITY CONFLICT → **BLOCK**.

---

## 17. Radiologist Workstation

Not a chatbot response — a clinical UI:

```
┌──────────────────────────────────────────────┐
│                  OHIF / Viewer               │
│             DICOM IMAGE                      │
│       segmentation overlays                 │
│       measurements                           │
│       detected findings                      │
└──────────────────────┬───────────────────────┘
                       │
┌──────────────────────┴───────────────────────┐
│ AI FINDINGS                                  │
│ ✓ Right lateral ventricle: 3977.9 mm³       │
│ ✓ Left lateral ventricle: 641.2 mm³         │
│ ⚠ Significant asymmetry                     │
│ [View Evidence] [View Comparison]            │
└──────────────────────────────────────────────┘
┌──────────────────────────────────────────────┐
│ REPORT DRAFT                                 │
│ Findings: ...  Impression: ...              │
│ [Accept] [Edit] [Reject] [Regenerate]        │
└──────────────────────────────────────────────┘
```

Radiologist clicks a finding → **Why?** → segmentation, measurement, image coordinates, model, knowledge source, guideline, reasoning. That transparency is a major differentiator.

---

## 18. Database Schema — V1 Objects

```
clinical_studies
ai_models
ai_model_versions
ai_observations
ai_measurements
ai_segmentations
clinical_claims
knowledge_sources
knowledge_documents
knowledge_chunks
knowledge_versions
evidence_bundles
evidence_items
report_drafts
report_claims
qa_results
```

---

## 19. Versioning & Provenance Persistence

Evolve the existing `imaging_knowledge_base` table — don't discard it:

```
imaging_knowledge_base
        │
        ├── source / source_version / source_type / authority
        ├── publication_date / retrieval_date / jurisdiction
        ├── modality / anatomy / pathology / finding / guideline
        ├── evidence_level / text / embedding / metadata
```

Then add:

```
imaging_knowledge_sources
imaging_knowledge_versions
imaging_knowledge_relationships
imaging_knowledge_embeddings
```

This gives versioning **without breaking the existing deployment**. The current three-row KB is a useful starting point — promote it into the first governed version of the Knowledge Fabric.

---

## 20. Validation Program

Dataset: **500–1,000 MRI brain studies**, stratified by:
- normal / abnormal
- tumor / stroke / hemorrhage / hydrocephalus / atrophy
- infection / demyelination / postoperative / artifact / rare cases
- **different scanners, vendors, field strengths, protocols, hospitals**

---

## 21. Validation Matrix

| Dimension | Metrics |
|---|---|
| **Perception** | Lesion sensitivity, lesion specificity, segmentation Dice, volume error, measurement error |
| **Clinical reasoning** | Finding accuracy, differential accuracy, unsupported inference rate, false-positive interpretation, false-negative interpretation |
| **Report** | Laterality accuracy, measurement accuracy, negation accuracy, omission rate, hallucination rate, clinically significant error rate |
| **Human factors** | Radiologist acceptance, editing time, time saved, override rate, automation bias |

---

## 22. The Killer Metric

**Board-level KPI:**
```
Clinically Significant Unsupported Claim Rate =
  clinically significant unsupported claims / total reports
```

**And:**
```
Evidence Traceability =
  report claims with identifiable evidence / total report claims
```

Goal: **Every clinically meaningful statement is supported by validated evidence or explicitly marked as uncertain.**

---

## 23. Silent Clinical Deployment

```
REAL STUDY → AI → AI REPORT → RADIOLOGIST REPORT
```
Do **not** expose AI's answer to the clinician initially. Compare them.

Then:
```
AI → Radiologist sees draft → Radiologist edits → final report
```
Measure how much AI actually helps.

---

## 24. Model Governance

Every model follows: MODEL → Validation → Approval → Deployment → Monitoring → Retirement.

**Never:** download model → put weights in /models → enable environment variable → clinical use.

Every model needs an intended-use declaration:

```
UNEST
Allowed:    research volumetric segmentation
Not allowed: diagnosis / clinical reporting / treatment recommendation
Until clinically validated and appropriately cleared/authorized where required.
```

---

## 25. Regulatory & Interoperability

**Regulatory:** INTENDED USE → CLINICAL CLAIM → RISK CLASS → MODEL → VALIDATION → RELEASE. Get a classification strategy from qualified medical-device counsel/regulatory professionals before marketing as a diagnostic/reporting system. FDA's January 2026 CDS guidance says the device/non-device determination depends on the function and applicable policies — not the CDS guidance alone.

**Interoperability:**
```
DICOM / DICOMweb
        ↓
internal Evidence Model
        ↓
FHIR DiagnosticReport
        ↓
Observation
        ↓
ImagingStudy
```

FHIR's DiagnosticReport is explicitly designed to represent imaging reports and can link the report to observations and the associated ImagingStudy.

---

## 26. The Production Architecture for V1

```
                         ┌───────────────────┐
                         │ DICOM / PACS / RIS│
                         └─────────┬─────────┘
                                   │
                                   ▼
                         ┌───────────────────┐
                         │ Study Orchestrator│
                         └─────────┬─────────┘
                                   │
                ┌──────────────────┼──────────────────┐
                ▼                  ▼                  ▼
          Vision Models       Segmentation       Measurements
                │                  │                  │
                └──────────────────┼──────────────────┘
                                   ▼
                         ┌───────────────────┐
                         │ Clinical Evidence │
                         │      Store        │
                         └─────────┬─────────┘
                                   │
                                   ▼
                         ┌───────────────────┐
                         │ Knowledge Router  │
                         └─────────┬─────────┘
                                   │
             ┌─────────────────────┼─────────────────────┐
             ▼                     ▼                     ▼
        Anatomy KB            Pathology KB          Guidelines
             │                     │                     │
             └─────────────────────┼─────────────────────┘
                                   ▼
                         ┌───────────────────┐
                         │ Hybrid RAG        │
                         │ semantic+lexical  │
                         │+structured+graph  │
                         └─────────┬─────────┘
                                   ▼
                         ┌───────────────────┐
                         │ Evidence Pack     │
                         └─────────┬─────────┘
                                   ▼
                         ┌───────────────────┐
                         │ Clinical Reasoner │
                         └─────────┬─────────┘
                                   ▼
                         ┌───────────────────┐
                         │ Report Generator  │
                         └─────────┬─────────┘
                                   ▼
                         ┌───────────────────┐
                         │ Claim Fact Checker│
                         └─────────┬─────────┘
                                   │
                           ┌───────┴───────┐
                           ▼               ▼
                         BLOCK           PASS
                                           │
                                           ▼
                                      Radiologist
                                           │
                                           ▼
                                     Signed Report
```

---

## 27. 90-Day Build Order (P0–P10)

| Priority | Item | Window |
|---|---|---|
| **P0 — Security** | Rotate the exposed `ORTHANC_PASSWORD` immediately; audit shell history, logs, environment captures, deployment artifacts | Day 1 |
| **P1 — Provenance** | Persist exactly which AI model, model version, measurements, KB rows, source versions, retrieval timestamp, prompt/template version, LLM version, QA version produced each draft | Days 7–21 |
| **P2 — Evidence Bundle** | Formal JSON/Pydantic schema as a first-class service | Days 7–21 |
| **P3 — Clinical Claims** | Convert measurements/findings into atomic claims | Days 14–25 |
| **P4 — Knowledge Router** | Replace raw tag overlap with anatomy + finding + modality + measurement + clinical context | Days 21–35 |
| **P5 — Hybrid RAG** | Semantic + keyword + metadata filtering + reranking | Days 45–60 |
| **P6 — Anatomy ontology** | MRI Brain first | Days 30–45 |
| **P7 — Pathology ontology** | MRI Brain first | Days 40–60 |
| **P8 — Guidelines** | Versioned guideline objects | Ongoing |
| **P9 — Fact Checker** | Every generated claim traceable to evidence | Days 65–75 |
| **P10 — Clinical validation** | Retrospective multi-reader → silent deployment → prospective → controlled clinical | Days 75–90+ |

**Phase breakdown:**
- **Phase 1 (Days 1–7):** Lock down — rotate Orthanc credential, freeze version `MEDICZY-IMAGING-AI v0.1.0` (git commit, Docker image, deps, model versions, DB migration, KB contents, prompt/LLM/QA versions, config)
- **Phase 2 (Days 7–21):** Build the Evidence Layer (create the database objects above)
- **Phase 3 (Days 14–25):** Make every report auditable (report claim traceability)
- **Phase 4 (Days 21–35):** Knowledge Router
- **Phase 5 (Days 30–45):** MRI Brain Anatomy KB
- **Phase 6 (Days 40–60):** MRI Brain Pathology KB
- **Phase 7 (Days 45–60):** Hybrid RAG
- **Phase 8 (Days 55–70):** Clinical Reasoning Engine (rules + evidence before LLM)
- **Phase 9 (Days 65–75):** Fact Checker
- **Phase 10 (Days 70–85):** Radiologist Workstation
- **Phase 11 (Days 75–90):** Validation program (500–1,000 MRI brain studies)
- **Phase 12+:** Silent clinical deployment
- **Phase 13+:** Model governance
- **Phase 14+:** Expand modalities (CT Brain → Chest X-ray → CT Chest → US → Echo → Cathlab/C-arm)

---

## 28. Immediate Monday-Morning Tasks

Build **six things** — not another model:
1. **Evidence Bundle** — the formal schema
2. **Clinical Claim system** — atomic claims
3. **Knowledge Router** — structured routing
4. **Provenance store** — versioned persistence
5. **Fact Checker** — claim-vs-evidence verification
6. **Evaluation harness** — the validation benchmark

Then make the current MRI/UNEST system run through all six. Once that works, the platform becomes extensible.

---

## 29. The Bigger Strategic Move

**Don't build six products.** Build:

```
                  CLINICAL AI PLATFORM
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
    Perception         Knowledge        Reasoning
        │                 │                 │
        └─────────────────┼─────────────────┘
                          │
                    Evidence Graph
                          │
                    Report Engine
                          │
                    Safety Engine
                          │
                    Human Review
```

Then:

```
MRI ─────────┐
CT ──────────┤
X-ray ───────┤
Ultrasound ──┤──→ SAME CLINICAL AI CORE
Echo ────────┤
Cathlab ─────┤
C-arm ───────┘
```

**The single most important architectural decision:** Do not let the LLM become the center of the system. Make the **Clinical Evidence Graph + Knowledge Fabric** the center. The LLM is then merely one reasoning/reporting component — replaceable (LLM-A → LLM-B → LLM-C) without rebuilding the medical system.

---

## 30. The Guiding Distinction

> **Terminology ≠ clinical truth.**
>
> **Finding ≠ diagnosis.**
>
> **RAG ≠ patient-specific normality.**
>
> **The LLM ≠ the medical system.**

*End of Clinical AI Platform V1 Implementation Roadmap*