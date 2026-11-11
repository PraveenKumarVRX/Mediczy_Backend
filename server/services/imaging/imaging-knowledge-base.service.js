/**
 * Imaging Knowledge Base — minimal real anatomy/pathology reference content,
 * retrieved by tag match against a study's structured findings and injected
 * into the report-drafting prompt as clearly-labeled background context.
 *
 * Scoped deliberately small: covers exactly what the current pipeline
 * produces (lateral ventricles from mri_unest_adapter.py, BraTS tumor
 * subregions from mri_brats_adapter.py) — not a general medical corpus.
 * Every row has real provenance (source title, URL, retrieval date) and
 * was populated from an actual web search of peer-reviewed/authoritative
 * sources, not written from memory and presented as verified.
 *
 * No vector DB, no embeddings — three curated rows don't need one. Matching
 * is plain PostgreSQL array overlap against `anatomy_tags`. Add a real
 * retrieval layer only when the row count actually makes tag-matching
 * insufficient, not preemptively.
 *
 * IMPORTANT: entries here are general medical/technical background, never
 * a patient-specific "normal value" — nothing here has an age/sex-adjusted
 * reference range, and none should be added without a real, citable
 * normative dataset. This is exactly the boundary
 * ai-quality-gates.service.js's UNSUPPORTED_NORMALCY_CLAIM check exists to
 * enforce; the retrieval prompt below is written to keep the LLM on the
 * correct side of it.
 */
import axios from 'axios';
import pool from '../../db/pgPool.js';
import { routeEvidence } from './imaging-knowledge-router.service.js';

import { schemaVerifier, guardedQuery } from '../../utils/schema-guard.js';
// Item 7 — hybrid retrieval reuses the platform's existing embedding infra
// (SIB's ClinicalBERT /embed endpoint, already used by ai-brain/rag-pipeline.js
// for the general-purpose EHR/document RAG) rather than merging imaging
// reference knowledge into that same table — that table also holds
// patient-specific EHR content with its own consent-gating concerns,
// and this KB is deliberately scoped to general imaging reference material.
const SIB_URL = process.env.SIB_URL || 'http://localhost:8001';
const EMBEDDING_DIM = 768;

const SCHEMA_TABLES = ['imaging_knowledge_base', 'imaging_anatomy_relationships'];

// Owned by the migration, verified here. Creating these on demand would let a
// skipped migration look healthy on tables without its indexes and constraints.
const ensureTable = schemaVerifier({
  pool,
  tables: SCHEMA_TABLES,
  code: 'SCHEMA_NOT_MIGRATED',
  message: 'Apply migration 20261015004500-imaging-evidence-governance before using the imaging knowledge base',
});

// Queries fail closed on a missing table, and the check above also runs at
// startup so an unmigrated environment shows up in the log rather than only
// when a request arrives.
const guardedPool = guardedQuery(pool, 'Apply migration 20261015004500-imaging-evidence-governance before using the imaging knowledge base');
ensureTable().catch((err) => console.error('[imaging-knowledge-base] schema check failed:', err.message, err.details || ''));

/** Real embedding call to SIB's ClinicalBERT endpoint — same function every
 * other RAG consumer in this codebase uses, not a separate implementation.
 * Returns null (not a fabricated fallback vector) if SIB is unreachable —
 * callers must treat that as "vector search unavailable this call", not
 * silently substitute a zero vector that would rank everything equally. */
async function embed(text) {
  try {
    const { data } = await axios.post(`${SIB_URL}/embed`, { texts: [text] }, {
      timeout: 10000,
      headers: { 'Content-Type': 'application/json' },
    });
    return data?.embeddings?.[0] || null;
  } catch (e) {
    console.error('[ImagingKB] embed() failed, falling back to lexical+tag search only:', e.message);
    return null;
  }
}

