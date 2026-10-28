import { useQuery } from "@tanstack/react-query";
import { invoke } from "../../../lib/ipc";
import type { FlowExemption } from "./useReportFlow";

export interface AssetFlowReport {
  id: number;
  status: string;
  template_name: string | null;
  submitted_by: string | null;
  submitted_date: string | null;
  approved_date: string | null;
  mr_cost: number | null;
  fault_count: number;
  open_fault_count: number;
}

export interface AssetFlowTagChange {
  tag_status: string;
  previous_tag_status: string | null;
  reason: string | null;
  report_id: number | null;
  changed_by: string | null;
  changed_at: string | null;
}

export interface AssetFlowCarry {
  item_name: string;
  from_report_id: number;
  to_report_id: number;
}

export interface AssetFlowTrigger {
  mr_level: string;
  trigger_type: string;
  enabled: boolean;
  interval_value: number;
  warning_value: number;
  running_value: number;
  last_reset_date: string | null;
}

export interface AssetFlow {
  asset_id: number;
  asset_code: string | null;
  asset_description: string | null;
  asset_type: string | null;
  country: string | null;
  service_line: string | null;
  tag_status: string | null;
  tag_reason: string | null;
  reports: AssetFlowReport[];
  tag_changes: AssetFlowTagChange[];
  carries: AssetFlowCarry[];
  triggers: AssetFlowTrigger[];
  exemptions: FlowExemption[];
}

// Read-only, country-scoped: one asset and everything that happened to it (see get_asset_flow in lib.rs).
export function useAssetFlow(assetId: number | null, viewerUserId: number) {
  return useQuery({
    queryKey: ["asset-flow", assetId, viewerUserId],
    queryFn: () => invoke<AssetFlow>("get_asset_flow", { assetId, viewerUserId }),
    enabled: assetId !== null && viewerUserId > 0,
    retry: false,
  });
}
