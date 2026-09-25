import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import api from '@/utils/api';
import HospitalLayout from '@/components/hospital/HospitalLayout';
import { 
  FolderOpen, Activity, Bell, Plus, Search, ArrowLeft, Edit, 
  Trash2, Eye, CheckCircle, XCircle, AlertCircle, RefreshCw,
  FileText, Download, Upload, Printer, Building2, User, 
  Calendar, ArrowUpDown, Clock, Archive, History, Lock,
  Unlock, FolderClosed, FolderPlus, FileCheck, FileClock,
  FileX, Send, ScanLine, QrCode, Barcode, Package, Truck,
  MapPin, Filter, MoreVertical, Copy, ExternalLink, Shield,
  AlertTriangle, BookOpen, FileSearch, FolderSearch, Tag
} from 'lucide-react';

// Types
interface MedicalRecord {
  id: string;
  mrdNumber: string;
  patientId: string;
  patientName: string;
  uhid: string;
  recordType: 'IPD' | 'OPD' | 'Emergency' | 'Day Care' | 'Health Checkup';
  department: string;
  admissionDate: string;
  dischargeDate?: string;
  attendingDoctor: string;
  diagnosis: string;
  fileLocation: string;
  shelf: string;
  rack: string;
  status: 'Active' | 'In-Transit' | 'Requested' | 'Checked-Out' | 'Archived' | 'Digitized';
  lastAccessed?: string;
  accessedBy?: string;
  documents: MRDDocument[];
  auditTrail: AuditEntry[];
  createdAt: string;
  updatedAt: string;
}

interface MRDDocument {
  id: string;
  name: string;
  type: 'Discharge Summary' | 'Investigation Report' | 'Consent Form' | 'Operative Notes' | 'Progress Notes' | 'Prescription' | 'Billing' | 'Other';
  pages: number;
  isDigitized: boolean;
  digitalPath?: string;
  addedDate: string;
}

interface AuditEntry {
  id: string;
  action: 'Created' | 'Viewed' | 'Checked-Out' | 'Returned' | 'Modified' | 'Archived' | 'Digitized';
  performedBy: string;
  department: string;
  timestamp: string;
  remarks?: string;
  ipAddress?: string;
}

interface FileRequest {
  id: string;
  requestNumber: string;
  mrdNumber: string;
  patientName: string;
  requestedBy: string;
  department: string;
  purpose: 'Treatment' | 'Insurance' | 'Legal' | 'Research' | 'Audit' | 'Patient Request';
  priority: 'Normal' | 'Urgent' | 'Emergency';
  status: 'Pending' | 'Processing' | 'Ready' | 'Delivered' | 'Returned' | 'Rejected';
  requestDate: string;
  requiredDate: string;
  deliveredDate?: string;
  returnDate?: string;
  remarks?: string;
}

interface DigitizationTask {
  id: string;
  mrdNumber: string;
  patientName: string;
  totalPages: number;
  scannedPages: number;
  status: 'Pending' | 'In-Progress' | 'Quality Check' | 'Completed' | 'Failed';
  assignedTo: string;
  startDate?: string;
  completedDate?: string;
  priority: 'Normal' | 'High';
}

// MRD (mrd_record_index) records WHERE a file is and who has it — not clinical content — so department, doctor,
// diagnosis and admission dates are deliberately left blank here instead of being invented.
const MRD_STATUS: Record<string, MedicalRecord['status']> = {
  in_mrd: 'Active', checked_out: 'Checked-Out', archived: 'Archived', destroyed: 'Archived',
};
const mapMrdRecord = (r: any): MedicalRecord => ({
  id: String(r.id), mrdNumber: r.mrdNumber, patientId: String(r.patientId), patientName: r.patientName || '',
  uhid: r.uhid || '', recordType: (r.recordType || 'IPD') as MedicalRecord['recordType'],
  department: '', admissionDate: '', attendingDoctor: '', diagnosis: '',
  fileLocation: r.location || '', shelf: '', rack: '',
  status: MRD_STATUS[r.status] || 'Active', documents: [], auditTrail: [], createdAt: r.createdAt, updatedAt: r.updatedAt,
});

