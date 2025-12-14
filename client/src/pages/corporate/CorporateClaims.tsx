import React, { useEffect, useMemo, useState } from 'react';
import { FileText, DollarSign, Clock, CheckCircle, XCircle, AlertCircle, Search, Filter, Upload, Download, Eye } from 'lucide-react';
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

interface Claim {
  id: string;
  employeeName: string;
  employeeId: string;
  claimType: string;
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
  const [isSubmitDialogOpen, setIsSubmitDialogOpen] = useState(false);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const parseAmount = (value: string) => {
    const num = Number(String(value || '').replace(/[^0-9.\-]/g, ''));
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

      return matchesSearch && matchesStatus;
    });
  }, [claims, searchQuery, statusFilter]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'bg-green-100 text-green-800';
      case 'paid':
        return 'bg-blue-100 text-blue-800';
      case 'processing':
        return 'bg-yellow-100 text-yellow-800';
      case 'pending':
        return 'bg-orange-100 text-orange-800';
      case 'rejected':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
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

  const handleSubmitClaim = () => {
    toast({
      title: "Claim Submitted",
      description: "Your insurance claim has been submitted successfully."
    });
    setIsSubmitDialogOpen(false);
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
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Insurance Claims Management</h1>
          <p className="text-gray-500 mt-1">Track and manage employee insurance claims</p>
        </div>
        <Dialog open={isSubmitDialogOpen} onOpenChange={setIsSubmitDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Upload className="h-4 w-4 mr-2" />
              Submit New Claim
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[525px]">
            <DialogHeader>
              <DialogTitle>Submit Insurance Claim</DialogTitle>
              <DialogDescription>
                Fill in the claim details and upload supporting documents
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="employee">Employee</Label>
                <Select>
                  <SelectTrigger id="employee">
                    <SelectValue placeholder="Select employee" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="emp1">John Smith - EMP001</SelectItem>
                    <SelectItem value="emp2">Emily Davis - EMP002</SelectItem>
                    <SelectItem value="emp3">Robert Wilson - EMP003</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="claimType">Claim Type</Label>
                <Select>
                  <SelectTrigger id="claimType">
                    <SelectValue placeholder="Select claim type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="medical">Medical Consultation</SelectItem>
                    <SelectItem value="dental">Dental Care</SelectItem>
                    <SelectItem value="vision">Vision Care</SelectItem>
                    <SelectItem value="prescription">Prescription Medication</SelectItem>
                    <SelectItem value="mental">Mental Health</SelectItem>
                    <SelectItem value="lab">Laboratory Tests</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="amount">Claim Amount</Label>
                  <Input id="amount" type="text" placeholder="$0.00" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="serviceDate">Service Date</Label>
                  <Input id="serviceDate" type="date" />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="provider">Healthcare Provider</Label>
                <Input id="provider" placeholder="Provider name" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="description">Description</Label>
                <Textarea id="description" placeholder="Describe the medical service..." />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="documents">Upload Documents</Label>
                <Input id="documents" type="file" multiple />
                <p className="text-xs text-gray-500">Upload receipts, prescriptions, and medical reports</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsSubmitDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmitClaim}>Submit Claim</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

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
                  <div className="text-gray-600">{selectedClaim.employeeId} • {selectedClaim.id}</div>
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
                  <div className="text-gray-600">Type</div>
                  <div className="font-medium">{selectedClaim.claimType}</div>
                </div>
                <div>
                  <div className="text-gray-600">Amount</div>
                  <div className="font-medium">{selectedClaim.amount}</div>
                </div>
                <div>
                  <div className="text-gray-600">Provider</div>
                  <div className="font-medium">{selectedClaim.provider}</div>
                </div>
                <div>
                  <div className="text-gray-600">Service Date</div>
                  <div className="font-medium">{new Date(selectedClaim.serviceDate).toLocaleDateString()}</div>
                </div>
              </div>
              <div>
                <div className="text-gray-600">Description</div>
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
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-gray-600">Claim ID</p>
                          <p className="font-semibold">{claim.id}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Type</p>
                          <p className="font-semibold">{claim.claimType}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Amount</p>
                          <p className="font-semibold text-green-600">{claim.amount}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Service Date</p>
                          <p className="font-semibold">{new Date(claim.serviceDate).toLocaleDateString()}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-gray-600">Provider</p>
                          <p className="font-semibold">{claim.provider}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Submitted</p>
                          <p className="font-semibold">{new Date(claim.submittedDate).toLocaleDateString()}</p>
                        </div>
                      </div>

                      <div className="text-sm text-gray-600">
                        <strong>Description:</strong> {claim.description}
                      </div>

                      <div className="flex items-center gap-2 text-sm text-gray-600">
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
            <div className="text-sm text-gray-600 mt-4">Loading claims…</div>
          )}

          {filteredClaims.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No claims found matching your criteria</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CorporateClaims;
