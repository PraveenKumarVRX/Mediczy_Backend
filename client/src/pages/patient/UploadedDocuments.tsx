import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { FileText, Upload, Download, Eye, Trash2, Calendar, Search, File, FileImage, FilePlus, FolderOpen, HardDrive, Loader2 } from 'lucide-react';
import MainLayout from '@/components/layout/MainLayout';
import { useToast } from '@/hooks/use-toast';
import { downloadReport, previewReport } from '@/utils/reportActions';
import api from '@/utils/api';

interface Document {
  id: string;
  fileName: string;
  reportType: 'prescription' | 'lab' | 'imaging' | 'general';
  mimeType: string;
  fileSize: number;
  uploadedAt: string;
  description?: string;
  testName?: string;
  labName?: string;
  fileUrl?: string;
}

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.06 } } };
const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [.25,.46,.45,.94] } } };

const typeColors: Record<string, { bg: string; text: string; dark: string }> = {
  prescription: { bg: 'bg-blue-100', text: 'text-blue-700', dark: 'dark:bg-blue-900/40 dark:text-blue-300' },
  lab:          { bg: 'bg-violet-100', text: 'text-violet-700', dark: 'dark:bg-violet-900/40 dark:text-violet-300' },
  imaging:      { bg: 'bg-emerald-100', text: 'text-emerald-700', dark: 'dark:bg-emerald-900/40 dark:text-emerald-300' },
  general:      { bg: 'bg-slate-100', text: 'text-slate-700', dark: 'dark:bg-slate-800 dark:text-slate-300' },
};

const typeLabels: Record<string, string> = {
  prescription: 'Prescription',
  lab: 'Lab Report',
  imaging: 'Imaging',
  general: 'General',
};

