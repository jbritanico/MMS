import { useState } from "react";
import {
  usePermissions,
  useRolePermissions,
  useUserOverrides,
  useSetUserOverride,
  type AppUser,
} from "./hooks/useUserAdmin";
import { getPermissionIcon } from "./permissionIcons";

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

  async function toggle(code: string, currentlyOn: boolean) {
    try {
      await setOverride.mutateAsync({ permissionCode: code, granted: !currentlyOn });
    } catch (err) {
      flash(String(err), "err");
    }
  }

  async function resetToDefault(code: string) {
    try {
      await setOverride.mutateAsync({ permissionCode: code, granted: null });
    } catch (err) {
      flash(String(err), "err");
    }
  }

  const categories = Array.from(new Set(permissions.map((p) => p.category)));

  const stateColor: Record<EffectiveState, string> = {
    "default-on": "var(--success)",
    "default-off": "var(--text-soft)",
    granted: "var(--success)",
    revoked: "var(--danger)",
  };

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <button className="ghost" onClick={onBack} style={{ padding: "6px 12px", fontSize: 12 }}>← Back to users</button>
      </div>

      <h2 style={{ marginBottom: 4 }}>Permissions — {user.name}</h2>
      <p style={{ fontSize: 13, color: "var(--text-soft)", marginBottom: 4 }}>
        Role: <strong>{user.role}</strong>. Click any card to cycle: role default → override granted/revoked → back to role default.
      </p>
      <p style={{ fontSize: 12, color: "var(--text-soft)", marginBottom: 18 }}>
        Solid = allowed right now for this specific user. Faded = not allowed right now. Overrides are marked distinctly from role defaults.
      </p>

      {status && <div className={`toast ${status.kind}`} style={{ maxWidth: 400, marginBottom: 12 }}>{status.msg}</div>}

      {categories.map((cat) => (
        <div key={cat} style={{ marginBottom: 26 }}>
          <div className="mri-preview-section-label">{cat}</div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
              gap: 12,
            }}
          >
            {permissions.filter((p) => p.category === cat).map((p) => {
              const state = stateFor(p.code);
              const isOverride = state === "granted" || state === "revoked";
              const isOn = state === "default-on" || state === "granted";
              return (
                <div
                  key={p.code}
                  role="switch"
                  aria-checked={isOn}
                  onClick={() => toggle(p.code, isOn)}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                    padding: 16,
                    borderRadius: 14,
                    cursor: "pointer",
                    background: isOn ? "var(--success-soft)" : "var(--neu-bg)",
                    boxShadow: isOn
                      ? "inset 3px 3px 6px var(--neu-shadow-dark), inset -3px -3px 6px var(--neu-shadow-light)"
                      : "5px 5px 10px var(--neu-shadow-dark), -5px -5px 10px var(--neu-shadow-light)",
                    outline: isOverride ? `1.5px solid ${stateColor[state]}` : "none",
                    outlineOffset: -1.5,
                    transition: "background 0.15s, box-shadow 0.15s",
                  }}
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
                      onClick={(e) => { e.stopPropagation(); toggle(p.code, isOn); }}
                      className="neu-toggle"
                      data-on={isOn}
                    >
                      <span className="neu-toggle-knob" />
                    </button>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.3, color: isOn ? "var(--success)" : "var(--text)" }}>{p.label}</div>
                  {isOverride && (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: -4 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: stateColor[state], textTransform: "uppercase", letterSpacing: 0.3 }}>
                        Override
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