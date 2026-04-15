import { useState, useEffect, useRef } from 'react'

/* ── Elegant Logo Brand ── */
const LogoBrand = () => {
  return (
    <div className="group flex items-center gap-3 select-none">
      <div className="relative flex-shrink-0">
        <div className="absolute -inset-1 rounded-xl bg-gradient-to-br from-amber-400/15 to-teal-500/10 opacity-0 blur-md transition-opacity duration-500 group-hover:opacity-100" />
        <img
          src="/vectors/mediqzy-logo-icon.svg"
          alt=""
          className="relative h-9 w-9 drop-shadow-[0_0_8px_rgba(212,175,55,0.15)]"
        />
      </div>
      <div className="flex flex-col leading-none">
        <span className="text-[21px] font-semibold tracking-[-0.01em]" style={{ fontFamily: "'Georgia','Times New Roman',serif" }}>
          <span className="bg-gradient-to-b from-amber-200 via-yellow-300 to-amber-500 bg-clip-text text-transparent">Medi</span>
          <span className="bg-gradient-to-b from-amber-300 via-yellow-400 to-amber-600 bg-clip-text text-transparent font-bold">Q</span>
          <span className="bg-gradient-to-b from-amber-200 via-yellow-300 to-amber-500 bg-clip-text text-transparent">zy</span>
        </span>
        <span className="mt-0.5 text-[8px] font-medium tracking-[0.18em] uppercase text-amber-400/50">Wellness & Care</span>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════
   DATA — based on actual Mediczy app capabilities
   ═══════════════════════════════════════════════ */

const NAV_LINKS = [
  { label: 'Platform', href: '#platform' },
  { label: 'AI', href: '#ai' },
  { label: 'Solutions', href: '#solutions' },
  { label: 'Products', href: '#products' },
  { label: 'Impact', href: '#impact' },
  { label: 'FAQ', href: '#faq' },
]

const HERO_BADGES = [
  'On-Premise Deployment',
  'HIPAA Ready',
  'GDPR Compliant',
  'HL7 FHIR',
  'ABDM Integrated',
  'NABH Ready',
]

const PLATFORM_PILLARS = [
  {
    icon: 'care',
    title: 'Care OS',
    subtitle: 'Patient Journey Orchestration',
    features: [
      'EMR with full patient history & allergy tracking',
      'OPD & IPD management with bed census',
      'Operation Theatre scheduling & post-op tracking',
      'ICU / HDU critical care monitoring',
      'Nursing module with vitals & shift handoff',
      'Digital prescription writer with drug DB',
    ],
  },
  {
    icon: 'ops',
    title: 'Operations OS',
    subtitle: 'Hospital Workflow Automation',
    features: [
      'Billing & revenue cycle management',
      'Inventory & pharmacy with expiry tracking',
      'Staff directory, shifts & performance',
      'Appointment queue & scheduling engine',
      'Multi-location branch management',
      'Facility management & housekeeping',
    ],
  },
  {
    icon: 'insurance',
    title: 'Insurance OS',
    subtitle: 'Claims Lifecycle Automation',
    features: [
      'Claim submission draft → submit → track',
      'Pre-authorization & eligibility verification',
      'Document hub (discharge, bills, reports)',
      'TPA integration & query response',
      'Settlement tracking & reconciliation',
      'Bulk claim upload & processing',
    ],
  },
  {
    icon: 'intel',
    title: 'Intelligence OS',
    subtitle: 'AI-Powered Analytics',
    features: [
      'Revenue & KPI dashboards per location',
      'Patient demographics & growth analytics',
      'Doctor performance & response time',
      'Claim turnaround & denial analytics',
      'Health risk scoring (ML-based)',
      'Predictive insights & recommendations',
    ],
  },
]

const AI_FEATURES = [
  {
    tag: 'AI Scribe',
    title: 'Real-time medical transcription',
    image: '/vectors/ai-scribe.svg',
    description: 'Voice-to-text with 207+ medical abbreviation expansion across 14 specialties. Auto-generates prescriptions, discharge summaries, and ICD-10 codes — under 100ms per operation.',
    highlights: ['Voice → Structured Notes', 'ICD-10 Auto-coding', 'Auto-Prescription', 'Offline Capable'],
  },
  {
    tag: 'AI Vision',
    title: 'Medical image analysis',
    image: '/vectors/ai-vision.svg',
    description: 'Capture and analyze X-rays, scans, and lab reports during video consultations. Claude Vision API extracts clinical findings, suggests drugs, and recommends ICD-10 codes.',
    highlights: ['X-ray Analysis', 'Report Parsing', 'Drug Suggestions', 'CIMS Integration'],
  },
  {
    tag: 'Dr. iSHA',
    title: 'Multilingual health assistant',
    image: '/vectors/ai-isha.svg',
    description: 'Conversational AI in 20+ languages including English, Hindi, Spanish, Arabic, Chinese, French, Portuguese & more. Symptom checking, medication info, emergency guidance, and personalized health recommendations.',
    highlights: ['20+ Languages', 'Symptom Triage', 'Voice + TTS', 'Health Insights'],
  },
  {
    tag: 'Health Intelligence',
    title: 'Proactive patient engagement',
    image: '/vectors/ai-intelligence.svg',
    description: 'ML-based health risk assessment, personalized medication & lab reminders, lifestyle recommendations, and health streak gamification.',
    highlights: ['Risk Scoring', 'Smart Reminders', 'Diet Plans', 'Streak Tracking'],
  },
]

const CDSS_POINTS = [
  'Specialty-aware clinical queries for diagnosis, treatment, dosage, guidelines, differentials, labs, and interactions',
  'Retrieval from the medical knowledge base including Gale medical content, BMJ-aligned sources, and uploaded clinical PDFs',
  'Structured outputs for differential diagnosis, lab suggestions, critical warnings, ICD-10 codes, and references',
  'CIMS-backed medication alternatives with brand options, manufacturer details, schedules, and pricing context',
  'Automatic drug-drug interaction checks available both inside full CDSS answers and through a direct interaction endpoint',
  'Built to help doctors think faster at the point of care, while preserving physician judgment as the final decision-maker',
]

const SOLUTIONS = [
  {
    label: 'For Hospitals',
    badge: '🏥',
    image: '/vectors/sol-hospital.svg',
    tryUrl: 'https://app.mediqzy.com/hospital/login',
    description: 'Full-stack hospital management with EMR, OPD/IPD, OT scheduling, ICU monitoring, pharmacy, lab integration, tele-radiology with RIS/PACS/DICOM, unified communication hub, asset tracking, surveillance, quality and NABH workflows, HR, and multi-location support.',
    modules: ['EMR', 'OPD / IPD', 'OT', 'ICU / HDU', 'Nursing', 'Pharmacy', 'Lab', 'Tele-Radiology (RIS/PACS/DICOM)', 'Billing', 'Insurance Claims', 'Telemedicine', 'Unified Communication Hub', 'Asset Tracking', 'Surveillance & Security', 'Quality (NABH)', 'HR & Payroll'],
  },
  {
    label: 'For Clinics',
    badge: '🩺',
    image: '/vectors/sol-clinic.svg',
    tryUrl: 'https://app.mediqzy.com/clinic/login',
    description: 'Streamlined clinic workflows with appointment scheduling, patient management, e-prescriptions, AI Scribe (online & offline), and EMR lite for solo practitioners and group practices.',
    modules: ['Appointments', 'EMR Lite', 'e-Prescriptions', 'AI Scribe (Online & Offline)', 'Telemedicine', 'Billing', 'Patient Portal'],
  },
  {
    label: 'For Labs',
    badge: '🔬',
    image: '/vectors/sol-lab.svg',
    tryUrl: 'https://app.mediqzy.com/lab/login',
    description: '1000+ test catalog, home sample collection tracking, automated report generation, AI-powered report analysis, tele-radiology with RIS/PACS/DICOM support, and seamless hospital integration.',
    modules: ['Test Catalog', 'Sample Tracking', 'Report Automation', 'AI Analysis', 'Home Collection', 'Tele-Radiology (RIS/PACS/DICOM)'],
  },
  {
    label: 'For Pharmacy',
    badge: '💊',
    image: '/vectors/sol-pharmacy.svg',
    tryUrl: 'https://app.mediqzy.com/pharmacy/login',
    description: 'Digital medicine catalog, prescription fulfillment automation, inventory with expiry tracking, supplier management, QR code generation for cut tablet strips, and delivery coordination.',
    modules: ['Inventory', 'Prescription Fill', 'Delivery', 'Supplier Mgmt', 'Expiry Alerts', 'Strip QR Code Generator'],
  },
  {
    label: 'For Ambulance',
    badge: '🚑',
    image: '/vectors/sol-ambulance.svg',
    tryUrl: 'https://app.mediqzy.com/ambulance/login',
    description: 'GPS-based dispatch, real-time vehicle tracking, AI triage with multi-modal input (text, voice, images), urgency classification, telemedicine consultation, and hospital coordination.',
    modules: ['GPS Dispatch', 'AI Triage', 'Live Tracking', 'Hospital Routing', 'Vital Monitoring', 'Telemedicine'],
  },
  {
    label: 'For Homecare',
    badge: '🏠',
    image: '/vectors/sol-homecare.svg',
    tryUrl: 'https://app.mediqzy.com/homecare/login',
    description: 'Nurse and paramedic booking, service scheduling, caregiver certification tracking, in-home health monitoring, telemedicine consultation, and care plan management.',
    modules: ['Nurse Booking', 'Scheduling', 'Care Plans', 'Telemedicine', 'Visit Tracking', 'Billing'],
  },
  {
    label: 'For Corporate',
    badge: '🏢',
    image: '/vectors/sol-corporate.svg',
    tryUrl: 'https://app.mediqzy.com/corporate/login',
    description: 'Employee wellness programs, corporate health camps, bulk health assessments, telemedicine consultation, fitness challenges with leaderboards, and organizational health analytics.',
    modules: ['Wellness Programs', 'Health Camps', 'Telemedicine', 'Fitness Tracking', 'Leaderboards', 'Analytics'],
  },
]

const PRODUCTS = {
  clinical: [
    'Electronic Medical Record (EMR)',
    'OPD Management',
    'IPD & Bed Management',
    'Operation Theatre',
    'ICU / HDU Monitoring',
    'Blood Bank',
    'Telemedicine',
    'Lab Information System (LIS)',
    'Nursing Module',
    'Discharge Summary (AI)',
  ],
  operational: [
    'Billing & Revenue Cycle',
    'Insurance Claims Engine',
    'Inventory & Pharmacy',
    'Staff & Shift Management',
    'Appointment Scheduling',
    'Facility Management',
    'Asset Tracking',
    'Security & Surveillance',
    'Quality (NABH)',
    'HR & Payroll',
    'Unified Communication Hub',
    'Multi-Location Management',
    'API & Integration Hub',
  ],
  mobile: [
    'Doctor App',
    'Nursing App',
    'Patient App (iOS/Android)',
    'Admin Dashboard',
    'Ambulance Dispatch',
    'Lab Agent App',
  ],
  ai: [
    'AI Scribe (Transcription)',
    'CDSS for Doctors',
    'AI Vision (Image Analysis)',
    'Dr. iSHA (Health Assistant)',
    'Health Risk Assessment',
    'ICD-10 Auto-Coding',
    'Drug Interaction Intelligence',
  ],
}

const PRODUCT_TABS = [
  { key: 'clinical', label: 'Clinical', count: 10 },
  { key: 'operational', label: 'Operational', count: 13 },
  { key: 'mobile', label: 'Mobile', count: 6 },
  { key: 'ai', label: 'AI & Intelligence', count: 6 },
]

const STATS = [
  { number: '3.5M+', label: 'Patient interactions processed' },
  { number: '500+', label: 'Healthcare facilities worldwide' },
  { number: '21K+', label: 'Clinical professionals active' },
  { number: '<100ms', label: 'AI Scribe response time' },
]

const TELEMEDICINE_FEATURES = [
  'Appointment-secured video rooms',
  '4-layer cryptographic security',
  'AI Scribe live during call',
  'AI Vision image capture & analysis',
  'Screen sharing & recording',
  'Chat & file exchange',
  'Low-bandwidth auto-fallback',
  'Prescription generated live',
]

const TESTIMONIALS = [
  {
    quote: 'Mediqzy replaced 6 different tools. One login, one view of the entire hospital — OPD, IPD, pharmacy, lab, billing, and insurance claims.',
    name: 'Dr. Arvind Mehta',
    role: 'MD, City General Hospital',
  },
  {
    quote: 'The AI Scribe transcribes my consultations in real-time. It expanded 207 medical abbreviations correctly. I save 40 minutes daily on documentation.',
    name: 'Dr. Priya Deshmukh',
    role: 'Clinical Director, Unity Hospital',
  },
  {
    quote: 'Claim turnaround went from 12 days to under 3. The Insurance OS with pre-auth verification and document hub is game-changing.',
    name: 'Sunita Rao',
    role: 'CFO, LifeCare Hospital Chain',
  },
  {
    quote: 'Our ambulance fleet response time dropped 40% with GPS dispatch and AI triage. The urgency classification saves lives.',
    name: 'Rajesh Kumar',
    role: 'COO, Metro Health Systems',
  },
  {
    quote: 'I run a high-volume cardiology clinic, and Dr. iSHA helps screen patients before they enter my room. By the time I start the consultation, symptoms, vitals, risk signals, and history are already organized for me.',
    name: 'Dr. Karthik Raman',
    role: 'Consultant Cardiologist, Raman Heart Clinic',
  },
  {
    quote: 'The 3D membership cards with QR check-in, health streaks, and gamification — patients actually want to engage with their health now.',
    name: 'Divya Nair',
    role: 'Corporate HR Head, Enterprise Workforce Wellness',
  },
]

const FAQS = [
  {
    q: 'What is Mediqzy?',
    a: 'Mediqzy is a full-stack Hospital Operating System with 30+ integrated modules covering EMR, OPD/IPD, operation theatre, insurance claims, AI transcription, telemedicine, labs, pharmacy, ambulance, homecare, and corporate wellness — all in one platform.',
  },
  {
    q: 'How is Mediqzy different from a regular HMS?',
    a: 'Traditional hospital management systems cover fragments and are often cloud-based SaaS. Mediqzy is an on-premise Hospital Operating System — your data stays on your servers, never leaves your premises. It connects Care (EMR, OPD, IPD, OT), Operations (billing, inventory, HR), Insurance (claims, pre-auth, TPA), and Intelligence (AI Scribe, Vision, analytics) into one unified system. Plus it has built-in telemedicine, patient apps, and multi-tenant architecture.',
  },
  {
    q: 'What AI capabilities does Mediqzy have?',
    a: 'Mediqzy combines AI Scribe for real-time medical transcription, CDSS for doctor-facing clinical decision support, AI Vision for image and report analysis, Dr. iSHA for multilingual symptom intake and pre-consultation screening, and Health Intelligence for risk scoring, reminders, and predictive insights. CDSS can return guidelines, differential diagnosis, lab suggestions, ICD-10 support, medication alternatives, and drug interaction warnings.',
  },
  {
    q: 'Does Mediqzy support telemedicine?',
    a: 'Yes. Secure video consultations with 4-layer cryptographic security, LiveKit-powered rooms, AI Scribe transcription during calls, AI Vision image analysis, screen sharing, recording, live prescription generation, and mobile-optimized with low-bandwidth fallback.',
  },
  {
    q: 'Is it compliant with healthcare regulations?',
    a: 'Mediqzy is built for global compliance. It is an on-premise solution — all patient data is stored on your own servers, not on any third-party cloud. HIPAA ready for the US, GDPR compliant for Europe, ABDM/ABHA integrated for India, NABH-ready, DPDP compliant, HL7 FHIR for interoperability, with encrypted storage and role-based access control. Configurable for region-specific regulatory requirements.',
  },
  {
    q: 'Who can use Mediqzy?',
    a: 'Seven entity types: Hospitals, Clinics, Labs, Pharmacies, Ambulance services, Homecare providers, and Corporate organizations. Each gets a dedicated portal with role-specific features. Patients access via web and mobile apps.',
  },
  {
    q: 'How does the insurance module work?',
    a: 'Complete claims lifecycle: draft claims, submit with documents, pre-authorization, eligibility verification, TPA integration, query response handling, settlement tracking, bulk upload, and reconciliation dashboards.',
  },
  {
    q: 'How long does implementation take?',
    a: 'Single hospital: 2–4 weeks including on-premise server setup, configuration, data migration, and staff training. Multi-location rollouts: 6–8 weeks phased. We provide dedicated onboarding support.',
  },
  {
    q: 'Is Mediqzy a SaaS product? Where is my data stored?',
    a: 'No, Mediqzy is not SaaS. It is deployed on-premise — installed directly on your hospital\'s own servers. All patient records, billing data, prescriptions, and analytics stay within your facility. Your data never leaves your premises, giving you complete ownership and control over sensitive healthcare information.',
  },
]

const COMPLIANCE_GROUPS = [
  {
    title: 'Standards & Compliance',
    items: ['HL7 FHIR', 'HIPAA', 'GDPR', 'ABDM / ABHA', 'NABH Ready'],
  },
  {
    title: 'Payments & Identity',
    items: ['Razorpay', 'Stripe', 'Firebase'],
  },
  {
    title: 'Communication Layer',
    items: ['Agora', 'Twilio', 'SendGrid', 'WhatsApp Business', 'Google API'],
  },
  {
    title: 'Clinical Data Ecosystem',
    items: ['CIMS Drug DB', 'SNOMED CT', 'BMJ Best Practice', 'Gale Health Encyclopedia'],
  },
]

/* ═══════════════════════════════════════════════
   HOOKS
   ═══════════════════════════════════════════════ */

function useInView(ref, threshold = 0.15) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (!ref.current) return
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setVisible(true) },
      { threshold },
    )
    obs.observe(ref.current)
    return () => obs.disconnect()
  }, [ref, threshold])
  return visible
}

