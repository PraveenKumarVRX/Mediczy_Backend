"""
Mediqzy Hospital OS — MGM Hospitals Proposal PPT Generator
"""

from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
import copy

prs = Presentation()
prs.slide_width  = Inches(13.33)
prs.slide_height = Inches(7.5)

# ── Brand Palette ──────────────────────────────────────────────────────────────
NAVY      = RGBColor(0x0A, 0x1A, 0x3A)   # deep navy
BLUE      = RGBColor(0x16, 0x3B, 0x84)   # primary blue
CYAN      = RGBColor(0x00, 0xC2, 0xE0)   # accent cyan
GOLD      = RGBColor(0xF5, 0xA6, 0x23)   # accent gold
WHITE     = RGBColor(0xFF, 0xFF, 0xFF)
LIGHT_BG  = RGBColor(0xF4, 0xF6, 0xFB)
DARK_TEXT = RGBColor(0x1A, 0x1A, 0x2E)
MID_GRAY  = RGBColor(0x6B, 0x7A, 0x99)
TEAL      = RGBColor(0x00, 0xA8, 0x8E)
ORANGE    = RGBColor(0xEF, 0x6C, 0x00)
GREEN     = RGBColor(0x2E, 0x7D, 0x32)

BLANK_LAYOUT = prs.slide_layouts[6]


# ── Helpers ────────────────────────────────────────────────────────────────────
def add_rect(slide, left, top, width, height, fill_color=None, line_color=None, line_width_pt=0):
    shape = slide.shapes.add_shape(1, Inches(left), Inches(top), Inches(width), Inches(height))
    if fill_color:
        shape.fill.solid()
        shape.fill.fore_color.rgb = fill_color
    else:
        shape.fill.background()
    if line_color:
        shape.line.color.rgb = line_color
        shape.line.width = Pt(line_width_pt)
    else:
        shape.line.fill.background()
    return shape


def add_text(slide, text, left, top, width, height,
             font_size=18, bold=False, italic=False,
             color=WHITE, align=PP_ALIGN.LEFT,
             wrap=True, font_name="Calibri"):
    txb = slide.shapes.add_textbox(Inches(left), Inches(top), Inches(width), Inches(height))
    txb.word_wrap = wrap
    tf = txb.text_frame
    tf.word_wrap = wrap
    p = tf.paragraphs[0]
    p.alignment = align
    run = p.add_run()
    run.text = text
    run.font.size = Pt(font_size)
    run.font.bold = bold
    run.font.italic = italic
    run.font.color.rgb = color
    run.font.name = font_name
    return txb


def add_multiline(slide, lines, left, top, width, height,
                  font_size=14, color=WHITE, bold_first=False,
                  align=PP_ALIGN.LEFT, line_spacing_pt=6, font_name="Calibri"):
    txb = slide.shapes.add_textbox(Inches(left), Inches(top), Inches(width), Inches(height))
    txb.word_wrap = True
    tf = txb.text_frame
    tf.word_wrap = True
    for i, line in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        p.space_after = Pt(line_spacing_pt)
        run = p.add_run()
        run.text = line
        run.font.size = Pt(font_size)
        run.font.bold = (i == 0 and bold_first)
        run.font.color.rgb = color
        run.font.name = font_name
    return txb


def accent_bar(slide, color=CYAN, height=0.06):
    add_rect(slide, 0, 0, 13.33, height, fill_color=color)


def bottom_bar(slide, color=NAVY):
    add_rect(slide, 0, 7.3, 13.33, 0.2, fill_color=color)


def slide_header(slide, title, subtitle=None, title_color=DARK_TEXT, sub_color=MID_GRAY):
    accent_bar(slide, CYAN)
    add_rect(slide, 0, 0.06, 13.33, 1.1, fill_color=LIGHT_BG)
    add_text(slide, title, 0.35, 0.12, 10, 0.7, font_size=26, bold=True, color=title_color)
    if subtitle:
        add_text(slide, subtitle, 0.35, 0.72, 10, 0.4, font_size=13, color=sub_color)
    add_rect(slide, 0, 1.16, 13.33, 6.14, fill_color=WHITE)
    bottom_bar(slide)
    add_text(slide, "CONFIDENTIAL  |  Mediqzy Healthcare Technologies", 0.3, 7.3, 10, 0.2,
             font_size=8, color=RGBColor(0xCC, 0xCC, 0xCC), align=PP_ALIGN.LEFT)
    add_text(slide, "mediqzy.com", 11.5, 7.3, 1.5, 0.2,
             font_size=8, color=RGBColor(0xCC, 0xCC, 0xCC), align=PP_ALIGN.RIGHT)


def card(slide, left, top, width, height, bg=BLUE, radius=False):
    s = add_rect(slide, left, top, width, height, fill_color=bg)
    return s


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 1 — Title / Cover
# ══════════════════════════════════════════════════════════════════════════════
sl = prs.slides.add_slide(BLANK_LAYOUT)

# Full-bleed background
add_rect(sl, 0, 0, 13.33, 7.5, fill_color=NAVY)

# Left panel – deep gradient feel with a side bar
add_rect(sl, 0, 0, 5.5, 7.5, fill_color=BLUE)
add_rect(sl, 5.45, 0, 0.06, 7.5, fill_color=CYAN)

# Decorative circles (abstract)
for cx, cy, r, op in [(4.8, 1.2, 2.0, RGBColor(0x1E, 0x55, 0xA0)),
                       (4.2, 5.5, 1.5, RGBColor(0x0F, 0x2C, 0x6E)),
                       (1.0, 6.8, 1.8, RGBColor(0x0F, 0x2C, 0x6E))]:
    c = sl.shapes.add_shape(9, Inches(cx - r/2), Inches(cy - r/2), Inches(r), Inches(r))
    c.fill.solid(); c.fill.fore_color.rgb = op; c.line.fill.background()

# Mediqzy wordmark
add_text(sl, "Mediqzy", 0.5, 0.7, 5, 0.9, font_size=44, bold=True, color=WHITE)
add_text(sl, "HOSPITAL OS", 0.5, 1.55, 5, 0.5, font_size=20, bold=True, color=CYAN)
add_rect(sl, 0.5, 2.1, 3.5, 0.05, fill_color=CYAN)
add_text(sl, "India's Most Advanced AI-Powered\nHealthcare Management Platform", 0.5, 2.25, 4.8, 1.0,
         font_size=14, color=RGBColor(0xCC, 0xDD, 0xFF), italic=True)

