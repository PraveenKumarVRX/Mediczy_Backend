import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { 
  Brain, 
  Mic, 
  MicOff, 
  Sparkles, 
  Loader2,
  Wand2,
  Copy,
  CheckCircle2,
  Volume2,
  VolumeX,
  Trash2,
  Plus
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import api from '@/utils/api';

interface Medication {
  name: string;
  composition?: string;
  dosage: string;
  frequency: string;
  duration: string;
  quantity?: string;
  instructions: string;
}

interface PrescriptionData {
  chiefComplaints?: string;
  diagnosis?: string;
  medications: Medication[];
  instructions: string[];
  labTests: string[];
  notes?: string;
}

interface AIScribePrescriptionProps {
  onPrescriptionGenerated: (prescription: PrescriptionData) => void;
  currentData?: Partial<PrescriptionData>;
}

const AIScribePrescription: React.FC<AIScribePrescriptionProps> = ({ 
  onPrescriptionGenerated,
  currentData = {}
}) => {
  const { toast } = useToast();
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [recognition, setRecognition] = useState<any>(null);
  const [sessionNotes, setSessionNotes] = useState<string[]>([]);

  // Initialize speech recognition
  React.useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      const recognitionInstance = new SpeechRecognition();
      recognitionInstance.continuous = true;
      recognitionInstance.interimResults = true;
      recognitionInstance.lang = 'en-IN';

      recognitionInstance.onresult = (event: any) => {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcriptPiece = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcriptPiece + ' ';
          } else {
            interimTranscript += transcriptPiece;
          }
        }

        if (finalTranscript) {
          setTranscript(prev => prev + finalTranscript);
          setSessionNotes(prev => [...prev, finalTranscript.trim()]);
        }
      };

      recognitionInstance.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };

      recognitionInstance.onend = () => {
        if (isListening) {
          recognitionInstance.start();
        }
      };

      setRecognition(recognitionInstance);
    }
  }, [isListening]);

  const startListening = () => {
    if (recognition) {
      recognition.start();
      setIsListening(true);
      toast({
        title: "🎤 Listening...",
        description: "Start speaking your consultation notes",
      });
    }
  };

  const stopListening = () => {
    if (recognition) {
      recognition.stop();
      setIsListening(false);
    }
  };

  const speakText = (text: string) => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      utterance.pitch = 1;
      utterance.lang = 'en-IN';
      utterance.onend = () => setIsSpeaking(false);
      setIsSpeaking(true);
      window.speechSynthesis.speak(utterance);
    }
  };

  const stopSpeaking = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  };

  const generatePrescription = async () => {
    if (!transcript.trim()) {
      toast({
        variant: "destructive",
        title: "No consultation notes",
        description: "Please record some consultation notes first",
      });
      return;
    }

    setIsProcessing(true);
    try {
      const response = await api.post('/api/ai/generate-prescription', {
        consultationNotes: transcript,
        sessionNotes: sessionNotes,
        existingData: currentData
      });

      if (response.data.success) {
        const prescription = response.data.prescription;
        onPrescriptionGenerated(prescription);
        
        toast({
          title: "✅ Prescription Generated",
          description: "AI has generated a structured prescription from your notes",
        });

        // Speak summary
        const summary = `Prescription generated. Diagnosis: ${prescription.diagnosis}. ${prescription.medications.length} medications prescribed.`;
        speakText(summary);
      }
    } catch (error: any) {
      console.error('Prescription generation error:', error);
      toast({
        variant: "destructive",
        title: "Generation failed",
        description: error.response?.data?.message || "Failed to generate prescription",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const copyTranscript = () => {
    navigator.clipboard.writeText(transcript);
    toast({
      title: "Copied!",
      description: "Transcript copied to clipboard",
    });
  };

  const clearTranscript = () => {
    setTranscript('');
    setSessionNotes([]);
    toast({
      title: "Cleared",
      description: "Consultation notes cleared",
    });
  };

  return (
    <div className="space-y-4">
      <Card className="p-6 bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50 border-purple-200">
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-600 rounded-lg">
                <Brain className="h-6 w-6 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-purple-900">AI Medical Scribe</h3>
                <p className="text-sm text-purple-700">Speak naturally, AI generates prescription</p>
              </div>
            </div>
            <Badge variant="secondary" className="bg-purple-600 text-white">
              <Sparkles className="h-3 w-3 mr-1" />
              AI Powered
            </Badge>
          </div>

          {/* Recording Controls */}
          <div className="flex gap-3">
            {!isListening ? (
              <Button
                onClick={startListening}
                className="flex-1 bg-purple-600 hover:bg-purple-700"
                disabled={isProcessing}
              >
                <Mic className="h-4 w-4 mr-2" />
                Start Recording Consultation
              </Button>
            ) : (
              <Button
                onClick={stopListening}
                variant="destructive"
                className="flex-1"
              >
                <MicOff className="h-4 w-4 mr-2" />
                Stop Recording
              </Button>
            )}

            <Button
              onClick={generatePrescription}
              disabled={!transcript.trim() || isProcessing}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4 mr-2" />
                  Generate Prescription
                </>
              )}
            </Button>
          </div>

          {/* Live Status */}
          {isListening && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                <span className="text-sm font-medium text-red-700">Recording in progress...</span>
              </div>
            </div>
          )}

          {/* Transcript Area */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold text-purple-900">Consultation Transcript</Label>
              <div className="flex gap-2">
                {transcript && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={copyTranscript}
                      className="h-8"
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                    {isSpeaking ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={stopSpeaking}
                        className="h-8 text-orange-600"
                      >
                        <VolumeX className="h-3 w-3" />
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => speakText(transcript)}
                        className="h-8 text-blue-600"
                      >
                        <Volume2 className="h-3 w-3" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearTranscript}
                      className="h-8 text-red-600"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </>
                )}
              </div>
            </div>
            <Textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Your consultation notes will appear here as you speak... You can also type directly."
              className="min-h-[200px] bg-white border-purple-200 focus:border-purple-400"
              rows={10}
            />
            <p className="text-xs text-purple-600">
              💡 Speak naturally about symptoms, diagnosis, and treatment. AI will structure it into a proper prescription.
            </p>
          </div>

          {/* Session Notes Preview */}
          {sessionNotes.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-purple-900">Session Notes ({sessionNotes.length})</Label>
              <div className="max-h-32 overflow-y-auto space-y-1 p-3 bg-white rounded-lg border border-purple-100">
                {sessionNotes.slice(-5).map((note, index) => (
                  <div key={index} className="text-xs text-gray-700 p-1 border-b border-gray-100 last:border-0">
                    • {note}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick Tips */}
          <Card className="p-3 bg-blue-50 border-blue-200">
            <details>
              <summary className="text-sm font-medium text-blue-900 cursor-pointer">
                💡 Voice Commands & Tips
              </summary>
              <div className="mt-2 space-y-1 text-xs text-blue-800">
                <p>• Say "Patient complains of..." for chief complaints</p>
                <p>• Say "Diagnosed with..." for diagnosis</p>
                <p>• Say "Prescribe..." for medications</p>
                <p>• Say "Lab tests include..." for investigations</p>
                <p>• Say "Instructions: ..." for patient instructions</p>
                <p>• AI will automatically structure your speech into prescription format</p>
              </div>
            </details>
          </Card>
        </div>
      </Card>
    </div>
  );
};

export default AIScribePrescription;
