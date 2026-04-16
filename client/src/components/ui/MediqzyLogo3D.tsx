import { motion } from "framer-motion";

type LogoSize = "xs" | "sm" | "md" | "lg" | "xl" | "hero";

interface MediqzyLogo3DProps {
  size?: LogoSize;
  interactive?: boolean;
  float?: boolean;
  /** "light" = white wordmark (for dark panels), "dark" = slate wordmark (for white panels) */
  theme?: "light" | "dark";
  className?: string;
}

// icon-size, wordmark font-size, sub font-size, glow radius
const SIZE_MAP: Record<LogoSize, { icon: number; word: number; sub: number; glow: number }> = {
  xs:   { icon: 20, word: 13, sub: 7,  glow: 14 },
  sm:   { icon: 28, word: 17, sub: 9,  glow: 20 },
  md:   { icon: 38, word: 22, sub: 11, glow: 28 },
  lg:   { icon: 52, word: 30, sub: 14, glow: 40 },
  xl:   { icon: 68, word: 38, sub: 17, glow: 54 },
  hero: { icon: 88, word: 48, sub: 21, glow: 70 },
};

const KEYFRAMES = `
@keyframes mq-float {
  0%,100% { transform: perspective(900px) rotateX(8deg) rotateY(-7deg) translateY(0px);  }
  50%      { transform: perspective(900px) rotateX(6deg) rotateY(-5deg) translateY(-7px); }
}
@keyframes mq-icon-float {
  0%,100% { transform: translateY(0px) rotate(-2deg);  }
  50%      { transform: translateY(-5px) rotate(0deg); }
}
@keyframes mq-gold-pulse {
  0%,100% { filter: drop-shadow(0 0 6px rgba(245,208,96,0.55)); }
  50%      { filter: drop-shadow(0 0 14px rgba(255,228,80,0.95)); }
}
`;

let injected = false;
function injectKeyframes() {
  if (injected || typeof document === "undefined") return;
  const s = document.createElement("style");
  s.textContent = KEYFRAMES;
  document.head.appendChild(s);
  injected = true;
}

export const MediqzyLogo3D = ({
  size = "md",
  interactive = false,
  float = false,
  theme = "light",
  className = "",
}: MediqzyLogo3DProps) => {
  const { icon, word, sub, glow } = SIZE_MAP[size];
  if (float) injectKeyframes();

  const wordColor    = theme === "light" ? "#ffffff"   : "#0f172a";
  const subColor     = theme === "light" ? "rgba(255,255,255,0.55)" : "rgba(15,23,42,0.45)";
  const iconGap      = Math.round(icon * 0.28);
  const totalHeight  = icon + sub + 6;

  const mark = (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: iconGap,
        transform: "perspective(900px) rotateX(8deg) rotateY(-7deg)",
        animation: float ? "mq-float 4.2s ease-in-out infinite" : undefined,
        userSelect: "none",
        willChange: "transform",
      }}
    >
      {/* ── Gold Heart-Cross Icon ── */}
      <div
        style={{
          position: "relative",
          width: icon,
          height: icon,
          flexShrink: 0,
          animation: float ? "mq-icon-float 3.8s ease-in-out infinite" : undefined,
          filter: float
            ? "drop-shadow(0 0 8px rgba(245,208,96,0.65))"
            : `drop-shadow(0 ${Math.round(icon * 0.12)}px ${Math.round(icon * 0.22)}px rgba(0,0,0,0.45))`,
          animationName: float ? "mq-icon-float, mq-gold-pulse" : undefined,
          animationDuration: float ? "3.8s, 2.4s" : undefined,
          animationTimingFunction: float ? "ease-in-out, ease-in-out" : undefined,
          animationIterationCount: float ? "infinite, infinite" : undefined,
        }}
      >
        <svg
          viewBox="0 0 100 100"
          width={icon}
          height={icon}
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <defs>
            {/* Gold radial gradient */}
            <radialGradient id="mqGold" cx="38%" cy="30%" r="62%">
              <stop offset="0%"   stopColor="#fff176" />
              <stop offset="45%"  stopColor="#f5d060" />
              <stop offset="100%" stopColor="#c8951a" />
            </radialGradient>
            {/* White shimmer for the cross arm */}
            <linearGradient id="mqShimmer" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%"   stopColor="rgba(255,255,255,0.80)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0.20)" />
            </linearGradient>
            <filter id="mqGlow">
              <feGaussianBlur stdDeviation="2.5" result="blur" />
              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>

          {/* Heart shape */}
          <path
            d="M50 85 C50 85 12 58 12 34 C12 20 22 11 34 11 C41 11 48 16 50 21 C52 16 59 11 66 11 C78 11 88 20 88 34 C88 58 50 85 50 85Z"
            fill="url(#mqGold)"
            filter="url(#mqGlow)"
          />
          {/* Specular highlight on heart */}
          <path
            d="M34 17 C28 17 21 22 20 30 C22 24 29 19 36 19 C41 19 46 22 49 27 C47 20 41 17 34 17Z"
            fill="rgba(255,255,255,0.38)"
          />

          {/* Medical cross — white, centred on heart */}
          <rect x="43" y="28" width="14" height="38" rx="4" fill="url(#mqShimmer)" opacity="0.92" />
          <rect x="31" y="40" width="38" height="14" rx="4" fill="url(#mqShimmer)" opacity="0.92" />

          {/* Bottom-right depth shadow on heart */}
          <path
            d="M50 85 C50 85 76 63 83 46 C79 62 65 76 50 85Z"
            fill="rgba(0,0,0,0.14)"
          />
        </svg>
      </div>

      {/* ── Wordmark ── */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          lineHeight: 1,
          gap: Math.round(word * 0.18),
        }}
      >
        <span
          style={{
            fontSize: word,
            fontWeight: 800,
            letterSpacing: "-0.03em",
            color: wordColor,
            textShadow: theme === "light"
              ? `0 ${Math.round(word * 0.06)}px ${Math.round(word * 0.22)}px rgba(0,0,0,0.55), 0 0 ${Math.round(glow * 0.6)}px rgba(245,208,96,0.18)`
              : `0 1px 4px rgba(0,0,0,0.12)`,
            fontFamily: "'Inter', 'SF Pro Display', system-ui, sans-serif",
          }}
        >
          Medi
          <span
            style={{
              background: "linear-gradient(130deg, #fde68a 0%, #f59e0b 40%, #d97706 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            qzy
          </span>
        </span>
        <span
          style={{
            fontSize: sub,
            fontWeight: 500,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: subColor,
            fontFamily: "'Inter', system-ui, sans-serif",
          }}
        >
          Wellness &amp; Care
        </span>
      </div>
    </div>
  );

  if (!interactive) {
    return <div className={`inline-flex ${className}`}>{mark}</div>;
  }

  return (
    <motion.div
      className={`inline-flex ${className}`}
      whileHover={{
        scale: 1.07,
        transition: { type: "spring", stiffness: 300, damping: 18 },
      }}
      whileTap={{ scale: 0.96 }}
    >
      {mark}
    </motion.div>
  );
};

export default MediqzyLogo3D;
