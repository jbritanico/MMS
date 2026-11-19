import { FL_TOKENS } from "./fluentTokens";

// "Fluent" theme: gives the whole app the look of the Dashboard area (Fluent 2 + fluid).
// It is an extra theme; Light, Dark, macOS and the hidden themes are not touched.
// Everything is scoped to [data-theme="fluent"], so it only applies when Fluent is picked.
// Checklist 1-3: theme tokens and the app-wide base. Checklist 4-10: shared controls.
// The Dashboard area (.fl-shell) and the Document / Asset flows (.fx) style themselves, so every
// control rule below skips them (X) and they look exactly as in the other themes.
/** The page root carries data-fluent while Fluent is picked (set in App.tsx), so pop-ups drawn
 *  outside the app frame (side drawers, dialogs) are covered as well. */
const F = "html[data-fluent]";
/** Skip the Dashboard area and the flow screens: they already have the Fluent look. */
const X = ":not(.fl-shell *):not(.fx *)";
/** Scope a comma list of selectors to the Fluent theme, outside the dashboards/flows, with an optional state (":hover"). */
const S = (sels: string, state = "") => sels.split(",").map((x) => `${F} ${x.trim()}${X}${state}`).join(", ");
/** Buttons that have their own look (menu tiles, nav items, pickers ...) are styled in their own section. */
const SPECIAL = [".theme-fab", ".glass-button", ".mr-level-btn", ".page-btn", ".side-drawer-handle", ".neu-toggle", ".menu-card", ".uilab-fab",
  ".icon-btn", ".drawer-nav-btn", ".admin-group-header", ".admin-child-item", ".theme-option", ".kpi-footer-item", ".dashboard-tile", ".mri-history-card"];
const BTN = "button" + SPECIAL.map((c) => `:not(${c})`).join("");
const CHEVRON = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M2.5 4.5 6 8l3.5-3.5' fill='none' stroke='%237b8494' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`;
const TEXT_INPUTS = 'input:not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="range"]):not([type="button"]):not([type="submit"]):not([type="color"]):not(.neu-check-input), textarea';

