import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import MainLayout from '@/components/layout/MainLayoutdoctor';
import RecordingControls from '@/components/consultation/RecordingControls';
import TranscriptionViewer from '@/components/consultation/TranscriptionViewer';
import {
  Brain,
  FileVideo,
  Play,
  AlertCircle,
  CheckCircle,
  Loader2,
  ArrowRight
} from 'lucide-react';

const RecordingTestPage = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [appointmentId, setAppointmentId] = useState('1');
  const [roomId, setRoomId] = useState(`test-room-${Date.now()}`);
  const [patientId, setPatientId] = useState('1');
  const [showRecording, setShowRecording] = useState(false);
  const [completedRecording, setCompletedRecording] = useState<any>(null);

  const handleStart = () => {
    if (!appointmentId || !roomId || !patientId) {
      toast({
        title: "Missing Information",
        description: "Please fill in all test parameters",
        variant: "destructive"
      });
      return;
    }
    setShowRecording(true);
  };

  const handleRecordingComplete = (recording: any) => {
    setCompletedRecording(recording);
    toast({
      title: "🎉 Test Successful!",
      description: "AI transcription and prescription generation complete"
    });
  };

  const handleImportPrescription = (prescriptionData: any) => {
    localStorage.setItem('importedPrescription', JSON.stringify(prescriptionData));
    navigate('/doctor/prescriptions');
  };

  return (
    <MainLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold primary-grad">
              AI Recording System Test
            </h1>
            <p className="text-muted-foreground mt-1">
              Test the AI-powered consultation recording and transcription
            </p>
          </div>
          <Button onClick={() => navigate('/doctor/video-consultation')} variant="outline">
            Back to Video Consultations
          </Button>
        </div>

        {/* Features Overview */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-purple-600" />
              What This Test Does
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="p-4 bg-muted/40">
                <div className="flex items-center gap-2 mb-2">
                  <FileVideo className="h-5 w-5 text-purple-600" />
                  <span className="font-semibold">Step 1: Record</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Start recording to create a consultation record. Normally linked to LiveKit video.
                </p>
              </Card>
              <Card className="p-4 bg-muted/40">
                <div className="flex items-center gap-2 mb-2">
                  <Brain className="h-5 w-5 text-blue-600" />
                  <span className="font-semibold">Step 2: Transcribe</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Whisper AI transcribes the audio (simulated in test mode).
                </p>
              </Card>
              <Card className="p-4 bg-muted/40">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span className="font-semibold">Step 3: Extract</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  AI extracts diagnosis, medications, and prescription data.
                </p>
              </Card>
            </div>
          </CardContent>
        </Card>

        {/* Test Parameters */}
        {!showRecording && (
          <Card>
            <CardHeader>
              <CardTitle>Test Parameters</CardTitle>
              <CardDescription>
                Configure test recording (use any values for testing)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Appointment ID</Label>
                  <Input
                    type="number"
                    value={appointmentId}
                    onChange={(e) => setAppointmentId(e.target.value)}
                    placeholder="e.g., 1"
                  />
                </div>
                <div>
                  <Label>Room ID</Label>
                  <Input
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value)}
                    placeholder="e.g., test-room-123"
                  />
                </div>
                <div>
                  <Label>Patient ID</Label>
                  <Input
                    type="number"
                    value={patientId}
                    onChange={(e) => setPatientId(e.target.value)}
                    placeholder="e.g., 1"
                  />
                </div>
              </div>

              <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-semibold text-yellow-900">Test Mode Note:</p>
                    <p className="text-yellow-700">
                      In production, these values come from actual appointments. For testing, you can use any numbers.
                      The AI will work if there's an actual recording file, otherwise it will simulate the process.
                    </p>
                  </div>
                </div>
              </div>

              <Button onClick={handleStart} className="w-full gap-2" size="lg">
                <Play className="h-5 w-5" />
                Start Test Recording
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Recording Controls */}
        {showRecording && (
          <div className="space-y-6">
            <RecordingControls
              appointmentId={parseInt(appointmentId)}
              roomId={roomId}
              patientId={parseInt(patientId)}
              onRecordingComplete={handleRecordingComplete}
            />

            {/* Instructions during recording */}
            <Card className="border-blue-200 bg-blue-50">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
                  <div className="text-sm text-blue-900">
                    <p className="font-semibold mb-2">Testing Instructions:</p>
                    <ol className="list-decimal list-inside space-y-1">
                      <li>Click "Start Recording" to begin</li>
                      <li>Wait a few seconds (simulates consultation)</li>
                      <li>Click "Stop Recording" to end</li>
                      <li>AI will process the recording (shows "Processing" status)</li>
                      <li>When complete, view the transcription and prescription data</li>
                      <li>Click "Import to Prescription" to test the integration</li>
                    </ol>
                    <p className="mt-3 text-blue-700">
                      <strong>Note:</strong> If no actual recording file exists in LiveKit, 
                      the system will mark it as "failed" but you can still test the UI flow.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Completed Recording View */}
        {completedRecording && (
          <Card className="border-green-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-700">
                <CheckCircle className="h-5 w-5" />
                Recording Completed Successfully!
              </CardTitle>
              <CardDescription>
                View the AI-generated transcription and prescription below
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <TranscriptionViewer
                recordingId={completedRecording.id}
                onImportPrescription={handleImportPrescription}
              />
              
              <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg border border-green-200">
                <div>
                  <p className="font-semibold text-green-900">Ready to Test Prescription Import?</p>
                  <p className="text-sm text-green-700">
                    Click the button to import AI-generated prescription to the prescription form
                  </p>
                </div>
                <Button
                  onClick={() => handleImportPrescription(completedRecording.aiPrescription)}
                  className="gap-2 bg-green-600 hover:bg-green-700"
                >
                  Go to Prescriptions
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* API Endpoints Reference */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">API Reference</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm font-mono">
              <div className="p-2 bg-muted/40 rounded">
                <span className="text-green-600">POST</span> /api/consultation-recordings/start
              </div>
              <div className="p-2 bg-muted/40 rounded">
                <span className="text-orange-600">POST</span> /api/consultation-recordings/stop/:id
              </div>
              <div className="p-2 bg-muted/40 rounded">
                <span className="text-blue-600">GET</span> /api/consultation-recordings/:id
              </div>
              <div className="p-2 bg-muted/40 rounded">
                <span className="text-orange-600">POST</span> /api/consultation-recordings/:id/transcribe
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
};

export default RecordingTestPage;
