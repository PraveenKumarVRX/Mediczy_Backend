# Mediqzy team portal: UI, UX, branding and navigation micro-audit

**Audit date:** 9 November 2026 (IST)  
**Target:** https://ap.mediqzy.com/team/login  
**Method:** authenticated production browser inspection, responsive screenshots, DOM geometry and computed styles, and corroborating local React source review.  
**Deliverable:** research and design recommendations; no application changes or deployment.

## 1. Executive finding

The portal has a recognizable dark workspace shell, consistent rounded components and useful operational modules, but its information architecture and communication surfaces are fragmented. The principal problem is task visibility: staff must search through a long module list and decorative dashboard cards to find daily work. Communication appears as several competing destinations without a clear distinction between customer messaging, internal team chat, case management and channel administration.

**Recommended direction:** retain Mediqzy’s identity, simplify the visual system, introduce task-based sidebar headers, replace the dashboard’s link catalogue with a role-specific work queue, and establish a Mediqzy-native customer inbox with channel filters. Keep tickets as linked cases and internal chat as a clearly separate purpose. Resolve the existing Chatwoot launcher against the approved customer-care direction before presenting it as the default inbox.

Fix visibility, misleading metrics and mobile clipping before spending effort on a wholesale visual redesign.

### Highest-priority findings

| ID | Priority | Confirmed finding | Consequence |
|---|---|---|---|
| UX-01 | P1 | 23 sidebar links appear before the Communication header; Chat begins at approximately y=1037 on the initial 1440×900 screen. | Daily communication tasks are hidden below the sidebar fold. |
| UX-02 | P1 | WhatsApp retains two narrow columns at 390px; the list is about one third of the available content width and controls are clipped. | Staff cannot comfortably search, identify or work conversations on mobile. |
| UX-03 | P1 | Staff screens display the patient-oriented mobile bottom navigation. | Wrong-context destinations compete with team navigation and the floating chat button. |
| UX-04 | P1 | Dark-mode chat header uses near-white text on a white background. | Conversation identity and action icons become almost invisible. |
| UX-05 | P1 | Chat Analytics displays hardcoded operational figures. Legacy Chat also contains fallback statistics. | Demonstration figures can be mistaken for current service performance. |
| UX-06 | P1 | Login overflows horizontally at every sampled width; the back link is above the visible top at 1366×768. | Avoidable scrolling and obscured navigation at entry. |
| UX-07 | P1 | Native Chat, standalone WhatsApp, Social Inbox, email, tickets, Chatwoot launcher and floating chat overlap in purpose or entry points. | Users cannot reliably predict where a customer interaction belongs. |
| UX-08 | P1 | The mobile navigation drawer stays open after Escape and focus remains on the toggle when opened. | Keyboard navigation and dismissal are weak. |
| UX-09 | P2 | Several apparent actions have no source handler, including WhatsApp icon actions and the Chat Analytics “View Reports” control. | Controls suggest capabilities that are not implemented. |

P1 = address in the next corrective release because core work, trust or access is materially affected. P2 = important workflow/design improvement. P3 = refinement. These are UX priorities, not security incident ratings.

## 2. Coverage, evidence and limits

Authenticated using the supplied team account, which presented a Corporate Manager role with 16 listed permissions. Inspected **36 unique team routes**, including four intentionally restricted destinations. At 1440×900, inspected all 27 sidebar destinations visible to this account plus dashboard-only or related routes. Repeated dashboard, Chat, WhatsApp and Corporate Management at 1366×768, 1024×768 and 390×844. Inspected login at 1440×900, 1366×768 and 390×844. Tested sidebar scrolling and mobile drawer Escape dismissal.

Coverage includes Dashboard, Copilot, AI Workbench, Directory, Team Members, Doctors, Fitness Certificates, Corporate Management, Corporate Employees, Provider Network, Brokers, Corporate Health Booking, User Plan Customization, Hospitals, Clinics, Labs, Appointments, Support Tickets, Pharmacies, Health Plans, Plan Governance, Activity Logs, Chat, Email, Social Inbox, Omnichannel, WhatsApp, WhatsApp Templates, Chat Analytics, Reports, Profile and Corporate Health Packages. Orders & Revenue, Settings, RFQs and System Tools displayed permission restrictions.

