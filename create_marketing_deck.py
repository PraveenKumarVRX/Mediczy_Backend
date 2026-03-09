#!/usr/bin/env python3
"""
Mediqzy Healthcare — Marketing Deck Generator
Creates a professional PowerPoint presentation.
"""

from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
import os

# ── Brand Colors ──
TEAL       = RGBColor(0x00, 0x96, 0x88)   # Primary teal
TEAL_DARK  = RGBColor(0x00, 0x7A, 0x6E)   # Dark teal
TEAL_LIGHT = RGBColor(0x4D, 0xB6, 0xAC)   # Light teal
WHITE      = RGBColor(0xFF, 0xFF, 0xFF)
BLACK      = RGBColor(0x1A, 0x1A, 0x2E)
DARK_BG    = RGBColor(0x0F, 0x17, 0x2A)   # Dark navy/slate
DARK_CARD  = RGBColor(0x1E, 0x29, 0x3B)   # Card background
GRAY       = RGBColor(0x94, 0xA3, 0xB8)
LIGHT_GRAY = RGBColor(0xE2, 0xE8, 0xF0)
EMERALD    = RGBColor(0x10, 0xB9, 0x81)
ORANGE     = RGBColor(0xF5, 0x9E, 0x0B)
BLUE       = RGBColor(0x38, 0xBD, 0xF8)
PURPLE     = RGBColor(0xA7, 0x8B, 0xFA)
ROSE       = RGBColor(0xFB, 0x71, 0x85)
AMBER      = RGBColor(0xFB, 0xBF, 0x24)

LOGO_PATH = os.path.join(os.path.dirname(__file__), "client", "public", "logo", "Mediqzy_logo.jpeg")

prs = Presentation()
prs.slide_width = Inches(13.33)
prs.slide_height = Inches(7.5)
W = prs.slide_width
H = prs.slide_height


# ════════════════════════════════════════════
# HELPER FUNCTIONS
# ════════════════════════════════════════════

def set_slide_bg(slide, color):
    bg = slide.background
    fill = bg.fill
    fill.solid()
    fill.fore_color.rgb = color


def add_shape(slide, left, top, width, height, color, radius=None):
    shape = slide.shapes.add_shape(
        MSO_SHAPE.ROUNDED_RECTANGLE if radius else MSO_SHAPE.RECTANGLE,
        left, top, width, height
    )
    shape.fill.solid()
    shape.fill.fore_color.rgb = color
    shape.line.fill.background()
    shape.shadow.inherit = False
    return shape


def add_text(slide, left, top, width, height, text, font_size=18, color=WHITE, bold=False, alignment=PP_ALIGN.LEFT, font_name="Calibri"):
    txBox = slide.shapes.add_textbox(left, top, width, height)
    tf = txBox.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = text
    p.font.size = Pt(font_size)
    p.font.color.rgb = color
    p.font.bold = bold
    p.font.name = font_name
    p.alignment = alignment
    return txBox


def add_rich_text(slide, left, top, width, height, runs, alignment=PP_ALIGN.LEFT):
    """runs: list of dicts {text, size, color, bold, font}"""
    txBox = slide.shapes.add_textbox(left, top, width, height)
    tf = txBox.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.alignment = alignment
    for i, run_def in enumerate(runs):
        if i == 0:
            run = p.runs[0] if p.runs else p.add_run()
        else:
            run = p.add_run()
        run.text = run_def.get("text", "")
        run.font.size = Pt(run_def.get("size", 18))
        run.font.color.rgb = run_def.get("color", WHITE)
        run.font.bold = run_def.get("bold", False)
        run.font.name = run_def.get("font", "Calibri")
    return txBox


def add_bullet_list(slide, left, top, width, height, items, font_size=14, color=LIGHT_GRAY, spacing=Pt(6)):
    txBox = slide.shapes.add_textbox(left, top, width, height)
    tf = txBox.text_frame
    tf.word_wrap = True
    for i, item in enumerate(items):
        if i == 0:
            p = tf.paragraphs[0]
        else:
            p = tf.add_paragraph()
        p.text = f"▸  {item}"
        p.font.size = Pt(font_size)
        p.font.color.rgb = color
        p.font.name = "Calibri"
        p.space_after = spacing
    return txBox


def add_icon_card(slide, left, top, width, height, icon, title, desc, bg_color=DARK_CARD, icon_color=TEAL):
    """Add a card with emoji icon, title, and description."""
    card = add_shape(slide, left, top, width, height, bg_color, radius=True)
    # Icon
    add_text(slide, left + Inches(0.3), top + Inches(0.25), Inches(0.6), Inches(0.6),
             icon, font_size=28, color=icon_color, alignment=PP_ALIGN.LEFT, font_name="Segoe UI Emoji")
    # Title
    add_text(slide, left + Inches(0.3), top + Inches(0.75), width - Inches(0.6), Inches(0.4),
             title, font_size=15, color=WHITE, bold=True)
    # Description
    add_text(slide, left + Inches(0.3), top + Inches(1.15), width - Inches(0.6), height - Inches(1.4),
             desc, font_size=11, color=GRAY)
    return card


def add_stat_card(slide, left, top, width, height, value, label, accent_color=TEAL):
    card = add_shape(slide, left, top, width, height, DARK_CARD, radius=True)
    # Accent top bar
    bar = add_shape(slide, left + Inches(0.15), top + Inches(0.1), width - Inches(0.3), Inches(0.04), accent_color)
    add_text(slide, left, top + Inches(0.3), width, Inches(0.5),
             value, font_size=32, color=accent_color, bold=True, alignment=PP_ALIGN.CENTER)
    add_text(slide, left, top + Inches(0.85), width, Inches(0.4),
             label, font_size=12, color=GRAY, alignment=PP_ALIGN.CENTER)
    return card


