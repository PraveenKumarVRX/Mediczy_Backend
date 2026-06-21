import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, User, AlertTriangle, PhoneOff, CheckCircle2 } from 'lucide-react';
import axios from 'axios';

interface QueueEntry {
  id: number;
  patientId: number;
  patientName: string;
  queueType: 'walk-in' | 'appointment' | 'urgent' | 'follow-up';
  priority: number;
  triageLevel: 'ESI-1' | 'ESI-2' | 'ESI-3' | 'ESI-4' | 'ESI-5';
  status: 'waiting' | 'called' | 'in_consultation' | 'completed';
  estimatedWaitMinutes: number;
  eta: string;
  arrivedAt: string;
  chiefComplaint?: string;
}

export default function QueueManagementPanel() {
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPatient, setCurrentPatient] = useState<QueueEntry | null>(null);

  useEffect(() => {
    fetchQueue();
    const interval = setInterval(fetchQueue, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const fetchQueue = async () => {
    try {
      const token = localStorage.getItem('doctorToken');
      const { data } = await axios.get('/api/v1/queue/my', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setQueue(data.data);
      setCurrentPatient(data.data.find((p: QueueEntry) => p.status === 'in_consultation') || null);
    } catch (error) {
      console.error('Failed to fetch queue:', error);
    } finally {
      setLoading(false);
    }
  };

  const callNextPatient = async () => {
    try {
      const token = localStorage.getItem('doctorToken');
      const nextPatient = queue.find(p => p.status === 'waiting');
      if (!nextPatient) return;

      await axios.patch(`/api/v1/queue/${nextPatient.id}/call`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchQueue();
    } catch (error) {
      console.error('Failed to call patient:', error);
    }
  };

  const completeConsultation = async (entryId: number) => {
    try {
      const token = localStorage.getItem('doctorToken');
      await axios.patch(`/api/v1/queue/${entryId}/complete`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchQueue();
    } catch (error) {
      console.error('Failed to complete consultation:', error);
    }
  };

  const markNoShow = async (entryId: number) => {
    try {
      const token = localStorage.getItem('doctorToken');
      await axios.patch(`/api/v1/queue/${entryId}/no-show`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchQueue();
    } catch (error) {
      console.error('Failed to mark no-show:', error);
    }
  };

  const getPriorityColor = (triageLevel: string) => {
    switch (triageLevel) {
      case 'ESI-1': return 'bg-red-100 text-red-800 border-red-300';
      case 'ESI-2': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'ESI-3': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'ESI-4': return 'bg-green-100 text-green-800 border-green-300';
      case 'ESI-5': return 'bg-blue-100 text-blue-800 border-blue-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const waitingPatients = queue.filter(p => p.status === 'waiting');

  if (loading) return <div>Loading queue...</div>;

  return (
    <div className="space-y-6">
      {/* Current Patient Card */}
      {currentPatient && (
        <Card className="border-blue-500 border-2">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Currently Consulting
              </span>
              <Badge className={getPriorityColor(currentPatient.triageLevel)}>
                {currentPatient.triageLevel}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h3 className="text-xl font-semibold">{currentPatient.patientName}</h3>
                {currentPatient.chiefComplaint && (
                  <p className="text-sm text-gray-600 mt-1">
                    Chief Complaint: {currentPatient.chiefComplaint}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => completeConsultation(currentPatient.id)}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Complete Consultation
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Waiting Queue */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Waiting Queue ({waitingPatients.length})
            </span>
            <Button
              onClick={callNextPatient}
              disabled={waitingPatients.length === 0 || !!currentPatient}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Call Next Patient
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {waitingPatients.length === 0 ? (
              <p className="text-center text-gray-500 py-8">No patients waiting</p>
            ) : (
              waitingPatients.map((patient, index) => (
                <div
                  key={patient.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50"
                >
                  <div className="flex items-center gap-4">
                    <div className="text-2xl font-bold text-gray-400">
                      {index + 1}
                    </div>
                    <div>
                      <h4 className="font-semibold">{patient.patientName}</h4>
                      {patient.chiefComplaint && (
                        <p className="text-sm text-gray-600">{patient.chiefComplaint}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        <Clock className="h-3 w-3 text-gray-400" />
                        <span className="text-xs text-gray-500">
                          Waiting: {patient.estimatedWaitMinutes} min • ETA: {new Date(patient.eta).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={getPriorityColor(patient.triageLevel)}>
                      {patient.triageLevel}
                    </Badge>
                    <Badge variant="outline">
                      {patient.queueType}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => markNoShow(patient.id)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <PhoneOff className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Quick Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600">
                {waitingPatients.length}
              </div>
              <div className="text-sm text-gray-600">Waiting</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600">
                {queue.filter(p => p.status === 'completed').length}
              </div>
              <div className="text-sm text-gray-600">Completed Today</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-orange-600">
                {waitingPatients.length > 0 
                  ? Math.round(waitingPatients.reduce((sum, p) => sum + p.estimatedWaitMinutes, 0) / waitingPatients.length)
                  : 0}
              </div>
              <div className="text-sm text-gray-600">Avg Wait (min)</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-red-600">
                {queue.filter(p => p.triageLevel === 'ESI-1' || p.triageLevel === 'ESI-2').length}
              </div>
              <div className="text-sm text-gray-600">Urgent Cases</div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
