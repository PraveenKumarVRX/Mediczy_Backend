import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import CorporateLayout from "@/components/corporate/CorporateLayout";
import CorporatePageHeader from "@/components/corporate/CorporatePageHeader";
import { useToast } from "@/hooks/use-toast";
import { BarChart3, Download } from "lucide-react";
import api from "@/utils/api";

type Analytics = {
  year: number;
  currency: string;
  monthly: {
    month: string;
    consultations: number;
    checkups: number;
    hr_schedules: number;
    completed: number;
    participating: number;
    paid_spend: number;
  }[];
  departments: {
    department: string;
    eligible: number;
    participating: number;
    completed: number;
    paid_spend: number;
  }[];
  ages: { age_band: string; participating: number; completed: number }[];
  vendors: {
    provider_key: string;
    provider_name: string;
    kind: string;
    booked: number;
    completed: number;
    cancelled_or_missed: number;
    paid_spend: number;
  }[];
  budget: {
    annual: number | null;
    paidSpend: number;
    remaining: number | null;
    utilizationPercent: number | null;
  };
  feedback: { responses: number; average_rating: number | null };
  notes: string[];
};
const money = (amount: number | null) =>
  amount == null
    ? "Not configured"
    : new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2,
      }).format(Number(amount));
export default function CorporateProgramAnalytics() {
  const { toast } = useToast();
  const loadVersion = useRef(0);
  const [owner, setOwner] = useState(false);
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState<Analytics | null>(null);
  const [budget, setBudget] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const load = async () => {
    const version = ++loadVersion.current;
    setLoading(true);
    setError("");
    try {
      const [response, me] = await Promise.all([
        api.get("/corporate/programs/analytics", { params: { year } }),
        api.get("/corporate/access/me"),
      ]);
      if (version !== loadVersion.current) return;
      setOwner(["corporate", "corporate_admin"].includes(me.data?.data?.role));
      setData(response.data.data);
      setBudget(response.data.data.budget.annual?.toString() || "");
    } catch (error: any) {
      if (version !== loadVersion.current) return;
      setError(
        error?.response?.data?.message ||
          "Program reporting could not be loaded.",
      );
      setData(null);
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, [year]);
  const save = async () => {
    if (
      !budget.trim() ||
      !Number.isFinite(Number(budget)) ||
      Number(budget) < 0
    ) {
      toast({ title: "Enter a valid annual budget", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await api.put("/corporate/programs/budget", {
        year,
        amount: Number(budget),
      });
      await load();
      toast({ title: "Annual budget saved" });
    } catch (error: any) {
      toast({
        title: "Budget could not be saved",
        description: error?.response?.data?.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };
  const download = async () => {
    try {
      const response = await api.get("/corporate/programs/analytics/export", {
        params: { year },
        responseType: "blob",
      });
      const url = URL.createObjectURL(
        new Blob([response.data], { type: "text/csv" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `program-utilization-${year}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Report could not be exported", variant: "destructive" });
    }
  };
  return (
    <CorporateLayout title="Program Analytics">
      <div className="p-6 space-y-5">
        <CorporatePageHeader
          title="Program Analytics"
          description="Monthly and annual utilization, provider activity, recorded spending and employee feedback."
          icon={BarChart3}
        />
        <div className="flex flex-wrap items-end gap-3">
          <label>
            Reporting year
            <Input
              aria-label="Reporting year"
              type="number"
              min="2020"
              max={new Date().getFullYear() + 1}
              disabled={saving}
              value={year}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (value >= 2020 && value <= new Date().getFullYear() + 1)
                  setYear(value);
              }}
            />
          </label>
          <Button onClick={load} disabled={loading}>
            Refresh
          </Button>
          <Button onClick={download} disabled={!data || loading}>
            <Download className="h-4 w-4 mr-2" />
            Export annual CSV
          </Button>
        </div>
        {error && (
          <div role="alert">
            {error}
            <Button onClick={load}>Retry</Button>
          </div>
        )}
        {loading && <p role="status">Loading measured program activity…</p>}
        {data && !loading && (
          <>
            <div className="grid sm:grid-cols-3 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Paid program spending</CardTitle>
                </CardHeader>
                <CardContent>{money(data.budget.paidSpend)}</CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Budget remaining</CardTitle>
                </CardHeader>
                <CardContent>
                  {money(data.budget.remaining)}
                  {data.budget.utilizationPercent != null && (
                    <p>{data.budget.utilizationPercent}% utilized</p>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Employee satisfaction</CardTitle>
                </CardHeader>
                <CardContent>
                  {data.feedback.responses
                    ? `${data.feedback.average_rating}/5 from ${data.feedback.responses} responses`
                    : "No visit feedback yet"}
                </CardContent>
              </Card>
            </div>
            <Card>
              <CardHeader>
                <CardTitle>Annual budget (INR)</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center gap-3">
                <Input
                  disabled={!owner}
                  aria-label="Annual budget in INR"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Set annual budget"
                  value={budget}
                  onChange={(event) => setBudget(event.target.value)}
                />
                <Button onClick={save} disabled={saving || !owner}>
                  Save budget
                </Button>
                <p className="text-sm text-muted-foreground">
                  Super HR can update the budget.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Monthly utilization</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      {[
                        "Month",
                        "Consultations booked",
                        "Lab checkups booked",
                        "HR schedules",
                        "Completed records",
                        "Employees participating",
                        "Paid spend",
                      ].map((label) => (
                        <th key={label} className="text-left p-2">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.monthly.map((row) => (
                      <tr key={row.month}>
                        {[
                          row.month,
                          row.consultations,
                          row.checkups,
                          row.hr_schedules,
                          row.completed,
                          row.participating,
                          money(row.paid_spend),
                        ].map((value, index) => (
                          <td key={index} className="p-2">
                            {value}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Department participation</CardTitle>
              </CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th>Department</th>
                      <th>Employees in period</th>
                      <th>Completed-care participants</th>
                      <th>Participation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.departments.map((row) => (
                      <tr key={row.department}>
                        <td>{row.department}</td>
                        <td>{row.eligible}</td>
                        <td>{row.participating}</td>
                        <td>
                          {row.eligible
                            ? Math.round(
                                (row.participating / row.eligible) * 100,
                              )
                            : 0}
                          %
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Age-wise utilization</CardTitle>
              </CardHeader>
              <CardContent>
                {data.ages.length ? (
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <th>Age band</th>
                        <th>Employees participating</th>
                        <th>Completed records</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.ages.map((row) => (
                        <tr key={row.age_band}>
                          <td>{row.age_band}</td>
                          <td>{row.participating}</td>
                          <td>{row.completed}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p>No completed care in this period.</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Provider performance</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {data.vendors.length ? (
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        {[
                          "Provider",
                          "Service",
                          "Booked",
                          "Completed",
                          "Cancelled / missed",
                          "Paid spend",
                        ].map((label) => (
                          <th key={label} className="text-left p-2">
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.vendors.map((row) => (
                        <tr key={row.provider_key + row.kind}>
                          {[
                            row.provider_name,
                            row.kind.replace(/_/g, " "),
                            row.booked,
                            row.completed,
                            row.cancelled_or_missed,
                            money(row.paid_spend),
                          ].map((value, index) => (
                            <td key={index} className="p-2">
                              {value}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p>No provider activity in this period.</p>
                )}
              </CardContent>
            </Card>
            <ul className="text-sm text-muted-foreground list-disc pl-5">
              {data.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </>
        )}
      </div>
    </CorporateLayout>
  );
}