def add_section_header(slide, text, subtitle=None, y_offset=Inches(0.6)):
    # Accent line
    add_shape(slide, Inches(0.8), y_offset, Inches(0.6), Inches(0.05), TEAL)
    add_text(slide, Inches(0.8), y_offset + Inches(0.15), Inches(10), Inches(0.7),
             text, font_size=36, color=WHITE, bold=True)
    if subtitle:
        add_text(slide, Inches(0.8), y_offset + Inches(0.8), Inches(10), Inches(0.5),
                 subtitle, font_size=16, color=GRAY)


# ════════════════════════════════════════════
# SLIDE 1 — TITLE / COVER
# ════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])  # blank
set_slide_bg(slide, DARK_BG)

# Decorative shapes
add_shape(slide, Inches(0), Inches(0), Inches(13.33), Inches(7.5), DARK_BG)
# Top-right decorative circle (faded teal)
circle = slide.shapes.add_shape(MSO_SHAPE.OVAL, Inches(9.5), Inches(-1.5), Inches(5), Inches(5))
circle.fill.solid()
circle.fill.fore_color.rgb = RGBColor(0x0D, 0x3B, 0x3B)
circle.line.fill.background()

# Bottom-left decorative circle
circle2 = slide.shapes.add_shape(MSO_SHAPE.OVAL, Inches(-2), Inches(5), Inches(5), Inches(5))
circle2.fill.solid()
circle2.fill.fore_color.rgb = RGBColor(0x0D, 0x2E, 0x3B)
circle2.line.fill.background()

# Logo
if os.path.exists(LOGO_PATH):
    slide.shapes.add_picture(LOGO_PATH, Inches(0.8), Inches(0.6), Inches(1.8), Inches(1.8))

# Title
add_rich_text(slide, Inches(0.8), Inches(2.6), Inches(8), Inches(1.2), [
    {"text": "Mediqzy", "size": 54, "color": TEAL, "bold": True},
    {"text": "  Healthcare", "size": 54, "color": WHITE, "bold": True},
])

# Tagline
add_text(slide, Inches(0.8), Inches(3.7), Inches(8), Inches(0.6),
         "Your Health, Our Priority", font_size=24, color=TEAL_LIGHT, bold=False)

# Subtitle
add_text(slide, Inches(0.8), Inches(4.5), Inches(8), Inches(1.0),
         "India's most comprehensive AI-powered healthcare\npractice management & patient engagement platform.",
         font_size=18, color=GRAY)

# URL
add_text(slide, Inches(0.8), Inches(5.8), Inches(4), Inches(0.4),
         "app.mediqzy.com", font_size=14, color=TEAL)

# Stats row at bottom
stats = [("12+", "User Portals"), ("400+", "Features"), ("RIS/PACS", "Tele-Radiology"), ("IoT", "Patient Monitoring")]
for i, (val, lab) in enumerate(stats):
    x = Inches(0.8 + i * 2.8)
    add_stat_card(slide, x, Inches(6.2), Inches(2.3), Inches(1.1), val, lab)


# ════════════════════════════════════════════
# SLIDE 2 — THE PROBLEM
# ════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_slide_bg(slide, DARK_BG)
add_section_header(slide, "The Healthcare Challenge", "Why the industry needs a unified digital platform")

problems = [
    ("🏥", "Fragmented Systems", "Hospitals, clinics, labs, and pharmacies use disconnected tools — leading to data silos, errors, and inefficiency."),
    ("📋", "Paper-Based Workflows", "Manual prescriptions, records, and billing cause delays, lost data, and compliance gaps."),
    ("🤖", "No AI Integration", "Clinicians lack real-time decision support, automated documentation, and intelligent triage."),
    ("🔐", "Compliance Burden", "Meeting HIPAA, ABDM, and regulatory requirements is complex and costly with fragmented tools."),
    ("💰", "Rising Costs", "Multiple vendor subscriptions, IT overhead, and operational waste inflate healthcare delivery costs."),
    ("📱", "Poor Patient Experience", "Patients juggle multiple apps for appointments, records, prescriptions, insurance, and teleconsultation."),
]
for i, (icon, title, desc) in enumerate(problems):
    col = i % 3
    row = i // 3
    x = Inches(0.8 + col * 4.0)
    y = Inches(2.0 + row * 2.7)
    add_icon_card(slide, x, y, Inches(3.6), Inches(2.3), icon, title, desc)


# ════════════════════════════════════════════
# SLIDE 3 — THE SOLUTION
# ════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_slide_bg(slide, DARK_BG)
add_section_header(slide, "The Mediqzy Solution", "One platform for the entire healthcare ecosystem")

# Central concept
add_shape(slide, Inches(3.5), Inches(2.2), Inches(6.3), Inches(1.2), TEAL, radius=True)
add_text(slide, Inches(3.5), Inches(2.35), Inches(6.3), Inches(1.0),
         "AI-Powered Unified Healthcare Operating System",
         font_size=22, color=WHITE, bold=True, alignment=PP_ALIGN.CENTER)

stakeholders = [
    ("👤", "Patients", "Dashboard, AI Doctor,\nTelemedicine, Insurance"),
    ("👨‍⚕️", "Doctors", "EMR, AI Scribe, CDSS,\nPrescriptions, Video"),
    ("🏥", "Hospitals", "OPD/IPD, Bed Mgmt,\nBilling, EHR, MRD"),
    ("🧪", "Labs", "Orders, Samples,\nResults, Inventory"),
    ("💊", "Pharmacies", "POS, Inventory,\nBatch Tracking, Orders"),
    ("🏢", "Corporates", "Wellness Programs,\nHealth Analytics, Plans"),
]
for i, (icon, title, desc) in enumerate(stakeholders):
    x = Inches(0.5 + i * 2.1)
    y = Inches(4.0)
    add_icon_card(slide, x, y, Inches(1.9), Inches(2.6), icon, title, desc, bg_color=DARK_CARD, icon_color=TEAL_LIGHT)


