import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import MainLayout from '@/components/layout/MainLayout';
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
  BarChart3,
  ChevronUp,
  ChevronDown,
  Minus,
  PartyPopper,
  Sparkles,
  User,
  Building2,
  ArrowUp,
  ArrowDown,
  RefreshCw
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import api from '@/utils/api';
import { format, differenceInDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { useAuth } from '@/auth/AuthProvider';

interface Challenge {
  id: string;
  title: string;
  description: string;
  type: 'steps' | 'workout' | 'nutrition' | 'sleep' | 'hydration' | 'mindfulness' | 'weight-loss' | 'custom';
  target: number;
  unit: string;
  startDate: string;
  endDate: string;
  status: 'active' | 'completed' | 'upcoming';
  totalParticipants: number;
  rewards: {
    gold: string;
    silver: string;
    bronze: string;
  };
  icon: React.ElementType;
  color: string;
  // User's personal data for this challenge
  myProgress: number;
  myRank: number;
  myStreak: number;
  joined: boolean;
}

interface LeaderboardEntry {
  rank: number;
  previousRank?: number;
  employeeId: string;
  name: string;
  avatar?: string;
  department: string;
  score: number;
  progress: number;
  streak: number;
  badges: string[];
  medal?: 'gold' | 'silver' | 'bronze';
  isMe?: boolean;
}

interface TeamStats {
  teamName: string;
  department: string;
  totalMembers: number;
  activeMembers: number;
  avgScore: number;
  rank: number;
  previousRank?: number;
}

interface MyStats {
  totalPoints: number;
  totalChallenges: number;
  completedChallenges: number;
  currentStreak: number;
  longestStreak: number;
  badges: { id: string; name: string; icon: string; earnedDate: string }[];
  rank: number;
  previousRank?: number;
  percentile: number;
}

interface Winner {
  challengeId: string;
  challengeTitle: string;
  medal: 'gold' | 'silver' | 'bronze';
  name: string;
  department: string;
  score: number;
  reward: string;
  date: string;
}

const challengeTypes = [
  { value: 'steps', label: 'Steps', icon: Footprints, color: 'from-blue-500 to-blue-600', bgColor: 'bg-blue-100 text-blue-700' },
  { value: 'workout', label: 'Workout', icon: Dumbbell, color: 'from-orange-500 to-orange-600', bgColor: 'bg-orange-100 text-orange-700' },
  { value: 'nutrition', label: 'Nutrition', icon: Apple, color: 'from-green-500 to-green-600', bgColor: 'bg-green-100 text-green-700' },
  { value: 'sleep', label: 'Sleep', icon: Moon, color: 'from-purple-500 to-purple-600', bgColor: 'bg-purple-100 text-purple-700' },
  { value: 'hydration', label: 'Hydration', icon: Droplets, color: 'from-cyan-500 to-cyan-600', bgColor: 'bg-cyan-100 text-cyan-700' },
  { value: 'mindfulness', label: 'Mindfulness', icon: Brain, color: 'from-pink-500 to-pink-600', bgColor: 'bg-pink-100 text-pink-700' },
];

// Sample data for the current user
const currentUserData = {
  id: 'emp-001',
  name: 'You',
  department: 'Engineering',
  avatar: null
};

const generateSampleChallenges = (): Challenge[] => {
  return [
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
      totalParticipants: 127,
      rewards: {
        gold: 'Fitness Smartwatch + ₹5,000 Amazon Voucher',
        silver: 'Wireless Earbuds + ₹3,000 Amazon Voucher',
        bronze: 'Fitness Band + ₹2,000 Amazon Voucher'
      },
      icon: Footprints,
      color: 'from-blue-500 to-blue-600',
      myProgress: 185000,
      myRank: 12,
      myStreak: 15,
      joined: true
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
      totalParticipants: 89,
      rewards: {
        gold: 'Spa Voucher Worth ₹10,000',
        silver: 'Meditation App Annual Subscription',
        bronze: 'Aromatherapy Kit'
      },
      icon: Brain,
      color: 'from-pink-500 to-pink-600',
      myProgress: 120,
      myRank: 8,
      myStreak: 10,
      joined: true
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
      totalParticipants: 156,
      rewards: {
        gold: 'Premium Water Bottle Set + ₹3,000 Voucher',
        silver: 'Smart Water Bottle',
        bronze: 'Fruit Infuser Bottle'
      },
      icon: Droplets,
      color: 'from-cyan-500 to-cyan-600',
      myProgress: 240,
      myRank: 3,
      myStreak: 30,
      joined: true
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
      status: 'upcoming',
      totalParticipants: 45,
      rewards: {
        gold: 'Gym Membership (1 Year) + Sports Gear',
        silver: 'Gym Membership (6 Months)',
        bronze: 'Gym Membership (3 Months)'
      },
      icon: Dumbbell,
      color: 'from-orange-500 to-orange-600',
      myProgress: 0,
      myRank: 0,
      myStreak: 0,
      joined: false
    }
  ];
};

