/**
 * WellnessRewards — World-Class Gamified Wellness & Rewards
 * 
 * Premium engagement features like MediBuddy/HealthifyMe:
 * - Daily/Weekly/Monthly challenges with rewards
 * - Leaderboard with company-wide rankings
 * - Health coins economy (earn & redeem)
 * - Achievement badges & levels
 * - Streak tracking with multipliers
 * - Team challenges for departments
 * - Reward store (discounts, vouchers, premium features)
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Trophy, Flame, Star, Crown, Zap, Gift, Target, Medal, Award,
  TrendingUp, Heart, Footprints, Moon, Droplets, Apple, Brain,
  Users, ChevronRight, Clock, CheckCircle, Lock, Sparkles,
  ArrowUp, ShoppingBag, Ticket, Coffee, Dumbbell, Bike, Timer,
  HeartPulse, Activity, Calendar, BarChart3, CircleDollarSign,
  PartyPopper, Gem, Shield
} from 'lucide-react';
import api from '@/utils/api';
import { getToken } from '@/hooks/auth';
import { useAuth } from '@/auth/AuthProvider';
import MainLayout from '@/components/layout/MainLayout';
import aiHealthServices from '@/services/aiHealthServices';

// ─── Types ───────────────────────────────────────────────────────────────────
interface Challenge {
  id: string;
  title: string;
  description: string;
  icon: any;
  reward: number;
  type: 'daily' | 'weekly' | 'monthly' | 'special';
  category: 'steps' | 'sleep' | 'water' | 'mindfulness' | 'nutrition' | 'fitness' | 'checkup';
  target: number;
  current: number;
  unit: string;
  deadline: string;
  difficulty: 'easy' | 'medium' | 'hard';
  participants?: number;
  completed: boolean;
}

interface LeaderboardEntry {
  rank: number;
  name: string;
  avatar: string;
  department: string;
  score: number;
  streak: number;
  level: number;
  isYou?: boolean;
}

interface RewardItem {
  id: string;
  title: string;
  description: string;
  icon: any;
  cost: number;
  category: 'voucher' | 'health' | 'premium' | 'merchandise';
  image?: string;
  available: boolean;
  popular?: boolean;
}

// ─── Level Data ──────────────────────────────────────────────────────────────
const levels = [
  { level: 1, name: 'Health Starter', xpNeeded: 0, icon: '🌱' },
  { level: 2, name: 'Wellness Seeker', xpNeeded: 500, icon: '💪' },
  { level: 3, name: 'Active Warrior', xpNeeded: 1500, icon: '⚡' },
  { level: 4, name: 'Health Champion', xpNeeded: 3000, icon: '🏆' },
  { level: 5, name: 'Wellness Master', xpNeeded: 5000, icon: '👑' },
  { level: 6, name: 'Health Legend', xpNeeded: 10000, icon: '🌟' },
];

const difficultyColor = { easy: 'text-emerald-400 bg-emerald-500/10', medium: 'text-amber-400 bg-amber-500/10', hard: 'text-red-400 bg-red-500/10' };

// ─── Component ───────────────────────────────────────────────────────────────
export default function WellnessRewards() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [tab, setTab] = useState<'challenges' | 'leaderboard' | 'rewards' | 'badges'>('challenges');
  const [challengeFilter, setChallengeFilter] = useState<'all' | 'daily' | 'weekly' | 'monthly'>('all');
  const [loading, setLoading] = useState(true);
  const [walletLoading, setWalletLoading] = useState(true);
  const [dailyClaiming, setDailyClaiming] = useState(false);
  const [dailyClaimed, setDailyClaimed] = useState(false);
  const [aiChallenges, setAiChallenges] = useState<{ title: string; description: string; reward: number; category: string }[]>([]);
  const [loadingAI, setLoadingAI] = useState(false);

  // ─── State ──────────────────────────────────────────────────────────────
  const [userData, setUserData] = useState({
    coins: 0,
    xp: 0,
    level: 1,
    streak: 0,
    longestStreak: 0,
    totalChallenges: 0,
    rankInCompany: 0,
    totalEmployees: 0,
  });

  // Load wallet data from backend
  useEffect(() => {
    const loadWallet = async () => {
      setWalletLoading(true);
      try {
        const res = await api.get('/wallet');
        if (res?.data?.success) {
          const d = res.data.data;
          setUserData(prev => ({
            ...prev,
            coins: Math.round(d.balance ?? 0),
            streak: d.streakDays ?? d.streak ?? 0,
            // derive level from coins (every 1000 coins = 1 level, max 6)
            level: Math.min(6, Math.floor((d.balance ?? 0) / 1000) + 1),
            // XP mirrors coins for display purposes
            xp: Math.round(d.totalEarned ?? d.balance ?? 0),
          }));
          // If today's daily login was already claimed, mark it
          if (d.todayActivity) setDailyClaimed(true);
        }
      } catch {
        // silent — show demo values already in state
      } finally {
        setWalletLoading(false);
        setLoading(false);
      }
    };
    loadWallet();
  }, []);

  // Load AI-personalized challenges after wallet data is ready
  useEffect(() => {
    if (loading) return;
    const loadAIChallenges = async () => {
      setLoadingAI(true);
      try {
        let riskContext = 'general wellness';
        try {
          const riskRes = await aiHealthServices.getMyRiskScore();
          if (riskRes?.score?.risk_factors?.length) {
            riskContext = riskRes.score.risk_factors.slice(0, 3).join(', ');
          }
        } catch { /* use generic context */ }

        const brainRes = await aiHealthServices.thinkWithBrain({
          query: `Based on health risks: ${riskContext}, suggest 3 personalized daily wellness challenges with coin rewards. Respond ONLY in JSON array: [{"title":"...","description":"...","reward":25,"category":"fitness|sleep|water|mindfulness|nutrition"},...]`,
          type: 'wellness_coaching',
        });
        if (brainRes?.response) {
          const match = brainRes.response.match(/\[[\s\S]*\]/);
          if (match) {
            const parsed = JSON.parse(match[0]);
            if (Array.isArray(parsed)) {
              setAiChallenges(parsed.slice(0, 3));
            }
          }
        }
      } catch { /* silent — static challenges still shown */ }
      setLoadingAI(false);
    };
    loadAIChallenges();
  }, [loading]);

  const claimDailyLogin = async () => {
    if (dailyClaimed || dailyClaiming) return;
    setDailyClaiming(true);
    try {
      const res = await api.post('/wallet/earn/daily-login');
      if (res?.data?.success) {
        setUserData(prev => ({ ...prev, coins: Math.round(res.data.newBalance ?? prev.coins + 1), streak: res.data.streak ?? prev.streak }));
        setDailyClaimed(true);
      }
    } catch { /* silent */ }
    setDailyClaiming(false);
  };

  const currentLevel = levels.find(l => l.level === userData.level) || levels[0];
  const nextLevel = levels.find(l => l.level === userData.level + 1);
  const xpProgress = nextLevel ? ((userData.xp - currentLevel.xpNeeded) / (nextLevel.xpNeeded - currentLevel.xpNeeded)) * 100 : 100;

  const [challenges] = useState<Challenge[]>([
    { id: '1', title: '10K Steps Challenge', description: 'Walk 10,000 steps today', icon: Footprints, reward: 50, type: 'daily', category: 'steps', target: 10000, current: 6542, unit: 'steps', deadline: 'Today', difficulty: 'medium', completed: false },
    { id: '2', title: 'Hydration Hero', description: 'Drink 8 glasses of water', icon: Droplets, reward: 30, type: 'daily', category: 'water', target: 8, current: 5, unit: 'glasses', deadline: 'Today', difficulty: 'easy', completed: false },
    { id: '3', title: 'Sleep Champion', description: 'Get 8+ hours of sleep tonight', icon: Moon, reward: 40, type: 'daily', category: 'sleep', target: 8, current: 0, unit: 'hours', deadline: 'Tomorrow', difficulty: 'easy', completed: false },
    { id: '4', title: 'Mindful Minutes', description: 'Complete 15 minutes of meditation', icon: Brain, reward: 35, type: 'daily', category: 'mindfulness', target: 15, current: 0, unit: 'minutes', deadline: 'Today', difficulty: 'easy', completed: false },
    { id: '5', title: 'Step Marathon', description: 'Walk 50,000 steps this week', icon: Footprints, reward: 200, type: 'weekly', category: 'steps', target: 50000, current: 32500, unit: 'steps', deadline: 'Sunday', difficulty: 'medium', participants: 127, completed: false },
    { id: '6', title: 'Gym Warrior', description: '4 workout sessions this week', icon: Dumbbell, reward: 150, type: 'weekly', category: 'fitness', target: 4, current: 2, unit: 'sessions', deadline: 'Sunday', difficulty: 'hard', participants: 89, completed: false },
    { id: '7', title: 'Clean Eating Week', description: 'Log meals for 7 consecutive days', icon: Apple, reward: 180, type: 'weekly', category: 'nutrition', target: 7, current: 4, unit: 'days', deadline: 'Sunday', difficulty: 'medium', participants: 65, completed: false },
    { id: '8', title: 'Health Checkup', description: 'Complete annual health screening', icon: HeartPulse, reward: 500, type: 'monthly', category: 'checkup', target: 1, current: 0, unit: 'checkup', deadline: 'Mar 31', difficulty: 'easy', completed: false },
    { id: '9', title: 'Cycle to Work', description: '10 cycling sessions this month', icon: Bike, reward: 400, type: 'monthly', category: 'fitness', target: 10, current: 3, unit: 'rides', deadline: 'Mar 31', difficulty: 'hard', participants: 34, completed: false },
    { id: '10', title: 'Morning Warrior', description: 'Wake up before 6 AM for 20 days', icon: Timer, reward: 350, type: 'monthly', category: 'sleep', target: 20, current: 14, unit: 'days', deadline: 'Mar 31', difficulty: 'hard', completed: false },
  ]);

  const [leaderboard] = useState<LeaderboardEntry[]>([
    { rank: 1, name: 'Rahul Sharma', avatar: '👨‍💻', department: 'Engineering', score: 8450, streak: 45, level: 5 },
    { rank: 2, name: 'Sneha Patel', avatar: '👩‍🔬', department: 'R&D', score: 8120, streak: 38, level: 5 },
    { rank: 3, name: 'Aditya Kumar', avatar: '👨‍💼', department: 'Sales', score: 7890, streak: 32, level: 4 },
    { rank: 4, name: 'Priya Nair', avatar: '👩‍⚕️', department: 'HR', score: 7650, streak: 28, level: 4 },
    { rank: 5, name: 'Vikram Singh', avatar: '👨‍🏫', department: 'Operations', score: 7340, streak: 25, level: 4 },
    { rank: 23, name: currentUser?.firstName || 'You', avatar: '🧑', department: 'Your Dept', score: 4280, streak: 12, level: 3, isYou: true },
  ]);

  const [rewards] = useState<RewardItem[]>([
    { id: '1', title: 'Amazon ₹500 Voucher', description: 'Redeem on Amazon.in', icon: ShoppingBag, cost: 1000, category: 'voucher', available: true, popular: true },
    { id: '2', title: 'Starbucks ₹300', description: 'Coffee on us!', icon: Coffee, cost: 600, category: 'voucher', available: true },
    { id: '3', title: 'Free Doctor Consult', description: 'Video consultation with specialist', icon: HeartPulse, cost: 500, category: 'health', available: true, popular: true },
    { id: '4', title: 'Lab Test Package', description: 'Basic health screening', icon: Activity, cost: 800, category: 'health', available: true },
    { id: '5', title: 'Premium Membership', description: '1 month unlimited consultations', icon: Crown, cost: 2000, category: 'premium', available: true },
    { id: '6', title: 'Gym Pass (1 Month)', description: 'Cult.fit / Gold\'s Gym', icon: Dumbbell, cost: 1500, category: 'health', available: true },
    { id: '7', title: 'Movie Tickets (2)', description: 'BookMyShow ₹400', icon: Ticket, cost: 800, category: 'voucher', available: true },
    { id: '8', title: 'Health Insurance Top-Up', description: 'Extra ₹1L cover for 1 year', icon: Shield, cost: 5000, category: 'premium', available: false },
  ]);

  const [badges] = useState([
    { id: '1', name: 'First Steps', icon: '🏃', desc: 'Complete your first challenge', earned: true, date: '2026-01-15' },
    { id: '2', name: '7-Day Streak', icon: '🔥', desc: 'Maintain a 7-day streak', earned: true, date: '2026-01-22' },
    { id: '3', name: 'Water Champion', icon: '💧', desc: 'Hit hydration goal 30 times', earned: true, date: '2026-02-10' },
    { id: '4', name: 'Step Master', icon: '👟', desc: '10K steps for 30 days', earned: true, date: '2026-02-28' },
    { id: '5', name: 'Team Player', icon: '🤝', desc: 'Join 5 team challenges', earned: true, date: '2026-03-05' },
    { id: '6', name: 'Health Guru', icon: '🧘', desc: 'Complete health assessment', earned: true, date: '2026-03-10' },
    { id: '7', name: '30-Day Streak', icon: '⚡', desc: 'Maintain a 30-day streak', earned: false },
    { id: '8', name: 'Century Walker', icon: '🏅', desc: '100K steps in a week', earned: false },
    { id: '9', name: 'Wellness Legend', icon: '👑', desc: 'Reach Level 5', earned: false },
    { id: '10', name: 'Early Bird', icon: '🌅', desc: 'Wake before 6 AM for 30 days', earned: false },
    { id: '11', name: 'Nutrition Pro', icon: '🥗', desc: 'Log meals for 60 days', earned: false },
    { id: '12', name: 'Mindfulness Master', icon: '🧠', desc: '100 meditation sessions', earned: false },
  ]);

  const filteredChallenges = challengeFilter === 'all' ? challenges : challenges.filter(c => c.type === challengeFilter);

  return (
    <MainLayout>
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      {/* ─── Hero Stats ──────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-amber-600/10 via-orange-600/5 to-transparent" />
        <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl" />

        <div className="relative px-4 sm:px-6 pt-6 pb-4">
          {/* Level Progress Bar */}
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-r from-amber-600/15 to-orange-600/10 border border-amber-500/20 rounded-2xl p-4 mb-5">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center text-2xl">
                  {currentLevel.icon}
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white">Level {userData.level} — {currentLevel.name}</h2>
                  <p className="text-xs text-slate-400">{userData.xp.toLocaleString()} XP</p>
                </div>
              </div>
              {nextLevel && (
                <div className="text-right">
                  <p className="text-[10px] text-slate-500">Next Level</p>
                  <p className="text-xs font-semibold text-amber-400">{nextLevel.icon} {nextLevel.name}</p>
                </div>
              )}
            </div>
            {nextLevel && (
              <div className="relative h-2 bg-slate-800 rounded-full overflow-hidden">
                <motion.div initial={{ width: 0 }} animate={{ width: `${xpProgress}%` }}
                  transition={{ delay: 0.3, duration: 0.8, ease: 'easeOut' }}
                  className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full" />
              </div>
            )}
            {nextLevel && (
              <p className="text-[10px] text-slate-500 text-right mt-1">
                {(nextLevel.xpNeeded - userData.xp).toLocaleString()} XP to next level
              </p>
            )}
          </motion.div>

          {/* Stats Grid */}
          <div className="grid grid-cols-4 gap-2 mb-5">
            {[
              { icon: CircleDollarSign, value: userData.coins.toLocaleString(), label: 'Health Coins', color: 'text-amber-400', bg: 'bg-amber-500/10' },
              { icon: Flame, value: `${userData.streak}`, label: 'Day Streak', color: 'text-orange-400', bg: 'bg-orange-500/10' },
              { icon: Trophy, value: `#${userData.rankInCompany}`, label: `of ${userData.totalEmployees}`, color: 'text-violet-400', bg: 'bg-violet-500/10' },
              { icon: Target, value: `${userData.totalChallenges}`, label: 'Completed', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
            ].map((s, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.1 }}
                className="bg-slate-800/50 border border-white/[0.06] rounded-xl p-3 text-center">
                <div className={`w-8 h-8 rounded-lg ${s.bg} flex items-center justify-center mx-auto mb-1.5`}>
                  <s.icon className={`h-4 w-4 ${s.color}`} />
                </div>
                <p className="text-sm font-bold text-white">{s.value}</p>
                <p className="text-[9px] text-slate-500">{s.label}</p>
              </motion.div>
            ))}
          </div>

          {/* Daily Login Reward */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
            className="flex items-center justify-between bg-slate-800/50 border border-white/[0.06] rounded-xl px-4 py-3 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-500/15 flex items-center justify-center">
                <Flame className="h-4 w-4 text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">Daily Login Reward</p>
                <p className="text-[10px] text-slate-500">+1 Health Coin • Streak {userData.streak} days</p>
              </div>
            </div>
            <Button size="sm" disabled={dailyClaimed || dailyClaiming}
              onClick={claimDailyLogin}
              className={`rounded-lg text-xs border-0 ${dailyClaimed ? 'bg-emerald-600/20 text-emerald-400' : 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30'}`}>
              {dailyClaimed ? '✓ Claimed' : dailyClaiming ? '...' : 'Claim'}
            </Button>
          </motion.div>
        </div>
      </div>

      {/* ─── Tab Navigation ──────────────────────────────────────────────── */}
      <div className="px-4 sm:px-6">
        <div className="flex gap-1 bg-slate-800/50 rounded-xl p-1 mb-5">
          {([
            { key: 'challenges', label: 'Challenges', icon: Target },
            { key: 'leaderboard', label: 'Leaderboard', icon: Trophy },
            { key: 'rewards', label: 'Rewards', icon: Gift },
            { key: 'badges', label: 'Badges', icon: Medal },
          ] as const).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-medium transition-all ${
                tab === t.key ? 'bg-white/10 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'
              }`}>
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {/* ─── Challenges Tab ───────────────────────────────────────────── */}
          {tab === 'challenges' && (
            <motion.div key="challenges" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
              {/* AI Recommended Challenges */}
              {(loadingAI || aiChallenges.length > 0) && (
                <div className="mb-5">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-violet-400" /> AI Recommended for You
                  </h3>
                  {loadingAI ? (
                    <div className="flex items-center gap-2 p-4 rounded-xl bg-violet-500/5 border border-violet-500/20">
                      <Brain className="h-4 w-4 text-violet-400 animate-pulse shrink-0" />
                      <p className="text-xs text-slate-400">Generating personalized challenges…</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {aiChallenges.map((ch, i) => (
                        <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
                          <Card className="!p-0 border-violet-500/20 bg-violet-500/5">
                            <CardContent className="p-3 flex items-start gap-3">
                              <div className="w-8 h-8 rounded-lg bg-violet-500/15 flex items-center justify-center shrink-0">
                                <Sparkles className="h-4 w-4 text-violet-400" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className="text-sm font-semibold text-white truncate">{ch.title}</h4>
                                <p className="text-[11px] text-slate-400">{ch.description}</p>
                              </div>
                              <span className="text-[10px] text-amber-400 font-semibold shrink-0 flex items-center gap-0.5">
                                <CircleDollarSign className="h-3 w-3" />{ch.reward}
                              </span>
                            </CardContent>
                          </Card>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Filter */}
              <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
                {(['all', 'daily', 'weekly', 'monthly'] as const).map(f => (
                  <button key={f} onClick={() => setChallengeFilter(f)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                      challengeFilter === f ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-800/50 text-slate-500 hover:text-slate-300'
                    }`}>
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>

              <div className="space-y-3 pb-8">
                {filteredChallenges.map((ch, i) => {
                  const pct = ch.target > 0 ? Math.min(100, (ch.current / ch.target) * 100) : 0;
                  const Icon = ch.icon;
                  return (
                    <motion.div key={ch.id} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}>
                      <Card className="!p-0 overflow-hidden border-white/[0.06] bg-slate-900/50 hover:border-white/[0.12] transition-all">
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/15 to-orange-500/10 flex items-center justify-center flex-shrink-0">
                              <Icon className="h-5 w-5 text-amber-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <h3 className="text-sm font-semibold text-white truncate">{ch.title}</h3>
                                <Badge className={`${difficultyColor[ch.difficulty]} border-0 text-[8px]`}>
                                  {ch.difficulty}
                                </Badge>
                              </div>
                              <p className="text-[11px] text-slate-500 mb-2">{ch.description}</p>
                              <div className="flex items-center gap-3 text-[10px] text-slate-500 mb-2">
                                <span className="flex items-center gap-0.5"><Clock className="h-3 w-3" /> {ch.deadline}</span>
                                {ch.participants && <span className="flex items-center gap-0.5"><Users className="h-3 w-3" /> {ch.participants} joined</span>}
                                <span className="flex items-center gap-0.5 text-amber-400"><CircleDollarSign className="h-3 w-3" /> {ch.reward} coins</span>
                              </div>
                              <div className="relative h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                                  transition={{ delay: 0.3 + i * 0.1, duration: 0.5 }}
                                  className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full" />
                              </div>
                              <p className="text-[10px] text-slate-500 mt-1">
                                {ch.current.toLocaleString()} / {ch.target.toLocaleString()} {ch.unit}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* ─── Leaderboard Tab ──────────────────────────────────────────── */}
          {tab === 'leaderboard' && (
            <motion.div key="leaderboard" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
              {/* Top 3 Podium */}
              <div className="flex items-end justify-center gap-3 mb-6 pt-4">
                {[leaderboard[1], leaderboard[0], leaderboard[2]].map((entry, i) => {
                  const placement = i === 0 ? 2 : i === 1 ? 1 : 3;
                  const heights = ['h-24', 'h-32', 'h-20'];
                  const badges = ['🥈', '🥇', '🥉'];
                  return (
                    <motion.div key={entry.rank} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 + i * 0.15 }}
                      className="flex flex-col items-center flex-1">
                      <span className="text-2xl mb-1">{entry.avatar}</span>
                      <p className="text-[11px] font-semibold text-white truncate max-w-full">{entry.name}</p>
                      <p className="text-[9px] text-slate-500 mb-2">{entry.score.toLocaleString()} pts</p>
                      <div className={`${heights[i]} w-full rounded-t-xl flex flex-col items-center justify-start pt-3 ${
                        placement === 1 ? 'bg-gradient-to-t from-amber-600/30 to-amber-500/10 border-t border-x border-amber-500/30' :
                        placement === 2 ? 'bg-gradient-to-t from-slate-600/30 to-slate-500/10 border-t border-x border-slate-500/30' :
                        'bg-gradient-to-t from-orange-800/30 to-orange-700/10 border-t border-x border-orange-600/30'
                      }`}>
                        <span className="text-2xl">{badges[i]}</span>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {/* Full List */}
              <div className="space-y-2 pb-8">
                {leaderboard.slice(3).map((entry, i) => (
                  <motion.div key={entry.rank} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 + i * 0.05 }}>
                    <Card className={`!p-0 border-white/[0.06] ${entry.isYou ? 'bg-amber-600/5 border-amber-500/20' : 'bg-slate-900/50'}`}>
                      <CardContent className="p-3 flex items-center gap-3">
                        <span className={`text-sm font-bold w-6 text-center ${entry.isYou ? 'text-amber-400' : 'text-slate-500'}`}>
                          #{entry.rank}
                        </span>
                        <span className="text-xl">{entry.avatar}</span>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-semibold truncate ${entry.isYou ? 'text-amber-400' : 'text-white'}`}>
                            {entry.name} {entry.isYou && '(You)'}
                          </p>
                          <p className="text-[10px] text-slate-500">{entry.department} • Lv.{entry.level}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-bold text-white">{entry.score.toLocaleString()}</p>
                          <p className="text-[10px] text-orange-400 flex items-center justify-end gap-0.5">
                            <Flame className="h-3 w-3" /> {entry.streak}d
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {/* ─── Rewards Tab ──────────────────────────────────────────────── */}
          {tab === 'rewards' && (
            <motion.div key="rewards" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
              {/* Balance Banner */}
              <div className="bg-gradient-to-r from-amber-600/15 to-orange-600/10 border border-amber-500/20 rounded-2xl p-4 mb-5 flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider">Your Balance</p>
                  <p className="text-2xl font-bold text-amber-400 flex items-center gap-1">
                    <CircleDollarSign className="h-5 w-5" /> {userData.coins.toLocaleString()}
                  </p>
                  <p className="text-[10px] text-slate-500">Health Coins</p>
                </div>
                <Button size="sm" onClick={() => navigate('/wallet')}
                  className="bg-amber-600 hover:bg-amber-500 border-0 rounded-xl text-xs gap-1">
                  <TrendingUp className="h-3.5 w-3.5" /> Earn More
                </Button>
              </div>

              {/* Reward Items */}
              <div className="grid grid-cols-2 gap-3 pb-8">
                {rewards.map((item, i) => {
                  const canAfford = userData.coins >= item.cost;
                  const Icon = item.icon;
                  return (
                    <motion.div key={item.id} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.05 }}>
                      <Card className={`!p-0 overflow-hidden border-white/[0.06] ${!item.available ? 'opacity-50' : 'hover:border-white/[0.12]'} bg-slate-900/50 transition-all`}>
                        <CardContent className="p-4 flex flex-col h-full">
                          {item.popular && (
                            <Badge className="bg-amber-500/10 text-amber-400 border-0 text-[8px] self-start mb-2">
                              <Star className="h-2.5 w-2.5 mr-0.5 fill-amber-400" /> Popular
                            </Badge>
                          )}
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/15 to-orange-500/10 flex items-center justify-center mb-3 mx-auto">
                            <Icon className="h-5 w-5 text-amber-400" />
                          </div>
                          <h4 className="text-xs font-semibold text-white text-center mb-0.5">{item.title}</h4>
                          <p className="text-[10px] text-slate-500 text-center mb-3">{item.description}</p>
                          <div className="mt-auto">
                            <Button size="sm" disabled={!canAfford || !item.available}
                              className={`w-full rounded-lg text-[11px] h-8 ${
                                canAfford && item.available
                                  ? 'bg-amber-600 hover:bg-amber-500 border-0'
                                  : 'bg-slate-800 text-slate-500 border-white/5'
                              }`}>
                              <CircleDollarSign className="h-3 w-3 mr-0.5" /> {item.cost.toLocaleString()}
                              {!item.available && <Lock className="h-3 w-3 ml-1" />}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* ─── Badges Tab ───────────────────────────────────────────────── */}
          {tab === 'badges' && (
            <motion.div key="badges" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
              <div className="mb-4 text-center">
                <p className="text-sm text-slate-400">
                  <span className="text-white font-semibold">{badges.filter(b => b.earned).length}</span> of {badges.length} badges earned
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3 pb-8">
                {badges.map((badge, i) => (
                  <motion.div key={badge.id} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.05 }}>
                    <Card className={`!p-0 overflow-hidden border-white/[0.06] ${!badge.earned ? 'opacity-40' : ''} bg-slate-900/50 text-center`}>
                      <CardContent className="p-3">
                        <div className={`text-3xl mb-1 ${!badge.earned ? 'grayscale' : ''}`}>{badge.icon}</div>
                        <h4 className="text-[10px] font-semibold text-white mb-0.5">{badge.name}</h4>
                        <p className="text-[8px] text-slate-500">{badge.desc}</p>
                        {badge.earned && badge.date && (
                          <p className="text-[8px] text-emerald-400 mt-1">
                            ✓ {new Date(badge.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                          </p>
                        )}
                        {!badge.earned && (
                          <div className="flex items-center justify-center gap-0.5 mt-1">
                            <Lock className="h-2.5 w-2.5 text-slate-600" />
                            <span className="text-[8px] text-slate-600">Locked</span>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
    </MainLayout>
  );
}