const formatFileSize = (bytes: number) => {
  if (!bytes) return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

const UploadedDocuments: React.FC = () => {
  const { toast } = useToast();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadType, setUploadType] = useState('lab');
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadTestName, setUploadTestName] = useState('');
  const [uploadLabName, setUploadLabName] = useState('');

  useEffect(() => { fetchDocuments(); }, []);

  const fetchDocuments = async () => {
    try {
      setIsLoading(true);
      const res = await api.get('/reports', { params: { limit: 200 } });
      const data = res.data?.data ?? res.data?.reports ?? (Array.isArray(res.data) ? res.data : []);
      setDocuments(data);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.response?.data?.message || 'Failed to load documents' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpload = async () => {
    if (!uploadFile) {
      toast({ variant: 'destructive', title: 'Error', description: 'Please select a file' });
      return;
    }
    try {
      setIsUploading(true);
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('reportType', uploadType);
      if (uploadDescription) formData.append('description', uploadDescription);
      if (uploadTestName) formData.append('testName', uploadTestName);
      if (uploadLabName) formData.append('labName', uploadLabName);
      await api.post('/reports', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast({ title: 'Uploaded', description: 'Document saved successfully.' });
      setIsUploadDialogOpen(false);
      setUploadFile(null);
      setUploadDescription('');
      setUploadTestName('');
      setUploadLabName('');
      fetchDocuments();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Upload failed', description: err.response?.data?.message || 'Upload error' });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this document? This cannot be undone.')) return;
    try {
      await api.delete(`/reports/${id}`);
      setDocuments(prev => prev.filter(d => d.id !== id));
      toast({ title: 'Deleted', description: 'Document removed.' });
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to delete document.' });
    }
  };

  const filteredDocuments = documents.filter(doc =>
    (selectedType === 'all' || doc.reportType === selectedType) &&
    (doc.fileName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.testName?.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const typeCounts = {
    prescription: documents.filter(d => d.reportType === 'prescription').length,
    lab: documents.filter(d => d.reportType === 'lab').length,
    imaging: documents.filter(d => d.reportType === 'imaging').length,
    general: documents.filter(d => d.reportType === 'general').length,
  };

  const totalSize = documents.reduce((acc, d) => acc + (d.fileSize || 0), 0);

  const statCards = [
    { label: 'Total Documents', value: documents.length, gradient: 'from-slate-600 to-slate-800', icon: FolderOpen },
    { label: 'Prescriptions', value: typeCounts.prescription, gradient: 'from-blue-500 to-indigo-600', icon: FileText },
    { label: 'Lab Reports', value: typeCounts.lab, gradient: 'from-violet-500 to-purple-600', icon: FileText },
    { label: 'Total Size', value: formatFileSize(totalSize), gradient: 'from-emerald-500 to-teal-600', icon: HardDrive },
  ];

  const documentTypeOptions = [
    { value: 'all', label: 'All' },
    { value: 'prescription', label: 'Prescriptions' },
    { value: 'lab', label: 'Lab Reports' },
    { value: 'imaging', label: 'Imaging' },
    { value: 'general', label: 'General' },
  ];

  return (
    <MainLayout>
      <motion.div initial="hidden" animate="show" variants={container} className="max-w-7xl mx-auto space-y-6 px-4 md:px-6 py-6">
        {/* Header */}
        <motion.div variants={item} className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-teal-700 via-cyan-700 to-teal-800 p-6 md:p-8 text-white shadow-2xl">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.15),transparent_60%)]" />
          <div className="relative flex items-center justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2.5 rounded-xl bg-white/15 backdrop-blur-sm shadow-lg">
                  <FolderOpen className="w-6 h-6" />
                </div>
                <Badge className="bg-white/15 text-white/90 border-white/20 font-medium">Document Vault</Badge>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold mb-1">Uploaded Documents</h1>
              <p className="text-teal-200 text-sm md:text-base">Securely manage your medical documents</p>
            </div>
            <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-white text-teal-700 hover:bg-white/90 shadow-lg font-semibold" aria-label="Upload new document">
                  <Upload className="mr-2 h-4 w-4" /> Upload Document
                </Button>
              </DialogTrigger>
              <DialogContent className="dark:bg-slate-900">
                <DialogHeader>
                  <DialogTitle>Upload New Document</DialogTitle>
                  <DialogDescription>Add a medical document to your secure records.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label>Document Type</Label>
                    <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={uploadType} onChange={e => setUploadType(e.target.value)}>
                      <option value="lab">Lab Report</option>
                      <option value="prescription">Prescription</option>
                      <option value="imaging">Imaging / Scan</option>
                      <option value="general">General</option>
                    </select>
                  </div>
                  {uploadType === 'lab' && (
                    <>
                      <div className="grid gap-2">
                        <Label>Test Name (optional)</Label>
                        <Input placeholder="e.g. Complete Blood Count" value={uploadTestName} onChange={e => setUploadTestName(e.target.value)} />
                      </div>
                      <div className="grid gap-2">
                        <Label>Lab Name (optional)</Label>
                        <Input placeholder="e.g. City Diagnostics" value={uploadLabName} onChange={e => setUploadLabName(e.target.value)} />
                      </div>
                    </>
                  )}
                  <div className="grid gap-2">
                    <Label>Description (optional)</Label>
                    <Input placeholder="Brief description" value={uploadDescription} onChange={e => setUploadDescription(e.target.value)} />
                  </div>
                  <div className="grid gap-2">
                    <Label>File</Label>
                    <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed rounded-xl cursor-pointer bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors border-slate-300 dark:border-slate-600">
                      <div className="flex flex-col items-center justify-center pt-3 pb-3">
                        <FilePlus className="h-7 w-7 text-slate-400 mb-1" />
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          {uploadFile ? uploadFile.name : <><span className="font-semibold">Click to upload</span> or drag and drop</>}
                        </p>
                        <p className="text-xs text-slate-400">PDF, PNG, JPG, TIFF up to 50MB</p>
                      </div>
                      <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.tiff,.webp" onChange={e => setUploadFile(e.target.files?.[0] || null)} />
                    </label>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsUploadDialogOpen(false)}>Cancel</Button>
                  <Button onClick={handleUpload} disabled={isUploading || !uploadFile}>
                    {isUploading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Uploading…</> : 'Upload'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </motion.div>

        {/* Stats */}
        <motion.div variants={item} className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {statCards.map(s => (
            <motion.div key={s.label} whileHover={{ scale: 1.03, y: -2 }} transition={{ type: 'spring', stiffness: 400, damping: 25 }}>
              <Card className="relative overflow-hidden border-0 shadow-lg dark:bg-slate-800/60">
                <div className={`absolute inset-0 bg-gradient-to-br ${s.gradient} opacity-[0.07] dark:opacity-[0.15]`} />
                <CardContent className="relative pt-5 pb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">{s.label}</span>
                    <s.icon className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                  </div>
                  <p className="text-3xl font-bold text-slate-900 dark:text-white">{s.value}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>

        {/* Search */}
        <motion.div variants={item} className="relative">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
          <Input placeholder="Search documents…" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10 h-11 rounded-xl dark:bg-slate-800 dark:border-slate-700" />
        </motion.div>

        {/* Type Filter */}
        <motion.div variants={item} className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {documentTypeOptions.map(type => (
            <Button key={type.value} variant={selectedType === type.value ? 'default' : 'outline'} onClick={() => setSelectedType(type.value)} size="sm" className="rounded-full whitespace-nowrap">
              {type.label}
            </Button>
          ))}
        </motion.div>

        {/* Documents Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
            <span className="ml-2 text-gray-600 dark:text-slate-400">Loading documents…</span>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div key={selectedType} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredDocuments.length === 0 ? (
                <div className="col-span-full">
                  <Card className="border-dashed border-2 dark:bg-slate-800/40">
                    <CardContent className="text-center py-16">
                      <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center mx-auto mb-4">
                        <FileText className="h-8 w-8 text-slate-400" />
                      </div>
                      <p className="text-lg font-medium text-slate-700 dark:text-slate-300">No documents found</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Upload your first document to get started</p>
                      <Button className="mt-6" onClick={() => setIsUploadDialogOpen(true)}>
                        <Upload className="mr-2 h-4 w-4" /> Upload Document
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              ) : (
                filteredDocuments.map((doc, idx) => {
                  const colors = typeColors[doc.reportType] || typeColors.general;
                  const isPDF = doc.mimeType?.includes('pdf');
                  return (
                    <motion.div key={doc.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05, duration: 0.35 }}>
                      <Card className="group hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border-slate-200/80 dark:border-slate-700/60 dark:bg-slate-800/50 h-full">
                        <CardHeader className="pb-3">
                          <div className="flex items-start gap-3">
                            <div className={`p-2.5 rounded-xl ${colors.bg} ${colors.dark} transition-transform group-hover:scale-110 duration-300`}>
                              {isPDF
                                ? <FileText className={`h-5 w-5 ${colors.text}`} />
                                : <FileImage className={`h-5 w-5 ${colors.text}`} />
                              }
                            </div>
                            <div className="flex-1 min-w-0">
                              <CardTitle className="text-base truncate text-slate-900 dark:text-white" title={doc.fileName}>
                                {doc.fileName}
                              </CardTitle>
                              <CardDescription className="dark:text-slate-400">
                                {doc.mimeType?.split('/')[1]?.toUpperCase() || 'FILE'} · {formatFileSize(doc.fileSize)}
                              </CardDescription>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-3">
                            <Badge className={`${colors.bg} ${colors.text} ${colors.dark} font-medium`}>
                              {typeLabels[doc.reportType] || doc.reportType}
                            </Badge>
                            {doc.description && <p className="text-sm text-slate-600 dark:text-slate-400">{doc.description}</p>}
                            {doc.testName && <p className="text-sm text-slate-600 dark:text-slate-400"><span className="font-medium">Test:</span> {doc.testName}</p>}
                            {doc.labName && <p className="text-sm text-slate-600 dark:text-slate-400"><span className="font-medium">Lab:</span> {doc.labName}</p>}
                            <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                              <Calendar className="h-3 w-3" />
                              {new Date(doc.uploadedAt).toLocaleDateString('en-IN')}
                            </div>
                            <div className="flex gap-2 pt-2">
                              <Button variant="outline" size="sm" className="flex-1 dark:border-slate-600 dark:text-slate-300" onClick={() => previewReport({ reportId: doc.id, fileName: doc.fileName, fallbackUrl: doc.fileUrl })}>
                                <Eye className="mr-2 h-4 w-4" /> View
                              </Button>
                              <Button variant="outline" size="sm" className="dark:border-slate-600 dark:text-slate-300" onClick={() => downloadReport({ reportId: doc.id, fileName: doc.fileName, fallbackUrl: doc.fileUrl })}>
                                <Download className="h-4 w-4" />
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => handleDelete(doc.id)} className="hover:bg-red-50 dark:hover:bg-red-900/20 dark:border-slate-600">
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </motion.div>
    </MainLayout>
  );
};

export default UploadedDocuments;
