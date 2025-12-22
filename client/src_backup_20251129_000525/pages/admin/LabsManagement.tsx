import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Badge } from "../../components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "../../components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../../components/ui/dialog";
import { Checkbox } from "../../components/ui/checkbox";
import AdminLayout from '../../components/layout/AdminLayout';
import { 
  Download, Upload, Plus, FileSpreadsheet, UserPlus,
  Search, Eye, Edit, Trash2, MoreVertical, Star,
  ChevronLeft, ChevronRight, FlaskConical, Building2,
  MapPin, Award, Clock, Calendar, Users, Activity,
  TrendingUp, Microscope, Shield, CheckCircle2, AlertCircle,
  ChevronDown, ChevronUp, Home, Phone, Mail
} from 'lucide-react';
import { downloadExcelTemplate } from '../../utils/excelParser';
import api from '../../utils/api';
import axios from 'axios';

// Enhanced Lab Chain Management Interface
interface LabChain {
  id: string;
  brandName: string;
  chainType: 'Corporate' | 'Franchise' | 'Independent';
  headquarters: {
    address: string;
    city: string;
    state: string;
    pincode: string;
    phone: string;
    email: string;
  };
  totalBranches: number;
  activeServices: string[];
  certifications: Certification[];
  establishedYear: number;
  annualRevenue?: string;
  ceoName?: string;
  status: 'Active' | 'Inactive' | 'Under Review' | 'Suspended';
  branches: LabBranch[];
}

interface LabBranch {
  id: string;
  branchName: string;
  branchCode: string;
  address: {
    street: string;
    area: string;
    city: string;
    state: string;
    pincode: string;
    landmark?: string;
  };
  contact: {
    phone: string;
    email: string;
    managerName: string;
    managerPhone: string;
  };
  services: LabService[];
  operatingHours: {
    weekdays: string;
    weekends: string;
    holidays: string;
  };
  facilities: {
    homeCollection: boolean;
    onlineReports: boolean;
    emergencyServices: boolean;
    parkingAvailable: boolean;
    wheelchairAccessible: boolean;
    pathologyLab: boolean;
    radiologyCenter: boolean;
    cardiacCenter: boolean;
  };
  staffCount: {
    doctors: number;
    technicians: number;
    nurses: number;
    supportStaff: number;
  };
  equipment: LabEquipment[];
  certifications: Certification[];
  performanceMetrics: {
    monthlyTests: number;
    averageReportTime: string;
    customerRating: number;
    reviewCount: number;
  };
  status: 'Active' | 'Inactive' | 'Maintenance' | 'Renovation';
  establishedDate: string;
  lastInspection: string;
}

interface Certification {
  id: string;
  type: 'NABL' | 'ISO 9001' | 'ISO 15189' | 'CAP' | 'JCI' | 'NABH' | 'ICMR' | 'DSIR';
  certificateNumber: string;
  issuedBy: string;
  issueDate: string;
  expiryDate: string;
  scope: string[];
  status: 'Valid' | 'Expired' | 'Under Renewal' | 'Suspended';
  documentUrl?: string;
}

interface LabService {
  id: string;
  category: 'Pathology' | 'Radiology' | 'Cardiology' | 'Microbiology' | 'Biochemistry' | 'Hematology' | 'Immunology' | 'Molecular Diagnostics' | 'Histopathology' | 'Cytology';
  serviceName: string;
  testCode: string;
  price: number;
  reportTime: string;
  sampleType: string;
  prerequisites?: string;
  available: boolean;
}

interface LabEquipment {
  id: string;
  name: string;
  model: string;
  manufacturer: string;
  category: 'Analyzer' | 'Scanner' | 'Microscope' | 'X-Ray' | 'CT' | 'MRI' | 'Ultrasound' | 'ECG' | 'Other';
  installationDate: string;
  lastMaintenance: string;
  nextMaintenance: string;
  status: 'Operational' | 'Under Maintenance' | 'Out of Service' | 'Calibration Required';
  warrantyExpiry?: string;
}

