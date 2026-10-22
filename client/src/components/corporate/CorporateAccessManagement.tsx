import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import api from "@/utils/api";
type Policy = {
  level: "staff" | "coordinator" | "viewer";
  departments: string[];
  businessUnits: string[];
  branches: string[];
};
const blank: Policy = {
  level: "staff",
  departments: [],
  businessUnits: [],
  branches: [],
};
export default function CorporateAccessManagement() {
  const { toast } = useToast();
  const [data, setData] = useState<{
    members: {
      id: number;
      firstName: string;
      lastName: string;
      email: string;
      access: Policy | null;
    }[];
    departments: string[];
    businessUnits: string[];
    branches: string[];
  } | null>(null);
  const [selected, setSelected] = useState("");
  const [policy, setPolicy] = useState<Policy>(blank);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = async () => {
    try {
      const response = await api.get("/corporate/access/team");
      if (!Array.isArray(response.data?.data?.members))
        throw new Error("Incomplete team access response");
      setData(response.data.data);
      setError("");
    } catch {
      setError("Team access settings could not be loaded.");
    }
  };
  useEffect(() => {
    load();
  }, []);
  const choose = (id: string) => {
    setSelected(id);
    setPolicy({
      ...blank,
      ...data?.members.find((member) => String(member.id) === id)?.access,
    });
  };
  const toggle = (
    key: "departments" | "businessUnits" | "branches",
    value: string,
  ) =>
    setPolicy((current) => ({
      ...current,
      [key]: current[key].includes(value)
        ? current[key].filter((item) => item !== value)
        : [...current[key], value],
    }));
  const save = async () => {
    setBusy(true);
    try {
      await api.put(`/corporate/access/team/${selected}`, policy);
      await load();
      toast({
        title: "HR access updated",
        description:
          "Permissions apply on the next API request, including existing sessions.",
      });
    } catch (error: any) {
      toast({
        title: "Access update failed",
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
        <CardTitle>HR roles and employee scope</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <p role="alert">
            {error}
            <Button onClick={load}>Retry</Button>
          </p>
        ) : (
          <>
            <label className="block">
              HR staff member
              <select
                aria-label="HR staff member"
                className="block w-full rounded border p-2 bg-background"
                value={selected}
                onChange={(event) => choose(event.target.value)}
              >
                <option value="">Choose a staff member</option>
                {data?.members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.firstName} {member.lastName} · {member.email}
                  </option>
                ))}
              </select>
            </label>
            {selected && (
              <>
                <label className="block">
                  Access level
                  <select
                    className="block w-full rounded border p-2 bg-background"
                    aria-label="Access level"
                    value={policy.level}
                    onChange={(event) =>
                      setPolicy((current) => ({
                        ...current,
                        level: event.target.value as Policy["level"],
                      }))
                    }
                  >
                    <option value="staff">HR Staff</option>
                    <option value="coordinator">
                      HR Coordinator — employee directory and scheduling
                    </option>
                    <option value="viewer">
                      Read-only Coordinator — employee directory and schedules
                    </option>
                  </select>
                </label>
                <p className="text-sm text-muted-foreground">
                  Selected scope categories must all match. An empty category
                  allows all values in that category. Coordinators cannot access
                  whole-company analytics, billing, clinical records or team
                  administration.
                </p>
                <div className="grid sm:grid-cols-3 gap-4">
                  {(["departments", "businessUnits", "branches"] as const).map(
                    (key) => (
                      <fieldset key={key} className="space-y-2">
                        <legend className="font-medium">
                          {key === "businessUnits"
                            ? "Business units"
                            : key === "departments"
                              ? "Departments"
                              : "Branches / department locations"}
                        </legend>
                        {data?.[key].length ? (
                          data[key].map((value) => (
                            <label key={value} className="flex gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={policy[key].includes(value)}
                                onChange={() => toggle(key, value)}
                              />
                              {value}
                            </label>
                          ))
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            No roster values configured.
                          </p>
                        )}
                      </fieldset>
                    ),
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() =>
                      setPolicy((current) => ({
                        ...current,
                        departments: [],
                        businessUnits: [],
                        branches: [],
                      }))
                    }
                  >
                    Clear scopes
                  </Button>
                  <Button onClick={save} disabled={busy}>
                    Save access
                  </Button>
                </div>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
