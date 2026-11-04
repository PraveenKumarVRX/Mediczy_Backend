import type { Variants } from 'framer-motion';
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

const LabTests = () => {
  const { toast } = useToast();
  const [availableTests, setAvailableTests] = useState<AvailableTest[]>([]);
  const [collectionTime, setCollectionTime] = useState('');
  const [collectionAddress, setCollectionAddress] = useState({ street: '', city: '', pincode: '' });
  const checkoutOrderRef = useRef<{ key: string; order: any; paid: boolean } | null>(null);
  useEffect(() => {
    const loadCatalog = async () => {
      const all: AvailableTest[] = [];
      let offset = 0;
      while (true) {
        const { data } = await api.get('/lab-tests/catalog', { params: { limit: 200, offset } });
        const rows = data.data || [];
        all.push(...rows.map((test: any) => ({ id: String(test.test_id), name: test.name, category: test.category || 'Lab tests', description: test.description || '', price: `₹${Number(test.price)}`, preparationRequired: false, turnaroundTime: test.turnaround_time_hours ? `${test.turnaround_time_hours} hours` : 'Confirm with lab' })));
        offset += rows.length;
        if (!rows.length || offset >= data.pagination.total) break;
      }
      setAvailableTests(all);
    };
    loadCatalog().catch(() => toast({ title: 'Could not load the lab catalogue', description: 'Please refresh to try again.', variant: 'destructive' }));
  }, []);


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

  const [historyPage, setHistoryPage] = useState(1);
  useEffect(() => setHistoryPage(1), [filterStatus, searchTerm]);
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
    labId: '',
    couponCode: ''
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
      'Health Packages': 'blood_test',
      'Imaging': 'radiology'
    };
    return typeMap[category] || 'other';
  };

  const resolveTestType = (test: AvailableTest) => {
    const imagingMap: Record<string, string> = {
      'usg-abdomen': 'ultrasound',
      'ct-scan': 'ct_scan',
      'mri-brain': 'mri',
    };
    if (imagingMap[test.id]) return imagingMap[test.id];
    return mapTestToType(test.category);
  };

  const isImagingTest = (test: AvailableTest) => ['ultrasound', 'ct_scan', 'mri'].includes(resolveTestType(test));

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
    if (collectionType) {
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
      (filterStatus === 'pending' && test.status === 'pending_confirmation') ||
      (filterStatus === 'in_progress' && test.status === 'booked') ||
      (filterStatus === 'completed' && test.status === 'completed') ||
      (filterStatus === 'other' && ['cancelled', 'no_show', 'rescheduled'].includes(test.status)) ||
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

  // Real backend status enum is exactly: pending_confirmation, booked,
  // completed, cancelled, no_show, rescheduled - 'pending'/'confirmed'/
  // 'sample_collected'/'processing' never occur, which is why in_progress
  // was always 0 and total never matched pending+in_progress+completed.
  const statusCounts = {
    total: tests.length,
    pending: tests.filter(t => t.status === 'pending_confirmation').length,
    in_progress: tests.filter(t => t.status === 'booked').length,
    completed: tests.filter(t => t.status === 'completed').length,
    other: tests.filter(t => ['cancelled', 'no_show', 'rescheduled'].includes(t.status)).length,
  };

  return (
      <motion.div variants={container as unknown as Variants} initial="hidden" animate="show" className="max-w-7xl mx-auto space-y-6 px-4 md:px-6 py-6">
        {/* Header */}
        <motion.div variants={item as unknown as Variants} className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-800 via-slate-900 to-slate-800 p-6 md:p-8 text-white shadow-2xl">
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
                        {['All', 'Hematology', 'Biochemistry', 'Diabetes', 'Cardiac', 'Hormones', 'Health Packages', 'Imaging'].map(cat => (
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
                      {collectionType && (
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
                                            {Number(lab.rating) > 0 && (
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
                              {selectedLab && (
                                <>
                                  <p><span className="text-gray-700 dark:text-slate-300 font-medium">Lab:</span> <span className="text-gray-900 dark:text-white font-semibold">{selectedLab.name}</span></p>
                                  <p><span className="text-gray-700 dark:text-slate-300 font-medium">Address:</span> <span className="text-gray-900 dark:text-white">{selectedLab.address.street}, {selectedLab.address.city}</span></p>
                                </>
                              )}
                              <p><span className="text-gray-700 dark:text-slate-300 font-medium">Date:</span> <span className="text-gray-900 dark:text-white font-semibold">{bookingForm.appointmentDate ? new Date(bookingForm.appointmentDate).toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : 'Not selected'}</span></p>
                            </div>
                          </div>
                          
                          {/* Scan coupon */}
                          {cart.some((item) => isImagingTest(item.test)) && (
                            <div>
                              <Label className="text-gray-900 dark:text-white font-medium">Scan Coupon (USG / CT / MRI)</Label>
                              <Input
                                placeholder="e.g. USG, CTSCAN, MRI"
                                value={bookingForm.couponCode}
                                onChange={(e) => setBookingForm((prev) => ({ ...prev, couponCode: e.target.value.toUpperCase() }))}
                                className="mt-1 bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                              />
                              <p className="text-xs text-muted-foreground mt-1">
                                Use USG for ₹1000 ultrasound, CTSCAN for ₹2000 CT, MRI for ₹3000 MRI when coupons are configured.
                              </p>
                            </div>
                          )}

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
                          
                          <div className="space-y-2"><Label htmlFor="lab-collection-time">Preferred collection time (IST) *</Label><Input id="lab-collection-time" type="time" required value={collectionTime} onChange={e => setCollectionTime(e.target.value)} /><p className="text-xs text-muted-foreground">The lab must confirm your requested time.</p></div>
                          {collectionType === 'home' && <div className="space-y-2"><Label>Collection address *</Label><Input placeholder="House, street and locality" value={collectionAddress.street} onChange={e => setCollectionAddress({ ...collectionAddress, street: e.target.value })} /><Input placeholder="City" value={collectionAddress.city} onChange={e => setCollectionAddress({ ...collectionAddress, city: e.target.value })} /><Input placeholder="Six-digit pincode" inputMode="numeric" maxLength={6} value={collectionAddress.pincode} onChange={e => setCollectionAddress({ ...collectionAddress, pincode: e.target.value })} /></div>}
                          {/* Pricing */}
                          <div className="border-t-2 border-teal-200 dark:border-teal-700 pt-4 space-y-3 bg-gradient-to-r from-teal-50 to-cyan-50 dark:from-slate-800 dark:to-slate-700 p-3 rounded-lg">
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-700 dark:text-slate-300 font-medium">Subtotal ({cart.length} tests)</span>
                              <span className="text-gray-900 dark:text-white font-semibold">₹{getCartTotal().toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-700 dark:text-slate-300 font-medium">Collection Charges</span>
                              <span className="text-green-700 dark:text-green-400 font-semibold">Confirmed at payment</span>
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
                        disabled={isBooking || !bookingForm.appointmentDate || !selectedLab || !collectionTime}
                        onClick={async () => {
                          if (!selectedLab || !collectionType || !bookingForm.appointmentDate || !collectionTime || checkoutInFlightRef.current) {
                            toast({ title: 'Choose a lab, collection type, date and complete time', variant: 'destructive' }); return;
                          }
                          checkoutInFlightRef.current = true; setIsBooking(true);
                          try {
                            const request = { testIds: cart.map(item => item.test.id), labId: selectedLab.id, collectionType, date: bookingForm.appointmentDate, time: collectionTime, address: collectionAddress, notes: bookingForm.notes };
                            const key = JSON.stringify(request);
                            if (checkoutOrderRef.current?.key !== key) {
                              const { data } = await api.post('/lab-tests/checkout', request);
                              checkoutOrderRef.current = { key, order: data.order, paid: Number(data.order.total) === 0 };
                            }
                            const checkout = checkoutOrderRef.current!;
                            const orderId = checkout.order.id;
                            if (!checkout.paid) {
                              if (!await loadRazorpayScript()) throw new Error('Payment gateway is unavailable. Please try again.');
                              const { data: payment } = await api.post('/billing/payments/razorpay/create', { orderId, amount: Number(checkout.order.total), currency: 'INR' });
                              const { data: profile } = await api.get('/users/profile');
                              const user = profile.user || profile.data || profile;
                              await new Promise<void>((resolve, reject) => {
                                const rzp = new window.Razorpay({ ...payment.data, order_id: payment.data.orderId, name: 'Mediqzy', description: `${cart.length} lab test(s)`,
                                  prefill: { name: [user.firstName, user.lastName].filter(Boolean).join(' '), email: user.email || '', contact: user.phoneNumber || user.phone || '' },
                                  handler: async (response: any) => {
                                    try {
                                      await verifyRazorpayPaymentWithRetry({ orderId, razorpayOrderId: response.razorpay_order_id, razorpayPaymentId: response.razorpay_payment_id, razorpaySignature: response.razorpay_signature, idempotencyKey: key });
                                      checkout.paid = true; resolve();
                                    } catch { reject(new Error(`Payment could not be verified. Keep order ${orderId} and contact support before paying again.`)); }
                                  },
                                  modal: { ondismiss: () => reject(new Error('Payment cancelled. No tests were booked; your cart is saved.')) },
                                });
                                rzp.on('payment.failed', () => reject(new Error('Payment failed. Your cart is saved.')));
                                rzp.open();
                              });
                            }
                            await api.post(`/lab-tests/checkout/${orderId}/complete`);
                            toast({ title: 'Lab booking submitted', description: 'Payment confirmed. Awaiting the lab’s confirmation of your requested time.' });
                            clearCart(); checkoutOrderRef.current = null; setShowBookDialog(false); await fetchMyLabTests();
                          } catch (error: any) {
                            toast({ title: 'Checkout not completed', description: error.response?.data?.message || error.message || 'Please try again.', variant: 'destructive' });
                          } finally { setIsBooking(false); checkoutInFlightRef.current = false; }
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
        <motion.div variants={item as unknown as Variants} className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
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
          <motion.div whileHover={{ y: -4, scale: 1.02 }} transition={{ type: 'spring', stiffness: 300 }}>
          <Card className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 cursor-pointer hover:shadow-lg transition-shadow" onClick={() => setFilterStatus('other')}>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-gray-500 dark:text-gray-400">{statusCounts.other}</div>
                <div className="text-sm text-gray-600 dark:text-slate-400">Cancelled / No-Show</div>
              </div>
            </CardContent>
          </Card>
          </motion.div>
        </motion.div>

        {/* Controls */}
        <motion.div variants={item as unknown as Variants}>
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
                <Button
                  variant={filterStatus === 'other' ? 'default' : 'outline'}
                  onClick={() => setFilterStatus('other')}
                  size="sm"
                >
                  Cancelled / No-Show
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
        </motion.div>

        {/* Available Tests to Book */}
        {searchTerm && (
          <motion.div variants={item as unknown as Variants} className="mb-6">
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
        <motion.div variants={item as unknown as Variants}>
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
          {filteredTests.slice((historyPage - 1) * 20, historyPage * 20).map((test) => (
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
                      <p className="text-gray-600 dark:text-slate-400 mt-1">{test.notes.replace(/\[Req:[^\]]*\]/g, '').trim() || 'No additional notes'}</p>
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

        {filteredTests.length > 20 && <div className="flex items-center justify-between gap-3 py-4"><Button variant="outline" disabled={historyPage <= 1} onClick={() => setHistoryPage(page => page - 1)}>Previous</Button><span>Page {historyPage} of {Math.ceil(filteredTests.length / 20)}</span><Button variant="outline" disabled={historyPage * 20 >= filteredTests.length} onClick={() => setHistoryPage(page => page + 1)}>Next</Button></div>}
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