// Sample comprehensive lab chain data
const sampleLabChains: LabChain[] = [
  {
    id: 'CHAIN001',
    brandName: 'PathLab India',
    chainType: 'Corporate',
    headquarters: {
      address: '123 Medical Plaza, Sector 18',
      city: 'Gurugram',
      state: 'Haryana',
      pincode: '122015',
      phone: '+91-124-4567890',
      email: 'corporate@pathlab.com'
    },
    totalBranches: 1200,
    activeServices: ['Pathology', 'Radiology', 'Cardiology', 'Molecular Diagnostics'],
    certifications: [
      {
        id: 'CERT001',
        type: 'NABL',
        certificateNumber: 'TC-3456',
        issuedBy: 'National Accreditation Board for Testing and Calibration Laboratories',
        issueDate: '2023-01-15',
        expiryDate: '2026-01-14',
        scope: ['Clinical Pathology', 'Clinical Biochemistry', 'Microbiology'],
        status: 'Valid'
      },
      {
        id: 'CERT002',
        type: 'ISO 15189',
        certificateNumber: 'ISO-15189-2023-PLI',
        issuedBy: 'Bureau of Indian Standards',
        issueDate: '2023-03-10',
        expiryDate: '2026-03-09',
        scope: ['Medical Laboratory Quality Management'],
        status: 'Valid'
      }
    ],
    establishedYear: 1995,
    annualRevenue: '₹2,500 Crores',
    ceoName: 'Dr. Rajesh Kumar',
    status: 'Active',
    branches: [
      {
        id: 'BR001',
        branchName: 'PathLab Central Delhi',
        branchCode: 'PL-DEL-001',
        address: {
          street: '45, Connaught Place',
          area: 'Central Delhi',
          city: 'New Delhi',
          state: 'Delhi',
          pincode: '110001',
          landmark: 'Near Metro Station'
        },
        contact: {
          phone: '+91-11-23456789',
          email: 'delhi.central@pathlab.com',
          managerName: 'Dr. Priya Sharma',
          managerPhone: '+91-9876543210'
        },
        services: [
          {
            id: 'SRV001',
            category: 'Pathology',
            serviceName: 'Complete Blood Count (CBC)',
            testCode: 'CBC001',
            price: 300,
            reportTime: '2-4 hours',
            sampleType: 'Blood',
            available: true
          },
          {
            id: 'SRV002',
            category: 'Radiology',
            serviceName: 'Chest X-Ray',
            testCode: 'XR001',
            price: 500,
            reportTime: '1 hour',
            sampleType: 'NA',
            available: true
          }
        ],
        operatingHours: {
          weekdays: '7:00 AM - 10:00 PM',
          weekends: '8:00 AM - 8:00 PM',
          holidays: '9:00 AM - 5:00 PM'
        },
        facilities: {
          homeCollection: true,
          onlineReports: true,
          emergencyServices: true,
          parkingAvailable: true,
          wheelchairAccessible: true,
          pathologyLab: true,
          radiologyCenter: true,
          cardiacCenter: false
        },
        staffCount: {
          doctors: 8,
          technicians: 15,
          nurses: 12,
          supportStaff: 20
        },
        equipment: [
          {
            id: 'EQ001',
            name: 'Automated Blood Cell Counter',
            model: 'Sysmex XN-1000',
            manufacturer: 'Sysmex Corporation',
            category: 'Analyzer',
            installationDate: '2022-06-15',
            lastMaintenance: '2024-01-15',
            nextMaintenance: '2024-04-15',
            status: 'Operational',
            warrantyExpiry: '2025-06-14'
          }
        ],
        certifications: [
          {
            id: 'BCERT001',
            type: 'NABL',
            certificateNumber: 'TC-3456-DEL',
            issuedBy: 'NABL',
            issueDate: '2023-02-01',
            expiryDate: '2026-01-31',
            scope: ['Clinical Pathology', 'Radiology'],
            status: 'Valid'
          }
        ],
        performanceMetrics: {
          monthlyTests: 25000,
          averageReportTime: '3.2 hours',
          customerRating: 4.7,
          reviewCount: 1250
        },
        status: 'Active',
        establishedDate: '2020-03-15',
        lastInspection: '2024-01-10'
      }
    ]
  },
  {
    id: 'CHAIN002',
    brandName: 'Dr. Lal PathLabs',
    chainType: 'Corporate',
    headquarters: {
      address: 'Block E, Sector 18, Rohini',
      city: 'New Delhi',
      state: 'Delhi',
      pincode: '110085',
      phone: '+91-11-39885050',
      email: 'info@lalpathlabs.com'
    },
    totalBranches: 3500,
    activeServices: ['Pathology', 'Radiology', 'Molecular Diagnostics', 'Histopathology'],
    certifications: [
      {
        id: 'CERT003',
        type: 'ISO 15189',
        certificateNumber: 'ISO-LPATH-2023',
        issuedBy: 'TUV SUD',
        issueDate: '2023-05-20',
        expiryDate: '2026-05-19',
        scope: ['Medical Laboratory Management'],
        status: 'Valid'
      },
      {
        id: 'CERT004',
        type: 'CAP',
        certificateNumber: 'CAP-8901234',
        issuedBy: 'College of American Pathologists',
        issueDate: '2023-08-01',
        expiryDate: '2025-07-31',
        scope: ['Clinical Laboratory Improvement'],
        status: 'Valid'
      }
    ],
    establishedYear: 1949,
    annualRevenue: '₹1,800 Crores',
    ceoName: 'Dr. Arvind Lal',
    status: 'Active',
    branches: []
  },
  {
    id: 'CHAIN003',
    brandName: 'Thyrocare Technologies',
    chainType: 'Corporate',
    headquarters: {
      address: 'D-37/1, TTC Industrial Area, Turbhe MIDC',
      city: 'Navi Mumbai',
      state: 'Maharashtra',
      pincode: '400705',
      phone: '+91-22-30921000',
      email: 'info@thyrocare.com'
    },
    totalBranches: 2000,
    activeServices: ['Pathology', 'Preventive Healthcare', 'Molecular Diagnostics'],
    certifications: [
      {
        id: 'CERT005',
        type: 'NABL',
        certificateNumber: 'TC-5678',
        issuedBy: 'NABL',
        issueDate: '2023-04-01',
        expiryDate: '2026-03-31',
        scope: ['Clinical Biochemistry', 'Immunology'],
        status: 'Valid'
      }
    ],
    establishedYear: 1996,
    annualRevenue: '₹600 Crores',
    ceoName: 'Dr. Arokiaswamy Velumani',
    status: 'Active',
    branches: []
  },
  {
    id: 'CHAIN004',
    brandName: 'Metropolis Healthcare',
    chainType: 'Corporate',
    headquarters: {
      address: '250-D, Udyog Vihar Phase IV',
      city: 'Gurugram',
      state: 'Haryana',
      pincode: '122015',
      phone: '+91-124-6601000',
      email: 'contact@metropolisindia.com'
    },
    totalBranches: 2200,
    activeServices: ['Pathology', 'Radiology', 'Cardiology', 'Genomics'],
    certifications: [
      {
        id: 'CERT006',
        type: 'ISO 9001',
        certificateNumber: 'ISO-9001-METRO',
        issuedBy: 'DNV GL',
        issueDate: '2023-06-15',
        expiryDate: '2026-06-14',
        scope: ['Quality Management Systems'],
        status: 'Valid'
      },
      {
        id: 'CERT007',
        type: 'JCI',
        certificateNumber: 'JCI-METRO-2023',
        issuedBy: 'Joint Commission International',
        issueDate: '2023-09-01',
        expiryDate: '2026-08-31',
        scope: ['Patient Safety and Quality'],
        status: 'Valid'
      }
    ],
    establishedYear: 1980,
    annualRevenue: '₹900 Crores',
    ceoName: 'Ms. Ameera Shah',
    status: 'Active',
    branches: []
  },
  {
    id: 'CHAIN005',
    brandName: 'SRL Diagnostics',
    chainType: 'Corporate',
    headquarters: {
      address: 'Plot No. 5, Sector 18A, Gurgaon',
      city: 'Gurugram',
      state: 'Haryana',
      pincode: '122015',
      phone: '+91-124-4982000',
      email: 'customercare@srl.in'
    },
    totalBranches: 1000,
    activeServices: ['Pathology', 'Radiology', 'Molecular Diagnostics', 'Cytogenetics'],
    certifications: [
      {
        id: 'CERT008',
        type: 'NABH',
        certificateNumber: 'NABH-SRL-2023',
        issuedBy: 'National Accreditation Board for Hospitals',
        issueDate: '2023-07-01',
        expiryDate: '2026-06-30',
        scope: ['Diagnostic Services'],
        status: 'Valid'
      }
    ],
    establishedYear: 1995,
    annualRevenue: '₹750 Crores',
    ceoName: 'Dr. Arindam Haldar',
    status: 'Active',
    branches: []
  }
];

