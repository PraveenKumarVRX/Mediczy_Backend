#!/usr/bin/env python3
"""
Mediqzy Healthcare — Premium Marketing Deck v2
Redesigned based on competitor analysis (Athma, TrioTree, Medics Prime).
Features: custom backgrounds, mockup images, ecosystem diagrams, case study layouts.
"""

from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
from pptx.oxml.ns import qn
import os

# ── PATHS ──
BASE = os.path.dirname(__file__)
ASSETS = os.path.join(BASE, "deck_assets")
LOGO = os.path.join(BASE, "client", "public", "logo", "Mediqzy_logo.jpeg")

# ── Brand Colors ──
TEAL       = RGBColor(0x00, 0x96, 0x88)
TEAL_DARK  = RGBColor(0x00, 0x7A, 0x6E)
TEAL_LIGHT = RGBColor(0x4D, 0xB6, 0xAC)
WHITE      = RGBColor(0xFF, 0xFF, 0xFF)
DARK_BG    = RGBColor(0x0F, 0x17, 0x2A)
DARK_CARD  = RGBColor(0x1E, 0x29, 0x3B)
DARK_CARD2 = RGBColor(0x1A, 0x24, 0x35)
GRAY       = RGBColor(0x94, 0xA3, 0xB8)
LIGHT_GRAY = RGBColor(0xE2, 0xE8, 0xF0)
EMERALD    = RGBColor(0x10, 0xB9, 0x81)
ORANGE     = RGBColor(0xF5, 0x9E, 0x0B)
BLUE       = RGBColor(0x38, 0xBD, 0xF8)
PURPLE     = RGBColor(0xA7, 0x8B, 0xFA)
ROSE       = RGBColor(0xFB, 0x71, 0x85)
AMBER      = RGBColor(0xFB, 0xBF, 0x24)
RED_DARK   = RGBColor(0xEF, 0x44, 0x44)

prs = Presentation()
prs.slide_width = Inches(13.33)
prs.slide_height = Inches(7.5)
SW = prs.slide_width
SH = prs.slide_height

# ════════════════════════════════════════════════════════
# UTILITY FUNCTIONS
# ════════════════════════════════════════════════════════

def set_bg_image(slide, image_path):
    """Set a full-bleed background image on a slide."""
    slide.shapes.add_picture(image_path, Inches(0), Inches(0), SW, SH)

def set_bg_color(slide, color):
    bg = slide.background
    fill = bg.fill
    fill.solid()
    fill.fore_color.rgb = color

def add_shape(slide, left, top, width, height, color, radius=None, alpha=None):
    shape_type = MSO_SHAPE.ROUNDED_RECTANGLE if radius else MSO_SHAPE.RECTANGLE
    shape = slide.shapes.add_shape(shape_type, left, top, width, height)
    shape.fill.solid()
    shape.fill.fore_color.rgb = color
    shape.line.fill.background()
    shape.shadow.inherit = False
    if alpha is not None:
        # Set transparency via XML
        solidFill = shape.fill._fill
        srgb = solidFill.find(qn('a:solidFill')).find(qn('a:srgbClr'))
        if srgb is not None:
            from lxml import etree
            alpha_elem = etree.SubElement(srgb, qn('a:alpha'))
            alpha_elem.set('val', str(int(alpha * 1000)))  # val in 1/1000 percent
    return shape

def add_text(slide, left, top, width, height, text, size=18, color=WHITE, bold=False, align=PP_ALIGN.LEFT, font="Calibri", spacing=None):
    txBox = slide.shapes.add_textbox(left, top, width, height)
    tf = txBox.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = text
    p.font.size = Pt(size)
    p.font.color.rgb = color
    p.font.bold = bold
    p.font.name = font
    p.alignment = align
    if spacing:
        p.space_after = spacing
    return txBox

def add_multiline(slide, left, top, width, height, lines, size=14, color=LIGHT_GRAY, spacing=Pt(6), line_spacing=None):
    """Add multiple paragraphs."""
    txBox = slide.shapes.add_textbox(left, top, width, height)
    tf = txBox.text_frame
    tf.word_wrap = True
    for i, line in enumerate(lines):
        if i == 0:
            p = tf.paragraphs[0]
        else:
            p = tf.add_paragraph()
        p.text = line
        p.font.size = Pt(size)
        p.font.color.rgb = color
        p.font.name = "Calibri"
        p.space_after = spacing
        if line_spacing:
            p.line_spacing = line_spacing
    return txBox

def add_bullet_text(slide, left, top, width, height, items, size=14, color=LIGHT_GRAY, bullet="▸", spacing=Pt(6)):
    txBox = slide.shapes.add_textbox(left, top, width, height)
    tf = txBox.text_frame
    tf.word_wrap = True
    for i, item in enumerate(items):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.text = f"{bullet}  {item}"
        p.font.size = Pt(size)
        p.font.color.rgb = color
        p.font.name = "Calibri"
        p.space_after = spacing
    return txBox

def add_rich(slide, left, top, width, height, runs, align=PP_ALIGN.LEFT):
    """runs: list of {text, size, color, bold, font}"""
    txBox = slide.shapes.add_textbox(left, top, width, height)
    tf = txBox.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.alignment = align
    for i, r in enumerate(runs):
        run = p.runs[0] if (i == 0 and p.runs) else p.add_run()
        run.text = r.get("text", "")
        run.font.size = Pt(r.get("size", 18))
        run.font.color.rgb = r.get("color", WHITE)
        run.font.bold = r.get("bold", False)
        run.font.name = r.get("font", "Calibri")
    return txBox

def add_icon_card(slide, x, y, w, h, icon, title, desc, bg=DARK_CARD, accent=TEAL, icon_size=28, title_size=15, desc_size=11):
    card = add_shape(slide, x, y, w, h, bg, radius=True)
    add_text(slide, x + Inches(0.3), y + Inches(0.2), Inches(0.6), Inches(0.5),
             icon, size=icon_size, color=accent, font="Segoe UI Emoji")
    add_text(slide, x + Inches(0.3), y + Inches(0.65), w - Inches(0.6), Inches(0.35),
             title, size=title_size, color=WHITE, bold=True)
    add_text(slide, x + Inches(0.3), y + Inches(1.05), w - Inches(0.6), h - Inches(1.2),
             desc, size=desc_size, color=GRAY)
    return card

def add_stat_box(slide, x, y, w, h, value, label, accent=TEAL, value_size=36):
    card = add_shape(slide, x, y, w, h, DARK_CARD, radius=True)
    add_shape(slide, x + Inches(0.12), y + Inches(0.08), w - Inches(0.24), Inches(0.04), accent)
    add_text(slide, x, y + Inches(0.25), w, Inches(0.5),
             value, size=value_size, color=accent, bold=True, align=PP_ALIGN.CENTER)
    add_text(slide, x, y + Inches(0.85), w, Inches(0.4),
             label, size=12, color=GRAY, align=PP_ALIGN.CENTER)
    return card

def add_section_title(slide, title, subtitle=None, y=Inches(0.5)):
    add_shape(slide, Inches(0.8), y, Inches(0.5), Inches(0.04), TEAL)
    add_text(slide, Inches(0.8), y + Inches(0.15), Inches(10), Inches(0.7),
             title, size=36, color=WHITE, bold=True)
    if subtitle:
        add_text(slide, Inches(0.8), y + Inches(0.8), Inches(10), Inches(0.4),
                 subtitle, size=16, color=GRAY)

def add_image(slide, path, left, top, width=None, height=None):
    if os.path.exists(path):
        return slide.shapes.add_picture(path, left, top, width, height)
    return None

