import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Activity, Heart, Thermometer, Droplets, Wind, Scale, TrendingUp, TrendingDown, Plus, Calendar, Clock, Download } from 'lucide-react';

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
      normal: { label: 'Normal', color: 'bg-green-100 text-green-800' },
      low: { label: 'Low', color: 'bg-yellow-100 text-yellow-800' },
      high: { label: 'High', color: 'bg-orange-100 text-orange-800' },
      critical: { label: 'Critical', color: 'bg-red-100 text-red-800' }
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
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Vital Reports</h1>
          <p className="text-gray-600 mt-1">Track and monitor your health vitals</p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Record Vital
            </Button>
          </DialogTrigger>
          <DialogContent>
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

      {/* Latest Readings Summary */}
      <div className="grid md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        {vitalTypes.map(vitalType => {
          const latest = getLatestReading(vitalType.value);
          const Icon = vitalType.icon;
          return (
            <Card key={vitalType.value} className="cursor-pointer hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <Icon className={`h-5 w-5 ${vitalType.color}`} />
                  {latest && getStatusBadge(latest.status)}
                </div>
                <CardTitle className="text-sm font-medium">{vitalType.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {latest ? `${latest.value} ${latest.unit}` : '--'}
                </div>
                {latest && (
                  <p className="text-xs text-gray-500 mt-1">
                    {new Date(latest.timestamp).toLocaleDateString()}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        <Button
          variant={selectedType === 'all' ? 'default' : 'outline'}
          onClick={() => setSelectedType('all')}
        >
          All Readings
        </Button>
        {vitalTypes.map(type => (
          <Button
            key={type.value}
            variant={selectedType === type.value ? 'default' : 'outline'}
            onClick={() => setSelectedType(type.value)}
          >
            {type.label}
          </Button>
        ))}
      </div>

      {/* Readings History */}
      <Card>
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
              <div className="text-center py-8 text-gray-500">
                <Activity className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No vital readings recorded yet</p>
              </div>
            ) : (
              filteredVitals.map((vital) => (
                <div key={vital.id} className="flex items-start justify-between p-4 border rounded-lg hover:bg-gray-50">
                  <div className="flex items-start gap-4">
                    {getVitalIcon(vital.type)}
                    <div>
                      <h4 className="font-semibold">
                        {vitalTypes.find(v => v.value === vital.type)?.label}
                      </h4>
                      <p className="text-2xl font-bold text-gray-900 mt-1">
                        {vital.value} <span className="text-sm font-normal text-gray-500">{vital.unit}</span>
                      </p>
                      {vital.notes && (
                        <p className="text-sm text-gray-600 mt-1">{vital.notes}</p>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
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
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default VitalReports;