function useCountUp(end, duration = 2000, start = false) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (!start) return
    const numEnd = parseFloat(end.replace(/[^0-9.]/g, ''))
    if (isNaN(numEnd)) { setValue(end); return }
    let startTime = null
    const step = (ts) => {
      if (!startTime) startTime = ts
      const progress = Math.min((ts - startTime) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.floor(eased * numEnd))
      if (progress < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [end, duration, start])
  return value
}

/* ═══════════════════════════════════════════════
   ICON COMPONENTS
   ═══════════════════════════════════════════════ */

function PillarIcon({ type }) {
  const base = 'h-10 w-10'
  const icons = {
    care: (
      <svg className={base} viewBox="0 0 40 40" fill="none">
        <rect width="40" height="40" rx="12" fill="currentColor" fillOpacity="0.1" />
        <path d="M20 12l1.5 3 3.5.5-2.5 2.5.6 3.5L20 20l-3.1 1.5.6-3.5L15 15.5l3.5-.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M14 25h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M16 28h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    ops: (
      <svg className={base} viewBox="0 0 40 40" fill="none">
        <rect width="40" height="40" rx="12" fill="currentColor" fillOpacity="0.1" />
        <circle cx="20" cy="20" r="6" stroke="currentColor" strokeWidth="1.5" />
        <path d="M20 12v2M20 26v2M28 20h-2M14 20h-2M25.7 14.3l-1.4 1.4M15.7 24.3l-1.4 1.4M25.7 25.7l-1.4-1.4M15.7 15.7l-1.4-1.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    insurance: (
      <svg className={base} viewBox="0 0 40 40" fill="none">
        <rect width="40" height="40" rx="12" fill="currentColor" fillOpacity="0.1" />
        <path d="M20 12l7 3v6c0 4.5-3 8.2-7 9.5-4-1.3-7-5-7-9.5v-6z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M17 20l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    intel: (
      <svg className={base} viewBox="0 0 40 40" fill="none">
        <rect width="40" height="40" rx="12" fill="currentColor" fillOpacity="0.1" />
        <path d="M14 26V20M18 26V16M22 26V18M26 26V14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="26" cy="14" r="2" fill="currentColor" />
      </svg>
    ),
  }
  return icons[type] || null
}

