import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Activity, Heart, Thermometer, Droplets, Wind, Scale, Plus, Calendar, Clock } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.06 } } };
const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [.25,.46,.45,.94] } } };

interface VitalReading {
  id: string;
  type: 'blood_pressure' | 'heart_rate' | 'temperature' | 'blood_sugar' | 'oxygen_level' | 'weight';
  value: string;
  unit: string;
  status: 'normal' | 'low' | 'high' | 'critical';
  timestamp: Date;
  notes?: string;
  recordedBy: string;
}

const VitalReports: React.FC = () => {
  const [vitals, setVitals] = useState<VitalReading[]>([
    {
      id: '1',
      type: 'blood_pressure',
      value: '120/80',
      unit: 'mmHg',
      status: 'normal',
      timestamp: new Date('2025-01-15T08:30:00'),
      recordedBy: 'Self',
      notes: 'Morning reading'
    },
    {
      id: '2',
      type: 'heart_rate',
      value: '72',
      unit: 'bpm',
      status: 'normal',
      timestamp: new Date('2025-01-15T08:30:00'),
      recordedBy: 'Self'
    },
    {
      id: '3',
      type: 'blood_sugar',
      value: '110',
      unit: 'mg/dL',
      status: 'normal',
      timestamp: new Date('2025-01-15T07:00:00'),
      recordedBy: 'Self',
      notes: 'Fasting'
    },
    {
      id: '4',
      type: 'oxygen_level',
      value: '98',
      unit: '%',
      status: 'normal',
      timestamp: new Date('2025-01-15T08:30:00'),
      recordedBy: 'Self'
    },
    {
      id: '5',
      type: 'temperature',
      value: '98.6',
      unit: '°F',
      status: 'normal',
      timestamp: new Date('2025-01-14T20:00:00'),
      recordedBy: 'Self'
    },
    {
      id: '6',
      type: 'weight',
      value: '70.5',
      unit: 'kg',
      status: 'normal',
      timestamp: new Date('2025-01-14T06:00:00'),
      recordedBy: 'Self'
    }
  ]);

  const [selectedType, setSelectedType] = useState<string>('all');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newVital, setNewVital] = useState({
    type: 'blood_pressure',
    value: '',
    notes: ''
  });

  const vitalTypes = [
    { value: 'blood_pressure', label: 'Blood Pressure', icon: Activity, unit: 'mmHg', color: 'text-blue-600' },
    { value: 'heart_rate', label: 'Heart Rate', icon: Heart, unit: 'bpm', color: 'text-red-600' },
    { value: 'temperature', label: 'Temperature', icon: Thermometer, unit: '°F', color: 'text-orange-600' },
    { value: 'blood_sugar', label: 'Blood Sugar', icon: Droplets, unit: 'mg/dL', color: 'text-purple-600' },
    { value: 'oxygen_level', label: 'Oxygen Level', icon: Wind, unit: '%', color: 'text-cyan-600' },
    { value: 'weight', label: 'Weight', icon: Scale, unit: 'kg', color: 'text-green-600' }
  ];

  const formatDate = (date: Date) => new Date(date).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const formatTime = (date: Date) => new Date(date).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { label: string; color: string }> = {
      normal: { label: 'Normal', color: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/40 dark:text-emerald-300' },
      low: { label: 'Low', color: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-300' },
      high: { label: 'High', color: 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800/70 dark:bg-orange-950/40 dark:text-orange-300' },
      critical: { label: 'Critical', color: 'border-red-200 bg-red-50 text-red-700 dark:border-red-800/70 dark:bg-red-950/40 dark:text-red-300' }
    };
    const variant = variants[status] || variants.normal;
    return <Badge variant="outline" className={`${variant.color} rounded-full px-2.5 font-medium`}>{variant.label}</Badge>;
  };

  const getVitalType = (type: string) => vitalTypes.find(v => v.value === type);

  const getVitalIcon = (type: string) => {
    const vitalType = vitalTypes.find(v => v.value === type);
    if (!vitalType) return null;
    const Icon = vitalType.icon;
    return <Icon className={`h-5 w-5 ${vitalType.color}`} />;
  };

  const filteredVitals = selectedType === 'all' 
    ? vitals 
    : vitals.filter(vital => vital.type === selectedType);

  const handleAddVital = () => {
    if (!newVital.value) return;

    const vitalType = vitalTypes.find(v => v.value === newVital.type);
    if (!vitalType) return;

    const newReading: VitalReading = {
      id: Date.now().toString(),
      type: newVital.type as VitalReading['type'],
      value: newVital.value,
      unit: vitalType.unit,
      status: 'normal',
      timestamp: new Date(),
      recordedBy: 'Self',
      notes: newVital.notes
    };

    setVitals([newReading, ...vitals]);
    setIsAddDialogOpen(false);
    setNewVital({ type: 'blood_pressure', value: '', notes: '' });
  };

  const getLatestReading = (type: string) => {
    const readings = vitals.filter(v => v.type === type);
    return readings.length > 0 ? readings[0] : null;
  };

  return (
    <motion.div initial="hidden" animate="show" variants={container} className="mx-auto max-w-7xl space-y-5">
      <motion.div variants={item} className="rounded-xl border border-slate-200 bg-white px-5 py-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80 md:px-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
              <Heart className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <Badge variant="outline" className="mb-2 border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300">
                Health Vitals
              </Badge>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white md:text-3xl">Vital Reports</h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Track current readings and review your vital history.</p>
            </div>
          </div>

          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button className="w-full bg-rose-700 text-white hover:bg-rose-800 md:w-auto" aria-label="Record vital">
                <Plus className="mr-2 h-4 w-4" /> Record Vital
              </Button>
            </DialogTrigger>
            <DialogContent className="dark:bg-slate-900">
              <DialogHeader>
                <DialogTitle>Record New Vital</DialogTitle>
                <DialogDescription>Enter your vital reading details</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="vital-type">Vital Type</Label>
                  <select
                    id="vital-type"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={newVital.type}
                    onChange={(e) => setNewVital({ ...newVital, type: e.target.value })}
                  >
                    {vitalTypes.map(type => (
                      <option key={type.value} value={type.value}>
                        {type.label} ({type.unit})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="value">Reading Value</Label>
                  <Input
                    id="value"
                    placeholder={`Enter ${vitalTypes.find(v => v.value === newVital.type)?.label.toLowerCase()}`}
                    value={newVital.value}
                    onChange={(e) => setNewVital({ ...newVital, value: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="notes">Notes (Optional)</Label>
                  <Input
                    id="notes"
                    placeholder="Any additional notes"
                    value={newVital.notes}
                    onChange={(e) => setNewVital({ ...newVital, notes: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleAddVital}>Record</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </motion.div>

      <motion.div variants={item} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {vitalTypes.map(vitalType => {
          const latest = getLatestReading(vitalType.value);
          const Icon = vitalType.icon;
          return (
            <motion.div key={vitalType.value} whileHover={{ y: -2 }} transition={{ type: 'spring', stiffness: 400, damping: 25 }}>
              <Card className="h-full min-h-[154px] border-slate-200/90 bg-white shadow-sm transition-shadow duration-200 hover:shadow-md dark:border-slate-800 dark:bg-slate-900/70">
                <CardContent className="flex h-full flex-col justify-between p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
                      <Icon className={`h-5 w-5 ${vitalType.color}`} />
                    </div>
                    {latest && getStatusBadge(latest.status)}
                  </div>
                  <div className="mt-5">
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-300">{vitalType.label}</p>
                    <div className="mt-1 flex items-baseline gap-1.5">
                      <span className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">
                        {latest ? latest.value : '--'}
                      </span>
                      {latest && <span className="text-sm text-slate-500 dark:text-slate-400">{latest.unit}</span>}
                    </div>
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      {latest ? formatDate(latest.timestamp) : 'No reading yet'}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </motion.div>

      <motion.div variants={item} className="flex gap-2 overflow-x-auto rounded-xl border border-slate-200 bg-white p-2 shadow-sm scrollbar-hide dark:border-slate-800 dark:bg-slate-900/70">
        <Button
          variant={selectedType === 'all' ? 'default' : 'outline'}
          onClick={() => setSelectedType('all')}
          className="h-9 rounded-lg whitespace-nowrap transition-all duration-200"
        >
          All Readings
        </Button>
        {vitalTypes.map(type => (
          <Button
            key={type.value}
            variant={selectedType === type.value ? 'default' : 'outline'}
            onClick={() => setSelectedType(type.value)}
            className="h-9 rounded-lg whitespace-nowrap transition-all duration-200"
          >
            {type.label}
          </Button>
        ))}
      </motion.div>

      <motion.div variants={item}>
        <Card className="border-slate-200/90 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
          <CardHeader className="border-b border-slate-100 pb-4 dark:border-slate-800">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <CardTitle className="text-lg">Reading History</CardTitle>
                <CardDescription>
                  {selectedType === 'all'
                    ? 'All vital readings'
                    : `${vitalTypes.find(v => v.value === selectedType)?.label} readings`}
                </CardDescription>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400">{filteredVitals.length} readings</p>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div>
              {filteredVitals.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    icon={Activity}
                    title="No vitals recorded"
                    description="Log your blood pressure, glucose, and other vitals to track trends over time."
                    action={{ label: 'Log vitals', href: '/health-diary' }}
                  />
                </div>
              ) : (
                <>
                  <div className="hidden grid-cols-[minmax(220px,1.5fr)_minmax(140px,.8fr)_minmax(190px,1fr)_minmax(120px,.7fr)_110px] gap-4 border-b border-slate-100 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400 lg:grid">
                    <span>Vital</span>
                    <span>Reading</span>
                    <span>Date & time</span>
                    <span>Recorded by</span>
                    <span className="text-right">Status</span>
                  </div>
                  {filteredVitals.map((vital, idx) => {
                    const vitalType = getVitalType(vital.type);
                    return (
                      <motion.div
                        key={vital.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.04, duration: 0.3 }}
                        className="grid gap-4 border-b border-slate-100 px-5 py-4 last:border-b-0 hover:bg-slate-50/80 dark:border-slate-800 dark:hover:bg-slate-800/40 lg:grid-cols-[minmax(220px,1.5fr)_minmax(140px,.8fr)_minmax(190px,1fr)_minmax(120px,.7fr)_110px] lg:items-center"
                      >
                        <div className="flex min-w-0 items-start gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
                            {getVitalIcon(vital.type)}
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-semibold text-slate-950 dark:text-white">
                              {vitalType?.label}
                            </h4>
                            {vital.notes && (
                              <p className="mt-1 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">{vital.notes}</p>
                            )}
                          </div>
                        </div>
                        <div>
                          <span className="text-xs font-medium uppercase text-slate-400 lg:hidden">Reading</span>
                          <p className="mt-1 text-xl font-semibold text-slate-950 dark:text-white lg:mt-0">
                            {vital.value} <span className="text-sm font-normal text-slate-500 dark:text-slate-400">{vital.unit}</span>
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600 dark:text-slate-300 lg:block">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5 text-slate-400" />
                            {formatDate(vital.timestamp)}
                          </div>
                          <div className="flex items-center gap-1.5 lg:mt-1">
                            <Clock className="h-3.5 w-3.5 text-slate-400" />
                            {formatTime(vital.timestamp)}
                          </div>
                        </div>
                        <div className="text-sm text-slate-600 dark:text-slate-300">
                          <span className="text-xs font-medium uppercase text-slate-400 lg:hidden">Recorded by </span>
                          {vital.recordedBy}
                        </div>
                        <div className="flex lg:justify-end">
                          {getStatusBadge(vital.status)}
                        </div>
                      </motion.div>
                    );
                  })}
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
};

export default VitalReports;
