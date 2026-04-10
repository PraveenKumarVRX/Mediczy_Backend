#!/usr/bin/env python3
"""
Mediqzy Healthcare — White Professional Marketing Deck
Matches the Mediqzy_White_Professional.pdf brand theme (white background,
dark navy text, teal/orange/green accents, clean card layouts).
Includes Smart Asset Tracking slides (RFID | BLE | GPS) after IoT slide.
"""

from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.enum.shapes import MSO_SHAPE
import os

BASE  = os.path.dirname(__file__)
LOGO  = os.path.join(BASE, "client", "public", "logo", "Mediqzy_logo.jpeg")

# ── Brand Colors (White Professional Theme) ──────────────────────────────────
WHITE      = RGBColor(0xFF, 0xFF, 0xFF)
NAVY       = RGBColor(0x0D, 0x21, 0x37)   # Primary title color
DARK_NAV   = RGBColor(0x0F, 0x17, 0x2A)   # Cover left panel
GRAY_TEXT  = RGBColor(0x64, 0x74, 0x8B)   # Body / subtitle gray
LIGHT_GRAY = RGBColor(0xE2, 0xE8, 0xF0)   # Borders / dividers
CARD_BG    = RGBColor(0xF8, 0xFA, 0xFC)   # Card background (near-white)

# Accent palette (matches PDF card headers & icons)
TEAL       = RGBColor(0x14, 0x78, 0x8C)   # Teal header / tag
TEAL_LIGHT = RGBColor(0x4D, 0xB6, 0xAC)   # Lighter teal for cover stat text
ORANGE     = RGBColor(0xCA, 0x8A, 0x04)   # Orange/amber header
GREEN      = RGBColor(0x15, 0x80, 0x3D)   # Dark green header
PURPLE     = RGBColor(0x6D, 0x28, 0xD9)   # Purple accent
BLUE       = RGBColor(0x21, 0x63, 0xAE)   # Blue accent
ROSE       = RGBColor(0xBE, 0x18, 0x5D)   # Rose accent
AMBER      = RGBColor(0xB4, 0x53, 0x09)   # Amber/dark orange
EMERALD    = RGBColor(0x05, 0x96, 0x69)   # Emerald green

# Accent underline below section tag
TEAL_ACC   = RGBColor(0x0E, 0x94, 0x88)

prs = Presentation()
prs.slide_width  = Inches(13.33)
prs.slide_height = Inches(7.5)
SW = prs.slide_width
SH = prs.slide_height


# ─────────────────────────────────────────────────────────────────────────────
# UTILITY FUNCTIONS
# ─────────────────────────────────────────────────────────────────────────────

def set_bg(slide, color=WHITE):
    bg   = slide.background
    fill = bg.fill
    fill.solid()
    fill.fore_color.rgb = color


def rect(slide, left, top, width, height, color, rounded=False):
    shape_type = MSO_SHAPE.ROUNDED_RECTANGLE if rounded else MSO_SHAPE.RECTANGLE
    s = slide.shapes.add_shape(shape_type, left, top, width, height)
    s.fill.solid()
    s.fill.fore_color.rgb = color
    s.line.fill.background()
    s.shadow.inherit = False
    return s


def txt(slide, left, top, width, height, text,
        size=13, color=NAVY, bold=False, align=PP_ALIGN.LEFT, italic=False):
    tb = slide.shapes.add_textbox(left, top, width, height)
    tf = tb.text_frame
    tf.word_wrap = True
    p  = tf.paragraphs[0]
    p.text = text
    p.font.size    = Pt(size)
    p.font.color.rgb = color
    p.font.bold    = bold
    p.font.italic  = italic
    p.font.name    = "Calibri"
    p.alignment    = align
    return tb


def multiline(slide, left, top, width, height, lines,
              size=12, color=GRAY_TEXT, spacing=Pt(4)):
    tb = slide.shapes.add_textbox(left, top, width, height)
    tf = tb.text_frame
    tf.word_wrap = True
    for i, line in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.text = line
        p.font.size = Pt(size)
        p.font.color.rgb = color
        p.font.name = "Calibri"
        p.space_after = spacing
    return tb


def bullets(slide, left, top, width, height, items,
            size=13, color=NAVY, bullet="✓", spacing=Pt(5)):
    tb = slide.shapes.add_textbox(left, top, width, height)
    tf = tb.text_frame
    tf.word_wrap = True
    for i, item in enumerate(items):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.text = f"{bullet}  {item}"
        p.font.size = Pt(size)
        p.font.color.rgb = color
        p.font.name = "Calibri"
        p.space_after = spacing
    return tb


def logo(slide, left, top, width, height):
    if os.path.exists(LOGO):
        slide.shapes.add_picture(LOGO, left, top, width, height)


# White-theme section header: tag pill + title + italic subtitle + underline
def section_header(slide, tag_text, title, subtitle=None, tag_color=TEAL):
    # Tag pill (top-left)
    rect(slide, Inches(0.8), Inches(0.3), Inches(2.4), Inches(0.28), tag_color, rounded=True)
    txt(slide, Inches(0.8), Inches(0.3), Inches(2.4), Inches(0.28),
        tag_text, size=9, color=WHITE, bold=True, align=PP_ALIGN.CENTER)
    # Title
    txt(slide, Inches(0.8), Inches(0.72), Inches(11.5), Inches(0.65),
        title, size=36, color=NAVY, bold=True)
    # Subtitle
    if subtitle:
        txt(slide, Inches(0.8), Inches(1.37), Inches(11.5), Inches(0.35),
            subtitle, size=13, color=GRAY_TEXT, italic=True)
    # Underline accent
    rect(slide, Inches(0.8), Inches(1.78), Inches(2.0), Inches(0.04), TEAL_ACC)


# White card with coloured top border and optional icon + title + desc
def feature_card(slide, x, y, w, h, header_color, icon, title, body,
                 icon_size=22, title_size=14, body_size=11):
    rect(slide, x, y, w, h, CARD_BG, rounded=True)
    # thin coloured top bar
    rect(slide, x + Inches(0.04), y + Inches(0.04), w - Inches(0.08), Inches(0.04), header_color)
    if icon:
        txt(slide, x + Inches(0.2), y + Inches(0.15), Inches(0.5), Inches(0.45),
            icon, size=icon_size, color=header_color)
    title_x = x + Inches(0.7) if icon else x + Inches(0.25)
    title_w = w - Inches(0.95) if icon else w - Inches(0.5)
    txt(slide, title_x, y + Inches(0.17), title_w, Inches(0.35),
        title, size=title_size, color=NAVY, bold=True)
    txt(slide, x + Inches(0.25), y + Inches(0.6), w - Inches(0.5), h - Inches(0.75),
        body, size=body_size, color=GRAY_TEXT)


# ═════════════════════════════════════════════════════════════════════════════
# SLIDE 1 — COVER (Left: dark navy; Right: white with stats)
# ═════════════════════════════════════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_bg(slide, WHITE)

# Left dark panel
rect(slide, Inches(0), Inches(0), Inches(6.5), Inches(7.5), DARK_NAV)

# Logo
logo(slide, Inches(0.5), Inches(0.5), Inches(1.6), Inches(1.6))

# Tagline
txt(slide, Inches(0.5), Inches(2.1), Inches(5.6), Inches(0.35),
    "Your Health, Our Priority", size=12, color=TEAL_LIGHT, italic=True)

# Hero title
txt(slide, Inches(0.5), Inches(2.6), Inches(5.5), Inches(2.2),
    "Powering\nTomorrow's\nHealthcare\nDelivery",
    size=40, color=WHITE, bold=True)

# Description
txt(slide, Inches(0.5), Inches(5.0), Inches(5.5), Inches(0.8),
    "India's most comprehensive AI-powered practice management,\npatient engagement, and insurance ecosystem platform.",
    size=13, color=LIGHT_GRAY)

