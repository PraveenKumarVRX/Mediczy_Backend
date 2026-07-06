/**
 * HyperGrid imaging study list — launches OHIF in separate tab (not embedded).
 */
import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, FileText, ScanLine, Calendar, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import api from '@/utils/api';
import { useToast } from '@/hooks/use-toast';
import { openOhifViewer } from '@/utils/imagingViewer';

interface HypergridStudy {
  study_instance_uid: string;
  patient_name?: string;
  patient_id?: string | number;
  modality?: string;
  study_date?: string;
  study_description?: string;
  instance_count?: number;
}

interface WorklistItem {
  id: number;
  patient_name: string;
  modality: string;
  scheduled_date: string;
  status: string;
  requested_procedure?: string;
}

interface ImagingStudyPanelProps {
  patientId?: string | number;
}

export default function ImagingStudyPanel({ patientId }: ImagingStudyPanelProps) {
  const { toast } = useToast();
  const [tab, setTab] = useState<'studies' | 'worklist' | 'report'>('studies');
  const [studies, setStudies] = useState<HypergridStudy[]>([]);
  const [worklist, setWorklist] = useState<WorklistItem[]>([]);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [findings, setFindings] = useState('');
  const [impression, setImpression] = useState('');
  const [saving, setSaving] = useState(false);

  const loadStudies = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { limit: '50' };
      if (patientId) params.patientId = String(patientId);
      const { data } = await api.get('/hypergrid/dicom/studies', { params });
      setStudies(data.studies || []);
    } catch {
      toast({ title: 'Failed to load imaging studies', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [patientId, toast]);

  const loadWorklist = useCallback(async () => {
    try {
      const { data } = await api.get('/hypergrid/dicom/worklist');
      setWorklist(data.worklist || []);
    } catch {
      toast({ title: 'Failed to load worklist', variant: 'destructive' });
    }
  }, [toast]);

  useEffect(() => {
    loadStudies();
    loadWorklist();
  }, [loadStudies, loadWorklist]);

  const saveReport = async () => {
    if (!selectedUid || !findings.trim()) {
      toast({ title: 'Findings required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await api.post(`/hypergrid/dicom/studies/${encodeURIComponent(selectedUid)}/report`, {
        findings,
        impression,
      });
      toast({ title: 'Report saved' });
      setFindings('');
      setImpression('');
    } catch {
      toast({ title: 'Failed to save report', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { id: 'studies' as const, label: 'Studies', icon: ScanLine },
    { id: 'worklist' as const, label: 'Worklist', icon: Calendar },
    { id: 'report' as const, label: 'Report', icon: FileText },
  ];

  return (
    <div className="flex flex-col h-full gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        {tabs.map(({ id, label, icon: Icon }) => (
          <Button key={id} variant={tab === id ? 'default' : 'outline'} size="sm" onClick={() => setTab(id)}>
            <Icon className="h-4 w-4 mr-1" /> {label}
          </Button>
        ))}
        <Button variant="ghost" size="sm" onClick={() => { loadStudies(); loadWorklist(); }} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {tab === 'studies' && (
        <ScrollArea className="flex-1 border rounded-lg">
          <div className="p-2 space-y-1">
            {studies.map((s) => (
              <div key={s.study_instance_uid} className="p-3 rounded-lg border border-border flex items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{s.patient_name || 'Unknown'}</span>
                    {s.modality && <Badge variant="secondary">{s.modality}</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">{s.study_description || s.study_instance_uid}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => openOhifViewer(s.study_instance_uid)}>
                  <ExternalLink className="h-4 w-4 mr-1" /> OHIF
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}

      {tab === 'worklist' && (
        <ScrollArea className="flex-1 border rounded-lg">
          <div className="p-2 space-y-1">
            {worklist.map((w) => (
              <div key={w.id} className="p-3 rounded-lg border border-border">
                <div className="flex justify-between">
                  <span className="font-medium">{w.patient_name}</span>
                  <Badge>{w.modality}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{w.scheduled_date} · {w.status}</p>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}

      {tab === 'report' && (
        <div className="flex flex-col gap-3 flex-1">
          <Input placeholder="Study UID" value={selectedUid || ''} onChange={(e) => setSelectedUid(e.target.value)} />
          <Textarea placeholder="Findings *" value={findings} onChange={(e) => setFindings(e.target.value)} rows={6} />
          <Textarea placeholder="Impression" value={impression} onChange={(e) => setImpression(e.target.value)} rows={3} />
          <Button onClick={saveReport} disabled={saving}>{saving ? 'Saving…' : 'Save radiology report'}</Button>
        </div>
      )}
    </div>
  );
}
