/**
 * Hospital / clinic administration of care units: branches, outreach clinics, medical centres and the Occupational Health Clinics (OHC)
 * that sit under them. Replaces the old "Branches & Outreach Clinics" page, whose outreach clinics were an in-browser mock.
 * Everything shown comes from the server; a failed load is an error, an empty list an empty state.
 */
import { useMemo, useState } from "react";
import { Building2, HeartPulse, Plus, Stethoscope, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineError } from "@/components/ui/inline-error";
import { cn } from "@/lib/utils";
import { AddUnitDialog } from "./AddUnitDialog";
import { UnitDrawer } from "./UnitDrawer";
import { useUnits } from "./careUnitsApi";
import { CONTRACT_LABEL, CONTRACT_TONE, PATTERN_LABEL, TYPE_LABEL } from "./format";
import type { CareUnit, UnitType } from "./types";

function UnitRow({ unit, nested, onOpen }: { unit: CareUnit; nested?: boolean; onOpen: (u: CareUnit) => void }) {
  const Icon = unit.type === "ohc" ? Stethoscope : unit.type === "outreach_clinic" ? HeartPulse : Building2;
  return (
    <li className={cn(nested && "ml-6 border-l pl-4")}>
      <button type="button" onClick={() => onOpen(unit)}
        className="flex w-full flex-wrap items-center gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted"><Icon className="size-4" aria-hidden /></span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{unit.name}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {TYPE_LABEL[unit.type]}
            {unit.visitPattern ? ` · ${PATTERN_LABEL[unit.visitPattern]}` : ""}
            {unit.brandName ? ` · ${unit.brandName}` : ""}
            {unit.type === "ohc" && unit.corporateName ? ` · ${unit.corporateName}` : ""}
            {unit.address.city ? ` · ${unit.address.city}` : ""}
          </span>
        </span>
        {unit.type === "ohc" && unit.contract && (
          <Badge variant="outline" className={cn("border-transparent", CONTRACT_TONE[unit.contract.status])}>{CONTRACT_LABEL[unit.contract.status]}</Badge>
        )}
        {unit.type === "medical_centre" && <Badge variant="outline">Co-owned</Badge>}
        {!unit.active && <Badge variant="secondary">Inactive</Badge>}
        {unit.type === "ohc" && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Users className="size-3.5" aria-hidden />{unit.staffCount ?? 0}</span>}
      </button>
    </li>
  );
}

export function CareUnitsManager() {
  const q = useUnits();
  const [adding, setAdding] = useState<UnitType | null>(null);
  const [openUid, setOpenUid] = useState<string | null>(null);
  const units = q.data ?? [];
  const open = units.find((u) => u.uid === openUid) ?? null;

  const { roots, children } = useMemo(() => {
    const kids = new Map<string, CareUnit[]>();
    for (const u of units) if (u.parent) kids.set(u.parent.uid, [...(kids.get(u.parent.uid) ?? []), u]);
    return { roots: units.filter((u) => !u.parent), children: kids };
  }, [units]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-prose text-sm text-muted-foreground">
          Outreach clinics and medical centres extend your facility. An Occupational Health Clinic (OHC) sits under one of them, inside a company, and serves that company only.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setAdding("outreach_clinic")}><Plus className="mr-2 size-4" />Outreach clinic</Button>
          <Button variant="outline" onClick={() => setAdding("medical_centre")}><Plus className="mr-2 size-4" />Medical centre</Button>
          <Button onClick={() => setAdding("ohc")}><Plus className="mr-2 size-4" />Occupational Health Clinic</Button>
        </div>
      </div>

      {q.isLoading && <div className="space-y-2" aria-busy="true"><Skeleton className="h-14" /><Skeleton className="h-14" /><Skeleton className="h-14" /></div>}
      {q.isError && <InlineError message="Could not load your units." description="Nothing is shown rather than out-of-date or invented units." onRetry={() => q.refetch()} />}
      {q.data && units.length === 0 && (
        <EmptyState icon={Building2} title="No units yet" description="Add an outreach clinic or a medical centre, then set up an Occupational Health Clinic under it."
          action={{ label: "Add an outreach clinic", onClick: () => setAdding("outreach_clinic") }} />
      )}
      {units.length > 0 && (
        <ul className="space-y-2" aria-label="Units">
          {roots.map((u) => (
            <li key={u.uid} className="space-y-2">
              <ul><UnitRow unit={u} onOpen={(x) => setOpenUid(x.uid)} /></ul>
              {(children.get(u.uid) ?? []).length > 0 && (
                <ul className="space-y-2">{(children.get(u.uid) ?? []).map((k) => <UnitRow key={k.uid} unit={k} nested onOpen={(x) => setOpenUid(x.uid)} />)}</ul>
              )}
            </li>
          ))}
        </ul>
      )}

      <AddUnitDialog open={adding !== null} onOpenChange={(o) => !o && setAdding(null)} units={units} defaultType={adding ?? "outreach_clinic"} />
      <UnitDrawer unit={open} onClose={() => setOpenUid(null)} />
    </div>
  );
}

export default CareUnitsManager;
