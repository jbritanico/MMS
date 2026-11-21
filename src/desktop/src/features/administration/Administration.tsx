import { useEffect } from "react";
import type { JSX } from "react";
import ChecklistDatabank from "./ChecklistDatabank";
import AssetTypes from "./AssetTypes";
import ChecklistSections from "./ChecklistSections";
import MriTemplates from "./MriTemplates";
import LookupsManager from "./LookupsManager";
import Users from "./Users";
import Roles from "./Roles";
import DataPurging from "./DataPurging";
import DataBackup from "./DataBackup";
import DataBrowser from "./DataBrowser";
import { useCurrentUserPermissionCodes } from "../../lib/useCurrentUserPermissions";
import { useCurrentUser } from "../../lib/currentUser";
import SupportViewer from "../support/SupportViewer";
import { TIG_CSS } from "../mri-template-builder/TemplateIsoGuide";
import { ADMIN_CSS, ADMIN_META, AdminHintsProvider, AdminScreenIntro, AdminTile, GROUP_NAMES, IsoScaffold, useAdminHints } from "./AdminIsoGuide";

export type AdminSection =
  | "users"
  | "roles"
  | "checklist-bank"
  | "asset-types"
  | "checklist-sections"
  | "lookups"
  | "data-browser"
  | "data-removal"
  | "data-purge"
  | "data-backup"
  | "mri-template"
  | "mrii-template"
  | "mriii-template"
  | "support-viewer";

