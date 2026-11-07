import { doctorName, reportTitle } from '@/utils/patient-display';
import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar, Pill, Activity, Heart, Moon, Utensils, FileText,
  Search, BookHeart, Plus, ChevronDown, ChevronUp,
  Clock, Edit3, Stethoscope, Thermometer, Brain, Filter, TrendingUp,
  RefreshCw, Wifi, WifiOff, Zap, Shield, Bot, Smartphone,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface HealthDiaryEntry {
  id: number;
  userId: number;
  entryDate: string;
  entryType: string;
  title: string;
  description: string;
  data: any;
  linkedRecordType?: string;
  createdAt: string;
  updatedAt: string;
}

interface DataSource {
  id: string;
  name: string;
  description: string;
  icon: string;
  status: 'active' | 'inactive';
  entryTypes: string[];
  count: number;
  lastSync: string | null;
}

interface LogForm {
  entryType: string; title: string; description: string; entryDate: string;
  vitalType: string; vitalValue: string; vitalUnit: string;
  severity: string; duration: string;
  medicationName: string; dosage: string; frequency: string; medAction: string;
  moodScore: number;
  sleepHours: string; sleepQuality: string;
  mealType: string;
}

type EntryTypeCfg = {
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  dot: string; bg: string; text: string; border: string; bar: string;
};

// ─── Config ───────────────────────────────────────────────────────────────────

const TYPE_CFG: Record<string, EntryTypeCfg> = {
  ai_consultation: { label: 'AI Consult',     Icon: Brain,       dot: 'bg-blue-500',    bg: 'bg-blue-50 dark:bg-blue-900/20',       text: 'text-blue-700 dark:text-blue-300',     border: 'border-blue-200 dark:border-blue-800',   bar: 'bg-blue-500' },
  consultation:    { label: 'Doctor Consult', Icon: Stethoscope, dot: 'bg-indigo-500',  bg: 'bg-indigo-50 dark:bg-indigo-900/20',   text: 'text-indigo-700 dark:text-indigo-300', border: 'border-indigo-200 dark:border-indigo-800', bar: 'bg-indigo-500' },
  appointment:     { label: 'Appointment',    Icon: Calendar,    dot: 'bg-purple-500',  bg: 'bg-purple-50 dark:bg-purple-900/20',   text: 'text-purple-700 dark:text-purple-300', border: 'border-purple-200 dark:border-purple-800', bar: 'bg-purple-500' },
  lab_test:        { label: 'Lab Test',       Icon: Activity,    dot: 'bg-cyan-500',    bg: 'bg-cyan-50 dark:bg-cyan-900/20',       text: 'text-cyan-700 dark:text-cyan-300',     border: 'border-cyan-200 dark:border-cyan-800',   bar: 'bg-cyan-500' },
  lab_result:      { label: 'Lab Result',     Icon: FileText,    dot: 'bg-teal-500',    bg: 'bg-teal-50 dark:bg-teal-900/20',       text: 'text-teal-700 dark:text-teal-300',     border: 'border-teal-200 dark:border-teal-800',   bar: 'bg-teal-500' },
  prescription:    { label: 'Prescription',   Icon: Pill,        dot: 'bg-green-500',   bg: 'bg-green-50 dark:bg-green-900/20',     text: 'text-green-700 dark:text-green-300',   border: 'border-green-200 dark:border-green-800', bar: 'bg-green-500' },
  medication:      { label: 'Medication',     Icon: Pill,        dot: 'bg-lime-600',    bg: 'bg-lime-50 dark:bg-lime-900/20',       text: 'text-lime-700 dark:text-lime-300',     border: 'border-lime-200 dark:border-lime-800',   bar: 'bg-lime-500' },
  vital:           { label: 'Vital Sign',     Icon: Heart,       dot: 'bg-pink-500',    bg: 'bg-pink-50 dark:bg-pink-900/20',       text: 'text-pink-700 dark:text-pink-300',     border: 'border-pink-200 dark:border-pink-800',   bar: 'bg-pink-500' },
  device_reading:  { label: 'Device Reading', Icon: Activity,    dot: 'bg-orange-500',  bg: 'bg-orange-50 dark:bg-orange-900/20',   text: 'text-orange-700 dark:text-orange-300', border: 'border-orange-200 dark:border-orange-800', bar: 'bg-orange-500' },
  symptom:         { label: 'Symptom',        Icon: Thermometer, dot: 'bg-red-500',     bg: 'bg-red-50 dark:bg-red-900/20',         text: 'text-red-700 dark:text-red-300',       border: 'border-red-200 dark:border-red-800',     bar: 'bg-red-500' },
  diagnosis:       { label: 'Diagnosis',      Icon: FileText,    dot: 'bg-rose-500',    bg: 'bg-rose-50 dark:bg-rose-900/20',       text: 'text-rose-700 dark:text-rose-300',     border: 'border-rose-200 dark:border-rose-800',   bar: 'bg-rose-500' },
  mood:            { label: 'Mood',           Icon: Heart,       dot: 'bg-fuchsia-500', bg: 'bg-fuchsia-50 dark:bg-fuchsia-900/20', text: 'text-fuchsia-700 dark:text-fuchsia-300', border: 'border-fuchsia-200 dark:border-fuchsia-800', bar: 'bg-fuchsia-500' },
  sleep:           { label: 'Sleep',          Icon: Moon,        dot: 'bg-violet-500',  bg: 'bg-violet-50 dark:bg-violet-900/20',   text: 'text-violet-700 dark:text-violet-300', border: 'border-violet-200 dark:border-violet-800', bar: 'bg-violet-500' },
  diet:            { label: 'Diet',           Icon: Utensils,    dot: 'bg-amber-500',   bg: 'bg-amber-50 dark:bg-amber-900/20',     text: 'text-amber-700 dark:text-amber-300',   border: 'border-amber-200 dark:border-amber-800', bar: 'bg-amber-500' },
  note:            { label: 'Note',           Icon: Edit3,       dot: 'bg-slate-500',   bg: 'bg-slate-50 dark:bg-slate-700/30',     text: 'text-slate-700 dark:text-slate-300',   border: 'border-slate-200 dark:border-slate-700', bar: 'bg-slate-400' },
};

