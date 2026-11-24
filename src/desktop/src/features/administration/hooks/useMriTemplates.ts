import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "../../../lib/ipc";

export type TemplateStatus = "Draft" | "Active" | "Inactive";

export interface MriTemplate {
    id: number;
    template_name: string;
    asset_type_id: number;
    status: TemplateStatus;
    created_by: string;
    created_date: string;
    updated_by: string;
    updated_date: string;
    /** TPL-2: Draft -> Submitted (FSM) -> Endorsed (Regional) -> Approved. */
    approval: "Draft" | "Submitted" | "Endorsed" | "Approved";
    version: number;
    revision_of: number | null;
    superseded_by: number | null;
}

const KEY = ["mri-templates"];

export function useMriTemplates() {
    return useQuery({
        queryKey: KEY,
        queryFn: () => invoke<MriTemplate[]>("get_mri_templates"),
    });
}

export function useCreateMriTemplate() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (template: { template_name: string; asset_type_id: number }) =>
            invoke<number>("create_mri_template", { template }),
        onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
    });
}

export function useUpdateTemplateStatus() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (item: { id: number; status: TemplateStatus }) =>
            invoke("update_mri_template_status", item),
        onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
    });
}

export function useRenameMriTemplate() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (item: { id: number; templateName: string }) =>
            invoke("rename_mri_template", item),
        onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
    });
}

export function useDeleteMriTemplate() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => invoke("delete_mri_template", { id }),
        onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
    });
}  

export function useExportMriTemplatesBackup() {
  return async () => {
    const json = await invoke<string>("export_mri_templates_backup");
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mri-templates-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
}

export function useImportMriTemplatesBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (backupJson: string) => invoke<string>("import_mri_templates_backup", { backupJson }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mri-templates"] }),
  });
}

// ---------------------------------------------------------------- TPL-2: template approval
export interface TemplateApprovalEntry {
    id: number;
    template_id: number;
    action: string;
    by_name: string | null;
    at: string;
    note: string | null;
}

export interface TemplateTask {
    template_id: number;
    template_name: string;
    version: number;
    kind: "endorse" | "approve" | "sent_back";
    last_by: string | null;
    last_at: string | null;
    last_note: string | null;
}

export function useTemplateApprovalLog(templateId: number) {
    return useQuery({
        queryKey: ["mri-template-approval-log", templateId],
        queryFn: () => invoke<TemplateApprovalEntry[]>("get_mri_template_approval_log", { templateId }),
        enabled: templateId > 0,
    });
}

export function useMyTemplateTasks(userId: number) {
    return useQuery({
        queryKey: ["my-template-tasks", userId],
        queryFn: () => invoke<TemplateTask[]>("get_my_template_tasks", { userId }),
        enabled: userId > 0,
    });
}

const ACTION_CMD = { submit: "submit_mri_template", endorse: "endorse_mri_template", reject: "reject_mri_template", approve: "approve_mri_template" } as const;

export function useTemplateApprovalAction() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (a: { action: keyof typeof ACTION_CMD; templateId: number; userId: number; note: string }) =>
            invoke<string>(ACTION_CMD[a.action], { templateId: a.templateId, userId: a.userId, note: a.note }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: KEY });
            qc.invalidateQueries({ queryKey: ["my-template-tasks"] });
            qc.invalidateQueries({ queryKey: ["mri-template-approval-log"] });
            qc.invalidateQueries({ queryKey: ["template-components"] });
        },
    });
}

export function useStartTemplateRevision() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (a: { templateId: number; userId: number }) => invoke<number>("create_mri_template_revision", a),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: KEY });
            qc.invalidateQueries({ queryKey: ["mri-template-approval-log"] });
        },
    });
}