# Right side — proposal details
add_text(sl, "PROPOSAL FOR", 6.0, 1.5, 6.5, 0.5, font_size=13, color=CYAN, bold=True)
add_text(sl, "MGM Hospitals", 6.0, 2.0, 6.8, 1.0, font_size=40, bold=True, color=WHITE)
add_text(sl, "Group", 6.0, 2.9, 6.8, 0.5, font_size=22, bold=False, color=RGBColor(0xBB, 0xCC, 0xFF))
add_rect(sl, 6.0, 3.45, 5.0, 0.05, fill_color=GOLD)

add_multiline(sl, [
    "Transforming Patient Care Through Intelligent Technology",
    "",
    "Prepared by:  Mediqzy Healthcare Technologies Pvt. Ltd.",
    "Date:         May 2025",
    "Version:      1.0  |  CONFIDENTIAL",
], 6.0, 3.6, 6.8, 2.5, font_size=12, color=RGBColor(0xCC, 0xDD, 0xFF), line_spacing_pt=4)

# Tag line strip
add_rect(sl, 0, 6.95, 13.33, 0.55, fill_color=CYAN)
add_text(sl, "Outpatient  ·  Inpatient  ·  Emergency  ·  Pharmacy  ·  Lab  ·  Radiology  ·  Billing  ·  AI Diagnostics  ·  Telemedicine",
         0.3, 6.97, 12.7, 0.45, font_size=11, color=NAVY, bold=True, align=PP_ALIGN.CENTER)


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 2 — Agenda / Table of Contents
# ══════════════════════════════════════════════════════════════════════════════
sl = prs.slides.add_slide(BLANK_LAYOUT)
slide_header(sl, "Agenda", "What We Will Cover Today")

sections = [
    ("01", "The Healthcare IT Landscape & Challenge",        "Setting the context for digital transformation"),
    ("02", "Introducing Mediqzy Hospital OS",               "Platform overview, architecture & differentiators"),
    ("03", "Core Clinical Modules",                         "OPD, IPD, EMR, Pharmacy, Lab, Radiology, OT"),
    ("04", "Patient Experience & Digital Front Door",       "Mobile app, WhatsApp, self-service, telemedicine"),
    ("05", "AI Engine — iSHA & Dr. ISHA",                  "AI diagnostics, clinical decision support & chatbot"),
    ("06", "Revenue Cycle & Finance",                       "Billing, insurance, TPA, MIS & collections"),
    ("07", "Implementation & Change Management",            "Rollout plan, training & go-live support"),
    ("08", "Why Mediqzy for MGM Hospitals",                 "ROI, references & why we are the right partner"),
]

cols = [0.35, 6.8]
for i, (num, title, desc) in enumerate(sections):
    col = i % 2
    row = i // 2
    x = cols[col]
    y = 1.35 + row * 1.38

    card(sl, x, y, 5.9, 1.2, bg=BLUE if col == 0 else NAVY)
    add_text(sl, num, x + 0.18, y + 0.12, 0.7, 0.6, font_size=28, bold=True, color=CYAN)
    add_text(sl, title, x + 0.9, y + 0.1, 4.7, 0.55, font_size=13, bold=True, color=WHITE)
    add_text(sl, desc, x + 0.9, y + 0.65, 4.7, 0.45, font_size=10, color=RGBColor(0xBB, 0xCC, 0xFF), italic=True)


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 3 — The Challenge
# ══════════════════════════════════════════════════════════════════════════════
sl = prs.slides.add_slide(BLANK_LAYOUT)
slide_header(sl, "The Healthcare IT Challenge", "Why Hospitals Need a Unified OS — Not Just Software")

pain_points = [
    ("🧩", "Fragmented Systems",      "OPD, IPD, Lab, Pharmacy & billing running on\ndifferent islands — no single source of truth"),
    ("📋", "Paper & Manual Processes","Clinical notes, prescriptions, MRD files &\ndischarge summaries still on paper"),
    ("⏱️", "Long Patient Wait Times", "Average OPD wait: 45+ min; discharge: 4+ hrs.\nPatient satisfaction takes a hit every day"),
    ("💰", "Revenue Leakage",         "Up to 8–12% revenue lost due to billing gaps,\nTPA rejections & inventory pilferage"),
    ("📊", "Zero Real-Time Insight",  "No live dashboards on bed occupancy, TAT,\ncollections or clinical outcomes"),
    ("🔒", "Compliance Risk",         "NABH, ABDM & data privacy requirements\nare hard to meet without integrated systems"),
]

for i, (icon, title, body) in enumerate(pain_points):
    col = i % 3
    row = i // 3
    x = 0.35 + col * 4.32
    y = 1.4 + row * 2.6

    add_rect(sl, x, y, 3.9, 2.3, fill_color=RGBColor(0xFF, 0xF3, 0xE0),
             line_color=GOLD, line_width_pt=1.5)
    add_text(sl, icon, x + 0.15, y + 0.12, 0.65, 0.65, font_size=28, color=DARK_TEXT)
    add_text(sl, title, x + 0.8, y + 0.15, 2.9, 0.55, font_size=14, bold=True, color=ORANGE)
    add_text(sl, body,  x + 0.15, y + 0.8, 3.55, 1.3, font_size=11, color=DARK_TEXT, wrap=True)

add_text(sl, "MGM Hospitals deserves better — a single, intelligent platform built for India's healthcare reality.",
         0.35, 6.9, 12.5, 0.35, font_size=12, bold=True, color=BLUE, align=PP_ALIGN.CENTER)


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 4 — What is Mediqzy Hospital OS
# ══════════════════════════════════════════════════════════════════════════════
sl = prs.slides.add_slide(BLANK_LAYOUT)
slide_header(sl, "Mediqzy Hospital OS", "A Unified, AI-First Platform Designed for Indian Multi-Specialty Hospitals")

