import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/auth/AuthProvider";
import api from "@/utils/api";
import {
  Coins,
  TrendingUp,
  Award,
  ShoppingBag,
  History,
  Plus,
  Wallet as WalletIcon,
  Flame,
  FootprintsIcon,
  HeartPulse,
  Calendar
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PurchaseCoinsDialog } from "@/components/wallet/PurchaseCoinsDialog";

export default function Wallet() {
  const { toast } = useToast();
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [wallet, setWallet] = useState(null);
  const [claiming, setClaiming] = useState(false);
  const [showPurchaseDialog, setShowPurchaseDialog] = useState(false);

  useEffect(() => {
    fetchWallet();
  }, []);

  const fetchWallet = async () => {
    try {
      const response = await api.get('/wallet');
      setWallet(response.data.data);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load wallet",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const claimDailyReward = async () => {
    setClaiming(true);
    try {
      const response = await api.post('/wallet/earn/daily-login');
      
      toast({
        title: "🎉 Daily Reward Claimed!",
        description: `Earned ${response.data.coinsEarned} HC${response.data.bonusCoins ? ` + ${response.data.bonusCoins} HC bonus` : ''}`,
      });
      
      await fetchWallet();
    } catch (error) {
      toast({
        title: "Info",
        description: error.response?.data?.message || "Already claimed today",
        variant: "default",
      });
    } finally {
      setClaiming(false);
    }
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getActivityIcon = (activityType) => {
    const icons = {
      DAILY_LOGIN: Calendar,
      STEPS_MILESTONE: FootprintsIcon,
      HEALTH_ASSESSMENT: HeartPulse,
      STREAK_BONUS: Flame,
      PURCHASE: ShoppingBag,
      default: Coins
    };
    const Icon = icons[activityType] || icons.default;
    return <Icon className="h-4 w-4" />;
  };

  const getTransactionColor = (type) => {
    return type === 'EARN' || type === 'PURCHASE' || type === 'BONUS' ? 'text-green-600' : 'text-red-600';
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <WalletIcon className="h-8 w-8" />
            Health Coins Wallet
          </h1>
          <p className="text-muted-foreground mt-1">
            Earn and spend health coins for rewards and services
          </p>
        </div>
        <Button onClick={() => setShowPurchaseDialog(true)} size="lg">
          <Plus className="h-4 w-4 mr-2" />
          Buy Coins
        </Button>
      </div>

      {/* Balance Card */}
      <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Coins className="h-6 w-6 text-primary" />
              Current Balance
            </span>
            <Button onClick={claimDailyReward} disabled={claiming} variant="secondary">
              <Award className="h-4 w-4 mr-2" />
              {claiming ? "Claiming..." : "Claim Daily Reward"}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="md:col-span-1">
              <div className="text-5xl font-bold text-primary flex items-center gap-2">
                {wallet?.balance?.toFixed(0) || 0}
                <span className="text-xl text-muted-foreground">HC</span>
              </div>
              <p className="text-sm text-muted-foreground mt-2">Health Coins</p>
            </div>

            <div className="md:col-span-3 grid grid-cols-3 gap-4">
              <div className="bg-white/50 dark:bg-gray-800/50 p-4 rounded-lg">
                <div className="flex items-center gap-2 text-green-600 mb-2">
                  <TrendingUp className="h-4 w-4" />
                  <span className="text-xs font-medium">Total Earned</span>
                </div>
                <p className="text-2xl font-bold">{wallet?.totalEarned?.toFixed(0) || 0}</p>
              </div>

              <div className="bg-white/50 dark:bg-gray-800/50 p-4 rounded-lg">
                <div className="flex items-center gap-2 text-blue-600 mb-2">
                  <ShoppingBag className="h-4 w-4" />
                  <span className="text-xs font-medium">Total Spent</span>
                </div>
                <p className="text-2xl font-bold">{wallet?.totalSpent?.toFixed(0) || 0}</p>
              </div>

              <div className="bg-white/50 dark:bg-gray-800/50 p-4 rounded-lg">
                <div className="flex items-center gap-2 text-orange-600 mb-2">
                  <Flame className="h-4 w-4" />
                  <span className="text-xs font-medium">Streak</span>
                </div>
                <p className="text-2xl font-bold">{wallet?.streakDays || 0} days</p>
              </div>
            </div>
          </div>

          {/* Streak Progress */}
          {wallet?.streakDays < 90 && (
            <div className="mt-6">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-muted-foreground">Next streak bonus</span>
                <span className="font-medium">
                  {wallet?.streakDays >= 60 ? '90 days (100 HC)' :
                   wallet?.streakDays >= 30 ? '60 days (50 HC)' :
                   wallet?.streakDays >= 14 ? '30 days (25 HC)' :
                   wallet?.streakDays >= 7 ? '14 days (10 HC)' :
                   '7 days (5 HC)'}
                </span>
              </div>
              <Progress 
                value={
                  wallet?.streakDays >= 60 ? ((wallet?.streakDays - 60) / 30 * 100) :
                  wallet?.streakDays >= 30 ? ((wallet?.streakDays - 30) / 30 * 100) :
                  wallet?.streakDays >= 14 ? ((wallet?.streakDays - 14) / 16 * 100) :
                  wallet?.streakDays >= 7 ? ((wallet?.streakDays - 7) / 7 * 100) :
                  (wallet?.streakDays / 7 * 100)
                } 
                className="h-2"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Today's Activity */}
      {wallet?.todayActivity && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Today's Activity
            </CardTitle>
            <CardDescription>Track your daily progress</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${wallet.todayActivity.dailyLoginRewarded ? 'bg-green-100 dark:bg-green-900' : 'bg-gray-100 dark:bg-gray-800'}`}>
                  <Calendar className={`h-5 w-5 ${wallet.todayActivity.dailyLoginRewarded ? 'text-green-600' : 'text-gray-400'}`} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Daily Login</p>
                  <p className="font-medium">{wallet.todayActivity.dailyLoginRewarded ? '✓ Claimed' : 'Pending'}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center bg-blue-100 dark:bg-blue-900">
                  <FootprintsIcon className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Steps</p>
                  <p className="font-medium">{wallet.todayActivity.totalSteps || 0}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${wallet.todayActivity.healthAssessmentCompleted ? 'bg-purple-100 dark:bg-purple-900' : 'bg-gray-100 dark:bg-gray-800'}`}>
                  <HeartPulse className={`h-5 w-5 ${wallet.todayActivity.healthAssessmentCompleted ? 'text-purple-600' : 'text-gray-400'}`} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Assessment</p>
                  <p className="font-medium">{wallet.todayActivity.healthAssessmentCompleted ? '✓ Done' : 'Pending'}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${wallet.todayActivity.vitalSignsLogged ? 'bg-red-100 dark:bg-red-900' : 'bg-gray-100 dark:bg-gray-800'}`}>
                  <HeartPulse className={`h-5 w-5 ${wallet.todayActivity.vitalSignsLogged ? 'text-red-600' : 'text-gray-400'}`} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Vitals</p>
                  <p className="font-medium">{wallet.todayActivity.vitalSignsLogged ? '✓ Logged' : 'Pending'}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Transaction History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Recent Transactions
          </CardTitle>
          <CardDescription>Your latest health coins activity</CardDescription>
        </CardHeader>
        <CardContent>
          {wallet?.recentTransactions?.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {wallet.recentTransactions.map((txn) => (
                  <TableRow key={txn.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getActivityIcon(txn.activityType)}
                        <Badge variant="outline">
                          {txn.type}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-xs truncate">
                      {txn.description || txn.activityType}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(txn.createdAt)}
                    </TableCell>
                    <TableCell className={`text-right font-medium ${getTransactionColor(txn.type)}`}>
                      {txn.amount > 0 ? '+' : ''}{txn.amount}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {parseFloat(txn.balanceAfter).toFixed(0)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Coins className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No transactions yet</p>
              <p className="text-sm">Start earning health coins!</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Purchase Dialog */}
      <PurchaseCoinsDialog
        open={showPurchaseDialog}
        onOpenChange={setShowPurchaseDialog}
        onSuccess={fetchWallet}
      />
    </div>
  );
}
