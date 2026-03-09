import { useState, useEffect, useRef } from 'react';
import InsurancePortalLayout from '@/components/hospital-insurance/InsurancePortalLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import api from '@/utils/api';
import { useToast } from '@/hooks/use-toast';
import {
  Upload, Download, FileText, CheckCircle2, Trash2,
  File, FilePlus, X
} from 'lucide-react';

const DOCUMENT_TYPES = [
  'Discharge Summary', 'Investigation Report', 'Pre-Auth Form', 'Claim Form',
  'Bill/Invoice', 'Prescription', 'ID Proof', 'Insurance Card', 'MLC/FIR',
  'Surgical Notes', 'Implant Invoice', 'Pharmacy Bill', 'Other'
];

const ACCREDITATION_TYPES = [
  { key: 'nabh', label: 'NABH Certificate', },
  { key: 'nabl', label: 'NABL Certificate' },
  { key: 'iso', label: 'ISO Certificate' },
  { key: 'eqas', label: 'EQAS Certificate' },
  { key: 'tax_exemption', label: 'Tax Exemption Certificate' },
  { key: 'service_tax', label: 'Service Tax Registration' },
  { key: 'pan', label: 'PAN Copy' },
  { key: 'cancelled_cheque', label: 'Cancelled Cheque' },
  { key: 'tariff_ip', label: 'Tariff-IP' },
];

