import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TPASidebar from '@/components/tpa/TPASidebar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import api from '@/utils/api';
import { AlertCircle, Calculator, IndianRupee, RefreshCw, ShieldCheck } from 'lucide-react';

const TPABenefitEstimator = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    memberId: 'MEM-001',
    policyNumber: 'POL-2025-001',
    hospitalName: 'Apollo Hospital',
    treatmentType: 'Hospitalization',
    estimatedAmount: '125000',
    roomCategory: 'single',
  });
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const estimate = async () => {
    const token = localStorage.getItem('tpaToken');
    if (!token) {
      navigate('/tpa/login');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { data } = await api.post('/tpa/benefits/estimate', {
        ...form,
        estimatedAmount: Number(form.estimatedAmount || 0),
      });
      setResult(data.estimate);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not calculate benefit estimate.');
    } finally {
      setLoading(false);
    }
  };

  const update = (key: string, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="flex h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <TPASidebar />

      <div className="flex-1 md:ml-64 overflow-auto">
        <div className="px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-6">
            <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-amber-700 shadow-sm border border-amber-100 mb-3">
              <Calculator className="h-3.5 w-3.5" />
              OOPE & Benefit Engine
            </div>
            <h1 className="text-3xl font-bold text-slate-900">Benefit / Out-of-Pocket Estimator</h1>
            <p className="text-slate-600 mt-1">Estimate payable, co-pay, sub-limit impact, and expected member out-of-pocket before claim/pre-auth decision.</p>
          </div>

          {error && (
            <Alert className="mb-6 border-red-200 bg-red-50">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800">{error}</AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-[0.95fr_1.05fr] gap-6">
            <Card className="bg-white/95 border-slate-200">
              <CardHeader>
                <CardTitle>Estimate Inputs</CardTitle>
                <CardDescription>Use member, policy, hospital, and treatment details to simulate claim payable.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  ['memberId', 'Member ID'],
                  ['policyNumber', 'Policy Number'],
                  ['hospitalName', 'Hospital Name'],
                  ['treatmentType', 'Treatment Type'],
                  ['estimatedAmount', 'Estimated Amount'],
                  ['roomCategory', 'Room Category'],
                ].map(([key, label]) => (
                  <div key={key} className="space-y-1.5">
                    <Label htmlFor={key}>{label}</Label>
                    <Input id={key} value={(form as any)[key]} onChange={(event) => update(key, event.target.value)} className="bg-white" />
                  </div>
                ))}
                <Button onClick={estimate} disabled={loading} className="w-full">
                  {loading ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Calculator className="h-4 w-4 mr-2" />}
                  Calculate Estimate
                </Button>
              </CardContent>
            </Card>

            <Card className="bg-white/95 border-slate-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-emerald-600" />
                  Estimate Result
                </CardTitle>
                <CardDescription>Policy-aware estimate for TPA decision support.</CardDescription>
              </CardHeader>
              <CardContent>
                {!result ? (
                  <div className="text-center py-16 text-slate-500">
                    <IndianRupee className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                    Run an estimate to view payable and out-of-pocket breakup.
                  </div>
                ) : (
                  <div className="space-y-5">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {[
                        ['Estimated', result.estimatedAmount],
                        ['TPA Payable', result.payableAmount],
                        ['Out-of-Pocket', result.outOfPocket],
                      ].map(([label, value]) => (
                        <div key={String(label)} className="rounded-xl border border-slate-200 p-4">
                          <p className="text-xs uppercase tracking-wide text-slate-400">{String(label)}</p>
                          <p className="text-2xl font-bold text-slate-900 mt-1">₹{Number(value || 0).toLocaleString('en-IN')}</p>
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4">
                        <p className="text-sm font-semibold text-emerald-800 mb-2">Coverage Decision</p>
                        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">{result.decision}</Badge>
                        <p className="text-sm text-emerald-700 mt-3">{result.recommendation}</p>
                      </div>
                      <div className="rounded-xl bg-amber-50 border border-amber-100 p-4">
                        <p className="text-sm font-semibold text-amber-800 mb-2">Policy Rules Applied</p>
                        <ul className="space-y-1 text-sm text-amber-700">
                          {(result.rulesApplied || []).map((rule: string) => <li key={rule}>• {rule}</li>)}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TPABenefitEstimator;