# ════════════════════════════════════════════
# SLIDE 4 — PATIENT FEATURES
# ════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_slide_bg(slide, DARK_BG)
add_section_header(slide, "Patient Experience", "Empowering patients with digital-first healthcare")

patient_features = [
    ("🤖", "AI Doctor", "24/7 AI health assistant\nSymptom analysis & triage\nMulti-language support"),
    ("📹", "Video Consult", "HD video consultations\nChat & audio calls\nRecording & audit trail"),
    ("❤️", "Health Dashboard", "Real-time vitals tracking\nWearable integration\nAI health insights"),
    ("📊", "Health Intelligence", "Health Risk Assessment\nPersonalized analytics\nPredictive insights"),
    ("🏆", "Wellness", "Gamified challenges\nDiet & nutrition plans\nWellness calendar"),
    ("📄", "Health Records", "OCR report scanning\nABDM/ABHA integration\nCloud document storage"),
    ("💳", "Digital Wallet", "Health Coins (1 HC = ₹1)\nMembership plans\nFamily account support"),
    ("🚑", "Emergency", "24/7 triage & dispatch\nAmbulance tracking\nDoctor dispatch"),
]

for i, (icon, title, desc) in enumerate(patient_features):
    col = i % 4
    row = i // 4
    x = Inches(0.5 + col * 3.1)
    y = Inches(2.0 + row * 2.6)
    add_icon_card(slide, x, y, Inches(2.8), Inches(2.3), icon, title, desc)


# ════════════════════════════════════════════
# SLIDE 5 — DOCTOR & CLINICAL FEATURES
# ════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_slide_bg(slide, DARK_BG)
add_section_header(slide, "Doctor & Clinical Tools", "AI-augmented clinical workflows for better outcomes")

doctor_features = [
    ("🎙️", "AI Scribe", "Offline speech-to-text\nAuto clinical notes\nWhisper + custom LLM\nNo cloud dependency"),
    ("🧠", "CDSS", "Drug interaction alerts\nICD-10 auto-coding\nDifferential diagnosis\nClinical guidelines"),
    ("👁️", "AI Vision", "Clinical image analysis\nDermatology support\nDiagnostic assistance\nReal-time insights"),
    ("📝", "Smart Prescriptions", "Digital prescriptions\nTemplate library\nDrug database integration\nE-prescription sharing"),
    ("📋", "EMR / EHR", "Electronic Medical Records\nPatient history timeline\nVitals & notes\nDocument templates"),
    ("📊", "RPM Dashboard", "Remote Patient Monitoring\nChronic disease mgmt\nReal-time vitals alerts\nTrend analysis"),
]

for i, (icon, title, desc) in enumerate(doctor_features):
    col = i % 3
    row = i // 3
    x = Inches(0.8 + col * 4.0)
    y = Inches(2.0 + row * 2.8)
    add_icon_card(slide, x, y, Inches(3.6), Inches(2.5), icon, title, desc)


# ════════════════════════════════════════════
# SLIDE 6 — HOSPITAL & ENTERPRISE
# ════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_slide_bg(slide, DARK_BG)
add_section_header(slide, "Hospital & Enterprise Management", "30+ modules for end-to-end hospital operations")

hospital_modules = [
    ("🏥", "OPD / IPD", "Outpatient & inpatient\nAdmission workflows\nDischarge summaries"),
    ("🛏️", "Bed Management", "Real-time bed tracking\nWard management\nOccupancy analytics"),
    ("💰", "Billing & Finance", "Insurance billing\nClaims dashboard\nPayment processing"),
    ("👥", "Staff Management", "Doctors, nurses, staff\nScheduling & shifts\nPerformance tracking"),
    ("🧪", "Lab & Imaging", "Order management\nResult integration\nSample tracking"),
    ("💊", "Pharmacy Integration", "POS system\nInventory management\nExpiry tracking"),
    ("📊", "Analytics & MRD", "Revenue analytics\nMedical Records Dept\nCompliance reports"),
    ("📡", "Communication Hub", "Team chat\nWhatsApp integration\nEmail & SMS alerts"),
]
for i, (icon, title, desc) in enumerate(hospital_modules):
    col = i % 4
    row = i // 4
    x = Inches(0.5 + col * 3.1)
    y = Inches(2.0 + row * 2.6)
    add_icon_card(slide, x, y, Inches(2.8), Inches(2.3), icon, title, desc)


# ════════════════════════════════════════════
# SLIDE 7 — AI CAPABILITIES (Differentiator)
# ════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_slide_bg(slide, DARK_BG)
add_section_header(slide, "AI-First Healthcare", "9 integrated AI capabilities that set Mediqzy apart")

