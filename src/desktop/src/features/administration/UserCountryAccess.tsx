import { useState } from "react";
import {
  useUserCountryAccess,
  useSetUserCountryAccess,
  isSingleCountryRole,
  type AppUser,
} from "./hooks/useUserAdmin";
import { useLookups } from "./hooks/useLookups";

interface UserCountryAccessProps {
  user: AppUser;
  onBack: () => void;
}

function UserCountryAccess({ user, onBack }: UserCountryAccessProps) {
  const { data: countryOptions = [] } = useLookups("COUNTRY");
  const { data: access = [] } = useUserCountryAccess(user.id);
  const setAccess = useSetUserCountryAccess(user.id);
  const single = isSingleCountryRole(user.role);

  const [status, setStatus] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);

  function flash(msg: string, kind: "ok" | "err") {
    setStatus({ msg, kind });
    setTimeout(() => setStatus(null), 3000);
  }

  async function toggle(country: string) {
    const isOn = access.includes(country);
    try {
      if (single) {
        await setAccess.mutateAsync(isOn ? [] : [country]);
      } else {
        const next = isOn ? access.filter((c) => c !== country) : [...access, country];
        await setAccess.mutateAsync(next);
      }
    } catch (err) {
      flash(String(err), "err");
    }
  }

  async function clearAll() {
    try {
      await setAccess.mutateAsync([]);
      flash("Cleared — unrestricted (sees every country)", "ok");
    } catch (err) {
      flash(String(err), "err");
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <button className="ghost" onClick={onBack} style={{ padding: "6px 12px", fontSize: 12 }}>← Back to users</button>
      </div>

      <h2 style={{ marginBottom: 4 }}>Country Access — {user.name}</h2>
      <p style={{ fontSize: 13, color: "var(--text-soft)", marginBottom: 4 }}>
        Role: <strong>{user.role}</strong>. {single
          ? "This role can be assigned exactly one country at a time."
          : "This role can be assigned any number of countries."}
      </p>
      <p style={{ fontSize: 12, color: "var(--text-soft)", marginBottom: 18 }}>
        {access.length === 0
          ? "Currently unrestricted — sees reports and faults for every country. Select a country below to restrict."
          : "Restricted to the country/countries selected below. Only assets in these countries will show up in this user's review queues and asset selection."}
      </p>

      {status && <div className={`toast ${status.kind}`} style={{ maxWidth: 400, marginBottom: 12 }}>{status.msg}</div>}

      {access.length > 0 && (
        <button className="ghost" onClick={clearAll} style={{ marginBottom: 16, padding: "6px 12px", fontSize: 12 }}>
          Clear — make unrestricted
        </button>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
          gap: 12,
        }}
      >
        {countryOptions.filter((c) => c.active).map((c) => {
          const isOn = access.includes(c.name);
          return (
            <div
              key={c.id}
              role={single ? "radio" : "switch"}
              aria-checked={isOn}
              onClick={() => toggle(c.name)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                padding: "12px 16px",
                borderRadius: 14,
                cursor: "pointer",
                background: isOn ? "var(--success-soft)" : "var(--neu-bg)",
                boxShadow: isOn
                  ? "inset 3px 3px 6px var(--neu-shadow-dark), inset -3px -3px 6px var(--neu-shadow-light)"
                  : "5px 5px 10px var(--neu-shadow-dark), -5px -5px 10px var(--neu-shadow-light)",
                transition: "background 0.15s, box-shadow 0.15s",
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 500, color: isOn ? "var(--success)" : "var(--text)" }}>{c.name}</span>
              <button
                role={single ? "radio" : "switch"}
                aria-checked={isOn}
                onClick={(e) => { e.stopPropagation(); toggle(c.name); }}
                className="neu-toggle"
                data-on={isOn}
              >
                <span className="neu-toggle-knob" />
              </button>
            </div>
          );
        })}
      </div>

      {countryOptions.length === 0 && (
        <p style={{ fontSize: 13, color: "var(--text-soft)" }}>
          No countries defined yet — add them under Administration → Lookups → COUNTRY.
        </p>
      )}
    </div>
  );
}

export default UserCountryAccess;