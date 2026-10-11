/**
 * The company's view of its Occupational Health Clinic(s): the OHC operated for it by a hospital or clinic under contract. Shows the
 * contract (and lets the super-HR accept or end it), the OHC's services, the staff linked to it, volumes, the fitness certificates it
 * issued, and who has accessed this data. All data comes from /api/corporate/ohc-units.
 */
import { useState } from "react";
import { AlertTriangle, Building2, Pill, ShieldCheck, Stethoscope, Users } from "lucide-react";
import CorporateLayout from "@/components/corporate/CorporateLayout";
import CorporatePageHeader from "@/components/corporate/CorporatePageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineError } from "@/components/ui/inline-error";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  downloadCorporateCertificate, toProblem, useClinicianMutations, useCorporateDashboard, useCorporateLog, useCorporateOhcCertificates,
  useCorporateOhcEmergencies, useCorporateOhcEmployees, useCorporateOhcMutations, useCorporateOhcs, useMyPrescriptions, useUnitMutations,
} from "../care-units/careUnitsApi";
import { CertificatesTable, EmergenciesPanel, EmergencyReportDialog, IssueCertificateDialog, PrescriptionDialog, PrescriptionsTable, ReferralDialog, StaffList } from "../care-units/ohcPanels";
import { CONTRACT_LABEL, CONTRACT_TONE, FITNESS_LABEL, formatDate } from "../care-units/format";
import type { CareUnit, Employee } from "../care-units/types";

const card = "rounded-xl border border-white/[0.06] bg-slate-900/60 p-4";

