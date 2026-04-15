/**
 * AppRoutes — all React Router route definitions.
 *
 * Strategy
 * ────────
 * • Critical-path pages (auth, home, core patient journey) → static imports,
 *   included in the initial bundle so they paint instantly.
 * • Everything else (admin, hospital, clinic, lab, pharmacy, ambulance,
 *   homecare, team, corporate, TPA, nurse, assistant, aggregator, etc.) →
 *   React.lazy, split into per-module async chunks (~30-60 kB each).
 *
 * All lazy routes are wrapped in <Suspense fallback={<PageLoader />}> inside
 * AppRoutes so any unresolved chunk shows a spinner instead of a white screen.
 */

import { lazy, Suspense, useEffect, useState } from "react";
import type { ComponentType } from "react";
import { Routes, Route, Navigate } from "react-router-dom";

// ─── Critical-path — always in the initial bundle ───────────────────────────
import Index            from "@/pages/Index";
import Login            from "@/auth/Login";
import ChangePassword   from "@/auth/ChangePassword";
import ForgotPassword   from "@/pages/ForgotPassword";
import ResetPassword    from "@/pages/ResetPassword";
import OAuthCallback    from "@/auth/OAuthCallback";
import DoctorLogin      from "@/auth/DoctorLogin";
import Register         from "@/auth/Register";
import DocRegister      from "@/auth/DocRegister";
import NotFound         from "@/pages/NotFound";
import MainLayout       from "@/components/layout/MainLayout";

// ─── Lazy helpers ────────────────────────────────────────────────────────────
function lazyNamed<TModule extends Record<string, unknown>, TName extends keyof TModule>(
  factory: () => Promise<TModule>,
  name: TName
) {
  return lazy(() =>
    factory().then((moduleExports) => ({
      default: moduleExports[name] as ComponentType<unknown>,
    }))
  );
}

// ─── Core patient pages ──────────────────────────────────────────────────────
const DebugDashboard        = lazy(() => import("@/pages/DebugDashboard"));
const ProfileEnhanced       = lazy(() => import("@/pages/ProfileEnhanced"));
const Wallet                = lazy(() => import("@/pages/Wallet"));
const HealthTracker         = lazy(() => import("@/pages/HealthTracker"));
const HealthDashboard       = lazy(() => import("@/pages/HealthDashboard"));
const UnifiedHealthDashboard = lazy(() => import("@/pages/UnifiedHealthDashboard"));
const HealthDiary           = lazy(() => import("@/pages/HealthDiary"));
const Symptoms              = lazy(() => import("@/pages/Symptoms"));
const Medicine              = lazy(() => import("@/pages/Medicine"));
const ChatCall              = lazy(() => import("@/pages/chat/VideoChat"));
const AiDoctor              = lazy(() => import("@/pages/AiDoctor"));
const Consultation          = lazy(() => import("@/pages/Consultation"));
const Ayushman              = lazy(() => import("@/pages/Ayushman"));
const Emergency             = lazy(() => import("@/pages/Emergency"));
const ConsultationBooking   = lazy(() => import("@/pages/ConsultationBooking"));
const NurseBooking          = lazy(() => import("@/pages/NurseBooking"));
const LabBooking            = lazy(() => import("@/pages/LabBooking"));
const HomecareBooking       = lazy(() => import("@/pages/HomecareBooking"));
const HealthFeedPage        = lazy(() => import("@/pages/HealthFeedPage"));
const RepostsPage           = lazy(() => import("@/pages/Reposts"));
const MyPlans               = lazy(() => import("@/pages/MyPlans"));
const ChoosePlan            = lazy(() => import("@/pages/user/ChoosePlan"));
const MyMembershipCard      = lazy(() => import("@/pages/user/MyMembershipCard"));
const MyPrescriptions       = lazy(() => import("@/pages/MyPrescriptions"));
const Diet                  = lazy(() => import("@/pages/Diet"));
const CalorieCalculator     = lazy(() => import("@/pages/CalorieCalculator"));
const DoctorListBooking     = lazy(() => import("@/pages/DoctorListBooking"));
const Appointments          = lazy(() => import("@/pages/Appointments"));
const VideoConsultation     = lazy(() => import("@/pages/VideoConsultation"));
const ConnectionDiagnostic  = lazy(() => import("@/pages/ConnectionDiagnostic"));
const HealthIntelligence    = lazy(() => import("@/pages/HealthIntelligence"));
const SIBControlDashboard   = lazy(() => import("@/pages/SIBControlDashboard"));
const UserHealthRiskAssessment = lazy(() => import("@/pages/UserHealthRiskAssessment"));
const OrderTasks            = lazy(() => import("@/pages/OrderTasks"));

// ─── Patient sub-pages ───────────────────────────────────────────────────────
const PatientNotifications  = lazy(() => import("@/pages/patient/PatientNotifications"));
const LabTests              = lazy(() => import("@/pages/patient/LabTests"));
const MyReports             = lazy(() => import("@/pages/patient/MyReports"));
const Pharmacy              = lazy(() => import("@/pages/patient/Pharmacy"));
const VitalReports          = lazy(() => import("@/pages/patient/VitalReports"));
const UploadedDocuments     = lazy(() => import("@/pages/patient/UploadedDocuments"));
const NetworkHospitals      = lazy(() => import("@/pages/patient/NetworkHospitals"));
const NetworkClinics        = lazy(() => import("@/pages/patient/NetworkClinics"));
const TeamClinicList        = lazy(() => import("@/pages/team/TeamClinicList"));
const TeamTicketManager     = lazy(() => import("@/pages/team/TeamTicketManager"));
const BuyInsurance          = lazy(() => import("@/pages/patient/BuyInsurance"));
const ClaimsManagement      = lazy(() => import("@/pages/patient/ClaimsManagement"));
const AIHealthAnalysis      = lazy(() => import("@/pages/patient/AIHealthAnalysis"));
const EmployeeGamification  = lazy(() => import("@/pages/patient/EmployeeGamification"));
const EmployeeWellnessCalendar = lazy(() => import("@/pages/patient/EmployeeWellnessCalendar"));
const AIReportScanner       = lazy(() => import("@/pages/patient/AIReportScanner"));
const AISymptomTriage       = lazy(() => import("@/pages/patient/AISymptomTriage"));
const SmartHealthDashboard  = lazy(() => import("@/pages/patient/SmartHealthDashboard"));
const SmartBenefitsHub      = lazy(() => import("@/pages/patient/SmartBenefitsHub"));
const FamilyHealthHub       = lazy(() => import("@/pages/patient/FamilyHealthHub"));
const WellnessRewards       = lazy(() => import("@/pages/patient/WellnessRewards"));
const ClaimsExpress         = lazy(() => import("@/pages/patient/ClaimsExpress"));

// ─── Billing ─────────────────────────────────────────────────────────────────
const OrderCheckout  = lazy(() => import("@/pages/billing/OrderCheckout"));
const OrderHistory   = lazy(() => import("@/pages/billing/OrderHistory"));
const OrderDetails   = lazy(() => import("@/pages/billing/OrderDetails"));
const MyInvoices     = lazy(() => import("@/pages/billing/MyInvoices"));

// ─── Doctor ──────────────────────────────────────────────────────────────────
const DoctorDashboard          = lazy(() => import("@/pages/doctor/DoctorDashboard"));
const DoctorMobileHome         = lazy(() => import("@/pages/doctor/DoctorMobileHome"));
const DoctorAppointments       = lazy(() => import("@/pages/doctor/DoctorAppointments"));
const DoctorAppointmentSettings = lazy(() => import("@/pages/doctor/DoctorAppointmentSettings"));
const DoctorPrescriptions      = lazy(() => import("@/pages/doctor/DoctorPrescriptions"));
const DoctorContact            = lazy(() => import("@/pages/doctor/DoctorContact"));
const DoctorAlerts             = lazy(() => import("@/pages/doctor/DoctorAlerts"));
const DoctorVideoConsultation  = lazy(() => import("@/pages/doctor/DoctorVideoConsultation"));
const RecordingTest            = lazy(() => import("@/pages/doctor/RecordingTest"));
const DoctorPatients           = lazy(() => import("@/pages/doctor/DoctorPatients"));
const DoctorTriage             = lazy(() => import("@/pages/doctor/DoctorTriage"));
const RemoteHealthMonitoring   = lazy(() => import("@/pages/doctor/RemoteHealthMonitoring"));
const DoctorAssist             = lazy(() => import("@/pages/doctor/DoctorAssist"));
const HealthMonitoringDashboardWrapper = lazy(() => import("@/pages/doctor/HealthMonitoringDashboardWrapper"));
const DoctorAnalytics          = lazy(() => import("@/pages/doctor/DoctorAnalytics"));
const DoctorReports            = lazy(() => import("@/pages/doctor/DoctorReports"));
const DoctorSettings           = lazy(() => import("@/pages/doctor/DoctorSettings"));
const DoctorDocumentTemplates  = lazy(() => import("@/pages/doctor/DoctorDocumentTemplates"));
const DoctorTemplateSettings   = lazy(() => import("@/pages/doctor/DoctorTemplateSettings"));
const DoctorSpecialtyTemplates = lazy(() => import("@/pages/doctor/DoctorSpecialtyTemplates"));
const DoctorServices           = lazy(() => import("@/pages/doctor/DoctorServices"));
const DoctorBilling            = lazy(() => import("@/pages/doctor/DoctorBilling"));
const PatientEMR               = lazy(() => import("@/pages/doctor/PatientEMR"));

// ─── Admin ───────────────────────────────────────────────────────────────────
const AdminLogin               = lazy(() => import("@/pages/admin/AdminLogin"));
const AdminChatDashboard       = lazy(() => import("@/pages/admin/AdminChatDashboard"));
const AdminTestPage            = lazy(() => import("@/pages/admin/AdminTestPage"));
const SimpleAdminDashboard     = lazy(() => import("@/pages/admin/SimpleAdminDashboard"));
const AdminAppointments        = lazy(() => import("@/pages/admin/AdminAppointments"));
const AdminDashboardHome       = lazy(() => import("@/pages/admin/AdminDashboardHome"));
const ComprehensiveAdminDashboard = lazy(() => import("@/pages/admin/ComprehensiveAdminDashboard"));
const DoctorsManagement        = lazy(() => import("@/pages/admin/DoctorsManagement"));
const UsersManagement          = lazy(() => import("@/pages/admin/UsersManagement"));
const LabsManagement           = lazy(() => import("@/pages/admin/LabsManagement"));
const PharmaciesManagement     = lazy(() => import("@/pages/admin/PharmaciesManagement"));
const CorporatesManagement     = lazy(() => import("@/pages/admin/CorporatesManagement"));
const CorporateHealthPackages  = lazy(() => import("@/pages/admin/CorporateHealthPackages"));
const CorporateEmployeesManagement = lazy(() => import("@/pages/admin/CorporateEmployeesManagement"));
const CorporatePlansManagement = lazy(() => import("@/pages/admin/CorporatePlansManagement"));
const AdminPlans               = lazy(() => import("@/pages/admin/AdminPlans"));
const AdminInsurance           = lazy(() => import("@/pages/admin/AdminInsurance"));
const AdminWorkflowAutomation  = lazy(() => import("@/pages/admin/AdminWorkflowAutomation"));
const AdminTenantManagement    = lazy(() => import("@/pages/admin/AdminTenantManagement"));
const HospitalsManagement      = lazy(() => import("@/pages/admin/HospitalsManagement"));
const PendingRegistrations     = lazy(() => import("@/pages/admin/PendingRegistrations"));
const ClinicsManagement        = lazy(() => import("@/pages/admin/ClinicsManagement"));
const HomecareManagement       = lazy(() => import("@/pages/admin/HomecareManagement"));
const AmbulanceManagement      = lazy(() => import("@/pages/admin/AmbulanceManagement"));
const OHCManagement            = lazy(() => import("@/pages/admin/OHCManagement"));
const InsurerManagement        = lazy(() => import("@/pages/admin/InsurerManagement"));
const TPAManagement            = lazy(() => import("@/pages/admin/TPAManagement"));
const BrokerManagement         = lazy(() => import("@/pages/admin/BrokerManagement"));
const ApiCredentialsManagement = lazy(() => import("@/pages/admin/ApiCredentialsManagement"));
const MedivacManagement        = lazy(() => import("@/pages/admin/MedivacManagement"));
const NGOManagement            = lazy(() => import("@/pages/admin/NGOManagement"));
const PSUManagement            = lazy(() => import("@/pages/admin/PSUManagement"));
const AdminRegisterPatient     = lazy(() => import("@/pages/admin/AdminRegisterPatient"));
const AdminManageAssistants    = lazy(() => import("@/pages/admin/AdminManageAssistants"));
const BillingManagement        = lazy(() => import("@/pages/admin/BillingManagement"));
const AccountingManagement     = lazy(() => import("@/pages/admin/AccountingManagement"));
const PaymentManagement        = lazy(() => import("@/pages/admin/PaymentManagement"));
const CouponManagement         = lazy(() => import("@/pages/admin/CouponManagement"));
const EmailManagement          = lazy(() => import("@/pages/admin/EmailManagement"));
const ActivityLog              = lazy(() => import("@/pages/admin/ActivityLog"));
const ModuleAccessControl      = lazy(() => import("@/pages/admin/ModuleAccessControl"));
const AdminAuthTest            = lazy(() => import("@/pages/admin/AdminAuthTest"));
const SMSManagement            = lazy(() => import("@/pages/admin/SMSManagement"));
const WhatsAppManagement       = lazy(() => import("@/pages/admin/WhatsAppManagement"));
const VideoManagement          = lazy(() => import("@/pages/admin/VideoManagement"));
const VoiceCallManagement      = lazy(() => import("@/pages/admin/VoiceCallManagement"));
const TicketManagement         = lazy(() => import("@/pages/admin/TicketManagement"));
const AdminHealthRiskAssessment = lazy(() => import("@/pages/admin/HealthRiskAssessment"));
const TeamManagement           = lazy(() => import("@/pages/admin/TeamManagement"));
const TeamPrivileges           = lazy(() => import("@/pages/admin/TeamPrivileges"));
const ReportsPage              = lazyNamed(() => import("@/pages/admin/AdminPlaceholders"), "ReportsPage");
const SettingsPage             = lazy(() => import("@/pages/admin/SettingsPage"));
const CRMPage                  = lazy(() => import("@/pages/admin/CRMPage"));
const CRMLeadDetail            = lazy(() => import("@/pages/admin/CRMLeadDetail"));
const AIAnalyticsDashboard     = lazy(() => import("@/pages/admin/AIAnalyticsDashboard"));
const SIBAIDashboard           = lazy(() => import("@/pages/admin/SIBAIDashboard"));

