import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Activity, 
  Users, 
  Clock, 
  FileText,
  Calendar,
  AlertCircle,
  User,
  Pill,
  HeartPulse,
  Plus
} from 'lucide-react';
import api from '@/utils/api';

interface NurseData {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  department: string;
  specialty?: string;
  shift: string;
  assignedWard?: string;
  permissions: string[];
}

const NurseDashboard = () => {
  const navigate = useNavigate();
  const [nurseData, setNurseData] = useState<NurseData | null>(null);
  const [patients, setPatients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [schedule, setSchedule] = useState<{ currentShift: string; shiftStart: string; shiftEnd: string; assignedWard: string } | null>(null);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [todaysVitals, setTodaysVitals] = useState<any[]>([]);

  useEffect(() => {
    const token = localStorage.getItem('nurseToken');
    const data = localStorage.getItem('nurseData');
    
    if (!token || !data) {
      navigate('/nurse/login');
      return;
    }

    try {
      setNurseData(JSON.parse(data));
      fetchPatients();
      fetchSchedule();
      fetchRecentActivity();
      fetchTodaysVitals();
    } catch (error) {
      console.error('Error loading nurse data:', error);
      navigate('/nurse/login');
    }
  }, [navigate]);

  const fetchPatients = async () => {
    try {
      const token = localStorage.getItem('nurseToken');
      const { data } = await api.get('/nurse/patients', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (data.success) {
        setPatients(data.patients);
      }
    } catch (error) {
      console.error('Error fetching patients:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSchedule = async () => {
    try {
      const token = localStorage.getItem('nurseToken');
      const { data } = await api.get('/nurse/schedule', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (data.success) {
        setSchedule({
          currentShift: data.schedule.currentShift,
          shiftStart: data.schedule.shiftStart,
          shiftEnd: data.schedule.shiftEnd,
          assignedWard: data.schedule.assignedWard,
        });
      }
    } catch (error) {
      console.error('Error fetching schedule:', error);
    }
  };

  const fetchRecentActivity = async () => {
    try {
      const token = localStorage.getItem('nurseToken');
      const { data } = await api.get('/nurse/activity/recent', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (data.success) setRecentActivity(data.items || []);
    } catch (error) {
      console.error('Error fetching recent activity:', error);
    }
  };

  const fetchTodaysVitals = async () => {
    try {
      const token = localStorage.getItem('nurseToken');
      const { data } = await api.get('/nurse/vitals/today', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (data.success) setTodaysVitals(data.records || []);
    } catch (error) {
      console.error('Error fetching today vitals:', error);
    }
  };

  const criticalCount = patients.filter(p => p.condition === 'Critical').length;

  if (!nurseData) return null;

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-in fade-in duration-700">
      {/* Hero / Branding Section */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-500/5 to-emerald-500/5 border border-blue-500/20 p-8 backdrop-blur-xl">
        <div className="absolute inset-0" style={{
          backgroundImage: `radial-gradient(circle at 50% 50%, rgba(59, 130, 246, 0.03) 0%, transparent 25%)`,
          backgroundSize: '40px 40px',
          backgroundPosition: '0 0, 20px 20px'
        }} />
        <div className="relative">
          <div className="flex items-center gap-4 mb-6">
            <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500/10 to-green-500/10 border border-blue-500/20">
              <HeartPulse className="w-8 h-8 text-blue-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground mb-1">Nurse Command Center</h1>
              <p className="text-muted-foreground text-lg">{nurseData.firstName} {nurseData.lastName} • {nurseData.department}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <span className="text-xs px-3 py-1 rounded-full bg-blue-500/10 text-blue-700 border border-blue-500/20">Shift: {schedule?.currentShift || nurseData.shift}</span>
            {schedule && (
              <span className="text-xs px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-700 border border-indigo-500/20">Hours: {schedule.shiftStart} - {schedule.shiftEnd}</span>
            )}
            <span className="text-xs px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-700 border border-emerald-500/20">Ward: {schedule?.assignedWard || nurseData.assignedWard || 'N/A'}</span>
          </div>
        </div>
        {/* Decorative elements */}
        <div className="absolute -right-16 -top-16 opacity-[0.02] pointer-events-none">
          <Plus className="w-48 h-48 text-blue-500 rotate-12" />
        </div>
        <div className="absolute -left-16 -bottom-16 opacity-[0.02] pointer-events-none">
          <Plus className="w-48 h-48 text-emerald-500 -rotate-12" />
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: Users, label: 'Assigned Patients', value: patients.length, color: 'text-blue-500', bg: 'bg-gradient-to-br from-blue-500/10 to-cyan-500/10', border: 'border-blue-500/20', pattern: 'radial-gradient(circle at 100% 100%, rgba(59, 130, 246, 0.05) 0%, transparent 50%)' },
          { icon: Activity, label: 'Ward', value: schedule?.assignedWard || nurseData.assignedWard || 'N/A', color: 'text-emerald-500', bg: 'bg-gradient-to-br from-emerald-500/10 to-green-500/10', border: 'border-emerald-500/20', pattern: 'radial-gradient(circle at 0% 0%, rgba(16, 185, 129, 0.05) 0%, transparent 50%)' },
          { icon: Clock, label: 'Current Shift', value: schedule?.currentShift || nurseData.shift, color: 'text-indigo-500', bg: 'bg-gradient-to-br from-indigo-500/10 to-blue-500/10', border: 'border-indigo-500/20', pattern: 'radial-gradient(circle at 100% 0%, rgba(99, 102, 241, 0.05) 0%, transparent 50%)', extra: schedule ? `${schedule.shiftStart} - ${schedule.shiftEnd}` : undefined },
          { icon: AlertCircle, label: 'Critical Alerts', value: criticalCount, color: 'text-red-500', bg: 'bg-gradient-to-br from-red-500/10 to-pink-500/10', border: 'border-red-500/20', pattern: 'radial-gradient(circle at 0% 100%, rgba(239, 68, 68, 0.05) 0%, transparent 50%)' }
        ].map((stat) => {
          const Icon = stat.icon as any;
          return (
            <Card key={stat.label} className={`group transition-all duration-500 hover:shadow-xl ${stat.bg} border ${stat.border} backdrop-blur-xl relative overflow-hidden transform hover:-translate-y-1`}>
              <div className="absolute inset-0" style={{ background: stat.pattern }} />
              <CardHeader className="relative flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{stat.label}</CardTitle>
                <div className={`p-3 rounded-xl ${stat.bg} ${stat.border} transform transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3`}>
                  <Icon className={`h-5 w-5 ${stat.color}`} />
                </div>
              </CardHeader>
              <CardContent className="relative">
                <div className="text-3xl font-bold mb-1">{typeof stat.value === 'number' ? stat.value : stat.value}</div>
                {stat.extra && <div className="text-xs text-muted-foreground">{stat.extra}</div>}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Quick Actions */}
      <Card className="group transition-all duration-500 hover:shadow-xl bg-gradient-to-br from-purple-500/5 to-pink-500/5 border border-purple-500/20 backdrop-blur-xl relative overflow-hidden transform hover:-translate-y-1">
        <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 100% 0%, rgba(147, 51, 234, 0.05) 0%, transparent 50%)' }} />
        <CardHeader className="relative">
          <CardTitle className="text-lg">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="relative">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Button 
              variant="outline" 
              className="h-auto py-4 flex-col gap-2"
              onClick={() => navigate('/nurse/register-patient')}
            >
              <User className="h-5 w-5" />
              <span className="text-xs">Register Patient</span>
            </Button>
            <Button variant="outline" className="h-auto py-4 flex-col gap-2" onClick={() => navigate('/nurse/vitals')}>
              <Activity className="h-5 w-5" />
              <span className="text-xs">Record Vitals</span>
            </Button>
            <Button variant="outline" className="h-auto py-4 flex-col gap-2" onClick={() => navigate('/nurse/medications')}>
              <Pill className="h-5 w-5" />
              <span className="text-xs">Medications</span>
            </Button>
            <Button variant="outline" className="h-auto py-4 flex-col gap-2" onClick={() => navigate('/nurse/notes')}>
              <FileText className="h-5 w-5" />
              <span className="text-xs">Patient Notes</span>
            </Button>
            <Button variant="outline" className="h-auto py-4 flex-col gap-2" onClick={() => navigate('/nurse/appointments')}>
              <Calendar className="h-5 w-5" />
              <span className="text-xs">Appointments</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Patients List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Assigned Patients</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center text-muted-foreground py-8">Loading patients...</p>
          ) : patients.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No patients assigned</p>
          ) : (
            <div className="space-y-3">
              {patients.map((patient) => (
                <Card key={patient.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="bg-blue-100 dark:bg-blue-900 p-2 rounded-full">
                          <User className="h-4 w-4 text-blue-600" />
                        </div>
                        <div>
                          <p className="font-medium">{patient.name}</p>
                          <p className="text-sm text-muted-foreground">
                            Bed: {patient.bedNumber} • {patient.condition}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge 
                          variant={patient.condition === 'Critical' ? 'destructive' : 'secondary'}
                        >
                          {patient.condition}
                        </Badge>
                        <p className="text-xs text-muted-foreground mt-1">
                          Vitals: {patient.vitalsLastRecorded}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Activity / Today’s Vitals */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="group transition-all duration-500 hover:shadow-xl bg-gradient-to-br from-blue-500/5 to-emerald-500/5 border border-blue-500/20 backdrop-blur-xl relative overflow-hidden">
          <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 0% 100%, rgba(59, 130, 246, 0.05) 0%, transparent 50%)' }} />
          <CardHeader className="relative">
            <CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5 text-blue-600" /> Recent Activity</CardTitle>
          </CardHeader>
          <CardContent className="relative">
            {recentActivity.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recent activity</p>
            ) : (
              <div className="space-y-2">
                {recentActivity.slice(0, 8).map((item, idx) => (
                  <div key={idx} className="text-sm flex items-center justify-between">
                    <span className="text-muted-foreground">{item.type} • Patient {item.patientId}</span>
                    <span className="text-xs text-muted-foreground">{new Date(item.timestamp).toLocaleString()}</span>
                    <span className="block text-xs">{item.summary}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="group transition-all duration-500 hover:shadow-xl bg-gradient-to-br from-indigo-500/5 to-pink-500/5 border border-indigo-500/20 backdrop-blur-xl relative overflow-hidden">
          <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 100% 0%, rgba(99, 102, 241, 0.05) 0%, transparent 50%)' }} />
          <CardHeader className="relative">
            <CardTitle className="flex items-center gap-2"><HeartPulse className="h-5 w-5 text-indigo-600" /> Today’s Vitals</CardTitle>
          </CardHeader>
          <CardContent className="relative">
            {todaysVitals.length === 0 ? (
              <p className="text-sm text-muted-foreground">No vitals recorded today</p>
            ) : (
              <div className="space-y-2">
                {todaysVitals.slice(0, 8).map((v: any) => (
                  <div key={v.id} className="text-sm flex items-center justify-between">
                    <span className="text-muted-foreground">Patient {v.patientId}</span>
                    <span className="text-xs text-muted-foreground">{new Date(v.recordedAt).toLocaleTimeString()}</span>
                    <span className="block text-xs">BP {v.bloodPressure || '-'} • Pulse {v.pulse || '-'} • Temp {v.temperature || '-'}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default NurseDashboard;
