import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "../../../lib/ipc";

export interface MriFaultApproval {
  id: number;
  report_id: number;
  template_checklist_item_id: number;
  original_severity: "Minor" | "Moderate" | "Critical";
  decision: "Pending" | "Approved" | "Reclassified" | "Rejected" | "Carryforward";
  new_severity: "Minor" | "Moderate" | "Critical" | null;
  reviewer: string | null;
  review_method: "In-Person" | "Phone" | null;
  notes: string | null;
  recorded_by: string | null;
  provisional_status: "Provisional" | "Confirmed" | null;
  confirmed_by: string | null;
  confirmed_date: string | null;
  carried_to_report_id: number | null;
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

export interface ProvisionalFaultApprovalRow {
  id: number;
  report_id: number;
  template_checklist_item_id: number;
  original_severity: "Minor" | "Moderate" | "Critical";
  decision: "Pending" | "Approved" | "Reclassified" | "Rejected" | "Carryforward";
  new_severity: "Minor" | "Moderate" | "Critical" | null;
  reviewer: string | null;
  review_method: "In-Person" | "Phone" | null;
  recorded_by: string | null;
  created_date: string;
  asset_code: string | null;
  checklist_description: string | null;
}

const PROVISIONAL_APPROVALS_KEY = ["provisional-mri-fault-approvals"];

// Phoned-in decisions still awaiting the real authority's confirmation, regardless of
// what the decision itself was — this is a separate queue from "pending review".
export function useProvisionalMriFaultApprovals() {
  return useQuery({
    queryKey: PROVISIONAL_APPROVALS_KEY,
    queryFn: () => invoke<ProvisionalFaultApprovalRow[]>("get_provisional_mri_fault_approvals"),
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
      decision: "Pending" | "Approved" | "Reclassified" | "Rejected" | "Carryforward";
      newSeverity: string | null;
      reviewer: string;
      reviewMethod: "In-Person" | "Phone";
      notes: string | null;
      recordedBy: string;
      isProvisional: boolean;
    }) => invoke<string>("set_mri_fault_approval_decision", item),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mri-fault-approvals", reportId] });
      qc.invalidateQueries({ queryKey: PENDING_APPROVALS_KEY });
    },
  });
}

// Formalizes a phoned-in Provisional decision once the real authority confirms it.
// The decision already took effect (closure/tag) when it was recorded — this only
// completes the paper trail.
export function useConfirmProvisionalApproval(reportId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (item: { id: number; confirmedBy: string }) =>
      invoke<string>("confirm_provisional_approval", item),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mri-fault-approvals", reportId] });
      qc.invalidateQueries({ queryKey: PENDING_APPROVALS_KEY });
      qc.invalidateQueries({ queryKey: PROVISIONAL_APPROVALS_KEY });
    },
  });
}