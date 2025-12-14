import { useState } from 'react';
import { FileText, Download, Eye, Upload, Search, Calendar, Filter } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

interface Report {
  id: string;
  title: string;
  type: 'lab' | 'prescription' | 'imaging' | 'discharge' | 'medical_record';
  date: string;
  doctor?: string;
  fileSize?: string;
  description?: string;
}

const MyReports = () => {
  const [reports, setReports] = useState<Report[]>([
    {
      id: '1',
      title: 'Complete Blood Count Report',
      type: 'lab',
      date: '2024-01-15',
      doctor: 'Dr. Sharma',
      fileSize: '2.4 MB',
      description: 'CBC test results with all parameters'
    },
    {
      id: '2',
      title: 'Chest X-Ray',
      type: 'imaging',
      date: '2024-01-10',
      doctor: 'Dr. Patel',
      fileSize: '5.1 MB',
      description: 'Digital chest X-ray imaging'
    },
    {
      id: '3',
      title: 'Prescription - Hypertension',
      type: 'prescription',
      date: '2024-01-08',
      doctor: 'Dr. Kumar',
      fileSize: '156 KB',
      description: 'Medication prescription for blood pressure management'
    },
    {
      id: '4',
      title: 'Lipid Profile Report',
      type: 'lab',
      date: '2024-01-05',
      doctor: 'Dr. Sharma',
      fileSize: '1.8 MB',
      description: 'Cholesterol and triglycerides test'
    },
    {
      id: '5',
      title: 'MRI Scan - Brain',
      type: 'imaging',
      date: '2023-12-20',
      doctor: 'Dr. Reddy',
      fileSize: '12.3 MB',
      description: 'Brain MRI scan with contrast'
    }
  ]);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');

  const filteredReports = reports.filter(report =>
    (filterType === 'all' || report.type === filterType) &&
    (report.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
     report.description?.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const getTypeIcon = (type: string) => {
    const icons = {
      lab: '🧪',
      prescription: '💊',
      imaging: '🔬',
      discharge: '📋',
      medical_record: '📝'
    };
    return icons[type as keyof typeof icons] || '📄';
  };

  const getTypeColor = (type: string) => {
    const colors = {
      lab: 'bg-cyan-100 text-cyan-800',
      prescription: 'bg-purple-100 text-purple-800',
      imaging: 'bg-blue-100 text-blue-800',
      discharge: 'bg-green-100 text-green-800',
      medical_record: 'bg-gray-100 text-gray-800'
    };
    return colors[type as keyof typeof colors];
  };

  const typeCounts = {
    total: reports.length,
    lab: reports.filter(r => r.type === 'lab').length,
    prescription: reports.filter(r => r.type === 'prescription').length,
    imaging: reports.filter(r => r.type === 'imaging').length
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <FileText className="h-8 w-8 text-purple-600" />
                <h1 className="text-3xl font-bold text-gray-900">My Reports</h1>
              </div>
              <p className="text-gray-600">Access all your medical reports and documents</p>
            </div>
            <Dialog>
              <DialogTrigger asChild>
                <Button className="bg-purple-600 hover:bg-purple-700">
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
                    <label className="block text-sm font-medium mb-2">Report Title</label>
                    <Input placeholder="e.g., Blood Test Report" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Report Type</label>
                    <select className="w-full border rounded-md p-2">
                      <option value="lab">Lab Report</option>
                      <option value="prescription">Prescription</option>
                      <option value="imaging">Imaging/Scan</option>
                      <option value="discharge">Discharge Summary</option>
                      <option value="medical_record">Medical Record</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">File</label>
                    <Input type="file" accept=".pdf,.jpg,.jpeg,.png" />
                  </div>
                  <Button className="w-full bg-purple-600 hover:bg-purple-700">
                    Upload Report
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
                <div className="text-3xl font-bold text-gray-900">{typeCounts.total}</div>
                <div className="text-sm text-gray-600">Total Reports</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-cyan-600">{typeCounts.lab}</div>
                <div className="text-sm text-gray-600">Lab Reports</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600">{typeCounts.imaging}</div>
                <div className="text-sm text-gray-600">Imaging</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-purple-600">{typeCounts.prescription}</div>
                <div className="text-sm text-gray-600">Prescriptions</div>
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
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Reports Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredReports.map((report) => (
            <Card key={report.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="text-4xl mb-2">{getTypeIcon(report.type)}</div>
                  <Badge className={getTypeColor(report.type)}>
                    {report.type.replace('_', ' ')}
                  </Badge>
                </div>
                <CardTitle className="text-lg">{report.title}</CardTitle>
                <CardDescription>{report.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center text-sm text-gray-600">
                    <Calendar className="h-4 w-4 mr-2" />
                    <span>{new Date(report.date).toLocaleDateString()}</span>
                  </div>
                  {report.doctor && (
                    <div className="text-sm text-gray-600">
                      <span className="font-medium">Doctor:</span> {report.doctor}
                    </div>
                  )}
                  {report.fileSize && (
                    <div className="text-sm text-gray-600">
                      <span className="font-medium">Size:</span> {report.fileSize}
                    </div>
                  )}
                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" size="sm" className="flex-1">
                      <Eye className="h-3 w-3 mr-1" />
                      View
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1">
                      <Download className="h-3 w-3 mr-1" />
                      Download
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {filteredReports.length === 0 && (
          <Card>
            <CardContent className="py-12">
              <div className="text-center text-gray-500">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-20" />
                <p>No reports found</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default MyReports;