# Left visual panel
add_rect(sl, 0.35, 1.3, 5.2, 5.7, fill_color=NAVY)
add_text(sl, "ONE PLATFORM", 0.5, 1.55, 5.0, 0.5, font_size=22, bold=True, color=CYAN, align=PP_ALIGN.CENTER)
add_text(sl, "FOR EVERYTHING", 0.5, 2.0, 5.0, 0.5, font_size=22, bold=True, color=WHITE, align=PP_ALIGN.CENTER)
add_rect(sl, 1.0, 2.55, 4.0, 0.05, fill_color=CYAN)

layers = [
    (BLUE,                          "🏥  OPD · IPD · Emergency · OT"),
    (RGBColor(0x1E, 0x55, 0xA0),   "💊  Pharmacy · Lab · Radiology · Diet"),
    (RGBColor(0x14, 0x3A, 0x7E),   "💳  Billing · Insurance · TPA · Payroll"),
    (RGBColor(0x0F, 0x2C, 0x6E),   "📱  Patient App · WhatsApp · Portal"),
    (RGBColor(0x0A, 0x1F, 0x55),   "🤖  AI Engine · Analytics · MIS"),
]
for j, (clr, lbl) in enumerate(layers):
    add_rect(sl, 0.5, 2.75 + j * 0.78, 4.6, 0.68, fill_color=clr)
    add_text(sl, lbl, 0.65, 2.82 + j * 0.78, 4.4, 0.55, font_size=13, color=WHITE, bold=(j == 0))

# Right feature bullets
pillars = [
    ("🔗", "Fully Integrated",    "Every department, every data point — connected in real time. No more re-entering patient data across systems."),
    ("🧠", "AI-Powered",          "iSHA clinical AI, voice-to-text notes, auto-coding, image analysis, predictive alerts & Dr. ISHA chatbot."),
    ("☁️", "Cloud & On-Premise",  "Flexible deployment — private cloud on your servers or fully managed SaaS. HIPAA & ABDM compliant."),
    ("📱", "Mobile-First",        "Native apps for doctors, nurses, patients & management. Works offline in wards, syncs on reconnect."),
    ("🇮🇳", "India-Ready",        "Supports Ayushman Bharat, ABHA ID, eSanjeevani, ABDM HIU/HIP, GST billing & all Indian insurance formats."),
]
for j, (icon, title, body) in enumerate(pillars):
    y = 1.3 + j * 1.1
    add_rect(sl, 5.85, y, 7.1, 0.95, fill_color=LIGHT_BG, line_color=RGBColor(0xDD, 0xE5, 0xF5), line_width_pt=1)
    add_text(sl, icon,  5.98, y + 0.08, 0.6, 0.75, font_size=22, color=DARK_TEXT)
    add_text(sl, title, 6.6,  y + 0.05, 5.9, 0.35, font_size=13, bold=True, color=BLUE)
    add_text(sl, body,  6.6,  y + 0.42, 5.9, 0.48, font_size=10, color=DARK_TEXT, wrap=True)


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 5 — Clinical Modules Overview (Architecture Wheel)
# ══════════════════════════════════════════════════════════════════════════════
sl = prs.slides.add_slide(BLANK_LAYOUT)
slide_header(sl, "Core Clinical Modules", "End-to-End Clinical Workflows — Digitised, Streamlined, Automated")

modules = [
    # (x, y, color, icon, title, bullets)
    (0.35, 1.35, BLUE,   "🏥", "OPD Management",
     ["Token & queue management", "Doctor schedule & slot booking", "Video & in-person consultation", "e-Prescription with drug check", "Follow-up & recall automation"]),
    (4.6,  1.35, NAVY,   "🛏️", "IPD / Ward Management",
     ["Bed management & ADT", "Nursing station workflows", "Doctor round notes & orders", "Diet & physio integration", "Discharge summary automation"]),
    (8.85, 1.35, BLUE,   "🚨", "Emergency & Triage",
     ["ATLS-based triage scoring", "Live trauma bay dashboard", "Ambulance tracking (EMS)", "Code blue & rapid response", "MLC documentation"]),
    (0.35, 4.3,  NAVY,   "💊", "Pharmacy",
     ["Inpatient & retail dispensing", "Auto-indent from ward orders", "FIFO/FEFO expiry tracking", "Narcotic register compliance", "Drug interaction alerts"]),
    (4.6,  4.3,  BLUE,   "🔬", "Laboratory (LIS)",
     ["Sample lifecycle tracking", "Analyser auto-result import", "Critical value alerts", "TAT monitoring dashboard", "NABL-ready report formats"]),
    (8.85, 4.3,  NAVY,   "🩻", "Radiology (RIS/PACS)",
     ["Order to report workflow", "DICOM viewer integrated", "AI-assisted report drafting", "Teleradiology support", "CD burning & image sharing"]),
]

for (x, y, clr, icon, title, bullets) in modules:
    add_rect(sl, x, y, 3.9, 2.7, fill_color=clr)
    add_rect(sl, x, y, 3.9, 0.55, fill_color=CYAN if clr == BLUE else GOLD)
    add_text(sl, icon + "  " + title, x + 0.1, y + 0.05, 3.65, 0.45, font_size=14, bold=True, color=NAVY if clr == BLUE else DARK_TEXT)
    for bi, b in enumerate(bullets):
        add_text(sl, "› " + b, x + 0.12, y + 0.65 + bi * 0.39, 3.62, 0.37, font_size=10.5, color=WHITE)


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 6 — OT, CSSD, Diet, Blood Bank
# ══════════════════════════════════════════════════════════════════════════════
sl = prs.slides.add_slide(BLANK_LAYOUT)
slide_header(sl, "Additional Clinical Modules", "Supporting Every Corner of Your Hospital")

