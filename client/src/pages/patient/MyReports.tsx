import { useState, useEffect } from 'react';
import { FileText, Download, Eye, Upload, Search, Calendar, Filter, FileStack, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import api from '@/utils/api';
import { downloadReport, previewReport } from '@/utils/reportActions';
import { EmptyState } from '@/components/ui/empty-state';
import { InlineError } from '@/components/ui/inline-error';

interface Report {
  id: string;
  fileName: string;
  reportType: 'lab' | 'prescription' | 'imaging' | 'general';
  uploadedAt: string;
  fileSize: number;
  description?: string;
  fileUrl: string;
  testName?: string;
  labName?: string;
  reportDate?: string;
}

const MyReports = () => {
  const { toast } = useToast();
  const [reports, setReports] = useState<Report[]>([]);
  const [reportsStatus, setReportsStatus] = useState<'live' | 'unavailable'>('live');
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');

  // Upload form state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadType, setUploadType] = useState<string>('lab');
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadTestName, setUploadTestName] = useState('');
  const [uploadLabName, setUploadLabName] = useState('');
  const [showUploadDialog, setShowUploadDialog] = useState(false);

  // Fetch reports from API
  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    try {
      setIsLoading(true);
      const token = localStorage.getItem('token');
      if (!token) {
        setReports([]);
        setReportsStatus('unavailable');
        setIsLoading(false);
        return;
      }

      const response = await api.get('/reports', { params: { limit: 100 } });
      if (response.data?.success && response.data?.data) {
        setReports(response.data.data);
        setReportsStatus('live');
      } else if (Array.isArray(response.data)) {
        // If response is directly an array
        setReports(response.data);
        setReportsStatus('live');
      } else if (response.data?.reports) {
        // If response has reports property
        setReports(response.data.reports);
        setReportsStatus('live');
      } else {
        console.error('Unexpected response format:', response.data);
        setReports([]);
        setReportsStatus('unavailable');
      }
    } catch (error: any) {
      console.error('Error fetching reports:', error);
      setReports([]);
      setReportsStatus('unavailable');
      const errorMessage = error.response?.data?.message || error.message || 'Failed to load reports';
      toast({
        variant: 'destructive',
        title: 'Error',
        description: errorMessage
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpload = async () => {
    if (!uploadFile) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Please select a file to upload'
      });
      return;
    }

    try {
      setIsUploading(true);
      const token = localStorage.getItem('token');
      if (!token) {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Please login to upload reports'
        });
        return;
      }

      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('reportType', uploadType);
      if (uploadDescription) formData.append('description', uploadDescription);
      if (uploadTestName) formData.append('testName', uploadTestName);
      if (uploadLabName) formData.append('labName', uploadLabName);

      const response = await api.post('/reports', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const data = response.data;

      if (data?.success) {
        toast({
          title: 'Success',
          description: 'Report uploaded successfully'
        });
        setShowUploadDialog(false);
        setUploadFile(null);
        setUploadDescription('');
        setUploadTestName('');
        setUploadLabName('');
        fetchReports(); // Refresh list
      } else {
        toast({
          variant: 'destructive',
          title: 'Upload Failed',
          description: data?.message || 'Failed to upload report'
        });
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to upload report'
      });
    } finally {
      setIsUploading(false);
    }
  };

  const filteredReports = reports.filter(report =>
    (filterType === 'all' || report.reportType === filterType) &&
    (report.fileName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      report.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      report.testName?.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const getTypeIcon = (type: string) => {
    const icons = {
      lab: '🧪',
      prescription: '💊',
      imaging: '🔬',
      general: '📄'
    };
    return icons[type as keyof typeof icons] || '📄';
  };

  const getTypeColor = (type: string) => {
    const colors = {
      lab: 'bg-cyan-100 text-cyan-800',
      prescription: 'bg-purple-100 text-purple-800',
      imaging: 'bg-blue-100 text-blue-800',
      general: 'bg-gray-100 text-gray-800'
    };
    return colors[type as keyof typeof colors];
  };

  // Raw upload filenames (e.g. "rn_image_picker_lib_temp_b2d77114....jpg")
  // and single-character testName values are not meant for display - show a
  // human-friendly label instead, falling back through reportType + date.
  const TYPE_LABELS: Record<string, string> = { lab: 'Lab Report', imaging: 'Imaging Report', prescription: 'Prescription', general: 'Report' };
  const getDisplayName = (report: Report): string => {
    const testName = report.testName?.trim();
    if (testName && testName.length >= 3) return testName;
    const label = TYPE_LABELS[report.reportType] || 'Report';
    const date = report.reportDate || report.uploadedAt;
    return date ? `${label} - ${new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : label;
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const typeCounts = {
    total: reports.length,
    lab: reports.filter(r => r.reportType === 'lab').length,
    prescription: reports.filter(r => r.reportType === 'prescription').length,
    imaging: reports.filter(r => r.reportType === 'imaging').length,
    general: reports.filter(r => r.reportType === 'general').length,
  };

  const handlePreviewReport = async (report: Report) => {
    try {
      await previewReport({
        reportId: report.id,
        fileName: report.fileName,
        fallbackUrl: report.fileUrl,
      });
    } catch (error: any) {
      toast({
        title: 'Preview unavailable',
        description: error?.message || 'Could not open this report right now',
        variant: 'destructive'
      });
    }
  };

  const handleDownloadReport = async (report: Report) => {
    try {
      await downloadReport({
        reportId: report.id,
        fileName: report.fileName,
        fallbackUrl: report.fileUrl,
      });
    } catch (error: any) {
      toast({
        title: 'Download unavailable',
        description: error?.message || 'Could not download this report right now',
        variant: 'destructive'
      });
    }
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
                <FileStack className="w-6 h-6" />
              </div>
              <Badge className="bg-white/10 text-white/90 border-white/20 font-medium">
                Medical Records
              </Badge>
              <Badge className={reportsStatus === 'live' ? 'bg-emerald-500/20 text-emerald-100 border-emerald-300/20' : 'bg-amber-500/20 text-amber-100 border-amber-300/20'}>
                {reportsStatus === 'live' ? 'Live Reports' : 'Reports Limited'}
              </Badge>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold mb-2">My Reports</h1>
            <p className="text-slate-300 text-sm md:text-base">Access all your medical reports and documents</p>
          </div>
          <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-white shadow-lg shadow-teal-500/30">
                <Upload className="h-4 w-4 mr-2" />
                Upload Report
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Upload Medical Report</DialogTitle>
                <DialogDescription>
                  Upload a new medical report or document
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Report Type</label>
                  <select
                    className="w-full border border-slate-200 dark:border-slate-600 rounded-md p-2 bg-white dark:bg-slate-700"
                    value={uploadType}
                    onChange={(e) => setUploadType(e.target.value)}
                  >
                    <option value="lab">Lab Report</option>
                    <option value="prescription">Prescription</option>
                    <option value="imaging">Imaging/Scan</option>
                    <option value="general">General Report</option>
                  </select>
                </div>
                {uploadType === 'lab' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium mb-2">Test Name (Optional)</label>
                      <Input
                        placeholder="e.g., Complete Blood Count"
                        value={uploadTestName}
                        onChange={(e) => setUploadTestName(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Lab Name (Optional)</label>
                      <Input
                        placeholder="e.g., City Lab"
                        value={uploadLabName}
                        onChange={(e) => setUploadLabName(e.target.value)}
                      />
                    </div>
                  </>
                )}
                <div>
                  <label className="block text-sm font-medium mb-2">Description (Optional)</label>
                  <Input
                    placeholder="Brief description"
                    value={uploadDescription}
                    onChange={(e) => setUploadDescription(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">File</label>
                  <Input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.tiff,.webp"
                    onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  />
                  {uploadFile && (
                    <p className="text-sm text-gray-500 mt-1">
                      Selected: {uploadFile.name} ({formatFileSize(uploadFile.size)})
                    </p>
                  )}
                </div>
                <Button
                  className="w-full bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700"
                  onClick={handleUpload}
                  disabled={isUploading || !uploadFile}
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Upload Report
                    </>
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
        <Card
          className="cursor-pointer transition-shadow hover:shadow-md"
          onClick={() => setFilterType('all')}
        >
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-gray-900">{typeCounts.total}</div>
              <div className="text-sm text-gray-600">Total Reports</div>
            </div>
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer transition-shadow hover:shadow-md"
          onClick={() => setFilterType('lab')}
        >
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-cyan-600">{typeCounts.lab}</div>
              <div className="text-sm text-gray-600">Lab Reports</div>
            </div>
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer transition-shadow hover:shadow-md"
          onClick={() => setFilterType('imaging')}
        >
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600">{typeCounts.imaging}</div>
              <div className="text-sm text-gray-600">Imaging</div>
            </div>
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer transition-shadow hover:shadow-md"
          onClick={() => setFilterType('prescription')}
        >
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-purple-600">{typeCounts.prescription}</div>
              <div className="text-sm text-gray-600">Prescriptions</div>
            </div>
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer transition-shadow hover:shadow-md"
          onClick={() => setFilterType('general')}
        >
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-gray-600">{typeCounts.general}</div>
              <div className="text-sm text-gray-600">General</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search reports..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant={filterType === 'all' ? 'default' : 'outline'}
                onClick={() => setFilterType('all')}
                size="sm"
              >
                All
              </Button>
              <Button
                variant={filterType === 'lab' ? 'default' : 'outline'}
                onClick={() => setFilterType('lab')}
                size="sm"
              >
                Lab
              </Button>
              <Button
                variant={filterType === 'imaging' ? 'default' : 'outline'}
                onClick={() => setFilterType('imaging')}
                size="sm"
              >
                Imaging
              </Button>
              <Button
                variant={filterType === 'prescription' ? 'default' : 'outline'}
                onClick={() => setFilterType('prescription')}
                size="sm"
              >
                Prescription
              </Button>
              <Button
                variant={filterType === 'general' ? 'default' : 'outline'}
                onClick={() => setFilterType('general')}
                size="sm"
              >
                General
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reports Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-teal-600 dark:text-teal-400" />
          <span className="ml-2 text-gray-600 dark:text-slate-400">Loading your reports...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredReports.map((report) => (
            <Card key={report.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="text-4xl mb-2">{getTypeIcon(report.reportType)}</div>
                  <Badge className={getTypeColor(report.reportType)}>
                    {report.reportType.replace('_', ' ')}
                  </Badge>
                </div>
                <CardTitle
                  className="text-lg leading-snug break-words overflow-hidden [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]"
                  title={report.fileName}
                >
                  {getDisplayName(report)}
                </CardTitle>
                {report.description && (
                  <CardDescription className="break-words overflow-hidden [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                    {report.description}
                  </CardDescription>
                )}
                {report.testName && report.testName.trim().length >= 3 && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 break-words">
                    <span className="font-medium">Test:</span>{' '}
                    <span className="break-all">{report.testName}</span>
                  </p>
                )}
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center text-sm text-gray-600">
                    <Calendar className="h-4 w-4 mr-2" />
                    <span>{new Date(report.uploadedAt).toLocaleDateString()}</span>
                  </div>
                  {report.labName && (
                    <div className="text-sm text-gray-600">
                      <span className="font-medium">Lab:</span> {report.labName}
                    </div>
                  )}
                  {report.fileSize && (
                    <div className="text-sm text-gray-600">
                      <span className="font-medium">Size:</span> {formatFileSize(report.fileSize)}
                    </div>
                  )}
                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => handlePreviewReport(report)}
                    >
                      <Eye className="h-3 w-3 mr-1" />
                      View
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => handleDownloadReport(report)}
                    >
                      <Download className="h-3 w-3 mr-1" />
                      Download
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!isLoading && reportsStatus === 'unavailable' && (
        <InlineError message="Couldn't load your reports." onRetry={fetchReports} className="mb-4" />
      )}

      {!isLoading && reportsStatus !== 'unavailable' && filteredReports.length === 0 && (
        <EmptyState
          icon={FileStack}
          title="No reports yet"
          description="Upload your first medical report to keep all your records in one place."
          action={{ label: 'Upload a report', onClick: () => setShowUploadDialog(true) }}
        />
      )}
    </div>
  );
};

export default MyReports;
