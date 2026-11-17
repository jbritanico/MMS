import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getMotion, motionFactor, useMotion } from "./motion";

// A small 3D bar chart drawn on a canvas, for dashboards whose data has two categories and a
// number (unit × month, item × unit, ...). No extra library: MMS stays offline and small.
// Drag to turn, scroll to zoom, double-click to reset, hover for values, click a bar to drill.
// Fluid style: each bar is a column of liquid with soft gradients, a gloss streak, a shadow on
// the floor and a gently moving wave on its surface (follows the dashboard animation setting).

export interface Seg { key: string; label: string; value: number; color: string }
export interface Cell3D { row: number; col: number; segs: Seg[] }
export interface Plane3D { value: number; label: string; color: string }

interface Props {
  rows: string[];
  cols: string[];
  cells: Cell3D[];
  rowTitle: string;
  colTitle: string;
  valueTitle: string;
  fmt?: (v: number) => string;
  plane?: Plane3D | null;
  height?: number;
  /** Whole numbers only (counts): the scale uses whole-number steps. */
  integer?: boolean;
  onPick?: (cell: Cell3D, seg: Seg) => void;
}

type V3 = [number, number, number];
interface Face { pts: [number, number][]; depth: number; fill: string | CanvasGradient; stroke: string; gloss?: [number, number][]; cell?: Cell3D; seg?: Seg }

const DEG = Math.PI / 180;
const DEFAULT_VIEW = { yaw: -38 * DEG, pitch: 30 * DEG, zoom: 1 };

/** CSS colour (also var(...)) to [r, g, b]. The probe sits inside the chart, so the
 *  colours come from the theme the chart is shown in (Light, Dark, macOS). */
function useColorResolver(host: React.RefObject<HTMLDivElement | null>) {
  const probe = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    const el = document.createElement("span");
    el.style.display = "none";
    (host.current ?? document.body).appendChild(el);
    probe.current = el;
    return () => el.remove();
  }, [host]);
  return useCallback((css: string): [number, number, number] => {
    const el = probe.current;
    if (!el) return [128, 128, 128];
    el.style.color = "";
    el.style.color = css;
    const c = getComputedStyle(el).color;
    let m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(c);
    if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
    m = /color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(c);
    if (m) return [Number(m[1]) * 255, Number(m[2]) * 255, Number(m[3]) * 255];
    return [128, 128, 128];
  }, []);
}
const rgb = (c: [number, number, number], k = 1, a = 1) => {
  const f = (x: number) => Math.max(0, Math.min(255, Math.round(k >= 1 ? x + (255 - x) * (k - 1) : x * k)));
  return `rgba(${f(c[0])}, ${f(c[1])}, ${f(c[2])}, ${a})`;
};
const niceMax = (v: number) => {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
};
const short = (s: string, n = 16) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

