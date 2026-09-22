import { useState } from 'react';
import { AlertTriangle, ShieldAlert, Info } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

/**
 * Shared prescription-safety UI (WP-1.2). Drives itself entirely off the server's response — this component never
 * decides what is safe, it only presents what the server already decided and collects the override the server asks for.
 *
 * A GET/POST to `/api/prescriptions/safety-check` or `/api/clinical-safety/check` returns { blockers, warnings,
 * allergyStatus }. A write that gets a 409 SAFETY_BLOCK / SAFETY_ACK_REQUIRED carries the same shape in its body.
 */
export interface SafetyItem {
  code: string;
  type: string;
  drug: string | null;
  severity: 'blocker' | 'warning';
  message: string;
  evidence?: string | null;
  requiresAcknowledgement?: boolean;
}

interface Props {
  blockers: SafetyItem[];
  warnings: SafetyItem[];
  mode?: 'shadow' | 'enforce';
  allergyStatus?: string;
  /** Present only once the server has actually blocked the request (409). Omit for a plain dry-run preview. */
  onOverride?: (reason: string, acknowledgedCodes: string[]) => void;
  overriding?: boolean;
}

const severityStyle = (s: SafetyItem['severity']) => (s === 'blocker' ? 'destructive' : 'default') as const;

function SafetyItemRow({ item, checked, onCheck }: { item: SafetyItem; checked?: boolean; onCheck?: (v: boolean) => void }) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      {onCheck ? (
        <Checkbox className="mt-0.5" checked={checked} onCheckedChange={(v) => onCheck(Boolean(v))} aria-label={`Acknowledge ${item.code}`} />
      ) : (
        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
      )}
      <div className="text-sm">
        <span className="font-medium">{item.drug ? `${item.drug} — ` : ''}</span>
        {item.message}
        {item.evidence && <div className="text-xs text-muted-foreground mt-0.5">{item.evidence}</div>}
      </div>
    </div>
  );
}

/** Renders the blockers/warnings from a safety check, and — when onOverride is given — the acknowledgement + reason
 * flow needed to resubmit past a 409. Renders nothing when there is nothing to show. */
export function PrescriptionSafetyAlert({ blockers, warnings, mode, allergyStatus, onOverride, overriding }: Props) {
  const ackNeeded = warnings.filter((w) => w.requiresAcknowledgement);
  const [acked, setAcked] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState('');
  if (blockers.length === 0 && warnings.length === 0) return null;

  const requiredCodes = [...blockers.map((b) => b.code), ...ackNeeded.map((w) => w.code)];
  const allAcked = requiredCodes.every((c) => acked.has(c));
  const canSubmit = allAcked && (blockers.length === 0 || reason.trim().length >= 10);

  const toggle = (code: string, v: boolean) => setAcked((prev) => { const next = new Set(prev); v ? next.add(code) : next.delete(code); return next; });

  return (
    <div className="space-y-3">
      {mode === 'shadow' && (blockers.length > 0 || warnings.length > 0) && (
        <p className="text-xs text-muted-foreground flex items-center gap-1"><Info className="h-3 w-3" /> Safety checks are in monitoring mode for this hospital: these alerts are logged but will not block saving.</p>
      )}
      {blockers.length > 0 && (
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle className="flex items-center gap-2">Prescribing safety blocker <Badge variant="destructive">{blockers.length}</Badge></AlertTitle>
          <AlertDescription>
            {blockers.map((b) => (
              <SafetyItemRow key={b.code + (b.drug || '')} item={b} checked={onOverride ? acked.has(b.code) : undefined} onCheck={onOverride ? (v) => toggle(b.code, v) : undefined} />
            ))}
          </AlertDescription>
        </Alert>
      )}
      {warnings.length > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle className="flex items-center gap-2">Safety warning{allergyStatus === 'unknown' ? ' — allergy status not recorded' : ''} <Badge variant="secondary">{warnings.length}</Badge></AlertTitle>
          <AlertDescription>
            {warnings.map((w) => (
              <SafetyItemRow key={w.code + (w.drug || '')} item={w} checked={onOverride && w.requiresAcknowledgement ? acked.has(w.code) : undefined} onCheck={onOverride && w.requiresAcknowledgement ? (v) => toggle(w.code, v) : undefined} />
            ))}
          </AlertDescription>
        </Alert>
      )}
      {onOverride && (blockers.length > 0 || ackNeeded.length > 0) && (
        <div className="space-y-2 rounded-md border p-3">
          {blockers.length > 0 && (
            <Textarea
              placeholder="Reason for proceeding despite the blocker(s) above (required, at least 10 characters)…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
            />
          )}
          <Button size="sm" variant={blockers.length ? 'destructive' : 'default'} disabled={!canSubmit || overriding} onClick={() => onOverride(reason.trim(), [...acked])}>
            {overriding ? 'Saving…' : blockers.length ? 'Acknowledge and override' : 'Acknowledge and continue'}
          </Button>
        </div>
      )}
    </div>
  );
}

/** True if a caught axios error is this service's 409 SAFETY_BLOCK / SAFETY_ACK_REQUIRED. */
export function isSafetyBlockError(err: any): boolean {
  const code = err?.response?.data?.code;
  return err?.response?.status === 409 && (code === 'SAFETY_BLOCK' || code === 'SAFETY_ACK_REQUIRED');
}

export function safetyItemsFromError(err: any): { blockers: SafetyItem[]; warnings: SafetyItem[] } {
  return { blockers: err?.response?.data?.blockers || [], warnings: err?.response?.data?.warnings || [] };
}
