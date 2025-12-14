import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/utils/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Activity, HeartPulse, ArrowLeft } from 'lucide-react';

const NurseVitals: React.FC = () => {
  const navigate = useNavigate();
  const [patientId, setPatientId] = useState('');
  const [bloodPressure, setBloodPressure] = useState('');
  const [pulse, setPulse] = useState('');
  const [temperature, setTemperature] = useState('');
  const [weight, setWeight] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    setError('');
    try {
      const token = localStorage.getItem('nurseToken');
      const payload = {
        patientId,
        vitals: {
          bloodPressure,
          pulse,
          temperature,
          weight
        }
      };
      const { data } = await api.post('/nurse/vitals', payload, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (data.success) {
        setMessage('Vitals recorded successfully');
        setPatientId('');
        setBloodPressure('');
        setPulse('');
        setTemperature('');
        setWeight('');
      } else {
        setError('Failed to record vitals');
      }
    } catch (e: any) {
      console.error('Record vitals error:', e);
      setError(e.response?.data?.message || 'Unable to record vitals');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="max-w-2xl">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="flex items-center gap-2"><HeartPulse className="h-5 w-5" /> Record Vitals</CardTitle>
        <Button variant="ghost" size="sm" onClick={() => navigate('/nurse/dashboard')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to dashboard
        </Button>
      </CardHeader>
      <CardContent>
        {message && <p className="text-green-600 text-sm mb-3">{message}</p>}
        {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="patientId">Patient ID</Label>
            <Input id="patientId" value={patientId} onChange={e => setPatientId(e.target.value)} required />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="bp">Blood Pressure</Label>
              <Input id="bp" placeholder="120/80" value={bloodPressure} onChange={e => setBloodPressure(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pulse">Pulse (bpm)</Label>
              <Input id="pulse" type="number" value={pulse} onChange={e => setPulse(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="temp">Temperature (°F)</Label>
              <Input id="temp" type="number" step="0.1" value={temperature} onChange={e => setTemperature(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="weight">Weight (kg)</Label>
              <Input id="weight" type="number" step="0.1" value={weight} onChange={e => setWeight(e.target.value)} />
            </div>
          </div>

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? <><Activity className="h-4 w-4 mr-2 animate-spin" /> Saving...</> : 'Save Vitals'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default NurseVitals;
