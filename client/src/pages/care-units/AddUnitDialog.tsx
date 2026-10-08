import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { searchCoOwners, searchCorporates, toProblem, useUnitMutations } from "./careUnitsApi";
import { PATTERN_LABEL, TYPE_HINT, TYPE_LABEL } from "./format";
import type { CareUnit, UnitType, VisitPattern } from "./types";

const CREATABLE: UnitType[] = ["outreach_clinic", "medical_centre", "ohc", "branch"];

/** Search-as-you-type picker over a server lookup. The chosen entity is shown by name; only its uid is sent. */
function EntityPicker({ id, label, search, value, onChange }: {
  id: string; label: string; search: (q: string) => Promise<{ uid: string; name: string; kind?: string }[]>;
  value: { uid: string; name: string } | null; onChange: (v: { uid: string; name: string } | null) => void;
}) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<{ uid: string; name: string; kind?: string }[]>([]);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (value || term.trim().length < 2) { setResults([]); return; }
    let live = true;
    const t = setTimeout(() => { search(term).then((r) => { if (live) { setResults(r); setFailed(false); } }).catch(() => live && setFailed(true)); }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [term, value, search]);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {value ? (
        <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-sm">
          <span>{value.name}</span><button type="button" className="text-xs underline" onClick={() => { onChange(null); setTerm(""); }}>Change</button>
        </div>
      ) : (
        <>
          <Input id={id} value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Type at least 2 letters" autoComplete="off" />
          {failed && <p className="text-xs text-red-600">Could not search. Try again.</p>}
          {results.length > 0 && (
            <ul className="max-h-40 overflow-y-auto rounded-md border" role="listbox" aria-label={label}>
              {results.map((r) => (
                <li key={r.uid}><button type="button" role="option" aria-selected={false} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent"
                  onClick={() => onChange({ uid: r.uid, name: r.name })}>{r.name}{r.kind && <span className="text-xs capitalize text-muted-foreground">{r.kind}</span>}</button></li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

interface Props { open: boolean; onOpenChange: (o: boolean) => void; units: CareUnit[]; defaultType?: UnitType }

export function AddUnitDialog({ open, onOpenChange, units, defaultType = "outreach_clinic" }: Props) {
  const { create } = useUnitMutations();
  const { toast } = useToast();
  const [type, setType] = useState<UnitType>(defaultType);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");
  const [visit, setVisit] = useState<VisitPattern>("weekly");
  const [brand, setBrand] = useState("");
  const [coOwner, setCoOwner] = useState<{ uid: string; name: string } | null>(null);
  const [parent, setParent] = useState("");
  const [corporate, setCorporate] = useState<{ uid: string; name: string } | null>(null);
  const [initiatedBy, setInitiatedBy] = useState<"corporate" | "operator">("corporate");
  const [contractRef, setContractRef] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  useEffect(() => { if (open) setType(defaultType); }, [open, defaultType]);
  const parents = useMemo(() => units.filter((u) => (u.type === "outreach_clinic" || u.type === "medical_centre") && u.active), [units]);

  const valid = name.trim().length >= 2
    && (type !== "medical_centre" || (brand.trim().length > 1 && coOwner))
    && (type !== "ohc" || (parent && corporate));

  const submit = async () => {
    const body: Record<string, unknown> = { type, name: name.trim(), city: city.trim() || undefined, phone: phone.trim() || undefined };
    if (type === "outreach_clinic") body.visitPattern = visit;
    if (type === "medical_centre") { body.brandName = brand.trim(); body.coOwnerUid = coOwner?.uid; }
    if (type === "ohc") {
      Object.assign(body, { parentUid: parent, corporateUid: corporate?.uid, initiatedBy, contractRef: contractRef.trim() || undefined, contractStart: start || undefined, contractEnd: end || undefined });
    }
    try {
      await create.mutateAsync(body);
      toast({ title: "Unit created", description: type === "ohc" ? "The company must accept the contract before the OHC can work." : `${TYPE_LABEL[type]} added.` });
      setName(""); setCity(""); setPhone(""); setBrand(""); setCoOwner(null); setParent(""); setCorporate(null); setContractRef(""); setStart(""); setEnd("");
      onOpenChange(false);
    } catch (e) {
      toast({ variant: "destructive", title: "Could not create the unit", description: toProblem(e).message });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader><DialogTitle>Add a unit</DialogTitle><DialogDescription>{TYPE_HINT[type]}</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="au-type">Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as UnitType)}>
              <SelectTrigger id="au-type"><SelectValue /></SelectTrigger>
              <SelectContent>{CREATABLE.map((t) => <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label htmlFor="au-name">Name</Label><Input id="au-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="au-city">City</Label><Input id="au-city" value={city} maxLength={80} onChange={(e) => setCity(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="au-phone">Phone</Label><Input id="au-phone" inputMode="tel" value={phone} maxLength={20} onChange={(e) => setPhone(e.target.value)} /></div>
        </div>

        {type === "outreach_clinic" && (
          <div className="space-y-1.5 sm:w-1/2">
            <Label htmlFor="au-visit">Visit pattern</Label>
            <Select value={visit} onValueChange={(v) => setVisit(v as VisitPattern)}>
              <SelectTrigger id="au-visit"><SelectValue /></SelectTrigger>
              <SelectContent>{(Object.keys(PATTERN_LABEL) as VisitPattern[]).map((p) => <SelectItem key={p} value={p}>{PATTERN_LABEL[p]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        )}

        {type === "medical_centre" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="au-brand">Brand name</Label><Input id="au-brand" value={brand} maxLength={120} onChange={(e) => setBrand(e.target.value)} placeholder="Co-branded name" /></div>
            <EntityPicker id="au-coowner" label="Co-owner" search={searchCoOwners} value={coOwner} onChange={setCoOwner} />
          </div>
        )}

        {type === "ohc" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="au-parent">Sits under</Label>
              <Select value={parent} onValueChange={setParent}>
                <SelectTrigger id="au-parent"><SelectValue placeholder={parents.length ? "Choose an outreach clinic or medical centre" : "Add an outreach clinic or medical centre first"} /></SelectTrigger>
                <SelectContent>{parents.map((u) => <SelectItem key={u.uid} value={u.uid}>{u.name} · {TYPE_LABEL[u.type]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <EntityPicker id="au-corp" label="Company it serves" search={searchCorporates} value={corporate} onChange={setCorporate} />
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="au-init">Set up by</Label>
                <Select value={initiatedBy} onValueChange={(v) => setInitiatedBy(v as "corporate" | "operator")}>
                  <SelectTrigger id="au-init"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="corporate">The company</SelectItem><SelectItem value="operator">Us</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label htmlFor="au-ref">Contract reference</Label><Input id="au-ref" value={contractRef} maxLength={80} onChange={(e) => setContractRef(e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="au-start">Contract start</Label><Input id="au-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="au-end">Contract end</Label><Input id="au-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
            </div>
            <p className="text-xs text-muted-foreground">You accept the contract by creating it. The OHC starts working once the company accepts it in its own portal.</p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>Cancel</Button>
          <Button onClick={submit} disabled={!valid || create.isPending}>{create.isPending ? "Creating…" : "Create unit"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
