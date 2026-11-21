import { FL_TOKENS } from "./fluentTokens";
import rajdhani500 from "../assets/fonts/holo/rajdhani-latin-500-normal.woff2";
import rajdhani600 from "../assets/fonts/holo/rajdhani-latin-600-normal.woff2";
import rajdhani700 from "../assets/fonts/holo/rajdhani-latin-700-normal.woff2";
import shareTechMono from "../assets/fonts/holo/share-tech-mono-latin-400-normal.woff2";

// "Holo HUD" theme (Holo HUD checklist): a dark, holographic look for the whole app.
// It is an extra theme, built the same way as Fluent: nothing here changes a screen's layout,
// fields or behaviour, only how they look. Everything is scoped to the theme, so Light, Dark,
// macOS and Fluent are not touched.
//  Item 7   this file, scoped to html[data-holo] / [data-theme="holo"], loaded in App.tsx after Fluent
//  Item 8   theme tokens: every token the app uses gets a Holo HUD value (text contrast 4.5:1 or more)
//  Item 9   fonts: Rajdhani (headings, labels) and Share Tech Mono (codes, numbers), shipped inside
//           MMS (SIL Open Font Licence, files in assets/fonts/holo), so the theme works offline
//  Item 10  backdrop and helpers: grid-and-glow background, cut-corner shapes, glow, focus ring,
//           scrollbars, selection, and motion switched off when Windows animations are off
//  Item 16  tag lamps glow in their own colour, Red pulses
//  Item 18  asset-type pictures: cyan tint, glow and a moving scan light (.asset-type-pic, .asset-select-icon)
//  Items 11-21  shared controls (group 2): no neumorphic look; buttons, fields, tick boxes, switches,
//           tabs, labels, boxes and shapes, tables, pop-ups, empty states, as in the Holo HUD mockup,
//           with the same selectors, sizes and layout as Fluent
//  Items 22-29  screens (group 3): sign-in, main menu KPIs and handle, asset registry, MR-I queues,
//           wizard and flow screens (.fx), template builder, Administration and Support viewer,
//           Dashboard area (.fl-shell), idle screen, Help and Send to IT
//  Items 30-32  charts (recharts look), status colours, dark distance map (also DistanceMapField.tsx)

/** The page root carries data-holo while Holo HUD is picked (set in App.tsx), so pop-ups drawn
 *  outside the app frame (side drawers, dialogs) are covered as well. */
const H = "html[data-holo]";

/** Skip the Dashboard area and the flow screens for now: they style themselves (screens, group 3). */
const X = ":not(.fl-shell *):not(.fx *)";
/** Scope a comma list of selectors to Holo HUD, outside the dashboards/flows, with an optional state (":hover"). */
const S = (sels: string, state = "") => sels.split(",").map((x) => `${H} ${x.trim()}${X}${state}`).join(", ");
/** Buttons that have their own look (menu tiles, nav items, pickers ...) are styled in their own section (same list as Fluent). */
const SPECIAL = [".theme-fab", ".glass-button", ".mr-level-btn", ".page-btn", ".side-drawer-handle", ".neu-toggle", ".menu-card", ".uilab-fab",
  ".icon-btn", ".drawer-nav-btn", ".admin-group-header", ".admin-child-item", ".theme-option", ".kpi-footer-item", ".dashboard-tile", ".mri-history-card",
  /* Help menu buttons keep the Support Center's own layout */ ".sup-menu-item", ".sup-pill-btn", ".sup-help-btn"];
const NOT = SPECIAL.map((c) => `:not(${c})`).join("");
const BTN = "button" + NOT;
const CHEVRON = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M2.5 4.5 6 8l3.5-3.5' fill='none' stroke='%2339d5ff' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`;
const TEXT_INPUTS = 'input:not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="range"]):not([type="button"]):not([type="submit"]):not([type="color"]):not(.neu-check-input), textarea';

