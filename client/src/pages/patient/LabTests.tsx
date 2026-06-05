import { useState, useEffect, useRef } from 'react';
import { useLabCart } from '@/hooks/patient/useLabCart';
import { useLabBookings } from '@/hooks/patient/useLabBookings';
import { useLabSearch } from '@/hooks/patient/useLabSearch';
import { motion, AnimatePresence } from 'framer-motion';
import { FlaskConical, Calendar, MapPin, Download, Plus, Search, Filter, Loader2, ShoppingCart, Trash2, X, Navigation, Building2, FlaskRound } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { InlineError } from '@/components/ui/inline-error';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import api from '@/utils/api';
import { loadRazorpayScript } from '@/utils/razorpay';
import telemetry from '@/lib/telemetry';

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.06 } } };
const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [.25,.46,.45,.94] } } };

interface LabTest {
  id: string;
  testName: string;
  testType: string;
  category: string;
  orderedBy: string;
  orderDate: string;
  status: 'pending' | 'pending_confirmation' | 'confirmed' | 'sample_collected' | 'processing' | 'completed' | 'cancelled';
  sampleCollected: boolean;
  results?: string;
  reportUrl?: string;
  estimatedDate?: string;
  hospitalId?: number;
  labName?: string;
  labAddress?: string;
  urgency?: string;
  notes?: string;
}

interface LabFromAPI {
  id: number;
  name: string;
  address: {
    city: string;
    state: string;
    street: string;
    zipCode: string;
    coordinates?: { lat: number; lng: number };
  };
  services: Array<{ name: string; category: string }>;
  rating: string;
  accreditation: string;
  facilities: string[];
}

interface CartItem {
  test: AvailableTest;
  quantity: number;
}

interface AvailableTest {
  id: string;
  name: string;
  category: string;
  description: string;
  price: string;
  preparationRequired: boolean;
  turnaroundTime: string;
}

// Comprehensive list of available lab tests
const availableTests: AvailableTest[] = [
  // Hematology
  { id: 'cbc', name: 'Complete Blood Count (CBC)', category: 'Hematology', description: 'Measures red blood cells, white blood cells, hemoglobin, and platelets', price: '₹300', preparationRequired: false, turnaroundTime: '24 hours' },
  { id: 'esr', name: 'ESR (Erythrocyte Sedimentation Rate)', category: 'Hematology', description: 'Detects inflammation in the body', price: '₹150', preparationRequired: false, turnaroundTime: '24 hours' },
  { id: 'hemoglobin', name: 'Hemoglobin Test', category: 'Hematology', description: 'Measures oxygen-carrying protein in blood', price: '₹100', preparationRequired: false, turnaroundTime: '12 hours' },
  { id: 'platelet', name: 'Platelet Count', category: 'Hematology', description: 'Counts number of platelets in blood', price: '₹150', preparationRequired: false, turnaroundTime: '24 hours' },
  
  // Biochemistry
  { id: 'lipid', name: 'Lipid Profile', category: 'Biochemistry', description: 'Cholesterol, HDL, LDL, Triglycerides', price: '₹500', preparationRequired: true, turnaroundTime: '24 hours' },
  { id: 'liver', name: 'Liver Function Test (LFT)', category: 'Biochemistry', description: 'SGOT, SGPT, Bilirubin, Albumin, ALP', price: '₹600', preparationRequired: true, turnaroundTime: '24 hours' },
  { id: 'kidney', name: 'Kidney Function Test (KFT)', category: 'Biochemistry', description: 'Creatinine, Urea, BUN, Electrolytes', price: '₹500', preparationRequired: false, turnaroundTime: '24 hours' },
  { id: 'thyroid', name: 'Thyroid Profile (T3, T4, TSH)', category: 'Biochemistry', description: 'Complete thyroid function assessment', price: '₹700', preparationRequired: false, turnaroundTime: '48 hours' },
  { id: 'electrolytes', name: 'Electrolytes Panel', category: 'Biochemistry', description: 'Sodium, Potassium, Chloride, Bicarbonate', price: '₹400', preparationRequired: false, turnaroundTime: '24 hours' },
  { id: 'calcium', name: 'Calcium Test', category: 'Biochemistry', description: 'Serum calcium levels', price: '₹200', preparationRequired: false, turnaroundTime: '24 hours' },
  { id: 'vitamin-d', name: 'Vitamin D Test', category: 'Biochemistry', description: '25-OH Vitamin D levels', price: '₹1200', preparationRequired: false, turnaroundTime: '48 hours' },
  { id: 'vitamin-b12', name: 'Vitamin B12', category: 'Biochemistry', description: 'Serum B12 levels', price: '₹800', preparationRequired: false, turnaroundTime: '48 hours' },
  { id: 'iron', name: 'Iron Studies', category: 'Biochemistry', description: 'Serum Iron, TIBC, Ferritin', price: '₹900', preparationRequired: true, turnaroundTime: '48 hours' },
  
  // Diabetes
  { id: 'fbs', name: 'Fasting Blood Sugar (FBS)', category: 'Diabetes', description: 'Blood glucose after fasting', price: '₹100', preparationRequired: true, turnaroundTime: '12 hours' },
  { id: 'ppbs', name: 'Post Prandial Blood Sugar (PPBS)', category: 'Diabetes', description: 'Blood glucose after meal', price: '₹100', preparationRequired: false, turnaroundTime: '12 hours' },
  { id: 'rbs', name: 'Random Blood Sugar (RBS)', category: 'Diabetes', description: 'Blood glucose at any time', price: '₹80', preparationRequired: false, turnaroundTime: '6 hours' },
  { id: 'hba1c', name: 'HbA1c (Glycated Hemoglobin)', category: 'Diabetes', description: 'Average blood sugar over 3 months', price: '₹600', preparationRequired: false, turnaroundTime: '24 hours' },
  { id: 'gtt', name: 'Glucose Tolerance Test (GTT)', category: 'Diabetes', description: 'Diabetes screening test', price: '₹400', preparationRequired: true, turnaroundTime: '24 hours' },
  
  // Cardiac
  { id: 'troponin', name: 'Troponin I/T', category: 'Cardiac', description: 'Heart attack marker', price: '₹1500', preparationRequired: false, turnaroundTime: '6 hours' },
  { id: 'cpk', name: 'CPK (Creatine Phosphokinase)', category: 'Cardiac', description: 'Muscle and heart enzyme', price: '₹500', preparationRequired: false, turnaroundTime: '24 hours' },
  { id: 'ldh', name: 'LDH (Lactate Dehydrogenase)', category: 'Cardiac', description: 'Tissue damage marker', price: '₹400', preparationRequired: false, turnaroundTime: '24 hours' },
  
  // Urine Tests
  { id: 'urine-routine', name: 'Urine Routine & Microscopy', category: 'Urine Analysis', description: 'Complete urine examination', price: '₹200', preparationRequired: false, turnaroundTime: '12 hours' },
  { id: 'urine-culture', name: 'Urine Culture & Sensitivity', category: 'Urine Analysis', description: 'Bacterial infection detection', price: '₹800', preparationRequired: false, turnaroundTime: '48 hours' },
  { id: 'microalbumin', name: 'Microalbumin (Urine)', category: 'Urine Analysis', description: 'Early kidney damage detection', price: '₹600', preparationRequired: false, turnaroundTime: '24 hours' },
  
  // Infectious Diseases
  { id: 'dengue', name: 'Dengue NS1 Antigen & IgG/IgM', category: 'Infectious Diseases', description: 'Dengue fever detection', price: '₹1200', preparationRequired: false, turnaroundTime: '24 hours' },
  { id: 'malaria', name: 'Malaria Antigen Test', category: 'Infectious Diseases', description: 'Malaria parasite detection', price: '₹400', preparationRequired: false, turnaroundTime: '6 hours' },
  { id: 'typhoid', name: 'Typhoid (Widal Test)', category: 'Infectious Diseases', description: 'Typhoid fever antibodies', price: '₹300', preparationRequired: false, turnaroundTime: '24 hours' },
  { id: 'hiv', name: 'HIV 1 & 2 (ELISA)', category: 'Infectious Diseases', description: 'HIV screening test', price: '₹500', preparationRequired: false, turnaroundTime: '48 hours' },
  { id: 'hbsag', name: 'HBsAg (Hepatitis B Surface Antigen)', category: 'Infectious Diseases', description: 'Hepatitis B screening', price: '₹400', preparationRequired: false, turnaroundTime: '24 hours' },
  { id: 'hcv', name: 'Anti-HCV (Hepatitis C)', category: 'Infectious Diseases', description: 'Hepatitis C antibodies', price: '₹800', preparationRequired: false, turnaroundTime: '48 hours' },
  { id: 'covid', name: 'COVID-19 RT-PCR', category: 'Infectious Diseases', description: 'COVID-19 detection', price: '₹500', preparationRequired: false, turnaroundTime: '24 hours' },
  { id: 'covid-antibody', name: 'COVID-19 Antibody (IgG)', category: 'Infectious Diseases', description: 'COVID immunity check', price: '₹600', preparationRequired: false, turnaroundTime: '24 hours' },
  
  // Hormones
  { id: 'testosterone', name: 'Testosterone (Total)', category: 'Hormones', description: 'Male hormone levels', price: '₹700', preparationRequired: false, turnaroundTime: '48 hours' },
  { id: 'prolactin', name: 'Prolactin', category: 'Hormones', description: 'Prolactin hormone levels', price: '₹600', preparationRequired: false, turnaroundTime: '48 hours' },
  { id: 'cortisol', name: 'Cortisol', category: 'Hormones', description: 'Stress hormone levels', price: '₹800', preparationRequired: false, turnaroundTime: '48 hours' },
  { id: 'pth', name: 'Parathyroid Hormone (PTH)', category: 'Hormones', description: 'Calcium regulation hormone', price: '₹1500', preparationRequired: false, turnaroundTime: '72 hours' },
  
  // Tumor Markers
  { id: 'psa', name: 'PSA (Prostate Specific Antigen)', category: 'Tumor Markers', description: 'Prostate cancer screening', price: '₹800', preparationRequired: false, turnaroundTime: '48 hours' },
  { id: 'cea', name: 'CEA (Carcinoembryonic Antigen)', category: 'Tumor Markers', description: 'Cancer marker', price: '₹1200', preparationRequired: false, turnaroundTime: '48 hours' },
  { id: 'ca125', name: 'CA 125', category: 'Tumor Markers', description: 'Ovarian cancer marker', price: '₹1200', preparationRequired: false, turnaroundTime: '48 hours' },
  { id: 'afp', name: 'AFP (Alpha Fetoprotein)', category: 'Tumor Markers', description: 'Liver cancer marker', price: '₹1000', preparationRequired: false, turnaroundTime: '48 hours' },
  
  // Allergy Tests
  { id: 'ige', name: 'Total IgE', category: 'Allergy', description: 'Allergy screening test', price: '₹600', preparationRequired: false, turnaroundTime: '48 hours' },
  { id: 'allergy-panel', name: 'Allergy Panel (Food)', category: 'Allergy', description: 'Common food allergens', price: '₹5000', preparationRequired: false, turnaroundTime: '5-7 days' },
  
  // Autoimmune
  { id: 'ana', name: 'ANA (Antinuclear Antibody)', category: 'Autoimmune', description: 'Autoimmune disease screening', price: '₹1200', preparationRequired: false, turnaroundTime: '48 hours' },
  { id: 'ra-factor', name: 'RA Factor (Rheumatoid Factor)', category: 'Autoimmune', description: 'Rheumatoid arthritis marker', price: '₹500', preparationRequired: false, turnaroundTime: '24 hours' },
  { id: 'crp', name: 'CRP (C-Reactive Protein)', category: 'Autoimmune', description: 'Inflammation marker', price: '₹400', preparationRequired: false, turnaroundTime: '24 hours' },
  
  // Stool Tests
  { id: 'stool-routine', name: 'Stool Routine & Microscopy', category: 'Stool Analysis', description: 'Digestive system examination', price: '₹200', preparationRequired: false, turnaroundTime: '24 hours' },
  { id: 'stool-culture', name: 'Stool Culture', category: 'Stool Analysis', description: 'Bacterial infection detection', price: '₹800', preparationRequired: false, turnaroundTime: '48 hours' },
  
  // Comprehensive Packages
  { id: 'basic-health', name: 'Basic Health Checkup', category: 'Health Packages', description: 'CBC, Blood Sugar, Lipid Profile, LFT, KFT', price: '₹2000', preparationRequired: true, turnaroundTime: '48 hours' },
  { id: 'diabetic-profile', name: 'Diabetic Profile', category: 'Health Packages', description: 'FBS, PPBS, HbA1c, Lipid Profile, KFT', price: '₹2500', preparationRequired: true, turnaroundTime: '48 hours' },
  { id: 'cardiac-profile', name: 'Cardiac Risk Profile', category: 'Health Packages', description: 'Lipid Profile, CRP, Homocysteine', price: '₹3000', preparationRequired: true, turnaroundTime: '48 hours' },
  { id: 'senior-citizen', name: 'Senior Citizen Package', category: 'Health Packages', description: 'Comprehensive health screening for seniors', price: '₹5000', preparationRequired: true, turnaroundTime: '72 hours' },
  { id: 'women-wellness', name: 'Women Wellness Package', category: 'Health Packages', description: 'CBC, Thyroid, Vitamin D, Iron, Calcium', price: '₹3500', preparationRequired: true, turnaroundTime: '48 hours' },
];

