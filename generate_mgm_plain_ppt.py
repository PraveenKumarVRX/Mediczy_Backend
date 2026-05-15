"""
Mediqzy Hospital OS — MGM Proposal (Plain Text PPT, no styling)
"""
from pptx import Presentation
from pptx.util import Inches, Pt

prs = Presentation()
prs.slide_width  = Inches(13.33)
prs.slide_height = Inches(7.5)

BLANK = prs.slide_layouts[6]

def slide(title, *body_sections):
    """Add a plain slide: bold title at top, body as plain text below."""
    sl = prs.slides.add_slide(BLANK)

    # Title
    tb = sl.shapes.add_textbox(Inches(0.3), Inches(0.2), Inches(12.7), Inches(0.7))
    tf = tb.text_frame
    p  = tf.paragraphs[0]
    r  = p.add_run()
    r.text = title
    r.font.size = Pt(22)
    r.font.bold = True

    # Body — each section is a list of strings
    y = 0.95
    for section in body_sections:
        tb2 = sl.shapes.add_textbox(Inches(0.3), Inches(y), Inches(12.7), Inches(7.5 - y - 0.1))
        tb2.word_wrap = True
        tf2 = tb2.text_frame
        tf2.word_wrap = True
        for i, line in enumerate(section):
            p2 = tf2.paragraphs[0] if i == 0 else tf2.add_paragraph()
            r2 = p2.add_run()
            r2.text = line
            r2.font.size = Pt(11)
        y += len(section) * 0.18 + 0.1
    return sl


# ── SLIDE 1: Cover ────────────────────────────────────────────────────────────
slide("Mediqzy Hospital OS — Proposal for MGM Hospitals",
      ["India's AI-Powered Hospital Management Information System (HMIS)",
       "",
       "Prepared by: Mediqzy Healthcare Technologies Pvt. Ltd.",
       "For: MGM Hospitals Group",
       "Date: May 2025",
       "Contact: info@mysmarthealth.in | mediqzy.com | app.mediqzy.com",
       "",
       "This presentation covers the complete Mediqzy Hospital OS platform:",
       "all portals, logins, modules, department systems, and patient-facing features."])


# ── SLIDE 2: Platform Summary ─────────────────────────────────────────────────
slide("Platform Overview",
      ["Mediqzy Hospital OS is a unified, AI-first healthcare management platform built for",
       "Indian multi-specialty hospitals. It covers every workflow from patient registration",
       "to discharge, billing, insurance, and clinical decision support.",
       "",
       "Total Portals / Login Types: 41",
       "Total Modules / Pages: 300+",
       "Deployment: On-premise, Private Cloud, or SaaS",
       "Compliance: ABDM, NABH, NHCX, IRDAI, DPDP, Ayushman Bharat, GST",
       "AI Engine: iSHA (clinical AI) + Dr. ISHA (patient chatbot)",
       "Mobile: iOS App, Android App, PWA, WhatsApp Automation",
       "Offline: Works offline in wards, syncs on reconnect",
       "Multi-site: Central dashboards + per-site operations for hospital groups"])


# ── SLIDE 3: All Logins / Portals List ───────────────────────────────────────
slide("Complete Login & Portal List (41 Portals)",
      ["--- Clinical / Care Portals ---",
       "1.  Patient Portal            /login",
       "2.  Doctor Portal             /doctor/login",
       "3.  Nurse Portal              /nurse/login",
       "4.  Assistant Portal          /assistant/login",
       "5.  Hospital Portal           /hospital/login",
       "6.  Clinic Portal             /clinic/login",
       "7.  ICU Portal                /icu/login",
       "8.  OT (Operation Theatre)    /ot/login",
       "9.  Homecare Portal           /homecare/login",
       "10. Ambulance Portal          /ambulance/login",
       "",
       "--- Diagnostics & Support ---",
       "11. Lab Portal                /lab/login",
       "12. Pharmacy Portal           /pharmacy/login",
       "13. MRD Portal                /mrd/login",
       "14. Insurance Desk            /insurance-desk/login",
       "",
       "--- Administration & Finance ---",
       "15. Admin Portal              /admin/login",
       "16. Team / Super-Admin        /team/login",
       "17. Accounts Portal           /accounts/login",
       "18. HR Portal                 /hr/login",
       "19. IT / EDP Portal           /it-edp/login",
       "20. Security Portal           /security/login",
       "21. Quality Portal            /quality/login"])


