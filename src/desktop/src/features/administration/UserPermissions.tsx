import { useState } from "react";
import { roleWithTier } from "../../lib/roles";
import {
  usePermissions,
  useRolePermissions,
  useUserOverrides,
  useSetUserOverride,
  type AppUser,
} from "./hooks/useUserAdmin";
import { getPermissionIcon } from "./permissionIcons";
import { dashPermRank, isPausedPerm } from "../dashboard/dashAccess";
import { IsoKey } from "./AdminIsoGuide";

interface UserPermissionsProps {
  user: AppUser;
  onBack: () => void;
}

type EffectiveState = "default-on" | "default-off" | "granted" | "revoked";

function UserPermissions({ user, onBack }: UserPermissionsProps) {
  const { data: permissions = [] } = usePermissions();
  const { data: rolePerms = [] } = useRolePermissions(user.role);
  const { data: overrides = [] } = useUserOverrides(user.id);
  const setOverride = useSetUserOverride(user.id);

  const [status, setStatus] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);

  function flash(msg: string, kind: "ok" | "err") {
    setStatus({ msg, kind });
    setTimeout(() => setStatus(null), 3000);
  }

  function stateFor(code: string): EffectiveState {
    const override = overrides.find((o) => o.permission_code === code);
    if (override) return override.granted ? "granted" : "revoked";
    return rolePerms.includes(code) ? "default-on" : "default-off";
  }

  const isAdminUser = user.role === "Administrator";
  async function toggle(code: string, currentlyOn: boolean) {
    if (isAdminUser) { flash("The Administrator always has every permission.", "err"); return; }
    try {
      await setOverride.mutateAsync({ permissionCode: code, granted: !currentlyOn });
    } catch (err) {
      flash(String(err), "err");
    }
  }

  async function resetToDefault(code: string) {
    if (isAdminUser) return;
    try {
      await setOverride.mutateAsync({ permissionCode: code, granted: null });
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
  /** All on / all off (as overrides for this user), or back to the role defaults. */
  async function setAll(cat: string, mode: "on" | "off" | "default") {
    if (isAdminUser) { flash("The Administrator always has every permission.", "err"); return; }
    setBulkBusy(true);
    try {
      for (const p of inCategory(cat)) {
        const st = stateFor(p.code);
        if (mode === "default") { if (st === "granted" || st === "revoked") await setOverride.mutateAsync({ permissionCode: p.code, granted: null }); }
        else {
          const on = st === "default-on" || st === "granted";
          if (on !== (mode === "on")) await setOverride.mutateAsync({ permissionCode: p.code, granted: mode === "on" });
        }
      }
      flash(mode === "default" ? `${cat}: back to the role defaults` : `${cat}: all turned ${mode} for ${user.name}`, "ok");
    } catch (err) {
      flash(String(err), "err");
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <button className="ghost" onClick={onBack} style={{ padding: "6px 12px", fontSize: 12 }}>← Back to users</button>
      </div>

      <h2 style={{ marginBottom: 4 }}>Permissions — {user.name}</h2>
      <p style={{ fontSize: 13, color: "var(--text-soft)", marginBottom: 4 }}>
        Role: <strong>{roleWithTier(user.role)}</strong>. Click any card to cycle: role default → override granted/revoked → back to role default.
      </p>
      <p style={{ fontSize: 12, color: "var(--text-soft)", marginBottom: 18 }}>
        Solid = allowed right now for this specific user. Faded = not allowed right now. Overrides are marked distinctly from role defaults.
      </p>

      {isAdminUser && <div className="toast ok" style={{ maxWidth: 640, margin: "8px 0 12px" }}>The Administrator (Tier 0) has every permission, with no restriction, so these switches can't be turned off. Its deletions and changes are recorded in the MMS logs.</div>}
      {status && <div className={`toast ${status.kind}`} style={{ maxWidth: 400, marginBottom: 12 }}>{status.msg}</div>}

      {categories.map((cat) => (
        <div key={cat} style={{ marginBottom: 26 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <div className="mri-preview-section-label" style={{ marginBottom: 0 }}>{cat}</div>
            {cat === "Dashboards" && (() => {
              const st = inCategory(cat).map((p) => stateFor(p.code));
              const onN = st.filter((x) => x === "default-on" || x === "granted").length;
              const overrides = st.filter((x) => x === "granted" || x === "revoked").length;
              return (
                <span style={{ display: "inline-flex", gap: 10, marginLeft: 4, flexWrap: "wrap" }}>
                  <IsoKey label="All on" tone="ok" pressed={st.length > 0 && onN === st.length} disabled={bulkBusy} onClick={() => setAll(cat, "on")} />
                  <IsoKey label="All off" tone="skip" pressed={onN === 0} disabled={bulkBusy} onClick={() => setAll(cat, "off")} />
                  <IsoKey label="Role defaults" tone="blue" pressed={overrides === 0} disabled={bulkBusy} onClick={() => setAll(cat, "default")} />
                </span>
              );
            })()}
          </div>
          <div className="iso-card-grid">
            {inCategory(cat).map((p) => {
              const state = stateFor(p.code);
              const isOverride = state === "granted" || state === "revoked";
              const isOn = state === "default-on" || state === "granted";
              return (
                <div
                  key={p.code}
                  className={`iso-card${isOn ? " is-on" : ""}${isOverride ? " is-override" : ""}${state === "revoked" ? " is-revoked" : ""}`}
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
                  {!isOverride && <div className="iso-card-state">{isOn ? "On" : "Off"} · role default</div>}
                  {isOverride && (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span className="iso-card-state iso-card-override">
                        {isOn ? "On" : "Off"} · override
                      </span>
                      <button
                        className="ghost"
                        onClick={(e) => { e.stopPropagation(); resetToDefault(p.code); }}
                        style={{ padding: "2px 8px", fontSize: 10 }}
                      >
                        Reset
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export default UserPermissions;