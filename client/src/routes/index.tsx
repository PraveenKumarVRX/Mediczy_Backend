import { Routes, Route, Navigate } from "react-router-dom";
import Index from "@/pages/Index";
import Login from "@/auth/Login";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import OAuthCallback from "@/auth/OAuthCallback";
import DoctorLogin from "@/auth/DoctorLogin";
import Register from "@/auth/Register";
import DocRegister from "@/auth/DocRegister";
import DebugDashboard from "@/pages/DebugDashboard";
import Profile from "@/pages/Profile";
import ProfileEnhanced from "@/pages/ProfileEnhanced";
import Wallet from "@/pages/Wallet";
import HealthTracker from "@/pages/HealthTracker";
import HealthDiary from "@/pages/HealthDiary";
import Symptoms from "@/pages/Symptoms";
import Medicine from "@/pages/Medicine";
import ChatCall from "@/pages/chat/VideoChat";

import AiDoctor from "@/pages/AiDoctor";
import Consultation from "@/pages/Consultation";
import Ayushman from "@/pages/Ayushman";
import NotFound from "@/pages/NotFound";
import Emergency from "@/pages/Emergency";
import ConsultationBooking from "@/pages/ConsultationBooking";
import NurseBooking from "@/pages/NurseBooking";
import LabBooking from "@/pages/LabBooking";
import HomecareBooking from "@/pages/HomecareBooking";
import MyBookings from "@/pages/MyBookings";
import HealthFeedPage from "@/pages/HealthFeedPage";
import RepostsPage from "@/pages/Reposts";
import MyPlans from "@/pages/MyPlans";
import MyPrescriptions from "@/pages/MyPrescriptions";
import Diet from "@/pages/Diet";
import CalorieCalculator from "@/pages/CalorieCalculator";
import DoctorListBooking from "@/pages/DoctorListBooking";
import Appointments from "@/pages/Appointments";
import PatientNotifications from "@/pages/patient/PatientNotifications";
import LabTests from "@/pages/patient/LabTests";
import MyReports from "@/pages/patient/MyReports";
import Pharmacy from "@/pages/patient/Pharmacy";
import VitalReports from "@/pages/patient/VitalReports";
import DeviceIntegration from "@/pages/patient/DeviceIntegration";
import UploadedDocuments from "@/pages/patient/UploadedDocuments";
import NetworkHospitals from "@/pages/patient/NetworkHospitals";
import BuyInsurance from "@/pages/patient/BuyInsurance";
import ClaimsManagement from "@/pages/patient/ClaimsManagement";
import AIHealthAnalysis from "@/pages/patient/AIHealthAnalysis";
import EmployeeGamification from "@/pages/patient/EmployeeGamification";
import EmployeeWellnessCalendar from "@/pages/patient/EmployeeWellnessCalendar";
import DoctorDashboard from "@/pages/doctor/DoctorDashboard";
import DoctorAppointments from "@/pages/doctor/DoctorAppointments";
import DoctorAppointmentSettings from "@/pages/doctor/DoctorAppointmentSettings";
import DoctorPrescriptions from "@/pages/doctor/DoctorPrescriptions";
import DoctorContact from "@/pages/doctor/DoctorContact";
import DoctorAlerts from "@/pages/doctor/DoctorAlerts";
import DoctorVideoConsultation from "@/pages/doctor/DoctorVideoConsultation";
import RecordingTest from "@/pages/doctor/RecordingTest";
import VideoConsultation from "@/pages/VideoConsultation";
import DoctorPatients from "@/pages/doctor/DoctorPatients";
import DoctorTriage from "@/pages/doctor/DoctorTriage";
import RemoteHealthMonitoring from "@/pages/doctor/RemoteHealthMonitoring";
import DoctorAssist from "@/pages/doctor/DoctorAssist";
import HealthMonitoringDashboardWrapper from "@/pages/doctor/HealthMonitoringDashboardWrapper";
import DoctorAnalytics from "@/pages/doctor/DoctorAnalytics";
import DoctorReports from "@/pages/doctor/DoctorReports";
import DoctorSettings from "@/pages/doctor/DoctorSettings";
import DoctorDocumentTemplates from "@/pages/doctor/DoctorDocumentTemplates";
import DoctorTemplateSettings from "@/pages/doctor/DoctorTemplateSettings";
import DoctorSpecialtyTemplates from "@/pages/doctor/DoctorSpecialtyTemplates";
import PrescriptionWriter from "@/pages/doctor/PrescriptionWriter";
import DoctorServices from "@/pages/doctor/DoctorServices";
import DoctorBilling from "@/pages/doctor/DoctorBilling";
import PatientEMR from "@/pages/doctor/PatientEMR";
import AdminLogin from "@/pages/admin/AdminLogin";
import AdminChatDashboard from "@/pages/admin/AdminChatDashboard";
import AdminTestPage from '@/pages/admin/AdminTestPage';
import SimpleAdminDashboard from "@/pages/admin/SimpleAdminDashboard";
import AdminAppointments from "@/pages/admin/AdminAppointments";
import AdminDashboard from "@/pages/admin/AdminDashboard";
import AdminDashboardHome from "@/pages/admin/AdminDashboardHome";
import ComprehensiveAdminDashboard from "@/pages/admin/ComprehensiveAdminDashboard";
import DoctorsManagement from "@/pages/admin/DoctorsManagement";
import UsersManagement from "@/pages/admin/UsersManagement";
import LabsManagement from "@/pages/admin/LabsManagement";
import PharmaciesManagement from "@/pages/admin/PharmaciesManagement";
import CorporatesManagement from "@/pages/admin/CorporatesManagement";
import CorporateHealthPackages from '@/pages/admin/CorporateHealthPackages';
import CorporateEmployeesManagement from '@/pages/admin/CorporateEmployeesManagement';
import CorporatePlansManagement from '@/pages/admin/CorporatePlansManagement';
import AdminPlans from "@/pages/admin/AdminPlans";
import AdminInsurance from "@/pages/admin/AdminInsurance";
import AdminWorkflowAutomation from "@/pages/admin/AdminWorkflowAutomation";
import HospitalsManagement from '@/pages/admin/HospitalsManagement';
import ClinicsManagement from '@/pages/admin/ClinicsManagement';
import HomecareManagement from '@/pages/admin/HomecareManagement';
import AmbulanceManagement from '@/pages/admin/AmbulanceManagement';
import OHCManagement from '@/pages/admin/OHCManagement';
import InsurerManagement from '@/pages/admin/InsurerManagement';
import TPAManagement from '@/pages/admin/TPAManagement';
import MedivacManagement from '@/pages/admin/MedivacManagement';
import NGOManagement from '@/pages/admin/NGOManagement';
import PSUManagement from '@/pages/admin/PSUManagement';
import TeamLogin from '@/pages/team/TeamLogin';
import TeamDashboard from '@/pages/team/TeamDashboard';
import TeamProfile from '@/pages/team/TeamProfile';
import TeamDirectory from '@/pages/team/TeamDirectory';
import TeamReports from '@/pages/team/TeamReports';
import TeamTools from '@/pages/team/TeamTools';
import TeamPharmacyEdit from '@/pages/team/TeamPharmacyEdit';
import {
  TeamUserManagementPage,
  TeamDoctorManagementPage,
  TeamCorporateManagementPage,
  TeamHospitalManagementPage,
  TeamClinicManagementPage,
  TeamLabManagementPage,
  TeamPharmacyManagementPage,
  TeamChatAnalyticsPage,
  TeamSupportTicketsPage,
  TeamAppointmentsPage,
  TeamChatDashboardPage,
  TeamHealthPlansPage,
  TeamActivityLogsPage,
  TeamSettingsPage
} from '@/pages/team/TeamModulePages';
import TeamManagement from '@/pages/admin/TeamManagement';
import TeamPrivileges from '@/pages/admin/TeamPrivileges';
import NurseLogin from '@/pages/nurse/NurseLogin';
import NurseDashboard from '@/pages/nurse/NurseDashboard';
import NurseRegisterPatient from '@/pages/nurse/NurseRegisterPatient';
import NursePatients from '@/pages/nurse/NursePatients';
import NurseVitals from '@/pages/nurse/NurseVitals';
import NurseMedications from '@/pages/nurse/NurseMedications';
import NurseNotes from '@/pages/nurse/NurseNotes';
import NurseAppointments from '@/pages/nurse/NurseAppointments';
import AssistantLogin from '@/pages/assistant/AssistantLogin';
import AssistantDashboard from '@/pages/assistant/AssistantDashboard';
import AssistantRegisterPatient from '@/pages/assistant/AssistantRegisterPatient';
import AssistantPatients from '@/pages/assistant/AssistantPatients';
import AssistantAppointments from '@/pages/assistant/AssistantAppointments';
import AssistantPrescriptions from '@/pages/assistant/AssistantPrescriptions';
import AssistantBilling from '@/pages/assistant/AssistantBilling';
import AssistantMessages from '@/pages/assistant/AssistantMessages';
import AssistantReports from '@/pages/assistant/AssistantReports';
import MainLayout from '@/components/layout/MainLayout';
import AdminRegisterPatient from '@/pages/admin/AdminRegisterPatient';
import AdminManageAssistants from '@/pages/admin/AdminManageAssistants';
import BillingManagement from '@/pages/admin/BillingManagement';
import AccountingManagement from '@/pages/admin/AccountingManagement';
import PaymentManagement from '@/pages/admin/PaymentManagement';
import OrderCheckout from '@/pages/billing/OrderCheckout';
import OrderHistory from '@/pages/billing/OrderHistory';
import OrderDetails from '@/pages/billing/OrderDetails';
import MyInvoices from '@/pages/billing/MyInvoices';
import EmailManagement from '@/pages/admin/EmailManagement';
import ActivityLog from '@/pages/admin/ActivityLog';
import ModuleAccessControl from '@/pages/admin/ModuleAccessControl';
import ConnectionDiagnostic from '@/pages/ConnectionDiagnostic';
import AdminAuthTest from '@/pages/admin/AdminAuthTest';
import SMSManagement from '@/pages/admin/SMSManagement';
import WhatsAppManagement from '@/pages/admin/WhatsAppManagement';
import VideoManagement from '@/pages/admin/VideoManagement';
import VoiceCallManagement from '@/pages/admin/VoiceCallManagement';
import TicketManagement from '@/pages/admin/TicketManagement';
import AdminHealthRiskAssessment from '@/pages/admin/HealthRiskAssessment';
import UserHealthRiskAssessment from '@/pages/UserHealthRiskAssessment';
// Placeholder pages (reports still from AdminPlaceholders, new SettingsPage)
import { ReportsPage } from "@/pages/admin/AdminPlaceholders";
import SettingsPage from "@/pages/admin/SettingsPage";
import CRMPage from "@/pages/admin/CRMPage";
import CRMLeadDetail from "@/pages/admin/CRMLeadDetail";
import VideoCallTestSimple from "@/pages/VideoCallTestSimple";
import VideoCallTestBasic from "@/pages/VideoCallTestBasic";
import CorporateDashboard from "@/pages/CorporateDashboard";
import CorporateBenefits from "@/pages/CorporateBenefits";
import OrderTasks from "@/pages/OrderTasks";
import CorporateLogin from "@/pages/corporate/CorporateLogin";
import CorporateNotifications from "@/pages/corporate/CorporateNotifications";
import CorporateEmployees from "@/pages/corporate/CorporateEmployees";
import CorporateAppointments from "@/pages/corporate/CorporateAppointments";
import CorporateHealthAnalysis from "@/pages/corporate/CorporateHealthAnalysis";
import CorporateDepartments from "@/pages/corporate/CorporateDepartments";
import CorporateClaims from "@/pages/corporate/CorporateClaims";
import CorporateReports from "@/pages/corporate/CorporateReports";
import CorporateComplaints from "@/pages/corporate/CorporateComplaints";
import CorporateSettings from "@/pages/corporate/CorporateSettings";
import CorporateHelp from "@/pages/corporate/CorporateHelp";
import CorporateHealthRiskAssessment from "@/pages/corporate/CorporateHealthRiskAssessment";
import CorporateGamification from "@/pages/corporate/CorporateGamification";
import CorporateWellnessCalendar from "@/pages/corporate/CorporateWellnessCalendar";
import TpaLogin from "@/pages/tpa/TpaLogin";
import TPADashboard from "@/pages/tpa/TPADashboard";
import TPAClaims from "@/pages/tpa/TPAClaims";
import TPAMembers from "@/pages/tpa/TPAMembers";
import { 
  TPAPolicies, 
  TPAPreAuth, 
  TPAAnalytics, 
  TPAReports, 
  TPASettings, 
  TPASupport,
  TPACorporates,
  TPAProfile
} from "@/pages/tpa/TPAPlaceholders";
import TPACommunicationHub from "@/pages/tpa/TPACommunicationHub";
import TPAHeritageIntegration from "@/pages/tpa/TPAHeritageIntegration";
import TPAIntegrationPage from "@/pages/tpa/TPAIntegrationPage";
import TPAProvidersPage from "@/pages/tpa/TPAProvidersPage";
import TPAClaimSubmissionPage from "@/pages/tpa/TPAClaimSubmissionPage";
import TPAECardPage from "@/pages/tpa/TPAECardPage";
import TPAHospitalsPage from "@/pages/tpa/TPAHospitalsPage";
import PSULogin from "@/pages/psu/PSULogin";
import InsurerLogin from "@/pages/insurer/InsurerLogin";
import NGOLogin from "@/pages/ngo/NGOLogin";
import HospitalCommunicationHub from "@/pages/hospital/HospitalCommunicationHub";
import BrokerCommunication from "@/pages/insurance-broker/BrokerCommunication";
import InsuranceCommunication from "@/pages/insurance-company/InsuranceCommunication";
import BrokerCommunication from "@/pages/insurance-broker/BrokerCommunication";
import InsuranceCommunication from "@/pages/insurance-company/InsuranceCommunication";
import HospitalLogin from "@/pages/hospital/HospitalLogin";
import HospitalDashboard from "@/pages/hospital/HospitalDashboard";
import HospitalPracticeManagement from "@/pages/hospital/HospitalPracticeManagement";
import HospitalInsuranceBilling from "@/pages/hospital/HospitalInsuranceBilling";
import HospitalMRD from "@/pages/hospital/HospitalMRD";
import HospitalEHR from "@/pages/hospital/HospitalEHR";
import HospitalLabOrder from "@/pages/hospital/HospitalLabOrder";
import HospitalImagingOrder from "@/pages/hospital/HospitalImagingOrder";
import HospitalPrescriptionCreator from "@/pages/hospital/HospitalPrescriptionCreator";
import HospitalProcedureAdder from "@/pages/hospital/HospitalProcedureAdder";
import HospitalDischargeSummary from "@/pages/hospital/HospitalDischargeSummary";
import HospitalIPSheets from "@/pages/hospital/HospitalIPSheets";
import {
  HospitalAppointmentsPage,
  HospitalBedsPage,
  HospitalPatientsPage,
  HospitalDoctorsPage,
  HospitalOpdIpdPage,
  HospitalPharmacyPage,
  HospitalLabReportsPage,
  HospitalBillingPage,
  HospitalClaimsPage,
  HospitalStaffPage,
  HospitalSettingsPage,
  HospitalSupportPage,
} from "@/pages/hospital/HospitalModulePages";
import ClinicLogin from "@/pages/clinic/ClinicLogin";
import ClinicDashboard from "@/pages/clinic/ClinicDashboard";
import {
  ClinicAppointmentsPage,
  ClinicPatientsPage,
  ClinicQueuePage,
  ClinicDoctorsPage,
  ClinicConsultationsPage,
  ClinicPrescriptionsPage,
  ClinicPharmacyPage,
  ClinicLabTestsPage,
  ClinicBillingPage,
  ClinicPaymentsPage,
  ClinicReportsPage,
  ClinicStaffPage,
  ClinicNotificationsPage,
  ClinicSettingsPage,
  ClinicSupportPage,
} from "@/pages/clinic/ClinicModulePages";
import LabLogin from "@/pages/lab/LabLogin";
import LabDashboard from "@/pages/lab/LabDashboard";
import {
  LabOrdersPage,
  LabPatientsPage,
  LabAppointmentsPage,
  LabQueuePage,
  LabSamplesPage,
  LabProcessingPage,
  LabResultsPage,
  LabReportsPage,
  LabInventoryPage,
  LabBillingPage,
  LabPaymentsPage,
  LabAnalyticsPage,
  LabStaffPage,
  LabNotificationsPage,
  LabSettingsPage,
  LabSupportPage,
} from "@/pages/lab/LabModulePages";
import PharmacyLogin from "@/pages/pharmacy/PharmacyLogin";
import PharmacyDashboard from "@/pages/pharmacy/PharmacyDashboard";
import {
  PharmacyPOSPage,
  PharmacyPrescriptionsPage,
  PharmacyInventoryPage,
  PharmacyStockAlertsPage,
  PharmacyBatchesPage,
  PharmacyPurchaseOrdersPage,
  PharmacyCustomersPage,
  PharmacyReportsPage,
  PharmacyInvoicesPage,
  PharmacyExpiryPage,
  PharmacyAnalyticsPage,
  PharmacySettingsPage,
  PharmacySupportPage,
} from "@/pages/pharmacy/PharmacyModulePages";
import AmbulanceLogin from "@/pages/ambulance/AmbulanceLogin";
import AmbulanceDashboard from "@/pages/ambulance/AmbulanceDashboard";
import {
  AmbulanceActiveTripsPage,
  AmbulanceDispatchPage,
  AmbulanceTrackingPage,
  AmbulanceHistoryPage,
  AmbulanceFleetPage,
  AmbulanceStaffPage,
  AmbulanceMaintenancePage,
  AmbulanceSchedulePage,
  AmbulanceBillingPage,
  AmbulanceReportsPage,
  AmbulanceAlertsPage,
  AmbulanceSettingsPage,
  AmbulanceSupportPage,
} from "@/pages/ambulance/AmbulanceModulePages";
import {
  HomecarePatientsPage,
  HomecareCarePlansPage,
  HomecareAppointmentsPage,
  HomecareStaffPage,
  HomecareServicesPage,
  HomecareBillingPage,
  HomecareInventoryPage,
  HomecareReportsPage,
  HomecareSettingsPage,
  HomecareSupportPage,
} from "@/pages/homecare/HomecareModulePages";
import HomecareLogin from "@/pages/homecare/HomecareLogin";
import HomecareDashboard from "@/pages/homecare/HomecareDashboard";
import InsuranceBrokerLogin from "@/pages/insurance-broker/InsuranceBrokerLogin";
import InsuranceCompanyLogin from "@/pages/insurance-company/InsuranceCompanyLogin";
import CorporateCompliance from "@/pages/corporate/CorporateCompliance";
import CorporateSupport from "@/pages/corporate/CorporateSupport";
import HospitalNotifications from "@/pages/hospital/HospitalNotifications";

