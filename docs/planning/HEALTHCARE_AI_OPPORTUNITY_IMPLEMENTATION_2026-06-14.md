# Healthcare AI Opportunity Implementation - 2026-06-14

## Research basis

This implementation follows four current guidance anchors:

- WHO, "Ethics and governance of artificial intelligence for health: Guidance on large multi-modal models" (25 March 2025): health LMMs need governance, privacy controls, risk management, and human oversight.
- NIST AI Risk Management Framework: AI systems should be governed, mapped, measured, and managed before scale-up.
- HHS/ONC HTI-1 final rule (effective 8 February 2024): predictive decision support needs source attributes, risk management, governance, and maintenance documentation.
- FDA Clinical Decision Support Software guidance (January 2026): clinician-facing CDS should preserve independent review of the basis for recommendations.

## Implemented first

### Documentation & Charting

Endpoint:

```http
POST /api/doctor/clinical-workflow/notes/draft-from-transcript
```

Behavior:

- Converts consultation transcript or rough notes into draft SOAP fields.
- Can optionally persist the generated content as a draft clinical note with `persist=true`.
- Keeps signed-note immutability unchanged.
- Returns governance metadata, provider/model provenance, and fallback reason when LLM providers are unavailable.

### Revenue Cycle & Claims

Endpoint:

```http
POST /api/doctor/revenue/claim-documentation-review
```

Behavior:

- Reviews claim documentation completeness.
- Flags missing documents, denial-risk signals, and reviewer checklist items.
- Does not approve, deny, adjudicate, or submit claims.

### Patient Engagement

Endpoint:

```http
POST /api/doctor/engagement/draft-instructions
```

Behavior:

- Drafts patient-friendly post-visit instructions from doctor-supplied plan data.
- Includes warning signs and follow-up text.
- Uses the existing engagement send route only after doctor review.

## Governance dashboard

Endpoint:

```http
GET /api/ai-governance/opportunity-matrix
```

Behavior:

- Exposes the healthcare AI opportunity matrix through the existing authenticated AI governance surface.
- Separates `implement_first`, `build_next`, `quick_wins`, and `deprioritize`.
- Lists guardrails and current implementation state for each AI use case.

## Safety posture

- All new generation endpoints are assistive drafts.
- Human review is required.
- No autonomous diagnosis, imaging interpretation, claim adjudication, or patient communication is introduced.
- LLM calls use JSON mode and deterministic fallbacks so workflow endpoints still return useful, safe output when providers are unavailable.
- Clinical and billing recommendations must show a basis and stay editable before final action.

## Build-next gates

Clinical decision support, diagnostics/imaging, and population health intelligence should not be promoted beyond assistive mode until each capability has:

- Source attributes and model cards.
- Risk analysis and mitigation records.
- Clinician-facing basis/explanation.
- Feedback capture.
- Fairness and drift review.
- Prospective validation on local workflows.
