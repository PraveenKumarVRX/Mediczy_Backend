import React, { useState, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { 
  Camera, Upload, FileText, Scan, AlertCircle, CheckCircle, 
  ArrowLeft, Sparkles, Clock, Shield, ChevronRight, Loader2,
  Image as ImageIcon, X, AlertTriangle, Heart, Activity
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import aiHealthServices from '@/services/aiHealthServices';

type AnalysisStep = 'upload' | 'preview' | 'analyzing' | 'results';

interface AnalysisResult {
  findings: string;
  assessment: string;
  recommendations: string[];
  urgency: 'routine' | 'soon' | 'urgent' | 'emergency';
  keyValues?: Record<string, { value: string; status: string; reference: string }>;
  summary?: string;
  disclaimer?: string;
  analyzedAt?: string;
}

const urgencyConfig = {
  routine: { color: 'bg-green-100 text-green-700 border-green-200', icon: CheckCircle, label: 'Routine', desc: 'No immediate concern' },
  soon: { color: 'bg-yellow-100 text-yellow-700 border-yellow-200', icon: Clock, label: 'Follow Up Soon', desc: 'Schedule a visit within a week' },
  urgent: { color: 'bg-orange-100 text-orange-700 border-orange-200', icon: AlertTriangle, label: 'Urgent', desc: 'See a doctor within 24-48 hours' },
  emergency: { color: 'bg-red-100 text-red-700 border-red-200', icon: AlertCircle, label: 'Emergency', desc: 'Seek immediate medical attention' },
};

const statusColors: Record<string, string> = {
  normal: 'text-green-600 bg-green-50',
  borderline: 'text-yellow-600 bg-yellow-50',
  abnormal: 'text-orange-600 bg-orange-50',
  critical: 'text-red-600 bg-red-50',
};

const AIReportScanner: React.FC = () => {
  const [step, setStep] = useState<AnalysisStep>('upload');
  const [imageData, setImageData] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState<string>('image/jpeg');
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisStage, setAnalysisStage] = useState('');
  const [useCamera, setUseCamera] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Maximum file size is 5MB', variant: 'destructive' });
      return;
    }

    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      toast({ title: 'Invalid format', description: 'Please use JPEG, PNG, GIF, or WebP images', variant: 'destructive' });
      return;
    }

    setImageMimeType(file.type);
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = (event.target?.result as string)?.split(',')[1];
      if (base64) {
        setImageData(base64);
        setStep('preview');
      }
    };
    reader.readAsDataURL(file);
  }, [toast]);

  const analyzeReport = useCallback(async () => {
    if (!imageData) return;
    
    setStep('analyzing');
    setAnalyzing(true);
    setAnalysisProgress(0);
    
    // Simulate progress stages
    const stages = [
      { progress: 15, stage: 'Reading document...' },
      { progress: 35, stage: 'Identifying medical parameters...' },
      { progress: 55, stage: 'Analyzing values against reference ranges...' },
      { progress: 75, stage: 'Generating health insights...' },
      { progress: 90, stage: 'Preparing recommendations...' },
    ];

    let stageIndex = 0;
    const progressInterval = setInterval(() => {
      if (stageIndex < stages.length) {
        setAnalysisProgress(stages[stageIndex].progress);
        setAnalysisStage(stages[stageIndex].stage);
        stageIndex++;
      }
    }, 1200);

    try {
      const userQuery = question.trim() || 'Analyze this medical report and explain the findings in simple, patient-friendly terms';
      
      // A failed analysis must never be rendered as a reassuring result. The
      // old browser-Gemini fallback always hard-coded `routine`, even if the
      // backend analysis had failed or the image was unreadable.
      const response = await aiHealthServices.analyzeReport(imageData, imageMimeType, userQuery);
      
      if (response.success && response.analysis) {
        setResult(response.analysis as AnalysisResult);
      } else {
        throw new Error(response.error || 'Analysis failed');
      }
      
      setAnalysisProgress(100);
      setAnalysisStage('Analysis complete!');
      
      setTimeout(() => {
        setStep('results');
        setAnalyzing(false);
      }, 500);
      
    } catch (error: any) {
      console.error('[ReportScanner] Analysis failed:', error);
      toast({
        title: 'Analysis Failed',
        description: 'Could not analyze the report. Please try again or consult a doctor.',
        variant: 'destructive'
      });
      setStep('preview');
      setAnalyzing(false);
    } finally {
      clearInterval(progressInterval);
    }
  }, [imageData, imageMimeType, question, toast]);

  const resetScanner = () => {
    setStep('upload');
    setImageData(null);
    setResult(null);
    setQuestion('');
    setAnalysisProgress(0);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-teal-50/20 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200/50 dark:border-slate-700/50">
        <div className="flex items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold flex items-center gap-2">
              <Scan className="h-5 w-5 text-teal-600" />
              AI Report Scanner
            </h1>
            <p className="text-xs text-muted-foreground">Powered by Claude & Gemini AI</p>
          </div>
          {step !== 'upload' && step !== 'analyzing' && (
            <Button variant="outline" size="sm" onClick={resetScanner}>
              New Scan
            </Button>
          )}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 pb-24">
        <AnimatePresence mode="wait">
          {/* ── Step 1: Upload ─────────────────────────────────── */}
          {step === 'upload' && (
            <motion.div
              key="upload"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              {/* Hero Section */}
              <div className="text-center py-6">
                <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-teal-500 to-blue-600 flex items-center justify-center mb-4 shadow-lg shadow-teal-500/20">
                  <Scan className="h-10 w-10 text-white" />
                </div>
                <h2 className="text-xl font-bold text-slate-800 dark:text-white">Scan Your Medical Report</h2>
                <p className="text-sm text-muted-foreground mt-1 max-w-xs mx-auto">
                  Get instant AI-powered analysis of blood tests, X-rays, prescriptions & more
                </p>
              </div>

              {/* Upload Options */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => cameraInputRef.current?.click()}
                  className="flex flex-col items-center gap-3 p-6 rounded-2xl border-2 border-dashed border-teal-300 dark:border-teal-700 bg-teal-50/50 dark:bg-teal-900/20 hover:bg-teal-100/50 dark:hover:bg-teal-900/40 transition-all active:scale-95"
                >
                  <Camera className="h-8 w-8 text-teal-600" />
                  <div>
                    <p className="font-semibold text-sm text-slate-700 dark:text-white">Take Photo</p>
                    <p className="text-xs text-muted-foreground">Use camera</p>
                  </div>
                </button>

                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center gap-3 p-6 rounded-2xl border-2 border-dashed border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-900/20 hover:bg-blue-100/50 dark:hover:bg-blue-900/40 transition-all active:scale-95"
                >
                  <Upload className="h-8 w-8 text-blue-600" />
                  <div>
                    <p className="font-semibold text-sm text-slate-700 dark:text-white">Upload File</p>
                    <p className="text-xs text-muted-foreground">From gallery</p>
                  </div>
                </button>
              </div>

              {/* Hidden file inputs */}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileSelect}
                className="hidden"
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                onChange={handleFileSelect}
                className="hidden"
              />

              {/* Supported Types */}
              <Card className="border-slate-200/50 dark:border-slate-700/50">
                <CardContent className="p-4">
                  <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                    <FileText className="h-4 w-4 text-teal-600" />
                    What can I scan?
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { icon: Activity, label: 'Blood Reports' },
                      { icon: ImageIcon, label: 'X-Rays & Scans' },
                      { icon: FileText, label: 'Prescriptions' },
                      { icon: Heart, label: 'ECG Reports' },
                    ].map((item, i) => (
                      <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                        <item.icon className="h-4 w-4 text-teal-600" />
                        <span className="text-xs font-medium">{item.label}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Trust Badge */}
              <div className="flex items-center gap-2 p-3 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                <Shield className="h-5 w-5 text-green-600 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-green-700 dark:text-green-400">Your data is secure</p>
                  <p className="text-xs text-green-600/80 dark:text-green-500/80">Reports are analyzed in real-time and never stored</p>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Step 2: Preview ─────────────────────────────────── */}
          {step === 'preview' && imageData && (
            <motion.div
              key="preview"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              {/* Image Preview */}
              <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm">
                <img
                  src={`data:${imageMimeType};base64,${imageData}`}
                  alt="Medical report"
                  className="w-full max-h-[300px] object-contain bg-white dark:bg-slate-900"
                />
                <button
                  onClick={resetScanner}
                  className="absolute top-2 right-2 p-1.5 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-3">
                  <p className="text-white text-sm font-medium">Report ready for analysis</p>
                </div>
              </div>

              {/* Optional Question */}
              <Card className="border-slate-200/50 dark:border-slate-700/50">
                <CardContent className="p-4 space-y-3">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-teal-600" />
                    Ask a specific question (optional)
                  </label>
                  <Textarea
                    placeholder="E.g., Is my cholesterol level normal? What does the hemoglobin value mean?"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    rows={2}
                    className="resize-none text-sm"
                  />
                </CardContent>
              </Card>

              {/* Analyze Button */}
              <Button
                onClick={analyzeReport}
                className="w-full h-12 rounded-xl bg-gradient-to-r from-teal-600 to-blue-600 hover:from-teal-700 hover:to-blue-700 text-white font-semibold text-base shadow-lg shadow-teal-500/20"
              >
                <Sparkles className="h-5 w-5 mr-2" />
                Analyze with AI
              </Button>
            </motion.div>
          )}

          {/* ── Step 3: Analyzing ──────────────────────────────── */}
          {step === 'analyzing' && (
            <motion.div
              key="analyzing"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex flex-col items-center justify-center py-16 space-y-6"
            >
              {/* Animated Scanner */}
              <div className="relative w-32 h-32">
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-teal-500/20 to-blue-500/20 animate-pulse" />
                <div className="absolute inset-2 rounded-xl bg-white dark:bg-slate-800 flex items-center justify-center">
                  <Scan className="h-12 w-12 text-teal-600 animate-pulse" />
                </div>
                {/* Scanning line animation */}
                <motion.div
                  className="absolute inset-x-2 h-0.5 bg-gradient-to-r from-transparent via-teal-500 to-transparent"
                  animate={{
                    top: ['8px', '120px', '8px'],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                />
              </div>

              {/* Progress */}
              <div className="w-full max-w-xs space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{analysisStage}</span>
                  <span className="font-semibold text-teal-600">{analysisProgress}%</span>
                </div>
                <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-teal-500 to-blue-500"
                    initial={{ width: '0%' }}
                    animate={{ width: `${analysisProgress}%` }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                  />
                </div>
              </div>

              <p className="text-xs text-muted-foreground text-center max-w-xs">
                Our AI is carefully analyzing your report using advanced medical knowledge
              </p>
            </motion.div>
          )}

          {/* ── Step 4: Results ─────────────────────────────────── */}
          {step === 'results' && result && (
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              {/* Urgency Banner */}
              {(() => {
                const urgency = urgencyConfig[result.urgency] || urgencyConfig.routine;
                const UrgencyIcon = urgency.icon;
                return (
                  <div className={`flex items-center gap-3 p-4 rounded-2xl border ${urgency.color}`}>
                    <UrgencyIcon className="h-6 w-6 shrink-0" />
                    <div>
                      <p className="font-semibold text-sm">{urgency.label}</p>
                      <p className="text-xs opacity-80">{urgency.desc}</p>
                    </div>
                  </div>
                );
              })()}

              {/* Summary */}
              {result.summary && (
                <Card className="border-teal-200/50 dark:border-teal-700/50 bg-teal-50/30 dark:bg-teal-900/10">
                  <CardContent className="p-4">
                    <h3 className="font-semibold text-sm flex items-center gap-2 mb-2">
                      <Sparkles className="h-4 w-4 text-teal-600" />
                      AI Summary
                    </h3>
                    <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                      {result.summary}
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Key Values Table */}
              {result.keyValues && Object.keys(result.keyValues).length > 0 && (
                <Card className="border-slate-200/50 dark:border-slate-700/50">
                  <CardHeader className="pb-2 px-4 pt-4">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Activity className="h-4 w-4 text-blue-600" />
                      Key Parameters
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <div className="space-y-2">
                      {Object.entries(result.keyValues).map(([name, info]) => (
                        <div key={name} className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
                          <div className="flex-1">
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{name}</p>
                            <p className="text-xs text-muted-foreground">Ref: {info.reference}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold">{info.value}</span>
                            <Badge className={`text-xs ${statusColors[info.status] || 'text-slate-600 bg-slate-50'}`}>
                              {info.status}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Detailed Findings */}
              <Card className="border-slate-200/50 dark:border-slate-700/50">
                <CardHeader className="pb-2 px-4 pt-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FileText className="h-4 w-4 text-blue-600" />
                    Detailed Analysis
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-line">
                    {result.findings}
                  </div>
                  {result.assessment && result.assessment !== result.findings && (
                    <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                      <p className="text-xs font-semibold text-slate-500 uppercase mb-1">Assessment</p>
                      <p className="text-sm text-slate-600 dark:text-slate-400">{result.assessment}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Recommendations */}
              {result.recommendations && result.recommendations.length > 0 && (
                <Card className="border-slate-200/50 dark:border-slate-700/50">
                  <CardHeader className="pb-2 px-4 pt-4">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      Recommendations
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <ul className="space-y-2">
                      {result.recommendations.map((rec, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <ChevronRight className="h-4 w-4 text-teal-600 mt-0.5 shrink-0" />
                          <span className="text-sm text-slate-600 dark:text-slate-400">{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* Actions */}
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  onClick={() => navigate('/consultation')}
                  className="h-12 rounded-xl"
                >
                  <Heart className="h-4 w-4 mr-2" />
                  Consult Doctor
                </Button>
                <Button
                  onClick={resetScanner}
                  className="h-12 rounded-xl bg-gradient-to-r from-teal-600 to-blue-600 text-white"
                >
                  <Scan className="h-4 w-4 mr-2" />
                  Scan Another
                </Button>
              </div>

              {/* Disclaimer */}
              <div className="text-center p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-3 w-3 inline mr-1" />
                  {result.disclaimer || 'AI analysis is for informational purposes only. Always consult a qualified healthcare professional.'}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default AIReportScanner;
