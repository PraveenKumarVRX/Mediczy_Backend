import { useEffect, useState, useCallback } from "react";
import { HeartHandshake, RefreshCw, Stethoscope } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineError } from "@/components/ui/inline-error";
import { useAuth } from "@/hooks/useAuth";
import { listFamilyUpdates } from "@/services/careos.service";

interface FamilyUpdate {
  id: number;
  title: string;
  body: string;
  stage: string | null;
  published_at: string | null;
  created_at: string;
}

const STAGE_LABELS: Record<string, string> = {
  admitted: "Admitted",
  stabilizing: "Stabilizing",
  in_treatment: "In Treatment",
  recovering: "Recovering",
  discharge_planning: "Discharge Planning",
  discharged: "Discharged",
};

/**
 * Family-facing view of a patient's CareOS treatment-progress updates —
 * the backend (GET /v3/healthos/family/:patientId/updates) already existed
 * and enforces the patient can only ever see their own updates; this is the
 * screen a patient/family member actually uses to read them.
 */
export default function FamilyCareUpdates() {
  const { currentUser } = useAuth();
  const patientId = (currentUser as unknown as { id?: number })?.id;

  const [updates, setUpdates] = useState<FamilyUpdate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!patientId) {
      setError("Could not determine your patient record. Please log in again.");
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const res = await listFamilyUpdates(patientId, true);
      setUpdates(res?.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load care updates.");
    } finally {
      setIsLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-500 px-4 md:px-6 py-6">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-teal-700 via-teal-800 to-teal-900 p-6 md:p-8 text-white shadow-2xl">
        <div className="relative flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2.5 rounded-xl bg-white/10">
                <HeartHandshake className="w-6 h-6" />
              </div>
              <h1 className="text-2xl md:text-3xl font-bold">Care Updates</h1>
            </div>
            <p className="text-teal-100 text-sm md:text-base">
              Treatment progress shared by the care team
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={load}
            disabled={isLoading}
            className="shrink-0"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {error && <InlineError message={error} onRetry={load} />}

      {!error && !isLoading && updates.length === 0 && (
        <EmptyState
          icon={Stethoscope}
          title="No updates yet"
          description="Your care team hasn't shared any treatment updates yet. Check back later."
        />
      )}

      <div className="space-y-4">
        {updates.map((u) => (
          <Card key={u.id} className="border-l-4 border-teal-500">
            <CardContent className="pt-5">
              <div className="flex items-start justify-between gap-3 mb-2">
                <h3 className="font-semibold text-lg">{u.title}</h3>
                {u.stage && (
                  <Badge className="bg-teal-100 text-teal-800 shrink-0">
                    {STAGE_LABELS[u.stage] || u.stage}
                  </Badge>
                )}
              </div>
              <p className="text-muted-foreground whitespace-pre-wrap">{u.body}</p>
              <p className="text-xs text-muted-foreground mt-3">
                {new Date(u.published_at || u.created_at).toLocaleString()}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