const CONTROLS = `
/* ====================================================================================
   Group 2: shared controls (items 11 to 21). Same selectors, sizes and layout as Fluent,
   with the look of the Holo HUD mockup: flat dark glass, thin cyan edges, cut corners,
   glow on what matters, no neumorphic shadows. The Dashboard area (.fl-shell) and the
   flow screens (.fx) style themselves and are done with the screens (group 3).
   ==================================================================================== */

/* ---------- item 11. No neumorphic look: shared surfaces used by the controls ---------- */
${H} {
  --field: var(--holo-field); --field-border: var(--holo-edge); --ctl: #0c1f2a; --row: rgba(57, 213, 255, 0.03);
  --side: #061019; --field-h: 36px; --field-px: 10px; --select-pr: 28px;
  /* segmented tabs (Cards / List, dashboard tabs, Support viewer tabs) */
  --seg-pad: 6px 14px; --seg-radius: 0; --seg-font: 13px; --seg-on-weight: 700; --seg-off-weight: 600;
  --seg-on-bg: rgba(57, 213, 255, 0.2); --seg-on-color: var(--holo-cyan); --seg-off-color: var(--text-soft);
  --seg-on-shadow: inset 0 0 0 1px var(--holo-edge); --seg-track-radius: 0; --seg-track-pad: 3px; --seg-border: 0;
}
${S(".inset-well, .mri-preview-form")} { background: var(--holo-field); box-shadow: inset 0 0 0 1px var(--holo-edge-soft); border-radius: 0; }
${S(".mri-stat-bar-track, .mri-preview-toggle")} { background: var(--chip-bg); }
${S(".instr-gauge")} { background: var(--holo-field); box-shadow: inset 0 0 0 1px var(--holo-edge-soft); border-radius: 0; }

/* ---------- item 12. Buttons: primary, secondary, ghost, danger, icon ---------- */
${S(BTN)} {
  font: 700 13.5px/1.2 var(--holo-display); letter-spacing: 0.1em; text-transform: uppercase; min-height: 36px; padding: 8px 16px;
  border-radius: 0; clip-path: var(--holo-cut-sm); color: var(--holo-cyan); background: var(--holo-field);
  border: 1px solid var(--holo-edge); box-shadow: none; cursor: pointer; transition: background .15s, border-color .15s, color .15s, transform .12s; }
${S(BTN, ":hover:not(:disabled)")} { background: rgba(57, 213, 255, 0.14); border-color: var(--holo-cyan); color: #9be9ff; }
${S(BTN, ":active:not(:disabled)")} { transform: scale(0.98); }
${S("button.primary" + NOT)} { color: #02070c; background: var(--holo-cyan); border-color: var(--holo-cyan); box-shadow: inset 0 0 12px rgba(255, 255, 255, 0.35); text-shadow: none; }
${S("button.primary" + NOT, ":hover:not(:disabled)")} { color: #02070c; background: #7fe6ff; border-color: #7fe6ff; }
${S("button.ghost" + NOT)} { color: var(--holo-cyan); background: transparent; border-color: transparent; clip-path: none; }
${S("button.ghost" + NOT, ":hover:not(:disabled)")} { background: rgba(57, 213, 255, 0.1); border-color: transparent; text-shadow: var(--holo-text-glow); }
${S("button.danger" + NOT)} { color: var(--danger); background: rgba(255, 92, 108, 0.08); border-color: rgba(255, 92, 108, 0.5); }
${S("button.danger" + NOT, ":hover:not(:disabled)")} { color: #ff8b96; background: rgba(255, 92, 108, 0.16); border-color: var(--danger); }
${S("button", ":disabled")} { opacity: 0.4; cursor: not-allowed; transform: none; }
${S("button.icon-btn")} { width: 38px; height: 38px; min-height: 0; padding: 0; display: inline-flex; align-items: center; justify-content: center;
  border-radius: 0; clip-path: var(--holo-cut-sm); color: var(--holo-cyan); background: var(--holo-field); border: 1px solid var(--holo-edge);
  box-shadow: none; cursor: pointer; transition: background .15s, border-color .15s, transform .15s; }
${S("button.icon-btn", ":hover:not(:disabled)")} { background: rgba(57, 213, 255, 0.16); border-color: var(--holo-cyan); transform: translateY(-1px); }
${S("button.icon-btn", ":active:not(:disabled)")} { transform: scale(0.96); }
${S("button.icon-btn svg")} { width: 18px; height: 18px; color: inherit; }
${S("button.icon-btn.icon-danger")} { color: var(--danger); background: rgba(255, 92, 108, 0.07); border-color: rgba(255, 92, 108, 0.45); }
${S("button.icon-btn.icon-danger svg")} { color: var(--danger); }
${S(".page-btn")} { min-width: 32px; height: 32px; padding: 0 10px; border-radius: 0; font: 400 13px/1 var(--mono); color: var(--text); background: var(--holo-field); border: 1px solid var(--holo-edge-soft); box-shadow: none; cursor: pointer; }
${S(".page-btn", ":hover:not(:disabled)")} { border-color: var(--holo-cyan); color: var(--holo-cyan); }
${S(".page-btn", ":disabled")} { opacity: 0.4; }
${S(".page-btn.page-num.active")} { color: #02070c; background: var(--holo-cyan); border-color: var(--holo-cyan); }
${S(".mr-level-btn")} { border-radius: 0; clip-path: var(--holo-cut-sm); color: var(--holo-cyan); background: var(--holo-field); border: 1px solid var(--holo-edge); box-shadow: none; font: 700 13px/1 var(--holo-display); letter-spacing: 0.1em; }
${S(".mr-level-btn", ":hover")} { background: rgba(57, 213, 255, 0.16); border-color: var(--holo-cyan); }

/* ---------- item 13. Fields: text boxes, search, drop-downs, text areas, dates, read-only ---------- */
${S(TEXT_INPUTS)} {
  box-sizing: border-box; min-height: 36px; padding: 7px 12px; border-radius: 0; border: 1px solid var(--holo-edge);
  background-color: var(--holo-field); color: var(--text); font: 500 13.5px/1.3 var(--sans); box-shadow: none; outline: none;
  transition: border-color .15s, box-shadow .15s; }
${S("textarea")} { line-height: 1.45; }
${S("select")} {
  -webkit-appearance: none; appearance: none; box-sizing: border-box; min-height: 36px; padding: 7px 32px 7px 12px; border-radius: 0;
  border: 1px solid var(--holo-edge); background-color: var(--holo-field); background-image: ${CHEVRON}; background-repeat: no-repeat;
  background-position: right 9px center; background-size: 12px 12px; color: var(--text); font: 500 13.5px/1.3 var(--sans); box-shadow: none; cursor: pointer; }
${S("select option")} { background: #061019; color: var(--text); }
${S(TEXT_INPUTS + ", select", ":hover:not(:disabled)")} { border-color: rgba(57, 213, 255, 0.6); }
${S(TEXT_INPUTS + ", select", ":focus")} { outline: none; border-color: var(--holo-cyan); box-shadow: 0 0 0 1px var(--holo-cyan), 0 0 14px rgba(57, 213, 255, 0.35); }
${S(TEXT_INPUTS + ", select", ":disabled")} { background-color: rgba(57, 213, 255, 0.02); border-style: dashed; border-color: var(--holo-edge-soft); color: var(--text-soft); opacity: 1; cursor: not-allowed; }
${S("input[readonly], textarea[readonly]")} { border-style: dashed; }
${S('input[type="date"], input[type="datetime-local"], input[type="time"], input[type="month"]')} { color-scheme: dark; }
${H} input${X}::placeholder, ${H} textarea${X}::placeholder { color: rgba(140, 184, 200, 0.7); }
${S(".field label")} { font: 700 12px/1.3 var(--holo-display); letter-spacing: 0.16em; text-transform: uppercase; color: var(--text-soft); margin-bottom: 5px; }
${S(".neu-select")} { --field-px: 8px; --select-pr: 22px; font-size: 12px; background-position: right 7px center; background-size: 10px 10px; }

/* ---------- item 14. Tick boxes, radio buttons, switches and tabs ---------- */
${S('input[type="checkbox"], input[type="radio"]')} { accent-color: var(--holo-cyan); }
${S(".neu-check-box")} { width: 18px; height: 18px; border-radius: 0; background: var(--holo-field); border: 1.5px solid var(--holo-edge); box-shadow: none; }
${S(".neu-check-input:checked + .neu-check-box")} { background: var(--holo-cyan); border-color: var(--holo-cyan); color: #02070c; box-shadow: 0 0 10px rgba(57, 213, 255, 0.5); }
${S(".neu-check-input:focus-visible + .neu-check-box")} { box-shadow: 0 0 0 2px var(--holo-cyan); }
${S(".neu-toggle")} { width: 42px; height: 22px; min-height: 0; padding: 0; border-radius: 0; clip-path: none; border: 1px solid var(--holo-edge); background: var(--holo-field); box-shadow: none; position: relative; cursor: pointer; transition: background .16s, border-color .16s; }
${S('.neu-toggle[data-on="true"]')} { background: rgba(57, 213, 255, 0.3); border-color: var(--holo-cyan); box-shadow: 0 0 10px rgba(57, 213, 255, 0.4); }
${S(".neu-toggle-knob")} { top: 3px; left: 3px; width: 14px; height: 14px; border-radius: 0; background: var(--text-soft); box-shadow: none; transition: transform .16s, background .16s; }
${S('.neu-toggle[data-on="true"] .neu-toggle-knob')} { transform: translateX(20px); background: var(--holo-cyan); box-shadow: 0 0 8px var(--holo-cyan); }
${S('[role="switch"]:not(.neu-toggle), [role="radio"]')} { border-radius: 0 !important; }
${S('[role="tablist"]')} { border-radius: 0 !important; }
${S('[role="tab"]')} { font-family: var(--holo-display) !important; letter-spacing: 0.1em; text-transform: uppercase; border-radius: 0 !important; }
${S('[role="tab"][aria-selected="true"]')} { text-shadow: var(--holo-text-glow); }
${S('[role="group"] > button[aria-pressed="true"]')} { text-shadow: var(--holo-text-glow); }

/* ---------- item 15. Labels and chips: Active / Inactive, country, type, status, trigger counters ---------- */
${S(".pill")} { font: 400 11.5px/1.2 var(--mono); letter-spacing: 0.06em; text-transform: uppercase; padding: 3px 9px; border-radius: 0; border: 1px solid currentColor; }
${S(".pill.active")} { color: var(--holo-green); background: rgba(77, 255, 176, 0.08); border-color: rgba(77, 255, 176, 0.5); }
${S(".pill.inactive")} { color: var(--holo-red); background: rgba(255, 77, 94, 0.08); border-color: rgba(255, 77, 94, 0.5); }
${S(".pill.neutral")} { color: var(--holo-amber); background: rgba(255, 181, 71, 0.08); border-color: rgba(255, 181, 71, 0.45); font-family: var(--holo-display); font-weight: 600; font-size: 12.5px; letter-spacing: 0.1em; }
${S(".trigger-icon-chip")} { font-family: var(--mono); font-size: 12.5px; color: var(--text); background: rgba(57, 213, 255, 0.05); border: 1px solid var(--holo-edge-soft); border-radius: 0; padding: 3px 8px; }
${S(".dashboard-tile-badge")} { background: var(--chip-bg); color: var(--holo-cyan); border-radius: 0; font-family: var(--mono); }
${S(".code, .review-card-code, .review-card-issue-count")} { font-family: var(--mono); font-weight: 400; letter-spacing: 0.02em; color: var(--holo-cyan); text-shadow: 0 0 8px rgba(57, 213, 255, 0.55); font-variant-numeric: tabular-nums; }
${S(".review-card-desc")} { color: var(--text-soft); font-family: var(--holo-display); font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; }
${S(".wizard-steps")} { gap: 6px; }
${S(".wizard-step")} { border-radius: 0; padding: 6px 12px 6px 6px; font: 600 13.5px/1.2 var(--holo-display); letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-soft); }
${S(".wizard-step-dot")} { width: 26px; height: 26px; border-radius: 0; clip-path: var(--holo-cut-sm); font: 400 12px/1 var(--mono); background: var(--holo-field); color: var(--text-soft); box-shadow: inset 0 0 0 1px var(--holo-edge); }
${S(".wizard-step.active")} { color: var(--holo-cyan); background: rgba(57, 213, 255, 0.1); box-shadow: inset 2px 0 0 var(--holo-cyan); }
${S(".wizard-step.active .wizard-step-dot")} { background: var(--holo-cyan); color: #02070c; box-shadow: none; }
${S(".wizard-step.done .wizard-step-dot")} { background: var(--holo-green); color: #02070c; box-shadow: none; }

/* ---------- item 17. Boxes and shapes: panels, cards, tiles, side menus ---------- */
${S(".panel")} { background: var(--holo-panel); border: 1px solid var(--holo-edge); border-radius: 0; clip-path: var(--holo-cut-md); box-shadow: none; padding: 22px; }
${S(".panel.panel-flat")} { background: transparent; border-color: var(--holo-edge-soft); }
${S(".panel h2")} { font: 700 13px/1.3 var(--holo-display); letter-spacing: 0.2em; text-transform: uppercase; color: var(--holo-cyan); margin: 0 0 14px; text-shadow: none; }
${S(".card")} { background: rgba(8, 22, 32, 0.6); border: 1px solid var(--holo-edge-soft); border-radius: 0; box-shadow: none; }
${S(".menu-card, .review-card, .dashboard-tile, .mri-history-card, .mri-stat-card, .mri-report-card, .kpi-footer-item")} {
  background: linear-gradient(165deg, rgba(57, 213, 255, 0.07), rgba(2, 7, 12, 0.55) 60%), var(--holo-panel); border: 1px solid var(--holo-edge);
  border-radius: 0; clip-path: var(--holo-cut-md); box-shadow: none; backdrop-filter: none; -webkit-backdrop-filter: none;
  transition: transform .18s, border-color .18s, background .18s; }
${S(".menu-card, .review-card, .dashboard-tile, .mri-history-card, .kpi-footer-item", ":hover")} { transform: translateY(-2px); border-color: var(--holo-cyan); }
${S(".menu-card, .review-card, .dashboard-tile, .mri-history-card, .kpi-footer-item", ":active")} { transform: translateY(-1px); }
/* cards tinted by the unit's tag, as in the Asset registry mockup */
${S(".review-card:has(.instr-lamp.red)")} { border-color: rgba(255, 77, 94, 0.55); background: linear-gradient(165deg, rgba(255, 77, 94, 0.14), rgba(2, 7, 12, 0.55) 60%), var(--holo-panel); }
${S(".review-card:has(.instr-lamp.yellow)")} { border-color: rgba(255, 181, 71, 0.5); background: linear-gradient(165deg, rgba(255, 181, 71, 0.12), rgba(2, 7, 12, 0.55) 60%), var(--holo-panel); }
${S(".review-card:has(.instr-lamp.green)")} { border-color: rgba(77, 255, 176, 0.42); background: linear-gradient(165deg, rgba(77, 255, 176, 0.09), rgba(2, 7, 12, 0.55) 60%), var(--holo-panel); }
${S(".menu-icon-wrap, .dashboard-tile-icon")} { border-radius: 0; clip-path: var(--holo-cut-sm); color: var(--holo-cyan); background: rgba(57, 213, 255, 0.12); box-shadow: none; }
${S(".menu-card", ":hover .menu-icon-wrap")} { background: var(--holo-cyan); color: #02070c; }
${S(".menu-card h3, .dashboard-tile-title")} { font-family: var(--holo-display); font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text); }
${S(".menu-card p, .dashboard-tile-desc")} { color: var(--text-soft); }
${S(".admin-sidebar")} { background: var(--holo-panel); border: 1px solid var(--holo-edge); border-radius: 0; clip-path: var(--holo-cut-md); box-shadow: none; padding: 10px; }
${S(".admin-group-header, .admin-child-item")} { border-radius: 0; border: 0; border-left: 2px solid transparent; background: transparent; box-shadow: none; min-height: 0; color: var(--text); font: 600 14.5px/1.2 var(--holo-display); letter-spacing: 0.1em; text-transform: uppercase; cursor: pointer; }
${S(".admin-group-header, .admin-child-item", ":hover")} { background: rgba(57, 213, 255, 0.08); }
${S(".admin-child-item.active")} { color: var(--holo-cyan); border-left-color: var(--holo-cyan); background: linear-gradient(90deg, rgba(57, 213, 255, 0.22), transparent); box-shadow: none; text-shadow: var(--holo-text-glow); }
${S(".admin-nav-icon")} { background: rgba(57, 213, 255, 0.12); color: var(--holo-cyan); box-shadow: none; border-radius: 0; clip-path: var(--holo-cut-sm); }
${S(".admin-child-icon")} { color: var(--holo-cyan); }
${S(".header h1")} { font: 700 28px/1.2 var(--holo-display); letter-spacing: 0.12em; text-transform: uppercase; color: var(--text); }
${S(".header .sub, .header > span.sub")} { font: 400 13px/1.4 var(--mono); color: var(--text-soft); letter-spacing: 0; }
${H} .mri-report-timeline${X}::before { background: var(--holo-edge); }

/* ---------- item 19. Tables and lists ---------- */
${S(".grid-table")} { background: var(--holo-panel); border: 1px solid var(--holo-edge); border-radius: 0; box-shadow: none; overflow: hidden; }
${S(".grid-row")} { padding: 10px 14px; gap: 12px; font-size: 13.5px; border-bottom: 1px solid var(--holo-edge-soft); }
${S(".grid-row:last-child")} { border-bottom: 0; }
${S(".grid-row:not(.grid-head)", ":hover")} { background: var(--hover-highlight); }
${S(".grid-head")} { font: 700 12px/1.2 var(--holo-display); letter-spacing: 0.16em; text-transform: uppercase; color: var(--text-soft); background: rgba(57, 213, 255, 0.06); border-bottom: 1px solid var(--holo-edge); }
${S("table")} { border-collapse: separate; border-spacing: 0; }
${S("th")} { font: 700 12px/1.2 var(--holo-display); letter-spacing: 0.16em; text-transform: uppercase; color: var(--text-soft); text-align: left; background: rgba(57, 213, 255, 0.06); border-bottom: 1px solid var(--holo-edge); }
${S("td")} { border-bottom: 1px solid var(--holo-edge-soft); }
${S("tbody tr", ":hover")} { background: var(--hover-highlight); }
${S(".trigger-row + .trigger-row, .card + .card")} { border-top: 1px solid var(--holo-edge-soft); box-shadow: none; }
${S(".trigger-row.trigger-head")} { font: 700 12px/1.2 var(--holo-display); letter-spacing: 0.16em; text-transform: uppercase; color: var(--text-soft); }

/* ---------- item 20. Pop-ups: dialogs, messages, side drawer, theme picker, Help ---------- */
${S(".modal-overlay")} { background: rgba(1, 4, 8, 0.72); backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px); }
${S(".modal")} { background: #071520; border: 1px solid var(--holo-edge); border-radius: 0; clip-path: var(--holo-cut-lg); box-shadow: inset 0 0 40px rgba(57, 213, 255, 0.08); padding: 24px; }
${S(".modal h3")} { font: 700 19px/1.3 var(--holo-display); letter-spacing: 0.1em; text-transform: uppercase; color: var(--text); margin: 0 0 8px; }
${S(".modal p")} { font-size: 13.5px; line-height: 1.55; color: var(--text-soft); }
${S(".modal-icon")} { background: rgba(255, 92, 108, 0.12); color: var(--danger); box-shadow: none; border-radius: 0; clip-path: var(--holo-cut-sm); }
${S(".modal-actions")} { gap: 8px; }
${S(".toast")} { background: #071520; border: 1px solid var(--holo-edge); border-left: 3px solid var(--holo-cyan); border-radius: 0; box-shadow: none; padding: 10px 14px 10px 16px; font-size: 13.5px; color: var(--text); }
${S(".toast.ok")} { color: var(--holo-green); background: rgba(77, 255, 176, 0.07); border-color: rgba(77, 255, 176, 0.35); border-left-color: var(--holo-green); }
${S(".toast.err")} { color: #ff8b96; background: rgba(255, 92, 108, 0.08); border-color: rgba(255, 92, 108, 0.4); border-left-color: var(--danger); }
${S(".ui-nav")} { padding: 12px 18px 0; }
${S(".ui-nav > button, .ui-nav > .ghost")} { border-radius: 0 !important; clip-path: polygon(10px 0, 100% 0, 100% 100%, 0 100%, 0 10px); padding: 6px 14px !important; min-height: 32px;
  color: var(--holo-cyan) !important; background: var(--holo-field) !important; border: 1px solid var(--holo-edge) !important; box-shadow: none !important;
  font: 700 13px/1 var(--holo-display) !important; letter-spacing: 0.12em !important; text-transform: uppercase; }
${S(".ui-nav > button, .ui-nav > .ghost", ":hover")} { background: rgba(57, 213, 255, 0.16) !important; border-color: var(--holo-cyan) !important; }
${S(".user-badge")} { font: 600 14px/1.2 var(--holo-display); letter-spacing: 0.08em; color: var(--text); }
${S(".side-drawer-overlay")} { background: rgba(1, 4, 8, 0.6); backdrop-filter: blur(2px); }
${S(".side-drawer")} { background: #061019; border-left: 1px solid var(--holo-edge); box-shadow: -20px 0 50px rgba(0, 0, 0, 0.6); }
${S(".drawer-user-card")} { border-radius: 0; background: var(--holo-panel); border: 1px solid var(--holo-edge); box-shadow: none; color: var(--text); }
${S(".drawer-user-card:first-child")} { background: linear-gradient(135deg, rgba(57, 213, 255, 0.28), rgba(57, 213, 255, 0.06)); border-color: var(--holo-cyan); clip-path: var(--holo-cut-md); }
${S(".drawer-user-card:first-child .drawer-user-name")} { font-family: var(--holo-display); letter-spacing: 0.08em; text-shadow: var(--holo-text-glow); }
${S(".drawer-user-card:first-child button")} { color: var(--holo-cyan) !important; background: rgba(2, 7, 12, 0.4) !important; border: 1px solid var(--holo-edge) !important; box-shadow: none !important; border-radius: 0 !important; }
${S(".drawer-user-card:not(:first-child)", ":hover")} { border-color: var(--holo-cyan); }
${S(".drawer-section-label")} { font: 700 12px/1.2 var(--holo-display); letter-spacing: 0.18em; text-transform: uppercase; color: var(--text-soft); }
${S(".drawer-nav-btn")} { border-radius: 0; border: 0; border-left: 2px solid transparent; background: transparent; box-shadow: none; min-height: 0; color: var(--text); font: 600 14.5px/1.2 var(--holo-display); letter-spacing: 0.08em; cursor: pointer; }
${S(".drawer-nav-btn", ":hover")} { background: rgba(57, 213, 255, 0.08); border-left-color: var(--holo-cyan); }
${S(".drawer-nav-btn svg")} { color: var(--holo-cyan); }
${S(".side-drawer-handle:not(.side-drawer-handle-avatar)")} { background: #061019; border: 1px solid var(--holo-edge); border-right: 0; box-shadow: none; }
${S(".drawer-handle-avatar-info")} { background: #061019; border: 1px solid var(--holo-edge); border-left: 0; box-shadow: none; }
${S(".theme-fab")} { color: var(--holo-cyan); background: #061019; border: 1px solid var(--holo-edge); box-shadow: none; }
${S(".theme-fab", ":hover")} { border-color: var(--holo-cyan); box-shadow: var(--holo-glow); }
${S(".theme-picker, .gate-theme-picker")} { background: #061019; border: 1px solid var(--holo-edge); border-radius: 0; box-shadow: 0 12px 32px rgba(0, 0, 0, 0.6); }
${S(".theme-option")} { border-radius: 0; border: 0; background: transparent; box-shadow: none; min-height: 0; color: var(--text); font: 600 14px/1.2 var(--holo-display); letter-spacing: 0.08em; cursor: pointer; }
${S(".theme-option", ":hover")} { background: rgba(57, 213, 255, 0.08); }
${S(".theme-option.active")} { background: rgba(57, 213, 255, 0.2); color: var(--holo-cyan); box-shadow: inset 0 0 0 1px var(--holo-edge); }
${H} .trial-banner { font-family: var(--holo-display) !important; letter-spacing: 0.06em; color: var(--warn) !important; background: #071520 !important; border: 1px solid rgba(255, 181, 71, 0.45); border-radius: 0 !important; box-shadow: none !important; padding: 7px 14px !important; }

/* Help button and its menu (Support Center draws them with !important, hence !important here) */
${H} .sup-root .sup-help-btn { border-radius: 0 !important; clip-path: var(--holo-cut-sm); color: var(--holo-cyan) !important; background: rgba(6, 16, 25, 0.92) !important;
  border: 1px solid var(--holo-cyan) !important; box-shadow: inset 0 0 14px rgba(57, 213, 255, 0.25) !important; font-family: var(--holo-display) !important;
  font-weight: 700 !important; letter-spacing: 0.14em !important; text-transform: uppercase; }
${H} .sup-root .sup-help-btn.is-support { color: var(--holo-amber) !important; border-color: var(--holo-amber) !important; box-shadow: inset 0 0 14px rgba(255, 181, 71, 0.25) !important; }
${H} .sup-menu { border-radius: 0; clip-path: var(--holo-cut-md); background: #061019; border: 1px solid var(--holo-edge); box-shadow: 0 12px 32px rgba(0, 0, 0, 0.6); }
${H} .sup-menu-head { font-family: var(--holo-display); letter-spacing: 0.18em; }
${H} .sup-root .sup-menu-item { border-radius: 0 !important; }
${H} .sup-menu-ico { border-radius: 0; clip-path: var(--holo-cut-sm); color: var(--holo-cyan); background: rgba(57, 213, 255, 0.12); }

/* report wizard: the Pass / Fail pair on each checklist row (inline styles, hence !important) */
${S('button.ghost[style*="padding: 6px 10px"]')} { background: var(--holo-field) !important; color: var(--text-soft) !important; border: 1px solid var(--holo-edge) !important; box-shadow: none !important; min-height: 30px; }
${S('button.ghost[style*="padding: 6px 10px"]', ":hover:not(:disabled)")} { border-color: var(--holo-cyan) !important; color: var(--holo-cyan) !important; }
${S('button.ghost[style*="padding: 6px 10px"][style*="var(--accent)"]')} { background: var(--holo-green) !important; color: #02070c !important; border-color: var(--holo-green) !important; }
${S('button.danger[style*="padding: 6px 10px"]')} { background: var(--holo-red) !important; color: #02070c !important; border-color: var(--holo-red) !important; min-height: 30px; }

/* ---------- item 21. Scrollbars (item 10), focus, loading and empty states ---------- */
${S(".empty, .empty-state, .loading, .spinner-wrap")} { color: var(--text-soft); font-family: var(--holo-display); letter-spacing: 0.1em; }
`;

