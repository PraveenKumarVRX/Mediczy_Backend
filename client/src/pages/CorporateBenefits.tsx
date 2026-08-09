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
    benefitCategory: 'insurance' | 'wellness';
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
    roomRent: string | null;
    icuRent: string | null;
    preHospitalization: string | null;
    postHospitalization: string | null;
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
  const [viewMode, setViewMode] = useState<'company' | 'personal'>('personal');
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

      const planPayload = planRes?.data?.plan || planRes?.data?.data?.plan || null;
      const usagePayload = planRes?.data?.usage || planRes?.data?.data?.usage || null;
      setCorporatePlan(planPayload);
      setPlanUsage(usagePayload);
      setViewMode(planRes?.data?.data?.viewMode === 'company' ? 'company' : 'personal');

      const checkupsPayload = checkupsRes?.data?.checkups || checkupsRes?.data?.data?.checkups;
      setHealthCheckups(checkupsPayload || generateSampleCheckups());

      const appointmentsPayload = appointmentsRes?.data?.appointments || appointmentsRes?.data?.data?.appointments;
      setMyAppointments(appointmentsPayload || []);
    } catch (err) {
      console.error('Failed to load data', err);
      setCorporatePlan(null);
      setHealthCheckups(generateSampleCheckups());
      setMyAppointments([]);
    } finally {
      setLoading(false);
    }
  };

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

      const bookingLocation = bookingDetails.location || bookingDetails.hospital;
      const bookingData = {
        ...bookingDetails,
        location: bookingLocation,
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
            <p className="mt-4 text-slate-400">Loading your benefits...</p>
          </div>
        </div>
      </CorporateLayout>
    );
  }

  return (
    <CorporateLayout>
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 p-4 sm:p-6 space-y-6">
          <CorporatePageHeader
            icon={Gift}
            title="Corporate Benefits"
            description="View your benefits, book health checkups, and manage appointments"
            gradient="from-emerald-600 to-emerald-800"
            badge={corporatePlan ? { text: corporatePlan.corporateName, variant: "emerald" } : undefined}
            stats={corporatePlan ? [
              { label: 'Plan Type', value: corporatePlan.planType },
              { label: 'Sum Insured', value: corporatePlan.coverage.sumInsured ? `₹${corporatePlan.coverage.sumInsured.toLocaleString()}` : '—' },
              ...(planUsage ? [{ label: 'OPD Used', value: `${planUsage.opdUsed}/${planUsage.opdLimit}` }] : []),
              { label: 'Valid Till', value: corporatePlan.validTo ? new Date(corporatePlan.validTo).toLocaleDateString() : '—' },
            ] : []}
          />

          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6 max-w-7xl mx-auto">
            <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-grid bg-slate-800/60 border border-slate-700/60">
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
                  {/* Plan identity strip — no insurance-style claims here, just what plan this is */}
                  <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600/20 via-slate-900 to-slate-950 border border-emerald-500/25 shadow-xl shadow-slate-950/40">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
                    <div className="relative p-6">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-lg shadow-emerald-500/30">
                            <Shield className="w-5 h-5 text-white" />
                          </div>
                          <div>
                            <h2 className="text-xl font-bold text-white">{corporatePlan.planName}</h2>
                            <p className="text-sm text-slate-400 mt-0.5">
                              Valid: {new Date(corporatePlan.validFrom).toLocaleDateString()} — {new Date(corporatePlan.validTo).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-3 py-1 font-semibold">
                          {corporatePlan.planType}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {/* Insurance Coverage — only shown when hospitalization/IPD is genuinely active on this plan */}
                  {corporatePlan.features?.ipdCoverage && (
                    <Card className="bg-blue-950/20 border-blue-500/25">
                      <CardHeader>
                        <CardTitle className="text-slate-100 flex items-center gap-2">
                          <Shield className="w-5 h-5 text-blue-400" />
                          Insurance Coverage (Hospitalization)
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div className="text-center p-4 bg-slate-800/60 rounded-xl border border-slate-700/40">
                            <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Sum Insured</p>
                            <p className="text-2xl font-bold text-blue-400">
                              {corporatePlan.coverage?.sumInsured ? `₹${corporatePlan.coverage.sumInsured.toLocaleString()}` : '—'}
                            </p>
                          </div>
                          <div className="text-center p-4 bg-slate-800/60 rounded-xl border border-slate-700/40">
                            <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Room Rent</p>
                            <p className="text-2xl font-bold text-blue-400">{corporatePlan.coverage?.roomRent || '—'}</p>
                          </div>
                          <div className="text-center p-4 bg-slate-800/60 rounded-xl border border-slate-700/40">
                            <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Pre-Hospitalization</p>
                            <p className="text-2xl font-bold text-blue-400">{corporatePlan.coverage?.preHospitalization || '—'}</p>
                          </div>
                          <div className="text-center p-4 bg-slate-800/60 rounded-xl border border-slate-700/40">
                            <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Post-Hospitalization</p>
                            <p className="text-2xl font-bold text-blue-400">{corporatePlan.coverage?.postHospitalization || '—'}</p>
                          </div>
                        </div>
                        <div className="mt-4 space-y-3">
                          {(corporatePlan.benefits || []).filter((b) => b.benefitCategory === 'insurance').map((benefit, idx) => (
                            <div key={idx} className="p-4 bg-slate-800/50 rounded-lg border border-slate-700/50">
                              <div className="flex justify-between items-start">
                                <div className="flex-1">
                                  <h3 className="font-semibold text-slate-100">{benefit.category}</h3>
                                  <p className="text-sm text-slate-400 mt-1">{benefit.description}</p>
                                </div>
                                <div className="text-right ml-4">
                                  <p className="font-bold text-blue-400">{benefit.coverage}</p>
                                  {benefit.limit && <p className="text-xs text-slate-500 mt-1">{benefit.limit}</p>}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                  {!corporatePlan.features?.ipdCoverage && (
                    <Card className="bg-slate-900/40 border-slate-700/40">
                      <CardContent className="py-6 flex items-center gap-3 text-sm text-slate-400">
                        <Shield className="w-5 h-5 text-slate-600 flex-shrink-0" />
                        <span>This plan does not include hospitalization/IPD insurance coverage. Benefits below are employer-funded wellness and OPD reimbursements, not insurance.</span>
                      </CardContent>
                    </Card>
                  )}

                  {planUsage && (
                    <Card className="bg-slate-900/50 border-slate-700/50">
                      <CardHeader>
                        <CardTitle className="text-slate-100">Benefit Utilization</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="p-4 bg-slate-800/60 rounded-xl border border-slate-700/40">
                            <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">OPD Visits</p>
                            <p className="text-2xl font-bold text-white">
                              {planUsage.opdUsed}<span className="text-slate-400 font-normal">/{planUsage.opdLimit}</span>
                            </p>
                            <div className="mt-2 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                              <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${planUsage.opdLimit ? Math.min(100, (planUsage.opdUsed / planUsage.opdLimit) * 100) : 0}%` }} />
                            </div>
                          </div>
                          <div className="p-4 bg-slate-800/60 rounded-xl border border-slate-700/40">
                            <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Diagnostics</p>
                            <p className="text-2xl font-bold text-white">
                              {planUsage.diagnosticsUsed}<span className="text-slate-400 font-normal">/{planUsage.diagnosticsLimit}</span>
                            </p>
                            <div className="mt-2 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                              <div className="h-full bg-blue-400 rounded-full" style={{ width: `${planUsage.diagnosticsLimit ? Math.min(100, (planUsage.diagnosticsUsed / planUsage.diagnosticsLimit) * 100) : 0}%` }} />
                            </div>
                          </div>
                          <div className="p-4 bg-slate-800/60 rounded-xl border border-slate-700/40">
                            <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Claims (₹)</p>
                            <p className="text-2xl font-bold text-white">
                              ₹{planUsage.amountUsed.toLocaleString()}<span className="text-slate-400 font-normal text-sm"> / ₹{planUsage.amountLimit.toLocaleString()}</span>
                            </p>
                            <div className="mt-2 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                              <div className="h-full bg-amber-400 rounded-full" style={{ width: `${planUsage.amountLimit ? Math.min(100, (planUsage.amountUsed / planUsage.amountLimit) * 100) : 0}%` }} />
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Features */}
                  <Card className="bg-slate-900/50 border-slate-700/50">
                    <CardHeader>
                      <CardTitle className="text-slate-100">Coverage Features</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        {Object.entries(corporatePlan.features || {}).map(([key, enabled]) => {
                          const Icon = getFeatureIcon(key);
                          return enabled ? (
                            <div key={key} className="flex items-center gap-2 p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                              <Icon className="w-5 h-5 text-emerald-400" />
                              <span className="text-sm font-medium text-emerald-300">{getFeatureLabel(key)}</span>
                            </div>
                          ) : null;
                        })}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Wellness & OPD Benefits — employer-funded, no insurer or policy behind these */}
                  <Card className="bg-emerald-950/10 border-emerald-500/20">
                    <CardHeader>
                      <CardTitle className="text-slate-100 flex items-center gap-2">
                        <Heart className="w-5 h-5 text-emerald-400" />
                        Wellness &amp; OPD Benefits
                      </CardTitle>
                      <p className="text-sm text-slate-500">Employer-funded reimbursements — not insurance coverage.</p>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {(corporatePlan.benefits || []).filter((b) => b.benefitCategory !== 'insurance').map((benefit, idx) => (
                          <div key={idx} className="p-4 bg-slate-800/50 rounded-lg border border-slate-700/50">
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <h3 className="font-semibold text-slate-100">{benefit.category}</h3>
                                <p className="text-sm text-slate-400 mt-1">{benefit.description}</p>
                              </div>
                              <div className="text-right ml-4">
                                <p className="font-bold text-emerald-400">{benefit.coverage}</p>
                                {benefit.limit && (
                                  <p className="text-xs text-slate-500 mt-1">{benefit.limit}</p>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                        {(corporatePlan.benefits || []).filter((b) => b.benefitCategory !== 'insurance').length === 0 && (
                          <p className="text-sm text-slate-500 text-center py-6">No wellness/OPD benefits configured on this plan.</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
              {!corporatePlan && (
                <Card className="bg-slate-900/50 border-slate-700/50">
                  <CardContent className="py-12 text-center">
                    <Shield className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                    <p className="text-slate-300 font-medium">No active plan on record</p>
                    <p className="text-sm text-slate-500 mt-1">
                      {viewMode === 'company'
                        ? 'This company has no active corporate plan configured yet.'
                        : 'Contact your HR team to get enrolled in a corporate health plan.'}
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Health Checkups Tab */}
            <TabsContent value="checkups" className="space-y-4">
              {/* Filters */}
              <Card className="p-4 bg-slate-900/50 border-slate-700/50">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Search health checkups..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-slate-800/60 border border-slate-700/60 rounded-lg text-slate-200 placeholder:text-slate-500 focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    />
                  </div>

                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="px-4 py-2 bg-slate-800/60 border border-slate-700/60 rounded-lg text-slate-200 focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
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
                  <Card key={checkup.id} className="bg-slate-900/50 border-slate-700/50 hover:border-slate-600/60 hover:shadow-lg hover:shadow-slate-950/50 transition-all">
                    <CardHeader>
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle className="text-xl text-slate-100">{checkup.name}</CardTitle>
                          <p className="text-sm text-slate-400 mt-1">{checkup.description}</p>
                        </div>
                        <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30 border">
                          {checkup.category}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-slate-500" />
                          <span className="text-slate-300">{checkup.duration}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <TestTube className="w-4 h-4 text-slate-500" />
                          <span className="text-slate-300">{checkup.tests.length} tests</span>
                        </div>
                        {checkup.ageGroup && (
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-slate-500" />
                            <span className="text-slate-300">{checkup.ageGroup}</span>
                          </div>
                        )}
                        {checkup.fasting && (
                          <div className="flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 text-orange-400" />
                            <span className="text-orange-400">Fasting required</span>
                          </div>
                        )}
                      </div>

                      <div className="bg-slate-800/50 p-3 rounded-lg">
                        <p className="text-xs text-slate-400 mb-2">Tests Included:</p>
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
                              <p className="text-sm text-slate-500 line-through">₹{checkup.price}</p>
                              <p className="text-2xl font-bold text-emerald-400 flex items-center">
                                <IndianRupee className="w-5 h-5" />
                                {checkup.discountedPrice}
                              </p>
                              <p className="text-xs text-emerald-500">Corporate benefit applied</p>
                            </div>
                          ) : (
                            <p className="text-2xl font-bold text-slate-100 flex items-center">
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
                    <Card key={appointment.id} className="bg-slate-900/50 border-slate-700/50 hover:border-slate-600/60 hover:shadow-lg transition-all">
                      <CardContent className="p-6">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-3">
                              <Badge className={
                                appointment.status === 'scheduled' ? 'bg-blue-500/20 text-blue-300 border-blue-500/30 border' :
                                appointment.status === 'completed' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30 border' :
                                'bg-slate-700/60 text-slate-300 border-slate-600/50 border'
                              }>
                                {(appointment.status || 'scheduled').toUpperCase()}
                              </Badge>
                              <span className="text-sm text-slate-400">#{appointment.appointmentId}</span>
                            </div>

                            <h3 className="text-xl font-semibold text-slate-100 mb-2">{appointment.checkupName}</h3>

                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                              <div>
                                <p className="text-slate-400">Date & Time</p>
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
                                <p className="text-slate-400">Hospital</p>
                                <p className="font-medium text-slate-200">{appointment.hospital}</p>
                                <p className="text-xs text-slate-500 flex items-center gap-1">
                                  <MapPin className="w-3 h-3" />
                                  {appointment.location}
                                </p>
                              </div>

                              {appointment.doctor && (
                                <div>
                                  <p className="text-slate-400">Doctor</p>
                                  <p className="font-medium flex items-center gap-1">
                                    <Stethoscope className="w-4 h-4" />
                                    {appointment.doctor}
                                  </p>
                                </div>
                              )}
                            </div>

                            <div className="flex items-center justify-between mt-4 pt-4 border-t">
                              <div>
                                <p className="text-sm text-slate-400">Claim Amount</p>
                                <p className="text-lg font-bold text-emerald-400">₹{appointment.claimAmount.toLocaleString()}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-xs text-slate-400">Booked on</p>
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
                <Card className="p-8 text-center bg-slate-900/50 border-slate-700/50">
                  <CalendarCheck className="w-12 h-12 text-slate-500 mx-auto mb-2" />
                  <p className="text-slate-400">No appointments booked yet</p>
                  <Button className="mt-4" onClick={() => setActiveTab('checkups')}>
                    <Plus className="w-4 h-4 mr-2" />
                    Book Health Checkup
                  </Button>
                </Card>
              )}
            </TabsContent>
          </Tabs>
      </div>

      {/* Booking Dialog */}
      <Dialog open={bookingDialog} onOpenChange={setBookingDialog}>
        <DialogContent className="max-w-2xl bg-slate-900 border-slate-700">
          <DialogHeader>
            <DialogTitle>Book Health Checkup</DialogTitle>
          </DialogHeader>
          {selectedCheckup && (
            <div className="space-y-4">
              <div className="p-4 bg-slate-800/60 rounded-lg border border-slate-700/50">
                <h3 className="font-semibold text-lg text-slate-100">{selectedCheckup.name}</h3>
                <p className="text-sm text-slate-400 mt-1">{selectedCheckup.description}</p>
                <div className="flex items-center gap-4 mt-3">
                  <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30 border">
                    {selectedCheckup.category}
                  </Badge>
                  <span className="text-sm text-slate-300">Duration: {selectedCheckup.duration}</span>
                  <span className="text-sm font-bold text-emerald-400">
                    ₹{selectedCheckup.discountedPrice || selectedCheckup.price}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2 text-slate-200">Preferred Date</label>
                  <input
                    type="date"
                    value={bookingDetails.preferredDate}
                    onChange={(e) => setBookingDetails({...bookingDetails, preferredDate: e.target.value})}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700/60 rounded-lg text-slate-200 focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-slate-200">Preferred Time</label>
                  <select
                    value={bookingDetails.preferredTime}
                    onChange={(e) => setBookingDetails({...bookingDetails, preferredTime: e.target.value})}
                    className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700/60 rounded-lg text-slate-200 focus:ring-2 focus:ring-emerald-500"
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
                  <label className="block text-sm font-medium mb-2 text-slate-200">Hospital</label>
                  <select
                    value={bookingDetails.hospital}
                    onChange={(e) => setBookingDetails({...bookingDetails, hospital: e.target.value})}
                    className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700/60 rounded-lg text-slate-200 focus:ring-2 focus:ring-emerald-500"
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
                  <label className="block text-sm font-medium mb-2 text-slate-200">Location</label>
                  <input
                    type="text"
                    value={bookingDetails.location}
                    onChange={(e) => setBookingDetails({...bookingDetails, location: e.target.value})}
                    placeholder="Enter location/area"
                    className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700/60 rounded-lg text-slate-200 placeholder:text-slate-500 focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-slate-200">Special Instructions (Optional)</label>
                <textarea
                  value={bookingDetails.specialInstructions}
                  onChange={(e) => setBookingDetails({...bookingDetails, specialInstructions: e.target.value})}
                  placeholder="Any specific requirements or medical conditions to note..."
                  rows={3}
                  className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700/60 rounded-lg text-slate-200 placeholder:text-slate-500 focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {selectedCheckup.fasting && (
                <div className="p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-orange-300">Fasting Required</p>
                    <p className="text-orange-400">Please ensure 8-12 hours of fasting before the checkup</p>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button variant="outline" onClick={() => setBookingDialog(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleSubmitBooking}
                  disabled={
                    !bookingDetails.preferredDate ||
                    !bookingDetails.preferredTime ||
                    (!bookingDetails.hospital && !bookingDetails.location)
                  }
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