def add_accent_card(slide, x, y, w, h, accent_color, title, desc, num=None):
    """Card with left accent bar (like competitor 1 style)."""
    card = add_shape(slide, x, y, w, h, DARK_CARD, radius=True)
    add_shape(slide, x + Inches(0.04), y + Inches(0.12), Inches(0.04), h - Inches(0.24), accent_color)
    if num:
        badge = add_shape(slide, x + Inches(0.2), y + Inches(0.15), Inches(0.4), Inches(0.4), accent_color, radius=True)
        add_text(slide, x + Inches(0.2), y + Inches(0.17), Inches(0.4), Inches(0.35),
                 num, size=16, color=WHITE, bold=True, align=PP_ALIGN.CENTER)
        add_text(slide, x + Inches(0.7), y + Inches(0.18), w - Inches(0.9), Inches(0.35),
                 title, size=15, color=WHITE, bold=True)
    else:
        add_text(slide, x + Inches(0.25), y + Inches(0.15), w - Inches(0.5), Inches(0.35),
                 title, size=15, color=accent_color, bold=True)
    desc_y = y + Inches(0.55) if not num else y + Inches(0.6)
    add_text(slide, x + Inches(0.25), desc_y, w - Inches(0.5), h - Inches(0.7),
             desc, size=11, color=GRAY)


# ════════════════════════════════════════════════════════════
# SLIDE 1 — HERO COVER (inspired by Athma's cinematic opener)
# ════════════════════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_bg_image(slide, os.path.join(ASSETS, "bg_cover.png"))

# Logo
add_image(slide, LOGO, Inches(0.8), Inches(0.5), Inches(1.6), Inches(1.6))

# Hero text
add_rich(slide, Inches(0.8), Inches(2.4), Inches(8), Inches(1.0), [
    {"text": "Powering", "size": 50, "color": WHITE, "bold": True},
    {"text": "  Tomorrow's", "size": 50, "color": TEAL, "bold": True},
])
add_rich(slide, Inches(0.8), Inches(3.2), Inches(8), Inches(0.8), [
    {"text": "Healthcare", "size": 50, "color": TEAL, "bold": True},
    {"text": "  Delivery", "size": 50, "color": WHITE, "bold": True},
])

add_text(slide, Inches(0.8), Inches(4.2), Inches(7), Inches(0.5),
         "Your Health, Our Priority", size=22, color=TEAL_LIGHT)

add_text(slide, Inches(0.8), Inches(4.9), Inches(7), Inches(0.8),
         "India's most comprehensive AI-powered practice management,\npatient engagement, and insurance ecosystem platform.",
         size=16, color=GRAY)

# URL pill
add_shape(slide, Inches(0.8), Inches(5.9), Inches(2.5), Inches(0.4), TEAL, radius=True)
add_text(slide, Inches(0.8), Inches(5.93), Inches(2.5), Inches(0.35),
         "app.mediqzy.com", size=13, color=WHITE, bold=True, align=PP_ALIGN.CENTER)

# Right side — dashboard mockup
add_image(slide, os.path.join(ASSETS, "mockup_dashboard.png"),
          Inches(7.8), Inches(1.5), Inches(5.0), Inches(3.1))

# Bottom stats bar (inspired by Athma's stats page)
stats = [
    ("12+", "User Portals", TEAL), ("400+", "Features", EMERALD),
    ("34+", "Specializations", BLUE), ("167", "API Modules", PURPLE),
    ("9", "AI Capabilities", ORANGE),
]
for i, (val, lab, accent) in enumerate(stats):
    x = Inches(0.5 + i * 2.5)
    add_stat_box(slide, x, Inches(6.3), Inches(2.1), Inches(1.05), val, lab, accent, value_size=30)


# ════════════════════════════════════════════════════════════
# SLIDE 2 — SOLUTIONS FOR EVERYONE (Athma style)
# ════════════════════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_bg_image(slide, os.path.join(ASSETS, "bg_section_1.png"))
add_section_title(slide, "Solutions for Each & Everyone", "A unified platform serving the entire healthcare ecosystem")

# Ecosystem diagram on right
add_image(slide, os.path.join(ASSETS, "ecosystem_diagram.png"),
          Inches(7.5), Inches(1.2), Inches(5.5), Inches(3.7))

# Stakeholder list on left with accent cards
stakeholders = [
    ("👤", "Patients & Families", "AI Doctor, telemedicine, health records, insurance", TEAL),
    ("👨‍⚕️", "Doctors & Clinicians", "AI Scribe, CDSS, EMR, prescriptions, video consults", EMERALD),
    ("🏥", "Hospitals & Clinics", "30+ modules: OPD/IPD, billing, beds, EHR, MRD", BLUE),
    ("🧪", "Labs & Diagnostics", "Test catalog, samples, results, RIS/PACS, DICOM", PURPLE),
    ("💊", "Pharmacies", "POS, inventory, batch tracking, purchase orders", ORANGE),
    ("🏢", "Corporates & Insurers", "Wellness programs, TPA, broker, claims management", ROSE),
]
for i, (icon, title, desc, accent) in enumerate(stakeholders):
    col = i % 2
    row = i // 2
    x = Inches(0.5 + col * 3.5)
    y = Inches(2.0 + row * 1.7)
    card = add_shape(slide, x, y, Inches(3.2), Inches(1.4), DARK_CARD, radius=True)
    add_shape(slide, x + Inches(0.04), y + Inches(0.1), Inches(0.04), Inches(1.2), accent)
    add_text(slide, x + Inches(0.2), y + Inches(0.1), Inches(0.5), Inches(0.5),
             icon, size=22, color=accent, font="Segoe UI Emoji")
    add_text(slide, x + Inches(0.7), y + Inches(0.15), Inches(2.3), Inches(0.3),
             title, size=14, color=WHITE, bold=True)
    add_text(slide, x + Inches(0.7), y + Inches(0.5), Inches(2.3), Inches(0.7),
             desc, size=11, color=GRAY)


# ════════════════════════════════════════════════════════════
# SLIDE 3 — THE HEALTHCARE OPERATING SYSTEM (Athma's HOS style)
# ════════════════════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_bg_image(slide, os.path.join(ASSETS, "bg_section_3.png"))
add_section_title(slide, "Healthcare Operating System", "Clinical + Operational + AI — all in one platform")

# Three pillars (like Athma's Clinical/Operational/Admin)
pillars = [
    ("Clinical", TEAL, [
        "Electronic Health Records (EHR)",
        "AI Scribe & AI Vision",
        "CDSS — Drug Interactions, ICD-10",
        "Digital Prescriptions & Templates",
        "RIS/PACS — Tele-Radiology",
        "Lab & Imaging Integration",
        "Blood Bank Management",
        "Nursing Station & Vitals",
    ]),
    ("Operational", EMERALD, [
        "OPD / IPD Management",
        "Bed & Ward Management",
        "Appointment Scheduling",
        "Pharmacy POS & Inventory",
        "Billing & Revenue Cycle",
        "Insurance Claims & TPA",
        "Ambulance Dispatch & Tracking",
        "Staff & Shift Management",
    ]),
    ("Intelligence", BLUE, [
        "AI Doctor — 24/7 Health Assistant",
        "Health Risk Assessment",
        "Analytics & KPI Dashboards",
        "IoT Patient Monitoring",
        "Remote Patient Monitoring (RPM)",
        "Wearable Device Integration",
        "Predictive Health Insights",
        "Workforce Health Analytics",
    ]),
]

