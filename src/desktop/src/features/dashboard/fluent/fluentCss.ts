import { FL_TOKENS } from "../../../lib/fluentTokens";

// Fluent 2 + Fluid design layer for the dashboard area.
// Every colour is derived from the MMS theme tokens, so Light, Dark and macOS all work.
// !important is used on controls because the app-wide button / input rules (neumorphic and
// macOS) have very high specificity.
export const FLUENT_CSS = `
/* ---------- tokens ---------- */
.fl-shell {
${FL_TOKENS}
}

/* The dashboard area fills the app's content area; the shell scrolls inside. */
.content:has(> .screen-fade > .fl-shell) { padding: 0 !important; overflow: hidden !important; }
.screen-fade:has(> .fl-shell) { height: 100%; }

.fl-shell { position: relative; height: 100%; min-height: 0; display: grid; grid-template-columns: var(--fl-side-w) minmax(0, 1fr);
  background: var(--fl-bg); color: var(--text); font-family: var(--fl-font); font-size: var(--fl-t-body); overflow: hidden; }
.fl-shell *, .fl-shell *::before, .fl-shell *::after { box-sizing: border-box; }
.fl-shell :focus-visible { outline: 2px solid var(--fl-blue) !important; outline-offset: 2px; }

/* ---------- sidebar ---------- */
.fl-side { position: relative; z-index: 20; display: flex; flex-direction: column; gap: 18px; padding: 20px 14px 16px; overflow-y: auto; overflow-x: hidden; color: #fff;
  background: var(--fl-side-bg, linear-gradient(172deg, var(--fl-navy) 0%, var(--fl-blue) 62%, var(--fl-cyan) 130%)); }
.fl-side::before, .fl-side::after { content: ""; position: absolute; pointer-events: none; border-radius: 50%; }
.fl-side::before { width: 320px; height: 320px; left: -170px; bottom: -120px; background: radial-gradient(circle, rgba(255,255,255,0.16), rgba(255,255,255,0) 68%); }
.fl-side::after { width: 220px; height: 220px; right: -120px; top: 120px; background: radial-gradient(circle, rgba(255,255,255,0.10), rgba(255,255,255,0) 70%); }
.fl-brand { position: relative; display: flex; align-items: center; gap: 10px; padding: 2px 6px 8px; }
.fl-logo { width: 38px; height: 38px; flex: none; border-radius: 12px; display: grid; place-items: center; color: var(--fl-navy);
  background: linear-gradient(145deg, #fff, rgba(255,255,255,0.78)); box-shadow: 0 6px 16px rgba(0,0,0,0.18); }
.fl-logo svg { width: 24px; height: 24px; }
.fl-brand-text, .fl-nav-label { display: flex; flex-direction: column; min-width: 0; line-height: 1.2; }
.fl-brand-text b { font-size: 15.5px; font-weight: 700; letter-spacing: -0.01em; }
.fl-brand-text small, .fl-nav-label small { font-size: 11.5px; opacity: 0.78; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fl-nav { position: relative; display: flex; flex-direction: column; gap: 4px; }
.fl-shell .fl-nav-item { all: unset; box-sizing: border-box; position: relative; display: flex !important; align-items: center; gap: 12px; width: 100%; padding: 10px 12px !important;
  border-radius: 12px !important; color: rgba(255,255,255,0.86) !important; background: transparent !important; box-shadow: none !important; border: 0 !important;
  font: 500 14px/1.2 var(--fl-font) !important; cursor: pointer; transition: background 0.18s var(--fl-ease), color 0.18s, transform 0.18s var(--fl-ease); }
.fl-shell .fl-nav-item:hover { background: rgba(255,255,255,0.12) !important; color: #fff !important; transform: translateX(2px); }
.fl-shell .fl-nav-item.is-on { background: rgba(255,255,255,0.96) !important; color: var(--fl-navy) !important; font-weight: 600 !important; box-shadow: 0 6px 18px rgba(0,0,0,0.16) !important; transform: none; }
.fl-shell .fl-nav-item.is-on::before { content: ""; position: absolute; left: -14px; top: 9px; bottom: 9px; width: 4px; border-radius: 0 4px 4px 0; background: #fff; }
.fl-shell .fl-nav-item.is-soon { cursor: default; opacity: 0.55; }
.fl-shell .fl-nav-item.is-soon:hover { background: transparent !important; transform: none; }
.fl-nav-ico { width: 22px; height: 22px; flex: none; display: grid; place-items: center; }
.fl-nav-ico svg { width: 22px; height: 22px; }
.fl-nav-sep { margin: 14px 12px 4px; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(255,255,255,0.6); }
/* sidebar accordions */
.fl-acc { display: flex; flex-direction: column; }
.fl-shell .fl-acc-head .fl-nav-label { flex: 1; }
.fl-acc.has-active > .fl-acc-head { color: #fff !important; font-weight: 600 !important; }
.fl-acc-count { min-width: 22px; height: 20px; padding: 0 6px; border-radius: 999px; display: grid; place-items: center; font-size: 11px; font-weight: 700; background: rgba(255,255,255,0.16); }
.fl-acc-chev { width: 16px; height: 16px; display: grid; place-items: center; transition: transform 0.25s var(--fl-ease); opacity: 0.85; }
.fl-acc-chev svg { width: 16px; height: 16px; }
.fl-acc.is-open .fl-acc-chev { transform: rotate(90deg); }
.fl-shell .fl-acc-rail { display: none !important; }
.fl-acc-body { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 0.3s var(--fl-ease); }
.fl-acc.is-open .fl-acc-body { grid-template-rows: 1fr; }
.fl-acc-inner { min-height: 0; overflow: hidden; display: flex; flex-direction: column; gap: 2px; margin-left: 22px; padding-left: 10px; border-left: 1px solid rgba(255,255,255,0.22); }
.fl-acc.is-open .fl-acc-inner { padding-top: 2px; padding-bottom: 8px; }
.fl-shell .fl-sub-item { all: unset; box-sizing: border-box; position: relative; display: flex !important; align-items: center; gap: 9px; width: 100%; padding: 7px 10px !important; border-radius: 10px !important;
  font: 500 13px/1.25 var(--fl-font) !important; color: rgba(255,255,255,0.8) !important; background: transparent !important; box-shadow: none !important; border: 0 !important; cursor: pointer;
  transition: background 0.18s var(--fl-ease), color 0.18s, transform 0.18s var(--fl-ease); }
.fl-shell .fl-sub-item:hover { background: rgba(255,255,255,0.12) !important; color: #fff !important; transform: translateX(2px); }
.fl-shell .fl-sub-item.is-on { background: rgba(255,255,255,0.96) !important; color: var(--fl-navy) !important; font-weight: 600 !important; box-shadow: 0 4px 14px rgba(0,0,0,0.16) !important; transform: none; }
.fl-shell .fl-sub-item.is-on::before { content: ""; position: absolute; left: -12px; top: 8px; bottom: 8px; width: 3px; border-radius: 3px; background: #fff; }
.fl-sub-ico { width: 16px; height: 16px; flex: none; display: grid; place-items: center; opacity: 0.9; }
.fl-sub-ico svg { width: 16px; height: 16px; }
.fl-sub-label { flex: 1; min-width: 0; }
.fl-deck-dot { width: 7px; height: 7px; flex: none; border-radius: 50%; background: #7dd3fc; box-shadow: 0 0 0 3px rgba(125,211,252,0.25); }
.fl-shell .fl-sub-item.is-on .fl-deck-dot { background: #0ea5e9; }
.fl-acc .fl-nav-sep { margin-top: 14px; }
.fl-side-foot { position: relative; margin-top: auto; display: flex; flex-direction: column; gap: 10px; }
.fl-status, .fl-me { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 14px; background: rgba(255,255,255,0.12); }
.fl-status b, .fl-me b { font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fl-status-dot { width: 10px; height: 10px; flex: none; margin: 0 6px; border-radius: 50%; background: #5ef0b0; box-shadow: 0 0 0 4px rgba(94,240,176,0.25); animation: fl-pulse 2.4s ease-in-out infinite; }
.fl-avatar { width: 36px; height: 36px; flex: none; border-radius: 50%; display: grid; place-items: center; font-size: 13px; font-weight: 700; color: var(--fl-navy);
  background: linear-gradient(145deg, #fff, color-mix(in srgb, #fff 70%, var(--fl-cyan))); }
.fl-avatar.sm { width: 34px; height: 34px; color: #fff; background: linear-gradient(145deg, var(--fl-blue), var(--fl-cyan)); box-shadow: var(--fl-shadow-1); }

/* ---------- scrollbars: thin Fluent overlay style ---------- */
/* Sidebar: a slim translucent white pill on the blue gradient, shown when the pointer is over the panel. */
.fl-side { scrollbar-gutter: stable; }
.fl-side::-webkit-scrollbar { width: 10px; }
.fl-side::-webkit-scrollbar-track { background: transparent; margin: 14px 0; }
.fl-side::-webkit-scrollbar-thumb { border-radius: 999px; border: 3px solid transparent; background-clip: padding-box; background-color: rgba(255,255,255,0.22); }
.fl-side:hover::-webkit-scrollbar-thumb { background-color: rgba(255,255,255,0.38); }
.fl-side::-webkit-scrollbar-thumb:hover { background-color: rgba(255,255,255,0.55); border-width: 2px; }
.fl-side::-webkit-scrollbar-thumb:active { background-color: rgba(255,255,255,0.7); }
.fl-side::-webkit-scrollbar-button, .fl-side::-webkit-scrollbar-corner { display: none; background: transparent; }
/* Main area and inner panels: the same slim pill in the theme's blue. */
.fl-main::-webkit-scrollbar, .fl-shell .mrid-table-wrap::-webkit-scrollbar, .fl-pop::-webkit-scrollbar { width: 12px; height: 12px; }
.fl-main::-webkit-scrollbar-track, .fl-shell .mrid-table-wrap::-webkit-scrollbar-track { background: transparent; margin: 6px; }
.fl-main::-webkit-scrollbar-thumb, .fl-shell .mrid-table-wrap::-webkit-scrollbar-thumb, .fl-pop::-webkit-scrollbar-thumb { border-radius: 999px; border: 4px solid transparent; background-clip: padding-box;
  background-color: color-mix(in srgb, var(--fl-blue) 22%, transparent); }
.fl-main::-webkit-scrollbar-thumb:hover, .fl-shell .mrid-table-wrap::-webkit-scrollbar-thumb:hover { border-width: 3px; background-color: color-mix(in srgb, var(--fl-blue) 45%, transparent); }
.fl-main::-webkit-scrollbar-button, .fl-main::-webkit-scrollbar-corner, .fl-shell .mrid-table-wrap::-webkit-scrollbar-button { display: none; background: transparent; }

/* ---------- main column, header ---------- */
.fl-main { position: relative; min-width: 0; overflow-y: auto; overflow-x: hidden; scroll-behavior: smooth; }
.fl-backdrop { position: absolute; left: 0; right: 0; top: 0; height: 640px; pointer-events: none; z-index: 0; }
.fl-backdrop svg { width: 100%; height: 100%; display: block; }
.fl-backdrop .b1 { fill: color-mix(in srgb, var(--fl-blue) 7%, transparent); }
.fl-backdrop .b2 { fill: color-mix(in srgb, var(--fl-cyan) 6%, transparent); }
.fl-header { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; gap: 16px; padding: 18px 32px 14px;
  background: color-mix(in srgb, var(--fl-bg) 88%, transparent); backdrop-filter: saturate(1.4) blur(12px); -webkit-backdrop-filter: saturate(1.4) blur(12px); }
.fl-titles { min-width: 0; flex: 1; }
.fl-titles h1 { margin: 0; font-size: var(--fl-t-h1); font-weight: 700; letter-spacing: -0.02em; line-height: 1.15; color: var(--text); }
.fl-titles p { margin: 3px 0 0; font-size: 13.5px; color: var(--text-soft); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fl-header-tools { display: flex; align-items: center; gap: 10px; }
.fl-search { position: relative; width: clamp(200px, 24vw, 340px); }
.fl-search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); width: 18px; height: 18px; color: var(--text-soft); pointer-events: none; z-index: 1; }
.fl-search-icon svg { width: 18px; height: 18px; display: block; }
.fl-shell .fl-search input { width: 100% !important; height: 38px !important; padding: 0 14px 0 38px !important; border-radius: 999px !important; border: 1px solid var(--fl-line) !important;
  background: var(--fl-card) !important; color: var(--text) !important; box-shadow: var(--fl-shadow-1) !important; font: 400 13.5px var(--fl-font) !important; transition: box-shadow 0.18s, border-color 0.18s; }
.fl-shell .fl-search input:focus { border-color: var(--fl-blue) !important; box-shadow: 0 0 0 3px color-mix(in srgb, var(--fl-blue) 20%, transparent) !important; }
.fl-shell .fl-icon-btn { all: unset; box-sizing: border-box; position: relative; width: 38px; height: 38px; display: grid !important; place-items: center; border-radius: 50% !important;
  background: var(--fl-card) !important; color: var(--text) !important; border: 1px solid var(--fl-line) !important; box-shadow: var(--fl-shadow-1) !important; cursor: pointer; transition: transform 0.15s var(--fl-ease), box-shadow 0.15s; }
.fl-shell .fl-icon-btn:hover { transform: translateY(-1px); box-shadow: var(--fl-shadow-2) !important; }
.fl-shell .fl-icon-btn:active { transform: scale(0.96); }
.fl-icon-btn svg { width: 19px; height: 19px; }
.fl-shell .fl-burger { display: none !important; }
.fl-badge { position: absolute; top: -4px; right: -5px; min-width: 19px; height: 19px; padding: 0 5px; border-radius: 999px; display: grid; place-items: center;
  font-size: 10.5px; font-weight: 700; color: #fff; background: var(--fl-red); border: 2px solid var(--fl-card); animation: fl-pop 0.4s var(--fl-ease); }
.fl-bell-wrap { position: relative; }
.fl-pop { position: absolute; right: 0; top: calc(100% + 8px); z-index: 30; width: 360px; max-width: 86vw; padding: 6px; border-radius: 16px; background: var(--fl-card);
  border: 1px solid var(--fl-line); box-shadow: var(--fl-shadow-2); animation: fl-drop 0.2s var(--fl-ease); }
.fl-search-pop { left: 0; right: auto; width: 100%; min-width: 300px; }
.fl-pop-head { display: flex; justify-content: space-between; padding: 8px 10px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-soft); }
.fl-pop-empty { padding: 14px 12px; font-size: 13px; color: var(--text-soft); }
.fl-pop-row, .fl-shell .fl-pop-item { display: flex !important; align-items: center; gap: 10px; padding: 9px 10px !important; border-radius: 10px !important; }
.fl-shell .fl-pop-item { all: unset; box-sizing: border-box; width: 100%; cursor: pointer; border: 0 !important; background: transparent !important; box-shadow: none !important; }
.fl-shell .fl-pop-item.is-hi, .fl-pop-row:hover { background: var(--fl-soft) !important; }
.fl-pop-text { display: flex; flex-direction: column; min-width: 0; gap: 1px; font-family: var(--fl-font); }
.fl-pop-text b { font-size: 13px; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fl-pop-text small { font-size: 11.5px; color: var(--text-soft); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fl-shell .fl-pop-foot { all: unset; box-sizing: border-box; display: flex !important; align-items: center; justify-content: center; gap: 4px; width: 100%; margin-top: 4px; padding: 9px !important;
  border-radius: 10px !important; font: 600 13px var(--fl-font) !important; color: var(--fl-blue) !important; cursor: pointer; border: 0 !important; border-top: 1px solid var(--fl-line) !important; background: transparent !important; box-shadow: none !important; }
.fl-shell .fl-pop-foot:hover { background: var(--fl-soft) !important; }
.fl-pop-foot svg { width: 16px; height: 16px; }
.fl-dot { width: 9px; height: 9px; flex: none; border-radius: 50%; background: var(--fl-blue); }
.fl-dot.is-red { background: var(--fl-red); } .fl-dot.is-amber { background: var(--fl-amber); } .fl-dot.is-green { background: var(--fl-green); } .fl-dot.is-blue { background: var(--fl-blue); }

.fl-page { position: relative; z-index: 1; display: flex; flex-direction: column; gap: var(--fl-s6); padding: 6px 32px 40px; animation: fl-in 0.42s var(--fl-ease); }

/* ---------- hero ---------- */
.fl-hero { position: relative; overflow: hidden; display: flex; align-items: center; gap: 24px; min-height: 168px; padding: 28px 32px; border-radius: var(--fl-r-xl); color: #fff;
  background: linear-gradient(118deg, var(--fl-navy) 0%, var(--fl-blue) 48%, var(--fl-cyan) 100%); box-shadow: 0 18px 40px color-mix(in srgb, var(--fl-blue) 26%, transparent); }
.fl-hero::before { content: ""; position: absolute; width: 420px; height: 420px; left: -160px; top: -250px; border-radius: 50%; background: radial-gradient(circle, rgba(255,255,255,0.18), rgba(255,255,255,0) 70%); }
.fl-hero-art { position: absolute; right: 0; top: 0; height: 100%; width: 72%; pointer-events: none; animation: fl-drift 14s ease-in-out infinite alternate; }
.fl-hero-body { position: relative; flex: 1; min-width: 0; max-width: 760px; }
.fl-hero-eyebrow { display: inline-block; margin-bottom: 8px; font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.85; }
.fl-hero h2 { margin: 0; font-size: clamp(22px, 2.3vw, 30px); font-weight: 700; letter-spacing: -0.02em; line-height: 1.15; text-wrap: balance; }
.fl-hero p { margin: 8px 0 0; font-size: 14.5px; line-height: 1.5; opacity: 0.92; max-width: 620px; }
.fl-hero-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
.fl-chip { display: inline-flex; align-items: center; gap: 7px; padding: 6px 12px; border-radius: 999px; font-size: 12.5px; font-weight: 600;
  background: rgba(255,255,255,0.18); border: 1px solid rgba(255,255,255,0.28); color: #fff; backdrop-filter: blur(6px); }
.fl-chip i { width: 8px; height: 8px; border-radius: 50%; background: currentColor; }
.fl-hero-side { position: relative; flex: none; display: flex; gap: 10px; }
.fl-hero-stat { min-width: 112px; padding: 14px 16px; border-radius: 16px; background: rgba(255,255,255,0.16); border: 1px solid rgba(255,255,255,0.26); backdrop-filter: blur(8px); }
.fl-hero-stat b { display: block; font-size: 28px; font-weight: 700; line-height: 1.1; }
.fl-hero-stat span { font-size: 12px; opacity: 0.88; }

/* ---------- icon containers (tones) ---------- */
.fl-shell .tone-blue { --tone: var(--fl-blue); } .fl-shell .tone-teal { --tone: var(--fl-cyan); } .fl-shell .tone-green { --tone: var(--fl-green); }
.fl-shell .tone-amber { --tone: var(--fl-amber); } .fl-shell .tone-red { --tone: var(--fl-red); } .fl-shell .tone-violet { --tone: var(--fl-violet); }
.fl-ico { width: 40px; height: 40px; flex: none; border-radius: 50%; display: grid; place-items: center; color: var(--tone, var(--fl-blue));
  background: color-mix(in srgb, var(--tone, var(--fl-blue)) 14%, var(--fl-card)); }
.fl-ico svg { width: 21px; height: 21px; }
.fl-ico.sm { width: 32px; height: 32px; } .fl-ico.sm svg { width: 17px; height: 17px; }
.fl-ico.lg { width: 50px; height: 50px; border-radius: 16px; } .fl-ico.lg svg { width: 25px; height: 25px; }

/* ---------- KPI cards ---------- */
.fl-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--fl-s5); }
.fl-shell .fl-kpi { all: unset; box-sizing: border-box; position: relative; overflow: hidden; display: flex !important; flex-direction: column; gap: 6px; padding: 20px 20px 34px !important;
  border-radius: var(--fl-r-lg) !important; background: var(--fl-card) !important; border: 1px solid var(--fl-line) !important; box-shadow: var(--fl-shadow-1) !important;
  font-family: var(--fl-font) !important; color: var(--text) !important; text-align: left; transition: transform 0.22s var(--fl-ease), box-shadow 0.22s var(--fl-ease); }
.fl-shell button.fl-kpi { cursor: pointer; }
.fl-shell button.fl-kpi:hover { transform: translateY(-3px); box-shadow: var(--fl-shadow-2) !important; }
.fl-shell button.fl-kpi:active { transform: translateY(-1px) scale(0.995); }
.fl-kpi-top { display: flex; align-items: center; gap: 12px; }
.fl-kpi-label { font-size: 13.5px; font-weight: 600; color: var(--text-soft); }
.fl-kpi-value { font-size: var(--fl-t-kpi); font-weight: 700; letter-spacing: -0.02em; line-height: 1.1; margin-top: 6px; color: var(--text); font-variant-numeric: tabular-nums; }
.fl-kpi-sub { font-size: 12.5px; color: var(--text-soft); line-height: 1.4; }
.fl-kpi-trend { display: flex; }
.fl-kpi-wave { position: absolute; left: 0; right: 0; bottom: 0; width: 100%; height: 34px; pointer-events: none; }
.fl-kpi-wave path:first-child { fill: color-mix(in srgb, var(--tone, var(--fl-blue)) 10%, transparent); }
.fl-kpi-wave path:last-child { fill: color-mix(in srgb, var(--tone, var(--fl-blue)) 16%, transparent); }
.fl-trend { display: inline-flex; align-items: center; gap: 4px; padding: 2px 9px; border-radius: 999px; font-size: 12px; font-weight: 600; }
.fl-trend svg { width: 10px; height: 10px; }
.fl-trend.is-good { color: var(--fl-green); background: color-mix(in srgb, var(--fl-green) 13%, transparent); }
.fl-trend.is-bad { color: var(--fl-red); background: color-mix(in srgb, var(--fl-red) 12%, transparent); }
.fl-trend.is-flat { color: var(--text-soft); background: color-mix(in srgb, var(--text-soft) 12%, transparent); }
.fl-split { display: flex; height: 8px; border-radius: 999px; overflow: hidden; background: var(--fl-line); margin-top: 4px; }
.fl-split i { display: block; height: 100%; transition: flex-grow 0.6s var(--fl-ease); }

/* ---------- cards, grids ---------- */
.fl-card { position: relative; min-width: 0; padding: 20px 22px; border-radius: var(--fl-r-lg); background: var(--fl-card); border: 1px solid var(--fl-line); box-shadow: var(--fl-shadow-1);
  transition: box-shadow 0.22s var(--fl-ease); }
.fl-card:hover { box-shadow: var(--fl-shadow-2); }
.fl-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
.fl-card-head h3 { margin: 0; font-size: var(--fl-t-title); font-weight: 600; letter-spacing: -0.01em; color: var(--text); }
.fl-card-head p { margin: 3px 0 0; font-size: 12.5px; color: var(--text-soft); }
.fl-card-tools { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.fl-grid-2 { display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(0, 1fr); gap: var(--fl-s5); }
.fl-grid-3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--fl-s5); }
.fl-section-title { margin: 6px 0 -6px; font-size: 13px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-soft); }
.fl-seg { display: inline-flex; gap: 2px; padding: 3px; border-radius: 999px; background: color-mix(in srgb, var(--fl-blue) 9%, var(--fl-card)); }
.fl-shell .fl-seg button { all: unset; box-sizing: border-box; padding: 5px 12px !important; border-radius: 999px !important; font: 600 12px var(--fl-font) !important; color: var(--text-soft) !important;
  cursor: pointer; background: transparent !important; box-shadow: none !important; border: 0 !important; transition: background 0.18s, color 0.18s; }
.fl-shell .fl-seg button.is-on { background: var(--fl-card) !important; color: var(--fl-blue) !important; box-shadow: 0 1px 4px color-mix(in srgb, var(--fl-navy) 16%, transparent) !important; }
.fl-legend { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 12px; color: var(--text-soft); }
.fl-legend span { display: inline-flex; align-items: center; gap: 6px; }
.fl-legend i { width: 10px; height: 10px; border-radius: 3px; }
.fl-list { display: flex; flex-direction: column; }
.fl-list-row { display: flex; align-items: center; gap: 12px; padding: 11px 4px; border-top: 1px solid var(--fl-line); min-width: 0; }
.fl-list-row:first-child { border-top: 0; }
.fl-list-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.fl-list-main b { font-size: 13.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fl-list-main small { font-size: 12px; color: var(--text-soft); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fl-list-side { flex: none; font-size: 12px; color: var(--text-soft); text-align: right; }
.fl-pill { display: inline-flex; align-items: center; gap: 5px; padding: 2px 9px; border-radius: 999px; font-size: 11.5px; font-weight: 600;
  color: var(--tone, var(--fl-blue)); background: color-mix(in srgb, var(--tone, var(--fl-blue)) 13%, transparent); white-space: nowrap; }
.fl-empty { padding: 18px 4px; font-size: 13px; color: var(--text-soft); }
.fl-shell .fl-link { all: unset; border: 0 !important; background: transparent !important; box-shadow: none !important; padding: 0 !important; cursor: pointer; font: 600 12.5px var(--fl-font) !important; color: var(--fl-blue) !important; display: inline-flex; align-items: center; gap: 2px; }
.fl-shell .fl-link:hover { text-decoration: underline; }
.fl-link svg { width: 14px; height: 14px; }
.fl-meter { height: 6px; border-radius: 999px; background: var(--fl-line); overflow: hidden; width: 90px; }
.fl-meter i { display: block; height: 100%; border-radius: 999px; background: var(--tone, var(--fl-blue)); }

/* ---------- quick actions ---------- */
.fl-qas { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: var(--fl-s4); }
.fl-shell .fl-qa { all: unset; box-sizing: border-box; display: flex !important; flex-direction: column; align-items: flex-start; gap: 10px; padding: 18px !important; border-radius: var(--fl-r-lg) !important;
  background: color-mix(in srgb, var(--tone) 9%, var(--fl-card)) !important; border: 1px solid color-mix(in srgb, var(--tone) 18%, transparent) !important; box-shadow: none !important;
  cursor: pointer; font-family: var(--fl-font); transition: transform 0.22s var(--fl-ease), box-shadow 0.22s var(--fl-ease), background 0.22s; }
.fl-shell .fl-qa:hover { transform: translateY(-3px); box-shadow: var(--fl-shadow-2) !important; background: color-mix(in srgb, var(--tone) 13%, var(--fl-card)) !important; }
.fl-shell .fl-qa:active { transform: translateY(-1px) scale(0.98); }
.fl-qa .fl-ico { background: var(--fl-card); box-shadow: 0 4px 12px color-mix(in srgb, var(--tone) 22%, transparent); }
.fl-qa-label { font-size: 14px; font-weight: 600; color: var(--text); }
.fl-qa-note { margin-top: -6px; font-size: 12px; color: var(--text-soft); }

/* ---------- section cards (dashboard catalogue) ---------- */
.fl-dash-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: var(--fl-s4); }

/* overview: explore cards */
.fl-shell .fl-explore { --tone: var(--fl-blue); background: var(--fl-card) !important; border: 1px solid var(--fl-line) !important; box-shadow: var(--fl-shadow-1) !important; }
.fl-shell .fl-explore:hover { background: var(--fl-card) !important; }
.fl-explore-head { display: flex; align-items: center; gap: 12px; }
.fl-explore-list { font-size: 12.5px; line-height: 1.5; color: var(--text-soft); }

/* ---------- motion ---------- */
@keyframes fl-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes fl-drop { from { opacity: 0; transform: translateY(-6px) scale(0.98); } to { opacity: 1; transform: none; } }
@keyframes fl-pop { 0% { transform: scale(0.4); } 70% { transform: scale(1.15); } 100% { transform: scale(1); } }
@keyframes fl-pulse { 0%, 100% { box-shadow: 0 0 0 3px rgba(94,240,176,0.25); } 50% { box-shadow: 0 0 0 6px rgba(94,240,176,0.08); } }
@keyframes fl-drift { from { transform: translateX(0); } to { transform: translateX(-18px); } }
@keyframes fl-spin { to { transform: rotate(360deg); } }
@keyframes fl-beat { 0% { box-shadow: 0 0 0 0 color-mix(in srgb, currentColor 45%, transparent); } 70% { box-shadow: 0 0 0 7px color-mix(in srgb, currentColor 0%, transparent); } 100% { box-shadow: 0 0 0 0 transparent; } }
@keyframes fl-grow { from { width: 0; } }
@keyframes fl-ring-draw { from { stroke-dashoffset: var(--ring-c); } }
@keyframes fl-glow { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }

/* ---------- animation level (header settings slider) ----------
   --fl-k scales the main durations: Subtle 0.6, Standard 1, Lively 1.35. */
.fl-shell .fl-page { animation-duration: calc(0.42s * var(--fl-k)); }
.fl-shell .mrid-story li { animation-duration: calc(0.45s * var(--fl-k)); }
.fl-shell .mrid-dash > .mrid-kpis > .mrid-kpi, .fl-shell .mrid-dash > .mrid-panel { animation-duration: calc(0.42s * var(--fl-k)); }
.fl-shell .mrid-spark-line { animation-duration: calc(0.9s * var(--fl-k)); }
.fl-shell .mrid-spark-area, .fl-shell .mrid-spark-dot { animation-duration: calc(0.6s * var(--fl-k)); }
.fl-shell .fl-asset, .fl-shell .mri-report-item { animation-duration: calc(0.4s * var(--fl-k)); }
.fl-shell .fl-acc-body { transition-duration: calc(0.3s * var(--fl-k)); }
.fl-shell .mri-kpi-fill { transition-duration: calc(0.9s * var(--fl-k)); }
/* Off: nothing moves; everything shows in its final state. */
.fl-shell[data-motion="0"] *, .fl-shell[data-motion="0"] *::before, .fl-shell[data-motion="0"] *::after { animation: none !important; transition: none !important; }
.fl-shell[data-motion="0"] .mrid-story li, .fl-shell[data-motion="0"] .mrid-spark-area, .fl-shell[data-motion="0"] .mrid-spark-dot,
.fl-shell[data-motion="0"] .mrid-dash > .mrid-kpis > .mrid-kpi, .fl-shell[data-motion="0"] .mrid-dash > .mrid-panel { opacity: 1 !important; transform: none !important; }
.fl-shell[data-motion="0"] .mrid-spark-line { stroke-dashoffset: 0 !important; }
.fl-shell[data-motion="0"] .fl-shell button:hover, .fl-shell[data-motion="0"] .fl-kpi:hover, .fl-shell[data-motion="0"] .fl-qa:hover, .fl-shell[data-motion="0"] .fl-asset:hover { transform: none !important; }
/* Subtle: no continuous motion (drifting shapes, pulses, glowing dots). */
.fl-shell[data-motion="1"] .fl-hero-art, .fl-shell[data-motion="1"] .fl-status-dot, .fl-shell[data-motion="1"] .is-pulse, .fl-shell[data-motion="1"] .is-pulse *,
.fl-shell[data-motion="1"] .mrid-over::before, .fl-shell[data-motion="1"] .fl-age i { animation: none !important; }
/* Lively: bigger lift on hover. */
.fl-shell[data-motion="3"] .fl-kpi:hover, .fl-shell[data-motion="3"] button.mrid-kpi:hover, .fl-shell[data-motion="3"] .fl-qa:hover, .fl-shell[data-motion="3"] .fl-asset:hover { transform: translateY(-6px) !important; }
.fl-shell[data-motion="3"] .fl-hero-art { animation-duration: 9s; }

/* ---------- animated pieces ---------- */
/* Overdue marker: a pulsing dot before overdue text (Fault aging, MR-II forecast, ...) */
.fl-shell .mrid-over::before { content: ""; display: inline-block; width: 7px; height: 7px; margin-right: 6px; vertical-align: 1px; border-radius: 50%; background: currentColor; animation: fl-beat calc(1.8s / max(var(--fl-k), 0.6)) ease-out infinite; }
.fl-shell .mrid-dot.is-pulse { color: var(--fl-red); animation: fl-beat 1.6s ease-out infinite; }
/* Ring (closure rate, exemption countdown) */
.fl-ring { position: relative; display: inline-grid; place-items: center; flex: none; }
.fl-ring svg { position: absolute; inset: 0; width: 100%; height: 100%; transform: rotate(-90deg); }
.fl-ring-track { fill: none; stroke: var(--fl-line); stroke-width: 3.5; }
.fl-ring-fill { fill: none; stroke: var(--ring); stroke-width: 3.5; stroke-linecap: round; stroke-dashoffset: var(--ring-off); animation: fl-ring-draw calc(1.1s * var(--fl-k)) var(--fl-ease) both; }
.fl-ring-label { position: relative; font-size: 10.5px; font-weight: 700; color: var(--text); font-variant-numeric: tabular-nums; }
.fl-ring.is-pulse { border-radius: 50%; color: var(--ring); animation: fl-beat 1.8s ease-out infinite; }
.fl-ring-row { display: inline-flex; align-items: center; gap: 10px; }
.fl-kpi-ringrow { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
/* Gauge bar (MR-II forecast counters) */
.fl-gauge { display: inline-flex; align-items: center; gap: 10px; min-width: 150px; }
.fl-gauge-track { position: relative; width: 96px; height: 8px; border-radius: 999px; background: var(--fl-line); }
.fl-gauge-track i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 999px; animation: fl-grow calc(1s * var(--fl-k)) var(--fl-ease) both; }
.fl-gauge-track b { position: absolute; top: -3px; width: 2px; height: 14px; border-radius: 1px; background: var(--text-soft); opacity: 0.7; transform: translateX(-1px); }
.fl-gauge-num { font-weight: 700; font-size: 12.5px; font-variant-numeric: tabular-nums; min-width: 38px; }
.fl-gauge.is-pulse .fl-gauge-track i { animation: fl-grow calc(1s * var(--fl-k)) var(--fl-ease) both, fl-glow 1.6s ease-in-out calc(1s * var(--fl-k)) infinite; }
/* Live waiting time (Decisions waiting) */
.fl-age { display: inline-flex; align-items: center; gap: 7px; padding: 3px 10px; border-radius: 999px; font-size: 12px; white-space: nowrap; font-variant-numeric: tabular-nums;
  color: var(--tone); background: color-mix(in srgb, var(--tone) 12%, transparent); }
.fl-age.is-green { --tone: var(--fl-green); } .fl-age.is-amber { --tone: var(--fl-amber); } .fl-age.is-red { --tone: var(--fl-red); }
.fl-age i { width: 7px; height: 7px; border-radius: 50%; background: var(--tone); color: var(--tone); }
.fl-age.is-red i { animation: fl-beat 1.6s ease-out infinite; }
.fl-age b { font-weight: 700; }
.fl-age-s { opacity: 0.6; font-weight: 600; }

/* ---------- settings menu: animation slider ---------- */
.fl-settings-pop { width: 320px; padding: 8px 8px 12px; }
.fl-motion { padding: 4px 10px 0; }
.fl-motion-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 10px; }
.fl-motion-head b { font-size: 14px; font-weight: 600; }
.fl-motion-value { font-size: 12.5px; font-weight: 700; color: var(--fl-blue); padding: 2px 10px; border-radius: 999px; background: color-mix(in srgb, var(--fl-blue) 12%, transparent); }
.fl-shell .fl-motion input[type="range"] { -webkit-appearance: none; appearance: none; width: 100% !important; height: 22px !important; margin: 0 !important; padding: 0 !important; border: 0 !important;
  background: transparent !important; box-shadow: none !important; cursor: pointer; }
.fl-shell .fl-motion input[type="range"]::-webkit-slider-runnable-track { height: 6px; border-radius: 999px;
  background: linear-gradient(90deg, var(--fl-blue) 0 var(--fill), color-mix(in srgb, var(--text) 14%, transparent) var(--fill) 100%); }
.fl-shell .fl-motion input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; width: 20px; height: 20px; margin-top: -7px; border-radius: 50%; background: var(--fl-card);
  border: 5px solid var(--fl-blue); box-shadow: 0 2px 6px color-mix(in srgb, var(--fl-navy) 30%, transparent); transition: transform 0.15s; }
.fl-shell .fl-motion input[type="range"]:hover::-webkit-slider-thumb { transform: scale(1.12); }
.fl-shell .fl-motion input[type="range"]:active::-webkit-slider-thumb { transform: scale(0.95); border-width: 6px; }
.fl-motion-ticks { display: flex; justify-content: space-between; margin-top: 6px; }
.fl-shell .fl-motion-ticks button { all: unset; border: 0 !important; background: transparent !important; box-shadow: none !important; cursor: pointer; font: 600 11.5px var(--fl-font) !important; color: var(--text-soft) !important; padding: 2px 2px !important; }
.fl-shell .fl-motion-ticks button.is-on { color: var(--fl-blue) !important; }
.fl-motion-hint { margin: 10px 0 0; font-size: 12.5px; line-height: 1.45; color: var(--text); min-height: 36px; }
.fl-motion-note { margin: 10px 10px 0; padding-top: 10px; border-top: 1px solid var(--fl-line); font-size: 11.5px; color: var(--text-soft); }

/* ===================================================================================
   The existing MR-I dashboard components (mrid-*) restyled inside the shell.
   =================================================================================== */
.fl-shell .mrid { font-family: var(--fl-font); }
.fl-shell .mrid .header h1, .fl-shell .mrid-title { font-size: 22px !important; font-weight: 700; letter-spacing: -0.02em; font-family: var(--fl-font); }
.fl-shell .mrid .header .sub { font-family: var(--fl-font) !important; font-size: 13.5px !important; }
.fl-shell .mrid-headrow { padding: 18px 22px; border-radius: var(--fl-r-lg); background: var(--fl-card); border: 1px solid var(--fl-line); box-shadow: var(--fl-shadow-1); align-items: center; }
.fl-shell .mrid-headrow > .header { margin-bottom: 0; }
.fl-shell .mrid-icon { width: 42px; height: 42px; border-radius: 50%; background: color-mix(in srgb, var(--fl-blue) 13%, var(--fl-card)); color: var(--fl-blue); }
.fl-shell .mrid-title .mrid-icon { width: 46px; height: 46px; background: linear-gradient(140deg, var(--fl-blue), var(--fl-cyan)); color: #fff; box-shadow: 0 8px 18px color-mix(in srgb, var(--fl-blue) 30%, transparent); }
.fl-shell .mrid-icon.is-deck { background: color-mix(in srgb, var(--deck) 28%, var(--fl-card)); color: var(--deck-text); }
.fl-shell .mrid-title .mrid-icon.is-deck { background: linear-gradient(140deg, var(--deck-text), var(--deck)); color: #fff; }
.fl-shell .mrid-chip { background: var(--fl-card); border: 1px solid var(--fl-line); box-shadow: var(--fl-shadow-1); padding: 5px 12px; font-size: 12.5px; }
.fl-shell .mrid-drill .mrid-chip { background: color-mix(in srgb, var(--fl-blue) 10%, var(--fl-card)); box-shadow: none; }
.fl-shell .mrid-dash { gap: var(--fl-s5); margin-top: var(--fl-s5); }
.fl-shell .mrid-kpis { gap: var(--fl-s5); grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); }
.fl-shell .mrid-kpi { position: relative; overflow: hidden; display: flex !important; flex-direction: column; justify-content: flex-start !important; align-items: stretch; padding: 18px 18px 38px !important; border: 1px solid var(--fl-line) !important; border-top: 1px solid var(--fl-line) !important;
  border-radius: var(--fl-r-lg) !important; background: var(--fl-card) !important; box-shadow: var(--fl-shadow-1) !important; transition: transform 0.22s var(--fl-ease), box-shadow 0.22s var(--fl-ease) !important; }
.fl-shell .mrid-kpi::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 30px; pointer-events: none; background: var(--kpi); opacity: 0.16;
  -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 30' preserveAspectRatio='none'%3E%3Cpath d='M0,20 C40,6 70,28 110,15 C145,4 170,10 200,3 L200,30 L0,30 Z'/%3E%3C/svg%3E") center / 100% 100% no-repeat;
          mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 30' preserveAspectRatio='none'%3E%3Cpath d='M0,20 C40,6 70,28 110,15 C145,4 170,10 200,3 L200,30 L0,30 Z'/%3E%3C/svg%3E") center / 100% 100% no-repeat; }
.fl-shell button.mrid-kpi:hover { transform: translateY(-3px) !important; box-shadow: var(--fl-shadow-2) !important; }
.fl-shell button.mrid-kpi.is-on { outline: 2px solid var(--kpi) !important; outline-offset: 0 !important; box-shadow: 0 0 0 5px color-mix(in srgb, var(--kpi) 16%, transparent), var(--fl-shadow-2) !important; }
.fl-shell .mrid-kpi-head { gap: 10px; font-size: 13.5px; color: var(--text-soft); }
.fl-shell .mrid-kpi-head::before { content: ""; width: 34px; height: 34px; flex: none; border-radius: 50%;
  background: radial-gradient(circle, var(--kpi) 0 5px, color-mix(in srgb, var(--kpi) 16%, var(--fl-card)) 5.5px); }
.fl-shell .mrid-kpi-head .mrid-dot { display: none; }
.fl-shell .mrid-kpi-head:has(.instr-lamp)::before { display: none; }
.fl-shell .mrid-kpi-value { font-size: 32px !important; letter-spacing: -0.02em; margin: 8px 0 2px !important; font-variant-numeric: tabular-nums; }
.fl-shell .mrid-kpi-hint { color: var(--fl-blue); }
.fl-shell .mrid-panel { padding: 20px 22px !important; border-radius: var(--fl-r-lg) !important; background: var(--fl-card) !important; border: 1px solid var(--fl-line); box-shadow: var(--fl-shadow-1) !important; transition: box-shadow 0.22s var(--fl-ease); }
.fl-shell .mrid-panel:hover { box-shadow: var(--fl-shadow-2) !important; }
.fl-shell .mrid-panel-head { margin-bottom: 12px; }
.fl-shell .mrid-panel-head h3 { font-size: 16px; font-weight: 600; letter-spacing: -0.01em; }
.fl-shell .mrid-table th { font-size: 11.5px; font-weight: 600; color: var(--text-soft); padding: 9px 10px; border-bottom: 1px solid var(--fl-line); background: color-mix(in srgb, var(--fl-blue) 4%, var(--fl-card)); }
.fl-shell .mrid-table th:first-child { border-radius: 10px 0 0 10px; } .fl-shell .mrid-table th:last-child { border-radius: 0 10px 10px 0; }
.fl-shell .mrid-table td { padding: 10px; border-bottom: 1px solid var(--fl-line); color: var(--text); }
.fl-shell .mrid-table .mrid-soft { color: var(--text-soft); }
.fl-shell .mrid-table .mrid-over { color: var(--fl-red); } .fl-shell .mrid-table .mrid-ok { color: var(--fl-green); }
.fl-shell .mrid-table tbody tr { transition: background 0.15s; }
.fl-shell .mrid-table tbody tr:hover td { background: color-mix(in srgb, var(--fl-blue) 5%, transparent); }
.fl-shell .mrid-tabs { background: color-mix(in srgb, var(--fl-blue) 9%, var(--fl-card)); border-radius: 999px; padding: 3px; }
.fl-shell .mrid-tabs button { border-radius: 999px !important; padding: 5px 13px !important; font: 600 12px var(--fl-font) !important; box-shadow: none !important; background: transparent !important; color: var(--text-soft) !important; border: 0 !important; }
.fl-shell .mrid-tabs button.is-on { background: var(--fl-card) !important; color: var(--fl-blue) !important; box-shadow: 0 1px 4px color-mix(in srgb, var(--fl-navy) 16%, transparent) !important; }
.fl-shell .mrid-formula { background: color-mix(in srgb, var(--fl-blue) 8%, var(--fl-card)); border-radius: 10px; }
.fl-shell .mrid-legend { gap: 8px 18px; }

.fl-shell .mrid-story { border-radius: var(--fl-r-lg); padding: 16px 20px; background: linear-gradient(110deg, color-mix(in srgb, var(--fl-blue) 7%, var(--fl-card)), var(--fl-card) 60%);
  border: 1px solid var(--fl-line); box-shadow: var(--fl-shadow-1); }
.fl-shell .mrid-story li { font-size: 13.5px; }
.fl-shell .mrid-story-tag { display: inline-flex; justify-content: center; min-width: 124px; padding: 2px 10px; border-radius: 999px; font-size: 10.5px; }
.fl-shell .mrid-story li.is-attention .mrid-story-tag { background: color-mix(in srgb, var(--fl-red) 12%, transparent); }
.fl-shell .mrid-story li.is-worse .mrid-story-tag { background: color-mix(in srgb, var(--warn) 14%, transparent); }
.fl-shell .mrid-story li.is-better .mrid-story-tag { background: color-mix(in srgb, var(--fl-green) 13%, transparent); }
.fl-shell .mrid-story li.is-info .mrid-story-tag { background: color-mix(in srgb, var(--fl-blue) 12%, transparent); }
.fl-shell .mrid-flow-step { border-radius: 14px !important; background: color-mix(in srgb, var(--kpi) 7%, var(--fl-card)) !important; border: 1px solid color-mix(in srgb, var(--kpi) 20%, transparent) !important;
  box-shadow: none !important; padding: 12px 14px !important; font-family: var(--fl-font) !important; transition: transform 0.2s var(--fl-ease), box-shadow 0.2s var(--fl-ease) !important; }
.fl-shell .mrid-flow-step::before { display: none; }
.fl-shell .mrid-flow-step:not(:disabled):hover { transform: translateY(-2px); box-shadow: var(--fl-shadow-2) !important; }
.fl-shell .mrid-panel select, .fl-shell .mrid-panel input:not([type="checkbox"]):not([type="radio"]) { height: 34px !important; padding: 0 10px !important; font-size: 13px !important; }
.fl-shell .mrid-panel .mrid-field > span, .fl-shell .mrid-inline > span { font-size: 11px; font-weight: 600; color: var(--text-soft); text-transform: uppercase; letter-spacing: 0.04em; }
/* Buttons and fields inside the dashboards: Fluent subtle style */
.fl-shell button.ghost, .fl-shell .mrid .mrid-more, .fl-shell .mrid .mrid-preview-btn, .fl-shell .mrid-export > button {
  background: var(--fl-card) !important; color: var(--text) !important; border: 1px solid var(--fl-line) !important; box-shadow: 0 1px 2px color-mix(in srgb, var(--fl-navy) 8%, transparent) !important;
  border-radius: 8px !important; font-family: var(--fl-font) !important; font-weight: 600 !important; transition: background 0.15s, border-color 0.15s, transform 0.12s !important; }
.fl-shell button.ghost:hover, .fl-shell .mrid .mrid-more:hover, .fl-shell .mrid .mrid-preview-btn:hover, .fl-shell .mrid-export > button:hover {
  background: color-mix(in srgb, var(--fl-blue) 7%, var(--fl-card)) !important; border-color: color-mix(in srgb, var(--fl-blue) 40%, transparent) !important; }
.fl-shell button.ghost:active { transform: scale(0.97); }
.fl-shell .mrid-export > button { padding: 7px 14px !important; }
.fl-shell .mrid select, .fl-shell .mrid input:not([type="checkbox"]):not([type="radio"]) {
  background: var(--fl-card) !important; color: var(--text) !important; border: 1px solid var(--fl-line) !important; border-bottom-color: color-mix(in srgb, var(--text) 28%, transparent) !important;
  box-shadow: none !important; border-radius: 8px !important; font-family: var(--fl-font) !important; }
.fl-shell .mrid select:focus, .fl-shell .mrid input:focus { border-color: var(--fl-blue) !important; box-shadow: 0 0 0 3px color-mix(in srgb, var(--fl-blue) 18%, transparent) !important; }
.fl-shell .mrid-field > span { font-size: 11px !important; letter-spacing: 0.04em; }
.fl-shell .combobox-panel, .fl-shell .mrid-export-menu { border-radius: 12px !important; border: 1px solid var(--fl-line) !important; background: var(--fl-card) !important; box-shadow: var(--fl-shadow-2) !important; padding: 4px; animation: fl-drop 0.18s var(--fl-ease); }
.fl-shell .combobox-option { border-radius: 8px; }

/* Dashboard catalogue cards (MR-I and User Analytics selection screen) */
.fl-shell .mrid-groups { gap: var(--fl-s6); }
.fl-shell .mrid-group-title { display: flex; align-items: center; gap: 10px; font-size: 13px; margin-bottom: 12px; }
.fl-shell .mrid-group-title::after { content: ""; flex: 1; height: 1px; background: var(--fl-line); }
.fl-shell .mrid-grid { gap: var(--fl-s4); grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); }
.fl-shell .mrid-card { padding: 16px 16px 16px 18px !important; border-radius: var(--fl-r-lg) !important; background: var(--fl-card) !important; border: 1px solid var(--fl-line) !important;
  box-shadow: var(--fl-shadow-1) !important; gap: 14px; transition: transform 0.22s var(--fl-ease), box-shadow 0.22s var(--fl-ease) !important; }
.fl-shell .mrid-card.is-deck { box-shadow: inset 4px 0 0 var(--deck), var(--fl-shadow-1) !important; }
.fl-shell .mrid-card-live:hover { transform: translateY(-3px) !important; box-shadow: var(--fl-shadow-2) !important; }
.fl-shell .mrid-card.is-deck.mrid-card-live:hover { box-shadow: inset 4px 0 0 var(--deck), var(--fl-shadow-2) !important; }
.fl-shell .mrid-card-title { font-size: 14.5px; }
.fl-shell .mrid-card-go { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; font-size: 18px; background: color-mix(in srgb, var(--fl-blue) 8%, var(--fl-card)); color: var(--fl-blue); }
.fl-shell .mrid-card-live:hover .mrid-card-go { background: var(--fl-blue); color: #fff; transform: translateX(2px); }
.fl-shell .mrid-key { font-size: 12.5px; }

/* Loading: animated ring instead of text only */
.fl-shell .empty { display: flex; align-items: center; justify-content: center; gap: 10px; min-height: 120px; border-radius: var(--fl-r-lg); color: var(--text-soft);
  background: var(--fl-card); border: 1px dashed var(--fl-line); font-family: var(--fl-font); }
.fl-spinner { width: 20px; height: 20px; border-radius: 50%; border: 2.5px solid color-mix(in srgb, var(--fl-blue) 20%, transparent); border-top-color: var(--fl-blue); animation: fl-spin 0.8s linear infinite; }

/* Asset MR-I History inside the shell */
.fl-shell .mri-history-grid { gap: var(--fl-s4); }


/* ===================================================================================
   Asset MR-I History inside the shell
   =================================================================================== */
.fl-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 16px; padding: 12px 14px; border-radius: var(--fl-r-lg); background: var(--fl-card); border: 1px solid var(--fl-line); box-shadow: var(--fl-shadow-1); }
.fl-toolbar-search { flex: 1 1 260px; width: auto; }
.fl-shell .fl-toolbar-search input { box-shadow: none !important; background: color-mix(in srgb, var(--fl-blue) 4%, var(--fl-card)) !important; }
.fl-asset-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: var(--fl-s5); }
.fl-shell .fl-asset { all: unset; box-sizing: border-box; position: relative; overflow: hidden; display: flex !important; flex-direction: column; gap: 14px; padding: 18px 18px 16px !important;
  border-radius: var(--fl-r-lg) !important; background: var(--fl-card) !important; border: 1px solid var(--fl-line) !important; box-shadow: var(--fl-shadow-1) !important; cursor: pointer;
  font-family: var(--fl-font); color: var(--text); transition: transform 0.22s var(--fl-ease), box-shadow 0.22s var(--fl-ease); animation: fl-in 0.4s var(--fl-ease) both; }
.fl-shell .fl-asset::before { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 4px; background: linear-gradient(90deg, var(--tone), color-mix(in srgb, var(--tone) 30%, transparent)); }
.fl-shell .fl-asset:hover { transform: translateY(-3px); box-shadow: var(--fl-shadow-2) !important; }
.fl-shell .fl-asset:active { transform: translateY(-1px) scale(0.995); }
.fl-asset-top { display: flex; align-items: center; gap: 12px; }
.fl-asset-name { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.fl-asset-name b { font-size: 16px; font-weight: 700; letter-spacing: -0.01em; }
.fl-asset-name small { font-size: 12.5px; color: var(--text-soft); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fl-asset-stats { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; font-size: 12.5px; color: var(--text-soft); }
.fl-asset-count b { font-size: 15px; color: var(--text); font-variant-numeric: tabular-nums; }
.fl-asset-date { margin-left: auto; }
.fl-asset-trig { display: flex; flex-direction: column; gap: 7px; padding: 10px 12px; border-radius: 12px; background: color-mix(in srgb, var(--fl-blue) 4%, var(--fl-card)); }
.fl-asset-trow { display: grid; grid-template-columns: 16px minmax(0, 1fr) 70px auto; align-items: center; gap: 8px; font-size: 12px; }
.fl-asset-tico { display: inline-flex; } .fl-asset-tico svg { width: 15px; height: 15px; }
.fl-asset-tlabel { color: var(--text-soft); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fl-asset-trow .fl-meter { width: 70px; }
.fl-asset-tval { font-weight: 600; font-variant-numeric: tabular-nums; color: var(--text); }
.fl-asset-go { display: inline-flex; align-items: center; gap: 2px; align-self: flex-end; margin-top: auto; font-size: 12.5px; font-weight: 600; color: var(--fl-blue); transition: gap 0.2s var(--fl-ease); }
.fl-asset-go svg { width: 15px; height: 15px; }
/* FB-030: compact cards in Asset MR-I History */
.fl-asset-grid.is-compact { grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: var(--fl-s3); }
.fl-shell .fl-asset.is-compact { gap: 8px; padding: 12px 12px 10px !important; border-radius: var(--fl-r-md) !important; animation: none; }
.fl-shell .fl-asset.is-compact::before { height: 3px; }
.fl-shell .fl-asset.is-compact:hover { transform: translateY(-2px); }
.fl-asset.is-compact .fl-asset-top { gap: 9px; }
.fl-asset.is-compact .fl-asset-pic { width: 38px; height: 38px; padding: 3px; border-radius: 10px; }
.fl-asset.is-compact .fl-ico { width: 34px; height: 34px; } .fl-asset.is-compact .fl-ico svg { width: 18px; height: 18px; }
.fl-asset.is-compact .fl-asset-name b { font-size: 14px; }
.fl-asset.is-compact .fl-asset-name small { font-size: 11.5px; }
.fl-asset.is-compact .fl-asset-stats { gap: 6px 8px; font-size: 11.5px; }
.fl-asset.is-compact .fl-asset-count b { font-size: 13px; }
.fl-asset.is-compact .fl-pill { font-size: 11px; padding-block: 1px; }
.fl-cnt-mini { display: flex; flex-wrap: wrap; gap: 4px; }
.fl-cnt-mini .fl-cnt-level { height: 18px; padding: 0 7px; font-size: 10.5px; }
.fl-shell .fl-asset:hover .fl-asset-go { gap: 6px; }
.fl-asset-head { display: flex; flex-wrap: wrap; align-items: center; gap: 14px 18px; padding: 20px 22px; border-radius: var(--fl-r-lg); background: var(--fl-card); border: 1px solid var(--fl-line); box-shadow: var(--fl-shadow-1); }
.fl-asset-head .fl-ico.lg { border-radius: 50%; }
.fl-asset-pic { width: 56px; height: 56px; flex: none; box-sizing: border-box; padding: 5px; border-radius: 14px; display: grid; place-items: center;
  background: color-mix(in srgb, var(--tone, var(--fl-blue)) 8%, #fff); border: 1.5px solid color-mix(in srgb, var(--tone, var(--fl-blue)) 45%, transparent); }
.fl-asset-pic img { width: 100%; height: 100%; object-fit: contain; display: block; }
.fl-asset-pic.lg { width: 72px; height: 72px; border-radius: 18px; padding: 6px; }
.fl-asset-headtext { flex: 1; min-width: 220px; }
.fl-asset-headtext h2 { margin: 0; display: flex; align-items: center; gap: 12px; font-size: 22px; font-weight: 700; letter-spacing: -0.02em; }
.fl-asset-headtext p { margin: 3px 0 0; font-size: 13.5px; color: var(--text-soft); }
.fl-asset-headtools { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.fl-section-title.fl-gap { margin: 26px 0 0; }
/* counters (stat cards) */
.fl-shell .mri-stat-grid { gap: var(--fl-s5); margin-top: 12px; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
.fl-shell .mri-stat-card { position: relative; overflow: hidden; padding: 18px 20px 30px !important; border-radius: var(--fl-r-lg) !important; background: var(--fl-card) !important; border: 1px solid var(--fl-line) !important;
  box-shadow: var(--fl-shadow-1) !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; transition: transform 0.22s var(--fl-ease), box-shadow 0.22s var(--fl-ease); }
.fl-shell .mri-stat-card:hover { transform: translateY(-3px); box-shadow: var(--fl-shadow-2) !important; }
.fl-shell .mri-stat-card::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 24px; pointer-events: none; background: var(--fl-blue); opacity: 0.1;
  -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 30' preserveAspectRatio='none'%3E%3Cpath d='M0,20 C40,6 70,28 110,15 C145,4 170,10 200,3 L200,30 L0,30 Z'/%3E%3C/svg%3E") center / 100% 100% no-repeat;
          mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 30' preserveAspectRatio='none'%3E%3Cpath d='M0,20 C40,6 70,28 110,15 C145,4 170,10 200,3 L200,30 L0,30 Z'/%3E%3C/svg%3E") center / 100% 100% no-repeat; }
.fl-shell .mri-kpi-head .mri-stat-icon { width: 38px; height: 38px; }
.fl-shell .mri-stat-label { font-size: 13.5px; }
.fl-shell .mri-kpi-value { font-size: 30px; }
.fl-shell .mri-kpi-track { background: var(--fl-line); height: 8px; }
.fl-shell .mri-kpi-fill { transition: width 0.9s var(--fl-ease); }
/* report timeline */
.fl-shell .mri-report-timeline { margin-top: 14px; padding-left: 36px; }
.fl-shell .mri-report-timeline::before { left: 11px; width: 3px; border-radius: 3px; background: linear-gradient(180deg, var(--fl-blue), color-mix(in srgb, var(--fl-cyan) 40%, transparent)); }
.fl-shell .mri-report-item { margin-bottom: 16px; animation: fl-in 0.4s var(--fl-ease) both; }
.fl-shell .mri-report-item:nth-child(2) { animation-delay: 0.05s; } .fl-shell .mri-report-item:nth-child(3) { animation-delay: 0.1s; } .fl-shell .mri-report-item:nth-child(n+4) { animation-delay: 0.15s; }
.fl-shell .mri-report-dot { left: -31px; top: 30px; width: 14px; height: 14px; box-shadow: 0 0 0 4px var(--fl-bg), 0 0 0 6px color-mix(in srgb, var(--fl-blue) 18%, transparent); }
.fl-shell .mri-report-card { padding: 30px 22px 18px !important; border-radius: var(--fl-r-lg) !important; background: var(--fl-card) !important; border: 1px solid var(--fl-line) !important;
  box-shadow: var(--fl-shadow-1) !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; gap: 18px; transition: transform 0.22s var(--fl-ease), box-shadow 0.22s var(--fl-ease); }
.fl-shell .mri-report-card:hover { transform: translateX(3px); box-shadow: var(--fl-shadow-2) !important; }
.fl-shell .mri-report-icon { width: 44px; height: 44px; box-shadow: 0 6px 14px color-mix(in srgb, var(--fl-navy) 16%, transparent); }
.fl-shell .mri-report-title { font-size: 15.5px; letter-spacing: -0.01em; }
.fl-shell .mri-report-readings { top: 10px; right: 16px; }
.fl-shell .trigger-icon-chip { border-radius: 999px !important; background: color-mix(in srgb, var(--fl-blue) 7%, var(--fl-card)) !important; border: 1px solid var(--fl-line) !important; box-shadow: none !important; }
.fl-shell .mri-report-issues { font-weight: 600; }
.fl-shell .mri-report-key-issue { border-radius: 999px; }
.fl-shell .mri-report-view-btn { background: var(--fl-card) !important; color: var(--fl-blue) !important; border: 1px solid color-mix(in srgb, var(--fl-blue) 35%, transparent) !important;
  box-shadow: none !important; border-radius: 999px !important; padding: 7px 14px !important; font-family: var(--fl-font) !important; transition: background 0.15s, color 0.15s, transform 0.12s !important; }
.fl-shell .mri-report-view-btn:hover { background: var(--fl-blue) !important; color: #fff !important; }
.fl-shell .mri-report-view-btn.danger { background: var(--fl-red) !important; color: #fff !important; border-color: transparent !important; }
.fl-shell .mri-report-view-btn:active { transform: scale(0.97); }


/* ---------- dark themes: the sidebar turns dark too ----------
   A deep blue-grey panel with a faint blue glow; the selected item is tinted with the theme blue
   instead of a white pill, so nothing bright sits next to the dark dashboards. */
.app[data-theme="dark"] .fl-shell, .app[data-theme="macos-dark"] .fl-shell {
  --fl-side-bg: linear-gradient(175deg, color-mix(in srgb, var(--fl-blue) 10%, #121826) 0%, #141b29 55%, color-mix(in srgb, var(--fl-blue) 14%, #121826) 100%);
}
.app[data-theme="dark"] .fl-side, .app[data-theme="macos-dark"] .fl-side { border-right: 1px solid color-mix(in srgb, #fff 7%, transparent); }
.app[data-theme="dark"] .fl-hero, .app[data-theme="macos-dark"] .fl-hero {
  background: linear-gradient(118deg, color-mix(in srgb, var(--fl-blue) 30%, #0d1424) 0%, color-mix(in srgb, var(--fl-blue) 55%, #0d1424) 52%, color-mix(in srgb, var(--fl-cyan) 45%, #0d1424) 100%);
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.35); }
.app[data-theme="dark"] .fl-side::before, .app[data-theme="macos-dark"] .fl-side::before { background: radial-gradient(circle, color-mix(in srgb, var(--fl-blue) 22%, transparent), transparent 68%); }
.app[data-theme="dark"] .fl-side::after, .app[data-theme="macos-dark"] .fl-side::after { background: radial-gradient(circle, color-mix(in srgb, var(--fl-blue) 12%, transparent), transparent 70%); }
.app[data-theme="dark"] .fl-shell .fl-nav-item, .app[data-theme="macos-dark"] .fl-shell .fl-nav-item,
.app[data-theme="dark"] .fl-shell .fl-sub-item, .app[data-theme="macos-dark"] .fl-shell .fl-sub-item { color: rgba(226, 232, 245, 0.78) !important; }
.app[data-theme="dark"] .fl-shell .fl-nav-item:hover, .app[data-theme="macos-dark"] .fl-shell .fl-nav-item:hover,
.app[data-theme="dark"] .fl-shell .fl-sub-item:hover, .app[data-theme="macos-dark"] .fl-shell .fl-sub-item:hover { background: rgba(255, 255, 255, 0.06) !important; color: #fff !important; }
.app[data-theme="dark"] .fl-shell .fl-nav-item.is-on, .app[data-theme="macos-dark"] .fl-shell .fl-nav-item.is-on,
.app[data-theme="dark"] .fl-shell .fl-sub-item.is-on, .app[data-theme="macos-dark"] .fl-shell .fl-sub-item.is-on,
.app[data-theme="dark"] .fl-shell .fl-acc.has-active .fl-acc-rail, .app[data-theme="macos-dark"] .fl-shell .fl-acc.has-active .fl-acc-rail {
  background: color-mix(in srgb, var(--fl-blue) 24%, transparent) !important; color: #fff !important; box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--fl-blue) 45%, transparent) !important; }
.app[data-theme="dark"] .fl-shell .fl-nav-item.is-on::before, .app[data-theme="macos-dark"] .fl-shell .fl-nav-item.is-on::before,
.app[data-theme="dark"] .fl-shell .fl-sub-item.is-on::before, .app[data-theme="macos-dark"] .fl-shell .fl-sub-item.is-on::before { background: var(--fl-blue); }
.app[data-theme="dark"] .fl-nav-sep, .app[data-theme="macos-dark"] .fl-nav-sep { color: rgba(226, 232, 245, 0.45); }
.app[data-theme="dark"] .fl-acc-inner, .app[data-theme="macos-dark"] .fl-acc-inner { border-left-color: rgba(255, 255, 255, 0.10); }
.app[data-theme="dark"] .fl-acc-count, .app[data-theme="macos-dark"] .fl-acc-count { background: rgba(255, 255, 255, 0.08); }
.app[data-theme="dark"] .fl-logo, .app[data-theme="macos-dark"] .fl-logo { color: #fff; background: linear-gradient(145deg, var(--fl-blue), color-mix(in srgb, var(--fl-blue) 55%, var(--fl-cyan))); box-shadow: 0 6px 16px rgba(0, 0, 0, 0.35); }
.app[data-theme="dark"] .fl-status, .app[data-theme="macos-dark"] .fl-status,
.app[data-theme="dark"] .fl-me, .app[data-theme="macos-dark"] .fl-me { background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.06); }
.app[data-theme="dark"] .fl-side .fl-avatar, .app[data-theme="macos-dark"] .fl-side .fl-avatar { color: #fff; background: linear-gradient(145deg, var(--fl-blue), color-mix(in srgb, var(--fl-blue) 50%, var(--fl-cyan))); }
.app[data-theme="dark"] .fl-side:hover::-webkit-scrollbar-thumb, .app[data-theme="macos-dark"] .fl-side:hover::-webkit-scrollbar-thumb { background-color: rgba(255, 255, 255, 0.22); }

/* ---------- responsive ---------- */
@container (max-width: 1180px) {
  .fl-grid-3 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .fl-grid-2 { grid-template-columns: minmax(0, 1fr); }
}
@container (max-width: 1020px) {
  .fl-shell { --fl-side-w: 76px; }
  .fl-side { padding: 18px 10px; align-items: center; }
  .fl-side .fl-nav-label, .fl-side .fl-brand-text, .fl-nav-sep { display: none; }
  .fl-shell .fl-nav-item { justify-content: center; padding: 11px !important; }
  .fl-shell .fl-nav-item.is-on::before { left: -10px; }
  .fl-status, .fl-me { padding: 8px; justify-content: center; }
  .fl-status-dot { margin: 0; }
  .fl-shell .fl-acc-head, .fl-acc-body { display: none !important; }
  .fl-shell .fl-acc-rail { display: flex !important; }
  .fl-shell .fl-acc.has-active .fl-acc-rail { background: rgba(255,255,255,0.96) !important; color: var(--fl-navy) !important; }
  .fl-hero-side { display: none; }
}
@container (max-width: 760px) {
  .fl-shell { grid-template-columns: minmax(0, 1fr); }
  .fl-side { position: absolute; left: 0; top: 0; bottom: 0; width: 260px; align-items: stretch; transform: translateX(-105%); transition: transform 0.28s var(--fl-ease); box-shadow: 0 0 40px rgba(0,0,0,0.25); }
  .fl-shell.nav-open .fl-side { transform: none; }
  .fl-side .fl-nav-label, .fl-side .fl-brand-text, .fl-nav-sep { display: flex; }
  .fl-nav-sep { display: block; }
  .fl-shell .fl-nav-item { justify-content: flex-start; padding: 10px 12px !important; }
  .fl-shell .fl-acc-head { display: flex !important; }
  .fl-acc-body { display: grid !important; }
  .fl-shell .fl-acc-rail { display: none !important; }
  .fl-status, .fl-me { justify-content: flex-start; }
  .fl-shell .fl-scrim { all: unset; position: absolute; inset: 0; z-index: 15; background: rgba(10,20,40,0.35); }
  .fl-shell .fl-burger { display: grid !important; }
  .fl-header { padding: 14px 16px 10px; flex-wrap: wrap; }
  .fl-titles h1 { font-size: 21px; }
  .fl-header-tools { width: 100%; }
  .fl-search { flex: 1; width: auto; }
  .fl-page { padding: 4px 16px 28px; gap: 16px; }
  .fl-hero { padding: 22px 20px; }
  .fl-grid-3 { grid-template-columns: minmax(0, 1fr); }
  .fl-kpis { grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
}
@container (min-width: 2200px) {
  .fl-shell { --fl-side-w: 280px; font-size: 15px; }
  .fl-page { max-width: 2400px; padding-left: 48px; padding-right: 48px; }
  .fl-kpis { grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
}
`;
