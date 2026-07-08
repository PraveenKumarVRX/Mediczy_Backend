import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { ShieldCheck, Loader2, AlertCircle } from 'lucide-react';

interface PublicClaimStatus {
  claimNumber: string;
  status: string;
  settlementStatus?: string | null;
  insurer?: string | null;
  claimAmount?: string | number;
  approvedAmount?: string | number | null;
  settledAmount?: string | number | null;
  submittedDate?: string | null;
  approvalDate?: string | null;
  paymentDate?: string | null;
  lastUpdated?: string;
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted to insurer',
  pending: 'Under review',
  query: 'Insurer has a query — our team is responding',
  approved: 'Approved',
  rejected: 'Not approved',
  paid: 'Settled',
};

const formatCurrency = (amount?: string | number | null) => {
  if (amount === null || amount === undefined) return null;
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(amount));
};

const formatDate = (value?: string | null) => (value ? new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : null);

const ClaimStatusPublic = () => {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<PublicClaimStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    const base = (import.meta as any).env?.VITE_API_URL || '/api';
    axios.get(`${base}/public/claim-status/${token}`)
      .then((res) => setData(res.data.claim))
      .catch((err) => setError(err?.response?.data?.message || 'This status link is no longer valid.'))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
      <div className="w-full max-w-sm rounded-2xl border bg-white dark:bg-slate-900 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-5">
          <ShieldCheck className="h-5 w-5 text-teal-600" />
          <span className="font-semibold text-sm">Mediqzy Insurance Desk</span>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading claim status…
          </div>
        ) : error || !data ? (
          <div className="flex flex-col items-center gap-2 text-center py-8">
            <AlertCircle className="h-6 w-6 text-red-500" />
            <p className="text-sm text-muted-foreground">{error || 'Claim not found.'}</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-xs text-muted-foreground font-mono">{data.claimNumber}</p>
              <p className="text-lg font-semibold mt-1">{STATUS_LABELS[data.status] || data.status}</p>
              {data.insurer && <p className="text-sm text-muted-foreground">{data.insurer}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 border-t">
              <div>
                <p className="text-xs text-muted-foreground">Claimed</p>
                <p className="font-medium text-sm">{formatCurrency(data.claimAmount) || '—'}</p>
              </div>
              {data.approvedAmount != null && (
                <div>
                  <p className="text-xs text-muted-foreground">Approved</p>
                  <p className="font-medium text-sm">{formatCurrency(data.approvedAmount)}</p>
                </div>
              )}
              {data.settledAmount != null && (
                <div>
                  <p className="text-xs text-muted-foreground">Settled</p>
                  <p className="font-medium text-sm">{formatCurrency(data.settledAmount)}</p>
                </div>
              )}
              {formatDate(data.paymentDate) && (
                <div>
                  <p className="text-xs text-muted-foreground">Payment date</p>
                  <p className="font-medium text-sm">{formatDate(data.paymentDate)}</p>
                </div>
              )}
            </div>

            <p className="text-xs text-muted-foreground pt-2 border-t">
              Last updated {formatDate(data.lastUpdated) || 'recently'}. For questions, contact your hospital's insurance desk directly.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ClaimStatusPublic;