const SEED_ROWS = [
  {
    canonicalId: 'ANAT-BRAIN-LATERAL-VENTRICLE',
    kind: 'anatomy',
    preferredName: 'Lateral ventricle',
    modality: ['MR', 'CT'],
    anatomyTags: ['lateral_ventricle', 'ventricle', 'brain', 'regionpair'],
    content:
      'The lateral ventricles are paired CSF-filled cavities within the cerebral hemispheres, part of the ' +
      'ventricular system. Anatomic variation between the ventricular system\'s left and right sides is well ' +
      'documented and can arise from developmental and structural variants, not only from pathology.',
    sourceTitle: 'The Lateral Ventricles: A Detailed Review of Anatomy, Development, and Anatomic Variations',
    sourceUrl: 'https://www.ajnr.org/content/41/4/566',
    sourceType: 'peer_reviewed_review',
    retrievedAt: '2026-08-23',
    laterality: 'bilateral',
    parentStructure: 'ventricular_system',
    differentials: [],
  },
  {
    canonicalId: 'PATH-BRAIN-VENTRICULAR-ASYMMETRY',
    kind: 'pathology',
    preferredName: 'Lateral ventricular asymmetry — interpretive guidance',
    modality: ['MR', 'CT'],
    anatomyTags: ['lateral_ventricle', 'ventricle', 'brain', 'regionpair'],
    content:
      'Lateral ventricular asymmetry alone is frequently a normal variant rather than a pathologic finding; small ' +
      'volumetric or morphologic differences between normal-sized lateral ventricles are commonly of no clinical ' +
      'significance. However, radiologists should evaluate for adjacent parenchymal disease, an intraventricular ' +
      'lesion, or obstruction at the foramen of Monro before attributing asymmetry to a normal variant — an ' +
      'isolated finding without those associated features, and without evidence of volume loss or a space-' +
      'occupying lesion, is more supportive of a benign variant. No universally agreed numeric ratio threshold ' +
      'was found in this search that reliably separates "normal variant" from "pathological" asymmetry in ' +
      'isolation — that determination is a radiologist\'s clinical judgment, not a fixed cutoff, which is why ' +
      'this pipeline reports the ratio as a flag for correlation rather than a diagnosis.',
    sourceTitle:
      'Cerebral lateral ventricular asymmetry on CT: how much asymmetry is representing pathology? ' +
      '(synthesized from multiple search results — see note)',
    sourceUrl: 'https://link.springer.com/article/10.1007/s00276-008-0314-9',
    sourceType: 'literature_search_synthesis',
    retrievedAt: '2026-08-23',
    laterality: 'bilateral',
    parentStructure: 'ventricular_system',
    // Same list imaging-clinical-rules.service.js's MRI-BRAIN-VENT-001 rule
    // uses (it imports SEED_ROWS from here — single-sourced, not duplicated).
    differentials: ['normal anatomic variation', 'developmental variation', 'mass effect from an adjacent lesion', 'obstructive hydrocephalus'],
    // Generation-safe summary — same clinical intent as `content` above
    // (normal variant is common; consider associated findings and priors;
    // don't jump to a specific cause) with NONE of MRI-BRAIN-VENT-001's
    // prohibitedInferences terms (hydrocephalus/mass effect/obstruction/
    // obstructive) present, not even inside a "do not conclude" framing —
    // the earlier version of this exact prompt included those words right
    // next to a "DO NOT conclude" instruction, and the LLM echoed them
    // anyway (captured verbatim in imaging-golden-brain-mri-ventricle.
    // test.js). This is the text formatKnowledgeForPrompt() actually sends
    // to the generation LLM for this row; `content`/`differentials` above
    // stay intact for retrieval/provenance and are shown in ai_explanation.
    generationSafeSummary: [
      'Ventricular asymmetry alone is frequently an incidental anatomical variant, not a pathologic finding.',
      'Interpretation should consider associated imaging findings and, where available, comparison with prior studies.',
      'This finding alone does not establish a specific underlying cause — correlation is recommended rather than a specific diagnosis.',
    ],
  },
  {
    canonicalId: 'PATH-BRAIN-TUMOR-BRATS-SUBREGIONS',
    kind: 'pathology',
    preferredName: 'BraTS tumor subregion terminology (whole tumor / tumor core / enhancing tumor)',
    modality: ['MR'],
    anatomyTags: ['tumor', 'whole_tumor', 'tumor_core', 'enhancing_tumor', 'brain'],
    content:
      'The BraTS (Brain Tumor Segmentation) benchmark defines three hierarchical tumor subregions built from ' +
      'four underlying tissue labels (healthy tissue, edema, necrosis, enhancing tumor). Whole Tumor (WT) is ' +
      'composed of the enhancing area, edema area, and necrosis area combined. Tumor Core (TC) is composed of ' +
      'the enhancing area and necrosis area (i.e. WT minus edema). Enhancing Tumor (ET) is the enhancing area ' +
      'alone — the sub-region reflecting active, contrast-uptake tumor tissue, which requires a post-contrast ' +
      '(T1c) sequence to assess; on a pipeline with no contrast series, ET output should be treated as ' +
      'unreliable by construction, not merely lower-confidence.',
    sourceTitle: 'Brain tumor segmentation based on deep learning and an attention mechanism using MRI multi-modalities brain images',
    sourceUrl: 'https://www.nature.com/articles/s41598-021-90428-8',
    sourceType: 'peer_reviewed_study',
    retrievedAt: '2026-08-23',
    laterality: null,
    parentStructure: 'brain_parenchyma',
    // Same list imaging-clinical-rules.service.js's MRI-BRAIN-TUMOR-001 rule
    // uses (imports SEED_ROWS from here).
    differentials: [
      'glioma', 'metastasis', 'meningioma', 'lymphoma',
      'artifact or registration error (this pipeline\'s skull-stripping and registration are unvalidated approximations)',
    ],
    // Generation-safe summary — same reasoning as PATH-BRAIN-VENTRICULAR-
    // ASYMMETRY above: `differentials` names specific tumor types (glioma,
    // metastasis, meningioma, lymphoma), which is real retrieval/provenance
    // content but not safe generation vocabulary — subregion segmentation
    // alone cannot characterize tissue type, and showing the LLM a list of
    // named tumor types invites exactly that over-claim. None of
    // MRI-BRAIN-TUMOR-001's prohibitedInferences terms (grade/malignant/
    // malignancy/benign/glioblastoma/stage) appear here either.
    generationSafeSummary: [
      'Automated tumor subregion segmentation identifies whole tumor, tumor core, and enhancing tumor regions from MRI signal characteristics only.',
      'Subregion segmentation alone does not characterize the tissue type — radiologist review and, where indicated, further clinical workup is required.',
      'Enhancing tumor output specifically requires a post-contrast sequence to assess reliably; without one it should be treated as unreliable.',
    ],
  },
  // Item 3 — completes the ventricular system hierarchy that
  // ANAT-BRAIN-LATERAL-VENTRICLE already referenced via parent_structure
  // but had no row of its own. Real, sourced content (WebSearch,
  // 2026-08-23) — not written from memory and presented as verified.
  {
    canonicalId: 'ANAT-BRAIN-VENTRICULAR-SYSTEM',
    kind: 'anatomy',
    preferredName: 'Ventricular system',
    modality: ['MR', 'CT'],
    anatomyTags: ['ventricular_system', 'ventricle', 'brain'],
    content:
      'The ventricular system is a communicating network of CSF-filled cavities within the brain parenchyma: ' +
      'two lateral ventricles, a midline third ventricle, and a fourth ventricle. The lateral ventricles ' +
      'communicate with the third ventricle via the interventricular foramen (foramen of Monro); the third ' +
      'ventricle communicates with the fourth ventricle via the cerebral aqueduct (of Sylvius). CSF flows ' +
      'through this pathway before exiting into the surrounding CNS tissue or central spinal canal.',
    sourceTitle: 'Ventricles of the Brain: Overview, Gross Anatomy, Microscopic Anatomy',
    sourceUrl: 'https://emedicine.medscape.com/article/1923254-overview',
    sourceType: 'peer_reviewed_review',
    retrievedAt: '2026-08-23',
    laterality: null,
    parentStructure: null,
    differentials: [],
  },
  {
    canonicalId: 'ANAT-BRAIN-THIRD-VENTRICLE',
    kind: 'anatomy',
    preferredName: 'Third ventricle',
    modality: ['MR', 'CT'],
    anatomyTags: ['third_ventricle', 'ventricle', 'brain'],
    content:
      'The third ventricle is a midline, slit-like CSF cavity located between the right and left thalamus, ' +
      'extending to the cerebral aqueduct. It communicates with the lateral ventricles through the small ' +
      'interventricular foramen (foramen of Monro) and with the fourth ventricle through the cerebral aqueduct.',
    sourceTitle: 'Ventricles of the Brain: Overview, Gross Anatomy, Microscopic Anatomy',
    sourceUrl: 'https://emedicine.medscape.com/article/1923254-overview',
    sourceType: 'peer_reviewed_review',
    retrievedAt: '2026-08-23',
    laterality: 'midline',
    parentStructure: 'ventricular_system',
    differentials: [],
  },
  {
    canonicalId: 'ANAT-BRAIN-FOURTH-VENTRICLE',
    kind: 'anatomy',
    preferredName: 'Fourth ventricle',
    modality: ['MR', 'CT'],
    anatomyTags: ['fourth_ventricle', 'ventricle', 'brain'],
    content:
      'The fourth ventricle lies immediately posterior to the brainstem, at the center of the cerebellum, with ' +
      'a characteristic diamond shape in cross-section. It receives CSF from the third ventricle via the ' +
      'cerebral aqueduct and drains caudally into the basal cisterns through the midline foramen of Magendie ' +
      'and the paired lateral foramina of Luschka.',
    sourceTitle: 'Neuroanatomy, Fourth Ventricle',
    sourceUrl: 'https://www.ncbi.nlm.nih.gov/books/NBK546577/',
    sourceType: 'peer_reviewed_review',
    retrievedAt: '2026-08-23',
    laterality: 'midline',
    parentStructure: 'ventricular_system',
    differentials: [],
  },
  // P6 (CLINICAL_AI_PLATFORM_V1_IMPLEMENTATION_ROADMAP.md) — MRI Brain
  // anatomy ontology, real content via WebSearch (2026-08-23). None of
  // these structures are individually named/measured by the pipeline today
  // (mri_unest_adapter.py's _NAMED_LABELS is still only the two ventricles
  // — expanding that mapping needs real per-label validation this session
  // hasn't done, a separate, larger task from adding reference anatomy
  // content). These are general background only, same framing as every
  // other row — not a claim that the pipeline detects or measures them.
  {
    canonicalId: 'ANAT-BRAIN-CEREBRUM',
    kind: 'anatomy',
    preferredName: 'Cerebrum',
    modality: ['MR', 'CT'],
    anatomyTags: ['cerebrum', 'brain'],
    content:
      'The cerebrum is the largest component of the brain, divided into right and left hemispheres joined by the ' +
      'corpus callosum. Each hemisphere is further divided into four lobes: frontal, parietal, temporal, and occipital.',
    sourceTitle: 'Brain Anatomy: Overview, Gross Anatomy: Cerebrum, Gross Anatomy: Cortex',
    sourceUrl: 'https://emedicine.medscape.com/article/1898830-overview',
    sourceType: 'peer_reviewed_review', retrievedAt: '2026-08-23',
    laterality: 'bilateral', parentStructure: null, differentials: [],
  },
  {
    canonicalId: 'ANAT-BRAIN-CEREBELLUM',
    kind: 'anatomy',
    preferredName: 'Cerebellum',
    modality: ['MR', 'CT'],
    anatomyTags: ['cerebellum', 'brain'],
    content: 'The cerebellum lies posterior to the brainstem, below the tentorium, and coordinates motor control and balance.',
    sourceTitle: 'Brain Anatomy: Overview, Gross Anatomy: Cerebrum, Gross Anatomy: Cortex',
    sourceUrl: 'https://emedicine.medscape.com/article/1898830-overview',
    sourceType: 'peer_reviewed_review', retrievedAt: '2026-08-23',
    laterality: 'midline', parentStructure: null, differentials: [],
  },
  {
    canonicalId: 'ANAT-BRAIN-BRAINSTEM',
    kind: 'anatomy',
    preferredName: 'Brainstem',
    modality: ['MR', 'CT'],
    anatomyTags: ['brainstem', 'brain'],
    content:
      'The brainstem extends from the upper cervical spinal cord to the diencephalon and is divided into the ' +
      'medulla, pons, and midbrain.',
    sourceTitle: 'Brain Anatomy: Overview, Gross Anatomy: Cerebrum, Gross Anatomy: Cortex',
    sourceUrl: 'https://emedicine.medscape.com/article/1898830-overview',
    sourceType: 'peer_reviewed_review', retrievedAt: '2026-08-23',
    laterality: 'midline', parentStructure: null, differentials: [],
  },
  {
    canonicalId: 'ANAT-BRAIN-DEEP-GRAY-NUCLEI',
    kind: 'anatomy',
    preferredName: 'Deep gray nuclei',
    modality: ['MR', 'CT'],
    anatomyTags: ['deep_gray_nuclei', 'brain'],
    content:
      'Deep gray nuclei is the umbrella term for the gray-matter structures deep within the cerebral hemispheres ' +
      'and diencephalon — principally the basal ganglia and thalamus.',
    sourceTitle: 'Brain: Parts, Function, How It Works & Conditions',
    sourceUrl: 'https://my.clevelandclinic.org/health/body/22638-brain',
    sourceType: 'clinical_reference', retrievedAt: '2026-08-23',
    laterality: 'bilateral', parentStructure: null, differentials: [],
  },
  {
    canonicalId: 'ANAT-BRAIN-THALAMUS',
    kind: 'anatomy',
    preferredName: 'Thalamus',
    modality: ['MR', 'CT'],
    anatomyTags: ['thalamus', 'deep_gray_nuclei', 'brain'],
    content: 'The thalamus sits above the brainstem and relays sensory information to the cerebral cortex from the rest of the body.',
    sourceTitle: 'Brain: Parts, Function, How It Works & Conditions',
    sourceUrl: 'https://my.clevelandclinic.org/health/body/22638-brain',
    sourceType: 'clinical_reference', retrievedAt: '2026-08-23',
    laterality: 'bilateral', parentStructure: 'deep_gray_nuclei', differentials: [],
  },
  {
    canonicalId: 'ANAT-BRAIN-BASAL-GANGLIA',
    kind: 'anatomy',
    preferredName: 'Basal ganglia',
    modality: ['MR', 'CT'],
    anatomyTags: ['basal_ganglia', 'deep_gray_nuclei', 'brain'],
    content: 'The basal ganglia lie deep within the cerebrum and regulate voluntary movement.',
    sourceTitle: 'Brain: Parts, Function, How It Works & Conditions',
    sourceUrl: 'https://my.clevelandclinic.org/health/body/22638-brain',
    sourceType: 'clinical_reference', retrievedAt: '2026-08-23',
    laterality: 'bilateral', parentStructure: 'deep_gray_nuclei', differentials: [],
  },
  {
    canonicalId: 'ANAT-BRAIN-WHITE-MATTER',
    kind: 'anatomy',
    preferredName: 'White matter',
    modality: ['MR', 'CT'],
    anatomyTags: ['white_matter', 'brain'],
    content:
      'White matter consists of myelinated axons that transmit signals between gray-matter regions, which process ' +
      'information; the corpus callosum (the largest white-matter structure, ~10 cm, 200-300 million axonal ' +
      'projections) joins the two cerebral hemispheres.',
    sourceTitle: 'Magnetic Resonance Findings of the Corpus Callosum in Canine and Feline Lysosomal Storage Diseases',
    sourceUrl: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3873931/',
    sourceType: 'peer_reviewed_study', retrievedAt: '2026-08-23',
    laterality: 'bilateral', parentStructure: null, differentials: [],
  },
  {
    canonicalId: 'ANAT-BRAIN-CORPUS-CALLOSUM',
    kind: 'anatomy',
    preferredName: 'Corpus callosum',
    modality: ['MR', 'CT'],
    anatomyTags: ['corpus_callosum', 'white_matter', 'brain'],
    content:
      'The corpus callosum is the largest white-matter structure in the human brain, roughly 10 cm long with ' +
      '200-300 million axonal projections, joining the right and left cerebral hemispheres.',
    sourceTitle: 'Magnetic Resonance Findings of the Corpus Callosum in Canine and Feline Lysosomal Storage Diseases',
    sourceUrl: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3873931/',
    sourceType: 'peer_reviewed_study', retrievedAt: '2026-08-23',
    laterality: 'midline', parentStructure: 'white_matter', differentials: [],
  },
  {
    canonicalId: 'ANAT-BRAIN-HIPPOCAMPUS',
    kind: 'anatomy',
    preferredName: 'Hippocampus',
    modality: ['MR'],
    anatomyTags: ['hippocampus', 'mesial_temporal_lobe', 'brain'],
    content:
      'The hippocampus is a curved structure on the medial temporal lobe, part of the mesial temporal lobe along ' +
      'with the parahippocampal gyrus, uncus, fimbria, dentate gyrus, and amygdala; it plays a central role in ' +
      'memory. Hippocampal sclerosis on MRI shows atrophy, T2/FLAIR signal hyperintensity, and loss of internal ' +
      'architecture, typically unilateral.',
    sourceTitle: 'Imaging Aspects of the Hippocampus',
    sourceUrl: 'https://pubs.rsna.org/doi/full/10.1148/rg.210153',
    sourceType: 'peer_reviewed_review', retrievedAt: '2026-08-23',
    laterality: 'bilateral', parentStructure: 'mesial_temporal_lobe', differentials: [],
  },
  {
    canonicalId: 'ANAT-BRAIN-PITUITARY',
    kind: 'anatomy',
    preferredName: 'Pituitary gland',
    modality: ['MR', 'CT'],
    anatomyTags: ['pituitary', 'brain'],
    content:
      'The pituitary gland sits at the skull base in the sella turcica of the sphenoid bone; the circle of Willis ' +
      'encircles its stalk, and a dural infolding surrounds the gland.',
    sourceTitle: 'A Spectacular Endoscopic Anatomy of the Pituitary Gland and the Circle of Willis in a Living Person',
    sourceUrl: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC6330531/',
    sourceType: 'peer_reviewed_study', retrievedAt: '2026-08-23',
    laterality: 'midline', parentStructure: null, differentials: [],
  },
  {
    canonicalId: 'ANAT-BRAIN-MENINGES',
    kind: 'anatomy',
    preferredName: 'Meninges (dura mater)',
    modality: ['MR', 'CT'],
    anatomyTags: ['meninges', 'dura_mater', 'brain'],
    content:
      'The dura mater is the tough outer meningeal covering enclosing the entire CNS and the major blood vessels ' +
      'entering the cranium and vertebral cavity.',
    sourceTitle: 'A Spectacular Endoscopic Anatomy of the Pituitary Gland and the Circle of Willis in a Living Person',
    sourceUrl: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC6330531/',
    sourceType: 'peer_reviewed_study', retrievedAt: '2026-08-23',
    laterality: null, parentStructure: null, differentials: [],
  },
  {
    canonicalId: 'ANAT-BRAIN-CIRCLE-OF-WILLIS',
    kind: 'anatomy',
    preferredName: 'Circle of Willis',
    modality: ['MR', 'CT'],
    anatomyTags: ['circle_of_willis', 'major_vessels', 'brain'],
    content:
      'The circle of Willis is a ring-like vascular network at the skull base connecting the cerebral arteries, ' +
      'basilar artery, and carotid arteries, supplying blood to the brain; it is one of the most common sites of ' +
      'intracranial aneurysm (~85% in the anterior circulation).',
    sourceTitle: 'Circle of Willis: What It Is, Anatomy, Function & Location',
    sourceUrl: 'https://my.clevelandclinic.org/health/body/circle-of-willis',
    sourceType: 'clinical_reference', retrievedAt: '2026-08-23',
    laterality: 'midline', parentStructure: null, differentials: ['intracranial aneurysm'],
  },
  // P7 — MRI Brain pathology ontology, real content via WebSearch
  // (2026-08-23). Same framing as PATH-BRAIN-VENTRICULAR-ASYMMETRY: general
  // background, not a claim this pipeline currently detects any of these
  // (only ventricular asymmetry and BraTS tumor subregions have real
  // upstream evidence today).
  {
    canonicalId: 'PATH-BRAIN-STROKE',
    kind: 'pathology',
    preferredName: 'Ischemic stroke — MRI findings',
    modality: ['MR'],
    anatomyTags: ['stroke', 'infarction', 'brain'],
    content:
      'DWI is the most sensitive MR sequence for acute stroke, showing restricted diffusion from cytotoxic edema ' +
      'immediately after infarction. Edema increases and peaks at 48-72 hours, producing mass effect and blurring ' +
      'of the gray-white interface; the ischemic area is hypointense on T1 and hyperintense on T2. Petechial or ' +
      'frank hemorrhagic transformation can appear 24-48 hours after onset, more common in large cortical infarcts.',
    sourceTitle: 'Magnetic Resonance Imaging in Acute Stroke',
    sourceUrl: 'https://emedicine.medscape.com/article/1155506-overview',
    sourceType: 'peer_reviewed_review', retrievedAt: '2026-08-23',
    laterality: null, parentStructure: null,
    differentials: ['ischemic infarction', 'hemorrhagic transformation', 'vasogenic edema from another cause'],
  },
  {
    canonicalId: 'PATH-BRAIN-TUMOR-DIFFERENTIAL',
    kind: 'pathology',
    preferredName: 'Brain tumor differential diagnosis — MRI approach',
    modality: ['MR'],
    anatomyTags: ['tumor', 'brain'],
    content:
      'A systematic MRI approach to a brain mass distinguishes intra-axial from extra-axial location, describes ' +
      'mass effect and perilesional vasogenic edema, and separates metastatic disease (typically at the gray-white ' +
      'junction) from deeper infiltrating glioma. Glioblastoma and metastasis can appear similar — central ' +
      'necrosis, ring enhancement, surrounding edema — and are difficult to distinguish on conventional MRI alone. ' +
      'Meningioma is the most common non-glial extra-axial intracranial tumor (~20% of intracranial tumors).',
    sourceTitle: 'The Radiology Assistant: Systematic Approach to Brain Tumors',
    sourceUrl: 'https://radiologyassistant.nl/neuroradiology/brain-tumor/systematic-approach',
    sourceType: 'clinical_reference', retrievedAt: '2026-08-23',
    laterality: null, parentStructure: null,
    differentials: ['glioma', 'metastasis', 'meningioma', 'CNS lymphoma'],
  },
  {
    canonicalId: 'PATH-BRAIN-DEMYELINATION',
    kind: 'pathology',
    preferredName: 'Demyelinating disease (multiple sclerosis) — MRI findings',
    modality: ['MR'],
    anatomyTags: ['demyelination', 'multiple_sclerosis', 'white_matter', 'brain'],
    content:
      'Typical MS MRI findings are T2/FLAIR-hyperintense periventricular and juxtacortical white-matter lesions; ' +
      'FLAIR is highly sensitive for supratentorial lesion detection. Active lesions may enhance after gadolinium, ' +
      'often with a discontinuous ("open-ring") enhancement pattern considered fairly characteristic of MS. Two or ' +
      'more periventricular lesions support an MS diagnosis in the appropriate clinical context.',
    sourceTitle: 'Brain Imaging in Multiple Sclerosis',
    sourceUrl: 'https://emedicine.medscape.com/article/342254-overview',
    sourceType: 'peer_reviewed_review', retrievedAt: '2026-08-23',
    laterality: null, parentStructure: null,
    differentials: ['multiple sclerosis', 'ADEM', 'other inflammatory/demyelinating CNS disease', 'migraine-associated white matter lesions'],
  },
  {
    canonicalId: 'PATH-BRAIN-INFECTION',
    kind: 'pathology',
    preferredName: 'Intracranial infection (abscess / encephalitis / meningitis) — MRI findings',
    modality: ['MR'],
    anatomyTags: ['infection', 'abscess', 'encephalitis', 'meningitis', 'brain'],
    content:
      'Pyogenic brain abscess characteristically shows a centrally T2-hyperintense, ring-enhancing mass with ' +
      'restricted diffusion (bright DWI, dark ADC) — not pathognomonic, but typical. MRI evaluates abscess ' +
      'complications (herniation, hydrocephalus, meningitis, empyema, venous sinus thrombosis, ventriculitis) and ' +
      'meningitis complications (ventriculitis, extra-axial collections, cerebritis, vasculopathy); tuberculous ' +
      'meningitis commonly shows meningeal enhancement, tuberculomas, infarction, and hydrocephalus. Encephalitis ' +
      'MRI features vary widely by causative organism.',
    sourceTitle: 'Imaging of Cerebritis, Encephalitis, and Brain Abscess',
    sourceUrl: 'https://radiologykey.com/imaging-of-cerebritis-encephalitis-and-brain-abscess/',
    sourceType: 'peer_reviewed_review', retrievedAt: '2026-08-23',
    laterality: null, parentStructure: null,
    differentials: ['pyogenic abscess', 'encephalitis', 'meningitis', 'tuberculoma'],
  },
  {
    canonicalId: 'PATH-BRAIN-DEGENERATIVE',
    kind: 'pathology',
    preferredName: 'Neurodegenerative atrophy pattern (Alzheimer / vascular cognitive impairment) — MRI findings',
    modality: ['MR'],
    anatomyTags: ['degenerative', 'atrophy', 'hippocampus', 'brain'],
    content:
      'Hippocampal/medial-temporal atrophy is the most robust MRI marker for Alzheimer disease and amnestic mild ' +
      'cognitive impairment; AD typically originates in the medial temporal lobes and spreads to association ' +
      'cortices, often with left-predominant hippocampal atrophy. Predominantly hippocampal atrophy without ' +
      'anteromesial temporal involvement is more suggestive of vascular disease than AD; MR markers of subcortical ' +
      'vascular cognitive impairment include leukoaraiosis, lacunar infarcts, microbleeds, and ventricular ' +
      'enlargement alongside atrophy.',
    sourceTitle: 'The clinical use of structural MRI in Alzheimer disease',
    sourceUrl: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC2938772/',
    sourceType: 'peer_reviewed_review', retrievedAt: '2026-08-23',
    laterality: null, parentStructure: null,
    differentials: ['Alzheimer disease', 'vascular cognitive impairment', 'other neurodegenerative dementia pattern'],
  },
];

