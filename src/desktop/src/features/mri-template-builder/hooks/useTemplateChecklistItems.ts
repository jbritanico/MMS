import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "../../../lib/ipc";

export type Severity = "Minor" | "Moderate" | "Major" | "Critical";

export interface TemplateChecklistItem {
  id: number;
  template_id: number;
  checklist_item_id: number;
  section_id: number | null;
  severity: Severity | null;
  display_order: number;
  required: boolean;
}
export function useTemplateChecklistItems(templateId: number) {
  return useQuery({
    queryKey: ["template-checklist-items", templateId],
    queryFn: () => invoke<TemplateChecklistItem[]>("get_template_checklist_items", { templateId }),
  });
}

export function useAddTemplateChecklistItem(templateId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (item: { checklistItemId: number; displayOrder: number }) =>
      invoke("add_template_checklist_item", { templateId, ...item }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["template-checklist-items", templateId] }),
  });
}

export function useRemoveTemplateChecklistItem(templateId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => invoke("remove_template_checklist_item", { id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["template-checklist-items", templateId] }),
  });
}

export function useUpdateTemplateChecklistItem(templateId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (item: TemplateChecklistItem) => invoke("update_template_checklist_item", { item }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["template-checklist-items", templateId] }),
  });
}