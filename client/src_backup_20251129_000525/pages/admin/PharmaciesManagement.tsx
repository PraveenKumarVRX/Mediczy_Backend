import { useRef, useState } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Badge } from '../../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { parseExcelFile, downloadExcelTemplate } from '../../utils/excelParser';
import {
  Upload,
  Download,
  FileSpreadsheet,
  Search,
  Eye,
  Edit,
  Trash2,
  Pill,
  Mail,
  Phone,
  MapPin,
  Building,
  Clock,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

type CertificationStatus = 'active' | 'expired' | 'pending';

interface Certification {
  name: string;
  issuingBody?: string;
  validFrom?: string;
  validTo?: string;
  status: CertificationStatus;
}

interface PharmacyBranch {
  id: string;
  name: string;
  address: {
    street?: string;
    city: string;
    state: string;
    zipCode?: string;
  };
  email?: string;
  phoneNumber?: string;
  operatingHours?: string;
  is24x7?: boolean;
  homeDelivery?: boolean;
  eRxSupported?: boolean;
  rating?: number;
  status: 'active' | 'inactive';
  services?: string[];
}

interface PharmacyChain {
  id: string;
  name: string;
  headquarters: {
    city: string;
    state: string;
  };
  establishedYear?: number;
  certifications: Certification[];
  branches: PharmacyBranch[];
}

const samplePharmacyChains: PharmacyChain[] = [
  {
    id: 'apollo',
    name: 'Apollo Pharmacy',
    headquarters: { city: 'Hyderabad', state: 'Telangana' },
    establishedYear: 1987,
    certifications: [
      { name: 'ISO 9001', issuingBody: 'ISO', status: 'active' },
      { name: 'PCI Registered', issuingBody: 'Pharmacy Council of India', status: 'active' }
    ],
    branches: [
      {
        id: 'apollo-mum-001',
        name: 'Apollo Andheri East',
        address: { city: 'Mumbai', state: 'Maharashtra', street: 'Andheri-Kurla Road' },
        email: 'andheri@apollo.com',
        phoneNumber: '+91-22-5555-1001',
        operatingHours: '24x7',
        is24x7: true,
        homeDelivery: true,
        eRxSupported: true,
        rating: 4.6,
        status: 'active',
        services: ['Prescription', 'OTC', 'Vaccines']
      },
      {
        id: 'apollo-del-001',
        name: 'Apollo Connaught Place',
        address: { city: 'New Delhi', state: 'Delhi', street: 'Inner Circle' },
        email: 'cp@apollo.com',
        phoneNumber: '+91-11-5555-2001',
        operatingHours: '8 AM - 11 PM',
        is24x7: false,
        homeDelivery: true,
        eRxSupported: true,
        rating: 4.4,
        status: 'active',
        services: ['Prescription', 'OTC', 'Home Care']
      }
    ]
  },
  {
    id: 'medplus',
    name: 'MedPlus',
    headquarters: { city: 'Hyderabad', state: 'Telangana' },
    establishedYear: 2006,
    certifications: [
      { name: 'GPP Compliant', issuingBody: 'WHO', status: 'active' }
    ],
    branches: [
      {
        id: 'medplus-blr-001',
        name: 'MedPlus Indiranagar',
        address: { city: 'Bengaluru', state: 'Karnataka', street: '100 Feet Road' },
        email: 'indiranagar@medplus.com',
        phoneNumber: '+91-80-5555-3001',
        operatingHours: '7 AM - 11 PM',
        is24x7: false,
        homeDelivery: true,
        eRxSupported: true,
        rating: 4.2,
        status: 'active',
        services: ['Prescription', 'OTC']
      },
      {
        id: 'medplus-ch-001',
        name: 'MedPlus T Nagar',
        address: { city: 'Chennai', state: 'Tamil Nadu', street: 'Thyagaraya Rd' },
        phoneNumber: '+91-44-5555-3002',
        operatingHours: '24x7',
        is24x7: true,
        homeDelivery: true,
        eRxSupported: false,
        rating: 4.1,
        status: 'active',
        services: ['Prescription', 'OTC', 'Cosmetics']
      }
    ]
  },
  {
    id: '1mg',
    name: '1mg Pharmacy',
    headquarters: { city: 'Gurugram', state: 'Haryana' },
    establishedYear: 2015,
    certifications: [
      { name: 'ISO 9001', issuingBody: 'ISO', status: 'active' }
    ],
    branches: [
      {
        id: '1mg-pun-001',
        name: '1mg Kharadi',
        address: { city: 'Pune', state: 'Maharashtra', street: 'Nagar Road' },
        email: 'kharadi@1mg.com',
        phoneNumber: '+91-20-5555-4001',
        operatingHours: '9 AM - 10 PM',
        is24x7: false,
        homeDelivery: true,
        eRxSupported: true,
        rating: 4.3,
        status: 'active',
        services: ['Prescription', 'OTC', 'Home Delivery']
      }
    ]
  }
];

const getCertificationBadge = (cert: string) => {
  const key = cert.toLowerCase();
  if (key.includes('iso')) return { className: 'bg-blue-500/10 border-blue-500/20 text-blue-700', label: cert };
  if (key.includes('pci')) return { className: 'bg-purple-500/10 border-purple-500/20 text-purple-700', label: cert };
  if (key.includes('gpp') || key.includes('who')) return { className: 'bg-green-500/10 border-green-500/20 text-green-700', label: cert };
  return { className: 'bg-gray-500/10 border-gray-500/20 text-gray-700', label: cert };
};

const renderStars = (rating?: number) => {
  const value = rating ?? 0;
  return Array.from({ length: 5 }, (_, i) => (
    <span key={i} className={`text-sm ${i < Math.floor(value) ? 'text-yellow-400' : 'text-gray-300'}`}>★</span>
  ));
};

const PharmaciesManagement = () => {
  const [activeTab, setActiveTab] = useState('chains');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ message: string; count?: number } | null>(null);
  const [jsonInput, setJsonInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [serviceFilter, setServiceFilter] = useState<'all' | 'delivery' | 'erx' | '24x7'>('all');
  const [certFilter, setCertFilter] = useState<'all' | string>('all');
  const [expandedChains, setExpandedChains] = useState<Set<string>>(new Set());

  const chains = samplePharmacyChains;

  const toggleChainExpansion = (chainId: string) => {
    setExpandedChains(prev => {
      const next = new Set(prev);
      if (next.has(chainId)) next.delete(chainId); else next.add(chainId);
      return next;
    });
  };

  const filteredChains = chains.filter(chain => {
    const matchesSearch = searchTerm
      ? chain.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        chain.headquarters.city.toLowerCase().includes(searchTerm.toLowerCase()) ||
        chain.branches.some(b =>
          b.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          b.address.city.toLowerCase().includes(searchTerm.toLowerCase())
        )
      : true;

    const matchesStatus = statusFilter === 'all'
      ? true
      : chain.branches.some(b => b.status === statusFilter);

    const matchesService = serviceFilter === 'all' ? true : chain.branches.some(b => {
      if (serviceFilter === 'delivery') return !!b.homeDelivery;
      if (serviceFilter === 'erx') return !!b.eRxSupported;
      if (serviceFilter === '24x7') return !!b.is24x7;
      return true;
    });

    const matchesCert = certFilter === 'all' ? true : chain.certifications.some(c => c.name === certFilter);

    return matchesSearch && matchesStatus && matchesService && matchesCert;
  });

  const uniqueCerts = Array.from(new Set(chains.flatMap(c => c.certifications.map(x => x.name))));

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setError(null);
      setResult(null);
      const rows = await parseExcelFile(file);
      setResult({ message: 'Excel parsed successfully (demo)', count: rows.length });
    } catch (err: any) {
      setError('Excel upload failed');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleJsonUpload = () => {
    try {
      setError(null);
      const data = JSON.parse(jsonInput);
      const count = Array.isArray(data) ? data.length : 1;
      setResult({ message: 'JSON parsed successfully (demo)', count });
      setJsonInput('');
    } catch (e) {
      setError('Invalid JSON');
    }
  };

  const downloadTemplate = () => {
    const headers = [
      'ChainName', 'BranchName', 'Email', 'PhoneNumber', 'Street', 'City', 'State', 'ZipCode',
      'OperatingHours', 'Is24x7', 'HomeDelivery', 'ERxSupported', 'Services'
    ];
    const sample = [{
      ChainName: 'Apollo Pharmacy', BranchName: 'Apollo Andheri East', Email: 'andheri@apollo.com',
      PhoneNumber: '+91-22-5555-1001', Street: 'Andheri-Kurla Road', City: 'Mumbai', State: 'Maharashtra', ZipCode: '400069',
      OperatingHours: '24x7', Is24x7: true, HomeDelivery: true, ERxSupported: true, Services: 'Prescription, OTC, Vaccines'
    }];
    downloadExcelTemplate(headers, 'pharmacy_branches', sample);
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold">Pharmacies Management</h2>
            <p className="text-muted-foreground">Manage pharmacy chains, branches and certifications</p>
          </div>
          <Button onClick={downloadTemplate} variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Download Excel Template
          </Button>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">{error}</div>
        )}
        {result && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-green-800">
            {result.message} {result.count !== undefined && `(${result.count} records)`}
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="chains">Chains</TabsTrigger>
            <TabsTrigger value="list">List View</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="certs">Certifications</TabsTrigger>
            <TabsTrigger value="excel">Excel Upload</TabsTrigger>
            <TabsTrigger value="json">JSON Upload</TabsTrigger>
          </TabsList>

          <TabsContent value="chains">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredChains.map(chain => (
                <Card key={chain.id} className="overflow-hidden">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="p-2 rounded-full bg-emerald-500/10">
                          <Pill className="h-4 w-4 text-emerald-600" />
                        </div>
                        <span>{chain.name}</span>
                      </div>
                      <Badge variant="outline" className="bg-blue-500/10 border-blue-500/20 text-blue-700">
                        {chain.branches.length} branches
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Building className="h-4 w-4" />
                      HQ: {chain.headquarters.city}, {chain.headquarters.state}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {chain.certifications.map((c, i) => {
                        const badge = getCertificationBadge(c.name);
                        return (
                          <Badge key={i} variant="outline" className={`text-xs ${badge.className}`}>{badge.label}</Badge>
                        );
                      })}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline">
                        <Eye className="h-3 w-3 mr-2" /> View
                      </Button>
                      <Button size="sm" variant="outline">
                        <Edit className="h-3 w-3 mr-2" /> Edit
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="list">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Pill className="h-5 w-5 text-emerald-600" />
                  Pharmacy Networks ({filteredChains.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col lg:flex-row gap-4 mb-6">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Search chains or branches..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10" />
                  </div>
                  <Select value={statusFilter} onValueChange={v => setStatusFilter(v as any)}>
                    <SelectTrigger className="w-full lg:w-[180px]"><SelectValue placeholder="Status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={serviceFilter} onValueChange={v => setServiceFilter(v as any)}>
                    <SelectTrigger className="w-full lg:w-[200px]"><SelectValue placeholder="Service" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Services</SelectItem>
                      <SelectItem value="delivery">Home Delivery</SelectItem>
                      <SelectItem value="erx">eRx Supported</SelectItem>
                      <SelectItem value="24x7">24x7</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={certFilter} onValueChange={v => setCertFilter(v as any)}>
                    <SelectTrigger className="w-full lg:w-[220px]"><SelectValue placeholder="Certification" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Certifications</SelectItem>
                      {uniqueCerts.map(c => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[48px]"></TableHead>
                        <TableHead>Chain</TableHead>
                        <TableHead>Headquarters</TableHead>
                        <TableHead>Branches</TableHead>
                        <TableHead>Certifications</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredChains.map(chain => (
                        <>
                          <TableRow key={chain.id} className="bg-muted/30">
                            <TableCell>
                              <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => toggleChainExpansion(chain.id)}>
                                {expandedChains.has(chain.id) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                              </Button>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <div className="p-2 rounded-full bg-emerald-500/10"><Pill className="h-4 w-4 text-emerald-600" /></div>
                                <div>
                                  <div className="font-medium">{chain.name}</div>
                                  <div className="text-xs text-muted-foreground">Established {chain.establishedYear}</div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Building className="h-4 w-4" />
                                {chain.headquarters.city}, {chain.headquarters.state}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="bg-blue-500/10 border-blue-500/20 text-blue-700">{chain.branches.length} total</Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {chain.certifications.map((c, i) => {
                                  const badge = getCertificationBadge(c.name);
                                  return <Badge key={i} variant="outline" className={`text-xs ${badge.className}`}>{badge.label}</Badge>;
                                })}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Button size="sm" variant="outline" className="h-8 w-8 p-0"><Eye className="h-3 w-3" /></Button>
                                <Button size="sm" variant="outline" className="h-8 w-8 p-0"><Edit className="h-3 w-3" /></Button>
                                <Button size="sm" variant="outline" className="h-8 w-8 p-0 text-red-600 hover:text-red-700"><Trash2 className="h-3 w-3" /></Button>
                              </div>
                            </TableCell>
                          </TableRow>

                          {expandedChains.has(chain.id) && chain.branches.map(branch => (
                            <TableRow key={branch.id}>
                              <TableCell></TableCell>
                              <TableCell colSpan={2}>
                                <div className="space-y-1">
                                  <div className="font-medium">{branch.name}</div>
                                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <MapPin className="h-3 w-3" />
                                    {branch.address.street ? `${branch.address.street}, ` : ''}{branch.address.city}, {branch.address.state}
                                  </div>
                                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                    {branch.email && (<span className="flex items-center gap-1"><Mail className="h-3 w-3" />{branch.email}</span>)}
                                    {branch.phoneNumber && (<span className="flex items-center gap-1"><Phone className="h-3 w-3" />{branch.phoneNumber}</span>)}
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <Clock className="h-3 w-3" /> {branch.operatingHours || '—'}
                                </div>
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {branch.is24x7 && <Badge variant="outline" className="text-xs bg-amber-500/10 border-amber-500/20 text-amber-700">24x7</Badge>}
                                  {branch.homeDelivery && <Badge variant="outline" className="text-xs bg-emerald-500/10 border-emerald-500/20 text-emerald-700">Home Delivery</Badge>}
                                  {branch.eRxSupported && <Badge variant="outline" className="text-xs bg-indigo-500/10 border-indigo-500/20 text-indigo-700">eRx</Badge>}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="space-y-1">
                                  <Badge variant={branch.status === 'active' ? 'default' : 'secondary'} className={branch.status === 'active' ? 'bg-green-500/10 border-green-500/20 text-green-700' : 'bg-gray-500/10 border-gray-500/20 text-gray-700'}>
                                    {branch.status === 'active' ? 'Active' : 'Inactive'}
                                  </Badge>
                                  <div className="flex items-center gap-1">{renderStars(branch.rating)}{branch.rating && (<span className="text-sm text-muted-foreground ml-1">{branch.rating}/5</span>)}</div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Button size="sm" variant="outline" className="h-8 w-8 p-0"><Eye className="h-3 w-3" /></Button>
                                  <Button size="sm" variant="outline" className="h-8 w-8 p-0"><Edit className="h-3 w-3" /></Button>
                                  <Button size="sm" variant="outline" className="h-8 w-8 p-0 text-red-600 hover:text-red-700"><Trash2 className="h-3 w-3" /></Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analytics">
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader><CardTitle>Total Chains</CardTitle></CardHeader>
                <CardContent><div className="text-2xl font-bold">{chains.length}</div></CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Total Branches</CardTitle></CardHeader>
                <CardContent><div className="text-2xl font-bold">{chains.reduce((a,c)=>a+c.branches.length,0)}</div></CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>24x7 Coverage</CardTitle></CardHeader>
                <CardContent><div className="text-2xl font-bold">{chains.reduce((a,c)=>a+c.branches.filter(b=>b.is24x7).length,0)}</div></CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Home Delivery</CardTitle></CardHeader>
                <CardContent><div className="text-2xl font-bold">{chains.reduce((a,c)=>a+c.branches.filter(b=>b.homeDelivery).length,0)}</div></CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="certs">
            <Card>
              <CardHeader><CardTitle>Certifications</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {chains.map(chain => (
                    <div key={chain.id} className="rounded-md border p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="p-2 rounded-full bg-emerald-500/10"><Pill className="h-4 w-4 text-emerald-600" /></div>
                          <div className="font-medium">{chain.name}</div>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {chain.certifications.map((c,i)=>{
                            const badge = getCertificationBadge(c.name);
                            return <Badge key={i} variant="outline" className={`text-xs ${badge.className}`}>{badge.label}</Badge>;
                          })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="excel">
            <Card>
              <CardHeader><CardTitle>Bulk Upload via Excel</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">Upload an Excel file (.xlsx, .xls) with pharmacy branch records.</p>
                <div className="flex items-center gap-4">
                  <Input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleExcelUpload} />
                  <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                    <FileSpreadsheet className="mr-2 h-4 w-4" /> Choose File
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="json">
            <Card>
              <CardHeader><CardTitle>Bulk Upload via JSON</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">Paste JSON array of pharmacy branches or chains.</p>
                <Textarea value={jsonInput} onChange={e=>setJsonInput(e.target.value)} placeholder='[{"ChainName":"Apollo Pharmacy","BranchName":"Apollo Andheri East", ...}]' className="h-56 font-mono text-sm" />
                <div className="flex items-center gap-2">
                  <Button onClick={handleJsonUpload}><Upload className="mr-2 h-4 w-4" /> Upload JSON</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
};

export default PharmaciesManagement;
