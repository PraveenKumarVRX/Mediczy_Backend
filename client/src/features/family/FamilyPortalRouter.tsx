import { Routes, Route, Navigate } from 'react-router-dom';
import FamilyPortalShell from '@/layouts/FamilyPortalShell';
import FamilyLogin from '@/features/family/pages/FamilyLogin';
import FamilyPatientHome from '@/features/family/pages/FamilyPatientHome';
import FamilyProgress from '@/features/family/pages/FamilyProgress';
import FamilyEducation from '@/features/family/pages/FamilyEducation';
import FamilyDischarge from '@/features/family/pages/FamilyDischarge';
import FamilyMessages from '@/features/family/pages/FamilyMessages';

export default function FamilyPortalRouter() {
  return (
    <Routes>
      <Route path="login" element={<FamilyLogin />} />
      <Route element={<FamilyPortalShell />}>
        <Route path="patient/:id" element={<FamilyPatientHome />} />
        <Route path="patient/:id/progress" element={<FamilyProgress />} />
        <Route path="patient/:id/education" element={<FamilyEducation />} />
        <Route path="patient/:id/discharge" element={<FamilyDischarge />} />
        <Route path="patient/:id/messages" element={<FamilyMessages />} />
      </Route>
      <Route path="*" element={<Navigate to="/family/login" replace />} />
    </Routes>
  );
}
