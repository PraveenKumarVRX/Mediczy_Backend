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
import TeamGuard from "@/auth/TeamGuard";
import { portalClinicalRoutes } from "@/routes/portalClinicalRoutes";
import HmisLegacyRedirect from "@/routes/HmisLegacyRedirect";

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
const MyPrograms            = lazy(() => import("@/pages/MyPrograms"));
const ProgramDetail         = lazy(() => import("@/pages/ProgramDetail"));
const ProgramJourney        = lazy(() => import("@/pages/ProgramJourney"));

// ─── Patient sub-pages ───────────────────────────────────────────────────────
const PatientNotifications  = lazy(() => import("@/pages/patient/PatientNotifications"));
const FamilyCareUpdates      = lazy(() => import("@/pages/patient/FamilyCareUpdates"));
const LabTests              = lazy(() => import("@/pages/patient/LabTests"));
const MyReports             = lazy(() => import("@/pages/patient/MyReports"));
const Pharmacy              = lazy(() => import("@/pages/patient/Pharmacy"));
const VitalReports          = lazy(() => import("@/pages/patient/VitalReports"));
const DeviceIntegration     = lazy(() => import("@/pages/patient/DeviceIntegration"));
const UploadedDocuments     = lazy(() => import("@/pages/patient/UploadedDocuments"));
const NetworkHospitals      = lazy(() => import("@/pages/patient/NetworkHospitals"));
const NetworkClinics        = lazy(() => import("@/pages/patient/NetworkClinics"));
const TeamClinicList        = lazy(() => import("@/pages/team/TeamClinicList"));
const TeamTicketManager     = lazy(() => import("@/pages/team/TeamTicketManager"));
const BuyInsurance          = lazy(() => import("@/pages/patient/BuyInsurance"));
const AIHealthAnalysis      = lazy(() => import("@/pages/patient/AIHealthAnalysis"));
const EmployeeGamification  = lazy(() => import("@/pages/patient/EmployeeGamification"));
const EmployeeWellnessCalendar = lazy(() => import("@/pages/patient/EmployeeWellnessCalendar"));
const AIReportScanner       = lazy(() => import("@/pages/patient/AIReportScanner"));
const AISymptomTriage       = lazy(() => import("@/pages/patient/AISymptomTriage"));
const SmartHealthDashboard  = lazy(() => import("@/pages/patient/SmartHealthDashboard"));
const WatchAnalytics        = lazy(() => import("@/pages/patient/WatchAnalytics"));
const SmartBenefitsHub      = lazy(() => import("@/pages/patient/SmartBenefitsHub"));
const FamilyHealthHub       = lazy(() => import("@/pages/patient/FamilyHealthHub"));
const WellnessRewards       = lazy(() => import("@/pages/patient/WellnessRewards"));
const SmartOPD              = lazy(() => import("@/pages/patient/SmartOPD"));
const ClaimsExpress         = lazy(() => import("@/pages/patient/ClaimsExpress"));

// ─── Billing ─────────────────────────────────────────────────────────────────
const OrderCheckout  = lazy(() => import("@/pages/billing/OrderCheckout"));
const OrderHistory   = lazy(() => import("@/pages/billing/OrderHistory"));
const OrderDetails   = lazy(() => import("@/pages/billing/OrderDetails"));
const MyInvoices     = lazy(() => import("@/pages/billing/MyInvoices"));
const MyInsurancePolicies = lazy(() => import("@/pages/patient/MyInsurancePolicies"));
const HelpCenter     = lazy(() => import("@/pages/HelpCenter"));
const ContactUs      = lazy(() => import("@/pages/ContactUs"));

// ─── Doctor ──────────────────────────────────────────────────────────────────
const DoctorDashboard          = lazy(() => import("@/pages/doctor/DoctorDashboard"));
const DoctorImaging            = lazy(() => import("@/pages/doctor/DoctorImaging"));
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
const DoctorVoiceScribe        = lazy(() => import("@/pages/doctor/DoctorVoiceScribe"));
const DoctorCalculators        = lazy(() => import("@/pages/doctor/DoctorCalculators"));
const DoctorVoiceAssistant     = lazy(() => import("@/pages/doctor/DoctorVoiceAssistant"));
const DoctorMessaging          = lazy(() => import("@/pages/doctor/DoctorMessaging"));
const DoctorWebinarDashboard   = lazy(() => import("@/pages/doctor/DoctorWebinarDashboard"));
const WebinarListPage          = lazy(() => import("@/pages/webinar/WebinarListPage"));
const WebinarRoomPage          = lazy(() => import("@/pages/webinar/WebinarRoomPage"));

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
const AIGovernanceDashboard    = lazy(() => import("@/pages/admin/AIGovernanceDashboard"));
const FeedbackIntelligenceDashboard = lazy(() => import("@/pages/admin/FeedbackIntelligenceDashboard"));
const SLATrackerPage           = lazy(() => import("@/pages/admin/SLATrackerPage"));
const ComponentDeepDive        = lazy(() => import("@/pages/admin/ComponentDeepDive"));
const PromptVersionManager     = lazy(() => import("@/pages/admin/PromptVersionManager"));
const SIBAIDashboard           = lazy(() => import("@/pages/admin/SIBAIDashboard"));
const HyperGridDashboard       = lazy(() => import("@/pages/admin/HyperGridDashboard"));
const HyperGridAIView          = lazy(() => import("@/pages/admin/HyperGridAIView"));
const HyperGridIoTView         = lazy(() => import("@/pages/admin/HyperGridIoTView"));
const FederatedLearningDashboard = lazy(() => import("@/pages/admin/FederatedLearningDashboard"));
const HyperGridMarketplace       = lazy(() => import("@/pages/admin/HyperGridMarketplace"));
const EnterpriseLoginPage        = lazy(() => import("@/pages/enterprise/EnterpriseLoginPage"));
const EnterpriseCallbackPage     = lazy(() => import("@/pages/enterprise/EnterpriseCallbackPage"));
const AdminCopilot             = lazy(() => import("@/pages/admin/AdminCopilot"));
const AdminSaMD                = lazy(() => import("@/pages/admin/AdminSaMD"));

// ─── CRM ─────────────────────────────────────────────────────────────────────
const CRMLogin     = lazy(() => import("@/pages/crm/CRMLogin"));
const CRMDashboard = lazy(() => import("@/pages/crm/CRMDashboard"));
const CRMEmailPage = lazy(() => import("@/pages/crm/CRMEmailPage"));
const CRMCampaignAnalyticsPage = lazy(() => import("@/pages/crm/CRMCampaignAnalyticsPage"));
const CRMAIInsightsPage        = lazy(() => import("@/pages/crm/CRMAIInsightsPage"));
const _CRMMarketingPages = () => import("@/pages/crm/CRMMarketingPages");
const CRMCampaignsPage = lazyNamed(_CRMMarketingPages, "CRMCampaignsPage");
const CRMCampaignBuilderPage = lazyNamed(_CRMMarketingPages, "CRMCampaignBuilderPage");
const CRMListsPage = lazyNamed(_CRMMarketingPages, "CRMListsPage");
const CRMListDetailPage = lazyNamed(_CRMMarketingPages, "CRMListDetailPage");
const CRMTemplatesPage = lazyNamed(_CRMMarketingPages, "CRMTemplatesPage");
const CRMSendersPage       = lazyNamed(_CRMMarketingPages, "CRMSendersPage");
const CRMSuppressionsPage  = lazyNamed(_CRMMarketingPages, "CRMSuppressionsPage");

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