extra_modules = [
    ("🔪", "Operation Theatre",  BLUE,
     ["OT scheduling & blocking", "Pre-op checklist enforcement", "Anaesthesia sheet (digital)", "Instrument & implant tracking", "Post-op care handoff"]),
    ("🩸", "Blood Bank",          NAVY,
     ["Donor registration & screening", "Cross-match & issue workflow", "Inventory by blood group", "Adverse reaction reporting", "NBTC compliance reports"]),
    ("🥗", "Diet & Nutrition",   BLUE,
     ["Dietitian assessment forms", "Patient meal planning", "Kitchen requisition orders", "Calorie & allergy tracking", "Tube-feed protocol support"]),
    ("🧼", "CSSD",               NAVY,
     ["Sterilisation tracking", "Instrument set management", "Autoclave cycle logs", "Expiry & QC records", "Indent from OT & wards"]),
    ("🏃", "Physiotherapy",      BLUE,
     ["Referral from IPD/OPD", "Session scheduling & notes", "Exercise plan library", "Progress & outcome tracking", "Insurance pre-auth support"]),
    ("💉", "Vaccination & Clinic",NAVY,
     ["Immunisation registry", "Dose scheduling & reminders", "Adverse event capture", "Multi-site synchronisation", "Government scheme linkage"]),
]

for i, (icon, title, clr, bullets) in enumerate(extra_modules):
    col = i % 3
    row = i // 3
    x = 0.35 + col * 4.32
    y = 1.35 + row * 2.75
    add_rect(sl, x, y, 3.9, 2.5, fill_color=clr)
    add_rect(sl, x, y, 3.9, 0.5, fill_color=CYAN if clr == BLUE else GOLD)
    add_text(sl, icon + "  " + title, x + 0.1, y + 0.04, 3.65, 0.45, font_size=13, bold=True, color=NAVY if clr == BLUE else DARK_TEXT)
    for bi, b in enumerate(bullets):
        add_text(sl, "› " + b, x + 0.12, y + 0.6 + bi * 0.37, 3.62, 0.35, font_size=10.5, color=WHITE)


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 7 — Patient Experience & Digital Front Door
# ══════════════════════════════════════════════════════════════════════════════
sl = prs.slides.add_slide(BLANK_LAYOUT)
slide_header(sl, "Patient Experience — Digital Front Door", "Meet Patients Where They Are — Mobile, WhatsApp, Web & Kiosk")

add_rect(sl, 0.35, 1.3, 12.6, 5.9, fill_color=LIGHT_BG)

channels = [
    ("📱", "Mobile App\n(iOS & Android)",
     ["Self registration & ABHA linking", "Online appointment booking", "Digital OPD token & queue status", "Reports & prescriptions download", "Bill payment & EMI options", "Video consultation (LiveKit)"]),
    ("💬", "WhatsApp\nAutomation",
     ["Appointment confirm & reminders", "Lab report delivery via PDF", "Discharge summary sharing", "Billing & collection reminders", "Post-discharge follow-up flow", "AI health Q&A chatbot"]),
    ("🖥️", "Patient Portal\n(Web)",
     ["Full medical history view", "Family member management", "Feedback & satisfaction surveys", "Consent form signing (e-sign)", "Corporate / TPA self-service", "Referral letter download"]),
    ("🖨️", "Kiosk &\nSelf-Service",
     ["Check-in & token collection", "Bill printing & payment", "Report collection kiosk", "Visitor pass issuance", "Feedback capture terminal", "Queue status display board"]),
]

for i, (icon, title, features) in enumerate(channels):
    x = 0.5 + i * 3.22
    add_rect(sl, x, 1.45, 3.0, 5.65, fill_color=NAVY)
    add_rect(sl, x, 1.45, 3.0, 0.55, fill_color=CYAN)
    add_text(sl, icon, x + 1.1, 1.5, 0.8, 0.45, font_size=22, color=NAVY, bold=True)
    add_text(sl, title, x + 0.1, 2.05, 2.75, 0.72, font_size=12, bold=True, color=WHITE, align=PP_ALIGN.CENTER)
    for fi, f in enumerate(features):
        add_text(sl, "✓  " + f, x + 0.15, 2.85 + fi * 0.72, 2.65, 0.65, font_size=10, color=RGBColor(0xCC, 0xDD, 0xFF), wrap=True)

add_text(sl, "Result: NPS +35 points  |  No-show rate −42%  |  Collection TAT −60%  |  Zero manual report dispatch",
         0.35, 7.18, 12.6, 0.28, font_size=11, bold=True, color=WHITE, align=PP_ALIGN.CENTER)
add_rect(sl, 0, 7.15, 13.33, 0.35, fill_color=BLUE)
add_text(sl, "Result: NPS +35 points  |  No-show rate −42%  |  Collection TAT −60%  |  Zero manual report dispatch",
         0.3, 7.18, 12.7, 0.28, font_size=11, bold=True, color=WHITE, align=PP_ALIGN.CENTER)


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 8 — AI Engine — iSHA & Dr. ISHA
# ══════════════════════════════════════════════════════════════════════════════
sl = prs.slides.add_slide(BLANK_LAYOUT)
slide_header(sl, "AI Engine — iSHA & Dr. ISHA", "Clinical Intelligence Built In, Not Bolted On")

add_rect(sl, 0.35, 1.3, 12.6, 5.9, fill_color=NAVY)

# Central AI badge
add_rect(sl, 5.4, 1.6, 2.5, 2.5, fill_color=CYAN)
add_text(sl, "🧠", 5.85, 1.65, 1.6, 1.2, font_size=54, color=NAVY, align=PP_ALIGN.CENTER)
add_text(sl, "iSHA", 5.55, 2.8, 2.2, 0.55, font_size=24, bold=True, color=NAVY, align=PP_ALIGN.CENTER)
add_text(sl, "AI ENGINE", 5.55, 3.28, 2.2, 0.35, font_size=11, bold=True, color=NAVY, align=PP_ALIGN.CENTER)

# Spokes
ai_features = [
    (0.55, 1.55, "🗣️  Voice-to-Text Notes", "Doctor dictates — AI transcribes into\nstructured SOAP / clinical notes"),
    (0.55, 3.1,  "📊  Predictive Analytics", "Readmission risk, sepsis early warning,\nlength-of-stay forecasting"),
    (0.55, 4.65, "💊  Drug Interaction Check","Real-time alerts across all prescribed\nmedications and patient allergies"),
    (8.35, 1.55, "🩻  Radiology AI",          "Chest X-ray, CT & MRI finding assist;\nfinds abnormalities, drafts report"),
    (8.35, 3.1,  "📝  Auto ICD-10 Coding",    "Diagnosis text → ICD-10 code mapping;\nreduces billing rejections by 70%"),
    (8.35, 4.65, "🤖  Dr. ISHA Chatbot",      "24/7 symptom triage, appointment booking\n& post-discharge guidance for patients"),
]