const generateLeaderboard = (includeMe: boolean = true): LeaderboardEntry[] => {
  const names = [
    'Priya Sharma', 'Rahul Verma', 'Anita Gupta', 'Vikram Singh', 'Neha Patel',
    'Amit Kumar', 'Kavita Joshi', 'Rajesh Nair', 'Deepika Mehta', 'Suresh Reddy',
    'Pooja Agarwal', 'Arjun Malhotra', 'Sneha Iyer', 'Karthik Rao', 'Divya Pillai',
    'Manish Tiwari', 'Ritu Saxena', 'Sanjay Pandey', 'Meera Krishnan', 'Varun Kapoor'
  ];
  
  const departments = ['Engineering', 'HR', 'Finance', 'Marketing', 'Operations', 'Sales', 'Product', 'Design'];
  
  const leaderboard: LeaderboardEntry[] = names.map((name, index) => {
    const baseScore = 95000 - (index * 3500) + Math.floor(Math.random() * 2000);
    const previousRank = index + 1 + (Math.random() > 0.5 ? 1 : -1) * Math.floor(Math.random() * 3);
    return {
      rank: index + 1,
      previousRank: Math.max(1, Math.min(20, previousRank)),
      employeeId: `emp-${String(index + 2).padStart(3, '0')}`,
      name,
      department: departments[index % departments.length],
      score: Math.max(0, baseScore),
      progress: Math.min(100, Math.floor((baseScore / 300000) * 100)),
      streak: Math.floor(Math.random() * 20) + 5,
      badges: ['🔥', '⭐', '💪'].slice(0, Math.floor(Math.random() * 3) + 1),
      medal: index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : undefined,
      isMe: false
    };
  });

  // Insert current user at position 12
  if (includeMe) {
    const myEntry: LeaderboardEntry = {
      rank: 12,
      previousRank: 15,
      employeeId: 'emp-001',
      name: 'You',
      department: 'Engineering',
      score: 61500,
      progress: 62,
      streak: 15,
      badges: ['🔥', '⭐'],
      isMe: true
    };
    leaderboard.splice(11, 0, myEntry);
    // Adjust ranks after insertion
    leaderboard.forEach((entry, idx) => {
      entry.rank = idx + 1;
    });
  }

  return leaderboard.slice(0, 20);
};

const generateTeamLeaderboard = (): TeamStats[] => {
  const teams = [
    { name: 'Tech Titans', dept: 'Engineering' },
    { name: 'Finance Force', dept: 'Finance' },
    { name: 'Marketing Mavericks', dept: 'Marketing' },
    { name: 'HR Heroes', dept: 'HR' },
    { name: 'Sales Stars', dept: 'Sales' },
    { name: 'Ops Olympians', dept: 'Operations' },
    { name: 'Product Panthers', dept: 'Product' },
    { name: 'Design Dragons', dept: 'Design' }
  ];

  return teams.map((team, index) => ({
    teamName: team.name,
    department: team.dept,
    totalMembers: Math.floor(Math.random() * 20) + 15,
    activeMembers: Math.floor(Math.random() * 15) + 10,
    avgScore: 85000 - (index * 5000) + Math.floor(Math.random() * 3000),
    rank: index + 1,
    previousRank: index + 1 + (Math.random() > 0.5 ? 1 : -1)
  }));
};

