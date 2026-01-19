/**
 * My Membership Card Page - Redesigned
 * Clean, simple layout with membership card display
 */

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CreditCard,
  Download,
  QrCode,
  Calendar,
  Phone,
  Mail,
  Crown,
  Smartphone,
  ScanLine,
  ArrowRight
} from 'lucide-react';
import api from '@/utils/api';
import { useNavigate } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';
import QRCode from 'qrcode';
import html2canvas from 'html2canvas';

// Tier colors mapping
const tierStyles: Record<string, { bg: string; text: string; accent: string }> = {
  free: { bg: 'from-gray-600 to-gray-800', text: 'text-gray-100', accent: 'bg-gray-500' },
  basic: { bg: 'from-blue-600 to-blue-800', text: 'text-blue-100', accent: 'bg-blue-500' },
  premium: { bg: 'from-purple-600 to-purple-800', text: 'text-purple-100', accent: 'bg-purple-500' },
  enterprise: { bg: 'from-amber-500 to-amber-700', text: 'text-amber-100', accent: 'bg-amber-400' },
  corporate: { bg: 'from-emerald-600 to-emerald-800', text: 'text-emerald-100', accent: 'bg-emerald-500' },
};

const MyMembershipCard = () => {
  const navigate = useNavigate();
  const cardRef = useRef<HTMLDivElement>(null);
  const [qrCode, setQrCode] = useState<string>('');
  const [isFlipped, setIsFlipped] = useState(false);

  // Fetch user data
  const { data: userData, isLoading: userLoading } = useQuery({
    queryKey: ['user-profile'],
    queryFn: async () => {
      const { data } = await api.get('/users/profile');
      return data;
    }
  });

  // Fetch current plan
  const { data: planData, isLoading: planLoading } = useQuery({
    queryKey: ['user-plan'],
    queryFn: async () => {
      const { data } = await api.get('/membership/my/current');
      return data;
    }
  });

  const isLoading = userLoading || planLoading;
  const user = userData?.user || userData;
  const plan = planData?.plan || planData?.userPlan?.plan;

  // Generate QR code
  const generateQR = async () => {
    if (!user) return;
    try {
      const qrData = JSON.stringify({
        memberId: `MED-${String(user.id).padStart(6, '0')}`,
        name: `${user.firstName} ${user.lastName}`,
        tier: plan?.tier || 'basic',
        ts: Date.now()
      });
      const url = await QRCode.toDataURL(qrData, { width: 200, margin: 2 });
      setQrCode(url);
    } catch (err) {
      console.error('QR generation failed:', err);
    }
  };

  // Generate QR on user load
  useEffect(() => {
    if (user) generateQR();
  }, [user]);

  // Download card as image
  const downloadCard = async () => {
    if (!cardRef.current) return;
    try {
      const canvas = await html2canvas(cardRef.current, { scale: 2, useCORS: true });
      const link = document.createElement('a');
      link.download = `mediqzy-membership-${user?.firstName || 'card'}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  // Safely get tier as string
  const getTierString = (tierValue: any): string => {
    if (!tierValue) return 'basic';
    if (typeof tierValue === 'string') return tierValue.toLowerCase();
    if (typeof tierValue === 'number') {
      const tierMap: Record<number, string> = { 1: 'basic', 2: 'standard', 3: 'premium', 4: 'enterprise' };
      return tierMap[tierValue] || 'basic';
    }
    if (typeof tierValue === 'object' && tierValue.name) return String(tierValue.name).toLowerCase();
    return 'basic';
  };

  const tier = getTierString(plan?.tier || plan?.tierName);
  const style = tierStyles[tier] || tierStyles.basic;
  const memberId = user ? `MED-${String(user.id).padStart(6, '0')}` : 'MED-000000';
  const memberName = user ? `${user.firstName} ${user.lastName}` : 'Member';
  const memberSince = user?.createdAt ? new Date(user.createdAt).getFullYear() : new Date().getFullYear();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-56 w-full max-w-md" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-3">
          <CreditCard className="h-7 w-7 text-primary" />
          My Membership Card
        </h1>
        <p className="text-muted-foreground mt-1">
          Your digital healthcare membership card
        </p>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Column - Card */}
        <div className="space-y-4">
          {/* Download Button */}
          <div className="flex justify-between items-center">
            <Badge variant="outline" className="text-sm">
              {tier.toUpperCase()} MEMBER
            </Badge>
            <Button variant="outline" size="sm" onClick={downloadCard} className="gap-2">
              <Download className="h-4 w-4" />
              Download
            </Button>
          </div>

          {/* Membership Card */}
          <div
            ref={cardRef}
            className="relative cursor-pointer select-none"
            style={{ perspective: '1000px' }}
            onClick={() => {
              setIsFlipped(!isFlipped);
              if (!qrCode) generateQR();
            }}
          >
            <div
              className="relative transition-transform duration-500"
              style={{
                transformStyle: 'preserve-3d',
                transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)'
              }}
            >
              {/* Front of Card */}
              <div
                className={`w-full aspect-[1.6/1] rounded-2xl bg-gradient-to-br ${style.bg} p-6 text-white shadow-xl`}
                style={{ backfaceVisibility: 'hidden' }}
              >
                {/* Header */}
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <div className="text-xs font-medium opacity-80 tracking-wider">MEDIQZY</div>
                    <div className="text-sm opacity-70">Healthcare Membership</div>
                  </div>
                  <Badge className={`${style.accent} text-white border-0`}>
                    {tier.toUpperCase()}
                  </Badge>
                </div>

                {/* Member ID */}
                <div className="mb-4">
                  <div className="text-xs opacity-60 mb-1">Member ID</div>
                  <div className="text-xl font-bold tracking-wider">{memberId}</div>
                </div>

                {/* Member Name */}
                <div className="mb-4">
                  <div className="text-xs opacity-60 mb-1">Member Name</div>
                  <div className="text-lg font-semibold">{memberName}</div>
                </div>

                {/* Footer */}
                <div className="flex justify-between items-end">
                  <div className="text-xs opacity-60">
                    Member since {memberSince}
                  </div>
                  <Crown className="h-6 w-6 opacity-40" />
                </div>

                {/* Shine Effect */}
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-white/0 via-white/10 to-white/0 pointer-events-none" />
              </div>

              {/* Back of Card */}
              <div
                className={`absolute inset-0 w-full aspect-[1.6/1] rounded-2xl bg-gradient-to-br ${style.bg} p-6 text-white shadow-xl flex flex-col items-center justify-center`}
                style={{
                  backfaceVisibility: 'hidden',
                  transform: 'rotateY(180deg)'
                }}
              >
                <div className="text-xs opacity-70 mb-3">Scan for Verification</div>
                {qrCode ? (
                  <div className="bg-white p-3 rounded-xl">
                    <img src={qrCode} alt="QR Code" className="w-32 h-32" />
                  </div>
                ) : (
                  <div className="bg-white/20 p-6 rounded-xl">
                    <QrCode className="w-24 h-24 opacity-50" />
                  </div>
                )}
                <div className="text-xs opacity-60 mt-3">{memberId}</div>
              </div>
            </div>
          </div>

          {/* Click Hint */}
          <p className="text-sm text-muted-foreground text-center">
            {isFlipped ? 'Click card to see front' : 'Click card to see QR code'}
          </p>
        </div>

        {/* Right Column - Info */}
        <div className="space-y-6">
          {/* Plan Info Card */}
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-lg">{plan?.name || 'Basic Plan'}</h3>
                <Badge variant="secondary">{tier.toUpperCase()}</Badge>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                {plan?.description || 'Your current membership plan'}
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-muted-foreground">Monthly Fee</div>
                  <div className="text-xl font-bold">₹{plan?.price || plan?.priceINR || '0'}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Valid Until</div>
                  <div className="text-lg font-semibold flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    {plan?.validUntil ? new Date(plan.validUntil).toLocaleDateString() : 'Lifetime'}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Contact Info */}
          <Card>
            <CardContent className="p-6 space-y-3">
              <h3 className="font-semibold mb-2">Contact Details</h3>
              <div className="flex items-center gap-3 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span>{user?.email || 'Not available'}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span>{user?.phoneNumber || 'Not available'}</span>
              </div>
            </CardContent>
          </Card>

          {/* How to Use */}
          <Card>
            <CardContent className="p-6">
              <h3 className="font-semibold mb-4">How to Use</h3>
              <div className="space-y-3">
                <div className="flex gap-3">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Smartphone className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <div className="font-medium text-sm">Show at Facility</div>
                    <div className="text-xs text-muted-foreground">Click card to display QR code</div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <ScanLine className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <div className="font-medium text-sm">Quick Verification</div>
                    <div className="text-xs text-muted-foreground">Staff scans for instant check-in</div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Download className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <div className="font-medium text-sm">Save Offline</div>
                    <div className="text-xs text-muted-foreground">Download for offline access</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Upgrade Button */}
          <Button
            className="w-full gap-2"
            onClick={() => navigate('/my-plans')}
          >
            Explore Premium Plans
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default MyMembershipCard;
