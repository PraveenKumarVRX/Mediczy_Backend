import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TPASidebar from '@/components/tpa/TPASidebar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import api from '@/utils/api';
import {
  AlertCircle,
  BarChart3,
  Building2,
  Calculator,
  ChevronRight,
  ClipboardCheck,
  CreditCard,
  FileText,
  RefreshCw,
  Shield,
  ShieldCheck,
  Ticket,
} from 'lucide-react';

const iconMap: Record<string, any> = {
  claim_submission: FileText,
  ecard: CreditCard,
  network_hospitals: Building2,
  benefit_estimator: Calculator,
  hospitalization_intimation: ShieldCheck,
  document_intelligence: ClipboardCheck,
  fraud_guard: Shield,
  weekly_mis: BarChart3,
  grievances: Ticket,
};

const fallbackFunctions = [
  { id: 'claim_submission', title: 'Submit Claim', description: 'Reimbursement claim intake with document checklist.', path: '/tpa/claim-submission', status: 'enabled' },
  { id: 'ecard', title: 'E-Card', description: 'Retrieve/download member and dependent e-cards.', path: '/tpa/ecard', status: 'enabled' },
  { id: 'network_hospitals', title: 'Network Hospitals', description: 'Search cashless/network hospitals.', path: '/tpa/hospitals', status: 'enabled' },
  { id: 'benefit_estimator', title: 'OOPE Estimator', description: 'Estimate payable and out-of-pocket amounts.', path: '/tpa/benefit-estimator', status: 'enabled' },
  { id: 'hospitalization_intimation', title: 'Hospital Intimation', description: 'Planned/emergency admission intimation tracker.', path: '/tpa/hospitalization-intimations', status: 'enabled' },
  { id: 'document_intelligence', title: 'Document AI', description: 'OCR/readiness review for claim documents.', path: '/tpa/document-intelligence', status: 'enabled' },
  { id: 'fraud_guard', title: 'Fraud Guard', description: 'Fraud, waste, and abuse risk queue.', path: '/tpa/fraud-guard', status: 'enabled' },
  { id: 'weekly_mis', title: 'Weekly MIS', description: 'Corporate weekly operations and SLA reports.', path: '/tpa/weekly-mis', status: 'enabled' },
  { id: 'grievances', title: 'Grievances', description: 'SLA-backed support and grievance redressal.', path: '/tpa/grievances', status: 'enabled' },
];

const TPAFunctions = () => {
  const navigate = useNavigate();
  const [functions, setFunctions] = useState(fallbackFunctions);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadFunctions = async () => {
    const token = localStorage.getItem('tpaToken');
    if (!token) {
      navigate('/tpa/login');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/tpa/functions');
      setFunctions(data.functions?.length ? data.functions : fallbackFunctions);
      setStats(data.stats || null);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not load TPA functions.');
      setFunctions(fallbackFunctions);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFunctions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <TPASidebar />

      <div className="flex-1 md:ml-64 overflow-auto">
        <div className="px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-violet-700 shadow-sm border border-violet-100 mb-3">
                <Shield className="h-3.5 w-3.5" />
                TPA Operating Console
              </div>
              <h1 className="text-3xl font-bold text-slate-900">TPA Functions</h1>
              <p className="text-slate-600 mt-1">Claim, pre-auth, e-card, hospital, MIS, document AI, and grievance workflows in one place.</p>
            </div>
            <Button onClick={loadFunctions} disabled={loading} variant="outline" className="bg-white">
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          {error && (
            <Alert className="mb-6 border-amber-200 bg-amber-50">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800">{error}</AlertDescription>
            </Alert>
          )}

          {stats && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              {Object.entries(stats).map(([key, value]) => (
                <Card key={key} className="bg-white/90 border-slate-200">
                  <CardContent className="p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-400">{key.replace(/([A-Z])/g, ' $1')}</p>
                    <p className="text-2xl font-bold text-slate-900 mt-1">{String(value)}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {functions.map((fn: any) => {
              const Icon = iconMap[fn.id] || Shield;
              return (
                <Card key={fn.id} className="bg-white/95 border-slate-200 hover:border-violet-200 hover:shadow-lg transition-all">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-4">
                      <div className="h-11 w-11 rounded-xl bg-violet-50 flex items-center justify-center">
                        <Icon className="h-5 w-5 text-violet-600" />
                      </div>
                      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
                        {fn.status || 'enabled'}
                      </Badge>
                    </div>
                    <CardTitle className="text-lg">{fn.title}</CardTitle>
                    <CardDescription>{fn.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button className="w-full" onClick={() => navigate(fn.path)}>
                      Open Function
                      <ChevronRight className="h-4 w-4 ml-2" />
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TPAFunctions;