# URL pill
rect(slide, Inches(0.5), Inches(6.1), Inches(2.3), Inches(0.38), TEAL, rounded=True)
txt(slide, Inches(0.5), Inches(6.12), Inches(2.3), Inches(0.35),
    "app.mediqzy.com", size=12, color=WHITE, bold=True, align=PP_ALIGN.CENTER)

# Right side — big "AI" watermark text
txt(slide, Inches(7.5), Inches(0.5), Inches(5.5), Inches(4.0),
    "AI", size=200, color=RGBColor(0xD0, 0xE8, 0xF0), bold=True, align=PP_ALIGN.CENTER)

# Stats grid (2×2 + 1)
stats = [
    ("20+", "User Portals",    TEAL),
    ("12",  "AI Capabilities", ORANGE),
    ("400+","Features",        TEAL),
    ("199+","API Modules",     ORANGE),
    ("34+", "Specializations", TEAL),
]
positions = [(6.8, 3.8), (9.8, 3.8), (6.8, 5.2), (9.8, 5.2), (8.3, 3.8)]
for (val, lbl, acc), (lx, ly) in zip(stats[:4], positions[:4]):
    rect(slide, Inches(lx), Inches(ly), Inches(2.7), Inches(1.2), CARD_BG, rounded=True)
    rect(slide, Inches(lx + 0.08), Inches(ly + 0.06), Inches(2.54), Inches(0.04), acc)
    txt(slide, Inches(lx), Inches(ly + 0.15), Inches(2.7), Inches(0.6),
        val, size=32, color=NAVY, bold=True, align=PP_ALIGN.CENTER)
    txt(slide, Inches(lx), Inches(ly + 0.78), Inches(2.7), Inches(0.3),
        lbl, size=11, color=GRAY_TEXT, align=PP_ALIGN.CENTER)


# ═════════════════════════════════════════════════════════════════════════════
# SLIDE 2 — PLATFORM OVERVIEW
# ═════════════════════════════════════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_bg(slide, WHITE)
section_header(slide, "PLATFORM OVERVIEW", "Solutions for Each & Everyone",
               "A unified platform serving the entire healthcare ecosystem")

stakeholders = [
    ("🏥", "Hospitals & Clinics",    "30+ modules: OPD/IPD, billing, beds, EHR, MRD",                TEAL),
    ("👤", "Patients & Families",    "AI Doctor, telemedicine, health records, insurance",              ORANGE),
    ("👨‍⚕️", "Doctors & Clinicians",  "AI Scribe, CDSS, EMR, prescriptions, video consults",            GREEN),
    ("🏢", "Corporates & Insurers",  "Wellness programs, TPA, broker, claims management",               TEAL),
    ("💊", "Pharmacies",             "POS, inventory, batch tracking, purchase orders",                 ORANGE),
    ("🧪", "Labs & Diagnostics",     "Test catalog, samples, results, RIS/PACS, DICOM",                GREEN),
]
for i, (icon, title, desc, acc) in enumerate(stakeholders):
    col, row = i % 3, i // 3
    x = Inches(0.6 + col * 4.15)
    y = Inches(2.05 + row * 2.5)
    feature_card(slide, x, y, Inches(3.85), Inches(2.2), acc, icon, title, desc,
                 icon_size=26, title_size=15, body_size=12)


# ═════════════════════════════════════════════════════════════════════════════
# SLIDE 3 — HEALTHCARE OPERATING SYSTEM
# ═════════════════════════════════════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_bg(slide, WHITE)
section_header(slide, "FULL FEATURE SET", "Healthcare Operating System",
               "Clinical + Operational + AI — all in one platform")

pillars = [
    ("Clinical Intelligence", TEAL, [
        "Electronic Health Records (EHR)",
        "AI Scribe & AI Vision",
        "CDSS — Drug Interactions, ICD-10",
        "Digital Prescriptions & Templates",
        "RIS/PACS — Tele-Radiology",
        "Lab & Imaging Integration",
        "Consent & Privacy Management",
        "Nursing Station & Vitals",
    ]),
    ("Operational Suite", ORANGE, [
        "OPD / IPD Management",
        "Appointment Scheduling & Queue",
        "Pharmacy POS & Inventory",
        "Billing & Revenue Cycle",
        "Insurance Claims & TPA",
        "Ambulance Dispatch & Tracking",
        "CRM & Patient Engagement",
        "Webinar & Health Camps",
    ]),
    ("AI & Analytics", GREEN, [
        "AI Doctor — 24/7 Health Assistant",
        "Health Risk Assessment",
        "Analytics & KPI Dashboards",
        "IoT Patient Monitoring",
        "Remote Patient Monitoring (RPM)",
        "Wearable Device Integration",
        "Report Builder & Insights",
        "Workflow Automation (N8n)",
    ]),
]
for i, (title, acc, items) in enumerate(pillars):
    x = Inches(0.6 + i * 4.15)
    # Header
    rect(slide, x, Inches(2.0), Inches(3.85), Inches(0.5), acc)
    txt(slide, x, Inches(2.05), Inches(3.85), Inches(0.4),
        title, size=14, color=WHITE, bold=True, align=PP_ALIGN.CENTER)
    # Body card
    rect(slide, x, Inches(2.55), Inches(3.85), Inches(4.6), CARD_BG)
    bullets(slide, x + Inches(0.2), Inches(2.65), Inches(3.5), Inches(4.4),
            items, size=12, color=NAVY, bullet="✓", spacing=Pt(4))


# ═════════════════════════════════════════════════════════════════════════════
# SLIDE 4 — MEASURABLE IMPACT
# ═════════════════════════════════════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_bg(slide, WHITE)
section_header(slide, "MEASURABLE IMPACT", "Striving Towards Excellence",
               "A platform designed for measurable, quantifiable results")

impact = [
    ("⏱️",  "40%",    "Reduction in Patient\nWaiting Time",    TEAL),
    ("📋",  "56%",    "Drop in Administrative\nWorkload",       ORANGE),
    ("📅",  "70%",    "Appointments\nBooked Online",            TEAL),
    ("🛡️", "65%",    "Reduction in\nMedical Errors",           ORANGE),
    ("👨‍⚕️","5.5 hrs","Doctor Time Saved\nPer Week",           TEAL),
    ("💰",  "₹2 Bn+", "Potential Annual\nRevenue Impact",      GREEN),
]
for i, (icon, value, label, acc) in enumerate(impact):
    col, row = i % 3, i // 3
    x = Inches(0.7 + col * 4.0)
    y = Inches(2.0 + row * 2.55)
    rect(slide, x, y, Inches(3.6), Inches(2.3), CARD_BG, rounded=True)
    rect(slide, x + Inches(0.1), y + Inches(0.06), Inches(3.4), Inches(0.04), acc)
    txt(slide, x + Inches(0.25), y + Inches(0.2), Inches(0.6), Inches(0.55),
        icon, size=26, color=acc)
    txt(slide, x + Inches(0.9), y + Inches(0.18), Inches(2.4), Inches(0.6),
        value, size=34, color=acc, bold=True)
    rect(slide, x + Inches(0.25), y + Inches(0.9), Inches(2.0), Inches(0.03), acc)
    txt(slide, x + Inches(0.25), y + Inches(1.05), Inches(3.1), Inches(1.0),
        label, size=13, color=NAVY)


# ═════════════════════════════════════════════════════════════════════════════
# SLIDE 5 — 9 INTEGRATED AI CAPABILITIES
# ═════════════════════════════════════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_bg(slide, WHITE)
section_header(slide, "AI-POWERED", "12 Integrated AI Capabilities",
               "Built for clinicians, not bolted on — every AI feature runs natively within the clinical workflow")