/** Real ontology edges — only relationships directly confirmed by the
 * SEED_ROWS sources above, not inferred/assumed. */
const SEED_RELATIONSHIPS = [
  { parent: 'ANAT-BRAIN-VENTRICULAR-SYSTEM', child: 'ANAT-BRAIN-LATERAL-VENTRICLE', type: 'parent_of' },
  { parent: 'ANAT-BRAIN-VENTRICULAR-SYSTEM', child: 'ANAT-BRAIN-THIRD-VENTRICLE', type: 'parent_of' },
  { parent: 'ANAT-BRAIN-VENTRICULAR-SYSTEM', child: 'ANAT-BRAIN-FOURTH-VENTRICLE', type: 'parent_of' },
  {
    parent: 'ANAT-BRAIN-LATERAL-VENTRICLE', child: 'ANAT-BRAIN-THIRD-VENTRICLE', type: 'communicates_with',
    sourceTitle: 'Ventricles of the Brain: Overview, Gross Anatomy, Microscopic Anatomy',
    sourceUrl: 'https://emedicine.medscape.com/article/1923254-overview',
  },
  {
    parent: 'ANAT-BRAIN-THIRD-VENTRICLE', child: 'ANAT-BRAIN-FOURTH-VENTRICLE', type: 'communicates_with',
    sourceTitle: 'Neuroanatomy, Fourth Ventricle',
    sourceUrl: 'https://www.ncbi.nlm.nih.gov/books/NBK546577/',
  },
  // P6 — the two real parent relationships the new anatomy rows' own
  // parentStructure string fields already claimed but had no graph edge
  // for (found while verifying getAnatomyRelationships against the new
  // rows — the string field and the relational table had silently
  // diverged).
  { parent: 'ANAT-BRAIN-DEEP-GRAY-NUCLEI', child: 'ANAT-BRAIN-THALAMUS', type: 'parent_of' },
  { parent: 'ANAT-BRAIN-DEEP-GRAY-NUCLEI', child: 'ANAT-BRAIN-BASAL-GANGLIA', type: 'parent_of' },
  { parent: 'ANAT-BRAIN-WHITE-MATTER', child: 'ANAT-BRAIN-CORPUS-CALLOSUM', type: 'parent_of' },
];

