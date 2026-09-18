import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "../../../lib/ipc";

export type ReportStatus = "Draft" | "Submitted" | "Endorsed" | "Escalated" | "Approved" | "Rejected";

export interface MriReport {
  id: number;
  template_id: number;
  asset_id: number;
  status: ReportStatus;
  submitted_by: string | null;
  submitted_date: string | null;
  approved_by: string | null;
  approved_date: string | null;
  created_date: string;
}

const KEY = ["mri-reports"];

export function useMriReports() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => invoke<MriReport[]>("get_mri_reports"),
  });
}

export function useMriReport(id: number | null) {
  return useQuery({
    queryKey: ["mri-report", id],
    queryFn: () => invoke<MriReport>("get_mri_report", { id }),
    enabled: id !== null,
  });
}

export function useCreateMriReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (report: { template_id: number; asset_id: number }) =>
      invoke<number>("create_mri_report", { report }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteMriReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => invoke("delete_mri_report", { id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useSubmitMriReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => invoke("submit_mri_report", { id }),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: KEY });
      // The wizard reads the single report via its own ["mri-report", id] key --
      // without this, it keeps showing the stale "Draft" status after submit and
      // never locks/shows confirmation.
      qc.invalidateQueries({ queryKey: ["mri-report", id] });
    },
  });
}

const REPORTS_NEEDING_ACTION_KEY = ["reports-needing-supervisor-action"];

// The Job Supervisor's review of a Submitted report -- never closes it by itself. A
// Minor-only (or no-issue) report moves to Endorsed; a Moderate/Critical report moves to
// Escalated and its faults enter the Pending Approvals queue. Either way it still needs
// an explicit close_mri_report call (see useCloseMriReport) before it's done.
export function useEndorseMriReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (item: { reportId: number; endorsedBy: string }) =>
      invoke<string>("endorse_mri_report", item),
    onSuccess: (_data, item) => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ["mri-report", item.reportId] });
      qc.invalidateQueries({ queryKey: ["pending-mri-fault-approvals"] });
      qc.invalidateQueries({ queryKey: REPORTS_NEEDING_ACTION_KEY });
    },
  });
}

// The explicit closing step -- valid once a report is Endorsed, or Escalated with every
// fault resolved. Deliberately never happens automatically.
export function useCloseMriReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (item: { reportId: number; closedBy: string }) =>
      invoke<string>("close_mri_report", item),
    onSuccess: (_data, item) => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ["mri-report", item.reportId] });
      qc.invalidateQueries({ queryKey: REPORTS_NEEDING_ACTION_KEY });
    },
  });
}

// Everything currently needing a Supervisor's attention across all assets -- Submitted
// (awaiting endorsement), Endorsed (awaiting close), and Escalated-but-fully-resolved
// (also awaiting close). Powers the "Reports to Review" queue and its badge count.
export function useReportsNeedingSupervisorAction() {
  return useQuery({
    queryKey: REPORTS_NEEDING_ACTION_KEY,
    queryFn: () =>
      invoke<{
        id: number;
        status: string;
        asset_code: string | null;
        submitted_by: string | null;
        submitted_date: string | null;
      }[]>("get_reports_needing_supervisor_action"),
  });
}

export function useSetMriReportStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (item: { id: number; status: ReportStatus }) =>
      invoke("set_mri_report_status", item),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function usePreviousEngineHours(assetId: number, currentReportId: number) {
  return useQuery({
    queryKey: ["previous-engine-hours", assetId, currentReportId],
    queryFn: () => invoke<string | null>("get_previous_engine_hours", { assetId, currentReportId }),
    enabled: !!assetId && !!currentReportId,
  });
}

export function usePendingChecklistItemIds(assetId: number, currentReportId: number) {
  return useQuery({
    queryKey: ["pending-checklist-items", assetId, currentReportId],
    queryFn: () => invoke<number[]>("get_pending_checklist_item_ids", { assetId, currentReportId }),
    enabled: !!assetId && !!currentReportId,
  });
}

export function useAssetsWithPendingIssues() {
  return useQuery({
    queryKey: ["assets-with-pending-issues"],
    queryFn: () => invoke<number[]>("get_assets_with_pending_issues"),
  });
}