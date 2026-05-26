"""
Mediqzy — World-Class AI-First HMIS Comprehensive Proposal PPT
33 slides · 178 modules · 22 domains · Absolutely Paperless
"""

from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.util import Inches, Pt
import pptx.oxml.ns as nsmap
from lxml import etree
import copy

# ── Brand palette ─────────────────────────────────────────────────────────────
NAVY    = RGBColor(0x06, 0x07, 0x2A)   # deep navy
DARK    = RGBColor(0x0A, 0x0D, 0x3A)   # slide bg
BLUE    = RGBColor(0x16, 0x4E, 0xAA)   # mid-blue accent
CYAN    = RGBColor(0x00, 0xD4, 0xFF)   # electric cyan
VIOLET  = RGBColor(0x7C, 0x3A, 0xED)   # AI violet
GOLD    = RGBColor(0xFF, 0xC0, 0x1E)   # gold accent
WHITE   = RGBColor(0xFF, 0xFF, 0xFF)
LGRAY   = RGBColor(0xB0, 0xBE, 0xD4)   # light grey text
GREEN   = RGBColor(0x22, 0xC5, 0x5E)   # positive/paperless green
TEAL    = RGBColor(0x14, 0xB8, 0xA6)   # teal

W = Inches(13.33)   # 16:9 width
H = Inches(7.5)     # 16:9 height

prs = Presentation()
prs.slide_width  = W
prs.slide_height = H

BLANK = prs.slide_layouts[6]   # completely blank

# ── Low-level helpers ─────────────────────────────────────────────────────────

def rgb_hex(c: RGBColor) -> str:
    return f"{c[0]:02X}{c[1]:02X}{c[2]:02X}"

def solid_fill(shape, color: RGBColor):
    sf = shape.fill
    sf.solid()
    sf.fore_color.rgb = color

def add_rect(slide, l, t, w, h, color: RGBColor, alpha=None):
    from pptx.util import Emu
    s = slide.shapes.add_shape(1, l, t, w, h)   # MSO_SHAPE_TYPE.RECTANGLE = 1
    solid_fill(s, color)
    s.line.fill.background()
    return s

def add_txt(slide, text, l, t, w, h,
            size=18, bold=False, color=WHITE, align=PP_ALIGN.LEFT,
            italic=False, wrap=True):
    txb = slide.shapes.add_textbox(l, t, w, h)
    tf  = txb.text_frame
    tf.word_wrap = wrap
    p = tf.paragraphs[0]
    p.alignment = align
    run = p.add_run()
    run.text = text
    run.font.size  = Pt(size)
    run.font.bold  = bold
    run.font.color.rgb = color
    run.font.italic = italic
    return txb

def add_gradient_bg(slide, c1=DARK, c2=NAVY):
    """Full-slide gradient rectangle (two overlapping solid fills simulate gradient)."""
    add_rect(slide, 0, 0, W, H, c1)
    # subtle left-edge overlay
    add_rect(slide, 0, 0, Inches(3), H, RGBColor(0x0C, 0x10, 0x40))

def divider_line(slide, y, color=CYAN, thickness=Pt(1.5)):
    from pptx.util import Pt as PtU
    line = slide.shapes.add_shape(1, Inches(0.45), y, Inches(12.43), Inches(0.02))
    solid_fill(line, color)
    line.line.fill.background()

def pill(slide, l, t, w, h, color: RGBColor, text="", tsize=11, tcolor=WHITE):
    r = slide.shapes.add_shape(5, l, t, w, h)   # rounded rectangle
    solid_fill(r, color)
    r.line.fill.background()
    if text:
        tf = r.text_frame
        tf.word_wrap = False
        p = tf.paragraphs[0]
        p.alignment = PP_ALIGN.CENTER
        run = p.add_run()
        run.text = text
        run.font.size  = Pt(tsize)
        run.font.bold  = True
        run.font.color.rgb = tcolor
    return r

def section_header(slide, title, subtitle=""):
    add_gradient_bg(slide)
    # big accent bar left
    add_rect(slide, 0, 0, Inches(0.12), H, CYAN)
    add_txt(slide, title, Inches(0.45), Inches(2.8), Inches(12), Inches(1.2),
            size=42, bold=True, color=WHITE, align=PP_ALIGN.CENTER)
    if subtitle:
        add_txt(slide, subtitle, Inches(0.45), Inches(4.1), Inches(12), Inches(0.7),
                size=20, color=LGRAY, align=PP_ALIGN.CENTER)
    divider_line(slide, Inches(4.9))

# ── Module card helpers ───────────────────────────────────────────────────────

def module_card(slide, l, t, w, h, icon, title, bullets, accent=CYAN):
    # card bg
    card = slide.shapes.add_shape(5, l, t, w, h)
    solid_fill(card, RGBColor(0x0F, 0x14, 0x4A))
    card.line.color.rgb = accent
    card.line.width = Pt(0.8)
    # top accent bar
    add_rect(slide, l, t, w, Inches(0.07), accent)
    # icon + title
    add_txt(slide, icon + "  " + title, l + Inches(0.12), t + Inches(0.1),
            w - Inches(0.24), Inches(0.38), size=13, bold=True, color=WHITE)
    # bullets
    y_off = Inches(0.52)
    for b in bullets:
        add_txt(slide, "• " + b, l + Inches(0.15), t + y_off,
                w - Inches(0.3), Inches(0.28), size=9.5, color=LGRAY)
        y_off += Inches(0.26)

def module_grid(slide, cards, cols=3, start_l=Inches(0.35), start_t=Inches(1.65),
                card_w=Inches(4.1), card_h=Inches(1.75), gap_x=Inches(0.22), gap_y=Inches(0.2)):
    for i, (icon, title, bullets, accent) in enumerate(cards):
        col = i % cols
        row = i // cols
        l = start_l + col * (card_w + gap_x)
        t = start_t + row * (card_h + gap_y)
        module_card(slide, l, t, card_w, card_h, icon, title, bullets, accent)

# ═════════════════════════════════════════════════════════════════════════════
# SLIDE 1 — COVER
# ═════════════════════════════════════════════════════════════════════════════
sl = prs.slides.add_slide(BLANK)
add_rect(sl, 0, 0, W, H, DARK)
# diagonal accent
add_rect(sl, 0, 0, Inches(0.18), H, CYAN)
add_rect(sl, 0, H - Inches(0.12), W, Inches(0.12), VIOLET)

# badge top-right
pill(sl, Inches(10.5), Inches(0.3), Inches(2.5), Inches(0.5),
     VIOLET, "AI-FIRST · PAPERLESS", tsize=10)

add_txt(sl, "🏥  MEDIQZY", Inches(0.5), Inches(1.2), Inches(12), Inches(0.6),
        size=16, bold=True, color=CYAN, align=PP_ALIGN.LEFT)

add_txt(sl, "World-Class AI Hospital OS", Inches(0.5), Inches(1.85), Inches(12.4), Inches(1.2),
        size=52, bold=True, color=WHITE, align=PP_ALIGN.LEFT)

add_txt(sl, "Complete HMIS · 178 Modules · 22 Domains · Zero Paper",
        Inches(0.5), Inches(3.15), Inches(12.4), Inches(0.55),
        size=21, color=CYAN, align=PP_ALIGN.LEFT)

add_txt(sl, "Transforming every touchpoint — from patient arrival to discharge,\n"
            "from lab to pharmacy, from billing to compliance — with AI at the core.",
        Inches(0.5), Inches(3.8), Inches(9), Inches(1.1),
        size=15, color=LGRAY, align=PP_ALIGN.LEFT)

# stat pills
for x, label, val in [
    (Inches(0.5),  "MODULES",  "178"),
    (Inches(2.6),  "DOMAINS",  "22"),
    (Inches(4.7),  "AI AGENTS","40+"),
    (Inches(6.8),  "PAPERLESS","100%"),
    (Inches(8.9),  "UPTIME",   "99.9%"),
]:
    add_rect(sl, x, Inches(5.15), Inches(1.85), Inches(0.7), RGBColor(0x0F, 0x14, 0x4A))
    add_txt(sl, val,   x + Inches(0.1), Inches(5.18), Inches(1.65), Inches(0.38),
            size=26, bold=True, color=CYAN, align=PP_ALIGN.CENTER)
    add_txt(sl, label, x + Inches(0.1), Inches(5.54), Inches(1.65), Inches(0.28),
            size=9, color=LGRAY, align=PP_ALIGN.CENTER)

add_txt(sl, "Confidential · mediqzy.com · info@mysmarthealth.in",
        Inches(0.5), Inches(6.9), Inches(12), Inches(0.4),
        size=10, color=RGBColor(0x55, 0x60, 0x80), align=PP_ALIGN.CENTER)

# ═════════════════════════════════════════════════════════════════════════════
# SLIDE 2 — VISION: THE PAPERLESS AI-POWERED HOSPITAL
# ═════════════════════════════════════════════════════════════════════════════
sl = prs.slides.add_slide(BLANK)
add_gradient_bg(sl)
add_rect(sl, 0, 0, Inches(0.12), H, GOLD)

add_txt(sl, "OUR VISION", Inches(0.45), Inches(0.3), Inches(12), Inches(0.45),
        size=11, bold=True, color=GOLD, align=PP_ALIGN.LEFT)
add_txt(sl, "The Hospital of Tomorrow — Today",
        Inches(0.45), Inches(0.72), Inches(12.4), Inches(0.8),
        size=36, bold=True, color=WHITE, align=PP_ALIGN.LEFT)
divider_line(sl, Inches(1.6), color=GOLD)

vision_items = [
    ("🚫📄", "Zero Paper",       "Every clinical, administrative & financial workflow is digital-native. No forms, no files, no fax."),
    ("🤖",   "AI at Every Step", "Diagnosis support, auto-coding, predictive alerts, voice orders, smart scheduling — 40+ AI agents embedded."),
    ("⚡",   "Real-Time Data",   "Live dashboards, IoT vitals, bed sensors, lab interfaces — every data point in real time."),
    ("🌐",   "One Platform",     "OPD, IPD, Lab, Pharmacy, Finance, HR, Quality — unified, not siloed. Single source of truth."),
    ("🔒",   "HL7 / FHIR / ABDM","ABDM-ready, HL7 FHIR R4, NABH/JCI-aligned, HIPAA-level security, NMC compliant."),
    ("📱",   "Mobile-First",     "Clinicians, nurses, patients, and admins operate entirely from mobile — iOS, Android, web."),
]

cols = 3
for i, (icon, title, desc) in enumerate(vision_items):
    col = i % cols
    row = i // cols
    l = Inches(0.35) + col * Inches(4.28)
    t = Inches(1.75) + row * Inches(2.3)
    add_rect(sl, l, t, Inches(4.1), Inches(2.1), RGBColor(0x0F, 0x14, 0x4A))
    add_rect(sl, l, t, Inches(4.1), Inches(0.08), GOLD)
    add_txt(sl, icon + "  " + title, l + Inches(0.15), t + Inches(0.12),
            Inches(3.8), Inches(0.4), size=15, bold=True, color=WHITE)
    add_txt(sl, desc, l + Inches(0.15), t + Inches(0.58),
            Inches(3.8), Inches(1.4), size=11, color=LGRAY)

# ═════════════════════════════════════════════════════════════════════════════
# SLIDE 3 — PROBLEM WITH TRADITIONAL HMIS
# ═════════════════════════════════════════════════════════════════════════════
sl = prs.slides.add_slide(BLANK)
add_gradient_bg(sl)
add_rect(sl, 0, 0, Inches(0.12), H, RGBColor(0xEF, 0x44, 0x44))

add_txt(sl, "THE PROBLEM", Inches(0.45), Inches(0.3), Inches(12), Inches(0.45),
        size=11, bold=True, color=RGBColor(0xEF, 0x44, 0x44))
add_txt(sl, "Why Traditional HMIS Systems Fail Hospitals",
        Inches(0.45), Inches(0.72), Inches(12.4), Inches(0.8),
        size=34, bold=True, color=WHITE)
divider_line(sl, Inches(1.6), color=RGBColor(0xEF, 0x44, 0x44))

