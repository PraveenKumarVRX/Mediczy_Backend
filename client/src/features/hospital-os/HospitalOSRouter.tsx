import { Navigate, Route, Routes } from 'react-router-dom';
import HospitalOSShell from '@/layouts/HospitalOSShell';
import VoiceCommandPage from '@/features/hospital-os/pages/VoiceCommandPage';
import ApprovalInboxPage from '@/features/hospital-os/pages/ApprovalInboxPage';
import AmbientDocumentationPage from '@/features/hospital-os/pages/AmbientDocumentationPage';
import HospitalTwinPage from '@/features/hospital-os/pages/HospitalTwinPage';
import PatientTwinPage from '@/features/hospital-os/pages/PatientTwinPage';
import ClinicalWhatIfPage from '@/features/hospital-os/pages/ClinicalWhatIfPage';
import KnowledgeGraphExplorerPage from '@/features/hospital-os/pages/KnowledgeGraphExplorerPage';
import SmartRoomConsolePage from '@/features/hospital-os/pages/SmartRoomConsolePage';
import NurseHandoverPage from '@/features/hospital-os/pages/NurseHandoverPage';
import IoTMonitoringHubPage from '@/features/hospital-os/pages/IoTMonitoringHubPage';
import ClinicalTranslatorPage from '@/features/hospital-os/pages/ClinicalTranslatorPage';
import WorkforceAIPage from '@/features/hospital-os/pages/WorkforceAIPage';
import JourneyOptimizerPage from '@/features/hospital-os/pages/JourneyOptimizerPage';
import PharmacyAISafetyPage from '@/features/hospital-os/pages/PharmacyAISafetyPage';
import OTIntelligencePage from '@/features/hospital-os/pages/OTIntelligencePage';
import TelepresenceHubPage from '@/features/hospital-os/pages/TelepresenceHubPage';
import ResearchIntelligencePage from '@/features/hospital-os/pages/ResearchIntelligencePage';
import GovernmentHealthPortalPage from '@/features/hospital-os/pages/GovernmentHealthPortalPage';
import PopulationAnalyticsPage from '@/features/hospital-os/pages/PopulationAnalyticsPage';
import RoboticsGatewayPage from '@/features/hospital-os/pages/RoboticsGatewayPage';
import DigitalFloorMapAdminPage from '@/features/hospital-os/pages/DigitalFloorMapAdminPage';
import WayfindingAdminPage from '@/features/hospital-os/pages/WayfindingAdminPage';
import OSControlPlanePage from '@/features/hospital-os/pages/OSControlPlanePage';

/** Nested routes for /hospital/os/* — Phases 4–10 */
export default function HospitalOSRouter() {
  return (
    <Routes>
      <Route element={<HospitalOSShell />}>
        <Route index element={<Navigate to="voice" replace />} />
        <Route path="voice" element={<VoiceCommandPage />} />
        <Route path="approvals" element={<ApprovalInboxPage />} />
        <Route path="ambient" element={<AmbientDocumentationPage />} />
        <Route path="twin/hospital" element={<HospitalTwinPage />} />
        <Route path="twin/patient" element={<PatientTwinPage />} />
        <Route path="simulator" element={<ClinicalWhatIfPage />} />
        <Route path="knowledge-graph" element={<KnowledgeGraphExplorerPage />} />
        <Route path="smart-rooms" element={<SmartRoomConsolePage />} />
        <Route path="nursing/handover" element={<NurseHandoverPage />} />
        <Route path="iot" element={<IoTMonitoringHubPage />} />
        <Route path="translator" element={<ClinicalTranslatorPage />} />
        <Route path="workforce" element={<WorkforceAIPage />} />
        <Route path="journey" element={<JourneyOptimizerPage />} />
        <Route path="pharmacy-ai" element={<PharmacyAISafetyPage />} />
        <Route path="ot-intelligence" element={<OTIntelligencePage />} />
        <Route path="telepresence" element={<TelepresenceHubPage />} />
        <Route path="research" element={<ResearchIntelligencePage />} />
        <Route path="government" element={<GovernmentHealthPortalPage />} />
        <Route path="population" element={<PopulationAnalyticsPage />} />
        <Route path="robotics" element={<RoboticsGatewayPage />} />
        <Route path="floor-map" element={<DigitalFloorMapAdminPage />} />
        <Route path="wayfinding" element={<WayfindingAdminPage />} />
        <Route path="control" element={<OSControlPlanePage />} />
        <Route path="*" element={<Navigate to="/hospital/os/voice" replace />} />
      </Route>
    </Routes>
  );
}
