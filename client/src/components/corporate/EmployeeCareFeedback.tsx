import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import api from "@/utils/api";
export default function EmployeeCareFeedback() {
  const { toast } = useToast();
  const [visits, setVisits] = useState<
    {
      key: string;
      date: string;
      provider: string;
      company: string;
      feedback: { rating: number } | null;
    }[]
  >([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const load = async () => {
    try {
      const response = await api.get("/corporate/programs/employee/feedback");
      setVisits(response.data.data || []);
      setError("");
    } catch {
      setError("Visit feedback could not be loaded.");
    }
  };
  useEffect(() => {
    load();
  }, []);
  const rate = async (key: string, rating: number) => {
    setSaving(key);
    try {
      await api.post("/corporate/programs/employee/feedback", { key, rating });
      await load();
      toast({ title: "Thank you for your feedback" });
    } catch {
      toast({ title: "Feedback could not be saved", variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };
  if (!visits.length && !error) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Rate your completed care</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Your employer sees the aggregate satisfaction score for its health
          program.
        </p>
        {error && (
          <p role="alert">
            {error}
            <Button onClick={load}>Retry</Button>
          </p>
        )}
        {visits.map((visit) => (
          <div
            key={visit.key}
            className="flex flex-wrap items-center justify-between gap-2"
          >
            <p>
              {visit.date} · {visit.provider || "Completed visit"} ·{" "}
              {visit.company}
            </p>
            <div className="flex gap-1" aria-label={`Rating for ${visit.key}`}>
              {[1, 2, 3, 4, 5].map((value) => (
                <Button
                  key={value}
                  size="sm"
                  variant={
                    visit.feedback?.rating === value ? "default" : "outline"
                  }
                  disabled={saving === visit.key}
                  onClick={() => rate(visit.key, value)}
                  aria-label={`Rate ${visit.key} ${value} out of 5`}
                >
                  {value}
                </Button>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
