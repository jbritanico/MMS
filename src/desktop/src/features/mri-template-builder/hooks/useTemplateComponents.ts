import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "../../../lib/ipc";

// A positional component an MR-I template defines (e.g. Left / Right pump). Every asset using
// the template keeps one Asset Code; each report is raised for one of these components.
export interface TemplateComponent {
  id: number;
  template_id: number;
  label: string;
  display_order: number;
  active: boolean;
}

export function useTemplateComponents(templateId: number | null) {
  return useQuery({
    queryKey: ["template-components", templateId],
    queryFn: () => invoke<TemplateComponent[]>("get_template_components", { templateId }),
    enabled: templateId !== null,
  });
}

// Every component of every template, for list screens (Select asset).
export function useAllTemplateComponents() {
  return useQuery({
    queryKey: ["template-components", "all"],
    queryFn: () => invoke<TemplateComponent[]>("get_all_template_components"),
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["template-components"] });
    qc.invalidateQueries({ queryKey: ["mri-reports"] });
  };
}

export function useCreateTemplateComponent() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (vars: { templateId: number; label: string; createdBy: string }) =>
      invoke<string>("create_template_component", vars),
    onSuccess: invalidate,
  });
}

export function useRenameTemplateComponent() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (vars: { id: number; label: string }) => invoke<string>("rename_template_component", vars),
    onSuccess: invalidate,
  });
}

export function useSetTemplateComponentActive() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (vars: { id: number; active: boolean }) => invoke<string>("set_template_component_active", vars),
    onSuccess: invalidate,
  });
}

export function useDeleteTemplateComponent() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: number) => invoke<string>("delete_template_component", { id }),
    onSuccess: invalidate,
  });
}
