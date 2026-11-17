import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

// Animation level for the dashboard area, chosen with the slider in the header settings.
//   0 Off      - nothing moves (also the default when Windows "Animation effects" is off)
//   1 Subtle   - short, quick transitions; no moving dots, pulses or drifting shapes
//   2 Standard - the designed animations (default)
//   3 Lively   - slower, more visible motion, more moving dots in the flows
// Saved on this computer only (per user profile of the app), not in the database.

export type MotionLevel = 0 | 1 | 2 | 3;
export const MOTION_LABELS = ["Off", "Subtle", "Standard", "Lively"] as const;
export const MOTION_HINTS = [
  "Nothing moves. Numbers and charts appear straight away.",
  "Quick, light transitions only. No moving dots or pulses.",
  "Charts draw in, numbers count up, flows and timers move.",
  "Slower, more visible motion and busier flows.",
] as const;
const FACTOR = [0, 0.6, 1, 1.35];
const KEY = "mms.dashboards.motion";

function initial(): MotionLevel {
  try {
    const v = localStorage.getItem(KEY);
    if (v !== null && /^[0-3]$/.test(v)) return Number(v) as MotionLevel;
  } catch { /* storage unavailable */ }
  try {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return 0;
  } catch { /* ignore */ }
  return 2;
}

let current: MotionLevel = initial();
const listeners = new Set<() => void>();

export const getMotion = () => current;
export const motionFactor = (l: MotionLevel = current) => FACTOR[l];
export function setMotion(l: MotionLevel) {
  current = l;
  try { localStorage.setItem(KEY, String(l)); } catch { /* ignore */ }
  listeners.forEach((f) => f());
}
export function useMotion(): MotionLevel {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, getMotion, getMotion);
}

/** Recharts animation props for the current level (base = duration in ms at Standard). */
export function chartAnim(base = 900): { isAnimationActive: boolean; animationDuration?: number; animationEasing?: "ease-out" } {
  const l = current;
  return l === 0 ? { isAnimationActive: false } : { isAnimationActive: true, animationDuration: Math.round(base * FACTOR[l]), animationEasing: "ease-out" };
}

const ease = (t: number) => 1 - Math.pow(1 - t, 3);

/** A number that counts up to its value (and moves from the old value when it changes).
 *  Text such as "94%", "12 h", "4,700" counts the number part; anything else is shown as is. */
export function Num({ v }: { v: ReactNode }) {
  const level = useMotion();
  const parsed = parseNum(v);
  const target = parsed?.n ?? null;
  const [shown, setShown] = useState<number | null>(level === 0 ? target : target == null ? null : 0);
  const from = useRef<number>(0);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    if (target == null) { setShown(null); return; }
    if (level === 0) { setShown(target); from.current = target; return; }
    const start = performance.now();
    const a = from.current;
    const dur = 800 * FACTOR[level];
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / dur);
      const val = a + (target - a) * ease(k);
      setShown(val);
      if (k < 1) raf.current = requestAnimationFrame(step);
      else from.current = target;
    };
    raf.current = requestAnimationFrame(step);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); from.current = target; };
  }, [target, level]);
  if (!parsed || shown == null) return <>{v}</>;
  const num = parsed.decimals ? shown.toFixed(parsed.decimals) : String(Math.round(shown));
  const text = parsed.commas ? Number(num).toLocaleString(undefined, { minimumFractionDigits: parsed.decimals, maximumFractionDigits: parsed.decimals }) : num;
  return <>{parsed.pre}{text}{parsed.post}</>;
}
function parseNum(v: ReactNode): { n: number; pre: string; post: string; decimals: number; commas: boolean } | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    const s = String(v);
    return { n: v, pre: "", post: "", decimals: s.includes(".") ? s.split(".")[1].length : 0, commas: false };
  }
  if (typeof v !== "string") return null;
  const m = /^(\D*?)(-?\d[\d,]*(?:\.\d+)?)(.*)$/.exec(v);
  if (!m) return null;
  const raw = m[2];
  const n = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  return { n, pre: m[1], post: m[3], decimals: raw.includes(".") ? raw.split(".")[1].length : 0, commas: raw.includes(",") };
}