const CONTROLS = `
/* ---------- shared surfaces used by the controls below ---------- */
${F} {
  --fl-field: color-mix(in srgb, var(--fl-blue) 4%, #ffffff);
  --fl-field-line: color-mix(in srgb, var(--text-soft) 30%, transparent);
  --field: var(--fl-field); --field-border: var(--fl-field-line); --ctl: #ffffff; --row: color-mix(in srgb, var(--fl-blue) 3%, #ffffff);
  --side: #ffffff; --chip-bg: color-mix(in srgb, var(--fl-blue) 9%, #ffffff); --disabled-bg: color-mix(in srgb, var(--text-soft) 10%, #ffffff);
  /* the old neumorphic wells and bumps used by inline styles become Fluent hairlines and soft shadows */
  --neu-inset: inset 0 0 0 1px var(--fl-field-line); --neu-inset-deep: inset 0 0 0 1px var(--fl-field-line);
  --neu-inset-sm: inset 0 0 0 1px var(--fl-field-line); --neu-inset-well: inset 0 0 0 1px var(--fl-field-line);
  --neu-raised: 0 0 0 1px var(--fl-line), var(--fl-shadow-1); --neu-raised-sm: 0 0 0 1px var(--fl-line), 0 1px 3px color-mix(in srgb, var(--fl-navy) 10%, transparent);
  /* tab strips (segmented controls): the dashboard's pill tabs */
  --tab-track: color-mix(in srgb, var(--fl-blue) 8%, #ffffff);
  --seg-pad: 6px 14px; --seg-radius: 999px; --seg-font: 12.5px; --seg-on-weight: 600; --seg-off-weight: 500;
  --seg-on-bg: #ffffff; --seg-on-color: var(--fl-blue); --seg-off-color: var(--text-soft); --seg-on-shadow: var(--fl-shadow-1);
  --seg-track-radius: 999px; --seg-track-pad: 3px; --seg-border: 0;
  /* field sizes used by inline styles (report wizard rows): room for the drop-down chevron */
  --field-h: 36px; --field-px: 10px; --select-pr: 28px;
}

/* ---------- 4. Buttons: primary, secondary, danger, icon ---------- */
${S(BTN)} {
  font: 600 13.5px/1.2 var(--fl-font); letter-spacing: 0; min-height: 36px; padding: 8px 16px; border-radius: 10px;
  color: var(--text); background: #ffffff; border: 1px solid var(--fl-field-line); box-shadow: 0 1px 2px color-mix(in srgb, var(--fl-navy) 8%, transparent);
  cursor: pointer; transition: background .15s, border-color .15s, box-shadow .15s, transform .12s var(--fl-ease); }
${S(BTN, ":hover:not(:disabled)")} { border-color: color-mix(in srgb, var(--fl-blue) 45%, var(--fl-field-line)); background: var(--fl-soft); }
${S(BTN, ":active:not(:disabled)")} { transform: scale(0.98); box-shadow: none; }
${S("button.primary" + SPECIAL.map((c) => `:not(${c})`).join(""))} { color: #ffffff; background: var(--fl-blue); border-color: transparent; box-shadow: 0 2px 8px color-mix(in srgb, var(--fl-blue) 30%, transparent); }
${S("button.primary" + SPECIAL.map((c) => `:not(${c})`).join(""), ":hover:not(:disabled)")} { background: var(--fl-navy); border-color: transparent; }
${S("button.ghost" + SPECIAL.map((c) => `:not(${c})`).join(""))} { color: var(--fl-blue); background: transparent; border-color: transparent; box-shadow: none; }
${S("button.ghost" + SPECIAL.map((c) => `:not(${c})`).join(""), ":hover:not(:disabled)")} { background: var(--fl-soft); }
${S("button.danger" + SPECIAL.map((c) => `:not(${c})`).join(""))} { color: var(--danger); background: var(--danger-soft); border-color: color-mix(in srgb, var(--danger) 25%, transparent); box-shadow: none; }
${S("button.danger" + SPECIAL.map((c) => `:not(${c})`).join(""), ":hover:not(:disabled)")} { background: color-mix(in srgb, var(--danger) 16%, #ffffff); }
${S("button", ":disabled")} { opacity: 0.45; cursor: not-allowed; box-shadow: none; transform: none; }
${S("button.icon-btn")} { width: 36px; height: 36px; min-height: 0; padding: 0; display: inline-flex; align-items: center; justify-content: center; border-radius: 50%;
  color: var(--text-soft); background: #ffffff; border: 1px solid var(--fl-line); box-shadow: var(--fl-shadow-1); cursor: pointer; transition: transform .15s var(--fl-ease), box-shadow .15s, color .15s; }
${S("button.icon-btn", ":hover:not(:disabled)")} { color: var(--fl-blue); transform: translateY(-1px); box-shadow: var(--fl-shadow-2); }
${S("button.icon-btn", ":active:not(:disabled)")} { transform: scale(0.96); }
${S("button.icon-btn svg")} { width: 18px; height: 18px; color: inherit; }
${S("button.icon-btn.icon-danger, button.icon-btn.icon-danger svg")} { color: var(--danger); }

/* ---------- 5. Tables and lists ---------- */
${S(".grid-table")} { background: #ffffff; border: 1px solid var(--fl-line); border-radius: var(--fl-r-md); box-shadow: var(--fl-shadow-1); overflow: hidden; }
${S(".grid-row")} { padding: 10px 14px; gap: 12px; font-size: 13.5px; border-bottom: 1px solid var(--fl-line); }
${S(".grid-row:last-child")} { border-bottom: 0; }
${S(".grid-row:not(.grid-head)", ":hover")} { background: var(--hover-highlight); }
${S(".grid-head")} { font: 700 11px/1.2 var(--fl-font); letter-spacing: .06em; text-transform: uppercase; color: var(--text-soft); background: color-mix(in srgb, var(--fl-blue) 4%, #ffffff); border-bottom: 1px solid var(--fl-line); }
${S("table")} { border-collapse: separate; border-spacing: 0; }
${S("th")} { font: 700 11px/1.2 var(--fl-font); letter-spacing: .06em; text-transform: uppercase; color: var(--text-soft); text-align: left; background: color-mix(in srgb, var(--fl-blue) 4%, #ffffff); border-bottom: 1px solid var(--fl-line); }
${S("td")} { border-bottom: 1px solid var(--fl-line); }
${S("tbody tr", ":hover")} { background: var(--hover-highlight); }
${S(".pagination-bar")} { gap: 6px; margin-top: 12px; }
${S(".page-btn")} { min-width: 32px; height: 32px; padding: 0 10px; border-radius: 999px; font: 600 12.5px/1 var(--fl-font); color: var(--text); background: #ffffff; border: 1px solid var(--fl-line); box-shadow: none; cursor: pointer; }
${S(".page-btn", ":hover:not(:disabled)")} { border-color: var(--fl-blue); color: var(--fl-blue); }
${S(".page-btn", ":disabled")} { opacity: 0.4; }
${S(".page-btn.page-num.active")} { color: #ffffff; background: var(--fl-blue); border-color: var(--fl-blue); }
${S(".trigger-row + .trigger-row, .card + .card")} { border-top: 1px solid var(--fl-line); box-shadow: none; }
${S(".trigger-row.trigger-head")} { font: 700 11px/1.2 var(--fl-font); letter-spacing: .06em; text-transform: uppercase; color: var(--text-soft); }

/* ---------- 6. Cards, panels and section headings ---------- */
${S(".panel")} { background: #ffffff; border: 1px solid var(--fl-line); border-radius: var(--fl-r-lg); box-shadow: var(--fl-shadow-1); padding: 22px; }
${S(".panel.panel-flat")} { background: transparent; box-shadow: none; }
${S(".panel h2")} { font: 700 12.5px/1.3 var(--fl-font); letter-spacing: .06em; text-transform: uppercase; color: var(--text-soft); margin: 0 0 14px; }
${S(".card")} { background: #ffffff; border: 1px solid var(--fl-line); border-radius: var(--fl-r-md); box-shadow: none; }
${S(".menu-card, .review-card, .dashboard-tile, .mri-history-card, .mri-stat-card, .mri-report-card, .kpi-footer-item")} {
  background: #ffffff; border: 1px solid var(--fl-line); border-radius: var(--fl-r-lg); box-shadow: var(--fl-shadow-1); backdrop-filter: none; -webkit-backdrop-filter: none;
  transition: transform .18s var(--fl-ease), box-shadow .18s var(--fl-ease); }
${S(".menu-card, .review-card, .dashboard-tile, .mri-history-card, .kpi-footer-item", ":hover")} { transform: translateY(-3px); box-shadow: var(--fl-shadow-2); }
${S(".menu-card, .review-card, .dashboard-tile, .mri-history-card, .kpi-footer-item", ":active")} { transform: translateY(-1px); }
${S(".menu-icon-wrap, .dashboard-tile-icon")} { border-radius: 14px; color: var(--fl-blue); background: color-mix(in srgb, var(--fl-blue) 12%, #ffffff); box-shadow: none; }
${S(".menu-card h3, .dashboard-tile-title")} { font-weight: 600; letter-spacing: -0.01em; color: var(--text); }
${S(".menu-card p, .dashboard-tile-desc")} { color: var(--text-soft); }
${S(".inset-well, .mri-preview-form")} { background: var(--fl-field); box-shadow: inset 0 0 0 1px var(--fl-line); border-radius: var(--fl-r-md); }
${S(".mri-stat-bar-track, .mri-preview-toggle")} { background: var(--chip-bg); }
${F} .mri-report-timeline${X}::before { background: var(--fl-line); }

/* ---------- 7. Dialogs, messages and the error dialog ---------- */
${S(".modal-overlay")} { background: color-mix(in srgb, #0b1a33 34%, transparent); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); }
${S(".modal")} { background: #ffffff; border: 1px solid var(--fl-line); border-radius: var(--fl-r-lg); box-shadow: 0 24px 60px color-mix(in srgb, #0b1a33 26%, transparent), 0 2px 8px color-mix(in srgb, #0b1a33 10%, transparent); padding: 24px; }
${S(".modal h3")} { font: 600 17px/1.3 var(--fl-font); color: var(--text); margin: 0 0 8px; }
${S(".modal p")} { font-size: 13.5px; line-height: 1.55; color: var(--text-soft); }
${S(".modal-icon")} { background: var(--danger-soft); color: var(--danger); box-shadow: none; }
${S(".modal-actions")} { gap: 8px; }
${S(".toast")} { background: #ffffff; border: 1px solid var(--fl-line); border-radius: 12px; box-shadow: var(--fl-shadow-1); padding: 10px 14px 10px 16px; font-size: 13.5px; border-left: 4px solid var(--fl-blue); }
${S(".toast.ok")} { color: var(--success); background: var(--success-soft); border-color: color-mix(in srgb, var(--success) 22%, transparent); border-left-color: var(--success); }
${S(".toast.err")} { color: var(--danger); background: var(--danger-soft); border-color: color-mix(in srgb, var(--danger) 22%, transparent); border-left-color: var(--danger); }

/* ---------- 8. Top bar, Back button, user badge, side drawer, theme picker ---------- */
${S(".ui-nav")} { padding: 12px 18px 0; }
${S(".ui-nav > button, .ui-nav > .ghost")} { border-radius: 999px !important; padding: 6px 14px !important; min-height: 32px; color: var(--fl-navy) !important; background: #ffffff !important;
  border: 1px solid var(--fl-line) !important; box-shadow: var(--fl-shadow-1) !important; font: 600 12.5px/1 var(--fl-font) !important; }
${S(".ui-nav > button, .ui-nav > .ghost", ":hover")} { color: var(--fl-blue) !important; box-shadow: var(--fl-shadow-2) !important; }
${S(".user-badge")} { font: 600 13px/1.2 var(--fl-font); color: var(--text); }
${S(".side-drawer-overlay")} { background: color-mix(in srgb, #0b1a33 22%, transparent); backdrop-filter: blur(2px); }
${S(".side-drawer")} { background: #ffffff; border-left: 1px solid var(--fl-line); box-shadow: -16px 0 40px color-mix(in srgb, #0b1a33 18%, transparent); }
${S(".drawer-user-card")} { border-radius: var(--fl-r-md); background: #ffffff; border: 1px solid var(--fl-line); box-shadow: var(--fl-shadow-1); color: var(--text); }
/* the signed-in user's card at the top of a drawer is the blue hero; the cards below it (Attention Required items) stay white */
${S(".drawer-user-card:first-child")} { color: #ffffff; background: linear-gradient(135deg, var(--fl-navy), var(--fl-blue)); border: 0; }
${S(".drawer-user-card:first-child .drawer-user-name, .drawer-user-card:first-child .drawer-user-role")} { color: #ffffff; }
${S(".drawer-user-card:first-child button")} { color: #ffffff !important; background: rgba(255,255,255,0.16) !important; border: 1px solid rgba(255,255,255,0.35) !important; box-shadow: none !important; border-radius: 999px !important; }
${S(".drawer-user-card:first-child button", ":hover")} { background: rgba(255,255,255,0.26) !important; }
${S(".drawer-user-card:not(:first-child)", ":hover")} { box-shadow: var(--fl-shadow-2); }
${S(".drawer-section-label")} { font: 700 10.5px/1.2 var(--fl-font); letter-spacing: .08em; text-transform: uppercase; color: var(--text-soft); }
${S(".drawer-nav-btn")} { border-radius: 10px; border: 0; background: transparent; box-shadow: none; min-height: 0; color: var(--text); font: 500 13.5px/1.2 var(--fl-font); cursor: pointer; transition: background .15s, transform .15s var(--fl-ease); }
${S(".drawer-nav-btn", ":hover")} { background: var(--fl-soft); transform: translateX(2px); }
${S(".drawer-nav-btn svg")} { color: var(--fl-blue); }
${S(".side-drawer-handle:not(.side-drawer-handle-avatar)")} { background: #ffffff; border: 1px solid var(--fl-line); border-right: 0; box-shadow: var(--fl-shadow-1); }
${S(".drawer-handle-avatar-info")} { background: #ffffff; border: 1px solid var(--fl-line); border-left: 0; box-shadow: var(--fl-shadow-1); }
${S(".theme-fab")} { color: var(--text-soft); background: #ffffff; border: 1px solid var(--fl-line); box-shadow: var(--fl-shadow-1); }
${S(".theme-fab", ":hover")} { color: var(--fl-blue); box-shadow: var(--fl-shadow-2); }
${S(".theme-picker, .gate-theme-picker")} { background: #ffffff; border: 1px solid var(--fl-line); border-radius: var(--fl-r-md); box-shadow: var(--fl-shadow-2); }
${S(".theme-option")} { border-radius: 8px; border: 0; background: transparent; box-shadow: none; min-height: 0; color: var(--text); font: 500 13px/1.2 var(--fl-font); cursor: pointer; }
${S(".theme-option", ":hover")} { background: var(--fl-soft); }
${S(".theme-option.active")} { background: color-mix(in srgb, var(--fl-blue) 12%, #ffffff); color: var(--fl-navy); font-weight: 600; box-shadow: none; }

/* ---------- 9. Tabs, chips, badges, step bars, side navigation ---------- */
${S(".pill")} { font: 600 11.5px/1.2 var(--fl-font); padding: 3px 9px; border-radius: 999px; }
${S(".pill.active")} { background: var(--success-soft); color: var(--success); }
${S(".dashboard-tile-badge")} { background: var(--chip-bg); color: var(--fl-navy); border-radius: 999px; }
${S(".wizard-steps")} { gap: 6px; }
${S(".wizard-step")} { border-radius: 999px; padding: 6px 12px 6px 6px; font: 500 13px/1.2 var(--fl-font); color: var(--text-soft); }
${S(".wizard-step-dot")} { width: 26px; height: 26px; font: 700 12px/1 var(--fl-font); background: #ffffff; color: var(--text-soft); box-shadow: inset 0 0 0 1.5px var(--fl-field-line); }
${S(".wizard-step.active")} { color: var(--text); font-weight: 600; background: #ffffff; box-shadow: var(--fl-shadow-1); }
${S(".wizard-step.active .wizard-step-dot")} { background: var(--fl-blue); color: #ffffff; box-shadow: 0 0 0 4px color-mix(in srgb, var(--fl-blue) 18%, transparent); }
${S(".wizard-step.done .wizard-step-dot")} { background: var(--fl-green); color: #ffffff; box-shadow: none; }
${S(".mr-level-btn")} { border-radius: 10px; color: var(--fl-blue); background: #ffffff; border: 1px solid var(--fl-line); box-shadow: var(--fl-shadow-1); font: 700 12px/1 var(--fl-font); }
${S(".mr-level-btn", ":hover")} { background: var(--fl-soft); box-shadow: var(--fl-shadow-2); }
${S(".admin-sidebar")} { background: #ffffff; border: 1px solid var(--fl-line); border-radius: var(--fl-r-lg); box-shadow: var(--fl-shadow-1); padding: 10px; }
${S(".admin-group-header, .admin-child-item")} { border-radius: 10px; border: 0; background: transparent; box-shadow: none; min-height: 0; color: var(--text); font: 500 13.5px/1.2 var(--fl-font); cursor: pointer; }
${S(".admin-group-header")} { font-weight: 600; }
${S(".admin-group-header, .admin-child-item", ":hover")} { background: var(--fl-soft); }
${S(".admin-child-item.active")} { background: var(--fl-blue); color: #ffffff; box-shadow: 0 4px 12px color-mix(in srgb, var(--fl-blue) 28%, transparent); }
${S(".admin-nav-icon")} { background: color-mix(in srgb, var(--fl-blue) 12%, #ffffff); color: var(--fl-blue); box-shadow: none; border-radius: 8px; }
${S(".admin-child-icon")} { color: var(--fl-blue); }
${S(".admin-child-item.active .admin-child-icon")} { color: #ffffff; }

/* ---------- 10. Inputs, drop-downs, dates, checkboxes, radios, switches ---------- */
${S(TEXT_INPUTS)} {
  box-sizing: border-box; min-height: 36px; padding: 7px 12px; border-radius: 10px; border: 1px solid var(--fl-field-line);
  background-color: var(--fl-field); color: var(--text); font: 500 13.5px/1.3 var(--fl-font); box-shadow: none; outline: none;
  transition: border-color .15s, box-shadow .15s; }
${S("textarea")} { line-height: 1.45; }
${S("select")} {
  -webkit-appearance: none; appearance: none; box-sizing: border-box; min-height: 36px; padding: 7px 32px 7px 12px; border-radius: 10px;
  border: 1px solid var(--fl-field-line); background-color: var(--fl-field); background-image: ${CHEVRON}; background-repeat: no-repeat;
  background-position: right 9px center; background-size: 12px 12px; color: var(--text); font: 500 13.5px/1.3 var(--fl-font); box-shadow: none; cursor: pointer; }
${S("select option")} { background: #ffffff; color: var(--text); }
${S(TEXT_INPUTS + ", select", ":hover:not(:disabled)")} { border-color: color-mix(in srgb, var(--fl-blue) 45%, var(--fl-field-line)); }
${S(TEXT_INPUTS + ", select", ":focus")} { outline: none; border-color: var(--fl-blue); box-shadow: 0 0 0 3px color-mix(in srgb, var(--fl-blue) 18%, transparent); }
${S(TEXT_INPUTS + ", select", ":disabled")} { background-color: var(--disabled-bg); color: var(--text-soft); opacity: 1; cursor: not-allowed; }
${S('input[type="date"], input[type="datetime-local"], input[type="time"], input[type="month"]')} { color-scheme: light; }
${F} input${X}::placeholder, ${F} textarea${X}::placeholder { color: color-mix(in srgb, var(--text-soft) 75%, transparent); }
${S(".field label")} { font: 700 11px/1.3 var(--fl-font); letter-spacing: .05em; text-transform: uppercase; color: var(--text-soft); margin-bottom: 5px; }
${S('input[type="checkbox"], input[type="radio"]')} { accent-color: var(--fl-blue); }
${S(".neu-check-box")} { width: 18px; height: 18px; border-radius: 5px; background: #ffffff; border: 1.5px solid var(--fl-field-line); box-shadow: none; }
${S(".neu-check-input:checked + .neu-check-box")} { background: var(--fl-blue); border-color: var(--fl-blue); color: #ffffff; box-shadow: none; }
${S(".neu-check-input:focus-visible + .neu-check-box")} { box-shadow: 0 0 0 3px color-mix(in srgb, var(--fl-blue) 22%, transparent); }
${S(".neu-toggle")} { width: 40px; height: 22px; min-height: 0; padding: 0; border-radius: 999px; border: 1.5px solid var(--fl-field-line); background: #ffffff; box-shadow: none; position: relative; cursor: pointer; transition: background .16s, border-color .16s; }
${S('.neu-toggle[data-on="true"]')} { background: var(--fl-blue); border-color: var(--fl-blue); box-shadow: none; }
${S(".neu-toggle-knob")} { top: 2px; left: 2px; width: 15px; height: 15px; background: var(--text-soft); box-shadow: none; transition: transform .16s var(--fl-ease), background .16s; }
${S('.neu-toggle[data-on="true"] .neu-toggle-knob')} { transform: translateX(18px); background: #ffffff; }
${S('[role="switch"]:not(.neu-toggle), [role="radio"]')} { border-radius: var(--fl-r-md) !important; }

/* ---------- screen checks (checklist 11-18) ---------- */
/* page headers used by the queues and most screens: title plus a plain-text subtitle */
${S(".header h1")} { font: 700 26px/1.2 var(--fl-font); letter-spacing: -0.01em; color: var(--text); }
${S(".header .sub, .header > span.sub")} { font: 400 13.5px/1.4 var(--fl-font); color: var(--text-soft); letter-spacing: 0; }
/* unit codes and counts: the dashboard shows them in the body font, bold, with even digits */
${S(".code, .review-card-code, .review-card-issue-count")} { font-family: var(--fl-font); font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: -0.01em; }
${S(".review-card-desc")} { color: var(--text-soft); }
/* ---------- report wizard (checklist 25) ---------- */
/* Pass / Fail pair on each checklist row (small buttons with inline styles, hence !important):
   unselected = outlined, Pass selected = green, Fail selected = red, as in the other themes. */
${S('button.ghost[style*="padding: 6px 10px"]')} { background: #ffffff !important; color: var(--text-soft) !important; border: 1px solid var(--fl-field-line) !important; box-shadow: none !important; min-height: 30px; }
${S('button.ghost[style*="padding: 6px 10px"]', ":hover:not(:disabled)")} { border-color: var(--fl-blue) !important; color: var(--fl-blue) !important; }
${S('button.ghost[style*="padding: 6px 10px"][style*="var(--accent)"]')} { background: var(--success) !important; color: #ffffff !important; border-color: var(--success) !important; }
${S('button.danger[style*="padding: 6px 10px"]')} { background: var(--danger) !important; color: #ffffff !important; border-color: var(--danger) !important; min-height: 30px; }
/* compact drop-downs inside the checklist grid so "Major / Critical" and "Moderate" stay readable */
${S(".neu-select")} { --field-px: 8px; --select-pr: 22px; font-size: 12px; background-position: right 7px center; background-size: 10px 10px; }
/* "Beta: n days left" banner (inline styles in TrialGate.tsx, hence !important) */
${F} .trial-banner { font-family: var(--fl-font) !important; color: var(--warn) !important; background: #ffffff !important; border: 1px solid color-mix(in srgb, var(--warn) 30%, transparent); box-shadow: var(--fl-shadow-2) !important; padding: 7px 14px !important; }
/* main menu tiles: the icon square turns solid blue on hover, as on the dashboard quick actions */
${S(".menu-card", ":hover .menu-icon-wrap")} { background: var(--fl-blue); color: #ffffff; }
`;


