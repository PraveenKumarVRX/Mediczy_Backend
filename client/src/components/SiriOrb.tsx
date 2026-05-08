/**
 * SiriOrb — Animated orb that visualises mic / thinking / speaking state.
 *
 * States:
 *   idle      → dim, slow pulse
 *   listening → bright, reacts to mic volume (scale + glow)
 *   processing → spinning gradient ring
 *   speaking  → ripple waves sync to audio analyser
 */
import { useEffect, useRef } from "react";

export type OrbState = "idle" | "listening" | "processing" | "speaking";

interface SiriOrbProps {
  state: OrbState;
  /** 0–1 mic volume, used when state === 'listening' */
  volume?: number;
  size?: number;
  onClick?: () => void;
  className?: string;
}

export default function SiriOrb({ state, volume = 0, size = 80, onClick, className = "" }: SiriOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number>(0);
  const phaseRef  = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const s   = size * window.devicePixelRatio;
    canvas.width  = s;
    canvas.height = s;
    const cx = s / 2;
    const cy = s / 2;
    const baseR = s * 0.28;

    const draw = () => {
      ctx.clearRect(0, 0, s, s);
      phaseRef.current += 0.03;
      const p = phaseRef.current;

      if (state === "idle") {
        const pulse = 1 + 0.04 * Math.sin(p * 0.8);
        const r = baseR * pulse;
        const grad = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
        grad.addColorStop(0, "rgba(99,102,241,0.55)");
        grad.addColorStop(1, "rgba(99,102,241,0.08)");
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
        // border
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(99,102,241,0.3)";
        ctx.lineWidth = s * 0.012;
        ctx.stroke();
      }

      else if (state === "listening") {
        const boost = 1 + volume * 0.55;
        const r = baseR * boost;
        // outer glow
        const glow = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r * 1.6);
        glow.addColorStop(0, `rgba(56,189,248,${0.18 + volume * 0.25})`);
        glow.addColorStop(1, "rgba(56,189,248,0)");
        ctx.beginPath();
        ctx.arc(cx, cy, r * 1.6, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();
        // core
        const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        core.addColorStop(0, "rgba(224,242,254,0.9)");
        core.addColorStop(0.5, "rgba(56,189,248,0.8)");
        core.addColorStop(1, "rgba(14,165,233,0.5)");
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = core;
        ctx.fill();
        // waveform ring
        ctx.save();
        ctx.translate(cx, cy);
        const pts = 64;
        ctx.beginPath();
        for (let i = 0; i < pts; i++) {
          const a   = (i / pts) * Math.PI * 2;
          const rnd = 1 + (Math.sin(a * 5 + p * 3) * 0.06 + Math.sin(a * 3 + p * 2) * 0.04) * (0.5 + volume);
          const pr  = r * rnd;
          i === 0 ? ctx.moveTo(Math.cos(a) * pr, Math.sin(a) * pr)
                  : ctx.lineTo(Math.cos(a) * pr, Math.sin(a) * pr);
        }
        ctx.closePath();
        ctx.strokeStyle = `rgba(186,230,253,${0.6 + volume * 0.4})`;
        ctx.lineWidth = s * 0.014;
        ctx.stroke();
        ctx.restore();
      }

      else if (state === "processing") {
        // spinning gradient ring
        const r = baseR;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(p * 2);
        const ring = ctx.createConicalGradient
          ? (ctx as unknown as { createConicalGradient: (x: number, y: number, a: number) => CanvasGradient }).createConicalGradient(0, 0, 0)
          : null;
        ctx.restore();
        // fallback: rotating dashes
        const core2 = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        core2.addColorStop(0, "rgba(167,139,250,0.7)");
        core2.addColorStop(1, "rgba(139,92,246,0.3)");
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = core2;
        ctx.fill();
        // spinner arc
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(p * 3);
        ctx.beginPath();
        ctx.arc(0, 0, r + s * 0.065, 0, Math.PI * 1.4);
        ctx.strokeStyle = "rgba(167,139,250,0.9)";
        ctx.lineWidth = s * 0.045;
        ctx.lineCap = "round";
        ctx.stroke();
        // trailing arc
        ctx.beginPath();
        ctx.arc(0, 0, r + s * 0.065, Math.PI * 1.5, Math.PI * 2.6);
        ctx.strokeStyle = "rgba(167,139,250,0.25)";
        ctx.lineWidth = s * 0.025;
        ctx.stroke();
        ctx.restore();
      }

      else if (state === "speaking") {
        const r = baseR * (1 + 0.08 * Math.sin(p * 4));
        const core3 = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        core3.addColorStop(0, "rgba(255,255,255,0.95)");
        core3.addColorStop(0.4, "rgba(134,239,172,0.85)");
        core3.addColorStop(1, "rgba(34,197,94,0.5)");
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = core3;
        ctx.fill();
        // ripple rings
        for (let i = 1; i <= 3; i++) {
          const rippleR = r + s * 0.065 * i + s * 0.03 * Math.sin(p * 3 - i * 1.2);
          const alpha   = 0.25 - i * 0.06;
          ctx.beginPath();
          ctx.arc(cx, cy, rippleR, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(74,222,128,${alpha})`;
          ctx.lineWidth = s * 0.018;
          ctx.stroke();
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [state, volume, size]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      style={{ width: size, height: size, cursor: onClick ? "pointer" : "default" }}
      onClick={onClick}
      className={className}
    />
  );
}