for (x, y, title, body) in ai_features:
    add_rect(sl, x, y, 4.6, 1.3, fill_color=BLUE)
    add_text(sl, title, x + 0.12, y + 0.06, 4.3, 0.45, font_size=13, bold=True, color=CYAN)
    add_text(sl, body,  x + 0.12, y + 0.55, 4.3, 0.65, font_size=11, color=RGBColor(0xCC, 0xDD, 0xFF), wrap=True)

# Connecting dots (decorative lines — text-based arrows)
add_text(sl, "━━━━▶", 4.3, 2.75, 1.2, 0.3, font_size=14, color=CYAN, bold=True)
add_text(sl, "◀━━━━", 7.85, 2.75, 1.2, 0.3, font_size=14, color=CYAN, bold=True)

add_text(sl, "Built on LaBSE + Groq + Mistral with fine-tuned Indian clinical corpus · ABDM PHR compliant · On-premise inference available",
         0.5, 6.9, 12.2, 0.3, font_size=10, color=RGBColor(0x88, 0x99, 0xBB), align=PP_ALIGN.CENTER)


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 9 — Revenue Cycle Management
# ══════════════════════════════════════════════════════════════════════════════
sl = prs.slides.add_slide(BLANK_LAYOUT)
slide_header(sl, "Revenue Cycle & Financial Management", "Maximise Collections, Minimise Leakage, Full Compliance")

# Flow diagram top
stages = ["Registration &\nAdmission", "Service\nCapture", "Billing &\nEstimate", "Insurance /\nTPA", "Collection\n& Reconcile", "MIS &\nReporting"]
colors  = [BLUE, TEAL, BLUE, NAVY, TEAL, BLUE]
for i, (s, c) in enumerate(zip(stages, colors)):
    x = 0.35 + i * 2.18
    add_rect(sl, x, 1.35, 1.9, 1.0, fill_color=c)
    add_text(sl, s, x + 0.08, 1.42, 1.75, 0.85, font_size=11, bold=True, color=WHITE, align=PP_ALIGN.CENTER)
    if i < 5:
        add_text(sl, "▶", x + 1.9, 1.65, 0.3, 0.4, font_size=16, color=GOLD, bold=True)

# Feature cards bottom
rcm_features = [
    ("💳", "Smart Billing",
     ["Package, item & procedure billing", "Auto-capture services from orders", "Advance & deposit management", "Credit & corporate billing", "GST-compliant tax calculation"]),
    ("🏥", "Insurance & TPA",
     ["Cashless pre-auth automation", "Claim form auto-generation", "Rejection analytics & appeal", "Empanelment rate management", "NHCX / Ayushman Bharat ready"]),
    ("📈", "Collections & Finance",
     ["Daily collection dashboard", "Aging receivables tracking", "Cheque & UPI reconciliation", "Doctor payout & incentive calc", "Cost centre P&L reports"]),
    ("📊", "MIS & Analytics",
     ["100+ pre-built reports", "Bed occupancy & ALOS trends", "Department-wise revenue drill", "Doctor performance metrics", "Board-level KPI dashboard"]),
]

for i, (icon, title, pts) in enumerate(rcm_features):
    x = 0.35 + i * 3.25
    add_rect(sl, x, 2.55, 3.0, 4.55, fill_color=LIGHT_BG, line_color=BLUE, line_width_pt=1)
    add_rect(sl, x, 2.55, 3.0, 0.55, fill_color=BLUE)
    add_text(sl, icon + "  " + title, x + 0.1, 2.59, 2.75, 0.44, font_size=13, bold=True, color=WHITE)
    for pi, pt in enumerate(pts):
        add_text(sl, "✓  " + pt, x + 0.12, 3.2 + pi * 0.72, 2.72, 0.65, font_size=10.5, color=DARK_TEXT, wrap=True)


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 10 — ABDM / Regulatory Compliance
# ══════════════════════════════════════════════════════════════════════════════
sl = prs.slides.add_slide(BLANK_LAYOUT)
slide_header(sl, "Regulatory & Compliance Readiness", "Built for India — ABDM, NABH, NHCX, DPDP & More")

add_rect(sl, 0.35, 1.3, 12.6, 5.9, fill_color=LIGHT_BG)

compliance_items = [
    ("🏛️", "ABDM Certified",
     "Fully certified Health Information Provider (HIP) & Health Information User (HIU). ABHA ID linking, PHR app integration & consent-based health record sharing.", BLUE),
    ("🏥", "NABH Ready",
     "All standard NABH documentation pre-configured: MLC registers, consent forms, drug registers, blood bank records, ICU checklists & audit trail reports.", NAVY),
    ("🔒", "DPDP Compliant",
     "India Digital Personal Data Protection Act 2023 ready. Role-based access, data masking, consent logs, data localisation & breach notification workflows.", TEAL),
    ("💊", "Drug Compliance",
     "Schedule H / H1 narcotic register, CDSCO reporting, pharmacovigilance adverse event capture, expiry alerts & controlled substance dispensing audit.", BLUE),
    ("📋", "NHCX & IRDAI",
     "National Health Claims Exchange integration for real-time cashless claims. All IRDAI-mandated fields, TPA portals & Ayushman Bharat claim formats.", NAVY),
    ("📊", "Accreditation",
     "JCI, ISO 9001, NABL (lab), AERB (radiation) & state health department reporting formats pre-built. Audit-ready at any time without manual data gathering.", TEAL),
]

