import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "../../../lib/ipc";

export interface AssetType {
  id: number;
  description: string;
  active: boolean;
  created_by: string;
  created_date: string;
  updated_by: string;
  updated_date: string;
}

const KEY = ["asset-types"];

export function useAssetTypes() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => invoke<AssetType[]>("get_asset_types"),
  });
}

export function useCreateAssetType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (description: string) => invoke("create_asset_type", { description }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateAssetType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (item: { id: number; description: string; active: boolean }) =>
      invoke("update_asset_type", item),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteAssetType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => invoke("delete_asset_type", { id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useBulkCreateAssetTypes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (descriptions: string[]) =>
      invoke<string>("bulk_create_asset_types", { descriptions }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}