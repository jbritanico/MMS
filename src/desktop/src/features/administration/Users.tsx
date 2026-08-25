import { useState } from "react";
import {
  useAppUsers,
  useCreateAppUser,
  useUpdateAppUser,
  useDeleteAppUser,
  ROLES,
  type AppUser,
} from "./hooks/useUserAdmin";
import UserPermissions from "./UserPermissions";

function Users() {
  const { data: users = [], isLoading } = useAppUsers();
  const createUser = useCreateAppUser();
  const updateUser = useUpdateAppUser();
  const deleteUser = useDeleteAppUser();

  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState(ROLES[1]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editUser, setEditUser] = useState<Partial<AppUser>>({});
  const [status, setStatus] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AppUser | null>(null);
  const [managingPermsFor, setManagingPermsFor] = useState<AppUser | null>(null);

  function flash(msg: string, kind: "ok" | "err") {
    setStatus({ msg, kind });
    setTimeout(() => setStatus(null), 4000);
  }

  async function handleCreate() {
    if (!newName.trim() || !newEmail.trim()) {
      flash("Name and email are required", "err");
      return;
    }
    try {
      await createUser.mutateAsync({ name: newName.trim(), email: newEmail.trim(), role: newRole });
      setNewName("");
      setNewEmail("");
      flash("User added", "ok");
    } catch (err) {
      flash(String(err), "err");
    }
  }

  function startEdit(u: AppUser) {
    setEditingId(u.id);
    setEditUser({ name: u.name, email: u.email, role: u.role, active: u.active });
  }

  async function saveEdit(u: AppUser) {
    try {
      await updateUser.mutateAsync({
        id: u.id,
        name: editUser.name ?? u.name,
        email: editUser.email ?? u.email,
        role: editUser.role ?? u.role,
        active: editUser.active ?? u.active,
      });
      setEditingId(null);
      flash("User updated", "ok");
    } catch (err) {
      flash(String(err), "err");
    }
  }

  async function toggleActive(u: AppUser) {
    try {
      await updateUser.mutateAsync({ id: u.id, name: u.name, email: u.email, role: u.role, active: !u.active });
      flash(`${u.name} ${!u.active ? "activated" : "deactivated"}`, "ok");
    } catch (err) {
      flash(String(err), "err");
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    try {
      await deleteUser.mutateAsync(pendingDelete.id);
      flash(`"${pendingDelete.name}" deleted`, "ok");
      setPendingDelete(null);
    } catch (err) {
      flash(String(err), "err");
    }
  }

  if (managingPermsFor) {
    return <UserPermissions user={managingPermsFor} onBack={() => setManagingPermsFor(null)} />;
  }

  return (
    <div>
      <h2 style={{ marginBottom: 4 }}>Users</h2>
      <p style={{ fontSize: 13, color: "var(--text-soft)", marginBottom: 16 }}>
        Local user records with role-based access. Each role has default permissions, adjustable per-role under Roles, or per-individual here.
      </p>

      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 18, flexWrap: "wrap" }}>
        <div className="field" style={{ flex: 1, minWidth: 160, marginBottom: 0 }}>
          <label>Name</label>
          <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Ahmed Al-Farsi" />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 200, marginBottom: 0 }}>
          <label>Email</label>
          <input type="text" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="e.g. ahmed@sprint-ae.com" />
        </div>
        <div className="field" style={{ width: 160, marginBottom: 0 }}>
          <label>Role</label>
          <select className="neu-select" value={newRole} onChange={(e) => setNewRole(e.target.value)}>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <button className="primary" onClick={handleCreate}>Add user</button>
      </div>

      {status && <div className={`toast ${status.kind}`} style={{ maxWidth: 400, marginBottom: 12 }}>{status.msg}</div>}

      {isLoading ? (
        <div className="empty">Loading...</div>
      ) : users.length === 0 ? (
        <div className="empty">No users yet — add one above to get started</div>
      ) : (
        <div className="cards">
          {users.map((u) => (
            <div className="card" key={u.id} style={{ cursor: "default" }}>
              {editingId === u.id ? (
                <div className="card-main" style={{ display: "grid", gap: 8 }}>
                  <input type="text" className="trigger-input" value={editUser.name ?? ""} onChange={(e) => setEditUser({ ...editUser, name: e.target.value })} placeholder="Name" />
                  <input type="text" className="trigger-input" value={editUser.email ?? ""} onChange={(e) => setEditUser({ ...editUser, email: e.target.value })} placeholder="Email" />
                  <select className="neu-select" value={editUser.role ?? ""} onChange={(e) => setEditUser({ ...editUser, role: e.target.value })}>
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              ) : (
                <div className="card-main">
                  <div className="code" style={{ fontFamily: "var(--sans)", fontWeight: 500 }}>{u.name}</div>
                  <div className="desc">{u.email}</div>
                  <div className="meta">
                    <span className={`pill ${u.active ? "active" : "inactive"}`}>{u.active ? "Active" : "Inactive"}</span>
                    <span className="pill neutral">{u.role}</span>
                  </div>
                </div>
              )}

              <div className="card-actions">
                {editingId === u.id ? (
                  <>
                    <button className="icon-btn" aria-label="Save" onClick={() => saveEdit(u)}>
                      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    <button className="icon-btn" aria-label="Cancel" onClick={() => setEditingId(null)}>
                      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                      </svg>
                    </button>
                  </>
                ) : (
                  <>
                    <button className="ghost" onClick={() => setManagingPermsFor(u)} style={{ padding: "6px 10px", fontSize: 12 }}>
                      Permissions
                    </button>
                    <button className="icon-btn" aria-label={u.active ? "Deactivate" : "Activate"} onClick={() => toggleActive(u)}>
                      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        {u.active ? (
                          <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                        ) : (
                          <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                        )}
                      </svg>
                    </button>
                    <button className="icon-btn" aria-label="Edit" onClick={() => startEdit(u)}>
                      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
                      </svg>
                    </button>
                    <button className="icon-btn icon-danger" aria-label="Delete" onClick={() => setPendingDelete(u)}>
                      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                      </svg>
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {pendingDelete && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 9V13M12 17H12.01M10.29 3.86L1.82 18A2 2 0 0 0 3.54 21H20.46A2 2 0 0 0 22.18 18L13.71 3.86A2 2 0 0 0 10.29 3.86Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h3>Delete user?</h3>
            <p>This will permanently delete <strong>"{pendingDelete.name}"</strong> and any personal permission overrides.</p>
            <div className="modal-actions">
              <button className="ghost" onClick={() => setPendingDelete(null)}>Cancel</button>
              <button className="danger" onClick={confirmDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Users;