for i, (icon, title, body, clr) in enumerate(compliance_items):
    col = i % 2
    row = i // 2
    x = 0.5 + col * 6.35
    y = 1.45 + row * 1.9
    add_rect(sl, x, y, 6.0, 1.7, fill_color=WHITE, line_color=clr, line_width_pt=2)
    add_rect(sl, x, y, 0.45, 1.7, fill_color=clr)
    add_text(sl, icon, x + 0.04, y + 0.42, 0.38, 0.75, font_size=20, color=WHITE, align=PP_ALIGN.CENTER)
    add_text(sl, title, x + 0.6, y + 0.1, 5.2, 0.45, font_size=14, bold=True, color=clr)
    add_text(sl, body,  x + 0.6, y + 0.55, 5.2, 1.0, font_size=10.5, color=DARK_TEXT, wrap=True)


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 11 — Technology Architecture
# ══════════════════════════════════════════════════════════════════════════════
sl = prs.slides.add_slide(BLANK_LAYOUT)
slide_header(sl, "Technology Architecture", "Enterprise-Grade, Cloud-Native, Secure & Scalable")

# Layers
layers_arch = [
    (CYAN,                         WHITE,  "PRESENTATION LAYER",   "React Web App  ·  iOS App  ·  Android App  ·  PWA  ·  Kiosk  ·  WhatsApp"),
    (BLUE,                         WHITE,  "API GATEWAY & SECURITY","JWT Auth  ·  Role-Based Access  ·  mTLS  ·  Rate Limiting  ·  WAF"),
    (RGBColor(0x1E, 0x55, 0xA0),   WHITE,  "MICROSERVICES CORE",   "OPD  ·  IPD  ·  Pharmacy  ·  Lab  ·  Radiology  ·  Billing  ·  Notifications"),
    (NAVY,                         WHITE,  "AI & INTEGRATION LAYER","iSHA AI  ·  LaBSE Embeddings  ·  ABDM Gateway  ·  NHCX  ·  HL7 FHIR"),
    (RGBColor(0x0A, 0x1F, 0x55),   WHITE,  "DATA LAYER",           "PostgreSQL  ·  TimescaleDB  ·  pgvector  ·  Redis  ·  MinIO (S3)  ·  Elasticsearch"),
    (RGBColor(0x07, 0x15, 0x38),   CYAN,   "INFRASTRUCTURE",       "On-Premise / Private Cloud / AWS / Azure  ·  PM2 Cluster  ·  Nginx  ·  Let's Encrypt SSL"),
]

for i, (bg, tc, label, tech) in enumerate(layers_arch):
    y = 1.35 + i * 0.97
    add_rect(sl, 0.35, y, 12.6, 0.87, fill_color=bg)
    add_text(sl, label, 0.5,  y + 0.06, 2.8, 0.38, font_size=9,  bold=True, color=CYAN if tc == WHITE else NAVY)
    add_text(sl, tech,  3.35, y + 0.06, 9.3, 0.72, font_size=11.5, color=tc, wrap=True)
    add_rect(sl, 3.3, y, 0.04, 0.87, fill_color=CYAN)

# Side callouts
callouts = [
    ("99.9%\nUptime SLA", 0.35),
    ("HIPAA &\nABDM Ready", 2.6),
    ("< 200ms\nAPI Response", 4.85),
    ("SOC 2\nAligned", 7.1),
    ("Offline\nCapable", 9.35),
    ("Multi-site\nSupport", 11.6),
]
for txt, x in callouts:
    add_rect(sl, x, 7.1, 1.9, 0.35, fill_color=GOLD)
    add_text(sl, txt, x + 0.05, 7.12, 1.8, 0.3, font_size=8.5, bold=True, color=NAVY, align=PP_ALIGN.CENTER)


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 12 — Implementation Roadmap
# ══════════════════════════════════════════════════════════════════════════════
sl = prs.slides.add_slide(BLANK_LAYOUT)
slide_header(sl, "Implementation Roadmap", "Phased, Low-Risk Go-Live — Designed Around MGM's Operational Continuity")

phases = [
    ("Phase 1\n(Weeks 1–4)",  BLUE, "Foundation",
     ["Infrastructure setup\n& server configuration", "Core team training\n(super-users)", "Master data migration\n(patients, doctors, items)", "OPD & billing go-live\n(pilot department)"]),
    ("Phase 2\n(Weeks 5–8)",  NAVY, "Clinical Core",
     ["IPD & nursing station\ngo-live", "Pharmacy dispensing\n& indenting live", "Lab & radiology\nmodule activation", "Emergency module\n& triage workflows"]),
    ("Phase 3\n(Weeks 9–12)", TEAL, "Advanced Modules",
     ["OT scheduling &\nanaesthesia notes", "Blood bank &\nCSSD go-live", "Patient mobile app\n& WhatsApp launch", "Insurance TPA\nclaim workflows"]),
    ("Phase 4\n(Weeks 13–16)", RGBColor(0x1B, 0x5E, 0x20), "AI & Analytics",
     ["iSHA AI activation\n(voice notes, coding)", "MIS dashboards &\nC-suite reports", "ABDM / ABHA\nlinking activation", "Hypercare & full\nhandover"]),
]

for i, (phase, clr, title, tasks) in enumerate(phases):
    x = 0.35 + i * 3.27
    add_rect(sl, x, 1.35, 3.0, 5.85, fill_color=clr)
    add_rect(sl, x, 1.35, 3.0, 0.65, fill_color=CYAN if i % 2 == 0 else GOLD)
    add_text(sl, phase, x + 0.1, 1.38, 2.8, 0.56, font_size=12, bold=True, color=NAVY if i % 2 == 0 else DARK_TEXT, align=PP_ALIGN.CENTER)
    add_rect(sl, x + 0.15, 2.1, 2.7, 0.38, fill_color=WHITE)
    add_text(sl, title, x + 0.2, 2.12, 2.6, 0.35, font_size=14, bold=True, color=clr, align=PP_ALIGN.CENTER)
    for ti, task in enumerate(tasks):
        add_rect(sl, x + 0.15, 2.62 + ti * 1.12, 2.7, 1.0, fill_color=RGBColor(0xFF, 0xFF, 0xFF) if ti % 2 == 0 else RGBColor(0xEE, 0xF2, 0xFF))
        add_text(sl, "✔  " + task, x + 0.22, 2.66 + ti * 1.12, 2.5, 0.92, font_size=10.5, color=DARK_TEXT, wrap=True)

