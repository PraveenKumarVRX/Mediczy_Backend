/**
 * SLA Tracker
 * ===========
 * Kanban-style view of all complaint tickets sorted by severity (S0→S3).
 * Shows SLA countdown, breach status, and AI component attribution.
 *
 * Route: /admin/feedback-intelligence/sla
 * Access: admin, medical_director
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  AlertTriangle, ArrowLeft, CheckCircle2, Clock, RefreshCw, Filter,
} from 'lucide-react';
import api from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SlaTicket {
  ticket_id: string;
  severity: 'S0' | 'S1' | 'S2' | 'S3';
  confidence: number;
  ai_component: string | null;
  feedback_type: string | null;
  evidence_quote: string | null;
  recommended_action: string | null;
  response_due_at: string;
  resolution_due_at: string;
  response_met_at: string | null;
  resolution_met_at: string | null;
  breached: boolean;
  breach_type: string | null;
  created_at: string;
  response_overdue_min: number | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SEV_CONFIG = {
  S0: { label: 'Safety Critical',  bg: 'bg-red-50',    border: 'border-red-300',    badge: 'bg-red-100 text-red-800 border-red-300',    dot: 'bg-red-500'    },
  S1: { label: 'Clinical Quality', bg: 'bg-orange-50', border: 'border-orange-300', badge: 'bg-orange-100 text-orange-800 border-orange-300', dot: 'bg-orange-500' },
  S2: { label: 'Functional Bug',   bg: 'bg-amber-50',  border: 'border-amber-300',  badge: 'bg-amber-100 text-amber-800 border-amber-300',  dot: 'bg-amber-500'  },
  S3: { label: 'UX Friction',      bg: 'bg-blue-50',   border: 'border-blue-300',   badge: 'bg-blue-100 text-blue-800 border-blue-300',    dot: 'bg-blue-500'   },
};

const COMPONENT_LABELS: Record<string, string> = {
  medical_scribe_output:           'Dr. iSHA',
  emergency_triage_esi_v1:         'Triage',
  drug_interaction_checker_v1:     'Drug Checker',
  health_risk_scoring_v2_bayesian: 'Health Risk',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDue(iso: string): { label: string; overdue: boolean } {
  const ms   = new Date(iso).getTime() - Date.now();
  const abs  = Math.abs(ms);
  const mins = Math.floor(abs / 60000);
  const hrs  = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);

  let label: string;
  if      (days > 0)  label = `${days}d ${hrs % 24}h`;
  else if (hrs > 0)   label = `${hrs}h ${mins % 60}m`;
  else                label = `${mins}m`;

  return { label: ms < 0 ? `${label} overdue` : `${label} left`, overdue: ms < 0 };
}

function SlaTicketCard({ ticket }: { ticket: SlaTicket }) {
  const cfg         = SEV_CONFIG[ticket.severity];
  const resDue      = formatDue(ticket.resolution_due_at);
  const respDue     = ticket.response_met_at ? null : formatDue(ticket.response_due_at);
  const isResolved  = !!ticket.resolution_met_at;

  return (
    <div className={`rounded-lg border ${isResolved ? 'opacity-60' : ''} ${ticket.breached ? 'border-red-400' : cfg.border} bg-white p-3 shadow-sm`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
          <span className="text-xs font-mono text-slate-500">#{ticket.ticket_id.slice(-8)}</span>
        </div>
        <div className="flex items-center gap-1">
          {ticket.breached && <Badge variant="destructive" className="text-xs h-4">BREACHED</Badge>}
          {isResolved && <Badge className="text-xs h-4 bg-green-100 text-green-700">Resolved</Badge>}
        </div>
      </div>

      {/* Evidence */}
      {ticket.evidence_quote && (
        <p className="text-xs text-slate-700 mb-2 line-clamp-2 italic">
          "{ticket.evidence_quote}"
        </p>
      )}

      {/* AI component */}
      {ticket.ai_component && (
        <p className="text-xs text-slate-500 mb-2">
          {COMPONENT_LABELS[ticket.ai_component] || ticket.ai_component}
          {ticket.feedback_type && ` · ${ticket.feedback_type.replace(/_/g, ' ')}`}
        </p>
      )}

      {/* SLA countdown */}
      <div className="space-y-1">
        {respDue && (
          <div className={`flex items-center gap-1.5 text-xs ${respDue.overdue ? 'text-red-600' : 'text-slate-500'}`}>
            <Clock className="h-3 w-3" />
            <span>Response: {respDue.label}</span>
          </div>
        )}
        {!isResolved && (
          <div className={`flex items-center gap-1.5 text-xs ${resDue.overdue ? 'text-red-600 font-medium' : 'text-slate-500'}`}>
            {resDue.overdue
              ? <AlertTriangle className="h-3 w-3" />
              : <Clock className="h-3 w-3" />
            }
            <span>Resolution: {resDue.label}</span>
          </div>
        )}
        {isResolved && ticket.response_met_at && (
          <div className="flex items-center gap-1.5 text-xs text-green-600">
            <CheckCircle2 className="h-3 w-3" />
            <span>Resolved {new Date(ticket.resolution_met_at!).toLocaleDateString('en-IN')}</span>
          </div>
        )}
      </div>

      {/* Recommended action */}
      {ticket.recommended_action && (
        <p className="text-xs text-slate-400 mt-2 border-t pt-2 truncate">{ticket.recommended_action}</p>
      )}
    </div>
  );
}