for i, (title, accent, items) in enumerate(pillars):
    x = Inches(0.5 + i * 4.2)
    # Column header
    header = add_shape(slide, x, Inches(2.0), Inches(3.8), Inches(0.55), accent, radius=True)
    add_text(slide, x, Inches(2.05), Inches(3.8), Inches(0.45),
             title, size=18, color=WHITE, bold=True, align=PP_ALIGN.CENTER)
    # Items
    box = add_shape(slide, x, Inches(2.6), Inches(3.8), Inches(4.5), DARK_CARD, radius=True)
    add_bullet_text(slide, x + Inches(0.2), Inches(2.7), Inches(3.4), Inches(4.3),
                    items, size=13, color=LIGHT_GRAY, bullet="✓", spacing=Pt(5))


# ════════════════════════════════════════════════════════════
# SLIDE 4 — STRIVING FOR EXCELLENCE (Impact stats - Athma style)
# ════════════════════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_bg_image(slide, os.path.join(ASSETS, "bg_stats.png"))
add_section_title(slide, "Striving Towards Excellence", "A platform designed for measurable impact")

impact_stats = [
    ("40%", "Reduction in Patient\nWaiting Time", TEAL, "⏱️"),
    ("56%", "Drop in Administrative\nWorkload", EMERALD, "📋"),
    ("70%", "Appointments Booked\nOnline", BLUE, "📅"),
    ("65%", "Reduction in\nMedical Errors", PURPLE, "🛡️"),
    ("5.5 hrs", "Doctor's Time Saved\nPer Week", ORANGE, "👨‍⚕️"),
    ("₹2 Bn+", "Potential Annual\nRevenue Impact", ROSE, "💰"),
]

for i, (value, label, accent, icon) in enumerate(impact_stats):
    col = i % 3
    row = i // 3
    x = Inches(0.8 + col * 4.0)
    y = Inches(1.8 + row * 2.8)
    card = add_shape(slide, x, y, Inches(3.6), Inches(2.5), DARK_CARD, radius=True)
    add_shape(slide, x + Inches(0.1), y + Inches(0.06), Inches(3.4), Inches(0.04), accent)
    # Icon
    add_text(slide, x + Inches(0.3), y + Inches(0.2), Inches(0.6), Inches(0.6),
             icon, size=28, color=accent, font="Segoe UI Emoji")
    # Value
    add_text(slide, x + Inches(1.0), y + Inches(0.2), Inches(2.3), Inches(0.6),
             value, size=38, color=accent, bold=True)
    # Label
    add_text(slide, x + Inches(0.3), y + Inches(1.1), Inches(3.0), Inches(1.0),
             label, size=14, color=LIGHT_GRAY)
    # Separator
    add_shape(slide, x + Inches(0.3), y + Inches(1.0), Inches(2.0), Inches(0.02), accent)


# ════════════════════════════════════════════════════════════
# SLIDE 5 — AI SCRIBE & CLINICAL AI (Product spotlight — Athma aadi style)
# ════════════════════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_bg_image(slide, os.path.join(ASSETS, "bg_section_2.png"))

# Left half — product info
add_text(slide, Inches(0.8), Inches(0.5), Inches(6), Inches(0.5),
         "AI-Powered Clinical Intelligence", size=14, color=TEAL, bold=True)
add_text(slide, Inches(0.8), Inches(1.0), Inches(6), Inches(0.8),
         "9 Integrated AI Capabilities", size=36, color=WHITE, bold=True)
add_text(slide, Inches(0.8), Inches(1.7), Inches(5.5), Inches(0.5),
         "Built for clinicians, not bolted on. Every AI feature runs within the clinical workflow.", size=14, color=GRAY)

ai_cards = [
    ("🎙️", "AI Scribe", "Offline speech-to-text clinical notes\nWhisper.cpp + custom GGUF model\nNo cloud dependency — full privacy", TEAL),
    ("🧠", "CDSS", "Drug interaction alerts & ICD-10 coding\nDifferential diagnosis engine\nClinical guidelines at point of care", EMERALD),
    ("👁️", "AI Vision", "Clinical image analysis\nDermatology & diagnostic imaging\nReal-time AI-assisted findings", BLUE),
    ("🤖", "AI Doctor", "24/7 GPT/Gemini/Claude assistant\nSymptom triage & recommendations\nMulti-language patient support", PURPLE),
]

for i, (icon, title, desc, accent) in enumerate(ai_cards):
    col = i % 2
    row = i // 2
    x = Inches(0.5 + col * 3.3)
    y = Inches(2.5 + row * 2.4)
    card = add_shape(slide, x, y, Inches(3.0), Inches(2.1), DARK_CARD, radius=True)
    add_shape(slide, x + Inches(0.04), y + Inches(0.1), Inches(0.04), Inches(1.9), accent)
    add_text(slide, x + Inches(0.2), y + Inches(0.15), Inches(0.5), Inches(0.5),
             icon, size=24, color=accent, font="Segoe UI Emoji")
    add_text(slide, x + Inches(0.7), y + Inches(0.18), Inches(2.0), Inches(0.3),
             title, size=15, color=WHITE, bold=True)
    add_text(slide, x + Inches(0.2), y + Inches(0.6), Inches(2.6), Inches(1.3),
             desc, size=11, color=GRAY)

# Right half — mockup + additional AI features
add_image(slide, os.path.join(ASSETS, "mockup_clinical.png"),
          Inches(7.3), Inches(0.5), Inches(5.5), Inches(3.4))

# Additional AI capabilities list
more_ai = [
    ("Health Intelligence", "ML-based predictions & risk scoring"),
    ("AI Brain", "Embeddings-based medical knowledge retrieval"),
    ("Health Risk Assessment", "5-minute personalized risk scoring"),
    ("AI Analytics", "Platform-wide business intelligence"),
    ("Voice Navigation", "Hands-free speech navigation"),
]
add_text(slide, Inches(7.5), Inches(4.2), Inches(5), Inches(0.4),
         "More AI Capabilities", size=16, color=WHITE, bold=True)
for i, (title, desc) in enumerate(more_ai):
    y = Inches(4.7 + i * 0.52)
    add_shape(slide, Inches(7.3), y, Inches(5.3), Inches(0.45), DARK_CARD, radius=True)
    add_text(slide, Inches(7.5), y + Inches(0.03), Inches(2.0), Inches(0.35),
             title, size=11, color=TEAL_LIGHT, bold=True)
    add_text(slide, Inches(9.5), y + Inches(0.03), Inches(3.0), Inches(0.35),
             desc, size=10, color=GRAY)


# ════════════════════════════════════════════════════════════
# SLIDE 6 — RIS / PACS TELE-RADIOLOGY (NEW — with mockup)
# ════════════════════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_bg_image(slide, os.path.join(ASSETS, "bg_section_1.png"))

add_text(slide, Inches(0.8), Inches(0.4), Inches(6), Inches(0.4),
         "RADIOLOGY SUITE", size=13, color=BLUE, bold=True)
add_text(slide, Inches(0.8), Inches(0.8), Inches(8), Inches(0.7),
         "RIS / PACS — Tele-Radiology", size=36, color=WHITE, bold=True)
add_text(slide, Inches(0.8), Inches(1.5), Inches(6), Inches(0.5),
         "End-to-end radiology workflow from order to final report with AI-assisted diagnostics", size=15, color=GRAY)

