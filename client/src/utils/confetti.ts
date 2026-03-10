/**
 * Lightweight confetti effect using canvas.
 * No external dependency required.
 */

interface ConfettiParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  rotation: number;
  rotationSpeed: number;
  opacity: number;
}

const CONFETTI_COLORS = [
  "#14b8a6", // teal-500
  "#f59e0b", // amber-500
  "#8b5cf6", // violet-500
  "#ef4444", // red-500
  "#3b82f6", // blue-500
  "#10b981", // emerald-500
  "#ec4899", // pink-500
  "#f97316", // orange-500
];

export function fireConfetti(options?: {
  particleCount?: number;
  duration?: number;
  origin?: { x: number; y: number };
}) {
  const {
    particleCount = 60,
    duration = 2500,
    origin = { x: 0.5, y: 0.4 },
  } = options || {};

  const canvas = document.createElement("canvas");
  canvas.style.cssText = `
    position: fixed;
    top: 0; left: 0;
    width: 100vw; height: 100vh;
    pointer-events: none;
    z-index: 99999;
  `;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.remove();
    return;
  }

  const particles: ConfettiParticle[] = [];

  for (let i = 0; i < particleCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const velocity = 4 + Math.random() * 6;
    particles.push({
      x: canvas.width * origin.x,
      y: canvas.height * origin.y,
      vx: Math.cos(angle) * velocity * (0.5 + Math.random()),
      vy: Math.sin(angle) * velocity * (0.5 + Math.random()) - 3,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      size: 4 + Math.random() * 6,
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 10,
      opacity: 1,
    });
  }

  const startTime = performance.now();

  function animate(now: number) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);

    ctx!.clearRect(0, 0, canvas.width, canvas.height);

    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.15; // gravity
      p.rotation += p.rotationSpeed;
      p.opacity = 1 - progress;
      p.vx *= 0.99; // air resistance

      ctx!.save();
      ctx!.translate(p.x, p.y);
      ctx!.rotate((p.rotation * Math.PI) / 180);
      ctx!.globalAlpha = p.opacity;
      ctx!.fillStyle = p.color;
      ctx!.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx!.restore();
    }

    if (progress < 1) {
      requestAnimationFrame(animate);
    } else {
      canvas.remove();
    }
  }

  requestAnimationFrame(animate);
}

/**
 * Fire confetti for achievements / streak milestones.
 * Use it like: fireConfetti() or fireStreakConfetti(7)
 */
export function fireStreakConfetti(streakDay: number) {
  const intensity = Math.min(streakDay * 5, 120);
  fireConfetti({
    particleCount: intensity,
    duration: 3000,
    origin: { x: 0.5, y: 0.3 },
  });
}

export default fireConfetti;
