import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "../../../lib/ipc";

export interface TemplateHeaderField {
  id: number;
  template_id: number;
  header_field_id: number;
  label_override: string | null;
  data_type: string;
  required: boolean;
  display_order: number;
  default_value: string | null;
}

export interface FieldCatalogItem {
  id: number;
  label: string;
}

export function useHeaderFieldCatalog() {
  return useQuery({
    queryKey: ["header-field-catalog"],
    queryFn: () => invoke<FieldCatalogItem[]>("get_header_fields"),
  });
}

export function useTemplateHeaderFields(templateId: number) {
  return useQuery({
    queryKey: ["template-header-fields", templateId],
    queryFn: () => invoke<TemplateHeaderField[]>("get_template_header_fields", { templateId }),
  });
}

export function useAddTemplateHeaderField(templateId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (item: { headerFieldId: number; displayOrder: number }) =>
      invoke("add_template_header_field", { templateId, ...item }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["template-header-fields", templateId] }),
  });
}

export function useRemoveTemplateHeaderField(templateId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => invoke("remove_template_header_field", { id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["template-header-fields", templateId] }),
  });
}

export function useUpdateTemplateHeaderField(templateId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (field: TemplateHeaderField) => invoke("update_template_header_field", { field }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["template-header-fields", templateId] }),
  });
}