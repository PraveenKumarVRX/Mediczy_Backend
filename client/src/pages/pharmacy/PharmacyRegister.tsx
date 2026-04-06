import EntityRegisterWizard, { type WizardConfig } from "@/components/EntityRegisterWizard";
import { Pill, Shield, Package, Users, Star, Clock } from "lucide-react";
import { GraduationCap, BookOpen } from "lucide-react";

const config: WizardConfig = {
  entityKey: "pharmacy",
  entityLabel: "Pharmacy",
  EntityIcon: Pill,
  scheme: "emerald",
  btnGradient: "linear-gradient(135deg, #10b981 0%, #22c55e 100%)",
  btnShadow: "0 4px 24px rgba(16,185,129,0.35)",
  btnHoverShadow: "0 4px 36px rgba(16,185,129,0.55)",
  panelGradient: "linear-gradient(135deg, rgba(5,150,105,0.85) 0%, rgba(6,95,70,0.75) 60%, rgba(7,16,31,0) 100%)",
  accentHex: "#10b981",
  entityNameLabel: "Pharmacy Name",
  entityNamePlaceholder: "MedPlus Pharmacy, Indiranagar",
  entityTypes: [
    "Retail Pharmacy", "Hospital Pharmacy", "Online Pharmacy",
    "Generic Medicine Store", "Compounding Pharmacy", "Specialty Pharmacy",
  ],
  entityTypeLabel: "Pharmacy Type",
  entityTypeFieldKey: "pharmacyType",
  contactSectionTitle: "Pharmacist-in-Charge",
  contactFields: [
    { key: "pharmacistName",  label: "Pharmacist Name",          placeholder: "Ravi Verma",          Icon: Users,         required: true  },
    { key: "pharmacistQual",  label: "Qualification",            placeholder: "B.Pharm / D.Pharm",   Icon: GraduationCap, required: true  },
    { key: "pharmacistRegNo", label: "Pharmacy Council Reg. No", placeholder: "PCI-54321",           Icon: BookOpen,      required: true  },
  ],
  contactIdCard: {
    label: "Pharmacist Registration Certificate / ID",
    hint: "Pharmacy council certificate or government ID (PDF/JPG, max 10 MB)",
  },
  requiredDocs: [
    { id: "drug_license",  label: "Drug License (Form 20 / 21)", hint: "Retail or wholesale drug license from CDSCO" },
    { id: "reg_cert",      label: "Pharmacy Registration",        hint: "State pharmacy council registration" },
    { id: "gst_cert",      label: "GST Certificate",              hint: "GST registration certificate" },
    { id: "owner_id",      label: "Owner ID Proof",               hint: "Aadhaar, PAN or passport" },
  ],
  tagline: "India's #1 Pharmacy Network",
  heroLine1: "Register Your",
  heroLine2: "Pharmacy Today",
  heroText: "Join thousands of pharmacies serving millions of patients. Manage prescriptions, inventory, and home delivery from one place.",
  features: [
    { Icon: Package, title: "Smart Inventory Manager", desc: "Real-time stock alerts & expiry tracking" },
    { Icon: Shield,  title: "e-Prescription Ready",    desc: "Accept digital prescriptions from doctors" },
    { Icon: Users,   title: "Home Delivery Module",    desc: "Integrated delivery tracking for patients" },
    { Icon: Star,    title: "Generic Substitution",    desc: "AI-suggested affordable generic alternates" },
    { Icon: Clock,   title: "24×7 Online Orders",      desc: "Accept orders round the clock" },
  ],
  apiPrefix: "/pharmacy",
  loginPath: "/pharmacy/login",
  stepDetailsLabel: "Pharmacy Details",
};

export default function PharmacyRegister() {
  return <EntityRegisterWizard config={config} />;
}
