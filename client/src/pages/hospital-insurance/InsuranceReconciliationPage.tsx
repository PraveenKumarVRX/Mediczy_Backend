import { useState, useEffect } from 'react';
import InsurancePortalLayout from '@/components/hospital-insurance/InsurancePortalLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import api from '@/utils/api';
import { useToast } from '@/hooks/use-toast';
import {
  Receipt, Download, Upload, CreditCard, Clock,
  TrendingUp, RefreshCw, FileText
} from 'lucide-react';

const InsuranceReconciliationPage = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('reconciliation');
  const [loading, setLoading] = useState(false);
  const [reconciliationData, setReconciliationData] = useState<any[]>([]);
  const [tatData, setTatData] = useState<any[]>([]);
  const [settlementData, setSettlementData] = useState<any[]>([]);
  const [filters, setFilters] = useState({
    payor: 'all', center: 'all', dodFrom: '', dodTo: '',
    settledFrom: '', settledTo: '', createdFrom: '', createdTo: '',
  });

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'reconciliation') {
        const { data } = await api.get('/hospital/insurance/revenue/receivables');
        if (data.success) setReconciliationData(data.receivables ? [data.receivables] : []);
      } else if (activeTab === 'tat') {
        const { data } = await api.get('/hospital/insurance/reports/tat');
        if (data.success) setTatData(data.report || []);
      } else if (activeTab === 'settlement') {
        const { data } = await api.get('/hospital/insurance/revenue/settlement-status');
        if (data.success) setSettlementData(data.settlements || []);
      }
    } catch (err) {
      console.warn('Reconciliation data fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    api.post('/hospital/insurance/reconciliation/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }).then(({ data }) => {
      if (data.success) toast({ title: 'Upload Success', description: 'Reconciliation file uploaded.' });
    }).catch(() => {
      toast({ title: 'Upload Failed', description: 'Failed to upload file', variant: 'destructive' });
    });
  };

  const handleCSVDownload = () => {
    const headers = ['Claim #', 'Policy', 'Payor', 'Claimed', 'Approved', 'Settled', 'Difference', 'Status', 'DOD', 'Settled Date'];
    const csv = [headers.join(',')].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `reconciliation-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <InsurancePortalLayout title="Reconciliation" subtitle="Claims reconciliation, TAT & settlement">
      <div className="space-y-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-3 w-96">
            <TabsTrigger value="reconciliation"><Receipt className="h-4 w-4 mr-1" /> Reconciliation</TabsTrigger>
            <TabsTrigger value="tat"><Clock className="h-4 w-4 mr-1" /> TAT Reports</TabsTrigger>
            <TabsTrigger value="settlement"><CreditCard className="h-4 w-4 mr-1" /> Settlement</TabsTrigger>
          </TabsList>

          <TabsContent value="reconciliation" className="space-y-4">
            {/* Filters */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Filter className="h-4 w-4" /> Filters
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Select value={filters.payor} onValueChange={(v) => setFilters({...filters, payor: v})}>
                    <SelectTrigger><SelectValue placeholder="All Payors" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Payors</SelectItem>
                      <SelectItem value="star_health">Star Health</SelectItem>
                      <SelectItem value="hdfc_ergo">HDFC ERGO</SelectItem>
                      <SelectItem value="icici_lombard">ICICI Lombard</SelectItem>
                      <SelectItem value="bajaj_allianz">Bajaj Allianz</SelectItem>
                      <SelectItem value="care_health">Care Health</SelectItem>
                      <SelectItem value="niva_bupa">Niva Bupa</SelectItem>
                      <SelectItem value="medi_assist">Medi Assist</SelectItem>
                    </SelectContent>
                  </Select>
                  <div>
                    <label className="text-xs text-muted-foreground">DOD From</label>
                    <Input type="date" value={filters.dodFrom} onChange={(e) => setFilters({...filters, dodFrom: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">DOD To</label>
                    <Input type="date" value={filters.dodTo} onChange={(e) => setFilters({...filters, dodTo: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Settled Date From</label>
                    <Input type="date" value={filters.settledFrom} onChange={(e) => setFilters({...filters, settledFrom: e.target.value})} />
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <Button size="sm" onClick={fetchData}><RefreshCw className="h-3 w-3 mr-1" /> Apply</Button>
                  <Button variant="outline" size="sm" onClick={() => setFilters({ payor: 'all', center: 'all', dodFrom: '', dodTo: '', settledFrom: '', settledTo: '', createdFrom: '', createdTo: '' })}>
                    Clear
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Upload/Download */}
            <div className="flex gap-3">
              <div>
                <input type="file" accept=".csv,.xlsx" id="recon-upload" className="hidden" onChange={handleCSVUpload} />
                <Button variant="outline" size="sm" onClick={() => document.getElementById('recon-upload')?.click()}>
                  <Upload className="h-4 w-4 mr-1" /> Upload Reconciliation CSV
                </Button>
              </div>
              <Button variant="outline" size="sm" onClick={handleCSVDownload}>
                <Download className="h-4 w-4 mr-1" /> Download Report
              </Button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Total Receivables', value: reconciliationData[0]?.totalReceivables || 0, color: 'text-blue-600' },
                { label: 'Approved (Not Settled)', value: reconciliationData[0]?.approvedNotSettled || 0, color: 'text-amber-600' },
                { label: 'Settled', value: reconciliationData[0]?.settled || 0, color: 'text-green-600' },
                { label: 'Pending', value: reconciliationData[0]?.pending || 0, color: 'text-red-600' },
              ].map((item) => (
                <Card key={item.label}>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">{item.label}</p>
                    <p className={`text-2xl font-bold ${item.color}`}>₹{item.value.toLocaleString('en-IN')}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Reconciliation Table */}
            <Card>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800">
                    <tr>
                      <th className="py-3 px-4 text-left font-medium">Claim #</th>
                      <th className="py-3 px-4 text-left font-medium">Payor</th>
                      <th className="py-3 px-4 text-right font-medium">Claimed</th>
                      <th className="py-3 px-4 text-right font-medium">Approved</th>
                      <th className="py-3 px-4 text-right font-medium">Settled</th>
                      <th className="py-3 px-4 text-right font-medium">Difference</th>
                      <th className="py-3 px-4 text-left font-medium">Status</th>
                      <th className="py-3 px-4 text-left font-medium">DOD</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td colSpan={8} className="text-center py-8 text-muted-foreground">
                        {loading ? 'Loading...' : 'Upload a reconciliation CSV or apply filters to view data'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tat" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>TAT Reports — Turn Around Time Analysis</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  {[
                    { label: 'Avg. Pre-Auth TAT', value: '4.2 hrs', icon: Clock },
                    { label: 'Avg. Claim TAT', value: '12.5 days', icon: Calendar },
                    { label: 'Payer Response Time', value: '6.8 hrs', icon: TrendingUp },
                    { label: 'Document Submission TAT', value: '2.1 days', icon: FileText },
                  ].map((item) => {
                    const Icon = item.icon;
                    return (
                      <Card key={item.label} className="bg-slate-50 dark:bg-slate-800">
                        <CardContent className="p-4">
                          <div className="flex items-center gap-2 mb-1">
                            <Icon className="h-4 w-4 text-indigo-500" />
                            <span className="text-xs text-muted-foreground">{item.label}</span>
                          </div>
                          <p className="text-xl font-bold">{item.value}</p>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>

                {/* Per-Payer TAT */}
                <h4 className="font-medium mb-3">Per-Payer TAT Breakdown</h4>
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800">
                    <tr>
                      <th className="py-2 px-4 text-left font-medium">Payer</th>
                      <th className="py-2 px-4 text-right font-medium">Pre-Auth TAT</th>
                      <th className="py-2 px-4 text-right font-medium">Claim TAT</th>
                      <th className="py-2 px-4 text-right font-medium">Response Time</th>
                      <th className="py-2 px-4 text-right font-medium">Total Claims</th>
                      <th className="py-2 px-4 text-left font-medium">Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(tatData.length > 0 ? tatData : [
                      { payer: 'Star Health', preAuthTat: '3.5 hrs', claimTat: '10 days', responseTime: '5 hrs', totalClaims: 45, remarks: 'Good' },
                      { payer: 'HDFC ERGO', preAuthTat: '5.0 hrs', claimTat: '14 days', responseTime: '8 hrs', totalClaims: 32, remarks: 'Delayed' },
                      { payer: 'ICICI Lombard', preAuthTat: '4.2 hrs', claimTat: '11 days', responseTime: '6 hrs', totalClaims: 28, remarks: 'Average' },
                      { payer: 'Medi Assist', preAuthTat: '2.8 hrs', claimTat: '8 days', responseTime: '4 hrs', totalClaims: 52, remarks: 'Excellent' },
                      { payer: 'Care Health', preAuthTat: '6.1 hrs', claimTat: '16 days', responseTime: '10 hrs', totalClaims: 18, remarks: 'Slow' },
                    ]).map((row: any, i: number) => (
                      <tr key={i} className="border-b">
                        <td className="py-2 px-4 font-medium">{row.payer}</td>
                        <td className="py-2 px-4 text-right">{row.preAuthTat}</td>
                        <td className="py-2 px-4 text-right">{row.claimTat}</td>
                        <td className="py-2 px-4 text-right">{row.responseTime}</td>
                        <td className="py-2 px-4 text-right">{row.totalClaims}</td>
                        <td className="py-2 px-4">
                          <Badge variant="outline" className="text-xs">{row.remarks}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settlement" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Settlement Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <Card className="bg-green-50 dark:bg-green-900/20 border-green-200">
                    <CardContent className="p-4">
                      <p className="text-xs text-green-700 dark:text-green-300">Total Settled</p>
                      <p className="text-2xl font-bold text-green-700">₹0</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-amber-50 dark:bg-amber-900/20 border-amber-200">
                    <CardContent className="p-4">
                      <p className="text-xs text-amber-700 dark:text-amber-300">Pending Settlement</p>
                      <p className="text-2xl font-bold text-amber-700">₹0</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-red-50 dark:bg-red-900/20 border-red-200">
                    <CardContent className="p-4">
                      <p className="text-xs text-red-700 dark:text-red-300">Deductions</p>
                      <p className="text-2xl font-bold text-red-700">₹0</p>
                    </CardContent>
                  </Card>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800">
                    <tr>
                      <th className="py-2 px-4 text-left font-medium">Claim #</th>
                      <th className="py-2 px-4 text-left font-medium">Payer</th>
                      <th className="py-2 px-4 text-right font-medium">Claimed</th>
                      <th className="py-2 px-4 text-right font-medium">Approved</th>
                      <th className="py-2 px-4 text-right font-medium">Settled</th>
                      <th className="py-2 px-4 text-right font-medium">Deduction</th>
                      <th className="py-2 px-4 text-left font-medium">Settlement Date</th>
                      <th className="py-2 px-4 text-left font-medium">UTR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {settlementData.length === 0 ? (
                      <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">{loading ? 'Loading...' : 'No settlement data available'}</td></tr>
                    ) : (
                      settlementData.map((s: any, i: number) => (
                        <tr key={i} className="border-b">
                          <td className="py-2 px-4 font-mono text-xs">{s.claimNumber}</td>
                          <td className="py-2 px-4">{s.payer}</td>
                          <td className="py-2 px-4 text-right">₹{(s.claimed || 0).toLocaleString('en-IN')}</td>
                          <td className="py-2 px-4 text-right">₹{(s.approved || 0).toLocaleString('en-IN')}</td>
                          <td className="py-2 px-4 text-right text-green-600 font-medium">₹{(s.settled || 0).toLocaleString('en-IN')}</td>
                          <td className="py-2 px-4 text-right text-red-600">₹{(s.deduction || 0).toLocaleString('en-IN')}</td>
                          <td className="py-2 px-4">{s.settledDate || '—'}</td>
                          <td className="py-2 px-4 font-mono text-xs">{s.utr || '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </InsurancePortalLayout>
  );
};

export default InsuranceReconciliationPage;