This is a comprehensive primary-surface heuristic audit, **not a claim that every dialog, record, permission variant or transactional flow was tested**. No messages, reminders, broadcasts, edits, bookings, publishing actions or clinical requests were submitted. Login/session establishment and normal page-load requests occurred; incidental backend effects of reads were not independently traced. The external Chatwoot application was not entered. Restricted screens were not bypassed. Activity Logs was still loading in the sampled capture, so its final content remains unverified. Long lists were assessed from their initial loaded state, not all records.

Production screenshots and local source agree on the cited patterns, but the local checkout was not proven to match the deployed commit. Source-confirmed implementation details are identified separately where relevant. No usability interviews, conversion analytics or measured task-time baseline were available; proposed benefits are hypotheses to validate.

Evidence package: [sanitized measurements](team-portal-ux-2026-11-09/measurements.json), [desktop login](team-portal-ux-2026-11-09/login-1440.png), [short laptop login](team-portal-ux-2026-11-09/login-1366.png), [mobile login](team-portal-ux-2026-11-09/login-390.png), [mobile Chat](team-portal-ux-2026-11-09/chat-390.png), [Social Inbox](team-portal-ux-2026-11-09/social-inbox.png). Evidence excludes credentials and customer message/record screenshots. Browser measurements are initial-state snapshots and can vary with loaded data.

## 3. Branding, visual identity and theme

### What works

The persistent Mediqzy wordmark, dark sidebar, recognizable icon family and visible active-link treatment provide a useful foundation. Login has visible labels, a password visibility control and a recovery link. The shell includes a skip link and a collapsible desktop sidebar. Social Inbox explicitly communicates disconnection rather than pretending a channel is connected. Restricted routes explain the required permission and provide a dashboard return path.

### Micro-findings and design decisions

| ID | Evidence and assessment | Recommendation | Priority |
|---|---|---|---|
| BR-01 | Login uses a purple/blue gradient and a heart/shield symbol; the sidebar uses an illustrated logo and teal activation; the header uses another heart symbol. | Use the same Mediqzy logo asset and wordmark lockup at login, shell and recovery. Reserve the heart symbol for a defined product/assistant identity. | P2 |
| BR-02 | Teal, cyan, violet, emerald, pink and orange are all used for navigation/action emphasis across dashboard cards. | Choose one primary action color; use semantic colors for status. Channel colors may identify channels, without replacing the app’s action language. | P2 |
| BR-03 | Native pages expose “RocketChat-style,” “Chatwoot,” “SmartHealth Provider Network Bot,” and a template containing “Mediczy.” | Standardize user-facing product spelling and names to Mediqzy; use task names such as “Provider Network.” Explain external providers only where they affect the user’s decision. Do not rename legitimate partner/legal entities blindly. | P2 |
| BR-04 | The chat conversation header is white while inherited text is rgb(248,250,252). | Replace literal background/text pairs with theme tokens; test paired foreground/background states. This sampled pair is approximately 1.05:1. | P1 |
| BR-05 | Dark surfaces and muted secondary text dominate the audited session; some small status chips and metadata have weak visual emphasis. | Establish verified contrast tokens for primary, secondary and disabled text, borders and focus rings. Do not treat all muted text as failing without measuring its actual background. | P2 |
| BR-06 | Page titles range from small module labels to large gradient heroes and 30–32px headings. | Define a standard page header with title, short contextual subtitle and one primary action. | P2 |

Proposed system: retain the existing font family; use a 28px desktop / 24px mobile page title, 18–20px section title, 14–16px body and 12–13px metadata. Use a consistent spacing scale of 4/8/12/16/24/32px, 10–12px control/card radii, restrained shadows and a visible focus outline. These are design proposals, not claims of accessibility compliance. Support light and dark themes through semantic tokens; this audit’s visual findings primarily describe the dark session. A full light-theme state audit remains required.

## 4. Sidebar: current defect and proposed grouping

