import { useState, type KeyboardEvent } from "react";
import { TONE_COLOR, type Tone } from "./flowKit";

// Isometric map of a Document flow (one MR-I report): each step stands on its own isometric
// platform with a 3D-style icon, a numbered label underneath and a tilted info card beside it,
// joined by arrows (Submitted -> Supervisor review -> Fault decisions -> Repairs -> Closed).
// Interactive: hover lifts a platform, click / Enter selects it (opens the details panel), the
// lines on the info cards select that fault or repair. Light physics: platforms land one after
// another with a small spring bounce, hover lifts with a spring, the open step's arrow flows.
// Motion is off with Windows "Animation effects" off (prefers-reduced-motion). Print uses the
// simple stepper instead (the map is hidden on paper).

export type IsoIcon = "report" | "people" | "decide" | "repair" | "archive" | "unit" | "tag" | "gauge";
export type IsoState = "done" | "now" | "todo" | "skip";
export interface IsoLine { text: string; tone?: Tone; id?: string }
export interface IsoStep {
  label: string;
  sub: string;
  state: IsoState;
  icon: IsoIcon;
  cardTitle: string;
  lines: IsoLine[];
  more?: number;
  /** Item to select (details panel) when the platform is clicked. */
  selectId: string | null;
  /** Overrides the state word under the label (default Done / Now / Not yet / Not needed). */
  stateLabel?: string;
  /** Colour for the state word (default by state). */
  stateTone?: Tone;
}
export interface IsoAside { title: string; sub: string; tag: { text: string; tone: Tone }; rows: [string, string][] }

// Layout (viewBox units). Platforms climb from bottom-left to the top and come down on the right.
const VB = { w: 1400, h: 760 };
const POS: [number, number][] = [[185, 585], [440, 425], [715, 300], [975, 415], [1150, 590]];
// Info card per step: x, y (top-left before the tilt), tilt (-30 rises to the right, 30 falls).
const CARD: [number, number, number][] = [[14, 360, -30], [270, 175, -30], [545, 112, -30], [1005, 112, 30], [1196, 296, 30]];
const CW = 196, CH = 124, LINE = 19;

const iso = (cx: number, cy: number, w: number, d: number) => {
  const hw = w / 2, hd = d / 2;
  return { top: [[cx, cy - hd], [cx + hw, cy], [cx, cy + hd], [cx - hw, cy]] as [number, number][], hw, hd };
};
const pts = (p: [number, number][]) => p.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

function Platform({ cx, cy, state }: { cx: number; cy: number; state: IsoState }) {
  const { top, hw, hd } = iso(cx, cy, 230, 132);
  const t = 20; // thickness
  const left: [number, number][] = [[cx - hw, cy], [cx, cy + hd], [cx, cy + hd + t], [cx - hw, cy + t]];
  const right: [number, number][] = [[cx, cy + hd], [cx + hw, cy], [cx + hw, cy + t], [cx, cy + hd + t]];
  return (
    <g className={`fxi-plat is-${state}`}>
      <ellipse cx={cx + 8} cy={cy + hd + t + 6} rx={hw * 0.92} ry={hd * 0.42} className="fxi-shadow" />
      <polygon points={pts(left)} className="fxi-side-l" />
      <polygon points={pts(right)} className="fxi-side-r" />
      <polygon points={pts(top)} className="fxi-top" />
      <polygon points={pts(iso(cx, cy, 200, 114).top)} className="fxi-inset" />
      {state === "now" && <polygon points={pts(iso(cx, cy, 250, 144).top)} className="fxi-ring" />}
    </g>
  );
}

