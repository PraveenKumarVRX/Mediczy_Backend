# SaMD clinical-evaluation gate — temporary owner waiver

**Date:** 2026-11-04 · **Decision by:** platform owner (explicit instruction: "turn off SaMD for now")

## Decision
The **Medical-Director clinical-evaluation gate** for the Dr. iSHA / medical-AI chatbot is
**temporarily waived** so the feature can ship without MD-supplied evaluation datasets/thresholds.
This overrides the SaMD governance requirement in `CLAUDE.md` **for this initial release only**.

## What this does and does NOT change

**Waived (off):**
- `server/scripts/qa/chatbot-release-gate.mjs` now passes when `SAMD_CLINICAL_GATE_WAIVED=true`,
  bypassing the Medical-Director approval DB check (with a loud warning + `mdApproval: "WAIVED"`).

**NOT changed — runtime safety stays ON:**
- Session **ownership**, **consent gating**, and auth on admin/team routes (Codex hardening).
- Removal of the unfiltered LLM fallback; emergency-flag precedence; abstention on missing evidence.
- Quality gates / LIME on the **emergency-triage (ESI)** path are untouched.
- No clinical write path, booking validation, or identity rule is relaxed.

## Important facts (verified 2026-11-04)
- The clinical-eval gate was **never enforced at runtime or at deploy** — it is a manual CLI check.
  The chatbot already serves without MD approval; this waiver just makes the CLI gate pass
  explicitly and records the decision. No runtime behaviour changes from the flag.

## Conditions
- **Not for clinical reliance.** The product must present chat as patient education / navigation,
  not physician-level diagnosis or prescribing, while this waiver is in effect.
- **Reinstate before clinical reliance:** unset `SAMD_CLINICAL_GATE_WAIVED` (or set false) and
  complete the gate with a Medical-Director-approved dataset, labels, thresholds and reviewed
  outcomes (`docs/ai/evaluation/CHATBOT_RELEASE_POLICY_TEMPLATE.json`).
- This waiver is time-boxed to the initial release and should be reviewed by the medical director
  at the earliest opportunity.

## To activate
Set in prod env: `SAMD_CLINICAL_GATE_WAIVED=true`. (No code deploy needed for the waiver itself;
the flag is read by the release-gate script.)