export const FLUENT_THEME_CSS = `
/* Screen only: printed reports and PDFs keep the plain document look of the other themes. */
@media screen {
/* ---------- 1. MMS theme tokens for Fluent (same names every theme uses) ---------- */
html[data-fluent], [data-theme="fluent"] {
  --surface: #ffffff;
  --text: #1a1d1f;
  --text-soft: #5f6b7a;
  --accent: #2f6fed;
  --accent-soft: #e6eefd;
  --accent-blue: #2f6fed;
  --accent-blue-deep: #1a4d8f;
  --chart-violet: #7c61cc;
  --chart-green: #3d9463;
  --hover-highlight: #e9f1fe;
  --warn: #a3591b;
  --warn-soft: #faeeda;
  --danger: #a32d2d;
  --danger-soft: #fcebeb;
  --success: #1f7a4d;
  --success-soft: #dcf3e4;
  --mono: ui-monospace, "Cascadia Mono", Consolas, monospace;
  /* page background: the dashboard background (light grey with a hint of blue) */
  --bg: color-mix(in srgb, #2f6fed 6%, #f3f4f5);
  --border: color-mix(in srgb, #1a1d1f 10%, transparent);
  /* panels are white cards with a soft blue shadow instead of the neumorphic raised look */
  --neu-bg: #ffffff;
  --neu-shadow-dark: color-mix(in srgb, #1a4d8f 12%, transparent);
  --neu-shadow-light: #ffffff;
  --radius: 14px;
  /* running-in-foot counter colour (uses --accent in the other themes; Fluent's accent is blue like OH) */
  --trig-rif: #0f6e56;
  /* Fluent 2 tokens shared with the dashboards (same file, so both stay in step) */
${FL_TOKENS}
  /* written out in full: --fl-font itself falls back to --sans, so pointing --sans at it would loop */
  --sans: "Segoe UI Variable Text", "Segoe UI Variable", "Segoe UI", Aptos, system-ui, sans-serif;
}
html[data-fluent] { color-scheme: light; }

/* The dashboards already draw their own Fluent background and teal tones; keep them exactly as in Light. */
html[data-fluent] .fl-shell { --fl-bg: var(--bg); --fl-teal: #0f6e56; }

/* ---------- 3. App-wide base ---------- */
html[data-fluent], html[data-fluent] body, html[data-fluent] .app { font-family: var(--fl-font); color: var(--text); background: var(--bg); -webkit-font-smoothing: antialiased; }
html[data-fluent] .content { background: var(--bg); }
html[data-fluent] h1, html[data-fluent] h2, html[data-fluent] h3, html[data-fluent] h4 {
  font-family: var(--fl-font); color: var(--text); letter-spacing: -0.01em; }
html[data-fluent] h1, html[data-fluent] h2 { font-weight: 700; }
html[data-fluent] h3, html[data-fluent] h4 { font-weight: 600; }
html[data-fluent] a { color: var(--fl-blue); text-underline-offset: 2px; }
html[data-fluent] a:hover { color: var(--fl-navy); }
html[data-fluent] :focus-visible { outline: 2px solid var(--fl-blue); outline-offset: 2px; }
html[data-fluent] ::selection { background: color-mix(in srgb, var(--fl-blue) 22%, transparent); }
html[data-fluent] * { scrollbar-width: thin; scrollbar-color: color-mix(in srgb, var(--fl-navy) 28%, transparent) transparent; }
html[data-fluent] code, html[data-fluent] kbd, html[data-fluent] pre { font-family: var(--mono); }
${CONTROLS}
}
`;
