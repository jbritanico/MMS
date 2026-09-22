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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mri-reports"] });
      // Purging reports also clears their Fault Review data on the backend (Step 43),
      // so the drawer's cached queries need to be told to refetch too -- otherwise it
      // keeps showing stale "open issues" from before the purge.
      qc.invalidateQueries({ queryKey: ["pending-mri-fault-approvals"] });
      qc.invalidateQueries({ queryKey: ["provisional-mri-fault-approvals"] });
      qc.invalidateQueries({ queryKey: ["mri-fault-rectifications"] });
      qc.invalidateQueries({ queryKey: ["carried-forward-faults"] });
    },
  });
}

// Zeroes out maintenance trigger running totals (e.g. Engine Hours, Distance Travelled)
// -- assetId null resets every asset's triggers, a specific id resets just that asset's.
export function useResetTriggerRunningValues() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (assetId: number | null) => invoke<string>("reset_trigger_running_values", { assetId }),
    onSuccess: (_data, assetId) => {
      // Matches the query key shape useAssetTriggers uses (["triggers", assetId]) --
      // invalidate broadly since a null assetId here means "every asset changed".
      qc.invalidateQueries({ queryKey: ["triggers"] });
      void assetId;
    },
  });
}