const generateMyStats = (): MyStats => ({
  totalPoints: 15750,
  totalChallenges: 8,
  completedChallenges: 5,
  currentStreak: 15,
  longestStreak: 28,
  badges: [
    { id: 'b1', name: 'First Steps', icon: '👟', earnedDate: '2024-12-01' },
    { id: 'b2', name: 'Week Warrior', icon: '🔥', earnedDate: '2024-12-08' },
    { id: 'b3', name: 'Hydration Hero', icon: '💧', earnedDate: '2024-12-15' },
    { id: 'b4', name: 'Team Player', icon: '🤝', earnedDate: '2024-12-20' },
    { id: 'b5', name: 'Mindful Master', icon: '🧘', earnedDate: '2025-01-10' },
  ],
  rank: 12,
  previousRank: 15,
  percentile: 88
});

const generateWinners = (): Winner[] => [
  {
    challengeId: '3',
    challengeTitle: 'Hydration Heroes',
    medal: 'gold',
    name: 'Priya Sharma',
    department: 'Engineering',
    score: 248,
    reward: 'Premium Water Bottle Set + ₹3,000 Voucher',
    date: '2025-01-31'
  },
  {
    challengeId: '3',
    challengeTitle: 'Hydration Heroes',
    medal: 'silver',
    name: 'Rahul Verma',
    department: 'Marketing',
    score: 245,
    reward: 'Smart Water Bottle',
    date: '2025-01-31'
  },
  {
    challengeId: '3',
    challengeTitle: 'Hydration Heroes',
    medal: 'bronze',
    name: 'You',
    department: 'Engineering',
    score: 240,
    reward: 'Fruit Infuser Bottle',
    date: '2025-01-31'
  },
  {
    challengeId: 'prev1',
    challengeTitle: 'December Step Sprint',
    medal: 'gold',
    name: 'Vikram Singh',
    department: 'Sales',
    score: 320000,
    reward: 'Fitness Smartwatch',
    date: '2024-12-31'
  },
  {
    challengeId: 'prev1',
    challengeTitle: 'December Step Sprint',
    medal: 'silver',
    name: 'Neha Patel',
    department: 'HR',
    score: 305000,
    reward: 'Wireless Earbuds',
    date: '2024-12-31'
  }
];

