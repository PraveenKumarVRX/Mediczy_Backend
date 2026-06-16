import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Activity, FileText, FlaskConical, AlertCircle } from 'lucide-react';
import api from '@/utils/api';

interface VitalsRow {
  id: number;
  recorded_at: string;
  bp?: string | null;
  heart_rate?: number | null;
  spo2?: number | null;
  temperature?: number | null;
  blood_glucose?: number | null;
  weight?: number | null;
  notes?: string | null;
}

interface RecordRow {
  id: number;
  date: string;
  type: string;
  status: string;
  diagnosis?: string;
  symptoms?: string;
  notes?: string;
}

interface Props {
  patientId: string | number;
  patientName?: string;
}

function VitalValue({ label, value, unit }: { label: string; value?: number | null; unit: string }) {
  if (value == null) return null;
  return (
    <div className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-800 last:border-0">
      <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
      <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{value} {unit}</span>
    </div>
  );
}

export default function PatientInfoPane({ patientId, patientName }: Props) {
  const id = String(patientId);

  const { data: vitalsData, isLoading: vitalsLoading } = useQuery({
    queryKey: ['patient-vitals', id],
    queryFn: async () => {
      const res = await api.get(`/doctors/my-patients/${id}/vitals-history?limit=5`);
      return (res.data.vitals ?? []) as VitalsRow[];
    },
    enabled: !!id,
    staleTime: 60_000,
  });

  const { data: recordsData, isLoading: recordsLoading } = useQuery({
    queryKey: ['patient-records', id],
    queryFn: async () => {
      const res = await api.get(`/doctors/my-patients/${id}/records`);
      return (res.data.records ?? []) as RecordRow[];
    },
    enabled: !!id,
    staleTime: 60_000,
  });

  const { data: labData, isLoading: labLoading } = useQuery({
    queryKey: ['patient-labs', id],
    queryFn: async () => {
      const res = await api.get(`/doctors/my-patients/${id}/lab-results`);
      return (res.data.labResults ?? []) as { id: number; date: string; test: string; result: string }[];
    },
    enabled: !!id,
    staleTime: 60_000,
  });

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 w-80 min-w-[280px]">
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex-shrink-0">
        <p className="font-semibold text-slate-800 dark:text-white text-sm">
          {patientName || 'Patient'}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400">ID: {id}</p>
      </div>

      <Tabs defaultValue="vitals" className="flex flex-col flex-1 min-h-0">
        <TabsList className="mx-3 mt-2 flex-shrink-0">
          <TabsTrigger value="vitals" className="flex-1 text-xs gap-1">
            <Activity className="w-3 h-3" />
            Vitals
          </TabsTrigger>
          <TabsTrigger value="records" className="flex-1 text-xs gap-1">
            <FileText className="w-3 h-3" />
            Records
          </TabsTrigger>
          <TabsTrigger value="labs" className="flex-1 text-xs gap-1">
            <FlaskConical className="w-3 h-3" />
            Labs
          </TabsTrigger>
        </TabsList>

        {/* Vitals Tab */}
        <TabsContent value="vitals" className="flex-1 min-h-0 mt-0 px-3 pb-3">
          <ScrollArea className="h-full">
            {vitalsLoading ? (
              <div className="space-y-2 mt-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-lg" />
                ))}
              </div>
            ) : !vitalsData?.length ? (
              <EmptyState label="No vitals recorded" />
            ) : (
              <div className="space-y-2 mt-3">
                {vitalsData.map((v) => {
                  const [bpSystolic, bpDiastolic] = v.bp?.split('/') ?? [];
                  return (
                  <Card key={v.id} className="p-3 bg-slate-50 dark:bg-slate-800/50 border-0 shadow-none">
                    <p className="text-[11px] text-slate-400 mb-1">
                      {new Date(v.recorded_at).toLocaleDateString()}
                    </p>
                    {bpSystolic && bpDiastolic && (
                      <div className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-700 last:border-0">
                        <span className="text-xs text-slate-500">BP</span>
                        <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                          {bpSystolic}/{bpDiastolic} mmHg
                        </span>
                      </div>
                    )}
                    <VitalValue label="Heart Rate" value={v.heart_rate} unit="bpm" />
                    <VitalValue label="SpO₂" value={v.spo2} unit="%" />
                    <VitalValue label="Temp" value={v.temperature} unit="°F" />
                    <VitalValue label="Blood Sugar" value={v.blood_glucose} unit="mg/dL" />
                    <VitalValue label="Weight" value={v.weight} unit="kg" />
                  </Card>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        {/* Records Tab */}
        <TabsContent value="records" className="flex-1 min-h-0 mt-0 px-3 pb-3">
          <ScrollArea className="h-full">
            {recordsLoading ? (
              <div className="space-y-2 mt-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full rounded-lg" />
                ))}
              </div>
            ) : !recordsData?.length ? (
              <EmptyState label="No consultation records" />
            ) : (
              <div className="space-y-2 mt-3">
                {recordsData.map((r) => (
                  <Card key={r.id} className="p-3 bg-slate-50 dark:bg-slate-800/50 border-0 shadow-none">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[11px] text-slate-400">
                        {new Date(r.date).toLocaleDateString()}
                      </p>
                      <Badge variant="outline" className="text-[10px] px-1 py-0">{r.type}</Badge>
                    </div>
                    {r.diagnosis && (
                      <p className="text-xs text-slate-700 dark:text-slate-300">
                        <span className="font-medium">Dx:</span> {r.diagnosis}
                      </p>
                    )}
                    {r.symptoms && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        <span className="font-medium">Sx:</span> {r.symptoms}
                      </p>
                    )}
                    {r.notes && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                        {r.notes}
                      </p>
                    )}
                    {!r.diagnosis && !r.symptoms && !r.notes && (
                      <p className="text-xs text-slate-400 italic">No notes recorded</p>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        {/* Labs Tab */}
        <TabsContent value="labs" className="flex-1 min-h-0 mt-0 px-3 pb-3">
          <ScrollArea className="h-full">
            {labLoading ? (
              <div className="space-y-2 mt-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-lg" />
                ))}
              </div>
            ) : !labData?.length ? (
              <EmptyState label="No lab results available" />
            ) : (
              <div className="space-y-2 mt-3">
                {labData.map((l) => (
                  <Card key={l.id} className="p-3 bg-slate-50 dark:bg-slate-800/50 border-0 shadow-none">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-slate-800 dark:text-slate-200">{l.test}</p>
                      <p className="text-[11px] text-slate-400">{new Date(l.date).toLocaleDateString()}</p>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{l.result}</p>
                  </Card>
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-slate-400 dark:text-slate-600 mt-3">
      <AlertCircle className="w-8 h-8 mb-2" />
      <p className="text-xs">{label}</p>
    </div>
  );
}
