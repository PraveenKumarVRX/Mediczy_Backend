import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { AlertTriangle, CheckCircle2, Send, XCircle } from 'lucide-react';
import api from '@/lib/api';

interface KnowledgeRule {
  id: number;
  domain_key: string;
  rule_type: string;
  title: string;
  condition_text: string;
  recommendation_text: string;
  evidence_source?: string | null;
  confidence_level?: string | null;
  status: 'draft' | 'under_review';
  created_by?: string | null;
}

const pretty = (s: string) => s.replace(/_/g, ' ');

/**
 * Review queue for Clinical Knowledge Fabric rules. Nothing here is live until a
 * medical director approves it; submitting only files it into the review queue.
 * The server enforces the roles (approve/reject: medical director or super admin).
 */
export default function KnowledgeRulesPanel({ onChanged }: { onChanged?: () => void }) {
  const { toast } = useToast();
  const [rules, setRules] = useState<KnowledgeRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    try {
      const res = await api.get('/clinical-knowledge-fabric/pending-review');
      setRules(res.data?.data ?? []);
    } catch (e: any) {
      toast({ title: 'Could not load knowledge rules', description: e?.response?.data?.error ?? e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const act = async (rule: KnowledgeRule, action: 'propose' | 'approve' | 'reject') => {
    const note = (notes[rule.id] ?? '').trim();
    if (action === 'reject' && !note) {
      toast({ title: 'A reason is required to reject a rule', variant: 'destructive' });
      return;
    }
    setBusyId(rule.id);
    try {
      await api.post(`/clinical-knowledge-fabric/rules/${rule.id}/${action}`, action === 'propose' ? {} : { notes: note });
      const done = { propose: 'Submitted for review', approve: 'Rule approved and live', reject: 'Rule rejected' }[action];
      toast({ title: done, description: rule.title });
      await load();
      onChanged?.();
    } catch (e: any) {
      toast({ title: 'Action failed', description: e?.response?.data?.error ?? e.message, variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const drafts = rules.filter((r) => r.status === 'draft');
  const underReview = rules.filter((r) => r.status === 'under_review');

  const RuleCard = ({ rule }: { rule: KnowledgeRule }) => (
    <Card className="border-slate-200">
      <CardContent className="pt-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{pretty(rule.domain_key)}</Badge>
          <Badge variant="outline" className="capitalize">{pretty(rule.rule_type)}</Badge>
          {rule.confidence_level && <Badge className="bg-amber-100 text-amber-800 capitalize">{rule.confidence_level}</Badge>}
        </div>
        <h4 className="font-semibold text-slate-900">{rule.title}</h4>
        <div className="text-sm space-y-1.5">
          <p><span className="font-medium text-slate-700">When: </span>{rule.condition_text}</p>
          <p><span className="font-medium text-slate-700">Then: </span>{rule.recommendation_text}</p>
          {rule.evidence_source && <p className="text-xs text-slate-500">Source: {rule.evidence_source}</p>}
        </div>
        {rule.status === 'draft' ? (
          <Button size="sm" variant="outline" disabled={busyId === rule.id} onClick={() => act(rule, 'propose')}>
            <Send className="h-3.5 w-3.5 mr-1.5" />Submit for review
          </Button>
        ) : (
          <div className="space-y-2">
            <Textarea
              placeholder="Review notes (required to reject)"
              rows={2}
              value={notes[rule.id] ?? ''}
              onChange={(e) => setNotes((n) => ({ ...n, [rule.id]: e.target.value }))}
            />
            <div className="flex gap-2">
              <Button size="sm" className="bg-green-600 hover:bg-green-700" disabled={busyId === rule.id} onClick={() => act(rule, 'approve')}>
                <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />Approve
              </Button>
              <Button size="sm" variant="destructive" disabled={busyId === rule.id} onClick={() => act(rule, 'reject')}>
                <XCircle className="h-3.5 w-3.5 mr-1.5" />Reject
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );

  if (loading) return <p className="text-sm text-muted-foreground">Loading knowledge rules…</p>;

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
        <span>
          These rules are illustrative drafts. Nothing reaches a clinical workflow until a medical director approves it here.
          Read each rule clinically before approving — approval is recorded against your name.
        </span>
      </div>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-700">Under review ({underReview.length})</h3>
        {underReview.length === 0
          ? <p className="text-sm text-muted-foreground">Nothing awaiting a decision.</p>
          : underReview.map((r) => <RuleCard key={r.id} rule={r} />)}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-700">Drafts — not yet submitted ({drafts.length})</h3>
        {drafts.length === 0
          ? <p className="text-sm text-muted-foreground">No draft rules.</p>
          : drafts.map((r) => <RuleCard key={r.id} rule={r} />)}
      </section>
    </div>
  );
}
