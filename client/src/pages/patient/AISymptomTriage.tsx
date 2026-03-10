import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import {
  ArrowLeft, Stethoscope, AlertCircle, CheckCircle, Clock,
  ChevronRight, Loader2, Shield, Heart, Thermometer, Wind,
  Activity, Brain, Sparkles, Phone, ArrowRight, AlertTriangle,
  Info
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import aiHealthServices, { TriageResult } from '@/services/aiHealthServices';

type TriageStep =  'symptoms' | 'vitals' | 'analyzing' | 'results';

interface VitalInputs {
  heartRate: string;
  bloodPressure: string;
  temperature: string;
  oxygenSaturation: string;
}

const esiLevelConfig: Record<number, { color: string; bg: string; border: string; label: string; icon: any; action: string }> = {
  1: { color: 'text-red-700', bg: 'bg-red-50 dark:bg-red-900/30', border: 'border-red-300 dark:border-red-700', label: 'Resuscitation', icon: AlertCircle, action: 'Call emergency services (112) immediately' },
  2: { color: 'text-orange-700', bg: 'bg-orange-50 dark:bg-orange-900/30', border: 'border-orange-300 dark:border-orange-700', label: 'Emergent', icon: AlertTriangle, action: 'Go to the nearest emergency room now' },
  3: { color: 'text-yellow-700', bg: 'bg-yellow-50 dark:bg-yellow-900/30', border: 'border-yellow-300 dark:border-yellow-700', label: 'Urgent', icon: Clock, action: 'See a doctor within a few hours' },
  4: { color: 'text-blue-700', bg: 'bg-blue-50 dark:bg-blue-900/30', border: 'border-blue-300 dark:border-blue-700', label: 'Less Urgent', icon: Info, action: 'Schedule a visit within 24-48 hours' },
  5: { color: 'text-green-700', bg: 'bg-green-50 dark:bg-green-900/30', border: 'border-green-300 dark:border-green-700', label: 'Non-Urgent', icon: CheckCircle, action: 'Can be managed with home care or routine visit' },
};

const quickSymptoms = [
  'Headache', 'Fever', 'Chest Pain', 'Difficulty Breathing', 
  'Stomach Pain', 'Nausea/Vomiting', 'Dizziness', 'Back Pain',
  'Cough', 'Sore Throat', 'Joint Pain', 'Skin Rash',
  'Fatigue', 'Palpitations', 'Anxiety', 'Allergic Reaction'
];

const AISymptomTriage: React.FC = () => {
  const [step, setStep] = useState<TriageStep>('symptoms');
  const [symptomText, setSymptomText] = useState('');
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [painScale, setPainScale] = useState<number>(3);
  const [vitals, setVitals] = useState<VitalInputs>({
    heartRate: '',
    bloodPressure: '',
    temperature: '',
    oxygenSaturation: '',
  });
  const [result, setResult] = useState<Partial<TriageResult> | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const { toast } = useToast();
  const navigate = useNavigate();

  const toggleSymptom = (symptom: string) => {
    setSelectedSymptoms(prev =>
      prev.includes(symptom) ? prev.filter(s => s !== symptom) : [...prev, symptom]
    );
  };

  const getFullSymptomDescription = () => {
    const parts: string[] = [];
    if (selectedSymptoms.length > 0) {
      parts.push(`Symptoms: ${selectedSymptoms.join(', ')}`);
    }
    if (symptomText.trim()) {
      parts.push(symptomText.trim());
    }
    parts.push(`Pain level: ${painScale}/10`);
    return parts.join('. ');
  };

  const proceedToVitals = () => {
    if (selectedSymptoms.length === 0 && !symptomText.trim()) {
      toast({ title: 'Please describe your symptoms', description: 'Select symptoms or type a description', variant: 'destructive' });
      return;
    }
    setStep('vitals');
  };

  const runTriage = useCallback(async () => {
    setStep('analyzing');
    setAnalyzing(true);

    try {
      const payload: any = {
        symptoms: getFullSymptomDescription(),
        painScale,
      };

      // Add vitals if provided
      const vitalsObj: any = {};
      if (vitals.heartRate) vitalsObj.heartRate = parseInt(vitals.heartRate);
      if (vitals.bloodPressure) vitalsObj.bloodPressure = vitals.bloodPressure;
      if (vitals.temperature) vitalsObj.temperature = parseFloat(vitals.temperature);
      if (vitals.oxygenSaturation) vitalsObj.oxygenSaturation = parseInt(vitals.oxygenSaturation);
      if (Object.keys(vitalsObj).length > 0) {
        payload.vitals = vitalsObj;
      }

      // Get user profile for age/gender if available
      const userStr = localStorage.getItem('user');
      if (userStr) {
        try {
          const user = JSON.parse(userStr);
          if (user.age) payload.age = user.age;
          if (user.gender) payload.gender = user.gender;
        } catch { /* ignore parse errors */ }
      }

      const response = await aiHealthServices.assessSymptoms(payload);

      if (response.success) {
        setResult(response);
      } else {
        throw new Error('Triage assessment failed');
      }

      setTimeout(() => {
        setStep('results');
        setAnalyzing(false);
      }, 1500);

    } catch (error: any) {
      console.error('[SymptomTriage] Failed:', error);
      toast({
        title: 'Assessment Failed',
        description: 'Could not complete the assessment. If you feel unwell, please contact a doctor directly.',
        variant: 'destructive'
      });
      setStep('vitals');
      setAnalyzing(false);
    }
  }, [symptomText, selectedSymptoms, painScale, vitals, toast]);

  const resetTriage = () => {
    setStep('symptoms');
    setSymptomText('');
    setSelectedSymptoms([]);
    setPainScale(3);
    setVitals({ heartRate: '', bloodPressure: '', temperature: '', oxygenSaturation: '' });
    setResult(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-teal-50/20 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200/50 dark:border-slate-700/50">
        <div className="flex items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="icon" onClick={() => step === 'symptoms' ? navigate(-1) : setStep('symptoms')} className="shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold flex items-center gap-2">
              <Stethoscope className="h-5 w-5 text-teal-600" />
              AI Symptom Check
            </h1>
            <p className="text-xs text-muted-foreground">ESI 5-Level Emergency Triage</p>
          </div>
          {/* Step indicator */}
          <div className="flex items-center gap-1">
            {['symptoms', 'vitals', 'results'].map((s, i) => (
              <div
                key={s}
                className={`w-2 h-2 rounded-full transition-all ${
                  step === s || (step === 'analyzing' && s === 'results')
                    ? 'bg-teal-500 w-4'
                    : ['symptoms', 'vitals', 'results'].indexOf(step === 'analyzing' ? 'results' : step) > i
                      ? 'bg-teal-300'
                      : 'bg-slate-300 dark:bg-slate-600'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 pb-24">
        <AnimatePresence mode="wait">
          {/* ── Step 1: Symptoms ────────────────────────────── */}
          {step === 'symptoms' && (
            <motion.div
              key="symptoms"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              {/* Quick symptom chips */}
              <Card className="border-slate-200/50 dark:border-slate-700/50">
                <CardHeader className="pb-2 px-4 pt-4">
                  <CardTitle className="text-sm">What are you experiencing?</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className="flex flex-wrap gap-2">
                    {quickSymptoms.map((symptom) => (
                      <button
                        key={symptom}
                        onClick={() => toggleSymptom(symptom)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all active:scale-95 ${
                          selectedSymptoms.includes(symptom)
                            ? 'bg-teal-600 text-white shadow-sm'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                        }`}
                      >
                        {symptom}
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Free text description */}
              <Card className="border-slate-200/50 dark:border-slate-700/50">
                <CardContent className="p-4 space-y-3">
                  <label className="text-sm font-medium">Describe in your own words</label>
                  <Textarea
                    placeholder="E.g., I've had a throbbing headache for 2 days, mostly on the right side. It gets worse when I bend down..."
                    value={symptomText}
                    onChange={(e) => setSymptomText(e.target.value)}
                    rows={3}
                    className="resize-none text-sm"
                  />
                </CardContent>
              </Card>

              {/* Pain Scale */}
              <Card className="border-slate-200/50 dark:border-slate-700/50">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Pain Level</label>
                    <span className={`text-lg font-bold ${
                      painScale <= 3 ? 'text-green-600' : painScale <= 6 ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {painScale}/10
                    </span>
                  </div>
                  <Slider
                    value={[painScale]}
                    onValueChange={(v) => setPainScale(v[0])}
                    max={10}
                    min={0}
                    step={1}
                    className="py-2"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>No pain</span>
                    <span>Moderate</span>
                    <span>Worst pain</span>
                  </div>
                </CardContent>
              </Card>

              <Button
                onClick={proceedToVitals}
                disabled={selectedSymptoms.length === 0 && !symptomText.trim()}
                className="w-full h-12 rounded-xl bg-gradient-to-r from-teal-600 to-blue-600 hover:from-teal-700 hover:to-blue-700 text-white font-semibold"
              >
                Continue
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </motion.div>
          )}

          {/* ── Step 2: Vitals (Optional) ─────────────────── */}
          {step === 'vitals' && (
            <motion.div
              key="vitals"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              <div className="text-center py-2">
                <p className="text-sm text-muted-foreground">
                  Adding vitals improves assessment accuracy (optional)
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Heart Rate */}
                <Card className="border-slate-200/50 dark:border-slate-700/50">
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <Heart className="h-4 w-4 text-red-500" />
                      <label className="text-xs font-medium">Heart Rate</label>
                    </div>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        placeholder="72"
                        value={vitals.heartRate}
                        onChange={(e) => setVitals(v => ({ ...v, heartRate: e.target.value }))}
                        className="w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-sm bg-transparent focus:ring-1 focus:ring-teal-500 outline-none"
                      />
                      <span className="text-xs text-muted-foreground shrink-0">bpm</span>
                    </div>
                  </CardContent>
                </Card>

                {/* Blood Pressure */}
                <Card className="border-slate-200/50 dark:border-slate-700/50">
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <Activity className="h-4 w-4 text-blue-500" />
                      <label className="text-xs font-medium">Blood Pressure</label>
                    </div>
                    <input
                      type="text"
                      placeholder="120/80"
                      value={vitals.bloodPressure}
                      onChange={(e) => setVitals(v => ({ ...v, bloodPressure: e.target.value }))}
                      className="w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-sm bg-transparent focus:ring-1 focus:ring-teal-500 outline-none"
                    />
                  </CardContent>
                </Card>

                {/* Temperature */}
                <Card className="border-slate-200/50 dark:border-slate-700/50">
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <Thermometer className="h-4 w-4 text-orange-500" />
                      <label className="text-xs font-medium">Temperature</label>
                    </div>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        step="0.1"
                        placeholder="98.6"
                        value={vitals.temperature}
                        onChange={(e) => setVitals(v => ({ ...v, temperature: e.target.value }))}
                        className="w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-sm bg-transparent focus:ring-1 focus:ring-teal-500 outline-none"
                      />
                      <span className="text-xs text-muted-foreground shrink-0">°F</span>
                    </div>
                  </CardContent>
                </Card>

                {/* Oxygen */}
                <Card className="border-slate-200/50 dark:border-slate-700/50">
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <Wind className="h-4 w-4 text-teal-500" />
                      <label className="text-xs font-medium">SpO₂</label>
                    </div>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        placeholder="98"
                        value={vitals.oxygenSaturation}
                        onChange={(e) => setVitals(v => ({ ...v, oxygenSaturation: e.target.value }))}
                        className="w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-sm bg-transparent focus:ring-1 focus:ring-teal-500 outline-none"
                      />
                      <span className="text-xs text-muted-foreground shrink-0">%</span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={runTriage}
                  className="flex-1 h-12 rounded-xl"
                >
                  Skip & Assess
                </Button>
                <Button
                  onClick={runTriage}
                  className="flex-1 h-12 rounded-xl bg-gradient-to-r from-teal-600 to-blue-600 text-white font-semibold"
                >
                  <Brain className="h-4 w-4 mr-2" />
                  Run AI Assessment
                </Button>
              </div>
            </motion.div>
          )}

          {/* ── Step 3: Analyzing ──────────────────────────── */}
          {step === 'analyzing' && (
            <motion.div
              key="analyzing"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex flex-col items-center justify-center py-20 space-y-6"
            >
              <div className="relative">
                <div className="w-24 h-24 rounded-full border-4 border-teal-200 dark:border-teal-800 flex items-center justify-center">
                  <Stethoscope className="h-10 w-10 text-teal-600" />
                </div>
                <motion.div
                  className="absolute inset-0 rounded-full border-4 border-t-teal-500 border-r-transparent border-b-transparent border-l-transparent"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                />
              </div>
              <div className="text-center space-y-2">
                <p className="font-semibold text-slate-700 dark:text-white">Analyzing your symptoms...</p>
                <p className="text-sm text-muted-foreground">
                  Running ESI 5-Level Emergency Triage Protocol
                </p>
              </div>
            </motion.div>
          )}

          {/* ── Step 4: Results ─────────────────────────────── */}
          {step === 'results' && result && (
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              {/* ESI Level Banner */}
              {(() => {
                const level = result.esi_level || 5;
                const config = esiLevelConfig[level] || esiLevelConfig[5];
                const Icon = config.icon;
                return (
                  <Card className={`${config.bg} ${config.border} border`}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-xl ${config.bg}`}>
                          <Icon className={`h-8 w-8 ${config.color}`} />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge className={`${config.color} ${config.bg} border ${config.border} text-xs`}>
                              ESI Level {level}
                            </Badge>
                            <span className={`font-bold text-sm ${config.color}`}>{config.label}</span>
                          </div>
                          <p className={`text-sm font-medium ${config.color}`}>{config.action}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })()}

              {/* Emergency Call (for ESI 1-2) */}
              {(result.esi_level === 1 || result.esi_level === 2) && (
                <a href="tel:112" className="block">
                  <Button
                    className="w-full h-14 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-lg animate-pulse"
                  >
                    <Phone className="h-6 w-6 mr-2" />
                    Call Emergency — 112
                  </Button>
                </a>
              )}

              {/* Description */}
              {result.description && (
                <Card className="border-slate-200/50 dark:border-slate-700/50">
                  <CardContent className="p-4">
                    <h3 className="font-semibold text-sm flex items-center gap-2 mb-2">
                      <Sparkles className="h-4 w-4 text-teal-600" />
                      Assessment
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                      {result.description}
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Red Flags */}
              {result.red_flags && result.red_flags.length > 0 && (
                <Card className="border-red-200/50 dark:border-red-800/50 bg-red-50/30 dark:bg-red-900/10">
                  <CardContent className="p-4">
                    <h3 className="font-semibold text-sm flex items-center gap-2 mb-2 text-red-700 dark:text-red-400">
                      <AlertCircle className="h-4 w-4" />
                      Red Flags to Watch
                    </h3>
                    <ul className="space-y-1.5">
                      {result.red_flags.map((flag, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400">
                          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                          {flag}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* Patient Instructions */}
              {result.patient_instructions && result.patient_instructions.length > 0 && (
                <Card className="border-slate-200/50 dark:border-slate-700/50">
                  <CardHeader className="pb-2 px-4 pt-4">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      What to Do Now
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <ol className="space-y-2">
                      {result.patient_instructions.map((instruction, i) => (
                        <li key={i} className="flex items-start gap-3">
                          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 text-xs font-bold flex items-center justify-center">
                            {i + 1}
                          </span>
                          <span className="text-sm text-slate-600 dark:text-slate-400">{instruction}</span>
                        </li>
                      ))}
                    </ol>
                  </CardContent>
                </Card>
              )}

              {/* Recommended Specialty */}
              {result.recommended_specialty && (
                <Card className="border-teal-200/50 dark:border-teal-700/50 bg-teal-50/30 dark:bg-teal-900/10">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground">Recommended Specialist</p>
                        <p className="font-semibold text-teal-700 dark:text-teal-400">{result.recommended_specialty}</p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => navigate(`/consultation?specialty=${encodeURIComponent(result.recommended_specialty || '')}`)}
                        className="bg-teal-600 hover:bg-teal-700 text-white"
                      >
                        Find Doctor
                        <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Actions */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={resetTriage}
                  className="h-12 rounded-xl"
                >
                  Check Again
                </Button>
                <Button
                  onClick={() => navigate('/ai-doctor')}
                  className="h-12 rounded-xl bg-gradient-to-r from-teal-600 to-blue-600 text-white"
                >
                  <Brain className="h-4 w-4 mr-2" />
                  Talk to Dr. iSHA
                </Button>
              </div>

              {/* Disclaimer */}
              <div className="text-center p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  <Shield className="h-3 w-3 inline mr-1" />
                  AI triage is for guidance only. It does not replace professional medical judgment. In any emergency, call 112.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default AISymptomTriage;