/** A glossy, slightly 3D icon standing on the platform. */
function IsoGlyph({ kind, cx, cy }: { kind: IsoIcon; cx: number; cy: number }) {
  const y = cy - 34; // base of the icon
  switch (kind) {
    case "report":
      return (
        <g>
          <path d={`M${cx - 30} ${y - 92} l52 -10 v86 l-52 10 z`} className="fxi-g-side" />
          <path d={`M${cx - 44} ${y - 84} l52 -10 v86 l-52 10 z`} className="fxi-g-paper" />
          {[0, 1, 2, 3].map((k) => <path key={k} d={`M${cx - 34} ${y - 64 + k * 15} l32 -6`} className="fxi-g-line" />)}
          <circle cx={cx + 16} cy={y - 18} r={17} className="fxi-g-blue" />
          <path d={`M${cx + 8} ${y - 18} l6 6 l11 -12`} className="fxi-g-tick" />
        </g>
      );
    case "people":
      return (
        <g>
          {[[-30, 6, 0.8], [30, 6, 0.8], [0, 0, 1]].map(([dx, dy, k], i) => (
            <g key={i}>
              <path d={`M${cx + dx - 26 * k} ${y + dy} q0 -${40 * k} ${26 * k} -${40 * k} q${26 * k} 0 ${26 * k} ${40 * k} z`} className="fxi-g-blue" />
              <circle cx={cx + dx} cy={y + dy - 56 * k} r={17 * k} className="fxi-g-blue" />
              <circle cx={cx + dx - 6 * k} cy={y + dy - 62 * k} r={5 * k} className="fxi-g-gloss" />
            </g>
          ))}
        </g>
      );
    case "decide":
      return (
        <g>
          <path d={`M${cx} ${y - 104} l38 14 v34 c0 30 -18 48 -38 58 c-20 -10 -38 -28 -38 -58 v-34 z`} className="fxi-g-blue" />
          <path d={`M${cx - 26} ${y - 82} l26 -10 v80 c-14 -8 -26 -22 -26 -44 z`} className="fxi-g-gloss" />
          <path d={`M${cx - 15} ${y - 50} l11 11 l20 -22`} className="fxi-g-tick" />
        </g>
      );
    case "repair":
      return (
        <g>
          <path d={`M${cx + 30} ${y - 96} a26 26 0 0 0 -32 32 l-38 38 a10 10 0 0 0 14 14 l38 -38 a26 26 0 0 0 32 -32 l-14 14 l-14 -4 l-4 -14 z`} className="fxi-g-blue" />
          <circle cx={cx + 14} cy={y - 80} r={6} className="fxi-g-gloss" />
        </g>
      );
    case "unit":
      return (
        <g>
          <path d={`M${cx - 50} ${y - 60} l40 -18 l50 20 v40 l-40 18 l-50 -20 z`} className="fxi-g-blue" />
          <path d={`M${cx - 50} ${y - 60} l50 20 l40 -18 l-50 -20 z`} className="fxi-g-lid" />
          <path d={`M${cx} ${y - 40} v40`} className="fxi-g-edge" />
          <circle cx={cx - 30} cy={y - 8} r={9} className="fxi-g-wheel" />
          <circle cx={cx + 20} cy={y - 2} r={9} className="fxi-g-wheel" />
          <circle cx={cx + 6} cy={y - 74} r={16} className="fxi-g-paper" />
          <circle cx={cx + 6} cy={y - 74} r={7} className="fxi-g-blue" />
        </g>
      );
    case "tag":
      return (
        <g>
          <path d={`M${cx - 36} ${y - 92} h44 l30 32 l-40 40 l-34 -34 z`} className="fxi-g-blue" />
          <circle cx={cx - 20} cy={y - 76} r={7} className="fxi-g-paper" />
          <path d={`M${cx - 30} ${y - 86} l14 0`} className="fxi-g-gloss" />
          <path d={`M${cx - 6} ${y - 52} l8 8 l16 -18`} className="fxi-g-tick" />
        </g>
      );
    case "gauge":
      return (
        <g>
          <path d={`M${cx - 46} ${y - 26} a46 46 0 0 1 92 0 z`} className="fxi-g-blue" />
          <path d={`M${cx - 32} ${y - 26} a32 32 0 0 1 64 0`} className="fxi-g-dial" />
          <path d={`M${cx} ${y - 26} l24 -26`} className="fxi-g-needle" />
          <circle cx={cx} cy={y - 26} r={6} className="fxi-g-paper" />
          <path d={`M${cx - 30} ${y - 66} a46 46 0 0 1 28 -14`} className="fxi-g-gloss-line" />
        </g>
      );
    case "archive":
    default:
      return (
        <g>
          <path d={`M${cx - 42} ${y - 58} l42 -16 l42 16 v48 l-42 18 l-42 -18 z`} className="fxi-g-blue" />
          <path d={`M${cx - 42} ${y - 58} l42 18 l42 -18 l-42 -16 z`} className="fxi-g-lid" />
          <path d={`M${cx} ${y - 40} v66`} className="fxi-g-edge" />
          <path d={`M${cx - 28} ${y - 26} l18 8`} className="fxi-g-handle" />
          <path d={`M${cx - 30} ${y - 82} l26 -10 l26 10 l-26 10 z`} className="fxi-g-paper" />
          <path d={`M${cx - 30} ${y - 90} l26 -10 l26 10 l-26 10 z`} className="fxi-g-paper" />
        </g>
      );
  }
}

function Arrow({ from, to, state, bend = 0 }: { from: [number, number]; to: [number, number]; state: IsoState; bend?: number }) {
  // From the edge of one platform to the edge of the next, slightly curved.
  const [x1, y1] = from, [x2, y2] = to;
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const a: [number, number] = [x1 + ux * 125, y1 + uy * 70], b: [number, number] = [x2 - ux * 135, y2 - uy * 78];
  const mx = (a[0] + b[0]) / 2 - uy * bend, my = (a[1] + b[1]) / 2 + ux * bend;
  const ang = Math.atan2(b[1] - my, b[0] - mx);
  const head = (r: number, s: number) => `${b[0] + Math.cos(ang + s) * r},${b[1] + Math.sin(ang + s) * r}`;
  return (
    <g className={`fxi-arrow is-${state}`} aria-hidden="true">
      <path d={`M${a[0]} ${a[1]} Q${mx} ${my} ${b[0]} ${b[1]}`} className="fxi-arrow-body" />
      <path d={`M${a[0]} ${a[1]} Q${mx} ${my} ${b[0]} ${b[1]}`} className="fxi-arrow-flow" />
      <polygon points={`${b[0] + Math.cos(ang) * 14},${b[1] + Math.sin(ang) * 14} ${head(12, Math.PI / 1.6)} ${head(12, -Math.PI / 1.6)}`} className="fxi-arrow-head" />
    </g>
  );
}

