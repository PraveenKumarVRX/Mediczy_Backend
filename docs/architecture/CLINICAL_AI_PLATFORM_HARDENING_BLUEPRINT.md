# Clinical AI Platform — Stage 2 Hardening Blueprint (Freeze & Harden)

> **Document Type:** Engineering Blueprint & Review Verdict
> **Status:** Approved (CTO / AI-Lead / Clinical-Safety Review)
> **Stage Classification:** Stage 2 — Integrated Clinical AI Research Platform
> **Scope:** Harden the existing pipeline, close architectural gaps in deliberate order. Do NOT rebuild.
> **Reference Vertical Slice:** MRI Brain (UNEST volumetric segmentation)
> **Related Documents:**
> - [RADIOLOGY_SONOLOGY_AI_PLATFORM_MASTER_ARCHITECTURE.md](./RADIOLOGY_SONOLOGY_AI_PLATFORM_MASTER_ARCHITECTURE.md)
> - [CLINICAL_KNOWLEDGE_FABRIC_SPECIFICATION.md](./CLINICAL_KNOWLEDGE_FABRIC_SPECIFICATION.md)
> - [CLINICAL_AI_PLATFORM_V1_IMPLEMENTATION_ROADMAP.md](./CLINICAL_AI_PLATFORM_V1_IMPLEMENTATION_ROADMAP.md)

---

## Table of Contents

