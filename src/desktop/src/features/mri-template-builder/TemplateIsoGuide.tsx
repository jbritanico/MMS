// 3D (isometric) pieces for the MR-I template builder (Option B): the step bar, the tilted-report guide and
// the "What you'll do here" box. Display only — they read the step and the on-screen hints and change nothing.
// Colours come from theme variables (like the isometric flow map), so macOS Light, Fluent, Holo HUD and the
// hidden themes all fit.

import type { KeyboardEvent, ReactNode } from "react";
import type { HintState, HintStep, TemplateHints } from "./templateHints";

export type GuideStep = HintStep | "review";

export interface BarStep {
  id: GuideStep;
  name: string;
  tech: string;
}

// ------------------------------------------------------------------ theme
export const TIG_CSS = `
.tig { --tig-top: #ffffff; --tig-side-l: #c9d8ec; --tig-side-r: #dde7f5; --tig-paper: #ffffff; --tig-paper-line: #c8d4e3;
  --tig-hole: #eef3fa; --tig-panel: color-mix(in srgb, var(--accent-blue, #1f6fe5) 8%, var(--surface, #fff));
  --tig-blue: var(--accent-blue, #1f6fe5); --tig-blue-soft: color-mix(in srgb, var(--tig-blue) 14%, var(--tig-top));
  --tig-ok: var(--success, #17804d); --tig-ok-soft: color-mix(in srgb, var(--tig-ok) 16%, var(--tig-top));
  --tig-look: var(--warn, #b25e09); --tig-look-soft: color-mix(in srgb, var(--tig-look) 16%, var(--tig-top));
  --tig-skip: #9fb0c6; --tig-ink: var(--text, #10233f); --tig-soft: var(--text-soft, #54657f); --tig-on: #ffffff;
  --tig-shadow: color-mix(in srgb, var(--tig-blue) 16%, transparent); }
[data-theme="dark"] .tig, [data-theme="macos-dark"] .tig, [data-theme="ocean"] .tig, html[data-holo] .tig {
  --tig-top: #16304f; --tig-side-l: #0b1a2e; --tig-side-r: #10243f; --tig-paper: #10243f; --tig-paper-line: #2b4d75;
  --tig-hole: #0b1a2e; --tig-skip: #4b6889; --tig-on: #04121f; }
html[data-holo] .tig { --tig-blue: #39d5ff; --tig-ok: #3fe0a1; --tig-look: #ffb24d; --tig-top: #123050; --tig-paper: #0f2440; }

.tig-bar { display: grid; grid-template-columns: repeat(7, minmax(96px, 1fr)); gap: 6px; overflow-x: auto; padding: 10px 8px 8px;
  border: 1px solid color-mix(in srgb, var(--tig-blue) 14%, transparent); border-radius: 16px; background: var(--surface, transparent); }
.tig-tile { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 6px 4px 8px; border: 0; border-radius: 12px;
  background: transparent; color: var(--tig-ink); cursor: pointer; text-align: center; font: inherit;
  transition: transform .4s cubic-bezier(.34,1.56,.64,1), background .2s; }
.tig-tile:hover { transform: translateY(-3px); }
.tig-tile:focus-visible { outline: 3px solid var(--tig-blue); outline-offset: 1px; }
.tig-tile.is-current { background: var(--tig-blue-soft); transform: translateY(-4px); }
.tig-tile-name { font-size: 13px; font-weight: 700; line-height: 1.2; }
.tig-tile-tech { font-size: 11px; color: var(--tig-soft); }
.tig-slab-l { fill: var(--tig-side-l); } .tig-slab-r { fill: var(--tig-side-r); }

.tig-intro { display: flex; gap: 24px; align-items: center; flex-wrap: wrap; padding: 14px 20px; border-radius: 14px; background: var(--tig-panel); }
.tig-guide { flex: 0 1 560px; font-family: "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif; max-width: 100%; height: auto; display: block; }
.tig-intro-text { display: flex; flex-direction: column; gap: 10px; flex: 1 1 320px; min-width: 0; color: var(--tig-ink); }
.tig-explain { font-size: 15px; line-height: 1.55; margin: 0; }
.tig-todo-h { font-size: 12.5px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--tig-soft); }
.tig-todo { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.tig-todo li { display: flex; gap: 10px; align-items: flex-start; font-size: 14.5px; line-height: 1.45; }
.tig-todo-n { width: 24px; height: 24px; flex-shrink: 0; border-radius: 50%; background: var(--tig-blue); color: var(--tig-on);
  display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 800; }
.tig-hint { font-size: 13.5px; font-weight: 600; padding: 8px 12px; border-radius: 10px; background: var(--tig-look-soft); color: var(--tig-look); }
.tig-hint.is-ok { background: var(--tig-ok-soft); color: var(--tig-ok); }
.tig-hint.is-info { background: var(--tig-blue-soft); color: var(--tig-ink); font-weight: 500; }
.tig-lift { animation: tig-pop .7s cubic-bezier(.34,1.56,.64,1) both; }
@keyframes tig-pop { from { transform: translateY(14px); opacity: 0; } to { transform: none; opacity: 1; } }
.tig-mini { vertical-align: middle; margin-right: 8px; }
@media (prefers-reduced-motion: reduce) { .tig-tile, .tig-lift { transition: none; animation: none; } }
`;