problems = [
    ("Fragmented Silos",       "Lab, Pharmacy, OPD, Finance — all on separate systems. No single truth."),
    ("Paper-Dependent",        "Admission forms, consent, nursing notes, discharge — all still on paper."),
    ("Zero AI / Intelligence", "No predictive alerts, no auto-coding, no clinical decision support."),
    ("Outdated Architecture",  "Client-server, legacy databases, no cloud, no mobile access."),
    ("Compliance Risk",        "NABH, ABDM, HIPAA — hard to audit, harder to comply with paper trails."),
    ("Poor Patient Experience","Long queues, manual billing, no digital reports, no app — patients frustrated."),
    ("Revenue Leakage",        "Missed charges, under-coding, manual TPA delays — 15–25% revenue lost."),
    ("IT Burden",              "Separate vendors for lab, RIS, pharmacy, HR — impossible to maintain."),
]

for i, (title, desc) in enumerate(problems):
    col = i % 2
    row = i // 2
    l = Inches(0.35) + col * Inches(6.6)
    t = Inches(1.75) + row * Inches(1.28)
    add_rect(sl, l, t, Inches(6.4), Inches(1.15), RGBColor(0x1A, 0x05, 0x05))
    add_rect(sl, l, t, Inches(0.08), Inches(1.15), RGBColor(0xEF, 0x44, 0x44))
    add_txt(sl, "✗  " + title, l + Inches(0.18), t + Inches(0.1),
            Inches(6.1), Inches(0.38), size=13, bold=True, color=RGBColor(0xFF, 0x80, 0x80))
    add_txt(sl, desc, l + Inches(0.18), t + Inches(0.52),
            Inches(6.1), Inches(0.5), size=10.5, color=LGRAY)

add_txt(sl, "MEDIQZY SOLVES ALL OF THIS →",
        Inches(0.35), Inches(7.0), Inches(12.6), Inches(0.38),
        size=13, bold=True, color=CYAN, align=PP_ALIGN.CENTER)

# ═════════════════════════════════════════════════════════════════════════════
# SLIDE 4 — PLATFORM ARCHITECTURE OVERVIEW
# ═════════════════════════════════════════════════════════════════════════════
sl = prs.slides.add_slide(BLANK)
add_gradient_bg(sl)
add_rect(sl, 0, 0, Inches(0.12), H, CYAN)

add_txt(sl, "PLATFORM ARCHITECTURE", Inches(0.45), Inches(0.3), Inches(12), Inches(0.45),
        size=11, bold=True, color=CYAN)
add_txt(sl, "One Unified Platform — 22 Clinical & Operational Domains",
        Inches(0.45), Inches(0.72), Inches(12.4), Inches(0.8),
        size=34, bold=True, color=WHITE)
divider_line(sl, Inches(1.6))

domains = [
    ("🚪", "Patient Access"),   ("🏥", "OPD"),            ("🛏", "IPD"),
    ("🚨", "Emergency"),        ("🔬", "Lab & Pathology"), ("📡", "Radiology / RIS"),
    ("💊", "Pharmacy"),         ("🔪", "Operation Theatre"),("🩺", "ICU & Critical"),
    ("🧬", "Specialty Clinics"), ("🩸", "Blood Bank"),     ("🧹", "CSSD"),
    ("🥗", "Diet & Nutrition"),  ("🏋", "Physiotherapy"),  ("👩‍⚕️", "Nursing & Docs"),
    ("🤖", "AI / CDS Engine"),  ("😊", "Patient Exp."),   ("💰", "Revenue Cycle"),
    ("📋", "Insurance / TPA"),  ("📦", "Stores & Materials"),("👥", "HR & Payroll"),
    ("📊", "Finance & Analytics"),
]

cols = 7
for i, (icon, name) in enumerate(domains):
    col = i % cols
    row = i // cols
    l = Inches(0.3) + col * Inches(1.83)
    t = Inches(1.75) + row * Inches(1.5)
    add_rect(sl, l, t, Inches(1.72), Inches(1.3), RGBColor(0x0F, 0x14, 0x4A))
    add_rect(sl, l, t, Inches(1.72), Inches(0.06), CYAN)
    add_txt(sl, icon, l + Inches(0.06), t + Inches(0.1),
            Inches(1.6), Inches(0.45), size=22, align=PP_ALIGN.CENTER)
    add_txt(sl, name, l + Inches(0.06), t + Inches(0.62),
            Inches(1.6), Inches(0.55), size=9, bold=True, color=WHITE, align=PP_ALIGN.CENTER)

# AI backbone strip
add_rect(sl, Inches(0.3), Inches(6.55), Inches(12.73), Inches(0.6), RGBColor(0x2D, 0x1B, 0x69))
add_txt(sl, "🤖  AI Backbone — NLP Engine · Predictive Analytics · Voice AI · Auto-Coding · Clinical DSS · IoT Integration · FHIR API Layer",
        Inches(0.5), Inches(6.6), Inches(12.3), Inches(0.5),
        size=11, bold=True, color=VIOLET, align=PP_ALIGN.CENTER)

# ═════════════════════════════════════════════════════════════════════════════
# SLIDE 5 — MODULE UNIVERSE (178 MODULES VISUAL)
# ═════════════════════════════════════════════════════════════════════════════
sl = prs.slides.add_slide(BLANK)
add_gradient_bg(sl)
add_rect(sl, 0, 0, Inches(0.12), H, GOLD)

add_txt(sl, "MODULE UNIVERSE", Inches(0.45), Inches(0.28), Inches(12), Inches(0.42),
        size=11, bold=True, color=GOLD)
add_txt(sl, "178 Modules · 22 Domains · Every Hospital Workflow Covered",
        Inches(0.45), Inches(0.68), Inches(12.4), Inches(0.7),
        size=32, bold=True, color=WHITE)
divider_line(sl, Inches(1.45), color=GOLD)

domain_module_counts = [
    ("Patient Access", 7, CYAN),   ("OPD", 8, BLUE),       ("IPD", 10, VIOLET),
    ("Emergency", 7, RGBColor(0xEF,0x44,0x44)), ("OT", 7, GOLD),     ("Lab", 9, GREEN),
    ("Radiology", 7, TEAL),        ("Pharmacy", 8, RGBColor(0xF9,0x73,0x16)), ("ICU", 6, VIOLET),
    ("Specialty", 13, CYAN),       ("Blood Bank", 6, RGBColor(0xEF,0x44,0x44)), ("CSSD", 7, TEAL),
    ("Diet/Physio", 10, GREEN),    ("Nursing", 8, BLUE),    ("AI/CDS", 12, VIOLET),
    ("Patient Exp", 8, GOLD),      ("RCM", 10, GREEN),      ("Insurance", 8, CYAN),
    ("Stores", 7, BLUE),           ("HR", 8, TEAL),          ("Finance", 8, GOLD),
    ("Quality/Analytics", 10, RGBColor(0xEF,0x44,0x44)),
]

cols = 6
for i, (name, count, color) in enumerate(domain_module_counts):
    col = i % cols
    row = i // cols
    l = Inches(0.3) + col * Inches(2.15)
    t = Inches(1.58) + row * Inches(1.55)
    add_rect(sl, l, t, Inches(2.02), Inches(1.38), RGBColor(0x0D, 0x12, 0x45))
    add_rect(sl, l, t, Inches(2.02), Inches(0.06), color)
    add_txt(sl, str(count), l + Inches(0.1), t + Inches(0.1),
            Inches(1.82), Inches(0.55), size=28, bold=True, color=color, align=PP_ALIGN.CENTER)
    add_txt(sl, "MODULES", l + Inches(0.1), t + Inches(0.62),
            Inches(1.82), Inches(0.25), size=8, color=LGRAY, align=PP_ALIGN.CENTER)
    add_txt(sl, name, l + Inches(0.1), t + Inches(0.9),
            Inches(1.82), Inches(0.38), size=10, bold=True, color=WHITE, align=PP_ALIGN.CENTER)

add_txt(sl, "Total: 178 Clinical & Operational Modules  ·  40+ AI Agents  ·  Zero Paper  ·  One Platform",
        Inches(0.3), Inches(7.05), Inches(12.73), Inches(0.35),
        size=11, bold=True, color=CYAN, align=PP_ALIGN.CENTER)

# ═════════════════════════════════════════════════════════════════════════════
# SLIDE 6 — DIGITAL PATIENT JOURNEY
# ═════════════════════════════════════════════════════════════════════════════
sl = prs.slides.add_slide(BLANK)
add_gradient_bg(sl)
add_rect(sl, 0, 0, Inches(0.12), H, GREEN)

add_txt(sl, "PATIENT JOURNEY", Inches(0.45), Inches(0.28), Inches(12), Inches(0.42),
        size=11, bold=True, color=GREEN)
add_txt(sl, "100% Digital — From First Click to Discharge Summary",
        Inches(0.45), Inches(0.68), Inches(12.4), Inches(0.7),
        size=34, bold=True, color=WHITE)
divider_line(sl, Inches(1.45), color=GREEN)

journey_steps = [
    ("📱\nApp Booking\n& e-Registration", GREEN),
    ("🏥\nSmart OPD\nQueue + Vitals", CYAN),
    ("👨‍⚕️\nDoctor\nConsultation", BLUE),
    ("🔬\nDigital Lab\n& Radiology", TEAL),
    ("💊\nE-Prescription\n& Pharmacy", VIOLET),
    ("🛏\nIPD Admission\n& Smart Bed", GOLD),
    ("📋\nNursing Notes\n& Orders", CYAN),
    ("💳\nAI Billing\n& Insurance", GREEN),
    ("📄\nDigital\nDischarge", BLUE),
    ("📲\nFollow-up\nApp + PHR", VIOLET),
]

y_arrow = Inches(3.1)
step_w  = Inches(1.18)
gap     = Inches(0.1)
start_l = Inches(0.28)

for i, (label, color) in enumerate(journey_steps):
    l = start_l + i * (step_w + gap)
    # box
    add_rect(sl, l, Inches(1.6), step_w, Inches(2.6), RGBColor(0x0F, 0x14, 0x4A))
    add_rect(sl, l, Inches(1.6), step_w, Inches(0.07), color)
    add_txt(sl, label, l + Inches(0.04), Inches(1.72), step_w - Inches(0.08), Inches(2.35),
            size=11, bold=True, color=WHITE, align=PP_ALIGN.CENTER)
    # step number
    pill(sl, l + step_w/2 - Inches(0.2), Inches(1.35), Inches(0.4), Inches(0.3),
         color, str(i+1), tsize=10)
    # arrow (except last)
    if i < len(journey_steps) - 1:
        ax = l + step_w + Inches(0.01)
        add_txt(sl, "→", ax, Inches(2.7), Inches(0.12), Inches(0.3),
                size=14, bold=True, color=LGRAY, align=PP_ALIGN.CENTER)

# Paperless highlights
highlights = [
    "No physical files", "Digital consent", "E-prescriptions", "Digital lab reports",
    "Online billing", "Digital discharge", "AI follow-up", "Secure PHR access",
]
for i, h in enumerate(highlights):
    l = Inches(0.5) + i * Inches(1.6)
    pill(sl, l, Inches(4.45), Inches(1.48), Inches(0.38), GREEN, "✓ " + h, tsize=9)

add_txt(sl, "Every step is digital. Every form is electronic. Every report is on the app. Zero paper. Always.",
        Inches(0.45), Inches(5.0), Inches(12.4), Inches(0.45),
        size=13, color=LGRAY, align=PP_ALIGN.CENTER, italic=True)

# ═════════════════════════════════════════════════════════════════════════════
# SLIDE 7 — PATIENT ACCESS & REGISTRATION (7 modules)
# ═════════════════════════════════════════════════════════════════════════════
sl = prs.slides.add_slide(BLANK)
add_gradient_bg(sl)
add_rect(sl, 0, 0, Inches(0.12), H, CYAN)

add_txt(sl, "01 · PATIENT ACCESS & REGISTRATION", Inches(0.45), Inches(0.28), Inches(12), Inches(0.42),
        size=11, bold=True, color=CYAN)
add_txt(sl, "7 Modules — The Digital Front Door",
        Inches(0.45), Inches(0.68), Inches(12.4), Inches(0.7),
        size=34, bold=True, color=WHITE)
divider_line(sl, Inches(1.45))

