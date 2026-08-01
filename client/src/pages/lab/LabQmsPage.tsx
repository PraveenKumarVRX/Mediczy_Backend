import LabLayout from '@/components/lab/LabLayout';
import PortalQmsPage from '@/components/qms/PortalQmsPage';

/** Lab patient QMS — collection desk tokens + Aadhaar QR (separate from Sample Queue). */
export default function LabQmsPage() {
  return (
    <PortalQmsPage
      portal="lab"
      title="Patient Queue (QMS)"
      subtitle="Lab collection tokens · Aadhaar QR check-in"
      Layout={LabLayout}
    />
  );
}

export { LabQmsPage };
