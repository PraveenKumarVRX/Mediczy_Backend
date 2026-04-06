import EntityRegisterWizard, { type WizardConfig } from "@/components/EntityRegisterWizard";
import { Building, Shield, TrendingUp, Users, Star, Briefcase } from "lucide-react";
import { Hash, CreditCard } from "lucide-react";

const config: WizardConfig = {
  entityKey: "corporate",
  entityLabel: "Corporate",
  EntityIcon: Building,
  scheme: "indigo",
  btnGradient: "linear-gradient(135deg, #6366f1 0%, #3b82f6 100%)",
  btnShadow: "0 4px 24px rgba(99,102,241,0.35)",
  btnHoverShadow: "0 4px 36px rgba(99,102,241,0.55)",
  panelGradient: "linear-gradient(135deg, rgba(67,56,202,0.85) 0%, rgba(30,64,175,0.75) 60%, rgba(7,16,31,0) 100%)",
  accentHex: "#6366f1",
  entityNameLabel: "Company Name",
  entityNamePlaceholder: "Infosys Limited, Bengaluru",
  entityTypes: [
    "IT / Software", "Healthcare", "Manufacturing", "BFSI / Finance",
    "Retail & E-Commerce", "Education", "Government / PSU", "NGO / Non-Profit", "Other",
  ],
  entityTypeLabel: "Industry",
  entityTypeFieldKey: "industry",
  contactSectionTitle: "HR / Admin Contact",
  contactFields: [
    { key: "contactPersonName",  label: "HR / Admin Contact Name",  placeholder: "Meena Iyer",     Icon: Users,    required: true  },
    { key: "employeeCount",      label: "Employee Count",           placeholder: "500",            Icon: Hash,     required: false },
    { key: "gstNumber",          label: "GST Number",               placeholder: "27AABCT1332L1ZK", Icon: CreditCard, required: false },
  ],
  contactIdCard: {
    label: "HR Contact ID / Authorisation Letter",
    hint: "Government ID or company authorisation letter (PDF/JPG, max 10 MB)",
  },
  requiredDocs: [
    { id: "company_reg",  label: "Company Registration Certificate", hint: "MCA / RoC certificate of incorporation" },
    { id: "gst_cert",     label: "GST Certificate",                  hint: "GSTIN registration document" },
    { id: "hr_policy",    label: "HR Policy / Wellness Plan",        hint: "Optional — corporate wellness policy document" },
    { id: "pan_card",     label: "Company PAN Card",                 hint: "Company PAN card copy" },
  ],
  tagline: "Corporate Wellness Partner",
  heroLine1: "Register Your",
  heroLine2: "Company Today",
  heroText: "Give your employees access to top doctors, labs, pharmacies and wellness programs through a single corporate health platform.",
  features: [
    { Icon: TrendingUp, title: "Employee Health Analytics",  desc: "Track workforce wellness with rich insights" },
    { Icon: Shield,     title: "Group Health Insurance",     desc: "Seamless TPA & insurer coordination" },
    { Icon: Users,      title: "Unlimited e-Consultations",  desc: "Anytime doctor access for all employees" },
    { Icon: Star,       title: "Annual Health Checkups",     desc: "Bulk lab booking at negotiated rates" },
    { Icon: Briefcase,  title: "EAP & Mental Wellness",      desc: "Counselling, stress & burnout programs" },
  ],
  apiPrefix: "/corporate",
  loginPath: "/corporate/login",
  stepDetailsLabel: "Company Details",
};

export default function CorporateRegister() {
  return <EntityRegisterWizard config={config} />;
}