cards = [
    ("📱", "Online Appointment Booking",   ["Web / App / WhatsApp / Call booking","Slot management by doctor & dept","Instant confirmation & reminders","AI-driven slot optimization"], CYAN),
    ("🪪", "Patient Registration (MRD)",   ["Aadhaar / ABHA-linked registration","Auto de-duplication across visits","UHID generation & QR card","Paperless e-consent capture"], BLUE),
    ("📋", "OPD Token & Queue Mgmt",       ["Auto token on check-in","Smart queue display boards","Real-time wait-time prediction","Nurse triage integration"], TEAL),
    ("🏃", "Walk-in & Emergency Triage",   ["Rapid walk-in registration","Auto-link to ER triage queue","Biometric/face identification","Pre-hospital ambulance data link"], GOLD),
    ("📲", "Patient Portal & App",         ["Digital PHR on patient app","Upcoming appointments & history","Lab reports & prescriptions","Video consultation link"], GREEN),
    ("🔄", "Referral Management",          ["Internal & external referral tracking","Referral letter generation","Referring doctor portal","Referral analytics & commissions"], VIOLET),
    ("🤖", "AI Pre-Registration Assistant",["WhatsApp chatbot registration","Voice-based registration (IVR)","Auto-fill from Aadhaar API","Pre-visit symptom capture"], RGBColor(0xF9,0x73,0x16)),
]

module_grid(sl, cards, cols=3, card_w=Inches(4.1), card_h=Inches(2.05), gap_y=Inches(0.18))

# ═════════════════════════════════════════════════════════════════════════════
# SLIDE 8 — OPD (8 modules)
# ═════════════════════════════════════════════════════════════════════════════
sl = prs.slides.add_slide(BLANK)
add_gradient_bg(sl)
add_rect(sl, 0, 0, Inches(0.12), H, BLUE)

add_txt(sl, "02 · OUTPATIENT DEPARTMENT (OPD)", Inches(0.45), Inches(0.28), Inches(12), Inches(0.42),
        size=11, bold=True, color=CYAN)
add_txt(sl, "8 Modules — AI-Powered Consultation & Clinical Workflow",
        Inches(0.45), Inches(0.68), Inches(12.4), Inches(0.7),
        size=32, bold=True, color=WHITE)
divider_line(sl, Inches(1.45))

cards = [
    ("👨‍⚕️", "Doctor Workstation",         ["SOAP / structured EMR template","Voice dictation → auto-structured notes","AI diagnosis suggestions (ICD-10)","Previous visit history in one view"], BLUE),
    ("📝", "e-Prescription",              ["Digital Rx with dosage/frequency","Drug-drug & allergy alert engine","Auto-link to pharmacy dispensing","Prescription analytics for doctors"], CYAN),
    ("📊", "Vitals & Nursing Station",    ["Tablet-based vital capture","Auto-flag abnormal values","Growth charts for pediatrics","Pre-consultation triage workflow"], GREEN),
    ("🔬", "OPD Investigation Orders",    ["One-click lab & radiology orders","Auto-send to lab/RIS/PACS","Track order status from OPD","Integrated result view in EMR"], TEAL),
    ("📅", "Follow-up & Recall Scheduler",["Auto-schedule follow-ups","SMS/WhatsApp reminders","Missed appointment re-scheduling","No-show prediction AI"], GOLD),
    ("💳", "OPD Billing & Collections",   ["Auto-charge on consultation","Cashless / TPA / OP insurance","Dynamic tariff management","MLC & medico-legal billing"], VIOLET),
    ("📸", "Clinical Photography",        ["Secure wound / lesion photos","Linked to patient record","Before/after treatment view","Telemedicine image sharing"], TEAL),
    ("🤖", "AI Clinical DSS (OPD)",       ["Differential diagnosis list","Red-flag alert for critical values","Evidence-based treatment hints","Auto ICD-10 code suggestion"], VIOLET),
]

module_grid(sl, cards, cols=3, card_w=Inches(4.1), card_h=Inches(1.9), gap_y=Inches(0.15),
            start_t=Inches(1.58))

# ═════════════════════════════════════════════════════════════════════════════
# SLIDE 9 — IPD (10 modules)
# ═════════════════════════════════════════════════════════════════════════════
sl = prs.slides.add_slide(BLANK)
add_gradient_bg(sl)
add_rect(sl, 0, 0, Inches(0.12), H, VIOLET)

add_txt(sl, "03 · INPATIENT DEPARTMENT (IPD)", Inches(0.45), Inches(0.28), Inches(12), Inches(0.42),
        size=11, bold=True, color=CYAN)
add_txt(sl, "10 Modules — Smart Bed to Digital Discharge",
        Inches(0.45), Inches(0.68), Inches(12.4), Inches(0.7),
        size=34, bold=True, color=WHITE)
divider_line(sl, Inches(1.45))

cards = [
    ("🛏", "Admission & Bed Management",  ["AI-driven bed allocation","Bed occupancy dashboard","Expected discharge prediction","Cross-ward transfer management"], VIOLET),
    ("📋", "Doctor Round Notes (EMR)",    ["Structured daily progress notes","Voice-to-text round documentation","Consultant note review workflow","Co-sign & attestation digital"], BLUE),
    ("💉", "Medication Administration",   ["Nurse e-MAR (medication record)","Barcode / RFID medication verify","Auto-alert: missed / wrong dose","Integration with pharmacy stock"], CYAN),
    ("📊", "Nursing Care Plans",          ["Standardized care plan templates","Shift-wise task checklists","Patient risk score (fall, pressure ulcer)","Nursing handover digital"], GREEN),
    ("🔬", "IPD Investigations & Orders", ["CPOE — computerized physician orders","Stat / routine / timed orders","Result notification to bedside","Critical value auto-alert"], TEAL),
    ("📄", "Discharge Summary (AI)",      ["AI-drafted discharge summary","Auto-pull diagnosis, procedures","ICD-10/CPT auto-coding","Digital sign & patient delivery"], GOLD),
    ("💰", "IPD Billing & Deposits",      ["Running bill view for patient","Package / itemized billing","Advance & deposit management","Insurance pre-auth from bedside"], VIOLET),
    ("📡", "IoT Vitals Monitoring",       ["Bedside monitor integration","Continuous SpO2, HR, BP feed","Auto charting — no manual entry","AI deterioration early warning"], CYAN),
    ("🚑", "Transfer & Referral",         ["Inter-department transfer orders","External hospital referral letters","Ambulance dispatch integration","NABH transfer documentation"], GREEN),
    ("🗂", "Medical Records (MRD-IPD)",   ["Auto-indexing of all IPD documents","Digital consent & MLC records","NABH audit trail for each file","Paperless chart — no physical file"], TEAL),
]

module_grid(sl, cards, cols=4, start_l=Inches(0.28), card_w=Inches(3.12), card_h=Inches(1.85),
            gap_x=Inches(0.15), gap_y=Inches(0.18), start_t=Inches(1.58))

# ═════════════════════════════════════════════════════════════════════════════
# SLIDE 10 — EMERGENCY & TRIAGE (7 modules)
# ═════════════════════════════════════════════════════════════════════════════
sl = prs.slides.add_slide(BLANK)
add_gradient_bg(sl)
add_rect(sl, 0, 0, Inches(0.12), H, RGBColor(0xEF, 0x44, 0x44))

add_txt(sl, "04 · EMERGENCY & TRIAGE", Inches(0.45), Inches(0.28), Inches(12), Inches(0.42),
        size=11, bold=True, color=RGBColor(0xEF, 0x44, 0x44))
add_txt(sl, "7 Modules — Life-Critical, Always-On, AI-Triaged",
        Inches(0.45), Inches(0.68), Inches(12.4), Inches(0.7),
        size=34, bold=True, color=WHITE)
divider_line(sl, Inches(1.45), color=RGBColor(0xEF, 0x44, 0x44))

ER = RGBColor(0xEF, 0x44, 0x44)
cards = [
    ("🚨", "AI Triage (Manchester Scale)",["AI-assisted MTS triage scoring","Red/orange/yellow/green auto-assign","Triage timer & SLA compliance","Direct link to CPOE on arrival"], ER),
    ("⚡", "Rapid Assessment & Resus",    ["Resuscitation bay digital workflow","Trauma team auto-notification","Real-time vital monitoring","Code Blue / code alerts"], ER),
    ("🚑", "Pre-Hospital & Ambulance",    ["EMS pre-arrival data receive","GPS ambulance tracking","Hospital divert management","ATLS trauma documentation"], GOLD),
    ("🛏", "ER Bed & Flow Management",    ["ER bed occupancy dashboard","Admission / discharge / transfer","Boarding alert management","Expected ER volume prediction"], BLUE),
    ("⚖️", "MLC & Legal Documentation",  ["Auto MLC case registration","Police intimation digital log","Forensic photography integration","Legal document management"], VIOLET),
    ("💊", "ER Pharmacy & Dispensing",    ["Stat medication dispensing","Crash-cart digital inventory","Auto-deduction on ER order","24x7 ER pharmacy dashboard"], CYAN),
    ("📊", "ER Analytics & KPIs",         ["Door-to-doctor time","Triage-to-bed time SLA","LWBS (left without being seen)","Mortality & severity analytics"], GREEN),
]

module_grid(sl, cards, cols=3, card_w=Inches(4.1), card_h=Inches(2.0), gap_y=Inches(0.18),
            start_t=Inches(1.58))

# ═════════════════════════════════════════════════════════════════════════════
# SLIDE 11 — OPERATION THEATRE (7 modules)
# ═════════════════════════════════════════════════════════════════════════════
sl = prs.slides.add_slide(BLANK)
add_gradient_bg(sl)
add_rect(sl, 0, 0, Inches(0.12), H, GOLD)

add_txt(sl, "05 · OPERATION THEATRE (OT)", Inches(0.45), Inches(0.28), Inches(12), Inches(0.42),
        size=11, bold=True, color=GOLD)
add_txt(sl, "7 Modules — Precision, Safety & Zero Paperwork in the OT",
        Inches(0.45), Inches(0.68), Inches(12.4), Inches(0.7),
        size=34, bold=True, color=WHITE)
divider_line(sl, Inches(1.45), color=GOLD)

cards = [
    ("🗓", "OT Scheduling & Planning",    ["AI-optimized OT slot scheduling","Surgeon preference card management","Equipment & implant booking","Patient prep checklist digital"], GOLD),
    ("✅", "Surgical Safety Checklist",   ["WHO SSC: sign-in / time-out / sign-out","Digital sign-off by surgeon+anaes","Auto-flag checklist non-compliance","Zero paper — tablet at table"], RGBColor(0xEF,0x44,0x44)),
    ("💉", "Anaesthesia Management",      ["Pre-anaesthesia assessment forms","Intra-op anaesthesia charting","Drug & reversal dosing calculator","Post-op PACU monitoring link"], VIOLET),
    ("🔪", "OT Nursing & Instrument Count",["Instrument/sponge digital count","Implant traceability (lot/serial)","Nurse circulation & scrub record","Auto-sterilization request to CSSD"], CYAN),
    ("📝", "Operative Notes",             ["Voice + template operative notes","Auto-link to diagnosis & procedure","ICD-10 / CPT surgery coding","Digital attestation by surgeon"], BLUE),
    ("📦", "OT Inventory & Implants",     ["Consignment implant management","Tray / kit digital tracking","Expiry & lot number alerts","Integration with stores system"], TEAL),
    ("📊", "OT Analytics & Utilization",  ["OT utilization % by theatre/surgeon","Case cancellation analysis","Turn-around time tracking","Revenue per OT minute"], GREEN),
]

module_grid(sl, cards, cols=3, card_w=Inches(4.1), card_h=Inches(2.0), gap_y=Inches(0.18),
            start_t=Inches(1.58))

# ═════════════════════════════════════════════════════════════════════════════
# SLIDE 12 — LAB & PATHOLOGY (9 modules)
# ═════════════════════════════════════════════════════════════════════════════
sl = prs.slides.add_slide(BLANK)
add_gradient_bg(sl)
add_rect(sl, 0, 0, Inches(0.12), H, GREEN)

add_txt(sl, "06 · LABORATORY & PATHOLOGY (LIS)", Inches(0.45), Inches(0.28), Inches(12), Inches(0.42),
        size=11, bold=True, color=GREEN)
add_txt(sl, "9 Modules — From Sample to Digital Report in Minutes",
        Inches(0.45), Inches(0.68), Inches(12.4), Inches(0.7),
        size=34, bold=True, color=WHITE)
divider_line(sl, Inches(1.45), color=GREEN)

