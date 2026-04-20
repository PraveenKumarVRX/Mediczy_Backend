import React, { useRef, useEffect, useState } from 'react';
import { Button } from '../ui/button';
import { Download, RotateCcw } from 'lucide-react';
import QRCode from 'qrcode';
import { cn } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────────
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
    tier: string | number;
    tierName?: string;
    color?: string;
    validThru?: string; // "MM/YY"
    type?: string;      // 'personal' | 'corporate'
  };
  className?: string;
}

// ── Tier design configs ────────────────────────────────────────────────────────
type TierKey = 'basic' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'corporate' | 'default';

interface TierDesign {
  cardGradient: string;
  brushColor: string;
  textColor: string;
  subColor: string;
  accentColor: string;
  particles: boolean;
  ornateQR: boolean;
  cardBorder: string;
  label: string;
}

const TIER_DESIGNS: Record<TierKey, TierDesign> = {
  basic: {
    cardGradient: 'linear-gradient(145deg, #c0bba8 0%, #b0ab98 30%, #c8c3b0 60%, #a8a390 100%)',
    brushColor: 'rgba(255,255,255,0.12)',
    textColor: '#3a3530',
    subColor: '#5a5550',
    accentColor: '#6a6050',
    particles: false,
    ornateQR: false,
    cardBorder: '1px solid rgba(180,170,150,0.6)',
    label: 'BASIC',
  },
  silver: {
    cardGradient: 'linear-gradient(145deg, #e8e8e0 0%, #d0d0c8 25%, #f0f0e8 50%, #c0c0b8 75%, #e0e0d8 100%)',
    brushColor: 'rgba(255,255,255,0.22)',
    textColor: '#2a2a30',
    subColor: '#505060',
    accentColor: '#707080',
    particles: false,
    ornateQR: false,
    cardBorder: '1px solid rgba(200,200,210,0.8)',
    label: 'SILVER',
  },
  gold: {
    cardGradient: 'linear-gradient(145deg, #d4a030 0%, #c89020 20%, #e8b840 40%, #b87a10 60%, #d8a828 80%, #c09018 100%)',
    brushColor: 'rgba(255,240,160,0.15)',
    textColor: '#2a1a00',
    subColor: '#4a3010',
    accentColor: '#2a1a00',
    particles: false,
    ornateQR: false,
    cardBorder: '1px solid rgba(200,160,40,0.6)',
    label: 'GOLD',
  },
  platinum: {
    cardGradient: 'linear-gradient(145deg, #ece8d8 0%, #d8d4c4 25%, #f4f0e0 50%, #c8c4b4 75%, #e4e0d0 100%)',
    brushColor: 'rgba(255,255,255,0.20)',
    textColor: '#1a1a20',
    subColor: '#403a30',
    accentColor: '#c8a830',
    particles: true,
    ornateQR: false,
    cardBorder: '2px solid rgba(200,168,48,0.7)',
    label: 'PLATINUM',
  },
  diamond: {
    cardGradient: 'linear-gradient(145deg, #1a383e 0%, #0c2428 25%, #1e4048 50%, #081c20 75%, #142830 100%)',
    brushColor: 'rgba(200,240,255,0.06)',
    textColor: '#e8f4f8',
    subColor: '#a0c4cc',
    accentColor: '#d4f0ff',
    particles: true,
    ornateQR: true,
    cardBorder: '1px solid rgba(140,200,220,0.4)',
    label: 'DIAMOND',
  },
  corporate: {
    cardGradient: 'linear-gradient(145deg, #1e3a5f 0%, #162c4a 30%, #2a4a6f 60%, #1a3055 100%)',
    brushColor: 'rgba(100,160,255,0.08)',
    textColor: '#e8f0ff',
    subColor: '#90a8cc',
    accentColor: '#60a0e0',
    particles: false,
    ornateQR: false,
    cardBorder: '1px solid rgba(60,120,200,0.5)',
    label: 'CORPORATE',
  },
  default: {
    cardGradient: 'linear-gradient(145deg, #d4a030 0%, #c89020 40%, #e8b840 70%, #c09018 100%)',
    brushColor: 'rgba(255,240,160,0.15)',
    textColor: '#2a1a00',
    subColor: '#4a3010',
    accentColor: '#2a1a00',
    particles: false,
    ornateQR: false,
    cardBorder: '1px solid rgba(200,160,40,0.6)',
    label: 'MEMBER',
  },
};