slide("Complete Login & Portal List (continued)",
      ["--- Insurance & Finance Ecosystem ---",
       "22. Corporate Portal          /corporate/login",
       "23. TPA Portal                /tpa/login",
       "24. Aggregator Portal         /aggregator/login",
       "25. Hospital Insurance Portal /hospital-insurance/login",
       "26. Insurance Broker          /intermediary/login",
       "27. Insurer Portal            /insurer/login",
       "28. PSU Portal                /psu/login",
       "29. NGO Portal                /ngo/login",
       "30. CRM Portal                /crm/login",
       "",
       "--- Hospital Department Portals (Staff Login) ---",
       "31. Asset Department          /asset/login",
       "32. Biomedical Department     /biomedical/login",
       "33. Blood Bank                /blood-bank/login",
       "34. Consent Department        /consent/login",
       "35. CSSD Department           /cssd/login",
       "36. Dietary Department        /dietary/login",
       "37. Finance Department        /finance/login",
       "38. Infection Control         /infection-control/login",
       "39. Mortuary Department       /mortuary/login",
       "40. Procurement Department    /procurement/login",
       "41. Queue Management          /queue/login",
       "    Patient Self-Reg Kiosk    /queue/kiosk  (public, no login)"])


# ── SLIDE 5: Doctor Portal ────────────────────────────────────────────────────
slide("Doctor Portal — Modules",
      ["Login: /doctor/login",
       "",
       "Dashboard, Home (Mobile View)",
       "Appointments — schedule, slots, availability settings",
       "Patients — list, EMR / health records per patient",
       "Prescriptions — create, view, manage",
       "Triage — patient triage and prioritization",
       "Video Consultation — live video with patients",
       "Chat — doctor-patient messaging",
       "Voice Scribe — AI voice-to-text clinical notes",
       "Voice Assistant — hands-free AI assistant",
       "AI Assist (Dr. ISHA) — clinical decision support",
       "Imaging — view DICOM / radiology images",
       "Calculators — clinical calculators (BMI, GFR, etc.)",
       "Health Monitoring — remote patient health dashboard",
       "Remote Monitoring — IoT / wearable data",
       "Alerts — clinical alerts and notifications",
       "Analytics — consultation and outcome analytics",
       "Reports — clinical reports",
       "Billing — doctor billing and fee management",
       "Services — procedures and service catalogue",
       "Document Templates — SOAP, discharge, referral",
       "Template Settings, Specialty Templates",
       "Messaging — team and patient communication",
       "Settings, Contact, Support"])


# ── SLIDE 6: Hospital Portal ──────────────────────────────────────────────────
slide("Hospital Portal — Modules",
      ["Login: /hospital/login",
       "",
       "Dashboard",
       "OPD / IPD Management — outpatient and inpatient workflows",
       "Appointments — hospital-wide appointment management",
       "Patients — patient registry and search",
       "Beds — bed management and occupancy",
       "Doctors Management — credentialing and scheduling",
       "EHR — electronic health records",
       "Prescriptions — prescription creator",
       "Lab Orders — order and track lab tests",
       "Imaging Orders — radiology order management",
       "Procedure Adder — procedure documentation",
       "Discharge Summary — automated discharge notes",
       "IP Sheets — inpatient clinical sheets",
       "MRD — Medical Records Department",
       "Pharmacy — dispensing and inventory",
       "Lab Reports — view and manage lab results",
       "Billing — hospital billing and invoicing",
       "Claims — insurance claim management",
       "Insurance Claims Dashboard",
       "Insurance Payer Management",
       "Corporate Management — corporate client management",
       "Practice Management — hospital practice settings",
       "Staff — staff roster and management",
       "Communication Hub — internal communications",
       "Team Chat — real-time staff chat",
       "Ambulance — ambulance dispatch and tracking",
       "Branches / Clinics — multi-site management",
       "Notifications, Settings, Support"])


