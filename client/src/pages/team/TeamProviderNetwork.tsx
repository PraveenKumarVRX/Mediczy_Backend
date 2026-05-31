import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import MainLayout from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import api from '@/utils/api';
import {
  ArrowLeft,
  Upload,
  Globe,
  FileCheck2,
  Rocket,
  Database,
  CheckCircle2,
  XCircle,
  Loader2
} from 'lucide-react';

type BatchSummary = {
  batch_id: string;
  source_type: string;
  status: string;
  total_records: number;
  qc_pass: number;
  qc_fail: number;
  published_count: number;
  created_at: string;
  updated_at: string;
};

type BatchSample = {
  id: number;
  provider_type: string;
  name: string;
  city: string;
  state: string;
  qc_status: string;
  qc_score: number;
  qc_missing_fields: string[];
  publish_status: string;
};

const TeamProviderNetwork = () => {
  const [manualJson, setManualJson] = useState('');
  const [notes, setNotes] = useState('');
  const [urlsRaw, setUrlsRaw] = useState('');
  const [providerType, setProviderType] = useState('hospital');
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [batchId, setBatchId] = useState('');
  const [batch, setBatch] = useState<BatchSummary | null>(null);
  const [sample, setSample] = useState<BatchSample[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const authHeader = useMemo(() => {
    const token = localStorage.getItem('teamToken');
    return token ? { Authorization: `Bearer ${token}` } : undefined;
  }, []);

  const setStatus = (ok: boolean, text: string) => {
    if (ok) {
      setMessage(text);
      setError('');
    } else {
      setError(text);
      setMessage('');
    }
  };

  const fetchBatch = async (id: string) => {
    if (!id) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/team/provider-network-bot/batches/${id}`, {
        headers: authHeader
      });
      if (data?.success) {
        setBatch(data.batch as BatchSummary);
        setSample((data.sample || []) as BatchSample[]);
        setBatchId(id);
        setStatus(true, `Loaded batch ${id}`);
      } else {
        setStatus(false, data?.error || 'Failed to load batch');
      }
    } catch (e: any) {
      setStatus(false, e?.response?.data?.error || e?.message || 'Failed to load batch');
    } finally {
      setLoading(false);
    }
  };

  const ingestManual = async () => {
    setLoading(true);
    try {
      const parsed = JSON.parse(manualJson || '[]');
      if (!Array.isArray(parsed) || !parsed.length) {
        setStatus(false, 'Manual JSON must be a non-empty array');
        return;
      }
      const { data } = await api.post(
        '/team/provider-network-bot/ingest/manual',
        { providers: parsed, notes },
        { headers: authHeader }
      );
      if (data?.success) {
        setStatus(true, `Manual ingest complete. Batch: ${data.batchId}`);
        await fetchBatch(data.batchId);
      } else {
        setStatus(false, data?.error || 'Manual ingest failed');
      }
    } catch (e: any) {
      setStatus(false, e?.response?.data?.error || e?.message || 'Manual ingest failed');
    } finally {
      setLoading(false);
    }
  };

  const ingestExcel = async () => {
    if (!excelFile) {
      setStatus(false, 'Select an Excel file first');
      return;
    }
    setLoading(true);
    try {
      const form = new FormData();
      form.append('file', excelFile);
      form.append('notes', notes);
      const { data } = await api.post('/team/provider-network-bot/ingest/excel', form, {
        headers: {
          ...(authHeader || {}),
          'Content-Type': 'multipart/form-data'
        }
      });
      if (data?.success) {
        setStatus(true, `Excel ingest complete. Batch: ${data.batchId}`);
        await fetchBatch(data.batchId);
      } else {
        setStatus(false, data?.error || 'Excel ingest failed');
      }
    } catch (e: any) {
      setStatus(false, e?.response?.data?.error || e?.message || 'Excel ingest failed');
    } finally {
      setLoading(false);
    }
  };

  const ingestWeb = async () => {
    const urls = urlsRaw
      .split(/\r?\n/)
      .map((u) => u.trim())
      .filter(Boolean);
    if (!urls.length) {
      setStatus(false, 'Enter at least one URL');
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post(
        '/team/provider-network-bot/ingest/web',
        { urls, provider_type: providerType, notes },
        { headers: authHeader }
      );
      if (data?.success) {
        setStatus(true, `Web ingest complete. Batch: ${data.batchId}`);
        await fetchBatch(data.batchId);
      } else {
        setStatus(false, data?.error || 'Web ingest failed');
      }
    } catch (e: any) {
      setStatus(false, e?.response?.data?.error || e?.message || 'Web ingest failed');
    } finally {
      setLoading(false);
    }
  };

  const runQc = async () => {
    if (!batchId) {
      setStatus(false, 'Provide a batch id first');
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post(`/team/provider-network-bot/qc/${batchId}`, {}, { headers: authHeader });
      if (data?.success) {
        setStatus(true, `QC completed: PASS ${data.passCount}, FAIL ${data.failCount}`);
        await fetchBatch(batchId);
      } else {
        setStatus(false, data?.error || 'QC failed');
      }
    } catch (e: any) {
      setStatus(false, e?.response?.data?.error || e?.message || 'QC failed');
    } finally {
      setLoading(false);
    }
  };

  const publish = async (force = false) => {
    if (!batchId) {
      setStatus(false, 'Provide a batch id first');
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post(
        `/team/provider-network-bot/publish/${batchId}`,
        { force },
        { headers: authHeader }
      );
      if (data?.success) {
        setStatus(true, `Published ${data.publishedCount} records to SmartHealth Provider Network`);
        await fetchBatch(batchId);
      } else {
        setStatus(false, data?.error || 'Publish failed');
      }
    } catch (e: any) {
      setStatus(false, e?.response?.data?.error || e?.message || 'Publish failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <MainLayout>
      <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500">
        <Link
          to="/team/dashboard"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Team Dashboard
        </Link>

        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Database className="h-8 w-8 text-blue-600" />
            SmartHealth Provider Network Bot
          </h1>
          <p className="text-muted-foreground mt-1">
            Ingest providers from websites, Excel, or manual team input, run QC, and publish to directory.
          </p>
        </div>

        {message && (
          <div className="rounded-md border border-green-300 bg-green-50 px-4 py-3 text-green-800 text-sm flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" /> {message}
          </div>
        )}
        {error && (
          <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-red-800 text-sm flex items-center gap-2">
            <XCircle className="h-4 w-4" /> {error}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Batch Control</CardTitle>
            <CardDescription>Use returned batch ID to run QC and publish.</CardDescription>
          </CardHeader>
          <CardContent className="grid md:grid-cols-4 gap-3 items-end">
            <div className="md:col-span-2">
              <Label>Batch ID</Label>
              <Input value={batchId} onChange={(e) => setBatchId(e.target.value)} placeholder="pnb-..." />
            </div>
            <Button variant="outline" onClick={() => fetchBatch(batchId)} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Load Batch
            </Button>
            <div className="flex gap-2">
              <Button onClick={runQc} disabled={loading || !batchId} className="flex-1">
                <FileCheck2 className="h-4 w-4 mr-2" /> QC
              </Button>
              <Button onClick={() => publish(false)} disabled={loading || !batchId} className="flex-1">
                <Rocket className="h-4 w-4 mr-2" /> Publish
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid lg:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Manual JSON Ingest</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                rows={10}
                value={manualJson}
                onChange={(e) => setManualJson(e.target.value)}
                placeholder='[{"provider_type":"hospital","name":"ABC Hospital","city":"Chennai","state":"Tamil Nadu","address":"...","pincode":"600001","phone":"..."}]'
              />
              <Button onClick={ingestManual} disabled={loading} className="w-full">
                <Upload className="h-4 w-4 mr-2" /> Ingest Manual
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Excel Upload</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input type="file" accept=".xlsx,.xls" onChange={(e) => setExcelFile(e.target.files?.[0] || null)} />
              <Textarea
                rows={4}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Import notes (optional)"
              />
              <Button onClick={ingestExcel} disabled={loading} className="w-full">
                <Upload className="h-4 w-4 mr-2" /> Ingest Excel
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Website URL Ingest</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Label>Provider Type</Label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={providerType}
                onChange={(e) => setProviderType(e.target.value)}
              >
                <option value="hospital">hospital</option>
                <option value="clinic">clinic</option>
                <option value="doctor">doctor</option>
                <option value="lab">lab</option>
                <option value="diagnostic_center">diagnostic_center</option>
                <option value="pharmacy">pharmacy</option>
                <option value="home_healthcare">home_healthcare</option>
                <option value="gym">gym</option>
                <option value="wellness_center">wellness_center</option>
                <option value="ambulance_provider">ambulance_provider</option>
              </select>
              <Textarea
                rows={6}
                value={urlsRaw}
                onChange={(e) => setUrlsRaw(e.target.value)}
                placeholder="One URL per line"
              />
              <Button onClick={ingestWeb} disabled={loading} className="w-full">
                <Globe className="h-4 w-4 mr-2" /> Ingest Website URLs
              </Button>
            </CardContent>
          </Card>
        </div>

        {batch && (
          <Card>
            <CardHeader>
              <CardTitle>Batch Summary</CardTitle>
            </CardHeader>
            <CardContent className="grid md:grid-cols-5 gap-3">
              <Badge variant="outline">Source: {batch.source_type}</Badge>
              <Badge variant="outline">Status: {batch.status}</Badge>
              <Badge variant="outline">Total: {batch.total_records}</Badge>
              <Badge variant="outline">PASS: {batch.qc_pass}</Badge>
              <Badge variant="outline">FAIL: {batch.qc_fail}</Badge>
            </CardContent>
          </Card>
        )}

        {!!sample.length && (
          <Card>
            <CardHeader>
              <CardTitle>Sample Records</CardTitle>
            </CardHeader>
            <CardContent className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 pr-3">Type</th>
                    <th className="py-2 pr-3">Name</th>
                    <th className="py-2 pr-3">City</th>
                    <th className="py-2 pr-3">QC</th>
                    <th className="py-2 pr-3">Score</th>
                    <th className="py-2 pr-3">Publish</th>
                    <th className="py-2 pr-3">Missing</th>
                  </tr>
                </thead>
                <tbody>
                  {sample.map((row) => (
                    <tr key={row.id} className="border-b align-top">
                      <td className="py-2 pr-3">{row.provider_type}</td>
                      <td className="py-2 pr-3">{row.name || '-'}</td>
                      <td className="py-2 pr-3">{row.city || '-'}</td>
                      <td className="py-2 pr-3">{row.qc_status}</td>
                      <td className="py-2 pr-3">{row.qc_score ?? '-'}</td>
                      <td className="py-2 pr-3">{row.publish_status}</td>
                      <td className="py-2 pr-3">{Array.isArray(row.qc_missing_fields) ? row.qc_missing_fields.join(', ') : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}

        <div className="flex justify-end">
          <Button variant="destructive" onClick={() => publish(true)} disabled={loading || !batchId}>
            <Rocket className="h-4 w-4 mr-2" /> Force Publish (includes QC fail)
          </Button>
        </div>
      </div>
    </MainLayout>
  );
};

export default TeamProviderNetwork;