const SCREENS = `
/* ====================================================================================
   Group 3: screens (items 22 to 29). Only what the shared controls do not reach: screen
   parts drawn with their own styles. Layout stays as in Fluent and macOS.
   ==================================================================================== */

/* any rounded "pill" a screen draws with an inline style becomes a square Holo chip */
${H} [style*="border-radius: 999px"]:not(.fl-badge):not([class*="dot"]) { border-radius: 0 !important; }

/* ---------- item 22. Sign-in / user picker ---------- */
${H} .user-hero-card { border-radius: 0 !important; clip-path: var(--holo-cut-lg); background: linear-gradient(165deg, rgba(57, 213, 255, 0.1), rgba(2, 7, 12, 0.7) 60%), var(--holo-panel) !important;
  border: 1px solid var(--holo-edge) !important; box-shadow: none !important; }
${H} .user-hero-card h2, ${H} .user-hero-card h3 { text-shadow: var(--holo-text-glow); }
${H} .flip-prev, ${H} .flip-next { border-radius: 0 !important; clip-path: var(--holo-cut-sm); background: #061019 !important; border: 1px solid var(--holo-edge) !important; color: var(--holo-cyan) !important; box-shadow: none !important; }
${H} .theme-swatch { border-radius: 0 !important; box-shadow: 0 0 0 1px var(--holo-edge-soft); }

/* ---------- item 23. Main menu: KPI cards, Attention Required and user handle ---------- */
${H} .mk { font-family: var(--sans); }
${H} .mk-card { border-radius: 0; clip-path: var(--holo-cut-md); background: var(--holo-panel); backdrop-filter: none; -webkit-backdrop-filter: none;
  border: 1px solid var(--holo-edge); box-shadow: none; }
${H} .mk-card:hover { box-shadow: none; border-color: var(--holo-cyan); }
${H} .mk-card::after { border-radius: 0; box-shadow: 0 0 10px currentColor; }
${H} .mk-label { font: 700 12px/1.2 var(--holo-display); letter-spacing: 0.18em; }
${H} .mk-value { font-family: var(--mono); font-weight: 400; letter-spacing: 0; text-shadow: var(--holo-text-glow); }
${H} .mk-sub { font-family: var(--holo-display); font-size: 13px; letter-spacing: 0.06em; }
${H} .mk-ico { border-radius: 0; clip-path: var(--holo-cut-sm); }
${H} .drawer-handle-avatar-circle { clip-path: polygon(25% 4%, 75% 4%, 100% 50%, 75% 96%, 25% 96%, 0 50%); border-radius: 0; box-shadow: none;
  filter: drop-shadow(0 0 8px rgba(57, 213, 255, 0.45)); }
${H} .drawer-handle-avatar-circle-alert { filter: drop-shadow(0 0 12px var(--holo-red)); }
${H} .drawer-handle-avatar-count { font-family: var(--mono); font-weight: 400; }
${H} .drawer-handle-avatar-info { border-radius: 0; background: #061019; box-shadow: none; }
${H} .drawer-handle-avatar-info b, ${H} .drawer-handle-avatar-info strong { font-family: var(--holo-display); letter-spacing: 0.08em; }

/* ---------- item 24. Asset registry and Maintenance triggers (cards are done in group 2) ---------- */
${H} .trigger-row { border-radius: 0; }
${H} .instr-gauge svg { filter: drop-shadow(0 0 6px rgba(57, 213, 255, 0.35)); }

/* ---------- item 25. MR-I reporting: queues, report wizard, report and asset flows ---------- */
${H} .pa-card, ${H} .rq-card { border-radius: 0; clip-path: var(--holo-cut-md); }
${H} .pa-sev, ${H} .pa-meta span, ${H} .rq-badge, ${H} .rq-pill, ${H} .rq-stat, ${H} .rq-tags span, ${H} .mri-sev, ${H} .mri-top-status, ${H} .mri-top-tag,
${H} .mri-kpi-pill, ${H} .glass-tabs { border-radius: 0 !important; }
${H} .pa-sev, ${H} .rq-pill, ${H} .mri-sev, ${H} .mri-top-status, ${H} .mri-top-tag { font-family: var(--holo-display); letter-spacing: 0.08em; text-transform: uppercase; }
${H} .pa-avatar { border-radius: 0; clip-path: var(--holo-cut-sm); }
${H} .rq-stat { background: var(--holo-panel); border: 1px solid var(--holo-edge); clip-path: var(--holo-cut-sm); }
${H} .mri-kpi-track, ${H} .mri-kpi-fill, ${H} .mri-stat-bar-track, ${H} .mri-stat-bar-fill { border-radius: 0; }
/* report and asset flow screens (.fx) */
${H} .fx { --fx-card: var(--holo-panel); --fx-line: var(--holo-edge); --fx-shadow: none; --fx-font: var(--holo-display); }
${H} .fx-back { border-radius: 0; clip-path: polygon(10px 0, 100% 0, 100% 100%, 0 100%, 0 10px); color: var(--holo-cyan); background: var(--holo-field); border: 1px solid var(--holo-edge);
  font-family: var(--holo-display); font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; }
${H} .fx-hint-btn { border-radius: 0; clip-path: var(--holo-cut-sm); color: var(--holo-cyan); background: var(--holo-field); }
${H} .fx-hero { border-radius: 0; clip-path: var(--holo-cut-lg); color: var(--text); box-shadow: none;
  background: linear-gradient(118deg, rgba(57, 213, 255, 0.18), rgba(8, 22, 32, 0.9) 60%), var(--holo-panel) !important; border: 1px solid var(--holo-edge); }
${H} .fx-hero h1, ${H} .fx-hero h2 { text-shadow: var(--holo-text-glow); }
${H} .fx-hero-pic { border-radius: 0; clip-path: var(--holo-cut-sm); background: radial-gradient(ellipse at center 75%, rgba(57, 213, 255, 0.22), transparent 70%), var(--holo-field); position: relative; overflow: hidden; }
${H} .fx-hero-pic img { filter: grayscale(1) brightness(1.15) sepia(1) hue-rotate(150deg) saturate(3) drop-shadow(0 0 6px rgba(57, 213, 255, 0.7)); }
${H} .fx-hero-pic::after { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 40%; pointer-events: none; background: linear-gradient(180deg, transparent, rgba(57, 213, 255, 0.22), transparent); animation: holo-scan 3.4s linear infinite; }
${H} .fx-eyebrow, ${H} .fx-step { font-family: var(--holo-display); letter-spacing: 0.16em; }
${H} .fx-now, ${H} .fx-stat, ${H} .fx-tagbig, ${H} .fx-here, ${H} .fx-endcap, ${H} .fx-chip, ${H} .fx-tagpill, ${H} .fx-badge, ${H} .fx-carry, ${H} .fx-empty, ${H} .fx-meter, ${H} .fx-meter i { border-radius: 0; }
${H} .fx-stat { background: rgba(2, 7, 12, 0.45); border: 1px solid var(--holo-edge-soft); }
${H} .fx-stat b { font-family: var(--mono); font-weight: 400; }
${H} .fx-tagbig { background: rgba(2, 7, 12, 0.6); color: var(--text); border: 1px solid var(--holo-edge); }
${H} .fx-tagbig small { color: var(--text-soft); }
${H} .fx-tagbig i, ${H} .fx-tagpill i, ${H} .fx-chip i { box-shadow: 0 0 8px var(--tone); }
${H} .fx-stepper { border-radius: 0; }
${H} .fx-dot { border-radius: 0; clip-path: var(--holo-cut-sm); font-family: var(--mono); }
${H} .fx-section, ${H} .fx-detail { border-radius: 0; clip-path: var(--holo-cut-md); }
${H} .fx-section-head h2, ${H} .fx-section-head h3 { font-family: var(--holo-display); letter-spacing: 0.14em; text-transform: uppercase; color: var(--holo-cyan); }
${H} .fx-card { border-radius: 0; clip-path: var(--holo-cut-sm); background: linear-gradient(165deg, color-mix(in srgb, var(--tone) 12%, transparent), rgba(2, 7, 12, 0.5) 60%), var(--holo-panel); }
${H} .fx-ico { border-radius: 0; clip-path: var(--holo-cut-sm); }
${H} .fx-title { font-family: var(--holo-display); font-weight: 700; letter-spacing: 0.06em; font-size: 14.5px; }
${H} .fx-link-line { box-shadow: 0 0 6px var(--tone); }

/* ---------- item 26. MR template builder (shared controls) and Maintenance report ---------- */
${H} .status-screen h2, ${H} .status-screen h3 { text-shadow: var(--holo-text-glow); }

/* ---------- item 27. Administration, including Diagnostics › Support viewer ---------- */
${H} .sv-chip, ${H} .sv-badge, ${H} .sv-tile, ${H} .sv-fact, ${H} .sv-note, ${H} .pg-trend, ${H} .pg-tile, ${H} .ri-chip { border-radius: 0 !important; }
${H} .sv-tile, ${H} .pg-tile { clip-path: var(--holo-cut-sm); }
${H} .sv-label { font-family: var(--holo-display); letter-spacing: 0.16em; }
${H} .sv-title, ${H} .pg-overall { font-family: var(--holo-display); letter-spacing: 0.08em; }
${H} .pg-overall { text-transform: uppercase; text-shadow: 0 0 12px currentColor; }
${H} .sv-fact b { font-family: var(--mono); font-weight: 400; }

/* ---------- item 28. Dashboard area (.fl-shell): Holo panels in place of the Fluent cards ---------- */
${H} .fl-shell {
  --fl-r-xl: 0px; --fl-r-lg: 0px; --fl-r-md: 0px; --fl-r-sm: 0px; --fl-r-xs: 0px;
  --fl-bg: transparent; --fl-card: var(--holo-panel); --fl-line: var(--holo-edge-soft); --fl-soft: rgba(57, 213, 255, 0.08);
  --fl-shadow-1: 0 0 0 1px var(--holo-edge-soft); --fl-shadow-2: 0 0 0 1px var(--holo-edge), 0 0 22px rgba(57, 213, 255, 0.14);
  --fl-side-bg: linear-gradient(180deg, #061019 0%, #040d15 100%);
  --fl-t-kpi: 34px;
}
${H} .fl-side { color: var(--text); border-right: 1px solid var(--holo-edge); }
${H} .fl-side::before { background: radial-gradient(circle, rgba(57, 213, 255, 0.14), transparent 68%); }
${H} .fl-side::after { background: radial-gradient(circle, rgba(57, 213, 255, 0.08), transparent 70%); }
${H} .fl-logo { border-radius: 0; clip-path: var(--holo-cut-sm); color: #02070c; background: var(--holo-cyan); box-shadow: none; }
${H} .fl-brand-text b { font-family: var(--holo-display); letter-spacing: 0.12em; text-transform: uppercase; }
${H} .fl-shell .fl-nav-item, ${H} .fl-shell .fl-sub-item { color: var(--text-soft) !important; border-radius: 0 !important; font-family: var(--holo-display); font-weight: 600; letter-spacing: 0.06em; font-size: 14px; }
${H} .fl-shell .fl-nav-item:hover, ${H} .fl-shell .fl-sub-item:hover { background: rgba(57, 213, 255, 0.08) !important; color: var(--text) !important; }
${H} .fl-shell .fl-nav-item.is-on, ${H} .fl-shell .fl-sub-item.is-on, ${H} .fl-shell .fl-acc.has-active .fl-acc-rail {
  background: linear-gradient(90deg, rgba(57, 213, 255, 0.24), transparent) !important; color: var(--holo-cyan) !important; box-shadow: inset 2px 0 0 var(--holo-cyan) !important; text-shadow: var(--holo-text-glow); }
${H} .fl-shell .fl-nav-item.is-on::before, ${H} .fl-shell .fl-sub-item.is-on::before { background: var(--holo-cyan); }
${H} .fl-nav-sep { color: rgba(140, 184, 200, 0.6); font-family: var(--holo-display); letter-spacing: 0.18em; }
${H} .fl-acc-inner { border-left-color: var(--holo-edge-soft); }
${H} .fl-acc-count { border-radius: 0; font-family: var(--mono); color: var(--holo-cyan); background: rgba(57, 213, 255, 0.1); }
${H} .fl-status, ${H} .fl-me { border-radius: 0; background: rgba(57, 213, 255, 0.05); border: 1px solid var(--holo-edge-soft); }
${H} .fl-side .fl-avatar, ${H} .fl-header .fl-avatar { border-radius: 0; clip-path: var(--holo-cut-sm); color: #02070c; background: var(--holo-cyan); }
${H} .fl-titles h1 { font-family: var(--holo-display); letter-spacing: 0.12em; text-transform: uppercase; text-shadow: var(--holo-text-glow); }
${H} .fl-hero { border-radius: 0; clip-path: var(--holo-cut-lg); color: var(--text); box-shadow: none; border: 1px solid var(--holo-edge);
  background: linear-gradient(118deg, rgba(57, 213, 255, 0.2), rgba(8, 22, 32, 0.92) 58%), var(--holo-panel) !important; }
${H} .fl-hero h2 { font-family: var(--mono); font-weight: 400; text-shadow: var(--holo-text-glow); }
${H} .fl-hero-eyebrow { font-family: var(--holo-display); letter-spacing: 0.18em; }
${H} .fl-hero-stat { border-radius: 0; background: rgba(2, 7, 12, 0.5); border: 1px solid var(--holo-edge-soft); }
${H} .fl-hero-stat b, ${H} .fl-kpi-value, ${H} .mrid-kpi-value { font-family: var(--mono); font-weight: 400; letter-spacing: 0; }
${H} .fl-chip, ${H} .fl-trend, ${H} .fl-pill, ${H} .fl-seg, ${H} .fl-shell .fl-seg button, ${H} .fl-shell .mrid-tabs, ${H} .fl-shell .mrid-chip, ${H} .fl-shell .mrid-story-tag,
${H} .fl-shell .trigger-icon-chip, ${H} .fl-motion-value, ${H} .fl-shell .mri-report-key-issue, ${H} .fl-shell .fl-icon-btn, ${H} .fl-shell .fl-search input,
${H} .fl-shell .mrid-card-go, ${H} .fl-shell .mrid-icon, ${H} .fl-ico, ${H} .fl-split, ${H} .fl-meter, ${H} .fl-gauge-track, ${H} .fl-asset-trig, ${H} .fl-pop, ${H} .fl-settings-pop { border-radius: 0 !important; }
${H} .fl-chip { background: rgba(2, 7, 12, 0.45) !important; border: 1px solid var(--holo-edge-soft); color: var(--text); }
${H} .fl-shell .fl-kpi, ${H} .fl-card, ${H} .fl-shell .fl-qa, ${H} .fl-shell .mrid-panel, ${H} .fl-shell .mrid-headrow, ${H} .fl-shell .mrid-kpi, ${H} .fl-toolbar,
${H} .fl-asset-head, ${H} .fl-shell .fl-explore { clip-path: var(--holo-cut-md); border-color: var(--holo-edge) !important; }
${H} .fl-shell .fl-kpi:hover, ${H} .fl-shell .fl-qa:hover, ${H} .fl-shell button.mrid-kpi:hover { border-color: var(--holo-cyan) !important; }
${H} .fl-card-head h3, ${H} .fl-section-title, ${H} .fl-kpi-label, ${H} .fl-qa-label { font-family: var(--holo-display); letter-spacing: 0.1em; text-transform: uppercase; }
${H} .fl-shell .fl-seg button.is-on { background: rgba(57, 213, 255, 0.22) !important; color: var(--holo-cyan) !important; box-shadow: inset 0 0 0 1px var(--holo-edge) !important; }
${H} .mrid { --deck-text: #7fe6ff; }
/* Fleet availability hero on the Overview */
${H} .fl-avail { clip-path: var(--holo-cut-lg); color: var(--text); border: 1px solid var(--holo-edge); box-shadow: none;
  background: linear-gradient(118deg, rgba(57, 213, 255, 0.16), rgba(8, 22, 32, 0.92) 60%), var(--holo-panel); }
${H} .fl-avail-title, ${H} .fl-avail-text b { font-family: var(--mono); font-weight: 400; text-shadow: var(--holo-text-glow); }
${H} .fl-shell .fl-avail-stat { border-radius: 0; background: rgba(2, 7, 12, 0.5); border: 1px solid var(--holo-edge-soft); }
${H} .fl-shell .fl-avail-stat:hover { background: rgba(57, 213, 255, 0.12); border-color: var(--holo-cyan); }
${H} .fl-avail-stat b { font-family: var(--mono); font-weight: 400; }

/* ---------- item 29. Idle screen, Help, Send to IT window, messages ---------- */
${H} .showcase-panel, ${H} .showcase-stat-pill, ${H} .showcase-panel-badge, ${H} .showcase-attachment-thumb { border-radius: 0 !important; }
${H} .showcase-panel { clip-path: var(--holo-cut-md); background: var(--holo-panel) !important; border: 1px solid var(--holo-edge) !important; box-shadow: none !important; }
${H} .showcase-stat-value { font-family: var(--mono); }
${H} .sup-dialog, ${H} .sup-summary, ${H} .sup-paste, ${H} .sup-toast, ${H} .sup-tabs, ${H} .sup-root .sup-tabs button, ${H} .sup-root .sup-pill-btn, ${H} .sup-pill { border-radius: 0 !important; }
${H} .sup-dialog { clip-path: var(--holo-cut-lg); background: #071520 !important; border: 1px solid var(--holo-edge) !important; box-shadow: inset 0 0 40px rgba(57, 213, 255, 0.08) !important; }
${H} .sup-pill { background: #071520 !important; border: 1px solid var(--holo-edge) !important; }
${H} .sup-dialog h2, ${H} .sup-dialog h3 { font-family: var(--holo-display); letter-spacing: 0.1em; text-transform: uppercase; }

/* ====================================================================================
   Group 4: charts and maps (items 30 to 32)
   ==================================================================================== */
/* ---------- item 30. Charts: series, axes and grid already use the theme tokens (cyan, green,
   amber, red, violet). Holo HUD adds the look: mono tick labels, faint cyan grid, square dark
   tooltips, a soft glow on lines, square legends. ---------- */
${H} .recharts-cartesian-grid line, ${H} .recharts-polar-grid line, ${H} .recharts-polar-grid path { stroke: var(--holo-edge-soft); }
${H} .recharts-cartesian-axis-tick text, ${H} .recharts-polar-angle-axis-tick text, ${H} .recharts-polar-radius-axis-tick text,
${H} .recharts-label, ${H} .recharts-text { font-family: var(--mono); fill: var(--text-soft); }
${H} .recharts-cartesian-axis-line { stroke: var(--holo-edge); }
${H} .recharts-default-tooltip { border-radius: 0 !important; background: #071520 !important; border: 1px solid var(--holo-edge) !important;
  box-shadow: 0 0 18px rgba(57, 213, 255, 0.18) !important; font-family: var(--mono); color: var(--text) !important; }
${H} .recharts-tooltip-label { font-family: var(--holo-display); letter-spacing: 0.1em; text-transform: uppercase; color: var(--holo-cyan) !important; }
${H} .recharts-tooltip-cursor { stroke: var(--holo-cyan); stroke-opacity: 0.35; }
${H} .recharts-line-curve, ${H} .recharts-area-curve { filter: drop-shadow(0 0 3px rgba(57, 213, 255, 0.45)); }
${H} .recharts-legend-item-text { font-family: var(--holo-display); letter-spacing: 0.08em; color: var(--text-soft) !important; }
${H} .recharts-legend-icon { shape-rendering: crispEdges; }
${H} .recharts-rectangle.recharts-bar-rectangle path, ${H} .recharts-bar-rectangle path { shape-rendering: crispEdges; }
${H} .recharts-active-dot circle, ${H} .recharts-dot { filter: drop-shadow(0 0 4px currentColor); }

/* ---------- item 31. Status colours: Red, Amber and Green differ in brightness as well as hue
   (relative luminance 0.27 / 0.55 / 0.76), and the tag word is always shown next to the colour. ---------- */

/* ---------- item 32. Distance map on the MR-I report: dark map style (DistanceMapField.tsx), framed like a Holo panel ---------- */
${H} .maplibregl-map { border: 1px solid var(--holo-edge); clip-path: var(--holo-cut-md); }
${H} .maplibregl-canvas { filter: sepia(0.35) hue-rotate(160deg) saturate(1.6) brightness(1.05); }
${H} .maplibregl-ctrl-group { border-radius: 0 !important; background: #061019 !important; box-shadow: 0 0 0 1px var(--holo-edge) !important; }
${H} .maplibregl-ctrl-group button + button { border-top-color: var(--holo-edge-soft) !important; }
${H} .maplibregl-ctrl-icon { filter: invert(1) sepia(1) hue-rotate(150deg) saturate(3); }
${H} .maplibregl-ctrl-attrib { background: rgba(6, 16, 25, 0.8) !important; color: var(--text-soft); }
${H} .maplibregl-ctrl-attrib a { color: var(--holo-cyan); }
`;

