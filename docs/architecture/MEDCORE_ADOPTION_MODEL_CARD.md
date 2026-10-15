# Mediqzy clean-room clinical AI model card

**Scope:** WS-1 multilingual emergency triage and WS-4 prescription-safety sign-off in the
`/api/medcore-adoption` boundary. WS-7 Lab Explainer is a documentation draft and is subject to the
same clinician approval gate before patient delivery.

## Intended use

The services assist a trained clinician or support agent with prioritisation, specialty routing,
interaction review and plain-language draft preparation. They do not diagnose, prescribe, or replace
emergency services. A high-acuity result opens a human handoff; it is never silently resolved by the
automation.

## Safety controls

- High-risk multilingual phrases are normalized by a local deterministic layer before any LLM call.
- Contraindicated drug findings block prescription sign-off until an authenticated actor records a
  reasoned acknowledgement; every attempt is written to `drug_safety_signoffs`.
- Lab explanations remain `pending` until a doctor or medical director approves them.
- Gold fixtures run in CI and are recorded in `ai_gold_eval_runs` when governance storage is enabled.
- The `MEDCORE_ADOPTION_ENABLED` gate is opt-in; only the explicit value `true` exposes the new surface.

## Evaluation contract

The initial mediqzy-authored suite checks Hindi cardiac and respiratory red flags, a deterministic
contraindicated pair and SOAP completeness. The suite is a regression gate, not a clinical validation
claim. Production rollout requires a representative, independently sourced validation set, sensitivity
and specificity targets agreed by the medical director, language review, and incident monitoring.

## Known limitations

Phrase coverage is intentionally narrow and should not be treated as full translation. LLM findings
are advisory and may be unavailable. Forecasts require dated stock history and return an explicit
unavailable result when history is too short. Notification delivery depends on the configured provider;
the scheduler records failed delivery rather than reporting success. Approved lab explanations are
delivered only through the explicit, audited delivery endpoint.

## Required approvals before production enablement

- [ ] Medical director clinical review and validation evidence.
- [ ] SaMD/QMS risk classification, model-card review and quality-gate sign-off.
- [ ] Privacy/security review for transcript, report and medication data.
- [ ] Counsel review confirming clean-room provenance and any MedCore licensing decision.