# Timeline bar
add_rect(sl, 0.35, 6.95, 12.6, 0.3, fill_color=LIGHT_BG)
add_text(sl, "All phases include dedicated implementation consultant, 24×7 support hotline, and weekly review calls with MGM leadership.",
         0.5, 6.97, 12.3, 0.26, font_size=10, color=MID_GRAY, align=PP_ALIGN.CENTER)


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 13 — ROI & Value Metrics
# ══════════════════════════════════════════════════════════════════════════════
sl = prs.slides.add_slide(BLANK_LAYOUT)
slide_header(sl, "Return on Investment", "Measurable Impact — Typically Achieved Within 12 Months of Go-Live")

add_rect(sl, 0.35, 1.3, 12.6, 5.9, fill_color=LIGHT_BG)

roi_metrics = [
    ("💰", "Revenue Impact",       BLUE, [
        ("8–12%", "reduction in billing leakage"),
        ("22%",   "increase in OPD throughput"),
        ("₹15–25L", "additional annual revenue per 100 OPD/day"),
    ]),
    ("⏱️", "Efficiency Gains",      NAVY, [
        ("60%",   "reduction in discharge TAT"),
        ("40%",   "faster lab report turnaround"),
        ("3 hrs", "saved per doctor per day on paperwork"),
    ]),
    ("😊", "Patient Satisfaction",  TEAL, [
        ("+35",   "NPS score improvement"),
        ("42%",   "drop in no-show rate via reminders"),
        ("4.6★",  "average app rating from patients"),
    ]),
    ("🏥", "Operational Excellence", BLUE, [
        ("98.5%", "bed occupancy data accuracy"),
        ("70%",   "reduction in ICD coding errors"),
        ("100%",  "NABH audit readiness — anytime"),
    ]),
]

for i, (icon, area, clr, metrics) in enumerate(roi_metrics):
    col = i % 2
    row = i // 2
    x = 0.5 + col * 6.35
    y = 1.5 + row * 2.8

    add_rect(sl, x, y, 6.0, 2.55, fill_color=WHITE, line_color=clr, line_width_pt=2)
    add_rect(sl, x, y, 6.0, 0.55, fill_color=clr)
    add_text(sl, icon + "  " + area, x + 0.12, y + 0.07, 5.7, 0.42, font_size=15, bold=True, color=WHITE)

    for mi, (val, label) in enumerate(metrics):
        mx = x + 0.2 + mi * 1.9
        add_rect(sl, mx, y + 0.65, 1.7, 1.7, fill_color=LIGHT_BG)
        add_text(sl, val,   mx + 0.08, y + 0.75, 1.55, 0.65, font_size=22, bold=True, color=clr, align=PP_ALIGN.CENTER)
        add_text(sl, label, mx + 0.08, y + 1.38, 1.55, 0.85, font_size=9,  color=MID_GRAY, align=PP_ALIGN.CENTER, wrap=True)

add_text(sl, "* Based on median outcomes across 40+ hospital implementations in India (2022–2025)",
         0.4, 7.18, 12.5, 0.28, font_size=9, color=MID_GRAY, italic=True, align=PP_ALIGN.CENTER)


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 14 — Why Mediqzy for MGM Hospitals
# ══════════════════════════════════════════════════════════════════════════════
sl = prs.slides.add_slide(BLANK_LAYOUT)
slide_header(sl, "Why Mediqzy for MGM Hospitals", "The Right Partner for MGM's Digital Transformation Journey")

add_rect(sl, 0.35, 1.3, 12.6, 5.9, fill_color=NAVY)

reasons = [
    ("🏆", "Purpose-Built for\nMulti-Specialty",
     "Not a generic ERP adapted for hospitals. Mediqzy was built ground-up for Indian multi-specialty hospitals — every workflow reflects clinical reality."),
    ("🤝", "MGM-Specific\nCustomisation",
     "We configure to your SOPs, your branding, your tariff schedules & your specialty mix — not the other way around. MGM stays in control."),
    ("🇮🇳", "India-First\nCompliance",
     "ABDM, ABHA, NHCX, Ayushman Bharat, all state NHA portals & NABH documentation are native — not add-ons you pay extra for."),
    ("🧠", "Genuine AI\n— Not Buzzwords",
     "iSHA uses LaBSE, Groq, Mistral & fine-tuned clinical models. Voice notes, auto-coding, radiology assist & predictive alerts actually work in Hindi/Tamil."),
    ("📞", "Dedicated Support\n& Partnership",
     "Named implementation consultant, 24×7 production support, quarterly clinical workflow reviews & a direct line to our product team."),
    ("📈", "Proven ROI in\n12 Months",
     "40+ hospitals have seen >8% revenue recovery and >30% efficiency gains within the first year. We back this with outcome-linked SLAs."),
]

for i, (icon, title, body) in enumerate(reasons):
    col = i % 3
    row = i // 3
    x = 0.5 + col * 4.15
    y = 1.45 + row * 2.75
    add_rect(sl, x, y, 3.9, 2.5, fill_color=BLUE)
    add_rect(sl, x, y, 0.72, 2.5, fill_color=CYAN)
    add_text(sl, icon, x + 0.1, y + 0.65, 0.55, 1.0, font_size=28, color=NAVY, align=PP_ALIGN.CENTER)
    add_text(sl, title, x + 0.82, y + 0.1, 2.9, 0.75, font_size=13, bold=True, color=CYAN)
    add_text(sl, body,  x + 0.82, y + 0.88, 2.9, 1.45, font_size=10.5, color=WHITE, wrap=True)


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 15 — Investment / Engagement Model
# ══════════════════════════════════════════════════════════════════════════════
sl = prs.slides.add_slide(BLANK_LAYOUT)
slide_header(sl, "Engagement & Investment", "Flexible Models Designed Around MGM's Scale & Growth Plans")