// ─── CRM ─────────────────────────────────────────────────────────────────────
const CRMLogin     = lazy(() => import("@/pages/crm/CRMLogin"));
const CRMDashboard = lazy(() => import("@/pages/crm/CRMDashboard"));

const _CRMModulePages = () => import("@/pages/crm/CRMModulePages");
const CRMLeadsPage      = lazyNamed(_CRMModulePages, "CRMLeadsPage");
const CRMDealsPage      = lazyNamed(_CRMModulePages, "CRMDealsPage");
const CRMContactsPage   = lazyNamed(_CRMModulePages, "CRMContactsPage");
const CRMActivitiesPage = lazyNamed(_CRMModulePages, "CRMActivitiesPage");
const CRMPipelinePage   = lazyNamed(_CRMModulePages, "CRMPipelinePage");
const CRMReportsPage    = lazyNamed(_CRMModulePages, "CRMReportsPage");
const CRMSettingsPage   = lazyNamed(_CRMModulePages, "CRMSettingsPage");

const _CRMRFQPages = () => import("@/pages/crm/CRMRFQPages");
const CRMRFQsPage        = lazyNamed(_CRMRFQPages, "CRMRFQsPage");
const CRMRFQDetailPage   = lazyNamed(_CRMRFQPages, "CRMRFQDetailPage");
const CRMQuoteBuilderPage = lazyNamed(_CRMRFQPages, "CRMQuoteBuilderPage");

// ─── Team ────────────────────────────────────────────────────────────────────
const TeamLogin              = lazy(() => import("@/pages/team/TeamLogin"));
const TeamDashboard          = lazy(() => import("@/pages/team/TeamDashboard"));
const TeamProfile            = lazy(() => import("@/pages/team/TeamProfile"));
const TeamDirectory          = lazy(() => import("@/pages/team/TeamDirectory"));
const TeamReports            = lazy(() => import("@/pages/team/TeamReports"));
const TeamTools              = lazy(() => import("@/pages/team/TeamTools"));
const TeamPharmacyEdit       = lazy(() => import("@/pages/team/TeamPharmacyEdit"));
const WhatsAppCommunication  = lazy(() => import("@/pages/team/WhatsAppCommunication"));
const WhatsAppTemplates      = lazy(() => import("@/pages/team/WhatsAppTemplates"));
const WhatsAppInbox          = lazy(() => import("@/pages/team/WhatsAppInbox"));
const RocketChatOmnichannel  = lazy(() => import("@/pages/team/RocketChatOmnichannel"));
const TeamCorporateManagement  = lazy(() => import("@/pages/team/TeamCorporateManagement"));
const CorporateHealthBooking   = lazy(() => import("@/pages/team/CorporateHealthBooking"));
const TeamEmployeeManagement   = lazy(() => import("@/pages/team/TeamEmployeeManagement"));
const TeamSettings             = lazy(() => import("@/pages/team/TeamSettings"));
const TeamHealthPlans          = lazy(() => import("@/pages/team/TeamHealthPlans"));
const TeamBrokerManagement     = lazy(() => import("@/pages/team/TeamBrokerManagement"));

const _TeamModulePages = () => import("@/pages/team/TeamModulePages");
const TeamUserManagementPage     = lazyNamed(_TeamModulePages, "TeamUserManagementPage");
const TeamDoctorManagementPage   = lazyNamed(_TeamModulePages, "TeamDoctorManagementPage");
const TeamHospitalManagementPage = lazyNamed(_TeamModulePages, "TeamHospitalManagementPage");
const TeamClinicManagementPage   = lazyNamed(_TeamModulePages, "TeamClinicManagementPage");
const TeamLabManagementPage      = lazyNamed(_TeamModulePages, "TeamLabManagementPage");
const TeamPharmacyManagementPage = lazyNamed(_TeamModulePages, "TeamPharmacyManagementPage");
const TeamChatAnalyticsPage      = lazyNamed(_TeamModulePages, "TeamChatAnalyticsPage");
const TeamSupportTicketsPage     = lazyNamed(_TeamModulePages, "TeamSupportTicketsPage");
const TeamAppointmentsPage       = lazyNamed(_TeamModulePages, "TeamAppointmentsPage");
const TeamChatDashboardPage      = lazyNamed(_TeamModulePages, "TeamChatDashboardPage");
const TeamHealthPlansPage        = lazyNamed(_TeamModulePages, "TeamHealthPlansPage");
const TeamActivityLogsPage       = lazyNamed(_TeamModulePages, "TeamActivityLogsPage");

// ─── Nurse ───────────────────────────────────────────────────────────────────
const NurseLogin           = lazy(() => import("@/pages/nurse/NurseLogin"));
const NurseDashboard       = lazy(() => import("@/pages/nurse/NurseDashboard"));
const NurseRegisterPatient = lazy(() => import("@/pages/nurse/NurseRegisterPatient"));
const NursePatients        = lazy(() => import("@/pages/nurse/NursePatients"));
const NurseVitals          = lazy(() => import("@/pages/nurse/NurseVitals"));
const NurseMedications     = lazy(() => import("@/pages/nurse/NurseMedications"));
const NurseNotes           = lazy(() => import("@/pages/nurse/NurseNotes"));
const NurseAppointments    = lazy(() => import("@/pages/nurse/NurseAppointments"));

// ─── Assistant ───────────────────────────────────────────────────────────────
const AssistantLogin           = lazy(() => import("@/pages/assistant/AssistantLogin"));
const AssistantDashboard       = lazy(() => import("@/pages/assistant/AssistantDashboard"));
const AssistantRegisterPatient = lazy(() => import("@/pages/assistant/AssistantRegisterPatient"));
const AssistantPatients        = lazy(() => import("@/pages/assistant/AssistantPatients"));
const AssistantAppointments    = lazy(() => import("@/pages/assistant/AssistantAppointments"));
const AssistantPrescriptions   = lazy(() => import("@/pages/assistant/AssistantPrescriptions"));
const AssistantBilling         = lazy(() => import("@/pages/assistant/AssistantBilling"));
const AssistantMessages        = lazy(() => import("@/pages/assistant/AssistantMessages"));
const AssistantReports         = lazy(() => import("@/pages/assistant/AssistantReports"));

// ─── Hospital ────────────────────────────────────────────────────────────────
const HospitalRegister                 = lazy(() => import("@/pages/hospital/HospitalRegister"));
const HospitalLogin                    = lazy(() => import("@/pages/hospital/HospitalLogin"));
const HospitalDashboard                = lazy(() => import("@/pages/hospital/HospitalDashboard"));
const HospitalPracticeManagement       = lazy(() => import("@/pages/hospital/HospitalPracticeManagement"));
const HospitalCorporateManagement      = lazy(() => import("@/pages/hospital/HospitalCorporateManagement"));
const HospitalInsurancePayerManagement = lazy(() => import("@/pages/hospital/HospitalInsurancePayerManagement"));
const HospitalInsuranceBilling         = lazy(() => import("@/pages/hospital/HospitalInsuranceBilling"));
const HospitalInsuranceClaimsDashboard = lazy(() => import("@/pages/hospital/HospitalInsuranceClaimsDashboard"));
const HospitalMRD                      = lazy(() => import("@/pages/hospital/HospitalMRD"));
const HospitalEHR                      = lazy(() => import("@/pages/hospital/HospitalEHR"));
const HospitalLabOrder                 = lazy(() => import("@/pages/hospital/HospitalLabOrder"));
const HospitalImagingOrder             = lazy(() => import("@/pages/hospital/HospitalImagingOrder"));
const HospitalPrescriptionCreator      = lazy(() => import("@/pages/hospital/HospitalPrescriptionCreator"));
const HospitalProcedureAdder           = lazy(() => import("@/pages/hospital/HospitalProcedureAdder"));
const HospitalDischargeSummary         = lazy(() => import("@/pages/hospital/HospitalDischargeSummary"));
const HospitalIPSheets                 = lazy(() => import("@/pages/hospital/HospitalIPSheets"));
const HospitalDoctorsManagement        = lazy(() => import("@/pages/hospital/HospitalDoctorsManagement"));
const HospitalCommunicationHub         = lazy(() => import("@/pages/hospital/HospitalCommunicationHub"));
const HospitalAmbulance                = lazy(() => import("@/pages/hospital/HospitalAmbulance"));
const HospitalBranchesClinic           = lazy(() => import("@/pages/hospital/HospitalBranchesClinic"));
const HospitalTeamChat                 = lazy(() => import("@/pages/hospital/HospitalTeamChat"));
const HospitalNotifications            = lazy(() => import("@/pages/hospital/HospitalNotifications"));

const _HospitalModulePages = () => import("@/pages/hospital/HospitalModulePages");
const HospitalAppointmentsPage = lazyNamed(_HospitalModulePages, "HospitalAppointmentsPage");
const HospitalBedsPage         = lazyNamed(_HospitalModulePages, "HospitalBedsPage");
const HospitalPatientsPage     = lazyNamed(_HospitalModulePages, "HospitalPatientsPage");
const HospitalOpdIpdPage       = lazyNamed(_HospitalModulePages, "HospitalOpdIpdPage");
const HospitalPharmacyPage     = lazyNamed(_HospitalModulePages, "HospitalPharmacyPage");
const HospitalLabReportsPage   = lazyNamed(_HospitalModulePages, "HospitalLabReportsPage");
const HospitalBillingPage      = lazyNamed(_HospitalModulePages, "HospitalBillingPage");
const HospitalClaimsPage       = lazyNamed(_HospitalModulePages, "HospitalClaimsPage");
const HospitalStaffPage        = lazyNamed(_HospitalModulePages, "HospitalStaffPage");
const HospitalSettingsPage     = lazyNamed(_HospitalModulePages, "HospitalSettingsPage");
const HospitalSupportPage      = lazyNamed(_HospitalModulePages, "HospitalSupportPage");

// ─── Clinic ──────────────────────────────────────────────────────────────────
const ClinicLogin     = lazy(() => import("@/pages/clinic/ClinicLogin"));
const ClinicRegister  = lazy(() => import("@/pages/clinic/ClinicRegister"));
const ClinicDashboard = lazy(() => import("@/pages/clinic/ClinicDashboard"));

const _ClinicModulePages = () => import("@/pages/clinic/ClinicModulePages");
const ClinicAppointmentsPage  = lazyNamed(_ClinicModulePages, "ClinicAppointmentsPage");
const ClinicPatientsPage      = lazyNamed(_ClinicModulePages, "ClinicPatientsPage");
const ClinicQueuePage         = lazyNamed(_ClinicModulePages, "ClinicQueuePage");
const ClinicDoctorsPage       = lazyNamed(_ClinicModulePages, "ClinicDoctorsPage");
const ClinicConsultationsPage = lazyNamed(_ClinicModulePages, "ClinicConsultationsPage");
const ClinicPrescriptionsPage = lazyNamed(_ClinicModulePages, "ClinicPrescriptionsPage");
const ClinicPharmacyPage      = lazyNamed(_ClinicModulePages, "ClinicPharmacyPage");
const ClinicLabTestsPage      = lazyNamed(_ClinicModulePages, "ClinicLabTestsPage");
const ClinicBillingPage       = lazyNamed(_ClinicModulePages, "ClinicBillingPage");
const ClinicPaymentsPage      = lazyNamed(_ClinicModulePages, "ClinicPaymentsPage");
const ClinicReportsPage       = lazyNamed(_ClinicModulePages, "ClinicReportsPage");
const ClinicStaffPage         = lazyNamed(_ClinicModulePages, "ClinicStaffPage");
const ClinicNotificationsPage = lazyNamed(_ClinicModulePages, "ClinicNotificationsPage");
const ClinicSettingsPage      = lazyNamed(_ClinicModulePages, "ClinicSettingsPage");
const ClinicSupportPage       = lazyNamed(_ClinicModulePages, "ClinicSupportPage");

// ─── Lab ─────────────────────────────────────────────────────────────────────
const LabLogin     = lazy(() => import("@/pages/lab/LabLogin"));
const LabRegister  = lazy(() => import("@/pages/lab/LabRegister"));
const LabDashboard = lazy(() => import("@/pages/lab/LabDashboard"));

