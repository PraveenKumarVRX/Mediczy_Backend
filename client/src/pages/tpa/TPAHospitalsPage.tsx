import { useEffect, useMemo, useState } from "react";
import TPASidebar from "@/components/tpa/TPASidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import api from "@/utils/api";
import { Clock3, Hospital, MapPin, Search, ShieldCheck, Star } from "lucide-react";

type HospitalRecord = {
  hospitalCode: string;
  hospitalName: string;
  name: string;
  city?: string;
  state?: string;
  pincode?: string;
  address?: string;
  specialties?: string[];
  cashlessEnabled?: boolean;
  preferredProvider?: boolean;
  contactPhone?: string;
  tariffMetadata?: Record<string, any>;
  cashlessIntelligence?: {
    cashlessEligible: boolean;
    priority: string;
    expectedPreAuthSlaHours: number;
    packageHints: Record<string, any>;
  };
};

export default function TPAHospitalsPage() {
  const [search, setSearch] = useState("");
  const [city, setCity] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [hospitals, setHospitals] = useState<HospitalRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHospitals = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get('/tpa/network-hospitals', { params: { search, city, specialty, cashless: true, limit: 50 } });
      setHospitals(response.data?.hospitals || []);
      setTotal(response.data?.total || 0);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Unable to fetch network hospitals');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHospitals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const preferredCount = useMemo(() => hospitals.filter((hospital) => hospital.preferredProvider).length, [hospitals]);
  const fastestSla = useMemo(() => Math.min(...hospitals.map((hospital) => hospital.cashlessIntelligence?.expectedPreAuthSlaHours || 8), 8), [hospitals]);

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <TPASidebar />
      <div className="flex-1 md:ml-64 overflow-auto">
        <div className="px-4 sm:px-6 lg:px-8 py-8 space-y-6">
          <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4">
            <div className="space-y-2">
              <h1 className="text-3xl font-bold tracking-tight text-slate-950">Network Hospital Intelligence</h1>
              <p className="text-slate-600 max-w-3xl">
                Search Mediqzy-native provider network data with cashless eligibility, preferred-provider signals, specialty coverage, tariffs, and pre-auth SLA hints.
              </p>
            </div>
            <div className="grid gap-2 rounded-2xl bg-white/85 p-3 shadow-sm border border-white md:grid-cols-[1fr_1fr_1fr_auto]">
              <input value={search} onChange={(e) => setSearch(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Hospital / address" />
              <input value={city} onChange={(e) => setCity(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="City" />
              <input value={specialty} onChange={(e) => setSpecialty(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Specialty" />
              <button onClick={loadHospitals} disabled={loading} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
                {loading ? "Searching…" : "Search"}
              </button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Hospital className="h-4 w-4" /> Hospitals</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{total}</div><p className="text-xs text-slate-500">Native network records</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Cashless</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{hospitals.filter(h => h.cashlessEnabled).length}</div><p className="text-xs text-slate-500">Eligible now</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Star className="h-4 w-4" /> Preferred</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{preferredCount}</div><p className="text-xs text-slate-500">Priority providers</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Clock3 className="h-4 w-4" /> Fastest SLA</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{fastestSla}h</div><p className="text-xs text-slate-500">Expected pre-auth</p></CardContent></Card>
          </div>

          {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

          <div className="grid gap-4 lg:grid-cols-2">
            {hospitals.map((hospital) => (
              <Card key={hospital.hospitalCode} className="overflow-hidden border-0 shadow-md">
                <CardHeader className="bg-white">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-xl text-slate-950">{hospital.hospitalName || hospital.name}</CardTitle>
                      <CardDescription className="flex items-center gap-1 mt-1"><MapPin className="h-3.5 w-3.5" /> {hospital.city}, {hospital.state} {hospital.pincode}</CardDescription>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${hospital.preferredProvider ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>
                      {hospital.preferredProvider ? 'Preferred' : 'Standard'}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 p-5">
                  <p className="text-sm text-slate-600">{hospital.address}</p>
                  <div className="flex flex-wrap gap-2">
                    {(hospital.specialties || []).map((item) => <span key={item} className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">{item}</span>)}
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-xl bg-emerald-50 p-3"><p className="text-xs text-emerald-700">Cashless</p><p className="font-bold text-emerald-900">{hospital.cashlessEnabled ? 'Enabled' : 'No'}</p></div>
                    <div className="rounded-xl bg-indigo-50 p-3"><p className="text-xs text-indigo-700">Pre-auth SLA</p><p className="font-bold text-indigo-900">{hospital.cashlessIntelligence?.expectedPreAuthSlaHours || 8} hours</p></div>
                    <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Contact</p><p className="font-bold text-slate-900">{hospital.contactPhone || '—'}</p></div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <p className="text-sm font-semibold text-slate-900">Tariff/package hints</p>
                    <pre className="mt-2 overflow-auto text-xs text-slate-600">{JSON.stringify(hospital.tariffMetadata || {}, null, 2)}</pre>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {!loading && hospitals.length === 0 && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-14 text-center">
                <Search className="h-10 w-10 text-slate-400" />
                <p className="mt-3 font-semibold text-slate-900">No hospitals found</p>
                <p className="text-sm text-slate-500">Try another city, specialty, or hospital name.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
