import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "../../../lib/ipc";

export type MrLevel = "MR-I" | "MR-II" | "MR-III";

export interface ChecklistItem {
    id: number;
    code: string;
    description: string;
    level: MrLevel;
}

export interface NewChecklistItem {
    code: string;
    description: string;
    level: MrLevel;
}

const KEY = ["checklist-databank"];

export function useChecklistItems() {
    return useQuery({
        queryKey: KEY,
        queryFn: () => invoke<ChecklistItem[]>("get_checklist_items"),
    });
}

export function useCreateChecklistItem() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (item: NewChecklistItem) => invoke("create_checklist_item", { item }),
        onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
    });
}

export function useUpdateChecklistItem() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (item: ChecklistItem) => invoke("update_checklist_item", { item }),
        onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
    });
}

export function useDeleteChecklistItem() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => invoke("delete_checklist_item", { id }),
        onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
    });
}

export function useBulkCreateChecklistItems() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (items: NewChecklistItem[]) =>
            invoke<string>("bulk_create_checklist_items", { items }),
        onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
    });
}
