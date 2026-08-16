import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "../../../lib/ipc";

export interface TemplateFooterField {
  id: number;
  template_id: number;
  footer_field_id: number;
  display_order: number;
}

export interface FieldCatalogItem {
  id: number;
  label: string;
}

export function useFooterFieldCatalog() {
  return useQuery({
    queryKey: ["footer-field-catalog"],
    queryFn: () => invoke<FieldCatalogItem[]>("get_footer_fields"),
  });
}

export function useTemplateFooterFields(templateId: number) {
  return useQuery({
    queryKey: ["template-footer-fields", templateId],
    queryFn: () => invoke<TemplateFooterField[]>("get_template_footer_fields", { templateId }),
  });
}

export function useAddTemplateFooterField(templateId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (item: { footerFieldId: number; displayOrder: number }) =>
      invoke("add_template_footer_field", { templateId, ...item }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["template-footer-fields", templateId] }),
  });
}

export function useRemoveTemplateFooterField(templateId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => invoke("remove_template_footer_field", { id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["template-footer-fields", templateId] }),
  });
}