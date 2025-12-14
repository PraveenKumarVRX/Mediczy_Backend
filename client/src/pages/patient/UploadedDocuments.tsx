import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { FileText, Upload, Download, Eye, Trash2, Calendar, Search, Filter, File, FileImage, FilePlus } from 'lucide-react';

interface Document {
  id: string;
  name: string;
  type: 'prescription' | 'lab_report' | 'medical_record' | 'insurance' | 'bill' | 'other';
  fileType: string;
  size: string;
  uploadDate: Date;
  uploadedBy: string;
  tags: string[];
  description?: string;
}

const UploadedDocuments: React.FC = () => {
  const [documents, setDocuments] = useState<Document[]>([
    {
      id: '1',
      name: 'Blood Test Report - Dec 2024',
      type: 'lab_report',
      fileType: 'PDF',
      size: '2.3 MB',
      uploadDate: new Date('2024-12-15'),
      uploadedBy: 'Self',
      tags: ['Blood Test', 'Routine Checkup'],
      description: 'Comprehensive blood test results'
    },
    {
      id: '2',
      name: 'Prescription - Dr. Kumar',
      type: 'prescription',
      fileType: 'PDF',
      size: '1.1 MB',
      uploadDate: new Date('2024-12-20'),
      uploadedBy: 'Dr. Rajesh Kumar',
      tags: ['Antibiotics', 'Follow-up']
    },
    {
      id: '3',
      name: 'Insurance Card',
      type: 'insurance',
      fileType: 'JPG',
      size: '856 KB',
      uploadDate: new Date('2024-11-10'),
      uploadedBy: 'Self',
      tags: ['Insurance', 'ID Card']
    },
    {
      id: '4',
      name: 'X-Ray Chest',
      type: 'medical_record',
      fileType: 'PNG',
      size: '3.8 MB',
      uploadDate: new Date('2024-10-05'),
      uploadedBy: 'City Hospital',
      tags: ['X-Ray', 'Imaging']
    },
    {
      id: '5',
      name: 'Hospital Bill - Jan 2025',
      type: 'bill',
      fileType: 'PDF',
      size: '542 KB',
      uploadDate: new Date('2025-01-10'),
      uploadedBy: 'Apollo Hospital',
      tags: ['Bill', 'Payment']
    }
  ]);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [newDocument, setNewDocument] = useState({
    name: '',
    type: 'other',
    description: '',
    tags: ''
  });

  const documentTypes = [
    { value: 'all', label: 'All Documents', icon: File },
    { value: 'prescription', label: 'Prescriptions', icon: FileText },
    { value: 'lab_report', label: 'Lab Reports', icon: FileText },
    { value: 'medical_record', label: 'Medical Records', icon: FileText },
    { value: 'insurance', label: 'Insurance', icon: FileText },
    { value: 'bill', label: 'Bills', icon: FileText },
    { value: 'other', label: 'Other', icon: File }
  ];

  const getTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      prescription: 'bg-blue-100 text-blue-800',
      lab_report: 'bg-purple-100 text-purple-800',
      medical_record: 'bg-green-100 text-green-800',
      insurance: 'bg-orange-100 text-orange-800',
      bill: 'bg-red-100 text-red-800',
      other: 'bg-gray-100 text-gray-800'
    };
    return (
      <Badge className={colors[type]}>
        {documentTypes.find(t => t.value === type)?.label || type}
      </Badge>
    );
  };

  const filteredDocuments = documents
    .filter(doc => selectedType === 'all' || doc.type === selectedType)
    .filter(doc => 
      doc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()))
    );

  const handleUpload = () => {
    if (!newDocument.name) return;

    const document: Document = {
      id: Date.now().toString(),
      name: newDocument.name,
      type: newDocument.type as Document['type'],
      fileType: 'PDF',
      size: '1.2 MB',
      uploadDate: new Date(),
      uploadedBy: 'Self',
      tags: newDocument.tags.split(',').map(tag => tag.trim()).filter(tag => tag),
      description: newDocument.description
    };

    setDocuments([document, ...documents]);
    setIsUploadDialogOpen(false);
    setNewDocument({ name: '', type: 'other', description: '', tags: '' });
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this document?')) {
      setDocuments(documents.filter(doc => doc.id !== id));
    }
  };

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Uploaded Documents</h1>
          <p className="text-gray-600 mt-1">Manage your medical documents</p>
        </div>
        <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Upload className="mr-2 h-4 w-4" />
              Upload Document
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Upload New Document</DialogTitle>
              <DialogDescription>Add a new medical document to your records</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="doc-name">Document Name</Label>
                <Input
                  id="doc-name"
                  placeholder="e.g., Blood Test Report"
                  value={newDocument.name}
                  onChange={(e) => setNewDocument({ ...newDocument, name: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="doc-type">Document Type</Label>
                <select
                  id="doc-type"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={newDocument.type}
                  onChange={(e) => setNewDocument({ ...newDocument, type: e.target.value })}
                >
                  {documentTypes.filter(t => t.value !== 'all').map(type => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="description">Description (Optional)</Label>
                <Input
                  id="description"
                  placeholder="Brief description"
                  value={newDocument.description}
                  onChange={(e) => setNewDocument({ ...newDocument, description: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="tags">Tags (comma separated)</Label>
                <Input
                  id="tags"
                  placeholder="e.g., Blood Test, Routine"
                  value={newDocument.tags}
                  onChange={(e) => setNewDocument({ ...newDocument, tags: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="file">Select File</Label>
                <div className="flex items-center justify-center w-full">
                  <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <FilePlus className="h-8 w-8 text-gray-400 mb-2" />
                      <p className="text-sm text-gray-500">
                        <span className="font-semibold">Click to upload</span> or drag and drop
                      </p>
                      <p className="text-xs text-gray-500">PDF, PNG, JPG up to 10MB</p>
                    </div>
                    <input id="file" type="file" className="hidden" />
                  </label>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsUploadDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleUpload}>Upload</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search and Filter */}
      <div className="flex gap-4 mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search documents..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button variant="outline">
          <Filter className="mr-2 h-4 w-4" />
          Filter
        </Button>
      </div>

      {/* Type Filter Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {documentTypes.map(type => (
          <Button
            key={type.value}
            variant={selectedType === type.value ? 'default' : 'outline'}
            onClick={() => setSelectedType(type.value)}
            size="sm"
          >
            {type.label}
          </Button>
        ))}
      </div>

      {/* Documents Stats */}
      <div className="grid md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Total Documents</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{documents.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Prescriptions</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {documents.filter(d => d.type === 'prescription').length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Lab Reports</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {documents.filter(d => d.type === 'lab_report').length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Total Size</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">8.6 MB</p>
          </CardContent>
        </Card>
      </div>

      {/* Documents Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredDocuments.length === 0 ? (
          <div className="col-span-full text-center py-12 text-gray-500">
            <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No documents found</p>
          </div>
        ) : (
          filteredDocuments.map((doc) => (
            <Card key={doc.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      {doc.fileType === 'PDF' ? (
                        <FileText className="h-6 w-6 text-blue-600" />
                      ) : (
                        <FileImage className="h-6 w-6 text-blue-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base truncate">{doc.name}</CardTitle>
                      <CardDescription>
                        {doc.fileType} • {doc.size}
                      </CardDescription>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div>{getTypeBadge(doc.type)}</div>
                  
                  {doc.description && (
                    <p className="text-sm text-gray-600">{doc.description}</p>
                  )}

                  <div className="flex flex-wrap gap-1">
                    {doc.tags.map((tag, index) => (
                      <Badge key={index} variant="outline" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>

                  <div className="text-xs text-gray-500 space-y-1">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Uploaded: {new Date(doc.uploadDate).toLocaleDateString()}
                    </div>
                    <div>By: {doc.uploadedBy}</div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" size="sm" className="flex-1">
                      <Eye className="mr-2 h-4 w-4" />
                      View
                    </Button>
                    <Button variant="outline" size="sm">
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleDelete(doc.id)}
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};

export default UploadedDocuments;
