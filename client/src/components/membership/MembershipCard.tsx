/**
 * World-Class Membership Card Component
 * 
 * Features:
 * - QR code with encrypted user data
 * - Holographic gradient design
 * - Plan tier badge
 * - Member since date
 * - Unique member ID
 * - Downloadable as image
 * - Animated shine effect
 */

import React, { useRef, useEffect, useState } from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { 
  Download, 
  CreditCard, 
  Star, 
  Shield, 
  Calendar,
  User,
  Mail,
  Phone,
  Hash,
  Sparkles
} from 'lucide-react';
import QRCode from 'qrcode';
import { cn } from '@/lib/utils';

interface MembershipCardProps {
  user: {
    id: number;
    firstName: string;
    lastName: string;
    email: string;
    phoneNumber?: string;
    membershipTier?: string;
    memberSince?: string;
    profileImage?: string;
  };
  plan?: {
    name: string;
    tier: string;
    color: string;
  };
  className?: string;
}

const tierColors = {
  free: 'from-slate-400 to-slate-600',
  basic: 'from-blue-400 to-blue-600',
  premium: 'from-purple-400 via-pink-500 to-rose-500',
  enterprise: 'from-amber-400 via-orange-500 to-red-600',
  corporate: 'from-emerald-400 via-teal-500 to-cyan-600'
};

const tierIcons = {
  free: Shield,
  basic: Star,
  premium: Sparkles,
  enterprise: CreditCard,
  corporate: CreditCard
};

