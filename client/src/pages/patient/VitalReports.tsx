import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Activity, Heart, Thermometer, Droplets, Wind, Scale, TrendingUp, TrendingDown, Plus, Calendar, Clock, Download } from 'lucide-react';
import MainLayout from '@/components/layout/MainLayout';

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

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { label: string; color: string }> = {
      normal: { label: 'Normal', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
      low: { label: 'Low', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
      high: { label: 'High', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' },
      critical: { label: 'Critical', color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' }
    };
    const variant = variants[status];
    return <Badge className={variant.color}>{variant.label}</Badge>;
  };

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
    <MainLayout>
      <motion.div initial="hidden" animate="show" variants={container} className="max-w-7xl mx-auto space-y-6 px-4 md:px-6 py-6">
        {/* Premium Header */}
        <motion.div variants={item} className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-rose-700 via-pink-700 to-rose-800 p-6 md:p-8 text-white shadow-2xl">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.15),transparent_60%)]" />
          <div className="absolute top-0 right-0 w-72 h-72 bg-gradient-to-br from-white/10 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
          <div className="relative flex items-center justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2.5 rounded-xl bg-white/15 backdrop-blur-sm shadow-lg"><Heart className="w-6 h-6" /></div>
                <Badge className="bg-white/15 text-white/90 border-white/20 font-medium">Health Vitals</Badge>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold mb-1">Vital Reports</h1>
              <p className="text-rose-200 text-sm md:text-base">Track and monitor your health vitals</p>
            </div>
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-white text-rose-700 hover:bg-white/90 shadow-lg font-semibold" aria-label="Record vital">
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

      {/* Latest Readings Summary */}
      <motion.div variants={item} className="grid md:grid-cols-3 lg:grid-cols-6 gap-4">
        {vitalTypes.map(vitalType => {
          const latest = getLatestReading(vitalType.value);
          const Icon = vitalType.icon;
          return (
            <motion.div key={vitalType.value} whileHover={{ scale: 1.04, y: -2 }} transition={{ type: 'spring', stiffness: 400, damping: 25 }}>
            <Card className="cursor-pointer hover:shadow-xl transition-all duration-300 dark:bg-slate-800/50 dark:border-slate-700/60 border-slate-200/80">
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <Icon className={`h-5 w-5 ${vitalType.color}`} />
                  {latest && getStatusBadge(latest.status)}
                </div>
                <CardTitle className="text-sm font-medium">{vitalType.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900 dark:text-white">
                  {latest ? `${latest.value} ${latest.unit}` : '--'}
                </div>
                {latest && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {new Date(latest.timestamp).toLocaleDateString()}
                  </p>
                )}
              </CardContent>
            </Card>
            </motion.div>
          );
        })}
      </motion.div>

      {/* Filter Tabs */}
      <motion.div variants={item} className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        <Button
          variant={selectedType === 'all' ? 'default' : 'outline'}
          onClick={() => setSelectedType('all')}
          className="rounded-full whitespace-nowrap transition-all duration-200"
        >
          All Readings
        </Button>
        {vitalTypes.map(type => (
          <Button
            key={type.value}
            variant={selectedType === type.value ? 'default' : 'outline'}
            onClick={() => setSelectedType(type.value)}
            className="rounded-full whitespace-nowrap transition-all duration-200"
          >
            {type.label}
          </Button>
        ))}
      </motion.div>

      {/* Readings History */}
      <motion.div variants={item}>
      <Card className="dark:bg-slate-800/50 dark:border-slate-700/60 border-slate-200/80">
        <CardHeader>
          <CardTitle>Reading History</CardTitle>
          <CardDescription>
            {selectedType === 'all' 
              ? 'All vital readings' 
              : `${vitalTypes.find(v => v.value === selectedType)?.label} readings`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {filteredVitals.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center mx-auto mb-4">
                  <Activity className="h-8 w-8 text-slate-400" />
                </div>
                <p className="text-lg font-medium text-slate-700 dark:text-slate-300">No vital readings recorded yet</p>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Record your first vital to start tracking</p>
              </div>
            ) : (
              filteredVitals.map((vital, idx) => (
                <motion.div key={vital.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.04, duration: 0.3 }} className="flex items-start justify-between p-4 border dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                  <div className="flex items-start gap-4">
                    {getVitalIcon(vital.type)}
                    <div>
                      <h4 className="font-semibold text-slate-900 dark:text-white">
                        {vitalTypes.find(v => v.value === vital.type)?.label}
                      </h4>
                      <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                        {vital.value} <span className="text-sm font-normal text-slate-500 dark:text-slate-400">{vital.unit}</span>
                      </p>
                      {vital.notes && (
                        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{vital.notes}</p>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-xs text-slate-500 dark:text-slate-400">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(vital.timestamp).toLocaleDateString()}
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(vital.timestamp).toLocaleTimeString()}
                        </div>
                        <span>Recorded by: {vital.recordedBy}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(vital.status)}
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
      </motion.div>
      </motion.div>
    </MainLayout>
  );
};

export default VitalReports;