export default function Chart3D({ rows, cols, cells, rowTitle, colTitle, valueTitle, fmt = (v) => String(Math.round(v * 10) / 10), plane, height = 420, integer = false, onPick }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(800);
  const [view, setView] = useState(DEFAULT_VIEW);
  const [grow, setGrow] = useState(() => (getMotion() === 0 ? 1 : 0));
  const [tip, setTip] = useState<{ x: number; y: number; cell: Cell3D; seg: Seg } | null>(null);
  const faces = useRef<Face[]>([]);
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number; moved: boolean } | null>(null);
  const resolve = useColorResolver(wrapRef);

  // Liquid surface clock: ~30 frames a second while the chart is on screen and animations are on.
  const motion = useMotion();
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || motion === 0) { setPhase(0); return; }
    let raf = 0, last = 0, visible = true;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
    io.observe(el);
    const speed = 0.0021 / motionFactor(motion);
    const tick = (t: number) => {
      if (visible && t - last > 33) { last = t; setPhase(t * speed); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); io.disconnect(); };
  }, [motion]);

  // Redraw when the theme changes (colours are read from the theme).
  const [themeTick, setThemeTick] = useState(0);
  useEffect(() => {
    const app = wrapRef.current?.closest(".app");
    if (!app) return;
    const mo = new MutationObserver(() => setThemeTick((n) => n + 1));
    mo.observe(app, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);

  // Width follows the panel.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Bars grow when the data changes (speed follows the dashboard animation setting).
  const dataKey = useMemo(() => JSON.stringify([rows, cols, cells.map((c) => [c.row, c.col, c.segs.map((s) => s.value)])]), [rows, cols, cells]);
  useEffect(() => {
    const level = getMotion();
    if (level === 0) { setGrow(1); return; }
    const dur = 900 * motionFactor(level);
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      setGrow(1 - Math.pow(1 - k, 3));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    setGrow(0);
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [dataKey]);

  const vmax = useMemo(() => {
    const top = Math.max(plane?.value ?? 0, ...cells.map((c) => c.segs.reduce((a, s) => a + s.value, 0)), 0);
    return integer ? Math.max(1, Math.ceil(top)) : niceMax(top * 1.05);
  }, [cells, plane, integer]);

  // Draw.
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(width * dpr);
    cv.height = Math.round(height * dpr);
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const rN = Math.max(1, rows.length), cN = Math.max(1, cols.length);
    // Keep the floor roughly square: a short side is stretched to at least half the long side.
    const nx = Math.max(rN, cN * 0.55), nz = Math.max(cN, rN * 0.55);
    const ux = nx / rN, uz = nz / cN;
    const H = Math.max(nx, nz) * 0.6 + 1.2;
    const { yaw, pitch, zoom } = view;
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const rot = (p: V3): V3 => {
      const x = p[0] - nx / 2, y = p[1], z = p[2] - nz / 2;
      const x1 = x * cy - z * sy, z1 = x * sy + z * cy;
      return [x1, y * cp + z1 * sp, -y * sp + z1 * cp];
    };
    // Fit the floor and the tallest point into the canvas, leaving room for labels.
    const corners: V3[] = [];
    for (const x of [0, nx]) for (const z of [0, nz]) for (const y of [0, H]) corners.push([x, y, z]);
    const rc = corners.map(rot);
    const minX = Math.min(...rc.map((p) => p[0])), maxX = Math.max(...rc.map((p) => p[0]));
    const minY = Math.min(...rc.map((p) => p[1])), maxY = Math.max(...rc.map((p) => p[1]));
    const padX = 110, padTop = 26, padBottom = 70;
    const s = Math.min((width - padX * 2) / (maxX - minX || 1), (height - padTop - padBottom) / (maxY - minY || 1)) * zoom;
    const ox = width / 2 - ((minX + maxX) / 2) * s;
    const oy = padTop + (height - padTop - padBottom) / 2 + ((minY + maxY) / 2) * s;
    const proj = (p: V3): [number, number, number] => { const r = rot(p); return [ox + r[0] * s, oy - r[1] * s, r[2]]; };

    const text = resolve("var(--text, #1a1d1f)");
    const soft = resolve("var(--text-soft, #6b7280)");
    const line = resolve("var(--border, #dfe3ea)");
    const floorC = resolve("var(--accent-blue, #2f6fed)");
    const font = '"Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif';

    // Floor
    const poly = (pts: [number, number][], fill: string | CanvasGradient | null, stroke: string | null, lw = 1) => {
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
    };
    const P = (x: number, y: number, z: number) => { const p = proj([x, y, z]); return [p[0], p[1]] as [number, number]; };
    poly([P(0, 0, 0), P(nx, 0, 0), P(nx, 0, nz), P(0, 0, nz)], rgb(floorC, 1, 0.06), rgb(line, 1, 0.9));
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgb(line, 1, 0.7);
    for (let i = 1; i < rN; i++) { const a = P(i * ux, 0, 0), b = P(i * ux, 0, nz); ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke(); }
    for (let j = 1; j < cN; j++) { const a = P(0, 0, j * uz), b = P(nx, 0, j * uz); ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke(); }

    // Value scale on the farthest vertical edge
    const farCorner = ([[0, 0], [nx, 0], [nx, nz], [0, nz]] as [number, number][])
      .map(([x, z]) => ({ x, z, d: rot([x, 0, z])[2] }))
      .sort((a, b) => b.d - a.d)[0];
    ctx.font = `11px ${font}`;
    ctx.fillStyle = rgb(soft);
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    const steps = integer && vmax <= 8 ? vmax : 4;
    for (let k = 0; k <= steps; k++) {
      const v = (vmax * k) / steps, y = (v / vmax) * H;
      const a = P(farCorner.x, y, farCorner.z);
      ctx.strokeStyle = rgb(line, 1, k === 0 ? 0.9 : 0.5);
      ctx.beginPath(); ctx.moveTo(...P(farCorner.x, 0, farCorner.z)); ctx.lineTo(...a); ctx.stroke();
      ctx.beginPath(); ctx.arc(a[0], a[1], 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillText(fmt(v), a[0] - 6, a[1]);
    }

    // Bars as columns of liquid, faces sorted back to front. The top of each column is a moving
    // wave; lower segments of a stacked bar stay flat, like layers of liquid.
    const out: Face[] = [];
    const foot = Math.min(ux, uz) * 0.62;
    const light: V3 = [0.35, 0.85, -0.4];
    const ampBase = motion === 0 ? 0 : H * 0.017 * Math.min(1.4, motionFactor(motion) || 1);
    const WN = 7; // points per wavy edge
    const shadowC = resolve("var(--text, #1a1d1f)");
    // Soft shadows on the floor first.
    for (const c of cells) {
      if (c.segs.every((sg) => sg.value <= 0)) continue;
      const mx = (c.row + 0.5) * ux, mz = (c.col + 0.5) * uz, e = foot * 0.62;
      poly([P(mx - e + 0.06, 0, mz - e + 0.08), P(mx + e + 0.06, 0, mz - e + 0.08), P(mx + e + 0.06, 0, mz + e + 0.08), P(mx - e + 0.06, 0, mz + e + 0.08)], rgb(shadowC, 1, 0.07), null);
    }
    for (const c of cells) {
      let base = 0;
      const live = c.segs.filter((sg) => sg.value > 0);
      live.forEach((sg, si) => {
        const h = (sg.value / vmax) * H * grow;
        if (h <= 0) return;
        const isTop = si === live.length - 1;
        const mx = (c.row + 0.5) * ux, mz = (c.col + 0.5) * uz;
        const x0 = mx - foot / 2, x1 = mx + foot / 2, z0 = mz - foot / 2, z1 = mz + foot / 2, y0 = base, y1 = base + h;
        base = y1;
        const amp = isTop ? Math.min(ampBase, h * 0.25) : 0;
        const seed = c.row * 1.9 + c.col * 1.3;
        const wy = (x: number, z: number) => y1 + amp * Math.sin(phase + seed + (x - x0) * 9 + (z - z0) * 7);
        const edge = (a: V3, bq: V3): V3[] => Array.from({ length: WN + 1 }, (_, k) => {
          const t = k / WN, x = a[0] + (bq[0] - a[0]) * t, z = a[2] + (bq[2] - a[2]) * t;
          return [x, wy(x, z), z];
        });
        const col = resolve(sg.color);
        const sides: { a: V3; b: V3; n: V3 }[] = [
          { a: [x0, y0, z0], b: [x1, y0, z0], n: [0, 0, -1] },
          { a: [x0, y0, z1], b: [x1, y0, z1], n: [0, 0, 1] },
          { a: [x0, y0, z0], b: [x0, y0, z1], n: [-1, 0, 0] },
          { a: [x1, y0, z0], b: [x1, y0, z1], n: [1, 0, 0] },
        ];
        const visibleN = (n: V3) => rot([n[0] + nx / 2, n[1], n[2] + nz / 2])[2] <= 0.0001;
        const dot = (n: V3) => Math.max(0, n[0] * light[0] + n[1] * light[1] + n[2] * light[2]);
        for (const f of sides) {
          if (!visibleN(f.n)) continue;
          const top = edge([f.b[0], y1, f.b[2]], [f.a[0], y1, f.a[2]]);
          const v3: V3[] = [f.a, f.b, ...top];
          const pts = v3.map((q) => P(q[0], q[1], q[2]));
          const depth = [f.a, f.b, [f.b[0], y1, f.b[2]] as V3, [f.a[0], y1, f.a[2]] as V3].reduce((acc, q) => acc + proj(q)[2], 0) / 4;
          const lum = 0.7 + 0.38 * dot(f.n);
          const yTop = Math.min(...pts.map((q) => q[1])), yBot = Math.max(...pts.map((q) => q[1]));
          const g = ctx.createLinearGradient(0, yTop, 0, yBot);
          g.addColorStop(0, rgb(col, lum + 0.22, 0.94));
          g.addColorStop(0.55, rgb(col, lum, 0.9));
          g.addColorStop(1, rgb(col, lum * 0.82, 0.92));
          // Gloss streak near the left of the face, full height.
          const gA = 0.14, gB = 0.26;
          const lerp = (u: number, y: number): [number, number] => {
            const x = f.a[0] + (f.b[0] - f.a[0]) * u, z = f.a[2] + (f.b[2] - f.a[2]) * u;
            return P(x, y === -1 ? wy(x, z) : y, z);
          };
          const gloss = [lerp(gA, y0 + h * 0.06), lerp(gB, y0 + h * 0.06), lerp(gB, -1), lerp(gA, -1)];
          out.push({ pts, depth, fill: g, stroke: rgb(col, 0.72, 0.5), gloss: h > 0.25 ? gloss : undefined, cell: c, seg: sg });
        }
        // Surface (top face): a wavy outline, lighter, with a soft highlight.
        const rim = [
          ...edge([x0, y1, z0], [x1, y1, z0]), ...edge([x1, y1, z0], [x1, y1, z1]).slice(1),
          ...edge([x1, y1, z1], [x0, y1, z1]).slice(1), ...edge([x0, y1, z1], [x0, y1, z0]).slice(1, -1),
        ];
        const pts = rim.map((q) => P(q[0], q[1], q[2]));
        const depth = [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]].reduce((acc, q) => acc + proj(q as V3)[2], 0) / 4;
        const cx = pts.reduce((a2, q) => a2 + q[0], 0) / pts.length, cyy = pts.reduce((a2, q) => a2 + q[1], 0) / pts.length;
        const rad = Math.max(4, Math.max(...pts.map((q) => Math.hypot(q[0] - cx, q[1] - cyy))));
        const tg = ctx.createRadialGradient(cx - rad * 0.3, cyy - rad * 0.25, 0, cx, cyy, rad);
        tg.addColorStop(0, rgb(col, isTop ? 1.55 : 1.25, 0.96));
        tg.addColorStop(1, rgb(col, isTop ? 1.12 : 1.02, 0.94));
        out.push({ pts, depth: depth - 0.0001, fill: tg, stroke: rgb(col, isTop ? 1.4 : 0.8, isTop ? 0.9 : 0.5), cell: c, seg: sg });
      });
    }
    out.sort((a, b) => b.depth - a.depth);
    for (const f of out) {
      poly(f.pts, f.fill, f.stroke, 0.8);
      if (f.gloss) poly(f.gloss, "rgba(255,255,255,0.16)", null);
    }
    faces.current = out;

    // Limit plane (e.g. 100% of the MR-II interval)
    if (plane && plane.value > 0) {
      const y = (plane.value / vmax) * H;
      const pc = resolve(plane.color);
      poly([P(0, y, 0), P(nx, y, 0), P(nx, y, nz), P(0, y, nz)], rgb(pc, 1, 0.12), null);
      ctx.setLineDash([6, 4]);
      poly([P(0, y, 0), P(nx, y, 0), P(nx, y, nz), P(0, y, nz)], null, rgb(pc, 1, 0.85), 1.4);
      ctx.setLineDash([]);
      const a = P(farCorner.x, y, farCorner.z);
      ctx.fillStyle = rgb(pc);
      ctx.font = `600 11px ${font}`;
      ctx.textAlign = "left";
      ctx.fillText(plane.label, a[0] + 8, a[1] - 8);
    }

    // Row and column labels on the edges nearest the viewer.
    const nearZ = rot([nx / 2, 0, 0])[2] < rot([nx / 2, 0, nz])[2] ? 0 : nz;
    const nearX = rot([0, 0, nz / 2])[2] < rot([nx, 0, nz / 2])[2] ? 0 : nx;
    ctx.font = `12px ${font}`;
    ctx.fillStyle = rgb(text);
    ctx.textBaseline = "middle";
    const label = (str: string, p: [number, number], outward: [number, number]) => {
      ctx.textAlign = outward[0] < -0.2 ? "right" : outward[0] > 0.2 ? "left" : "center";
      ctx.fillText(short(str), p[0] + outward[0] * 8, p[1] + outward[1] * 10);
    };
    const dirOut = (from: [number, number], to: [number, number]): [number, number] => {
      const dx = to[0] - from[0], dy = to[1] - from[1], l = Math.hypot(dx, dy) || 1;
      return [dx / l, dy / l];
    };
    const center = P(nx / 2, 0, nz / 2);
    // Labels further apart than 15 px are drawn; crowded ones are thinned out evenly.
    const drawSet = (items: { str: string; p: [number, number] }[]) => {
      let every = 1;
      for (; every < items.length; every++) {
        let ok = true;
        for (let k = every; k < items.length; k += every) {
          const a = items[k - every].p, bq = items[k].p;
          if (Math.hypot(a[0] - bq[0], a[1] - bq[1]) < 15) { ok = false; break; }
        }
        if (ok) break;
      }
      items.forEach((it, k) => { if (k % every === 0) label(it.str, it.p, dirOut(center, it.p)); });
    };
    drawSet(rows.map((r, i) => ({ str: r, p: P((i + 0.5) * ux, 0, nearZ === 0 ? -0.45 : nz + 0.45) })));
    drawSet(cols.map((c, j) => ({ str: c, p: P(nearX === 0 ? -0.45 : nx + 0.45, 0, (j + 0.5) * uz) })));
    ctx.font = `600 11px ${font}`;
    ctx.fillStyle = rgb(soft);
    ctx.textAlign = "center";
    const top = P(farCorner.x, H, farCorner.z);
    ctx.fillText(valueTitle.toUpperCase(), top[0], Math.max(10, top[1] - 14));
  }, [rows, cols, cells, view, width, height, grow, vmax, plane, rowTitle, colTitle, valueTitle, fmt, resolve, themeTick, phase, motion]);

  // Hit test: the front-most face under the pointer.
  const hit = (x: number, y: number) => {
    const list = faces.current;
    for (let i = list.length - 1; i >= 0; i--) {
      const pts = list[i].pts;
      let inside = false;
      for (let a = 0, b = pts.length - 1; a < pts.length; b = a++) {
        const [xa, ya] = pts[a], [xb, yb] = pts[b];
        if (ya > y !== yb > y && x < ((xb - xa) * (y - ya)) / (yb - ya) + xa) inside = !inside;
      }
      if (inside) return list[i];
    }
    return null;
  };
  const local = (e: { clientX: number; clientY: number }) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as [number, number];
  };

  // Wheel zoom needs a non-passive listener.
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setView((v) => ({ ...v, zoom: Math.max(0.6, Math.min(2.4, v.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08))) }));
    };
    cv.addEventListener("wheel", onWheel, { passive: false });
    return () => cv.removeEventListener("wheel", onWheel);
  }, []);

  const total = (c: Cell3D) => c.segs.reduce((a, s) => a + s.value, 0);

  return (
    <div className="fl-3d" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height, display: "block", cursor: drag.current ? "grabbing" : tip ? "pointer" : "grab", touchAction: "none" }}
        tabIndex={0}
        role="img"
        aria-label={`3D chart of ${valueTitle} by ${rowTitle} and ${colTitle}. Use the arrow keys to turn it.`}
        onPointerDown={(e) => {
          (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, yaw: view.yaw, pitch: view.pitch, moved: false };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (d) {
            const dx = e.clientX - d.x, dy = e.clientY - d.y;
            if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
            setView((v) => ({ ...v, yaw: d.yaw + dx * 0.008, pitch: Math.max(8 * DEG, Math.min(80 * DEG, d.pitch + dy * 0.006)) }));
            setTip(null);
            return;
          }
          const [x, y] = local(e);
          const f = hit(x, y);
          setTip(f && f.cell && f.seg ? { x, y, cell: f.cell, seg: f.seg } : null);
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (d && !d.moved && onPick) {
            const [x, y] = local(e);
            const f = hit(x, y);
            if (f && f.cell && f.seg) onPick(f.cell, f.seg);
          }
        }}
        onPointerLeave={() => setTip(null)}
        onDoubleClick={() => setView(DEFAULT_VIEW)}
        onKeyDown={(e) => {
          const step = 8 * DEG;
          if (e.key === "ArrowLeft") setView((v) => ({ ...v, yaw: v.yaw - step }));
          else if (e.key === "ArrowRight") setView((v) => ({ ...v, yaw: v.yaw + step }));
          else if (e.key === "ArrowUp") setView((v) => ({ ...v, pitch: Math.min(80 * DEG, v.pitch + step / 2) }));
          else if (e.key === "ArrowDown") setView((v) => ({ ...v, pitch: Math.max(8 * DEG, v.pitch - step / 2) }));
          else if (e.key === "0" || e.key === "Home") setView(DEFAULT_VIEW);
          else return;
          e.preventDefault();
        }}
      />
      {tip && (
        <div className="fl-3d-tip" style={{ left: Math.min(tip.x + 14, width - 230), top: Math.max(4, tip.y - 12) }}>
          <b>{rows[tip.cell.row]} · {cols[tip.cell.col]}</b>
          {tip.cell.segs.filter((s) => s.value > 0).map((s) => (
            <span key={s.key} className={s.key === tip.seg.key ? "is-on" : ""}><i style={{ background: s.color }} />{s.label}: <b>{fmt(s.value)}</b></span>
          ))}
          {tip.cell.segs.length > 1 && <span className="fl-3d-total">Total: <b>{fmt(total(tip.cell))}</b></span>}
        </div>
      )}
      <div className="fl-3d-bar">
        <span><b className="fl-3d-axes">{rowTitle} × {colTitle} · height: {valueTitle.toLowerCase()}</b> · drag to turn · scroll to zoom · double-click to reset{onPick ? " · click a bar to list it" : ""}</span>
        <span className="fl-3d-btns">
          <button type="button" className="ghost" onClick={() => setView((v) => ({ ...v, yaw: v.yaw - 30 * DEG }))} aria-label="Turn left">⟲</button>
          <button type="button" className="ghost" onClick={() => setView((v) => ({ ...v, yaw: v.yaw + 30 * DEG }))} aria-label="Turn right">⟳</button>
          <button type="button" className="ghost" onClick={() => setView(DEFAULT_VIEW)}>Reset view</button>
        </span>
      </div>
    </div>
  );
}

