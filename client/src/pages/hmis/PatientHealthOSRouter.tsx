import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { WorkspaceProvider } from '@/features/workspace/context/WorkspaceProvider';
import ClinicalShell from '@/layouts/ClinicalShell';
import WorkspaceOverview from '@/features/workspace/pages/WorkspaceOverview';
import ClinicalTimelinePage from '@/features/workspace/pages/ClinicalTimelinePage';
import HumanCareTeamPage from '@/features/workspace/pages/HumanCareTeamPage';
import AICareTeamPage from '@/features/workspace/pages/AICareTeamPage';
import CareTasksPage from '@/features/workspace/pages/CareTasksPage';
import TreatmentPathwayPage from '@/features/workspace/pages/TreatmentPathwayPage';
import PatientMonitoringPage from '@/features/workspace/pages/PatientMonitoringPage';
import ResultsHubPage from '@/features/workspace/pages/ResultsHubPage';
import ClinicalPlaybackPage from '@/features/workspace/pages/ClinicalPlaybackPage';
import MDTSessionPage from '@/features/workspace/pages/MDTSessionPage';
import FamilyPublishPage from '@/features/workspace/pages/FamilyPublishPage';
import EcosystemPage from '@/features/workspace/pages/EcosystemPage';

/** Nested routes for /:portal/patient/:patientId/healthos/* */
export default function PatientHealthOSRouter() {
  const { patientId } = useParams<{ patientId: string }>();
  const pid = Number(patientId);

  if (!patientId || Number.isNaN(pid)) {
    return <Navigate to="/hospital/patients" replace />;
  }

  return (
    <WorkspaceProvider patientId={pid}>
      <Routes>
        <Route element={<ClinicalShell />}>
          <Route index element={<WorkspaceOverview />} />
          <Route path="timeline" element={<ClinicalTimelinePage />} />
          <Route path="team" element={<HumanCareTeamPage />} />
          <Route path="ai-team" element={<AICareTeamPage />} />
          <Route path="tasks" element={<CareTasksPage />} />
          <Route path="pathway" element={<TreatmentPathwayPage />} />
          <Route path="monitoring" element={<PatientMonitoringPage />} />
          <Route path="results" element={<ResultsHubPage />} />
          <Route path="playback" element={<ClinicalPlaybackPage />} />
          <Route path="mdt" element={<MDTSessionPage />} />
          <Route path="family" element={<FamilyPublishPage />} />
          <Route path="ecosystem" element={<EcosystemPage />} />
        </Route>
      </Routes>
    </WorkspaceProvider>
  );
}