# Left — feature cards
ris_features = [
    ("🩻", "PACS Viewer", "DICOM image viewing with zoom, pan,\nmeasure tools, multi-frame & 3D MPR", BLUE),
    ("📡", "Tele-Radiology", "Remote specialist reads with SLA tracking,\npriority escalation, second opinion workflow", TEAL),
    ("🤖", "AI-Assisted Reads", "Auto-detection of anomalies, priority\nflagging for urgent cases, structured AI annotations", PURPLE),
    ("📋", "Structured Reports", "Specialty templates, voice dictation,\nauto-populated findings, digital signatures", EMERALD),
]
for i, (icon, title, desc, accent) in enumerate(ris_features):
    col = i % 2
    row = i // 2
    x = Inches(0.5 + col * 3.3)
    y = Inches(2.3 + row * 2.3)
    card = add_shape(slide, x, y, Inches(3.0), Inches(2.0), DARK_CARD, radius=True)
    add_shape(slide, x + Inches(0.04), y + Inches(0.1), Inches(0.04), Inches(1.8), accent)
    add_text(slide, x + Inches(0.2), y + Inches(0.12), Inches(0.5), Inches(0.4),
             icon, size=22, color=accent, font="Segoe UI Emoji")
    add_text(slide, x + Inches(0.7), y + Inches(0.15), Inches(2.0), Inches(0.3),
             title, size=14, color=WHITE, bold=True)
    add_text(slide, x + Inches(0.2), y + Inches(0.6), Inches(2.6), Inches(1.2),
             desc, size=11, color=GRAY)

# Right — PACS mockup
add_image(slide, os.path.join(ASSETS, "mockup_radiology.png"),
          Inches(7.3), Inches(1.8), Inches(5.5), Inches(3.4))

# Standards bar
modalities = ["X-Ray", "CT Scan", "MRI", "Ultrasound", "Mammography", "PET-CT"]
for i, m in enumerate(modalities):
    x = Inches(7.3 + i * 0.92)
    pill = add_shape(slide, x, Inches(5.5), Inches(0.85), Inches(0.35), DARK_CARD, radius=True)
    add_text(slide, x, Inches(5.52), Inches(0.85), Inches(0.3),
             m, size=9, color=BLUE, bold=True, align=PP_ALIGN.CENTER)

# Compliance bar
add_shape(slide, Inches(7.3), Inches(6.1), Inches(5.5), Inches(0.7), DARK_CARD, radius=True)
add_text(slide, Inches(7.5), Inches(6.18), Inches(5.0), Inches(0.5),
         "DICOM  •  HL7  •  FHIR  •  IHE XDS  •  Multi-modality", size=13, color=TEAL_LIGHT, align=PP_ALIGN.CENTER)

# Bottom highlight
add_shape(slide, Inches(0.5), Inches(6.8), Inches(6.3), Inches(0.5), DARK_CARD, radius=True)
add_text(slide, Inches(0.7), Inches(6.85), Inches(6.0), Inches(0.4),
         "🔗  Integrated ordering from OPD / IPD / ER with smart priority tagging", size=12, color=TEAL_LIGHT)


# ════════════════════════════════════════════════════════════
# SLIDE 7 — IOT PATIENT MONITORING (NEW — with mockup)
# ════════════════════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_bg_image(slide, os.path.join(ASSETS, "bg_section_2.png"))

add_text(slide, Inches(0.8), Inches(0.4), Inches(6), Inches(0.4),
         "CONNECTED HEALTHCARE", size=13, color=EMERALD, bold=True)
add_text(slide, Inches(0.8), Inches(0.8), Inches(8), Inches(0.7),
         "IoT Patient Monitoring System", size=36, color=WHITE, bold=True)
add_text(slide, Inches(0.8), Inches(1.5), Inches(6.5), Inches(0.5),
         "Real-time vitals streaming, smart alerting, and predictive analytics from bedside to home", size=15, color=GRAY)

# Left — IoT features
iot_cards = [
    ("❤️", "Vital Signs", "Heart rate, SpO2, BP, temperature,\nECG, respiratory rate — real-time", ROSE),
    ("📟", "Connected Devices", "Pulse oximeters, BP monitors,\nglucometers, ECG patches, scales", TEAL),
    ("🔔", "Smart Alerting", "Abnormal vitals auto-alert with\nescalation to doctor/nurse/family", AMBER),
    ("📊", "Predictive Analytics", "Trend analysis, deterioration\nscoring, cohort comparison", BLUE),
    ("🏠", "Remote Monitoring", "Home RPM for chronic disease,\npost-discharge, caregiver access", EMERALD),
    ("🏥", "Bedside Integration", "ICU/ward live monitors, nurse\ndashboard, EMR auto-documentation", PURPLE),
]
for i, (icon, title, desc, accent) in enumerate(iot_cards):
    col = i % 2
    row = i // 2
    x = Inches(0.5 + col * 3.3)
    y = Inches(2.2 + row * 1.65)
    card = add_shape(slide, x, y, Inches(3.0), Inches(1.45), DARK_CARD, radius=True)
    add_shape(slide, x + Inches(0.04), y + Inches(0.08), Inches(0.04), Inches(1.3), accent)
    add_text(slide, x + Inches(0.2), y + Inches(0.08), Inches(0.4), Inches(0.35),
             icon, size=20, color=accent, font="Segoe UI Emoji")
    add_text(slide, x + Inches(0.6), y + Inches(0.1), Inches(2.1), Inches(0.3),
             title, size=13, color=WHITE, bold=True)
    add_text(slide, x + Inches(0.2), y + Inches(0.5), Inches(2.6), Inches(0.8),
             desc, size=11, color=GRAY)

# Right — IoT mockup
add_image(slide, os.path.join(ASSETS, "mockup_iot.png"),
          Inches(7.3), Inches(1.5), Inches(5.5), Inches(3.4))

# Wearable brands bar
add_shape(slide, Inches(7.3), Inches(5.2), Inches(5.5), Inches(0.8), DARK_CARD, radius=True)
add_text(slide, Inches(7.5), Inches(5.25), Inches(5.0), Inches(0.3),
         "SUPPORTED DEVICES & WEARABLES", size=10, color=TEAL, bold=True, align=PP_ALIGN.CENTER)
wearables = "Apple Watch  ·  Samsung  ·  Fitbit  ·  Garmin  ·  Oura  ·  Withings  ·  Omron  ·  Xiaomi"
add_text(slide, Inches(7.5), Inches(5.55), Inches(5.0), Inches(0.3),
         wearables, size=10, color=GRAY, align=PP_ALIGN.CENTER)

# Bottom highlight
add_shape(slide, Inches(0.5), Inches(6.8), Inches(12.3), Inches(0.5), DARK_CARD, radius=True)
add_text(slide, Inches(0.7), Inches(6.85), Inches(12.0), Inches(0.4),
         "🔗  Bluetooth / Wi-Fi / Cellular connectivity  •  Real-time streaming  •  Critical value protocols  •  Auto EMR documentation",
         size=12, color=EMERALD, align=PP_ALIGN.CENTER)


# ════════════════════════════════════════════════════════════
# SLIDE 8 — TELEMEDICINE & VIRTUAL CARE
# ════════════════════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_bg_image(slide, os.path.join(ASSETS, "bg_section_3.png"))
add_section_title(slide, "Telemedicine & Virtual Care", "Enterprise-grade video consultations with full data sovereignty")

# Left — features
tele_items = [
    "Self-hosted LiveKit server — no third-party data sharing",
    "HD video + audio + real-time chat consultations",
    "HIPAA-compliant recording & complete audit trails",
    "Agora RTC as backup — zero downtime guarantee",
    "Integrated payment via Health Coins or membership",
    "Progressive Web App — works on all devices",
    "Automated scheduling with email + WhatsApp + SMS reminders",
    "Prescription sharing & lab order placement during call",
]
add_bullet_text(slide, Inches(0.8), Inches(2.0), Inches(5.5), Inches(4.5),
                tele_items, size=14, color=LIGHT_GRAY, bullet="✓", spacing=Pt(7))

