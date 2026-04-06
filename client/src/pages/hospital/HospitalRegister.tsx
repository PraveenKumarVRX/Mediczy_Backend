import EntityRegisterWizard, { type WizardConfig } from "@/components/EntityRegisterWizard";
import { Building2, Shield, Activity, Users, Star, Clock } from "lucide-react";
import { GraduationCap, BookOpen, IdCard } from "lucide-react";

const config: WizardConfig = {
  entityKey: "hospital",
  entityLabel: "Hospital",
  EntityIcon: Building2,
  scheme: "blue",
  btnGradient: "linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)",
  btnShadow: "0 4px 24px rgba(59,130,246,0.35)",
  btnHoverShadow: "0 4px 36px rgba(59,130,246,0.55)",
  panelGradient: "linear-gradient(135deg, rgba(37,99,235,0.85) 0%, rgba(49,46,129,0.75) 60%, rgba(7,16,31,0) 100%)",
  accentHex: "#3b82f6",
  entityNameLabel: "Hospital Name",
  entityNamePlaceholder: "Apollo Hospital, Koramangala",
  entityTypes: [
    "Multi-Specialty",
    "Super-Specialty",
    "Single Specialty",
    "Community Hospital",
    "Teaching Hospital",
    "Trauma Centre",
    "Maternity & Childcare",
    "Pediatric Hospital",
  ],
  entityTypeLabel: "Hospital Type",
  entityTypeFieldKey: "hospitalType",
  contactSectionTitle: "Hospital Director / CMO",
  contactFields: [
    { key: "directorName",    label: "Director / CMO Name",     placeholder: "Dr. Suresh Kumar",          Icon: Users,        required: true  },
    { key: "directorQual",    label: "Qualification",           placeholder: "MBBS, MS (Surgery)",        Icon: GraduationCap, required: true },
    { key: "directorRegNo",   label: "Medical Council Reg. No", placeholder: "MCI-12345",                 Icon: BookOpen,     required: false },
  ],
  contactDropdown: {
    key: "medicalCouncil",
    label: "Medical Council",
    options: [
      "Medical Council of India", "NMC", "Delhi Medical Council", "Maharashtra Medical Council",
      "Karnataka Medical Council", "Tamil Nadu Medical Council", "Other State Council",
    ],
  },
  contactIdCard: {
    label: "Director ID / Medical License",
    hint: "Government ID or medical registration certificate (PDF/JPG, max 10 MB)",
  },
  requiredDocs: [
    { id: "registration_cert",  label: "Hospital Registration Certificate", hint: "State/Central health authority registration" },
    { id: "nabh_cert",          label: "NABH / JCI Certificate (if any)",   hint: "Accreditation certificate — optional but recommended" },
    { id: "fire_noc",           label: "Fire NOC",                          hint: "Fire department no-objection certificate" },
    { id: "building_plan",      label: "Approved Building Plan / MOH NOC",  hint: "MOH or local authority approval" },
  ],
  tagline: "India's #1 Hospital Platform",
  heroLine1: "Register Your",
  heroLine2: "Hospital Today",
  heroText:
    "Connect thousands of patients to your hospital instantly. Manage admissions, OPD, IPD, Labs and more — all in one platform.",
  features: [
    { Icon: Activity, title: "Smart OPD & IPD Management",   desc: "Real-time bed tracking, OPD queues & scheduling" },
    { Icon: Shield,   title: "ABDM & HIPAA Compliance",       desc: "Full regulatory compliance built-in" },
    { Icon: Users,    title: "Doctor & Staff Onboarding",     desc: "Onboard your entire clinical team easily" },
    { Icon: Star,     title: "NABH Readiness Tools",          desc: "Audit-ready checklists & documentation" },
    { Icon: Clock,    title: "24×7 Emergency Connect",        desc: "Instant alerts & ambulance coordination" },
  ],
  apiPrefix: "/hospital",
  loginPath: "/hospital/login",
  stepDetailsLabel: "Hospital Details",
};

export default function HospitalRegister() {
  return <EntityRegisterWizard config={config} />;
}
