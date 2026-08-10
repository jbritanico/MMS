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