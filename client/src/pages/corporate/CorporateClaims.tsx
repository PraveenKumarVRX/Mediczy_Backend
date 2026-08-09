import React, { useEffect, useMemo, useState } from 'react';
import { FileText, DollarSign, Clock, CheckCircle, XCircle, AlertCircle, Search, Filter, Upload, Download, Eye, Receipt } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import api from '@/utils/api';
import CorporateLayout from '@/components/corporate/CorporateLayout';
import CorporatePageHeader from '@/components/corporate/CorporatePageHeader';
import CorporateStatusBadge from '@/components/corporate/CorporateStatusBadge';

interface Claim {
  id: string;
  employeeName: string;
  employeeId: string;
  claimType: string;
  benefitCategory: 'insurance' | 'wellness';
  amount: string;
  submittedDate: string;
  status: 'pending' | 'approved' | 'rejected' | 'processing' | 'paid';
  provider: string;
  serviceDate: string;
  description: string;
  documents: number;
}

const CorporateClaims: React.FC = () => {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'insurance' | 'wellness'>('all');

  const [claims, setClaims] = useState<Claim[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [selectedClaim, setSelectedClaim] = useState<Claim | null>(null);

  const loadClaims = async () => {
    try {
      setIsLoading(true);
      const { data } = await api.get('/corporate/claims/management', {
        params: {
          q: searchQuery || undefined,
          status: statusFilter,
        },
      });
      const list = ((data as any)?.data?.claims || []) as Claim[];
      setClaims(list);
    } catch (error: any) {
      toast({
        title: 'Failed to load claims',
        description: error?.response?.data?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadClaims();
  }, [statusFilter]);

  const parseAmount = (value: string) => {
    const num = Number(String(value || '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(num) ? num : 0;
  };

  const stats = {
    totalClaims: claims.length,
    pending: claims.filter(c => c.status === 'pending').length,
    approved: claims.filter(c => c.status === 'approved' || c.status === 'paid').length,
    rejected: claims.filter(c => c.status === 'rejected').length,
    totalAmount: claims.reduce((sum, claim) => sum + parseAmount(claim.amount), 0)
  };

  const filteredClaims = useMemo(() => {
    return claims.filter((claim) => {
      const matchesSearch =
        claim.employeeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        claim.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        claim.claimType.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus = statusFilter === 'all' || claim.status === statusFilter;
      const matchesCategory = categoryFilter === 'all' || claim.benefitCategory === categoryFilter;

      return matchesSearch && matchesStatus && matchesCategory;
    });
  }, [claims, searchQuery, statusFilter, categoryFilter]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'bg-emerald-500/15 text-emerald-400';
      case 'paid':
        return 'bg-blue-500/15 text-blue-400';
      case 'processing':
        return 'bg-amber-500/15 text-amber-400';
      case 'pending':
        return 'bg-orange-500/15 text-orange-400';
      case 'rejected':
        return 'bg-red-500/15 text-red-400';
      default:
        return 'bg-slate-700/50 text-slate-400';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
      case 'paid':
        return <CheckCircle className="h-4 w-4" />;
      case 'rejected':
        return <XCircle className="h-4 w-4" />;
      case 'pending':
        return <AlertCircle className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };


  const handleView = (claim: Claim) => {
    setSelectedClaim(claim);
    setViewOpen(true);
  };

  const handleDownload = async (claim: Claim) => {
    try {
      const response = await api.get(`/corporate/claims/management/${encodeURIComponent(claim.id)}/download`, {
        responseType: 'blob',
      });
      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${claim.id}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast({ title: 'Downloaded', description: 'Claim export downloaded.' });
    } catch (error: any) {
      toast({
        title: 'Download failed',
        description: error?.response?.data?.message || 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const updateClaimStatus = async (claim: Claim, status: Claim['status']) => {
    try {
      const { data } = await api.put(`/corporate/claims/management/${encodeURIComponent(claim.id)}`, { status });
      const updated = (data as any)?.data?.claim as Claim | undefined;
      setClaims((prev) => prev.map((c) => (c.id === claim.id ? (updated || { ...c, status }) : c)));
      toast({ title: 'Status updated', description: `Claim marked as ${status}.` });
    } catch (error: any) {
      toast({
        title: 'Update failed',
        description: error?.response?.data?.message || 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  return (
    <CorporateLayout title="Claims Management">
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 p-4 sm:p-6 space-y-6">
        <CorporatePageHeader
          icon={Receipt}
          title="Claims Management"
          description="Review employee insurance and wellness reimbursement claims. Employees file claims from their own app; HR reviews and approves here."
          gradient="from-cyan-500 to-cyan-700"
          badge={`${claims.length} Claims`}
          showSearch={true}
          searchPlaceholder="Search by employee name, claim ID, or type..."
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          showRefresh={true}
          onRefresh={loadClaims}
          isRefreshing={isLoading}
          stats={[
            { label: 'Total Claims', value: stats.totalClaims },
            { label: 'Pending', value: stats.pending },
            { label: 'Approved', value: stats.approved },
            { label: 'Total Amount', value: `₹${stats.totalAmount.toLocaleString()}` },
          ]}
        />

        <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Claim Details</DialogTitle>
            <DialogDescription>Review claim information and download export.</DialogDescription>
          </DialogHeader>
          {selectedClaim && (
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-base">{selectedClaim.employeeName}</div>
                  <div className="text-slate-400">{selectedClaim.employeeId} • {selectedClaim.id}</div>
                </div>
                <Badge className={getStatusColor(selectedClaim.status)}>
                  <div className="flex items-center gap-1">
                    {getStatusIcon(selectedClaim.status)}
                    <span className="capitalize">{selectedClaim.status}</span>
                  </div>
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-slate-400">Type</div>
                  <div className="font-medium">{selectedClaim.claimType}</div>
                </div>
                <div>
                  <div className="text-slate-400">Amount</div>
                  <div className="font-medium">{selectedClaim.amount}</div>
                </div>
                <div>
                  <div className="text-slate-400">Provider</div>
                  <div className="font-medium">{selectedClaim.provider}</div>
                </div>
                <div>
                  <div className="text-slate-400">Service Date</div>
                  <div className="font-medium">{new Date(selectedClaim.serviceDate).toLocaleDateString()}</div>
                </div>
              </div>
              <div>
                <div className="text-slate-400">Description</div>
                <div className="font-medium">{selectedClaim.description}</div>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => handleDownload(selectedClaim)}>
                  <Download className="h-4 w-4 mr-1" />
                  Download
                </Button>
                <Button variant="outline" onClick={() => setViewOpen(false)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

        {/* Statistics Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Claims</CardTitle>
            <FileText className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalClaims}</div>
            <p className="text-xs text-muted-foreground">All time</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{stats.pending}</div>
            <p className="text-xs text-muted-foreground">Awaiting review</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Approved</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.approved}</div>
            <p className="text-xs text-muted-foreground">Approved/Paid</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rejected</CardTitle>
            <XCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.rejected}</div>
            <p className="text-xs text-muted-foreground">Not approved</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Amount</CardTitle>
            <DollarSign className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${stats.totalAmount.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Claimed amount</p>
          </CardContent>
        </Card>
        </div>

        {/* Claims List */}
        <Card>
          <CardHeader>
            <CardTitle>Claims Management</CardTitle>
            <CardDescription>View and process all insurance claims</CardDescription>
          </CardHeader>
          <CardContent>
          <div className="flex gap-4 mb-6">
            <div className="flex-1 relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by employee, claim ID, or type..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as typeof categoryFilter)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Insurance & Wellness</SelectItem>
                <SelectItem value="insurance">Insurance only</SelectItem>
                <SelectItem value="wellness">Wellness / OPD only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end mb-4">
            <Button variant="outline" size="sm" onClick={loadClaims} disabled={isLoading}>
              Refresh
            </Button>
          </div>

          <div className="space-y-4">
            {filteredClaims.map((claim) => (
              <Card key={claim.id}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="space-y-3 flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold text-lg">{claim.employeeName}</h3>
                        <Badge variant="outline">{claim.employeeId}</Badge>
                        <Badge className={getStatusColor(claim.status)}>
                          <div className="flex items-center gap-1">
                            {getStatusIcon(claim.status)}
                            <span className="capitalize">{claim.status}</span>
                          </div>
                        </Badge>
                        <Badge
                          variant="outline"
                          className={claim.benefitCategory === 'insurance'
                            ? 'border-blue-500/40 text-blue-300 bg-blue-500/10'
                            : 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10'}
                        >
                          {claim.benefitCategory === 'insurance' ? 'Insurance' : 'Wellness / OPD'}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-slate-400">Claim ID</p>
                          <p className="font-semibold">{claim.id}</p>
                        </div>
                        <div>
                          <p className="text-slate-400">Type</p>
                          <p className="font-semibold">{claim.claimType}</p>
                        </div>
                        <div>
                          <p className="text-slate-400">Amount</p>
                          <p className="font-semibold text-green-600">{claim.amount}</p>
                        </div>
                        <div>
                          <p className="text-slate-400">Service Date</p>
                          <p className="font-semibold">{new Date(claim.serviceDate).toLocaleDateString()}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-slate-400">Provider</p>
                          <p className="font-semibold">{claim.provider}</p>
                        </div>
                        <div>
                          <p className="text-slate-400">Submitted</p>
                          <p className="font-semibold">{new Date(claim.submittedDate).toLocaleDateString()}</p>
                        </div>
                      </div>

                      <div className="text-sm text-slate-400">
                        <strong>Description:</strong> {claim.description}
                      </div>

                      <div className="flex items-center gap-2 text-sm text-slate-400">
                        <FileText className="h-4 w-4" />
                        <span>{claim.documents} document(s) attached</span>
                      </div>
                    </div>

                    <div className="flex gap-2 ml-4">
                      <Button variant="outline" size="sm" onClick={() => handleView(claim)}>
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleDownload(claim)}>
                        <Download className="h-4 w-4 mr-1" />
                        Download
                      </Button>
                      {claim.status === 'pending' && (
                        <>
                          <Button size="sm" variant="default" onClick={() => updateClaimStatus(claim, 'approved')}>Approve</Button>
                          <Button size="sm" variant="destructive" onClick={() => updateClaimStatus(claim, 'rejected')}>Reject</Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {isLoading && claims.length === 0 && (
            <div className="text-sm text-slate-400 mt-4">Loading claims…</div>
          )}

          {filteredClaims.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No claims found matching your criteria</p>
            </div>
          )}
        </CardContent>
      </Card>
      </div>
    </CorporateLayout>
  );
};

export default CorporateClaims;
