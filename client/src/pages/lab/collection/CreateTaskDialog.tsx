import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InlineError } from "@/components/ui/inline-error";
import { useCollectionMutations, usePartners } from "./collectionApi";
import { useProblemToast } from "./useProblemToast";
import { formatWhen } from "./format";
import type { CollectionMode } from "./types";

type Source = "booking" | "manual" | "admission";
interface Props { mode: CollectionMode; open: boolean; onOpenChange: (open: boolean) => void; onCreated?: (taskId: string) => void }

const toIso = (local: string) => (local ? new Date(local).toISOString() : undefined);
const testsFrom = (text: string) => text.split("\n").map((s) => s.trim()).filter(Boolean).map((name) => ({ name }));

export function CreateTaskDialog({ mode, open, onOpenChange, onCreated }: Props) {
  const partners = usePartners(open);
  const { createTask } = useCollectionMutations();
  const problem = useProblemToast();
  const [source, setSource] = useState<Source>(mode === "ward" ? "admission" : "booking");
  const [bookingId, setBookingId] = useState("");
  const [admissionRef, setAdmissionRef] = useState("");
  const [patientName, setPatientName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [line1, setLine1] = useState("");
  const [city, setCity] = useState("");
  const [pincode, setPincode] = useState("");
  const [phone, setPhone] = useState("");
  const [tests, setTests] = useState("");
  const [priority, setPriority] = useState("routine");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [isolation, setIsolation] = useState(false);
  const [round, setRound] = useState("");

  useEffect(() => { if (open) setSource(mode === "ward" ? "admission" : "booking"); }, [open, mode]);

  const admission = useMemo(() => partners.data?.bridgeableAdmissions.find((a) => a.admissionRef === admissionRef), [partners.data, admissionRef]);
  const testList = testsFrom(tests);

  const valid = useMemo(() => {
    if (source === "booking") return Boolean(bookingId);
    if (source === "admission") return Boolean(admissionRef) && patientName.trim().length >= 2 && testList.length > 0;
    return patientName.trim().length >= 2 && line1.trim().length > 0 && city.trim().length > 0 && testList.length > 0;
  }, [source, bookingId, admissionRef, patientName, line1, city, testList.length]);

  const submit = async () => {
    const common = { priority, scheduledStart: toIso(start), scheduledEnd: toIso(end) };
    const patient = { name: patientName.trim(), age: age ? Number(age) : undefined, gender: gender || undefined };
    let body: Record<string, unknown>;
    if (source === "booking") body = { mode: "home", source: "booking", bookingId, ...common };
    else if (source === "admission") body = {
      mode: "ward", source: "admission", facilityUid: admission?.facilityUid, admissionRef, patient, tests: testList,
      isolationRequired: isolation, roundLabel: round.trim() || undefined, ...common,
    };
    else body = {
      mode: "home", source: "manual", patient, tests: testList, contactPhone: phone.trim() || undefined,
      address: { line1: line1.trim(), city: city.trim(), pincode: pincode.trim() || undefined }, ...common,
    };
    try {
      const res = await createTask.mutateAsync(body) as { task?: { id: string } };
      onOpenChange(false);
      if (res?.task?.id) onCreated?.(res.task.id);
    } catch (e) {
      problem(e, "Could not create the task");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New {mode === "ward" ? "ward" : "home"} collection</DialogTitle>
          <DialogDescription>
            Bookings and admissions are listed only for hospitals this lab is linked to. The server derives the lab from your login.
          </DialogDescription>
        </DialogHeader>

        {mode === "home" && (
          <Tabs value={source} onValueChange={(v) => setSource(v as Source)}>
            <TabsList><TabsTrigger value="booking">From a booking</TabsTrigger><TabsTrigger value="manual">Manual entry</TabsTrigger></TabsList>
          </Tabs>
        )}

        {partners.isError && <InlineError message="Could not load linked hospitals." onRetry={() => partners.refetch()} />}

        {source === "booking" && (
          <div className="space-y-1.5">
            <Label htmlFor="ct-booking">Booking</Label>
            <Select value={bookingId} onValueChange={setBookingId}>
              <SelectTrigger id="ct-booking"><SelectValue placeholder={partners.isLoading ? "Loading…" : "Choose a booking"} /></SelectTrigger>
              <SelectContent>
                {(partners.data?.bridgeableBookings ?? []).map((b) => (
                  <SelectItem key={b.bookingId} value={b.bookingId}>{b.patientName || "Patient"} · {b.slot || formatWhen(b.collectionDate)} · {b.bookingId.slice(-8)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {partners.data && partners.data.bridgeableBookings.length === 0 && (
              <p className="text-sm text-muted-foreground">No confirmed home bookings are waiting. Link a hospital, or use manual entry.</p>
            )}
          </div>
        )}

        {source === "admission" && (
          <div className="space-y-1.5">
            <Label htmlFor="ct-adm">Admitted patient</Label>
            <Select value={admissionRef} onValueChange={setAdmissionRef}>
              <SelectTrigger id="ct-adm"><SelectValue placeholder={partners.isLoading ? "Loading…" : "Choose an admission"} /></SelectTrigger>
              <SelectContent>
                {(partners.data?.bridgeableAdmissions ?? []).map((a) => (
                  <SelectItem key={a.admissionRef} value={a.admissionRef}>{a.admissionNumber || `Admission ${a.admissionRef}`} · {a.wardName || "Ward"} · {a.bedLabel || "bed ?"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {partners.data && partners.data.bridgeableAdmissions.length === 0 && (
              <p className="text-sm text-muted-foreground">No admissions available. Ward collection needs a linked hospital with ward access enabled.</p>
            )}
          </div>
        )}

        {source !== "booking" && (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="ct-name">Patient name</Label><Input id="ct-name" value={patientName} maxLength={120} onChange={(e) => setPatientName(e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="ct-age">Age</Label><Input id="ct-age" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, "").slice(0, 3))} /></div>
            </div>
            <div className="space-y-1.5 sm:w-1/2">
              <Label htmlFor="ct-gender">Gender</Label>
              <Select value={gender} onValueChange={setGender}>
                <SelectTrigger id="ct-gender"><SelectValue placeholder="Not stated" /></SelectTrigger>
                <SelectContent><SelectItem value="female">Female</SelectItem><SelectItem value="male">Male</SelectItem><SelectItem value="other">Other</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ct-tests">Tests (one per line)</Label>
              <Textarea id="ct-tests" rows={3} value={tests} onChange={(e) => setTests(e.target.value)} placeholder={"CBC\nLipid profile"} />
            </div>
          </>
        )}

        {source === "manual" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="ct-line1">Address</Label><Input id="ct-line1" value={line1} maxLength={200} onChange={(e) => setLine1(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="ct-city">City</Label><Input id="ct-city" value={city} maxLength={80} onChange={(e) => setCity(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="ct-pin">Pincode</Label><Input id="ct-pin" value={pincode} maxLength={12} onChange={(e) => setPincode(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="ct-phone">Contact phone</Label><Input id="ct-phone" inputMode="tel" value={phone} maxLength={20} onChange={(e) => setPhone(e.target.value)} /></div>
          </div>
        )}

        {source === "admission" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="ct-round">Round (optional)</Label><Input id="ct-round" value={round} maxLength={60} onChange={(e) => setRound(e.target.value)} placeholder="e.g. 06:00 round" /></div>
            <label className="flex items-center gap-2 pt-6 text-sm"><Checkbox checked={isolation} onCheckedChange={(v) => setIsolation(v === true)} />Isolation precautions apply</label>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="ct-priority">Priority</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger id="ct-priority"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="routine">Routine</SelectItem><SelectItem value="urgent">Urgent</SelectItem><SelectItem value="stat">STAT</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label htmlFor="ct-start">Window start</Label><Input id="ct-start" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="ct-end">Window end</Label><Input id="ct-end" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={createTask.isPending}>Cancel</Button>
          <Button onClick={submit} disabled={!valid || createTask.isPending}>{createTask.isPending ? "Creating…" : "Create task"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