# ── SLIDE 7: Clinic Portal ────────────────────────────────────────────────────
slide("Clinic Portal — Modules",
      ["Login: /clinic/login",
       "",
       "Dashboard",
       "Appointments — clinic appointment scheduling",
       "Patients — patient registration and records",
       "Queue — patient queue management",
       "Doctors — clinic doctor management",
       "Consultations — consultation records",
       "Prescriptions — prescription management",
       "Pharmacy — in-clinic pharmacy",
       "Lab Tests — lab test ordering",
       "Billing — clinic billing",
       "Payments — payment collection",
       "Reports — clinic reports",
       "Staff — staff management",
       "Notifications, Settings, Support"])


# ── SLIDE 8: Lab Portal ───────────────────────────────────────────────────────
slide("Lab Portal (LIS) — Modules",
      ["Login: /lab/login",
       "",
       "Dashboard",
       "Test Catalog — manage test menu and pricing",
       "RIS — Radiology Information System",
       "Orders — lab test orders",
       "Patients — patient registration",
       "Appointments — sample collection appointments",
       "Queue — sample queue",
       "Samples — sample lifecycle tracking",
       "Processing — lab processing workflow",
       "Results — result entry and validation",
       "Reports — report generation and delivery",
       "Inventory — reagent and consumable inventory",
       "Billing — lab billing",
       "Payments — payment management",
       "Analytics — TAT, quality, turnaround analytics",
       "Staff — lab staff management",
       "Notifications, Settings, Support"])


# ── SLIDE 9: Pharmacy Portal ──────────────────────────────────────────────────
slide("Pharmacy Portal — Modules",
      ["Login: /pharmacy/login",
       "",
       "Dashboard",
       "POS — point of sale dispensing",
       "Prescriptions — prescription-based dispensing",
       "Inventory — stock management",
       "Stock Alerts — low stock and reorder alerts",
       "Batches — batch and lot tracking",
       "Purchase Orders — vendor purchase orders",
       "Customers — retail customer records",
       "Invoices — invoice management",
       "Expiry Management — expiry tracking and alerts",
       "Analytics — dispensing and revenue analytics",
       "Reports — sales and inventory reports",
       "Settings, Support"])


# ── SLIDE 10: ICU Portal ──────────────────────────────────────────────────────
slide("ICU Portal — Modules",
      ["Login: /icu/login",
       "",
       "Dashboard",
       "Live Monitor — real-time patient vitals dashboard",
       "Patients — ICU patient list and profiles",
       "Beds — ICU bed management",
       "Medications — medication administration records",
       "Vitals — vitals charting",
       "Fluid Balance — intake/output tracking",
       "Ventilators — ventilator management",
       "Equipment — ICU equipment tracking",
       "Infections — infection surveillance in ICU",
       "Team — ICU team management",
       "Protocols — clinical protocols and bundles",
       "Alerts — critical value and deterioration alerts",
       "Reports — ICU outcome reports",
       "Analytics — ICU KPIs and trends",
       "Settings, Support"])


# ── SLIDE 11: OT Portal ───────────────────────────────────────────────────────
slide("OT (Operation Theatre) Portal — Modules",
      ["Login: /ot/login",
       "",
       "Dashboard",
       "Theatre View — live OT status board",
       "Schedule — OT case scheduling",
       "Pre-Op — pre-operative checklist",
       "Consent — surgical consent management",
       "Teams — surgeon, anaesthetist, scrub team",
       "Equipment — OT equipment tracking",
       "Sterilization — instrument sterilization tracking",
       "Implants — implant and prosthetic tracking",
       "Anesthesia — digital anaesthesia records",
       "Safety — WHO surgical safety checklist",
       "Post-Op — post-operative notes and handoff",
       "Records — OT case records",
       "Reports — OT utilization reports",
       "Analytics — OT efficiency analytics",
       "Settings, Support"])


