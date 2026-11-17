// Styles for the support tools (Help button, menu, dialogs, support mode panel).
// Colours come from the MMS theme tokens so Light, Dark and macOS all work. Controls use
// !important where the app-wide neumorphic / macOS button and field rules would win.
export const SUPPORT_CSS = `
.sup-root { --sup-blue: var(--accent-blue, #2f6fed); --sup-card: var(--surface, #fff); --sup-line: color-mix(in srgb, var(--text, #1a1d1f) 11%, transparent);
  --sup-shadow: 0 2px 6px rgba(15, 30, 60, 0.10), 0 16px 40px rgba(15, 30, 60, 0.18);
  --sup-font: "Segoe UI Variable Text", "Segoe UI", var(--sans, system-ui), sans-serif; font-family: var(--sup-font); color: var(--text); }
.sup-root button { font-family: inherit; }

/* Help button and menu */
.sup-help { position: fixed; right: 18px; bottom: 18px; z-index: 900; display: flex; flex-direction: column; align-items: flex-end; gap: 10px; }
.sup-root .sup-help-btn { all: unset; box-sizing: border-box; display: inline-flex !important; align-items: center; gap: 7px; height: 38px; padding: 0 15px 0 11px !important; border-radius: 999px !important;
  background: var(--sup-blue) !important; color: #fff !important; font: 600 13px/1 var(--sup-font) !important; cursor: pointer; box-shadow: 0 6px 18px color-mix(in srgb, var(--sup-blue) 40%, transparent) !important;
  transition: transform 0.15s, box-shadow 0.15s; }
.sup-root .sup-help-btn:hover { transform: translateY(-2px); }
.sup-root .sup-help-btn:active { transform: scale(0.96); }
.sup-root .sup-help-btn.is-support { background: #b45309 !important; }
.sup-help-btn svg { width: 19px; height: 19px; }
.sup-menu { width: 300px; padding: 6px; border-radius: 16px; background: var(--sup-card); border: 1px solid var(--sup-line); box-shadow: var(--sup-shadow); animation: sup-in 0.18s ease-out; }
.sup-menu-head { padding: 8px 10px 6px; font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-soft); }
.sup-root .sup-menu-item { all: unset; box-sizing: border-box; display: flex !important; align-items: center; gap: 11px; width: 100%; padding: 8px 10px !important; border-radius: 10px !important; cursor: pointer; color: var(--text) !important; }
.sup-root .sup-menu-item:hover, .sup-root .sup-menu-item:focus-visible { background: color-mix(in srgb, var(--sup-blue) 9%, transparent) !important; }
.sup-menu-ico { width: 32px; height: 32px; flex: none; border-radius: 50%; display: grid; place-items: center; color: var(--sup-blue); background: color-mix(in srgb, var(--sup-blue) 11%, transparent); }
.sup-menu-ico svg { width: 17px; height: 17px; }
.sup-menu-text { display: flex; flex-direction: column; min-width: 0; }
.sup-menu-text b { font-size: 13.5px; font-weight: 600; }
.sup-menu-text small { font-size: 11.5px; color: var(--text-soft); }

/* Error pill and toast */
.sup-pill { position: fixed; right: 18px; bottom: 66px; z-index: 901; display: flex; align-items: center; gap: 10px; max-width: min(520px, calc(100vw - 36px)); padding: 9px 10px 9px 12px;
  border-radius: 14px; background: var(--sup-card); border: 1px solid color-mix(in srgb, var(--danger, #a32d2d) 35%, transparent); box-shadow: var(--sup-shadow); animation: sup-in 0.22s ease-out; }
.sup-pill-ico { width: 30px; height: 30px; flex: none; border-radius: 50%; display: grid; place-items: center; color: var(--danger, #a32d2d); background: color-mix(in srgb, var(--danger, #a32d2d) 12%, transparent); }
.sup-pill-ico svg { width: 17px; height: 17px; }
.sup-pill-text { display: flex; flex-direction: column; min-width: 0; }
.sup-pill-text b { font-size: 13px; }
.sup-pill-text small { font-size: 12px; color: var(--text-soft); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sup-root .sup-pill-btn { all: unset; box-sizing: border-box; flex: none; padding: 6px 12px !important; border-radius: 999px !important; background: var(--danger, #a32d2d) !important; color: #fff !important;
  font: 600 12px/1.2 var(--sup-font) !important; cursor: pointer; }
.sup-root .sup-x { all: unset; box-sizing: border-box; width: 28px; height: 28px; flex: none; display: grid !important; place-items: center; border-radius: 50% !important; cursor: pointer;
  font-size: 19px; line-height: 1; color: var(--text-soft) !important; }
.sup-root .sup-x:hover { background: var(--sup-line) !important; color: var(--text) !important; }
.sup-toast { position: fixed; left: 50%; bottom: 22px; transform: translateX(-50%); z-index: 1002; max-width: min(640px, calc(100vw - 40px)); padding: 11px 18px; border-radius: 12px;
  background: color-mix(in srgb, var(--text, #1a1d1f) 92%, transparent); color: var(--surface, #fff); font-size: 13px; box-shadow: var(--sup-shadow); animation: sup-in 0.2s ease-out; }

/* Dialogs */
.sup-overlay { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; padding: 20px; background: rgba(10, 18, 35, 0.42); animation: sup-fade 0.15s ease-out; }
.sup-dialog { width: min(560px, 100%); max-height: calc(100vh - 40px); display: flex; flex-direction: column; border-radius: 20px; background: var(--sup-card); border: 1px solid var(--sup-line);
  box-shadow: var(--sup-shadow); animation: sup-in 0.2s ease-out; overflow: hidden; }
.sup-dialog.is-wide { width: min(760px, 100%); }
.sup-dialog-head { display: flex; align-items: center; gap: 12px; padding: 18px 18px 6px 22px; }
.sup-dialog-head h3 { margin: 0; flex: 1; font-size: 18px; font-weight: 700; letter-spacing: -0.01em; }
.sup-dialog-ico { width: 38px; height: 38px; flex: none; border-radius: 50%; display: grid; place-items: center; color: #fff; background: linear-gradient(140deg, var(--sup-blue), color-mix(in oklab, var(--sup-blue) 55%, var(--accent, #0f6e56))); }
.sup-dialog-ico svg { width: 20px; height: 20px; }
.sup-dialog-body { padding: 8px 22px 16px; overflow: auto; font-size: 13.5px; line-height: 1.5; }
.sup-dialog-foot { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; padding: 12px 18px 16px; border-top: 1px solid var(--sup-line); }
.sup-root .sup-dialog-foot button { display: inline-flex !important; align-items: center; gap: 6px; padding: 8px 15px !important; border-radius: 10px !important; font: 600 13px/1.2 var(--sup-font) !important;
  box-shadow: none !important; border: 1px solid var(--sup-line) !important; background: var(--sup-card) !important; color: var(--text) !important; cursor: pointer; }
.sup-root .sup-dialog-foot button.primary { background: var(--sup-blue) !important; color: #fff !important; border-color: transparent !important; }
.sup-root .sup-dialog-foot button:disabled { opacity: 0.45; cursor: not-allowed; }
.sup-dialog-foot svg { width: 15px; height: 15px; }
.sup-muted { color: var(--text-soft); margin: 4px 0 12px; }
.sup-err { color: var(--danger, #a32d2d); font-weight: 600; }
.sup-kv { display: grid; gap: 0; margin: 4px 0 10px; }
.sup-kv > div { display: grid; grid-template-columns: 170px minmax(0, 1fr); gap: 12px; padding: 7px 0; border-bottom: 1px solid var(--sup-line); }
.sup-kv dt { color: var(--text-soft); font-weight: 600; font-size: 12.5px; }
.sup-kv dd { margin: 0; word-break: break-word; }
.sup-details summary { cursor: pointer; font-weight: 600; color: var(--sup-blue); margin: 4px 0 8px; }
.sup-tablegrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 4px 14px; font-size: 12px; }
.sup-tablegrid span { display: flex; justify-content: space-between; gap: 8px; border-bottom: 1px dotted var(--sup-line); padding: 2px 0; }
.sup-field { display: flex; flex-direction: column; gap: 5px; margin: 0 0 12px; }
.sup-field > span { font-size: 12px; font-weight: 600; color: var(--text-soft); }
.sup-field > span b { color: var(--danger, #a32d2d); }
.sup-root .sup-field textarea, .sup-root .sup-field input, .sup-root .sup-panel input[type="search"] { width: 100% !important; box-sizing: border-box !important; padding: 8px 10px !important; border-radius: 10px !important;
  border: 1px solid var(--sup-line) !important; background: var(--sup-card) !important; color: var(--text) !important; box-shadow: none !important; font: 400 13.5px/1.4 var(--sup-font) !important; resize: vertical; }
.sup-root .sup-field textarea:focus, .sup-root .sup-field input:focus { outline: none; border-color: var(--sup-blue) !important; box-shadow: 0 0 0 3px color-mix(in srgb, var(--sup-blue) 18%, transparent) !important; }
.sup-paste { border: 2px dashed var(--sup-line); border-radius: 12px; padding: 12px; text-align: center; color: var(--text-soft); outline: none; }
.sup-paste:focus { border-color: var(--sup-blue); background: color-mix(in srgb, var(--sup-blue) 5%, transparent); }
.sup-paste p { margin: 0; font-size: 12.5px; line-height: 1.7; }
.sup-paste img { max-width: 100%; max-height: 220px; border-radius: 8px; display: block; margin: 0 auto 8px; }
.sup-paste kbd { font: 600 11px var(--sup-font); padding: 1px 6px; border-radius: 5px; border: 1px solid var(--sup-line); background: var(--sup-card); }
.sup-link { color: var(--sup-blue); font-weight: 600; cursor: pointer; text-decoration: underline; }
.sup-check { display: inline-flex; align-items: center; gap: 7px; font-size: 13px; cursor: pointer; }
.sup-check input { width: 16px; height: 16px; accent-color: var(--sup-blue); }
.sup-done { display: flex; gap: 14px; align-items: flex-start; }
.sup-done-ico { width: 40px; height: 40px; flex: none; border-radius: 50%; display: grid; place-items: center; color: var(--success, #1f7a4d); background: color-mix(in srgb, var(--success, #1f7a4d) 14%, transparent); }
.sup-done-ico svg { width: 22px; height: 22px; }
.sup-done p { margin: 4px 0 0; }
.sup-spin { display: inline-block; width: 14px; height: 14px; margin-right: 6px; vertical-align: -2px; border-radius: 50%; border: 2px solid color-mix(in srgb, var(--sup-blue) 25%, transparent);
  border-top-color: var(--sup-blue); animation: sup-rot 0.8s linear infinite; }
.sup-pre { max-height: 140px; overflow: auto; font-size: 11.5px; padding: 8px; border-radius: 8px; background: color-mix(in srgb, var(--text) 5%, transparent); white-space: pre-wrap; }
.sup-summary { margin: 0 0 10px; padding: 10px 14px; border-radius: 12px; font-weight: 600; }
.sup-summary.is-ok { color: var(--success, #1f7a4d); background: color-mix(in srgb, var(--success, #1f7a4d) 11%, transparent); }
.sup-summary.is-bad { color: var(--warn, #a3591b); background: color-mix(in srgb, var(--warn, #a3591b) 12%, transparent); }
.sup-checks { list-style: none; margin: 0; padding: 0; }
.sup-checks li { display: flex; gap: 12px; align-items: flex-start; padding: 9px 2px; border-bottom: 1px solid var(--sup-line); }
.sup-checks li i { width: 24px; height: 24px; flex: none; border-radius: 50%; display: grid; place-items: center; font-style: normal; font-weight: 700; font-size: 13px; color: #fff; }
.sup-checks li.is-ok i { background: var(--success, #1f7a4d); }
.sup-checks li.is-warn i { background: var(--st-amber, #d97706); }
.sup-checks li.is-error i { background: var(--danger, #a32d2d); }
.sup-checks li.is-skip i { background: var(--text-soft); }
.sup-checks li div { display: flex; flex-direction: column; gap: 2px; }
.sup-checks li small { color: var(--text-soft); }

/* Support mode panel (#10) */
.sup-panel { position: fixed; left: 16px; bottom: 16px; z-index: 950; width: min(640px, calc(100vw - 32px)); height: min(380px, 50vh); display: flex; flex-direction: column;
  border-radius: 16px; background: var(--sup-card); border: 2px solid #b45309; box-shadow: var(--sup-shadow); overflow: hidden; animation: sup-in 0.2s ease-out; font-size: 12px; }
.sup-panel-head { display: flex; align-items: center; gap: 10px; padding: 8px 8px 8px 12px; background: color-mix(in srgb, #b45309 12%, var(--sup-card)); }
.sup-panel-head > b { display: inline-flex; align-items: center; gap: 7px; font-size: 13px; color: #b45309; }
.sup-live { width: 8px; height: 8px; border-radius: 50%; background: #b45309; animation: sup-blink 1.4s ease-in-out infinite; }
.sup-tabs { display: flex; gap: 2px; margin-left: auto; padding: 2px; border-radius: 999px; background: var(--sup-line); }
.sup-root .sup-tabs button { all: unset; cursor: pointer; padding: 3px 10px !important; border-radius: 999px !important; font: 600 11.5px var(--sup-font) !important; color: var(--text-soft) !important; }
.sup-root .sup-tabs button.is-on { background: var(--sup-card) !important; color: var(--text) !important; }
.sup-panel-tools { display: flex; align-items: center; gap: 10px; padding: 6px 10px; border-bottom: 1px solid var(--sup-line); }
.sup-root .sup-panel-tools input[type="search"] { padding: 4px 8px !important; font-size: 12px !important; max-width: 220px; }
.sup-root .sup-panel-tools button { padding: 3px 10px !important; font-size: 11.5px !important; box-shadow: none !important; border: 1px solid var(--sup-line) !important; border-radius: 8px !important; background: var(--sup-card) !important; }
.sup-panel-body { flex: 1; overflow: auto; }
.sup-panel table { width: 100%; border-collapse: collapse; }
.sup-panel th { position: sticky; top: 0; text-align: left; padding: 5px 8px; background: var(--sup-card); color: var(--text-soft); font-weight: 600; border-bottom: 1px solid var(--sup-line); }
.sup-panel td { padding: 4px 8px; border-bottom: 1px solid var(--sup-line); vertical-align: top; }
.sup-panel td code { font-size: 11.5px; }
.sup-panel td small { display: block; color: var(--text-soft); font-size: 10.5px; }
.sup-panel tr.is-err td { color: var(--danger, #a32d2d); background: color-mix(in srgb, var(--danger, #a32d2d) 6%, transparent); }
.sup-panel td.is-slow { color: var(--st-amber, #d97706); font-weight: 700; }
.sup-steps { margin: 0; padding: 6px 12px 10px 34px; }
.sup-steps li { padding: 3px 0; }
.sup-steps li span { display: inline-block; min-width: 64px; color: var(--text-soft); font-variant-numeric: tabular-nums; }
.sup-steps li small { margin-left: 8px; color: var(--text-soft); }
.sup-steps li.is-err { color: var(--danger, #a32d2d); }

@keyframes sup-in { from { opacity: 0; transform: translateY(6px) scale(0.98); } to { opacity: 1; transform: none; } }
@keyframes sup-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes sup-rot { to { transform: rotate(360deg); } }
@keyframes sup-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
@media (prefers-reduced-motion: reduce) { .sup-root * { animation: none !important; transition: none !important; } }
`;