const STATE_FILL: Record<HintState | "current", string> = {
  current: "var(--tig-blue)", ok: "var(--tig-ok)", look: "var(--tig-look)", skip: "var(--tig-skip)",
};
const STATE_TOP: Record<HintState | "current", string> = {
  current: "var(--tig-blue-soft)", ok: "var(--tig-ok-soft)", look: "var(--tig-look-soft)", skip: "var(--tig-top)",
};

/** The hint state shown for a step tile ("review" sums up the whole template). */
export function stepState(id: GuideStep, hints: TemplateHints): HintState {
  if (id === "review") return hints.lookCount ? "look" : "ok";
  return hints.steps[id].state;
}

// ------------------------------------------------------------------ small slab (step tiles, table rows)
export function IsoSlab({ state, size = 64, className }: { state: HintState | "current"; size?: number; className?: string }) {
  return (
    <svg width={size} height={size * 0.62} viewBox="0 0 64 40" aria-hidden="true" className={className} style={{ overflow: "visible" }}>
      <polygon points="2,16 32,30 32,36 2,22" className="tig-slab-l" />
      <polygon points="32,30 62,16 62,22 32,36" className="tig-slab-r" />
      <polygon points="32,2 62,16 32,30 2,16" fill={STATE_TOP[state]} stroke={state === "current" ? STATE_FILL.current : "none"} strokeWidth={2} />
    </svg>
  );
}

// ------------------------------------------------------------------ 3D step bar
export function IsoStepBar({ steps, current, hints, onPick }: {
  steps: BarStep[]; current: GuideStep; hints: TemplateHints; onPick: (id: GuideStep) => void;
}) {
  return (
    <nav className="tig-bar" aria-label="Template steps">
      {steps.map((s, i) => {
        const cur = s.id === current;
        const st = stepState(s.id, hints);
        const look = s.id === "review" ? hints.lookCount : hints.steps[s.id].count;
        const mark = cur ? String(i + 1) : st === "look" ? "!" : st === "ok" ? "✓" : String(i + 1);
        const dot = cur ? STATE_FILL.current : STATE_FILL[st];
        const label = `Step ${i + 1}, ${s.name}${st === "look" && look ? `, ${look} worth a look` : st === "ok" ? ", looks complete" : st === "skip" ? ", optional, skipped" : ""}`;
        return (
          <button key={s.id} type="button" className={`tig-tile${cur ? " is-current" : ""}`} aria-current={cur ? "step" : undefined}
            aria-label={label} onClick={() => onPick(s.id)}>
            <svg width="64" height="40" viewBox="0 0 64 40" aria-hidden="true" style={{ overflow: "visible" }}>
              <polygon points="2,16 32,30 32,36 2,22" className="tig-slab-l" />
              <polygon points="32,30 62,16 62,22 32,36" className="tig-slab-r" />
              <polygon points="32,2 62,16 32,30 2,16" fill={cur ? STATE_TOP.current : STATE_TOP[st]} stroke={cur ? STATE_FILL.current : "none"} strokeWidth={2} />
              <circle cx="32" cy="16" r="9" fill={dot} />
              <text x="32" y="20" textAnchor="middle" fontSize="11" fontWeight={800} fill="var(--tig-on)">{mark}</text>
            </svg>
            <span className="tig-tile-name">{s.name}</span>
            <span className="tig-tile-tech">{s.tech}</span>
          </button>
        );
      })}
    </nav>
  );
}