const AppRoutes = () => {
  const PharmacyEntry = () => {
    const token = localStorage.getItem('pharmacyToken');
    return <Navigate to={token ? '/pharmacy/dashboard' : '/pharmacy/login'} replace />;
  };

  return (
    <Routes>
        <Route path="/" element={<MainLayout><Index /></MainLayout>} />
        <Route path="/video-test" element={<VideoCallTestSimple />} />
        <Route path="/video-test-basic" element={<VideoCallTestBasic />} />
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/oauth-callback" element={<OAuthCallback />} />
      <Route path="/doctor/login" element={<DoctorLogin />} />
      <Route path="/hospital/login" element={<HospitalLogin />} />
      <Route path="/hospital/dashboard" element={<HospitalDashboard />} />
      <Route path="/hospital/practice-management" element={<HospitalPracticeManagement />} />
      <Route path="/hospital/insurance-billing" element={<HospitalInsuranceBilling />} />
      <Route path="/hospital/mrd" element={<HospitalMRD />} />
      <Route path="/hospital/ehr" element={<HospitalEHR />} />
      <Route path="/hospital/lab-order" element={<HospitalLabOrder />} />
      <Route path="/hospital/imaging-order" element={<HospitalImagingOrder />} />
      <Route path="/hospital/prescription-creator" element={<HospitalPrescriptionCreator />} />
      <Route path="/hospital/procedure-adder" element={<HospitalProcedureAdder />} />
      <Route path="/hospital/discharge-summary" element={<HospitalDischargeSummary />} />
      <Route path="/hospital/ip-sheets" element={<HospitalIPSheets />} />
      <Route path="/hospital/appointments" element={<HospitalAppointmentsPage />} />
      <Route path="/hospital/beds" element={<HospitalBedsPage />} />
      <Route path="/hospital/patients" element={<HospitalPatientsPage />} />
      <Route path="/hospital/doctors" element={<HospitalDoctorsPage />} />
      <Route path="/hospital/opd-ipd" element={<HospitalOpdIpdPage />} />
      <Route path="/hospital/pharmacy" element={<HospitalPharmacyPage />} />
      <Route path="/hospital/lab-reports" element={<HospitalLabReportsPage />} />
      <Route path="/hospital/billing" element={<HospitalBillingPage />} />
      <Route path="/hospital/claims" element={<HospitalClaimsPage />} />
      <Route path="/hospital/staff" element={<HospitalStaffPage />} />
      <Route path="/hospital/communication" element={<HospitalCommunicationHub />} />
      <Route path="/hospital/notifications" element={<HospitalNotifications />} />
      <Route path="/hospital/settings" element={<HospitalSettingsPage />} />
      <Route path="/hospital/support" element={<HospitalSupportPage />} />
      <Route path="/clinic/login" element={<ClinicLogin />} />
      <Route path="/clinic/dashboard" element={<ClinicDashboard />} />
      <Route path="/clinic/appointments" element={<ClinicAppointmentsPage />} />
      <Route path="/clinic/patients" element={<ClinicPatientsPage />} />
      <Route path="/clinic/queue" element={<ClinicQueuePage />} />
      <Route path="/clinic/doctors" element={<ClinicDoctorsPage />} />
      <Route path="/clinic/consultations" element={<ClinicConsultationsPage />} />
      <Route path="/clinic/prescriptions" element={<ClinicPrescriptionsPage />} />
      <Route path="/clinic/pharmacy" element={<ClinicPharmacyPage />} />
      <Route path="/clinic/lab-tests" element={<ClinicLabTestsPage />} />
      <Route path="/clinic/billing" element={<ClinicBillingPage />} />
      <Route path="/clinic/payments" element={<ClinicPaymentsPage />} />
      <Route path="/clinic/reports" element={<ClinicReportsPage />} />
      <Route path="/clinic/staff" element={<ClinicStaffPage />} />
      <Route path="/clinic/notifications" element={<ClinicNotificationsPage />} />
      <Route path="/clinic/settings" element={<ClinicSettingsPage />} />
      <Route path="/clinic/support" element={<ClinicSupportPage />} />
      <Route path="/lab/login" element={<LabLogin />} />
      <Route path="/lab/dashboard" element={<LabDashboard />} />
      {/* Lab sub-routes */}
      <Route path="/lab/orders" element={<LabOrdersPage />} />
      <Route path="/lab/orders/new" element={<LabOrdersPage />} />
      <Route path="/lab/patients" element={<LabPatientsPage />} />
      <Route path="/lab/patients/new" element={<LabPatientsPage />} />
      <Route path="/lab/appointments" element={<LabAppointmentsPage />} />
      <Route path="/lab/appointments/new" element={<LabAppointmentsPage />} />
      <Route path="/lab/queue" element={<LabQueuePage />} />
      <Route path="/lab/queue/new" element={<LabQueuePage />} />
      <Route path="/lab/samples" element={<LabSamplesPage />} />
      <Route path="/lab/samples/new" element={<LabSamplesPage />} />
      <Route path="/lab/processing" element={<LabProcessingPage />} />
      <Route path="/lab/processing/new" element={<LabProcessingPage />} />
      <Route path="/lab/results" element={<LabResultsPage />} />
      <Route path="/lab/results/new" element={<LabResultsPage />} />
      <Route path="/lab/reports" element={<LabReportsPage />} />
      <Route path="/lab/reports/new" element={<LabReportsPage />} />
      <Route path="/lab/inventory" element={<LabInventoryPage />} />
      <Route path="/lab/inventory/new" element={<LabInventoryPage />} />
      <Route path="/lab/billing" element={<LabBillingPage />} />
      <Route path="/lab/billing/new" element={<LabBillingPage />} />
      <Route path="/lab/payments" element={<LabPaymentsPage />} />
      <Route path="/lab/payments/new" element={<LabPaymentsPage />} />
      <Route path="/lab/analytics" element={<LabAnalyticsPage />} />
      <Route path="/lab/staff" element={<LabStaffPage />} />
      <Route path="/lab/staff/new" element={<LabStaffPage />} />
      <Route path="/lab/notifications" element={<LabNotificationsPage />} />
      <Route path="/lab/settings" element={<LabSettingsPage />} />
      <Route path="/lab/support" element={<LabSupportPage />} />
      <Route path="/pharmacy" element={<PharmacyEntry />} />
      <Route path="/pharmacy/login" element={<PharmacyLogin />} />
      <Route path="/pharmacy/dashboard" element={<PharmacyDashboard />} />
      {/* Pharmacy sub-routes */}
      <Route path="/pharmacy/pos" element={<PharmacyPOSPage />} />
      <Route path="/pharmacy/prescriptions" element={<PharmacyPrescriptionsPage />} />
      <Route path="/pharmacy/inventory" element={<PharmacyInventoryPage />} />
      <Route path="/pharmacy/stock-alerts" element={<PharmacyStockAlertsPage />} />
      <Route path="/pharmacy/batches" element={<PharmacyBatchesPage />} />
      <Route path="/pharmacy/purchase-orders" element={<PharmacyPurchaseOrdersPage />} />
      <Route path="/pharmacy/customers" element={<PharmacyCustomersPage />} />
      <Route path="/pharmacy/reports" element={<PharmacyReportsPage />} />
      <Route path="/pharmacy/invoices" element={<PharmacyInvoicesPage />} />
      <Route path="/pharmacy/expiry" element={<PharmacyExpiryPage />} />
      <Route path="/pharmacy/analytics" element={<PharmacyAnalyticsPage />} />
      <Route path="/pharmacy/settings" element={<PharmacySettingsPage />} />
      <Route path="/pharmacy/support" element={<PharmacySupportPage />} />
      <Route path="/ambulance/login" element={<AmbulanceLogin />} />
      {/* Ambulance sub-routes */}
      <Route path="/ambulance/active-trips" element={<AmbulanceActiveTripsPage />} />
      <Route path="/ambulance/dispatch" element={<AmbulanceDispatchPage />} />
      <Route path="/ambulance/tracking" element={<AmbulanceTrackingPage />} />
      <Route path="/ambulance/history" element={<AmbulanceHistoryPage />} />
      <Route path="/ambulance/fleet" element={<AmbulanceFleetPage />} />
      <Route path="/ambulance/staff" element={<AmbulanceStaffPage />} />
      <Route path="/ambulance/maintenance" element={<AmbulanceMaintenancePage />} />
      <Route path="/ambulance/schedule" element={<AmbulanceSchedulePage />} />
      <Route path="/ambulance/billing" element={<AmbulanceBillingPage />} />
      <Route path="/ambulance/reports" element={<AmbulanceReportsPage />} />
      <Route path="/ambulance/alerts" element={<AmbulanceAlertsPage />} />
      <Route path="/ambulance/settings" element={<AmbulanceSettingsPage />} />
      <Route path="/ambulance/support" element={<AmbulanceSupportPage />} />
      <Route path="/homecare/login" element={<HomecareLogin />} />
      <Route path="/intermediary/login" element={<InsuranceBrokerLogin />} />
      <Route path="/intermediary/communication" element={<BrokerCommunication />} />
      <Route path="/tpa/login" element={<TpaLogin />} />
      <Route path="/tpa/dashboard" element={<TPADashboard />} />
      <Route path="/tpa/claims" element={<TPAClaims />} />
      <Route path="/tpa/corporates" element={<TPACorporates />} />
      <Route path="/tpa/members" element={<TPAMembers />} />
      <Route path="/tpa/policies" element={<TPAPolicies />} />
      <Route path="/tpa/pre-auth" element={<TPAPreAuth />} />
      <Route path="/tpa/analytics" element={<TPAAnalytics />} />
      <Route path="/tpa/reports" element={<TPAReports />} />
      <Route path="/tpa/communication" element={<TPACommunicationHub />} />
      <Route path="/tpa/heritage" element={<TPAHeritageIntegration />} />
      <Route path="/tpa/settings" element={<TPASettings />} />
      <Route path="/tpa/support" element={<TPASupport />} />
      <Route path="/tpa/profile" element={<TPAProfile />} />      
      {/* TPA Integration Routes - New */}
      <Route path="/tpa/integration" element={<MainLayout><TPAIntegrationPage /></MainLayout>} />
      <Route path="/tpa/providers" element={<MainLayout><TPAProvidersPage /></MainLayout>} />
      <Route path="/tpa/claim-submission" element={<MainLayout><TPAClaimSubmissionPage /></MainLayout>} />
      <Route path="/tpa/ecard" element={<MainLayout><TPAECardPage /></MainLayout>} />
      <Route path="/tpa/hospitals" element={<MainLayout><TPAHospitalsPage /></MainLayout>} />
            <Route path="/tpa/claims" element={<TPAClaims />} />
      <Route path="/tpa/corporates" element={<TPACorporates />} />
      <Route path="/tpa/members" element={<TPAMembers />} />
      <Route path="/tpa/policies" element={<TPAPolicies />} />
      <Route path="/tpa/pre-auth" element={<TPAPreAuth />} />
      <Route path="/tpa/analytics" element={<TPAAnalytics />} />
      <Route path="/tpa/reports" element={<TPAReports />} />
      <Route path="/tpa/communication" element={<TPACommunicationHub />} />
      <Route path="/tpa/settings" element={<TPASettings />} />
      <Route path="/tpa/support" element={<TPASupport />} />
      <Route path="/tpa/profile" element={<TPAProfile />} />
      <Route path="/insurer/login" element={<InsuranceCompanyLogin />} />
      <Route path="/insurer/communication" element={<InsuranceCommunication />} />
      <Route path="/insurance-company/communication" element={<InsuranceCommunication />} />
      <Route path="/register" element={<Register />} />
      <Route path="/doc-register" element={<DocRegister />} />
      <Route path="/debug" element={<DebugDashboard />} />
      <Route path="/doctor-dashboard" element={<DoctorDashboard />} />
      <Route path="/doctor/dashboard" element={<DoctorDashboard />} />
      <Route path="/doctor/appointments" element={<DoctorAppointments />} />
      <Route path="/doctor/availability" element={<DoctorAppointmentSettings />} />
      <Route path="/doctor/prescriptions" element={<DoctorPrescriptions />} />
      <Route path="/doctor/patients" element={<DoctorPatients />} />
      <Route path="/doctor/triage" element={<DoctorTriage />} />
      <Route path="/doctor/remote-monitoring" element={<RemoteHealthMonitoring />} />
      <Route path="/doctor/assist" element={<DoctorAssist />} />
      <Route path="/doctor/health-monitoring" element={<HealthMonitoringDashboardWrapper />} />
      <Route path="/doctor/contact" element={<DoctorContact />} />
      <Route path="/doctor/alerts" element={<DoctorAlerts />} />
      <Route path="/doctor/video" element={<DoctorVideoConsultation />} />
      <Route path="/doctor/recording-test" element={<RecordingTest />} />
      <Route path="/doctor/chat" element={<ChatCall />} />
      <Route path="/doctor/analytics" element={<DoctorAnalytics />} />
      <Route path="/doctor/reports" element={<DoctorReports />} />
      <Route path="/doctor/settings" element={<DoctorSettings />} />
      <Route path="/doctor/templates" element={<DoctorDocumentTemplates />} />
      <Route path="/doctor/template-settings" element={<DoctorTemplateSettings />} />
      <Route path="/doctor/specialty-templates" element={<DoctorSpecialtyTemplates />} />
      <Route path="/doctor/prescription-writer" element={<Navigate to="/doctor/prescriptions" replace />} />
      <Route path="/doctor/services" element={<DoctorServices />} />
      <Route path="/doctor/billing" element={<DoctorBilling />} />
      <Route path="/doctor/health-records" element={<PatientEMR />} />
      <Route path="/video-consultation" element={<MainLayout><VideoConsultation /></MainLayout>} />
      <Route path="/nurse/dashboard" element={<MainLayout><NurseDashboard /></MainLayout>} />
      <Route path="/profile" element={<MainLayout><ProfileEnhanced /></MainLayout>} />
      <Route path="/wallet" element={<MainLayout><Wallet /></MainLayout>} />
      <Route path="/health-tracker" element={<MainLayout><HealthTracker /></MainLayout>} />
      <Route path="/health-diary" element={<MainLayout><HealthDiary /></MainLayout>} />
      <Route path="/consultation" element={<MainLayout><Consultation /></MainLayout>} />
      <Route path="/doctors" element={<DoctorListBooking />} />
      <Route path="/symptoms" element={<MainLayout><Symptoms /></MainLayout>} />
      <Route path="/medicine" element={<MainLayout><Medicine /></MainLayout>} />
      {/* Video chat routes */}
      <Route path="/chat" element={<ChatCall />} />
      <Route path="/doctor/chat" element={<ChatCall />} />
      <Route path="/chatdoctor" element={<ChatCall />} />

      <Route path="/ai-doctor" element={<MainLayout><AiDoctor /></MainLayout>} />
      <Route path="/ayushman" element={<MainLayout><Ayushman /></MainLayout>} />
      <Route path="/health-feed" element={<MainLayout><HealthFeedPage /></MainLayout>} />
      <Route path="/reposts" element={<MainLayout><RepostsPage /></MainLayout>} />
      <Route path="/consultation/:doctorId" element={<ConsultationBooking />} />
      <Route path="/nurse-booking/:nurseId" element={<NurseBooking />} />
      <Route path="/lab-booking/:labId" element={<LabBooking />} />
      <Route path="/homecare-booking/:homecareId" element={<HomecareBooking />} />
      <Route path="/my-bookings" element={<MainLayout><MyBookings /></MainLayout>} />
      <Route path="/appointments" element={<Appointments />} />
      <Route path="/my-prescriptions" element={<MyPrescriptions />} />
  <Route path="/my-plans" element={<MainLayout><MyPlans /></MainLayout>} />
      <Route path="/diet" element={<MainLayout><Diet /></MainLayout>} />
      <Route path="/calorie-calculator" element={<MainLayout><CalorieCalculator /></MainLayout>} />
      <Route path="/emergency" element={<MainLayout><Emergency /></MainLayout>} />
      {/* Patient Features */}
      <Route path="/patient/notifications" element={<MainLayout><PatientNotifications /></MainLayout>} />
      <Route path="/patient/lab-tests" element={<MainLayout><LabTests /></MainLayout>} />
      <Route path="/patient/my-reports" element={<MainLayout><MyReports /></MainLayout>} />
      <Route path="/patient/pharmacy" element={<MainLayout><Pharmacy /></MainLayout>} />
      <Route path="/patient/vital-reports" element={<MainLayout><VitalReports /></MainLayout>} />
      <Route path="/patient/devices" element={<MainLayout><DeviceIntegration /></MainLayout>} />
      <Route path="/patient/documents" element={<MainLayout><UploadedDocuments /></MainLayout>} />
      <Route path="/patient/network-hospitals" element={<MainLayout><NetworkHospitals /></MainLayout>} />
      <Route path="/patient/buy-insurance" element={<MainLayout><BuyInsurance /></MainLayout>} />
      <Route path="/patient/claims" element={<MainLayout><ClaimsManagement /></MainLayout>} />
      <Route path="/patient/ai-health-analysis" element={<MainLayout><AIHealthAnalysis /></MainLayout>} />
      <Route path="/patient/wellness-challenges" element={<EmployeeGamification />} />
      <Route path="/wellness-challenges" element={<EmployeeGamification />} />
      <Route path="/patient/wellness-calendar" element={<EmployeeWellnessCalendar />} />
      <Route path="/wellness-calendar" element={<EmployeeWellnessCalendar />} />
      <Route path="/health-risk-assessment" element={<UserHealthRiskAssessment />} />
  
  {/* Billing */}
  <Route path="/billing/checkout" element={<MainLayout><OrderCheckout /></MainLayout>} />
  <Route path="/billing/orders" element={<MainLayout><OrderHistory /></MainLayout>} />
  <Route path="/billing/invoices" element={<MainLayout><MyInvoices /></MainLayout>} />
  <Route path="/billing/orders/:orderId" element={<MainLayout><OrderDetails /></MainLayout>} />
  
  {/* Team */}
  <Route path="/team/login" element={<TeamLogin />} />
  <Route path="/team/dashboard" element={<TeamDashboard />} />
  <Route path="/team/profile" element={<TeamProfile />} />
  <Route path="/team/directory" element={<TeamDirectory />} />
  <Route path="/team/reports" element={<TeamReports />} />
  <Route path="/team/tools" element={<TeamTools />} />
  <Route path="/team/pharmacy-edit" element={<TeamPharmacyEdit />} />
  <Route path="/team/user-management" element={<TeamUserManagementPage />} />
  <Route path="/team/doctor-management" element={<TeamDoctorManagementPage />} />
  <Route path="/team/corporate-management" element={<TeamCorporateManagementPage />} />
  <Route path="/team/hospital-management" element={<TeamHospitalManagementPage />} />
  <Route path="/team/clinic-management" element={<TeamClinicManagementPage />} />
  <Route path="/team/lab-management" element={<TeamLabManagementPage />} />
  <Route path="/team/pharmacy-management" element={<TeamPharmacyManagementPage />} />
  <Route path="/team/chat-analytics" element={<TeamChatAnalyticsPage />} />
  <Route path="/team/support-tickets" element={<TeamSupportTicketsPage />} />
  <Route path="/team/appointments" element={<TeamAppointmentsPage />} />
  <Route path="/team/chat" element={<TeamChatDashboardPage />} />
  <Route path="/team/health-plans" element={<TeamHealthPlansPage />} />
  <Route path="/team/activity" element={<TeamActivityLogsPage />} />
  <Route path="/team/settings" element={<TeamSettingsPage />} />
  <Route path="/admin/team" element={<TeamManagement />} />
  {/* Ambulance */}
  <Route path="/ambulance/dashboard" element={<AmbulanceDashboard />} />
  {/* Homecare */}
  <Route path="/homecare/dashboard" element={<HomecareDashboard />} />
  <Route path="/homecare/patients" element={<HomecarePatientsPage />} />
  <Route path="/homecare/patients/new" element={<HomecarePatientsPage />} />
  <Route path="/homecare/care-plans" element={<HomecareCarePlansPage />} />
  <Route path="/homecare/appointments" element={<HomecareAppointmentsPage />} />
  <Route path="/homecare/staff" element={<HomecareStaffPage />} />
  <Route path="/homecare/services" element={<HomecareServicesPage />} />
  <Route path="/homecare/billing" element={<HomecareBillingPage />} />
  <Route path="/homecare/inventory" element={<HomecareInventoryPage />} />
  <Route path="/homecare/reports" element={<HomecareReportsPage />} />
  <Route path="/homecare/settings" element={<HomecareSettingsPage />} />
  <Route path="/homecare/support" element={<HomecareSupportPage />} />
  {/* Nurse */}
  <Route path="/nurse/login" element={<NurseLogin />} />
  <Route path="/nurse/dashboard" element={<MainLayout><NurseDashboard /></MainLayout>} />
  <Route path="/nurse/patients" element={<MainLayout><NursePatients /></MainLayout>} />
  <Route path="/nurse/vitals" element={<MainLayout><NurseVitals /></MainLayout>} />
  <Route path="/nurse/medications" element={<MainLayout><NurseMedications /></MainLayout>} />
  <Route path="/nurse/notes" element={<MainLayout><NurseNotes /></MainLayout>} />
  <Route path="/nurse/appointments" element={<MainLayout><NurseAppointments /></MainLayout>} />
  <Route path="/nurse/register-patient" element={<MainLayout><NurseRegisterPatient /></MainLayout>} />
  {/* Assistant */}
  <Route path="/assistant/login" element={<AssistantLogin />} />
  <Route path="/assistant/dashboard" element={<MainLayout><AssistantDashboard /></MainLayout>} />
  <Route path="/assistant/register-patient" element={<MainLayout><AssistantRegisterPatient /></MainLayout>} />
  <Route path="/assistant/patients" element={<MainLayout><AssistantPatients /></MainLayout>} />
  <Route path="/assistant/appointments" element={<MainLayout><AssistantAppointments /></MainLayout>} />
  <Route path="/assistant/prescriptions" element={<MainLayout><AssistantPrescriptions /></MainLayout>} />
  <Route path="/assistant/billing" element={<MainLayout><AssistantBilling /></MainLayout>} />
  <Route path="/assistant/messages" element={<MainLayout><AssistantMessages /></MainLayout>} />
  <Route path="/assistant/orders" element={<MainLayout><OrderTasks /></MainLayout>} />
  <Route path="/assistant/reports" element={<MainLayout><AssistantReports /></MainLayout>} />
  <Route path="/assistant/profile" element={<MainLayout><AssistantDashboard /></MainLayout>} />
  {/* Patient Registration */}
  <Route path="/admin/register-patient" element={<AdminRegisterPatient />} />
  {/* Admin */}
  <Route path="/admin/manage-assistants" element={<AdminManageAssistants />} />
  <Route path="/admin/login" element={<AdminLogin />} />
  <Route path="/admin/test" element={<SimpleAdminDashboard />} />
  <Route path="/admin/system-test" element={<AdminTestPage />} />
  <Route path="/admin/comprehensive" element={<ComprehensiveAdminDashboard />} />
  <Route path="/admin/doctors" element={<DoctorsManagement />} />
  <Route path="/admin/users" element={<UsersManagement />} />
  <Route path="/admin/team" element={<TeamManagement />} />
  <Route path="/admin/team-privileges" element={<TeamPrivileges />} />
  <Route path="/admin/chat" element={<AdminChatDashboard />} />
  <Route path="/admin/appointments" element={<AdminAppointments />} />
  <Route path="/admin/plans" element={<AdminPlans />} />
  <Route path="/admin/insurance" element={<AdminInsurance />} />
  <Route path="/admin/workflow-automation" element={<AdminWorkflowAutomation />} />
  <Route path="/admin/insurer" element={<InsurerManagement />} />
  <Route path="/admin/tpa" element={<TPAManagement />} />
  <Route path="/admin/hospitals" element={<HospitalsManagement />} />
  <Route path="/admin/clinics" element={<ClinicsManagement />} />
  <Route path="/admin/corporates" element={<CorporatesManagement />} />
  <Route path="/admin/corporate-health-packages" element={<CorporateHealthPackages />} />
  <Route path="/admin/corporate-employees" element={<CorporateEmployeesManagement />} />
  <Route path="/admin/corporate-plans" element={<CorporatePlansManagement />} />
  <Route path="/admin/pharmacies" element={<PharmaciesManagement />} />
  <Route path="/admin/homecare" element={<HomecareManagement />} />
  <Route path="/admin/ambulance" element={<AmbulanceManagement />} />
  <Route path="/admin/medivac" element={<MedivacManagement />} />
  <Route path="/admin/ngo" element={<NGOManagement />} />
  <Route path="/admin/psu" element={<PSUManagement />} />
  <Route path="/admin/ohc" element={<OHCManagement />} />
  <Route path="/admin/labs" element={<LabsManagement />} />
  <Route path="/admin/billing" element={<BillingManagement />} />
  <Route path="/admin/accounting" element={<AccountingManagement />} />
  <Route path="/admin/payments" element={<PaymentManagement />} />
  <Route path="/admin/email" element={<EmailManagement />} />
  <Route path="/admin/activity-log" element={<ActivityLog />} />
  <Route path="/admin/module-access" element={<ModuleAccessControl />} />
  <Route path="/admin/auth-test" element={<AdminAuthTest />} />
  <Route path="/admin/sms" element={<SMSManagement />} />
  <Route path="/admin/whatsapp" element={<WhatsAppManagement />} />
  <Route path="/admin/video" element={<VideoManagement />} />
  <Route path="/admin/voice" element={<VoiceCallManagement />} />
  <Route path="/admin/tickets" element={<TicketManagement />} />
  <Route path="/admin/tickets/:id" element={<TicketManagement />} />
  <Route path="/admin/health-risk" element={<AdminHealthRiskAssessment />} />
  <Route path="/diagnostic" element={<ConnectionDiagnostic />} />
  <Route path="/admin/reports" element={<ReportsPage />} />
  <Route path="/admin/crm" element={<CRMPage />} />
  <Route path="/admin/crm/lead/:id" element={<CRMLeadDetail />} />
  <Route path="/admin/settings" element={<SettingsPage />} />
  {/* Admin dashboard routes - placed at end to avoid catching all /admin/* routes */}
  <Route path="/admin/dashboard" element={<AdminDashboardHome />} />
  <Route path="/admin" element={<AdminDashboardHome />} />
  <Route path="/corporate/dashboard" element={<CorporateDashboard />} />
  <Route path="/corporate/benefits" element={<CorporateBenefits />} />
  <Route path="/corporate/login" element={<CorporateLogin />} />
  <Route path="/corporate/employees" element={<CorporateEmployees />} />
  <Route path="/corporate/appointments" element={<CorporateAppointments />} />
  <Route path="/corporate/health-analysis" element={<CorporateHealthAnalysis />} />
  <Route path="/corporate/departments" element={<CorporateDepartments />} />
  <Route path="/corporate/claims" element={<CorporateClaims />} />
  <Route path="/corporate/reports" element={<CorporateReports />} />
  <Route path="/corporate/complaints" element={<CorporateComplaints />} />
  <Route path="/corporate/compliance" element={<CorporateCompliance />} />
  <Route path="/corporate/notifications" element={<CorporateNotifications />} />
  <Route path="/corporate/settings" element={<CorporateSettings />} />
  <Route path="/corporate/help" element={<CorporateHelp />} />
  <Route path="/corporate/health-risk-assessment" element={<CorporateHealthRiskAssessment />} />
  <Route path="/corporate/gamification" element={<CorporateGamification />} />
  <Route path="/corporate/wellness-calendar" element={<CorporateWellnessCalendar />} />
  {/* TPA Routes - Main routes defined above */}
  {/* PSU Routes */}
  <Route path="/psu/login" element={<PSULogin />} />
  {/* Insurer Routes */}
  <Route path="/insurer/login" element={<InsurerLogin />} />
  {/* NGO Routes */}
  <Route path="/ngo/login" element={<NGOLogin />} />  <Route path="/corporate/support" element={<CorporateSupport />} />
  <Route path="/hospital/dashboard" element={<HospitalDashboard />} />
  <Route path="/hospital/practice-management" element={<HospitalPracticeManagement />} />
  <Route path="/hospital/insurance-billing" element={<HospitalInsuranceBilling />} />
  <Route path="/hospital/mrd" element={<HospitalMRD />} />
  <Route path="/hospital/ehr" element={<HospitalEHR />} />
  <Route path="/hospital/lab-order" element={<HospitalLabOrder />} />
  <Route path="/hospital/imaging-order" element={<HospitalImagingOrder />} />
  <Route path="/hospital/prescription-creator" element={<HospitalPrescriptionCreator />} />
  <Route path="/hospital/procedure-adder" element={<HospitalProcedureAdder />} />
  <Route path="/hospital/appointments" element={<HospitalAppointmentsPage />} />
  <Route path="/hospital/beds" element={<HospitalBedsPage />} />
  <Route path="/hospital/patients" element={<HospitalPatientsPage />} />
  <Route path="/hospital/doctors" element={<HospitalDoctorsPage />} />
  <Route path="/hospital/opd-ipd" element={<HospitalOpdIpdPage />} />
  <Route path="/hospital/pharmacy" element={<HospitalPharmacyPage />} />
  <Route path="/hospital/lab-reports" element={<HospitalLabReportsPage />} />
  <Route path="/hospital/billing" element={<HospitalBillingPage />} />
  <Route path="/hospital/claims" element={<HospitalClaimsPage />} />
  <Route path="/hospital/staff" element={<HospitalStaffPage />} />
  <Route path="/hospital/notifications" element={<HospitalNotifications />} />
  <Route path="/hospital/settings" element={<HospitalSettingsPage />} />
  <Route path="/hospital/support" element={<HospitalSupportPage />} />
  <Route path="/hospital/login" element={<HospitalLogin />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

export default AppRoutes; 