const STATE_TEXT: Record<IsoState, string> = { done: "Done", now: "Now", todo: "Not yet", skip: "Not needed" };

export default function IsoFlowMap({ steps, selected, onSelect, aside, loop = { title: "Next MR-I inspection", sub: "Open faults carry forward to the next report" }, label = "Document flow map" }: {
  steps: IsoStep[]; selected: string | null; onSelect: (id: string) => void; aside: IsoAside; loop?: { title: string; sub: string }; label?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [selStep, setSelStep] = useState<number | null>(null);
  const key = (fn: () => void) => (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } };
  const toneFill = (t?: Tone) => TONE_COLOR[t ?? "info"];
  const arrowState = (i: number): IsoState => (steps[i + 1]?.state === "now" ? "now" : steps[i].state === "done" && steps[i + 1]?.state !== "todo" ? "done" : steps[i + 1]?.state === "skip" ? "skip" : steps[i].state === "done" ? "done" : "todo");

  return (
    <div className="fxi" role="group" aria-label={label}>
      <svg viewBox={`0 0 ${VB.w} ${VB.h}`} className="fxi-svg" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="fxiTop" x1="0" y1="0" x2="1" y2="1"><stop offset="0" className="fxi-s-top1" /><stop offset="1" className="fxi-s-top2" /></linearGradient>
          <linearGradient id="fxiBlue" x1="0" y1="0" x2="0" y2="1"><stop offset="0" className="fxi-s-blue1" /><stop offset="1" className="fxi-s-blue2" /></linearGradient>
          <linearGradient id="fxiArrow" x1="0" y1="0" x2="1" y2="0"><stop offset="0" className="fxi-s-arr1" /><stop offset="1" className="fxi-s-arr2" /></linearGradient>
        </defs>

        {/* The unit (top-left), like a profile card */}
        <g className="fxi-aside">
          <rect x={28} y={26} width={300} height={70 + aside.rows.length * 22} rx={16} className="fxi-card" />
          <circle cx={68} cy={66} r={22} className="fxi-avatar" />
          <path d="M57 74 h22 v-12 l-11 -7 l-11 7 z" className="fxi-avatar-mark" />
          <text x={102} y={60} className="fxi-aside-title">{aside.title}</text>
          <text x={102} y={80} className="fxi-aside-sub">{aside.sub.length > 34 ? aside.sub.slice(0, 33) + "…" : aside.sub}</text>
          <circle cx={290} cy={56} r={7} fill={toneFill(aside.tag.tone)} />
          <text x={280} y={60} textAnchor="end" className="fxi-aside-tag">{aside.tag.text}</text>
          {aside.rows.map(([k, v], i) => (
            <text key={k} x={52} y={118 + i * 22} className="fxi-aside-row"><tspan className="fxi-aside-k">{k}</tspan><tspan x={150}>{v.length > 22 ? v.slice(0, 21) + "…" : v}</tspan></text>
          ))}
        </g>

        {/* Next inspection loop */}
        <g className="fxi-loop" aria-hidden="true">
          <path d={`M${POS[4][0] - 150} ${POS[4][1] + 120} Q${(POS[0][0] + POS[4][0]) / 2} ${VB.h - 10} ${POS[0][0] + 150} ${POS[0][1] + 115}`} />
          <text x={(POS[0][0] + POS[4][0]) / 2} y={VB.h - 34} textAnchor="middle">{loop.title}</text>
          <text x={(POS[0][0] + POS[4][0]) / 2} y={VB.h - 16} textAnchor="middle" className="fxi-loop-sub">{loop.sub}</text>
        </g>

        {steps.slice(0, -1).map((_, i) => <Arrow key={i} from={POS[i]} to={POS[i + 1]} state={arrowState(i)} bend={i === 3 ? -40 : 18} />)}

        {steps.map((s, i) => {
          const [cx, cy] = POS[i];
          // Two steps can point at the same item (the report); only the one clicked is highlighted.
          const firstOwner = steps.findIndex((x) => x.selectId === selected);
          const on = !!s.selectId && selected === s.selectId && (selStep != null ? selStep === i : firstOwner === i);
          const [kx, ky, tilt] = CARD[i];
          const pick = () => { if (s.selectId) { setSelStep(i); onSelect(s.selectId); } };
          return (
            <g key={i} className={`fxi-step is-${s.state}${on ? " is-sel" : ""}${hover === i ? " is-hover" : ""}`} style={{ ["--i" as string]: i }}>
              <g className="fxi-land">
                {/* Info card (tilted like a sign on the platform's side) */}
                <g transform={`translate(${kx} ${ky}) skewY(${tilt})`} className="fxi-cardwrap">
                  <rect width={CW} height={CH} rx={12} className="fxi-card" />
                  <text x={14} y={26} className="fxi-card-title">{s.cardTitle.length > 22 ? s.cardTitle.slice(0, 21) + "…" : s.cardTitle}</text>
                  {s.lines.slice(0, 4).map((l, k) => {
                    const t = l.text.length > 25 ? l.text.slice(0, 24) + "…" : l.text;
                    const row = (
                      <>
                        <circle cx={20} cy={46 + k * LINE} r={4.5} fill={toneFill(l.tone)} />
                        <text x={32} y={50 + k * LINE} className="fxi-card-line">{t}</text>
                      </>
                    );
                    return l.id ? (
                      <g key={k} className={`fxi-card-link${selected === l.id ? " is-sel" : ""}`} role="button" tabIndex={0} aria-label={l.text}
                        onClick={(e) => { e.stopPropagation(); setSelStep(i); onSelect(l.id!); }} onKeyDown={key(() => { setSelStep(i); onSelect(l.id!); })}>
                        <rect x={8} y={36 + k * LINE} width={CW - 16} height={LINE - 1} rx={5} className="fxi-card-hit" />
                        {row}
                      </g>
                    ) : <g key={k}>{row}</g>;
                  })}
                  {!!s.more && <text x={32} y={50 + Math.min(4, s.lines.length) * LINE} className="fxi-card-more">+{s.more} more</text>}
                </g>

                {/* Platform + icon = the clickable step */}
                <g className="fxi-hit" role="button" tabIndex={s.selectId ? 0 : -1} aria-label={`Step ${i + 1}, ${s.label}: ${s.sub}. ${s.stateLabel ?? STATE_TEXT[s.state]}`}
                  aria-pressed={on} onClick={pick} onKeyDown={key(pick)} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(i)} onBlur={() => setHover(null)}>
                  <g className="fxi-lift">
                    <Platform cx={cx} cy={cy} state={s.state} />
                    <g className="fxi-glyph"><IsoGlyph kind={s.icon} cx={cx} cy={cy} /></g>
                  </g>
                </g>

                {/* Number + label under the platform */}
                <g className="fxi-label" onClick={pick}>
                  <circle cx={cx - 92} cy={cy + 104} r={17} className="fxi-num" />
                  <text x={cx - 92} y={cy + 110} textAnchor="middle" className="fxi-num-t">{s.state === "done" ? "✓" : i + 1}</text>
                  <text x={cx - 64} y={cy + 102} className="fxi-step-title">{s.label.toUpperCase()}</text>
                  <text x={cx - 64} y={cy + 124} className="fxi-step-sub">{s.sub}</text>
                  <text x={cx - 64} y={cy + 143} className={`fxi-step-state is-${s.state}`} style={s.stateTone ? { fill: toneFill(s.stateTone) } : undefined}>{s.stateLabel ?? STATE_TEXT[s.state]}</text>
                </g>
              </g>
            </g>
          );
        })}
      </svg>
      <p className="fxi-help">Select a platform, or a line on its card, to see the details. Use Tab and Enter with the keyboard.</p>
    </div>
  );
}