# Right — stats cards
tele_stats = [
    ("🔒", "HIPAA Compliant", "End-to-end encryption\nAudit trail & consent\nZero-trust security", TEAL),
    ("🌐", "Self-Hosted", "LiveKit server (v1.9.11)\nFull data sovereignty\nNo vendor lock-in", EMERALD),
    ("📱", "Multi-Channel", "Video · Audio · Chat\nWhatsApp · SMS · Email\nPush notifications", BLUE),
    ("⚡", "Low Latency", "WebSocket signaling\nCloudflare CDN edge\nSub-second connection", PURPLE),
]
for i, (icon, title, desc, accent) in enumerate(tele_stats):
    col = i % 2
    row = i // 2
    x = Inches(7.0 + col * 3.1)
    y = Inches(1.8 + row * 2.6)
    card = add_shape(slide, x, y, Inches(2.8), Inches(2.3), DARK_CARD, radius=True)
    add_shape(slide, x + Inches(0.1), y + Inches(0.06), Inches(2.6), Inches(0.04), accent)
    add_text(slide, x + Inches(0.3), y + Inches(0.2), Inches(0.5), Inches(0.5),
             icon, size=26, color=accent, font="Segoe UI Emoji")
    add_text(slide, x + Inches(0.3), y + Inches(0.7), Inches(2.2), Inches(0.3),
             title, size=14, color=WHITE, bold=True)
    add_text(slide, x + Inches(0.3), y + Inches(1.1), Inches(2.2), Inches(1.0),
             desc, size=11, color=GRAY)


# ════════════════════════════════════════════════════════════
# SLIDE 9 — PATIENT ENGAGEMENT (Athma Care App style)
# ════════════════════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_bg_image(slide, os.path.join(ASSETS, "bg_section_1.png"))

add_text(slide, Inches(0.8), Inches(0.4), Inches(6), Inches(0.4),
         "PATIENT EXPERIENCE", size=13, color=TEAL, bold=True)
add_text(slide, Inches(0.8), Inches(0.8), Inches(8), Inches(0.7),
         "Skip the Queue — Let Patients Take Charge", size=34, color=WHITE, bold=True)
add_text(slide, Inches(0.8), Inches(1.5), Inches(6), Inches(0.4),
         "Empower patients with online management, self check-ins, and 24/7 AI assistance", size=14, color=GRAY)

# Impact stats row (Athma's "95% improvement" style)
patient_impacts = [
    ("95%", "Improvement in\nPatient Throughput", TEAL),
    ("1/3rd", "Hours Saved in\nAppointment Booking", EMERALD),
    ("56%", "Reduction in\nAdmin Workflows", BLUE),
]
for i, (val, label, accent) in enumerate(patient_impacts):
    x = Inches(0.5 + i * 4.2)
    card = add_shape(slide, x, y, Inches(3.8), Inches(1.0), DARK_CARD, radius=True)
    y_pos = Inches(2.2)
    card = add_shape(slide, x, y_pos, Inches(3.8), Inches(1.0), DARK_CARD, radius=True)
    add_text(slide, x + Inches(0.2), y_pos + Inches(0.1), Inches(1.3), Inches(0.8),
             val, size=32, color=accent, bold=True)
    add_text(slide, x + Inches(1.6), y_pos + Inches(0.15), Inches(2.0), Inches(0.7),
             label, size=12, color=LIGHT_GRAY)

# Feature cards
patient_features = [
    ("🤖", "AI Doctor", "24/7 AI health assistant\nSymptom analysis & triage\nMulti-language support", TEAL),
    ("📹", "Video Consult", "HD video consultations\nChat & audio calls\nRecording & audit trail", EMERALD),
    ("❤️", "Health Dashboard", "Real-time vitals tracking\nWearable integration\nAI health insights", ROSE),
    ("📊", "Health Intelligence", "Health Risk Assessment\nPersonalized analytics\nPredictive insights", BLUE),
    ("🏆", "Wellness", "Gamified challenges\nDiet & nutrition plans\nWellness calendar", ORANGE),
    ("📄", "Health Records", "OCR report scanning\nABDM/ABHA integration\nCloud document storage", PURPLE),
    ("💳", "Digital Wallet", "Health Coins (1 HC = ₹1)\nMembership plans\nFamily account support", AMBER),
    ("🚑", "Emergency", "24/7 triage & dispatch\nAmbulance tracking\nDoctor dispatch", RED_DARK),
]
for i, (icon, title, desc, accent) in enumerate(patient_features):
    col = i % 4
    row = i // 4
    x = Inches(0.5 + col * 3.15)
    y = Inches(3.5 + row * 2.0)
    card = add_shape(slide, x, y, Inches(2.9), Inches(1.75), DARK_CARD, radius=True)
    add_shape(slide, x + Inches(0.1), y + Inches(0.04), Inches(2.7), Inches(0.035), accent)
    add_text(slide, x + Inches(0.2), y + Inches(0.15), Inches(0.4), Inches(0.4),
             icon, size=20, color=accent, font="Segoe UI Emoji")
    add_text(slide, x + Inches(0.6), y + Inches(0.15), Inches(2.0), Inches(0.3),
             title, size=13, color=WHITE, bold=True)
    add_text(slide, x + Inches(0.2), y + Inches(0.55), Inches(2.5), Inches(1.0),
             desc, size=10, color=GRAY)


# ════════════════════════════════════════════════════════════
# SLIDE 10 — HOSPITAL & ENTERPRISE (30+ modules)
# ════════════════════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_bg_image(slide, os.path.join(ASSETS, "bg_section_2.png"))
add_section_title(slide, "Hospital & Enterprise Management", "30+ integrated modules for end-to-end hospital operations")

hospital_modules = [
    ("🏥", "OPD / IPD", "Outpatient & inpatient\nAdmission workflows\nDischarge summaries"),
    ("🛏️", "Bed Management", "Real-time bed tracking\nWard management\nOccupancy analytics"),
    ("💰", "Revenue Cycle", "Billing & collections\nInsurance claims\nPayment processing"),
    ("👥", "Staff Management", "Scheduling & shifts\nPerformance tracking\nRole-based access"),
    ("🧪", "Lab & Imaging", "Order management\nResult integration\nSample tracking"),
    ("💊", "Pharmacy", "POS system\nInventory management\nExpiry & batch tracking"),
    ("📊", "Analytics & MRD", "Revenue analytics\nMedical Records Dept\nCompliance reports"),
    ("📡", "Communication Hub", "Team chat, WhatsApp\nEmail & SMS alerts\nReferral management"),
]
for i, (icon, title, desc) in enumerate(hospital_modules):
    col = i % 4
    row = i // 4
    x = Inches(0.5 + col * 3.15)
    y = Inches(2.0 + row * 2.5)
    add_icon_card(slide, x, y, Inches(2.9), Inches(2.2), icon, title, desc)


# ════════════════════════════════════════════════════════════
# SLIDE 11 — INSURANCE ECOSYSTEM
# ════════════════════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_bg_image(slide, os.path.join(ASSETS, "bg_section_3.png"))
add_section_title(slide, "Insurance & Corporate Wellness", "Complete insurance pipeline & enterprise health management")

# Flow diagram
add_text(slide, Inches(0.8), Inches(1.8), Inches(12), Inches(0.4),
         "End-to-End Insurance Flow", size=18, color=WHITE, bold=True)

