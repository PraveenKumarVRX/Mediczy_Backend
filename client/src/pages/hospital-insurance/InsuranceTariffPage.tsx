import { useState, useEffect } from 'react';
import api from '@/utils/api';
import InsurancePortalLayout from '@/components/hospital-insurance/InsurancePortalLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { IndianRupee, Search, Plus, Edit, Download, Info } from 'lucide-react';

const insurers = ['Star Health', 'Care Health', 'HDFC ERGO', 'ICICI Lombard', 'Bajaj Allianz', 'Niva Bupa', 'New India', 'United India', 'CGHS', 'ECHS'];

const mockTariffs = [
  { id: 1, insurer: 'Star Health', category: 'Room Charges', item: 'General Ward', unit: 'per day', rate: 1500, gst: 0, effective: '2024-01-01' },
  { id: 2, insurer: 'Star Health', category: 'Room Charges', item: 'Semi-Private', unit: 'per day', rate: 3000, gst: 0, effective: '2024-01-01' },
  { id: 3, insurer: 'Star Health', category: 'Room Charges', item: 'Private Room', unit: 'per day', rate: 5000, gst: 0, effective: '2024-01-01' },
  { id: 4, insurer: 'Star Health', category: 'ICU', item: 'Medical ICU', unit: 'per day', rate: 12000, gst: 0, effective: '2024-01-01' },
  { id: 5, insurer: 'Star Health', category: 'Procedures', item: 'CABG (Bypass)', unit: 'per episode', rate: 280000, gst: 0, effective: '2024-01-01' },
  { id: 6, insurer: 'Star Health', category: 'Procedures', item: 'Total Knee Replacement', unit: 'per episode', rate: 180000, gst: 5, effective: '2024-01-01' },
  { id: 7, insurer: 'Care Health', category: 'Room Charges', item: 'General Ward', unit: 'per day', rate: 1800, gst: 0, effective: '2024-04-01' },
  { id: 8, insurer: 'Care Health', category: 'Room Charges', item: 'Private Room', unit: 'per day', rate: 5500, gst: 0, effective: '2024-04-01' },
  { id: 9, insurer: 'HDFC ERGO', category: 'Procedures', item: 'Laparoscopic Cholecystectomy', unit: 'per episode', rate: 65000, gst: 5, effective: '2024-01-01' },
  { id: 10, insurer: 'CGHS', category: 'Room Charges', item: 'General Ward', unit: 'per day', rate: 1200, gst: 0, effective: '2024-04-01' },
];

const categories = ['All', 'Room Charges', 'ICU', 'Procedures', 'Nursing', 'OT Charges', 'Diagnostics', 'Pharmacy'];

