import { useEffect, useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Calculator, Plus, Trash2, Download, FileText, IndianRupee } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import api from '@/utils/api';

const CATEGORIES = ['opd', 'diagnostics', 'pharmacy', 'dental', 'vision', 'health_checkup', 'mental_wellness', 'fitness', 'vaccination', 'other'];
const categoryLabel = (c: string) => c.replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
const inr = (v: number | undefined | null) => `₹${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

interface Tier {
  key: string;
  label: string;
  allocatedLimit: number | '';
  isDefault: boolean;
}

interface TierBreakdown {
  tierKey: string;
  label: string;
  allocatedLimit: number;
  uptakePercent: number;
  employeesAtTier: number;
  incrementalCost: number;
}

interface Calculation {
  guaranteedWalletFunding: number;
  tierBreakdown: TierBreakdown[];
  totalWalletFunding: number;
  adminFeePercent: number;
  adminFee: number;
  categoryLoadingTotal: number;
  estimatedTotalAnnualCost: number;
  estimatedPerEmployeeAnnualCost: number;
  range: { minimum: number; maximum: number };
}

interface Quote {
  id: number;
  prospectName: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  employeeCount: number;
  categories: string[];
  tierOptions: Tier[];
  assumedUptake: Record<string, number>;
  adminFeePercent: number;
  categoryLoadingPerEmployee: number;
  calculation: Calculation;
  status: string;
  notes: string | null;
  createdAt: string;
}

const emptyTier = (index: number): Tier => ({ key: `tier${index}`, label: `Tier ${index}`, allocatedLimit: '', isDefault: false });

const CorporateQuoteCalculator = () => {
  const { toast } = useToast();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeQuote, setActiveQuote] = useState<Quote | null>(null);

  const [form, setForm] = useState({
    prospectName: '', contactName: '', contactEmail: '', contactPhone: '',
    employeeCount: '', notes: '',
    adminFeePercent: '8', categoryLoadingPerEmployee: '0',
  });
  const [categories, setCategories] = useState<string[]>([]);
  const [tiers, setTiers] = useState<Tier[]>([{ key: 'base', label: 'Base', allocatedLimit: '', isDefault: true }]);

  const loadQuotes = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/corporate-quotes');
      setQuotes((data as any)?.data?.quotes || []);
    } catch {
      toast({ title: 'Failed to load saved quotes', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadQuotes(); }, []);

  const toggleCategory = (c: string) => {
    setCategories((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  };

  const addTier = () => setTiers((prev) => [...prev, emptyTier(prev.length)]);
  const removeTier = (key: string) => setTiers((prev) => prev.filter((t) => t.key !== key));
  const updateTier = (key: string, patch: Partial<Tier>) => {
    setTiers((prev) => prev.map((t) => {
      if (t.key !== key) return patch.isDefault ? { ...t, isDefault: false } : t;
      return { ...t, ...patch };
    }));
  };
  const [uptake, setUptake] = useState<Record<string, string>>({});

  const resetForm = () => {
    setForm({ prospectName: '', contactName: '', contactEmail: '', contactPhone: '', employeeCount: '', notes: '', adminFeePercent: '8', categoryLoadingPerEmployee: '0' });
    setCategories([]);
    setTiers([{ key: 'base', label: 'Base', allocatedLimit: '', isDefault: true }]);
    setUptake({});
    setActiveQuote(null);
  };

  const submitQuote = async () => {
    if (!form.prospectName.trim()) { toast({ title: 'Prospect name is required', variant: 'destructive' }); return; }
    if (!form.employeeCount || Number(form.employeeCount) <= 0) { toast({ title: 'Employee count must be greater than zero', variant: 'destructive' }); return; }
    if (categories.length === 0) { toast({ title: 'Select at least one category', variant: 'destructive' }); return; }
    if (tiers.some((t) => !t.allocatedLimit)) { toast({ title: 'Every tier needs an amount', variant: 'destructive' }); return; }

    setSaving(true);
    try {
      const assumedUptake: Record<string, number> = {};
      Object.entries(uptake).forEach(([k, v]) => { if (v) assumedUptake[k] = Number(v); });

      const { data } = await api.post('/admin/corporate-quotes', {
        prospectName: form.prospectName.trim(),
        contactName: form.contactName || undefined,
        contactEmail: form.contactEmail || undefined,
        contactPhone: form.contactPhone || undefined,
        employeeCount: Number(form.employeeCount),
        categories,
        tierOptions: tiers.map((t) => ({ ...t, allocatedLimit: Number(t.allocatedLimit) })),
        assumedUptake,
        adminFeePercent: Number(form.adminFeePercent || 0),
        categoryLoadingPerEmployee: Number(form.categoryLoadingPerEmployee || 0),
        notes: form.notes || undefined,
      });
      const quote = (data as any)?.data?.quote as Quote;
      setActiveQuote(quote);
      toast({ title: 'Quote calculated', description: `Estimated annual cost: ${inr(quote.calculation.estimatedTotalAnnualCost)}` });
      loadQuotes();
    } catch (error: any) {
      toast({ title: 'Could not calculate quote', description: error?.response?.data?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const downloadPdf = async (quote: Quote) => {
    try {
      const response = await api.get(`/admin/corporate-quotes/${quote.id}/pdf`, { responseType: 'blob' });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${quote.prospectName.replace(/[^a-z0-9]+/gi, '-')}-quote.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch {
      toast({ title: 'Could not download PDF', variant: 'destructive' });
    }
  };

  const nonBaseTiers = tiers.filter((t) => !t.isDefault);

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Calculator className="w-7 h-7 text-violet-600" />
          <div>
            <h1 className="text-2xl font-bold">Corporate Quote Calculator</h1>
            <p className="text-sm text-muted-foreground">Estimate and save a proposal for a corporate OPD / wellness wallet — works for any prospect, any tiers, any categories.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Form */}
          <Card>
            <CardHeader>
              <CardTitle>New Quote</CardTitle>
              <CardDescription>Enter the prospect's requirements to generate an estimate.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <Label>Prospect / Company name</Label>
                  <Input value={form.prospectName} onChange={(e) => setForm((f) => ({ ...f, prospectName: e.target.value }))} placeholder="e.g. Acme Industries Pvt Ltd" />
                </div>
                <div className="space-y-1.5">
                  <Label>Contact name</Label>
                  <Input value={form.contactName} onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Employee count</Label>
                  <Input type="number" min={1} value={form.employeeCount} onChange={(e) => setForm((f) => ({ ...f, employeeCount: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Contact email</Label>
                  <Input type="email" value={form.contactEmail} onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Contact phone</Label>
                  <Input value={form.contactPhone} onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Coverage categories</Label>
                <div className="grid grid-cols-2 gap-2 border rounded-md p-3">
                  {CATEGORIES.map((c) => (
                    <label key={c} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox checked={categories.includes(c)} onCheckedChange={() => toggleCategory(c)} />
                      {categoryLabel(c)}
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Wallet tiers</Label>
                  <Button type="button" size="sm" variant="outline" onClick={addTier} className="gap-1">
                    <Plus className="w-3.5 h-3.5" /> Add tier
                  </Button>
                </div>
                <div className="space-y-2">
                  {tiers.map((tier, idx) => (
                    <div key={tier.key} className="flex items-center gap-2 border rounded-md p-2">
                      <label className="flex items-center gap-1.5 text-xs whitespace-nowrap">
                        <input type="radio" checked={tier.isDefault} onChange={() => updateTier(tier.key, { isDefault: true })} />
                        Base
                      </label>
                      <Input className="w-32" value={tier.label} onChange={(e) => updateTier(tier.key, { label: e.target.value })} placeholder="Label" />
                      <div className="relative flex-1">
                        <IndianRupee className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                        <Input className="pl-7" type="number" min={0} value={tier.allocatedLimit}
                          onChange={(e) => updateTier(tier.key, { allocatedLimit: e.target.value === '' ? '' : Number(e.target.value) })}
                          placeholder="Amount / employee / year" />
                      </div>
                      {!tier.isDefault && (
                        <div className="flex items-center gap-1 w-32">
                          <Input type="number" min={0} max={100} className="w-16" value={uptake[tier.key] || ''}
                            onChange={(e) => setUptake((prev) => ({ ...prev, [tier.key]: e.target.value }))} placeholder="0" />
                          <span className="text-xs text-muted-foreground">% uptake</span>
                        </div>
                      )}
                      {tiers.length > 1 && (
                        <Button type="button" size="icon" variant="ghost" onClick={() => removeTier(tier.key)}>
                          <Trash2 className="w-3.5 h-3.5 text-red-500" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Exactly one tier is the Base — funded for every employee. Any other tier is an optional employee self-upgrade; "% uptake" is your assumption for how many employees will opt in (used only to estimate the expected cost — the actual range is shown below regardless).
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Admin fee (%)</Label>
                  <Input type="number" min={0} step="0.5" value={form.adminFeePercent} onChange={(e) => setForm((f) => ({ ...f, adminFeePercent: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Category loading (₹/employee/year)</Label>
                  <Input type="number" min={0} value={form.categoryLoadingPerEmployee} onChange={(e) => setForm((f) => ({ ...f, categoryLoadingPerEmployee: e.target.value }))} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Notes (optional)</Label>
                <Textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
              </div>

              <div className="flex gap-2 pt-2">
                <Button onClick={submitQuote} disabled={saving} className="gap-2">
                  <Calculator className="w-4 h-4" /> {saving ? 'Calculating...' : 'Calculate Quote'}
                </Button>
                <Button variant="outline" onClick={resetForm}>New</Button>
              </div>
            </CardContent>
          </Card>

          {/* Result */}
          <Card>
            <CardHeader>
              <CardTitle>Estimate</CardTitle>
              <CardDescription>{activeQuote ? activeQuote.prospectName : 'Calculate a quote to see the breakdown here.'}</CardDescription>
            </CardHeader>
            <CardContent>
              {!activeQuote ? (
                <div className="text-center py-16 text-muted-foreground">
                  <FileText className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No estimate yet</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-1.5">
                    {activeQuote.categories.map((c) => <Badge key={c} variant="secondary">{categoryLabel(c)}</Badge>)}
                  </div>

                  <Table>
                    <TableBody>
                      <TableRow>
                        <TableCell className="text-muted-foreground">Guaranteed wallet funding (base × {activeQuote.employeeCount} employees)</TableCell>
                        <TableCell className="text-right font-medium">{inr(activeQuote.calculation.guaranteedWalletFunding)}</TableCell>
                      </TableRow>
                      {activeQuote.calculation.tierBreakdown.map((t) => (
                        <TableRow key={t.tierKey}>
                          <TableCell className="text-muted-foreground pl-6">+ {t.label} ({t.uptakePercent}% uptake, {t.employeesAtTier} employees)</TableCell>
                          <TableCell className="text-right">{inr(t.incrementalCost)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow>
                        <TableCell className="font-medium">Total estimated wallet funding</TableCell>
                        <TableCell className="text-right font-medium">{inr(activeQuote.calculation.totalWalletFunding)}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="text-muted-foreground">Mediqzy admin fee ({activeQuote.calculation.adminFeePercent}%)</TableCell>
                        <TableCell className="text-right">{inr(activeQuote.calculation.adminFee)}</TableCell>
                      </TableRow>
                      {activeQuote.calculation.categoryLoadingTotal > 0 && (
                        <TableRow>
                          <TableCell className="text-muted-foreground">Category loading</TableCell>
                          <TableCell className="text-right">{inr(activeQuote.calculation.categoryLoadingTotal)}</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>

                  <div className="rounded-lg bg-violet-50 dark:bg-violet-950/30 p-4 space-y-1">
                    <p className="text-sm text-muted-foreground">Estimated total annual cost</p>
                    <p className="text-2xl font-bold text-violet-700 dark:text-violet-300">{inr(activeQuote.calculation.estimatedTotalAnnualCost)}</p>
                    <p className="text-sm text-muted-foreground">{inr(activeQuote.calculation.estimatedPerEmployeeAnnualCost)} per employee / year</p>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Range if uptake differs from assumption: {inr(activeQuote.calculation.range.minimum)} (nobody upgrades) to {inr(activeQuote.calculation.range.maximum)} (everyone upgrades to the top tier).
                  </p>

                  <Button variant="outline" onClick={() => downloadPdf(activeQuote)} className="gap-2 w-full">
                    <Download className="w-4 h-4" /> Download Proposal PDF
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Saved quotes */}
        <Card>
          <CardHeader>
            <CardTitle>Saved Quotes</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Loading...</p>
            ) : quotes.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No quotes saved yet</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Prospect</TableHead>
                    <TableHead>Employees</TableHead>
                    <TableHead>Categories</TableHead>
                    <TableHead className="text-right">Est. Annual Cost</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quotes.map((q) => (
                    <TableRow key={q.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setActiveQuote(q)}>
                      <TableCell className="font-medium">{q.prospectName}</TableCell>
                      <TableCell>{q.employeeCount}</TableCell>
                      <TableCell className="text-xs">{q.categories.map(categoryLabel).join(', ')}</TableCell>
                      <TableCell className="text-right">{inr(q.calculation?.estimatedTotalAnnualCost)}</TableCell>
                      <TableCell><Badge variant="outline" className="capitalize">{q.status}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(q.createdAt).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); downloadPdf(q); }}>
                          <Download className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default CorporateQuoteCalculator;
