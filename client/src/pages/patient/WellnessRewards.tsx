import { useCallback, useEffect, useState } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import api from '@/utils/api';
import { wellnessLevel } from '@/utils/wellness-level';
import { wholeNumber } from '@/utils/patient-display';

export default function WellnessRewards() {
  const [wallet, setWallet] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [error, setError] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const load = useCallback(async () => {
    setError(false);
    try {
      const [summary, history] = await Promise.all([api.get('/wallet'), api.get('/wallet/transactions', { params: { limit: 20 } })]);
      setWallet(summary.data.data);
      setTransactions(Array.isArray(history.data.data) ? history.data.data : []);
    } catch { setError(true); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const claim = async () => {
    setClaiming(true);
    try {
      const { data } = await api.post('/wallet/earn/daily-login');
      toast.success(data.message || 'Daily check-in saved');
      await load();
    } catch (e: any) { toast.error(e.response?.data?.message || 'Could not claim your daily check-in. Please try again.'); }
    finally { setClaiming(false); }
  };
  const level = wellnessLevel(wallet?.totalEarned);
  return <MainLayout><div className="mx-auto max-w-4xl space-y-5">
    <h1 className="text-2xl font-bold">Rewards &amp; Streaks</h1>
    {error && <p role="alert">Could not load your rewards. <Button variant="outline" onClick={load}>Retry</Button></p>}
    {!wallet && !error && <p role="status">Loading your activity…</p>}
    {wallet && <>
      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardHeader><CardTitle>Health coins</CardTitle></CardHeader><CardContent>{wholeNumber(wallet.balance)}</CardContent></Card>
        <Card><CardHeader><CardTitle>Current streak</CardTitle></CardHeader><CardContent>{wholeNumber(wallet.streakDays ?? wallet.streak ?? 0)} days</CardContent></Card>
        <Card><CardHeader><CardTitle>Level {level.level}</CardTitle></CardHeader><CardContent><Progress value={level.progress} /><p className="mt-2 text-sm">{level.remaining > 0 ? `${level.remaining.toLocaleString('en-IN')} XP to next level` : 'Highest level reached'}</p></CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle>Daily check-in</CardTitle></CardHeader><CardContent><Button disabled={claiming || !!wallet.todayActivity?.dailyLoginRewarded} onClick={claim}>{wallet.todayActivity?.dailyLoginRewarded ? 'Checked in today' : claiming ? 'Saving…' : 'Check in'}</Button></CardContent></Card>
      <Card><CardHeader><CardTitle>Your reward activity</CardTitle></CardHeader><CardContent>
        {transactions.length === 0 ? <p>No reward activity yet. Your earned coins will appear here.</p> : <ul className="divide-y">{transactions.map(tx => <li key={tx.id} className="flex flex-wrap justify-between gap-2 py-3"><span>{tx.description || String(tx.activityType || tx.type || 'Wallet activity').replace(/_/g, ' ')}</span><span>{wholeNumber(tx.amount)} coins</span></li>)}</ul>}
      </CardContent></Card>
      <p className="text-sm text-muted-foreground">Challenges, company rankings, badges and partner redemptions will appear when available for your account.</p>
    </>}
  </div></MainLayout>;
}