// ------------------------------------------------------------------ tilted report guide
type Line = { x: number; y: number; w: number; h: number; rx: number; k?: "frame" | "pin" };
const REGIONS: { id: HintStep; y: number; h: number; label: string; lines: Line[] }[] = [
  { id: "components", y: 4, h: 20, label: "Left / Right tabs", lines: [{ x: 10, y: 8, w: 50, h: 12, rx: 6 }, { x: 64, y: 8, w: 50, h: 12, rx: 6 }] },
  { id: "header", y: 28, h: 50, label: "Top of the report",
    lines: [0, 1].flatMap((r) => [0, 1, 2].flatMap((k) => [{ x: 12 + k * 62, y: 32 + r * 24, w: 30, h: 4, rx: 2 }, { x: 12 + k * 62, y: 38 + r * 24, w: 54, h: 12, rx: 3 }])) },
  { id: "checklist", y: 84, h: 92, label: "List of checks",
    lines: [0, 1, 2, 3, 4, 5].flatMap((i) => { const y = 89 + i * 14; return [{ x: 12, y, w: 9, h: 9, rx: 2 }, { x: 26, y: y + 2, w: 110 - (i % 3) * 22, h: 5, rx: 2 }, { x: 154, y, w: 15, h: 9, rx: 4 }, { x: 173, y, w: 15, h: 9, rx: 4 }]; }) },
  { id: "drawing", y: 180, h: 48, label: "Picture + points",
    lines: [{ x: 12, y: 184, w: 176, h: 40, rx: 4, k: "frame" }, { x: 84, y: 188, w: 32, h: 32, rx: 16 }, { x: 66, y: 198, w: 9, h: 9, rx: 4.5, k: "pin" }, { x: 122, y: 210, w: 9, h: 9, rx: 4.5, k: "pin" }] },
  { id: "mid", y: 232, h: 24, label: "Km readings", lines: [{ x: 12, y: 236, w: 84, h: 16, rx: 3 }, { x: 104, y: 236, w: 84, h: 16, rx: 3 }] },
  { id: "footer", y: 260, h: 34, label: "Sign-off at the end",
    lines: [{ x: 12, y: 264, w: 176, h: 7, rx: 3 }, { x: 12, y: 276, w: 7, h: 7, rx: 2 }, { x: 24, y: 277, w: 40, h: 5, rx: 2 }, { x: 12, y: 288, w: 76, h: 3, rx: 1 }, { x: 112, y: 288, w: 76, h: 3, rx: 1 }] },
];
const ISO = (e: number) => `matrix(.866 .5 -.866 .5 0 ${e})`;
const OX = 410, OY = 26, SC = 0.8;
const toScreen = (x: number, y: number, e: number): [number, number] => [OX + SC * (0.866 * x - 0.866 * y), OY + SC * (0.5 * x + 0.5 * y + e)];
const lineFill = (k: Line["k"], hot: boolean) =>
  k === "pin" ? "var(--tig-look)" : k === "frame" ? (hot ? "var(--tig-blue-soft)" : "var(--tig-hole)") : hot ? "var(--tig-blue)" : "var(--tig-paper-line)";
const REGION_TINT: Record<HintState, string> = { ok: "var(--tig-ok-soft)", look: "var(--tig-look-soft)", skip: "var(--tig-hole)" };

