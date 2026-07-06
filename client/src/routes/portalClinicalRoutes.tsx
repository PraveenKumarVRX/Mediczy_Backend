import type { ComponentType } from "react";
import { Navigate, Route, useLocation } from "react-router-dom";
import type { ClinicalPortal } from "@/config/clinicalPortalPaths";

type LazyComponent = ComponentType<unknown>;

export interface PortalClinicalPages {
  PatientTimeline: LazyComponent;
  NursingTaskBoard: LazyComponent;
  AnesthesiaAssessment: LazyComponent;
  DischargeWorkflow: LazyComponent;
  FollowUpManagement: LazyComponent;
  EChartingPage: LazyComponent;
  DoctorInpatientNotesPage: LazyComponent;
  ClinicalCalculators: LazyComponent;
  BedsideReference: LazyComponent;
  BedMap: LazyComponent;
  OTCommandCenter: LazyComponent;
  EMARPage: LazyComponent;
  DischargeBoard: LazyComponent;
  CareOSEcosystem: LazyComponent;
  GlobalClinicalBoard: LazyComponent;
  MedicalPassportPortal: LazyComponent;
  LivingPatientWorkspace: LazyComponent;
  InpatientWorkspace: LazyComponent;
  CommandCenter: LazyComponent;
  HospitalCopilot: LazyComponent;
  PredictiveAnalytics: LazyComponent;
  ReportCenter: LazyComponent;
  HL7FHIRMonitor: LazyComponent;
  AIOperationsHub: LazyComponent;
  AIRevenueIntelligence: LazyComponent;
  AIDepartmentHub: LazyComponent;
}

type RouteKey =
  | "patientTimeline"
  | "admissionNursingTasks"
  | "otAnesthesia"
  | "admissionDischarge"
  | "patientFollowUp"
  | "admissionEchart"
  | "admissionDoctorNotes"
  | "patientDoctorNotes"
  | "echart"
  | "calculators"
  | "reference"
  | "bedsMap"
  | "otCommandCenter"
  | "emar"
  | "dischargeBoard"
  | "healthosHub"
  | "careosHub"
  | "globalBoard"
  | "passport"
  | "patientHealthos"
  | "patientCareos"
  | "patientWorkspace"
  | "commandCenter"
  | "copilot"
  | "predictiveAnalytics"
  | "reportCenter"
  | "hl7Fhir"
  | "aiOps"
  | "aiRevenue"
  | "aiDept";

const HOSPITAL_ONLY: RouteKey[] = [
  "commandCenter",
  "bedsMap",
  "otCommandCenter",
  "otAnesthesia",
  "emar",
  "dischargeBoard",
  "predictiveAnalytics",
  "reportCenter",
  "hl7Fhir",
  "aiOps",
  "aiRevenue",
  "aiDept",
  "admissionNursingTasks",
  "admissionDischarge",
  "admissionEchart",
  "admissionDoctorNotes",
  "echart",
  "calculators",
  "reference",
];

function routeDefs(p: PortalClinicalPages): Record<RouteKey, { path: string; el: LazyComponent }> {
  return {
    patientTimeline: { path: "patient/:patientId/timeline", el: p.PatientTimeline },
    admissionNursingTasks: { path: "admission/:admissionId/nursing-tasks", el: p.NursingTaskBoard },
    otAnesthesia: { path: "ot/:otBookingId/anesthesia", el: p.AnesthesiaAssessment },
    admissionDischarge: { path: "admission/:admissionId/discharge", el: p.DischargeWorkflow },
    patientFollowUp: { path: "patient/:patientId/follow-up", el: p.FollowUpManagement },
    admissionEchart: { path: "admission/:admissionId/echart", el: p.EChartingPage },
    admissionDoctorNotes: { path: "admission/:admissionId/doctor-notes", el: p.DoctorInpatientNotesPage },
    patientDoctorNotes: { path: "patient/:patientId/doctor-notes", el: p.DoctorInpatientNotesPage },
    echart: { path: "echart", el: p.EChartingPage },
    calculators: { path: "calculators", el: p.ClinicalCalculators },
    reference: { path: "reference", el: p.BedsideReference },
    bedsMap: { path: "beds/map", el: p.BedMap },
    otCommandCenter: { path: "ot/command-center", el: p.OTCommandCenter },
    emar: { path: "emar", el: p.EMARPage },
    dischargeBoard: { path: "discharge-board", el: p.DischargeBoard },
    healthosHub: { path: "healthos", el: p.CareOSEcosystem },
    careosHub: { path: "careos", el: p.CareOSEcosystem },
    globalBoard: { path: "healthos/board/:patientId", el: p.GlobalClinicalBoard },
    passport: { path: "healthos/passport/:patientId", el: p.MedicalPassportPortal },
    patientHealthos: { path: "patient/:patientId/healthos/*", el: p.LivingPatientWorkspace },
    patientCareos: { path: "patient/:patientId/careos/*", el: p.LivingPatientWorkspace },
    patientWorkspace: { path: "patient/:patientId/workspace", el: LegacyPatientWorkspaceRedirect },
    commandCenter: { path: "command-center", el: p.CommandCenter },
    copilot: { path: "copilot", el: p.HospitalCopilot },
    predictiveAnalytics: { path: "predictive-analytics", el: p.PredictiveAnalytics },
    reportCenter: { path: "report-center", el: p.ReportCenter },
    hl7Fhir: { path: "hl7-fhir", el: p.HL7FHIRMonitor },
    aiOps: { path: "ai-ops", el: p.AIOperationsHub },
    aiRevenue: { path: "ai-revenue", el: p.AIRevenueIntelligence },
    aiDept: { path: "ai-dept", el: p.AIDepartmentHub },
  };
}

function LegacyPatientWorkspaceRedirect() {
  const location = useLocation();
  return <Navigate to={`${location.pathname.replace(/\/workspace$/, "/healthos")}?mode=ops`} replace />;
}

/** Mount clinical + HealthOS routes under /hospital, /doctor, or /nurse */
export function portalClinicalRoutes(portal: ClinicalPortal, pages: PortalClinicalPages) {
  const prefix = `/${portal}`;
  const defs = routeDefs(pages);

  return (Object.keys(defs) as RouteKey[])
    .filter((key) => portal === "hospital" || !HOSPITAL_ONLY.includes(key))
    .map((key) => {
      const { path, el: Element } = defs[key];
      return <Route key={`${portal}-${path}`} path={`${prefix}/${path}`} element={<Element />} />;
    });
}
