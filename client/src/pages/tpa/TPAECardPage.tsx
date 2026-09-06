import { useEffect, useMemo, useState } from "react";
import TPASidebar from "@/components/tpa/TPASidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import api from "@/utils/api";
import { CheckCircle2, CreditCard, Download, QrCode, Shield, Users } from "lucide-react";

type ECardResponse = {
  success: boolean;
  ecard?: {
    cardNumber: string;
    memberId: string;
    employeeId?: string;
    memberName: string;
    corporate?: string;
    policyNumber: string;
    planName?: string;
    insurer?: string;
    validFrom?: string;
    validTill?: string;
    coverageAmount?: number;
    availableBalance?: number;
    dependents?: Array<{ memberId: string; name: string; relation: string; status: string }>;
    qrPayload: string;
    verifyUrl: string;
  };
  eligibility?: {
    eligible: boolean;
    status: string;
    availableBalance: number;
    coverageAmount: number;
    usedAmount: number;
    roomRentLimit: number;
    coPayPercent: number;
    exclusions: string[];
    message: string;
  };
};

const formatCurrency = (amount?: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount || 0);

export default function TPAECardPage() {
  const [memberId, setMemberId] = useState("MEM-001");
  const [data, setData] = useState<ECardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const qrTiles = useMemo(() => Array.from({ length: 64 }, (_, index) => {
    const seed = data?.ecard?.cardNumber || "MEDIQZY";
    return (seed.charCodeAt(index % seed.length) + index) % 3 === 0;
  }), [data?.ecard?.cardNumber]);

  const loadECard = async () => {
    if (!memberId.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const response = await api.post(`/tpa/members/${encodeURIComponent(memberId.trim())}/ecard/generate`);
      setData(response.data);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || "Unable to generate e-card");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadECard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ecard = data?.ecard;
  const eligibility = data?.eligibility;

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <TPASidebar />
      <div className="flex-1 md:ml-64 overflow-auto">
        <div className="px-4 sm:px-6 lg:px-8 py-8 space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
            <div className="space-y-2">
              <h1 className="text-3xl font-bold tracking-tight text-slate-950">Member ID E-Card Generation & Eligibility</h1>
              <p className="text-slate-600 max-w-3xl">
                Generate a TPA-owned e-card against a member ID, verify policy eligibility, show dependents, and expose QR verification data for hospital admission desks.
              </p>
            </div>
            <div className="flex gap-2 rounded-2xl bg-white/80 p-2 shadow-sm border border-white">
              <input
                value={memberId}
                onChange={(event) => setMemberId(event.target.value)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Member ID"
              />
              <button
                onClick={loadECard}
                disabled={loading}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {loading ? "Generating…" : "Generate E-Card"}
              </button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><CreditCard className="h-4 w-4" /> Native card</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">QR-ready</div><p className="text-xs text-slate-500">No external TPA dependency</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Shield className="h-4 w-4" /> Eligibility</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">Live</div><p className="text-xs text-slate-500">Balance, co-pay, exclusions</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4" /> Dependents</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{ecard?.dependents?.length ?? "—"}</div><p className="text-xs text-slate-500">Family floater support</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Download className="h-4 w-4" /> Download</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">Print</div><p className="text-xs text-slate-500">Browser print/PDF ready</p></CardContent></Card>
          </div>

          {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

          {ecard && eligibility && (
            <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
              <Card className="overflow-hidden border-0 shadow-xl">
                <div className="bg-gradient-to-r from-slate-950 via-blue-950 to-indigo-900 p-6 text-white">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm uppercase tracking-[0.25em] text-blue-200">Mediqzy Corporate Health</p>
                      <h2 className="mt-4 text-3xl font-bold">{ecard.memberName}</h2>
                      <p className="text-blue-100">{ecard.memberId} · {ecard.employeeId}</p>
                    </div>
                    <div className="rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold">{eligibility.eligible ? "Eligible" : "Review"}</div>
                  </div>
                  <div className="mt-8 grid gap-4 md:grid-cols-2">
                    <div><p className="text-xs text-blue-200">Corporate</p><p className="font-semibold">{ecard.corporate}</p></div>
                    <div><p className="text-xs text-blue-200">Policy</p><p className="font-semibold">{ecard.policyNumber}</p></div>
                    <div><p className="text-xs text-blue-200">Plan</p><p className="font-semibold">{ecard.planName}</p></div>
                    <div><p className="text-xs text-blue-200">Valid Till</p><p className="font-semibold">{ecard.validTill}</p></div>
                  </div>
                </div>
                <CardContent className="grid gap-6 p-6 md:grid-cols-3">
                  <div><p className="text-sm text-slate-500">Coverage</p><p className="text-2xl font-bold text-slate-950">{formatCurrency(ecard.coverageAmount)}</p></div>
                  <div><p className="text-sm text-slate-500">Available</p><p className="text-2xl font-bold text-emerald-700">{formatCurrency(ecard.availableBalance)}</p></div>
                  <div><p className="text-sm text-slate-500">Co-pay</p><p className="text-2xl font-bold text-slate-950">{eligibility.coPayPercent}%</p></div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><QrCode className="h-5 w-5" /> QR Verification</CardTitle>
                  <CardDescription>Use this payload to render a QR or verify at an authenticated hospital/TPA desk.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-8 gap-1 rounded-2xl bg-white p-4 shadow-inner w-fit">
                    {qrTiles.map((active, index) => <span key={index} className={`h-4 w-4 rounded-sm ${active ? "bg-slate-950" : "bg-slate-100"}`} />)}
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-700 break-all">{ecard.qrPayload}</div>
                  <p className="text-sm text-slate-500">Verification URL: <span className="font-mono">{ecard.verifyUrl}</span></p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-600" /> Eligibility Rules</CardTitle></CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <p className="rounded-xl bg-emerald-50 p-3 text-emerald-800">{eligibility.message}</p>
                  <p><span className="font-semibold">Room rent limit:</span> {formatCurrency(eligibility.roomRentLimit)}</p>
                  <div>
                    <p className="font-semibold">Exclusions</p>
                    <ul className="mt-2 list-disc pl-5 text-slate-600">
                      {(eligibility.exclusions || []).map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Dependents / Beneficiaries</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {(ecard.dependents || []).length === 0 ? <p className="text-sm text-slate-500">No dependents linked.</p> : ecard.dependents?.map((dependent) => (
                    <div key={dependent.memberId} className="rounded-xl border border-slate-200 p-3">
                      <p className="font-semibold text-slate-900">{dependent.name}</p>
                      <p className="text-sm text-slate-500">{dependent.memberId} · {dependent.relation} · {dependent.status}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
