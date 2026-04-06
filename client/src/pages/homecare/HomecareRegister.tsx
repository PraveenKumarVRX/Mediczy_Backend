import EntityRegisterWizard, { type WizardConfig } from "@/components/EntityRegisterWizard";
import { HeartHandshake, Shield, Home, Users, Star, Clock } from "lucide-react";
import { GraduationCap, Award } from "lucide-react";

const config: WizardConfig = {
  entityKey: "homecare",
  entityLabel: "Homecare",
  EntityIcon: HeartHandshake,
  scheme: "rose",
  btnGradient: "linear-gradient(135deg, #f43f5e 0%, #ec4899 100%)",
  btnShadow: "0 4px 24px rgba(244,63,94,0.35)",
  btnHoverShadow: "0 4px 36px rgba(244,63,94,0.55)",
  panelGradient: "linear-gradient(135deg, rgba(190,18,60,0.85) 0%, rgba(131,24,67,0.75) 60%, rgba(7,16,31,0) 100%)",
  accentHex: "#f43f5e",
  entityNameLabel: "Homecare Service Name",
  entityNamePlaceholder: "CareFirst Homecare, Bengaluru",
  entityTypes: [
    "Nursing Care", "Physiotherapy at Home", "Elderly Care", "Post-Surgical Care",
    "Palliative Care", "Baby & Mother Care", "General Homecare",
  ],
  entityTypeLabel: "Service Type",
  entityTypeFieldKey: "serviceType",
  contactSectionTitle: "Service Coordinator",
  contactFields: [
    { key: "coordinatorName",  label: "Coordinator Name",         placeholder: "Priya Nair",               Icon: Users,         required: true  },
    { key: "coordinatorQual",  label: "Qualification / Cert",     placeholder: "BSc Nursing / MSc Physio", Icon: GraduationCap, required: true  },
    { key: "coordinatorCert",  label: "Certification / Reg. No",  placeholder: "INC-56789",                Icon: Award,         required: false },
  ],
  contactIdCard: {
    label: "Coordinator ID / Certificate",
    hint: "Government ID or professional certification (PDF/JPG, max 10 MB)",
  },
  requiredDocs: [
    { id: "business_reg", label: "Business Registration",          hint: "Company / LLP / trust registration" },
    { id: "staff_cert",   label: "Staff Certifications",           hint: "Nursing council / physio council certs" },
    { id: "insurance",    label: "Professional Liability Insurance", hint: "Optional but recommended" },
    { id: "id_proof",     label: "Owner / Director ID Proof",      hint: "Aadhaar, PAN or passport" },
  ],
  tagline: "India's #1 Homecare Platform",
  heroLine1: "Register Your",
  heroLine2: "Homecare Service",
  heroText: "Connect trained nurses, physiotherapists and caregivers with patients who need care at home. Build trust and grow your team.",
  features: [
    { Icon: Home,    title: "Staff Scheduling & GPS", desc: "Real-time caregiver tracking & scheduling" },
    { Icon: Shield,  title: "Background-Verified Staff", desc: "Police verification & credential checks" },
    { Icon: Users,   title: "Patient Care Plans",    desc: "Customized care plans & daily vitals log" },
    { Icon: Star,    title: "Family App Access",     desc: "Families see caregiver location & notes" },
    { Icon: Clock,   title: "24×7 Emergency Support", desc: "Hotline & immediate escalation system" },
  ],
  apiPrefix: "/homecare",
  loginPath: "/homecare/login",
  stepDetailsLabel: "Service Details",
};

export default function HomecareRegister() {
  return <EntityRegisterWizard config={config} />;
}
