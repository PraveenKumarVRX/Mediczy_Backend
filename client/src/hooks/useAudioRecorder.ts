/**
 * useAudioRecorder Hook
 * Custom React hook for recording audio using MediaRecorder API
 * Supports WAV format output for offline AI scribe
 */

import { useState, useRef, useCallback, useEffect } from 'react';

export interface AudioRecorderState {
  isRecording: boolean;
  isPaused: boolean;
  recordingTime: number;
  audioBlob: Blob | null;
  audioUrl: string | null;
  error: string | null;
}

export interface UseAudioRecorderReturn extends AudioRecorderState {
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<Blob | null>;
  pauseRecording: () => void;
  resumeRecording: () => void;
  resetRecording: () => void;
  isSupported: boolean;
}

interface UseAudioRecorderOptions {
  maxDuration?: number; // Max recording duration in seconds
  onDataAvailable?: (blob: Blob) => void;
  onError?: (error: string) => void;
  mimeType?: string;
}

export function useAudioRecorder(options: UseAudioRecorderOptions = {}): UseAudioRecorderReturn {
  const {
    maxDuration = 300, // 5 minutes default
    onDataAvailable,
    onError,
    mimeType: preferredMimeType,
  } = options;

  const [state, setState] = useState<AudioRecorderState>({
    isRecording: false,
    isPaused: false,
    recordingTime: 0,
    audioBlob: null,
    audioUrl: null,
    error: null,
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedTimeRef = useRef<number>(0);
  const pauseStartedAtRef = useRef<number | null>(null);
  const isPausedRef = useRef<boolean>(false);

  // Check if MediaRecorder is supported
  const isSupported = typeof MediaRecorder !== 'undefined' && navigator.mediaDevices?.getUserMedia !== undefined;

  // Get supported MIME type
  const getSupportedMimeType = useCallback((): string => {
    if (preferredMimeType && MediaRecorder.isTypeSupported(preferredMimeType)) {
      return preferredMimeType;
    }
    
    // Prefer WebM with Opus for better quality
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
      'audio/wav',
      'audio/mpeg',
    ];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }

    return 'audio/webm'; // Fallback
  }, [preferredMimeType]);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    mediaRecorderRef.current = null;
  }, []);

  // Update recording time
  const updateTime = useCallback(() => {
    if (isPausedRef.current) return;
    
    const elapsed = (Date.now() - startTimeRef.current - pausedTimeRef.current) / 1000;
    setState(prev => ({ ...prev, recordingTime: Math.floor(elapsed) }));

    // Auto-stop if max duration reached
    if (elapsed >= maxDuration) {
      mediaRecorderRef.current?.stop();
    }
  }, [maxDuration]);

  // Start recording
  const startRecording = useCallback(async (): Promise<void> => {
    if (!isSupported) {
      const error = 'Audio recording is not supported in this browser';
      setState(prev => ({ ...prev, error }));
      onError?.(error);
      return;
    }

    try {
      // Reset state
      chunksRef.current = [];
      pausedTimeRef.current = 0;
      pauseStartedAtRef.current = null;
      isPausedRef.current = false;
      
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000, // Good for speech recognition
        },
      });

      streamRef.current = stream;

      // Create MediaRecorder
      const mimeType = getSupportedMimeType();
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 128000,
      });

      mediaRecorderRef.current = mediaRecorder;

      // Handle data
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      // Handle stop
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        
        setState(prev => ({
          ...prev,
          isRecording: false,
          isPaused: false,
          audioBlob: blob,
          audioUrl: url,
        }));

        onDataAvailable?.(blob);
        cleanup();
      };

      // Handle errors
      mediaRecorder.onerror = (event: any) => {
        const error = event.error?.message || 'Recording failed';
        setState(prev => ({ ...prev, error, isRecording: false }));
        onError?.(error);
        cleanup();
      };

      // Start recording
      startTimeRef.current = Date.now();
      mediaRecorder.start(1000); // Collect data every second

      // Start timer
      timerRef.current = setInterval(updateTime, 1000);

      setState(prev => ({
        ...prev,
        isRecording: true,
        isPaused: false,
        recordingTime: 0,
        audioBlob: null,
        audioUrl: null,
        error: null,
      }));

    } catch (err: any) {
      const error = err.message || 'Failed to start recording';
      setState(prev => ({ ...prev, error }));
      onError?.(error);
      cleanup();
    }
  }, [isSupported, getSupportedMimeType, updateTime, onDataAvailable, onError, cleanup]);

  // Stop recording
  const stopRecording = useCallback(async (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current || state.isRecording === false) {
        resolve(state.audioBlob);
        return;
      }

      // Wait for the blob to be created
      const currentRecorder = mediaRecorderRef.current;
      const originalOnStop = currentRecorder.onstop;
      
      currentRecorder.onstop = (event) => {
        if (originalOnStop) {
          originalOnStop.call(currentRecorder, event);
        }
        
        // Give time for state to update
        setTimeout(() => {
          resolve(chunksRef.current.length > 0 
            ? new Blob(chunksRef.current, { type: currentRecorder.mimeType })
            : null
          );
        }, 100);
      };

      if (pauseStartedAtRef.current) {
        pausedTimeRef.current += Date.now() - pauseStartedAtRef.current;
      }
      pauseStartedAtRef.current = null;
      isPausedRef.current = false;
      currentRecorder.stop();
    });
  }, [state.isRecording, state.audioBlob]);

  // Pause recording
  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && state.isRecording && !state.isPaused) {
      pauseStartedAtRef.current = Date.now();
      isPausedRef.current = true;
      mediaRecorderRef.current.pause();
      setState(prev => ({ ...prev, isPaused: true }));
    }
  }, [state.isRecording, state.isPaused]);

  // Resume recording
  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current && state.isRecording && state.isPaused) {
      if (pauseStartedAtRef.current) {
        pausedTimeRef.current += Date.now() - pauseStartedAtRef.current;
      }
      pauseStartedAtRef.current = null;
      isPausedRef.current = false;
      mediaRecorderRef.current.resume();
      setState(prev => ({ ...prev, isPaused: false }));
    }
  }, [state.isRecording, state.isPaused]);

  // Reset recording
  const resetRecording = useCallback(() => {
    cleanup();
    
    // Revoke old URL
    if (state.audioUrl) {
      URL.revokeObjectURL(state.audioUrl);
    }

    setState({
      isRecording: false,
      isPaused: false,
      recordingTime: 0,
      audioBlob: null,
      audioUrl: null,
      error: null,
    });
    
    chunksRef.current = [];
    pauseStartedAtRef.current = null;
    isPausedRef.current = false;
  }, [cleanup, state.audioUrl]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
      if (state.audioUrl) {
        URL.revokeObjectURL(state.audioUrl);
      }
    };
  }, [cleanup, state.audioUrl]);

  return {
    ...state,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    resetRecording,
    isSupported,
  };
}

/**
 * Format seconds to MM:SS
 */
export function formatRecordingTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export default useAudioRecorder;
