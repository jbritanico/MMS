import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as RPointerEvent, type ReactNode } from "react";
import { TONE_COLOR, type Tone } from "./flowKit";

// Knowledge-map view of a flow (Document flow = one MR-I report, Asset flow = one unit).
// The report or the unit is the big tile in the middle; each step is a coloured glossy 3D tile around
// it (numbered 1-5 in order); the step's items (faults, repairs, people, counters, ...) are small linked
// chips. Clicking a tile or a chip selects it (the existing details panel shows it); the rest of the map
// fades. Zoom, fit, drag and search. Light motion: tiles land one after another, hover lifts, the "Now"
// step pulses, dots flow along links that are done. Motion is off with Windows "Animation effects" off.
// Colours come from the theme (light themes, dark themes, Holo HUD glow). Print uses the simple stepper.

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
  /** Item to select (details panel) when the tile is clicked. */
  selectId: string | null;
  /** Overrides the state word (default Done / Now / Not yet / Not needed). */
  stateLabel?: string;
  /** Colour for the state word (default by state). */
  stateTone?: Tone;
}
export interface IsoAside { title: string; sub: string; tag: { text: string; tone: Tone }; rows: [string, string][] }
/** The tile in the middle. Defaults to the aside (the unit). */
export interface IsoHub { title: string; sub: string; icon: IsoIcon; selectId: string | null; tag?: { text: string; tone: Tone } }

type Hue = "hub" | "blue" | "teal" | "orange" | "purple" | "indigo" | "red" | "grey";
const HUES: Hue[] = ["hub", "blue", "teal", "orange", "purple", "indigo", "red", "grey"];
const STEP_HUES: Hue[] = ["blue", "teal", "orange", "purple", "indigo", "red"];
const STATE_TEXT: Record<IsoState, string> = { done: "Done", now: "Now", todo: "Not yet", skip: "Not needed" };
const TONE_HUE: Record<Tone, Hue> = { success: "teal", warn: "orange", danger: "red", info: "blue", neutral: "grey" };

const ICON: Record<IsoIcon | "more", string> = {
  report: "M7 3h7l4 4v14H7z M14 3v4h4 M10 12h5 M10 16h5",
  people: "M9 5a3 3 0 1 0 0.01 0 M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6 M17 6.6a2.4 2.4 0 1 0 0.01 0 M15.5 14.2c3 .2 5.5 2.4 5.5 5.8",
  decide: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M8.5 12l2.5 2.5 4.5-5",
  repair: "M14.5 6.5a4 4 0 0 0 5 5L12 19a2.1 2.1 0 0 1-3-3z M14.5 6.5L17 4l3 3-2.5 2.5",
  archive: "M3 4h18v5H3z M5 9v10h14V9 M10 13h4",
  unit: "M2 15V8h11v7 M13 10h4l4 4v1h-8 M4 17a2 2 0 1 0 4 0a2 2 0 1 0-4 0 M15 17a2 2 0 1 0 4 0a2 2 0 1 0-4 0",
  tag: "M3 12V4h8l10 10-8 8z M6 8.5a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0",
  gauge: "M4 17a8 8 0 1 1 16 0 M12 17l4-5",
  more: "M5 12h.01 M12 12h.01 M19 12h.01",
};
const LINE_ICON: Record<Tone, string> = {
  danger: "M12 4l9 16H3z M12 10v4 M12 17h.01",
  warn: "M12 3a9 9 0 1 0 0.01 0 M12 7v5l3 2",
  success: "M12 3a9 9 0 1 0 0.01 0 M8 12.5l2.7 2.7L16 10",
  info: "M12 3a9 9 0 1 0 0.01 0 M12 11v5 M12 8h.01",
  neutral: "M12 3a9 9 0 1 0 0.01 0 M8 12h8",
};

/** Rounded rhombus (isometric tile face). */
function rh(cx: number, cy: number, w: number, h: number, r: number) {
  const k = Math.min(0.4, (r / Math.hypot(w, h)) * 1.6);
  const P: [number, number][] = [[cx - w, cy], [cx, cy - h], [cx + w, cy], [cx, cy + h]];
  const at = (a: [number, number], b: [number, number], f: number) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  let d = "";
  for (let i = 0; i < 4; i++) {
    const c = P[i], prev = P[(i + 3) % 4], next = P[(i + 1) % 4];
    const a = at(c, prev, k), b = at(c, next, k);
    d += `${i ? "L" : "M"}${a[0].toFixed(1)} ${a[1].toFixed(1)} Q${c[0]} ${c[1]} ${b[0].toFixed(1)} ${b[1].toFixed(1)} `;
  }
  return d + "Z";
}
const curve = (a: [number, number], b: [number, number], bend: number) => {
  const mx = (a[0] + b[0]) / 2 - (b[1] - a[1]) * bend, my = (a[1] + b[1]) / 2 + (b[0] - a[0]) * bend;
  return { d: `M${a[0].toFixed(1)} ${a[1].toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${b[0].toFixed(1)} ${b[1].toFixed(1)}`, c: [mx, my] as [number, number] };
};
const qpt = (a: [number, number], c: [number, number], b: [number, number], t: number): [number, number] => {
  const u = 1 - t;
  return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]];
};
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const keyAct = (fn: () => void) => (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } };
const useReduced = () => useMemo(() => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } }, []);

