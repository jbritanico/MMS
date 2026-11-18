// One look for every filter control in the dashboard area (MR-I filter bar, the shared country /
// service line bar, "Group by" pickers, search boxes), built from the app's theme tokens so it
// follows the theme the user picked. Plus the grouped MR-II / MR-III counters on Asset MR-I History.

const CHEVRON = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M2.5 4.5 6 8l3.5-3.5' fill='none' stroke='%237b8494' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`;

const SEL = [
  ".fl-shell .mrid-filters select", ".fl-shell .mrid-filters input",
  ".fl-shell .fl-scope select",
  ".fl-shell .mrid-inline select", ".fl-shell .mrid-panel-head select",
];
const all = (suffix = "") => SEL.map((s) => s + suffix).join(", ");
const SELECTS = SEL.filter((s) => s.endsWith("select")).join(", ");
const INPUTS = ".fl-shell .mrid-filters input";

export const CONTROLS_CSS = `
.fl-shell { --fl-field: color-mix(in srgb, var(--fl-blue) 4%, var(--fl-card)); --fl-field-line: color-mix(in srgb, var(--text-soft) 28%, transparent); }

/* labels: small caps above every control */
.fl-shell .mrid-filters .mrid-field, .fl-shell .fl-scope-field { display: inline-flex !important; flex-direction: column !important; align-items: stretch !important; gap: 5px !important; }
.fl-shell .mrid-filters .mrid-field > span, .fl-shell .fl-scope-field > span, .fl-shell .mrid-inline > span {
  font: 700 10.5px/1.2 var(--fl-font, inherit) !important; letter-spacing: .06em !important; text-transform: uppercase !important; color: var(--text-soft) !important; }
.fl-shell .mrid-inline { display: inline-flex !important; align-items: center !important; gap: 8px !important; }

/* the control itself */
${all()} {
  -webkit-appearance: none !important; appearance: none !important; box-sizing: border-box !important;
  height: 36px !important; min-height: 36px !important; margin: 0 !important; padding: 0 32px 0 12px !important;
  border-radius: 10px !important; border: 1px solid var(--fl-field-line) !important;
  background-color: var(--fl-field) !important; background-image: none !important; box-shadow: none !important; text-shadow: none !important;
  color: var(--text) !important; font: 500 13px/1.2 var(--fl-font, inherit) !important; cursor: pointer;
  transition: border-color .15s, box-shadow .15s, background-color .15s; }
${SELECTS} { background-image: ${CHEVRON} !important; background-repeat: no-repeat !important; background-position: right 10px center !important; background-size: 12px 12px !important; min-width: 140px; }
${INPUTS} { padding-right: 10px !important; cursor: text; color-scheme: light dark; }
${all(":hover")} { border-color: color-mix(in srgb, var(--fl-blue) 45%, var(--fl-field-line)) !important; }
${all(":focus")}, ${all(":focus-visible")} { outline: none !important; border-color: var(--fl-blue) !important; box-shadow: 0 0 0 3px color-mix(in srgb, var(--fl-blue) 18%, transparent) !important; }
${SEL.filter((s) => s.endsWith("select")).map((s) => s + " option").join(", ")} { background: var(--fl-card); color: var(--text); }
.fl-shell .mrid-headrow .mrid-field select { width: auto !important; min-width: 150px; max-width: 230px; }
.fl-shell .mrid-headrow .mrid-field input { width: 150px !important; }
.fl-shell .mrid-headrow .mrid-stepper input { width: 150px !important; }

/* period stepper: ‹ input › as one group */
.fl-shell .mrid-filters .mrid-stepper { display: inline-flex !important; align-items: center; gap: 6px; }
.fl-shell .mrid-filters .mrid-stepper button { all: unset; box-sizing: border-box; width: 36px !important; height: 36px !important; display: inline-grid !important; place-items: center;
  border-radius: 10px !important; border: 1px solid var(--fl-field-line) !important; background: var(--fl-field) !important; color: var(--text-soft) !important;
  font: 600 16px/1 var(--fl-font, inherit) !important; cursor: pointer; transition: border-color .15s, color .15s; }
.fl-shell .mrid-filters .mrid-stepper button:hover { color: var(--fl-blue) !important; border-color: color-mix(in srgb, var(--fl-blue) 45%, var(--fl-field-line)) !important; }
.fl-shell .mrid-filters .mrid-stepper button:focus-visible { outline: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--fl-blue) 18%, transparent); border-color: var(--fl-blue) !important; }

/* reset: the same pill everywhere */
.fl-shell .mrid-filters .mrid-reset, .fl-shell .fl-scope-reset { all: unset; box-sizing: border-box; display: inline-flex !important; align-items: center; gap: 6px; align-self: flex-end;
  height: 36px !important; padding: 0 16px !important; border-radius: 999px !important; cursor: pointer;
  font: 600 12.5px/1 var(--fl-font, inherit) !important; color: var(--fl-blue) !important;
  background: color-mix(in srgb, var(--fl-blue) 9%, transparent) !important; border: 1px solid color-mix(in srgb, var(--fl-blue) 24%, transparent) !important; transition: background .15s; }
.fl-shell .mrid-filters .mrid-reset:hover, .fl-shell .fl-scope-reset:hover { background: color-mix(in srgb, var(--fl-blue) 16%, transparent) !important; }
.fl-shell .mrid-filters .mrid-reset:focus-visible, .fl-shell .fl-scope-reset:focus-visible { outline: 2px solid var(--fl-blue); outline-offset: 2px; }
.fl-shell .fl-scope { align-items: flex-end !important; }
.fl-shell .fl-scope-ico { align-self: flex-end; margin-bottom: 3px; }
.fl-shell .fl-scope-count { align-self: flex-end; line-height: 36px; }
.fl-shell .mrid-headrow .mrid-period { font-size: 11.5px; color: var(--text-soft); }

/* search boxes match the controls */
.fl-shell .fl-toolbar-search input { height: 36px !important; border-radius: 10px !important; border: 1px solid var(--fl-field-line) !important; background: var(--fl-field) !important; }

/* ---- Asset MR-I History: counters grouped by MR level ---- */
.fl-cnt-list { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; border-radius: 12px; background: color-mix(in srgb, var(--fl-blue) 4%, var(--fl-card)); border: 1px solid color-mix(in srgb, var(--fl-line) 70%, transparent); }
.fl-cnt-group { display: grid; grid-template-columns: 52px minmax(0, 1fr); gap: 10px; align-items: start; }
.fl-cnt-group + .fl-cnt-group { padding-top: 8px; border-top: 1px dashed color-mix(in srgb, var(--text-soft) 25%, transparent); }
.fl-cnt-level { display: inline-flex; align-items: center; justify-content: center; height: 22px; padding: 0 8px; border-radius: 999px; white-space: nowrap;
  font: 700 10.5px/1 var(--fl-font, inherit); letter-spacing: .02em; color: var(--tone, var(--fl-blue));
  background: color-mix(in srgb, var(--tone, var(--fl-blue)) 13%, transparent); border: 1px solid color-mix(in srgb, var(--tone, var(--fl-blue)) 30%, transparent); }
.fl-cnt-level.lg { height: 30px; padding: 0 12px; font-size: 12.5px; }
.fl-cnt-rows { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.fl-cnt-row { display: grid; grid-template-columns: 16px minmax(0, 1fr) auto; grid-template-areas: "ico name val" ". bar bar"; align-items: center; column-gap: 7px; row-gap: 4px; font-size: 12px; }
.fl-cnt-ico { grid-area: ico; } .fl-cnt-name { grid-area: name; } .fl-cnt-val { grid-area: val; }
.fl-cnt-ico { display: inline-flex; } .fl-cnt-ico svg { width: 15px; height: 15px; }
.fl-cnt-name { color: var(--text-soft); white-space: nowrap; }
.fl-cnt-row .fl-meter { grid-area: bar; width: auto !important; min-width: 0; }
.fl-cnt-val { color: var(--text-soft); white-space: nowrap; font-variant-numeric: tabular-nums; text-align: right; }
.fl-cnt-val b { color: var(--text); font-weight: 650; }

.fl-cnt-board { margin-top: 12px; padding: 16px 18px 18px; border-radius: var(--fl-r-lg, 16px); background: color-mix(in srgb, var(--tone) 4%, var(--fl-card));
  border: 1px solid var(--fl-line); border-left: 4px solid var(--tone); box-shadow: var(--fl-shadow-1); }
.fl-cnt-board-head { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; }
.fl-cnt-board-head .fl-cnt-level { --tone: var(--fl-blue); }
.fl-cnt-board-text { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 200px; }
.fl-cnt-board-text b { font-size: 15px; font-weight: 650; color: var(--text); }
.fl-cnt-board-text small { font-size: 12.5px; color: var(--text-soft); }
.fl-cnt-state { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 700; color: var(--tone);
  background: color-mix(in srgb, var(--tone) 13%, transparent); }
.fl-cnt-state i { width: 7px; height: 7px; border-radius: 50%; background: var(--tone); }
.fl-shell .fl-cnt-board .mri-stat-grid { margin-top: 14px; }
/* Simple / Advanced switch on the Overview (same look as on the MR-I dashboards) */
.fl-shell .fl-ov-mode { display: flex; justify-content: flex-end; margin: -4px 0 -6px; }
.fl-shell .fl-ov-mode .mrid-mode { display: flex; width: fit-content; align-items: center; gap: 8px; margin: 0; }
.fl-shell .fl-ov-mode .mrid-mode-label { font-size: 10.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--text-soft); }
`;
