import { useState } from "react";
import {
  usePermissions,
  useRolePermissions,
  useSetRolePermission,
  ROLES,
} from "./hooks/useUserAdmin";
import { getPermissionIcon } from "./permissionIcons";

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

  async function toggle(code: string, currentlyOn: boolean) {
    try {
      await setRolePermission.mutateAsync({ permissionCode: code, granted: !currentlyOn });
    } catch (err) {
      flash(String(err), "err");
    }
  }

  const categories = Array.from(new Set(permissions.map((p) => p.category)));

  return (
    <div>
      <h2 style={{ marginBottom: 4 }}>Roles</h2>
      <p style={{ fontSize: 13, color: "var(--text-soft)", marginBottom: 4 }}>
        Set the default permissions every user in a role starts with. Individual users can still be
        granted or blocked specific permissions from their own Permissions screen — those overrides
        take priority over whatever is set here.
      </p>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "16px 0 20px" }}>
        {ROLES.map((role) => (
          <button
            key={role}
            className={role === selectedRole ? "primary" : "ghost"}
            style={{ padding: "6px 14px", fontSize: 12 }}
            onClick={() => setSelectedRole(role)}
          >
            {role}
          </button>
        ))}
      </div>

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
              const isOn = rolePerms.includes(p.code);
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
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export default Roles;