const EmployeeGamification: React.FC = () => {
  const { toast } = useToast();
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [teamLeaderboard, setTeamLeaderboard] = useState<TeamStats[]>([]);
  const [myStats, setMyStats] = useState<MyStats | null>(null);
  const [winners, setWinners] = useState<Winner[]>([]);
  const [selectedChallenge, setSelectedChallenge] = useState<string>('1');
  const [activeTab, setActiveTab] = useState('my-progress');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      // Try to fetch from API
      const [challengesRes, statsRes] = await Promise.all([
        api.get('/corporate/gamification/employee/challenges').catch(() => ({ data: null })),
        api.get('/corporate/gamification/employee/stats').catch(() => ({ data: null }))
      ]);

      setChallenges(challengesRes.data?.data?.challenges || generateSampleChallenges());
      setMyStats(statsRes.data?.data?.stats || generateMyStats());
      setLeaderboard(generateLeaderboard());
      setTeamLeaderboard(generateTeamLeaderboard());
      setWinners(generateWinners());
    } catch (error) {
      setChallenges(generateSampleChallenges());
      setMyStats(generateMyStats());
      setLeaderboard(generateLeaderboard());
      setTeamLeaderboard(generateTeamLeaderboard());
      setWinners(generateWinners());
    } finally {
      setLoading(false);
    }
  };

  const handleJoinChallenge = (challengeId: string) => {
    setChallenges(prev => prev.map(c => 
      c.id === challengeId ? { ...c, joined: true, myProgress: 0, myRank: c.totalParticipants + 1 } : c
    ));
    toast({
      title: 'Challenge Joined!',
      description: 'You have successfully joined the challenge. Start tracking your progress!'
    });
  };

  const activeChallenges = useMemo(() => challenges.filter(c => c.status === 'active' && c.joined), [challenges]);
  const availableChallenges = useMemo(() => challenges.filter(c => (c.status === 'active' || c.status === 'upcoming') && !c.joined), [challenges]);
  const completedChallenges = useMemo(() => challenges.filter(c => c.status === 'completed'), [challenges]);

  const selectedChallengeData = useMemo(() => 
    challenges.find(c => c.id === selectedChallenge) || challenges[0],
    [challenges, selectedChallenge]
  );

  const getMedalIcon = (medal?: 'gold' | 'silver' | 'bronze') => {
    if (!medal) return null;
    const colors = {
      gold: 'text-yellow-500',
      silver: 'text-slate-400',
      bronze: 'text-amber-600'
    };
    return <Medal className={cn('h-5 w-5', colors[medal])} />;
  };

  const getRankChange = (current: number, previous?: number) => {
    if (!previous) return null;
    const diff = previous - current;
    if (diff > 0) return <span className="flex items-center text-green-600 text-xs"><ArrowUp className="h-3 w-3" />+{diff}</span>;
    if (diff < 0) return <span className="flex items-center text-red-600 text-xs"><ArrowDown className="h-3 w-3" />{diff}</span>;
    return <span className="flex items-center text-slate-400 text-xs"><Minus className="h-3 w-3" /></span>;
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="h-8 w-8 animate-spin text-emerald-600" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Trophy className="h-7 w-7 text-amber-500" />
              Wellness Challenges & Leaderboard
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1">
              Track your progress, compete with colleagues, and win exciting rewards
            </p>
          </div>
          <Button onClick={loadData} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* My Stats Overview */}
        {myStats && (
          <div className="grid gap-4 md:grid-cols-5">
            <Card className="bg-gradient-to-br from-amber-500 to-orange-600 text-white border-0">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm opacity-80">My Rank</p>
                    <div className="flex items-center gap-2">
                      <p className="text-3xl font-bold">#{myStats.rank}</p>
                      {getRankChange(myStats.rank, myStats.previousRank)}
                    </div>
                    <p className="text-xs opacity-70">Top {100 - myStats.percentile}%</p>
                  </div>
                  <Crown className="h-10 w-10 opacity-80" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white border-0">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm opacity-80">Total Points</p>
                    <p className="text-3xl font-bold">{myStats.totalPoints.toLocaleString()}</p>
                    <p className="text-xs opacity-70">Lifetime earned</p>
                  </div>
                  <Star className="h-10 w-10 opacity-80" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white border-0">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm opacity-80">Current Streak</p>
                    <p className="text-3xl font-bold">{myStats.currentStreak} days</p>
                    <p className="text-xs opacity-70">Best: {myStats.longestStreak} days</p>
                  </div>
                  <Flame className="h-10 w-10 opacity-80" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-purple-500 to-pink-600 text-white border-0">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm opacity-80">Challenges</p>
                    <p className="text-3xl font-bold">{myStats.completedChallenges}/{myStats.totalChallenges}</p>
                    <p className="text-xs opacity-70">Completed</p>
                  </div>
                  <Target className="h-10 w-10 opacity-80" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-rose-500 to-red-600 text-white border-0">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm opacity-80">Badges Earned</p>
                    <p className="text-3xl font-bold">{myStats.badges.length}</p>
                    <div className="flex gap-1 mt-1">
                      {myStats.badges.slice(0, 4).map(b => (
                        <span key={b.id} className="text-lg">{b.icon}</span>
                      ))}
                    </div>
                  </div>
                  <Award className="h-10 w-10 opacity-80" />
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Main Content Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
            <TabsTrigger value="my-progress" className="flex items-center gap-2">
              <User className="h-4 w-4" />
              My Progress
            </TabsTrigger>
            <TabsTrigger value="leaderboard" className="flex items-center gap-2">
              <Trophy className="h-4 w-4" />
              Leaderboard
            </TabsTrigger>
            <TabsTrigger value="teams" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Team Rankings
            </TabsTrigger>
            <TabsTrigger value="winners" className="flex items-center gap-2">
              <Medal className="h-4 w-4" />
              Winners
            </TabsTrigger>
          </TabsList>

          {/* My Progress Tab */}
          <TabsContent value="my-progress" className="space-y-4">
            {/* Active Challenges */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <Zap className="h-5 w-5 text-amber-500" />
                  My Active Challenges
                </h3>
                {activeChallenges.length === 0 ? (
                  <Card className="bg-slate-50 dark:bg-slate-800/50 border-dashed">
                    <CardContent className="p-6 text-center">
                      <Target className="h-12 w-12 mx-auto text-slate-400 mb-2" />
                      <p className="text-slate-500">No active challenges. Join one to get started!</p>
                    </CardContent>
                  </Card>
                ) : (
                  activeChallenges.map(challenge => {
                    const ChallengeIcon = challenge.icon;
                    const progressPercent = Math.min(100, (challenge.myProgress / challenge.target) * 100);
                    const daysLeft = differenceInDays(new Date(challenge.endDate), new Date());
                    return (
                      <Card key={challenge.id} className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 overflow-hidden">
                        <div className={cn('h-2 bg-gradient-to-r', challenge.color)} />
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <div className={cn('p-2 rounded-lg bg-gradient-to-br text-white', challenge.color)}>
                              <ChallengeIcon className="h-5 w-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="font-semibold text-slate-900 dark:text-white">{challenge.title}</h4>
                              <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-1">{challenge.description}</p>
                              
                              <div className="mt-3 space-y-2">
                                <div className="flex justify-between text-sm">
                                  <span className="text-slate-500">Progress</span>
                                  <span className="font-medium text-slate-900 dark:text-white">
                                    {challenge.myProgress.toLocaleString()} / {challenge.target.toLocaleString()} {challenge.unit}
                                  </span>
                                </div>
                                <Progress value={progressPercent} className="h-2" />
                                
                                <div className="flex justify-between items-center text-sm pt-1">
                                  <div className="flex items-center gap-3">
                                    <span className="flex items-center gap-1 text-amber-600">
                                      <Crown className="h-4 w-4" />
                                      Rank #{challenge.myRank}
                                    </span>
                                    <span className="flex items-center gap-1 text-orange-600">
                                      <Flame className="h-4 w-4" />
                                      {challenge.myStreak} day streak
                                    </span>
                                  </div>
                                  <Badge variant="outline" className="text-xs">
                                    <Clock className="h-3 w-3 mr-1" />
                                    {daysLeft} days left
                                  </Badge>
                                </div>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })
                )}
              </div>

              {/* Available Challenges */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <Gift className="h-5 w-5 text-emerald-500" />
                  Available Challenges
                </h3>
                {availableChallenges.length === 0 ? (
                  <Card className="bg-slate-50 dark:bg-slate-800/50 border-dashed">
                    <CardContent className="p-6 text-center">
                      <CheckCircle className="h-12 w-12 mx-auto text-emerald-500 mb-2" />
                      <p className="text-slate-500">You've joined all available challenges!</p>
                    </CardContent>
                  </Card>
                ) : (
                  availableChallenges.map(challenge => {
                    const ChallengeIcon = challenge.icon;
                    return (
                      <Card key={challenge.id} className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <div className={cn('p-2 rounded-lg bg-gradient-to-br text-white', challenge.color)}>
                              <ChallengeIcon className="h-5 w-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <h4 className="font-semibold text-slate-900 dark:text-white">{challenge.title}</h4>
                                {challenge.status === 'upcoming' && (
                                  <Badge className="bg-blue-100 text-blue-700 text-xs">Upcoming</Badge>
                                )}
                              </div>
                              <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2 mt-1">{challenge.description}</p>
                              
                              <div className="flex items-center justify-between mt-3">
                                <div className="flex items-center gap-2 text-sm text-slate-500">
                                  <Users className="h-4 w-4" />
                                  {challenge.totalParticipants} participants
                                </div>
                                <Button 
                                  size="sm" 
                                  onClick={() => handleJoinChallenge(challenge.id)}
                                  className={cn('bg-gradient-to-r text-white', challenge.color)}
                                >
                                  Join Challenge
                                </Button>
                              </div>
                              
                              <div className="mt-2 p-2 bg-amber-50 dark:bg-amber-900/20 rounded text-xs">
                                <span className="font-medium text-amber-700 dark:text-amber-400">🏆 Gold: </span>
                                <span className="text-amber-600 dark:text-amber-500">{challenge.rewards.gold}</span>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })
                )}
              </div>
            </div>

            {/* My Badges */}
            {myStats && (
              <Card className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                <CardHeader>
                  <CardTitle className="text-slate-900 dark:text-white flex items-center gap-2">
                    <Award className="h-5 w-5 text-purple-500" />
                    My Badges
                  </CardTitle>
                  <CardDescription className="text-slate-500 dark:text-slate-400">
                    Achievements you've earned through your wellness journey
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-4">
                    {myStats.badges.map(badge => (
                      <div key={badge.id} className="flex flex-col items-center p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                        <span className="text-3xl mb-1">{badge.icon}</span>
                        <span className="text-sm font-medium text-slate-900 dark:text-white">{badge.name}</span>
                        <span className="text-xs text-slate-500">{format(new Date(badge.earnedDate), 'MMM d, yyyy')}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Leaderboard Tab */}
          <TabsContent value="leaderboard" className="space-y-4">
            <div className="flex flex-col md:flex-row gap-4">
              {/* Challenge Selector */}
              <Card className="md:w-64 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-slate-900 dark:text-white">Select Challenge</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {challenges.filter(c => c.status === 'active' || c.status === 'completed').map(challenge => {
                    const ChallengeIcon = challenge.icon;
                    return (
                      <div
                        key={challenge.id}
                        onClick={() => setSelectedChallenge(challenge.id)}
                        className={cn(
                          'p-3 rounded-lg cursor-pointer transition-colors',
                          selectedChallenge === challenge.id 
                            ? 'bg-emerald-50 dark:bg-emerald-900/20 ring-1 ring-emerald-500' 
                            : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <div className={cn('p-1.5 rounded bg-gradient-to-br text-white', challenge.color)}>
                            <ChallengeIcon className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{challenge.title}</p>
                            <p className="text-xs text-slate-500">{challenge.totalParticipants} participants</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              {/* Leaderboard */}
              <Card className="flex-1 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-slate-900 dark:text-white flex items-center gap-2">
                        <Trophy className="h-5 w-5 text-amber-500" />
                        {selectedChallengeData?.title} Leaderboard
                      </CardTitle>
                      <CardDescription className="text-slate-500 dark:text-slate-400">
                        Top performers in this challenge
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Top 3 Podium */}
                  <div className="flex justify-center items-end gap-4 mb-6">
                    {leaderboard.slice(0, 3).map((entry, index) => {
                      const heights = ['h-20', 'h-28', 'h-16'];
                      const positions = [1, 0, 2]; // silver, gold, bronze positions
                      const pos = positions[index];
                      const actualEntry = leaderboard[pos];
                      const colors = ['bg-slate-200', 'bg-yellow-400', 'bg-amber-600'];
                      return (
                        <div key={actualEntry.employeeId} className="flex flex-col items-center" style={{ order: index }}>
                          <div className={cn(
                            'relative mb-2',
                            actualEntry.isMe && 'ring-2 ring-emerald-500 ring-offset-2 rounded-full'
                          )}>
                            <Avatar className="h-12 w-12">
                              <AvatarImage src={actualEntry.avatar} />
                              <AvatarFallback className="bg-slate-100">
                                {actualEntry.name.split(' ').map(n => n[0]).join('')}
                              </AvatarFallback>
                            </Avatar>
                            <div className={cn(
                              'absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold',
                              pos === 0 ? 'bg-yellow-400 text-yellow-900' : 
                              pos === 1 ? 'bg-slate-300 text-slate-700' : 
                              'bg-amber-600 text-white'
                            )}>
                              {pos + 1}
                            </div>
                          </div>
                          <p className={cn(
                            'text-sm font-medium text-center',
                            actualEntry.isMe ? 'text-emerald-600' : 'text-slate-900 dark:text-white'
                          )}>
                            {actualEntry.name}
                          </p>
                          <p className="text-xs text-slate-500">{actualEntry.score.toLocaleString()}</p>
                          <div className={cn('w-16 rounded-t-lg mt-2', heights[pos], colors[pos])} />
                        </div>
                      );
                    })}
                  </div>

                  {/* Full Leaderboard */}
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-2">
                      {leaderboard.map((entry) => (
                        <div
                          key={entry.employeeId}
                          className={cn(
                            'flex items-center gap-3 p-3 rounded-lg transition-colors',
                            entry.isMe 
                              ? 'bg-emerald-50 dark:bg-emerald-900/20 ring-1 ring-emerald-500' 
                              : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'
                          )}
                        >
                          <div className="w-8 text-center">
                            <span className={cn(
                              'font-bold',
                              entry.rank <= 3 ? 'text-amber-500' : 'text-slate-500'
                            )}>
                              {entry.rank}
                            </span>
                            <div className="text-xs">{getRankChange(entry.rank, entry.previousRank)}</div>
                          </div>
                          
                          {getMedalIcon(entry.medal)}
                          
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={entry.avatar} />
                            <AvatarFallback className="text-xs bg-slate-100">
                              {entry.name.split(' ').map(n => n[0]).join('')}
                            </AvatarFallback>
                          </Avatar>
                          
                          <div className="flex-1 min-w-0">
                            <p className={cn(
                              'font-medium truncate',
                              entry.isMe ? 'text-emerald-600' : 'text-slate-900 dark:text-white'
                            )}>
                              {entry.name} {entry.isMe && '(You)'}
                            </p>
                            <p className="text-xs text-slate-500">{entry.department}</p>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            {entry.badges.map((badge, i) => (
                              <span key={i} className="text-sm">{badge}</span>
                            ))}
                          </div>
                          
                          <div className="text-right">
                            <p className="font-semibold text-slate-900 dark:text-white">{entry.score.toLocaleString()}</p>
                            <p className="text-xs text-slate-500">{entry.streak} day streak</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Team Rankings Tab */}
          <TabsContent value="teams" className="space-y-4">
            <Card className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
              <CardHeader>
                <CardTitle className="text-slate-900 dark:text-white flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-blue-500" />
                  Department Team Rankings
                </CardTitle>
                <CardDescription className="text-slate-500 dark:text-slate-400">
                  See how your team compares to other departments
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {teamLeaderboard.map((team) => {
                    const isMyTeam = team.department === 'Engineering';
                    return (
                      <div
                        key={team.department}
                        className={cn(
                          'flex items-center gap-4 p-4 rounded-lg',
                          isMyTeam 
                            ? 'bg-emerald-50 dark:bg-emerald-900/20 ring-1 ring-emerald-500' 
                            : 'bg-slate-50 dark:bg-slate-700/50'
                        )}
                      >
                        <div className="w-10 text-center">
                          <span className={cn(
                            'text-2xl font-bold',
                            team.rank === 1 ? 'text-yellow-500' :
                            team.rank === 2 ? 'text-slate-400' :
                            team.rank === 3 ? 'text-amber-600' :
                            'text-slate-500'
                          )}>
                            {team.rank}
                          </span>
                          <div className="text-xs">{getRankChange(team.rank, team.previousRank)}</div>
                        </div>
                        
                        {team.rank <= 3 && getMedalIcon(team.rank === 1 ? 'gold' : team.rank === 2 ? 'silver' : 'bronze')}
                        
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className={cn(
                              'font-semibold',
                              isMyTeam ? 'text-emerald-600' : 'text-slate-900 dark:text-white'
                            )}>
                              {team.teamName}
                            </h4>
                            {isMyTeam && <Badge className="bg-emerald-100 text-emerald-700 text-xs">Your Team</Badge>}
                          </div>
                          <p className="text-sm text-slate-500">{team.department}</p>
                        </div>
                        
                        <div className="text-center">
                          <p className="text-sm text-slate-500">Members</p>
                          <p className="font-semibold text-slate-900 dark:text-white">{team.activeMembers}/{team.totalMembers}</p>
                        </div>
                        
                        <div className="text-right">
                          <p className="text-sm text-slate-500">Avg Score</p>
                          <p className="font-bold text-lg text-slate-900 dark:text-white">{team.avgScore.toLocaleString()}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Winners Tab */}
          <TabsContent value="winners" className="space-y-4">
            <Card className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
              <CardHeader>
                <CardTitle className="text-slate-900 dark:text-white flex items-center gap-2">
                  <PartyPopper className="h-5 w-5 text-pink-500" />
                  Challenge Winners
                </CardTitle>
                <CardDescription className="text-slate-500 dark:text-slate-400">
                  Celebrating our wellness champions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {winners.map((winner, index) => {
                    const isMe = winner.name === 'You';
                    const medalColors = {
                      gold: 'from-yellow-400 to-amber-500',
                      silver: 'from-slate-300 to-slate-400',
                      bronze: 'from-amber-600 to-orange-700'
                    };
                    return (
                      <div
                        key={`${winner.challengeId}-${winner.medal}`}
                        className={cn(
                          'flex items-center gap-4 p-4 rounded-lg',
                          isMe 
                            ? 'bg-emerald-50 dark:bg-emerald-900/20 ring-1 ring-emerald-500' 
                            : 'bg-slate-50 dark:bg-slate-700/50'
                        )}
                      >
                        <div className={cn('p-3 rounded-full bg-gradient-to-br text-white', medalColors[winner.medal])}>
                          <Medal className="h-6 w-6" />
                        </div>
                        
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className={cn(
                              'font-semibold',
                              isMe ? 'text-emerald-600' : 'text-slate-900 dark:text-white'
                            )}>
                              {winner.name} {isMe && '🎉'}
                            </h4>
                            <Badge className={cn(
                              'text-xs capitalize',
                              winner.medal === 'gold' ? 'bg-yellow-100 text-yellow-700' :
                              winner.medal === 'silver' ? 'bg-slate-200 text-slate-700' :
                              'bg-amber-100 text-amber-700'
                            )}>
                              {winner.medal}
                            </Badge>
                          </div>
                          <p className="text-sm text-slate-500">{winner.department}</p>
                          <p className="text-xs text-slate-400 mt-1">{winner.challengeTitle}</p>
                        </div>
                        
                        <div className="text-right">
                          <p className="font-bold text-slate-900 dark:text-white">{winner.score.toLocaleString()}</p>
                          <p className="text-xs text-slate-500">{format(new Date(winner.date), 'MMM d, yyyy')}</p>
                        </div>
                        
                        <div className="hidden md:block max-w-xs">
                          <div className="flex items-center gap-2 p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                            <Gift className="h-4 w-4 text-amber-600" />
                            <span className="text-xs text-amber-700 dark:text-amber-400">{winner.reward}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
};

export default EmployeeGamification;
