import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import api from "@/utils/api";
export default function CorporateCertificateUpload({
  onUploaded,
}: {
  onUploaded: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [employees, setEmployees] = useState<
    { employeeId: string; name: string }[]
  >([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState({
    employeeId: "",
    issuedBy: "",
    doctorRegNo: "",
    examinationDate: "",
    validUntil: "",
    fitnessStatus: "fit",
  });
  const load = async () => {
    try {
      const response = await api.get("/corporate/employees");
      setEmployees(response.data.data.employees || []);
      setError("");
    } catch {
      setError("Employee roster could not be loaded.");
    }
  };
  useEffect(() => {
    if (open) load();
  }, [open]);
  const submit = async () => {
    if (
      !file ||
      file.type !== "application/pdf" ||
      file.size > 10 * 1024 * 1024
    ) {
      toast({ title: "Choose a PDF of 10 MB or less", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const body = new FormData();
      Object.entries(form).forEach(([key, value]) => body.append(key, value));
      body.append("file", file);
      await api.post(
        "/v1/occupational-health/fitness-certificates/upload",
        body,
      );
      toast({ title: "Existing fitness certificate uploaded" });
      setFile(null);
      setOpen(false);
      onUploaded();
    } catch (error: any) {
      toast({
        title: "Certificate upload failed",
        description: error?.response?.data?.message,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload an existing certificate</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Attach an existing clinician-issued PDF to an employee. Uploaded
          documents retain their original issuer and are available to the
          employee.
        </p>
        <Button variant="outline" onClick={() => setOpen((value) => !value)}>
          {open ? "Close upload" : "Upload certificate PDF"}
        </Button>
        {open && (
          <>
            {error && (
              <p role="alert">
                {error}
                <Button onClick={load}>Retry</Button>
              </p>
            )}
            <label className="block">
              Employee
              <select
                className="block w-full border p-2 bg-background"
                aria-label="Certificate employee"
                value={form.employeeId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    employeeId: event.target.value,
                  }))
                }
              >
                <option value="">Choose employee</option>
                {employees.map((employee) => (
                  <option key={employee.employeeId} value={employee.employeeId}>
                    {employee.name} ({employee.employeeId})
                  </option>
                ))}
              </select>
            </label>
            <div className="grid sm:grid-cols-2 gap-3">
              {(
                [
                  "issuedBy",
                  "doctorRegNo",
                  "examinationDate",
                  "validUntil",
                ] as const
              ).map((key) => (
                <label key={key}>
                  {
                    {
                      issuedBy: "Issuing clinician",
                      doctorRegNo: "Medical registration (if stated)",
                      examinationDate: "Examination date",
                      validUntil: "Valid until (optional)",
                    }[key]
                  }
                  <Input
                    type={
                      key === "examinationDate" || key === "validUntil"
                        ? "date"
                        : "text"
                    }
                    value={form[key]}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        [key]: event.target.value,
                      }))
                    }
                  />
                </label>
              ))}
            </div>
            <label className="block">
              Fitness status stated on the certificate
              <select
                className="block w-full border p-2 bg-background"
                aria-label="Uploaded fitness status"
                value={form.fitnessStatus}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    fitnessStatus: event.target.value,
                  }))
                }
              >
                {[
                  "fit",
                  "fit_with_restrictions",
                  "temporarily_unfit",
                  "unfit",
                ].map((status) => (
                  <option key={status} value={status}>
                    {status.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </label>
            <Input
              aria-label="Certificate PDF"
              type="file"
              accept="application/pdf"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
            />
            <Button
              onClick={submit}
              disabled={
                busy ||
                Boolean(error) ||
                !file ||
                !form.employeeId ||
                !form.issuedBy ||
                !form.examinationDate
              }
            >
              {busy ? "Uploading…" : "Save uploaded certificate"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
