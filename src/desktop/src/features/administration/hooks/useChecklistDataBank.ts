import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "../../../lib/ipc";

export interface ChecklistItem {
    id: number;
    label: string;
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
        mutationFn: (item: { code: string; description: string }) => invoke("create_checklist_item", { item }),
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