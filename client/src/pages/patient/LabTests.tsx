import { useState } from 'react';
import { FlaskConical, Calendar, MapPin, Download, Plus, Search, Filter } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import MainLayout from '@/components/layout/MainLayout';

interface LabTest {
  id: string;
  testName: string;
  category: string;
  orderedBy: string;
  orderDate: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  sampleCollected: boolean;
  results?: string;
  reportUrl?: string;
  estimatedDate?: string;
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
  const [tests, setTests] = useState<LabTest[]>([
    {
      id: '1',
      testName: 'Complete Blood Count (CBC)',
      category: 'Hematology',
      orderedBy: 'Dr. Sharma',
      orderDate: '2024-01-15',
      status: 'completed',
      sampleCollected: true,
      results: 'All parameters within normal range',
      reportUrl: '#'
    },
    {
      id: '2',
      testName: 'Lipid Profile',
      category: 'Biochemistry',
      orderedBy: 'Dr. Patel',
      orderDate: '2024-01-20',
      status: 'in_progress',
      sampleCollected: true,
      estimatedDate: '2024-01-22'
    },
    {
      id: '3',
      testName: 'HbA1c (Glycated Hemoglobin)',
      category: 'Diabetes',
      orderedBy: 'Dr. Kumar',
      orderDate: '2024-01-18',
      status: 'pending',
      sampleCollected: false,
      estimatedDate: '2024-01-25'
    }
  ]);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [showBookDialog, setShowBookDialog] = useState(false);
  const [selectedTest, setSelectedTest] = useState<AvailableTest | null>(null);
  const [searchCategory, setSearchCategory] = useState<string>('all');