ai_caps = [
    ("🎙️", "AI Scribe",             "Offline speech-to-text clinical notes.\nWhisper.cpp + custom GGUF. Full privacy.",          TEAL),
    ("🧠", "CDSS",                  "Drug interaction alerts, ICD-10 coding,\ndifferential diagnosis at point of care.",           ORANGE),
    ("👁️", "AI Vision",             "Clinical image analysis, dermatology &\ndiagnostic imaging, real-time AI findings.",          GREEN),
    ("🤖", "AI Doctor",             "24/7 GPT/Gemini/Claude/Groq assistant,\nsymptom triage, multi-language support.",             TEAL),
    ("📈", "Health Intelligence",   "ML-based predictions, risk scoring,\nplatform-wide business intelligence.",                   ORANGE),
    ("❤️", "Health Risk Assessment","5-minute personalized risk scoring with\npredictive health insights.",                         GREEN),
    ("💡", "AI Brain",              "Embeddings-based medical knowledge\nretrieval for clinical decision support.",                 TEAL),
    ("🎤", "Voice Navigation",      "Hands-free speech navigation throughout\nthe entire clinical workflow.",                       ORANGE),
    ("📊", "AI Analytics",          "Platform-wide analytics, KPI dashboards\nand workforce health metrics.",                      GREEN),
    ("🖥️", "Local AI Node",         "On-premise / edge AI processing node.\nNo cloud dependency, full data sovereignty.",          TEAL),
    ("🔬", "Medical AI",            "Specialised medical inference engine —\ndrug dosing, triage scoring, lab interpretation.",    ORANGE),
    ("📴", "Offline AI Scribe",     "Fully air-gapped clinical documentation\nwith local GGUF model — zero internet needed.",      GREEN),
]
# 4 rows × 3 cols
for i, (icon, title, desc, acc) in enumerate(ai_caps):
    col, row = i % 3, i // 3
    x = Inches(0.5 + col * 4.25)
    y = Inches(2.05 + row * 1.33)
    feature_card(slide, x, y, Inches(4.0), Inches(1.2), acc, icon, title, desc,
                 icon_size=18, title_size=12, body_size=9.5)


# ═════════════════════════════════════════════════════════════════════════════
# SLIDE 6 — RIS / PACS — TELE-RADIOLOGY
# ═════════════════════════════════════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_bg(slide, WHITE)
section_header(slide, "RADIOLOGY SUITE", "RIS / PACS — Tele-Radiology",
               "End-to-end radiology workflow from order to final report with AI-assisted diagnostics")

# Left: DICOM modalities box
rect(slide, Inches(0.6), Inches(2.0), Inches(6.2), Inches(4.9), DARK_NAV, rounded=True)
txt(slide, Inches(0.8), Inches(2.15), Inches(5.8), Inches(0.35),
    "DICOM Modalities Supported", size=13, color=WHITE, bold=True)

modalities = [("X-Ray", "CT Scan", "MRI"), ("Ultrasound", "Mammography", "PET-CT")]
for row, row_items in enumerate(modalities):
    for col, m in enumerate(row_items):
        mx = Inches(0.85 + col * 1.95)
        my = Inches(2.65 + row * 0.8)
        rect(slide, mx, my, Inches(1.75), Inches(0.55), TEAL, rounded=True)
        txt(slide, mx, my + Inches(0.08), Inches(1.75), Inches(0.38),
            m, size=12, color=WHITE, bold=True, align=PP_ALIGN.CENTER)

# Standards badges
standards = ["DICOM", "HL7", "FHIR", "IHE XDS"]
txt(slide, Inches(0.8), Inches(4.4), Inches(1.2), Inches(0.3),
    "Standards:", size=11, color=LIGHT_GRAY)
for j, s in enumerate(standards):
    sx = Inches(1.9 + j * 1.1)
    rect(slide, sx, Inches(4.42), Inches(0.95), Inches(0.3), RGBColor(0x1E, 0x29, 0x3B), rounded=True)
    txt(slide, sx, Inches(4.44), Inches(0.95), Inches(0.26),
        s, size=9, color=WHITE, bold=True, align=PP_ALIGN.CENTER)

# Integrated ordering note
rect(slide, Inches(0.7), Inches(4.9), Inches(6.0), Inches(0.65), RGBColor(0x1E, 0x29, 0x3B), rounded=True)
txt(slide, Inches(0.9), Inches(4.97), Inches(5.6), Inches(0.5),
    "🔗  Integrated ordering from OPD / IPD / ER\n      with smart priority tagging",
    size=11, color=TEAL_LIGHT)

# Right: 4 feature cards (stacked)
ris_right = [
    ("PACS Viewer",      "DICOM viewing with zoom, pan, measure tools, multi-frame & 3D MPR",                            TEAL),
    ("Tele-Radiology",   "Remote specialist reads with SLA tracking, priority escalation, second opinion workflow",        ORANGE),
    ("AI-Assisted Reads","Auto-detection of anomalies, priority flagging, structured AI annotations",                     GREEN),
    ("Structured Reports","Specialty templates, voice dictation, auto-populated findings, digital signatures",             TEAL),
]
for i, (title, desc, acc) in enumerate(ris_right):
    ry = Inches(2.0 + i * 1.24)
    rect(slide, Inches(7.1), ry, Inches(5.8), Inches(1.1), CARD_BG, rounded=True)
    rect(slide, Inches(7.1), ry, Inches(0.06), Inches(1.1), acc)
    txt(slide, Inches(7.3), ry + Inches(0.1), Inches(5.3), Inches(0.3),
        title, size=14, color=NAVY, bold=True)
    txt(slide, Inches(7.3), ry + Inches(0.45), Inches(5.3), Inches(0.55),
        desc, size=11, color=GRAY_TEXT)


# ═════════════════════════════════════════════════════════════════════════════
# SLIDE 7 — IOT PATIENT MONITORING
# ═════════════════════════════════════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_bg(slide, WHITE)
section_header(slide, "CONNECTED HEALTHCARE", "IoT Patient Monitoring System",
               "Real-time vitals streaming, smart alerting, and predictive analytics from bedside to home")

iot_cards = [
    ("❤️",  "Vital Signs",         "Heart rate, SpO2, BP, temperature, ECG,\nrespiratory rate — real-time streaming",          TEAL),
    ("📶",  "Connected Devices",   "Pulse oximeters, BP monitors, glucometers,\nECG patches, smart scales",                    ORANGE),
    ("🔔",  "Smart Alerting",      "Abnormal vitals auto-alert with escalation to\ndoctor, nurse & family",                    GREEN),
    ("📈",  "Predictive Analytics","Trend analysis, deterioration scoring,\ncohort comparison",                                TEAL),
    ("🏠",  "Remote Monitoring",   "Home RPM for chronic disease, post-discharge,\ncaregiver access",                         ORANGE),
    ("🏥",  "Bedside Integration", "ICU/ward live monitors, nurse dashboard,\nEMR auto-documentation",                        GREEN),
]
for i, (icon, title, desc, acc) in enumerate(iot_cards):
    col, row = i % 3, i // 3
    x = Inches(0.5 + col * 4.15)
    y = Inches(2.05 + row * 2.35)
    feature_card(slide, x, y, Inches(3.9), Inches(2.15), acc, icon, title, desc,
                 icon_size=24, title_size=14, body_size=12)

# Wearables footer bar
rect(slide, Inches(0.5), Inches(6.95), Inches(12.3), Inches(0.4), CARD_BG, rounded=True)
txt(slide, Inches(0.5), Inches(6.98), Inches(12.3), Inches(0.35),
    "Supported Wearables:  Apple Watch  ·  Samsung  ·  Fitbit  ·  Garmin  ·  Oura  ·  Withings  ·  Omron  ·  Xiaomi",
    size=11, color=TEAL, align=PP_ALIGN.CENTER)


# ═════════════════════════════════════════════════════════════════════════════
# SLIDE 8 — SMART ASSET TRACKING (RFID | BLE | GPS)          ← NEW
# ═════════════════════════════════════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_bg(slide, WHITE)
section_header(slide, "ASSET TRACKING", "Smart Asset Tracking (RFID | BLE | GPS)",
               "Real-time tracking of hospital assets across departments — from sticker tags to GPS units")