const _LabModulePages = () => import("@/pages/lab/LabModulePages");
const LabOrdersPage        = lazyNamed(_LabModulePages, "LabOrdersPage");
const LabPatientsPage      = lazyNamed(_LabModulePages, "LabPatientsPage");
const LabAppointmentsPage  = lazyNamed(_LabModulePages, "LabAppointmentsPage");
const LabQueuePage         = lazyNamed(_LabModulePages, "LabQueuePage");
const LabSamplesPage       = lazyNamed(_LabModulePages, "LabSamplesPage");
const LabProcessingPage    = lazyNamed(_LabModulePages, "LabProcessingPage");
const LabResultsPage       = lazyNamed(_LabModulePages, "LabResultsPage");
const LabReportsPage       = lazyNamed(_LabModulePages, "LabReportsPage");
const LabInventoryPage     = lazyNamed(_LabModulePages, "LabInventoryPage");
const LabBillingPage       = lazyNamed(_LabModulePages, "LabBillingPage");
const LabPaymentsPage      = lazyNamed(_LabModulePages, "LabPaymentsPage");
const LabAnalyticsPage     = lazyNamed(_LabModulePages, "LabAnalyticsPage");
const LabStaffPage         = lazyNamed(_LabModulePages, "LabStaffPage");
const LabNotificationsPage = lazyNamed(_LabModulePages, "LabNotificationsPage");
const LabSettingsPage      = lazyNamed(_LabModulePages, "LabSettingsPage");
const LabSupportPage       = lazyNamed(_LabModulePages, "LabSupportPage");

// ─── Pharmacy ────────────────────────────────────────────────────────────────
const PharmacyLogin     = lazy(() => import("@/pages/pharmacy/PharmacyLogin"));
const PharmacyRegister  = lazy(() => import("@/pages/pharmacy/PharmacyRegister"));
const PharmacyDashboard = lazy(() => import("@/pages/pharmacy/PharmacyDashboard"));

const _PharmacyModulePages = () => import("@/pages/pharmacy/PharmacyModulePages");
const PharmacyPOSPage            = lazyNamed(_PharmacyModulePages, "PharmacyPOSPage");
const PharmacyPrescriptionsPage  = lazyNamed(_PharmacyModulePages, "PharmacyPrescriptionsPage");
const PharmacyInventoryPage      = lazyNamed(_PharmacyModulePages, "PharmacyInventoryPage");
const PharmacyStockAlertsPage    = lazyNamed(_PharmacyModulePages, "PharmacyStockAlertsPage");
const PharmacyBatchesPage        = lazyNamed(_PharmacyModulePages, "PharmacyBatchesPage");
const PharmacyPurchaseOrdersPage = lazyNamed(_PharmacyModulePages, "PharmacyPurchaseOrdersPage");
const PharmacyCustomersPage      = lazyNamed(_PharmacyModulePages, "PharmacyCustomersPage");
const PharmacyReportsPage        = lazyNamed(_PharmacyModulePages, "PharmacyReportsPage");
const PharmacyInvoicesPage       = lazyNamed(_PharmacyModulePages, "PharmacyInvoicesPage");
const PharmacyExpiryPage         = lazyNamed(_PharmacyModulePages, "PharmacyExpiryPage");
const PharmacyAnalyticsPage      = lazyNamed(_PharmacyModulePages, "PharmacyAnalyticsPage");
const PharmacySettingsPage       = lazyNamed(_PharmacyModulePages, "PharmacySettingsPage");
const PharmacySupportPage        = lazyNamed(_PharmacyModulePages, "PharmacySupportPage");

// ─── Hospital Insurance Portal ───────────────────────────────────────────────
const InsurancePortalLogin       = lazy(() => import("@/pages/hospital-insurance/InsurancePortalLogin"));
const InsurancePortalDashboard   = lazy(() => import("@/pages/hospital-insurance/InsurancePortalDashboard"));
const InsuranceClaimsPage        = lazy(() => import("@/pages/hospital-insurance/InsuranceClaimsPage"));
const InsurancePreAuthPage       = lazy(() => import("@/pages/hospital-insurance/InsurancePreAuthPage"));
const InsuranceReconciliationPage = lazy(() => import("@/pages/hospital-insurance/InsuranceReconciliationPage"));
const InsuranceDocumentsPage     = lazy(() => import("@/pages/hospital-insurance/InsuranceDocumentsPage"));
const InsuranceHospitalProfilePage = lazy(() => import("@/pages/hospital-insurance/InsuranceHospitalProfilePage"));
const InsuranceAnalyticsPage     = lazy(() => import("@/pages/hospital-insurance/InsuranceAnalyticsPage"));
const InsuranceTasksPage         = lazy(() => import("@/pages/hospital-insurance/InsuranceTasksPage"));
const InsurancePayerManagementPage = lazy(() => import("@/pages/hospital-insurance/InsurancePayerManagementPage"));
const InsuranceCourierTrackingPage = lazy(() => import("@/pages/hospital-insurance/InsuranceCourierTrackingPage"));
const InsuranceNHCXPage          = lazy(() => import("@/pages/hospital-insurance/InsuranceNHCXPage"));
const InsuranceABDMPage          = lazy(() => import("@/pages/hospital-insurance/InsuranceABDMPage"));
const InsuranceCalendarPage      = lazy(() => import("@/pages/hospital-insurance/InsuranceCalendarPage"));
const InsuranceInventoryPage     = lazy(() => import("@/pages/hospital-insurance/InsuranceInventoryPage"));
const InsuranceBulkUploadPage    = lazy(() => import("@/pages/hospital-insurance/InsuranceBulkUploadPage"));
const InsuranceSearchPage        = lazy(() => import("@/pages/hospital-insurance/InsuranceSearchPage"));
const InsuranceSettingsPage      = lazy(() => import("@/pages/hospital-insurance/InsuranceSettingsPage"));
const InsuranceNotificationsPage = lazy(() => import("@/pages/hospital-insurance/InsuranceNotificationsPage"));
const InsuranceAdmissionPage     = lazy(() => import("@/pages/hospital-insurance/InsuranceAdmissionPage"));
const InsuranceDischargePage     = lazy(() => import("@/pages/hospital-insurance/InsuranceDischargePage"));
const InsuranceMessagesPage      = lazy(() => import("@/pages/hospital-insurance/InsuranceMessagesPage"));
const InsuranceDenialsPage       = lazy(() => import("@/pages/hospital-insurance/InsuranceDenialsPage"));
const InsuranceTariffPage        = lazy(() => import("@/pages/hospital-insurance/InsuranceTariffPage"));
const InsuranceEmpanelmentPage   = lazy(() => import("@/pages/hospital-insurance/InsuranceEmpanelmentPage"));
const InsuranceReportsPage       = lazy(() => import("@/pages/hospital-insurance/InsuranceReportsPage"));
const InsuranceSLAPage           = lazy(() => import("@/pages/hospital-insurance/InsuranceSLAPage"));
const InsuranceGovtSchemesPage   = lazy(() => import("@/pages/hospital-insurance/InsuranceGovtSchemesPage"));
const InsuranceEmailInboxPage    = lazy(() => import("@/pages/hospital-insurance/InsuranceEmailInboxPage"));

// ─── Ambulance ───────────────────────────────────────────────────────────────
const AmbulanceRegister  = lazy(() => import("@/pages/ambulance/AmbulanceRegister"));
const AmbulanceLogin     = lazy(() => import("@/pages/ambulance/AmbulanceLogin"));
const AmbulanceDashboard = lazy(() => import("@/pages/ambulance/AmbulanceDashboard"));

const _AmbulanceModulePages = () => import("@/pages/ambulance/AmbulanceModulePages");
const AmbulanceActiveTripsPage = lazyNamed(_AmbulanceModulePages, "AmbulanceActiveTripsPage");
const AmbulanceDispatchPage    = lazyNamed(_AmbulanceModulePages, "AmbulanceDispatchPage");
const AmbulanceTrackingPage    = lazyNamed(_AmbulanceModulePages, "AmbulanceTrackingPage");
const AmbulanceHistoryPage     = lazyNamed(_AmbulanceModulePages, "AmbulanceHistoryPage");
const AmbulanceFleetPage       = lazyNamed(_AmbulanceModulePages, "AmbulanceFleetPage");
const AmbulanceStaffPage       = lazyNamed(_AmbulanceModulePages, "AmbulanceStaffPage");
const AmbulanceMaintenancePage = lazyNamed(_AmbulanceModulePages, "AmbulanceMaintenancePage");
const AmbulanceSchedulePage    = lazyNamed(_AmbulanceModulePages, "AmbulanceSchedulePage");
const AmbulanceBillingPage     = lazyNamed(_AmbulanceModulePages, "AmbulanceBillingPage");
const AmbulanceReportsPage     = lazyNamed(_AmbulanceModulePages, "AmbulanceReportsPage");
const AmbulanceAlertsPage      = lazyNamed(_AmbulanceModulePages, "AmbulanceAlertsPage");
const AmbulanceSettingsPage    = lazyNamed(_AmbulanceModulePages, "AmbulanceSettingsPage");
const AmbulanceSupportPage     = lazyNamed(_AmbulanceModulePages, "AmbulanceSupportPage");

// ─── Homecare ────────────────────────────────────────────────────────────────
const HomecareLogin     = lazy(() => import("@/pages/homecare/HomecareLogin"));
const HomecareRegister  = lazy(() => import("@/pages/homecare/HomecareRegister"));
const HomecareDashboard = lazy(() => import("@/pages/homecare/HomecareDashboard"));

const _HomecareModulePages = () => import("@/pages/homecare/HomecareModulePages");
const HomecarePatientsPage     = lazyNamed(_HomecareModulePages, "HomecarePatientsPage");
const HomecareCarePlansPage    = lazyNamed(_HomecareModulePages, "HomecareCarePlansPage");
const HomecareAppointmentsPage = lazyNamed(_HomecareModulePages, "HomecareAppointmentsPage");
const HomecareStaffPage        = lazyNamed(_HomecareModulePages, "HomecareStaffPage");
const HomecareServicesPage     = lazyNamed(_HomecareModulePages, "HomecareServicesPage");
const HomecareBillingPage      = lazyNamed(_HomecareModulePages, "HomecareBillingPage");
const HomecareInventoryPage    = lazyNamed(_HomecareModulePages, "HomecareInventoryPage");
const HomecareReportsPage      = lazyNamed(_HomecareModulePages, "HomecareReportsPage");
const HomecareSettingsPage     = lazyNamed(_HomecareModulePages, "HomecareSettingsPage");
const HomecareSupportPage      = lazyNamed(_HomecareModulePages, "HomecareSupportPage");

// ─── Corporate ───────────────────────────────────────────────────────────────
const CorporateDashboard            = lazy(() => import("@/pages/CorporateDashboard"));
const CorporateBenefits             = lazy(() => import("@/pages/CorporateBenefits"));
const CorporateLogin                = lazy(() => import("@/pages/corporate/CorporateLogin"));
const CorporateRegister             = lazy(() => import("@/pages/corporate/CorporateRegister"));
const CorporateNotifications        = lazy(() => import("@/pages/corporate/CorporateNotifications"));
const CorporateEmployees            = lazy(() => import("@/pages/corporate/CorporateEmployees"));
const CorporateAppointments         = lazy(() => import("@/pages/corporate/CorporateAppointments"));
const CorporateHealthAnalysis       = lazy(() => import("@/pages/corporate/CorporateHealthAnalysis"));
const CorporateDepartments          = lazy(() => import("@/pages/corporate/CorporateDepartments"));
const CorporateClaims               = lazy(() => import("@/pages/corporate/CorporateClaims"));
const CorporateReports              = lazy(() => import("@/pages/corporate/CorporateReports"));
const CorporateComplaints           = lazy(() => import("@/pages/corporate/CorporateComplaints"));
const CorporateSettings             = lazy(() => import("@/pages/corporate/CorporateSettings"));
const CorporateHelp                 = lazy(() => import("@/pages/corporate/CorporateHelp"));
const CorporateHealthRiskAssessment = lazy(() => import("@/pages/corporate/CorporateHealthRiskAssessment"));
const CorporateGamification         = lazy(() => import("@/pages/corporate/CorporateGamification"));
const CorporateWellnessCalendar     = lazy(() => import("@/pages/corporate/CorporateWellnessCalendar"));
const CorporateCompliance           = lazy(() => import("@/pages/corporate/CorporateCompliance"));
const CorporateSupport              = lazy(() => import("@/pages/corporate/CorporateSupport"));
const CorporateCommandCenter        = lazy(() => import("@/pages/corporate/CorporateCommandCenter"));

// ─── TPA ─────────────────────────────────────────────────────────────────────
const TpaLogin               = lazy(() => import("@/pages/tpa/TpaLogin"));
const TPADashboard           = lazy(() => import("@/pages/tpa/TPADashboard"));
const TPAClaims              = lazy(() => import("@/pages/tpa/TPAClaims"));
const TPAMembers             = lazy(() => import("@/pages/tpa/TPAMembers"));
const TPACommunicationHub    = lazy(() => import("@/pages/tpa/TPACommunicationHub"));
const TPAHeritageIntegration = lazy(() => import("@/pages/tpa/TPAHeritageIntegration"));
const TPAIntegrationPage     = lazy(() => import("@/pages/tpa/TPAIntegrationPage"));
const TPAProvidersPage       = lazy(() => import("@/pages/tpa/TPAProvidersPage"));
const TPAClaimSubmissionPage = lazy(() => import("@/pages/tpa/TPAClaimSubmissionPage"));
const TPAECardPage           = lazy(() => import("@/pages/tpa/TPAECardPage"));
const TPAHospitalsPage       = lazy(() => import("@/pages/tpa/TPAHospitalsPage"));

