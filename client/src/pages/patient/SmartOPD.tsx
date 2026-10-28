/**
 * SmartOPD — AI-Powered Doctor Routing
 * Enter symptoms and get matched to the most suitable doctor instantly.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Stethoscope, Brain, Search, ChevronRight, CircleDollarSign,
  Video, MapPin, Loader2, Sparkles, X, Plus, AlertCircle
} from 'lucide-react';
import api from '@/utils/api';
import MainLayout from '@/components/layout/MainLayout';

interface Doctor {
  id: number;
  name: string;
  specialization: string;
  consultationFees: number;
  availableToday: boolean;
  profilePicture: string | null;
  recommendedReason: string;
}

const COMMON_SYMPTOMS = [
  'Chest pain', 'Headache', 'Fever', 'Cough', 'Skin rash',
  'Stomach ache', 'Eye problem', 'Joint pain', 'Anxiety', 'Diabetes',
];

export default function SmartOPD() {
  const navigate = useNavigate();
  const [symptomInput, setSymptomInput] = useState('');
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [matchedSpecialty, setMatchedSpecialty] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addSymptom = (s: string) => {
    const trimmed = s.trim();
    if (trimmed && !symptoms.includes(trimmed)) {
      setSymptoms(prev => [...prev, trimmed]);
    }
    setSymptomInput('');
  };

  const removeSymptom = (s: string) => setSymptoms(prev => prev.filter(x => x !== s));

  const handleSearch = async () => {
    if (symptoms.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.post('/doctors/smart-route', { symptoms, limit: 8 });
      if (res?.data?.success) {
        setDoctors(res.data.data);
        setMatchedSpecialty(res.data.matchedSpecialty);
      } else {
        setError('No doctors found for these symptoms. Try broader terms.');
        setDoctors([]);
      }
    } catch (e: any) {
      setError('Smart matching is temporarily unavailable. You can browse doctors by specialty.');
      setDoctors([]);
    } finally {
      setLoading(false);
      setSearched(true);
    }
  };

  return (
    <MainLayout>
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
        {/* Hero */}
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-teal-600/10 via-blue-600/5 to-transparent" />
          <div className="absolute top-0 right-0 w-64 h-64 bg-teal-500/5 rounded-full blur-3xl" />
          <div className="relative px-4 sm:px-6 pt-6 pb-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-9 h-9 rounded-xl bg-teal-500/20 flex items-center justify-center">
                <Stethoscope className="h-5 w-5 text-teal-400" />
              </div>
              <h1 className="text-xl font-bold text-white">Smart OPD</h1>
              <Badge className="bg-teal-500/10 text-teal-400 border-0 text-[10px] ml-auto">
                <Sparkles className="h-3 w-3 mr-1" /> AI-Powered
              </Badge>
            </div>
            <p className="text-sm text-slate-400 mb-5">Describe your symptoms and we'll find the right doctor for you.</p>

            {/* Symptom Input */}
            <div className="bg-slate-800/50 border border-white/[0.08] rounded-2xl p-4 mb-4">
              <label className="text-xs text-slate-400 mb-2 block">Your Symptoms</label>
              <div className="flex gap-2 mb-3">
                <Input
                  value={symptomInput}
                  onChange={e => setSymptomInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addSymptom(symptomInput); }}
                  placeholder="e.g. chest pain, headache..."
                  className="bg-slate-700/50 border-white/[0.08] text-white rounded-xl flex-1"
                />
                <Button size="sm" onClick={() => addSymptom(symptomInput)}
                  disabled={!symptomInput.trim()}
                  className="bg-teal-600 hover:bg-teal-500 border-0 rounded-xl px-3">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              {/* Selected symptoms */}
              {symptoms.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {symptoms.map(s => (
                    <Badge key={s} className="bg-teal-500/10 text-teal-300 border border-teal-500/20 text-xs gap-1 pr-1.5">
                      {s}
                      <button onClick={() => removeSymptom(s)} className="ml-0.5 hover:text-white">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}

              {/* Quick symptom chips */}
              <div className="flex flex-wrap gap-1.5">
                {COMMON_SYMPTOMS.filter(s => !symptoms.includes(s)).slice(0, 6).map(s => (
                  <button key={s} onClick={() => addSymptom(s)}
                    className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-700/50 border border-white/[0.06] text-slate-400 hover:text-white hover:border-teal-500/30 transition-all">
                    + {s}
                  </button>
                ))}
              </div>
            </div>

            <Button className="w-full bg-gradient-to-r from-teal-600 to-blue-600 hover:from-teal-500 hover:to-blue-500 border-0 rounded-xl gap-2"
              disabled={symptoms.length === 0 || loading}
              onClick={handleSearch}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
              {loading ? 'Finding best doctors...' : 'Find Best Doctors'}
            </Button>
          </div>
        </div>

        {/* Results */}
        <div className="px-4 sm:px-6 pb-8">
          {matchedSpecialty && !loading && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-teal-400" />
              <p className="text-sm text-slate-300">
                Matched to <span className="text-teal-400 font-semibold capitalize">{matchedSpecialty}</span>
              </p>
            </motion.div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-amber-400 text-sm mb-4 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
              <Button variant="outline" className="bg-transparent text-amber-300" onClick={() => navigate("/doctors")}>Find a Doctor</Button>
            </div>
          )}

          <AnimatePresence>
            {doctors.map((doc, i) => (
              <motion.div key={doc.id} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07 }} className="mb-3">
                <Card className="!p-0 border-white/[0.06] bg-slate-800/50 hover:border-teal-500/20 hover:bg-slate-800/80 transition-all cursor-pointer"
                  onClick={() => navigate(`/doctors/${doc.id}`)}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-500/20 to-blue-500/20 flex items-center justify-center flex-shrink-0 text-xl">
                        {doc.profilePicture ? (
                          <img src={doc.profilePicture} alt={doc.name}
                            className="w-12 h-12 rounded-xl object-cover" />
                        ) : '🩺'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="text-sm font-semibold text-white">Dr. {doc.name}</h3>
                            <p className="text-[11px] text-teal-400 capitalize">{doc.specialization}</p>
                          </div>
                          {doc.availableToday && (
                            <Badge className="bg-emerald-500/10 text-emerald-400 border-0 text-[9px] flex-shrink-0">Available</Badge>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-500 mt-1">{doc.recommendedReason}</p>
                        <div className="flex items-center gap-3 mt-2">
                          <div className="flex items-center gap-1">
                            <CircleDollarSign className="h-3 w-3 text-emerald-400" />
                            <span className="text-xs text-white">₹{doc.consultationFees}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <Button size="sm" className="flex-1 bg-teal-600 hover:bg-teal-500 border-0 rounded-lg h-8 text-xs gap-1"
                        onClick={e => { e.stopPropagation(); navigate(`/book-appointment?doctorId=${doc.id}&type=video`); }}>
                        <Video className="h-3.5 w-3.5" /> Book Online
                      </Button>
                      <Button size="sm" variant="outline"
                        className="flex-1 border-white/10 rounded-lg h-8 text-xs gap-1 text-slate-300"
                        onClick={e => { e.stopPropagation(); navigate(`/doctors/${doc.id}`); }}>
                        <ChevronRight className="h-3.5 w-3.5" /> View Profile
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>

          {searched && !loading && doctors.length === 0 && !error && (
            <div className="text-center py-8 text-slate-500">
              <Stethoscope className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No doctors matched. Try adding more symptoms.</p>
            </div>
          )}

          {!searched && (
            <div className="text-center py-6 text-slate-600">
              <Search className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Add symptoms above to find the best specialist</p>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