cards = [
    ("🧪", "Sample Collection & Barcoding",["HL7 order receive from EMR/OPD","Barcode label auto-print on order","Phlebotomy route optimization","Tube type & volume validation"], GREEN),
    ("🔬", "Analyzer Auto-Interface",      ["Bi-directional analyzer connect","Auto-result download — no manual","Multi-analyzer management","Delta check & QC flagging"], TEAL),
    ("📊", "Result Entry & Validation",    ["Two-level validation workflow","Critical value auto-alert (SMS/app)","Reference range auto-flag","Pathologist digital review"], CYAN),
    ("📄", "Digital Report Delivery",      ["Instant report on patient app","WhatsApp / email delivery","Doctor notification on EMR","NABL-format PDF reports"], BLUE),
    ("🦠", "Microbiology & Culture",       ["Culture sensitivity reporting","Antibiogram generation","Infection control alerts (AMR)","NABL accreditation compliance"], VIOLET),
    ("🧬", "Histopathology & Cytology",    ["Digital slide viewer (WSI)","Pathologist comment & diagnosis","Telepathology consultation","Biopsy tracking & TAT"], GOLD),
    ("🩸", "Point-of-Care Testing (POCT)", ["ICU/ER POCT result integration","ABG, glucometer, troponin links","POC QC & calibration log","POCT result in patient record"], RGBColor(0xEF,0x44,0x44)),
    ("📈", "Lab QC & NABL Compliance",    ["Levey-Jennings QC charts","Proficiency testing tracking","NABL/ISO 15189 audit trail","External QC program management"], GREEN),
    ("🤖", "AI Lab Analytics",             ["Abnormal pattern detection","Reflex testing rule engine","Lab cost per patient analytics","TAT breach prediction"], VIOLET),
]

module_grid(sl, cards, cols=3, card_w=Inches(4.1), card_h=Inches(1.85), gap_y=Inches(0.15),
            start_t=Inches(1.58))

# ═════════════════════════════════════════════════════════════════════════════
# SLIDE 13 — RADIOLOGY / RIS-PACS (7 modules)
# ═════════════════════════════════════════════════════════════════════════════
sl = prs.slides.add_slide(BLANK)
add_gradient_bg(sl)
add_rect(sl, 0, 0, Inches(0.12), H, TEAL)

add_txt(sl, "07 · RADIOLOGY, IMAGING & PACS (RIS)", Inches(0.45), Inches(0.28), Inches(12), Inches(0.42),
        size=11, bold=True, color=TEAL)
add_txt(sl, "7 Modules — Filmless, AI-Assisted, DICOM-Native",
        Inches(0.45), Inches(0.68), Inches(12.4), Inches(0.7),
        size=34, bold=True, color=WHITE)
divider_line(sl, Inches(1.45), color=TEAL)

cards = [
    ("📡", "RIS — Radiology Information Sys",["HL7 order receipt & worklist","Modality scheduling & slot management","Radiographer task assignment","Stat / routine prioritization"], TEAL),
    ("🖼", "PACS — Image Archive",           ["DICOM server — all modalities","Web-based zero-footprint viewer","Prior study comparison view","Unlimited storage in cloud PACS"], BLUE),
    ("🤖", "AI Radiology Assistant",         ["AI chest X-ray anomaly detection","CT pulmonary embolism flagging","Fracture detection assist","AI triage — urgent vs routine"], VIOLET),
    ("📝", "Radiology Reporting (Voice)",    ["Voice dictation → structured report","Template library by modality","Radiologist digital sign-off","Critical finding auto-notify"], GOLD),
    ("📲", "Film-less Report Delivery",      ["Instant digital report to EMR","Patient app image + report access","Referring doctor portal access","No physical film — ever"], GREEN),
    ("🔗", "Modality Integration",           ["X-ray, CT, MRI, USG, Echo, Mammo","Cath-lab & angiography DICOM","Nuclear medicine SPECT/PET","Portable X-ray Wi-Fi integration"], CYAN),
    ("📊", "Radiology Analytics & TAT",      ["Modality utilization & revenue","Report TAT by radiologist","Critical value compliance rate","AI reading accuracy tracking"], TEAL),
]

module_grid(sl, cards, cols=3, card_w=Inches(4.1), card_h=Inches(2.0), gap_y=Inches(0.18),
            start_t=Inches(1.58))

# ═════════════════════════════════════════════════════════════════════════════
# SLIDE 14 — PHARMACY (8 modules)
# ═════════════════════════════════════════════════════════════════════════════
sl = prs.slides.add_slide(BLANK)
add_gradient_bg(sl)
add_rect(sl, 0, 0, Inches(0.12), H, RGBColor(0xF9, 0x73, 0x16))

add_txt(sl, "08 · PHARMACY MANAGEMENT", Inches(0.45), Inches(0.28), Inches(12), Inches(0.42),
        size=11, bold=True, color=RGBColor(0xF9,0x73,0x16))
add_txt(sl, "8 Modules — Closed-Loop Medication Safety, Zero Manual",
        Inches(0.45), Inches(0.68), Inches(12.4), Inches(0.7),
        size=34, bold=True, color=WHITE)
divider_line(sl, Inches(1.45), color=RGBColor(0xF9,0x73,0x16))

ORANGE = RGBColor(0xF9, 0x73, 0x16)
cards = [
    ("💊", "e-Prescription Processing",   ["Auto-receive Rx from EMR/OPD","Drug-drug & allergy check","Generic substitution suggestion","Auto-stock check on Rx receipt"], ORANGE),
    ("📦", "Pharmacy Inventory & PO",     ["Reorder-level auto-alerts","Supplier purchase order management","GRN & vendor invoice match","FEFO / FIFO dispensing control"], CYAN),
    ("🏷", "Barcode & Unit-Dose Dispensing",["Barcode label on each dispense","Unit-dose packing for IPD","Nurse scan-to-administer verify","Dispensing TAT analytics"], BLUE),
    ("🚨", "Drug Safety & Alerts",         ["CDSS drug interaction alerts","Allergy cross-check real-time","High-alert medication workflow","Narcotic & controlled drug log"], RGBColor(0xEF,0x44,0x44)),
    ("💰", "Pharmacy Billing",             ["Auto-charge on dispense","Insurance / TPA drug coverage","Return & credit management","Govt scheme / Ayushman billing"], GREEN),
    ("🧊", "Cold Chain & Narcotics",       ["Temperature log for cold-chain drugs","Narcotic issue & balance register","Schedule H1/X digital log","Pharmacovigilance reporting"], VIOLET),
    ("📊", "Pharmacy Analytics & ABC",     ["ABC/VED/HML drug analysis","Consumption vs. procurement","Dead stock & expiry report","Formulary compliance tracking"], TEAL),
    ("🤖", "AI Demand Forecasting",        ["ML-based drug demand prediction","Seasonal / epidemic stock alerts","Auto-PO suggestion engine","Wastage minimization AI"], ORANGE),
]

module_grid(sl, cards, cols=3, card_w=Inches(4.1), card_h=Inches(1.9), gap_y=Inches(0.15),
            start_t=Inches(1.58))

# ═════════════════════════════════════════════════════════════════════════════
# SLIDE 15 — ICU & CRITICAL CARE (6 modules)
# ═════════════════════════════════════════════════════════════════════════════
sl = prs.slides.add_slide(BLANK)
add_gradient_bg(sl)
add_rect(sl, 0, 0, Inches(0.12), H, VIOLET)

add_txt(sl, "09 · ICU & CRITICAL CARE", Inches(0.45), Inches(0.28), Inches(12), Inches(0.42),
        size=11, bold=True, color=VIOLET)
add_txt(sl, "6 Modules — AI Early Warning, Zero Charting Burden",
        Inches(0.45), Inches(0.68), Inches(12.4), Inches(0.7),
        size=34, bold=True, color=WHITE)
divider_line(sl, Inches(1.45), color=VIOLET)

cards = [
    ("📡", "ICU Bedside Monitor Integration",["Continuous vitals to EMR","SpO2, ABP, EtCO2, temperature","Ventilator parameter integration","No manual vital charting — ever"], VIOLET),
    ("🤖", "AI Early Warning Score (EWS)",  ["Auto-calculate MEWS/NEWS/qSOFA","Sepsis, deterioration AI alert","Nurse + doctor push notification","Escalation protocol trigger"], RGBColor(0xEF,0x44,0x44)),
    ("💉", "ICU Medication & Infusion Mgmt",["Drip rate calculator with weight","High-alert infusion protocol","Auto-MAR charting from pump","Pharmacist ICU review dashboard"], CYAN),
    ("📋", "ICU Daily Goal Sheet",          ["Digital daily goals per patient","Sedation, ventilation, nutrition goals","Multi-disciplinary team view","Goal completion tracking"], BLUE),
    ("📊", "Fluid Balance & Nutrition",     ["Hourly I/O digital charting","Cumulative fluid balance graph","Enteral / parenteral nutrition order","Dietitian ICU alert integration"], GREEN),
    ("📈", "ICU Analytics & Outcome",       ["APACHE II / SOFA scoring","ICU mortality prediction (AI)","Ventilator days & ICU LOS","Readmission risk scoring"], TEAL),
]

module_grid(sl, cards, cols=3, card_w=Inches(4.1), card_h=Inches(2.0), gap_y=Inches(0.2),
            start_t=Inches(1.58))

# ═════════════════════════════════════════════════════════════════════════════
# SLIDE 16 — SPECIALTY CLINICS (13 modules)
# ═════════════════════════════════════════════════════════════════════════════
sl = prs.slides.add_slide(BLANK)
add_gradient_bg(sl)
add_rect(sl, 0, 0, Inches(0.12), H, CYAN)

add_txt(sl, "10 · SPECIALTY CLINIC MODULES", Inches(0.45), Inches(0.28), Inches(12), Inches(0.42),
        size=11, bold=True, color=CYAN)
add_txt(sl, "13 Specialty-Specific Modules — Every Department's Workflow",
        Inches(0.45), Inches(0.68), Inches(12.4), Inches(0.7),
        size=34, bold=True, color=WHITE)
divider_line(sl, Inches(1.45))

specialties = [
    ("❤️", "Cardiology",       "Cath-lab, ECG link, echo report, heart failure protocol"),
    ("🧠", "Neurology",        "Stroke pathway, EEG/EMG link, epilepsy protocol, neuro-rehab"),
    ("🦷", "Dental",           "Tooth chart, dental imaging, treatment plan, lab work order"),
    ("👁", "Ophthalmology",    "Slit-lamp diagram, refraction records, OCT/fundus link"),
    ("🦴", "Orthopaedics",     "Implant tracking, fracture classification, physio referral"),
    ("🤰", "Obstetrics",       "ANC record, partogram, LSCS / NVD workflow, neonatal link"),
    ("👶", "Paediatrics",      "Growth chart, vaccination scheduler, developmental milestones"),
    ("🧬", "Oncology",         "Chemo protocol, cycle tracker, tumour board, response assessment"),
    ("🫁", "Pulmonology",      "PFT integration, bronchoscopy report, respiratory therapy"),
    ("🩺", "Dermatology",      "Clinical photography, skin lesion map, phototherapy tracking"),
    ("🧘", "Psychiatry",       "Mental status exam, medication audit, session notes, consent"),
    ("🦷", "ENT",              "Audiogram link, endoscopy report, hearing aid tracking"),
    ("🏥", "Dialysis Unit",    "Dialysis session log, machine link, dry weight tracking, KT/V"),
]

cols = 4
for i, (icon, name, desc) in enumerate(specialties):
    col = i % cols
    row = i // cols
    l = Inches(0.3) + col * Inches(3.23)
    t = Inches(1.58) + row * Inches(1.65)
    add_rect(sl, l, t, Inches(3.1), Inches(1.52), RGBColor(0x0F, 0x14, 0x4A))
    add_rect(sl, l, t, Inches(3.1), Inches(0.06), CYAN)
    add_txt(sl, icon + "  " + name, l + Inches(0.12), t + Inches(0.1),
            Inches(2.86), Inches(0.38), size=13, bold=True, color=WHITE)
    add_txt(sl, desc, l + Inches(0.12), t + Inches(0.53),
            Inches(2.86), Inches(0.88), size=9.5, color=LGRAY)

# ═════════════════════════════════════════════════════════════════════════════
# SLIDE 17 — BLOOD BANK + CSSD (13 modules)
# ═════════════════════════════════════════════════════════════════════════════
sl = prs.slides.add_slide(BLANK)
add_gradient_bg(sl)
add_rect(sl, 0, 0, Inches(0.12), H, RGBColor(0xEF, 0x44, 0x44))