const _CRMDistributionPages = () => import("@/pages/crm/CRMDistributionPages");
const CRMAgentsPage          = lazyNamed(_CRMDistributionPages, "CRMAgentsPage");
const CRMAgenciesPage        = lazyNamed(_CRMDistributionPages, "CRMAgenciesPage");
const CRMCommissionsPage     = lazyNamed(_CRMDistributionPages, "CRMCommissionsPage");
const CRMCorporatePlansPage  = lazyNamed(_CRMDistributionPages, "CRMCorporatePlansPage");

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
const TeamUserPlanCustomization = lazy(() => import("@/pages/team/TeamUserPlanCustomization"));
const TeamPlanGovernance       = lazy(() => import("@/pages/team/TeamPlanGovernance"));
const TeamBrokerManagement     = lazy(() => import("@/pages/team/TeamBrokerManagement"));
const TeamDoctorManagement     = lazy(() => import("@/pages/team/TeamDoctorManagement"));
const TeamProviderNetwork      = lazy(() => import("@/pages/team/TeamProviderNetwork"));

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
const NurseChat            = lazy(() => import("@/pages/nurse/NurseChat"));
const NurseBookAppointment = lazy(() => import("@/pages/nurse/BookAppointment"));
const NurseVideoConsultation = lazy(() => import("@/pages/nurse/VideoConsultation"));

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
const CEODashboard                     = lazy(() => import("@/pages/hospital/CEODashboard"));
const COODashboard                     = lazy(() => import("@/pages/hospital/COODashboard"));
const MSDashboard                      = lazy(() => import("@/pages/hospital/MSDashboard"));
const CFODashboard                     = lazy(() => import("@/pages/hospital/CFODashboard"));
const AdmissionWristbandPrint          = lazy(() => import("@/pages/hospital/AdmissionWristbandPrint"));
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
const HospitalBillingPage      = lazy(() => import("@/pages/hospital/HospitalBillingPage"));
const HospitalOSHub            = lazy(() => import("@/pages/hospital/HospitalOSHub"));
const HospitalDoctorWorkspace  = lazy(() => import("@/pages/hospital/HospitalDoctorWorkspace"));
const HospitalNurseStation     = lazy(() => import("@/pages/hospital/HospitalNurseStation"));
const HospitalADTTransfer      = lazy(() => import("@/pages/hospital/HospitalADTTransfer"));
const HospitalVitalsRecord     = lazy(() => import("@/pages/hospital/HospitalVitalsRecord"));
const HospitalAIScribe         = lazy(() => import("@/pages/hospital/HospitalAIScribe"));
const HospitalClinicalCDSS     = lazy(() => import("@/pages/hospital/HospitalClinicalCDSS"));
const HospitalVoiceAssistantPage = lazy(() => import("@/pages/hospital/HospitalVoiceAssistantPage"));
const HospitalTeleconsult      = lazy(() => import("@/pages/hospital/HospitalTeleconsult"));
const HospitalICUBoard         = lazy(() => import("@/pages/hospital/HospitalICUBoard"));
const HospitalRadiology        = lazy(() => import("@/pages/hospital/HospitalRadiology"));
const HospitalPharmacyDispense = lazy(() => import("@/pages/hospital/HospitalPharmacyDispense"));
const HospitalSecurity         = lazy(() => import("@/pages/hospital/HospitalSecurity"));
const HospitalAssetTracking    = lazy(() => import("@/pages/hospital/HospitalAssetTracking"));
const HospitalCorporateCRM     = lazy(() => import("@/pages/hospital/HospitalCorporateCRM"));
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
const LabRIS       = lazy(() => import("@/pages/lab/LabRIS"));

const _LabModulePages = () => import("@/pages/lab/LabModulePages");
const LabOrdersPage        = lazyNamed(_LabModulePages, "LabOrdersPage");
const LabPatientsPage      = lazyNamed(_LabModulePages, "LabPatientsPage");
const LabAppointmentsPage  = lazyNamed(_LabModulePages, "LabAppointmentsPage");
const LabQueuePage         = lazyNamed(_LabModulePages, "LabQueuePage");
const LabHomeCollectionOpsPage = lazyNamed(_LabModulePages, "LabHomeCollectionOpsPage");
const LabSamplesPage       = lazyNamed(_LabModulePages, "LabSamplesPage");
const LabProcessingPage    = lazyNamed(_LabModulePages, "LabProcessingPage");
const LabResultsPage       = lazyNamed(_LabModulePages, "LabResultsPage");
const LabReportsPage       = lazyNamed(_LabModulePages, "LabReportsPage");
const LabInventoryPage     = lazyNamed(_LabModulePages, "LabInventoryPage");
const LabBillingPage       = lazyNamed(_LabModulePages, "LabBillingPage");
const LabPaymentsPage      = lazyNamed(_LabModulePages, "LabPaymentsPage");
const LabBillingOpsPage    = lazyNamed(_LabModulePages, "LabBillingOpsPage");
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
const CorporateUserManagement       = lazy(() => import("@/pages/corporate/CorporateUserManagement"));
const CorporateOrgStructure         = lazy(() => import("@/pages/corporate/CorporateOrgStructure"));

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

const _DepartmentLoginPages = () => import("@/pages/dept/DepartmentLoginPages");
const AssetLogin            = lazyNamed(_DepartmentLoginPages, "AssetLogin");
const BiomedicalLogin       = lazy(() => import("@/auth/dept/BiomedicalLogin"));
const BloodBankLogin        = lazyNamed(_DepartmentLoginPages, "BloodBankLogin");
const ConsentLogin          = lazy(() => import("@/auth/dept/ConsentLogin"));
const CSSDLogin             = lazyNamed(_DepartmentLoginPages, "CSSDLogin");
const DietaryLogin          = lazy(() => import("@/auth/dept/DietaryLogin"));
const FinanceLogin          = lazyNamed(_DepartmentLoginPages, "FinanceLogin");
const InfectionControlLogin = lazyNamed(_DepartmentLoginPages, "InfectionControlLogin");
const MortuaryLogin         = lazyNamed(_DepartmentLoginPages, "MortuaryLogin");
const ProcurementLogin      = lazyNamed(_DepartmentLoginPages, "ProcurementLogin");
const SCMLogin              = lazy(() => import("@/auth/dept/SCMLogin"));
const QueueLogin            = lazyNamed(_DepartmentLoginPages, "QueueLogin");
const QueuePortalLogin      = lazy(() => import("@/auth/dept/QueueLogin"));
const _DeptDashboards        = () => import("@/pages/dept/DepartmentDashboards");
const _DeptModulePages       = () => import("@/pages/dept/DepartmentModulePages");
const _QueueExperiencePages  = () => import("@/pages/dept/QueueExperiencePages");
const _DietaryDashboard      = () => import("@/pages/dept/DietaryDashboardPage");
const _DietaryModulePages    = () => import("@/pages/dept/DietaryModulePages");
const _DietaryMonitoring     = () => import("@/pages/dept/DietaryMonitoringPage");
const _BiomedicalDashboard   = () => import("@/pages/dept/BiomedicalDashboardPage");
const _BiomedicalModulePages = () => import("@/pages/dept/BiomedicalModulePages");
const _BiomedicalMonitoring  = () => import("@/pages/dept/BiomedicalMonitoringPage");
const _ConsentDashboard      = () => import("@/pages/dept/ConsentDashboardPage");
const _BloodBankDashboard    = () => import("@/pages/dept/BloodBankDashboardPage");

const AssetDashboard             = lazyNamed(_DeptDashboards, "AssetDashboard");
const BiomedicalDashboard        = lazyNamed(_BiomedicalDashboard, "BiomedicalDashboard");
const BloodBankDashboard         = lazyNamed(_BloodBankDashboard, "BloodBankDashboard");
const ConsentDashboard           = lazyNamed(_ConsentDashboard, "ConsentDashboard");
const CSSDDashboard              = lazyNamed(_DeptDashboards, "CSSDDashboard");
const DietaryDashboard           = lazyNamed(_DietaryDashboard, "DietaryDashboard");
const FinanceDashboard           = lazyNamed(_DeptDashboards, "FinanceDashboard");
const InfectionControlDashboard  = lazyNamed(_DeptDashboards, "InfectionControlDashboard");
const MortuaryDashboard          = lazyNamed(_DeptDashboards, "MortuaryDashboard");
const ProcurementDashboard       = lazyNamed(_DeptDashboards, "ProcurementDashboard");
const ScmDashboard               = lazyNamed(_DeptDashboards, "ScmDashboard");
const QueueDashboard             = lazyNamed(_QueueExperiencePages, "QueueDashboardPage");

