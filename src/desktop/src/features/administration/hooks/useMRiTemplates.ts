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
        mutationFn: (item: { id: number; template_name: string }) =>
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