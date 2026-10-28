import { useQuery } from "@tanstack/react-query";
import { invoke } from "../../../lib/ipc";

export interface FlowRepair {
  assigned_technician: string | null;
  parts_status: string | null;
  repair_date: string | null;
  verified_by: string | null;
  verified_date: string | null;
  tag_status: string | null;
  function_test_passed: boolean | null;
}

export interface FlowFault {
  approval_id: number;
  item_name: string;
  original_severity: string;
  decision: string;
  new_severity: string | null;
  reviewer: string | null;
  assigned_to: string | null;
  provisional_status: string | null;
  acknowledged_by: string | null;
  carried_to_report_id: number | null;
  log_entries: number;
  repair: FlowRepair | null;
}

export interface FlowOnsiteRepair {
  item_name: string;
  severity: string | null;
  action_taken: string | null;
  repaired_by: string | null;
  repaired_at: string | null;
}

export interface FlowTagChange {
  tag_status: string;
  previous_tag_status: string | null;
  reason: string | null;
  changed_by: string | null;
  changed_at: string | null;
}

export interface FlowCarried {
  approval_id: number;
  from_report_id: number;
  item_name: string;
}

export interface FlowExemption {
  moc_reference: string;
  status: string;
  valid_from: string | null;
  valid_until: string | null;
  approved_by: string | null;
}

export interface ReportFlow {
  report_id: number;
  status: string;
  template_name: string | null;
  submitted_by: string | null;
  submitted_date: string | null;
  approved_by: string | null;
  approved_date: string | null;
  mr_cost: number | null;
  mr_cost_by: string | null;
  mr_cost_date: string | null;
  asset_id: number;
  asset_code: string | null;
  asset_description: string | null;
  asset_tag_status: string | null;
  faults: FlowFault[];
  onsite_repairs: FlowOnsiteRepair[];
  tag_changes: FlowTagChange[];
  carried_in: FlowCarried[];
  exemptions: FlowExemption[];
}

// Read-only: one report and everything connected to it (see get_report_flow in lib.rs).
export function useReportFlow(reportId: number | null) {
  return useQuery({
    queryKey: ["report-flow", reportId],
    queryFn: () => invoke<ReportFlow>("get_report_flow", { reportId }),
    enabled: reportId !== null,
  });
}
