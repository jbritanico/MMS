// Animated 3D isometric icons for the main menu cards. Display only.
// Every colour comes from the theme's own variables (--accent-blue, --success, --warn, --danger,
// --surface, --text-soft), so the icons change with the theme picked; Holo HUD adds a glow.
// Animations are gentle while idle, livelier when the card is pointed at, and off with reduced motion.

import type { CSSProperties, ReactElement } from "react";

export type MenuIconKind = "assets" | "reports" | "dashboard" | "admin" | "ct-pipe" | "user";

type Pt = [number, number];
const P = (x: number, y: number, z: number): Pt => [40 + (x - y) * 0.866, 47 + (x + y) * 0.5 - z];
const pts = (a: Pt[]) => a.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

/** An isometric box from (x, y, z) with width w (x), depth d (y) and height h (z). */
function Box({ x, y, z, w, d, h, c, className }: { x: number; y: number; z: number; w: number; d: number; h: number; c?: string; className?: string }) {
  const t = z + h;
  const style = c ? ({ ["--mi" as string]: c } as CSSProperties) : undefined;
  return (
    <g className={className} style={style}>
      <polygon className="mi-l" points={pts([P(x, y + d, t), P(x + w, y + d, t), P(x + w, y + d, z), P(x, y + d, z)])} />
      <polygon className="mi-r" points={pts([P(x + w, y, t), P(x + w, y + d, t), P(x + w, y + d, z), P(x + w, y, z)])} />
      <polygon className="mi-top" points={pts([P(x, y, t), P(x + w, y, t), P(x + w, y + d, t), P(x, y + d, t)])} />
    </g>
  );
}

const Platform = () => <Box x={-22} y={-22} z={0} w={44} d={44} h={4} className="mi-base" />;

/** Circle of radius r lying flat at height z (an isometric ellipse). */
const flat = (cx: number, cy: number, z: number, r: number) => {
  const [x, y] = P(cx, cy, z);
  return { cx: x, cy: y, rx: r * 1.2247, ry: r * 0.7071 };
};

/** Circle of radius r standing upright in the plane x = px (sampled polygon). */
const upright = (px: number, cy: number, cz: number, r: number, n = 28): Pt[] =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return P(px, cy + Math.cos(a) * r, cz + Math.sin(a) * r);
  });

function AssetsIcon() {
  return (
    <>
      <Platform />
      <Box x={-14} y={-10} z={4} w={20} d={20} h={13} />
      <g className="mi-lift">
        <Box x={-10} y={-6} z={17} w={13} d={13} h={10} />
        <circle className="mi-tag" cx={P(-3.5, 7, 22)[0]} cy={P(-3.5, 7, 22)[1]} r={2.6} />
      </g>
      <Box x={10} y={-14} z={4} w={8} d={8} h={7} c="var(--success)" className="mi-bob" />
    </>
  );
}

function ReportsIcon() {
  const line = (yy: number, len: number) => <line className="mi-ink" x1={P(-9, yy, 7)[0]} y1={P(-9, yy, 7)[1]} x2={P(-9 + len, yy, 7)[0]} y2={P(-9 + len, yy, 7)[1]} />;
  const check: Pt[] = [P(6, 6, 7.2), P(9, 10, 7.2), P(15, 0, 7.2)];
  return (
    <>
      <Platform />
      <g className="mi-slide"><Box x={-12} y={-18} z={4} w={26} d={32} h={2} c="var(--text-soft)" /></g>
      <Box x={-15} y={-15} z={5} w={26} d={32} h={2} c="var(--success)" />
      <Box x={-6} y={-17} z={7} w={8} d={4} h={2} c="var(--text-soft)" />
      {line(-8, 16)}{line(-3, 12)}{line(2, 14)}
      <polyline className="mi-check" points={pts(check)} />
    </>
  );
}

function DashboardIcon() {
  return (
    <>
      <Platform />
      <g className="mi-bar" style={{ animationDelay: "0s" }}><Box x={-17} y={-4} z={4} w={9} d={9} h={12} c="var(--warn)" /></g>
      <g className="mi-bar" style={{ animationDelay: ".25s" }}><Box x={-5} y={-4} z={4} w={9} d={9} h={22} c="var(--accent-blue)" /></g>
      <g className="mi-bar" style={{ animationDelay: ".5s" }}><Box x={7} y={-4} z={4} w={9} d={9} h={16} c="var(--success)" /></g>
    </>
  );
}