The source assigns a category only to Chat, Email Inbox, Social Inbox and Omnichannel. All uncategorized entries are rendered first. Although “Management,” “Operations” and “Support” are passed into `renderFlatItems`, those labels do not drive grouping. The result is the long flat list observed in production. Support Tickets remains outside Communication; standalone WhatsApp and Templates are dashboard links rather than visible sidebar entries.

Source: `client/src/components/layout/Sidebar.tsx:127`, `:364`, `:544`.

### Proposed navigation map

Use a small pinned **My Work** area followed by explicit section headers. Display only permitted items; omit empty sections. Open the current section automatically, remember expansion preferences, and keep headers visible even when their items collapse.

| Header | Destinations | Treatment |
|---|---|---|
| **My Work** | Overview; My Queue / Tasks | Overview maps to existing Dashboard. Queue is a proposed aggregated view, not an existing verified feature. |
| **Communication** | Customer Inbox; Support Tickets; Team Chat; Templates | Customer Inbox contains channel filters. Team Chat is internal collaboration. Templates opens a channel-filtered library. |
| **Corporate Operations** | Corporates; Employees; Health Bookings; Health Packages; Fitness Certificates | Shorten labels; retain corporate context when moving between these views. |
| **Provider Network** | Provider Directory; Doctors; Hospitals; Clinics; Labs; Pharmacies | Provider Directory opens the browsable network; ingestion/QC becomes a subordinate admin task. |
| **Plans & Distribution** | Health Plans; Plan Assignments; Brokers; RFQs/Agents/Agencies/Commissions when permitted | Rename User Plan Customization to Plan Assignments or Member Benefits after staff validation. |
| **Insights & Governance** | Reports; Communication Analytics; Plan Approvals; Activity Logs | Distinguish operational reporting from audit records. |
| **Workspace Administration** | Team Directory; Team Members & Permissions; Channel Connections; Settings; System Tools | Administrative items remain capability-gated; Directory can be available to ordinary staff. |
| **AI Assistance** | Team Copilot; AI Workbench | Keep clinical capabilities separately capability-gated; clarify advisory/approval states. |

Appointments should appear in My Work or Corporate Operations according to actual staff responsibility; keep one canonical destination with contextual shortcuts. Profile, theme and sign-out belong in the account menu. An external Chatwoot launcher should not be a default daily navigation item under the current approved direction.

**Interaction specification:** 256–280px expanded sidebar; 40–44px row targets; meaningful accessible header buttons with `aria-expanded` and associated panels; active leaf uses `aria-current="page"`; long labels wrap or have accessible full text. Keep daily My Work and Communication near the top. Preserve scroll position and reveal the selected item on route changes. Use a modal mobile drawer with focus containment, Escape dismissal and focus restoration. A collapsed desktop rail needs accessible names/tooltips.

Eight headers are a proposed initial taxonomy, not an empirically optimal count. Validate with card sorting and first-click tasks before freezing terminology.

## 5. Visibility, layout and scrolling measurements

| Screen | Viewport | Document height | Observation |
|---|---:|---:|---|
| Login | 1440×900 | 988px | Document width 1528px: 88px horizontal overflow. |
| Login | 1366×768 | 856px | Width 1454px; Back to User Login starts at y=-34. |
| Login | 390×844 | 921px | Width 467px: 77px horizontal overflow. |
| Dashboard | 1440×900 | 2351px | Welcome panel plus 16 shortcut cards and permissions; communication cards start around y=877. |
| Dashboard | 1366×768 | 2351px | Only the first card row is fully visible below the hero. |
| Dashboard | 390×844 | 4183px | Long single-column link catalogue; staff work is far below the opening screen. |
| Chat | 1440×900 | 1061px | Channel navigation, title, metrics and another tab row precede the workspace. |
| WhatsApp | 1440×900 | 989px | List has a 518px inner scroll area within the scrolling document. |
| WhatsApp | 390×844 | 915px | No document-level horizontal overflow, but narrow cards clip controls and text. |
| Corporate Management | 1440×900 | 2029px | Corporate list precedes selected-corporate detail and its tabs. |
| Corporate Management | 390×844 | 2777px | Table and filtering controls require better mobile treatment. |
| Support Tickets | 1440×900 | 2169px | Pagination sits after the long list. |
| Health Plans | 1440×900 | 3140px | Dense long table merits controlled list navigation. |

