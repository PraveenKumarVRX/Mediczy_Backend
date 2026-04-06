import EntityRegisterWizard, { type WizardConfig } from "@/components/EntityRegisterWizard";
import { FlaskConical, Shield, BarChart3, Users, Star, Clock } from "lucide-react";
import { GraduationCap, BookOpen } from "lucide-react";

const config: WizardConfig = {
  entityKey: "lab",
  entityLabel: "Lab",
  EntityIcon: FlaskConical,
  scheme: "violet",
  btnGradient: "linear-gradient(135deg, #8b5cf6 0%, #a855f7 100%)",
  btnShadow: "0 4px 24px rgba(139,92,246,0.35)",
  btnHoverShadow: "0 4px 36px rgba(139,92,246,0.55)",
  panelGradient: "linear-gradient(135deg, rgba(109,40,217,0.85) 0%, rgba(88,28,135,0.75) 60%, rgba(7,16,31,0) 100%)",
  accentHex: "#8b5cf6",
  entityNameLabel: "Lab Name",
  entityNamePlaceholder: "Metropolis Lab, Koramangala",
  entityTypes: [
    "Pathology", "Radiology", "Microbiology", "Clinical Laboratory",
    "Molecular Diagnostics", "Immunology", "Multi-Test Laboratory", "Blood Bank",
  ],
  entityTypeLabel: "Lab Type",
  entityTypeFieldKey: "labType",
  contactSectionTitle: "Lab Director",
  contactFields: [
    { key: "directorName",  label: "Lab Director / Pathologist Name", placeholder: "Dr. Anjali Sharma",    Icon: Users,         required: true  },
    { key: "directorQual",  label: "Qualification",                   placeholder: "MBBS, MD (Pathology)", Icon: GraduationCap, required: true  },
    { key: "directorRegNo", label: "Medical Council Reg. No",         placeholder: "MCI-98765",            Icon: BookOpen,      required: false },
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
    { id: "nabl_cert",         label: "NABL Accreditation Certificate", hint: "NABL-issued accreditation (if applicable)" },
    { id: "registration_cert", label: "Lab Registration Certificate",   hint: "State health authority registration" },
    { id: "owner_id",          label: "Owner / Director ID Proof",      hint: "Aadhaar, PAN or passport" },
    { id: "staff_qual",        label: "Staff Qualification Proof",      hint: "Degree certificates of technical staff" },
  ],
  tagline: "India's #1 Diagnostics Platform",
  heroLine1: "Register Your",
  heroLine2: "Lab Today",
  heroText: "Reach patients actively searching for diagnostics in your city. Manage test orders, reports, and home collections from one powerful dashboard.",
  features: [
    { Icon: BarChart3, title: "Smart Report Management",  desc: "Digital reports delivered instantly to patients" },
    { Icon: Shield,    title: "NABL Compliance Tools",    desc: "Audit-ready documentation & SOP tracking" },
    { Icon: Users,     title: "Home Sample Collection",   desc: "Integrated phlebotomist dispatch system" },
    { Icon: Star,      title: "ABDM FHIR Linked",         desc: "Reports auto-link to patient ABHA records" },
    { Icon: Clock,     title: "Same-Day TAT Tracking",    desc: "Track turnaround time and SLA alerts" },
  ],
  apiPrefix: "/lab",
  loginPath: "/lab/login",
  stepDetailsLabel: "Lab Details",
};

export default function LabRegister() {
  return <EntityRegisterWizard config={config} />;
}
