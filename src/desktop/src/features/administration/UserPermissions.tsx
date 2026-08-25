import { useState } from "react";
import {
  usePermissions,
  useRolePermissions,
  useUserOverrides,
  useSetUserOverride,
  type AppUser,
} from "./hooks/useUserAdmin";

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

  const stateLabel: Record<EffectiveState, string> = {
    "default-on": "Allowed (role default)",
    "default-off": "Not allowed (role default)",
    granted: "Allowed (override)",
    revoked: "Blocked (override)",
  };
  const stateColor: Record<EffectiveState, string> = {
    "default-on": "var(--accent)",
    "default-off": "var(--text-soft)",
    granted: "var(--accent)",
    revoked: "var(--danger)",
  };

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <button className="ghost" onClick={onBack} style={{ padding: "6px 12px", fontSize: 12 }}>← Back to users</button>
      </div>

      <h2 style={{ marginBottom: 4 }}>Permissions — {user.name}</h2>
      <p style={{ fontSize: 13, color: "var(--text-soft)", marginBottom: 4 }}>
        Role: <strong>{user.role}</strong>. Click any permission to cycle: role default → override granted/revoked → back to role default.
      </p>
      <p style={{ fontSize: 12, color: "var(--text-soft)", marginBottom: 18 }}>
        Solid = allowed right now for this specific user. Faded = not allowed right now. Overrides are marked distinctly from role defaults.
      </p>

      {status && <div className={`toast ${status.kind}`} style={{ maxWidth: 400, marginBottom: 12 }}>{status.msg}</div>}

      {categories.map((cat) => (
        <div key={cat} style={{ marginBottom: 22 }}>
          <div className="mri-preview-section-label">{cat}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {permissions.filter((p) => p.category === cat).map((p) => {
              const state = stateFor(p.code);
              const isOverride = state === "granted" || state === "revoked";
              const isOn = state === "default-on" || state === "granted";
              return (
                <div
                  key={p.code}
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "10px 14px", background: "var(--neu-bg)", borderRadius: 10,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13 }}>{p.label}</div>
                    {isOverride && (
                      <div style={{ fontSize: 11, color: stateColor[state], fontWeight: 600, marginTop: 2 }}>
                        Override — click Reset to use role default
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {isOverride && (
                      <button
                        className="ghost"
                        onClick={() => resetToDefault(p.code)}
                        style={{ padding: "4px 10px", fontSize: 11 }}
                      >
                        Reset
                      </button>
                    )}
                    <button
                      role="switch"
                      aria-checked={isOn}
                      onClick={() => toggle(p.code, isOn)}
                      className="neu-toggle"
                      data-on={isOn}
                    >
                      <span className="neu-toggle-knob" />
                    </button>
                  </div>
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