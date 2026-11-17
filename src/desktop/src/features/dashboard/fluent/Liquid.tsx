import { useEffect, useState } from "react";

// Liquid level fill for percentage cards: the card's background fills from the bottom to the
// card's percentage, with moving waves on the surface (same design as the Overview hero card).

/** The percentage in a value like "66.7%" or "45 %", clamped to 0-100; null when it is not a percentage. */
export function pctOf(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const m = v.trim().match(/^(-?\d+(?:\.\d+)?)\s*%$/);
  return m ? Math.max(0, Math.min(100, parseFloat(m[1]))) : null;
}

/** Put inside a card that has class "has-liquid" (see LIQUID_CSS). Renders nothing without a percentage. */
export function Liquid({ pct, color }: { pct: number | null | undefined; color?: string }) {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    const r = requestAnimationFrame(() => setLevel(pct ?? 0));
    return () => cancelAnimationFrame(r);
  }, [pct]);
  if (pct == null || !Number.isFinite(pct)) return null;
  return (
    <span className="fl-liquid" style={{ ["--p" as string]: `${level}%`, ...(color ? { ["--lq" as string]: color } : {}) }} aria-hidden="true">
      <span className="fl-liquid-back" />
      <span className="fl-liquid-fill"><span className="fl-liquid-bubbles"><i /><i /><i /><i /></span></span>
    </span>
  );
}

const WAVE = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='16' viewBox='0 0 160 16' preserveAspectRatio='none'%3E%3Cpath d='M0 8Q40 0 80 8T160 8V16H0Z'/%3E%3C/svg%3E")`;

export const LIQUID_CSS = `
.fl-shell .has-liquid::after { display: none !important; }
.fl-shell .has-liquid > :not(.fl-liquid) { position: relative; z-index: 1; }
.fl-shell .has-liquid .fl-ring { display: none; }
.fl-liquid { position: absolute; inset: 0; z-index: 0; overflow: hidden; border-radius: inherit; pointer-events: none; }
.fl-liquid-fill, .fl-liquid-back { position: absolute; left: 0; right: 0; bottom: 0; height: calc(var(--p) + 14px);
  -webkit-mask: ${WAVE} repeat-x 0 0 / 160px 16px, linear-gradient(#000 0 0) no-repeat 0 14px / 100% 100%;
  mask: ${WAVE} repeat-x 0 0 / 160px 16px, linear-gradient(#000 0 0) no-repeat 0 14px / 100% 100%;
  transition: height calc(1.8s / var(--fl-k, 1)) cubic-bezier(.22,.8,.2,1); animation: fl-lq-wave calc(3s / var(--fl-k, 1)) linear infinite; }
.fl-liquid-fill { background: linear-gradient(180deg, color-mix(in srgb, var(--lq, var(--kpi, var(--fl-blue))) 34%, transparent) 0%,
  color-mix(in srgb, var(--lq, var(--kpi, var(--fl-blue))) 20%, transparent) 60%, color-mix(in srgb, var(--lq, var(--kpi, var(--fl-blue))) 14%, transparent) 100%); }
.fl-liquid-back { height: calc(var(--p) + 20px); background: color-mix(in srgb, var(--lq, var(--kpi, var(--fl-blue))) 12%, transparent);
  -webkit-mask-size: 220px 20px, 100% 100%; mask-size: 220px 20px, 100% 100%; -webkit-mask-position: 0 0, 0 18px; mask-position: 0 0, 0 18px;
  animation: fl-lq-wave2 calc(5s / var(--fl-k, 1)) linear infinite; }
.fl-liquid-fill::after { content: ""; position: absolute; inset: 0; background: linear-gradient(100deg, transparent 0%, rgba(255,255,255,.22) 45%, transparent 60%);
  background-size: 260% 100%; animation: fl-lq-shine calc(7s / var(--fl-k, 1)) linear infinite; }
.fl-liquid-bubbles { position: absolute; inset: 14px 0 0; overflow: hidden; }
.fl-liquid-bubbles i { position: absolute; bottom: -8px; width: 5px; height: 5px; border-radius: 50%; background: color-mix(in srgb, var(--lq, var(--kpi, var(--fl-blue))) 45%, #fff);
  opacity: .7; animation: fl-lq-bubble calc(5.5s / var(--fl-k, 1)) ease-in infinite; }
.fl-liquid-bubbles i:nth-child(1) { left: 14%; } .fl-liquid-bubbles i:nth-child(2) { left: 38%; width: 4px; height: 4px; animation-delay: -2s; }
.fl-liquid-bubbles i:nth-child(3) { left: 63%; animation-delay: -3.6s; } .fl-liquid-bubbles i:nth-child(4) { left: 86%; width: 3px; height: 3px; animation-delay: -1.1s; }
@keyframes fl-lq-wave { from { -webkit-mask-position: 0 0, 0 14px; mask-position: 0 0, 0 14px; } to { -webkit-mask-position: 160px 0, 0 14px; mask-position: 160px 0, 0 14px; } }
@keyframes fl-lq-wave2 { from { -webkit-mask-position: 0 0, 0 18px; mask-position: 0 0, 0 18px; } to { -webkit-mask-position: -220px 0, 0 18px; mask-position: -220px 0, 0 18px; } }
@keyframes fl-lq-shine { from { background-position: 130% 0; } to { background-position: -130% 0; } }
@keyframes fl-lq-bubble { 0% { transform: translateY(0); opacity: 0; } 20% { opacity: .7; } 100% { transform: translateY(-160px); opacity: 0; } }
.fl-shell[data-motion="0"] .fl-liquid *, .fl-shell[data-motion="0"] .fl-liquid *::after { animation: none !important; transition: none !important; }
.fl-shell[data-motion="0"] .fl-liquid-bubbles { display: none; }
`;
