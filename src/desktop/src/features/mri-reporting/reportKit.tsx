// Shared Option B pieces for the MR-I reporting screens: the plain step names and "What you'll do here"
// text, 3D keys for choices (Pass / Fail, List / Picture, Odometer / Map) and the 3D look for the main
// buttons. Display only — every button still calls the same handler it called before, and nothing here
// saves, submits, endorses, closes or changes a permission. Colours come from the theme variables used by
// TemplateIsoGuide (TIG_CSS) and AdminIsoGuide (ADMIN_CSS), so macOS Light, Fluent, Holo HUD and the hidden
// themes all fit. Screens include REPORT_KIT_CSS next to TIG_CSS + ADMIN_CSS.

import type { ReactNode } from "react";
import type { Glyph, Tone } from "../administration/AdminIsoGuide";
import { STEP_NAMES, type HintState, type ReportHints, type ReportStep } from "./reportHints";

export interface ReportStepMeta {
  id: ReportStep;
  name: string;   // plain name
  tech: string;   // original name, shown underneath
  glyph: Glyph;
  explain: string;
  todo: string[];
}

export const REPORT_STEPS: ReportStepMeta[] = [
  { id: "header", ...STEP_NAMES.header, glyph: "report",
    explain: "The details at the top of the report. The list comes from this unit's MR-I template. Grey boxes are filled in from the unit for you; each box saves when you leave it.",
    todo: ["Pick the Compliance stage first — it decides what else is needed", "Fill in the job and hours boxes", "Check the hours MMS worked out"] },
  { id: "checklist", ...STEP_NAMES.checklist, glyph: "check",
    explain: "Every check from this unit's MR-I template, in its groups. Mark each one Pass or Fail. For a Fail, say what's wrong, what was done and how serious it is.",
    todo: ["Work down one group at a time — or use the picture", "For a Fail, fill in what's wrong, what was done and how serious", "Add photos or files where they help"] },
  { id: "mid", ...STEP_NAMES.mid, glyph: "map",
    explain: "How far the unit travelled for this job. Type the km from the odometer, or plot the route on the map and MMS works out the km.",
    todo: ["Choose Odometer or Plot on map", "Enter the km — or click the route on the map", "Check the distance looks right"] },
  { id: "footer", ...STEP_NAMES.footer, glyph: "sign",
    explain: "The end of the report: yes/no checks, remarks and the two people on the report. Your own name is filled in for you; pick the other person from the list.",
    todo: ["Tick the yes/no checks that apply", "Add remarks if there's anything else", "Pick the other person on the report"] },
  { id: "review", ...STEP_NAMES.review, glyph: "report",
    explain: "One last look. The list shows what still stops the report from being submitted. Below is the report as it will print.",
    todo: ["Fix each item in the list", "Read the 2-page report", "Click Submit report"] },
];

export const stepMeta = (id: ReportStep) => REPORT_STEPS.find((s) => s.id === id)!;

/** A text key that sits raised until chosen, then pressed in (like the Roles & permissions cards). */
export function Key3D({ children, pressed, tone = "blue", onClick, disabled, title, small }: {
  children: ReactNode; pressed: boolean; tone?: Tone; onClick?: () => void; disabled?: boolean; title?: string; small?: boolean;
}) {
  return (
    <button type="button" className={`rk-key is-${tone}${pressed ? " is-pressed" : ""}${small ? " is-small" : ""}`}
      aria-pressed={pressed} onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  );
}

/** A row of 3D keys where one is chosen (List / Picture, Odometer / Map, Pass / Fail). */
export function KeyGroup<T extends string>({ options, value, onChange, label, disabled, small }: {
  options: { id: T; label: ReactNode; tone?: Tone; title?: string }[];
  value: T | null; onChange: (v: T) => void; label: string; disabled?: boolean; small?: boolean;
}) {
  return (
    <div className="rk-keys" role="group" aria-label={label}>
      {options.map((o) => (
        <Key3D key={o.id} pressed={value === o.id} tone={o.tone} disabled={disabled} small={small} title={o.title}
          onClick={() => onChange(o.id)}>{o.label}</Key3D>
      ))}
    </div>
  );
}