# ── SLIDE 12: Nurse & Assistant Portals ───────────────────────────────────────
slide("Nurse Portal & Assistant Portal — Modules",
      ["--- Nurse Portal ---",
       "Login: /nurse/login",
       "",
       "Dashboard",
       "Patients — ward patient list",
       "Vitals — vital signs recording",
       "Medications — medication administration",
       "Notes — nursing notes",
       "Appointments — appointment management",
       "Register Patient — new patient registration",
       "Book Appointment — schedule appointments",
       "Video Consultation — multi-party video calls",
       "Chat — nurse-team messaging",
       "",
       "--- Assistant / Front Desk Portal ---",
       "Login: /assistant/login",
       "",
       "Dashboard",
       "Register Patient",
       "Patients",
       "Appointments",
       "Prescriptions",
       "Billing",
       "Messages",
       "Orders — task and order management",
       "Reports"])


# ── SLIDE 13: Ambulance & Homecare ────────────────────────────────────────────
slide("Ambulance Portal & Homecare Portal — Modules",
      ["--- Ambulance Portal ---",
       "Login: /ambulance/login",
       "",
       "Dashboard",
       "Active Trips — live trip tracking",
       "Dispatch — ambulance dispatch",
       "Tracking — GPS fleet tracking",
       "History — trip history",
       "Fleet — vehicle management",
       "Staff — paramedic and driver management",
       "Maintenance — vehicle maintenance",
       "Schedule — shift scheduling",
       "Billing — ambulance billing",
       "Reports, Alerts, Settings, Support",
       "",
       "--- Homecare Portal ---",
       "Login: /homecare/login",
       "",
       "Dashboard",
       "Patients — homecare patient records",
       "Care Plans — personalized care plans",
       "Appointments — home visit scheduling",
       "Staff — nurse and caregiver management",
       "Services — homecare service catalogue",
       "Billing, Inventory, Reports, Settings, Support"])


# ── SLIDE 14: HR, IT/EDP, Security, Quality ──────────────────────────────────
slide("HR, IT/EDP, Security, Quality Portals — Modules",
      ["--- HR Portal ---",
       "Login: /hr/login",
       "Staff, Attendance, Leaves, Shifts, Onboarding, Payroll,",
       "PF/ESI, Benefits, Recruitment, Training, Performance,",
       "Appraisals, Reports, Analytics, Compliance, Settings, Support",
       "",
       "--- IT / EDP Portal ---",
       "Login: /it-edp/login",
       "Tickets, Users, Assets, Systems, Network, Backup,",
       "Security, Access Control, Reports, Settings, Support",
       "",
       "--- Security Portal ---",
       "Login: /security/login",
       "CCTV, Access Points, Access Logs, Incidents, Alerts,",
       "Guard Duty, Visitors, Staff Log, Asset Tracking,",
       "Implementation, Reports, Settings, Support",
       "",
       "--- Quality Portal ---",
       "Login: /quality/login",
       "NABH Standards, Assessments, Audit Reports, Accreditation,",
       "Incidents, KPIs, SOPs, Feedback, Reports, Settings, Support"])


# ── SLIDE 15: MRD, Accounts, Insurance Desk ──────────────────────────────────
slide("MRD, Accounts, Insurance Desk — Modules",
      ["--- MRD (Medical Records Department) ---",
       "Login: /mrd/login",
       "Records, Admissions, Discharge, Requests,",
       "ICD-10 Coding, Medico-Legal, File Tracking,",
       "Statistics, Settings, Support",
       "",
       "--- Accounts Portal ---",
       "Login: /accounts/login",
       "Dashboard, Billing, Collections, Expenses, Reports",
       "",
       "--- Insurance Desk Portal ---",
       "Login: /insurance-desk/login",
       "Pre-Authorization, Claims, Documents, TPA Management,",
       "Patient Insurance, Search, Analytics, Settings, Support"])


