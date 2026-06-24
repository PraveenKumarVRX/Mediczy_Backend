import HospitalLayout from '@/components/hospital/HospitalLayout';
import DoctorVoiceScribe from '@/pages/doctor/DoctorVoiceScribe';

/** AI Scribe embedded in hospital portal context */
export default function HospitalAIScribe() {
  return (
    <HospitalLayout>
      <div className="min-h-[80vh]">
        <DoctorVoiceScribe />
      </div>
    </HospitalLayout>
  );
}