const HospitalMRD = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const hospitalHeaders = () => {
    const token = localStorage.getItem('hospitalToken');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };
  
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('records');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterDepartment, setFilterDepartment] = useState('all');
  const [filterRecordType, setFilterRecordType] = useState('all');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [showNewRecordDialog, setShowNewRecordDialog] = useState(false);
  const [showFileRequestDialog, setShowFileRequestDialog] = useState(false);
  const [showDigitizationDialog, setShowDigitizationDialog] = useState(false);
  const [showScanDialog, setShowScanDialog] = useState(false);
  const [scanValue, setScanValue] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<MedicalRecord | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const zxingReaderRef = useRef<{ reset?: () => void } | null>(null);
  const cameraActiveRef = useRef(false);

  useEffect(() => {
    cameraActiveRef.current = cameraActive;
  }, [cameraActive]);

  useEffect(() => {
    const token = localStorage.getItem('hospitalToken');
    if (!token) {
      navigate('/hospital/login');
      return;
    }
    let cancelled = false;
    api.get('/hospital/practice/mrd/records', { headers: hospitalHeaders(), params: { limit: 100 } })
      .then((response) => {
        if (cancelled) return;
        setRecords((response.data?.data || []).map(mapMrdRecord));
      })
      .catch((error) => { if (!cancelled) toast({ title: 'MRD unavailable', description: error.response?.data?.message || 'The live MRD service is unavailable.', variant: 'destructive' }); });
    setLoading(false);
    return () => { cancelled = true; };
  }, [navigate, toast]);

  const [records, setRecords] = useState<MedicalRecord[]>([]);

  const [newRecordForm, setNewRecordForm] = useState({
    uhid: '',
    patientId: '',
    recordType: 'IPD' as MedicalRecord['recordType'],
    location: '',
  });

  // These operational queues are still local-only screens; keep them empty rather than
  // presenting fabricated requests/tasks as real MRD activity.
  const fileRequests: FileRequest[] = [];
  const digitizationTasks: DigitizationTask[] = [];

  const departments = ['Cardiology', 'Neurology', 'Orthopedics', 'Gynecology', 'Pediatrics', 'General Medicine', 'Surgery', 'Emergency'];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Active': return 'bg-green-100 text-green-800';
      case 'In-Transit': return 'bg-yellow-100 text-yellow-800';
      case 'Requested': return 'bg-teal-100 text-teal-800';
      case 'Checked-Out': return 'bg-orange-100 text-orange-800';
      case 'Archived': return 'bg-gray-100 text-gray-800';
      case 'Digitized': return 'bg-purple-100 text-purple-800';
      case 'Pending': return 'bg-yellow-100 text-yellow-800';
      case 'Processing': return 'bg-teal-100 text-teal-800';
      case 'Ready': return 'bg-emerald-100 text-emerald-800';
      case 'Delivered': return 'bg-green-100 text-green-800';
      case 'Returned': return 'bg-gray-100 text-gray-800';
      case 'Rejected': return 'bg-red-100 text-red-800';
      case 'In-Progress': return 'bg-teal-100 text-teal-800';
      case 'Quality Check': return 'bg-purple-100 text-purple-800';
      case 'Completed': return 'bg-green-100 text-green-800';
      case 'Failed': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const stats = {
    totalRecords: records.length,
    activeFiles: records.filter((record) => record.status === 'Active').length,
    checkedOut: records.filter((record) => record.status === 'Checked-Out').length,
    pendingRequests: fileRequests.filter((r) => r.status === 'Pending').length,
    digitizedRecords: records.filter((record) => record.status === 'Digitized').length,
    digitizationRate: records.length ? Math.round((records.filter((record) => record.status === 'Digitized').length / records.length) * 1000) / 10 : 0,
  };

  // Filter records based on search and filters
  const filteredRecords = records.filter(record => {
    const matchesSearch = searchQuery === '' || 
      record.mrdNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      record.uhid.toLowerCase().includes(searchQuery.toLowerCase()) ||
      record.patientName.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesType = filterRecordType === 'all' || record.recordType === filterRecordType;
    const matchesStatus = filterStatus === 'all' || record.status === filterStatus;
    const matchesDepartment = filterDepartment === 'all' || record.department === filterDepartment;
    
    // Date range filter
    let matchesDateRange = true;
    if (filterDateFrom) {
      matchesDateRange = matchesDateRange && record.admissionDate >= filterDateFrom;
    }
    if (filterDateTo) {
      matchesDateRange = matchesDateRange && record.admissionDate <= filterDateTo;
    }
    
    return matchesSearch && matchesType && matchesStatus && matchesDepartment && matchesDateRange;
  });

  // Handler for adding record to digitization queue
  const handleAddToDigitizationQueue = (record: MedicalRecord) => {
    setSelectedRecord(record);
    setShowDigitizationDialog(true);
  };

  const handleCreateRecord = async () => {
    const uhid = newRecordForm.uhid.trim();
    const patientId = newRecordForm.patientId.trim();
    if (!uhid && !patientId) {
      toast({
        title: 'Patient required',
        description: 'Enter the patient UHID, or the patient ID if no UHID has been assigned yet.',
        variant: 'destructive'
      });
      return;
    }

    try {
      const response = await api.post('/hospital/practice/mrd/records', {
        ...(uhid ? { uhid } : { patientId }),
        recordType: newRecordForm.recordType,
        location: newRecordForm.location.trim() || undefined,
      }, { headers: hospitalHeaders() });
      const saved = response.data?.data;
      if (!saved) throw new Error('MRD service returned no record');
      setRecords((prev) => [mapMrdRecord(saved), ...prev]);
      setNewRecordForm({ uhid: '', patientId: '', recordType: 'IPD', location: '' });
      setShowNewRecordDialog(false);
      toast({ title: 'Record created', description: `${saved.mrdNumber} indexed for ${saved.patientName || 'the patient'}.` });
    } catch (error: any) {
      toast({ title: 'Record not created', description: error.response?.data?.message || 'The MRD service rejected the write; nothing was saved.', variant: 'destructive' });
    }
  };

  const handlePrintRecord = (record: MedicalRecord) => {
    const win = window.open('', '_blank');
    if (!win) {
      toast({ title: 'Popup blocked', description: 'Allow popups to print the record.', variant: 'destructive' });
      return;
    }
    const docHtml = `
      <html>
        <head>
          <title>MRD Record - ${record.mrdNumber}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 16px; }
            h1 { margin-bottom: 4px; }
            .meta { color: #475569; margin-bottom: 12px; }
            .section { margin-bottom: 12px; }
            .label { font-weight: bold; }
          </style>
        </head>
        <body>
          <h1>${record.patientName} (${record.uhid})</h1>
          <div class="meta">MRD: ${record.mrdNumber} • ${record.recordType} • ${record.department}</div>
          <div class="section"><span class="label">Doctor:</span> ${record.attendingDoctor || 'N/A'}</div>
          <div class="section"><span class="label">Admission:</span> ${record.admissionDate || '-'} | <span class="label">Discharge:</span> ${record.dischargeDate || '-'}</div>
          <div class="section"><span class="label">Location:</span> ${record.fileLocation || '-'} (${record.shelf || '-'} / ${record.rack || '-'})</div>
          <div class="section"><span class="label">Diagnosis:</span> ${record.diagnosis || '—'}</div>
        </body>
      </html>
    `;
    win.document.write(docHtml);
    win.document.close();
    win.focus();
    win.print();
    win.close();
  };

  const escapeCsvCell = (value: unknown) => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (/[",\n\r]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const downloadCsv = (filename: string, headers: string[], rows: string[][]) => {
    const csv = [headers.map(escapeCsvCell).join(','), ...rows.map((r) => r.map(escapeCsvCell).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleExportRecords = () => {
    if (filteredRecords.length === 0) {
      toast({ title: 'Nothing to export', description: 'No records match your current filters.' });
      return;
    }

    const headers = [
      'MRD Number',
      'UHID',
      'Patient Name',
      'Record Type',
      'Department',
      'Attending Doctor',
      'Admission Date',
      'Discharge Date',
      'Status',
      'File Location',
      'Shelf',
      'Rack',
      'Created At',
      'Updated At',
    ];

    const rows = filteredRecords.map((r) => [
      r.mrdNumber,
      r.uhid,
      r.patientName,
      r.recordType,
      r.department,
      r.attendingDoctor,
      r.admissionDate,
      r.dischargeDate ?? '',
      r.status,
      r.fileLocation,
      r.shelf,
      r.rack,
      r.createdAt,
      r.updatedAt,
    ]);

    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`mrd-records-${stamp}.csv`, headers, rows);
    toast({ title: 'Export started', description: `Exporting ${filteredRecords.length} record(s).` });
  };

  const handleExportAuditLog = () => {
    const entries = records
      .flatMap((r) => r.auditTrail.map((a) => ({ ...a, mrdNumber: r.mrdNumber })))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (entries.length === 0) {
      toast({ title: 'Nothing to export', description: 'No audit log entries available.' });
      return;
    }

    const headers = ['Timestamp', 'MRD Number', 'Action', 'Performed By', 'Department', 'Remarks', 'IP Address'];
    const rows = entries.map((e) => [
      e.timestamp,
      e.mrdNumber,
      e.action,
      e.performedBy,
      e.department,
      e.remarks ?? '',
      e.ipAddress ?? '',
    ]);

    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`mrd-audit-log-${stamp}.csv`, headers, rows);
    toast({ title: 'Export started', description: `Exporting ${entries.length} audit entries.` });
  };

  const handleScanLookup = () => {
    const query = scanValue.trim();
    if (!query) {
      toast({ title: 'Enter a barcode', description: 'Scan or type an MRD # or UHID to search.' });
      return;
    }

    const q = query.toLowerCase();
    const exact = records.find(
      (r) => r.mrdNumber.toLowerCase() === q || r.uhid.toLowerCase() === q || r.id.toLowerCase() === q
    );
    if (exact) {
      setActiveTab('records');
      setSelectedRecord(exact);
      setShowScanDialog(false);
      setScanValue('');
      toast({ title: 'Record found', description: `${exact.patientName} (${exact.mrdNumber})` });
      return;
    }

    const matches = records.filter(
      (r) =>
        r.mrdNumber.toLowerCase().includes(q) ||
        r.uhid.toLowerCase().includes(q) ||
        r.patientName.toLowerCase().includes(q)
    );

    if (matches.length === 1) {
      setActiveTab('records');
      setSelectedRecord(matches[0]);
      setShowScanDialog(false);
      setScanValue('');
      toast({ title: 'Record found', description: `${matches[0].patientName} (${matches[0].mrdNumber})` });
      return;
    }

    if (matches.length > 1) {
      setActiveTab('records');
      setSearchQuery(query);
      setShowScanDialog(false);
      toast({ title: 'Multiple matches', description: 'Filtered the records list. Refine your search if needed.' });
      return;
    }

    toast({ title: 'No match', description: 'No record found for that barcode / MRD # / UHID.' });
  };

  const stopCamera = () => {
    try {
      zxingReaderRef.current?.reset();
    } catch {
      // no-op
    }
    zxingReaderRef.current = null;
    setCameraActive(false);
  };

  const startCamera = async () => {
    setCameraError(null);

    if (!navigator?.mediaDevices?.getUserMedia) {
      setCameraError('Camera access is not supported in this browser.');
      toast({ title: 'Camera not supported', description: 'Use manual entry or try a different browser.' });
      return;
    }
    if (!videoRef.current) {
      setCameraError('Camera preview is not ready.');
      return;
    }

    try {
      // Recreate the reader on every start to avoid stale state across dialog open/close.
      zxingReaderRef.current?.reset();
      const reader = new BrowserMultiFormatReader();
      zxingReaderRef.current = reader;

      setCameraActive(true);
      await reader.decodeFromVideoDevice(
        undefined,
        videoRef.current,
        (result, error, controls) => {
          if (!cameraActiveRef.current) {
            controls.stop();
            return;
          }
          if (result) {
            const text = result.getText();
            setScanValue(text);
            // Stop camera first to prevent multiple triggers.
            controls.stop();
            stopCamera();
            // Auto-open the record.
            setTimeout(() => {
              handleScanLookup();
            }, 0);
            return;
          }
          // Ignore decode errors (no barcode in frame, etc.).
          void error;
        }
      );
    } catch (e: any) {
      stopCamera();
      const message = typeof e?.message === 'string' ? e.message : 'Unable to access camera.';
      setCameraError(message);
      toast({ title: 'Camera error', description: message });
    }
  };

  // Ensure camera is stopped when dialog closes or component unmounts.
  useEffect(() => {
    if (!showScanDialog) {
      stopCamera();
      setCameraError(null);
      return;
    }
    return () => {
      stopCamera();
    };
  }, [showScanDialog]);

  const handleSaveToQueue = async () => {
    if (!selectedRecord) return;
    
    try {
      await api.post(
        '/hospital/mrd/digitization-queue',
        { recordId: selectedRecord.id },
        { headers: hospitalHeaders() }
      );

      toast({
        title: "Added to Digitization Queue",
        description: `${selectedRecord.patientName}'s record has been queued for digitization.`,
      });
      setShowDigitizationDialog(false);
      setSelectedRecord(null);
    } catch (error: any) {
      toast({
        title: 'Failed to add to queue',
        description: error.response?.data?.message || 'An error occurred',
        variant: 'destructive'
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Activity className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <HospitalLayout title="Medical Records Department" subtitle="File Management, Retrieval & Digitization">
      <div className="space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white">
            <CardContent className="p-4 text-center">
              <FolderOpen className="h-6 w-6 mx-auto mb-2 opacity-80" />
              <p className="text-2xl font-bold">{stats.totalRecords.toLocaleString()}</p>
              <p className="text-xs opacity-80">Total Records</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white">
            <CardContent className="p-4 text-center">
              <FolderClosed className="h-6 w-6 mx-auto mb-2 opacity-80" />
              <p className="text-2xl font-bold">{stats.activeFiles.toLocaleString()}</p>
              <p className="text-xs opacity-80">Active Files</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-orange-500 to-orange-600 text-white">
            <CardContent className="p-4 text-center">
              <Truck className="h-6 w-6 mx-auto mb-2 opacity-80" />
              <p className="text-2xl font-bold">{stats.checkedOut}</p>
              <p className="text-xs opacity-80">Checked Out</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-yellow-500 to-yellow-600 text-white">
            <CardContent className="p-4 text-center">
              <Clock className="h-6 w-6 mx-auto mb-2 opacity-80" />
              <p className="text-2xl font-bold">{stats.pendingRequests}</p>
              <p className="text-xs opacity-80">Pending Requests</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-teal-500 to-teal-600 text-white">
            <CardContent className="p-4 text-center">
              <FileCheck className="h-6 w-6 mx-auto mb-2 opacity-80" />
              <p className="text-2xl font-bold">{stats.digitizedRecords.toLocaleString()}</p>
              <p className="text-xs opacity-80">Digitized</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white">
            <CardContent className="p-4 text-center">
              <Activity className="h-6 w-6 mx-auto mb-2 opacity-80" />
              <p className="text-2xl font-bold">{stats.digitizationRate}%</p>
              <p className="text-xs opacity-80">Digitization Rate</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <TabsList className="grid grid-cols-4 w-auto">
              <TabsTrigger value="records" className="gap-2">
                <FolderOpen className="h-4 w-4" /> Records
              </TabsTrigger>
              <TabsTrigger value="requests" className="gap-2">
                <FileSearch className="h-4 w-4" /> Requests
              </TabsTrigger>
              <TabsTrigger value="digitization" className="gap-2">
                <ScanLine className="h-4 w-4" /> Digitization
              </TabsTrigger>
              <TabsTrigger value="audit" className="gap-2">
                <History className="h-4 w-4" /> Audit Log
              </TabsTrigger>
            </TabsList>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input 
                  placeholder="Search by MRD#, UHID, Name..." 
                  className="pl-9 w-72"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Select value={filterRecordType} onValueChange={setFilterRecordType}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="IPD">IPD</SelectItem>
                  <SelectItem value="OPD">OPD</SelectItem>
                  <SelectItem value="Emergency">Emergency</SelectItem>
                  <SelectItem value="Day Care">Day Care</SelectItem>
                  <SelectItem value="Health Checkup">Health Checkup</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterDepartment} onValueChange={setFilterDepartment}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  <SelectItem value="Cardiology">Cardiology</SelectItem>
                  <SelectItem value="Neurology">Neurology</SelectItem>
                  <SelectItem value="Orthopedics">Orthopedics</SelectItem>
                  <SelectItem value="Gynecology">Gynecology</SelectItem>
                  <SelectItem value="Pediatrics">Pediatrics</SelectItem>
                  <SelectItem value="General Medicine">General Medicine</SelectItem>
                  <SelectItem value="Surgery">Surgery</SelectItem>
                  <SelectItem value="Emergency">Emergency</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Checked-Out">Checked-Out</SelectItem>
                  <SelectItem value="Archived">Archived</SelectItem>
                  <SelectItem value="Digitized">Digitized</SelectItem>
                </SelectContent>
              </Select>
              <Input 
                type="date" 
                className="w-40"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                placeholder="From Date"
              />
              <Input 
                type="date" 
                className="w-40"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                placeholder="To Date"
              />
            </div>
          </div>

          {/* Records Tab */}
          <TabsContent value="records" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Medical Records</h2>
              <div className="flex gap-2">
                <Button variant="outline" className="gap-2" onClick={handleExportRecords}>
                  <Download className="h-4 w-4" /> Export
                </Button>
                <Dialog open={showNewRecordDialog} onOpenChange={setShowNewRecordDialog}>
                  <DialogTrigger asChild>
                    <Button className="gap-2 bg-gradient-to-r from-purple-600 to-violet-600">
                      <FolderPlus className="h-4 w-4" /> New Record
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>Create New Medical Record</DialogTitle>
                      <DialogDescription>Register a new medical record in the system</DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-2 gap-4 py-4">
                      <div className="space-y-2">
                        <Label>Patient UHID</Label>
                        <Input
                          placeholder="Enter UHID"
                          value={newRecordForm.uhid}
                          onChange={(e) => setNewRecordForm(prev => ({ ...prev, uhid: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>or Patient ID (if no UHID yet)</Label>
                        <Input
                          placeholder="e.g., 17"
                          inputMode="numeric"
                          value={newRecordForm.patientId}
                          onChange={(e) => setNewRecordForm(prev => ({ ...prev, patientId: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Record Type</Label>
                        <Select
                          value={newRecordForm.recordType}
                          onValueChange={(value) => setNewRecordForm(prev => ({ ...prev, recordType: value as MedicalRecord['recordType'] }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="IPD">IPD</SelectItem>
                            <SelectItem value="OPD">OPD</SelectItem>
                            <SelectItem value="Emergency">Emergency</SelectItem>
                            <SelectItem value="Day Care">Day Care</SelectItem>
                            <SelectItem value="Health Checkup">Health Checkup</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>File Location</Label>
                        <Input
                          placeholder="e.g., Main Archive, Shelf S-12"
                          value={newRecordForm.location}
                          onChange={(e) => setNewRecordForm(prev => ({ ...prev, location: e.target.value }))}
                        />
                      </div>
                      <p className="col-span-2 text-xs text-muted-foreground">
                        The patient's name is read from their registration. MRD tracks where the file is and who has it; clinical details stay in the clinical record.
                      </p>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setShowNewRecordDialog(false)}>Cancel</Button>
                      <Button className="bg-gradient-to-r from-purple-600 to-violet-600" onClick={handleCreateRecord}>Create Record</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>MRD #</TableHead>
                      <TableHead>Patient</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Dates</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRecords.map((record) => (
                      <TableRow key={record.id} className="cursor-pointer hover:bg-gray-50">
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Barcode className="h-4 w-4 text-muted-foreground" />
                            <span className="font-mono text-sm">{record.mrdNumber}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{record.patientName}</p>
                            <p className="text-sm text-muted-foreground">{record.uhid}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{record.recordType}</Badge>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p>{record.department}</p>
                            <p className="text-sm text-muted-foreground">{record.attendingDoctor}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <p>Adm: {record.admissionDate}</p>
                            {record.dischargeDate && <p>Dis: {record.dischargeDate}</p>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {record.shelf} / {record.rack}
                          </div>
                          <p className="text-xs text-muted-foreground">{record.fileLocation}</p>
                        </TableCell>
                        <TableCell>
                          <Badge className={getStatusColor(record.status)}>{record.status}</Badge>
                          {record.lastAccessed && (
                            <p className="text-xs text-muted-foreground mt-1">Last: {record.accessedBy}</p>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="icon" onClick={() => setSelectedRecord(record)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="gap-1"
                              onClick={() => handleAddToDigitizationQueue(record)}
                            >
                              <ScanLine className="h-4 w-4" />
                              Add to Queue
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handlePrintRecord(record)}>
                              <Printer className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Record Detail Dialog */}
            {selectedRecord && (
              <Dialog open={!!selectedRecord} onOpenChange={() => setSelectedRecord(null)}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      Medical Record - {selectedRecord.mrdNumber}
                      <Badge className={getStatusColor(selectedRecord.status)}>{selectedRecord.status}</Badge>
                    </DialogTitle>
                  </DialogHeader>
                  <div className="grid grid-cols-2 gap-6 py-4">
                    <div className="space-y-4">
                      <div>
                        <h3 className="font-semibold mb-2">Patient Information</h3>
                        <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                          <p><span className="text-muted-foreground">Name:</span> {selectedRecord.patientName}</p>
                          <p><span className="text-muted-foreground">UHID:</span> {selectedRecord.uhid}</p>
                          <p><span className="text-muted-foreground">Department:</span> {selectedRecord.department}</p>
                          <p><span className="text-muted-foreground">Doctor:</span> {selectedRecord.attendingDoctor}</p>
                        </div>
                      </div>
                      <div>
                        <h3 className="font-semibold mb-2">Admission Details</h3>
                        <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                          <p><span className="text-muted-foreground">Type:</span> {selectedRecord.recordType}</p>
                          <p><span className="text-muted-foreground">Admission:</span> {selectedRecord.admissionDate}</p>
                          {selectedRecord.dischargeDate && (
                            <p><span className="text-muted-foreground">Discharge:</span> {selectedRecord.dischargeDate}</p>
                          )}
                          <p><span className="text-muted-foreground">Diagnosis:</span> {selectedRecord.diagnosis}</p>
                        </div>
                      </div>
                      <div>
                        <h3 className="font-semibold mb-2">File Location</h3>
                        <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                          <p><span className="text-muted-foreground">Location:</span> {selectedRecord.fileLocation}</p>
                          <p><span className="text-muted-foreground">Shelf:</span> {selectedRecord.shelf}</p>
                          <p><span className="text-muted-foreground">Rack:</span> {selectedRecord.rack}</p>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <h3 className="font-semibold mb-2">Documents ({selectedRecord.documents.length})</h3>
                        <ScrollArea className="h-48 border rounded-lg p-2">
                          <div className="space-y-2">
                            {selectedRecord.documents.map((doc) => (
                              <div key={doc.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                                <div className="flex items-center gap-2">
                                  <FileText className="h-4 w-4 text-muted-foreground" />
                                  <div>
                                    <p className="text-sm font-medium">{doc.name}</p>
                                    <p className="text-xs text-muted-foreground">{doc.type} • {doc.pages} pages</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  {doc.isDigitized ? (
                                    <Badge className="bg-green-100 text-green-800 text-xs">Digitized</Badge>
                                  ) : (
                                    <Badge className="bg-gray-100 text-gray-800 text-xs">Physical</Badge>
                                  )}
                                  <Button variant="ghost" size="sm">
                                    <Download className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      </div>
                      <div>
                        <h3 className="font-semibold mb-2">Audit Trail</h3>
                        <ScrollArea className="h-48 border rounded-lg p-2">
                          <div className="space-y-3">
                            {selectedRecord.auditTrail.map((entry) => (
                              <div key={entry.id} className="flex gap-3 text-sm">
                                <div className="w-28 text-muted-foreground">{entry.timestamp}</div>
                                <div className="flex-1">
                                  <Badge variant="outline">{entry.action}</Badge>
                                  <p className="mt-1">{entry.performedBy} ({entry.department})</p>
                                  {entry.remarks && <p className="text-xs text-muted-foreground">{entry.remarks}</p>}
                                </div>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setSelectedRecord(null)}>Close</Button>
                    {selectedRecord.status === 'Active' && (
                      <Button variant="outline" className="gap-2">
                        <Truck className="h-4 w-4" /> Check-Out
                      </Button>
                    )}
                    {selectedRecord.status === 'Checked-Out' && (
                      <Button variant="outline" className="gap-2">
                        <FolderClosed className="h-4 w-4" /> Check-In
                      </Button>
                    )}
                    <Button className="gap-2 bg-gradient-to-r from-purple-600 to-violet-600">
                      <ScanLine className="h-4 w-4" /> Digitize
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </TabsContent>

          {/* File Requests Tab */}
          <TabsContent value="requests" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">File Requests</h2>
              <Dialog open={showFileRequestDialog} onOpenChange={setShowFileRequestDialog}>
                <DialogTrigger asChild>
                  <Button className="gap-2 bg-gradient-to-r from-purple-600 to-violet-600">
                    <Plus className="h-4 w-4" /> New Request
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Request Medical File</DialogTitle>
                    <DialogDescription>Submit a request to retrieve a medical record</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>MRD Number / UHID</Label>
                      <Input placeholder="Enter MRD number or UHID" />
                    </div>
                    <div className="space-y-2">
                      <Label>Purpose</Label>
                      <Select>
                        <SelectTrigger>
                          <SelectValue placeholder="Select purpose" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Treatment">Treatment</SelectItem>
                          <SelectItem value="Insurance">Insurance</SelectItem>
                          <SelectItem value="Legal">Legal</SelectItem>
                          <SelectItem value="Research">Research</SelectItem>
                          <SelectItem value="Audit">Audit</SelectItem>
                          <SelectItem value="Patient Request">Patient Request</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Priority</Label>
                      <Select>
                        <SelectTrigger>
                          <SelectValue placeholder="Select priority" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Normal">Normal</SelectItem>
                          <SelectItem value="Urgent">Urgent</SelectItem>
                          <SelectItem value="Emergency">Emergency</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Required By</Label>
                      <Input type="date" />
                    </div>
                    <div className="space-y-2">
                      <Label>Remarks</Label>
                      <Textarea placeholder="Additional notes..." />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowFileRequestDialog(false)}>Cancel</Button>
                    <Button className="bg-gradient-to-r from-purple-600 to-violet-600">Submit Request</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Request #</TableHead>
                      <TableHead>MRD #</TableHead>
                      <TableHead>Patient</TableHead>
                      <TableHead>Requested By</TableHead>
                      <TableHead>Purpose</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Dates</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fileRequests.map((request) => (
                      <TableRow key={request.id}>
                        <TableCell className="font-mono text-sm">{request.requestNumber}</TableCell>
                        <TableCell className="font-mono text-sm">{request.mrdNumber}</TableCell>
                        <TableCell>{request.patientName}</TableCell>
                        <TableCell>
                          <div>
                            <p>{request.requestedBy}</p>
                            <p className="text-sm text-muted-foreground">{request.department}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{request.purpose}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={request.priority === 'Emergency' ? 'bg-red-500 text-white' : request.priority === 'Urgent' ? 'bg-orange-500 text-white' : 'bg-gray-200 text-gray-800'}>
                            {request.priority}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <p>Req: {request.requestDate}</p>
                            <p className="text-muted-foreground">Due: {request.requiredDate}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={getStatusColor(request.status)}>{request.status}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {request.status === 'Pending' && (
                              <Button size="sm" variant="outline">Process</Button>
                            )}
                            {request.status === 'Ready' && (
                              <Button size="sm" className="bg-green-600 hover:bg-green-700">Deliver</Button>
                            )}
                            {request.status === 'Delivered' && (
                              <Button size="sm" variant="outline">Return</Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Digitization Tab */}
          <TabsContent value="digitization" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Digitization Queue</h2>
              <Dialog open={showDigitizationDialog} onOpenChange={setShowDigitizationDialog}>
                <DialogTrigger asChild>
                  <Button className="gap-2 bg-gradient-to-r from-purple-600 to-violet-600">
                    <Plus className="h-4 w-4" /> Add to Queue
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Add Record to Digitization Queue</DialogTitle>
                    <DialogDescription>Select a medical record to add to the digitization queue</DialogDescription>
                  </DialogHeader>
                  <div className="py-4">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Select Record</Label>
                        <Select>
                          <SelectTrigger>
                            <SelectValue placeholder="Choose a record to digitize" />
                          </SelectTrigger>
                          <SelectContent>
                            {records.filter(r => !r.status.includes('Digitized')).map(record => (
                              <SelectItem key={record.id} value={record.id}>
                                {record.mrdNumber} - {record.patientName} ({record.recordType})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Priority</Label>
                        <Select>
                          <SelectTrigger>
                            <SelectValue placeholder="Select priority" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Normal">Normal</SelectItem>
                            <SelectItem value="High">High</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Estimated Pages</Label>
                        <Input type="number" placeholder="Number of pages to scan" />
                      </div>
                      <div className="space-y-2">
                        <Label>Notes</Label>
                        <Textarea placeholder="Additional notes for digitization..." />
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowDigitizationDialog(false)}>Cancel</Button>
                    <Button 
                      className="bg-gradient-to-r from-purple-600 to-violet-600"
                      onClick={() => {
                        toast({
                          title: "Added to Digitization Queue",
                          description: "Record has been successfully added to the digitization queue.",
                        });
                        setShowDigitizationDialog(false);
                      }}
                    >
                      Add to Queue
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Pending</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-yellow-600">{digitizationTasks.filter(t => t.status === 'Pending').length}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">In Progress</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-teal-600">{digitizationTasks.filter(t => t.status === 'In-Progress').length}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Today's Target</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-green-600">25 files</p>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {digitizationTasks.map((task) => (
                <Card key={task.id} className="hover:shadow-lg transition-shadow">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between mb-4">
                      <Badge variant="outline" className="font-mono">{task.mrdNumber}</Badge>
                      <Badge className={getStatusColor(task.status)}>{task.status}</Badge>
                    </div>
                    <h3 className="font-bold text-lg mb-1">{task.patientName}</h3>
                    <div className="space-y-3 mt-4">
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span>Progress</span>
                          <span>{task.scannedPages}/{task.totalPages} pages</span>
                        </div>
                        <Progress value={(task.scannedPages / task.totalPages) * 100} className="h-2" />
                      </div>
                      <div className="text-sm text-muted-foreground">
                        <p>Assigned: {task.assignedTo}</p>
                        {task.startDate && <p>Started: {task.startDate}</p>}
                      </div>
                      <Badge className={task.priority === 'High' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'}>
                        {task.priority} Priority
                      </Badge>
                    </div>
                    <div className="flex gap-2 mt-4">
                      {task.status === 'Pending' && (
                        <Button size="sm" className="flex-1">Start Scanning</Button>
                      )}
                      {task.status === 'In-Progress' && (
                        <>
                          <Button size="sm" variant="outline" className="flex-1">Continue</Button>
                          <Button size="sm" className="flex-1">Complete</Button>
                        </>
                      )}
                      {task.status === 'Quality Check' && (
                        <>
                          <Button size="sm" variant="outline" className="flex-1">Review</Button>
                          <Button size="sm" className="flex-1 bg-green-600">Approve</Button>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Audit Log Tab */}
          <TabsContent value="audit" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Audit Log</h2>
              <Button variant="outline" className="gap-2" onClick={handleExportAuditLog}>
                <Download className="h-4 w-4" /> Export Log
              </Button>
            </div>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Timestamp</TableHead>
                      <TableHead>MRD #</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Performed By</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Remarks</TableHead>
                      <TableHead>IP Address</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {records.flatMap(r => r.auditTrail.map(a => ({ ...a, mrdNumber: r.mrdNumber }))).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).map((entry: any) => (
                      <TableRow key={entry.id}>
                        <TableCell className="font-mono text-sm">{entry.timestamp}</TableCell>
                        <TableCell className="font-mono text-sm">{entry.mrdNumber}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{entry.action}</Badge>
                        </TableCell>
                        <TableCell>{entry.performedBy}</TableCell>
                        <TableCell>{entry.department}</TableCell>
                        <TableCell className="max-w-xs truncate">{entry.remarks || '-'}</TableCell>
                        <TableCell className="font-mono text-sm">{entry.ipAddress || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Scan Barcode Dialog */}
        <Dialog open={showScanDialog} onOpenChange={setShowScanDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Scan Barcode</DialogTitle>
              <DialogDescription>
                Scan or paste a barcode value (MRD # / UHID) to locate a record.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="flex items-center justify-between">
                <Label>Camera</Label>
                {cameraActive ? (
                  <Button type="button" variant="outline" size="sm" onClick={stopCamera}>
                    Stop
                  </Button>
                ) : (
                  <Button type="button" variant="outline" size="sm" onClick={startCamera}>
                    Start
                  </Button>
                )}
              </div>

              {(cameraActive || cameraError) && (
                <div className="border rounded-lg overflow-hidden bg-black">
                  <video ref={videoRef} className="w-full h-48 object-cover" muted playsInline />
                </div>
              )}
              {cameraError && (
                <p className="text-sm text-red-600">{cameraError}</p>
              )}

              <Label>Barcode / MRD # / UHID</Label>
              <Input
                value={scanValue}
                onChange={(e) => setScanValue(e.target.value)}
                placeholder="e.g. MRD-2024-001234"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleScanLookup();
                  }
                }}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  stopCamera();
                  setShowScanDialog(false);
                  setScanValue('');
                }}
              >
                Cancel
              </Button>
              <Button className="gap-2 bg-gradient-to-r from-purple-600 to-violet-600" onClick={handleScanLookup}>
                <Search className="h-4 w-4" /> Find Record
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Digitization Queue Dialog */}
        <Dialog open={showDigitizationDialog} onOpenChange={setShowDigitizationDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add to Digitization Queue</DialogTitle>
              <DialogDescription>
                Queue this medical record for digitization processing
              </DialogDescription>
            </DialogHeader>
            {selectedRecord && (
              <div className="space-y-4 py-4">
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-sm text-muted-foreground">Patient</p>
                  <p className="font-semibold">{selectedRecord.patientName}</p>
                  <p className="text-sm text-muted-foreground mt-1">MRD: {selectedRecord.mrdNumber}</p>
                </div>
                
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select defaultValue="normal">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high">High Priority</SelectItem>
                      <SelectItem value="normal">Normal Priority</SelectItem>
                      <SelectItem value="low">Low Priority</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Assign To</Label>
                  <Select defaultValue="auto">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto Assign</SelectItem>
                      <SelectItem value="staff1">Scanning Staff 1</SelectItem>
                      <SelectItem value="staff2">Scanning Staff 2</SelectItem>
                      <SelectItem value="staff3">Scanning Staff 3</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Notes (Optional)</Label>
                  <Textarea 
                    placeholder="Add any special instructions or notes..."
                    rows={3}
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDigitizationDialog(false)}>
                Cancel
              </Button>
              <Button 
                className="bg-gradient-to-r from-purple-600 to-violet-600"
                onClick={handleSaveToQueue}
              >
                <ScanLine className="h-4 w-4 mr-2" />
                Add to Queue
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </HospitalLayout>
  );
};

export default HospitalMRD;
