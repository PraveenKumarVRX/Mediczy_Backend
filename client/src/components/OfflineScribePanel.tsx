/**
 * OfflineScribePanel Component
 * Hospital-grade offline AI medical scribe
 * Supports Hindi, Tamil, Telugu, and English
 * CPU-only, fully offline operation
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Mic, 
  MicOff, 
  Square, 
  Play, 
  Pause,
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  FileText,
  Languages,
  Wifi,
  WifiOff,
  Copy,
  Download,
  RefreshCw,
  Sparkles,
  Stethoscope,
  FileOutput,
  ClipboardList,
  Activity,
  Trash2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { useAudioRecorder, formatRecordingTime } from '@/hooks/useAudioRecorder';
import offlineScribeService, { 
  type DocumentType, 
  type LanguageCode,
  type PrescriptionData,
  type DocumentResult
} from '@/services/offlineScribe.service';

// Language options
const LANGUAGES = [
  { code: 'auto', name: 'Auto-detect', native: 'स्वतः पहचान', flag: '🌐' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी', flag: '🇮🇳' },
  { code: 'ta', name: 'Tamil', native: 'தமிழ்', flag: '🇮🇳' },
  { code: 'te', name: 'Telugu', native: 'తెలుగు', flag: '🇮🇳' },
  { code: 'en', name: 'English', native: 'English', flag: '🇬🇧' },
] as const;

// Document type options
const DOCUMENT_TYPES = [
  { value: 'prescription', label: 'OPD Prescription', icon: FileText, description: 'Standard outpatient prescription' },
  { value: 'opd-notes', label: 'OPD Notes', icon: ClipboardList, description: 'Outpatient clinical notes' },
  { value: 'ipd-notes', label: 'IPD Notes', icon: Activity, description: 'Inpatient daily notes' },
  { value: 'discharge', label: 'Discharge Summary', icon: FileOutput, description: 'Hospital discharge summary' },
] as const;

interface PatientContext {
  name?: string;
  age?: number;
  gender?: string;
  patient_id?: string;
}

interface OfflineScribePanelProps {
  onPrescriptionGenerated?: (prescription: PrescriptionData) => void;
  patientContext?: PatientContext;
  defaultLanguage?: LanguageCode;
  defaultDocumentType?: DocumentType;
  compact?: boolean;
}

type ProcessingStage = 'idle' | 'transcribing' | 'normalizing' | 'generating' | 'complete' | 'error';

const OfflineScribePanel: React.FC<OfflineScribePanelProps> = ({
  onPrescriptionGenerated,
  patientContext,
  defaultLanguage = 'hi',
  defaultDocumentType = 'prescription',
  compact = false,
}) => {
  const { toast } = useToast();
  
  // State
  const [language, setLanguage] = useState<LanguageCode>(defaultLanguage);
  const [documentType, setDocumentType] = useState<DocumentType>(defaultDocumentType);
  const [serviceStatus, setServiceStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [processingStage, setProcessingStage] = useState<ProcessingStage>('idle');
  const [progress, setProgress] = useState(0);
  
  // Text state
  const [transcript, setTranscript] = useState('');
  const [normalizedText, setNormalizedText] = useState('');
  const [generatedDocument, setGeneratedDocument] = useState<DocumentResult | null>(null);
  const [manualInput, setManualInput] = useState('');
  
  // Audio recorder hook
  const {
    isRecording,
    isPaused,
    recordingTime,
    audioUrl,
    error: recordingError,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    resetRecording,
    isSupported: isRecordingSupported,
  } = useAudioRecorder({
    maxDuration: 300, // 5 minutes
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Recording Error',
        description: error,
      });
    },
  });

  const draftKey = useMemo(
    () => `offlineScribeDraft:${patientContext?.patient_id || 'default'}`,
    [patientContext?.patient_id]
  );

  // Check service status on mount
  useEffect(() => {
    checkServiceStatus();
  }, []);

  // Restore draft from current browser session
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(draftKey);
      if (!raw) return;

      const draft = JSON.parse(raw);
      if (draft.transcript) setTranscript(draft.transcript);
      if (draft.normalizedText) setNormalizedText(draft.normalizedText);
      if (draft.manualInput) setManualInput(draft.manualInput);
      if (draft.generatedDocument) setGeneratedDocument(draft.generatedDocument);
    } catch (error) {
      // Ignore malformed drafts and start fresh
    }
  }, [draftKey]);

  // Persist in-session draft so accidental navigation does not lose notes
  useEffect(() => {
    const payload = {
      transcript,
      normalizedText,
      manualInput,
      generatedDocument,
    };

    try {
      if (!transcript && !normalizedText && !manualInput && !generatedDocument) {
        sessionStorage.removeItem(draftKey);
      } else {
        sessionStorage.setItem(draftKey, JSON.stringify(payload));
      }
    } catch (error) {
      // Storage may be unavailable in private mode; continue without persistence
    }
  }, [draftKey, transcript, normalizedText, manualInput, generatedDocument]);

  const checkServiceStatus = async () => {
    setServiceStatus('checking');
    try {
      const health = await offlineScribeService.checkHealth();
      setServiceStatus(health.status === 'ok' ? 'online' : 'offline');
    } catch (error) {
      setServiceStatus('offline');
    }
  };

  // Handle recording start
  const handleStartRecording = async () => {
    if (processingStage !== 'idle' && processingStage !== 'complete' && processingStage !== 'error') {
      toast({
        variant: 'destructive',
        title: 'Please wait',
        description: 'Current processing is still in progress.',
      });
      return;
    }

    if (serviceStatus !== 'online') {
      toast({
        variant: 'destructive',
        title: 'Service Offline',
        description: 'The offline scribe service is not available. Please start the service first.',
      });
      return;
    }

    resetRecording();
    setTranscript('');
    setNormalizedText('');
    setGeneratedDocument(null);
    setProcessingStage('idle');
    
    await startRecording();
    
    toast({
      title: '🎤 Recording Started',
      description: `Speak in ${LANGUAGES.find(l => l.code === language)?.name || 'your language'}`,
    });
  };

  // Handle recording stop
  const handleStopRecording = async () => {
    const blob = await stopRecording();
    
    if (blob) {
      toast({
        title: '⏹️ Recording Stopped',
        description: `${formatRecordingTime(recordingTime)} recorded. Processing...`,
      });
      
      // Process the audio
      await processAudio(blob);
    }
  };

  // Process recorded audio through pipeline
  const processAudio = async (blob: Blob) => {
    try {
      setProcessingStage('transcribing');
      setProgress(10);

      // Step 1: Transcribe
      toast({ title: '🔄 Transcribing audio...', description: 'Converting speech to text' });
      const transcription = await offlineScribeService.transcribe(blob, language);
      setTranscript(transcription.text);
      setProgress(40);

      // Step 2: Normalize
      setProcessingStage('normalizing');
      toast({ title: '🔄 Normalizing text...', description: 'Standardizing medical terms' });
      const normalization = await offlineScribeService.normalize(
        transcription.text, 
        (transcription.detected_language as LanguageCode) || language
      );
      setNormalizedText(normalization.normalized_text);
      setProgress(70);

      // Step 3: Generate document
      setProcessingStage('generating');
      toast({ title: '🔄 Generating document...', description: `Creating ${documentType}` });
      const document = await offlineScribeService.generateDocument(
        normalization.normalized_text,
        documentType,
        (transcription.detected_language as LanguageCode) || language,
        patientContext
      );
      setGeneratedDocument(document);
      setProgress(100);
      setProcessingStage('complete');

      // Callback
      if (onPrescriptionGenerated && document.structured_data) {
        onPrescriptionGenerated(document.structured_data);
      }

      toast({
        title: '✅ Document Generated',
        description: `${DOCUMENT_TYPES.find(d => d.value === documentType)?.label} created successfully`,
      });

    } catch (error: any) {
      console.error('Processing error:', error);
      setProcessingStage('error');
      toast({
        variant: 'destructive',
        title: 'Processing Failed',
        description: error.message || 'Failed to process audio',
      });
    }
  };

  // Process manual text input
  const processManualInput = async () => {
    if (serviceStatus !== 'online') {
      toast({
        variant: 'destructive',
        title: 'Service Offline',
        description: 'Start the offline scribe service before processing text.',
      });
      return;
    }

    if (!manualInput.trim()) {
      toast({
        variant: 'destructive',
        title: 'No Input',
        description: 'Please enter some text to process',
      });
      return;
    }

    try {
      setProcessingStage('normalizing');
      setProgress(30);

      // Normalize
      const normalization = await offlineScribeService.normalize(manualInput, language);
      setNormalizedText(normalization.normalized_text);
      setTranscript(manualInput);
      setProgress(60);

      // Generate document
      setProcessingStage('generating');
      const document = await offlineScribeService.generateDocument(
        normalization.normalized_text,
        documentType,
        language,
        patientContext
      );
      setGeneratedDocument(document);
      setProgress(100);
      setProcessingStage('complete');

      if (onPrescriptionGenerated && document.structured_data) {
        onPrescriptionGenerated(document.structured_data);
      }

      toast({
        title: '✅ Document Generated',
        description: `${DOCUMENT_TYPES.find(d => d.value === documentType)?.label} created successfully`,
      });

    } catch (error: any) {
      setProcessingStage('error');
      toast({
        variant: 'destructive',
        title: 'Processing Failed',
        description: error.message,
      });
    }
  };

  // Copy to clipboard
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: 'Copied to clipboard' });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Copy failed',
        description: 'Clipboard access was blocked by your browser.',
      });
    }
  };

  const clearWorkspace = () => {
    resetRecording();
    setTranscript('');
    setNormalizedText('');
    setGeneratedDocument(null);
    setManualInput('');
    setProgress(0);
    setProcessingStage('idle');
    sessionStorage.removeItem(draftKey);
  };

  const downloadGeneratedDocument = () => {
    if (!generatedDocument?.formatted_text) return;
    const blob = new Blob([generatedDocument.formatted_text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${documentType}-${Date.now()}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  // Get status badge color
  const getStatusColor = () => {
    switch (serviceStatus) {
      case 'online': return 'bg-green-500';
      case 'offline': return 'bg-red-500';
      default: return 'bg-yellow-500';
    }
  };

  // Render processing progress
  const renderProgress = () => {
    if (processingStage === 'idle' || processingStage === 'complete') return null;

    const stages: Record<ProcessingStage, string> = {
      idle: '',
      transcribing: 'Transcribing audio...',
      normalizing: 'Normalizing medical terms...',
      generating: 'Generating document...',
      complete: 'Complete!',
      error: 'Error occurred',
    };

    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">{stages[processingStage]}</span>
        </div>
        <Progress value={progress} className="h-2" />
      </div>
    );
  };

  return (
    <Card className={compact ? 'border-0 shadow-none' : ''}>
      <CardHeader className={compact ? 'p-4' : ''}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Stethoscope className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Offline AI Scribe</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1">
              {serviceStatus === 'online' ? (
                <><Wifi className="h-3 w-3" /> Local Service Online</>
              ) : serviceStatus === 'checking' ? (
                <><Loader2 className="h-3 w-3 animate-spin" /> Checking...</>
              ) : (
                <><AlertCircle className="h-3 w-3 text-red-500" /> Service Offline</>
              )}
            </Badge>
            <div className={`h-2 w-2 rounded-full ${getStatusColor()}`} />
            <Button variant="ghost" size="icon" onClick={checkServiceStatus} disabled={serviceStatus === 'checking'}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={clearWorkspace} title="Clear workspace">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <CardDescription>
          CPU-only local transcription and document generation for doctor workflow
        </CardDescription>
      </CardHeader>

      <CardContent className={compact ? 'p-4 pt-0' : ''}>
        <Alert className="mb-4 border-blue-200 bg-blue-50/60 dark:border-blue-900 dark:bg-blue-950/20">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Privacy mode</AlertTitle>
          <AlertDescription>
            Dictation is processed on local infrastructure. Review all AI output before finalizing prescriptions.
          </AlertDescription>
        </Alert>

        {/* Configuration Row */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          {/* Language Selector */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1">
              <Languages className="h-4 w-4" />
              Language
            </Label>
            <Select value={language} onValueChange={(v) => setLanguage(v as LanguageCode)}>
              <SelectTrigger>
                <SelectValue placeholder="Select language" />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code}>
                    <span className="flex items-center gap-2">
                      <span>{lang.flag}</span>
                      <span>{lang.name}</span>
                      <span className="text-muted-foreground text-xs">({lang.native})</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Document Type Selector */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1">
              <FileText className="h-4 w-4" />
              Document Type
            </Label>
            <Select value={documentType} onValueChange={(v) => setDocumentType(v as DocumentType)}>
              <SelectTrigger>
                <SelectValue placeholder="Select document type" />
              </SelectTrigger>
              <SelectContent>
                {DOCUMENT_TYPES.map((doc) => (
                  <SelectItem key={doc.value} value={doc.value}>
                    <span className="flex items-center gap-2">
                      <doc.icon className="h-4 w-4" />
                      <span>{doc.label}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Recording Controls */}
        <div className="flex flex-col items-center gap-4 p-6 bg-muted/50 rounded-lg mb-4">
          {/* Recording Button */}
          <div className="flex items-center gap-3">
            {!isRecording ? (
              <Button
                size="lg"
                onClick={handleStartRecording}
                disabled={serviceStatus !== 'online' || !isRecordingSupported}
                className="h-16 w-16 rounded-full"
              >
                <Mic className="h-8 w-8" />
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={isPaused ? resumeRecording : pauseRecording}
                  className="h-12 w-12 rounded-full"
                >
                  {isPaused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
                </Button>
                <Button
                  variant="destructive"
                  size="lg"
                  onClick={handleStopRecording}
                  className="h-16 w-16 rounded-full"
                >
                  <Square className="h-6 w-6" />
                </Button>
              </>
            )}
          </div>

          {/* Recording Status */}
          {isRecording && (
            <div className="flex items-center gap-2">
              <div className={`h-3 w-3 rounded-full ${isPaused ? 'bg-yellow-500' : 'bg-red-500 animate-pulse'}`} />
              <span className="font-mono text-lg">{formatRecordingTime(recordingTime)}</span>
              <span className="text-muted-foreground">
                {isPaused ? '(Paused)' : 'Recording...'}
              </span>
            </div>
          )}

          {/* Instructions */}
          {!isRecording && processingStage === 'idle' && (
            <p className="text-sm text-muted-foreground text-center">
              Click the microphone to start recording your consultation.<br />
              Speak in {LANGUAGES.find(l => l.code === language)?.name || 'your preferred language'}.
            </p>
          )}

          {/* Audio playback */}
          {audioUrl && processingStage === 'complete' && (
            <audio controls src={audioUrl} className="w-full max-w-md" />
          )}
        </div>

        {/* Processing Progress */}
        {renderProgress()}

        {/* Tabs for input/output */}
        <Tabs defaultValue="voice" className="mt-4">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="voice">Voice Input</TabsTrigger>
            <TabsTrigger value="text">Text Input</TabsTrigger>
            <TabsTrigger value="output">Generated Output</TabsTrigger>
          </TabsList>

          {/* Voice Input Tab */}
          <TabsContent value="voice" className="space-y-4">
            {transcript && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Transcription</Label>
                  <Button variant="ghost" size="sm" onClick={() => copyToClipboard(transcript)}>
                    <Copy className="h-4 w-4 mr-1" /> Copy
                  </Button>
                </div>
                <Textarea 
                  value={transcript} 
                  readOnly 
                  className="min-h-[100px] bg-muted"
                  placeholder="Transcribed text will appear here..."
                />
              </div>
            )}

            {normalizedText && normalizedText !== transcript && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-1">
                    <Sparkles className="h-4 w-4" />
                    Normalized Text
                  </Label>
                  <Button variant="ghost" size="sm" onClick={() => copyToClipboard(normalizedText)}>
                    <Copy className="h-4 w-4 mr-1" /> Copy
                  </Button>
                </div>
                <Textarea 
                  value={normalizedText} 
                  readOnly 
                  className="min-h-[100px]"
                />
              </div>
            )}
          </TabsContent>

          {/* Text Input Tab */}
          <TabsContent value="text" className="space-y-4">
            <div className="space-y-2">
              <Label>Manual Dictation Input</Label>
              <Textarea
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                placeholder="Type or paste your consultation notes here...
Example: Patient naam Ravi, 35 saal, male. Bukhar aur sardard teen din se. Paracetamol 650mg teen baar khana ke baad dena hai."
                className="min-h-[150px]"
              />
              <Button 
                onClick={processManualInput}
                disabled={!manualInput.trim() || processingStage !== 'idle' && processingStage !== 'complete' && processingStage !== 'error'}
                className="w-full"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Generate {DOCUMENT_TYPES.find(d => d.value === documentType)?.label}
              </Button>
            </div>
          </TabsContent>

          {/* Output Tab */}
          <TabsContent value="output" className="space-y-4">
            {generatedDocument ? (
              <div className="space-y-4">
                {/* Formatted Text */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-1">
                      <FileText className="h-4 w-4" />
                      Generated {DOCUMENT_TYPES.find(d => d.value === documentType)?.label}
                    </Label>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => copyToClipboard(generatedDocument.formatted_text)}>
                        <Copy className="h-4 w-4 mr-1" /> Copy
                      </Button>
                      <Button variant="ghost" size="sm" onClick={downloadGeneratedDocument}>
                        <Download className="h-4 w-4 mr-1" /> Download
                      </Button>
                    </div>
                  </div>
                  <ScrollArea className="h-[300px] border rounded-md p-4 bg-white">
                    <pre className="whitespace-pre-wrap text-sm font-mono">
                      {generatedDocument.formatted_text}
                    </pre>
                  </ScrollArea>
                </div>

                {/* Structured Data Preview */}
                {generatedDocument.structured_data && (
                  <div className="space-y-2">
                    <Label>Extracted Data</Label>
                    <div className="grid gap-2 text-sm">
                      {generatedDocument.structured_data.chiefComplaints && (
                        <div className="flex gap-2">
                          <Badge variant="outline">Chief Complaints</Badge>
                          <span>{generatedDocument.structured_data.chiefComplaints}</span>
                        </div>
                      )}
                      {generatedDocument.structured_data.diagnosis && (
                        <div className="flex gap-2">
                          <Badge variant="outline">Diagnosis</Badge>
                          <span>{generatedDocument.structured_data.diagnosis}</span>
                        </div>
                      )}
                      {generatedDocument.structured_data.medications?.length > 0 && (
                        <div>
                          <Badge variant="outline" className="mb-2">Medications ({generatedDocument.structured_data.medications.length})</Badge>
                          <ul className="list-disc list-inside space-y-1 ml-2">
                            {generatedDocument.structured_data.medications.map((med, i) => (
                              <li key={i}>
                                <strong>{med.name}</strong> {med.dosage} - {med.frequency} × {med.duration}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Use in Prescription Button */}
                {onPrescriptionGenerated && generatedDocument.structured_data && (
                  <Button 
                    onClick={() => onPrescriptionGenerated(generatedDocument.structured_data)}
                    className="w-full"
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Import to Prescription
                  </Button>
                )}
              </div>
            ) : (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>No output yet</AlertTitle>
                <AlertDescription>
                  Record a consultation or enter text to generate a {DOCUMENT_TYPES.find(d => d.value === documentType)?.label?.toLowerCase()}.
                </AlertDescription>
              </Alert>
            )}
          </TabsContent>
        </Tabs>

        {/* Service unavailable warning */}
        {serviceStatus === 'offline' && (
          <Alert variant="destructive" className="mt-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Service Unavailable</AlertTitle>
            <AlertDescription>
              The offline scribe service is not running. Start it with:
              <code className="block mt-2 p-2 bg-muted rounded text-xs">
                cd offline_scribe && python main.py
              </code>
            </AlertDescription>
          </Alert>
        )}

        {/* Recording error warning */}
        {recordingError && (
          <Alert variant="destructive" className="mt-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Recorder Error</AlertTitle>
            <AlertDescription>{recordingError}</AlertDescription>
          </Alert>
        )}

        {/* Recording not supported warning */}
        {!isRecordingSupported && (
          <Alert variant="destructive" className="mt-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Recording Not Supported</AlertTitle>
            <AlertDescription>
              Audio recording is not supported in this browser. Please use Chrome, Firefox, or Edge.
              You can still use the Text Input tab for manual entry.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
};

export default OfflineScribePanel;