  const filteredTests = tests.filter(test => 
    (filterStatus === 'all' || test.status === filterStatus) &&
    (test.testName.toLowerCase().includes(searchTerm.toLowerCase()) ||
     test.category.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const filteredAvailableTests = availableTests.filter(test =>
    (searchCategory === 'all' || test.category === searchCategory) &&
    (test.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
     test.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
     test.category.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const categories = ['all', ...Array.from(new Set(availableTests.map(t => t.category)))];

  const handleBookTest = (test: AvailableTest) => {
    setSelectedTest(test);
    setShowBookDialog(true);
  };

  const getStatusColor = (status: string) => {
    const colors = {
      pending: 'bg-yellow-100 text-yellow-800',
      in_progress: 'bg-blue-100 text-blue-800',
      completed: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800'
    };
    return colors[status as keyof typeof colors];
  };

  const statusCounts = {
    total: tests.length,
    pending: tests.filter(t => t.status === 'pending').length,
    in_progress: tests.filter(t => t.status === 'in_progress').length,
    completed: tests.filter(t => t.status === 'completed').length
  };

  return (
      <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500 px-4 md:px-6 py-6">
        {/* Header */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-800 via-slate-900 to-slate-800 p-6 md:p-8 text-white shadow-2xl">
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
            <Dialog open={showBookDialog} onOpenChange={setShowBookDialog}>
              <DialogTrigger asChild>
                <Button className="bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-white shadow-lg shadow-teal-500/30">
                  <Plus className="h-4 w-4 mr-2" />
                  Book Lab Test
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Book Lab Test</DialogTitle>
                  <DialogDescription>
                    {selectedTest ? `Book ${selectedTest.name}` : 'Schedule a new laboratory test'}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  {selectedTest && (
                    <Card className="bg-teal-50 border-teal-200">
                      <CardContent className="pt-4">
                        <h4 className="font-semibold text-teal-900 mb-1">{selectedTest.name}</h4>
                        <p className="text-sm text-teal-700 mb-2">{selectedTest.description}</p>
                        <div className="flex justify-between text-sm">
                          <span>Price: <strong>{selectedTest.price}</strong></span>
                          <span>Results: <strong>{selectedTest.turnaroundTime}</strong></span>
                        </div>
                        {selectedTest.preparationRequired && (
                          <Badge variant="secondary" className="mt-2">⚠️ Fasting Required</Badge>
                        )}
                      </CardContent>
                    </Card>
                  )}
                  <div>
                    <Label>Test Name</Label>
                    <Input 
                      placeholder="e.g., Blood Sugar, Thyroid Profile" 
                      defaultValue={selectedTest?.name || ''}
                    />
                  </div>
                  <div>
                    <Label>Preferred Date</Label>
                    <Input type="date" />
                  </div>
                  <div>
                    <Label>Preferred Location</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Select collection location" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="home">🏠 Home Collection</SelectItem>
                        <SelectItem value="lab1">🏥 City Lab - Connaught Place</SelectItem>
                        <SelectItem value="lab2">🏥 MediPath - Lajpat Nagar</SelectItem>
                        <SelectItem value="lab3">🏥 Dr. Lal PathLabs - Rohini</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Special Instructions</Label>
                    <Textarea placeholder="Any fasting requirements or special notes..." />
                  </div>
                  <Button className="w-full bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700">
                    Confirm Booking
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-gray-900">{statusCounts.total}</div>
                <div className="text-sm text-gray-600">Total Tests</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-yellow-600">{statusCounts.pending}</div>
                <div className="text-sm text-gray-600">Pending</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600">{statusCounts.in_progress}</div>
                <div className="text-sm text-gray-600">In Progress</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-green-600">{statusCounts.completed}</div>
                <div className="text-sm text-gray-600">Completed</div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Controls */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search tests by name, category, or description..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={searchCategory} onValueChange={setSearchCategory}>
                  <SelectTrigger className="w-full md:w-[200px]">
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(cat => (
                      <SelectItem key={cat} value={cat}>
                        {cat === 'all' ? 'All Categories' : cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2 flex-wrap">
                <span className="text-sm text-gray-500 my-auto">My Tests:</span>
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

        {/* Available Tests to Book */}
        {searchTerm && (
          <div className="mb-6">
            <h2 className="text-xl font-semibold mb-4">Available Tests ({filteredAvailableTests.length})</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredAvailableTests.slice(0, 12).map((test) => (
                <Card key={test.id} className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => handleBookTest(test)}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-base mb-1">{test.name}</CardTitle>
                        <Badge variant="outline" className="text-xs">{test.category}</Badge>
                      </div>
                      <FlaskConical className="h-6 w-6 text-teal-600" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-gray-600 mb-3">{test.description}</p>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Price:</span>
                        <span className="font-semibold text-teal-600">{test.price}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Results in:</span>
                        <span className="font-medium">{test.turnaroundTime}</span>
                      </div>
                      {test.preparationRequired && (
                        <Badge variant="secondary" className="text-xs">Fasting Required</Badge>
                      )}
                    </div>
                    <Button className="w-full mt-4 bg-teal-500 hover:bg-teal-600" size="sm">
                      <Plus className="h-4 w-4 mr-1" />
                      Book Test
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
            {filteredAvailableTests.length > 12 && (
              <p className="text-center text-sm text-gray-500 mt-4">
                Showing 12 of {filteredAvailableTests.length} tests. Refine your search for more specific results.
              </p>
            )}
          </div>
        )}

        {/* My Booked Tests */}
        <h2 className="text-xl font-semibold mb-4">My Lab Tests ({filteredTests.length})</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredTests.map((test) => (
            <Card key={test.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg mb-2">{test.testName}</CardTitle>
                    <CardDescription className="flex items-center gap-2">
                      <Badge variant="outline">{test.category}</Badge>
                      <Badge className={getStatusColor(test.status)}>
                        {test.status.replace('_', ' ')}
                      </Badge>
                    </CardDescription>
                  </div>
                  <FlaskConical className="h-8 w-8 text-cyan-600" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center text-sm text-gray-600">
                    <Calendar className="h-4 w-4 mr-2" />
                    <span>Ordered: {new Date(test.orderDate).toLocaleDateString()}</span>
                  </div>
                  <div className="text-sm text-gray-600">
                    <span className="font-medium">Ordered by:</span> {test.orderedBy}
                  </div>
                  <div className="text-sm">
                    <span className="font-medium">Sample Status:</span>{' '}
                    <span className={test.sampleCollected ? 'text-green-600' : 'text-yellow-600'}>
                      {test.sampleCollected ? 'Collected' : 'Not Collected'}
                    </span>
                  </div>
                  {test.estimatedDate && (
                    <div className="text-sm text-gray-600">
                      <span className="font-medium">Estimated Date:</span>{' '}
                      {new Date(test.estimatedDate).toLocaleDateString()}
                    </div>
                  )}
                  {test.results && (
                    <div className="p-3 bg-green-50 rounded-md text-sm">
                      <span className="font-medium text-green-800">Results:</span>
                      <p className="text-gray-700 mt-1">{test.results}</p>
                    </div>
                  )}
                  {test.status === 'completed' && test.reportUrl && (
                    <Button className="w-full" variant="outline">
                      <Download className="h-4 w-4 mr-2" />
                      Download Report
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {filteredTests.length === 0 && (
          <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
            <CardContent className="py-12">
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-slate-100 dark:bg-slate-700/50 flex items-center justify-center">
                  <FlaskConical className="h-8 w-8 text-slate-400" />
                </div>
                <p className="text-slate-500 dark:text-slate-400">No lab tests found</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
  );
};

export default LabTests;