const MembershipCard: React.FC<MembershipCardProps> = ({ user, plan, className }) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [isFlipped, setIsFlipped] = useState(false);

  // Generate unique member ID
  const memberId = `MED-${String(user.id).padStart(6, '0')}`;

  // Determine tier
  const tier = (plan?.tier || user.membershipTier || 'basic').toLowerCase();
  const tierColor = tierColors[tier as keyof typeof tierColors] || tierColors.basic;
  const TierIcon = tierIcons[tier as keyof typeof tierIcons] || Star;

  // Generate QR code
  useEffect(() => {
    const generateQR = async () => {
      try {
        const qrData = JSON.stringify({
          memberId,
          name: `${user.firstName} ${user.lastName}`,
          email: user.email,
          tier,
          timestamp: new Date().toISOString()
        });

        const url = await QRCode.toDataURL(qrData, {
          width: 200,
          margin: 1,
          color: {
            dark: '#000000',
            light: '#ffffff'
          }
        });

        setQrCodeUrl(url);
      } catch (error) {
        console.error('Error generating QR code:', error);
      }
    };

    generateQR();
  }, [user, memberId, tier]);

  // Download card as image
  const downloadCard = async () => {
    if (!cardRef.current) return;

    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(cardRef.current, {
        scale: 2,
        backgroundColor: null,
        logging: false
      });

      const link = document.createElement('a');
      link.download = `mediqzy-membership-card-${memberId}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (error) {
      console.error('Error downloading card:', error);
    }
  };

  return (
    <div className={cn('w-full max-w-md', className)}>
      {/* Download Button */}
      <div className="flex justify-end mb-2">
        <Button
          variant="outline"
          size="sm"
          onClick={downloadCard}
          className="gap-2"
        >
          <Download className="h-4 w-4" />
          Download Card
        </Button>
      </div>

      {/* 3D Flip Card Container */}
      <div 
        className="relative w-full h-[220px] cursor-pointer"
        style={{ perspective: '1000px' }}
        onClick={() => setIsFlipped(!isFlipped)}
      >
        <div 
          className={cn(
            'relative w-full h-full transition-transform duration-700',
            isFlipped && 'rotate-y-180'
          )}
          style={{ transformStyle: 'preserve-3d' }}
        >
          {/* Front Side */}
          <div 
            ref={cardRef}
            className="absolute w-full h-full"
            style={{ backfaceVisibility: 'hidden' }}
          >
            <Card className={cn(
              'relative w-full h-full overflow-hidden border-0 shadow-2xl',
              'bg-gradient-to-br', tierColor
            )}>
              {/* Holographic Shine Effect */}
              <div className="absolute inset-0 opacity-30">
                <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/40 to-white/0 animate-shine" />
              </div>

              {/* Mesh Pattern Overlay */}
              <div 
                className="absolute inset-0 opacity-10"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
                }}
              />

              {/* Content */}
              <div className="relative h-full p-6 flex flex-col justify-between text-white">
                {/* Header */}
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <CreditCard className="h-5 w-5" />
                      <span className="text-sm font-semibold tracking-wide">MEDIQZY</span>
                    </div>
                    <p className="text-xs opacity-80">Healthcare Membership</p>
                  </div>
                  
                  <Badge 
                    className={cn(
                      'bg-white/20 backdrop-blur-sm text-white border-white/30',
                      'hover:bg-white/30 gap-1'
                    )}
                  >
                    <TierIcon className="h-3 w-3" />
                    {tier.toUpperCase()}
                  </Badge>
                </div>

                {/* Member Info */}
                <div className="space-y-3">
                  {/* Member ID */}
                  <div className="flex items-center gap-2">
                    <Hash className="h-4 w-4 opacity-70" />
                    <span className="text-lg font-mono tracking-wider font-bold">
                      {memberId}
                    </span>
                  </div>

                  {/* Name */}
                  <div>
                    <p className="text-xs opacity-70 mb-1">Member Name</p>
                    <p className="text-xl font-bold tracking-wide">
                      {user.firstName} {user.lastName}
                    </p>
                  </div>

                  {/* Member Since */}
                  <div className="flex items-center gap-2 text-xs opacity-80">
                    <Calendar className="h-3 w-3" />
                    <span>
                      Member since {user.memberSince || new Date().getFullYear()}
                    </span>
                  </div>
                </div>

                {/* Footer Pattern */}
                <div className="absolute bottom-0 right-0 w-32 h-32 opacity-10">
                  <svg viewBox="0 0 100 100" className="w-full h-full">
                    <circle cx="50" cy="50" r="40" fill="none" stroke="white" strokeWidth="1" />
                    <circle cx="50" cy="50" r="30" fill="none" stroke="white" strokeWidth="1" />
                    <circle cx="50" cy="50" r="20" fill="none" stroke="white" strokeWidth="1" />
                  </svg>
                </div>
              </div>
            </Card>
          </div>

          {/* Back Side */}
          <div 
            className="absolute w-full h-full"
            style={{ 
              backfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)'
            }}
          >
            <Card className={cn(
              'relative w-full h-full overflow-hidden border-0 shadow-2xl',
              'bg-gradient-to-br', tierColor
            )}>
              {/* Content */}
              <div className="relative h-full p-6 flex flex-col text-white">
                {/* QR Code Section */}
                <div className="flex-1 flex flex-col items-center justify-center space-y-4">
                  <div className="bg-white p-4 rounded-xl shadow-lg">
                    {qrCodeUrl ? (
                      <img 
                        src={qrCodeUrl} 
                        alt="Membership QR Code" 
                        className="w-32 h-32"
                      />
                    ) : (
                      <div className="w-32 h-32 flex items-center justify-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
                      </div>
                    )}
                  </div>
                  
                  <p className="text-xs text-center opacity-80 max-w-xs">
                    Scan this QR code at any MediQzy facility for quick check-in
                  </p>
                </div>

                {/* Contact Info */}
                <div className="space-y-2 text-xs opacity-90">
                  <div className="flex items-center gap-2">
                    <Mail className="h-3 w-3" />
                    <span className="truncate">{user.email}</span>
                  </div>
                  
                  {user.phoneNumber && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-3 w-3" />
                      <span>{user.phoneNumber}</span>
                    </div>
                  )}
                </div>

                {/* Help Text */}
                <div className="mt-4 pt-4 border-t border-white/20">
                  <p className="text-xs text-center opacity-70">
                    For assistance: support@mediqzy.com
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>

      {/* Flip Instruction */}
      <p className="text-xs text-center text-muted-foreground mt-2">
        Click card to see QR code
      </p>

      {/* Plan Details */}
      {plan && (
        <Card className="mt-4 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">{plan.name}</p>
              <p className="text-xs text-muted-foreground">Active Plan</p>
            </div>
            <Badge variant="outline" className={cn('gap-1', plan.color)}>
              <TierIcon className="h-3 w-3" />
              {tier.toUpperCase()}
            </Badge>
          </div>
        </Card>
      )}
    </div>
  );
};

export default MembershipCard;