function Glyph({ d, x, y, s }: { d: string; x: number; y: number; s: number }) {
  return (
    <g transform={`translate(${x - 12 * s} ${y - 12 * s}) scale(${s})`} className="fxk-glyph" style={{ strokeWidth: 2.4 / s }}>
      {d.split(" M").map((p, i) => <path key={i} d={(i ? "M" : "") + p} />)}
    </g>
  );
}

function Defs({ uid }: { uid: string }) {
  return (
    <defs>
      {HUES.map((h) => (
        <g key={h}>
          <linearGradient id={`${uid}t${h}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style={{ stopColor: `color-mix(in srgb, var(--k-${h}) var(--k-pa), var(--k-hi))` }} />
            <stop offset="1" style={{ stopColor: `color-mix(in srgb, var(--k-${h}) var(--k-pb), var(--k-hi))` }} />
          </linearGradient>
          <linearGradient id={`${uid}c${h}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style={{ stopColor: `color-mix(in srgb, var(--k-${h}) var(--k-ca), var(--k-hi))` }} />
            <stop offset="1" style={{ stopColor: `color-mix(in srgb, var(--k-${h}) var(--k-cb), var(--k-hi))` }} />
          </linearGradient>
        </g>
      ))}
    </defs>
  );
}

interface TileProps {
  uid: string; cx: number; cy: number; w: number; h: number; d: number; hue: Hue; state: IsoState; icon: string;
  label: string; sub?: string; num?: number; stateText?: string; stateTone?: Tone; big?: boolean; sel?: boolean; dim?: boolean;
  order: number; aria: string; onPick?: () => void; extra?: ReactNode;
}
function Tile({ uid, cx, cy, w, h, d, hue, state, icon, label, sub, num, stateText, stateTone, big, sel, dim, order, aria, onPick, extra }: TileProps) {
  const sides: number[] = [];
  for (let k = d; k > 0; k -= 2) sides.push(k);
  const r = w * 0.13;
  const pill = stateText ?? (state === "done" ? undefined : STATE_TEXT[state]);
  const pillTone = stateTone ? TONE_COLOR[stateTone] : state === "todo" || state === "skip" ? "var(--k-soft)" : "var(--hue)";
  return (
    <g className={`fxk-tile is-${state}${sel ? " is-sel" : ""}${dim ? " is-dim" : ""}${big ? " is-big" : ""}`} style={{ ["--hue" as string]: `var(--k-${hue})`, ["--i" as string]: order } as CSSProperties}
      role={onPick ? "button" : undefined} tabIndex={onPick ? 0 : undefined} aria-label={aria} aria-pressed={onPick ? !!sel : undefined}
      onClick={onPick ? (e) => { e.stopPropagation(); onPick(); } : undefined} onKeyDown={onPick ? keyAct(onPick) : undefined}>
      <g className="fxk-land">
        <path d={rh(cx, cy + d + 10, w + 18, h + 11, r * 1.1)} className="fxk-plate" />
        <g className="fxk-lift">
          {sides.map((k) => <path key={k} d={rh(cx, cy + k, w, h, r)} className={k === d ? "fxk-side fxk-side-b" : "fxk-side"} />)}
          <path d={rh(cx, cy, w, h, r)} className="fxk-top" fill={`url(#${uid}t${hue})`} />
          <path d={rh(cx - w * 0.14, cy - h * 0.18, w * 0.7, h * 0.58, r * 0.8)} className="fxk-gloss" />
          {state === "now" && <path d={rh(cx, cy, w + 10, h + 7, r)} className="fxk-ring" />}
          <Glyph d={icon} x={cx} y={cy - (big ? 18 : 13)} s={big ? 2.1 : 1.5} />
          <text x={cx} y={cy + (big ? 22 : 18)} textAnchor="middle" className="fxk-lab">{cut(label, big ? 22 : 20)}</text>
          {sub && <text x={cx} y={cy + (big ? 44 : 36)} textAnchor="middle" className="fxk-sub">{cut(sub, big ? 38 : 26)}</text>}
          {num != null && (
            <g className="fxk-num">
              <circle cx={cx - w * 0.62} cy={cy - h * 0.62} r={13} />
              <text x={cx - w * 0.62} y={cy - h * 0.62 + 5} textAnchor="middle">{state === "done" ? "✓" : num}</text>
            </g>
          )}
          {pill && (
            <g className="fxk-pill" style={{ ["--pill" as string]: pillTone } as CSSProperties}>
              <rect x={cx + w * 0.5 - (pill.length * 3.7 + 10)} y={cy - h * 0.8 - 11} width={pill.length * 7.4 + 20} height={22} rx={11} />
              <text x={cx + w * 0.5} y={cy - h * 0.8 + 4.5} textAnchor="middle">{pill}</text>
            </g>
          )}
          {extra}
        </g>
      </g>
    </g>
  );
}

function Chip({ uid, cx, cy, hue, icon, title, sub, subTone, sel, dim, match, order, onPick }: {
  uid: string; cx: number; cy: number; hue: Hue; icon: string; title: string; sub?: string; subTone?: Tone; sel: boolean; dim: boolean; match: boolean; order: number; onPick?: () => void;
}) {
  const w = 62, h = 37, d = 9, r = 9;
  const sides: number[] = [];
  for (let k = d; k > 0; k -= 2) sides.push(k);
  return (
    <g className={`fxk-tile fxk-chip${sel ? " is-sel" : ""}${dim ? " is-dim" : ""}${match ? " is-match" : ""}`} style={{ ["--hue" as string]: `var(--k-${hue})`, ["--i" as string]: order } as CSSProperties}
      role={onPick ? "button" : undefined} tabIndex={onPick ? 0 : undefined} aria-label={`${title}${sub ? ", " + sub : ""}`} aria-pressed={onPick ? sel : undefined}
      onClick={onPick ? (e) => { e.stopPropagation(); onPick(); } : undefined} onKeyDown={onPick ? keyAct(onPick) : undefined}>
      <title>{`${title}${sub ? " · " + sub : ""}`}</title>
      <g className="fxk-land">
        <g className="fxk-lift">
          {sides.map((k) => <path key={k} d={rh(cx, cy + k, w, h, r)} className="fxk-cside" />)}
          <path d={rh(cx, cy, w, h, r)} className="fxk-ctop" fill={`url(#${uid}c${hue})`} />
          {(match || sel) && <path d={rh(cx, cy, w + 8, h + 5, r)} className="fxk-ring fxk-ring-sel" />}
          <g className="fxk-cglyph"><Glyph d={icon} x={cx} y={cy - 11} s={0.95} /></g>
          <text x={cx} y={cy + 9} textAnchor="middle" className="fxk-clab">{cut(title, 15)}</text>
          {sub && <text x={cx} y={cy + 22} textAnchor="middle" className="fxk-csub" style={subTone ? { fill: TONE_COLOR[subTone] } : undefined}>{cut(sub, 18)}</text>}
        </g>
      </g>
    </g>
  );
}

function Link({ a, b, bend, flow, faint, reduce }: { a: [number, number]; b: [number, number]; bend: number; flow?: boolean; faint?: boolean; reduce: boolean }) {
  const { d, c } = curve(a, b, bend);
  return (
    <g className={`fxk-link${faint ? " is-faint" : ""}`} aria-hidden="true">
      <path d={d} />
      {[0.3, 0.7].map((t) => { const p = qpt(a, c, b, t); return <circle key={t} cx={p[0]} cy={p[1]} r={5} />; })}
      {flow && !reduce && <circle r={4} className="fxk-flowdot"><animateMotion dur="2.2s" repeatCount="indefinite" path={d} /></circle>}
    </g>
  );
}

/** Zoom, fit and drag for a map; the wheel zooms around the pointer. */
function usePanZoom(vw: number, vh: number) {
  const [v, setV] = useState({ z: 1, x: 0, y: 0 });
  const ref = useRef<SVGSVGElement>(null);
  const toView = (cx: number, cy: number) => {
    const r = ref.current!.getBoundingClientRect();
    const s = Math.max(vw / r.width, vh / r.height);
    return [(cx - r.left) * s - (r.width * s - vw) / 2, (cy - r.top) * s - (r.height * s - vh) / 2, s];
  };
  const zoomAt = (f: number, px = vw / 2, py = vh / 2) => setV((o) => {
    const z = Math.max(0.5, Math.min(2.6, o.z * f)), k = z / o.z;
    return { z, x: px - (px - o.x) * k, y: py - (py - o.y) * k };
  });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => { e.preventDefault(); const [x, y] = toView(e.clientX, e.clientY); zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, x, y); };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const drag = useRef<{ x: number; y: number; moved: number } | null>(null);
  const handlers = {
    onPointerDown: (e: RPointerEvent) => { if ((e.target as Element).closest(".fxk-tile")) return; drag.current = { x: e.clientX, y: e.clientY, moved: 0 }; (e.currentTarget as Element).setPointerCapture(e.pointerId); },
    onPointerMove: (e: RPointerEvent) => {
      const g = drag.current; if (!g) return;
      const s = toView(e.clientX, e.clientY)[2];
      const dx = e.clientX - g.x, dy = e.clientY - g.y;
      g.moved += Math.abs(dx) + Math.abs(dy); g.x = e.clientX; g.y = e.clientY;
      setV((o) => ({ ...o, x: o.x + dx * s, y: o.y + dy * s }));
    },
    onPointerUp: () => { drag.current = null; },
  };
  return { v, ref, zoomAt, fit: () => setV({ z: 1, x: 0, y: 0 }), handlers };
}

