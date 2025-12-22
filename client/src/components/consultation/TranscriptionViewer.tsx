import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import api from '@/utils/api';
import {
  FileText,
  Pill,
  Copy,
  Download,
  Loader2,
  Brain,
  Stethoscope,
  TestTube,
  Calendar,
  AlertTriangle,
  ClipboardCopy,
  CheckCircle
} from 'lucide-react';

interface TranscriptionViewerProps {
  recordingId: number;
  onImportPrescription?: (prescriptionData: any) => void;
}

interface Recording {
  id: number;
  transcription: string;
  aiSummary: string;
  aiPrescription: {
    chiefComplaints: string[];
    medicalHistory: string[];
    diagnosis: string;
    medications: Array<{
      name: string;
      dosage: string;
      frequency: string;
      duration: string;
      instructions: string;
    }>;
    labTests: string[];
    followUpInstructions: string;
    followUpDate: string;
    redFlags: string[];
    summary: string;
  };
  duration: number;
  status: string;
}

const TranscriptionViewer = ({ recordingId, onImportPrescription }: TranscriptionViewerProps) => {
  const { toast } = useToast();
  const [recording, setRecording] = useState<Recording | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  useEffect(() => {
    fetchRecording();
  }, [recordingId]);

  const fetchRecording = async () => {
    try {
      setIsLoading(true);
      const response = await api.get(`/consultation-recordings/${recordingId}`);
      setRecording(response.data.recording);
    } catch (error: any) {
      toast({
        title: "Failed to Load Recording",
        description: error.response?.data?.message || "Could not fetch recording",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = async (text: string, section: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSection(section);
      toast({
        title: "Copied!",
        description: `${section} copied to clipboard`,
      });
      setTimeout(() => setCopiedSection(null), 2000);
    } catch (error) {
      toast({
        title: "Copy Failed",
        description: "Could not copy to clipboard",
        variant: "destructive",
      });
    }
  };

  const handleImportPrescription = () => {
    if (!recording || !onImportPrescription) return;
    
    onImportPrescription(recording.aiPrescription);
    toast({
      title: "✅ Prescription Imported",
      description: "AI-generated prescription data loaded. Review and edit as needed.",
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-purple-600 mr-3" />
          <span className="text-muted-foreground">Loading transcription...</span>
        </CardContent>
      </Card>
    );
  }

  if (!recording) {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">Recording not found</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with Import Button */}
      <Card className="border-purple-200 bg-gradient-to-r from-purple-50 to-blue-50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-purple-600" />
                AI Consultation Analysis
              </CardTitle>
              <CardDescription>
                Duration: {Math.floor(recording.duration / 60)}:{(recording.duration % 60).toString().padStart(2, '0')} minutes
              </CardDescription>
            </div>
            {onImportPrescription && recording.aiPrescription && (
              <Button
                onClick={handleImportPrescription}
                className="bg-purple-600 hover:bg-purple-700 gap-2"
              >
                <ClipboardCopy className="h-4 w-4" />
                Import to Prescription
              </Button>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* AI Summary */}
      {recording.aiSummary && (
        <Card className="border-green-200">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Stethoscope className="h-5 w-5 text-green-600" />
              Consultation Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {recording.aiSummary}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Tabs for different sections */}
      <Tabs defaultValue="prescription" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="prescription">Prescription Data</TabsTrigger>
          <TabsTrigger value="transcript">Full Transcript</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>

        {/* Prescription Data Tab */}
        <TabsContent value="prescription" className="space-y-4">
          {/* Chief Complaints */}
          {recording.aiPrescription?.chiefComplaints && recording.aiPrescription.chiefComplaints.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Chief Complaints</CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(recording.aiPrescription.chiefComplaints.join(', '), 'Chief Complaints')}
                  >
                    {copiedSection === 'Chief Complaints' ? (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {recording.aiPrescription.chiefComplaints.map((complaint, i) => (
                    <Badge key={i} variant="outline" className="text-sm">
                      {complaint}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Diagnosis */}
          {recording.aiPrescription?.diagnosis && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Diagnosis</CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(recording.aiPrescription.diagnosis, 'Diagnosis')}
                  >
                    {copiedSection === 'Diagnosis' ? (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm font-medium">{recording.aiPrescription.diagnosis}</p>
              </CardContent>
            </Card>
          )}

          {/* Medications */}
          {recording.aiPrescription?.medications && recording.aiPrescription.medications.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Pill className="h-4 w-4 text-blue-600" />
                  Prescribed Medications
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {recording.aiPrescription.medications.map((med, index) => (
                    <div key={index} className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                      <div className="font-semibold text-blue-900">{med.name}</div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2 text-sm text-blue-700">
                        <div>
                          <span className="font-medium">Dosage:</span> {med.dosage}
                        </div>
                        <div>
                          <span className="font-medium">Frequency:</span> {med.frequency}
                        </div>
                        <div>
                          <span className="font-medium">Duration:</span> {med.duration}
                        </div>
                        {med.instructions && (
                          <div className="col-span-2 md:col-span-4">
                            <span className="font-medium">Instructions:</span> {med.instructions}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Lab Tests */}
          {recording.aiPrescription?.labTests && recording.aiPrescription.labTests.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <TestTube className="h-4 w-4 text-purple-600" />
                  Lab Tests Recommended
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {recording.aiPrescription.labTests.map((test, i) => (
                    <Badge key={i} variant="secondary" className="text-sm">
                      {test}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Follow-up */}
          {recording.aiPrescription?.followUpInstructions && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-green-600" />
                  Follow-up Instructions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-2">
                  {recording.aiPrescription.followUpInstructions}
                </p>
                {recording.aiPrescription.followUpDate && (
                  <Badge className="bg-green-600">
                    Follow-up Date: {recording.aiPrescription.followUpDate}
                  </Badge>
                )}
              </CardContent>
            </Card>
          )}

          {/* Red Flags */}
          {recording.aiPrescription?.redFlags && recording.aiPrescription.redFlags.length > 0 && (
            <Card className="border-red-200 bg-red-50">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2 text-red-700">
                  <AlertTriangle className="h-4 w-4" />
                  Warning Signs to Watch For
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc list-inside space-y-1">
                  {recording.aiPrescription.redFlags.map((flag, i) => (
                    <li key={i} className="text-sm text-red-700">{flag}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Full Transcript Tab */}
        <TabsContent value="transcript">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Full Consultation Transcript</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(recording.transcription, 'Transcript')}
                  className="gap-2"
                >
                  {copiedSection === 'Transcript' ? (
                    <>
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      Copy
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="max-h-96 overflow-y-auto p-4 bg-slate-50 rounded-lg border">
                <p className="text-sm whitespace-pre-wrap font-mono">
                  {recording.transcription}
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Details Tab */}
        <TabsContent value="details">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recording Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Status</p>
                    <Badge className="mt-1 bg-green-600">{recording.status}</Badge>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Duration</p>
                    <p className="font-medium">
                      {Math.floor(recording.duration / 60)}:{(recording.duration % 60).toString().padStart(2, '0')} min
                    </p>
                  </div>
                </div>
                
                {recording.aiPrescription?.medicalHistory && recording.aiPrescription.medicalHistory.length > 0 && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Medical History Mentioned</p>
                    <div className="flex flex-wrap gap-2">
                      {recording.aiPrescription.medicalHistory.map((item, i) => (
                        <Badge key={i} variant="outline">{item}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default TranscriptionViewer;
