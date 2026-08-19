import { useState } from "react";
import ChecklistDatabank from "./ChecklistDatabank";
import AssetTypes from "./AssetTypes";
import ChecklistSections from "./ChecklistSections";
import MriTemplates from "./MriTemplates";
import LookupsManager from "./LookupsManager";
import DataPurging from "./DataPurging";
import DataBrowser from "./DataBrowser";

export type AdminSection =
  | "users"
  | "checklist-bank"
  | "asset-types"
  | "checklist-sections"
  | "lookups"
  | "data-browser"
  | "data-removal"
  | "data-purge"
  | "mri-template"
  | "mrii-template"
  | "mriii-template";

export type GroupId = "users" | "references" | "data-tools" | "mr-templates";

interface Child {
  id: AdminSection;
  label: string;
  icon: JSX.Element;
}

interface Group {
  id: GroupId;
  label: string;
  icon: JSX.Element;
  children: Child[];
}

const GROUPS: Group[] = [
  {
    id: "users",
    label: "Users",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.6" />
        <path d="M4 20c0-4 3.6-6 8-6s8 2 8 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
    children: [
      {
        id: "users",
        label: "Users",
        icon: (
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.6" />
            <path d="M3 19c0-3 2.7-4.5 6-4.5s6 1.5 6 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <circle cx="17" cy="7" r="2.2" stroke="currentColor" strokeWidth="1.4" />
            <path d="M15.5 19c.2-2.2 1.8-3.4 4-3.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        ),
      },
    ],
  },
  {
    id: "references",
    label: "References",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M6 4h9l3 3v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M9 10h6M9 14h6M9 18h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
    children: [{
      id: "lookups",
      label: "Lookups",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M4 6h16M4 12h10M4 18h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      id: "checklist-bank",
      label: "Checklist Bank",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" />
          <path d="M8 10l1.5 1.5L12.5 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M8 15h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      id: "asset-types",
      label: "Asset Types",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="4" y="4" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
          <rect x="13" y="4" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
          <rect x="4" y="13" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
          <rect x="13" y="13" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      ),
    },
    {
      id: "checklist-sections",
      label: "Checklist Sections",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="4" y="5" width="16" height="4" rx="1" stroke="currentColor" strokeWidth="1.6" />
          <rect x="4" y="11" width="16" height="4" rx="1" stroke="currentColor" strokeWidth="1.6" />
          <rect x="4" y="17" width="10" height="4" rx="1" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      ),
    },
    ],
  },
  {
    id: "data-tools",
    label: "Data Tools",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.6" />
        <path d="M20 20l-4.5-4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
    children: [
      {
        id: "data-browser",
        label: "Browser",
        icon: (
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="10.5" cy="10.5" r="6" stroke="currentColor" strokeWidth="1.6" />
            <path d="M19 19l-4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        ),
      },
      {
        id: "data-removal",
        label: "Removal",
        icon: (
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ),
      },
      {
        id: "data-purge",
        label: "Purging",
        icon: (
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 3v6M12 3l-3 3M12 3l3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M5 12a7 7 0 1 0 14 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        ),
      },
    ],
  },
  {
    id: "mr-templates",
    label: "MR Templates",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="5" y="3" width="14" height="18" rx="2" stroke="currentColor" strokeWidth="1.6" />
        <path d="M9 8h6M9 12h6M9 16h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
    children: [
      {
        id: "mri-template",
        label: "MR-I",
        icon: (
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.6" />
            <text x="12" y="16" textAnchor="middle" fontSize="10" fontWeight="700" fill="currentColor" stroke="none">I</text>
          </svg>
        ),
      },
      {
        id: "mrii-template",
        label: "MR-II",
        icon: (
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.6" />
            <text x="12" y="16" textAnchor="middle" fontSize="9" fontWeight="700" fill="currentColor" stroke="none">II</text>
          </svg>
        ),
      },
      {
        id: "mriii-template",
        label: "MR-III",
        icon: (
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.6" />
            <text x="12" y="16" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="currentColor" stroke="none">III</text>
          </svg>
        ),
      },
    ],
  },
];

const LABELS: Record<AdminSection, string> = {
  users: "Users",
  "checklist-bank": "Checklist Bank",
  "asset-types": "Asset Types",
  "checklist-sections": "Checklist Sections",
  "data-browser": "Data Browser",
  "data-removal": "Data Removal",
  "data-purge": "Data Purge",
  "mri-template": "MR-I Template",
  "mrii-template": "MR-II Template",
  "mriii-template": "MR-III Template",
  "lookups": "Lookups",
};

interface AdministrationProps {
  onOpenTemplate: (id: number, name: string) => void;
  active: AdminSection;
  setActive: (s: AdminSection) => void;
  openGroup: GroupId;
  setOpenGroup: (g: GroupId) => void;
  selectedTemplateId: number | null;
}

function Administration({ onOpenTemplate, active, setActive, openGroup, setOpenGroup, selectedTemplateId }: AdministrationProps) {
  function toggleGroup(id: GroupId) {
    setOpenGroup((prev) => (prev === id ? (prev as GroupId) : id));
  }

  function selectChild(groupId: GroupId, childId: AdminSection) {
    setOpenGroup(groupId);
    setActive(childId);
  }

  return (
    <div className="admin-layout">
      <div className="admin-sidebar">
        {GROUPS.map((group) => {
          const isOpen = openGroup === group.id;
          const hasActiveChild = group.children.some((c) => c.id === active);
          return (
            <div key={group.id} className="admin-group">
              <button
                className={`admin-group-header ${hasActiveChild ? "highlight" : ""}`}
                onClick={() => toggleGroup(group.id)}
              >
                <span className="admin-nav-icon">{group.icon}</span>
                <span className="admin-group-label">{group.label}</span>
                <svg
                  className={`admin-chevron ${isOpen ? "open" : ""}`}
                  viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              <div className={`admin-group-body ${isOpen ? "open" : ""}`}>
                <div className="admin-group-body-inner">
                  {group.children.map((child) => (
                    <button
                      key={child.id}
                      className={`admin-child-item ${active === child.id ? "active" : ""}`}
                      onClick={() => selectChild(group.id, child.id)}
                    >
                      <span className="admin-child-icon">{child.icon}</span>
                      <span>{child.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="panel admin-content">
        {active === "checklist-bank" ? (
          <ChecklistDatabank />
        ) : active === "asset-types" ? (
          <AssetTypes />
        ) : active === "checklist-sections" ? (
          <ChecklistSections />
        ) : active === "lookups" ? (
          <LookupsManager />
        ) : active === "mri-template" ? (
          <MriTemplates onOpenTemplate={onOpenTemplate} selectedTemplateId={selectedTemplateId} />
        ) : active === "data-browser" ? (
          <DataBrowser />
        ) : active === "data-purge" ? (
          <DataPurging />
        ) : (
          <div className="placeholder-screen">
            <h2>{LABELS[active]}</h2>
            <p>Coming soon — {LABELS[active].toLowerCase()} management will land here.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default Administration;

