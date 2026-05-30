# User Dashboard Worldclass UX Audit

Date: 2026-05-28
Owner: AI CTO Team, UX Research, UI Design
Scope: All patient/user dashboard pages shown in sidebar navigation.

## Audit Rubric
- Information Clarity: labels, hierarchy, terminology
- Task Friction: steps to complete top workflows
- Trust Signals: transparency, safety messaging, status truthfulness
- Visual Craft: spacing rhythm, type scale, contrast, polish
- Mobile Quality: thumb targets, responsive flow, readable density

Scoring: 0-100
- 90-100: Worldclass
- 75-89: Good
- <75: Needs Work

## Route-by-Route Audit

| Category | Route | Page | UX Score | Tier | Notes |
|---|---|---|---:|---|---|
| Main | / | Dashboard | 84 | Good | Strong summary blocks; needs denser action grouping for frequent tasks. |
| Main | /profile | My Profile | 80 | Good | Good data grouping; can improve completion-state guidance. |
| Main | /patient/notifications | Notifications | 82 | Good | Readable stream; add stronger urgency sorting defaults. |
| Health | /health-dashboard | Health Dashboard | 83 | Good | Useful trends; improve narrative explanations for anomalies. |
| Health | /health-intelligence | Health Intelligence | 81 | Good | Insightful cards; improve confidence/uncertainty communication. |
| Health | /sib-control | SIB Control | 72 | Needs Work | High complexity; requires role-focused simplification and guardrails UI. |
| Health | /health-diary | Health Diary | 79 | Good | Good journaling base; needs stronger habit loops and prompts. |
| Health | /health-risk-assessment | Health Risk Assessment | 82 | Good | Clarity is solid; add stronger action-plan prioritization. |
| Health | /wellness-rewards | Wellness & Rewards | 78 | Good | Reward logic visible; improve challenge onboarding. |
| Health | /wellness-calendar | Wellness Calendar | 77 | Good | Scheduling works; add weekly objective framing. |
| Health | /diet | Diet Plans | 79 | Good | Plan display good; improve substitution and affordability UX. |
| Health | /ai-doctor | AI Doctor | 80 | Good | Interaction strong; improve safe handoff moments. |
| Health | /patient/watch-analytics | Watch Analytics | 81 | Good | Trends are useful; improve threshold explanations. |
| Appointments | /appointments | My Appointments | 85 | Good | Strong utility; improve filter presets by urgency. |
| Appointments | /doctors | Find & Book Doctor | 86 | Good | Strong filters/cards; continue improving social proof consistency. |
| Appointments | /my-prescriptions | My Prescriptions | 80 | Good | Good readability; add adherence timeline cues. |
| Records | /patient/lab-tests | Lab Tests | 83 | Good | Booking flow improved; add slot confidence indicators. |
| Records | /patient/my-reports | My Reports | 82 | Good | Archive usable; add report compare mode. |
| Records | /reposts | Scan & Share Reports | 78 | Good | Works well; improve OCR quality feedback messaging. |
| Services | /ayushman | Ayushman | 74 | Needs Work | Benefit complexity high; needs guided wizard model. |
| Services | /health-feed | Health Feed | 77 | Good | Content discoverable; improve personalization controls. |
| Services | /emergency | Emergency | 84 | Good | Trust messaging improved; continue with location confidence indicators. |
| Finance | /wallet | Wallet | 88 | Good | Offers and coupon flows are strong; add value-projection insights. |
| Finance | /my-plans | Membership Plans | 84 | Good | Better status clarity; improve compare table accessibility. |
| Finance | /membership-card | My Membership Card | 79 | Good | Functional; improve offline retrieval cues. |
| Finance | /benefits | Smart Benefits | 80 | Good | Discoverability good; improve eligibility explanation microcopy. |
| Finance | /claims-express | Claims Express | 81 | Good | Faster flow; add progress certainty messaging. |
| Finance | /billing/orders | Order History | 82 | Good | Clear statuses; improve reorder intelligence. |
| Finance | /billing/invoices | My Invoices | 82 | Good | Good structure; add quick exports by date range. |
| Finance | /my-insurance | My Insurance | 80 | Good | Good policy overview; improve deductible narratives. |
| Family | /family-hub | Family Health Hub | 79 | Good | Useful concept; add household-level urgency badges. |
| Support | /help | Help & Support | 80 | Good | Strong base; improve guided troubleshooting paths. |
| Support | /contact-us | Contact Us | 78 | Good | Multi-channel ready; add expected response time hints. |

## Implemented in this pass
- Global premium typography update to Plus Jakarta Sans.
- New reusable worldclass panel surface with stronger hierarchy and depth.
- Route-aware UX context strip added to all user dashboard pages under main layout:
  - category
  - page title and intent subtitle
  - UX tier and UX score chips
- Introduced centralized route meta source for consistent page framing.

## Priority Next Upgrades (to reach 90+)
1. Convert all Needs Work pages into guided stepper flows (SIB Control, Ayushman).
2. Add cross-page command center shortcuts for top 5 frequent tasks.
3. Add a consistent empty/error/loading states library and migrate all user pages.
4. Introduce an accessibility pass: contrast, focus order, screen-reader labels, keyboard shortcuts.
5. Add journey telemetry on key interactions (search, filter, booking completion, claims completion).