const FALLBACK_CFG: EntryTypeCfg = {
  label: 'Entry', Icon: FileText,
  dot: 'bg-gray-400', bg: 'bg-gray-50 dark:bg-gray-800', text: 'text-gray-700 dark:text-gray-300',
  border: 'border-gray-200 dark:border-gray-700', bar: 'bg-gray-400',
};
const getCfg = (type: string) => TYPE_CFG[type] ?? FALLBACK_CFG;

// Major events get a larger dot and stronger card border
const MAJOR_TYPES = new Set(['consultation', 'appointment', 'diagnosis', 'prescription', 'lab_result', 'lab_test', 'ai_consultation']);
// Minor events (lightweight check-ins) get a dimmer dot
const MINOR_TYPES = new Set(['note', 'mood', 'sleep', 'diet']);

// Determine how an entry was logged (auto vs manual) and what source it came from
const entrySource = (entry: HealthDiaryEntry): { label: string; auto: boolean } => {
  const src = entry.data?.source || entry.linkedRecordType || '';
  if (entry.entryType === 'ai_consultation' || src === 'ai_chat') return { label: 'Dr. iSHA AI', auto: true };
  if (src === 'ehr_sync' || src === 'ehr' || entry.linkedRecordType === 'ehr') return { label: 'EHR Sync', auto: true };
  if (src === 'report_upload') return { label: 'Report Upload', auto: true };
  if (src === 'device' || entry.entryType === 'device_reading') return { label: 'Device', auto: true };
  if (entry.linkedRecordType === 'appointment') return { label: 'Consultation', auto: true };
  if (entry.linkedRecordType === 'prescription') return { label: 'Prescription', auto: true };
  if (entry.linkedRecordType === 'lab_test') return { label: 'Lab', auto: true };
  if (['consultation', 'appointment', 'prescription', 'lab_result', 'lab_test', 'diagnosis'].includes(entry.entryType) && !src)
    return { label: 'Auto-logged', auto: true };
  return { label: 'Manual', auto: false };
};

const SOURCE_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  'Dr. iSHA AI': Bot,
  'EHR Sync': FileText,
  'Report Upload': FileText,
  'Device': Smartphone,
  'Consultation': Stethoscope,
  'Prescription': Pill,
  'Lab': Activity,
  'Auto-logged': Zap,
  'Manual': Edit3,
};

const MANUAL_TYPES = [
  { value: 'note',       label: '📝 Personal Note' },
  { value: 'symptom',    label: '🤒 Symptom' },
  { value: 'vital',      label: '💗 Vital Sign' },
  { value: 'medication', label: '💊 Medication' },
  { value: 'mood',       label: '😊 Mood' },
  { value: 'sleep',      label: '😴 Sleep' },
  { value: 'diet',       label: '🥗 Diet / Meal' },
];

const MOOD_EMOJIS  = ['😢', '😕', '😐', '🙂', '😄'];
const MOOD_LABELS  = ['Very low', 'Low', 'Neutral', 'Good', 'Great'];
const VITAL_UNITS: Record<string, string> = {
  'Heart Rate': 'bpm', 'Blood Pressure': 'mmHg', 'Temperature': '°C',
  'Oxygen Saturation': '%', 'Weight': 'kg', 'Blood Sugar': 'mg/dL',
};

const ALL_FILTER_TYPES = [
  { value: 'all', label: 'All Entries' },
  ...Object.entries(TYPE_CFG).map(([value, c]) => ({ value, label: c.label })),
];

const toLocalDatetimeValue = (d = new Date()) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

const BLANK_FORM: LogForm = {
  entryType: 'note', title: '', description: '', entryDate: toLocalDatetimeValue(),
  vitalType: 'Heart Rate', vitalValue: '', vitalUnit: 'bpm',
  severity: 'mild', duration: '',
  medicationName: '', dosage: '', frequency: '', medAction: 'taken',
  moodScore: 3, sleepHours: '', sleepQuality: 'good', mealType: 'lunch',
};

// ─── Auto-generated event summary ────────────────────────────────────────────

const eventSummary = (entry: HealthDiaryEntry): string => {
  const d = entry.data || {};
  switch (entry.entryType) {
    case 'vital':
    case 'device_reading':
      if (d.vitalType && d.vitalValue)
        return `${d.vitalType}: ${d.vitalValue} ${d.unit ?? ''}`.trim();
      break;
    case 'symptom': {
      const sev  = d.severity ? d.severity.charAt(0).toUpperCase() + d.severity.slice(1) : '';
      const dur  = d.duration ? `for ${d.duration}` : '';
      return [sev, dur].filter(Boolean).join(' · ') || 'Symptom logged';
    }
    case 'medication': {
      const act  = d.action ? d.action.charAt(0).toUpperCase() + d.action.slice(1) : '';
      const name = d.medicationName ?? d.name ?? '';
      return [act, name, d.dosage].filter(Boolean).join(' · ');
    }
    case 'mood':
      if (d.moodScore) return `${MOOD_EMOJIS[d.moodScore - 1]}  ${MOOD_LABELS[d.moodScore - 1]}`;
      break;
    case 'sleep':
      if (d.hours) return `${d.hours}h slept · ${d.quality ?? ''} quality`.replace(' · quality', '').trim();
      break;
    case 'diet':
      if (d.mealType) return d.mealType.charAt(0).toUpperCase() + d.mealType.slice(1);
      break;
    case 'consultation':
    case 'appointment':
      return [d.doctorName && `with ${d.doctorName}`, d.status].filter(Boolean).join(' · ') || 'Visit';
    case 'ai_consultation': {
      const msg = d.userMessage ?? entry.description ?? '';
      return msg ? `"${msg.slice(0, 72)}${msg.length > 72 ? '…' : ''}"` : 'AI consultation';
    }
    case 'prescription': {
      const meds = d.medications;
      if (meds?.length) return `${meds.length} medication${meds.length > 1 ? 's' : ''} prescribed`;
      if (d.diagnosis) return `Diagnosis: ${d.diagnosis}`;
      break;
    }
    case 'lab_test':
    case 'lab_result':
      if (d.testName) return d.results ? `${d.testName}: ${d.results}` : d.testName;
      break;
    case 'diagnosis':
      if (d.condition) return `${d.condition}${d.severity ? ` · ${d.severity}` : ''}`;
      break;
  }
  return entry.description?.slice(0, 80) ?? '';
};

