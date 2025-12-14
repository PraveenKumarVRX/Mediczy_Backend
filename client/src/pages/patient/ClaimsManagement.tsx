import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { FileText, Upload, Clock, CheckCircle, XCircle, AlertCircle, Plus, Calendar, DollarSign, Hospital } from 'lucide-react';

interface Claim {
  id: string;
  claimNumber: string;
  type: 'hospitalization' | 'outpatient' | 'pre_post_hospitalization' | 'day_care' | 'ambulance';
  status: 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'settled';
  claimAmount: number;
  approvedAmount?: number;
  hospital: string;
  admissionDate: Date;
  dischargeDate?: Date;
  submittedDate?: Date;
  documents: string[];
  remarks?: string;
}

const ClaimsManagement: React.FC = () => {
  const [claims, setClaims] = useState<Claim[]>([
    {
      id: '1',
      claimNumber: 'CLM2025001234',
      type: 'hospitalization',
      status: 'approved',
      claimAmount: 125000,
      approvedAmount: 120000,
      hospital: 'Apollo Hospital, Hyderabad',
      admissionDate: new Date('2024-12-15'),
      dischargeDate: new Date('2024-12-20'),
      submittedDate: new Date('2024-12-22'),
      documents: ['Discharge Summary', 'Bills', 'Investigation Reports'],
      remarks: 'Pre-approval obtained. Claim approved with minor deductions.'
    },
    {
      id: '2',
      claimNumber: 'CLM2025001567',
      type: 'day_care',
      status: 'under_review',
      claimAmount: 35000,
      hospital: 'CARE Hospitals, Banjara Hills',
      admissionDate: new Date('2025-01-10'),
      dischargeDate: new Date('2025-01-10'),
      submittedDate: new Date('2025-01-11'),
      documents: ['Medical Bills', 'Prescriptions', 'Reports'],
      remarks: 'Documents under verification. Expected settlement in 5-7 days.'
    },
    {
      id: '3',
      claimNumber: 'CLM2025001890',
      type: 'pre_post_hospitalization',
      status: 'submitted',
      claimAmount: 15000,
      hospital: 'Continental Hospitals',
      admissionDate: new Date('2025-01-05'),
      submittedDate: new Date('2025-01-14'),
      documents: ['Consultation Bills', 'Medicine Bills'],
      remarks: 'Pre-hospitalization expenses claim submitted.'
    }
  ]);

  const [activeTab, setActiveTab] = useState<string>('all');
  const [isNewClaimDialogOpen, setIsNewClaimDialogOpen] = useState(false);
  const [newClaim, setNewClaim] = useState({
    type: 'hospitalization',
    hospital: '',
    claimAmount: '',
    admissionDate: ''
  });

  const statusConfig: Record<string, { label: string; icon: any; color: string }> = {
    draft: { label: 'Draft', icon: FileText, color: 'bg-gray-100 text-gray-800' },
    submitted: { label: 'Submitted', icon: Upload, color: 'bg-blue-100 text-blue-800' },
    under_review: { label: 'Under Review', icon: Clock, color: 'bg-yellow-100 text-yellow-800' },
    approved: { label: 'Approved', icon: CheckCircle, color: 'bg-green-100 text-green-800' },
    rejected: { label: 'Rejected', icon: XCircle, color: 'bg-red-100 text-red-800' },
    settled: { label: 'Settled', icon: CheckCircle, color: 'bg-green-100 text-green-800' }
  };

  const claimTypes = [
    { value: 'hospitalization', label: 'Hospitalization' },
    { value: 'outpatient', label: 'Outpatient' },
    { value: 'pre_post_hospitalization', label: 'Pre/Post Hospitalization' },
    { value: 'day_care', label: 'Day Care Procedure' },
    { value: 'ambulance', label: 'Ambulance' }
  ];

  const getStatusBadge = (status: string) => {
    const config = statusConfig[status];
    const Icon = config.icon;
    return (
      <Badge className={`${config.color} flex items-center gap-1`}>
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const filteredClaims = activeTab === 'all' 
    ? claims 
    : claims.filter(claim => claim.status === activeTab);

  const handleSubmitClaim = () => {
    if (!newClaim.hospital || !newClaim.claimAmount || !newClaim.admissionDate) return;

    const claim: Claim = {
      id: Date.now().toString(),
      claimNumber: `CLM${Date.now()}`,
      type: newClaim.type as Claim['type'],
      status: 'draft',
      claimAmount: parseFloat(newClaim.claimAmount),
      hospital: newClaim.hospital,
      admissionDate: new Date(newClaim.admissionDate),
      submittedDate: new Date(),
      documents: []
    };

    setClaims([claim, ...claims]);
    setIsNewClaimDialogOpen(false);
    setNewClaim({ type: 'hospitalization', hospital: '', claimAmount: '', admissionDate: '' });
  };

  const stats = {
    total: claims.length,
    pending: claims.filter(c => c.status === 'submitted' || c.status === 'under_review').length,
    approved: claims.filter(c => c.status === 'approved').length,
    settled: claims.filter(c => c.status === 'settled').length
  };

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Claims Management</h1>
          <p className="text-gray-600 mt-1">Submit and track your insurance claims</p>
        </div>
        <Dialog open={isNewClaimDialogOpen} onOpenChange={setIsNewClaimDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Claim
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Submit New Claim</DialogTitle>
              <DialogDescription>File a new insurance claim</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="claim-type">Claim Type</Label>
                <select
                  id="claim-type"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={newClaim.type}
                  onChange={(e) => setNewClaim({ ...newClaim, type: e.target.value })}
                >
                  {claimTypes.map(type => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="hospital">Hospital Name</Label>
                <Input
                  id="hospital"
                  placeholder="Enter hospital name"
                  value={newClaim.hospital}
                  onChange={(e) => setNewClaim({ ...newClaim, hospital: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="amount">Claim Amount (₹)</Label>
                <Input
                  id="amount"
                  type="number"
                  placeholder="Enter claim amount"
                  value={newClaim.claimAmount}
                  onChange={(e) => setNewClaim({ ...newClaim, claimAmount: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="admission-date">Admission Date</Label>
                <Input
                  id="admission-date"
                  type="date"
                  value={newClaim.admissionDate}
                  onChange={(e) => setNewClaim({ ...newClaim, admissionDate: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsNewClaimDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmitClaim}>Create Draft</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Total Claims</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Pending Review</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-yellow-600">{stats.pending}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Approved</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-600">{stats.approved}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Settled</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-blue-600">{stats.settled}</p>
          </CardContent>
        </Card>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        <Button
          variant={activeTab === 'all' ? 'default' : 'outline'}
          onClick={() => setActiveTab('all')}
          size="sm"
        >
          All Claims
        </Button>
        {Object.entries(statusConfig).map(([key, config]) => (
          <Button
            key={key}
            variant={activeTab === key ? 'default' : 'outline'}
            onClick={() => setActiveTab(key)}
            size="sm"
          >
            {config.label}
          </Button>
        ))}
      </div>

      {/* Claims List */}
      <div className="space-y-4">
        {filteredClaims.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12 text-gray-500">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No claims found</p>
              <Button className="mt-4" onClick={() => setIsNewClaimDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Submit Your First Claim
              </Button>
            </CardContent>
          </Card>
        ) : (
          filteredClaims.map((claim) => (
            <Card key={claim.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-xl mb-2">{claim.claimNumber}</CardTitle>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Badge variant="outline" className="capitalize">
                        {claim.type.replace('_', ' ')}
                      </Badge>
                      {getStatusBadge(claim.status)}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-600">Claim Amount</p>
                    <p className="text-2xl font-bold">₹{claim.claimAmount.toLocaleString()}</p>
                    {claim.approvedAmount && (
                      <p className="text-sm text-green-600">
                        Approved: ₹{claim.approvedAmount.toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Hospital className="h-4 w-4 text-gray-500" />
                    <span className="font-medium">{claim.hospital}</span>
                  </div>
                  
                  <div className="grid md:grid-cols-2 gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-gray-500" />
                      <div>
                        <span className="text-gray-600">Admission: </span>
                        <span className="font-medium">
                          {new Date(claim.admissionDate).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    {claim.dischargeDate && (
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-gray-500" />
                        <div>
                          <span className="text-gray-600">Discharge: </span>
                          <span className="font-medium">
                            {new Date(claim.dischargeDate).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    )}
                    {claim.submittedDate && (
                      <div className="flex items-center gap-2">
                        <Upload className="h-4 w-4 text-gray-500" />
                        <div>
                          <span className="text-gray-600">Submitted: </span>
                          <span className="font-medium">
                            {new Date(claim.submittedDate).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {claim.documents.length > 0 && (
                    <div>
                      <p className="text-sm text-gray-600 mb-2">Documents Submitted:</p>
                      <div className="flex flex-wrap gap-2">
                        {claim.documents.map((doc, index) => (
                          <Badge key={index} variant="secondary">
                            <FileText className="h-3 w-3 mr-1" />
                            {doc}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {claim.remarks && (
                    <div className="p-3 bg-blue-50 rounded-lg">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 text-blue-600 mt-0.5" />
                        <p className="text-sm text-gray-700">{claim.remarks}</p>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" className="flex-1">
                      View Details
                    </Button>
                    {claim.status === 'draft' && (
                      <Button>Submit Claim</Button>
                    )}
                    {claim.status === 'under_review' && (
                      <Button variant="outline">
                        <Upload className="mr-2 h-4 w-4" />
                        Upload Documents
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Help Section */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Need Help with Claims?</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-6">
            <div>
              <h4 className="font-semibold mb-2">24/7 Support</h4>
              <p className="text-sm text-gray-600">
                Our claim support team is available round the clock to assist you
              </p>
              <Button variant="link" className="pl-0">Call: 1800-XXX-XXXX</Button>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Documents Required</h4>
              <p className="text-sm text-gray-600">
                Discharge summary, bills, investigation reports, prescriptions, and ID proof
              </p>
              <Button variant="link" className="pl-0">View Checklist</Button>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Track Status</h4>
              <p className="text-sm text-gray-600">
                Get real-time updates on your claim status via SMS and email
              </p>
              <Button variant="link" className="pl-0">Enable Notifications</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ClaimsManagement;
