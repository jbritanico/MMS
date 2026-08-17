import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "../../../lib/ipc";
import type { Asset } from "../types";

const ASSETS_KEY = ["assets"];

export function useAssets() {
    return useQuery({
        queryKey: ASSETS_KEY,
        queryFn: () => invoke<Asset[]>("get_assets"),
    });
}

export function useCreateAsset() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (asset: Asset) => invoke("create_asset", { asset }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ASSETS_KEY }),
    });
}

export function useUpdateAsset() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (asset: Asset) => invoke("update_asset", { asset }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ASSETS_KEY }),
    });
}

export function useDeleteAsset() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => invoke("delete_asset", { id }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ASSETS_KEY }),
    });
}

export function useExportAssetsBackup() {
  return async () => {
    const json = await invoke<string>("export_assets_backup");
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `assets-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
}

export function useImportAssetsBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (backupJson: string) => invoke<string>("import_assets_backup", { backupJson }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["assets"] }),
  });
}