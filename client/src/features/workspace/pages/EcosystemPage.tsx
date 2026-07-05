import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { useWorkspace } from '@/features/workspace/hooks/useWorkspace';
import { syncFhirLabs, listPatientImaging } from '@/services/workspace.service';
import { useClinicalPaths } from '@/hooks/useClinicalPaths';
import { useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

export default function EcosystemPage() {
  const { workspace, refresh, patientId, actionLoading, setActionLoading } = useWorkspace();
  const paths = useClinicalPaths();
  const { patientId: pidParam } = useParams();
  const [imagingStudies, setImagingStudies] = useState<any[]>([]);

  useEffect(() => {
    listPatientImaging(patientId).then((r) => setImagingStudies(r?.data || [])).catch(() => {});
  }, [patientId]);

  const syncLabs = async () => {
    setActionLoading('labs');
    try {
      await syncFhirLabs(patientId);
      await refresh();
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <Button size="sm" variant="outline" onClick={syncLabs} disabled={actionLoading === 'labs'}>
          {actionLoading === 'labs' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Sync FHIR labs
        </Button>
        <Button size="sm" variant="outline" asChild>
          <Link to={paths.passport(pidParam!)}>Medical Passport</Link>
        </Button>
        <Button size="sm" variant="outline" asChild>
          <Link to={paths.globalBoard(pidParam!)}>Global Board</Link>
        </Button>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Homecare & Monitoring</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Wearables and home visits appear in the Monitoring tab when synced.
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Medical Passport</CardTitle></CardHeader>
          <CardContent className="text-sm">
            {workspace?.medicalPassport ? (
              <>
                <p className="font-mono text-xs text-teal-700">{workspace.medicalPassport.careos_patient_id}</p>
                <p className="text-muted-foreground mt-1">{workspace.medicalPassport.summary_text || 'Synced profile'}</p>
              </>
            ) : (
              <p className="text-muted-foreground">Passport not synced</p>
            )}
          </CardContent>
        </Card>
        <Card className="md:col-span-2">
          <CardHeader><CardTitle className="text-base">Imaging (DICOMweb)</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            {imagingStudies.slice(0, 5).map((s: any) => (
              <p key={s.studyUID || s.id}>{s.modality || 'IMG'} — {s.study_description || s.studyUID}</p>
            ))}
            {!imagingStudies.length && <p className="text-muted-foreground">No studies</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