/** The 3D step bar for the report wizard — the same tiles as the template builder's step bar. */
const BAR_FILL: Record<HintState | "current", string> = { current: "var(--tig-blue)", ok: "var(--tig-ok)", look: "var(--tig-look)", skip: "var(--tig-skip)" };
const BAR_TOP: Record<HintState | "current", string> = { current: "var(--tig-blue-soft)", ok: "var(--tig-ok-soft)", look: "var(--tig-look-soft)", skip: "var(--tig-top)" };

export function ReportStepBar({ current, hints, reviewCount, onPick }: {
  current: ReportStep; hints: ReportHints; reviewCount: number; onPick: (id: ReportStep) => void;
}) {
  return (
    <nav className="tig-bar rk-bar no-print" aria-label="Report steps">
      {REPORT_STEPS.map((s, i) => {
        const cur = s.id === current;
        const st: HintState = s.id === "review" ? (reviewCount ? "look" : "ok") : hints.steps[s.id].state;
        const look = s.id === "review" ? reviewCount : hints.steps[s.id].count;
        const mark = cur ? String(i + 1) : st === "look" ? String(look || "!") : st === "ok" ? "✓" : String(i + 1);
        const label = `Step ${i + 1}, ${s.name}${st === "look" && look ? `, ${look} worth a look` : st === "ok" ? ", looks complete" : st === "skip" ? ", not needed" : ""}`;
        return (
          <button key={s.id} type="button" className={`tig-tile${cur ? " is-current" : ""}`} aria-current={cur ? "step" : undefined}
            aria-label={label} onClick={() => onPick(s.id)}>
            <svg width="64" height="40" viewBox="0 0 64 40" aria-hidden="true" style={{ overflow: "visible" }}>
              <polygon points="2,16 32,30 32,36 2,22" className="tig-slab-l" />
              <polygon points="32,30 62,16 62,22 32,36" className="tig-slab-r" />
              <polygon points="32,2 62,16 32,30 2,16" fill={cur ? BAR_TOP.current : BAR_TOP[st]} stroke={cur ? BAR_FILL.current : "none"} strokeWidth={2} />
              <circle cx="32" cy="16" r="9" fill={cur ? BAR_FILL.current : BAR_FILL[st]} />
              <text x="32" y="20" textAnchor="middle" fontSize="11" fontWeight={800} fill="var(--tig-on)">{mark}</text>
              {cur && look > 0 && (
                <g><circle cx="58" cy="4" r="8" fill="var(--tig-look)" /><text x="58" y="8" textAnchor="middle" fontSize="10" fontWeight={800} fill="var(--tig-on)">{look}</text></g>
              )}
            </svg>
            <span className="tig-tile-name">{s.name}</span>
            <span className="tig-tile-tech">{s.tech}</span>
          </button>
        );
      })}
    </nav>
  );
}

/** Report details: previous + this report = current engine hours, as two isometric blocks. */
export function EngineHoursIso({ previous, current }: { previous: number; current: number }) {
  const known = Number.isFinite(current);
  const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 1 });
  const diff = known ? current - previous : null;
  const block = (x: number, h: number, top: string, edge: string) => {
    const w = 34, d = 17, base = 112;
    return (
      <g className="tig-lift">
        <polygon points={`${x - w},${base - h} ${x},${base - h + d} ${x},${base + d} ${x - w},${base}`} className="tig-slab-l" />
        <polygon points={`${x},${base - h + d} ${x + w},${base - h} ${x + w},${base} ${x},${base + d}`} className="tig-slab-r" />
        <polygon points={`${x},${base - h - d} ${x + w},${base - h} ${x},${base - h + d} ${x - w},${base - h}`} fill={top} stroke={edge} strokeWidth={1.6} />
      </g>
    );
  };
  return (
    <div className="rk-hours" role="img"
      aria-label={`Previous engine hours ${fmt(previous)}${known ? `, current ${fmt(current)}, ${fmt(diff!)} hours on this report` : ", current not entered yet"}`}>
      <svg viewBox="0 0 320 150" width="320" height="150" style={{ maxWidth: "100%", height: "auto" }}>
        {block(70, 40, "var(--tig-blue-soft)", "var(--tig-blue)")}
        {block(250, 54, known ? "var(--tig-ok-soft)" : "var(--tig-hole)", known ? "var(--tig-ok)" : "var(--tig-skip)")}
        <text x="70" y="50" textAnchor="middle" fontSize="14" fontWeight={800} fill="var(--tig-blue)">{fmt(previous)}</text>
        <text x="250" y="36" textAnchor="middle" fontSize="14" fontWeight={800} fill={known ? "var(--tig-ok)" : "var(--tig-soft)"}>{known ? fmt(current) : "—"}</text>
        <text x="70" y="146" textAnchor="middle" fontSize="11.5" fill="var(--tig-soft)">previous</text>
        <text x="250" y="146" textAnchor="middle" fontSize="11.5" fill="var(--tig-soft)">current</text>
        <text x="160" y="84" textAnchor="middle" fontSize="18" fontWeight={800} fill="var(--tig-soft)">+</text>
        <text x="160" y="106" textAnchor="middle" fontSize="13" fontWeight={800} fill="var(--tig-ink)">{diff === null ? "? h" : `${fmt(diff)} h`}</text>
      </svg>
    </div>
  );
}