export async function seedKnowledgeBase() {
  for (const row of SEED_ROWS) {
    const vector = await embed(`${row.preferredName}. ${row.content}`);
    await guardedPool(
      `INSERT INTO imaging_knowledge_base
         (canonical_id, kind, preferred_name, modality, anatomy_tags, content, source_title, source_url, source_type, retrieved_at, embedding, laterality, parent_structure, differentials, generation_safe_summary)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::vector,$12,$13,$14,$15)
       ON CONFLICT (canonical_id) DO UPDATE SET
         preferred_name = EXCLUDED.preferred_name,
         modality = EXCLUDED.modality,
         anatomy_tags = EXCLUDED.anatomy_tags,
         content = EXCLUDED.content,
         source_title = EXCLUDED.source_title,
         source_url = EXCLUDED.source_url,
         source_type = EXCLUDED.source_type,
         retrieved_at = EXCLUDED.retrieved_at,
         embedding = COALESCE(EXCLUDED.embedding, imaging_knowledge_base.embedding),
         laterality = EXCLUDED.laterality,
         parent_structure = EXCLUDED.parent_structure,
         differentials = EXCLUDED.differentials,
         generation_safe_summary = EXCLUDED.generation_safe_summary`,
      [
        row.canonicalId, row.kind, row.preferredName, row.modality, row.anatomyTags,
        row.content, row.sourceTitle, row.sourceUrl, row.sourceType, row.retrievedAt,
        vector ? `[${vector.join(',')}]` : null,
        row.laterality ?? null, row.parentStructure ?? null, row.differentials ?? [],
        row.generationSafeSummary ?? [],
      ],
    );
  }

  for (const rel of SEED_RELATIONSHIPS) {
    await guardedPool(
      `INSERT INTO imaging_anatomy_relationships (parent_canonical_id, child_canonical_id, relationship_type, source_title, source_url)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (parent_canonical_id, child_canonical_id, relationship_type) DO NOTHING`,
      [rel.parent, rel.child, rel.type, rel.sourceTitle ?? null, rel.sourceUrl ?? null],
    );
  }

  return SEED_ROWS.length;
}

