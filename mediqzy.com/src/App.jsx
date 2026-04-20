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
        <span className="mt-0.5 text-[8px] font-medium tracking-[0.18em] uppercase text-amber-400/50">Wellness &amp; Care</span>
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
  { label: 'HyperGrid', href: '#hypergrid' },
  { label: 'Solutions', href: '#solutions' },
  { label: 'Products', href: '#products' },
  { label: 'Impact', href: '#impact' },
  { label: 'Blog', href: '#blog' },
  { label: 'About', href: '#about' },
  { label: 'Investors', href: '#investors' },
  { label: 'FAQ', href: '#faq' },
]

const HERO_BADGES = [
  'On-Premise Deployment',
  'HIPAA Ready',
  'GDPR Compliant',
  'HL7 FHIR',
  'ABDM Integrated',
  'NABH Ready',
  'DPIIT Recognised',
  'Startup India Registered',
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

          <nav aria-label="Main navigation" className="hidden items-center gap-6 text-[13px] font-semibold text-slate-200 lg:flex">
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
                className="block py-3 text-sm font-medium text-slate-200 transition hover:text-white"
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
            <div className="float-slow absolute -left-40 top-16 h-[500px] w-[500px] rounded-full bg-teal-500/[0.09] blur-[120px]" />
            <div className="float-fast absolute -right-32 top-40 h-[400px] w-[400px] rounded-full bg-cyan-400/[0.07] blur-[100px]" />
            <div className="absolute bottom-0 left-1/2 h-[300px] w-[600px] -translate-x-1/2 rounded-full bg-teal-600/[0.05] blur-[80px]" />
            {/* Dot grid overlay */}
            <div className="dot-grid absolute inset-0 opacity-[0.6]" />
            {/* Grid line overlay */}
            <div className="absolute inset-0 opacity-[0.025]" style={{
              backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
              backgroundSize: '60px 60px',
            }} />
          </div>

          <div className="relative mx-auto max-w-7xl px-6">
            <div className="grid gap-12 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
              <div>
                <div className="reveal-up mb-4 flex flex-wrap gap-3">
                  <div className="inline-flex items-center gap-2 rounded-full border border-teal-500/20 bg-teal-500/[0.06] px-4 py-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-teal-400 animate-pulse" />
                    <span className="text-xs font-semibold text-teal-400">30+ Integrated Modules &middot; 7 Entity Types &middot; AI-Powered</span>
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/[0.06] px-4 py-1.5">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 600" className="h-3.5 w-5 flex-shrink-0 rounded-[2px]">
                      <rect width="900" height="600" fill="#138808"/>
                      <rect width="900" height="400" fill="#fff"/>
                      <rect width="900" height="200" fill="#FF9933"/>
                      <circle cx="450" cy="300" r="90" fill="none" stroke="#000088" strokeWidth="8"/>
                      <circle cx="450" cy="300" r="10" fill="#000088"/>
                      {[...Array(24)].map((_,i) => (
                        <line key={i} x1="450" y1="216" x2="450" y2="232"
                          transform={`rotate(${i*15} 450 300)`}
                          stroke="#000088" strokeWidth="4"/>
                      ))}
                    </svg>
                    <span className="text-xs font-semibold text-amber-400">From India, for the world.</span>
                  </div>
                </div>

                <h1 className="reveal-up text-[clamp(2.4rem,5vw,4.5rem)] font-extrabold leading-[1.02] tracking-tight text-white">
                  One <span className="primary-grad">operating system</span>
                  <br />
                  for modern hospital.
                </h1>

                <p className="reveal-up mt-6 max-w-lg text-base leading-relaxed text-slate-200 md:text-lg">
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
                    <span key={b} className="rounded-full border border-slate-700 bg-slate-800/50 px-3 py-1 text-[11px] font-semibold text-slate-200">
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
                      <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-300">{item.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="reveal-up relative">
                {/* Floating live stat cards */}
                <div className="absolute -left-6 top-6 z-10 hidden xl:block">
                  <div className="rounded-xl border border-teal-500/20 bg-[#06101e]/95 px-4 py-3 shadow-2xl backdrop-blur-md">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-teal-400" />
                      <p className="text-[11px] font-bold text-white">AI Scribe Active</p>
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-400">Saved <span className="text-teal-300 font-semibold">42 min</span> today</p>
                  </div>
                </div>
                <div className="absolute -right-5 top-10 z-10 hidden xl:block">
                  <div className="rounded-xl border border-white/10 bg-[#06101e]/95 px-4 py-3 shadow-2xl backdrop-blur-md">
                    <p className="text-[11px] font-bold text-white">Patients Today</p>
                    <p className="mt-0.5 text-xl font-extrabold text-teal-400">247</p>
                    <p className="text-[10px] text-slate-400">↑ 12% vs yesterday</p>
                  </div>
                </div>
                <div className="absolute -right-5 bottom-14 z-10 hidden xl:block">
                  <div className="rounded-xl border border-emerald-500/20 bg-[#06101e]/95 px-4 py-3 shadow-2xl backdrop-blur-md">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                      <p className="text-[11px] font-bold text-white">Revenue Processed</p>
                    </div>
                    <p className="mt-0.5 text-[11px] font-extrabold text-emerald-400">₹1.2L today</p>
                  </div>
                </div>
                <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-teal-500/10 via-transparent to-cyan-500/10 blur-xl" />
                <div className="relative rounded-2xl border border-white/[0.06] bg-white/[0.03] p-2.5 backdrop-blur">
                  <img src="/vectors/hero-dashboard.svg" alt="Mediqzy Hospital OS — Dashboard with patient census, claims, revenue, and AI analytics" className="w-full rounded-xl" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ TRUST STRIP ════════════════════════ */}
        <div className="border-y border-white/[0.04] bg-[#020b16] py-7">
          <div className="mx-auto max-w-7xl px-6">
            <p className="mb-5 text-center text-[10px] font-bold uppercase tracking-[0.22em] text-slate-600">Implemented &amp; validated across healthcare institutions</p>
            <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
              {[
                { name: 'Govt. Primary Health Centres', icon: '🏛️' },
                { name: 'Private Multispecialty Hospitals', icon: '🏥' },
                { name: 'ABDM-Linked Clinics', icon: '🩺' },
                { name: 'TPA Insurance Desks', icon: '🛡️' },
                { name: 'Rural Pharmacy Networks', icon: '💊' },
                { name: 'Occupational Health Centres', icon: '🏢' },
                { name: 'Home Care Agencies', icon: '🏠' },
              ].map((inst) => (
                <span key={inst.name} className="inline-flex items-center gap-2 text-[12px] font-semibold text-slate-500 transition hover:text-slate-300">
                  <span className="text-sm">{inst.icon}</span>
                  {inst.name}
                </span>
              ))}
            </div>
          </div>
        </div>

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
              <p className="mt-5 text-base leading-relaxed text-slate-200 md:text-lg">
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
                  color: 'border-red-500/10 bg-red-500/[0.02] hover:border-red-500/20 hover:bg-red-500/[0.04]',
                  iconBg: 'bg-red-500/10',
                },
                {
                  icon: '🩺',
                  title: 'Doctors',
                  description: '2+ hours daily lost to documentation, toggling between 4–6 screens per patient, and chasing lab reports. By the time notes are done, the next patient is already waiting.',
                  stat: '40%',
                  statLabel: 'of a doctor\'s day lost to admin tasks',
                  color: 'border-orange-500/10 bg-orange-500/[0.02] hover:border-orange-500/20 hover:bg-orange-500/[0.04]',
                  iconBg: 'bg-orange-500/10',
                },
                {
                  icon: '🔬',
                  title: 'Labs',
                  description: 'Sample tracking on paper, manual report generation, no integration with ordering physicians. Results delivered late, re-tests ordered, and critical values missed in the handoff chaos.',
                  stat: '18%',
                  statLabel: 'of lab results delayed due to manual processes',
                  color: 'border-rose-500/10 bg-rose-500/[0.02] hover:border-rose-500/20 hover:bg-rose-500/[0.04]',
                  iconBg: 'bg-rose-500/10',
                },
                {
                  icon: '💊',
                  title: 'Pharmacies',
                  description: 'Inventory tracked in spreadsheets, expired stock discovered too late, prescriptions deciphered by hand. No real-time visibility into stock levels or automated reorder triggers.',
                  stat: '₹22K Cr',
                  statLabel: 'lost annually to expired pharma inventory globally',
                  color: 'border-red-500/10 bg-red-500/[0.02] hover:border-red-500/20 hover:bg-red-500/[0.04]',
                  iconBg: 'bg-red-500/10',
                },
                {
                  icon: '🏢',
                  title: 'Corporates',
                  description: 'Employee health programs run on spreadsheets and vendor emails. No unified view of workforce wellness, camp outcomes, or claims utilization. ROI on health spend is unmeasurable.',
                  stat: '60%',
                  statLabel: 'of corporate wellness programs show no measurable ROI',
                  color: 'border-orange-500/10 bg-orange-500/[0.02] hover:border-orange-500/20 hover:bg-orange-500/[0.04]',
                  iconBg: 'bg-orange-500/10',
                },
                {
                  icon: '🛡️',
                  title: 'Insurance Companies',
                  description: 'Claims are financial cover — but policyholders expect care, not just reimbursement. Insurers have zero visibility into patient journeys, can\'t coordinate care, and lose customers to competitors who offer wellness beyond paperwork.',
                  stat: '68%',
                  statLabel: 'of policyholders want care management, not just claims',
                  color: 'border-rose-500/10 bg-rose-500/[0.02] hover:border-rose-500/20 hover:bg-rose-500/[0.04]',
                  iconBg: 'bg-rose-500/10',
                },
              ].map((problem) => (
                <article
                  key={problem.title}
                  className={`group rounded-2xl border p-6 transition md:p-8 ${problem.color}`}
                >
                  <div className={`inline-flex h-12 w-12 items-center justify-center rounded-xl text-2xl ${problem.iconBg}`}>
                    {problem.icon}
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-white">{problem.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-200">{problem.description}</p>
                  <div className="mt-5 border-t border-red-500/10 pt-4">
                    <span className="text-2xl font-extrabold text-red-400/80">{problem.stat}</span>
                    <p className="mt-1 text-xs text-slate-300">{problem.statLabel}</p>
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
            <div className="grid gap-12 lg:grid-cols-[1fr_2fr] lg:items-start">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-teal-400">The Solution</p>
                <h2 className="mt-3 text-4xl font-extrabold text-white md:text-5xl">
                  Four operating systems.<br />One unified platform.
                </h2>
                <p className="mt-4 text-base text-slate-200">
                  Every module talks to every other module. No fragmentation, no data silos, no switching between tools. One on-premise platform that replaces 10+ vendors.
                </p>
                {/* Platform visual */}
                <div className="relative mt-10 overflow-hidden rounded-2xl border border-white/[0.06]">
                  <img
                    src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=600&q=75&auto=format&fit=crop"
                    alt="Hospital data analytics and operations dashboard"
                    loading="lazy"
                    className="h-48 w-full object-cover opacity-40"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#07101f] via-teal-900/20 to-transparent" />
                  <div className="absolute bottom-4 left-5 right-5">
                    <p className="text-xs font-bold text-teal-300 uppercase tracking-[0.15em]">Unified Hospital OS</p>
                    <p className="mt-1 text-[11px] text-white/60">30+ modules · 7 entity types · On-premise</p>
                  </div>
                </div>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                {PLATFORM_PILLARS.map((p) => (
                  <article
                    key={p.title}
                    className="group rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 transition hover:border-teal-500/20 hover:bg-white/[0.04] md:p-8"
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl border border-teal-500/20 bg-teal-500/10 text-teal-400 shadow-sm shadow-teal-500/10">
                        <PillarIcon type={p.icon} />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-white">{p.title}</h3>
                        <p className="text-sm text-teal-400/80">{p.subtitle}</p>
                      </div>
                    </div>
                    <ul className="mt-5 grid gap-2 sm:grid-cols-2">
                      {p.features.map((f) => (
                        <li key={f} className="flex items-start gap-2 text-[13px] text-slate-200">
                          <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-teal-500/60" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
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
              <p className="mt-4 text-base text-slate-200">
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
                  <p className="mt-2 text-sm leading-relaxed text-slate-200">{ai.description}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {ai.highlights.map((h) => (
                      <span key={h} className="rounded-full border border-slate-700 px-3 py-1 text-[11px] font-semibold text-slate-300 transition group-hover:border-teal-500/30 group-hover:text-teal-400/80">
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
                          <p className="text-sm leading-relaxed text-slate-200">{point}</p>
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
                        <span className="rounded-full border border-white/[0.06] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300">Cardiology</span>
                        <span className="rounded-full border border-white/[0.06] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300">Differential + Labs + Safety</span>
                      </div>

                      <div className="mt-4 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
                        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-300">Doctor Query</p>
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
                <p className="mt-4 text-base text-slate-200">
                  4-layer cryptographic security. LiveKit-powered rooms. AI Scribe transcribes live. AI Vision analyzes images during calls. Prescriptions generated before hangup.
                </p>
                <div className="mt-6 grid grid-cols-2 gap-3">
                  {TELEMEDICINE_FEATURES.map((f) => (
                    <div key={f} className="flex items-start gap-2">
                      <svg className="mt-1 h-4 w-4 flex-shrink-0 text-teal-400" fill="none" viewBox="0 0 16 16">
                        <path d="M3 8l3.5 3.5L13 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <span className="text-[13px] text-slate-200">{f}</span>
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

        {/* ═══ HYPERGRID — DeepTech IoT & Interoperability ═══ */}
        <section id="hypergrid" aria-label="HyperGrid DeepTech IoT and Interoperability Platform" className="relative overflow-hidden border-t border-white/[0.04] bg-[#07101f] py-20 md:py-28">
          <div className="float-slow absolute -left-40 top-10 h-[500px] w-[500px] rounded-full bg-indigo-500/[0.05] blur-[140px]" />
          <div className="float-fast absolute -right-40 bottom-10 h-[400px] w-[400px] rounded-full bg-teal-500/[0.05] blur-[120px]" />

          <div className="relative mx-auto max-w-7xl px-6">

            {/* Header */}
            <div className="mb-14 text-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/[0.07] px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.15em] text-indigo-400">
                DeepTech · HyperGrid Platform
              </span>
              <h2 className="mt-5 text-4xl font-extrabold leading-tight text-white md:text-5xl">
                The intelligent grid connecting<br />
                <span className="bg-gradient-to-r from-indigo-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">
                  every device, system &amp; stakeholder.
                </span>
              </h2>
              <p className="mx-auto mt-5 max-w-3xl text-base leading-relaxed text-slate-200">
                Beyond EMR and workflows, Mediqzy's <strong className="text-white">HyperGrid</strong> is a DeepTech infrastructure layer that connects
                medical IoT devices, hospital systems, insurance networks, and national health registries into one
                interoperable, AI-driven grid — transforming fragmented health ecosystems into unified, intelligent health systems.
              </p>
            </div>

            {/* Core pillars */}
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-16">
              {[
                {
                  icon: '📡',
                  color: 'border-indigo-500/20 bg-indigo-500/[0.04]',
                  label: 'IoT & Edge Fleet',
                  desc: 'MQTT-native device mesh connecting vitals monitors, wearables, pulse oximeters, glucometers, ECG patches, smart beds, and ambulance sensors — all streaming live telemetry into patient records in real time.',
                },
                {
                  icon: '🔗',
                  color: 'border-teal-500/20 bg-teal-500/[0.04]',
                  label: 'Full Interoperability',
                  desc: 'HL7 FHIR R4, DICOM worklist, SNOMED CT, ICD-10/11, ABDM ABHA, and custom connector API — enabling bi-directional data flow between Mediqzy and any third-party hospital system, lab, insurer, or national health registry.',
                },
                {
                  icon: '🧠',
                  color: 'border-purple-500/20 bg-purple-500/[0.04]',
                  label: 'Digital Twins',
                  desc: 'Live digital twin of every patient, ward, and hospital — continuously updated from IoT streams, lab results, and clinical events. Predictive models surface deterioration risks, bed bottlenecks, and supply gaps before they become crises.',
                },
                {
                  icon: '⚡',
                  color: 'border-cyan-500/20 bg-cyan-500/[0.04]',
                  label: 'Real-Time Event Bus',
                  desc: 'Kafka-backed event streaming layer distributing clinical alerts, device alarms, insurance pre-auth triggers, and supply chain events across every module — zero latency between what happens and who needs to know.',
                },
              ].map((p) => (
                <div key={p.label} className={`rounded-xl border ${p.color} p-6`}>
                  <div className="mb-3 text-3xl">{p.icon}</div>
                  <p className="mb-2 text-sm font-bold text-white">{p.label}</p>
                  <p className="text-xs leading-relaxed text-slate-300">{p.desc}</p>
                </div>
              ))}
            </div>

            {/* How it transforms stakeholders */}
            <div className="mb-16">
              <h3 className="mb-2 text-center text-2xl font-extrabold text-white">How HyperGrid transforms every stakeholder</h3>
              <p className="mb-10 text-center text-sm text-slate-300">One infrastructure layer — measurable impact for every role in the health system.</p>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {[
                  {
                    who: '🏥 Hospitals & ICUs',
                    accent: 'border-l-teal-500',
                    points: [
                      'Live bed census fed by IoT smart-bed sensors — zero manual census updates',
                      'ICU deterioration alerts 15–30 min earlier via continuous vitals streaming',
                      'Auto-escalation when patient twin crosses clinical threshold',
                      'DICOM image routing from any scanner to any viewer, zero integration effort',
                    ],
                  },
                  {
                    who: '👨‍⚕️ Doctors & Clinicians',
                    accent: 'border-l-indigo-500',
                    points: [
                      'Wearable and device readings appear live in the EMR without manual entry',
                      'AI CDSS enriched by real-time vitals, not just last recorded values',
                      'Telemedicine sessions with live IoT telemetry overlaid on video call',
                      'FHIR-compliant patient summary sharable with any hospital globally',
                    ],
                  },
                  {
                    who: '🚑 Ambulance & Emergency',
                    accent: 'border-l-red-500',
                    points: [
                      'Paramedic vitals stream to ER before patient arrives — zero handoff delay',
                      'GPS-tracked ambulance fleet with AI triage pre-alerting the receiving team',
                      'Patient digital twin pre-populated for ER doctors from the field',
                      'Crash cart and medication inventory tracked via RFID edge nodes',
                    ],
                  },
                  {
                    who: '🏛️ Governments & NHAs',
                    accent: 'border-l-amber-500',
                    points: [
                      'Real-time disease surveillance dashboards from anonymised event streams',
                      'ABDM-native — every patient interaction pushes to the national health stack',
                      'Aggregate population health analytics without moving raw PII off-premise',
                      'Plug-and-play compliance for new national digital health mandates',
                    ],
                  },
                  {
                    who: '🏢 Insurers & TPAs',
                    accent: 'border-l-green-500',
                    points: [
                      'Clinical event triggers auto-initiate pre-auth without manual claim filing',
                      'IoT-verified vitals as objective evidence — reducing claim disputes',
                      'Real-time eligibility checks embedded in the clinical workflow',
                      'Fraud detection via anomaly detection on device telemetry streams',
                    ],
                  },
                  {
                    who: '🔬 Labs & Diagnostics',
                    accent: 'border-l-purple-500',
                    points: [
                      'DICOM worklist sync — orders flow from EMR to modality with zero re-entry',
                      'Results stream back to patient record the moment the analyser completes',
                      'HL7 FHIR diagnostic report auto-attached to patient timeline',
                      'Multi-lab aggregation for hospital networks with one unified view',
                    ],
                  },
                ].map((s) => (
                  <div key={s.who} className={`rounded-xl border border-white/[0.06] bg-white/[0.02] border-l-2 ${s.accent} p-6`}>
                    <p className="mb-4 text-sm font-bold text-white">{s.who}</p>
                    <ul className="space-y-2">
                      {s.points.map((pt) => (
                        <li key={pt} className="flex items-start gap-2 text-xs leading-relaxed text-slate-300">
                          <span className="mt-0.5 text-teal-500 flex-shrink-0">›</span>
                          {pt}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>

            {/* Tech stack strip */}
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 mb-16">
              <h3 className="mb-7 text-center text-xs font-bold uppercase tracking-[0.15em] text-slate-200">HyperGrid Technology Stack</h3>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { layer: 'Device Layer', items: ['MQTT v5 broker', 'BLE / Bluetooth', 'RFID edge nodes', 'Wearable SDKs', 'Ambulance telemetry'], icon: '📟' },
                  { layer: 'Interoperability', items: ['HL7 FHIR R4', 'DICOM 3.0', 'SNOMED CT', 'ICD-10 / ICD-11', 'ABDM / ABHA APIs'], icon: '🔗' },
                  { layer: 'Intelligence Layer', items: ['Digital twin engine', 'Kafka event bus', 'Predictive deterioration', 'Anomaly detection', 'CDSS integration'], icon: '🧠' },
                  { layer: 'Compliance & Security', items: ['On-premise deployment', 'End-to-end encryption', 'RBAC + audit trails', 'HIPAA / GDPR ready', 'Zero-trust architecture'], icon: '🛡️' },
                ].map((t) => (
                  <div key={t.layer} className="text-center">
                    <div className="mb-2 text-2xl">{t.icon}</div>
                    <p className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-slate-200">{t.layer}</p>
                    <ul className="space-y-1.5">
                      {t.items.map((i) => (
                        <li key={i} className="text-xs text-slate-200">{i}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>

            {/* Vision statement */}
            <div className="rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/[0.04] via-transparent to-teal-500/[0.03] p-10 text-center">
              <p className="mx-auto max-w-3xl text-xl font-extrabold leading-tight text-white md:text-2xl">
                "A hospital is no longer just a building.<br />
                <span className="bg-gradient-to-r from-indigo-400 to-teal-400 bg-clip-text text-transparent">
                  It is a node in a living, intelligent health grid."
                </span>
              </p>
              <p className="mt-4 text-sm text-slate-300">
                HyperGrid makes that vision deployable today — on your own infrastructure, under your control.
              </p>
              <a href="#demo" className="mt-7 inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-500 to-teal-500 px-7 py-3.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 transition hover:shadow-indigo-500/30">
                See HyperGrid in Action →
              </a>
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
              <p className="mt-4 text-base text-slate-200">
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
                        : 'border border-transparent text-slate-300 hover:text-slate-300'
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
                    <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-200">
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
                      <a href={sol.tryUrl} className="rounded-lg border border-slate-700 px-5 py-2.5 text-sm font-bold text-slate-200 transition hover:text-white">
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
                      : 'border border-slate-800 text-slate-300 hover:text-slate-300'
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

                <p className="mt-5 text-base leading-relaxed text-slate-200 md:text-lg">
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
                        <p className="mt-0.5 text-sm text-slate-200">{item.desc}</p>
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
                {/* Pharmacy visual */}
                <div className="card-img-zoom relative overflow-hidden rounded-2xl border border-emerald-500/20">
                  <img
                    src="https://images.unsplash.com/photo-1559757175-5700dde675bc?w=800&q=75&auto=format&fit=crop"
                    alt="Rural pharmacy offering telemedicine consultations through Mediqzy"
                    loading="lazy"
                    className="h-44 w-full object-cover opacity-40"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#07101f] via-emerald-900/30 to-transparent" />
                  <div className="absolute bottom-4 left-5 right-5">
                    <p className="text-sm font-bold text-emerald-300">₹2.7L–4.5L / month additional revenue</p>
                    <p className="mt-1 text-xs text-white/60">For a rural pharmacy running 15–25 tele-consults / day</p>
                  </div>
                </div>

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
                          <span className="text-sm text-slate-200">{row.label}</span>
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
                          <p className="mt-0.5 text-xs text-slate-300">{s.desc}</p>
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
                      <p className="mt-1 text-[10px] text-slate-300">{s.label}</p>
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

        {/* ═══ BLOG ═══════════════════════════════ */}
        <section id="blog" aria-label="Mediqzy healthcare technology blog" className="relative overflow-hidden border-t-2 border-teal-500/40 bg-[#020b16] py-20 md:py-28">
          <div className="float-slow absolute -left-32 top-20 h-[500px] w-[500px] rounded-full bg-teal-500/[0.07] blur-[140px]" />
          <div className="float-fast absolute -right-24 bottom-10 h-[380px] w-[380px] rounded-full bg-indigo-500/[0.06] blur-[120px]" />

          <div className="relative mx-auto max-w-7xl px-6">
            {/* Header */}
            <div className="mb-14 text-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-teal-500/40 bg-teal-500/10 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-teal-300">
                ✦ Insights &amp; Resources
              </span>
              <h2 className="mt-5 text-4xl font-extrabold leading-tight text-white md:text-5xl">
                From the Mediqzy blog
              </h2>
              <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-white/80">
                Deep dives into AI in healthcare, hospital operations, compliance, and the technology reshaping patient care globally.
              </p>
            </div>

            {/* Featured post */}
            <article
              aria-label="Featured article: Why India's Hospitals Are Moving to an AI-Powered Hospital Operating System"
              className="card-img-zoom group mb-8 grid overflow-hidden rounded-2xl border border-teal-500/20 bg-gradient-to-br from-teal-500/[0.08] via-white/[0.03] to-indigo-500/[0.06] transition hover:border-teal-500/30 md:grid-cols-[1fr_2fr]"
            >
              <div className="relative flex items-center justify-center overflow-hidden bg-[#07101f] p-10 text-center md:p-14">
                <img
                  src="https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=800&q=75&auto=format&fit=crop"
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover opacity-25"
                />
                <div className="absolute inset-0 bg-gradient-to-br from-teal-900/70 via-[#07101f]/60 to-indigo-900/60" />
                <div className="relative text-center">
                  <div className="mb-3 inline-flex items-center justify-center rounded-2xl border border-teal-500/30 bg-teal-500/10 p-5 text-6xl shadow-xl shadow-teal-500/20 backdrop-blur-sm">🏥</div>
                  <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.2em] text-teal-300">Featured</p>
                  <p className="mt-2 text-sm font-medium text-white/70">Industry Trends · 8 min read</p>
                </div>
              </div>
              <div className="p-8 md:p-10">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-500/15 px-3 py-1 text-[11px] font-bold text-teal-300">Industry Trends</span>
                <h3 className="mt-4 text-2xl font-extrabold leading-tight text-white transition-colors group-hover:text-teal-200 md:text-3xl">
                  Why India's Hospitals Are Moving to an AI-Powered Hospital Operating System in 2026
                </h3>
                <p className="mt-4 text-base leading-relaxed text-white/75">
                  The traditional HMIS built in the 2000s — siloed OPD software, disconnected lab systems, manual billing — cannot support modern care complexity. We break down why 2026 is the inflection point for hospital digitisation in India and why an OS-paradigm changes everything for both patients and administrators.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {['Hospital OS', 'Digital Health India', 'AI Healthcare', 'ABDM'].map((tag) => (
                    <span key={tag} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-semibold text-white/70">{tag}</span>
                  ))}
                </div>
                <div className="mt-6 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-500/25 text-sm font-bold text-teal-200">M</div>
                    <div>
                      <p className="text-xs font-bold text-white">Mediqzy Research</p>
                      <time dateTime="2026-04-15" className="text-xs text-white/55">April 15, 2026</time>
                    </div>
                  </div>
                  <a href="#demo" className="rounded-lg border border-teal-400/40 bg-teal-500/10 px-5 py-2.5 text-sm font-bold text-teal-300 transition hover:bg-teal-500/20 hover:text-teal-200">
                    Read Article →
                  </a>
                </div>
              </div>
            </article>

            {/* Post grid */}
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 mb-12">
              {[
                {
                  emoji: '🤖', cat: 'AI & Technology', catColor: 'text-indigo-200 bg-indigo-500/25',
                  date: '2026-04-10', dateLabel: 'April 10, 2026', readTime: '6 min read',
                  img: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=600&q=75&auto=format&fit=crop',
                  imgGrad: 'from-indigo-900/80 via-slate-900/60 to-transparent',
                  title: 'AI Medical Scribe: How 207 Clinical Abbreviations Get Auto-Expanded in Real Time',
                  excerpt: 'Doctors lose 2+ hours daily to documentation. Mediqzy\'s AI Scribe understands clinical shorthand, expands abbreviations, and auto-populates structured prescriptions with zero keystrokes.',
                  tags: ['AI Scribe', 'Doctor Productivity'],
                },
                {
                  emoji: '📋', cat: 'Compliance', catColor: 'text-amber-200 bg-amber-500/25',
                  date: '2026-04-05', dateLabel: 'April 5, 2026', readTime: '7 min read',
                  img: 'https://images.unsplash.com/photo-1532375810709-75b1da00537c?w=600&q=75&auto=format&fit=crop',
                  imgGrad: 'from-amber-900/80 via-slate-900/60 to-transparent',
                  title: 'ABDM Compliance Guide for Indian Hospitals: ABHA, PHR & Consent Framework Explained',
                  excerpt: 'India\'s Ayushman Bharat Digital Mission is reshaping health data ownership. The complete technical guide to ABHA linking, PHR integration, and consent manager workflows your hospital must implement.',
                  tags: ['ABDM', 'ABHA'],
                },
                {
                  emoji: '📡', cat: 'IoT & HyperGrid', catColor: 'text-teal-200 bg-teal-500/25',
                  date: '2026-03-30', dateLabel: 'March 30, 2026', readTime: '5 min read',
                  img: 'https://images.unsplash.com/photo-1581056771107-24ca5f033842?w=600&q=75&auto=format&fit=crop',
                  imgGrad: 'from-teal-900/80 via-slate-900/60 to-transparent',
                  title: 'IoT in the ICU: How MQTT-Based Edge Computing Reduces Adverse Events by 30%',
                  excerpt: 'Connecting bedside monitors, ventilators, and infusion pumps to your HMS no longer requires a million-dollar integration. HyperGrid makes continuous ICU monitoring a 2-week deployment.',
                  tags: ['IoT Healthcare', 'Patient Safety'],
                },
                {
                  emoji: '📱', cat: 'Telemedicine', catColor: 'text-purple-200 bg-purple-500/25',
                  date: '2026-03-22', dateLabel: 'March 22, 2026', readTime: '6 min read',
                  img: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=600&q=75&auto=format&fit=crop',
                  imgGrad: 'from-purple-900/80 via-slate-900/60 to-transparent',
                  title: 'Telemedicine for Tier 2 & 3 India: Closing the Doctor-to-Patient Gap with Technology',
                  excerpt: 'With 75% of specialist doctors in Tier 1 cities, telemedicine is India\'s only scalable bridge. Real deployment data from Mediqzy\'s rural virtual clinic network across South India.',
                  tags: ['Telemedicine', 'Rural Healthcare'],
                },
                {
                  emoji: '🏦', cat: 'Insurance & Billing', catColor: 'text-green-200 bg-green-500/25',
                  date: '2026-03-15', dateLabel: 'March 15, 2026', readTime: '5 min read',
                  img: 'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=600&q=75&auto=format&fit=crop',
                  imgGrad: 'from-green-900/80 via-slate-900/60 to-transparent',
                  title: 'Insurance Pre-Auth in 4 Hours, Not 4 Days: How HMS Automation Transforms Cashless Claims',
                  excerpt: 'Pre-authorization delays cost hospitals cash flow and patients peace of mind. Event-driven claims automation compresses the cashless cycle from days to hours.',
                  tags: ['Health Insurance', 'Pre-Auth'],
                },
                {
                  emoji: '🛡️', cat: 'Compliance & Security', catColor: 'text-rose-200 bg-rose-500/25',
                  date: '2026-03-08', dateLabel: 'March 8, 2026', readTime: '8 min read',
                  img: 'https://images.unsplash.com/photo-1510511459019-5dda7724fd87?w=600&q=75&auto=format&fit=crop',
                  imgGrad: 'from-rose-900/80 via-slate-900/60 to-transparent',
                  title: 'HIPAA, GDPR & PDPB: The Complete Healthcare Data Compliance Checklist for 2026',
                  excerpt: 'Hospitals operating globally must navigate three overlapping regulatory frameworks. This checklist covers encryption, data residency, audit trails, and consent workflows.',
                  tags: ['HIPAA', 'GDPR'],
                },
              ].map((post) => (
                <article
                  key={post.title}
                  aria-label={`Blog article: ${post.title}`}
                  className="card-img-zoom group flex flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03] transition hover:border-teal-500/30 hover:shadow-lg hover:shadow-teal-500/[0.08]"
                >
                  {/* Image header */}
                  <div className="relative h-44 overflow-hidden">
                    <img
                      src={post.img}
                      alt=""
                      aria-hidden="true"
                      loading="lazy"
                      className="absolute inset-0 h-full w-full object-cover opacity-55"
                    />
                    <div className={`absolute inset-0 bg-gradient-to-t ${post.imgGrad}`} />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#020b16] via-transparent to-transparent opacity-70" />
                    <div className="absolute bottom-3 left-4 flex items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold backdrop-blur-sm ${post.catColor}`}>{post.cat}</span>
                      <span className="text-[10px] font-medium text-white/70">{post.readTime}</span>
                    </div>
                    <div className="absolute right-4 top-4 text-3xl leading-none drop-shadow-lg">{post.emoji}</div>
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <h3 className="flex-1 text-sm font-extrabold leading-snug text-white transition-colors group-hover:text-teal-200">
                      {post.title}
                    </h3>
                    <p className="mt-3 text-sm leading-relaxed text-white/65">{post.excerpt}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {post.tags.map((t) => (
                        <span key={t} className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-white/60">{t}</span>
                      ))}
                    </div>
                    <div className="mt-4 flex items-center justify-between border-t border-white/[0.06] pt-4">
                      <time dateTime={post.date} className="text-xs text-white/50">{post.dateLabel}</time>
                      <a href="#demo" className="text-sm font-bold text-teal-400 transition hover:text-teal-200">Read →</a>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            {/* Subscribe CTA */}
            <div className="rounded-2xl border border-teal-500/20 bg-gradient-to-br from-teal-500/[0.07] via-transparent to-indigo-500/[0.05] p-10">
              <div className="mx-auto max-w-3xl text-center">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-teal-400">Stay ahead of the curve</p>
                <h3 className="mt-3 text-2xl font-extrabold text-white md:text-3xl">
                  Healthcare technology is moving fast.<br />
                  <span className="bg-gradient-to-r from-teal-400 to-cyan-300 bg-clip-text text-transparent">Don't get left behind.</span>
                </h3>
                <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-white/70">
                  In-depth guides on AI in healthcare, ABDM compliance, hospital operations, and DeepTech implementation — written by the engineers and clinicians building Mediqzy.
                </p>
                <div className="mt-7 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                  <a href="#demo" className="rounded-lg bg-gradient-to-r from-teal-500 to-cyan-500 px-7 py-3.5 text-sm font-bold text-white shadow-lg shadow-teal-500/25 transition hover:shadow-teal-500/40">
                    Subscribe to Insights
                  </a>
                  <a href="#demo" className="rounded-lg border border-white/10 bg-white/[0.03] px-7 py-3.5 text-sm font-bold text-white/80 transition hover:border-white/20 hover:text-white">
                    View all articles →
                  </a>
                </div>
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
              <p className="mx-auto mt-4 max-w-xl text-base text-slate-200">
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
                  <p className="mt-2 text-sm leading-relaxed text-slate-200">{p.desc}</p>
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
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-200 md:text-base">
              From hospital administrators and clinical directors to solo practitioners and ambulance networks — hear how Mediqzy is transforming daily workflows.
            </p>

            <div className="testimonial-scroll mt-12 flex gap-5 overflow-x-auto pb-4">
              {TESTIMONIALS.map((t) => (
                <article
                  key={t.name}
                  className="w-[320px] flex-shrink-0 snap-start rounded-2xl border border-white/[0.06] bg-gradient-to-b from-white/[0.04] to-white/[0.02] p-6 transition hover:border-teal-500/20 hover:shadow-xl hover:shadow-teal-500/[0.06] md:w-[380px]"
                >
                  {/* Star rating */}
                  <div className="mb-3 flex gap-0.5">
                    {[0,1,2,3,4].map((i) => (
                      <svg key={i} className="h-4 w-4 star-fill" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    ))}
                  </div>
                  <div className="mb-4 text-4xl leading-none text-teal-500/40">&ldquo;</div>
                  <p className="text-sm leading-relaxed text-slate-200">{t.quote}</p>
                  <div className="mt-6 flex items-center gap-3 border-t border-white/[0.06] pt-4">
                    <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-cyan-600 text-xs font-bold text-white shadow-md shadow-teal-500/30">
                      {t.name.split(' ').map((w) => w[0]).join('').slice(0, 2)}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">{t.name}</p>
                      <p className="text-xs text-slate-300">{t.role}</p>
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
            <p className="mx-auto mt-4 max-w-2xl text-center text-sm leading-relaxed text-slate-200 md:text-base">
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
                    <span className={`ml-4 text-lg text-slate-200 transition-transform duration-300 ${openFaq === i ? 'rotate-45 text-teal-400' : ''}`}>
                      +
                    </span>
                  </button>
                  <div className={`faq-body ${openFaq === i ? 'faq-body-open' : ''}`}>
                    <div className="px-6 pb-5 text-sm leading-relaxed text-slate-200">
                      {faq.a}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══ INVESTORS ═══════════════════════════ */}
        <section id="investors" aria-label="Investor relations" className="relative overflow-hidden border-t border-white/[0.04] bg-[#0a1628] py-20 md:py-28">
          <div className="float-slow absolute -left-32 top-0 h-96 w-96 rounded-full bg-amber-500/[0.04] blur-[120px]" />
          <div className="float-fast absolute -right-32 bottom-0 h-80 w-80 rounded-full bg-teal-500/[0.04] blur-[100px]" />

          <div className="relative mx-auto max-w-7xl px-6">
            {/* Header */}
            <div className="mb-14 text-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/[0.06] px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.15em] text-amber-400">
                Investor Relations
              </span>
              <h2 className="mt-5 text-4xl font-extrabold text-white md:text-5xl">
                Building the backbone of<br />
                <span className="primary-grad">global healthcare.</span>
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-slate-200">
                Mediqzy is a DPIIT-recognised DeepTech company operating at the intersection of AI, clinical workflows,
                and health infrastructure — targeting a <strong className="text-white">$50B+ global HMS market</strong> with an on-premise,
                privacy-first architecture that no SaaS competitor can match.
              </p>
            </div>

            {/* Opportunity stats */}
            <div className="grid grid-cols-2 gap-5 sm:grid-cols-4 mb-14">
              {[
                { n: '$50B+', label: 'Global HMS market', sub: 'growing at 12% CAGR' },
                { n: '70K+', label: 'Hospitals in India', sub: 'mostly undigitised' },
                { n: '7', label: 'Revenue streams', sub: 'across entity types' },
                { n: '30+', label: 'Modules shipped', sub: 'production-ready today' },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-6 text-center">
                  <p className="text-3xl font-extrabold text-white">{s.n}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-300">{s.label}</p>
                  <p className="mt-0.5 text-[11px] text-slate-200">{s.sub}</p>
                </div>
              ))}
            </div>

            {/* Why invest */}
            <div className="grid gap-5 md:grid-cols-3 mb-14">
              {[
                {
                  icon: '🔒',
                  title: 'On-Premise Moat',
                  body: 'Hospitals and governments globally are tightening data-sovereignty regulations. Our on-premise architecture is a structural competitive moat that cloud-only SaaS cannot replicate without re-architecting from scratch.',
                  accent: 'border-teal-500/20',
                },
                {
                  icon: '🤖',
                  title: 'AI-Native from Day One',
                  body: 'Four embedded AI engines — Scribe, Vision, CDSS, and Dr. iSHA — are already in production, not roadmap. AI is not a layer we bolt on; it is the core of how the platform operates.',
                  accent: 'border-purple-500/20',
                },
                {
                  icon: '🌐',
                  title: 'Global-Ready Architecture',
                  body: 'Multi-tenant, multi-language (20+ languages), multi-currency, and multi-regulatory (HIPAA, GDPR, ABDM, NABH). A single deployment serves hospitals from Chennai to Chicago.',
                  accent: 'border-amber-500/20',
                },
                {
                  icon: '🏥',
                  title: 'Deep South India Traction',
                  body: 'Ground-level implementation experience across Tamil Nadu, Karnataka, Andhra Pradesh, Kerala, and Telangana — validating product-market fit in one of the world\'s most demanding healthcare markets.',
                  accent: 'border-blue-500/20',
                },
                {
                  icon: '🎓',
                  title: 'IIT Madras Ecosystem',
                  body: 'IIT Madras Research Park partner. Access to world-class research, talent pipeline, and institutional credibility — the strongest DeepTech incubation ecosystem in South Asia.',
                  accent: 'border-cyan-500/20',
                },
                {
                  icon: '📈',
                  title: 'Multiple Revenue Vectors',
                  body: 'Licensing fees, SaaS subscriptions for cloud-hybrid clients, marketplace commissions, insurance TPA integrations, telemedicine platform fees, and API access for third-party developers.',
                  accent: 'border-green-500/20',
                },
              ].map((c) => (
                <div key={c.title} className={`rounded-xl border ${c.accent} bg-white/[0.02] p-6`}>
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.04] text-xl shadow-sm">
                    {c.icon}
                  </div>
                  <p className="mb-2 text-sm font-bold text-white">{c.title}</p>
                  <p className="text-xs leading-relaxed text-slate-300">{c.body}</p>
                </div>
              ))}
            </div>

            {/* Recognitions strip */}
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 mb-14">
              <p className="mb-5 text-center text-xs font-bold uppercase tracking-[0.15em] text-slate-200">Validated &amp; Recognised By</p>
              <div className="flex flex-wrap justify-center gap-3">
                {[
                  { label: 'DPIIT Recognised Startup', icon: '🏛️' },
                  { label: 'Startup India Registered', icon: '🇮🇳' },
                  { label: 'IIT Madras Partner', icon: '🎓' },
                  { label: 'Telemedicine Society of India', icon: '🩺' },
                  { label: 'ABDM / ABHA Integrated', icon: '🏥' },
                  { label: 'HL7 FHIR Compliant', icon: '🔗' },
                ].map((r) => (
                  <span key={r.label} className="inline-flex items-center gap-2 rounded-full border border-white/[0.06] bg-white/[0.02] px-4 py-2 text-xs font-medium text-slate-200">
                    {r.icon} {r.label}
                  </span>
                ))}
              </div>
            </div>

            {/* CTA */}
            <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/[0.04] to-transparent p-8 text-center">
              <p className="text-xl font-bold text-white">Interested in partnering or investing?</p>
              <p className="mt-2 text-sm text-slate-200">We are open to strategic investors, healthcare VCs, and institutional partners who share our vision of transforming healthcare infrastructure globally.</p>
              <div className="mt-6 flex flex-wrap justify-center gap-4">
                <a
                  href="mailto:invest@mediqzy.com"
                  className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-6 py-3 text-sm font-bold text-[#07101f] shadow-lg shadow-amber-500/20 transition hover:bg-amber-400"
                >
                  ✉ invest@mediqzy.com
                </a>
                <a
                  href="https://wa.me/917826911911"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-6 py-3 text-sm font-bold text-white transition hover:bg-white/[0.06]"
                >
                  💬 WhatsApp
                </a>
                <a
                  href="#demo"
                  className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-6 py-3 text-sm font-bold text-white transition hover:bg-white/[0.06]"
                >
                  Request a Deck →
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ CTA + DEMO FORM ════════════════════ */}
        <section id="demo" className="relative overflow-hidden border-t border-white/[0.04] bg-[#0a1628] py-20 md:py-28">
          {/* Background photo with overlay */}
          <div className="pointer-events-none absolute inset-0">
            <img
              src="https://images.unsplash.com/photo-1538108149393-fbbd81895907?w=1600&auto=format&fit=crop&q=60"
              alt=""
              className="h-full w-full object-cover object-center opacity-[0.07]"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#0a1628] via-[#0a1628]/90 to-[#0a1628]/70" />
          </div>
          <div className="float-slow absolute -right-32 bottom-0 h-72 w-72 rounded-full bg-teal-500/[0.06] blur-[100px]" />

          <div className="relative mx-auto max-w-7xl px-6">
            <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
              <div>
                <h2 className="text-4xl font-extrabold text-white md:text-5xl">
                  Ready to run your hospital like a system?
                </h2>
                <p className="mt-4 text-lg text-slate-200">
                  30+ modules. 7 entity types. 4 AI engines. One platform.
                </p>
                <div className="mt-8 space-y-4">
                  <a href="mailto:support@mediqzy.com" className="flex items-center gap-3 text-sm text-slate-200 transition hover:text-white">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500/10 text-base">{'✉'}</span>
                    support@mediqzy.com
                  </a>
                  <a href="https://wa.me/917826911911" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 text-sm text-slate-200 transition hover:text-white">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-500/10 text-base">{'💬'}</span>
                    +91 782-691-1911
                  </a>
                  <a href="tel:+917826911911" className="flex items-center gap-3 text-sm text-slate-200 transition hover:text-white">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500/10 text-base">{'📞'}</span>
                    +91 782-691-1911
                  </a>
                </div>

                <div className="mt-10 grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-2xl font-extrabold text-white">30+</p>
                    <p className="text-xs text-slate-300">Modules</p>
                  </div>
                  <div>
                    <p className="text-2xl font-extrabold text-white">7</p>
                    <p className="text-xs text-slate-300">Entity Types</p>
                  </div>
                  <div>
                    <p className="text-2xl font-extrabold text-white">4</p>
                    <p className="text-xs text-slate-300">AI Engines</p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-8 backdrop-blur">
                <p className="mb-2 text-lg font-bold text-white">Plan a tailored product walkthrough</p>
                <p className="mb-6 text-sm leading-relaxed text-slate-200">
                  Send your requirements. We capture the lead, notify our team by email, and continue the conversation on WhatsApp for the fastest response.
                </p>
                <form onSubmit={handleDemoSubmit} className="space-y-4">
                  {/* Honeypot — invisible to humans; bots fill it, triggering silent rejection */}
                  <input type="text" name="_gotcha" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{position:'absolute',left:'-9999px',opacity:0,height:0,width:0,overflow:'hidden'}} />
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-300">Name *</label>
                      <input type="text" name="name" required className="form-input" placeholder="Your name" />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-300">Organization</label>
                      <input type="text" name="organization" className="form-input" placeholder="Hospital / Clinic" />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-300">Phone *</label>
                    <div className="flex gap-2">
                      <span className="flex items-center rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 text-sm text-slate-300">+91</span>
                      <input type="tel" name="phone" required className="form-input" placeholder="Phone number" />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-300">Email *</label>
                    <input type="email" name="email" required className="form-input" placeholder="your@email.com" />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-300">Entity Type</label>
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
                    <label className="mb-1.5 block text-xs font-medium text-slate-300">What do you want to see?</label>
                    <textarea name="requirements" rows="4" className="form-input resize-none" placeholder="Example: EMR + billing + insurance claims + telemedicine for a 120-bed hospital" />
                  </div>
                  <button
                    type="submit"
                    disabled={demoSubmitting}
                    className="w-full rounded-lg bg-gradient-to-r from-teal-500 to-teal-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-teal-500/20 transition hover:shadow-teal-500/30"
                  >
                    {demoSubmitting ? 'Capturing Lead...' : 'Request Demo on WhatsApp'}
                  </button>
                  <p className="text-xs text-slate-300">
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

        {/* ═══ ABOUT US ═══════════════════════════ */}
        <section id="about" aria-label="About Mediqzy" className="relative overflow-hidden bg-[#07101f] py-20 md:py-28">
          <div className="absolute inset-0 bg-gradient-to-br from-teal-900/10 via-transparent to-cyan-900/05" />
          <div className="float-slow absolute -left-32 bottom-0 h-96 w-96 rounded-full bg-teal-500/[0.06] blur-[120px]" />
          <div className="float-fast absolute -right-32 top-0 h-80 w-80 rounded-full bg-cyan-400/[0.05] blur-[100px]" />

          <div className="relative mx-auto max-w-7xl px-6">
            {/* Hero banner for About */}
            <div className="relative mb-14 overflow-hidden rounded-2xl border border-white/[0.06]">
              <img
                src="https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=1400&q=75&auto=format&fit=crop"
                alt="Medical team at work — Mediqzy powers healthcare innovation"
                loading="lazy"
                className="h-56 w-full object-cover opacity-30 md:h-72"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-[#07101f] via-[#07101f]/60 to-transparent" />
              <div className="absolute inset-0 flex flex-col justify-center px-8 md:px-14">
                <span className="inline-flex w-fit items-center gap-2 rounded-full border border-teal-500/20 bg-teal-500/[0.08] px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.15em] text-teal-400">
                  About Us
                </span>
                <h2 className="mt-4 text-4xl font-extrabold leading-tight text-white md:text-5xl">
                  Futureproofing<br />
                  <span className="primary-grad">Healthcare.</span>
                </h2>
              </div>
            </div>

            {/* Intro copy */}
            <div className="mb-12 text-center">
              <p className="mx-auto max-w-2xl text-base leading-relaxed text-slate-200">
                We are <strong className="text-white">Mayden SmartHealth Pvt Ltd</strong> — a <strong className="text-teal-400">DeepTech healthcare company</strong> building
                the next generation of hospital operating systems. <strong className="text-white">IIT Madras partner</strong>, DPIIT-recognised,
                Startup India registered, and a proud member of the <strong className="text-white">Telemedicine Society of India</strong> — with proven
                expertise in deploying integrated health systems across <strong className="text-white">South India</strong>.
                <br /><br />
                <span className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/[0.06] px-4 py-1.5 text-xs font-semibold text-amber-400">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 600" className="h-3.5 w-5 flex-shrink-0 rounded-[2px]">
                    <rect width="900" height="600" fill="#138808"/>
                    <rect width="900" height="400" fill="#fff"/>
                    <rect width="900" height="200" fill="#FF9933"/>
                    <circle cx="450" cy="300" r="90" fill="none" stroke="#000088" strokeWidth="8"/>
                    <circle cx="450" cy="300" r="10" fill="#000088"/>
                    {[...Array(24)].map((_,i) => (
                      <line key={i} x1="450" y1="216" x2="450" y2="232"
                        transform={`rotate(${i*15} 450 300)`}
                        stroke="#000088" strokeWidth="4"/>
                    ))}
                  </svg>
                  From India, for the world.
                </span>
              </p>
            </div>

            {/* Mission + Story */}
            <div className="grid gap-8 md:grid-cols-2 mb-16">
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-teal-500/10 text-xl">🎯</div>
                <h3 className="mb-3 text-lg font-bold text-white">Our Mission</h3>
                <p className="text-sm leading-relaxed text-slate-200">
                  To eliminate the operational chaos that plagues hospitals and clinics — fragmented software,
                  paper workflows, insurance delays, and disconnected care — by replacing them with one
                  intelligent, on-premise platform that puts clinicians and patients first.
                </p>
              </div>
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/10 text-xl">💡</div>
                <h3 className="mb-3 text-lg font-bold text-white">Our Story</h3>
                <p className="text-sm leading-relaxed text-slate-200">
                  Mediqzy started from a simple observation: doctors spend more time on paperwork than on patients.
                  Born in South India and incubated within the IIT Madras ecosystem, we set out to build the hospital
                  operating system we wished existed — one that handles EMR, billing, insurance, AI transcription,
                  telemedicine, and 30+ workflows in a single platform, deployed on your servers so your data never
                  leaves your walls. We have hands-on implementation experience across hospitals, clinics, and labs
                  throughout Tamil Nadu, Karnataka, Andhra Pradesh, Kerala, and Telangana.
                </p>
              </div>
            </div>

            {/* Recognitions & Affiliations */}
            <div className="mb-16">
              <h3 className="mb-8 text-center text-sm font-bold uppercase tracking-[0.15em] text-slate-200">Recognitions &amp; Affiliations</h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                {[
                  { icon: '🎓', title: 'IIT Madras', sub: 'Partner Company', color: 'border-blue-500/20 bg-blue-500/[0.04]' },
                  { icon: '🏛️', title: 'DPIIT', sub: 'Recognised Startup', color: 'border-amber-500/20 bg-amber-500/[0.04]' },
                  { icon: '🇮🇳', title: 'Startup India', sub: 'Registered', color: 'border-orange-500/20 bg-orange-500/[0.04]' },
                  { icon: '🩺', title: 'Telemedicine Society', sub: 'of India — Member', color: 'border-teal-500/20 bg-teal-500/[0.04]' },
                  { icon: '🤖', title: 'DeepTech', sub: 'Healthcare Company', color: 'border-purple-500/20 bg-purple-500/[0.04]' },
                ].map((r) => (
                  <div key={r.title} className={`rounded-xl border ${r.color} p-5 text-center`}>
                    <div className="mb-2 text-2xl">{r.icon}</div>
                    <p className="text-sm font-bold text-white leading-tight">{r.title}</p>
                    <p className="mt-1 text-[11px] text-slate-300 leading-snug">{r.sub}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* South India Presence */}
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 mb-16">
              <div className="flex flex-col items-center gap-6 md:flex-row">
                <div className="text-5xl flex-shrink-0">🗺️</div>
                <div>
                  <h3 className="text-lg font-bold text-white mb-2">Deep Roots in South India</h3>
                  <p className="text-sm leading-relaxed text-slate-200">
                    We have on-the-ground implementation experience deploying Mediqzy at hospitals, multi-specialty
                    clinics, diagnostic laboratories, and homecare providers across <strong className="text-white">Tamil Nadu, Karnataka,
                    Andhra Pradesh, Kerala, and Telangana</strong>. Our team understands the regulatory landscape, language
                    diversity, and operational realities of South Indian healthcare — from tier-1 corporate hospitals
                    to rural primary health centres.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {['Tamil Nadu', 'Karnataka', 'Andhra Pradesh', 'Kerala', 'Telangana'].map(state => (
                      <span key={state} className="inline-flex items-center rounded-full border border-teal-500/20 bg-teal-500/[0.06] px-3 py-1 text-xs font-medium text-teal-400">
                        {state}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Values */}
            <div className="mb-16">
              <h3 className="mb-8 text-center text-sm font-bold uppercase tracking-[0.15em] text-slate-200">What We Stand For</h3>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { icon: '🔒', title: 'Data Sovereignty', body: 'On-premise deployment. Every byte of patient data lives on your own servers — never on a third-party cloud.' },
                  { icon: '🤝', title: 'Clinician-First', body: 'Every feature is designed around how doctors and nurses actually work, reducing clicks and cognitive load.' },
                  { icon: '🌍', title: 'Global Compliance', body: 'HIPAA, GDPR, ABDM, NABH, HL7 FHIR — built for global deployment without regulatory compromise.' },
                  { icon: '⚡', title: 'Relentless Innovation', body: 'AI Scribe, AI Vision, CDSS, Dr. iSHA — we ship clinically meaningful AI that works in real wards today.' },
                ].map((v) => (
                  <div key={v.title} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-6">
                    <div className="mb-3 text-2xl">{v.icon}</div>
                    <p className="mb-2 text-sm font-bold text-white">{v.title}</p>
                    <p className="text-xs leading-relaxed text-slate-300">{v.body}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Company Stats */}
            <div className="rounded-2xl border border-teal-500/10 bg-gradient-to-br from-teal-500/[0.04] to-cyan-500/[0.02] p-8 mb-16">
              <h3 className="mb-8 text-center text-sm font-bold uppercase tracking-[0.15em] text-slate-200">Mediqzy by the Numbers</h3>
              <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
                {[
                  { n: '30+', label: 'Integrated Modules' },
                  { n: '7', label: 'Entity Types Supported' },
                  { n: '4', label: 'AI Engines' },
                  { n: '20+', label: 'Languages (Dr. iSHA)' },
                ].map((s) => (
                  <div key={s.label} className="text-center">
                    <p className="text-4xl font-extrabold text-white">{s.n}</p>
                    <p className="mt-1.5 text-xs text-slate-300">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Team */}
            <div className="mb-16">
              <h3 className="mb-8 text-center text-sm font-bold uppercase tracking-[0.15em] text-slate-200">Built By</h3>
              <div className="grid gap-5 sm:grid-cols-3">
                {[
                  { role: 'Engineering', desc: 'Full-stack engineers and AI/ML specialists with deep healthcare domain expertise, building scalable on-premise systems.', icon: '⚙️' },
                  { role: 'Clinical Advisors', desc: 'Practising doctors and hospital administrators who shape every workflow to match real-world clinical realities.', icon: '🩺' },
                  { role: 'Compliance & Security', desc: 'Legal, data-privacy, and security experts ensuring HIPAA, GDPR, ABDM, and NABH requirements are met globally.', icon: '🛡️' },
                ].map((t) => (
                  <div key={t.role} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-6 text-center">
                    <div className="mb-3 text-3xl">{t.icon}</div>
                    <p className="mb-2 text-sm font-bold text-white">{t.role}</p>
                    <p className="text-xs leading-relaxed text-slate-300">{t.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Contact strip */}
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
              <p className="text-base font-bold text-white">Get in touch</p>
              <p className="mt-2 text-sm text-slate-300">We&rsquo;d love to hear from healthcare providers, investors, and partners.</p>
              <div className="mt-5 flex flex-wrap justify-center gap-4">
                <a href="mailto:support@mediqzy.com" className="inline-flex items-center gap-2 rounded-lg bg-teal-500/10 px-5 py-2.5 text-sm font-medium text-teal-400 transition hover:bg-teal-500/20">
                  ✉ support@mediqzy.com
                </a>
                <a href="https://wa.me/917826911911" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-green-500/10 px-5 py-2.5 text-sm font-medium text-green-400 transition hover:bg-green-500/20">
                  💬 WhatsApp
                </a>
                <a href="#demo" className="inline-flex items-center gap-2 rounded-lg bg-white/[0.05] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-white/10">
                  Book a Demo →
                </a>
              </div>
              <p className="mt-6 text-xs text-slate-300">Mayden SmartHealth Pvt Ltd · Registered in India</p>
            </div>
          </div>
        </section>
      </main>

      {/* ═══ FOOTER ═══════════════════════════════ */}
      <footer role="contentinfo" className="border-t border-white/[0.04] bg-[#07101f] pb-8 pt-14">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid gap-10 md:grid-cols-[1.5fr_1fr_1fr_1fr_1fr]">
            <div>
              <LogoBrand />
              <p className="mt-4 max-w-xs text-xs leading-relaxed text-slate-200">
                Mediqzy is a DeepTech healthcare product of Mayden SmartHealth Pvt Ltd &mdash; IIT Madras partner, DPIIT recognised, Startup India registered, and a member of the Telemedicine Society of India. From India, for the world.
              </p>
              <address className="mt-4 not-italic max-w-xs text-xs leading-relaxed text-slate-300">
                📍 Mayden SmartHealth Pvt Ltd<br />
                D-Block, 4th Floor<br />
                IIT Madras Research Park<br />
                Tharamani, Chennai — 600 113<br />
                India
              </address>
              <div className="mt-5 flex gap-2">
                <a href="mailto:support@mediqzy.com" className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.06] text-xs text-slate-200 transition hover:border-teal-500/30 hover:text-teal-400" aria-label="Email Mediqzy support">
                  ✉
                </a>
                <a href="https://wa.me/917826911911" target="_blank" rel="noopener noreferrer" className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.06] text-xs text-slate-200 transition hover:border-teal-500/30 hover:text-teal-400" aria-label="Chat with Mediqzy on WhatsApp">
                  💬
                </a>
                <a href="https://www.facebook.com/profile.php?id=61570684224966" target="_blank" rel="noopener noreferrer" className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.06] text-slate-200 transition hover:border-blue-500/40 hover:text-blue-400" aria-label="Mediqzy on Facebook">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                    <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.268h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>
                  </svg>
                </a>
                <a href="https://app.mediqzy.com/register" className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.06] text-xs text-slate-200 transition hover:border-teal-500/30 hover:text-teal-400" aria-label="Open Mediqzy application">
                  ↗
                </a>
              </div>
            </div>

            {[
              { title: 'Platform', links: [['Overview', '#platform'], ['AI & Intelligence', '#ai'], ['HyperGrid IoT', '#hypergrid'], ['Solutions', '#solutions'], ['Impact', '#impact'], ['Compliance', '#compliance']] },
              { title: 'Access', links: [['Register', 'https://app.mediqzy.com/register'], ['Hospital Login', 'https://app.mediqzy.com/hospital/login'], ['Quality (NABH) Login', 'https://app.mediqzy.com/quality/login'], ['Clinic Login', 'https://app.mediqzy.com/clinic/login'], ['Corporate Login', 'https://app.mediqzy.com/corporate/login']] },
              { title: 'Contact', links: [['Book a Demo', '#demo'], ['Email Support', 'mailto:support@mediqzy.com'], ['WhatsApp', 'https://wa.me/917826911911'], ['Call Sales', 'tel:+917826911911']] },
              { title: 'Company', links: [['About Mediqzy', '#about'], ['Blog & Insights', '#blog'], ['Investors', '#investors'], ['FAQ', '#faq'], ['Rural Pharmacy', '#rural-clinic'], ['App Home', 'https://app.mediqzy.com']] },
            ].map((col) => (
              <div key={col.title}>
                <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.15em] text-slate-200">{col.title}</p>
                <ul className="space-y-2.5">
                  {col.links.map(([label, href]) => (
                    <li key={label}>
                      <a href={href} className="text-sm text-slate-300 transition hover:text-teal-400">
                        {label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-12 border-t border-white/[0.04] pt-6 text-xs text-slate-300">
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
      <p className="mt-2 text-sm text-slate-300">{stat.label}</p>
    </div>
  )
}

export default App
