/**
 * Patient Engagement Portal — Screen 3: Dashboard
 * MVP shell. Standalone page (does NOT use HospitalLayout, which is
 * staff-only). Fetches the patient's own appointments and reports using the
 * patientToken directly, since the shared api client's interceptor does not
 * know about the "patientToken" localStorage key (it only auto-attaches
 * team/hospital/admin/doctor/corporate/generic "token" keys).
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import api from '@/utils/api';

interface PatientData {
  first_name?: string;
  last_name?: string;
  email?: string;
}

interface Appointment {
  id: number;
  doctorName?: string;
  specialization?: string;
  appointmentDate?: string;
  appointmentTime?: string;
  status?: string;
  consultationType?: string;
  reason?: string;
}

interface ReportItem {
  id: number;
  fileName?: string;
  fileUrl?: string;
  reportType?: string;
  description?: string;
  status?: string;
  createdAt?: string;
}

export default function PatientDashboard() {
  const navigate = useNavigate();
  const [patient, setPatient] = useState<PatientData | null>(null);
  const [upcoming, setUpcoming] = useState<Appointment[]>([]);
  const [past, setPast] = useState<Appointment[]>([]);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('patientToken');
    if (!token) {
      navigate('/patient-portal/login');
      return;
    }

    const cachedPatient = localStorage.getItem('patientData');
    if (cachedPatient) {
      try {
        setPatient(JSON.parse(cachedPatient));
      } catch {
        // ignore malformed cache
      }
    }

    const authHeader = { headers: { Authorization: `Bearer ${token}` } };

    Promise.all([
      api.get('/patient/appointments', authHeader),
      api.get('/patient/reports', authHeader),
    ])
      .then(([apptRes, reportsRes]) => {
        setUpcoming(apptRes.data?.data?.upcoming ?? []);
        setPast(apptRes.data?.data?.past ?? []);
        setReports(reportsRes.data?.data?.reports ?? []);
      })
      .catch((err) => {
        if (err?.response?.status === 401 || err?.response?.status === 403) {
          handleLogout();
          return;
        }
        setError('Could not load your portal data. Please try again later.');
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('patientToken');
    localStorage.removeItem('patientData');
    navigate('/patient-portal/login');
  };

  const fullName = [patient?.first_name, patient?.last_name].filter(Boolean).join(' ') || patient?.email || 'Patient';

  return (
    <div className="min-h-screen bg-sky-50">
      <header className="bg-white border-b border-sky-100 px-4 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-sky-900">Welcome, {fullName}</h1>
          <p className="text-xs text-slate-500">Patient Portal</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleLogout}>
          Log out
        </Button>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {loading && <p className="text-sm text-slate-500 text-center">Loading your portal...</p>}
        {error && <p className="text-sm text-red-600 text-center">{error}</p>}

        {!loading && !error && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Upcoming Appointments</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {upcoming.length === 0 && (
                  <p className="text-sm text-slate-500">No upcoming appointments.</p>
                )}
                {upcoming.map((apt) => (
                  <div key={apt.id} className="border rounded-md p-3 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-slate-900">{apt.doctorName || 'Doctor'}</p>
                      <p className="text-sm text-slate-500">
                        {apt.appointmentDate} {apt.appointmentTime ? `· ${apt.appointmentTime}` : ''}
                      </p>
                      {apt.reason && <p className="text-xs text-slate-400 mt-1">{apt.reason}</p>}
                    </div>
                    <Badge variant="secondary">{apt.status || 'scheduled'}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Past Visits</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {past.length === 0 && (
                  <p className="text-sm text-slate-500">No past visits yet.</p>
                )}
                {past.map((apt) => (
                  <div key={apt.id} className="border rounded-md p-3 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-slate-900">{apt.doctorName || 'Doctor'}</p>
                      <p className="text-sm text-slate-500">
                        {apt.appointmentDate} {apt.appointmentTime ? `· ${apt.appointmentTime}` : ''}
                      </p>
                    </div>
                    <Badge variant="outline">{apt.status || 'completed'}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">My Reports</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {reports.length === 0 && (
                  <p className="text-sm text-slate-500">No reports uploaded yet.</p>
                )}
                {reports.map((report) => (
                  <div key={report.id} className="border rounded-md p-3 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-slate-900">{report.fileName || 'Report'}</p>
                      <p className="text-sm text-slate-500">
                        {report.reportType || 'general'} · {report.createdAt ? new Date(report.createdAt).toLocaleDateString() : ''}
                      </p>
                    </div>
                    {report.fileUrl && (
                      <a
                        href={report.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-sky-700 underline"
                      >
                        Download
                      </a>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