flow_items = ["Hospital", "TPA", "Insurer", "Broker", "Corporate"]
for i, item in enumerate(flow_items):
    x = Inches(0.8 + i * 2.5)
    bg_c = TEAL if i % 2 == 0 else DARK_CARD
    card = add_shape(slide, x, Inches(2.3), Inches(2.0), Inches(0.65), bg_c, radius=True)
    add_text(slide, x, Inches(2.35), Inches(2.0), Inches(0.5),
             item, size=14, color=WHITE, bold=True, align=PP_ALIGN.CENTER)
    if i < len(flow_items) - 1:
        add_text(slide, x + Inches(2.0), Inches(2.35), Inches(0.5), Inches(0.5),
                 "→", size=20, color=TEAL, align=PP_ALIGN.CENTER)

# Feature cards
corp_cards = [
    ("🏢", "Corporate Portal", "Employee health management\nBenefits administration\nWorkforce analytics\nDepartment-wise reports", TEAL),
    ("📊", "Health Analytics", "Workforce health scoring\nRisk assessment\nCompliance tracking\nGamified wellness", EMERALD),
    ("🛡️", "TPA Portal", "Claims management\nPre-authorization\nProvider network mgmt\nE-cards & heritage", BLUE),
    ("📋", "Insurance Broker", "Policy management\nCommission tracking\nCorporate client mgmt\nAnalytics & reporting", PURPLE),
]
for i, (icon, title, desc, accent) in enumerate(corp_cards):
    x = Inches(0.5 + i * 3.2)
    card = add_shape(slide, x, Inches(3.4), Inches(2.9), Inches(3.3), DARK_CARD, radius=True)
    add_shape(slide, x + Inches(0.1), Inches(3.44), Inches(2.7), Inches(0.04), accent)
    add_text(slide, x + Inches(0.3), Inches(3.6), Inches(0.5), Inches(0.5),
             icon, size=24, color=accent, font="Segoe UI Emoji")
    add_text(slide, x + Inches(0.3), Inches(4.1), Inches(2.4), Inches(0.35),
             title, size=15, color=WHITE, bold=True)
    add_text(slide, x + Inches(0.3), Inches(4.5), Inches(2.4), Inches(2.0),
             desc, size=12, color=GRAY)


# ════════════════════════════════════════════════════════════
# SLIDE 12 — COMPLIANCE & SECURITY
# ════════════════════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_bg_image(slide, os.path.join(ASSETS, "bg_section_1.png"))
add_section_title(slide, "Compliance & Security", "Healthcare-grade data protection and standards compliance")

compliance_items = [
    ("🔒", "HIPAA Compliance", "Full audit trails & access logging\nData encryption at rest & in transit\nRetention policies & consent mgmt\nRole-based access control (RBAC)", TEAL),
    ("🆔", "ABDM / ABHA", "Ayushman Bharat Digital Mission\n14-digit ABHA Health ID\nHealth information exchange\nDigital health records standard", EMERALD),
    ("🏷️", "ICD-10 & DICOM", "50+ condition auto-mapping\nDICOM/HL7/FHIR compliance\nClinical terminology alignment\nGlobal interoperability", BLUE),
    ("🏗️", "Multi-Tenant RLS", "PostgreSQL Row-Level Security\nComplete tenant data isolation\nCustom domain per tenant\nModule-level access control", PURPLE),
]

for i, (icon, title, desc, accent) in enumerate(compliance_items):
    x = Inches(0.5 + i * 3.2)
    card = add_shape(slide, x, Inches(2.0), Inches(2.9), Inches(3.8), DARK_CARD, radius=True)
    add_shape(slide, x + Inches(0.1), Inches(2.04), Inches(2.7), Inches(0.04), accent)
    add_text(slide, x + Inches(0.3), Inches(2.25), Inches(0.5), Inches(0.5),
             icon, size=28, color=accent, font="Segoe UI Emoji")
    add_text(slide, x + Inches(0.3), Inches(2.8), Inches(2.4), Inches(0.35),
             title, size=16, color=WHITE, bold=True)
    add_text(slide, x + Inches(0.3), Inches(3.25), Inches(2.4), Inches(2.3),
             desc, size=12, color=GRAY)

# Bottom security banner
add_shape(slide, Inches(0.5), Inches(6.1), Inches(12.3), Inches(0.8), DARK_CARD, radius=True)
add_text(slide, Inches(0.5), Inches(6.2), Inches(12.3), Inches(0.5),
         "🔐  Enterprise-grade zero-trust architecture  •  Encrypted communications  •  Complete audit trails  •  NABH ready",
         size=13, color=TEAL_LIGHT, align=PP_ALIGN.CENTER)


# ════════════════════════════════════════════════════════════
# SLIDE 13 — ARCHITECTURE (Athma/TrioTree style)
# ════════════════════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_bg_image(slide, os.path.join(ASSETS, "bg_section_2.png"))
add_section_title(slide, "Architecture — Built for Scale", "Microservices, security-first, cloud-agnostic design")

# Architecture diagram on left
add_image(slide, os.path.join(ASSETS, "architecture_diagram.png"),
          Inches(0.3), Inches(1.5), Inches(5.8), Inches(3.7))

# Tech stack on right
tech_cols = [
    ("Frontend", [
        "React 18 + TypeScript + Vite",
        "Tailwind CSS + Shadcn/UI",
        "Framer Motion animations",
        "TanStack Query + Zustand",
        "Recharts + Chart.js",
    ], TEAL),
    ("Backend & Data", [
        "Node.js + Express.js",
        "PostgreSQL + Sequelize ORM",
        "Redis · DuckDB · BullMQ",
        "Socket.IO + Kafka",
        "JWT + OAuth2 + OTP",
    ], EMERALD),
    ("AI / Infra", [
        "OpenAI · Gemini · Claude · Groq",
        "Whisper.cpp + custom GGUF",
        "Tesseract.js (OCR)",
        "AWS S3 · PM2 · Cloudflare",
        "Prometheus + Grafana",
    ], BLUE),
]

for i, (title, items, accent) in enumerate(tech_cols):
    x = Inches(6.5 + i * 2.3)
    card = add_shape(slide, x, Inches(1.8), Inches(2.1), Inches(3.5), DARK_CARD, radius=True)
    add_shape(slide, x + Inches(0.05), Inches(1.83), Inches(2.0), Inches(0.04), accent)
    add_text(slide, x + Inches(0.15), Inches(2.0), Inches(1.8), Inches(0.3),
             title, size=14, color=accent, bold=True)
    add_bullet_text(slide, x + Inches(0.1), Inches(2.4), Inches(1.9), Inches(2.8),
                    items, size=10, color=LIGHT_GRAY, bullet="▸", spacing=Pt(3))

# Key architecture features
arch_features = [
    ("☁️ Cloud Agnostic", TEAL), ("🔒 Security-First", EMERALD),
    ("📦 Modular Deploy", BLUE), ("⚡ Low Latency", PURPLE),
    ("🔄 Event-Driven", ORANGE), ("📊 Real-Time Analytics", ROSE),
]
for i, (label, accent) in enumerate(arch_features):
    x = Inches(0.3 + i * 2.15)
    pill = add_shape(slide, x, Inches(5.6), Inches(2.0), Inches(0.45), DARK_CARD, radius=True)
    add_text(slide, x, Inches(5.62), Inches(2.0), Inches(0.4),
             label, size=11, color=accent, bold=True, align=PP_ALIGN.CENTER)

