'use client';

import React, { useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { MalwareWarningDialog } from '@/components/MalwareWarningDialog';

interface DrugSuggestion {
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  reason?: string;
}

interface ICD10Code {
  code: string;
  description: string;
}

interface VisionAnalysis {
  findings: string;
  assessment: string;
  recommendations: string[];
  drugSuggestions: DrugSuggestion[];
  icd10Codes: ICD10Code[];
  sourceType?: string;
  analyzedAt?: string;
}

interface AIVisionConsultationProps {
  sessionId?: string;
  appointmentId?: string;
  onAnalysisComplete?: (analysis: VisionAnalysis) => void;
  videoRef?: React.RefObject<HTMLVideoElement>;
}

export const AIVisionConsultation: React.FC<AIVisionConsultationProps> = ({
  sessionId,
  appointmentId,
  onAnalysisComplete,
  videoRef
}) => {
  const videoRefLocal = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<VisionAnalysis | null>(null);
  const [lastImageData, setLastImageData] = useState<string | null>(null);
  const [malwareWarning, setMalwareWarning] = useState<{ open: boolean; threat?: string; fileName?: string }>({ open: false });

  const { toast } = useToast();

  // Capture screenshot from video feed
  const captureScreenshot = useCallback(async () => {
    const video = videoRef?.current || videoRefLocal.current;
    if (!video || !canvasRef.current) {
      toast({
        title: 'Error',
        description: 'Video feed not available',
        variant: 'destructive',
      });
      return;
    }

    try {
      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) throw new Error('Could not get canvas context');

      // Set canvas dimensions to match video
      canvasRef.current.width = video.videoWidth;
      canvasRef.current.height = video.videoHeight;

      // Draw video frame to canvas
      ctx.drawImage(video, 0, 0);

      // Convert to blob and analyze
      canvasRef.current.toBlob(
        async (blob) => {
          if (blob) {
            await analyzeImage(blob, 'video_screenshot');
          }
        },
        'image/jpeg',
        0.95
      );

      toast({
        title: 'Success',
        description: '📸 Screenshot captured and queued for analysis',
      });
    } catch (error) {
      console.error('Screenshot capture error:', error);
      toast({
        title: 'Capture Failed',
        description: error instanceof Error ? error.message : 'Failed to capture screenshot',
        variant: 'destructive',
      });
    }
  }, [videoRef, toast]);

  // Handle image file upload
  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Invalid File',
        description: 'Please select a valid image file (JPEG, PNG, GIF, or WebP)',
        variant: 'destructive',
      });
      return;
    }

    // Validate file size (max 10MB)
    const MAX_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      toast({
        title: 'File Too Large',
        description: 'File size must be less than 10MB',
        variant: 'destructive',
      });
      return;
    }

    analyzeImage(file, 'uploaded_image');
  }, [toast]);

  // Send image to backend for AI analysis
  const analyzeImage = useCallback(
    async (imageFile: Blob, sourceType: string) => {
      setIsAnalyzing(true);
      setAnalysisResult(null);

      try {
        const formData = new FormData();
        formData.append('image', imageFile);
        formData.append('sourceType', sourceType);
        if (appointmentId) {
          formData.append('appointmentId', appointmentId);
        }
        if (sessionId) {
          formData.append('sessionId', sessionId);
        }

        const apiBase = import.meta.env.VITE_API_URL || '/api';
        const response = await fetch(`${apiBase}/ai/vision/analyze`, {
          method: 'POST',
          body: formData,
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('authToken') || ''}`,
          },
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          if (errorData.code === 'MALWARE_DETECTED' || (errorData.message && errorData.message.toLowerCase().includes('malware detected'))) {
            setMalwareWarning({ open: true, threat: errorData.threat, fileName: imageFile instanceof File ? imageFile.name : undefined });
            return;
          }
          throw new Error(
            errorData.error || errorData.message || 'Vision analysis failed'
          );
        }

        const data = await response.json();
        if (!data.success) {
          throw new Error(data.message || 'Analysis unsuccessful');
        }

        setAnalysisResult(data.analysis);

        toast({
          title: 'Analysis Complete',
          description: '✅ Medical image analyzed successfully',
        });

        onAnalysisComplete?.(data.analysis);
      } catch (error) {
        console.error('Vision analysis error:', error);
        toast({
          title: 'Analysis Failed',
          description: error instanceof Error ? error.message : 'Failed to analyze image',
          variant: 'destructive',
        });
      } finally {
        setIsAnalyzing(false);
      }
    },
    [appointmentId, sessionId, onAnalysisComplete, toast]
  );

  // Add to prescription handler
  const handleAddToPrescription = useCallback(() => {
    if (analysisResult) {
      onAnalysisComplete?.(analysisResult);
      toast({
        title: 'Added',
        description: '✅ Vision analysis added to prescription',
      });
    }
  }, [analysisResult, onAnalysisComplete, toast]);

  return (
    <>
    <div className="space-y-4 p-4 bg-gradient-to-br from-purple-50 to-blue-50 rounded-lg border-2 border-purple-200 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold flex items-center gap-2 text-purple-900">
          🤖 AI Vision Medical Analysis
        </h3>
        <span
          className={`px-3 py-1 rounded-full text-xs font-medium ${
            isAnalyzing
              ? 'animate-pulse bg-blue-100 text-blue-700'
              : 'bg-green-100 text-green-700'
          }`}
        >
          {isAnalyzing ? '⏳ Analyzing...' : '✅ Ready'}
        </span>
      </div>

      {/* Hidden video and canvas for capturing */}
      <video ref={videoRefLocal} className="hidden" />
      <canvas ref={canvasRef} className="hidden" />

      {/* Description */}
      <p className="text-xs text-gray-600">
        📸 Capture screenshots from video or upload medical images (X-ray, scan, etc.) for instant AI analysis
      </p>

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-2">
        <Button
          onClick={captureScreenshot}
          disabled={isAnalyzing}
          className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-medium"
          title="Capture screenshot from patient video feed"
        >
          📸 Capture Screenshot
        </Button>

        <Button
          onClick={() => fileInputRef.current?.click()}
          disabled={isAnalyzing}
          className="bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white font-medium"
          title="Upload medical image file"
        >
          📁 Upload Image
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleImageUpload}
          className="hidden"
          aria-label="Upload medical image"
        />
      </div>

      {/* Analysis Results */}
      {analysisResult && (
        <div className="bg-white p-4 rounded-lg border border-green-200 space-y-3 shadow-sm">
          <div className="flex items-center gap-2 text-green-700 font-semibold">
            ✅ Analysis Results
          </div>

          {/* Findings */}
          <div className="space-y-1">
            <h4 className="text-xs font-bold text-gray-700 uppercase">Clinical Findings</h4>
            <p className="text-sm text-gray-700 leading-relaxed bg-gray-50 p-2 rounded">
              {analysisResult.findings}
            </p>
          </div>

          {/* Assessment */}
          <div className="space-y-1">
            <h4 className="text-xs font-bold text-gray-700 uppercase">Assessment</h4>
            <p className="text-sm text-gray-700 leading-relaxed bg-gray-50 p-2 rounded">
              {analysisResult.assessment}
            </p>
          </div>

          {/* Drug Suggestions */}
          {analysisResult.drugSuggestions?.length > 0 && (
            <div className="space-y-1 bg-blue-50 p-3 rounded border border-blue-200">
              <h4 className="text-xs font-bold text-blue-900 uppercase">💊 Drug Suggestions</h4>
              <ul className="text-sm space-y-1">
                {analysisResult.drugSuggestions.map((drug, idx) => (
                  <li key={idx} className="text-gray-700 text-xs">
                    <span className="font-semibold">{drug.name}</span>
                    <br />
                    <span className="text-gray-600">
                      {drug.dosage} • {drug.frequency} • {drug.duration}
                    </span>
                    {drug.reason && (
                      <span className="text-gray-500 block">Reason: {drug.reason}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ICD-10 Codes */}
          {analysisResult.icd10Codes?.length > 0 && (
            <div className="space-y-1 bg-amber-50 p-3 rounded border border-amber-200">
              <h4 className="text-xs font-bold text-amber-900 uppercase">📋 ICD-10 Codes</h4>
              <ul className="text-sm space-y-1">
                {analysisResult.icd10Codes.map((code, idx) => (
                  <li key={idx} className="text-gray-700 text-xs">
                    <span className="font-mono font-semibold">{code.code}</span>
                    {' '}
                    <span className="text-gray-600">{code.description}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Recommendations */}
          {analysisResult.recommendations?.length > 0 && (
            <div className="space-y-1">
              <h4 className="text-xs font-bold text-gray-700 uppercase">Recommendations</h4>
              <ul className="text-sm space-y-1">
                {analysisResult.recommendations.map((rec, idx) => (
                  <li key={idx} className="text-gray-700 text-xs">
                    • {rec}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Add to Prescription Button */}
          <Button
            onClick={handleAddToPrescription}
            className="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-medium"
          >
            ✅ Add to Prescription
          </Button>
        </div>
      )}

      {/* Info Box */}
      <div className="bg-blue-50 p-3 rounded border border-blue-200 text-xs text-blue-800">
        <p className="font-semibold mb-1">💡 Tips</p>
        <ul className="space-y-1 text-blue-700">
          <li>• Show patient any medical images (X-ray, scan, etc.) to camera</li>
          <li>• Ensure good lighting and clarity for accurate analysis</li>
          <li>• Results support clinical decision-making - review with patient</li>
        </ul>
      </div>
    </div>
    <MalwareWarningDialog
      open={malwareWarning.open}
      onClose={() => setMalwareWarning({ open: false })}
      threat={malwareWarning.threat}
      fileName={malwareWarning.fileName}
    />
    </>
  );
};

export default AIVisionConsultation;
