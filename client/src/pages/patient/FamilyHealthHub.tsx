/**
 * FamilyHealthHub — World-Class Family Health Management
 *
 * MediBuddy-tier family health experience:
 * - Family member cards with health scores
 * - Shared health timeline
 * - Upcoming appointments for all members
 * - Insurance coverage per member
 * - One-tap appointment booking for any family member
 * - Medication reminders for family
 * - Emergency contacts & SOS
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, Heart, Shield, ShieldCheck, Calendar, Clock, Pill, Activity,
  AlertCircle, Phone, Plus, ChevronRight, Stethoscope, Brain,
  Baby, UserPlus, HeartPulse, Thermometer, Droplets, Moon, Footprints,
  Bell, FileText, TrendingUp, Star, MapPin, Video, MessageSquare,
  Sparkles, Crown, Award, Syringe, Dna, Eye, Bone, Zap, Loader2
} from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { InlineError } from '@/components/ui/inline-error';
import api from '@/utils/api';
import { useAuth } from '@/auth/AuthProvider';
import { useToast } from '@/hooks/use-toast';
import MainLayout from '@/components/layout/MainLayout';
import aiHealthServices from '@/services/aiHealthServices';

// ─── Types ───────────────────────────────────────────────────────────────────
interface FamilyMember {
  id: string;
  name: string;
  relation: string;
  age: number;
  gender: string;
  avatar: string;
  healthScore: number | null;
  healthTrend: 'up' | 'down' | 'stable';
  bloodGroup?: string;
  allergies: string[];
  conditions: string[];
  medications: { name: string; dosage: string; time: string }[];
  upcomingAppointments: { doctor: string; specialty: string; date: string; type: string }[];
  vitals: { label: string; value: string; unit: string; status: 'normal' | 'warning' | 'critical'; icon: any }[];
  lastCheckup?: string;
  vaccinations: { name: string; date: string; next?: string }[];
  insuranceCovered: boolean;
}

// ─── Score Color Helper ──────────────────────────────────────────────────────
const scoreColor = (s: number | null) => s === null ? 'text-slate-400' : s > 80 ? 'text-emerald-400' : s > 60 ? 'text-amber-400' : 'text-red-400';
const scoreBg = (s: number) => s > 80 ? 'from-emerald-600/20' : s > 60 ? 'from-amber-600/20' : 'from-red-600/20';
const scoreGradient = (s: number | null) => s === null ? '#94a3b8' : s > 80 ? '#10b981' : s > 60 ? '#f59e0b' : '#ef4444';

// ─── Component ───────────────────────────────────────────────────────────────
export default function FamilyHealthHub() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [selectedMember, setSelectedMember] = useState<FamilyMember | null>(null);
  const [showAddMember, setShowAddMember] = useState(false);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [addForm, setAddForm] = useState({ firstName: '', lastName: '', relationship: 'spouse', dateOfBirth: '', gender: 'male', bloodGroup: '' });
  const [adding, setAdding] = useState(false);
  const [aiInsights, setAiInsights] = useState<Record<string, { summary: string; tips: string[] } | null>>({});
  const [loadingInsight, setLoadingInsight] = useState<string | null>(null);
  const [familyFetchError, setFamilyFetchError] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadFamilyData();
  }, []);

  const fetchAIInsight = async (member: FamilyMember) => {
    if (aiInsights[member.id] || loadingInsight === member.id) return;
    setLoadingInsight(member.id);
    try {
      const conditions = member.conditions.length > 0 ? member.conditions.join(', ') : 'none known';
      const allergies = member.allergies.length > 0 ? member.allergies.join(', ') : 'none';
      const result = await aiHealthServices.thinkWithBrain( `Give a brief health assessment for ${member.name}, ${member.age} years old, ${member.gender === 'F' ? 'female' : 'male'}. Conditions: ${conditions}. Allergies: ${allergies}. Health score: ${member.healthScore}/100 (unavailable if null; never infer missing results). Provide: 1) A 1-sentence health summary. 2) Exactly 3 short, actionable wellness tips. Respond in JSON: {"summary":"...","tips":["...","...","..."]}`,
        { context: { familyMemberId: member.id, source: 'User-managed family profile' } });
      if (result?.success && result?.response && !/temporarily unavailable|try again|unable to/i.test(result.response)) {
        try {
          const jsonMatch = result.response.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.summary && Array.isArray(parsed.tips)) {
              setAiInsights(prev => ({ ...prev, [member.id]: { summary: parsed.summary, tips: parsed.tips.slice(0, 3) } }));
              return;
            }
          }
        } catch { /* fall through */ }
        // Plain text fallback
        setAiInsights(prev => ({ ...prev, [member.id]: { summary: result.response.slice(0, 120), tips: [] } }));
      }
    } catch {
      setAiInsights(prev => ({ ...prev, [member.id]: null }));
    } finally {
      setLoadingInsight(null);
    }
  };

  // Map a backend FamilyMember record to the UI shape
  const mapMember = (m: any): FamilyMember => {
    const dob = m.dateOfBirth ? new Date(m.dateOfBirth) : null;
    const age = dob ? Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 3600 * 1000)) : 0;
    const name = [m.firstName, m.lastName].filter(Boolean).join(' ') || 'Family Member';
    const genderChar = (m.gender || '').toLowerCase().startsWith('f') ? 'F' : 'M';
    const avatarMap: Record<string, string> = {
      spouse: genderChar === 'F' ? '👩' : '👨',
      father: '👴', mother: '👵', son: '👦', daughter: '👧',
      brother: '👦', sister: '👧', grandfather: '👴', grandmother: '👵',
      guardian: '🧑', other: '🧑',
    };
    return {
      id: String(m.id),
      name,
      relation: m.relationship ? (m.relationship.charAt(0).toUpperCase() + m.relationship.slice(1)) : 'Family',
      age,
      gender: genderChar,
      avatar: avatarMap[m.relationship?.toLowerCase()] || '🧑',
      healthScore: null,
      healthTrend: 'stable',
      bloodGroup: m.bloodGroup || undefined,
      allergies: m.allergies || [],
      conditions: m.medicalConditions || [],
      medications: [],
      upcomingAppointments: [],
      vitals: [],
      lastCheckup: undefined,
      vaccinations: [],
      insuranceCovered: false,
    };
  };

  // Add current user as "Self" entry
  const selfEntry = (healthScore: number | null = null): FamilyMember => ({
    id: 'self',
    name: currentUser ? `${currentUser.firstName ?? ''} ${currentUser.lastName ?? ''}`.trim() || 'You' : 'You',
    relation: 'Self',
    age: currentUser?.dateOfBirth ? Math.floor((Date.now() - new Date(currentUser.dateOfBirth).getTime()) / (365.25 * 24 * 3600 * 1000)) : 0,
    gender: (currentUser?.gender || 'M')[0].toUpperCase(),
    avatar: '👤',
    healthScore,
    healthTrend: 'stable',
    bloodGroup: currentUser?.bloodGroup,
    allergies: [],
    conditions: [],
    medications: [],
    upcomingAppointments: [],
    vitals: [],
    vaccinations: [],
    insuranceCovered: true,
  });

  const loadFamilyData = async () => {
    setLoading(true);
    setFamilyFetchError(false);
    try {
      const [res, scoreRes] = await Promise.all([
        api.get('/family-members'),
        api.get('/health-score/today').catch(() => null),
      ]);
      const score = Number(scoreRes?.data?.score);
      const selfScore = scoreRes?.data?.success && scoreRes?.data?.score !== null && scoreRes?.data?.score !== undefined && Number.isFinite(score) ? Math.round(score) : null;
      if (res?.data?.success && Array.isArray(res.data.data)) {
        setMembers([selfEntry(selfScore), ...res.data.data.map(mapMember)]);
        setLoading(false);
        return;
      }
    } catch {
      setFamilyFetchError(true);
    }
    setMembers([selfEntry()]);
    setLoading(false);
  };

  const scoredMembers = members.filter(m => m.healthScore !== null);
  const avgHealthScore = scoredMembers.length > 0 ? Math.round(scoredMembers.reduce((s, m) => s + (m.healthScore ?? 0), 0) / scoredMembers.length) : null;

  const allUpcoming = members.flatMap(m =>
    m.upcomingAppointments.map(a => ({ ...a, member: m.name, avatar: m.avatar }))
  ).sort((a, b) => a.date.localeCompare(b.date));

  const allMedications = members.flatMap(m =>
    m.medications.map(med => ({ ...med, member: m.name, avatar: m.avatar }))
  );

  return (
    <MainLayout>
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      {/* ─── Hero Section ────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-violet-600/10 via-pink-600/5 to-transparent" />
        <div className="absolute top-0 right-0 w-64 h-64 bg-violet-500/5 rounded-full blur-3xl" />

        <div className="relative px-4 sm:px-6 pt-6 pb-4">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                <Heart className="h-6 w-6 text-pink-400" /> Family Hub
              </h1>
              <p className="text-sm text-slate-400 mt-1">{members.length} members in your health record • Check Benefits for plan coverage</p>
            </div>
            <Button size="sm" onClick={() => setShowAddMember(true)}
              className="bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 border-0 rounded-xl gap-1.5 shadow-lg shadow-violet-600/20">
              <UserPlus className="h-3.5 w-3.5" /> Add
            </Button>
          </div>

          {/* Family Health Score */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-br from-violet-600/15 to-pink-600/10 border border-violet-500/20 rounded-2xl p-5 mb-5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-40 h-40 bg-white/[0.02] rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="relative flex items-center gap-5">
              <div className="relative w-20 h-20 flex-shrink-0">
                <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                  <circle cx="40" cy="40" r="34" fill="none" stroke="#1e293b" strokeWidth="6" />
                  <circle cx="40" cy="40" r="34" fill="none" stroke={scoreGradient(avgHealthScore)}
                    strokeWidth="6" strokeLinecap="round"
                    strokeDasharray={`${(avgHealthScore ?? 0) * 2.136} 213.6`} />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center flex-col">
                  <span className={`text-xl font-bold ${scoreColor(avgHealthScore)}`}>{avgHealthScore ?? "—"}</span>
                  <span className="text-[8px] text-slate-500 uppercase">Family</span>
                </div>
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-white mb-2">Family Health Score</h3>
                <div className="flex flex-wrap gap-3">
                  {members.map(m => (
                    <div key={m.id} className="flex items-center gap-1.5">
                      <span className="text-sm">{m.avatar}</span>
                      <span className={`text-xs font-semibold ${scoreColor(m.healthScore)}`}>{m.healthScore ?? "—"}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* ─── Family Members Carousel ─────────────────────────────────────── */}
      <div className="px-4 sm:px-6 mb-6">
        {familyFetchError && (
          <InlineError message="Couldn't load family members." onRetry={() => loadFamilyData()} className="mb-4" />
        )}
        {!loading && !familyFetchError && members.length === 0 && (
          <EmptyState
            icon={Users}
            title="Just you for now"
            description="Add family members to track everyone's health in one place."
            action={{ label: 'Add a family member', onClick: () => setShowAddMember(true) }}
            className="mb-4"
          />
        )}
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 sm:-mx-6 sm:px-6 snap-x">
          {members.map((member, i) => (
            <motion.div key={member.id} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.1 }}
              onClick={() => { setSelectedMember(member); fetchAIInsight(member); }}
              className="flex-shrink-0 w-[140px] snap-start cursor-pointer group">
              <Card className="!p-0 overflow-hidden border-white/[0.06] hover:border-white/[0.15] bg-slate-900/50 transition-all">
                <CardContent className="p-4 text-center">
                  <div className="relative mx-auto w-14 h-14 mb-2">
                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-violet-500/20 to-pink-500/20 flex items-center justify-center text-2xl">
                      {member.avatar}
                    </div>
                    <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold"
                      style={{ background: scoreGradient(member.healthScore), color: 'white' }}>
                      {member.healthScore ?? "—"}
                    </div>
                  </div>
                  <h4 className="text-sm font-semibold text-white truncate">{member.name}</h4>
                  <p className="text-[10px] text-slate-500">{member.relation} • {member.age}y</p>
                  {member.upcomingAppointments.length > 0 && (
                    <Badge className="mt-2 bg-blue-500/10 text-blue-400 border-0 text-[8px]">
                      <Calendar className="h-2.5 w-2.5 mr-0.5" /> Apt. soon
                    </Badge>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ))}

          {/* Add Member Card */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
            onClick={() => setShowAddMember(true)}
            className="flex-shrink-0 w-[140px] snap-start cursor-pointer">
            <Card className="!p-0 border-dashed border-2 border-slate-700 hover:border-violet-500/40 bg-transparent transition-all h-full">
              <CardContent className="p-4 flex flex-col items-center justify-center h-full min-h-[140px]">
                <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center mb-2">
                  <Plus className="h-5 w-5 text-slate-500" />
                </div>
                <p className="text-[11px] text-slate-500 font-medium">Add Member</p>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>

      {/* ─── Upcoming Family Appointments ────────────────────────────────── */}
      {allUpcoming.length > 0 && (
        <div className="px-4 sm:px-6 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Calendar className="h-4 w-4 text-blue-400" /> Upcoming Appointments
            </h2>
            <Button variant="ghost" size="sm" className="text-blue-400 text-xs h-7 px-2" onClick={() => navigate('/appointments')}>
              View All <ChevronRight className="h-3 w-3 ml-0.5" />
            </Button>
          </div>
          <div className="space-y-2">
            {allUpcoming.map((apt, i) => (
              <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}>
                <Card className="!p-0 border-white/[0.06] bg-slate-900/50">
                  <CardContent className="p-3 flex items-center gap-3">
                    <span className="text-xl">{apt.avatar}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{apt.doctor}</p>
                      <p className="text-[10px] text-slate-500">{apt.specialty} • {apt.member}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs font-medium text-white">{new Date(apt.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                      <Badge className={`text-[8px] border-0 ${apt.type === 'Video' ? 'bg-blue-500/10 text-blue-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                        {apt.type === 'Video' ? <Video className="h-2.5 w-2.5 mr-0.5" /> : <MapPin className="h-2.5 w-2.5 mr-0.5" />}
                        {apt.type}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Family Medication Reminders ──────────────────────────────────── */}
      {allMedications.length > 0 && (
        <div className="px-4 sm:px-6 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Pill className="h-4 w-4 text-amber-400" /> Medication Reminders
            </h2>
          </div>
          <div className="space-y-2">
            {allMedications.map((med, i) => (
              <Card key={i} className="!p-0 border-white/[0.06] bg-slate-900/50">
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                    <Pill className="h-4 w-4 text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{med.name}</p>
                    <p className="text-[10px] text-slate-500">{med.dosage} • {med.member}</p>
                  </div>
                  <Badge className="bg-slate-800 text-slate-400 border-0 text-[10px]">
                    <Clock className="h-2.5 w-2.5 mr-0.5" /> {med.time}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ─── Quick Actions ───────────────────────────────────────────────── */}
      <div className="px-4 sm:px-6 mb-8">
        <h2 className="text-sm font-semibold text-white mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: Stethoscope, label: 'Book Doctor', desc: 'For any member', color: 'text-blue-400', bg: 'bg-blue-500/10', action: () => navigate('/doctors') },

            { icon: FileText, label: 'Health Records', desc: 'Shared family vault', color: 'text-violet-400', bg: 'bg-violet-500/10', action: () => navigate('/patient/my-reports') },
            { icon: AlertCircle, label: 'Emergency SOS', desc: 'Call 112 instantly', color: 'text-red-400', bg: 'bg-red-500/10', action: () => navigate('/emergency') },
          ].map((a, i) => (
            <motion.button key={i} onClick={a.action}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + i * 0.1 }}
              className="flex items-center gap-3 p-3.5 rounded-xl bg-slate-800/50 border border-white/[0.06] hover:border-white/[0.12] hover:bg-slate-800/80 transition-all text-left">
              <div className={`w-9 h-9 rounded-lg ${a.bg} flex items-center justify-center flex-shrink-0`}>
                <a.icon className={`h-4 w-4 ${a.color}`} />
              </div>
              <div>
                <p className="text-sm font-medium text-white">{a.label}</p>
                <p className="text-[10px] text-slate-500">{a.desc}</p>
              </div>
            </motion.button>
          ))}
        </div>
      </div>

      {/* ─── Member Detail Modal ─────────────────────────────────────────── */}
      <Dialog open={!!selectedMember} onOpenChange={() => setSelectedMember(null)}>
        <DialogContent className="bg-slate-900 border-white/10 max-w-md max-h-[85vh] overflow-y-auto">
          {selectedMember && (
            <>
              {/* Header */}
              <div className="flex items-center gap-4 mb-4">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-violet-500/20 to-pink-500/20 flex items-center justify-center text-3xl">
                  {selectedMember.avatar}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">{selectedMember.name}</h2>
                  <p className="text-sm text-slate-400">{selectedMember.relation} • {selectedMember.age} yrs • {selectedMember.bloodGroup || 'N/A'}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-sm font-bold ${scoreColor(selectedMember.healthScore)}`}>
                      Health Score: {selectedMember.healthScore ?? "Not enough data yet"}
                    </span>
                    {selectedMember.insuranceCovered && (
                      <Badge className="bg-emerald-500/10 text-emerald-400 border-0 text-[9px]">
                        <ShieldCheck className="h-3 w-3 mr-0.5" /> Insured
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* Vitals Grid */}
              {selectedMember.vitals.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">Latest Vitals</h4>
                  <div className="grid grid-cols-3 gap-2">
                    {selectedMember.vitals.map((v, i) => {
                      const VIcon = v.icon;
                      return (
                        <div key={i} className={`rounded-xl p-2.5 text-center ${
                          v.status === 'warning' ? 'bg-amber-500/5 border border-amber-500/20' :
                          v.status === 'critical' ? 'bg-red-500/5 border border-red-500/20' :
                          'bg-slate-800/50 border border-white/[0.06]'
                        }`}>
                          <VIcon className={`h-3.5 w-3.5 mx-auto mb-1 ${
                            v.status === 'warning' ? 'text-amber-400' :
                            v.status === 'critical' ? 'text-red-400' : 'text-slate-400'
                          }`} />
                          <p className="text-sm font-bold text-white">{v.value}</p>
                          <p className="text-[8px] text-slate-500 uppercase">{v.unit}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Allergies & Conditions */}
              {(selectedMember.allergies.length > 0 || selectedMember.conditions.length > 0) && (
                <div className="mb-4">
                  <h4 className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">Health Alerts</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedMember.allergies.map(a => (
                      <Badge key={a} className="bg-red-500/10 text-red-400 border-0 text-[10px]">⚠️ {a}</Badge>
                    ))}
                    {selectedMember.conditions.map(c => (
                      <Badge key={c} className="bg-amber-500/10 text-amber-400 border-0 text-[10px]">{c}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Medications */}
              {selectedMember.medications.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">Active Medications</h4>
                  {selectedMember.medications.map((med, i) => (
                    <div key={i} className="flex items-center gap-3 py-2 border-b border-white/[0.04] last:border-0">
                      <Pill className="h-4 w-4 text-amber-400 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm text-white">{med.name}</p>
                        <p className="text-[10px] text-slate-500">{med.dosage} • {med.time}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Vaccinations */}
              {selectedMember.vaccinations.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">Vaccinations</h4>
                  {selectedMember.vaccinations.map((v, i) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0">
                      <div className="flex items-center gap-2">
                        <Syringe className="h-3.5 w-3.5 text-emerald-400" />
                        <span className="text-sm text-white">{v.name}</span>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-slate-500">{new Date(v.date).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</p>
                        {v.next && <p className="text-[9px] text-blue-400">Next: {new Date(v.next).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* AI Health Insight */}
              <div className="mb-4">
                <h4 className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-violet-400" /> AI Health Insight
                </h4>
                {loadingInsight === selectedMember.id ? (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-violet-500/5 border border-violet-500/20">
                    <Loader2 className="h-4 w-4 text-violet-400 animate-spin shrink-0" />
                    <p className="text-xs text-slate-400">Generating AI health insight…</p>
                  </div>
                ) : aiInsights[selectedMember.id] ? (
                  <div className="p-3 rounded-xl bg-violet-500/5 border border-violet-500/20 space-y-2">
                    <p className="text-sm text-slate-300 leading-relaxed">{aiInsights[selectedMember.id]!.summary}</p>
                    {aiInsights[selectedMember.id]!.tips.length > 0 && (
                      <ul className="space-y-1.5 pt-1">
                        {aiInsights[selectedMember.id]!.tips.map((tip, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <Zap className="h-3 w-3 text-violet-400 mt-0.5 shrink-0" />
                            <span className="text-xs text-slate-400">{tip}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => fetchAIInsight(selectedMember)}
                    className="w-full flex items-center justify-center gap-2 p-3 rounded-xl bg-violet-500/5 border border-dashed border-violet-500/30 text-violet-400 text-xs hover:bg-violet-500/10 transition-colors"
                  >
                    <Brain className="h-4 w-4" /> Get AI Health Analysis
                  </button>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <Button className="flex-1 bg-blue-600 hover:bg-blue-500 border-0 rounded-xl gap-1" onClick={() => { setSelectedMember(null); navigate('/doctors'); }}>
                  <Stethoscope className="h-4 w-4" /> Book Doctor
                </Button>
                <Button variant="outline" className="flex-1 border-white/10 rounded-xl gap-1" onClick={() => { setSelectedMember(null); navigate('/patient/my-reports'); }}>
                  <FileText className="h-4 w-4" /> Records
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Add Member Modal ────────────────────────────────────────────── */}
      <Dialog open={showAddMember} onOpenChange={setShowAddMember}>
        <DialogContent className="bg-slate-900 border-white/10 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-white">Add Family Member</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="First Name" value={addForm.firstName}
                onChange={e => setAddForm(f => ({ ...f, firstName: e.target.value }))}
                className="bg-slate-800/50 border-white/[0.08] text-white rounded-xl" />
              <Input placeholder="Last Name" value={addForm.lastName}
                onChange={e => setAddForm(f => ({ ...f, lastName: e.target.value }))}
                className="bg-slate-800/50 border-white/[0.08] text-white rounded-xl" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <select value={addForm.relationship}
                onChange={e => setAddForm(f => ({ ...f, relationship: e.target.value }))}
                className="px-3 py-2.5 rounded-xl bg-slate-800/50 border border-white/[0.08] text-sm text-slate-300 outline-none">
                <option value="spouse">Spouse</option>
                <option value="son">Son</option>
                <option value="daughter">Daughter</option>
                <option value="father">Father</option>
                <option value="mother">Mother</option>
                <option value="grandfather">Grandfather</option>
                <option value="grandmother">Grandmother</option>
                <option value="other">Other</option>
              </select>
              <select value={addForm.gender}
                onChange={e => setAddForm(f => ({ ...f, gender: e.target.value }))}
                className="px-3 py-2.5 rounded-xl bg-slate-800/50 border border-white/[0.08] text-sm text-slate-300 outline-none">
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-slate-500 mb-1 block">Date of Birth</label>
                <Input type="date" value={addForm.dateOfBirth}
                  onChange={e => setAddForm(f => ({ ...f, dateOfBirth: e.target.value }))}
                  className="bg-slate-800/50 border-white/[0.08] text-white rounded-xl" />
              </div>
              <Input placeholder="Blood Group" value={addForm.bloodGroup}
                onChange={e => setAddForm(f => ({ ...f, bloodGroup: e.target.value }))}
                className="bg-slate-800/50 border-white/[0.08] text-white rounded-xl" />
            </div>
            <Button disabled={adding || !addForm.firstName}
              className="w-full bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 border-0 rounded-xl"
              onClick={async () => {
                setAdding(true);
                try {
                  await api.post('/family-members', {
                    firstName: addForm.firstName,
                    lastName: addForm.lastName || '',
                    relationship: addForm.relationship,
                    dateOfBirth: addForm.dateOfBirth || undefined,
                    gender: addForm.gender,
                    bloodGroup: addForm.bloodGroup || undefined,
                  });
                  toast({ title: 'Member added!', description: `${addForm.firstName} has been added to your family.` });
                  setShowAddMember(false);
                  setAddForm({ firstName: '', lastName: '', relationship: 'spouse', dateOfBirth: '', gender: 'male', bloodGroup: '' });
                  loadFamilyData();
                } catch (e: any) {
                  toast({ title: 'Failed to add member', description: e?.response?.data?.message ?? e.message, variant: 'destructive' });
                } finally {
                  setAdding(false);
                }
              }}>
              {adding ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <UserPlus className="h-4 w-4 mr-2" />}
              Add Member
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </MainLayout>
  );
}
