import { lazy, Suspense, type ComponentType } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';

const named = <T extends Record<string, unknown>>(load: () => Promise<T>, name: keyof T) =>
  lazy(() => load().then((m) => ({ default: m[name] as ComponentType })));

const modules = () => import('@/pages/crm/CRMModulePages');
const growth = () => import('@/pages/crm/HospitalCRMGrowthDomainPages');
const operations = () => import('@/pages/crm/HospitalCRMOperationsPages');
const referral = () => import('@/pages/crm/ReferralNetworkPages');

const ToolPage = lazy(() => import('@/pages/crm/shared/ToolFrame'));
const CRMLogin = lazy(() => import('@/pages/crm/CRMLogin'));
const CRMForgotPassword = lazy(() => import('@/pages/crm/CRMForgotPassword'));
const HospitalCRMFoundationPage = lazy(() => import('@/pages/crm/HospitalCRMFoundationPage'));
const HospitalCRMWorldclassPage = lazy(() => import('@/pages/crm/HospitalCRMWorldclassPage'));
const HospitalCRMCommunicationHubPage = lazy(() => import('@/pages/crm/HospitalCRMCommunicationHubPage'));
const HospitalCRMGrowthPage = lazy(() => import('@/pages/crm/HospitalCRMGrowthPage'));
const CRMEmailPage = lazy(() => import('@/pages/crm/CRMEmailPage'));
const CRMAIInsightsPage = lazy(() => import('@/pages/crm/CRMAIInsightsPage'));
const CRMFieldForcePage = lazy(() => import('@/pages/crm/CRMFieldForcePage'));
const CRMContactCenterPage = lazy(() => import('@/pages/crm/CRMContactCenterPage'));
const CRMTelecallerDialer = lazy(() => import('@/pages/crm/CRMTelecallerDialer'));
const CRMMarketingCopilotPage = lazy(() => import('@/pages/crm/CRMMarketingCopilotPage'));
const CRMOperatorPage = lazy(() => import('@/pages/crm/CRMOperatorPage'));
const CRMFlowBuilderPage = lazy(() => import('@/pages/crm/CRMFlowBuilderPage'));
const CRMSocialGrowthPage = lazy(() => import('@/pages/crm/CRMSocialGrowthPage'));
const CRMSocialContentPage = lazy(() => import('@/pages/crm/CRMSocialContentPage'));

const HospitalCRMSpecialtyPage = named(growth, 'HospitalCRMSpecialtyPage');
const CallCentrePage = lazy(() => import('@/pages/crm/CallCentrePage'));
const DoctorsPage = named(referral, 'DoctorsPage');
const DoctorProfilePage = named(referral, 'DoctorProfilePage');
const ReferralNetworkPage = named(referral, 'ReferralNetworkPage');
const FieldActivityPage = named(referral, 'FieldActivityPage');
const EventsPage = named(referral, 'EventsPage');
const HospitalCRMDiagnosticPage = named(growth, 'HospitalCRMDiagnosticPage');
const HospitalCRMDigitalHubPage = named(growth, 'HospitalCRMDigitalHubPage');
const HospitalCRMOperationsPage = named(operations, 'HospitalCRMOperationsPage');
const HospitalCRMEngagementPage = named(operations, 'HospitalCRMEngagementPage');
const HospitalCRMAcquisitionPage = named(operations, 'HospitalCRMAcquisitionPage');
const HospitalCRMExperiencePage = named(operations, 'HospitalCRMExperiencePage');
const HospitalCRMPeoplePage = named(operations, 'HospitalCRMPeoplePage');
const HospitalCRMGovernancePage = named(operations, 'HospitalCRMGovernancePage');
const CRMLeadsPage = named(modules, 'CRMLeadsPage');
const CRMDealsPage = named(modules, 'CRMDealsPage');
const CRMContactsPage = named(modules, 'CRMContactsPage');
const CRMActivitiesPage = named(modules, 'CRMActivitiesPage');
const CRMPipelinePage = named(modules, 'CRMPipelinePage');
const CRMReportsPage = named(modules, 'CRMReportsPage');
const CRMSettingsPage = named(modules, 'CRMSettingsPage');
const CRMTeamPage = named(modules, 'CRMTeamPage');

const RETIRED: Record<string, string> = {
  '/crm/campaigns': '#campaigns', '/crm/campaigns/new': '#campaigns', '/crm/campaigns/:id': '#campaigns',
  '/crm/campaigns/:id/analytics': '#campaigns', '/crm/senders': '#campaigns',
  '/crm/lists': '#audiences', '/crm/lists/:id': '#audiences', '/crm/suppressions': '#audiences',
  '/crm/hospital/segments': '#audiences',
  '/crm/templates': '#templates',
  '/crm/hospital/automations': '#automations',
};

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

