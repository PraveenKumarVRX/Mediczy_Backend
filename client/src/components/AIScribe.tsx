import { useState, useEffect, useRef } from "react";
import { Mic, MicOff, Loader2, Sparkles, Volume2, VolumeX, Zap, Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import axios from "axios";

interface AIScribeProps {
  onTranscript: (text: string, field: string) => void;
  onSuggestion: (suggestion: any) => void;
  context?: string;
  currentField?: string;
}

interface Recognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: (event: any) => void;
  onerror: (event: any) => void;
  onend: () => void;
}

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

const AIScribe: React.FC<AIScribeProps> = ({ 
  onTranscript, 
  onSuggestion, 
  context = "general",
  currentField = "diagnosis"
}) => {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [isSupported, setIsSupported] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  
  const recognitionRef = useRef<Recognition | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    // Check if speech recognition is supported
    if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
      setIsSupported(true);
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition() as Recognition;
      
      const recognition = recognitionRef.current;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        let interim = '';
        let final = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcriptPiece = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            final += transcriptPiece + ' ';
          } else {
            interim += transcriptPiece;
          }
        }

        setInterimTranscript(interim);
        
        if (final) {
          const newTranscript = transcript + final;
          setTranscript(newTranscript);
          processWithAI(final, currentField);
        }
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'no-speech') {
          toast({
            title: "No speech detected",
            description: "Please try speaking again.",
            variant: "destructive",
          });
        }
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
        setInterimTranscript("");
      };
    }
  }, [transcript, currentField]);

  const processWithAI = async (text: string, field: string) => {
    setIsProcessing(true);
    try {
      // Send to AI for processing and suggestions
      const response = await axios.post('/api/ai/scribe', {
        text,
        field,
        context
      });

      if (response.data.processedText) {
        onTranscript(response.data.processedText, field);
      }

      if (response.data.suggestions) {
        setSuggestions(response.data.suggestions);
        onSuggestion(response.data);
      }

      // Generate smart suggestions based on field
      generateSmartSuggestions(text, field);
    } catch (error) {
      console.error('AI processing error:', error);
      // Fallback to direct transcript
      onTranscript(text, field);
    } finally {
      setIsProcessing(false);
    }
  };

  const generateSmartSuggestions = (text: string, field: string) => {
    // Client-side smart suggestions based on medical context
    const lowerText = text.toLowerCase();
    const newSuggestions: string[] = [];

    if (field === 'diagnosis') {
      // Common diagnosis patterns
      if (lowerText.includes('fever') || lowerText.includes('temperature')) {
        newSuggestions.push('Viral Fever', 'Typhoid Fever', 'Dengue Fever');
      }
      if (lowerText.includes('cough') || lowerText.includes('cold')) {
        newSuggestions.push('Upper Respiratory Tract Infection', 'Bronchitis', 'Common Cold');
      }
      if (lowerText.includes('pain') && lowerText.includes('stomach')) {
        newSuggestions.push('Gastritis', 'Peptic Ulcer', 'Dyspepsia');
      }
      if (lowerText.includes('headache')) {
        newSuggestions.push('Migraine', 'Tension Headache', 'Cluster Headache');
      }
    } else if (field === 'medications') {
      // Common medication suggestions
      if (lowerText.includes('fever') || lowerText.includes('pain')) {
        newSuggestions.push('Paracetamol 500mg', 'Ibuprofen 400mg', 'Diclofenac 50mg');
      }
      if (lowerText.includes('antibiotic')) {
        newSuggestions.push('Amoxicillin 500mg', 'Azithromycin 500mg', 'Ciprofloxacin 500mg');
      }
      if (lowerText.includes('acidity') || lowerText.includes('gastric')) {
        newSuggestions.push('Pantoprazole 40mg', 'Omeprazole 20mg', 'Ranitidine 150mg');
      }
    }

    if (newSuggestions.length > 0) {
      setSuggestions(newSuggestions);
    }
  };

  const toggleListening = () => {
    if (!recognitionRef.current) return;

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
        toast({
          title: "AI Scribe Active",
          description: "Speak naturally, I'm listening...",
        });
      } catch (error) {
        console.error('Error starting recognition:', error);
        toast({
          title: "Error",
          description: "Could not start voice recognition",
          variant: "destructive",
        });
      }
    }
  };

  const speakText = (text: string) => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      utterance.pitch = 1;
      utterance.volume = 1;
      
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      
      window.speechSynthesis.speak(utterance);
    }
  };

  const stopSpeaking = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  };

  const clearTranscript = () => {
    setTranscript("");
    setInterimTranscript("");
    setSuggestions([]);
  };

  if (!isSupported) {
    return (
      <Card className="p-4 bg-yellow-50 border-yellow-200">
        <p className="text-sm text-yellow-800">
          Voice recognition is not supported in your browser. Please use Chrome, Edge, or Safari.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <Card className="p-4 bg-card border-border">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            <h3 className="font-semibold text-foreground">AI Medical Scribe</h3>
            <Badge variant="secondary" className="bg-primary/10 text-primary">
              <Sparkles className="h-3 w-3 mr-1" />
              AI Powered
            </Badge>
          </div>
          <div className="flex gap-2">
            {isSpeaking ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={stopSpeaking}
                className="text-orange-600 hover:text-orange-700"
              >
                <VolumeX className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => transcript && speakText(transcript)}
                disabled={!transcript}
                className="text-blue-600 hover:text-blue-700"
              >
                <Volume2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            onClick={toggleListening}
            className={`
              relative flex-shrink-0 w-12 h-12 rounded-full transition-all duration-300
              ${isListening 
                ? 'bg-red-500 hover:bg-red-600 animate-pulse' 
                : 'bg-purple-600 hover:bg-purple-700'
              }
            `}
          >
            {isListening ? (
              <MicOff className="h-5 w-5 text-white" />
            ) : (
              <Mic className="h-5 w-5 text-white" />
            )}
          </Button>

          <div className="flex-1">
            <p className="text-sm text-muted-foreground mb-1">
              {isListening ? (
                <span className="flex items-center gap-2 text-red-600 font-medium">
                  <span className="w-2 h-2 bg-red-600 rounded-full animate-pulse" />
                  Recording... Speak now
                </span>
              ) : (
                <span className="text-muted-foreground">Click microphone to start dictation</span>
              )}
            </p>
            
            {(transcript || interimTranscript) && (
              <div className="bg-card rounded-lg p-3 border border-border">
                <p className="text-sm">
                  {transcript}
                  {interimTranscript && (
                    <span className="text-muted-foreground italic">{interimTranscript}</span>
                  )}
                </p>
              </div>
            )}
          </div>

          {isProcessing && (
            <Loader2 className="h-5 w-5 text-purple-600 animate-spin" />
          )}
        </div>

        {transcript && (
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={clearTranscript}
              className="text-xs"
            >
              Clear
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onTranscript(transcript, currentField)}
              className="text-xs bg-purple-50 border-purple-200 hover:bg-purple-100"
            >
              <Zap className="h-3 w-3 mr-1" />
              Apply to {currentField}
            </Button>
          </div>
        )}
      </Card>

      {/* AI Suggestions */}
      {suggestions.length > 0 && (
        <Card className="p-3 bg-muted/50 border-border">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h4 className="text-sm font-semibold text-foreground">AI Suggestions</h4>
          </div>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((suggestion, index) => (
              <Badge
                key={index}
                variant="outline"
                className="cursor-pointer hover:bg-muted transition-colors bg-card border-border text-foreground"
                onClick={() => onTranscript(suggestion, currentField)}
              >
                {suggestion}
              </Badge>
            ))}
          </div>
        </Card>
      )}

      {/* Quick Commands */}
      <Card className="p-3 bg-muted/40">
        <details>
          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground font-medium">
            💡 Voice Commands Help
          </summary>
          <div className="mt-2 space-y-1 text-xs text-muted-foreground">
            <p>• Say "new paragraph" to add a line break</p>
            <p>• Say "comma" or "period" for punctuation</p>
            <p>• Say "clear" to clear the transcript</p>
            <p>• Say medical terms naturally, AI will format them</p>
            <p>• Field: <strong>{currentField}</strong> - AI is contextually aware</p>
          </div>
        </details>
      </Card>
    </div>
  );
};

export default AIScribe;
