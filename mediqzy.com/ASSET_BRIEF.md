# Mediqzy.com — Visual Asset Brief for Designer

> Handoff spec for a visual designer / illustrator to create production-ready
> vector assets and imagery that replace the current developer placeholders.

---

## Brand DNA

| Attribute       | Value                                          |
| --------------- | ---------------------------------------------- |
| Company         | Mayden SmartHealth Pvt Ltd                      |
| Product         | Mediqzy — Hospital Operating System             |
| Tone            | Premium, confident, trustworthy                 |
| Style keywords  | Clean / Medical / Enterprise / Minimal / Modern |
| Primary palette | Sky-900 `#0C4A6E`, Sky-500 `#0EA5E9`, Cyan-300 `#7DD3FC` |
| Neutral palette | Slate-950 `#0F172A`, Slate-600 `#475569`, White `#FFFFFF` |
| Accent          | Emerald `#10B981` (positive metrics), Amber `#D97706` (insurance) |
| Typography      | Sora (headings), Space Grotesk (body)           |
| Corner radius   | 16-28 px — soft, rounded, modern                |

---

## Asset Inventory (8 files to deliver)

### 1. `logo.svg` — Brand Mark + Wordmark
- **Size:** 160 × 40 px (SVG, scalable)
- **Spec:** Icon (medical cross + data circle motif) + "mediqzy" wordmark.
- **Usage:** Navbar + footer.
- **Notes:** Must work on white AND dark navy backgrounds.

### 2. `hero-dashboard.svg` — Product UI Mockup
- **Size:** ~920 × 640 px
- **Spec:** A realistic product dashboard screenshot (vector-illustrated, not a screenshot).
  - Sidebar: navigation items (Dashboard, Patients, Appointments, Claims, Staff, Analytics).
  - Top bar: browser-chrome style with `mediqzy.com/dashboard`.
  - Stat cards: Patients Today, Claims Processed, Revenue (Today) with green uptick arrows.
  - Chart: Revenue & Claims Trend (dual line).
  - Activity feed: recent events (claim approved, patient discharged, etc.).
  - Patient table: 3 rows with name, department, status pill, claim status.
- **Style:** Light theme, soft card shadows, sky-blue accents.
- **Notes:** This is the hero image — it must feel like a real product, not a wireframe. Use realistic data labels (Indian hospital context: ₹, NABH, etc.).

### 3. `system-map.svg` — Architecture Diagram
- **Size:** ~900 × 500 px
- **Spec:** Visual showing the 4 sub-systems connected to a center "Mediqzy Core OS" node:
  - Care OS (EMR + Patient Journey)
  - Operations OS (Admin + Workflows)
  - Insurance OS (Pre-auth + Claims)
  - Intelligence OS (Dashboards + Analytics)
- **Style:** Each node is a card with a unique icon. Connecting lines (sky blue) radiate from center.
- **Notes:** Should feel like an enterprise architecture diagram, not a flowchart.

### 4. `flow-diagram.svg` — Patient Journey Pipeline
- **Size:** ~900 × 180 px
- **Spec:** Horizontal 5-step pipeline:
  1. Patient (person icon, "Walk-in / Online")
  2. Treatment (document icon, "EMR + Care Plan")
  3. Claim (form + checkmark, "Auto Pre-auth")
  4. Payment (₹ symbol, "Settled & Tracked")
  5. Insights (chart icon, "Live Analytics")
- **Style:** Rounded cards, directional arrows between steps.
- **Notes:** Must be legible when scaled down on mobile. Arrows should feel like a real operational flow.

### 5–8. Persona Caricatures

All 4 follow the same template:
- **Size:** 320 × 280 px each
- **Style:** Flat vector caricature / avatar (NOT photo-realistic, NOT cartoonish). Think Notion-style professional illustrations.
- **Palette:** Each persona gets a subtle color accent on their background.

| File                     | Persona             | Accent Color       | Visual Cue                     |
| ------------------------ | ------------------- | ------------------ | ------------------------------ |
| `persona-cfo.svg`        | Hospital CFO        | Sky blue `#BAE6FD` | Business suit, financial chart |
| `persona-ops.svg`        | Operations Director | Cyan `#CFFAFE`     | Clipboard, workflow diagram    |
| `persona-doctor.svg`     | Clinical Director   | Sky blue `#E0F2FE` | White coat, stethoscope, medical cross |
| `persona-insurance.svg`  | Insurance Head      | Amber `#FEF3C7`    | Shield with checkmark          |

---

## Additional Assets (Phase 2, nice-to-have)

| Asset                     | Description                                              |
| ------------------------- | -------------------------------------------------------- |
| `trust-nabh.svg`          | Official NABH logo (sourced or recreated per guidelines) |
| `trust-abdm.svg`          | ABDM/NHA logo                                            |
| `partner-logos.svg`       | Strip of client / partner logos (once available)          |
| `og-image.png`            | 1200 × 630 Open Graph image for social sharing           |
| `favicon.svg`             | Mediqzy icon mark only, 32 × 32                          |
| `hero-dashboard-dark.svg` | Dark-mode variant of the dashboard mockup                |

---

## Delivery Format

- All files as **optimized SVG** (run through SVGO).
- Flat vectors only — no embedded raster images.
- All text converted to outlines (or use `font-family: Arial` as fallback).
- Drop into `/public/vectors/` and the website will pick them up automatically.

---

## Reference Sites for Visual Style

- [healthorbit.ai](https://healthorbit.ai) — premium AI-health aesthetic
- [linear.app](https://linear.app) — product dashboard illustration style
- [vercel.com](https://vercel.com) — clean enterprise layout
- [notion.so](https://notion.so) — avatar / persona illustration style

---

## Current Placeholder Files

These are functional SVGs already wired into the site. Replace them in-place:

```
public/vectors/
├── logo.svg              ← brand mark
├── hero-dashboard.svg    ← product mockup (hero)
├── hero-infra.svg        ← old hero (can delete)
├── system-map.svg        ← architecture diagram
├── flow-diagram.svg      ← patient journey pipeline
├── persona-cfo.svg       ← CFO caricature
├── persona-ops.svg       ← Ops Director caricature
├── persona-doctor.svg    ← Clinical Director caricature
├── persona-insurance.svg ← Insurance Head caricature
└── trust-logos.svg       ← compliance badge strip
```