function Dashboard({ uid }: { uid: string }) {
  const dash = useCorporateDashboard(uid);
  const log = useCorporateLog(uid);
  const { corporateAccept, corporateEnd } = useUnitMutations();
  const { toast } = useToast();
  const [ending, setEnding] = useState(false);
  const [reason, setReason] = useState("");
  const isCmo = Boolean(dash.data?.cmo);
  const cmo = dash.data?.cmo;

  const [empSearch, setEmpSearch] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [issueFor, setIssueFor] = useState<Employee | null>(null);
  const [prescribeFor, setPrescribeFor] = useState<Employee | null>(null);
  const [referFor, setReferFor] = useState<Employee | null>(null);
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const employeesQuery = useCorporateOhcEmployees(isCmo ? uid : null, empSearch);
  const certsQuery = useCorporateOhcCertificates(isCmo ? uid : null);
  const emergenciesQuery = useCorporateOhcEmergencies(isCmo ? uid : null);
  const prescriptionsQuery = useMyPrescriptions(isCmo);
  const ops = useCorporateOhcMutations(uid);
  const clinician = useClinicianMutations();

  if (dash.isLoading) return <div className="space-y-3" aria-busy="true"><Skeleton className="h-24" /><Skeleton className="h-40" /></div>;
  if (dash.isError || !dash.data) return <InlineError message="Could not load this OHC." onRetry={() => dash.refetch()} />;
  const { unit, staff, services, stats, certificates } = dash.data;
  const c = unit.contract!;

  const accept = async () => {
    try { await corporateAccept.mutateAsync(uid); toast({ title: "Contract accepted", description: "The OHC can now start working." }); }
    catch (e) { toast({ variant: "destructive", title: "Could not accept", description: toProblem(e).message }); }
  };
  const end = async () => {
    try { await corporateEnd.mutateAsync({ uid, reason: reason.trim() }); setEnding(false); setReason(""); toast({ title: "Contract ended" }); }
    catch (e) { toast({ variant: "destructive", title: "Could not end the contract", description: toProblem(e).message }); }
  };

  return (
    <div className="space-y-4">
      <section className={card} aria-labelledby="ct">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="ct" className="text-lg font-semibold text-white">{unit.name}</h2>
            <p className="text-sm text-slate-400">Operated by {unit.operatorName ?? "your hospital/clinic partner"}{unit.parent ? ` · under ${unit.parent.name}` : ""}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${CONTRACT_TONE[c.status]}`}>{CONTRACT_LABEL[c.status]}</span>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div><dt className="text-slate-500">Reference</dt><dd className="text-slate-200">{c.ref || "—"}</dd></div>
          <div><dt className="text-slate-500">Period</dt><dd className="text-slate-200">{formatDate(c.start)} – {formatDate(c.end)}</dd></div>
          <div><dt className="text-slate-500">Set up by</dt><dd className="text-slate-200">{c.initiatedBy === "corporate" ? "Your company" : "The operator"}</dd></div>
          <div><dt className="text-slate-500">Location</dt><dd className="text-slate-200">{[unit.address.line, unit.address.city].filter(Boolean).join(", ") || "—"}</dd></div>
        </dl>
        {c.status === "proposed" && (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-200">
            <span className="flex-1">The operator has proposed this contract. The OHC cannot start until you accept it.</span>
            <Button onClick={accept} disabled={corporateAccept.isPending}>{corporateAccept.isPending ? "Accepting…" : "Accept contract"}</Button>
          </div>
        )}
        {c.status !== "ended" && <Button className="mt-3" variant="outline" size="sm" onClick={() => setEnding(true)}>End contract</Button>}
      </section>

      <div className="grid gap-4 md:grid-cols-4">
        {[["Certificates issued", stats.total], ["Last 30 days", stats.last_30d], ["Fit with restrictions", stats.restricted], ["Unfit", stats.unfit]].map(([label, n]) => (
          <div key={label as string} className={card}><p className="text-xs text-slate-500">{label}</p><p className="text-2xl font-semibold text-white tabular-nums">{n}</p></div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={card} aria-labelledby="sv">
          <h3 id="sv" className="mb-2 flex items-center gap-2 text-sm font-semibold text-white"><Stethoscope className="size-4" aria-hidden />Services</h3>
          {services.length ? <ul className="flex flex-wrap gap-2">{services.map((s) => <li key={s} className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-200">{s}</li>)}</ul> : <p className="text-sm text-slate-500">The operator has not listed services yet.</p>}
        </section>
        <section className={card} aria-labelledby="sf">
          <h3 id="sf" className="mb-2 flex items-center gap-2 text-sm font-semibold text-white"><Users className="size-4" aria-hidden />Staff linked to this OHC</h3>
          {isCmo ? (
            <StaffList
              staff={staff}
              listError={false}
              onRetry={() => dash.refetch()}
              onToggleActive={async (staffUid, active) => { await ops.setStaffActive.mutateAsync({ staffUid, active }); dash.refetch(); }}
            />
          ) : staff.length ? (
            <ul className="divide-y divide-white/[0.06] text-sm">
              {staff.map((s) => <li key={s.uid} className="flex items-center justify-between py-2"><span className="text-slate-200">{s.name}</span><span className="text-xs text-slate-400">{s.role === "ohc_doctor" ? "OHC doctor" : "OHC staff"}{s.active ? "" : " · removed"}</span></li>)}
            </ul>
          ) : <p className="text-sm text-slate-500">No staff assigned yet.</p>}
        </section>
      </div>

      {isCmo && cmo && !cmo.registrationNumberOnFile && (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          Your medical registration number is not on file, so you cannot sign certificates yet. Ask your administrator to add it.
        </p>
      )}

      <section className={card} aria-labelledby="fc">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="fc" className="flex items-center gap-2 text-sm font-semibold text-white"><ShieldCheck className="size-4" aria-hidden />Fitness certificates issued by this OHC</h3>
          {isCmo && <Button size="sm" disabled={!cmo?.canSign} onClick={() => setPickerOpen((o) => !o)}>Employee actions</Button>}
        </div>
        {isCmo && pickerOpen && (
          <div className="mb-3 mt-2 space-y-2 rounded-lg border border-white/[0.06] bg-slate-950/40 p-3">
            <Label htmlFor="emp-search" className="text-xs text-slate-400">Find an employee</Label>
            <Input id="emp-search" value={empSearch} placeholder="Name or employee id" onChange={(e) => setEmpSearch(e.target.value)} />
            <ul className="divide-y divide-white/[0.06]">
              {(employeesQuery.data ?? []).map((e) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span className="text-slate-200">{e.name}<span className="block text-xs text-slate-500">{[e.employeeId, e.department].filter(Boolean).join(" · ")}</span></span>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="outline" disabled={!cmo?.canSign} onClick={() => setIssueFor(e)}>Certificate</Button>
                    <Button size="sm" variant="outline" disabled={!cmo?.canSign} onClick={() => setPrescribeFor(e)}>Prescribe</Button>
                    <Button size="sm" variant="outline" disabled={!cmo?.canSign} onClick={() => setReferFor(e)}>Refer</Button>
                  </div>
                </li>
              ))}
              {employeesQuery.data?.length === 0 && <li className="py-2 text-sm text-slate-500">No employees found.</li>}
            </ul>
          </div>
        )}
        {isCmo ? (
          <CertificatesTable
            certs={certsQuery.data ?? null}
            listError={certsQuery.isError}
            onRetry={() => certsQuery.refetch()}
            onDownload={(id) => downloadCorporateCertificate(uid, id)}
          />
        ) : certificates.length === 0 ? <p className="text-sm text-slate-500">None yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-slate-500"><tr><th className="py-2 pr-3">Employee</th><th className="pr-3">Result</th><th className="pr-3">Restrictions / remarks</th><th className="pr-3">Valid until</th><th>Doctor</th></tr></thead>
              <tbody>
                {certificates.map((x) => (
                  <tr key={x.id} className="border-t border-white/[0.06] align-top">
                    <td className="py-2 pr-3 text-slate-200">{x.patientName}<span className="block text-xs text-slate-500">{x.employeeId}</span></td>
                    <td className="pr-3 text-slate-200">{FITNESS_LABEL[x.fitnessStatus] ?? x.fitnessStatus}</td>
                    <td className="pr-3 text-slate-300">{[x.restrictions, x.remarks].filter(Boolean).join(" · ") || "—"}</td>
                    <td className="pr-3 text-slate-300">{formatDate(x.validUntil)}</td>
                    <td className="text-slate-300">{x.issuedBy}<span className="block text-xs text-slate-500">{x.doctorRegNo}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {isCmo && (
        <section className={card} aria-labelledby="em">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="em" className="flex items-center gap-2 text-sm font-semibold text-white"><AlertTriangle className="size-4" aria-hidden />Workplace emergencies</h3>
            <Button size="sm" onClick={() => setEmergencyOpen(true)}>Report emergency</Button>
          </div>
          <div className="mt-2">
            <EmergenciesPanel
              emergencies={emergenciesQuery.data ?? null}
              listError={emergenciesQuery.isError}
              onRetry={() => emergenciesQuery.refetch()}
              onAdvance={async (id, status) => { await ops.updateEmergency.mutateAsync({ id, patch: { status } }); emergenciesQuery.refetch(); }}
            />
          </div>
        </section>
      )}

      {isCmo && (
        <section className={card} aria-labelledby="rx">
          <h3 id="rx" className="mb-2 flex items-center gap-2 text-sm font-semibold text-white"><Pill className="size-4" aria-hidden />Prescriptions</h3>
          <p className="mb-2 text-xs text-slate-500">Issued through the hospital's own prescription system. Use "Employee actions" above, then "Prescribe".</p>
          <PrescriptionsTable prescriptions={prescriptionsQuery.data ?? null} listError={prescriptionsQuery.isError} onRetry={() => prescriptionsQuery.refetch()} />
        </section>
      )}

      <section className={card} aria-labelledby="al">
        <h3 id="al" className="mb-1 text-sm font-semibold text-white">Who has accessed this OHC's data</h3>
        <p className="mb-2 text-xs text-slate-500">Every time your company views this page or the operator's staff issue a certificate, it is recorded here and cannot be changed.</p>
        {log.isLoading && <Skeleton className="h-10" />}
        <ul className="space-y-1 text-xs text-slate-300">
          {(log.data ?? []).slice(0, 12).map((e, i) => <li key={i} className="flex justify-between gap-3 border-b border-white/[0.04] py-1"><span>{e.action.replace(/[._]/g, " ")} · {e.actorKind.replace("_", " ")}</span><span className="text-slate-500">{formatDate(e.at)}</span></li>)}
        </ul>
      </section>

      <Dialog open={ending} onOpenChange={setEnding}>
        <DialogContent>
          <DialogHeader><DialogTitle>End this OHC contract?</DialogTitle><DialogDescription>The OHC stops working at once and its staff lose access. Certificates already issued are kept.</DialogDescription></DialogHeader>
          <div className="space-y-1.5"><Label htmlFor="co-reason">Reason</Label><Textarea id="co-reason" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} /></div>
          <DialogFooter><Button variant="outline" onClick={() => setEnding(false)}>Keep it</Button><Button variant="destructive" disabled={!reason.trim() || corporateEnd.isPending} onClick={end}>End contract</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {isCmo && (
        <>
          <IssueCertificateDialog
            employee={issueFor}
            open={issueFor !== null}
            onOpenChange={(o) => !o && setIssueFor(null)}
            onIssue={(input) => ops.issueCertificate.mutateAsync(input)}
            onIssued={() => { certsQuery.refetch(); setPickerOpen(false); setIssueFor(null); }}
          />
          <EmergencyReportDialog
            employees={employeesQuery.data ?? []}
            open={emergencyOpen}
            onOpenChange={setEmergencyOpen}
            onReport={(input) => ops.reportEmergency.mutateAsync(input)}
            onReported={() => emergenciesQuery.refetch()}
          />
          <PrescriptionDialog
            employee={prescribeFor}
            open={prescribeFor !== null}
            onOpenChange={(o) => !o && setPrescribeFor(null)}
            onIssue={(input) => clinician.issuePrescription.mutateAsync(input)}
            onIssued={() => prescriptionsQuery.refetch()}
          />
          <ReferralDialog
            employee={referFor}
            open={referFor !== null}
            onOpenChange={(o) => !o && setReferFor(null)}
            onRefer={(input) => clinician.createReferral.mutateAsync(input)}
            onReferred={() => undefined}
          />
        </>
      )}
    </div>
  );
}

export default function CorporateOhc() {
  const list = useCorporateOhcs();
  const [picked, setPicked] = useState<string | null>(null);
  const units: CareUnit[] = list.data ?? [];
  const current = picked ?? units[0]?.uid ?? null;

  return (
    <CorporateLayout title="Occupational Health Clinic" subtitle="The on-site clinic operated for your company">
      <div className="min-h-screen space-y-5 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 p-4 sm:p-6">
        <CorporatePageHeader icon={Stethoscope} title="Occupational Health Clinic" description="Your OHC's contract, services, staff and the fitness certificates it issues for your employees." />
        {list.isLoading && <Skeleton className="h-24" />}
        {list.isError && <InlineError message="Could not load your OHC." onRetry={() => list.refetch()} />}
        {list.data && units.length === 0 && (
          <EmptyState icon={Building2} title="No OHC yet" description="When a hospital or clinic sets up an Occupational Health Clinic for your company and sends you the contract, it appears here for you to accept." />
        )}
        {units.length > 1 && (
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Your OHCs">
            {units.map((u) => <button key={u.uid} role="tab" aria-selected={u.uid === current} onClick={() => setPicked(u.uid)} className={`rounded-full px-4 py-1.5 text-sm ${u.uid === current ? "bg-teal-600 text-white" : "bg-slate-800 text-slate-300"}`}>{u.name}</button>)}
          </div>
        )}
        {current && <Dashboard key={current} uid={current} />}
      </div>
    </CorporateLayout>
  );
}
