import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MainMenu from "./features/main-menu/MainMenu";
import AssetRegistry from "./features/asset-registry/AssetRegistry";
import MaintenanceReport from "./features/maintenance-report/MaintenanceReport";
import Dashboard from "./features/dashboard/Dashboard";
import Administration from "./features/administration/Administration";

type Screen = "menu" | "assets" | "reports" | "dashboard" | "admin";

const LABELS: Record<Screen, string> = {
  menu: "Main Menu",
  assets: "Asset Registry",
  reports: "Maintenance Report",
  dashboard: "Dashboard",
  admin: "Administration",
};

const queryClient = new QueryClient();

function App() {
  const [screen, setScreen] = useState<Screen>("menu");

  return (
    <QueryClientProvider client={queryClient}>
      <div className="app">
        <style>{`
          :root {
            --bg: #f3f4f5;
            --neu-bg: #e7eaf0;
            --neu-shadow-dark: #b9bfca;
            --neu-shadow-light: #ffffff;
            --surface: #ffffff;
            --border: #e0e2e5;
            --text: #1a1d1f;
            --text-soft: #6b7280;
            --accent: #0f6e56;
            --accent-soft: #e1f5ee;
            --warn: #a3591b;
            --warn-soft: #faeeda;
            --danger: #a32d2d;
            --danger-soft: #fcebeb;
            --radius: 10px;
            --mono: ui-monospace, "JetBrains Mono", Consolas, monospace;
            --sans: -apple-system, "Segoe UI", Inter, sans-serif;
          }
          * { box-sizing: border-box; }
          html, body, #root { height: 100%; margin: 0; }
          .app { font-family: var(--sans); background: var(--bg); color: var(--text); min-height: 100vh; display: flex; flex-direction: column; }

          .topband { background: #1a4d8f; color: #ffffff; padding: 12px clamp(16px, 3vw, 32px); display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
          .topband .title-main { font-size: 16px; font-weight: 600; letter-spacing: -0.01em; }
          .topband .title-sep { color: rgba(255,255,255,0.5); font-size: 14px; }
          .topband .title-sub { font-size: 13px; font-weight: 400; color: rgba(255,255,255,0.85); }
          .back-btn { background: rgba(255,255,255,0.15); border: none; color: #fff; border-radius: 6px; padding: 5px 10px; font-size: 12px; cursor: pointer; margin-right: 4px; }
          .back-btn:hover { background: rgba(255,255,255,0.25); }

          .content { flex: 1; min-width: 0; overflow-y: auto; padding: clamp(16px, 3vw, 32px); }

          .content:has(.menu-grid) { background: var(--neu-bg); }
          .menu-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 28px;
            max-width: 820px;
            margin: 40px auto 0;
          }
          .menu-card {
            background: var(--neu-bg);
            border-radius: 22px;
            padding: 32px 22px;
            text-align: center;
            cursor: pointer;
            border: none;
            box-shadow: 9px 9px 18px var(--neu-shadow-dark), -9px -9px 18px var(--neu-shadow-light);
            transition: box-shadow 0.18s, transform 0.18s;
          }
          .menu-card:hover {
            transform: translateY(-3px);
            box-shadow: 12px 12px 22px var(--neu-shadow-dark), -12px -12px 22px var(--neu-shadow-light);
          }
          .menu-card:active {
            transform: translateY(0);
            box-shadow: inset 6px 6px 12px var(--neu-shadow-dark), inset -6px -6px 12px var(--neu-shadow-light);
          }
          .menu-icon-wrap {
            width: 60px;
            height: 60px;
            margin: 0 auto 16px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #2f6fed;
            background: var(--neu-bg);
            box-shadow: inset 5px 5px 10px var(--neu-shadow-dark), inset -5px -5px 10px var(--neu-shadow-light);
          }
          .menu-card h3 { font-size: 15px; margin: 0 0 6px; font-weight: 600; }
          .menu-card p { font-size: 12px; color: var(--text-soft); margin: 0; line-height: 1.4; }

          .header { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 20px; }
          .header h1 { font-size: clamp(18px, 2vw, 22px); font-weight: 600; margin: 0; letter-spacing: -0.01em; }
          .header .sub { font-size: 13px; color: var(--text-soft); font-family: var(--mono); }

          .layout { display: grid; grid-template-columns: minmax(280px, 340px) 1fr; gap: 20px; align-items: start; }
          @container (max-width: 720px) { .layout { grid-template-columns: 1fr; } }

          .panel { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; }
          .panel h2 { font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-soft); margin: 0 0 14px 0; }

          .field { margin-bottom: 12px; }
          .field label { display: block; font-size: 12px; color: var(--text-soft); margin-bottom: 4px; }
          .field input[type="text"], .field select {
            width: 100%; padding: 8px 10px; border: 1px solid var(--border); border-radius: 6px;
            font-size: 14px; font-family: var(--sans); background: var(--bg); color: var(--text);
          }
          .field input:focus, .field select:focus { outline: none; border-color: var(--accent); background: var(--surface); }

          .checks { display: flex; flex-wrap: wrap; gap: 14px; margin: 14px 0; }
          .check { display: flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer; user-select: none; }
          .check input { accent-color: var(--accent); width: 15px; height: 15px; }

          .actions { display: flex; gap: 8px; margin-top: 16px; }
          button {
            font-family: var(--sans); font-size: 13px; font-weight: 500; border-radius: 6px;
            border: 1px solid transparent; padding: 9px 16px; cursor: pointer; transition: opacity 0.15s;
          }
          button.primary { background: var(--accent); color: #ffffff; }
          button.primary:hover { opacity: 0.88; }
          button.ghost { background: transparent; border-color: var(--border); color: var(--text-soft); }
          button.ghost:hover { border-color: var(--text-soft); }

          .toast { margin-top: 12px; padding: 8px 12px; border-radius: 6px; font-size: 13px; }
          .toast.ok { background: var(--accent-soft); color: var(--accent); }
          .toast.err { background: var(--danger-soft); color: var(--danger); }

          .table-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 14px; flex-wrap: wrap; }
          .search { padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px; font-size: 13px; width: min(260px, 100%); background: var(--bg); }
          .count { font-size: 12px; color: var(--text-soft); font-family: var(--mono); }

          .cards { display: grid; gap: 10px; }
          .card { display: grid; grid-template-columns: 1fr auto; gap: 10px; align-items: center; border: 1px solid var(--border); border-radius: 8px; padding: 12px 14px; background: var(--bg); }
          .card-main { min-width: 0; }
          .code { font-family: var(--mono); font-size: 13px; font-weight: 600; letter-spacing: -0.01em; }
          .desc { font-size: 13px; color: var(--text-soft); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .meta { display: flex; gap: 8px; margin-top: 6px; flex-wrap: wrap; }
          .pill { font-size: 11px; padding: 2px 8px; border-radius: 20px; font-weight: 500; }
          .pill.active { background: var(--accent-soft); color: var(--accent); }
          .pill.inactive { background: var(--danger-soft); color: var(--danger); }
          .pill.neutral { background: var(--warn-soft); color: var(--warn); }
          .card-actions { display: flex; gap: 6px; flex-shrink: 0; }
          .card-actions button { padding: 6px 10px; font-size: 12px; }

          .empty { text-align: center; padding: 40px 20px; color: var(--text-soft); font-size: 13px; }

          .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 100; }
          .modal { background: var(--surface); border-radius: var(--radius); padding: 22px; width: min(380px, 90vw); box-shadow: 0 12px 32px rgba(0,0,0,0.2); }
          .modal-icon { width: 40px; height: 40px; border-radius: 50%; background: var(--danger-soft); color: var(--danger); display: flex; align-items: center; justify-content: center; margin-bottom: 12px; }
          .modal h3 { margin: 0 0 10px; font-size: 16px; }
          .modal p { margin: 0 0 18px; font-size: 13px; color: var(--text-soft); line-height: 1.5; }
          .modal-actions { display: flex; justify-content: flex-end; gap: 8px; }
          button.danger { background: var(--danger); color: #ffffff; }
          button.danger:hover { opacity: 0.88; }

          .placeholder-screen { text-align: center; padding: 80px 20px; color: var(--text-soft); }
          .placeholder-icon { font-size: 40px; margin-bottom: 12px; }
          .placeholder-screen h2 { font-size: 18px; color: var(--text); margin: 0 0 8px; }
          .placeholder-screen p { font-size: 13px; max-width: 360px; margin: 0 auto; }
        `}</style>

        <div className="topband">
          {screen !== "menu" && (
            <button className="back-btn" onClick={() => setScreen("menu")}>← Menu</button>
          )}
          <span className="title-main">Maintenance Management System</span>
          <span className="title-sep">|</span>
          <span className="title-sub">{LABELS[screen]}</span>
        </div>

        <div className="content">
          {screen === "menu" && <MainMenu onNavigate={setScreen} />}
          {screen === "assets" && <AssetRegistry />}
          {screen === "reports" && <MaintenanceReport />}
          {screen === "dashboard" && <Dashboard />}
        </div>
      </div>
    </QueryClientProvider>
  );
}

export default App;