add_txt(sl, "11–12 · BLOOD BANK + CSSD", Inches(0.45), Inches(0.28), Inches(12), Inches(0.42),
        size=11, bold=True, color=RGBColor(0xEF,0x44,0x44))
add_txt(sl, "13 Modules — Traceability, Safety, Zero Paper",
        Inches(0.45), Inches(0.68), Inches(12.4), Inches(0.7),
        size=34, bold=True, color=WHITE)
divider_line(sl, Inches(1.45), color=RGBColor(0xEF,0x44,0x44))

# Blood bank column
add_txt(sl, "🩸  BLOOD BANK (6 MODULES)", Inches(0.45), Inches(1.58), Inches(6), Inches(0.5),
        size=14, bold=True, color=RGBColor(0xEF,0x44,0x44))
bb_mods = [
    ("Donor Management",    "Blood drive scheduling, donor history, deferral tracking"),
    ("Component Processing","RBC, FFP, platelet separation, labelling, cross-match"),
    ("Compatibility Testing","ABO/Rh, Coombs, electronic cross-match, group & screen"),
    ("Inventory & Expiry",  "Component stock, expiry alerts, issuance FEFO"),
    ("Issue & Transfusion", "Bedside verification, transfusion reaction tracking"),
    ("Blood Bank Analytics","Component utilization, discard rate, TAT, donor retention"),
]

for i, (title, desc) in enumerate(bb_mods):
    t_y = Inches(2.1) + i * Inches(0.8)
    add_rect(sl, Inches(0.45), t_y, Inches(5.9), Inches(0.72), RGBColor(0x18, 0x05, 0x05))
    add_rect(sl, Inches(0.45), t_y, Inches(0.06), Inches(0.72), RGBColor(0xEF,0x44,0x44))
    add_txt(sl, title, Inches(0.6), t_y + Inches(0.06), Inches(5.7), Inches(0.3),
            size=12, bold=True, color=WHITE)
    add_txt(sl, desc, Inches(0.6), t_y + Inches(0.38), Inches(5.7), Inches(0.28),
            size=9.5, color=LGRAY)

# CSSD column
add_txt(sl, "🧹  CSSD (7 MODULES)", Inches(6.8), Inches(1.58), Inches(6), Inches(0.5),
        size=14, bold=True, color=TEAL)
cssd_mods = [
    ("Instrument Collection","Set-wise collection, damage recording, barcode tracking"),
    ("Decontamination Log",  "Washer-disinfector cycle log, chemical concentration"),
    ("Packaging & Wrapping", "Set assembly, indicator strip verification, pack label"),
    ("Sterilization Cycles", "Autoclave cycle log, Bowie-Dick test, spore test link"),
    ("Distribution & Issue", "Barcode scan-on-issue to OT/ward, traceability"),
    ("Implant Traceability", "Lot no. link to patient, recall management"),
    ("CSSD Analytics",       "Cycle utilisation, rejection rate, turnaround, NABH KPIs"),
]

for i, (title, desc) in enumerate(cssd_mods):
    t_y = Inches(2.1) + i * Inches(0.72)
    add_rect(sl, Inches(6.8), t_y, Inches(6.15), Inches(0.65), RGBColor(0x05, 0x14, 0x18))
    add_rect(sl, Inches(6.8), t_y, Inches(0.06), Inches(0.65), TEAL)
    add_txt(sl, title, Inches(6.95), t_y + Inches(0.05), Inches(5.9), Inches(0.28),
            size=12, bold=True, color=WHITE)
    add_txt(sl, desc, Inches(6.95), t_y + Inches(0.34), Inches(5.9), Inches(0.26),
            size=9.5, color=LGRAY)

# ═════════════════════════════════════════════════════════════════════════════
# SLIDE 18 — DIET, PHYSIOTHERAPY & ALLIED HEALTH (10 modules)
# ═════════════════════════════════════════════════════════════════════════════
sl = prs.slides.add_slide(BLANK)
add_gradient_bg(sl)
add_rect(sl, 0, 0, Inches(0.12), H, GREEN)

add_txt(sl, "13–14 · DIET, PHYSIOTHERAPY & ALLIED HEALTH", Inches(0.45), Inches(0.28), Inches(12), Inches(0.42),
        size=11, bold=True, color=GREEN)
add_txt(sl, "10 Modules — Integrated Allied Care, Paperless",
        Inches(0.45), Inches(0.68), Inches(12.4), Inches(0.7),
        size=34, bold=True, color=WHITE)
divider_line(sl, Inches(1.45), color=GREEN)

cards = [
    ("🥗", "Diet Assessment & Planning",  ["NRS-2002 / MUST nutrition screening","Individualised diet plan builder","Allergy & therapeutic diet flags","Daily diet order to kitchen"], GREEN),
    ("🍽", "Kitchen / Dietary Services",  ["Ward-wise diet order management","Menu planning & costing","Patient meal tracking","Special diet preparation workflow"], TEAL),
    ("🏋", "Physiotherapy Assessment",    ["Standardized functional assessment forms","Goal-setting & treatment plan","Session scheduling & attendance","Discharge & home-exercise plan"], BLUE),
    ("🧠", "Occupational Therapy",        ["ADL assessment scales","Splint/equipment prescription","Group & individual session notes","Functional independence measure (FIM)"], CYAN),
    ("🗣", "Speech & Language Therapy",   ["Dysphagia screening (GUSS)","SLP assessment tools","Swallowing study integration","Home programme tracker"], VIOLET),
    ("👁", "Ophthalmology Allied",        ["Low vision assessment","Orthoptic session notes","Contact lens fitting record","Visual field tracker"], GOLD),
    ("🩺", "Respiratory Therapy",         ["Ventilator weaning protocol","Nebulization & chest physio log","PFT link from pulmonology","O2 therapy titration record"], TEAL),
    ("🧬", "Dialysis / Nephrology Allied",["Session log & ultrafiltration goals","Vascular access care plan","Dietary compliance tracking","Fluid adherence scoring"], VIOLET),
    ("📊", "Allied Dept Analytics",       ["Referral volume & TAT","Treatment outcome scores","Allied cost per patient","NABH-required KPI tracking"], CYAN),
    ("📱", "Patient Home Exercise App",   ["Physio-prescribed exercise videos","Adherence tracking & reminders","Remote progress reporting","Teleconsultation for allied"], GREEN),
]

module_grid(sl, cards, cols=4, start_l=Inches(0.28), card_w=Inches(3.12), card_h=Inches(1.72),
            gap_x=Inches(0.15), gap_y=Inches(0.18), start_t=Inches(1.58))

# ═════════════════════════════════════════════════════════════════════════════
# SLIDE 19 — NURSING & CLINICAL DOCUMENTATION (8 modules)
# ═════════════════════════════════════════════════════════════════════════════
sl = prs.slides.add_slide(BLANK)
add_gradient_bg(sl)
add_rect(sl, 0, 0, Inches(0.12), H, BLUE)

add_txt(sl, "15 · NURSING & CLINICAL DOCUMENTATION", Inches(0.45), Inches(0.28), Inches(12), Inches(0.42),
        size=11, bold=True, color=CYAN)
add_txt(sl, "8 Modules — Paperless Nursing, Voice-Enabled",
        Inches(0.45), Inches(0.68), Inches(12.4), Inches(0.7),
        size=34, bold=True, color=WHITE)
divider_line(sl, Inches(1.45))

cards = [
    ("📋", "Nursing Assessment",           ["Head-to-toe assessment template","Admission nursing assessment","Risk scores: fall, Braden, DVT","Alert to care plan on high risk"], BLUE),
    ("📝", "Nursing Care Plans (NCP)",     ["NANDA-based care plan templates","Goal & intervention library","Shift-wise care plan review","Auto-update on change in status"], CYAN),
    ("💉", "e-MAR & Medication Safety",    ["Barcode/RFID medication check","Five-rights verification on scan","Missed dose & late dose alert","Controlled drug administration log"], VIOLET),
    ("📡", "Vital Signs & I/O Charting",   ["Auto-import from bedside monitors","Hourly I/O digital entry","Pain score & GCS recording","Vital trend graph for doctors"], GREEN),
    ("🔄", "Shift Handover (ISBAR)",       ["Structured ISBAR digital handover","Pending task carry-forward","Critical patient highlight system","Shift summary auto-generation"], TEAL),
    ("📄", "Clinical Documentation Forms", ["Consent forms — digital e-sign","MLC, DNR, special consent forms","Procedure checklists","All forms — zero paper"], GOLD),
    ("📲", "Nurse Call & Task Management", ["Ward task assignment to nurses","Call bell integration","Overdue task escalation","Staffing & task load view"], CYAN),
    ("🎓", "Nursing Competency Tracking",  ["Skill checklist & competency log","In-service training attendance","NABH nursing audit checklist","Performance dashboard"], BLUE),
]

module_grid(sl, cards, cols=3, card_w=Inches(4.1), card_h=Inches(1.9), gap_y=Inches(0.15),
            start_t=Inches(1.58))

# ═════════════════════════════════════════════════════════════════════════════
# SLIDE 20 — AI CLINICAL DECISION SUPPORT ENGINE (12 modules)
# ═════════════════════════════════════════════════════════════════════════════
sl = prs.slides.add_slide(BLANK)
add_gradient_bg(sl)
add_rect(sl, 0, 0, Inches(0.12), H, VIOLET)

add_txt(sl, "16 · AI CLINICAL DECISION SUPPORT ENGINE", Inches(0.45), Inches(0.28), Inches(12), Inches(0.42),
        size=11, bold=True, color=VIOLET)
add_txt(sl, "12 AI Modules — The Intelligent Core of Mediqzy",
        Inches(0.45), Inches(0.68), Inches(12.4), Inches(0.7),
        size=34, bold=True, color=WHITE)
divider_line(sl, Inches(1.45), color=VIOLET)

ai_mods = [
    ("🤖", "Diagnosis AI (NLP/LLM)",      "Differential diagnosis from symptoms & history; ICD-10 suggestions"),
    ("🗣", "Voice-to-Text Clinical Notes", "Doctor voice dictation → structured SOAP/EMR in real-time"),
    ("⚠️", "Sepsis & Deterioration Alert", "ML model on vitals + labs → early sepsis warning before clinical signs"),
    ("💊", "Drug Safety AI",               "CDSS checks — drug-drug, allergy, dose based on renal/hepatic function"),
    ("🔬", "Lab Interpretation AI",        "Auto-flag abnormal patterns; suggest reflex tests; auto-narrative"),
    ("🏷", "AI Auto-Coding (ICD/CPT)",     "Auto ICD-10 + CPT codes from clinical notes — zero manual coding"),
    ("📊", "Predictive LOS & Readmission","ML-based length-of-stay + 30-day readmission risk per admission"),
    ("📸", "AI Radiology Assist",          "Chest X-ray, CT anomaly detection assist, bone age, retinal screening"),
    ("🎙", "Voice Orders & Prescribing",   "Doctor speaks — drug, dose, route auto-filled in e-prescription"),
    ("🧬", "Genomics & Precision Med",     "Pharmacogenomics alerts, cancer biomarker link, rare disease support"),
    ("📱", "Patient Symptom AI (App)",     "Pre-visit AI triage on patient app; urgency scoring before arrival"),
    ("📈", "Population Health AI",         "Chronic disease risk scoring, preventive care gap identification"),
]

cols = 3
for i, (icon, title, desc) in enumerate(ai_mods):
    col = i % cols
    row = i // cols
    l = Inches(0.35) + col * Inches(4.28)
    t = Inches(1.6) + row * Inches(1.38)
    add_rect(sl, l, t, Inches(4.1), Inches(1.25), RGBColor(0x12, 0x08, 0x2A))
    add_rect(sl, l, t, Inches(0.06), Inches(1.25), VIOLET)
    add_txt(sl, icon + "  " + title, l + Inches(0.15), t + Inches(0.1),
            Inches(3.8), Inches(0.38), size=12, bold=True, color=WHITE)
    add_txt(sl, desc, l + Inches(0.15), t + Inches(0.52),
            Inches(3.8), Inches(0.65), size=9.5, color=LGRAY)

