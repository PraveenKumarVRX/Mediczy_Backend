/**
 * Claim Fact Checker (P9 of CLINICAL_AI_PLATFORM_V1_IMPLEMENTATION_ROADMAP.md)
 * — the exact pipeline the roadmap names:
 *
 *   generated report -> extract claims -> match against Clinical Claims
 *   -> compare measurements -> check laterality -> PASS / REVISE / BLOCK
 *
 * Distinct from the existing pattern-matching QA gates
 * (ai-quality-gates.service.js): those check "does the evidence support
 * this text existing at all" (grounding, self-contradiction, prohibited
 * inference). This checks something more precise those gates don't cover —
 * "does the report's number/side for a specific subject actually match
 * what P3's atomic clinical claims say" — the master architecture doc's
 * own worked example (§33): evidence says right kidney 12mm, report says
 * "left kidney lesion measuring 15mm" -> LATERALITY_MISMATCH +
 * MEASUREMENT_MISMATCH -> BLOCK. Verified gap: _gateMeasurementConsistency
 * only reads evidenceItems (size_mm), never evidenceMeasurements (the
 * left_X/right_X structures P3's claims are built from), and neither gate
 * does side-swap detection at all.
 *
 * Reads real, persisted imaging_clinical_claims rows (P3) as ground truth
 * — not the raw findings again — so this genuinely checks "what was
 * asserted as fact" against "what the report says", the two ends of the
 * roadmap's own claim-verification pipeline.
 */

const NUMBER_MENTION = /(\d+(?:\.\d+)?)\s*(mm3|mm|cm3|cm)\b/gi;
const SIDE_WORD = /\b(left|right)\b/gi;
// Real, observed sentence-splitting bug: "right=3977.9mm3 vs. left=641.2mm3"
// — a normal, correct way to state a bilateral pair together — has its own
// period after "vs" misread as a sentence end, truncating the sentence
// before the second (left) value ever appears in it. "vs." is common
// enough in comparative radiology phrasing to fix directly rather than
// leave every paired-measurement sentence at risk of the same split.
function findSentence(lowerText, idx) {
  const SENTENCE_END = /(?<!\bvs)[.!?](?:\s|$)/g;
  let sentenceStart = 0;
  let sentenceEnd = lowerText.length;
  SENTENCE_END.lastIndex = 0;
  let match;
  while ((match = SENTENCE_END.exec(lowerText))) {
    const boundary = match.index + 1;
    if (boundary <= idx) sentenceStart = boundary;
    else { sentenceEnd = boundary; break; }
  }
  return lowerText.slice(sentenceStart, sentenceEnd);
}

function checkLaterality(subject, sentence) {
  const claimedSide = subject.startsWith('left_') ? 'left' : subject.startsWith('right_') ? 'right' : null;
  if (!claimedSide) return null;
  const oppositeSide = claimedSide === 'left' ? 'right' : 'left';
  const hasClaimed = new RegExp(`\\b${claimedSide}\\b`, 'i').test(sentence);
  const hasOpposite = new RegExp(`\\b${oppositeSide}\\b`, 'i').test(sentence);
  if (hasOpposite && !hasClaimed) return { mismatch: true, claimedSide, foundSide: oppositeSide };
  return { mismatch: false };
}

// A single sentence correctly stating a bilateral pair together — "right=
// 3977.9mm3 vs. left=641.2mm3" — contains two real numbers, one per side.
// The old check ("does ANY number in the sentence match the claim") can't
// tell them apart and false-positives on exactly this good writing
// pattern (real, observed case: study 11's left-ventricle claim compared
// against the right-ventricle's number in the same sentence). Fix is
// structure/laterality-aware, not a sentence-boundary patch: attribute
// each number to the nearest "left"/"right" word — checked in EITHER
// direction, since natural phrasing puts the qualifier before the value
// ("the right kidney measures 8mm") just as often as after it ("8mm on
// the right side") — but a CLAUSE_BOUNDARY between the number and a
// candidate side word blocks that candidate outright. Without that,
// "the left kidney measures 12mm vs. the right kidney measures 8mm" wrongly
// attributes 12mm to "right", because "right" simply sits fewer characters
// away than "left" once "vs. the " is counted — nearest-by-raw-distance
// alone can't tell that "vs." separates two different clauses. Both real
// bugs were found the same way: by running the actual pipeline against
// real study-11 evidence and reading what it produced, not by inspection.
const CLAUSE_BOUNDARY = /,|;| vs\.?\s| versus\s/gi;

