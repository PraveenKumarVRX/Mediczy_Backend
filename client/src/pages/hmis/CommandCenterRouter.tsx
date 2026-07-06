import { Routes, Route, Navigate } from 'react-router-dom';
import CommandCenterShell from '@/layouts/CommandCenterShell';
import CommandCenterOverview from '@/features/command/pages/CommandCenterOverview';
import EDBoard from '@/features/command/pages/EDBoard';
import ICUOverview from '@/features/command/pages/ICUOverview';
import OTLiveBoard from '@/features/command/pages/OTLiveBoard';
import DiagnosticsQueue from '@/features/command/pages/DiagnosticsQueue';
import AIRecommendations from '@/features/command/pages/AIRecommendations';

/** Nested routes for /hospital/command-center/* */
export default function CommandCenterRouter() {
  return (
    <Routes>
      <Route element={<CommandCenterShell />}>
        <Route index element={<CommandCenterOverview />} />
        <Route path="ed" element={<EDBoard />} />
        <Route path="icu" element={<ICUOverview />} />
        <Route path="ot" element={<OTLiveBoard />} />
        <Route path="diagnostics" element={<DiagnosticsQueue />} />
        <Route path="ai" element={<AIRecommendations />} />
        <Route path="*" element={<Navigate to="/hospital/command-center" replace />} />
      </Route>
    </Routes>
  );
}
