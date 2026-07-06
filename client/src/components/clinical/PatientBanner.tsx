import { Badge } from '@/components/ui/badge';
import { HEALTH_OS } from '@/config/brand';
import type { LivingWorkspace } from '@/features/workspace/types/workspace.types';
import { AcuityBadge } from './AcuityBadge';

interface PatientBannerProps {
  workspace: LivingWorkspace | null;
  patientId: number;
  loading?: boolean;
}

export function PatientBanner({ workspace, patientId, loading }: PatientBannerProps) {
  const patient = workspace?.patient;
  const name = patient
    ? `${patient.first_name || ''} ${patient.last_name || ''}`.trim()
    : '';
  const displayName = name || `Patient ${patientId}`;
  const mrn = patient?.mrn || patient?.uhid;
  const admission = workspace?.admission as { ward?: string; bed?: string; diagnosis?: string } | undefined;
  const location = [admission?.ward, admission?.bed].filter(Boolean).join(' · ');

  return (
    <div className="flex flex-col gap-1 min-w-0 flex-1">
      <div className="flex items-center gap-2 flex-wrap">
        <h1 className="text-xl font-bold text-slate-800 truncate">{displayName}</h1>
        <Badge className="bg-teal-600 shrink-0">{HEALTH_OS.brandLine}</Badge>
        <AcuityBadge alerts={workspace?.sections?.ai?.coordinatorAlerts} />
      </div>
      <p className="text-sm text-slate-500 truncate">
        {loading ? 'Loading workspace…' : 'Living Patient Workspace'}
        {mrn ? ` · MRN ${mrn}` : ''}
        {location ? ` · ${location}` : ''}
        {workspace?.diagnosis ? ` · ${workspace.diagnosis}` : ''}
      </p>
    </div>
  );
}