// ---------------------------------------------------------------- isometric timeline
// A row of small isometric platforms, one per MR-I report (oldest first, the unit at the start),
// joined by arrows. Faults carried to the next report show as an orange badge on the arrow; tag
// changes caused by a report hang under it as small tag pills. Scrolls sideways for long histories.

export interface IsoTlNode {
  id: string;
  kind: "unit" | "report";
  title: string;
  sub: string;
  chip: string;
  tone: Tone;
  tags: { id: string; text: string; tone: Tone }[];
  /** Faults carried into this report from the one before it, and from older reports. */
  carriedIn?: string[];
  fromOlder?: number;
}

const TL_GAP = 250, TL_X0 = 130, TL_Y = 150, TL_H = 420;

export function IsoTimeline({ nodes, selected, onSelect }: { nodes: IsoTlNode[]; selected: string | null; onSelect: (id: string) => void }) {
  const [hover, setHover] = useState<string | null>(null);
  const key = (fn: () => void) => (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } };
  const W = TL_X0 * 2 + Math.max(0, nodes.length - 1) * TL_GAP;
  const P = (i: number): [number, number] => [TL_X0 + i * TL_GAP, TL_Y + (i % 2 ? 26 : 0)];
  return (
    <div className="fxi fxi-tl" role="list" aria-label="Inspection timeline">
      <div className="fxi-tl-scroll">
        <svg width={W} height={TL_H} viewBox={`0 0 ${W} ${TL_H}`} className="fxi-svg" style={{ width: W, maxWidth: "none" }}>
          <defs>
            <linearGradient id="fxiTop" x1="0" y1="0" x2="1" y2="1"><stop offset="0" className="fxi-s-top1" /><stop offset="1" className="fxi-s-top2" /></linearGradient>
            <linearGradient id="fxiBlue" x1="0" y1="0" x2="0" y2="1"><stop offset="0" className="fxi-s-blue1" /><stop offset="1" className="fxi-s-blue2" /></linearGradient>
            <linearGradient id="fxiArrow" x1="0" y1="0" x2="1" y2="0"><stop offset="0" className="fxi-s-arr1" /><stop offset="1" className="fxi-s-arr2" /></linearGradient>
          </defs>
          {nodes.slice(1).map((n, k) => {
            const [x1, y1] = P(k), [x2, y2] = P(k + 1);
            const carried = n.carriedIn?.length ?? 0;
            const ax = x1 + 92, ay = y1 + 12, bx = x2 - 100, by = y2 + 12;
            const mx = (ax + bx) / 2, my = (ay + by) / 2;
            return (
              <g key={`a${k}`} className={`fxi-arrow ${carried ? "is-now is-carry" : "is-done"}`} aria-hidden={carried ? undefined : true}>
                <path d={`M${ax} ${ay} L${bx} ${by}`} className="fxi-arrow-body" style={{ strokeWidth: 10 }} />
                <path d={`M${ax} ${ay} L${bx} ${by}`} className="fxi-arrow-flow" />
                <polygon points={`${bx + 12},${by} ${bx - 4},${by - 9} ${bx - 4},${by + 9}`} className="fxi-arrow-head" />
                {carried > 0 && (
                  <g>
                    <title>{`Carried to the next report: ${n.carriedIn!.join(", ")}`}</title>
                    <rect x={mx - 52} y={my + 16} width={104} height={24} rx={12} className="fxi-carry" />
                    <text x={mx} y={my + 33} textAnchor="middle" className="fxi-carry-t">{carried} carried</text>
                  </g>
                )}
              </g>
            );
          })}
          {nodes.map((n, i) => {
            const [cx, cy] = P(i);
            const on = selected === n.id;
            const col = TONE_COLOR[n.tone];
            const top = iso(cx, cy, 170, 98).top, hw = 85, hd = 49, t = 14;
            return (
              <g key={n.id} className={`fxi-step is-done${on ? " is-sel" : ""}${hover === n.id ? " is-hover" : ""}`} style={{ ["--i" as string]: i }} role="listitem">
                <g className="fxi-land">
                  <g className="fxi-hit" role="button" tabIndex={0} aria-pressed={on} aria-label={`${n.title}, ${n.sub}, ${n.chip}`}
                    onClick={() => onSelect(n.id)} onKeyDown={key(() => onSelect(n.id))}
                    onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(n.id)} onBlur={() => setHover(null)}>
                    <g className="fxi-lift">
                      <ellipse cx={cx + 6} cy={cy + hd + t + 5} rx={hw * 0.9} ry={hd * 0.4} className="fxi-shadow" />
                      <polygon points={pts([[cx - hw, cy], [cx, cy + hd], [cx, cy + hd + t], [cx - hw, cy + t]])} className="fxi-side-l" />
                      <polygon points={pts([[cx, cy + hd], [cx + hw, cy], [cx + hw, cy + t], [cx, cy + hd + t]])} className="fxi-side-r" />
                      <polygon points={pts(top)} className="fxi-top" />
                      <polygon points={pts(iso(cx, cy, 148, 84).top)} fill="none" stroke={col} strokeWidth={2.5} opacity={0.75} />
                      <g transform={`translate(${cx} ${cy}) scale(0.72) translate(${-cx} ${-cy})`}><IsoGlyph kind={n.kind === "unit" ? "unit" : "report"} cx={cx} cy={cy} /></g>
                    </g>
                  </g>
                  <text x={cx} y={cy + 92} textAnchor="middle" className="fxi-step-title" style={{ fontSize: 15 }}>{n.title}</text>
                  <text x={cx} y={cy + 112} textAnchor="middle" className="fxi-step-sub" style={{ fontSize: 13 }}>{n.sub}</text>
                  <g>
                    <rect x={cx - 60} y={cy + 121} width={120} height={22} rx={11} fill={col} opacity={0.14} />
                    <circle cx={cx - 46} cy={cy + 132} r={4.5} fill={col} />
                    <text x={cx + 4} y={cy + 137} textAnchor="middle" className="fxi-tl-chip" style={{ fill: col }}>{n.chip.length > 16 ? n.chip.slice(0, 15) + "…" : n.chip}</text>
                  </g>
                  {!!n.fromOlder && <text x={cx} y={cy + 160} textAnchor="middle" className="fxi-tl-older">+{n.fromOlder} from older reports</text>}
                  {n.tags.slice(0, 3).map((g, k) => {
                    const y = cy + (n.fromOlder ? 172 : 156) + k * 28;
                    const gc = TONE_COLOR[g.tone];
                    return (
                      <g key={g.id} className={`fxi-card-link${selected === g.id ? " is-sel" : ""}`} role="button" tabIndex={0} aria-label={`Tag change: ${g.text}`}
                        onClick={() => onSelect(g.id)} onKeyDown={key(() => onSelect(g.id))}>
                        <path d={`M${cx} ${y - 8} v8`} stroke={gc} strokeWidth={2} strokeDasharray="2 3" />
                        <rect x={cx - 82} y={y} width={164} height={22} rx={6} className="fxi-tl-tag" style={{ stroke: gc }} />
                        <path d={`M${cx - 74} ${y + 6} h8 l5 5 l-5 5 h-8 z`} fill={gc} />
                        <text x={cx - 58} y={y + 15} className="fxi-tl-tag-t">{g.text.length > 22 ? g.text.slice(0, 21) + "…" : g.text}</text>
                      </g>
                    );
                  })}
                  {n.tags.length > 3 && <text x={cx} y={cy + (n.fromOlder ? 172 : 156) + 3 * 28 + 12} textAnchor="middle" className="fxi-card-more">+{n.tags.length - 3} more tag changes</text>}
                </g>
              </g>
            );
          })}
        </svg>
      </div>
      <p className="fxi-help">Oldest on the left. Select a report or a tag change to see its details. Orange badges are faults carried to the next report.</p>
    </div>
  );
}