# ── SLIDE 16: Department Portals ─────────────────────────────────────────────
slide("Hospital Department Portals (Staff-Only Logins)",
      ["Each department has its own dedicated login and dashboard.",
       "",
       "Asset Department         /asset/login        — inventory, tracking",
       "Biomedical Department    /biomedical/login   — equipment, monitoring, modules",
       "Blood Bank               /blood-bank/login   — donors, crossmatch, inventory",
       "Consent Department       /consent/login      — consent forms, CLIA AI assistant",
       "CSSD                     /cssd/login         — sterilization, instrument sets",
       "Dietary Department       /dietary/login      — meal plans, kitchen, monitoring",
       "Finance Department       /finance/login      — billing, collections, expenses, reports",
       "Infection Control        /infection-control/login — surveillance, incidents, alerts",
       "Mortuary                 /mortuary/login     — cases, releases, records, reports",
       "Procurement              /procurement/login  — orders, vendors, approvals, reports",
       "Queue Management         /queue/login        — tokens, counters, history, reports",
       "Queue Kiosk (Public)     /queue/kiosk        — patient self-registration, no login required",
       "",
       "Biomedical and Dietary departments also have dedicated module and monitoring pages."])


# ── SLIDE 17: CRM Portal ──────────────────────────────────────────────────────
slide("CRM Portal — Modules",
      ["Login: /crm/login",
       "",
       "Dashboard",
       "Leads — lead pipeline management",
       "Deals — deal tracking",
       "Contacts — contact management",
       "Activities — calls, meetings, tasks",
       "Pipeline — visual deal pipeline",
       "RFQs — Request for Quote management",
       "  RFQ Detail — full RFQ view with tabs:",
       "    Overview, Analytics, Members, Claims, Quotes,",
       "    Underwriting Pipeline (AI-powered), AI Intelligence,",
       "    Deep Analytics, AI Quote Engine",
       "Quote Builder — line-item insurance quote builder",
       "Agents — insurance agent management",
       "Agencies — agency management",
       "Commissions — commission tracking",
       "Corporate Plans — group insurance plan management",
       "Emails — integrated email inbox (SMTP/IMAP)",
       "Reports, Settings",
       "",
       "AI Underwriting Pipeline:",
       "Product selection → slip parse → coverage matrix →",
       "gap analysis → AI underwriting decision → terms generation"])


# ── SLIDE 18: Corporate, TPA, Aggregator, Insurance Portals ──────────────────
slide("Corporate, TPA, Aggregator & Insurance Portals",
      ["--- Corporate Portal ---",
       "Login: /corporate/login",
       "Dashboard — corporate health overview",
       "Employees — employee roster, bulk upload, health status",
       "Benefits — insurance and wellness benefits",
       "Health Bookings — corporate health booking management",
       "",
       "--- TPA Portal ---",
       "Login: /tpa/login",
       "Dashboard — TPA claims and pre-auth overview",
       "",
       "--- Aggregator Portal ---",
       "Login: /aggregator/login",
       "Dashboard — aggregator network overview",
       "",
       "--- Hospital Insurance Portal ---",
       "Login: /hospital-insurance/login",
       "Per-hospital insurance dashboard",
       "",
       "--- Insurance Broker / Intermediary Portal ---",
       "Login: /intermediary/login",
       "Policies, Corporates, Profile, Commissions,",
       "Reports, Analytics, Notifications, Communication,",
       "Settings, Support",
       "",
       "--- Insurer Portal ---",
       "Login: /insurer/login",
       "Communication module",
       "",
       "--- PSU and NGO Portals ---",
       "/psu/login and /ngo/login — communication access"])


# ── SLIDE 19: Admin & Team Portals ───────────────────────────────────────────
slide("Admin & Team Portals",
      ["--- Admin Portal ---",
       "Login: /admin/login",
       "Full system administration dashboard",
       "User management across all roles",
       "Hospital, clinic, lab, pharmacy management",
       "Platform configuration and settings",
       "SIB Control Dashboard — top-level super admin panel",
       "",
       "--- Team / Super-Admin Portal ---",
       "Login: /team/login",
       "Profile, Directory, Reports, Tools",
       "Pharmacy Edit",
       "User Management",
       "Doctor Management",
       "Corporate Management",
       "Corporate Health Booking",
       "Hospital Management",
       "Clinic Management",
       "Lab Management",
       "Pharmacy Management"])