ai_features = [
    ("AI Scribe", "Offline speech-to-text clinical\nnote generation (Whisper.cpp +\ncustom GGUF model)", TEAL),
    ("AI Doctor", "24/7 GPT/Gemini/Claude-\npowered health assistant for\npatients", EMERALD),
    ("CDSS", "Clinical Decision Support —\ndrug interactions, ICD-10,\ndifferential diagnosis", BLUE),
    ("AI Vision", "Clinical image analysis for\ndermatology & diagnostic\nassistance", PURPLE),
    ("Health Intelligence", "ML-based health predictions,\nrisk scoring & personalized\ninsights", ORANGE),
    ("AI Brain", "Embeddings-based medical\nknowledge retrieval &\ncontextual answers", ROSE),
    ("Health Risk Assessment", "5-minute AI-powered\npersonalized health risk\nscoring system", AMBER),
    ("AI Analytics", "Platform-wide business\nintelligence & operations\nanalytics", TEAL_LIGHT),
    ("Voice Navigation", "Speech recognition for\nhands-free app navigation\nacross all portals", BLUE),
]
for i, (title, desc, accent) in enumerate(ai_features):
    col = i % 3
    row = i // 3
    x = Inches(0.8 + col * 4.0)
    y = Inches(1.8 + row * 1.85)
    card = add_shape(slide, x, y, Inches(3.6), Inches(1.6), DARK_CARD, radius=True)
    # Accent left bar
    add_shape(slide, x + Inches(0.05), y + Inches(0.15), Inches(0.05), Inches(1.3), accent)
    add_text(slide, x + Inches(0.3), y + Inches(0.15), Inches(3.0), Inches(0.35),
             title, font_size=15, color=accent, bold=True)
    add_text(slide, x + Inches(0.3), y + Inches(0.55), Inches(3.0), Inches(1.0),
             desc, font_size=11, color=GRAY)


# ════════════════════════════════════════════
# SLIDE 8 — TELEMEDICINE
# ════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_slide_bg(slide, DARK_BG)
add_section_header(slide, "Telemedicine & Virtual Care", "Seamless video, audio, and chat consultations")

# Left side - description
add_text(slide, Inches(0.8), Inches(2.0), Inches(5.5), Inches(0.6),
         "Enterprise-Grade Video Consultations", font_size=22, color=WHITE, bold=True)

tele_items = [
    "Self-hosted LiveKit server — Full data sovereignty",
    "HD video + audio + real-time chat consultations",
    "HIPAA-compliant recording & audit trails",
    "Agora RTC as backup — Zero downtime guarantee",
    "Integrated payment via Health Coins or membership",
    "Works on desktop & mobile browsers (PWA)",
    "Appointment scheduling with automated reminders",
    "Email + WhatsApp + SMS notification system",
]
add_bullet_list(slide, Inches(0.8), Inches(2.7), Inches(5.5), Inches(4.0), tele_items, font_size=14, color=LIGHT_GRAY)

# Right side - stats cards
tele_stats = [
    ("🔒", "HIPAA Compliant", "End-to-end encryption\nAudit trail logging\nConsent management"),
    ("🌐", "Self-Hosted", "LiveKit v1.9.11 server\nNo third-party data sharing\nFull control over infra"),
    ("📱", "Multi-Channel", "Video, Audio, Chat\nWhatsApp integration\nSMS & Email alerts"),
    ("⚡", "Low Latency", "WebSocket signaling\nCloudflare CDN\nGlobal edge network"),
]
for i, (icon, title, desc) in enumerate(tele_stats):
    col = i % 2
    row = i // 2
    x = Inches(7.0 + col * 3.1)
    y = Inches(2.0 + row * 2.6)
    add_icon_card(slide, x, y, Inches(2.8), Inches(2.3), icon, title, desc)


# ════════════════════════════════════════════
# SLIDE 9 — RIS / PACS TELE-RADIOLOGY
# ════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_slide_bg(slide, DARK_BG)
add_section_header(slide, "RIS / PACS — Tele-Radiology", "End-to-end radiology workflow with remote diagnostic capabilities")

# Left side — description
add_text(slide, Inches(0.8), Inches(2.0), Inches(5.5), Inches(0.6),
         "Radiology Information & Imaging System", font_size=22, color=WHITE, bold=True)

ris_items = [
    "Radiology Information System (RIS) — order-to-report workflow",
    "PACS viewer — DICOM image viewing, annotation & sharing",
    "Tele-radiology — remote specialist reads with SLA tracking",
    "DICOM / HL7 / FHIR standards compliance",
    "AI-assisted image analysis & auto-flagging of abnormalities",
    "Structured radiology reporting with templates & macros",
    "Multi-modality support — X-Ray, CT, MRI, Ultrasound, Mammography",
    "Integrated ordering from OPD / IPD / ER with priority tagging",
]
add_bullet_list(slide, Inches(0.8), Inches(2.7), Inches(5.5), Inches(4.0), ris_items, font_size=14, color=LIGHT_GRAY)

# Right side — feature cards
ris_cards = [
    ("🩻", "PACS Viewer", "DICOM image viewer\nZoom, pan, measure tools\nMulti-frame & 3D MPR\nOnline & offline viewing"),
    ("📡", "Tele-Radiology", "Remote specialist reads\nSLA-based TAT tracking\nPriority escalation\nSecond opinion workflow"),
    ("🤖", "AI-Assisted Reads", "Auto-detection of anomalies\nPriority flagging for urgents\nStructured AI annotations\nContinuous learning model"),
    ("📋", "Structured Reports", "Specialty-wise templates\nVoice-to-text dictation\nAuto-populated findings\nDigital signature & sharing"),
]
for i, (icon, title, desc) in enumerate(ris_cards):
    col = i % 2
    row = i // 2
    x = Inches(7.0 + col * 3.1)
    y = Inches(2.0 + row * 2.6)
    add_icon_card(slide, x, y, Inches(2.8), Inches(2.3), icon, title, desc)


# ════════════════════════════════════════════
# SLIDE 10 — IoT PATIENT MONITORING
# ════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_slide_bg(slide, DARK_BG)
add_section_header(slide, "IoT Patient Monitoring", "Real-time vitals & remote patient monitoring with connected devices")