# Bottom integrations bar
add_shape(slide, Inches(0.3), Inches(6.3), Inches(12.7), Inches(0.8), DARK_CARD, radius=True)
add_text(slide, Inches(0.5), Inches(6.35), Inches(12.3), Inches(0.3),
         "INTEGRATIONS", size=10, color=TEAL, bold=True, align=PP_ALIGN.CENTER)
integrations = "Razorpay  •  Stripe  •  LiveKit  •  Agora  •  Twilio  •  SendGrid  •  Firebase  •  WhatsApp  •  Leaflet Maps  •  Apple Health  •  Google Fit"
add_text(slide, Inches(0.5), Inches(6.65), Inches(12.3), Inches(0.3),
         integrations, size=10, color=GRAY, align=PP_ALIGN.CENTER)


# ════════════════════════════════════════════════════════════
# SLIDE 14 — MULTI-PORTAL ECOSYSTEM
# ════════════════════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_bg_image(slide, os.path.join(ASSETS, "bg_section_3.png"))
add_section_title(slide, "12+ Dedicated Portals", "Purpose-built interfaces for every healthcare stakeholder")

portals = [
    ("👤", "Patient", "Health dashboard, AI Doctor,\nconsultations, insurance", TEAL),
    ("👨‍⚕️", "Doctor", "EMR, AI Scribe, CDSS,\nprescriptions, video", EMERALD),
    ("👩‍⚕️", "Nurse", "Vitals, medications,\nnotes, ward mgmt", BLUE),
    ("📋", "Assistant", "Registration, billing,\nappointments, tasks", PURPLE),
    ("🏥", "Hospital", "30+ modules: OPD/IPD,\nbeds, billing, EHR", TEAL),
    ("🏪", "Clinic", "Queue, consultations,\nprescriptions, billing", EMERALD),
    ("🧪", "Lab", "Test catalog, samples,\nresults, inventory", BLUE),
    ("💊", "Pharmacy", "POS, inventory, batch\ntracking, orders", PURPLE),
    ("🚑", "Ambulance", "Live tracking, dispatch,\nfleet management", ORANGE),
    ("🏠", "Homecare", "Care plans, scheduling,\npatient management", ROSE),
    ("🏢", "Corporate", "Wellness, health analytics,\ncompliance, gamification", AMBER),
    ("⚙️", "Admin", "50+ modules, CRM, tenant\nmgmt, API credentials", TEAL_LIGHT),
]

for i, (icon, title, desc, accent) in enumerate(portals):
    col = i % 6
    row = i // 6
    x = Inches(0.4 + col * 2.1)
    y = Inches(1.8 + row * 2.8)
    card = add_shape(slide, x, y, Inches(1.9), Inches(2.4), DARK_CARD, radius=True)
    add_shape(slide, x + Inches(0.05), y + Inches(0.04), Inches(1.8), Inches(0.04), accent)
    add_text(slide, x + Inches(0.2), y + Inches(0.2), Inches(0.5), Inches(0.4),
             icon, size=22, color=accent, font="Segoe UI Emoji")
    add_text(slide, x + Inches(0.2), y + Inches(0.65), Inches(1.5), Inches(0.3),
             title, size=14, color=WHITE, bold=True)
    add_text(slide, x + Inches(0.2), y + Inches(1.0), Inches(1.5), Inches(1.2),
             desc, size=10, color=GRAY)


# ════════════════════════════════════════════════════════════
# SLIDE 15 — PRICING PLANS
# ════════════════════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_bg_image(slide, os.path.join(ASSETS, "bg_section_1.png"))
add_section_title(slide, "Flexible Pricing Plans", "Plans for individuals, clinics, hospitals, and enterprises")

# Personal plans
add_text(slide, Inches(0.8), Inches(1.7), Inches(5), Inches(0.3),
         "PERSONAL PLANS", size=12, color=TEAL, bold=True)

plans = [
    ("Free Basic", "₹0", "/lifetime", "Referral-based signup\n2 video · 3 audio · 5 chats/mo\nBasic health dashboard", False),
    ("Basic", "₹199", "/month", "5 video · 10 audio · 20 chats\nAI Scribe (5/mo)\n20% coin bonus", False),
    ("Premium", "₹499", "/month", "Unlimited consultations\nPriority booking\nDedicated health manager\n50% coin bonus · 15% lab discount", True),
    ("Enterprise", "₹999", "/month", "Concierge service\nGenetic testing · Fitness coach\nMental health · Travel insurance\n100% coin bonus", False),
]

for i, (name, price, period, features, popular) in enumerate(plans):
    x = Inches(0.5 + i * 3.15)
    bg_c = TEAL_DARK if popular else DARK_CARD
    card = add_shape(slide, x, Inches(2.0), Inches(2.9), Inches(3.3), bg_c, radius=True)
    if popular:
        pill = add_shape(slide, x + Inches(0.8), Inches(2.05), Inches(1.3), Inches(0.22), EMERALD, radius=True)
        add_text(slide, x + Inches(0.8), Inches(2.04), Inches(1.3), Inches(0.22),
                 "POPULAR", size=8, color=WHITE, bold=True, align=PP_ALIGN.CENTER)
    add_text(slide, x + Inches(0.3), Inches(2.35), Inches(2.3), Inches(0.3),
             name, size=16, color=WHITE, bold=True)
    add_rich(slide, x + Inches(0.3), Inches(2.7), Inches(2.3), Inches(0.5), [
        {"text": price, "size": 28, "color": WHITE if popular else TEAL_LIGHT, "bold": True},
        {"text": period, "size": 12, "color": GRAY},
    ])
    add_text(slide, x + Inches(0.3), Inches(3.3), Inches(2.3), Inches(1.8),
             features, size=11, color=WHITE if popular else LIGHT_GRAY)

# Corporate plans
add_text(slide, Inches(0.8), Inches(5.6), Inches(5), Inches(0.3),
         "CORPORATE PLANS  (per employee)", size=12, color=TEAL, bold=True)
corp_plans = [
    ("Corporate Basic", "₹149/emp/mo", "₹1,499/yr"),
    ("Corporate Premium", "₹299/emp/mo", "₹2,999/yr"),
    ("Corporate Enterprise", "Custom Pricing", "Contact Sales"),
]
for i, (name, monthly, annual) in enumerate(corp_plans):
    x = Inches(0.5 + i * 4.2)
    card = add_shape(slide, x, Inches(5.9), Inches(3.8), Inches(1.0), DARK_CARD, radius=True)
    add_text(slide, x + Inches(0.2), Inches(5.95), Inches(1.6), Inches(0.3),
             name, size=12, color=WHITE, bold=True)
    add_text(slide, x + Inches(2.0), Inches(5.95), Inches(1.6), Inches(0.3),
             monthly, size=12, color=TEAL_LIGHT, bold=True, align=PP_ALIGN.RIGHT)
    add_text(slide, x + Inches(0.2), Inches(6.35), Inches(3.4), Inches(0.3),
             f"Annual: {annual}", size=10, color=GRAY)


# ════════════════════════════════════════════════════════════
# SLIDE 16 — CASE STUDY (inspired by Athma/TrioTree)
# ════════════════════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_bg_image(slide, os.path.join(ASSETS, "bg_impact.png"))

add_text(slide, Inches(0.8), Inches(0.4), Inches(6), Inches(0.4),
         "CASE STUDY", size=13, color=TEAL, bold=True)
add_text(slide, Inches(0.8), Inches(0.8), Inches(8), Inches(0.7),
         "Transforming Care Delivery", size=36, color=WHITE, bold=True)