export function IsoReportGuide({ current, hints, stepNames }: { current: GuideStep; hints: TemplateHints; stepNames: Record<HintStep, string> }) {
  const review = current === "review";
  const hot = REGIONS.find((r) => r.id === current);
  const tags: { text: string; color: string; ry: number; px: number; py: number }[] = [];
  if (review) {
    const bad = REGIONS.filter((r) => hints.steps[r.id].state === "look");
    const list = bad.length ? bad : [REGIONS[1]];
    list.forEach((r, i) => {
      const [px, py] = toScreen(4, r.y + r.h / 2, 0);
      tags.push({ text: bad.length ? `Look at: ${stepNames[r.id]}` : "Everything looks complete", color: bad.length ? "var(--tig-look)" : "var(--tig-ok)", ry: 20 + i * 40, px, py });
    });
  } else if (hot) {
    const [px, py] = toScreen(4, hot.y + hot.h / 2, -16);
    tags.push({ text: hot.label, color: "var(--tig-blue)", ry: Math.max(6, Math.min(250, py - 13)), px, py });
  }
  const aria = review ? "The whole report, coloured by what looks complete" : `The report, with the ${hot?.label.toLowerCase() ?? "part"} lifted out`;
  return (
    <svg className="tig-guide" viewBox="0 0 560 290" width="560" height="290" role="img" aria-label={aria}>
      <ellipse cx="340" cy="262" rx="170" ry="20" fill="var(--tig-shadow)" />
      <g transform={`translate(${OX} ${OY}) scale(${SC})`}>
        <g transform={ISO(9)}><rect x="0" y="0" width="200" height="300" rx="8" className="tig-slab-l" /></g>
        <g transform={ISO(0)}>
          <rect x="0" y="0" width="200" height="300" rx="8" fill="var(--tig-paper)" stroke="var(--tig-paper-line)" strokeWidth={1.5} />
          {REGIONS.map((r) => (
            <g key={r.id}>
              {review && <rect x={4} y={r.y} width={192} height={r.h} rx={5} fill={REGION_TINT[hints.steps[r.id].state]} />}
              {r === hot ? <rect x={4} y={r.y} width={192} height={r.h} rx={5} fill="var(--tig-hole)" />
                : r.lines.map((l, i) => <rect key={i} x={l.x} y={l.y} width={l.w} height={l.h} rx={l.rx} fill={lineFill(l.k, false)} />)}
            </g>
          ))}
        </g>
        {hot && (
          <g className="tig-lift" key={hot.id}>
            <g transform={ISO(-10)}><rect x={4} y={hot.y} width={192} height={hot.h} rx={6} fill="var(--tig-blue)" opacity={0.35} /></g>
            <g transform={ISO(-16)}>
              <rect x={4} y={hot.y} width={192} height={hot.h} rx={6} fill="var(--tig-paper)" stroke="var(--tig-blue)" strokeWidth={2.5} />
              {hot.lines.map((l, i) => <rect key={i} x={l.x} y={l.y} width={l.w} height={l.h} rx={l.rx} fill={lineFill(l.k, true)} />)}
            </g>
          </g>
        )}
      </g>
      {tags.map((t, i) => {
        const w = Math.min(200, 28 + t.text.length * 7);
        return (
          <g key={i}>
            <path d={`M${6 + w} ${t.ry + 13} L${t.px} ${t.py}`} stroke={t.color} strokeWidth={1.6} strokeDasharray="4 3" fill="none" />
            <circle cx={t.px} cy={t.py} r={4} fill={t.color} />
            <rect x={6} y={t.ry} width={w} height={26} rx={13} fill={t.color} />
            <text x={6 + w / 2} y={t.ry + 17} textAnchor="middle" fontSize={12.5} fontWeight={700} fill="var(--tig-on)">{t.text}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ------------------------------------------------------------------ "What you'll do here"
export function StepIntro({ current, explain, todo, hints, stepNames, children }: {
  current: GuideStep; explain: string; todo: string[]; hints: TemplateHints; stepNames: Record<HintStep, string>; children?: ReactNode;
}) {
  const h = current === "review" ? null : hints.steps[current];
  return (
    <div className="tig-intro">
      <IsoReportGuide current={current} hints={hints} stepNames={stepNames} />
      <div className="tig-intro-text">
        <p className="tig-explain">{explain}</p>
        <span className="tig-todo-h">What you'll do here</span>
        <ol className="tig-todo">
          {todo.map((t, i) => <li key={i}><span className="tig-todo-n" aria-hidden="true">{i + 1}</span><span>{t}</span></li>)}
        </ol>
        {h && h.state === "look" && <div className="tig-hint" role="status">{h.message}</div>}
        {children}
      </div>
    </div>
  );
}

/** Keyboard helper: Enter / Space act like a click on non-button elements. */
export const onActivate = (fn: () => void) => (e: KeyboardEvent) => {
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); }
};