function AdminIcon() {
  const b = flat(0, 0, 4, 13), t = flat(0, 0, 18, 13), ring = flat(0, 0, 11, 19);
  const shield: Pt[] = [P(0, 0, 33), P(4.5, -4.5, 31), P(4.5, -4.5, 25), P(0, 0, 21), P(-4.5, 4.5, 25), P(-4.5, 4.5, 31)];
  return (
    <>
      <Platform />
      <ellipse className="mi-ring mi-ring-back" {...ring} />
      <path className="mi-l" d={`M${b.cx - b.rx} ${t.cy} L${b.cx - b.rx} ${b.cy} A${b.rx} ${b.ry} 0 0 0 ${b.cx + b.rx} ${b.cy} L${b.cx + b.rx} ${t.cy} Z`} />
      <ellipse className="mi-top" {...t} />
      <ellipse className="mi-ring" {...ring} />
      <g className="mi-bob">
        <polygon className="mi-top mi-shield" points={pts(shield)} />
        <polyline className="mi-check mi-check-sm" points={pts([P(-2, 2, 27.5), P(-0.5, 0.5, 26), P(2.5, -2.5, 30)])} />
      </g>
    </>
  );
}

function CtPipeIcon() {
  const cz = 19, R = 13;
  const back = upright(-11, 0, cz, R), front = upright(9, 0, cz, R);
  const coil = [-7, -3, 1, 5].map((px) => upright(px, 0, cz, 8.5));
  const hub = upright(9.5, 0, cz, 3.2);
  return (
    <>
      <Platform />
      <path className="mi-pipe" d={`M${P(-1, 8.5, cz)[0]} ${P(-1, 8.5, cz)[1]} L${P(-1, 16, 4.5)[0]} ${P(-1, 16, 4.5)[1]} L${P(-1, 22, 4.2)[0]} ${P(-1, 22, 4.2)[1]}`} />
      <polygon className="mi-flange" points={pts(back)} />
      <g className="mi-coil">{coil.map((c, i) => <polygon key={i} className="mi-wrap" points={pts(c)} />)}</g>
      <polygon className="mi-flange mi-flange-front" points={pts(front)} />
      <polygon className="mi-spin" points={pts(front)} />
      <polygon className="mi-top" points={pts(hub)} />
      <Box x={-14} y={-2} z={4} w={3} d={4} h={4} c="var(--text-soft)" />
      <Box x={9} y={-2} z={4} w={3} d={4} h={4} c="var(--text-soft)" />
    </>
  );
}

/** A person on a platform holding up an ID badge (the sign-in screen). The badge shows the role's colour. */
function UserIcon() {
  const head = P(0, 0, 33);
  return (
    <>
      <Platform />
      <g className="mi-person">
        <Box x={-7} y={-6} z={4} w={14} d={12} h={18} />
        <Box x={-8.5} y={-7.5} z={20} w={17} d={15} h={4} />
        <circle className="mi-head" cx={head[0]} cy={head[1]} r={7.5} />
        <ellipse className="mi-head-shine" cx={head[0] - 2.5} cy={head[1] - 2.8} rx={2.8} ry={1.7} />
      </g>
      <g className="mi-badge">
        <Box x={11} y={-16} z={12} w={12} d={1.8} h={14} c="var(--mi-badge, var(--success))" />
        <line className="mi-ink" x1={P(13, -14.2, 21)[0]} y1={P(13, -14.2, 21)[1]} x2={P(21, -14.2, 21)[0]} y2={P(21, -14.2, 21)[1]} />
        <line className="mi-ink" x1={P(13, -14.2, 17.5)[0]} y1={P(13, -14.2, 17.5)[1]} x2={P(19, -14.2, 17.5)[0]} y2={P(19, -14.2, 17.5)[1]} />
      </g>
    </>
  );
}

