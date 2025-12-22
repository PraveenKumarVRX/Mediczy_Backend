import React, { useState, useRef, useEffect } from 'react';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Download,
  Clock,
  Calendar,
  FileVideo,
  Loader2
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import api from '@/utils/api';
import { format } from 'date-fns';

interface Recording {
  id: number;
  recordingId: string;
  fileName: string;
  fileSize: number;
  duration: number;
  format: string;
  quality: string;
  startTime: string;
  endTime: string;
  createdAt: string;
}

interface ConsultationRecordingPlayerProps {
  appointmentId: number;
}

const ConsultationRecordingPlayer: React.FC<ConsultationRecordingPlayerProps> = ({
  appointmentId
}) => {
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [selectedRecording, setSelectedRecording] = useState<Recording | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    fetchRecordings();
  }, [appointmentId]);

  useEffect(() => {
    if (videoRef.current) {
      const video = videoRef.current;

      const handleTimeUpdate = () => setCurrentTime(video.currentTime);
      const handleLoadedMetadata = () => setDuration(video.duration);
      const handlePlay = () => setIsPlaying(true);
      const handlePause = () => setIsPlaying(false);

      video.addEventListener('timeupdate', handleTimeUpdate);
      video.addEventListener('loadedmetadata', handleLoadedMetadata);
      video.addEventListener('play', handlePlay);
      video.addEventListener('pause', handlePause);

      return () => {
        video.removeEventListener('timeupdate', handleTimeUpdate);
        video.removeEventListener('loadedmetadata', handleLoadedMetadata);
        video.removeEventListener('play', handlePlay);
        video.removeEventListener('pause', handlePause);
      };
    }
  }, [selectedRecording]);

  const fetchRecordings = async () => {
    try {
      setIsLoading(true);
      const response = await api.get(`/recordings/appointment/${appointmentId}`);
      
      if (response.data.success) {
        setRecordings(response.data.recordings);
        if (response.data.recordings.length > 0) {
          setSelectedRecording(response.data.recordings[0]);
        }
      }
    } catch (error: any) {
      console.error('Fetch recordings error:', error);
      toast({
        variant: "destructive",
        title: "Failed to load recordings",
        description: error.response?.data?.message || "Please try again later",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const togglePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const toggleFullscreen = () => {
    if (videoRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        videoRef.current.requestFullscreen();
      }
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const downloadRecording = async (recording: Recording) => {
    try {
      setIsDownloading(true);
      const response = await api.get(`/recordings/download/${recording.recordingId}`, {
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', recording.fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      toast({
        title: "Download started",
        description: `Downloading ${recording.fileName}`,
      });
    } catch (error: any) {
      console.error('Download error:', error);
      toast({
        variant: "destructive",
        title: "Download failed",
        description: error.response?.data?.message || "Failed to download recording",
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  };

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
        </div>
      </Card>
    );
  }

  if (recordings.length === 0) {
    return (
      <Card className="p-6">
        <div className="text-center py-12">
          <FileVideo className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">No recordings available for this consultation</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Video Player */}
      {selectedRecording && (
        <Card className="p-4 bg-black">
          <div className="relative">
            <video
              ref={videoRef}
              className="w-full rounded-lg"
              src={`${api.defaults.baseURL}/recordings/stream/${selectedRecording.recordingId}`}
              poster="/video-placeholder.jpg"
            />

            {/* Video Controls */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
              {/* Progress Bar */}
              <input
                type="range"
                min="0"
                max={duration || 0}
                value={currentTime}
                onChange={handleSeek}
                className="w-full mb-3 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #8B5CF6 0%, #8B5CF6 ${(currentTime / duration) * 100}%, #4B5563 ${(currentTime / duration) * 100}%, #4B5563 100%)`
                }}
              />

              {/* Controls */}
              <div className="flex items-center justify-between text-white">
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={togglePlayPause}
                    className="text-white hover:bg-white/20"
                  >
                    {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={toggleMute}
                    className="text-white hover:bg-white/20"
                  >
                    {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                  </Button>

                  <span className="text-sm">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="bg-purple-600 text-white">
                    {selectedRecording.quality}
                  </Badge>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={toggleFullscreen}
                    className="text-white hover:bg-white/20"
                  >
                    <Maximize className="h-5 w-5" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Recording Info & List */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Recording Details */}
        {selectedRecording && (
          <Card className="p-4">
            <h3 className="font-semibold mb-3">Recording Details</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-gray-600">
                <Calendar className="h-4 w-4" />
                <span>{format(new Date(selectedRecording.startTime), 'PPP')}</span>
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                <Clock className="h-4 w-4" />
                <span>{format(new Date(selectedRecording.startTime), 'p')} - {format(new Date(selectedRecording.endTime), 'p')}</span>
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                <FileVideo className="h-4 w-4" />
                <span>{formatFileSize(selectedRecording.fileSize)}</span>
              </div>
            </div>

            <Button
              onClick={() => downloadRecording(selectedRecording)}
              disabled={isDownloading}
              className="w-full mt-4 bg-purple-600 hover:bg-purple-700"
            >
              {isDownloading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Downloading...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Download Recording
                </>
              )}
            </Button>
          </Card>
        )}

        {/* Other Recordings */}
        {recordings.length > 1 && (
          <Card className="p-4">
            <h3 className="font-semibold mb-3">All Recordings ({recordings.length})</h3>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {recordings.map((recording) => (
                <div
                  key={recording.id}
                  onClick={() => setSelectedRecording(recording)}
                  className={`p-3 rounded-lg cursor-pointer transition-colors ${
                    selectedRecording?.id === recording.id
                      ? 'bg-purple-100 border border-purple-300'
                      : 'bg-gray-50 hover:bg-gray-100'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="text-sm font-medium">
                        {format(new Date(recording.startTime), 'PPP')}
                      </p>
                      <p className="text-xs text-gray-600">
                        {formatTime(recording.duration)} • {formatFileSize(recording.fileSize)}
                      </p>
                    </div>
                    <Badge variant="outline">{recording.quality}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};

export default ConsultationRecordingPlayer;