add_text(slide, Inches(0.8), Inches(1.5), Inches(8), Inches(0.4),
         "See how Mediqzy drives quantifiable results for healthcare facilities", size=15, color=GRAY)

# Problem → Solution → Impact layout (Athma style)
# Problem section
add_shape(slide, Inches(0.5), Inches(2.3), Inches(3.8), Inches(4.5), DARK_CARD, radius=True)
add_shape(slide, Inches(0.55), Inches(2.34), Inches(3.7), Inches(0.04), RED_DARK)
add_text(slide, Inches(0.7), Inches(2.5), Inches(3.5), Inches(0.4),
         "⚠️  The Challenge", size=16, color=RED_DARK, bold=True)
challenge_items = [
    "Fragmented systems across departments",
    "Long patient queues & wait times",
    "Paper-based prescriptions & records",
    "No AI-powered clinical support",
    "Manual insurance claim processing",
    "Poor visibility into operations",
]
add_bullet_text(slide, Inches(0.7), Inches(3.1), Inches(3.4), Inches(3.5),
                challenge_items, size=12, color=LIGHT_GRAY, bullet="✕", spacing=Pt(5))

# Solution section
add_shape(slide, Inches(4.7), Inches(2.3), Inches(3.8), Inches(4.5), DARK_CARD, radius=True)
add_shape(slide, Inches(4.75), Inches(2.34), Inches(3.7), Inches(0.04), TEAL)
add_text(slide, Inches(4.9), Inches(2.5), Inches(3.5), Inches(0.4),
         "✅  The Mediqzy Way", size=16, color=TEAL, bold=True)
solution_items = [
    "Unified platform replacing 10+ tools",
    "Online booking, self check-in, kiosk",
    "Digital prescriptions & cloud EHR",
    "AI Scribe + CDSS + AI Vision",
    "Automated claims & TPA integration",
    "Real-time analytics & KPI dashboards",
]
add_bullet_text(slide, Inches(4.9), Inches(3.1), Inches(3.4), Inches(3.5),
                solution_items, size=12, color=LIGHT_GRAY, bullet="✓", spacing=Pt(5))

# Impact section
add_shape(slide, Inches(8.9), Inches(2.3), Inches(4.0), Inches(4.5), DARK_CARD, radius=True)
add_shape(slide, Inches(8.95), Inches(2.34), Inches(3.9), Inches(0.04), EMERALD)
add_text(slide, Inches(9.1), Inches(2.5), Inches(3.7), Inches(0.4),
         "📈  The Impact", size=16, color=EMERALD, bold=True)

impact_metrics = [
    ("40%", "reduction in patient waiting time"),
    ("56%", "drop in admin workload"),
    ("65%", "reduction in medical errors"),
    ("70%", "appointments booked online"),
    ("5.5 hrs", "doctor time saved per week"),
]
for j, (val, label) in enumerate(impact_metrics):
    y = Inches(3.1 + j * 0.7)
    add_rich(slide, Inches(9.1), y, Inches(3.6), Inches(0.35), [
        {"text": val, "size": 20, "color": EMERALD, "bold": True},
        {"text": f"  {label}", "size": 11, "color": LIGHT_GRAY},
    ])
    if j < len(impact_metrics) - 1:
        add_shape(slide, Inches(9.1), y + Inches(0.45), Inches(3.4), Inches(0.01), GRAY)


# ════════════════════════════════════════════════════════════
# SLIDE 17 — WHY MEDIQZY (Key differentiators)
# ════════════════════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_bg_image(slide, os.path.join(ASSETS, "bg_section_3.png"))
add_section_title(slide, "Why Mediqzy?", "Key differentiators that make us the preferred choice")

diffs = [
    ("1", "All-in-One Platform", "Single unified system replacing 10+ fragmented\ntools — from patient engagement to hospital\nops, labs, pharmacy, insurance, and corporate.", TEAL),
    ("2", "AI-First Clinical Suite", "9 integrated AI capabilities: offline AI Scribe,\nCDSS, AI Vision, AI Doctor — core to every\nclinical workflow, not bolt-on features.", EMERALD),
    ("3", "RIS/PACS Tele-Radiology", "Full radiology workflow — DICOM viewer, tele-\nradiology with SLA tracking, AI-assisted reads,\nstructured reporting & multi-modality.", BLUE),
    ("4", "IoT Patient Monitoring", "Connected device ecosystem for real-time vitals\n— ICU bedside, RPM at home, smart alerts,\npredictive deterioration scoring.", PURPLE),
    ("5", "India-Ready Compliance", "Native ABDM/ABHA, ICD-10, DICOM/HL7/FHIR,\nHIPAA-grade security, NABH-ready — built for\nIndian & global regulations.", ORANGE),
    ("6", "White-Label SaaS", "Multi-tenant architecture with PostgreSQL RLS,\ncustom domains, module access control —\nperfect for healthcare aggregators & chains.", ROSE),
]

for i, (num, title, desc, accent) in enumerate(diffs):
    col = i % 3
    row = i // 3
    x = Inches(0.8 + col * 4.0)
    y = Inches(1.8 + row * 2.7)
    add_accent_card(slide, x, y, Inches(3.6), Inches(2.4), accent, title, desc, num)


# ════════════════════════════════════════════════════════════
# SLIDE 18 — CTA / CLOSING (Cinematic style)
# ════════════════════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_bg_image(slide, os.path.join(ASSETS, "bg_cta.png"))

# Logo centered
add_image(slide, LOGO, Inches(5.4), Inches(0.6), Inches(2.5), Inches(2.5))

# Main CTA text
add_text(slide, Inches(1.5), Inches(3.2), Inches(10.3), Inches(0.8),
         "Ready to Transform Healthcare?", size=42, color=WHITE, bold=True, align=PP_ALIGN.CENTER)

add_text(slide, Inches(1.5), Inches(4.0), Inches(10.3), Inches(0.5),
         "Join the digital revolution with Mediqzy today.", size=20, color=TEAL_LIGHT, align=PP_ALIGN.CENTER)

# CTA button
cta = add_shape(slide, Inches(4.5), Inches(4.8), Inches(4.3), Inches(0.7), TEAL, radius=True)
add_text(slide, Inches(4.5), Inches(4.85), Inches(4.3), Inches(0.6),
         "Schedule a Demo  →", size=20, color=WHITE, bold=True, align=PP_ALIGN.CENTER)

# Contact row
contacts = [
    ("🌐  app.mediqzy.com", TEAL_LIGHT),
    ("📧  support@mediqzy.com", LIGHT_GRAY),
    ("🐦  @mediqzy", LIGHT_GRAY),
]
for i, (text, clr) in enumerate(contacts):
    add_text(slide, Inches(1.5), Inches(5.8 + i * 0.4), Inches(10.3), Inches(0.35),
             text, size=14, color=clr, align=PP_ALIGN.CENTER, font="Segoe UI Emoji")

# Copyright
add_text(slide, Inches(0), Inches(7.0), Inches(13.33), Inches(0.3),
         "© 2026 Mediqzy Healthcare. All rights reserved.", size=10, color=GRAY, align=PP_ALIGN.CENTER)


# ═══════════════════════════════════════════════
# SAVE
# ═══════════════════════════════════════════════
output = os.path.join(BASE, "Mediqzy_Marketing_Deck.pptx")
prs.save(output)
print(f"\n✅ Premium marketing deck saved to: {output}")
print(f"   Slides: {len(prs.slides)}")
print(f"   Format: Widescreen 16:9 (13.33\" × 7.5\")")
print(f"   Custom assets: {len(os.listdir(ASSETS))} images in deck_assets/")