function Zoom({ z, zoomAt, fit }: { z: number; zoomAt: (f: number) => void; fit: () => void }) {
  return (
    <div className="fxk-zoom">
      <button type="button" aria-label="Zoom out" onClick={() => zoomAt(1 / 1.2)}>−</button>
      <b>{Math.round(z * 100)}%</b>
      <button type="button" aria-label="Zoom in" onClick={() => zoomAt(1.2)}>+</button>
      <span />
      <button type="button" aria-label="Fit to the screen" title="Fit to the screen" onClick={fit}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
      </button>
    </div>
  );
}

const VW = 1240, VH = 900, HUB: [number, number] = [620, 440];

export default function IsoFlowMap({ steps, selected, onSelect, aside, hub, loop = { title: "Next MR-I inspection", sub: "Open faults carry forward to the next report" }, label = "Document flow map" }: {
  steps: IsoStep[]; selected: string | null; onSelect: (id: string) => void; aside: IsoAside; hub?: IsoHub; loop?: { title: string; sub: string }; label?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const reduce = useReduced();
  const [q, setQ] = useState("");
  const [selStep, setSelStep] = useState<number | null>(null);
  const { v, ref, zoomAt, fit, handlers } = usePanZoom(VW, VH);
  const H = hub ?? { title: aside.title, sub: aside.sub, icon: "unit" as IsoIcon, selectId: null, tag: aside.tag };
  const n = steps.length;
  const pos: [number, number][] = steps.map((_, i) => {
    const a = ((-145 + (i * 360) / n) * Math.PI) / 180;
    return [HUB[0] + Math.cos(a) * 400, HUB[1] + Math.sin(a) * 300];
  });
  // Which step owns the current selection (its tile, or one of its chips)?
  const owner = (() => {
    if (!selected) return null;
    if (selStep == null && H.selectId && selected === H.selectId) return null; // the report / unit itself: nothing fades
    if (selStep != null && (steps[selStep]?.selectId === selected || steps[selStep]?.lines.some((l) => l.id === selected))) return selStep;
    const i = steps.findIndex((s) => s.lines.some((l) => l.id === selected));
    return i >= 0 ? i : steps.findIndex((s) => s.selectId === selected);
  })();
  const ql = q.trim().toLowerCase();
  const pickStep = (i: number) => { const s = steps[i]; if (s.selectId) { setSelStep(i); onSelect(s.selectId); } };

  const links: ReactNode[] = [], chips: ReactNode[] = [], tiles: ReactNode[] = [], seq: ReactNode[] = [];
  steps.forEach((s, i) => {
    const [x, y] = pos[i], hue = STEP_HUES[i % STEP_HUES.length];
    const dim = owner != null && owner >= 0 && owner !== i;
    links.push(<Link key={`l${i}`} a={[HUB[0] + (x - HUB[0]) * 0.27, HUB[1] + (y - HUB[1]) * 0.24]} b={[x + (HUB[0] - x) * 0.17, y + (HUB[1] - y) * 0.19 + 10]} bend={0.12} flow={s.state === "done"} faint={dim} reduce={reduce} />);
    const items: { title: string; sub?: string; tone?: Tone; id: string | null; icon: string }[] = s.lines.map((l) => {
      const k = l.text.indexOf(": ");
      return k > 0 ? { title: l.text.slice(k + 2), sub: l.text.slice(0, k), tone: l.tone, id: l.id ?? null, icon: LINE_ICON[l.tone ?? "neutral"] }
        : { title: l.text, tone: l.tone, id: l.id ?? null, icon: LINE_ICON[l.tone ?? "neutral"] };
    });
    if (s.more) items.push({ title: `+${s.more} more`, sub: "in the details", id: s.selectId, icon: ICON.more });
    const a0 = Math.atan2(y - HUB[1], x - HUB[0]), m = items.length;
    items.forEach((c, k) => {
      const a = a0 + (k - (m - 1) / 2) * 0.72;
      const cx = Math.max(80, Math.min(VW - 80, x + Math.cos(a) * 192)), cy = Math.max(64, Math.min(VH - 54, y + Math.sin(a) * 138));
      links.push(<Link key={`c${i}-${k}`} a={[x + (cx - x) * 0.42, y + (cy - y) * 0.42 + 6]} b={[cx + (x - cx) * 0.32, cy + (y - cy) * 0.32 + 8]} bend={0.05} faint={dim} reduce={reduce} />);
      const match = !!ql && `${c.title} ${c.sub ?? ""}`.toLowerCase().includes(ql);
      chips.push(<Chip key={`ch${i}-${k}`} uid={uid} cx={cx} cy={cy} hue={hue} icon={c.icon} title={c.title} sub={c.sub} subTone={c.tone} order={5 + i * 2 + k}
        sel={!!c.id && selected === c.id} dim={dim} match={match} onPick={c.id ? () => { setSelStep(i); onSelect(c.id!); } : s.selectId ? () => pickStep(i) : undefined} />);
    });
    tiles.push(<Tile key={`t${i}`} uid={uid} cx={x} cy={y} w={106} h={63} d={18} hue={hue} state={s.state} icon={ICON[s.icon]} label={s.label} sub={s.sub} num={i + 1}
      stateText={s.stateLabel} stateTone={s.stateTone} order={1 + i} sel={owner === i && selected === s.selectId} dim={dim}
      aria={`Step ${i + 1}, ${s.label}: ${s.sub}. ${s.stateLabel ?? STATE_TEXT[s.state]}. ${s.cardTitle}`} onPick={s.selectId ? () => pickStep(i) : undefined} />);
    const nx = pos[(i + 1) % n], last = i === n - 1;
    const sq = curve([x, y + 42], [nx[0], nx[1] + 42], last ? -0.18 : -0.12);
    seq.push(<path key={`s${i}`} d={sq.d} className={`fxk-seq${last ? " is-loop" : ""}`} style={{ stroke: last ? undefined : `var(--k-${hue})` }} />);
    if (last) {
      const p = qpt([x, y + 42], sq.c, [nx[0], nx[1] + 42], 0.5);
      seq.push(
        <g key="loop" className="fxk-loop"><title>{loop.sub}</title>
          <rect x={p[0] - 140} y={p[1] - 15} width={280} height={30} rx={15} />
          <text x={p[0]} y={p[1] + 5} textAnchor="middle">↻ {cut(loop.title, 40)}</text>
        </g>,
      );
    }
  });

  return (
    <div className="fxk" role="group" aria-label={label}>
      <div className="fxk-stage">
        <svg ref={ref} viewBox={`0 0 ${VW} ${VH}`} className="fxk-svg" {...handlers} onClick={() => { if (selected) setSelStep(null); }}>
          <Defs uid={uid} />
          <g transform={`translate(${v.x} ${v.y}) scale(${v.z})`}>
            {seq}{links}{chips}{tiles}
            <Tile uid={uid} cx={HUB[0]} cy={HUB[1]} w={168} h={100} d={26} hue="hub" state="done" icon={ICON[H.icon]} label={H.title} sub={H.sub} big order={0}
              sel={!!H.selectId && selected === H.selectId} aria={`${H.title}, ${H.sub}`} onPick={H.selectId ? () => { setSelStep(null); onSelect(H.selectId!); } : undefined}
              extra={H.tag && (
                <g className="fxk-pill" style={{ ["--pill" as string]: TONE_COLOR[H.tag.tone] } as CSSProperties}>
                  <rect x={HUB[0] - (H.tag.text.length * 3.7 + 22)} y={HUB[1] + 56} width={H.tag.text.length * 7.4 + 44} height={24} rx={12} />
                  <circle cx={HUB[0] - H.tag.text.length * 3.7 - 6} cy={HUB[1] + 68} r={5} style={{ fill: "var(--pill)" }} />
                  <text x={HUB[0] + 6} y={HUB[1] + 73} textAnchor="middle">{H.tag.text}</text>
                </g>
              )} />
          </g>
        </svg>
        <label className="fxk-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find on the map…" aria-label="Find on the map" />
        </label>
        <div className="fxk-legend" aria-label="Colours">
          {steps.map((s, i) => <span key={i}><i style={{ background: `var(--k-${STEP_HUES[i % STEP_HUES.length]})` }} />{s.label}</span>)}
          <span><i style={{ background: "var(--k-hub)" }} />{hub ? "Report" : "Unit"}</span>
        </div>
        <Zoom z={v.z} zoomAt={zoomAt} fit={fit} />
      </div>
      <p className="fxi-help">Select a tile or a chip to see the details; the rest of the map fades. Drag to move, scroll or use + / − to zoom. Use Tab and Enter with the keyboard.</p>
    </div>
  );
}

// ---------------------------------------------------------------- inspection timeline
// One tile per MR-I report (the unit first, oldest on the left), linked in order. Tag changes hang
// under the report that caused them as chips; faults carried into a report show as an orange chip on
// the link before it. Scrolls sideways for long histories.
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
const TL_GAP = 210, TL_X0 = 120, TL_Y = 150;
export function IsoTimeline({ nodes, selected, onSelect }: { nodes: IsoTlNode[]; selected: string | null; onSelect: (id: string) => void }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const reduce = useReduced();
  const maxTags = Math.min(3, Math.max(0, ...nodes.map((n) => n.tags.length)));
  const W = TL_X0 * 2 + Math.max(0, nodes.length - 1) * TL_GAP;
  const H = TL_Y + 130 + maxTags * 92 + (nodes.some((n) => n.fromOlder) ? 30 : 0);
  const P = (i: number): [number, number] => [TL_X0 + i * TL_GAP, TL_Y + (i % 2 ? 34 : 0)];
  const hueOf = (n: IsoTlNode): Hue => (n.kind === "unit" ? "hub" : TONE_HUE[n.tone]);
  const links: ReactNode[] = [], carries: ReactNode[] = [], tiles: ReactNode[] = [], tags: ReactNode[] = [];
  nodes.forEach((n, i) => {
    const [x, y] = P(i);
    if (i) {
      const [px, py] = P(i - 1);
      const carried = n.carriedIn?.length ?? 0;
      links.push(<Link key={`l${i}`} a={[px + 74, py + 12]} b={[x - 80, y + 12]} bend={0.06} flow={!carried} reduce={reduce} />);
      if (carried) {
        const mx = (px + x) / 2, my = Math.min(py, y) - 92;
        carries.push(
          <g key={`cl${i}`} className="fxk-carry" aria-hidden="true"><path d={`M${px + 40} ${py - 40} Q${mx} ${my - 40} ${x - 40} ${y - 40}`} /></g>,
          <Chip key={`cc${i}`} uid={uid} cx={mx} cy={my} hue="orange" icon={LINE_ICON.warn} title={`${carried} carried`} sub={cut(n.carriedIn!.join(", "), 18)} subTone="warn" order={6 + i}
            sel={false} dim={false} match={false} />,
        );
      }
    }
    tiles.push(<Tile key={`t${i}`} uid={uid} cx={x} cy={y} w={n.kind === "unit" ? 86 : 78} h={n.kind === "unit" ? 51 : 46} d={14} hue={hueOf(n)} state="done" icon={ICON[n.kind === "unit" ? "unit" : "report"]}
      label={n.title} sub={n.sub} stateText={n.chip} stateTone={n.tone} order={i} sel={selected === n.id} aria={`${n.title}, ${n.sub}, ${n.chip}`} onPick={() => onSelect(n.id)} />);
    if (n.fromOlder) tags.push(<text key={`o${i}`} x={x} y={y + 108} textAnchor="middle" className="fxk-older">+{n.fromOlder} from older reports</text>);
    n.tags.slice(0, 3).forEach((g, k) => {
      const cy = y + 150 + (n.fromOlder ? 22 : 0) + k * 92;
      tags.push(<Link key={`tl${i}-${k}`} a={[x, cy - 66]} b={[x, cy - 40]} bend={0} reduce={reduce} />);
      tags.push(<Chip key={`tg${i}-${k}`} uid={uid} cx={x} cy={cy} hue={TONE_HUE[g.tone]} icon={ICON.tag} title={g.text} sub="Tag change" order={8 + i + k}
        sel={selected === g.id} dim={false} match={false} onPick={() => onSelect(g.id)} />);
    });
    if (n.tags.length > 3) tags.push(<text key={`m${i}`} x={x} y={y + 150 + 3 * 92 - 30} textAnchor="middle" className="fxk-older">+{n.tags.length - 3} more tag changes</text>);
  });
  return (
    <div className="fxk fxk-tl" role="list" aria-label="Inspection timeline">
      <div className="fxi-tl-scroll">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="fxk-svg" style={{ width: W, maxWidth: "none", height: H }}>
          <Defs uid={uid} />
          {carries.filter((_, k) => k % 2 === 0)}{links}{tags}{tiles}{carries.filter((_, k) => k % 2 === 1)}
        </svg>
      </div>
      <p className="fxi-help">Oldest on the left. Select a report or a tag change to see its details. Orange chips are faults carried to the next report.</p>
    </div>
  );
}

export function IsoMapToggle({ iso, onChange }: { iso: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="fxi-toggle" role="group" aria-label="Flow map view">
      <button type="button" aria-pressed={iso} className={iso ? "is-on" : ""} onClick={() => onChange(true)}>Knowledge map</button>
      <button type="button" aria-pressed={!iso} className={!iso ? "is-on" : ""} onClick={() => onChange(false)}>Simple steps</button>
    </div>
  );
}

/** Map or simple, remembered on this computer. */
export function useIsoMap(): [boolean, (v: boolean) => void] {
  const KEY = "mms.flow.iso";
  const [on, setOn] = useState<boolean>(() => { try { return localStorage.getItem(KEY) !== "0"; } catch { return true; } });
  return [on, (v: boolean) => { setOn(v); try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* ignore */ } }];
}

