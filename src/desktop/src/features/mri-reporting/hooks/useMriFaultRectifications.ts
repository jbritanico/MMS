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
  // "Planned" = Moderate fault tracked for follow-up (no tag, equipment stays available).
  tag_status: "Red" | "Green" | "Planned";
  created_date: string;
  updated_date: string;
  // Figure 4: limitations communicated to the field team while the fault is open.
  limitations_note: string | null;
  limitations_informed_by: string | null;
  limitations_informed_date: string | null;
  // Which part the repair is waiting for (kept while parts are not yet available).
  awaited_part: string | null;
  // What was done to fix the fault, written by the person who closes it (FB-022).
  action_taken: string | null;
  // FB-013: the user assigned to rectify it (null when a name was typed or nobody yet).
  assigned_technician_user_id: number | null;
}

// FB-013: repairs a reviewer assigned to the signed-in user.
export interface MyRepairAssignment {
  rectification_id: number;
  report_id: number;
  asset_code: string | null;
  item: string | null;
  tag_status: "Red" | "Planned";
  assigned_at: string | null;
  seen: boolean;
}
export function useMyRepairAssignments(userId: number) {
  return useQuery({
    queryKey: ["my-repair-assignments", userId],
    queryFn: () => invoke<MyRepairAssignment[]>("get_my_repair_assignments", { userId }),
    enabled: !!userId,
  });
}
export function useMarkRepairAssignmentsSeen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: number) => invoke<string>("mark_repair_assignments_seen", { userId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-repair-assignments"] }),
  });
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
// Country-scoped server-side: a user with countries assigned only sees faults on assets
// in those countries.
export function usePendingMriFaultRectifications(viewerUserId: number) {
  return useQuery({
    queryKey: [...PENDING_RECTIFICATIONS_KEY, viewerUserId],
    queryFn: () => invoke<MriFaultRectification[]>("get_pending_mri_fault_rectifications", { viewerUserId }),
    enabled: !!viewerUserId,
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
      updatedBy?: string | null;
      awaitedPart?: string | null;
      assignedTechnicianUserId?: number | null;
    }) =>
      // The Rust command takes a single `update: MriFaultRectificationUpdate` argument whose
      // fields are snake_case (no serde rename), so the plan must be wrapped and renamed here.
      invoke<string>("update_mri_fault_rectification", {
        update: {
          id: item.id,
          assigned_technician: item.assignedTechnician,
          parts_status: item.partsStatus,
          repair_date: item.repairDate,
          updated_by: item.updatedBy ?? null,
          awaited_part: item.awaitedPart ?? null,
          assigned_technician_user_id: item.assignedTechnicianUserId ?? null,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mri-fault-rectifications", reportId] });
      qc.invalidateQueries({ queryKey: PENDING_RECTIFICATIONS_KEY });
      qc.invalidateQueries({ queryKey: ["my-repair-assignments"] });
    },
  });
}

// Terminal step: records who verified the repair and flips the tag Red -> Green.
export function useVerifyMriFaultRectification(reportId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (item: { id: number; verifiedBy: string; functionTestPassed: boolean; actionTaken: string }) =>
      invoke<string>("verify_mri_fault_rectification", item),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mri-fault-rectifications", reportId] });
      qc.invalidateQueries({ queryKey: PENDING_RECTIFICATIONS_KEY });
    },
  });
}
// Figure 4: record the equipment limitations communicated to the field team.
export function useRecordEquipmentLimitations(reportId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (item: { id: number; note: string; informedBy: string }) =>
      invoke<string>("record_equipment_limitations", item),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mri-fault-rectifications", reportId] });
      qc.invalidateQueries({ queryKey: PENDING_RECTIFICATIONS_KEY });
    },
  });
}