iot_features = [
    ("❤️", "Vital Signs Monitoring", "Heart rate, SpO2, BP, temp\nECG & respiratory rate\nReal-time streaming\nCustomizable alert thresholds"),
    ("📟", "Connected Devices", "Pulse oximeters & BP monitors\nGlucometers & weight scales\nECG patches & wearable sensors\nBluetooth / Wi-Fi / cellular"),
    ("🔔", "Smart Alerting", "Abnormal vitals auto-alert\nEscalation to doctor/nurse\nSMS, WhatsApp, push alerts\nCritical value protocols"),
    ("📊", "Analytics Dashboard", "Trend analysis & baselines\nPredictive deterioration score\nPatient cohort comparison\nExportable clinical reports"),
    ("🏠", "Remote Monitoring", "Home-based RPM programs\nChronic disease management\nPost-discharge follow-up\nCaregiver & family access"),
    ("🏥", "Bedside Integration", "ICU / ward live monitors\nNurse station dashboards\nEMR auto-documentation\nDevice fleet management"),
]

for i, (icon, title, desc) in enumerate(iot_features):
    col = i % 3
    row = i // 3
    x = Inches(0.8 + col * 4.0)
    y = Inches(2.0 + row * 2.7)
    add_icon_card(slide, x, y, Inches(3.6), Inches(2.4), icon, title, desc)

# Bottom highlight bar
add_shape(slide, Inches(0.5), Inches(6.8), Inches(12.3), Inches(0.5), RGBColor(0x0D, 0x3B, 0x3B), radius=True)
add_text(slide, Inches(0.5), Inches(6.85), Inches(12.3), Inches(0.4),
         "🔗  Seamless integration with 10+ wearable brands: Apple Watch · Samsung · Fitbit · Garmin · Oura · Withings · Omron · Xiaomi",
         font_size=13, color=TEAL_LIGHT, alignment=PP_ALIGN.CENTER)


# ════════════════════════════════════════════
# SLIDE 11 — INSURANCE ECOSYSTEM
# ════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_slide_bg(slide, DARK_BG)
add_section_header(slide, "Insurance & Corporate Wellness", "Complete insurance pipeline & enterprise health management")

# Insurance flow
add_text(slide, Inches(0.8), Inches(2.0), Inches(12), Inches(0.5),
         "End-to-End Insurance Flow", font_size=20, color=WHITE, bold=True)

flow_items = ["Hospital", "TPA", "Insurer", "Broker", "Corporate"]
for i, item in enumerate(flow_items):
    x = Inches(0.8 + i * 2.5)
    card = add_shape(slide, x, Inches(2.7), Inches(2.0), Inches(0.7), TEAL if i % 2 == 0 else DARK_CARD, radius=True)
    add_text(slide, x, Inches(2.78), Inches(2.0), Inches(0.5),
             item, font_size=14, color=WHITE, bold=True, alignment=PP_ALIGN.CENTER)
    if i < len(flow_items) - 1:
        add_text(slide, x + Inches(2.0), Inches(2.78), Inches(0.5), Inches(0.5),
                 "→", font_size=20, color=TEAL, alignment=PP_ALIGN.CENTER)

# Corporate features
corp_cards = [
    ("🏢", "Corporate Portal", "Employee health management\nBenefits administration\nWorkforce analytics\nDepartment-wise reports"),
    ("📊", "Health Analytics", "Workforce health scoring\nRisk assessment\nCompliance tracking\nGamified wellness"),
    ("🛡️", "TPA Portal", "Claims management\nPre-authorization\nProvider network mgmt\nE-cards & heritage integration"),
    ("📋", "Insurance Broker", "Policy management\nCommission tracking\nCorporate client mgmt\nAnalytics & reporting"),
]
for i, (icon, title, desc) in enumerate(corp_cards):
    x = Inches(0.5 + i * 3.2)
    add_icon_card(slide, x, Inches(4.0), Inches(2.9), Inches(2.8), icon, title, desc)


# ════════════════════════════════════════════
# SLIDE 10 — COMPLIANCE & SECURITY
# ════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_slide_bg(slide, DARK_BG)
add_section_header(slide, "Compliance & Security", "Built for healthcare-grade data protection")

compliance_items = [
    ("🔒", "HIPAA Compliance", "Full audit trails & access logging\nData encryption at rest & in transit\nRetention policies & consent management\nRole-based access control (RBAC)", TEAL),
    ("🆔", "ABDM / ABHA", "Ayushman Bharat Digital Mission\n14-digit ABHA Health ID\nHealth information exchange\nDigital health records standard", EMERALD),
    ("🏷️", "ICD-10 Coding", "50+ condition auto-mapping\nStandardized diagnosis codes\nClinical terminology alignment\nGlobal healthcare interoperability", BLUE),
    ("🏗️", "Multi-Tenant (RLS)", "PostgreSQL Row-Level Security\nComplete tenant data isolation\nCustom domain per tenant\nModule-level access control", PURPLE),
]

for i, (icon, title, desc, accent) in enumerate(compliance_items):
    x = Inches(0.5 + i * 3.2)
    card = add_shape(slide, x, Inches(2.2), Inches(2.9), Inches(3.5), DARK_CARD, radius=True)
    # Accent top bar
    add_shape(slide, x + Inches(0.1), Inches(2.25), Inches(2.7), Inches(0.05), accent)
    add_text(slide, x + Inches(0.3), Inches(2.5), Inches(0.6), Inches(0.6),
             icon, font_size=28, alignment=PP_ALIGN.LEFT, font_name="Segoe UI Emoji", color=accent)
    add_text(slide, x + Inches(0.3), Inches(3.1), Inches(2.4), Inches(0.35),
             title, font_size=16, color=WHITE, bold=True)
    add_text(slide, x + Inches(0.3), Inches(3.55), Inches(2.4), Inches(2.0),
             desc, font_size=12, color=GRAY)