// Department module pages — Asset
const AssetInventory    = lazyNamed(_DeptModulePages, "AssetInventory");
const AssetMaintenance  = lazyNamed(_DeptModulePages, "AssetMaintenance");
const AssetReports      = lazyNamed(_DeptModulePages, "AssetReports");
// Biomedical — world-class module pages
const BiomedicalEquipment    = lazyNamed(_BiomedicalModulePages, "BiomedicalEquipment");
const BiomedicalWorkOrders   = lazyNamed(_BiomedicalModulePages, "BiomedicalWorkOrders");
const BiomedicalCalibration  = lazyNamed(_BiomedicalModulePages, "BiomedicalCalibration");
const BiomedicalReports      = lazyNamed(_BiomedicalModulePages, "BiomedicalReports");
const BiomedicalMonitoring   = lazyNamed(_BiomedicalMonitoring,  "BiomedicalMonitoring");
// Blood Bank
const BloodBankInventory    = lazyNamed(_DeptModulePages, "BloodBankInventory");
const BloodBankRequisitions = lazyNamed(_DeptModulePages, "BloodBankRequisitions");
const _BloodBankDonorsPage  = () => import("@/pages/dept/BloodBankDonorsPage");
const BloodBankDonors       = lazyNamed(_BloodBankDonorsPage, "BloodBankDonorsPage");
const BloodBankReports      = lazyNamed(_DeptModulePages, "BloodBankReports");
// Consent
const ConsentPending   = lazyNamed(_DeptModulePages, "ConsentPending");
const ConsentSigned    = lazyNamed(_DeptModulePages, "ConsentSigned");
const ConsentTemplates = lazyNamed(_DeptModulePages, "ConsentTemplates");
const ConsentReports   = lazyNamed(_DeptModulePages, "ConsentReports");
// CSSD
const CSSDJobs      = lazyNamed(_DeptModulePages, "CSSDJobs");
const CSSDEquipment = lazyNamed(_DeptModulePages, "CSSDEquipment");
const CSSDCycles    = lazyNamed(_DeptModulePages, "CSSDCycles");
const CSSDReports   = lazyNamed(_DeptModulePages, "CSSDReports");
// Dietary — world-class module pages
const DietaryOrders     = lazyNamed(_DietaryModulePages, "DietaryOrders");
const DietaryPlans      = lazyNamed(_DietaryModulePages, "DietaryPlans");
const DietaryPatients   = lazyNamed(_DietaryModulePages, "DietaryPatients");
const DietaryReports    = lazyNamed(_DietaryModulePages, "DietaryReports");
const DietaryMonitoring = lazyNamed(_DietaryMonitoring, "DietaryMonitoring");
// Finance
const FinanceBilling     = lazyNamed(_DeptModulePages, "FinanceBilling");
const FinanceCollections = lazyNamed(_DeptModulePages, "FinanceCollections");
const FinanceExpenses    = lazyNamed(_DeptModulePages, "FinanceExpenses");
const FinanceReports     = lazyNamed(_DeptModulePages, "FinanceReports");
// Infection Control
const InfectionControlSurveillance = lazyNamed(_DeptModulePages, "InfectionControlSurveillance");
const InfectionControlIncidents    = lazyNamed(_DeptModulePages, "InfectionControlIncidents");
const InfectionControlReports      = lazyNamed(_DeptModulePages, "InfectionControlReports");
const InfectionControlAlerts       = lazyNamed(_DeptModulePages, "InfectionControlAlerts");
// Mortuary
const MortiaryCases    = lazyNamed(_DeptModulePages, "MortiaryCases");
const MortuaryReleases = lazyNamed(_DeptModulePages, "MortuaryReleases");
const MortuaryRecords  = lazyNamed(_DeptModulePages, "MortuaryRecords");
const MortuaryReports  = lazyNamed(_DeptModulePages, "MortuaryReports");
// Procurement
const ProcurementOrders    = lazyNamed(_DeptModulePages, "ProcurementOrders");
const ProcurementVendors   = lazyNamed(_DeptModulePages, "ProcurementVendors");
const ProcurementApprovals = lazyNamed(_DeptModulePages, "ProcurementApprovals");
const ProcurementReports   = lazyNamed(_DeptModulePages, "ProcurementReports");
const _SCMModulePages      = () => import("@/pages/dept/SCMModulePages");
const ScmItems             = lazyNamed(_SCMModulePages, "ScmItems");
const ScmOrders            = lazyNamed(_SCMModulePages, "ScmOrders");
const ScmWarehouses        = lazyNamed(_SCMModulePages, "ScmWarehouses");
const ScmIndents           = lazyNamed(_SCMModulePages, "ScmIndents");
const ScmApInvoices        = lazyNamed(_SCMModulePages, "ScmApInvoices");
const ScmClinicalSupply    = lazyNamed(_SCMModulePages, "ScmClinicalSupply");
const ScmSupplierOps       = lazyNamed(_SCMModulePages, "ScmSupplierOps");
const ScmOpsControl        = lazyNamed(_SCMModulePages, "ScmOpsControl");
const ScmReports           = lazyNamed(_SCMModulePages, "ScmReports");
const ScmInventory         = lazyNamed(_SCMModulePages, "ScmInventory");
const ScmApprovals         = lazyNamed(_SCMModulePages, "ScmApprovals");
const ScmCharges           = lazyNamed(_SCMModulePages, "ScmCharges");
const ScmImplants          = lazyNamed(_SCMModulePages, "ScmImplants");
// Queue
const QueueTokens   = lazyNamed(_QueueExperiencePages, "QueueTokensPage");
const QueueCounters = lazyNamed(_QueueExperiencePages, "QueueCountersPage");
const QueueHistory  = lazyNamed(_QueueExperiencePages, "QueueHistoryPage");
const QueueReports  = lazyNamed(_QueueExperiencePages, "QueueReportsPage");
const QueueKiosk    = lazyNamed(_QueueExperiencePages, "QueueKioskPage");

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
const HRTimesheetsPage    = lazyNamed(_HRModulePages, "HRTimesheetsPage");
const HROnboardingPage    = lazyNamed(_HRModulePages, "HROnboardingPage");
const HRDocumentsPage     = lazyNamed(_HRModulePages, "HRDocumentsPage");
const HRPayrollPage       = lazyNamed(_HRModulePages, "HRPayrollPage");
const HRPfEsiPage         = lazyNamed(_HRModulePages, "HRPfEsiPage");
const HRBenefitsPage      = lazyNamed(_HRModulePages, "HRBenefitsPage");
const HRRecruitmentPage   = lazyNamed(_HRModulePages, "HRRecruitmentPage");
const HRTrainingPage      = lazyNamed(_HRModulePages, "HRTrainingPage");
const HRPerformancePage   = lazyNamed(_HRModulePages, "HRPerformancePage");
const HRGoalsPage         = lazyNamed(_HRModulePages, "HRGoalsPage");
const HRSurveysPage       = lazyNamed(_HRModulePages, "HRSurveysPage");
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

// ── Ward / ADT / ER / Care Navigator (Phase 1–5 HMIS) ──────────────────────
const WardDashboard         = lazy(() => import("@/pages/ward/WardDashboard"));
const AdmitPatientForm      = lazy(() => import("@/pages/ward/AdmitPatientForm"));
const ERQueuePage           = lazy(() => import("@/pages/er/ERQueue"));
const SmartCareNavigator    = lazy(() => import("@/pages/patient/SmartCareNavigator"));
const PatientTimeline       = lazy(() => import("@/pages/hmis/PatientTimeline"));
const NursingTaskBoard      = lazy(() => import("@/pages/hmis/NursingTaskBoard"));
const AnesthesiaAssessment  = lazy(() => import("@/pages/hmis/AnesthesiaAssessment"));
const DischargeWorkflow     = lazy(() => import("@/pages/hmis/DischargeWorkflow"));
const FollowUpManagement    = lazy(() => import("@/pages/hmis/FollowUpManagement"));
const EChartingPage         = lazy(() => import("@/pages/hmis/EChartingPage"));
const DoctorInpatientNotesPage = lazy(() => import("@/pages/hmis/DoctorInpatientNotesPage"));
const EnhancedDoctorDashboard  = lazy(() => import("@/pages/doctor/EnhancedDoctorDashboard"));
const ClinicalCalculators   = lazy(() => import("@/pages/hmis/ClinicalCalculators"));
const BedsideReference      = lazy(() => import("@/pages/hmis/BedsideReference"));
// Section 16 screens — bed map, OT command center, eMAR, discharge board, inpatient workspace, leadership analytics
const BedMap                = lazy(() => import("@/pages/hmis/BedMap"));
const OTCommandCenter       = lazy(() => import("@/pages/hmis/OTCommandCenter"));
const EMARPage              = lazy(() => import("@/pages/hmis/EMARPage"));
const DischargeBoard        = lazy(() => import("@/pages/hmis/DischargeBoard"));
const InpatientWorkspace    = lazy(() => import("@/pages/hmis/InpatientWorkspace"));
const CommandCenter         = lazy(() => import("@/pages/hmis/CommandCenter"));
const LivingPatientWorkspace = lazy(() => import("@/pages/hmis/LivingPatientWorkspace"));
const CareOSEcosystem       = lazy(() => import("@/pages/hmis/CareOSEcosystem"));
const GlobalClinicalBoard   = lazy(() => import("@/pages/hmis/GlobalClinicalBoard"));
const MedicalPassportPortal = lazy(() => import("@/pages/hmis/MedicalPassportPortal"));
const HospitalCopilot       = lazy(() => import("@/pages/hmis/HospitalCopilot"));
const PredictiveAnalytics   = lazy(() => import("@/pages/hmis/PredictiveAnalytics"));
const ReportCenter          = lazy(() => import("@/pages/hmis/ReportCenter"));
const HL7FHIRMonitor        = lazy(() => import("@/pages/hmis/HL7FHIRMonitor"));
const AIOperationsHub       = lazy(() => import("@/pages/hmis/AIOperationsHub"));
const AIRevenueIntelligence = lazy(() => import("@/pages/hmis/AIRevenueIntelligence"));
const AIDepartmentHub       = lazy(() => import("@/pages/hmis/AIDepartmentHub"));

