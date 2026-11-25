import { useRef, useState } from "react";
import { useCurrentUser } from "../../lib/currentUser";
import { useEffectivePermissions } from "./hooks/useUserAdmin";
import { revealBackupFile, useExportFullBackup, useImportFullBackup } from "./hooks/useFullBackup";
import { IsoBox, backupHint, fmtDay, readBackups, recordBackup, useReportAdminHints, useReportAdminKpis } from "./AdminIsoGuide";

function DataBackup() {
  const { user: currentUser } = useCurrentUser();
  const { data: myPermissions = [] } = useEffectivePermissions(currentUser?.id ?? 0);
  const canExportAll = myPermissions.includes("backups.export");
  const canImportAll = myPermissions.includes("backups.import");
  const exportFull = useExportFullBackup();
  const importFull = useImportFullBackup();
  const fullImportRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);
  const [saved, setSaved] = useState<number[]>(() => readBackups());
  // FB-008: where the last backup was saved, shown until the screen is left.
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const hint = backupHint();
  useReportAdminHints("data-backup", hint ? [hint] : []);
  const savedTimes = readBackups();
  const daysSince = savedTimes[0] ? Math.floor((Date.now() - savedTimes[0]) / 86400000) : null;
  useReportAdminKpis("data-backup", [
    { label: "last backup from this PC", value: savedTimes[0] ? fmtDay(savedTimes[0]) : "none yet", tone: daysSince === null || daysSince > 7 ? "look" : "ok" },
    { label: "days since", value: daysSince ?? "—", tone: daysSince === null || daysSince > 7 ? "look" : "ok" },
    { label: "backups saved here", value: savedTimes.length, tone: "blue" },
  ]);

  function flash(msg: string, kind: "ok" | "err") {
    setStatus({ msg, kind });
    setTimeout(() => setStatus(null), 4000);
  }

  return (
    <div>
      {status && <div className={`toast ${status.kind}`} style={{ maxWidth: 400, marginBottom: 12 }}>{status.msg}</div>}
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, maxWidth: 980 }}>
        <div className="panel adm-lift" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <IsoBox tone="ok" arrow="down" />
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Save a full backup</div>
              <p style={{ fontSize: 13, color: "var(--text-soft)", margin: "4px 0 0" }}>
                One file with every table: people, roles, units, templates, reports, faults and the rest. The file is not
                encrypted, so keep it somewhere safe.
              </p>
            </div>
          </div>
          {canExportAll ? (
            <>
            <button
              className="primary"
              style={{ alignSelf: "flex-start" }}
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const path = await exportFull();
                  if (!path) {
                    flash("Backup not saved: the Save As box was closed.", "err");
                    return;
                  }
                  recordBackup();
                  setSaved(readBackups());
                  setSavedPath(path);
                  flash("Backup file saved.", "ok");
                } catch (err) {
                  flash(String(err), "err");
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Saving the backup…" : "⤓ Save backup file"}
            </button>
            <span style={{ fontSize: 12, color: "var(--text-soft)" }}>A Save As box asks where to save the file.</span>
            {savedPath && (
              <div role="status" style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px 12px", borderRadius: 10, border: "1px solid var(--success)", background: "color-mix(in srgb, var(--success) 8%, transparent)" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--success)" }}>Backup saved</div>
                <div style={{ fontSize: 12.5, overflowWrap: "anywhere", userSelect: "text", fontFamily: "var(--mono, Consolas, monospace)" }}>{savedPath}</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" className="ghost" style={{ padding: "6px 12px", fontSize: 12 }}
                    onClick={async () => { try { await revealBackupFile(savedPath); } catch (err) { flash(String(err), "err"); } }}>
                    Open folder
                  </button>
                  <button type="button" className="ghost" style={{ padding: "6px 12px", fontSize: 12 }}
                    onClick={async () => { try { await navigator.clipboard.writeText(savedPath); flash("Path copied.", "ok"); } catch { flash("Could not copy. Select the path and press Ctrl+C.", "err"); } }}>
                    Copy path
                  </button>
                </div>
              </div>
            )}
            </>
          ) : (
            <span style={{ fontSize: 12.5, color: "var(--text-soft)" }}>Your role can't save backups.</span>
          )}
        </div>
        <div className="panel adm-lift" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <IsoBox tone="look" arrow="up" />
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Restore from a backup</div>
              <p style={{ fontSize: 13, color: "var(--text-soft)", margin: "4px 0 0" }}>
                Merges a backup file into MMS: anything in the file replaces the record with the same id here.
                Save a backup of today first, just in case.
              </p>
            </div>
          </div>
          {canImportAll ? (
            <button className="ghost" style={{ alignSelf: "flex-start" }} onClick={() => fullImportRef.current?.click()} disabled={importFull.isPending}>
              ⤒ Choose backup file…
            </button>
          ) : (
            <span style={{ fontSize: 12.5, color: "var(--text-soft)" }}>Your role can't restore backups.</span>
          )}
        </div>
      </div>

      <div className="adm-section-h" style={{ marginTop: 20 }}>Backups saved from this PC</div>
      {saved.length === 0 ? (
        <div className="empty" style={{ maxWidth: 640 }}>None yet. Backups saved from other PCs aren't listed here.</div>
      ) : (
        <BackupTimeline saved={saved} />
      )}
    </div>
  );
}

// Recent backups as a short 3D timeline, newest on the right and lifted. Display only.
function BackupTimeline({ saved }: { saved: number[] }) {
  const list = [...saved].reverse();
  const gap = 150, W = 80 + (list.length - 1) * gap + 80;
  return (
    <div style={{ overflowX: "auto" }}>
      <svg viewBox={`0 0 ${W} 120`} width={W} height={120} role="img" aria-label={`Last backup ${fmtDay(saved[0])}`} style={{ display: "block", maxWidth: "100%", height: "auto" }}>
        <path d={`M80 52 H${80 + (list.length - 1) * gap}`} stroke="var(--tig-skip)" strokeWidth={3} strokeDasharray="4 6" />
        {list.map((t, i) => {
          const last = i === list.length - 1, cx = 80 + i * gap, cy = last ? 42 : 52;
          return (
            <g key={t} className="tig-lift" style={{ animationDelay: `${i * 0.06}s` }}>
              <polygon points={`${cx - 40},${cy} ${cx},${cy + 20} ${cx},${cy + 27} ${cx - 40},${cy + 7}`} className="tig-slab-l" />
              <polygon points={`${cx},${cy + 20} ${cx + 40},${cy} ${cx + 40},${cy + 7} ${cx},${cy + 27}`} className="tig-slab-r" />
              <polygon points={`${cx},${cy - 20} ${cx + 40},${cy} ${cx},${cy + 20} ${cx - 40},${cy}`} fill={last ? "var(--tig-ok-soft)" : "var(--tig-top)"} stroke={last ? "var(--tig-ok)" : "none"} strokeWidth={2} />
              <text x={cx} y={105} textAnchor="middle" className="adm-bar-l" style={{ fontWeight: last ? 700 : 500 }}>{fmtDay(t)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default DataBackup;