# Left column — tracking technology cards
tracking_tech = [
    ("📡", "Passive RFID  (Software-Ready)",
     "Architecture supports low-cost sticker tags.\nExit gate readers trigger theft alerts when\ntagged items leave unauthorised zones.",
     TEAL),
    ("📶", "BLE Tracking  (Software-Ready)",
     "Indoor real-time location with 1–3 m accuracy.\nBeacon infrastructure maps asset movement\nacross floors, wards, and departments.",
     ORANGE),
    ("🛰️", "GPS Tracking  (Live)",
     "Live location for ambulances and mobile\nhealthcare units — fully operational. Route\nhistory, idle time & dispatch management.",
     GREEN),
]
for i, (icon, title, desc, acc) in enumerate(tracking_tech):
    y = Inches(2.05 + i * 1.75)
    feature_card(slide, Inches(0.55), y, Inches(5.8), Inches(1.6), acc, icon, title, desc,
                 icon_size=24, title_size=14, body_size=11)

# Right column — capabilities list
rect(slide, Inches(6.9), Inches(2.0), Inches(6.0), Inches(5.4), CARD_BG, rounded=True)
rect(slide, Inches(6.9), Inches(2.0), Inches(6.0), Inches(0.5), TEAL, rounded=True)
txt(slide, Inches(6.9), Inches(2.06), Inches(6.0), Inches(0.4),
    "Unified RTLS Engine — Complete Visibility",
    size=13, color=WHITE, bold=True, align=PP_ALIGN.CENTER)

rtls_items = [
    ("📍", "Real-Time Asset Map",
     "Live floor-plan view of every tagged asset across\nall departments — filter by category, zone, or status."),
    ("🏷️", "Asset Registry",
     "Centralised database of equipment with maintenance\nhistory, warranty records, and assignment logs."),
    ("🚨", "Zone-Based Alerts",
     "Configured alert zones (ICU, OT, pharmacy, exits).\nUnauthorised movement triggers instant notifications."),
    ("📊", "Utilisation Reports",
     "Asset usage frequency, idle-time analysis,\nand department-wise allocation dashboards."),
    ("🔧", "Maintenance Scheduler",
     "Usage-cycle tracking auto-generates service\nworkorders before equipment failures occur."),
]
for j, (icon, title, body) in enumerate(rtls_items):
    iy = Inches(2.65 + j * 0.93)
    rect(slide, Inches(7.0), iy, Inches(5.8), Inches(0.85), WHITE, rounded=True)
    txt(slide, Inches(7.1), iy + Inches(0.06), Inches(0.4), Inches(0.35),
        icon, size=18, color=TEAL)
    txt(slide, Inches(7.55), iy + Inches(0.06), Inches(4.8), Inches(0.25),
        title, size=12, color=NAVY, bold=True)
    txt(slide, Inches(7.55), iy + Inches(0.33), Inches(5.0), Inches(0.45),
        body, size=10, color=GRAY_TEXT)

# Bottom protocol bar
rect(slide, Inches(0.5), Inches(7.05), Inches(12.3), Inches(0.32), TEAL, rounded=True)
txt(slide, Inches(0.5), Inches(7.08), Inches(12.3), Inches(0.26),
    "Protocols:  ISO 15693 (RFID)  •  IEEE 802.15.1 (BLE)  •  NMEA 0183 (GPS)  •  MQTT  •  REST API  •  WebSocket Streams",
    size=10, color=WHITE, bold=True, align=PP_ALIGN.CENTER)


# ═════════════════════════════════════════════════════════════════════════════
# SLIDE 9 — ASSET INTELLIGENCE & BUSINESS IMPACT             ← NEW
# ═════════════════════════════════════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_bg(slide, WHITE)
section_header(slide, "ASSET INTELLIGENCE", "Asset Intelligence & Business Impact",
               "AI-driven visibility, zone-aware alerting, and predictive maintenance — all in one dashboard")

# Impact stats row
impact_asset = [
    ("30–40%", "Reduction in\nAsset Loss",              TEAL),
    ("20–30%", "Lower Equipment\nCost",                  ORANGE),
    ("25%",    "Faster Asset\nRetrieval",                GREEN),
    ("99%",    "Asset Location\nAccuracy (BLE)",         TEAL),
]
for i, (val, lbl, acc) in enumerate(impact_asset):
    ix = Inches(0.6 + i * 3.15)
    rect(slide, ix, Inches(2.0), Inches(2.9), Inches(1.15), CARD_BG, rounded=True)
    rect(slide, ix + Inches(0.08), Inches(2.06), Inches(2.74), Inches(0.04), acc)
    txt(slide, ix + Inches(0.15), Inches(2.16), Inches(1.5), Inches(0.5),
        val, size=26, color=acc, bold=True)
    txt(slide, ix + Inches(1.65), Inches(2.2), Inches(1.1), Inches(0.5),
        lbl, size=10, color=GRAY_TEXT)

# Left feature column
left_feat = [
    ("📍", "Live Asset Dashboard",
     "Real-time map view of every tagged asset across all floors and departments. "
     "Filter by category, zone, or alert status. One-click asset history log.",
     TEAL),
    ("🚨", "Zone-Based Smart Alerts",
     "Automated alerts for ICU, OT, pharmacy vaults, and exit gates. "
     "Unauthorized movement detection with instant escalation to security and department heads.",
     ORANGE),
    ("🤖", "AI-Driven Asset Allocation",
     "Machine learning predicts equipment demand by department, shift, and admission volume. "
     "Prevents bottlenecks before they happen.",
     GREEN),
]
for i, (icon, title, desc, acc) in enumerate(left_feat):
    fy = Inches(3.3 + i * 1.4)
    rect(slide, Inches(0.5), fy, Inches(6.0), Inches(1.25), CARD_BG, rounded=True)
    rect(slide, Inches(0.5), fy, Inches(0.06), Inches(1.25), acc)
    txt(slide, Inches(0.7), fy + Inches(0.08), Inches(0.4), Inches(0.35),
        icon, size=20, color=acc)
    txt(slide, Inches(1.2), fy + Inches(0.1), Inches(5.0), Inches(0.3),
        title, size=13, color=NAVY, bold=True)
    txt(slide, Inches(1.2), fy + Inches(0.45), Inches(5.0), Inches(0.72),
        desc, size=10, color=GRAY_TEXT)

# Right feature column
right_feat = [
    ("🔧", "Predictive Maintenance",
     "Track asset usage cycles and flag equipment due for servicing before failure. "
     "Integrated work-order generation with biomedical teams.",
     TEAL),
    ("📊", "Utilisation Analytics",
     "Benchmark asset usage rates by ward, shift, and doctor. "
     "Identify idle or hoarded equipment and redeploy in real time.",
     ORANGE),
    ("💰", "ROI Impact",
     "30–40% reduction in asset loss  •  20–30% lower equipment costs  •  "
     "80% fewer manual audit hours across a 200-bed hospital.",
     GREEN),
]
for i, (icon, title, desc, acc) in enumerate(right_feat):
    fy = Inches(3.3 + i * 1.4)
    rect(slide, Inches(6.9), fy, Inches(6.1), Inches(1.25), CARD_BG, rounded=True)
    rect(slide, Inches(6.9), fy, Inches(0.06), Inches(1.25), acc)
    txt(slide, Inches(7.1), fy + Inches(0.08), Inches(0.4), Inches(0.35),
        icon, size=20, color=acc)
    txt(slide, Inches(7.6), fy + Inches(0.1), Inches(5.1), Inches(0.3),
        title, size=13, color=NAVY, bold=True)
    txt(slide, Inches(7.6), fy + Inches(0.45), Inches(5.1), Inches(0.72),
        desc, size=10, color=GRAY_TEXT)