/** Exported so imaging-clinical-rules.service.js can read the same
 * differentials this KB stores, instead of maintaining a second copy that
 * could silently drift out of sync. */
export { SEED_ROWS };

/**
 * Ontology traversal (item 3) — real graph query, not a flat string field.
 * Returns the direct parent, children, and communicating structures for one
 * KB entry, each with its own preferred_name (a join, not a second lookup
 * the caller has to do). One hop only — this KB is small enough that a
 * caller needing more than one hop should ask for that explicitly rather
 * than this function silently walking an arbitrary depth.
 */
export async function getAnatomyRelationships(canonicalId) {
  const { rows } = await guardedPool(
    `SELECT r.relationship_type, r.parent_canonical_id, r.child_canonical_id,
            p.preferred_name AS parent_name, c.preferred_name AS child_name
     FROM imaging_anatomy_relationships r
     JOIN imaging_knowledge_base p ON p.canonical_id = r.parent_canonical_id
     JOIN imaging_knowledge_base c ON c.canonical_id = r.child_canonical_id
     WHERE r.parent_canonical_id = $1 OR r.child_canonical_id = $1`,
    [canonicalId],
  );

  const parents = [];
  const children = [];
  const communicatesWith = [];
  for (const r of rows) {
    if (r.relationship_type === 'parent_of') {
      if (r.child_canonical_id === canonicalId) parents.push({ canonical_id: r.parent_canonical_id, preferred_name: r.parent_name });
      else children.push({ canonical_id: r.child_canonical_id, preferred_name: r.child_name });
    } else if (r.relationship_type === 'communicates_with') {
      const other = r.parent_canonical_id === canonicalId
        ? { canonical_id: r.child_canonical_id, preferred_name: r.child_name }
        : { canonical_id: r.parent_canonical_id, preferred_name: r.parent_name };
      communicatesWith.push(other);
    }
  }
  return { parents, children, communicatesWith };
}

