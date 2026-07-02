/**
 * Doctor portal SOAP panel — wraps shared ClinicalSoapNotePanel.
 */
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import ClinicalSoapNotePanel from '@/components/clinical/ClinicalSoapNotePanel';

type Props = {
  patientId?: number;
  admissionId?: number;
};

export default function ClinicalWorkflowPanel({ patientId: initialPatientId, admissionId }: Props) {
  const [searchParams] = useSearchParams();
  const fromUrl = searchParams.get('patientId');
  const [patientId, setPatientId] = useState(
    initialPatientId ? String(initialPatientId) : fromUrl || ''
  );

  if (!patientId) {
    return (
      <div className="space-y-3 max-w-md">
        <Label>Patient ID</Label>
        <Input
          type="number"
          placeholder="Enter patient ID to start SOAP note"
          value={patientId}
          onChange={(e) => setPatientId(e.target.value)}
        />
        <p className="text-sm text-muted-foreground">
          Or open from an inpatient workspace via Write Note.
        </p>
      </div>
    );
  }

  return (
    <ClinicalSoapNotePanel
      patientId={Number(patientId)}
      admissionId={admissionId}
      noteType="opd_note"
      apiBase="doctor"
    />
  );
}