/** 2D / 3D switch, remembered per dashboard on this computer. */
export function use3DMode(dashNo: number): [boolean, (on: boolean) => void] {
  const key = `mms.dashboards.3d.${dashNo}`;
  const [on, setOn] = useState<boolean>(() => {
    try { return localStorage.getItem(key) === "1"; } catch { return false; }
  });
  const set = (v: boolean) => { setOn(v); try { localStorage.setItem(key, v ? "1" : "0"); } catch { /* ignore */ } };
  return [on, set];
}

export function ViewToggle({ is3d, onChange }: { is3d: boolean; onChange: (on: boolean) => void }) {
  return (
    <div className="mrid-tabs fl-3d-toggle" role="tablist" aria-label="Chart view">
      <button type="button" role="tab" aria-selected={!is3d} className={!is3d ? "is-on" : ""} onClick={() => onChange(false)}>2D</button>
      <button type="button" role="tab" aria-selected={is3d} className={is3d ? "is-on" : ""} onClick={() => onChange(true)}>3D</button>
    </div>
  );
}

export const CHART3D_CSS = `
.fl-3d { position: relative; width: 100%; }
.fl-3d canvas:focus-visible { outline: 2px solid var(--accent-blue, #2f6fed); outline-offset: 2px; border-radius: 12px; }
.fl-3d-tip { position: absolute; z-index: 5; pointer-events: none; display: flex; flex-direction: column; gap: 3px; min-width: 170px; max-width: 220px; padding: 9px 12px;
  border-radius: 12px; background: var(--surface); border: 1px solid var(--border); box-shadow: 0 8px 24px rgba(0,0,0,0.16); font-size: 12px; color: var(--text); }
.fl-3d-tip > b { font-size: 12.5px; margin-bottom: 2px; }
.fl-3d-tip span { display: flex; align-items: center; gap: 6px; color: var(--text-soft); }
.fl-3d-tip span.is-on { color: var(--text); }
.fl-3d-tip span b { color: var(--text); }
.fl-3d-tip i { width: 9px; height: 9px; border-radius: 3px; flex: none; }
.fl-3d-total { border-top: 1px solid var(--border); padding-top: 3px; margin-top: 2px; }
.fl-3d-bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; margin-top: 6px; font-size: 12px; color: var(--text-soft); }
.fl-3d-btns { display: inline-flex; gap: 6px; }
.fl-3d-axes { color: var(--text); font-weight: 600; }
.fl-3d-btns button { padding: 3px 10px !important; font-size: 12px !important; }
.mrid-panel-head .fl-3d-toggle { margin-left: auto; }
`;