# Bottom statement
add_shape(slide, Inches(0.5), Inches(6.0), Inches(12.3), Inches(0.8), RGBColor(0x0D, 0x3B, 0x3B), radius=True)
add_text(slide, Inches(0.5), Inches(6.1), Inches(12.3), Inches(0.6),
         "🔐  Enterprise-grade security with zero-trust architecture, encrypted communications, and complete audit trails",
         font_size=14, color=TEAL_LIGHT, alignment=PP_ALIGN.CENTER)


# ════════════════════════════════════════════
# SLIDE 11 — TECHNOLOGY STACK
# ════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_slide_bg(slide, DARK_BG)
add_section_header(slide, "Technology Stack", "Modern, scalable, and production-proven architecture")

tech_sections = [
    ("Frontend", [
        "React 18 + TypeScript + Vite",
        "Tailwind CSS + Shadcn/UI (Radix)",
        "Framer Motion animations",
        "TanStack Query + Zustand",
        "Recharts + Chart.js analytics",
    ], TEAL),
    ("Backend", [
        "Node.js + Express.js",
        "PostgreSQL + Sequelize ORM",
        "Redis (caching + queues)",
        "DuckDB (fast analytics)",
        "BullMQ task queues",
    ], EMERALD),
    ("Real-Time", [
        "Socket.IO (WebSocket)",
        "Apache Kafka (event streaming)",
        "LiveKit (video/audio)",
        "FCM push notifications",
        "WhatsApp Business API",
    ], BLUE),
    ("AI / ML", [
        "OpenAI GPT / Anthropic Claude",
        "Google Gemini / Groq",
        "Whisper.cpp (speech-to-text)",
        "Custom GGUF LLM models",
        "Tesseract.js (OCR)",
    ], PURPLE),
]

for i, (title, items, accent) in enumerate(tech_sections):
    x = Inches(0.5 + i * 3.2)
    card = add_shape(slide, x, Inches(2.2), Inches(2.9), Inches(3.8), DARK_CARD, radius=True)
    add_shape(slide, x + Inches(0.1), Inches(2.25), Inches(2.7), Inches(0.05), accent)
    add_text(slide, x + Inches(0.3), Inches(2.5), Inches(2.4), Inches(0.4),
             title, font_size=18, color=accent, bold=True)
    add_bullet_list(slide, x + Inches(0.2), Inches(3.0), Inches(2.5), Inches(2.8),
                    items, font_size=11, color=LIGHT_GRAY, spacing=Pt(4))

# Infrastructure row
infra_items = [
    ("☁️ AWS S3", "Frontend hosting"), ("⚡ PM2 Cluster", "Backend process mgmt"),
    ("🌐 Cloudflare", "CDN & DDoS protection"), ("📊 Prometheus + Grafana", "Monitoring"),
    ("🔑 JWT + OAuth2", "Authentication"), ("💳 Razorpay + Stripe", "Payments"),
]
for i, (title, desc) in enumerate(infra_items):
    x = Inches(0.5 + i * 2.1)
    card = add_shape(slide, x, Inches(6.3), Inches(1.9), Inches(0.9), DARK_CARD, radius=True)
    add_text(slide, x + Inches(0.1), Inches(6.35), Inches(1.7), Inches(0.35),
             title, font_size=10, color=WHITE, bold=True, alignment=PP_ALIGN.CENTER)
    add_text(slide, x + Inches(0.1), Inches(6.7), Inches(1.7), Inches(0.3),
             desc, font_size=9, color=GRAY, alignment=PP_ALIGN.CENTER)


# ════════════════════════════════════════════
# SLIDE 12 — PRICING
# ════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_slide_bg(slide, DARK_BG)
add_section_header(slide, "Pricing Plans", "Flexible plans for individuals and enterprises")

# Personal plans
add_text(slide, Inches(0.8), Inches(1.8), Inches(5), Inches(0.4),
         "PERSONAL PLANS", font_size=14, color=TEAL, bold=True)

personal_plans = [
    ("Free Basic", "₹0", "/lifetime", "Referral-based signup\n2 video · 3 audio · 5 chats/mo\nBasic health dashboard", False),
    ("Basic", "₹199", "/month", "5 video · 10 audio · 20 chats\nAI Scribe (5/mo)\n20% coin bonus", False),
    ("Premium", "₹499", "/month", "Unlimited consultations\nPriority booking\nDedicated health manager\n50% coin bonus · 15% lab discount", True),
    ("Enterprise", "₹999", "/month", "Concierge service\nGenetic testing · Fitness coach\nMental health · Travel insurance\n100% coin bonus", False),
]

for i, (name, price, period, features, highlighted) in enumerate(personal_plans):
    x = Inches(0.5 + i * 3.15)
    bg = TEAL_DARK if highlighted else DARK_CARD
    card = add_shape(slide, x, Inches(2.3), Inches(2.9), Inches(3.2), bg, radius=True)
    if highlighted:
        add_shape(slide, x + Inches(0.7), Inches(2.35), Inches(1.5), Inches(0.25), EMERALD, radius=True)
        add_text(slide, x + Inches(0.7), Inches(2.33), Inches(1.5), Inches(0.25),
                 "POPULAR", font_size=8, color=WHITE, bold=True, alignment=PP_ALIGN.CENTER)
    add_text(slide, x + Inches(0.3), Inches(2.7), Inches(2.4), Inches(0.35),
             name, font_size=16, color=WHITE, bold=True)
    add_rich_text(slide, x + Inches(0.3), Inches(3.1), Inches(2.4), Inches(0.5), [
        {"text": price, "size": 28, "color": TEAL_LIGHT if not highlighted else WHITE, "bold": True},
        {"text": period, "size": 12, "color": GRAY},
    ])
    add_text(slide, x + Inches(0.3), Inches(3.7), Inches(2.3), Inches(1.6),
             features, font_size=11, color=LIGHT_GRAY if not highlighted else WHITE)

