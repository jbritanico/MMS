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
  issue_details: string | null;
  action_taken: string | null;
  date_observed: string | null;
  closure_status: "Pending" | "Closed";
}

export interface MriReportMidValue {
  id: number;
  report_id: number;
  template_mid_field_id: number;
  value: string | null;
}

export interface MriReportFooterValue {
  id: number;
  report_id: number;
  template_footer_field_id: number;
  value: string | null;
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
    mutationFn: (item: { templateMidFieldId: number; value: string }) =>
      invoke("set_mri_report_mid_value", { reportId, ...item }),
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