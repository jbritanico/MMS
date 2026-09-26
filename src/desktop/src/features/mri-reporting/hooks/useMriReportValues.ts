import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "../../../lib/ipc";

export interface MriReportHeaderValue {
  id: number;
  report_id: number;
  template_header_field_id: number;
  value: string | null;
}

export interface MriReportChecklistResult {
  id: number;
  report_id: number;
  template_checklist_item_id: number;
  status: "Pass" | "Fail" | null;
  severity: "Minor" | "Moderate" | "Critical" | null;
  issue_details: string | null;
  action_taken: string | null;
  date_observed: string | null;
  closure_status: "Pending" | "Closed";
  // Who first flagged this item as Fail, and when -- stamped once by the backend (never
  // overwritten by a later edit). reported_at is server-generated; reported_by is sent by
  // the client as the current user's name but only actually stored on a Fail save where
  // it isn't already set. See set_mri_report_checklist_result in lib.rs.
  reported_by: string | null;
  reported_at: string | null;
}

export interface MriReportMidValue {
  id: number;
  report_id: number;
  template_mid_field_id: number;
  value: string | null;
  route_points: string | null;
}

export interface MriReportFooterValue {
  id: number;
  report_id: number;
  template_footer_field_id: number;
  value: string | null;
}

export interface MriReportAttachment {
  id: number;
  report_id: number;
  template_checklist_item_id: number;
  file_name: string;
  file_type: string;
  data: string;
  uploaded_date: string;
}

// Header
export function useMriReportHeaderValues(reportId: number) {
  return useQuery({
    queryKey: ["mri-report-header-values", reportId],
    queryFn: () => invoke<MriReportHeaderValue[]>("get_mri_report_header_values", { reportId }),
  });
}
export function useSetMriReportHeaderValue(reportId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (item: { templateHeaderFieldId: number; value: string }) =>
      invoke("set_mri_report_header_value", { reportId, ...item }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mri-report-header-values", reportId] }),
  });
}

// Checklist
export function useMriReportChecklistResults(reportId: number) {
  return useQuery({
    queryKey: ["mri-report-checklist-results", reportId],
    queryFn: () => invoke<MriReportChecklistResult[]>("get_mri_report_checklist_results", { reportId }),
  });
}
export function useSetMriReportChecklistResult(reportId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (result: MriReportChecklistResult) =>
      invoke("set_mri_report_checklist_result", { result }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mri-report-checklist-results", reportId] }),
  });
}

// Every past Fail entry for the same checklist item (same checklist_databank id, via
// template_checklist_items.checklist_item_id) across every earlier MR-I report on the same
// asset -- excluding the report currently being viewed/reviewed. Used to render the
// "recurring finding" history thread on page 2 of the report PDF.
export interface MriChecklistHistoryEntry {
  report_id: number;
  checklist_item_id: number;
  report_date: string;
  issue_details: string | null;
  action_taken: string | null;
  severity: "Minor" | "Moderate" | "Critical" | null;
  closure_status: "Pending" | "Closed";
  reported_by: string | null;
  reported_at: string | null;
}
export function useMriChecklistHistory(assetId: number, excludeReportId: number) {
  return useQuery({
    queryKey: ["mri-checklist-history", assetId, excludeReportId],
    queryFn: () => invoke<MriChecklistHistoryEntry[]>("get_mri_checklist_history", { assetId, excludeReportId }),
    enabled: !!assetId,
  });
}

// Append-only follow-up actions on a checklist item -- layered on top of (and never
// overwriting) the original issue_details/action_taken/reported_by/reported_at above.
// Each entry is permanent once added: who wrote it and exactly when. See
// mri_checklist_action_log in lib.rs.
export interface MriChecklistActionEntry {
  id: number;
  report_id: number;
  checklist_item_id: number;
  report_date: string;
  action_text: string;
  recorded_by: string | null;
  recorded_at: string;
}

// Every action-log entry recorded so far on this whole report, across every checklist
// item -- fetched once per report and grouped by checklist_item_id on the frontend
// (same pattern as useMriChecklistHistory), not once per item.
export function useMriChecklistActions(reportId: number) {
  return useQuery({
    queryKey: ["mri-checklist-actions", reportId],
    queryFn: () => invoke<MriChecklistActionEntry[]>("get_mri_checklist_actions", { reportId }),
    enabled: !!reportId,
  });
}

export function useAddMriChecklistAction(reportId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (item: { templateChecklistItemId: number; actionText: string; recordedBy: string | null }) =>
      invoke<number>("add_mri_checklist_action", {
        reportId,
        templateChecklistItemId: item.templateChecklistItemId,
        actionText: item.actionText,
        recordedBy: item.recordedBy,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mri-checklist-actions", reportId] }),
  });
}

// Every action-log entry across every prior report on the asset, for the PDF's
// recurring-finding thread.
export function useMriChecklistActionHistory(assetId: number, excludeReportId: number) {
  return useQuery({
    queryKey: ["mri-checklist-action-history", assetId, excludeReportId],
    queryFn: () =>
      invoke<MriChecklistActionEntry[]>("get_mri_checklist_action_history", {
        assetId,
        excludeReportId,
      }),
    enabled: !!assetId,
  });
}

// Mid
export function useMriReportMidValues(reportId: number) {
  return useQuery({
    queryKey: ["mri-report-mid-values", reportId],
    queryFn: () => invoke<MriReportMidValue[]>("get_mri_report_mid_values", { reportId }),
  });
}

export function useSetMriReportMidValue(reportId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (item: { templateMidFieldId: number; value: string; routePoints?: string | null }) =>
      invoke("set_mri_report_mid_value", {
        reportId,
        templateMidFieldId: item.templateMidFieldId,
        value: item.value,
        routePoints: item.routePoints ?? null,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mri-report-mid-values", reportId] }),
  });
}

// Footer
export function useMriReportFooterValues(reportId: number) {
  return useQuery({
    queryKey: ["mri-report-footer-values", reportId],
    queryFn: () => invoke<MriReportFooterValue[]>("get_mri_report_footer_values", { reportId }),
  });
}

export function useSetMriReportFooterValue(reportId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (item: { templateFooterFieldId: number; value: string }) =>
      invoke("set_mri_report_footer_value", { reportId, ...item }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mri-report-footer-values", reportId] }),
  });
}

// Attachments (photos/files) — one report can have several per checklist item
export function useMriReportAttachments(reportId: number) {
  return useQuery({
    queryKey: ["mri-report-attachments", reportId],
    queryFn: () => invoke<MriReportAttachment[]>("get_mri_report_attachments", { reportId }),
  });
}
export function useAddMriReportAttachment(reportId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (item: { templateChecklistItemId: number; fileName: string; fileType: string; data: string }) =>
      invoke<number>("add_mri_report_attachment", { reportId, ...item }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mri-report-attachments", reportId] }),
  });
}
export function useDeleteMriReportAttachment(reportId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => invoke<string>("delete_mri_report_attachment", { id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mri-report-attachments", reportId] }),
  });
}