# Clinical Knowledge Fabric (CKF) — Technical Specification

> **Document Type:** Technical Specification
> **Status:** Approved (Three-Person Board: AI CTO / AI Lead Architect / AI Devil's Advocate)
> **Scope:** Anatomy + Pathology Knowledge Base with Hybrid RAG Pipeline for Reporting Studies
> **Modality-Independent:** MRI, CT, X-ray, Ultrasound, Echo, Cathlab, C-arm
> **Related:** [RADIOLOGY_SONOLOGY_AI_PLATFORM_MASTER_ARCHITECTURE.md](./RADIOLOGY_SONOLOGY_AI_PLATFORM_MASTER_ARCHITECTURE.md)

---

## Table of Contents

- [Clinical Knowledge Fabric (CKF) — Technical Specification](#clinical-knowledge-fabric-ckf--technical-specification)
  - [Table of Contents](#table-of-contents)
  - [1. Executive Summary](#1-executive-summary)
  - [2. The Core Architectural Principle](#2-the-core-architectural-principle)
  - [3. Target Architecture](#3-target-architecture)
  - [4. The Five Knowledge Domains](#4-the-five-knowledge-domains)
  - [5. Anatomy Knowledge](#5-anatomy-knowledge)
  - [6. Pathology Knowledge](#6-pathology-knowledge)
  - [7. Imaging Knowledge](#7-imaging-knowledge)
  - [8. Reporting Knowledge](#8-reporting-knowledge)
  - [9. Guidelines/Criteria Knowledge](#9-guidelinescriteria-knowledge)
  - [10. The Terminology Layer](#10-the-terminology-layer)
  - [11. Canonical Clinical Object](#11-canonical-clinical-object)
  - [12. The Clinical Knowledge Graph](#12-the-clinical-knowledge-graph)
  - [13. Physical Data Architecture](#13-physical-data-architecture)
  - [14. Document Ingestion Pipeline](#14-document-ingestion-pipeline)
  - [15. Clinically Intelligent Chunking](#15-clinically-intelligent-chunking)
  - [16. Evidence Object for Every Retrieved Statement](#16-evidence-object-for-every-retrieved-statement)
  - [17. Hybrid Retrieval](#17-hybrid-retrieval)
  - [18. The Knowledge Router](#18-the-knowledge-router)
  - [19. Evidence Pack](#19-evidence-pack)
  - [20. LLM Contract](#20-llm-contract)
  - [21. The Fact Checker](#21-the-fact-checker)
  - [22. Hallucination Firewall](#22-hallucination-firewall)
  - [23. Patient Context as a Separate Retrieval Namespace](#23-patient-context-as-a-separate-retrieval-namespace)
  - [24. Evidence Graph as the Internal Source of Truth](#24-evidence-graph-as-the-internal-source-of-truth)
  - [25. Reusable API](#25-reusable-api)
  - [26. Model Registry](#26-model-registry)
  - [27. Machine-Enforced Clinical Status](#27-machine-enforced-clinical-status)
  - [28. MVP Technology Stack](#28-mvp-technology-stack)
  - [29. Don't Over-Engineer the Graph Initially](#29-dont-over-engineer-the-graph-initially)
  - [30. Knowledge Ingestion Governance](#30-knowledge-ingestion-governance)
  - [31. RAG Evaluation](#31-rag-evaluation)
  - [32. The Most Important Metric](#32-the-most-important-metric)
  - [33. Testing Architecture](#33-testing-architecture)
  - [34. The UNEST Regression Test](#34-the-unest-regression-test)
  - [35. The Final Report Object](#35-the-final-report-object)
  - [36. The Complete Clinical Reasoning Loop](#36-the-complete-clinical-reasoning-loop)
  - [37. Strategic Consequence: UNEST as a Perception Service](#37-strategic-consequence-unest-as-a-perception-service)
  - [38. Next Deliverable: CKF v1 Technical Blueprint](#38-next-deliverable-ckf-v1-technical-blueprint)

---

## 1. Executive Summary

This specification defines the **Clinical Knowledge Fabric (CKF)** — a first-class platform service sitting between the imaging AI layer and the reporting engine. It combines **Anatomy Knowledge** and **Pathology Knowledge** into a structured clinical knowledge graph + versioned document RAG system, queried by the imaging AI using the specific anatomy, modality, finding, measurements, and clinical context detected from the study.

**The critical correction:** Anatomy RAG and Pathology RAG should **not** be one undifferentiated vector database. They should be a **structured clinical knowledge graph + versioned document RAG system**.

This is consistent with current radiology RAG research: recent work shows benefits from grounding LLMs in authoritative radiology knowledge, while still emphasizing retrieval accuracy, hallucination control, and validation before clinical deployment.

## 2. The Core Architectural Principle

**RAG supplies evidence; it does not independently diagnose the patient.**

The Knowledge Base does not replace the imaging models. The imaging models do not replace the Knowledge Base. The LLM does not replace either.

```
Imaging AI observes → Anatomy organizes → Pathology interprets patterns
→ Knowledge/RAG grounds → Rules constrain → LLM communicates
→ QA verifies → Radiologist signs
```

## 3. Target Architecture

```
                         PATIENT STUDY
                              │
                              ▼
                    ┌──────────────────┐
                    │ IMAGE AI LAYER   │
                    └────────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
          Anatomy          Pathology     Measurements
          detected         candidates      /quant
              │              │              │
              └──────────────┼──────────────┘
                             ▼
                    CLINICAL EVIDENCE
                         OBJECTS
                             │
                             ▼
                  ┌────────────────────┐
                  │ KNOWLEDGE ROUTER   │
                  └─────────┬──────────┘
                            │
          ┌─────────────────┼──────────────────┐
          ▼                 ▼                  ▼
     ANATOMY KB        PATHOLOGY KB       CLINICAL KB
          │                 │                  │
          ▼                 ▼                  ▼
      Anatomy          Diseases/lesions    Guidelines
      relationships    Imaging patterns    Criteria
      variants         Differentials       Reporting rules
      terminology      manifestations      Recommendations
          │                 │                  │
          └─────────────────┼──────────────────┘
                            ▼
                     HYBRID RAG ENGINE
                            │
                  ┌─────────┴─────────┐
                  ▼                   ▼
             Vector search       Graph/SQL
                  │                   │
                  └─────────┬─────────┘
                            ▼
                   EVIDENCE SYNTHESIS
                            │
                            ▼
                  CLINICAL REASONING
                            │
                            ▼
                    REPORT COMPILER
                            │
                            ▼
                       REPORT QA
                            │
                            ▼
                      RADIOLOGIST
```

## 4. The Five Knowledge Domains

The system has **five separate knowledge domains**:

| Domain | Answers | Example |
|---|---|---|
| **Anatomy** | What is this structure? Where is it? What normally belongs here? | Hippocampus: anatomy, location, laterality, neighbors, vascular supply, normal morphology, variants, imaging appearance, measurement methods |
| **Pathology** | What diseases/processes can affect this anatomy, and how do they appear on each modality/sequence? | Hippocampus: MTS, infarction, encephalitis, tumor, seizure-related change, neurodegeneration |
| **Imaging** | How does disease appear on each modality/sequence? | MTS: T1 → volume loss, FLAIR → hyperintensity, T2 → signal abnormality |
| **Reporting** | How should the finding be described, classified, measured and reported? | Templates, structured reporting, BI-RADS, PI-RADS, LI-RADS, Lung-RADS, TI-RADS, CAD-RADS, RECIST, Fleischner |
| **Guidelines/Criteria** | Which guideline version is authoritative? | Society guidelines, institutional protocols, versioned and source-controlled |

## 5. Anatomy Knowledge

```
ANATOMY
├── organ
├── structure
├── substructure
├── laterality
├── spatial relationships
├── vascular relationships
├── lymphatic relationships
├── normal morphology
├── normal variants
├── developmental variants
├── imaging appearance
└── measurement methods
```

**RadLex** should be a primary terminology source. RSNA describes RadLex as a comprehensive radiology terminology for reporting, decision support, data mining, registries, education and research.

## 6. Pathology Knowledge

The second major graph:

```
PATHOLOGY
├── disease
├── lesion
├── abnormality
├── inflammatory process
├── infectious process
├── neoplasm
├── trauma
├── vascular pathology
├── degenerative pathology
├── congenital pathology
└── postoperative change
```

Each pathology connects to:

```
Pathology
   │
   ├── affects → Anatomy
   ├── appears_on → Modality
   ├── best_seen_on → Sequence
   ├── produces → ImagingFeature
   ├── measured_by → Measurement
   ├── differentiated_from → Differential
   ├── classified_by → Classification
   ├── reported_using → Template
   └── supported_by → Evidence
```

**Structured pathology object:**

```json
{
  "pathology": "mesial_temporal_sclerosis",
  "anatomy": ["hippocampus"],
  "modalities": ["MRI"],
  "sequences": ["T1", "T2", "FLAIR"],
  "features": [
    "hippocampal_volume_loss",
    "T2_FLAIR_hyperintensity"
  ],
  "laterality": "unilateral_or_bilateral",
  "differentials": [],
  "reporting_features": [],
  "clinical_significance": {},
  "references": []
}
```

This is vastly more useful to the LLM than dumping thousands of medical PDFs into a vector database.

## 7. Imaging Knowledge

This is where the system becomes much more powerful than a generic medical RAG:

```
Mesial temporal sclerosis
        ↓
MRI
        ↓
T1 ───────→ volume loss
FLAIR ────→ hyperintensity
T2 ───────→ signal abnormality
DWI ──────→ usually not the defining feature
```

Knowledge must understand: **Disease + Anatomy + Modality + Sequence + Imaging feature** — not just `disease → paragraph`.

## 8. Reporting Knowledge

A separate knowledge layer:

```
Reporting template
        │
        ├── required findings
        ├── optional findings
        ├── measurements
        ├── terminology
        ├── classification
        ├── impression structure
        └── recommendations
```

**Example — MRI Brain:**
```
├── Clinical indication
├── Technique
├── Comparison
├── Brain parenchyma
├── Ventricles
├── Extra-axial spaces
├── Diffusion
├── Susceptibility
├── Vascular structures
├── Orbits
├── Sinuses
├── Skull
└── Impression
```

RSNA's ecosystem provides **RadReport** reporting templates and **RadElement** structured reporting resources alongside RadLex.

## 9. Guidelines/Criteria Knowledge

Separately governed. Examples: BI-RADS, PI-RADS, LI-RADS, TI-RADS, Lung-RADS, CAD-RADS, RECIST, Fleischner, WHO classifications, specialty society guidelines, institutional protocols.

Every guideline object needs:

```json
{
  "id": "guideline_x",
  "organization": "...",
  "version": "...",
  "publication_date": "...",
  "effective_date": "...",
  "jurisdiction": "...",
  "modality": "...",
  "body_region": "...",
  "applicability": "...",
  "source": "...",
  "content_hash": "..."
}
```

**Never allow the LLM to decide which version is authoritative. The Knowledge Router decides.**

## 10. The Terminology Layer

```
                     TERMINOLOGY SERVICE
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
      RadLex             SNOMED CT             LOINC
        │                   │                   │
 Radiology terms       clinical concepts     observations
        │                   │                   │
        └───────────────────┼───────────────────┘
                            ▼
                    YOUR CANONICAL IDs
```

- **RadLex:** radiology terminology (RSNA) — available in FHIR format
- **SNOMED CT:** 360,000+ concepts in international edition; machine-readable identifiers and relationships; terminology services support searching, hierarchies, defining relationships, ECL queries, and mappings (including SNOMED CT → ICD-10)
- **LOINC:** observations

**Don't make your own competing medical terminology.** Create an internal canonical ID and map external standards to it.

## 11. Canonical Clinical Object

Everything resolves to a canonical object:

```json
{
  "canonical_id": "ANAT-BRAIN-HIPPOCAMPUS",
  "preferred_name": "Hippocampus",
  "type": "anatomy",
  "radlex": "...",
  "snomed_ct": "...",
  "laterality": "bilateral",
  "parent": "temporal_lobe",
  "relationships": [
    {
      "type": "adjacent_to",
      "target": "amygdala"
    }
  ]
}
```

Pathology:

```json
{
  "canonical_id": "PATH-MESIAL-TEMPORAL-SCLEROSIS",
  "preferred_name": "Mesial temporal sclerosis",
  "type": "pathology",
  "affects": [
    "ANAT-BRAIN-HIPPOCAMPUS"
  ],
  "imaging_features": [
    "hippocampal_volume_loss",
    "T2_FLAIR_hyperintensity"
  ]
}
```

## 12. The Clinical Knowledge Graph

The heart of the system. Graph relationships:

```
HIPPOCAMPUS
    │
    ├── part_of → TEMPORAL_LOBE
    ├── adjacent_to → AMYGDALA
    ├── measured_by → VOLUME
    ├── imaged_by → MRI
    └── affected_by
             │
             ▼
     MESIAL_TEMPORAL_SCLEROSIS
             │
             ├── feature → VOLUME_LOSS
             ├── feature → FLAIR_HYPERINTENSITY
             ├── differential → ENCEPHALITIS
             ├── differential → INFARCTION
             └── reported_by → EPILEPSY_MRI_TEMPLATE
```

This graph gives **relationship-aware retrieval**.

**Example query graph:** When AI detects `left hippocampal volume reduction` + `left hippocampal T2/FLAIR hyperintensity`, the system constructs:

```
LEFT HIPPOCAMPUS
       │
       ├── volume ↓
       │
       ├── T2/FLAIR ↑
       │
       └── unilateral
              │
              ▼
       candidate patterns
              │
       ┌──────┼───────┐
       ▼      ▼       ▼
      MTS   tumor   encephalitis
```

Then RAG retrieves evidence supporting each candidate. This is much safer and more explainable.

## 13. Physical Data Architecture

```
PostgreSQL
    │
    ├── canonical clinical objects
    ├── metadata
    ├── versions
    ├── provenance
    ├── guidelines
    └── report templates

Graph database
    │
    └── clinical relationships

Object storage
    │
    ├── PDFs
    ├── guidelines
    ├── papers
    ├── reference material
    └── model artifacts

Vector database
    │
    └── semantic chunks

Search engine
    │
    └── lexical/BM25 retrieval
```

**Pragmatic MVP:** PostgreSQL + pgvector + full-text search. Introduce a dedicated graph/search system when scale and query complexity justify it.

## 14. Document Ingestion Pipeline

**Do NOT:** `PDF → extract text → chunk → embeddings`

**Instead:**

```
SOURCE
  ↓
Document validation
  ↓
Copyright/licensing check
  ↓
Version identification
  ↓
PDF/HTML/XML parsing
  ↓
Table extraction
  ↓
Figure/caption extraction
  ↓
Section recognition
  ↓
Medical terminology normalization
  ↓
Clinical entity extraction
  ↓
Relationship extraction
  ↓
Evidence classification
  ↓
Chunking
  ↓
Embedding
  ↓
Indexing
  ↓
Quality validation
```

## 15. Clinically Intelligent Chunking

Don't chunk every 500 tokens. Keep clinically meaningful relationships together:

```
Guideline
 ├── Recommendation 1
 ├── Recommendation 2
 ├── Exception
 ├── Contraindication
 ├── Evidence level
 └── Supporting evidence
```

A RAG chunk should ideally represent a **clinically meaningful proposition**.

## 16. Evidence Object for Every Retrieved Statement

```json
{
  "evidence_id": "EVID-98271",
  "claim": "Hippocampal volume loss may be associated with mesial temporal sclerosis",
  "source_type": "guideline_or_literature",
  "source": "...",
  "section": "...",
  "publication_date": "...",
  "evidence_level": "...",
  "retrieval_score": 0.93,
  "reranker_score": 0.88,
  "applicable_to": {
    "modality": "MRI",
    "anatomy": "hippocampus"
  }
}
```

This makes reasoning **auditable**.

## 17. Hybrid Retrieval

Four mechanisms combined:

1. **Semantic** — embedding similarity
2. **Lexical** — BM25 / exact medical terminology
3. **Graph** — anatomy → disease → feature
4. **Structured filters** — modality = MRI, body_part = brain, sequence = FLAIR, age_group = adult, guideline_version = current

```
Candidate retrieval
        ↓
Hybrid merge
        ↓
Cross-encoder/reranker
        ↓
Clinical applicability filter
        ↓
Evidence pack
```

**Hierarchical retrieval:**

```
QUERY
 │
 ▼
Anatomy filter
 │
 ▼
Modality filter
 │
 ▼
Pathology filter
 │
 ▼
Sequence filter
 │
 ▼
Clinical context filter
 │
 ▼
Hybrid retrieval
 │
 ├── lexical
 ├── vector
 ├── graph
 └── metadata
 │
 ▼
reranker
 │
 ▼
evidence selection
```

## 18. The Knowledge Router

Suppose the imaging AI produces: CT chest + pulmonary nodule + 8 mm + upper lobe + solid.

The router determines: Modality = CT, Anatomy = lung, Finding = pulmonary nodule, Measurement = 8 mm, Morphology = solid — and routes to:
- Lung anatomy KB
- Pulmonary nodule pathology KB
- Appropriate management/reporting guidelines

**The router should not search the entire medical corpus.**

## 19. Evidence Pack

The **only** knowledge input to the report LLM:

```json
{
  "study": {
    "modality": "MRI",
    "body_region": "brain"
  },

  "clinical_context": {
    "indication": "seizure evaluation"
  },

  "validated_findings": [
    {
      "anatomy": "left hippocampus",
      "finding": "volume_loss",
      "measurement": {
        "value": 2714,
        "unit": "mm3"
      },
      "confidence": 0.94
    },
    {
      "anatomy": "left hippocampus",
      "finding": "FLAIR_hyperintensity",
      "confidence": 0.88
    }
  ],

  "comparisons": [
    {
      "type": "contralateral",
      "finding": "volume_asymmetry",
      "status": "validated"
    }
  ],

  "knowledge_evidence": [
    {
      "claim": "...",
      "source": "...",
      "evidence_level": "..."
    }
  ],

  "reporting_requirements": [
    "describe hippocampal volume",
    "describe signal abnormality",
    "state laterality",
    "include comparison"
  ],

  "uncertainties": []
}
```

## 20. LLM Contract

The LLM receives: **EVIDENCE PACK + REPORT TEMPLATE + STYLE POLICY + TERMINOLOGY POLICY**

It does **not** receive: "Here are 40,000 medical documents. Figure it out."

The prompt should effectively say:

> Generate the report using only validated study evidence and the supplied knowledge evidence. Do not introduce findings absent from the Evidence Pack. Do not convert uncertain evidence into definitive findings. Preserve laterality and measurements exactly. If required evidence is missing, state that it cannot be determined.

## 21. The Fact Checker

A separate model/service that attacks the generated report:

```
REPORT SENTENCE
       ↓
Entity extraction
       ↓
Compare against Evidence Graph
       ↓
Compare against Evidence Pack
       ↓
Check measurements
       ↓
Check laterality
       ↓
Check negations
       ↓
Check unsupported diagnoses
       ↓
PASS / REVISE / BLOCK
```

**Example:** AI writes "Right hippocampal atrophy." Evidence says left hippocampal volume loss → **BLOCK**.

## 22. Hallucination Firewall

```
              GENERATED REPORT
                     │
       ┌─────────────┼─────────────┐
       ▼             ▼             ▼
   Evidence       Anatomy       Numbers
    check          check          check
       │             │             │
       └─────────────┼─────────────┘
                     ▼
                 Laterality
                    check
                     │
                     ▼
                Negation check
                     │
                     ▼
              Unsupported claim
                   detection
                     │
                     ▼
                 FINAL QA
```

**No pass → no clinical release.**

## 23. Patient Context as a Separate Retrieval Namespace

**GLOBAL KNOWLEDGE + PATIENT KNOWLEDGE** should never be mixed indiscriminately.

Patient retrieval: prior imaging, prior reports, pathology, clinical history, relevant labs — with **strict authorization**.

FHIR's DiagnosticReport model supports connecting report results with ImagingStudy and atomic Observation results — a useful interoperability target.

## 24. Evidence Graph as the Internal Source of Truth

The hierarchy:

```
DICOM
 ↓
Validated AI observations
 ↓
Evidence Graph
 ↓
Knowledge evidence
 ↓
Clinical reasoning
 ↓
Report
```

**If the report conflicts with the Evidence Graph: The Evidence Graph wins.**

## 25. Reusable API

```
/knowledge/anatomy
/knowledge/pathology
/knowledge/guidelines
/knowledge/reporting
/knowledge/search

/terminology/lookup
/terminology/map
/terminology/validate

/evidence/create
/evidence/query
/evidence/compare

/reasoning/analyze
/reasoning/differential

/report/generate
/report/validate
/report/explain
```

## 26. Model Registry

```json
{
  "model_id": "mri_unest_v027",
  "version": "0.2.7",
  "modality": "MR",
  "body_region": "brain",
  "task": "segmentation",
  "training_dataset": "...",
  "validation_dataset": "...",
  "intended_use": "...",
  "clinical_status": "research",
  "known_limitations": [],
  "approved_protocols": [],
  "input_requirements": [],
  "output_schema": {}
}
```

## 27. Machine-Enforced Clinical Status

Use: **RESEARCH / VALIDATION / SILENT / CLINICAL / RETIRED**

```
UNEST v0.2.7 → RESEARCH → cannot produce reportable evidence
UNEST v1.4   → CLINICAL → allowed for specified MRI protocols
```

**No environment variable should override this.**

## 28. MVP Technology Stack

| Domain | Technologies |
|---|---|
| **Backend** | Python, FastAPI, Pydantic, PostgreSQL, pgvector, Redis, Celery / Temporal |
| **Imaging** | DICOM, Orthanc, DCM4CHEE where required, MONAI, PyTorch, MONAI Deploy where appropriate, OHIF |
| **Knowledge** | PostgreSQL, pgvector, OpenSearch/Elasticsearch, Graph DB later if necessary |
| **AI** | Specialized vision models, VLM where justified, LLM for reasoning/report composition, cross-encoder reranker, embedding model |
| **Interoperability** | DICOM, DICOMweb, FHIR, HL7, RadLex, SNOMED CT, LOINC |

## 29. Don't Over-Engineer the Graph Initially

Do **not** immediately deploy Neo4j + Qdrant + Milvus + Elastic + Postgres + Redis + Kafka + Temporal all at once.

**Start:**
```
PostgreSQL
 ├── clinical ontology
 ├── relationships
 ├── metadata
 ├── provenance
 └── pgvector

Object storage
 └── source documents
```

Add a dedicated graph database only when graph traversal actually becomes a bottleneck.

## 30. Knowledge Ingestion Governance

Every document passes:

```
SOURCE
 ↓
AUTHORITY CHECK
 ↓
LICENSE CHECK
 ↓
VERSION
 ↓
MEDICAL REVIEW
 ↓
PARSING
 ↓
ENTITY EXTRACTION
 ↓
RELATION EXTRACTION
 ↓
EMBEDDING
 ↓
INDEX
 ↓
RETRIEVAL TEST
 ↓
APPROVAL
```

**You need a Clinical Knowledge Curator role. This cannot be entirely automated.**

## 31. RAG Evaluation

Don't measure RAG using only "Did the LLM sound good?" Create a benchmark. For every query: Query, Expected evidence, Expected source, Expected terminology, Expected conclusion constraints.

**Metrics:**
- **Retrieval:** Recall@K, Precision@K, MRR, NDCG
- **Clinical:** evidence completeness, citation correctness, contradiction rate, unsupported claim rate
- **Reporting:** finding recall, laterality accuracy, measurement accuracy, negation accuracy, hallucination rate

## 32. The Most Important Metric

**Unsupported Clinical Claim Rate:**
```
unsupported claims
──────────────────
total clinical claims
```
Target: **as close to zero as possible.**

**Evidence Coverage:**
```
supported report claims
────────────────────────
total report claims
```
You want both **high coverage** and **extremely low unsupported claims**.

## 33. Testing Architecture

Five test sets:

| Set | Content |
|---|---|
| **A. Anatomy** | Normal anatomy, variants, laterality, postoperative anatomy, distortion |
| **B. Pathology** | Classic cases, atypical cases, multiple diseases, mimics, rare findings |
| **C. RAG** | Correct retrieval, wrong retrieval, outdated guideline, conflicting sources, missing evidence |
| **D. LLM** | Hallucination, negation, laterality, measurements, unsupported inference |
| **E. End-to-end** | DICOM → AI → Evidence → RAG → Report → QA |

## 34. The UNEST Regression Test

The 70× pairing failure becomes a **REGRESSION TEST**:

```
Input: specific MRI study
Expected: pairing rejection
Must NOT: generate "70× asymmetry"
Must: produce correspondence_uncertain
```

**That test should run on every deployment.**

## 35. The Final Report Object

Store reports in structured form first:

```json
{
  "report_id": "...",
  "study_id": "...",

  "findings": [
    {
      "anatomy": "left hippocampus",
      "finding": "volume loss",
      "measurement": {
        "value": 2714,
        "unit": "mm3"
      },
      "evidence_ids": [
        "EVID-001",
        "EVID-002"
      ]
    }
  ],

  "impression": [
    {
      "text": "...",
      "evidence_ids": ["EVID-001"]
    }
  ],

  "ai_provenance": [],
  "knowledge_provenance": [],
  "qa": {},
  "status": "DRAFT"
}
```

Then render into: PDF, HTML, FHIR DiagnosticReport, DICOM SR, RIS format. DICOM SR has standardized templates for diagnostic imaging reports and measurement structures.

## 36. The Complete Clinical Reasoning Loop

```
                         PATIENT
                            │
                            ▼
                         DICOM
                            │
                            ▼
                   STUDY UNDERSTANDING
                            │
                            ▼
                    MODEL ORCHESTRATOR
                            │
           ┌────────────────┼────────────────┐
           ▼                ▼                ▼
       Detection       Segmentation      Measurement
           │                │                │
           └────────────────┼────────────────┘
                            ▼
                     EVIDENCE GRAPH
                            │
          ┌─────────────────┼─────────────────┐
          ▼                 ▼                 ▼
       Anatomy           Pathology         Comparison
          │                 │                 │
          └─────────────────┼─────────────────┘
                            ▼
                    KNOWLEDGE ROUTER
                            │
          ┌─────────────────┼─────────────────┐
          ▼                 ▼                 ▼
      Anatomy RAG       Pathology RAG     Guidelines RAG
          │                 │                 │
          └─────────────────┼─────────────────┘
                            ▼
                    EVIDENCE SYNTHESIS
                            │
                            ▼
                    CLINICAL REASONING
                            │
                            ▼
                    REPORT COMPILER
                            │
                            ▼
                    FACT-CHECK ENGINE
                            │
                     ┌──────┴──────┐
                     ▼             ▼
                    FAIL          PASS
                     │             │
                     ▼             ▼
                  REVISE       RADIOLOGIST
                                  │
                                  ▼
                                SIGN
```

## 37. Strategic Consequence: UNEST as a Perception Service

The 133-structure UNEST work is **no longer the "reporting system."** It becomes:

> **One anatomical perception service feeding the Clinical Evidence Graph.**

Then plug in:

```
MRI
 ├── UNEST
 ├── tumor model
 ├── stroke model
 ├── white-matter model
 ├── hemorrhage model
 └── volumetry

CT
 ├── PE
 ├── ICH
 ├── fracture
 ├── tumor
 ├── nodule
 └── organ segmentation

X-ray
 ├── opacity
 ├── effusion
 ├── pneumothorax
 ├── cardiomegaly
 └── fracture

Ultrasound
 ├── organ measurements
 ├── lesions
 ├── Doppler
 └── pathology

Echo
 ├── chambers
 ├── EF
 ├── valves
 ├── Doppler
 └── hemodynamics
```

**All of them ultimately speak the same Evidence Graph language.** That is what makes the system scalable rather than creating six separate AI reporting products.

## 38. Next Deliverable: CKF v1 Technical Blueprint

Before writing production code, produce a formal **Clinical Knowledge Fabric v1 technical specification** containing:

- PostgreSQL schema
- Anatomy ontology schema
- Pathology ontology schema
- Anatomy↔pathology relationship model
- RadLex/SNOMED/LOINC mapping architecture
- Knowledge-document schema
- Vector/chunk schema
- Hybrid retrieval algorithm
- Reranking algorithm
- Knowledge Router
- Evidence Graph schema
- Evidence Pack JSON schema
- LLM contract
- Hallucination firewall
- Clinical QA rules
- Model Registry
- Knowledge Registry
- Versioning/provenance
- API specification
- MRI implementation first, followed by CT/X-ray/US/Echo

That should be the actual engineering blueprint from which developers build, rather than continuing to add isolated functionality to `mri_unest_adapter.py`.

---

*End of Clinical Knowledge Fabric (CKF) Technical Specification*