# Corporate plans row
add_text(slide, Inches(0.8), Inches(5.8), Inches(5), Inches(0.4),
         "CORPORATE PLANS  (per employee)", font_size=14, color=TEAL, bold=True)

corp_plans = [
    ("Corporate Basic", "₹149/emp/mo", "₹1,499/yr"),
    ("Corporate Premium", "₹299/emp/mo", "₹2,999/yr"),
    ("Corporate Enterprise", "Custom", "Custom"),
]
for i, (name, monthly, annual) in enumerate(corp_plans):
    x = Inches(0.5 + i * 4.2)
    card = add_shape(slide, x, Inches(6.2), Inches(3.8), Inches(1.0), DARK_CARD, radius=True)
    add_text(slide, x + Inches(0.2), Inches(6.25), Inches(1.6), Inches(0.35),
             name, font_size=12, color=WHITE, bold=True)
    add_text(slide, x + Inches(2.0), Inches(6.25), Inches(1.6), Inches(0.35),
             monthly, font_size=12, color=TEAL_LIGHT, bold=True, alignment=PP_ALIGN.RIGHT)
    add_text(slide, x + Inches(0.2), Inches(6.65), Inches(3.4), Inches(0.3),
             f"Annual: {annual}", font_size=10, color=GRAY)


# ════════════════════════════════════════════
# SLIDE 13 — MULTI-PORTAL ECOSYSTEM
# ════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_slide_bg(slide, DARK_BG)
add_section_header(slide, "Multi-Portal Ecosystem", "12+ dedicated portals serving every healthcare stakeholder")

portals = [
    ("👤", "Patient", "Health dashboard, AI Doctor,\nconsultations, records", TEAL),
    ("👨‍⚕️", "Doctor", "EMR, AI Scribe, CDSS,\nprescriptions, video", EMERALD),
    ("👩‍⚕️", "Nurse", "Vitals recording, medications,\npatient notes", BLUE),
    ("📋", "Assistant", "Patient registration, billing,\nappointments", PURPLE),
    ("🏥", "Hospital", "30+ modules: OPD/IPD,\nbeds, billing, EHR", ROSE),
    ("🏪", "Clinic", "Queue mgmt, consultations,\nprescriptions, billing", ORANGE),
    ("🧪", "Lab", "Test catalog, samples,\nresults, inventory", TEAL),
    ("💊", "Pharmacy", "POS, inventory, batch\ntracking, orders", EMERALD),
    ("🚑", "Ambulance", "Live tracking, dispatch,\nfleet management", BLUE),
    ("🏠", "Homecare", "Care plans, scheduling,\npatient management", PURPLE),
    ("🏢", "Corporate", "Wellness programs, health\nanalytics, compliance", ORANGE),
    ("⚙️", "Admin", "50+ modules, CRM, tenant\nmgmt, analytics", ROSE),
]

for i, (icon, title, desc, accent) in enumerate(portals):
    col = i % 6
    row = i // 6
    x = Inches(0.4 + col * 2.1)
    y = Inches(2.0 + row * 2.7)
    card = add_shape(slide, x, y, Inches(1.9), Inches(2.3), DARK_CARD, radius=True)
    add_shape(slide, x + Inches(0.05), y + Inches(0.05), Inches(1.8), Inches(0.04), accent)
    add_text(slide, x + Inches(0.2), y + Inches(0.2), Inches(0.5), Inches(0.5),
             icon, font_size=24, font_name="Segoe UI Emoji", color=accent)
    add_text(slide, x + Inches(0.2), y + Inches(0.7), Inches(1.5), Inches(0.3),
             title, font_size=14, color=WHITE, bold=True)
    add_text(slide, x + Inches(0.2), y + Inches(1.1), Inches(1.5), Inches(1.0),
             desc, font_size=10, color=GRAY)


# ════════════════════════════════════════════
# SLIDE 14 — WEARABLE & INTEGRATIONS
# ════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_slide_bg(slide, DARK_BG)
add_section_header(slide, "Integrations & Wearables", "Connected healthcare ecosystem with 20+ integrations")

integration_groups = [
    ("Wearable Devices", [
        "Apple Watch / Apple Health",
        "Samsung Health / Galaxy Watch",
        "Fitbit / Google Fit",
        "Oura Ring",
        "Garmin Connect",
        "Xiaomi / Mi Band",
        "Withings / Omron",
    ], "⌚", TEAL),
    ("Payment & Finance", [
        "Razorpay (payment gateway)",
        "Stripe (international payments)",
        "Health Coins digital wallet",
        "Insurance claims processing",
        "Corporate billing",
    ], "💳", EMERALD),
    ("Communication", [
        "WhatsApp Business API",
        "Twilio (SMS & Voice)",
        "SendGrid (Email)",
        "Firebase Cloud Messaging",
        "Socket.IO real-time chat",
    ], "📡", BLUE),
    ("AI & Analytics", [
        "OpenAI GPT-4",
        "Google Gemini",
        "Anthropic Claude",
        "Groq (fast inference)",
        "Whisper.cpp (STT)",
        "Tesseract.js (OCR)",
    ], "🤖", PURPLE),
]

for i, (title, items, icon, accent) in enumerate(integration_groups):
    x = Inches(0.5 + i * 3.15)
    card = add_shape(slide, x, Inches(2.0), Inches(2.9), Inches(4.8), DARK_CARD, radius=True)
    add_shape(slide, x + Inches(0.1), Inches(2.05), Inches(2.7), Inches(0.05), accent)
    add_text(slide, x + Inches(0.3), Inches(2.2), Inches(0.5), Inches(0.5),
             icon, font_size=24, font_name="Segoe UI Emoji", color=accent)
    add_text(slide, x + Inches(0.8), Inches(2.3), Inches(1.8), Inches(0.3),
             title, font_size=14, color=WHITE, bold=True)
    add_bullet_list(slide, x + Inches(0.2), Inches(2.8), Inches(2.5), Inches(3.8),
                    items, font_size=11, color=LIGHT_GRAY, spacing=Pt(3))


