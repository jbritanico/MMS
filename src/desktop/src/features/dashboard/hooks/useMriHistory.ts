import { useQuery } from "@tanstack/react-query";
import { invoke } from "../../../lib/ipc";

export interface AssetMriHistorySummaryRow {
  asset_id: number;
  asset_code: string;
  asset_description: string | null;
  report_count: number;
  latest_status: string | null;
  latest_report_id: number | null;
  latest_date: string | null;
}

export function useAssetsWithMriHistorySummary() {
  return useQuery({
    queryKey: ["assets-mri-history-summary"],
    queryFn: () => invoke<AssetMriHistorySummaryRow[]>("get_assets_with_mri_history_summary"),
  });
}

export interface MriHistoryRow {
  id: number;
  status: string;
  submitted_by: string | null;
  submitted_date: string | null;
  approved_by: string | null;
  approved_date: string | null;
  created_date: string;
  issue_count: number;
  km_reading: number | null;
  oh_reading: number | null;
  eh_reading: number | null;
  key_issues: string[];
  compliance_stage: string | null;
}

export function useAssetMriHistory(assetId: number | null) {
  return useQuery({
    queryKey: ["asset-mri-history", assetId],
    queryFn: () => invoke<MriHistoryRow[]>("get_asset_mri_history", { assetId }),
    enabled: assetId !== null,
  });
}