function resolveTierKey(plan?: MembershipCardProps['plan']): TierKey {
  if (!plan) return 'default';
  const raw = (plan.tierName || plan.name || String(plan.tier) || '').toLowerCase();
  if (raw.includes('diamond')) return 'diamond';
  if (raw.includes('platinum')) return 'platinum';
  if (raw.includes('gold')) return 'gold';
  if (raw.includes('silver')) return 'silver';
  if (raw.includes('basic') || raw === '0') return 'basic';
  if (plan.type === 'corporate' || raw.includes('corp') || raw.includes('corporate')) return 'corporate';
  return 'default';
}

// ── SVG sub-components ────────────────────────────────────────────────────────

function HandshakeHeartLogo({ color = '#2a1a00', size = 80 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M50 82 C50 82 15 58 15 35 C15 24 24 16 35 16 C41 16 47 19 50 24 C53 19 59 16 65 16 C76 16 85 24 85 35 C85 58 50 82 50 82Z"
        fill="none" stroke={color} strokeWidth="4" strokeLinejoin="round"
      />
      <path d="M32 50 L42 42 L50 46 L58 42 L68 50" stroke={color} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M38 56 L42 42" stroke={color} strokeWidth="3" strokeLinecap="round" />
      <path d="M62 56 L58 42" stroke={color} strokeWidth="3" strokeLinecap="round" />
      <circle cx="50" cy="46" r="3.5" fill={color} />
    </svg>
  );
}

function BrushedTexture({ color }: { color: string }) {
  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{
        background: `repeating-linear-gradient(92deg, transparent 0px, ${color} 1px, transparent 2px, transparent 4px)`,
        mixBlendMode: 'overlay',
      }}
    />
  );
}

function GoldSparkles({ color = 'rgba(200,168,48,0.7)', count = 14 }: { color?: string; count?: number }) {
  const sparks = Array.from({ length: count }, (_, i) => ({
    x: ((i * 73 + 11) % 88) / 88,
    y: ((i * 53 + 19) % 82) / 82,
    r: i % 3 === 0 ? 2.5 : i % 3 === 1 ? 1.5 : 1,
    op: 0.4 + (i % 4) * 0.15,
  }));
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 420 265" preserveAspectRatio="none">
      {sparks.map((s, i) => (
        <circle key={i} cx={s.x * 420} cy={s.y * 265} r={s.r} fill={color} opacity={s.op} />
      ))}
      {[{ cx: 60, cy: 30, sz: 8 }, { cx: 340, cy: 50, sz: 6 }, { cx: 200, cy: 230, sz: 10 }].map((p, i) => (
        <path key={`star-${i}`}
          d={`M${p.cx},${p.cy - p.sz} L${p.cx + 2},${p.cy - 2} L${p.cx + p.sz},${p.cy} L${p.cx + 2},${p.cy + 2} L${p.cx},${p.cy + p.sz} L${p.cx - 2},${p.cy + 2} L${p.cx - p.sz},${p.cy} L${p.cx - 2},${p.cy - 2}Z`}
          fill={color} opacity={0.6}
        />
      ))}
    </svg>
  );
}