# ════════════════════════════════════════════
# SLIDE 15 — WHY MEDIQZY
# ════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_slide_bg(slide, DARK_BG)
add_section_header(slide, "Why Mediqzy?", "Key differentiators that make us the preferred choice")

differentiators = [
    ("1", "All-in-One Platform", "Single unified system replacing 10+ fragmented\ntools — from patient engagement to hospital\noperations, labs, pharmacy, and insurance.", TEAL),
    ("2", "AI-First Approach", "9 integrated AI capabilities including offline\nAI Scribe, CDSS, AI Vision — not bolt-on features\nbut core to every workflow.", EMERALD),
    ("3", "RIS / PACS Tele-Radiology", "Full radiology workflow — DICOM viewer, tele-\nradiology with SLA tracking, AI-assisted reads,\nstructured reporting & multi-modality support.", BLUE),
    ("4", "IoT Patient Monitoring", "Connected device ecosystem for real-time vitals\nmonitoring — ICU bedside, RPM at home, smart\nalerts, predictive deterioration scoring.", PURPLE),
    ("5", "India-Ready Compliance", "Native ABDM/ABHA, ICD-10, DICOM/HL7/FHIR,\nHIPAA-grade security — built for Indian and\nglobal healthcare regulations.", ORANGE),
    ("6", "White-Label SaaS", "Multi-tenant architecture with PostgreSQL RLS,\ncustom domains, module-level access control —\nperfect for healthcare aggregators.", ROSE),
]

for i, (num, title, desc, accent) in enumerate(differentiators):
    col = i % 3
    row = i // 3
    x = Inches(0.8 + col * 4.0)
    y = Inches(2.0 + row * 2.7)
    card = add_shape(slide, x, y, Inches(3.6), Inches(2.4), DARK_CARD, radius=True)
    # Number badge
    badge = add_shape(slide, x + Inches(0.2), y + Inches(0.2), Inches(0.45), Inches(0.45), accent, radius=True)
    add_text(slide, x + Inches(0.2), y + Inches(0.22), Inches(0.45), Inches(0.4),
             num, font_size=18, color=WHITE, bold=True, alignment=PP_ALIGN.CENTER)
    add_text(slide, x + Inches(0.8), y + Inches(0.25), Inches(2.5), Inches(0.35),
             title, font_size=16, color=WHITE, bold=True)
    add_text(slide, x + Inches(0.3), y + Inches(0.85), Inches(3.0), Inches(1.3),
             desc, font_size=12, color=GRAY)


# ════════════════════════════════════════════
# SLIDE 16 — CONTACT / CTA
# ════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_slide_bg(slide, DARK_BG)

# Decorative circles
circle = slide.shapes.add_shape(MSO_SHAPE.OVAL, Inches(9.5), Inches(-1.5), Inches(5), Inches(5))
circle.fill.solid()
circle.fill.fore_color.rgb = RGBColor(0x0D, 0x3B, 0x3B)
circle.line.fill.background()

circle2 = slide.shapes.add_shape(MSO_SHAPE.OVAL, Inches(-2), Inches(5), Inches(5), Inches(5))
circle2.fill.solid()
circle2.fill.fore_color.rgb = RGBColor(0x0D, 0x2E, 0x3B)
circle2.line.fill.background()

# Logo
if os.path.exists(LOGO_PATH):
    slide.shapes.add_picture(LOGO_PATH, Inches(5.4), Inches(0.8), Inches(2.5), Inches(2.5))

# Title
add_text(slide, Inches(2), Inches(3.3), Inches(9.3), Inches(0.8),
         "Ready to Transform Healthcare?", font_size=40, color=WHITE, bold=True, alignment=PP_ALIGN.CENTER)

add_text(slide, Inches(2), Inches(4.1), Inches(9.3), Inches(0.6),
         "Join the future of AI-powered healthcare management", font_size=20, color=TEAL_LIGHT, alignment=PP_ALIGN.CENTER)

# CTA button
cta = add_shape(slide, Inches(4.8), Inches(5.0), Inches(3.7), Inches(0.7), TEAL, radius=True)
add_text(slide, Inches(4.8), Inches(5.05), Inches(3.7), Inches(0.6),
         "Schedule a Demo →", font_size=18, color=WHITE, bold=True, alignment=PP_ALIGN.CENTER)

# Contact info
contact_items = [
    ("🌐  app.mediqzy.com", TEAL_LIGHT),
    ("📧  support@mediqzy.com", LIGHT_GRAY),
    ("🐦  @mediqzy", LIGHT_GRAY),
]
for i, (text, color) in enumerate(contact_items):
    add_text(slide, Inches(2), Inches(6.0 + i * 0.4), Inches(9.3), Inches(0.4),
             text, font_size=14, color=color, alignment=PP_ALIGN.CENTER, font_name="Segoe UI Emoji")

# Copyright
add_text(slide, Inches(0), Inches(7.1), Inches(13.33), Inches(0.3),
         "© 2026 Mediqzy Healthcare. All rights reserved.", font_size=10, color=GRAY, alignment=PP_ALIGN.CENTER)


# ════════════════════════════════════════════
# SAVE
# ════════════════════════════════════════════
output_path = os.path.join(os.path.dirname(__file__), "Mediqzy_Marketing_Deck.pptx")
prs.save(output_path)
print(f"\n✅ Marketing deck saved to: {output_path}")
print(f"   Slides: {len(prs.slides)}")
print(f"   Format: Widescreen 16:9 (13.33\" × 7.5\")")
