import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import CorporateLayout from "@/components/corporate/CorporateLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import CorporatePageHeader from "@/components/corporate/CorporatePageHeader";
import { 
  Building2,
  Shield,
  CheckCircle,
  Calendar,
  CalendarCheck,
  Stethoscope,
  Heart,
  Activity,
  TestTube,
  Baby,
  Pill,
  Ambulance,
  Home,
  Brain,
  Sparkles,
  Clock,
  MapPin,
  Phone,
  Mail,
  FileText,
  Download,
  Eye,
  Plus,
  Search,
  User,
  IndianRupee,
  AlertCircle,
  Gift
} from "lucide-react";
import api from "@/utils/api";
import { useAuth } from "@/auth/AuthProvider";

interface CorporatePlan {
  id: string;
  planName: string;
  corporateName: string;
  validFrom: string;
  validTo: string;
  planType: 'Standard' | 'Premium' | 'Elite';
  benefits: {
    category: string;
    description: string;
    coverage: string;
    limit?: string;
  }[];
  features: {
    opdCoverage: boolean;
    ipdCoverage: boolean;
    maternityCoverage: boolean;
    dentalCoverage: boolean;
    pharmacyCoverage: boolean;
    diagnosticsCoverage: boolean;
    homecareCoverage: boolean;
    ambulanceCoverage: boolean;
    wellnessCoverage: boolean;
    mentalHealthCoverage: boolean;
  };
  coverage: {
    sumInsured: number;
    roomRentLimit: number;
    icuRentLimit: number;
    preHospitalizationDays: number;
    postHospitalizationDays: number;
  };
}

interface PlanUsage {
  opdUsed: number;
  opdLimit: number;
  diagnosticsUsed: number;
  diagnosticsLimit: number;
  amountUsed: number;
  amountLimit: number;
}

interface HealthCheckup {
  id: string;
  name: string;
  description: string;
  tests: string[];
  duration: string;
  fasting: boolean;
  price: number;
  discountedPrice?: number;
  category: 'Basic' | 'Comprehensive' | 'Advanced' | 'Specialized';
  ageGroup?: string;
  gender?: 'Male' | 'Female' | 'All';
}

interface BookingDetails {
  checkupId: string;
  preferredDate: string;
  preferredTime: string;
  location: string;
  hospital: string;
  specialInstructions?: string;
}

interface MyAppointment {
  id: string;
  appointmentId: string;
  checkupName: string;
  appointmentType: string;
  date: string;
  time: string;
  hospital: string;
  location: string;
  doctor?: string;
  status: 'scheduled' | 'completed' | 'cancelled';
  bookedOn: string;
  claimAmount: number;
}

