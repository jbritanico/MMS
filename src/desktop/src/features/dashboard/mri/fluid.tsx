import { useId, type ReactNode } from "react";

// Fluid analytics layer for the MR-I dashboards: small, calm additions that sit inside the
// existing neumorphic cards (sparklines, trend deltas, an insight strip with a soft wave).
// Nothing here changes a layout; every piece is optional and degrades to nothing when there is no data.

/** Smooth path through points (Catmull-Rom converted to cubic Bezier). */
function smoothPath(pts: [number, number][]) {
  if (pts.length < 2) return "";
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

/** Curved mini area chart for KPI cards. Shows nothing with fewer than two points. */
export function Sparkline({ values: input, color, height = 30, title }: { values: number[]; color: string; height?: number; title?: string }) {
  const id = useId().replace(/:/g, "");
  let values = input;
  // Start just before the first non-zero value, so long empty stretches do not flatten the curve.
  const first = values.findIndex((v) => v !== 0);
  values = first > 1 ? values.slice(first - 1) : values;
  if (values.length < 2) return null;
  const w = 120, h = height, pad = 2;
  const max = Math.max(...values, 1), min = Math.min(...values, 0);
  const span = max - min || 1;
  const pts = values.map((v, i) => [pad + (i * (w - pad * 2)) / (values.length - 1), h - pad - ((v - min) / span) * (h - pad * 2)] as [number, number]);
  const line = smoothPath(pts);
  const area = `${line} L${pts[pts.length - 1][0]},${h} L${pts[0][0]},${h} Z`;
  return (
    <svg className="mrid-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={title ?? "Trend"}>
      {title ? <title>{title}</title> : null}
      <defs>
        <linearGradient id={`sg${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#sg${id})`} className="mrid-spark-area" />
      <path d={line} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" className="mrid-spark-line" pathLength={1} />
    </svg>
  );
}

/** "▲ 2 vs last month" in red when worse, green when better. */
export function TrendDelta({ now, prev, lowerIsBetter = true, unit = "", label = "vs last month" }: {
  now: number | null; prev: number | null; lowerIsBetter?: boolean; unit?: string; label?: string;
}) {
  if (now == null || prev == null) return null;
  const d = Math.round((now - prev) * 10) / 10;
  if (d === 0) return <span className="mrid-delta is-flat">● steady {label}</span>;
  const worse = lowerIsBetter ? d > 0 : d < 0;
  return (
    <span className={`mrid-delta ${worse ? "is-worse" : "is-better"}`}>
      {d > 0 ? "▲" : "▼"} {Math.abs(d)}{unit} {label}
    </span>
  );
}

export type StoryTone = "attention" | "worse" | "better" | "info";
export interface StoryLine { tone: StoryTone; text: ReactNode }
const TONE_LABEL: Record<StoryTone, string> = { attention: "Needs attention", worse: "Getting worse", better: "Improving", info: "Good to know" };

/** Short plain-language insights at the top of a dashboard, on a soft wave background. */
export function StoryStrip({ lines }: { lines: StoryLine[] }) {
  if (lines.length === 0) return null;
  return (
    <div className="mrid-story" role="note" aria-label="What the numbers say">
      <svg className="mrid-story-wave" viewBox="0 0 1200 120" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0,70 C180,30 360,110 600,72 C840,34 1020,96 1200,58 L1200,120 L0,120 Z" />
        <path d="M0,92 C220,64 420,118 640,92 C860,66 1040,108 1200,86 L1200,120 L0,120 Z" />
      </svg>
      <ul>
        {lines.map((l, i) => (
          <li key={i} className={`is-${l.tone}`}>
            <span className="mrid-story-tag">{TONE_LABEL[l.tone]}</span>
            <span>{l.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface FlowStep { label: string; value: ReactNode; sub?: ReactNode; color: string; onClick?: () => void; active?: boolean }

/** A workflow shown as connected stages with curved, flowing arrows (Open -> Pending -> ... -> Done). */
export function FlowSteps({ title, steps, note }: { title: string; steps: FlowStep[]; note?: ReactNode }) {
  return (
    <div className="mrid-panel mrid-flow">
      <div className="mrid-panel-head"><h3>{title}</h3></div>
      <div className="mrid-flow-row">
        {steps.map((s, i) => (
          <div key={s.label} className="mrid-flow-cell">
            {i > 0 && (
              <svg className="mrid-flow-arrow" viewBox="0 0 60 30" aria-hidden="true">
                <path d="M2,22 C18,4 40,4 56,16" fill="none" stroke="var(--accent-blue, #2f6fed)" strokeOpacity="0.45" strokeWidth="2" strokeLinecap="round" />
                <path d="M50,10 L57,16 L49,20" fill="none" stroke="var(--accent-blue, #2f6fed)" strokeOpacity="0.45" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
            <button type="button" className={`mrid-flow-step${s.active ? " is-on" : ""}`} style={{ ["--kpi" as string]: s.color }} onClick={s.onClick} disabled={!s.onClick}>
              <span className="mrid-flow-label">{s.label}</span>
              <span className="mrid-flow-value">{s.value}</span>
              {s.sub ? <span className="mrid-flow-sub">{s.sub}</span> : null}
            </button>
          </div>
        ))}
      </div>
      {note ? <p className="mrid-note" style={{ marginTop: 8 }}>{note}</p> : null}
    </div>
  );
}

/** Adds a "getting worse" or "improving" line when a value moved since the previous month. */
export function changeLine(name: ReactNode, from: number | null, to: number | null, since: string, lowerIsBetter = true, unit = ""): StoryLine | null {
  if (from == null || to == null || from === to) return null;
  const worse = lowerIsBetter ? to > from : to < from;
  return { tone: worse ? "worse" : "better", text: <>{name} {to > from ? "rose" : "fell"} from {from}{unit} to <b>{to}{unit}</b> since {since}.</> };
}

/** CSS for the fluid layer (added to the MR-I dashboards stylesheet). */
export const FLUID_CSS = `
.mrid-spark { display: block; width: 100%; height: 30px; margin: 6px 0 2px; overflow: visible; }
.mrid-spark-line { stroke-dasharray: 1; stroke-dashoffset: 1; animation: mrid-draw 0.9s ease-out 0.15s forwards; }
.mrid-spark-area, .mrid-spark-dot { opacity: 0; animation: mrid-fade 0.6s ease-out 0.55s forwards; }
.mrid-delta { display: inline-block; font-size: 11.5px; font-weight: 600; margin-top: 2px; }
.mrid-delta.is-worse { color: var(--danger); }
.mrid-delta.is-better { color: var(--success); }
.mrid-delta.is-flat { color: var(--text-soft); font-weight: 500; }
.mrid-story { position: relative; overflow: hidden; border-radius: 14px; padding: 12px 16px 14px; background: var(--surface);
  box-shadow: 6px 6px 14px var(--neu-shadow-dark), -6px -6px 14px var(--neu-shadow-light); }
.mrid-story-wave { position: absolute; inset: auto 0 0 0; width: 100%; height: 70%; pointer-events: none; }
.mrid-story-wave path:first-child { fill: var(--accent-blue, #2f6fed); opacity: 0.05; }
.mrid-story-wave path:last-child { fill: var(--accent-blue, #2f6fed); opacity: 0.07; }
.mrid-story ul { position: relative; list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.mrid-story li { display: flex; gap: 10px; align-items: baseline; font-size: 13px; color: var(--text); opacity: 0; animation: mrid-rise 0.45s ease-out forwards; }
.mrid-story li:nth-child(2) { animation-delay: 0.08s; } .mrid-story li:nth-child(3) { animation-delay: 0.16s; } .mrid-story li:nth-child(4) { animation-delay: 0.24s; }
.mrid-story-tag { flex-shrink: 0; min-width: 118px; font-size: 10.5px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; }
.mrid-story li.is-attention .mrid-story-tag { color: var(--danger); }
.mrid-story li.is-worse .mrid-story-tag { color: var(--warn); }
.mrid-story li.is-better .mrid-story-tag { color: var(--success); }
.mrid-story li.is-info .mrid-story-tag { color: var(--accent-blue, #2f6fed); }
.mrid-dash > .mrid-kpis > .mrid-kpi, .mrid-dash > .mrid-panel { animation: mrid-rise 0.4s ease-out both; }
.mrid-dash > .mrid-kpis > .mrid-kpi:nth-child(2) { animation-delay: 0.05s; } .mrid-dash > .mrid-kpis > .mrid-kpi:nth-child(3) { animation-delay: 0.1s; }
.mrid-dash > .mrid-kpis > .mrid-kpi:nth-child(4) { animation-delay: 0.15s; } .mrid-dash > .mrid-kpis > .mrid-kpi:nth-child(5) { animation-delay: 0.2s; }
.mrid-kpi { transition: transform 0.18s ease, box-shadow 0.18s ease; }
.mrid-panel { transition: box-shadow 0.2s ease; }
.mrid-flow-row { display: flex; flex-wrap: wrap; align-items: stretch; gap: 6px 0; }
.mrid-flow-cell { display: flex; align-items: center; flex: 1 1 150px; min-width: 0; }
.mrid-flow-arrow { width: 44px; height: 26px; flex-shrink: 0; }
.mrid-flow-step { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; text-align: left; font: inherit; color: inherit; cursor: pointer;
  padding: 10px 12px; border-radius: 12px; border: 0; background: var(--surface); position: relative; overflow: hidden;
  box-shadow: inset 3px 3px 7px var(--neu-shadow-dark), inset -3px -3px 7px var(--neu-shadow-light); transition: box-shadow 0.18s ease; }
.mrid-flow-step::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: var(--kpi); opacity: 0.8; }
.mrid-flow-step:disabled { cursor: default; }
.mrid-flow-step:not(:disabled):hover { box-shadow: 3px 3px 8px var(--neu-shadow-dark), -3px -3px 8px var(--neu-shadow-light); }
.mrid-flow-step.is-on { outline: 2px solid var(--kpi); outline-offset: 1px; }
.mrid-flow-label { font-size: 11.5px; font-weight: 600; color: var(--text-soft); }
.mrid-flow-value { font-size: 22px; font-weight: 700; color: var(--text); }
.mrid-flow-sub { font-size: 11.5px; color: var(--text-soft); }
@keyframes mrid-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes mrid-fade { to { opacity: 1; } }
@keyframes mrid-draw { to { stroke-dashoffset: 0; } }
@media (prefers-reduced-motion: reduce) {
  .mrid-spark-line, .mrid-spark-area, .mrid-spark-dot, .mrid-story li, .mrid-dash > .mrid-kpis > .mrid-kpi, .mrid-dash > .mrid-panel { animation: none; opacity: 1; stroke-dashoffset: 0; }
}
`;
