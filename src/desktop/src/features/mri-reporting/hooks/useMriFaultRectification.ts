import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "../../../lib/ipc";

export interface MriFaultRectification {
  id: number;
  fault_approval_id: number;
  report_id: number;
  template_checklist_item_id: number;
  asset_code: string | null;
  checklist_description: string | null;
  assigned_technician: string | null;
  parts_status: "Awaiting" | "Ordered" | "Available";
  repair_date: string | null;
  verified_by: string | null;
  verified_date: string | null;
  tag_status: "Red" | "Green";
  created_date: string;
  updated_date: string;
}

const PENDING_RECTIFICATIONS_KEY = ["pending-mri-fault-rectifications"];

// A fault that closes still Critical is auto-inserted into mri_fault_rectifications by
// set_mri_fault_approval_decision on the backend — there's no separate "create" call.
export function useMriFaultRectifications(reportId: number) {
  return useQuery({
    queryKey: ["mri-fault-rectifications", reportId],
    queryFn: () => invoke<MriFaultRectification[]>("get_mri_fault_rectifications", { reportId }),
  });
}

// Cross-report queue of everything still Red-Tagged, for the Rectification Queue screen.
export function usePendingMriFaultRectifications() {
  return useQuery({
    queryKey: PENDING_RECTIFICATIONS_KEY,
    queryFn: () => invoke<MriFaultRectification[]>("get_pending_mri_fault_rectifications"),
  });
}

// Updates the in-progress repair plan (technician, parts, repair date). Does not touch
// verification or the tag — that's the separate useVerifyMriFaultRectification action.
export function useUpdateMriFaultRectification(reportId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (item: {
      id: number;
      assignedTechnician: string | null;
      partsStatus: "Awaiting" | "Ordered" | "Available";
      repairDate: string | null;
    }) => invoke<string>("update_mri_fault_rectification", item),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mri-fault-rectifications", reportId] });
      qc.invalidateQueries({ queryKey: PENDING_RECTIFICATIONS_KEY });
    },
  });
}

// Terminal step: records who verified the repair and flips the tag Red -> Green.
export function useVerifyMriFaultRectification(reportId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (item: { id: number; verifiedBy: string }) =>
      invoke<string>("verify_mri_fault_rectification", item),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mri-fault-rectifications", reportId] });
      qc.invalidateQueries({ queryKey: PENDING_RECTIFICATIONS_KEY });
    },
  });
}