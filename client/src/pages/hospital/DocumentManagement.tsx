/**
 * Document Management System (DMS) — hospital ops UI
 * Administrative document store for policies, SOPs, consent forms,
 * NABH documents, HR documents, circulars, etc. No clinical decision
 * content — not SaMD. Talks to /api/dms (server/routes/dms.route.js).
 */

import { useState, useEffect } from 'react';
import HospitalLayout from '@/components/hospital/HospitalLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { FileText, Plus, Upload, History, CheckCircle2, Archive } from 'lucide-react';
import api from '@/utils/api';
import { useToast } from '@/hooks/use-toast';

type DmsCategory = 'policy' | 'sop' | 'consent_form' | 'nabh_document' | 'hr_document' | 'circular' | 'other';
type DmsStatus = 'draft' | 'published' | 'archived';

type DmsDocument = {
  id: number;
  organization_id: number;
  category: DmsCategory;
  title: string;
  description: string | null;
  current_version: number;
  status: DmsStatus;
  file_url: string | null;
  file_name: string | null;
  uploaded_by: number | null;
  created_at: string;
  updated_at: string;
};

type DmsVersion = {
  id: number;
  document_id: number;
  version_no: number;
  file_url: string | null;
  file_name: string | null;
  uploaded_by: number | null;
  change_note: string | null;
  uploaded_at: string;
};

type DmsDocumentDetail = DmsDocument & { versions: DmsVersion[] };

const CATEGORY_LABELS: Record<string, string> = {
  policy: 'Policy',
  sop: 'SOP',
  consent_form: 'Consent Form',
  nabh_document: 'NABH Document',
  hr_document: 'HR Document',
  circular: 'Circular',
  other: 'Other',
};

const STATUS_BADGE: Record<DmsStatus, string> = {
  draft: 'bg-slate-100 text-slate-600',
  published: 'bg-emerald-100 text-emerald-700',
  archived: 'bg-amber-100 text-amber-700',
};

