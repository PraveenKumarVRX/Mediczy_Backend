import { cn } from '@/lib/utils';
import { Activity, Heart, Thermometer, Wind } from 'lucide-react';

export interface VitalsData {
  hr?: number;
  spo2?: number;
  bp?: string;
  rr?: number;
  temp?: number;
}

interface VitalsStripProps {
  vitals?: VitalsData | null;
  className?: string;
}

function VitalCell({ icon: Icon, label, value, alert }: { icon: typeof Heart; label: string; value: string; alert?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border', alert && 'border-red-300 bg-red-50')}>
      <Icon className={cn('h-4 w-4', alert ? 'text-red-600' : 'text-teal-600')} />
      <div>
        <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
        <p className={cn('text-sm font-bold', alert && 'text-red-700')}>{value}</p>
      </div>
    </div>
  );
}

export function VitalsStrip({ vitals, className }: VitalsStripProps) {
  if (!vitals) {
    return <p className="text-sm text-muted-foreground">No vitals available</p>;
  }

  return (
    <div className={cn('grid grid-cols-2 sm:grid-cols-5 gap-2', className)}>
      <VitalCell icon={Heart} label="HR" value={vitals.hr != null ? `${vitals.hr} bpm` : '—'} alert={vitals.hr != null && (vitals.hr > 120 || vitals.hr < 50)} />
      <VitalCell icon={Wind} label="SpO₂" value={vitals.spo2 != null ? `${vitals.spo2}%` : '—'} alert={vitals.spo2 != null && vitals.spo2 < 92} />
      <VitalCell icon={Activity} label="BP" value={vitals.bp || '—'} />
      <VitalCell icon={Wind} label="RR" value={vitals.rr != null ? `${vitals.rr}/min` : '—'} />
      <VitalCell icon={Thermometer} label="Temp" value={vitals.temp != null ? `${vitals.temp}°C` : '—'} alert={vitals.temp != null && vitals.temp > 38} />
    </div>
  );
}
