/**
 * COO Dashboard — Chief Operating Officer
 * Operational excellence: live beds, throughput, ALOS
 */

import { useState, useEffect, useCallback } from 'react';
import HospitalLayout from '@/components/hospital/HospitalLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PlaceholderBanner } from '@/components/ui/placeholder-banner';
import {
  ResponsiveContainer, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import {
  Bed, Users, AlertTriangle, RefreshCw, Package,
  Timer, LayoutGrid, Loader2,
} from 'lucide-react';
import api from '@/utils/api';
import { useHospitalAuth } from '@/hooks/useHospitalAuth';

// WP-0.3c: this dashboard previously made zero API calls (confirmed by audit) — every ward, hourly
// throughput, ALOS, staffing, supply-chain and maintenance number was a static seed array. The server's
// own /coo/operations endpoint was also hardcoded (throughputToday/pendingDischarges/erWaitMins).
// Beds (beds+wards), throughput (ip_admissions + ER queue) and ALOS-by-ward (ip_admissions) are now
// real. Staffing (needs HRMS's staff-normalization logic) and Supply/Maintenance (needs SCM's
// tenant-scoped schema + a CMMS ticket system that doesn't exist yet — see WP-1.7) are shown as honest
// placeholders rather than invented.

interface BedWard { ward: string; total: number; occupied: number; reserved: number; maintenance: number }
interface ThroughputHour { hour: string; admissions: number; discharges: number; er: number }
interface AlosWard { ward: string; alos: number | null; n: number }

interface CooData {
  totalBeds: number;
  occupiedBeds: number;
  bedOccupancy: number;
  admissionsToday: number;
  dischargesToday: number;
  pendingDischarges: number;
  erWaitMins: number | null;
  bedsByWard: BedWard[];
  hourlyThroughput: ThroughputHour[];
  alosByWard: AlosWard[];
}

function KPI({ label, value, sub, icon: Icon, color, badge, badgeColor }: {
  label: string; value: string; sub: string; icon: React.ElementType;
  color: string; badge?: string; badgeColor?: string;
}) {
  return (
    <Card className="border-0 shadow-sm hover:shadow-md transition-all">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground font-medium">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
            <p className="text-xs text-muted-foreground mt-1">{sub}</p>
          </div>
          <div className="flex flex-col items-end gap-2 ml-2">
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800">
              <Icon className={`h-5 w-5 ${color}`} />
            </div>
            {badge && <Badge className={`text-xs ${badgeColor || 'bg-slate-100 text-slate-700'}`}>{badge}</Badge>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function BedBar({ ward, total, occupied, reserved, maintenance }: BedWard) {
  const pct = total ? Math.round((occupied / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium truncate max-w-[140px]" title={ward}>{ward}</span>
        <span className="text-muted-foreground ml-2 shrink-0">{occupied}/{total} · <span className={pct >= 90 ? 'text-red-500 font-semibold' : pct >= 75 ? 'text-amber-600' : 'text-emerald-600'}>{pct}%</span></span>
      </div>
      <div className="flex h-2 rounded-full overflow-hidden gap-px bg-slate-100">
        <div className="bg-blue-500 transition-all" style={{ width: `${total ? (occupied / total) * 100 : 0}%` }} />
        <div className="bg-amber-400 transition-all" style={{ width: `${total ? (reserved / total) * 100 : 0}%` }} />
        <div className="bg-red-400 transition-all" style={{ width: `${total ? (maintenance / total) * 100 : 0}%` }} />
        <div className="bg-emerald-200 flex-1" />
      </div>
    </div>
  );
}

export default function COODashboard() {
  const { hospitalData } = useHospitalAuth();
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [data, setData] = useState<CooData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/hospital/coo/operations');
      setData(res.data?.data ?? null);
      setLastUpdated(new Date());
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
        : undefined;
      setError(message || 'Failed to load COO dashboard data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  const occupancyPct = data?.bedOccupancy ?? 0;
  const erWaitMins = data?.erWaitMins;
  const bedsByWard = data?.bedsByWard ?? [];
  const highOccupancyWards = bedsByWard
    .filter((w) => w.total > 0 && Math.round((w.occupied / w.total) * 100) >= 85)
    .sort((a, b) => (b.occupied / b.total) - (a.occupied / a.total));

  return (
    <HospitalLayout title="COO Dashboard" subtitle="Operational Excellence & Live Situational Awareness">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 text-white">
            <LayoutGrid className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold">COO Operations Centre</h1>
            <p className="text-xs text-muted-foreground">
              {hospitalData?.name || 'Hospital'} · Updated {lastUpdated.toLocaleTimeString()}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="gap-1" onClick={load}>
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-teal-600" /></div>
      ) : error ? (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 mb-6 flex items-center justify-between">
          <span>{error}</span>
          <Button size="sm" variant="outline" onClick={load}>Retry</Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4 mb-6">
            <KPI label="Bed Occupancy" value={`${occupancyPct}%`} sub={`${data?.occupiedBeds ?? 0}/${data?.totalBeds ?? 0} beds`}
              icon={Bed} color={occupancyPct >= 90 ? 'text-red-500' : 'text-teal-600'}
              badge={occupancyPct >= 90 ? 'Critical' : occupancyPct >= 80 ? 'High' : 'Normal'}
              badgeColor={occupancyPct >= 90 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'} />
            <KPI label="ER Wait Time" value={erWaitMins != null ? `${erWaitMins} min` : '—'} sub="Current avg, waiting patients" icon={Timer}
              color={erWaitMins == null ? 'text-slate-400' : erWaitMins <= 30 ? 'text-emerald-600' : 'text-red-500'}
              badge={erWaitMins == null ? undefined : erWaitMins <= 30 ? 'On Target' : 'Above Target'}
              badgeColor={erWaitMins != null && erWaitMins <= 30 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'} />
            <KPI label="Admissions Today" value={String(data?.admissionsToday ?? 0)} sub="IPD admissions" icon={Users} color="text-indigo-600" />
            <KPI label="Discharges Today" value={String(data?.dischargesToday ?? 0)} sub={`${data?.pendingDischarges ?? 0} expected, pending`} icon={Users} color="text-purple-600" />
          </div>

          <Tabs defaultValue="beds" className="space-y-5">
            <TabsList className="flex flex-wrap gap-1 h-auto">
              <TabsTrigger value="beds">Live Beds</TabsTrigger>
              <TabsTrigger value="throughput">Throughput</TabsTrigger>
              <TabsTrigger value="staffing">Staffing</TabsTrigger>
              <TabsTrigger value="supply">Supply & Maintenance</TabsTrigger>
            </TabsList>

            <TabsContent value="beds" className="space-y-5">
              <div className="flex flex-wrap gap-4 text-xs">
                {[
                  { color: 'bg-blue-500', label: 'Occupied' },
                  { color: 'bg-amber-400', label: 'Reserved' },
                  { color: 'bg-red-400', label: 'Maintenance' },
                  { color: 'bg-emerald-200', label: 'Available' },
                ].map((l) => (
                  <div key={l.label} className="flex items-center gap-1.5">
                    <div className={`w-3 h-3 rounded ${l.color}`} />
                    <span className="text-muted-foreground">{l.label}</span>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Bed className="h-4 w-4 text-teal-500" /> Ward-wise Occupancy
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {bedsByWard.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-6 text-center">No active beds configured.</p>
                    ) : (
                      bedsByWard.map((w) => <BedBar key={w.ward} {...w} />)
                    )}
                  </CardContent>
                </Card>

                <div className="space-y-5">
                  <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold">Hospital-wide Summary</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4">
                        {[
                          { label: 'Total Beds', value: data?.totalBeds ?? 0, color: 'text-slate-700' },
                          { label: 'Occupied', value: data?.occupiedBeds ?? 0, color: 'text-blue-600' },
                          { label: 'Reserved', value: bedsByWard.reduce((s, w) => s + w.reserved, 0), color: 'text-amber-600' },
                          { label: 'Maintenance', value: bedsByWard.reduce((s, w) => s + w.maintenance, 0), color: 'text-red-500' },
                          { label: 'Occupancy %', value: `${occupancyPct}%`, color: occupancyPct >= 90 ? 'text-red-500' : 'text-teal-600' },
                        ].map((s) => (
                          <div key={s.label} className="p-3 rounded-xl bg-muted/40 text-center">
                            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-0 shadow-sm border-l-4 border-l-red-400">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-red-500" /> High Occupancy Wards
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2.5">
                      {highOccupancyWards.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-2">No wards at ≥85% occupancy.</p>
                      ) : (
                        highOccupancyWards.map((w) => {
                          const pct = Math.round((w.occupied / w.total) * 100);
                          return (
                            <div key={w.ward} className="flex items-center justify-between p-2.5 rounded-lg bg-red-50/60 dark:bg-red-950/20">
                              <div>
                                <p className="text-sm font-medium">{w.ward}</p>
                                <p className="text-xs text-muted-foreground">{w.occupied}/{w.total} beds occupied</p>
                              </div>
                              <Badge className={`${pct >= 95 ? 'bg-red-600' : 'bg-amber-500'} text-white`}>{pct}%</Badge>
                            </div>
                          );
                        })
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="throughput" className="space-y-5">
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Today's Patient Flow — Hourly</CardTitle>
                </CardHeader>
                <CardContent>
                  {(data?.hourlyThroughput?.length ?? 0) === 0 ? (
                    <p className="text-sm text-muted-foreground py-10 text-center">No admissions, discharges or ER arrivals recorded yet today.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={data?.hourlyThroughput} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="hour" tickFormatter={(h) => `${h}:00`} tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                        <Tooltip labelFormatter={(h) => `${h}:00 hrs`} />
                        <Legend />
                        <Bar dataKey="admissions" fill="#6366f1" name="Admissions" radius={[3, 3, 0, 0]} />
                        <Bar dataKey="discharges" fill="#22c55e" name="Discharges" radius={[3, 3, 0, 0]} />
                        <Bar dataKey="er" fill="#f59e0b" name="ER Arrivals" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Average Length of Stay by Ward, last 90d (Days)</CardTitle>
                </CardHeader>
                <CardContent>
                  {(data?.alosByWard?.length ?? 0) === 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">Not enough discharged admissions in the last 90 days to compute ALOS.</p>
                  ) : (
                    <div className="space-y-3">
                      {data?.alosByWard.map((d) => (
                        <div key={d.ward} className="flex items-center justify-between text-sm">
                          <span className="font-medium">{d.ward}</span>
                          <span className="text-muted-foreground">{d.alos}d avg · {d.n} discharges</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="staffing" className="space-y-5">
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Users className="h-4 w-4 text-indigo-500" /> Staffing
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <PlaceholderBanner
                    title="Staffing attendance isn't wired to this dashboard yet"
                    reason="Real attendance data exists in the HRMS module (Staff → Attendance) but isn't yet aggregated here."
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="supply" className="space-y-5">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Package className="h-4 w-4 text-amber-500" /> Inventory Alerts
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <PlaceholderBanner
                      title="Reorder-level alerts aren't tracked yet"
                      reason="The SCM module tracks item stock but not a reorder threshold per item yet."
                    />
                  </CardContent>
                </Card>
                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold">Maintenance & Equipment</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <PlaceholderBanner
                      title="Maintenance tickets and equipment status aren't wired here yet"
                      reason="A CMMS ticketing system doesn't exist yet (tracked separately)."
                    />
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}
    </HospitalLayout>
  );
}
