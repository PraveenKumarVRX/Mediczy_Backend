'use client';

import React, { useRef, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';

interface Medication {
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions?: string;
}

interface GeneratedPrescription {
  chiefComplaints: string[];
  diagnosis: string;
  medications: Medication[];
  labTests: string[];
  instructions: string[];
  notes: string;
}

interface AutocompleteSuggestion {
  text: string;
  category: string;
  full: string;
  type: string;
  icd10?: string;
  cimsId?: string;
}

interface AIScribeConsultationProps {
  onPrescriptionGenerated?: (prescription: GeneratedPrescription) => void;
  currentFormData?: any;
  appointmentId?: string;
}

export const AIScribeConsultation: React.FC<AIScribeConsultationProps> = ({
  onPrescriptionGenerated,
  currentFormData,
  appointmentId,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [generatedPrescription, setGeneratedPrescription] = useState<GeneratedPrescription | null>(null);
  const [interimTranscript, setInterimTranscript] = useState('');

  // Autocomplete state
  const [manualInput, setManualInput] = useState('');
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);

  const recognitionRef = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Initialize Web Speech API
  useEffect(() => {
    // Use webkit prefix for Chrome/Safari
    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;

    if (!SpeechRecognition) {
      console.warn('Speech Recognition not supported in this browser');
      toast({
        title: 'Not Supported',
        description: 'Voice recognition not available. Please use Chrome or Edge.',
        variant: 'destructive',
      });
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.language = 'en-IN'; // Indian English

    recognition.onstart = () => {
      console.log('🎤 Voice recording started');
      setIsRecording(true);
    };

    recognition.onresult = (event: any) => {
      let interim = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcriptPart = event.results[i][0].transcript;

        if (event.results[i].isFinal) {
          // Add final transcript
          setTranscript((prev) => prev + ' ' + transcriptPart);
        } else {
          // Accumulate interim results
          interim += transcriptPart;
        }
      }

      setInterimTranscript(interim);
    };

    recognition.onerror = (event: any) => {
      console.error('🎤 Speech recognition error:', event.error);

      let errorMessage = `Microphone error: ${event.error}`;
      if (event.error === 'no-speech') {
        errorMessage = 'No speech detected. Please try speaking again.';
      } else if (event.error === 'audio-capture') {
        errorMessage = 'No microphone found. Please check permissions.';
      } else if (event.error === 'network') {
        errorMessage = 'Network error. Check internet connection.';
      }

      toast({
        title: '🎤 Recording Error',
        description: errorMessage,
        variant: 'destructive',
      });

      setIsRecording(false);
    };

    recognition.onend = () => {
      console.log('🎤 Voice recording stopped');
      setIsRecording(false);
      setInterimTranscript('');
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, [toast]);

  // Toggle voice recording
  const toggleRecording = () => {
    if (!recognitionRef.current) {
      toast({
        title: 'Not Available',
        description: 'Voice recognition not supported in your browser',
        variant: 'destructive',
      });
      return;
    }

    if (isRecording) {
      recognitionRef.current.stop();
      setIsRecording(false);
    } else {
      setTranscript('');
      setInterimTranscript('');
      recognitionRef.current.start();
    }
  };

  // Generate prescription from transcript
  const generatePrescription = async () => {
    if (!transcript.trim()) {
      toast({
        title: 'No Notes',
        description: 'Please record consultation notes first',
        variant: 'destructive',
      });
      return;
    }

    setIsProcessing(true);

    try {
      const response = await fetch('/api/ai/scribe/generate-prescription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken') || ''}`,
        },
        body: JSON.stringify({
          consultationNotes: transcript,
          currentData: currentFormData,
          appointmentId,
          saveToDatabase: false,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.message || 'Failed to generate prescription');
      }

      const result = await response.json();

      if (!result.success || !result.prescription) {
        throw new Error(result.message || 'Prescription generation failed');
      }

      setGeneratedPrescription(result.prescription);

      toast({
        title: '✨ Generated',
        description: 'AI prescription created from consultation notes',
      });

      onPrescriptionGenerated?.(result.prescription);
    } catch (error) {
      console.error('Prescription generation error:', error);
      toast({
        title: 'Generation Failed',
        description: error instanceof Error ? error.message : 'Failed to generate prescription',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Copy transcript to clipboard
  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(transcript);
      toast({
        title: 'Copied',
        description: 'Transcript copied to clipboard',
      });
    } catch (error) {
      toast({
        title: 'Copy Failed',
        description: 'Failed to copy to clipboard',
        variant: 'destructive',
      });
    }
  };

  // Autocomplete: Fetch suggestions
  const fetchSuggestions = async (query: string) => {
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }

    try {
      const response = await fetch(`/api/ai/scribe/autocomplete?q=${encodeURIComponent(query)}&limit=8`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken') || ''}`,
        },
      });

      const data = await response.json();
      if (data.success && data.suggestions) {
        setSuggestions(data.suggestions);
        setShowSuggestions(true);
        setSelectedSuggestionIndex(-1);
      }
    } catch (error) {
      console.error('Autocomplete fetch error:', error);
      setSuggestions([]);
    }
  };

  // Autocomplete: Handle input change with debounce
  const handleManualInputChange = (value: string) => {
    setManualInput(value);
    
    // Call autocomplete after typing pauses
    const timer = setTimeout(() => {
      fetchSuggestions(value);
    }, 300);

    return () => clearTimeout(timer);
  };

  // Autocomplete: Handle suggestion selection
  const selectSuggestion = (suggestion: AutocompleteSuggestion) => {
    const updatedTranscript = transcript + (transcript ? ' ' : '') + suggestion.text;
    setTranscript(updatedTranscript);
    setManualInput('');
    setSuggestions([]);
    setShowSuggestions(false);

    toast({
      title: '✓ Added',
      description: `${suggestion.category}: ${suggestion.text}`,
    });
  };

  // Autocomplete: Handle keyboard navigation
  const handleSuggestionKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedSuggestionIndex(Math.min(selectedSuggestionIndex + 1, suggestions.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedSuggestionIndex(Math.max(selectedSuggestionIndex - 1, -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedSuggestionIndex >= 0) {
          selectSuggestion(suggestions[selectedSuggestionIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setShowSuggestions(false);
        break;
      default:
        break;
    }
  };

  // Clear transcript
  const clearTranscript = () => {
    setTranscript('');
    setInterimTranscript('');
    setGeneratedPrescription(null);
    setManualInput('');
    setSuggestions([]);
  };

  return (
    <div className="space-y-4 p-4 bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg border-2 border-blue-200 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold flex items-center gap-2 text-blue-900">
          🎙️ AI Medical Scribe
          {isRecording && (
            <span className="flex items-center gap-1 ml-auto">
              <span className="animate-pulse text-red-500">●</span>
              <span className="text-xs font-normal text-red-600">Recording</span>
            </span>
          )}
        </h3>
      </div>

      {/* Description */}
      <p className="text-xs text-gray-600">
        🎤 Speak consultation notes naturally. AI will transcribe and generate a prescription.
      </p>

      {/* Transcript Display */}
      <div className="bg-white p-3 rounded-lg border border-blue-100 min-h-24 max-h-32 overflow-y-auto scroll-smooth">
        {transcript ? (
          <div className="space-y-1">
            <p className="text-sm text-gray-800 leading-relaxed">{transcript}</p>
            {interimTranscript && (
              <p className="text-sm text-gray-400 italic">{interimTranscript}</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-400 italic text-center py-8">
            🎤 Click "Record" and speak your consultation notes...
          </p>
        )}
      </div>

      {/* Word Count */}
      {transcript && (
        <div className="text-xs text-gray-500 text-right">
          {transcript.split(/\s+/).length} words
        </div>
      )}

      {/* Manual Input with Autocomplete */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-gray-700">
          ➕ Add Medical Terms (Diagnoses, Drugs, Tests, Instructions)
        </label>
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={manualInput}
            onChange={(e) => handleManualInputChange(e.target.value)}
            onKeyDown={handleSuggestionKeyDown}
            placeholder="Type diagnosis, drug name, lab test, abbreviation... (min 2 chars)"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200"
          />
          
          {/* Autocomplete Suggestions Dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <div
              ref={suggestionsRef}
              className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded shadow-lg z-50 max-h-48 overflow-y-auto"
            >
              {suggestions.map((suggestion, index) => (
                <div
                  key={`${suggestion.type}-${suggestion.text}-${index}`}
                  onClick={() => selectSuggestion(suggestion)}
                  className={`px-3 py-2 border-b border-gray-100 cursor-pointer transition-colors ${
                    index === selectedSuggestionIndex
                      ? 'bg-blue-100 border-l-4 border-l-blue-500'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-gray-900 truncate">
                        {suggestion.text}
                      </div>
                      <div className="text-xs text-gray-600">
                        {suggestion.category}
                      </div>
                      {suggestion.full && suggestion.type === 'abbreviation' && (
                        <div className="text-xs text-blue-600 font-semibold">
                          {suggestion.full}
                        </div>
                      )}
                      {suggestion.icd10 && suggestion.type === 'diagnosis' && (
                        <div className="text-xs text-green-600">
                          ICD-10: {suggestion.icd10}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {suggestions.length === 0 && (
                <div className="px-3 py-2 text-xs text-gray-500 italic">
                  No suggestions found
                </div>
              )}
            </div>
          )}

          {/* Empty State */}
          {manualInput && !showSuggestions && !isProcessing && (
            <div className="text-xs text-gray-400 px-3 py-1 mt-1">
              Type at least 2 characters to see suggestions
            </div>
          )}
        </div>
      </div>

      {/* Control Buttons - Row 1 */}
      <div className="grid grid-cols-3 gap-2">
        <Button
          onClick={toggleRecording}
          disabled={isProcessing}
          className={`font-medium transition-all ${
            isRecording
              ? 'bg-red-500 hover:bg-red-600 animate-pulse'
              : 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700'
          } text-white`}
          title={isRecording ? 'Stop recording' : 'Start voice recording'}
        >
          {isRecording ? '⏹️ Stop' : '🎤 Record'}
        </Button>

        <Button
          onClick={clearTranscript}
          disabled={(!transcript && !generatedPrescription) || isProcessing}
          className="bg-gray-500 hover:bg-gray-600 text-white font-medium"
          title="Clear all text and results"
        >
          🗑️ Clear
        </Button>

        <Button
          onClick={copyToClipboard}
          disabled={!transcript || isProcessing}
          className="bg-gray-500 hover:bg-gray-600 text-white font-medium"
          title="Copy transcript to clipboard"
        >
          📋 Copy
        </Button>
      </div>

      {/* Control Buttons - Row 2 */}
      <Button
        onClick={generatePrescription}
        disabled={!transcript || isProcessing}
        className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-bold py-2"
        title="Generate prescription from transcript using AI"
      >
        {isProcessing ? (
          <>
            <span className="animate-spin mr-2">⏳</span>
            Generating Prescription...
          </>
        ) : (
          <>
            ✨ Generate Prescription
          </>
        )}
      </Button>

      {/* Generated Prescription Preview */}
      {generatedPrescription && (
        <div className="bg-white p-4 rounded-lg border-2 border-green-300 space-y-3 shadow-sm">
          <div className="flex items-center gap-2 text-green-700 font-semibold mb-2">
            ✅ Generated Prescription
          </div>

          {/* Chief Complaints */}
          {generatedPrescription.chiefComplaints?.length > 0 && (
            <div className="space-y-1 bg-red-50 p-2 rounded border border-red-200">
              <p className="text-xs font-bold text-red-900 uppercase">Chief Complaints</p>
              <ul className="text-sm space-y-1">
                {generatedPrescription.chiefComplaints.map((complaint, idx) => (
                  <li key={idx} className="text-gray-700 text-xs">
                    • {complaint}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Diagnosis */}
          {generatedPrescription.diagnosis && (
            <div className="space-y-1 bg-orange-50 p-2 rounded border border-orange-200">
              <p className="text-xs font-bold text-orange-900 uppercase">Diagnosis</p>
              <p className="text-sm text-gray-700">{generatedPrescription.diagnosis}</p>
            </div>
          )}

          {/* Medications */}
          {generatedPrescription.medications?.length > 0 && (
            <div className="space-y-1 bg-blue-50 p-2 rounded border border-blue-200">
              <p className="text-xs font-bold text-blue-900 uppercase">💊 Medications</p>
              <ul className="text-sm space-y-1">
                {generatedPrescription.medications.map((med, idx) => (
                  <li key={idx} className="text-gray-700 text-xs">
                    <span className="font-semibold">{med.name}</span>
                    {' '}
                    <span className="text-gray-600">
                      {med.dosage} • {med.frequency} • {med.duration}
                    </span>
                    {med.instructions && (
                      <div className="text-gray-500 text-xs ml-2">({med.instructions})</div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Lab Tests */}
          {generatedPrescription.labTests?.length > 0 && (
            <div className="space-y-1 bg-purple-50 p-2 rounded border border-purple-200">
              <p className="text-xs font-bold text-purple-900 uppercase">Lab Tests</p>
              <ul className="text-sm space-y-1">
                {generatedPrescription.labTests.map((test, idx) => (
                  <li key={idx} className="text-gray-700 text-xs">
                    • {test}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Instructions */}
          {generatedPrescription.instructions?.length > 0 && (
            <div className="space-y-1 bg-yellow-50 p-2 rounded border border-yellow-200">
              <p className="text-xs font-bold text-yellow-900 uppercase">Patient Instructions</p>
              <ul className="text-sm space-y-1">
                {generatedPrescription.instructions.map((instruction, idx) => (
                  <li key={idx} className="text-gray-700 text-xs">
                    • {instruction}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Additional Notes */}
          {generatedPrescription.notes && (
            <div className="space-y-1 bg-gray-50 p-2 rounded border border-gray-200">
              <p className="text-xs font-bold text-gray-700 uppercase">Additional Notes</p>
              <p className="text-sm text-gray-700">{generatedPrescription.notes}</p>
            </div>
          )}

          {/* Use Prescription Button */}
          <Button
            onClick={() => onPrescriptionGenerated?.(generatedPrescription)}
            className="w-full bg-gradient-to-r from-green-600 to-emerald-700 hover:from-green-700 hover:to-emerald-800 text-white font-bold"
          >
            ✅ Use This Prescription
          </Button>
        </div>
      )}

      {/* Browser Compatibility Info */}
      <div className="bg-amber-50 p-2 rounded border border-amber-200 text-xs text-amber-800">
        <p className="font-semibold mb-1">💡 Browser Support</p>
        <p className="text-amber-700">
          ✅ Chrome • ✅ Edge • ✅ Safari • ❌ Firefox (limited support)
        </p>
      </div>
    </div>
  );
};

export default AIScribeConsultation;
