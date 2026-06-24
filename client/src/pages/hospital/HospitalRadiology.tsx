import { useNavigate } from 'react-router-dom';
import HospitalLayout from '@/components/hospital/HospitalLayout';
import LabRIS from '@/pages/lab/LabRIS';

export default function HospitalRadiology() {
  const navigate = useNavigate();

  return (
    <HospitalLayout>
      <div className="p-2">
        <div className="px-4 py-2 flex items-center justify-between border-b mb-2">
          <h1 className="font-semibold text-slate-800">RIS / PACS — DICOM Worklist</h1>
          <button className="text-sm text-teal-600" onClick={() => navigate('/hospital/os')}>← Hospital OS</button>
        </div>
        <LabRIS />
      </div>
    </HospitalLayout>
  );
}
