import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "../../../lib/ipc";

export function usePurgeAssetTypes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => invoke<string>("purge_asset_types"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["asset-types"] }),
  });
}

export function usePurgeChecklistSections() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => invoke<string>("purge_checklist_sections"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["checklist-sections"] }),
  });
}

export function usePurgeChecklistDatabank() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => invoke<string>("purge_checklist_databank"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["checklist-databank"] }),
  });
}

export function usePurgeLookups() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (criteria: string | null) => invoke<string>("purge_lookups", { criteria }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lookups"] });
      qc.invalidateQueries({ queryKey: ["lookup-criteria"] });
    },
  });
}

export interface MriReportPurgeFilter {
  asset_id: number | null;
  country: string | null;
  service_line: string | null;
  asset_type_id: number | null;
}

export function usePreviewMriReportPurge() {
  return useMutation({
    mutationFn: (filter: MriReportPurgeFilter) => invoke<number>("preview_mri_report_purge", { filter }),
  });
}

export function usePurgeMriReports() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filter: MriReportPurgeFilter) => invoke<string>("purge_mri_reports", { filter }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mri-reports"] }),
  });
}