A tall document is not inherently defective. The issue is whether the scroll hides the next required action, loses entity context or forces competing scroll regions. Likewise, hidden navigation intentionally positioned off-canvas is not itself a horizontal-overflow failure.

### Corrections by surface

**Login — P1.** Oversized absolutely positioned decorative elements extend outside the viewport. Scope and clip decorative layers rather than globally hiding all overflow. Put back navigation in normal flow and use safe vertical spacing on short screens. Add explicit username/current-password autocomplete attributes; both were empty in the live DOM. Keep recovery and support available without extra navigation. Confirm 320px reflow, short landscape screens and zoom after correction.

**Dashboard — P2.** Replace the large identity hero with a compact greeting and role/context line. Put assigned cases, overdue replies, pending confirmations and approvals first, using authoritative APIs or explicit unavailable states. Follow with at most four to six relevant shortcuts. Move permission listings into Profile/Access. Profile Settings and a general admin assistant should not consume the opening row for a corporate operator by default. Do not display a fake zero when queue data is unavailable.

**Shared shell — P1/P2.** The patient bottom bar appears on staff mobile screens, and its rightmost area competes with the floating chat launcher. Use a team-specific mobile bar or rely on the team drawer; hide the applet on full communication screens or label it clearly as Team Chat. The shell reserves 96px of right padding and 128px of bottom padding on desktop, including simple pages. Replace blanket reserved space with layout-specific spacing and deliberate overlay clearance.

**Chat — P1.** Reduce the repeated navigation and move summary metrics to an Overview/Analytics view. Make the active queue, conversation identity and composer visible together. A viewport-bounded workspace needs explicit `min-height:0` through flex parents and one scroll container per list/transcript. Current mixed viewport calculations and large child lists produce clipping; document width alone does not reveal this problem. Hide unavailable channel tabs unless their presence explains a supported upgrade or setup action.

**WhatsApp — P1.** Switch to list → conversation drill-down below the desktop breakpoint. Provide a Back to conversations action, preserve search/filter state, and keep the composer above the software keyboard. Desktop can retain master/detail with a 300–360px list. Distinguish failed loading, no results and no conversations; the source currently logs load/send errors without a user-visible recovery state.

### Focused review: email inbox and chat

Both surfaces need simplification, not a cosmetic reskin. They currently combine distinct jobs—reading/replying, queue handling, reporting, configuration and AI administration—inside the same immediate workspace.