const _TPAPlaceholders = () => import("@/pages/tpa/TPAPlaceholders");
const TPAPolicies   = lazyNamed(_TPAPlaceholders, "TPAPolicies");
const TPAPreAuth    = lazyNamed(_TPAPlaceholders, "TPAPreAuth");
const TPAAnalytics  = lazyNamed(_TPAPlaceholders, "TPAAnalytics");
const TPAReports    = lazyNamed(_TPAPlaceholders, "TPAReports");
const TPASettings   = lazyNamed(_TPAPlaceholders, "TPASettings");
const TPASupport    = lazyNamed(_TPAPlaceholders, "TPASupport");
const TPACorporates = lazyNamed(_TPAPlaceholders, "TPACorporates");
const TPAProfile    = lazyNamed(_TPAPlaceholders, "TPAProfile");

// ─── PSU / Insurer / NGO / Aggregator / Broker ───────────────────────────────
const PSULogin              = lazy(() => import("@/pages/psu/PSULogin"));
const InsurerLogin          = lazy(() => import("@/pages/insurer/InsurerLogin"));
const NGOLogin              = lazy(() => import("@/pages/ngo/NGOLogin"));
const InsuranceBrokerRegister = lazy(() => import("@/pages/insurance-broker/InsuranceBrokerRegister"));
const InsuranceBrokerLogin  = lazy(() => import("@/pages/insurance-broker/InsuranceBrokerLogin"));
const BrokerDashboard       = lazy(() => import("@/pages/insurance-broker/BrokerDashboard"));
const BrokerCommunication   = lazy(() => import("@/pages/insurance-broker/BrokerCommunication"));
const _BrokerPortalPages    = () => import('@/pages/insurance-broker/BrokerPortalPages');
const BrokerPolicies        = lazyNamed(_BrokerPortalPages, 'BrokerPolicies');
const BrokerCorporates      = lazyNamed(_BrokerPortalPages, 'BrokerCorporates');
const BrokerProfile         = lazyNamed(_BrokerPortalPages, 'BrokerProfile');
const BrokerCommissions     = lazyNamed(_BrokerPortalPages, 'BrokerCommissions');
const BrokerReports         = lazyNamed(_BrokerPortalPages, 'BrokerReports');
const BrokerAnalytics       = lazyNamed(_BrokerPortalPages, 'BrokerAnalytics');
const BrokerNotifications   = lazyNamed(_BrokerPortalPages, 'BrokerNotifications');
const BrokerSettings        = lazyNamed(_BrokerPortalPages, 'BrokerSettings');
const BrokerSupport         = lazyNamed(_BrokerPortalPages, 'BrokerSupport');
const InsuranceCompanyLogin = lazy(() => import("@/pages/insurance-company/InsuranceCompanyLogin"));
const InsuranceCommunication = lazy(() => import("@/pages/insurance-company/InsuranceCommunication"));
const AggregatorLogin       = lazy(() => import("@/pages/aggregator/AggregatorLogin"));
const AggregatorDashboard   = lazy(() => import("@/pages/aggregator/AggregatorDashboard"));
const AggregatorCorporates  = lazy(() => import("@/pages/aggregator/AggregatorCorporates"));
const AggregatorPartners    = lazy(() => import("@/pages/aggregator/AggregatorPartners"));

// ─── Hospital Department Portals ─────────────────────────────────────────────
const AccountsLogin     = lazy(() => import("@/pages/accounts/AccountsLogin"));
const AccountsDashboard = lazy(() => import("@/pages/accounts/AccountsDashboard"));
const _AccountsModulePages = () => import("@/pages/accounts/AccountsModulePages");
const AccountsBillsPage            = lazyNamed(_AccountsModulePages, "AccountsBillsPage");
const AccountsPaymentsPage         = lazyNamed(_AccountsModulePages, "AccountsPaymentsPage");
const AccountsPatientAcctsPage     = lazyNamed(_AccountsModulePages, "AccountsPatientAcctsPage");
const AccountsInsuranceBillingPage = lazyNamed(_AccountsModulePages, "AccountsInsuranceBillingPage");
const AccountsExpensesPage           = lazyNamed(_AccountsModulePages, "AccountsExpensesPage");
const AccountsVendorsPage            = lazyNamed(_AccountsModulePages, "AccountsVendorsPage");
const AccountsPayrollPage            = lazyNamed(_AccountsModulePages, "AccountsPayrollPage");
const AccountsBudgetPage             = lazyNamed(_AccountsModulePages, "AccountsBudgetPage");
const AccountsLedgerPage             = lazyNamed(_AccountsModulePages, "AccountsLedgerPage");
const AccountsJournalEntriesPage     = lazyNamed(_AccountsModulePages, "AccountsJournalEntriesPage");
const AccountsChartOfAccountsPage    = lazyNamed(_AccountsModulePages, "AccountsChartOfAccountsPage");
const AccountsReportsPage            = lazyNamed(_AccountsModulePages, "AccountsReportsPage");
const AccountsTaxCompliancePage      = lazyNamed(_AccountsModulePages, "AccountsTaxCompliancePage");
const AccountsAnalyticsPage          = lazyNamed(_AccountsModulePages, "AccountsAnalyticsPage");
const AccountsSettingsPage           = lazyNamed(_AccountsModulePages, "AccountsSettingsPage");
const AccountsSupportPage            = lazyNamed(_AccountsModulePages, "AccountsSupportPage");

const MRDLogin     = lazy(() => import("@/pages/mrd/MRDLogin"));
const MRDDashboard = lazy(() => import("@/pages/mrd/MRDDashboard"));
const _MRDModulePages = () => import("@/pages/mrd/MRDModulePages");
const MRDRecordsPage      = lazyNamed(_MRDModulePages, "MRDRecordsPage");
const MRDAdmissionsPage   = lazyNamed(_MRDModulePages, "MRDAdmissionsPage");
const MRDDischargePage    = lazyNamed(_MRDModulePages, "MRDDischargePage");
const MRDRequestsPage     = lazyNamed(_MRDModulePages, "MRDRequestsPage");
const MRDICDCodingPage    = lazyNamed(_MRDModulePages, "MRDICDCodingPage");
const MRDMedicoLegalPage  = lazyNamed(_MRDModulePages, "MRDMedicoLegalPage");
const MRDFileTrackingPage = lazyNamed(_MRDModulePages, "MRDFileTrackingPage");
const MRDStatisticsPage   = lazyNamed(_MRDModulePages, "MRDStatisticsPage");
const MRDSettingsPage     = lazyNamed(_MRDModulePages, "MRDSettingsPage");
const MRDSupportPage      = lazyNamed(_MRDModulePages, "MRDSupportPage");

const InsuranceDeskLogin     = lazy(() => import("@/pages/insurance-desk/InsuranceDeskLogin"));
const InsuranceDeskDashboard = lazy(() => import("@/pages/insurance-desk/InsuranceDeskDashboard"));
const _InsuranceDeskModulePages = () => import("@/pages/insurance-desk/InsuranceDeskModulePages");
const InsuranceDeskPreAuthPage         = lazyNamed(_InsuranceDeskModulePages, "InsuranceDeskPreAuthPage");
const InsuranceDeskClaimsPage          = lazyNamed(_InsuranceDeskModulePages, "InsuranceDeskClaimsPage");
const InsuranceDeskDocumentsPage       = lazyNamed(_InsuranceDeskModulePages, "InsuranceDeskDocumentsPage");
const InsuranceDeskTPAPage             = lazyNamed(_InsuranceDeskModulePages, "InsuranceDeskTPAPage");
const InsuranceDeskPatientInsurancePage= lazyNamed(_InsuranceDeskModulePages, "InsuranceDeskPatientInsurancePage");
const InsuranceDeskSearchPage          = lazyNamed(_InsuranceDeskModulePages, "InsuranceDeskSearchPage");
const InsuranceDeskAnalyticsPage       = lazyNamed(_InsuranceDeskModulePages, "InsuranceDeskAnalyticsPage");
const InsuranceDeskSettingsPage        = lazyNamed(_InsuranceDeskModulePages, "InsuranceDeskSettingsPage");
const InsuranceDeskSupportPage         = lazyNamed(_InsuranceDeskModulePages, "InsuranceDeskSupportPage");

const HRLogin     = lazy(() => import("@/pages/hr/HRLogin"));
const HRDashboard = lazy(() => import("@/pages/hr/HRDashboard"));
const _HRModulePages = () => import("@/pages/hr/HRModulePages");
const HRStaffPage         = lazyNamed(_HRModulePages, "HRStaffPage");
const HRAttendancePage    = lazyNamed(_HRModulePages, "HRAttendancePage");
const HRLeavesPage        = lazyNamed(_HRModulePages, "HRLeavesPage");
const HRShiftsPage        = lazyNamed(_HRModulePages, "HRShiftsPage");
const HROnboardingPage    = lazyNamed(_HRModulePages, "HROnboardingPage");
const HRPayrollPage       = lazyNamed(_HRModulePages, "HRPayrollPage");
const HRPfEsiPage         = lazyNamed(_HRModulePages, "HRPfEsiPage");
const HRBenefitsPage      = lazyNamed(_HRModulePages, "HRBenefitsPage");
const HRRecruitmentPage   = lazyNamed(_HRModulePages, "HRRecruitmentPage");
const HRTrainingPage      = lazyNamed(_HRModulePages, "HRTrainingPage");
const HRPerformancePage   = lazyNamed(_HRModulePages, "HRPerformancePage");
const HRAppraisalsPage    = lazyNamed(_HRModulePages, "HRAppraisalsPage");
const HRReportsPage       = lazyNamed(_HRModulePages, "HRReportsPage");
const HRAnalyticsPage     = lazyNamed(_HRModulePages, "HRAnalyticsPage");
const HRCompliancePage    = lazyNamed(_HRModulePages, "HRCompliancePage");
const HRSettingsPage      = lazyNamed(_HRModulePages, "HRSettingsPage");
const HRSupportPage       = lazyNamed(_HRModulePages, "HRSupportPage");

const ITEDPLogin     = lazy(() => import("@/pages/it-edp/ITEDPLogin"));
const ITEDPDashboard = lazy(() => import("@/pages/it-edp/ITEDPDashboard"));
const _ITEDPModulePages = () => import("@/pages/it-edp/ITEDPModulePages");
const ITEDPTicketsPage  = lazyNamed(_ITEDPModulePages, "ITEDPTicketsPage");
const ITEDPUsersPage    = lazyNamed(_ITEDPModulePages, "ITEDPUsersPage");
const ITEDPAssetsPage   = lazyNamed(_ITEDPModulePages, "ITEDPAssetsPage");
const ITEDPSystemsPage  = lazyNamed(_ITEDPModulePages, "ITEDPSystemsPage");
const ITEDPNetworkPage  = lazyNamed(_ITEDPModulePages, "ITEDPNetworkPage");
const ITEDPBackupPage   = lazyNamed(_ITEDPModulePages, "ITEDPBackupPage");
const ITEDPSecurityPage = lazyNamed(_ITEDPModulePages, "ITEDPSecurityPage");
const ITEDPAccessPage   = lazyNamed(_ITEDPModulePages, "ITEDPAccessPage");
const ITEDPReportsPage  = lazyNamed(_ITEDPModulePages, "ITEDPReportsPage");
const ITEDPSettingsPage = lazyNamed(_ITEDPModulePages, "ITEDPSettingsPage");
const ITEDPSupportPage  = lazyNamed(_ITEDPModulePages, "ITEDPSupportPage");

const OTLogin     = lazy(() => import("@/pages/ot/OTLogin"));
const OTDashboard = lazy(() => import("@/pages/ot/OTDashboard"));
const _OTModulePages = () => import("@/pages/ot/OTModulePages");
const OTSchedulePage      = lazyNamed(_OTModulePages, "OTSchedulePage");
const OTPreOpPage         = lazyNamed(_OTModulePages, "OTPreOpPage");
const OTConsentPage       = lazyNamed(_OTModulePages, "OTConsentPage");
const OTTeamsPage         = lazyNamed(_OTModulePages, "OTTeamsPage");
const OTEquipmentPage     = lazyNamed(_OTModulePages, "OTEquipmentPage");
const OTSterilizationPage = lazyNamed(_OTModulePages, "OTSterilizationPage");
const OTImplantsPage      = lazyNamed(_OTModulePages, "OTImplantsPage");
const OTAnesthesiaPage    = lazyNamed(_OTModulePages, "OTAnesthesiaPage");
const OTSafetyPage        = lazyNamed(_OTModulePages, "OTSafetyPage");
const OTPostOpPage        = lazyNamed(_OTModulePages, "OTPostOpPage");
const OTRecordsPage       = lazyNamed(_OTModulePages, "OTRecordsPage");
const OTReportsPage       = lazyNamed(_OTModulePages, "OTReportsPage");
const OTAnalyticsPage     = lazyNamed(_OTModulePages, "OTAnalyticsPage");
const OTSettingsPage      = lazyNamed(_OTModulePages, "OTSettingsPage");
const OTSupportPage       = lazyNamed(_OTModulePages, "OTSupportPage");
const OTTheatreViewPage   = lazyNamed(_OTModulePages, "OTTheatreViewPage");

