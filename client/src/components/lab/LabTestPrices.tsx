import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import api from '@/utils/api';

/**
 * The lab's own test list and prices (/lab/test-catalog).
 *
 * Backed by /api/lab/test-prices (server/routes/lab/test-prices.route.js).
 * What is saved here is exactly what patients are offered and charged when
 * they book this lab: once the lab has one active price, only its active tests
 * are bookable, at these prices. Until then patients see the platform
 * Standard catalogue. Replaces a hard-coded sample catalogue with invented
 * prices that nothing read.
 */

type CatalogueTest = { testId: string; code: string | null; name: string; category: string | null; standardPrice: number | null };
type LabPrice = CatalogueTest & { price: number; isActive: boolean; bookable: boolean; updatedAt: string | null };
type RowError = { row: number; testId: string | null; testCode: string | null; errors: string[] };
type ListResponse = { priceSource: 'lab' | 'standard'; activeCount: number; totalCount: number; prices: LabPrice[] };

const rupees = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);
const messageOf = (e: any, fallback: string) => e?.response?.data?.message || fallback;

export default function LabTestPrices() {
  const { toast } = useToast();
  const [list, setList] = useState<ListResponse | null>(null);
  const [catalogue, setCatalogue] = useState<CatalogueTest[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [addTest, setAddTest] = useState<CatalogueTest | null>(null);
  const [addPrice, setAddPrice] = useState('');
  const [csv, setCsv] = useState('test_code,price,is_active\n');
  const [rowErrors, setRowErrors] = useState<RowError[]>([]);

  const load = async () => {
    setError('');
    try {
      const [prices, cat] = await Promise.all([
        api.get('/lab/test-prices', { params: { includeInactive: true } }),
        api.get('/lab/test-prices/catalogue'),
      ]);
      setList(prices.data);
      setCatalogue(cat.data.tests || []);
      setDrafts({});
    } catch (e: any) {
      setError(messageOf(e, 'Unable to load your price list'));
    }
  };
  useEffect(() => { load(); }, []);

  const onList = useMemo(() => new Set((list?.prices || []).map((p) => p.testId)), [list]);
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return catalogue
      .filter((t) => !onList.has(t.testId))
      .filter((t) => t.name.toLowerCase().includes(q) || (t.code || '').toLowerCase().includes(q))
      .slice(0, 8);
  }, [search, catalogue, onList]);

  const run = async (work: () => Promise<void>, failure: string) => {
    setBusy(true); setError('');
    try { await work(); } catch (e: any) {
      setError(messageOf(e, failure));
      setRowErrors(e?.response?.data?.errors || []);
    } finally { setBusy(false); }
  };

  const savePrice = (row: LabPrice) => run(async () => {
    await api.patch(`/lab/test-prices/${encodeURIComponent(row.testId)}`, { price: drafts[row.testId] });
    toast({ title: 'Price saved', description: `${row.name}: ₹${drafts[row.testId]}` });
    await load();
  }, 'Unable to save this price');

  const setActive = (row: LabPrice, isActive: boolean) => run(async () => {
    if (isActive) await api.patch(`/lab/test-prices/${encodeURIComponent(row.testId)}`, { isActive: true });
    else await api.delete(`/lab/test-prices/${encodeURIComponent(row.testId)}`);
    await load();
  }, 'Unable to change this test');

  const add = () => run(async () => {
    if (!addTest) return;
    await api.post('/lab/test-prices', { testId: addTest.testId, price: addPrice });
    toast({ title: 'Test added', description: `${addTest.name} at ₹${addPrice}` });
    setAddTest(null); setAddPrice(''); setSearch('');
    await load();
  }, 'Unable to add this test');

  const upload = (dryRun: boolean) => run(async () => {
    setRowErrors([]);
    const res = await api.post('/lab/test-prices/bulk', { csv, dryRun });
    toast({
      title: dryRun ? 'Upload checked' : 'Price list uploaded',
      description: dryRun
        ? `${res.data.results.length} row(s) are valid. Nothing was saved yet.`
        : `${res.data.created} added, ${res.data.updated} updated.`,
    });
    if (!dryRun) await load();
  }, 'Unable to upload the price list');

  return (
    <div className="space-y-6">
      {error && <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

      <Card>
        <CardHeader>
          <CardTitle>Your test list and prices</CardTitle>
          <CardDescription>
            {list?.priceSource === 'lab'
              ? `Patients booking your lab see only your ${list.activeCount} active test(s), at the prices below.`
              : 'You have not set any prices yet, so patients booking your lab see the platform Standard catalogue and prices. Add your first test to switch to your own list.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {list && list.prices.length === 0 && <p className="text-sm text-muted-foreground">No tests on your list yet.</p>}
          {list && list.prices.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Test</TableHead>
                    <TableHead>Standard price</TableHead>
                    <TableHead>Your price (₹)</TableHead>
                    <TableHead>Offered</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.prices.map((row) => (
                    <TableRow key={row.testId}>
                      <TableCell>
                        <div className="font-medium">{row.name}</div>
                        <div className="text-xs text-muted-foreground">{[row.code, row.category].filter(Boolean).join(' · ')}</div>
                        {row.isActive && !row.bookable && <Badge variant="destructive" className="mt-1">Withdrawn from the catalogue</Badge>}
                      </TableCell>
                      <TableCell>{rupees(row.standardPrice)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Input
                            aria-label={`Price for ${row.name}`}
                            className="w-28"
                            inputMode="decimal"
                            value={drafts[row.testId] ?? String(row.price)}
                            onChange={(e) => setDrafts((d) => ({ ...d, [row.testId]: e.target.value }))}
                          />
                          {drafts[row.testId] !== undefined && drafts[row.testId] !== String(row.price) && (
                            <Button size="sm" disabled={busy} onClick={() => savePrice(row)}>Save</Button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Switch aria-label={`Offer ${row.name}`} checked={row.isActive} disabled={busy} onCheckedChange={(v) => setActive(row, v)} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Add a test</CardTitle>
            <CardDescription>Choose from the platform catalogue and set your price.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label htmlFor="price-search">Search by name or code</Label>
              <Input id="price-search" value={search} onChange={(e) => { setSearch(e.target.value); setAddTest(null); }} placeholder="e.g. CBC, Lipid" />
            </div>
            {matches.length > 0 && !addTest && (
              <div className="divide-y rounded-md border">
                {matches.map((t) => (
                  <button type="button" key={t.testId} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted/50" onClick={() => setAddTest(t)}>
                    <span>{t.name} <span className="text-muted-foreground">{t.code}</span></span>
                    <span className="text-muted-foreground">Standard {rupees(t.standardPrice)}</span>
                  </button>
                ))}
              </div>
            )}
            {addTest && (
              <div className="space-y-2">
                <p className="text-sm">{addTest.name} <span className="text-muted-foreground">(Standard {rupees(addTest.standardPrice)})</span></p>
                <Label htmlFor="price-new">Your price (₹)</Label>
                <div className="flex gap-2">
                  <Input id="price-new" inputMode="decimal" className="w-32" value={addPrice} onChange={(e) => setAddPrice(e.target.value)} />
                  <Button disabled={busy || !addPrice} onClick={add}>Add test</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Upload a price list</CardTitle>
            <CardDescription>CSV with a header row: test_code (or test_id), price, and optionally is_active. One bad row and nothing is saved.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea aria-label="Price list CSV" rows={8} className="font-mono text-xs" value={csv} onChange={(e) => setCsv(e.target.value)} />
            <div className="flex gap-2">
              <Button variant="outline" disabled={busy} onClick={() => upload(true)}>Check</Button>
              <Button disabled={busy} onClick={() => upload(false)}>Upload</Button>
            </div>
            {rowErrors.length > 0 && (
              <ul className="space-y-1 text-sm text-destructive">
                {rowErrors.map((r: RowError & { line?: number }) => <li key={r.row}>{r.line ? `Line ${r.line}` : `Row ${r.row}`}{r.testCode || r.testId ? ` (${r.testCode || r.testId})` : ''}: {r.errors.join('; ')}</li>)}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export { LabTestPrices };