const ICONS: Record<MenuIconKind, { el: () => ReactElement; color: string }> = {
  assets: { el: AssetsIcon, color: "var(--accent-blue, #2f6fed)" },
  reports: { el: ReportsIcon, color: "var(--success, #1f7a4d)" },
  dashboard: { el: DashboardIcon, color: "var(--accent-blue, #2f6fed)" },
  admin: { el: AdminIcon, color: "var(--accent-blue, #2f6fed)" },
  "ct-pipe": { el: CtPipeIcon, color: "var(--warn, #a3591b)" },
  user: { el: UserIcon, color: "var(--accent-blue, #2f6fed)" },
};

export function MenuIsoIcon({ kind, badge }: { kind: MenuIconKind; badge?: string }) {
  const { el: El, color } = ICONS[kind];
  return (
    <svg className={`mi mi-${kind}`} viewBox="0 0 80 72" aria-hidden="true" style={{ ["--mi" as string]: color, ...(badge ? { ["--mi-badge" as string]: badge } : {}) } as CSSProperties}>
      <ellipse className="mi-shadow" cx="40" cy="66" rx="32" ry="5" />
      <g className="mi-float"><El /></g>
    </svg>
  );
}

/** Sign-in scene for the Microsoft 365 card: the Microsoft logo (kept exactly as it is) floats above an
 *  isometric platform in the theme's colours. */
export function M365Scene() {
  const c = P(0, 0, 4);
  return (
    <svg className="mi mi-m365" viewBox="0 0 80 72" width="120" height="108" aria-hidden="true" style={{ ["--mi" as string]: "var(--accent-blue, #2f6fed)" } as CSSProperties}>
      <ellipse className="mi-shadow" cx="40" cy="66" rx="32" ry="5" />
      <Box x={-22} y={-22} z={0} w={44} d={44} h={4} className="mi-base" />
      <Box x={-12} y={-12} z={4} w={24} d={24} h={2} />
      <ellipse className="mi-m365-spot" cx={c[0]} cy={c[1] - 2} rx={13} ry={7} />
      <line className="mi-m365-beam" x1={c[0] - 9} y1={c[1] - 2} x2={c[0] - 9} y2={24} />
      <line className="mi-m365-beam" x1={c[0] + 9} y1={c[1] - 2} x2={c[0] + 9} y2={24} />
      <g className="mi-m365-logo">
        <g transform="translate(30.5 6) scale(0.9)">
          <rect x="1" y="1" width="9" height="9" fill="#f25022" />
          <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
          <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
          <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
        </g>
      </g>
    </svg>
  );
}

