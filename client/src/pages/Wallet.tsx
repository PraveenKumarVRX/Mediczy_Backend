import type { Variants } from 'framer-motion';
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
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
  Calendar,
  Ticket,
  Clock
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

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.06 } } };
const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [.25,.46,.45,.94] } } };

export default function Wallet() {
  const { toast } = useToast();
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [wallet, setWallet] = useState(null);
  const [claiming, setClaiming] = useState(false);
  const [showPurchaseDialog, setShowPurchaseDialog] = useState(false);
  const [prefillCouponCode, setPrefillCouponCode] = useState('');
  const [offers, setOffers] = useState<any[]>([]);
  const [loadingOffers, setLoadingOffers] = useState(false);

  useEffect(() => {
    fetchWallet();
    fetchOffers();
  }, []);

  const fetchOffers = async () => {
    try {
      setLoadingOffers(true);
      const response = await api.get('/wallet/my-coupons');
      if (response.data?.success) {
        setOffers(response.data.coupons || []);
      }
    } catch (error) {
      setOffers([]);
      console.error('Offers API Error:', error);
    } finally {
      setLoadingOffers(false);
    }
  };

  const fetchWallet = async () => {
    try {
      const response = await api.get('/wallet');
      console.log('Wallet API Response:', response.data);
      setWallet(response.data.data);
    } catch (error: any) {
      console.error('Wallet API Error:', error);
      console.error('Error Response:', error.response?.data);
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to load wallet. Please login again.",
        variant: "destructive",
      });
      
      // If unauthorized, clear token and redirect to login
      if (error.response?.status === 401) {
        localStorage.removeItem('token');
        window.location.href = '/login';
      }
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
    return new Date(date).toLocaleDateString('en-IN', {
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

  const couponSummary = (offer: any) => {
    if (offer.type === 'PERCENTAGE') return `${offer.value}% off`;
    if (offer.type === 'FREE_HC') return `+${offer.value} free HC`;
    return `+${offer.value} bonus HC`;
  };

  const scopeLabel = (scope: string) => {
    const labels: Record<string, string> = {
      COINS_PURCHASE: 'Coins',
      HEALTH_CHECKUP: 'Health Checkup',
      PHARMACY_PURCHASE: 'Pharmacy',
      CONSULTATION: 'Consultation'
    };
    return labels[scope] || scope;
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            <p className="text-muted-foreground">Loading your wallet...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!wallet) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-12 text-center">
            <WalletIcon className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-xl font-semibold mb-2">Unable to Load Wallet</h3>
            <p className="text-muted-foreground mb-6">
              There was a problem loading your wallet. This could be due to:
            </p>
            <ul className="text-left max-w-md mx-auto mb-6 space-y-2">
              <li>• Authentication session expired</li>
              <li>• Network connectivity issues</li>
              <li>• Server temporarily unavailable</li>
            </ul>
            <div className="flex gap-3 justify-center">
              <Button onClick={fetchWallet}>
                Try Again
              </Button>
              <Button variant="outline" onClick={() => window.location.href = '/login'}>
                Re-login
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <motion.div variants={container as unknown as Variants} initial="hidden" animate="show" className="max-w-7xl mx-auto space-y-6 px-4 md:px-6 py-6">
      {/* Premium Hero Header */}
      <motion.div variants={item as unknown as Variants} className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-800 via-slate-900 to-slate-800 p-6 md:p-8 text-white shadow-2xl">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMzLjMxNCAwIDYgMi42ODYgNiA2cy0yLjY4NiA2LTYgNi02LTIuNjg2LTYtNiAyLjY4Ni02IDYtNiIgc3Ryb2tlPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMSkiLz48L2c+PC9zdmc+')] opacity-30" />
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-emerald-500/20 to-transparent rounded-full blur-3xl" />
        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-lg shadow-emerald-500/30">
                <Coins className="w-6 h-6" />
              </div>
              <Badge className="bg-white/10 text-white/90 border-white/20 font-medium">Health Coins</Badge>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold mb-2">Health Coins Wallet</h1>
            <p className="text-slate-300 text-sm md:text-base">Earn and spend health coins for rewards and services</p>
          </div>
          <Button onClick={() => { setPrefillCouponCode(''); setShowPurchaseDialog(true); }} size="lg" className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-lg shadow-emerald-500/30 self-start">
            <Plus className="h-4 w-4 mr-2" />
            Buy Coins
          </Button>
        </div>
      </motion.div>

      {/* Balance Card */}
      <motion.div variants={item as unknown as Variants}>
      <Card className="bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border-emerald-500/20 dark:from-emerald-900/20 dark:to-emerald-900/10 dark:border-emerald-500/20">
        <CardHeader>
          <CardTitle className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <Coins className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
              Current Balance
            </span>
            <Button onClick={claimDailyReward} disabled={claiming} variant="secondary" size="sm" className="w-full sm:w-auto">
              <Award className="h-4 w-4 mr-2" />
              {claiming ? "Claiming..." : "Claim Daily Reward"}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="md:col-span-1">
              <div className="text-5xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent flex items-center gap-2">
                {wallet?.balance?.toFixed(0) || 0}
                <span className="text-xl text-slate-500 dark:text-slate-400">HC</span>
              </div>
              <p className="text-sm text-muted-foreground mt-2">Health Coins</p>
            </div>

            <div className="md:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-4">
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
      </motion.div>

      {/* Today's Activity */}
      {wallet?.todayActivity && (
        <motion.div variants={item as unknown as Variants}>
        <Card className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Today's Activity
            </CardTitle>
            <CardDescription>Track your daily progress</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
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
        </motion.div>
      )}

      {/* Offers Section */}
      <motion.div variants={item as unknown as Variants}>
      <Card className="bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200/70 dark:from-amber-950/20 dark:to-orange-950/20 dark:border-amber-900/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ticket className="h-5 w-5 text-amber-600" />
            Offers & Coupon Codes
          </CardTitle>
          <CardDescription>
            Personalized offers for your billing and wallet purchases
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingOffers ? (
            <p className="text-sm text-muted-foreground">Loading your offers...</p>
          ) : offers.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {offers.slice(0, 6).map((offer) => (
                <div key={offer.id} className="rounded-lg border border-amber-200/80 bg-white/80 p-3 dark:border-amber-900/40 dark:bg-slate-900/30">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm tracking-wide">{offer.code}</span>
                        <Badge variant="secondary" className="text-[10px]">{couponSummary(offer)}</Badge>
                        {offer.isPersonalized && <Badge className="bg-amber-600 text-white text-[10px]">For You</Badge>}
                        {Array.isArray(offer.scopes) && offer.scopes.slice(0, 2).map((scope: string) => (
                          <Badge key={`${offer.code}-${scope}`} variant="outline" className="text-[10px]">{scopeLabel(scope)}</Badge>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{offer.description || 'Apply this code while buying coins'}</p>
                      <div className="mt-1 text-[11px] text-muted-foreground flex items-center gap-2">
                        <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />Valid till {new Date(offer.validUntil).toLocaleDateString('en-IN')}</span>
                        <span>Uses left: {offer.remainingForUser}</span>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        const canUseForCoins = !Array.isArray(offer.scopes) || offer.scopes.includes('COINS_PURCHASE');
                        if (canUseForCoins) {
                          setPrefillCouponCode(offer.code);
                          setShowPurchaseDialog(true);
                          return;
                        }

                        try {
                          await navigator.clipboard.writeText(offer.code);
                          toast({
                            title: 'Coupon Copied',
                            description: `${offer.code} copied. Use it at ${scopeLabel(offer.primaryScope || offer.scopes?.[0] || 'checkout')}.`
                          });
                        } catch {
                          toast({
                            title: 'Copy failed',
                            description: `Use code ${offer.code} at ${scopeLabel(offer.primaryScope || offer.scopes?.[0] || 'checkout')}.`,
                            variant: 'destructive'
                          });
                        }
                      }}
                    >
                      {(!Array.isArray(offer.scopes) || offer.scopes.includes('COINS_PURCHASE')) ? 'Apply' : 'Copy'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              <p>No active offers are assigned to your account right now.</p>
              <p className="mt-2">Please contact your care team to assign eligible coupons.</p>
            </div>
          )}
        </CardContent>
      </Card>
      </motion.div>

      {/* Transaction History */}
      <motion.div variants={item as unknown as Variants}>
      <Card className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
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
      </motion.div>

      {/* Purchase Dialog */}
      <PurchaseCoinsDialog
        open={showPurchaseDialog}
        onOpenChange={setShowPurchaseDialog}
        onSuccess={async () => {
          await fetchWallet();
          await fetchOffers();
        }}
        prefillCouponCode={prefillCouponCode}
      />
    </motion.div>
  );
}