/**
 * Tag-match retrieval: given a study's measurements/findings, extract
 * anatomy tags heuristically from structure/lesion names and match against
 * the knowledge base's own anatomy_tags via PostgreSQL array overlap (&&).
 * Deliberately simple — see module docstring for why no embeddings.
 */
export async function retrieveKnowledgeForEvidence({ measurements = [], findings = [] } = {}) {
  // Domain derivation now lives in imaging-knowledge-router.service.js (P4
  // of the roadmap) — a dedicated, inspectable stage, not logic buried
  // inside retrieval. Kept as the single source of truth so this function
  // and hybridRetrieveKnowledge can't silently diverge on what a
  // measurement's tags are.
  const tags = new Set(routeEvidence({ measurements, findings }).knowledgeDomains);
  if (!tags.size) return [];

  const { rows } = await guardedPool(
    `SELECT canonical_id, kind, preferred_name, content, source_title, source_url, source_type, retrieved_at,
            laterality, parent_structure, differentials, generation_safe_summary
     FROM imaging_knowledge_base
     WHERE anatomy_tags && $1::text[]
     ORDER BY kind, preferred_name`,
    [[...tags]],
  );
  return rows;
}

function buildQueryTextFromEvidence(measurements, findings) {
  const parts = [];
  for (const m of [...measurements, ...findings]) {
    const name = String(m.structure || m.lesion || m.label || '').replace(/_/g, ' ').trim();
    if (name && !parts.includes(name)) parts.push(name);
  }
  return parts.join(', ') || 'brain MRI finding';
}