# 3 columns
models = [
    ("🏥", "Starter",         TEAL,
     "For single facility\n up to 100 beds",
     ["All core modules", "Up to 5 departments", "Up to 25 concurrent users", "Mobile app (patients)", "3 months go-live support", "Email & phone support"],
     "Starting from\n₹8 Lakhs / Year"),
    ("🏗️", "Enterprise",      BLUE,
     "Multi-specialty hospital\n100–500 beds",
     ["Full module suite", "Unlimited departments", "Unlimited users", "Patient app + WhatsApp AI", "iSHA AI engine included", "Dedicated CSM + 24×7 support"],
     "Custom Pricing\nBased on Bed Count"),
    ("🌐", "Group / Chain",   NAVY,
     "Multi-location groups\nlike MGM Hospitals",
     ["Central + site dashboards", "Cross-site patient records", "Group-level MIS & finance", "Franchise / network billing", "White-label mobile app", "Quarterly board reporting"],
     "Enterprise Contract\nWith SLA Guarantees"),
]

for i, (icon, tier, clr, target, features, pricing) in enumerate(models):
    x = 0.35 + i * 4.35
    is_mid = (i == 1)
    highlight = GOLD if is_mid else clr
    add_rect(sl, x, 1.3, 4.1, 5.95, fill_color=clr)
    if is_mid:
        add_rect(sl, x - 0.12, 1.18, 4.34, 6.2, fill_color=RGBColor(0xFF, 0xF5, 0xCC), line_color=GOLD, line_width_pt=3)
        add_rect(sl, x - 0.12, 1.18, 4.34, 6.2, fill_color=clr)
        add_rect(sl, x + 0.6, 1.18, 2.9, 0.38, fill_color=GOLD)
        add_text(sl, "★  RECOMMENDED FOR MGM  ★", x + 0.62, 1.2, 2.85, 0.32, font_size=9, bold=True, color=NAVY, align=PP_ALIGN.CENTER)

    add_text(sl, icon + "  " + tier, x + 0.15, 1.45, 3.7, 0.52, font_size=18, bold=True, color=WHITE, align=PP_ALIGN.CENTER)
    add_rect(sl, x + 0.15, 1.98, 3.7, 0.03, fill_color=highlight)
    add_text(sl, target, x + 0.15, 2.05, 3.7, 0.6, font_size=11, color=RGBColor(0xCC, 0xDD, 0xFF), italic=True, align=PP_ALIGN.CENTER)

    for fi, feat in enumerate(features):
        add_text(sl, "✓  " + feat, x + 0.22, 2.75 + fi * 0.6, 3.55, 0.55, font_size=10.5, color=WHITE, wrap=True)

    add_rect(sl, x + 0.15, 6.4, 3.7, 0.72, fill_color=highlight)
    add_text(sl, pricing, x + 0.2, 6.44, 3.6, 0.64, font_size=13, bold=True, color=NAVY if is_mid else WHITE, align=PP_ALIGN.CENTER)

add_text(sl, "All plans include: Implementation, Data Migration, Training, 1 Year AMC & Compliance Updates  |  GST extra  |  On-premise hardware not included",
         0.35, 7.18, 12.6, 0.28, font_size=9, color=MID_GRAY, italic=True, align=PP_ALIGN.CENTER)


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 16 — Next Steps / Call to Action
# ══════════════════════════════════════════════════════════════════════════════
sl = prs.slides.add_slide(BLANK_LAYOUT)

# Full bleed
add_rect(sl, 0, 0, 13.33, 7.5, fill_color=NAVY)
add_rect(sl, 0, 0, 13.33, 0.08, fill_color=CYAN)
add_rect(sl, 0, 7.42, 13.33, 0.08, fill_color=GOLD)

add_text(sl, "The Next Step", 1.0, 0.5, 11.0, 0.85, font_size=36, bold=True, color=WHITE, align=PP_ALIGN.CENTER)
add_text(sl, "Let's Build MGM's Digital Future — Together",
         1.0, 1.25, 11.0, 0.55, font_size=18, color=CYAN, italic=True, align=PP_ALIGN.CENTER)
add_rect(sl, 3.0, 1.9, 7.33, 0.05, fill_color=GOLD)

steps = [
    ("1", "Product Demo",          "Schedule a live demonstration of Mediqzy at MGM's premises or virtually — customised to your specialty mix and workflows."),
    ("2", "Technical Assessment",  "Our team conducts a no-obligation 1-day workflow study at one MGM facility to size the implementation correctly."),
    ("3", "Pilot Agreement",       "We propose a 90-day pilot in one department / facility — go-live in 4 weeks, outcome review at week 12."),
    ("4", "Full Rollout Contract", "Upon pilot success, a group-wide enterprise agreement with negotiated pricing, SLA guarantees and a shared success plan."),
]

for i, (num, title, body) in enumerate(steps):
    x = 0.5 + (i % 2) * 6.35
    y = 2.15 + (i // 2) * 2.25
    add_rect(sl, x, y, 6.0, 2.0, fill_color=BLUE)
    add_rect(sl, x, y, 0.65, 2.0, fill_color=CYAN)
    add_text(sl, num,   x + 0.1,  y + 0.55, 0.48, 0.75, font_size=28, bold=True, color=NAVY, align=PP_ALIGN.CENTER)
    add_text(sl, title, x + 0.78, y + 0.12, 5.0, 0.48, font_size=15, bold=True, color=WHITE)
    add_text(sl, body,  x + 0.78, y + 0.65, 5.0, 1.2,  font_size=11, color=RGBColor(0xBB, 0xCC, 0xFF), wrap=True)

# Contact strip
add_rect(sl, 0, 6.65, 13.33, 0.85, fill_color=CYAN)
add_text(sl, "📧  info@mysmarthealth.in", 0.5,  6.7, 3.5, 0.7, font_size=13, bold=True, color=NAVY)
add_text(sl, "🌐  mediqzy.com",          4.0,  6.7, 2.5, 0.7, font_size=13, bold=True, color=NAVY)
add_text(sl, "📱  app.mediqzy.com",      6.5,  6.7, 3.0, 0.7, font_size=13, bold=True, color=NAVY)
add_text(sl, "🏢  Mediqzy Healthcare Technologies Pvt. Ltd.", 9.5, 6.7, 3.5, 0.7, font_size=10, color=NAVY)


# ══════════════════════════════════════════════════════════════════════════════
# Save
# ══════════════════════════════════════════════════════════════════════════════
out_path = "/home/ubuntu/Mediczy/Mediqzy_Hospital_OS_MGM_Proposal.pptx"
prs.save(out_path)
print(f"Saved: {out_path}")
