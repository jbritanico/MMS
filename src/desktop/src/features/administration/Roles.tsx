import { useState } from "react";
import { roleWithTier } from "../../lib/roles";
import {
  usePermissions,
  useRolePermissions,
  useSetRolePermission,
  ROLES,
} from "./hooks/useUserAdmin";
import { getPermissionIcon } from "./permissionIcons";
import { dashPermRank, isPausedPerm } from "../dashboard/dashAccess";
import { IsoKey, IsoTiles, useReportAdminHints, useReportAdminKpis } from "./AdminIsoGuide";

function Roles() {
  const [selectedRole, setSelectedRole] = useState<string>(ROLES[0]);

  const { data: permissions = [] } = usePermissions();
  const { data: rolePerms = [] } = useRolePermissions(selectedRole);
  const setRolePermission = useSetRolePermission(selectedRole);

  const [status, setStatus] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);

  function flash(msg: string, kind: "ok" | "err") {
    setStatus({ msg, kind });
    setTimeout(() => setStatus(null), 3000);
  }

  const isAdminRole = selectedRole === "Administrator";
  async function toggle(code: string, currentlyOn: boolean) {
    if (isAdminRole) { flash("The Administrator always has every permission.", "err"); return; }
    try {
      await setRolePermission.mutateAsync({ permissionCode: code, granted: !currentlyOn });
    } catch (err) {
      flash(String(err), "err");
    }
  }

  const categories = Array.from(new Set(permissions.map((p) => p.category)));
  /** Permissions of one category; Dashboards in catalogue order (area, Overview, History, 1-18). */
  const inCategory = (cat: string) => {
    const list = permissions.filter((p) => p.category === cat && !isPausedPerm(p.code));
    return cat === "Dashboards" ? [...list].sort((a, b) => dashPermRank(a.code) - dashPermRank(b.code)) : list;
  };
  const [bulkBusy, setBulkBusy] = useState(false);
  /** Turn every switch of a category on or off for the selected role. */
  async function setAll(cat: string, on: boolean) {
    if (isAdminRole) { flash("The Administrator always has every permission.", "err"); return; }
    setBulkBusy(true);
    try {
      for (const p of inCategory(cat)) {
        if (rolePerms.includes(p.code) !== on) await setRolePermission.mutateAsync({ permissionCode: p.code, granted: on });
      }
      flash(`${cat}: all turned ${on ? "on" : "off"} for ${selectedRole}`, "ok");
    } catch (err) {
      flash(String(err), "err");
    } finally {
      setBulkBusy(false);
    }
  }

  const noDashboards = permissions.some((p) => p.code === "dashboard.view") && !rolePerms.includes("dashboard.view");
  useReportAdminHints("roles", noDashboards ? [`${selectedRole} can't open any dashboard`] : []);
  const dashOn = inCategory("Dashboards").filter((p) => rolePerms.includes(p.code)).length;
  const dashAll = inCategory("Dashboards").length;
  useReportAdminKpis("roles", [
    { label: "role picked", value: roleWithTier(selectedRole), tone: "blue" },
    { label: "switches on", value: `${rolePerms.length} of ${permissions.length}`, tone: "ok" },
    { label: "dashboards it can open", value: `${dashOn} of ${dashAll}`, tone: dashOn ? "ok" : "look" },
  ]);

  return (
    <div>
      <p style={{ fontSize: 13, color: "var(--text-soft)", margin: "0 0 4px" }}>
        These are the starting switches for everyone with the role. A person's own Permissions screen can still turn
        single switches on or off for them, and those win over the role.
      </p>
      {isAdminRole && <div className="toast ok" style={{ maxWidth: 640, margin: "8px 0 12px" }}>The Administrator (Tier 0) has every permission, with no restriction, so these switches can't be turned off. Its deletions and changes are recorded in the MMS logs.</div>}

      <div style={{ margin: "16px 0 20px" }}>
        <IsoTiles
          label="Pick a role"
          items={ROLES.map((role) => ({ id: role, label: roleWithTier(role), count: role === selectedRole ? `${rolePerms.length} of ${permissions.length} on` : undefined, tone: role === selectedRole ? "ok" as const : "skip" as const }))}
          selected={selectedRole}
          onPick={(role) => setSelectedRole(role)}
        />
      </div>

      {status && <div className={`toast ${status.kind}`} style={{ maxWidth: 400, marginBottom: 12 }}>{status.msg}</div>}

      {categories.map((cat) => (
        <div key={cat} style={{ marginBottom: 26 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            {(() => {
              const list = inCategory(cat);
              const on = list.filter((p) => rolePerms.includes(p.code)).length;
              return (
                <>
                  <IsoStack on={on} total={list.length} />
                  <div className="mri-preview-section-label" style={{ marginBottom: 0 }}>{cat}</div>
                  <span style={{ fontSize: 12, color: "var(--text-soft)" }}>{on} of {list.length} on</span>
                </>
              );
            })()}
            {(() => {
              const list = inCategory(cat);
              const on = list.filter((p) => rolePerms.includes(p.code)).length;
              return (
                <span style={{ display: "inline-flex", gap: 10, marginLeft: 4 }}>
                  <IsoKey label="All on" tone="ok" pressed={list.length > 0 && on === list.length} disabled={bulkBusy} onClick={() => setAll(cat, true)} />
                  <IsoKey label="All off" tone="skip" pressed={on === 0} disabled={bulkBusy} onClick={() => setAll(cat, false)} />
                </span>
              );
            })()}
          </div>
          <div className="iso-card-grid">
            {inCategory(cat).map((p) => {
              const isOn = rolePerms.includes(p.code);
              return (
                <div
                  key={p.code}
                  className={`iso-card${isOn ? " is-on" : ""}`}
                  onClick={() => toggle(p.code, isOn)}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div
                      style={{
                        width: 34, height: 34, borderRadius: 9,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: isOn ? "var(--success)" : "var(--text-soft)",
                        background: "transparent",
                        flexShrink: 0,
                      }}
                    >
                      {getPermissionIcon(p.code)}
                    </div>
                    <button
                      role="switch"
                      aria-checked={isOn}
                      aria-label={p.label}
                      onClick={(e) => { e.stopPropagation(); toggle(p.code, isOn); }}
                      className="neu-toggle"
                      data-on={isOn}
                    >
                      <span className="neu-toggle-knob" />
                    </button>
                  </div>
                  <div className="iso-card-label">{p.label}</div>
                  <div className="iso-card-state">{isOn ? "On" : "Off"}</div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// A small 3D stack that grows with the number of switches turned on in an area. Display only.
function IsoStack({ on, total }: { on: number; total: number }) {
  const n = total ? Math.round((on / total) * 6) : 0;
  return (
    <svg width="44" height="44" viewBox="0 0 64 64" aria-hidden="true" style={{ overflow: "visible", flexShrink: 0 }}>
      {Array.from({ length: 6 }, (_, i) => {
        const y = 44 - i * 7, filled = i < n;
        return (
          <g key={i} opacity={filled ? 1 : 0.35}>
            <polygon points={`2,${y} 32,${y + 14} 32,${y + 18} 2,${y + 4}`} className="tig-slab-l" />
            <polygon points={`32,${y + 14} 62,${y} 62,${y + 4} 32,${y + 18}`} className="tig-slab-r" />
            <polygon points={`32,${y - 14} 62,${y} 32,${y + 14} 2,${y}`} fill={filled ? "var(--tig-ok-soft)" : "var(--tig-hole)"} stroke={filled && i === n - 1 ? "var(--tig-ok)" : "none"} strokeWidth={1.2} />
          </g>
        );
      })}
    </svg>
  );
}

export default Roles;
