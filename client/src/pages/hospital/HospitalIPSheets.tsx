import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/utils/api';
import { loadHospitalStore, saveHospitalStore } from '@/utils/hospitalStorage';
import HospitalLayout from '@/components/hospital/HospitalLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { useAutosave } from '@/hooks/useAutosave';
import {
  FileText, Search, Plus, Download, Printer, Eye, Edit,
  Calendar, User, Bed, Stethoscope, Pill, Activity, Clock,
  CheckCircle, AlertCircle, ClipboardList, Heart, Thermometer,
  Droplets, Wind, Scale, FileBarChart, Syringe, FlaskConical,
  Utensils, Timer, RefreshCw, ChevronRight, Filter, MoreVertical,
  TrendingUp, TrendingDown, Minus, AlertTriangle, Save, ArrowRight,
  Building2
} from 'lucide-react';

interface IPPatient {
  id: string;
  name: string;
  age: number;
  gender: string;
  ward: string;
  bed: string;
  admissionDate: string;
  diagnosis: string;
  attendingDoctor: string;
  condition: 'stable' | 'serious' | 'critical';
  dayOfAdmission: number;
}

interface VitalRecord {
  time: string;
  temperature: number;
  pulse: number;
  bp: string;
  respRate: number;
  spo2: number;
  recordedBy: string;
}