function DiamondParticles() {
  const gems = [
    { x: 15, y: 12, s: 14 }, { x: 370, y: 20, s: 10 }, { x: 390, y: 200, s: 18 },
    { x: 25, y: 220, s: 12 }, { x: 210, y: 8, s: 8 }, { x: 340, y: 240, s: 8 },
  ];
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 420 265" preserveAspectRatio="none">
      {gems.map((g, i) => (
        <g key={i} opacity={0.5 + (i % 3) * 0.15}>
          <polygon
            points={`${g.x},${g.y - g.s} ${g.x + g.s * 0.6},${g.y - g.s * 0.3} ${g.x + g.s * 0.6},${g.y + g.s * 0.3} ${g.x},${g.y + g.s} ${g.x - g.s * 0.6},${g.y + g.s * 0.3} ${g.x - g.s * 0.6},${g.y - g.s * 0.3}`}
            fill="rgba(200,240,255,0.3)" stroke="rgba(200,240,255,0.6)" strokeWidth="0.5"
          />
        </g>
      ))}
    </svg>
  );
}

function DiamondBorder({ color = '#c8a830' }: { color?: string }) {
  const pts = Array.from({ length: 28 }, (_, i) => {
    const t = i / 28;
    let x: number, y: number;
    if (t < 0.25) { x = 420 * (t / 0.25); y = 0; }
    else if (t < 0.5) { x = 420; y = 265 * ((t - 0.25) / 0.25); }
    else if (t < 0.75) { x = 420 * (1 - (t - 0.5) / 0.25); y = 265; }
    else { x = 0; y = 265 * (1 - (t - 0.75) / 0.25); }
    return { x, y };
  });
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 420 265" preserveAspectRatio="none">
      {pts.map((d, i) => (
        <polygon key={i}
          points={`${d.x},${d.y - 5} ${d.x + 3},${d.y} ${d.x},${d.y + 5} ${d.x - 3},${d.y}`}
          fill={color} opacity={0.7}
        />
      ))}
    </svg>
  );
}