const DARK = `.app[data-theme="dark"] .fxk, .app[data-theme="macos-dark"] .fxk, .app[data-theme="ocean"] .fxk, html[data-holo] .fxk`;
export const FXI_CSS = `
.fxk { --k-hub: #5a63d8; --k-blue: #4a8df0; --k-teal: #2fae8a; --k-orange: #ee8550; --k-purple: #9268ec; --k-indigo: #6d7cf2; --k-red: #e0566b; --k-grey: #9aa3b8;
  --k-hi: #ffffff; --k-lo: #1a1f3a; --k-pa: 62%; --k-pb: 100%; --k-ps: 72%; --k-ca: 18%; --k-cb: 40%; --k-cs: 62%;
  --k-bg: #f4f6fb; --k-plate: rgba(255,255,255,.86); --k-plate-edge: #e3e7f2; --k-ink: #1c2233; --k-soft: #667085; --k-lab: #ffffff; --k-panel: #ffffff; --k-gloss: .14;
  position: relative; border-radius: 18px; overflow: hidden; border: 1px solid var(--k-plate-edge); background: var(--k-bg); font-family: "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif; }
${DARK} { --k-hi: #061522; --k-lo: #02070c; --k-pa: 34%; --k-pb: 16%; --k-ps: 46%; --k-ca: 18%; --k-cb: 9%; --k-cs: 40%;
  --k-bg: #071423; --k-plate: rgba(9,26,40,.92); --k-plate-edge: #1d3a52; --k-ink: #e3eefc; --k-soft: #93a9c4; --k-panel: #0b1d2d; --k-gloss: 0; }
${DARK.split(", ").map((s) => s + " .fxk-tile").join(", ")} { --k-lab: color-mix(in srgb, var(--hue) 80%, #ffffff); }
html[data-holo] .fxk { --k-hub: #39d5ff; --k-blue: #4aa8ff; --k-teal: #4dffb0; --k-orange: #ffb547; --k-purple: #b98bff; --k-indigo: #7d8cff; --k-red: #ff5470; --k-grey: #4d6b79;
  --k-bg: #041019; --k-plate: rgba(7,26,38,.92); --k-plate-edge: #174459; --k-ink: #d6f6ff; --k-soft: #7fb0c2; border-color: rgba(57,213,255,.35); }
/* The stage always fills the frame's full width (height follows the width, up to 78% of the window),
   so a map dragged sideways keeps drawing right up to both edges instead of stopping short on the right. */
.fxk { container-type: inline-size; }
.fxk-stage { position: relative; width: 100%; height: clamp(420px, calc(100cqw * ${VH} / ${VW}), 78vh); }
.fxk-svg { display: block; width: 100%; height: 100%; touch-action: none; cursor: grab; user-select: none; }
.fxk-stage .fxk-svg { position: absolute; inset: 0; }
.fxk-svg:active { cursor: grabbing; }
.fxk-tile { cursor: pointer; outline: none; }
.fxk-tile[role="button"]:focus-visible .fxk-top, .fxk-tile[role="button"]:focus-visible .fxk-ctop { stroke: var(--accent-blue, #2f6fed); stroke-width: 3; }
.fxk-land { animation: fxk-land .75s cubic-bezier(.34,1.56,.64,1) both; animation-delay: calc(var(--i, 0) * 70ms); }
@keyframes fxk-land { from { transform: translateY(-44px); opacity: 0; } to { transform: none; opacity: 1; } }
.fxk-lift { transition: transform .35s cubic-bezier(.34,1.56,.64,1), filter .25s, opacity .25s; }
.fxk-tile[role="button"]:hover .fxk-lift, .fxk-tile[role="button"]:focus-visible .fxk-lift { transform: translateY(-6px); }
.fxk-tile.is-dim { opacity: .28; }
.fxk-tile.is-todo .fxk-lift, .fxk-tile.is-skip .fxk-lift { filter: saturate(.25); opacity: .72; }
.fxk-tile.is-skip .fxk-top { stroke-dasharray: 7 5; }
.fxk-plate { fill: var(--k-plate); stroke: var(--k-plate-edge); stroke-width: 1.5; }
.fxk-side { fill: color-mix(in srgb, var(--hue) var(--k-ps), var(--k-lo)); }
.fxk-side-b { fill: color-mix(in srgb, var(--hue) calc(var(--k-ps) - 8%), var(--k-lo)); }
.fxk-top { stroke: color-mix(in srgb, var(--hue) 55%, var(--k-hi)); stroke-width: 1.3; }
.fxk-gloss { fill: #ffffff; opacity: var(--k-gloss); pointer-events: none; }
.fxk-tile.is-sel > .fxk-land .fxk-top, .fxk-tile.is-sel > .fxk-land .fxk-ctop { stroke: var(--accent-blue, #2f6fed); stroke-width: 3.5; }
.fxk-ring { fill: none; stroke: var(--hue); stroke-width: 2.5; stroke-dasharray: 8 6; transform-box: fill-box; transform-origin: center; animation: fxk-pulse 1.6s ease-in-out infinite; }
.fxk-ring-sel { stroke: var(--accent-blue, #2f6fed); }
@keyframes fxk-pulse { 0%, 100% { opacity: .9; transform: scale(1); } 50% { opacity: .35; transform: scale(1.06); } }
.fxk-glyph path { fill: none; stroke: var(--k-lab); stroke-linecap: round; stroke-linejoin: round; }
.fxk-lab { fill: var(--k-lab); font-size: 17px; font-weight: 800; }
.fxk-tile.is-big .fxk-lab { font-size: 25px; }
.fxk-sub { fill: var(--k-lab); opacity: .88; font-size: 12px; }
.fxk-tile.is-big .fxk-sub { font-size: 13.5px; }
.fxk-num circle { fill: var(--k-panel); stroke: var(--hue); stroke-width: 2; }
.fxk-num text { fill: var(--hue); font-size: 13px; font-weight: 800; }
.fxk-pill rect { fill: var(--k-panel); stroke: var(--pill); stroke-width: 1.5; }
.fxk-pill text { fill: var(--pill); font-size: 12px; font-weight: 700; }
.fxk-cside { fill: color-mix(in srgb, var(--hue) var(--k-cs), var(--k-hi)); }
${DARK} .fxk-cside { fill: color-mix(in srgb, var(--hue) var(--k-cs), var(--k-lo)); }
.fxk-ctop { stroke: color-mix(in srgb, var(--hue) 45%, var(--k-hi)); stroke-width: 1.2; }
${DARK} .fxk-ctop { stroke: var(--hue); }
.fxk-chip .fxk-cglyph path { stroke: color-mix(in srgb, var(--hue) 85%, var(--k-lo)); }
${DARK} .fxk-chip .fxk-cglyph path { stroke: var(--hue); }
.fxk-clab { fill: color-mix(in srgb, var(--hue) 50%, var(--k-lo)); font-size: 12px; font-weight: 700; }
${DARK} .fxk-clab { fill: color-mix(in srgb, var(--hue) 70%, #ffffff); }
.fxk-csub { fill: var(--k-soft); font-size: 10.5px; font-weight: 600; }
.fxk-chip.is-match .fxk-ctop { stroke: var(--accent-blue, #2f6fed); stroke-width: 3; }
.fxk-link path { fill: none; stroke: var(--k-plate-edge); stroke-width: 2.2; stroke-linecap: round; }
.fxk-link circle { fill: var(--k-plate-edge); stroke: var(--k-panel); stroke-width: 2; }
.fxk-link .fxk-flowdot { fill: var(--accent-blue, #2f6fed); stroke: none; }
.fxk-link.is-faint { opacity: .3; }
.fxk-seq { fill: none; stroke-width: 1.6; stroke-dasharray: 6 7; opacity: .55; }
.fxk-seq.is-loop { stroke: var(--k-soft); }
.fxk-loop rect { fill: var(--k-panel); stroke: var(--k-plate-edge); }
.fxk-loop text { fill: var(--k-soft); font-size: 13px; }
.fxk-carry path { fill: none; stroke: var(--k-orange); stroke-width: 2.4; stroke-dasharray: 7 6; }
.fxk-older { fill: var(--k-soft); font-size: 12px; font-style: italic; }
html[data-holo] .fxk-top { filter: drop-shadow(0 0 8px color-mix(in srgb, var(--hue) 60%, transparent)); stroke: var(--hue); stroke-width: 2; }
html[data-holo] .fxk-lab { font-family: var(--holo-display, inherit); letter-spacing: .08em; text-transform: uppercase; }
html[data-holo] .fxk-link .fxk-flowdot { fill: var(--k-hub); filter: drop-shadow(0 0 4px var(--k-hub)); }
.fxk-search { position: absolute; left: 12px; top: 12px; display: flex; align-items: center; gap: 6px; padding: 0 10px; height: 34px; border-radius: 10px;
  background: var(--k-panel); border: 1px solid var(--k-plate-edge); color: var(--k-soft); }
.fxk .fxk-search input { all: unset; width: 190px; font-size: 13px; color: var(--k-ink); background: transparent !important; border: 0 !important; box-shadow: none !important; padding: 0 !important; height: auto !important; min-height: 0 !important; }
.fxk-legend { position: absolute; left: 12px; bottom: 12px; display: grid; grid-template-columns: repeat(3, auto); gap: 5px 16px; padding: 9px 13px; border-radius: 12px;
  background: var(--k-panel); border: 1px solid var(--k-plate-edge); font-size: 12px; color: var(--k-ink); }
.fxk-legend span { display: flex; align-items: center; gap: 7px; white-space: nowrap; }
.fxk-legend i { width: 11px; height: 11px; border-radius: 50%; }
.fxk-zoom { position: absolute; right: 12px; bottom: 12px; display: flex; align-items: center; gap: 2px; padding: 4px; border-radius: 12px;
  background: var(--k-panel); border: 1px solid var(--k-plate-edge); color: var(--k-ink); }
.fxk-zoom button { all: unset; cursor: pointer; width: 32px; height: 30px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 18px; }
.fxk-zoom button:hover { background: color-mix(in srgb, var(--k-hub) 12%, transparent); }
.fxk-zoom button:focus-visible { outline: 2px solid var(--accent-blue, #2f6fed); }
.fxk-zoom b { min-width: 48px; text-align: center; font-size: 12.5px; font-variant-numeric: tabular-nums; }
.fxk-zoom span { width: 1px; height: 18px; background: var(--k-plate-edge); margin: 0 3px; }
.fxk-tl { padding-top: 6px; }
@media (prefers-reduced-motion: reduce) { .fxk-land, .fxk-ring { animation: none; } .fxk-lift { transition: none; } }
@media (max-width: 720px) { .fxk-legend { display: none; } .fxk-search input { width: 120px; } }
.fxi-help { margin: 0; padding: 8px 16px 12px; font-size: 12.5px; color: var(--k-soft, var(--text-soft)); }
.fxi-toggle { display: inline-flex; gap: 4px; padding: 3px; border-radius: 10px; background: color-mix(in srgb, var(--fx-blue, #2f6fed) 9%, transparent); align-self: flex-end; }
.fxi-toggle button { all: unset; cursor: pointer; padding: 5px 12px; border-radius: 8px; font: 600 12px var(--fx-font, "Segoe UI"); color: var(--text-soft); }
.fxi-toggle button.is-on { background: var(--surface, #fff); color: var(--text); box-shadow: 0 1px 3px rgba(0,0,0,.08); }
.fxi-toggle button:focus-visible { outline: 2px solid var(--fx-blue, #2f6fed); outline-offset: 1px; }
.fxi-tl-scroll { overflow-x: auto; padding: 8px 4px 0; }
.fxi-print-only { display: none; }
@media print { .fxk, .fxi-toggle { display: none !important; } .fxi-print-only { display: block !important; } }
`;