// ------------------------------------------------------------------ 3D guides for the help box (display only)
const slabPts = (cx: number, cy: number, hw: number, t: number) => {
  const hd = hw * 0.5;
  return {
    l: `${cx - hw},${cy} ${cx},${cy + hd} ${cx},${cy + hd + t} ${cx - hw},${cy + t}`,
    r: `${cx},${cy + hd} ${cx + hw},${cy} ${cx + hw},${cy + t} ${cx},${cy + hd + t}`,
    top: `${cx},${cy - hd} ${cx + hw},${cy} ${cx},${cy + hd} ${cx - hw},${cy}`,
  };
};
const Slab = ({ cx, cy, hw, t, fill, stroke, delay = 0 }: { cx: number; cy: number; hw: number; t: number; fill: string; stroke?: string; delay?: number }) => {
  const p = slabPts(cx, cy, hw, t);
  return (
    <g className="tig-lift" style={{ animationDelay: `${delay}s` }}>
      <polygon points={p.l} className="tig-slab-l" />
      <polygon points={p.r} className="tig-slab-r" />
      <polygon points={p.top} fill={fill} stroke={stroke ?? "none"} strokeWidth={2} />
    </g>
  );
};
const Badge = ({ n }: { n: number }) =>
  n > 0 ? (
    <g>
      <circle cx="300" cy="40" r="15" fill="var(--tig-look)" />
      <text x="300" y="45" textAnchor="middle" fontSize="14" fontWeight={800} fill="var(--tig-on)">{n}</text>
    </g>
  ) : null;

/** Report details: an isometric clipboard whose lines fill in as boxes are completed. */
export function ClipboardGuide({ filled, total, count }: { filled: number; total: number; count: number }) {
  const rows = Math.max(1, Math.min(8, total));
  const on = total ? Math.round((filled / total) * rows) : 0;
  return (
    <svg className="tig-guide" viewBox="0 0 420 230" width="420" height="230" role="img" aria-label={`${filled} of ${total} report details filled in`}>
      <ellipse cx="210" cy="205" rx="150" ry="18" fill="var(--tig-shadow)" />
      <Slab cx={210} cy={170} hw={130} t={12} fill="var(--tig-top)" />
      <g transform="translate(210 112) matrix(.866 .5 -.866 .5 0 0)">
        <rect x="-70" y="-70" width="140" height="150" rx="8" fill="var(--tig-paper)" stroke="var(--tig-blue)" strokeWidth={2} />
        <rect x="-24" y="-80" width="48" height="16" rx="4" fill="var(--tig-blue)" />
        {Array.from({ length: rows }, (_, i) => (
          <rect key={i} x="-54" y={-52 + i * (120 / rows)} width={i < on ? 108 : 80} height={Math.max(4, 120 / rows - 8)} rx="3"
            fill={i < on ? "var(--tig-ok-soft)" : "var(--tig-hole)"} stroke={i < on ? "var(--tig-ok)" : "none"} strokeWidth={1} />
        ))}
      </g>
      <Badge n={count} />
    </svg>
  );
}