/** How long something has been waiting, ticking live; amber after 2 days, red after the limit. */
export function LiveAge({ since, limitDays = 7 }: { since: number | null; limitDays?: number }) {
  const level = useMotion();
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now() / 1000), level >= 2 ? 1000 : 60000);
    return () => window.clearInterval(id);
  }, [level]);
  if (since == null) return <span className="mrid-soft">—</span>;
  const secs = Math.max(0, Math.floor(now - since));
  const d = Math.floor(secs / 86400), h = Math.floor((secs % 86400) / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
  const tone = d >= limitDays ? "is-red" : d >= 2 ? "is-amber" : "is-green";
  const pad = (x: number) => String(x).padStart(2, "0");
  return (
    <span className={`fl-age ${tone}`} title={`Waiting since ${new Date(since * 1000).toLocaleString()}`}>
      <i aria-hidden="true" />
      <b>{d > 0 ? `${d} d ` : ""}{pad(h)}:{pad(m)}{level >= 2 ? <span className="fl-age-s">:{pad(s)}</span> : null}</b>
    </span>
  );
}

/** Small ring that fills to pct (0-100), with a label in the middle. */
export function Ring({ pct, color, label, size = 40, pulse = false, title }: { pct: number; color: string; label?: ReactNode; size?: number; pulse?: boolean; title?: string }) {
  const r = 15.5, c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, pct));
  return (
    <span className={`fl-ring${pulse ? " is-pulse" : ""}`} style={{ width: size, height: size, ["--ring" as string]: color, ["--ring-off" as string]: String(c * (1 - p / 100)), ["--ring-c" as string]: String(c) }} title={title}>
      <svg viewBox="0 0 36 36" aria-hidden="true">
        <circle cx="18" cy="18" r={r} className="fl-ring-track" />
        <circle cx="18" cy="18" r={r} className="fl-ring-fill" strokeDasharray={c} />
      </svg>
      {label != null && <span className="fl-ring-label">{label}</span>}
    </span>
  );
}

/** Slim bar that fills to pct (0-100+), with an optional warning mark. */
export function Meter({ pct, color, warnPct, pulse = false }: { pct: number; color: string; warnPct?: number | null; pulse?: boolean }) {
  return (
    <span className={`fl-gauge${pulse ? " is-pulse" : ""}`}>
      <span className="fl-gauge-track">
        <i style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
        {warnPct != null && warnPct > 0 && warnPct < 100 && <b style={{ left: `${warnPct}%` }} title="Warning point" />}
      </span>
      <span className="fl-gauge-num" style={{ color }}><Num v={`${Math.round(pct)}%`} /></span>
    </span>
  );
}

/** Moving dots along a flow arrow. count = how many dots (0 = none). */
export function FlowDots({ count, path, color = "var(--accent-blue, #2f6fed)" }: { count: number; path: string; color?: string }) {
  const level = useMotion();
  if (level < 2 || count <= 0) return null;
  const n = Math.min(level === 3 ? 5 : 3, count);
  const dur = level === 3 ? 2.6 : 2;
  return (
    <>
      {Array.from({ length: n }, (_, k) => (
        <circle key={k} r={level === 3 ? 2.6 : 2.2} fill={color} opacity="0">
          <animateMotion dur={`${dur}s`} repeatCount="indefinite" begin={`${(k * dur) / n}s`} path={path} />
          <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.15;0.8;1" dur={`${dur}s`} repeatCount="indefinite" begin={`${(k * dur) / n}s`} />
        </circle>
      ))}
    </>
  );
}

/** The slider shown in the header's settings menu. */
export function MotionSetting() {
  const level = useMotion();
  return (
    <div className="fl-motion">
      <div className="fl-motion-head">
        <b>Animation</b>
        <span className="fl-motion-value">{MOTION_LABELS[level]}</span>
      </div>
      <input
        type="range"
        min={0}
        max={3}
        step={1}
        value={level}
        aria-label="Animation level"
        aria-valuetext={MOTION_LABELS[level]}
        onChange={(e) => setMotion(Number(e.target.value) as MotionLevel)}
        style={{ ["--fill" as string]: `${(level / 3) * 100}%` }}
      />
      <div className="fl-motion-ticks" aria-hidden="true">
        {MOTION_LABELS.map((l, n) => (
          <button key={l} type="button" tabIndex={-1} className={n === level ? "is-on" : ""} onClick={() => setMotion(n as MotionLevel)}>{l}</button>
        ))}
      </div>
      <p className="fl-motion-hint">{MOTION_HINTS[level]}</p>
    </div>
  );
}
