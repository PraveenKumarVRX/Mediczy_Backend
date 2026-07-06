import { Navigate, useSearchParams } from 'react-router-dom';

/** Legacy /doctor/health-records → patient workspace or patient list */
export default function DoctorHealthRecordsRedirect() {
  const [params] = useSearchParams();
  const patientId = params.get('patientId');
  if (patientId) {
    return <Navigate to={`/doctor/patient/${patientId}/healthos`} replace />;
  }
  return <Navigate to="/doctor/patients" replace />;
}