export const MENU_ICON_CSS = `
.menu-card .menu-icon-wrap.menu-icon-iso { width: min(clamp(64px, 17cqi, 92px), 11vh) !important; height: min(clamp(56px, 15cqi, 82px), 9.6vh) !important; border-radius: 0 !important;
  background: none !important; box-shadow: none !important; clip-path: none !important; margin: 0 auto clamp(6px, 1.6cqi, 10px) !important; }
.menu-card .menu-icon-wrap.menu-icon-iso svg.mi { width: 100% !important; height: 100% !important; overflow: visible; }
.mi { --mi-surface: var(--surface, #ffffff); }
.mi .mi-top { fill: color-mix(in srgb, var(--mi) 22%, var(--mi-surface)); stroke: color-mix(in srgb, var(--mi) 75%, var(--mi-surface)); stroke-width: .7; stroke-linejoin: round; }
.mi .mi-l { fill: color-mix(in srgb, var(--mi) 58%, var(--mi-surface)); stroke: color-mix(in srgb, var(--mi) 75%, var(--mi-surface)); stroke-width: .5; stroke-linejoin: round; }
.mi .mi-r { fill: color-mix(in srgb, var(--mi) 42%, var(--mi-surface)); stroke: color-mix(in srgb, var(--mi) 75%, var(--mi-surface)); stroke-width: .5; stroke-linejoin: round; }
.mi .mi-base { --mi: var(--text-soft, #6b7280); }
.mi .mi-base .mi-top { fill: color-mix(in srgb, var(--mi) 10%, var(--mi-surface)); }
.mi .mi-shadow { fill: color-mix(in srgb, var(--mi) 18%, transparent); }
.mi .mi-ink { stroke: color-mix(in srgb, var(--text-soft, #6b7280) 80%, transparent); stroke-width: 1.3; stroke-linecap: round; }
.mi .mi-check { fill: none; stroke: var(--success, #1f7a4d); stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 26; stroke-dashoffset: 0; }
.mi .mi-check-sm { stroke-width: 1.4; stroke: var(--mi); }
.mi .mi-tag { fill: var(--success, #1f7a4d); }
.mi .mi-ring { fill: none; stroke: var(--mi); stroke-width: 1.6; stroke-dasharray: 5 4; }
.mi .mi-ring-back { opacity: .35; }
.mi .mi-flange { fill: color-mix(in srgb, var(--mi) 30%, var(--mi-surface)); stroke: var(--mi); stroke-width: .9; }
.mi .mi-flange-front { fill-opacity: .55; }
.mi .mi-wrap { fill: none; stroke: color-mix(in srgb, var(--mi) 80%, var(--text, #111)); stroke-width: 1.5; }
.mi .mi-spin { fill: none; stroke: var(--mi); stroke-width: 2.2; stroke-dasharray: 3 6; }
.mi .mi-pipe { fill: none; stroke: color-mix(in srgb, var(--mi) 85%, var(--text, #111)); stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 4 3; }
html[data-holo] .mi { filter: drop-shadow(0 0 3px color-mix(in srgb, var(--mi) 70%, transparent)); }
html[data-holo] .mi .mi-top { fill: color-mix(in srgb, var(--mi) 14%, var(--mi-surface)); stroke: var(--mi); stroke-width: 1; }
html[data-holo] .mi .mi-l, html[data-holo] .mi .mi-r { stroke: var(--mi); }

.mi * { transform-box: fill-box; }
.mi .mi-float { animation: mi-float 3.6s ease-in-out infinite; transform-box: view-box; }
.mi .mi-lift { animation: mi-lift 3.6s ease-in-out infinite; }
.mi .mi-bob { animation: mi-bob 2.8s ease-in-out infinite; }
.mi .mi-slide { animation: mi-slide 4s ease-in-out infinite; }
.mi .mi-check { animation: mi-draw 4s ease-in-out infinite; }
.mi .mi-bar { transform-origin: 50% 100%; animation: mi-bar 3s ease-in-out infinite; }
.mi .mi-ring { animation: mi-spin-dash 6s linear infinite; }
.mi .mi-spin { animation: mi-spin-dash 4s linear infinite; }
.mi .mi-pipe { animation: mi-pipe 1.6s linear infinite; }
.menu-card:hover .mi .mi-float { animation-duration: 1.4s; }
.menu-card:hover .mi .mi-lift { animation: mi-lift-hover .9s cubic-bezier(.34,1.56,.64,1) infinite alternate; }
.menu-card:hover .mi .mi-bar { animation-duration: 1.1s; }
.menu-card:hover .mi .mi-ring, .menu-card:hover .mi .mi-spin { animation-duration: 1.2s; }
.menu-card:hover .mi .mi-pipe { animation-duration: .5s; }
.menu-card:hover .mi .mi-check { animation-duration: 1.6s; }
.menu-card:hover .mi .mi-slide { animation-duration: 1.6s; }
@keyframes mi-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-1.6px); } }
@keyframes mi-lift { 0%, 70%, 100% { transform: translateY(0); } 80% { transform: translateY(-4px); } 90% { transform: translateY(.6px); } }
@keyframes mi-lift-hover { from { transform: translateY(0); } to { transform: translateY(-5px); } }
@keyframes mi-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-2.2px); } }
@keyframes mi-slide { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(3px, -1.6px); } }
@keyframes mi-draw { 0%, 15% { stroke-dashoffset: 26; } 45%, 100% { stroke-dashoffset: 0; } }
@keyframes mi-bar { 0%, 100% { transform: scaleY(1); } 50% { transform: scaleY(.72); } }
@keyframes mi-spin-dash { to { stroke-dashoffset: -90; } }
@keyframes mi-pipe { to { stroke-dashoffset: -14; } }
.mi .mi-head { fill: color-mix(in srgb, var(--mi) 30%, var(--mi-surface)); stroke: color-mix(in srgb, var(--mi) 75%, var(--mi-surface)); stroke-width: .8; }
.mi .mi-head-shine { fill: var(--mi-surface); opacity: .55; }
.mi .mi-person { animation: mi-bob 3.2s ease-in-out infinite; }
.mi .mi-badge { animation: mi-badge 3.2s ease-in-out infinite; }
.mi.mi-user { animation: mi-pop .5s cubic-bezier(.34,1.56,.64,1) both; }
.menu-card:hover .mi .mi-badge { animation: mi-badge-hover .8s cubic-bezier(.34,1.56,.64,1) infinite alternate; }
.menu-card:hover .mi .mi-person { animation-duration: 1.4s; }
@keyframes mi-badge { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(1px, -2.5px); } }
@keyframes mi-badge-hover { from { transform: translate(0, 0); } to { transform: translate(2px, -5px); } }
@keyframes mi-pop { from { transform: scale(.6); opacity: 0; } to { transform: scale(1); opacity: 1; } }
.user-hero-card .menu-icon-wrap.menu-icon-iso { margin-left: 0 !important; margin-right: 0 !important; }
.m365-block { position: relative; width: 100%; max-width: 420px; transform: translate(-7px, -4px); }
.m365-block > .menu-card { position: relative; z-index: 1; border-radius: 8px !important; }
.m365-face { position: absolute; pointer-events: none; z-index: 0; }
.m365-face-b { left: 0; right: 0; top: 100%; height: 8px; transform-origin: top left; transform: skewX(60deg); border-radius: 0 0 4px 4px;
  background: color-mix(in srgb, var(--accent-blue, #2f6fed) 38%, var(--surface, #fff)); }
.m365-face-r { top: 0; bottom: 0; left: 100%; width: 13.9px; transform-origin: top left; transform: skewY(30deg); border-radius: 0 4px 4px 0;
  background: color-mix(in srgb, var(--accent-blue, #2f6fed) 24%, var(--surface, #fff)); }
html[data-holo] .m365-face { background: color-mix(in srgb, var(--accent-blue) 30%, #02070c); box-shadow: 0 0 12px -2px color-mix(in srgb, var(--accent-blue) 60%, transparent); }
.m365-block .m365-field { border-radius: 6px !important; box-shadow: inset 3px 2px 0 color-mix(in srgb, var(--text, #111) 8%, transparent) !important; }
.m365-block .m365-key { transform: translate(-4px, -2.4px); box-shadow: 4.5px 2.6px 0 color-mix(in srgb, var(--accent-blue, #2f6fed) 55%, #000) !important;
  transition: transform .2s cubic-bezier(.34,1.56,.64,1), box-shadow .2s; }
.m365-block .m365-key:hover { transform: translate(-5px, -3px); box-shadow: 5.6px 3.2px 0 color-mix(in srgb, var(--accent-blue, #2f6fed) 55%, #000) !important; }
.m365-block .m365-key:active { transform: translate(-.6px, -.3px); box-shadow: .8px .5px 0 color-mix(in srgb, var(--accent-blue, #2f6fed) 55%, #000) !important; }
.mi .mi-m365-spot { fill: color-mix(in srgb, var(--mi) 35%, transparent); animation: mi-spot 3.2s ease-in-out infinite; transform-origin: center; }
.mi .mi-m365-beam { stroke: color-mix(in srgb, var(--mi) 45%, transparent); stroke-width: .8; stroke-dasharray: 2 3; animation: mi-pipe 1.4s linear infinite; }
.mi .mi-m365-logo { animation: mi-logo 3.2s ease-in-out infinite; }
@keyframes mi-logo { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
@keyframes mi-spot { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(.8); opacity: .6; } }
@media (prefers-reduced-motion: reduce) { .m365-block .m365-key { transition: none; } .mi, .mi *, .menu-card:hover .mi * { animation: none !important; } }
.menu-card.is-soon { cursor: default; }
.menu-card .menu-soon { display: inline-block; margin-top: 8px; font-size: 11px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; padding: 2px 9px; border-radius: 99px;
  color: var(--warn, #a3591b); background: color-mix(in srgb, var(--warn, #a3591b) 14%, transparent); }
`;