/** Things to check: a stack of slabs, one per part of the checks done. */
export function StackGuide({ done, total, count }: { done: number; total: number; count: number }) {
  const layers = 8;
  const on = total ? Math.round((done / total) * layers) : 0;
  return (
    <svg className="tig-guide" viewBox="0 0 420 230" width="420" height="230" role="img" aria-label={`${done} of ${total} checks done`}>
      <ellipse cx="210" cy="205" rx="150" ry="18" fill="var(--tig-shadow)" />
      {Array.from({ length: layers }, (_, i) => (
        <g key={i}>
          {i < on ? (
            <Slab cx={210} cy={178 - i * 15} hw={110} t={10} fill="var(--tig-ok-soft)" stroke={i === on - 1 ? "var(--tig-ok)" : undefined} delay={i * 0.05} />
          ) : (
            <polygon points={slabPts(210, 178 - i * 15, 110, 10).top} fill="none" stroke="var(--tig-skip)" strokeDasharray="5 5" strokeWidth={1.2} />
          )}
        </g>
      ))}
      <text x="210" y="28" textAnchor="middle" fontSize="16" fontWeight={800} fill="var(--tig-ink)">{done} / {total}</text>
      <Badge n={count} />
    </svg>
  );
}

/** Check and send: the report as a tilted sheet; each part green when complete, orange when not. */
export function SheetGuide({ parts, count }: { parts: { name: string; state: HintState }[]; count: number }) {
  const tone = (s: HintState) => (s === "ok" ? ["var(--tig-ok-soft)", "var(--tig-ok)"] : s === "look" ? ["var(--tig-look-soft)", "var(--tig-look)"] : ["var(--tig-hole)", "var(--tig-skip)"]);
  return (
    <svg className="tig-guide" viewBox="0 0 420 230" width="420" height="230" role="img"
      aria-label={parts.map((p) => `${p.name} ${p.state === "ok" ? "complete" : p.state === "look" ? "needs a look" : "not needed"}`).join(", ")}>
      <ellipse cx="210" cy="205" rx="150" ry="18" fill="var(--tig-shadow)" />
      <g transform="translate(210 118) matrix(.866 .5 -.866 .5 0 0)">
        <rect x="-80" y="-92" width="160" height="184" rx="10" fill="var(--tig-paper)" stroke="var(--tig-paper-line)" strokeWidth={2} />
        {parts.map((p, i) => {
          const [f, s] = tone(p.state);
          return (
            <g key={p.name}>
              <rect x="-66" y={-80 + i * 42} width="132" height="32" rx="6" fill={f} stroke={s} strokeWidth={1.5} />
              <text x="-56" y={-59 + i * 42} fontSize="12" fontWeight={700} fill={s}>{p.name}</text>
            </g>
          );
        })}
      </g>
      <Badge n={count} />
    </svg>
  );
}

/** The platform the Submit button sits on: flat and grey until nothing is left to fix, then raised and green. */
export function SendPlatform({ ready }: { ready: boolean }) {
  return (
    <svg width="92" height="54" viewBox="0 0 140 80" aria-hidden="true" className="rk-send">
      <Slab cx={70} cy={ready ? 34 : 44} hw={62} t={ready ? 18 : 6} fill={ready ? "var(--tig-ok-soft)" : "var(--tig-hole)"} stroke={ready ? "var(--tig-ok)" : "var(--tig-skip)"} />
    </svg>
  );
}

