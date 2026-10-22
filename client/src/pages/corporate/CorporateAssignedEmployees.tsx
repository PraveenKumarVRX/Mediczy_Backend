import { useEffect, useState } from "react";
import CorporateLayout from "@/components/corporate/CorporateLayout";
import CorporateMfaSettings from "@/components/corporate/CorporateMfaSettings";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import api from "@/utils/api";
export default function CorporateAssignedEmployees() {
  const { toast } = useToast();
  const [employees, setEmployees] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [viewer, setViewer] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    employeeId: "",
    appointmentType: "Health Checkup",
    date: "",
    time: "",
    facility: "",
    doctorName: "",
  });
  const load = async () => {
    try {
      const [people, visits, me] = await Promise.all([
        api.get("/corporate/access/assigned-employees"),
        api.get("/corporate/access/appointments"),
        api.get("/corporate/access/me"),
      ]);
      setEmployees(people.data.data.employees);
      setAppointments(visits.data.data.appointments);
      setViewer(me.data.data.policy?.level === "viewer");
      setError("");
    } catch {
      setError("Assigned employees could not be loaded.");
    }
  };
  useEffect(() => {
    load();
  }, []);
  const schedule = async () => {
    setBusy(true);
    try {
      const employee = employees.find(
        (row) => row.employeeId === form.employeeId,
      );
      await api.post("/corporate/appointments", {
        ...form,
        employeeName: employee?.name,
        department: employee?.department,
      });
      await load();
      toast({ title: "Employee appointment scheduled" });
    } catch (error: any) {
      toast({
        title: "Scheduling failed",
        description: error?.response?.data?.message,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };
  const cancel = async (id: string) => {
    setBusy(true);
    try {
      await api.put(`/corporate/appointments/${id}`, { status: "cancelled" });
      await load();
    } catch {
      toast({ title: "Cancellation failed", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <CorporateLayout title="Assigned Employees">
      <div className="p-6 space-y-5">
        <h1 className="text-2xl font-semibold">Assigned Employees</h1>
        <p>
          Only employees and schedules inside your assigned scope appear here.
        </p>
        {error && (
          <p role="alert">
            {error}
            <Button onClick={load}>Retry</Button>
          </p>
        )}
        <Card>
          <CardHeader>
            <CardTitle>Employee directory</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Email</th>
                  <th>Department</th>
                  <th>Business unit</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((row) => (
                  <tr key={row.employeeId}>
                    <td>
                      {row.name} ({row.employeeId})
                    </td>
                    <td>{row.email}</td>
                    <td>{row.department}</td>
                    <td>{row.businessUnit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!employees.length && !error && (
              <p>No active employees match your assigned scope.</p>
            )}
          </CardContent>
        </Card>
        {!viewer && (
          <Card>
            <CardHeader>
              <CardTitle>Schedule employee care</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <label className="block">
                Employee
                <select
                  aria-label="Employee"
                  className="block bg-background border p-2 w-full"
                  value={form.employeeId}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      employeeId: event.target.value,
                    }))
                  }
                >
                  <option value="">Choose employee</option>
                  {employees.map((row) => (
                    <option key={row.employeeId} value={row.employeeId}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </label>
              {(["date", "time", "facility", "doctorName"] as const).map(
                (key) => (
                  <label key={key} className="block">
                    {key === "doctorName" ? "Doctor / clinician" : key}
                    <Input
                      type={
                        key === "date"
                          ? "date"
                          : key === "time"
                            ? "time"
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
                ),
              )}
              <Button
                onClick={schedule}
                disabled={busy || !form.employeeId || !form.date || !form.time}
              >
                Schedule
              </Button>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader>
            <CardTitle>Assigned appointment records</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {appointments.map((row) => (
              <div key={row.id} className="flex justify-between gap-3">
                <p>
                  {row.employeeName} · {String(row.date).slice(0, 10)}{" "}
                  {row.time} · {row.status}
                </p>
                {!viewer && row.status === "scheduled" && (
                  <Button
                    disabled={busy}
                    onClick={() => cancel(String(row.id))}
                  >
                    Cancel appointment
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
        <CorporateMfaSettings />
      </div>
    </CorporateLayout>
  );
}
