import { useId } from "react";

// Shared skeuomorphic instruments (ported from the UI Lab skeuomorphism sample):
//   TagLamp: one lit LED lamp for an asset's Red / Yellow / Green tag.
//   Gauge:   an analogue dial with a needle for a value inside a range.
// Styling lives in the .instr-* rules in App.tsx so every theme can restyle them.

export type TagStatus = "Red" | "Yellow" | "Green" | string | null | undefined;

const LAMP_CLASS: Record<string, string> = { Red: "red", Yellow: "yellow", Green: "green" };

interface TagLampProps {
  status: TagStatus;
  /** Diameter in px (default 18). */
  size?: number;
  /** Show the tag word next to the lamp (default false). */
  showText?: boolean;
  /** Extra tooltip text, for example the tag reason. */
  title?: string;
}

export function TagLamp({ status, size = 18, showText = false, title }: TagLampProps) {
  const cls = status ? LAMP_CLASS[status] ?? "off" : "off";
  const label = status ? `${status} tag` : "No tag";
  return (
    <span
      className={`instr-lamp ${cls}`}
      role="img"
      aria-label={label}
      title={title ? `${label}: ${title}` : label}
      style={{ ["--lamp-size" as string]: `${size}px` }}
    >
      <i />
      {showText && <span className="instr-lamp-text">{status ?? "—"}</span>}
    </span>
  );
}

interface GaugeProps {
  value: number;
  min?: number;
  max: number;
  /** Small label on the dial face, for example "AVAILABILITY". */
  caption?: string;
  /** Small unit label after the reading, for example "%". */
  unit?: string;
  /** Text shown for the reading under the dial; defaults to the value. */
  reading?: string;
  /** Which end of the scale is bad: "high" (usage versus a limit) or "low" (availability). Default "high". */
  badSide?: "high" | "low";
  /** Width in px (default 150). */
  size?: number;
}

export function Gauge({ value, min = 0, max, caption, unit, reading, badSide = "high", size = 150 }: GaugeProps) {
  const uid = useId().replace(/:/g, "");
  const span = max - min || 1;
  const ratio = Math.max(0, Math.min(1, (value - min) / span));
  const angle = -120 + ratio * 240;
  const ticks = Array.from({ length: 11 }, (_, i) => i);
  const isBad = (t: number) => (badSide === "high" ? t >= 8 : t <= 2);
  const text = reading ?? String(Math.round(value * 10) / 10);
  return (
    <div className="instr-gauge" style={{ width: size }}>
      <svg viewBox="0 0 200 150" role="img" aria-label={`${caption ?? "Gauge"} ${text}${unit ?? ""}`}>
        <defs>
          <radialGradient id={`face-${uid}`} cx="50%" cy="45%" r="70%">
            <stop offset="0%" stopColor="#fffdf2" />
            <stop offset="100%" stopColor="#d9d2b6" />
          </radialGradient>
          <linearGradient id={`glass-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.55)" />
            <stop offset="45%" stopColor="rgba(255,255,255,0.05)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
        </defs>
        <rect width="200" height="150" fill={`url(#face-${uid})`} />
        {ticks.map((t) => {
          const a = ((-120 + t * 24) * Math.PI) / 180;
          const long = t % 5 === 0;
          const x1 = 100 + Math.sin(a) * 66;
          const y1 = 105 - Math.cos(a) * 66;
          const x2 = 100 + Math.sin(a) * (long ? 52 : 58);
          const y2 = 105 - Math.cos(a) * (long ? 52 : 58);
          return (
            <line key={t} x1={x1} y1={y1} x2={x2} y2={y2} stroke={isBad(t) ? "#c9382b" : "#2a2d31"} strokeWidth={long ? 2.5 : 1.4} strokeLinecap="round" />
          );
        })}
        {caption && (
          <text x="100" y="86" textAnchor="middle" fontSize="11" fontWeight="700" fill="#4a4538" letterSpacing="1">
            {caption}
          </text>
        )}
        <text x="100" y="136" textAnchor="middle" fontSize="20" fontWeight="700" fill="#4a4538">
          {text}
          {unit ? <tspan fontSize="12">{unit}</tspan> : null}
        </text>
        <g style={{ transform: `rotate(${angle}deg)`, transformOrigin: "100px 105px", transition: "transform 180ms cubic-bezier(.3,1.5,.6,1)" }}>
          <polygon points="97,105 100,40 103,105" fill="#c9382b" stroke="#6b130b" strokeWidth="0.6" />
        </g>
        <circle cx="100" cy="105" r="9" fill="#2a2d31" />
        <circle cx="98" cy="102.5" r="3" fill="#8a9098" />
        <rect width="200" height="75" fill={`url(#glass-${uid})`} />
      </svg>
    </div>
  );
}