| Surface | What makes it hard to use | Design correction | Priority |
|---|---|---|---|
| Email Inbox | The three-pane layout is sound on a wide desktop, but the global sidebar, mailbox-folder rail, 360px list and reader compete for width. The folder rail also contains mailbox statistics, sentiment charts, SMTP settings, templates, sync and an **AI Process All** action. This obscures the primary question: “what needs a reply now?” | Make **Inbox** a focused work queue: folder/filter, message list and reader/composer. Move connection settings, mailbox statistics and template administration to Communication Administration. Put sync status, last-sync time and a nonintrusive refresh in the inbox header. Put AI triage behind a clear review queue with scope, preview and outcome—not a bulk action in the navigation rail. | P1 |
| Email list | Rows communicate sender, subject, small ticket badges and status dots, but omit a useful message preview and do not establish the mailbox, current folder, result count or sort order in a prominent header. A ticket identifier does not explain case state, owner or SLA. | Use a named queue header such as “Inbox · 18 needing attention,” a short preview, received time, clear priority and case state. Provide filters for assigned to me, unassigned, unread, priority and channel; put advanced filters in a popover. Selecting an item should preserve filter and scroll context. | P1 |
| Email reader | The reader exposes reply, ticket, star, maximize and delete as compact icon controls around dense AI badges, summary, attachments and automated-update history. The relationship between an email and its customer/case is too weak. | Add a persistent case/context rail or expandable panel: customer, linked case, owner, SLA, previous interactions and safe AI summary. Use text for the primary **Reply** action; label every icon control. Keep automatic updates auditable but secondary. Require confirmation or recoverable undo for destructive actions. | P2 |
| Email responsive behavior | The implementation sets a 56px folder rail plus a fixed 360px list inside a three-pane shell with a 640px minimum height. No responsive layout branch is present in this component. | At narrower widths, use Inbox list → Reader drill-down; place folders and filters in a sheet. Compose opens full-screen on phones. This is a source-confirmed implementation risk; verify it on a device before release. | P1 |
| Chat information architecture | The screen first shows channel navigation (Chat, Email, SMS, WhatsApp, Video, Voice), then a Chat Management heading and four KPI cards, then a second seven-item tab bar (Chat Interface, WhatsApp, Tickets, Analytics, Rooms, Bots, Settings). It asks a frontline user to classify the tool before they can work a conversation. | The primary screen should be **Customer Inbox** with queue, list, thread, composer and case context. Keep channel filters inside the queue. Move Analytics, Channel Connections, Bots and Settings to administration. Keep internal rooms under a separately named **Team Chat**. | P1 |
| Chat workspace | Internal channels and WhatsApp customer conversations appear in the same left list, while WhatsApp and Tickets are also presented as tabs and separate portal routes. The header is white in the sampled dark session while its inherited text is near-white. | Separate conversation types at the information-architecture level. Do not mix internal collaboration and customer-care rows. Correct the theme-token error, then apply one conversation-row pattern with channel, customer/team identity, assignee, latest message, unread count and SLA state. | P1 |
| Chat mobile behavior | On the sampled phone view, the title wraps into four lines, four KPI cards consume the opening viewport and the message workspace is pushed below them. Unavailable channels still occupy the first navigation row. | Remove KPI cards from the inbox route. Use a compact title and a single primary queue selector; hide unavailable channels from frontline navigation. On phone, show one pane at a time with Back to queue and persistent reply affordance. | P1 |

#### Recommended daily-work model

```text
Communication
├── Customer Inbox
│   ├── Queue filters: All · Mine · Unassigned · SLA risk · Email · WhatsApp · Social
│   └── Message → reply / internal note → linked case
├── Support Tickets
│   └── Case ownership, SLA and cross-channel history
├── Team Chat
│   └── Internal rooms only
└── Administration
    ├── Templates
    ├── Channel connections
    ├── Automations / AI review rules
    └── Communication analytics
```

The inbox and ticket views should link the same case, but not duplicate each other: the inbox is where an agent handles an interaction; the ticket is where the organisation manages accountable work. Preserve separate channel transport semantics and historical message records during any consolidation.

### Email and chat acceptance criteria

- A team member can identify the current mailbox/queue, unread or assigned work, and the next action within one screen after opening Communication.
- On desktop, the selected message/thread, primary reply control and customer/case context are visible together at 1366×768 without scrolling past decorative KPIs.
- On phone, folders/filters, message list and reader are sequential panes; no fixed 360px list or clipped action controls remain.
- Analytics, settings, templates and bulk automation are not mixed into the primary queue. Bulk AI processing shows scope, proposed outcomes, audit information and an explicit review/confirmation boundary appropriate to the action.
- Email and customer-chat rows clearly distinguish channel, status, assignee, unread state and linked case. An unavailable integration is not rendered as an actionable daily-work tab.
- Every icon-only action has an accessible name, keyboard support and clear success/failure feedback; destructive email actions provide a confirmation or recoverable undo.

**Corporate Operations — P2.** Prefer a corporate list route and a separate corporate detail route, or a deliberate desktop split view. Keep a compact corporate identity bar visible above detail tabs. The current list-then-detail stack makes detail discovery expensive. On mobile, use corporate summary cards or a clearly indicated local table scroller; wrap filter controls. Preserve selected corporate when opening Employees, Bookings and Packages. Replace raw Target User ID and manual JSON-first workflows with searchable entity selection and guided forms for ordinary operators; retain advanced tooling for appropriately authorized users.

