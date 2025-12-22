import React, { useEffect, useState } from 'react';
import api from '@/utils/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Shift {
  date: string;
  shift: string;
  hours: string;
}

const NurseAppointments: React.FC = () => {
  const [schedule, setSchedule] = useState<{ currentShift: string; shiftStart: string; shiftEnd: string; assignedWard: string; upcomingShifts: Shift[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchSchedule = async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('nurseToken');
      const { data } = await api.get('/nurse/schedule', { headers: { Authorization: `Bearer ${token}` } });
      if (data.success) setSchedule(data.schedule);
      else setError('Failed to load schedule');
    } catch (e: any) {
      console.error('Fetch nurse schedule error:', e);
      setError(e.response?.data?.message || 'Unable to load schedule');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSchedule(); }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold flex items-center gap-2"><Calendar className="h-6 w-6" /> Shift Schedule</h1>
        <Button variant="outline" onClick={fetchSchedule}><RefreshCcw className="h-4 w-4 mr-2" /> Refresh</Button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading ? (
        <p className="text-muted-foreground">Loading schedule...</p>
      ) : schedule ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Current Shift</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <p>Shift: {schedule.currentShift}</p>
            <p>Hours: {schedule.shiftStart} - {schedule.shiftEnd}</p>
            <p>Ward: {schedule.assignedWard}</p>
          </CardContent>
        </Card>
      ) : null}
      {schedule?.upcomingShifts?.length ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {schedule.upcomingShifts.map((s, idx) => (
            <Card key={idx}>
              <CardHeader>
                <CardTitle className="text-base">{s.date}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                <p>Shift: {s.shift}</p>
                <p>Hours: {s.hours}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}
    </div>
  );
};

export default NurseAppointments;
