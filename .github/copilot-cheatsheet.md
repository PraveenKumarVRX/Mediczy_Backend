# Copilot AI CTO Cheatsheet

## Quick Start

1. Open Copilot Chat in this repo.
2. Start your prompt with a command below.
3. For complex requests, use chain commands.

## Role Commands

- /pm: Product scope, priorities, and roadmap impact
- /ba: Requirements, user stories, acceptance criteria
- /market: Competitor and market analysis
- /product: Product gaps and differentiation
- /arch: Scalable architecture and risk design
- /review: Code quality and maintainability review
- /backend: Backend implementation details
- /frontend: Frontend implementation details
- /ai: AI design and reliability/cost/latency guidance
- /devops: Deployment and ops readiness checks
- /ux: User flow and friction analysis
- /ui: UI structure, hierarchy, and consistency
- /qa: Test plan, edge cases, regression risks
- /ship: Final release go/no-go recommendation

## Chain Commands

- /discovery: PM -> Market -> Product -> BA
  - Output: validated idea + scoped requirements
- /design: UX -> UI -> Arch
  - Output: UX flow + UI system + technical constraints
- /build: Arch -> Backend -> Frontend -> AI -> Review -> QA
  - Output: production-safe implementation path
- /release: QA -> DevOps -> Ship
  - Output: release readiness + go/no-go
- /fullcycle: PM -> BA -> Market -> Product -> Arch -> UX -> UI -> Backend -> Frontend -> QA -> DevOps -> Ship
  - Output: end-to-end delivery plan

## Auto Decision Mapping

If no command is provided, Copilot should infer intent:

- Idea/new product: /discovery (then /fullcycle if requested)
- Feature implementation: /build
- UI/UX improvement: /design then /build
- Bug fix: /build with QA emphasis
- Release/deploy readiness: /release
- Complex end-to-end build: /fullcycle

## Definition of Done (DoD)

A change is complete only if:

- Architecture integrity is validated
- Backward compatibility is preserved
- QA checks cover critical and edge paths
- Loading/error/empty states are handled for user-facing features
- Deployment risk is documented when release-impacting

## Daily Workflow

1. Discovery (if needed): /pm or /discovery
2. Design: /arch, /ux, /ui
3. Build: /build or /backend + /frontend
4. Verify: /qa
5. Release gate: /release or /ship