/* ═══════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════ */

function App() {
  const [solutionIdx, setSolutionIdx] = useState(0)
  const [prodTab, setProdTab] = useState('clinical')
  const [openFaq, setOpenFaq] = useState(null)
  const [mobileMenu, setMobileMenu] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [demoSubmitted, setDemoSubmitted] = useState(false)
  const [demoSubmitting, setDemoSubmitting] = useState(false)
  const [demoError, setDemoError] = useState('')
  const [formLoadedAt] = useState(() => Date.now())

  const statsRef = useRef(null)
  const statsVisible = useInView(statsRef)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const handleDemoSubmit = async (e) => {
    e.preventDefault()
    setDemoSubmitting(true)
    setDemoError('')
    setDemoSubmitted(false)

    const formData = new FormData(e.currentTarget)
    const data = Object.fromEntries(formData.entries())
    const message = [
      'Demo request from mediqzy.com',
      `Name: ${data.name || '-'}`,
      `Organization: ${data.organization || '-'}`,
      `Phone: +91 ${data.phone || '-'}`,
      `Email: ${data.email || '-'}`,
      `Entity: ${data.entityType || '-'}`,
      `Requirements: ${data.requirements || '-'}`,
    ].join('\n')

    const apiBase = window.location.hostname === 'localhost'
      ? 'http://localhost:8888/api'
      : '/api'

    try {
      const response = await fetch(`${apiBase}/public/marketing-leads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...data,
          sourcePage: window.location.href,
          _lt: formLoadedAt,
        }),
      })

      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Lead capture failed')
      }

      window.open(`https://wa.me/917826911911?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer')
      setDemoSubmitted(true)
      e.currentTarget.reset()
    } catch (error) {
      window.open(`https://wa.me/917826911911?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer')
      setDemoError('WhatsApp opened, but the website could not confirm lead capture. Please send the message there or email support@mediqzy.com.')
    } finally {
      setDemoSubmitting(false)
    }
  }

  const sol = SOLUTIONS[solutionIdx]

  return (
    <>
      {/* ═══ NAVBAR ═══════════════════════════════ */}
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
          scrolled
            ? 'border-b border-white/5 bg-[#07101f]/90 shadow-lg shadow-black/20 backdrop-blur-xl'
            : 'bg-transparent'
        }`}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <a href="/" className="flex items-center gap-2.5" aria-label="Mediqzy home">
            <LogoBrand />
          </a>

          <nav aria-label="Main navigation" className="hidden items-center gap-6 text-[13px] font-semibold text-slate-400 lg:flex">
            {NAV_LINKS.map((l) => (
              <a key={l.label} href={l.href} className="transition hover:text-white">
                {l.label}
              </a>
            ))}
            <a
              href="#demo"
              className="ml-2 rounded-lg bg-gradient-to-r from-teal-500 to-teal-600 px-5 py-2 text-white shadow-lg shadow-teal-500/20 transition hover:shadow-teal-500/40"
            >
              Get a Demo
            </a>
          </nav>

          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-white lg:hidden"
            onClick={() => setMobileMenu(!mobileMenu)}
            aria-label="Menu"
          >
            <span className="text-xl">{mobileMenu ? '\u2715' : '\u2630'}</span>
          </button>
        </div>

        {mobileMenu && (
          <nav aria-label="Mobile navigation" className="border-t border-white/5 bg-[#07101f] px-6 pb-6 pt-3 lg:hidden">
            {NAV_LINKS.map((l) => (
              <a
                key={l.label}
                href={l.href}
                className="block py-3 text-sm font-medium text-slate-400 transition hover:text-white"
                onClick={() => setMobileMenu(false)}
              >
                {l.label}
              </a>
            ))}
            <div className="mt-3">
              <a href="#demo" className="block rounded-lg bg-teal-500 py-3 text-center text-sm font-bold text-white" onClick={() => setMobileMenu(false)}>
                Get a Demo
              </a>
            </div>
          </nav>
        )}
      </header>

      <main>
        {/* ═══ HERO ═══════════════════════════════ */}
        <section className="relative overflow-hidden bg-[#07101f] pb-16 pt-28 md:pb-24 md:pt-36">
          {/* Ambient light */}
          <div className="pointer-events-none absolute inset-0">
            <div className="float-slow absolute -left-40 top-16 h-[500px] w-[500px] rounded-full bg-teal-500/[0.07] blur-[120px]" />
            <div className="float-fast absolute -right-32 top-40 h-[400px] w-[400px] rounded-full bg-cyan-400/[0.06] blur-[100px]" />
            <div className="absolute bottom-0 left-1/2 h-[300px] w-[600px] -translate-x-1/2 rounded-full bg-teal-600/[0.04] blur-[80px]" />
            {/* Grid overlay */}
            <div className="absolute inset-0 opacity-[0.025]" style={{
              backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
              backgroundSize: '60px 60px',
            }} />
          </div>

          <div className="relative mx-auto max-w-7xl px-6">
            <div className="grid gap-12 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
              <div>
                <div className="reveal-up mb-6 inline-flex items-center gap-2 rounded-full border border-teal-500/20 bg-teal-500/[0.06] px-4 py-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-teal-400 animate-pulse" />
                  <span className="text-xs font-semibold text-teal-400">30+ Integrated Modules &middot; 7 Entity Types &middot; AI-Powered</span>
                </div>

                <h1 className="reveal-up text-[clamp(2.4rem,5vw,4.5rem)] font-extrabold leading-[1.02] tracking-tight text-white">
                  One <span className="primary-grad">operating system</span>
                  <br />
                  for modern hospital.
                </h1>

                <p className="reveal-up mt-6 max-w-lg text-base leading-relaxed text-slate-400 md:text-lg">
                  Clinical workflows, operations, revenue cycle, telemedicine, and AI on one secure on-premise platform for hospital groups, clinics, labs, pharmacies, ambulance networks, homecare teams, and employer health programs.
                </p>

                <div className="reveal-up mt-8 flex flex-wrap gap-3">
                  <a
                    href="#demo"
                    className="group relative rounded-xl bg-gradient-to-r from-teal-500 to-teal-600 px-7 py-3.5 text-sm font-bold text-white shadow-xl shadow-teal-500/20 transition hover:-translate-y-0.5 hover:shadow-teal-500/30"
                  >
                    <span className="relative z-10">Get a Demo</span>
                    <span className="absolute inset-0 rounded-xl bg-gradient-to-r from-teal-400 to-teal-500 opacity-0 transition group-hover:opacity-100" />
                  </a>
                  <a
                    href="https://app.mediqzy.com/hospital/login"
                    className="rounded-xl border border-slate-700 bg-white/[0.03] px-7 py-3.5 text-sm font-bold text-slate-300 backdrop-blur transition hover:border-slate-500 hover:text-white"
                  >
                    Start Free Trial
                  </a>
                </div>

                <div className="reveal-up mt-8 flex flex-wrap gap-2">
                  {HERO_BADGES.map((b) => (
                    <span key={b} className="rounded-full border border-slate-700 bg-slate-800/50 px-3 py-1 text-[11px] font-semibold text-slate-400">
                      {b}
                    </span>
                  ))}
                </div>

                <div className="reveal-up mt-8 grid max-w-2xl gap-3 sm:grid-cols-3">
                  {[
                    { value: '2-4 weeks', label: 'Typical go-live' },
                    { value: '7 portals', label: 'Operator-specific experiences' },
                    { value: '24/7', label: 'Deployment support' },
                  ].map((item) => (
                    <div key={item.label} className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-4 backdrop-blur">
                      <p className="text-lg font-extrabold text-white">{item.value}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">{item.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="reveal-up relative">
                <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-teal-500/10 via-transparent to-cyan-500/10 blur-xl" />
                <div className="relative rounded-2xl border border-white/[0.06] bg-white/[0.03] p-2.5 backdrop-blur">
                  <img src="/vectors/hero-dashboard.svg" alt="Mediqzy Hospital OS — Dashboard with patient census, claims, revenue, and AI analytics" className="w-full rounded-xl" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ PROBLEM STATEMENT ══════════════════ */}
        <section className="relative overflow-hidden bg-[#07101f] py-20 md:py-28">
          {/* Background accent */}
          <div className="absolute left-1/2 top-0 h-px w-2/3 -translate-x-1/2 bg-gradient-to-r from-transparent via-red-500/20 to-transparent" />

          <div className="relative mx-auto max-w-7xl px-6">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-400/80">The Problem</p>
              <h2 className="mt-3 text-3xl font-extrabold text-white md:text-5xl">
                Healthcare runs on <span className="text-red-400/90">broken systems.</span>
              </h2>
              <p className="mt-5 text-base leading-relaxed text-slate-400 md:text-lg">
                Every stakeholder in healthcare — hospitals, doctors, labs, pharmacies, corporates, and insurers — fights the same battle: fragmented tools, scattered data, wasted time, and zero interoperability. Here's what they deal with every day.
              </p>
            </div>

            <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  icon: '🏥',
                  title: 'Hospitals',
                  description: '10–15 disconnected vendors for OPD, billing, labs, pharmacy, insurance. None talk to each other. Staff re-enter data 5x a day. Patient records scattered across cloud servers you don\'t control.',
                  stat: '73%',
                  statLabel: 'of hospitals use 5+ disconnected systems',
                },
                {
                  icon: '🩺',
                  title: 'Doctors',
                  description: '2+ hours daily lost to documentation, toggling between 4–6 screens per patient, and chasing lab reports. By the time notes are done, the next patient is already waiting.',
                  stat: '40%',
                  statLabel: 'of a doctor\'s day lost to admin tasks',
                },
                {
                  icon: '🔬',
                  title: 'Labs',
                  description: 'Sample tracking on paper, manual report generation, no integration with ordering physicians. Results delivered late, re-tests ordered, and critical values missed in the handoff chaos.',
                  stat: '18%',
                  statLabel: 'of lab results delayed due to manual processes',
                },
                {
                  icon: '💊',
                  title: 'Pharmacies',
                  description: 'Inventory tracked in spreadsheets, expired stock discovered too late, prescriptions deciphered by hand. No real-time visibility into stock levels or automated reorder triggers.',
                  stat: '₹22K Cr',
                  statLabel: 'lost annually to expired pharma inventory globally',
                },
                {
                  icon: '🏢',
                  title: 'Corporates',
                  description: 'Employee health programs run on spreadsheets and vendor emails. No unified view of workforce wellness, camp outcomes, or claims utilization. ROI on health spend is unmeasurable.',
                  stat: '60%',
                  statLabel: 'of corporate wellness programs show no measurable ROI',
                },
                {
                  icon: '🛡️',
                  title: 'Insurance Companies',
                  description: 'Claims are financial cover — but policyholders expect care, not just reimbursement. Insurers have zero visibility into patient journeys, can\'t coordinate care, and lose customers to competitors who offer wellness beyond paperwork.',
                  stat: '68%',
                  statLabel: 'of policyholders want care management, not just claims',
                },
              ].map((problem) => (
                <article
                  key={problem.title}
                  className="group rounded-2xl border border-red-500/10 bg-red-500/[0.02] p-6 transition hover:border-red-500/20 hover:bg-red-500/[0.04] md:p-8"
                >
                  <span className="text-3xl">{problem.icon}</span>
                  <h3 className="mt-4 text-lg font-bold text-white">{problem.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">{problem.description}</p>
                  <div className="mt-5 border-t border-red-500/10 pt-4">
                    <span className="text-2xl font-extrabold text-red-400/80">{problem.stat}</span>
                    <p className="mt-1 text-xs text-slate-500">{problem.statLabel}</p>
                  </div>
                </article>
              ))}
            </div>

            {/* Transition arrow */}
            <div className="mt-16 flex flex-col items-center gap-4">
              <div className="h-12 w-px bg-gradient-to-b from-red-500/30 to-teal-500/30" />
              <div className="rounded-full border border-teal-500/20 bg-teal-500/[0.06] px-6 py-2.5">
                <span className="text-sm font-bold text-teal-400">Mediqzy replaces all of this with one platform ↓</span>
              </div>
              <div className="h-12 w-px bg-gradient-to-b from-teal-500/30 to-teal-500/10" />
            </div>
          </div>
        </section>

        {/* ═══ PLATFORM (4 OS Pillars) ════════════ */}
        <section id="platform" className="border-t border-teal-500/10 bg-[#07101f] py-20 md:py-28">
          <div className="mx-auto max-w-7xl px-6">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-teal-400">The Solution</p>
              <h2 className="mt-3 text-4xl font-extrabold text-white md:text-5xl">
                Four operating systems.<br />One unified platform.
              </h2>
              <p className="mt-4 text-base text-slate-400">
                Every module talks to every other module. No fragmentation, no data silos, no switching between tools. One on-premise platform that replaces 10+ vendors.
              </p>
            </div>

            <div className="mt-14 grid gap-5 md:grid-cols-2">
              {PLATFORM_PILLARS.map((p) => (
                <article
                  key={p.title}
                  className="group rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 transition hover:border-teal-500/20 hover:bg-white/[0.04] md:p-8"
                >
                  <div className="flex items-start gap-4">
                    <div className="text-teal-400">
                      <PillarIcon type={p.icon} />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white">{p.title}</h3>
                      <p className="text-sm text-teal-400/80">{p.subtitle}</p>
                    </div>
                  </div>
                  <ul className="mt-5 grid gap-2 sm:grid-cols-2">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-[13px] text-slate-400">
                        <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-teal-500/60" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ═══ AI SECTION ═════════════════════════ */}
        <section id="ai" className="relative overflow-hidden border-y border-white/[0.04] bg-[#0a1628] py-20 md:py-28">
          <div className="float-slow absolute -right-32 top-20 h-80 w-80 rounded-full bg-teal-500/[0.06] blur-[100px]" />

          <div className="relative mx-auto max-w-7xl px-6">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-teal-400">AI-Powered</p>
              <h2 className="mt-3 text-4xl font-extrabold text-white md:text-5xl">
                Intelligence built into<br />every workflow.
              </h2>
              <p className="mt-4 text-base text-slate-400">
                Four AI engines working across consultations, diagnostics, patient engagement, and predictive analytics.
              </p>
            </div>

            <div className="mt-14 grid gap-5 md:grid-cols-2">
              {AI_FEATURES.map((ai) => (
                <article
                  key={ai.tag}
                  className="group rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 transition hover:border-teal-500/20 hover:bg-white/[0.04] md:p-8"
                >
                  <div className="mb-4 overflow-hidden rounded-xl border border-white/[0.04] bg-white/[0.02]">
                    <img src={ai.image} alt={ai.tag} className="h-48 w-full object-cover" loading="lazy" />
                  </div>
                  <span className="inline-block rounded-lg bg-teal-500/10 px-3 py-1 text-[11px] font-bold text-teal-400">
                    {ai.tag}
                  </span>
                  <h3 className="mt-3 text-lg font-bold text-white">{ai.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">{ai.description}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {ai.highlights.map((h) => (
                      <span key={h} className="rounded-full border border-slate-700 px-3 py-1 text-[11px] font-semibold text-slate-500 transition group-hover:border-teal-500/30 group-hover:text-teal-400/80">
                        {h}
                      </span>
                    ))}
                  </div>
                </article>
              ))}
            </div>

            <div className="mt-10 rounded-2xl border border-teal-500/10 bg-[linear-gradient(180deg,rgba(20,184,166,0.04),rgba(255,255,255,0.015))] p-6 md:p-8">
              <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-teal-400">CDSS for Doctors</p>
                  <h3 className="mt-3 text-3xl font-extrabold text-white md:text-4xl">
                    Clinical decision support at the point of care.
                  </h3>
                  <p className="mt-4 text-sm leading-relaxed text-slate-300 md:text-base">
                    Mediqzy includes a real CDSS layer in the backend, not just generic chatbot text. Doctors can query it by specialty and category to get structured help with clinical guidelines, differential diagnosis, lab planning, ICD-10 suggestions, medication alternatives, and drug interaction warnings.
                  </p>

                  <div className="mt-6 grid gap-3 sm:grid-cols-2">
                    {[
                      { label: 'Query types', value: 'Diagnosis, treatment, dosage, labs, interactions' },
                      { label: 'Knowledge sources', value: 'Medical KB, Gale content, BMJ-aligned sources, PDFs' },
                      { label: 'Medication help', value: 'CIMS alternatives, pricing, schedule, interactions' },
                      { label: 'Doctor output', value: 'Warnings, ICD-10, differentials, references' },
                    ].map((item) => (
                      <div key={item.label} className="rounded-2xl border border-white/[0.06] bg-black/10 px-4 py-4">
                        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-teal-300/80">{item.label}</p>
                        <p className="mt-2 text-sm text-slate-300">{item.value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="rounded-2xl border border-white/[0.06] bg-black/10 p-5 md:p-6">
                    <p className="text-sm font-bold text-white">What CDSS actually helps a doctor do</p>
                    <div className="mt-5 grid gap-3">
                      {CDSS_POINTS.map((point) => (
                        <div key={point} className="flex items-start gap-3">
                          <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-teal-400" />
                          <p className="text-sm leading-relaxed text-slate-400">{point}</p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-6 rounded-2xl border border-teal-500/10 bg-teal-500/[0.04] px-4 py-4">
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-300/80">Clinical Safety Positioning</p>
                      <p className="mt-2 text-sm leading-relaxed text-slate-300">
                        CDSS is designed to support doctor judgment, not replace it. It accelerates review, surfaces evidence and medication risks, and helps clinicians start from a better-informed position.
                      </p>
                    </div>

                    <div className="mt-6 rounded-2xl border border-teal-400/10 bg-slate-950/70 p-4 md:p-5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-teal-400/20 bg-teal-400/[0.08] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-teal-300">Sample CDSS Output</span>
                        <span className="rounded-full border border-white/[0.06] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Cardiology</span>
                        <span className="rounded-full border border-white/[0.06] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Differential + Labs + Safety</span>
                      </div>

                      <div className="mt-4 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
                        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Doctor Query</p>
                        <p className="mt-2 text-sm leading-relaxed text-slate-200">
                          58-year-old male with exertional chest pain, diabetes, and uncontrolled hypertension. Help with differential diagnosis, initial labs, and medication safety before consultation.
                        </p>
                      </div>

                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
                          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-teal-300/80">Top Differential</p>
                          <div className="mt-3 space-y-2 text-sm text-slate-300">
                            <p>1. Stable angina with high cardiovascular risk</p>
                            <p>2. ACS to rule out urgently</p>
                            <p>3. GERD / musculoskeletal pain as lower-probability causes</p>
                          </div>
                        </div>
                        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
                          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-teal-300/80">Suggested Workup</p>
                          <div className="mt-3 space-y-2 text-sm text-slate-300">
                            <p>ECG and serial troponin</p>
                            <p>HbA1c, renal function, lipid profile</p>
                            <p>Chest X-ray and echocardiography if indicated</p>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-4 md:grid-cols-[1.05fr_0.95fr]">
                        <div className="rounded-2xl border border-red-400/10 bg-red-400/[0.04] p-4">
                          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-red-200/80">Medication Safety Alert</p>
                          <p className="mt-3 text-sm leading-relaxed text-slate-300">
                            If NSAIDs are being considered for pain control, check renal profile and antihypertensive regimen first. CDSS flags a possible blood-pressure worsening and renal-risk interaction in diabetic hypertensive patients.
                          </p>
                        </div>
                        <div className="rounded-2xl border border-emerald-400/10 bg-emerald-400/[0.04] p-4">
                          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-200/80">Structured Support</p>
                          <div className="mt-3 space-y-2 text-sm text-slate-300">
                            <p>ICD-10 shortlist: I20.9, I10, E11.9</p>
                            <p>Guideline hints: AHA / ESC chest pain pathways</p>
                            <p>CIMS alternatives and interaction checks available before prescribing</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ TELEMEDICINE HIGHLIGHT ═════════════ */}
        <section aria-label="Telemedicine" className="bg-[#07101f] py-20 md:py-28">
          <div className="mx-auto max-w-7xl px-6">
            <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-teal-400">Telemedicine</p>
                <h2 className="mt-3 text-3xl font-extrabold text-white md:text-4xl">
                  Secure video consultations with AI built in.
                </h2>
                <p className="mt-4 text-base text-slate-400">
                  4-layer cryptographic security. LiveKit-powered rooms. AI Scribe transcribes live. AI Vision analyzes images during calls. Prescriptions generated before hangup.
                </p>
                <div className="mt-6 grid grid-cols-2 gap-3">
                  {TELEMEDICINE_FEATURES.map((f) => (
                    <div key={f} className="flex items-start gap-2">
                      <svg className="mt-1 h-4 w-4 flex-shrink-0 text-teal-400" fill="none" viewBox="0 0 16 16">
                        <path d="M3 8l3.5 3.5L13 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <span className="text-[13px] text-slate-400">{f}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="relative">
                <div className="absolute -inset-6 rounded-3xl bg-teal-500/[0.04] blur-2xl" />
                <div className="relative rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3">
                  <img src="/vectors/telemedicine.svg" alt="Secure video consultation with AI Scribe live transcription and AI Vision" className="w-full rounded-xl" loading="lazy" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ SOLUTIONS (7 Entity Types) ═════════ */}
        <section id="solutions" className="border-t border-white/[0.04] bg-[#0a1628] py-20 md:py-28">
          <div className="mx-auto max-w-7xl px-6">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-teal-400">Solutions</p>
              <h2 className="mt-3 text-4xl font-extrabold text-white md:text-5xl">
                Seven portals.<br />One ecosystem.
              </h2>
              <p className="mt-4 text-base text-slate-400">
                Hospitals, clinics, labs, pharmacies, ambulances, homecare, and corporate — each gets a dedicated portal with role-specific features.
              </p>
            </div>

            <div className="mt-12 grid gap-6 lg:grid-cols-[260px_1fr]">
              {/* Tabs */}
              <div className="scrollbar-hide flex gap-2 overflow-x-auto lg:flex-col lg:gap-2">
                {SOLUTIONS.map((s, i) => (
                  <button
                    key={s.label}
                    type="button"
                    className={`flex flex-shrink-0 items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold transition ${
                      solutionIdx === i
                        ? 'bg-gradient-to-r from-teal-500/20 to-teal-600/10 border border-teal-500/30 text-teal-400'
                        : 'border border-transparent text-slate-500 hover:text-slate-300'
                    }`}
                    onClick={() => setSolutionIdx(i)}
                  >
                    <span className="text-lg">{s.badge}</span>
                    {s.label}
                  </button>
                ))}
              </div>

              {/* Content */}
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 md:p-10">
                <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{sol.badge}</span>
                      <h3 className="text-2xl font-bold text-white">{sol.label}</h3>
                    </div>
                    <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400">
                      {sol.description}
                    </p>
                    <div className="mt-5 flex flex-wrap gap-2">
                      {sol.modules.map((m) => (
                        <span key={m} className="rounded-lg bg-teal-500/10 px-3 py-1.5 text-xs font-bold text-teal-400">
                          {m}
                        </span>
                      ))}
                    </div>
                    <div className="mt-6 flex gap-3">
                      <a href="#demo" className="rounded-lg bg-teal-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-teal-400">
                        Get Started
                      </a>
                      <a href={sol.tryUrl} className="rounded-lg border border-slate-700 px-5 py-2.5 text-sm font-bold text-slate-400 transition hover:text-white">
                        Try Free
                      </a>
                    </div>
                  </div>
                  <div className="overflow-hidden rounded-xl border border-white/[0.04] bg-white/[0.02]">
                    <img src={sol.image} alt={sol.label} className="w-full" loading="lazy" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ PRODUCTS GRID ══════════════════════ */}
        <section id="products" className="bg-[#07101f] py-20 md:py-28">
          <div className="mx-auto max-w-7xl px-6">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-teal-400">Products</p>
            <h2 className="mt-3 text-4xl font-extrabold text-white md:text-5xl">
              30+ modules. One login.
            </h2>

            <div className="mt-10 flex gap-2 overflow-x-auto">
              {PRODUCT_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  className={`flex-shrink-0 rounded-lg px-5 py-2.5 text-sm font-bold transition ${
                    prodTab === tab.key
                      ? 'bg-teal-500 text-white shadow-lg shadow-teal-500/20'
                      : 'border border-slate-800 text-slate-500 hover:text-slate-300'
                  }`}
                  onClick={() => setProdTab(tab.key)}
                >
                  {tab.label}
                  <span className="ml-2 rounded bg-white/10 px-1.5 py-0.5 text-[10px]">{tab.count}</span>
                </button>
              ))}
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {PRODUCTS[prodTab].map((name) => (
                <div
                  key={name}
                  className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-4 text-sm font-medium text-slate-300 transition hover:border-teal-500/20 hover:text-white"
                >
                  {name}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══ RURAL PHARMACY TELE-CLINIC PITCH ═══ */}
        <section id="rural-clinic" className="relative overflow-hidden border-y border-white/[0.04] bg-gradient-to-b from-[#07101f] via-[#0a1628] to-[#07101f] py-20 md:py-28">
          <div className="float-slow absolute -right-32 top-20 h-80 w-80 rounded-full bg-emerald-500/[0.06] blur-[120px]" />
          <div className="float-fast absolute -left-20 bottom-10 h-60 w-60 rounded-full bg-teal-400/[0.05] blur-[100px]" />

          <div className="relative mx-auto max-w-7xl px-6">
            <div className="grid gap-14 lg:grid-cols-2 lg:items-center">
              {/* Left — Pitch content */}
              <div>
                <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs font-semibold text-emerald-400">New Revenue Opportunity for Rural Pharmacies</span>
                </div>

                <h2 className="text-3xl font-extrabold leading-tight text-white md:text-5xl">
                  Turn your pharmacy into a{' '}
                  <span className="primary-grad">Tele-Consultation Clinic.</span>
                </h2>

                <p className="mt-5 text-base leading-relaxed text-slate-400 md:text-lg">
                  Globally, there are 5M+ pharmacies yet doctor access remains limited in underserved regions. Your pharmacy is already the first point of contact for healthcare. Now make it official — launch a virtual clinic from your counter.
                </p>

                <div className="mt-8 space-y-4">
                  {[
                    { icon: '💊', title: 'You already have the trust', desc: 'Patients walk in daily. Add doctor consultations and become a one-stop health hub.' },
                    { icon: '📱', title: 'Zero infrastructure needed', desc: 'Just a tablet or smartphone. Mediczy provides the platform — video consult, AI Scribe, e-prescription, all built in.' },
                    { icon: '🩺', title: 'Access to 1000+ doctors', desc: 'Connect patients to verified specialists via tele-consultation. Doctors available in 20+ languages across multiple time zones.' },
                    { icon: '💰', title: 'New revenue stream', desc: 'Earn per consultation + prescription fulfillment. A ₹200 consult turns into ₹800 with medicines. Multiply footfall.' },
                    { icon: '📋', title: 'e-Prescriptions auto-generated', desc: 'AI Scribe transcribes the consultation. Prescription is generated before the call ends — dispensed immediately at your counter.' },
                    { icon: '🏥', title: 'On-premise, your data stays private', desc: 'Not a SaaS cloud service. Runs on your own system. Patient records never leave your premises.' },
                  ].map((item) => (
                    <div key={item.title} className="flex gap-4">
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-lg">
                        {item.icon}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white">{item.title}</p>
                        <p className="mt-0.5 text-sm text-slate-400">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-8 flex flex-wrap gap-3">
                  <a
                    href="#demo"
                    className="group relative rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-7 py-3.5 text-sm font-bold text-white shadow-xl shadow-emerald-500/20 transition hover:-translate-y-0.5 hover:shadow-emerald-500/30"
                  >
                    Start Your Virtual Clinic
                  </a>
                  <a
                    href="tel:+917826911911"
                    className="rounded-xl border border-slate-700 bg-white/[0.03] px-7 py-3.5 text-sm font-bold text-slate-300 transition hover:border-slate-500 hover:text-white"
                  >
                    Call Us: +91 782-691-1911
                  </a>
                </div>
              </div>

              {/* Right — Visual pitch card */}
              <div className="space-y-5">
                {/* Revenue calculator card */}
                <div className="rounded-2xl border border-emerald-500/20 bg-white/[0.03] p-6 backdrop-blur md:p-8">
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-400">Revenue Calculator</p>
                  <h3 className="mt-2 text-xl font-bold text-white">What a rural pharmacy can earn</h3>
                  <div className="mt-5 space-y-3">
                    {[
                      { label: 'Consultations per day', value: '15–25', icon: '🩺' },
                      { label: 'Avg. consult fee', value: '₹200', icon: '💵' },
                      { label: 'Medicines per consult', value: '₹400–600', icon: '💊' },
                      { label: 'Daily revenue uplift', value: '₹9,000–15,000', icon: '📈' },
                      { label: 'Monthly additional income', value: '₹2.7L–4.5L', icon: '🏦' },
                    ].map((row) => (
                      <div key={row.label} className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className="text-base">{row.icon}</span>
                          <span className="text-sm text-slate-400">{row.label}</span>
                        </div>
                        <span className="text-sm font-bold text-emerald-400">{row.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* How it works mini-flow */}
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 md:p-8">
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-teal-400">How It Works</p>
                  <h3 className="mt-2 text-lg font-bold text-white">3 steps to launch your virtual clinic</h3>
                  <div className="mt-5 space-y-4">
                    {[
                      { step: '01', title: 'Register your pharmacy', desc: 'Sign up on Mediczy. We set up your on-premise virtual clinic portal with tele-consultation, AI Scribe, and pharmacy billing.' },
                      { step: '02', title: 'Patient walks in', desc: 'Patient comes for a health concern. You initiate a video call with a doctor on the Mediczy platform right from your counter.' },
                      { step: '03', title: 'Consult → Prescribe → Dispense', desc: 'Doctor consults via video. AI Scribe generates the prescription live. You dispense medicines on the spot. Done in 10 minutes.' },
                    ].map((s) => (
                      <div key={s.step} className="flex gap-4">
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-teal-500/15 text-xs font-extrabold text-teal-400">
                          {s.step}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-white">{s.title}</p>
                          <p className="mt-0.5 text-xs text-slate-500">{s.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Social proof stats */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { num: '5M+', label: 'Pharmacies worldwide' },
                    { num: '70%', label: 'In underserved regions' },
                    { num: '1:1500', label: 'Doctor to patient ratio' },
                  ].map((s) => (
                    <div key={s.label} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-center">
                      <p className="text-xl font-extrabold text-white">{s.num}</p>
                      <p className="mt-1 text-[10px] text-slate-500">{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ IMPACT / STATS ═════════════════════ */}
        <section id="impact" ref={statsRef} className="relative overflow-hidden border-y border-white/[0.04] bg-[#0a1628] py-20 md:py-28">
          <div className="float-slow absolute -left-24 top-10 h-64 w-64 rounded-full bg-teal-500/[0.06] blur-[100px]" />

          <div className="relative mx-auto max-w-7xl px-6">
            <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-teal-400">Impact</p>
                <h2 className="mt-3 text-4xl font-extrabold text-white md:text-5xl">
                  Growing worldwide.
                </h2>

                <div className="mt-14 grid gap-8 grid-cols-2">
                  {STATS.map((s) => (
                    <StatCard key={s.label} stat={s} visible={statsVisible} />
                  ))}
                </div>
              </div>
              <div className="relative">
                <div className="absolute -inset-4 rounded-3xl bg-teal-500/[0.04] blur-2xl" />
                <img src="/vectors/world-map.svg" alt="Mediczy global healthcare presence across 15+ countries" className="relative w-full rounded-2xl" loading="lazy" />
              </div>
            </div>
          </div>
        </section>

        {/* ═══ EMPOWERING TEAMS ═══════════════════ */}
        <section aria-label="Empowering your teams" className="bg-[#07101f] py-20 md:py-28">
          <div className="mx-auto max-w-7xl px-6">
            <div className="text-center">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-teal-400">Built for Everyone</p>
              <h2 className="mt-3 text-4xl font-extrabold text-white md:text-5xl">
                Empowering your teams.
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-base text-slate-400">
                From doctors and nurses to patients, ambulance crews to insurance desks — Mediczy gives every stakeholder a purpose-built experience.
              </p>
            </div>

            <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {[
                { image: '/vectors/caricature-doctor.svg', title: 'For Doctors', desc: 'Tablet-first EMR, AI Scribe for dictation, CDSS for clinical guidance, smart prescription support, and patient analytics — all in one dashboard.' },
                { image: '/vectors/caricature-nurse.svg', title: 'For Nurses', desc: 'Mobile-first workflow with vitals capture, shift handoff, medication administration, and real-time care plan updates.' },
                { image: '/vectors/caricature-patient.svg', title: 'For Patients', desc: 'Health app with appointment booking, video consults, lab reports, prescriptions, health score tracking, and streaks.' },
                { emoji: '🚑', title: 'For Ambulance Crews', desc: 'GPS dispatch, AI triage, live vital monitoring, nearest-hospital routing, and real-time coordination with ER teams — before the patient arrives.' },
                { emoji: '🛡️', title: 'For Insurance Desks', desc: 'End-to-end claims lifecycle — pre-auth, eligibility checks, TPA coordination, document submission, query handling, settlement tracking, and policyholder care management.' },
                { emoji: '🏢', title: 'For Hospital Corporate Team', desc: 'Corporate tie-ups & MOUs, onsite health camps, executive health check-ups, OHS services, corporate SPOC management, lounge access, IP/OP priority, red carpet & green channel services, and organizational health analytics.' },
              ].map((p) => (
                <div key={p.title} className="group rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 text-center transition hover:border-teal-500/20 hover:bg-white/[0.04]">
                  {p.image ? (
                    <div className="mx-auto h-52 w-40 overflow-hidden">
                      <img src={p.image} alt={p.title} className="h-full w-full object-contain" loading="lazy" />
                    </div>
                  ) : (
                    <div className="mx-auto flex h-52 w-40 items-center justify-center">
                      <span className="text-7xl">{p.emoji}</span>
                    </div>
                  )}
                  <h3 className="mt-4 text-lg font-bold text-white">{p.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">{p.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══ TESTIMONIALS ═══════════════════════ */}
        <section aria-label="Testimonials" className="bg-[#07101f] py-20 md:py-28">
          <div className="mx-auto max-w-7xl px-6">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-teal-400">Testimonials</p>
            <h2 className="mt-3 text-4xl font-extrabold text-white md:text-5xl">
              Trusted by healthcare leaders.
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-400 md:text-base">
              From hospital administrators and clinical directors to solo practitioners and ambulance networks — hear how Mediqzy is transforming daily workflows.
            </p>

            <div className="testimonial-scroll mt-12 flex gap-5 overflow-x-auto pb-4">
              {TESTIMONIALS.map((t) => (
                <article
                  key={t.name}
                  className="w-[320px] flex-shrink-0 snap-start rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 transition hover:border-teal-500/20 hover:bg-white/[0.03] md:w-[380px]"
                >
                  <div className="mb-4 text-4xl leading-none text-teal-500/40">&ldquo;</div>
                  <p className="text-sm leading-relaxed text-slate-400">{t.quote}</p>
                  <div className="mt-6 flex items-center gap-3 border-t border-white/[0.06] pt-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-500/10 text-xs font-bold text-teal-400">
                      {t.name.split(' ').map((w) => w[0]).join('').slice(0, 2)}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">{t.name}</p>
                      <p className="text-xs text-slate-500">{t.role}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ═══ COMPLIANCE ═════════════════════════ */}
        <section id="compliance" aria-label="Compliance and integrations" className="border-t border-white/[0.04] bg-[#0a1628] py-14 md:py-20">
          <div className="mx-auto max-w-7xl px-6">
            <p className="mb-4 text-center text-xs font-bold uppercase tracking-[0.2em] text-teal-400">
              Compliance & Integrations
            </p>
            <h2 className="mx-auto max-w-3xl text-center text-3xl font-extrabold text-white md:text-4xl">
              Enterprise-ready by design.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-center text-sm leading-relaxed text-slate-400 md:text-base">
              Built to fit real hospital environments with interoperable standards, communication infrastructure, payments, and health data integrations already accounted for.
            </p>
            <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {COMPLIANCE_GROUPS.map((group) => (
                <article key={group.title} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-400">{group.title}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {group.items.map((item) => (
                      <span key={item} className="rounded-full border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-[11px] font-semibold text-slate-300">
                        {item}
                      </span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ═══ FAQ ═════════════════════════════════ */}
        <section id="faq" className="bg-[#07101f] py-20 md:py-28">
          <div className="mx-auto max-w-3xl px-6">
            <h2 className="text-center text-4xl font-extrabold text-white md:text-5xl">
              Frequently Asked Questions
            </h2>
            <div className="mt-12 space-y-3">
              {FAQS.map((faq, i) => (
                <div key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.02]">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-6 py-5 text-left text-[15px] font-semibold text-white transition hover:text-teal-400"
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    aria-expanded={openFaq === i}
                  >
                    <span>{faq.q}</span>
                    <span className={`ml-4 text-lg text-slate-600 transition-transform duration-300 ${openFaq === i ? 'rotate-45 text-teal-400' : ''}`}>
                      +
                    </span>
                  </button>
                  <div className={`faq-body ${openFaq === i ? 'faq-body-open' : ''}`}>
                    <div className="px-6 pb-5 text-sm leading-relaxed text-slate-400">
                      {faq.a}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══ CTA + DEMO FORM ════════════════════ */}
        <section id="demo" className="relative overflow-hidden border-t border-white/[0.04] bg-[#0a1628] py-20 md:py-28">
          <div className="float-slow absolute -right-32 bottom-0 h-72 w-72 rounded-full bg-teal-500/[0.06] blur-[100px]" />

          <div className="relative mx-auto max-w-7xl px-6">
            <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
              <div>
                <h2 className="text-4xl font-extrabold text-white md:text-5xl">
                  Ready to run your hospital like a system?
                </h2>
                <p className="mt-4 text-lg text-slate-400">
                  30+ modules. 7 entity types. 4 AI engines. One platform.
                </p>
                <div className="mt-8 space-y-4">
                  <a href="mailto:support@mediqzy.com" className="flex items-center gap-3 text-sm text-slate-400 transition hover:text-white">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500/10 text-base">{'✉'}</span>
                    support@mediqzy.com
                  </a>
                  <a href="https://wa.me/917826911911" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 text-sm text-slate-400 transition hover:text-white">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-500/10 text-base">{'💬'}</span>
                    +91 782-691-1911
                  </a>
                  <a href="tel:+917826911911" className="flex items-center gap-3 text-sm text-slate-400 transition hover:text-white">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500/10 text-base">{'📞'}</span>
                    +91 782-691-1911
                  </a>
                </div>

                <div className="mt-10 grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-2xl font-extrabold text-white">30+</p>
                    <p className="text-xs text-slate-500">Modules</p>
                  </div>
                  <div>
                    <p className="text-2xl font-extrabold text-white">7</p>
                    <p className="text-xs text-slate-500">Entity Types</p>
                  </div>
                  <div>
                    <p className="text-2xl font-extrabold text-white">4</p>
                    <p className="text-xs text-slate-500">AI Engines</p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-8 backdrop-blur">
                <p className="mb-2 text-lg font-bold text-white">Plan a tailored product walkthrough</p>
                <p className="mb-6 text-sm leading-relaxed text-slate-400">
                  Send your requirements. We capture the lead, notify our team by email, and continue the conversation on WhatsApp for the fastest response.
                </p>
                <form onSubmit={handleDemoSubmit} className="space-y-4">
                  {/* Honeypot — invisible to humans; bots fill it, triggering silent rejection */}
                  <input type="text" name="_gotcha" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{position:'absolute',left:'-9999px',opacity:0,height:0,width:0,overflow:'hidden'}} />
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-500">Name *</label>
                      <input type="text" name="name" required className="form-input" placeholder="Your name" />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-500">Organization</label>
                      <input type="text" name="organization" className="form-input" placeholder="Hospital / Clinic" />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-500">Phone *</label>
                    <div className="flex gap-2">
                      <span className="flex items-center rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 text-sm text-slate-500">+91</span>
                      <input type="tel" name="phone" required className="form-input" placeholder="Phone number" />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-500">Email *</label>
                    <input type="email" name="email" required className="form-input" placeholder="your@email.com" />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-500">Entity Type</label>
                    <select name="entityType" className="form-input" defaultValue="" required>
                      <option value="" disabled>Select type</option>
                      <option>Hospital</option>
                      <option>Clinic</option>
                      <option>Laboratory</option>
                      <option>Pharmacy</option>
                      <option>Ambulance Service</option>
                      <option>Homecare Provider</option>
                      <option>Corporate</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-500">What do you want to see?</label>
                    <textarea name="requirements" rows="4" className="form-input resize-none" placeholder="Example: EMR + billing + insurance claims + telemedicine for a 120-bed hospital" />
                  </div>
                  <button
                    type="submit"
                    disabled={demoSubmitting}
                    className="w-full rounded-lg bg-gradient-to-r from-teal-500 to-teal-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-teal-500/20 transition hover:shadow-teal-500/30"
                  >
                    {demoSubmitting ? 'Capturing Lead...' : 'Request Demo on WhatsApp'}
                  </button>
                  <p className="text-xs text-slate-500">
                    Prefer email instead? Write to <a href="mailto:support@mediqzy.com" className="text-teal-400 transition hover:text-teal-300">support@mediqzy.com</a>.
                  </p>
                  {demoError && (
                    <p className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3 text-xs leading-relaxed text-amber-200">
                      {demoError}
                    </p>
                  )}
                  {demoSubmitted && (
                    <p className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3 text-xs leading-relaxed text-emerald-300">
                      Your lead has been captured and emailed to the Mediqzy team. WhatsApp has been opened so the conversation can continue immediately.
                    </p>
                  )}
                </form>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ VISION BANNER ══════════════════════ */}
        <section id="about" aria-label="Company vision" className="relative overflow-hidden bg-[#07101f] py-24 md:py-32">
          <div className="absolute inset-0 bg-gradient-to-br from-teal-900/20 via-transparent to-cyan-900/10" />
          <div className="float-slow absolute -left-20 bottom-0 h-56 w-56 rounded-full bg-teal-500/[0.08] blur-[80px]" />
          <div className="float-fast absolute -right-20 top-0 h-56 w-56 rounded-full bg-cyan-400/[0.06] blur-[80px]" />

          <div className="relative mx-auto max-w-4xl px-6 text-center">
            <h2 className="text-5xl font-extrabold leading-tight text-white md:text-7xl">
              Futureproofing<br />
              <span className="primary-grad">Healthcare.</span>
            </h2>
            <p className="mt-6 text-base text-slate-500">by Mayden SmartHealth Pvt Ltd</p>
          </div>
        </section>
      </main>

      {/* ═══ FOOTER ═══════════════════════════════ */}
      <footer role="contentinfo" className="border-t border-white/[0.04] bg-[#07101f] pb-8 pt-14">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid gap-10 md:grid-cols-[1.5fr_1fr_1fr_1fr_1fr]">
            <div>
              <LogoBrand />
              <p className="mt-4 max-w-xs text-xs leading-relaxed text-slate-600">
                Mediqzy is a product of Mayden SmartHealth Pvt Ltd &mdash; the full-stack Hospital Operating System with 30+ integrated modules, AI diagnostics, and telemedicine.
              </p>
              <div className="mt-5 flex gap-2">
                <a href="mailto:support@mediqzy.com" className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.06] text-xs text-slate-600 transition hover:border-teal-500/30 hover:text-teal-400" aria-label="Email Mediqzy support">
                  ✉
                </a>
                <a href="https://wa.me/917826911911" target="_blank" rel="noopener noreferrer" className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.06] text-xs text-slate-600 transition hover:border-teal-500/30 hover:text-teal-400" aria-label="Chat with Mediqzy on WhatsApp">
                  💬
                </a>
                <a href="https://app.mediqzy.com/register" className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.06] text-xs text-slate-600 transition hover:border-teal-500/30 hover:text-teal-400" aria-label="Open Mediqzy application">
                  ↗
                </a>
              </div>
            </div>

            {[
              { title: 'Platform', links: [['Overview', '#platform'], ['AI & Intelligence', '#ai'], ['Solutions', '#solutions'], ['Impact', '#impact'], ['Compliance', '#compliance']] },
              { title: 'Access', links: [['Register', 'https://app.mediqzy.com/register'], ['Hospital Login', 'https://app.mediqzy.com/hospital/login'], ['Quality (NABH) Login', 'https://app.mediqzy.com/quality/login'], ['Clinic Login', 'https://app.mediqzy.com/clinic/login'], ['Corporate Login', 'https://app.mediqzy.com/corporate/login']] },
              { title: 'Contact', links: [['Book a Demo', '#demo'], ['Email Support', 'mailto:support@mediqzy.com'], ['WhatsApp', 'https://wa.me/917826911911'], ['Call Sales', 'tel:+917826911911']] },
              { title: 'Company', links: [['About Mediqzy', '#about'], ['FAQ', '#faq'], ['Rural Pharmacy', '#rural-clinic'], ['App Home', 'https://app.mediqzy.com']] },
            ].map((col) => (
              <div key={col.title}>
                <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.15em] text-slate-600">{col.title}</p>
                <ul className="space-y-2.5">
                  {col.links.map(([label, href]) => (
                    <li key={label}>
                      <a href={href} className="text-sm text-slate-500 transition hover:text-teal-400">
                        {label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-12 border-t border-white/[0.04] pt-6 text-xs text-slate-700">
            &copy; 2026 Mayden SmartHealth Pvt Ltd. All rights reserved.
          </div>
        </div>
      </footer>

      {/* ═══ MOBILE STICKY CTA ════════════════════ */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/5 bg-[#07101f]/95 p-3 backdrop-blur-lg lg:hidden">
        <a href="#demo" className="block rounded-lg bg-teal-500 py-3 text-center text-sm font-bold text-white">
          Get a Demo
        </a>
      </div>
    </>
  )
}

/* ═══ STAT CARD WITH COUNT-UP ══════════════════ */

function StatCard({ stat, visible }) {
  const numericPart = stat.number.replace(/[^0-9.]/g, '')
  const prefix = stat.number.match(/^[^0-9]*/)?.[0] || ''
  const suffix = stat.number.replace(/^[^0-9]*[0-9.]+/, '') || ''
  const counted = useCountUp(stat.number, 2200, visible)
  const display = numericPart ? `${prefix}${counted}${suffix}` : stat.number

  return (
    <div>
      <p className="text-5xl font-extrabold text-white md:text-6xl">{display}</p>
      <p className="mt-2 text-sm text-slate-500">{stat.label}</p>
    </div>
  )
}

export default App