# ── SLIDE 20: Patient Portal ──────────────────────────────────────────────────
slide("Patient Portal — Modules",
      ["Login: /login  (Register: /register)",
       "",
       "--- Health & Records ---",
       "Smart Health Dashboard, Health Tracker, Health Diary,",
       "Health Intelligence, Vital Reports, Watch Analytics,",
       "AI Health Analysis, Health Risk Assessment,",
       "Report Scanner (AI), Symptom Checker (AI), AI Doctor",
       "",
       "--- Consultations & Bookings ---",
       "Consultation, Doctors (find & book), Appointments,",
       "Video Consultation, Smart OPD",
       "Nurse Booking, Lab Booking, Homecare Booking",
       "",
       "--- Pharmacy & Lab ---",
       "Pharmacy, Lab Tests, My Reports, My Prescriptions",
       "",
       "--- Insurance & Finance ---",
       "My Insurance Policies, Buy Insurance, Claims, Claims Express,",
       "Wallet, Billing (Checkout, Orders, Invoices)",
       "",
       "--- Wellness & Lifestyle ---",
       "Diet, Calorie Calculator, Wellness Challenges,",
       "Wellness Calendar, Wellness Rewards, Benefits,",
       "Family Health Hub, Health Feed",
       "",
       "--- Other ---",
       "Profile, Documents, Network Hospitals, Network Clinics,",
       "Notifications, Emergency, Ayushman Bharat, Help"])


# ── SLIDE 21: AI Features ─────────────────────────────────────────────────────
slide("AI Features — iSHA Engine & Dr. ISHA",
      ["iSHA (Intelligent Smart Health Assistant) — Clinical AI Engine",
       "",
       "Voice-to-Text Notes — doctor dictates, AI writes structured SOAP notes",
       "Auto ICD-10 Coding — diagnosis text to ICD-10 mapping",
       "Drug Interaction Alerts — real-time alerts across all medications",
       "Radiology AI Assist — chest X-ray, CT, MRI finding detection",
       "Predictive Analytics — readmission risk, sepsis early warning, LOS forecast",
       "Clinical Decision Support — evidence-based treatment suggestions",
       "AI Report Scanner — extract structured data from uploaded lab reports",
       "AI Symptom Triage — patient symptom checker with urgency scoring",
       "AI Health Analysis — comprehensive AI health assessment for patients",
       "",
       "CLIA — Consent & Legal Intelligence Assistant (Consent Department)",
       "AI chat, consent draft generation, NABH compliance check, audit analysis",
       "",
       "Dr. ISHA — Patient-Facing AI Chatbot",
       "24/7 symptom guidance, appointment booking, post-discharge follow-up",
       "Available in English, Hindi, Tamil, and other regional languages",
       "",
       "CRM AI Features:",
       "AI-powered RFQ underwriting analysis",
       "AI quote generation from uploaded Excel / PDF / image slips",
       "Member analytics, claims intelligence, deep analytics",
       "",
       "Built on: LaBSE, Groq, Mistral with fine-tuned Indian clinical corpus"])


# ── SLIDE 22: Implementation Roadmap ─────────────────────────────────────────
slide("Implementation Roadmap — 4 Phases, 16 Weeks",
      ["Phase 1 (Weeks 1-4) — Foundation",
       "  - Infrastructure setup and server configuration",
       "  - Core team training (super-users)",
       "  - Master data migration (patients, doctors, items, tariffs)",
       "  - OPD and billing go-live in pilot department",
       "",
       "Phase 2 (Weeks 5-8) — Clinical Core",
       "  - IPD and nursing station go-live",
       "  - Pharmacy dispensing and indenting",
       "  - Lab and radiology module activation",
       "  - Emergency module and triage workflows",
       "",
       "Phase 3 (Weeks 9-12) — Advanced Modules",
       "  - OT scheduling and anaesthesia notes",
       "  - Blood bank and CSSD go-live",
       "  - Patient mobile app and WhatsApp launch",
       "  - Insurance and TPA claim workflows",
       "",
       "Phase 4 (Weeks 13-16) — AI and Analytics",
       "  - iSHA AI activation (voice notes, ICD coding)",
       "  - MIS dashboards and C-suite reports",
       "  - ABDM / ABHA ID linking activation",
       "  - Hypercare period and full handover",
       "",
       "All phases include: dedicated implementation consultant,",
       "24x7 support hotline, and weekly review calls with MGM leadership."])