/**
 * Item 7 — hybrid retrieval: metadata tag filter (candidate generation,
 * same as retrieveKnowledgeForEvidence) -> lexical rank (Postgres full-text
 * ts_rank, a real BM25-family score, not a stand-in) + vector similarity
 * (pgvector cosine distance against SIB's ClinicalBERT embeddings) ->
 * deterministic weighted merge -> topK.
 *
 * The merge is an equal-weight average of two [0,1]-normalized signals —
 * an engineering choice, explicitly not a trained/validated reranker model.
 * If SIB's embed() is unreachable, vector_score is null for every row and
 * the merge degrades to lexical-only rather than failing the whole call —
 * matches "RAG unavailable -> don't fabricate, degrade honestly" rather
 * than silently substituting a fake similarity score.
 */
export async function hybridRetrieveKnowledge({ measurements = [], findings = [] } = {}, { topK = 5 } = {}) {
  const tags = new Set(routeEvidence({ measurements, findings }).knowledgeDomains);
  if (!tags.size) return [];

  const queryText = buildQueryTextFromEvidence(measurements, findings);
  const queryVector = await embed(queryText);

  const { rows } = await guardedPool(
    `SELECT canonical_id, kind, preferred_name, content, source_title, source_url, source_type, retrieved_at,
            laterality, parent_structure, differentials, generation_safe_summary,
            ts_rank(content_tsv, plainto_tsquery('english', $2)) AS lexical_score,
            CASE WHEN embedding IS NOT NULL AND $3::vector IS NOT NULL
                 THEN 1 - (embedding <=> $3::vector) ELSE NULL END AS vector_score
     FROM imaging_knowledge_base
     WHERE anatomy_tags && $1::text[]`,
    [[...tags], queryText, queryVector ? `[${queryVector.join(',')}]` : null],
  );
  if (!rows.length) return [];

  const maxLexical = Math.max(...rows.map((r) => Number(r.lexical_score) || 0), 1e-9);
  const scored = rows.map((r) => {
    const lexical = (Number(r.lexical_score) || 0) / maxLexical;
    const vector = r.vector_score != null ? Math.max(0, Math.min(1, Number(r.vector_score))) : null;
    return {
      ...r,
      lexical_score: Math.round(lexical * 1000) / 1000,
      vector_score: vector != null ? Math.round(vector * 1000) / 1000 : null,
      merged_score: Math.round((vector != null ? (lexical + vector) / 2 : lexical) * 1000) / 1000,
    };
  });
  scored.sort((a, b) => b.merged_score - a.merged_score);
  return scored.slice(0, topK);
}