const CorporateBenefits = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState('benefits');
  const [loading, setLoading] = useState(true);
  const [corporatePlan, setCorporatePlan] = useState<CorporatePlan | null>(null);
  const [healthCheckups, setHealthCheckups] = useState<HealthCheckup[]>([]);
  const [myAppointments, setMyAppointments] = useState<MyAppointment[]>([]);
  const [planUsage, setPlanUsage] = useState<PlanUsage | null>(null);
  const [selectedCheckup, setSelectedCheckup] = useState<HealthCheckup | null>(null);
  const [bookingDialog, setBookingDialog] = useState(false);
  const [bookingDetails, setBookingDetails] = useState<BookingDetails>({
    checkupId: '',
    preferredDate: '',
    preferredTime: '',
    location: '',
    hospital: '',
    specialInstructions: ''
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      const [planRes, checkupsRes, appointmentsRes] = await Promise.all([
        api.get('/corporate/my-benefits').catch(() => ({ data: null })),
        api.get('/corporate/health-checkups').catch(() => ({ data: null })),
        api.get('/corporate/my-appointments').catch(() => ({ data: null }))
      ]);

      const planPayload = planRes?.data?.plan || planRes?.data?.data?.plan || planRes?.data || null;
      const usagePayload = planRes?.data?.usage || planRes?.data?.data?.usage || null;
      setCorporatePlan(planPayload || generateSamplePlan());
      setPlanUsage(usagePayload);

      const checkupsPayload = checkupsRes?.data?.checkups || checkupsRes?.data?.data?.checkups;
      setHealthCheckups(checkupsPayload || generateSampleCheckups());

      const appointmentsPayload = appointmentsRes?.data?.appointments || appointmentsRes?.data?.data?.appointments;
      setMyAppointments(appointmentsPayload || generateSampleAppointments());
    } catch (err) {
      console.error('Failed to load data', err);
      setCorporatePlan(generateSamplePlan());
      setHealthCheckups(generateSampleCheckups());
      setMyAppointments(generateSampleAppointments());
    } finally {
      setLoading(false);
    }
  };

  const generateSamplePlan = (): CorporatePlan => ({
    id: 'plan1',
    planName: 'Corporate Wellness Plan',
    corporateName: currentUser?.corporateName || 'Your Company',
    validFrom: '2024-01-01',
    validTo: '2024-12-31',
    planType: 'Premium',
    benefits: [
      {
        category: 'OPD Coverage',
        description: 'Outpatient consultations and diagnostics',
        coverage: '₹50,000 per year',
        limit: '₹1,000 per visit'
      },
      {
        category: 'IPD Coverage',
        description: 'Hospitalization and surgery expenses',
        coverage: '₹5,00,000 per year',
        limit: 'Room rent: ₹5,000/day'
      },
      {
        category: 'Annual Health Checkup',
        description: 'Comprehensive health screening',
        coverage: '₹5,000 per year',
        limit: 'Once per year'
      },
      {
        category: 'Preventive Care',
        description: 'Vaccinations and preventive screenings',
        coverage: '₹10,000 per year',
        limit: 'As per schedule'
      },
      {
        category: 'Pharmacy',
        description: 'Prescribed medicines',
        coverage: '₹25,000 per year',
        limit: '80% reimbursement'
      },
      {
        category: 'Diagnostics',
        description: 'Lab tests and imaging',
        coverage: '₹30,000 per year',
        limit: 'As prescribed'
      },
      {
        category: 'Mental Health',
        description: 'Counseling and therapy sessions',
        coverage: '₹20,000 per year',
        limit: '10 sessions/year'
      },
      {
        category: 'Wellness Programs',
        description: 'Fitness and wellness activities',
        coverage: '₹15,000 per year',
        limit: 'Gym, yoga, etc.'
      }
    ],
    features: {
      opdCoverage: true,
      ipdCoverage: true,
      maternityCoverage: true,
      dentalCoverage: true,
      pharmacyCoverage: true,
      diagnosticsCoverage: true,
      homecareCoverage: true,
      ambulanceCoverage: true,
      wellnessCoverage: true,
      mentalHealthCoverage: true
    },
    coverage: {
      sumInsured: 500000,
      roomRentLimit: 5000,
      icuRentLimit: 8000,
      preHospitalizationDays: 60,
      postHospitalizationDays: 90
    }
  });

  const generateSampleCheckups = (): HealthCheckup[] => [
    {
      id: 'chk1',
      name: 'Basic Health Checkup',
      description: 'Essential health screening with basic tests',
      tests: ['CBC', 'Blood Sugar', 'Lipid Profile', 'Kidney Function', 'Liver Function', 'Thyroid', 'Blood Pressure', 'BMI'],
      duration: '2-3 hours',
      fasting: true,
      price: 2500,
      discountedPrice: 500,
      category: 'Basic',
      ageGroup: '18-60 years',
      gender: 'All'
    },
    {
      id: 'chk2',
      name: 'Comprehensive Health Checkup',
      description: 'Detailed health assessment with advanced tests',
      tests: ['CBC', 'Blood Sugar (Fasting & PP)', 'HbA1c', 'Lipid Profile', 'Kidney Function', 'Liver Function', 'Thyroid Profile', 'Vitamin D', 'Vitamin B12', 'ECG', 'Chest X-Ray', 'USG Abdomen', 'Blood Pressure', 'BMI'],
      duration: '4-5 hours',
      fasting: true,
      price: 5000,
      discountedPrice: 1000,
      category: 'Comprehensive',
      ageGroup: '30-70 years',
      gender: 'All'
    },
    {
      id: 'chk3',
      name: 'Cardiac Health Checkup',
      description: 'Specialized heart health assessment',
      tests: ['ECG', '2D Echo', 'Treadmill Test', 'Lipid Profile', 'hs-CRP', 'Homocysteine', 'Blood Pressure Monitoring', 'Cardiac Enzyme Panel'],
      duration: '3-4 hours',
      fasting: true,
      price: 6500,
      discountedPrice: 2000,
      category: 'Specialized',
      ageGroup: '35+ years',
      gender: 'All'
    },
    {
      id: 'chk4',
      name: 'Diabetes Screening',
      description: 'Complete diabetes assessment and management',
      tests: ['Fasting Blood Sugar', 'PP Blood Sugar', 'HbA1c', 'Insulin Levels', 'Kidney Function', 'Lipid Profile', 'Microalbuminuria', 'Retinal Screening'],
      duration: '2-3 hours',
      fasting: true,
      price: 3500,
      discountedPrice: 800,
      category: 'Specialized',
      ageGroup: '25+ years',
      gender: 'All'
    },
    {
      id: 'chk5',
      name: 'Women\'s Wellness Package',
      description: 'Comprehensive health checkup for women',
      tests: ['CBC', 'Blood Sugar', 'Thyroid Profile', 'Vitamin D', 'Iron Studies', 'Calcium', 'Pap Smear', 'Mammography', 'Bone Density', 'Hormonal Profile', 'USG Pelvis'],
      duration: '4-5 hours',
      fasting: true,
      price: 7000,
      discountedPrice: 1500,
      category: 'Comprehensive',
      ageGroup: '25-65 years',
      gender: 'Female'
    },
    {
      id: 'chk6',
      name: 'Men\'s Health Package',
      description: 'Complete health screening for men',
      tests: ['CBC', 'Blood Sugar', 'Lipid Profile', 'Liver Function', 'Kidney Function', 'Thyroid', 'PSA', 'Testosterone', 'Vitamin D', 'ECG', 'Stress Test'],
      duration: '3-4 hours',
      fasting: true,
      price: 6000,
      discountedPrice: 1200,
      category: 'Comprehensive',
      ageGroup: '30-70 years',
      gender: 'Male'
    },
    {
      id: 'chk7',
      name: 'Senior Citizen Checkup',
      description: 'Specialized health screening for elderly',
      tests: ['CBC', 'Blood Sugar', 'HbA1c', 'Lipid Profile', 'Kidney Function', 'Liver Function', 'Thyroid', 'Vitamin D', 'Vitamin B12', 'ECG', '2D Echo', 'Chest X-Ray', 'Bone Density', 'Cognitive Assessment'],
      duration: '5-6 hours',
      fasting: true,
      price: 8500,
      discountedPrice: 2000,
      category: 'Advanced',
      ageGroup: '60+ years',
      gender: 'All'
    }
  ];

  const generateSampleAppointments = (): MyAppointment[] => [
    {
      id: 'apt1',
      appointmentId: 'CHK2024001',
      checkupName: 'Basic Health Checkup',
      appointmentType: 'Annual Health Checkup',
      date: '2024-11-28',
      time: '8:00 AM',
      hospital: 'Apollo Hospital',
      location: 'Banjara Hills, Hyderabad',
      doctor: 'Dr. Sharma',
      status: 'scheduled',
      bookedOn: '2024-11-20',
      claimAmount: 2000
    }
  ];

  const handleBookCheckup = (checkup: HealthCheckup) => {
    setSelectedCheckup(checkup);
    setBookingDetails({
      ...bookingDetails,
      checkupId: checkup.id
    });
    setBookingDialog(true);
  };

  const handleSubmitBooking = async () => {
    try {
      if (!selectedCheckup) return;

      const bookingData = {
        ...bookingDetails,
        checkupName: selectedCheckup.name,
        checkupPrice: selectedCheckup.discountedPrice || selectedCheckup.price,
        userId: currentUser?.id
      };

      await api.post('/corporate/book-checkup', bookingData);

      alert('Health checkup booked successfully! You will receive confirmation via email.');
      setBookingDialog(false);
      fetchData();
    } catch (err) {
      console.error('Booking failed', err);
      alert('Failed to book appointment. Please try again.');
    }
  };

  const filteredCheckups = healthCheckups.filter(checkup => {
    const matchesSearch = searchQuery === '' || 
      checkup.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      checkup.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      checkup.tests.some(test => test.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesCategory = categoryFilter === 'all' || checkup.category === categoryFilter;

    return matchesSearch && matchesCategory;
  });

  const getFeatureIcon = (feature: string) => {
    const icons: Record<string, any> = {
      opdCoverage: Stethoscope,
      ipdCoverage: Heart,
      maternityCoverage: Baby,
      dentalCoverage: Sparkles,
      pharmacyCoverage: Pill,
      diagnosticsCoverage: TestTube,
      homecareCoverage: Home,
      ambulanceCoverage: Ambulance,
      wellnessCoverage: Activity,
      mentalHealthCoverage: Brain
    };
    return icons[feature] || CheckCircle;
  };

  const getFeatureLabel = (feature: string) => {
    const labels: Record<string, string> = {
      opdCoverage: 'OPD Coverage',
      ipdCoverage: 'IPD Coverage',
      maternityCoverage: 'Maternity Coverage',
      dentalCoverage: 'Dental Coverage',
      pharmacyCoverage: 'Pharmacy Coverage',
      diagnosticsCoverage: 'Diagnostics Coverage',
      homecareCoverage: 'Homecare Coverage',
      ambulanceCoverage: 'Ambulance Coverage',
      wellnessCoverage: 'Wellness Coverage',
      mentalHealthCoverage: 'Mental Health Coverage'
    };
    return labels[feature] || feature;
  };

  if (loading) {
    return (
      <CorporateLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-t-blue-600 border-gray-300 rounded-full animate-spin mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading your benefits...</p>
          </div>
        </div>
      </CorporateLayout>
    );
  }

  return (
    <CorporateLayout>
      <div className="min-h-screen bg-gray-50/50">
        <div className="container mx-auto p-6">
          <CorporatePageHeader
            icon={Gift}
            title="Corporate Benefits"
            description="View your benefits, book health checkups, and manage appointments"
            gradient="from-emerald-600 to-emerald-800"
            badge={corporatePlan ? { text: corporatePlan.corporateName, variant: "emerald" } : undefined}
            stats={[
              { label: 'Plan Type', value: corporatePlan?.planType || 'Premium' },
              { label: 'Sum Insured', value: `₹${(corporatePlan?.coverage.sumInsured || 500000).toLocaleString()}` },
              { label: 'OPD Used', value: `₹${planUsage.opdUsed.toLocaleString()}/${planUsage.opdLimit.toLocaleString()}` },
              { label: 'Valid Till', value: corporatePlan?.validTo ? new Date(corporatePlan.validTo).toLocaleDateString() : 'Dec 2024' },
            ]}
          />

          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-grid">
              <TabsTrigger value="benefits">
                <Shield className="w-4 h-4 mr-2" />
                My Benefits
              </TabsTrigger>
              <TabsTrigger value="checkups">
                <CalendarCheck className="w-4 h-4 mr-2" />
                Health Checkups
              </TabsTrigger>
              <TabsTrigger value="appointments">
                <Calendar className="w-4 h-4 mr-2" />
                My Appointments
              </TabsTrigger>
            </TabsList>

            {/* Benefits Tab */}
            <TabsContent value="benefits" className="space-y-6">
              {corporatePlan && (
                <>
                  {/* Plan Overview Card */}
                  <Card className="border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-white">
                    <CardHeader>
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle className="text-2xl">{corporatePlan.planName}</CardTitle>
                          <p className="text-sm text-gray-600 mt-1">
                            Valid: {new Date(corporatePlan.validFrom).toLocaleDateString()} - {new Date(corporatePlan.validTo).toLocaleDateString()}
                          </p>
                        </div>
                        <Badge className="bg-blue-500 text-white px-4 py-1">
                          {corporatePlan.planType}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="text-center p-4 bg-white rounded-lg border border-blue-200">
                          <p className="text-sm text-gray-600">Sum Insured</p>
                          <p className="text-2xl font-bold text-blue-600">₹{((corporatePlan.coverage?.sumInsured ?? 500000) / 100000).toFixed(1)}L</p>
                        </div>
                        <div className="text-center p-4 bg-white rounded-lg border border-blue-200">
                          <p className="text-sm text-gray-600">Room Rent</p>
                          <p className="text-2xl font-bold text-blue-600">₹{(corporatePlan.coverage?.roomRentLimit ?? 5000).toLocaleString()}/day</p>
                        </div>
                        <div className="text-center p-4 bg-white rounded-lg border border-blue-200">
                          <p className="text-sm text-gray-600">Pre-Hospitalization</p>
                          <p className="text-2xl font-bold text-blue-600">{corporatePlan.coverage?.preHospitalizationDays ?? 60} days</p>
                        </div>
                        <div className="text-center p-4 bg-white rounded-lg border border-blue-200">
                          <p className="text-sm text-gray-600">Post-Hospitalization</p>
                          <p className="text-2xl font-bold text-blue-600">{corporatePlan.coverage?.postHospitalizationDays ?? 90} days</p>
                        </div>
                      </div>
                  </CardContent>
                </Card>

                  {planUsage && (
                    <Card>
                      <CardHeader>
                        <CardTitle>Benefit Utilization</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="p-4 bg-white rounded-lg border border-gray-200">
                            <p className="text-sm text-gray-600">OPD Visits</p>
                            <p className="text-2xl font-bold text-blue-600">
                              {planUsage.opdUsed}/{planUsage.opdLimit}
                            </p>
                          </div>
                          <div className="p-4 bg-white rounded-lg border border-gray-200">
                            <p className="text-sm text-gray-600">Diagnostics</p>
                            <p className="text-2xl font-bold text-blue-600">
                              {planUsage.diagnosticsUsed}/{planUsage.diagnosticsLimit}
                            </p>
                          </div>
                          <div className="p-4 bg-white rounded-lg border border-gray-200">
                            <p className="text-sm text-gray-600">Claims (₹)</p>
                            <p className="text-2xl font-bold text-blue-600">
                              {planUsage.amountUsed.toLocaleString()} / {planUsage.amountLimit.toLocaleString()}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Features */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Coverage Features</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        {Object.entries(corporatePlan.features || {}).map(([key, enabled]) => {
                          const Icon = getFeatureIcon(key);
                          return enabled ? (
                            <div key={key} className="flex items-center gap-2 p-3 bg-green-50 rounded-lg border border-green-200">
                              <Icon className="w-5 h-5 text-green-600" />
                              <span className="text-sm font-medium text-gray-700">{getFeatureLabel(key)}</span>
                            </div>
                          ) : null;
                        })}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Benefits List */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Benefit Details</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {(corporatePlan.benefits || []).map((benefit, idx) => (
                          <div key={idx} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <h3 className="font-semibold text-gray-900">{benefit.category}</h3>
                                <p className="text-sm text-gray-600 mt-1">{benefit.description}</p>
                              </div>
                              <div className="text-right ml-4">
                                <p className="font-bold text-blue-600">{benefit.coverage}</p>
                                {benefit.limit && (
                                  <p className="text-xs text-gray-500 mt-1">{benefit.limit}</p>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </TabsContent>

            {/* Health Checkups Tab */}
            <TabsContent value="checkups" className="space-y-4">
              {/* Filters */}
              <Card className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search health checkups..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="all">All Categories</option>
                    <option value="Basic">Basic</option>
                    <option value="Comprehensive">Comprehensive</option>
                    <option value="Advanced">Advanced</option>
                    <option value="Specialized">Specialized</option>
                  </select>
                </div>
              </Card>

              {/* Checkups Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {filteredCheckups.map(checkup => (
                  <Card key={checkup.id} className="hover:shadow-lg transition-shadow">
                    <CardHeader>
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle className="text-xl">{checkup.name}</CardTitle>
                          <p className="text-sm text-gray-600 mt-1">{checkup.description}</p>
                        </div>
                        <Badge className="bg-purple-500/10 text-purple-700 border-purple-500/20 border">
                          {checkup.category}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-gray-500" />
                          <span>{checkup.duration}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <TestTube className="w-4 h-4 text-gray-500" />
                          <span>{checkup.tests.length} tests</span>
                        </div>
                        {checkup.ageGroup && (
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-gray-500" />
                            <span>{checkup.ageGroup}</span>
                          </div>
                        )}
                        {checkup.fasting && (
                          <div className="flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 text-orange-500" />
                            <span className="text-orange-600">Fasting required</span>
                          </div>
                        )}
                      </div>

                      <div className="bg-gray-50 p-3 rounded-lg">
                        <p className="text-xs text-gray-600 mb-2">Tests Included:</p>
                        <div className="flex flex-wrap gap-1">
                          {checkup.tests.slice(0, 6).map((test, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {test}
                            </Badge>
                          ))}
                          {checkup.tests.length > 6 && (
                            <Badge variant="outline" className="text-xs">
                              +{checkup.tests.length - 6} more
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div className="flex justify-between items-center pt-3 border-t">
                        <div>
                          {checkup.discountedPrice ? (
                            <div>
                              <p className="text-sm text-gray-500 line-through">₹{checkup.price}</p>
                              <p className="text-2xl font-bold text-green-600 flex items-center">
                                <IndianRupee className="w-5 h-5" />
                                {checkup.discountedPrice}
                              </p>
                              <p className="text-xs text-green-600">Corporate benefit applied</p>
                            </div>
                          ) : (
                            <p className="text-2xl font-bold text-gray-900 flex items-center">
                              <IndianRupee className="w-5 h-5" />
                              {checkup.price}
                            </p>
                          )}
                        </div>
                        <Button onClick={() => handleBookCheckup(checkup)}>
                          <Plus className="w-4 h-4 mr-2" />
                          Book Now
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            {/* My Appointments Tab */}
            <TabsContent value="appointments" className="space-y-4">
              {myAppointments.length > 0 ? (
                <div className="grid grid-cols-1 gap-4">
                  {myAppointments.map(appointment => (
                    <Card key={appointment.id} className="hover:shadow-lg transition-shadow">
                      <CardContent className="p-6">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-3">
                              <Badge className={
                                appointment.status === 'scheduled' ? 'bg-blue-500/10 text-blue-700 border-blue-500/20 border' :
                                appointment.status === 'completed' ? 'bg-green-500/10 text-green-700 border-green-500/20 border' :
                                'bg-gray-500/10 text-gray-700 border-gray-500/20 border'
                              }>
                                {appointment.status.toUpperCase()}
                              </Badge>
                              <span className="text-sm text-gray-600">#{appointment.appointmentId}</span>
                            </div>

                            <h3 className="text-xl font-semibold mb-2">{appointment.checkupName}</h3>

                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                              <div>
                                <p className="text-gray-600">Date & Time</p>
                                <p className="font-medium flex items-center gap-1">
                                  <Calendar className="w-4 h-4" />
                                  {new Date(appointment.date).toLocaleDateString()}
                                </p>
                                <p className="font-medium flex items-center gap-1 ml-5">
                                  <Clock className="w-4 h-4" />
                                  {appointment.time}
                                </p>
                              </div>

                              <div>
                                <p className="text-gray-600">Hospital</p>
                                <p className="font-medium">{appointment.hospital}</p>
                                <p className="text-xs text-gray-500 flex items-center gap-1">
                                  <MapPin className="w-3 h-3" />
                                  {appointment.location}
                                </p>
                              </div>

                              {appointment.doctor && (
                                <div>
                                  <p className="text-gray-600">Doctor</p>
                                  <p className="font-medium flex items-center gap-1">
                                    <Stethoscope className="w-4 h-4" />
                                    {appointment.doctor}
                                  </p>
                                </div>
                              )}
                            </div>

                            <div className="flex items-center justify-between mt-4 pt-4 border-t">
                              <div>
                                <p className="text-sm text-gray-600">Claim Amount</p>
                                <p className="text-lg font-bold text-green-600">₹{appointment.claimAmount.toLocaleString()}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-xs text-gray-600">Booked on</p>
                                <p className="text-sm font-medium">{new Date(appointment.bookedOn).toLocaleDateString()}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card className="p-8 text-center">
                  <CalendarCheck className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                  <p className="text-gray-600">No appointments booked yet</p>
                  <Button className="mt-4" onClick={() => setActiveTab('checkups')}>
                    <Plus className="w-4 h-4 mr-2" />
                    Book Health Checkup
                  </Button>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Booking Dialog */}
      <Dialog open={bookingDialog} onOpenChange={setBookingDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Book Health Checkup</DialogTitle>
          </DialogHeader>
          {selectedCheckup && (
            <div className="space-y-4">
              <div className="p-4 bg-blue-50 rounded-lg">
                <h3 className="font-semibold text-lg">{selectedCheckup.name}</h3>
                <p className="text-sm text-gray-600 mt-1">{selectedCheckup.description}</p>
                <div className="flex items-center gap-4 mt-3">
                  <Badge className="bg-purple-500/10 text-purple-700 border-purple-500/20 border">
                    {selectedCheckup.category}
                  </Badge>
                  <span className="text-sm">Duration: {selectedCheckup.duration}</span>
                  <span className="text-sm font-bold text-green-600">
                    ₹{selectedCheckup.discountedPrice || selectedCheckup.price}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Preferred Date</label>
                  <input
                    type="date"
                    value={bookingDetails.preferredDate}
                    onChange={(e) => setBookingDetails({...bookingDetails, preferredDate: e.target.value})}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Preferred Time</label>
                  <select
                    value={bookingDetails.preferredTime}
                    onChange={(e) => setBookingDetails({...bookingDetails, preferredTime: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select time</option>
                    <option value="8:00 AM">8:00 AM</option>
                    <option value="9:00 AM">9:00 AM</option>
                    <option value="10:00 AM">10:00 AM</option>
                    <option value="11:00 AM">11:00 AM</option>
                    <option value="2:00 PM">2:00 PM</option>
                    <option value="3:00 PM">3:00 PM</option>
                    <option value="4:00 PM">4:00 PM</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Hospital</label>
                  <select
                    value={bookingDetails.hospital}
                    onChange={(e) => setBookingDetails({...bookingDetails, hospital: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select hospital</option>
                    <option value="Apollo Hospital">Apollo Hospital</option>
                    <option value="Fortis Hospital">Fortis Hospital</option>
                    <option value="Max Healthcare">Max Healthcare</option>
                    <option value="Medanta Hospital">Medanta Hospital</option>
                    <option value="KIMS Hospital">KIMS Hospital</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Location</label>
                  <input
                    type="text"
                    value={bookingDetails.location}
                    onChange={(e) => setBookingDetails({...bookingDetails, location: e.target.value})}
                    placeholder="Enter location/area"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Special Instructions (Optional)</label>
                <textarea
                  value={bookingDetails.specialInstructions}
                  onChange={(e) => setBookingDetails({...bookingDetails, specialInstructions: e.target.value})}
                  placeholder="Any specific requirements or medical conditions to note..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {selectedCheckup.fasting && (
                <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-orange-800">Fasting Required</p>
                    <p className="text-orange-700">Please ensure 8-12 hours of fasting before the checkup</p>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button variant="outline" onClick={() => setBookingDialog(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleSubmitBooking}
                  disabled={!bookingDetails.preferredDate || !bookingDetails.preferredTime || !bookingDetails.hospital}
                >
                  Confirm Booking
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </CorporateLayout>
  );
};

export default CorporateBenefits;
