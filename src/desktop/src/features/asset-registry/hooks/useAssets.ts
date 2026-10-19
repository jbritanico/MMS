import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "../../../lib/ipc";
import type { Asset, AssetTagHistoryEntry, MocExemption, MocExemptionInput } from "../types";

const ASSETS_KEY = ["assets"];

export function useAssets() {
    return useQuery({
        queryKey: ASSETS_KEY,
        queryFn: () => invoke<Asset[]>("get_assets"),
    });
}

export function useAssetTagHistory(assetId: number | null) {
    return useQuery({
        queryKey: ["asset-tag-history", assetId],
        queryFn: () => invoke<AssetTagHistoryEntry[]>("get_asset_tag_history", { assetId }),
        enabled: assetId != null,
    });
}

export function useMocExemptions(assetId: number | null) {
    return useQuery({
        queryKey: ["moc-exemptions", assetId],
        queryFn: () => invoke<MocExemption[]>("get_moc_exemptions", { assetId }),
        enabled: assetId != null,
    });
}

export function useCreateMocExemption() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (args: { exemption: MocExemptionInput; createdBy: string }) =>
            invoke("create_moc_exemption", { exemption: args.exemption, createdBy: args.createdBy }),
        onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["moc-exemptions", v.exemption.asset_id] }),
    });
}

export function useRevokeMocExemption() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (args: { id: number; revokedBy: string; reason: string }) =>
            invoke("revoke_moc_exemption", args),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["moc-exemptions"] }),
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