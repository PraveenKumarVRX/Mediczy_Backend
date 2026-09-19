/**
 * Corporate Account Management — Module 24 completion, admin UI
 * Added 2026-09-18. Business/admin UI only. Talks to /api/corporate-account
 * (server/routes/corporate-account.route.js). Green-channel display mode
 * (quiet / staff badge / separate lane) is configured via GreenChannelSettings;
 * it defaults to quiet, the design doc's recommended starting point.
 */

import { useState } from 'react';
import HospitalLayout from '@/components/hospital/HospitalLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, DollarSign, UserCheck, ShieldCheck } from 'lucide-react';
import api from '@/utils/api';
import { useToast } from '@/hooks/use-toast';
import GreenChannelSettings from '@/components/hospital/GreenChannelSettings';

export default function CorporateAccountManagement() {
  const { toast } = useToast();
  const [corporateId, setCorporateId] = useState('');
  const [mouHistory, setMouHistory] = useState<any[]>([]);
  const [rateCard, setRateCard] = useState<any>(null);
  const [spoc, setSpoc] = useState<any>(null);
  const [creditStatus, setCreditStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const loadAccount = async () => {
    if (!corporateId.trim()) {
      toast({ title: 'Enter a corporate account ID first', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const [mouRes, rateCardRes, spocRes, creditRes] = await Promise.allSettled([
        api.get(`/corporate-account/corporates/${corporateId}/mou`),
        api.get(`/corporate-account/corporates/${corporateId}/rate-card`),
        api.get(`/corporate-account/corporates/${corporateId}/spoc`),
        api.get(`/corporate-account/corporates/${corporateId}/credit-status`),
      ]);
      setMouHistory(mouRes.status === 'fulfilled' ? (mouRes.value.data?.data ?? []) : []);
      setRateCard(rateCardRes.status === 'fulfilled' ? rateCardRes.value.data?.data : null);
      setSpoc(spocRes.status === 'fulfilled' ? spocRes.value.data?.data : null);
      setCreditStatus(creditRes.status === 'fulfilled' ? creditRes.value.data?.data : null);
      setLoaded(true);
    } catch (e: any) {
      toast({ title: 'Failed to load account', description: e?.response?.data?.message || e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const [newSpocId, setNewSpocId] = useState('');
  const assignSpoc = async () => {
    if (!newSpocId.trim()) return;
    try {
      await api.post(`/corporate-account/corporates/${corporateId}/spoc`, { staffUserId: Number(newSpocId) });
      toast({ title: 'SPOC assigned' });
      loadAccount();
    } catch (e: any) {
      toast({ title: 'Failed to assign SPOC', description: e?.response?.data?.message || e.message, variant: 'destructive' });
    }
  };

  const [newCreditLimit, setNewCreditLimit] = useState('');
  const setCreditLimit = async () => {
    if (!newCreditLimit.trim()) return;
    try {
      await api.post(`/corporate-account/corporates/${corporateId}/credit-limit`, { creditLimit: Number(newCreditLimit) });
      toast({ title: 'Credit limit updated' });
      loadAccount();
    } catch (e: any) {
      toast({ title: 'Failed to set credit limit', description: e?.response?.data?.message || e.message, variant: 'destructive' });
    }
  };

  return (
    <HospitalLayout title="Corporate Account Management" subtitle="MoU versioning, rate cards, SPOC, and credit ledger — Module 24">
      <Card className="border-0 shadow-sm mb-6">
        <CardContent className="p-4 flex items-end gap-3">
          <div className="flex-1">
            <Label htmlFor="corp-id">Corporate Account ID</Label>
            <Input id="corp-id" value={corporateId} onChange={(e) => setCorporateId(e.target.value)} placeholder="Enter the corporate account's numeric ID" />
          </div>
          <Button onClick={loadAccount} disabled={loading}>{loading ? 'Loading...' : 'Load Account'}</Button>
        </CardContent>
      </Card>

      {loaded && (
        <Tabs defaultValue="mou" className="space-y-4">
          <TabsList>
            <TabsTrigger value="mou"><FileText className="h-4 w-4 mr-1" /> MoU</TabsTrigger>
            <TabsTrigger value="rate-card"><DollarSign className="h-4 w-4 mr-1" /> Rate Card</TabsTrigger>
            <TabsTrigger value="spoc"><UserCheck className="h-4 w-4 mr-1" /> SPOC</TabsTrigger>
            <TabsTrigger value="credit"><ShieldCheck className="h-4 w-4 mr-1" /> Credit</TabsTrigger>
          </TabsList>

          <TabsContent value="mou">
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">MoU Version History</CardTitle></CardHeader>
              <CardContent>
                {mouHistory.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">No MoU versions on file yet for this account.</p>
                ) : (
                  <div className="space-y-2">
                    {mouHistory.map((m) => (
                      <div key={m.id} className="flex items-center justify-between text-sm border-b pb-2">
                        <span>Version {m.version} — effective {m.effective_date}</span>
                        <Badge className={m.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}>{m.status}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="rate-card">
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Effective Rate Card</CardTitle></CardHeader>
              <CardContent>
                {rateCard ? (
                  <div className="text-sm space-y-1">
                    <p>Version {rateCard.version} — effective {rateCard.effective_date}</p>
                    <pre className="bg-slate-50 dark:bg-slate-800 p-3 rounded text-xs overflow-auto">{JSON.stringify(rateCard.rate_card, null, 2)}</pre>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-4">No rate card on file yet — this account uses default hospital pricing.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="spoc">
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Single Point of Contact</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {spoc ? (
                  <p className="text-sm">Staff User ID: <span className="font-semibold">{spoc.staff_user_id}</span> — assigned {new Date(spoc.assigned_at).toLocaleDateString()}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">No SPOC assigned yet.</p>
                )}
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <Label htmlFor="spoc-id">Assign SPOC (Staff User ID)</Label>
                    <Input id="spoc-id" value={newSpocId} onChange={(e) => setNewSpocId(e.target.value)} placeholder="e.g. 42" />
                  </div>
                  <Button onClick={assignSpoc}>Assign</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="credit">
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Credit Ledger</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {creditStatus ? (
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div><p className="text-muted-foreground text-xs">Credit Limit</p><p className="font-semibold">₹{Number(creditStatus.credit_limit).toLocaleString('en-IN')}</p></div>
                    <div><p className="text-muted-foreground text-xs">Current Balance</p><p className="font-semibold">₹{Number(creditStatus.current_balance).toLocaleString('en-IN')}</p></div>
                    <div><p className="text-muted-foreground text-xs">Available Credit</p><p className={`font-semibold ${creditStatus.overLimit ? 'text-red-500' : 'text-emerald-600'}`}>₹{Number(creditStatus.availableCredit).toLocaleString('en-IN')}</p></div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No credit ledger set up yet for this account.</p>
                )}
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <Label htmlFor="credit-limit">Set Credit Limit (₹)</Label>
                    <Input id="credit-limit" value={newCreditLimit} onChange={(e) => setNewCreditLimit(e.target.value)} placeholder="e.g. 500000" />
                  </div>
                  <Button onClick={setCreditLimit}>Save</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      <GreenChannelSettings />

      <p className="text-xs text-muted-foreground mt-6">
        Not included on this screen: employee consent management (employee-controlled only, by design — not
        settable by hospital staff on an employee's behalf).
      </p>
    </HospitalLayout>
  );
}