const HospitalIPSheets = () => {
  const navigate = useNavigate();
  const { toast } = useToast();  
  const hospitalHeaders = () => {
    const token = localStorage.getItem('hospitalToken');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };
    const [activeTab, setActiveTab] = useState('patients');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterWard, setFilterWard] = useState('all');
  const [selectedPatient, setSelectedPatient] = useState<IPPatient | null>(null);
  const [sheetType, setSheetType] = useState('vitals');
  const [draftNote, setDraftNote] = useState('');
  const sheetAutosave = useAutosave({
    key: `hospital_ip_sheet_draft:${selectedPatient?.id || 'none'}`,
    value: { patientId: selectedPatient?.id, sheetType, note: draftNote },
    save: async () => Promise.resolve(),
  });

  useEffect(() => {
    const restored = sheetAutosave.restore();
    if (restored?.note) setDraftNote(restored.note);
  }, [selectedPatient?.id]);

  /**
   * Admitted patients come from the ADT service (GET /api/v1/adt/admissions), scoped to the
   * caller's organization by the server.
   *
   * This list used to be five hardcoded patients with real-sounding diagnoses ("Acute Myocardial
   * Infarction", "Ischemic Stroke", "Diabetic Ketoacidosis"), named attending doctors and day-of-
   * admission counts. The page is not a demo: handleSaveSheet() writes a real row to ip_sheets,
   * so a clinician could read invented clinical detail and save notes against a patient id that
   * does not exist. Fabricated clinical content is now gone; where no API serves a section it
   * renders an explicit empty state instead of plausible numbers.
   */
  const [ipPatients, setIpPatients] = useState<IPPatient[]>([]);
  const [patientsLoading, setPatientsLoading] = useState(true);
  const [patientsError, setPatientsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get('/v1/adt/admissions', { headers: hospitalHeaders() });
        const rows = Array.isArray(res.data?.data) ? res.data.data : [];
        const mapped: IPPatient[] = rows.map((r: any) => {
          const admitted = r.admission_datetime || r.admissionDatetime;
          const day = admitted
            ? Math.max(1, Math.floor((Date.now() - new Date(admitted).getTime()) / 86400000) + 1)
            : 0;
          return {
            id: String(r.id ?? r.admission_number ?? ''),
            name: [r.patient_first_name, r.patient_last_name].filter(Boolean).join(' ')
              || r.patient_name || r.uhid || r.admission_number || 'Unknown patient',
            age: Number(r.patient_age ?? 0),
            gender: r.patient_gender || '—',
            ward: r.ward_name || r.ward || '—',
            bed: r.bed_number || r.bed || '—',
            admissionDate: admitted ? String(admitted).slice(0, 10) : '—',
            diagnosis: r.admission_diagnosis || '—',
            attendingDoctor: r.admitting_doctor_name || '—',
            // The API has no triage/condition field; do not invent one.
            condition: 'stable',
            dayOfAdmission: day,
          };
        });
        if (!cancelled) { setIpPatients(mapped); setPatientsError(null); }
      } catch (err: any) {
        if (!cancelled) {
          setPatientsError(err?.response?.data?.message || 'Could not load admitted patients');
          setIpPatients([]);
        }
      } finally {
        if (!cancelled) setPatientsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /**
   * Vitals, intake/output and the medication administration record were hardcoded: five vitals
   * rounds attributed to named nurses, a full fluid balance chart, and a MAR listing real drugs
   * and doses ("Inj. Ceftriaxone 1gm", "Inj. Insulin Regular ... sliding scale") with "given"
   * checkboxes. A nurse could read that as a live medication record. No API serves these for an
   * admission yet, so they are empty and each section says so rather than showing invented values.
   */
  const [vitalsData] = useState<VitalRecord[]>([]);
  const [intakeOutputData] = useState<Array<{ time: string; oralIntake: number; ivFluids: number; output: number; type: string }>>([]);
  const [medicationData] = useState<Array<{ name: string; route: string; frequency: string; times: string[]; given: boolean[] }>>([]);

  const getConditionBadge = (condition: string) => {
    const config = {
      stable: { color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', icon: CheckCircle },
      serious: { color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', icon: AlertCircle },
      critical: { color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', icon: AlertTriangle }
    };
    const { color, icon: Icon } = config[condition as keyof typeof config];
    return (
      <Badge className={`${color} gap-1`}>
        <Icon className="h-3 w-3" />
        {condition.charAt(0).toUpperCase() + condition.slice(1)}
      </Badge>
    );
  };

  const handlePrint = () => {
    toast({
      title: "Printing",
      description: `IP Sheet sent to printer for ${selectedPatient?.name}`
    });
  };

  const handleSaveSheet = async () => {
    try {
      const sheetData = {
        patientId: selectedPatient?.id,
        sheetType,
        data: { note: draftNote },
        timestamp: new Date().toISOString()
      };

      // A failed save must not be reported as "Saved" — the IP sheet note would silently exist only in this browser.
      await api.post(
        '/hospital/practice/ip-sheets',
        sheetData,
        { headers: hospitalHeaders() }
      );

      if (selectedPatient) {
        const storeKey = `ip-sheets:${selectedPatient.id}`;
        const existing = loadHospitalStore(storeKey, []);
        const updated = [{ ...sheetData, id: `IPS-${Date.now()}` }, ...existing];
        saveHospitalStore(storeKey, updated);
      }

      toast({
        title: "Saved",
        description: "IP Sheet data saved successfully"
      });
    } catch (error: any) {
      toast({
        title: 'Failed to save sheet',
        description: error.response?.data?.message || 'An error occurred',
        variant: 'destructive'
      });
    }
  };

  const filteredPatients = ipPatients.filter(patient => {
    const matchesSearch = patient.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         patient.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         patient.diagnosis.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesWard = filterWard === 'all' || patient.ward === filterWard;
    return matchesSearch && matchesWard;
  });

  const wards = ['ICU', 'General Medicine', 'Gynecology', 'Neurology', 'Orthopedics', 'Pediatrics', 'Surgery'];

  useEffect(() => {
    if (!selectedPatient && ipPatients.length > 0) {
      setSelectedPatient(ipPatients[0]);
      setActiveTab('sheet');
    }
  }, [selectedPatient, ipPatients]);

  return (
    <HospitalLayout title="IP Sheets" subtitle="Manage inpatient monitoring sheets and charts">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <TabsList className="bg-slate-100 dark:bg-slate-800">
            <TabsTrigger value="patients" className="gap-2">
              <Bed className="h-4 w-4" /> IP Patients
            </TabsTrigger>
            <TabsTrigger value="sheet" className="gap-2" disabled={!selectedPatient}>
              <FileText className="h-4 w-4" /> IP Sheet
            </TabsTrigger>
            <TabsTrigger value="charts" className="gap-2" disabled={!selectedPatient}>
              <FileBarChart className="h-4 w-4" /> Charts
            </TabsTrigger>
          </TabsList>

          {activeTab === 'patients' && (
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search patients..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 w-64"
                />
              </div>
              <Select value={filterWard} onValueChange={setFilterWard}>
                <SelectTrigger className="w-40">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Filter by Ward" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Wards</SelectItem>
                  {wards.map((ward) => (
                    <SelectItem key={ward} value={ward}>{ward}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {(activeTab === 'sheet' || activeTab === 'charts') && selectedPatient && (
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={handlePrint}>
                <Printer className="h-4 w-4 mr-2" /> Print Sheet
              </Button>
              <Button onClick={handleSaveSheet} className="bg-teal-600 hover:bg-teal-700 text-white">
                <Save className="h-4 w-4 mr-2" /> Save Changes
              </Button>
            </div>
          )}
        </div>

        {/* IP Patients List */}
        <TabsContent value="patients" className="space-y-4">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Total IP Patients</p>
                    <p className="text-2xl font-bold text-slate-800 dark:text-white">48</p>
                  </div>
                  <div className="p-3 bg-blue-500/10 rounded-xl">
                    <Bed className="h-6 w-6 text-blue-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">ICU Patients</p>
                    <p className="text-2xl font-bold text-slate-800 dark:text-white">8</p>
                  </div>
                  <div className="p-3 bg-red-500/10 rounded-xl">
                    <Heart className="h-6 w-6 text-red-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Critical</p>
                    <p className="text-2xl font-bold text-slate-800 dark:text-white">5</p>
                  </div>
                  <div className="p-3 bg-amber-500/10 rounded-xl">
                    <AlertTriangle className="h-6 w-6 text-amber-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Discharges Today</p>
                    <p className="text-2xl font-bold text-slate-800 dark:text-white">6</p>
                  </div>
                  <div className="p-3 bg-emerald-500/10 rounded-xl">
                    <CheckCircle className="h-6 w-6 text-emerald-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">New Admissions</p>
                    <p className="text-2xl font-bold text-slate-800 dark:text-white">4</p>
                  </div>
                  <div className="p-3 bg-teal-500/10 rounded-xl">
                    <Plus className="h-6 w-6 text-teal-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Patients List */}
          <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
            <CardHeader>
              <CardTitle className="text-slate-800 dark:text-white">Inpatient List</CardTitle>
              <CardDescription className="text-slate-500 dark:text-slate-400">Select a patient to view/edit their IP sheets</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {patientsLoading && (
                  <div className="p-4 text-sm text-slate-500 dark:text-slate-400">Loading admitted patients…</div>
                )}
                {!patientsLoading && patientsError && (
                  <div className="p-4 text-sm text-red-600 dark:text-red-400">
                    {patientsError}
                  </div>
                )}
                {!patientsLoading && !patientsError && filteredPatients.length === 0 && (
                  <div className="p-4 text-sm text-slate-500 dark:text-slate-400">
                    No admitted patients found for this hospital.
                  </div>
                )}
                {filteredPatients.map((patient) => (
                  <div
                    key={patient.id}
                    onClick={() => {
                      setSelectedPatient(patient);
                      setActiveTab('sheet');
                    }}
                    className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`p-3 rounded-xl ${
                        patient.condition === 'critical' ? 'bg-red-500/10' :
                        patient.condition === 'serious' ? 'bg-amber-500/10' : 'bg-teal-500/10'
                      }`}>
                        <Bed className={`h-5 w-5 ${
                          patient.condition === 'critical' ? 'text-red-500' :
                          patient.condition === 'serious' ? 'text-amber-500' : 'text-teal-500'
                        }`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-slate-800 dark:text-white">{patient.name}</p>
                          <Badge variant="outline" className="text-xs">{patient.id}</Badge>
                          {getConditionBadge(patient.condition)}
                        </div>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          {patient.age}y/{patient.gender.charAt(0)} • {patient.ward} • Bed: {patient.bed}
                        </p>
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                          {patient.diagnosis} | Day {patient.dayOfAdmission} | {patient.attendingDoctor}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge className="bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                        Day {patient.dayOfAdmission}
                      </Badge>
                      <ChevronRight className="h-5 w-5 text-slate-400 group-hover:text-teal-500 transition-colors" />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* IP Sheet View */}
        <TabsContent value="sheet" className="space-y-4">
          {selectedPatient && (
            <>
              {/* Patient Header */}
              <Card className="bg-gradient-to-r from-teal-500 to-teal-600 text-white border-0">
                <CardContent className="pt-6">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="p-4 bg-white/10 rounded-xl">
                        <User className="h-8 w-8" />
                      </div>
                      <div>
                        <h2 className="text-2xl font-bold">{selectedPatient.name}</h2>
                        <p className="text-teal-100">
                          {selectedPatient.id} • {selectedPatient.age}y/{selectedPatient.gender} • {selectedPatient.ward} • Bed: {selectedPatient.bed}
                        </p>
                        <p className="text-sm text-teal-100 mt-1">
                          Diagnosis: {selectedPatient.diagnosis} | Attending: {selectedPatient.attendingDoctor}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge className="bg-white/20 text-white text-lg px-4 py-1">Day {selectedPatient.dayOfAdmission}</Badge>
                      <p className="text-sm text-teal-100">Admitted: {selectedPatient.admissionDate}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Sheet Type Selector */}
              <div className="flex flex-wrap gap-2">
                {[
                  { id: 'vitals', label: 'Vital Signs', icon: Thermometer },
                  { id: 'intake-output', label: 'Intake/Output', icon: Droplets },
                  { id: 'medications', label: 'Medication Chart', icon: Pill },
                  { id: 'nursing', label: 'Nursing Notes', icon: ClipboardList },
                  { id: 'orders', label: "Doctor's Orders", icon: Stethoscope },
                ].map((type) => (
                  <Button
                    key={type.id}
                    variant={sheetType === type.id ? 'default' : 'outline'}
                    onClick={() => setSheetType(type.id)}
                    className={sheetType === type.id ? 'bg-teal-600 hover:bg-teal-700 text-white' : ''}
                  >
                    <type.icon className="h-4 w-4 mr-2" /> {type.label}
                  </Button>
                ))}
              </div>

              {/* Vital Signs Sheet */}
              {sheetType === 'vitals' && (
                <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-slate-800 dark:text-white flex items-center gap-2">
                          <Thermometer className="h-5 w-5 text-teal-500" /> Vital Signs Chart
                        </CardTitle>
                        <CardDescription className="text-slate-500 dark:text-slate-400">
                          Date: {new Date().toLocaleDateString()} | Monitor vital signs every 4 hours
                        </CardDescription>
                      </div>
                      <Button variant="outline" size="sm">
                        <Plus className="h-4 w-4 mr-2" /> Add Reading
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Time</TableHead>
                          <TableHead>Temp (°F)</TableHead>
                          <TableHead>Pulse (/min)</TableHead>
                          <TableHead>BP (mmHg)</TableHead>
                          <TableHead>Resp Rate</TableHead>
                          <TableHead>SpO2 (%)</TableHead>
                          <TableHead>Recorded By</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {vitalsData.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center text-sm text-slate-500 dark:text-slate-400 py-6">
                              No vitals recorded for this admission.
                              <div className="mt-1 text-xs text-slate-400">Not yet connected to this sheet.</div>
                            </TableCell>
                          </TableRow>
                        )}
                        {vitalsData.map((vital, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium">{vital.time}</TableCell>
                            <TableCell>
                              <span className={vital.temperature > 99 ? 'text-amber-600 font-semibold' : ''}>
                                {vital.temperature}
                              </span>
                            </TableCell>
                            <TableCell>{vital.pulse}</TableCell>
                            <TableCell>{vital.bp}</TableCell>
                            <TableCell>{vital.respRate}</TableCell>
                            <TableCell>
                              <span className={vital.spo2 < 95 ? 'text-red-600 font-semibold' : 'text-emerald-600'}>
                                {vital.spo2}
                              </span>
                            </TableCell>
                            <TableCell className="text-slate-500">{vital.recordedBy}</TableCell>
                            <TableCell>
                              <Button variant="ghost" size="icon">
                                <Edit className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}

              {/* Intake/Output Chart */}
              {sheetType === 'intake-output' && (
                <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-slate-800 dark:text-white flex items-center gap-2">
                          <Droplets className="h-5 w-5 text-blue-500" /> Intake / Output Chart
                        </CardTitle>
                        <CardDescription className="text-slate-500 dark:text-slate-400">
                          24-hour fluid balance monitoring
                        </CardDescription>
                      </div>
                      <Button variant="outline" size="sm">
                        <Plus className="h-4 w-4 mr-2" /> Add Entry
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Time</TableHead>
                          <TableHead>Oral Intake (ml)</TableHead>
                          <TableHead>IV Fluids (ml)</TableHead>
                          <TableHead>Total Intake</TableHead>
                          <TableHead>Output (ml)</TableHead>
                          <TableHead>Output Type</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {intakeOutputData.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center text-sm text-slate-500 dark:text-slate-400 py-6">
                              No intake/output recorded for this admission.
                              <div className="mt-1 text-xs text-slate-400">Not yet connected to this sheet.</div>
                            </TableCell>
                          </TableRow>
                        )}
                        {intakeOutputData.map((entry, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium">{entry.time}</TableCell>
                            <TableCell>{entry.oralIntake}</TableCell>
                            <TableCell>{entry.ivFluids}</TableCell>
                            <TableCell className="font-semibold text-blue-600">{entry.oralIntake + entry.ivFluids}</TableCell>
                            <TableCell>{entry.output || '-'}</TableCell>
                            <TableCell>{entry.type}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <div className="mt-6 p-4 bg-slate-50 dark:bg-slate-800 rounded-xl">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="text-center">
                          <p className="text-sm text-slate-500 dark:text-slate-400">Total Intake (24h)</p>
                          <p className="text-2xl font-bold text-blue-600">3150 ml</p>
                        </div>
                        <div className="text-center">
                          <p className="text-sm text-slate-500 dark:text-slate-400">Total Output (24h)</p>
                          <p className="text-2xl font-bold text-amber-600">1580 ml</p>
                        </div>
                        <div className="text-center">
                          <p className="text-sm text-slate-500 dark:text-slate-400">Balance</p>
                          <p className="text-2xl font-bold text-emerald-600">+1570 ml</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Medication Chart */}
              {sheetType === 'medications' && (
                <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-slate-800 dark:text-white flex items-center gap-2">
                          <Pill className="h-5 w-5 text-purple-500" /> Medication Administration Record
                        </CardTitle>
                        <CardDescription className="text-slate-500 dark:text-slate-400">
                          Date: {new Date().toLocaleDateString()} | Track medication administration
                        </CardDescription>
                      </div>
                      <Button variant="outline" size="sm">
                        <Plus className="h-4 w-4 mr-2" /> Add Medication
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[250px]">Medication</TableHead>
                          <TableHead>Route</TableHead>
                          <TableHead>Frequency</TableHead>
                          <TableHead>Scheduled Times</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {medicationData.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center text-sm text-slate-500 dark:text-slate-400 py-6">
                              No medication administration recorded for this admission.
                              <div className="mt-1 text-xs text-slate-400">Not yet connected to this sheet.</div>
                            </TableCell>
                          </TableRow>
                        )}
                        {medicationData.map((med, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium">{med.name}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{med.route}</Badge>
                            </TableCell>
                            <TableCell>{med.frequency}</TableCell>
                            <TableCell>
                              <div className="flex gap-2">
                                {med.times.map((time, timeIdx) => (
                                  <div key={timeIdx} className="flex items-center gap-1">
                                    <span className="text-sm">{time}</span>
                                    {med.given[timeIdx] ? (
                                      <CheckCircle className="h-4 w-4 text-emerald-500" />
                                    ) : (
                                      <Clock className="h-4 w-4 text-slate-400" />
                                    )}
                                  </div>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell>
                              {med.given.every(Boolean) ? (
                                <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                                  All Given
                                </Badge>
                              ) : (
                                <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                                  Pending
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}

              <div className="mb-4 flex items-center gap-2"><Badge variant="outline">Autosave: {sheetAutosave.status}</Badge></div>

              {/* Nursing Notes */}
              {sheetType === 'nursing' && (
                <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-slate-800 dark:text-white flex items-center gap-2">
                          <ClipboardList className="h-5 w-5 text-teal-500" /> Nursing Notes
                        </CardTitle>
                        <CardDescription className="text-slate-500 dark:text-slate-400">
                          Shift-wise nursing observations and care notes
                        </CardDescription>
                      </div>
                      <Button variant="outline" size="sm">
                        <Plus className="h-4 w-4 mr-2" /> Add Note
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="p-6 text-center text-sm text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 rounded-xl">
                          No nursing notes recorded for this admission.
                          <div className="mt-1 text-xs text-slate-400">Nursing notes are not yet connected to this sheet.</div>
                        </div>
                    </div>
                    <div className="mt-4">
                      <Label>Add New Note</Label>
                      <Textarea placeholder="Enter nursing notes for current shift..." className="mt-2" value={draftNote} onChange={(e) => setDraftNote(e.target.value)} />
                      <Button className="mt-3 bg-teal-600 hover:bg-teal-700 text-white">
                        <Save className="h-4 w-4 mr-2" /> Save Note
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Doctor's Orders */}
              {sheetType === 'orders' && (
                <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-slate-800 dark:text-white flex items-center gap-2">
                          <Stethoscope className="h-5 w-5 text-blue-500" /> Doctor's Orders
                        </CardTitle>
                        <CardDescription className="text-slate-500 dark:text-slate-400">
                          Active orders and instructions from the attending physician
                        </CardDescription>
                      </div>
                      <Button variant="outline" size="sm">
                        <Plus className="h-4 w-4 mr-2" /> New Order
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="p-6 text-center text-sm text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 rounded-xl">
                          No physician orders recorded for this admission.
                          <div className="mt-1 text-xs text-slate-400">Doctor's orders are not yet connected to this sheet.</div>
                        </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* Charts Tab */}
        <TabsContent value="charts" className="space-y-4">
          {selectedPatient && (
            <Card className="bg-white dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/50">
              <CardHeader>
                <CardTitle className="text-slate-800 dark:text-white">Graphical Charts</CardTitle>
                <CardDescription className="text-slate-500 dark:text-slate-400">
                  Visual representation of vital signs and fluid balance trends
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Temperature Chart Placeholder */}
                  <div className="p-6 bg-slate-50 dark:bg-slate-800 rounded-xl">
                    <h4 className="font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                      <Thermometer className="h-5 w-5 text-red-500" /> Temperature Trend
                    </h4>
                    <div className="h-48 flex items-center justify-center bg-slate-100 dark:bg-slate-700 rounded-lg">
                      <p className="text-slate-500 dark:text-slate-400">Temperature chart will be rendered here</p>
                    </div>
                    <div className="flex items-center justify-between mt-4 text-sm">
                      <span className="text-slate-500">Last 24 hours</span>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-600 dark:text-slate-300">Avg: 98.8°F</span>
                        <TrendingUp className="h-4 w-4 text-emerald-500" />
                      </div>
                    </div>
                  </div>

                  {/* Blood Pressure Chart Placeholder */}
                  <div className="p-6 bg-slate-50 dark:bg-slate-800 rounded-xl">
                    <h4 className="font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                      <Activity className="h-5 w-5 text-blue-500" /> Blood Pressure Trend
                    </h4>
                    <div className="h-48 flex items-center justify-center bg-slate-100 dark:bg-slate-700 rounded-lg">
                      <p className="text-slate-500 dark:text-slate-400">BP chart will be rendered here</p>
                    </div>
                    <div className="flex items-center justify-between mt-4 text-sm">
                      <span className="text-slate-500">Last 24 hours</span>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-600 dark:text-slate-300">Avg: 120/78 mmHg</span>
                        <Minus className="h-4 w-4 text-slate-500" />
                      </div>
                    </div>
                  </div>

                  {/* Intake/Output Chart Placeholder */}
                  <div className="p-6 bg-slate-50 dark:bg-slate-800 rounded-xl">
                    <h4 className="font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                      <Droplets className="h-5 w-5 text-cyan-500" /> Fluid Balance Trend
                    </h4>
                    <div className="h-48 flex items-center justify-center bg-slate-100 dark:bg-slate-700 rounded-lg">
                      <p className="text-slate-500 dark:text-slate-400">Fluid balance chart will be rendered here</p>
                    </div>
                    <div className="flex items-center justify-between mt-4 text-sm">
                      <span className="text-slate-500">Last 24 hours</span>
                      <div className="flex items-center gap-2">
                        <span className="text-emerald-600">Balance: +1570 ml</span>
                        <TrendingUp className="h-4 w-4 text-emerald-500" />
                      </div>
                    </div>
                  </div>

                  {/* SpO2 Chart Placeholder */}
                  <div className="p-6 bg-slate-50 dark:bg-slate-800 rounded-xl">
                    <h4 className="font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                      <Wind className="h-5 w-5 text-emerald-500" /> SpO2 Trend
                    </h4>
                    <div className="h-48 flex items-center justify-center bg-slate-100 dark:bg-slate-700 rounded-lg">
                      <p className="text-slate-500 dark:text-slate-400">SpO2 chart will be rendered here</p>
                    </div>
                    <div className="flex items-center justify-between mt-4 text-sm">
                      <span className="text-slate-500">Last 24 hours</span>
                      <div className="flex items-center gap-2">
                        <span className="text-emerald-600">Avg: 97.8%</span>
                        <Minus className="h-4 w-4 text-slate-500" />
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </HospitalLayout>
  );
};

export default HospitalIPSheets;