const LabTests = () => {
  const { toast } = useToast();

  // ── Extracted hooks ──────────────────────────────────────────────────────
  const {
    cart, cartTotal, cartFingerprint,
    showCartDialog, setShowCartDialog,
    showCheckoutDialog, setShowCheckoutDialog,
    checkoutInFlightRef, lastCheckoutKey, setLastCheckoutKey,
    fetchCart, addToCart, removeFromCart, clearCart,
  } = useLabCart();

  const {
    tests, isLoading,
    filterStatus, setFilterStatus,
    searchTerm, setSearchTerm,
    refresh: fetchMyLabTests,
  } = useLabBookings();

  const [labFetchError, setLabFetchError] = useState(false);

  const {
    labs, corpLabs, loading: isLabsLoading, corpLoading: isCorpLoading,
    isCorporate: isCorporateEmployee, corporateName,
    searchCity: labSearchCity, setSearchCity: setLabSearchCity,
    selectedLabId, setSelectedLabId,
    selectedLab, setSelectedLab,
    search: fetchLabs, fetchCorpLabs: fetchMyCorpLabs,
  } = useLabSearch();

  // ── Remaining local state ─────────────────────────────────────────────────
  const [isBooking, setIsBooking] = useState(false);
  const [labSearchQuery, setLabSearchQuery] = useState('');
  const [collectionType, setCollectionType] = useState<'home' | 'lab' | ''>('');
  
  // bookingForm and catalog-local state
  const [bookingForm, setBookingForm] = useState({
    testName: '',
    appointmentDate: '',
    testType: 'blood_test',
    notes: '',
    labId: ''
  });
  const [showBookDialog, setShowBookDialog] = useState(false);
  const [selectedTest, setSelectedTest] = useState<AvailableTest | null>(null);
  const [searchCategory, setSearchCategory] = useState<string>('all');
  const [testSearchTerm, setTestSearchTerm] = useState('');

  const buildCheckoutKey = () => {
    const cartFingerprint = cart
      .map((item) => item.test.id)
      .sort()
      .join('|');
    return [
      localStorage.getItem('userId') || localStorage.getItem('userEmail') || 'anon',
      bookingForm.appointmentDate || 'no-date',
      collectionType || 'no-collection',
      selectedLab?.id || 'no-lab',
      cartFingerprint,
      getCartTotal().toString(),
    ].join('::');
  };

  const verifyRazorpayPaymentWithRetry = async ({
    orderId,
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
    idempotencyKey,
  }: {
    orderId: string;
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
    idempotencyKey: string;
  }) => {
    let lastError: any = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await api.post('/billing/payments/razorpay/verify', {
          orderId,
          razorpayOrderId,
          razorpayPaymentId,
          razorpaySignature,
        }, {
          headers: { 'X-Idempotency-Key': `${idempotencyKey}-verify-${attempt}` }
        });
        return true;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError;
  };

  // Cart API functions
  // Cart helpers delegated to useLabCart hook above
  const getCartTotal = () => cartTotal;

  // fetchMyLabTests, fetchLabs, fetchMyCorpLabs, getTestCategory → delegated to hooks above

  // Fetch labs when "Visit Lab" is selected
  useEffect(() => {
    if (selectedLabId === 'in_lab') {
      fetchLabs(labSearchCity);
    }
  }, [selectedLabId]);

  // Fetch corporate labs once when user picks "Visit Lab"
  useEffect(() => {
    if (collectionType === 'lab' && corpLabs.length === 0 && !isCorpLoading) {
      fetchMyCorpLabs();
    }
  }, [collectionType]);

  // Book a new lab test
  const handleBookLabTest = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      toast({
        title: 'Login Required',
        description: 'Please login to book a lab test',
        variant: 'destructive'
      });
      return;
    }

    if (!selectedTest || !bookingForm.appointmentDate) {
      toast({
        title: 'Missing Information',
        description: 'Please select a test and appointment date',
        variant: 'destructive'
      });
      return;
    }

    if (!collectionType) {
      toast({
        title: 'Collection Type Required',
        description: 'Please select Home Collection or Visit Lab',
        variant: 'destructive'
      });
      return;
    }

    if (collectionType === 'lab' && !selectedLab) {
      toast({
        title: 'Lab Required',
        description: 'Please choose a lab before booking',
        variant: 'destructive'
      });
      return;
    }

    // Determine the actual lab ID to send
    const actualLabId = collectionType === 'lab'
      ? selectedLab?.id || null
      : null;

    try {
      setIsBooking(true);
      const response = await api.post('/lab-tests', {
        testType: mapTestToType(selectedTest.category),
        testName: selectedTest.name,
        hospitalId: actualLabId,
        appointmentDate: bookingForm.appointmentDate,
        notes: `${collectionType === 'home' ? '[Home Collection] ' : '[Visit Lab] '}${bookingForm.notes}`,
        urgency: 'routine'
      });

      const data = response.data;
      if (data?.success) {
        toast({
          title: 'Test Booked!',
          description: `Your ${selectedTest.name} has been booked for ${new Date(bookingForm.appointmentDate).toLocaleDateString()}${collectionType === 'home' ? ' (Home Collection)' : ''}`
        });
        setShowBookDialog(false);
        setSelectedTest(null);
        setBookingForm({ testName: '', appointmentDate: '', testType: 'blood_test', notes: '', labId: '' });
        setCollectionType('');
        setSelectedLab(null);
        setSelectedLabId('');
        setLabSearchCity('');
        setLabSearchQuery('');
        fetchMyLabTests(); // Refresh list
      } else {
        toast({
          title: 'Booking Failed',
          description: data?.message || 'Failed to book lab test',
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('Error booking lab test:', error);
      toast({
        title: 'Error',
        description: 'Something went wrong while booking',
        variant: 'destructive'
      });
    } finally {
      setIsBooking(false);
    }
  };

  // Map test category to testType
  const mapTestToType = (category: string): string => {
    const typeMap: Record<string, string> = {
      'Hematology': 'blood_test',
      'Biochemistry': 'blood_test',
      'Diabetes': 'blood_test',
      'Cardiac': 'ecg',
      'Urine Analysis': 'pathology',
      'Infectious Diseases': 'pathology',
      'Hormones': 'blood_test',
      'Tumor Markers': 'blood_test',
      'Allergy': 'blood_test',
      'Autoimmune': 'blood_test',
      'Stool Analysis': 'pathology',
      'Health Packages': 'blood_test'
    };
    return typeMap[category] || 'other';
  };

  // Fetch data on mount — instrumented with telemetry
  const refetchLabTests = () => {
    setLabFetchError(false);
    fetchMyLabTests().catch(() => setLabFetchError(true));
  };

  useEffect(() => {
    const mark = telemetry.startMark('LabTests');
    Promise.all([
      fetchMyLabTests().catch(() => setLabFetchError(true)),
      fetchCart(),
    ]).finally(() => telemetry.endMark(mark));
  }, []);

  // Fetch labs when collection type is "lab" and search query changes
  useEffect(() => {
    if (collectionType === 'lab') {
      const timer = setTimeout(() => {
        fetchLabs(labSearchQuery);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [labSearchQuery, collectionType]);

  // Filter available tests for booking
  const filteredBookingTests = availableTests.filter(test => {
    const matchesCategory = searchCategory === 'all' || test.category === searchCategory;
    const searchLower = testSearchTerm.toLowerCase();
    const matchesSearch =
      test.name.toLowerCase().includes(searchLower) ||
      test.category.toLowerCase().includes(searchLower) ||
      test.description.toLowerCase().includes(searchLower);
    return matchesCategory && matchesSearch;
  });

  const filteredTests = tests.filter(test => {
    // Handle status filter groups
    const matchesStatus = 
      filterStatus === 'all' ||
      (filterStatus === 'pending' && ['pending', 'pending_confirmation'].includes(test.status)) ||
      (filterStatus === 'in_progress' && ['confirmed', 'sample_collected', 'processing'].includes(test.status)) ||
      (filterStatus === 'completed' && test.status === 'completed') ||
      test.status === filterStatus;
    
    const matchesSearch = 
      test.testName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      test.category.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesStatus && matchesSearch;
  });

  const filteredAvailableTests = availableTests.filter(test =>
    (searchCategory === 'all' || test.category === searchCategory) &&
    (test.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
     test.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
     test.category.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const categories = ['all', ...Array.from(new Set(availableTests.map(t => t.category)))];

  const handleBookTest = (test: AvailableTest) => {
    addToCart(test);
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      pending_confirmation: 'bg-orange-100 text-orange-800',
      confirmed: 'bg-blue-100 text-blue-800',
      sample_collected: 'bg-indigo-100 text-indigo-800',
      processing: 'bg-purple-100 text-purple-800',
      completed: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending: 'Pending',
      pending_confirmation: 'Awaiting Confirmation',
      confirmed: 'Confirmed',
      sample_collected: 'Sample Collected',
      processing: 'Processing',
      completed: 'Completed',
      cancelled: 'Cancelled'
    };
    return labels[status] || status.replace('_', ' ');
  };

  const statusCounts = {
    total: tests.length,
    pending: tests.filter(t => ['pending', 'pending_confirmation'].includes(t.status)).length,
    in_progress: tests.filter(t => ['confirmed', 'sample_collected', 'processing'].includes(t.status)).length,
    completed: tests.filter(t => t.status === 'completed').length
  };

  return (
      <motion.div variants={container} initial="hidden" animate="show" className="max-w-7xl mx-auto space-y-6 px-4 md:px-6 py-6">
        {/* Header */}
        <motion.div variants={item} className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-800 via-slate-900 to-slate-800 p-6 md:p-8 text-white shadow-2xl">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMzLjMxNCAwIDYgMi42ODYgNiA2cy0yLjY4NiA2LTYgNi02LTIuNjg2LTYtNiAyLjY4Ni02IDYtNiIgc3Ryb2tlPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMSkiLz48L2c+PC9zdmc+')] opacity-30" />
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-teal-500/20 to-transparent rounded-full blur-3xl" />
          <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2.5 rounded-xl bg-gradient-to-br from-teal-500 to-teal-600 shadow-lg shadow-teal-500/30">
                  <FlaskConical className="w-6 h-6" />
                </div>
                <Badge className="bg-white/10 text-white/90 border-white/20 font-medium">
                  Lab Management
                </Badge>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold mb-2">Lab Tests</h1>
              <p className="text-slate-300 text-sm md:text-base">Manage and track your laboratory tests</p>
            </div>
            <div className="flex items-center gap-3">
              {/* Cart Icon */}
              <Button 
                variant="outline" 
                className="relative bg-white/10 border-white/20 text-white hover:bg-white/20"
                onClick={() => { setShowCartDialog(true); telemetry.funnel('lab_checkout', 'cart_opened', { cartSize: cart.length }); }}
              >
                <ShoppingCart className="h-5 w-5" />
                {cart.length > 0 && (
                  <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-bold">
                    {cart.length}
                  </span>
                )}
              </Button>
              
              {/* Book Lab Test Button */}
              <Dialog open={showBookDialog} onOpenChange={setShowBookDialog}>
              <DialogTrigger asChild>
                <Button className="bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-white shadow-lg shadow-teal-500/30">
                  <Plus className="h-4 w-4 mr-2" />
                  Book Lab Test
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto dark:bg-slate-800 dark:border-slate-700">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
                    <FlaskConical className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                    Book Lab Tests
                  </DialogTitle>
                  <DialogDescription className="dark:text-slate-400">
                    Select tests, choose collection type, and proceed to checkout
                  </DialogDescription>
                </DialogHeader>
                
                <Tabs defaultValue="tests" className="w-full">
                  <TabsList className="grid w-full grid-cols-3 bg-slate-100 dark:bg-slate-800">
                    <TabsTrigger value="tests" className="data-[state=active]:bg-teal-600 data-[state=active]:text-white dark:text-slate-300 dark:data-[state=active]:bg-teal-600">
                      1. Select Tests {cart.length > 0 && <Badge className="ml-1 bg-white text-teal-600 dark:bg-teal-600 dark:text-white">{cart.length}</Badge>}
                    </TabsTrigger>
                    <TabsTrigger value="location" disabled={cart.length === 0} className="data-[state=active]:bg-teal-600 data-[state=active]:text-white dark:text-slate-300 dark:data-[state=active]:bg-teal-600">
                      2. Location
                    </TabsTrigger>
                    <TabsTrigger value="checkout" disabled={cart.length === 0 || !collectionType} className="data-[state=active]:bg-teal-600 data-[state=active]:text-white dark:text-slate-300 dark:data-[state=active]:bg-teal-600">
                      3. Checkout
                    </TabsTrigger>
                  </TabsList>
                  
                  {/* Step 1: Select Tests */}
                  <TabsContent value="tests" className="mt-4 bg-gradient-to-br from-slate-50 to-gray-50 dark:from-slate-900 dark:to-slate-800 p-4 rounded-lg border border-gray-200 dark:border-slate-700">
                    <div className="space-y-4">
                      {/* Search */}
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-slate-400" />
                        <Input
                          placeholder="Search tests (CBC, Thyroid, Lipid Profile...)"
                          value={testSearchTerm}
                          onChange={(e) => setTestSearchTerm(e.target.value)}
                          className="pl-10 dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                        />
                      </div>
                      
                      {/* Category Filter */}
                      <div className="flex gap-2 flex-wrap">
                        {['All', 'Hematology', 'Biochemistry', 'Diabetes', 'Cardiac', 'Hormones', 'Health Packages'].map(cat => (
                          <Button
                            key={cat}
                            variant={searchCategory === cat.toLowerCase() || (cat === 'All' && searchCategory === 'all') ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setSearchCategory(cat === 'All' ? 'all' : cat)}
                          >
                            {cat}
                          </Button>
                        ))}
                      </div>
                      
                      {/* Cart Summary */}
                      {cart.length > 0 && (
                        <Card className="bg-gradient-to-r from-teal-50 to-cyan-50 dark:from-slate-800 dark:to-slate-700 border-2 border-teal-300 dark:border-teal-600 shadow-md">
                          <CardContent className="py-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <ShoppingCart className="h-5 w-5 text-teal-700 dark:text-teal-400" />
                                <span className="font-semibold text-gray-900 dark:text-white">{cart.length} test(s) in cart</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="font-bold text-teal-800 dark:text-teal-300 text-lg">₹{getCartTotal().toLocaleString()}</span>
                                <Button size="sm" variant="ghost" onClick={clearCart}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-1 mt-2">
                              {cart.map(item => (
                                <Badge key={item.test.id} variant="secondary" className="text-xs">
                                  {item.test.name}
                                  <X className="h-3 w-3 ml-1 cursor-pointer" onClick={() => removeFromCart(item.test.id)} />
                                </Badge>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      )}
                      
                      {/* Test List */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[40vh] overflow-y-auto pr-2">
                        {filteredBookingTests.slice(0, 30).map(test => {
                          const isInCart = cart.some(item => item.test.id === test.id);
                          return (
                            <Card 
                              key={test.id} 
                              className={`cursor-pointer transition-all hover:shadow-lg ${isInCart ? 'ring-2 ring-teal-500 bg-gradient-to-br from-teal-50 to-cyan-50 dark:from-slate-700 dark:to-slate-600 dark:ring-teal-400' : 'hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700'}`}
                              onClick={() => !isInCart && addToCart(test)}
                            >
                              <CardContent className="py-3">
                                <div className="flex justify-between items-start">
                                  <div className="flex-1">
                                    <h4 className="font-semibold text-sm text-gray-900 dark:text-white">{test.name}</h4>
                                    <p className="text-xs text-gray-600 dark:text-slate-300 mt-1">{test.description}</p>
                                    <div className="flex items-center gap-2 mt-2">
                                      <Badge variant="outline" className="text-xs bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-700">{test.category}</Badge>
                                      {test.preparationRequired && (
                                        <Badge variant="secondary" className="text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300">Fasting</Badge>
                                      )}
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div className="font-bold text-teal-700 dark:text-teal-400 text-base">{test.price}</div>
                                    <div className="text-xs text-gray-500 dark:text-slate-400">{test.turnaroundTime}</div>
                                    {isInCart ? (
                                      <Badge className="mt-1 bg-teal-500">Added ✓</Badge>
                                    ) : (
                                      <Button size="sm" variant="ghost" className="mt-1 h-6 px-2">
                                        <Plus className="h-3 w-3" />
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    </div>
                  </TabsContent>
                  
                  {/* Step 2: Location */}
                  <TabsContent value="location" className="mt-4 bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-slate-900 dark:to-slate-800 p-4 rounded-lg border border-blue-200 dark:border-slate-700">
                    <div className="space-y-4">
                      {/* Collection Type */}
                      <div>
                        <Label className="text-base font-semibold text-gray-900 dark:text-white">How would you like your sample collected?</Label>
                        <div className="grid grid-cols-2 gap-4 mt-3">
                          <Card 
                            className={`cursor-pointer transition-all ${collectionType === 'home' ? 'ring-2 ring-teal-500 bg-teal-50 dark:bg-slate-700 dark:ring-teal-400' : 'hover:bg-gray-50 dark:bg-slate-800 dark:hover:bg-slate-700'}`}
                            onClick={() => setCollectionType('home')}
                          >
                            <CardContent className="py-6 text-center">
                              <div className="text-4xl mb-2">🏠</div>
                              <h3 className="font-semibold text-gray-900 dark:text-white">Home Collection</h3>
                              <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">Our phlebotomist will visit your home</p>
                              <Badge className="mt-2 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">Convenient</Badge>
                            </CardContent>
                          </Card>
                          <Card 
                            className={`cursor-pointer transition-all ${collectionType === 'lab' ? 'ring-2 ring-teal-500 bg-teal-50 dark:bg-slate-700 dark:ring-teal-400' : 'hover:bg-gray-50 dark:bg-slate-800 dark:hover:bg-slate-700'}`}
                            onClick={() => { setCollectionType('lab'); fetchLabs(labSearchQuery); }}
                          >
                            <CardContent className="py-6 text-center">
                              <div className="text-4xl mb-2">🏥</div>
                              <h3 className="font-semibold text-gray-900 dark:text-white">Visit Lab</h3>
                              <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">Visit a diagnostic center near you</p>
                              <Badge className="mt-2 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">Instant Results</Badge>
                            </CardContent>
                          </Card>
                        </div>
                      </div>
                      
                      {/* Lab Selection for Visit Lab */}
                      {collectionType === 'lab' && (
                        <div className="space-y-3">
                          {/* Corporate Network Labs */}
                          {isCorporateEmployee && (isCorpLoading || corpLabs.length > 0) && (
                            <div className="space-y-2">
                              <div className="flex items-center gap-2 py-1">
                                <Building2 className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                                <span className="font-semibold text-sm text-purple-800 dark:text-purple-300">
                                  {corporateName} Network
                                </span>
                                {!isCorpLoading && (
                                  <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 text-xs">
                                    {corpLabs.length} labs
                                  </Badge>
                                )}
                              </div>
                              {isCorpLoading ? (
                                <div className="flex items-center gap-2 py-2">
                                  <Loader2 className="h-4 w-4 animate-spin text-purple-500" />
                                  <span className="text-sm text-purple-700 dark:text-purple-300">Loading corporate labs...</span>
                                </div>
                              ) : (
                                <div className="space-y-1.5 max-h-[28vh] overflow-y-auto pr-1">
                                  {corpLabs.map(lab => (
                                    <Card
                                      key={`corp-${lab.id}`}
                                      className={`cursor-pointer transition-all border-2 ${
                                        selectedLab?.id === lab.id
                                          ? 'ring-2 ring-purple-500 bg-gradient-to-r from-purple-50 to-violet-50 dark:from-slate-700 dark:to-slate-600 dark:ring-purple-400 border-purple-300 dark:border-purple-600'
                                          : 'border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-slate-800 hover:bg-purple-50 dark:hover:bg-slate-700 hover:shadow-md'
                                      }`}
                                      onClick={() => setSelectedLab(lab)}
                                    >
                                      <CardContent className="py-2.5">
                                        <div className="flex justify-between items-start">
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                              <h4 className="font-semibold text-sm text-gray-900 dark:text-white">{lab.name}</h4>
                                              <Badge className="bg-purple-600 text-white text-xs px-1.5 py-0 rounded shrink-0">Corp</Badge>
                                            </div>
                                            <p className="text-xs text-gray-600 dark:text-slate-300 flex items-start gap-1 mt-0.5">
                                              <MapPin className="h-3 w-3 mt-0.5 flex-shrink-0" />
                                              <span className="truncate">{lab.address?.street}, {lab.address?.city}</span>
                                            </p>
                                            {lab.accreditation && (
                                              <Badge variant="outline" className="text-xs mt-1 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700">
                                                {lab.accreditation}
                                              </Badge>
                                            )}
                                          </div>
                                          <div className="text-right ml-2 shrink-0">
                                            {lab.rating > 0 && (
                                              <div className="flex items-center gap-1">
                                                <span className="text-yellow-500 text-xs">⭐</span>
                                                <span className="text-xs font-semibold text-gray-900 dark:text-white">{lab.rating}</span>
                                              </div>
                                            )}
                                            {(lab as any).corpDiscount > 0 && (
                                              <Badge className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 mt-0.5">
                                                {(lab as any).corpDiscount}% off
                                              </Badge>
                                            )}
                                            {selectedLab?.id === lab.id && (
                                              <Badge className="mt-1 bg-purple-500 text-white block">Selected ✓</Badge>
                                            )}
                                          </div>
                                        </div>
                                      </CardContent>
                                    </Card>
                                  ))}
                                </div>
                              )}
                              <div className="border-b border-gray-200 dark:border-slate-700 pb-2">
                                <p className="text-xs text-gray-500 dark:text-slate-400">Or search all available labs below</p>
                              </div>
                            </div>
                          )}

                          <div>
                            <Label className="text-gray-900 dark:text-white font-medium">Search by City, Area, or Pincode</Label>
                            <div className="flex gap-2 mt-1">
                              <Input 
                                placeholder="Enter city, area name or pincode (e.g., Chennai, Anna Nagar, 600040)"
                                value={labSearchQuery}
                                onChange={(e) => setLabSearchQuery(e.target.value)}
                                className="flex-1 dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                              />
                              <Button variant="outline" size="icon" title="Use current location">
                                <Navigation className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                          
                          {isLabsLoading ? (
                            <div className="flex items-center justify-center py-8">
                              <Loader2 className="h-6 w-6 animate-spin text-teal-600 dark:text-teal-400" />
                              <span className="ml-2 text-gray-900 dark:text-white">Finding labs...</span>
                            </div>
                          ) : (
                            <div className="space-y-2 max-h-[35vh] overflow-y-auto">
                              {labs.length > 0 ? (
                                <>
                                  <p className="text-sm text-gray-700 dark:text-slate-300 font-medium">Found {labs.length} labs {labSearchQuery && `matching "${labSearchQuery}"`}</p>
                                  {labs.map(lab => (
                                    <Card 
                                      key={lab.id}
                                      className={`cursor-pointer transition-all ${selectedLab?.id === lab.id ? 'ring-2 ring-teal-500 bg-gradient-to-r from-teal-50 to-cyan-50 dark:from-slate-700 dark:to-slate-600 dark:ring-teal-400' : 'bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 hover:shadow-md'}`}
                                      onClick={() => setSelectedLab(lab)}
                                    >
                                      <CardContent className="py-3">
                                        <div className="flex justify-between">
                                          <div className="flex-1">
                                            <h4 className="font-semibold text-gray-900 dark:text-white">{lab.name}</h4>
                                            <p className="text-sm text-gray-700 dark:text-slate-300 flex items-start gap-1 mt-1">
                                              <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                                              <span>{lab.address.street}</span>
                                            </p>
                                            <p className="text-sm text-gray-600 dark:text-slate-400 ml-5">
                                              {lab.address.city}, {lab.address.state} - {lab.address.zipCode}
                                            </p>
                                            <div className="flex gap-2 mt-2">
                                              {lab.accreditation && (
                                                <Badge variant="outline" className="text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700">{lab.accreditation}</Badge>
                                              )}
                                              {lab.facilities?.includes('home-collection') && (
                                                <Badge variant="secondary" className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">Home Collection</Badge>
                                              )}
                                            </div>
                                          </div>
                                          <div className="text-right">
                                            <div className="flex items-center gap-1">
                                              <span className="text-yellow-500">⭐</span>
                                              <span className="font-semibold text-gray-900 dark:text-white">{lab.rating}</span>
                                            </div>
                                            {selectedLab?.id === lab.id && (
                                              <Badge className="mt-2 bg-teal-500">Selected ✓</Badge>
                                            )}
                                          </div>
                                        </div>
                                      </CardContent>
                                    </Card>
                                  ))}
                                </>
                              ) : (
                                <div className="text-center py-8 bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700">
                                  <MapPin className="h-12 w-12 mx-auto mb-2 text-gray-400 dark:text-slate-500" />
                                  <p className="text-gray-700 dark:text-slate-300 font-medium">No labs found. Try searching with a different city or pincode.</p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                      
                      {/* Appointment Date */}
                      {collectionType && (
                        <div>
                          <Label>Preferred Date</Label>
                          <Input 
                            type="date" 
                            min={new Date().toISOString().split('T')[0]}
                            value={bookingForm.appointmentDate}
                            onChange={(e) => setBookingForm(prev => ({ ...prev, appointmentDate: e.target.value }))}
                            className="mt-1"
                          />
                        </div>
                      )}
                    </div>
                  </TabsContent>
                  
                  {/* Step 3: Checkout */}
                  <TabsContent value="checkout" className="mt-4 bg-gradient-to-br from-teal-50 to-cyan-50 dark:from-slate-900 dark:to-slate-800 p-4 rounded-lg border border-teal-200 dark:border-slate-700">
                    <div className="space-y-4">
                      {/* Order Summary */}
                      <Card className="border-2 border-teal-200 dark:border-teal-700 shadow-md dark:bg-slate-800">
                        <CardHeader className="pb-2 bg-gradient-to-r from-teal-50 to-cyan-50 dark:from-slate-800 dark:to-slate-700 border-b border-teal-200 dark:border-slate-700">
                          <CardTitle className="text-lg text-gray-900 dark:text-white">Order Summary</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3 pt-4">
                          {/* Tests */}
                          <div className="space-y-2">
                            {cart.map(item => (
                              <div key={item.test.id} className="flex justify-between items-center py-2 px-2 border-b border-gray-200 dark:border-slate-700 hover:bg-teal-50 dark:hover:bg-slate-700 rounded transition-colors">
                                <div>
                                  <p className="font-semibold text-gray-900 dark:text-white">{item.test.name}</p>
                                  <p className="text-xs text-gray-600 dark:text-slate-400">{item.test.category} • {item.test.turnaroundTime}</p>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="font-bold text-teal-700 dark:text-teal-400">{item.test.price}</span>
                                  <Button size="sm" variant="ghost" onClick={() => removeFromCart(item.test.id)}>
                                    <Trash2 className="h-4 w-4 text-red-500" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                          
                          {/* Collection Details */}
                          <div className="bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-slate-800 dark:to-slate-700 p-4 rounded-lg border border-blue-200 dark:border-slate-700">
                            <h4 className="font-semibold text-sm mb-3 text-gray-900 dark:text-white">Collection Details</h4>
                            <div className="text-sm space-y-2">
                              <p><span className="text-gray-700 dark:text-slate-300 font-medium">Type:</span> <span className="text-gray-900 dark:text-white font-semibold">{collectionType === 'home' ? '🏠 Home Collection' : '🏥 Lab Visit'}</span></p>
                              {collectionType === 'lab' && selectedLab && (
                                <>
                                  <p><span className="text-gray-700 dark:text-slate-300 font-medium">Lab:</span> <span className="text-gray-900 dark:text-white font-semibold">{selectedLab.name}</span></p>
                                  <p><span className="text-gray-700 dark:text-slate-300 font-medium">Address:</span> <span className="text-gray-900 dark:text-white">{selectedLab.address.street}, {selectedLab.address.city}</span></p>
                                </>
                              )}
                              <p><span className="text-gray-700 dark:text-slate-300 font-medium">Date:</span> <span className="text-gray-900 dark:text-white font-semibold">{bookingForm.appointmentDate ? new Date(bookingForm.appointmentDate).toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : 'Not selected'}</span></p>
                            </div>
                          </div>
                          
                          {/* Special Instructions */}
                          <div>
                            <Label className="text-gray-900 dark:text-white font-medium">Special Instructions (Optional)</Label>
                            <Textarea 
                              placeholder="Any fasting requirements, allergies, or special notes..."
                              value={bookingForm.notes}
                              onChange={(e) => setBookingForm(prev => ({ ...prev, notes: e.target.value }))}
                              className="mt-1 bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                            />
                          </div>
                          
                          {/* Date Selection in Checkout (if not set) */}
                          {!bookingForm.appointmentDate && (
                            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 p-3 rounded-lg">
                              <Label className="text-amber-900 dark:text-amber-200 font-medium">📅 Select Appointment Date</Label>
                              <Input 
                                type="date" 
                                min={new Date().toISOString().split('T')[0]}
                                value={bookingForm.appointmentDate}
                                onChange={(e) => setBookingForm(prev => ({ ...prev, appointmentDate: e.target.value }))}
                                className="mt-2 bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                              />
                            </div>
                          )}
                          
                          {/* Pricing */}
                          <div className="border-t-2 border-teal-200 dark:border-teal-700 pt-4 space-y-3 bg-gradient-to-r from-teal-50 to-cyan-50 dark:from-slate-800 dark:to-slate-700 p-3 rounded-lg">
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-700 dark:text-slate-300 font-medium">Subtotal ({cart.length} tests)</span>
                              <span className="text-gray-900 dark:text-white font-semibold">₹{getCartTotal().toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-700 dark:text-slate-300 font-medium">Collection Charges</span>
                              <span className="text-green-700 dark:text-green-400 font-semibold">FREE</span>
                            </div>
                            <div className="flex justify-between font-bold text-lg pt-2 border-t-2 border-teal-200 dark:border-teal-700">
                              <span className="text-gray-900 dark:text-white">Total</span>
                              <span className="text-teal-700 dark:text-teal-400 text-xl">₹{getCartTotal().toLocaleString()}</span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                      
                      {/* Payment Button */}
                      <Button 
                        className="w-full h-12 text-lg bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700"
                        disabled={isBooking || !bookingForm.appointmentDate || (collectionType === 'lab' && !selectedLab)}
                        onClick={async () => {
                          // Validate before booking
                          if (!bookingForm.appointmentDate) {
                            toast({ title: 'Please select an appointment date', variant: 'destructive' });
                            return;
                          }
                          if (collectionType === 'lab' && !selectedLab) {
                            toast({ title: 'Please select a lab', variant: 'destructive' });
                            return;
                          }

                          const checkoutKey = buildCheckoutKey();
                          if (checkoutInFlightRef.current) {
                            toast({ title: 'Checkout already in progress', description: 'Please wait for the current request to finish.' });
                            return;
                          }
                          if (lastCheckoutKey === checkoutKey) {
                            toast({ title: 'Duplicate checkout blocked', description: 'This booking request was already submitted.' });
                            return;
                          }
                          
                          checkoutInFlightRef.current = true;
                          setIsBooking(true);
                          telemetry.funnel('lab_checkout', 'payment_initiated', { cartSize: cart.length, totalAmount: cartTotal });
                          try {
                            const token = localStorage.getItem('token');
                            if (!token) {
                              toast({ title: 'Please login to continue', variant: 'destructive' });
                              setIsBooking(false);
                              checkoutInFlightRef.current = false;
                              return;
                            }

                            // Step 1: Book all tests in cart
                            let hasError = false;
                            for (const item of cart) {
                              const requestBody = {
                                testType: mapTestToType(item.test.category),
                                testName: item.test.name,
                                appointmentDate: bookingForm.appointmentDate,
                                notes: `${collectionType === 'home' ? '[Home Collection] ' : `[Lab: ${selectedLab?.name}] `}${bookingForm.notes} [Req:${checkoutKey}]`,
                                urgency: 'routine'
                              };
                              const response = await api.post('/lab-tests', requestBody, {
                                headers: { 'X-Idempotency-Key': `${checkoutKey}-${item.test.id}` }
                              });
                              if (!response.data?.success) {
                                toast({ 
                                  title: 'Booking failed', 
                                  description: response.data?.message || 'Failed to book test', 
                                  variant: 'destructive' 
                                });
                                hasError = true;
                                break;
                              }
                            }
                            if (hasError) return;

                            setLastCheckoutKey(checkoutKey);

                            const totalAmount = getCartTotal();

                            // Step 2: Create a billing order for payment
                            let orderId: string | null = null;
                            try {
                              const orderRes = await api.post('/billing/orders/create', {
                                orderType: 'lab_test',
                                subtotal: totalAmount,
                                tax: 0,
                                discount: 0,
                                currency: 'INR',
                                notes: `Lab tests: ${cart.map(i => i.test.name).join(', ')}`
                              }, {
                                headers: { 'X-Idempotency-Key': `${checkoutKey}-order` }
                              });
                              if (orderRes.data?.success && orderRes.data?.data?.order?.id) {
                                orderId = orderRes.data.data.order.id;
                              }
                            } catch (orderErr) {
                              console.error('Order creation failed:', orderErr);
                            }

                            // Step 3: Initiate Razorpay payment if order was created
                            if (orderId && totalAmount > 0) {
                              const scriptLoaded = await loadRazorpayScript();
                              if (!scriptLoaded) {
                                toast({ title: 'Payment gateway unavailable', description: 'Could not load Razorpay. Please try again.', variant: 'destructive' });
                                return;
                              }

                              const payRes = await api.post('/billing/payments/razorpay/create', {
                                orderId,
                                amount: totalAmount,
                                currency: 'INR'
                              }, {
                                headers: { 'X-Idempotency-Key': `${checkoutKey}-payment-create` }
                              });

                              if (!payRes.data?.success) {
                                toast({ title: 'Payment initiation failed', description: payRes.data?.message || 'Could not start payment', variant: 'destructive' });
                                return;
                              }

                              const { orderId: razorpayOrderId, amount, currency, key } = payRes.data.data;
                              const userData = JSON.parse(localStorage.getItem('userData') || '{}');

                              await new Promise<void>((resolve, reject) => {
                                const options = {
                                  key,
                                  amount,
                                  currency,
                                  name: 'Mediczy',
                                  description: `Lab Tests - ${cart.length} test(s)`,
                                  order_id: razorpayOrderId,
                                  prefill: {
                                    name: userData.name || userData.firstName || '',
                                    email: userData.email || localStorage.getItem('userEmail') || '',
                                    contact: userData.phone || userData.phoneNumber || localStorage.getItem('userPhone') || ''
                                  },
                                  theme: { color: '#14b8a6' },
                                  handler: async function (response: any) {
                                    try {
                                      await verifyRazorpayPaymentWithRetry({
                                        orderId,
                                        razorpayOrderId: response.razorpay_order_id,
                                        razorpayPaymentId: response.razorpay_payment_id,
                                        razorpaySignature: response.razorpay_signature,
                                        idempotencyKey: checkoutKey,
                                      });
                                      toast({ title: 'Payment Successful! 🎉', description: `${cart.length} test(s) booked and payment confirmed.` });
                                      resolve();
                                    } catch {
                                      toast({ title: 'Payment verification failed', description: 'Please contact support with your payment ID.', variant: 'destructive' });
                                      resolve();
                                    }
                                  },
                                  modal: {
                                    ondismiss: () => {
                                      toast({ title: 'Payment cancelled', description: 'Your tests are booked but payment was not completed.' });
                                      resolve();
                                    }
                                  }
                                };
                                const rzp = new window.Razorpay(options);
                                rzp.open();
                              });
                            } else {
                              // Free or order creation failed – just confirm booking
                              toast({
                                title: 'Booking Successful! 🎉',
                                description: `${cart.length} test(s) booked for ${new Date(bookingForm.appointmentDate).toLocaleDateString()}`
                              });
                            }

                            // Reset everything after booking (+payment)
                            clearCart();
                            setCollectionType('');
                            setSelectedLab(null);
                            setLabSearchQuery('');
                            setBookingForm({ testName: '', appointmentDate: '', testType: 'blood_test', notes: '', labId: '' });
                            setShowBookDialog(false);
                            fetchMyLabTests();
                          } catch (error: any) {
                            console.error('Checkout error:', error);
                            toast({ title: 'Checkout failed', description: error.message || 'Please try again', variant: 'destructive' });
                          } finally {
                            setIsBooking(false);
                            checkoutInFlightRef.current = false;
                          }
                        }}
                        title={!bookingForm.appointmentDate ? 'Select an appointment date first' : (collectionType === 'lab' && !selectedLab ? 'Select a lab first' : '')}
                      >
                        {isBooking ? (
                          <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Processing...</>
                        ) : !bookingForm.appointmentDate ? (
                          <>❌ Select Date First</>
                        ) : (collectionType === 'lab' && !selectedLab) ? (
                          <>❌ Select Lab First</>
                        ) : (
                          <>✅ Proceed to Pay ₹{getCartTotal().toLocaleString()}</>
                        )}
                      </Button>
                    </div>
                  </TabsContent>
                </Tabs>
              </DialogContent>
            </Dialog>
            </div>
            
            {/* Cart Sidebar Dialog */}
            <Dialog open={showCartDialog} onOpenChange={setShowCartDialog}>
              <DialogContent className="sm:max-w-md dark:bg-slate-800 dark:border-slate-700">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
                    <ShoppingCart className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                    Your Cart
                  </DialogTitle>
                  <DialogDescription className="dark:text-slate-400">
                    {cart.length === 0 ? 'Your cart is empty' : `${cart.length} test(s) in your cart`}
                  </DialogDescription>
                </DialogHeader>
                
                {cart.length === 0 ? (
                  <div className="text-center py-8">
                    <ShoppingCart className="h-12 w-12 text-gray-300 dark:text-slate-600 mx-auto mb-3" />
                    <p className="text-gray-500 dark:text-slate-400">No tests added yet</p>
                    <Button 
                      className="mt-4 dark:bg-teal-600 dark:hover:bg-teal-700"
                      onClick={() => { setShowCartDialog(false); setShowBookDialog(true); }}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Browse Tests
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[50vh] overflow-y-auto">
                    {cart.map((item) => (
                      <div key={item.test.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-700 rounded-lg">
                        <div className="flex-1">
                          <h4 className="font-medium text-sm text-gray-900 dark:text-white">{item.test.name}</h4>
                          <p className="text-xs text-gray-500 dark:text-slate-400">{item.test.category}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-teal-600 dark:text-teal-400">{item.test.price}</span>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/30"
                            onClick={() => removeFromCart(item.test.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                {cart.length > 0 && (
                  <div className="border-t pt-4 mt-4 dark:border-slate-700">
                    <div className="flex justify-between items-center mb-4">
                      <span className="font-medium text-gray-900 dark:text-white">Total</span>
                      <span className="text-xl font-bold text-teal-600 dark:text-teal-400">₹{getCartTotal().toLocaleString()}</span>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        className="flex-1 dark:bg-slate-700 dark:hover:bg-slate-600 dark:border-slate-600"
                        onClick={clearCart}
                      >
                        Clear All
                      </Button>
                      <Button 
                        className="flex-1 bg-teal-600 hover:bg-teal-700 dark:bg-teal-600 dark:hover:bg-teal-700"
                        onClick={() => { setShowCartDialog(false); setShowBookDialog(true); }}
                      >
                        Proceed to Book
                      </Button>
                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          </div>
        </motion.div>

        {/* Stats */}
        <motion.div variants={item} className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <motion.div whileHover={{ y: -4, scale: 1.02 }} transition={{ type: 'spring', stiffness: 300 }}>
          <Card className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 cursor-pointer hover:shadow-lg transition-shadow" onClick={() => setFilterStatus('all')}>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-gray-900 dark:text-white">{statusCounts.total}</div>
                <div className="text-sm text-gray-600 dark:text-slate-400">Total Tests</div>
              </div>
            </CardContent>
          </Card>
          </motion.div>
          <motion.div whileHover={{ y: -4, scale: 1.02 }} transition={{ type: 'spring', stiffness: 300 }}>
          <Card className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 cursor-pointer hover:shadow-lg transition-shadow" onClick={() => setFilterStatus('pending')}>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-yellow-600 dark:text-yellow-400">{statusCounts.pending}</div>
                <div className="text-sm text-gray-600 dark:text-slate-400">Pending</div>
              </div>
            </CardContent>
          </Card>
          </motion.div>
          <motion.div whileHover={{ y: -4, scale: 1.02 }} transition={{ type: 'spring', stiffness: 300 }}>
          <Card className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 cursor-pointer hover:shadow-lg transition-shadow" onClick={() => setFilterStatus('in_progress')}>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">{statusCounts.in_progress}</div>
                <div className="text-sm text-gray-600 dark:text-slate-400">In Progress</div>
              </div>
            </CardContent>
          </Card>
          </motion.div>
          <motion.div whileHover={{ y: -4, scale: 1.02 }} transition={{ type: 'spring', stiffness: 300 }}>
          <Card className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 cursor-pointer hover:shadow-lg transition-shadow" onClick={() => setFilterStatus('completed')}>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-green-600 dark:text-green-400">{statusCounts.completed}</div>
                <div className="text-sm text-gray-600 dark:text-slate-400">Completed</div>
              </div>
            </CardContent>
          </Card>
          </motion.div>
        </motion.div>

        {/* Controls */}
        <motion.div variants={item}>
        <Card className="mb-6 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-slate-500" />
                  <Input
                    placeholder="Search tests by name, category, or description..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 dark:bg-slate-900 dark:border-slate-700 dark:text-white"
                  />
                </div>
                <Select value={searchCategory} onValueChange={setSearchCategory}>
                  <SelectTrigger className="w-full md:w-[200px] dark:bg-slate-900 dark:border-slate-700 dark:text-white">
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-slate-900 dark:border-slate-700">
                    {categories.map(cat => (
                      <SelectItem key={cat} value={cat} className="dark:text-white dark:hover:bg-slate-800">
                        {cat === 'all' ? 'All Categories' : cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2 flex-wrap">
                <span className="text-sm text-gray-500 dark:text-slate-400 my-auto">My Tests:</span>
                <Button
                  variant={filterStatus === 'all' ? 'default' : 'outline'}
                  onClick={() => setFilterStatus('all')}
                  size="sm"
                >
                  All
                </Button>
                <Button
                  variant={filterStatus === 'pending' ? 'default' : 'outline'}
                  onClick={() => setFilterStatus('pending')}
                  size="sm"
                >
                  Pending
                </Button>
                <Button
                  variant={filterStatus === 'in_progress' ? 'default' : 'outline'}
                  onClick={() => setFilterStatus('in_progress')}
                  size="sm"
                >
                  In Progress
                </Button>
                <Button
                  variant={filterStatus === 'completed' ? 'default' : 'outline'}
                  onClick={() => setFilterStatus('completed')}
                  size="sm"
                >
                  Completed
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
        </motion.div>

        {/* Available Tests to Book */}
        {searchTerm && (
          <motion.div variants={item} className="mb-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">Available Tests ({filteredAvailableTests.length})</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredAvailableTests.slice(0, 12).map((test) => (
                <motion.div key={test.id} whileHover={{ y: -4 }} transition={{ type: 'spring', stiffness: 300 }}>
                <Card className="hover:shadow-lg transition-shadow cursor-pointer bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700" onClick={() => handleBookTest(test)}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-base mb-1 text-gray-900 dark:text-white">{test.name}</CardTitle>
                        <Badge variant="outline" className="text-xs bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-700">{test.category}</Badge>
                      </div>
                      <FlaskConical className="h-6 w-6 text-teal-600 dark:text-teal-400" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-gray-600 dark:text-slate-400 mb-3">{test.description}</p>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600 dark:text-slate-400">Price:</span>
                        <span className="font-semibold text-teal-600 dark:text-teal-400">{test.price}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600 dark:text-slate-400">Results in:</span>
                        <span className="font-medium text-gray-900 dark:text-white">{test.turnaroundTime}</span>
                      </div>
                      {test.preparationRequired && (
                        <Badge variant="secondary" className="text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300">Fasting Required</Badge>
                      )}
                    </div>
                    <Button className="w-full mt-4 bg-teal-500 hover:bg-teal-600 dark:bg-teal-600 dark:hover:bg-teal-700" size="sm">
                      <Plus className="h-4 w-4 mr-1" />
                      Book Test
                    </Button>
                  </CardContent>
                </Card>
                </motion.div>
              ))}
            </div>
            {filteredAvailableTests.length > 12 && (
              <p className="text-center text-sm text-gray-500 dark:text-slate-400 mt-4">
                Showing 12 of {filteredAvailableTests.length} tests. Refine your search for more specific results.
              </p>
            )}
          </motion.div>
        )}

        {/* My Booked Tests */}
        <motion.div variants={item}>
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">My Lab Tests ({filteredTests.length})</h2>
        {labFetchError && (
          <InlineError message="Couldn't load lab tests." onRetry={refetchLabTests} className="mb-4" />
        )}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-teal-600 dark:text-teal-400" />
            <span className="ml-2 text-gray-600 dark:text-slate-400">Loading your lab tests...</span>
          </div>
        ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <AnimatePresence>
          {filteredTests.map((test) => (
            <motion.div key={test.id} whileHover={{ y: -4 }} transition={{ type: 'spring', stiffness: 300 }} layout>
            <Card className="hover:shadow-lg transition-shadow bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg mb-2 text-gray-900 dark:text-white">{test.testName}</CardTitle>
                    <CardDescription className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-700">{test.category}</Badge>
                      <Badge className={getStatusColor(test.status)}>
                        {getStatusLabel(test.status)}
                      </Badge>
                      {test.urgency && test.urgency !== 'routine' && (
                        <Badge variant="destructive">{test.urgency.toUpperCase()}</Badge>
                      )}
                    </CardDescription>
                  </div>
                  <FlaskConical className="h-8 w-8 text-cyan-600 dark:text-cyan-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center text-sm text-gray-600 dark:text-slate-400">
                    <Calendar className="h-4 w-4 mr-2" />
                    <span>Ordered: {new Date(test.orderDate).toLocaleDateString()}</span>
                  </div>
                  {test.labName && (
                    <div className="flex items-center text-sm text-gray-600 dark:text-slate-400">
                      <MapPin className="h-4 w-4 mr-2" />
                      <span>{test.labName}</span>
                    </div>
                  )}
                  <div className="text-sm text-gray-600 dark:text-slate-400">
                    <span className="font-medium text-gray-900 dark:text-white">Booked by:</span> {test.orderedBy}
                  </div>
                  <div className="text-sm">
                    <span className="font-medium text-gray-900 dark:text-white">Sample Status:</span>{' '}
                    <span className={test.sampleCollected ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'}>
                      {test.sampleCollected ? 'Collected' : 'Not Collected'}
                    </span>
                  </div>
                  {test.estimatedDate && (
                    <div className="text-sm text-gray-600 dark:text-slate-400">
                      <span className="font-medium text-gray-900 dark:text-white">Estimated Date:</span>{' '}
                      {new Date(test.estimatedDate).toLocaleDateString()}
                    </div>
                  )}
                  {test.notes && (
                    <div className="p-2 bg-gray-50 dark:bg-slate-700 rounded-md text-sm">
                      <span className="font-medium text-gray-700 dark:text-slate-300">Notes:</span>
                      <p className="text-gray-600 dark:text-slate-400 mt-1">{test.notes}</p>
                    </div>
                  )}
                  {test.results && (
                    <div className="p-3 bg-green-50 dark:bg-green-900/30 rounded-md text-sm">
                      <span className="font-medium text-green-800 dark:text-green-300">Results:</span>
                      <p className="text-gray-700 dark:text-slate-300 mt-1">{test.results}</p>
                    </div>
                  )}
                  {test.status === 'completed' && test.reportUrl && (
                    <Button className="w-full dark:bg-slate-700 dark:hover:bg-slate-600" variant="outline">
                      <Download className="h-4 w-4 mr-2" />
                      Download Report
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
            </motion.div>
          ))}
          </AnimatePresence>
        </div>
        )}

        {!isLoading && !labFetchError && filteredTests.length === 0 && (
          <EmptyState
            icon={FlaskRound}
            title="No lab tests yet"
            description="Book your first test and get results directly here."
            action={{ label: 'Book a test', onClick: () => setShowBookDialog(true) }}
          />
        )}
        </motion.div>
      </motion.div>
  );
};

export default LabTests;