# ── SLIDE 23: Compliance ──────────────────────────────────────────────────────
slide("Regulatory & Compliance Readiness",
      ["ABDM — Fully certified HIP and HIU. ABHA ID linking, PHR integration,",
       "        consent-based health record sharing.",
       "",
       "NABH — All standard documentation pre-configured: MLC registers,",
       "        consent forms, drug registers, blood bank records,",
       "        ICU checklists, audit trail reports.",
       "",
       "NHCX — National Health Claims Exchange integration for real-time cashless claims.",
       "",
       "IRDAI — All IRDAI-mandated fields, TPA portals, Ayushman Bharat claim formats.",
       "",
       "DPDP — India Digital Personal Data Protection Act 2023 ready.",
       "        Role-based access, data masking, consent logs, data localisation.",
       "",
       "Drug Compliance — Schedule H/H1 narcotic register, CDSCO reporting,",
       "                  pharmacovigilance, expiry alerts.",
       "",
       "Accreditation — JCI, ISO 9001, NABL (lab), AERB (radiation),",
       "                state health department reporting formats pre-built.",
       "",
       "GST — GST-compliant billing and tax calculation.",
       "Ayushman Bharat — claim submission and beneficiary verification."])


# ── SLIDE 24: Why Mediqzy for MGM ────────────────────────────────────────────
slide("Why Mediqzy for MGM Hospitals",
      ["1. Purpose-built for Indian multi-specialty hospitals",
       "   Not a generic ERP. Every workflow reflects Indian clinical reality.",
       "",
       "2. MGM-specific configuration",
       "   Configured to MGM's SOPs, branding, tariff schedules, and specialty mix.",
       "",
       "3. Complete module coverage — 41 portals, 300+ pages",
       "   Every department, every role, every workflow covered in one platform.",
       "",
       "4. Genuine AI — not marketing",
       "   iSHA AI: voice notes, auto ICD coding, radiology assist, predictive alerts.",
       "   Works in Hindi, Tamil, and other regional languages.",
       "",
       "5. India-first compliance built in",
       "   ABDM, ABHA, NHCX, Ayushman Bharat, NABH, IRDAI — all native, not add-ons.",
       "",
       "6. Flexible deployment",
       "   On-premise on MGM servers or managed cloud. HIPAA and ABDM compliant.",
       "",
       "7. Proven outcomes",
       "   8-12% reduction in billing leakage",
       "   22% increase in OPD throughput",
       "   60% reduction in discharge TAT",
       "   40% faster lab turnaround",
       "   +35 NPS improvement",
       "",
       "8. Dedicated support and partnership",
       "   Named implementation consultant, 24x7 production support,",
       "   quarterly clinical workflow reviews, direct line to product team."])


# ── SLIDE 25: Next Steps ──────────────────────────────────────────────────────
slide("Next Steps — Getting Started with MGM Hospitals",
      ["Step 1 — Product Demo",
       "  Schedule a live demonstration of Mediqzy at MGM's premises or virtually,",
       "  customised to MGM's specialty mix and workflows.",
       "",
       "Step 2 — Technical Assessment",
       "  Our team conducts a no-obligation 1-day workflow study at one MGM facility",
       "  to correctly size the implementation.",
       "",
       "Step 3 — Pilot Agreement",
       "  90-day pilot in one department or facility.",
       "  Go-live in 4 weeks. Outcome review at week 12.",
       "",
       "Step 4 — Full Group Rollout",
       "  Upon pilot success, group-wide enterprise agreement with:",
       "  - Negotiated pricing based on MGM bed count and site count",
       "  - SLA guarantees",
       "  - Shared success plan with measurable outcomes",
       "",
       "Contact Us:",
       "  Email:   info@mysmarthealth.in",
       "  Website: mediqzy.com",
       "  App:     app.mediqzy.com",
       "  Company: Mediqzy Healthcare Technologies Pvt. Ltd."])


# ── Save ───────────────────────────────────────────────────────────────────────
out = "/home/ubuntu/Mediczy/Mediqzy_MGM_Proposal_PlainText.pptx"
prs.save(out)
print(f"Saved: {out}  ({prs.slides.__len__()} slides)")