**Tables — P2.** Provide search, stable sort, record count, page size and consistent pagination; keep headers and relevant list controls visible where helpful. Add density selection for high-volume work. Use local table scrolling for genuinely two-dimensional data, not whole-page sideways scrolling. Mobile cards should show the minimum operational fields and expose secondary details on demand.

## 6. Communication redundancy: disposition matrix

These are overlapping interfaces, not proof that all underlying systems store identical conversations. Consolidation must preserve identity, permissions, channel delivery semantics and case history.

| Existing surface | Verified purpose / evidence | Decision | Proposed home |
|---|---|---|---|
| `/team/chat` | Live session rendered legacy Chat Management: channel chips, KPI cards, Chat Interface/WhatsApp/Tickets/Analytics/Rooms/Bots/Settings tabs. Native capability code can instead render a newer workspace. | Refactor to the canonical customer workspace; remove duplicate top-level destinations within it. Do not assume the newer path is enabled for all roles/tenants. | Customer Inbox |
| `/team/whatsapp` | Working conversation list, status filters, previews and separate composer implementation. | Preserve channel transport and history; converge the agent UI after proving data parity. Maintain a redirect/deep link during migration. | Customer Inbox → WhatsApp filter |
| `/team/omnichannel` | A launcher explaining that Chatwoot requires a separate login. | Remove from default staff navigation under the approved native-care direction; retain only if an explicitly supported legacy integration requires it. No new Chatwoot dependency. | Optional legacy integration area |
| `/team/social-inbox` | Separate Meta-channel inbox; currently not connected, with server environment instructions. | Fold into inbox filters when connected. Show “Channel not connected; contact workspace administrator” with an authorized setup action. | Customer Inbox → Instagram/Facebook |
| `/team/email-inbox` | Dashboard email tab, separate folder/list/reader layout; visible ticket IDs on messages. | Keep email-specific capabilities; make it a channel view sharing case/contact context. Separate inbox transport from ticket lifecycle. | Customer Inbox → Email |
| `/team/support-tickets` | Case list with owner/status/SLA and email auto-created records. | Keep as case management. Link cases and messages in both directions; do not discard tickets as “duplicates.” | Communication → Support Tickets |
| Floating ChatApplet | Source supports user-team and internal team rooms; rendered across team pages. | Clarify purpose; retain only a small internal collaboration launcher if justified. Avoid a second customer reply surface. | Team Chat |
| `/team/whatsapp-templates` | Separate template catalogue with approval/category/language metadata. | Keep governance; consolidate discoverability with email/welcome templates through channel filters and approval states. | Communication → Templates |
| Welcome Emails / corporate Communication tabs | Entity-specific outreach and welcome-delivery audit. | Preserve contextual actions and audit history; link to the same template, campaign and delivery records. | Corporate detail → Communication |
| Chat Analytics, in-chat Analytics, Reports | Multiple analytics entry points; dedicated chat page uses static numbers. | One authoritative communication report with deep links and agreed metric definitions. Remove unlabeled fallback KPIs. | Insights → Communication Analytics |
| SMS/Video/Voice chips | Rendered as unavailable in sampled team Chat. | Remove from everyday tab order until supported; expose setup/readiness to admins separately. | Channel Connections / future capability |

The 7 November customer-care implementation plan explicitly defers Chatwoot and selects a Mediqzy-native headless service. Production’s “Customer conversations are handled in Chatwoot” copy conflicts with that direction. This is a product-architecture decision to resolve, not a request to disable a live integration without migration checks.

Source: `docs/planning/MEDIQZY_AI_CUSTOMER_CARE_IMPLEMENTATION_PLAN_2026-11-07.md`; `client/src/pages/CommunicationChatPage.tsx`; `client/src/pages/team/ChatwootOmnichannel.tsx`; `client/src/components/chat/ChatApplet.tsx`.

### Target customer-care workspace

Desktop: **queue/filter rail → conversation list → transcript/composer → collapsible customer/case context**. Tablet: context opens in a drawer. Mobile: one pane at a time. Keep channel, assignee, SLA, connection state and delivery status legible. Provide explicit Reply versus Internal note modes; keep clinical details out of broad preview lists unless required and authorized.