// ─── Component ────────────────────────────────────────────────────────────────

const HealthDiary: React.FC = () => {
  const [entries, setEntries]           = useState<HealthDiaryEntry[]>([]);
  const [loading, setLoading]           = useState(true);
  const [selectedType, setSelectedType] = useState('all');
  const [searchQuery, setSearchQuery]   = useState('');
  const [dateRange, setDateRange]       = useState({ start: '', end: '' });
  const [showLogModal, setShowLogModal] = useState(false);
  const [form, setForm]                 = useState<LogForm>({ ...BLANK_FORM });
  const [saving, setSaving]             = useState(false);
  const [expandedIds, setExpandedIds]   = useState<Set<number>>(new Set());
  const [showFilters, setShowFilters]   = useState(false);
  const [sources, setSources]           = useState<DataSource[]>([]);
  const [showSources, setShowSources]   = useState(false);
  const [syncing, setSyncing]           = useState(false);

  useEffect(() => { fetchDiaryEntries(); fetchSources(); }, []);
  useEffect(() => { fetchDiaryEntries(); }, [selectedType, dateRange]);

  const fetchDiaryEntries = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      let url = '/api/health-diary?limit=200';
      if (selectedType !== 'all') url += `&entryType=${selectedType}`;
      if (dateRange.start) url += `&startDate=${dateRange.start}`;
      if (dateRange.end)   url += `&endDate=${dateRange.end}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setEntries((data.entries || []).map((entry: HealthDiaryEntry) => {
        const details = entry.data || {};
        let title = entry.title.replace(/\bDr\.?\s+(?:Dr\.?\s+)+/gi, 'Dr. ');
        let description = entry.description || '';
        if (entry.entryType === 'medication' && /undefined|null/.test(description)) description = [details.dosage, details.frequency, details.duration].filter(value => value && !/undefined|null/.test(String(value))).join(' · ') || 'Dose timing and duration not specified';
        if (entry.entryType === 'prescription' && /to be filled by doctor/i.test(`${title} ${description}`)) { title = 'Draft prescription'; description = 'Awaiting completion by your doctor'; }
        if (['lab_result', 'lab_test'].includes(entry.entryType)) title = reportTitle(details.testName || title, 'Medical report');
        return { ...entry, title, description };
      }));
    } catch {
      toast.error('Failed to load health diary');
    } finally {
      setLoading(false);
    }
  };

  const fetchSources = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/health-diary/sources', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setSources(data.sources || []);
    } catch { /* non-critical */ }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/health-diary/sync', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message);
        if (data.synced?.total > 0) {
          fetchDiaryEntries();
          fetchSources();
        }
      } else {
        toast.error('Sync failed');
      }
    } catch {
      toast.error('Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  // Use entryDate (when the event happened); fall back to createdAt for system entries
  const eventDate = (e: HealthDiaryEntry) => new Date(e.entryDate || e.createdAt);

  const filteredEntries = useMemo(() =>
    entries.filter(e => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return e.title.toLowerCase().includes(q) || e.description.toLowerCase().includes(q);
    }),
    [entries, searchQuery]
  );

  // ── 14-day activity sparkline data ─────────────────────────────────────────
  const sparkline = useMemo(() => {
    return Array.from({ length: 14 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (13 - i));
      d.setHours(0, 0, 0, 0);
      const count = entries.filter(e => eventDate(e).toDateString() === d.toDateString()).length;
      return { date: d, count, label: d.toLocaleDateString('en-IN', { weekday: 'short' }) };
    });
  }, [entries]);

  const sparkMax = Math.max(...sparkline.map(d => d.count), 1);

  // ── Top-5 type distribution ─────────────────────────────────────────────────
  const typeDist = useMemo(() => {
    const counts: Record<string, number> = {};
    entries.forEach(e => { counts[e.entryType] = (counts[e.entryType] || 0) + 1; });
    return Object.entries(counts).sort(([, a], [, b]) => b - a).slice(0, 5);
  }, [entries]);

  // ── Consecutive-day streak ──────────────────────────────────────────────────
  const streak = useMemo(() => {
    let s = 0;
    const dateSet = new Set(entries.map(e => eventDate(e).toDateString()));
    for (let i = 0; ; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      if (dateSet.has(d.toDateString())) s++;
      else break;
    }
    return s;
  }, [entries]);

  // ── Grouped timeline ────────────────────────────────────────────────────────
  const groupedEntries = useMemo(() => {
    const map: Record<string, HealthDiaryEntry[]> = {};
    filteredEntries.forEach(e => { (map[eventDate(e).toDateString()] ||= []).push(e); });
    const today     = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    return Object.entries(map)
      .sort(([a], [b]) => new Date(b).getTime() - new Date(a).getTime())
      .map(([key, items]) => {
        const label = key === today ? 'Today'
          : key === yesterday ? 'Yesterday'
          : new Date(key).toLocaleDateString('en-IN', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
        return { key, label, items: [...items].sort((a, b) => eventDate(b).getTime() - eventDate(a).getTime()) };
      });
  }, [filteredEntries]);

  const formatTime = (e: HealthDiaryEntry) =>
    eventDate(e).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

  const toggleExpanded = (id: number) =>
    setExpandedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const setF = (k: keyof LogForm, v: any) => setForm(p => ({ ...p, [k]: v }));

  // ── Save new entry ──────────────────────────────────────────────────────────
  const handleLogEvent = async () => {
    if (!form.title.trim()) { toast.error('Please add a title'); return; }
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(form.entryDate) || Number.isNaN(new Date(form.entryDate).getTime())) {
      toast.error('Please enter a complete time'); return;
    }
    const token = localStorage.getItem('token');
    let data: Record<string, any> = {};
    if (form.entryType === 'vital')       data = { vitalType: form.vitalType, vitalValue: form.vitalValue, unit: form.vitalUnit };
    else if (form.entryType === 'symptom')    data = { severity: form.severity, duration: form.duration };
    else if (form.entryType === 'medication') data = { medicationName: form.medicationName, dosage: form.dosage, frequency: form.frequency, action: form.medAction };
    else if (form.entryType === 'mood')   data = { moodScore: form.moodScore, mood: MOOD_EMOJIS[form.moodScore - 1] };
    else if (form.entryType === 'sleep')  data = { hours: form.sleepHours, quality: form.sleepQuality };
    else if (form.entryType === 'diet')   data = { mealType: form.mealType };
    try {
      setSaving(true);
      const res = await fetch('/api/health-diary', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryType: form.entryType, title: form.title.trim(), description: form.description.trim(), entryDate: new Date(form.entryDate).toISOString(), data }),
      });
      if (!res.ok) throw new Error();
      toast.success('Health event logged');
      setShowLogModal(false);
      setForm({ ...BLANK_FORM, entryDate: toLocalDatetimeValue() });
      fetchDiaryEntries();
    } catch { toast.error('Failed to save entry'); }
    finally { setSaving(false); }
  };

  const openLogModal = () => { setForm({ ...BLANK_FORM, entryDate: toLocalDatetimeValue() }); setShowLogModal(true); };

  // ── Rich entry details (expanded section) ──────────────────────────────────
  const renderDetails = (entry: HealthDiaryEntry) => {
    const d = entry.data || {};
    if (entry.data?.consultationType === 'ai_chat' || entry.entryType === 'ai_consultation') {
      return (
        <div className="space-y-2">
          <div className="bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-400 p-3 rounded-r-lg">
            <p className="text-[11px] font-bold text-blue-700 dark:text-blue-300 mb-1 uppercase tracking-wide">Your Message</p>
            <p className="text-xs text-blue-800 dark:text-blue-200">{d.userMessage || entry.description}</p>
          </div>
          <div className="bg-emerald-50 dark:bg-emerald-900/20 border-l-4 border-emerald-400 p-3 rounded-r-lg">
            <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 mb-1 uppercase tracking-wide">Dr. iSHA's Response</p>
            <p className="text-xs text-emerald-800 dark:text-emerald-200 whitespace-pre-wrap">{d.aiResponse}</p>
          </div>
          {d.symptomsDetected?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              <span className="text-[10px] font-semibold text-slate-500 self-center">Detected:</span>
              {d.symptomsDetected.map((s: string, i: number) => (
                <span key={i} className="px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-[10px] rounded-full">{s}</span>
              ))}
            </div>
          )}
        </div>
      );
    }
    if (entry.entryType === 'consultation' || entry.entryType === 'appointment') return (
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        {d.doctorName      && <><dt className="text-slate-400">Doctor</dt><dd className="font-medium text-slate-700 dark:text-slate-200">{d.doctorName}</dd></>}
        {d.consultationType && <><dt className="text-slate-400">Type</dt><dd className="font-medium text-slate-700 dark:text-slate-200">{d.consultationType}</dd></>}
        {d.status          && <><dt className="text-slate-400">Status</dt><dd><span className={cn('px-1.5 py-0.5 rounded-full text-[10px] font-semibold', d.status === 'completed' ? 'bg-green-100 text-green-800' : d.status === 'scheduled' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-700')}>{d.status}</span></dd></>}
      </dl>
    );
    if (entry.entryType === 'prescription') return (
      <div className="text-xs space-y-2">
        {d.medications?.length > 0 && (
          <ul className="space-y-1">
            {d.medications.map((m: any, i: number) => (
              <li key={i} className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
                <span className="font-medium text-slate-700 dark:text-slate-200">{m.name}</span>
                <span className="text-slate-400">{m.dosage} · {m.frequency}</span>
              </li>
            ))}
          </ul>
        )}
        {d.diagnosis && <p className="text-slate-500">Diagnosis: <span className="font-medium text-slate-700 dark:text-slate-200">{d.diagnosis}</span></p>}
      </div>
    );
    if (entry.entryType === 'lab_test' || entry.entryType === 'lab_result') return (
      <div className="text-xs space-y-1">
        {d.testName && <p className="font-semibold text-slate-700 dark:text-slate-200">{d.testName}</p>}
        {d.results && <div className="bg-cyan-50 dark:bg-cyan-900/20 p-2 rounded-lg"><p>Result: <span className="font-semibold">{d.results}</span></p>{d.normalRange && <p className="text-slate-400 mt-0.5">Normal: {d.normalRange}</p>}</div>}
        {d.status && <span className="inline-block px-2 py-0.5 bg-blue-100 text-blue-800 text-[10px] rounded-full">{d.status}</span>}
      </div>
    );
    if (entry.entryType === 'vital' || entry.entryType === 'device_reading') return (
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        {d.vitalType  && <><dt className="text-slate-400">Type</dt><dd className="font-medium text-slate-700 dark:text-slate-200">{d.vitalType}</dd></>}
        {d.vitalValue && <><dt className="text-slate-400">Value</dt><dd className="font-medium text-slate-700 dark:text-slate-200">{d.vitalValue} {d.unit}</dd></>}
        {d.source     && <><dt className="text-slate-400">Source</dt><dd className="font-medium text-slate-700 dark:text-slate-200">{d.source}</dd></>}
        {d.deviceName && <><dt className="text-slate-400">Device</dt><dd className="font-medium text-slate-700 dark:text-slate-200">{d.deviceName}</dd></>}
      </dl>
    );
    if (entry.entryType === 'medication') return (
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        {d.medicationName && <><dt className="text-slate-400">Name</dt><dd className="font-medium text-slate-700 dark:text-slate-200">{d.medicationName}</dd></>}
        {d.dosage          && <><dt className="text-slate-400">Dosage</dt><dd className="font-medium text-slate-700 dark:text-slate-200">{d.dosage}</dd></>}
        {d.frequency       && <><dt className="text-slate-400">Frequency</dt><dd className="font-medium text-slate-700 dark:text-slate-200">{d.frequency}</dd></>}
        {d.action          && <><dt className="text-slate-400">Action</dt><dd><span className={cn('px-1.5 py-0.5 rounded-full text-[10px] font-semibold', d.action === 'taken' ? 'bg-green-100 text-green-800' : d.action === 'missed' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-700')}>{d.action}</span></dd></>}
      </dl>
    );
    if (entry.entryType === 'diagnosis') return (
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        {d.condition && <><dt className="text-slate-400">Condition</dt><dd className="font-medium text-slate-700 dark:text-slate-200">{d.condition}</dd></>}
        {d.severity  && <><dt className="text-slate-400">Severity</dt><dd><span className={cn('px-1.5 py-0.5 rounded-full text-[10px] font-semibold', d.severity === 'critical' ? 'bg-red-100 text-red-800' : d.severity === 'high' ? 'bg-orange-100 text-orange-800' : d.severity === 'moderate' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800')}>{d.severity}</span></dd></>}
        {d.icdCode   && <><dt className="text-slate-400">ICD Code</dt><dd className="font-medium text-slate-700 dark:text-slate-200">{d.icdCode}</dd></>}
      </dl>
    );
    if (entry.entryType === 'sleep') return (
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        {d.hours   && <><dt className="text-slate-400">Duration</dt><dd className="font-medium text-slate-700 dark:text-slate-200">{d.hours}h</dd></>}
        {d.quality && <><dt className="text-slate-400">Quality</dt><dd className="font-medium capitalize text-slate-700 dark:text-slate-200">{d.quality}</dd></>}
      </dl>
    );
    if (entry.entryType === 'diet') return (
      <p className="text-xs text-slate-500">Meal type: <span className="font-medium capitalize text-slate-700 dark:text-slate-200">{d.mealType}</span></p>
    );
    return null;
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 space-y-5 animate-in fade-in duration-500">

      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-800 via-slate-900 to-slate-800 p-6 text-white shadow-2xl"
      >
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-teal-500/20 to-transparent rounded-full blur-3xl pointer-events-none" />
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 rounded-xl bg-gradient-to-br from-teal-500 to-teal-600 shadow-lg shadow-teal-500/30">
                <BookHeart className="w-5 h-5" />
              </div>
              <Badge className="bg-white/10 text-white/90 border-white/20 text-xs">Personal Health Log</Badge>
            </div>
            <h1 className="text-2xl font-bold">Health Diary</h1>
            <p className="text-slate-300 text-sm mt-1">{filteredEntries.length} event{filteredEntries.length !== 1 ? 's' : ''} recorded</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="icon"
              aria-label="Sync from health records"
              title="Sync from EHR / appointments / prescriptions"
              onClick={handleSync}
              disabled={syncing}
              className="h-9 w-9 rounded-xl border-white/20 bg-white/10 text-white hover:bg-white/20"
            >
              <RefreshCw className={cn('w-4 h-4', syncing && 'animate-spin')} />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Connected data sources"
              title="Connected data sources"
              onClick={() => { setShowSources(p => !p); if (!showSources) fetchSources(); }}
              className={cn('h-9 w-9 rounded-xl border-white/20 bg-white/10 text-white hover:bg-white/20', showSources && 'bg-teal-500/30 border-teal-300')}
            >
              <Wifi className="w-4 h-4" />
            </Button>
            <Button onClick={openLogModal} className="bg-teal-500 hover:bg-teal-400 text-white shadow-lg shadow-teal-500/30 rounded-xl">
              <Plus className="w-4 h-4 mr-1.5" />Log Event
            </Button>
          </div>
        </div>
      </motion.div>

      {/* ── Connected Sources panel ──────────────────────────────────────────── */}
      <AnimatePresence>
        {showSources && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="rounded-2xl bg-white dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wifi className="w-4 h-4 text-teal-600" />
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Connected Data Sources</span>
                  <span className="text-[11px] bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 px-2 py-0.5 rounded-full">Auto-logging active</span>
                </div>
                <Button
                  size="sm"
                  onClick={handleSync}
                  disabled={syncing}
                  className="bg-teal-600 hover:bg-teal-700 text-white rounded-lg h-8 text-xs"
                >
                  <RefreshCw className={cn('w-3.5 h-3.5 mr-1.5', syncing && 'animate-spin')} />
                  {syncing ? 'Syncing…' : 'Sync now'}
                </Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {sources.map(src => {
                  const SrcIcon = src.icon === 'brain' ? Brain
                    : src.icon === 'stethoscope' ? Stethoscope
                    : src.icon === 'pill' ? Pill
                    : src.icon === 'activity' ? Activity
                    : src.icon === 'heart' ? Heart
                    : src.icon === 'shield' ? Shield
                    : src.icon === 'edit' ? Edit3
                    : FileText;
                  return (
                    <div
                      key={src.id}
                      className="flex items-start gap-3 p-3 rounded-xl border border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40"
                    >
                      <div className={cn(
                        'p-2 rounded-lg shrink-0',
                        src.status === 'active' ? 'bg-teal-50 dark:bg-teal-900/30' : 'bg-slate-100 dark:bg-slate-700'
                      )}>
                        <SrcIcon className={cn('w-4 h-4', src.status === 'active' ? 'text-teal-600' : 'text-slate-400')} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{src.name}</span>
                          <span className={cn(
                            'flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full',
                            src.status === 'active'
                              ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                              : 'bg-slate-100 dark:bg-slate-700 text-slate-500'
                          )}>
                            {src.status === 'active' ? <><Zap className="w-2.5 h-2.5" />Live</> : <><WifiOff className="w-2.5 h-2.5" />Inactive</>}
                          </span>
                          {src.count > 0 && (
                            <span className="text-[10px] text-slate-400 ml-auto">{src.count} event{src.count !== 1 ? 's' : ''}</span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5 leading-tight">{src.description}</p>
                        {src.lastSync && (
                          <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" />
                            Last: {new Date(src.lastSync).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-[11px] text-slate-400 text-center">
                Events are auto-logged from these sources in real time. Use "Sync now" to pull any missed historical records.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Journey overview ─────────────────────────────────────────────────── */}
      {!loading && entries.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-2xl bg-white dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 p-5 space-y-4 shadow-sm"
        >
          {/* Stats row */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-teal-600" />
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Your Health Journey</span>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
              <span><span className="font-bold text-slate-800 dark:text-white text-sm">{entries.length}</span> total events</span>
              {streak > 0 && (
                <span className="flex items-center gap-1 bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 px-2 py-0.5 rounded-full font-medium">
                  🔥 {streak}-day streak
                </span>
              )}
            </div>
          </div>

          {/* 14-day sparkline */}
          <div>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">14-Day Activity</p>
            <div className="flex items-end gap-1 h-10">
              {sparkline.map((day, i) => {
                const h = day.count === 0 ? 0 : Math.max(4, Math.round((day.count / sparkMax) * 40));
                const isToday = i === 13;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center justify-end gap-0.5 group relative">
                    <div
                      className={cn(
                        'w-full rounded-t transition-all duration-300',
                        day.count > 0 ? (isToday ? 'bg-teal-500' : 'bg-teal-300 dark:bg-teal-700 group-hover:bg-teal-400') : 'bg-slate-100 dark:bg-slate-700 rounded',
                      )}
                      style={{ height: day.count === 0 ? '3px' : `${h}px` }}
                    />
                    {/* Tooltip */}
                    {day.count > 0 && (
                      <div className="absolute -top-7 left-1/2 -translate-x-1/2 hidden group-hover:flex bg-slate-800 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap shadow-lg z-10">
                        {day.count} event{day.count > 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between mt-1 text-[9px] text-slate-400">
              <span>{sparkline[0].date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}</span>
              <span className="text-teal-600 font-semibold">Today</span>
            </div>
          </div>

          {/* Type distribution */}
          {typeDist.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {typeDist.map(([type, count]) => {
                const cfg = getCfg(type);
                return (
                  <span key={type} className={cn('flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium border', cfg.bg, cfg.text, cfg.border)}>
                    <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dot)} />
                    {cfg.label} <span className="opacity-70">· {count}</span>
                  </span>
                );
              })}
            </div>
          )}
        </motion.div>
      )}

      {/* ── Search + filter toggle ────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input placeholder="Search your diary…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9 rounded-xl border-slate-200 dark:border-slate-700" />
          </div>
          <Button variant="outline" size="icon" aria-label="Toggle filters" onClick={() => setShowFilters(p => !p)}
            className={cn('rounded-xl shrink-0', showFilters && 'bg-teal-50 border-teal-300 text-teal-700 dark:bg-teal-900/20 dark:border-teal-700 dark:text-teal-300')}>
            <Filter className="w-4 h-4" />
          </Button>
        </div>
        <AnimatePresence>
          {showFilters && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-xl bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">Entry type</Label>
                  <Select value={selectedType} onValueChange={setSelectedType}>
                    <SelectTrigger className="rounded-lg h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>{ALL_FILTER_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">From</Label>
                  <Input type="date" value={dateRange.start} onChange={e => setDateRange(p => ({ ...p, start: e.target.value }))} className="rounded-lg h-9 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">To</Label>
                  <Input type="date" value={dateRange.end} onChange={e => setDateRange(p => ({ ...p, end: e.target.value }))} className="rounded-lg h-9 text-sm" />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Timeline ─────────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-10 h-10 rounded-full border-2 border-teal-500 border-t-transparent animate-spin" />
        </div>
      ) : filteredEntries.length === 0 ? (
        <Card className="border-dashed border-2 border-slate-200 dark:border-slate-700 bg-transparent shadow-none">
          <CardContent className="py-16 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-slate-100 dark:bg-slate-700/50 flex items-center justify-center">
              <BookHeart className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-1">No events yet</h3>
            <p className="text-slate-400 text-sm mb-4">{searchQuery ? 'No entries match your search.' : 'Start by logging a health event.'}</p>
            {!searchQuery && (
              <Button onClick={openLogModal} className="bg-teal-500 hover:bg-teal-600 text-white rounded-xl">
                <Plus className="w-4 h-4 mr-1.5" />Log your first event
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div>
          {groupedEntries.map(group => (
            <div key={group.key} className="mb-8">

              {/* Date separator */}
              <div className="flex items-center gap-3 mb-5 sticky top-0 z-10 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-sm py-1.5 -mx-1 px-1 rounded-lg">
                <Calendar className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                <span className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 shrink-0">{group.label}</span>
                <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                <span className="text-[11px] text-slate-400 shrink-0">{group.items.length} event{group.items.length !== 1 ? 's' : ''}</span>
              </div>

              {/* Entries */}
              <div className="pl-3">
                {group.items.map((entry, idx) => {
                  const cfg      = getCfg(entry.entryType);
                  const { Icon } = cfg;
                  const isMajor  = MAJOR_TYPES.has(entry.entryType);
                  const isMinor  = MINOR_TYPES.has(entry.entryType);
                  const expanded = expandedIds.has(entry.id);
                  const details  = renderDetails(entry);
                  const summary  = eventSummary(entry);
                  const hasMore  = !!details || (entry.description && entry.description.length > 0);
                  const isLast   = idx === group.items.length - 1;

                  return (
                    <motion.div
                      key={entry.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.04 }}
                      className="flex gap-4"
                    >
                      {/* Timeline dot + connector line */}
                      <div className="flex flex-col items-center">
                        <div className={cn(
                          'rounded-full shrink-0 ring-2 ring-white dark:ring-slate-950 z-10 shadow-sm mt-4',
                          cfg.dot,
                          isMajor ? 'w-4 h-4' : isMinor ? 'w-2.5 h-2.5 mt-[18px]' : 'w-3 h-3 mt-[17px]',
                        )} />
                        {!isLast && <div className="w-px flex-1 bg-slate-200 dark:bg-slate-700/70 mt-1" />}
                      </div>

                      {/* ── Entry card ── */}
                      <div className={cn('flex-1', isLast ? 'mb-2' : 'mb-4')}>
                        <div
                          className={cn(
                            'rounded-xl border overflow-hidden bg-white dark:bg-slate-800/80 transition-all duration-200',
                            isMajor ? `${cfg.border} shadow-sm hover:shadow-md` : 'border-slate-200 dark:border-slate-700/80',
                            hasMore && 'cursor-pointer',
                          )}
                          onClick={() => hasMore && toggleExpanded(entry.id)}
                        >
                          {/* Section 1 — Event Type header strip */}
                          {(() => {
                            const src = entrySource(entry);
                            const SrcIcon = SOURCE_ICON_MAP[src.label] ?? Zap;
                            return (
                              <div className={cn('flex items-center justify-between px-3 py-2', cfg.bg)}>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Icon className={cn('w-3.5 h-3.5', cfg.text)} />
                                  <span className={cn('text-[11px] font-bold uppercase tracking-wider', cfg.text)}>{cfg.label}</span>
                                  {isMajor && <span className={cn('text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-white/60 dark:bg-black/20', cfg.text)}>Milestone</span>}
                                  {/* Source attribution badge */}
                                  <span className={cn(
                                    'flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                                    src.auto
                                      ? 'bg-white/60 dark:bg-black/20 text-current opacity-80'
                                      : 'bg-white/40 dark:bg-black/10 text-current opacity-60'
                                  )}>
                                    <SrcIcon className="w-2.5 h-2.5" />
                                    {src.label}
                                  </span>
                                </div>
                                <span className={cn('flex items-center gap-1 text-[11px] font-medium shrink-0', cfg.text)}>
                                  <Clock className="w-3 h-3" />{formatTime(entry)}
                                </span>
                              </div>
                            );
                          })()}

                          <div className="px-4 py-3 space-y-2">
                            {/* Section 2 — Event Summary */}
                            <div>
                              <h3 className="text-sm font-bold text-slate-800 dark:text-white leading-snug">{entry.title}</h3>
                              {summary && (
                                <p className={cn('text-sm font-semibold mt-1', cfg.text)}>
                                  {summary}
                                </p>
                              )}
                              {entry.description && !['ai_consultation'].includes(entry.entryType) && (
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                                  {expanded || entry.description.length <= 100
                                    ? entry.description
                                    : entry.description.slice(0, 100) + '…'}
                                </p>
                              )}
                            </div>

                            {/* Section 3 — Event Details (expandable) */}
                            <AnimatePresence>
                              {expanded && details && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.18 }}
                                  className="overflow-hidden"
                                >
                                  <div className="pt-2 border-t border-slate-100 dark:border-slate-700/50">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Event Details</p>
                                    {details}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>

                            {/* Expand hint */}
                            {hasMore && (
                              <div className={cn('flex justify-end -mb-1', cfg.text)}>
                                <span className="flex items-center gap-0.5 text-[11px] select-none font-medium">
                                  {expanded ? <><ChevronUp className="w-3 h-3" />Hide details</> : <><ChevronDown className="w-3 h-3" />View details</>}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Log Event Modal ───────────────────────────────────────────────────── */}
      <Dialog open={showLogModal} onOpenChange={setShowLogModal}>
        <DialogContent className="sm:max-w-lg max-h-[92vh] overflow-y-auto bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-800 dark:text-white">
              <div className="p-1.5 rounded-lg bg-teal-50 dark:bg-teal-900/30"><Plus className="w-4 h-4 text-teal-600" /></div>
              Log a Health Event
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label>Event type <span className="text-red-500">*</span></Label>
              <Select value={form.entryType} onValueChange={v => setF('entryType', v)}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>{MANUAL_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Title <span className="text-red-500">*</span></Label>
              <Input
                placeholder={form.entryType === 'symptom' ? 'e.g. Headache, back pain…' : form.entryType === 'vital' ? 'e.g. Morning blood pressure' : form.entryType === 'medication' ? 'e.g. Took Metformin 500mg' : form.entryType === 'mood' ? 'e.g. Feeling anxious today' : form.entryType === 'sleep' ? 'e.g. Restless night' : form.entryType === 'diet' ? 'e.g. Healthy breakfast' : 'What happened?'}
                value={form.title} onChange={e => setF('title', e.target.value)} className="rounded-xl" />
            </div>

            <div className="space-y-1.5">
              <Label>Date &amp; time</Label>
              <Input type="datetime-local" value={form.entryDate} onChange={e => setF('entryDate', e.target.value)} className="rounded-xl" />
            </div>

            {form.entryType === 'vital' && (
              <div className="rounded-xl bg-pink-50 dark:bg-pink-900/10 border border-pink-200 dark:border-pink-800 p-4 space-y-3">
                <p className="text-xs font-bold text-pink-700 dark:text-pink-300 uppercase tracking-wide">Vital Details</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Type</Label>
                    <Select value={form.vitalType} onValueChange={v => setForm(p => ({ ...p, vitalType: v, vitalUnit: VITAL_UNITS[v] ?? '' }))}>
                      <SelectTrigger className="rounded-lg h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>{Object.keys(VITAL_UNITS).map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Value</Label>
                    <div className="flex items-center gap-2">
                      <Input placeholder="e.g. 72" value={form.vitalValue} onChange={e => setF('vitalValue', e.target.value)} className="rounded-lg h-9 text-sm" />
                      <span className="text-xs text-slate-500 shrink-0 w-10">{form.vitalUnit}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {form.entryType === 'symptom' && (
              <div className="rounded-xl bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 p-4 space-y-3">
                <p className="text-xs font-bold text-red-700 dark:text-red-300 uppercase tracking-wide">Symptom Details</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Severity</Label>
                    <Select value={form.severity} onValueChange={v => setF('severity', v)}>
                      <SelectTrigger className="rounded-lg h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mild">😐 Mild</SelectItem>
                        <SelectItem value="moderate">😟 Moderate</SelectItem>
                        <SelectItem value="severe">😰 Severe</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Duration</Label>
                    <Input placeholder="e.g. 2 hours" value={form.duration} onChange={e => setF('duration', e.target.value)} className="rounded-lg h-9 text-sm" />
                  </div>
                </div>
              </div>
            )}

            {form.entryType === 'medication' && (
              <div className="rounded-xl bg-lime-50 dark:bg-lime-900/10 border border-lime-200 dark:border-lime-800 p-4 space-y-3">
                <p className="text-xs font-bold text-lime-700 dark:text-lime-300 uppercase tracking-wide">Medication Details</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label className="text-xs">Name</Label><Input placeholder="e.g. Metformin" value={form.medicationName} onChange={e => setF('medicationName', e.target.value)} className="rounded-lg h-9 text-sm" /></div>
                  <div className="space-y-1.5"><Label className="text-xs">Dosage</Label><Input placeholder="e.g. 500mg" value={form.dosage} onChange={e => setF('dosage', e.target.value)} className="rounded-lg h-9 text-sm" /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label className="text-xs">Frequency</Label><Input placeholder="e.g. Twice daily" value={form.frequency} onChange={e => setF('frequency', e.target.value)} className="rounded-lg h-9 text-sm" /></div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Action</Label>
                    <Select value={form.medAction} onValueChange={v => setF('medAction', v)}>
                      <SelectTrigger className="rounded-lg h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="taken">✅ Taken</SelectItem>
                        <SelectItem value="missed">❌ Missed</SelectItem>
                        <SelectItem value="started">🆕 Started</SelectItem>
                        <SelectItem value="stopped">🛑 Stopped</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}

            {form.entryType === 'mood' && (
              <div className="rounded-xl bg-fuchsia-50 dark:bg-fuchsia-900/10 border border-fuchsia-200 dark:border-fuchsia-800 p-4 space-y-3">
                <p className="text-xs font-bold text-fuchsia-700 dark:text-fuchsia-300 uppercase tracking-wide">How are you feeling?</p>
                <div className="flex justify-between px-2">
                  {MOOD_EMOJIS.map((emoji, i) => (
                    <button key={i} type="button" onClick={() => setF('moodScore', i + 1)}
                      className={cn('flex flex-col items-center gap-1 p-2 rounded-xl transition-all', form.moodScore === i + 1 ? 'bg-fuchsia-200 dark:bg-fuchsia-700/40 scale-110 shadow' : 'opacity-50 hover:opacity-80 hover:scale-105')}>
                      <span className="text-2xl">{emoji}</span>
                      <span className="text-[9px] text-fuchsia-600 dark:text-fuchsia-300 font-medium">{MOOD_LABELS[i]}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {form.entryType === 'sleep' && (
              <div className="rounded-xl bg-violet-50 dark:bg-violet-900/10 border border-violet-200 dark:border-violet-800 p-4 space-y-3">
                <p className="text-xs font-bold text-violet-700 dark:text-violet-300 uppercase tracking-wide">Sleep Details</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label className="text-xs">Hours slept</Label><Input type="number" min="0" max="24" step="0.5" placeholder="e.g. 7.5" value={form.sleepHours} onChange={e => setF('sleepHours', e.target.value)} className="rounded-lg h-9 text-sm" /></div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Quality</Label>
                    <Select value={form.sleepQuality} onValueChange={v => setF('sleepQuality', v)}>
                      <SelectTrigger className="rounded-lg h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="poor">😴 Poor</SelectItem>
                        <SelectItem value="fair">😑 Fair</SelectItem>
                        <SelectItem value="good">🙂 Good</SelectItem>
                        <SelectItem value="excellent">😊 Excellent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}

            {form.entryType === 'diet' && (
              <div className="rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 p-4 space-y-3">
                <p className="text-xs font-bold text-amber-700 dark:text-amber-300 uppercase tracking-wide">Meal Details</p>
                <Select value={form.mealType} onValueChange={v => setF('mealType', v)}>
                  <SelectTrigger className="rounded-lg h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="breakfast">🌅 Breakfast</SelectItem>
                    <SelectItem value="lunch">☀️ Lunch</SelectItem>
                    <SelectItem value="dinner">🌙 Dinner</SelectItem>
                    <SelectItem value="snack">🍎 Snack</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>{form.entryType === 'note' ? 'Note' : 'Additional notes'}{form.entryType !== 'note' && <span className="text-slate-400 font-normal ml-1">(optional)</span>}</Label>
              <Textarea placeholder="Any additional details…" value={form.description} onChange={e => setF('description', e.target.value)} rows={3} className="rounded-xl resize-none" />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowLogModal(false)} disabled={saving} className="rounded-xl">Cancel</Button>
            <Button onClick={handleLogEvent} disabled={saving || !form.title.trim()} className="bg-teal-600 hover:bg-teal-700 text-white rounded-xl min-w-[100px]">
              {saving ? 'Saving…' : 'Log Event'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default HealthDiary;