# Bottom ribbon
rect(slide, Inches(0), Inches(7.15), Inches(13.33), Inches(0.35), TEAL)
txt(slide, Inches(0), Inches(7.18), Inches(13.33), Inches(0.3),
    "🛰️  GPS Live (Ambulances)  •  📡  RFID Software-Ready  •  📶  BLE Software-Ready  •  🤖  AI Allocation  •  🔔  Zone Alerts  •  📊  Utilisation Dashboards",
    size=10, color=WHITE, bold=True, align=PP_ALIGN.CENTER)


# ═════════════════════════════════════════════════════════════════════════════
# SLIDE 10 — TELEMEDICINE & VIRTUAL CARE
# ═════════════════════════════════════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_bg(slide, WHITE)
section_header(slide, "VIRTUAL CARE", "Telemedicine & Virtual Care",
               "Enterprise-grade video consultations with full data sovereignty")

# Left — features list in dark box
rect(slide, Inches(0.5), Inches(2.0), Inches(6.4), Inches(5.3), DARK_NAV, rounded=True)
rect(slide, Inches(0.5), Inches(2.0), Inches(6.4), Inches(0.45), NAVY, rounded=True)
txt(slide, Inches(0.5), Inches(2.06), Inches(6.4), Inches(0.35),
    "Key Capabilities", size=14, color=WHITE, bold=True, align=PP_ALIGN.CENTER)

tele_items = [
    "Self-hosted LiveKit server — no third-party data sharing",
    "HD video + audio + real-time chat consultations",
    "HIPAA-compliant recording & complete audit trails",
    "Agora RTC as backup — zero downtime guarantee",
    "Integrated payment via Health Coins or membership",
    "Progressive Web App — works on all devices",
    "Automated scheduling: email, WhatsApp & SMS reminders",
    "Prescription sharing & lab order placement during call",
]
bullets(slide, Inches(0.75), Inches(2.6), Inches(6.0), Inches(4.5),
        tele_items, size=13, color=LIGHT_GRAY, bullet="✓", spacing=Pt(7))

# Right — 4 attribute cards (stacked 2×2)
tele_right = [
    ("🔒", "HIPAA Compliant",  "End-to-end encryption · Audit trail & consent · Zero-trust security", TEAL),
    ("🌐", "Self-Hosted",      "LiveKit server v1.9.11 · Full data sovereignty · No vendor lock-in",   ORANGE),
    ("📱", "Multi-Channel",    "Video · Audio · Chat · WhatsApp · SMS · Email · Push notifications",   GREEN),
    ("⚡", "Low Latency",      "WebSocket signaling · Cloudflare CDN edge · Sub-second connection",   TEAL),
]
for i, (icon, title, desc, acc) in enumerate(tele_right):
    col, row = i % 2, i // 2
    rx = Inches(7.2 + col * 3.05)
    ry = Inches(2.0 + row * 2.7)
    feature_card(slide, rx, ry, Inches(2.85), Inches(2.5), acc, icon, title, desc,
                 icon_size=26, title_size=14, body_size=12)


# ═════════════════════════════════════════════════════════════════════════════
# SLIDE 11 — PATIENT EXPERIENCE
# ═════════════════════════════════════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_bg(slide, WHITE)
section_header(slide, "PATIENT EXPERIENCE", "Skip the Queue — Let Patients Take Charge",
               "Empower patients with online management, self check-ins, and 24/7 AI assistance")

# Top stats row
pat_stats = [
    ("95%",   "Improvement in Patient Throughput",    TEAL),
    ("1/3rd", "Hours Saved in Appointment Booking",   ORANGE),
    ("56%",   "Reduction in Admin Workflows",         GREEN),
]
for i, (val, lbl, acc) in enumerate(pat_stats):
    sx = Inches(0.6 + i * 4.15)
    rect(slide, sx, Inches(2.0), Inches(3.9), Inches(0.95), CARD_BG, rounded=True)
    rect(slide, sx + Inches(0.1), Inches(2.06), Inches(3.7), Inches(0.04), acc)
    txt(slide, sx + Inches(0.2), Inches(2.15), Inches(1.4), Inches(0.6),
        val, size=28, color=acc, bold=True)
    txt(slide, sx + Inches(1.6), Inches(2.2), Inches(2.1), Inches(0.55),
        lbl, size=11, color=GRAY_TEXT)

# Feature cards (8 in 4×2 grid)
pat_feat = [
    ("🤖", "AI Doctor",          "24/7 AI health assistant\nSymptom analysis & triage\nMulti-language support",         TEAL),
    ("📹", "Video Consult",      "HD video consultations\nChat & audio calls\nRecording & audit trail",                 ORANGE),
    ("❤️", "Health Dashboard",   "Real-time vitals tracking\nWearable integration\nAI health insights",                 GREEN),
    ("📈", "Health Intelligence","Health Risk Assessment\nPersonalized analytics\nPredictive insights",                  TEAL),
    ("📄", "Health Records",     "OCR report scanning\nABDM/ABHA integration\nCloud document storage",                  ORANGE),
    ("💳", "Digital Wallet",     "Health Coins (1 HC = ₹1)\nMembership plans\nFamily account support",                 GREEN),
    ("🏆", "Wellness",           "Gamified challenges\nDiet & nutrition plans\nWellness calendar",                       TEAL),
    ("🚑", "Emergency",          "24/7 triage & dispatch\nAmbulance tracking\nDoctor dispatch",                         ORANGE),
]
for i, (icon, title, desc, acc) in enumerate(pat_feat):
    col, row = i % 4, i // 4
    x = Inches(0.5 + col * 3.2)
    y = Inches(3.15 + row * 2.1)
    feature_card(slide, x, y, Inches(3.0), Inches(1.92), acc, icon, title, desc,
                 icon_size=20, title_size=13, body_size=10)


# ═════════════════════════════════════════════════════════════════════════════
# SLIDE 12 — HOSPITAL & ENTERPRISE MANAGEMENT
# ═════════════════════════════════════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_bg(slide, WHITE)
section_header(slide, "ENTERPRISE MANAGEMENT", "Hospital & Enterprise Management",
               "50+ integrated modules for end-to-end hospital operations")