function CircleDecoration({ color = 'rgba(0,0,0,0.08)' }: { color?: string }) {
  return (
    <svg className="absolute bottom-0 right-0 w-28 h-28 pointer-events-none" viewBox="0 0 100 100">
      {[40, 30, 20, 10].map((r, i) => (
        <circle key={i} cx="100" cy="100" r={r} fill="none" stroke={color} strokeWidth="1" />
      ))}
    </svg>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
const MembershipCard: React.FC<MembershipCardProps> = ({ user, plan, className }) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [isFlipped, setIsFlipped] = useState(false);

  const tierKey = resolveTierKey(plan);
  const design = TIER_DESIGNS[tierKey];

  const memberId = user.id;
  const tierPrefixes: Record<TierKey, string> = {
    basic: '0000', silver: '1000', gold: '2000', platinum: '3000',
    diamond: '4000', corporate: '5000', default: '1000',
  };
  const prefix = tierPrefixes[tierKey];
  const memberPad = String(memberId).padStart(4, '0');
  const cardNumber = `${prefix} ${memberPad} ${memberPad}`;
  const uniqueCode = `${tierPrefixes[tierKey]}${String(memberId).padStart(8, '0')}`;

  const validThru = (() => {
    if (plan?.validThru) return plan.validThru;
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`;
  })();

  const tierDisplayName = plan?.tierName || plan?.name?.toUpperCase() || design.label;

  useEffect(() => {
    QRCode.toDataURL(JSON.stringify({ memberId, tier: tierKey, uniqueCode, ts: Date.now() }), {
      width: 200, margin: 1, color: { dark: '#000000', light: '#ffffff' },
    }).then(setQrCodeUrl).catch(console.error);
  }, [memberId, tierKey, uniqueCode]);

  const downloadCard = async () => {
    if (!cardRef.current) return;
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(cardRef.current, { scale: 2, backgroundColor: null, logging: false });
      const a = document.createElement('a');
      a.download = `mediqzy-${tierKey}-${memberId}.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
    } catch (e) { console.error(e); }
  };

  return (
    <div className={cn('w-full max-w-[440px]', className)}>
      {/* Controls */}
      <div className="flex items-center justify-between mb-2 px-1">
        <button
          onClick={() => setIsFlipped(f => !f)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {isFlipped ? 'Show front' : 'Show QR code'}
        </button>
        <Button variant="ghost" size="sm" onClick={downloadCard} className="h-7 gap-1.5 text-xs">
          <Download className="h-3.5 w-3.5" />
          Save
        </Button>
      </div>

      {/* Card flip container — credit-card aspect ratio 1.586:1 */}
      <div
        className="relative w-full cursor-pointer select-none"
        style={{ perspective: '1200px', aspectRatio: '420 / 265' }}
        onClick={() => setIsFlipped(f => !f)}
      >
        <div
          className="relative w-full h-full transition-transform duration-700"
          style={{ transformStyle: 'preserve-3d', transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
        >
          {/* ── FRONT ── */}
          <div
            ref={cardRef}
            className="absolute inset-0 rounded-2xl overflow-hidden shadow-2xl"
            style={{ backfaceVisibility: 'hidden', border: design.cardBorder }}
          >
            <div
              className="relative w-full h-full flex flex-col items-center justify-between py-4 px-6"
              style={{ background: design.cardGradient }}
            >
              <BrushedTexture color={design.brushColor} />

              {tierKey === 'platinum' && <DiamondBorder color={design.accentColor} />}
              {tierKey === 'platinum' && <GoldSparkles color="rgba(200,168,48,0.7)" count={14} />}
              {tierKey === 'diamond'  && <DiamondParticles />}
              {tierKey === 'silver'   && <GoldSparkles color="rgba(200,200,220,0.5)" count={8} />}

              <CircleDecoration
                color={tierKey === 'diamond' ? 'rgba(200,240,255,0.1)' : 'rgba(0,0,0,0.08)'}
              />

              {/* Logo */}
              <div className="relative z-10 flex flex-col items-center">
                <HandshakeHeartLogo
                  color={design.accentColor === '#c8a830' ? '#c8a830' : design.textColor}
                  size={56}
                />
              </div>

              {/* Brand + Tier name */}
              <div className="relative z-10 flex flex-col items-center gap-0.5">
                <span
                  className="font-serif text-2xl font-bold italic tracking-wide"
                  style={{ color: design.textColor }}
                >
                  MediQzy
                </span>
                <span
                  className="text-[10px] font-black tracking-[0.18em] uppercase"
                  style={{ color: design.subColor }}
                >
                  {tierDisplayName} MEMBERSHIP
                </span>
              </div>

              {/* Card number + valid thru */}
              <div className="relative z-10 w-full flex items-end justify-between">
                <div>
                  <p className="text-[9px] font-semibold tracking-widest mb-0.5 uppercase" style={{ color: design.subColor }}>
                    Card No
                  </p>
                  <p className="font-mono font-bold tracking-widest text-sm" style={{ color: design.textColor }}>
                    {cardNumber}
                  </p>
                  <p className="text-[9px] tracking-wider mt-0.5" style={{ color: design.subColor }}>
                    Wellness &amp; Care
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-semibold tracking-widest mb-0.5 uppercase" style={{ color: design.subColor }}>
                    Valid Thru
                  </p>
                  <p className="font-mono font-bold text-sm" style={{ color: design.textColor }}>
                    {validThru}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ── BACK ── */}
          <div
            className="absolute inset-0 rounded-2xl overflow-hidden shadow-2xl"
            style={{
              backfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)',
              background: 'linear-gradient(145deg, #0f2d32 0%, #0a2428 50%, #122830 100%)',
              border: '1px solid rgba(80,140,150,0.4)',
            }}
          >
            <div className="relative w-full h-full flex flex-col text-white">
              {/* Magnetic stripe */}
              <div className="w-full h-8 mt-5 bg-gray-900" />

              {/* Body */}
              <div className="flex items-start gap-3 px-4 mt-3 flex-1 overflow-hidden">
                {/* Left: signature + terms + logo */}
                <div className="flex-1 flex flex-col gap-2 min-w-0">
                  {/* Signature panel row */}
                  <div className="flex items-center gap-2">
                    <div
                      className="flex-1 h-7 rounded-sm flex items-center px-2"
                      style={{ background: 'linear-gradient(90deg, #d0d0c8, #e8e8e0, #c8c8c0)' }}
                    >
                      <span className="text-[9px] text-gray-500 italic">Signature Panel</span>
                    </div>
                    <div
                      className="px-2 py-0.5 rounded text-[9px] font-black tracking-widest shrink-0"
                      style={{ background: design.cardGradient, color: design.textColor, minWidth: '60px', textAlign: 'center' }}
                    >
                      {design.label}
                    </div>
                  </div>

                  {/* Terms */}
                  <div className="space-y-0.5">
                    <p className="text-[8px] font-bold text-white/70 uppercase tracking-wider">Terms &amp; Conditions</p>
                    <p className="text-[7px] text-white/50 leading-tight">1. Non-transferable. Valid only for the named member.</p>
                    <p className="text-[7px] text-white/50 leading-tight">2. Benefits subject to plan limits and network availability.</p>
                    <p className="text-[7px] text-white/50 leading-tight">3. Contact support@mediqzy.com for assistance.</p>
                  </div>

                  {/* Logo row */}
                  <div className="flex items-center gap-1.5 mt-auto pb-1">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <polygon points="12,2 22,9 18,22 6,22 2,9" fill="rgba(180,220,255,0.3)" stroke="rgba(180,220,255,0.8)" strokeWidth="1.5" />
                      <line x1="12" y1="2" x2="12" y2="22" stroke="rgba(180,220,255,0.4)" strokeWidth="0.8" />
                      <line x1="2" y1="9" x2="22" y2="9" stroke="rgba(180,220,255,0.4)" strokeWidth="0.8" />
                    </svg>
                    <div>
                      <p className="text-[10px] font-bold text-white/90 font-serif italic leading-tight">MediQzy</p>
                      <p className="text-[7px] text-white/50 leading-tight">Wellness &amp; Care</p>
                      <p className="text-[7px] text-white/50 leading-tight">VALID THRU: {validThru}</p>
                    </div>
                  </div>
                </div>

                {/* Right: QR code */}
                <div className="flex flex-col items-center gap-1 pt-0.5 shrink-0">
                  <div className="relative w-[72px] h-[72px]">
                    {/* Ornate frame for Diamond */}
                    {design.ornateQR && (
                      <svg viewBox="0 0 80 80" className="absolute inset-0 w-full h-full pointer-events-none z-10">
                        <rect x="2" y="2" width="76" height="76" rx="4" fill="none" stroke="#c8a830" strokeWidth="2" />
                        <rect x="5" y="5" width="70" height="70" rx="3" fill="none" stroke="#c8a830" strokeWidth="0.8" opacity="0.5" />
                        {[[10,10],[70,10],[10,70],[70,70]].map(([cx, cy], i) => (
                          <polygon key={i} points={`${cx},${cy-5} ${cx+3},${cy} ${cx},${cy+5} ${cx-3},${cy}`} fill="#c8a830" opacity={0.85} />
                        ))}
                      </svg>
                    )}
                    {qrCodeUrl ? (
                      <img
                        src={qrCodeUrl}
                        alt="Membership QR"
                        className="w-full h-full rounded"
                        style={{
                          border: `1.5px solid ${design.ornateQR ? '#c8a830' : design.accentColor}`,
                          background: 'white',
                          padding: '2px',
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-white/10 rounded">
                        <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      </div>
                    )}
                  </div>
                  <div className="text-center">
                    <p className="text-[7px] text-white/50 leading-tight">Unique Code:</p>
                    <p className="text-[8px] font-mono text-white/80 font-bold tracking-wider">{uniqueCode}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MembershipCard;
