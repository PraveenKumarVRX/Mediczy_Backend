import { Navigate, useParams } from 'react-router-dom';
import { useClinicalPaths } from '@/hooks/useClinicalPaths';

/**
 * Legacy inpatient workspace — redirects to Living Patient Workspace (HealthOS).
 */
export default function InpatientWorkspace() {
  const { patientId } = useParams<{ patientId: string }>();
  const paths = useClinicalPaths();

  if (!patientId) {
    return <Navigate to="/hospital/patients" replace />;
  }

  return <Navigate to={`${paths.patientHealthos(patientId)}?mode=ops`} replace />;
}
