import type { ReactNode } from "react";
import { useCurrentUser } from "./currentUser";

/**
 * Gate shown at the root of the app. If no active user is currently selected,
 * shows a full-screen "who's using this?" picker instead of the app content.
 * Reuses the same neumorphic .menu-card look as the Main Menu tiles so it
 * feels like part of the app rather than a plain list.
 */
function UserPickerGate({ children }: { children: ReactNode }) {
  const { user, users, isLoading, setCurrentUserId } = useCurrentUser();

  if (isLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
        <span style={{ color: "var(--text-soft)", fontSize: 13 }}>Loading users...</span>
      </div>
    );
  }

  if (user) {
    return <>{children}</>;
  }

  const activeUsers = users.filter((u) => u.active);

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 720 }}>
        <div className="header" style={{ justifyContent: "center", textAlign: "center", flexDirection: "column", gap: 4 }}>
          <h1>Who's using this?</h1>
          <span className="sub">Select your name to continue</span>
        </div>

        {activeUsers.length === 0 ? (
          <p style={{ textAlign: "center", color: "var(--text-soft)", fontSize: 13 }}>
            No active users found. Add a user under Administration first.
          </p>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: 16,
            }}
          >
            {activeUsers.map((u) => (
              <button
                key={u.id}
                className="menu-card"
                style={{ minHeight: 130 }}
                onClick={() => setCurrentUserId(u.id)}
              >
                <div className="menu-icon-wrap">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8" />
                    <path d="M4.5 20c0-3.6 3.4-6.5 7.5-6.5s7.5 2.9 7.5 6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </div>
                <h3>{u.name}</h3>
                <p>{u.role}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default UserPickerGate;