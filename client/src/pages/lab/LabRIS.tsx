/**
 * LabRIS — Radiology Information System / PACS Worklist
 *
 * Tabs:  Worklist  |  Active Study  |  Report
 * Left:  Study list with filters
 * Right: DicomViewer + Metadata + Report entry
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate }          from 'react-router-dom';
import axios                    from 'axios';
import {
  Upload, Search, Filter, RefreshCw,
  FileText, FlaskConical, Calendar, User,
  AlertCircle, CheckCircle2, Clock, Activity, AlertTriangle,
  ChevronDown, X, ScanLine, Info, Edit3,
  Download, Printer, Eye, Trash2,
} from 'lucide-react';
import DicomViewer from '../../components/lab/DicomViewer';
import { openOhifViewer, buildOhifViewerUrl, listenOhifMeasurements } from '@/utils/imagingViewer';
import ImagingReportEditor from '../../components/imaging/ImagingReportEditor';
import ImagingCollabPanel from '../../components/imaging/ImagingCollabPanel';
import ImagingAnalyticsPanel from '../../components/imaging/ImagingAnalyticsPanel';
import ImagingPlatformPanels from '../../components/imaging/ImagingPlatformPanels';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Study {
  id: number;
  lab_id: number;
  patient_name: string;
  patient_sex: string;
  patient_dob: string | null;
  accession_number: string;
  study_instance_uid: string;
  modality: string;
  body_part: string | null;
  study_description: string | null;
  referring_physician: string | null;
  study_date: string;
  study_time: string | null;
  priority: 'STAT' | 'Urgent' | 'Routine';
  status: 'Ordered' | 'Scheduled' | 'InProgress' | 'Completed' | 'Reported' | 'Cancelled';
  file_name: string;
  mime_type: string;
  file_size: number;
  is_dicom: boolean;
  report_status: 'Pending' | 'Draft' | 'Final' | 'Addendum';
  report_text: string | null;
  reported_by: string | null;
  reported_at: string | null;
  notes: string | null;
  image_count: number;
  series_count: number;
  pacs_source?: string;
  series_instance_uid?: string | null;
  sop_instance_uid?: string | null;
  created_at: string;
}

interface UploadForm {
  patientName: string;
  patientDob: string;
  patientSex: string;
  modality: string;
  bodyPart: string;
  studyDescription: string;
  referringPhysician: string;
  referringDoctorId: string;
  referringDoctorName: string;
  studyDate: string;
  priority: string;
  notes: string;
}

interface CriticalAlertItem {
  id: number;
  study_id: number;
  status: 'Open' | 'Acknowledged' | 'Escalated';
  alert_reason: string;
  raised_by: string | null;
  raised_at: string | null;
  due_at: string | null;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
}

interface CronHealthTask {
  key: string;
  name: string;
  lastRun: string | null;
  lastStatus: string;
  lastError: string | null;
  isRunning?: boolean;
}

interface DicomWebInstance {
  sop_instance_uid: string;
  content_type?: string | null;
  file_size?: number | null;
  created_at?: string | null;
}

interface DicomwebVerification {
  ok: boolean;
  status: number;
  latencyMs: number;
  message: string;
  checkedAt: string;
}

const API_BASE = '/api/lab/ris';
const MODALITIES = ['CT','MRI','X-Ray','USG','Echo','Mammography','Fluoroscopy','NM','PET','Other'];
const STATUSES   = ['Ordered','Scheduled','InProgress','Completed','Reported','Cancelled'];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const modalityColor: Record<string,string> = {
  CT:   'bg-blue-900 text-blue-300',
  MRI:  'bg-purple-900 text-purple-300',
  'X-Ray':'bg-yellow-900 text-yellow-300',
  USG:  'bg-teal-900 text-teal-300',
  Echo: 'bg-pink-900 text-pink-300',
};
const getModalityColor = (m: string) =>
  modalityColor[m] || 'bg-gray-800 text-gray-300';

const statusColors: Record<string,string> = {
  Ordered:    'bg-gray-700 text-gray-200',
  Scheduled:  'bg-indigo-900 text-indigo-300',
  InProgress: 'bg-amber-900 text-amber-300',
  Completed:  'bg-green-900 text-green-300',
  Reported:   'bg-emerald-900 text-emerald-300',
  Cancelled:  'bg-red-900 text-red-300',
};

const priorityColors: Record<string,string> = {
  STAT:    'text-red-400 font-bold',
  Urgent:  'text-amber-400 font-semibold',
  Routine: 'text-gray-400',
};

const fmt = (d?: string | null) => {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }); }
  catch { return d; }
};

const fmtDateTime = (d?: string | null) => {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return d;
  }
};

const fmtSize = (bytes: number) => {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes/1024).toFixed(1)} KB`;
  return `${(bytes/1024/1024).toFixed(2)} MB`;
};

// ─── Upload Modal ─────────────────────────────────────────────────────────────
const UploadModal: React.FC<{
  onClose: () => void;
  onUploaded: (s: Study) => void;
  labName: string;
}> = ({ onClose, onUploaded, labName }) => {
  const [form, setForm] = useState<UploadForm>({
    patientName: '', patientDob: '', patientSex: 'U',
    modality: 'CT', bodyPart: '', studyDescription: '',
    referringPhysician: '', referringDoctorId: '', referringDoctorName: '',
    studyDate: new Date().toISOString().slice(0,10),
    priority: 'Routine', notes: '',
  });
  const [files, setFiles]       = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const fileRef               = useRef<HTMLInputElement>(null);
  const token                 = localStorage.getItem('labToken') || '';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!files.length) { setError('Please select at least one file'); return; }
    if (!form.patientName.trim()) { setError('Patient name is required'); return; }

    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      const isBatchDicom = files.length > 1 && files.every((f) =>
        f.name.toLowerCase().endsWith('.dcm') || f.type === 'application/dicom',
      );
      if (isBatchDicom) {
        files.forEach((f) => fd.append('files', f));
      } else {
        fd.append('file', files[0]);
      }
      Object.entries(form).forEach(([k,v]) => fd.append(k,v));

      const endpoint = isBatchDicom ? `${API_BASE}/upload-series` : `${API_BASE}/upload`;
      const res = await axios.post(endpoint, fd, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
        },
      });
      if (res.data.success) {
        onUploaded(res.data.study);
        onClose();
      } else {
        setError(res.data.message || 'Upload failed');
      }
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { message?: string } }; message?: string })
        ?.response?.data?.message || (err as { message?: string })?.message || 'Upload failed';
      setError(message);
    } finally {
      setUploading(false);
    }
  };

  const F = (field: keyof UploadForm) => ({
    value: form[field],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(prev => ({ ...prev, [field]: e.target.value })),
  });

  const inputCls = 'w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500';
  const labelCls = 'text-xs font-medium text-gray-400 mb-1 block';

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-auto border border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <ScanLine className="text-indigo-400" size={20} />
            <h2 className="text-white font-semibold">Upload Study — {labName}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit} className="p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-950 border border-red-800 rounded-lg text-red-300 text-sm">
              <AlertCircle size={14} /> {error}
            </div>
          )}

          {/* File drop */}
          <div
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-gray-700 hover:border-indigo-500 rounded-xl p-6 text-center cursor-pointer transition-colors"
          >
            {files.length ? (
              <div className="text-green-400">
                <CheckCircle2 className="mx-auto mb-1" size={20} />
                <div className="text-sm font-medium">
                  {files.length === 1 ? files[0].name : `${files.length} DICOM files selected`}
                </div>
                <div className="text-xs text-gray-500">
                  {fmtSize(files.reduce((s, f) => s + f.size, 0))}
                </div>
              </div>
            ) : (
              <div className="text-gray-500">
                <Upload className="mx-auto mb-2" size={24} />
                <div className="text-sm">Click to select DICOM / Image / Video / PDF</div>
                <div className="text-xs mt-1">Multi-select .dcm for series batch upload · Max 500 MB each</div>
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              hidden
              multiple
              accept=".dcm,image/*,video/*,application/pdf"
              onChange={e => setFiles(Array.from(e.target.files || []))}
            />
          </div>

          {/* Patient info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={labelCls}>Patient Name *</label>
              <input className={inputCls} placeholder="Full name" {...F('patientName')} required />
            </div>
            <div>
              <label className={labelCls}>Date of Birth</label>
              <input type="date" className={inputCls} {...F('patientDob')} />
            </div>
            <div>
              <label className={labelCls}>Sex</label>
              <select className={inputCls} {...F('patientSex')}>
                <option value="U">Unknown</option>
                <option value="M">Male</option>
                <option value="F">Female</option>
                <option value="O">Other</option>
              </select>
            </div>
          </div>

          {/* Study info */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Modality</label>
              <select className={inputCls} {...F('modality')}>
                {MODALITIES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Body Part</label>
              <input className={inputCls} placeholder="e.g. Abdomen" {...F('bodyPart')} />
            </div>
            <div>
              <label className={labelCls}>Study Date</label>
              <input type="date" className={inputCls} {...F('studyDate')} required />
            </div>
            <div>
              <label className={labelCls}>Priority</label>
              <select className={inputCls} {...F('priority')}>
                <option>Routine</option>
                <option>Urgent</option>
                <option>STAT</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Study Description</label>
              <input className={inputCls} placeholder="e.g. Chest CT with contrast" {...F('studyDescription')} />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Referring Physician (name on report)</label>
              <input className={inputCls} placeholder="Doctor name" {...F('referringPhysician')} />
            </div>
            {/* Referring doctor — links study to doctor portal */}
            <div className="p-3 bg-indigo-950/40 border border-indigo-800/50 rounded-xl col-span-2 space-y-3">
              <div className="text-xs font-semibold text-indigo-300 flex items-center gap-1.5">
                <User size={12} /> Link to Doctor Portal (optional)
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Doctor ID</label>
                  <input className={inputCls} placeholder="e.g. 1042" type="number" {...F('referringDoctorId')} />
                </div>
                <div>
                  <label className={labelCls}>Doctor Name</label>
                  <input className={inputCls} placeholder="Dr. Full Name" {...F('referringDoctorName')} />
                </div>
              </div>
              <p className="text-xs text-gray-600">If filled, the doctor will see this study in their Referred Imaging tab.</p>
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Notes</label>
              <textarea className={inputCls} rows={2} placeholder="Clinical notes…" {...F('notes')} />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 rounded-lg bg-gray-800 text-gray-300 text-sm hover:bg-gray-700">
              Cancel
            </button>
            <button type="submit" disabled={uploading}
              className="flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-60">
              {uploading ? (
                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Uploading…</>
              ) : (
                <><Upload size={14} /> Upload Study</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── Report Panel ─────────────────────────────────────────────────────────────
const ReportPanel: React.FC<{
  study: Study;
  onSaved: (s: Study) => void;
}> = ({ study, onSaved }) => {
  const [text, setText]         = useState(study.report_text || '');
  const [status, setStatus]     = useState(study.report_status || 'Draft');
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [qcStatus, setQcStatus] = useState<'Passed' | 'Failed' | 'NeedsReview'>('NeedsReview');
  const [qcNotes, setQcNotes] = useState('');
  const [reagentLotNumber, setReagentLotNumber] = useState('');
  const [calibrationReference, setCalibrationReference] = useState('');
  const [contextNotes, setContextNotes] = useState('');
  const [criticalEnabled, setCriticalEnabled] = useState(false);
  const [criticalReason, setCriticalReason] = useState('');
  const [criticalDueMinutes, setCriticalDueMinutes] = useState('30');
  const token                   = localStorage.getItem('labToken') || '';
  const labData                 = JSON.parse(localStorage.getItem('labData') || '{}');
  const displayLabName          = labData.labName || labData.name || 'Radiologist';

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      if (status === 'Final') {
        await axios.put(
          `${API_BASE}/${study.id}/qc`,
          {
            qcStatus,
            reviewNotes: qcNotes,
            reviewedBy: displayLabName,
          },
          { headers: { Authorization: `Bearer ${token}` } }
        );

        await axios.put(
          `${API_BASE}/${study.id}/result-context`,
          {
            reagentLotNumber,
            calibrationReference,
            contextNotes,
          },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      }

      const res = await axios.put(`${API_BASE}/${study.id}/report`,
        {
          reportText: text,
          reportStatus: status,
          reportedBy: displayLabName,
          criticalValue: criticalEnabled
            ? {
              enabled: true,
              reason: criticalReason || 'Critical value in report',
              dueMinutes: Number(criticalDueMinutes || '30'),
            }
            : { enabled: false },
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data.success) {
        onSaved(res.data.study);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (e: unknown) {
      const message = (e as { response?: { data?: { message?: string } }; message?: string })
        ?.response?.data?.message || (e as { message?: string })?.message || 'Failed to save report';
      setSaveError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <FileText size={14} className="text-indigo-400" />
          Radiology Report
        </h3>
        <select
          value={status}
          onChange={e => setStatus(e.target.value)}
          className="text-xs px-2 py-1 rounded bg-gray-800 text-gray-300 border border-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="Draft">Draft</option>
          <option value="Final">Final</option>
          <option value="Addendum">Addendum</option>
        </select>
      </div>

      {study.report_text && status === 'Final' && (
        <div className="mb-2 px-3 py-2 bg-emerald-950 border border-emerald-800 rounded-lg text-xs text-emerald-300">
          <CheckCircle2 size={12} className="inline mr-1" />
          Reported by {study.reported_by} · {fmt(study.reported_at)}
        </div>
      )}

      <ImagingReportEditor
        studyId={study.id}
        studyInstanceUID={study.study_instance_uid}
        patientName={study.patient_name}
        modality={study.modality}
        value={text}
        onChange={setText}
        token={token}
      />

      <div className="mt-3 p-3 rounded-lg border border-gray-700 bg-gray-900/70 space-y-3">
        <div className="text-xs font-semibold text-gray-300">Quality & Compliance</div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">QC Status</label>
            <select
              value={qcStatus}
              onChange={e => setQcStatus(e.target.value as 'Passed' | 'Failed' | 'NeedsReview')}
              className="w-full text-xs px-2 py-2 rounded bg-gray-800 text-gray-300 border border-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="NeedsReview">Needs Review</option>
              <option value="Passed">Passed</option>
              <option value="Failed">Failed</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Critical Value SLA (minutes)</label>
            <input
              value={criticalDueMinutes}
              onChange={e => setCriticalDueMinutes(e.target.value)}
              type="number"
              min={5}
              className="w-full text-xs px-2 py-2 rounded bg-gray-800 text-gray-300 border border-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Reagent Lot Number</label>
            <input
              value={reagentLotNumber}
              onChange={e => setReagentLotNumber(e.target.value)}
              className="w-full text-xs px-2 py-2 rounded bg-gray-800 text-gray-300 border border-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="e.g. LOT-2026-05A"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Calibration Reference</label>
            <input
              value={calibrationReference}
              onChange={e => setCalibrationReference(e.target.value)}
              className="w-full text-xs px-2 py-2 rounded bg-gray-800 text-gray-300 border border-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="e.g. CAL-XR-008"
            />
          </div>
        </div>

        <textarea
          value={qcNotes}
          onChange={e => setQcNotes(e.target.value)}
          rows={2}
          className="w-full text-xs px-2 py-2 rounded bg-gray-800 text-gray-300 border border-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder-gray-500"
          placeholder="QC notes (review outcome, deviations, reviewer comments)"
        />

        <textarea
          value={contextNotes}
          onChange={e => setContextNotes(e.target.value)}
          rows={2}
          className="w-full text-xs px-2 py-2 rounded bg-gray-800 text-gray-300 border border-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder-gray-500"
          placeholder="Result context notes"
        />

        <div className="flex items-center gap-2">
          <input
            id={`critical-${study.id}`}
            type="checkbox"
            checked={criticalEnabled}
            onChange={e => setCriticalEnabled(e.target.checked)}
            className="rounded border-gray-600 bg-gray-800 text-indigo-600 focus:ring-indigo-500"
          />
          <label htmlFor={`critical-${study.id}`} className="text-xs text-gray-300">Raise critical value alert</label>
        </div>

        {criticalEnabled && (
          <input
            value={criticalReason}
            onChange={e => setCriticalReason(e.target.value)}
            className="w-full text-xs px-2 py-2 rounded bg-gray-800 text-gray-300 border border-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            placeholder="Critical reason (e.g. Troponin above threshold)"
          />
        )}
      </div>

      {saveError && (
        <div className="mt-3 px-3 py-2 rounded-lg border border-red-800 bg-red-950 text-xs text-red-300 flex items-center gap-1.5">
          <AlertCircle size={12} />
          {saveError}
        </div>
      )}

      <div className="flex gap-2 mt-3">
        <button
          onClick={save}
          disabled={saving}
          className="flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {saving ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : saved ? (
            <><CheckCircle2 size={14} /> Saved!</>
          ) : (
            <><Edit3 size={14} /> Save Report</>
          )}
        </button>
        <button
          onClick={() => window.print()}
          className="px-3 py-2 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 text-sm"
          title="Print Report"
        >
          <Printer size={14} />
        </button>
      </div>
    </div>
  );
};

// ─── Main LabRIS Page ─────────────────────────────────────────────────────────
const LabRIS: React.FC = () => {
  const navigate   = useNavigate();
  const token      = localStorage.getItem('labToken');
  const labData    = JSON.parse(localStorage.getItem('labData') || '{}');
  const displayLabName = labData.labName || labData.name || 'Radiology';

  // Auth guard
  useEffect(() => {
    if (!token) navigate('/lab/login');
  }, [token, navigate]);

  const [studies, setStudies]         = useState<Study[]>([]);
  const [total, setTotal]             = useState(0);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [page, setPage]               = useState(1);
  const [selectedStudy, setSelectedStudy] = useState<Study | null>(null);
  const [activeTab, setActiveTab]     = useState<'viewer'|'info'|'report'>('viewer');

  // Filters
  const [search, setSearch]           = useState('');
  const [filterModality, setFilterModality] = useState('');
  const [filterStatus, setFilterStatus]     = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterFrom, setFilterFrom]   = useState('');
  const [filterTo, setFilterTo]       = useState('');
  const [showUpload, setShowUpload]   = useState(false);
  const [criticalAlerts, setCriticalAlerts] = useState<CriticalAlertItem[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [alertsError, setAlertsError] = useState<string | null>(null);
  const [alertActionLoadingId, setAlertActionLoadingId] = useState<number | null>(null);
  const [cronHealthTask, setCronHealthTask] = useState<CronHealthTask | null>(null);
  const [dicomWebFileUrl, setDicomWebFileUrl] = useState<string | null>(null);
  const [dicomWebInstances, setDicomWebInstances] = useState<DicomWebInstance[]>([]);
  const [selectedSopUID, setSelectedSopUID] = useState<string | null>(null);
  const [verifyingDicomweb, setVerifyingDicomweb] = useState(false);
  const [dicomwebVerification, setDicomwebVerification] = useState<DicomwebVerification | null>(null);

  const LIMIT = 30;

  const fetchStudies = useCallback(async (p = 1) => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string,string> = { page: String(p), limit: String(LIMIT) };
      if (search)          params.patientName    = search;
      if (filterModality)  params.modality       = filterModality;
      if (filterStatus)    params.status         = filterStatus;
      if (filterPriority)  params.priority       = filterPriority;
      if (filterFrom)      params.from           = filterFrom;
      if (filterTo)        params.to             = filterTo;

      const qs  = new URLSearchParams(params).toString();
      const res = await axios.get(`${API_BASE}/studies?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.data.success) {
        setStudies(res.data.studies);
        setTotal(res.data.total);
        setPage(p);
      }
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } }; message?: string })
        ?.response?.data?.message || (e as { message?: string })?.message || 'Failed to load';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [token, search, filterModality, filterStatus, filterPriority, filterFrom, filterTo]);

  useEffect(() => {
    if (token) fetchStudies(1);
  }, [fetchStudies, token]);

  const fetchCriticalAlerts = useCallback(async (studyId: number) => {
    if (!token) return;
    setAlertsLoading(true);
    setAlertsError(null);
    try {
      const [alertsRes, cronRes] = await Promise.all([
        axios.get(`${API_BASE}/${studyId}/critical-alerts`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        axios.get(`${API_BASE}/cron/health`, {
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => null),
      ]);

      if (alertsRes.data?.success) {
        setCriticalAlerts(alertsRes.data.alerts || []);
      } else {
        setCriticalAlerts([]);
      }

      const cronTask = cronRes?.data?.tasks?.[0] || null;
      setCronHealthTask(cronTask);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } }; message?: string })
        ?.response?.data?.message || (e as { message?: string })?.message || 'Failed to load critical alerts';
      setAlertsError(msg);
      setCriticalAlerts([]);
    } finally {
      setAlertsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!selectedStudy?.id) {
      setCriticalAlerts([]);
      setAlertsError(null);
      return;
    }
    fetchCriticalAlerts(selectedStudy.id);
  }, [selectedStudy?.id, fetchCriticalAlerts]);

  useEffect(() => {
    if (!token || !selectedStudy?.study_instance_uid) return undefined;
    return listenOhifMeasurements(token, {
      studyId: selectedStudy.id,
      studyInstanceUID: selectedStudy.study_instance_uid,
      patientName: selectedStudy.patient_name,
    });
  }, [token, selectedStudy?.id, selectedStudy?.study_instance_uid, selectedStudy?.patient_name]);

  useEffect(() => {
    if (!selectedStudy?.id || !selectedStudy?.is_dicom || !selectedStudy?.study_instance_uid || !token) {
      setDicomWebFileUrl(null);
      setDicomWebInstances([]);
      setSelectedSopUID(null);
      return;
    }

    let cancelled = false;

    const resolveDicomWebFile = async () => {
      try {
        const studyUID = encodeURIComponent(selectedStudy.study_instance_uid);
        const res = await axios.get(`/api/hypergrid/dicom/studies/${studyUID}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const instances = Array.isArray(res.data?.instances) ? res.data.instances : [];
        if (!cancelled) {
          setDicomWebInstances(instances);
        }
        const first = instances[0];
        if (!cancelled && first?.sop_instance_uid) {
          setSelectedSopUID(first.sop_instance_uid);
          setDicomWebFileUrl(
            `/api/hypergrid/dicom/studies/${studyUID}/instances/${encodeURIComponent(first.sop_instance_uid)}/file`
          );
        } else if (!cancelled) {
          setSelectedSopUID(null);
          setDicomWebFileUrl(null);
        }
      } catch {
        if (!cancelled) {
          setDicomWebInstances([]);
          setSelectedSopUID(null);
          setDicomWebFileUrl(null);
        }
      }
    };

    resolveDicomWebFile();
    return () => {
      cancelled = true;
    };
  }, [selectedStudy?.id, selectedStudy?.is_dicom, selectedStudy?.study_instance_uid, token]);

  const onSelectDicomInstance = (sopUID: string) => {
    if (!selectedStudy?.study_instance_uid) return;
    const studyUID = encodeURIComponent(selectedStudy.study_instance_uid);
    setSelectedSopUID(sopUID);
    setDicomWebFileUrl(`/api/hypergrid/dicom/studies/${studyUID}/instances/${encodeURIComponent(sopUID)}/file`);
  };

  const openDicomwebDebugUrl = () => {
    if (!dicomWebFileUrl) return;
    window.open(dicomWebFileUrl, '_blank', 'noopener,noreferrer');
  };

  const copyDicomwebUrl = async () => {
    if (!dicomWebFileUrl) return;
    try {
      await navigator.clipboard.writeText(dicomWebFileUrl);
      window.alert('DICOMweb instance endpoint copied to clipboard.');
    } catch {
      window.alert('Unable to copy. Please copy the URL manually from the debug panel.');
    }
  };

  const verifyDicomwebApi = async () => {
    if (!selectedStudy?.study_instance_uid || !token) return;
    const studyUID = encodeURIComponent(selectedStudy.study_instance_uid);
    setVerifyingDicomweb(true);
    try {
      const started = performance.now();
      const res = await axios.get(`/api/hypergrid/dicom/studies/${studyUID}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const elapsed = Math.round(performance.now() - started);
      const instances = Array.isArray(res.data?.instances) ? res.data.instances : [];
      const selectedPresent = selectedSopUID
        ? instances.some((inst: DicomWebInstance) => inst.sop_instance_uid === selectedSopUID)
        : instances.length > 0;

      setDicomwebVerification({
        ok: Boolean(res.data?.success) && selectedPresent,
        status: res.status,
        latencyMs: elapsed,
        message: selectedPresent
          ? `Study metadata reachable; instances=${instances.length}`
          : 'Study reachable, but selected SOP instance not found',
        checkedAt: new Date().toISOString(),
      });
    } catch (e: any) {
      const elapsed = 0;
      setDicomwebVerification({
        ok: false,
        status: e?.response?.status || 0,
        latencyMs: elapsed,
        message: e?.response?.data?.message || e?.message || 'Verification failed',
        checkedAt: new Date().toISOString(),
      });
    } finally {
      setVerifyingDicomweb(false);
    }
  };

  const updateCriticalAlertStatus = async (alertId: number, status: 'Acknowledged' | 'Escalated') => {
    if (!token) return;
    setAlertActionLoadingId(alertId);
    try {
      await axios.put(
        `${API_BASE}/critical-alerts/${alertId}/ack`,
        {
          status,
          acknowledgmentNotes: status === 'Escalated' ? 'Escalated from RIS widget' : 'Acknowledged from RIS widget',
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (selectedStudy?.id) {
        await fetchCriticalAlerts(selectedStudy.id);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setAlertActionLoadingId(null);
    }
  };

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Delete this study and its file?')) return;
    try {
      await axios.delete(`${API_BASE}/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setStudies(prev => prev.filter(s => s.id !== id));
      if (selectedStudy?.id === id) setSelectedStudy(null);
    } catch (err) {
      console.error(err);
    }
  };

  const updateStatus = async (id: number, status: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await axios.put(`${API_BASE}/${id}/status`,
        { status },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data.success) {
        const updated = res.data.study;
        setStudies(prev => prev.map(s => s.id === id ? updated : s));
        if (selectedStudy?.id === id) setSelectedStudy(updated);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const inputCls  = 'px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500';
  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="flex h-screen bg-gray-950 text-white overflow-hidden">

      {/* ────── LEFT: Worklist ───────────────────────────────────────────── */}
      <div className="w-[380px] min-w-[320px] flex flex-col border-r border-gray-800">

        {/* Header */}
        <div className="px-4 pt-5 pb-3 border-b border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-base font-bold text-white flex items-center gap-2">
                <ScanLine className="text-indigo-400" size={18} />
                RIS Worklist
              </h1>
              <p className="text-xs text-gray-500">{displayLabName} · {total} studies</p>
            </div>
            <button
              onClick={() => setShowUpload(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-xs font-medium text-white transition-colors"
            >
              <Upload size={12} /> Upload
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              className="w-full pl-8 pr-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="Search patient…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && fetchStudies(1)}
            />
          </div>

          {/* Filters row */}
          <div className="flex gap-2 mt-2 flex-wrap">
            <select className={inputCls} value={filterModality} onChange={e => setFilterModality(e.target.value)}>
              <option value="">All Modalities</option>
              {MODALITIES.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <select className={inputCls} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">All Status</option>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select className={inputCls} value={filterPriority} onChange={e => setFilterPriority(e.target.value)}>
              <option value="">All Priority</option>
              <option value="STAT">STAT</option>
              <option value="Urgent">Urgent</option>
              <option value="Routine">Routine</option>
            </select>
            <div className="flex gap-1">
              <input type="date" className={inputCls} value={filterFrom} onChange={e => setFilterFrom(e.target.value)} title="From date" />
              <input type="date" className={inputCls} value={filterTo}   onChange={e => setFilterTo(e.target.value)}   title="To date" />
            </div>
            <button
              onClick={() => fetchStudies(1)}
              className="px-2 py-1.5 bg-indigo-700 hover:bg-indigo-600 rounded-lg text-xs flex items-center gap-1"
            >
              <Filter size={11} /> Apply
            </button>
            <button
              onClick={() => {
                setSearch(''); setFilterModality(''); setFilterStatus('');
                setFilterPriority(''); setFilterFrom(''); setFilterTo('');
              }}
              className="px-2 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs text-gray-400 flex items-center gap-1"
            >
              <X size={11} /> Clear
            </button>
          </div>
        </div>

        {token && (
          <div className="px-3 py-2 border-b border-gray-800">
            <ImagingAnalyticsPanel token={token} />
          </div>
        )}

        {/* Study list */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-800">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!loading && error && (
            <div className="p-4 text-center">
              <AlertCircle className="mx-auto text-red-400 mb-2" size={20} />
              <p className="text-xs text-red-400">{error}</p>
              <button onClick={() => fetchStudies(1)} className="mt-2 text-xs text-indigo-400 hover:underline">Retry</button>
            </div>
          )}

          {!loading && !error && studies.length === 0 && (
            <div className="p-6 text-center">
              <ScanLine className="mx-auto text-gray-700 mb-3" size={32} />
              <p className="text-sm text-gray-500">No studies found</p>
              <button onClick={() => setShowUpload(true)} className="mt-2 text-xs text-indigo-400 hover:underline">
                Upload the first study
              </button>
            </div>
          )}

          {studies.map(study => (
            <div
              key={study.id}
              onClick={() => { setSelectedStudy(study); setActiveTab('viewer'); }}
              className={`px-4 py-3 cursor-pointer hover:bg-gray-900 transition-colors ${
                selectedStudy?.id === study.id ? 'bg-gray-900 border-l-2 border-indigo-500' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white truncate">{study.patient_name}</div>
                  <div className="text-xs text-gray-500 truncate">
                    {study.accession_number} · {fmt(study.study_date)}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${getModalityColor(study.modality)}`}>
                    {study.modality}
                  </span>
                  {study.priority !== 'Routine' && (
                    <span className={`text-xs font-bold ${priorityColors[study.priority]}`}>
                      {study.priority}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[study.status]}`}>
                  {study.status}
                </span>
                {study.study_description && (
                  <span className="text-xs text-gray-600 truncate flex-1">{study.study_description}</span>
                )}
              </div>

              {/* Mini actions */}
              <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100" onClick={e => e.stopPropagation()}>
                {study.status === 'Ordered' && (
                  <button
                    onClick={e => updateStatus(study.id, 'InProgress', e)}
                    className="text-xs px-2 py-0.5 bg-amber-900 text-amber-300 rounded hover:bg-amber-800"
                  >
                    Start
                  </button>
                )}
                {study.status === 'InProgress' && (
                  <button
                    onClick={e => updateStatus(study.id, 'Completed', e)}
                    className="text-xs px-2 py-0.5 bg-green-900 text-green-300 rounded hover:bg-green-800"
                  >
                    Complete
                  </button>
                )}
                <button
                  onClick={e => handleDelete(study.id, e)}
                  className="text-xs px-2 py-0.5 bg-red-900/50 text-red-400 rounded hover:bg-red-900 ml-auto"
                >
                  <Trash2 size={10} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-2 border-t border-gray-800 text-xs text-gray-500">
            <button
              disabled={page <= 1}
              onClick={() => fetchStudies(page - 1)}
              className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-40"
            >
              ← Prev
            </button>
            <span>{page} / {totalPages}</span>
            <button
              disabled={page >= totalPages}
              onClick={() => fetchStudies(page + 1)}
              className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        )}

        {/* Refresh */}
        <div className="px-4 py-2 border-t border-gray-800 flex justify-end">
          <button
            onClick={() => fetchStudies(page)}
            className="text-xs text-gray-500 hover:text-white flex items-center gap-1"
          >
            <RefreshCw size={11} /> Refresh
          </button>
        </div>
      </div>

      {/* ────── RIGHT: Viewer / Info / Report ───────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!selectedStudy ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-10">
            <ScanLine className="text-gray-700 mb-4" size={56} />
            <h2 className="text-lg font-semibold text-gray-500">No Study Selected</h2>
            <p className="text-sm text-gray-600 mt-2 max-w-xs">
              Select a study from the worklist to view images, metadata, and reports
            </p>
            <button
              onClick={() => setShowUpload(true)}
              className="mt-6 flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 rounded-xl text-sm font-medium"
            >
              <Upload size={14} /> Upload New Study
            </button>
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="flex items-center gap-0 border-b border-gray-800 px-4">
              {(['viewer','info','report'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-3 text-sm capitalize border-b-2 transition-colors ${
                    activeTab === tab
                      ? 'border-indigo-500 text-indigo-400 font-medium'
                      : 'border-transparent text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {tab === 'viewer' && <Eye size={13} className="inline mr-1.5" />}
                  {tab === 'info'   && <Info size={13} className="inline mr-1.5" />}
                  {tab === 'report' && <FileText size={13} className="inline mr-1.5" />}
                  {tab}
                </button>
              ))}

              {/* Study title in tab bar */}
              <div className="ml-auto flex items-center gap-3 pr-2 text-xs text-gray-500">
                <span className={`px-2 py-0.5 rounded ${statusColors[selectedStudy.status]}`}>
                  {selectedStudy.status}
                </span>
                <span>{selectedStudy.patient_name}</span>
                <button
                  onClick={() => setSelectedStudy(null)}
                  className="text-gray-600 hover:text-gray-300 ml-1"
                >
                  <X size={13} />
                </button>
              </div>
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-hidden">
              {activeTab === 'viewer' && (
                <div className="h-full flex flex-col">
                  <div className="px-4 py-2 border-b border-gray-800 flex items-center gap-3 flex-wrap bg-gray-950/70">
                    {selectedStudy.is_dicom && selectedStudy.study_instance_uid && (
                      <button
                        type="button"
                        onClick={() => openOhifViewer(selectedStudy.study_instance_uid)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
                      >
                        <Eye size={13} /> Open in OHIF Viewer
                      </button>
                    )}
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${selectedStudy.pacs_source === 'orthanc' || selectedStudy.is_dicom ? 'bg-emerald-900 text-emerald-300' : 'bg-slate-800 text-slate-300'}`}>
                      PACS: {selectedStudy.is_dicom ? 'Orthanc' : 'Legacy file'}
                    </span>
                    {selectedStudy.is_dicom && dicomWebInstances.length > 0 && (
                      <>
                        <span className="text-xs text-gray-400">Instance</span>
                        <select
                          value={selectedSopUID || ''}
                          onChange={(e) => onSelectDicomInstance(e.target.value)}
                          className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-white"
                        >
                          {dicomWebInstances.map((inst, idx) => (
                            <option key={inst.sop_instance_uid} value={inst.sop_instance_uid}>
                              {`#${idx + 1} · ${inst.sop_instance_uid.slice(-10)} · ${fmtSize(Number(inst.file_size || 0))}`}
                            </option>
                          ))}
                        </select>
                      </>
                    )}
                  </div>
                  <div className="flex-1 min-h-0">
                    {selectedStudy.is_dicom ? (
                      <div className="h-full flex flex-col items-center justify-center gap-4 p-8 text-center bg-gray-950">
                        <ScanLine className="w-12 h-12 text-indigo-400" />
                        <div>
                          <p className="text-white font-semibold">DICOM series stored in Orthanc PACS</p>
                          <p className="text-sm text-gray-400 mt-1 max-w-md">
                            Use OHIF for multi-slice CT/MRI viewing. Cornerstone preview below is for quick single-instance check only.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => openOhifViewer(selectedStudy.study_instance_uid)}
                          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold"
                        >
                          Open in OHIF Viewer
                        </button>
                        <p className="text-[10px] text-gray-600 font-mono break-all">{buildOhifViewerUrl(selectedStudy.study_instance_uid)}</p>
                        {token && (
                          <div className="w-full max-w-md mt-2">
                            <ImagingCollabPanel
                              studyInstanceUID={selectedStudy.study_instance_uid}
                              token={token}
                            />
                          </div>
                        )}
                      </div>
                    ) : (
                      <DicomViewer
                        studyId={selectedStudy.id}
                        fileName={selectedStudy.file_name}
                        mimeType={selectedStudy.mime_type}
                        isDicom={false}
                        patientName={selectedStudy.patient_name}
                        modality={selectedStudy.modality}
                        studyDate={fmt(selectedStudy.study_date)}
                        fileUrlOverride={undefined}
                      />
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'info' && (
                <div className="h-full overflow-y-auto p-6">
                  <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                    <Info size={14} className="text-indigo-400" />
                    Study Metadata
                  </h3>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {[
                      ['Patient Name', selectedStudy.patient_name],
                      ['Patient Sex',  selectedStudy.patient_sex === 'M' ? 'Male' : selectedStudy.patient_sex === 'F' ? 'Female' : 'Unknown'],
                      ['Date of Birth', fmt(selectedStudy.patient_dob)],
                      ['Accession #',  selectedStudy.accession_number],
                      ['Study UID',    selectedStudy.study_instance_uid],
                      ['Modality',     selectedStudy.modality],
                      ['Body Part',    selectedStudy.body_part || '—'],
                      ['Description',  selectedStudy.study_description || '—'],
                      ['Study Date',   fmt(selectedStudy.study_date)],
                      ['Priority',     selectedStudy.priority],
                      ['Status',       selectedStudy.status],
                      ['Referring Physician', selectedStudy.referring_physician || '—'],
                      ['File Name',    selectedStudy.file_name],
                      ['File Size',    fmtSize(selectedStudy.file_size)],
                      ['DICOM',        selectedStudy.is_dicom ? 'Yes' : 'No'],
                      ['Series Count', String(selectedStudy.series_count)],
                      ['Image Count',  String(selectedStudy.image_count)],
                      ['Uploaded',     fmt(selectedStudy.created_at)],
                      ['Notes',        selectedStudy.notes || '—'],
                    ].map(([label, value]) => (
                      <div key={label} className="bg-gray-900 rounded-lg p-3 border border-gray-800">
                        <div className="text-xs text-gray-500 mb-0.5">{label}</div>
                        <div className="text-sm text-white break-all">{value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Quick status actions */}
                  <div className="mt-6">
                    <h4 className="text-xs font-semibold text-gray-400 mb-3 uppercase tracking-wider">Update Status</h4>
                    <div className="flex flex-wrap gap-2">
                      {STATUSES.map(s => (
                        <button
                          key={s}
                          disabled={selectedStudy.status === s}
                          onClick={e => { updateStatus(selectedStudy.id, s, e); setSelectedStudy(prev => prev ? { ...prev, status: s as Study['status'] } : prev); }}
                          className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                            selectedStudy.status === s
                              ? 'bg-indigo-700 border-indigo-600 text-white'
                              : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* DICOMweb debug helpers */}
                  {selectedStudy.is_dicom && (
                    <div className="mt-6 bg-gray-900 rounded-lg p-4 border border-gray-800">
                      <h4 className="text-xs font-semibold text-gray-400 mb-3 uppercase tracking-wider">DICOMweb Debug</h4>
                      <div className="grid grid-cols-1 gap-2 text-xs">
                        <div className="bg-gray-950 border border-gray-800 rounded p-2">
                          <div className="text-gray-500 mb-1">Study UID</div>
                          <div className="font-mono text-gray-300 break-all">{selectedStudy.study_instance_uid || '—'}</div>
                        </div>
                        <div className="bg-gray-950 border border-gray-800 rounded p-2">
                          <div className="text-gray-500 mb-1">Selected SOP UID</div>
                          <div className="font-mono text-gray-300 break-all">{selectedSopUID || '—'}</div>
                        </div>
                        <div className="bg-gray-950 border border-gray-800 rounded p-2">
                          <div className="text-gray-500 mb-1">Instance Endpoint</div>
                          <div className="font-mono text-gray-300 break-all">{dicomWebFileUrl || 'Not resolved (RIS fallback active)'}</div>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          onClick={openDicomwebDebugUrl}
                          disabled={!dicomWebFileUrl}
                          className="px-3 py-1.5 text-xs rounded-lg border bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700 disabled:opacity-40"
                        >
                          Open DICOMweb URL
                        </button>
                        <button
                          onClick={copyDicomwebUrl}
                          disabled={!dicomWebFileUrl}
                          className="px-3 py-1.5 text-xs rounded-lg border bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700 disabled:opacity-40"
                        >
                          Copy Endpoint
                        </button>
                        <button
                          onClick={verifyDicomwebApi}
                          disabled={verifyingDicomweb || !selectedStudy.study_instance_uid}
                          className="px-3 py-1.5 text-xs rounded-lg border bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700 disabled:opacity-40"
                        >
                          {verifyingDicomweb ? 'Verifying...' : 'Verify via API'}
                        </button>
                      </div>
                      {dicomwebVerification && (
                        <div className="mt-3 text-xs rounded border border-gray-800 bg-gray-950 p-2">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`px-2 py-0.5 rounded-full ${dicomwebVerification.ok ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
                              {dicomwebVerification.ok ? 'PASS' : 'FAIL'}
                            </span>
                            <span className="text-gray-400">HTTP {dicomwebVerification.status || '—'}</span>
                            <span className="text-gray-400">{dicomwebVerification.latencyMs} ms</span>
                          </div>
                          <div className="text-gray-300">{dicomwebVerification.message}</div>
                          <div className="text-gray-500 mt-1">Checked: {fmtDateTime(dicomwebVerification.checkedAt)}</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'report' && (
                <div className="h-full overflow-y-auto p-6">
                  <div className="mb-4 rounded-xl border border-gray-800 bg-gray-900/60 p-4">
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                        <AlertTriangle size={14} className="text-red-400" />
                        Critical Alerts
                      </h4>
                      <button
                        onClick={() => selectedStudy?.id && fetchCriticalAlerts(selectedStudy.id)}
                        className="text-xs text-gray-400 hover:text-white flex items-center gap-1"
                      >
                        <RefreshCw size={11} /> Refresh
                      </button>
                    </div>

                    {cronHealthTask && (
                      <div className="mb-3 text-xs rounded-lg border border-gray-800 bg-gray-950/70 p-2 text-gray-400">
                        <span className="text-gray-300">Escalation Cron:</span>{' '}
                        {cronHealthTask.lastStatus === 'success' ? (
                          <span className="text-emerald-400">Healthy</span>
                        ) : cronHealthTask.lastStatus === 'error' ? (
                          <span className="text-red-400">Error</span>
                        ) : (
                          <span className="text-amber-400">{cronHealthTask.lastStatus || 'unknown'}</span>
                        )}
                        {' · '}Last run: {fmtDateTime(cronHealthTask.lastRun)}
                        {cronHealthTask.lastError ? (
                          <span className="text-red-400"> · {cronHealthTask.lastError}</span>
                        ) : null}
                      </div>
                    )}

                    {alertsLoading ? (
                      <div className="text-xs text-gray-500">Loading alerts…</div>
                    ) : alertsError ? (
                      <div className="text-xs text-red-400">{alertsError}</div>
                    ) : criticalAlerts.length === 0 ? (
                      <div className="text-xs text-gray-500">No critical alerts for this study.</div>
                    ) : (
                      <div className="space-y-2">
                        {criticalAlerts.map((alert) => (
                          <div key={alert.id} className="rounded-lg border border-gray-800 bg-gray-950/60 p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="text-sm text-white">{alert.alert_reason}</div>
                                <div className="text-xs text-gray-500 mt-1">
                                  Raised: {fmtDateTime(alert.raised_at)} · Due: {fmtDateTime(alert.due_at)}
                                </div>
                              </div>
                              <span className={`text-xs px-2 py-0.5 rounded-full ${
                                alert.status === 'Open'
                                  ? 'bg-red-900 text-red-300'
                                  : alert.status === 'Escalated'
                                    ? 'bg-amber-900 text-amber-300'
                                    : 'bg-emerald-900 text-emerald-300'
                              }`}>
                                {alert.status}
                              </span>
                            </div>

                            {alert.status === 'Open' && (
                              <div className="mt-2 flex gap-2">
                                <button
                                  onClick={() => updateCriticalAlertStatus(alert.id, 'Acknowledged')}
                                  disabled={alertActionLoadingId === alert.id}
                                  className="text-xs px-2 py-1 rounded bg-emerald-800 text-emerald-200 hover:bg-emerald-700 disabled:opacity-50"
                                >
                                  Acknowledge
                                </button>
                                <button
                                  onClick={() => updateCriticalAlertStatus(alert.id, 'Escalated')}
                                  disabled={alertActionLoadingId === alert.id}
                                  className="text-xs px-2 py-1 rounded bg-amber-800 text-amber-200 hover:bg-amber-700 disabled:opacity-50"
                                >
                                  Escalate
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {token && selectedStudy && (
                    <div className="mb-4">
                      <ImagingPlatformPanels
                        token={token}
                        studyId={selectedStudy.id}
                        studyInstanceUID={selectedStudy.study_instance_uid}
                        patientName={selectedStudy.patient_name}
                      />
                    </div>
                  )}

                  <ReportPanel
                    study={selectedStudy}
                    onSaved={updated => setStudies(prev => prev.map(s => s.id === updated.id ? updated : s))}
                  />
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Upload Modal */}
      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onUploaded={s => { setStudies(prev => [s, ...prev]); setTotal(t => t + 1); }}
          labName={labData.labName || 'Lab'}
        />
      )}
    </div>
  );
};

export default LabRIS;