export type GroupId = "users" | "references" | "data-tools" | "mr-templates" | "diagnostics";

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
      {
        id: "roles",
        label: "Roles",
        icon: (
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
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
      {
        id: "data-backup",
        label: "Backup",
        icon: (
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 4v10M12 14l-3.5-3.5M12 14l3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
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
  {
    id: "diagnostics",
    label: "Diagnostics",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M3 12h4l2.5-6 4 12 2.5-6H21" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    children: [
      {
        id: "support-viewer",
        label: "Support viewer",
        icon: (
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 7l8-4 8 4v10l-8 4-8-4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M4 7l8 4 8-4M12 11v10" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          </svg>
        ),
      },
    ],
  },
];

// Permission required to see each section's nav item and content. A section with
// no entry here is always visible (used for the still-unbuilt placeholder screens).
const SECTION_PERMISSION: Partial<Record<AdminSection, string>> = {
  users: "admin.users.manage",
  roles: "admin.users.manage",
  "checklist-bank": "references.edit",
  "asset-types": "references.edit",
  "checklist-sections": "references.edit",
  "lookups": "references.edit",
  "data-browser": "data_browser.view",
  "data-removal": "data_browser.edit",
  "data-purge": "data_purging.execute",
  "data-backup": "backups.export",
  "mri-template": "mri_templates.view",
  "mrii-template": "mri_templates.view",
  "mriii-template": "mri_templates.view",
};

// Sections for the Administrator tier only. Fixed to the tier (not a permission switch), so they
// cannot be given to other roles or users. The Rust side checks again.
const ADMINISTRATOR_ONLY: AdminSection[] = ["support-viewer"];

const LABELS: Record<AdminSection, string> = {
  users: "Users",
  roles: "Roles",
  "checklist-bank": "Checklist Bank",
  "asset-types": "Asset Types",
  "checklist-sections": "Checklist Sections",
  "data-browser": "Data Browser",
  "data-removal": "Data Removal",
  "data-purge": "Data Purge",
  "data-backup": "Data Backup",
  "mri-template": "MR-I Template",
  "mrii-template": "MR-II Template",
  "mriii-template": "MR-III Template",
  "lookups": "Lookups",
  "support-viewer": "Support viewer",
};

interface AdministrationProps {
  onOpenTemplate: (id: number, name: string) => void;
  active: AdminSection;
  setActive: (s: AdminSection) => void;
  openGroup: GroupId;
  setOpenGroup: (g: GroupId) => void;
  selectedTemplateId: number | null;
}

function Administration(props: AdministrationProps) {
  return (
    <AdminHintsProvider>
      <AdministrationInner {...props} />
    </AdminHintsProvider>
  );
}

function AdministrationInner({ onOpenTemplate, active, setActive, openGroup, setOpenGroup, selectedTemplateId }: AdministrationProps) {
  const adminHints = useAdminHints();

  const permCodes = useCurrentUserPermissionCodes();
  const { user: currentUser } = useCurrentUser();

  function canSee(section: AdminSection): boolean {
    // Administrator tier only, and hidden while the user is not known yet (fails closed).
    if (ADMINISTRATOR_ONLY.includes(section)) return currentUser?.role === "Administrator";
    if (permCodes === null) return true; // fail-open: still loading, or no matching user yet
    if (section === "data-backup") return permCodes.has("backups.export") || permCodes.has("backups.import");
    const required = SECTION_PERMISSION[section];
    if (!required) return true; // unmapped sections (not yet built) stay visible
    return permCodes.has(required);
  }

  const visibleGroups = GROUPS
    .map((group) => ({ ...group, children: group.children.filter((c) => canSee(c.id)) }))
    .filter((group) => group.children.length > 0);

  // If the current section becomes restricted (permissions changed, or the
  // default section isn't allowed for this user), fall back to the first
  // section this user can actually see instead of showing a dead screen.
  useEffect(() => {
    if (canSee(active)) return;
    const fallback = visibleGroups[0]?.children[0];
    if (fallback) {
      setOpenGroup(visibleGroups[0].id);
      setActive(fallback.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, permCodes, currentUser?.role]);

  function toggleGroup(id: GroupId) {
    setOpenGroup(id);
  }

  function selectChild(groupId: GroupId, childId: AdminSection) {
    setOpenGroup(groupId);
    setActive(childId);
  }

  return (
    <div className="admin-layout tig">
      <style>{TIG_CSS + ADMIN_CSS}</style>
      <div className="admin-sidebar" aria-label="Administration">
        {visibleGroups.map((group) => {
          const isOpen = openGroup === group.id;
          const hasActiveChild = group.children.some((c) => c.id === active);
          return (
            <div key={group.id} className="admin-group">
              <button
                className={`admin-group-header ${hasActiveChild ? "highlight" : ""}`}
                onClick={() => toggleGroup(group.id)}
              >
                <span className="admin-nav-icon">{group.icon}</span>
                <span className="admin-group-label">{GROUP_NAMES[group.id]}</span>
                <svg
                  className={`admin-chevron ${isOpen ? "open" : ""}`}
                  viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              <div className={`admin-group-body ${isOpen ? "open" : ""}`}>
                <div className="admin-group-body-inner">
                  {group.children.map((child) => {
                    const meta = ADMIN_META[child.id];
                    const n = adminHints[child.id]?.length ?? 0;
                    const cur = active === child.id;
                    return (
                      <button
                        key={child.id}
                        className={`admin-child-item ${cur ? "active" : ""}`}
                        aria-current={cur ? "page" : undefined}
                        onClick={() => selectChild(group.id, child.id)}
                        title={n ? `${n} ${n === 1 ? "thing" : "things"} worth a look` : undefined}
                      >
                        <AdminTile state={cur ? "current" : meta.soon ? "soon" : n ? "look" : "ok"} />
                        <span className="adm-child-text">
                          <span className="adm-child-name">{meta.name}</span>
                          <span className="adm-child-tech">{meta.tech}</span>
                        </span>
                        {meta.soon ? <span className="adm-badge is-soon">Soon</span> : n > 0 && <span className="adm-badge">{n}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="panel admin-content">
        {canSee(active) && (
          <AdminScreenIntro section={active} groupId={GROUPS.find((g) => g.children.some((c) => c.id === active))?.id ?? "users"} />
        )}
        {!canSee(active) ? (
          <div className="placeholder-screen">
            <h2>Restricted</h2>
            <p>You don't have permission to view {LABELS[active].toLowerCase()}.</p>
          </div>
        ) : active === "users" ? (
          <Users />
        ) : active === "roles" ? (
          <Roles />
        ) : active === "checklist-bank" ? (
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
        ) : active === "data-backup" ? (
          <DataBackup />
        ) : active === "support-viewer" ? (
          <SupportViewer />
        ) : (
          <div className="placeholder-screen" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <IsoScaffold />
            <h2 style={{ textTransform: "none", letterSpacing: 0 }}>{ADMIN_META[active].name} is coming soon</h2>
            <p style={{ maxWidth: 520 }}>{ADMIN_META[active].explain}</p>
            {active !== "data-removal" && canSee("mri-template") && (
              <button className="ghost" onClick={() => selectChild("mr-templates", "mri-template")}>Go to MR-I templates</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default Administration;

