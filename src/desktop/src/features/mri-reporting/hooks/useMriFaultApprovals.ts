import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "../../../lib/ipc";

export interface MriFaultApproval {
  id: number;
  report_id: number;
  template_checklist_item_id: number;
  original_severity: "Minor" | "Moderate" | "Critical";
  decision: "Pending" | "Approved" | "Reclassified" | "Rejected";
  new_severity: "Minor" | "Moderate" | "Critical" | null;
  reviewer: string | null;
  review_method: "In-Person" | "Phone" | null;
  notes: string | null;
  created_date: string;
  updated_date: string;
}

export function useMriFaultApprovals(reportId: number) {
  return useQuery({
    queryKey: ["mri-fault-approvals", reportId],
    queryFn: () => invoke<MriFaultApproval[]>("get_mri_fault_approvals", { reportId }),
  });
}

export interface PendingFaultApprovalRow {
  id: number;
  report_id: number;
  template_checklist_item_id: number;
  original_severity: "Minor" | "Moderate" | "Critical";
  created_date: string;
  asset_code: string | null;
  checklist_description: string | null;
  issue_details: string | null;
  action_taken: string | null;
}

const PENDING_APPROVALS_KEY = ["pending-mri-fault-approvals"];

export function usePendingMriFaultApprovals() {
  return useQuery({
    queryKey: PENDING_APPROVALS_KEY,
    queryFn: () => invoke<PendingFaultApprovalRow[]>("get_pending_mri_fault_approvals"),
  });
}

// Auto-creates (or keeps in sync, while still Pending) a Pending approval row for a
// Fail'd checklist item whose severity is Moderate or Critical. A no-op for Minor.
export function useEnsureMriFaultApproval(reportId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (item: { templateChecklistItemId: number; originalSeverity: string }) =>
      invoke<string>("ensure_mri_fault_approval", { reportId, ...item }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mri-fault-approvals", reportId] }),
  });
}

export function useSetMriFaultApprovalDecision(reportId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (item: {
      id: number;
      decision: "Pending" | "Approved" | "Reclassified" | "Rejected";
      newSeverity: string | null;
      reviewer: string;
      reviewMethod: "In-Person" | "Phone";
      notes: string | null;
    }) => invoke<string>("set_mri_fault_approval_decision", item),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mri-fault-approvals", reportId] });
      qc.invalidateQueries({ queryKey: PENDING_APPROVALS_KEY });
    },
  });
}