# ═════════════════════════════════════════════════════════════════════════════
# SLIDE 21 — PATIENT EXPERIENCE PLATFORM (8 modules)
# ═════════════════════════════════════════════════════════════════════════════
sl = prs.slides.add_slide(BLANK)
add_gradient_bg(sl)
add_rect(sl, 0, 0, Inches(0.12), H, GOLD)

add_txt(sl, "17 · PATIENT EXPERIENCE PLATFORM", Inches(0.45), Inches(0.28), Inches(12), Inches(0.42),
        size=11, bold=True, color=GOLD)
add_txt(sl, "8 Modules — Digital, Delightful, Patient-First",
        Inches(0.45), Inches(0.68), Inches(12.4), Inches(0.7),
        size=34, bold=True, color=WHITE)
divider_line(sl, Inches(1.45), color=GOLD)

cards = [
    ("📱", "Patient Mobile App",          ["Appointment booking & check-in","Digital lab results & reports","e-Prescription & medicine reminders","Video consultation access"], GOLD),
    ("💬", "WhatsApp / SMS Engagement",   ["Appointment reminders on WhatsApp","Lab report delivery via WhatsApp","Post-discharge follow-up messages","Health tips & recall reminders"], GREEN),
    ("📞", "Teleconsultation (Video)",    ["HD video OPD on mobile/web","Digital prescription post-call","Multi-party nurse + doctor calls","Recording & clinical documentation"], CYAN),
    ("⭐", "Patient Feedback & NABH",     ["Real-time post-visit feedback","NPS / CSAT surveys automated","Complaint escalation workflow","NABH patient satisfaction tracking"], VIOLET),
    ("🗺", "Digital Wayfinding & Kiosks", ["Interactive hospital map on app","Self-check-in kiosks (Aadhaar)","Token display & wait-time boards","Multi-language kiosk interface"], BLUE),
    ("📋", "Personal Health Records",     ["Longitudinal PHR for patients","All visits, labs, Rx in one place","ABHA-linked health locker","Share records with any doctor"], TEAL),
    ("🎁", "Loyalty & Wellness Programs", ["Health points for engagement","Preventive health package reminders","Family health account management","Corporate wellness portal"], GOLD),
    ("🤖", "AI Patient Support Bot",      ["24x7 query resolution on app","Symptom checker pre-visit","Post-discharge care instructions","Medication reminder chatbot"], VIOLET),
]

module_grid(sl, cards, cols=3, card_w=Inches(4.1), card_h=Inches(1.9), gap_y=Inches(0.15),
            start_t=Inches(1.58))

# ═════════════════════════════════════════════════════════════════════════════
# SLIDE 22 — REVENUE CYCLE MANAGEMENT (10 modules)
# ═════════════════════════════════════════════════════════════════════════════
sl = prs.slides.add_slide(BLANK)
add_gradient_bg(sl)
add_rect(sl, 0, 0, Inches(0.12), H, GREEN)

add_txt(sl, "18 · REVENUE CYCLE MANAGEMENT (RCM)", Inches(0.45), Inches(0.28), Inches(12), Inches(0.42),
        size=11, bold=True, color=GREEN)
add_txt(sl, "10 Modules — Zero Revenue Leakage, AI-Coded Billing",
        Inches(0.45), Inches(0.68), Inches(12.4), Inches(0.7),
        size=34, bold=True, color=WHITE)
divider_line(sl, Inches(1.45), color=GREEN)

cards = [
    ("💰", "Patient Billing & Invoicing",  ["Auto-charge capture from EMR/OT/Lab","Package billing & itemized billing","Real-time running bill view","Multi-payment mode: UPI/card/cash"], GREEN),
    ("🏷", "AI Auto-Coding",               ["ICD-10-CM + CPT + DRG auto-coding","NLP from clinical notes → codes","Coder review queue with AI assist","Coding accuracy analytics"], VIOLET),
    ("📋", "Insurance Pre-Auth",           ["Pre-auth request auto-generation","TPA portal integration","Real-time auth status tracking","Pre-auth denial management"], BLUE),
    ("🔄", "Claims Submission & Follow-up",["Electronic claim submission","Claim status tracking by payer","Denial root-cause analysis","Re-submission workflow"], CYAN),
    ("💳", "Collections & Payment Plans",  ["Outstanding dues dashboard","Patient payment plan setup","Auto-reminder for dues","Collection analytics by payor"], GOLD),
    ("📊", "MIS & Revenue Analytics",      ["Daily / monthly revenue reports","Payer mix & revenue by dept","Bed day revenue analysis","Budget vs. actual tracking"], TEAL),
    ("🧾", "GST & Statutory Compliance",   ["Auto GST calculation on billing","E-invoice generation","GSTR-1 / GSTR-3B auto-prep","Statutory deduction compliance"], GREEN),
    ("💹", "Package & Tariff Management",  ["Package builder (surgery, maternity)","Corporate & govt tariff schedules","Dynamic pricing by season/demand","Package profitability analysis"], VIOLET),
    ("🔬", "Clinical Documentation for RCM",["Query management to clinicians","CDI (clinical documentation improvement)","Missing diagnosis flag in notes","DRG optimization workflow"], CYAN),
    ("🤖", "RCM AI — Denial Prevention",   ["Predictive denial risk scoring","Missing info flag before submission","Coverage eligibility real-time check","First-pass claim rate tracking"], RGBColor(0xEF,0x44,0x44)),
]

module_grid(sl, cards, cols=4, start_l=Inches(0.28), card_w=Inches(3.12), card_h=Inches(1.72),
            gap_x=Inches(0.15), gap_y=Inches(0.18), start_t=Inches(1.58))

# ═════════════════════════════════════════════════════════════════════════════
# SLIDE 23 — INSURANCE & TPA (8 modules)
# ═════════════════════════════════════════════════════════════════════════════
sl = prs.slides.add_slide(BLANK)
add_gradient_bg(sl)
add_rect(sl, 0, 0, Inches(0.12), H, CYAN)

add_txt(sl, "19 · INSURANCE & TPA MANAGEMENT", Inches(0.45), Inches(0.28), Inches(12), Inches(0.42),
        size=11, bold=True, color=CYAN)
add_txt(sl, "8 Modules — Cashless, PMJAY, Ayushman, Corporate",
        Inches(0.45), Inches(0.68), Inches(12.4), Inches(0.7),
        size=34, bold=True, color=WHITE)
divider_line(sl, Inches(1.45))

cards = [
    ("🪪", "Eligibility Verification",    ["Real-time insurance card check","TPA portal live eligibility fetch","ABHA + Ayushman ID verify","Coverage limit & room eligibility"], CYAN),
    ("📋", "Pre-Authorization Mgmt",      ["Digital pre-auth form submission","Document upload to TPA portal","Pre-auth tracker with SLA","Partial auth & enhancement handling"], BLUE),
    ("🏥", "Cashless Admission Desk",     ["Cashless desk digital workflow","LOA (letter of authority) tracking","Room upgrade & excess collection","Cashless desk analytics"], TEAL),
    ("📄", "Claims Documentation",        ["Auto-package claim summary from EMR","Discharge summary link to claim","Supporting docs digital attach","Final bill reconciliation"], GOLD),
    ("🔄", "Claims Tracking & Follow-up", ["Status tracking across all TPAs","Auto-reminder on pending claims","Escalation for overdue payments","TPA-wise ageing analysis"], VIOLET),
    ("🏛", "Govt Schemes (PMJAY/Ayushman)",["PMJAY beneficiary verification","Package-wise HBP2 claim filing","Treatment cost pre-validation","Govt scheme analytics & leakage"], GREEN),
    ("🏢", "Corporate Health Insurance",  ["Corporate empanelment management","Employee benefit eligibility","Corporate claim filing workflow","Corporate renewal & billing"], BLUE),
    ("📊", "Insurance Analytics",         ["Payer-wise collection & TAT","Rejection rate by payer/dept","Outstanding TPA receivables","Net revenue per insured patient"], TEAL),
]

module_grid(sl, cards, cols=3, card_w=Inches(4.1), card_h=Inches(1.9), gap_y=Inches(0.15),
            start_t=Inches(1.58))

# ═════════════════════════════════════════════════════════════════════════════
# SLIDE 24 — STORES & MATERIALS MANAGEMENT (7 modules)
# ═════════════════════════════════════════════════════════════════════════════
sl = prs.slides.add_slide(BLANK)
add_gradient_bg(sl)
add_rect(sl, 0, 0, Inches(0.12), H, BLUE)

add_txt(sl, "20 · STORES & MATERIALS MANAGEMENT", Inches(0.45), Inches(0.28), Inches(12), Inches(0.42),
        size=11, bold=True, color=CYAN)
add_txt(sl, "7 Modules — AI Procurement, Zero Stock-Out",
        Inches(0.45), Inches(0.68), Inches(12.4), Inches(0.7),
        size=34, bold=True, color=WHITE)
divider_line(sl, Inches(1.45))

cards = [
    ("📦", "Central Stores & GRN",        ["PO-wise GRN with invoice match","Barcode & QR-based stock entry","Quality check workflow on receipt","Vendor performance scorecard"], BLUE),
    ("🛒", "Purchase Order Management",    ["Indent to PO automated workflow","Multi-level PO approval","Rate contract management","AI demand-based auto-indent"], CYAN),
    ("🔄", "Sub-Store & Ward Indents",     ["Ward-wise digital indent management","Sub-store to ward issue tracking","Consumption tracking per dept","Return & wastage recording"], GREEN),
    ("📊", "Inventory Control (ABC/VED)",  ["ABC / VED / HML classification","Reorder level auto-alerts","Shelf life & expiry management","Physical stock verification"], GOLD),
    ("🏷", "Barcode & RFID Asset Tracking",["Fixed asset tagging & location","Medical equipment maintenance log","AMC & warranty tracking","IoT-based asset location"], VIOLET),
    ("📈", "Consumption Analytics",        ["Dept-wise consumption trend","Wastage & pilferage detection","Cost per bed day by item","Budget utilisation tracking"], TEAL),
    ("🤖", "AI Procurement Intelligence", ["ML-based demand forecasting","Vendor price benchmarking","Optimal order quantity (EOQ)","Seasonal stocking recommendations"], BLUE),
]

module_grid(sl, cards, cols=3, card_w=Inches(4.1), card_h=Inches(2.0), gap_y=Inches(0.18),
            start_t=Inches(1.58))

# ═════════════════════════════════════════════════════════════════════════════
# SLIDE 25 — HR, PAYROLL & ROSTERING (8 modules)
# ═════════════════════════════════════════════════════════════════════════════
sl = prs.slides.add_slide(BLANK)
add_gradient_bg(sl)
add_rect(sl, 0, 0, Inches(0.12), H, TEAL)

add_txt(sl, "21 · HR, PAYROLL & ROSTERING", Inches(0.45), Inches(0.28), Inches(12), Inches(0.42),
        size=11, bold=True, color=TEAL)
add_txt(sl, "8 Modules — People Operations, Digital & Automated",
        Inches(0.45), Inches(0.68), Inches(12.4), Inches(0.7),
        size=34, bold=True, color=WHITE)
divider_line(sl, Inches(1.45), color=TEAL)

cards = [
    ("👥", "Employee Master & HRMS",      ["Complete employee profile management","Document storage (certificates, licenses)","Onboarding & exit workflow","Medical council registration link"], TEAL),
    ("⏰", "Biometric Attendance",        ["Biometric / face / mobile attendance","Shift & late mark auto-calculation","Integration with payroll system","OT & comp-off management"], BLUE),
    ("📅", "Smart Duty Roster",           ["AI-assisted nurse & doctor roster","Minimum staffing rule engine","Shift swap & leave integration","Real-time roster board"], CYAN),
    ("💰", "Payroll Processing",          ["Auto salary calculation on attendance","HRA, TA, deductions auto-apply","PF, ESI, TDS compliance","Pay slip digital delivery to app"], GREEN),
    ("🎓", "Training & Competency Mgmt",  ["Training calendar & attendance","Competency assessment forms","Mandatory NABH training tracker","E-learning module integration"], GOLD),
    ("📝", "Leave & Holiday Management",  ["Online leave application workflow","Leave balance real-time view","Compensatory / on-duty leave","Public holiday calendar"], VIOLET),
    ("⭐", "Performance Management",      ["KPI setting & mid-year review","360-degree feedback system","Increment & promotion workflow","Doctor productivity analytics"], TEAL),
    ("📊", "HR Analytics & Compliance",   ["Attrition & retention analytics","Staffing ratio NABH compliance","Salary cost per patient day","Workforce planning dashboards"], CYAN),
]

