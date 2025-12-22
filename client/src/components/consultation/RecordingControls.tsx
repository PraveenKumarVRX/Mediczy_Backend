import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import api from '@/utils/api';
import {
  Video,
  Square,
  Clock,
  FileVideo,
  Loader2,
  CheckCircle,
  AlertCircle,
  Eye
} from 'lucide-react';

interface RecordingControlsProps {
  appointmentId: number;
  roomId: string;
  patientId: number;
  onRecordingComplete?: (recording: any) => void;
}

interface Recording {
  id: number;
  status: 'recording' | 'processing' | 'completed' | 'failed';
  startedAt: string;
  endedAt?: string;
  duration?: number;
  transcription?: string;
  aiSummary?: string;
  aiPrescription?: any;
}

const RecordingControls = ({
  appointmentId,
  roomId,
  patientId,
  onRecordingComplete
}: RecordingControlsProps) => {
  const { toast } = useToast();
  const [recording, setRecording] = useState<Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  // Timer for recording duration
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording && recording) {
      const startTime = new Date(recording.startedAt).getTime();
      interval = setInterval(() => {
        const now = Date.now();
        const elapsed = Math.floor((now - startTime) / 1000);
        setElapsedTime(elapsed);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRecording, recording]);

  // Poll recording status when processing
  useEffect(() => {
    let pollInterval: NodeJS.Timeout;
    if (recording && recording.status === 'processing') {
      pollInterval = setInterval(async () => {
        try {
          const response = await api.get(`/consultation-recordings/${recording.id}`);
          const updatedRecording = response.data.recording;
          setRecording(updatedRecording);
          
          if (updatedRecording.status === 'completed') {
            toast({
              title: "🎉 Recording Ready!",
              description: "AI transcription and prescription analysis complete",
            });
            if (onRecordingComplete) {
              onRecordingComplete(updatedRecording);
            }
            clearInterval(pollInterval);
          } else if (updatedRecording.status === 'failed') {
            toast({
              title: "Processing Failed",
              description: "Recording saved but transcription failed",
              variant: "destructive",
            });
            clearInterval(pollInterval);
          }
        } catch (error) {
          console.error('Failed to poll recording status:', error);
        }
      }, 5000); // Poll every 5 seconds
    }
    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [recording, toast, onRecordingComplete]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStartRecording = async () => {
    try {
      setIsLoading(true);
      const response = await api.post('/consultation-recordings/start', {
        appointmentId,
        roomId,
        patientId
      });
      
      setRecording(response.data.recording);
      setIsRecording(true);
      setElapsedTime(0);
      
      toast({
        title: "🔴 Recording Started",
        description: "Consultation is now being recorded",
      });
    } catch (error: any) {
      toast({
        title: "Failed to Start Recording",
        description: error.response?.data?.message || "Could not start recording",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleStopRecording = async () => {
    if (!recording) return;
    
    try {
      setIsLoading(true);
      const response = await api.post(`/consultation-recordings/stop/${recording.id}`);
      
      setRecording(response.data.recording);
      setIsRecording(false);
      
      toast({
        title: "⏹️ Recording Stopped",
        description: "Processing AI transcription and analysis...",
      });
    } catch (error: any) {
      toast({
        title: "Failed to Stop Recording",
        description: error.response?.data?.message || "Could not stop recording",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusBadge = () => {
    if (!recording) return null;
    
    switch (recording.status) {
      case 'recording':
        return (
          <Badge className="bg-red-500 text-white animate-pulse">
            <div className="h-2 w-2 rounded-full bg-white mr-2" />
            Recording
          </Badge>
        );
      case 'processing':
        return (
          <Badge className="bg-blue-500 text-white">
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            Processing
          </Badge>
        );
      case 'completed':
        return (
          <Badge className="bg-green-500 text-white">
            <CheckCircle className="h-3 w-3 mr-1" />
            Completed
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="destructive">
            <AlertCircle className="h-3 w-3 mr-1" />
            Failed
          </Badge>
        );
    }
  };

  return (
    <Card className="border-2">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          {/* Left: Status & Timer */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <FileVideo className="h-5 w-5 text-purple-600" />
              <span className="font-semibold">Consultation Recording</span>
            </div>
            
            {recording && (
              <div className="flex items-center gap-3">
                {getStatusBadge()}
                
                {isRecording && (
                  <div className="flex items-center gap-2 text-red-600 font-mono text-lg">
                    <Clock className="h-4 w-4" />
                    {formatTime(elapsedTime)}
                  </div>
                )}
                
                {recording.duration && !isRecording && (
                  <div className="flex items-center gap-2 text-muted-foreground font-mono">
                    <Clock className="h-4 w-4" />
                    {formatTime(recording.duration)}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right: Controls */}
          <div className="flex items-center gap-2">
            {!isRecording && !recording && (
              <Button
                onClick={handleStartRecording}
                disabled={isLoading}
                className="bg-red-500 hover:bg-red-600 gap-2"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Video className="h-4 w-4" />
                )}
                Start Recording
              </Button>
            )}

            {isRecording && (
              <Button
                onClick={handleStopRecording}
                disabled={isLoading}
                variant="destructive"
                className="gap-2"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Square className="h-4 w-4" />
                )}
                Stop Recording
              </Button>
            )}

            {recording && recording.status === 'completed' && onRecordingComplete && (
              <Button
                onClick={() => onRecordingComplete(recording)}
                variant="outline"
                className="gap-2"
              >
                <Eye className="h-4 w-4" />
                View Results
              </Button>
            )}
          </div>
        </div>

        {/* Processing Progress */}
        {recording && recording.status === 'processing' && (
          <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-center gap-2 text-sm text-blue-700">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="font-medium">AI is analyzing your consultation...</span>
            </div>
            <p className="text-xs text-blue-600 mt-1 ml-6">
              Generating transcription and extracting prescription data
            </p>
          </div>
        )}

        {/* Completed Info */}
        {recording && recording.status === 'completed' && (
          <div className="mt-3 p-3 bg-green-50 rounded-lg border border-green-200">
            <div className="flex items-center gap-2 text-sm text-green-700">
              <CheckCircle className="h-4 w-4" />
              <span className="font-medium">Recording processed successfully!</span>
            </div>
            {recording.aiSummary && (
              <p className="text-xs text-green-600 mt-1 ml-6">
                {recording.aiSummary}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default RecordingControls;