function SeverityColumn({ sev, tickets }: { sev: 'S0' | 'S1' | 'S2' | 'S3'; tickets: SlaTicket[] }) {
  const cfg      = SEV_CONFIG[sev];
  const breached = tickets.filter(t => t.breached).length;

  return (
    <div className={`rounded-xl border-2 ${cfg.border} ${cfg.bg} flex flex-col`} style={{ minWidth: 280, maxWidth: 320 }}>
      <div className="px-4 py-3 border-b border-inherit">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
            <span className="font-semibold text-sm text-slate-700">{sev} — {cfg.label}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs font-bold text-slate-600 bg-white rounded px-1.5 py-0.5 border">{tickets.length}</span>
            {breached > 0 && (
              <span className="text-xs font-bold text-red-700 bg-red-100 rounded px-1.5 py-0.5">{breached}!</span>
            )}
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2" style={{ maxHeight: 520 }}>
        {tickets.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-8">No {sev} tickets</p>
        ) : (
          tickets.map(t => <SlaTicketCard key={t.ticket_id} ticket={t} />)
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SLATrackerPage() {
  const [tickets, setTickets]   = useState<SlaTicket[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showResolved, setShowResolved] = useState(false);
  const { toast }               = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/feedback-intelligence/sla-status', {
        params: { limit: 100 },
      });
      setTickets(res.data.data ?? []);
    } catch (err: any) {
      toast({ title: 'Failed to load SLA data', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const filtered   = showResolved ? tickets : tickets.filter(t => !t.resolution_met_at);
  const byseverity  = (['S0', 'S1', 'S2', 'S3'] as const).reduce<Record<string, SlaTicket[]>>((acc, s) => {
    acc[s] = filtered.filter(t => t.severity === s);
    return acc;
  }, {});

  const totalBreached = tickets.filter(t => t.breached && !t.resolution_met_at).length;

  return (
    <AdminLayout>
      <div className="p-6 max-w-full mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/admin/feedback-intelligence">
              <Button variant="ghost" size="sm" className="gap-1">
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <Clock className="h-6 w-6 text-orange-500" />
                SLA Tracker
              </h1>
              <p className="text-sm text-slate-500">
                {filtered.length} open ticket{filtered.length !== 1 ? 's' : ''}
                {totalBreached > 0 && (
                  <span className="text-red-600 font-medium"> · {totalBreached} breached</span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={showResolved ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowResolved(v => !v)}
            >
              <Filter className="h-3 w-3 mr-1" />
              {showResolved ? 'Hide Resolved' : 'Show Resolved'}
            </Button>
            <Button size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Kanban board */}
        {loading ? (
          <div className="flex gap-4 overflow-x-auto pb-4">
            {['S0','S1','S2','S3'].map(s => (
              <div key={s} className="rounded-xl border-2 border-slate-200 bg-slate-50 flex-none animate-pulse" style={{ width: 280, height: 400 }} />
            ))}
          </div>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-4">
            {(['S0','S1','S2','S3'] as const).map(s => (
              <SeverityColumn key={s} sev={s} tickets={byseverity[s] ?? []} />
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
