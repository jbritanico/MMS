import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "../../../lib/ipc";

export interface ChecklistSection {
    id: number;
    name: string;
}

const KEY = ["checklist-sections"];

export function useChecklistSections() {
    return useQuery({
        queryKey: KEY,
        queryFn: () => invoke<ChecklistSection[]>("get_checklist_sections"),
    });
}

export function useCreateChecklistSection() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (name: string) => invoke("create_checklist_section", { name }),
        onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
    });
}

export function useUpdateChecklistSection() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (section: ChecklistSection) => invoke("update_checklist_section", section),
        onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
    });
}

export function useDeleteChecklistSection() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => invoke("delete_checklist_section", { id }),
        onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
    });
}