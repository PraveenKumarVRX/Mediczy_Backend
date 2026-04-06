import EntityRegisterWizard, { type WizardConfig } from "@/components/EntityRegisterWizard";
import { Ambulance, Shield, Navigation, Users, Star, Clock } from "lucide-react";
import { Car, FileCheck } from "lucide-react";

const config: WizardConfig = {
  entityKey: "ambulance",
  entityLabel: "Ambulance",
  EntityIcon: Ambulance,
  scheme: "orange",
  btnGradient: "linear-gradient(135deg, #f97316 0%, #ef4444 100%)",
  btnShadow: "0 4px 24px rgba(249,115,22,0.35)",
  btnHoverShadow: "0 4px 36px rgba(249,115,22,0.55)",
  panelGradient: "linear-gradient(135deg, rgba(194,65,12,0.85) 0%, rgba(153,27,27,0.75) 60%, rgba(7,16,31,0) 100%)",
  accentHex: "#f97316",
  entityNameLabel: "Ambulance Service Name",
  entityNamePlaceholder: "RapidCare Ambulance, Delhi",
  entityTypes: [
    "Basic Life Support (BLS)",
    "Advanced Life Support (ALS)",
    "Patient Transport Vehicle",
    "Neonatal Ambulance",
    "Air Ambulance",
    "Mortuary Van",
  ],
  entityTypeLabel: "Vehicle / Service Type",
  entityTypeFieldKey: "vehicleType",
  contactSectionTitle: "Fleet Manager",
  contactFields: [
    { key: "managerName",   label: "Fleet Manager Name",            placeholder: "Rajesh Singh",      Icon: Users,     required: true  },
    { key: "managerPhone",  label: "Emergency Contact Phone",       placeholder: "98765 43210",       Icon: Clock,     required: true  },
    { key: "vehicleRegNo",  label: "Primary Vehicle Reg. No",       placeholder: "KA-01-AB-1234",     Icon: Car,       required: false },
  ],
  contactIdCard: {
    label: "Manager ID / Fleet License",
    hint: "Government ID or fleet operating license (PDF/JPG, max 10 MB)",
  },
  requiredDocs: [
    { id: "vehicle_reg",    label: "Vehicle Registration Certificate", hint: "RC of ambulance vehicle(s)" },
    { id: "fitness_cert",   label: "Fitness Certificate",             hint: "Current fitness certificate from RTO" },
    { id: "driver_license", label: "Driver License (ambulance)",      hint: "Commercial driving license with medical endorsement" },
    { id: "permit",         label: "State Permit / Authorization",    hint: "State ambulance service authorization" },
  ],
  tagline: "Emergency Response Network",
  heroLine1: "Register Your",
  heroLine2: "Ambulance Service",
  heroText: "Join India's largest emergency response network. Get dispatched to patients in real-time and save more lives with smart EMS coordination.",
  features: [
    { Icon: Navigation, title: "Real-Time GPS Dispatch",    desc: "Smart routing and nearest-unit dispatch" },
    { Icon: Shield,     title: "EMS Protocol Compliance",  desc: "Standardised emergency response protocols" },
    { Icon: Users,      title: "EMT / Paramedic Profiles",  desc: "Certified crew records and certifications" },
    { Icon: Star,       title: "Hospital Connect",          desc: "Pre-alerts to hospital ED before arrival" },
    { Icon: Clock,      title: "Response Time Analytics",   desc: "Track, audit and improve response times" },
  ],
  apiPrefix: "/ambulance",
  loginPath: "/ambulance/login",
  stepDetailsLabel: "Service Details",
};

export default function AmbulanceRegister() {
  return <EntityRegisterWizard config={config} />;
}
