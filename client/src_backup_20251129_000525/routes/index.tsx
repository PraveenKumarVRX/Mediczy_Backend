import { Routes, Route } from "react-router-dom";
import Index from "@/pages/Index";
import UserLogin from "@/auth/UserLogin";
import DoctorLogin from "@/auth/DoctorLogin";
import Register from "@/auth/Register";
import DocRegister from "@/auth/DocRegister";
import Profile from "@/pages/Profile";
import HealthTracker from "@/pages/HealthTracker";
import Symptoms from "@/pages/Symptoms";
import Medicine from "@/pages/Medicine";
// Temporarily disabled video chat components due to missing dependencies
import ChatCall from "@/pages/chat/VideoChat";
import ChatCallDoctor from "@/pages/chat/VideoChatdoctor";

import AiDoctor from "@/pages/AiDoctor";
import Consultation from "@/pages/Consultation";
import Ayushman from "@/pages/Ayushman";
import NotFound from "@/pages/NotFound";
import Emergency from "@/pages/Emergency";
import ConsultationBooking from "@/pages/ConsultationBooking";
import MyBookings from "@/pages/MyBookings";
import HealthFeedPage from "@/pages/HealthFeedPage";
import RepostsPage from "@/pages/Reposts";
import MyPlans from "@/pages/MyPlans";
import Diet from "@/pages/Diet";
import CalorieCalculator from "@/pages/CalorieCalculator";
import DoctorDashboard from "@/pages/doctor/DoctorDashboard";
import DoctorAppointments from "@/pages/doctor/DoctorAppointments";
import HealthMonitoringDashboard from "@/pages/doctor/HealthMonitoringDashboard";
import AdminLogin from "@/pages/admin/AdminLogin";
import AdminLoginDebug from "@/pages/admin/AdminLoginDebug";
import AdminLoginFix from "@/pages/admin/AdminLoginFix";
import AdminChatDashboard from "@/pages/admin/AdminChatDashboard";
import AdminLoginSimple from "@/pages/admin/AdminLoginSimple";
import AdminTestPage from '@/pages/admin/AdminTestPage';
import SimpleAdminDashboard from "@/pages/admin/SimpleAdminDashboard";
import AdminAppointments from "@/pages/admin/AdminAppointments";
import AdminDashboard from "@/pages/admin/AdminDashboard";
import AdminDashboardHome from "@/pages/admin/AdminDashboardHome";
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
import HospitalsManagement from '@/pages/admin/HospitalsManagement';
import ClinicsManagement from '@/pages/admin/ClinicsManagement';
import HomecareManagement from '@/pages/admin/HomecareManagement';
import AmbulanceManagement from '@/pages/admin/AmbulanceManagement';
import OHCManagement from '@/pages/admin/OHCManagement';
import TeamLogin from '@/pages/team/TeamLogin';
import TeamDashboard from '@/pages/team/TeamDashboard';
import TeamProfile from '@/pages/team/TeamProfile';
import TeamDirectory from '@/pages/team/TeamDirectory';
import TeamReports from '@/pages/team/TeamReports';
import TeamTools from '@/pages/team/TeamTools';
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
import MainLayout from '@/components/layout/MainLayout';
import AdminRegisterPatient from '@/pages/admin/AdminRegisterPatient';
import AdminManageAssistants from '@/pages/admin/AdminManageAssistants';
import BillingManagement from '@/pages/admin/BillingManagement';
import AccountingManagement from '@/pages/admin/AccountingManagement';
import PaymentManagement from '@/pages/admin/PaymentManagement';
import EmailManagement from '@/pages/admin/EmailManagement';
import ActivityLog from '@/pages/admin/ActivityLog';
import ConnectionDiagnostic from '@/pages/ConnectionDiagnostic';
import AdminAuthTest from '@/pages/admin/AdminAuthTest';
import SMSManagement from '@/pages/admin/SMSManagement';
import WhatsAppManagement from '@/pages/admin/WhatsAppManagement';
import VideoManagement from '@/pages/admin/VideoManagement';
import VoiceCallManagement from '@/pages/admin/VoiceCallManagement';
import TicketManagement from '@/pages/admin/TicketManagement';
import HealthRiskAssessment from '@/pages/admin/HealthRiskAssessment';
// Placeholder pages (reports, crm, settings) still from AdminPlaceholders
import { ReportsPage, SettingsPage } from "@/pages/admin/AdminPlaceholders";
import CRMPage from "@/pages/admin/CRMPage";
import CRMLeadDetail from "@/pages/admin/CRMLeadDetail";
import VideoCallTestSimple from "@/pages/VideoCallTestSimple";
import VideoCallTestBasic from "@/pages/VideoCallTestBasic";
import CorporateDashboard from "@/pages/CorporateDashboard";
import CorporateBenefits from "@/pages/CorporateBenefits";
import OrderTasks from "@/pages/OrderTasks";

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/" element={<Index />} />
        <Route path="/video-test" element={<VideoCallTestSimple />} />
        <Route path="/video-test-basic" element={<VideoCallTestBasic />} />
      <Route path="/login" element={<UserLogin />} />
      <Route path="/doctor-login" element={<DoctorLogin />} />
      <Route path="/register" element={<Register />} />
      <Route path="/doc-register" element={<DocRegister />} />
      <Route path="/doctor-dashboard" element={<DoctorDashboard />} />
      <Route path="/doctor/appointments" element={<DoctorAppointments />} />
      <Route path="/doctor/health-monitoring" element={<HealthMonitoringDashboard />} />
      <Route path="/nurse/dashboard" element={<MainLayout><NurseDashboard /></MainLayout>} />
      <Route path="/assistant/dashboard" element={<MainLayout><AssistantDashboard /></MainLayout>} />
      <Route path="/assistant/orders" element={<MainLayout><OrderTasks /></MainLayout>} />
      <Route path="/profile" element={<Profile />} />
      <Route path="/health-tracker" element={<HealthTracker />} />
      <Route path="/consultation" element={<Consultation />} />
      <Route path="/symptoms" element={<Symptoms />} />
      <Route path="/medicine" element={<Medicine />} />
      {/* Video chat routes */}
      <Route path="/chat" element={<ChatCall />} />
      <Route path="/chatdoctor" element={<ChatCallDoctor />} />

      <Route path="/ai-doctor" element={<AiDoctor />} />
      <Route path="/ayushman" element={<Ayushman />} />
      <Route path="/health-feed" element={<HealthFeedPage />} />
      <Route path="/reposts" element={<RepostsPage />} />
      <Route path="/consultation/:doctorId" element={<ConsultationBooking />} />
      <Route path="/my-bookings" element={<MyBookings />} />
  <Route path="/my-plans" element={<MyPlans />} />
      <Route path="/diet" element={<Diet />} />
      <Route path="/calorie-calculator" element={<CalorieCalculator />} />
  {/* Team */}
  <Route path="/team/login" element={<TeamLogin />} />
  <Route path="/team/dashboard" element={<TeamDashboard />} />
  <Route path="/team/profile" element={<TeamProfile />} />
  <Route path="/team/directory" element={<TeamDirectory />} />
  <Route path="/team/reports" element={<TeamReports />} />
  <Route path="/team/tools" element={<TeamTools />} />
  <Route path="/admin/team" element={<TeamManagement />} />
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
  <Route path="/assistant/dashboard" element={<AssistantDashboard />} />
  <Route path="/assistant/register-patient" element={<AssistantRegisterPatient />} />
  {/* Patient Registration */}
  <Route path="/admin/register-patient" element={<AdminRegisterPatient />} />
  {/* Admin */}
  <Route path="/admin/manage-assistants" element={<AdminManageAssistants />} />
  <Route path="/admin/login" element={<AdminLogin />} />
  <Route path="/admin/login-debug" element={<AdminLoginDebug />} />
  <Route path="/admin/login-fix" element={<AdminLoginFix />} />
  <Route path="/admin/login-simple" element={<AdminLoginSimple />} />
  <Route path="/admin/test" element={<SimpleAdminDashboard />} />
  <Route path="/admin/system-test" element={<AdminTestPage />} />
  <Route path="/admin" element={<AdminDashboardHome />} />
  <Route path="/admin/dashboard" element={<AdminDashboardHome />} />
  <Route path="/admin/doctors" element={<DoctorsManagement />} />
  <Route path="/admin/users" element={<UsersManagement />} />
  <Route path="/admin/team" element={<TeamManagement />} />
  <Route path="/admin/team-privileges" element={<TeamPrivileges />} />
  <Route path="/admin/chat" element={<AdminChatDashboard />} />
  <Route path="/admin/appointments" element={<AdminAppointments />} />
  <Route path="/admin/plans" element={<AdminPlans />} />
  <Route path="/admin/insurance" element={<AdminInsurance />} />
  <Route path="/admin/hospitals" element={<HospitalsManagement />} />
  <Route path="/admin/clinics" element={<ClinicsManagement />} />
  <Route path="/admin/corporates" element={<CorporatesManagement />} />
  <Route path="/admin/corporate-health-packages" element={<CorporateHealthPackages />} />
  <Route path="/admin/corporate-employees" element={<CorporateEmployeesManagement />} />
  <Route path="/admin/corporate-plans" element={<CorporatePlansManagement />} />
  <Route path="/admin/pharmacies" element={<PharmaciesManagement />} />
  <Route path="/admin/homecare" element={<HomecareManagement />} />
  <Route path="/admin/ambulance" element={<AmbulanceManagement />} />
  <Route path="/admin/ohc" element={<OHCManagement />} />
  <Route path="/admin/labs" element={<LabsManagement />} />
  <Route path="/admin/billing" element={<BillingManagement />} />
  <Route path="/admin/accounting" element={<AccountingManagement />} />
  <Route path="/admin/payments" element={<PaymentManagement />} />
  <Route path="/admin/email" element={<EmailManagement />} />
  <Route path="/admin/activity-log" element={<ActivityLog />} />
  <Route path="/admin/auth-test" element={<AdminAuthTest />} />
  <Route path="/admin/sms" element={<SMSManagement />} />
  <Route path="/admin/whatsapp" element={<WhatsAppManagement />} />
  <Route path="/admin/video" element={<VideoManagement />} />
  <Route path="/admin/voice" element={<VoiceCallManagement />} />
  <Route path="/admin/tickets" element={<TicketManagement />} />
  <Route path="/admin/tickets/:id" element={<TicketManagement />} />
  <Route path="/admin/health-risk" element={<HealthRiskAssessment />} />
  <Route path="/diagnostic" element={<ConnectionDiagnostic />} />
  <Route path="/admin/reports" element={<ReportsPage />} />
  <Route path="/admin/crm" element={<CRMPage />} />
  <Route path="/admin/crm/lead/:id" element={<CRMLeadDetail />} />
  <Route path="/admin/settings" element={<SettingsPage />} />
  <Route path="/corporate/dashboard" element={<CorporateDashboard />} />
  <Route path="/corporate/benefits" element={<CorporateBenefits />} />
      <Route path="/emergency" element={<Emergency />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

export default AppRoutes; 