/** Distance travelled: the saved route drawn on an isometric map tile — green start, red end. Screen only. */
export function RouteIsoTile({ points, km }: { points: { lng: number; lat: number }[]; km: string }) {
  if (points.length < 2) return null;
  const xs = points.map((p) => p.lng), ys = points.map((p) => p.lat);
  const minX = Math.min(...xs), maxY = Math.max(...ys);
  const span = Math.max(Math.max(...xs) - minX, maxY - Math.min(...ys), 1e-9);
  const L = 160 / 0.866, inner = L * 0.78;
  const pt = (p: { lng: number; lat: number }) => [((p.lng - minX) / span - 0.5) * inner, ((maxY - p.lat) / span - 0.5) * inner] as const;
  const path = points.map((p, i) => { const [x, y] = pt(p); return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`; }).join(" ");
  const [sx, sy] = pt(points[0]);
  const [ex, ey] = pt(points[points.length - 1]);
  const top = slabPts(170, 92, 160, 12);
  return (
    <figure className="rk-route" aria-label={`Route with ${points.length} points, ${km || "?"} km`}>
      <svg viewBox="0 0 340 200" width="340" height="200" style={{ maxWidth: "100%", height: "auto" }} aria-hidden="true">
        <ellipse cx="170" cy="182" rx="150" ry="12" fill="var(--tig-shadow)" />
        <polygon points={top.l} className="tig-slab-l" />
        <polygon points={top.r} className="tig-slab-r" />
        <polygon points={top.top} fill="color-mix(in srgb, var(--tig-ok) 10%, var(--tig-top))" stroke="var(--tig-paper-line)" strokeWidth={1.5} />
        <g transform="translate(170 92) matrix(.866 .5 -.866 .5 0 0)">
          <path d={path} fill="none" stroke="var(--tig-blue)" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={sx} cy={sy} r={7} fill="var(--tig-ok)" stroke="var(--tig-on)" strokeWidth={2} />
          <circle cx={ex} cy={ey} r={7} fill="var(--tig-bad)" stroke="var(--tig-on)" strokeWidth={2} />
        </g>
      </svg>
      <figcaption>Route saved on this report · <b>{km || "?"} km</b> · <span style={{ color: "var(--tig-ok)" }}>●</span> start <span style={{ color: "var(--tig-bad)" }}>●</span> end</figcaption>
    </figure>
  );
}

/** Repairs: the path a fault takes, as small isometric steps — done ones green, the current one lifted. */
export function RepairPath({ steps }: { steps: { label: string; done: boolean }[] }) {
  const cur = steps.findIndex((s) => !s.done);
  return (
    <ol className="rk-path" aria-label="Repair path">
      {steps.map((s, i) => {
        const now = i === cur;
        const p = slabPts(32, now ? 12 : 16, 30, now ? 9 : 5);
        return (
          <li key={s.label} className={s.done ? "is-ok" : now ? "is-current" : "is-todo"} aria-current={now ? "step" : undefined}>
            <svg width="40" height="26" viewBox="0 0 64 40" aria-hidden="true" style={{ overflow: "visible" }}>
              <polygon points={p.l} className="tig-slab-l" />
              <polygon points={p.r} className="tig-slab-r" />
              <polygon points={p.top} fill={s.done ? "var(--tig-ok-soft)" : now ? "var(--tig-blue-soft)" : "var(--tig-hole)"}
                stroke={s.done ? "var(--tig-ok)" : now ? "var(--tig-blue)" : "none"} strokeWidth={2} />
            </svg>
            <span>{s.done ? "✓ " : ""}{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export const REPORT_KIT_CSS = `
.rk-path { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; }
.rk-path li { display: flex; flex-direction: column; align-items: center; gap: 2px; font-size: 11px; color: var(--tig-soft); text-align: center; }
.rk-path li.is-current { color: var(--tig-ink); font-weight: 700; }
.rk-path li.is-ok { color: var(--tig-ok); }
.rk-route { margin: 14px 0 0; display: inline-flex; flex-direction: column; gap: 4px; }
.rk-route figcaption { font-size: 12.5px; color: var(--tig-soft); }
.rk-send { vertical-align: middle; overflow: visible; }
.rk-issue { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; align-items: start; }
.rk-issue > svg { grid-row: span 3; margin-top: 2px; }
.rk-tech { font-size: 12px; font-weight: 600; color: var(--tig-soft); margin-left: 8px; letter-spacing: .02em; text-transform: none; }
.rk-group { margin: 0 0 18px; }
.rk-group-h { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; font-size: 12.5px; margin: 8px 0 8px; color: var(--tig-blue); text-transform: uppercase; letter-spacing: .06em; }
.rk-group-h small { text-transform: none; letter-spacing: 0; font-weight: 500; color: var(--tig-soft); font-size: 12px; }
.rk-group.is-unit input:disabled, .rk-group.is-hours input:disabled { border-style: dashed; }
.rk-hours { margin: 0 0 6px; }
.rk-colh small { display: block; font-weight: 500; text-transform: none; letter-spacing: 0; font-size: 10.5px; opacity: .8; }
.rk-sec { display: flex; align-items: center; gap: 8px; }
.rk-sec b { font-size: 11.5px; color: var(--tig-soft); font-weight: 600; margin-left: 4px; }
.rk-rule { font-size: 12.5px; color: var(--tig-soft); margin: 4px 0 0; }
.rk-stages { display: flex; flex-wrap: wrap; gap: 8px; margin: 4px 0 14px; }
.rk-stage { display: inline-flex; align-items: center; gap: 8px; border: 1px solid var(--border, #d6dbe4); border-radius: 10px; padding: 5px 12px 5px 6px; font-size: 12.5px; color: var(--tig-soft); }
.rk-stage b { color: var(--tig-ink); }
.rk-stage.is-on { border-color: var(--tig-blue); background: var(--tig-blue-soft); }
.rk .rk-yn-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 18px 22px; padding: 8px 14px 12px 4px; margin-bottom: 14px; }
.rk .rk-yn-grid .iso-card { flex-direction: row; align-items: center; flex-wrap: wrap; margin: 0; }
.rk .rk-yn-grid .iso-card.is-auto { opacity: .75; border-style: dashed; cursor: default; }
.rk .rk-yn-grid .rk-auto { flex-basis: 100%; font-size: 11.5px; color: var(--tig-soft); font-weight: 500; }
.rk-people { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 18px 22px; padding: 8px 14px 12px 4px; }
.rk-people .iso-card { cursor: default; }
.rk-people .iso-card:active { transform: translate(-7.8px, -4.5px); }
.rk-people .iso-card.is-on:active { transform: none; }
.rk-people .mri-preview-table-row { grid-template-columns: 1fr; }
@media screen { .rk .mri-report-page { box-shadow: 9px 7px 0 var(--tig-side-l), 0 10px 28px rgba(0,0,0,.08); margin-bottom: 18px; } }
.tig-bar.rk-bar { grid-template-columns: repeat(5, minmax(96px, 1fr)); margin-bottom: 14px; }
.rk-keys { display: inline-flex; flex-wrap: wrap; gap: 8px; padding: 0 6px 5px 0; }
.rk-key { --k: var(--tig-blue); --k-side: var(--tig-side-l); padding: 6px 14px; font-size: 13px; font-weight: 700; border-radius: 6px;
  background: var(--surface, #fff); color: var(--text, inherit); border: 1px solid var(--tig-line, var(--border, #d6dbe4));
  transform: translate(-3px, -2px); box-shadow: 3.5px 2px 0 var(--k-side); cursor: pointer;
  transition: transform .2s cubic-bezier(.34,1.56,.64,1), box-shadow .2s, background .2s, color .2s; }
.rk-key.is-small { padding: 3px 9px; font-size: 12px; }
.rk-key.is-ok { --k: var(--tig-ok); } .rk-key.is-bad { --k: var(--tig-bad); } .rk-key.is-look { --k: var(--tig-look); } .rk-key.is-skip { --k: var(--tig-skip); }
.rk-key:hover:not(:disabled) { transform: translate(-4px, -2.6px); box-shadow: 4.6px 2.6px 0 var(--k-side); border-color: var(--k); }
.rk .rk-key.is-pressed { transform: none; box-shadow: .5px .3px 0 var(--k-side); background: var(--k) !important; border-color: var(--k) !important; color: var(--tig-on, #fff) !important; }
.rk-keys[aria-label="Pass or Fail"] { flex-wrap: nowrap; gap: 6px; }
.rk-keys[aria-label="Pass or Fail"] .rk-key { padding: 3px 8px; }
.rk-key.is-pressed:hover:not(:disabled) { transform: none; box-shadow: .5px .3px 0 var(--k-side); }
.rk-key:disabled { cursor: default; opacity: .55; }
.rk-key:focus-visible { outline: 2px solid var(--tig-blue); outline-offset: 2px; }
/* Main buttons as 3D keys (same as the Microsoft 365 sign-in key) — inside .rk screens only */
.rk button.primary:not(:disabled) { transform: translate(-3px, -2px); box-shadow: 3.5px 2px 0 color-mix(in srgb, var(--tig-blue) 55%, #000) !important;
  transition: transform .2s cubic-bezier(.34,1.56,.64,1), box-shadow .2s; }
.rk button.primary:not(:disabled):hover { transform: translate(-4px, -2.6px); box-shadow: 4.6px 2.6px 0 color-mix(in srgb, var(--tig-blue) 55%, #000) !important; }
.rk button.primary:not(:disabled):active { transform: none; box-shadow: .5px .3px 0 color-mix(in srgb, var(--tig-blue) 55%, #000) !important; }
@media (prefers-reduced-motion: reduce) { .rk-key, .rk button.primary { transition: none; } }
`;