const InsuranceDocumentsPage = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('missing');
  const [missingDocs, setMissingDocs] = useState<any[]>([]);
  const [uploadedDocs, setUploadedDocs] = useState<any[]>([]);
  const [accreditationDocs, setAccreditationDocs] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadForm, setUploadForm] = useState({ claimId: '', docType: '', files: [] as File[] });
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchDocuments();
  }, [activeTab]);

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      if (activeTab === 'missing') {
        const { data } = await api.get('/hospital/insurance/documents/missing');
        if (data.success) setMissingDocs(data.claims || data.missing || []);
      }
    } catch (_e) { /* ignore */ }
    finally { setLoading(false); }
  };

  const handleFileSelect = (files: FileList | null) => {
    if (!files) return;
    setUploadForm(f => ({ ...f, files: [...f.files, ...Array.from(files)] }));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const handleUpload = async () => {
    if (uploadForm.files.length === 0) {
      toast({ title: 'No files', description: 'Please select files to upload', variant: 'destructive' });
      return;
    }
    try {
      const formData = new FormData();
      uploadForm.files.forEach((file) => formData.append('documents', file));
      formData.append('claimId', uploadForm.claimId);
      formData.append('docType', uploadForm.docType);

      const { data } = await api.post('/hospital/insurance/documents/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      if (data.success) {
        toast({ title: 'Uploaded', description: 'Documents uploaded successfully.' });
        setShowUpload(false);
        setUploadForm({ claimId: '', docType: '', files: [] });
        fetchDocuments();
      }
    } catch (err: any) {
      toast({ title: 'Upload Failed', description: err?.response?.data?.message || 'Upload error', variant: 'destructive' });
    }
  };

  const handleAccreditationUpload = async (key: string, file: File) => {
    try {
      const formData = new FormData();
      formData.append('document', file);
      formData.append('type', key);

      const { data } = await api.post('/hospital/insurance/documents/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      if (data.success) {
        setAccreditationDocs(prev => ({ ...prev, [key]: { uploaded: true, fileName: file.name } }));
        toast({ title: 'Uploaded', description: `${key.toUpperCase()} certificate uploaded.` });
      }
    } catch {
      toast({ title: 'Failed', description: `Failed to upload ${key} certificate`, variant: 'destructive' });
    }
  };

  return (
    <InsurancePortalLayout title="Document Center" subtitle="Manage claim documents & accreditations">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="missing">Missing Documents</TabsTrigger>
              <TabsTrigger value="uploaded">Uploaded</TabsTrigger>
              <TabsTrigger value="accreditation">Accreditation</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button size="sm" onClick={() => setShowUpload(true)}>
            <FilePlus className="h-4 w-4 mr-1" /> Upload Documents
          </Button>
        </div>

        {/* Missing Documents Tab */}
        {activeTab === 'missing' && (
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800">
                  <tr>
                    <th className="py-3 px-4 text-left font-medium">Claim #</th>
                    <th className="py-3 px-4 text-left font-medium">Patient</th>
                    <th className="py-3 px-4 text-left font-medium">Missing Documents</th>
                    <th className="py-3 px-4 text-left font-medium">Status</th>
                    <th className="py-3 px-4 text-center font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">Loading...</td></tr>
                  ) : missingDocs.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">
                      <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
                      All documents are complete
                    </td></tr>
                  ) : (
                    missingDocs.map((doc: any) => (
                      <tr key={doc.id} className="border-b hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="py-3 px-4 font-mono text-xs">{doc.claimNumber || `CLM-${doc.id}`}</td>
                        <td className="py-3 px-4">{doc.patientName || '—'}</td>
                        <td className="py-3 px-4">
                          <div className="flex flex-wrap gap-1">
                            {(doc.missingDocs || ['Discharge Summary']).map((d: string, i: number) => (
                              <Badge key={i} variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200">
                                {d}
                              </Badge>
                            ))}
                          </div>
                        </td>
                        <td className="py-3 px-4"><Badge className="bg-amber-100 text-amber-700">Incomplete</Badge></td>
                        <td className="py-3 px-4 text-center">
                          <Button variant="outline" size="sm" onClick={() => { setUploadForm(f => ({ ...f, claimId: doc.id?.toString() || '' })); setShowUpload(true); }}>
                            <Upload className="h-3 w-3 mr-1" /> Upload
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}

        {/* Uploaded Documents Tab */}
        {activeTab === 'uploaded' && (
          <Card>
            <CardContent className="p-6">
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-2 opacity-30" />
                <p>Uploaded documents for your claims appear here.</p>
                <p className="text-xs mt-1">Upload documents using the button above or from the Documents section in claim details.</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Accreditation Tab */}
        {activeTab === 'accreditation' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {ACCREDITATION_TYPES.map((cert) => {
              const doc = accreditationDocs[cert.key];
              return (
                <Card key={cert.key} className={doc?.uploaded ? 'border-green-200 bg-green-50/50' : ''}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <FileText className={`h-5 w-5 ${doc?.uploaded ? 'text-green-600' : 'text-slate-400'}`} />
                        <span className="font-medium text-sm">{cert.label}</span>
                      </div>
                      {doc?.uploaded && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                    </div>
                    {doc?.uploaded ? (
                      <div>
                        <p className="text-xs text-green-600 mb-2">{doc.fileName}</p>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" className="text-xs h-7">
                            <Download className="h-3 w-3 mr-1" /> Download
                          </Button>
                          <Button variant="ghost" size="sm" className="text-xs h-7 text-red-600">
                            <Trash2 className="h-3 w-3 mr-1" /> Remove
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <input
                          type="file"
                          id={`acc-${cert.key}`}
                          className="hidden"
                          accept=".pdf,.jpg,.jpeg,.png"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleAccreditationUpload(cert.key, file);
                          }}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full text-xs"
                          onClick={() => document.getElementById(`acc-${cert.key}`)?.click()}
                        >
                          <Upload className="h-3 w-3 mr-1" /> Upload
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Upload Dialog */}
        <Dialog open={showUpload} onOpenChange={setShowUpload}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Upload Documents</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Claim ID</label>
                <Input value={uploadForm.claimId} onChange={(e) => setUploadForm(f => ({ ...f, claimId: e.target.value }))} placeholder="Enter claim ID" />
              </div>
              <div>
                <label className="text-sm font-medium">Document Type</label>
                <Select value={uploadForm.docType} onValueChange={(v) => setUploadForm(f => ({ ...f, docType: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    {DOCUMENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Drag & Drop Area */}
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                  dragOver ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 hover:border-indigo-400'
                }`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-8 w-8 mx-auto mb-2 text-slate-400" />
                <p className="text-sm font-medium">Drag & drop files here</p>
                <p className="text-xs text-muted-foreground mt-1">or click to browse (PDF, JPG, PNG)</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                  className="hidden"
                  onChange={(e) => handleFileSelect(e.target.files)}
                />
              </div>

              {/* File List */}
              {uploadForm.files.length > 0 && (
                <div className="space-y-2">
                  {uploadForm.files.map((file, i) => (
                    <div key={i} className="flex items-center justify-between p-2 bg-slate-50 rounded">
                      <div className="flex items-center gap-2">
                        <File className="h-4 w-4 text-indigo-500" />
                        <span className="text-sm">{file.name}</span>
                        <span className="text-xs text-muted-foreground">({(file.size / 1024).toFixed(1)} KB)</span>
                      </div>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setUploadForm(f => ({ ...f, files: f.files.filter((_, idx) => idx !== i) }))}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowUpload(false)}>Cancel</Button>
              <Button onClick={handleUpload} disabled={uploadForm.files.length === 0}>
                <Upload className="h-4 w-4 mr-1" /> Upload {uploadForm.files.length} file(s)
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </InsurancePortalLayout>
  );
};

export default InsuranceDocumentsPage;
