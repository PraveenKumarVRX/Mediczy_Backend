# Copilot Prompt Templates

## 1) UI Facelift

Redesign this page into a modern SaaS UI.

Requirements:
- keep backend logic unchanged
- use Tailwind CSS
- keep layout responsive
- convert repeated UI into reusable components
- include loading, error, and empty states

## 2) Feature Build (Safe)

Implement this feature in a production-safe way.

Rules:
- do not break existing APIs
- preserve current business logic
- keep architecture modular
- add robust error handling
- include test considerations and regression risks

## 3) Refactor (No Behavior Change)

Refactor this code for maintainability without changing behavior.

Focus on:
- reducing duplication
- improving structure and naming
- simplifying complex logic
- preserving existing functionality exactly

## 4) Bug Fix (Minimal Patch)

Fix this issue without changing unrelated logic.

Ensure:
- root cause analysis first
- minimal safe patch
- no regression introduced
- include verification steps

## 5) API Integration

Connect this UI to existing backend APIs without changing endpoint contracts.

Requirements:
- preserve API request/response shapes
- handle loading, error, empty, and retry states
- avoid duplicate network calls
- keep data mapping explicit and typed where possible

## 6) Release Readiness

Run a release-readiness check for this change.

Include:
- functional risks
- regression risks
- deployment dependencies
- rollback plan
- final go/no-go recommendation

## 7) Architecture Review

Review this implementation as Principal Engineer + Tech Lead.

Return:
- architecture strengths
- scalability risks
- maintainability risks
- concrete improvement actions in priority order

## 8) Full Pipeline

Use full-cycle execution for this request:
- PM -> BA -> Market -> Product -> Arch -> UX -> UI -> Backend -> Frontend -> QA -> DevOps -> Ship

Deliver:
- phase-by-phase output
- decisions and trade-offs
- implementation and validation plan