An AI handoff should expose queue, owner, reason, safe summary, status and approved response sources within the case. Preserve the existing approved human-approval boundaries. The headless V1 service does not by itself prove an integrated operator UI exists. In the inspected AI Workbench, “handoff queue unavailable for this role” appeared alongside “No pending handoffs”; these states must be mutually exclusive so an unavailable queue is not interpreted as empty.

Before merging interfaces, map each source’s tenant/contact/conversation IDs and message history; verify reply capability, delivery receipts, attachments, templates, unread counts, assignment, SLA ownership and case linkage. Choose one system of record per concern. Use read-only comparison and staged routing before retiring an old reply surface. Do not silently combine contacts solely by matching display names or unverified phone strings.

## 7. Additional micro-audit register

| ID | Finding | Evidence / confidence | Required design outcome |
|---|---|---|---|
| MI-01 | Static Chat Analytics KPIs and roadmap-like “Active initiatives” resemble production reporting. | Live visible; static config at `TeamModulePages.tsx:393–412`. | Replace with live, scoped metrics and period/source labels, or clearly mark a demo and remove from operational navigation. P1. |
| MI-02 | Legacy Chat has default statistics used when overview values are absent. | Source at `AdminChatDashboard.tsx:325` and `:914`; live figures matched defaults. Backend provenance of each live number was not traced. | Never substitute plausible demonstration values for unavailable analytics. P1. |
| MI-03 | “View Reports” on dedicated Chat Analytics has no destination in its config and no matching action branch. | Source-confirmed in `TeamModulePages.tsx:90–98`, `:397`. | Give it an authorized report destination or remove it. P2. |
| MI-04 | WhatsApp Filter, Star, Archive and More icon buttons lack handlers in the inspected source. | `WhatsAppCommunication.tsx:185`, `:291–299`; selected-conversation icons were source-reviewed, not exercised. | Implement intended behavior with labels and feedback or remove the affordance. P2. |
| MI-05 | Chat contains 13 icon buttons without visible text, aria-label or title in the sampled DOM. | Focused browser check; this count is a screening result, not a full accessible-name calculation. | Inspect the accessibility tree; name every action and verify keyboard focus/activation. P1/P2. |
| MI-06 | Theme and notification buttons in shared shell lack explicit labels; notifications footer points to `/patient/notifications`. | `MainLayout.tsx:283–350`; destination source-reviewed, not clicked. | Provide names and a team-appropriate notification destination. P2. |
| MI-07 | Admin Copilot appears as an always-visible action with “AI ops assistant for admins” for this non-admin team role. | Live and `TeamDashboard.tsx:78–84`. | Rename Team Copilot, explain actual scope and align visibility with capability. P2. |
| MI-08 | Provider Network presents Batch ID, Manual JSON, QC/Publish and Force Publish language to an operator. | Live initial screen. | Provide a guided ingestion/review flow; advanced controls need purposeful permissions and contextual explanation. P2. |
| MI-09 | Hospitals/Labs/Pharmacies use snapshot/initiative shells rather than consistent directory management patterns. | Live initial screens and ModuleShell configuration. | Present actionable lists or explicitly communicate capability/read-only status; move product roadmap text out of daily work. P2. |
| MI-10 | Team Directory and Team Members returned zero records despite the signed-in staff context. | Observed; no API/tenant investigation performed. | Distinguish empty result, restricted scope and load error; explain filters and recovery. Do not infer missing database records. P2. |
| MI-11 | Dashboard “Last Login: First login” persists after successful entry in sampled session. | Live text; backend login-history semantics unverified. | Verify meaning; use “Previous sign-in” with timestamp or omit misleading metadata. P3. |
| MI-12 | Package enrollment exceeded displayed capacity on two package rows. | Live initial package screen; cause unverified. | Show explicit over-capacity state and next step; determine whether capacity is enforced or advisory before prescribing backend behavior. P2. |
| MI-13 | Date display includes US-style numeric dates in corporate detail. | Live sample. | Use explicit locale/timezone presentation, e.g. “17 Apr 2026”; show IST where operational deadlines require it. P3. |
| MI-14 | Email and ticket views expose matching ticket identifiers. | Live record labels. | Reuse the linkage in navigation and context panels. This is evidence for linked workflows, not proof of duplicate case creation. P2. |