const ICULogin     = lazy(() => import("@/pages/icu/ICULogin"));
const ICUDashboard = lazy(() => import("@/pages/icu/ICUDashboard"));
const _ICUModulePages = () => import("@/pages/icu/ICUModulePages");
const ICULiveMonitorPage = lazyNamed(_ICUModulePages, "ICULiveMonitorPage");
const ICUPatientsPage    = lazyNamed(_ICUModulePages, "ICUPatientsPage");
const ICUBedsPage        = lazyNamed(_ICUModulePages, "ICUBedsPage");
const ICUMedicationsPage = lazyNamed(_ICUModulePages, "ICUMedicationsPage");
const ICUVitalsPage      = lazyNamed(_ICUModulePages, "ICUVitalsPage");
const ICUFluidBalancePage = lazyNamed(_ICUModulePages, "ICUFluidBalancePage");
const ICUVentilatorsPage  = lazyNamed(_ICUModulePages, "ICUVentilatorsPage");
const ICUEquipmentPage   = lazyNamed(_ICUModulePages, "ICUEquipmentPage");
const ICUInfectionsPage  = lazyNamed(_ICUModulePages, "ICUInfectionsPage");
const ICUTeamPage        = lazyNamed(_ICUModulePages, "ICUTeamPage");
const ICUProtocolsPage   = lazyNamed(_ICUModulePages, "ICUProtocolsPage");
const ICUAlertsPage      = lazyNamed(_ICUModulePages, "ICUAlertsPage");
const ICUReportsPage     = lazyNamed(_ICUModulePages, "ICUReportsPage");
const ICUAnalyticsPage   = lazyNamed(_ICUModulePages, "ICUAnalyticsPage");
const ICUSettingsPage    = lazyNamed(_ICUModulePages, "ICUSettingsPage");
const ICUSupportPage     = lazyNamed(_ICUModulePages, "ICUSupportPage");

const QualityLogin     = lazy(() => import("@/pages/quality/QualityLogin"));
const QualityDashboard = lazy(() => import("@/pages/quality/QualityDashboard"));
const _QualityModulePages = () => import("@/pages/quality/QualityModulePages");
const QualityNABHStandardsPage = lazyNamed(_QualityModulePages, "QualityNABHStandardsPage");
const QualityAssessmentsPage   = lazyNamed(_QualityModulePages, "QualityAssessmentsPage");
const QualityAuditReportsPage  = lazyNamed(_QualityModulePages, "QualityAuditReportsPage");
const QualityAccreditationPage = lazyNamed(_QualityModulePages, "QualityAccreditationPage");
const QualityIncidentsPage     = lazyNamed(_QualityModulePages, "QualityIncidentsPage");
const QualityKPIsPage          = lazyNamed(_QualityModulePages, "QualityKPIsPage");
const QualitySOPsPage          = lazyNamed(_QualityModulePages, "QualitySOPsPage");
const QualityFeedbackPage      = lazyNamed(_QualityModulePages, "QualityFeedbackPage");
const QualityReportsPage       = lazyNamed(_QualityModulePages, "QualityReportsPage");
const QualitySettingsPage      = lazyNamed(_QualityModulePages, "QualitySettingsPage");
const QualitySupportPage       = lazyNamed(_QualityModulePages, "QualitySupportPage");

const SecurityLogin     = lazy(() => import("@/pages/security/SecurityLogin"));
const SecurityDashboard = lazy(() => import("@/pages/security/SecurityDashboard"));
const _SecurityModulePages = () => import("@/pages/security/SecurityModulePages");
const SecurityCCTVPage         = lazyNamed(_SecurityModulePages, "SecurityCCTVPage");
const SecurityAccessPointsPage = lazyNamed(_SecurityModulePages, "SecurityAccessPointsPage");
const SecurityAccessLogsPage   = lazyNamed(_SecurityModulePages, "SecurityAccessLogsPage");
const SecurityIncidentsPage    = lazyNamed(_SecurityModulePages, "SecurityIncidentsPage");
const SecurityAlertsPage       = lazyNamed(_SecurityModulePages, "SecurityAlertsPage");
const SecurityGuardDutyPage    = lazyNamed(_SecurityModulePages, "SecurityGuardDutyPage");
const SecurityVisitorsPage     = lazyNamed(_SecurityModulePages, "SecurityVisitorsPage");
const SecurityStaffLogPage     = lazyNamed(_SecurityModulePages, "SecurityStaffLogPage");
const SecurityReportsPage      = lazyNamed(_SecurityModulePages, "SecurityReportsPage");
const SecuritySettingsPage     = lazyNamed(_SecurityModulePages, "SecuritySettingsPage");
const SecuritySupportPage      = lazyNamed(_SecurityModulePages, "SecuritySupportPage");
const SecurityAssetTrackingPage = lazyNamed(_SecurityModulePages, "SecurityAssetTrackingPage");
const SecurityImplementationPage = lazyNamed(_SecurityModulePages, "SecurityImplementationPage");

// ─── PageLoader — Suspense fallback ──────────────────────────────────────────
const PageLoader = () => (
  <div className="flex items-center justify-center h-screen w-full bg-white">
    <div className="flex flex-col items-center gap-3">
      <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      <p className="text-sm text-gray-500">Loading…</p>
    </div>
  </div>
);

// ─── Admin route guard ────────────────────────────────────────────────────────
const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { setIsAdmin(false); return; }
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      setIsAdmin(payload.role === "admin" || payload.isAdmin === true);
    } catch {
      setIsAdmin(false);
    }
  }, []);

  if (isAdmin === null)
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  if (!isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
};

