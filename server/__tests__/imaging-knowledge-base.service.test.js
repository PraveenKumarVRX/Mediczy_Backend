/**
 * RAG generation-context gating: "RAG = knowledge, not diagnosis." A KB
 * row's raw `content`/`differentials` are retrieval/provenance text and
 * may legitimately contain a prohibited term (this row's own differentials
 * literally include "obstructive hydrocephalus") — that's fine for
 * scoring and audit, but never for the generation prompt. This is the hard
 * invariant the CTO review asked for: assert against the real KB content
 * BEFORE the LLM ever sees it, not just against the LLM's output afterward.
 */
import { SEED_ROWS, formatKnowledgeForPrompt } from '../services/imaging/imaging-knowledge-base.service.js';
import { RULES } from '../services/imaging/imaging-clinical-rules.service.js';

function asDbRow(seedRow) {
  // Real DB columns are snake_case — formatKnowledgeForPrompt consumes rows
  // in that shape. Mapping the real SEED_ROWS entry, not a synthetic fixture.
  return {
    kind: seedRow.kind,
    preferred_name: seedRow.preferredName,
    content: seedRow.content,
    source_title: seedRow.sourceTitle,
    source_url: seedRow.sourceUrl,
    laterality: seedRow.laterality,
    parent_structure: seedRow.parentStructure,
    differentials: seedRow.differentials,
    generation_safe_summary: seedRow.generationSafeSummary,
  };
}

// Every (ruleId, KB canonicalId) pair this pipeline has real coverage for —
// looped so a future third pathway gets the same hard invariant for free
// just by adding a row here, rather than a copy-pasted test.
const COVERED_PATHWAYS = [
  { ruleId: 'MRI-BRAIN-VENT-001', canonicalId: 'PATH-BRAIN-VENTRICULAR-ASYMMETRY' },
  { ruleId: 'MRI-BRAIN-TUMOR-001', canonicalId: 'PATH-BRAIN-TUMOR-BRATS-SUBREGIONS' },
];

describe('imaging-knowledge-base.service — RAG generation-context gating', () => {
  describe.each(COVERED_PATHWAYS)('$ruleId / $canonicalId', ({ ruleId, canonicalId }) => {
    test('the real KB row has a curated generation-safe summary', () => {
      const row = SEED_ROWS.find((r) => r.canonicalId === canonicalId);
      expect(row.generationSafeSummary?.length).toBeGreaterThan(0);
    });

    test("HARD INVARIANT: no prohibitedInferences term reaches the real generation prompt for this row — checked against the prompt text itself, not the LLM's output", () => {
      const rule = RULES.find((r) => r.id === ruleId);
      const kbRow = SEED_ROWS.find((r) => r.canonicalId === canonicalId);
      const promptText = formatKnowledgeForPrompt([asDbRow(kbRow)]);
      for (const term of rule.prohibitedInferences) {
        expect(promptText.toLowerCase()).not.toContain(term.toLowerCase());
      }
    });

    test('the raw content/differentials are untouched on the row for retrieval and provenance — nothing was deleted, only excluded from the generation prompt', () => {
      const kbRow = SEED_ROWS.find((r) => r.canonicalId === canonicalId);
      expect(kbRow.content.length).toBeGreaterThan(0);
      expect(kbRow.differentials.length).toBeGreaterThan(0);
    });
  });

  test('sanity check: the ventricular row\'s raw differentials really do contain a prohibited term — proves the invariant above is testing a real risk, not a vacuous one', () => {
    const kbRow = SEED_ROWS.find((r) => r.canonicalId === 'PATH-BRAIN-VENTRICULAR-ASYMMETRY');
    expect(kbRow.differentials.join(' ').toLowerCase()).toContain('hydrocephalus');
  });

  test('sanity check: the tumor row\'s raw differentials name specific tumor types the generation-safe summary must not repeat — a different risk shape than the literal prohibitedInferences words, same over-claim category', () => {
    const kbRow = SEED_ROWS.find((r) => r.canonicalId === 'PATH-BRAIN-TUMOR-BRATS-SUBREGIONS');
    expect(kbRow.differentials).toEqual(expect.arrayContaining(['glioma', 'meningioma']));
    const promptText = formatKnowledgeForPrompt([asDbRow(kbRow)]);
    expect(promptText).not.toMatch(/glioma|metastasis|meningioma|lymphoma/i);
  });

  test('a row WITHOUT a curated summary keeps rendering raw content unchanged — no regression for the rows nobody has reviewed yet', () => {
    const row = {
      kind: 'pathology',
      preferred_name: 'Uncurated finding',
      content: 'raw retrieval text here',
      source_title: 'T',
      source_url: 'U',
      differentials: ['some differential'],
    };
    const text = formatKnowledgeForPrompt([row]);
    expect(text).toContain('raw retrieval text here');
    expect(text).toContain('differentials: some differential');
  });
});