const CLINICAL_PAGES = {
  PatientTimeline,
  NursingTaskBoard,
  AnesthesiaAssessment,
  DischargeWorkflow,
  FollowUpManagement,
  EChartingPage,
  DoctorInpatientNotesPage,
  ClinicalCalculators,
  BedsideReference,
  BedMap,
  OTCommandCenter,
  EMARPage,
  DischargeBoard,
  CareOSEcosystem,
  GlobalClinicalBoard,
  MedicalPassportPortal,
  LivingPatientWorkspace,
  InpatientWorkspace,
  CommandCenter,
  HospitalCopilot,
  PredictiveAnalytics,
  ReportCenter,
  HL7FHIRMonitor,
  AIOperationsHub,
  AIRevenueIntelligence,
  AIDepartmentHub,
};

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
const QualityJCIStandardsPage  = lazyNamed(_QualityModulePages, "QualityJCIStandardsPage");
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

// ─── Hospital Display & Kiosk System ─────────────────────────────────────────
const OPDQueueDisplay        = lazy(() => import("@/pages/display/OPDQueueDisplay"));
const SelfCheckinKiosk       = lazy(() => import("@/pages/display/SelfCheckinKiosk"));
const QueueConsole           = lazy(() => import("@/pages/display/QueueConsole"));
const LobbySignageDisplay    = lazy(() => import("@/pages/display/LobbySignageDisplay"));
const ICUBoardDisplay        = lazy(() => import("@/pages/display/ICUBoardDisplay"));
const BedsideDisplay         = lazy(() => import("@/pages/display/BedsideDisplay"));
const BloodBankDisplay       = lazy(() => import("@/pages/display/BloodBankDisplay"));
const OTStatusDisplay        = lazy(() => import("@/pages/display/OTStatusDisplay"));
const WardNursingDisplay     = lazy(() => import("@/pages/display/WardNursingDisplay"));
const DischargeStatusDisplay = lazy(() => import("@/pages/display/DischargeStatusDisplay"));
const CommandCentreDisplay   = lazy(() => import("@/pages/display/CommandCentreDisplay"));
const HospitalFloorMapDisplay = lazy(() => import("@/pages/display/HospitalFloorMapDisplay"));
const FamilyVideoKiosk       = lazy(() => import("@/pages/display/FamilyVideoKiosk"));
const ERTriageKiosk          = lazy(() => import("@/pages/display/ERTriageKiosk"));
const ERTriageDisplay        = lazy(() => import("@/pages/display/ERTriageDisplay"));
const WayfindingKiosk        = lazy(() => import("@/pages/display/WayfindingKiosk"));
const OTProctorDisplay       = lazy(() => import("@/pages/display/OTProctorDisplay"));
const DisplayAdminPage       = lazy(() => import("@/pages/display/DisplayAdminPage"));

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
    const token = localStorage.getItem("adminToken");
    if (!token) {
      setIsAdmin(false);
      return;
    }

    try {
      const adminDataRaw = localStorage.getItem("adminData");
      const adminData = adminDataRaw ? JSON.parse(adminDataRaw) : null;
      const role = String(adminData?.role || "").toLowerCase();

      // Keep guard permissive for legacy tokens when role payload isn't persisted,
      // but block if persisted role explicitly indicates non-admin.
      if (adminData && !(adminData.isAdmin === true || role === "admin" || role === "super admin" || role === "super_admin")) {
        setIsAdmin(false);
        return;
      }

      setIsAdmin(true);
    } catch {
      setIsAdmin(true);
    }
  }, []);

  if (isAdmin === null)
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  if (!isAdmin) return <Navigate to="/admin/login" replace />;
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
        <Route path="/user/forgot-password" element={<ForgotPassword initialUserType="user" lockUserType />} />
        <Route path="/doctor/forgot-password" element={<ForgotPassword initialUserType="doctor" lockUserType />} />
        <Route path="/team/forgot-password" element={<ForgotPassword initialUserType="team" lockUserType />} />
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
        <Route path="/doctor/clinical-workspace"  element={<MainLayout><EnhancedDoctorDashboard /></MainLayout>} />
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
        <Route path="/doctor/voice-scribe"        element={<DoctorVoiceScribe />} />
        <Route path="/doctor/calculators"         element={<DoctorCalculators />} />
        <Route path="/doctor/assistant"           element={<DoctorVoiceAssistant />} />
        <Route path="/doctor/messages"            element={<DoctorMessaging />} />
        <Route path="/doctor/imaging"             element={<DoctorImaging />} />
        <Route path="/doctor/webinars"            element={<DoctorWebinarDashboard />} />
        <Route path="/doctor/webinar/:webinarId/host" element={<WebinarRoomPage isHost={true} />} />
        {/* HealthOS — explicit routes (also mounted via portalClinicalRoutes below) */}
        <Route path="/doctor/healthos" element={<CareOSEcosystem />} />
        <Route path="/doctor/careos" element={<CareOSEcosystem />} />
        <Route path="/doctor/copilot" element={<HospitalCopilot />} />
        <Route path="/doctor/patient/:patientId/healthos" element={<LivingPatientWorkspace />} />
        <Route path="/doctor/patient/:patientId/careos" element={<LivingPatientWorkspace />} />
        {portalClinicalRoutes("doctor", CLINICAL_PAGES)}

        {/* ── Webinars ───────────────────────────────────────────────── */}
        <Route path="/webinars"                   element={<WebinarListPage />} />
        <Route path="/webinar/:webinarId"         element={<WebinarRoomPage />} />

        {/* ── Hospital ────────────────────────────────────────────────── */}
        <Route path="/hospital/register"                   element={<HospitalRegister />} />
        <Route path="/hospital/login"                      element={<HospitalLogin />} />
        <Route path="/enterprise/login"                    element={<EnterpriseLoginPage />} />
        <Route path="/enterprise/callback"                element={<EnterpriseCallbackPage />} />
        <Route path="/hospital/os"                         element={<HospitalOSHub />} />
        <Route path="/hospital/dashboard"                  element={<HospitalDashboard />} />
        <Route path="/hospital/ceo"                        element={<CEODashboard />} />
        <Route path="/hospital/coo"                        element={<COODashboard />} />
        <Route path="/hospital/ms"                         element={<MSDashboard />} />
        <Route path="/hospital/cfo"                        element={<CFODashboard />} />
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
        <Route path="/hospital/beds"                       element={<Navigate to="/hospital/beds/map" replace />} />
        <Route path="/hospital/patients"                   element={<HospitalPatientsPage />} />
        <Route path="/hospital/doctors"                    element={<HospitalDoctorsManagement />} />
        <Route path="/hospital/opd-ipd"                    element={<Navigate to="/hospital/command-center" replace />} />
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
        <Route path="/hospital/healthos" element={<CareOSEcosystem />} />
        <Route path="/hospital/careos" element={<CareOSEcosystem />} />
        <Route path="/hospital/copilot" element={<HospitalCopilot />} />
        <Route path="/hospital/command-center" element={<CommandCenter />} />
        <Route path="/hospital/patient/:patientId/healthos" element={<LivingPatientWorkspace />} />
        {portalClinicalRoutes("hospital", CLINICAL_PAGES)}

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
        <Route path="/lab"                 element={<Navigate to="/lab/dashboard" replace />} />
        <Route path="/lab/login"           element={<LabLogin />} />
        <Route path="/lab/register"        element={<LabRegister />} />
        <Route path="/lab/dashboard"       element={<LabDashboard />} />
        <Route path="/lab/test-catalog"    element={<LabDashboard />} />
        <Route path="/lab/ris"             element={<LabRIS />} />
        <Route path="/lab/imaging"         element={<LabRIS />} />
        <Route path="/lab/sonology"        element={<LabRIS />} />
        <Route path="/lab/orders"          element={<LabOrdersPage />} />
        <Route path="/lab/orders/new"      element={<LabOrdersPage />} />
        <Route path="/lab/patients"        element={<LabPatientsPage />} />
        <Route path="/lab/patients/new"    element={<LabPatientsPage />} />
        <Route path="/lab/appointments"    element={<LabAppointmentsPage />} />
        <Route path="/lab/appointments/new" element={<LabAppointmentsPage />} />
        <Route path="/lab/queue"           element={<LabQueuePage />} />
        <Route path="/lab/queue/new"       element={<LabQueuePage />} />
        <Route path="/lab/home-collection" element={<LabHomeCollectionOpsPage />} />
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
        <Route path="/lab/billing-ops"     element={<LabBillingOpsPage />} />
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
        <Route path="/nurse/register-patient"   element={<MainLayout><NurseRegisterPatient /></MainLayout>} />
        <Route path="/nurse/chat"               element={<NurseChat />} />
        <Route path="/nurse/book-appointment"   element={<MainLayout><NurseBookAppointment /></MainLayout>} />
        <Route path="/nurse/video-consultation" element={<NurseVideoConsultation />} />
        {portalClinicalRoutes("nurse", CLINICAL_PAGES)}

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
        {portalClinicalRoutes("assistant", CLINICAL_PAGES)}

        {/* ── CRM ─────────────────────────────────────────────────────── */}
        <Route path="/crm/login"         element={<CRMLogin />} />
        {/* Alias redirects — common alternative URLs for CRM login */}
        <Route path="/rfq/login"         element={<Navigate to="/crm/login" replace />} />
        <Route path="/rfq"               element={<Navigate to="/crm/login" replace />} />
        <Route path="/crm"               element={<Navigate to="/crm/login" replace />} />
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
        <Route path="/crm/agents"              element={<CRMAgentsPage />} />
        <Route path="/crm/agencies"            element={<CRMAgenciesPage />} />
        <Route path="/crm/commissions"         element={<CRMCommissionsPage />} />
        <Route path="/crm/corporate-plans"     element={<CRMCorporatePlansPage />} />
        <Route path="/crm/emails"              element={<CRMEmailPage />} />
        <Route path="/crm/campaigns"           element={<CRMCampaignsPage />} />
        <Route path="/crm/campaigns/new"       element={<CRMCampaignBuilderPage />} />
        <Route path="/crm/campaigns/:id"       element={<CRMCampaignBuilderPage />} />
        <Route path="/crm/campaigns/:id/analytics" element={<CRMCampaignAnalyticsPage />} />
        <Route path="/crm/ai-insights"         element={<CRMAIInsightsPage />} />
        <Route path="/crm/lists"               element={<CRMListsPage />} />
        <Route path="/crm/lists/:id"           element={<CRMListDetailPage />} />
        <Route path="/crm/templates"           element={<CRMTemplatesPage />} />
        <Route path="/crm/senders"             element={<CRMSendersPage />} />
        <Route path="/crm/suppressions"        element={<CRMSuppressionsPage />} />

        {/* ── Team (public) ───────────────────────────────────────────── */}
        <Route path="/team/login"                    element={<TeamLogin />} />

        {/* ── Team (any authenticated team member) ────────────────────── */}
        <Route path="/team/dashboard"
          element={<TeamGuard><TeamDashboard /></TeamGuard>} />
        <Route path="/team/email-inbox"
          element={<TeamGuard><TeamDashboard initialTab="emails" /></TeamGuard>} />
        <Route path="/team/profile"
          element={<TeamGuard><TeamProfile /></TeamGuard>} />
        <Route path="/team/provider-network"
          element={<TeamGuard permission="Corporate Management"><TeamProviderNetwork /></TeamGuard>} />

        {/* ── Team (permission-gated modules) ─────────────────────────── */}
        <Route path="/team/directory"
          element={<TeamGuard permission="User Management"><TeamDirectory /></TeamGuard>} />
        <Route path="/team/user-management"
          element={<TeamGuard permission="User Management"><TeamEmployeeManagement /></TeamGuard>} />
        <Route path="/team/doctor-management"
          element={<TeamGuard permission="Doctor Management"><TeamDoctorManagement /></TeamGuard>} />
        <Route path="/team/corporate-management"
          element={<TeamGuard permission="Corporate Management"><TeamCorporateManagement /></TeamGuard>} />
        <Route path="/team/corporate-health-booking"
          element={<TeamGuard permission="Corporate Management"><CorporateHealthBooking /></TeamGuard>} />
        <Route path="/team/hospital-management"
          element={<TeamGuard permission="Hospital Management"><TeamHospitalManagementPage /></TeamGuard>} />
        <Route path="/team/clinic-management"
          element={<TeamGuard permission="Clinic Management"><MainLayout><TeamClinicList /></MainLayout></TeamGuard>} />
        <Route path="/team/lab-management"
          element={<TeamGuard permission="Lab Management"><TeamLabManagementPage /></TeamGuard>} />
        <Route path="/team/pharmacy-management"
          element={<TeamGuard permission="Pharmacy Management"><TeamPharmacyManagementPage /></TeamGuard>} />
        <Route path="/team/pharmacy-edit"
          element={<TeamGuard permission="Pharmacy Management"><TeamPharmacyEdit /></TeamGuard>} />
        <Route path="/team/appointments"
          element={<TeamGuard permission="Appointment Management"><TeamAppointmentsPage /></TeamGuard>} />
        <Route path="/team/chat"
          element={<TeamGuard permission="Chat Dashboard Access"><TeamChatDashboardPage /></TeamGuard>} />
        <Route path="/team/whatsapp"
          element={<TeamGuard permission="Chat Dashboard Access"><WhatsAppCommunication /></TeamGuard>} />
        <Route path="/team/whatsapp-templates"
          element={<TeamGuard permission="Chat Dashboard Access"><WhatsAppTemplates /></TeamGuard>} />
        <Route path="/team/whatsapp-inbox"
          element={<TeamGuard permission="Chat Dashboard Access"><WhatsAppInbox /></TeamGuard>} />
        <Route path="/team/rc-omnichannel"
          element={<TeamGuard permission="Chat Dashboard Access"><RocketChatOmnichannel /></TeamGuard>} />
        <Route path="/team/chat-analytics"
          element={<TeamGuard permission="Chat Dashboard Access"><TeamChatAnalyticsPage /></TeamGuard>} />
        <Route path="/team/support-tickets"
          element={<TeamGuard permission="Support Tickets"><MainLayout><TeamTicketManager /></MainLayout></TeamGuard>} />
        <Route path="/team/health-plans"
          element={<TeamGuard permission="Health Plans Access"><TeamHealthPlans /></TeamGuard>} />
        <Route path="/team/user-plan-customization"
          element={<TeamGuard permission="Corporate Management"><TeamUserPlanCustomization /></TeamGuard>} />
        <Route path="/team/plan-governance"
          element={<TeamGuard permission={["Audit Access", "Audit Logs"]}><TeamPlanGovernance /></TeamGuard>} />
        <Route path="/team/broker-management"
          element={<TeamGuard permission="Broker Management"><TeamBrokerManagement /></TeamGuard>} />
        <Route path="/team/reports"
          element={<TeamGuard permission={["Patient Reports", "Analytics Access", "Reports Access"]}><TeamReports /></TeamGuard>} />

        {/* ── Team (admin-only) ────────────────────────────────────────── */}
        <Route path="/team/activity"
          element={<TeamGuard permission={["Audit Access", "Audit Logs"]}><TeamActivityLogsPage /></TeamGuard>} />
        <Route path="/team/tools"
          element={<TeamGuard adminOnly><TeamTools /></TeamGuard>} />
        <Route path="/team/settings"
          element={<TeamGuard adminOnly><TeamSettings /></TeamGuard>} />

        {/* ── Admin ───────────────────────────────────────────────────── */}
        <Route path="/admin/login"               element={<AdminLogin />} />
        <Route path="/admin/test"                element={<AdminRoute><SimpleAdminDashboard /></AdminRoute>} />
        <Route path="/admin/system-test"         element={<AdminRoute><AdminTestPage /></AdminRoute>} />
        <Route path="/admin/comprehensive"       element={<AdminRoute><ComprehensiveAdminDashboard /></AdminRoute>} />
        <Route path="/admin/register-patient"    element={<AdminRoute><AdminRegisterPatient /></AdminRoute>} />
        <Route path="/admin/manage-assistants"   element={<AdminRoute><AdminManageAssistants /></AdminRoute>} />
        <Route path="/admin/doctors"             element={<AdminRoute><DoctorsManagement /></AdminRoute>} />
        <Route path="/admin/users"               element={<AdminRoute><UsersManagement /></AdminRoute>} />
        <Route path="/admin/team"                element={<AdminRoute><TeamManagement /></AdminRoute>} />
        <Route path="/admin/team-privileges"     element={<AdminRoute><TeamPrivileges /></AdminRoute>} />
        <Route path="/admin/chat"                element={<AdminRoute><AdminChatDashboard /></AdminRoute>} />
        <Route path="/admin/appointments"        element={<AdminRoute><AdminAppointments /></AdminRoute>} />
        <Route path="/admin/plans"               element={<AdminRoute><AdminPlans /></AdminRoute>} />
        <Route path="/admin/insurance"           element={<AdminRoute><AdminInsurance /></AdminRoute>} />
        <Route path="/admin/workflow-automation" element={<AdminRoute><AdminWorkflowAutomation /></AdminRoute>} />
        <Route path="/admin/tenants"             element={<AdminRoute><AdminTenantManagement /></AdminRoute>} />
        <Route path="/admin/insurer"             element={<AdminRoute><InsurerManagement /></AdminRoute>} />
        <Route path="/admin/tpa"                 element={<AdminRoute><TPAManagement /></AdminRoute>} />
        <Route path="/admin/brokers"             element={<AdminRoute><BrokerManagement /></AdminRoute>} />
        <Route path="/admin/api-credentials"     element={<AdminRoute><ApiCredentialsManagement /></AdminRoute>} />
        <Route path="/admin/hospitals"           element={<AdminRoute><HospitalsManagement /></AdminRoute>} />
        <Route path="/admin/pending-registrations" element={<AdminRoute><PendingRegistrations /></AdminRoute>} />
        <Route path="/admin/clinics"             element={<AdminRoute><ClinicsManagement /></AdminRoute>} />
        <Route path="/admin/corporates"          element={<AdminRoute><CorporatesManagement /></AdminRoute>} />
        <Route path="/admin/corporate-health-packages" element={<AdminRoute><CorporateHealthPackages /></AdminRoute>} />
        <Route path="/admin/corporate-employees" element={<AdminRoute><CorporateEmployeesManagement /></AdminRoute>} />
        <Route path="/admin/corporate-plans"     element={<AdminRoute><CorporatePlansManagement /></AdminRoute>} />
        <Route path="/admin/pharmacies"          element={<AdminRoute><PharmaciesManagement /></AdminRoute>} />
        <Route path="/admin/homecare"            element={<AdminRoute><HomecareManagement /></AdminRoute>} />
        <Route path="/admin/ambulance"           element={<AdminRoute><AmbulanceManagement /></AdminRoute>} />
        <Route path="/admin/medivac"             element={<AdminRoute><MedivacManagement /></AdminRoute>} />
        <Route path="/admin/ngo"                 element={<AdminRoute><NGOManagement /></AdminRoute>} />
        <Route path="/admin/psu"                 element={<AdminRoute><PSUManagement /></AdminRoute>} />
        <Route path="/admin/ohc"                 element={<AdminRoute><OHCManagement /></AdminRoute>} />
        <Route path="/admin/labs"                element={<AdminRoute><LabsManagement /></AdminRoute>} />
        <Route path="/admin/billing"             element={<AdminRoute><BillingManagement /></AdminRoute>} />
        <Route path="/admin/accounting"          element={<AdminRoute><AccountingManagement /></AdminRoute>} />
        <Route path="/admin/payments"            element={<AdminRoute><PaymentManagement /></AdminRoute>} />
        <Route path="/admin/coupons"             element={<AdminRoute><CouponManagement /></AdminRoute>} />
        <Route path="/admin/email"               element={<AdminRoute><EmailManagement /></AdminRoute>} />
        <Route path="/admin/activity-log"        element={<AdminRoute><ActivityLog /></AdminRoute>} />
        <Route path="/admin/module-access"       element={<AdminRoute><ModuleAccessControl /></AdminRoute>} />
        <Route path="/admin/auth-test"           element={<AdminRoute><AdminAuthTest /></AdminRoute>} />
        <Route path="/admin/sms"                 element={<AdminRoute><SMSManagement /></AdminRoute>} />
        <Route path="/admin/whatsapp"            element={<AdminRoute><WhatsAppManagement /></AdminRoute>} />
        <Route path="/admin/video"               element={<AdminRoute><VideoManagement /></AdminRoute>} />
        <Route path="/admin/voice"               element={<AdminRoute><VoiceCallManagement /></AdminRoute>} />
        <Route path="/admin/tickets"             element={<AdminRoute><TicketManagement /></AdminRoute>} />
        <Route path="/admin/tickets/:id"         element={<AdminRoute><TicketManagement /></AdminRoute>} />
        <Route path="/admin/health-risk"         element={<AdminRoute><AdminHealthRiskAssessment /></AdminRoute>} />
        <Route path="/admin/reports"             element={<AdminRoute><ReportsPage /></AdminRoute>} />
        <Route path="/admin/crm"                 element={<AdminRoute><CRMPage /></AdminRoute>} />
        <Route path="/admin/crm/lead/:id"        element={<AdminRoute><CRMLeadDetail /></AdminRoute>} />
        <Route path="/admin/ai-analytics"        element={<AdminRoute><AIAnalyticsDashboard /></AdminRoute>} />
        <Route path="/admin/ai-governance"        element={<AdminRoute><AIGovernanceDashboard /></AdminRoute>} />
        <Route path="/admin/feedback-intelligence"              element={<AdminRoute><FeedbackIntelligenceDashboard /></AdminRoute>} />
        <Route path="/admin/feedback-intelligence/sla"          element={<AdminRoute><SLATrackerPage /></AdminRoute>} />
        <Route path="/admin/feedback-intelligence/component/:name" element={<AdminRoute><ComponentDeepDive /></AdminRoute>} />
        <Route path="/admin/feedback-intelligence/prompts"      element={<AdminRoute><PromptVersionManager /></AdminRoute>} />
        <Route path="/admin/copilot"              element={<AdminRoute><AdminCopilot /></AdminRoute>} />
        <Route path="/admin/samd-compliance"      element={<AdminRoute><AdminSaMD /></AdminRoute>} />
        <Route path="/admin/ai-guard"             element={<AdminRoute><SIBAIDashboard /></AdminRoute>} />
        <Route path="/admin/hypergrid"            element={<AdminRoute><HyperGridDashboard /></AdminRoute>} />
        <Route path="/admin/hypergrid/marketplace" element={<AdminRoute><HyperGridMarketplace /></AdminRoute>} />
        <Route path="/admin/hypergrid-ai"         element={<AdminRoute><HyperGridAIView /></AdminRoute>} />
        <Route path="/admin/hypergrid-iot"        element={<AdminRoute><HyperGridIoTView /></AdminRoute>} />
        <Route path="/admin/ai/federated"        element={<AdminRoute><FederatedLearningDashboard /></AdminRoute>} />
        <Route path="/admin/settings"            element={<AdminRoute><SettingsPage /></AdminRoute>} />
        <Route path="/admin/dashboard"           element={<AdminRoute><AdminDashboardHome /></AdminRoute>} />
        <Route path="/admin"                     element={<AdminRoute><AdminDashboardHome /></AdminRoute>} />

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
        <Route path="/corporate/user-management"            element={<CorporateUserManagement />} />
        <Route path="/corporate/org-structure"               element={<CorporateOrgStructure />} />

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

        {/* ── Additional Hospital Department Logins ──────────────────── */}
        <Route path="/asset/login"             element={<AssetLogin />} />
        <Route path="/biomedical/login"        element={<BiomedicalLogin />} />
        <Route path="/blood-bank/login"        element={<BloodBankLogin />} />
        <Route path="/consent/login"           element={<ConsentLogin />} />
        <Route path="/cssd/login"              element={<CSSDLogin />} />
        <Route path="/dietary/login"           element={<DietaryLogin />} />
        <Route path="/finance/login"           element={<FinanceLogin />} />
        <Route path="/infection-control/login" element={<InfectionControlLogin />} />
        <Route path="/mortuary/login"          element={<MortuaryLogin />} />
        <Route path="/procurement/login"       element={<ProcurementLogin />} />
        <Route path="/scm/login"               element={<SCMLogin />} />
        <Route path="/queue/login"             element={<QueuePortalLogin />} />
        <Route path="/asset/dashboard"             element={<AssetDashboard />} />
        <Route path="/biomedical/dashboard"        element={<BiomedicalDashboard />} />
        <Route path="/blood-bank/dashboard"        element={<BloodBankDashboard />} />
        <Route path="/consent/dashboard"           element={<ConsentDashboard />} />
        <Route path="/cssd/dashboard"              element={<CSSDDashboard />} />
        <Route path="/dietary/dashboard"           element={<DietaryDashboard />} />
        <Route path="/finance/dashboard"           element={<FinanceDashboard />} />
        <Route path="/infection-control/dashboard" element={<InfectionControlDashboard />} />
        <Route path="/mortuary/dashboard"          element={<MortuaryDashboard />} />
        <Route path="/procurement/dashboard"       element={<ProcurementDashboard />} />
        <Route path="/scm/dashboard"               element={<ScmDashboard />} />
        <Route path="/queue/dashboard"             element={<QueueDashboard />} />

        {/* ── Department sub-module pages ─────────────────────────────── */}
        {/* Asset */}
        <Route path="/asset/inventory"   element={<AssetInventory />} />
        <Route path="/asset/maintenance" element={<AssetMaintenance />} />
        <Route path="/asset/reports"     element={<AssetReports />} />
        {/* Biomedical */}
        <Route path="/biomedical/monitoring"  element={<BiomedicalMonitoring />} />
        <Route path="/biomedical/equipment"   element={<BiomedicalEquipment />} />
        <Route path="/biomedical/work-orders" element={<BiomedicalWorkOrders />} />
        <Route path="/biomedical/calibration" element={<BiomedicalCalibration />} />
        <Route path="/biomedical/reports"     element={<BiomedicalReports />} />
        {/* Blood Bank */}
        <Route path="/blood-bank/inventory"    element={<BloodBankInventory />} />
        <Route path="/blood-bank/requisitions" element={<BloodBankRequisitions />} />
        <Route path="/blood-bank/donors"       element={<BloodBankDonors />} />
        <Route path="/blood-bank/reports"      element={<BloodBankReports />} />
        {/* Consent */}
        <Route path="/consent/pending"   element={<ConsentPending />} />
        <Route path="/consent/signed"    element={<ConsentSigned />} />
        <Route path="/consent/templates" element={<ConsentTemplates />} />
        <Route path="/consent/reports"   element={<ConsentReports />} />
        {/* CSSD */}
        <Route path="/cssd/jobs"      element={<CSSDJobs />} />
        <Route path="/cssd/equipment" element={<CSSDEquipment />} />
        <Route path="/cssd/cycles"    element={<CSSDCycles />} />
        <Route path="/cssd/reports"   element={<CSSDReports />} />
        {/* Dietary */}
        <Route path="/dietary/orders"      element={<DietaryOrders />} />
        <Route path="/dietary/plans"       element={<DietaryPlans />} />
        <Route path="/dietary/patients"    element={<DietaryPatients />} />
        <Route path="/dietary/reports"     element={<DietaryReports />} />
        <Route path="/dietary/monitoring"  element={<DietaryMonitoring />} />
        {/* Finance */}
        <Route path="/finance/billing"     element={<FinanceBilling />} />
        <Route path="/finance/collections" element={<FinanceCollections />} />
        <Route path="/finance/expenses"    element={<FinanceExpenses />} />
        <Route path="/finance/reports"     element={<FinanceReports />} />
        {/* Infection Control */}
        <Route path="/infection-control/surveillance" element={<InfectionControlSurveillance />} />
        <Route path="/infection-control/incidents"    element={<InfectionControlIncidents />} />
        <Route path="/infection-control/reports"      element={<InfectionControlReports />} />
        <Route path="/infection-control/alerts"       element={<InfectionControlAlerts />} />
        {/* Mortuary */}
        <Route path="/mortuary/cases"    element={<MortiaryCases />} />
        <Route path="/mortuary/releases" element={<MortuaryReleases />} />
        <Route path="/mortuary/records"  element={<MortuaryRecords />} />
        <Route path="/mortuary/reports"  element={<MortuaryReports />} />
        {/* Procurement */}
        <Route path="/procurement/orders"    element={<ProcurementOrders />} />
        <Route path="/procurement/vendors"   element={<ProcurementVendors />} />
        <Route path="/procurement/approvals" element={<ProcurementApprovals />} />
        <Route path="/procurement/reports"   element={<ProcurementReports />} />
        {/* SCM */}
        <Route path="/scm/items"         element={<ScmItems />} />
        <Route path="/scm/inventory"    element={<ScmInventory />} />
        <Route path="/scm/orders"        element={<ScmOrders />} />
        <Route path="/scm/warehouses"    element={<ScmWarehouses />} />
        <Route path="/scm/indents"       element={<ScmIndents />} />
        <Route path="/scm/ap-invoices"   element={<ScmApInvoices />} />
        <Route path="/scm/clinical"      element={<ScmClinicalSupply />} />
        <Route path="/scm/suppliers"    element={<ScmSupplierOps />} />
        <Route path="/scm/ops"           element={<ScmOpsControl />} />
        <Route path="/scm/approvals"     element={<ScmApprovals />} />
        <Route path="/scm/charges"       element={<ScmCharges />} />
        <Route path="/scm/implants"      element={<ScmImplants />} />
        <Route path="/scm/reports"       element={<ScmReports />} />
        {/* Queue */}
        <Route path="/queue/tokens"   element={<QueueTokens />} />
        <Route path="/queue/counters" element={<QueueCounters />} />
        <Route path="/queue/history"  element={<QueueHistory />} />
        <Route path="/queue/reports"  element={<QueueReports />} />
        <Route path="/queue/kiosk"    element={<QueueKiosk />} />

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
        <Route path="/hr/timesheets"   element={<HRTimesheetsPage />} />
        <Route path="/hr/onboarding"   element={<HROnboardingPage />} />
        <Route path="/hr/documents"    element={<HRDocumentsPage />} />
        <Route path="/hr/payroll"      element={<HRPayrollPage />} />
        <Route path="/hr/pf-esi"       element={<HRPfEsiPage />} />
        <Route path="/hr/benefits"     element={<HRBenefitsPage />} />
        <Route path="/hr/recruitment"  element={<HRRecruitmentPage />} />
        <Route path="/hr/training"     element={<HRTrainingPage />} />
        <Route path="/hr/performance"  element={<HRPerformancePage />} />
        <Route path="/hr/goals"        element={<HRGoalsPage />} />
        <Route path="/hr/surveys"      element={<HRSurveysPage />} />
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

        {/* ── Ward / ADT / ER / HMIS (Phase 1-5 Patient Journey) ─────── */}
        <Route path="/hospital/ward"                                    element={<WardDashboard />} />
        <Route path="/hospital/adt/admit"                               element={<AdmitPatientForm />} />
        <Route path="/hospital/adt/wristband"                           element={<AdmissionWristbandPrint />} />
        <Route path="/hospital/adt/transfer"                            element={<HospitalADTTransfer />} />
        <Route path="/hospital/adt/er-to-ip"                           element={<AdmitPatientForm />} />
        <Route path="/hospital/vitals/record"                           element={<HospitalVitalsRecord />} />
        <Route path="/hospital/doctor-workspace"                        element={<HospitalDoctorWorkspace />} />
        <Route path="/hospital/nurse-station"                           element={<HospitalNurseStation />} />
        <Route path="/hospital/ai-scribe"                             element={<HospitalAIScribe />} />
        <Route path="/hospital/clinical-cdss"                           element={<HospitalClinicalCDSS />} />
        <Route path="/hospital/voice-assistant"                         element={<HospitalVoiceAssistantPage />} />
        <Route path="/hospital/teleconsult"                             element={<HospitalTeleconsult />} />
        <Route path="/hospital/icu-board"                               element={<HospitalICUBoard />} />
        <Route path="/hospital/radiology"                               element={<HospitalRadiology />} />
        <Route path="/hospital/pharmacy-dispense"                       element={<HospitalPharmacyDispense />} />
        <Route path="/hospital/security"                                element={<HospitalSecurity />} />
        <Route path="/hospital/asset-tracking"                         element={<HospitalAssetTracking />} />
        <Route path="/hospital/assets"                                  element={<Navigate to="/hospital/asset-tracking" replace />} />
        <Route path="/hospital/corporate-crm"                           element={<HospitalCorporateCRM />} />
        <Route path="/hospital/er/queue"                                element={<ERQueuePage />} />
        <Route path="/patient/care-journey"                             element={<SmartCareNavigator />} />
        {/* Legacy /hmis/* → /hospital/*, /doctor/*, /nurse/*, or /assistant/* */}
        <Route path="/hmis/*" element={<HmisLegacyRedirect />} />

        {/* ── Quality & Accreditation (NABH + JCI) ────────────────────── */}
        <Route path="/quality/login"          element={<QualityLogin />} />
        <Route path="/quality/dashboard"      element={<QualityDashboard />} />
        <Route path="/quality/nabh-standards" element={<QualityNABHStandardsPage />} />
        <Route path="/quality/jci-standards"  element={<QualityJCIStandardsPage />} />
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
        <Route path="/reposts"               element={<Navigate to="/report-scanner" replace />} />
        <Route path="/consultation/:doctorId" element={<ConsultationBooking />} />
        <Route path="/nurse-booking/:nurseId" element={<NurseBooking />} />
        <Route path="/lab-booking/:labId"     element={<LabBooking />} />
        <Route path="/homecare-booking/:homecareId" element={<HomecareBooking />} />
        <Route path="/my-bookings"           element={<Navigate to="/appointments" replace />} />
        <Route path="/appointments"          element={<Appointments />} />
        <Route path="/my-appointments"       element={<Navigate to="/appointments" replace />} />
        <Route path="/my-prescriptions"      element={<MyPrescriptions />} />
        <Route path="/my-plans"              element={<MainLayout><MyPlans /></MainLayout>} />
        <Route path="/my-programs"           element={<MyPrograms />} />
        <Route path="/programs/:slug"        element={<ProgramDetail />} />
        <Route path="/programs/journey/:enrollmentId" element={<ProgramJourney />} />
        <Route path="/choose-plan"           element={<ChoosePlan />} />
        <Route path="/membership-card"       element={<MainLayout><MyMembershipCard /></MainLayout>} />
        <Route path="/diet"                  element={<MainLayout><Diet /></MainLayout>} />
        <Route path="/calorie-calculator"    element={<MainLayout><CalorieCalculator /></MainLayout>} />
        <Route path="/emergency"             element={<MainLayout><Emergency /></MainLayout>} />
        <Route path="/video-consultation"    element={<MainLayout><VideoConsultation /></MainLayout>} />
        <Route path="/notifications"              element={<Navigate to="/patient/notifications" replace />} />
        <Route path="/patient/notifications"      element={<MainLayout><PatientNotifications /></MainLayout>} />
        <Route path="/patient/care-updates"       element={<MainLayout><FamilyCareUpdates /></MainLayout>} />
        <Route path="/patient/lab-tests"          element={<MainLayout><LabTests /></MainLayout>} />
        <Route path="/patient/my-reports"         element={<MainLayout><MyReports /></MainLayout>} />
        <Route path="/patient/pharmacy"           element={<MainLayout><Pharmacy /></MainLayout>} />
        <Route path="/patient/vital-reports"      element={<MainLayout><VitalReports /></MainLayout>} />
        <Route path="/patient/device-integration" element={<MainLayout><DeviceIntegration /></MainLayout>} />
        <Route path="/patient/watch-analytics"    element={<MainLayout><WatchAnalytics /></MainLayout>} />
        <Route path="/patient/documents"          element={<MainLayout><UploadedDocuments /></MainLayout>} />
        <Route path="/patient/network-hospitals"  element={<MainLayout><NetworkHospitals /></MainLayout>} />
        <Route path="/patient/network-clinics"   element={<MainLayout><NetworkClinics /></MainLayout>} />
        <Route path="/patient/buy-insurance"      element={<MainLayout><BuyInsurance /></MainLayout>} />
        <Route path="/patient/claims"             element={<Navigate to="/claims-express" replace />} />
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
        <Route path="/smart-opd"              element={<SmartOPD />} />
        <Route path="/claims-express"         element={<ClaimsExpress />} />

        {/* ── Billing ─────────────────────────────────────────────────── */}
        <Route path="/billing/checkout"        element={<MainLayout><OrderCheckout /></MainLayout>} />
        <Route path="/billing/orders"          element={<MainLayout><OrderHistory /></MainLayout>} />
        <Route path="/billing/invoices"        element={<MainLayout><MyInvoices /></MainLayout>} />
        <Route path="/billing/orders/:orderId" element={<MainLayout><OrderDetails /></MainLayout>} />

        {/* ── Insurance / Support / Contact ───────────────────────────── */}
        <Route path="/my-insurance"  element={<MainLayout><MyInsurancePolicies /></MainLayout>} />
        <Route path="/help"          element={<MainLayout><HelpCenter /></MainLayout>} />
        <Route path="/contact-us"    element={<MainLayout><ContactUs /></MainLayout>} />

        {/* ── Hospital Display & Kiosk System ─────────────────────────── */}
        <Route path="/display/queue"            element={<OPDQueueDisplay />} />
        <Route path="/display/icu-board"        element={<ICUBoardDisplay />} />
        <Route path="/display/blood-bank"       element={<BloodBankDisplay />} />
        <Route path="/display/ot-status"        element={<OTStatusDisplay />} />
        <Route path="/display/ward"             element={<WardNursingDisplay />} />
        <Route path="/display/bedside"          element={<BedsideDisplay />} />
        <Route path="/display/discharge-status" element={<DischargeStatusDisplay />} />
        <Route path="/kiosk/checkin"            element={<SelfCheckinKiosk />} />
        <Route path="/hospital/queue-console"   element={<QueueConsole />} />
        <Route path="/display/signage"           element={<LobbySignageDisplay />} />
        <Route path="/display/command"          element={<CommandCentreDisplay />} />
        <Route path="/display/floor-map"        element={<HospitalFloorMapDisplay />} />
        <Route path="/kiosk/family-video"       element={<FamilyVideoKiosk />} />
        <Route path="/kiosk/er-triage"           element={<ERTriageKiosk />} />
        <Route path="/kiosk/wayfinding"          element={<WayfindingKiosk />} />
        <Route path="/display/er-triage"        element={<ERTriageDisplay />} />
        <Route path="/display/ot-proctor"       element={<OTProctorDisplay />} />
        <Route path="/display/admin"            element={<DisplayAdminPage />} />

        {/* ── Misc ────────────────────────────────────────────────────── */}
        <Route path="/diagnostic" element={<ConnectionDiagnostic />} />
        <Route path="*"           element={<NotFound />} />
      </Routes>
    </Suspense>
  );
};

export default AppRoutes;