// ─── AppRoutes ────────────────────────────────────────────────────────────────
const AppRoutes = () => {
  const PharmacyEntry = () => {
    const token = localStorage.getItem("pharmacyToken");
    return <Navigate to={token ? "/pharmacy/dashboard" : "/pharmacy/login"} replace />;
  };

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* ── Home / auth ─────────────────────────────────────────────── */}
        <Route path="/"                element={<MainLayout><Index /></MainLayout>} />
        <Route path="/login"           element={<Login />} />
        <Route path="/change-password" element={<ChangePassword />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password"  element={<ResetPassword />} />
        <Route path="/oauth-callback"  element={<OAuthCallback />} />
        <Route path="/register"        element={<Register />} />
        <Route path="/doc-register"    element={<DocRegister />} />
        <Route path="/debug"           element={<DebugDashboard />} />

        {/* ── Doctor ──────────────────────────────────────────────────── */}
        <Route path="/doctor/login"               element={<DoctorLogin />} />
        <Route path="/doctor/home"                element={<DoctorMobileHome />} />
        <Route path="/doctor-dashboard"           element={<DoctorDashboard />} />
        <Route path="/doctor/dashboard"           element={<DoctorDashboard />} />
        <Route path="/doctor/appointments"        element={<DoctorAppointments />} />
        <Route path="/doctor/availability"        element={<DoctorAppointmentSettings />} />
        <Route path="/doctor/prescriptions"       element={<DoctorPrescriptions />} />
        <Route path="/doctor/patients"            element={<DoctorPatients />} />
        <Route path="/doctor/triage"              element={<DoctorTriage />} />
        <Route path="/doctor/remote-monitoring"   element={<RemoteHealthMonitoring />} />
        <Route path="/doctor/assist"              element={<DoctorAssist />} />
        <Route path="/doctor/health-monitoring"   element={<HealthMonitoringDashboardWrapper />} />
        <Route path="/doctor/contact"             element={<DoctorContact />} />
        <Route path="/doctor/alerts"              element={<DoctorAlerts />} />
        <Route path="/doctor/video"               element={<DoctorVideoConsultation />} />
        <Route path="/doctor/recording-test"      element={<RecordingTest />} />
        <Route path="/doctor/chat"                element={<ChatCall />} />
        <Route path="/doctor/analytics"           element={<DoctorAnalytics />} />
        <Route path="/doctor/reports"             element={<DoctorReports />} />
        <Route path="/doctor/settings"            element={<DoctorSettings />} />
        <Route path="/doctor/templates"           element={<DoctorDocumentTemplates />} />
        <Route path="/doctor/template-settings"   element={<DoctorTemplateSettings />} />
        <Route path="/doctor/specialty-templates" element={<DoctorSpecialtyTemplates />} />
        <Route path="/doctor/prescription-writer" element={<Navigate to="/doctor/prescriptions" replace />} />
        <Route path="/doctor/services"            element={<DoctorServices />} />
        <Route path="/doctor/billing"             element={<DoctorBilling />} />
        <Route path="/doctor/health-records"      element={<PatientEMR />} />

        {/* ── Hospital ────────────────────────────────────────────────── */}
        <Route path="/hospital/register"                   element={<HospitalRegister />} />
        <Route path="/hospital/login"                      element={<HospitalLogin />} />
        <Route path="/hospital/dashboard"                  element={<HospitalDashboard />} />
        <Route path="/hospital/practice-management"        element={<HospitalPracticeManagement />} />
        <Route path="/hospital/corporate-management"       element={<HospitalCorporateManagement />} />
        <Route path="/hospital/insurance-payer-management" element={<HospitalInsurancePayerManagement />} />
        <Route path="/hospital/insurance-billing"          element={<Navigate to="/hospital/insurance-claims?tab=claims" replace />} />
        <Route path="/hospital/insurance-claims"           element={<HospitalInsuranceClaimsDashboard />} />
        <Route path="/hospital/mrd"                        element={<HospitalMRD />} />
        <Route path="/hospital/ehr"                        element={<HospitalEHR />} />
        <Route path="/hospital/lab-order"                  element={<HospitalLabOrder />} />
        <Route path="/hospital/imaging-order"              element={<HospitalImagingOrder />} />
        <Route path="/hospital/prescription-creator"       element={<HospitalPrescriptionCreator />} />
        <Route path="/hospital/procedure-adder"            element={<HospitalProcedureAdder />} />
        <Route path="/hospital/discharge-summary"          element={<HospitalDischargeSummary />} />
        <Route path="/hospital/ip-sheets"                  element={<HospitalIPSheets />} />
        <Route path="/hospital/appointments"               element={<HospitalAppointmentsPage />} />
        <Route path="/hospital/beds"                       element={<HospitalBedsPage />} />
        <Route path="/hospital/patients"                   element={<HospitalPatientsPage />} />
        <Route path="/hospital/doctors"                    element={<HospitalDoctorsManagement />} />
        <Route path="/hospital/opd-ipd"                    element={<HospitalOpdIpdPage />} />
        <Route path="/hospital/pharmacy"                   element={<HospitalPharmacyPage />} />
        <Route path="/hospital/lab-reports"                element={<HospitalLabReportsPage />} />
        <Route path="/hospital/billing"                    element={<HospitalBillingPage />} />
        <Route path="/hospital/claims"                     element={<HospitalClaimsPage />} />
        <Route path="/hospital/staff"                      element={<HospitalStaffPage />} />
        <Route path="/hospital/communication"              element={<HospitalCommunicationHub />} />
        <Route path="/hospital/team-chat"                  element={<HospitalTeamChat />} />
        <Route path="/hospital/ambulance"                  element={<HospitalAmbulance />} />
        <Route path="/hospital/branches"                   element={<HospitalBranchesClinic />} />
        <Route path="/hospital/notifications"              element={<HospitalNotifications />} />
        <Route path="/hospital/settings"                   element={<HospitalSettingsPage />} />
        <Route path="/hospital/support"                    element={<HospitalSupportPage />} />

        {/* ── Clinic ──────────────────────────────────────────────────── */}
        <Route path="/clinic/login"         element={<ClinicLogin />} />
        <Route path="/clinic/register"      element={<ClinicRegister />} />
        <Route path="/clinic/dashboard"     element={<ClinicDashboard />} />
        <Route path="/clinic/appointments"  element={<ClinicAppointmentsPage />} />
        <Route path="/clinic/patients"      element={<ClinicPatientsPage />} />
        <Route path="/clinic/queue"         element={<ClinicQueuePage />} />
        <Route path="/clinic/doctors"       element={<ClinicDoctorsPage />} />
        <Route path="/clinic/consultations" element={<ClinicConsultationsPage />} />
        <Route path="/clinic/prescriptions" element={<ClinicPrescriptionsPage />} />
        <Route path="/clinic/pharmacy"      element={<ClinicPharmacyPage />} />
        <Route path="/clinic/lab-tests"     element={<ClinicLabTestsPage />} />
        <Route path="/clinic/billing"       element={<ClinicBillingPage />} />
        <Route path="/clinic/payments"      element={<ClinicPaymentsPage />} />
        <Route path="/clinic/reports"       element={<ClinicReportsPage />} />
        <Route path="/clinic/staff"         element={<ClinicStaffPage />} />
        <Route path="/clinic/notifications" element={<ClinicNotificationsPage />} />
        <Route path="/clinic/settings"      element={<ClinicSettingsPage />} />
        <Route path="/clinic/support"       element={<ClinicSupportPage />} />

        {/* ── Lab ─────────────────────────────────────────────────────── */}
        <Route path="/lab/login"           element={<LabLogin />} />
        <Route path="/lab/register"        element={<LabRegister />} />
        <Route path="/lab/dashboard"       element={<LabDashboard />} />
        <Route path="/lab/test-catalog"    element={<LabDashboard />} />
        <Route path="/lab/orders"          element={<LabOrdersPage />} />
        <Route path="/lab/orders/new"      element={<LabOrdersPage />} />
        <Route path="/lab/patients"        element={<LabPatientsPage />} />
        <Route path="/lab/patients/new"    element={<LabPatientsPage />} />
        <Route path="/lab/appointments"    element={<LabAppointmentsPage />} />
        <Route path="/lab/appointments/new" element={<LabAppointmentsPage />} />
        <Route path="/lab/queue"           element={<LabQueuePage />} />
        <Route path="/lab/queue/new"       element={<LabQueuePage />} />
        <Route path="/lab/samples"         element={<LabSamplesPage />} />
        <Route path="/lab/samples/new"     element={<LabSamplesPage />} />
        <Route path="/lab/processing"      element={<LabProcessingPage />} />
        <Route path="/lab/processing/new"  element={<LabProcessingPage />} />
        <Route path="/lab/results"         element={<LabResultsPage />} />
        <Route path="/lab/results/new"     element={<LabResultsPage />} />
        <Route path="/lab/reports"         element={<LabReportsPage />} />
        <Route path="/lab/reports/new"     element={<LabReportsPage />} />
        <Route path="/lab/inventory"       element={<LabInventoryPage />} />
        <Route path="/lab/inventory/new"   element={<LabInventoryPage />} />
        <Route path="/lab/billing"         element={<LabBillingPage />} />
        <Route path="/lab/billing/new"     element={<LabBillingPage />} />
        <Route path="/lab/payments"        element={<LabPaymentsPage />} />
        <Route path="/lab/payments/new"    element={<LabPaymentsPage />} />
        <Route path="/lab/analytics"       element={<LabAnalyticsPage />} />
        <Route path="/lab/staff"           element={<LabStaffPage />} />
        <Route path="/lab/staff/new"       element={<LabStaffPage />} />
        <Route path="/lab/notifications"   element={<LabNotificationsPage />} />
        <Route path="/lab/settings"        element={<LabSettingsPage />} />
        <Route path="/lab/support"         element={<LabSupportPage />} />

        {/* ── Pharmacy ────────────────────────────────────────────────── */}
        <Route path="/pharmacy"                  element={<PharmacyEntry />} />
        <Route path="/pharmacy/login"            element={<PharmacyLogin />} />
        <Route path="/pharmacy/register"         element={<PharmacyRegister />} />
        <Route path="/pharmacy/dashboard"        element={<PharmacyDashboard />} />
        <Route path="/pharmacy/pos"              element={<PharmacyPOSPage />} />
        <Route path="/pharmacy/prescriptions"    element={<PharmacyPrescriptionsPage />} />
        <Route path="/pharmacy/inventory"        element={<PharmacyInventoryPage />} />
        <Route path="/pharmacy/stock-alerts"     element={<PharmacyStockAlertsPage />} />
        <Route path="/pharmacy/batches"          element={<PharmacyBatchesPage />} />
        <Route path="/pharmacy/purchase-orders"  element={<PharmacyPurchaseOrdersPage />} />
        <Route path="/pharmacy/customers"        element={<PharmacyCustomersPage />} />
        <Route path="/pharmacy/reports"          element={<PharmacyReportsPage />} />
        <Route path="/pharmacy/invoices"         element={<PharmacyInvoicesPage />} />
        <Route path="/pharmacy/expiry"           element={<PharmacyExpiryPage />} />
        <Route path="/pharmacy/analytics"        element={<PharmacyAnalyticsPage />} />
        <Route path="/pharmacy/settings"         element={<PharmacySettingsPage />} />
        <Route path="/pharmacy/support"          element={<PharmacySupportPage />} />

        {/* ── Ambulance ───────────────────────────────────────────────── */}
        <Route path="/ambulance/register"     element={<AmbulanceRegister />} />
        <Route path="/ambulance/login"        element={<AmbulanceLogin />} />
        <Route path="/ambulance/dashboard"    element={<AmbulanceDashboard />} />
        <Route path="/ambulance/active-trips" element={<AmbulanceActiveTripsPage />} />
        <Route path="/ambulance/dispatch"     element={<AmbulanceDispatchPage />} />
        <Route path="/ambulance/tracking"     element={<AmbulanceTrackingPage />} />
        <Route path="/ambulance/history"      element={<AmbulanceHistoryPage />} />
        <Route path="/ambulance/fleet"        element={<AmbulanceFleetPage />} />
        <Route path="/ambulance/staff"        element={<AmbulanceStaffPage />} />
        <Route path="/ambulance/maintenance"  element={<AmbulanceMaintenancePage />} />
        <Route path="/ambulance/schedule"     element={<AmbulanceSchedulePage />} />
        <Route path="/ambulance/billing"      element={<AmbulanceBillingPage />} />
        <Route path="/ambulance/reports"      element={<AmbulanceReportsPage />} />
        <Route path="/ambulance/alerts"       element={<AmbulanceAlertsPage />} />
        <Route path="/ambulance/settings"     element={<AmbulanceSettingsPage />} />
        <Route path="/ambulance/support"      element={<AmbulanceSupportPage />} />

        {/* ── Homecare ────────────────────────────────────────────────── */}
        <Route path="/homecare/login"         element={<HomecareLogin />} />
        <Route path="/homecare/register"      element={<HomecareRegister />} />
        <Route path="/homecare/dashboard"     element={<HomecareDashboard />} />
        <Route path="/homecare/patients"      element={<HomecarePatientsPage />} />
        <Route path="/homecare/patients/new"  element={<HomecarePatientsPage />} />
        <Route path="/homecare/care-plans"    element={<HomecareCarePlansPage />} />
        <Route path="/homecare/appointments"  element={<HomecareAppointmentsPage />} />
        <Route path="/homecare/staff"         element={<HomecareStaffPage />} />
        <Route path="/homecare/services"      element={<HomecareServicesPage />} />
        <Route path="/homecare/billing"       element={<HomecareBillingPage />} />
        <Route path="/homecare/inventory"     element={<HomecareInventoryPage />} />
        <Route path="/homecare/reports"       element={<HomecareReportsPage />} />
        <Route path="/homecare/settings"      element={<HomecareSettingsPage />} />
        <Route path="/homecare/support"       element={<HomecareSupportPage />} />

        {/* ── Nurse ───────────────────────────────────────────────────── */}
        <Route path="/nurse/login"             element={<NurseLogin />} />
        <Route path="/nurse/dashboard"         element={<MainLayout><NurseDashboard /></MainLayout>} />
        <Route path="/nurse/patients"          element={<MainLayout><NursePatients /></MainLayout>} />
        <Route path="/nurse/vitals"            element={<MainLayout><NurseVitals /></MainLayout>} />
        <Route path="/nurse/medications"       element={<MainLayout><NurseMedications /></MainLayout>} />
        <Route path="/nurse/notes"             element={<MainLayout><NurseNotes /></MainLayout>} />
        <Route path="/nurse/appointments"      element={<MainLayout><NurseAppointments /></MainLayout>} />
        <Route path="/nurse/register-patient"  element={<MainLayout><NurseRegisterPatient /></MainLayout>} />

        {/* ── Assistant ───────────────────────────────────────────────── */}
        <Route path="/assistant/login"             element={<AssistantLogin />} />
        <Route path="/assistant/dashboard"         element={<MainLayout><AssistantDashboard /></MainLayout>} />
        <Route path="/assistant/register-patient"  element={<MainLayout><AssistantRegisterPatient /></MainLayout>} />
        <Route path="/assistant/patients"          element={<MainLayout><AssistantPatients /></MainLayout>} />
        <Route path="/assistant/appointments"      element={<MainLayout><AssistantAppointments /></MainLayout>} />
        <Route path="/assistant/prescriptions"     element={<MainLayout><AssistantPrescriptions /></MainLayout>} />
        <Route path="/assistant/billing"           element={<MainLayout><AssistantBilling /></MainLayout>} />
        <Route path="/assistant/messages"          element={<MainLayout><AssistantMessages /></MainLayout>} />
        <Route path="/assistant/orders"            element={<MainLayout><OrderTasks /></MainLayout>} />
        <Route path="/assistant/reports"           element={<MainLayout><AssistantReports /></MainLayout>} />
        <Route path="/assistant/profile"           element={<MainLayout><AssistantDashboard /></MainLayout>} />

        {/* ── CRM ─────────────────────────────────────────────────────── */}
        <Route path="/crm/login"         element={<CRMLogin />} />
        <Route path="/crm/dashboard"     element={<CRMDashboard />} />
        <Route path="/crm/leads"         element={<CRMLeadsPage />} />
        <Route path="/crm/deals"         element={<CRMDealsPage />} />
        <Route path="/crm/contacts"      element={<CRMContactsPage />} />
        <Route path="/crm/activities"    element={<CRMActivitiesPage />} />
        <Route path="/crm/pipeline"      element={<CRMPipelinePage />} />
        <Route path="/crm/reports"       element={<CRMReportsPage />} />
        <Route path="/crm/settings"      element={<CRMSettingsPage />} />
        <Route path="/crm/rfqs"           element={<CRMRFQsPage />} />
        <Route path="/crm/rfqs/:id"       element={<CRMRFQDetailPage />} />
        <Route path="/crm/rfqs/:id/quote/:quoteId" element={<CRMQuoteBuilderPage />} />

        {/* ── Team ────────────────────────────────────────────────────── */}
        <Route path="/team/login"                    element={<TeamLogin />} />
        <Route path="/team/dashboard"                element={<TeamDashboard />} />
        <Route path="/team/profile"                  element={<TeamProfile />} />
        <Route path="/team/directory"                element={<TeamDirectory />} />
        <Route path="/team/reports"                  element={<TeamReports />} />
        <Route path="/team/tools"                    element={<TeamTools />} />
        <Route path="/team/pharmacy-edit"            element={<TeamPharmacyEdit />} />
        <Route path="/team/user-management"          element={<TeamEmployeeManagement />} />
        <Route path="/team/doctor-management"        element={<TeamDoctorManagementPage />} />
        <Route path="/team/corporate-management"     element={<TeamCorporateManagement />} />
        <Route path="/team/corporate-health-booking" element={<CorporateHealthBooking />} />
        <Route path="/team/hospital-management"      element={<TeamHospitalManagementPage />} />
        <Route path="/team/clinic-management"        element={<MainLayout><TeamClinicList /></MainLayout>} />
        <Route path="/team/lab-management"           element={<TeamLabManagementPage />} />
        <Route path="/team/pharmacy-management"      element={<TeamPharmacyManagementPage />} />
        <Route path="/team/chat-analytics"           element={<TeamChatAnalyticsPage />} />
        <Route path="/team/support-tickets"          element={<MainLayout><TeamTicketManager /></MainLayout>} />
        <Route path="/team/appointments"             element={<TeamAppointmentsPage />} />
        <Route path="/team/chat"                     element={<TeamChatDashboardPage />} />
        <Route path="/team/whatsapp"                 element={<WhatsAppCommunication />} />
        <Route path="/team/whatsapp-templates"          element={<WhatsAppTemplates />} />
        <Route path="/team/whatsapp-inbox"           element={<WhatsAppInbox />} />
        <Route path="/team/rc-omnichannel"           element={<RocketChatOmnichannel />} />
        <Route path="/team/health-plans"             element={<TeamHealthPlans />} />
        <Route path="/team/broker-management"        element={<TeamBrokerManagement />} />
        <Route path="/team/activity"                 element={<TeamActivityLogsPage />} />
        <Route path="/team/settings"                 element={<TeamSettings />} />

        {/* ── Admin ───────────────────────────────────────────────────── */}
        <Route path="/admin/login"               element={<AdminLogin />} />
        <Route path="/admin/test"                element={<SimpleAdminDashboard />} />
        <Route path="/admin/system-test"         element={<AdminTestPage />} />
        <Route path="/admin/comprehensive"       element={<ComprehensiveAdminDashboard />} />
        <Route path="/admin/register-patient"    element={<AdminRegisterPatient />} />
        <Route path="/admin/manage-assistants"   element={<AdminManageAssistants />} />
        <Route path="/admin/doctors"             element={<DoctorsManagement />} />
        <Route path="/admin/users"               element={<UsersManagement />} />
        <Route path="/admin/team"                element={<TeamManagement />} />
        <Route path="/admin/team-privileges"     element={<TeamPrivileges />} />
        <Route path="/admin/chat"                element={<AdminChatDashboard />} />
        <Route path="/admin/appointments"        element={<AdminAppointments />} />
        <Route path="/admin/plans"               element={<AdminPlans />} />
        <Route path="/admin/insurance"           element={<AdminInsurance />} />
        <Route path="/admin/workflow-automation" element={<AdminWorkflowAutomation />} />
        <Route path="/admin/tenants"             element={<AdminTenantManagement />} />
        <Route path="/admin/insurer"             element={<InsurerManagement />} />
        <Route path="/admin/tpa"                 element={<TPAManagement />} />
        <Route path="/admin/brokers"             element={<BrokerManagement />} />
        <Route path="/admin/api-credentials"     element={<ApiCredentialsManagement />} />
        <Route path="/admin/hospitals"           element={<HospitalsManagement />} />
        <Route path="/admin/pending-registrations" element={<PendingRegistrations />} />
        <Route path="/admin/clinics"             element={<ClinicsManagement />} />
        <Route path="/admin/corporates"          element={<CorporatesManagement />} />
        <Route path="/admin/corporate-health-packages" element={<CorporateHealthPackages />} />
        <Route path="/admin/corporate-employees" element={<CorporateEmployeesManagement />} />
        <Route path="/admin/corporate-plans"     element={<CorporatePlansManagement />} />
        <Route path="/admin/pharmacies"          element={<PharmaciesManagement />} />
        <Route path="/admin/homecare"            element={<HomecareManagement />} />
        <Route path="/admin/ambulance"           element={<AmbulanceManagement />} />
        <Route path="/admin/medivac"             element={<MedivacManagement />} />
        <Route path="/admin/ngo"                 element={<NGOManagement />} />
        <Route path="/admin/psu"                 element={<PSUManagement />} />
        <Route path="/admin/ohc"                 element={<OHCManagement />} />
        <Route path="/admin/labs"                element={<LabsManagement />} />
        <Route path="/admin/billing"             element={<BillingManagement />} />
        <Route path="/admin/accounting"          element={<AccountingManagement />} />
        <Route path="/admin/payments"            element={<PaymentManagement />} />
        <Route path="/admin/coupons"             element={<CouponManagement />} />
        <Route path="/admin/email"               element={<EmailManagement />} />
        <Route path="/admin/activity-log"        element={<ActivityLog />} />
        <Route path="/admin/module-access"       element={<ModuleAccessControl />} />
        <Route path="/admin/auth-test"           element={<AdminAuthTest />} />
        <Route path="/admin/sms"                 element={<SMSManagement />} />
        <Route path="/admin/whatsapp"            element={<WhatsAppManagement />} />
        <Route path="/admin/video"               element={<VideoManagement />} />
        <Route path="/admin/voice"               element={<VoiceCallManagement />} />
        <Route path="/admin/tickets"             element={<TicketManagement />} />
        <Route path="/admin/tickets/:id"         element={<TicketManagement />} />
        <Route path="/admin/health-risk"         element={<AdminHealthRiskAssessment />} />
        <Route path="/admin/reports"             element={<ReportsPage />} />
        <Route path="/admin/crm"                 element={<CRMPage />} />
        <Route path="/admin/crm/lead/:id"        element={<CRMLeadDetail />} />
        <Route path="/admin/ai-analytics"        element={<AIAnalyticsDashboard />} />
        <Route path="/admin/ai-guard"             element={<SIBAIDashboard />} />
        <Route path="/admin/settings"            element={<SettingsPage />} />
        <Route path="/admin/dashboard"           element={<AdminDashboardHome />} />
        <Route path="/admin"                     element={<AdminDashboardHome />} />

        {/* ── Corporate ───────────────────────────────────────────────── */}
        <Route path="/corporate/login"                   element={<CorporateLogin />} />
        <Route path="/corporate/register"                element={<CorporateRegister />} />
        <Route path="/corporate/dashboard"               element={<CorporateDashboard />} />
        <Route path="/corporate/benefits"                element={<CorporateBenefits />} />
        <Route path="/corporate/employees"               element={<CorporateEmployees />} />
        <Route path="/corporate/appointments"            element={<CorporateAppointments />} />
        <Route path="/corporate/health-analysis"         element={<CorporateHealthAnalysis />} />
        <Route path="/corporate/departments"             element={<CorporateDepartments />} />
        <Route path="/corporate/claims"                  element={<CorporateClaims />} />
        <Route path="/corporate/reports"                 element={<CorporateReports />} />
        <Route path="/corporate/complaints"              element={<CorporateComplaints />} />
        <Route path="/corporate/compliance"              element={<CorporateCompliance />} />
        <Route path="/corporate/notifications"           element={<CorporateNotifications />} />
        <Route path="/corporate/settings"                element={<CorporateSettings />} />
        <Route path="/corporate/help"                    element={<CorporateHelp />} />
        <Route path="/corporate/health-risk-assessment"  element={<CorporateHealthRiskAssessment />} />
        <Route path="/corporate/gamification"            element={<CorporateGamification />} />
        <Route path="/corporate/wellness-calendar"       element={<CorporateWellnessCalendar />} />
        <Route path="/corporate/support"                 element={<CorporateSupport />} />
        <Route path="/corporate/command-center"            element={<CorporateCommandCenter />} />

        {/* ── TPA ─────────────────────────────────────────────────────── */}
        <Route path="/tpa/login"          element={<TpaLogin />} />
        <Route path="/tpa/dashboard"      element={<TPADashboard />} />
        <Route path="/tpa/claims"         element={<TPAClaims />} />
        <Route path="/tpa/corporates"     element={<TPACorporates />} />
        <Route path="/tpa/members"        element={<TPAMembers />} />
        <Route path="/tpa/policies"       element={<TPAPolicies />} />
        <Route path="/tpa/pre-auth"       element={<TPAPreAuth />} />
        <Route path="/tpa/analytics"      element={<TPAAnalytics />} />
        <Route path="/tpa/reports"        element={<TPAReports />} />
        <Route path="/tpa/communication"  element={<TPACommunicationHub />} />
        <Route path="/tpa/heritage"       element={<TPAHeritageIntegration />} />
        <Route path="/tpa/settings"       element={<TPASettings />} />
        <Route path="/tpa/support"        element={<TPASupport />} />
        <Route path="/tpa/profile"        element={<TPAProfile />} />
        <Route path="/tpa/integration"    element={<MainLayout><TPAIntegrationPage /></MainLayout>} />
        <Route path="/tpa/providers"      element={<MainLayout><TPAProvidersPage /></MainLayout>} />
        <Route path="/tpa/claim-submission" element={<MainLayout><TPAClaimSubmissionPage /></MainLayout>} />
        <Route path="/tpa/ecard"          element={<MainLayout><TPAECardPage /></MainLayout>} />
        <Route path="/tpa/hospitals"      element={<MainLayout><TPAHospitalsPage /></MainLayout>} />

        {/* ── Aggregator ──────────────────────────────────────────────── */}
        <Route path="/aggregator/login"         element={<AggregatorLogin />} />
        <Route path="/aggregator/dashboard"     element={<AggregatorDashboard />} />
        <Route path="/aggregator/corporates"    element={<AggregatorCorporates />} />
        <Route path="/aggregator/partners"      element={<AggregatorPartners />} />
        <Route path="/aggregator/notifications" element={<div>Notifications</div>} />
        <Route path="/aggregator/settings"      element={<div>Settings</div>} />
        <Route path="/aggregator/support"       element={<div>Support</div>} />

        {/* ── Hospital Insurance Portal ─────────────────────────────── */}
        {/* Login: public entry point (no slug needed yet) */}
        <Route path="/hospital-insurance/auth/login"      element={<Navigate to="/hospital-insurance/login" replace />} />
        <Route path="/hospital-insurance/login"           element={<InsurancePortalLogin />} />
        {/* Legacy redirects — send back to login so the slug is re-established */}
        <Route path="/hospital-insurance/*"               element={<Navigate to="/hospital-insurance/login" replace />} />
        {/* Slug-scoped insurance portal: /hospital/:slug/insurance/* */}
        <Route path="/hospital/:slug/insurance/dashboard"       element={<InsurancePortalDashboard />} />
        <Route path="/hospital/:slug/insurance/claims"          element={<InsuranceClaimsPage />} />
        <Route path="/hospital/:slug/insurance/pre-auth"        element={<InsurancePreAuthPage />} />
        <Route path="/hospital/:slug/insurance/pre-auth/*"      element={<InsurancePreAuthPage />} />
        <Route path="/hospital/:slug/insurance/reconciliation"  element={<InsuranceReconciliationPage />} />
        <Route path="/hospital/:slug/insurance/documents"       element={<InsuranceDocumentsPage />} />
        <Route path="/hospital/:slug/insurance/hospital-profile" element={<InsuranceHospitalProfilePage />} />
        <Route path="/hospital/:slug/insurance/analytics"       element={<InsuranceAnalyticsPage />} />
        <Route path="/hospital/:slug/insurance/tasks"           element={<InsuranceTasksPage />} />
        <Route path="/hospital/:slug/insurance/payer-management" element={<InsurancePayerManagementPage />} />
        <Route path="/hospital/:slug/insurance/courier"         element={<InsuranceCourierTrackingPage />} />
        <Route path="/hospital/:slug/insurance/nhcx"            element={<InsuranceNHCXPage />} />
        <Route path="/hospital/:slug/insurance/abdm"            element={<InsuranceABDMPage />} />
        <Route path="/hospital/:slug/insurance/calendar"        element={<InsuranceCalendarPage />} />
        <Route path="/hospital/:slug/insurance/inventory"       element={<InsuranceInventoryPage />} />
        <Route path="/hospital/:slug/insurance/bulk-upload"     element={<InsuranceBulkUploadPage />} />
        <Route path="/hospital/:slug/insurance/search"          element={<InsuranceSearchPage />} />
        <Route path="/hospital/:slug/insurance/settings"        element={<InsuranceSettingsPage />} />
        <Route path="/hospital/:slug/insurance/notifications"   element={<InsuranceNotificationsPage />} />
        <Route path="/hospital/:slug/insurance/admission"       element={<InsuranceAdmissionPage />} />
        <Route path="/hospital/:slug/insurance/discharge"       element={<InsuranceDischargePage />} />
        <Route path="/hospital/:slug/insurance/messages"        element={<InsuranceMessagesPage />} />
        <Route path="/hospital/:slug/insurance/denials"         element={<InsuranceDenialsPage />} />
        <Route path="/hospital/:slug/insurance/tariff"          element={<InsuranceTariffPage />} />
        <Route path="/hospital/:slug/insurance/empanelment"     element={<InsuranceEmpanelmentPage />} />
        <Route path="/hospital/:slug/insurance/reports"         element={<InsuranceReportsPage />} />
        <Route path="/hospital/:slug/insurance/sla"             element={<InsuranceSLAPage />} />
        <Route path="/hospital/:slug/insurance/govt-schemes"    element={<InsuranceGovtSchemesPage />} />
        <Route path="/hospital/:slug/insurance/email-inbox"       element={<InsuranceEmailInboxPage />} />

        {/* ── Accounts Dept ───────────────────────────────────────────── */}
        <Route path="/accounts/login"            element={<AccountsLogin />} />
        <Route path="/accounts/dashboard"        element={<AccountsDashboard />} />
        <Route path="/accounts/bills"            element={<AccountsBillsPage />} />
        <Route path="/accounts/payments"         element={<AccountsPaymentsPage />} />
        <Route path="/accounts/patient-accounts" element={<AccountsPatientAcctsPage />} />
        <Route path="/accounts/insurance-billing" element={<AccountsInsuranceBillingPage />} />
        <Route path="/accounts/expenses"            element={<AccountsExpensesPage />} />
        <Route path="/accounts/vendors"             element={<AccountsVendorsPage />} />
        <Route path="/accounts/payroll"             element={<AccountsPayrollPage />} />
        <Route path="/accounts/budget"              element={<AccountsBudgetPage />} />
        <Route path="/accounts/ledger"              element={<AccountsLedgerPage />} />
        <Route path="/accounts/journal-entries"     element={<AccountsJournalEntriesPage />} />
        <Route path="/accounts/chart-of-accounts"   element={<AccountsChartOfAccountsPage />} />
        <Route path="/accounts/reports"             element={<AccountsReportsPage />} />
        <Route path="/accounts/tax-compliance"      element={<AccountsTaxCompliancePage />} />
        <Route path="/accounts/analytics"           element={<AccountsAnalyticsPage />} />
        <Route path="/accounts/settings"            element={<AccountsSettingsPage />} />
        <Route path="/accounts/support"             element={<AccountsSupportPage />} />

        {/* ── MRD ─────────────────────────────────────────────────────── */}
        <Route path="/mrd/login"          element={<MRDLogin />} />
        <Route path="/mrd/dashboard"      element={<MRDDashboard />} />
        <Route path="/mrd/records"        element={<MRDRecordsPage />} />
        <Route path="/mrd/admissions"     element={<MRDAdmissionsPage />} />
        <Route path="/mrd/discharge"      element={<MRDDischargePage />} />
        <Route path="/mrd/requests"       element={<MRDRequestsPage />} />
        <Route path="/mrd/icd-coding"     element={<MRDICDCodingPage />} />
        <Route path="/mrd/medico-legal"   element={<MRDMedicoLegalPage />} />
        <Route path="/mrd/file-tracking"  element={<MRDFileTrackingPage />} />
        <Route path="/mrd/statistics"     element={<MRDStatisticsPage />} />
        <Route path="/mrd/settings"       element={<MRDSettingsPage />} />
        <Route path="/mrd/support"        element={<MRDSupportPage />} />

        {/* ── Insurance Desk ──────────────────────────────────────────── */}
        <Route path="/insurance-desk/login"             element={<InsuranceDeskLogin />} />
        <Route path="/insurance-desk/dashboard"         element={<InsuranceDeskDashboard />} />
        <Route path="/insurance-desk/pre-auth"          element={<InsuranceDeskPreAuthPage />} />
        <Route path="/insurance-desk/claims"            element={<InsuranceDeskClaimsPage />} />
        <Route path="/insurance-desk/documents"         element={<InsuranceDeskDocumentsPage />} />
        <Route path="/insurance-desk/tpa"               element={<InsuranceDeskTPAPage />} />
        <Route path="/insurance-desk/patient-insurance" element={<InsuranceDeskPatientInsurancePage />} />
        <Route path="/insurance-desk/search"            element={<InsuranceDeskSearchPage />} />
        <Route path="/insurance-desk/analytics"         element={<InsuranceDeskAnalyticsPage />} />
        <Route path="/insurance-desk/settings"          element={<InsuranceDeskSettingsPage />} />
        <Route path="/insurance-desk/support"           element={<InsuranceDeskSupportPage />} />

        {/* ── HR ──────────────────────────────────────────────────────── */}
        <Route path="/hr/login"        element={<HRLogin />} />
        <Route path="/hr/dashboard"    element={<HRDashboard />} />
        <Route path="/hr/staff"        element={<HRStaffPage />} />
        <Route path="/hr/attendance"   element={<HRAttendancePage />} />
        <Route path="/hr/leaves"       element={<HRLeavesPage />} />
        <Route path="/hr/shifts"       element={<HRShiftsPage />} />
        <Route path="/hr/onboarding"   element={<HROnboardingPage />} />
        <Route path="/hr/payroll"      element={<HRPayrollPage />} />
        <Route path="/hr/pf-esi"       element={<HRPfEsiPage />} />
        <Route path="/hr/benefits"     element={<HRBenefitsPage />} />
        <Route path="/hr/recruitment"  element={<HRRecruitmentPage />} />
        <Route path="/hr/training"     element={<HRTrainingPage />} />
        <Route path="/hr/performance"  element={<HRPerformancePage />} />
        <Route path="/hr/appraisals"   element={<HRAppraisalsPage />} />
        <Route path="/hr/reports"      element={<HRReportsPage />} />
        <Route path="/hr/analytics"    element={<HRAnalyticsPage />} />
        <Route path="/hr/compliance"   element={<HRCompliancePage />} />
        <Route path="/hr/settings"     element={<HRSettingsPage />} />
        <Route path="/hr/support"      element={<HRSupportPage />} />

        {/* ── IT/EDP ──────────────────────────────────────────────────── */}
        <Route path="/it-edp/login"     element={<ITEDPLogin />} />
        <Route path="/it-edp/dashboard" element={<ITEDPDashboard />} />
        <Route path="/it-edp/tickets"   element={<ITEDPTicketsPage />} />
        <Route path="/it-edp/users"     element={<ITEDPUsersPage />} />
        <Route path="/it-edp/assets"    element={<ITEDPAssetsPage />} />
        <Route path="/it-edp/systems"   element={<ITEDPSystemsPage />} />
        <Route path="/it-edp/network"   element={<ITEDPNetworkPage />} />
        <Route path="/it-edp/backup"    element={<ITEDPBackupPage />} />
        <Route path="/it-edp/security"  element={<ITEDPSecurityPage />} />
        <Route path="/it-edp/access"    element={<ITEDPAccessPage />} />
        <Route path="/it-edp/reports"   element={<ITEDPReportsPage />} />
        <Route path="/it-edp/settings"  element={<ITEDPSettingsPage />} />
        <Route path="/it-edp/support"   element={<ITEDPSupportPage />} />

        {/* ── OT ──────────────────────────────────────────────────────── */}
        <Route path="/ot/login"          element={<OTLogin />} />
        <Route path="/ot/dashboard"      element={<OTDashboard />} />
        <Route path="/ot/theatre-view"   element={<OTTheatreViewPage />} />
        <Route path="/ot/schedule"       element={<OTSchedulePage />} />
        <Route path="/ot/pre-op"         element={<OTPreOpPage />} />
        <Route path="/ot/consent"        element={<OTConsentPage />} />
        <Route path="/ot/teams"          element={<OTTeamsPage />} />
        <Route path="/ot/equipment"      element={<OTEquipmentPage />} />
        <Route path="/ot/sterilization"  element={<OTSterilizationPage />} />
        <Route path="/ot/implants"       element={<OTImplantsPage />} />
        <Route path="/ot/anesthesia"     element={<OTAnesthesiaPage />} />
        <Route path="/ot/safety"         element={<OTSafetyPage />} />
        <Route path="/ot/post-op"        element={<OTPostOpPage />} />
        <Route path="/ot/records"        element={<OTRecordsPage />} />
        <Route path="/ot/reports"        element={<OTReportsPage />} />
        <Route path="/ot/analytics"      element={<OTAnalyticsPage />} />
        <Route path="/ot/settings"       element={<OTSettingsPage />} />
        <Route path="/ot/support"        element={<OTSupportPage />} />

        {/* ── ICU ─────────────────────────────────────────────────────── */}
        <Route path="/icu/login"       element={<ICULogin />} />
        <Route path="/icu/dashboard"   element={<ICUDashboard />} />
        <Route path="/icu/live-monitor" element={<ICULiveMonitorPage />} />
        <Route path="/icu/patients"    element={<ICUPatientsPage />} />
        <Route path="/icu/beds"        element={<ICUBedsPage />} />
        <Route path="/icu/medications" element={<ICUMedicationsPage />} />
        <Route path="/icu/vitals"      element={<ICUVitalsPage />} />
        <Route path="/icu/fluid-balance" element={<ICUFluidBalancePage />} />
        <Route path="/icu/ventilators" element={<ICUVentilatorsPage />} />
        <Route path="/icu/equipment"   element={<ICUEquipmentPage />} />
        <Route path="/icu/infections"  element={<ICUInfectionsPage />} />
        <Route path="/icu/team"        element={<ICUTeamPage />} />
        <Route path="/icu/protocols"   element={<ICUProtocolsPage />} />
        <Route path="/icu/alerts"      element={<ICUAlertsPage />} />
        <Route path="/icu/reports"     element={<ICUReportsPage />} />
        <Route path="/icu/analytics"   element={<ICUAnalyticsPage />} />
        <Route path="/icu/settings"    element={<ICUSettingsPage />} />
        <Route path="/icu/support"     element={<ICUSupportPage />} />

        {/* ── Quality & NABH ──────────────────────────────────────────── */}
        <Route path="/quality/login"          element={<QualityLogin />} />
        <Route path="/quality/dashboard"      element={<QualityDashboard />} />
        <Route path="/quality/nabh-standards" element={<QualityNABHStandardsPage />} />
        <Route path="/quality/assessments"    element={<QualityAssessmentsPage />} />
        <Route path="/quality/audit-reports"  element={<QualityAuditReportsPage />} />
        <Route path="/quality/accreditation"  element={<QualityAccreditationPage />} />
        <Route path="/quality/incidents"      element={<QualityIncidentsPage />} />
        <Route path="/quality/kpis"           element={<QualityKPIsPage />} />
        <Route path="/quality/sops"           element={<QualitySOPsPage />} />
        <Route path="/quality/feedback"       element={<QualityFeedbackPage />} />
        <Route path="/quality/reports"        element={<QualityReportsPage />} />
        <Route path="/quality/settings"       element={<QualitySettingsPage />} />
        <Route path="/quality/support"        element={<QualitySupportPage />} />

        {/* ── Security ────────────────────────────────────────────────── */}
        <Route path="/security/login"         element={<SecurityLogin />} />
        <Route path="/security/dashboard"     element={<SecurityDashboard />} />
        <Route path="/security/cctv"          element={<SecurityCCTVPage />} />
        <Route path="/security/access-points" element={<SecurityAccessPointsPage />} />
        <Route path="/security/access-logs"   element={<SecurityAccessLogsPage />} />
        <Route path="/security/incidents"     element={<SecurityIncidentsPage />} />
        <Route path="/security/alerts"        element={<SecurityAlertsPage />} />
        <Route path="/security/guard-duty"    element={<SecurityGuardDutyPage />} />
        <Route path="/security/visitors"      element={<SecurityVisitorsPage />} />
        <Route path="/security/staff-log"     element={<SecurityStaffLogPage />} />
        <Route path="/security/assets"         element={<SecurityAssetTrackingPage />} />
        <Route path="/security/implementation"  element={<SecurityImplementationPage />} />
        <Route path="/security/reports"       element={<SecurityReportsPage />} />
        <Route path="/security/settings"      element={<SecuritySettingsPage />} />
        <Route path="/security/support"       element={<SecuritySupportPage />} />

        {/* ── Insurance / Broker ──────────────────────────────────────── */}
        <Route path="/insurance-broker/register"       element={<InsuranceBrokerRegister />} />
        <Route path="/intermediary/login"              element={<InsuranceBrokerLogin />} />
        <Route path="/intermediary/communication"      element={<BrokerCommunication />} />
        <Route path="/insurance-broker/dashboard"      element={<BrokerDashboard />} />
        <Route path="/insurance-broker/policies"       element={<BrokerPolicies />} />
        <Route path="/insurance-broker/corporates"     element={<BrokerCorporates />} />
        <Route path="/insurance-broker/profile"        element={<BrokerProfile />} />
        <Route path="/insurance-broker/commissions"    element={<BrokerCommissions />} />
        <Route path="/insurance-broker/reports"        element={<BrokerReports />} />
        <Route path="/insurance-broker/analytics"      element={<BrokerAnalytics />} />
        <Route path="/insurance-broker/notifications"  element={<BrokerNotifications />} />
        <Route path="/insurance-broker/settings"       element={<BrokerSettings />} />
        <Route path="/insurance-broker/support"        element={<BrokerSupport />} />
        <Route path="/insurer/login"                   element={<InsurerLogin />} />
        <Route path="/insurer/communication"           element={<InsuranceCommunication />} />
        <Route path="/insurance-company/communication" element={<InsuranceCommunication />} />

        {/* ── PSU / NGO ───────────────────────────────────────────────── */}
        <Route path="/psu/login" element={<PSULogin />} />
        <Route path="/ngo/login" element={<NGOLogin />} />

        {/* ── Patient features ────────────────────────────────────────── */}
        <Route path="/profile"               element={<MainLayout><ProfileEnhanced /></MainLayout>} />
        <Route path="/wallet"                element={<MainLayout><Wallet /></MainLayout>} />
        <Route path="/health-dashboard"      element={<UnifiedHealthDashboard />} />
        <Route path="/patient/devices"       element={<HealthDashboard />} />
        <Route path="/health-tracker"        element={<MainLayout><HealthTracker /></MainLayout>} />
        <Route path="/health-diary"          element={<MainLayout><HealthDiary /></MainLayout>} />
        <Route path="/health-intelligence"   element={<MainLayout><HealthIntelligence /></MainLayout>} />
        <Route path="/sib-control"           element={<AdminRoute><MainLayout><SIBControlDashboard /></MainLayout></AdminRoute>} />
        <Route path="/consultation"          element={<MainLayout><Consultation /></MainLayout>} />
        <Route path="/doctors"               element={<DoctorListBooking />} />
        <Route path="/symptoms"              element={<MainLayout><Symptoms /></MainLayout>} />
        <Route path="/medicine"              element={<MainLayout><Medicine /></MainLayout>} />
        <Route path="/chat"                  element={<ChatCall />} />
        <Route path="/chatdoctor"            element={<ChatCall />} />
        <Route path="/ai-doctor"             element={<MainLayout><AiDoctor /></MainLayout>} />
        <Route path="/ayushman"              element={<MainLayout><Ayushman /></MainLayout>} />
        <Route path="/health-feed"           element={<MainLayout><HealthFeedPage /></MainLayout>} />
        <Route path="/reposts"               element={<MainLayout><RepostsPage /></MainLayout>} />
        <Route path="/consultation/:doctorId" element={<ConsultationBooking />} />
        <Route path="/nurse-booking/:nurseId" element={<NurseBooking />} />
        <Route path="/lab-booking/:labId"     element={<LabBooking />} />
        <Route path="/homecare-booking/:homecareId" element={<HomecareBooking />} />
        <Route path="/my-bookings"           element={<Navigate to="/appointments" replace />} />
        <Route path="/appointments"          element={<Appointments />} />
        <Route path="/my-appointments"       element={<Navigate to="/appointments" replace />} />
        <Route path="/my-prescriptions"      element={<MyPrescriptions />} />
        <Route path="/my-plans"              element={<MainLayout><MyPlans /></MainLayout>} />
        <Route path="/choose-plan"           element={<ChoosePlan />} />
        <Route path="/membership-card"       element={<MainLayout><MyMembershipCard /></MainLayout>} />
        <Route path="/diet"                  element={<MainLayout><Diet /></MainLayout>} />
        <Route path="/calorie-calculator"    element={<MainLayout><CalorieCalculator /></MainLayout>} />
        <Route path="/emergency"             element={<MainLayout><Emergency /></MainLayout>} />
        <Route path="/video-consultation"    element={<MainLayout><VideoConsultation /></MainLayout>} />
        <Route path="/patient/notifications"      element={<MainLayout><PatientNotifications /></MainLayout>} />
        <Route path="/patient/lab-tests"          element={<MainLayout><LabTests /></MainLayout>} />
        <Route path="/patient/my-reports"         element={<MainLayout><MyReports /></MainLayout>} />
        <Route path="/patient/pharmacy"           element={<MainLayout><Pharmacy /></MainLayout>} />
        <Route path="/patient/vital-reports"      element={<MainLayout><VitalReports /></MainLayout>} />
        <Route path="/patient/documents"          element={<MainLayout><UploadedDocuments /></MainLayout>} />
        <Route path="/patient/network-hospitals"  element={<MainLayout><NetworkHospitals /></MainLayout>} />
        <Route path="/patient/network-clinics"   element={<MainLayout><NetworkClinics /></MainLayout>} />
        <Route path="/patient/buy-insurance"      element={<MainLayout><BuyInsurance /></MainLayout>} />
        <Route path="/patient/claims"             element={<ClaimsExpress />} />
        <Route path="/patient/ai-health-analysis" element={<MainLayout><AIHealthAnalysis /></MainLayout>} />
        <Route path="/patient/wellness-challenges" element={<WellnessRewards />} />
        <Route path="/wellness-challenges"        element={<WellnessRewards />} />
        <Route path="/patient/wellness-calendar"  element={<EmployeeWellnessCalendar />} />
        <Route path="/wellness-calendar"          element={<EmployeeWellnessCalendar />} />
        <Route path="/health-risk-assessment"     element={<UserHealthRiskAssessment />} />

        {/* ── AI-Powered Features ─────────────────────────────────────── */}
        <Route path="/report-scanner"          element={<AIReportScanner />} />
        <Route path="/symptom-checker"         element={<AISymptomTriage />} />
        <Route path="/smart-health"            element={<SmartHealthDashboard />} />
        <Route path="/benefits"               element={<SmartBenefitsHub />} />
        <Route path="/family-hub"             element={<FamilyHealthHub />} />
        <Route path="/wellness-rewards"       element={<WellnessRewards />} />
        <Route path="/claims-express"         element={<ClaimsExpress />} />

        {/* ── Billing ─────────────────────────────────────────────────── */}
        <Route path="/billing/checkout"        element={<MainLayout><OrderCheckout /></MainLayout>} />
        <Route path="/billing/orders"          element={<MainLayout><OrderHistory /></MainLayout>} />
        <Route path="/billing/invoices"        element={<MainLayout><MyInvoices /></MainLayout>} />
        <Route path="/billing/orders/:orderId" element={<MainLayout><OrderDetails /></MainLayout>} />

        {/* ── Misc ────────────────────────────────────────────────────── */}
        <Route path="/diagnostic" element={<ConnectionDiagnostic />} />
        <Route path="*"           element={<NotFound />} />
      </Routes>
    </Suspense>
  );
};

export default AppRoutes;
