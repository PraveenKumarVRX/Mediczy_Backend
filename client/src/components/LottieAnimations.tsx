import { Player } from "@lottiefiles/react-lottie-player";
import { cn } from "@/lib/utils";

/**
 * Curated Lottie animation URLs from LottieFiles CDN.
 * These are free-to-use, production-safe animations.
 */
export const LOTTIE_URLS = {
  // Health & Medical
  heartbeat: "https://lottie.host/a3cc6c42-1767-4522-9bff-489a08fecca4/r7MlxLIkPE.json",
  doctorConsult: "https://lottie.host/9a0e68c8-81c8-4c3a-8f0a-3e3b94fbe7b0/cOPjxYrJXr.json",
  healthCheck: "https://lottie.host/2d7b4e52-7e6f-4fff-956a-0b367ad93e65/9LTOLxfbnN.json",
  
  // AI & Robot
  aiBot: "https://lottie.host/b0fce786-e9b9-4cf9-b0a5-7e42f2db0a5e/HPyHYPtKpV.json",
  
  // Success & Achievement
  success: "https://lottie.host/cc09a5e6-7b69-45ee-b990-4fba95dce14e/mfFKbz3ESv.json",
  confetti: "https://lottie.host/07eb8ecb-62e4-4e24-a498-6fc64ccffeb5/VFmLgpKIHu.json",
  trophy: "https://lottie.host/ae7c4f0a-8783-4e47-861f-7c7cdff5cbcc/7DP96w8MbD.json",
  star: "https://lottie.host/b2f3e5e4-1c2e-44a0-b8b0-e5c0d0e6d3b5/r7NU2HJJaM.json",
  
  // Empty States
  emptyBox: "https://lottie.host/a5f22f22-3f42-4e5f-8b35-d6deafbf0e81/U5rZ3lTmJX.json",
  noData: "https://lottie.host/76419e4b-8edd-484d-965d-c3c3e0d2aaaf/0qIxj0JxJb.json",
  emptyCalendar: "https://lottie.host/371a1af5-d76a-42a0-93d8-63adf08b1c61/SaEHBOyJbA.json",
  
  // Loading
  loading: "https://lottie.host/2ec05a1c-e26c-4079-ba27-2a8d7b1c4c80/X8T0xfCbNy.json",
  
  // Fitness & Wellness
  walking: "https://lottie.host/70bf0ef3-aa80-4be3-a5d2-18fa8da8b0d0/q6RLLOQMMG.json",
  meditation: "https://lottie.host/6e9f3fec-c982-47cb-bfe4-f06f1fdcf7b4/Rg1NJZmfIG.json",

  // Streak / Fire
  fire: "https://lottie.host/c3b4d8c0-b095-4a93-b11a-e8cb3c5e7a7a/8IYkQpJBpG.json",
} as const;

interface LottieIconProps {
  src: string;
  size?: number;
  loop?: boolean;
  autoplay?: boolean;
  className?: string;
  speed?: number;
}

/**
 * Compact Lottie animation player used as an icon or illustration.
 */
export function LottieIcon({
  src,
  size = 120,
  loop = true,
  autoplay = true,
  className,
  speed = 1,
}: LottieIconProps) {
  return (
    <div className={cn("flex items-center justify-center", className)}>
      <Player
        autoplay={autoplay}
        loop={loop}
        src={src}
        speed={speed}
        style={{ width: size, height: size }}
      />
    </div>
  );
}

interface EmptyStateProps {
  animation?: string;
  title: string;
  description?: string;
  size?: number;
  children?: React.ReactNode;
  className?: string;
}

/**
 * A polished empty-state component with Lottie animation.
 * Usage:
 *   <LottieEmptyState
 *     animation={LOTTIE_URLS.emptyCalendar}
 *     title="No upcoming appointments"
 *     description="Book a consultation to get started."
 *   />
 */
export function LottieEmptyState({
  animation = LOTTIE_URLS.emptyBox,
  title,
  description,
  size = 160,
  children,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-8 text-center", className)}>
      <LottieIcon src={animation} size={size} />
      <h3 className="mt-2 text-lg font-semibold text-slate-700 dark:text-slate-200">
        {title}
      </h3>
      {description && (
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-xs">
          {description}
        </p>
      )}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

export default LottieIcon;