const InsuranceTariffPage = () => {
  const { toast } = useToast();
  const [selectedInsurer, setSelectedInsurer] = useState('All');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editRow, setEditRow] = useState<any>(null);
  const [tariffs, setTariffs] = useState(mockTariffs);
  const [form, setForm] = useState({ insurer: '', category: '', item: '', unit: 'per day', rate: '', gst: '0', effective: '' });

  const headers = () => {
    const token = localStorage.getItem('hospitalToken');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  useEffect(() => {
    api.get('/hospital/practice/tariffs', { headers: headers() }).then(({ data }) => {
      const rows = (data.data || []).map((row: any) => ({
        id: row.id,
        insurer: row.payer_type || 'Self Pay',
        category: row.category,
        item: row.item_name,
        unit: row.unit,
        rate: Number(row.rate),
        gst: Number(row.gst),
        effective: row.effective_from,
        code: row.code,
      }));
      if (rows.length) setTariffs(rows);
    }).catch(() => undefined);
  }, []);

  const filtered = tariffs.filter(t => {
    const matchInsurer = selectedInsurer === 'All' || t.insurer === selectedInsurer;
    const matchCategory = selectedCategory === 'All' || t.category === selectedCategory;
    const matchSearch = !searchTerm || t.item.toLowerCase().includes(searchTerm.toLowerCase());
    return matchInsurer && matchCategory && matchSearch;
  });

  const handleSave = async () => {
    if (!form.insurer || !form.item || !form.rate) {
      toast({ title: 'Validation', description: 'Insurer, item, and rate are required.', variant: 'destructive' });
      return;
    }
    if (editRow) {
      toast({ title: 'Tariff editing is versioned', description: 'Create a new effective tariff row for rate changes.' });
      return;
    }
    const response = await api.post('/hospital/practice/tariffs', {
      code: `${form.category.replace(/\s+/g, '_').toUpperCase()}_${Date.now()}`,
      itemName: form.item,
      category: form.category,
      unit: form.unit,
      payerType: form.insurer,
      rate: parseFloat(form.rate),
      gst: parseFloat(form.gst),
      effectiveFrom: form.effective,
    }, { headers: headers() });
    const row = response.data.data;
    setTariffs(prev => [...prev, {
      id: row.id,
      insurer: row.payer_type || 'Self Pay',
      category: row.category,
      item: row.item_name,
      unit: row.unit,
      rate: Number(row.rate),
      gst: Number(row.gst),
      effective: row.effective_from,
      code: row.code,
    }]);
    toast({ title: 'Tariff Added' });
    setShowAdd(false); setEditRow(null);
    setForm({ insurer: '', category: '', item: '', unit: 'per day', rate: '', gst: '0', effective: '' });
  };

  return (
    <InsurancePortalLayout title="Tariff Management" subtitle="Per-insurer rate negotiation & package pricing">
      <div className="space-y-4">
        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Insurers Configured', value: [...new Set(tariffs.map(t => t.insurer))].length },
            { label: 'Total Tariff Items', value: tariffs.length },
            { label: 'Procedures Rates', value: tariffs.filter(t => t.category === 'Procedures').length },
            { label: 'Last Updated', value: '2024-12-01' },
          ].map(k => (
            <Card key={k.label}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{k.label}</p>
                <p className="text-xl font-bold text-indigo-700">{k.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters + Actions */}
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <div className="flex gap-2 flex-wrap">
            <Select value={selectedInsurer} onValueChange={setSelectedInsurer}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Insurers</SelectItem>
                {insurers.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8 w-48" placeholder="Search item..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm"><Download className="h-3 w-3 mr-1" />Export</Button>
            <Button size="sm" onClick={() => { setEditRow(null); setShowAdd(true); }}>
              <Plus className="h-3 w-3 mr-1" />Add Tariff
            </Button>
          </div>
        </div>

        {/* Tariff table */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    {['Insurer', 'Category', 'Service / Item', 'Unit', 'Rate (₹)', 'GST %', 'Effective Date', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map(t => (
                    <tr key={t.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <Badge className="bg-indigo-100 text-indigo-700">{t.insurer}</Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{t.category}</td>
                      <td className="px-4 py-3 font-medium">{t.item}</td>
                      <td className="px-4 py-3 text-xs">{t.unit}</td>
                      <td className="px-4 py-3 font-bold">₹{t.rate.toLocaleString('en-IN')}</td>
                      <td className="px-4 py-3">{t.gst > 0 ? `${t.gst}%` : '—'}</td>
                      <td className="px-4 py-3 text-xs">{t.effective}</td>
                      <td className="px-4 py-3">
                        <Button size="sm" variant="ghost" onClick={() => {
                          setEditRow(t);
                          setForm({ insurer: t.insurer, category: t.category, item: t.item, unit: t.unit, rate: String(t.rate), gst: String(t.gst), effective: t.effective });
                          setShowAdd(true);
                        }}><Edit className="h-3 w-3" /></Button>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">No tariff items found for the selected filters.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Info note */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex gap-2 text-sm text-blue-800">
          <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <p>Tariffs should match the negotiated MOU/empanelment agreement with each insurer. Rate changes require updated MOU. CGHS/ECHS rates are government-mandated and updated periodically.</p>
        </div>
      </div>

      {/* Add / Edit Dialog */}
      <Dialog open={showAdd} onOpenChange={v => { setShowAdd(v); if (!v) setEditRow(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editRow ? 'Edit Tariff' : 'Add New Tariff'}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium block mb-1">Insurer</label>
              <Select value={form.insurer} onValueChange={v => setForm({...form, insurer: v})}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{insurers.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Category</label>
              <Select value={form.category} onValueChange={v => setForm({...form, category: v})}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{categories.filter(c => c !== 'All').map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium block mb-1">Service / Item Name</label>
              <Input placeholder="e.g. Private Room, CABG..." value={form.item} onChange={e => setForm({...form, item: e.target.value})} />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Unit</label>
              <Select value={form.unit} onValueChange={v => setForm({...form, unit: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="per day">Per Day</SelectItem>
                  <SelectItem value="per episode">Per Episode</SelectItem>
                  <SelectItem value="per session">Per Session</SelectItem>
                  <SelectItem value="per unit">Per Unit</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Rate (₹)</label>
              <Input type="number" placeholder="5000" value={form.rate} onChange={e => setForm({...form, rate: e.target.value})} />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">GST %</label>
              <Input type="number" placeholder="0 / 5 / 12 / 18" value={form.gst} onChange={e => setForm({...form, gst: e.target.value})} />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Effective Date</label>
              <Input type="date" value={form.effective} onChange={e => setForm({...form, effective: e.target.value})} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAdd(false); setEditRow(null); }}>Cancel</Button>
            <Button onClick={handleSave}>{editRow ? 'Update' : 'Save'} Tariff</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </InsurancePortalLayout>
  );
};

export default InsuranceTariffPage;