## 8. Accessibility and interaction acceptance criteria

Use these as release criteria, not as a claim that the current portal has completed an accessibility audit.

- Text contrast: at least 4.5:1 for ordinary text and 3:1 for qualifying large text; verify actual composite colors in both themes. The sampled white-on-white chat header fails this threshold. [W3C contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).
- Reflow: verify 320 CSS px and 400% zoom without losing information/functionality or introducing two-dimensional page scrolling, allowing necessary two-dimensional data components. Existing 390px checks reveal issues but do not substitute for the full criterion. [W3C reflow guidance](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html).
- Pointer targets: satisfy 24×24 CSS px or applicable spacing/other exceptions; aim for 44px on frequently used mobile actions. [W3C target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).
- Drawer/dialog: focus enters the opened surface; Tab stays within a modal drawer; Escape closes it; focus returns to the trigger; background navigation is unavailable while modal.
- Tables/tabs/forms: accessible names, semantic headers, selected states, input labels, field-level errors and live loading/error feedback. Complete keyboard-only and screen-reader sampling.
- Scrolling: at 1366×768, the active communication list and reply action remain reachable without traversing dashboard metrics; mobile keyboard does not cover the composer. Verify populated long threads, attachments, empty, disconnected, permission-denied and failed-network states.
- Feedback: distinguish sending/sent/delivered/failed; preserve a draft on failure; prevent accidental duplicate submission. Do not show an empty queue when the queue failed to load.

## 9. Delivery sequence and ownership

| Stage | Work | Suggested owner | Verification gate |
|---|---|---|---|
| 1 — correctness and access | Repair login overflow/back link, chat contrast, mobile staff shell, WhatsApp drill-down and drawer keyboard behavior; remove misleading KPI fallbacks and inert actions. | Frontend + accessibility reviewer; analytics owner for metrics | Laptop/mobile/zoom captures; keyboard checks; explicit data/error states; no clipped core controls. |
| 2 — navigation and layout | Implement grouped sidebar, role-specific Overview, consistent headers/tables and corporate detail context. | Product designer + frontend + team operations | First-click tasks with staff; no orphaned routes; permission matrix agrees across sidebar, dashboard and guards. |
| 3 — communication convergence | Agree native inbox ownership, map channel data/case linkage, consolidate entry points, move connection setup to administration. | Product + communication backend + frontend | Tenant/permission and message-parity checks; preserved threads/attachments/status; no duplicate reply/case action; supported legacy deep links. |
| 4 — visual consistency | Standardize logo, color/spacing/type tokens, component states, copy and light/dark behavior. | Design system owner + frontend | Theme/state matrix reviewed; no literal white surface inheriting dark-mode text; consistent terminology. |

No effort estimate is asserted without engineering discovery. Most immediate presentation corrections can be isolated from the communication backend migration.

## 10. Staff validation and completion definition

Run moderated tasks with corporate operators, support staff and a workspace administrator: find an overdue reply, answer an email and inspect its linked case, locate a corporate employee and booking, find a WhatsApp template, and identify a disconnected channel. Measure first-click accuracy, completion, wrong-workspace detours and time from login to actionable work. Compare against the current portal; do not claim an improvement percentage without that baseline.

Suggested design targets: daily communication reachable in one sidebar selection; users correctly distinguish Customer Inbox, Support Tickets and Team Chat; no whole-page horizontal scroll on login; no clipped core controls at sampled widths; no unlabeled demonstration analytics; selected corporate and queue state survive intended navigation; no patient-only mobile navigation in team routes. Require end-to-end checks for each supported permission tier and real channel before retiring legacy surfaces.

**Audit conclusion:** preserve the useful shell and domain modules, but make the portal a staff work environment rather than a catalogue of modules. Navigation grouping and communication ownership are the central design decisions; contrast, clipping, data truthfulness and contextual navigation are the first release gates.
