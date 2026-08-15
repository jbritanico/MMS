import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "../../../lib/ipc";

export interface TemplateMidField {
  id: number;
  template_id: number;
  mid_field_id: number;
  display_order: number;
}

export interface FieldCatalogItem {
  id: number;
  label: string;
}

export function useMidFieldCatalog() {
  return useQuery({
    queryKey: ["mid-field-catalog"],
    queryFn: () => invoke<FieldCatalogItem[]>("get_mid_fields"),
  });
}

export function useTemplateMidFields(templateId: number) {
  return useQuery({
    queryKey: ["template-mid-fields", templateId],
    queryFn: () => invoke<TemplateMidField[]>("get_template_mid_fields", { templateId }),
  });
}

export function useAddTemplateMidField(templateId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (item: { midFieldId: number; displayOrder: number }) =>
      invoke("add_template_mid_field", { templateId, ...item }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["template-mid-fields", templateId] }),
  });
}

export function useRemoveTemplateMidField(templateId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => invoke("remove_template_mid_field", { id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["template-mid-fields", templateId] }),
  });
}