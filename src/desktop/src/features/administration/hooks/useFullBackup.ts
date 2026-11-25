import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "../../../lib/ipc";
import { save } from "@tauri-apps/plugin-dialog";
import { downloadDir, join } from "@tauri-apps/api/path";

// Whole-database backup: every table, original ids kept (see export_full_backup in lib.rs).
// FB-008: a Save As box asks where to save the backup (Downloads and a dated name are suggested).
// Returns the full path of the saved file, or null when the user cancels the box.
export function useExportFullBackup() {
  return async (): Promise<string | null> => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    const fileName = `mms-full-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
    let defaultPath = fileName;
    try { defaultPath = await join(await downloadDir(), fileName); } catch { /* the box opens in its last folder */ }
    const chosen = await save({
      title: "Save MMS full backup",
      defaultPath,
      filters: [{ name: "MMS full backup", extensions: ["json"] }],
    });
    if (!chosen) return null;
    const path = /\.json$/i.test(chosen) ? chosen : `${chosen}.json`;
    return invoke<string>("write_full_backup_file", { path });
  };
}

/** FB-008: opens the folder of a saved backup file in File Explorer, with the file selected. */
export function revealBackupFile(path: string) {
  return invoke<void>("reveal_backup_file", { path });
}

// Empties users, their permission overrides and country scoping; nothing else.
export function useClearAllUsers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => invoke<string>("clear_all_users"),
    onSuccess: () => qc.invalidateQueries(),
  });
}

// Merge import: backup rows are written over rows with the same id / unique key.
export function useImportFullBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (backupJson: string) => invoke<string>("import_full_backup", { backupJson }),
    onSuccess: () => qc.invalidateQueries(),
  });
}