const FONTS = `
@font-face { font-family: "Rajdhani"; font-style: normal; font-weight: 500; font-display: swap; src: url("${rajdhani500}") format("woff2"); }
@font-face { font-family: "Rajdhani"; font-style: normal; font-weight: 600; font-display: swap; src: url("${rajdhani600}") format("woff2"); }
@font-face { font-family: "Rajdhani"; font-style: normal; font-weight: 700; font-display: swap; src: url("${rajdhani700}") format("woff2"); }
@font-face { font-family: "Share Tech Mono"; font-style: normal; font-weight: 400; font-display: swap; src: url("${shareTechMono}") format("woff2"); }
`;

export const HOLO_THEME_CSS = `
${FONTS}
/* Screen only: printed reports and PDFs keep the plain document look of the other themes. */
@media screen {
/* ---------- item 8. MMS theme tokens for Holo HUD (same names every theme uses) ---------- */
${H}, [data-theme="holo"] {
  --bg: #02070c;
  --surface: #0a1822;
  --border: rgba(57, 213, 255, 0.22);
  --text: #d6f6ff;
  --text-soft: #8cb8c8;
  --accent: #39d5ff;
  --accent-soft: #0c2a36;
  --accent-blue: #39d5ff;
  --accent-blue-deep: #1aa6d6;
  --chart-violet: #b18cff;
  --chart-green: #4dffb0;
  --hover-highlight: #0e2a38;
  --warn: #ffb547;
  --warn-soft: #33260c;
  --danger: #ff5c6c;
  --danger-soft: #3a1219;
  --success: #4dffb0;
  --success-soft: #0c3326;
  --radius: 6px;
  /* panels: dark glass with a thin cyan edge instead of the neumorphic raised look */
  --neu-bg: #0a1822;
  /* item 11: no neumorphic look. Every soft raised or sunken shadow built from these two colours
     disappears (as in macOS); the controls below give each box its thin cyan edge instead. */
  --neu-shadow-dark: transparent;
  --neu-shadow-light: transparent;
  /* running-in-foot counter colour (the other themes use --accent; Holo's accent is cyan like OH) */
  --trig-rif: #2ee6d0;
  /* Holo HUD's own tokens, used by the shared controls (group 2) and screens (group 3) */
  --holo-cyan: #39d5ff;
  --holo-edge: rgba(57, 213, 255, 0.32);
  --holo-edge-soft: rgba(57, 213, 255, 0.16);
  --holo-panel: rgba(8, 22, 32, 0.82);
  --holo-field: rgba(57, 213, 255, 0.06);
  --holo-glow: 0 0 14px rgba(57, 213, 255, 0.55);
  --holo-glow-soft: 0 0 22px rgba(57, 213, 255, 0.16);
  --holo-text-glow: 0 0 12px rgba(57, 213, 255, 0.5);
  --holo-red: #ff4d5e;
  --holo-amber: #ffb547;
  --holo-green: #4dffb0;
  /* cut corners (clip-path), small / medium / large, as in the mockups */
  --holo-cut-sm: polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px);
  --holo-cut-md: polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 16px 100%, 0 calc(100% - 16px));
  --holo-cut-lg: polygon(0 0, calc(100% - 22px) 0, 100% 22px, 100% 100%, 22px 100%, 0 calc(100% - 22px));
  /* item 9. fonts: Rajdhani for headings and labels, Share Tech Mono for codes and numbers.
     Body text stays in the app font (as in Fluent) so long forms stay easy to read. */
  --holo-display: "Rajdhani", "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif;
  --mono: "Share Tech Mono", ui-monospace, "Cascadia Mono", Consolas, monospace;
  /* Fluent 2 tokens shared with the dashboards; they follow the Holo values above */
${FL_TOKENS}
  /* written out in full: --fl-font falls back to --sans, so pointing --sans at it would loop */
  --sans: "Segoe UI Variable Text", "Segoe UI Variable", "Segoe UI", Aptos, system-ui, sans-serif;
}
/* tokens the app sets on .app itself: a more specific selector so the Holo values win */
.app[data-theme="holo"] {
  --tab-track: rgba(57, 213, 255, 0.08);
  --st-amber: #ffb547;
  --st-blue: #39d5ff;
  --st-red: #ff4d5e;
  --st-teal: #2ee6d0;
  --st-grey: #6f8a96;
  --st-green: #4dffb0;
  --on-status: #02070c;
  --disabled-bg: #0d1c25;
  --chip-bg: rgba(57, 213, 255, 0.12);
  --hero-veil: linear-gradient(100deg, rgba(2,7,12,0.95) 0%, rgba(2,7,12,0.84) 30%, rgba(2,7,12,0.5) 65%, rgba(2,7,12,0.2) 100%);
  --glass-bg: rgba(8, 22, 32, 0.62);
  --glass-bg-strong: rgba(8, 22, 32, 0.84);
  --glass-shadow: 0 0 0 1px var(--holo-edge-soft);
  --glass-shadow-strong: 0 0 0 1px var(--holo-edge);
  --text-halo: none;
  --shadow-card: 0 0 0 1px var(--holo-edge-soft), var(--holo-glow-soft);
  --shadow-card-lg: 0 0 0 1px var(--holo-edge), var(--holo-glow-soft);
  --shadow-pop: 0 0 0 1px var(--holo-edge), 0 12px 32px rgba(0, 0, 0, 0.6);
  --shadow-sm: 0 0 0 1px var(--holo-edge-soft);
  /* the neumorphic wells and bumps used by inline styles become thin cyan edges */
  --neu-inset: inset 0 0 0 1px var(--holo-edge-soft);
  --neu-inset-deep: inset 0 0 0 1px var(--holo-edge-soft);
  --neu-inset-sm: inset 0 0 0 1px var(--holo-edge-soft);
  --neu-inset-well: inset 0 0 0 1px var(--holo-edge-soft);
  --neu-raised: 0 0 0 1px var(--holo-edge), var(--holo-glow-soft);
  --neu-raised-sm: 0 0 0 1px var(--holo-edge-soft);
}
${H} { color-scheme: dark; }

/* ---------- item 10. Backdrop: dark ground, a faint cyan grid and a soft glow at the top ---------- */
${H}, ${H} body, ${H} .app {
  background-color: var(--bg);
  background-image:
    radial-gradient(ellipse 70% 45% at 55% 0%, rgba(57, 213, 255, 0.13), transparent 70%),
    repeating-linear-gradient(0deg, rgba(57, 213, 255, 0.045) 0 1px, transparent 1px 40px),
    repeating-linear-gradient(90deg, rgba(57, 213, 255, 0.045) 0 1px, transparent 1px 40px);
  background-attachment: fixed;
  color: var(--text);
  font-family: var(--sans);
  -webkit-font-smoothing: antialiased;
}
${H} .content { background: transparent; }

/* headings and labels in the display face; codes and numbers in the mono face */
${H} h1, ${H} h2, ${H} h3, ${H} h4 { font-family: var(--holo-display); color: var(--text); letter-spacing: 0.04em; }
${H} h1, ${H} h2 { font-weight: 700; }
${H} h3, ${H} h4 { font-weight: 600; }
${H} h1 { text-shadow: var(--holo-text-glow); }
${H} code, ${H} kbd, ${H} pre, ${H} samp { font-family: var(--mono); }
${H} a { color: var(--holo-cyan); text-underline-offset: 2px; }
${H} a:hover { color: #9be9ff; }

/* focus ring, selection and scrollbars */
${H} :focus-visible { outline: 2px solid var(--holo-cyan); outline-offset: 2px; box-shadow: var(--holo-glow); }
${H} ::selection { background: rgba(57, 213, 255, 0.3); color: #ffffff; }
${H} * { scrollbar-width: thin; scrollbar-color: rgba(57, 213, 255, 0.35) transparent; }
${H} ::-webkit-scrollbar { width: 10px; height: 10px; }
${H} ::-webkit-scrollbar-thumb { background: rgba(57, 213, 255, 0.28); border-radius: 0; border: 2px solid transparent; background-clip: padding-box; }
${H} ::-webkit-scrollbar-thumb:hover { background-color: rgba(57, 213, 255, 0.5); }
${H} ::-webkit-scrollbar-track { background: transparent; }

/* helper classes for the controls and screens (groups 2 and 3) */
${H} .holo-cut-sm { clip-path: var(--holo-cut-sm); }
${H} .holo-cut-md { clip-path: var(--holo-cut-md); }
${H} .holo-cut-lg { clip-path: var(--holo-cut-lg); }
${H} .holo-glow { box-shadow: var(--holo-glow); }
${H} .holo-mono { font-family: var(--mono); }
${H} .holo-display { font-family: var(--holo-display); letter-spacing: 0.06em; }

/* ---------- item 16. Tag lamps: each glows in its own colour, Red pulses (as in the mockup) ---------- */
${H} .instr-lamp i { border: 0; }
${H} .instr-lamp.red i { background: radial-gradient(circle at 35% 30%, #ffffff 0%, #ff4d5e 35%, #7a0d18 100%);
  box-shadow: 0 0 calc(var(--lamp-size) * 0.6) #ff4d5e, 0 0 calc(var(--lamp-size) * 1.2) rgba(255, 77, 94, 0.55); animation: holo-pulse 1.6s ease-in-out infinite; }
${H} .instr-lamp.yellow i { background: radial-gradient(circle at 35% 30%, #ffffff 0%, #ffb547 35%, #7a4d00 100%);
  box-shadow: 0 0 calc(var(--lamp-size) * 0.6) #ffb547, 0 0 calc(var(--lamp-size) * 1.2) rgba(255, 181, 71, 0.5); }
${H} .instr-lamp.green i { background: radial-gradient(circle at 35% 30%, #ffffff 0%, #4dffb0 35%, #0b6b42 100%);
  box-shadow: 0 0 calc(var(--lamp-size) * 0.6) #4dffb0, 0 0 calc(var(--lamp-size) * 1.2) rgba(77, 255, 176, 0.45); }
${H} .instr-lamp.off i { background: radial-gradient(circle at 35% 30%, #8fb3c0 0%, #3d5b66 45%, #142a33 100%); box-shadow: 0 0 0 1px var(--holo-edge-soft); }
${H} .instr-lamp-text { font-family: var(--holo-display); letter-spacing: 0.12em; }

/* ---------- item 18. Asset-type pictures: cyan hologram tint with a glow, and a light moving up and down ---------- */
${H} .asset-type-pic, ${H} .asset-select-icon {
  position: relative; overflow: hidden; border-radius: 0; clip-path: var(--holo-cut-sm);
  background: radial-gradient(ellipse at center 75%, rgba(57, 213, 255, 0.22), transparent 70%), var(--holo-field);
  box-shadow: inset 0 0 0 1px var(--holo-edge-soft); }
${H} .asset-type-pic img, ${H} .asset-select-icon img {
  filter: grayscale(1) brightness(1.15) sepia(1) hue-rotate(150deg) saturate(3) drop-shadow(0 0 8px rgba(57, 213, 255, 0.7)); }
${H} .asset-type-pic::after, ${H} .asset-select-icon::after {
  content: ""; position: absolute; left: 0; right: 0; top: 0; height: 40%; pointer-events: none;
  background: linear-gradient(180deg, transparent, rgba(57, 213, 255, 0.22), transparent);
  animation: holo-scan 3.4s linear infinite; }

${CONTROLS}
${SCREENS}
/* motion used by later items: a slow pulse for Red tags and alerts, a scan line over asset pictures */
@keyframes holo-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
@keyframes holo-scan { 0% { transform: translateY(-110%); } 100% { transform: translateY(260%); } }
}

/* When Windows "Show animations" is off, Holo HUD does not move at all. */
@media (prefers-reduced-motion: reduce) {
  ${H} *, ${H} *::before, ${H} *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }
}
`;
