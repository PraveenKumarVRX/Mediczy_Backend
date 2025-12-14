import { useState } from 'react';
import { FlaskConical, Calendar, MapPin, Download, Plus, Search, Filter } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

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

  const filteredTests = tests.filter(test => 
    (filterStatus === 'all' || test.status === filterStatus) &&
    (test.testName.toLowerCase().includes(searchTerm.toLowerCase()) ||
     test.category.toLowerCase().includes(searchTerm.toLowerCase()))
  );

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
    <div className="min-h-screen bg-gradient-to-br from-cyan-50 via-white to-blue-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <FlaskConical className="h-8 w-8 text-cyan-600" />
                <h1 className="text-3xl font-bold text-gray-900">Lab Tests</h1>
              </div>
              <p className="text-gray-600">Manage and track your laboratory tests</p>
            </div>
            <Dialog open={showBookDialog} onOpenChange={setShowBookDialog}>
              <DialogTrigger asChild>
                <Button className="bg-cyan-600 hover:bg-cyan-700">
                  <Plus className="h-4 w-4 mr-2" />
                  Book Lab Test
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Book New Lab Test</DialogTitle>
                  <DialogDescription>
                    Schedule a new laboratory test
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Test Name</Label>
                    <Input placeholder="e.g., Blood Sugar, Thyroid Profile" />
                  </div>
                  <div>
                    <Label>Preferred Date</Label>
                    <Input type="date" />
                  </div>
                  <div>
                    <Label>Preferred Location</Label>
                    <Input placeholder="Home Collection or Lab Address" />
                  </div>
                  <div>
                    <Label>Special Instructions</Label>
                    <Textarea placeholder="Any fasting requirements or special notes..." />
                  </div>
                  <Button className="w-full bg-cyan-600 hover:bg-cyan-700">
                    Book Appointment
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
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search tests..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex gap-2 flex-wrap">
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

        {/* Tests List */}
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
          <Card>
            <CardContent className="py-12">
              <div className="text-center text-gray-500">
                <FlaskConical className="h-12 w-12 mx-auto mb-4 opacity-20" />
                <p>No lab tests found</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default LabTests;