const Loading = () => <div className="min-h-screen bg-[#0a0e1a]" aria-busy="true" />;

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<Navigate to="/crm/login" replace />} />
            <Route path="/crm" element={<Navigate to="/crm/login" replace />} />
            <Route path="/crm/login" element={<CRMLogin />} />
            <Route path="/crm/forgot-password" element={<CRMForgotPassword />} />

            {/* The tool pages (plain HTML under /crm-tools) shown inside the CRM's own menu and header. */}
            <Route path="/crm/dashboard" element={<ToolPage tool="home" title="Dashboard" />} />
            <Route path="/crm/inbox" element={<ToolPage tool="inbox" title="Inbox" />} />
            <Route path="/crm/engage" element={<ToolPage tool="engage" title="Engage" />} />
            <Route path="/crm/calls" element={<ToolPage tool="calls" title="Calls" />} />
            <Route path="/crm/whatsapp" element={<ToolPage tool="whatsapp" title="WhatsApp templates" />} />

            <Route path="/crm/leads" element={<CRMLeadsPage />} />
            <Route path="/crm/deals" element={<CRMDealsPage />} />
            <Route path="/crm/contacts" element={<CRMContactsPage />} />
            <Route path="/crm/activities" element={<CRMActivitiesPage />} />
            <Route path="/crm/pipeline" element={<CRMPipelinePage />} />
            <Route path="/crm/reports" element={<CRMReportsPage />} />
            <Route path="/crm/settings" element={<CRMSettingsPage />} />
            <Route path="/crm/team" element={<CRMTeamPage />} />
            <Route path="/crm/emails" element={<CRMEmailPage />} />
            {/* Retired 2026-11-15 (medstar-crm 1dd8bc7): one canonical table and screen per concept, in Engage.
                The server refuses writes to the old campaign, list, template, sender and suppression APIs
                (410 moved_to_engage), so these addresses open the matching Engage tab instead. */}
            {Object.entries(RETIRED).map(([path, hash]) => (
              <Route key={path} path={path} element={<Navigate to={{ pathname: '/crm/engage', hash }} replace />} />
            ))}
            <Route path="/crm/ai-insights" element={<CRMAIInsightsPage />} />
            <Route path="/crm/marketing-copilot" element={<CRMMarketingCopilotPage />} />
            <Route path="/crm/field-force" element={<CRMFieldForcePage />} />
            <Route path="/crm/call-centre" element={<CallCentrePage />} />
            <Route path="/crm/doctors" element={<DoctorsPage />} />
            <Route path="/crm/doctors/:id" element={<DoctorProfilePage />} />
            <Route path="/crm/referral-network" element={<ReferralNetworkPage />} />
            <Route path="/crm/field-activity" element={<FieldActivityPage />} />
            <Route path="/crm/events" element={<EventsPage />} />
            <Route path="/crm/contact-center" element={<CRMContactCenterPage />} />
            <Route path="/crm/dialer" element={<CRMTelecallerDialer />} />
            <Route path="/crm/agent" element={<CRMOperatorPage />} />
            <Route path="/crm/flow-builder" element={<CRMFlowBuilderPage />} />
            <Route path="/crm/social-growth" element={<CRMSocialGrowthPage />} />
            <Route path="/crm/social-content" element={<CRMSocialContentPage />} />

            <Route path="/crm/hospital" element={<HospitalCRMFoundationPage />} />
            <Route path="/crm/hospital/command-center" element={<HospitalCRMWorldclassPage />} />
            <Route path="/crm/hospital/communication-hub" element={<HospitalCRMCommunicationHubPage />} />
            <Route path="/crm/hospital/growth" element={<HospitalCRMGrowthPage />} />
            <Route path="/crm/hospital/specialties" element={<HospitalCRMSpecialtyPage />} />
            <Route path="/crm/hospital/diagnostics" element={<HospitalCRMDiagnosticPage />} />
            <Route path="/crm/hospital/digital" element={<HospitalCRMDigitalHubPage />} />
            <Route path="/crm/hospital/operations" element={<HospitalCRMOperationsPage />} />
            <Route path="/crm/hospital/engagement" element={<HospitalCRMEngagementPage />} />
            <Route path="/crm/hospital/acquisition" element={<HospitalCRMAcquisitionPage />} />
            <Route path="/crm/hospital/experience" element={<HospitalCRMExperiencePage />} />
            <Route path="/crm/hospital/people" element={<HospitalCRMPeoplePage />} />
            <Route path="/crm/hospital/governance" element={<HospitalCRMGovernancePage />} />

            <Route path="*" element={<Navigate to="/crm/dashboard" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
      <Toaster />
    </QueryClientProvider>
  );
}
