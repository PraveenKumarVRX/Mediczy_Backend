import ClinicLayout from '@/components/clinic/ClinicLayout';
import PortalQmsPage from '@/components/qms/PortalQmsPage';

/** Clinic portal QMS — tokens + Aadhaar QR check-in on shared queue engine. */
export default function ClinicQmsPage() {
  return (
    <PortalQmsPage
      portal="clinic"
      title="Queue Management"
      subtitle="Clinic tokens · Aadhaar QR check-in · call next"
      Layout={ClinicLayout}
    />
  );
}

export { ClinicQmsPage };
