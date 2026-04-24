import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { 
  Trophy, 
  Medal, 
  Target, 
  Flame,
  Users, 
  TrendingUp, 
  Star,
  Crown,
  Gift,
  Calendar as CalendarIcon,
  Plus,
  Play,
  Pause,
  CheckCircle,
  Clock,
  Award,
  Zap,
  Heart,
  Footprints,
  Dumbbell,
  Apple,
  Moon,
  Droplets,
  Brain,
  Timer,
  BarChart3,
  Edit,
  Trash2,
  Eye,
  Send,
  PartyPopper,
  Sparkles
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import api from '@/utils/api';
import CorporateLayout from '@/components/corporate/CorporateLayout';
import CorporatePageHeader from '@/components/corporate/CorporatePageHeader';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface Challenge {
  id: string;
  title: string;
  description: string;
  type: 'steps' | 'workout' | 'nutrition' | 'sleep' | 'hydration' | 'mindfulness' | 'weight-loss' | 'custom';
  target: number;
  unit: string;
  startDate: string;
  endDate: string;
  status: 'draft' | 'active' | 'completed' | 'cancelled';
  participants: number;
  totalEmployees: number;
  rewards: {
    gold: string;
    silver: string;
    bronze: string;
  };
  icon: React.ElementType;
  color: string;
}

interface LeaderboardEntry {
  rank: number;
  oddsLast?: 'up' | 'down' | 'same';
  oddsAmount?: number;
  employeeId: string;
  name: string;
  avatar?: string;
  department: string;
  score: number;
  target: number;
  progress: number;
  streak: number;
  badges: string[];
  medal?: 'gold' | 'silver' | 'bronze';
}

interface ParticipantStats {
  totalParticipants: number;
  activeToday: number;
  avgProgress: number;
  completionRate: number;
}

const challengeTypes = [
  { value: 'steps', label: 'Step Challenge', icon: Footprints, unit: 'steps', defaultTarget: 10000, color: 'from-blue-500 to-blue-600' },
  { value: 'workout', label: 'Workout Minutes', icon: Dumbbell, unit: 'minutes', defaultTarget: 150, color: 'from-orange-500 to-orange-600' },
  { value: 'nutrition', label: 'Healthy Eating', icon: Apple, unit: 'meals', defaultTarget: 21, color: 'from-green-500 to-green-600' },
  { value: 'sleep', label: 'Sleep Challenge', icon: Moon, unit: 'hours', defaultTarget: 56, color: 'from-purple-500 to-purple-600' },
  { value: 'hydration', label: 'Hydration Goal', icon: Droplets, unit: 'glasses', defaultTarget: 56, color: 'from-cyan-500 to-cyan-600' },
  { value: 'mindfulness', label: 'Mindfulness', icon: Brain, unit: 'minutes', defaultTarget: 70, color: 'from-pink-500 to-pink-600' },
  { value: 'weight-loss', label: 'Weight Loss', icon: TrendingUp, unit: 'kg', defaultTarget: 3, color: 'from-rose-500 to-rose-600' },
  { value: 'custom', label: 'Custom Challenge', icon: Target, unit: 'points', defaultTarget: 100, color: 'from-slate-500 to-slate-600' },
];

const sampleChallenges: Challenge[] = [
  {
    id: '1',
    title: 'New Year Step Challenge',
    description: 'Walk 10,000 steps daily for the entire month. Track your steps and compete with colleagues!',
    type: 'steps',
    target: 300000,
    unit: 'steps',
    startDate: '2025-01-01',
    endDate: '2025-01-31',
    status: 'active',
    participants: 127,
    totalEmployees: 200,
    rewards: {
      gold: 'Fitness Smartwatch + ₹5,000 Amazon Voucher',
      silver: 'Wireless Earbuds + ₹3,000 Amazon Voucher',
      bronze: 'Fitness Band + ₹2,000 Amazon Voucher'
    },
    icon: Footprints,
    color: 'from-blue-500 to-blue-600'
  },
  {
    id: '2',
    title: 'Mindfulness Marathon',
    description: 'Practice 10 minutes of meditation daily. Use any mindfulness app and log your sessions.',
    type: 'mindfulness',
    target: 300,
    unit: 'minutes',
    startDate: '2025-01-15',
    endDate: '2025-02-15',
    status: 'active',
    participants: 89,
    totalEmployees: 200,
    rewards: {
      gold: 'Spa Voucher Worth ₹10,000',
      silver: 'Meditation App Annual Subscription',
      bronze: 'Aromatherapy Kit'
    },
    icon: Brain,
    color: 'from-pink-500 to-pink-600'
  },
  {
    id: '3',
    title: 'Hydration Heroes',
    description: 'Drink 8 glasses of water daily. Stay hydrated and energized throughout the workday!',
    type: 'hydration',
    target: 240,
    unit: 'glasses',
    startDate: '2025-01-01',
    endDate: '2025-01-31',
    status: 'completed',
    participants: 156,
    totalEmployees: 200,
    rewards: {
      gold: 'Premium Water Bottle Set + ₹3,000 Voucher',
      silver: 'Smart Water Bottle',
      bronze: 'Fruit Infuser Bottle'
    },
    icon: Droplets,
    color: 'from-cyan-500 to-cyan-600'
  },
  {
    id: '4',
    title: 'February Fitness Frenzy',
    description: 'Complete 150 minutes of workout per week. Any form of exercise counts!',
    type: 'workout',
    target: 600,
    unit: 'minutes',
    startDate: '2025-02-01',
    endDate: '2025-02-28',
    status: 'draft',
    participants: 0,
    totalEmployees: 200,
    rewards: {
      gold: 'Gym Membership (1 Year) + Sports Gear',
      silver: 'Gym Membership (6 Months)',
      bronze: 'Gym Membership (3 Months)'
    },
    icon: Dumbbell,
    color: 'from-orange-500 to-orange-600'
  }
];

const generateLeaderboard = (challengeId: string): LeaderboardEntry[] => {
  const names = [
    'Priya Sharma', 'Rahul Verma', 'Anita Gupta', 'Vikram Singh', 'Neha Patel',
    'Amit Kumar', 'Kavita Joshi', 'Rajesh Nair', 'Deepika Mehta', 'Suresh Reddy',
    'Pooja Agarwal', 'Arjun Malhotra', 'Sneha Iyer', 'Karthik Rao', 'Divya Pillai',
    'Manish Tiwari', 'Ritu Saxena', 'Sanjay Pandey', 'Meera Krishnan', 'Varun Kapoor'
  ];
  const departments = ['Engineering', 'Marketing', 'Sales', 'Finance', 'Operations', 'HR', 'Product', 'Design'];
  const badges = ['🔥 On Fire', '⚡ Speed Demon', '💪 Consistent', '🌟 Rising Star', '🏃 Marathon Runner', '🧘 Zen Master'];

  return names.map((name, i) => {
    const score = Math.floor(Math.random() * 50000) + 200000;
    const target = 300000;
    return {
      rank: i + 1,
      oddsLast: ['up', 'down', 'same'][Math.floor(Math.random() * 3)] as 'up' | 'down' | 'same',
      oddsAmount: Math.floor(Math.random() * 3) + 1,
      employeeId: `EMP${String(i + 1).padStart(4, '0')}`,
      name,
      department: departments[i % departments.length],
      score,
      target,
      progress: Math.min(100, Math.round((score / target) * 100)),
      streak: Math.floor(Math.random() * 20) + 1,
      badges: badges.slice(0, Math.floor(Math.random() * 3) + 1),
      medal: i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : undefined
    };
  }).sort((a, b) => b.score - a.score).map((entry, i) => ({
    ...entry,
    rank: i + 1,
    medal: i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : undefined
  }));
};

const MedalIcon: React.FC<{ type: 'gold' | 'silver' | 'bronze'; size?: 'sm' | 'lg' }> = ({ type, size = 'sm' }) => {
  const colors = {
    gold: 'from-yellow-400 to-yellow-600 text-yellow-900',
    silver: 'from-gray-300 to-gray-500 text-slate-200',
    bronze: 'from-amber-600 to-amber-800 text-amber-100'
  };
  const sizeClass = size === 'lg' ? 'w-16 h-16' : 'w-8 h-8';
  
  return (
    <div className={cn(
      'rounded-full bg-gradient-to-br flex items-center justify-center shadow-lg',
      colors[type],
      sizeClass
    )}>
      {type === 'gold' && <Crown className={size === 'lg' ? 'w-8 h-8' : 'w-4 h-4'} />}
      {type === 'silver' && <Medal className={size === 'lg' ? 'w-8 h-8' : 'w-4 h-4'} />}
      {type === 'bronze' && <Award className={size === 'lg' ? 'w-8 h-8' : 'w-4 h-4'} />}
    </div>
  );
};

const CorporateGamification: React.FC = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [selectedChallenge, setSelectedChallenge] = useState<Challenge | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [activeTab, setActiveTab] = useState('challenges');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [viewLeaderboardOpen, setViewLeaderboardOpen] = useState(false);
  const [declareWinnersOpen, setDeclareWinnersOpen] = useState(false);
  const [challengeFilter, setChallengeFilter] = useState('all');

  // New challenge form state
  const [newChallenge, setNewChallenge] = useState({
    title: '',
    description: '',
    type: 'steps',
    target: 10000,
    unit: 'steps',
    startDate: new Date(),
    endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    goldReward: '',
    silverReward: '',
    bronzeReward: ''
  });

  const stats = useMemo(() => ({
    totalChallenges: challenges.length,
    activeChallenges: challenges.filter(c => c.status === 'active').length,
    totalParticipants: challenges.reduce((sum, c) => sum + c.participants, 0),
    completedChallenges: challenges.filter(c => c.status === 'completed').length
  }), [challenges]);

  const filteredChallenges = useMemo(() => {
    if (challengeFilter === 'all') return challenges;
    return challenges.filter(c => c.status === challengeFilter);
  }, [challenges, challengeFilter]);

  const normalizeChallenge = (challenge: any): Challenge => {
    const typeConfig = challengeTypes.find(t => t.value === challenge.type);
    const resolvedIcon = challenge.icon || typeConfig?.icon || Target;
    const resolvedColor = challenge.color || typeConfig?.color || 'from-slate-500 to-slate-600';
    return {
      id: String(challenge.id),
      title: challenge.title || 'Untitled Challenge',
      description: challenge.description || '',
      type: (challenge.type || 'custom') as Challenge['type'],
      target: Number(challenge.target) || typeConfig?.defaultTarget || 100,
      unit: challenge.unit || typeConfig?.unit || 'points',
      startDate: challenge.startDate || format(new Date(), 'yyyy-MM-dd'),
      endDate: challenge.endDate || format(new Date(), 'yyyy-MM-dd'),
      status: (challenge.status || 'draft') as Challenge['status'],
      participants: Number(challenge.participants) || 0,
      totalEmployees: Number(challenge.totalEmployees) || 0,
      rewards: challenge.rewards || { gold: '', silver: '', bronze: '' },
      icon: resolvedIcon,
      color: resolvedColor
    };
  };

  const loadChallenges = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/corporate/challenges');
      const list = ((data as any)?.data?.challenges || []) as any[];
      setChallenges(list.map(normalizeChallenge));
    } catch (error: any) {
      setChallenges(sampleChallenges);
      toast({
        title: 'Failed to load challenges',
        description: error?.response?.data?.message || 'Showing sample challenges.',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadChallenges();
  }, []);

  const handleViewLeaderboard = (challenge: Challenge) => {
    setSelectedChallenge(challenge);
    setLeaderboard(generateLeaderboard(challenge.id));
    setViewLeaderboardOpen(true);
  };

  const handleDeclareWinners = (challenge: Challenge) => {
    setSelectedChallenge(challenge);
    setLeaderboard(generateLeaderboard(challenge.id));
    setDeclareWinnersOpen(true);
  };

  const handleCreateChallenge = async () => {
    const typeConfig = challengeTypes.find(t => t.value === newChallenge.type);
    
    try {
      const { data } = await api.post('/corporate/challenges', {
        title: newChallenge.title,
        description: newChallenge.description,
        type: newChallenge.type,
        target: newChallenge.target,
        unit: newChallenge.unit,
        startDate: format(newChallenge.startDate, 'yyyy-MM-dd'),
        endDate: format(newChallenge.endDate, 'yyyy-MM-dd'),
        rewards: {
          gold: newChallenge.goldReward,
          silver: newChallenge.silverReward,
          bronze: newChallenge.bronzeReward
        }
      });

      const created = (data as any)?.data?.challenge || {
        id: Date.now().toString(),
        title: newChallenge.title,
        description: newChallenge.description,
        type: newChallenge.type,
        target: newChallenge.target,
        unit: newChallenge.unit,
        startDate: format(newChallenge.startDate, 'yyyy-MM-dd'),
        endDate: format(newChallenge.endDate, 'yyyy-MM-dd'),
        status: 'draft',
        participants: 0,
        totalEmployees: 0,
        rewards: {
          gold: newChallenge.goldReward,
          silver: newChallenge.silverReward,
          bronze: newChallenge.bronzeReward
        }
      };

      const newChallengeData = normalizeChallenge({
        ...created,
        icon: typeConfig?.icon,
        color: typeConfig?.color
      });

      setChallenges((prev) => [newChallengeData, ...prev]);
      setCreateDialogOpen(false);
      setNewChallenge({
        title: '',
        description: '',
        type: 'steps',
        target: 10000,
        unit: 'steps',
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        goldReward: '',
        silverReward: '',
        bronzeReward: ''
      });
      toast({
        title: 'Challenge Created!',
        description: 'Your new wellness challenge has been created as a draft.'
      });
    } catch (error: any) {
      toast({
        title: 'Failed to create challenge',
        description: error?.response?.data?.message || 'Please try again.',
        variant: 'destructive'
      });
    }
  };

  const handleLaunchChallenge = async (challengeId: string) => {
    try {
      await api.put(`/corporate/challenges/${encodeURIComponent(challengeId)}`, { status: 'active' });
      setChallenges((prev) => prev.map(c => 
        c.id === challengeId ? { ...c, status: 'active' } : c
      ));
      toast({
        title: 'Challenge Launched! 🚀',
        description: 'Employees can now join and participate in this challenge.'
      });
    } catch (error: any) {
      toast({
        title: 'Failed to launch challenge',
        description: error?.response?.data?.message || 'Please try again.',
        variant: 'destructive'
      });
    }
  };

  const handleConfirmWinners = async () => {
    if (!selectedChallenge) return;
    try {
      await api.put(`/corporate/challenges/${encodeURIComponent(selectedChallenge.id)}`, { status: 'completed' });
      setChallenges((prev) => prev.map(c => 
        c.id === selectedChallenge.id ? { ...c, status: 'completed' } : c
      ));
      setDeclareWinnersOpen(false);
      toast({
        title: 'Winners Declared! 🎉',
        description: 'Congratulations to the winners! Notifications have been sent.'
      });
    } catch (error: any) {
      toast({
        title: 'Failed to declare winners',
        description: error?.response?.data?.message || 'Please try again.',
        variant: 'destructive'
      });
    }
  };

  const handleTypeChange = (type: string) => {
    const typeConfig = challengeTypes.find(t => t.value === type);
    setNewChallenge({
      ...newChallenge,
      type,
      unit: typeConfig?.unit || 'points',
      target: typeConfig?.defaultTarget || 100
    });
  };

  if (loading) {
    return (
      <CorporateLayout title="Wellness Challenges">
        <div className="flex items-center justify-center h-64">
          <Trophy className="h-8 w-8 animate-bounce text-amber-500" />
        </div>
      </CorporateLayout>
    );
  }

  return (
    <CorporateLayout title="Wellness Challenges & Leaderboards">
      <div className="space-y-6">
        <CorporatePageHeader
          icon={Trophy}
          title="Wellness Challenges & Gamification"
          description="Create health challenges, track participation, and reward top performers"
          gradient="from-amber-500 to-orange-600"
          showRefresh={true}
          onRefresh={loadChallenges}
          stats={[
            { label: 'Active Challenges', value: stats.activeChallenges },
            { label: 'Total Participants', value: stats.totalParticipants },
            { label: 'Completed', value: stats.completedChallenges },
            { label: 'Total Challenges', value: stats.totalChallenges }
          ]}
        />

        {/* Quick Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="bg-gradient-to-br from-amber-500 to-orange-600 text-white border-0">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-amber-100">Active Challenges</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.activeChallenges}</div>
              <p className="text-xs text-amber-200 mt-1">Running right now</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white border-0">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-emerald-100">Total Participants</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.totalParticipants}</div>
              <p className="text-xs text-emerald-200 mt-1">Across all challenges</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white border-0">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-blue-100">Avg Engagement</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">73%</div>
              <p className="text-xs text-blue-200 mt-1">
                <TrendingUp className="inline h-3 w-3 mr-1" />
                +12% this month
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white border-0">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-purple-100">Rewards Given</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">₹1.2L</div>
              <p className="text-xs text-purple-200 mt-1">This quarter</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
            <TabsList className="bg-slate-100 dark:bg-slate-800">
              <TabsTrigger value="challenges" className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700">
                <Target className="h-4 w-4 mr-2" />
                Challenges
              </TabsTrigger>
              <TabsTrigger value="leaderboards" className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700">
                <Trophy className="h-4 w-4 mr-2" />
                Leaderboards
              </TabsTrigger>
              <TabsTrigger value="rewards" className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700">
                <Gift className="h-4 w-4 mr-2" />
                Rewards
              </TabsTrigger>
            </TabsList>

            <div className="flex gap-2">
              <Select value={challengeFilter} onValueChange={setChallengeFilter}>
                <SelectTrigger className="w-[140px] bg-white dark:bg-slate-700">
                  <SelectValue placeholder="Filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={() => setCreateDialogOpen(true)} className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700">
                <Plus className="h-4 w-4 mr-2" />
                Create Challenge
              </Button>
            </div>
          </div>

          <TabsContent value="challenges" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              {filteredChallenges.map(challenge => {
                const ChallengeIcon = challenge.icon;
                return (
                  <Card key={challenge.id} className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 overflow-hidden">
                    <div className={cn('h-2 bg-gradient-to-r', challenge.color)} />
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className={cn('p-2 rounded-lg bg-gradient-to-br text-white', challenge.color)}>
                            <ChallengeIcon className="h-5 w-5" />
                          </div>
                          <div>
                            <CardTitle className="text-lg text-slate-900 dark:text-white">{challenge.title}</CardTitle>
                            <CardDescription className="text-slate-500 dark:text-slate-400">
                              {format(new Date(challenge.startDate), 'MMM d')} - {format(new Date(challenge.endDate), 'MMM d, yyyy')}
                            </CardDescription>
                          </div>
                        </div>
                        <Badge className={cn(
                          challenge.status === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                          challenge.status === 'completed' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                          challenge.status === 'draft' ? 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300' :
                          'bg-red-100 text-red-700'
                        )}>
                          {challenge.status.charAt(0).toUpperCase() + challenge.status.slice(1)}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="text-sm text-slate-600 dark:text-slate-400">{challenge.description}</p>
                      
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                          <Users className="h-4 w-4" />
                          <span>{challenge.participants} / {challenge.totalEmployees} participants</span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                          <Target className="h-4 w-4" />
                          <span>{challenge.target.toLocaleString()} {challenge.unit}</span>
                        </div>
                      </div>

                      <Progress value={(challenge.participants / challenge.totalEmployees) * 100} className="h-2" />

                      <div className="flex items-center gap-2 pt-2">
                        <div className="flex items-center gap-1">
                          <MedalIcon type="gold" />
                          <span className="text-xs text-slate-500 truncate max-w-[100px]" title={challenge.rewards.gold}>{challenge.rewards.gold}</span>
                        </div>
                      </div>

                      <div className="flex gap-2 pt-2">
                        {challenge.status === 'draft' && (
                          <Button size="sm" className="flex-1" onClick={() => handleLaunchChallenge(challenge.id)}>
                            <Play className="h-4 w-4 mr-1" />
                            Launch
                          </Button>
                        )}
                        {challenge.status === 'active' && (
                          <>
                            <Button size="sm" variant="outline" className="flex-1" onClick={() => handleViewLeaderboard(challenge)}>
                              <Eye className="h-4 w-4 mr-1" />
                              Leaderboard
                            </Button>
                            <Button size="sm" className="flex-1 bg-gradient-to-r from-amber-500 to-orange-600" onClick={() => handleDeclareWinners(challenge)}>
                              <Trophy className="h-4 w-4 mr-1" />
                              Declare Winners
                            </Button>
                          </>
                        )}
                        {challenge.status === 'completed' && (
                          <Button size="sm" variant="outline" className="flex-1" onClick={() => handleViewLeaderboard(challenge)}>
                            <Eye className="h-4 w-4 mr-1" />
                            View Results
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {filteredChallenges.length === 0 && (
              <div className="text-center py-12">
                <Trophy className="h-12 w-12 mx-auto text-slate-300 mb-4" />
                <p className="text-slate-500">No challenges found. Create your first wellness challenge!</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="leaderboards" className="space-y-4">
            <Card className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
              <CardHeader>
                <CardTitle className="text-slate-900 dark:text-white">Active Challenge Leaderboards</CardTitle>
                <CardDescription className="text-slate-500 dark:text-slate-400">
                  Select a challenge to view its leaderboard
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {challenges.filter(c => c.status === 'active' || c.status === 'completed').map(challenge => {
                    const ChallengeIcon = challenge.icon;
                    return (
                      <Card 
                        key={challenge.id} 
                        className="cursor-pointer hover:shadow-md transition-shadow border-slate-200 dark:border-slate-700"
                        onClick={() => handleViewLeaderboard(challenge)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-center gap-3">
                            <div className={cn('p-2 rounded-lg bg-gradient-to-br text-white', challenge.color)}>
                              <ChallengeIcon className="h-5 w-5" />
                            </div>
                            <div className="flex-1">
                              <h4 className="font-semibold text-slate-900 dark:text-white">{challenge.title}</h4>
                              <p className="text-sm text-slate-500">{challenge.participants} participants</p>
                            </div>
                            <Badge className={challenge.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}>
                              {challenge.status}
                            </Badge>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Top Performers Overall */}
            <Card className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
                  <Sparkles className="h-5 w-5 text-amber-500" />
                  Top Performers - All Time
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-3">
                  {['gold', 'silver', 'bronze'].map((medal, index) => {
                    const entry = generateLeaderboard('all')[index];
                    return (
                      <Card key={medal} className={cn(
                        'border-2',
                        medal === 'gold' ? 'border-yellow-400 bg-gradient-to-br from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20' :
                        medal === 'silver' ? 'border-slate-500 bg-gradient-to-br from-gray-50 to-slate-50 dark:from-gray-900/20 dark:to-slate-900/20' :
                        'border-amber-600 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20'
                      )}>
                        <CardContent className="p-6 text-center">
                          <MedalIcon type={medal as 'gold' | 'silver' | 'bronze'} size="lg" />
                          <h3 className="text-xl font-bold mt-4 text-slate-900 dark:text-white">{entry.name}</h3>
                          <p className="text-sm text-slate-500 dark:text-slate-400">{entry.department}</p>
                          <div className="mt-3 flex items-center justify-center gap-2">
                            <Flame className="h-4 w-4 text-orange-500" />
                            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{entry.streak} day streak</span>
                          </div>
                          <div className="flex flex-wrap justify-center gap-1 mt-2">
                            {entry.badges.slice(0, 2).map((badge, i) => (
                              <span key={i} className="text-xs">{badge}</span>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="rewards" className="space-y-4">
            <Card className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
              <CardHeader>
                <CardTitle className="text-slate-900 dark:text-white">Rewards & Prizes</CardTitle>
                <CardDescription className="text-slate-500 dark:text-slate-400">
                  Manage rewards for challenge winners
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {challenges.map(challenge => (
                    <div key={challenge.id} className="p-4 border border-slate-200 dark:border-slate-700 rounded-lg">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="font-semibold text-slate-900 dark:text-white">{challenge.title}</h4>
                        <Badge className={challenge.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}>
                          {challenge.status}
                        </Badge>
                      </div>
                      <div className="grid gap-3 md:grid-cols-3">
                        <div className="flex items-start gap-3 p-3 bg-gradient-to-br from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20 rounded-lg">
                          <MedalIcon type="gold" />
                          <div>
                            <p className="text-xs font-medium text-amber-800 dark:text-amber-400">Gold Prize</p>
                            <p className="text-sm text-slate-700 dark:text-slate-300">{challenge.rewards.gold}</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3 p-3 bg-gradient-to-br from-gray-50 to-slate-50 dark:from-gray-900/20 dark:to-slate-900/20 rounded-lg">
                          <MedalIcon type="silver" />
                          <div>
                            <p className="text-xs font-medium text-slate-300 dark:text-slate-500">Silver Prize</p>
                            <p className="text-sm text-slate-700 dark:text-slate-300">{challenge.rewards.silver}</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3 p-3 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-lg">
                          <MedalIcon type="bronze" />
                          <div>
                            <p className="text-xs font-medium text-amber-800 dark:text-amber-400">Bronze Prize</p>
                            <p className="text-sm text-slate-700 dark:text-slate-300">{challenge.rewards.bronze}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Create Challenge Dialog */}
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent className="max-w-2xl bg-white dark:bg-slate-800">
            <DialogHeader>
              <DialogTitle className="text-slate-900 dark:text-white">Create New Wellness Challenge</DialogTitle>
              <DialogDescription className="text-slate-500 dark:text-slate-400">
                Set up a new health challenge for your employees
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Challenge Title</Label>
                  <Input
                    id="title"
                    value={newChallenge.title}
                    onChange={e => setNewChallenge({ ...newChallenge, title: e.target.value })}
                    placeholder="e.g., January Step Challenge"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="type">Challenge Type</Label>
                  <Select value={newChallenge.type} onValueChange={handleTypeChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {challengeTypes.map(type => (
                        <SelectItem key={type.value} value={type.value}>
                          <div className="flex items-center gap-2">
                            <type.icon className="h-4 w-4" />
                            {type.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={newChallenge.description}
                  onChange={e => setNewChallenge({ ...newChallenge, description: e.target.value })}
                  placeholder="Describe the challenge rules and how participants can track their progress..."
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Target Goal</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      value={newChallenge.target}
                      onChange={e => setNewChallenge({ ...newChallenge, target: parseInt(e.target.value) || 0 })}
                    />
                    <Input
                      value={newChallenge.unit}
                      onChange={e => setNewChallenge({ ...newChallenge, unit: e.target.value })}
                      className="w-24"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-2">
                    <Label>Start Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-start text-left font-normal">
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {format(newChallenge.startDate, 'PPP')}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={newChallenge.startDate}
                          onSelect={date => date && setNewChallenge({ ...newChallenge, startDate: date })}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-2">
                    <Label>End Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-start text-left font-normal">
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {format(newChallenge.endDate, 'PPP')}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={newChallenge.endDate}
                          onSelect={date => date && setNewChallenge({ ...newChallenge, endDate: date })}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t">
                <h4 className="font-semibold flex items-center gap-2 text-slate-900 dark:text-white">
                  <Gift className="h-4 w-4 text-amber-500" />
                  Prizes & Rewards
                </h4>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <MedalIcon type="gold" />
                    <Input
                      value={newChallenge.goldReward}
                      onChange={e => setNewChallenge({ ...newChallenge, goldReward: e.target.value })}
                      placeholder="Gold prize (1st place)"
                      className="flex-1"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <MedalIcon type="silver" />
                    <Input
                      value={newChallenge.silverReward}
                      onChange={e => setNewChallenge({ ...newChallenge, silverReward: e.target.value })}
                      placeholder="Silver prize (2nd place)"
                      className="flex-1"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <MedalIcon type="bronze" />
                    <Input
                      value={newChallenge.bronzeReward}
                      onChange={e => setNewChallenge({ ...newChallenge, bronzeReward: e.target.value })}
                      placeholder="Bronze prize (3rd place)"
                      className="flex-1"
                    />
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
              <Button 
                onClick={handleCreateChallenge}
                disabled={!newChallenge.title || !newChallenge.description}
                className="bg-gradient-to-r from-amber-500 to-orange-600"
              >
                Create Challenge
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* View Leaderboard Dialog */}
        <Dialog open={viewLeaderboardOpen} onOpenChange={setViewLeaderboardOpen}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto bg-white dark:bg-slate-800">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
                <Trophy className="h-5 w-5 text-amber-500" />
                {selectedChallenge?.title} - Leaderboard
              </DialogTitle>
              <DialogDescription className="text-slate-500 dark:text-slate-400">
                Live rankings based on participant progress
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {/* Top 3 Podium */}
              <div className="flex items-end justify-center gap-4 py-6">
                {/* Silver - 2nd Place */}
                <div className="text-center">
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-gray-200 to-gray-400 mx-auto mb-2 flex items-center justify-center text-2xl font-bold text-slate-300">
                    {leaderboard[1]?.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <MedalIcon type="silver" />
                  <p className="font-semibold mt-2 text-slate-900 dark:text-white">{leaderboard[1]?.name}</p>
                  <p className="text-sm text-slate-500">{leaderboard[1]?.score.toLocaleString()} {selectedChallenge?.unit}</p>
                  <div className="h-16 w-20 bg-gradient-to-t from-gray-300 to-gray-400 rounded-t-lg mt-2" />
                </div>
                {/* Gold - 1st Place */}
                <div className="text-center -mt-8">
                  <Crown className="h-8 w-8 text-yellow-500 mx-auto mb-1" />
                  <div className="w-24 h-24 rounded-full bg-gradient-to-br from-yellow-300 to-yellow-500 mx-auto mb-2 flex items-center justify-center text-3xl font-bold text-yellow-800">
                    {leaderboard[0]?.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <MedalIcon type="gold" />
                  <p className="font-bold text-lg mt-2 text-slate-900 dark:text-white">{leaderboard[0]?.name}</p>
                  <p className="text-sm text-slate-500">{leaderboard[0]?.score.toLocaleString()} {selectedChallenge?.unit}</p>
                  <div className="h-24 w-24 bg-gradient-to-t from-yellow-400 to-yellow-500 rounded-t-lg mt-2" />
                </div>
                {/* Bronze - 3rd Place */}
                <div className="text-center">
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-amber-500 to-amber-700 mx-auto mb-2 flex items-center justify-center text-2xl font-bold text-amber-100">
                    {leaderboard[2]?.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <MedalIcon type="bronze" />
                  <p className="font-semibold mt-2 text-slate-900 dark:text-white">{leaderboard[2]?.name}</p>
                  <p className="text-sm text-slate-500">{leaderboard[2]?.score.toLocaleString()} {selectedChallenge?.unit}</p>
                  <div className="h-12 w-20 bg-gradient-to-t from-amber-600 to-amber-700 rounded-t-lg mt-2" />
                </div>
              </div>

              {/* Full Leaderboard */}
              <div className="border rounded-lg overflow-hidden dark:border-slate-700">
                <table className="w-full">
                  <thead className="bg-slate-50 dark:bg-slate-900">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Rank</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Employee</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Department</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Score</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Progress</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Streak</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {leaderboard.map(entry => (
                      <tr key={entry.employeeId} className={cn(
                        'hover:bg-slate-50 dark:hover:bg-slate-700/50',
                        entry.medal && 'bg-gradient-to-r from-transparent',
                        entry.medal === 'gold' && 'to-yellow-50 dark:to-yellow-900/10',
                        entry.medal === 'silver' && 'to-gray-50 dark:to-gray-900/10',
                        entry.medal === 'bronze' && 'to-amber-50 dark:to-amber-900/10'
                      )}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {entry.medal ? (
                              <MedalIcon type={entry.medal} />
                            ) : (
                              <span className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-sm font-medium text-slate-700 dark:text-slate-300">
                                {entry.rank}
                              </span>
                            )}
                            {entry.oddsLast === 'up' && <TrendingUp className="h-3 w-3 text-emerald-500" />}
                            {entry.oddsLast === 'down' && <TrendingUp className="h-3 w-3 text-red-500 rotate-180" />}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white text-xs font-bold">
                              {entry.name.split(' ').map(n => n[0]).join('')}
                            </div>
                            <div>
                              <p className="font-medium text-slate-900 dark:text-white">{entry.name}</p>
                              <p className="text-xs text-slate-500">{entry.employeeId}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{entry.department}</td>
                        <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{entry.score.toLocaleString()}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Progress value={entry.progress} className="w-20 h-2" />
                            <span className="text-xs text-slate-500">{entry.progress}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <Flame className="h-4 w-4 text-orange-500" />
                            <span className="text-sm text-slate-700 dark:text-slate-300">{entry.streak}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Declare Winners Dialog */}
        <Dialog open={declareWinnersOpen} onOpenChange={setDeclareWinnersOpen}>
          <DialogContent className="max-w-2xl bg-white dark:bg-slate-800">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
                <PartyPopper className="h-5 w-5 text-amber-500" />
                Declare Winners - {selectedChallenge?.title}
              </DialogTitle>
              <DialogDescription className="text-slate-500 dark:text-slate-400">
                Confirm the top 3 winners and award prizes
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-6 py-4">
              <div className="text-center py-4">
                <Sparkles className="h-12 w-12 text-amber-500 mx-auto mb-2" />
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">Congratulations to the Winners!</h3>
              </div>

              {/* Winners */}
              <div className="space-y-4">
                {[
                  { medal: 'gold' as const, entry: leaderboard[0], reward: selectedChallenge?.rewards.gold },
                  { medal: 'silver' as const, entry: leaderboard[1], reward: selectedChallenge?.rewards.silver },
                  { medal: 'bronze' as const, entry: leaderboard[2], reward: selectedChallenge?.rewards.bronze }
                ].map(({ medal, entry, reward }) => (
                  <Card key={medal} className={cn(
                    'border-2',
                    medal === 'gold' ? 'border-yellow-400 bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20' :
                    medal === 'silver' ? 'border-slate-500 bg-gradient-to-r from-gray-50 to-slate-50 dark:from-gray-900/20 dark:to-slate-900/20' :
                    'border-amber-600 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20'
                  )}>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-4">
                        <MedalIcon type={medal} size="lg" />
                        <div className="flex-1">
                          <h4 className="text-lg font-bold text-slate-900 dark:text-white">{entry?.name}</h4>
                          <p className="text-sm text-slate-500">{entry?.department} • {entry?.score.toLocaleString()} {selectedChallenge?.unit}</p>
                        </div>
                        <div className="text-right">
                          <Badge className="bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border">
                            <Gift className="h-3 w-3 mr-1" />
                            Prize
                          </Badge>
                          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-[200px]">{reward}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                <p className="text-sm text-blue-700 dark:text-blue-400">
                  <CheckCircle className="h-4 w-4 inline mr-2" />
                  Declaring winners will:
                </p>
                <ul className="text-sm text-blue-600 dark:text-blue-300 ml-6 mt-2 list-disc space-y-1">
                  <li>Mark this challenge as completed</li>
                  <li>Send congratulation notifications to winners</li>
                  <li>Update the leaderboard permanently</li>
                  <li>Notify HR team to arrange prize distribution</li>
                </ul>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeclareWinnersOpen(false)}>Cancel</Button>
              <Button 
                onClick={handleConfirmWinners}
                className="bg-gradient-to-r from-amber-500 to-orange-600"
              >
                <Trophy className="h-4 w-4 mr-2" />
                Confirm & Declare Winners
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </CorporateLayout>
  );
};

export default CorporateGamification;
