import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MainMenu from "./features/main-menu/MainMenu";
import AssetRegistry from "./features/asset-registry/AssetRegistry";
import MaintenanceReport from "./features/maintenance-report/MaintenanceReport";
import Dashboard from "./features/dashboard/Dashboard";
import Administration from "./features/administration/Administration";
import MaintenanceTriggers from "./features/asset-registry/MaintenanceTriggers";
import LiquidGlassTest from "./features/ui-lab/LiquidGlassTest";

type Screen = "menu" | "assets" | "reports" | "dashboard" | "admin" | "triggers" | "uilab";
type MrLevel = "MR-I" | "MR-II" | "MR-III";

const LABELS: Record<Screen, string> = {
  menu: "Main Menu",
  assets: "Asset Registry",
  reports: "Maintenance Report",
  dashboard: "Dashboard",
  admin: "Administration",
  triggers: "Maintenance Triggers",
  uilab: "UI Lab",
};

const queryClient = new QueryClient();

function App() {
  const [screen, setScreen] = useState<Screen>("menu");
  const [mrLevel, setMrLevel] = useState<MrLevel | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<{ id: number; code: string } | null>(null);

  function handleNavigate(target: Screen, level?: MrLevel) {
    if (level) setMrLevel(level);
    setScreen(target);
  }

  function handleViewTriggers(assetId: number, assetCode: string) {
    setSelectedAsset({ id: assetId, code: assetCode });
    setScreen("triggers");
  }

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

         .topband {
            background: var(--neu-bg);
            color: var(--text);
            padding: 14px clamp(16px, 3vw, 32px);
            display: flex;
            align-items: center;
            gap: 10px;
            flex-shrink: 0;
            box-shadow: 0 4px 10px var(--neu-shadow-dark), 0 -2px 6px var(--neu-shadow-light);
            position: relative;
            z-index: 5;
          }
          .topband .title-main { font-size: 16px; font-weight: 600; letter-spacing: -0.01em; color: var(--text); }
          .topband .title-sep { color: var(--neu-shadow-dark); font-size: 14px; }
          .topband .title-sub { font-size: 13px; font-weight: 500; color: #2f6fed; }

          .back-btn {
            background: var(--neu-bg);
            border: none;
            color: var(--text-soft);
            border-radius: 10px;
            width: 32px;
            height: 32px;
            padding: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            margin-right: 4px;
            box-shadow: 3px 3px 6px var(--neu-shadow-dark), -3px -3px 6px var(--neu-shadow-light);
            transition: box-shadow 0.12s, color 0.12s, transform 0.12s;
          }
          .back-btn:hover { color: #2f6fed; }
          .back-btn:active {
            box-shadow: inset 2px 2px 4px var(--neu-shadow-dark), inset -2px -2px 4px var(--neu-shadow-light);
            transform: translateY(0);
          }
          .back-btn svg { width: 17px; height: 17px; }

          .content {
            flex: 1; min-width: 0; overflow-y: auto; padding: clamp(16px, 3vw, 32px); background: var(--neu-bg);
            container-type: inline-size;
          }
          .content { background: var(--neu-bg); }
          .menu-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: clamp(14px, 3cqi, 28px);
            max-width: min(1000px, 100%);
            margin: clamp(16px, 5cqi, 40px) auto 0;
          }
          @container (max-width: 680px) {
            .menu-grid { grid-template-columns: repeat(2, 1fr); }
          }
          @container (max-width: 380px) {
            .menu-grid { grid-template-columns: 1fr; }
          }
          .menu-card {
            background: var(--neu-bg);
            border-radius: 22px;
            padding: clamp(18px, 4cqi, 32px) clamp(14px, 3cqi, 22px);
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
            width: clamp(44px, 12cqi, 60px);
            height: clamp(44px, 12cqi, 60px);
            margin: 0 auto clamp(10px, 2.5cqi, 16px);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #07080a;
            background: var(--neu-bg);
            box-shadow: inset 5px 5px 10px var(--neu-shadow-dark), inset -5px -5px 10px var(--neu-shadow-light);
            transition: color 0.18s;
          }
          .menu-card:hover .menu-icon-wrap { color: #1a4d8f; }
          .menu-card:active .menu-icon-wrap { color: #0d2f5c; }
          .menu-icon-wrap svg { width: clamp(20px, 5cqi, 26px); height: clamp(20px, 5cqi, 26px); }

          .menu-card h3 { font-size: clamp(13px, 3cqi, 16px); margin: 0 0 6px; font-weight: 600; }
          .menu-card p { font-size: clamp(11px, 2.4cqi, 12.5px); color: var(--text-soft); margin: 0; line-height: 1.4; }

          .uilab-fab {
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 44px;
            height: 44px;
            border-radius: 50%;
            border: none;
            padding: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            color: var(--text-soft);
            background: var(--neu-bg);
            box-shadow: 5px 5px 10px var(--neu-shadow-dark), -5px -5px 10px var(--neu-shadow-light);
            transition: box-shadow 0.15s, color 0.15s, transform 0.15s;
            z-index: 10;
          }
          .uilab-fab:hover { color: #2f6fed; transform: translateY(-2px); }
          .uilab-fab:active {
            box-shadow: inset 3px 3px 6px var(--neu-shadow-dark), inset -3px -3px 6px var(--neu-shadow-light);
            transform: translateY(0);
          }
          .uilab-fab svg { width: 19px; height: 19px; }  
          
          .level-picker-overlay {
            position: fixed;
            inset: 0;
            background: rgba(231, 234, 240, 0.7);
            backdrop-filter: blur(3px);
            -webkit-backdrop-filter: blur(3px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 50;
            animation: picker-backdrop-in 0.2s ease-out;
          }
          @keyframes picker-backdrop-in {
            from { opacity: 0; }
            to { opacity: 1; }
          }

          .level-picker {
            display: flex;
            gap: 28px;
            flex-wrap: wrap;
            justify-content: center;
            padding: 20px;
          }

          .level-orb {
            width: 130px;
            height: 130px;
            border-radius: 50%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 2px;
            cursor: pointer;
            background: var(--neu-bg);
            box-shadow: 10px 10px 20px var(--neu-shadow-dark), -10px -10px 20px var(--neu-shadow-light);
            opacity: 0;
            transform: scale(0.8);
            animation: orb-in 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
            transition: box-shadow 0.15s, transform 0.15s;
          }
          @keyframes orb-in {
            from { opacity: 0; transform: scale(0.8); }
            to { opacity: 1; transform: scale(1); }
          }
          .level-orb:hover {
            transform: scale(1.05);
            box-shadow: 13px 13px 24px var(--neu-shadow-dark), -13px -13px 24px var(--neu-shadow-light);
          }
          .level-orb:active {
            transform: scale(0.97);
            box-shadow: inset 6px 6px 12px var(--neu-shadow-dark), inset -6px -6px 12px var(--neu-shadow-light);
          }

          .level-orb-short {
            font-size: 26px;
            font-weight: 700;
            color: #2f6fed;
          }
          .level-orb-label {
            font-size: 13px;
            font-weight: 600;
            color: var(--text);
            margin-top: 2px;
          }
          .level-orb-desc {
            font-size: 10.5px;
            color: var(--text-soft);
            text-align: center;
            padding: 0 10px;
          }          

          .header { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 20px; }
          .header h1 { font-size: clamp(18px, 2vw, 22px); font-weight: 600; margin: 0; letter-spacing: -0.01em; }
          .header .sub { font-size: 13px; color: var(--text-soft); font-family: var(--mono); }

          .layout { display: grid; grid-template-columns: minmax(280px, 340px) 1fr; gap: 20px; align-items: start; }
          @container (max-width: 720px) { .layout { grid-template-columns: 1fr; } }

          .panel {
            background: var(--neu-bg);
            border: none;
            border-radius: 20px;
            padding: 22px;
            box-shadow: 8px 8px 16px var(--neu-shadow-dark), -8px -8px 16px var(--neu-shadow-light);
          }
          .panel h2 { font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-soft); margin: 0 0 14px 0; }

          .field { margin-bottom: 12px; }
          .field label { display: block; font-size: 12px; color: var(--text-soft); margin-bottom: 4px; }
          .field input[type="text"], .field select {
            width: 100%; padding: 10px 12px; border: none; border-radius: 10px;
            font-size: 14px; font-family: var(--sans); background: var(--neu-bg); color: var(--text);
            box-shadow: inset 4px 4px 8px var(--neu-shadow-dark), inset -4px -4px 8px var(--neu-shadow-light);
          }
          .field input:disabled, .field select:disabled {
            background: #e9ebed; color: #6b7280; box-shadow: none; cursor: not-allowed;
          }
          .field input:focus, .field select:focus {
            outline: none;
            box-shadow: inset 5px 5px 10px var(--neu-shadow-dark), inset -5px -5px 10px var(--neu-shadow-light), 0 0 0 2px #2f6fed33;
          }

          .checks { display: flex; flex-wrap: wrap; gap: 14px; margin: 14px 0; }

          .trigger-table { display: flex; flex-direction: column; }
          .trigger-row {
            display: grid;
            grid-template-columns: 1.3fr 0.6fr 0.8fr 0.8fr 0.8fr 0.7fr 0.5fr;
            align-items: center;
            gap: 8px;
            padding: 10px 4px;
            font-size: 13px;
          }
          .trigger-row + .trigger-row {
            border-top: 1px solid var(--neu-shadow-light);
            box-shadow: 0 -1px 0 var(--neu-shadow-dark);
          }
          .trigger-head {
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.03em;
            color: var(--text-soft);
            font-weight: 600;
          }
          .trigger-row .pill { justify-self: start; }
          .trigger-input {
            width: 100%;
            padding: 6px 8px;
            border: none;
            border-radius: 8px;
            font-size: 13px;
            font-family: var(--sans);
            background: var(--neu-bg);
            color: var(--text);
            box-shadow: inset 3px 3px 6px var(--neu-shadow-dark), inset -3px -3px 6px var(--neu-shadow-light);
          }
          .trigger-readonly {
            font-family: var(--mono);
            color: var(--text-soft);
          }
          .trigger-input:disabled {
            background: #e9ebed;
            color: #6b7280;
            box-shadow: none;
            cursor: not-allowed;
          }
          .trigger-row .icon-btn:disabled {
            opacity: 0.35;
            cursor: not-allowed;
            box-shadow: none;
          }

          .grid-table { display: flex; flex-direction: column; border-radius: 12px; overflow: hidden; background: var(--neu-bg); box-shadow: inset 2px 2px 5px var(--neu-shadow-dark), inset -2px -2px 5px var(--neu-shadow-light); }
          .grid-row {
            display: grid;
            grid-template-columns: 110px 1fr 90px 90px;
            gap: 12px;
            align-items: center;
            padding: 10px 14px;
            font-size: 13px;
          }
          .grid-row:nth-child(even):not(.grid-head) { background: rgba(0,0,0,0.02); }
          .grid-head {
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.03em;
            color: var(--text-soft);
            font-weight: 600;
            background: rgba(0,0,0,0.03);
          }

          .pagination-bar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-top: 14px;
            flex-wrap: wrap;
            gap: 10px;
          }
          .pagination-info { font-size: 12px; color: var(--text-soft); font-family: var(--mono); }
          .pagination-controls { display: flex; align-items: center; gap: 4px; }
          .page-btn {
            min-width: 30px;
            height: 30px;
            padding: 0 6px;
            border-radius: 8px;
            font-size: 13px;
            background: var(--neu-bg);
            color: var(--text-soft);
            box-shadow: 3px 3px 6px var(--neu-shadow-dark), -3px -3px 6px var(--neu-shadow-light);
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .page-btn svg { width: 15px; height: 15px; }
          .page-btn:disabled { opacity: 0.35; cursor: not-allowed; box-shadow: none; }
          .page-btn.page-num.active {
            color: #2f6fed;
            font-weight: 700;
            box-shadow: inset 2px 2px 4px var(--neu-shadow-dark), inset -2px -2px 4px var(--neu-shadow-light);
          }
          .page-dots { padding: 0 4px; color: var(--text-soft); font-size: 13px; }

          .trigger-row input[type="checkbox"] {
            width: 16px;
            height: 16px;
            accent-color: var(--accent);
            justify-self: start;
          }

          .check { display: flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer; user-select: none; }
          .check input { accent-color: var(--accent); width: 15px; height: 15px; }

          .actions { display: flex; gap: 8px; margin-top: 16px; }
          button {
            font-family: var(--sans); font-size: 13px; font-weight: 500; border-radius: 10px;
            border: none; padding: 10px 18px; cursor: pointer; transition: box-shadow 0.15s, transform 0.1s;
            background: var(--neu-bg);
            box-shadow: 5px 5px 10px var(--neu-shadow-dark), -5px -5px 10px var(--neu-shadow-light);
          }
          button:active { box-shadow: inset 3px 3px 6px var(--neu-shadow-dark), inset -3px -3px 6px var(--neu-shadow-light); transform: translateY(0); }
          button.primary { color: #2f6fed; font-weight: 600; }
          button.ghost { color: var(--text-soft); }

          .toast {
            margin-top: 12px; padding: 10px 14px; border-radius: 10px; font-size: 13px;
            box-shadow: inset 3px 3px 6px var(--neu-shadow-dark), inset -3px -3px 6px var(--neu-shadow-light);
          }
          .toast.ok { color: #0f6e56; }
          .toast.err { color: #a32d2d; }

          .table-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 14px; flex-wrap: wrap; }
          .search {
            padding: 10px 14px; border: none; border-radius: 10px; font-size: 13px; width: min(260px, 100%);
            background: var(--neu-bg);
            box-shadow: inset 3px 3px 6px var(--neu-shadow-dark), inset -3px -3px 6px var(--neu-shadow-light);
          }
          .count { font-size: 12px; color: var(--text-soft); font-family: var(--mono); }

          .cards { display: grid; gap: 10px; }
          .card {
            display: grid; grid-template-columns: 1fr auto; gap: 10px; align-items: center;
            border: none; border-radius: 8px; padding: 14px 4px;
            background: transparent;
            box-shadow: none;
          }
          .card + .card {
            border-top: 1px solid var(--neu-shadow-light);
            box-shadow: 0 -1px 0 var(--neu-shadow-dark);
          }
          .card-main { min-width: 0; }
          .code { font-family: var(--mono); font-size: 13px; font-weight: 600; letter-spacing: -0.01em; }
          .desc { font-size: 13px; color: var(--text-soft); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .meta { display: flex; gap: 8px; margin-top: 6px; flex-wrap: wrap; }
          .pill { font-size: 11px; padding: 2px 8px; border-radius: 20px; font-weight: 500; }
          .pill.active { background: var(--accent-soft); color: var(--accent); }
          .pill.inactive { background: var(--danger-soft); color: var(--danger); }
          .pill.neutral { background: var(--warn-soft); color: var(--warn); }
          .card {
            cursor: pointer;
            transition: background 0.12s;
          }
          .card:hover { background: #e9f1fe; }

          .card-actions { display: flex; gap: 6px; flex-shrink: 0; }
          .icon-btn {
            width: 32px;
            height: 32px;
            padding: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 8px;
            background: var(--neu-bg);
            box-shadow: 3px 3px 6px var(--neu-shadow-dark), -3px -3px 6px var(--neu-shadow-light);
            color: var(--text-soft);
          }
          .icon-btn:active {
            box-shadow: inset 2px 2px 4px var(--neu-shadow-dark), inset -2px -2px 4px var(--neu-shadow-light);
          }
          .icon-btn svg { width: 16px; height: 16px; color: inherit; }
          .icon-btn.icon-danger svg { color: #a32d2d; }

          .empty { text-align: center; padding: 40px 20px; color: var(--text-soft); font-size: 13px; }

          .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 100; }

          .modal {
            background: var(--neu-bg); border-radius: 20px; padding: 24px; width: min(380px, 90vw);
            box-shadow: 12px 12px 24px var(--neu-shadow-dark), -12px -12px 24px var(--neu-shadow-light);
          }
          .modal-icon {
            width: 44px; height: 44px; border-radius: 50%; color: #a32d2d;
            display: flex; align-items: center; justify-content: center; margin-bottom: 12px;
            background: var(--neu-bg);
            box-shadow: inset 4px 4px 8px var(--neu-shadow-dark), inset -4px -4px 8px var(--neu-shadow-light);
          }
          
          .modal h3 { margin: 0 0 10px; font-size: 16px; }
          .modal p { margin: 0 0 18px; font-size: 13px; color: var(--text-soft); line-height: 1.5; }
          .modal-actions { display: flex; justify-content: flex-end; gap: 8px; }
          button.danger { background: var(--danger); color: #ffffff; }
          button.danger:hover { opacity: 0.88; }

          .placeholder-screen { text-align: center; padding: 80px 20px; color: var(--text-soft); }
          .placeholder-icon { font-size: 40px; margin-bottom: 12px; }
          .placeholder-screen h2 { font-size: 18px; color: var(--text); margin: 0 0 8px; }
          .placeholder-screen p { font-size: 13px; max-width: 360px; margin: 0 auto; }

          .admin-layout {
            display: flex;
            gap: 20px;
            align-items: flex-start;
          }
          @container (max-width: 640px) {
            .admin-layout { flex-direction: column; }
          }

          .admin-sidebar {
            width: 220px;
            flex-shrink: 0;
            display: flex;
            flex-direction: column;
            gap: 8px;
            background: var(--neu-bg);
            border-radius: 20px;
            padding: 16px;
            box-shadow: 8px 8px 16px var(--neu-shadow-dark), -8px -8px 16px var(--neu-shadow-light);
          }
          @container (max-width: 640px) {
            .admin-sidebar { width: 100%; flex-direction: row; flex-wrap: wrap; }
          }

          .admin-group { margin-bottom: 4px; }

          .admin-group-header {
            width: 100%;
            display: flex;
            align-items: center;
            gap: 12px;
            background: transparent;
            border: none;
            border-radius: 14px;
            padding: 10px 10px;
            font-size: 13px;
            font-weight: 600;
            color: var(--text-soft);
            cursor: pointer;
            box-shadow: none;
            text-align: left;
            transition: background 0.15s, color 0.15s;
          }
          .admin-group-header:hover { background: rgba(0,0,0,0.03); }
          .admin-group-header:active { box-shadow: none; transform: none; }
          .admin-group-header.highlight { color: var(--text); }

          .admin-group-label { flex: 1; }

          .admin-chevron {
            width: 15px;
            height: 15px;
            flex-shrink: 0;
            color: var(--text-soft);
            transition: transform 0.2s ease;
          }
          .admin-chevron.open { transform: rotate(90deg); }

          .admin-group-body {
            display: grid;
            grid-template-rows: 0fr;
            transition: grid-template-rows 0.22s ease;
          }
          .admin-group-body.open { grid-template-rows: 1fr; }
          .admin-group-body-inner {
            overflow: hidden;
            display: flex;
            flex-direction: column;
            gap: 3px;
            padding-left: 34px;
            padding-top: 2px;
            padding-bottom: 4px;
          }

          .admin-child-item {
            display: flex;
            align-items: center;
            gap: 9px;
            text-align: left;
            background: transparent;
            border: none;
            border-radius: 10px;
            padding: 8px 10px;
            font-size: 12.5px;
            font-weight: 500;
            color: var(--text-soft);
            cursor: pointer;
            box-shadow: none;
            transition: background 0.12s, box-shadow 0.12s, color 0.12s;
          }
          .admin-child-icon {
            width: 22px;
            height: 22px;
            flex-shrink: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            color: inherit;
          }
          .admin-child-icon svg { width: 14px; height: 14px; }
          .admin-child-item:hover { background: rgba(0,0,0,0.03); }
          .admin-child-item:active { box-shadow: none; transform: none; }
          .admin-child-item.active {
            background: var(--neu-bg);
            color: #2f6fed;
            box-shadow: inset 2px 2px 4px var(--neu-shadow-dark), inset -2px -2px 4px var(--neu-shadow-light);
          }

          .admin-nav-icon {
            width: 36px;
            height: 36px;
            flex-shrink: 0;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #2f6fed;
            background: var(--neu-bg);
            box-shadow: inset 4px 4px 8px var(--neu-shadow-dark), inset -4px -4px 8px var(--neu-shadow-light);
          }
          .admin-nav-icon svg { width: 17px; height: 17px; }

          .admin-content { flex: 1; min-width: 0; min-height: 340px; }          



          .liquid-scene {
            position: relative;
            min-height: 640px;
            border-radius: 24px;
            overflow: hidden;
            background: linear-gradient(160deg, #0d1b3a, #1a2f5c 55%, #0d1b3a);
          }
          .liquid-blob {
            position: absolute;
            border-radius: 50%;
            filter: blur(50px);
            opacity: 0.75;
            mix-blend-mode: screen;
          }
          .liquid-blob-a {
            width: 320px; height: 320px;
            background: radial-gradient(circle, #6ea8ff, transparent 70%);
            top: -60px; left: -60px;
            animation: liquid-float-a 14s ease-in-out infinite;
          }
          .liquid-blob-b {
            width: 280px; height: 280px;
            background: radial-gradient(circle, #a06eff, transparent 70%);
            bottom: -40px; right: 10%;
            animation: liquid-float-b 18s ease-in-out infinite;
          }
          .liquid-blob-c {
            width: 240px; height: 240px;
            background: radial-gradient(circle, #6effd6, transparent 70%);
            top: 30%; right: -60px;
            animation: liquid-float-c 16s ease-in-out infinite;
          }
          @keyframes liquid-float-a {
            0%, 100% { transform: translate(0, 0) scale(1); }
            50% { transform: translate(60px, 80px) scale(1.15); }
          }
          @keyframes liquid-float-b {
            0%, 100% { transform: translate(0, 0) scale(1); }
            50% { transform: translate(-50px, -60px) scale(1.1); }
          }
          @keyframes liquid-float-c {
            0%, 100% { transform: translate(0, 0) scale(1); }
            50% { transform: translate(-70px, 40px) scale(0.9); }
          }

          .liquid-content {
            position: relative;
            z-index: 1;
            padding: 40px clamp(20px, 4vw, 48px);
            display: flex;
            flex-wrap: wrap;
            gap: 24px;
            align-items: flex-start;
          }

          .glass-card {
            width: min(460px, 100%);
            padding: 28px;
            border-radius: 20px;
            background: rgba(255,255,255,0.12);
            border: 1px solid rgba(255,255,255,0.25);
            backdrop-filter: blur(18px);
            -webkit-backdrop-filter: blur(18px);
            box-shadow: 0 8px 32px rgba(0,0,0,0.25);
            color: #ffffff;
          }
          .glass-card-small { width: min(300px, 100%); padding: 20px; }

          .glass-title { font-size: 18px; font-weight: 600; margin: 0 0 8px; }
          .glass-text { font-size: 13px; color: rgba(255,255,255,0.75); line-height: 1.5; margin: 0 0 18px; }
          .glass-label { font-size: 12px; color: rgba(255,255,255,0.75); }

          .glass-tabs { display: flex; gap: 4px; margin-bottom: 18px; padding: 4px; background: rgba(0,0,0,0.15); border-radius: 12px; }
          .glass-tab {
            flex: 1; background: transparent; border: none; color: rgba(255,255,255,0.7);
            padding: 7px 10px; font-size: 12px; border-radius: 9px; cursor: pointer; transition: background 0.15s, color 0.15s;
          }
          .glass-tab.active { background: rgba(255,255,255,0.22); color: #ffffff; }

          .glass-field { margin-bottom: 16px; display: flex; flex-direction: column; gap: 6px; }
          .glass-input {
            width: 100%; padding: 10px 12px; border-radius: 10px; font-size: 13px; font-family: var(--sans);
            background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.25); color: #ffffff;
          }
          .glass-input::placeholder { color: rgba(255,255,255,0.5); }
          .glass-input:focus { outline: none; border-color: rgba(255,255,255,0.6); background: rgba(255,255,255,0.16); }
          .glass-textarea { min-height: 70px; resize: vertical; }
          select.glass-input option { color: #1a1d1f; }

          .glass-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; gap: 12px; }

          .glass-toggle {
            width: 42px; height: 24px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.3);
            background: rgba(255,255,255,0.12); position: relative; cursor: pointer; padding: 0; transition: background 0.15s;
          }
          .glass-toggle.on { background: rgba(110,168,255,0.7); }
          .glass-toggle-knob {
            position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 50%;
            background: #ffffff; transition: transform 0.18s;
          }
          .glass-toggle.on .glass-toggle-knob { transform: translateX(18px); }

          .glass-slider {
            flex: 1; -webkit-appearance: none; height: 4px; border-radius: 2px;
            background: rgba(255,255,255,0.25); outline: none;
          }
          .glass-slider::-webkit-slider-thumb {
            -webkit-appearance: none; width: 16px; height: 16px; border-radius: 50%;
            background: #ffffff; cursor: pointer; box-shadow: 0 0 0 4px rgba(255,255,255,0.15);
          }

          .glass-check-row { display: flex; align-items: center; gap: 8px; font-size: 13px; color: rgba(255,255,255,0.88); cursor: pointer; margin-bottom: 8px; }
          .glass-checkbox, .glass-radio { width: 16px; height: 16px; accent-color: #ffffff; cursor: pointer; }

          .glass-progress { width: 100%; height: 8px; border-radius: 4px; background: rgba(255,255,255,0.15); overflow: hidden; }
          .glass-progress-fill { height: 100%; background: linear-gradient(90deg, #6ea8ff, #a06eff); transition: width 0.15s; }

          .glass-actions { display: flex; flex-wrap: wrap; gap: 10px; }
          .glass-button {
            padding: 10px 18px; border-radius: 10px; font-size: 13px; font-weight: 500; cursor: pointer;
            border: 1px solid rgba(255,255,255,0.3); background: rgba(255,255,255,0.14); color: #ffffff;
            backdrop-filter: blur(6px); transition: background 0.15s;
          }
          .glass-button:hover { background: rgba(255,255,255,0.22); }
          .glass-button-primary { background: rgba(110,168,255,0.55); border-color: rgba(110,168,255,0.7); }
          .glass-button-primary:hover { background: rgba(110,168,255,0.7); }
          .glass-button-danger { background: rgba(255,110,110,0.4); border-color: rgba(255,110,110,0.6); }
          .glass-button-danger:hover { background: rgba(255,110,110,0.55); }
          .glass-button-icon { width: 40px; height: 40px; padding: 0; display: flex; align-items: center; justify-content: center; }
          .glass-button-icon svg { width: 18px; height: 18px; }

          .glass-badge {
            display: inline-block; margin-top: 12px; padding: 4px 10px; font-size: 11px; font-weight: 600;
            border-radius: 20px; background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3);
          }
          
          .status-screen { text-align: center; padding: 80px 20px; }
          .status-badge {
            position: relative;
            width: 96px;
            height: 96px;
            margin: 0 auto 24px;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .status-ring {
            position: absolute;
            inset: 0;
            border-radius: 50%;
            background: conic-gradient(from 0deg, #2f6fed 0deg, #2f6fed 90deg, transparent 90deg, transparent 360deg);
            animation: status-spin 2.4s linear infinite;
            -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 5px), #000 calc(100% - 5px));
            mask: radial-gradient(farthest-side, transparent calc(100% - 5px), #000 calc(100% - 5px));
          }
          .status-core {
            position: relative;
            width: 72px;
            height: 72px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #2f6fed;
            background: var(--neu-bg);
            box-shadow: inset 5px 5px 10px var(--neu-shadow-dark), inset -5px -5px 10px var(--neu-shadow-light);
            animation: status-pulse 2.8s ease-in-out infinite;
          }
          .status-screen h2 { font-size: 18px; color: var(--text); margin: 0 0 8px; font-weight: 600; }
          .status-screen p { font-size: 13px; color: var(--text-soft); max-width: 340px; margin: 0 auto; line-height: 1.5; }

          @keyframes status-spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          @keyframes status-pulse {
            0%, 100% { box-shadow: inset 5px 5px 10px var(--neu-shadow-dark), inset -5px -5px 10px var(--neu-shadow-light); }
            50% { box-shadow: inset 3px 3px 6px var(--neu-shadow-dark), inset -3px -3px 6px var(--neu-shadow-light); }
          }
        `}</style>

        <div className="topband">
          {screen !== "menu" && (
            <button className="back-btn" aria-label="Back to main menu" onClick={() => setScreen("menu")}>
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          <span className="title-main">Maintenance Management System</span>
          <span className="title-sep">|</span>
          <span className="title-sub">{LABELS[screen]}</span>
        </div>

        <div className="content">
          {screen === "menu" && <MainMenu onNavigate={handleNavigate} />}
          {screen === "assets" && <AssetRegistry onViewTriggers={handleViewTriggers} />}
          {screen === "reports" && <MaintenanceReport />}
          {screen === "dashboard" && <Dashboard />}
          {screen === "admin" && <Administration />}
          {screen === "triggers" && selectedAsset && (
            <MaintenanceTriggers
              assetId={selectedAsset.id}
              assetCode={selectedAsset.code}
              onBack={() => setScreen("assets")}
            />
          )}
          {screen === "uilab" && <LiquidGlassTest />}
        </div>
      </div>
    </QueryClientProvider>
  );
}

export default App;