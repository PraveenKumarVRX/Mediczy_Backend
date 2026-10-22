import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import api from "@/utils/api";
type Window = { date: string; start: string; end: string };
export default function CorporateDoctorAvailability({
  doctor,
  onClose,
}: {
  doctor: { id: number; name: string } | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [hours, setHours] = useState<Window[]>([]);
  const [configured, setConfigured] = useState(false);
  const [owner, setOwner] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = async () => {
    if (!doctor) return;
    try {
      const [response, me] = await Promise.all([
        api.get(`/corporate/programs/doctors/${doctor.id}/availability`),
        api.get("/corporate/access/me"),
      ]);
      setHours(response.data.data.hours);
      setConfigured(response.data.data.configured);
      setOwner(["corporate", "corporate_admin"].includes(me.data.data.role));
      setError("");
    } catch {
      setError("Scheduling windows could not be loaded.");
    }
  };
  useEffect(() => {
    if (doctor) load();
  }, [doctor?.id]);
  const save = async (reset = false) => {
    if (!doctor) return;
    setBusy(true);
    try {
      await api.put(`/corporate/programs/doctors/${doctor.id}/availability`, {
        hours: reset ? null : hours,
      });
      await load();
      toast({
        title: reset
          ? "Corporate scheduling restrictions removed"
          : "Corporate scheduling windows saved",
      });
    } catch (error: any) {
      toast({
        title: "Availability could not be saved",
        description: error?.response?.data?.message,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={Boolean(doctor)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{doctor?.name} — corporate scheduling</DialogTitle>
          <DialogDescription>
            Super HR can limit when this doctor may be selected on HR scheduling
            records. Times use India time. Clinical bookings still follow the
            doctor’s own availability.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p role="alert">
            {error}
            <Button onClick={load}>Retry</Button>
          </p>
        ) : (
          <>
            <p>
              {configured
                ? "Corporate scheduling windows are configured."
                : "No additional corporate scheduling restrictions."}
            </p>
            {hours.map((window, index) => (
              <div key={index} className="flex gap-2 items-end">
                {(["date", "start", "end"] as const).map((key) => (
                  <label key={key} className="text-sm">
                    {key}
                    <Input
                      disabled={!owner}
                      type={key === "date" ? "date" : "time"}
                      value={window[key]}
                      onChange={(event) =>
                        setHours((current) =>
                          current.map((row, i) =>
                            i === index
                              ? { ...row, [key]: event.target.value }
                              : row,
                          ),
                        )
                      }
                    />
                  </label>
                ))}
                {owner && (
                  <Button
                    variant="outline"
                    onClick={() =>
                      setHours((current) =>
                        current.filter((_, i) => i !== index),
                      )
                    }
                  >
                    Remove
                  </Button>
                )}
              </div>
            ))}
            {owner && (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() =>
                    setHours((current) => [
                      ...current,
                      { date: "", start: "09:00", end: "17:00" },
                    ])
                  }
                >
                  Add window
                </Button>
                <Button onClick={() => save()} disabled={busy}>
                  Save windows
                </Button>
                <Button
                  variant="outline"
                  onClick={() => save(true)}
                  disabled={busy}
                >
                  Remove restrictions
                </Button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
