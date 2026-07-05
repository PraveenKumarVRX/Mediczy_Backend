import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { useWorkspace } from '@/features/workspace/hooks/useWorkspace';
import { syncFhirLabs, listPatientImaging } from '@/services/workspace.service';
import { Link } from 'react-router-dom';
import { useClinicalPaths } from '@/hooks/useClinicalPaths';
import { useParams } from 'react-router-dom';

export default function ResultsHubPage() {
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
      <Button size="sm" variant="outline" onClick={syncLabs} disabled={actionLoading === 'labs'}>
        {actionLoading === 'labs' ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
        Sync FHIR labs
      </Button>
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Laboratory</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            {(workspace?.sections?.labs || []).slice(0, 8).map((l: any, i: number) => (
              <p key={i}>{l.test_name || l.test}: {l.result_value || l.value} {l.result_unit || ''}</p>
            ))}
            {!workspace?.sections?.labs?.length && <p className="text-muted-foreground">No lab results synced</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Pharmacy</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            {(workspace?.sections?.pharmacy || []).map((p: any) => (
              <p key={p.id}>{p.drug_name} — <Badge variant="outline" className="text-[10px]">{p.status}</Badge></p>
            ))}
            {!workspace?.sections?.pharmacy?.length && <p className="text-muted-foreground">No pharmacy orders</p>}
          </CardContent>
        </Card>
        <Card className="md:col-span-2">
          <CardHeader><CardTitle className="text-base">DICOMweb Imaging</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            {imagingStudies.slice(0, 8).map((s: any) => (
              <p key={s.studyUID || s.id}>
                {s.modality || 'IMG'} — {s.study_description || s.studyUID}
                <span className="text-muted-foreground text-xs ml-1">({s.instance_count || 0} instances)</span>
              </p>
            ))}
            {!imagingStudies.length && <p className="text-muted-foreground">No DICOM studies — HyperGrid PACS</p>}
            <Button size="sm" variant="link" className="px-0 mt-2" asChild>
              <Link to={paths.passport(pidParam!)}>Medical Passport →</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
