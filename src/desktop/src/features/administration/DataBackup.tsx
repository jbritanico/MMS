import { useRef, useState } from "react";
import { useCurrentUser } from "../../lib/currentUser";
import { useEffectivePermissions } from "./hooks/useUserAdmin";
import { useExportFullBackup, useImportFullBackup } from "./hooks/useFullBackup";

function DataBackup() {
  const { user: currentUser } = useCurrentUser();
  const { data: myPermissions = [] } = useEffectivePermissions(currentUser?.id ?? 0);
  const canExportAll = myPermissions.includes("backups.export");
  const canImportAll = myPermissions.includes("backups.import");
  const exportFull = useExportFullBackup();
  const importFull = useImportFullBackup();
  const fullImportRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);

  function flash(msg: string, kind: "ok" | "err") {
    setStatus({ msg, kind });
    setTimeout(() => setStatus(null), 4000);
  }

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Full data backup</h2>
      {status && <div className={`toast ${status.kind}`} style={{ maxWidth: 400, marginBottom: 12 }}>{status.msg}</div>}
      <div className="panel" style={{ maxWidth: 640, padding: 16 }}>
        <p style={{ fontSize: 12.5, color: "var(--text-soft)", margin: "0 0 10px" }}>
          Exports every table (users, roles, assets, templates, reports, faults, exemptions and the rest) to one file with
          all ids kept. Import merges a file into the current database: rows in the file replace rows with the same id.
          The file holds everything unencrypted, so store it safely.
        </p>
        <input
          ref={fullImportRef}
          type="file"
          accept=".json"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async (evt) => {
              try {
                const result = await importFull.mutateAsync(evt.target?.result as string);
                flash(result, "ok");
              } catch (err) {
                flash(String(err), "err");
              }
            };
            reader.readAsText(file);
            if (fullImportRef.current) fullImportRef.current.value = "";
          }}
        />
        <div className="actions">
          {canExportAll && (
            <button
              className="primary"
              onClick={async () => {
                try {
                  await exportFull();
                  flash("Full backup downloaded.", "ok");
                } catch (err) {
                  flash(String(err), "err");
                }
              }}
            >
              ⤓ Export full backup
            </button>
          )}
          {canImportAll && (
            <button className="ghost" onClick={() => fullImportRef.current?.click()} disabled={importFull.isPending}>
              ⤒ Import full backup
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default DataBackup;