- [Clinical AI Platform — Stage 2 Hardening Blueprint (Freeze \& Harden)](#clinical-ai-platform--stage-2-hardening-blueprint-freeze--harden)
  - [Table of Contents](#table-of-contents)
  - [1. Executive Verdict](#1-executive-verdict)
  - [2. Stage Classification](#2-stage-classification)
  - [3. Architecture Evolution: From → To](#3-architecture-evolution-from--to)
    - [From (current)](#from-current)
    - [To (target)](#to-target)
  - [4. The Next 10 Things — In Exact Order](#4-the-next-10-things--in-exact-order)
    - [1. Fix Cybersecurity First](#1-fix-cybersecurity-first)
    - [2. Build OOD + Applicability Gate](#2-build-ood--applicability-gate)
    - [3. Build the Abstention Engine](#3-build-the-abstention-engine)
    - [4. Stop Free-Form LLM Reporting](#4-stop-free-form-llm-reporting)
    - [5. Build the Clinical Reasoning Engine](#5-build-the-clinical-reasoning-engine)
    - [6. Build the Evidence Graph](#6-build-the-evidence-graph)
    - [7. Upgrade Your RAG](#7-upgrade-your-rag)
    - [8. Create the Clinical Knowledge Fabric Properly](#8-create-the-clinical-knowledge-fabric-properly)
    - [9. Build QA-2 and QA-3](#9-build-qa-2-and-qa-3)
    - [10. Build the Validation Factory](#10-build-the-validation-factory)
  - [5. The Five Planes](#5-the-five-planes)
  - [6. The Critical Architectural Rule](#6-the-critical-architectural-rule)
  - [7. Current System → Target Mapping](#7-current-system--target-mapping)
  - [8. What NOT to Do](#8-what-not-to-do)
  - [9. The MRI Brain Vertical Slice](#9-the-mri-brain-vertical-slice)
  - [10. New Definition of Done](#10-new-definition-of-done)
    - [Safety](#safety)
    - [Evidence](#evidence)
    - [Validation](#validation)
    - [Operations](#operations)
    - [Reporting](#reporting)
  - [11. The Clinical Case Object](#11-the-clinical-case-object)
  - [12. Bottom Line](#12-bottom-line)

---

## 1. Executive Verdict

> **You already have the perception → evidence → knowledge → generation → QA → human sign-off skeleton. What is missing is the clinical safety/control layer between evidence and generation, plus the validation machinery around it.**

This is a much better starting point than assumed from the earlier architecture. **Do not rebuild the system. Harden the existing pipeline and close the architectural gaps in a very deliberate order.**

The board decision: **Freeze the current MRI/CXR/CT models. Do not expand modalities.** Spend the next engineering cycle building:
- OOD Gate
- Abstention Engine
- Evidence Graph
- Clinical Rules
- Structured Report Compiler
- Fact Checker
- Validation Factory

Once those work, the existing models become interchangeable perception components inside a much more defensible Clinical AI Reporting Platform — rather than the platform itself.

---

## 2. Stage Classification

The current system is:

> **Stage 2 — Integrated Clinical AI Research Platform**
>
> Not merely a prototype, but not clinically validated/approved software.

---

## 3. Architecture Evolution: From → To

### From (current)
```
DICOM → AI models → measurements/findings → RAG → LLM → QA → Radiologist
```

### To (target)
```
                         ┌──────────────────────┐
                         │     DICOM / PACS     │
                         └──────────┬───────────┘
                                    ↓
                         ┌──────────────────────┐
                         │ Study / Protocol     │
                         │ Identification       │
                         └──────────┬───────────┘
                                    ↓
                         ┌──────────────────────┐
                         │ OOD / Applicability  │
                         │ + Quality Gate       │
                         └──────────┬───────────┘
                                    ↓
                         ┌──────────────────────┐
                         │ Perception Models    │
                         │ MRI / CT / CXR       │
                         └──────────┬───────────┘
                                    ↓
                         ┌──────────────────────┐
                         │ Clinical Evidence   │
                         │ + Measurements      │
                         └──────────┬───────────┘
                                    ↓
                    ┌───────────────┴────────────────┐
                    ↓                                ↓
             Anatomy Knowledge                Pathology Knowledge
                    │                                │
                    └───────────────┬────────────────┘
                                    ↓
                         ┌──────────────────────┐
                         │ Clinical Reasoning   │
                         │ / Rules / Guidelines │
                         └──────────┬───────────┘
                                    ↓
                         ┌──────────────────────┐
                         │ Evidence Bundle      │
                         │ + Claims             │
                         └──────────┬───────────┘
                                    ↓
                         ┌──────────────────────┐
                         │ Structured Report    │
                         │ JSON Compiler        │
                         └──────────┬───────────┘
                                    ↓
                         ┌──────────────────────┐
                         │ LLM wording layer    │
                         └──────────┬───────────┘
                                    ↓
                    ┌───────────────┴────────────────┐
                    ↓                                ↓
             Fact/Invariant QA                 Image QA
                    │                                │
                    └───────────────┬────────────────┘
                                    ↓
                         ┌──────────────────────┐
                         │ ABSTENTION / SAFETY  │
                         │ DECISION             │
                         └──────────┬───────────┘
                                    ↓
                         ┌──────────────────────┐
                         │ Radiologist          │
                         │ Review/Edit/Sign     │
                         └──────────────────────┘
```

---

## 4. The Next 10 Things — In Exact Order

### 1. Fix Cybersecurity First
Before another clinical feature:
- Rotate the Orthanc credential (top priority — it appeared in a development transcript → treat as compromised)
- Move secrets into proper secret management
- Eliminate credentials from shell history/logs
- Audit environment dumps
- Audit Git/repositories
- Rotate any credential that may have been exposed
- Enforce TLS where applicable
- Service-to-service authentication
- Least-privilege database/PACS accounts
- Tenant isolation tests

**This is currently your most obvious operational red flag.**

### 2. Build OOD + Applicability Gate
The next AI service. Before MRI inference:

```
Study
 ↓
Is modality correct?
 ↓
Is body region correct?
 ↓
Is protocol supported?
 ↓
Is slice thickness acceptable?
 ↓
Is image quality adequate?
 ↓
Is scanner/sequence within validated domain?
 ↓
Is patient population supported?
 ↓
Is contrast status supported?
 ↓
OOD score
```

**Output:**
```json
{
  "status": "SUPPORTED",
  "confidence": 0.96,
  "reasons": []
}
```
or:
```json
{
  "status": "ABSTAIN",
  "reasons": [
    "Unsupported sequence",
    "Insufficient image quality"
  ]
}
```

This prevents the classic disaster: *a model produces a confident-looking answer for an input it was never validated on.*

### 3. Build the Abstention Engine
Surprisingly high-value and relatively straightforward. Universal state machine:

```
POSITIVE
NEGATIVE
UNCERTAIN
ABSTAIN
NOT_ASSESSED
```

Every AI observation must have one.

```json
{
  "finding": "intracranial_hemorrhage",
  "state": "UNCERTAIN",
  "confidence": 0.61,
  "reason": "motion artifact"
}
```

**Enforcement:** `ABSTAIN` → cannot generate definitive claim. This is substantially safer than letting the LLM turn uncertainty into prose.

### 4. Stop Free-Form LLM Reporting
The most important software architecture upgrade.

**Current:** evidence → LLM → prose

**Replace with:** evidence → structured clinical report object → validation → LLM wording → prose

```json
{
  "study": {
    "modality": "MRI",
    "body_region": "brain"
  },

  "findings": [
    {
      "anatomy": "lateral_ventricle",
      "laterality": "right",
      "observation": "enlarged",
      "measurement": {
        "value": 3977.9,
        "unit": "mm3"
      },
      "certainty": "supported",
      "evidence_ids": ["EV-123"]
    }
  ],

  "comparisons": [
    {
      "type": "contralateral",
      "left": "641.2",
      "right": "3977.9",
      "evidence_id": "EV-124"
    }
  ],

  "impression": [
    {
      "statement_type": "observation",
      "certainty": "uncertain"
    }
  ]
}
```

**The LLM should render this, not invent it.**

### 5. Build the Clinical Reasoning Engine
The biggest missing architectural component. Start with **deterministic rules**, not an enormous AI reasoning engine.

```
RULE MRI-BRAIN-VENT-001

IF
  anatomy = lateral_ventricle
AND
  bilateral_measurement_available = true
AND
  segmentation_quality = acceptable
AND
  asymmetry_ratio > threshold
THEN
  finding = ventricular_asymmetry
  certainty = supported
  pathway = ventricular_asymmetry
```

Then:

```
PATHWAY: ventricular_asymmetry

Retrieve:
    anatomy
    differential considerations
    relevant clinical context
    guidelines
```

**Do NOT conclude** `hydrocephalus`, `mass effect`, `obstruction` — unless corresponding evidence exists. This gives you **controlled reasoning**.

### 6. Build the Evidence Graph
Postgres can get you surprisingly far — no Neo4j needed yet. Define:

```
Study
 ↓
Observation
 ↓
Measurement
 ↓
Anatomy
 ↓
Finding
 ↓
Reasoning Path
 ↓
Knowledge Evidence
 ↓
Clinical Claim
 ↓
Report Sentence
```

**Example:**
```
STUDY-123
   │
   ├── OBS-77
   │      │
   │      └── right lateral ventricle
   │             │
   │             └── volume = 3977.9 mm³
   │
   ├── OBS-78
   │      │
   │      └── left lateral ventricle
   │             │
   │             └── volume = 641.2 mm³
   │
   └── CLAIM-21
          │
          └── ventricular asymmetry
                 │
                 ├── KB-17
                 ├── KB-23
                 └── guideline-04
```

Provenance becomes: *"This exact report claim came from these exact observations and this exact knowledge."* That's much more powerful.

### 7. Upgrade Your RAG
The current tag matching was the correct MVP. Now graduate it:

```
                    QUERY
                      │
         ┌────────────┼────────────┐
         ↓            ↓            ↓
      BM25          Vector      Metadata
      search        search       filter
         │            │            │
         └────────────┼────────────┘
                      ↓
                    Merge
                      ↓
                   Rerank
                      ↓
              Evidence filtering
                      ↓
               Clinical Evidence
```

**But don't let RAG determine truth.** RAG supplies medical knowledge. The patient's actual facts come from: DICOM + validated AI + measurements + clinical data.

### 8. Create the Clinical Knowledge Fabric Properly
Structure it:

```
                 CLINICAL KNOWLEDGE FABRIC

                         ANATOMY
                            │
             ┌──────────────┼──────────────┐
             ↓              ↓              ↓
          location       laterality      relationships
             │
             ↓
          FINDINGS
             │
       ┌─────┼─────┐
       ↓     ↓     ↓
    signal  size  shape
       │
       ↓
   PATHOLOGY
       │
       ↓
 DIFFERENTIALS
       │
       ↓
 GUIDELINES
       │
       ↓
 REPORTING
```

Use controlled terminology and mappings rather than free-text concepts wherever possible. **RadLex** is specifically intended to provide a common radiology vocabulary; **SNOMED CT** provides broader clinical terminology.

### 9. Build QA-2 and QA-3
Current QA-1 is good. Now add:

**QA-2 — Semantic QA:**
- Does the report contradict itself?
- Does impression contradict findings?
- Does "no hemorrhage" coexist with "hemorrhage"?
- Does laterality remain consistent?
- Does severity remain consistent?
- Does the conclusion logically follow?

**QA-3 — Image-grounded QA** (harder):
- "Is there actual image evidence for this claim?" — not merely "Does the claim match the measurement JSON?"
- Eventually connects claims back to: segmentation masks, bounding boxes, image coordinates, slices, image-derived features, model attention/heatmaps where validated

**Caveat:** Don't treat SHAP/LIME as proof of anatomical localization. An attribution score is not equivalent to a clinically validated image-grounding explanation.

### 10. Build the Validation Factory
This is where the project changes character. From `2 patients, manual review` to:

```
Dataset Factory
      ↓
case registry
      ↓
de-identification
      ↓
patient-level splitting
      ↓
annotation
      ↓
multi-reader review
      ↓
adjudication
      ↓
gold standard
      ↓
benchmark
      ↓
model evaluation
```

Automated regression:

```
Every model change
        ↓
500+ locked cases
        ↓
performance comparison
        ↓
safety regression
        ↓
approve / reject
```

---

## 5. The Five Planes

Organize the entire codebase into five planes:

| Plane | Contents | LLM? |
|---|---|---|
| **Plane 1 — Perception** | MRI, CT, CXR, US, Echo, Cathlab, C-arm. Models live here. | No |
| **Plane 2 — Evidence** | DICOM, measurements, segmentations, observations, priors, clinical context. | **No LLM** |
| **Plane 3 — Knowledge** | Anatomy, Pathology, Terminology, Guidelines, Reporting standards, Literature. RAG lives here. | No (RAG) |
| **Plane 4 — Clinical Reasoning** | Rules, pathways, comparisons, differentials, uncertainty, abstention. **This is what you're missing most.** | No |
| **Plane 5 — Communication** | Structured report, LLM wording, QA, radiologist UI, FHIR/DICOM SR, audit. | LLM lives here (wording only) |

---

## 6. The Critical Architectural Rule

Put this directly in your engineering standards:

> **The LLM must never be the authoritative source of patient facts.**

The hierarchy:
```
DICOM / validated measurement
        ↓
Clinical Evidence
        ↓
Clinical Rule
        ↓
Knowledge Evidence
        ↓
LLM
```

**Never:** LLM → medical fact

---

## 7. Current System → Target Mapping

| Current | Keep? | Evolution |
|---|---|---|
| Orthanc | ✅ | Harden |
| MRI UNEST | ✅ | Validation + OOD |
| BraTS | ✅ | Validation |
| CT models | ✅ | Validation |
| CXR | ✅ | Validation |
| Provenance | ✅ | Expand |
| QA | ✅ | QA-2/QA-3 |
| RAG | ✅ | Hybrid |
| Prior comparison | ✅ | Evidence graph |
| LLM gateway | ✅ | Keep |
| HITL | ✅ | Expand |
| Audit | ✅ | Strengthen |
| Multi-tenancy | ✅ | Retain |
| Kafka | ✅ | Expand later |
| Model governance | ✅ | Formalize |
| **Abstention** | **BUILD** | **Immediate** |
| **OOD** | **BUILD** | **Immediate** |
| **Rules engine** | **BUILD** | **Immediate** |
| **Evidence Graph** | **BUILD** | **Immediate** |
| **Structured report JSON** | **BUILD** | **Immediate** |
| **Validation factory** | **BUILD** | **Immediate** |
| **Silent deployment** | **BUILD** | After benchmark |
| US/Echo/Cathlab | **WAIT** | Don't distract team yet |

---

## 8. What NOT to Do

**Do not start building ultrasound, echo, cathlab, and C-arm now** — despite the long-term roadmap.

You already have enough modalities to prove the platform. Use **MRI Brain as the vertical slice**.

---

## 9. The MRI Brain Vertical Slice

```
DICOM
 ↓
OOD
 ↓
MRI models
 ↓
Evidence
 ↓
Anatomy
 ↓
Pathology
 ↓
Rules
 ↓
RAG
 ↓
Structured report
 ↓
LLM rendering
 ↓
Fact QA
 ↓
Image QA
 ↓
Abstention
 ↓
Radiologist
 ↓
Audit
```

**Get that entire loop excellent. Then reuse the infrastructure for CT and X-ray.**

---

## 10. New Definition of Done

MRI Brain should **not** graduate from `RESEARCH_ONLY` until you have:

### Safety
- OOD/applicability gate
- Explicit abstention
- Structured clinical invariants
- Deterministic reasoning
- Semantic QA
- Image-grounded QA
- Human sign-off

### Evidence
- Provenance
- Evidence Graph
- Source versioning
- Model versioning
- Prompt versioning
- Knowledge versioning

### Validation
- Adjudicated dataset
- Multi-reader agreement
- Patient-level split
- External/site validation
- Subgroup analysis
- Prospective silent validation
- Human factors testing

### Operations
- Monitoring
- Drift detection
- Override monitoring
- Critical-miss monitoring
- Rollback
- Controlled model updates
- Cybersecurity controls

### Reporting
- Structured JSON intermediate representation
- Deterministic facts
- LLM only for language realization
- FHIR/DICOM-compatible output

---

## 11. The Clinical Case Object

Introduce one new **top-level object** around which everything revolves:

```
ClinicalCase
│
├── Study
├── DICOM
├── Clinical context
├── AI observations
├── Measurements
├── Segmentations
├── Anatomy
├── Findings
├── Reasoning paths
├── Knowledge evidence
├── Clinical claims
├── Report draft
├── QA
├── Radiologist edits
├── Final report
└── Audit trail
```

**That object becomes your single source of truth for the entire AI reporting lifecycle.**

---

## 12. Bottom Line

> 1. **Freeze the current MRI/CXR/CT models. Do not expand modalities.**
> 2. **Spend the next engineering cycle building:** OOD + Abstention + Evidence Graph + Clinical Rules + Structured Report Compiler + Fact Checker + Validation Factory.
> 3. **Once those are working, your existing models become interchangeable perception components** inside a much more defensible Clinical AI Reporting Platform — rather than the platform itself.

The system doesn't need another model. **It needs to become deterministic around the models.**

---

*End of Clinical AI Platform — Stage 2 Hardening Blueprint*