module_grid(sl, cards, cols=3, card_w=Inches(4.1), card_h=Inches(1.9), gap_y=Inches(0.15),
            start_t=Inches(1.58))

# ═════════════════════════════════════════════════════════════════════════════
# SLIDE 26 — FINANCE & ACCOUNTS (8 modules)
# ═════════════════════════════════════════════════════════════════════════════
sl = prs.slides.add_slide(BLANK)
add_gradient_bg(sl)
add_rect(sl, 0, 0, Inches(0.12), H, GOLD)

add_txt(sl, "22A · FINANCE & ACCOUNTS", Inches(0.45), Inches(0.28), Inches(12), Inches(0.42),
        size=11, bold=True, color=GOLD)
add_txt(sl, "8 Modules — Real-Time P&L, GST, Budget Control",
        Inches(0.45), Inches(0.68), Inches(12.4), Inches(0.7),
        size=34, bold=True, color=WHITE)
divider_line(sl, Inches(1.45), color=GOLD)

cards = [
    ("📊", "General Ledger & CoA",        ["Multi-entity chart of accounts","Journal entry & auto-posting","Trial balance & ledger reports","Year-end closing workflow"], GOLD),
    ("💳", "Accounts Payable (AP)",        ["Vendor invoice management","3-way match: PO+GRN+invoice","Payment schedule & TDS","Vendor ageing & payment analytics"], CYAN),
    ("💰", "Accounts Receivable (AR)",     ["Patient & TPA receivables","Ageing analysis by payor","Auto-posting of billing collections","Bad debt provisioning"], GREEN),
    ("📋", "Budgeting & Cost Centre",      ["Dept-wise budget planning","Variance alerts on overspend","Cost centre-wise P&L","CAPEX & OPEX tracking"], BLUE),
    ("🏦", "Cash & Bank Reconciliation",   ["Multi-bank account management","Daily bank reconciliation","Cash flow forecast","UPI/POS/gateway auto-reconcile"], TEAL),
    ("🧾", "GST & Statutory Filing",       ["Auto GST computation on sales","Input tax credit management","GSTR-1/3B/9 auto-generation","TDS/TCS compliance & filing"], VIOLET),
    ("📈", "Financial MIS Dashboards",     ["Real-time revenue & EBITDA","Cost per patient day / bed","Breakeven analysis","Multi-unit consolidated P&L"], GOLD),
    ("🤝", "Vendor & Contract Management",["Vendor empanelment & KYC","Rate contract repository","Contract expiry alerts","Vendor performance scoring"], TEAL),
]

module_grid(sl, cards, cols=3, card_w=Inches(4.1), card_h=Inches(1.9), gap_y=Inches(0.15),
            start_t=Inches(1.58))

# ═════════════════════════════════════════════════════════════════════════════
# SLIDE 27 — QUALITY, SAFETY & COMPLIANCE (10 modules)
# ═════════════════════════════════════════════════════════════════════════════
sl = prs.slides.add_slide(BLANK)
add_gradient_bg(sl)
add_rect(sl, 0, 0, Inches(0.12), H, RGBColor(0xEF, 0x44, 0x44))

add_txt(sl, "22B · QUALITY, SAFETY & COMPLIANCE", Inches(0.45), Inches(0.28), Inches(12), Inches(0.42),
        size=11, bold=True, color=RGBColor(0xEF,0x44,0x44))
add_txt(sl, "10 Modules — NABH / JCI / ABDM Ready, Audit-Proof",
        Inches(0.45), Inches(0.68), Inches(12.4), Inches(0.7),
        size=34, bold=True, color=WHITE)
divider_line(sl, Inches(1.45), color=RGBColor(0xEF,0x44,0x44))

cards = [
    ("🏅", "NABH Accreditation Mgmt",     ["Chapter-wise compliance checklist","Document control & version mgmt","Corrective action (CAPA) tracking","Mock audit & score dashboard"], RGBColor(0xEF,0x44,0x44)),
    ("⚠️", "Incident & Adverse Event Mgmt",["Near-miss & sentinel event log","Root cause analysis workflow","Action plan & closure tracking","Anonymous reporting portal"], GOLD),
    ("🦠", "Infection Control (IPCC)",     ["HAI surveillance dashboard","Bundle compliance monitoring","Antibiogram & AMR reporting","Outbreak alert & contact tracing"], GREEN),
    ("💊", "Medication Error Tracking",   ["ADR (adverse drug reaction) report","Medication error classification","Pharmacovigilance regulatory link","Error trend & prevention analytics"], CYAN),
    ("🛡", "Patient Safety Indicators",   ["Fall rate, CLABSI, CAUTI tracking","Pressure ulcer incidence","Wrong-site surgery prevention","Patient safety goal compliance"], BLUE),
    ("🌡", "Bio-Medical Equipment Mgmt",   ["PPM schedule management","Calibration record keeping","Equipment breakdown log","Bio-medical warranty & AMC"], VIOLET),
    ("🧪", "Laboratory Accreditation",    ["NABL compliance documentation","Proficiency testing records","Internal audit schedule","Non-conformance management"], TEAL),
    ("📋", "Policy & SOP Management",     ["SOP library with version control","Staff read & acknowledgment","Review due date alerts","Auto-link SOP to workflow"], GREEN),
    ("🔐", "Data Privacy & Security",     ["HIPAA / DPDP Act compliance","Role-based data access control","Audit trail for all data access","Data breach incident management"], VIOLET),
    ("📊", "Quality MIS & Dashboards",    ["Real-time quality indicator board","NABH monthly KPI report","Peer review & mortality audit","Clinical outcome benchmarking"], GOLD),
]

module_grid(sl, cards, cols=4, start_l=Inches(0.28), card_w=Inches(3.12), card_h=Inches(1.72),
            gap_x=Inches(0.15), gap_y=Inches(0.18), start_t=Inches(1.58))

# ═════════════════════════════════════════════════════════════════════════════
# SLIDE 28 — ANALYTICS & MIS DASHBOARDS
# ═════════════════════════════════════════════════════════════════════════════
sl = prs.slides.add_slide(BLANK)
add_gradient_bg(sl)
add_rect(sl, 0, 0, Inches(0.12), H, CYAN)

add_txt(sl, "ANALYTICS & BUSINESS INTELLIGENCE", Inches(0.45), Inches(0.28), Inches(12), Inches(0.42),
        size=11, bold=True, color=CYAN)
add_txt(sl, "Real-Time Dashboards for Every Stakeholder",
        Inches(0.45), Inches(0.68), Inches(12.4), Inches(0.7),
        size=34, bold=True, color=WHITE)
divider_line(sl, Inches(1.45))

analytics = [
    ("📊", "CEO / CMD Dashboard",     "EBITDA, revenue, occupancy, ALOS, IP/OP volumes — live"),
    ("🏥", "CMO / Medical Dashboard", "Quality KPIs, mortality, readmissions, CDI, outcome data"),
    ("💰", "CFO Dashboard",           "Revenue, collections, AR ageing, payroll cost, GST compliance"),
    ("👩‍⚕️", "Nursing Dashboard",     "Staffing ratios, task completion, adverse events, falls rate"),
    ("🔬", "Lab / Radiology BI",       "Volume, TAT, critical values, NABL/NABH compliance"),
    ("💊", "Pharmacy Analytics",       "Consumption, expiry, ABC analysis, revenue, formulary adherence"),
    ("🛒", "Stores / Supply Chain BI", "Stock levels, PO TAT, vendor performance, wastage rate"),
    ("🏆", "Quality & NABH Dashboard", "All NABH KPIs, incident rate, infection rates, SOP compliance"),
    ("📱", "Patient Experience BI",    "NPS, CSAT, teleconsult volumes, app engagement, feedback TAT"),
    ("🤖", "AI Performance Dashboard", "AI suggestion acceptance, auto-code accuracy, alert efficacy"),
    ("🌐", "Multi-Unit Consolidated",  "Group-level view across all hospitals, branches, OPD chains"),
    ("📲", "Mobile BI App",            "Any metric, any time, on phone — iOS & Android real-time BI"),
]

cols = 4
for i, (icon, title, desc) in enumerate(analytics):
    col = i % cols
    row = i // cols
    l = Inches(0.3) + col * Inches(3.23)
    t = Inches(1.6) + row * Inches(1.5)
    add_rect(sl, l, t, Inches(3.1), Inches(1.35), RGBColor(0x0D, 0x12, 0x45))
    add_rect(sl, l, t, Inches(3.1), Inches(0.06), CYAN)
    add_txt(sl, icon + "  " + title, l + Inches(0.12), t + Inches(0.1),
            Inches(2.86), Inches(0.38), size=12, bold=True, color=WHITE)
    add_txt(sl, desc, l + Inches(0.12), t + Inches(0.52),
            Inches(2.86), Inches(0.75), size=9.5, color=LGRAY)

# ═════════════════════════════════════════════════════════════════════════════
# SLIDE 29 — TECHNOLOGY & SECURITY ARCHITECTURE
# ═════════════════════════════════════════════════════════════════════════════
sl = prs.slides.add_slide(BLANK)
add_gradient_bg(sl)
add_rect(sl, 0, 0, Inches(0.12), H, VIOLET)

add_txt(sl, "TECHNOLOGY & SECURITY ARCHITECTURE", Inches(0.45), Inches(0.28), Inches(12), Inches(0.42),
        size=11, bold=True, color=VIOLET)
add_txt(sl, "Enterprise-Grade, Cloud-Native, HL7 FHIR, ABDM-Ready",
        Inches(0.45), Inches(0.68), Inches(12.4), Inches(0.7),
        size=34, bold=True, color=WHITE)
divider_line(sl, Inches(1.45), color=VIOLET)

tech_items = [
    ("☁️", "Cloud Architecture",   "Deployed on AWS/Azure/on-prem. Multi-tenant & single-tenant. Auto-scaling. 99.9% SLA."),
    ("🔐", "Security & HIPAA",     "AES-256 encryption at rest & in transit. RBAC. SOC-2 aligned. DPDP Act compliance."),
    ("🌐", "HL7 FHIR R4 APIs",     "Open FHIR R4 APIs for EHR interoperability. ABDM PHR linking. NHA compliant."),
    ("🤖", "AI / ML Platform",     "OpenAI GPT + custom fine-tuned clinical models. NLP engine. Federated learning ready."),
    ("📡", "IoT & Device Integration","Bedside monitors, lab analyzers, PACS, biometrics, RFID. 200+ device integrations."),
    ("📱", "Mobile (iOS/Android)",  "Native apps for doctors, nurses, patients, admin. Offline-first. Push notifications."),
    ("🔗", "Integration Engine",   "HL7 v2, FHIR, DICOM, API gateway. Pre-built connectors for lab, RIS, PACS, pharmacy."),
    ("🛡", "Disaster Recovery",    "RPO < 15 min, RTO < 1 hr. Automated daily backups. Multi-AZ failover. DR drill included."),
    ("📊", "Performance",          "Sub-second page loads. Handles 5000 concurrent users. Load-tested. Auto-scaling."),
]

cols = 3
for i, (icon, title, desc) in enumerate(tech_items):
    col = i % cols
    row = i // cols
    l = Inches(0.35) + col * Inches(4.28)
    t = Inches(1.6) + row * Inches(1.78)
    add_rect(sl, l, t, Inches(4.1), Inches(1.62), RGBColor(0x10, 0x08, 0x2E))
    add_rect(sl, l, t, Inches(0.06), Inches(1.62), VIOLET)
    add_txt(sl, icon + "  " + title, l + Inches(0.15), t + Inches(0.1),
            Inches(3.8), Inches(0.38), size=13, bold=True, color=WHITE)
    add_txt(sl, desc, l + Inches(0.15), t + Inches(0.53),
            Inches(3.8), Inches(1.0), size=10, color=LGRAY)

# ═════════════════════════════════════════════════════════════════════════════
# SLIDE 30 — IMPLEMENTATION ROADMAP (16 weeks)
# ═════════════════════════════════════════════════════════════════════════════
sl = prs.slides.add_slide(BLANK)
add_gradient_bg(sl)
add_rect(sl, 0, 0, Inches(0.12), H, CYAN)