export default function DocumentManagement() {
  const { toast } = useToast();
  const [categories, setCategories] = useState<string[]>([]);
  const [documents, setDocuments] = useState<DmsDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Upload dialog
  const [uploadOpen, setUploadOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newCategory, setNewCategory] = useState<string>('');
  const [newFile, setNewFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  // Detail dialog
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<DmsDocumentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [versionFile, setVersionFile] = useState<File | null>(null);
  const [versionNote, setVersionNote] = useState('');
  const [versionSaving, setVersionSaving] = useState(false);

  const loadCategories = async () => {
    try {
      const res = await api.get('/dms/categories');
      const data = res.data?.data ?? res.data;
      setCategories(Array.isArray(data) ? data : []);
    } catch {
      setCategories(Object.keys(CATEGORY_LABELS));
    }
  };

  const loadDocuments = async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (categoryFilter !== 'all') params.category = categoryFilter;
      const res = await api.get('/dms/documents', { params });
      const data = res.data?.data ?? res.data;
      setDocuments(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not load documents. Your account may not have organization context set up yet.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    loadDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryFilter]);

  const createDocument = async () => {
    if (!newTitle.trim() || !newCategory || !newFile) {
      toast({ title: 'Title, category and file are required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('title', newTitle.trim());
      fd.append('category', newCategory);
      if (newDescription.trim()) fd.append('description', newDescription.trim());
      fd.append('file', newFile);
      await api.post('/dms/documents', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast({ title: 'Document uploaded', description: `${newTitle} has been added as a draft.` });
      setUploadOpen(false);
      setNewTitle('');
      setNewDescription('');
      setNewCategory('');
      setNewFile(null);
      loadDocuments();
    } catch (e: any) {
      toast({ title: 'Failed to upload document', description: e?.response?.data?.message || e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const openDetail = async (doc: DmsDocument) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetail(null);
    setVersionFile(null);
    setVersionNote('');
    try {
      const res = await api.get(`/dms/documents/${doc.id}`);
      const data = res.data?.data ?? res.data;
      setDetail(data);
    } catch (e: any) {
      toast({ title: 'Failed to load document', description: e?.response?.data?.message || e.message, variant: 'destructive' });
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const uploadNewVersion = async () => {
    if (!detail || !versionFile) {
      toast({ title: 'Select a file for the new version', variant: 'destructive' });
      return;
    }
    setVersionSaving(true);
    try {
      const fd = new FormData();
      fd.append('file', versionFile);
      if (versionNote.trim()) fd.append('changeNote', versionNote.trim());
      await api.post(`/dms/documents/${detail.id}/versions`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast({ title: 'New version uploaded' });
      const res = await api.get(`/dms/documents/${detail.id}`);
      const data = res.data?.data ?? res.data;
      setDetail(data);
      setVersionFile(null);
      setVersionNote('');
      loadDocuments();
    } catch (e: any) {
      toast({ title: 'Failed to upload new version', description: e?.response?.data?.message || e.message, variant: 'destructive' });
    } finally {
      setVersionSaving(false);
    }
  };

  const publishDocument = async (doc: DmsDocument) => {
    try {
      await api.patch(`/dms/documents/${doc.id}/publish`);
      toast({ title: 'Document published' });
      loadDocuments();
      if (detail?.id === doc.id) openDetail(doc);
    } catch (e: any) {
      toast({ title: 'Failed to publish', description: e?.response?.data?.message || e.message, variant: 'destructive' });
    }
  };

  const archiveDocument = async (doc: DmsDocument) => {
    try {
      await api.patch(`/dms/documents/${doc.id}/archive`);
      toast({ title: 'Document archived' });
      loadDocuments();
      if (detail?.id === doc.id) openDetail(doc);
    } catch (e: any) {
      toast({ title: 'Failed to archive', description: e?.response?.data?.message || e.message, variant: 'destructive' });
    }
  };

  return (
    <HospitalLayout title="Document Management" subtitle="Policies, SOPs, consent forms, NABH and HR documents — versioned document store">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <FileText className="h-5 w-5 text-indigo-500" />
          <h2 className="text-lg font-semibold">Documents</h2>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>{CATEGORY_LABELS[c] || c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Upload Document</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Upload a new document</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div>
                <Label htmlFor="doc-title">Title</Label>
                <Input id="doc-title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="e.g. Infection Control Policy v3" />
              </div>
              <div>
                <Label htmlFor="doc-category">Category</Label>
                <Select value={newCategory} onValueChange={setNewCategory}>
                  <SelectTrigger id="doc-category">
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c} value={c}>{CATEGORY_LABELS[c] || c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="doc-description">Description (optional)</Label>
                <Textarea id="doc-description" value={newDescription} onChange={(e) => setNewDescription(e.target.value)} placeholder="Brief description" />
              </div>
              <div>
                <Label htmlFor="doc-file">File</Label>
                <input
                  id="doc-file"
                  type="file"
                  className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100"
                  onChange={(e) => setNewFile(e.target.files?.[0] || null)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={createDocument} disabled={saving}>{saving ? 'Uploading...' : 'Upload'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading && <p className="text-sm text-muted-foreground py-6 text-center">Loading...</p>}
      {!loading && error && <p className="text-sm text-red-500 py-6 text-center">{error}</p>}
      {!loading && !error && documents.length === 0 && (
        <p className="text-sm text-muted-foreground py-6 text-center">
          No documents yet. Upload a policy, SOP or NABH document to get started.
        </p>
      )}

      {!loading && !error && documents.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {documents.map((doc) => (
            <Card key={doc.id} className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-shadow" onClick={() => openDetail(doc)}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-sm font-semibold leading-snug">{doc.title}</CardTitle>
                  <Badge className={STATUS_BADGE[doc.status]}>{doc.status}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline">{CATEGORY_LABELS[doc.category] || doc.category}</Badge>
                  <span className="text-xs text-muted-foreground">v{doc.current_version}</span>
                </div>
                {doc.description && <p className="text-xs text-muted-foreground line-clamp-2">{doc.description}</p>}
                <p className="text-xs text-muted-foreground">
                  Updated {new Date(doc.updated_at).toLocaleString()}
                </p>
                <div className="flex gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
                  {doc.status === 'draft' && (
                    <Button variant="outline" size="sm" className="text-xs" onClick={() => publishDocument(doc)}>
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Publish
                    </Button>
                  )}
                  {doc.status === 'published' && (
                    <Button variant="outline" size="sm" className="text-xs" onClick={() => archiveDocument(doc)}>
                      <Archive className="h-3.5 w-3.5 mr-1" /> Archive
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{detail?.title || 'Document'}</DialogTitle></DialogHeader>
          {detailLoading && <p className="text-sm text-muted-foreground py-6 text-center">Loading...</p>}
          {!detailLoading && detail && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className={STATUS_BADGE[detail.status]}>{detail.status}</Badge>
                <Badge variant="outline">{CATEGORY_LABELS[detail.category] || detail.category}</Badge>
                <span className="text-xs text-muted-foreground">Current version: v{detail.current_version}</span>
              </div>
              {detail.description && <p className="text-sm text-muted-foreground">{detail.description}</p>}

              <div>
                <div className="flex items-center gap-1 mb-2">
                  <History className="h-4 w-4 text-muted-foreground" />
                  <h4 className="text-sm font-semibold">Version history</h4>
                </div>
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {detail.versions.map((v) => (
                    <div key={v.id} className="flex items-center justify-between text-sm border rounded-md px-3 py-2">
                      <div>
                        <p className="font-medium">v{v.version_no} — {v.file_name || 'file'}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(v.uploaded_at).toLocaleString()}{v.change_note ? ` — ${v.change_note}` : ''}
                        </p>
                      </div>
                      {v.file_url && (
                        <a href={v.file_url} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 hover:underline">
                          Download
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t pt-3 space-y-2">
                <Label htmlFor="version-file">Upload new version</Label>
                <input
                  id="version-file"
                  type="file"
                  className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100"
                  onChange={(e) => setVersionFile(e.target.files?.[0] || null)}
                />
                <Input
                  placeholder="Change note (optional)"
                  value={versionNote}
                  onChange={(e) => setVersionNote(e.target.value)}
                />
                <Button size="sm" onClick={uploadNewVersion} disabled={versionSaving}>
                  <Upload className="h-3.5 w-3.5 mr-1" /> {versionSaving ? 'Uploading...' : 'Upload Version'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </HospitalLayout>
  );
}
