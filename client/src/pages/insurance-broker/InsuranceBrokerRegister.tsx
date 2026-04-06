import EntityRegisterWizard, { type WizardConfig } from "@/components/EntityRegisterWizard";
import { Landmark, Shield, TrendingUp, Users, Star, FileCheck } from "lucide-react";
import { CreditCard, BadgeCheck } from "lucide-react";

const config: WizardConfig = {
  entityKey: "insurance-broker",
  entityLabel: "Insurance Broker",
  EntityIcon: Landmark,
  scheme: "amber",
  btnGradient: "linear-gradient(135deg, #f59e0b 0%, #eab308 100%)",
  btnShadow: "0 4px 24px rgba(245,158,11,0.35)",
  btnHoverShadow: "0 4px 36px rgba(245,158,11,0.55)",
  panelGradient: "linear-gradient(135deg, rgba(180,83,9,0.85) 0%, rgba(133,77,14,0.75) 60%, rgba(7,16,31,0) 100%)",
  accentHex: "#f59e0b",
  entityNameLabel: "Broker Company Name",
  entityNamePlaceholder: "PlanRight Insurance Brokers Pvt. Ltd.",
  entityTypes: [
    "Health Insurance Broker",
    "Life Insurance Broker",
    "General Insurance Broker",
    "Composite Broker",
    "Reinsurance Broker",
  ],
  entityTypeLabel: "Broker Type",
  entityTypeFieldKey: "businessType",
  contactSectionTitle: "Principal Broker",
  contactFields: [
    { key: "contactPersonName",   label: "Principal Broker Name",     placeholder: "Anand Mehta",   Icon: Users,      required: true  },
    { key: "irdaiLicenseNumber",  label: "IRDAI License Number",      placeholder: "IRDAI-HB-12345", Icon: BadgeCheck, required: true  },
    { key: "panNumber",           label: "Company PAN Number",        placeholder: "AABCP1234D",    Icon: CreditCard, required: false },
  ],
  contactIdCard: {
    label: "Principal Broker ID / IRDAI License Copy",
    hint: "IRDAI license certificate or government ID (PDF/JPG, max 10 MB)",
  },
  requiredDocs: [
    { id: "irdai_license",  label: "IRDAI Composite/Direct Broker License", hint: "Current valid IRDAI license" },
    { id: "company_reg",    label: "Company Registration Certificate",       hint: "MCA / RoC incorporation certificate" },
    { id: "pan_card",       label: "Company PAN Card",                       hint: "PAN card of the registered company" },
    { id: "contact_id",     label: "Principal Broker ID Proof",             hint: "Aadhaar, PAN or passport of principal" },
  ],
  tagline: "India's #1 Insurance Broker Hub",
  heroLine1: "Register Your",
  heroLine2: "Broker Firm Today",
  heroText: "Distribute health & life insurance plans to millions of patients and corporates on the Mediczy platform with zero extra infrastructure.",
  features: [
    { Icon: TrendingUp, title: "Digital Policy Issuance",   desc: "Instant policy creation & QR-based delivery" },
    { Icon: Shield,     title: "IRDAI Compliance Tools",    desc: "Audit-ready record keeping & renewals" },
    { Icon: Users,      title: "Corporate Wellness Tie-ups", desc: "Onboard corporates & offer group plans" },
    { Icon: Star,       title: "Claims Tracker",            desc: "End-to-end claims status for clients" },
    { Icon: FileCheck,  title: "Renewal Automation",        desc: "Auto-reminders & bulk renewal workflows" },
  ],
  apiPrefix: "/insurance-broker",
  loginPath: "/insurance-broker/login",
  stepDetailsLabel: "Broker Details",
};

export default function InsuranceBrokerRegister() {
  return <EntityRegisterWizard config={config} />;
}