add_txt(sl, "IMPLEMENTATION ROADMAP", Inches(0.45), Inches(0.28), Inches(12), Inches(0.42),
        size=11, bold=True, color=CYAN)
add_txt(sl, "16-Week Go-Live Plan — Phased, Low-Risk, High-Speed",
        Inches(0.45), Inches(0.68), Inches(12.4), Inches(0.7),
        size=34, bold=True, color=WHITE)
divider_line(sl, Inches(1.45))

phases = [
    ("Phase 1\nWeeks 1–3",  "Foundation & Setup",    ["Infrastructure & cloud setup","Master data configuration","User accounts & RBAC","Integration planning"], CYAN),
    ("Phase 2\nWeeks 4–6",  "Core Clinical",          ["OPD + IPD + Nursing go-live","Pharmacy & Lab interfaces","Radiology / PACS connect","EMR template setup"], BLUE),
    ("Phase 3\nWeeks 7–9",  "Financials & Admin",     ["Billing & RCM live","Insurance / TPA setup","Stores & HR module live","Finance & accounts go-live"], GOLD),
    ("Phase 4\nWeeks 10–12","Specialty & Advanced",   ["OT, ICU, Blood Bank live","All specialty modules","AI/CDS activation","Patient app launch"], VIOLET),
    ("Phase 5\nWeeks 13–14","Quality & Analytics",    ["NABH compliance module","Quality dashboards live","Executive BI dashboards","KPI baseline capture"], GREEN),
    ("Phase 6\nWeeks 15–16","Stabilization & Handover",["Hypercare support period","Staff super-user training","Performance tuning","Sign-off & handover"], TEAL),
]

for i, (phase, title, items, color) in enumerate(phases):
    col = i % 3
    row = i // 3
    l = Inches(0.35) + col * Inches(4.28)
    t = Inches(1.6) + row * Inches(2.5)
    add_rect(sl, l, t, Inches(4.1), Inches(2.3), RGBColor(0x0F, 0x14, 0x4A))
    add_rect(sl, l, t, Inches(4.1), Inches(0.06), color)
    add_txt(sl, phase, l + Inches(0.15), t + Inches(0.1),
            Inches(3.8), Inches(0.5), size=11, bold=True, color=color, align=PP_ALIGN.LEFT)
    add_txt(sl, title, l + Inches(0.15), t + Inches(0.62),
            Inches(3.8), Inches(0.38), size=13, bold=True, color=WHITE)
    for j, item in enumerate(items):
        add_txt(sl, "✓ " + item, l + Inches(0.18), t + Inches(1.05 + j*0.3),
                Inches(3.75), Inches(0.28), size=9.5, color=LGRAY)

# ═════════════════════════════════════════════════════════════════════════════
# SLIDE 31 — ROI & VALUE METRICS
# ═════════════════════════════════════════════════════════════════════════════
sl = prs.slides.add_slide(BLANK)
add_gradient_bg(sl)
add_rect(sl, 0, 0, Inches(0.12), H, GREEN)

add_txt(sl, "ROI & VALUE DELIVERED", Inches(0.45), Inches(0.28), Inches(12), Inches(0.42),
        size=11, bold=True, color=GREEN)
add_txt(sl, "Measurable Impact — Within 12 Months",
        Inches(0.45), Inches(0.68), Inches(12.4), Inches(0.7),
        size=34, bold=True, color=WHITE)
divider_line(sl, Inches(1.45), color=GREEN)

roi_data = [
    ("📉", "Revenue Leakage Reduced",  "15–22%",  "Charge capture, auto-coding, denial prevention"),
    ("⚡", "Billing TAT",               "80% Faster","Auto-coding + AI billing vs manual 48–72 hrs"),
    ("🧾", "Paper Cost Eliminated",     "₹40–80L/yr","Forms, files, film, printing — all eliminated"),
    ("⏱", "OPD Wait Time",             "40% Down",  "Smart queue, digital check-in, parallel workflows"),
    ("🏥", "Bed Utilisation",           "+12–18%",   "Predictive discharge, smart bed management"),
    ("💊", "Drug Wastage",              "30% Less",  "AI demand forecasting, FEFO dispensing, expiry mgmt"),
    ("👥", "Nurse Documentation Time",  "60% Less",  "e-MAR, voice notes, auto-vitals — frees up 2–3 hrs/shift"),
    ("⭐", "Patient Satisfaction (NPS)", "+25 pts",   "App, digital reports, transparent billing, teleconsult"),
    ("📋", "NABH Compliance Score",     "90%+",      "Built-in NABH checklist, digital audit trail"),
    ("🤖", "AI Code Accuracy",          "94%+",      "First-pass claim rate increase, fewer denials"),
    ("🔬", "Lab TAT (Critical Values)", "<30 min",   "Auto-alert on critical results to bedside & doctor"),
    ("💰", "EBITDA Improvement",        "6–10%",     "Combined revenue + cost impact across all modules"),
]

cols = 4
for i, (icon, metric, value, desc) in enumerate(roi_data):
    col = i % cols
    row = i // cols
    l = Inches(0.3) + col * Inches(3.23)
    t = Inches(1.6) + row * Inches(1.6)
    add_rect(sl, l, t, Inches(3.1), Inches(1.45), RGBColor(0x06, 0x14, 0x0A))
    add_rect(sl, l, t, Inches(3.1), Inches(0.06), GREEN)
    add_txt(sl, value, l + Inches(0.1), t + Inches(0.1),
            Inches(2.9), Inches(0.48), size=22, bold=True, color=GREEN, align=PP_ALIGN.CENTER)
    add_txt(sl, icon + "  " + metric, l + Inches(0.1), t + Inches(0.6),
            Inches(2.9), Inches(0.32), size=10, bold=True, color=WHITE, align=PP_ALIGN.CENTER)
    add_txt(sl, desc, l + Inches(0.1), t + Inches(0.95),
            Inches(2.9), Inches(0.42), size=8, color=LGRAY, align=PP_ALIGN.CENTER)

# ═════════════════════════════════════════════════════════════════════════════
# SLIDE 32 — WHY MEDIQZY
# ═════════════════════════════════════════════════════════════════════════════
sl = prs.slides.add_slide(BLANK)
add_gradient_bg(sl)
add_rect(sl, 0, 0, Inches(0.12), H, CYAN)

add_txt(sl, "WHY MEDIQZY", Inches(0.45), Inches(0.28), Inches(12), Inches(0.42),
        size=11, bold=True, color=CYAN)
add_txt(sl, "The Intelligent Choice for a World-Class Hospital",
        Inches(0.45), Inches(0.68), Inches(12.4), Inches(0.7),
        size=36, bold=True, color=WHITE)
divider_line(sl, Inches(1.45))

whys = [
    ("🤖  AI-Native",         "Not bolted-on. AI is the engine — auto-coding, voice notes, CDS, forecasting, alert, insight — everywhere."),
    ("🚫📄  100% Paperless",  "We mean it. Every form, every report, every order — digital from day one. No hybrid. No paper trail to manage."),
    ("🔗  True Integration",  "One platform = one truth. Lab, OPD, IPD, Pharmacy, Finance, HR — all talking to each other in real time."),
    ("📱  Mobile-First",      "Doctors round on phones. Nurses chart on tablets. Patients access on apps. Zero desktop dependency."),
    ("🏅  NABH / ABDM Ready", "Built for Indian regulatory reality. NABH checklist baked in. ABDM / PHR / ABHA native. NMC compliant."),
    ("⚡  Fast to Live",      "16-week phased go-live. Pre-built templates, auto-migration tools, certified implementation team."),
    ("📈  Proven ROI",        "15–22% revenue recovery, 60% nursing documentation reduction, 12–18% bed utilisation improvement."),
    ("🤝  Partnership Model", "We grow with you. Transparent pricing, no hidden licensing, dedicated account manager, 24x7 support SLA."),
]

for i, (title, desc) in enumerate(whys):
    col = i % 2
    row = i // 2
    l = Inches(0.35) + col * Inches(6.6)
    t = Inches(1.6) + row * Inches(1.35)
    add_rect(sl, l, t, Inches(6.4), Inches(1.2), RGBColor(0x0A, 0x12, 0x3A))
    add_rect(sl, l, t, Inches(0.06), Inches(1.2), CYAN)
    add_txt(sl, title, l + Inches(0.15), t + Inches(0.08),
            Inches(6.1), Inches(0.38), size=13, bold=True, color=WHITE)
    add_txt(sl, desc, l + Inches(0.15), t + Inches(0.5),
            Inches(6.1), Inches(0.62), size=10.5, color=LGRAY)

# ═════════════════════════════════════════════════════════════════════════════
# SLIDE 33 — NEXT STEPS / CTA
# ═════════════════════════════════════════════════════════════════════════════
sl = prs.slides.add_slide(BLANK)
add_rect(sl, 0, 0, W, H, DARK)
add_rect(sl, 0, 0, Inches(0.18), H, CYAN)
add_rect(sl, 0, H - Inches(0.12), W, Inches(0.12), GOLD)

add_txt(sl, "NEXT STEPS", Inches(0.45), Inches(0.5), Inches(12), Inches(0.5),
        size=12, bold=True, color=CYAN)
add_txt(sl, "Let's Build India's Most Advanced Hospital Together",
        Inches(0.45), Inches(1.1), Inches(12.4), Inches(1.1),
        size=42, bold=True, color=WHITE, align=PP_ALIGN.CENTER)
add_txt(sl, "Your hospital. Your patients. Zero paper. Full AI.",
        Inches(0.45), Inches(2.3), Inches(12.4), Inches(0.55),
        size=20, color=CYAN, align=PP_ALIGN.CENTER, italic=True)

steps = [
    ("1", "Live Demo",       "Schedule a 90-min live product demo\nwith your clinical and IT teams"),
    ("2", "Fit Assessment",  "Our consultants map Mediqzy modules\nto your existing workflows"),
    ("3", "Pilot Proposal",  "Receive a tailored implementation plan\nwith pricing & go-live timeline"),
    ("4", "Kickoff",         "Sign off and begin Phase 1 — go-live\nin 16 weeks with dedicated support"),
]

for i, (num, title, desc) in enumerate(steps):
    l = Inches(0.7) + i * Inches(3.2)
    add_rect(sl, l, Inches(3.1), Inches(3.0), Inches(2.55), RGBColor(0x0F, 0x14, 0x4A))
    add_rect(sl, l, Inches(3.1), Inches(3.0), Inches(0.06), CYAN)
    pill(sl, l + Inches(1.1), Inches(3.0), Inches(0.8), Inches(0.42), CYAN, num, tsize=18)
    add_txt(sl, title, l + Inches(0.15), Inches(3.65), Inches(2.7), Inches(0.45),
            size=15, bold=True, color=WHITE, align=PP_ALIGN.CENTER)
    add_txt(sl, desc, l + Inches(0.15), Inches(4.15), Inches(2.7), Inches(0.85),
            size=10.5, color=LGRAY, align=PP_ALIGN.CENTER)
    if i < 3:
        add_txt(sl, "→", l + Inches(3.0), Inches(4.1), Inches(0.22), Inches(0.35),
                size=18, color=CYAN, align=PP_ALIGN.CENTER)

# Contact
add_rect(sl, Inches(2.0), Inches(5.88), Inches(9.33), Inches(1.05), RGBColor(0x0F, 0x14, 0x4A))
add_rect(sl, Inches(2.0), Inches(5.88), Inches(9.33), Inches(0.06), GOLD)
add_txt(sl, "🌐  mediqzy.com   |   📧  info@mysmarthealth.in   |   📞  Ready to Transform Your Hospital?",
        Inches(2.1), Inches(5.98), Inches(9.1), Inches(0.48),
        size=13, bold=True, color=WHITE, align=PP_ALIGN.CENTER)
add_txt(sl, "Confidential — Prepared exclusively for your hospital leadership",
        Inches(2.1), Inches(6.5), Inches(9.1), Inches(0.35),
        size=10, color=LGRAY, align=PP_ALIGN.CENTER, italic=True)

# ═════════════════════════════════════════════════════════════════════════════
# SAVE
# ═════════════════════════════════════════════════════════════════════════════
output = "/home/ubuntu/Mediczy/Mediqzy_WorldClass_HMIS_Complete.pptx"
prs.save(output)
print(f"✅  Saved: {output}")
print(f"   Slides: {len(prs.slides)}")