/**
 * Renders retrieved knowledge rows into a prompt block. Explicitly framed
 * as general background, not this patient's data — the LLM is instructed
 * not to restate it as a specific measured value or a normalcy claim about
 * this patient, only to use it for interpretive framing (e.g. "asymmetry
 * of this kind can be a normal variant, but X/Y should be excluded first").
 *
 * "RAG = knowledge, not diagnosis": a row with a curated
 * generation_safe_summary renders ONLY that summary — never its raw
 * `content` or `differentials` — because those two fields are retrieval
 * text, not generation-vetted text, and can contain the very phrases a
 * matched rule's prohibitedInferences forbids (real example: this KB's own
 * ventricular-asymmetry differentials array contains "obstructive
 * hydrocephalus"; showing that string to the LLM primed it to write
 * exactly that phrase into a real report, captured verbatim in
 * imaging-golden-brain-mri-ventricle.test.js). `content`/`differentials`
 * stay intact on the row for retrieval scoring and provenance/audit (see
 * ai_explanation.knowledge_sources) — this function is the only place the
 * distinction is enforced. A row without a curated summary keeps today's
 * raw-content rendering unchanged.
 */
export function formatKnowledgeForPrompt(rows) {
  if (!rows.length) return '';
  const items = rows.map((r) => {
    if (r.generation_safe_summary?.length) {
      return `- [${r.kind}] ${r.preferred_name}: ${r.generation_safe_summary.join(' ')} (Source: ${r.source_title}, ${r.source_url})`;
    }
    const meta = [];
    if (r.laterality) meta.push(`laterality: ${r.laterality}`);
    if (r.parent_structure) meta.push(`part of: ${r.parent_structure.replace(/_/g, ' ')}`);
    if (r.differentials?.length) meta.push(`differentials: ${r.differentials.join(', ')}`);
    const metaStr = meta.length ? ` [${meta.join('; ')}]` : '';
    return `- [${r.kind}] ${r.preferred_name}${metaStr}: ${r.content} (Source: ${r.source_title}, ${r.source_url})`;
  }).join('\n');
  return (
    `\nREFERENCE KNOWLEDGE (general background only — NOT this patient's data; do not restate as a ` +
    `patient-specific normal/abnormal claim, do not cite as an institutional norm, use only to frame how ` +
    `to describe the finding and what to recommend correlating against):\n${items}\n`
  );
}