export function IsoMapToggle({ iso, onChange }: { iso: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="fxi-toggle" role="group" aria-label="Flow map view">
      <button type="button" aria-pressed={iso} className={iso ? "is-on" : ""} onClick={() => onChange(true)}>Isometric map</button>
      <button type="button" aria-pressed={!iso} className={!iso ? "is-on" : ""} onClick={() => onChange(false)}>Simple steps</button>
    </div>
  );
}

/** Isometric or simple, remembered on this computer. */
export function useIsoMap(): [boolean, (v: boolean) => void] {
  const KEY = "mms.flow.iso";
  const [on, setOn] = useState<boolean>(() => { try { return localStorage.getItem(KEY) !== "0"; } catch { return true; } });
  return [on, (v: boolean) => { setOn(v); try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* ignore */ } }];
}

export const FXI_CSS = `
.fxi { --fxi-bg1: #f3f7fe; --fxi-bg2: #dfeafb; --fxi-top1: #ffffff; --fxi-top2: #e9f1fd; --fxi-side-l: #d9e6f8; --fxi-side-r: #c4d6f2;
  --fxi-blue1: #6aa8ff; --fxi-blue2: #1f5fe0; --fxi-ink: #0f2a52; --fxi-soft: #4b6385; --fxi-card: rgba(255,255,255,.92); --fxi-card-line: #dbe6f6; --fxi-edge: #ffffff;
  position: relative; border-radius: 18px; overflow: hidden; border: 1px solid color-mix(in srgb, var(--fxi-blue2) 12%, transparent);
  background: radial-gradient(1200px 500px at 70% 10%, var(--fxi-bg1), transparent 70%), linear-gradient(160deg, var(--fxi-bg1), var(--fxi-bg2)); }
.app[data-theme="dark"] .fxi, html[data-holo] .fxi { --fxi-bg1: #10213b; --fxi-bg2: #0a1628; --fxi-top1: #1d3560; --fxi-top2: #142848; --fxi-side-l: #102341;
  --fxi-side-r: #0b1b33; --fxi-ink: #e6efff; --fxi-soft: #9fb4d6; --fxi-card: rgba(20,38,70,.92); --fxi-card-line: #24406e; --fxi-edge: rgba(127,190,255,.45); }
html[data-holo] .fxi { --fxi-blue1: #7fe3ff; --fxi-blue2: #1aa3d6; --fxi-edge: rgba(57,213,255,.55); --fxi-side-l: #12355a; --fxi-side-r: #0c2744; border-color: rgba(57,213,255,.35); }
.fxi-svg { display: block; width: 100%; height: auto; font-family: "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif; }
.fxi-s-top1 { stop-color: var(--fxi-top1); } .fxi-s-top2 { stop-color: var(--fxi-top2); }
.fxi-s-blue1 { stop-color: var(--fxi-blue1); } .fxi-s-blue2 { stop-color: var(--fxi-blue2); }
.fxi-s-arr1 { stop-color: var(--fxi-blue1); } .fxi-s-arr2 { stop-color: var(--fxi-blue2); }
.fxi-top { fill: url(#fxiTop); stroke: var(--fxi-edge); stroke-width: 1.5; }
.fxi-inset { fill: none; stroke: color-mix(in srgb, var(--fxi-blue2) 10%, transparent); stroke-width: 1; }
.fxi-side-l { fill: var(--fxi-side-l); } .fxi-side-r { fill: var(--fxi-side-r); }
.fxi-shadow { fill: color-mix(in srgb, var(--fxi-blue2) 16%, transparent); filter: blur(6px); }
.fxi-ring { fill: none; stroke: var(--fxi-blue2); stroke-width: 2.5; stroke-dasharray: 8 6; transform-box: fill-box; transform-origin: center; animation: fxi-pulse 1.8s ease-in-out infinite; }
.fxi-plat.is-todo .fxi-top, .fxi-plat.is-skip .fxi-top { fill: color-mix(in srgb, var(--fxi-top2) 70%, transparent); }
.fxi-plat.is-skip .fxi-top { stroke-dasharray: 6 5; stroke: var(--fxi-soft); }
.fxi-g-blue { fill: url(#fxiBlue); stroke: rgba(255,255,255,.55); stroke-width: 1.2; }
.fxi-g-side { fill: color-mix(in srgb, var(--fxi-blue2) 45%, var(--fxi-top2)); }
.fxi-g-paper { fill: var(--fxi-top1); stroke: color-mix(in srgb, var(--fxi-blue2) 30%, transparent); stroke-width: 1.2; }
.fxi-g-line { stroke: var(--fxi-blue1); stroke-width: 5; stroke-linecap: round; }
.fxi-g-tick { fill: none; stroke: #fff; stroke-width: 5; stroke-linecap: round; stroke-linejoin: round; }
.fxi-g-gloss { fill: rgba(255,255,255,.38); }
.fxi-g-lid { fill: color-mix(in srgb, var(--fxi-blue1) 70%, #fff); }
.fxi-g-edge { stroke: rgba(255,255,255,.35); stroke-width: 1.5; }
.fxi-g-handle { stroke: #fff; stroke-width: 5; stroke-linecap: round; }
.fxi-g-wheel { fill: #1a2f55; stroke: #fff; stroke-width: 2; }
.fxi-g-dial { fill: none; stroke: rgba(255,255,255,.55); stroke-width: 6; stroke-dasharray: 3 7; }
.fxi-g-needle { stroke: #fff; stroke-width: 5; stroke-linecap: round; }
.fxi-g-gloss-line { fill: none; stroke: rgba(255,255,255,.45); stroke-width: 4; stroke-linecap: round; }
.fxi-step.is-todo .fxi-glyph, .fxi-step.is-skip .fxi-glyph { opacity: .42; filter: grayscale(.7); }
.fxi-arrow-body { fill: none; stroke: url(#fxiArrow); stroke-width: 14; stroke-linecap: round; opacity: .95; }
.fxi-arrow-flow { fill: none; stroke: rgba(255,255,255,.75); stroke-width: 3; stroke-linecap: round; stroke-dasharray: 2 16; opacity: 0; }
.fxi-arrow-head { fill: var(--fxi-blue2); }
.fxi-arrow.is-todo .fxi-arrow-body, .fxi-arrow.is-skip .fxi-arrow-body { stroke: color-mix(in srgb, var(--fxi-soft) 35%, transparent); stroke-width: 8; stroke-dasharray: 2 12; }
.fxi-arrow.is-todo .fxi-arrow-head, .fxi-arrow.is-skip .fxi-arrow-head { fill: color-mix(in srgb, var(--fxi-soft) 45%, transparent); }
.fxi-arrow.is-now .fxi-arrow-flow { opacity: 1; animation: fxi-flow 1.1s linear infinite; }
.fxi-card { fill: var(--fxi-card); stroke: var(--fxi-card-line); stroke-width: 1.2; filter: drop-shadow(0 8px 14px rgba(31,95,224,.12)); }
.fxi-card-title { font-size: 15px; font-weight: 700; fill: var(--fxi-ink); }
.fxi-card-line { font-size: 13px; fill: var(--fxi-ink); }
.fxi-card-more { font-size: 12px; fill: var(--fxi-soft); }
.fxi-card-hit { fill: transparent; }
.fxi-card-link { cursor: pointer; outline: none; }
.fxi-card-link:hover .fxi-card-hit, .fxi-card-link:focus-visible .fxi-card-hit { fill: color-mix(in srgb, var(--fxi-blue2) 10%, transparent); }
.fxi-card-link.is-sel .fxi-card-hit { fill: color-mix(in srgb, var(--fxi-blue2) 16%, transparent); stroke: var(--fxi-blue2); stroke-width: 1; }
.fxi-step.is-todo .fxi-cardwrap, .fxi-step.is-skip .fxi-cardwrap { opacity: .7; }
.fxi-hit { cursor: pointer; outline: none; }
.fxi-lift { transform-box: view-box; transition: transform .45s cubic-bezier(.34,1.56,.64,1), filter .25s; }
.fxi-step.is-hover .fxi-lift { transform: translateY(-9px); filter: drop-shadow(0 10px 12px rgba(31,95,224,.18)); }
.fxi-step.is-sel .fxi-top { stroke: var(--fxi-blue2); stroke-width: 3; }
.fxi-hit:focus-visible .fxi-top { stroke: var(--fxi-blue2); stroke-width: 3; stroke-dasharray: 5 4; }
.fxi-num { fill: url(#fxiBlue); stroke: #fff; stroke-width: 2; }
.fxi-step.is-todo .fxi-num, .fxi-step.is-skip .fxi-num { fill: color-mix(in srgb, var(--fxi-soft) 55%, transparent); }
.fxi-num-t { font-size: 16px; font-weight: 700; fill: #fff; }
.fxi-label { cursor: pointer; }
.fxi-step-title { font-size: 17px; font-weight: 800; letter-spacing: .02em; fill: var(--fxi-ink); }
.fxi-step-sub { font-size: 14px; fill: var(--fxi-soft); }
.fxi-step-state { font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; fill: var(--fxi-soft); }
.fxi-step-state.is-now { fill: var(--fxi-blue2); } .fxi-step-state.is-done { fill: var(--success, #1f7a4d); }
.fxi-aside-title { font-size: 19px; font-weight: 700; fill: var(--fxi-ink); }
.fxi-aside-sub, .fxi-aside-row { font-size: 13px; fill: var(--fxi-soft); }
.fxi-aside-k { font-weight: 700; fill: var(--fxi-ink); }
.fxi-aside-tag { font-size: 12.5px; font-weight: 700; fill: var(--fxi-ink); }
.fxi-avatar { fill: url(#fxiBlue); } .fxi-avatar-mark { fill: #fff; opacity: .9; }
.fxi-loop path { fill: none; stroke: var(--fxi-blue2); stroke-width: 2; stroke-dasharray: 6 7; opacity: .55; }
.fxi-loop text { font-size: 14px; font-style: italic; fill: var(--fxi-soft); } .fxi-loop .fxi-loop-sub { font-size: 12px; opacity: .8; }
.fxi-help { margin: 0; padding: 0 18px 12px; font-size: 12.5px; color: var(--fxi-soft); }
.fxi-land { transform-box: view-box; animation: fxi-land .9s cubic-bezier(.34,1.56,.64,1) both; animation-delay: calc(var(--i) * 110ms); }
.fxi-toggle { display: inline-flex; gap: 4px; padding: 3px; border-radius: 10px; background: color-mix(in srgb, var(--fx-blue, #2f6fed) 9%, transparent); align-self: flex-end; }
.fxi-toggle button { all: unset; cursor: pointer; padding: 5px 12px; border-radius: 8px; font: 600 12px var(--fx-font, "Segoe UI"); color: var(--text-soft); }
.fxi-toggle button.is-on { background: var(--surface, #fff); color: var(--text); box-shadow: 0 1px 3px rgba(0,0,0,.08); }
.fxi-toggle button:focus-visible { outline: 2px solid var(--fx-blue, #2f6fed); outline-offset: 1px; }
.fxi-tl-scroll { overflow-x: auto; padding: 8px 4px 0; }
.fxi-tl .fxi-svg { height: auto; }
.fxi-carry { fill: color-mix(in srgb, var(--warn, #a3591b) 16%, var(--fxi-card)); stroke: var(--warn, #a3591b); stroke-width: 1.2; }
.fxi-carry-t { font-size: 12.5px; font-weight: 700; fill: var(--warn, #a3591b); }
.fxi-arrow.is-carry .fxi-arrow-body { stroke: var(--warn, #a3591b); opacity: .8; }
.fxi-arrow.is-carry .fxi-arrow-head { fill: var(--warn, #a3591b); }
.fxi-tl-chip { font-size: 12px; font-weight: 700; }
.fxi-tl-older { font-size: 11.5px; font-weight: 600; fill: var(--warn, #a3591b); }
.fxi-tl-tag { fill: var(--fxi-card); stroke-width: 1.2; }
.fxi-tl-tag-t { font-size: 12px; fill: var(--fxi-ink); }
@keyframes fxi-land { 0% { opacity: 0; transform: translateY(-46px); } 60% { opacity: 1; transform: translateY(5px); } 80% { transform: translateY(-2px); } 100% { transform: translateY(0); } }
@keyframes fxi-pulse { 0%, 100% { opacity: .35; } 50% { opacity: 1; } }
@keyframes fxi-flow { to { stroke-dashoffset: -36; } }
@media (prefers-reduced-motion: reduce) { .fxi-land, .fxi-ring, .fxi-arrow.is-now .fxi-arrow-flow { animation: none !important; } .fxi-lift { transition: none; } }
.fxi-print-only { display: none; }
@media print { .fxi, .fxi-toggle { display: none !important; } .fxi-print-only { display: block !important; } }
`;