hosp_mods = [
    ("🏥", "OPD / IPD",          "Outpatient & inpatient\nAdmission workflows\nDischarge summaries",      TEAL),
    ("💰", "Revenue Cycle",      "Billing & collections\nInsurance claims\nPayment processing",            ORANGE),
    ("👥", "Staff Management",   "Scheduling & shifts\nPerformance tracking\nRole-based access",           GREEN),
    ("🧪", "Lab & Imaging",      "Order management\nResult integration\nSample tracking",                 TEAL),
    ("💊", "Pharmacy",           "POS system\nInventory management\nExpiry & batch tracking",              ORANGE),
    ("📊", "Analytics & MRD",   "Revenue analytics\nMedical Records Dept\nCompliance reports",            GREEN),
    ("📡", "Communication Hub", "Team chat, WhatsApp\nEmail & SMS alerts\nReferral management",           TEAL),
    ("🤝", "CRM Module",        "Lead & patient pipeline\nRFQ management\nEngagement tracking",           ORANGE),
    ("🎥", "Webinar System",    "Doctor-led webinars\nPublic & corporate sessions\nRecording & analytics", GREEN),
    ("🏕️", "Health Camps",      "Camp scheduling\nBulk screening workflows\nReport generation",           TEAL),
    ("📋", "Report Builder",    "Custom report templates\nDrag-and-drop builder\nExport to PDF / Excel",  ORANGE),
    ("⚙️", "Workflow Automation","N8n-powered automations\nWebhook triggers\nAuto-reminders & tasks",     GREEN),
]
for i, (icon, title, desc, acc) in enumerate(hosp_mods):
    col, row = i % 4, i // 3
    x = Inches(0.5 + col * 3.2)
    y = Inches(2.05 + (i // 4) * 1.72)
    feature_card(slide, x, y, Inches(3.0), Inches(1.58), acc, icon, title, desc,
                 icon_size=20, title_size=13, body_size=10)


# ═════════════════════════════════════════════════════════════════════════════
# SLIDE 13 — INSURANCE & CORPORATE WELLNESS
# ═════════════════════════════════════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_bg(slide, WHITE)
section_header(slide, "INSURANCE & WELLNESS", "Insurance & Corporate Wellness",
               "Complete insurance pipeline & enterprise health management")

# Flow diagram
txt(slide, Inches(0.8), Inches(2.0), Inches(12), Inches(0.35),
    "End-to-End Insurance Flow", size=14, color=NAVY, bold=True)

flow = ["Hospital", "TPA", "Insurer", "Corporate", "Broker"]
flow_colors = [TEAL, NAVY, TEAL, NAVY, TEAL]
for k, (item, fc) in enumerate(zip(flow, flow_colors)):
    fx = Inches(0.8 + k * 2.35)
    rect(slide, fx, Inches(2.45), Inches(2.0), Inches(0.6), fc, rounded=True)
    txt(slide, fx, Inches(2.5), Inches(2.0), Inches(0.5),
        item, size=14, color=WHITE, bold=True, align=PP_ALIGN.CENTER)
    if k < len(flow) - 1:
        txt(slide, fx + Inches(2.0), Inches(2.5), Inches(0.35), Inches(0.45),
            "→", size=20, color=TEAL, align=PP_ALIGN.CENTER)

# 4 portal cards
portal_cards = [
    ("Corporate Portal",
     "Employee health management\nBenefits administration\nWorkforce analytics\nDepartment-wise reports",
     TEAL),
    ("Health Analytics",
     "Workforce health scoring\nRisk assessment\nCompliance tracking\nGamified wellness",
     ORANGE),
    ("TPA Portal",
     "Claims management\nPre-authorization\nProvider network mgmt\nE-cards & heritage",
     GREEN),
    ("Insurance Broker",
     "Policy management\nCommission tracking\nCorporate client mgmt\nAnalytics & reporting",
     TEAL),
]
for i, (title, desc, acc) in enumerate(portal_cards):
    px = Inches(0.6 + i * 3.2)
    rect(slide, px, Inches(3.3), Inches(3.0), Inches(3.9), CARD_BG, rounded=True)
    rect(slide, px, Inches(3.3), Inches(3.0), Inches(0.45), acc)
    txt(slide, px, Inches(3.36), Inches(3.0), Inches(0.35),
        title, size=13, color=WHITE, bold=True, align=PP_ALIGN.CENTER)
    multiline(slide, px + Inches(0.2), Inches(3.9), Inches(2.6), Inches(3.1),
              desc.split("\n"), size=12, color=NAVY, spacing=Pt(5))


# ═════════════════════════════════════════════════════════════════════════════
# SLIDE 14 — COMPLIANCE & SECURITY
# ═════════════════════════════════════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_bg(slide, WHITE)
section_header(slide, "SECURITY & COMPLIANCE", "Compliance & Security",
               "Healthcare-grade data protection and global standards compliance")

comp_cards = [
    ("🛡️", "HIPAA Compliance",
     "Full audit trails & access logging\nData encryption at rest & in transit\nRetention policies & consent mgmt\nRole-based access control (RBAC)",
     TEAL),
    ("👤", "ABDM / ABHA",
     "Ayushman Bharat Digital Mission\n14-digit ABHA Health ID\nHealth information exchange\nDigital health records standard",
     ORANGE),
    ("📄", "ICD-10 & DICOM",
     "50+ condition auto-mapping\nDICOM/HL7/FHIR compliance\nClinical terminology alignment\nGlobal interoperability",
     GREEN),
    ("🔒", "Multi-Tenant RLS",
     "PostgreSQL Row-Level Security\nComplete tenant data isolation\nCustom domain per tenant\nModule-level access control",
     TEAL),
]
for i, (icon, title, desc, acc) in enumerate(comp_cards):
    cx = Inches(0.5 + i * 3.2)
    feature_card(slide, cx, Inches(2.0), Inches(3.0), Inches(4.7),
                 acc, icon, title, desc, icon_size=36, title_size=15, body_size=12)

# Bottom enterprise bar
rect(slide, Inches(0), Inches(7.1), Inches(13.33), Inches(0.4), NAVY)
txt(slide, Inches(0), Inches(7.15), Inches(13.33), Inches(0.3),
    "Enterprise-grade zero-trust architecture  •  Encrypted communications  •  Complete audit trails  •  NABH ready",
    size=12, color=WHITE, bold=True, align=PP_ALIGN.CENTER)


# ═════════════════════════════════════════════════════════════════════════════
# SLIDE 15 — TECH STACK
# ═════════════════════════════════════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_bg(slide, WHITE)
section_header(slide, "TECH STACK", "Architecture — Built for Scale",
               "Microservices, security-first, cloud-agnostic design")

tech_pillars = [
    ("Frontend", TEAL, [
        "React 18 + TypeScript + Vite",
        "Tailwind CSS + Shadcn/UI",
        "Framer Motion animations",
        "TanStack Query + Zustand",
        "Recharts + Chart.js",
    ]),
    ("Backend & Data", ORANGE, [
        "Node.js + Express.js",
        "PostgreSQL + Sequelize ORM",
        "Redis · DuckDB · BullMQ",
        "Socket.IO + Kafka",
        "JWT + OAuth2 + OTP",
    ]),
    ("AI / Infra", GREEN, [
        "OpenAI · Gemini · Claude · Groq",
        "Whisper.cpp + custom GGUF (offline)",
        "Transformers.js (on-device ML)",
        "Tesseract.js (OCR)",
        "AWS S3 · PM2 · Cloudflare",
        "Prometheus + Grafana + OpenTelemetry",
    ]),
]
for i, (title, acc, items) in enumerate(tech_pillars):
    tx = Inches(0.6 + i * 4.15)
    rect(slide, tx, Inches(2.0), Inches(3.85), Inches(0.5), acc)
    txt(slide, tx, Inches(2.06), Inches(3.85), Inches(0.4),
        title, size=15, color=WHITE, bold=True, align=PP_ALIGN.CENTER)
    rect(slide, tx, Inches(2.55), Inches(3.85), Inches(3.6), CARD_BG)
    bullets(slide, tx + Inches(0.2), Inches(2.65), Inches(3.5), Inches(3.4),
            items, size=13, color=NAVY, bullet="▸", spacing=Pt(6))

# Architecture tags row
arch_tags = [
    ("☁️  Cloud Agnostic", TEAL),
    ("🔒  Security-First", ORANGE),
    ("⚡  Low Latency",    GREEN),
    ("📊  Real-Time Analytics", TEAL),
    ("📦  Modular Deploy", ORANGE),
    ("🔗  Event-Driven",   GREEN),
]
for i, (tag, acc) in enumerate(arch_tags):
    col, row = i % 3, i // 3
    gx = Inches(0.6 + col * 4.15)
    gy = Inches(6.25 + row * 0.5)
    rect(slide, gx, gy, Inches(3.85), Inches(0.38), CARD_BG, rounded=True)
    rect(slide, gx + Inches(0.06), gy + Inches(0.06), Inches(0.04), Inches(0.26), acc)
    txt(slide, gx + Inches(0.2), gy + Inches(0.06), Inches(3.5), Inches(0.28),
        tag, size=11, color=NAVY, bold=True)

# Integrations footnote
txt(slide, Inches(0.6), Inches(7.2), Inches(12.0), Inches(0.2),
    "Integrations: Razorpay · Stripe · LiveKit · Agora · Twilio · SendGrid · Firebase · WhatsApp · Leaflet Maps · Apple Health · Google Fit",
    size=9, color=GRAY_TEXT, align=PP_ALIGN.CENTER)


# ═════════════════════════════════════════════════════════════════════════════
# SLIDE 16 — 12+ DEDICATED PORTALS
# ═════════════════════════════════════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_bg(slide, WHITE)
section_header(slide, "USER PORTALS", "20+ Dedicated Portals",
               "Purpose-built interfaces for every healthcare stakeholder across the ecosystem")

portals = [
    ("Patient",       "Health dashboard, AI Doctor,\nconsultations, insurance",            TEAL),
    ("Doctor",        "EMR, AI Scribe, CDSS,\nprescriptions, video",                       ORANGE),
    ("Nurse",         "Vitals, medications,\nnotes, ward management",                      GREEN),
    ("Assistant",     "Registration, billing,\nappointments, tasks",                       TEAL),
    ("Hospital",      "50+ modules: OPD/IPD,\nbilling, EHR, analytics",                   ORANGE),
    ("Clinic",        "Queue, consultations,\nprescriptions, billing",                     GREEN),
    ("Lab",           "Test catalog, samples,\nresults, inventory",                        TEAL),
    ("Pharmacy",      "POS, inventory, batch\ntracking, orders",                           ORANGE),
    ("Ambulance",     "Live GPS tracking,\ndispatch, fleet mgmt",                          GREEN),
    ("Homecare",      "Care plans, scheduling,\npatient management",                       TEAL),
    ("Corporate",     "Wellness, analytics,\ncompliance, gamification",                    ORANGE),
    ("Insurance Co.", "Policy management,\nclaims, network",                               GREEN),
    ("TPA",           "Pre-auth, claims,\ne-cards, provider network",                      TEAL),
    ("Broker",        "Policy mgmt, commissions,\nclient analytics",                       ORANGE),
    ("Aggregator",    "Multi-tenant white-label,\nAPI credentials, CRM",                   GREEN),
    ("MRD",           "Medical records,\narchiving, compliance",                           TEAL),
    ("Security",      "Asset tracking, access\ncontrol, incident mgmt",                    ORANGE),
    ("PSU / NGO",     "Community health,\ncamps, bulk screening",                          GREEN),
    ("ICU / OT",      "Critical care monitoring,\nOT scheduling & notes",                  TEAL),
    ("Admin",         "Super-admin: tenant mgmt,\nRLS, API & billing",                    ORANGE),
]
# 5 columns × 4 rows
for i, (title, desc, acc) in enumerate(portals):
    col = i % 5
    row = i // 5
    px = Inches(0.35 + col * 2.6)
    py = Inches(2.05 + row * 1.38)
    rect(slide, px, py, Inches(2.45), Inches(1.25), CARD_BG, rounded=True)
    rect(slide, px + Inches(0.05), py + Inches(0.05), Inches(2.35), Inches(0.04), acc)
    txt(slide, px, py + Inches(0.15), Inches(2.45), Inches(0.3),
        title, size=12, color=NAVY, bold=True, align=PP_ALIGN.CENTER)
    rect(slide, px + Inches(0.3), py + Inches(0.47), Inches(1.85), Inches(0.015), LIGHT_GRAY)
    txt(slide, px + Inches(0.1), py + Inches(0.54), Inches(2.25), Inches(0.65),
        desc, size=9, color=GRAY_TEXT, align=PP_ALIGN.CENTER)


# ═════════════════════════════════════════════════════════════════════════════
# SLIDE 17 — PRICING
# ═════════════════════════════════════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_bg(slide, WHITE)
section_header(slide, "PRICING", "Flexible Pricing Plans",
               "For individuals, clinics, hospitals, and enterprises")

# Section label for personal plans
txt(slide, Inches(0.8), Inches(2.0), Inches(4), Inches(0.25),
    "PERSONAL PLANS", size=9, color=GRAY_TEXT, bold=True)

personal = [
    ("Free Basic",  "₹0/lifetime",    WHITE,    LIGHT_GRAY, [
        "Referral-based signup",
        "2 video · 3 audio · 5 chats/mo",
        "Basic health dashboard",
    ]),
    ("Basic",       "₹199/month",     WHITE,    TEAL,        [
        "5 video · 10 audio · 20 chats",
        "AI Scribe (5/mo)",
        "20% coin bonus",
    ]),
    ("Premium",     "₹499/month",     DARK_NAV, ORANGE,      [
        "Unlimited consultations",
        "Priority booking",
        "Dedicated health manager",
        "50% coin bonus · 15% lab discount",
    ]),
    ("Enterprise",  "₹999/month",     WHITE,    GREEN,       [
        "Concierge service",
        "Genetic testing · Fitness coach",
        "Mental health · Travel insurance",
        "100% coin bonus",
    ]),
]
for i, (title, price, bg, acc, feats) in enumerate(personal):
    px = Inches(0.5 + i * 3.15)
    card_bg = bg if bg != WHITE else CARD_BG
    # Popular badge for Premium
    if title == "Premium":
        rect(slide, px, Inches(2.22), Inches(2.95), Inches(0.3), ORANGE, rounded=True)
        txt(slide, px, Inches(2.24), Inches(2.95), Inches(0.25),
            "★ POPULAR", size=9, color=WHITE, bold=True, align=PP_ALIGN.CENTER)
    rect(slide, px, Inches(2.55), Inches(2.95), Inches(3.8), card_bg, rounded=True)
    rect(slide, px + Inches(0.08), Inches(2.61), Inches(2.79), Inches(0.04), acc)
    text_color = WHITE if bg == DARK_NAV else NAVY
    price_color = WHITE if bg == DARK_NAV else acc
    txt(slide, px, Inches(2.72), Inches(2.95), Inches(0.4),
        title, size=16, color=text_color, bold=True, align=PP_ALIGN.CENTER)
    txt(slide, px, Inches(3.12), Inches(2.95), Inches(0.45),
        price, size=18, color=price_color, bold=True, align=PP_ALIGN.CENTER)
    rect(slide, px + Inches(0.3), Inches(3.6), Inches(2.35), Inches(0.02), LIGHT_GRAY)
    feat_color = LIGHT_GRAY if bg == DARK_NAV else GRAY_TEXT
    bullets(slide, px + Inches(0.2), Inches(3.72), Inches(2.6), Inches(2.5),
            feats, size=11, color=feat_color, bullet="✓", spacing=Pt(4))

# Corporate plans
txt(slide, Inches(0.8), Inches(6.55), Inches(4), Inches(0.25),
    "CORPORATE PLANS (per employee)", size=9, color=GRAY_TEXT, bold=True)

corp_plans = [
    ("Corporate Basic",      "₹149/emp/mo  |  Annual: ₹1,499/yr", TEAL),
    ("Corporate Premium",    "₹299/emp/mo  |  Annual: ₹2,999/yr", ORANGE),
    ("Corporate Enterprise", "Custom Pricing  |  Annual: Contact Sales", GREEN),
]
for i, (title, price, acc) in enumerate(corp_plans):
    cpx = Inches(0.5 + i * 4.15)
    rect(slide, cpx, Inches(6.85), Inches(3.9), Inches(0.5), CARD_BG, rounded=True)
    rect(slide, cpx, Inches(6.85), Inches(0.06), Inches(0.5), acc)
    txt(slide, cpx + Inches(0.15), Inches(6.9), Inches(2.0), Inches(0.25),
        title, size=12, color=NAVY, bold=True)
    txt(slide, cpx + Inches(0.15), Inches(7.1), Inches(3.6), Inches(0.2),
        price, size=11, color=GRAY_TEXT)


# ═════════════════════════════════════════════════════════════════════════════
# SLIDE 18 — CASE STUDY
# ═════════════════════════════════════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_bg(slide, WHITE)
section_header(slide, "CASE STUDY", "Transforming Care Delivery",
               "See how Mediqzy drives quantifiable results for healthcare facilities")

# 3-column layout
cols = [
    ("⚠️  The Challenge",     RGBColor(0xDC, 0x26, 0x26), [
        "Fragmented systems across departments",
        "Long patient queues & wait times",
        "Paper-based prescriptions & records",
        "No AI-powered clinical support",
        "Manual insurance claim processing",
        "Poor visibility into operations",
    ]),
    ("✅  The Mediqzy Way",    TEAL, [
        "Unified platform replacing 10+ tools",
        "Online booking, self check-in, kiosk",
        "Digital prescriptions & cloud EHR",
        "AI Scribe + CDSS + AI Vision",
        "Automated claims & TPA integration",
        "Real-time analytics & KPI dashboards",
    ]),
    ("📈  The Impact",        GREEN, [
        "40% reduction in patient waiting time",
        "56% drop in admin workload",
        "65% reduction in medical errors",
        "70% appointments booked online",
        "5.5 hrs doctor time saved per week",
        "₹2 Bn+ potential annual revenue",
    ]),
]
for i, (header, acc, items) in enumerate(cols):
    cx = Inches(0.5 + i * 4.25)
    rect(slide, cx, Inches(2.0), Inches(4.0), Inches(0.5), acc)
    txt(slide, cx, Inches(2.06), Inches(4.0), Inches(0.4),
        header, size=14, color=WHITE, bold=True, align=PP_ALIGN.CENTER)
    rect(slide, cx, Inches(2.55), Inches(4.0), Inches(4.7), CARD_BG)
    bullet_color = NAVY if acc != RGBColor(0xDC, 0x26, 0x26) else NAVY
    is_impact = (acc == GREEN)
    for j, item in enumerate(items):
        iy = Inches(2.7 + j * 0.72)
        pfx = "•  " if not is_impact else ""
        weight = is_impact
        txt(slide, cx + Inches(0.2), iy, Inches(3.6), Inches(0.65),
            f"{'•  ' if not is_impact else ''}{item}",
            size=13, color=NAVY, bold=weight)


# ═════════════════════════════════════════════════════════════════════════════
# SLIDE 19 — WHY MEDIQZY?
# ═════════════════════════════════════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_bg(slide, WHITE)
section_header(slide, "KEY DIFFERENTIATORS", "Why Mediqzy?",
               "The differentiators that make us the preferred healthcare technology choice")

diffs = [
    ("01", "All-in-One Platform",
     "Single unified system replacing 10+ fragmented tools — from patient engagement "
     "to hospital ops, labs, pharmacy, insurance, and corporate.",
     TEAL),
    ("02", "AI-First Clinical Suite",
     "9 integrated AI capabilities: offline AI Scribe, CDSS, AI Vision, AI Doctor — "
     "core to every clinical workflow, not bolt-on features.",
     ORANGE),
    ("03", "RIS/PACS Tele-Radiology",
     "Full radiology workflow — DICOM viewer, tele-radiology with SLA tracking, "
     "AI-assisted reads, structured reporting & multi-modality.",
     GREEN),
    ("04", "IoT Patient Monitoring",
     "Connected device ecosystem for real-time vitals — ICU bedside, RPM at home, "
     "smart alerts, predictive deterioration scoring.",
     TEAL),
    ("05", "Smart Asset Tracking",
     "GPS live-tracking (ambulances & mobile units) operational. RFID + BLE "
     "RTLS architecture software-ready — zone alerts, AI allocation & predictive maintenance.",
     ORANGE),
    ("06", "India-Ready Compliance",
     "Native ABDM/ABHA, ICD-10, DICOM/HL7/FHIR, HIPAA-grade security, "
     "NABH-ready — built for Indian & global regulations.",
     GREEN),
]
# Row 0: 3 cards, Row 1: 3 cards
for i, (num, title, desc, acc) in enumerate(diffs):
    col, row = i % 3, i // 3
    dx = Inches(0.5 + col * 4.2)
    dy = Inches(2.0 + row * 2.55)
    rect(slide, dx, dy, Inches(3.95), Inches(2.35), CARD_BG, rounded=True)
    rect(slide, dx + Inches(0.06), dy + Inches(0.06), Inches(0.06), Inches(2.23), acc)
    # Number badge
    rect(slide, dx + Inches(0.25), dy + Inches(0.18), Inches(0.45), Inches(0.45), acc, rounded=True)
    txt(slide, dx + Inches(0.25), dy + Inches(0.2), Inches(0.45), Inches(0.38),
        num, size=14, color=WHITE, bold=True, align=PP_ALIGN.CENTER)
    txt(slide, dx + Inches(0.85), dy + Inches(0.2), Inches(2.9), Inches(0.35),
        title, size=14, color=NAVY, bold=True)
    txt(slide, dx + Inches(0.25), dy + Inches(0.75), Inches(3.55), Inches(1.45),
        desc, size=11, color=GRAY_TEXT)


# ═════════════════════════════════════════════════════════════════════════════
# SLIDE 20 — CTA / CLOSING
# ═════════════════════════════════════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_bg(slide, WHITE)

# Left side
logo(slide, Inches(0.8), Inches(0.6), Inches(1.8), Inches(1.8))

txt(slide, Inches(0.8), Inches(2.6), Inches(7.0), Inches(1.1),
    "Ready to Transform\nHealthcare?", size=38, color=NAVY, bold=True)

txt(slide, Inches(0.8), Inches(3.8), Inches(6.5), Inches(0.45),
    "Join the digital revolution with Mediqzy today.", size=16, color=GRAY_TEXT, italic=True)

# CTA button
rect(slide, Inches(0.8), Inches(4.45), Inches(3.5), Inches(0.6), TEAL, rounded=True)
txt(slide, Inches(0.8), Inches(4.5), Inches(3.5), Inches(0.52),
    "Schedule a Demo  →", size=17, color=WHITE, bold=True, align=PP_ALIGN.CENTER)

# Contact info
contacts = [
    ("🌐", "app.mediqzy.com",     TEAL),
    ("📧", "support@mediqzy.com", GRAY_TEXT),
    ("🐦", "@mediqzy",            GRAY_TEXT),
]
for i, (icon, text, clr) in enumerate(contacts):
    txt(slide, Inches(0.8), Inches(5.3 + i * 0.42), Inches(6.0), Inches(0.38),
        f"{icon}  {text}", size=14, color=clr)

txt(slide, Inches(0), Inches(7.15), Inches(13.33), Inches(0.3),
    "© 2026 Mediqzy Healthcare. All rights reserved.",
    size=9, color=GRAY_TEXT, align=PP_ALIGN.CENTER)

# Right — dark navy box with tagline + stats
rect(slide, Inches(7.3), Inches(0), Inches(6.03), Inches(7.5), DARK_NAV)

txt(slide, Inches(7.5), Inches(1.5), Inches(5.6), Inches(1.4),
    "Your Health,\nOur Priority", size=36, color=WHITE, bold=True, align=PP_ALIGN.CENTER)

cta_stats = [
    ("12+ Portals",      TEAL),
    ("9 AI Capabilities", ORANGE),
    ("400+ Features",    TEAL),
]
for i, (label, acc) in enumerate(cta_stats):
    sy = Inches(3.3 + i * 1.1)
    rect(slide, Inches(7.8), sy, Inches(5.0), Inches(0.75), RGBColor(0x1E, 0x29, 0x3B), rounded=True)
    rect(slide, Inches(7.8), sy, Inches(5.0), Inches(0.06), acc, rounded=True)
    txt(slide, Inches(7.8), sy + Inches(0.18), Inches(5.0), Inches(0.4),
        label, size=16, color=WHITE, bold=True, align=PP_ALIGN.CENTER)

txt(slide, Inches(7.5), Inches(6.65), Inches(5.6), Inches(0.3),
    "app.mediqzy.com", size=12, color=TEAL_LIGHT, align=PP_ALIGN.CENTER)


# ─────────────────────────────────────────────────────────────────────────────
# SAVE
# ─────────────────────────────────────────────────────────────────────────────
output = os.path.join(BASE, "Mediqzy_White_Professional.pptx")
prs.save(output)
print(f"\n✅  White Professional deck saved → {output}")
print(f"   Slides : {len(prs.slides)}  (18 original + 2 new Asset Tracking slides)")
print(f"   Format : 16:9 Widescreen  13.33\" × 7.5\"")