const LabsManagement = () => {
  // Form and upload state
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ message: string; count?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jsonInput, setJsonInput] = useState('');
  const [activeTab, setActiveTab] = useState('chains');
  const [selectedChain, setSelectedChain] = useState<LabChain | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<LabBranch | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const token = localStorage.getItem('adminToken');

  // List view state
  const [labChains, setLabChains] = useState<LabChain[]>(sampleLabChains);
  const [searchQuery, setSearchQuery] = useState('');
  const [chainTypeFilter, setChainTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [certificationFilter, setCertificationFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Dialog states
  const [showChainDialog, setShowChainDialog] = useState(false);
  const [showBranchDialog, setShowBranchDialog] = useState(false);
  const [showCertificationDialog, setShowCertificationDialog] = useState(false);
  const [expandedChains, setExpandedChains] = useState<Set<string>>(new Set());

  // New chain form state
  const [newChain, setNewChain] = useState({
    brandName: '',
    chainType: 'Corporate' as const,
    headquarters: {
      address: '',
      city: '',
      state: '',
      pincode: '',
      phone: '',
      email: ''
    },
    establishedYear: new Date().getFullYear(),
    ceoName: '',
    annualRevenue: ''
  });

  // Fetch lab chains on component mount
  useEffect(() => {
    fetchLabChains();
  }, [currentPage]);

  const fetchLabChains = async () => {
    try {
      setLoading(true);
      const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
      const { data } = await axios.get(`${apiBaseUrl.replace('/api', '')}/api/clinics?category=lab&limit=1000`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Transform clinic data to match LabChain interface
      const transformedData = (data.data || []).map((clinic: any) => {
        const services = (clinic.services || '').split(',').map((s: string) => s.trim()).filter(Boolean);
        const displayName = clinic.areaName && clinic.areaName !== clinic.name 
          ? `${clinic.name} - ${clinic.areaName}` 
          : clinic.name;
        const locationInfo = [clinic.city, clinic.state].filter(Boolean).join(', ');
        
        return ({
        id: clinic.id.toString(),
        brandName: displayName,
        chainType: 'Independent' as const,
        headquarters: {
          address: clinic.address || '',
          city: clinic.city || '',
          state: clinic.state || '',
          pincode: clinic.pincode || '',
          phone: clinic.phone || '',
          email: clinic.email || ''
        },
        totalBranches: 1,
        activeServices: services,
        certifications: [],
        establishedYear: new Date(clinic.createdAt).getFullYear(),
        ceoName: locationInfo,
        annualRevenue: '',
        status: 'Active' as const,
        branches: [{
          id: clinic.id.toString(),
          branchName: clinic.areaName || clinic.city || 'Main Branch',
          branchCode: `BR-${clinic.id}`,
          address: {
            street: clinic.address || '',
            area: clinic.areaName || '',
            city: clinic.city || '',
            state: clinic.state || '',
            pincode: clinic.pincode || '',
            landmark: ''
          },
          contact: {
            phone: clinic.phone || '',
            email: clinic.email || '',
            managerName: clinic.ownerName || '',
            managerPhone: clinic.phone || ''
          },
          services: services.map((s, idx) => ({
            id: `SRV${clinic.id}-${idx}`,
            category: 'Pathology' as const,
            serviceName: s,
            testCode: `TEST-${idx}`,
            price: 0,
            reportTime: '24 hours',
            sampleType: 'Blood',
            available: true
          })),
          operatingHours: {
            weekdays: '9:00 AM - 6:00 PM',
            weekends: '9:00 AM - 2:00 PM',
            holidays: 'Closed'
          },
          facilities: {
            homeCollection: false,
            onlineReports: false,
            emergencyServices: false,
            parkingAvailable: false,
            wheelchairAccessible: false,
            pathologyLab: true,
            radiologyCenter: false,
            cardiacCenter: false
          },
          staffCount: {
            doctors: 0,
            technicians: 0,
            nurses: 0,
            supportStaff: 0
          },
          equipment: [],
          certifications: [],
          performanceMetrics: {
            monthlyTests: 0,
            averageReportTime: '24 hours',
            customerRating: 0,
            reviewCount: 0
          },
          status: 'Active' as const,
          establishedDate: clinic.createdAt || new Date().toISOString(),
          lastInspection: clinic.updatedAt || new Date().toISOString()
        }]
      })});
      
      setLabChains(transformedData.length > 0 ? transformedData : sampleLabChains);
    } catch (err) {
      console.error('Failed to fetch labs from clinics table:', err);
      setLabChains(sampleLabChains);
    } finally {
      setLoading(false);
    }
  };

  // Filtered and paginated lab chains
  const filteredChains = useMemo(() => {
    return labChains.filter(chain => {
      const searchMatch = searchQuery === '' || 
        chain.brandName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        chain.headquarters.city.toLowerCase().includes(searchQuery.toLowerCase()) ||
        chain.headquarters.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        chain.ceoName?.toLowerCase().includes(searchQuery.toLowerCase());

      const typeMatch = chainTypeFilter === 'all' || chain.chainType === chainTypeFilter;
      const statusMatch = statusFilter === 'all' || chain.status === statusFilter;
      const certificationMatch = certificationFilter === 'all' || 
        chain.certifications.some(cert => cert.type === certificationFilter);

      return searchMatch && typeMatch && statusMatch && certificationMatch;
    });
  }, [labChains, searchQuery, chainTypeFilter, statusFilter, certificationFilter]);

  const paginatedChains = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredChains.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredChains, currentPage, itemsPerPage]);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, chainTypeFilter, statusFilter, certificationFilter]);

  // Get certification status badge
  const getCertificationBadge = (cert: Certification) => {
    const today = new Date();
    const expiryDate = new Date(cert.expiryDate);
    const daysToExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (cert.status === 'Expired' || daysToExpiry < 0) {
      return <Badge variant="destructive" className="text-xs">Expired</Badge>;
    } else if (daysToExpiry <= 30) {
      return <Badge variant="outline" className="text-xs text-yellow-600">Expiring Soon</Badge>;
    } else {
      return <Badge variant="default" className="text-xs text-green-600">Valid</Badge>;
    }
  };

  // Toggle chain expansion
  const toggleChainExpansion = (chainId: string) => {
    const newExpanded = new Set(expandedChains);
    if (newExpanded.has(chainId)) {
      newExpanded.delete(chainId);
    } else {
      newExpanded.add(chainId);
    }
    setExpandedChains(newExpanded);
  };

  const downloadTemplate = () => {
    const sampleData = [{
      BrandName: 'Sample Lab Chain',
      ChainType: 'Corporate',
      HeadquartersAddress: '123 Medical Street',
      City: 'Mumbai',
      State: 'Maharashtra',
      Pincode: '400001',
      Phone: '+91-22-12345678',
      Email: 'info@samplelab.com',
      EstablishedYear: 2000,
      CEOName: 'Dr. Sample Name',
      AnnualRevenue: '₹100 Crores',
      ActiveServices: 'Pathology, Radiology, Cardiology',
      TotalBranches: 50,
      Status: 'Active'
    }];
    downloadExcelTemplate([
      'BrandName', 'ChainType', 'HeadquartersAddress', 'City', 'State', 'Pincode',
      'Phone', 'Email', 'EstablishedYear', 'CEOName', 'AnnualRevenue',
      'ActiveServices', 'TotalBranches', 'Status'
    ], 'lab-chains', sampleData);
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header and Controls */}
        <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-lime-500/10 to-green-500/10 border border-lime-500/20">
              <FlaskConical className="h-6 w-6 text-lime-500" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                My Labs Management
                <Badge variant="secondary" className="text-xs">Chain Network</Badge>
              </h1>
              <p className="text-muted-foreground">Comprehensive laboratory chain and branch management system</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button onClick={() => setShowChainDialog(true)} className="bg-lime-500 hover:bg-lime-600">
              <Plus className="mr-2 h-4 w-4" />
              Add Lab Chain
            </Button>
            <Button onClick={downloadTemplate} variant="outline">
              <Download className="mr-2 h-4 w-4" />
              Download Template
            </Button>
          </div>
        </div>

        {/* Error and Success Messages */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}
        {result && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-green-800 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            {result.message}{result.count !== undefined && ` (${result.count} chains)`}
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-6 lg:w-[600px]">
            <TabsTrigger value="chains">Card View</TabsTrigger>
            <TabsTrigger value="list">List View</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="certifications">Certifications</TabsTrigger>
            <TabsTrigger value="excel">Excel Upload</TabsTrigger>
            <TabsTrigger value="json">JSON Upload</TabsTrigger>
          </TabsList>

          <TabsContent value="chains" className="space-y-6">
            {/* Search and Filter Controls */}
            <Card className="border-lime-500/20 bg-gradient-to-r from-lime-50/50 to-green-50/50">
              <CardContent className="pt-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="relative">
                    <Search className="absolute left-2 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search lab chains, CEO, city..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-8"
                    />
                  </div>
                  <Select value={chainTypeFilter} onValueChange={setChainTypeFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Chain Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="Corporate">Corporate</SelectItem>
                      <SelectItem value="Franchise">Franchise</SelectItem>
                      <SelectItem value="Independent">Independent</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="Active">Active</SelectItem>
                      <SelectItem value="Inactive">Inactive</SelectItem>
                      <SelectItem value="Under Review">Under Review</SelectItem>
                      <SelectItem value="Suspended">Suspended</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={certificationFilter} onValueChange={setCertificationFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Certification" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Certifications</SelectItem>
                      <SelectItem value="NABL">NABL</SelectItem>
                      <SelectItem value="ISO 15189">ISO 15189</SelectItem>
                      <SelectItem value="ISO 9001">ISO 9001</SelectItem>
                      <SelectItem value="CAP">CAP</SelectItem>
                      <SelectItem value="JCI">JCI</SelectItem>
                      <SelectItem value="NABH">NABH</SelectItem>
                      <SelectItem value="ICMR">ICMR</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Lab Chains Grid View */}
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
              {loading ? (
                Array.from({ length: 6 }).map((_, index) => (
                  <Card key={index} className="animate-pulse">
                    <CardContent className="p-6">
                      <div className="space-y-4">
                        <div className="h-6 bg-muted rounded" />
                        <div className="h-4 bg-muted rounded w-3/4" />
                        <div className="h-4 bg-muted rounded w-1/2" />
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : paginatedChains.length === 0 ? (
                <div className="col-span-full">
                  <Card className="border-dashed">
                    <CardContent className="p-12 text-center">
                      <FlaskConical className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <h3 className="text-lg font-semibold mb-2">No Lab Chains Found</h3>
                      <p className="text-muted-foreground mb-4">
                        {filteredChains.length === 0 ? 'No chains match your search criteria' : 'No chains to display'}
                      </p>
                      <Button onClick={() => setShowChainDialog(true)} className="bg-lime-500 hover:bg-lime-600">
                        <Plus className="mr-2 h-4 w-4" />
                        Add First Lab Chain
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              ) : (
                paginatedChains.map((chain) => (
                  <Card key={chain.id} className="group hover:shadow-lg transition-all duration-300 border-l-4 border-l-lime-500 cursor-pointer" onClick={() => setSelectedChain(chain)}>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-1">
                          <div className="p-3 rounded-lg bg-lime-500/10">
                            <Building2 className="h-6 w-6 text-lime-500" />
                          </div>
                          <div className="flex-1">
                            <h3 className="text-lg font-semibold text-gray-900">{chain.brandName}</h3>
                            {chain.ceoName && (
                              <p className="text-sm text-muted-foreground mt-1">
                                {chain.ceoName}
                              </p>
                            )}
                          </div>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-[180px]">
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setSelectedChain(chain); }}>
                              <Eye className="mr-2 h-4 w-4" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setShowBranchDialog(true); }}>
                              <MapPin className="mr-2 h-4 w-4" />
                              Manage Branches
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={(e) => e.stopPropagation()}>
                              <Edit className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={(e) => e.stopPropagation()}>
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>

            {/* Pagination */}
            {filteredChains.length > itemsPerPage && (
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredChains.length)} of {filteredChains.length} lab chains
                    </p>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Previous
                      </Button>
                      <div className="flex items-center space-x-1">
                        {Array.from({ length: Math.min(5, Math.ceil(filteredChains.length / itemsPerPage)) }, (_, i) => {
                          const totalPages = Math.ceil(filteredChains.length / itemsPerPage);
                          let page;
                          if (totalPages <= 5) {
                            page = i + 1;
                          } else if (currentPage <= 3) {
                            page = i + 1;
                          } else if (currentPage >= totalPages - 2) {
                            page = totalPages - 4 + i;
                          } else {
                            page = currentPage - 2 + i;
                          }
                          
                          return (
                            <Button
                              key={page}
                              variant={currentPage === page ? "default" : "outline"}
                              size="sm"
                              onClick={() => setCurrentPage(page)}
                              className="w-8 h-8 p-0"
                            >
                              {page}
                            </Button>
                          );
                        })}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(prev => Math.min(Math.ceil(filteredChains.length / itemsPerPage), prev + 1))}
                        disabled={currentPage === Math.ceil(filteredChains.length / itemsPerPage)}
                      >
                        Next
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="list" className="space-y-6">
            {/* Search and Filter Controls - Same as Card View */}
            <Card className="border-lime-500/20 bg-gradient-to-r from-lime-50/50 to-green-50/50">
              <CardContent className="pt-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="relative">
                    <Search className="absolute left-2 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search lab chains, CEO, city..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-8"
                    />
                  </div>
                  <Select value={chainTypeFilter} onValueChange={setChainTypeFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Chain Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="Corporate">Corporate</SelectItem>
                      <SelectItem value="Franchise">Franchise</SelectItem>
                      <SelectItem value="Independent">Independent</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="Active">Active</SelectItem>
                      <SelectItem value="Inactive">Inactive</SelectItem>
                      <SelectItem value="Under Review">Under Review</SelectItem>
                      <SelectItem value="Suspended">Suspended</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={certificationFilter} onValueChange={setCertificationFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Certification" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Certifications</SelectItem>
                      <SelectItem value="NABL">NABL</SelectItem>
                      <SelectItem value="ISO 15189">ISO 15189</SelectItem>
                      <SelectItem value="ISO 9001">ISO 9001</SelectItem>
                      <SelectItem value="CAP">CAP</SelectItem>
                      <SelectItem value="JCI">JCI</SelectItem>
                      <SelectItem value="NABH">NABH</SelectItem>
                      <SelectItem value="ICMR">ICMR</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Lab Chains Table View */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <FlaskConical className="h-5 w-5 text-lime-500" />
                    Lab Chains Directory
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Showing {paginatedChains.length} of {filteredChains.length} lab chains
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={itemsPerPage.toString()} onValueChange={(value) => setItemsPerPage(Number(value))}>
                    <SelectTrigger className="w-[100px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">5</SelectItem>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[50px]"></TableHead>
                        <TableHead className="w-[250px]">Name / Branch</TableHead>
                        <TableHead>Location & Contact</TableHead>
                        <TableHead className="w-[100px]">Status</TableHead>
                        <TableHead className="w-[200px]">Services Available</TableHead>
                        <TableHead className="w-[180px]">Certifications</TableHead>
                        <TableHead className="w-[120px] text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        Array.from({ length: 5 }).map((_, index) => (
                          <TableRow key={index}>
                            <TableCell><div className="h-4 bg-muted animate-pulse rounded" /></TableCell>
                            <TableCell><div className="h-4 bg-muted animate-pulse rounded" /></TableCell>
                            <TableCell><div className="h-4 bg-muted animate-pulse rounded" /></TableCell>
                            <TableCell><div className="h-4 bg-muted animate-pulse rounded" /></TableCell>
                            <TableCell><div className="h-4 bg-muted animate-pulse rounded" /></TableCell>
                            <TableCell><div className="h-4 bg-muted animate-pulse rounded" /></TableCell>
                            <TableCell><div className="h-4 bg-muted animate-pulse rounded" /></TableCell>
                          </TableRow>
                        ))
                      ) : paginatedChains.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                            {filteredChains.length === 0 ? 'No lab chains found matching your criteria' : 'No lab chains to display'}
                          </TableCell>
                        </TableRow>
                      ) : (
                        paginatedChains.map((chain) => (
                          <React.Fragment key={chain.id}>
                            {/* Main Chain Row */}
                            <TableRow className="group hover:bg-muted/50 border-l-4 border-l-lime-500">
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => toggleChainExpansion(chain.id)}
                                  className="h-6 w-6 p-0"
                                >
                                  {expandedChains.has(chain.id) ? (
                                    <ChevronUp className="h-4 w-4" />
                                  ) : (
                                    <ChevronDown className="h-4 w-4" />
                                  )}
                                </Button>
                              </TableCell>
                              <TableCell>
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <Building2 className="h-5 w-5 text-lime-500" />
                                    <div className="font-semibold text-lime-700">{chain.brandName}</div>
                                  </div>
                                  <div className="text-sm text-muted-foreground">
                                    {chain.branches[0]?.name || 'Main Branch'}
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1 text-sm font-medium">
                                    <MapPin className="h-4 w-4 text-muted-foreground" />
                                    <span>{chain.headquarters.city}, {chain.headquarters.state}</span>
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {chain.headquarters.address}, {chain.headquarters.pincode}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    📧 {chain.headquarters.email}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    📞 {chain.headquarters.phone}
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge 
                                  variant={chain.status === 'Active' ? 'default' : 'secondary'}
                                  className="text-xs"
                                >
                                  {chain.status}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="space-y-1">
                                  {chain.activeServices.length > 0 ? (
                                    <div className="text-sm">
                                      {chain.activeServices.join(', ')}
                                    </div>
                                  ) : (
                                    <div className="text-xs text-muted-foreground">No services listed</div>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="space-y-2">
                                  <div className="text-xs text-muted-foreground mb-1">
                                    {chain.certifications.length} certification{chain.certifications.length !== 1 ? 's' : ''}
                                  </div>
                                  <div className="flex flex-wrap gap-1">
                                    {chain.certifications.slice(0, 2).map((cert) => (
                                      <div key={cert.id} className="flex items-center gap-1">
                                        <Badge variant="secondary" className="text-xs">
                                          <Award className="h-2 w-2 mr-1" />
                                          {cert.type}
                                        </Badge>
                                        {getCertificationBadge(cert)}
                                      </div>
                                    ))}
                                  </div>
                                  {chain.certifications.length > 2 && (
                                    <div className="text-xs text-muted-foreground">
                                      +{chain.certifications.length - 2} more certs
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-right">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                      <MoreVertical className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-[180px]">
                                    <DropdownMenuItem onClick={() => setSelectedChain(chain)}>
                                      <Eye className="mr-2 h-4 w-4" />
                                      View Details
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setShowBranchDialog(true)}>
                                      <MapPin className="mr-2 h-4 w-4" />
                                      Manage Branches
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setShowCertificationDialog(true)}>
                                      <Award className="mr-2 h-4 w-4" />
                                      Certifications
                                    </DropdownMenuItem>
                                    <DropdownMenuItem>
                                      <Users className="mr-2 h-4 w-4" />
                                      Staff Management
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem>
                                      <Edit className="mr-2 h-4 w-4" />
                                      Edit Chain
                                    </DropdownMenuItem>
                                    <DropdownMenuItem className="text-destructive focus:text-destructive">
                                      <Trash2 className="mr-2 h-4 w-4" />
                                      Delete Chain
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </TableCell>
                            </TableRow>
                            
                            {/* Expanded Branches Rows */}
                            {expandedChains.has(chain.id) && chain.branches.map((branch) => (
                              <TableRow key={branch.id} className="bg-muted/30 border-l-4 border-l-blue-300">
                                <TableCell>
                                  <div className="pl-4">
                                    <MapPin className="h-4 w-4 text-blue-500" />
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="pl-4 space-y-1">
                                    <div className="flex items-center gap-2">
                                      <Home className="h-4 w-4 text-blue-500" />
                                      <div className="font-medium text-blue-700">{branch.branchName}</div>
                                      <Badge variant="outline" className="text-xs">BRANCH</Badge>
                                    </div>
                                    <div className="text-sm text-muted-foreground">
                                      Code: {branch.branchCode}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      Manager: {branch.contact.managerName}
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-1 text-sm">
                                      <MapPin className="h-3 w-3 text-muted-foreground" />
                                      <span>{branch.address.area}, {branch.address.city}</span>
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      {branch.address.street}, {branch.address.state} {branch.address.pincode}
                                    </div>
                                    {branch.address.landmark && (
                                      <div className="text-xs text-muted-foreground">
                                        Near: {branch.address.landmark}
                                      </div>
                                    )}
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                      <Phone className="h-3 w-3" />
                                      {branch.contact.phone}
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                      <Mail className="h-3 w-3" />
                                      {branch.contact.email}
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="space-y-2">
                                    <Badge 
                                      variant={
                                        branch.status === 'Active' ? 'default' : 
                                        branch.status === 'Maintenance' ? 'outline' : 
                                        branch.status === 'Renovation' ? 'secondary' : 'destructive'
                                      }
                                      className="text-xs"
                                    >
                                      {branch.status}
                                    </Badge>
                                    <div className="text-xs text-muted-foreground">
                                      Est: {new Date(branch.establishedDate).getFullYear()}
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="space-y-2">
                                    <div className="flex items-center gap-1">
                                      <Users className="h-3 w-3 text-purple-500" />
                                      <span className="text-sm font-medium text-purple-600">
                                        {branch.staffCount.doctors + branch.staffCount.technicians + branch.staffCount.nurses + branch.staffCount.supportStaff}
                                      </span>
                                      <span className="text-xs text-muted-foreground">staff</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <Microscope className="h-3 w-3 text-green-500" />
                                      <span className="text-sm font-medium text-green-600">
                                        {branch.services.length}
                                      </span>
                                      <span className="text-xs text-muted-foreground">services</span>
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      Monthly: {branch.performanceMetrics.monthlyTests.toLocaleString()} tests
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                                      <span className="text-xs font-medium">{branch.performanceMetrics.customerRating}</span>
                                      <span className="text-xs text-muted-foreground">({branch.performanceMetrics.reviewCount})</span>
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="space-y-2">
                                    <div className="text-xs text-muted-foreground mb-1">
                                      {branch.certifications.length} cert{branch.certifications.length !== 1 ? 's' : ''}
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                      {branch.certifications.slice(0, 2).map((cert) => (
                                        <div key={cert.id} className="flex items-center gap-1">
                                          <Badge variant="secondary" className="text-xs">
                                            <Award className="h-2 w-2 mr-1" />
                                            {cert.type}
                                          </Badge>
                                        </div>
                                      ))}
                                    </div>
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {branch.facilities.homeCollection && (
                                        <Badge variant="outline" className="text-xs">Home Collection</Badge>
                                      )}
                                      {branch.facilities.onlineReports && (
                                        <Badge variant="outline" className="text-xs">Online Reports</Badge>
                                      )}
                                      {branch.facilities.emergencyServices && (
                                        <Badge variant="outline" className="text-xs">Emergency</Badge>
                                      )}
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell className="text-right">
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                        <MoreVertical className="h-4 w-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-[160px]">
                                      <DropdownMenuItem onClick={() => setSelectedBranch(branch)}>
                                        <Eye className="mr-2 h-4 w-4" />
                                        View Branch
                                      </DropdownMenuItem>
                                      <DropdownMenuItem>
                                        <Users className="mr-2 h-4 w-4" />
                                        Manage Staff
                                      </DropdownMenuItem>
                                      <DropdownMenuItem>
                                        <Microscope className="mr-2 h-4 w-4" />
                                        Services
                                      </DropdownMenuItem>
                                      <DropdownMenuItem>
                                        <Award className="mr-2 h-4 w-4" />
                                        Certifications
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem>
                                        <Edit className="mr-2 h-4 w-4" />
                                        Edit Branch
                                      </DropdownMenuItem>
                                      <DropdownMenuItem className="text-destructive focus:text-destructive">
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        Delete Branch
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </TableCell>
                              </TableRow>
                            ))}
                            
                            {/* Show message if no branches in sample data */}
                            {expandedChains.has(chain.id) && chain.branches.length === 0 && (
                              <TableRow className="bg-muted/20">
                                <TableCell></TableCell>
                                <TableCell colSpan={6} className="text-center py-4 text-muted-foreground italic">
                                  No branch details available for {chain.brandName}
                                  <Button variant="link" className="ml-2 p-0 h-auto text-blue-600">
                                    Add branches →
                                  </Button>
                                </TableCell>
                              </TableRow>
                            )}
                          </React.Fragment>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination for List View */}
                {filteredChains.length > itemsPerPage && (
                  <div className="flex items-center justify-between pt-4">
                    <p className="text-sm text-muted-foreground">
                      Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredChains.length)} of {filteredChains.length} lab chains
                    </p>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Previous
                      </Button>
                      <div className="flex items-center space-x-1">
                        {Array.from({ length: Math.min(5, Math.ceil(filteredChains.length / itemsPerPage)) }, (_, i) => {
                          const totalPages = Math.ceil(filteredChains.length / itemsPerPage);
                          let page;
                          if (totalPages <= 5) {
                            page = i + 1;
                          } else if (currentPage <= 3) {
                            page = i + 1;
                          } else if (currentPage >= totalPages - 2) {
                            page = totalPages - 4 + i;
                          } else {
                            page = currentPage - 2 + i;
                          }
                          
                          return (
                            <Button
                              key={page}
                              variant={currentPage === page ? "default" : "outline"}
                              size="sm"
                              onClick={() => setCurrentPage(page)}
                              className="w-8 h-8 p-0"
                            >
                              {page}
                            </Button>
                          );
                        })}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(prev => Math.min(Math.ceil(filteredChains.length / itemsPerPage), prev + 1))}
                        disabled={currentPage === Math.ceil(filteredChains.length / itemsPerPage)}
                      >
                        Next
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analytics" className="space-y-6">
            {/* Analytics Dashboard */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card className="border-l-4 border-l-blue-500">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Total Lab Chains</p>
                      <p className="text-3xl font-bold text-blue-600">{labChains.length}</p>
                    </div>
                    <Building2 className="h-8 w-8 text-blue-500" />
                  </div>
                  <div className="mt-4 flex items-center text-sm">
                    <TrendingUp className="h-4 w-4 text-green-500 mr-1" />
                    <span className="text-green-600">+12%</span>
                    <span className="text-muted-foreground ml-2">vs last month</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-green-500">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Total Branches</p>
                      <p className="text-3xl font-bold text-green-600">
                        {labChains.reduce((sum, chain) => sum + chain.totalBranches, 0).toLocaleString()}
                      </p>
                    </div>
                    <MapPin className="h-8 w-8 text-green-500" />
                  </div>
                  <div className="mt-4 flex items-center text-sm">
                    <TrendingUp className="h-4 w-4 text-green-500 mr-1" />
                    <span className="text-green-600">+8%</span>
                    <span className="text-muted-foreground ml-2">vs last month</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-yellow-500">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Active Certifications</p>
                      <p className="text-3xl font-bold text-yellow-600">
                        {labChains.reduce((sum, chain) => sum + chain.certifications.filter(cert => cert.status === 'Valid').length, 0)}
                      </p>
                    </div>
                    <Award className="h-8 w-8 text-yellow-500" />
                  </div>
                  <div className="mt-4 flex items-center text-sm">
                    <AlertCircle className="h-4 w-4 text-yellow-500 mr-1" />
                    <span className="text-yellow-600">
                      {labChains.reduce((sum, chain) => 
                        sum + chain.certifications.filter(cert => {
                          const daysToExpiry = Math.ceil((new Date(cert.expiryDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                          return daysToExpiry <= 30 && daysToExpiry > 0;
                        }).length, 0
                      )}
                    </span>
                    <span className="text-muted-foreground ml-2">expiring soon</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-purple-500">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Corporate Chains</p>
                      <p className="text-3xl font-bold text-purple-600">
                        {labChains.filter(chain => chain.chainType === 'Corporate').length}
                      </p>
                    </div>
                    <Users className="h-8 w-8 text-purple-500" />
                  </div>
                  <div className="mt-4 text-sm text-muted-foreground">
                    {Math.round((labChains.filter(chain => chain.chainType === 'Corporate').length / labChains.length) * 100)}% of total
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Revenue Analytics */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    Chain Type Distribution
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {['Corporate', 'Franchise', 'Independent'].map(type => {
                      const count = labChains.filter(chain => chain.chainType === type).length;
                      const percentage = labChains.length > 0 ? Math.round((count / labChains.length) * 100) : 0;
                      return (
                        <div key={type} className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`w-3 h-3 rounded-full ${
                              type === 'Corporate' ? 'bg-blue-500' : 
                              type === 'Franchise' ? 'bg-green-500' : 'bg-purple-500'
                            }`} />
                            <span>{type}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{count}</span>
                            <span className="text-sm text-muted-foreground">({percentage}%)</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    Top Certifications
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {Object.entries(
                      labChains.reduce((acc, chain) => {
                        chain.certifications.forEach(cert => {
                          acc[cert.type] = (acc[cert.type] || 0) + 1;
                        });
                        return acc;
                      }, {} as Record<string, number>)
                    )
                      .sort(([, a], [, b]) => b - a)
                      .slice(0, 5)
                      .map(([type, count]) => (
                        <div key={type} className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Award className="h-4 w-4 text-amber-500" />
                            <span>{type}</span>
                          </div>
                          <Badge variant="secondary">{count} chains</Badge>
                        </div>
                      ))
                    }
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="certifications" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Award className="h-5 w-5 text-amber-500" />
                  Certification Management
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Track and manage certifications across all lab chains and branches
                </p>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {/* Certification Status Overview */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="text-center p-4 border rounded-lg bg-green-50">
                      <div className="text-2xl font-bold text-green-600">
                        {labChains.reduce((sum, chain) => 
                          sum + chain.certifications.filter(cert => cert.status === 'Valid').length, 0
                        )}
                      </div>
                      <div className="text-sm text-green-700">Valid Certifications</div>
                    </div>
                    <div className="text-center p-4 border rounded-lg bg-yellow-50">
                      <div className="text-2xl font-bold text-yellow-600">
                        {labChains.reduce((sum, chain) => 
                          sum + chain.certifications.filter(cert => {
                            const daysToExpiry = Math.ceil((new Date(cert.expiryDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                            return daysToExpiry <= 30 && daysToExpiry > 0;
                          }).length, 0
                        )}
                      </div>
                      <div className="text-sm text-yellow-700">Expiring Soon</div>
                    </div>
                    <div className="text-center p-4 border rounded-lg bg-red-50">
                      <div className="text-2xl font-bold text-red-600">
                        {labChains.reduce((sum, chain) => 
                          sum + chain.certifications.filter(cert => cert.status === 'Expired').length, 0
                        )}
                      </div>
                      <div className="text-sm text-red-700">Expired</div>
                    </div>
                  </div>

                  {/* Certification Timeline */}
                  <div className="space-y-4">
                    <h4 className="font-medium">Upcoming Renewals</h4>
                    {labChains
                      .flatMap(chain => 
                        chain.certifications.map(cert => ({ ...cert, chainName: chain.brandName }))
                      )
                      .filter(cert => {
                        const daysToExpiry = Math.ceil((new Date(cert.expiryDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                        return daysToExpiry <= 90 && daysToExpiry > 0;
                      })
                      .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime())
                      .slice(0, 5)
                      .map((cert) => {
                        const daysToExpiry = Math.ceil((new Date(cert.expiryDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                        return (
                          <div key={cert.id} className="flex items-center justify-between p-3 border rounded-lg">
                            <div className="flex items-center gap-3">
                              <Award className="h-4 w-4 text-amber-500" />
                              <div>
                                <div className="font-medium">{cert.chainName}</div>
                                <div className="text-sm text-muted-foreground">{cert.type} - {cert.certificateNumber}</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant={daysToExpiry <= 30 ? "destructive" : "outline"}>
                                {daysToExpiry} days
                              </Badge>
                              <span className="text-sm text-muted-foreground">
                                {new Date(cert.expiryDate).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    }
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="excel">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5" />
                  Bulk Upload via Excel
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Upload lab chain data using Excel files (.xlsx, .xls)
                </p>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <Input 
                      ref={fileInputRef} 
                      type="file" 
                      accept=".xlsx,.xls" 
                      onChange={() => {}} // handleExcelUpload 
                      disabled={loading} 
                    />
                    <Button 
                      variant="outline" 
                      onClick={() => fileInputRef.current?.click()} 
                      disabled={loading}
                    >
                      <FileSpreadsheet className="mr-2 h-4 w-4" />
                      Choose File
                    </Button>
                  </div>
                  <div className="p-4 bg-blue-50 rounded-lg">
                    <h4 className="font-medium text-blue-900 mb-2">Excel Template Format</h4>
                    <ul className="text-sm text-blue-800 space-y-1">
                      <li>• BrandName: Name of the lab chain</li>
                      <li>• ChainType: Corporate/Franchise/Independent</li>
                      <li>• HeadquartersAddress, City, State, Pincode</li>
                      <li>• Phone, Email, CEOName</li>
                      <li>• EstablishedYear, AnnualRevenue</li>
                      <li>• ActiveServices: Comma-separated list</li>
                      <li>• TotalBranches, Status</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="json">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  Bulk Upload via JSON
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Upload lab chain data using JSON format
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea 
                  value={jsonInput} 
                  onChange={(e) => setJsonInput(e.target.value)} 
                  placeholder='[{"brandName":"Sample Lab Chain","chainType":"Corporate","headquarters":{"city":"Mumbai","state":"Maharashtra","phone":"+91-22-12345678","email":"info@sample.com"},"establishedYear":2000,"ceoName":"Dr. Sample","totalBranches":50,"activeServices":["Pathology","Radiology"],"status":"Active"}]' 
                  className="h-64 font-mono text-sm" 
                />
                <Button onClick={() => {}} disabled={loading} className="bg-lime-500 hover:bg-lime-600">
                  <Upload className="mr-2 h-4 w-4" />
                  {loading ? 'Uploading...' : 'Upload JSON'}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
};

export default LabsManagement;