function extractSidedNumbers(sentence) {
  const sideMatches = [];
  let sm;
  SIDE_WORD.lastIndex = 0;
  while ((sm = SIDE_WORD.exec(sentence))) sideMatches.push({ side: sm[0].toLowerCase(), index: sm.index });

  const boundaries = [];
  let bm;
  CLAUSE_BOUNDARY.lastIndex = 0;
  while ((bm = CLAUSE_BOUNDARY.exec(sentence))) boundaries.push(bm.index);
  const crossesBoundary = (a, b) => boundaries.some((idx) => idx > Math.min(a, b) && idx < Math.max(a, b));

  const results = [];
  let nm;
  NUMBER_MENTION.lastIndex = 0;
  while ((nm = NUMBER_MENTION.exec(sentence))) {
    let nearestSide = null;
    let nearestDist = Infinity;
    for (const s of sideMatches) {
      if (crossesBoundary(s.index, nm.index)) continue;
      const dist = Math.abs(s.index - nm.index);
      if (dist < nearestDist) { nearestDist = dist; nearestSide = s.side; }
    }
    results.push({ value: parseFloat(nm[1]), side: nearestSide });
  }
  return results;
}

function checkMeasurement(claim, sentence, claimedSide) {
  const sided = extractSidedNumbers(sentence);
  if (!sided.length) return null; // no number in this sentence to check — not a mismatch, just nothing to compare
  const claimedValue = Number(claim.object_value ?? claim.object?.value);
  const closeEnough = (n) => Math.abs(n - claimedValue) < 0.05 * Math.max(claimedValue, 1);

  if (claimedSide) {
    const ownSide = sided.filter((s) => s.side === claimedSide);
    if (ownSide.length) {
      const matchesAny = ownSide.some((s) => closeEnough(s.value));
      return { mismatch: !matchesAny, foundNumbers: ownSide.map((s) => s.value), claimedValue };
    }
  }

  // Unlateralized subject, or no number sat close enough to a side word to
  // attribute — fall back to the original "any number in the sentence"
  // check rather than silently passing with nothing to compare against.
  const allNumbers = sided.map((s) => s.value);
  const matchesAny = allNumbers.some(closeEnough);
  return { mismatch: !matchesAny, foundNumbers: allNumbers, claimedValue };
}

/**
 * Runs the fact-check pipeline. `claims` are P3's real persisted atomic
 * claims (imaging-clinical-claims.service.js), `draftText` is the report
 * being verified. Returns PASS or BLOCK — no REVISE state today (that
 * needs a human-editable revision loop this pipeline doesn't have yet);
 * treat any real mismatch as a hard stop, not a soft warning, matching the
 * master doc's own worked example ending in BLOCK.
 */
export function checkClaimsAgainstReport(draftText, claims) {
  const lowerText = String(draftText || '').toLowerCase();
  const issues = [];

  for (const claim of claims) {
    const subject = String(claim.subject || '').toLowerCase();
    const words = subject.replace(/_/g, ' ').split(/\s+/).filter((w) => w.length > 3);
    const anchor = words[words.length - 1] || subject;
    const claimedSide = subject.startsWith('left_') ? 'left' : subject.startsWith('right_') ? 'right' : null;

    // A shared anchor word ("ventricle") can appear in multiple sentences,
    // one per side — indexOf() alone always finds the FIRST occurrence
    // regardless of which claim is being checked, so a right-side claim
    // could get compared against a left-side sentence. Found by testing
    // two claims sharing an anchor in the same draft: scan every
    // occurrence and prefer the one whose own sentence also names this
    // claim's side; fall back to the first occurrence only when no
    // side-matching sentence exists (or the subject isn't lateralized).
    let sentence = null;
    if (claimedSide) {
      let searchFrom = 0;
      while (true) {
        const idx = lowerText.indexOf(anchor, searchFrom);
        if (idx === -1) break;
        const candidate = findSentence(lowerText, idx);
        if (new RegExp(`\\b${claimedSide}\\b`, 'i').test(candidate)) {
          sentence = candidate;
          break;
        }
        searchFrom = idx + anchor.length;
      }
    }
    if (sentence == null) {
      const idx = lowerText.indexOf(anchor);
      if (idx === -1) continue; // unmentioned — imaging-quality-gates.service.js's evidence-coverage gate already catches this
      sentence = findSentence(lowerText, idx);
    }

    const laterality = checkLaterality(subject, sentence);
    if (laterality?.mismatch) {
      issues.push({
        code: 'LATERALITY_MISMATCH',
        claim_id: claim.claim_id,
        message: `Claim "${claim.subject}" is ${laterality.claimedSide}, but the report's sentence about it says "${laterality.foundSide}"`,
      });
    }

    const measurement = checkMeasurement(claim, sentence, claimedSide);
    if (measurement?.mismatch) {
      issues.push({
        code: 'MEASUREMENT_MISMATCH',
        claim_id: claim.claim_id,
        message: `Claim "${claim.subject}" is ${measurement.claimedValue}, but the report states ${measurement.foundNumbers.join('/')} in that sentence`,
      });
    }
  }

  return { status: issues.length ? 'BLOCK' : 'PASS', issues };
}
