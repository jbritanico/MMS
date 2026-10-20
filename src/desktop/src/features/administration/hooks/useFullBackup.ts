import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "../../../lib/ipc";

// Whole-database backup: every table, original ids kept (see export_full_backup in lib.rs).
export function useExportFullBackup() {
  return async () => {
    const json = await invoke<string>("export_full_backup");
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mms-full-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
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
