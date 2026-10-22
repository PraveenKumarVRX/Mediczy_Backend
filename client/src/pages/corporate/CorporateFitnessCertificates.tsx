import { useEffect, useMemo, useState } from 'react';
import CorporateLayout from '@/components/corporate/CorporateLayout';
import CorporatePageHeader from '@/components/corporate/CorporatePageHeader';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  ShieldCheck, Search, FileDown, Loader2, CheckCircle2, AlertTriangle, XCircle, RefreshCw,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import api from '@/utils/api';
import { exportToExcel } from '@/utils/exportToExcel';

interface Certificate {
  id: number;
  patient_name: string;
  employee_id: string | null;
  fitness_status: string;
  examination_date: string;
  valid_until: string;
  issued_by: string;
}

const STATUS_META: Record<string, { label: string; icon: any; className: string }> = {
  fit: { label: 'Fit', icon: CheckCircle2, className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  fit_with_restrictions: { label: 'Fit (restrictions)', icon: ShieldCheck, className: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  temporarily_unfit: { label: 'Temporarily unfit', icon: AlertTriangle, className: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
  unfit: { label: 'Unfit', icon: XCircle, className: 'bg-red-500/15 text-red-400 border-red-500/30' },
};

const CorporateFitnessCertificates = () => {
  const { toast } = useToast();
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/v1/occupational-health/fitness-certificates');
      setCertificates(data?.data || []);
    } catch (err) {
      console.error('Failed to load certificates', err);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => certificates.filter((c) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return c.patient_name?.toLowerCase().includes(q) || (c.employee_id || '').toLowerCase().includes(q);
  }), [certificates, search]);

  const exportCSV = (certs: Certificate[]) => {
    const header = ['Certificate ID', 'Patient Name', 'Employee ID', 'Fitness Status', 'Valid From', 'Valid Until', 'Issued By'];
    const rows = certs.map((c) =>
      [
        c.id,
        c.patient_name,
        c.employee_id || '',
        c.fitness_status,
        c.examination_date ? new Date(c.examination_date).toLocaleDateString() : '',
        c.valid_until ? new Date(c.valid_until).toLocaleDateString() : '',
        c.issued_by,
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')
    );
    const csv = [header.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fitness-certificates-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportExcel = (certs: Certificate[]) => {
    const rows = certs.map((c) => ({
      'Certificate ID': c.id,
      'Patient Name': c.patient_name,
      'Employee ID': c.employee_id || '',
      'Fitness Status': c.fitness_status,
      'Valid From': c.examination_date ? new Date(c.examination_date).toLocaleDateString() : '',
      'Valid Until': c.valid_until ? new Date(c.valid_until).toLocaleDateString() : '',
      'Issued By': c.issued_by,
    }));
    exportToExcel(rows, { filename: 'fitness-certificates', sheetName: 'Fitness Certificates' });
  };

  const download = (id: number) => {
    api.get(`/v1/occupational-health/fitness-certificate/${id}/pdf`, { responseType: 'blob' })
      .then((res) => {
        const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
        const a = document.createElement('a');
        a.href = url; a.download = `fitness-certificate-${id}.pdf`; a.click();
        URL.revokeObjectURL(url);
      })
      .catch(() => toast({ title: 'Download failed', variant: 'destructive' }));
  };

  const downloadZip = async () => {
    if (downloadingZip) return;
    const ids = filtered.filter(c => selectedIds.size === 0 || selectedIds.has(c.id)).map(c => c.id);
    if (!ids.length || ids.length > 100) {
      toast({ title: 'Select between 1 and 100 certificates', variant: 'destructive' });
      return;
    }
    setDownloadingZip(true);
    try {
      const response = await api.post('/v1/occupational-health/fitness-certificates/download-zip', { certificateIds: ids }, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([response.data], { type: 'application/zip' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'fitness-certificates.zip';
      link.click();
      URL.revokeObjectURL(url);
    } catch (error: any) {
      let message = 'Please try again.';
      try {
        const body = error?.response?.data;
        const details = body instanceof Blob ? JSON.parse(await body.text()) : body;
        message = details?.message || message;
      } catch { /* Preserve a useful fallback if the server did not send JSON. */ }
      toast({ title: 'PDF download failed', description: message, variant: 'destructive' });
    } finally {
      setDownloadingZip(false);
    }
  };

  return (
    <CorporateLayout title="Fitness Certificates" subtitle="Medical Examination Reports and Fitness Certificates for your employees">
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 p-4 sm:p-6 space-y-6">
        <CorporatePageHeader
          icon={ShieldCheck}
          title="Fitness Certificates"
          description="Every MER / General Fitness Certificate issued to an employee — from a camp, clinic visit, or your own OHC."
          gradient="from-emerald-600 to-emerald-800"
          badge={{ text: `${certificates.length} issued`, variant: 'emerald' }}
          actions={
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={downloadZip} disabled={loading || downloadingZip || !filtered.length}>
                {downloadingZip ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileDown className="h-4 w-4 mr-1" />}
                {selectedIds.size ? 'Download selected PDFs' : 'Download PDFs'}
              </Button>
              <Button variant="outline" size="sm" onClick={() => exportCSV(filtered)} title="Export all visible rows as CSV">
                <FileDown className="h-4 w-4 mr-1" /> Export CSV
              </Button>
              <Button variant="outline" size="sm" onClick={() => exportExcel(filtered)} title="Export all visible rows as Excel">
                <FileDown className="h-4 w-4 mr-1" /> Export Excel
              </Button>
              <Button variant="outline" size="icon" onClick={load} title="Refresh">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          }
        />

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <Input
            className="pl-9 bg-slate-900/60 border-white/[0.08] text-white placeholder:text-slate-500"
            placeholder="Search employee name or ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10">
            <span className="text-sm text-emerald-400 font-medium">{selectedIds.size} selected</span>
            <Button
              size="sm"
              variant="outline"
              className="border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
              onClick={() => exportCSV(filtered.filter((c) => selectedIds.has(c.id)))}
            >
              <FileDown className="h-3.5 w-3.5 mr-1" /> Export CSV
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-slate-400 hover:text-white"
              onClick={() => setSelectedIds(new Set())}
            >
              Clear
            </Button>
          </div>
        )}

        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] overflow-hidden">
          {loading ? (
            <div className="py-16 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-500" /></div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <ShieldCheck className="h-10 w-10 mx-auto mb-3 text-slate-600" />
              <p className="text-slate-400 text-sm">No certificates issued yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06] text-left text-xs text-slate-500 uppercase tracking-wide">
                    <th className="px-4 py-3">
                      <Checkbox
                        checked={filtered.length > 0 && filtered.every((c) => selectedIds.has(c.id))}
                        onCheckedChange={(checked) => {
                          if (checked) setSelectedIds(new Set(filtered.map((c) => c.id)));
                          else setSelectedIds(new Set());
                        }}
                      />
                    </th>
                    <th className="px-4 py-3">Employee</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Examined</th>
                    <th className="px-4 py-3">Valid until</th>
                    <th className="px-4 py-3">Issued by</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => {
                    const meta = STATUS_META[c.fitness_status] || { label: c.fitness_status, icon: ShieldCheck, className: 'bg-slate-500/15 text-slate-400 border-slate-500/30' };
                    const Icon = meta.icon;
                    return (
                      <tr key={c.id} className="border-b border-white/[0.04] hover:bg-slate-800/30 transition-colors">
                        <td className="px-4 py-3">
                          <Checkbox
                            checked={selectedIds.has(c.id)}
                            onCheckedChange={(checked) => {
                              setSelectedIds((prev) => {
                                const next = new Set(prev);
                                if (checked) next.add(c.id); else next.delete(c.id);
                                return next;
                              });
                            }}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-white">{c.patient_name}</p>
                          {c.employee_id && <p className="text-xs text-slate-500">{c.employee_id}</p>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${meta.className}`}>
                            <Icon className="w-3 h-3" /> {meta.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-400">{new Date(c.examination_date).toLocaleDateString()}</td>
                        <td className="px-4 py-3 text-slate-400">{c.valid_until ? new Date(c.valid_until).toLocaleDateString() : '—'}</td>
                        <td className="px-4 py-3 text-slate-400">{c.issued_by}</td>
                        <td className="px-4 py-3 text-right">
                          <Button size="sm" variant="outline" onClick={() => download(c.id)}>
                            <FileDown className="h-3.5 w-3.5 mr-1" /> PDF
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </CorporateLayout>
  );
};

export default CorporateFitnessCertificates;
