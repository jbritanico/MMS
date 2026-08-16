import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "../../../lib/ipc";

export type ReportStatus = "Draft" | "Submitted" | "Approved" | "Rejected";

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
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
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