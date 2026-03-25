import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { FileText, Upload, Download, Eye, Trash2, Calendar, Search, File, FileImage, FilePlus, FolderOpen, HardDrive } from 'lucide-react';
import MainLayout from '@/components/layout/MainLayout';

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

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.06 } } };
const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [.25,.46,.45,.94] } } };

const UploadedDocuments: React.FC = () => {
  const [documents, setDocuments] = useState<Document[]>([
    { id: '1', name: 'Blood Test Report - Dec 2024', type: 'lab_report', fileType: 'PDF', size: '2.3 MB', uploadDate: new Date('2024-12-15'), uploadedBy: 'Self', tags: ['Blood Test', 'Routine Checkup'], description: 'Comprehensive blood test results' },
    { id: '2', name: 'Prescription - Dr. Kumar', type: 'prescription', fileType: 'PDF', size: '1.1 MB', uploadDate: new Date('2024-12-20'), uploadedBy: 'Dr. Rajesh Kumar', tags: ['Antibiotics', 'Follow-up'] },
    { id: '3', name: 'Insurance Card', type: 'insurance', fileType: 'JPG', size: '856 KB', uploadDate: new Date('2024-11-10'), uploadedBy: 'Self', tags: ['Insurance', 'ID Card'] },
    { id: '4', name: 'X-Ray Chest', type: 'medical_record', fileType: 'PNG', size: '3.8 MB', uploadDate: new Date('2024-10-05'), uploadedBy: 'City Hospital', tags: ['X-Ray', 'Imaging'] },
    { id: '5', name: 'Hospital Bill - Jan 2025', type: 'bill', fileType: 'PDF', size: '542 KB', uploadDate: new Date('2025-01-10'), uploadedBy: 'Apollo Hospital', tags: ['Bill', 'Payment'] }
  ]);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [newDocument, setNewDocument] = useState({ name: '', type: 'other', description: '', tags: '' });

  const documentTypes = [
    { value: 'all', label: 'All', icon: File },
    { value: 'prescription', label: 'Prescriptions', icon: FileText },
    { value: 'lab_report', label: 'Lab Reports', icon: FileText },
    { value: 'medical_record', label: 'Medical Records', icon: FileText },
    { value: 'insurance', label: 'Insurance', icon: FileText },
    { value: 'bill', label: 'Bills', icon: FileText },
    { value: 'other', label: 'Other', icon: File }
  ];

  const typeColors: Record<string, { bg: string; text: string; dark: string }> = {
    prescription: { bg: 'bg-blue-100', text: 'text-blue-700', dark: 'dark:bg-blue-900/40 dark:text-blue-300' },
    lab_report: { bg: 'bg-violet-100', text: 'text-violet-700', dark: 'dark:bg-violet-900/40 dark:text-violet-300' },
    medical_record: { bg: 'bg-emerald-100', text: 'text-emerald-700', dark: 'dark:bg-emerald-900/40 dark:text-emerald-300' },
    insurance: { bg: 'bg-amber-100', text: 'text-amber-700', dark: 'dark:bg-amber-900/40 dark:text-amber-300' },
    bill: { bg: 'bg-rose-100', text: 'text-rose-700', dark: 'dark:bg-rose-900/40 dark:text-rose-300' },
    other: { bg: 'bg-slate-100', text: 'text-slate-700', dark: 'dark:bg-slate-800 dark:text-slate-300' }
  };

  const getTypeBadge = (type: string) => {
    const c = typeColors[type] || typeColors.other;
    return (
      <Badge className={`${c.bg} ${c.text} ${c.dark} font-medium`}>
        {documentTypes.find(t => t.value === type)?.label || type}
      </Badge>
    );
  };

  const filteredDocuments = documents
    .filter(doc => selectedType === 'all' || doc.type === selectedType)
    .filter(doc => doc.name.toLowerCase().includes(searchTerm.toLowerCase()) || doc.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase())));

  const handleUpload = () => {
    if (!newDocument.name) return;
    const document: Document = {
      id: Date.now().toString(), name: newDocument.name, type: newDocument.type as Document['type'],
      fileType: 'PDF', size: '1.2 MB', uploadDate: new Date(), uploadedBy: 'Self',
      tags: newDocument.tags.split(',').map(tag => tag.trim()).filter(tag => tag), description: newDocument.description
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

  const statCards = [
    { label: 'Total Documents', value: documents.length, gradient: 'from-slate-600 to-slate-800', icon: FolderOpen },
    { label: 'Prescriptions', value: documents.filter(d => d.type === 'prescription').length, gradient: 'from-blue-500 to-indigo-600', icon: FileText },
    { label: 'Lab Reports', value: documents.filter(d => d.type === 'lab_report').length, gradient: 'from-violet-500 to-purple-600', icon: FileText },
    { label: 'Total Size', value: '8.6 MB', gradient: 'from-emerald-500 to-teal-600', icon: HardDrive },
  ];

  return (
    <MainLayout>
      <motion.div initial="hidden" animate="show" variants={container} className="max-w-7xl mx-auto space-y-6 px-4 md:px-6 py-6">
        {/* Premium Header */}
        <motion.div variants={item} className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-teal-700 via-cyan-700 to-teal-800 p-6 md:p-8 text-white shadow-2xl">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.15),transparent_60%)]" />
          <div className="absolute top-0 right-0 w-72 h-72 bg-gradient-to-br from-white/10 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
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
                  <DialogDescription>Add a new medical document to your records</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="doc-name">Document Name</Label>
                    <Input id="doc-name" placeholder="e.g., Blood Test Report" value={newDocument.name} onChange={(e) => setNewDocument({ ...newDocument, name: e.target.value })} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="doc-type">Document Type</Label>
                    <select id="doc-type" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={newDocument.type} onChange={(e) => setNewDocument({ ...newDocument, type: e.target.value })}>
                      {documentTypes.filter(t => t.value !== 'all').map(type => (<option key={type.value} value={type.value}>{type.label}</option>))}
                    </select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="description">Description (Optional)</Label>
                    <Input id="description" placeholder="Brief description" value={newDocument.description} onChange={(e) => setNewDocument({ ...newDocument, description: e.target.value })} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="tags">Tags (comma separated)</Label>
                    <Input id="tags" placeholder="e.g., Blood Test, Routine" value={newDocument.tags} onChange={(e) => setNewDocument({ ...newDocument, tags: e.target.value })} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="file">Select File</Label>
                    <div className="flex items-center justify-center w-full">
                      <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-xl cursor-pointer bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors border-slate-300 dark:border-slate-600">
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                          <FilePlus className="h-8 w-8 text-slate-400 mb-2" />
                          <p className="text-sm text-slate-500 dark:text-slate-400"><span className="font-semibold">Click to upload</span> or drag and drop</p>
                          <p className="text-xs text-slate-400 dark:text-slate-500">PDF, PNG, JPG up to 10MB</p>
                        </div>
                        <input id="file" type="file" className="hidden" />
                      </label>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsUploadDialogOpen(false)}>Cancel</Button>
                  <Button onClick={handleUpload}>Upload</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </motion.div>

        {/* Stats */}
        <motion.div variants={item} className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {statCards.map((s) => (
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
          <Input placeholder="Search documents by name or tag..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10 h-11 rounded-xl dark:bg-slate-800 dark:border-slate-700" aria-label="Search documents" />
        </motion.div>

        {/* Type Filter Tabs */}
        <motion.div variants={item} className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {documentTypes.map(type => (
            <Button key={type.value} variant={selectedType === type.value ? 'default' : 'outline'} onClick={() => setSelectedType(type.value)} size="sm" className="rounded-full whitespace-nowrap transition-all duration-200">
              {type.label}
            </Button>
          ))}
        </motion.div>

        {/* Documents Grid */}
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
              filteredDocuments.map((doc, idx) => (
                <motion.div key={doc.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05, duration: 0.35 }}>
                  <Card className="group hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border-slate-200/80 dark:border-slate-700/60 dark:bg-slate-800/50 h-full">
                    <CardHeader className="pb-3">
                      <div className="flex items-start gap-3">
                        <div className={`p-2.5 rounded-xl ${typeColors[doc.type]?.bg || 'bg-slate-100'} dark:bg-opacity-20 transition-transform group-hover:scale-110 duration-300`}>
                          {doc.fileType === 'PDF' ? (
                            <FileText className={`h-5 w-5 ${typeColors[doc.type]?.text || 'text-slate-600'}`} />
                          ) : (
                            <FileImage className={`h-5 w-5 ${typeColors[doc.type]?.text || 'text-slate-600'}`} />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-base truncate text-slate-900 dark:text-white">{doc.name}</CardTitle>
                          <CardDescription className="dark:text-slate-400">{doc.fileType} • {doc.size}</CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div>{getTypeBadge(doc.type)}</div>
                        {doc.description && <p className="text-sm text-slate-600 dark:text-slate-400">{doc.description}</p>}
                        <div className="flex flex-wrap gap-1.5">
                          {doc.tags.map((tag, index) => (
                            <Badge key={index} variant="outline" className="text-xs dark:border-slate-600 dark:text-slate-300">{tag}</Badge>
                          ))}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="h-3 w-3" />
                            Uploaded: {new Date(doc.uploadDate).toLocaleDateString('en-IN')}
                          </div>
                          <div>By: {doc.uploadedBy}</div>
                        </div>
                        <div className="flex gap-2 pt-2">
                          <Button variant="outline" size="sm" className="flex-1 dark:border-slate-600 dark:text-slate-300" aria-label={`View ${doc.name}`}>
                            <Eye className="mr-2 h-4 w-4" /> View
                          </Button>
                          <Button variant="outline" size="sm" className="dark:border-slate-600 dark:text-slate-300" aria-label={`Download ${doc.name}`}>
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => handleDelete(doc.id)} className="hover:bg-red-50 dark:hover:bg-red-900/20 dark:border-slate-600" aria-label={`Delete ${doc.name}`}>
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))
            )}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </MainLayout>
  );
};

export default UploadedDocuments;
