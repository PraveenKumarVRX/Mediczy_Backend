import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  FileText, 
  Users, 
  CreditCard, 
  Hospital, 
  Search, 
  Send,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle
} from 'lucide-react';
import api from '@/utils/api';
import { toast } from 'sonner';
import TPASidebar from '@/components/tpa/TPASidebar';

interface ClaimData {
  TPA_CLAIM_NO: string;
  CLAIM_STATUS: string;
  POLICY_NUMBER: string;
  MEMBER_NAME: string;
  HOSPITAL_NAME: string;
  CLAIM_AMOUNT: string;
  CLAIMED_DATE: string;
  AILMENT: string;
  [key: string]: string;
}

interface EnrollmentData {
  MemberName: string;
  PolicyNumber: string;
  InsuranceCompany: string;
  BaseSumInsured: string;
  PolicyStartDate: string;
  PolicyEndDate: string;
  [key: string]: string;
}

interface HospitalData {
  HospitalId: string;
  HospitalName: string;
  CityName: string;
  StateName: string;
  Address: string;
  [key: string]: string;
}

const TPAHeritageIntegration = () => {
  const [activeTab, setActiveTab] = useState('claims');
  const [loading, setLoading] = useState(false);

  // Claims state
  const [claimsData, setClaimsData] = useState<ClaimData[]>([]);
  const [claimsFilters, setClaimsFilters] = useState({
    PolicyNumber: '',
    FromDate: '',
    ToDate: '',
    EmployeeNumber: '',
    MemberID: ''
  });

  // Claim Intimation state
  const [intimationData, setIntimationData] = useState({
    AilmentDescription: '',
    ContactNo: '',
    ProviderNumber: '',
    DateOfAdmission: '',
    HospName: '',
    HospAddress: '',
    MemberId: '',
    PolicyNo: ''
  });

  // Enrollment state
  const [enrollmentData, setEnrollmentData] = useState<EnrollmentData[]>([]);
  const [enrollmentFilters, setEnrollmentFilters] = useState({
    PolicyNumber: '',
    EmployeeNumber: '',
    MemberID: ''
  });

  // E-Card state
  const [ecardData, setEcardData] = useState<any>(null);
  const [ecardFilters, setEcardFilters] = useState({
    PolicyNumber: '',
    EmployeeNumber: '',
    TPAId: '',
    MemberID: ''
  });

  // Hospitals state
  const [hospitalsData, setHospitalsData] = useState<HospitalData[]>([]);
  const [hospitalCount, setHospitalCount] = useState(0);
  const [hospitalPagination, setHospitalPagination] = useState({
    start: 0,
    end: 100
  });

  const fetchClaims = async () => {
    if (!claimsFilters.PolicyNumber) {
      toast.error('Policy Number is required');
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post('/tpa/heritage/claims', claimsFilters);
      
      if (data.success && data.data.Data) {
        setClaimsData(data.data.Data);
        toast.success(`Fetched ${data.data.Data.length} claims successfully`);
      } else {
        toast.error(data.data.Message || 'Failed to fetch claims');
        setClaimsData([]);
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to fetch claims');
      setClaimsData([]);
    } finally {
      setLoading(false);
    }
  };

  const submitClaimIntimation = async () => {
    if (!intimationData.MemberId || !intimationData.PolicyNo || !intimationData.DateOfAdmission) {
      toast.error('Member ID, Policy Number, and Date of Admission are required');
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post('/tpa/heritage/claim-intimation', intimationData);
      
      if (data.success) {
        toast.success('Claim intimation submitted successfully');
        setIntimationData({
          AilmentDescription: '',
          ContactNo: '',
          ProviderNumber: '',
          DateOfAdmission: '',
          HospName: '',
          HospAddress: '',
          MemberId: '',
          PolicyNo: ''
        });
      } else {
        toast.error('Failed to submit claim intimation');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to submit claim intimation');
    } finally {
      setLoading(false);
    }
  };

  const fetchEnrollment = async () => {
    if (!enrollmentFilters.PolicyNumber) {
      toast.error('Policy Number is required');
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post('/tpa/heritage/enrollment', enrollmentFilters);
      
      if (data.success && data.data.Data) {
        setEnrollmentData(data.data.Data);
        toast.success(`Fetched ${data.data.Data.length} members successfully`);
      } else {
        toast.error(data.data.Message || 'Failed to fetch enrollment data');
        setEnrollmentData([]);
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to fetch enrollment data');
      setEnrollmentData([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchECard = async () => {
    if (!ecardFilters.PolicyNumber) {
      toast.error('Policy Number is required');
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post('/tpa/heritage/ecard', ecardFilters);
      
      if (data.success && data.data.Data) {
        setEcardData(data.data.Data[0]);
        toast.success('E-Card URL fetched successfully');
      } else {
        toast.error(data.data.Message || 'Failed to fetch E-Card');
        setEcardData(null);
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to fetch E-Card');
      setEcardData(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchHospitalCount = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/tpa/heritage/hospitals/count');
      
      if (data.success && data.data.Data) {
        const count = parseInt(data.data.Data[0]?.NetworkHospitalCount || 0);
        setHospitalCount(count);
        toast.success(`Total hospitals: ${count}`);
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to fetch hospital count');
    } finally {
      setLoading(false);
    }
  };

  const fetchHospitals = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/tpa/heritage/hospitals', {
        params: hospitalPagination
      });
      
      if (data.success && data.data.Data) {
        setHospitalsData(data.data.Data);
        toast.success(`Fetched ${data.data.Data.length} hospitals`);
      } else {
        toast.error(data.data.Message || 'Failed to fetch hospitals');
        setHospitalsData([]);
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to fetch hospitals');
      setHospitalsData([]);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusLower = status?.toLowerCase() || '';
    if (statusLower.includes('settled') || statusLower.includes('approved')) {
      return <Badge className="bg-green-100 text-green-800">Approved</Badge>;
    }
    if (statusLower.includes('pending') || statusLower.includes('intimated')) {
      return <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>;
    }
    if (statusLower.includes('rejected') || statusLower.includes('denied')) {
      return <Badge className="bg-red-100 text-red-800">Rejected</Badge>;
    }
    return <Badge className="bg-gray-100 text-gray-800">{status}</Badge>;
  };

  return (
    <div className="flex h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <TPASidebar />
      
      <div className="flex-1 md:ml-64 overflow-auto">
        <div className="px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900">Heritage TPA Integration</h1>
            <p className="text-gray-600 mt-1">Access Heritage TPA APIs for claims, enrollment, and hospitals</p>
          </div>

          <Alert className="mb-6 bg-blue-50 border-blue-200">
            <AlertCircle className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-800">
              This interface connects directly to Heritage Health TPA's live API system. All data is real-time.
            </AlertDescription>
          </Alert>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid grid-cols-5 w-full max-w-4xl">
              <TabsTrigger value="claims">
                <FileText className="h-4 w-4 mr-2" />
                Claims
              </TabsTrigger>
              <TabsTrigger value="intimation">
                <Send className="h-4 w-4 mr-2" />
                Intimation
              </TabsTrigger>
              <TabsTrigger value="enrollment">
                <Users className="h-4 w-4 mr-2" />
                Enrollment
              </TabsTrigger>
              <TabsTrigger value="ecard">
                <CreditCard className="h-4 w-4 mr-2" />
                E-Card
              </TabsTrigger>
              <TabsTrigger value="hospitals">
                <Hospital className="h-4 w-4 mr-2" />
                Hospitals
              </TabsTrigger>
            </TabsList>

            {/* Claims Tab */}
            <TabsContent value="claims">
              <Card>
                <CardHeader>
                  <CardTitle>Get Claims List</CardTitle>
                  <CardDescription>Fetch claims from Heritage TPA API</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="policyNumber">Policy Number *</Label>
                      <Input
                        id="policyNumber"
                        placeholder="Enter policy number"
                        value={claimsFilters.PolicyNumber}
                        onChange={(e) => setClaimsFilters({ ...claimsFilters, PolicyNumber: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="employeeNumber">Employee Number</Label>
                      <Input
                        id="employeeNumber"
                        placeholder="Enter employee number"
                        value={claimsFilters.EmployeeNumber}
                        onChange={(e) => setClaimsFilters({ ...claimsFilters, EmployeeNumber: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="fromDate">From Date</Label>
                      <Input
                        id="fromDate"
                        type="date"
                        value={claimsFilters.FromDate}
                        onChange={(e) => setClaimsFilters({ ...claimsFilters, FromDate: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="toDate">To Date</Label>
                      <Input
                        id="toDate"
                        type="date"
                        value={claimsFilters.ToDate}
                        onChange={(e) => setClaimsFilters({ ...claimsFilters, ToDate: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="memberId">Member ID</Label>
                      <Input
                        id="memberId"
                        placeholder="Enter member ID"
                        value={claimsFilters.MemberID}
                        onChange={(e) => setClaimsFilters({ ...claimsFilters, MemberID: e.target.value })}
                      />
                    </div>
                  </div>

                  <Button onClick={fetchClaims} disabled={loading} className="w-full">
                    <Search className="h-4 w-4 mr-2" />
                    {loading ? 'Fetching...' : 'Fetch Claims'}
                  </Button>

                  {claimsData.length > 0 && (
                    <div className="space-y-4 mt-6">
                      <h3 className="font-semibold text-lg">Claims Results ({claimsData.length})</h3>
                      <div className="space-y-3">
                        {claimsData.map((claim, index) => (
                          <Card key={index} className="border-l-4 border-l-blue-500">
                            <CardContent className="p-4">
                              <div className="flex items-start justify-between mb-3">
                                <div className="flex items-center gap-2">
                                  <FileText className="h-5 w-5 text-blue-600" />
                                  <h4 className="font-semibold">{claim.TPA_CLAIM_NO}</h4>
                                </div>
                                {getStatusBadge(claim.CLAIM_STATUS)}
                              </div>
                              <div className="grid grid-cols-2 gap-3 text-sm">
                                <div>
                                  <span className="text-gray-600">Member:</span>
                                  <span className="ml-2 font-medium">{claim.MEMBER_NAME}</span>
                                </div>
                                <div>
                                  <span className="text-gray-600">Policy:</span>
                                  <span className="ml-2 font-medium">{claim.POLICY_NUMBER}</span>
                                </div>
                                <div>
                                  <span className="text-gray-600">Hospital:</span>
                                  <span className="ml-2 font-medium">{claim.HOSPITAL_NAME}</span>
                                </div>
                                <div>
                                  <span className="text-gray-600">Amount:</span>
                                  <span className="ml-2 font-medium">₹{parseInt(claim.CLAIM_AMOUNT || '0').toLocaleString()}</span>
                                </div>
                                <div className="col-span-2">
                                  <span className="text-gray-600">Ailment:</span>
                                  <span className="ml-2 font-medium">{claim.AILMENT}</span>
                                </div>
                                <div>
                                  <span className="text-gray-600">Claimed Date:</span>
                                  <span className="ml-2 font-medium">{claim.CLAIMED_DATE}</span>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Claim Intimation Tab */}
            <TabsContent value="intimation">
              <Card>
                <CardHeader>
                  <CardTitle>Submit Claim Intimation</CardTitle>
                  <CardDescription>Submit a new claim intimation to Heritage TPA</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="intimPolicyNo">Policy Number *</Label>
                      <Input
                        id="intimPolicyNo"
                        placeholder="Enter policy number"
                        value={intimationData.PolicyNo}
                        onChange={(e) => setIntimationData({ ...intimationData, PolicyNo: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="intimMemberId">Member ID *</Label>
                      <Input
                        id="intimMemberId"
                        placeholder="Enter member ID"
                        value={intimationData.MemberId}
                        onChange={(e) => setIntimationData({ ...intimationData, MemberId: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="intimDateAdmission">Date of Admission *</Label>
                      <Input
                        id="intimDateAdmission"
                        type="date"
                        value={intimationData.DateOfAdmission}
                        onChange={(e) => setIntimationData({ ...intimationData, DateOfAdmission: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="intimContactNo">Contact Number</Label>
                      <Input
                        id="intimContactNo"
                        placeholder="Enter contact number"
                        value={intimationData.ContactNo}
                        onChange={(e) => setIntimationData({ ...intimationData, ContactNo: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="intimHospName">Hospital Name</Label>
                      <Input
                        id="intimHospName"
                        placeholder="Enter hospital name"
                        value={intimationData.HospName}
                        onChange={(e) => setIntimationData({ ...intimationData, HospName: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="intimProviderNo">Provider Number</Label>
                      <Input
                        id="intimProviderNo"
                        placeholder="Enter provider number"
                        value={intimationData.ProviderNumber}
                        onChange={(e) => setIntimationData({ ...intimationData, ProviderNumber: e.target.value })}
                      />
                    </div>
                    <div className="col-span-2">
                      <Label htmlFor="intimHospAddress">Hospital Address</Label>
                      <Input
                        id="intimHospAddress"
                        placeholder="Enter hospital address"
                        value={intimationData.HospAddress}
                        onChange={(e) => setIntimationData({ ...intimationData, HospAddress: e.target.value })}
                      />
                    </div>
                    <div className="col-span-2">
                      <Label htmlFor="intimAilment">Ailment Description</Label>
                      <Textarea
                        id="intimAilment"
                        placeholder="Describe the ailment"
                        rows={3}
                        value={intimationData.AilmentDescription}
                        onChange={(e) => setIntimationData({ ...intimationData, AilmentDescription: e.target.value })}
                      />
                    </div>
                  </div>

                  <Button onClick={submitClaimIntimation} disabled={loading} className="w-full">
                    <Send className="h-4 w-4 mr-2" />
                    {loading ? 'Submitting...' : 'Submit Claim Intimation'}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Enrollment Tab */}
            <TabsContent value="enrollment">
              <Card>
                <CardHeader>
                  <CardTitle>Get Enrollment Details</CardTitle>
                  <CardDescription>Fetch member enrollment information from Heritage TPA</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="enrollPolicyNo">Policy Number *</Label>
                      <Input
                        id="enrollPolicyNo"
                        placeholder="Enter policy number"
                        value={enrollmentFilters.PolicyNumber}
                        onChange={(e) => setEnrollmentFilters({ ...enrollmentFilters, PolicyNumber: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="enrollEmployeeNo">Employee Number</Label>
                      <Input
                        id="enrollEmployeeNo"
                        placeholder="Enter employee number"
                        value={enrollmentFilters.EmployeeNumber}
                        onChange={(e) => setEnrollmentFilters({ ...enrollmentFilters, EmployeeNumber: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="enrollMemberId">Member ID</Label>
                      <Input
                        id="enrollMemberId"
                        placeholder="Enter member ID"
                        value={enrollmentFilters.MemberID}
                        onChange={(e) => setEnrollmentFilters({ ...enrollmentFilters, MemberID: e.target.value })}
                      />
                    </div>
                  </div>

                  <Button onClick={fetchEnrollment} disabled={loading} className="w-full">
                    <Search className="h-4 w-4 mr-2" />
                    {loading ? 'Fetching...' : 'Fetch Enrollment Data'}
                  </Button>

                  {enrollmentData.length > 0 && (
                    <div className="space-y-4 mt-6">
                      <h3 className="font-semibold text-lg">Enrollment Results ({enrollmentData.length})</h3>
                      <div className="space-y-3">
                        {enrollmentData.map((member, index) => (
                          <Card key={index} className="border-l-4 border-l-green-500">
                            <CardContent className="p-4">
                              <div className="flex items-start justify-between mb-3">
                                <div className="flex items-center gap-2">
                                  <Users className="h-5 w-5 text-green-600" />
                                  <h4 className="font-semibold">{member.MemberName}</h4>
                                </div>
                                <Badge className="bg-green-100 text-green-800">Active</Badge>
                              </div>
                              <div className="grid grid-cols-2 gap-3 text-sm">
                                <div>
                                  <span className="text-gray-600">Policy Number:</span>
                                  <span className="ml-2 font-medium">{member.PolicyNumber}</span>
                                </div>
                                <div>
                                  <span className="text-gray-600">Insurance Company:</span>
                                  <span className="ml-2 font-medium">{member.InsuranceCompany}</span>
                                </div>
                                <div>
                                  <span className="text-gray-600">Sum Insured:</span>
                                  <span className="ml-2 font-medium">₹{parseInt(member.BaseSumInsured || '0').toLocaleString()}</span>
                                </div>
                                <div>
                                  <span className="text-gray-600">Policy Period:</span>
                                  <span className="ml-2 font-medium">{member.PolicyStartDate} - {member.PolicyEndDate}</span>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* E-Card Tab */}
            <TabsContent value="ecard">
              <Card>
                <CardHeader>
                  <CardTitle>Get Member E-Card</CardTitle>
                  <CardDescription>Fetch E-Card URL for a member from Heritage TPA</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="ecardPolicyNo">Policy Number *</Label>
                      <Input
                        id="ecardPolicyNo"
                        placeholder="Enter policy number"
                        value={ecardFilters.PolicyNumber}
                        onChange={(e) => setEcardFilters({ ...ecardFilters, PolicyNumber: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="ecardEmployeeNo">Employee Number</Label>
                      <Input
                        id="ecardEmployeeNo"
                        placeholder="Enter employee number"
                        value={ecardFilters.EmployeeNumber}
                        onChange={(e) => setEcardFilters({ ...ecardFilters, EmployeeNumber: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="ecardTpaId">TPA ID</Label>
                      <Input
                        id="ecardTpaId"
                        placeholder="Enter TPA ID"
                        value={ecardFilters.TPAId}
                        onChange={(e) => setEcardFilters({ ...ecardFilters, TPAId: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="ecardMemberId">Member ID</Label>
                      <Input
                        id="ecardMemberId"
                        placeholder="Enter member ID"
                        value={ecardFilters.MemberID}
                        onChange={(e) => setEcardFilters({ ...ecardFilters, MemberID: e.target.value })}
                      />
                    </div>
                  </div>

                  <Button onClick={fetchECard} disabled={loading} className="w-full">
                    <CreditCard className="h-4 w-4 mr-2" />
                    {loading ? 'Fetching...' : 'Fetch E-Card'}
                  </Button>

                  {ecardData && (
                    <Card className="mt-6 border-l-4 border-l-purple-500">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-4">
                          <CreditCard className="h-5 w-5 text-purple-600" />
                          <h4 className="font-semibold">E-Card Details</h4>
                        </div>
                        <div className="space-y-2">
                          {Object.entries(ecardData).map(([key, value]) => (
                            <div key={key} className="flex justify-between text-sm">
                              <span className="text-gray-600">{key}:</span>
                              <span className="font-medium">
                                {typeof value === 'string' && value.startsWith('http') ? (
                                  <a href={value} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                                    View E-Card
                                  </a>
                                ) : (
                                  String(value)
                                )}
                              </span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Hospitals Tab */}
            <TabsContent value="hospitals">
              <Card>
                <CardHeader>
                  <CardTitle>Network Hospitals</CardTitle>
                  <CardDescription>Browse network hospitals from Heritage TPA</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex gap-4">
                    <Button onClick={fetchHospitalCount} disabled={loading} variant="outline">
                      <Search className="h-4 w-4 mr-2" />
                      Get Hospital Count
                    </Button>
                    {hospitalCount > 0 && (
                      <Badge variant="outline" className="text-lg px-4">
                        Total: {hospitalCount.toLocaleString()} hospitals
                      </Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="hospStart">Start Index</Label>
                      <Input
                        id="hospStart"
                        type="number"
                        value={hospitalPagination.start}
                        onChange={(e) => setHospitalPagination({ ...hospitalPagination, start: parseInt(e.target.value) })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="hospEnd">End Index</Label>
                      <Input
                        id="hospEnd"
                        type="number"
                        value={hospitalPagination.end}
                        onChange={(e) => setHospitalPagination({ ...hospitalPagination, end: parseInt(e.target.value) })}
                      />
                    </div>
                  </div>

                  <Button onClick={fetchHospitals} disabled={loading} className="w-full">
                    <Hospital className="h-4 w-4 mr-2" />
                    {loading ? 'Fetching...' : 'Fetch Hospitals'}
                  </Button>

                  {hospitalsData.length > 0 && (
                    <div className="space-y-4 mt-6">
                      <h3 className="font-semibold text-lg">Hospitals ({hospitalsData.length})</h3>
                      <div className="space-y-3">
                        {hospitalsData.map((hospital, index) => (
                          <Card key={index} className="border-l-4 border-l-orange-500">
                            <CardContent className="p-4">
                              <div className="flex items-start gap-3">
                                <Hospital className="h-5 w-5 text-orange-600 mt-1" />
                                <div className="flex-1">
                                  <h4 className="font-semibold mb-2">{hospital.HospitalName}</h4>
                                  <div className="grid grid-cols-2 gap-2 text-sm">
                                    <div>
                                      <span className="text-gray-600">ID:</span>
                                      <span className="ml-2 font-medium">{hospital.HospitalId}</span>
                                    </div>
                                    <div>
                                      <span className="text-gray-600">City:</span>
                                      <span className="ml-2 font-medium">{hospital.CityName}</span>
                                    </div>
                                    <div>
                                      <span className="text-gray-600">State:</span>
                                      <span className="ml-2 font-medium">{hospital.StateName}</span>
                                    </div>
                                    <div className="col-span-2">
                                      <span className="text-gray-600">Address:</span>
                                      <span className="ml-2 font-medium">{hospital.Address}</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default TPAHeritageIntegration;
