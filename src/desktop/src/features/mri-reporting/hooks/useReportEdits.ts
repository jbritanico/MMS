import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "../../../lib/ipc";

// FB-006 (RFSM approved): changes made to an MR-I report after it was submitted, kept for
// the audit trail, and the notices shown to the operator who submitted it.

export interface MriReportEdit {
  id: number;
  report_id: number;
  /** Header, Checklist, Distance or Sign-off */
  part: string;
  item_label: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
  changed_by: string | null;
  /** Unix seconds, as text */
  changed_at: string;
  seen_by_submitter_at: string | null;
}

export interface MriReportChangeNotice {
  report_id: number;
  asset_code: string | null;
  changes: number;
  last_changed_by: string | null;
  last_changed_at: string;
}

export function useReportEditLog(reportId: number) {
  return useQuery({
    queryKey: ["mri-report-edit-log", reportId],
    queryFn: () => invoke<MriReportEdit[]>("get_mri_report_edit_log", { reportId }),
    enabled: reportId > 0,
  });
}

/** Reports the signed-in user submitted that someone else changed since, not yet seen. */
export function useMyReportChangeNotices(userName: string | null | undefined) {
  return useQuery({
    queryKey: ["my-report-change-notices", userName ?? ""],
    queryFn: () => invoke<MriReportChangeNotice[]>("get_my_report_change_notices", { userName }),
    enabled: !!userName,
  });
}

export function useMarkReportChangesSeen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { reportId: number; userName: string }) => invoke<string>("mark_report_changes_seen", v),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["mri-report-edit-log", v.reportId] });
      qc.invalidateQueries({ queryKey: ["my-report-change-notices"] });
    },
  });
}

/** Equipment status on a report: the tag at closure for a closed report, the tag now otherwise. */
export interface MriReportTag {
  tag_status: string | null;
  reason: string | null;
  /** Unix seconds, as text; null = the tag now */
  as_of: string | null;
  closed: boolean;
  current_tag: string | null;
}

export function useReportTag(reportId: number) {
  return useQuery({
    queryKey: ["mri-report-tag", reportId],
    queryFn: () => invoke<MriReportTag>("get_mri_report_tag", { reportId }),
    enabled: reportId > 0,
  });
}
